/* ═══════════════════════════════════════════════════════════════════════════
   test_vendor_len.c — `vendor_read()` 的長度邊界，**正反兩面**（1.14.0）
   ───────────────────────────────────────────────────────────────────────────
   🔴 為什麼要單獨一支：

   ① 這一版的整個題目就是「長度上限」。CLAUDE.md 記著同一個破口已經犯過三次
      （NB code、EM01、E512），共同點都是**只驗過「壞的會被拒絕」，從來沒驗過
      「好的會被接受」**。所以這支先釘正面：**65535 必須通過，而且要原封送進
      DLL**（不是被誰偷偷夾成 4096）。

   ② 反面有兩條，兩條都是**反組譯實證**，不是我們的偏好：

      `len == 0` —— 0x402570 的主迴圈是
          dec eax ; cmp ebx,eax ; jb    ⇒ 無號的 `while (i < count-1)`
      `0 - 1` 在無號下是 0xFFFFFFFF ⇒ 迴圈跑約 42 億次、**寫穿呼叫端的緩衝區**。
      這不是「0 等於 1 byte」，是記憶體毀損。**必須擋在 `vendor_read()` 這一層**，
      不能只靠 read 指令處理那邊的 `if(len<1) len=1;` —— `vendor_read()` 還有
      別的呼叫端（自動驗證、自檢），那些會繞過它。**這支就是釘住那一層。**

      `len > 65535` —— `U16 GetBytesEx(U8, U32, U32, U8*)` 的回傳值只有 16 位元，
      65536 會真的讀 65536 個 byte 進緩衝區但**回報數量溢位成 0** ⇒ 分不出
      「讀滿」與「一個都沒讀到」。切段的責任在網頁端。

   ③ 兩條都要求**錯誤訊息講得出原因**。擋下來卻只給一個數字，等於把「靜默的錯」
      換成「看不懂的錯」—— v1.13.0 已經為了這件事改過一次。

   做法與 test_ackguard.c 相同：把**出貨的那份 i2c_bridge.c** 整個 include 進來，
   把 `pv_Get` 指到本檔的假函式。不重寫任何一行產品邏輯。

   🔴 驗不到（誠實列出）：
      · 真正的 `DLL_I2C_BCB.dll`、真正的 FTDI 硬體、真正的 I2C 波形。
      · **一次讀 65535（甚至只是超過 4096）在真實硬體上會不會成功** ——
        反組譯在三個讀取實作裡沒看到任何長度常數比較，但它再呼叫的
        `FTD2XX.DLL` 沒有追進去。**只有 Bruce 的機器能確認。**
        這支驗的是「我們這一層不會亂擋、也不會亂放」，不是「硬體上讀得到」。

   編譯：
     cc -O2 -I shim -I . test/test_vendor_len.c test/shim.c -o test_vendor_len -lpthread
   ═══════════════════════════════════════════════════════════════════════════ */
#include "shim/winsock2.h"
#include "shim/windows.h"
#include <stdio.h>
#include <string.h>

#define main dgh_bridge_main_unused
#include "../i2c_bridge.c"
#undef main

static int g_pass = 0, g_fail = 0;
static void CHECK(int cond, const char* what){
    if(cond){ g_pass++; printf("  ok   %s\n", what); }
    else    { g_fail++; printf("  FAIL %s\n", what); }
}

/* ── 假的 GetBytesEx ────────────────────────────────────────────────────────
   只記下「有沒有被呼叫、被要求幾個 byte」，然後宣稱全部讀到。
   🔴 它**不會**去碰 out 以外的記憶體 —— 真的 DLL 在 count==0 時會寫穿，
      而這支測試要證明的正是「我們根本不讓它被呼叫」。 */
static int      g_called = 0;
static uint32_t g_lastCount = 0;
static unsigned short fake_get(unsigned char addr, unsigned int reg,
                               unsigned int count, unsigned char* data,
                               unsigned char offBytes){
    (void)addr; (void)reg; (void)offBytes;
    g_called++; g_lastCount = count;
    for(unsigned int i = 0; i < count; i++) data[i] = (unsigned char)(i & 0xFF);
    return (unsigned short)count;          /* 宣稱全部讀到 */
}

/* 只回 100 個 —— 用來驗「少讀不准被當成功，而且要說出要幾個、拿到幾個」。 */
static unsigned short fake_short(unsigned char addr, unsigned int reg,
                                 unsigned int count, unsigned char* data,
                                 unsigned char offBytes){
    (void)addr; (void)reg; (void)offBytes; (void)count;
    g_called++; g_lastCount = count;
    for(unsigned int i = 0; i < 100; i++) data[i] = 0xA5;
    return 100;
}
/* 一個都沒讀到 —— 裝置沒回應的情形。 */
static unsigned short fake_zero(unsigned char addr, unsigned int reg,
                                unsigned int count, unsigned char* data,
                                unsigned char offBytes){
    (void)addr; (void)reg; (void)data; (void)offBytes;
    g_called++; g_lastCount = count; return 0;
}

static uint8_t g_buf[70000];

int main(void){
    printf("== vendor_read() 長度邊界（1.14.0）==\n");
    pv_Get = fake_get;
    g_vendorOk = 1; g_vendorOpen = 1;

    /* ── 正面：合法長度要原封送進去，一個 byte 都不准被夾掉 ──────────────── */
    { struct { uint32_t len; const char* what; } ok[] = {
        { 1,     "len=1（最小合法值）" },
        { 256,   "len=256" },
        { 4096,  "len=4096（以前那個假上限，現在只是一個普通的數字）" },
        { 8192,  "🔴 len=8192（Bruce 問的那一個）" },
        { 65535, "🔴 len=65535（U16 回傳值的上限，剛好踩線）" },
      };
      for(unsigned k = 0; k < sizeof(ok)/sizeof(ok[0]); k++){
        uint32_t got = 0; g_called = 0; g_lastCount = 0; lasterr_clear();
        int r = vendor_read(0x50, 0, 2, ok[k].len, g_buf, &got);
        CHECK(r == 1,                  ok[k].what);
        CHECK(g_called == 1,           "  └ 真的有呼叫下去（沒有被我們攔掉）");
        CHECK(g_lastCount == ok[k].len,"  └ 🔴 送下去的長度就是要求的長度（沒有夾取）");
        CHECK(got == ok[k].len,        "  └ 回報的數量等於要求的長度");
      } }

    /* ── 反面 1：len == 0 ⇒ 擋下，而且**不准呼叫 DLL** ──────────────────── */
    { uint32_t got = 12345; g_called = 0; lasterr_clear();
      int r = vendor_read(0x50, 0, 2, 0, g_buf, &got);
      CHECK(r == 0,          "🔴 len=0 被擋下（DLL 的讀取迴圈會在 0 下無號溢位）");
      CHECK(g_called == 0,   "  └ 🔴🔴 **完全沒有呼叫下去** —— 呼叫下去就是寫穿緩衝區");
      CHECK(got == 0,        "  └ got 歸零，不留呼叫端的舊值");
      CHECK(g_lastErr[0] != 0, "  └ 有錯誤訊息（擋下來卻不說原因等於換一種靜默）");
      CHECK(strstr(g_lastErr, "zero") != NULL, "  └ 訊息講得出是長度 0 的問題");
      CHECK(strstr(g_lastErr, "at least 1") != NULL, "  └ 訊息講得出下一步怎麼辦"); }

    /* ── 反面 2：len > 65535 ⇒ 擋下，不夾取 ──────────────────────────────── */
    { uint32_t got = 12345; g_called = 0; lasterr_clear();
      int r = vendor_read(0x50, 0, 2, 65536, g_buf, &got);
      CHECK(r == 0,          "🔴 len=65536 被擋下（回報數量只有 16 位元，會溢位成 0）");
      CHECK(g_called == 0,   "  └ 沒有呼叫下去");
      CHECK(got == 0,        "  └ got 歸零");
      CHECK(g_lastErr[0] != 0, "  └ 有錯誤訊息");
      CHECK(strstr(g_lastErr, "16-bit") != NULL, "  └ 🔴 訊息講得出原因是 16 位元的計數");
      CHECK(strstr(g_lastErr, "65535") != NULL,  "  └ 🔴 訊息講得出上限是多少");
      CHECK(strstr(g_lastErr, "Split")  != NULL, "  └ 🔴 訊息講得出下一步是分段"); }

    /* ── 反面 3：少讀要照實說「要幾個、拿到幾個」，而且不准當成功 ────────── */
    { uint32_t got = 0; lasterr_clear();
      pv_Get = fake_short;                       /* 這一支只回 100 */
      int r = vendor_read(0x50, 0, 2, 8192, g_buf, &got);
      CHECK(r == 0,     "🔴 少讀不算成功（r != len）");
      CHECK(got == 100, "  └ 🔴 `got` 是**實際拿到的數量**，不是要求的長度");
      CHECK(g_lastErr[0] != 0, "  └ 有錯誤訊息（1.14.0 以前這裡只有 bridge 那台機器的 log）");
      CHECK(strstr(g_lastErr, "partial") != NULL, "  └ 訊息講得出這是少讀");
      CHECK(strstr(g_lastErr, "100")     != NULL, "  └ 訊息裡有實際拿到的數量");
      CHECK(strstr(g_lastErr, "8192")    != NULL, "  └ 訊息裡有要求的長度");
      CHECK(strstr(g_lastErr, "not shorten") != NULL,
            "  └ 🔴 訊息講明「不是 bridge 夾的」—— 一眼分得出是誰擋的");
      pv_Get = fake_get; }

    /* ── 反面 4：一個 byte 都沒讀到 ⇒ 要講「裝置沒回應」，不是講少讀 ──────── */
    { uint32_t got = 0; lasterr_clear();
      pv_Get = fake_zero;
      int r = vendor_read(0x50, 0, 2, 256, g_buf, &got);
      CHECK(r == 0,     "讀到 0 個不算成功");
      CHECK(got == 0,   "  └ got = 0");
      CHECK(strstr(g_lastErr, "did not answer") != NULL,
            "  └ 訊息指向「裝置沒回應」，並給出可檢查的項目");
      pv_Get = fake_get; }

    printf("\n%d/%d checks passed\n", g_pass, g_pass + g_fail);
    return g_fail ? 1 : 0;
}
