/* ═══════════════════════════════════════════════════════════════════════════
   test_ackguard.c — ACK 守衛的**正反兩面**都要驗（v1.13.0）
   ───────────────────────────────────────────────────────────────────────────
   🔴 為什麼要單獨一支：

   ① `test_proto.c` 驗的是 `dgh_mp_ack_kind()` 這個純函式（「0x0E 會被判成異常」）。
      那只證明判讀函式對，**不證明 raw_read() 真的有擋下來、真的沒把資料交出去、
      也不證明使用者看得到可行動的訊息**。這一版的交付內容正是後面那三件事。

   ② 更重要的是**正面那一半**。收緊判準永遠有一個風險：把本來會過的東西也擋掉。
      這裡的具體風險是「若 FTDI 在 1-bit 讀回時 bit0–bit6 是未定義殘值，
      收緊後每一次讀都會失敗 ⇒ 使用者完全不能用」。CLAUDE.md 記著同一個破口
      已經犯過三次（NB code、EM01、E512），共同點都是**只驗過「壞的會被拒絕」**。
      所以這支**先驗正面**：乾淨的 `00 00 00 00` 必須通過，而且資料要一字不差。

   ③ `test_server.c` 走不到這條路：它的假 DLL 只假了 libMPSSE，
      `DGH_RAW_AVAILABLE`（＝ ftd2xx 的 FT_Write/FT_Read 有沒有解析到）是 0，
      raw_read() 根本不會被呼叫。

   做法：把**出貨的那份 i2c_bridge.c** 整個 include 進來（`main` 改名），
   於是 `raw_read()`／`g_lastErr` 這些 static 都拿得到，直接把 `p_FT_Write`／
   `p_FT_Read` 指到本檔的假函式，餵進**實機 log 真的出現過的那四個位元組**。
   不重寫任何一行產品邏輯 —— 重寫出來的東西驗的是重寫本身，不是出貨的程式。

   🔴 驗不到（誠實列出）：真正的 FTDI 硬體、真正的 I2C 波形、
      以及「他那顆晶片正常時 ACK 槽到底是不是 0x00」——
      那只有一個樣本（2026-09-19 的第一段讀回），**只有 Bruce 能確認**。

   編譯：
     cc -O2 -I shim -I . test/test_ackguard.c test/shim.c -o test_ackguard -lpthread
   ═══════════════════════════════════════════════════════════════════════════ */
#include "shim/winsock2.h"
#include "shim/windows.h"
#include <stdio.h>
#include <string.h>

/* 把出貨原始碼原封帶進來。`main` 改名，讓本檔可以有自己的 main。 */
#define main dgh_bridge_main_unused
#include "../i2c_bridge.c"
#undef main

static int g_pass = 0, g_fail = 0;
static void CHECK(int cond, const char* what){
    if(cond){ g_pass++; printf("  ok   %s\n", what); }
    else    { g_fail++; printf("  FAIL %s\n", what); }
}

/* ── 假的 ftd2xx：把一段事先寫好的位元組流當成裝置回來的東西 ──────────────
   mpsse_xfer() 的順序是 Purge → 一次 FT_Write → 迴圈 FT_Read 直到收滿，
   所以 FT_Write 時把游標歸零就好。 */
static unsigned char g_script[65536];
static int g_script_len = 0, g_script_pos = 0;
static int g_writes = 0, g_purges = 0;

static unsigned long __stdcall fake_write(void* h, void* b, unsigned long n, unsigned long* w){
    (void)h; (void)b; g_writes++; g_script_pos = 0; if(w) *w = n; return 0;
}
static unsigned long __stdcall fake_read(void* h, void* b, unsigned long n, unsigned long* r){
    unsigned long k = 0; (void)h;
    while(k < n && g_script_pos < g_script_len) ((unsigned char*)b)[k++] = g_script[g_script_pos++];
    if(r) *r = k; return 0;
}
static unsigned long __stdcall fake_purge(void* h, unsigned long m){ (void)h; (void)m; g_purges++; return 0; }

/* 組出「acks 個 ACK 位元組 ＋ din 個資料位元組」的回應流。
   ackvals 給幾個就用幾個，不足的用最後一個補（實機那四個值正好是 4 個 ACK 槽）。 */
static void script_build(unsigned slave, unsigned addr, int awid, int len,
                         const unsigned char* ackvals, int nack,
                         int* acksOut, int* dinOut){
    static unsigned char cmd[DGH_MP_CMD_MAX];
    int acks = 0, din = 0, i;
    int n = dgh_mp_build_read(cmd, (int)sizeof(cmd), slave, addr, awid, len, &acks, &din);
    if(n < 0){ printf("  FAIL dgh_mp_build_read 組不出命令\n"); g_fail++; }
    g_script_len = 0; g_script_pos = 0;
    for(i = 0; i < acks; i++)
        g_script[g_script_len++] = ackvals[i < nack ? i : (nack - 1)];
    for(i = 0; i < din; i++)
        g_script[g_script_len++] = (unsigned char)(0xA0 + i);
    if(acksOut) *acksOut = acks;
    if(dinOut)  *dinOut  = din;
}

/* g_lastErr 會被直接嵌進 JSON 字串 ⇒ 不可以含 `"`、`\`，也不可以有非 ASCII。 */
static int json_safe(const char* s){
    for(; *s; s++){
        unsigned char c = (unsigned char)*s;
        if(c == '"' || c == '\\' || c < 0x20 || c > 0x7E) return 0;
    }
    return 1;
}

int main(void){
    unsigned char out[64]; uint32_t got;
    FT_STATUS st;
    int acks = 0, din = 0;
    const unsigned char clean[1]   = { 0x00 };
    /* 🔴 實機值：2026-09-19 的 bridge log，addr=0x1000 那一段的位址相位 ACK。
       每一個都是前一個左移一位，且四個 `& 0x81` 全為 0 ⇒ 舊判準四個全部放行。 */
    const unsigned char real[4]    = { 0x0E, 0x1C, 0x38, 0x70 };
    const unsigned char nackv[1]   = { 0x80 };

    printf("== ACK 守衛：正反兩面（raw_read 走出貨原始碼）==\n");
    p_FT_Write = fake_write;
    p_FT_Read  = fake_read;
    p_FT_Purge = fake_purge;
    g_handle   = (void*)(intptr_t)0xF00D;
    CHECK(DGH_RAW_AVAILABLE != 0, "假 ftd2xx 掛上 ⇒ raw 路徑可用（否則整支測試是空轉）");

    /* ── ① 正面：乾淨的 0x00 必須通過，而且資料一字不差 ───────────────── */
    printf("\n-- 1. 🔴 正面：ACK 全 0x00 必須通過（收緊不得誤殺正常讀取）--\n");
    memset(out, 0xEE, sizeof(out)); got = 0;
    lasterr_clear();
    script_build(0x50, 0x0000, 2, 8, clean, 1, &acks, &din);
    st = raw_read(0x50, 0x0000, 2, 8, out, &got);
    CHECK(st == 0, "回傳 0（成功）");
    CHECK(got == 8, "got == 8");
    CHECK(out[0] == 0xA0 && out[7] == 0xA7, "8 個資料位元組原樣交出（0xA0..0xA7）");
    CHECK(g_lastErr[0] == 0, "成功時不留錯誤訊息（不會污染下一次回覆）");

    printf("\n-- 1b. 正面：ACK 全 0x00、長度 1（最短路徑）--\n");
    memset(out, 0xEE, sizeof(out)); got = 0;
    script_build(0x60, 0x12, 1, 1, clean, 1, &acks, &din);
    st = raw_read(0x60, 0x12, 1, 1, out, &got);
    CHECK(st == 0 && got == 1 && out[0] == 0xA0, "1 byte 讀取照樣通過");

    /* ── ② 反面：實機那四個值必須被擋下，且一個 byte 都不准交出去 ────────── */
    printf("\n-- 2. 🔴 反面：實機的 0E 1C 38 70 必須擋下、資料不得交出 --\n");
    memset(out, 0xEE, sizeof(out)); got = 0xDEAD;
    lasterr_clear();
    script_build(0x50, 0x1000, 2, 8, real, 4, &acks, &din);
    st = raw_read(0x50, 0x1000, 2, 8, out, &got);
    CHECK(st == 0xFFFFFFF4u, "回新錯誤碼 0xFFFFFFF4（位元流異常，與 NACK 分開）");
    CHECK(st != 0xFFFFFFF3u, "🔴 不可以被當成 NACK —— 那會把診斷指向錯的方向");
    CHECK(out[0] == 0xEE, "🔴 out[] 一個 byte 都沒被寫進去（檢查在複製之前）");
    CHECK(got == 0xDEAD, "got 沒有被設成長度（呼叫端不會以為拿到資料）");

    printf("\n-- 3. 🔴 錯誤訊息要能行動（哪一個槽／原始值／slave／addr／下一步）--\n");
    printf("     實際內容：%s\n", g_lastErr);
    CHECK(g_lastErr[0] != 0, "有留下錯誤訊息（v1.12.0 這裡是空的，網頁只拿到一個數字）");
    CHECK(strstr(g_lastErr, "0x0E") != NULL, "訊息帶**原始值** 0x0E");
    CHECK(strstr(g_lastErr, "slot 0") != NULL, "訊息帶**哪一個 ACK 槽**");
    CHECK(strstr(g_lastErr, "0x50") != NULL, "訊息帶 slave");
    CHECK(strstr(g_lastErr, "0x1000") != NULL, "訊息帶 addr");
    CHECK(strstr(g_lastErr, "DISCARDED") != NULL, "訊息明講資料已丟棄（不是靜默失敗）");
    CHECK(strstr(g_lastErr, "Retry") != NULL, "訊息給下一步（重試／重插／降速／少讀）");
    CHECK(strstr(g_lastErr, I2C_BRIDGE_FALLBACK_PKG) != NULL,
          "🔴 訊息帶舊版下載路徑 —— 被新守衛擋死時他當場就有退路");
    CHECK(json_safe(g_lastErr), "🔴 訊息可直接嵌進 JSON（無 \" 無 \\ 無非 ASCII）");
    CHECK((int)strlen(g_lastErr) < DGH_LASTERR_MAX, "長度在緩衝區內");

    /* ── ③ 真正的 NACK 仍要走自己的錯誤碼與自己的訊息 ────────────────── */
    printf("\n-- 4. NACK（0x80）仍是 NACK，不可以被新守衛吃掉 --\n");
    memset(out, 0xEE, sizeof(out)); got = 0xDEAD;
    lasterr_clear();
    script_build(0x50, 0x0000, 2, 8, nackv, 1, &acks, &din);
    st = raw_read(0x50, 0x0000, 2, 8, out, &got);
    CHECK(st == 0xFFFFFFF3u, "回 0xFFFFFFF3（NACK），不是 0xFFFFFFF4");
    CHECK(strstr(g_lastErr, "NACK") != NULL, "訊息說是 NACK");
    CHECK(strstr(g_lastErr, "did not answer") != NULL, "訊息講的是「裝置沒回應」而不是位元流");
    CHECK(json_safe(g_lastErr), "NACK 訊息同樣可嵌進 JSON");

    /* ── ④ lasterr_set 的保險絲：壞字元一定要被換掉 ─────────────────── */
    printf("\n-- 5. lasterr_set 的保險絲（不相信呼叫端都記得） --\n");
    lasterr_set("a\"b\\c%cd", 0x01);
    CHECK(json_safe(g_lastErr), "引號／反斜線／控制字元全部被換成空白");
    CHECK(strlen(g_lastErr) == 7, "長度不變（等長替換，位置不跑掉）");

    /* ── ⑤ 寫入側同一道守衛 ─────────────────────────────────────── */
    printf("\n-- 6. 寫入側：同一道守衛、同一組錯誤碼 --\n");
    {
        static unsigned char cmd[16384];
        unsigned char data[3] = { 0xDE, 0xAD, 0xBE };
        int wacks = 0, wdin = 0, i, n;
        n = dgh_mp_build_write(cmd, (int)sizeof(cmd), 0x60, 0x1200, 2, data, 3, &wacks, &wdin);
        CHECK(n > 0, "寫入命令組得出來");
        /* 正面 */
        g_script_len = 0; g_script_pos = 0;
        for(i = 0; i < wacks; i++) g_script[g_script_len++] = 0x00;
        lasterr_clear(); got = 0;
        st = raw_write(0x60, 0x1200, 2, data, 3, &got);
        CHECK(st == 0 && got == 3, "🔴 正面：ACK 全 0x00 的寫入必須通過");
        /* 反面 */
        g_script_len = 0; g_script_pos = 0;
        for(i = 0; i < wacks; i++) g_script[g_script_len++] = (i < 4) ? real[i] : 0x70;
        lasterr_clear();
        st = raw_write(0x60, 0x1200, 2, data, 3, &got);
        CHECK(st == 0xFFFFFFF4u, "反面：0E 1C 38 70 被擋下");
        CHECK(strstr(g_lastErr, "UNKNOWN") != NULL,
              "寫入的訊息要說「這個位址狀態未知、去讀回來」（寫出去了但沒被確認）");
        CHECK(json_safe(g_lastErr), "寫入訊息同樣可嵌進 JSON");
    }

    printf("\n================================================================\n");
    if(g_fail){ printf("❌ %d 項失敗（通過 %d）\n", g_fail, g_pass); return 1; }
    printf("✅ 全部通過：%d 項\n", g_pass);
    printf("🔴 未驗（沒有 FTDI 硬體）：真正的匯流排波形，以及「他那顆晶片正常時\n");
    printf("   ACK 槽是不是 0x00」—— 目前只有一個實機樣本，只有 Bruce 能確認。\n");
    return 0;
}
