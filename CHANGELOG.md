# CHANGELOG

## v2.97.377 — 2026-05-22

### 修復 v2.97.376 右側面板 regression + 左側面板完全固定

- **問題**：v2.97.376 viewport-filling 佈局改壞了右側面板（移除了 sticky 定位），且 `.wfg-container` padding-bottom: 80px 導致頁面仍可捲動 ~70px
- **修復**：
  - `.wfg-page`（桌面）：新增 `height: 100vh; overflow: hidden` — 頁面完全不可捲動
  - `.wfg-container`（桌面）：padding-bottom 從 80px 改為 10px
  - `.wfg-right-panel` / `.wfg-measure-card`：完整恢復 v2.97.375 原始 CSS（`position: sticky; top: 60px; align-self: flex-start`）
  - 左側面板：透過 viewport-filling flex + page overflow:hidden 自然固定，`overflow-y: auto` 支援內部捲動
  - TCON sticky toolbar/時間軸：維持 v2.97.376 的 `top: 0` / `top: var(--tcon-toolbar-h)` （scroll container 為 canvas-wrap）

## v2.97.376 — 2026-05-22

### TCON 左側面板捲動抖動修復（有 regression）

- **根因**：左右面板皆用 `position: sticky`，但左側因 `overflow-y: auto` + `max-height` 組合，在頁面捲動時產生 subpixel reflow 抖動
- **修復方式**：將 `.wfg-layout` 改為 viewport-filling flex 佈局（`height: calc(100vh - header - 20px); overflow: hidden`），三欄各自管理 overflow，頁面不再有整頁捲動
  - `.wfg-panel`（左）：移除 `position: sticky / top / align-self / max-height`，保留 `overflow-y: auto`
  - `.wfg-canvas-wrap`（中）：新增 `overflow-x: hidden; overflow-y: auto`，成為 TCON toolbar/時間軸的 scroll container
  - `.wfg-right-panel`（右）：移除 `position: sticky / top / align-self`，新增 `overflow-y: auto`
- **TCON sticky toolbar/時間軸**：`top` 值從 `var(--header-h)` 改為 `0`（因 scroll container 從 body 變為 canvas-wrap）
- **⚠️ regression**：移除右側 sticky 且 container padding 未修正，導致右側面板隨頁面捲動

## v2.97.375 — 2026-05-22

### TCON tab 左側面板固定 + 卡片 icon 移除

- **左側面板固定**：TCON tab 左側面板（通道卡片等）新增 `position: sticky; top: 60px`，與右側面板一致，捲動頁面時左側面板固定不動，面板本身可內部捲動（`max-height: calc(100vh - 68px); overflow-y: auto`）
- **移除左側卡片 icon**：移除 Frame 參數（📐）、Toggle FRM_NO（🔄）、數位信號（📊）、類比信號（📈）、輸出通道（📺）五個卡片標題的 emoji icon
- **i18n 同步**：`common/i18n.js` 中對應的 zh-TW/en/zh-CN 翻譯也一併移除 emoji

## v2.97.374 — 2026-05-22

### 時基標尺卡片常顯 + 📏 emoji 清理

- **時基標尺卡片常顯**：TCON/LA 兩個 tab 的時基標尺卡片移除 `display:none`，不再隨游標啟用才顯示，chevron ▼ 收折按鈕常駐可見
- **移除 📏 殘留**：清除 TCON tab 即時測量 HTML fallback 中殘留的 📏 emoji

## v2.97.373 — 2026-05-22

### LA tab 右側卡片按鈕靠右 + 時基標尺收折

- **按鈕靠右**：將 chevron 移入 `wfg-la-panel-actions` 內部，＋/⛶ 等按鈕與 chevron 組成一組靠右對齊，消除標題與按鈕之間的不自然空隙
- **LA 時基標尺可收折**：LA tab 時基標尺卡片新增 `wfgToggleCard` + chevron，與 TCON tab 行為一致（TCON 已有此功能）
- **移除時基標尺 icon**：TCON/LA 兩個 tab 的時基標尺標題移除 📏 emoji（HTML + i18n）

## v2.97.372 — 2026-05-21

### LA tab 右側卡片收折 icon 統一為 TCON 風格

- **移除舊按鈕**：移除 LA tab 右側卡片原有的左側收折按鈕（`wfg-la-card-title-toggle` + `wfg-la-collapse-mark`）
- **TCON 風格 chevron**：替換為 `<span class="wfg-chevron">▼</span>` 放在卡片標題右側，與 TCON tab 一致
- **整個標題可點擊**：點擊整個標題區域（`wfg-meas-head` / `wfg-pulse-head` / `wfg-la-meas-head`）可收折/展開
- **＋ 按鈕不衝突**：脈衝計數、分析器、解碼結果的功能按鈕使用 `stopPropagation()` 避免觸發收折
- **CSS 旋轉動畫**：收折時 chevron 旋轉 -90°，展開時恢復，帶 0.2s transition
- **精簡 JS**：`wfgLaTogglePanelCard()` 只需 toggle `is-collapsed` class，不再手動更換文字

## v2.97.371 — 2026-05-21

### TCON tab 右側卡片展開/收折功能

- **右側卡片可收折**：即時測量、時基標尺、脈衝計數三張右側卡片新增展開/收折功能，icon（▼/▸）放在標題右側
- **樣式一致**：使用與左側卡片相同的 `wfg-chevron` 和 `wfgToggleCard()` 邏輯
- **狀態保存**：收折狀態納入 autoSave/autoRestore，重新整理後保持收折狀態
- **脈衝計數 ＋ 按鈕**：＋ 按鈕使用 `stopPropagation()` 避免觸發收折

## v2.97.370 — 2026-05-21

### TCON tab 工具列 + 時間軸 sticky 固定（桌面版）

- **工具列置頂**：桌面版（>900px）TCON toolbar 使用 `position: sticky` 固定在 header 下方，捲動波形時工具列保持可見
- **時間軸置頂**：在 toolbar 與 canvas-area 之間插入獨立 sticky canvas 容器（含 time-axis-canvas + time-axis-overlay），複製主 canvas 頂部 30px 時間軸
- **零佈局影響**：sticky 容器使用 `margin-bottom: -32px` 負邊距，不佔額外空間
- **cursor/crosshair 同步**：overlay canvas 繪製十字游標時間標籤 + 所有 cursor 垂直線
- **動態 toolbar 高度**：新增 CSS 變數 `--tcon-toolbar-h`，由 JS 動態測量並設定
- **模式切換重算**：切換到 TCON tab 時自動呼叫 `wfgUpdateHeaderHeight()` 更新 sticky 位置

## v2.97.367 — 2026-05-21

### LA tab 時間軸 sticky 固定（桌面版）

- **時間軸置頂**：桌面版（>900px）LA 時間軸使用 `position: sticky` 固定在 toolbar 下方，捲動檢視解碼表格時時間軸保持可見
- **實作方式**：在 toolbar 與 workbench 之間插入獨立的 sticky canvas 容器（含 time-axis-canvas + time-axis-overlay），每次渲染後用 `drawImage` 複製主 canvas 和 overlay 的時間軸區域（頂部 32px）
- **零佈局影響**：sticky 容器使用 `margin-bottom: -32px` 負邊距，不佔額外空間，與主 canvas 時間軸完美重疊
- **cursor/crosshair 標籤同步**：overlay canvas 的游標標籤和十字游標時間標籤也會同步複製到 sticky overlay
- **動態 toolbar 高度**：新增 CSS 變數 `--la-toolbar-h`，由 JS 動態測量 toolbar 高度並設定
- **不影響手機版與 TCON tab**

## v2.97.366 — 2026-05-21

### LA tab 工具列 sticky 固定（桌面版）

- **工具列置頂**：桌面版（>900px）LA toolbar 使用 `position: sticky` 固定在 header 下方，捲動頁面時工具列不會消失
- **HTML 結構調整**：將 `.wfg-la-toolbar` 從 `.wfg-la-workbench` grid 內移出至 `.wfg-la-main` flex column 內，解決 CSS Grid 內 sticky 無法跨 row 生效的問題
- **動態 header 高度**：透過 JS 計算 header 實際高度並設為 CSS 變數 `--header-h`，確保 sticky top 值精確
- **不影響手機版**：sticky 僅在 `min-width: 901px` 時啟用，手機版佈局不受影響
- **不影響 TCON tab**：TCON toolbar 仍在 `.wfg-canvas-wrap` 內，結構和行為不受影響

## v2.97.365 — 2026-05-21

### LA tab 波形操作效能優化（分層 canvas + 分級渲染）

- **Overlay canvas 分層**：新增 `#wfg-la-overlay` 透明 canvas 疊在主波形 canvas 上，crosshair / cursor / measure arrow 繪製在 overlay 層
- **mousemove 輕量渲染**：滑鼠移動（crosshair 跟蹤）不再觸發完整 `wfgLaRenderScope()`，改為只清除/重繪 overlay canvas（極輕量），大幅提升十字游標跟蹤流暢度
- **pan/zoom 跳過 labels DOM**：拖曳平移和滾輪縮放時跳過 `labels.innerHTML` 重建（大量 DOM 操作），透過 `skipLabels` 參數控制
- **Minimap 延遲渲染**：平移/慣性滑動期間延遲 minimap 重繪，待動作結束（mouseup / mouseleave / 慣性停止）後一次性更新
- **慣性動畫優化**：慣性滑動每幀也使用 `skipLabels` 模式，減少不必要的 DOM 操作

## v2.97.364 — 2026-05-21

### TCON frame 起始虛線縮放漸變透明

- **縮放漸變透明**：當拉遠時 frame 起始垂直虛線根據 frame 像素寬度平滑漸變透明，避免密集虛線干擾閱讀；拉近時自動恢復顯示
- **漸變閾值**：frame 像素寬度 > 50px 完全不透明、< 12px 完全透明，中間線性內插
- **僅影響 TCON tab**：不影響 LA tab、cursor、crosshair 等其他虛線

## v2.97.363 — 2026-05-21

### TCON tab 即時十字鼠標系統（共用 LA 繪製模組）

- **共用十字鼠標繪製函式**：抽出 `wfgDrawCrosshairLine()` / `wfgDrawCrosshairTimeLabel()` / `wfgFormatCrosshairTime()` 三個通用函式，LA tab 和 TCON tab 共用同一套繪製邏輯
- **TCON 十字鼠標**：滑鼠在 TCON 波形區移動時顯示垂直虛線十字游標 + 時間軸上方即時時間標籤（pill 樣式），拖曳/離開時自動隱藏
- **LA 改用共用模組**：LA tab 原有的 inline crosshair 繪製程式碼改為呼叫共用函式，行為完全不變
- **游標樣式改進**：TCON canvas 預設游標從 `default` 改為 `crosshair`（與 LA 一致），拖曳時顯示 `grabbing`
- **kvdat 模式支援**：kvdat 匯入模式同樣顯示十字鼠標與即時時間標籤

## v2.97.362 — 2026-05-21

### LA tab 工具列 icon 對齊 TCON tab 風格

- **檔案 group 匯出/匯入 icon**：將 emoji（📥📤）替換為 TCON tab 使用的 SVG icon（匯出=箭頭朝上、匯入=箭頭朝下）
- **解碼結果匯出 icon**：解碼結果區域的匯出按鈕同步替換為 SVG 箭頭朝上 icon
- **所有 icon 尺寸對齊**：LA toolbar 基礎 SVG 尺寸從 15px 提升至 17px，與 TCON tab 一致
- **游標 A1~E2 加顏色**：新增 `.wfg-la-cursor-btn` CSS，為 LA 游標按鈕加上彩色邊框與文字（對齊 TCON 的 `.wfg-cursor-btn` 風格）

## v2.97.361 — 2026-05-21

### TCON tab 工具列 icon 三項修正

- **匯出/匯入箭頭互換**：匯出改為朝上箭頭（資料從系統出去）、匯入改為朝下箭頭（資料進來系統）
- **重置按鈕多餘 icon 移除**：i18n 字典 `wfg.reset` 值含有多餘 `↺` Unicode 字元，導致 SVG icon 旁出現第二個小圖示，已移除
- **檢視 group icon 放大**：檢視 group SVG 內容僅佔 viewBox 67%（檔案 group 佔 78%），新增 CSS 將檢視 group icon 從 15px 放大至 17px，視覺尺寸與檔案 group 一致

## v2.97.360 — 2026-05-21

### TCON tab 工具列一致化（參照 LA tab）

- **工具列重構**：TCON toolbar 從平坦 flex 排列改為 LA 風格的 tool-group 分組佈局（檢視/TCON設定/檔案/游標四個 group），每組帶金色 group label
- **檢視 group**：縮放/全覽/重置按鈕改用 SVG icon（與 LA 相同風格），取代原本的 emoji
- **TCON 設定 group**：TCON 內部運算 checkbox + Line Buffer 獨立為「TCON」group，TCON 模式下自動顯示/隱藏
- **檔案 group**：匯出/匯入/複製/貼上/截圖按鈕改用 SVG icon + LA tool-group 樣式，功能行為保持 TCON 原有邏輯不變
- **游標 group**：完全移植 LA 的 cursor cluster fold/expand 機制（摺疊按鈕 + A1~E2 展開），點擊 cursor 或快捷鍵自動展開，fold 按鈕顏色隨 cursor 啟用狀態變化
- **RWD**：手機版自動適應 LA 的 mobile 壓縮規則

## v2.97.359 — 2026-05-21

### LA tab 多項修正：PWM 按鈕狀態 + 語言切換即時更新

- **PWM 按鈕狀態修正**：PWM1/PWM2 按鈕在 LA 未連接時不再顯示綠色（active），需 `wfgLaHardwareReady` 為 true 才亮綠；移除 HTML 中 PWM1 的硬編碼 `active` class
- **語言切換即時更新（regression fix）**：定義 `window._onLangChange` 回呼，語言切換時自動重繪 LA toolbar state（理論取樣時間等）、scope labels（I/O 電平標註）、設定面板（若開啟中）
- **I/O 電平標註 i18n**：切換語言後波形區的 I/O 電平標準文字立即更新，不再需要 mouseover 觸發
- **取樣 group 文字 i18n**：「理論取樣時間」等 toolbar 動態文字在語言切換時同步更新

## v2.97.358 — 2026-05-21

### LA 設定面板 Channel checkbox 兩欄排列

- **排列改版**：CH0~CH15 checkbox 從 4×4 grid 改為兩欄排列（左欄 Ch0~Ch7、右欄 Ch8~Ch15），使用 `grid-auto-flow: column` 先填左欄再填右欄

## v2.97.357 — 2026-05-21

### LA 設定面板速度優化 + 排版修正

- **速度修正**：移除 `wfgLaRenderSettingsBody()` 中的 `wfgLaInit()` 呼叫，避免每次開啟設定面板都重跑 I2C/AUX 解碼 + canvas 重繪 + 解碼表格重建（約 3 秒 → 瞬開）
- **排版修正**：觸發窗口提示文字（0%=全部在觸發後…）從三欄並排改為獨立一行，避免與觸發位置、Event B Count 文字重疊
- **無副作用**：channel checkbox 變更已在 `wfgLaSetChannelEnabled()` 中即時呼叫 `wfgLaRenderScope()`，關閉設定面板不需額外觸發更新

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
