# 「只算看得到的那一段」可行性調查（2026-08-22）

> Bruce 裁示做 C，並重新定義 C：「開頁面只算目前看得到的那一小段 —— 那一小段很快，會覺得是秒開，捲到哪再算哪。」
> 指示：**第一步先調查、不要急著改**；若判斷是大改（動到核心渲染架構）就停手回報。
> 本檔是調查結果。**本輪沒有改任何產品程式碼。**
> 量測腳本：`_tmp_v453_20260822/measure_paths.py`、`measure_optionN.py`、`measure_optionN_cost.py`。

---

## 1. 結論先講

1. **這個工具早就有「按可視範圍計算」的能力**（`computeExtent`，v2.93.0／v2.95.0；
   捲出已算範圍時自動延伸，v2.97.11）。它**現在也確實在作用**——載入時走的就是 viewport-lazy 分支。
2. **但它是「前綴式」的：只能從第 0 行算到第 N 行，無法只算中間那一段。**
3. 而內建快捷設定「FHD 60Hz Single Gate(LS：Multi CPV)」**自帶的視窗位置在第 431,443 行**
   （`wfg.html:2863`，`view: { start: 431443.03, end: 431485.50 }`，＝時間軸上的 6.467 s）。
   ⇒ 為了畫出**看得到的 42 行**，前綴式必須從 0 算到 431,485 ⇒ 實際算 **432,598 行**。
   **這就是「算了不該算的東西」的具體形狀**：浪費比例 = 1 − 42/432,598 ≈ **99.99%**。
4. 因此 Bruce 要的 C（只算中間那一段）**無法靠打開既有開關達成**，必須把前綴式改成**區段式**
   （任意 `[start, end)`）。那要動到 6～10 個函式與所有以絕對行號索引的型別陣列
   ⇒ **屬於核心渲染資料結構的改動，依指示停手回報，本輪不開工。**

---

## 2. 實測數據

環境：headless Chrome 1600×1000、instrumented 複本（在三個預計算入口與 SD/LS 單通道函式外面加日誌）、
帶 autosave 的 profile（套用內建快捷設定 ⇒ frameCount 1000、Vtotal 1112 ⇒ 總行數 1,112,000）。

### 2.1 載入時實際走的路徑（`measure_paths.py`）

```
sync  {totalLines: 1112000, viewStart: 431443, viewEnd: 431485, ext: 432598, isGlobalRecompute: false, t: 938ms}
  ← wfgPrecomputeAnalog  ← wfgRender  ← wfgResizeCanvas  ← wfgResizeAndRenderWithMinimap
SD gi18  ext 432598  198.6 ms
LS gi19  ext 432598  944.5 ms
LS gi20  ext 432598  624.9 ms
LS gi21  ext 432598  635.1 ms
LS gi22  ext 432598  496.6 ms
LS gi23  ext 432598  489.4 ms
LS gi24  ext 432598  893.1 ms
LS gi25  ext 432598  548.5 ms      → 合計約 5.1 s，形成單一 longtask 5,146 ms
```

**修正上一份報告的一處推測**：載入時走的不是「非同步有進度版」，而是
`wfgPrecomputeAnalog()` 的**同步 viewport-lazy 分支**（`_isGlobalRecompute === false`）。
它的 extent 公式是 `min(totalLines, ceil(wfgViewEnd) + viewPad)` —— **起點固定是 0**，
所以視窗停在越後面，算得越多。

### 2.2 把視窗移到時間軸最前面（同一份設定，只改 autosave 裡的 view）

| | 視窗在第 431,443 行（現況） | 視窗在第 0 行 |
|---|---|---|
| `computeExtent` | 432,598 行 | **1,155 行**（0.27%） |
| 8 條類比通道合計 | 約 5.1 s | **44～79 ms** |
| 最大 longtask | 5,146 ms（另一次量到 8,503 ms） | **581 ms**（且不是預計算） |
| 開頁到可操作 | 5.99 ～ 10.03 s | **2.09 ～ 2.36 s** |

⇒ 「只算看得到的那一小段」確實就是**秒開**，數量級差 100 倍以上。方向完全正確。

### 2.3 🔴 但「把開頁視窗挪到最前面」只是把痛延後（`measure_optionN_cost.py`）

開頁在最前面（2.09 s、預計算 44 ms）之後，用畫面上的「中心」輸入框跳回 6.467 s：

```
jump 的那一下：evaluate 阻塞 9.88 s，單一 longtask 9,876 ms
```

**比現在開頁時付的 5～8.5 s 還久**（延伸路徑一次補 43 萬行）。
所以「開頁改看最前面」**不是解**，只是把同一筆帳搬到使用者捲回去的那一刻。

---

## 3. 現況架構（調查所得，供後續設計）

| 問題 | 答案 |
|---|---|
| 有沒有可視範圍計算？ | **有**。`computeExtent` 參數貫穿 `_wfgPrecomputeSdChannel` / `_wfgPrecomputeLsChannel` / `_wfgPrecomputeSpxChannel` |
| 捲動超出已算範圍怎麼辦？ | `wfgSamplesFromPrecomputed()`（`:5239`）內建「`neededEnd > computedExtent` 就同步延伸」，呼叫 `_wfgExtendSdPrecomp` / `_wfgExtendLsPrecomp`；拖曳中（`_wfgContinuousMotion`）會抑制 |
| 可視時間窗變數 | `wfgViewStart` / `wfgViewEnd`（單位：行），另有畫面上的「中心（秒）」`#wfg-view-center` 與「倍率」輸入框 |
| 三個「一律全算」的硬編點（v2.97.19 加的） | `_wfgSdFullRecomputeWithProgress`（`:3384`）、`wfgPrecomputeAnalogAsync`（`:3516`）、`wfgPrecomputeAnalog` 的 `_isGlobalRecompute` 分支（`:3460`） |
| 事件層能不能任意區間？ | **可以**。`_wfgLsBuildEvents(..., startLine, endLine, ...)` 本來就吃起訖行，`_wfgExtendLsPrecomp` 就是用 `[oldExtent, newExtent)` 在用 |
| 那為什麼不能從中間開始？ | ① 型別陣列**以絕對行號為索引**（`settled[line]`、`rcSamples[line*20+k]`、`lineMinMax[line*2]`）② LS/SD 是**逐行遞推的 RC 狀態**（`le.voltage`、`curTarget`、`eventIdx`…），起始電壓要從前面累積而來 |
| 記憶體為什麼不能乾脆全算 | LS 每行約 92 B（settled 4 ＋ rcSamples 20×4 ＋ lineMinMax 8）。112 萬行 ⇒ **約 102 MB／通道**，7 條 ⇒ 700 MB。這正是 extent 機制存在的原因（本次量到 GC 也吃掉 1.6 s） |

---

## 4. 要做 C（區段式）得動哪些地方

| # | 改動 | 說明 |
|---|---|---|
| 1 | `precomp` 增加 `base`（視窗起始行），所有陣列改為視窗長度、索引一律 `line − base` | 影響 `settled` / `target` / `holdV` / `rcSamples` / `lineMinMax` / `minMaxPyramid` |
| 2 | `_wfgPrecomputeSdChannel` / `_wfgPrecomputeLsChannel` / `_wfgPrecomputeSpxChannel` 改吃 `(startLine, endLine)` | 事件層已支援，主要是遞推起始狀態 |
| 3 | **起始狀態怎麼來**：從視窗前 N 行做 warm-up（RC 指數收斂，數行～一個 frame 即足夠），或從最近的 frame 邊界起算 | 🔴 這是唯一的**技術風險點**，必須用「窗算 vs 全算」逐行比對證明誤差可接受 |
| 4 | `wfgSamplesFromPrecomputed` / `_wfgEnsureLineMinMax` / `_wfgBuildMinMaxPyramid` / `_wfgSpxSamplesFromPrecomp` 的索引全部改成相對 | 全檔 `computedExtent` 出現 43 次，需逐一檢視 |
| 5 | 視窗移出已算範圍時：**重算一個新視窗**（而不是無限往右延伸） | 現行 `_wfgExtendLsPrecomp` 是 append 語意，要改成可換窗 |
| 6 | 上游／下游耦合：Subpixel 讀 Gate 與 SD1 的結果，三者的視窗要對齊 | 既有 `srcGateExtent` / `srcSdExtent` 判斷要跟著改 |

**風險**：漏改任何一個索引點 ＝ **波形靜默錯誤**（畫得出來、但值是錯的）。
因此必須先做一支比對治具：同一組參數，窗算結果 vs 全算結果，在抽樣行上逐值比對，
差異超過門檻就失敗。這支治具要先寫，才有資格動 1～6。

**版號**：行為若正確就是「內部實作改寫、使用者無感」⇒ 依 `VERSIONING.md` §2 案例 4 為 **PATCH**
（風險高不等於版號大）。**不會判到 MAJOR。**

**工程量（誠實估）**：比對治具 ＋ 1～6 ＋ 回歸，需要一個完整的專注 session，
不是順手做。這也是為什麼依 Bruce 的指示停在這裡回報。

---

## 5. 選項與建議

| 選項 | 內容 | 實測效果 | 風險 | 我的看法 |
|---|---|---|---|---|
| **W** | 前綴式 → **區段式**（真正只算看得到的那一段） | 開頁預計算 5.1 s → 預估數十 ms；捲到哪都只算那一窗 | 中高（靜默錯誤），可用比對治具壓住 | **唯一真正符合第一性原理的解**，建議做，但要獨立一輪 |
| N | 只把「開頁還原的視窗位置」移到最前面 | 開頁 5.99→2.09 s，**但跳回原位置要 9.88 s** | 低 | **不建議**：只是把帳延後，而且更痛 |
| 現狀 | 不動 | — | — | 每次開頁固定 5～10 s |

**請 Bruce 裁示要不要開 W。** 若要，我會先寫「窗算 vs 全算」比對治具，再動索引，
每一步都用同一份 autosave（快捷設定 FHD 60Hz Single Gate、frameCount 1000）量開頁時間與最大 longtask。
