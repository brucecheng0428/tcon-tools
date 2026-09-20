/* ═══════════════════════════════════════════════════════════════════════════
   test_wait.c — tWR 的短等待（1.15.1）
   ───────────────────────────────────────────────────────────────────────────
   要釘住的東西，一條一條都是這一版的交付內容：

     (1) 🔴 **等待時間不短於要求值**。tWR 是裝置規格，等不夠是**靜默寫不進去**
         —— 比慢更糟。所以這是本檔最重要的一條，正反兩面都測。
     (2) 🔴 **precise_wait_ms() 不經過 `Sleep()`**。Bruce 那台機器上 `Sleep(5)`
         實際是 11.2 ms（2026-09-20 的實機 log：tWR 2846 ms ÷ 255 次），
         所以「有沒有真的繞開 Sleep」不是實作細節，它就是這一版的全部。
     (3) 退回 `Sleep` 的那條路也要能走（計時器建立失敗時）。**退路不驗＝沒有退路。**
     (4) 開機自檢的量測成本 < 100 ms（Dispatch 明列）。

   ── 🔴🔴 這支測試量的到底是什麼（不得含糊）───────────────────────────────
   它跑在 **Linux（沙箱）**上，用 `test/shim` 把出貨原始碼原封編起來。
   Linux 的 `nanosleep` 本來就是次毫秒級，所以**直接在這裡量 `Sleep(5)`
   會得到 5 ms，證明不了任何 Windows 上的事**。

   ⇒ 因此 shim 加了 `dgh_shim_sleep_tick_ms`：**模擬** Windows 排程器 tick 對
     `Sleep()` 的進位（`Sleep(n)` ⇒ 進位到下一個 tick）。設成 15.6 之後：
       · `Sleep(5)`            ⇒ 15.6 ms（先驗這件事，證明夾具真的會咬人）
       · `precise_wait_ms(5)`  ⇒ 仍然約 5 ms（它走計時器，不碰 Sleep）
     這證明的是「**出貨程式碼的等待路徑不依賴 Sleep 的粒度**」——
     一個平台無關的結構性事實，而那正是這一版改的東西。

   🔴 **這支測試證明不了**：Bruce 的機器上 tWR 實際會降到幾毫秒。
      Windows 高解析度計時器的真實精度、他那台筆電的電源策略、
      `SendBytesEx` 的 5.5 ms —— 全部只有他的硬體能量。
      本檔任何數字都**不得**被引用成「他那邊會是幾 ms」。

   編譯：
     cc -O2 -I test/shim -I . test/test_wait.c test/shim.c -o test_wait -lpthread
   ═══════════════════════════════════════════════════════════════════════════ */
#include "shim/winsock2.h"
#include "shim/windows.h"
#include <stdio.h>
#include <string.h>
#include <math.h>

/* 把出貨原始碼原封帶進來（`main` 改名），於是 precise_wait_ms()／
   batch_wait_twr()／measure_timer_resolution() 這些 static 都拿得到。 */
#define main dgh_bridge_main_unused
#include "../i2c_bridge.c"
#undef main

static int g_pass = 0, g_fail = 0;
static void CHECK(int cond, const char* what){
    if(cond){ g_pass++; printf("  ok   %s\n", what); }
    else    { g_fail++; printf("  FAIL %s\n", what); }
}
static void G(const char* n){ printf("\n-- %s %s\n", n, "------------------------------------"); }

#define SIM_TICK 15.6   /* 模擬的 Windows 排程器 tick（Bruce 的機器量到 11.2，取較嚴的 15.6） */

static double med_of(double* v, int n){
    int i,j; for(i=1;i<n;i++){ double t=v[i]; for(j=i-1;j>=0&&v[j]>t;j--) v[j+1]=v[j]; v[j+1]=t; }
    return (n&1)? v[n/2] : (v[n/2-1]+v[n/2])/2.0;
}

int main(void){
    printf("=== test_wait — tWR 短等待（i2c-bridge %s）===\n", I2C_BRIDGE_VERSION);

    /* ═══ §1 後端建立 ═══════════════════════════════════════════════════════ */
    G("1. 高解析度計時器建得起來（shim 提供 kernel32 的 CreateWaitableTimerExW）");
    dgh_shim_hires_timer = 1;
    wait_backend_init();
    CHECK(g_waitHires == 1, "🔴 走的是高解析度計時器（不是退回 Sleep）");
    CHECK(strcmp(wait_backend_tag(),"hires")==0, "回報的 waitmode ＝ hires");
    CHECK(strstr(wait_backend_name(),"high-resolution")!=NULL, "log 用的名稱講得出是哪一條");
    CHECK(strstr(g_waitWhy,"HIGH_RESOLUTION")!=NULL, "理由欄位寫明帶了 HIGH_RESOLUTION 旗標");
    printf("      [資訊] backend=%s ; why=%s\n", wait_backend_tag(), g_waitWhy);

    /* ═══ §2 夾具自己要先會咬人（反面）════════════════════════════════════════
       先證明「模擬粗 tick」這件事真的有效 —— 否則 §3 的 5 ms 毫無意義。 */
    G("2. 🔴 反面：模擬 Windows tick 之後，Sleep(5) 真的會變慢");
    dgh_shim_sleep_tick_ms = SIM_TICK;
    {
        double v[5]; int i;
        for(i=0;i<5;i++){ double t0=now_ms(); Sleep(5); v[i]=now_ms()-t0; }
        printf("      [量測] Sleep(5) 在模擬 %.1f ms tick 下：中位數 %.2f ms\n", SIM_TICK, med_of(v,5));
        CHECK(med_of(v,5) >= SIM_TICK-0.5,
              "🔴 Sleep(5) 被量化成一個 tick（＝ 夾具會咬人，§3 的比較才有意義）");
    }

    /* ═══ §3 正面：precise_wait_ms 不受 Sleep 粒度影響 ═══════════════════════ */
    G("3. 🔴🔴 precise_wait_ms(5) 在同一個粗 tick 下仍然約 5 ms（它不碰 Sleep）");
    {
        double v[30]; int i, shortOnes=0, sleepsBefore, sleepsAfter, waitsBefore, waitsAfter;
        sleepsBefore = dgh_shim_sleep_calls; waitsBefore = dgh_shim_timer_waits;
        for(i=0;i<30;i++){
            double got = precise_wait_ms(5.0);
            v[i]=got;
            if(got < 5.0) shortOnes++;
        }
        sleepsAfter = dgh_shim_sleep_calls; waitsAfter = dgh_shim_timer_waits;
        printf("      [量測] precise_wait_ms(5) × 30：中位數 %.2f ms（模擬 tick 仍是 %.1f ms）\n",
               med_of(v,30), SIM_TICK);
        printf("      [量測] 這 30 次裡 Sleep() 被呼叫 %d 次、計時器被等 %d 次\n",
               sleepsAfter-sleepsBefore, waitsAfter-waitsBefore);
        /* 🔴 (1) 最重要的一條：**一次都不准短於要求值**。 */
        CHECK(shortOnes==0, "🔴🔴 30 次沒有任何一次短於要求的 5 ms（tWR 等不夠＝靜默寫不進去）");
        /* 🔴 (2) 真的繞開了 Sleep：一次都沒呼叫到它。 */
        CHECK(sleepsAfter-sleepsBefore == 0, "🔴 這條路徑完全沒有呼叫 Sleep()");
        CHECK(waitsAfter-waitsBefore == 30, "30 次都真的等在高解析度計時器上");
        /* 中位數要接近 5，而不是被量化到 15.6。門檻放 8 ms：容得下排程抖動，
           但區分得出「5 ms 級」與「一個 tick」。 */
        CHECK(med_of(v,30) < 8.0, "🔴 中位數落在 5 ms 級（不是被量化到一個 tick）");
    }

    /* ═══ §4 各種要求值都不得短 ═════════════════════════════════════════════ */
    G("4. 🔴 要求 1／2／5／10 ms，每一次實際等待都 ≥ 要求值");
    {
        unsigned reqs[4] = {1,2,5,10};
        int r, i, bad=0; double worstRatio=0.0;
        for(r=0;r<4;r++){
            for(i=0;i<8;i++){
                double got = precise_wait_ms((double)reqs[r]);
                if(got < (double)reqs[r]) bad++;
                if(got/(double)reqs[r] > worstRatio) worstRatio = got/(double)reqs[r];
            }
        }
        printf("      [量測] 32 次等待，最長的一次是要求值的 %.2f 倍\n", worstRatio);
        CHECK(bad==0, "🔴 32 次沒有任何一次短於要求值");
        CHECK(worstRatio < 3.0, "也沒有誇張地超等（誤差往長邊倒，但不是倒到天上去）");
    }
    CHECK(precise_wait_ms(0.0)==0.0, "要求 0 ms ⇒ 不等（tWR=0 是合法輸入）");
    CHECK(precise_wait_ms(-3.0)==0.0, "要求負值 ⇒ 不等，不當成極大值");

    /* ═══ §5 退路：計時器建不起來 ═══════════════════════════════════════════ */
    G("5. 🔴 退路：CreateWaitableTimerExW 失敗時退回 Sleep，而且**仍然不短於要求值**");
    {
        double v[5]; int i, bad=0;
        wait_backend_shutdown();
        dgh_shim_hires_timer = 0;                    /* 讓它建立失敗 */
        g_shim_lasterr = 0;
        wait_backend_init();
        CHECK(g_waitHires == 0, "偵測到建不起來");
        CHECK(strcmp(wait_backend_tag(),"sleep")==0, "回報的 waitmode ＝ sleep（不假裝成功）");
        CHECK(strstr(g_waitWhy,"GetLastError=87")!=NULL,
              "🔴 log 的理由帶著真正的 GetLastError（不是寫死的 0）");
        printf("      [資訊] why=%s\n", g_waitWhy);
        for(i=0;i<5;i++){
            v[i]=precise_wait_ms(5.0);
            if(v[i] < 5.0) bad++;
        }
        printf("      [量測] 退路上的 precise_wait_ms(5)：中位數 %.2f ms"
               "（模擬 tick %.1f ⇒ 慢是預期的，短才是錯的）\n", med_of(v,5), SIM_TICK);
        CHECK(bad==0, "🔴 退路上也沒有任何一次短於 5 ms");
        CHECK(med_of(v,5) >= SIM_TICK-0.5,
              "退路確實走了 Sleep（所以才被 tick 量化）—— 與回報的 sleep 一致");
    }

    /* ═══ §6 batch_wait_twr：出貨路徑（ackpoll 關，預設）═════════════════════ */
    G("6. 🔴 batch_wait_twr（ackpoll 關＝預設）走的是 precise_wait_ms");
    {
        double v[10]; int i, bad=0, sleepsBefore, sleepsAfter;
        dgh_shim_hires_timer = 1;
        wait_backend_shutdown(); wait_backend_init();
        CHECK(g_waitHires==1, "計時器恢復可用");
        sleepsBefore = dgh_shim_sleep_calls;
        for(i=0;i<10;i++){
            int pp=-1, fb=-1;
            v[i]=batch_wait_twr(0x50, 0x0000, 2, 5, 0, &pp, &fb);
            if(v[i] < 5.0) bad++;
            if(pp!=0 || fb!=0) bad+=100;             /* ackpoll 關 ⇒ 探針 0 次、沒有退回 */
        }
        sleepsAfter = dgh_shim_sleep_calls;
        printf("      [量測] batch_wait_twr(twr=5) × 10：中位數 %.2f ms，其間 Sleep() 被呼叫 %d 次\n",
               med_of(v,10), sleepsAfter-sleepsBefore);
        CHECK(bad==0, "🔴 10 次都 ≥ 5 ms，且 polls/fellBack 回報 0（ackpoll 邏輯沒被動到）");
        CHECK(sleepsAfter-sleepsBefore==0, "🔴 tWR 這條路徑一次都沒呼叫 Sleep()");
        CHECK(med_of(v,10) < 8.0, "🔴 中位數落在 5 ms 級（1.15.0 在這裡會是一個 tick）");
        CHECK(batch_wait_twr(0x50,0,2,0,0,NULL,NULL)==0.0, "twr=0 ⇒ 不等（既有行為未變）");
    }

    /* ═══ §7 開機自檢的成本 ═════════════════════════════════════════════════ */
    G("7. 🔴 開機自檢：成本 < 100 ms（Dispatch 明列）＋ 印出來的是實測值不是假設");
    {
        double t0, el;
        char cap[8192]; size_t got=0;
        /* logline 只寫 g_log —— 把它接到一個真的檔案，才驗得到「印出來長什麼樣」。
           🔴 元素存在 ≠ 內容正確：這裡連「舊那句寫死的話有沒有真的消失」一起釘。 */
        g_log = tmpfile();
        CHECK(g_log != NULL, "自檢輸出接到暫存檔（要驗內容，不只驗耗時）");
        t0=now_ms();
        measure_timer_resolution();
        el=now_ms()-t0;
        if(g_log){
            fflush(g_log); rewind(g_log);
            got = fread(cap, 1, sizeof(cap)-1, g_log);
            cap[got]=0;
            fclose(g_log);
        } else cap[0]=0;
        g_log = NULL;
        printf("      [量測] 開機自檢在模擬 %.1f ms tick 下花了 %.1f ms\n", SIM_TICK, el);
        CHECK(el < 100.0, "🔴 粗 tick 的機器上也在 100 ms 以內（預算 70 ＋ 最後一個樣本可能超支）");
        CHECK(el > 20.0, "而且它真的有去量（不是印個假的就跳過）");
        CHECK(strstr(cap,"is now ~1ms")==NULL,
              "🔴🔴 v1.15.0 那句寫死的「Sleep(1) is now ~1ms」已經不在橫幅裡");
        CHECK(strstr(cap,"MEASURING")!=NULL, "橫幅明說這是量出來的");
        CHECK(strstr(cap,"precise_wait(5)")!=NULL && strstr(cap,"Sleep(5)")!=NULL
              && strstr(cap,"Sleep(1)")!=NULL, "三種等待都印了（新舊可以直接對照）");
        CHECK(strstr(cap,"median")!=NULL, "印的是中位數（而且標明是中位數）");
        CHECK(strstr(cap,"wait backend:")!=NULL, "印了走哪一條等待");
        CHECK(strstr(cap,"logic analyser")!=NULL,
              "🔴 明寫「匯流排上的段間距只有 Bruce 的硬體量得到」（不許在 log 裡替他宣稱）");
        printf("      ── 自檢輸出（原文）───────────────────────────────────\n%s"
               "      ──────────────────────────────────────────────────────\n", cap);
    }
    dgh_shim_sleep_tick_ms = 0.0;                    /* 還原，別影響同一支執行檔裡後面的東西 */

    printf("\n================================================================\n");
    printf("  通過 %d ／ 失敗 %d\n", g_pass, g_fail);
    printf("  🔴 驗不到（誠實列出）：Windows 高解析度計時器的真實精度、Bruce 那台\n");
    printf("     筆電上 tWR 實際會降到幾毫秒、SendBytesEx 的 5.5 ms。本檔的 tick\n");
    printf("     是**模擬**的，只證明「等待路徑不依賴 Sleep 的粒度」這個結構性事實。\n");
    printf("================================================================\n");
    return g_fail ? 1 : 0;
}
