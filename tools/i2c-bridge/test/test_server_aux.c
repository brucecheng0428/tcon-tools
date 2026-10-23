/* ═══════════════════════════════════════════════════════════════════════════
   test_server_aux.c — 1.18.0 DP AUX：把出貨的 i2c_bridge.c 真的跑起來（同 test_server.c 的做法），
   用真 WebSocket 驗「同一支 bridge、同一套轉發」與「AUX 只到得了 T-CON，不能直寫 EEPROM」。
   假 DLL_AUX_VC.dll 在 test/shim.c（一顆假 T-CON：DPCD 視窗、7D/7E、EEPROM 打到就記數）。
   🔴 驗不到：真顯示卡驅動、真 AUX、Intel 系統管理員與 PSR 的真實行為（Windows 實機才有）。
   ═══════════════════════════════════════════════════════════════════════════ */
#include "shim/winsock2.h"
#include "shim/windows.h"
#include <pthread.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <time.h>

int dgh_main(int argc, char** argv);
extern int dgh_fake_open_calls, dgh_fake_close_calls, dgh_fake_live, dgh_fake_writes, dgh_fake_reads;
extern int dgh_serve_files;   /* v1.7.0：靜態檔服務的開關（預設 0） */
extern int dgh_fast_read;     /* v1.8.0：讀取走不走 fast 路徑 */
extern unsigned dgh_fake_last_read_opts, dgh_fake_last_write_opts;
extern unsigned dgh_fake_read_status, dgh_fake_write_status;
extern unsigned char dgh_fake_last_write[64];
extern int dgh_fake_last_write_len;

static int fails=0, total=0;
static void CHECK(int cond, const char* name){
    total++;
    if(!cond){ fails++; printf("   FAIL  %s\n", name); }
}
static void CHECKS(const char* got, const char* want, const char* name){
    total++;
    if(!got || !strstr(got,want)){ fails++; printf("   FAIL  %s\n        want substring: %s\n        got: %.300s\n", name, want, got?got:"(null)"); }
}
/* 數值不符時要印出實際值 —— 只說 FAIL 沒辦法拿去跟 log／量測數字對照。 */
static void EQ_I(long got, long want, const char* name){
    total++;
    if(got!=want){ fails++; printf("   FAIL  %s\n        got=%ld want=%ld\n", name, got, want); }
}
static void G(const char* n){ printf("\n-- %s %s\n", n, "------------------------------------"); }

#define PORT 18897
static void msleep(int ms){ struct timespec t={ms/1000,(long)(ms%1000)*1000000L}; nanosleep(&t,NULL); }

static void* server_thread(void* arg){
    (void)arg;
    char portarg[64]; snprintf(portarg,sizeof(portarg),"--port=%d",PORT);
    char* argv[]={(char*)"i2c-bridge", portarg, NULL};
    dgh_main(2, argv);
    return NULL;
}

/* ── 最小 WebSocket client（只做我們自己 helper 會遇到的情況）───────────── */
static int tcp_connect(void){
    int s=socket(AF_INET,SOCK_STREAM,0);
    struct sockaddr_in a; memset(&a,0,sizeof(a));
    a.sin_family=AF_INET; a.sin_port=htons(PORT); a.sin_addr.s_addr=inet_addr("127.0.0.1");
    if(connect(s,(struct sockaddr*)&a,sizeof(a))!=0){ close(s); return -1; }
    struct timeval tv={3,0}; setsockopt(s,SOL_SOCKET,SO_RCVTIMEO,&tv,sizeof(tv));
    return s;
}
static int send_str(int s, const char* p){ size_t n=strlen(p); return send(s,p,n,0)==(ssize_t)n; }

/* 送一個 masked text frame（瀏覽器一律 mask，helper 也只處理 mask 過的）
   🔴 1.15.0：補上 **127 ＋ 八個 byte 長度**那一條分支。batchwrite 一則就是整段
   payload（8192 byte 的 JSON 陣列約 40 KB，測「太大要被明確拒絕」時更超過
   64 KB），沒有這條分支測試連請求都送不出去。 */
static void ws_send_n(int s, const char* text, size_t n){
    unsigned char h[14]; int hl=0, i;
    h[hl++]=0x81;
    if(n<126) h[hl++]=(unsigned char)(0x80|n);
    else if(n<65536){ h[hl++]=0x80|126; h[hl++]=(unsigned char)(n>>8); h[hl++]=(unsigned char)(n&0xFF); }
    else { h[hl++]=0x80|127; for(i=0;i<8;i++) h[hl++]=(unsigned char)((unsigned long long)n>>(56-i*8)); }
    unsigned char mask[4]={0x11,0x22,0x33,0x44};
    memcpy(h+hl,mask,4); hl+=4;
    send(s,h,(size_t)hl,0);
    {   unsigned char* b=(unsigned char*)malloc(n?n:1);
        size_t k; for(k=0;k<n;k++) b[k]=(unsigned char)(text[k]^mask[k&3]);
        {   size_t sent=0; while(sent<n){ ssize_t w=send(s,b+sent,n-sent,0); if(w<=0) break; sent+=(size_t)w; } }
        free(b); }
}
static void ws_send(int s, const char* text){ ws_send_n(s,text,strlen(text)); }
/* 收一個 text frame（helper 送的不 mask）。回傳 1＝有收到
   🔴 1.15.0：同樣補上 127 那一條 —— 讀取長度上限拿掉之後（1.14.0），
      回覆本來就可能超過 64 KB，而**送端當時沒有這條分支**（那正是 §10 在釘的 bug）。 */
static int ws_recv(int s, char* out, int cap){
    unsigned char h2[2];
    ssize_t r=recv(s,h2,2,MSG_WAITALL); if(r!=2) return 0;
    size_t len=h2[1]&0x7F;
    if(len==126){ unsigned char e[2]; if(recv(s,e,2,MSG_WAITALL)!=2) return 0; len=(size_t)((e[0]<<8)|e[1]); }
    else if(len==127){ unsigned char e[8]; int i; unsigned long long v=0;
        if(recv(s,e,8,MSG_WAITALL)!=8) return 0;
        for(i=0;i<8;i++) v=(v<<8)|e[i]; len=(size_t)v; }
    if((int)len>=cap) return 0;
    if(len && recv(s,out,len,MSG_WAITALL)!=(ssize_t)len) return 0;
    out[len]=0; return 1;
}
/* 建立連線並完成 WS 握手；回傳 socket（-1 失敗）。hello 放進 hello_out。 */
static int ws_open(char* hello_out, int cap){
    int s=tcp_connect(); if(s<0) return -1;
    const char* req=
        "GET /ws HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: http://127.0.0.1:18897\r\n"
        "Upgrade: websocket\r\nConnection: Upgrade\r\n"
        "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n";
    send_str(s,req);
    /* 🔴 握手回應與緊接著的 hello frame 常常黏在同一個 TCP 段裡。用 MSG_PEEK
       先看，**只消耗掉 HTTP header 那幾個 byte**，frame 留在 socket 裡交給
       ws_recv 正常解 —— 自己在緩衝區裡手切 frame 很容易切錯（第一版就切錯了，
       之後每一個回覆都晚一拍，看起來像 helper 回錯東西）。 */
    char buf[4096];
    for(;;){
        ssize_t n=recv(s,buf,sizeof(buf)-1,MSG_PEEK);
        if(n<=0){ close(s); return -1; }
        buf[n]=0;
        char* sep=strstr(buf,"\r\n\r\n");
        if(sep){
            size_t hdr=(size_t)(sep-buf)+4;
            if(!strstr(buf,"101 Switching Protocols")){ close(s); return -1; }
            char drain[4096]; recv(s,drain,hdr,MSG_WAITALL);   /* 只吃掉 header */
            break;
        }
        if(n>=(ssize_t)sizeof(buf)-1){ close(s); return -1; }
    }
    if(!ws_recv(s,hello_out,cap)) hello_out[0]=0;
    return s;
}
/* 送一個命令並收它的回覆 */
static int ws_cmd(int s, const char* json, char* out, int cap){
    ws_send(s,json);
    return ws_recv(s,out,cap);
}
/* 一般 HTTP GET，回整個回應 */
static int http_get(const char* path, char* out, int cap){
    int s=tcp_connect(); if(s<0) return 0;
    char req[512]; snprintf(req,sizeof(req),"GET %s HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n",path);
    send_str(s,req);
    int got=0;
    for(;;){ ssize_t n=recv(s,out+got,(size_t)(cap-1-got),0); if(n<=0) break; got+=(int)n; if(got>=cap-1) break; }
    out[got]=0; close(s);
    return got>0;
}


static void jcmd(int s, const char* j, char* out, int cap){ if(!ws_cmd(s,j,out,cap)) snprintf(out,cap,"(no reply)"); }
int main(void){
    setvbuf(stdout,NULL,_IONBF,0);
    printf("== i2c_bridge.c DP AUX 伺服器測試 ==\n");
    char dir[256], p[512];
    snprintf(dir,sizeof(dir),"/tmp/dgh_aux_%d_%ld/",(int)getpid(),(long)time(NULL));
    if(mkdir(dir,0755)!=0 && access(dir,W_OK)!=0){ printf("   FATAL  無法建立 %s\n",dir); return 2; }
    #define MKFILE(name,body) do{ snprintf(p,sizeof(p),"%s%s",dir,name); FILE* f=fopen(p,"wb"); \
        if(!f){ printf("   FATAL  無法寫入 %s\n",p); return 2; } fputs(body,f); fclose(f); }while(0)
    MKFILE("libMPSSE.dll","fake");
    dgh_shim_set_exe_dir(dir);
    dgh_fake_aux_reset();
    pthread_t th; pthread_create(&th,NULL,server_thread,NULL);
    msleep(400);
    char b[16384], hello[1024];
    int s=ws_open(hello,sizeof(hello));
    CHECK(s>=0,"WebSocket 連得上"); if(s<0){ printf("%d/%d\n",total-fails,total); return 1; }
    CHECKS(hello,"\"proto\":9","hello 回報 proto 9（1.20.0 起）");

    G("1. DLL 不在：清楚的錯誤，治具功能不受影響");
    jcmd(s,"{\"type\":\"open\",\"id\":1,\"mode\":4}",b,sizeof(b));
    CHECKS(b,"\"ok\":false","沒有 DLL_AUX_VC.dll ⇒ open 失敗");
    CHECKS(b,"DLL_AUX_VC.dll not found","錯誤訊息講出缺哪個檔、放哪裡");
    CHECKS(b,"\"auxDll\":false","auxDll:false");
    jcmd(s,"{\"type\":\"open\",\"id\":2,\"mode\":2,\"clockHz\":100000}",b,sizeof(b));
    CHECKS(b,"\"ok\":true","改回治具模式照常開得起來");
    jcmd(s,"{\"type\":\"read\",\"id\":3,\"slave\":104,\"addr\":0,\"len\":2}",b,sizeof(b));
    CHECKS(b,"\"ok\":true","治具讀取照常");
    EQ_I(dgh_fake_live,1,"治具 channel 開著（1）");

    G("2. 放好 DLL ⇒ AUX 開啟（卡、monitor、系統管理員、PSR、T-CON 初始化）");
    MKFILE("DLL_AUX_VC.dll","fake");
    jcmd(s,"{\"type\":\"open\",\"id\":4,\"mode\":4}",b,sizeof(b));
    CHECKS(b,"\"ok\":true","AUX open 成功");
    CHECKS(b,"\"card\":\"INTEL\"","依介面卡名稱判成 INTEL");
    CHECKS(b,"\"monitor\":2","monitor 0..19 逐一試，第一個 OK 的是 2");
    CHECKS(b,"\"admin\":true","回報系統管理員");
    CHECKS(b,"\"psrTurnedOff\":true","PSR 原本開著 ⇒ 關掉（Intel 規定 AUX 寫入前要關）");
    CHECKS(b,"\"tconInit\":true","做了 T-CON 初始化");
    EQ_I(dgh_fake_aux_psr_on,0,"假驅動的 PSR 真的被關了");
    EQ_I(dgh_fake_aux_last_proj,1,"projectIc 預設 1（EN01＝RAD81008 的 ProjectId）");
    EQ_I(dgh_fake_live,0,"切到 AUX 時治具已讓出");
    EQ_I(dgh_fake_aux_dpcd[0x4D1],0xDA,"T-CON enable：DPCD 0x4D1=DA");
    EQ_I(dgh_fake_aux_dpcd[0x480],0xFF,"flash 型初始化：0x480=FF");
    EQ_I(dgh_fake_aux_dpcd[0x482],0x00,"沒有碰 EEPROM 寫保護（0x482 仍 0）");
    EQ_I(dgh_fake_aux_r3e[0x0065],0x00,"沒有寫 3E:0065（EEPROM 型初始化的 GPIO WP）");

    G("3. 同一套 read／rawwrite：依 slave 路由");
    jcmd(s,"{\"type\":\"rawwrite\",\"id\":5,\"slave\":126,\"addr\":171,\"awid\":1,\"data\":[205]}",b,sizeof(b));
    CHECKS(b,"\"ok\":true","7E:AB←CD 經 I2C-over-AUX");
    EQ_I(dgh_fake_aux_r7e[0xAB],0xCD,"7E:AB 真的是 CD");
    EQ_I(dgh_fake_aux_r7c[0x0F],0x80,"M-Bus 後續：7C:0F bit7 已設（原廠 MbusConnect）");
    jcmd(s,"{\"type\":\"rawwrite\",\"id\":6,\"slave\":62,\"addr\":89,\"awid\":2,\"data\":[30,34]}",b,sizeof(b));
    CHECKS(b,"\"ok\":true","3E:0059 寫 2 byte");
    EQ_I(dgh_fake_aux_r3e[0x59],0x1E,"3E:0059=1E"); EQ_I(dgh_fake_aux_r3e[0x5A],0x22,"3E:005A=22");
    dgh_fake_aux_r3e[0x207E]=0x11;
    jcmd(s,"{\"type\":\"read\",\"id\":7,\"slave\":62,\"addr\":8318,\"awid\":2,\"len\":1}",b,sizeof(b));
    CHECKS(b,"\"data\":[17]","3E:207E 讀回 0x11（EN01 A2 辨認位）");
    dgh_fake_aux_r7c[0x98]=0x22; dgh_fake_aux_r7c[0x95]=0x10;
    jcmd(s,"{\"type\":\"read\",\"id\":8,\"slave\":124,\"addr\":149,\"awid\":1,\"len\":4}",b,sizeof(b));
    CHECKS(b,"\"data\":[16,0,0,34]","7C:95..98 讀 4 byte");
    { int i; for(i=0;i<20;i++) dgh_fake_aux_r7d[0x7D+i]=(unsigned char)(0x30+i); }
    jcmd(s,"{\"type\":\"read\",\"id\":9,\"slave\":125,\"addr\":125,\"awid\":2,\"len\":20}",b,sizeof(b));
    CHECKS(b,"\"ok\":true","7D:007D 讀 20 byte（I2C-over-AUX 分段）");
    CHECKS(b,"48,49,50","資料順序正確"); CHECKS(b,"67]","最後一個 byte 正確");

    G("4. 🔴 不能直接寫 EEPROM（Bruce 2026-10-23）");
    jcmd(s,"{\"type\":\"rawwrite\",\"id\":10,\"slave\":80,\"addr\":0,\"awid\":2,\"data\":[1,2,3]}",b,sizeof(b));
    CHECKS(b,"\"ok\":false","rawwrite 0x50 被擋"); CHECKS(b,"EEPROM","錯誤訊息講明是 EEPROM");
    jcmd(s,"{\"type\":\"read\",\"id\":11,\"slave\":80,\"addr\":0,\"awid\":2,\"len\":8}",b,sizeof(b));
    CHECKS(b,"\"ok\":true","1.20.0：read 0x50 經 I2C over AUX 放行（只讀）"); CHECKS(b,"238,238","讀回假 EEPROM 的資料");
    EQ_I(dgh_fake_aux_ee_hits,2,"讀 0x50 ＝ 一次 offset＋一次讀"); dgh_fake_aux_ee_hits=0;
    jcmd(s,"{\"type\":\"batchwrite\",\"id\":12,\"slave\":80,\"addr\":0,\"awid\":2,\"page\":16,\"twr\":5,\"len\":32,\"data\":[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]}",b,sizeof(b));
    while(strstr(b,"\"type\":\"progress\"")) { if(!ws_recv(s,b,sizeof(b))) break; }
    CHECKS(b,"\"ok\":false","batchwrite 0x50 被擋"); CHECKS(b,"\"done\":0","一個 byte 都沒寫");
    jcmd(s,"{\"type\":\"rawwrite\",\"id\":13,\"slave\":87,\"addr\":0,\"awid\":1,\"data\":[9]}",b,sizeof(b));
    CHECKS(b,"\"ok\":false","0x57（EEPROM 區最後一個）也擋");
    jcmd(s,"{\"type\":\"write\",\"id\":14,\"slave\":80,\"addr\":4608,\"data\":[1]}",b,sizeof(b));
    CHECKS(b,"\"ok\":false","dg 的 write（白名單位址）打 0x50 也擋");
    jcmd(s,"{\"type\":\"rawwrite\",\"id\":15,\"slave\":104,\"addr\":0,\"awid\":2,\"data\":[1]}",b,sizeof(b));
    CHECKS(b,"not a T-CON","0x68 不在 AUX 白名單");
    EQ_I(dgh_fake_aux_ee_hits,0,"寫入：假 EEPROM 一次都沒被碰到");
    jcmd(s,"{\"type\":\"dpcdwrite\",\"id\":16,\"addr\":1154,\"data\":[128]}",b,sizeof(b));
    CHECKS(b,"\"blocked\":true","dpcdwrite 0x482（EEPROM 寫保護）擋");
    EQ_I(dgh_fake_aux_dpcd[0x482],0,"0x482 沒被改");
    jcmd(s,"{\"type\":\"dpcdwrite\",\"id\":17,\"addr\":1150,\"data\":[1,2,3]}",b,sizeof(b));
    CHECKS(b,"\"blocked\":true","跨進 0x480 的也擋");

    G("5. dpcdread／dpcdwrite／psr");
    jcmd(s,"{\"type\":\"dpcdread\",\"id\":18,\"addr\":1233,\"len\":1}",b,sizeof(b));
    CHECKS(b,"\"data\":[218]","dpcdread 0x4D1 = DA");
    jcmd(s,"{\"type\":\"dpcdwrite\",\"id\":19,\"addr\":256,\"data\":[10]}",b,sizeof(b));
    CHECKS(b,"\"ok\":true","dpcdwrite 0x100 放行"); EQ_I(dgh_fake_aux_dpcd[0x100],10,"真的寫進去");
    jcmd(s,"{\"type\":\"psr\",\"id\":20}",b,sizeof(b));
    CHECKS(b,"\"supported\":true","psr 讀：supported"); CHECKS(b,"\"on\":false","psr 讀：目前關");
    { char h2[1024]; int s2=ws_open(h2,sizeof(h2));
      jcmd(s2,"{\"type\":\"dpcdread\",\"id\":21,\"addr\":0,\"len\":1}",b,sizeof(b));
      CHECKS(b,"\"busy\":true","非持有者不能用 dpcdread");
      jcmd(s2,"{\"type\":\"rawwrite\",\"id\":22,\"slave\":62,\"addr\":89,\"awid\":2,\"data\":[0]}",b,sizeof(b));
      CHECKS(b,"\"busy\":true","非持有者不能寫 T-CON");
      close(s2); msleep(150); }
    jcmd(s,"{\"type\":\"chandiag\",\"id\":23}",b,sizeof(b));
    CHECKS(b,"not available in DP AUX mode","chandiag 在 AUX 模式明確拒絕");

    G("6. 關閉：T-CON 收尾、PSR 還原、Release");
    { int rel=dgh_fake_aux_release_calls;
      jcmd(s,"{\"type\":\"close\",\"id\":24}",b,sizeof(b));
      CHECKS(b,"\"ok\":true","close");
      EQ_I(dgh_fake_aux_release_calls,rel+1,"Release() 被呼叫");
      EQ_I(dgh_fake_aux_psr_on,1,"PSR 還原成開");
      EQ_I(dgh_fake_aux_dpcd[0x439],0x04,"flash 型收尾：McuCtrlClk(false) 0x439=04"); }

    G("7. 非系統管理員＋寫入失敗 ⇒ 錯誤訊息教他怎麼做");
    dgh_shim_is_admin=0;
    jcmd(s,"{\"type\":\"open\",\"id\":25,\"mode\":4,\"tconinit\":0}",b,sizeof(b));
    CHECKS(b,"\"admin\":false","admin:false 回報給網頁");
    dgh_fake_aux_fail_writes=1;
    jcmd(s,"{\"type\":\"rawwrite\",\"id\":26,\"slave\":62,\"addr\":89,\"awid\":2,\"data\":[0]}",b,sizeof(b));
    CHECKS(b,"\"ok\":false","寫入失敗如實回報"); CHECKS(b,"administrator","訊息講到要用系統管理員執行");
    dgh_fake_aux_fail_writes=0; dgh_shim_is_admin=1;

    G("8. 切回治具：AUX 被放掉");
    { int rel=dgh_fake_aux_release_calls;
      jcmd(s,"{\"type\":\"open\",\"id\":27,\"mode\":2,\"clockHz\":100000}",b,sizeof(b));
      CHECKS(b,"\"ok\":true","治具 open");
      EQ_I(dgh_fake_aux_release_calls,rel+1,"切模式時 AUX Release()");
      EQ_I(dgh_fake_live,1,"治具重新拿到"); }
    jcmd(s,"{\"type\":\"dpcdread\",\"id\":28,\"addr\":0,\"len\":1}",b,sizeof(b));
    CHECKS(b,"DP AUX is not open","治具模式下 dpcdread 明確拒絕");

    G("9. 斷線也要放掉 AUX");
    jcmd(s,"{\"type\":\"open\",\"id\":29,\"mode\":4}",b,sizeof(b));
    { int rel=dgh_fake_aux_release_calls; close(s); msleep(300);
      EQ_I(dgh_fake_aux_release_calls,rel+1,"分頁斷線 ⇒ Release()"); }

    printf("\n================================================================\n");
    printf("%s %d / %d\n", fails?"🔴 未通過":"✅ 全部通過", total-fails, total);
    return fails?1:0;
}
