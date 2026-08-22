# wfg 載入時主執行緒被什麼佔住（2026-08-22 實測）

> 起因：Bruce 回報「Chrome 擴充注入下 wfg.html 長時間無回應 —— screenshot 注入 5 秒逾時、
> CDP `Runtime.evaluate` 45 秒逾時，而且 v4.5.2 也一樣」。本檔是**量測結果**，不是推論。
> 量測腳本：`_tmp_v453_20260822/measure_init.py`、`measure_heavy.py`、`measure_heavy2.py`
> （未進版控，用法見同目錄 `README_驗證腳本.md`）。

## 結論（一句話）

**不是頁面太大，是 `_wfgPrecomputeLsChannel()` 在載入後被同步呼叫，一口氣算完整份類比波形，
把主執行緒鎖在單一一個 task 裡 8.5 秒。** 這條路徑自 2026-05-16 拆頁（`4647a36`）就存在，
與 v4.5.3／v4.5.4 無關（v4.5.2 的同一行在 `wfg.html:22563`，現在是 `:22580`）。

## 量到的數字

環境：headless Chrome 1600×1000、本機 `http.server`、每次都是乾淨的 `user-data-dir`（除非註明）。

| 情境 | evaluate 最長往返 | 可用時間點 | longtask | 主要 self time |
|---|---|---|---|---|
| 全新 profile、無 autosave（v4.5.4） | **0.24 s** | 1.2 s | 3 筆／525 ms | `(program)`＝解析編譯 1.06 s |
| 全新 profile、無 autosave（v4.5.2 對照） | **0.39 s** | 1.7 s | 4 筆／933 ms | `(program)` 1.66 s |
| autosave 只有 Frame 重複數 1000（無類比） | **0.86 s** | 1.5 s | 5 筆／849 ms | `(program)` 1.30 s |
| **autosave ＝ 內建快捷設定「FHD 60Hz Single Gate(LS：Multi CPV)」** | **8.51 s** | **10.0 s** | **6 筆／9,204 ms，其中單一 task = 8,503 ms** | **`_wfgPrecomputeLsChannel` 7,409 ms（43.6%）** |
| 同上，但是在畫面上**當場套用**那個快捷設定 | 3.89 s | 約 21 s 後才順 | 11 筆／20,864 ms，最大 4,206 ms | `_wfgPrecomputeLsChannel` 18,775 ms（59.2%）＋ GC 1,606 ms |

關鍵一筆：**重新載入後 `load` 事件在 1,002 ms 完成，而 1,198 ms 起有一個「8,503 ms 的單一 longtask」。**
單一 task 代表**沒有任何切片**——擴充的 5 秒注入預算與任何 CDP 呼叫在這 8.5 秒內都拿不到主執行緒。

## 機制

1. autosave（`tcon-wfg-autosave`，約 30 KB）在 `wfgInit()` 末尾的 `wfgInitTconTimingEntry()` 被還原，
   把 `frameCount = 1000`、Vtotal 1112 與整組 LS（Level Shifter）類比通道帶回來
   ⇒ 總行數 ＝ 1000 × 1112 ≈ **111 萬 line**，乘上 7 條 LS 通道。
2. 還原後的第一次 `wfgRender()` 走到 **`wfg.html:22580`** 這段：

   ```js
   if (_wfgPrecomputeVer !== _wfgAnalogCacheVer && !_wfgPrecompBusy && !_wfgAnalogPending) {
     wfgPrecomputeAnalog();      // ← 同步版本
   }
   ```

   註解自己就寫著實測過的量級：「實測整支 `wfgRender()` 3,438 ms、其中 `wfgPrecomputeAnalog()`
   佔 3,422 ms（99.5%）」。這次量到的是同一條路徑在更大的設定下的表現（8.5 s）。
3. 站上**有**非同步版本 `wfgPrecomputeAnalogAsync()`（有進度視窗，`totalLines > 200000` 會自動顯示），
   但它只掛在「重的入口」（切分頁、匯入、手動觸發）。**載入還原這條路徑走的是同步版**，
   所以畫面上連進度都不會出現，看起來就是整頁凍住。
4. 即使走非同步版也只是**逐通道**切片：當場套用快捷設定時量到 11 筆 longtask、單筆最大 4,206 ms
   —— 一條通道的計算本身就是一個不可中斷的 2～4 秒 task。

## 為什麼我這邊的驗收腳本沒踩到

驗收都用全新 `user-data-dir` ⇒ localStorage 空的 ⇒ 沒有 autosave 可還原 ⇒ 只有預設 `frameCount = 10`。
**Bruce 的瀏覽器有實際使用留下的 autosave，所以他必然踩到、我預設不會踩到。**
這也是為什麼同一份 code 在兩邊表現差 30 倍。

## 修法選項（**未實作，等 Bruce 裁示**）

| # | 做法 | 影響面 | 風險 |
|---|---|---|---|
| A | 載入還原這條路徑改走 `wfgPrecomputeAnalogAsync()`（有進度、可切片） | 動 `wfgInitTconTimingEntry()` 的還原流程與初次 render 的時序 | 中：初次繪製從同步變非同步，先前多次踩過「還原順序被打亂」的坑（v3.26.3、v3.0.1） |
| B | 把 `_wfgPrecomputeLsChannel()` 內部再切片（每 N line 讓出主執行緒） | 動核心計算迴圈 | 高：會改到最熱的迴圈，效能與正確性都要重驗 |
| C | 還原時對「總行數過大」的設定先不算類比、標成 pending，等使用者真的要看再算 | 動還原策略 | 中：畫面一開始少東西，要有明確提示 |
| D | 不動，只在 `totalLines` 很大時於載入路徑也顯示既有的進度視窗 | 只加 UI 提示 | 低：不會變快，但不再「看起來當掉」 |

我的看法：真正要解是 A 或 C，兩者都會動到還原時序，**不屬於「小且安全」**，所以本次只回報。
D 可以單獨做，成本很低，但它治的是觀感不是延遲。

## 順帶查證：`wfgUnstickLockedScroll()` 與這件事無關

v4.5.3 新增的那支掛在 `load`／`pageshow`／`resize`。實測（`measure_unstick.py`，在函式外包計數器）：

- 載入後總共觸發 **8 次**（load 與 pageshow 各一輪：立即＋rAF＋300 ms＋1200 ms），合計 **2.5 ms**。
- 靜置 15 秒：次數停在 8，**沒有自我觸發、沒有迴圈**。
- 連續改視窗大小 30 次：收到 31 個 resize，unstick 剛好 **31 次（1:1，無放大）**，合計 2.8 ms。
- resize 之後再靜置 6 秒：不再增加。
- 單次成本：連呼 1000 次平均 **29.8 µs**（同一頁單次 `getComputedStyle` 讀取約 1.3 µs 作對照）；
  ＝ 60 fps 一幀預算的 **0.18%**。
- `changed` 計數 **0**：沒有東西被卡住時它一個 scrollTop 都不會寫，因此不會製造額外的 layout。

**結論：不會迴圈、成本可忽略，與上面的 8.5 秒無關。**
