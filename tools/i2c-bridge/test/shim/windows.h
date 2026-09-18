/* ═══════════════════════════════════════════════════════════════════════════
   Win32 shim —— 只為了讓**出貨的那份 i2c_bridge.c 一個字不改**就能在 Linux 上
   編起來跑真的 socket，好驗它的伺服迴圈。
   ───────────────────────────────────────────────────────────────────────────
   🔴 為什麼值得做這一層：v1.4.x 的單連線阻塞迴圈「看程式碼是對的」，編得過、
      純函式測試也全綠，但只要兩個頁面同時在，第二個連線根本 accept 不到。
      這種錯只有**真的把伺服器跑起來、真的開兩條連線**才驗得到。
      用 shim 而不是另寫一份測試用伺服器，是因為另寫一份就會變成「測到的不是
      出貨的那一份」—— 這個專案已經為那件事付過代價。

   涵蓋範圍刻意只到「能跑起伺服迴圈」：DLL 搜尋、登錄檔掃描、瀏覽器開啟這些
   都給成合理的假實作。**真正的 D2XX／libMPSSE／I2C 一樣驗不了**（見 test_server.c
   最後印出來的未驗清單）。
   ═══════════════════════════════════════════════════════════════════════════ */
#ifndef DGH_SHIM_WINDOWS_H
#define DGH_SHIM_WINDOWS_H

#include <stdint.h>
#include <stddef.h>
#include <stdio.h>
#include <string.h>
#include <limits.h>

#define MAX_PATH 260
#define WINAPI
#define CALLBACK

typedef unsigned long  DWORD;
typedef unsigned char  BYTE;
typedef long           LONG;
typedef int            BOOL;
typedef void*          HANDLE;
typedef void*          HMODULE;
typedef void*          HINSTANCE;
typedef void*          HKEY;
typedef DWORD          REGSAM;
typedef intptr_t       INT_PTR;
typedef unsigned short u_short;

#define INVALID_HANDLE_VALUE      ((HANDLE)(intptr_t)-1)
#define INVALID_FILE_ATTRIBUTES   ((DWORD)-1)
#define FILE_ATTRIBUTE_DIRECTORY  0x00000010u
#define ERROR_SUCCESS             0L
#define ERROR_MOD_NOT_FOUND       126L
#define KEY_READ                  0x20019
#define KEY_WOW64_64KEY           0x0100
#define KEY_WOW64_32KEY           0x0200
#define HKEY_LOCAL_MACHINE        ((HKEY)(intptr_t)0x80000002)
#define HKEY_CURRENT_USER         ((HKEY)(intptr_t)0x80000001)
#define SW_SHOWNORMAL             1

typedef struct { DWORD dwOSVersionInfoSize, dwMajorVersion, dwMinorVersion, dwBuildNumber, dwPlatformId; } RTL_OSVERSIONINFOW;

typedef struct {
    DWORD dwFileAttributes;
    char  cFileName[MAX_PATH];
} WIN32_FIND_DATAA;

DWORD     GetModuleFileNameA(HMODULE m, char* buf, DWORD cap);
DWORD     GetTempPathA(DWORD cap, char* buf);
DWORD     GetFileAttributesA(const char* path);
DWORD     GetEnvironmentVariableA(const char* name, char* buf, DWORD cap);
DWORD     GetCurrentDirectoryA(DWORD cap, char* buf);
BOOL      SetDllDirectoryA(const char* dir);
HMODULE   LoadLibraryA(const char* path);
void*     GetProcAddress(HMODULE m, const char* name);
DWORD     GetLastError(void);
HANDLE    FindFirstFileA(const char* pat, WIN32_FIND_DATAA* fd);
BOOL      FindNextFileA(HANDLE h, WIN32_FIND_DATAA* fd);
BOOL      FindClose(HANDLE h);
LONG      RegOpenKeyExA(HKEY hive, const char* sub, DWORD opt, REGSAM sam, HKEY* out);
LONG      RegEnumKeyExA(HKEY k, DWORD i, char* name, DWORD* nlen, void* r1, void* r2, void* r3, void* r4);
LONG      RegQueryValueExA(HKEY k, const char* name, void* r, DWORD* type, BYTE* data, DWORD* len);
LONG      RegCloseKey(HKEY k);
HMODULE   GetModuleHandleA(const char* name);
HINSTANCE ShellExecuteA(void* h, const char* op, const char* file, const char* par, const char* dir, int show);
BOOL      SetConsoleOutputCP(unsigned cp);

#define strtok_s(s, d, ctx) strtok_r((s), (d), (ctx))

/* i2c_bridge.c 組出來的檔案路徑是 Windows 風格（反斜線），POSIX 的 fopen 吃不下。
   在這一層正規化，讓出貨的原始碼不必為了測試而改。
   （<stdio.h> 已在本檔開頭 include 過，所以這個巨集不會撞到它的宣告。） */
FILE* dgh_shim_fopen(const char* path, const char* mode);
#define fopen(p, m) dgh_shim_fopen((p), (m))

/* 測試用掛勾（shim.c 實作） */
extern int  dgh_shim_browser_opened;        /* ShellExecuteA 被呼叫幾次 */
extern char dgh_shim_browser_url[512];      /* 最後一次開的網址 */
void dgh_shim_set_exe_dir(const char* dir); /* 指定「exe 所在目錄」 */

#endif
