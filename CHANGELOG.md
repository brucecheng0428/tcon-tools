# CHANGELOG

## TCON 波形產生器 (wfg) v2.97.439 — 2026-07-10

**需求（Bruce）**：LA 分頁右側「即時測量」卡片，仿照「脈衝計數」卡片的「＋」加號，加一個可新增「選定通道量測區塊」的功能。點「＋」在卡片下方新增一個含通道下拉的量測區塊，最多 4 個（達上限後加號 disabled）；每個區塊即時顯示該通道的 5 個參數：①頻率 ②正脈寬 ③負脈寬 ④週期 ⑤佔空比。可移除已加的量測。

**改的是哪幾段 code**：
- HTML：`#wfg-la-measure-card` 的 `.wfg-meas-head` 加入 `.wfg-la-panel-actions` + `.wfg-la-panel-add`（`#wfg-la-meas-add-btn`，onclick `wfgLaMeasAdd()`，比照脈衝計數卡片的加號樣式）；`.wfg-meas-body` 內既有讀數下方新增容器 `#wfg-la-meas-items`。
- JS：新增狀態 `wfgLaMeasItems`（上限 `WFG_LA_MEAS_MAX=4`）＋ `wfgLaMeasAdd/Del/Change`。量測函式 `wfgLaMeasComputeChannel` **重用既有波形模型**：`wfgLaGetWaveform` 取 edges + initialLevel、`wfgLaEdgeTypeForIndex` 判 rising/falling，取第一個完整週期算：正脈寬＝下降緣−上升緣、週期＝下一上升緣−本上升緣、負脈寬＝週期−正脈寬、頻率＝1/週期、佔空比＝正脈寬/週期；格式化沿用 `wfgLaTimeLabel`/`wfgLaFreqLabel`（與既有量測風格一致）。`wfgLaMeasRenderAll` 建區塊（通道色點＋下拉＋移除鈕＋5 列數值），並於 `wfgLaUpdateMeasure`（主繪製流程）緊接脈衝 render 呼叫，隨波形/檢視更新；下拉操作中走就地更新數值不重建 DOM，達 4 個時停用加號。
- CSS：新增 `.wfg-la-meas-item*` 區塊樣式與 `.wfg-la-panel-add:disabled` 停用外觀。

**回歸保護**：只在既有讀數下方加容器與獨立函式，不動既有 `wfgLaUpdateMeasureReadout`（hover 讀數）、脈衝計數（`wfgLaPulse*`）與其他卡片邏輯。

**版本同步**：`common/version.js` `wfg: v2.97.438 → v2.97.439`；`wfg.html` 的 `version.js?v=20260709c → 20260710a`（快取破解，否則徽章不跳版）。

## TCON 波形產生器 (wfg) v2.97.438 — 2026-07-09

**需求（Bruce）**：LA 分頁右側那一欄的卡片（即時測量／時基標尺／脈衝計數／分析器／解碼結果…），當某張卡片內容變長（例如「脈衝計數」加 3 個以上通道量測）時，會把下方卡片頂出可視範圍看不到。要在「右側內容超過可視高度」時，給右側面板加**垂直捲軸**讓使用者往下捲看到下方卡片。**電腦版專用**——手機／窄螢幕版排版與行為不動。

**根因（先讀再做的結論）**：桌面版走 `@media (min-width: 901px)`，其中 `#wfg-la-right-panel { … overflow: hidden }`（ID 選擇器，特異度 1,0,0）覆蓋掉了 line 396 那條原本想捲動的 class 規則 `.wfg-la-workbench .wfg-la-side.wfg-right-panel { max-height: calc(100vh-126px); overflow-y: auto }`（0,3,0）。桌面 grid 佈局（`.wfg-la-layout` 固定高 `calc(100vh - header - 20px)` + overflow:hidden，右側面板 `grid-row:1/-1` 撐滿）下，卡片總高超過面板高度即被 `overflow:hidden` 裁切／頂出，且無捲軸。

**改的是哪幾段 code**：
- `@media (min-width: 901px)` 內，line 223 `#wfg-la-right-panel` 之後新增一條高特異度規則：`.wfg-la-workbench:not(.decode-expanded):not(.settings-expanded) #wfg-la-right-panel { min-height: 0; overflow-y: auto; overflow-x: hidden; }`。特異度 (1,3,0) 勝過 line 223，故**非 expanded 模式**桌面右側面板改為溢出可捲；`min-height:0` 讓 grid item 可縮小於內容以觸發捲動。
- **保留** expanded（decode-expanded／settings-expanded）模式的 `overflow:hidden`（line 223 仍生效），由內部卡片（decode 表格 wrap）自管捲動，避免回歸。
- 新增 `#wfg-la-right-panel` 深色主題捲軸樣式（`scrollbar-width:thin`＋webkit thumb `#30363d`），與現有暗色一致。
- 手機版（`@media max-width:900px`，line 524/577）本就把右側面板設為 `overflow-y:visible / max-height:none`，且新規則掛在 `min-width:901px` 內，故手機版完全不受影響。

**版本同步**：`common/version.js` `wfg: v2.97.437 → v2.97.438`；`wfg.html` 的 `version.js?v=20260709b → 20260709c`（快取破解，否則徽章不跳版）。

## 部署衛生：修 version.js 快取字串（cache-buster）— 2026-07-09

**問題**：rxtx.html 已上線 v1.12.2、`common/version.js` 也已是 `rxtx: 'v1.12.2'`，但線上版本徽章仍顯示 v1.12.1。真因＝各頁 `<script src="common/version.js?v=XXXX">` 的快取破解字串過時，瀏覽器／CDN 一直吃舊的 `version.js`，徽章刷不到新版。對照 wfg.html 用的是今日新值 `?v=20260709b`，徽章正常。

**修法**：只更新過時的 `version.js` cache-buster（version.js 內版號數字一律不動），讓既有版號能被瀏覽器抓到顯示，非進版。改動如下：

- `rxtx.html`：`?v=20260523 → ?v=20260709rx1`
- `index.html`：`?v=20260523 → ?v=20260709idx1`
- `isp.html`：`?v=20260523 → ?v=20260709isp1`
- `aux.html`：`?v=20260523 → ?v=20260709aux1`
- `calc.html`：`?v=20260629 → ?v=20260709calc1`
- `wfg.html`：已是今日值 `?v=20260709b`，不動。`la.html`／`legacy-index.html` 不引用 version.js，無涉。

## Rx/Tx 頻率計算工具 (rxtx) v1.12.2 — 2026-07-09

**需求（Bruce）**：在「LVDS Rx 頻率計算」卡片的「DCLK 頻率加乘」區塊，原本只有「TCON UI DCLK」和「1 UI」兩項會在勾選加乘時顯示加乘後紅字。擴展讓「LVDS per Port」這項也顯示加乘後紅字，但 **LVDS per Port 只加乘「RX SSC 展頻」這一個因子**（不套用 OSC 頻率製程偏移 / TX SSC 展頻）。

**改的是哪幾段 code**：
- HTML（`rt-lvds-r-port` 項）：新增紅字 span `id="rt-lvds-r-port-boost"`，沿用既有 `.dclk-boost-max`（`color:#ef4444; font-weight:700`）樣式，與其他兩項一致。
- `rtCalcAll()` 主 render 路徑：在既有 RX SSC 判斷分支內，`bPort = lvds_per_port × (1 + rxSsc%)` 已算好，直接 `rtSetBoostText('rt-lvds-r-port-boost', '(' + bPort.toFixed(3) + ' MHz)')`；未勾 RX SSC 或無效值時清空。
- `rtCalcAll()` 的 EDP-sync 路徑（`source === 'edp'`）：同上，用該路徑既有的 `bP` 值渲染，維持雙路徑一致。
- 顯示條件僅綁 `rt-boost-rxssc` 勾選狀態，數值＝LVDS per Port 基準 × RX SSC 因子，精度 `toFixed(3) MHz` 比照基準值；OSC / TX SSC 勾選不影響此項。TCON UI DCLK / 1 UI 既有紅字行為不動（無回歸）。

## TCON 波形產生器 (wfg) v2.97.437 — 2026-07-09

本版涵蓋兩件事：(A) LA 通道/波形拖曳排序持久化；(B) LA「全 high」燈號改亮藍並確保數字對比。

### (A) 新增「LA 通道/波形拖曳排序持久化（重整保留、僅快捷設定 change 才重載/重置預設排序）」

**需求（Bruce）**：LA 分頁左側通道欄可拖曳改變「通道/波形的排序」（既有功能），但重整後排序沒被保留。要改成：(1) 使用者拖曳改過排序 → 寫進 localStorage（比照 v435 名稱持久化用同一個 `WFG_LA_SETTINGS_KEY = 'wfg-la-user-settings-v1'`，新增 `order` 欄位），重整後保留拖曳後排序；(2) 只有「操作快捷設定選單」的 change 事件才會重載/重置預設排序 —— 選 preset 載入該 preset 定義的排序、選回「快捷設定」空值回到最原始 0..15 自然順序並把預設排序寫回 localStorage；(3) 其餘任何拖曳都照持久化正常存回、重整還原，不被重置覆蓋。**邏輯與 v435/v436 名稱那套完全平行，且不動名稱既有行為。**

**排序狀態**：`wfgLaChannelOrder`（陣列，`order[位置] = 通道號`，預設 identity 0..15）。拖曳落點在 `wfgLaMoveChannelDrag` 更新、`wfgLaEndChannelDrag` 收尾。

**改的是哪幾段 code（與名稱平行）**：
- `wfgLaSaveUserSettingsNow()`：`data` payload 新增 `order`（取當前 `wfgLaChannelOrder` 的 16 長度副本，否則 fallback identity）—— 比照既有 `names` 欄位。
- `wfgLaRestoreUserSettings()`：在 `names` 還原區塊後新增 `data.order` 還原；**嚴格驗證**必須是 0..15 的完整排列（長度 16、值域 0~15、不重複），否則不套用（保留現有 order，避免壞資料破版）。set `wfgLaChannelOrder` 置於下方 `wfgLaRenderChannelGrid()`／`wfgLaUpdateSummary()`（內含 `wfgLaRenderScope()`）之前，讓重繪依還原後排序。
- `wfgLaEndChannelDrag()`：新增一行 `wfgLaSaveUserSettings()` —— 比照名稱編輯 handler，拖曳結束即時（debounce）持久化。
- 快捷設定「選回空值」分支（`wfgLaApplyQuickPreset` 的 `!preset`）：**原本 v436 已重置 `wfgLaChannelOrder = 0..15` 並呼叫 `wfgLaSaveUserSettingsNow()`**，因 payload 現含 `order`，此路徑自動把預設排序寫回 localStorage，無需另改。
- 選 preset（非空）分支：照舊經 `wfgLaApplyVisibleChannelOrder` 載入 preset 排序（比照 names 由 `wfgLaStoreChannelName` 設定），不額外存 —— 與名稱行為一致。

**不破壞 v435/v436 名稱**：名稱的 save/restore/重置三處程式碼一律未動；只在 payload「新增」`order` 欄位、restore「新增」order 還原、drag end「新增」save 呼叫，與名稱互不干擾（拖曳排序不碰 `wfgLaChannelNames`，改名不碰 `wfgLaChannelOrder`）。

**進版**：`v2.97.436 → v2.97.437`；wfg.html 內 version.js cache-buster `?v=20260709a → 20260709b`；common/version.js 徽章 `v2.97.436 → v2.97.437`。

### (B) LA「全 high」燈號由低調灰藍改回「亮藍」＋確保燈內數字「1」高對比可讀

**需求（Bruce）**：LA 左側每個通道「訊號全為 high 的燈號」目前是低調灰藍（v413 從全亮改成的），要改成「明亮的藍色」；同時燈內數字「1」在亮藍底上不能變得看不清楚，需調整數字顏色/加深/描邊確保足夠對比。

**改的是哪段 code / 顏色值怎麼配**：這顆燈號是 DOM+CSS（非 canvas），樣式規則 `.wfg-la-label-live.static-high`（由 `wfgLaRenderScope` 在通道全 high 時對 `.wfg-la-label-live` 加 `static-high` class 並填入 `staticLevel`＝「1」）。改動：
- 底色 `background` 由低調灰藍 `#3f5a7a` → 明亮藍 `#2f83ff`，並新增 `box-shadow: inset 0 1px 2px rgba(255,255,255,0.35), 0 0 7px rgba(47,131,255,0.85)`（比照綠燈 `#34d84a` 的發光作法，讓它真的「亮」起來）。
- 數字對比：字色由近白 `#e8f2ff` → 純白 `#ffffff`（`font-weight` 本就 800），並把原本會降低對比的「淺藍光暈」`text-shadow` 換成「深藍多向描邊」`0 0 3px rgba(0,18,54,0.95), 0 1px 1px rgba(0,10,40,0.85)`，讓白字邊緣被暗藍包覆 → 亮藍底上白「1」清楚可讀（仍有別於全 low 灰底 `#858585` 的近黑「0」與綠色活動燈）。

**不影響排序**：本段只改一條 CSS 顏色/陰影，與排序 JS 完全獨立；改後仍實測 D/E 排序回歸通過。

**驗證（Chrome 直連本機 http.server + 放大截圖）**：`getComputedStyle` 實測 static-high 底色 = `rgb(47,131,255)`＝`#2f83ff`、字色 = `rgb(255,255,255)`、text-shadow 為深藍描邊；放大截圖對比「亮藍燈＋白『1』」清楚可讀，與綠色活動燈、灰底「0」全 low 三態分明。

**進版**：`v2.97.436 → v2.97.437`；wfg.html 內 version.js cache-buster `?v=20260709a → 20260709b`；common/version.js 徽章 `v2.97.436 → v2.97.437`。

**改動範圍**：只動 `wfg.html`／`common/version.js`／`CHANGELOG.md` 三檔。

## TCON 波形產生器 (wfg) v2.97.436 — 2026-07-09

### 新增「選回『快捷設定』空選項時，通道名稱重置回預設（通道 0～通道 15）並持久化」

**需求（Bruce）**：LA 分頁的預設下拉（`wfg-la-quick-preset`）選 E512/E503 會套用該 preset 的通道名（保留不動）；但把下拉「選回『快捷設定』空選項」時，原本行為是名稱「維持 E512 那組」不變 → 要改成「所有通道名稱重置回預設『通道 0～通道 15』」，且必須同時寫進 localStorage（`WFG_LA_SETTINGS_KEY` 的 `names`），讓 v435 的持久化讀回時看到的就是預設名。

**改的是哪段 code**：`wfgLaApplyQuickPreset(id)` 內「`!preset`（即選回空值『快捷設定』）」分支（原 v434 刻意「保留名稱」的區塊）。改動：
- 把 16 個 `wfgLaChannelNames[ci] = ''`（內部以空字串表示預設名；`wfgLaDisplayChannelName` 會 fallback 成既有預設產生器 `wfgLaDefaultChannelName(ch)` → `t('wfg.channelPrefix') + ' ' + ch` =「通道 N」，**不寫死字串格式**）。
- 比照 v435 主動 `wfgLaIoSelectLockUntil = 0;` 清鎖，確保空值分支下方的同步 render 立即重建通道名稱欄（名稱立刻變回預設）。
- render 後呼叫 `wfgLaSaveUserSettingsNow()`，立即把「重置為預設」的空名稱陣列寫進 localStorage，不依賴 debounce。

**不破壞 v435**：重置只發生在「選回快捷設定的那個 change 事件」當下；之後使用者任何手動改名仍走既有 `focusout → wfgLaStoreChannelName → wfgLaSaveUserSettings` 即時存檔路徑，重整照 v435 正常還原。v435 的 restore render-timing 清鎖修復未動，故空名稱重整不會再出現名稱欄空白。

**驗證（Chrome 直連本機 http.server，忠實走 Bruce 精確條件 + 截圖）**：
- 情境 A：套 E512（0–14 為 E512 名、15 為「通道 15」）→ 選回快捷設定 → 名稱「立即」全變回 通道 0～通道 15、`localStorage names` 全為 `''` → Cmd+R 真實重整 → 仍是 通道 0～通道 15（label 數 16、未拖曳即顯示）。
- 情境 B：選回快捷設定後手動把通道 0 改成 `test0`（走真實委派 `input`+`focusout` 事件）→ `localStorage names[0]='test0'` 其餘 `''` → 真實重整 → 通道 0 = `test0`、其餘 = 通道 1～通道 15。
- 情境 C（回歸，不破壞 v435）：選回快捷設定 → 重整 → 名稱欄「不需拖曳」立即顯示 16 個，無空白。

**進版**：`v2.97.435 → v2.97.436`；wfg.html 內 version.js cache-buster `?v=20260708h → 20260709a`；common/version.js 徽章 `v2.97.435 → v2.97.436`。

**改動範圍**：只動 `wfg.html`（空值分支）／`common/version.js`（徽章）／`CHANGELOG.md`（本條）三檔。

## TCON 波形產生器 (wfg) v2.97.435 — 2026-07-08

### 修復「E512 → 切回快捷設定 → 重整後左側通道名稱欄全空白」的 render-timing bug

**症狀（Bruce 精確步驟）**：預設下拉選 E512/EM02 → 再切回空的「快捷設定」→ Cmd+R 重整 → 左側整排通道名稱欄位全部消失（空白）；只要拖曳一下波形，名稱就立刻重新出現。單純「快捷設定→重整」不會觸發。

**根因（渲染時序，非資料遺失）**：Bruce 補的關鍵線索坐實這是「重整後第一次繪製沒把名稱畫進 DOM」，資料其實還在 localStorage。實測（Chrome 直連線上 v434）：重整後 `#wfg-la-labels` 的 label item 數為 0，但 canvas 波形已畫、`wfgLaChannelNames` 資料完好；手動觸發一次完整 render（`wfgLaUpdateSummary()`→`wfgLaRenderScope()`）→ label 欄立刻補回 16 個正確名稱。演繹定位：`wfgLaRenderScope()` 內 label 重建被 gate `Date.now() >= wfgLaIoSelectLockUntil` 擋掉。而 `wfgLaRestoreUserSettings()` 還原門檻電壓時呼叫了 `wfgLaSetThresholdValue(tv,…,true)`，該函式無條件把 `wfgLaIoSelectLockUntil = Date.now()+250`（IO `<select>` 使用者互動保護鎖）。restore 是程式化還原、非使用者互動，但此鎖讓「restore 自己的 render」與「wfgSwitchMode 的雙 rAF render」都落在 250ms 鎖窗內 → gate 為 false → 首次繪製不建立通道名稱欄，直到之後某次 render（拖曳波形）在鎖過期後才補上。此為 rAF/setTimeout 時序競態，故 Bruce 端間歇但可複現。

**修法**：在 `wfgLaRestoreUserSettings()` 設完門檻、寫回名稱後、呼叫 `wfgLaRenderChannelGrid()`/`wfgLaUpdateSummary()` 之前，主動 `wfgLaIoSelectLockUntil = 0;` 清鎖，讓 restore 的同步 render 一定能建立 label 欄，徹底消除競態（與既有 22771/23206 兩處「清鎖以確保 scope labels 能重建」同一意圖）。鎖本意是保護使用者操作 IO 下拉時不被重建打斷，程式化 restore 無此互動，清鎖安全。

**回歸護欄**：只動 `wfgLaRestoreUserSettings` 一行（加清鎖）＋註解，未碰 v434 兩個持久化守衛、E512/E503 快捷、kvdat、連續觸發、通道拖曳。

**驗證**：Chrome 開本機修正版，忠實走 Bruce 步驟（E512 → 切回快捷設定 → 重整）多次，重整後不需任何互動、`.wfg-la-ch-title` 與左側 label 欄立即顯示 16 個 E512 名稱。

**進版**：`v2.97.434 → v2.97.435`；wfg.html 內 version.js cache-buster `?v=20260708g → 20260708h`；common/version.js 徽章 `v2.97.434 → v2.97.435`。

## TCON 波形產生器 (wfg) v2.97.434 — 2026-07-08

### 修復 v433「重整保留 LA 設定」的兩個持久化 bug

**Bug 1 — 選快捷 preset 後改通道名，重整被 preset 名蓋回**
- 根因（時序）：套 preset（如 E512/EM02）尾端排了 `setTimeout(…wfgLaRenderChannelGrid()…, 120)` safety-net。使用者「馬上」改名時，這個（或其他）`wfgLaRenderChannelGrid()` 會在改名途中 `grid.innerHTML = html` 整段重建，銷毀正在編輯的 contenteditable → 焦點丟失、未提交文字被洗掉；隨後 preset 的 `wfgLaUpdateSummary()` 已排的 debounce 存檔讀回 `wfgLaChannelNames`＝preset 名並寫進 localStorage。重整還原時自然是 preset 名。label 區早在 v2.97.409 就用 `labelNameEditActive` 守住同類重建，grid 區卻一直沒有 → 不對稱正是病灶。
- 修法：(a) `wfgLaRenderChannelGrid()` 開頭加守衛——當 grid 內 `data-field="name"` 的 contenteditable 正被編輯（`document.activeElement`）時，直接 return 不重建，與 label 守衛對稱；focusout 時 activeElement 已非該格，照常重建。(b) `wfgLaSaveUserSettingsNow()` 存檔前先把「當下聚焦的通道名 contenteditable」（grid 或 label）提交進 `wfgLaChannelNames`，保證持久化的一律是畫面上真實名稱，即使 debounce 在改名途中觸發。

**Bug 2 — 選空的「快捷設定」佔位選項後重整，通道名稱欄位全消失**
- 根因（程式碼）：`wfgLaApplyQuickPreset('')` 空選項分支把 `wfgLaChannelNames[ri]=''` 全清，緊接著 `wfgLaUpdateSummary()` → `wfgLaSaveUserSettings()` 把「空名稱」寫進 localStorage；重整還原時全為空 → 名稱消失。（jsdom 模擬坐實：`myname` → 存成 `""` → 重整顯示「通道 0」）
- 修法：空選項分支「保留」使用者通道名稱（名稱屬使用者資料），reset 只清描述/分析器/順序。持久化因而存到真實名稱，重整維持原本名字。切換到「其他非空 preset」仍照舊清空並載入新 preset 名，不受影響。

**回歸護欄**：只動持久化/重建守衛三處，未碰 v432 秒數、E503 快捷、kvdat 匯出、連續觸發裁切、通道拖曳。`node --check` 語法通過。Bug 2 已用 jsdom 忠實模擬複現＋驗證修法；Bug 1 的即時 DOM race 需真機/瀏覽器複驗（沙箱無法下載 Chromium），交 Dispatch push 後線上驗收。

**進版**：`v2.97.433 → v2.97.434`；wfg.html 內 version.js cache-buster `?v=20260708f → 20260708g`；common/version.js 徽章 `v2.97.433 → v2.97.434`（v433 曾漏 version.js 導致徽章未更新，本版一起改）。

## TCON 波形產生器 (wfg) v2.97.432 — 2026-07-08

### LA 單次觸發 100% 秒數：正式改為「視窗總長 × (1 − 觸發位置%)」，移除 v430/v431 診斷字串

Bruce 真機定調唯一正解：進度條括號秒數＝「扣掉前置預觸發後的實際錄製秒數」，與 edge / totalSamples / writePos / 硬體回吐樣本數**全都無關**，純粹是視窗扣掉前置觸發比例。

**公式（單一來源，函式上方統一計算）**
- `acqWindowTotalSec = limitSamples ÷ effectiveRate`（理論取樣時間；5GSa@200MHz = 25.0s）。
- `acqRecordSec = acqWindowTotalSec × (1 − 觸發位置% / 100)`。
- 觸發位置% 讀實際觸發設定 `triggerPercent`（已 clamp 0~100，未啟用觸發＝0），**不寫死任何秒數常數**；深度/取樣率/觸發位置改變時自動跟著變。
- 驗收例：觸發位置 5% → 25 × 0.95 = **23.75s ≈ 23.7s**；12% → 25 × 0.88 = 22s；無觸發 → 25s。

**改動範圍（只動顯示秒數計算）**
- 進行中 poll 迴圈 `liveSec`＝`progress/100 × acqRecordSec`（原本 × cfg.durationSec 全窗）→ 平順數到 acqRecordSec，不再衝到 25。
- 無觸發完成、97%「讀取波形資料」階段秒數同樣沿用 acqRecordSec。
- 100% 完成秒數＝acqRecordSec（手動停止仍優先用實際停止秒數）。
- **移除** v430 診斷長字串（`100% shown=… | edge=… | rawTot=…`）＋臨時 CSS hack，恢復乾淨「單次擷取完成 (XX.Xs)」顯示。
- **移除** v429 edge 推估整段（`probeSignalEndSec` 捕捉、`acqEffRate/acqNominalSec/acqTimelineSec/acqActualSec` 及防呆）與 v431 診斷變數（`diagRxBytes/diagRawTotPre/diagLastEdgePre`）。

**回歸護欄**：只動進度條顯示秒數；未碰 kvdat 匯出位元對齊、連續觸發尾端裁切（v412 `wfgLaTrimUncommittedTail`）、通道/色塊/拖曳。node --check 語法通過；殘留舊變數引用 grep＝0。

**進版**：`v2.97.430 → v2.97.432`；version.js cache-buster `?v=20260708e → 20260708f`。
**待 Bruce 真機驗收**：5GSa@200MHz 單次觸發、觸發位置 5%，100% 應顯示 ≈23.7s；我不自行宣稱已驗（無 LA2016 硬體）。

## TCON 波形產生器 (wfg) v2.97.430 — 2026-07-08【暫時診斷版】

### LA 100% 進度條文字改印原始數值（供 Dispatch 真機截圖讀，拿到數字即回正式修法）

v429 真機仍 25.0；且 Dispatch 端**讀不到任何 log**（不在 DOM/window，console reader 掛不進，capture buffer 抓不到）。唯一可靠管道＝螢幕截圖。故本版把 100% 完成的進度條文字暫時改成印原始數值：

`100% shown=<顯示秒數> | edge=<lastRealEdgeSec或none> | rawTot=<rawTotalSamples> | tl=<timelineSec> | trig=<觸發位置%> | nom=<nominalSec>`

- `edge` 抓不到印 `none`（不被 fallback 蓋掉，直接看出 decode 當下有沒有 edge）。
- 特別加 `trig`（觸發位置%）：對照 Bruce 線索 25.0×(1−5%)=23.75≈23.7 —— 用真機數字分辨「實際時間 = 全窗×(1−trig)（扣前置觸發）」還是「= edge（硬體樣本上限 4.74e9/2e8）」。
- 進度條文字元素臨時 `white-space:normal`+`word-break` 讓長字串完整顯示不被 ellipsis 截。

**流程**：Dispatch 真機跑一次 → 截圖那行 → 依數字定位（edge 是 none 還是 23.x？23.7 = 全窗扣觸發 還是 硬體上限？）→ 出正式修法 v431 → 真機驗 100%≈23.7 才算過。本版為暫時診斷，數字到手即移除。

**回歸護欄**：匯出函式 vs v425＝0 差異、`wfgLaTrimUncommittedTail`(v412)＝0 差異，均未動。
**進版**：`v2.97.429 → v2.97.430`；cache-buster `?v=20260708d → 20260708e`。

## TCON 波形產生器 (wfg) v2.97.429 — 2026-07-08

### LA 100% 秒數：v428 真機仍 25.0 → 改用「decode 當下區域變數捕捉」最後真實 edge（修 v428 掃全域失敗）

**Bruce 真機驗 v428 仍顯示 25.0s**，並精準指出：`acqLastEdgeSample` 在真機算出 0 → 走 fallback `totalSamples/rate=25.0`（名目）。即 v428 在 100% 完成處**事後掃「全域」`wfgLaCapturedWaveform.edgesByChannel`**，真機因時序/partial 後續改動掃到空 → 誤 fallback 名目。

**修法（v429，針對 v428 失敗根因）**
- **改用區域變數在「decode+套用當下」捕捉**：`wfgLaSafeCaptureProbe` 內 `wfgLaApplyCapturedWaveform(decoded)` 之後，就地掃**區域 `decoded`**（本次擷取最終物件、`edgesByChannel` 由 `wfgLaDecodeCaptureWaveform` 8811 行真正 push、必有值）取「最後一個真實 edge 秒」存區域 `probeSignalEndSec`。100% 完成直接用它，**不再事後掃全域**（避開時序/物件被換掉的坑）。
- **fallback 改掉名目**：抓不到 edge 時退「時間軸 `wfgLaCaptureDuration()`（durationSec）」，**不再用 `totalSamples/rate` 名目**（Bruce #2 要求：fallback 不准默默回 25.0）。
- **防呆（Bruce #3）**：若顯示秒數幾乎等於名目 `totalSamples/rate` 且時間軸更短 → 強制改用時間軸；此判斷只會讓顯示 ≤ 名目、永不放大。
- **真機可複核的一行 log**（capture log，非 console；按「複製 log」可見）：`AcqProgress final: lastRealEdgeSec=… lastRealEdgeSample=… rawTotalSamples=… nominalSec=… timelineSec=… ★shown=…`。若真機顯示仍不對，這行會直接指出 `lastRealEdgeSec` 有沒有量到（none＝decoded 當下真的沒 edge，屬另一根因）。

**欄位佐證（用實際解碼路徑，非手捏）**：`wfgLaDecodeCaptureWaveform`（wfg.html:8782）回傳物件的 `edgesByChannel[bit]` 在 8811 行 `push(edgeTime)`（單位＝秒＝`totalSamples/effectiveRate`），最後一個 transition 之後的靜止尾段不 push——這就是「最後真實 edge」的來源，與 v412 `wfgLaTrimUncommittedTail`(8759-8765) 取 lastEdge 用的是同一欄位同結構。v429 在 apply 當下、edges 一定在時取值，不受事後改動影響。

**回歸護欄（自動比對通過）**：① 匯出函式 vs v425 baseline `diff`＝**0 差異**（header/smpDepth/位元對齊不動）；② `wfgLaTrimUncommittedTail`(v412 連續觸發尾端裁切) `diff`＝**0 差異**（未動一行）；③ 只新增區域變數 `probeSignalEndSec` 與其捕捉/使用，`decoded`/波形/匯出/smpDepth 值不變。

**進版**：`v2.97.428 → v2.97.429`；cache-buster `?v=20260708c → 20260708d`。
**待 Bruce 真機驗收**：v429 5GSa@200MHz 單次觸發，100% 應 ≈23.7s。**我無法自跑 LA2016、也無法讀真機 IIFE 私有物件**（`window.wfgLaDebugEdges` 在此頁未定義），故此項務必由 Dispatch 真機確認；若仍不對，請按「複製 log」把 `AcqProgress final` 那行貼我，`lastRealEdgeSec` 值即可定位。

## TCON 波形產生器 (wfg) v2.97.428 — 2026-07-08

### LA 100% 秒數：真正 un-pad（改用最後真實 edge）＋ 還原 v426/v427 無效改動

**Bruce 真機截圖定調（5GSa@200MHz 單次觸發）**：100% 每次顯示「25.0s」＝頂端理論值；KingstVIS 開檔以實際 ##D transition 資料計時 ≈23.7s。問題1（讀取階段秒數）已於 v426 修好，本版不動。

**真根因（終於定位對）**：single-trigger **不做尾端裁切**（v2.97.412 的 `wfgLaTrimUncommittedTail` 僅連續觸發跑）。`decoded.totalSamples` 是 RLE reps 總和，**包含「最後一個 transition 之後的靜止尾段」**（以一個大 rep 編碼）。所以 `totalSamples/rate` ＝名目全窗（5e9/2e8=25.0s），**不是實際訊號結束時間**。v425/426 的 100% 都用 `totalSamples/rate` → 永遠顯示 25.0。這就是為何前幾版「統一函式」沒用——分岔不在函式，在「totalSamples 含尾端靜止段」。

**【A】還原 v426/v427 無效改動（feedback_revert_wrong_changes）**
- 還原 `wfgLaExportKvdat` 回 v2.97.425 原樣，移除 v426 抽出的 4 個 helper（`wfgLaExportSampleRate`/`wfgLaExportSelectedChannels`/`wfgLaExportTotalSamples`/`wfgLaExportedDurationSec`）——經 `diff` 證實匯出函式與 v425 **逐位元 0 差異**。
- 還原 100% 區塊不再走那些 helper。
- 移除 v2.97.427 的診斷 `AcqProgress 100% breakdown` log 與 `decoded.__rawTotalSamples/__rawDurationSec` 暫存（Chrome console reader 掛不進此頁、IIFE 私有域讀不到，該 log 對 Bruce 無用，已依約移除）。
- 保留：v426 的問題1修法（`wfg.html:8188` 下載迴圈補秒數，Bruce 已確認有效）。

**【B】正解（外科手術，只動 single-trigger 100% 顯示秒數）**
- `wfg.html:~13247` 100% finalSec 改為：掃所有通道 `edgesByChannel` 取「最後一個真實 edge 樣本」`acqLastEdgeSample`，`finalSec =(acqLastEdgeSample+1)/effRate`（無任何 edge 時退回 `totalSamples/rate`）。
- **只改進度條顯示的秒數**。`decoded`、波形時間軸、觸發標記、`wfgLaExportKvdat`、連續觸發路徑、smpDepth **一律不動**。

**【C】回歸驗證（附前後對照數字）**
- ① 目標情境：`decoded.totalSamples=5e9`（含尾端靜止段）、最後真實 edge 在 23.7s → OLD `totalSamples/rate`=**25.000s** → NEW `(lastEdge+1)/rate`=**23.700s** ✓。其餘：normal 鋪滿末端 24.99→24.99（幾乎不變）、partial trigger-rel 23.7→23.6、500MSa 2.487→2.487（不變）——只有「含尾端靜止段」的情境被修正，其餘無回歸。
- ② kvdat 匯出：`diff` 匯出函式 vs v425 baseline＝**0 差異**，header/smpDepth/位元對齊完全未動。
- ③ 連續觸發：v412 已在 repeat 裁尾端未提交段，故 repeat 的 `totalSamples≈lastEdge`，NEW≈OLD 顯示不變；且本版未改 `wfgLaTrimUncommittedTail`/`wfgLaWaitCaptureInfoStable` 任何一行。
- kvset(v418)、chnShowIndex(v419)、E512/EM02(v420)、色塊(v421/422)、名稱拖曳(v424) 均未觸及。

**進版**：`v2.97.427 → v2.97.428`；cache-buster `?v=20260708b → 20260708c`。
**待 Bruce 真機驗收**：5GSa@200MHz 單次觸發，100% 應顯示 ≈23.7s（非 25.0s）。我無法自跑 LA2016，此項由 Dispatch 真機確認。

## TCON 波形產生器 (wfg) v2.97.427 — 2026-07-08

### LA 100% 秒數 vs 匯出檔：完整資料流追蹤 + 診斷對帳 log（暫不臆測修改）

- **Bruce 實測 v426 第2點仍在**，並指出正確方向：問題不在函式，而在**呼叫時機的輸入值**（100% 可能拿名目/裁切前、匯出拿裁切後實際）。
- **完整逐行追蹤結果（single-trigger，鐵律3：不確定就說不確定）**：
  - `wfgLaSafeCaptureProbe` 內：`nRepPackets`（`wfgLaWaitCaptureInfoStable` 握手後的實際提交量）→ `packetBytes = floor(nRepPackets/5)×16` → EP6 下載 `packetBytes` → `wfgLaDecodeCaptureWaveform` 得 `decoded.totalSamples`（實際 reps 總和）。
  - 裁切分支：manualStop / partialDownload(13194) / overrun(13210)。**唯一把名目值塞進 totalSamples 的是 overrun-trim（13212）** `wfgLaTrimDecodedCapture(decoded, expectedDuration, sampleCfg.limitSamples)` → `totalSamples = limitSamples`(名目)。
  - `wfgLaApplyCapturedWaveform(decoded)`（13216）令 `wfgLaCapturedWaveform = decoded`（**同一物件**）。
  - 100% finalSec（13246-13249）讀 `wfgLaExportTotalSamples(wfgLaCapturedWaveform, ...)`；匯出 `wfgLaExportKvdat` 也讀 `wfgLaCapturedWaveform`。**兩者讀同一個裁切後物件** → 靜態分析下 100% 顯示的 `totalSamples/rate` 與寫進 kvdat header 的完全相同。
  - **結論**：v426 的 100% **已經**用裁切後、與 header 同源的值，Bruce 假設的「100% 用名目 / 匯出用實際」分岔**在現行 code 不存在**。我無法在程式層重現 100%≠匯出檔。
- **剩餘兩個候選（需硬體 log 才能定案）**：(a) runtime 值分岔（擷取完成到按匯出之間 `wfgLaCapturedWaveform` 被改）；(b) KingstVIS「檔案時間」的定義＝header `totalSamples`（則 v426 已相符）還是**最後一個真實 transition**（則會比 header 短 → 100% 看起來偏長，需改成顯示 lastEdge）。
- **本版做法（不臆測亂改，先取證）**：加**診斷對帳 log**。100% 完成時印出 `AcqProgress 100% breakdown`：`rawDecodedTotal`(裁切前) / `trimmedTotal`(=header=100%用) / `lastRealEdge`(最後真實 transition) 三個樣本數與各自時間、`decoded.durationSec`、`partialDownload`、`★100%顯示`。並存裁切前 `decoded.__rawTotalSamples`。
- **請 Bruce 提供硬體數字（明講：我無法自跑 LA2016）**：跑一次單次觸發 → 按「複製 log」把 `AcqProgress 100% breakdown` 那行貼給我 → 再匯出該檔用 KingstVIS 開，記下顯示時間。比對 KingstVIS 時間＝三個候選(trimmedTotal / lastRealEdge / rawDecoded)哪一個，即可一刀定位並套正確修法（若＝lastRealEdge，就把 100% 與 header 都改用 lastEdge）。
- **不變**：擷取/觸發/decode/匯出/裁切邏輯與 v426 完全相同，本版**只加 log 與暫存變數**，零行為改動。
- **進版**：`v2.97.426 → v2.97.427`；cache-buster version.js `?v=20260708a → 20260708b`。
- **驗證**：Chrome no-store fetch 確認 live origin＝v2.97.427 且含 breakdown log 程式碼；沙箱注入 live 函式確認 breakdown 三值計算正確。硬體實跑取數需 Bruce。

## TCON 波形產生器 (wfg) v2.97.426 — 2026-07-08

### LA 單次觸發進度條秒數：v425 兩個問題實測仍在 → 根因再定位並修正

- **Bruce 實測 v425 仍有兩個問題**（附三張截圖，5GSa/500MSa @ 200MHz 單次觸發）：
  1. **「讀取波形資料」階段沒有秒數**：截圖顯示 `讀取波形資料 77%`、右側百分比 `99%` 括號秒數不見。
  2. **100% 秒數仍未扣前置觸發**：截圖 `單次擷取完成 100% (2.500s)` 顯示名目值，需＝匯出 kvdat 檔實際時間。
- **問題1 真根因（讀 code，鐵律1：指出修的是哪段 diff）**：v425 只在 `wfgLaSafeCaptureProbe` 下載前的**佔位**呼叫（第 13074 行 `wfgLaSetAcqProgress(97, '讀取波形資料', ..., 0.97×窗)`）補了秒數，**但真正的 EP6 下載迴圈**在 `wfgLaReadEp6CaptureBytes`（第 8185 行）每個 chunk 都呼叫 `wfgLaSetAcqProgress(pct, '讀取波形資料 NN%', 'active')` **沒帶第 4 參數 seconds**，且此迴圈**反覆覆寫**佔位所帶的秒數 → 77%/99% 階段秒數整段消失。這正是 v425「宣稱修好卻沒驗證」的漏網之魚。
  - **修法（diff：wfg.html 第 8185 行）**：下載迴圈的 `wfgLaSetAcqProgress` 補第 4 參數 `0.97 × (cfg.durationSec)`，與 13074 佔位同式（穩定不閃動）；100% 完成後由匯出檔真值覆寫。
- **問題2 修法（讀 code + 建構保證，鐵律3：不確定就說不確定）**：抽出**匯出檔時長唯一真值函式** `wfgLaExportedDurationSec()`／`wfgLaExportSampleRate()`／`wfgLaExportTotalSamples()`，`wfgLaExportKvdat`（寫 kvdat header）與進度條 100% `finalSec` **共用同一份計算**（含 `maxRaw+1` 成長與 `round(effectiveRate)` 取整），由建構保證「100% 秒數 === 匯出檔在 KingstVIS 開檔顯示時間」逐位元一致。
  - **誠實聲明（鐵律3）**：純讀 code 追蹤，v425 的 `totalSamples/effRate` 在我能靜態分析的每個分支其實已等於匯出值（partialDownload 也不例外），我**無法在程式碼層重現 100%≠匯出檔的分歧**；此版把兩者統一到同一函式以徹底消除任何殘餘分歧（例如 `maxRaw+1`／取整）並防止未來 drift。**若 5GSa@200MHz 硬體實跑仍有差**，請提供「100% 顯示秒數」與「該檔在 KingstVIS 的顯示時間」兩個實際數字，我才能定位真正的硬體側差異——因為我無法自己跑 LA2016。
- **匯出不變**：`wfgLaExportKvdat` 改走 helper 後計算結果與舊版**逐位元相同**，不影響 kvdat/KingstVIS 相容（`durationSec` 區域變數為未使用的殘留，改動零影響）。
- **進版**：`v2.97.425 → v2.97.426`；cache-buster version.js `?v=20260707c → 20260708a`。
- **驗證**：(a) Chrome MCP no-store fetch 確認 live origin＝v2.97.426；(b) DOM 模擬呼叫下載迴圈 render path 確認「讀取波形資料」pct 帶秒數；(c) `wfgLaExportedDurationSec` 與匯出 header 同源（同一函式）。**硬體實跑（5GSa@200MHz 單次觸發看 100% vs 匯出檔）需 Bruce 實測**，我無法自跑 LA2016。

## TCON 波形產生器 (wfg) v2.97.425 — 2026-07-07

### LA 單次觸發進度條秒數：兩處修正（100% 名目值 → 匯出檔實際值；97~99% 秒數消失）

- **Bruce 實測回報兩個 bug**（5GSa 深度 + 200MHz 取樣率）：
  1. **100% 秒數顯示錯**：進度條 100% 顯示 **25s**（名目：5e9÷200e6），但匯出檔實際約 **23.7s**（硬體實際 decode 樣本約 4.74G÷200MHz）。
  2. **97~99% 秒數消失**：擷取到 97~99% 這段秒數不見。
- **問題1 根因（讀 code）**：匯出檔 `wfgLaExportKvdat` 的 header（第 23458 行）寫的是 `decoded.totalSamples ÷ effectiveRate`（實際解出樣本數；partialDownload 時為實際下載到的樣本），KingstVIS 開檔時長即以此計。而 v424 進度條 100% 誤用 `wfgLaCaptureDuration()` ＝ `decoded.durationSec`——該值在 partialDownload 分支（第 13176/13181 行）被覆寫成**名目** `expectedDuration`（= `limitSamples ÷ effRate`，5GSa@200MHz = 25s），與匯出檔用的 `totalSamples` **不同源** → 顯示 25s 名目、匯出 23.7s 實際。
  - **修法**：100% 秒數改用 `decoded.totalSamples ÷ effectiveRate`（`wfgLaCapturedWaveform.totalSamples / sampleCfg.effectiveRate`），與 kvdat header 完全同一算式，保證進度條 100% 秒數＝匯出檔實際時長。**未寫死任何秒數**，一律由實際擷取結果推。log 加印 `totalSamples / effRate / actualSec / nominal captureDuration / partialDownload / shown`，供實機確認根因與對帳。
- **問題2 根因（讀 code）**：讀取(EP6 下載)階段那個 `wfgLaSetAcqProgress(97, '讀取波形資料', ...)` 呼叫**沒帶第 4 參數 seconds**，seconds=undefined → 括號整段不顯示，直到 100% 才回來（no-trigger 完成的 100% active 那一刻同樣沒帶，會閃一下空白）。
  - **修法**：讀取階段補帶延續估計 `0.97 × 已選窗`（此時 decode 未完成、實際樣本未知，延續進行中估計，100% 後立即被實際值覆寫）；no-trigger 完成的 100% active 也補帶 `cfg.durationSec` 估計。0%→100% 全程秒數不中斷。
- **不變**：擷取/觸發/decode/匯出邏輯、進度百分比計算皆不動；進行中(0~96%)估計沿用 `進度% × 已選窗`（前置停等＝前置量），只有**最終 100% 換成匯出同源實際值**。
- **進版**：`v2.97.424 → v2.97.425`；cache-buster version.js `?v=20260707b → 20260707c`。
- **驗證**：待 5GSa@200MHz LA2016 硬體實跑單次觸發——(a) 97~99% 秒數不消失、(b) 100% 秒數 ≈ 23.7s（實際非名目 25s）、(c) 匯出該檔比對時長＝100% 顯示秒數。附截圖＋log（`AcqProgress final: totalSamples=… actualSec=…`）實測數據。

## TCON 波形產生器 (wfg) v2.97.424 — 2026-07-07

### LA 單次觸發進度條：百分比右邊加「已錄製秒數」括號

- **需求（Bruce）**：LA 分析器 `wfg.html#wfg-la` 按「單次觸發」時，進度條百分比右邊加一個括號顯示「已錄製秒數」。**最重要**：這個秒數必須與該次錄完匯出/顯示的檔案時長（實際擷取時長）一致，且要用實際硬體 decode 結果推得（totalSamples ÷ 取樣率、同一來源），不可用另跑的假計時器或名目值硬湊。前置觸發停等時顯示已擷取的前置量、觸發後累加、100% 顯示最終實際秒數。
- **秒數來源（同源保證）**：
  - **進行中（估計）**：`liveSec = 進度% × cfg.durationSec（已選取樣窗＝depth/rate）`。前置停等時進度＝`triggerPercent`，故 `liveSec = triggerPercent × 窗 = 前置量`；觸發後隨進度累加至滿窗。此為進行中無法得知硬體結果時的即時估計，明確標示且會被最終值覆寫。
  - **100% 完成（權威值）**：直接用 `wfgLaCaptureDuration()`。此時 `wfgLaCapturedWaveform` 已由 `wfgLaApplyCapturedWaveform` 設為 `decoded`，其 `durationSec = decoded.totalSamples / effectiveRate` —— **與匯出檔時長為同一個量**，因此進度條 100% 秒數＝匯出檔實際時長，由建構保證對得上（非硬寫數字）。
  - 手動停止用 `manualStopSec`（亦即 `wfgLaCaptureDuration` 覆寫來源），一致。
- **關於「22 vs 25」（Bruce 補充）**：由 code 分析，匯出檔＝整個擷取緩衝＝整個取樣窗（**含**前置觸發段），前置量是「窗內」的一部分而非額外相加。故 100% 的已錄秒數＝完整 decode 時長（不是「窗−前置」）。前置停等顯示前置量、100% 顯示完整時長，兩者不衝突。實際數字一律由硬體 decode 推得，程式未寫死任何秒數 —— 待硬體實測確認。
- **做法（`wfg.html`）**：`wfgLaSetAcqProgress(percent, text, state, seconds)` 新增第 4 參數，於 `#wfg-la-acq-progress-pct` 百分比後附 ` (時長)`（沿用 `wfgLaFormatDuration`，與工具內波形/檔案時長同格式）。poll 迴圈即時傳 `liveSec`；下載完成後最終傳 `wfgLaCaptureDuration()`。CSS：左狀態文字 `text-overflow:ellipsis`、右側 `flex:0 0 auto` 確保秒數永遠可見不被擠出。log 加印 `liveSec` 與 `AcqProgress final seconds` 便於實測對帳。
- **不變**：擷取/觸發/decode/匯出、進度百分比計算、前置/觸發/後置階段邏輯皆不動，只加顯示。
- **進版**：`v2.97.423 → v2.97.424`；cache-buster version.js `?v=20260707a → 20260707b`。
- **驗證**：待 LA2016 硬體實跑單次觸發——前置停等秒數＝前置量、觸發後遞增、100% 秒數；匯出該檔確認檔案時長＝進度條 100% 秒數一致（三者對帳）。附截圖＋log 實測數據。

## TCON 波形產生器 (wfg) v2.97.423 — 2026-07-07

### LA 通道名稱「獨立互換」拖曳（電腦版滑鼠限定）

- **需求（Bruce）**：LA 分析器通道名欄新增一種拖曳。既有「色塊/數字」拖曳（滑到左側 0~15 彩色色塊 → grab → 連通道名＋波形一起重排順序）保留不動。新增：在「通道名稱＋觸發鈕那一區的空白處」滑鼠移上去也變手爪(grab)，按住拖曳**只搬移通道名稱文字**（不含波形、不含色塊/數字、不動順序）；拖到另一通道名稱位置放開 → 這**兩個通道的名稱互換**（是互換、不是重排、不是插入）。例：通道3 名稱拖到通道7 → 通道3 顯示原通道7 名稱、通道7 顯示原通道3 名稱，其餘全不變。只做電腦版/滑鼠，觸控手機停用。
- **做法（`wfg.html`）**：
  - 命中判定 `wfgLaNameDragEligibleTarget`：`wfgLaIsDesktop()`(min-width:901px) 為真、目標在 `.wfg-la-label-text` 內、**排除** contenteditable 名稱(`.wfg-la-label-name`)與觸發按鈕(`.wfg-la-trig-btn`) → 只有名稱區空白處(含 role 行與欄底空白)才啟動。
  - 拖曳流程：獨立狀態 `wfgLaNameDrag`（與既有 `wfgLaChannelDrag` 重排並存互不干擾）。`labels` mousedown 左鍵命中 → `preventDefault` 起拖；window mousemove → 過 4px 門檻後建立浮動名稱 ghost 跟隨游標、`elementFromPoint` 標出 drop 目標列(`.wfg-la-name-drop-target` 藍框高亮)；window mouseup → 若目標為另一通道則以顯示名互換 `wfgLaStoreChannelName(srcCh, dstDisplay)` / `(dstCh, srcDisplay)`，再 `wfgLaRenderChannelGrid + wfgLaRenderScope + wfgLaUpdateSummary`。
  - CSS：`@media(min-width:901px) .wfg-la-label-text{cursor:grab}`（名稱 contenteditable 仍 `cursor:text`、觸發鈕仍 `cursor:pointer`，各自規則覆蓋）；`body.wfg-la-name-dragging` 全域 grabbing；drop 目標藍框；`.wfg-la-name-ghost` 浮動名稱牌(pointer-events:none 不擋 hit-test)。
- **互換語意**：只交換 `wfgLaChannelNames`（以原始通道號索引的顯示名稱）；波形資料、原始通道號、顏色、觸發設定、顯示順序一律不動。以「顯示名」寫回，預設名也會固化成對方文字，符合 Bruce 例子。
- **不變**：色塊/數字「名稱＋波形一起重排」拖曳、通道名編輯、A↑/A↓/B↑/B↓ 觸發鈕點選、燈號皆維持；觸控/手機不綁此拖曳、不誤觸。
- **進版**：`v2.97.422 → v2.97.423`；cache-buster version.js `?v=20260704f → 20260707a`。
- **驗證**：線上 wfg.html#wfg-la 實測——名稱空白區 hover 變手爪、名稱文字仍可編輯、觸發鈕仍可點；拖 A 名稱到 B 只互換兩者名稱（波形/順序/顏色/數字不動）；色塊重排仍正常；行動版寬度不啟用。附截圖＋DOM 讀回。

## TCON 波形產生器 (wfg) v2.97.422 — 2026-07-04

### LA 通道色塊數字放大兩倍＋正中置中；隱藏的 .wfg-la-ch-row 還原回 v420

- **需求（Bruce）**：(1) 可見通道欄 `.wfg-la-label-item` 色塊裡的通道號太小且偏左下 → 字級放大兩倍、水平＋垂直**完全置中**於色塊正中（Bruce 明確覆蓋原廠左下角排法）。(2) v421 先前改錯、加在隱藏卡 `#wfg-la-channel-grid`（`.wfg-la-ch-row`）的色塊/數字要**完整還原回 v420 原樣**、不留殘留。
- **做法**：
  - 置中放大：`.wfg-la-label-colorblock` 由 `display:block` 改 `display:flex; align-items:center; justify-content:center`，寬 26→30px（compact 22→26px，容雙位數不被切）；`.wfg-la-label-colornum` 由絕對定位左下改 `position:relative`（在 `::after` 漸層之上），字級 10→20px（compact 9→18px，正好×2），`letter-spacing:-1px`，加強白色 halo 描邊確保深色底可讀。
  - 還原隱藏 grid：以 `git diff 5a0547d(v420)` 逐處反向 —— `.wfg-la-ch-row` grid 4 欄改回 5 欄(`22 22 1fr 24 18`)、刪除 v421 加的 `.wfg-la-ch-colorblock` CSS 區塊、render 還原成 `≡` 拖曳把手＋`.wfg-la-ch-num` 小色塊兩個 span、mousedown/touchstart 綁定 selector 改回 `.wfg-la-drag-handle`。驗證 `grep -c wfg-la-ch-colorblock = 0`，diff 對 v420 僅剩可見欄 `.wfg-la-label-*` 改動。
- **不變**：可見欄拖曳排序、數字綁定原始通道（改名/重排不變號）、A/B 觸發鈕、燈號皆維持。
- **進版**：`v2.97.421 → v2.97.422`；cache-buster version.js `?v=20260704e → 20260704f`。
- **驗證**：線上截圖確認數字明顯放大且置中；git diff 對 v420 確認隱藏 grid 無殘留。

## TCON 波形產生器 (wfg) v2.97.421 — 2026-07-04

### LA 通道欄改為原廠 KingstVIS 樣式：跨列高彩色色塊＋內嵌原始通道號

- **需求（Bruce）**：LA 通道卡左側原本是「≡ 拖曳把手 + 小色塊 + 可編輯通道名 + A/B 觸發鈕」，小色塊與通道號沒整合，使用者改了通道名後就看不出原本是第幾通道。改成與原廠 KingstVIS 一致——一整條、跨整列高的彩色色塊，把通道原始索引號(0~15)嵌在色塊左下角。
- **做法（`wfg.html`）**：主體是波形圖左側「通道名欄」`.wfg-la-label-item`（`#wfg-la-labels`，即畫面實際看到、可改名的那一欄）。
  - render（label map，第 ~6070 行）：把 `.wfg-la-drag-handle`（≡）＋ `.wfg-la-label-dot`（8px 小色點）兩個 span 合併成單一 `.wfg-la-label-colorblock`，內含 `.wfg-la-label-colornum` 顯示**原始通道號 `ch`**（loop 原值＝`data-ch`，固定、不隨改名或拖曳重排改變其代表通道）。
  - CSS：`.wfg-la-label-colorblock` 用 `align-self: stretch` 跨整列高、`width:26px`（compact 22px），`background` 沿用各通道既有代表色（與波形一致），`::after` 疊左亮右暗漸層做原廠直條光澤感；`.wfg-la-label-colornum` 絕對定位左下角、深色字＋白色 halo 確保深/淺色底皆可讀。
  - 拖曳：色塊本身即拖曳把手。`#wfg-la-labels` 的 mousedown/touchstart 綁定 selector 由 `.wfg-la-drag-handle` 改為 `.wfg-la-label-colorblock`。
  - 一致性：另一個隱藏的通道卡 `#wfg-la-channel-grid`（`.wfg-la-ch-row`）也同步改為 `.wfg-la-ch-colorblock` 同款樣式，grid 由 5 欄改 4 欄，綁定同步更新。
- **不變**：通道名框（contenteditable）、analyzer role、A↑/A↓/B↑/B↓ 觸發鈕、啟用燈號(0/1/綠點 `.wfg-la-label-live`)皆未動；settings 面板的 `.wfg-la-ch-num` 小 chip 不在色塊內，不受影響。
- **進版**：`v2.97.420 → v2.97.421`；cache-buster version.js `?v=20260704d → 20260704e`。
- **驗證**：線上開 wfg.html#wfg-la，截圖與原廠 IMG_3241 並排比對；確認拖曳仍可重排、色塊數字為原始索引、改名後數字不變。

## TCON 波形產生器 (wfg) v2.97.420 — 2026-07-04

### 新增「E512/EM02」快捷設定 preset（走正確 .kvset 匯入路徑＋正規化檔，無順序特例）

- **需求**：左上「快捷設定」下拉第一位新增「E512/EM02」，選它＝套用 EM02 設定（通道名稱/深度5G/rate200MHz/觸發ch3/chnEnable/chnVth=1.25/chnLevel），且通道顯示順序為 0~15 正常順序。
- **做法（乾淨、無特例 code）**：preset 內容用「順序正規化檔」`E512_EM02_preset_norm.kvset`（與原廠 EM02_E512.kvset **只差 `chnShowIndex`**，改成 identity `0,1,…,15`，其餘完全相同）。經 v419 修好的正確匯入核心 `wfgLaApplyKvsetText`（chnShowIndex 反排列）處理後，identity 反排列即得 0~15 正常順序，**不需要任何順序覆寫特例**（原本用過的 `forceIdentityOrder` 已移除）。
  - `WFG_LA_QUICK_PRESETS` 第一項加 `{ id:'e512-em02', nameKey:'wfg.laPresetE512', kvsetXml: <正規化檔全文> }`。
  - `wfgLaApplyQuickPreset` 新增 `preset.kvsetXml` 分支，直接呼叫 `wfgLaApplyKvsetText(kvsetXml, {...})`（與 .kvset 檔案匯入同一路徑）。
  - 下拉第一位加 option、i18n `wfg.laPresetE512`。
- **不變**：.kvset 檔案匯入（維持對齊原廠 0,7,1,2…）、匯出、彈窗、icon 皆未動。
- **進版**：`v2.97.419 → v2.97.420`；cache-buster version.js `?v=20260704c → 20260704d`、i18n.js `?v=20260704b → 20260704d`。
- **驗證**：線上選「E512/EM02」→ 讀 DOM 確認通道由上到下＝ch0,ch1,…,ch15、名稱/深度5G/rate200MHz/觸發ch3＝檔案值。

## TCON 波形產生器 (wfg) v2.97.419 — 2026-07-04

### 修正 kvset 匯入通道顯示順序 bug：chnShowIndex 解讀反了（ch1 跑到第8位）

- **症狀（Bruce 回報）**：匯入 EM02_E512.kvset 後通道順序與原廠 KingstVIS 不一致，ch1 位置跑錯。
- **三方交叉比對（實測，眼見為憑）**：
  - 檔案 `chnShowIndex = 0,2,3,4,5,6,7,1,8,…`；`chnShowName{i}` 照通道編號編（name0=ch0、name7=ch7）。
  - 原廠 KingstVIS 開 EM02_E512.kvset **實際畫面** = `0,7,1,2,3,4,5,6,8,…`（ch7 第2位、ch1 第3位）— 已自驅開檔截圖坐實。
  - 網頁 v418 匯入 = `0,2,3,4,5,6,7,1,8,…`（ch1 第8位）— DOM 讀回坐實。
- **根因**：`chnShowIndex` 語意是「**chnShowIndex[通道編號] = 該通道的顯示位置**」（通道→位置）。舊實作把值陣列**直接當成「位置→通道」的顯示順序**（解讀方向反了），導致排錯。名字 `chnShowName{i}→通道 i` 照通道編號對是正確的，不用動。
- **修正**：對 chnShowIndex 做**反排列**得到顯示順序 `displayOrder[pos] = 使 idxArr[ch]==pos 的 ch`。EM02 → `0,7,1,2,3,4,5,6,8,…`（＝原廠）；空 chnShowIndex（本工具匯出的 kvdat/kvset）→ 不套、維持 0–15。並補上先前缺漏的 `wfgLaRenderChannelGrid()`（順序變更後同步重繪通道列表）。
- **重構**：抽出 `wfgLaApplyKvsetText(text)` 共用核心（解析＋套設定＋chnShowIndex 反排列），`.kvset` 檔案匯入改呼叫它，消除重複邏輯（未來 E512/EM02 preset 也複用）。
- **不變**：匯出（kvdat/kvset 產生器）、彈窗、icon、深度/rate 對齊規則皆未動。
- **進版**：`v2.97.418 → v2.97.419`；cache-buster version.js `?v=20260704b → 20260704c`。
- **驗證**：離線 node 驗反排列（EM02→0,7,1,2…；identity→0–15）；線上匯入 EM02 讀 DOM 順序＝原廠 `0,7,1,2,3,4,5,6,8,…`。

## TCON 波形產生器 (wfg) v2.97.418 — 2026-07-04

### 匯出改「彈窗選格式」，還原匯出 icon 按鈕外觀（Bruce 回饋）

- **問題**：v417 把匯出按鈕改成工具列下拉框（`<select> ⤓ 匯出`），破壞了「檔案」群組原本兩個對稱 icon 按鈕（匯入下箭頭＋匯出上箭頭）的外觀 → Bruce 回報 icon 跑版/變形。
- **修正 1（還原 icon）**：移除下拉框，匯出鈕還原為 v416 的 `wfg-la-icon-only` 上箭頭 SVG 按鈕（與匯入鈕對稱、markup 與 v416 相同），僅 `onclick` 改為 `wfgLaShowExportMenu()`、tooltip 改為「匯出 .kvdat / .kvset」。
- **修正 2（彈窗選格式）**：新增置中 modal（`#wfg-la-export-modal`，深藍暗色卡片）。按匯出跳出，兩個選項按鈕「設定檔 (.kvset)：僅設定不含波形」「完整資料 (.kvdat)：設定＋波形」，加取消鈕；點遮罩或按 Esc 關閉。選定後呼叫既有 `wfgLaExportFile(fmt)`。
- **新增**：`wfgLaShowExportMenu / wfgLaHideExportMenu / wfgLaExportChoose`；i18n `laExportChoose/laExportKvsetBtn/laExportKvsetDesc/laExportKvdatBtn/laExportKvdatDesc/laCancel`；CSS `.wfg-la-modal-*`。
- **不變**：匯出邏輯（kvset/kvdat 產生器、深度/rate 對齊規則）完全沿用 v417，未動。
- **進版**：version.js `v2.97.417 → v2.97.418`；cache-buster `?v=20260704a → 20260704b`。
- **驗證**：線上截圖比對匯出 icon 與 v416 一致；實點匯出鈕→彈窗出現→選 .kvset/.kvdat 皆正確匯出。

## TCON 波形產生器 (wfg) v2.97.417 — 2026-07-04

### LA 分析器新增 .kvset（純設定）雙向支援；沿用 v416 深度/rate 對齊規則；kvdat 不退化

- **需求**：除 `.kvdat`（設定+波形）外，支援原廠 KingstVIS 的 `.kvset`（純設定、無波形二進位）匯入/匯出。對齊基準＝原廠 `EM02_E512.kvset`（3246 bytes 純 XML）。
- **匯入**：檔案選擇器 `accept=".kvdat,.kvset"`，新分派 `wfgLaImportKvFile` 依副檔名路由：
  - `.kvset` → `wfgLaImportKvsetFile`：讀純文字 → 既有 `wfgLaParseSettingsXml` → `wfgLaApplyParsedSettings`（套用 model / 深度 / rate / 觸發 / 門檻 / 致能 / 通道名 chnShowName / analyzer），額外套用 `chnShowIndex` 顯示順序。無法對應欄位忽略不報錯。
  - `.kvdat` → 沿用原 `wfgLaImportKvdat`（行為完全不變）。
- **匯出**：工具列匯出鈕改「格式下拉」（`.kvdat` 完整資料 / `.kvset` 僅設定），`wfgLaExportFile` 分派。`wfgLaExportKvset` 從當前 UI 設定產出 settings XML（不含波形，尚無擷取資料也可匯出）。
- **對齊規則單一來源（重點）**：抽出共用 `wfgLaBuildSettingsXml` + `wfgLaBuildAnalyzerLines`，kvdat header 與 kvset 共用同一份 XML 產生器；深度 `smpDepth/smpDepthIndex` 用 `kvdatDepthFields`、rate 用 `smpFrequ/kvdatSampleRateIndex`，完全沿用 v416 已對齊的板載規則（1G=1,000,000/idx11、2G/12、5G=5,000,000/idx13、10G 固定 5,539,071/idx8），未另立第二套。
- **kvdat 不退化（鐵律 1，離線坐實）**：refactor 後 kvdat 的 XML header 與 v416 舊版**逐位元相同** — node 離線比對三情境（EM02-like 5G / 預設名稱+10G 串流 / 含 I2C+DP analyzer）皆 IDENTICAL；`##D` edge 二進位區塊、header totalSamples/freq/trigger 全部不動。
- **進版**：version.js `wfg: v2.97.416 → v2.97.417`；cache-buster version.js `?v=20260703c → 20260704a`、i18n.js `?v=20260521b → 20260704a`。
- **驗證**：node 語法檢查 + kvdat header 位元一致；線上 Chrome 匯入 `EM02_E512.kvset` 讀 DOM（深度 5G / rate 200MHz / 觸發 ch3 / 門檻 1.25V / 通道名）；網頁匯出 `.kvset` 以原廠 KingstVIS 實開比對；kvdat 匯出回歸。

## TCON 波形產生器 (wfg) v2.97.416 — 2026-07-03

### kvdat 深度欄位改「板載固定常數」規則，幹掉 v415 猜測的 idx=14（兩顆原廠 10G 坐實）

- **關鍵新事證（Bruce 加錄第 2 顆原廠 10G）**：`ORI_10GSa`(totalSamples=6.19G) 與 `ORI_10GSa_02`(totalSamples=5.898G) 兩顆 XML 設定區**位元完全相同**，皆 `smpDepth=5,539,071`、`smpDepthIndex=8`，與各自實際 totalSamples 無關 → 坐實原廠對「超板載串流深度(10G)」寫**固定常數**（5,539,071 kSa＝LA2016 板載 128MiB 有效深度、idx=8），非環境相依、非猜測。
- **修正 v415 的錯誤**：v415 把 10G 的 `smpDepthIndex` 由 11/12/13 外推成 **14**，無任何原廠依據（違反「沒查到不准猜」）。本版一律改為原廠實測 **8**，`smpDepth` 改為原廠固定 **5,539,071**。
- **新規則（`kvdatDepthFields`，全部有原廠依據）**：`smpDepth(kSa)=min(選定深度/1000, 5,539,071)`；`smpDepthIndex`＝深度下拉 option 位置（1G=11/2G=12/5G=13，三錨點實測吻合），但超板載(>5.539G，下拉僅 10G)固定寫 8。
- **雙向一致坐實（五顆原廠檔 code 模擬）**：匯入(ceil totalSamples 設深度下拉)→匯出，`smpDepth/smpDepthIndex` 與原廠**全部位元一致**（含兩顆 10G→5539071/8）；rate `smpFrequ=200000/idx=0` 一致。加上 edge round-trip 位元零損失 → 「原廠→網頁→原廠」整檔位元一致。
- **匯入深度顯示**：仍為 `ceil(totalSamples)` 到下拉 bucket（KingstVIS 一致；ORI_10GSa idx=8 卻顯示 10G 已實開坐實：KingstVIS 顯示只看 totalSamples、不看 idx）。
- **未竟（需硬體一次讀數，未存檔）**：網頁自錄各深度的實際 totalSamples 是否超過 nominal（超錄）→ 影響「網頁自錄→原廠開」的顯示 depth bucket。已從 code 確認送硬體上限 `limitSamples=cfg.sampleDepth`（各深度 mapping 正確、無錯位）；實際超錄量屬硬體回吐行為，待接著硬體觸發一次讀 `decodedSamples` 坐實後再修（零資料損失前提）。
- **進版**：version.js `wfg: v2.97.415 → v2.97.416`；cache-buster `?v=20260703b → 20260703c`。

## TCON 波形產生器 (wfg) v2.97.415 — 2026-07-03

### kvdat 匯出/匯入取樣深度對齊原廠 KingstVIS（逆向四顆 ORI 原生檔坐實）

- **逆向依據（四顆 ORI 原廠原生檔逐位元 dump，非推測）**：
  - `smpDepth`(XML) 單位=kSa，寫「選定深度 nominal」非實際 totalSamples（5G 檔 totalSamples 已截斷成 4,999,999,846，XML 仍寫 nominal `smpDepth=5000000`）。
  - `smpDepthIndex` = LA 深度下拉 `#wfg-la-depth` 的 option 位置（Chrome 實讀確認：位置 11=1G、12=2G、13=5G、14=10G，與原廠 1G/2G/5G 檔的 index 11/12/13 完全吻合）。
  - KingstVIS 深度顯示 = 實際 `totalSamples` 無條件進位到最小容納 bucket，**與 smpDepthIndex 無關**（原廠 10G 串流檔 index=8 卻仍顯示 10G 為鐵證）。
- **修正的兩個缺陷（可指證）**：
  - 匯入（`wfgLaApplyParsedKvdatCapture`）：舊碼用 `smpDepth×1000` 對深度下拉精確比對，10G 原廠檔 `smpDepth×1000=5,539,071,000` 下拉無此值→比對失敗→深度停在預設。改為 `wfgLaDepthBucketForSamples(totalSamples)`（ceil-to-bucket，比照 KingstVIS）。
  - 匯出（`wfgLaExportKvdat`）：舊 `kvdatSampleDepthIndex` 用錯誤 9 元素 preset 表，index 幾乎全錯；且 `smpDepth` 用實際 totalSamples/1000 非 nominal。改為以「選定深度 nominal」(`cfg.sampleDepth`) 寫 `smpDepth`，`smpDepthIndex` 取自下拉 option 位置陣列 `WFG_KVDAT_DEPTH_OPTS`。
- **零資料損失（Bruce 鐵律，程式坐實）**：四顆 ORI round-trip（含 10G 的 6.19e9 大數）重建的 `##D` edge 區塊位元與原廠**完全相同**（numeric round-trip 精確、末筆=total、無失精）；本版只改 XML 深度兩欄與匯入深度顯示，`##D` 區塊建構、edge 編碼、header totalSamples/freq/trigger 全部不動。
- **串流大深度(10G) XML 位元一致**：不追求（Dispatch 判斷採 A）。原廠 `smpDepth=5539071/idx8` 為擷取當下 PC RAM 相依、對顯示無影響；本版 10G 匯出寫 nominal `10000000/idx14`，KingstVIS 開啟仍顯示 10G。
- **進版**：version.js `wfg: v2.97.414 → v2.97.415`；wfg.html version.js 查詢字串 `?v=20260703 → ?v=20260703b`（破快取讀新版號 badge）。
- **驗證**：離線 round-trip 位元零損失（四顆）；Chrome 線上實測匯入四顆 ORI 讀 DOM 深度=1G/2G/5G/10G；KingstVIS 實開網頁匯出各深度檔截圖深度與原生一致。

## TCON 波形產生器 (wfg) v2.97.414 — 2026-07-03

### 修正 kvdat 匯出 header「通道數」寫死 16 的回歸 → 恢復 KingstVIS 相容

- **情境（Bruce 回報）**：LA 匯出的 `.kvdat` 檔在 KingstVIS 打不開。經 git 考古＋Node 實測確認為回歸，資料本身無缺損（非截斷）。
- **根因（可指證 diff，commit `9d37497` 2026-05-08「Improve LA kvdat compatibility」）**：該 commit 把 40-byte header offset 32 的「區塊/通道數」欄位由 `kvdatWriteU64LE(header, 32, selected.length)` 改成寫死 `kvdatWriteU64LE(header, 32, 16)`。但實際資料區塊仍只寫「啟用/勾選的 N 個通道」（`selected.forEach` 每通道一個 `##D` 區塊）。當選取通道數 N < 16 時，header 宣稱 16、實際只有 N 個區塊 → KingstVIS 依 header 讀第 N+1 個區塊時走過 EOF → 開檔失敗。
- **修法（純還原回歸、波形區塊零改動，可指證 diff，wfg.html line 23089）**：`kvdatWriteU64LE(header, 32, 16)` → `kvdatWriteU64LE(header, 32, blocks.length)`。`blocks` 由 `selected.forEach` 每通道推一個區塊，故 `blocks.length` 即實際寫出的區塊數（等同回歸前的 `selected.length`，且直接對應實際寫出的位元組）。除此一行外，XML settings、`##D` 區塊建構、edge 編碼、totalSamples/sampleRate/triggerSample header 欄位全部不動。
- **資料無損**：僅修 header 一個計數欄位，不影響任何波形/edge 資料。
- **進版**：version.js `wfg: v2.97.413 → v2.97.414`（僅 wfg 欄，非共用邏輯）。
- **驗證**：線上 cache-buster 驗版號 v2.97.414 + header 改動特徵字串 `header, 32, blocks.length`。

## TCON 波形產生器 (wfg) v2.97.413 — 2026-07-03

### LA 通道燈號「全 high」改低調淺藍底

- **改動（Bruce 需求）**：LA 分析器左側通道名燈號三態中，僅將「全 high」（`.wfg-la-label-live.static-high`，wfg.html line 355）底色從沿用 base 灰底 `#858585` 改為低調冷色淺藍 `#3f5a7a`，「1」字色由 `#38bdf8` 改高對比近白 `#e8f2ff`＋柔和冷光暈，兼顧「低調不搶眼但清楚可讀」，與全 low 灰底、綠色活動明確區分。
- **不動**：全 low（灰底「0」`#858585`/`#050505`，line 353）、有活動（綠 `#34d84a`＋光暈，line 354）完全不變；不動其他分頁。
- **進版**：version.js `wfg: v2.97.412 → v2.97.413`（僅 wfg 欄，非共用邏輯）。
- **驗證**：線上 cache-buster 驗版號 v2.97.413 + CSS 特徵字串 `background: #3f5a7a` / `color: #e8f2ff`。

## TCON 波形產生器 (wfg) v2.97.412 — 2026-07-03

### LA 連續觸發機率性「最右緣躺平／掉尾端資料」修正

- **情境（Bruce 回報）**：LA 分析器連續觸發（循環取樣）時，偶發某一幀波形在最右緣「躺平」——最後一段變成一條時間累加卻無 edge 的平線拉到繪圖區最右。深度愈小占比愈大（實測 100MSa≈2.7%、20MSa≈13.4%，對應固定 ~13.5ms 掉尾）。
- **根因（可指證 diff，wfg.html `wfgLaSafeCaptureProbe`）**：連續觸發每輪 HALT 後，於「單次讀 capture info（0x20/0x10 取 nRepPackets/nBeforeTrig/writePos）」與「依 writePos 下載 EP6 尾端」之間，缺「等 DMA flush／輪詢 writePos 穩定」握手 → 尾端讀到未提交／上一輪殘留的固定量 bytes → decode 成「時間累加無 edge」平段 → 渲染 `lineTo` 到最右緣躺平。
- **主修法（治本，可指證 diff）**：
  - 新增 `wfgLaWaitCaptureInfoStable(dev, lines, opts)`（置於 `wfgLaCtrlOut` 後 LA helper 區）：連續讀 0x20/0x10，直到 `(writePos && nRepPackets)` 連續 M=3 次不變視為穩定；pollMs=2、上限 N=15（最壞 ~30-45ms），穩定後 settleMs≈4 才回傳供下載。writePos 早穩（單次/正常擷取）→ 前 3 次即退出、近零延遲，全模式啟用不拖慢單次。
  - `wfgLaSafeCaptureProbe` 讀 capture info 那步改呼叫此 helper；逾時（N 次仍不穩）標 `lines.captureInfoUnstable=true`。**連續模式**不穩→跳過本幀顯示、保留上一張好幀不被殘留尾端覆寫（比照既有 keepLastComplete 語意，下載前 early-return）；**單次模式**照下載但標警，絕不把可疑幀當正常。
- **第二道防線（防禦，不取代主修法，可指證 diff）**：
  - 新增 `wfgLaTrimUncommittedTail(decoded, cfg, sampleCfg)`（置於 `wfgLaTrimDecodedCapture` 後）：偵測「最後真實 edge 之後、sample 恆定但 rep>0 持續累加」的尾段，把顯示終點收到「最後真實 edge + 小 margin（128 samples 或 5% duration 取大者）」，丟掉無效尾巴。
  - 於解碼後、套用前呼叫，三重防誤殺守衛：`acquisitionMode==='repeat'` 且非 partialDownload/非 manualStop 且 `captureInfoUnstable` 三者同時成立才裁，避免誤殺「訊號尾端本來就靜止」的合法平段。
  - 註：因主修法已在 repeat+unstable 於下載前 early-return，此第二道防線在現行路徑屬防禦性保險（下載路徑一律執行此呼叫、守衛不成立時 no-op），未來若放寬 early-return 即自動生效。
- **相容性**：不動 v2.97.408 staleResidual 守衛、不碰單次觸發行為、partialDownload 維持排除裁切。僅動 wfg.html LA 邏輯 + version.js `wfg` 欄位（單一來源版號 badge，非共用邏輯）。
- **進版**：version.js `wfg: v2.97.411 → v2.97.412`。
- **驗證**：JS 語法檢查通過；線上 cache-buster 驗版號 + 兩特徵字串 `wfgLaWaitCaptureInfoStable`/`wfgLaTrimUncommittedTail`。**實機連續觸發驗證躺平消失由 Bruce 另做。**

## TCON 波形產生器 (wfg) v2.97.411 — 2026-07-02

### LA 分析器：左側通道名欄寬可用滑鼠拖曳調整（僅 desktop）

- **需求（Bruce）**：LA 子頁 desktop 版，左側「通道名區域」（通道名稱、觸發 trigger 選擇等）通道名太長時被 `...` 省略號截斷看不到全名。要能用滑鼠拖曳分隔條調整欄寬：**min = 現寬（180px，不可更窄）、max = 現寬×2（360px）**。只改 desktop，mobile 不可受影響。
- **現況查證（先讀再做）**：
  - `.wfg-la-labels`（wfg.html CSS L315）左欄固定 `width:180px`，`position:absolute` 疊在示波器 canvas 左緣。
  - 繪圖左偏移在 `wfg-la-labels` renderScope 內以區域變數 `var labelW = 180`（L5840）決定 `drawX0/drawW`；時間軸 `wfgLaDrawTimeAxis` 讀 `wfgLaGeom.labelW`、labels div 寬由 L5947 `labels.style.width = labelW` 設定——三者靠 `labelW` 連動。（Tcon 分頁另用 `WFG_LABEL_W=110`，與此無關，未動。）
  - 通道名截斷：`.wfg-la-label-name`（L327）`overflow:hidden; text-overflow:ellipsis`，容器變寬即自動回流顯示全名。
  - Desktop/mobile 分野：`@media (min-width:901px)` 為 desktop（L204）；`@media (max-width:900px)` 時 `.wfg-la-brand{display:none}`（L490）。mobile 無 labels 寬度覆寫，仍走 180。
- **實作（可指證 diff）**：
  - JS 全域新增 `WFG_LA_LABEL_W_MIN=180`、`WFG_LA_LABEL_W_MAX=360`、`wfgLaLabelWUser`（從 localStorage `wfgLaLabelW` 載入、預設 180）、`wfgLaIsDesktop()`（matchMedia min-width:901px）、`wfgLaGetLabelW()`（**mobile 恆回 180**、desktop 回 clamp 後的使用者寬度）。
  - `var labelW = 180` → `var labelW = wfgLaGetLabelW()`（L5840）。renderScope 內同步更新分隔條 `#wfg-la-label-resizer` 的 `left = labelW`。
  - CSS `.wfg-la-label-resizer` **預設 `display:none`，僅 `@media(min-width:901px)` 才 `display:block`**（col-resize、hover/dragging 藍色高亮）——結構上保證 mobile 完全不出現、不啟用。
  - HTML 於 `#wfg-la-labels` 後、canvas 前插入分隔條 div（放 canvas-area 內、labels **兄弟**節點，故 labels.innerHTML 每輪重建時不會被洗掉）。
  - `wfgLaBindLabelResizer()`（idempotent，於 `wfgLaBindScopeEvents` 呼叫）：pointerdown 記 startX/startW → pointermove clamp 到 180..360 改 `wfgLaLabelWUser` 並 `wfgLaRequestScopeRender()`（rAF、skipLabels，靠 CSS 自動回流讓長名不再被 `...` 截）→ pointerup 寫回 localStorage。雙擊還原 180。pointerdown 內再判 `wfgLaIsDesktop()`，mobile 不啟用。
- **為何不破壞其他 / 不誤傷 mobile**：labelW 改為函式取值，mobile 分支恆回 180＝與改前完全一致的繪圖幾何；分隔條 CSS 預設隱藏且拖曳 handler 二次守 desktop；分隔條為 labels 兄弟節點，不影響既有通道名 contenteditable、trigger 點擊、拖曳換序（那些仍綁在 `.wfg-la-drag-handle`）。
- **進版**：version.js `wfg: v2.97.410 → v2.97.411`；wfg.html version.js 查詢字串 `?v=20260701 → ?v=20260702`（破快取讀新版號）。
- **驗證**：見部署後 Chrome MCP desktop 操作式驗證（拖曳變寬看全名、min=180/max=360 邊界、mobile 視窗版面不跑、分隔條隱藏），截圖佐證。

## TCON 波形產生器 (wfg) v2.97.410 — 2026-07-01

### LA 解碼結果卡 DPCD 位址點擊無法跳到 AUX 分頁 DPCD 查詢器修正

- **情境（Bruce 回報，原文驗證條件）**：wfg 子頁「LA分析器」，使用 LA + 快捷選擇 AUX 相關範例（如「eDP AUX解碼(異常範例)」）後，解碼結果卡的 Address/Data 欄位若出現 DPCD 位址，**以前點它會開新分頁連到 AUX 分頁對應的 DPCD 暫存器說明；現在點了卻不是這個行為（連回 wfg.html 自己）＝壞了**。
- **根因（可指證 diff，wfg.html `wfgLaDpcdLookupUrl` ~L9274）**：此函式沿用自 legacy 單檔 SPA（legacy-index.html L22606，實作一字不差）。舊版全站在同一個 index.html 內，DPCD 查詢器是 SPA 的 `#aux` 分頁，所以用 `new URL(location.href)` 取當前檔名 + `url.hash='#aux'` 切頁是對的。**網站後來拆成多個獨立 HTML（wfg.html / aux.html / calc.html…），DPCD 查詢器移到 aux.html，但此函式沒同步更新**——它仍以 `location.href`（在 wfg 子頁即 `wfg.html`）當 pathname，產出的 href 是 `wfg.html?auxTab=dpcd&dpcd=XXXX&val=XX#aux`。而 wfg.html 沒有 DPCD 查詢器（`auxApplyUrlParams`/`aux-dpcd-result`/`auxLookupDPCD` 命中數 0，全部只在 aux.html），且 index.html 的 legacy hash 相容表映射的是 `#page-aux` 不是 `#aux`，因此點擊只是把 wfg.html 帶垃圾參數重載，永遠到不了 DPCD 說明。
  - **實機證據（部署站 v2.97.409）**：載入「eDP AUX解碼(異常範例)」快捷預設，解碼結果卡渲染出 122 個 `.wfg-la-dpcd-link`/`.wfg-la-dpcd-byte-link`，逐一檢查其 `href`——**全部 targetAux=false / targetWfg=true**（指向 `/tcon-tools/wfg.html`），且含 `auxTab=dpcd`＋legacy `#aux`。證實壞在連結目標檔名。
- **修法（最小變更，只動 `wfgLaDpcdLookupUrl` 一個函式）**：把 `new URL(location.href)` 改為 `new URL('aux.html', location.href)`（相對當前目錄解析出同層的 aux.html），移除已無意義的 `url.hash='#aux'`（aux.html 用 search 參數 `auxTab` 切 tab、不看 hash），回傳 `url.pathname + url.search`。`auxTab=dpcd`／`dpcd=位址`／`val=值` 參數格式與 aux.html 的 `auxApplyUrlParams`（L2392）讀取邏輯完全對齊。
- **為何不破壞其他 / 不誤傷非 DPCD**：(1) 只有帶 `row.dpcdAddr`／`row.dpcdItems` 的 value 欄位才會產生 DPCD 連結（`wfgLaRenderDecodeCellHtml` L9781/9786 的判斷未動），一般 Address/Data 文字不受影響。(2) 位址格式化 `wfgLaDpAuxFormatAddress`、tooltip、warn 樣式、`onclick` 開新分頁行為皆未改。(3) `new URL('aux.html', …)` 產生乾淨 URL，反而修掉舊寫法會把 wfg.html 現有查詢字串（如快取破除 `?v=`）一起繼承污染的隱患。
- **目的地驗證**：導航到 `aux.html?auxTab=dpcd&dpcd=202&val=07` 確認 aux.html 正確切到 DPCD tab、定位 0x00202h（LANE0_1_STATUS）並逐 bit 解碼 0x07——證明修正後要指向的 URL 目的地本就可用。
- **進版**：version.js `wfg: v2.97.409 → v2.97.410`（子頁獨立進版）；wfg.html version.js 查詢字串 `?v=20260617 → ?v=20260701`（破瀏覽器快取讀新版號）。
- **驗證**：見部署後 Chrome MCP 線上操作式驗證（載入 eDP AUX 範例 → 檢查 DPCD 連結 href 已指向 aux.html → 實際點擊確認開新分頁定位到對應 DPCD；非 DPCD 欄位不受影響）。

## mLVDS Skew 計算工具 (calc) v1.5.3 — 2026-06-29

### UI cof_cnt 分界值設定：TCON 下拉（EM01/EM02）展開時選項反白看不清修正

- **情境（Bruce 回報，原文驗證條件）**：calc 子頁「UI cof_cnt 分界值設定」卡片，TCON 下拉選單在 EM01 與 EM02 切換時，**沒被選到的那個選項會反白，文字完全看不清楚**。
- **根因（可指證 diff，calc.html CSS）**：`.em-select`（~L111）在控制項本身設了 `color: white; background: rgba(255,255,255,0.1)`，但**沒有 `.em-select option` 規則**。原生 `<select>` 展開的下拉清單由作業系統繪製、預設淺色（白）背景，而 `<option>` 繼承 select 的 `color: white` → 未被高亮的選項變成「白字 + 系統淺底」幾乎不可見；被選中的那項因系統 highlight 藍底反而可讀，造成「切到 EM01 時 EM02 反白、切到 EM02 時 EM01 反白」的現象。對照同檔 `.if-select` 早已有 `.if-select option { background:#1e293b; color:#e2e8f0; }`（~L153）就沒這問題，`.em-select` 漏了這條。
- **修法（最小變更）**：在 `.em-select:focus` 後新增 `.em-select option { background: #1e293b; color: #e2e8f0; }`，與既有 `.if-select option` 同一深底淺字模式。下拉展開時每個 option 皆深底淺字、足夠對比；EM01／EM02 選中與未選中皆清楚可讀。
- **不破壞其他**：只新增一條 option 樣式，不動 `.em-select` 控制項外觀、不動 cof_cnt 計算邏輯（v1.5.2 的 EM02=floor(EM01/2) 不受影響）、不動其他卡片配色。
- **進版**：version.js `calc: v1.5.2 → v1.5.3`；calc.html version.js 查詢字串 `?v=20260627 → ?v=20260629`（破瀏覽器快取讀新版號）。
- **驗證**：見部署後 Chrome MCP 線上操作式驗證（選 EM01／選 EM02／展開下拉各截圖，確認未選中選項可讀；並回確認 EM02=floor(EM01/2) 計算未受影響）。

## mLVDS Skew 計算工具 (calc) v1.5.2 — 2026-06-27

### UI cof_cnt 分界值設定：新增 EM02 = floor(EM01 / 2)

- **需求（Bruce 回報）**：calc 子頁「UI cof_cnt 分界值設定」卡片，原分界值公式是給 EM01 用的。當 TCON 選 EM02 時，分界值 = EM01 公式算出的結果 ÷ 2，且無條件捨去取整（floor）。EM01 及其他既有行為維持不變。例：EM01 算出 25 → EM02 顯示 floor(25/2)=12；EM01 算出 24 → EM02=12。
- **修法（可指證 diff，calc.html `renderCofTable` ~L863）**：EM01 分界值由 `calculate()`（L956–960 `cofs.push(Math.floor(H/2/N/gate*i - 1))`）算出並存入 `lastCofs`。`renderCofTable` 是唯一渲染路徑（calculate() 與 em-select 切換 L1011 都呼叫它）。原本 `const value = (i<N-1 && cofs[i]!==undefined) ? cofs[i] : 2047;`。改為：當 `selectedEM==='EM02'` 時 `value = Math.floor(cofs[i]/2)`，否則沿用 `cofs[i]`（EM01）。
- **為何不破壞 / 不重複套用**：`lastCofs` 永遠只存 EM01 base 結果，EM02 的除二只在 render 當下從 base 推導出新值，不回寫 `lastCofs`。因此 EM02→EM01 切回時顯示原始 EM01 值、不會被連續除二；切換多次也穩定。
- **2047 sentinel 不受影響**：末行 `End` 用的 2047 是「無分界」標記（非 EM01 公式結果），EM02 時不除二，維持 2047。
- **進版**：version.js `calc: v1.5.1 → v1.5.2`；calc.html version.js 查詢字串 `?v=20260523 → ?v=20260627`（破瀏覽器快取讀新版號）。
- **驗證**：見部署後 Chrome MCP 操作式驗證（奇數/偶數 X 各一例，確認 EM02=floor(X/2) 無條件捨去；EM01 與其他選項未受影響）。

## TCON 波形產生器 v2.97.409 — 2026-06-17

### LA tab 連續觸發（Auto restart）時無法修改通道名稱修正

- **情境（Bruce 回報）**：LA tab 按「連續觸發 / Auto restart sampling」讓它持續刷新時，**無法更改通道名稱**（示波圖左側波形旁的通道名標籤 contenteditable，預設「通道 0/1…」）。點輸入框打字後，每輪擷取刷新就把正在編輯的內容/焦點洗掉。單次觸發或停止狀態下改名正常。
- **根因（可指證，wfg.html ~L5945–5965 `wfgLaRenderScope`）**：連續觸發每輪 `wfgLaStartCapture` do-while → `wfgLaRunOneCaptureWithRecovery` → `wfgLaApplyCapturedWaveform`（L8673）→ `wfgLaRenderScope()`。RenderScope 在 L5953 以 `labels.innerHTML = …` **整段重建** `#wfg-la-labels` DOM（其中含通道名 contenteditable span `.wfg-la-label-name`[`data-la-label-ch`]，L5962）。重建條件原本只有 `ioEditActive` 例外保護（L5949），而 `ioEditActive` **只判斷 activeElement 是 SELECT 或 INPUT**（IO 門檻選單），**不包含 contenteditable span**。因此連續觸發每輪都會把正在編輯的通道名 contenteditable 重建銷毀 → 焦點丟失、未提交文字被洗掉。單次/停止無重複 renderScope 迴圈，故不受影響。
  - 左側通道格（`#wfg-la-channel-grid` 的 `.wfg-la-ch-title`）連續觸發時**只切 has-signal class**（`wfgLaUpdateChannelSignalIndicators` L4258，不重建 DOM），故左側格改名本來就正常；本次受影響的是示波圖內的通道名標籤。
- **修法（最小變更，wfg.html L5949 後新增）**：新增 `labelNameEditActive` 判斷——`labels.contains(document.activeElement) && activeElement.getAttribute('data-la-label-ch') != null`，並把 L5953 重建條件加上 `&& !labelNameEditActive`。即「正在編輯通道名 contenteditable 時不重建 labels DOM」，與既有 `ioEditActive` 對 SELECT/INPUT 的保護同一機制。波形畫布（canvas）仍照常每輪更新，只跳過 labels DOM 重建這一步；使用者 blur/Enter（`focusout` L4994、`keydown` L5003）後照常 `wfgLaRenderChannelGrid()` + `wfgLaRenderScope()` 還原並正規化名稱。
- **為何不影響其他功能**：(1) 因 contenteditable 節點完全沒被替換，焦點與游標(caret)位置原地保留，符合「焦點/游標不亂跳」。(2) 守衛只在「正在編輯通道名」時生效，未編輯時 labels 仍每輪正常重建（has-signal / live level 照常更新）。(3) 不動左側通道格、不動拖移/游標/PWM/v2.97.408 深度切換殘留重抓邏輯。(4) 左側格改名路徑(`grid` input/focusout)與本守衛無交集（activeElement 在 grid 不在 labels，`labelNameEditActive=false`），無回歸。
- **驗證**：見實機驗證章節（Chrome Cowork3 + LA2016）。

## TCON 波形產生器 v2.97.408 — 2026-06-16

### LA tab 切換取樣深度後第一次 RUN 回吐殘留舊資料修正

- **情境**：先用「100MSa + 200MHz + 重複觸發」（總長約 500ms）看波形確認 → 改「5GSa + 200MHz + 單次觸發」（應約 25s）→ **第一次擷取只記錄到 500ms（上一輪殘留），第二次才正確顯示 25s**。
- **根因（小換大，可指證）**：`wfgLaSafeCaptureProbe`（wfg.html）擷取後時長防呆有缺口。解碼時長 `decoded.durationSec = totalSamples / effectiveRate`（`wfgLaDecodeCaptureWaveform` ~L8526）。切換深度後第一次 RUN 從 SDRAM 回吐的是上一輪的殘留 RLE，`totalSamples` 仍是舊深度（100M），除以同一 200MHz → 0.5s。原本三個校正分支只處理：manualStop、`partialDownload && decoded.durationSec < expectedDuration`、`decoded.durationSec > expectedDuration + 0.5sample`（裁切）。**缺口**：`decoded.durationSec < expectedDuration 但 partialDownload=false`（殘留短資料量小、未超過 192MB EP6 cap、不被標 partial）→ 兩個校正分支都不進 → 直接沿用殘留的 500ms。`partialDownload` 僅在 `packetBytes > readCapBytes`（>192MB）時為 true（~L12769–12776）。
- **大換小對稱問題（同一根因、症狀更隱蔽）**：反向（5GSa→100MSa）第一次 RUN 若回吐上一輪的「長」殘留（約 25s），`decoded.durationSec > expectedDuration` → 進入裁切分支（~L12831 `wfgLaTrimDecodedCapture`）→ 時長被裁成新的小視窗（看起來正確），但**波形內容是舊長擷取的前緣切片＝錯誤內容**。即「第一次時長看似對、內容卻是殘留舊資料，第二次才對」的隱形錯誤，比小換大更危險（使用者不易察覺）。（殘留是否在反向也必然發生屬硬體行為，需實機確認；但軟體邏輯確實會把殘留長資料當「同視窗太長」靜默裁切。）
- **修法（偵測殘留並自動重抓一次，非無條件改寫時長）**：
  - 新增模組變數 `wfgLaLastAcceptedTotalSamples`，記錄「上一個被接受顯示的擷取」的 `totalSamples` 指紋（僅在非殘留、成功顯示時更新）。
  - 解碼後、進入既有校正分支前判斷殘留：`!manualStop && !partialDownload && 上次指紋存在 && decoded.totalSamples 完全等於上次指紋 && |decoded.durationSec − expectedDuration| > expectedDuration×10%`。殘留資料就是上一輪的資料，`totalSamples` 必然與上次完全相同，是強而可靠、與壓縮率無關的判據。
  - 命中時：送 RUNMODE_HALT、設 `lines.staleResidualSuspected`、**不顯示**該筆資料；呼叫端（`wfgLaProbeWebUsb` ~L13075）偵測旗標後**自動重抓一次**（傳 `{isRetry:true}`，等同 Bruce 手動再按一次、實機已知第二次正確）。重抓最多一次，第二次即使仍命中也只記 log、照常顯示，永不無限迴圈、不比現況差。
- **為何不選「只要短於 expectedDuration 就一律拉成 expectedDuration」**：那會 (1) 掩蓋合法短擷取（高深度受 128MiB SDRAM 截斷而真的較短、真正提早結束），(2) 只改時長不改內容 → 仍顯示殘留錯誤波形。本修法用「指紋完全等於上一次」分辨殘留 vs 合法短/長/截斷擷取（合法擷取的 totalSamples 不會等於另一組設定的舊指紋），且重抓取得真正新資料 → 時長與內容皆正確。
- **為何不選「進 probe 內以 writePos 基準重排」**：需新增硬體控制序列且無法在無裝置下驗證，回歸風險高；caller 重跑整個已驗證的擷取序列，重用實機已知正確的第二次行為，副作用最小。
- **驗證**：模擬 `decoded` 輸入跑過判斷各案例（小換大殘留短、大換小殘留長、合法短截斷、合法同設定重抓、partial 短、manualStop、首次擷取無前次指紋）證明僅殘留命中、其餘不誤判、不回歸。瀏覽器（Chrome MCP）確認版號 v2.97.408、無 JS 錯誤、LA tab 可載入。
- **🔴 待 Bruce 實機驗證**：換深度後第一次 RUN 的真實時長/內容（原始條件：100MSa/200MHz 重複 → 5GSa/200MHz 單次；以及反向 5GSa→100MSa）。本機無 LA2016 USB 裝置，硬體端「自動重抓後是否第一次就正確」需實機確認，未自稱已驗。

## TCON 波形產生器 v2.97.407 — 2026-06-04

### LA tab 快捷切換後高深度單次觸發遺失通道修正

- **情境**：先選 I2C 快捷設定（2ch）→ 切回「快捷設定」（16ch）→ 高深度（≥2GSa）單次觸發 → 只錄到 2 個通道（I2C 殘留的 CH0/CH1），其他有訊號的通道被丟掉。
- **根因 1（主因）**：`wfgLaHardwareCaptureChannels`（wfg.html ~L4576，commit a72417e 加入、無 changelog）的退化分支——當「>8 通道且 sampleDepth >1GSa」時，改用過時的全域變數 `wfgLaLastEdgeCounts` 來挑選硬體擷取通道。
- **根因 2**：切回「快捷設定」分支（~L22262）只勾回 16 個 checkbox，未清掉 `wfgLaLastEdgeCounts`，殘留前一個 I2C preset 的 CH0/CH1 edge counts。
- **結果**：高深度時退化分支拿 I2C 殘留（CH0/CH1）去砍通道，把使用者實際有訊號的通道（CH3/4/6/8…）全丟光。
- **修法 1**：移除 `wfgLaHardwareCaptureChannels` 退化分支，永遠回傳使用者當前實際勾選的通道（`cfg.enabledChannels`）。16ch 即送全 16 通道、2ch 即送 2 通道，不再以 `wfgLaLastEdgeCounts` 砍通道。
- **修法 2**：切回「快捷設定」與切換 preset 時重設 `wfgLaLastEdgeCounts = []`，避免任何殘留影響 has-signal 標示與通道判斷。
- **保留**：高深度時間受硬體壓縮率/128MiB 記憶體限制而被壓縮屬正常行為，仍由 `wfgLaHasCompressionDurationRisk` 據實提示「實際長度依硬體壓縮率」，不以砍通道換取時間。

## TCON 波形產生器 v2.97.406 — 2026-06-01

### LA / Tcon tab 匯入檔案後顯示檔名

- **新增匯入檔名顯示**：LA tab 匯入 `.kvdat`、Tcon tab（TCON Timing 調整練習）匯入 `.txt/.json` 設定檔後，於頂部 header 顯示該檔名。
- **桌面版位置**：標題（TCON 波形產生器）與右側三個 tab 之間的中間空白區，置中顯示（藍底圓角膠囊 + 📄 圖示）。實作：在 header flex 列插入 `#wfg-import-filename`，`flex:1` 填滿中間空白並置中文字，長檔名 ellipsis 截斷不擠壓 tab。
- **手機版位置（≤480px）**：header 改為多列 wrap，中間空白不存在，故將檔名改放在標題下方獨立一列置中（`order:0; flex:0 0 100%`），不遮擋 tab/語言列與任何操作。
- **行為**：未匯入不顯示；per-mode 各自記憶（`_wfgImportedNames.tcon` / `.la`），切 tab 時 `wfgUpdateImportedFileNameDisplay()` 顯示該 tab 對應檔名；重新匯入即更新；匯入失敗（解析錯誤）不顯示。
- 檔名來源：Tcon `wfgImportFile`（`input.files[0].name`，`wfgImportConfig` 回傳 true 才設）、LA `wfgLaImportKvdat`（`file.name`，套用成功後才設）。

## TCON 波形產生器 v2.97.405 — 2026-06-01

### LA tab 兩個滑鼠互動 bug 修正

- **Bug1 垂直虛線時間游標越界**：滑鼠移到左側通道名稱欄（波形繪圖區之外）時，垂直虛線游標會跟著越界畫到名稱區。根因：crosshair 繪製條件只判斷 `wfgLaHover.channel >= 0`，未檢查 `wfgLaHover.x` 是否落在繪圖區 `[drawX0, drawX0+drawW]`（主 overlay 與 sticky 時間軸 overlay 兩處皆是）。修正：新增 `wfgLaHoverInPlot()`，兩處 crosshair 改用此判斷；滑鼠 x 在繪圖區外時不畫虛線。對齊 TCON tab 既有作法。
- **Bug2 即時測量水平雙向箭頭不跟滑鼠**：滑鼠在波形區左右移動時，白色雙向箭頭定住不動，需滾輪縮放才更新。根因：`wfgLaMeasArrow` 僅在 `wfgLaUpdateMeasure`（由全量 `wfgLaRenderScope` 呼叫）重算，mousemove 觸發的 `wfgLaRenderOverlay` 只繪製不重算。修正：將讀數＋箭頭計算抽成 `wfgLaUpdateMeasureReadout()`，於 overlay 重繪（含 mousemove）開頭呼叫，箭頭即時跟著滑鼠；箭頭同樣加 in-plot 判斷，越界時隱藏。
- **Tcon tab 經查無此二 bug**（各自獨立實作）：mousemove 設 `_wfgTconHover` 時已判斷 `_cx>=drawX0 && _cx<=w`（越界設 null，crosshair 才不越界）；且每次 mousemove 都 rAF 呼叫 `wfgMeasUpdate` 重算 `_wfgMeasArrow`（箭頭本就跟滑鼠）。故僅修 LA tab，未動 Tcon tab。

## App v1.87.1 — 2026-05-23

### 版本號單一來源（根治主頁/子頁版號不同步問題）

- 新增 `common/version.js`：所有工具版本號統一定義在 `TOOL_VERSIONS` 物件，改版只需改這一個檔案
- 所有頁面（index/rxtx/calc/isp/aux/wfg）的版本 badge 改用 `data-tool-version` 屬性，由 JS 動態注入
- `common/common.js` 新增自動注入邏輯：頁面載入時讀取 `TOOL_VERSIONS` 填入所有 badge
- 修正首頁 AUX 版號（v2.1.1 → v2.2.1），與 aux.html 實際版本同步

## AUX/DPCD 工具 v2.2.1 — 2026-05-23

### DPCD 版本差異 tab 多語言支援

- 「版本差異」tab 加入 en / zh-CN 翻譯（tab 標題、卡片標題、描述文字、表頭）
- 表格內含中文的 DATA 項目（整體、值 XXh、基礎、擴展、座標等）加入英文翻譯，zh-CN 自動繁簡轉換
- 語言切換時自動重新渲染版本差異表格
- i18n.js 新增 3 個鍵值（aux.tabVerdiff / aux.verdiffTitle / aux.verdiffDesc）
- _tAux helper 新增 6 個表頭/欄位翻譯鍵值

## AUX/DPCD 工具 v2.1.1 — 2026-05-22

### DPCD 資料庫 3 項修正

- 00200h SINK_COUNT：bit 7 從 RESERVED 改為 SINK_COUNT[6]（MSB），正確反映 DP v1.4a 定義的不連續 7-bit 欄位（bit[7] + bit[5:0]）
- 00703h EDP_GENERAL_CAPABILITY_2：英文描述層（EDP_DESC）整個誤植為 00702h 的內容，修正 `e` 描述和 bit 0 `de`，移除多餘的 bit 1~5 英文描述
- 00704h EDP_GENERAL_CAPABILITY_3：英文 `de` 中 X_REGION_CAP 和 Y_REGION_CAP 的 horizontal/vertical 方向寫反，已互換修正

## AUX/DPCD 工具 v2.1.0 — 2026-05-22

### DPCD Skill 資料庫 12 項修正（兩次獨立審查確認）

**CRITICAL（4 項）：**
- 0000Ch I2C_SPEED_CAP：修正缺少的 5Kbps bit + 全部 bit 位置偏移
- 00070h PSR_SUPPORT：從錯誤的 bit flag 結構改為正確的 8-bit 列舉值
- 00071h PSR_CAPABILITIES：修正 PSR_SETUP_TIME 從 split 2+1 bit 改為連續 3-bit，移動 Y_COORDINATE_REQUIRED 和 SU_GRANULARITY_REQUIRED
- 00090h FEC_CAPABILITY：bit 1-7 全部重新定義，新增 5 個錯誤計數能力 bit

**MAJOR（6 項）：**
- 00003h MAX_DOWNSPREAD bit 6：名稱從 NO_AUX_HANDSHAKE 改為 NO_AUX_TRANSACTION
- 00008h RECEIVE_PORT0_CAP_0：新增 bit 3-5（HBLANK_EXPANSION、BUFFER_SIZE_UNIT、BUFFER_SIZE_PER_PORT）
- 0006Dh：從 RESERVED 改為 DSC_SLICE_CAPABILITIES_2（16/20/24 slices）
- 0006Fh：從 RESERVED 改為 BITS_PER_PIXEL_INCREMENT
- 00080h DOWNSTREAM_PORT_0_CAP_0：區分 DETAILED_CAP_INFO 兩種模式 + 新增 DP++ 類型
- 00600h SET_POWER：bit 2:0 改為 3-bit 欄位 + 新增 12V/18V 供電控制

**MINOR（2 項）：**
- 00211h/213h/215h/217h SYMBOL_ERROR_COUNT bit 7：從「溢位」改為「VALID 有效旗標」
- 00218h TEST_REQUEST：移除不存在的 bit 4 FAUX_TEST_PATTERN 和 bit 7 TEST_AUDIO_PATTERN

## AUX/DPCD 工具 v2.0.0 — 2026-05-22

### DPCD 資料庫全面校正 + 版本選單

- **DPCD 資料庫全面校正**：全部 289 筆暫存器逐一比對 DP v1.4a、eDP v1.4b、eDP v1.5 規格書 PDF 原文，修正 20+ 個 bit 位置/名稱/說明錯誤
  - 00107h DOWNSPREAD_CTRL：4 個 bit 位置全部修正（SPREAD_AMP 移到 bit 4，MSA_TIMING_PAR_IGNORE_EN 移到 bit 7）
  - 00064h DSC_SLICE_CAPABILITIES：8 個 bit 中 6 個修正
  - 0006Ah DSC_DECODER_COLOR_DEPTH：移除不存在的 16bpc，修正全部位移
  - 00069h DSC_DECODER_COLOR_FORMAT：新增遺漏的 bit 4 DSC_NATIVE_420_SUPPORT
  - 00061h DSC_REV：Major/Minor 位置對調修正
  - 00101h LANE_COUNT_SET：POST_LT_ADJ_REQ_GRANTED 從 bit 6 移到 bit 5
  - 0010Ah eDP_CONFIGURATION_SET：PANEL_SELF_TEST_ENABLE 從 bit 3 移到 bit 7
  - 00023h-0002Dh：從 RESERVED 修正為 AV_SYNC_DATA_BLOCK 完整定義
  - 00067h-00068h：從 RESERVED 修正為 DSC_MAX_BITS_PER_PIXEL
- **eDP v1.5 更新**：
  - 00107h bit 6 新增 ADAPTIVE_SYNC_SDP_EN
  - 00116h bit 2 修正為 ALPM_MODE_SELECTED、bit 3 新增 PERIOD_OF_CDS_PHASE
  - 000B0h bit 2 新增 EARLY_TRANSPORT_SUPPORT
  - 000B1h 從 RESERVED 擴展為 PANEL_REPLAY_CAPABILITY_2
- **版本選單 UI**：DPCD 查詢分頁新增「規格版本篩選」下拉選單，支援 eDP v1.2/v1.3/v1.4b/v1.5、DP v1.2/v1.3/v1.4a/v2.0，選擇版本後查詢結果自動標示版本相容性徽章，不相容的 bit 會降低透明度提示

## v2.97.384 — 2026-05-22

### LA tab 滑鼠拖移即時跟手 + cursor 修正

- **LA 拖移即時跟手（核心修正）**：LA tab 的 mousemove panning 原先只更新 `wfgLaViewStart/End` 但未重繪 canvas，導致波形不跟手。新增 `wfgLaRequestScopeRender()` 呼叫，拖移時即時重繪波形（跟 TCON 一致）
- **cursor 正確行為（TCON + LA 一致）**：預設 `crosshair`（十字指標），mousedown 切 `grabbing`（手抓住），mouseup/mouseleave 恢復 `crosshair`
- **桌面版 LA 不捲動頁面**：修正 `_wfgFindScrollableParent()` 於 `overflow: hidden` 時回傳 `null`，避免桌面版拖移時整個頁面跟著滾動

## v2.97.382 — 2026-05-22

### 修復 TCON 手機版垂直捲動失效

- **問題**：v2.97.381 新增的垂直拖移慣性覆蓋了手機版 TCON tab 的原生垂直捲動（`touchmove` 一開頭就 `e.preventDefault()` + `touch-action: none` 雙重阻擋）
- **修復**：仿照 LA tab 的方向鎖定機制 — touchmove 先判斷滑動方向，垂直時 `return` 讓瀏覽器處理原生捲動，水平時才 `preventDefault` + 手動平移
- **CSS**：`#wfg-canvas` 的 `touch-action` 從 `none` 改為 `pan-y pinch-zoom`，與 LA canvas 一致
- **觸控慣性**：只在方向鎖定為水平 (`'h'`) 時才觸發水平慣性動畫
- **桌面版不受影響**：滑鼠拖移的水平+垂直慣性功能完整保留

## v2.97.381 — 2026-05-22

### 波形區垂直拖移慣性

- **TCON tab**：波形區（`.wfg-canvas-wrap`）新增垂直拖移 + 慣性功能。當波形數量多、canvas 高度超過可視區域時，可用滑鼠/觸控上下拖移捲動，放開後帶有慣性動畫
- **LA tab**：滑鼠拖移模式下新增垂直捲動支援（觸控維持原有方向鎖定機制：水平→時間軸平移，垂直→原生頁面捲動）
- **共用**：新增 `_wfgFindScrollableParent()` 輔助函式，自動找到最近的可垂直捲動容器
- **物理參數**：垂直慣性使用與水平相同的摩擦係數（TCON: 0.95, LA: 0.96），當水平與垂直慣性皆低於閾值時才完全停止

## v2.97.379 — 2026-05-22

### LA tab 左面板恢復 + 工具列/右側卡片對齊

- **問題 1**：LA tab 左側「IO 電平標準」設定面板消失（`.wfg-la-layout > .wfg-panel` 被 `display: none !important` 永久隱藏）
- **修復 1**：在 `@media (min-width: 901px)` 中用 `display: flex !important` 覆蓋，恢復左側面板（含取樣設定、Trigger 設定、IO 電平標準）
- **問題 2**：LA 工具列橫跨全寬（含右側卡片上方），導致右側卡片被擠到工具列下方
- **修復 2**：`.wfg-la-main` 改為 CSS Grid，`.wfg-la-workbench` 用 `display: contents` 扁平化。工具列只佔 scope 欄（column 1），右側卡片佔 column 2 並從 row 1 開始（`grid-row: 1 / -1`），與工具列頂部對齊
- **佈局**：`.wfg-la-layout` 增加左面板欄位（`clamp(260px, 20vw, 292px) + 1fr`），高度填滿 viewport

## v2.97.378 — 2026-05-22

### 修復右側面板頂部對齊（比左側低 60px）

- **問題**：右側面板（即時測量、時基標尺、脈衝計數）頂部比左側面板（Frame 參數）低 60px
- **根因**：`.wfg-right-panel` 保留了 v2.97.377 恢復的 `position: sticky; top: 60px`，在 viewport-filling 佈局（`overflow: hidden`）下 sticky `top` 值造成 60px 向下偏移
- **修復**：移除 `position: sticky; top: 60px; align-self: flex-start`，改為 `overflow-y: auto`（與左側面板一致），讓 flex stretch 自然對齊頂部

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
