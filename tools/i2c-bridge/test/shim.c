/* Win32 shim 實作 ＋ 假的 libMPSSE。見 shim/windows.h 開頭的說明。
   🔴 假的只到 libMPSSE 的函式邊界為止：D2XX、真正的 I2C 波形、真 TCON
      一律沒有被模擬，也不宣稱被驗到。 */
#include "shim/winsock2.h"
#include "shim/windows.h"
#include <stdlib.h>
#include <dirent.h>
#include <sys/stat.h>
#include <stdint.h>
#include <time.h>

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
/* 🔴 記下最後一次呼叫帶的 transfer options ——「讀取有沒有真的走 fast 路徑」
   只有從這個位元看得出來（0x10 ＝ I2C_TRANSFER_OPTIONS_FAST_TRANSFER_BYTES）。 */
unsigned dgh_fake_last_read_opts  = 0;
unsigned dgh_fake_last_write_opts = 0;
/* 讓測試可以叫某一次讀／寫失敗（模擬 NACK），驗我們不會靜默吞掉。 */
unsigned dgh_fake_read_status  = 0;
unsigned dgh_fake_write_status = 0;

static void      fake_Init(void){}
static void      fake_Cleanup(void){}
static uint32_t  fake_GetNum(uint32_t* n){ *n = 1; return 0; }
static uint32_t  fake_Open(uint32_t idx, void** h){ (void)idx; *h=(void*)(intptr_t)0xF00D;
                                                    dgh_fake_open_calls++; dgh_fake_live++; return 0; }
static uint32_t  fake_Close(void* h){ (void)h; dgh_fake_close_calls++; if(dgh_fake_live>0) dgh_fake_live--; return 0; }
static uint32_t  fake_Init2(void* h, void* cfg){ (void)h; (void)cfg; return 0; }
/* ── 假 EEPROM（預設關；說明見 shim/windows.h）─────────────────────────────── */
int  dgh_fake_eeprom = 0;
int  dgh_fake_page   = 0;
int  dgh_fake_awid   = 2;
int  dgh_fake_wraps  = 0;
unsigned long dgh_fake_addr = 0;
unsigned char dgh_fake_mem[65536];
void dgh_fake_eeprom_reset(int page, int awid, unsigned char fill){
    memset(dgh_fake_mem,fill,sizeof(dgh_fake_mem));
    dgh_fake_page=page; dgh_fake_awid=awid; dgh_fake_wraps=0; dgh_fake_addr=0;
    dgh_fake_eeprom=1;
}
/* frame ＝ offset bytes（MSB first）＋ data。n==awid 的那一則是**位址相位**
   （讀取前的 OPT_READ_ADDR），只移動位址指標、不寫入。 */
static void fake_eeprom_write(uint32_t n, const unsigned char* b){
    int aw = dgh_fake_awid, i;
    unsigned long a = 0;
    if((int)n < aw) return;                       /* 連位址都不完整：忽略（真裝置會 NACK） */
    for(i=0;i<aw;i++) a = (a<<8) | b[i];
    dgh_fake_addr = a & 0xFFFFu;
    for(i=aw;i<(int)n;i++){
        unsigned long off = (unsigned long)(i-aw);
        unsigned long ea;
        if(dgh_fake_page>0){
            unsigned long pg = (unsigned long)dgh_fake_page;
            unsigned long pbase = (dgh_fake_addr/pg)*pg;
            unsigned long within = (dgh_fake_addr%pg) + off;
            if(within>=pg){ dgh_fake_wraps++; }   /* 🔴 跨頁 ⇒ 回捲（真 EEPROM 的行為） */
            ea = pbase + (within % pg);
        } else {
            ea = (dgh_fake_addr + off) & 0xFFFFu;
        }
        dgh_fake_mem[ea & 0xFFFFu] = b[i];
    }
    /* 寫入結束後，真裝置的位址指標停在最後寫進去的那一格之後（頁內）。
       我們用得到的只有「讀取前的位址相位」，所以這裡不再動它。 */
}
/* 1.19.0：兩條路（治具／AUX）的硬體交易紀錄＋重疊偵測（test_server_simul.c 用）。
   每筆寫入記一個字母：J＝治具、A＝AUX；`dgh_fake_inflight` 進入時 >0 ⇒ 兩筆交易重疊（必須永遠 0）。
   `dgh_fake_xact_us` ＞ 0 ⇒ 每筆寫入故意拖這麼久，把「交錯」的窗口撐大。 */
char dgh_fake_trace[4096]; int dgh_fake_trace_len = 0;
int  dgh_fake_inflight = 0, dgh_fake_overlaps = 0, dgh_fake_xact_us = 0;
void dgh_fake_trace_reset(void){ dgh_fake_trace_len=0; dgh_fake_trace[0]=0; dgh_fake_overlaps=0; dgh_fake_inflight=0; }
static void fx_enter(char tag){
    if(dgh_fake_inflight>0) dgh_fake_overlaps++;
    dgh_fake_inflight++;
    if(dgh_fake_trace_len < (int)sizeof(dgh_fake_trace)-1){ dgh_fake_trace[dgh_fake_trace_len++]=tag; dgh_fake_trace[dgh_fake_trace_len]=0; }
    if(dgh_fake_xact_us>0){ struct timespec ts={0,(long)dgh_fake_xact_us*1000L}; nanosleep(&ts,NULL); }
}
static void fx_leave(void){ dgh_fake_inflight--; }
static uint32_t  fake_Write(void* h, uint32_t a, uint32_t n, unsigned char* b, uint32_t* t, uint32_t o){
    (void)h;(void)a; fx_enter('J'); fx_leave(); dgh_fake_writes++; dgh_fake_last_write_opts=o;
    dgh_fake_last_write_len = (int)(n>sizeof(dgh_fake_last_write)?sizeof(dgh_fake_last_write):n);
    memcpy(dgh_fake_last_write,b,(size_t)dgh_fake_last_write_len);
    if(dgh_fake_eeprom && dgh_fake_write_status==0) fake_eeprom_write(n,b);
    if(t)*t=n; return dgh_fake_write_status; }
/* 1.17.0：`chandiag` 的位址掃描測試用。≥0 ⇒ 只有這個 7-bit 位址回 ACK，其他位址
   模擬 NACK（回 FT_DEVICE_NOT_FOUND＝2、0 byte）。預設 -1 ＝ 舊行為（全部成功）。 */
int dgh_fake_ack_addr = -1;
static uint32_t  fake_Read(void* h, uint32_t a, uint32_t n, unsigned char* b, uint32_t* t, uint32_t o){
    (void)h; dgh_fake_reads++; dgh_fake_last_read_opts=o;
    if(dgh_fake_ack_addr >= 0 && a != (uint32_t)dgh_fake_ack_addr){ if(t)*t=0; return 2; }
    if(dgh_fake_eeprom){
        /* 循序讀：位址一路往前（**沒有** page 的概念，只有整顆容量的回捲）。 */
        for(uint32_t i=0;i<n;i++) b[i]=dgh_fake_mem[(dgh_fake_addr+i)&0xFFFFu];
        dgh_fake_addr=(dgh_fake_addr+n)&0xFFFFu;
    } else {
        for(uint32_t i=0;i<n;i++) b[i]=(unsigned char)(0xA0+i);
    }
    if(t)*t=n; return dgh_fake_read_status; }
static uint32_t  fake_ChanInfo(uint32_t i, void* node){ (void)i; (void)node; return 0; }

HMODULE LoadLibraryA(const char* path){
    if(!path) return NULL;
    /* i2c_bridge.c 組出來的是 Windows 風格路徑（反斜線），先正規化再 stat */
    char p[MAX_PATH*2]; snprintf(p,sizeof(p),"%s",path);
    for(char* q=p; *q; q++) if(*q=='\\') *q='/';
    const char* base = strrchr(p,'/'); base = base?base+1:p;
    int isAux = (strcmp(base,"DLL_AUX_VC.dll")==0);
    if(strcmp(base,"libMPSSE.dll")!=0 && !isAux) return NULL;
    struct stat st; if(stat(p,&st)!=0) return NULL;
    return isAux ? (HMODULE)(intptr_t)0x11D : (HMODULE)(intptr_t)0x11B;
}
/* 1.15.1 的高解析度計時器假實作定義在本檔最後（它要用 clock_gettime），
   這裡先宣告，GetProcAddress 才交得出指標。 */
static void* shim_CreateWaitableTimerExW(void* sec, const void* name,
                                         unsigned long flags, unsigned long access);
static int   shim_SetWaitableTimer(void* h, const LARGE_INTEGER* due, long period,
                                   void* apc, void* arg, int resume);
static void* shim_aux_proc(const char* name);
void* GetProcAddress(HMODULE m, const char* name){
    if(!m) return NULL;
    if(m==(HMODULE)(intptr_t)0x11C){                     /* kernel32.dll */
        if(!strcmp(name,"CreateWaitableTimerExW")) return (void*)shim_CreateWaitableTimerExW;
        if(!strcmp(name,"SetWaitableTimer"))       return (void*)shim_SetWaitableTimer;
        return NULL;
    }
    if(m==(HMODULE)(intptr_t)0x11D) return shim_aux_proc(name);   /* DLL_AUX_VC.dll */
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
    (void)m; snprintf(buf,cap,"%si2c-aux-bridge.exe",g_shim_exe_dir);
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
/* 🔴 1.15.1：GetLastError 從「永遠 0」改成回報最後一次失敗的原因。
   出貨程式碼會把 CreateWaitableTimerExW 失敗的 GetLastError 印進 log —— 永遠 0
   的話那句話就是假的，而假的診斷比沒有診斷更糟（這一輪的主題就是這件事）。 */
DWORD g_shim_lasterr = 0;
DWORD GetLastError(void){ return g_shim_lasterr; }
HANDLE FindFirstFileA(const char* pat, WIN32_FIND_DATAA* fd){ (void)pat; (void)fd; return INVALID_HANDLE_VALUE; }
BOOL   FindNextFileA(HANDLE h, WIN32_FIND_DATAA* fd){ (void)h; (void)fd; return 0; }
BOOL   FindClose(HANDLE h){ (void)h; return 1; }
LONG RegOpenKeyExA(HKEY a, const char* b, DWORD c, REGSAM d, HKEY* e){ (void)a;(void)b;(void)c;(void)d;(void)e; return 1; }
LONG RegEnumKeyExA(HKEY a, DWORD b, char* c, DWORD* d, void* e, void* f, void* g, void* h){
    (void)a;(void)b;(void)c;(void)d;(void)e;(void)f;(void)g;(void)h; return 1; }
LONG RegQueryValueExA(HKEY a, const char* b, void* c, DWORD* d, BYTE* e, DWORD* f){
    (void)a;(void)b;(void)c;(void)d;(void)e;(void)f; return 1; }
LONG RegCloseKey(HKEY k){ (void)k; return 0; }
/* 🔴 1.15.1：kernel32 要給得出 handle，否則 wait_backend_init() 連
   GetProcAddress 都走不到，測試就永遠只驗到退回 Sleep 的那條路。 */
HMODULE GetModuleHandleA(const char* n){
    if(n && (strcmp(n,"kernel32.dll")==0 || strcmp(n,"KERNEL32.dll")==0))
        return (HMODULE)(intptr_t)0x11C;
    return NULL;
}
HINSTANCE ShellExecuteA(void* h, const char* op, const char* file, const char* par, const char* dir, int show){
    (void)h;(void)op;(void)par;(void)dir;(void)show;
    dgh_shim_browser_opened++;
    snprintf(dgh_shim_browser_url,sizeof(dgh_shim_browser_url),"%s",file?file:"");
    return (HINSTANCE)(intptr_t)100;
}
BOOL SetConsoleOutputCP(unsigned cp){ (void)cp; return 1; }
BOOL SetConsoleTitleA(const char* t){ (void)t; return 1; }

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

/* ── 高解析度計時（見 shim/windows.h 的說明）──────────────────────────────── */
#include <time.h>
BOOL QueryPerformanceFrequency(LARGE_INTEGER* f){ if(f) f->QuadPart = 1000000000LL; return 1; }
BOOL QueryPerformanceCounter(LARGE_INTEGER* c){
    struct timespec ts; clock_gettime(CLOCK_MONOTONIC, &ts);
    if(c) c->QuadPart = (long long)ts.tv_sec * 1000000000LL + ts.tv_nsec;
    return 1;
}
DWORD GetTickCount(void){
    struct timespec ts; clock_gettime(CLOCK_MONOTONIC, &ts);
    return (DWORD)(ts.tv_sec * 1000 + ts.tv_nsec / 1000000);
}
/* ── 🔴 Sleep：可選的「Windows 排程器 tick 量化」模擬（1.15.1）────────────────
   Windows 的 `Sleep(n)` 會被進位到下一個排程器 tick，所以粒度粗的機器上
   `Sleep(5)` 會變成 11~16 ms（Bruce 2026-09-20 的實機 log：要求 5，實際 11.2）。
   `dgh_shim_sleep_tick_ms` 預設 0 ＝ **不量化 ＝ 既有測試行為完全不變**。 */
double dgh_shim_sleep_tick_ms = 0.0;
int    dgh_shim_sleep_calls   = 0;
static void shim_nanosleep_ms(double ms){
    struct timespec t;
    if(ms<=0.0) return;
    t.tv_sec  = (time_t)(ms/1000.0);
    t.tv_nsec = (long)((ms - (double)t.tv_sec*1000.0)*1000000.0);
    if(t.tv_nsec<0) t.tv_nsec=0;
    if(t.tv_nsec>999999999L) t.tv_nsec=999999999L;
    nanosleep(&t, NULL);
}
void Sleep(DWORD ms){
    double want=(double)ms;
    dgh_shim_sleep_calls++;
    if(dgh_shim_sleep_tick_ms>0.0){
        /* 進位到下一個 tick（Windows 的行為：只會等得比要求久，不會短）。 */
        double tick=dgh_shim_sleep_tick_ms;
        double k=want/tick;
        long   up=(long)k; if((double)up<k) up++;
        if(up<1) up=1;
        want=(double)up*tick;
    }
    shim_nanosleep_ms(want);
}

/* ── 🔴 高解析度可等待計時器（見 shim/windows.h 的說明）─────────────────────
   只支援一個計時器（出貨程式碼也只開一個）。到期時間存絕對的 monotonic 毫秒。 */
int    dgh_shim_hires_timer = 1;
int    dgh_shim_timer_waits = 0;
#define SHIM_TIMER_HANDLE ((HANDLE)(intptr_t)0x71E)
static double shim_now_ms(void){
    struct timespec ts; clock_gettime(CLOCK_MONOTONIC,&ts);
    return (double)ts.tv_sec*1000.0 + (double)ts.tv_nsec/1000000.0;
}
static double g_shim_timer_due = 0.0;
static int    g_shim_timer_armed = 0;
static void* shim_CreateWaitableTimerExW(void* sec, const void* name,
                                         unsigned long flags, unsigned long access){
    (void)sec; (void)name; (void)access;
    if(!dgh_shim_hires_timer){ g_shim_lasterr = 87; return NULL; }   /* ERROR_INVALID_PARAMETER */
    /* 出貨程式碼必須帶 CREATE_WAITABLE_TIMER_HIGH_RESOLUTION（0x2）；沒帶就不是
       我們要的那條路，讓它失敗，免得測試以為驗過了。 */
    if(!(flags & 0x2u)){ g_shim_lasterr = 87; return NULL; }
    return SHIM_TIMER_HANDLE;
}
static int shim_SetWaitableTimer(void* h, const LARGE_INTEGER* due, long period,
                                 void* apc, void* arg, int resume){
    (void)period; (void)apc; (void)arg; (void)resume;
    if(h!=SHIM_TIMER_HANDLE || !due) return 0;
    /* 負值 ＝ 相對時間，單位 100 ns（Windows 語意）。正值在真實 Windows 上是
       絕對 UTC 檔案時間 —— 這裡只支援相對值，因為出貨程式碼只用相對值；
       若哪天改成正值，這裡會回 0（設定失敗），呼叫端會退回 Sleep 而不是少等。 */
    if(due->QuadPart >= 0) return 0;
    g_shim_timer_due = shim_now_ms() + ((double)(-due->QuadPart))/10000.0;
    g_shim_timer_armed = 1;
    return 1;
}
DWORD WaitForSingleObject(HANDLE h, DWORD ms){
    double deadline;
    dgh_shim_timer_waits++;
    if(h!=SHIM_TIMER_HANDLE || !g_shim_timer_armed) return 0;
    deadline = g_shim_timer_due;
    {   /* 逾時上限照 Windows 語意處理（以較早者為準） */
        double cap = shim_now_ms() + (double)ms;
        if(ms!=0xFFFFFFFFu && cap < deadline) deadline = cap;
    }
    for(;;){
        double left = deadline - shim_now_ms();
        if(left<=0.0) break;
        shim_nanosleep_ms(left);
    }
    g_shim_timer_armed = 0;
    return 0;                                  /* WAIT_OBJECT_0 */
}
BOOL CloseHandle(HANDLE h){ (void)h; g_shim_timer_armed=0; return 1; }

/* ── 1.18.0：假 DLL_AUX_VC.dll（說明見 shim/windows.h）────────────────────── */
#include "../i2c_bridge_aux.h"
int  dgh_shim_is_admin = 1;
char dgh_shim_adapter[128] = "Intel(R) Iris(R) Xe Graphics";
int  dgh_fake_aux_ok_monitor = 2;
int  dgh_fake_aux_ok_mask = 0;      /* 1.21.0：非 0 ⇒ bit m＝monitor m 的 Initial 回 0（多台螢幕） */
int  dgh_fake_aux_tcon_monitor = -1; /* 1.21.0：≥0 ⇒ 只有這台的 DPCD 0x430 寫得進去（其餘＝別台 DP 螢幕） */
static int fa_cur_mon = -1;
int  dgh_fake_aux_init_calls = 0, dgh_fake_aux_release_calls = 0, dgh_fake_aux_last_card = -1, dgh_fake_aux_last_proj = -1;
int  dgh_fake_aux_ee_hits = 0, dgh_fake_aux_dpcd_writes = 0, dgh_fake_aux_i2c_writes = 0, dgh_fake_aux_fail_writes = 0;
int  dgh_fake_aux_psr_sup = 1, dgh_fake_aux_psr_on = 1, dgh_fake_aux_psr_sets = 0;
unsigned char dgh_fake_aux_r3e[65536], dgh_fake_aux_r7c[256], dgh_fake_aux_r7d[65536], dgh_fake_aux_r7e[256];
unsigned char dgh_fake_aux_dpcd[0x1000], dgh_fake_aux_mcu[65536];
static unsigned fa_ptr7d = 0, fa_ptr7e = 0;
void dgh_fake_aux_reset(void){
    memset(dgh_fake_aux_r3e,0,sizeof(dgh_fake_aux_r3e)); memset(dgh_fake_aux_r7c,0,sizeof(dgh_fake_aux_r7c));
    memset(dgh_fake_aux_r7d,0,sizeof(dgh_fake_aux_r7d)); memset(dgh_fake_aux_r7e,0,sizeof(dgh_fake_aux_r7e));
    memset(dgh_fake_aux_dpcd,0,sizeof(dgh_fake_aux_dpcd)); memset(dgh_fake_aux_mcu,0,sizeof(dgh_fake_aux_mcu));
    dgh_fake_aux_ee_hits=0; dgh_fake_aux_dpcd_writes=0; dgh_fake_aux_i2c_writes=0; dgh_fake_aux_fail_writes=0;
    dgh_fake_aux_psr_sup=1; dgh_fake_aux_psr_on=1; dgh_fake_aux_psr_sets=0;
    dgh_fake_aux_init_calls=0; dgh_fake_aux_release_calls=0;
    dgh_fake_aux_7d_needs_mbus=0; dgh_fake_aux_ioa_reads=0; dgh_fake_aux_ioa_writes=0; dgh_fake_aux_7e_cd=0;
    fa_ptr7d=0; fa_ptr7e=0;
}
BOOL EnumDisplayDevicesA(const char* dev, DWORD i, DISPLAY_DEVICEA* dd, DWORD flags){
    (void)dev; (void)flags;
    if(i!=0 || !dgh_shim_adapter[0] || !dd) return 0;
    snprintf(dd->DeviceString,sizeof(dd->DeviceString),"%s",dgh_shim_adapter);
    snprintf(dd->DeviceName,sizeof(dd->DeviceName),"\\\\.\\DISPLAY1");
    dd->StateFlags = 1; return 1;
}
static unsigned fa_ptr(void){ return ((unsigned)dgh_fake_aux_dpcd[0x430]<<8) | dgh_fake_aux_dpcd[0x431]; }
static unsigned char fa_Initial(unsigned char* c, unsigned char* m, unsigned char* p){
    dgh_fake_aux_init_calls++; dgh_fake_aux_last_card=*c; dgh_fake_aux_last_proj=*p;
    fa_cur_mon = *m;
    if(dgh_fake_aux_ok_mask) return ((dgh_fake_aux_ok_mask >> *m) & 1) ? 0x00 : 0xFF;
    return (*m == (unsigned char)dgh_fake_aux_ok_monitor) ? 0x00 : 0xFF; }
static void fa_Release(void){ dgh_fake_aux_release_calls++; }
static int  fa_GetInitialState(void){ return 1; }
static unsigned char fa_GetGraphCard(void){ return (unsigned char)dgh_fake_aux_last_card; }
static unsigned char fa_GetPsr(DGH_AUX_PSR* s){ s->iResult=0; s->u8Supported=(unsigned char)dgh_fake_aux_psr_sup; s->u8Enabled=(unsigned char)dgh_fake_aux_psr_on; s->strMsg=NULL; return 0; }
static unsigned char fa_SetPsr(DGH_AUX_PSR* s){ dgh_fake_aux_psr_sets++; if(dgh_fake_aux_psr_sup) dgh_fake_aux_psr_on=s->u8Enabled?1:0; s->iResult=0; return 0; }
static int fa_DpcdRead(int n, int a, unsigned char* d){
    int i; if(a<0||a+n>0x1000) return 0;
    for(i=0;i<n;i++){
        int x=a+i;
        if(x==0x435) d[i]=dgh_fake_aux_r3e[fa_ptr()];
        else if(x==0x434) d[i]=dgh_fake_aux_r7c[dgh_fake_aux_dpcd[0x431]];
        else if(x==0x436) d[i]=dgh_fake_aux_mcu[fa_ptr()];
        else d[i]=dgh_fake_aux_dpcd[x];
    }
    return 1; }
static int fa_DpcdWrite(int n, int a, unsigned char* d){
    int i; fx_enter('A'); fx_leave(); if(dgh_fake_aux_fail_writes) return 0;
    if(dgh_fake_aux_tcon_monitor>=0 && fa_cur_mon!=dgh_fake_aux_tcon_monitor && a>=0x430 && a<=0x4FF) return 0;   /* 別台螢幕：瑞鼎 DPCD 視窗寫不進去 */
    if(a<0||a+n>0x1000) return 0;
    dgh_fake_aux_dpcd_writes++;
    for(i=0;i<n;i++){
        int x=a+i;
        if(x==0x435) dgh_fake_aux_r3e[fa_ptr()]=d[i];
        else if(x==0x434) dgh_fake_aux_r7c[dgh_fake_aux_dpcd[0x431]]=d[i];
        else if(x==0x436) dgh_fake_aux_mcu[fa_ptr()]=d[i];
        else dgh_fake_aux_dpcd[x]=d[i];
    }
    return 1; }
static int fa_mbus_ok(void);
static int fa_I2cWrite(int n, int slave, unsigned char* d, int mot){
    (void)mot;
    fx_enter('A'); fx_leave();
    if(dgh_fake_aux_fail_writes) return 0;
    if((slave>=0x50 && slave<=0x57) || slave==0x10){ dgh_fake_aux_ee_hits++; return 1; }   /* 0x10＝Intel 改址後的 EEPROM（Tcon81008.cs:300） */
    dgh_fake_aux_i2c_writes++;
    if(slave==0x7D){ int i; if(n<2) return 0; fa_ptr7d=((unsigned)d[0]<<8)|d[1];
        for(i=2;i<n;i++) dgh_fake_aux_r7d[(fa_ptr7d+(unsigned)(i-2))&0xFFFF]=d[i]; return 1; }
    if(slave==0x7E){ int i; if(n<1) return 0; fa_ptr7e=d[0]; if(n>=2 && d[0]==0xAB && d[1]==0xCD) dgh_fake_aux_7e_cd++;
        for(i=1;i<n;i++) dgh_fake_aux_r7e[(fa_ptr7e+(unsigned)(i-1))&0xFF]=d[i]; return 1; }
    return 0; /* NACK */ }
static int fa_I2cRead(int n, int slave, unsigned char* d, int mot){
    int i; (void)mot;
    if((slave>=0x50 && slave<=0x57) || slave==0x10){ dgh_fake_aux_ee_hits++; for(i=0;i<n;i++) d[i]=0xEE; return 1; }
    if(slave==0x7D){ if(!fa_mbus_ok()) return 0; for(i=0;i<n;i++) d[i]=dgh_fake_aux_r7d[(fa_ptr7d+(unsigned)i)&0xFFFF]; return 1; }
    if(slave==0x7E){ for(i=0;i<n;i++) d[i]=dgh_fake_aux_r7e[(fa_ptr7e+(unsigned)i)&0xFF]; return 1; }
    return 0; }
/* 1.22.0：IOA_Read／IOA_Write（AMD）＋「7D 要先 M-Bus 導通」的模型 */
int dgh_fake_aux_7d_needs_mbus = 0, dgh_fake_aux_ioa_reads = 0, dgh_fake_aux_ioa_writes = 0, dgh_fake_aux_7e_cd = 0;
static int fa_mbus_ok(void){ return !dgh_fake_aux_7d_needs_mbus || (dgh_fake_aux_r7e[0xAB]==0xCD && (dgh_fake_aux_r7c[0x0F]&0x80)); }
static unsigned char fa_IoaRead(DGH_AUX_IOA* st, unsigned char* d){
    int i, n = st->u8BytePerRead ? st->u8BytePerRead : 1; unsigned off = st->u16StartAddr;
    fx_enter('A'); fx_leave(); dgh_fake_aux_ioa_reads++;
    if(st->u8SlaveAddr>=0x50 && st->u8SlaveAddr<=0x57){ dgh_fake_aux_ee_hits++; for(i=0;i<n;i++) d[i]=0xEE; return 1; }
    if(st->u8SlaveAddr==0x7D){ if(!fa_mbus_ok()) return 0; for(i=0;i<n;i++) d[i]=dgh_fake_aux_r7d[(off+(unsigned)i)&0xFFFF]; return 1; }
    if(st->u8SlaveAddr==0x7E){ for(i=0;i<n;i++) d[i]=dgh_fake_aux_r7e[(off+(unsigned)i)&0xFF]; return 1; }
    return 0; }
static unsigned char fa_IoaWrite(DGH_AUX_IOA* st, unsigned char* d){
    fx_enter('A'); fx_leave(); dgh_fake_aux_ioa_writes++;
    if(dgh_fake_aux_fail_writes) return 0;
    if(st->u8SlaveAddr>=0x50 && st->u8SlaveAddr<=0x57){ dgh_fake_aux_ee_hits++; return 1; }
    if(st->u8SlaveAddr==0x7E){ dgh_fake_aux_r7e[st->u16StartAddr & 0xFF] = d[0]; if((st->u16StartAddr&0xFF)==0xAB && d[0]==0xCD) dgh_fake_aux_7e_cd++; return 1; }
    if(st->u8SlaveAddr==0x7D){ dgh_fake_aux_r7d[st->u16StartAddr] = d[0]; return 1; }
    return 0; }
static void fa_FreeString(void* p){ (void)p; }
static void* shim_aux_proc(const char* name){
    if(!strcmp(name,"Initial")) return (void*)fa_Initial;
    if(!strcmp(name,"Release")) return (void*)fa_Release;
    if(!strcmp(name,"Get_InitialState")) return (void*)fa_GetInitialState;
    if(!strcmp(name,"Get_GraphCard")) return (void*)fa_GetGraphCard;
    if(!strcmp(name,"Get_PSR_State")) return (void*)fa_GetPsr;
    if(!strcmp(name,"Set_PSR_State")) return (void*)fa_SetPsr;
    if(!strcmp(name,"DPCD_Read")) return (void*)fa_DpcdRead;
    if(!strcmp(name,"DPCD_Write")) return (void*)fa_DpcdWrite;
    if(!strcmp(name,"I2C_Read")) return (void*)fa_I2cRead;
    if(!strcmp(name,"I2C_Write")) return (void*)fa_I2cWrite;
    if(!strcmp(name,"FreeString")) return (void*)fa_FreeString;
    if(!strcmp(name,"IOA_Read")) return (void*)fa_IoaRead;
    if(!strcmp(name,"IOA_Write")) return (void*)fa_IoaWrite;
    return NULL;
}
