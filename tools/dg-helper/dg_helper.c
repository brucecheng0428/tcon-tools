/* ===========================================================================
 * DG I2C local bridge helper (native Win32, 32-bit)
 * ---------------------------------------------------------------------------
 * Shape:  browser --WebSocket(127.0.0.1)--> this exe --libMPSSE(D2XX)--> jig --I2C--> TCON
 *
 * v1.1.0 (Bruce 2026-09-17 feedback):
 *   1. Console output is ALL ENGLISH (was Chinese -> mojibake in Windows console).
 *   2. Helper SELF-SERVES the measurement page and AUTO-OPENS the default browser
 *      at http://127.0.0.1:<port>. The user no longer clicks any "connect" button.
 *      Fewer steps: download -> unzip (pw 1234) -> double-click exe -> browser opens.
 *   3. Startup SELF-DIAGNOSTICS written to console AND to dg-helper.log next to the
 *      exe. Every item prints OK / FAIL:<reason> so the user can just send the log.
 *      The window stays open on fatal failure.
 *
 * Why native C, not C# net472: the delivery box has no Visual Studio / mono /
 * dotnet and cannot reach those repos; native C cross-compiles to a 32-bit PE
 * (machine 0x014c) with zig and needs no .NET at all. Hard requirement unchanged:
 * MUST be a 32-bit process to load the x86 libMPSSE.dll.
 *
 * I2C sequence copied line-for-line from the PQ Tool decompile (spec source = PQ Tool):
 *   InitChannel: ClockRate=150000, LatencyTimer=1, Options=3, channel 0
 *   read : write 2-byte addr options=0x19 (repeated start, no STOP) -> read options=0x0B
 *   write: addr+data in one buffer options=0x17
 *
 * Hard guards (helper side, independent of the web page):
 *   - bind 127.0.0.1 only  - Origin allow-list  - write address whitelist 0x1200-0x12FF
 *
 * 🔴 NOT verified on real hardware: D2XX open, libMPSSE calls and actual I2C are
 *    untestable here (no Windows, no FTDI jig). Verified: PE header, winsock,
 *    GetProcAddress on libMPSSE, protocol pure functions.
 * =========================================================================== */

#define WIN32_LEAN_AND_MEAN
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <shellapi.h>
#include <stdio.h>
#include <stdint.h>
#include <string.h>
#include <stdlib.h>
#include <stdarg.h>

#include "dg_helper_version.h"
#include "dg_helper_proto.h"   /* SHA1 / Base64 / JSON / whitelist / Origin (shared with test_proto.c) */

/* ---- I2C transfer options (from ftdi_i2c.h / the combos PQ Tool uses) ---- */
#define I2C_FAST_TRANSFER_BYTES 0x10
#define OPT_READ_ADDR   (0x09u | I2C_FAST_TRANSFER_BYTES)   /* 0x19 */
#define OPT_READ_DATA   0x0Bu
#define OPT_WRITE       (0x07u | I2C_FAST_TRANSFER_BYTES)   /* 0x17 */

/* ---- write address whitelist (ptg bank) ---- */
#define WR_ADDR_MIN 0x1200u
#define WR_ADDR_MAX 0x12FFu

/* ---- libMPSSE ChannelConfig (Pack=1, matches C# [StructLayout(Pack=1)]) ---- */
#pragma pack(push, 1)
typedef struct { uint32_t ClockRate; uint8_t LatencyTimer; uint32_t Options; } ChannelConfig;
#pragma pack(pop)

/* FT_DEVICE_LIST_INFO_NODE (for enumeration diagnostics) */
typedef struct {
    uint32_t Flags; uint32_t Type; uint32_t ID; uint32_t LocId;
    char SerialNumber[16]; char Description[64]; void* ftHandle;
} FT_NODE;

typedef void* FT_HANDLE;
typedef uint32_t FT_STATUS;
#define FT_OK 0

typedef void      (*PFN_Init)(void);
typedef void      (*PFN_Cleanup)(void);
typedef FT_STATUS (*PFN_GetNum)(uint32_t*);
typedef FT_STATUS (*PFN_Open)(uint32_t, FT_HANDLE*);
typedef FT_STATUS (*PFN_Close)(FT_HANDLE);
typedef FT_STATUS (*PFN_Init2)(FT_HANDLE, ChannelConfig*);
typedef FT_STATUS (*PFN_Write)(FT_HANDLE, uint32_t, uint32_t, uint8_t*, uint32_t*, uint32_t);
typedef FT_STATUS (*PFN_Read)(FT_HANDLE, uint32_t, uint32_t, uint8_t*, uint32_t*, uint32_t);
typedef FT_STATUS (*PFN_ChanInfo)(uint32_t, FT_NODE*);

static PFN_Init    p_Init;
static PFN_Cleanup p_Cleanup;
static PFN_GetNum  p_GetNum;
static PFN_Open    p_Open;
static PFN_Close   p_Close;
static PFN_Init2   p_Init2;
static PFN_Write   p_Write;
static PFN_Read    p_Read;
static PFN_ChanInfo p_ChanInfo;

static FT_HANDLE g_handle = NULL;
static int       g_opened = 0;
static uint32_t  g_numChannels = 0;
static int       g_dllOk = 0;

static char g_exeDir[MAX_PATH] = "";
static char g_dllPath[MAX_PATH] = "";
static FILE* g_log = NULL;

/* ===========================================================================
 * logging: DETAIL goes to dg-helper.log ONLY (English, ASCII).
 * The CONSOLE shows just the single-letter status banner (Bruce 2026-09-17:
 * "log message as simple as possible, ideally one letter tells the problem"),
 * so the user can read the letter off the black window without a photo.
 * =========================================================================== */
static void logline(const char* fmt, ...) {
    char buf[1024];
    va_list ap; va_start(ap, fmt);
    vsnprintf(buf, sizeof(buf), fmt, ap);
    va_end(ap);
    if (g_log) { fputs(buf, g_log); fputc('\n', g_log); fflush(g_log); }
}
/* status-letter state */
static int  g_dllLoadedButBad = 0;   /* saw LoadLibrary success but procs missing -> X */
static char g_jigState = 'J';        /* 'J' none, 'U' found-but-open-failed, 'K' ok */
static int  g_browserOk = 0;
static int  g_bindOk = 0;

static void exe_dir(char* out, int cap) {
    char exe[MAX_PATH]; GetModuleFileNameA(NULL, exe, sizeof(exe));
    char* slash = strrchr(exe, '\\'); if (slash) *(slash + 1) = 0; else exe[0] = 0;
    snprintf(out, cap, "%s", exe);
}

/* ===========================================================================
 * DLL locate & load (auto only, no interactive prompt)
 * =========================================================================== */
static int try_load_from(const char* dir) {
    char path[MAX_PATH];
    if (dir && dir[0]) { snprintf(path, sizeof(path), "%slibMPSSE.dll", dir); SetDllDirectoryA(dir); }
    else snprintf(path, sizeof(path), "libMPSSE.dll");
    HMODULE h = LoadLibraryA(path);
    if (!h) return 0;   /* not present / could not load image here -> try next path */
    p_Init=(PFN_Init)GetProcAddress(h,"Init_libMPSSE");
    p_Cleanup=(PFN_Cleanup)GetProcAddress(h,"Cleanup_libMPSSE");
    p_GetNum=(PFN_GetNum)GetProcAddress(h,"I2C_GetNumChannels");
    p_Open=(PFN_Open)GetProcAddress(h,"I2C_OpenChannel");
    p_Close=(PFN_Close)GetProcAddress(h,"I2C_CloseChannel");
    p_Init2=(PFN_Init2)GetProcAddress(h,"I2C_InitChannel");
    p_Write=(PFN_Write)GetProcAddress(h,"I2C_DeviceWrite");
    p_Read=(PFN_Read)GetProcAddress(h,"I2C_DeviceRead");
    p_ChanInfo=(PFN_ChanInfo)GetProcAddress(h,"I2C_GetChannelInfo");
    if (!p_GetNum||!p_Open||!p_Close||!p_Init2||!p_Write||!p_Read) {
        /* the DLL loaded but the I2C_* exports are missing -> wrong/corrupt DLL
           (or, most likely here, a bitness mismatch that still mapped) -> 'X' */
        g_dllLoadedButBad = 1; return 0;
    }
    snprintf(g_dllPath, sizeof(g_dllPath), "%s", path);
    return 1;
}
/* read dg-helper.ini next to exe (one line = libMPSSE folder), optional */
static int read_ini_dir(char* out, int cap) {
    char ip[MAX_PATH]; snprintf(ip, sizeof(ip), "%sdg-helper.ini", g_exeDir);
    FILE* f = fopen(ip, "rb"); if (!f) return 0;
    if (!fgets(out, cap, f)) { fclose(f); return 0; } fclose(f);
    int n = (int)strlen(out); while (n>0 && (out[n-1]=='\n'||out[n-1]=='\r'||out[n-1]==' ')) out[--n]=0;
    /* ensure trailing backslash */
    n = (int)strlen(out); if (n>0 && out[n-1] != '\\' && n < cap-1) { out[n]='\\'; out[n+1]=0; }
    return out[0] ? 1 : 0;
}
static int locate_and_load_dll(void) {
    char dir[MAX_PATH];
    if (try_load_from(g_exeDir)) return 1;                 /* next to exe */
    if (read_ini_dir(dir, sizeof(dir)) && try_load_from(dir)) return 1;
    const char* cand[] = { ".\\Release V1.5.0\\", "..\\Release V1.5.0\\", NULL };
    for (int i=0; cand[i]; i++) if (try_load_from(cand[i])) return 1;
    return 0;
}

/* ===========================================================================
 * diagnostics
 * =========================================================================== */
typedef LONG (WINAPI *PFN_RtlGetVersion)(RTL_OSVERSIONINFOW*);
static void diag_os(void) {
    HMODULE nt = GetModuleHandleA("ntdll.dll");
    PFN_RtlGetVersion f = nt ? (PFN_RtlGetVersion)GetProcAddress(nt, "RtlGetVersion") : NULL;
    if (f) {
        RTL_OSVERSIONINFOW v; memset(&v,0,sizeof(v)); v.dwOSVersionInfoSize=sizeof(v);
        if (f(&v) == 0) { logline("  OS        : OK  Windows %lu.%lu build %lu",
                                  v.dwMajorVersion, v.dwMinorVersion, v.dwBuildNumber); return; }
    }
    logline("  OS        : OK  (version query unavailable)");
}
static void diag_bits(void) {
    logline("  process   : %s  %d-bit (pointer=%d bytes)",
            (sizeof(void*)==4) ? "OK " : "FAIL", (int)(sizeof(void*)*8), (int)sizeof(void*));
}
static void diag_dll(void) {
    if (g_dllOk) logline("  libMPSSE  : OK  loaded from %s", g_dllPath);
    else {
        logline("  libMPSSE  : FAIL: libMPSSE.dll not found.");
        logline("              Searched: exe folder, dg-helper.ini, .\\Release V1.5.0, ..\\Release V1.5.0");
        logline("              Fix: put libMPSSE.dll (and its ftd2xx.dll) next to dg-helper.exe,");
        logline("                   or create dg-helper.ini next to the exe with one line = the PQ Tool Release folder.");
    }
}
static void diag_ftdi(void) {
    g_jigState = 'J';
    if (!g_dllOk) { logline("  FTDI jig  : SKIP (libMPSSE not loaded)"); return; }
    if (p_Init) p_Init();
    uint32_t n = 0; FT_STATUS s = p_GetNum(&n);
    if (s != FT_OK) { logline("  FTDI jig  : FAIL: I2C_GetNumChannels status=%u -> J", s); return; }
    g_numChannels = n;
    if (n == 0) { logline("  FTDI jig  : FAIL: 0 channels enumerated (jig plugged in? has power? drivers installed?) -> J"); return; }
    logline("  FTDI jig  : found %u channel(s)", n);
    if (p_ChanInfo) {
        for (uint32_t i=0; i<n && i<4; i++) {
            FT_NODE node; memset(&node,0,sizeof(node));
            if (p_ChanInfo(i,&node)==FT_OK)
                logline("              ch %u: ID=0x%08X (VID=0x%04X PID=0x%04X) desc=\"%.32s\"",
                        i, node.ID, (node.ID>>16)&0xFFFF, node.ID&0xFFFF, node.Description);
        }
    }
    /* Probe openability so the startup letter can tell 'no jig' (J) from
       'jig present but held by the original PQ Tool' (U). We open then close
       right away; the page will re-open channel 0 when it connects. */
    FT_HANDLE h = NULL;
    if (p_Open(0, &h) != FT_OK || h == NULL) {
        g_jigState = 'U';
        logline("  FTDI open : FAIL: I2C_OpenChannel(0) failed -> U (channel is in use; close the original PQ Tool / AUX GUI)");
        return;
    }
    p_Close(h);
    g_jigState = 'K';
    logline("  FTDI open : OK  channel 0 opens (nothing else is holding the jig)");
}

/* ===========================================================================
 * I2C actions (copied from PQ Tool)
 * =========================================================================== */
static int i2c_open(uint32_t clockHz) {
    if (!g_dllOk) return 0;
    if (g_opened) return 1;
    if (p_Init) p_Init();
    if (p_GetNum(&g_numChannels)!=FT_OK || g_numChannels==0) return 0;
    if (p_Open(0,&g_handle)!=FT_OK) return 0;
    ChannelConfig cfg; cfg.ClockRate=clockHz?clockHz:150000; cfg.LatencyTimer=1; cfg.Options=3;
    if (p_Init2(g_handle,&cfg)!=FT_OK) { p_Close(g_handle); g_handle=NULL; return 0; }
    g_opened=1; return 1;
}
static void i2c_close(void){ if(g_opened&&g_handle) p_Close(g_handle); g_handle=NULL; g_opened=0; }
static FT_STATUS i2c_read(uint32_t slave, uint32_t addr, uint32_t len, uint8_t* out, uint32_t* got){
    uint8_t ab[2]; ab[0]=(uint8_t)((addr>>8)&0xFF); ab[1]=(uint8_t)(addr&0xFF); uint32_t tr=0;
    p_Write(g_handle, slave, 2, ab, &tr, OPT_READ_ADDR);
    return p_Read(g_handle, slave, len, out, got, OPT_READ_DATA);
}
static FT_STATUS i2c_write(uint32_t slave, uint32_t addr, const uint8_t* data, int dlen, uint32_t* got){
    uint8_t buf[64]; if(dlen<0||dlen>60) return 0xFFFFFFFF;
    buf[0]=(uint8_t)((addr>>8)&0xFF); buf[1]=(uint8_t)(addr&0xFF); memcpy(buf+2,data,dlen);
    uint32_t tr=0; FT_STATUS s=p_Write(g_handle, slave, (uint32_t)(dlen+2), buf, &tr, OPT_WRITE);
    if(got)*got=tr; return s;
}

/* ===========================================================================
 * WebSocket serving (single client)
 * =========================================================================== */
static int send_all(SOCKET c, const char* p, int n){ int s=0; while(s<n){int r=send(c,p+s,n-s,0); if(r<=0)return 0; s+=r;} return 1; }
static int ws_send_text(SOCKET c, const char* msg){
    int n=(int)strlen(msg); uint8_t hdr[4]; int hl; hdr[0]=0x81;
    if(n<126){ hdr[1]=(uint8_t)n; hl=2; } else { hdr[1]=126; hdr[2]=(uint8_t)(n>>8); hdr[3]=(uint8_t)(n&0xFF); hl=4; }
    if(!send_all(c,(char*)hdr,hl)) return 0; return send_all(c,msg,n);
}
static int recv_exact(SOCKET c, uint8_t* p, int n){ int g=0; while(g<n){int r=recv(c,(char*)p+g,n-g,0); if(r<=0)return 0; g+=r;} return 1; }
static int ws_recv_text(SOCKET c, char* out, int cap){
    uint8_t h2[2]; if(!recv_exact(c,h2,2)) return -1;
    int opcode=h2[0]&0x0F, masked=h2[1]&0x80; uint64_t len=h2[1]&0x7F;
    if(len==126){ uint8_t e[2]; if(!recv_exact(c,e,2))return -1; len=(e[0]<<8)|e[1]; }
    else if(len==127){ uint8_t e[8]; if(!recv_exact(c,e,8))return -1; len=0; for(int i=0;i<8;i++) len=(len<<8)|e[i]; }
    uint8_t mask[4]={0,0,0,0}; if(masked){ if(!recv_exact(c,mask,4))return -1; }
    if(opcode==0x8) return -1;
    if((int)len>=cap) return -1;
    if(len){ if(!recv_exact(c,(uint8_t*)out,(int)len)) return -1; if(masked) for(uint64_t i=0;i<len;i++) out[i]^=mask[i&3]; }
    out[len]=0;
    if(opcode==0x9){ uint8_t ph[2]={0x8A,(uint8_t)len}; send_all(c,(char*)ph,2); if(len) send_all(c,out,(int)len); return ws_recv_text(c,out,cap); }
    if(opcode!=0x1){ out[0]=0; return 0; }
    return (int)len;
}
static void handle_command(SOCKET c, const char* json){
    char type[24]={0}; if(!dgh_json_type(json,type,sizeof(type))) return;
    long id=dgh_json_int(json,"id",0);
    char rep[8192];
    if(strcmp(type,"open")==0){
        uint32_t hz=(uint32_t)dgh_json_int(json,"clockHz",150000);
        int ok=i2c_open(hz);
        snprintf(rep,sizeof(rep),"{\"type\":\"result\",\"id\":%ld,\"cmd\":\"open\",\"ok\":%s,\"channels\":%u%s}",
                 id, ok?"true":"false", g_numChannels, g_dllOk?"":",\"err\":\"libMPSSE not loaded\"");
        logline("[cmd] open -> %s (channels=%u)", ok?"OK":"FAIL", g_numChannels);
        ws_send_text(c,rep); return;
    }
    if(strcmp(type,"close")==0){ i2c_close(); snprintf(rep,sizeof(rep),"{\"type\":\"result\",\"id\":%ld,\"cmd\":\"close\",\"ok\":true}",id); ws_send_text(c,rep); return; }
    if(strcmp(type,"read")==0){
        uint32_t slave=(uint32_t)dgh_json_int(json,"slave",0x60);
        uint32_t addr=(uint32_t)dgh_json_int(json,"addr",0);
        uint32_t len=(uint32_t)dgh_json_int(json,"len",1);
        if(!g_opened){ snprintf(rep,sizeof(rep),"{\"type\":\"result\",\"id\":%ld,\"cmd\":\"read\",\"ok\":false,\"err\":\"not open\"}",id); ws_send_text(c,rep); return; }
        if(len>1024) len=1024;
        uint8_t buf[1024]; uint32_t got=0; FT_STATUS st=i2c_read(slave,addr,len,buf,&got);
        int o=snprintf(rep,sizeof(rep),"{\"type\":\"result\",\"id\":%ld,\"cmd\":\"read\",\"ok\":%s,\"status\":%u,\"data\":[",id,(st==FT_OK)?"true":"false",st);
        for(uint32_t i=0;i<got&&o<(int)sizeof(rep)-16;i++) o+=snprintf(rep+o,sizeof(rep)-o,"%s%u",i?",":"",buf[i]);
        o+=snprintf(rep+o,sizeof(rep)-o,"]}");
        ws_send_text(c,rep); return;
    }
    if(strcmp(type,"write")==0){
        uint32_t slave=(uint32_t)dgh_json_int(json,"slave",0x60);
        uint32_t addr=(uint32_t)dgh_json_int(json,"addr",0);
        uint8_t data[60]; int dn=dgh_json_int_array(json,"data",data,sizeof(data));
        if(dn<0){ snprintf(rep,sizeof(rep),"{\"type\":\"result\",\"id\":%ld,\"cmd\":\"write\",\"ok\":false,\"err\":\"bad data\"}",id); ws_send_text(c,rep); return; }
        if(addr<WR_ADDR_MIN || (addr+(uint32_t)dn-1)>WR_ADDR_MAX){
            snprintf(rep,sizeof(rep),"{\"type\":\"result\",\"id\":%ld,\"cmd\":\"write\",\"ok\":false,\"err\":\"addr blocked (helper whitelist 0x1200-0x12FF)\"}",id);
            logline("[cmd] write BLOCKED addr=0x%04X x%d", addr, dn); ws_send_text(c,rep); return;
        }
        if(!g_opened){ snprintf(rep,sizeof(rep),"{\"type\":\"result\",\"id\":%ld,\"cmd\":\"write\",\"ok\":false,\"err\":\"not open\"}",id); ws_send_text(c,rep); return; }
        uint32_t got=0; FT_STATUS st=i2c_write(slave,addr,data,dn,&got);
        snprintf(rep,sizeof(rep),"{\"type\":\"result\",\"id\":%ld,\"cmd\":\"write\",\"ok\":%s,\"status\":%u,\"transferred\":%u}",id,(st==FT_OK)?"true":"false",st,got);
        ws_send_text(c,rep); return;
    }
    if(strcmp(type,"ping")==0){
        snprintf(rep,sizeof(rep),"{\"type\":\"pong\",\"id\":%ld,\"helper\":\"%s\",\"proto\":%d,\"dll\":%s}",id,DG_HELPER_VERSION,DG_HELPER_PROTO,g_dllOk?"true":"false");
        ws_send_text(c,rep); return;
    }
}
static void serve_ws(SOCKET c, const char* req){
    const char* k=strstr(req,"Sec-WebSocket-Key:"); if(!k) k=strstr(req,"sec-websocket-key:");
    if(!k){ const char* r="HTTP/1.1 400 Bad Request\r\n\r\n"; send_all(c,r,(int)strlen(r)); return; }
    k+=18; while(*k==' ') k++;
    char key[128]; int i=0; while(*k&&*k!='\r'&&*k!='\n'&&i<100) key[i++]=*k++; key[i]=0;
    if(!dgh_origin_allowed(req)){ const char* r="HTTP/1.1 403 Forbidden\r\n\r\norigin not allowed"; send_all(c,r,(int)strlen(r)); logline("[ws] refused: origin not allowed"); return; }
    char acc[64]; dgh_ws_accept(key,acc);
    char resp[256]; snprintf(resp,sizeof(resp),"HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: %s\r\n\r\n",acc);
    if(!send_all(c,resp,(int)strlen(resp))) return;
    logline("[ws] client connected");
    char hello[160]; snprintf(hello,sizeof(hello),"{\"type\":\"hello\",\"helper\":\"%s\",\"proto\":%d,\"dll\":%s}",DG_HELPER_VERSION,DG_HELPER_PROTO,g_dllOk?"true":"false");
    ws_send_text(c,hello);
    char msg[8192];
    for(;;){ int n=ws_recv_text(c,msg,sizeof(msg)); if(n<0) break; if(n>0) handle_command(c,msg); }
    logline("[ws] client disconnected, releasing I2C");
    i2c_close();
}

/* ===========================================================================
 * HTTP: serve the measurement page (sibling file) or a fallback notice
 * =========================================================================== */
static char* read_file(const char* path, long* outLen){
    FILE* f=fopen(path,"rb"); if(!f) return NULL;
    fseek(f,0,SEEK_END); long n=ftell(f); fseek(f,0,SEEK_SET);
    if(n<0){ fclose(f); return NULL; }
    char* b=(char*)malloc(n+1); if(!b){ fclose(f); return NULL; }
    long got=(long)fread(b,1,n,f); fclose(f); b[got]=0; if(outLen)*outLen=got; return b;
}
static void serve_page(SOCKET c){
    char path[MAX_PATH]; snprintf(path,sizeof(path),"%sdg-measure.html",g_exeDir);
    long n=0; char* body=read_file(path,&n);
    if(body){
        char hdr[256]; int hl=snprintf(hdr,sizeof(hdr),"HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: %ld\r\nConnection: close\r\n\r\n",n);
        send_all(c,hdr,hl); send_all(c,body,(int)n); free(body); return;
    }
    /* fallback: the page file is missing next to the exe */
    const char* fb =
      "<!doctype html><meta charset=utf-8><title>DG helper</title>"
      "<body style='font-family:sans-serif;background:#0f172a;color:#e2e8f0;padding:2em'>"
      "<h2>DG helper is running, but dg-measure.html was not found next to it.</h2>"
      "<p>Put <b>dg-measure.html</b> in the same folder as dg-helper.exe (it ships inside the same zip), then reload.</p>"
      "<p>Or use the online tool at https://brucecheng0428.github.io/tcon-tools/ .</p></body>";
    char resp[1024]; snprintf(resp,sizeof(resp),"HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: %d\r\nConnection: close\r\n\r\n%s",(int)strlen(fb),fb);
    send_all(c,resp,(int)strlen(resp));
    logline("[http] served fallback: dg-measure.html not found next to exe");
}

int main(int argc, char** argv){
    int port=8899;
    for(int i=1;i<argc;i++) if(strncmp(argv[i],"--port=",7)==0) port=atoi(argv[i]+7);

    SetConsoleOutputCP(65001);   /* extra insurance; output is ASCII anyway */
    exe_dir(g_exeDir, sizeof(g_exeDir));
    { char lp[MAX_PATH]; snprintf(lp,sizeof(lp),"%sdg-helper.log",g_exeDir); g_log=fopen(lp,"wb"); }

    logline("==================================================");
    logline(" DG I2C local bridge helper  %s (proto %d)", DG_HELPER_VERSION, DG_HELPER_PROTO);
    logline(" listens on 127.0.0.1:%d only, allow-list origins only", port);
    logline(" write address hard whitelist: 0x1200-0x12FF");
    logline("==================================================");
    logline("Self-diagnostics:");

    diag_os();
    diag_bits();
    g_dllOk = locate_and_load_dll();
    diag_dll();
    diag_ftdi();

    WSADATA w;
    char url[64]; snprintf(url,sizeof(url),"http://127.0.0.1:%d/", port);
    SOCKET srv = INVALID_SOCKET;
    if(WSAStartup(MAKEWORD(2,2),&w)==0){
        srv=socket(AF_INET,SOCK_STREAM,0);
        int yes=1; setsockopt(srv,SOL_SOCKET,SO_REUSEADDR,(char*)&yes,sizeof(yes));
        struct sockaddr_in a; memset(&a,0,sizeof(a));
        a.sin_family=AF_INET; a.sin_port=htons((u_short)port); a.sin_addr.s_addr=inet_addr("127.0.0.1");
        if(bind(srv,(struct sockaddr*)&a,sizeof(a))==0){ g_bindOk=1; listen(srv,8);
            logline("  bind      : OK  127.0.0.1:%d", port);
        } else {
            logline("  bind      : FAIL: cannot bind 127.0.0.1:%d (another helper already running?) -> P", port);
        }
    } else logline("  bind      : FAIL: WSAStartup -> P");

    /* only auto-open the browser if we can actually serve */
    if(g_bindOk){
        HINSTANCE r = ShellExecuteA(NULL,"open",url,NULL,NULL,SW_SHOWNORMAL);
        g_browserOk = ((INT_PTR)r > 32);
        if(g_browserOk) logline("  browser   : OK  opened %s", url);
        else            logline("  browser   : FAIL: could not auto-open browser -> B (open %s yourself)", url);
    }

    /* ── decide the single status letter (priority order) ─────────────────
       P port/bind cannot serve (fatal) > D dll missing > X dll wrong/bad
       > J no jig > U jig held by PQ Tool > B browser not opened > G good.   */
    char code; const char *meaning, *todo;
    if(!g_bindOk){ code='P'; meaning="port 127.0.0.1 is busy"; todo="Another dg-helper is already running. Close it, then start this one again."; }
    else if(!g_dllOk && g_dllLoadedButBad){ code='X'; meaning="wrong libMPSSE.dll (bitness/corrupt)"; todo="Replace libMPSSE.dll with the 32-bit one from your PQ Tool Release folder."; }
    else if(!g_dllOk){ code='D'; meaning="libMPSSE.dll not found"; todo="Copy libMPSSE.dll + ftd2xx.dll from your PQ Tool 'Release V1.5.0' folder next to this exe, then restart."; }
    else if(g_jigState=='J'){ code='J'; meaning="FTDI jig not found"; todo="Plug in the I2C jig (check USB and power), then start this program again."; }
    else if(g_jigState=='U'){ code='U'; meaning="jig is in use"; todo="Close the original PQ Tool / AUX GUI (it is holding the jig), then start this program again."; }
    else if(!g_browserOk){ code='B'; meaning="browser did not open"; todo="Open this address in Chrome yourself:  "; }
    else { code='G'; meaning="all good"; todo="The page opened in your browser. You can start measuring."; }

    /* ── console banner: the LAST, most visible thing on screen ──────────── */
    printf("\n\n");
    printf("==================================================\n");
    printf("        DG-HELPER STATUS:   %c\n", code);
    printf("==================================================\n");
    printf("   %c = %s\n", code, meaning);
    if(code=='B') printf("   What to do: %s%s\n", todo, url);
    else          printf("   What to do: %s\n", todo);
    printf("   (Full English details are in dg-helper.log, next to this program.)\n");
    if(code!='G') printf("   Report just this letter:  %c\n", code);
    printf("==================================================\n");
    fflush(stdout);
    logline("STATUS LETTER: %c (%s)", code, meaning);

    if(!g_bindOk){
        /* cannot serve anything -> keep the window (and the letter) on screen */
        printf("\nPress Enter to close this window...\n"); fflush(stdout);
        getchar();
        if(g_log) fclose(g_log);
        return 1;
    }

    for(;;){
        SOCKET c=accept(srv,NULL,NULL);
        if(c==INVALID_SOCKET) continue;
        char req[8192]; int n=recv(c,req,sizeof(req)-1,0);
        if(n<=0){ closesocket(c); continue; }
        req[n]=0;
        if(strstr(req,"Upgrade: websocket")||strstr(req,"upgrade: websocket")) serve_ws(c,req);
        else serve_page(c);
        closesocket(c);
    }
    if(p_Cleanup) p_Cleanup();
    closesocket(srv); WSACleanup();
    if(g_log) fclose(g_log);
    return 0;
}
