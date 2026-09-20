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
/* 自檢用 shim：只要定義得出來就好，值照 Windows SDK。 */
#ifndef FILE_ATTRIBUTE_REPARSE_POINT
#define FILE_ATTRIBUTE_REPARSE_POINT 0x00000400
#endif
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
    /* 自檢用 shim 只補到「產品程式碼有用到」為止。
       nFileSizeLow：vendor_try_dir() 用它把 DLL 大小寫進 log，方便日後核對
       他手上那份是不是我們打包的那一份（69,120 bytes）。 */
    DWORD nFileSizeLow;
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

/* 高解析度計時（i2c_bridge.c 用它量 libMPSSE 呼叫的耗時）。
   POSIX 這側用 CLOCK_MONOTONIC 換算成同樣的「counter ＋ frequency」形狀，
   讓出貨的原始碼一個字都不必為了測試而改。 */
typedef union { long long QuadPart; } LARGE_INTEGER;
BOOL QueryPerformanceFrequency(LARGE_INTEGER* f);
BOOL QueryPerformanceCounter(LARGE_INTEGER* c);
DWORD GetTickCount(void);
void  Sleep(DWORD ms);

/* ═══ 🔴 高解析度可等待計時器（1.15.1）═════════════════════════════════════
   出貨程式碼用 `CreateWaitableTimerExW` ＋ `SetWaitableTimer` ＋
   `WaitForSingleObject` 做 tWR 的短等待（理由見 i2c_bridge.c 的 precise_wait_ms）。
   這一層把它們補上，**讓 Linux 上跑的是出貨的那條路徑**，不是另寫一份。
   實作在 shim.c：用 `clock_nanosleep` 的絕對到期時間，對應 Windows 高解析度
   計時器的語意（Linux 的 nanosleep 本身就是次毫秒級）。 */
#define INFINITE 0xFFFFFFFFu
DWORD WaitForSingleObject(HANDLE h, DWORD ms);
BOOL  CloseHandle(HANDLE h);

/* ── 測試掛勾 ─────────────────────────────────────────────────────────────
   🔴 `dgh_shim_sleep_tick_ms`：**模擬 Windows 排程器 tick 對 `Sleep()` 的量化**
      （`Sleep(n)` 會被進位到下一個 tick）。預設 0 ＝ 不量化 ＝ 既有測試行為
      一個位元都沒變。設成 15.6 就能在 Linux 上重現 Bruce 那台機器的症狀，
      於是「precise_wait 不經過 Sleep」這件事變成**可驗證**的，而不是嘴上說的。
      ⚠️ 這是**模擬**，不是 Windows 的量測值 —— 測試裡與 log 裡都要這樣寫。
   🔴 `dgh_shim_hires_timer`：0 ＝ 讓 CreateWaitableTimerExW 失敗，用來驗
      **退回 Sleep 的那條路**（退路不驗＝沒有退路）。 */
extern double dgh_shim_sleep_tick_ms;
extern int    dgh_shim_hires_timer;
extern int    dgh_shim_timer_waits;      /* WaitForSingleObject 被呼叫幾次（證明真的走了計時器） */
extern int    dgh_shim_sleep_calls;      /* Sleep() 被呼叫幾次 */
extern DWORD  g_shim_lasterr;            /* GetLastError 回的值（1.15.1 起不再永遠 0） */

/* i2c_bridge.c 組出來的檔案路徑是 Windows 風格（反斜線），POSIX 的 fopen 吃不下。
   在這一層正規化，讓出貨的原始碼不必為了測試而改。
   （<stdio.h> 已在本檔開頭 include 過，所以這個巨集不會撞到它的宣告。） */
FILE* dgh_shim_fopen(const char* path, const char* mode);
#define fopen(p, m) dgh_shim_fopen((p), (m))

/* 測試用掛勾（shim.c 實作） */
extern int  dgh_shim_browser_opened;        /* ShellExecuteA 被呼叫幾次 */
extern char dgh_shim_browser_url[512];      /* 最後一次開的網址 */
void dgh_shim_set_exe_dir(const char* dir); /* 指定「exe 所在目錄」 */

/* ═══ 🔴 假 EEPROM 夾具（1.15.0）════════════════════════════════════════════
   為什麼要有它：batchwrite 把**分頁**搬進 bridge，而分頁寫錯的後果是
   「EEPROM 頁內回捲、蓋掉同一頁前面的資料，而且裝置不會報錯」——
   這種錯**在假 libMPSSE 只記錄最後一次寫入的年代看不見**：每一段都成功、
   回覆也 ok，只有真的把資料存下來、再讀回來比對才抓得到。

   夾具刻意模擬那個壞行為本身：`dgh_fake_page` 非 0 時，一段寫入若跨過頁邊界，
   超出的 byte 就**回捲到本頁開頭**（真 EEPROM 就是這樣），並且把次數記在
   `dgh_fake_wraps`。⇒ 測試的判準變成「dgh_fake_wraps 必須是 0」＋
   「整段回讀必須逐 byte 相同」，兩條一起才算數。

   🔴 預設 `dgh_fake_eeprom == 0` ＝ **既有行為一個位元都沒變**（讀回 0xA0+i），
      既有 103 項測試不受影響。要用就在測試裡自己打開。 */
extern int  dgh_fake_eeprom;                /* 0＝舊行為（預設）；1＝走記憶體模型 */
extern int  dgh_fake_page;                  /* 模擬的 page size；0＝不模擬頁內回捲 */
extern int  dgh_fake_awid;                  /* 位址相位寬度，用來解析 frame */
extern int  dgh_fake_wraps;                 /* 發生過幾次頁內回捲（應為 0） */
extern unsigned long dgh_fake_addr;         /* 目前的裝置位址指標 */
extern unsigned char dgh_fake_mem[65536];
void dgh_fake_eeprom_reset(int page, int awid, unsigned char fill);

#endif
