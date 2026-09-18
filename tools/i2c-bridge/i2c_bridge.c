/* ===========================================================================
 * I2C Bridge - local I2C bridge for the web tools (native Win32, 32-bit)
 * ---------------------------------------------------------------------------
 * Shape:  browser --WebSocket(127.0.0.1)--> this exe --libMPSSE(D2XX)--> jig --I2C--> TCON
 *
 * v1.1.0 (Bruce 2026-09-17 feedback):
 *   1. Console output is ALL ENGLISH (was Chinese -> mojibake in Windows console).
 *   2. Helper SELF-SERVES the measurement page and AUTO-OPENS the default browser
 *      at http://127.0.0.1:<port>. The user no longer clicks any "connect" button.
 *      Fewer steps: download -> unzip (pw 1234) -> double-click exe -> browser opens.
 *   3. Startup SELF-DIAGNOSTICS written to console AND to i2c-bridge.log next to the
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
#include <stddef.h>          /* offsetof -- used by the ChannelConfig layout asserts */

#include "i2c_bridge_version.h"
#include "i2c_bridge_proto.h"   /* SHA1 / Base64 / JSON / whitelist / Origin (shared with test_proto.c) */

/* ---- I2C transfer options (from ftdi_i2c.h / the combos PQ Tool uses) ----
 *
 * 🔴 效能根因（2026-09-19，Bruce 回報「讀 4096 byte 要 20~60 秒」）：
 *    libMPSSE 的 I2C_DeviceRead 在**沒有** FAST_TRANSFER 位元時走的是逐 byte 迴圈
 *
 *        for(i=0; i<sizeToTransfer; i++)
 *            I2C_Read8bitsAndGiveAck(handle, &buffer[i], ...);
 *
 *    而 I2C_Read8bitsAndGiveAck 每一個 byte 都做：
 *        FT_Channel_Write(~17 bytes 的 MPSSE 命令) → INFRA_SLEEP(1) → FT_Channel_Read(1)
 *    ⇒ **每個 byte 一次完整的 USB 來回**。
 *
 * 🔴 更正（2026-09-19，Bruce 用邏輯分析儀實測 ＋ FTDI 官方定義）：
 *    這段註解原本寫「主因是 INFRA_SLEEP(1) 的 1 ms 睡眠，4096 byte 光 sleep 就 4 秒」。
 *    **那是錯的，量級差一個數量級。** 實測 byte 與 byte 之間是 **10~15 ms**，
 *    而 sleep 確實只有 1 ms（libmpsse.dll 0x6f5838e3／0x6f583a31／0x6f583c40／
 *    0x6f5843a5／0x6f5849c3 全是 `movl $1`），latency timer 也確實被設成 1
 *    （0x6f582754 傳入的 %edi ＝ 第 4 個參數，即我們的 LatencyTimer=1）。
 *
 *    真正的主因是**每個 byte 都強制一次 USB flush**：FTDI 官方的 I2C 讀取 recipe
 *    在每個資料 byte 的 ACK 之後送一次 `0x87`（Send Immediate），其定義是
 *    「強制把已緩衝的讀取資料立刻送回主機，不等 USB latency timer」。
 *    每一個 `0x87` ＝ 一次強制往返；主機收到後才組下一個 byte 的命令再送出去，
 *    這段來回就是量到的 10~15 ms。**所以「匯流排上已經是 burst」那句話也是錯的** ——
 *    定址層面確實只有一筆交易，但時間上每個 byte 之間都停住，沒有人會叫它 burst。
 *    （理論 I2C 時間 @400kHz 只有 0.09 秒 ⇒ 99% 以上的時間不在匯流排上，這句仍成立。）
 *
 * 🔴 而我們原本的設定是：位址相位與寫入**有**帶 0x10（fast），**只有讀取的資料
 *    相位沒帶**（0x0B ＝ START|STOP|NACK_LAST_BYTE）。也就是說**寫入本來就是快的，
 *    慢的只有讀取** —— 和他抱怨的正好一致。
 *
 * 🔴 這是對 PQ Tool 的**刻意偏離**（Bruce 授權）：PQ Tool 只讀幾個 byte，從來沒
 *    踩到這個情境，它的 0x0B 沿用下來對我們是錯的選擇。I2C 線上的行為（START、
 *    位址、repeated start、STOP）不變，改變的只是「命令怎麼下給 MPSSE」：
 *    fast 模式把整段命令一次組好、一次送出，ACK 在整批結束時一起檢查。
 *
 * ⚠️ 我**沒有**讀到 I2C_FastRead 的函式本體（只讀到 ftdi_i2c.c 前 ~1000 行與
 *    它的 doc comment），所以「fast 模式下 NACK_LAST_BYTE 是否照樣在最後一個
 *    byte 送 NACK」**無法從原始碼確認**。I2C 規格要求 master 對讀取的最後一個
 *    byte 回 NACK，這條若沒照做，匯流排可能不會正常釋放。
 *    ⇒ 因此做成**可切換**：預設走 fast，`--slow-read` 或 open 命令帶
 *      `"fastread":false` 就退回舊行為。Bruce 實測若讀取異常，不必換 exe 就能退回。
 */
#define I2C_FAST_TRANSFER_BYTES 0x10
#define OPT_READ_ADDR   (0x09u | I2C_FAST_TRANSFER_BYTES)   /* 0x19 */
#define OPT_READ_DATA_SLOW  0x0Bu                            /* PQ Tool 原值（逐 byte） */
#define OPT_READ_DATA_FAST  (0x0Bu | I2C_FAST_TRANSFER_BYTES)/* 0x1B：一次組命令一次送 */
#define OPT_WRITE       (0x07u | I2C_FAST_TRANSFER_BYTES)   /* 0x17 */

/* 讀取要不要走 fast 路徑。預設 1；`--slow-read` 或 open 帶 fastread:false 可關。
   🔴 網頁端一律送 fastread:0（v1.9.1 的回歸修復），所以實際上這個預設沒有作用。 */
int dgh_fast_read = 1;

/* 🔴 直接組 MPSSE 命令（繞開 libMPSSE 的逐 byte 迴圈）。**預設 0。**
   理由與上一次的教訓一致：這條路的命令序列**沒有在他的硬體上跑過**
   （WebUSB 那條路在他機器上從來連不上），所以沒有實證 ⇒ 不當預設值。
   打開方式：`--raw-mpsse` 或 open 帶 `"rawmpsse":1`。
   網頁提供「快慢路徑比對」按鈕，讓他自己用同一段位址兩種路徑各讀一次、
   逐 byte 比對 —— 那比我們任何斷言都有力。 */
int dgh_raw_mpsse = 0;
/* 🔴 v1.11.5：`i2c_force_clock()` 與 `--force-clock` **已刪除**。
   它是 v1.11.0 在 InitChannel 之後「事後插隊」寫時脈的那一段（自 v1.11.1 起預設關）。
   刪掉不是因為沒用，而是它**與現在的時脈模型矛盾**：它寫死 `0x8B` 並自己算
   `6e6/f-1`（無三相），而 raw 路徑現在是三相開啟 ＋ 2/3 補償。
   留著一個「預設關、一開就把時脈設錯」的旁路，只是下一個陷阱。
   ⇒ 時脈現在只有一個出口：`raw_set_mode()` ＋ `dgh_mp_divisor()`。 */
/* 見 i2c_bridge_proto.h 的說明：0 ＝ 維持既有的 0x03/0x01；1 ＝ FTDI 範例的 0x0B/0x09。
   預設 0 —— 沒有證據之前不改變既有行為。 */
int dgh_ad3_out = 0;
/* 🔴 三相時脈（raw 路徑用）。**預設開**（Bruce 2026-09-19 裁示）。
   AN_113 說 FT2232H/FT4232H 的 I2C 需要它；但 Bruce 提了一個有效的反面假說 ——
   「原廠 Python UI 與 EM02 TCON UI 好像都沒用三相，會不會不用才對？」
   ⇒ 所以做成**可切換**，讓他一次量完兩種，而不是我們替他選一邊。
   慢路徑（libMPSSE, Options=3）永遠是關的，不受這個旗標影響。 */
int dgh_three_phase = 1;
/* 網頁自報的版本（open 的 `page` 欄位）。只用於 log —— 不拿它做任何行為判斷。 */
static char g_pageVer[64] = "(no open yet)";
/* ═══ 🔴🔴 呼叫慣例：ftd2xx ＝ stdcall，libMPSSE ＝ cdecl，**兩者不同** ═══════
   這是 2026-09-19「一讀取 Bridge 就整個關掉」的**已證實根因**，而且只差三個字。

   官方標頭：
     · `ftd2xx.h`      : `FTD2XX_API FT_STATUS WINAPI FT_Write(...)`  ⇒ WINAPI ＝ __stdcall
     · `libMPSSE_i2c.h`: `FTDI_API FT_STATUS I2C_DeviceRead(...)`      ⇒ 沒有 WINAPI ⇒ cdecl

   32-bit x86 上 `__stdcall` 由**被呼叫端**清堆疊、cdecl 由**呼叫端**清。
   我們這三個 typedef 原本沒寫 `__stdcall` ⇒ 每呼叫一次堆疊就多平衡一次（16 bytes），
   累積幾次把堆疊毀掉 ⇒ **行程直接死**，終端機視窗跟著消失。

   為什麼慢路徑一直好好的（交叉驗證，不是巧合）：慢路徑只走 libMPSSE，
   而 libMPSSE 本來就是 cdecl，下面 PFN_Init/PFN_Read/... 不寫 __stdcall **剛好是對的**。
   只有 raw 路徑會碰 ftd2xx 的這三支 ⇒ **只有讀取（且只有快速模式）會當**。

   這條也把先前幾件事串起來並定案：
     · v1.11.0「連不到 Bridge」：`i2c_force_clock` 呼叫 `p_FT_Write` ⇒ 同一個當機。
       當時我只能寫「移除嫌疑者、未證實根因」—— **現在證實了，就是這個。**
     · 快速模式的自動驗證一直判失敗：它第一步就走 raw 路徑。

   🔴 規則：**每一個 GetProcAddress 取來的函式指標，都要標明它來自哪支 DLL、
      該 DLL 的官方標頭用什麼呼叫慣例。** 這種錯編得過、連結得過、只在執行期死，
      靠「記得」是擋不住的。 */
#ifndef _WIN32
#define __stdcall           /* 非 Windows（自檢編譯）下沒有這個慣例，定義成空的 */
#endif
/* 來源：ftd2xx.dll ── 官方 ftd2xx.h 全部標 WINAPI ⇒ __stdcall */
typedef unsigned long (__stdcall *PFN_FT_Write)(void*, void*, unsigned long, unsigned long*);
typedef unsigned long (__stdcall *PFN_FT_Read )(void*, void*, unsigned long, unsigned long*);
typedef unsigned long (__stdcall *PFN_FT_Purge)(void*, unsigned long);
static PFN_FT_Write p_FT_Write = NULL;
static PFN_FT_Read  p_FT_Read  = NULL;
static PFN_FT_Purge p_FT_Purge = NULL;
#define DGH_RAW_AVAILABLE (p_FT_Write && p_FT_Read)
#define OPT_READ_DATA (dgh_fast_read ? OPT_READ_DATA_FAST : OPT_READ_DATA_SLOW)

/* ---- 計時（Bruce：「讀取或寫入那邊再多一個計時的顯示」）----
 * bridge 這一側量的是「libMPSSE 呼叫本身」花多久，網頁那側量 WebSocket 往返。
 * 兩個數字相減就知道時間是花在 USB/I2C 還是花在我們自己的傳輸層。 */
static double now_ms(void){
    LARGE_INTEGER f, c;
    if(!QueryPerformanceFrequency(&f) || f.QuadPart == 0) return (double)GetTickCount();
    QueryPerformanceCounter(&c);
    return (double)c.QuadPart * 1000.0 / (double)f.QuadPart;
}

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
/* 🔴 單次讀取上限。4096 ＝ 原廠 RomCode UI 的標準操作長度（一次讀完，不分段）。
   raw MPSSE 的命令長度約 12 byte/資料 byte ⇒ 4096 byte 需要約 50 KB 命令緩衝區。
   這個上限**不是保護，是緩衝區大小**：超過就會截斷，所以要明確擋下而不是放行。 */
#define DGH_READ_MAX 4096
#define DGH_MP_CMD_MAX (DGH_READ_MAX * 13 + 512)

/* ═══ 🔴 libMPSSE ChannelConfig -- DEFAULT ALIGNMENT, **NOT** packed ═══════════
   FTDI's official libMPSSE_i2c.h declares it with no #pragma pack at all:

       typedef struct ChannelConfig_t {
           I2C_CLOCKRATE ClockRate;     // offset 0, 4 bytes
           uint8         LatencyTimer;  // offset 4, 1 byte  (+3 padding)
           uint32        Options;       // offset 8
       } ChannelConfig;                 // sizeof == 12

   🔴 This used to be `#pragma pack(push,1)` here, justified by a comment saying it
   "matches C# [StructLayout(Pack=1)]". That justification was wrong, and it was a
   REAL, PROVEN BUG -- not a suspicion:

     packed layout put Options at offset 5 (sizeof 9), but the DLL reads it from
     offset 8, i.e. from padding + whatever stack bytes followed the struct.
     ⇒ I2C_DISABLE_3PHASE_CLOCKING (bit0) never took effect, so libMPSSE believed
       three-phase clocking was ON and applied ClockRate*3/2 -- which is exactly
       why Bruce measured **600 kHz when we asked for 400 kHz** (400k * 3/2).
     ⇒ I2C_ENABLE_DRIVE_ONLY_ZERO (bit1) never took effect either, so SDA was
       driven push-pull instead of open-drain the whole time.

   🔴 This also resolves the contradiction I could not explain earlier. I had read
   _I2C_InitChannel correctly (testb $1,%dl at 0x6f583693 skips the *3/2 when bit0
   is set); what was wrong was my assumption that the DLL was *receiving* Options=3.
   It was not -- we were writing it to the wrong offset. The disassembly was fine;
   the input was garbage. Lesson: when a measurement contradicts a reading of the
   callee, check what the caller actually handed over before doubting the reading.

   The static asserts below make this unfixable-by-accident: any future change that
   re-packs the struct fails the build instead of silently mis-clocking the bus. */
typedef struct { uint32_t ClockRate; uint8_t LatencyTimer; uint32_t Options; } ChannelConfig;
/* C89-compatible compile-time assertions (negative array size on failure). */
typedef char dgh_assert_chancfg_size[(sizeof(ChannelConfig) == 12) ? 1 : -1];
typedef char dgh_assert_chancfg_opts[(offsetof(ChannelConfig, Options) == 8) ? 1 : -1];
typedef char dgh_assert_chancfg_lat [(offsetof(ChannelConfig, LatencyTimer) == 4) ? 1 : -1];

/* FT_DEVICE_LIST_INFO_NODE (for enumeration diagnostics) */
typedef struct {
    uint32_t Flags; uint32_t Type; uint32_t ID; uint32_t LocId;
    char SerialNumber[16]; char Description[64]; void* ftHandle;
} FT_NODE;

typedef void* FT_HANDLE;
typedef uint32_t FT_STATUS;
#define FT_OK 0

/* 🔴 來源：libMPSSE.dll ── 官方 libMPSSE_i2c.h 的 FTDI_API **沒有** WINAPI ⇒ **cdecl**。
   所以這一組**刻意不加** `__stdcall`；加了反而會壞。與上面 ftd2xx 那三支相反，
   兩支 DLL 的慣例不同是這個檔案最容易踩的地雷，已在上方寫明依據。 */
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
static char g_serveDir[MAX_PATH] = "";   /* --serve=<dir>；空 ＝ 用 exe 所在目錄 */
static char g_dllPath[MAX_PATH] = "";
static FILE* g_log = NULL;

/* ===========================================================================
 * logging: DETAIL goes to i2c-bridge.log ONLY (English, ASCII).
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
/* 🔴 v1.7.0（Bruce 2026-09-18）：「helper 啟動不要再跳那個 local 網頁」，
   而且「解壓縮以後裡面一樣會有這個網頁」—— 他連那兩個 html 都不要。
   ⇒ 包裡只剩 exe ＋ dll；**不自動開瀏覽器**；靜態檔服務**預設關閉**，
     只有明確給 `--serve` 才啟用（留成退路，不是預設路徑）。
   線上頁面連 ws://127.0.0.1 這條路本身是成立的：Chrome 147 起會跳一次
   「允許存取本機網路」的提示，按允許就通（same-space 的本機頁才不跳 ——
   那正是先前 headless 測試看到「TCP 進來但一個 byte 都沒送」的原因：
   沒有人可以按那個提示）。 */
/* 🔴 非 static：test_server.c 要能在同一個行程裡切換「預設關閉」與「--serve 打開」
   兩條路（開兩個 server 實例會撞全域狀態）。與 dgh_fake_* 同一個做法。 */
int dgh_serve_files = 0;
#define g_serveFiles dgh_serve_files
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
    /* 🔴 直接組 MPSSE 命令需要 D2XX 的 FT_Write／FT_Read。
       libMPSSE 回的 handle **本來就是 D2XX 的 FT_HANDLE**（它內部也是這樣用），
       所以在同一個 handle 上送 MPSSE opcode 與 libMPSSE 自己做的事完全同一件。
       ftd2xx.dll 是 libMPSSE 的相依，能載到 libMPSSE 就一定載得到它。
       拿不到也不是致命錯誤 —— 只是 raw 路徑不可用，退回 libMPSSE。 */
    /* 🔴 載入順序（Bruce/Dispatch 2026-09-19，依 FTDI TN_153「隨應用程式附帶 D2XX」）：
         ① 先試**系統已安裝**的（預設搜尋路徑）—— 系統驅動的版本與核心驅動相匹配，
            優先用它才不會出現使用者模式與核心模式版本不一致。
         ② 失敗才載 **exe 同目錄**附帶的那一份（zip 裡有附）。那只是保險。
       🔴 兩條路都要在 log 寫明**用了哪一份、路徑是什麼** —— 這正是這一輪查不下去的原因：
          舊版只印 "unavailable"，完全看不出是沒找到檔案、還是找到了但沒有那些函式。 */
    {
        HMODULE d2 = LoadLibraryA("ftd2xx.dll");
        const char* src = "system search path";
        char bundled[MAX_PATH];
        if(!d2) d2 = GetModuleHandleA("ftd2xx.dll");
        if(!d2){
            snprintf(bundled, sizeof(bundled), "%sftd2xx.dll", g_exeDir);
            d2 = LoadLibraryA(bundled);
            src = bundled;
            if(!d2) logline("  d2xx    : NOT FOUND -- tried system search path and %s", bundled);
        }
        if(d2){
            char got[MAX_PATH]; DWORD n = GetModuleFileNameA(d2, got, sizeof(got));
            p_FT_Write=(PFN_FT_Write)GetProcAddress(d2,"FT_Write");
            p_FT_Read =(PFN_FT_Read) GetProcAddress(d2,"FT_Read");
            p_FT_Purge=(PFN_FT_Purge)GetProcAddress(d2,"FT_Purge");
            logline("  d2xx    : loaded from %s -> %s", src, n ? got : "(path unknown)");
        }
        logline("  d2xx    : FT_Write=%s FT_Read=%s FT_Purge=%s ==> fast path %s",
                p_FT_Write?"ok":"MISSING", p_FT_Read?"ok":"MISSING", p_FT_Purge?"ok":"-",
                (p_FT_Write&&p_FT_Read)?"AVAILABLE"
                                       :"UNAVAILABLE (every read will silently fall back to the slow path)");
    }
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
    /* 🔴 改名後**兩個名字都吃**：新的優先，舊的保留相容。環境變數是已經交到
       使用者手上的介面，單方面改掉等於把別人現有的設定弄壞（改名的目的是讓人
       看得懂，不是製造一次無聲的故障）。 */
    if (GetEnvironmentVariableA("I2C_BRIDGE_DLL_DIR", buf, sizeof(buf)) && buf[0] && try_dir(buf)) return 1;
    if (GetEnvironmentVariableA("DG_HELPER_DLL_DIR", buf, sizeof(buf)) && buf[0] && try_dir(buf)) return 1;
    /* 2. next to the exe */
    if (try_dir(g_exeDir)) return 1;
    /* 3. current working directory */
    if (GetCurrentDirectoryA(sizeof(buf), buf) && try_dir(buf)) return 1;
    /* 4. optional i2c-bridge.ini (one line = folder) */
    { char ip[MAX_PATH]; snprintf(ip,sizeof(ip),"%si2c-bridge.ini",g_exeDir);
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
/* 🔴 v1.11.1：open 路徑**每一步都記一行，含耗時**。
   起因：v1.11.0 在 Bruce 那台連不上，而我們手上的 log 完全看不出卡在哪一步 ——
   只能靠推論。推論這次也許猜對了，下一次不一定。每一階段都留時間戳之後，
   他把 i2c-bridge.log 丟過來就能直接指出是哪一個呼叫沒回來。
   （這台 Mac 沒有 Windows 也沒有治具，log 是我們唯一的遠端眼睛。） */
/* ═══ 🔴 raw 路徑自己做通道初始化（2026-09-19，依 Bruce 的實機 log）════════════
   證據鏈：
     · 他的 log：快路徑每個 byte 只拿到 1 個位元，右對齊在 bit0
       （`fast[i] == LSB(slow[i])`，16 個吻合 15~16 個），而 acks／din／收回位元組數
       全部正確 ⇒ **記帳沒錯、命令數量沒錯**。
     · 我把實際送出的 1150 個位元組 dump 出來逐段解析：資料區塊是
       `80 00 01 / 20 00 00 / 80 00 03 / 13 00 ACK`，
       **與 `dg-measure.html` 的 `dgmMpReadByte()` 逐位元組相同**（該檔 3151-3157），
       而那條 WebUSB 路徑**在他的硬體上是能正常讀的**。
     ⇒ 命令序列不是變因。**變因是執行這些命令時通道處於什麼狀態** ——
       raw 路徑原本完全沿用 libMPSSE `I2C_InitChannel` 留下的設定。

   🔴 最明顯的差異：參考實作在 init 時**自己送 `0x9E 0x07 0x00`**（open-drain，
   只驅動 0 的針腳遮罩 AD0/AD1/AD2），我們則是靠 libMPSSE 的
   `I2C_ENABLE_DRIVE_ONLY_ZERO` 代勞。主控端若在讀取期間**主動驅動 SDA**
   而不是開汲極，從機就搶不過它 —— 線被壓住，只有最後一個位元時序上剛好放開，
   於是「前 7 個位元全 0、最後一位才是真資料」，**正好是他量到的形狀**。

   🔴 這是假說，不是結論。但**修法不依賴假說成立**：我們不去猜是哪一個位元，
   而是讓 raw 路徑**完整送出那份在他硬體上已被證明可用的 init**，
   一次排除整類「libMPSSE 把通道留在別的狀態」的可能。
   推翻條件：送了這份 init 之後資料仍然錯 ⇒ 假說錯，要回頭查別的。

   🔴🔴 v1.11.5 兩處更正（Bruce 實測 v1.11.4：時脈變 80 kHz、資料仍錯）：

   ① **`0x9E` 在 FT2232H 上不存在。** FTDI 命令表原文：
        「Open Collector / Tristate — 0x9E (**FT232H only**)」
      他的治具是 `ID=0x04036010` ⇒ **PID 0x6010 ＝ FT2232H**，不是 FT232H。
      MPSSE 收到不認識的 opcode 會回 `0xFA <bad opcode>`，**而且後面的 `07` `00`
      會被當成 opcode 繼續解析** ⇒ 整串命令流從那裡開始錯位。
      🔴 這很可能就是資料讀錯的元兇，不只是時脈。⇒ **移除。**
      （開汲極改回由 libMPSSE 的 `I2C_ENABLE_DRIVE_ONLY_ZERO` 負責 ——
        Options 的 struct 對齊已在 v1.11.2 修好，那個位元現在是真的有生效。）

   ② **base 與除數公式必須成對。** v1.11.4 送 `0x8A`（關 divide-by-5 ⇒ 60 MHz）
      卻搭 `30e6/f-1`；實測 400k 設定量到 **80 kHz**，而
      `12e6/((74+1)*2) = 80,000` **完全吻合** ⇒ `0x8A` 沒有生效、base 仍是 12 MHz。
      ⇒ **不要碰 divide-by-5 這個開關**（不送 0x8A 也不送 0x8B），維持 12 MHz base，
        用 **`div = 6e6/f - 1`** —— 這就是原廠 `DLL_I2C_BCB` 的 `SetClock`
        （`dll_i2c.asm 0x4017bc`）那一套，**已經被他量到 400 kHz 證實過**。
        400 kHz ⇒ div = 14 ⇒ `12e6/((14+1)*2) = 400,000`。

   🔴 教訓（寫在這裡，不要再犯第三次）：**抄參考實作時，每一道命令都要對照
      晶片型號與官方定義核一次。** v1.11.4 是整份從 dg-measure.html 的 WebUSB
      路徑抄過來，既沒確認每道命令在這顆晶片上支援，也沒確認 base 與除數成對。

   ③ 🔴 **三相時脈要「開」，這推翻我先前「跟隨原廠關閉」的決定。**
      先前的理由是原廠 `DLL_I2C_BCB` 明示送 `0x8D`。**那個推論有缺陷**：原廠是
      **整套時序自己控**（自己組每一道命令、自己決定 setup 時間），我們是拿
      FTDI 的通用 MPSSE 指令在拼，前提不同，不能只因為原廠關著就跟著關。
      FTDI **AN_113** 原文：三相時脈「**Required for correct I2C timing on
      FT2232H and FT4232H**」，它多一個 phase 讓資料線在時脈上升**之前**先建立。

      Bruce 用 LA 直接反推出線上的位元組就是 `61 41 34`（正確值 `B4`）
      ⇒ **錯誤發生在實體匯流排上**，軟體側（記帳／偏移／bit 或 byte 模式）全部已排除。
      指紋是零反例的「bit7 永遠讀成 0、反向從不發生」，而 bit7 是 MSB-first 的
      **第一個位元**，它的前一道命令正是我們自己把 SDA 拉低送 ACK：
          `13 00 00`（我們拉低 SDA）→ `80 00 01`（放開轉輸入）→ `20 00 00`（立刻採樣）
      放開後靠上拉電阻回到高電位需要時間，我們沒給 ⇒ 第一個位元採到殘留的低電位。
      這也解釋為什麼 80 kHz 時只錯 2 個、400 kHz 時錯更多。

   現在送出的每一道（全部對照官方 MPSSE 命令表與晶片型號，逐條標明依據）：
     0x97          關 adaptive clocking          —— FT2232H/FT4232H/FT232H 皆支援
     **0x8C**      **開**三相                    —— AN_113：FT2232H/FT4232H 的 I2C 必需
     0x85          關 loopback                   —— 全系列支援（AN_135 同步程序）
     0x86 lo hi    時脈除數                      —— 全系列支援；base 12 MHz（未動 div-by-5）
     0x80 03 03    匯流排閒置：SCL/SDA 拉高、輸出 —— 全系列支援
   **不送**：`0x9E`（FT232H only）、`0x8A`/`0x8B`（刻意不碰，維持 base 與公式成對）

   🔴 **兩條路徑的三相設定不同**（raw 開、libMPSSE 關），所以**每次切換路徑都要重設**，
      否則慢路徑會跑在 raw 的設定下 —— v1.11.4 的 80 kHz 就是這樣污染過去的。
      這個函式因此改成 `raw_set_mode(useRaw, hz)`，**open 每次都呼叫**（不只第一次），
      而且慢路徑那一支會把三相關回去、除數改回未補償的值（與 libMPSSE 程式化的一致）。 */
static int raw_set_mode(int useRaw, uint32_t hz) {
    unsigned char c[32], rb[8];
    unsigned long wrote = 0, red = 0;
    unsigned short div;
    int n = 0, spins = 0, tp;
    if (!DGH_RAW_AVAILABLE || !g_handle) return 0;
    if (!hz) hz = 400000;
    /* 🔴 三相只在 raw 路徑上可能開；慢路徑（libMPSSE, Options=3）一律關。 */
    tp = useRaw ? (dgh_three_phase ? 1 : 0) : 0;
    div = dgh_mp_divisor(hz, tp);            /* 🔴 三相與除數成對，見 proto.h */
    c[n++] = 0x97;
    c[n++] = (unsigned char)(tp ? 0x8C : 0x8D);
    c[n++] = 0x85;
    c[n++] = 0x86; c[n++] = (unsigned char)(div & 0xFF); c[n++] = (unsigned char)((div >> 8) & 0xFF);
    c[n++] = 0x80; c[n++] = DGH_MP_HI; c[n++] = DGH_MP_DIR_WR;
    if (p_FT_Write(g_handle, c, (unsigned long)n, &wrote) != 0 || (int)wrote != n) {
        logline("  raw_init: FAILED (wrote=%lu of %d)", wrote, n);
        return 0;
    }
    logline("  raw_init: mode=%s  3-phase=%s  divisor=%u  programmed=%u Hz  EXPECTED ON THE WIRE=%u Hz"
            "  (12 MHz base; 0x9E not sent = FT232H only; 0x8A/0x8B not touched)",
            useRaw ? "fast" : "normal", tp ? "ON (0x8C)" : "off (0x8D)", div,
            12000000u / (((unsigned int)div + 1u) * 2u), dgh_mp_wire_hz(div, tp));

    /* ═══ 🔴 MPSSE 同步自檢（AN_135 的標準做法）═══════════════════════════════
       送一個**不存在**的 opcode，MPSSE 必須回 `0xFA <該 opcode>`。
       它不動匯流排，純粹回答「命令流有沒有失步」。
       存在的理由：v1.11.4 送了 FT2232H 不支援的 `0x9E`，它的兩個參數被當成
       opcode 繼續解析 ⇒ **整串錯位、資料靜默讀錯**，而我們毫無所覺。
       有了這一步，這種狀態就變成**可偵測**而不是靜默讀錯。 */
    { unsigned char bad = 0xAB;
      if (p_FT_Purge) p_FT_Purge(g_handle, 3);
      if (p_FT_Write(g_handle, &bad, 1, &wrote) != 0 || wrote != 1) {
          logline("  raw_init: sync probe write failed"); return 0; }
      { int total = 0;
        while (total < 2 && spins < 200) {
            red = 0;
            if (p_FT_Read(g_handle, rb + total, (unsigned long)(2 - total), &red) != 0) break;
            if (red == 0) { spins++; Sleep(1); } else total += (int)red;
        }
        if (total >= 2 && rb[0] == 0xFA && rb[1] == 0xAB) {
            logline("  raw_init: sync OK (sent 0xAB, got FA AB) -- command stream is aligned");
            return 1;
        }
        logline("  raw_init: 🔴 SYNC FAILED (sent 0xAB, got %d bytes: %02X %02X)"
                " -- command stream is NOT aligned; refusing to use the fast path",
                total, total > 0 ? rb[0] : 0, total > 1 ? rb[1] : 0);
        /* 🔴 失步就**不要用** raw 路徑 —— 靜默讀錯比慢更糟。 */
        dgh_raw_mpsse = 0;
        return 0;
      }
    }
}
/* 🔴 每次 open 都要重新套用當前模式對應的通道設定。
   不能只在第一次 open 做：`i2c_open()` 在 `g_opened` 時會直接 return，
   而自動驗證正是用「再送一次 open 切模式」在快慢之間來回 ——
   不重設的話，慢路徑就會跑在 raw 的三相與除數上（v1.11.4 的 80 kHz 污染）。 */
static void i2c_apply_mode(uint32_t hz) {
    if (!g_opened) return;
    if (DGH_RAW_AVAILABLE) raw_set_mode(dgh_raw_mpsse, hz);
    else logline("  raw_init: skipped (no d2xx) -- libMPSSE keeps the channel");
}
static int i2c_open(uint32_t clockHz) {
    double t0 = now_ms(), t;
    if (!g_dllOk) { logline("  open    : ABORT dll not loaded"); return 0; }
    if (g_opened) { logline("  open    : already open, reuse"); return 1; }
    logline("  open    : begin (clock %u Hz)", clockHz);
    if (p_Init) { p_Init(); logline("  open    : Init_libMPSSE done (+%.0f ms)", now_ms()-t0); }
    t = now_ms();
    if (p_GetNum(&g_numChannels)!=FT_OK || g_numChannels==0) {
        logline("  open    : ABORT GetNumChannels failed or 0 (+%.0f ms)", now_ms()-t); return 0; }
    logline("  open    : GetNumChannels = %u (+%.0f ms)", g_numChannels, now_ms()-t);
    t = now_ms();
    if (p_Open(0,&g_handle)!=FT_OK) {
        logline("  open    : ABORT OpenChannel(0) failed (+%.0f ms)", now_ms()-t); return 0; }
    logline("  open    : OpenChannel(0) ok (+%.0f ms)", now_ms()-t);
    /* 🔴 Options=3 = I2C_DISABLE_3PHASE_CLOCKING(0x1) | I2C_ENABLE_DRIVE_ONLY_ZERO(0x2).
       Three-phase is deliberately OFF. FTDI AN_113 says I2C "should" enable it (0x8C),
       but the vendor DLL explicitly DISABLES it -- DLL_I2C_BCB.dll sends 0x8D at
       0x401c01, and 0x8C appears 0 times in the whole image. Per Bruce's ruling the
       vendor is the spec (it demonstrably works); AN_113 only explains why.
       Enabling three-phase would also drop the real clock to 2/3 of the setting
       (400k -> 266k), which breaks the "set 400k, measure 400k" acceptance criterion.

       🔴🔴 RETRACTED 2026-09-19. This comment used to claim "the requested clock is
       the real wire clock, no compensation needed", reasoning that Options bit0 makes
       _I2C_InitChannel skip the ClockRate*3/2 adjustment (libmpsse 0x6f583693).
       **Bruce measured it with a logic analyser: setting 400000 puts 600 kHz on the
       wire -- exactly 1.5x.** So the *3/2 DID happen. The measurement is the fact;
       my reading of the disassembly was wrong somewhere, and I have NOT yet found
       where -- I re-checked that _FT_InitChannel passes the clock through untouched
       (%esi from 0x6f582647 straight to _Mid_SetClock at 0x6f58281e) and that
       _Mid_SetClock uses divisor = 6e6/f - 1 with 0x8B (12 MHz base), which would
       give 400 kHz. I cannot reconcile that with 600 kHz and I am not going to
       invent a reason. See findings.md.

       🔴 So we stop depending on libMPSSE's clock arithmetic altogether: after
       InitChannel we program the divisor OURSELVES, so the last word on the wire
       clock is ours and is independent of whatever libMPSSE did. We send 0x8B
       (enable divide-by-5 => 12 MHz base) and 0x86 with divisor = 6e6/f - 1 --
       the same base/formula pair the vendor's SetClock uses (dll_i2c.asm 0x4017bc).
       400000 -> divisor 14 -> 12e6/((1+14)*2) = 400,000 Hz.
       This is verifiable on Bruce's analyser, which is the point. */
    /* 🔴 memset 先清乾淨：padding(offset 5~7) 若留著堆疊垃圾，日後任何人把
       struct 改回 packed 時症狀會變成「有時對有時錯」，比穩定壞掉更難查。 */
    ChannelConfig cfg; memset(&cfg, 0, sizeof(cfg));
    cfg.ClockRate=clockHz?clockHz:150000; cfg.LatencyTimer=1; cfg.Options=3;
    /* 🔴 把結構佈局印出來 —— 600 kHz 的根因就是這三個數字錯了，而且**完全沒有徵兆**：
       它不會報錯，只會讓 DLL 讀到垃圾。編譯期斷言已經擋住了，這一行是給
       Bruce 的 log 用的：他丟 log 過來我們就能直接確認他手上那支是對的。 */
    logline("  open    : ChannelConfig sizeof=%d Options@%d LatencyTimer@%d -> Options=0x%X (3phase-off|drive0)",
            (int)sizeof(ChannelConfig), (int)offsetof(ChannelConfig, Options),
            (int)offsetof(ChannelConfig, LatencyTimer), cfg.Options);
    t = now_ms();
    if (p_Init2(g_handle,&cfg)!=FT_OK) {
        logline("  open    : ABORT InitChannel failed (+%.0f ms)", now_ms()-t);
        p_Close(g_handle); g_handle=NULL; return 0; }
    g_opened=1;
    logline("  open    : InitChannel ok (clock req %u Hz, latency 1, options 3) (+%.0f ms)",
            cfg.ClockRate, now_ms()-t);
    i2c_apply_mode(cfg.ClockRate);
    logline("  open    : DONE in %.0f ms total", now_ms()-t0);
    return 1;
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
/* g_lastUs：最近一次 libMPSSE 呼叫（位址相位＋資料相位）花了幾微秒。
   回傳給網頁放進 log，讓「時間到底花在哪一層」變成可量的事而不是猜的。 */
static double g_lastUs = 0;
static int g_lastRaw = 0;        /* 最近一次用的是不是 raw MPSSE 路徑 */
static int g_lastUsbRt = 0;      /* 最近一次的 USB 往返次數（raw 路徑才數得準） */

/* ═══ 🔴 直接組 MPSSE 命令 ⇒ 一次 FT_Write ＋ 一次 FT_Read ═══════════════════
   對照：libMPSSE 非 fast 路徑是「每 byte 送命令 → sleep 1ms → 讀 1 byte」，
   ⇒ **每個 byte 一次強制 USB 往返**（FTDI recipe 每個 byte 都送 `0x87`
   Send Immediate；Bruce 2026-09-19 實測 byte 間隔 10~15 ms）。
   這裡整段命令**只在最尾巴放一個 `0x87`**（由 test_proto.c 的檢查釘住：4096 byte
   的命令共 49,534 byte，`0x87` 恰好 1 個且是最後一個位元組），
   所以是 **1 次 FT_Write ＋ 1 次 FT_Read、0 睡眠、0 中途 flush**。
   ACK 一併在同一批回來，逐個檢查；**任何一個 NACK 都要回報，不可以靜默吞掉**。 */
static FT_STATUS mpsse_xfer(const unsigned char* cmd, int cmdLen,
                            int expectIn, unsigned char* in, int* gotIn){
    unsigned long wrote = 0, red = 0;
    unsigned long st;
    if(!DGH_RAW_AVAILABLE) return 0xFFFFFFF0u;
    if(p_FT_Purge) p_FT_Purge(g_handle, 3 /* RX|TX */);
    st = p_FT_Write(g_handle, (void*)cmd, (unsigned long)cmdLen, &wrote);
    if(st != 0 || (int)wrote != cmdLen) return st ? st : 0xFFFFFFF1u;
    if(expectIn > 0){
        /* FT_Read 可能分次回來（USB 封包切割），湊滿或逾時為止。 */
        int total = 0, spins = 0;
        while(total < expectIn && spins < 2000){
            red = 0;
            st = p_FT_Read(g_handle, in + total, (unsigned long)(expectIn - total), &red);
            if(st != 0) return st;
            if(red == 0){ spins++; Sleep(1); } else { total += (int)red; spins = 0; }
        }
        if(gotIn) *gotIn = total;
        if(total < expectIn) return 0xFFFFFFF2u;
    } else if(gotIn) *gotIn = 0;
    return 0;
}
/* 把回來的那一批拆成 ACK 與資料。ACK 與資料是**按命令順序交錯**回來的，
   所以要照組命令的順序取：先 acks 個 ACK byte（位址相位與 slave），
   讀取時資料 byte 與每個 byte 後的 ACK/NACK 送出不產生 input，
   所以資料是連續的最後 din 個 byte。 */
static FT_STATUS raw_read(uint32_t slave, uint32_t addr, uint32_t awid,
                          uint32_t len, uint8_t* out, uint32_t* got){
    /* static：4096 byte 的命令序列約 50 KB，放在堆疊上會爆（預設執行緒堆疊 1 MB，
       但這支是單一連線單執行緒處理，static 更安全也省得每次清零）。 */
    static unsigned char cmd[DGH_MP_CMD_MAX];
    static unsigned char in[DGH_READ_MAX + 64];
    int acks = 0, din = 0, gotIn = 0;
    int n = dgh_mp_build_read(cmd, (int)sizeof(cmd), slave, addr, (int)awid, (int)len, &acks, &din);
    FT_STATUS st;
    if(n < 0) return 0xFFFFFFFEu;
    if(acks + din > (int)sizeof(in)) return 0xFFFFFFFEu;
    /* 🔴 快路徑讀錯時，光看資料看不出是命令組錯還是匯流排錯。把命令序列的關鍵
       特徵印出來（Bruce 2026-09-19）：0x87 的位置、位址相位要收幾個 ACK、
       最後一個資料 byte 有沒有送 NACK(0x80)。這三個是最可能出錯的地方。 */
    {
        /* 🔴 更正（2026-09-19）：這一行原本印 `cmd[n-2]` 當作 NACK 位元組，那是**錯的
           偏移** —— 命令尾端是 STOP 序列（`80 03 03 / 80 00 00`）再接 `0x87`，
           所以 cmd[n-2] 是放開匯流排那一條的方向欄（0x00），不是 ACK 值。
           實際的 NACK 在最後一個 `0x13` 的第 3 個位元組，dump 出來確認是 **0x80，正確**。
           ⇒ 之前 log 顯示的 `lastAckByte=0x00(NACK expected 0x80)` 是**這一行在說謊**，
           不是命令有問題；structural 測試驗的也確實是同一個緩衝區。
           現在改成掃出最後一個 0x13 再印，才不會再誤導人。 */
        int i87 = -1, last13 = -1, i;
        for(i = 0; i < n; ){
            unsigned char op = cmd[i];
            if(op == 0x80 || op == 0x82) i += 3;
            else if(op == 0x11) i += 3 + (cmd[i+1] | (cmd[i+2] << 8)) + 1;
            else if(op == 0x13){ last13 = i; i += 3; }
            else if(op == 0x20) i += 3;
            else if(op == 0x22) i += 2;
            else { if(op == 0x87) i87 = i; i += 1; }
        }
        logline("  raw_read: cmdLen=%d 0x87@%d(last=%d) acks=%d din=%d lastNACK@%d=0x%02X(expect 0x80)",
                n, i87, n - 1, acks, din, last13, (last13 >= 0) ? cmd[last13 + 2] : 0xFF);
    }
    st = mpsse_xfer(cmd, n, acks + din, in, &gotIn);
    g_lastUsbRt = 2;
    if(st != 0) return st;
    {   /* 位址相位收回來的 ACK 位元組原樣印出 —— 判讀是 ACK 還是 NACK 靠 bit0/bit7 */
        char b[64]; int i, o = 0;
        for(i = 0; i < acks && o < (int)sizeof(b) - 4; i++)
            o += snprintf(b + o, sizeof(b) - o, "%02X ", in[i]);
        b[o] = 0;
        logline("  raw_read: addr-phase ACK bytes = %s(got %d of %d in)", b, gotIn, acks + din);
    }
    /* 🔴 ACK 檢查：任何一個 NACK 都是錯誤。漏報才是危險的那一邊。 */
    for(int i = 0; i < acks; i++){
        if(!dgh_mp_ack_ok(in[i])){
            logline("  raw_read : NACK at ack #%d (0x%02X) slave=0x%02X addr=0x%X", i, in[i], slave, addr);
            return 0xFFFFFFF3u;
        }
    }
    for(uint32_t i = 0; i < len; i++) out[i] = in[acks + i];
    if(got) *got = len;
    return 0;
}
static FT_STATUS raw_write(uint32_t slave, uint32_t addr, uint32_t awid,
                           const uint8_t* data, int dlen, uint32_t* got){
    unsigned char cmd[16384], in[512];
    int acks = 0, din = 0, gotIn = 0;
    int n = dgh_mp_build_write(cmd, (int)sizeof(cmd), slave, addr, (int)awid, data, dlen, &acks, &din);
    FT_STATUS st;
    if(n < 0) return 0xFFFFFFFEu;
    if(acks > (int)sizeof(in)) return 0xFFFFFFFEu;
    st = mpsse_xfer(cmd, n, acks, in, &gotIn);
    g_lastUsbRt = 2;
    if(st != 0) return st;
    for(int i = 0; i < acks; i++){
        if(!dgh_mp_ack_ok(in[i])){
            logline("  raw_write: NACK at ack #%d (0x%02X) slave=0x%02X addr=0x%X", i, in[i], slave, addr);
            return 0xFFFFFFF3u;
        }
    }
    if(got) *got = (uint32_t)dlen;
    return 0;
}

static FT_STATUS i2c_read_ex(uint32_t slave, uint32_t addr, uint32_t awid, uint32_t len, uint8_t* out, uint32_t* got){
    uint8_t ab[4]; int n=build_offset(ab,addr,awid);
    double t0 = now_ms();
    FT_STATUS s;
    if(n<0) return 0xFFFFFFFEu;
    g_lastRaw = 0; g_lastUsbRt = 0;
    if(dgh_raw_mpsse && DGH_RAW_AVAILABLE && len <= DGH_READ_MAX){
        g_lastRaw = 1;
        s = raw_read(slave, addr, awid, len, out, got);
    } else {
        /* 🔴 走慢路徑時**一定要說出是哪一個條件擋掉的**。Bruce 回報 v1.11.1 間隔
           仍是 15~16 ms，而舊 log 只寫 mode=slow，三個條件哪一個不成立完全看不出來，
           害他和 Dispatch 多繞了一圈。三個都印，不要只印第一個。 */
        /* 🔴 「旗標關」要講清楚**是誰關的**。2026-09-19 實機 log 出現
           `<-- flag off`，Dispatch 一時分不出是 bridge 自己關的還是網頁送 0 ——
           實際上 bridge 從不自己關它（預設值由 --raw-mpsse 決定，其餘一律
           來自網頁的 open 訊息）。把來源寫進同一行，不要讓人再猜一次。 */
        logline("  i2c_read: SLOW path because rawmpsse=%d d2xx=%d len=%u(max %d)%s",
                dgh_raw_mpsse, DGH_RAW_AVAILABLE ? 1 : 0, len, DGH_READ_MAX,
                !dgh_raw_mpsse ? "  <-- flag off: THE PAGE SENT rawmpsse:0 (bridge never turns it off by itself)"
                  : (!DGH_RAW_AVAILABLE ? "  <-- ftd2xx.dll FT_Write/FT_Read not resolved"
                                        : "  <-- length over limit"));
        if(!dgh_raw_mpsse) logline("            page=%s -- if that is not the latest, the tab was not reloaded", g_pageVer);
        if(n>0){ uint32_t tr=0; p_Write(g_handle, slave, (uint32_t)n, ab, &tr, OPT_READ_ADDR); }  /* slave is 7-bit, no <<1 */
        s = p_Read(g_handle, slave, len, out, got, OPT_READ_DATA);   /* slave is 7-bit, no <<1 */
        /* libMPSSE 非 fast 路徑：每 byte 兩次 USB 往返（命令 ＋ 讀回） */
        g_lastUsbRt = dgh_fast_read ? 2 : (int)(len * 2 + (n ? 2 : 0));
    }
    g_lastUs = (now_ms() - t0) * 1000.0;
    logline("  i2c_read : slave=0x%02X addr=0x%X awid=%u len=%u mode=%s -> %u bytes, %.0f us, usb_rt=%d",
            slave, addr, awid, len,
            g_lastRaw ? "raw-mpsse" : (dgh_fast_read ? "fast" : "slow"),
            got ? *got : 0, g_lastUs, g_lastUsbRt);
    return s;
}
static FT_STATUS i2c_write_ex(uint32_t slave, uint32_t addr, uint32_t awid, const uint8_t* data, int dlen, uint32_t* got){
    uint8_t buf[RAW_MAX_DATA+4];
    if(dlen<0||dlen>RAW_MAX_DATA) return 0xFFFFFFFFu;
    int fl=dgh_build_write_frame(buf,(int)sizeof(buf),addr,awid,data,dlen);
    double t0;
    if(fl<0) return 0xFFFFFFFFu;
    t0 = now_ms();
    uint32_t tr=0; FT_STATUS s;
    g_lastRaw = 0; g_lastUsbRt = 0;
    if(dgh_raw_mpsse && DGH_RAW_AVAILABLE){
        g_lastRaw = 1;
        s = raw_write(slave, addr, awid, data, dlen, &tr);
    } else {
        s = p_Write(g_handle, slave, (uint32_t)fl, buf, &tr, OPT_WRITE);   /* slave is 7-bit, no <<1 */
        g_lastUsbRt = 2;
    }
    g_lastUs = (now_ms() - t0) * 1000.0;
    logline("  i2c_write: slave=0x%02X addr=0x%X awid=%u dlen=%d -> %u bytes, %.0f us",
            slave, addr, awid, dlen, tr, g_lastUs);
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
/* 🔴 v1.6.0：持有者可以把自己標成「忙碌中」（dg 正在跑 Gray 0~255 量測）。
   忙碌中時**拒絕接手** —— 為了「切到哪頁哪頁自動接手」而讓正在跑的量測被
   打斷，是拿無腦換掉正確性，不做。lock 只對持有者有效，持有權一換就歸零。 */
static int    g_lockOwner = -1;     /* 宣告忙碌中的 client；-1＝沒人忙 */
static int    i2c_locked(void){ return g_lockOwner>=0 && g_lockOwner==g_ownerIdx; }

static int cl_add(SOCKET s){
    for(int i=0;i<MAX_CLIENTS;i++) if(!g_cl[i].used){
        g_cl[i].s=s; g_cl[i].used=1; g_cl[i].isWs=0; return i; }
    return -1;
}
/* 丟掉一個 client。🔴 它若是持有者就**一定**要放掉 I2C channel ——
   不放的話 helper 會一直握著治具，下一個頁面（與原廠 PQ Tool）都開不起來。 */
static void cl_drop(int i){
    if(i<0||i>=MAX_CLIENTS||!g_cl[i].used) return;
    /* 🔴 lock 一定要跟著持有權一起消失。忘了清的後果是最惡劣的那一種：
       分頁關掉之後 helper 永遠認為「有人忙碌中」，所有接手都被拒，
       而且畫面上沒有任何東西可以按 —— 只能重開 helper，正好是 Bruce 要免掉的事。 */
    if(g_lockOwner==i){ logline("[ws] busy-lock owner #%d gone -> lock cleared", i); g_lockOwner=-1; }
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
    /* 🔴 4096 byte 的讀取回覆是一個 4096 個數字的 JSON 陣列（最多 4 字元＋逗號），
       約 16.4 KB ⇒ 8192 不夠。放大到 24 KB 才裝得下，否則會被 snprintf 截斷成
       壞掉的 JSON（而且是**安靜**截斷）。 */
    static char rep[24576];
    if(strcmp(type,"open")==0){
        /* 網頁也可以指定讀取模式（open 帶 "fastread":0）⇒ 不必重開程式就能 A/B 比較。 */
        { long fr = dgh_json_int(json,"fastread",-1); if(fr==0) dgh_fast_read=0; else if(fr==1) dgh_fast_read=1; }
        /* 🔴 網頁版本：舊網頁不會送這個欄位，所以「有沒有這個欄位」本身就是判準 ——
           不必做版本字串的大小比較（那需要挑一個門檻，而挑門檻就是拍腦袋）。
           這一輪繞一圈的原因就是 log 裡只有 exe 版本、沒有網頁版本。 */
        { int hasPage = dgh_json_str(json,"page",g_pageVer,sizeof(g_pageVer));
          if(!hasPage){ snprintf(g_pageVer,sizeof(g_pageVer),"%s","(not sent -- page older than i2c v1.13.3)"); }
          logline("  open    : page=%s  bridge=%s", g_pageVer, I2C_BRIDGE_VERSION); }
        /* 🔴 三相開關也由網頁帶（預設開）。Bruce 要一次量完開／關兩種。 */
        { long t3 = dgh_json_int(json,"threephase",-1); if(t3==0) dgh_three_phase=0; else if(t3==1) dgh_three_phase=1; }
        { long rm = dgh_json_int(json,"rawmpsse",-1); if(rm==0) dgh_raw_mpsse=0; else if(rm==1) dgh_raw_mpsse=1;
          /* 🔴 印出「收到什麼」與「套用後是什麼」兩個值。Bruce 2026-09-19 回報
             v1.11.1 的間隔仍是 15~16 ms（＝ Windows 排程器 tick ＝ 走 libMPSSE 那條），
             而我們**無法從既有 log 分辨**是旗標沒送到、沒被收下、還是後面被擋掉。
             這一行把「沒被收下」這個可能性直接變成可觀測的。 */
          logline("  open    : rawmpsse field=%ld -> dgh_raw_mpsse=%d ; d2xx %s",
                  rm, dgh_raw_mpsse, DGH_RAW_AVAILABLE ? "available" : "MISSING (fast path impossible)"); }
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
            /* 🔴 v1.6.0：持有者宣告忙碌中（量測進行中）就**拒絕接手**。
               這條比「自動接手」優先 —— 切分頁不可以打斷正在跑的量測。 */
            if(i2c_locked()){
                snprintf(rep,sizeof(rep),
                    "{\"type\":\"result\",\"id\":%ld,\"cmd\":\"open\",\"ok\":false,\"busy\":true,"
                    "\"locked\":true,\"err\":\"the holding page is busy (measuring)\"}", id);
                logline("[cmd] open(takeover) from #%d -> REFUSED (owner #%d is busy)", idx, g_ownerIdx);
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
        int wasOpen = g_opened;
        int ok=i2c_open(hz);
        /* 🔴 已經開著時 i2c_open() 直接 return，不會重跑 init ——
           但網頁**正是用「再送一次 open」在快慢模式之間切換**（自動驗證就是這樣做的）。
           兩條路徑的三相與除數不同，不在這裡重設，慢路徑就會跑在 raw 的設定上。
           v1.11.4 實測的 80 kHz 就是這樣污染過去的。 */
        if(ok && wasOpen) i2c_apply_mode(hz);
        if(ok){ if(g_ownerIdx!=idx) g_lockOwner=-1; g_ownerIdx=idx; }
        snprintf(rep,sizeof(rep),"{\"type\":\"result\",\"id\":%ld,\"cmd\":\"open\",\"ok\":%s,\"channels\":%u%s}",
                 id, ok?"true":"false", g_numChannels, g_dllOk?"":",\"err\":\"libMPSSE not loaded\"");
        logline("[cmd] open from #%d -> %s (channels=%u)", idx, ok?"OK":"FAIL", g_numChannels);
        ws_send_text(c,rep); return;
    }
    if(strcmp(type,"close")==0){
        if(g_lockOwner==idx) g_lockOwner=-1;
        if(g_ownerIdx==idx){ i2c_close(); g_ownerIdx=-1; logline("[cmd] close from #%d -> released", idx); }
        snprintf(rep,sizeof(rep),"{\"type\":\"result\",\"id\":%ld,\"cmd\":\"close\",\"ok\":true}",id); ws_send_text(c,rep); return; }
    /* ── lock（proto 3）：持有者宣告「忙碌中／不忙了」───────────────────────
       🔴 只有持有者能設。非持有者設得動的話，任何一頁都可以把 channel 凍住，
          那就從保護變成阻斷。設不動時回 ok:false 但**不當成錯誤畫在畫面上** ——
          頁面那邊是 fire-and-forget。 */
    if(strcmp(type,"lock")==0){
        int on=(int)dgh_json_int(json,"on",1);
        int ok=(g_ownerIdx==idx);
        if(ok){
            if(on) g_lockOwner=idx; else if(g_lockOwner==idx) g_lockOwner=-1;
            logline("[cmd] lock from #%d -> %s", idx, on?"BUSY (takeover refused)":"free");
        }
        snprintf(rep,sizeof(rep),
            "{\"type\":\"result\",\"id\":%ld,\"cmd\":\"lock\",\"ok\":%s,\"locked\":%s}",
            id, ok?"true":"false", i2c_locked()?"true":"false");
        ws_send_text(c,rep); return;
    }
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
        /* 🔴 上限從 1024 放寬到 4096（2026-09-19）。
           原廠的標準操作就是「slave 0x50、offset 寬度 2、**一次讀 4096**」
           （`RomCodeProcessUI.py:30842` 與 `:31669`，沒有任何 chunk 迴圈）。
           1024 是我們自己加的，不是協定或硬體限制。
           **但仍然要有上限**：`rep` 是固定大小的緩衝區，沒有上限就會安靜截斷 JSON。 */
        if(len>DGH_READ_MAX) len=DGH_READ_MAX;
        static uint8_t buf[DGH_READ_MAX]; uint32_t got=0;
        FT_STATUS st=i2c_read_ex(slave,addr,awid,len,buf,&got);
        int o=snprintf(rep,sizeof(rep),"{\"type\":\"result\",\"id\":%ld,\"cmd\":\"read\",\"ok\":%s,\"status\":%u,\"us\":%.0f,\"fast\":%s,\"raw\":%s,\"usbrt\":%d,\"data\":[",
                       id,(st==FT_OK)?"true":"false",st,g_lastUs,
                       dgh_fast_read?"true":"false", g_lastRaw?"true":"false", g_lastUsbRt);
        for(uint32_t i=0;i<got&&o<(int)sizeof(rep)-16;i++) o+=snprintf(rep+o,sizeof(rep)-o,"%s%u",i?",":"",buf[i]);
        o+=snprintf(rep+o,sizeof(rep)-o,"]}");
        ws_send_text(c,rep); return;
    }
    /* ── rawwrite (proto 2): the I2C test tool's write ────────────────────────
       🔴 NO address whitelist on purpose. A test tool that cannot write
          everywhere is not a test tool; Bruce asked for exactly this. The
          safeguard is observability, not refusal: every rawwrite is written to
          i2c-bridge.log in full (slave, offset width, address, every byte). */
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
        snprintf(rep,sizeof(rep),"{\"type\":\"result\",\"id\":%ld,\"cmd\":\"rawwrite\",\"ok\":%s,\"status\":%u,\"transferred\":%u,\"us\":%.0f,\"raw\":%s,\"usbrt\":%d}",
                 id,(st==FT_OK)?"true":"false",st,got,g_lastUs,
                 g_lastRaw?"true":"false", g_lastUsbRt);
        ws_send_text(c,rep); return;
    }
    if(strcmp(type,"write")==0){
        uint32_t slave=(uint32_t)dgh_json_int(json,"slave",0x60);
        uint32_t addr=(uint32_t)dgh_json_int(json,"addr",0);
        uint8_t data[60]; int dn=dgh_json_int_array(json,"data",data,sizeof(data));
        if(dn<0){ snprintf(rep,sizeof(rep),"{\"type\":\"result\",\"id\":%ld,\"cmd\":\"write\",\"ok\":false,\"err\":\"bad data\"}",id); ws_send_text(c,rep); return; }
        /* 🔴 v1.6.0：改用 dgh_write_allowed()（proto header 的區間表，七顆 IC 的
           ptg bank ＋ cursor 暫存器）。原本寫死 0x1200–0x12FF 會把 EM02／E512
           那幾顆的出圖全部擋掉 —— 同一支檢查在兩個地方各寫一份就是這樣分岔的。 */
        if(!dgh_write_allowed(addr,dn)){
            snprintf(rep,sizeof(rep),"{\"type\":\"result\",\"id\":%ld,\"cmd\":\"write\",\"ok\":false,\"err\":\"addr blocked by bridge whitelist\"}",id);
            logline("[cmd] write BLOCKED addr=0x%04X x%d", addr, dn); ws_send_text(c,rep); return;
        }
        if(!g_opened){ snprintf(rep,sizeof(rep),"{\"type\":\"result\",\"id\":%ld,\"cmd\":\"write\",\"ok\":false,\"err\":\"not open\"}",id); ws_send_text(c,rep); return; }
        uint32_t got=0; FT_STATUS st=i2c_write(slave,addr,data,dn,&got);
        snprintf(rep,sizeof(rep),"{\"type\":\"result\",\"id\":%ld,\"cmd\":\"write\",\"ok\":%s,\"status\":%u,\"transferred\":%u}",id,(st==FT_OK)?"true":"false",st,got);
        ws_send_text(c,rep); return;
    }
    /* ═══ 🔴 `note`：把**網頁端**的診斷寫進同一個 log 檔 ═══════════════════════
       起因（Bruce／Dispatch 2026-09-19）：自動驗證失敗是發生在網頁端，只留在網頁的
       log 區；他傳給我們的是 `i2c-bridge.log`，於是那一次失敗**完全看不到**，
       整整繞了一圈。兩邊的診斷必須匯流到同一個檔案。
       純粹記錄，不碰任何硬體狀態，也不需要持有 channel。 */
    if(strcmp(type,"note")==0){
        char msg[512];
        if(!dgh_json_str(json,"msg",msg,sizeof(msg))) msg[0]=0;
        logline("  [page]  : %s", msg[0]?msg:"(empty note)");
        snprintf(rep,sizeof(rep),"{\"type\":\"result\",\"id\":%ld,\"cmd\":\"note\",\"ok\":true}",id);
        ws_send_text(c,rep); return;
    }
    if(strcmp(type,"ping")==0){
        /* 🔴 wire 欄位仍叫 `helper`（不是 `bridge`）：改名只為了讓人看得懂，
           而這個欄位是**協定**。改掉它，手上還拿著舊 exe 的人配新頁面、或舊頁面
           配新 exe，版本欄位都會變成 undefined ⇒ 顯示與相容性判斷一起壞。
           使用者看不到這個字串，所以留舊名沒有任何代價。 */
        snprintf(rep,sizeof(rep),"{\"type\":\"pong\",\"id\":%ld,\"helper\":\"%s\",\"proto\":%d,\"dll\":%s,\"owner\":%s,\"locked\":%s}",
                 id,I2C_BRIDGE_VERSION,I2C_BRIDGE_PROTO,g_dllOk?"true":"false",
                 (g_ownerIdx==idx)?"true":"false", i2c_locked()?"true":"false");
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
        "{\"type\":\"hello\",\"helper\":\"%s\",\"proto\":%d,\"dll\":%s,\"busy\":%s,\"locked\":%s}",
        I2C_BRIDGE_VERSION,I2C_BRIDGE_PROTO,g_dllOk?"true":"false",
        (g_ownerIdx>=0)?"true":"false", i2c_locked()?"true":"false");
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
        "<p>Only files sitting next to i2c-bridge.exe are served (no sub-folders).</p></body>", what);
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
        "<!doctype html><meta charset=utf-8><title>i2c-bridge</title>"
        "<meta name=viewport content=\"width=device-width,initial-scale=1\">"
        "<body style='margin:0;background:#0f172a;color:#e2e8f0;font:15px/1.6 -apple-system,\"PingFang TC\",\"Noto Sans TC\",sans-serif'>"
        "<div style='max-width:560px;margin:0 auto;padding:32px 20px'>"
        "<h1 style='font-size:19px;margin:0 0 4px'>i2c-bridge 已在執行</h1>"
        "<p style='color:#94a3b8;font-size:13px;margin:0 0 22px'>I2C Bridge %s · proto %d — 選一個工具開始。</p>",
        I2C_BRIDGE_VERSION, I2C_BRIDGE_PROTO);
    struct { const char* file; const char* title; const char* desc; const char* color; } items[] = {
        { "dg-measure.html", "DG 光學量測",   "Digital Gamma 迭代校正的即時量測畫面", "#a78bfa" },
        { "i2c.html",        "I2C 讀寫測試",  "任意 slave／offset 寬度 0-1-2-4 byte 讀寫，16×16 dump", "#38bdf8" },
    };
    int shown=0;
    for(unsigned i=0;i<sizeof(items)/sizeof(items[0]);i++){
        char p[MAX_PATH]; snprintf(p,sizeof(p),"%s%s",(g_serveDir[0]?g_serveDir:g_exeDir),items[i].file);
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

/* 沒有開 --serve 時的唯一回應：告訴來人正確的入口在線上，不端任何檔案。 */
static void serve_disabled(SOCKET c){
    const char* body =
      "<!doctype html><meta charset=utf-8><title>i2c-bridge</title>"
      "<body style='font-family:sans-serif;background:#0f172a;color:#e2e8f0;padding:2em'>"
      "<h2>I2C Bridge is running in the background.</h2>"
      "<p>This program no longer serves any page. Use the online tool:</p>"
      "<p><a style='color:#38bdf8' href='https://brucecheng0428.github.io/tcon-tools/i2c.html'>"
      "https://brucecheng0428.github.io/tcon-tools/i2c.html</a></p>"
      "<p style='color:#94a3b8;font-size:13px'>Chrome asks once for permission to reach this local "
      "program - choose Allow.</p></body>";
    char hdr[256]; int hl=snprintf(hdr,sizeof(hdr),
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: %d\r\n"
        "Cache-Control: no-store\r\nConnection: close\r\n\r\n",(int)strlen(body));
    send_all(c,hdr,hl); send_all(c,body,(int)strlen(body));
    logline("[http] 200 (file serving is off; pointed at the online tool)");
}
static void serve_page(SOCKET c, const char* req){
    if(!g_serveFiles){ serve_disabled(c); return; }
    char name[160];
    if(!dgh_req_filename(req,name,sizeof(name))){ serve_404(c,"(request target rejected)"); logline("[http] rejected request target"); return; }
    if(!name[0]){ serve_landing(c); return; }   /* "/" -> 內建入口頁 */
    const char* mime=dgh_mime_for(name);
    if(!mime){ serve_404(c,"That file type is not served."); logline("[http] 404 (type) %s", name); return; }
    char path[MAX_PATH]; snprintf(path,sizeof(path),"%s%s",(g_serveDir[0]?g_serveDir:g_exeDir),name);
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
          "<!doctype html><meta charset=utf-8><title>I2C Bridge</title>"
          "<body style='font-family:sans-serif;background:#0f172a;color:#e2e8f0;padding:2em'>"
          "<h2>I2C Bridge is running, but dg-measure.html was not found next to it.</h2>"
          "<p>Put <b>dg-measure.html</b> in the same folder as i2c-bridge.exe (it ships inside the same zip), then reload.</p>"
          "<p>Or use the online tool at https://brucecheng0428.github.io/tcon-tools/ .</p></body>";
        char resp[1024]; snprintf(resp,sizeof(resp),"HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: %d\r\nConnection: close\r\n\r\n%s",(int)strlen(fb),fb);
        send_all(c,resp,(int)strlen(resp));
        logline("[http] served fallback: dg-measure.html not found next to exe");
        return;
    }
    serve_404(c,"That file is not next to i2c-bridge.exe.");
    logline("[http] 404 (missing) %s", name);
}

/* ═══ 🔴 Windows 排程器時間精度（2026-09-19，Bruce 用邏輯分析儀量到的那件事）═══
   實測：讀取時**每個 byte 之間相隔 10~15 ms**。我們原本的解釋是 libMPSSE 非 fast
   路徑每 byte 一次 `INFRA_SLEEP(1)`，也就是 1 ms —— 這個 1 已經逐一查證過
   （libmpsse.dll 0x6f5838e3 / 0x6f583a31 / 0x6f583c40 / 0x6f5843a5 / 0x6f5849c3
   全部是 `movl $1`），而且 `FT_SetLatencyTimer` 拿到的確實是我們給的 1
   （0x6f582754 傳 %edi ＝ 第 4 個參數，入口 0x6f58264f 取自 124(%esp)，
   並有 `cmpl $255,%edi` 的上界檢查佐證）。**兩者都解釋不了 10~15 ms。**

   🔴 這是**假說，不是結論**：Windows 的 `Sleep(1)` 會被進位到下一個排程器 tick，
   而預設 tick 是 **15.6 ms**，除非行程呼叫過 `timeBeginPeriod(1)` 把精度調高。
   `Sleep(1)` ⇒ 實際睡 ~15.6 ms，與量到的 10~15 ms 量級吻合；這也能解釋為什麼
   原廠工具不慢（它的 runtime 可能已經調高過精度）。

   我們自己呼叫 `timeBeginPeriod(1)`，讓 libMPSSE 內部的 `Sleep(1)` 真的是 1 ms。
   ⚠️ 這台 Mac 驗不了，**要靠 Bruce 用邏輯分析儀複量才算數**。若量完間隔沒有變小，
   代表假說被推翻，要回來找別的原因，不要硬拗。
   （成本：提高全系統時間精度會略增耗電，程式結束前 timeEndPeriod 還原。） */
#ifdef _WIN32
static int g_timerRaised = 0;
static void raise_timer_resolution(void){
    typedef unsigned (__stdcall *PFN_TP)(unsigned);
    HMODULE mm = LoadLibraryA("winmm.dll");
    PFN_TP beg = mm ? (PFN_TP)GetProcAddress(mm, "timeBeginPeriod") : NULL;
    if (beg && beg(1) == 0) { g_timerRaised = 1; logline("  timer   : timeBeginPeriod(1) OK (Sleep(1) is now ~1ms, not ~15.6ms)"); }
    else logline("  timer   : timeBeginPeriod(1) unavailable -- per-byte reads may stay slow");
}
static void restore_timer_resolution(void){
    typedef unsigned (__stdcall *PFN_TP)(unsigned);
    HMODULE mm;
    PFN_TP end;
    if (!g_timerRaised) return;
    mm = GetModuleHandleA("winmm.dll");
    end = mm ? (PFN_TP)GetProcAddress(mm, "timeEndPeriod") : NULL;
    if (end) end(1);
    g_timerRaised = 0;
}
#else
static void raise_timer_resolution(void){}
static void restore_timer_resolution(void){}
#endif

int main(int argc, char** argv){
    int port=8899;
    /* v1.4.0: which page the browser is auto-opened at. Default "" = "/" =
       dg-measure.html (unchanged). `--page=i2c.html` opens the I2C test tool
       instead, so it can be a double-click shortcut rather than a typed URL. */
    char page[160]="";
    for(int i=1;i<argc;i++){
        if(strncmp(argv[i],"--port=",7)==0) port=atoi(argv[i]+7);
        else if(strncmp(argv[i],"--page=",7)==0) snprintf(page,sizeof(page),"%s",argv[i]+7);
        /* 🔴 退路：`--serve` 打開靜態檔服務（可再給目錄 `--serve=<dir>`）。
           預設關閉 —— 預設路徑是線上的 tcon-tools 網頁。 */
        /* 🔴 退路：讀取若在實機上出問題（例如 fast 模式下最後一個 byte 沒送 NACK），
           用這個旗標退回 PQ Tool 原本的逐 byte 讀法，不必換 exe。 */
        else if(strcmp(argv[i],"--slow-read")==0) dgh_fast_read=0;
        else if(strcmp(argv[i],"--raw-mpsse")==0) dgh_raw_mpsse=1;
        /* 方向位元改用 FTDI 範例的 0x0B/0x09（多驅動 AD3）。預設不開，見 proto.h。 */
        else if(strcmp(argv[i],"--ad3-out")==0) dgh_ad3_out=1;
        /* 三相時脈（raw 路徑）。預設開；`--no-3phase` 關掉以驗 Bruce 的反面假說。 */
        else if(strcmp(argv[i],"--no-3phase")==0) dgh_three_phase=0;
        /* 🔴 v1.11.1：時脈插隊改為明示啟用（v1.11.0 的無條件呼叫是連不上的嫌疑者） */
        else if(strcmp(argv[i],"--serve")==0) g_serveFiles=1;
        else if(strncmp(argv[i],"--serve=",8)==0){ g_serveFiles=1; snprintf(g_serveDir,sizeof(g_serveDir),"%s",argv[i]+8); }
    }

    SetConsoleOutputCP(65001);   /* extra insurance; output is ASCII anyway */
    exe_dir(g_exeDir, sizeof(g_exeDir));
    detect_temp_dir();
    { char lp[MAX_PATH]; snprintf(lp,sizeof(lp),"%si2c-bridge.log",g_exeDir); g_log=fopen(lp,"wb"); }

    /* 🔴 v1.11.1：這一行原本在 main() 的第一行，也就是 g_log 還沒 fopen 的時候，
       所以它印的兩行 timer log **永遠不會寫進檔案** —— 出事時等於沒有線索。
       移到開檔之後。功能不變，只是現在看得到結果。 */
    logline("==================================================");
    logline(" I2C Bridge (local I2C bridge for the web tools)  %s (proto %d)", I2C_BRIDGE_VERSION, I2C_BRIDGE_PROTO);
    raise_timer_resolution();
    atexit(restore_timer_resolution);
    logline("  read mode: %s  (libMPSSE %s per-byte loop; --slow-read reverts)",
            dgh_fast_read ? "FAST (one MPSSE command block)" : "SLOW (per-byte, PQ Tool original)",
            dgh_fast_read ? "bypasses" : "uses");
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
            logline("  bind      : FAIL: cannot bind 127.0.0.1:%d (another I2C Bridge already running?) -> P", port);
        }
    } else logline("  bind      : FAIL: WSAStartup -> P");

    /* 🔴 v1.7.0：**不再自動開任何網頁**（Bruce 2026-09-18 明確要求）。
       helper 就是一支背景服務；網頁一律用線上的 tcon-tools。
       `--serve` 那條退路即使開著也不自動開瀏覽器 —— 自動開是另一件事。 */
    (void)url;
    g_browserOk = 1;       /* 狀態碼 B 不再適用：沒有「開瀏覽器」這個步驟了 */
    if(g_bindOk) logline("  browser   : (not opened on purpose; use the online tool)");
    logline("  serving   : %s", g_serveFiles ? "ON (--serve)" : "OFF (default)");

    /* ── decide the single status letter (priority order) ─────────────────
       P port/bind cannot serve (fatal) > D dll missing > X dll wrong/bad
       > J no jig > U jig held by PQ Tool > B browser not opened > G good.   */
    char code; const char *meaning, *todo;
    if(!g_bindOk){ code='P'; meaning="port 127.0.0.1 is busy"; todo="Another i2c-bridge is already running. Close it, then start this one again."; }
    else if(!g_dllOk && !g_dllFound && g_runningFromTemp){ code='T'; meaning="you ran the exe from inside the zip (a temp folder), so the bundled libMPSSE.dll got left behind"; todo="Close this. EXTRACT the whole zip to a real folder (e.g. Desktop), then double-click i2c-bridge.exe there."; }
    else if(!g_dllOk && !g_dllFound){ code='D'; meaning="libMPSSE.dll not found"; todo="It normally ships next to this exe. If you moved the exe out, copy libMPSSE.dll back beside it (or run the exe from the folder you unzipped)."; }
    else if(!g_dllOk && g_dllDepMissing){ code='F'; meaning="libMPSSE.dll found, but its ftd2xx.dll (FTDI driver) is missing"; todo="Install the FTDI D2XX driver, or just run the original PQ Tool once; that puts ftd2xx.dll on the system. Then start this program again."; }
    else if(!g_dllOk){ code='X'; meaning="wrong libMPSSE.dll (bitness/corrupt)"; todo="Use the 32-bit libMPSSE.dll from your PQ Tool 'Release V1.5.0' folder."; }
    else if(g_jigState=='J'){ code='J'; meaning="FTDI jig not found"; todo="Plug in the I2C jig (check USB and power), then start this program again."; }
    else if(g_jigState=='U'){ code='U'; meaning="jig is in use"; todo="Close the original PQ Tool / AUX GUI (it is holding the jig), then start this program again."; }
    /* 狀態碼 B（瀏覽器沒開）在 v1.7.0 之後不存在了 —— 本來就不開瀏覽器。 */
    else { code='G'; meaning="all good"; todo="Open the online tool in Chrome and press Connect."; }

    /* ── console banner: the LAST, most visible thing on screen ──────────── */
    printf("\n\n");
    printf("==================================================\n");
    printf("        I2C BRIDGE STATUS:  %c\n", code);
    printf("==================================================\n");
    printf("   %c = %s\n", code, meaning);
    printf("   What to do: %s\n", todo);
    printf("   (Full English details are in i2c-bridge.log, next to this program.)\n");
    if(code!='G') printf("   Report just this letter:  %c\n", code);
    /* v1.5.0: the browser lands on the built-in menu, which is what lets the
       two tool pages coexist instead of racing for the I2C channel. */
    if(g_bindOk){
        printf("--------------------------------------------------\n");
        printf("   Running in the background. Open the online tool:\n");
        printf("   https://brucecheng0428.github.io/tcon-tools/i2c.html\n");
        printf("   (Chrome asks once to allow reaching this local program - choose Allow.)\n");
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
