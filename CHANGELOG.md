# CHANGELOG

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
