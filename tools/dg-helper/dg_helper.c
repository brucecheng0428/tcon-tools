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

/* ---- write address whitelist (ptg bank) ----
 * 🔴 SCOPE: this whitelist guards the **dg-measure** flow only, i.e. the
 *    `write` command. It exists so a mis-click on a NB cannot poke arbitrary
 *    registers during a gamma run. It is NOT a general security boundary and
 *    deliberately does NOT apply to `rawwrite` (the I2C test tool), whose whole
 *    purpose is to read/write anywhere. `rawwrite` is logged in full instead.  */
#define WR_ADDR_MIN 0x1200u
#define WR_ADDR_MAX 0x12FFu

/* ---- register-offset width (proto 2) ----
 * The offset (a.k.a. sub-address / register address) sent before the data
 * phase. 2 bytes is what the TCON uses and stays the default, so every proto-1
 * caller (dg-measure) keeps the exact same wire bytes.
 *   0 -> send no offset at all = I2C "current address read" (a legal mode:
 *        the device keeps its own address pointer and returns from there)
 *   1 / 2 / 4 -> that many offset bytes, MSB first.                            */
#define AWID_DEFAULT 2u
#define RAW_MAX_DATA 256              /* bytes per rawwrite */

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
static int  g_dllFound = 0;          /* libMPSSE.dll FILE existed somewhere (even if load failed) */
static int  g_dllDepMissing = 0;     /* file existed but LoadLibrary failed with MOD_NOT_FOUND (ftd2xx?) */
static char g_jigState = 'J';        /* 'J' none, 'U' found-but-open-failed, 'K' ok */
static int  g_browserOk = 0;
static int  g_bindOk = 0;
static int  g_runningFromTemp = 0;   /* exe is executing from a temp/extraction dir -> T */

static void exe_dir(char* out, int cap) {
    char exe[MAX_PATH]; GetModuleFileNameA(NULL, exe, sizeof(exe));
    char* slash = strrchr(exe, '\\'); if (slash) *(slash + 1) = 0; else exe[0] = 0;
    snprintf(out, cap, "%s", exe);
}
/* Detect running from a temp / archive-preview extraction folder. The classic
   trap: double-clicking the exe INSIDE the zip preview makes Windows extract
   only the exe to %TEMP% and run it there -> the bundled libMPSSE.dll stays in
   the archive -> "not found" (which we must NOT report as plain D). */
static void detect_temp_dir(void) {
    char lower[MAX_PATH]; snprintf(lower, sizeof(lower), "%s", g_exeDir);
    for (char* p = lower; *p; p++) if (*p >= 'A' && *p <= 'Z') *p += 32;
    char tmp[MAX_PATH]; DWORD n = GetTempPathA(sizeof(tmp), tmp);
    if (n > 0 && n < sizeof(tmp)) { for (char* p = tmp; *p; p++) if (*p >= 'A' && *p <= 'Z') *p += 32;
        if (strstr(lower, tmp) == lower) g_runningFromTemp = 1; }
    /* archive-tool extraction markers, in case %TEMP% differs */
    if (strstr(lower, "\\temp\\") || strstr(lower, "\\tmp\\") ||
        strstr(lower, "\\appdata\\local\\temp") || strstr(lower, "\\windows\\temp") ||
        strstr(lower, "rar$") || strstr(lower, "\\7z") || strstr(lower, "temp\\") ||
        strstr(lower, "\\inetcache\\") || strstr(lower, "bnz.") )
        g_runningFromTemp = 1;
}

/* ===========================================================================
 * DLL locate & load (auto only, no interactive prompt)
 * =========================================================================== */
/* normalise a dir to end with a single backslash */
static void ensure_slash(char* d) {
    int n=(int)strlen(d); if (n>0 && d[n-1]!='\\' && n<MAX_PATH-1) { d[n]='\\'; d[n+1]=0; }
}
static int dir_has_dll(const char* dir) {
    char p[MAX_PATH]; snprintf(p,sizeof(p),"%slibMPSSE.dll",dir);
    DWORD a=GetFileAttributesA(p); return (a!=INVALID_FILE_ATTRIBUTES && !(a&FILE_ATTRIBUTE_DIRECTORY));
}
static int case_contains(const char* hay, const char* needle) {
    if(!hay||!needle) return 0; size_t nl=strlen(needle);
    for(const char* p=hay; *p; p++){ size_t i=0; for(; i<nl; i++){ char a=p[i]; if(!a) return 0; char b=needle[i];
        if(a>='A'&&a<='Z') a+=32; if(b>='A'&&b<='Z') b+=32; if(a!=b) break; } if(i==nl) return 1; }
    return 0;
}
/* try ONE directory: log it, and if libMPSSE.dll is there, attempt to load it.
   returns 1 on full success (procs resolved). */
static int try_dir(const char* dirIn) {
    if (!dirIn || !dirIn[0]) return 0;
    char dir[MAX_PATH]; snprintf(dir,sizeof(dir),"%s",dirIn); ensure_slash(dir);
    if (!dir_has_dll(dir)) { logline("  search: %-60s  (no libMPSSE.dll)", dir); return 0; }
    g_dllFound = 1;
    char full[MAX_PATH]; snprintf(full,sizeof(full),"%slibMPSSE.dll",dir);
    SetDllDirectoryA(dir);                       /* so its ftd2xx.dll dependency resolves too */
    HMODULE h = LoadLibraryA(full);
    if (!h) {
        DWORD e = GetLastError();
        if (e == ERROR_MOD_NOT_FOUND /*126*/) { g_dllDepMissing = 1;
            logline("  search: %-60s  FOUND but LoadLibrary failed 126 (a dependency like ftd2xx.dll is missing next to it)", dir); }
        else logline("  search: %-60s  FOUND but LoadLibrary failed (err=%lu)", dir, e);
        return 0;
    }
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
        g_dllLoadedButBad = 1;
        logline("  search: %-60s  FOUND & loaded but I2C_* exports missing (wrong/32-64 bit mismatch)", dir);
        return 0;
    }
    snprintf(g_dllPath, sizeof(g_dllPath), "%s", full);
    logline("  search: %-60s  OK (loaded)", dir);
    return 1;
}
/* enumerate a root's immediate children; for those whose name looks like a
   Raydium/PQ/TCON folder, try that child and its immediate subfolders (so a
   "...\\Raydium\\Release V1.5.0" gets reached). Bounded: no full-disk walk. */
static int scan_keyword_root(const char* root) {
    char pat[MAX_PATH]; snprintf(pat,sizeof(pat),"%s\\*",root);
    WIN32_FIND_DATAA fd; HANDLE hf=FindFirstFileA(pat,&fd);
    if (hf==INVALID_HANDLE_VALUE) return 0;
    static const char* kw[]={"raydium","pq ","pqtool","pq_tool","pqadjust","adjustment","tcon","gamma","libmpsse",NULL};
    do {
        if (!(fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY)) continue;
        if (fd.cFileName[0]=='.') continue;
        int match=0; for(int i=0;kw[i];i++) if(case_contains(fd.cFileName,kw[i])){match=1;break;}
        if (!match) continue;
        char sub[MAX_PATH]; snprintf(sub,sizeof(sub),"%s\\%s",root,fd.cFileName);
        if (try_dir(sub)) { FindClose(hf); return 1; }
        /* one level deeper (e.g. Release V1.5.0 under it) */
        char pat2[MAX_PATH]; snprintf(pat2,sizeof(pat2),"%s\\*",sub);
        WIN32_FIND_DATAA fd2; HANDLE hf2=FindFirstFileA(pat2,&fd2);
        if (hf2!=INVALID_HANDLE_VALUE) {
            do {
                if (!(fd2.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY)) continue;
                if (fd2.cFileName[0]=='.') continue;
                char sub2[MAX_PATH]; snprintf(sub2,sizeof(sub2),"%s\\%s",sub,fd2.cFileName);
                if (try_dir(sub2)) { FindClose(hf2); FindClose(hf); return 1; }
            } while (FindNextFileA(hf2,&fd2));
            FindClose(hf2);
        }
    } while (FindNextFileA(hf,&fd));
    FindClose(hf);
    return 0;
}
/* registry Uninstall scan: find PQ Tool's InstallLocation */
static int scan_uninstall_view(HKEY hive, REGSAM view) {
    HKEY h; if (RegOpenKeyExA(hive,"SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall",0,KEY_READ|view,&h)!=ERROR_SUCCESS) return 0;
    char sub[256]; DWORD i=0, sz;
    for (;;) {
        sz=sizeof(sub); if (RegEnumKeyExA(h,i++,sub,&sz,NULL,NULL,NULL,NULL)!=ERROR_SUCCESS) break;
        HKEY k; if (RegOpenKeyExA(h,sub,0,KEY_READ|view,&k)!=ERROR_SUCCESS) continue;
        char name[512]={0}, loc[MAX_PATH]={0}; DWORD nl=sizeof(name), ll=sizeof(loc), t;
        RegQueryValueExA(k,"DisplayName",NULL,&t,(BYTE*)name,&nl);
        int match = case_contains(name,"raydium")||case_contains(name,"pq adjustment")||case_contains(name,"pq tool");
        if (match && RegQueryValueExA(k,"InstallLocation",NULL,&t,(BYTE*)loc,&ll)==ERROR_SUCCESS && loc[0]) {
            logline("  registry: \"%s\" -> %s", name, loc);
            if (try_dir(loc)) { RegCloseKey(k); RegCloseKey(h); return 1; }
            char rel[MAX_PATH]; snprintf(rel,sizeof(rel),"%s\\Release V1.5.0",loc);
            if (try_dir(rel)) { RegCloseKey(k); RegCloseKey(h); return 1; }
            if (scan_keyword_root(loc)) { RegCloseKey(k); RegCloseKey(h); return 1; }
        }
        RegCloseKey(k);
    }
    RegCloseKey(h); return 0;
}
static int locate_and_load_dll(void) {
    char buf[MAX_PATH];
    logline("Looking for libMPSSE.dll (order: env, exe dir, cwd, ini, registry, Program Files, user folders, PATH):");
    /* 1. explicit override for power users */
    if (GetEnvironmentVariableA("DG_HELPER_DLL_DIR", buf, sizeof(buf)) && buf[0] && try_dir(buf)) return 1;
    /* 2. next to the exe */
    if (try_dir(g_exeDir)) return 1;
    /* 3. current working directory */
    if (GetCurrentDirectoryA(sizeof(buf), buf) && try_dir(buf)) return 1;
    /* 4. optional dg-helper.ini (one line = folder) */
    { char ip[MAX_PATH]; snprintf(ip,sizeof(ip),"%sdg-helper.ini",g_exeDir);
      FILE* f=fopen(ip,"rb"); if(f){ if(fgets(buf,sizeof(buf),f)){ int n=(int)strlen(buf);
        while(n>0&&(buf[n-1]=='\n'||buf[n-1]=='\r'||buf[n-1]==' ')) buf[--n]=0;
        if(buf[0] && try_dir(buf)){ fclose(f); return 1; } } fclose(f); } }
    /* 5. registry Uninstall (both bitness views, HKLM then HKCU) */
    if (scan_uninstall_view(HKEY_LOCAL_MACHINE, KEY_WOW64_64KEY)) return 1;
    if (scan_uninstall_view(HKEY_LOCAL_MACHINE, KEY_WOW64_32KEY)) return 1;
    if (scan_uninstall_view(HKEY_CURRENT_USER,  KEY_WOW64_32KEY)) return 1;
    /* 6. Program Files / Program Files (x86): scan folders whose name looks like PQ Tool */
    { const char* envs[]={"ProgramW6432","ProgramFiles","ProgramFiles(x86)",NULL};
      for(int i=0;envs[i];i++){ if(GetEnvironmentVariableA(envs[i],buf,sizeof(buf))&&buf[0]&&scan_keyword_root(buf)) return 1; } }
    /* 7. common manual locations under the user profile */
    { char up[MAX_PATH]; if(GetEnvironmentVariableA("USERPROFILE",up,sizeof(up))&&up[0]){
        const char* subs[]={"Desktop","Downloads","Documents",NULL};
        for(int i=0;subs[i];i++){ snprintf(buf,sizeof(buf),"%s\\%s",up,subs[i]);
            if(try_dir(buf)) return 1; if(scan_keyword_root(buf)) return 1; } } }
    /* 8. every directory on PATH */
    { DWORD need=GetEnvironmentVariableA("PATH",NULL,0);
      if(need){ char* path=(char*)malloc(need+1); if(path){ GetEnvironmentVariableA("PATH",path,need+1);
        char* ctx=NULL; for(char* tok=strtok_s(path,";",&ctx); tok; tok=strtok_s(NULL,";",&ctx)) if(tok[0]&&try_dir(tok)){ free(path); return 1; }
        free(path); } } }
    /* 9. legacy relative fall-backs (kept last) */
    if (try_dir(".\\Release V1.5.0")) return 1;
    if (try_dir("..\\Release V1.5.0")) return 1;
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
    if (g_dllOk) { logline("  libMPSSE  : OK  loaded from %s", g_dllPath); return; }
    if (!g_dllFound)
        logline("  libMPSSE  : FAIL: libMPSSE.dll not found in any searched location (letter D). It ships next to this exe; if you moved the exe, copy the dll back beside it.");
    else if (g_dllDepMissing)
        logline("  libMPSSE  : FAIL: libMPSSE.dll present but LoadLibrary failed with a missing dependency (letter F). ftd2xx.dll (the FTDI D2XX driver) is not on this system. Install the FTDI driver or run PQ Tool once.");
    else
        logline("  libMPSSE  : FAIL: libMPSSE.dll present but its I2C_* exports are missing (letter X). Wrong or 64-bit dll; use the 32-bit one.");
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
/* 🔴 `slave` is a **7-bit** address (0x60/0x61/0x68/0x69 from the web, straight
   from PQ Tool's 96/97/104/105). libMPSSE's deviceAddress takes 7-bit and adds
   the R/W bit itself. **DO NOT left-shift `slave` here** — shifting turns 0x68
   into 0xD0 and libMPSSE would then shift again. The 7-bit vs 8-bit forms are
   different values for the same device; this layer is 7-bit, end to end. */
/* Build the offset bytes. Returns the byte count, or -1 for an illegal width.
   Pure function -> covered by test_proto.c (see dgh_build_offset). */
static int build_offset(uint8_t* ab, uint32_t addr, uint32_t awid){
    return dgh_build_offset(ab, addr, awid);
}
/* awid: 0/1/2/4. awid==0 -> current-address read (no address phase at all). */
static FT_STATUS i2c_read_ex(uint32_t slave, uint32_t addr, uint32_t awid, uint32_t len, uint8_t* out, uint32_t* got){
    uint8_t ab[4]; int n=build_offset(ab,addr,awid);
    if(n<0) return 0xFFFFFFFEu;
    if(n>0){ uint32_t tr=0; p_Write(g_handle, slave, (uint32_t)n, ab, &tr, OPT_READ_ADDR); }  /* slave is 7-bit, no <<1 */
    return p_Read(g_handle, slave, len, out, got, OPT_READ_DATA);   /* slave is 7-bit, no <<1 */
}
static FT_STATUS i2c_write_ex(uint32_t slave, uint32_t addr, uint32_t awid, const uint8_t* data, int dlen, uint32_t* got){
    uint8_t buf[RAW_MAX_DATA+4];
    if(dlen<0||dlen>RAW_MAX_DATA) return 0xFFFFFFFFu;
    int fl=dgh_build_write_frame(buf,(int)sizeof(buf),addr,awid,data,dlen);
    if(fl<0) return 0xFFFFFFFFu;
    uint32_t tr=0; FT_STATUS s=p_Write(g_handle, slave, (uint32_t)fl, buf, &tr, OPT_WRITE);   /* slave is 7-bit, no <<1 */
    if(got)*got=tr; return s;
}
/* proto-1 shapes, kept so the dg-measure path is byte-for-byte what it was */
static FT_STATUS i2c_write(uint32_t slave, uint32_t addr, const uint8_t* data, int dlen, uint32_t* got){
    if(dlen<0||dlen>60) return 0xFFFFFFFFu;
    return i2c_write_ex(slave, addr, AWID_DEFAULT, data, dlen, got);
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
/* ═══════════════════════════════════════════════════════════════════════════
 * client 表與 I2C channel 的擁有權（v1.5.0）
 * ---------------------------------------------------------------------------
 * 🔴 為什麼要有這一節（Bruce 2026-09-18 回報「helper 一按下就被 dg 的網頁佔住」）：
 *    v1.4.x 的伺服迴圈是**單連線阻塞式** —— accept 一個連線就進 serve_ws，
 *    卡在 recv 迴圈直到對方斷線。所以只要 dg-measure 的 WebSocket 還開著，
 *    helper 連「把 i2c.html 這個檔案送出去」都做不到（HTTP 請求卡在 backlog），
 *    使用者看到的就是「另一頁打不開＝被佔住」。
 *    真正的修法有兩層，缺一不可：
 *      ① 連線模型：改用 select() 多路複用，任何時候都還能 accept 新連線
 *      ② 資源模型：I2C channel 同時只有一個 client 持有，而且**講出來**
 *         （busy 要回一個明確的錯誤型別，並讓對方可以主動「接手」）
 * ========================================================================== */
#define MAX_CLIENTS 8
typedef struct { SOCKET s; int used; int isWs; } Client;
static Client g_cl[MAX_CLIENTS];
static int    g_ownerIdx = -1;      /* 持有 I2C channel 的 client；-1＝沒人 */

static int cl_add(SOCKET s){
    for(int i=0;i<MAX_CLIENTS;i++) if(!g_cl[i].used){
        g_cl[i].s=s; g_cl[i].used=1; g_cl[i].isWs=0; return i; }
    return -1;
}
/* 丟掉一個 client。🔴 它若是持有者就**一定**要放掉 I2C channel ——
   不放的話 helper 會一直握著治具，下一個頁面（與原廠 PQ Tool）都開不起來。 */
static void cl_drop(int i){
    if(i<0||i>=MAX_CLIENTS||!g_cl[i].used) return;
    if(g_ownerIdx==i){
        logline("[ws] owner #%d disconnected -> releasing I2C channel", i);
        i2c_close();
        g_ownerIdx=-1;
    }
    closesocket(g_cl[i].s);
    g_cl[i].used=0; g_cl[i].isWs=0; g_cl[i].s=INVALID_SOCKET;
}

static void handle_command(int idx, const char* json){
    SOCKET c=g_cl[idx].s;
    char type[24]={0}; if(!dgh_json_type(json,type,sizeof(type))) return;
    long id=dgh_json_int(json,"id",0);
    char rep[8192];
    if(strcmp(type,"open")==0){
        uint32_t hz=(uint32_t)dgh_json_int(json,"clockHz",150000);
        /* 已經被別的頁面持有：**不靜默失敗、不靜默排隊**，回一個可判別的
           錯誤型別（busy=true），頁面據此顯示「已被另一個頁面佔用」＋接手鈕。 */
        if(g_ownerIdx>=0 && g_ownerIdx!=idx){
            int takeover=(int)dgh_json_int(json,"takeover",0);
            if(!takeover){
                snprintf(rep,sizeof(rep),
                    "{\"type\":\"result\",\"id\":%ld,\"cmd\":\"open\",\"ok\":false,\"busy\":true,"
                    "\"err\":\"I2C channel is held by another page\"}", id);
                logline("[cmd] open from #%d -> BUSY (owner is #%d)", idx, g_ownerIdx);
                ws_send_text(c,rep); return;
            }
            /* 接手：先通知舊持有者，再關掉它的連線。關連線而不是只送訊息，是因為
               既有的 dg-measure 不認得新的 `taken` 型別，但它**認得 onclose**
               （走 dgmI2cLost 這條已經測過的路），這樣兩邊都會得到正確結果。 */
            logline("[cmd] open from #%d -> TAKEOVER from #%d", idx, g_ownerIdx);
            ws_send_text(g_cl[g_ownerIdx].s,
                "{\"type\":\"taken\",\"err\":\"another page took over the I2C channel\"}");
            cl_drop(g_ownerIdx);
        }
        int ok=i2c_open(hz);
        if(ok) g_ownerIdx=idx;
        snprintf(rep,sizeof(rep),"{\"type\":\"result\",\"id\":%ld,\"cmd\":\"open\",\"ok\":%s,\"channels\":%u%s}",
                 id, ok?"true":"false", g_numChannels, g_dllOk?"":",\"err\":\"libMPSSE not loaded\"");
        logline("[cmd] open from #%d -> %s (channels=%u)", idx, ok?"OK":"FAIL", g_numChannels);
        ws_send_text(c,rep); return;
    }
    if(strcmp(type,"close")==0){
        if(g_ownerIdx==idx){ i2c_close(); g_ownerIdx=-1; logline("[cmd] close from #%d -> released", idx); }
        snprintf(rep,sizeof(rep),"{\"type\":\"result\",\"id\":%ld,\"cmd\":\"close\",\"ok\":true}",id); ws_send_text(c,rep); return; }
    /* 讀寫一律要求「你是持有者」。只看 g_opened 不夠：那樣另一個頁面會在
       不知情的狀況下操作別人開的 channel，錯得很安靜。 */
    if((strcmp(type,"read")==0||strcmp(type,"write")==0||strcmp(type,"rawwrite")==0)
       && g_ownerIdx!=idx){
        snprintf(rep,sizeof(rep),
            "{\"type\":\"result\",\"id\":%ld,\"cmd\":\"%s\",\"ok\":false,\"busy\":true,"
            "\"err\":\"this page does not hold the I2C channel\"}", id, type);
        ws_send_text(c,rep); return;
    }
    if(strcmp(type,"read")==0){
        uint32_t slave=(uint32_t)dgh_json_int(json,"slave",0x60);
        uint32_t addr=(uint32_t)dgh_json_int(json,"addr",0);
        uint32_t len=(uint32_t)dgh_json_int(json,"len",1);
        /* proto 2: optional offset width. Absent -> 2 -> identical to proto 1. */
        uint32_t awid=(uint32_t)dgh_json_int(json,"awid",(long)AWID_DEFAULT);
        if(!dgh_awid_ok(awid)){ snprintf(rep,sizeof(rep),"{\"type\":\"result\",\"id\":%ld,\"cmd\":\"read\",\"ok\":false,\"err\":\"bad awid (0/1/2/4 only)\"}",id); ws_send_text(c,rep); return; }
        if(!g_opened){ snprintf(rep,sizeof(rep),"{\"type\":\"result\",\"id\":%ld,\"cmd\":\"read\",\"ok\":false,\"err\":\"not open\"}",id); ws_send_text(c,rep); return; }
        if(len<1) len=1;
        if(len>1024) len=1024;
        uint8_t buf[1024]; uint32_t got=0; FT_STATUS st=i2c_read_ex(slave,addr,awid,len,buf,&got);
        int o=snprintf(rep,sizeof(rep),"{\"type\":\"result\",\"id\":%ld,\"cmd\":\"read\",\"ok\":%s,\"status\":%u,\"data\":[",id,(st==FT_OK)?"true":"false",st);
        for(uint32_t i=0;i<got&&o<(int)sizeof(rep)-16;i++) o+=snprintf(rep+o,sizeof(rep)-o,"%s%u",i?",":"",buf[i]);
        o+=snprintf(rep+o,sizeof(rep)-o,"]}");
        ws_send_text(c,rep); return;
    }
    /* ── rawwrite (proto 2): the I2C test tool's write ────────────────────────
       🔴 NO address whitelist on purpose. A test tool that cannot write
          everywhere is not a test tool; Bruce asked for exactly this. The
          safeguard is observability, not refusal: every rawwrite is written to
          dg-helper.log in full (slave, offset width, address, every byte). */
    if(strcmp(type,"rawwrite")==0){
        uint32_t slave=(uint32_t)dgh_json_int(json,"slave",0x60);
        uint32_t addr=(uint32_t)dgh_json_int(json,"addr",0);
        uint32_t awid=(uint32_t)dgh_json_int(json,"awid",(long)AWID_DEFAULT);
        uint8_t data[RAW_MAX_DATA];
        int dn=dgh_json_int_array(json,"data",data,sizeof(data));
        if(!dgh_awid_ok(awid)){ snprintf(rep,sizeof(rep),"{\"type\":\"result\",\"id\":%ld,\"cmd\":\"rawwrite\",\"ok\":false,\"err\":\"bad awid (0/1/2/4 only)\"}",id); ws_send_text(c,rep); return; }
        if(dn<0){ snprintf(rep,sizeof(rep),"{\"type\":\"result\",\"id\":%ld,\"cmd\":\"rawwrite\",\"ok\":false,\"err\":\"bad data (max %d bytes)\"}",id,RAW_MAX_DATA); ws_send_text(c,rep); return; }
        /* log BEFORE touching the bus, so an I2C hang still leaves the record */
        { char hex[RAW_MAX_DATA*3+8]; int ho=0;
          for(int i=0;i<dn && ho<(int)sizeof(hex)-4;i++) ho+=snprintf(hex+ho,sizeof(hex)-ho,"%s%02X",i?" ":"",data[i]);
          if(dn==0) snprintf(hex,sizeof(hex),"(none)");
          logline("[cmd] rawwrite slave=0x%02X(7-bit) awid=%u addr=0x%08X x%d bytes: %s", slave, awid, addr, dn, hex); }
        if(!g_opened){ snprintf(rep,sizeof(rep),"{\"type\":\"result\",\"id\":%ld,\"cmd\":\"rawwrite\",\"ok\":false,\"err\":\"not open\"}",id); ws_send_text(c,rep); return; }
        uint32_t got=0; FT_STATUS st=i2c_write_ex(slave,addr,awid,data,dn,&got);
        logline("        -> FT status %u, transferred %u", st, got);
        snprintf(rep,sizeof(rep),"{\"type\":\"result\",\"id\":%ld,\"cmd\":\"rawwrite\",\"ok\":%s,\"status\":%u,\"transferred\":%u}",id,(st==FT_OK)?"true":"false",st,got);
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
/* 只做握手，**不再進 recv 迴圈**（迴圈搬到 main 的 select 那裡）。
   🔴 v1.4.x 就是因為這個函式一路阻塞到對方斷線，helper 在 dg 連著的時候
      連第二個 HTTP 請求都 accept 不到。回傳 1＝升級成功。 */
static int ws_upgrade(SOCKET c, const char* req){
    const char* k=strstr(req,"Sec-WebSocket-Key:"); if(!k) k=strstr(req,"sec-websocket-key:");
    if(!k){ const char* r="HTTP/1.1 400 Bad Request\r\n\r\n"; send_all(c,r,(int)strlen(r)); return 0; }
    k+=18; while(*k==' ') k++;
    char key[128]; int i=0; while(*k&&*k!='\r'&&*k!='\n'&&i<100) key[i++]=*k++; key[i]=0;
    if(!dgh_origin_allowed(req)){ const char* r="HTTP/1.1 403 Forbidden\r\n\r\norigin not allowed"; send_all(c,r,(int)strlen(r)); logline("[ws] refused: origin not allowed"); return 0; }
    char acc[64]; dgh_ws_accept(key,acc);
    char resp[256]; snprintf(resp,sizeof(resp),"HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: %s\r\n\r\n",acc);
    if(!send_all(c,resp,(int)strlen(resp))) return 0;
    char hello[200]; snprintf(hello,sizeof(hello),
        "{\"type\":\"hello\",\"helper\":\"%s\",\"proto\":%d,\"dll\":%s,\"busy\":%s}",
        DG_HELPER_VERSION,DG_HELPER_PROTO,g_dllOk?"true":"false", (g_ownerIdx>=0)?"true":"false");
    ws_send_text(c,hello);
    return 1;
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
static void serve_404(SOCKET c, const char* what){
    char body[512]; int bl=snprintf(body,sizeof(body),
        "<!doctype html><meta charset=utf-8><title>404</title>"
        "<body style='font-family:sans-serif;background:#0f172a;color:#e2e8f0;padding:2em'>"
        "<h2>404 — not served</h2><p>%s</p>"
        "<p>Only files sitting next to dg-helper.exe are served (no sub-folders).</p></body>", what);
    char hdr[256]; int hl=snprintf(hdr,sizeof(hdr),
        "HTTP/1.1 404 Not Found\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: %d\r\nConnection: close\r\n\r\n", bl);
    send_all(c,hdr,hl); send_all(c,body,bl);
}
/* ── v1.4.0: serve the whole folder, not one hard-coded page ──────────────────
   Before, EVERY non-WebSocket request got dg-measure.html back, so a second
   tool page simply could not be reached through the helper — and the helper is
   the only way to reach ws://127.0.0.1 without hitting Chrome's Local Network
   Access gate. Serving the exe's own folder fixes that once, for every future
   page, instead of re-shipping the exe each time a page is added.
   "/" still maps to dg-measure.html, so the dg flow is unchanged.             */
/* ── v1.5.0：內建的極簡入口頁（"/"）─────────────────────────────────────────
   🔴 為什麼不是直接開 dg-measure.html（v1.4.x 的做法）：那一頁一載入就自動連
      helper 並開 I2C channel，於是 helper 一啟動 channel 就被 dg 拿走，
      使用者想測 i2c.html 時搶不到（Bruce 2026-09-18 實測回報）。
      入口頁**自己不碰 I2C**，誰被點誰才持有 —— 兩個工具因此不會互搶。
   只列出真的存在於 exe 旁的頁面，避免按下去 404。刻意做到極簡：沒有 script、
   沒有外部相依，就是兩顆連結按鈕，不讓它變成第三個要維護的東西。         */
static void serve_landing(SOCKET c){
    char body[3072]; int o=0;
    o+=snprintf(body+o,sizeof(body)-o,
        "<!doctype html><meta charset=utf-8><title>dg-helper</title>"
        "<meta name=viewport content=\"width=device-width,initial-scale=1\">"
        "<body style='margin:0;background:#0f172a;color:#e2e8f0;font:15px/1.6 -apple-system,\"PingFang TC\",\"Noto Sans TC\",sans-serif'>"
        "<div style='max-width:560px;margin:0 auto;padding:32px 20px'>"
        "<h1 style='font-size:19px;margin:0 0 4px'>dg-helper 已在執行</h1>"
        "<p style='color:#94a3b8;font-size:13px;margin:0 0 22px'>helper %s · proto %d — 選一個工具開始。</p>",
        DG_HELPER_VERSION, DG_HELPER_PROTO);
    struct { const char* file; const char* title; const char* desc; const char* color; } items[] = {
        { "dg-measure.html", "DG 光學量測",   "Digital Gamma 迭代校正的即時量測畫面", "#a78bfa" },
        { "i2c.html",        "I2C 讀寫測試",  "任意 slave／offset 寬度 0-1-2-4 byte 讀寫，16×16 dump", "#38bdf8" },
    };
    int shown=0;
    for(unsigned i=0;i<sizeof(items)/sizeof(items[0]);i++){
        char p[MAX_PATH]; snprintf(p,sizeof(p),"%s%s",g_exeDir,items[i].file);
        DWORD a=GetFileAttributesA(p);
        if(a==INVALID_FILE_ATTRIBUTES || (a&FILE_ATTRIBUTE_DIRECTORY)) continue;
        shown++;
        o+=snprintf(body+o,sizeof(body)-o,
            "<a href='/%s' style='display:block;text-decoration:none;color:inherit;background:#1e293b;"
            "border:1px solid #334155;border-left:4px solid %s;border-radius:10px;padding:14px 16px;margin-bottom:12px'>"
            "<div style='font-size:16px;font-weight:700'>%s <span style='float:right;color:#64748b'>&rsaquo;</span></div>"
            "<div style='font-size:12.5px;color:#94a3b8;margin-top:2px'>%s</div></a>",
            items[i].file, items[i].color, items[i].title, items[i].desc);
    }
    if(!shown)
        o+=snprintf(body+o,sizeof(body)-o,
            "<p style='color:#fca5a5'>exe 旁邊找不到任何工具頁（dg-measure.html／i2c.html）。"
            "請把整包解壓到同一個資料夾再從那裡執行。</p>");
    o+=snprintf(body+o,sizeof(body)-o,
        "<p style='color:#94a3b8;font-size:12.5px;border-top:1px solid #334155;padding-top:14px;margin-top:20px'>"
        "🔴 同一時間<b>只有一個頁面</b>能握著 I2C 治具。另一頁要用時會顯示「已被另一個頁面佔用」，"
        "按該頁的<b>接手</b>即可搶過來（原本那頁會被斷線，跟原廠 PQ Tool 擇一使用是同一個道理）。"
        "分頁關掉就會自動釋放。</p></div></body>");
    char hdr[256]; int hl=snprintf(hdr,sizeof(hdr),
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: %d\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n", o);
    send_all(c,hdr,hl); send_all(c,body,o);
    logline("[http] 200 / (landing, %d tools listed)", shown);
}

static void serve_page(SOCKET c, const char* req){
    char name[160];
    if(!dgh_req_filename(req,name,sizeof(name))){ serve_404(c,"(request target rejected)"); logline("[http] rejected request target"); return; }
    if(!name[0]){ serve_landing(c); return; }   /* "/" -> 內建入口頁 */
    const char* mime=dgh_mime_for(name);
    if(!mime){ serve_404(c,"That file type is not served."); logline("[http] 404 (type) %s", name); return; }
    char path[MAX_PATH]; snprintf(path,sizeof(path),"%s%s",g_exeDir,name);
    long n=0; char* body=read_file(path,&n);
    if(body){
        char hdr[320]; int hl=snprintf(hdr,sizeof(hdr),
            "HTTP/1.1 200 OK\r\nContent-Type: %s\r\nContent-Length: %ld\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n", mime, n);
        send_all(c,hdr,hl); send_all(c,body,(int)n); free(body);
        logline("[http] 200 %s (%ld bytes)", name, n);
        return;
    }
    if(strcmp(name,"dg-measure.html")==0){
        /* fallback: the default page file is missing next to the exe */
        const char* fb =
          "<!doctype html><meta charset=utf-8><title>DG helper</title>"
          "<body style='font-family:sans-serif;background:#0f172a;color:#e2e8f0;padding:2em'>"
          "<h2>DG helper is running, but dg-measure.html was not found next to it.</h2>"
          "<p>Put <b>dg-measure.html</b> in the same folder as dg-helper.exe (it ships inside the same zip), then reload.</p>"
          "<p>Or use the online tool at https://brucecheng0428.github.io/tcon-tools/ .</p></body>";
        char resp[1024]; snprintf(resp,sizeof(resp),"HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: %d\r\nConnection: close\r\n\r\n%s",(int)strlen(fb),fb);
        send_all(c,resp,(int)strlen(resp));
        logline("[http] served fallback: dg-measure.html not found next to exe");
        return;
    }
    serve_404(c,"That file is not next to dg-helper.exe.");
    logline("[http] 404 (missing) %s", name);
}

int main(int argc, char** argv){
    int port=8899;
    /* v1.4.0: which page the browser is auto-opened at. Default "" = "/" =
       dg-measure.html (unchanged). `--page=i2c.html` opens the I2C test tool
       instead, so it can be a double-click shortcut rather than a typed URL. */
    char page[160]="";
    for(int i=1;i<argc;i++){
        if(strncmp(argv[i],"--port=",7)==0) port=atoi(argv[i]+7);
        else if(strncmp(argv[i],"--page=",7)==0) snprintf(page,sizeof(page),"%s",argv[i]+7);
    }

    SetConsoleOutputCP(65001);   /* extra insurance; output is ASCII anyway */
    exe_dir(g_exeDir, sizeof(g_exeDir));
    detect_temp_dir();
    { char lp[MAX_PATH]; snprintf(lp,sizeof(lp),"%sdg-helper.log",g_exeDir); g_log=fopen(lp,"wb"); }

    logline("==================================================");
    logline(" DG I2C local bridge helper  %s (proto %d)", DG_HELPER_VERSION, DG_HELPER_PROTO);
    logline(" listens on 127.0.0.1:%d only, allow-list origins only", port);
    logline(" write address hard whitelist: 0x1200-0x12FF");
    logline("==================================================");
    logline("Self-diagnostics:");

    diag_os();
    diag_bits();
    logline("  run dir   : %s%s", g_exeDir, g_runningFromTemp ? "  <- TEMP/extraction dir (letter T: extract the whole zip to a real folder first)" : "");
    g_dllOk = locate_and_load_dll();
    diag_dll();
    diag_ftdi();

    WSADATA w;
    char url[256]; snprintf(url,sizeof(url),"http://127.0.0.1:%d/%s", port, page);
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
    else if(!g_dllOk && !g_dllFound && g_runningFromTemp){ code='T'; meaning="you ran the exe from inside the zip (a temp folder), so the bundled libMPSSE.dll got left behind"; todo="Close this. EXTRACT the whole zip to a real folder (e.g. Desktop), then double-click dg-helper.exe there."; }
    else if(!g_dllOk && !g_dllFound){ code='D'; meaning="libMPSSE.dll not found"; todo="It normally ships next to this exe. If you moved the exe out, copy libMPSSE.dll back beside it (or run the exe from the folder you unzipped)."; }
    else if(!g_dllOk && g_dllDepMissing){ code='F'; meaning="libMPSSE.dll found, but its ftd2xx.dll (FTDI driver) is missing"; todo="Install the FTDI D2XX driver, or just run the original PQ Tool once; that puts ftd2xx.dll on the system. Then start this program again."; }
    else if(!g_dllOk){ code='X'; meaning="wrong libMPSSE.dll (bitness/corrupt)"; todo="Use the 32-bit libMPSSE.dll from your PQ Tool 'Release V1.5.0' folder."; }
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
    /* v1.5.0: the browser lands on the built-in menu, which is what lets the
       two tool pages coexist instead of racing for the I2C channel. */
    if(g_bindOk){
        printf("--------------------------------------------------\n");
        printf("   Menu:  http://127.0.0.1:%d/   (pick DG or I2C there)\n", port);
        printf("   Only ONE page holds the I2C jig at a time; the other page\n");
        printf("   can take it over with its \"take over\" button.\n");
    }
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

    /* ═══ v1.5.0：select() 多路複用的伺服迴圈 ═══════════════════════════════
       取代 v1.4.x 那個「accept 一個就阻塞到它斷線」的迴圈。那個寫法在只有
       一個頁面時看不出問題，但只要 dg-measure 的 WebSocket 開著，helper 就
       再也 accept 不到任何連線 —— 連把 i2c.html 這個檔案送出去都做不到。
       單執行緒 ＋ select 同時解掉兩件事：
         · 隨時都還能 accept（第二個頁面至少載得進來）
         · I2C 呼叫天然序列化，不需要為了多執行緒再加一層鎖              */
    for(int i=0;i<MAX_CLIENTS;i++){ g_cl[i].used=0; g_cl[i].s=INVALID_SOCKET; }
    for(;;){
        fd_set rd; FD_ZERO(&rd); FD_SET(srv,&rd);
        for(int i=0;i<MAX_CLIENTS;i++) if(g_cl[i].used) FD_SET(g_cl[i].s,&rd);
        if(select(0,&rd,NULL,NULL,NULL)<=0) continue;   /* Windows 忽略第一個參數 */

        if(FD_ISSET(srv,&rd)){
            SOCKET c=accept(srv,NULL,NULL);
            if(c!=INVALID_SOCKET){
                /* 🔴 收 timeout：ws_recv_text 內部是 recv_exact（阻塞）。正常
                   loopback 上一個 frame 一次就到齊，但萬一被切開又遲遲不來，
                   沒有 timeout 就會整支 helper 卡住 —— 那正是本版要根治的病。 */
                DWORD to=5000; setsockopt(c,SOL_SOCKET,SO_RCVTIMEO,(char*)&to,sizeof(to));
                int idx=cl_add(c);
                if(idx<0){ const char* r="HTTP/1.1 503 Service Unavailable\r\n\r\ntoo many connections";
                           send_all(c,r,(int)strlen(r)); closesocket(c);
                           logline("[net] refused: client table full"); }
            }
        }
        for(int i=0;i<MAX_CLIENTS;i++){
            if(!g_cl[i].used || !FD_ISSET(g_cl[i].s,&rd)) continue;
            if(!g_cl[i].isWs){
                /* 還沒升級：這是一個 HTTP 請求 */
                char req[8192]; int n=recv(g_cl[i].s,req,sizeof(req)-1,0);
                if(n<=0){ cl_drop(i); continue; }
                req[n]=0;
                if(strstr(req,"Upgrade: websocket")||strstr(req,"upgrade: websocket")){
                    if(ws_upgrade(g_cl[i].s,req)){ g_cl[i].isWs=1; logline("[ws] client #%d connected", i); }
                    else cl_drop(i);
                } else {
                    serve_page(g_cl[i].s,req);      /* 一般 HTTP：回完就關 */
                    cl_drop(i);
                }
            } else {
                char msg[8192];
                int n=ws_recv_text(g_cl[i].s,msg,sizeof(msg));
                if(n<0){ logline("[ws] client #%d disconnected", i); cl_drop(i); continue; }
                if(n>0) handle_command(i,msg);
            }
        }
    }
    if(p_Cleanup) p_Cleanup();
    closesocket(srv); WSACleanup();
    if(g_log) fclose(g_log);
    return 0;
}
