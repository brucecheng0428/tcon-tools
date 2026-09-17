/* ===========================================================================
 * DG I2C 本機橋接 helper（原生 Win32、32 位元）
 * ---------------------------------------------------------------------------
 * 形狀：網頁 ──WebSocket(127.0.0.1)──> 本程式 ──libMPSSE(D2XX)──> 治具 ──I2C──> TCON
 *
 * 為什麼是原生 C、不是 C#（見 README 與本輪回報）：
 *   - 交付環境無 Visual Studio / mono / dotnet，C# net472 在此無法編譯；
 *     原生 C 用 zig cc 可交叉編出 32 位元 PE（machine 0x014c），且完全
 *     不依賴 .NET Framework —— 比「framework-dependent」更輕、更少前提。
 *   - 硬條件不變：**必須 32 位元行程**，否則載不動 x86 的 libMPSSE.dll。
 *
 * I2C 呼叫序列逐行照抄 PQ Tool 反組譯（規範來源＝PQ Tool）：
 *   xCtrl_FTDI_I2C.cs（Open/InitChannel 參數）＋ xCtrl_I2C_App.cs（Read_Reg/Write_Reg options）
 *     - InitChannel: ClockRate=150000, LatencyTimer=1, Options=3
 *     - 讀：寫 2-byte 位址 options=0x19（START|NACK_LAST|FAST_BYTES，無 STOP＝repeated start）
 *           再讀      options=0x0B（START|STOP|NACK_LAST）
 *     - 寫：位址+資料串成一個 buffer，options=0x17（START|STOP|BREAK_ON_NACK|FAST_BYTES）
 *
 * 硬防線（helper 端獨立再擋一次，不只靠網頁）：
 *   - 只 bind 127.0.0.1（不經網路介面）
 *   - WebSocket 升級時檢查 Origin，只收白名單來源
 *   - I2C 寫入位址白名單：只准寫 0x1200–0x12FF（ptg bank）
 *   - 只 slave 掃 0x60/0x61/0x68/0x69（照 PQ Tool 自動偵測順序）
 *
 * 🔴 未經實機驗證：本檔在無 Windows、無 FTDI 硬體的環境撰寫，D2XX 連線與
 *    I2C 通訊全部無法自驗。只驗到「能編出正確的 PE、能載入 winsock、
 *    能對 libMPSSE.dll 做 GetProcAddress」這一層。
 * =========================================================================== */

#define WIN32_LEAN_AND_MEAN
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <stdio.h>
#include <stdint.h>
#include <string.h>
#include <stdlib.h>

#include "dg_helper_version.h"
#include "dg_helper_proto.h"   /* SHA1／Base64／JSON／白名單／Origin —— 與 test_proto.c 共用同一份 */

/* ---- I2C 傳輸 options（照抄 ftdi_i2c.h / PQ Tool 用到的組合） ---- */
#define I2C_START_BIT          0x01
#define I2C_STOP_BIT           0x02
#define I2C_BREAK_ON_NACK      0x04
#define I2C_NACK_LAST_BYTE     0x08
#define I2C_FAST_TRANSFER_BYTES 0x10

/* 讀：第一段寫位址 = 9 | 0x10（addr 是 2-byte）= 0x19；第二段收資料 = 0x0B */
#define OPT_READ_ADDR   (0x09u | I2C_FAST_TRANSFER_BYTES)   /* 0x19 */
#define OPT_READ_DATA   0x0Bu
/* 寫：位址+資料 = 7 | 0x10 = 0x17（長度一定 > 1） */
#define OPT_WRITE       (0x07u | I2C_FAST_TRANSFER_BYTES)   /* 0x17 */

/* ---- 位址白名單（helper 端硬防線） ---- */
#define WR_ADDR_MIN 0x1200u
#define WR_ADDR_MAX 0x12FFu

/* ---- libMPSSE ChannelConfig（Pack=1，對齊 C# 的 [StructLayout(Pack=1)]） ---- */
#pragma pack(push, 1)
typedef struct {
    uint32_t ClockRate;
    uint8_t  LatencyTimer;
    uint32_t Options;
} ChannelConfig;
#pragma pack(pop)

typedef void* FT_HANDLE;
typedef uint32_t FT_STATUS;
#define FT_OK 0

/* libMPSSE 匯出（cdecl，名稱未修飾，見 export table 實查） */
typedef void      (*PFN_Init)(void);
typedef void      (*PFN_Cleanup)(void);
typedef FT_STATUS (*PFN_GetNum)(uint32_t*);
typedef FT_STATUS (*PFN_Open)(uint32_t, FT_HANDLE*);
typedef FT_STATUS (*PFN_Close)(FT_HANDLE);
typedef FT_STATUS (*PFN_Init2)(FT_HANDLE, ChannelConfig*);
typedef FT_STATUS (*PFN_Write)(FT_HANDLE, uint32_t, uint32_t, uint8_t*, uint32_t*, uint32_t);
typedef FT_STATUS (*PFN_Read)(FT_HANDLE, uint32_t, uint32_t, uint8_t*, uint32_t*, uint32_t);

static PFN_Init    p_Init;
static PFN_Cleanup p_Cleanup;
static PFN_GetNum  p_GetNum;
static PFN_Open    p_Open;
static PFN_Close   p_Close;
static PFN_Init2   p_Init2;
static PFN_Write   p_Write;
static PFN_Read    p_Read;

static FT_HANDLE g_handle = NULL;
static int       g_opened = 0;
static uint32_t  g_numChannels = 0;

/* SHA1／Base64／JSON 擷取／白名單／Origin 全部搬到 dg_helper_proto.h（可攜、可單元測試）。
 * 本檔用 dgh_* 前綴的那些函式。 */

/* ===========================================================================
 * DLL 尋找與載入
 * =========================================================================== */
static char g_dllDir[MAX_PATH]="";

static int try_load_from(const char* dir){
    char path[MAX_PATH];
    if(dir&&dir[0]){
        snprintf(path,sizeof(path),"%s\\libMPSSE.dll",dir);
        SetDllDirectoryA(dir);           /* 讓 ftd2xx.dll 之類的相依檔也從這裡找 */
    } else {
        snprintf(path,sizeof(path),"libMPSSE.dll");
    }
    HMODULE h=LoadLibraryA(path);
    if(!h) return 0;
    p_Init   =(PFN_Init)    GetProcAddress(h,"Init_libMPSSE");
    p_Cleanup=(PFN_Cleanup) GetProcAddress(h,"Cleanup_libMPSSE");
    p_GetNum =(PFN_GetNum)  GetProcAddress(h,"I2C_GetNumChannels");
    p_Open   =(PFN_Open)    GetProcAddress(h,"I2C_OpenChannel");
    p_Close  =(PFN_Close)   GetProcAddress(h,"I2C_CloseChannel");
    p_Init2  =(PFN_Init2)   GetProcAddress(h,"I2C_InitChannel");
    p_Write  =(PFN_Write)   GetProcAddress(h,"I2C_DeviceWrite");
    p_Read   =(PFN_Read)    GetProcAddress(h,"I2C_DeviceRead");
    if(!p_GetNum||!p_Open||!p_Close||!p_Init2||!p_Write||!p_Read){
        return 0;
    }
    if(dir) { strncpy(g_dllDir,dir,sizeof(g_dllDir)-1); }
    return 1;
}

/* 讀 exe 旁的 dg-helper.ini（單行＝libMPSSE 資料夾路徑） */
static void ini_path(char* out, int cap){
    char exe[MAX_PATH]; GetModuleFileNameA(NULL,exe,sizeof(exe));
    char* slash=strrchr(exe,'\\'); if(slash) *(slash+1)=0; else exe[0]=0;
    snprintf(out,cap,"%sdg-helper.ini",exe);
}
static int read_ini_dir(char* out, int cap){
    char ip[MAX_PATH]; ini_path(ip,sizeof(ip));
    FILE* f=fopen(ip,"rb"); if(!f) return 0;
    if(!fgets(out,cap,f)){ fclose(f); return 0; } fclose(f);
    int n=(int)strlen(out); while(n>0&&(out[n-1]=='\n'||out[n-1]=='\r'||out[n-1]==' ')) out[--n]=0;
    return out[0]?1:0;
}
static void write_ini_dir(const char* dir){
    char ip[MAX_PATH]; ini_path(ip,sizeof(ip));
    FILE* f=fopen(ip,"wb"); if(!f) return; fputs(dir,f); fclose(f);
}

static int locate_and_load_dll(void){
    char dir[MAX_PATH];
    /* 1. exe 同目錄（DLL 就放旁邊時） */
    if(try_load_from(NULL)) { printf("[helper] libMPSSE 從系統搜尋路徑載入成功\n"); return 1; }
    /* 2. ini 記住的路徑 */
    if(read_ini_dir(dir,sizeof(dir)) && try_load_from(dir)){
        printf("[helper] libMPSSE 從 dg-helper.ini 記住的路徑載入：%s\n",dir); return 1;
    }
    /* 3. 常見 PQ Tool 相對路徑候選 */
    const char* cand[]={
        ".\\Release V1.5.0", "..\\Release V1.5.0",
        "C:\\Raydium\\PQ\\Release V1.5.0", NULL
    };
    for(int i=0;cand[i];i++){ if(try_load_from(cand[i])){ printf("[helper] libMPSSE 從候選路徑載入：%s\n",cand[i]); write_ini_dir(cand[i]); return 1; } }
    /* 4. 找不到 —— 問一次（console 讀一行路徑） */
    printf("\n[helper] 找不到 libMPSSE.dll。\n");
    printf("        請把 PQ Tool 的 Release 資料夾路徑貼進來（裡面要有 libMPSSE.dll），按 Enter：\n> ");
    fflush(stdout);
    if(fgets(dir,sizeof(dir),stdin)){
        int n=(int)strlen(dir); while(n>0&&(dir[n-1]=='\n'||dir[n-1]=='\r'||dir[n-1]==' ')) dir[--n]=0;
        if(dir[0]&&try_load_from(dir)){ write_ini_dir(dir); printf("[helper] 載入成功，已記住此路徑\n"); return 1; }
    }
    printf("[helper] 仍然載不到 libMPSSE.dll，請確認路徑後重新啟動\n");
    return 0;
}

/* ===========================================================================
 * I2C 動作（照抄 PQ Tool 序列）
 * =========================================================================== */
static int i2c_open(uint32_t clockHz){
    if(g_opened) return 1;
    if(p_Init) p_Init();
    if(p_GetNum(&g_numChannels)!=FT_OK || g_numChannels==0) return 0;
    if(p_Open(0, &g_handle)!=FT_OK) return 0;     /* 固定 channel 0（Interface 0＝Channel A） */
    ChannelConfig cfg; cfg.ClockRate=clockHz?clockHz:150000; cfg.LatencyTimer=1; cfg.Options=3;
    if(p_Init2(g_handle,&cfg)!=FT_OK){ p_Close(g_handle); g_handle=NULL; return 0; }
    g_opened=1; return 1;
}
static void i2c_close(void){
    if(g_opened&&g_handle){ p_Close(g_handle); }
    g_handle=NULL; g_opened=0;
}
/* 讀：slave 7-bit、addr 2-byte、len bytes。回傳 FT_STATUS，資料寫進 out */
static FT_STATUS i2c_read(uint32_t slave, uint32_t addr, uint32_t len, uint8_t* out, uint32_t* got){
    uint8_t ab[2]; ab[0]=(uint8_t)((addr>>8)&0xFF); ab[1]=(uint8_t)(addr&0xFF);
    uint32_t tr=0;
    FT_STATUS s1=p_Write(g_handle, slave, 2, ab, &tr, OPT_READ_ADDR);   /* repeated start，無 STOP */
    FT_STATUS s2=p_Read (g_handle, slave, len, out, got, OPT_READ_DATA);
    (void)s1; return s2;
}
/* 寫：位址+資料串成一 buffer，options=0x17 */
static FT_STATUS i2c_write(uint32_t slave, uint32_t addr, const uint8_t* data, int dlen, uint32_t* got){
    uint8_t buf[64]; if(dlen<0||dlen>60) return 0xFFFFFFFF;
    buf[0]=(uint8_t)((addr>>8)&0xFF); buf[1]=(uint8_t)(addr&0xFF);
    memcpy(buf+2,data,dlen);
    uint32_t tr=0;
    FT_STATUS s=p_Write(g_handle, slave, (uint32_t)(dlen+2), buf, &tr, OPT_WRITE);
    if(got)*got=tr; return s;
}

/* ===========================================================================
 * WebSocket 伺服（單一 client）
 * =========================================================================== */
static int send_all(SOCKET c, const char* p, int n){
    int sent=0; while(sent<n){ int r=send(c,p+sent,n-sent,0); if(r<=0) return 0; sent+=r; } return 1;
}
/* 送一個 text frame（unmasked，len < 65536） */
static int ws_send_text(SOCKET c, const char* msg){
    int n=(int)strlen(msg); uint8_t hdr[4]; int hl;
    hdr[0]=0x81;
    if(n<126){ hdr[1]=(uint8_t)n; hl=2; }
    else { hdr[1]=126; hdr[2]=(uint8_t)(n>>8); hdr[3]=(uint8_t)(n&0xFF); hl=4; }
    if(!send_all(c,(char*)hdr,hl)) return 0;
    return send_all(c,msg,n);
}
/* 收一個 frame 到 out（回傳 payload 長度，-1＝關閉/錯誤）。只處理 text/close/ping。 */
static int recv_exact(SOCKET c, uint8_t* p, int n){
    int got=0; while(got<n){ int r=recv(c,(char*)p+got,n-got,0); if(r<=0) return 0; got+=r; } return 1;
}
static int ws_recv_text(SOCKET c, char* out, int cap){
    uint8_t h2[2];
    if(!recv_exact(c,h2,2)) return -1;
    int opcode=h2[0]&0x0F; int masked=h2[1]&0x80; uint64_t len=h2[1]&0x7F;
    if(len==126){ uint8_t e[2]; if(!recv_exact(c,e,2))return -1; len=(e[0]<<8)|e[1]; }
    else if(len==127){ uint8_t e[8]; if(!recv_exact(c,e,8))return -1; len=0; for(int i=0;i<8;i++) len=(len<<8)|e[i]; }
    uint8_t mask[4]={0,0,0,0}; if(masked){ if(!recv_exact(c,mask,4))return -1; }
    if(opcode==0x8) return -1;   /* close */
    if((int)len>=cap) return -1; /* 超過緩衝 */
    if(len){ if(!recv_exact(c,(uint8_t*)out,(int)len)) return -1;
        if(masked) for(uint64_t i=0;i<len;i++) out[i]^=mask[i&3]; }
    out[len]=0;
    if(opcode==0x9){ /* ping → 回 pong（同 payload） */
        uint8_t ph[2]={0x8A,(uint8_t)len}; send_all(c,(char*)ph,2); if(len) send_all(c,out,(int)len);
        return ws_recv_text(c,out,cap);
    }
    if(opcode!=0x1) { out[0]=0; return 0; }
    return (int)len;
}

/* 處理一則 JSON 命令，回覆結果 */
static void handle_command(SOCKET c, const char* json){
    char type[24]={0}; if(!dgh_json_type(json,type,sizeof(type))) return;
    long id=dgh_json_int(json,"id",0);
    char rep[8192];

    if(strcmp(type,"open")==0){
        uint32_t hz=(uint32_t)dgh_json_int(json,"clockHz",150000);
        int ok=i2c_open(hz);
        snprintf(rep,sizeof(rep),"{\"type\":\"result\",\"id\":%ld,\"cmd\":\"open\",\"ok\":%s,\"channels\":%u}",
                 id, ok?"true":"false", g_numChannels);
        ws_send_text(c,rep); return;
    }
    if(strcmp(type,"close")==0){
        i2c_close();
        snprintf(rep,sizeof(rep),"{\"type\":\"result\",\"id\":%ld,\"cmd\":\"close\",\"ok\":true}",id);
        ws_send_text(c,rep); return;
    }
    if(strcmp(type,"read")==0){
        uint32_t slave=(uint32_t)dgh_json_int(json,"slave",0x60);
        uint32_t addr =(uint32_t)dgh_json_int(json,"addr",0);
        uint32_t len  =(uint32_t)dgh_json_int(json,"len",1);
        if(!g_opened){ snprintf(rep,sizeof(rep),"{\"type\":\"result\",\"id\":%ld,\"cmd\":\"read\",\"ok\":false,\"err\":\"not open\"}",id); ws_send_text(c,rep); return; }
        /* rep 是 8192；每 byte 最多 "255," ＝ 4 char，故上限 1024 才不會溢位。
         * 目前 dg-measure 只讀 1–3 byte；3D LUT（3456 byte）之類的大讀取
         * 未來要走分段，不在本版範圍。 */
        if(len>1024) len=1024;
        uint8_t buf[1024]; uint32_t got=0;
        FT_STATUS st=i2c_read(slave,addr,len,buf,&got);
        int o=snprintf(rep,sizeof(rep),"{\"type\":\"result\",\"id\":%ld,\"cmd\":\"read\",\"ok\":%s,\"status\":%u,\"data\":[",
                       id,(st==FT_OK)?"true":"false",st);
        for(uint32_t i=0;i<got&&o<(int)sizeof(rep)-16;i++) o+=snprintf(rep+o,sizeof(rep)-o,"%s%u",i?",":"",buf[i]);
        o+=snprintf(rep+o,sizeof(rep)-o,"]}");
        ws_send_text(c,rep); return;
    }
    if(strcmp(type,"write")==0){
        uint32_t slave=(uint32_t)dgh_json_int(json,"slave",0x60);
        uint32_t addr =(uint32_t)dgh_json_int(json,"addr",0);
        uint8_t data[60]; int dn=dgh_json_int_array(json,"data",data,sizeof(data));
        if(dn<0){ snprintf(rep,sizeof(rep),"{\"type\":\"result\",\"id\":%ld,\"cmd\":\"write\",\"ok\":false,\"err\":\"bad data\"}",id); ws_send_text(c,rep); return; }
        /* 🔴 硬防線：位址白名單 0x1200–0x12FF */
        if(addr<WR_ADDR_MIN || (addr+(uint32_t)dn-1)>WR_ADDR_MAX){
            snprintf(rep,sizeof(rep),"{\"type\":\"result\",\"id\":%ld,\"cmd\":\"write\",\"ok\":false,\"err\":\"addr blocked (helper whitelist 0x1200-0x12FF)\"}",id);
            printf("[helper] 位址白名單擋下寫入：0x%04X ×%d\n",addr,dn);
            ws_send_text(c,rep); return;
        }
        if(!g_opened){ snprintf(rep,sizeof(rep),"{\"type\":\"result\",\"id\":%ld,\"cmd\":\"write\",\"ok\":false,\"err\":\"not open\"}",id); ws_send_text(c,rep); return; }
        uint32_t got=0; FT_STATUS st=i2c_write(slave,addr,data,dn,&got);
        snprintf(rep,sizeof(rep),"{\"type\":\"result\",\"id\":%ld,\"cmd\":\"write\",\"ok\":%s,\"status\":%u,\"transferred\":%u}",
                 id,(st==FT_OK)?"true":"false",st,got);
        ws_send_text(c,rep); return;
    }
    if(strcmp(type,"ping")==0){
        snprintf(rep,sizeof(rep),"{\"type\":\"pong\",\"id\":%ld,\"helper\":\"%s\",\"proto\":%d}",id,DG_HELPER_VERSION,DG_HELPER_PROTO);
        ws_send_text(c,rep); return;
    }
}

/* HTTP 升級 + WebSocket 主迴圈（單一 client） */
static void serve_ws(SOCKET c, const char* req){
    /* 找 Sec-WebSocket-Key */
    const char* k=strstr(req,"Sec-WebSocket-Key:"); if(!k) k=strstr(req,"sec-websocket-key:");
    if(!k){ const char* r="HTTP/1.1 400 Bad Request\r\n\r\n"; send_all(c,r,(int)strlen(r)); return; }
    k+=18; while(*k==' ') k++;
    char key[128]; int i=0; while(*k&&*k!='\r'&&*k!='\n'&&i<100) key[i++]=*k++; key[i]=0;
    if(!dgh_origin_allowed(req)){
        const char* r="HTTP/1.1 403 Forbidden\r\n\r\norigin not allowed";
        send_all(c,r,(int)strlen(r)); printf("[helper] 拒絕：Origin 不在白名單\n"); return;
    }
    char acc[64]; dgh_ws_accept(key,acc);
    char resp[256]; snprintf(resp,sizeof(resp),
        "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: %s\r\n\r\n",acc);
    if(!send_all(c,resp,(int)strlen(resp))) return;
    printf("[helper] WebSocket 已連上\n");
    /* 連上就送 hello */
    char hello[128];
    snprintf(hello,sizeof(hello),"{\"type\":\"hello\",\"helper\":\"%s\",\"proto\":%d}",DG_HELPER_VERSION,DG_HELPER_PROTO);
    ws_send_text(c,hello);
    /* 命令迴圈 */
    char msg[8192];
    for(;;){
        int n=ws_recv_text(c,msg,sizeof(msg));
        if(n<0) break;
        if(n>0) handle_command(c,msg);
    }
    printf("[helper] WebSocket 中斷，釋放 I2C\n");
    i2c_close();
}

/* 一般 GET → 回一頁狀態頁（讓人確認 helper 活著） */
static void serve_status(SOCKET c){
    char body[512];
    snprintf(body,sizeof(body),
      "<!doctype html><meta charset=utf-8><title>DG helper</title>"
      "<body style='font-family:sans-serif;background:#0f172a;color:#e2e8f0;padding:2em'>"
      "<h2>DG I2C helper 正在執行</h2><p>版本 %s ｜ 協定 %d</p>"
      "<p>回到 <a style='color:#60a5fa' href='https://brucecheng0428.github.io/tcon-tools/'>線上工具</a> 使用即時量測即可自動連上。</p>"
      "<p style='color:#94a3b8'>只監聽 127.0.0.1，僅接受白名單來源。</p></body>",
      DG_HELPER_VERSION,DG_HELPER_PROTO);
    char resp[1024];
    snprintf(resp,sizeof(resp),
      "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: %d\r\nConnection: close\r\n\r\n%s",
      (int)strlen(body),body);
    send_all(c,resp,(int)strlen(resp));
}

int main(int argc, char** argv){
    int port=8899;
    for(int i=1;i<argc;i++){ if(strncmp(argv[i],"--port=",7)==0) port=atoi(argv[i]+7); }

    printf("==============================================\n");
    printf(" DG I2C 本機橋接 helper  %s (proto %d)\n",DG_HELPER_VERSION,DG_HELPER_PROTO);
    printf(" 只監聽 127.0.0.1:%d ｜ 僅接受白名單來源\n",port);
    printf(" 寫入位址硬白名單：0x1200–0x12FF\n");
    printf("==============================================\n");

    if(!locate_and_load_dll()){ printf("按 Enter 結束…"); getchar(); return 1; }
    printf("[helper] libMPSSE 載入完成，等待網頁連線…（保持本視窗開著）\n");

    WSADATA w; if(WSAStartup(MAKEWORD(2,2),&w)!=0){ printf("WSAStartup 失敗\n"); return 1; }
    SOCKET srv=socket(AF_INET,SOCK_STREAM,0);
    int yes=1; setsockopt(srv,SOL_SOCKET,SO_REUSEADDR,(char*)&yes,sizeof(yes));
    struct sockaddr_in a; memset(&a,0,sizeof(a));
    a.sin_family=AF_INET; a.sin_port=htons((u_short)port);
    a.sin_addr.s_addr=inet_addr("127.0.0.1");     /* 🔴 只 loopback，不 bind 0.0.0.0 */
    if(bind(srv,(struct sockaddr*)&a,sizeof(a))!=0){ printf("bind 127.0.0.1:%d 失敗（是否已被占用？）\n",port); return 1; }
    listen(srv,4);

    for(;;){
        SOCKET c=accept(srv,NULL,NULL);
        if(c==INVALID_SOCKET) continue;
        char req[8192]; int n=recv(c,req,sizeof(req)-1,0);
        if(n<=0){ closesocket(c); continue; }
        req[n]=0;
        if(strstr(req,"Upgrade: websocket")||strstr(req,"upgrade: websocket")){
            serve_ws(c,req);
        } else {
            serve_status(c);
        }
        closesocket(c);
    }
    /* 不會到這 */
    if(p_Cleanup) p_Cleanup();
    closesocket(srv); WSACleanup();
    return 0;
}
