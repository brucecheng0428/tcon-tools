# CHANGELOG

## v2.97.356 — 2026-05-21

### LA 設定選單改為內嵌面板（取代 dialog/modal）

- **設計改版**：設定選單不再用 dialog 彈出，改為直接取代右側面板的所有卡片（同解碼結果放大按鈕的設計模式）
- **CSS 類別**：新增 `settings-expanded` 類別於 `.wfg-la-workbench`，控制設定面板顯示/隱藏
- **互斥處理**：開啟設定面板時自動關閉解碼結果放大狀態
- **瞬間切換**：不再每次動態建立 DOM，面板 div 常駐於右側面板內，切換只靠 CSS class toggle
- **功能保留**：觸發位置、B Event、觸發窗口、CH0-3/CH0-7/CH0-15 快捷按鈕、Ch0~Ch15 checkbox grid 全部保留

## v2.97.355 — 2026-05-21

### LA 設定選單優化：極簡 Channel checkbox + 開啟速度提升

- **速度優化**：移除每次開啟時的複雜 DOM 建構（拖曳手柄、contenteditable、觸發按鈕），DOM 量減少約 80%
- **Channel 極簡化**：移除拖曳排序、自訂通道名稱、觸發 A/B 按鈕；改為固定 Ch0~Ch15 的 4×4 checkbox grid
- **保留上方功能**：Trigger Position、B Event Count、Trigger Window 及 CH0-3/CH0-7/CH0-15 快捷按鈕均保留
- **多語言支援**：觸發位置、觸發 windows 等文字均透過 i18n `t()` 函式渲染

## v2.97.354 — 2026-05-21

### 移除渲染端 edge-walk 補償邏輯

- v2.97.353 已從 decoder 源頭修好 bitTimes 覆蓋問題，渲染端的 edge-walk 已多餘
- 移除 drawByteBits 中的 `buildDpAuxFallbackTimes` / `fallbackBitTime`（v2.97.352 加入）
- 移除 drawBitValues 中的 `auxEdgeTimes` edge-walk 區塊（v2.97.353 加入）
- 兩個函式恢復為直接使用傳入的 times 參數定位 bit 數字

## v2.97.353 — 2026-05-21

### 修復 AUX bitTimes 覆蓋問題：從 decoder 源頭保留邊緣解析器精確時間

- 根因：commit 4aa8298 加的 `bitTimes = sampledPayload.bitTimes.slice(0, expectedBits)` 無條件把邊緣解析器產生的精確 bitTimes（基於實際波形 edge）覆蓋成 Manchester 驗證器的算術 bitTimes（`startTime + n * bitT`）
- 修復：改為條件判斷，`edgeParsedPayload` 為 true 時保留邊緣解析器的 bitTimes，僅在邊緣資料不足時才回退到 sampledPayload 的算術時間
- 保留 drawBitValues 的 edge-walk 補償（v2.97.352）作為 defense in depth

## v2.97.348 — 2026-05-20

### LA overlay 文字放大統一至 11px

- I2C overlay：drawI2cSmallLabel (11px→11px 不變)、drawI2cRegion (8px→11px)、drawI2cGlass (8px→11px)、drawI2cProblemGlass (8px→11px，labelH 12→14)
- AUX overlay：外層迴圈預設 (10px→11px)、regionMarker (9px→11px)、HHLL 緊湊標記 (8px→11px)、drawRawBits/drawByteBits/drawBitValues (11px 不變)
- 目標：所有 canvas overlay 文字大小統一，接近解碼結果列表 Time 欄位的 CSS 10px

## v2.97.341 — 2026-05-20

### 修復 LA 波形區 Chrome 縮放 150% 捲軸晃動

- 根因：`.wfg-la-canvas-area` 設 `overflow: auto` + `#wfg-la-canvas` 設 `min-width: 720px`，在 Chrome 150% 縮放時容器有效寬度小於 720px，canvas 溢出產生捲軸
- mousemove → 重繪讀 `clientWidth`（含/不含捲軸寬度交替變化）→ 設 canvas 寬度 → 捲軸出現/消失循環 → 波形劇烈左右晃動
- 修復：容器 `overflow: auto` → `overflow: hidden`；移除 canvas `min-width: 720px`；JS 中 `Math.max(720, clientWidth)` 下限降至 300

## v2.97.340 — 2026-05-20

### 修復 LA 解碼結果展開模式下視窗凍住不跟隨波形

- 根因：CSS 選擇器 `#wfg-la-right-panel .wfg-la-meas-body` 的 ID 優先級高於 `.wfg-la-decode-card .wfg-la-meas-body`，導致 decode card 的 meas-body 被強制 `flex: 0 0 auto`
- 在 expanded 模式下，meas-body 不縮放 → table-wrap 無高度約束 → 無內部滾動 → `wfgLaApplyDecodeScopeFocus()` 的 `scrollTop` 無效 → 藍框移動但列表不跟
- 修復方式：在 `decode-expanded` 規則中加入 `#wfg-la-right-panel` 提升優先級，覆蓋原始 flex 值

## v2.97.339 — 2026-05-20

### LA cursor 總按鈕邏輯修正

- 修正 cursor fold 按鈕的三狀態循環 bug，改為正確的兩狀態（展開/收合）循環
- 按鈕黃/灰色現在獨立於展開/收合狀態，改由 cursor 活躍狀態驅動：有任一 cursor 啟用 → 黃色，全部關閉 → 灰色
- 收合狀態下若仍有 cursor 在畫面上，總按鈕維持黃色作為警示

## v2.97.337 — 2026-05-19

### WFG 載入預設卡片簡化

- 移除「載入預設」卡片的標題列和收折按鈕，只保留下拉選單
- 卡片固定在 TCON tab 最上方，不可收折

## index v1.86.0 — 2026-05-19

### 主頁版號同步

- 同步所有工具卡片版號與子頁一致：Rx/Tx v1.12.1、Calc v1.5.1、iSP v1.16.1、AUX v1.9.3、WFG v2.97.337

## v2.97.334 — 2026-05-19

### WFG UI 改善

- 新增語言切換選單（繁中/簡中/英文），與其他子頁一致
- 三個功能分頁（TCON Timing / 訊號產生器 / LA分析器）移入 header 同列，節省垂直空間
- 手機版（≤640px）分頁自動換行到第二列，確保不擠壓標題

## v2.97.333 — 2026-05-19

### UI 改善

- 主頁標題列高度縮減（85px → 48px），減少視覺佔比（commit 05e5cf9）
- 子頁標題列單行化：返回按鈕、標題、語言選擇器排列在同一行（commits 76747de → db011d3）
- 語言下拉選單增加 `min-width: 90px`，防止文字截斷（commit 60a3847）
- 所有 HTML 的 CSS/JS 引用加上 cache-busting 參數 `?v=20260519`，確保瀏覽器載入最新版本（commit 93079f8）
