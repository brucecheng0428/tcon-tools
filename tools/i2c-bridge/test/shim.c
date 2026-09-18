/* Win32 shim 實作 ＋ 假的 libMPSSE。見 shim/windows.h 開頭的說明。
   🔴 假的只到 libMPSSE 的函式邊界為止：D2XX、真正的 I2C 波形、真 TCON
      一律沒有被模擬，也不宣稱被驗到。 */
#include "shim/winsock2.h"
#include "shim/windows.h"
#include <stdlib.h>
#include <dirent.h>
#include <sys/stat.h>
#include <stdint.h>

int  dgh_shim_browser_opened = 0;
char dgh_shim_browser_url[512] = "";
static char g_shim_exe_dir[MAX_PATH] = "/tmp/";

void dgh_shim_set_exe_dir(const char* dir){ snprintf(g_shim_exe_dir,sizeof(g_shim_exe_dir),"%s",dir); }

/* ── 假 libMPSSE：計數 open/close，好驗「斷線有沒有真的釋放 channel」 ──── */
int dgh_fake_open_calls  = 0;
int dgh_fake_close_calls = 0;
int dgh_fake_live        = 0;   /* 目前開著幾個 channel（必須是 0 或 1） */
int dgh_fake_writes      = 0;
int dgh_fake_reads       = 0;
unsigned char dgh_fake_last_write[64];
int dgh_fake_last_write_len = 0;

static void      fake_Init(void){}
static void      fake_Cleanup(void){}
static uint32_t  fake_GetNum(uint32_t* n){ *n = 1; return 0; }
static uint32_t  fake_Open(uint32_t idx, void** h){ (void)idx; *h=(void*)(intptr_t)0xF00D;
                                                    dgh_fake_open_calls++; dgh_fake_live++; return 0; }
static uint32_t  fake_Close(void* h){ (void)h; dgh_fake_close_calls++; if(dgh_fake_live>0) dgh_fake_live--; return 0; }
static uint32_t  fake_Init2(void* h, void* cfg){ (void)h; (void)cfg; return 0; }
static uint32_t  fake_Write(void* h, uint32_t a, uint32_t n, unsigned char* b, uint32_t* t, uint32_t o){
    (void)h;(void)a;(void)o; dgh_fake_writes++;
    dgh_fake_last_write_len = (int)(n>sizeof(dgh_fake_last_write)?sizeof(dgh_fake_last_write):n);
    memcpy(dgh_fake_last_write,b,(size_t)dgh_fake_last_write_len);
    if(t)*t=n; return 0; }
static uint32_t  fake_Read(void* h, uint32_t a, uint32_t n, unsigned char* b, uint32_t* t, uint32_t o){
    (void)h;(void)a;(void)o; dgh_fake_reads++;
    for(uint32_t i=0;i<n;i++) b[i]=(unsigned char)(0xA0+i);
    if(t)*t=n; return 0; }
static uint32_t  fake_ChanInfo(uint32_t i, void* node){ (void)i; (void)node; return 0; }

HMODULE LoadLibraryA(const char* path){
    if(!path) return NULL;
    /* i2c_bridge.c 組出來的是 Windows 風格路徑（反斜線），先正規化再 stat */
    char p[MAX_PATH*2]; snprintf(p,sizeof(p),"%s",path);
    for(char* q=p; *q; q++) if(*q=='\\') *q='/';
    const char* base = strrchr(p,'/'); base = base?base+1:p;
    if(strcmp(base,"libMPSSE.dll")!=0) return NULL;
    struct stat st; if(stat(p,&st)!=0) return NULL;
    return (HMODULE)(intptr_t)0x11B;
}
void* GetProcAddress(HMODULE m, const char* name){
    if(!m) return NULL;
    if(!strcmp(name,"Init_libMPSSE"))      return (void*)fake_Init;
    if(!strcmp(name,"Cleanup_libMPSSE"))   return (void*)fake_Cleanup;
    if(!strcmp(name,"I2C_GetNumChannels")) return (void*)fake_GetNum;
    if(!strcmp(name,"I2C_OpenChannel"))    return (void*)fake_Open;
    if(!strcmp(name,"I2C_CloseChannel"))   return (void*)fake_Close;
    if(!strcmp(name,"I2C_InitChannel"))    return (void*)fake_Init2;
    if(!strcmp(name,"I2C_DeviceWrite"))    return (void*)fake_Write;
    if(!strcmp(name,"I2C_DeviceRead"))     return (void*)fake_Read;
    if(!strcmp(name,"I2C_GetChannelInfo")) return (void*)fake_ChanInfo;
    return NULL;
}

DWORD GetModuleFileNameA(HMODULE m, char* buf, DWORD cap){
    (void)m; snprintf(buf,cap,"%si2c-bridge.exe",g_shim_exe_dir);
    /* i2c_bridge.c 用 strrchr(exe,'\\') 切目錄，所以這裡要給 Windows 風格的分隔符 */
    for(char* p=buf; *p; p++) if(*p=='/') *p='\\';
    return (DWORD)strlen(buf);
}
DWORD GetTempPathA(DWORD cap, char* buf){ snprintf(buf,cap,"C:\\nonexistent-temp\\"); return (DWORD)strlen(buf); }
DWORD GetFileAttributesA(const char* path){
    char p[MAX_PATH*2]; snprintf(p,sizeof(p),"%s",path);
    for(char* q=p; *q; q++) if(*q=='\\') *q='/';
    struct stat st; if(stat(p,&st)!=0) return INVALID_FILE_ATTRIBUTES;
    return S_ISDIR(st.st_mode) ? FILE_ATTRIBUTE_DIRECTORY : 0x80u;
}
DWORD GetEnvironmentVariableA(const char* name, char* buf, DWORD cap){
    const char* v=getenv(name); if(!v) return 0;
    if(!buf||cap==0) return (DWORD)strlen(v)+1;
    snprintf(buf,cap,"%s",v); return (DWORD)strlen(buf);
}
DWORD GetCurrentDirectoryA(DWORD cap, char* buf){ if(!getcwd(buf,cap)) return 0; return (DWORD)strlen(buf); }
BOOL  SetDllDirectoryA(const char* d){ (void)d; return 1; }
DWORD GetLastError(void){ return 0; }
HANDLE FindFirstFileA(const char* pat, WIN32_FIND_DATAA* fd){ (void)pat; (void)fd; return INVALID_HANDLE_VALUE; }
BOOL   FindNextFileA(HANDLE h, WIN32_FIND_DATAA* fd){ (void)h; (void)fd; return 0; }
BOOL   FindClose(HANDLE h){ (void)h; return 1; }
LONG RegOpenKeyExA(HKEY a, const char* b, DWORD c, REGSAM d, HKEY* e){ (void)a;(void)b;(void)c;(void)d;(void)e; return 1; }
LONG RegEnumKeyExA(HKEY a, DWORD b, char* c, DWORD* d, void* e, void* f, void* g, void* h){
    (void)a;(void)b;(void)c;(void)d;(void)e;(void)f;(void)g;(void)h; return 1; }
LONG RegQueryValueExA(HKEY a, const char* b, void* c, DWORD* d, BYTE* e, DWORD* f){
    (void)a;(void)b;(void)c;(void)d;(void)e;(void)f; return 1; }
LONG RegCloseKey(HKEY k){ (void)k; return 0; }
HMODULE GetModuleHandleA(const char* n){ (void)n; return NULL; }
HINSTANCE ShellExecuteA(void* h, const char* op, const char* file, const char* par, const char* dir, int show){
    (void)h;(void)op;(void)par;(void)dir;(void)show;
    dgh_shim_browser_opened++;
    snprintf(dgh_shim_browser_url,sizeof(dgh_shim_browser_url),"%s",file?file:"");
    return (HINSTANCE)(intptr_t)100;
}
BOOL SetConsoleOutputCP(unsigned cp){ (void)cp; return 1; }

/* ── select / setsockopt 的語意翻譯（見 shim/winsock2.h 的說明）────────── */
#undef select
#undef setsockopt
int dgh_shim_select(fd_set* r, fd_set* w, fd_set* e, struct timeval* t){
    int mx=-1;
    for(int i=0;i<FD_SETSIZE;i++){
        if(r&&FD_ISSET(i,r)) mx=i;
        if(w&&FD_ISSET(i,w)&&i>mx) mx=i;
        if(e&&FD_ISSET(i,e)&&i>mx) mx=i;
    }
    return select(mx+1,r,w,e,t);
}
int dgh_shim_setsockopt(int s, int lvl, int opt, const char* val, int len){
    if(lvl==SOL_SOCKET && opt==SO_RCVTIMEO && len==(int)sizeof(DWORD)){
        DWORD ms; memcpy(&ms,val,sizeof(ms));
        struct timeval tv; tv.tv_sec=(long)(ms/1000); tv.tv_usec=(long)((ms%1000)*1000);
        return setsockopt(s,lvl,opt,&tv,sizeof(tv));
    }
    return setsockopt(s,lvl,opt,val,(socklen_t)len);
}

#undef fopen
FILE* dgh_shim_fopen(const char* path, const char* mode){
    char p[MAX_PATH*2]; snprintf(p,sizeof(p),"%s",path?path:"");
    for(char* q=p; *q; q++) if(*q=='\\') *q='/';
    return fopen(p,mode);
}
