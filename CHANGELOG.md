# CHANGELOG

---

## 📌 版本號規則變更公告 — 2026-08-02 起生效

各分頁過去的進版標準不一致：有的把新增功能也算成 patch（patch 號變成改動次數計數器），有的把同一個功能的漸進完成拆成多個 minor。即日起全分頁改用同一套規則，完整定義見 **`docs/VERSIONING.md`**。

**一句話判準**：舊的東西變了 → MAJOR；多了新東西但舊的沒變 → MINOR；只是把壞的修好或內部改善 → PATCH。

判準建立在「**使用者腦袋裡已經知道的事會不會失效**」（怎麼操作、會得到什麼結果），而不是語意化版本的 API 相容性 —— 這裡沒有 API，照抄那套的結果會是 MAJOR 永遠用不到。

**歷史版號一律不回溯調整**（改了會讓 CHANGELOG 與 git commit 裡的版號永久矛盾，也讓既有的追溯紀錄全部對不上）。改以「下次進版跨一個明顯界線」標記新舊規則分界：

| 分頁 | 舊版號 | 套用新規則後 |
|---|---|---|
| `pattern` | v1.9.0 | **v2.0.0**（本次，恰逢介面重整） |
| `wfg` | v2.97.475 | v3.0.0（下次進版時，順便讓爆掉的 patch 號歸零） |
| 其餘分頁 | — | 下次進版時各自跨一格，並於該條目註明「此版起套用新規則」 |

其他配套：commit message 前綴統一為 `<工具>: `；輸出結果會改變的修正，條目開頭一律標 `⚠ 輸出變更`。

---

## TCON 波形模擬與取樣 (wfg) v3.25.2 — 2026-08-20 ｜ PATCH ｜ ⚠ 輸出變更

**修「即時測量」卡片按「＋」釘出來的小卡片，五個數值全錯。**（Bruce 2026-08-20 回報，用 timing02 的 XSTB）

### 根因：兩條路徑對「邊緣」的定義不一致

小卡片走 `wfgMeasSelGetEdges()` → `wfgMeasSelCompute()`，而後者判斷「第幾個邊緣是 rising」用的是 `wfgLaEdgeTypeForIndex()`（wfg.html:8255）：

```js
var before = ((initialLevel ? 1 : 0) + (edgeIndex & 1)) & 1;
return before ? 'falling' : 'rising';
```

**純奇偶** —— 它假設「邊緣陣列嚴格交替」。LA 分頁的邊緣來自解碼後的取樣流，邊緣依定義就是準位改變，前提成立；**但 wfg 的 transitions 陣列不成立**：裡面混著與前一筆同準位的項目（frame 0 的 INI_VAL 切斷點 wfg.html:17685、F_ST_SEL 的切斷點、toggle 每個 frame 開頭補的那一筆 17640）。`wfgMeasSelGetEdges()` 把它們**原封不動全部當成邊緣**推進陣列，奇偶就整個錯位一格。

實測 timing02 / XSTB，transitions 前幾筆：

```
[[0,0,0], [1,54,1], [1,264,0], [2,54,1], [2,264,0], …]      effHtotal=1876
  ↑ line 0 的 level 0，是 INI_VAL 切斷點，不是邊緣
```

錯位後 `r=0`，於是 `pos = edges[1]-edges[0]`、`period = edges[2]-edges[0]`、`neg = edges[2]-edges[1]`，**每一個錯誤數字都能被這個式子精確重現**：

| 項目 | 修正前（錯） | 式子 | 修正後 | 滑鼠懸停（對照組） |
|---|---|---|---|---|
| 頻率 | 194.39 kHz | `1/(edges[2]-edges[0])` | **221.75 kHz** | 221.748 kHz |
| 正脈寬 | 4.64us | `edges[1]-edges[0]` | **504.8ns** | 504.81 ns（懸停在 HIGH 脈衝內） |
| 負脈寬 | 504.8ns | `edges[2]-edges[1]` | **4.00us** | 4.005 μs（懸停在 LOW 區） |
| 週期 | 5.14us | `edges[2]-edges[0]` | **4.51us** | 4.510 μs |
| 佔空比 | 90.2% | `4.639/5.144` | **11.2%** | 11.2% |

滑鼠懸停那條路徑（`wfgMeasUpdatePhase`，wfg.html:28404–28431）是**逐筆比對 level** 找區塊邊界，不吃奇偶，所以一直是對的 —— 這正是 Bruce 說「懸停對、釘住的錯」的原因。

### 修法

`wfgMeasSelGetEdges()` 只收「**準位真的改變**」的轉態（與前一筆同準位就跳過），`initialLevel` 取第一個真正邊緣之前的準位。這讓 wfg 送進去的陣列滿足 LA 那邊本來就成立的不變式 ——「邊緣＝準位改變」。

🔴 **修在 wfg 這一端，不動 `wfgLaEdgeTypeForIndex()`**：那支是 LA 與 wfg 共用的，LA 的資料本來就滿足前提；要修的是「wfg 送進去的東西不算是邊緣」。

順手把同一支函式裡自己抄一份的 `timePerLine` 換成唯一來源 `wfgTimePerLine()`（式子逐字相同，見該函式 v3.21.0 的說明）。

### LA 分頁：檢查過，沒有同樣的問題

LA 的 `wfgLaMeasComputeChannel()`（wfg.html:9450）用的是 `wfgLaGetWaveform()` 的 `edges`，來源是 `wfgLaCapturedWaveform.edgesByChannel[ch]`（解碼後的取樣流）或 `wfgLaBuildDemoEdges()`，**兩者的邊緣依定義都是準位改變**，奇偶前提成立。實測 demo capture 的 CH0：

```
initialLevel=0, edges=[0.0125, 0.0125667, 0.0291667, 0.0292333, …]
```

嚴格交替；`＋` 小卡片得到 60.00 Hz / 正 66.67us / 負 16.60ms / 週期 16.67ms / 0.4%，與邊緣值手算逐項相符（`edges[1]-edges[0]=66.67µs`、`edges[2]-edges[0]=16.667ms`、`1/16.667ms=60Hz`），也與 LA 懸停量測的頻率 60.00 Hz、週期 16.67ms、脈寬 16.60ms 一致。**LA 端未做任何改動。**

⚠ **順帶查到、但本版刻意不動的一件事**：LA 的**懸停**卡片與 wfg 的**懸停**卡片對「空佔比」的定義不一樣。
LA（wfg.html:9189）是 `pulse / period`，`pulse` ＝**滑鼠所在那一段**的寬度，所以停在 LOW 區會顯示 99.6%；
wfg（wfg.html:28283）是 `highTimeSec / periodSec`，不管停在哪一段都顯示 HIGH 的佔比（11.2%）。
兩個「＋」小卡片則都是標準的「正脈寬 / 週期」。這不是本次回報的問題（Bruce 問的是「＋」的數值對不對，LA 的「＋」是對的），也不知道哪一個才是他要的定義，**所以只記錄、不自行統一**。

### 實測（headless Chrome，載入 Bruce 那份 timing02 原檔）

三條通道各自把「＋」小卡片與滑鼠懸停逐項比對（懸停卡的「脈寬」欄顯示的是**滑鼠所在那個區塊**的寬度，所以 HIGH 區對正脈寬、LOW 區對負脈寬）：

| 通道 | ＋ 小卡片 | 滑鼠懸停 | 判定 |
|---|---|---|---|
| XSTB | 221.75 kHz／正 504.8ns／負 4.00us／週期 4.51us／11.2% | 221.748 kHz／HIGH 區 pw 504.81 ns／LOW 區 pw 4.005 μs／per 4.510 μs／11.2% | ✅ |
| CPV1 | 221.75 kHz／正 408.7ns／負 4.10us／週期 4.51us／9.1% | 221.748 kHz／pw 4.101 μs／per 4.510 μs／9.1% | ✅ |
| STV0（＝vs OAX tend） | 301.49 Hz／正 18.04us／負 3.30ms／週期 3.32ms／0.5% | 301.49 Hz／pw 3.2988 ms／per 3.3168 ms／0.5% | ✅ |

**判定依據：** `docs/VERSIONING.md` §1 判定表逐欄 ——「操作流程」零改變；「功能增減」不增不減；「既有功能的輸出」落在 **PATCH 那一格「修正為原本就該有的行為」**（使用者原話「都是錯的」，是修 bug 不是改設計）。逐項判：**R1 適用 → PATCH**，且同一操作序列（載入同一份設定 → 按「＋」）的五個數字全變，拿舊版抄下來的數字不再成立，依〈`⚠ 輸出變更` 範圍定義〉的「數值類：計算結果」與「同一操作序列得到不同結果（即使舊結果本身是 bug 造成的）」，**掛 `⚠ 輸出變更`**；R2 不適用；R3 不適用（使用者能做的事沒有多一件）；R4 不適用。取最高者 → **PATCH**。§2 案例 7「既有計算公式修正 → PATCH ＋ ⚠ 輸出變更」正是本例。

---

## TCON 波形模擬與取樣 (wfg) v3.25.1 — 2026-08-20 ｜ PATCH ｜ ⚠ 輸出變更

三件都來自 Bruce 2026-08-20 用實機 timing 檔（`wfg-config-20260820(B19_34_WQHD_144Hz_HSR200_Timing02).txt`）回報的問題。

### ① combo（OAX）訊號的 PH_CNT 遮罩改取所有成分訊號的聯集

`STV0` 這條通道是 `vs` **OR** `tend`（`oax_mode: 1, oax_sel: 13`）。R_PH_CNT / F_PH_CNT 兩列的遮罩過去只吃通道自己那顆 GPIO（`vs`，ST/SP_LINE 都是 0），於是 `tend` 的作用區間（ST/SP_LINE 735）整段被灰掉 —— 畫面上明明有 `tend` 打出來的脈衝。

新增 `wfgPhGateCombined()`（放在 `wfgApplyOAX` 旁邊），把成分訊號的**逐行閘門紀錄**（v3.24.2 由 `wfgCalcGpio()` 記下來的 `phGate`）逐 bit 聯集，繪製端仍然只是投影上游結果，**沒有另寫一套聯集判斷**。成立條件與 `wfgApplyOAX()` 逐字相同（`oax_mode !== 0`、索引合法、不是自己）。

**只聯集閘門 bit0 / bit1，不聯集觸發 bit2 / bit3**（`out[i] = a[i] | (b[i] & 3)`）：那兩列顯示的數字自始至終是本通道那顆 GPIO 的計數值，把另一顆的觸發條也框成觸發格，會出現「格子被框起來、裡面的數字卻不是 ACT_TYPE」的矛盾畫面。Bruce 的要求是「TEND 那邊也要將顯示範圍露出來」，範圍＝bit0/bit1。**若覆核後認為觸發格也該一起標，這是一行的事，請提出來改，不要當成既成決定。**

⚠ 已知限制：成分訊號本身若是 toggle，它沒有 `phGate`（v3.24.2 起 toggle 一律供應 null），聯集時只剩本體那一份。不替它猜代用值。

### ② Toggle 訊號（XPOL / LC）的 R_DLY 綠色箭頭

Bruce：「因為它是 Toggle 訊號，只看 R_DLY 且觸發計算 R_DLY，是要轉態的那一條 line 才計算 R_DLY，所以綠色的箭頭應該也要顯示出來才對。而且顯示的位置就是轉態那時候的位置，而不用顯示 F_DLY。」

箭頭的**算法**（起算條＝轉態往回退 R_DLY、只畫 R_DLY、不畫 F_DLY）從 v2.97.481 起就是對的，壞的是「根本畫不出來」，兩個獨立原因：

1. **錨點取錯**：原本用 `leftEdge`（目前準位區塊的起點）。但 `wfgCalcGpio()` 的 toggle 分支**每個 frame 開頭都會補一筆** `{line: lineOffset, dly: 0, level: 目前準位}`（wfg.html:17640），這些補的筆數與真正的轉態混在同一個陣列裡。實測 LC（FRM_NO=99，每 100 個 frame 才翻一次）：真正的轉態在絕對 line 77741.365，`leftEdge` 卻解析到 77000 —— 箭頭兩端一起被推到畫面左外（實測 `x1=110(夾住), x2=-85543`），`x2-x1 < 4` → 什麼都沒畫。改成新增的 `tconNearestLevelChange()`：找「離滑鼠最近的一次**真正的準位改變**」。兩邊都找，因為 R_DLY 會把轉態推到行中間，使用者把滑鼠移到那條 line 時很容易落在轉態左側。
2. **兩條提早 return**：`transitions.length < 2` 與 `rightEdge === null` 是為了「量脈衝寬度」設計的（要有左右兩個邊沿），但 toggle 的轉態太稀疏，查詢範圍只有 ±vtotal（本例 ±770 行），常常兩條都踩到。R_DLY 只需要一個轉態，不需要右邊界 —— 兩條路徑改為仍然畫箭頭（`tconToggleRDlyArrow` / `tconMeasArrowWith`）。

### ③ R_DLY 或 F_DLY 設為 0 時，改畫單一圓點但文字照常顯示

`drawUniArrow()` 原本第一行就是 `if (x2 - x1 < 4) return false;`，而呼叫端「回傳 false 就連文字也不畫」。DLY=0 時起點與終點是同一個位置，於是箭頭與文字**兩個都不見**，使用者完全看不出這一條有觸發（XPOL 的 R_DLY 就是 0）。

改為：`dlyVal === 0` → 畫一個 r=2.5 的圓點並回傳 true，文字照常顯示且改對齊 x1（否則會壓在圓點上）。**只認「DLY 真的是 0」，不拿 `x2-x1 < 4` 當判準** —— DLY 不是 0 只是縮太小的情況維持原本「不畫」，否則縮到很遠時整排標籤會糊成一片。DLY 值由 `_dlyVal` 從量測端帶到繪製端。

### 改了什麼

| 位置 | 改動 |
|---|---|
| 新增 `wfgPhGateCombined()` | OAX 成分訊號的閘門聯集 |
| `wfgDrawInternalRows()` 取 phGate 處 | 改呼叫上面那支 |
| 新增 `tconNearestLevelChange()` / `tconToggleRDlyArrow()` / `tconMeasArrowWith()` | 三處共用的 toggle R_DLY 箭頭 |
| `wfgMeasUpdatePhase()` toggle 分支 | 錨點由 `leftEdge` 改為最近一次真正的準位改變 |
| `wfgMeasUpdatePhase()` 兩條提早 return | toggle 仍然畫 R_DLY 箭頭 |
| `wfgMeasUpdatePhase()` 一般分支 | 箭頭物件帶上 `_dlyVal` |
| `wfgMeasDrawArrow()` `drawUniArrow()` | DLY=0 → 單一圓點 + 文字；四段重複的標籤程式碼收斂成 `drawDlyLabel()` |

### 實測（headless Chrome，載入 Bruce 那份 timing02 原檔）

量測手法：暫時攔截 `CanvasRenderingContext2D.prototype.fillText / arc`，直接記錄「畫布上到底畫了什麼」，不靠眼睛判讀。圓點半徑可區分兩種形態：**r=2.5 ＝ DLY=0 的單一圓點**，r=2 ＝ 一般箭頭的起點圓點。

| 案例 | 畫出來的 | 判定 |
|---|---|---|
| STV0 遮罩（TEND 區間 line 735） | 改動前兩列全灰；改動後 R_PH_CNT 露出 line 735、F_PH_CNT 露出 line 735~739（＝tend 的 rising 閘門 [735,735] 與 falling 閘門＋收尾） | ✅ ① |
| `phGate` 資料層 | `vs` 單獨＝`[[0,7],[1,2],[2,2],[3,2],[4,10]]`；聯集後多出 `[735,3],[736,2]…[739,2]` | ✅ ① |
| XPOL（toggle, R_DLY=0） | `R_DLY` 綠字 ＋ **r=2.5 單一圓點**，位置就在轉態上；無 F_DLY | ✅ ②③ |
| LC（toggle, R_DLY=685, FRM_NO=99） | `R_DLY` 綠字 ＋ r=2 起點圓點 ＋ 箭頭（x1=875.8 → x2=918.4），箭尾正好落在轉態；無 F_DLY | ✅ ② |
| STV（一般訊號，R/F_DLY 皆非 0） | R_DLY ＋ F_DLY 各一，皆 r=2 | ✅ 未回歸 |
| STV 改 R_DLY=0 | `R_DLY` ＋ **r=2.5 單一圓點**；F_DLY 仍是正常箭頭 | ✅ ③ |
| STV 改 F_DLY=0 | `F_DLY` ＋ **r=2.5 單一圓點** | ✅ ③ |

**判定依據：** `docs/VERSIONING.md` §1 判定表逐欄 ——「操作流程」零改變（沒有任何控制項增減或移位）；「功能增減」不增不減（三件都是既有顯示該有卻沒有）；「既有功能的輸出」落在 **PATCH 那一格「修正為原本就該有的行為」**，不是 MAJOR 的「主動改變」：使用者本人三處都用「應該是要…」「應該也要顯示出來才對」「還是應該要顯示…」describe，也就是外部事實上這是修 bug。逐項判：**R1 適用 → PATCH**，且同一組設定（timing02 + hover STV0／XPOL／LC）新舊版截圖不同、拿舊版建立的像素基線會失效，依〈`⚠ 輸出變更` 範圍定義〉的「版面／構圖類」與「同一操作序列得到不同結果（即使舊結果本身是 bug 造成的）」兩條，**掛 `⚠ 輸出變更`**（PH_CNT 兩列與量測箭頭都畫在 `#wfg-canvas` 上，`wfgScreenshot()` 的匯出圖含這些內容）；R2 不適用（不開新波）；R3 不適用（使用者能做的事沒有多一件）；R4 不適用（起始狀態與預設值皆未變）。取最高者 → **PATCH**。

---

## TCON 波形模擬與取樣 (wfg) v3.25.0 — 2026-08-20 ｜ MINOR

**Line / R_PH_CNT / F_PH_CNT 三列固定在波形區最上方，上下捲動波形時不再跟著捲走。**（依 Bruce 2026-08-20 指示）

### 沿用既有機制，沒有新造第二套

波形區的垂直捲動是 `.wfg-canvas-wrap` 的**原生捲動**（桌面 `overflow: auto`），波形本體是一整張 `#wfg-canvas`。站上從 v2.97.371 起就有一套「把主 canvas 頂部若干 px 複製到一個 `position: sticky` 的容器」的做法在跑（原本只釘 30px 的時間刻度）。本版**就是把那個「若干 px」加大**，不另外分層、不拆第二張 canvas、不自寫捲動。

| 位置 | 改動 |
|---|---|
| 新增 `wfgTconStickyTopH()` | 釘住區塊的高度：kvdat → 30；TCON 內部運算關掉 → `WFG_AXIS_H` 54（Time + Line）；開啟 → **102**（再加 R_PH_CNT 22 + gap 2 + F_PH_CNT 22 + gap 2） |
| `_wfgTconRenderStickyTimeAxis()` | `axisH` 由常數 `WFG_TIME_H` 改為 `wfgTconStickyTopH()`；同時把值寫進 CSS 變數 `--tcon-sticky-h` |
| CSS `#wfg-tcon-sticky-time-axis` | `margin-bottom` 由寫死的 `-32px` 改為 `calc(-1 * var(--tcon-sticky-h, 30px))` |
| 新增 `#wfg-tcon-sticky-labels` + CSS | 釘住區塊的左側名稱欄（Time / Line / R_PH_CNT / F_PH_CNT） |
| `wfgRenderLabels()` | 多收集一份 `stickyHtml`，寫進上面那個容器 |
| `_wfgTconClearStickyTimeAxis()` | 一併清空名稱欄 |
| 檔尾新增 `ResizeObserver` | 盯 `#wfg-tcon-toolbar-sticky` / `#wfg-la-toolbar-sticky` 的尺寸變化，即時更新 `--tcon-toolbar-h`（理由見下方第 3 點） |

**左側名稱欄為什麼要另外處理**：`#wfg-labels` 是 DOM（`position:absolute; top:0`），會跟著波形區一起捲走；主 canvas 在那 110px 內是空的，所以純畫素複製帶不出「R_PH_CNT」這幾個字。實測舊版捲到底時連 `Time` 這個字也是不見的（只剩刻度）。本版把 `wfgRenderLabels()` **產生 `#wfg-labels` 的同一段字串**多寫一份到 sticky 容器 —— 刻意不另寫一份 HTML，理由見 v3.24.2 那條（第二份實作必然漂移）。該容器是 `pointer-events:none`，不會搶走原本的拖曳／點擊。

**水平方向為什麼不會脫鉤**：釘住的那張 canvas 是 `drawImage(mainCanvas, …)` 的 1:1 畫素複製，沒有第二套座標換算，所以左右捲動、改倍率時必然逐格對齊。已實測（見下）。

**三個順帶修掉的問題（前兩個是小的，第三個原本會讓這個功能直接失效）**

1. `margin-bottom` 從 `-32px` 改成 `-(高度)`：舊值配 30px 高度等於讓釘住的區塊比主 canvas 低 2px。只釘刻度時看不出來，釘住的區塊一旦自帶文字就會變成 2px 重影。改完之後 `sticky.top === canvas.top`（實測 166 / 166）。
2. 名稱欄背景用**不透明** `#0d1117`，不是 `.wfg-labels` 的 `rgba(13,17,23,0.92)`：捲動後這一欄底下是波形，8% 透光會讓波形透出來。
3. 🔴 **`--tcon-toolbar-h` 加 `ResizeObserver`**（`wfg.html` 檔尾，`window.addEventListener('resize', wfgUpdateHeaderHeight)` 之後）。這個變數是「釘住的區塊要黏在哪個位置」的唯一依據，原本只在載入時與 **window resize** 時更新。實測到的失效路徑（1600×900 + 本 preset）：

   ```
   載入   波形區 1058px 寬 → 工具列 1 行 → 變數寫入 61px
   套預設 內容變長 → 垂直捲軸出現 → 波形區剩 1043px
          → 工具列的「游標」group 換到第 2 行 → 實際高度 114px
          → 但 window 沒有 resize，變數仍停在 61px
   ```

   結果：釘住的區塊黏在 61px 處，被 114px 高的工具列蓋掉上緣 **53px** —— `Time` 整列與 `Line` 的上半截看不到。**逐像素證據**：釘住區塊頂端取樣值在捲動後是 `#161b22`（工具列底色），捲到頂時是 `#0d1117`（波形區底色）；差異範圍剛好是 0~53px。這個 bug 在只釘 30px 刻度的舊版一樣存在（刻度會被整條蓋掉），只是不容易被當成 bug。改用 ResizeObserver 盯工具列自己的尺寸後，四種桌面寬度實測重疊量皆為 0。

### 實測（headless Chrome，preset = FHD 60Hz Single Gate(LS：Dual CPV)）

| 驗收項 | 方法 | 結果 |
|---|---|---|
| ① 捲到底三列仍在頂端且內容正確 | scrollTop 0 → 660(底)，量 `getBoundingClientRect` + 截圖 | sticky 固定在 top=113、高 102，`#wfg-canvas` 的 top 由 166 一路跑到 −494；Time / Line / R_PH_CNT / F_PH_CNT 四列與名稱都在 ✅ |
| ② 捲動中不閃爍、不錯位 | scrollTop 0 / 60 / 180 / 360 / 底，各截「釘住區塊」本身（scale 4）比對 md5 | 五張**逐位元組相同**（`79a7b85cd390`）✅ |
| ③ 左右捲動與改倍率仍逐格對齊 | 把主 canvas 頂部同高區塊畫到離屏 canvas，與釘住的那張逐位元組比對（原始視野／放大／再放大／平移／全覽／重置） | 六種狀態全部 `same: true` ✅ |
| ④ 視窗寬度與手機版 | 1600 / 1280 / 1024 / 960 各量「工具列底部 − 釘住區塊頂部」；390 量 `scrollWidth vs clientWidth` | 四種寬度重疊量皆 **0px**（工具列換到 2~3 行時 `--tcon-toolbar-h` 跟著變 114/167/220，釘住的區塊也跟著往下）；390 寬 `scrollWidth == clientWidth == 390`（無橫向溢出），sticky 依既有 media query 為 `display:none` ✅ |
| ⑤ 既有功能 | 切換游標 A1 → 釘住區塊要跟著更新且仍與主 canvas 相同；關閉「TCON 內部運算」→ 高度要退成 54 | 皆符合 ✅ |

**手機版說明（誠實交代範圍）**：`#wfg-tcon-sticky-time-axis` 自 v2.97 起就只在 `min-width: 901px` 顯示，而 `< 769px` 的 `.wfg-canvas-wrap` 是 `overflow: clip`（捲動的是整頁，不是波形區）。本版沿用這個既有分界，**沒有替手機版新增釘住行為**，只驗證了不破版。要不要延伸到手機版是另一個題目。

**驗證方法上的一個坑（記下來避免下次再踩）**：`Page.captureScreenshot` 的 `captureBeyondViewport: true` 會把視窗撐成整份文件高度再拍，**內部捲動容器與 `position: sticky` 的位置會因此重排** —— 拍「釘在頂端」這種東西會拍到別的區塊，而且拍出來的圖看起來完全正常。上表的截圖一律關掉這個選項。另外，`STRIPS 五張相同` 這個結論第一次跑出來是 False，逐像素 diff 之後才發現差異範圍剛好是頂端 53px、顏色是工具列底色 —— 那不是量測雜訊，而是上面第 3 點那個真的 bug。**先 diff 再下結論，不要把不一致當成子像素誤差帶過。**

**判定依據：** `docs/VERSIONING.md` §1 判定表逐欄 ——「操作流程」零改變（沒有任何控制項新增／移除／移位，捲動方式也沒變）；「既有功能的輸出」不變：`wfgScreenshot()` 是自己用 `#wfg-canvas` ＋ `#wfg-labels` 合成離屏畫布，**完全不含 sticky 容器**，所以匯出圖／截圖逐項不變，波形數值與匯出設定檔也一位元未變；「功能增減」→ **新增**一個獨立能力。逐項判：R1 不適用（舊行為不是 bug，是當時只釘刻度的設計）；R2 不適用（不開新波）；**R3 適用 → MINOR** —— 「這一版之後使用者能做的事有沒有多一件？」有：捲到波形下半部時仍能對照 Line／R_PH_CNT／F_PH_CNT，過去必須捲回頂端；R4 不適用（起始狀態與所有預設值皆未變，scrollTop=0 的畫面與前一版相同）。取最高者 → **MINOR**。
**不掛 `⚠ 輸出變更`**：依 R1〈範圍定義〉逐類對照 —— 數值類（波形數值、計算結果、匯出檔位元組）零改動；版面／構圖類的判準是「用截圖／匯出圖片功能存下來的成果會不會不一樣」，而截圖不含 sticky 容器，故不成立；剩下的正好命中「不算（不標）」欄第一條「純新增能力，既有操作的結果完全不變」。

---

## TCON 波形模擬與取樣 (wfg) v3.24.2 — 2026-08-20 ｜ PATCH ｜ ⚠ 輸出變更

**R_PH_CNT / F_PH_CNT 兩列的灰色遮罩改為「投影波形產生器的逐行閘門判定」，不再自己推算一份。**

### 問題（Bruce 2026-08-20 回報，已完整重現）

預設 `FHD 60Hz Single Gate(LS：Dual CPV)`、VST1（`ACT_TYPE=15, R_PH=15, F_PH=13, ST_LINE=2, SP_LINE=2`），把 SP_LINE 從 2 改成 5：

| SP_LINE | 舊版 R_PH_CNT 未遮到 | 舊版 F_PH_CNT 未遮到 | VST1 實際脈衝 |
|---|---|---|---|
| 2 | line 2 | line 4 | 1 個：2→4 |
| **5** | **line 18** | **line 20** | **仍然只有 1 個：2→4** |
| 18 | line 18 | line 20 | 2 個：2→4、18→20 |

line 18 / line 20 不只是沒被遮，還被畫成**觸發格**（色底＋粗體），畫面等於在說「這裡有一個邊緣」，而那裡一個邊緣都沒有。更清楚的症狀：**SP_LINE=5 與 SP_LINE=18 兩列長得一模一樣**，但波形一個是單脈衝、一個是雙脈衝。

### 根因

遮罩過去是在繪製端**自己推**的（`wfgDrawPhCntRow()`）：

```js
var firstZero = (effIniPh === 0) ? cycle : (cycle - effIniPh);
while (firstZero <= stToSp) { firstZero += cycle; }
highlightLen = firstZero;      // ＝「延伸到 counter 下一次歸零」
```

化簡後是「開放到第一個落在 SP_LINE 或之後的計數器觸發行」。這個近似是為了處理 falling 的**收尾例外**（SP_LINE=2 時 line 4 的下降緣真的會打，見 `wfgCalcGpio()` 的 `line <= sp || level === 1`）而生的，在原始 preset 的 SP_LINE=2 上剛好完全正確，所以一直沒暴露。

但波形產生器真正的閘門是：

- **rising：`line <= sp`，沒有任何例外。**
- **falling：`line <= sp`，或 `level === 1`（收尾一個還沒關的脈衝）。**
- counter **不會在 SP_LINE 停止**，被擋住的是「打不打」，不是「數不數」。

舊算法把「counter 還會繼續數」誤當成「這裡還會產生邊緣」，並且把只屬於 falling 的收尾例外一併套到了 rising 上 —— 這才是 line 18 / line 20 的來源。

### 修法：遮罩不再有自己的演算法

閘門判定只有 `wfgCalcGpio()` 的逐行掃描迴圈一個地方在做。本版在**判定的當下、位移之前**把結果記下來，繪製端直接投影：

| 位置 | 改動 |
|---|---|
| `wfgCalcGpio()` frame 迴圈外 | 配置 `gateFrames[0..1]`（`Uint8Array(vtotal)`，只記 frame 0 與 frame 1） |
| `wfgCalcGpio()` 逐行迴圈，兩個 `continue` 守衛之後 | `gateRec[line] |= (line <= sp) ? 3 : ((level === 1) ? 2 : 0)` — bit0＝rising 閘門開、bit1＝falling 閘門開 |
| rising 過閘處（`rFired = true` 旁） | `gateRec[line] |= 4` |
| falling 過閘處（`if (line <= sp \|\| level === 1)` 進入處） | `gateRec[line] \|= 8` |
| `wfgCalcGpio()` 回傳前 | `allTransitions.phGate = { g0, g1 }`（掛在回傳陣列上，**不改函式簽章**） |
| `wfgCalcGpioSmart()` 全部 6 條回傳路徑 | 一併帶出 `phGate` |
| `wfgDrawInternalRows()` 呼叫處 | 從 `_wfgTransitionCache.transitions[gpioIdx].phGate` 取，傳給兩列 |
| `wfgDrawPhCntRow()` | **刪掉 `firstZero` / `highlightLen` 那段自行推算**；`inHL` 讀 bit0/bit1、`isTrigger` 讀 bit2/bit3 |

🔴 **記的是原始行號（0 ~ vtotal-1），尚未套 R_DLY / F_DLY 的跨行位移**（`rActualLine = line + rExtraLines`）。PH_CNT 兩列的座標系就是「counter 在第幾行」，用下游位移過的 `_wfgTransitionCache` 行號會偏移 —— 這是本次刻意「往上游取」而不是「取 transitions」的原因。

**Toggle 信號完全不受影響**：toggle 走 `wfgCalcGpio()` 裡另一個迴圈，其遮罩自 v2.97.481 起就是「只到 SP_LINE」且有自己的 `wfgToggleCntSeq` 序列。本版對 toggle 一律供應 `phGate = null`、繪製端也不讀，既有行為一行未動。

### 實測（headless Chrome、走使用者路徑：選 preset → 改 SP_LINE 數字框 → 截圖）

驗收條件用 Bruce 指定的原條件，一字未改：`FHD 60Hz` / `Single-Gate` / `LS：Dual CPV` / VST1。

| SP_LINE | 舊版 R / F 未遮到 | 新版 R / F 未遮到 | 判定 |
|---|---|---|---|
| 2 | line 2 / line 2~4 | line 2 / line 2~4 | **畫面零變化** ✅ |
| 5 | line 2~18 / line 2~20 | line 2~5 / line 2~5 | 修正 ✅ |
| 6 | line 2~18 / line 2~20 | line 2~6 / line 2~6 | 修正 ✅ |
| 10 | line 2~18 / line 2~20 | line 2~10 / line 2~10 | 修正 ✅ |
| 17 | line 2~18 / line 2~20 | line 2~17 / line 2~17 | 修正 ✅ |
| 18 | line 2~18 / line 2~20 | line 2~18 / line 2~20 | **畫面零變化** ✅ |

line 18 / line 20 的假觸發格在 SP_LINE ≤ 17 時一併消失。SP_LINE=18 時第二個 pass 真的出現，兩列一格未動。

**效能**：用站上既有的 `window._wfgPerfEnabled` 儀表量 `wfgCalcGpioSmart()` 全量重建（VTOTAL=4000/4001、FRAME 重複數 4、19 支數位信號、每支掃 3 個 frame），各取 12 次：舊版中位數 **7.1 ms**（4.9~16.2），新版中位數 **6.6 ms**（5.1~55.4，首筆為 JIT 暖機離群值）。差異落在雜訊內 —— 每支信號只多寫 2 × VTOTAL 個 byte，且 `wfgCalcGpio()` 每次快取失效只跑一次（週期性信號固定只掃 3 個 frame，之後靠模板展開）。記憶體：2 × VTOTAL bytes/信號（VTOTAL 4000、25 個 slot ≈ 200 KB）。

### 附帶的行為變更（都在 `⚠ 輸出變更` 的範圍內）

1. **遮罩改為逐 frame**：frame 0 用 `g0`、frame ≥1 用 `g1`。舊版所有 frame 畫同一套。`F_ST_SEL` 未勾選時 frame 0（有 frameReset）與 frame ≥1（延續前一個 frame）的閘門本來就不同，舊版必有一邊是錯的。
   ⚠️ 已知限制：週期為 2 的信號，frame 2/4/… 會沿用 frame 1 的紀錄。舊版是「所有 frame 都用同一個靜態推算」，故本版不會比舊版差，但也還沒做到逐週期精確。
2. **`SP_LINE < ST_LINE`**：舊版會「繞過 frame 尾端」開放一大段；依 `line <= sp`，這種設定其實一個 rising 都不會打，新版全遮。
3. **類比虛擬 slot（SD1 / CKO*）**：它們沒有相位計數器（`phGate = null`）→ 兩列全遮。舊版會因為預設 `ACT_TYPE=0, ST_LINE=0, SP_LINE=0` 而把每個 frame 的 line 0 那一格畫成未遮。只有在「第一條可見通道是類比通道且未 hover」時看得到差別（hover 時舊版本來就已經靠 `_phNoPulse` 全遮）。

**判定依據：** `docs/VERSIONING.md` §1 判定表逐欄 ——「操作流程」零改變（沒有任何控制項新增、移除或移位）；「功能增減」不增不減；「既有功能的輸出」→ 落在 **PATCH 那一格「修正為原本就該有的行為」**，不是 MAJOR 的「主動改變」：這一格的分野是「修 bug」還是「主動改設計」，而**使用者本人在 2026-08-20 明確認定舊行為是錯的**（原話：「這個遮罩的範圍應該是遮錯了」「遮罩顯示的範圍不合理」）—— 這是外部事實，不是撰稿者的解讀。逐項判：**R1 適用 → PATCH**，且因為同一組設定（SP_LINE=5/6/10/17）新舊版截圖不同、拿舊版建立的像素基線會失效，依〈`⚠ 輸出變更` 範圍定義〉的「版面／構圖類」與「同一操作序列得到不同結果（即使舊結果本身是 bug 造成的）」兩條，**掛 `⚠ 輸出變更`**；R2 不適用（不開新波、不進 MAJOR）；R3 不適用（使用者能做的事一件都沒多，兩列本來就在）；R4 不適用（起始狀態與任何預設值皆未變）。取最高者 → **PATCH**。§2 案例 2「改一個 bug → PATCH，若輸出會變加 ⚠ 輸出變更」與案例 4「重構、使用者無感 → PATCH（風險高不等於版號要大）」兩條同時支持。**未落在 MAJOR，因此無需 `MAJOR 核准：`。**

---

## TCON 波形模擬與取樣 (wfg) v3.24.1 — 2026-08-20 ｜ PATCH

**右側卡片「電壓游標」改名為「類比垂直設定」**（依 Bruce 2026-08-20 指示）。卡片位置、展開／收合行為、卡片內每一項控制項（垂直刻度、固定／自動、中心電壓 −／+、範圍、各條游標的 ◉／○ 開關、游標範圍提示）全部不動，只換卡片標題那一行字。

**為什麼要改名**：這張卡片從 v3.9.0 起就不只放游標了 —— V/div 檔位、固定／自動模式、中心電壓 −／+ 半格（v3.20.0）都在裡面，這些是示波器的「垂直」那一組設定，用「電壓游標」當標題已經名不副實。

### 改了什麼

| 位置 | 改動 |
|---|---|
| `common/i18n.js` `wfg.ovlCardTitle` | `電壓游標` → **`類比垂直設定`**／`电压游标` → **`模拟垂直设置`**／`Voltage Cursors` → **`Analog Vertical Settings`** |
| `wfg.html` 卡片標題 `<span data-i18n="wfg.ovlCardTitle">` | fallback 文字同步改為 `類比垂直設定` |
| `wfg.html` 註解 ×5（CSS 區塊、卡片 HTML、`wfgUpdateOverlayCard` 自我校正、卡片建構函式抬頭、版面同步、`applyLang` 補呼叫） | 指涉「這張卡片」的敘述一併改名，避免註解與畫面互相矛盾 |

**英文用語取捨**：需求給的是 `Analog Vertical`，實際採用 **`Analog Vertical Settings`**。依據是 `common/i18n.js` 既有慣例 —— 凡中文是「⋯⋯設定」的標題，英文一律帶 `Settings`：`wfg.laAcqTitle` 取樣設定＝`Acquisition Settings`、`wfg.laTriggerTitle`＝`Trigger Settings`、`wfg.laPwmSettingsTitle`＝`PWM Settings`、`wfg.laSettingsTitle` 設定＝`Settings`。少掉 `Settings` 會是這一組標題裡唯一的例外。

### 哪些「電壓游標」字樣**保留不動**（這是本次最需要判斷的地方）

「電壓游標」在本專案是**兩個不同的東西**，改名只涉及前者：

- **這張卡片的標題** → 改（上表）
- **V1／V2 那兩條可拖曳的水平虛線本身** → **不改**。它們的名字就是「電壓游標」，功能沒有被改名。把 `wfg-guide.html` 裡的「V1 電壓游標」改成「V1 類比垂直設定」會變成不通的句子。

因此下列位置**刻意保留**：

| 檔案 | 位置 | 為什麼保留 |
|---|---|---|
| `wfg-guide.html` | 1555／1578／1597／1614／1732／2483 | 全部在講 V1／V2 那兩條線（判準門檻、開關按鈕、拖曳操作、設定檔欄位說明），與卡片標題無關 |
| `wfg.html` | 2333／19156／22110 註解 | 講的是游標的可移動範圍與 hit-test，同上 |
| `docs/wfg_overlay_slot_audit.md` | S6 列 | 稽核表在盤點 `_wfgVoltCursorPerSlot` 這條線的實作 |
| `CHANGELOG.md` | v3.9.0／v3.10.0／v3.20.0 等歷史條目 | 歷史條目記錄的是當時的事實，不回改 |
| 程式識別字 | `voltCursorPerSlot`、`voltCursorsActive`、`wfg-ovl-card`、`wfgVoltCursorAllowedRange` 等 | 設定檔欄位名一改就與既有 `.txt` 不相容；class／函式名純內部，改了只是搬家 |

### 為什麼是 PATCH、為什麼不掛 `⚠ 輸出變更`

**判定依據：** `docs/VERSIONING.md` §1 判定表「操作流程／PATCH：位置微調、**文案**、配色」字面命中，並與 §2 案例 3「改 UI 版面、不動功能 → 微調（文案）→ PATCH」一致。逐項複判：判定表「既有功能的輸出」不變、「功能增減」不增不減；R1（修 bug）不適用（這不是修 bug）、R2（開新波）不適用、R3（分階段新能力）不適用 —— 使用者能做的事一件沒多、卡片與其中每顆控制項都在原位、R4（起始狀態／預設值）不適用。取最高者仍為 **PATCH**。

不掛 `⚠ 輸出變更`：依 §1「⚠ 輸出變更的範圍定義」逐類對照 —— 數值類（波形數值、計算結果、匯出檔案位元組）零改動；版面／構圖類的判準是「用截圖／匯出圖片功能存下來的成果會不會不一樣」，而 wfg 的截圖／匯出圖只含波形區、不含右側面板（見 v3.23.0 條目），故不成立；同一操作序列的結果亦相同。剩下的是純文案，明列於「不算（不標）」。

### 驗證

- 三語切換後讀回卡片標題 `textContent`：`zh-TW` → `類比垂直設定`、`zh-CN` → `模拟垂直设置`、`en` → `Analog Vertical Settings`。
- `grep -rn 電壓游標`：使用者看得到的介面文字（`*.html` 的可見文字與 `common/i18n.js`）零殘留；其餘命中全部落在上表「刻意保留」的四類（說明頁講 V1／V2、程式註解講游標範圍、docs 稽核表、CHANGELOG 歷史條目）。
- 回歸：以 `fail3_config.txt` 量測 F_ST_SEL 的 span 寬度（1920px），維持 532／136／64／33／26 px，與 v3.24.0 相同。

---

## TCON 波形模擬與取樣 (wfg) v3.24.0 — 2026-08-20 ｜ MINOR ｜ ⚠ 輸出變更

**Gate 條數上限可開放到 2 倍**：「面板類比信號」→「Gate Line」小卡片新增核取方塊 **「Max. 2倍 Gate Line」**，**預設不打勾**。不打勾時上限維持 `Vactive`（與 v3.23.1 以前一位元不差）；打勾後上限變成 `Vactive × 2`。

卡片上的「可選範圍」提示同步變成 `1 ~ 2160（Vactive × 2）`，括號裡標明上限的來源 —— 使用者一眼看得出這個數字是 2 倍來的，而不是 Vactive 本身被改掉了。

**取消勾選時會自動夾回**：若當下 Gate 條數已經超過 `Vactive`，取消勾選會把它夾回 `Vactive`，不留超界值。夾取走的是既有的 `wfgOnGateLineChange()`（含 GPIO 同步、通道名、快取失效、重繪），不是只改變數 —— 只改變數會讓波形停在超界值算出來的舊快取上。

### 改了什麼

| 位置 | 改動 |
|---|---|
| `wfgGateLineMax()` | `Math.max(1, wfgFrame.vactive \| 0)` → 再乘上 `(wfgPanel.gate_line_x2 ? 2 : 1)`。**這是本次唯一動到上限的地方** |
| `wfgPanel` | 新增 `gate_line_x2: false` |
| Gate Line 卡片 HTML | 新增 `#wfg-gate-x2-cb` 核取方塊（沿用同卡片「顯示 Gate 波形」那顆的樣式，未自創新樣式） |
| `wfgRenderPanelCard()` | 同步核取方塊勾選態；範圍提示的括號改讀 `wfg.gateRangeSrc` / `wfg.gateRangeSrcX2` |
| `wfgOnGateLineX2Change()` | 新增。只翻旗標 → 需要時呼叫 `wfgOnGateLineChange()` 夾回 → `wfgRenderPanelCard()` 重建 max 與提示 |
| `wfgImportConfig()` | 先讀 `gate_line_x2`（預設 `false`）再讀 `gate_line`；採**嚴格** boolean 判定 `=== true` |
| `common/i18n.js` | 新增 `wfg.gateLineX2` / `wfg.gateRangeSrc` / `wfg.gateRangeSrcX2`，三語齊備 |

**沒有新增第二套上限機制**：拉把 `max`、數字框 `max`、± 按鈕的夾取（讀 `rangeEl.max`）、`wfgOnGateLineChange()` 與 `wfgGateNumCommit()` 的夾取、以及範圍提示文字，**全部只讀 `wfgGateLineMax()` 一處**。改完以 `grep -n 'vactive' wfg.html` 逐筆確認：Gate 上限路徑上沒有任何殘留的 `vactive` 或 `vactive * 2` 寫法（其餘 30 餘筆全屬 SD/Source Driver 的 active 區判斷，與 Gate 上限無關）。Gate 條數本身的計算與波形邏輯一行未動。

#### 匯入的 boolean 判定與相鄰欄位**刻意不一致**

`gate_line_x2` 用 `=== true`，同區塊的 `gate_show` / `spx_show` / `ft_enable` / `vcom_enable` 用 `!!`。這是依需求明文「非 boolean 一律當成 false」，不是漏抄 —— 需求描述與現況不符時照需求做。實測差異只出現在手改設定檔填怪值的情況：

| 檔案裡的 `gate_line_x2` | `!!`（相鄰欄位的既有做法） | `=== true`（本欄採用） |
|---|---|---|
| `true` | 打勾 | 打勾 |
| `false` / `0` / `null` / 欄位不存在 | 不打勾 | 不打勾 |
| `"yes"` / `1` | **打勾** | **不打勾** ← 本欄的行為 |

本工具匯出的一定是 boolean，舊檔則整個欄位不存在，所以兩種寫法在真實情境下沒有差別。四種無效值（`"yes"` / `0` / `null` / `1`）已實測全部落到不打勾、上限回 `Vactive`。

判定依據：§1 判定表逐欄 ——「操作流程」**多了一顆核取方塊，舊的控制項全部在原位**（拉把、± 鈕、數字框、顯示勾選框位置未動）；「功能增減」→ **新增**一個獨立、可選、預設關閉的能力 → **MINOR**（§2 案例 1、R3「這一版之後使用者能做的事多了一件」：可以把 Gate 條數開到 2 倍）；「既有功能的輸出」→ 預設不打勾時波形數值、上限、UI 文字全部不變，舊檔匯入後 `panel.gate_line` 與 v3.23.1 逐值相同（已實測，見下）。逐項判：R1 不適用（非修 bug）；R2 不適用（不開新波、不進 MAJOR）；**R3 → MINOR**；R4 不適用（`gate_line_x2` 的預設值是本次新增的欄位，不是改變某個既有選項的預設值，起始畫面零改變）。取最高者 → **MINOR**。

**取捨說明（供覆核）**：匯出檔的 `panel` 物件會多出 `"gate_line_x2": false` 一行，字面上落在 R1〈`⚠ 輸出變更` 範圍定義〉的「數值類：匯出檔案的位元組內容」，而判定表「既有功能的輸出：主動改變」那一格指向 MAJOR。**本次判 MINOR 而非 MAJOR**，理由是該格的核心問句是「使用者需要重新學或重新確認過去的結果嗎」，逐項核對皆為否：既有欄位一個都沒被改動或移除；新版讀舊檔＝不打勾＝與舊版逐值相同（實測見下）；舊版讀新檔也正常，因為匯入端是逐欄位 `if (config.panel.X != null)` 顯式取值，多一個未知欄位不會有任何影響 —— 兩個方向都沒有相容性破壞。這與 v3.23.1 的情況不同：那次是**移除** `start`/`end`，新檔給舊版讀會真的拿不到視野。同時 R1 該節「不算（不標）」欄第一條「純新增能力，既有操作的結果完全不變」也正好描述本次。依 R2 補充 3「不確定一律往低編」，取 MINOR。**若覆核者不同意上述任一條，正確的處置是提出來重判，不要當成既成事實。**

`⚠ 輸出變更` 的理由：即使既有欄位一位元未變，**匯出檔多了一行**，拿 v3.23.1 匯出檔做 sha256／逐位元組比對的回歸流程會看到差異，必須知道這是預期內的。波形數值本身未變（數值級回歸零差異，見下表第 7 項）。

### 驗收（Chrome headless，`git archive 1811caa` 取 v3.23.1 在同一台機器同一份設定檔做對照）

| # | 項目 | 讀回值 |
|---|---|---|
| 1 | 預設狀態 | `#wfg-gate-x2-cb` 存在且 `checked=false`；`panel.gate_line_x2=false`；拉把／數字框 `max` 皆 `1080`（＝`Vactive`）；提示 `可選範圍：1 ~ 1080（Vactive）` |
| 2 | 打勾後 | 拉把／數字框 `max` 皆 `2160`；提示 `可選範圍：1 ~ 2160（Vactive × 2）`；設 2160 → `panel.gate_line=2160`、拉把值同步 `2160` |
| 3 | 超界後取消勾選 | `gate_line` `2160 → 1080`（自動夾回 `Vactive`）；`max` 回 `1080`；提示回 `（Vactive）` |
| 4 | 邊界輸入（上限 1080） | `0`→`1`、`-5`→`1`、`9999`→`1080`、`abc`→數字框回 `1` 而 `gate_line` **維持前值 500**（`parseInt('')` 是 NaN，`wfgOnGateLineChange` 的 `isFinite` 守衛直接 return，不動狀態）。四種情況 `gate_line` 皆為有限整數且落在 `1 ~ 1080`，無 NaN、畫面未空白 |
| 5 | 匯出／匯入往返 | 打勾 + `gate_line=1500` → 匯出檔 `panel.gate_line_x2: true`、`gate_line: 1500` → 重新載入頁面 → 匯入 → 勾選 `true`、`gate_line=1500`、`max=2160`。**負控制**：reload 後 autosave 會自動還原上次狀態，匯入前狀態就已等於目標值 ＝ 這個檢查本身沒有鑑別力；因此先把狀態推成「不勾選 ／ `gate_line=7`」再匯入，確認它真的被拉回「勾選 ／ 1500 ／ max 2160」。反向亦驗：匯入 `gate_line_x2:false` + `gate_line:900` 的檔案 → 勾選被關掉、`max` 回 `1080` |
| 6 | 舊檔相容 | `fail3_config.txt`（Vactive 1440）與 `test_config.txt`（Vactive 720）皆無新欄位 → 匯入後 `gate_line_x2=false`、未勾選、上限＝各自的 `Vactive`；`panel` 除了新增的 `gate_line_x2` 外**其餘 13 欄與 v3.23.1 逐值相同**，`gate_line` 各為 `31` / `7`，兩版一致。另驗「檔案裡整個沒有該欄位」與四種無效值皆落到不打勾 |
| 7 | 回歸 | F_ST_SEL span 掃描（1920px、`fail3_config.txt`）：`532 / 136 / 64 / 33 / 26 px`，與 v3.23.1 **五個值全部相同**，且與既有基線一致。**數值級**逐值比對（`wfgDumpGpioEdges` × 26 個 GPIO、`wfgDumpLsCko`、`wfgDebugGate`、`wfgDumpSpx`）：兩份設定檔全部 **零差異**（fail3：轉態 17570 筆、CKO 邊沿 8688 筆、`spx.overallHash=f3d29352`；test：轉態 8873 筆、CKO 邊沿 4318 筆、`spx.overallHash=7833d325`）。`wfg-canvas` 幾何兩版皆為 `1363×1578 @ (327,111)` |
| 8 | 版面 | 桌機勾／不勾各一張截圖，已逐張開圖確認：提示文字、勾選態、`G2160 → CKO6 第 360 個 pulse` 皆正確。390px（`Emulation.setDeviceMetricsOverride`，`innerWidth` 實測 390）下核取方塊與文字同一列、在卡片內、`scrollWidth === clientWidth` 無橫向溢出 |

#### 🔴 第 7 項為什麼用數值級比對，不是逐像素

原本打算逐像素。實測發現**跨 Chrome 實例的像素比對沒有鑑別力**：拿同一份 v3.24.0 build 開兩個獨立實例、匯入同一份設定檔、設同一個視野，兩張波形圖之間就有 **10916 個相異像素**（最大單通道色差 240）；而 v3.24.0 vs v3.23.1 之間只有 **17 個**（色差 ≤ 59，集中在波形頂端一列的抗鋸齒邊緣）。也就是說「17」遠低於同版自比的噪音底線，拿它宣稱「零差異」或「有差異」都站不住腳。

改用確定性的數值輸出，並附負控制證明比對抓得到差異：把 `gate_line` 從 31 改成 32，`wfgDebugGate` 與 `wfgDumpSpx` 立刻出現差異、`panel.gate_line` 也被抓到 —— 確認這不是「空資料的比對永遠通過」。

#### 已知的既有行為（非本次引入，未修）

切換語言時「可選範圍」那行**不會即時更新**（它由 JS 以 `textContent` 寫入、沒有 `data-i18n`，`applyLang()` 掃不到），要等下一次 `wfgRenderPanelCard()` 才會變成新語言。已拿 v3.23.1 逐行對照確認**兩版行為完全相同**，同卡片的「充放電時間倍率」提示也一樣 —— 這是既有問題，本次只是沿用同一機制，未擴大也未修正。三個新 key 在 `zh-TW` / `zh-CN` / `en` 三語表中皆有值，畫面上不會出現未翻譯的 key（已逐語言讀回實際文字確認）。

---

## TCON 波形模擬與取樣 (wfg) v3.23.1 — 2026-08-20 ｜ PATCH ｜ ⚠ 輸出變更

**設定檔裡的視野改成只用時間表示**：匯出的 `view` 現在只有 `center`（絕對秒）與 `zoom`（倍率，1 ＝ 全覽）兩個欄位，`start` / `end`（單位 line）**不再寫出**。

```
舊： "view": { "start": 0, "end": 2980, "center": 0.006944975961538461, "zoom": 250 }
新： "view": { "center": 0.006944975961538461, "zoom": 250 }
```

為什麼：`line` 是程式的內部座標，它的絕對長度由 Vtotal × FrameRate 決定 —— 換一組 timing，同一個 line 號指的就不是同一個時間點。設定檔是要拿給人看、拿去跨檔比對的東西，裡面放一個「意義隨參數浮動」的數字本身就是錯的來源。而且 `start`/`end` 與 `center`/`zoom` 描述的是同一件事，四個欄位並存＝同一份狀態有兩個真值來源，手改其中一邊就會自我矛盾。

### 🔴 這是匯出格式的破壞性變更

**本版之後匯出的檔案，若拿給 v3.21.0 以前的版本讀，會因為找不到 `start`/`end` 而拿不到視野**（退回該版自己的預設視野；其餘設定照常讀）。反方向不受影響：**舊檔給新版讀完全正常** —— 匯入端的 `start`/`end` 回退路徑一行未動，那條 `else` 從此的唯一用途就是讀舊檔，不可因為「匯出端已經不寫了」而清掉。

判定依據：§1 判定表逐欄 ——「操作流程」零改變（匯出／匯入入口、中心／倍率兩個輸入框都在原位）；「功能增減」不增不減；**「既有功能的輸出」→ 這一格字面觸發 MAJOR**：匯出設定檔是既有功能，它的輸出（檔案位元組內容）確實被**主動改變**（設計上決定不一樣，不是修 bug），而 R1 的〈`⚠ 輸出變更` 範圍定義〉是本文件對「輸出」唯一的界定，其中「數值類」明列「**匯出檔案的位元組內容**」。逐項判：R1 不適用（非修 bug）；R2 不適用（不開新波）；R3 不適用（使用者不會因此多能做一件事，兩個輸入框 v3.21.0 就有了）；R4 不適用（起始狀態未變）。

**取捨為 PATCH（不是 MAJOR）—— 判斷過程完整寫在這裡供日後覆核，不要只看結論：**

| 判準 | 事實 |
|---|---|
| 使用者原本會的操作還在不在 | **在**。沒有任何按鈕移位或消失 |
| 要不要重新確認過去的結果 | **不用**。匯出→重新載入→匯入的往返實測中心誤差 0 line、倍率相對誤差 0%；`fail3_config` / `test_config` 兩份只有 `start`/`end` 的舊檔，匯入後視野與 v3.23.0 **逐值相同**；波形區逐像素 0 差異（負控制已證明該比對有鑑別力） |
| 破壞性落在誰身上 | 只落在「**新檔給舊版讀**」這一個方向。本站是 GitHub Pages 單一線上版本，使用者永遠拿到最新版，該情境實務上不存在。真正會踩到的只有「手上留著舊版 HTML 離線檔」這種例外 |
| §1「改動大小不是判準」那一節 | 明文寫「判準只有一個：使用者原本會的操作還在不在、要不要重新確認過去的結果」—— 上面兩列皆為否 |
| 性質歸類 | 移除的是**冗餘欄位**（與 `center`/`zoom` 描述同一件事），行為零改變 → 近似 §2 案例 4「重構資料結構、行為不變 → PATCH」 |

**若覆核者不同意上表任一列，正確的處置是提出來重判，而不是把它當成既成事實。**編低了下次可以補，編高了會永久留在 git 歷史裡（R2 補充 3）。

`⚠ 輸出變更` 的理由：**匯出檔的位元組內容改變了**（`view` 少兩個欄位），屬 R1 範圍定義的「數值類：匯出檔案的位元組內容」。拿 v3.22.0／v3.23.0 匯出檔做逐位元組比對的回歸流程會看到差異，必須知道這是預期內的。波形像素、canvas 尺寸、版面皆未變（1920 逐像素零差異已驗）。

### 改了什麼

| 位置 | 改動 |
|---|---|
| `wfgExportConfig()` 的 `view` | `var o = { start: wfgViewStart, end: wfgViewEnd }` → `var o = {}`。`center`／`zoom` 兩行計算式**一位元未動**（沿用 v3.22.0 的 `wfgTimePerLine()` 與 `total / span`，後者與 `wfgCurrentZoomFactor()` 同定義），沒有新增第二套視野機制 |
| `wfgImportConfig()` 的 view 區塊 | **零行為改動**，只補註解：優先序（`center`/`zoom` → `start`/`end` → fit-all）與 `typeof === 'number'` 的有效性判定維持 v3.22.0（commit `c0874cb`）那套不變 |

### 驗證（本機 repo 起 http server ＋ headless Chrome CDP，1920×1200）

| 項目 | 結果 |
|---|---|
| 匯出欄位 | `Object.keys(view)` ＝ `["center","zoom"]`，原文 `"view": { "center": 0.006944975961538461, "zoom": 250 }` |
| 往返 | 匯出 → `Page.reload` → 匯入：`{s:0, e:2980, zoom:250}` 逐值相同，中心誤差 0 line、倍率相對誤差 0%、兩個輸入框字串相同 |
| 舊檔 `fail3_config` | new＝base＝`{s:1439.8277695565214, e:1556.888572921413}`，框 `0.006984｜6364` |
| 舊檔 `test_config` | new＝base＝`{s:0, e:38500}`，框 `0.0868｜1` |
| 惡意值 | `center` 為 `null`／裸 `NaN`／`"abc"`／`-1`，`zoom` 為 `0`／`-5`，以及 `view:{}` 共 7 種，匯入後視野一律合法（`0 ≤ start < end ≤ 總行數`），非背景像素 14156～64980（畫面不空白） |
| F_ST_SEL span 掃描 | 1920px 下 **532／136／64／33／26 px**，new 與 base 完全相同 |
| 逐像素 | 波形區（`wfg-canvas` rect 1363×1002，非背景像素 27～82 萬）7 組場景全部 **0 差異**；同版跑兩次的負控制也是 0，證明此比對有鑑別力 |
| 版面 | 390px：兩框 84×18、`elementFromPoint` 命中自己、`scrollWidth 390/390`、改 `zoom=40`／`center=0.005` 都到位；1920px：92×20、`zoom=77`／`center=0.0031` 都到位 |

> 驗證過程踩到、值得記下來的兩個坑：**(1)** `Page.reload` 是非同步的，命令回來時舊 document 還在，立刻 evaluate 會打在舊 context 上、之後導航才發生，看起來就像「匯入沒生效」—— 要在舊 document 種一個標記，等它消失才算新頁面。**(2)** 逐像素比對第一次跑，同一版跑兩次就差 12833px，查出是「快捷設定」下拉的 `preset-attention` 呼吸燈光暈（那個 class 是匯入完成後才掛上去的，掛上瞬間動畫重新開始）—— 停 CSS 動畫還不夠，要連 class 一起移除，再用 `wfgFlickForcePhase(0)` 凍結極性面積閃爍，負控制才歸零。

---

## TCON 波形模擬與取樣 (wfg) v3.23.0 — 2026-08-20 ｜ MINOR

**「中心」與「倍率」輸入框在手機版也看得到、也能用了**（TCON Timing 調整練習與 LA 分析器兩個分頁都是）。原本這兩個框寫死 `display:none`，只有 `min-width:901px` 的桌機才給樣式，手機完全看不到；現在改成所有寬度都顯示，窄螢幕自動縮小尺寸、放不下就換行。

判定依據：§1 判定表逐欄 ——「功能增減」**新增**（手機使用者原本做不到「直接輸入中心秒數／倍率」，現在做得到）→ MINOR；「操作流程」桌機零改變（1920 寬度下兩頁四個框的 `getBoundingClientRect()` 與改動前逐位元相同，工具列截圖停用動畫後逐像素零差異），手機是多了控制項、既有按鈕都在原位；「既有功能的輸出」波形數值與匯出檔一位元未變。逐項判：R1 不適用（不是修 bug —— 舊行為是當初刻意的 desktop-only 設計，不是壞掉）；R2 不適用（不是波的開頭）；**R3 適用** —— 這一版之後使用者多能做一件事 → MINOR；R4 不適用（起始狀態未變）。取最高者 → **MINOR**。

不標 `⚠ 輸出變更` 的取捨（寫明供覆核）：手機版工具列的版面確實變了（檢視 group 變高、窄螢幕會換行，同列其他 group 的列高跟著重排），但 R1 的「版面／構圖類」判準是「用**截圖／匯出圖片**功能存下來的成果會不會不一樣」—— wfg 的截圖／匯出圖是波形 canvas，**不含工具列**，且 canvas 尺寸與波形像素零改變（1920 逐像素比對已驗）。回歸基線不會因此失效，故不標。若日後有涵蓋工具列的截圖流程，此判斷需重審。

### 改了什麼

| 位置 | 改動 |
|---|---|
| `.wfg-la-view-io`（CSS） | 移除 `display:none` ＋ `@media (min-width:901px)` 包裹，規則改為無條件套用。桌機的尺寸（框寬 92/62、高 20、字 11px）一個位元沒動 |
| `@media (max-width: 900px)` | 新增手機版尺寸：框高 22、字 9px、中心框寬 84、倍率框寬 46、輸入框高 18／字 10px（壓縮比例比照同一區塊既有的 `.wfg-la-b-count`） |
| `@media (max-width: 900px)` 的 `.wfg-la-tool-group` | 加 `flex-wrap: wrap` ＋ `max-width: 100%` |

🔴 **只加 `flex-wrap` 是不夠的**：`.wfg-la-tool-group` 是 `flex: 0 0 auto`，寬度＝內容寬（max-content），永遠不會窄到觸發內部換行 —— 實測 LA 分頁在 390px 下把 `documentElement.scrollWidth` 撐到 415（橫向溢出 25px、倍率框右緣跑到 399.3）。要配 `max-width: 100%` 把 group 夾在容器內，`flex-wrap` 才會生效。修正後 390/430/768 三種寬度的 `scrollWidth` 都等於 `clientWidth`。

對其他 group 是 no-op：沒有溢出時 wrap 與 nowrap 排版相同，四種寬度下逐一比對每個 group 的寬度，只有「檢視」group 變化（其餘寬度完全相同，部分 group 的列高因同列成員重排而變，屬 flex `align-items:stretch` 的被動結果）。

### 一併更正的過期敘述（同一件事的所有提及處）

- `wfg.html` CSS 註解「預設隱藏，僅 min-width:901px desktop 顯示，mobile 完全不受影響」
- `wfg.html` 兩處 DOM 註解（TCON 分頁 v3.21.0、LA 分頁 v2.97.440）的「desktop-only／僅 desktop 顯示」
- `wfg.html` JS 區塊標題「（僅 desktop）」
- `wfg-guide.html`：「手機可以用嗎」段落、LA 工具列表格「中心」「倍率」兩列的「**僅桌面顯示。**」（說明頁不納入版號機制）

### 驗證（headless Chrome ＋ CDP，390×844／430×932／768×1024／1920×1080 四種寬度，`Emulation.setDeviceMetricsOverride`）

| 寬度 | 分頁 | 中心框 rect (l,t,w,h) | 倍率框 rect (l,t,w,h) | `elementFromPoint` | scrollWidth/clientWidth |
|---|---|---|---|---|---|
| 390 | TCON | 215.0, 367.6, 84, 18 | 57.0, 391.6, 46, 18（換行到第二列） | INPUT#wfg-view-center／#wfg-view-zoom | 390 / 390 |
| 390 | LA | 231.8, 257.6, 84, 18 | 36.0, 281.6, 46, 18（換行） | INPUT#wfg-la-view-center／#wfg-la-view-zoom | 390 / 390 |
| 430 | TCON | 215.0, 423.6, 84, 18 | 336.4, 423.6, 46, 18（同列） | 同上 | 430 / 430 |
| 430 | LA | 231.8, 257.6, 84, 18 | 36.0, 281.6, 46, 18（換行） | 同上 | 430 / 430 |
| 768 | TCON | 215.0, 486.0, 84, 18 | 336.4, 486.0, 46, 18 | 同上 | 768 / 768 |
| 768 | LA | 231.8, 175.0, 84, 18 | 353.3, 175.0, 46, 18 | 同上 | 768 / 768 |
| 1920 | TCON | 549.0, 78.0, 92, 20 | 688.0, 78.0, 62, 20 | 同上 | 1920 / 1920 |
| 1920 | LA | 917.0, 67.0, 92, 20 | 1056.1, 67.0, 62, 20 | 同上 | 1920 / 1920 |

- **改動前對照組**：同一組腳本跑 `git archive HEAD` 取出的舊版，三種手機寬度四個框全部 `display:none`、rect 全 0、點不到（腳本回 `NO_BOX`）→ 偵測器有鑑別力，不是「怎麼測都會過」。
- **桌機零回歸**：1920 下 base 與 cur 的四個框 rect、以及兩頁全部 11 個 tool group 的寬高**逐值相同**；TCON 工具列截圖逐像素零差異，LA 工具列停用 CSS 動畫後亦為零差異（未停用時的 6399 個差異像素定位在「快捷設定」下拉框，來自既有的 `presetPulse` 呼吸燈動畫相位，與本次改動無關）。
- **功能（走使用者真實路徑：CDP 點框 → 鍵盤輸入 → Enter）**：三種手機寬度下，點擊後 `document.activeElement` 都是該輸入框；倍率輸入 250 → 視野 span＝45＝總行數 11250÷250 ✓（對照組舊版 span 仍是 11250，因為框根本不存在）；中心輸入 0.002 s → 視野 `{s:112.5, e:157.5}`，中心 135 line × 1/(1125×60) s ＝ 0.002 s ✓；LA 分頁倍率輸入 4 亦生效。
- **數字鍵盤**：四個框 `type="text"` ＋ `inputmode="decimal"`，四種寬度實測讀回皆為 `decimal`。
- **截圖**：每種寬度、每個分頁各一張工具列裁切圖，逐張看過 —— 標籤「中心」「倍率」與單位 `s`／`×` 都在，無重疊、無截斷、無溢出可視範圍。

---

## TCON 波形模擬與取樣 (wfg) v3.22.0 — 2026-08-20 ｜ MINOR ｜ ⚠ 輸出變更

**中心與倍率現在也存進設定檔了。** 匯出的 `view` 物件多了 `center`（絕對秒）與 `zoom`（1 = 全覽）兩個欄位，定義與工具列上那兩個輸入框完全相同；匯入時優先用它們還原。承接 v3.21.0。

判定依據：§1 判定表逐欄 ——「功能增減」**新增**（設定檔能保存／指定中心與倍率，也能手改 JSON 直接指定）→ MINOR；「操作流程」零改變；「既有功能的輸出」對舊檔完全不變（見下方第 9 項實測）。逐項判：R1 不適用（不是修 bug）；R2 不適用（不是波的開頭，不進 MAJOR）；**R3 適用** —— 使用者多能做一件事 → MINOR；R4 不適用。取最高者 → **MINOR**。

`⚠ 輸出變更` 的理由：**匯出檔的位元組內容改變了**（`view` 多兩個欄位），屬 R1 範圍定義的「數值類：匯出檔案的位元組內容」。拿舊版匯出檔做逐位元組比對的回歸流程會看到差異，必須知道這是預期內的。波形像素、版面尺寸皆未變。

### 格式

```json
"view": {
  "start": 12268.000000000016,      ← 保留，單位仍是 line，值一位元未變
  "end":   12422.000000000016,      ← 同上
  "center": 0.05567120192307699,    ← 新增：絕對秒，＝工具列中心框的值
  "zoom":   250                     ← 新增：倍率，1 = 全覽
}
```

`center` 用 `wfgTimePerLine()` 換算、`zoom` 等同 `wfgCurrentZoomFactor()` —— 與 UI 兩個框、與波形區上方時間軸都是同一個來源，不另寫一套。

### 匯入的優先順序

| 檔案內容 | 行為 |
|---|---|
| 有 `center` 且有 `zoom`（皆有效） | 以它們為準：`span = 總行數 / zoom`、`start = center 換算成 line − span/2` |
| 沒有這兩個欄位（舊檔） | 走原本的 `start` / `end`，行為與 v3.20.7 **逐字相同** |
| 兩者都有但與 `start`/`end` 矛盾 | **以 `center`/`zoom` 為準** |
| 值無效 | 當成沒有，退回 `start`/`end` |

矛盾時以 `center`/`zoom` 為準的理由：那兩個是**使用者在工具列上親手輸入的值**，`start`/`end` 只是它們被夾取、四捨五入後的結果。會出現矛盾必然是有人手改過 JSON，此時跟隨使用者寫的那組才符合直覺。

不論走哪一條，最後都會過 `wfgClampViewToBounds()`（v3.20.7 建立的唯一守門），因此**任何檔案內容都不可能產生非法視野**。

> 🔴 **`Number(null)` 是 0 不是 NaN。** 有效性判斷因此不用 `Number()` 轉，改成只認 JSON 裡本來就是 number 的值（`typeof === 'number'`）。否則 `"center": null` —— 手改 JSON 時最常見的「我不要這個值」寫法 —— 會被當成「把中心設在 0 秒」，畫面直接跳到最前面。這是實測第 10 項時抓到的，第一版真的會這樣。字串（含 `"250"`、`"NaN"`、`"abc"`）一律視為無效。

### 驗證（headless Chrome + CDP，1920×1200）

**第 8 項｜往返**（`test_config`，先設倍率 250 把 span 縮到 154 line，再設中心 12345 line —— 中心必須明顯偏離 total/2＝19250，這一輪才有鑑別力）：

```
匯出前   s=12268.000000000016  e=12422.000000000016  中心 12345.0000 line  框=[0.055671 s / 250 x]
匯出檔   {"start":12268.000000000016,"end":12422.000000000016,
          "center":0.05567120192307699,"zoom":250}
         center 與框相符 True／zoom 與框相符 True／start,end 保留且為 line True
重新載入頁面後匯入
匯入後   s=12268.000000000016  e=12422.000000000016  中心 12345.0000 line  框=[0.055671 s / 250 x]
         中心誤差 0 line（門檻 0.01）  倍率相對誤差 0.000e+00（門檻 0.1%）  兩框相同 True
```

矛盾情境（把 `start`/`end` 手改成全覽 `[0, 38500]`，`center`/`zoom` 保持不動）→ 結果 `s=12268 e=12422 span=154 中心=12345`，確實跟著 `center`/`zoom`。

**第 9 項｜舊檔相容**（兩份檔案都不含 `center`/`zoom`，實測確認）：

```
                v3.20.7                                    v3.22.0
fail3_config    {"s":1439.8277695565214,                   {"s":1439.8277695565214,
                 "e":1556.888572921413}                     "e":1556.888572921413}   → 完全相同
test_config     {"s":0,"e":38500}                          {"s":0,"e":38500}         → 完全相同
```

新版波形正常：`fail3` 非背景取樣點 5204、`test_config` 39315。

**第 10 項｜惡意值**（10 種，總行數 38500，合法視野須滿足 `0 ≤ s < e ≤ 38500`）：

```
center=NaN(裸,非法JSON)  匯入=false  s=12268 e=12422 legal=True 非背景=4467
center="NaN"(字串)       匯入=true   s=12268 e=12422 legal=True 非背景=4467
center=null              匯入=true   s=12268 e=12422 legal=True 非背景=4467
center=-0.5(負數)        匯入=true   s=12268 e=12422 legal=True 非背景=4467
center="abc"             匯入=true   s=12268 e=12422 legal=True 非背景=4467
zoom=0                   匯入=true   s=12268 e=12422 legal=True 非背景=4467
zoom=-5                  匯入=true   s=12268 e=12422 legal=True 非背景=4467
zoom="abc"               匯入=true   s=12268 e=12422 legal=True 非背景=4467
center="abc"+zoom=0      匯入=true   s=12268 e=12422 legal=True 非背景=4467
刪掉 center/zoom(舊檔)    匯入=true   s=12268 e=12422 legal=True 非背景=4467
```

十種全部正確退回 `start`/`end`，視野合法、畫面不空白。裸 `NaN` 是非法 JSON，`wfgImportConfig()` 回 `false` 不套用，既有視野原封不動。

> 測試備註：`center: NaN` 解析失敗會跳原生 `alert()`，會阻塞 renderer 讓 CDP 一路等下去 —— 驗證腳本每次載入後都要先 stub 掉 `alert`／`confirm`。

### 未動的部分

內建 preset 的 `view`（硬編在程式裡）維持只有 `start`/`end`，本版不動。

---

## TCON 波形模擬與取樣 (wfg) v3.21.0 — 2026-08-20 ｜ MINOR

**「檢視」工具列多了「中心」與「倍率」兩個輸入框**，可以直接打數字指定要看哪裡、放多大，不必再靠放大／縮小按幾下去逼近。做法比照 LA 分頁 v2.97.440 的同名功能。

判定依據：§1 判定表逐欄 ——「操作流程」多了兩個輸入框，放大／縮小／全覽／重置四顆按鈕全部留在原位（工具列截圖佐證）；「既有功能的輸出」不變（見下方回歸數據）；「功能增減」只增不減 → MINOR。逐項判：R1 不適用（不是修 bug）；R2 不適用（不是波的開頭，不進 MAJOR）；**R3 適用** —— 這一版之後使用者多能做一件事（用數值直接指定中心時間與倍率）→ MINOR；R4 不適用（沒有改任何預設值或起始畫面）。§2 案例 1（新增一個完整功能）同樣是 MINOR。取最高者 → **MINOR**。

**不標 `⚠ 輸出變更`**：屬「純新增能力，既有操作的結果完全不變」。版面／構圖類也逐項實測相同（見下方），沒有任何用截圖或匯出圖片存下來的成果會因此改變。

### 規格

| | 中心 | 倍率 |
|---|---|---|
| 單位 | **絕對時間（秒）**，＝波形區最上方那條時間軸的讀數 | 無單位，**1 = 全覽** |
| 語意 | 保持目前的縮放層級（span 不變），把該時間移到畫面正中 | 以目前螢幕中心為錨改變 span，中心不動 |
| 上下限 | 過 `wfgClampViewToBounds()`，超出範圍就整個視窗平移回界內 | 1（全覽）～ 總行數 ÷ `WFG_MIN_VIEW_SPAN` |
| 無效輸入 | 不改變視野，把當下值回填回框裡 | 同左 |

中心之所以用秒而不是 line：**要跟畫面最上方的時間軸對得起來**。換算一律走 `wfgTimePerLine()`，那正是時間軸標籤自己在用的式子（原本寫成 `wfgRender()` 裡的三行區域變數，本版抽成函式，`wfgRender()` 改呼叫它 —— 式子一個字未改）。內部視野變數仍然是 line，秒只存在於這個框的輸入與顯示。

> ⚠️ **設定檔的 `view` 欄位維持原狀**：實際格式是 `view: { start, end }`，單位是 **line**，沒有 `center` / `zoom` 欄位。把它改成秒會讓所有既有設定檔被讀成完全不同的視野，且對使用者沒有好處（那是內部座標，不顯示在任何地方）。此項待裁示，本版不動。

### 「用同一套系統」

沒有新增任何視野狀態，也沒有第二套繪製：兩個框只是把值寫進既有的 `wfgViewStart` / `wfgViewEnd`，過既有的唯一守門 `wfgClampViewToBounds()`（v3.20.7 建立），再走既有的 `wfgRender()` / `wfgUpdateMinimapViewport()`。與放大／縮小／全覽／重置／minimap 拖曳走的是同一條路，所以彼此天生一致。

雙向回填掛在 `wfgRender()` 裡 `wfgClampViewToBounds()` 的下一行，**不是函式末端** —— 底下還有「沒有可見通道」「拿不到 canvas」兩個提前 `return`，掛在末端會漏掉那些路徑。使用者正在框裡打字時（`document.activeElement === el`）不覆寫，與 LA 同做法。

順帶把 `wfgZoomIn()` 裡寫死的最小視野寬度 `0.005` 抽成常數 `WFG_MIN_VIEW_SPAN`：倍率的上限必須跟放大鈕的下限是同一個數字，否則兩條路徑的縮放極限會不一致。行為與抽出前完全相同。

### 驗證（headless Chrome + CDP，1920×1200，本機工作區）

「跟上方時間軸一致」是直接驗的 —— 攔 `CanvasRenderingContext2D.fillText` 錄下時間軸**實際畫出來**的標籤，內插到畫面正中央的 x：

```
標籤：0.0067s@x=173.9  0.0068s@x=403.6 … 0.0072s@x=1322.1
畫面中心 x=736.5 → 內插得 0.0069449759615 s
中心框顯示                0.006945       s     差 -2.4e-8 s = -0.0012 個 minorStep
```

| 項目 | 結果 |
|---|---|
| 中心輸入（fail3，1490 line＝0.00694497596 s） | 中心誤差 0 s，span 前後皆 7450.000，**一格未動** |
| 倍率 = 1 | view → `[0, 745000]`＝全覽 |
| 倍率 = 100 | span = 7450 = 745000/100，誤差 0；中心 line 位移 **0** |
| 中心邊界 0／全長／負數／超過全長 | 四種都合法（`0 ≤ s < e ≤ 總行數`），span 一律保持 7450，畫面不空白 |
| 中心 `abc`／倍率 `0`、`-3`、`abc` | 視野 s、e 皆未變，框回填當下值 |
| 雙向回填 | 放大／縮小／全覽／重置／**minimap 真實滑鼠拖曳**（視野位移 24947.8 line）／匯入設定檔，六種操作後框值與 `wfgGetView()` 的最大差距 0.048 個 minorStep（純顯示捨入），倍率相對誤差 ≤ 2e-3 |
| 三語 | zh-TW／en／zh-CN 的標籤與 title 皆正確，無未翻譯 key |

回歸（同一台機器、同一份 `fail3_config.txt`，**舊版 = `git archive HEAD`(v3.20.7)、新版 = 工作區**，兩邊都不含測試注入）：

```
              舊    新   新舊相同   舊段            新段
原樣          33    33    True     (973, 1005)    (973, 1005)
span7        532   532    True     (975, 1506)    (975, 1506)
span28       136   136    True     (973, 1108)    (973, 1108)
span60        64    64    True     (974, 1037)    (974, 1037)
span117.061   33    33    True     (975, 1007)    (975, 1007)
span150       26    26    True     (975, 1000)    (975, 1000)
```

連 HIGH 段的起訖像素座標都一致，且與 Bruce 給的基線（532／136／64／33／26）相符。版面幾何同樣逐項相同：

```
              舊版 v3.20.7                      新版 v3.21.0
toolbar       1363 × 61, top 52                1363 × 61, top 52
canvas        1363 × 1578, top 111             1363 × 1578, top 111
```

`test_config.txt`（v3.20.7 修好的那份）匯入後仍正常：非背景取樣點 39315 / 100860，`view = [0, 38500]`。

### 已知限制

- 兩個框沿用 LA 的 `.wfg-la-view-io`，因此同樣**只在 ≥901px 的桌面版顯示**，手機版完全不受影響。
- kvdat 模式的視野單位是時間而非 line，兩個 apply 函式在該模式直接回填當下值、不動視野（該模式在 `wfg.html` 目前沒有任何入口會啟用）。

---

## TCON 波形模擬與取樣 (wfg) v3.20.7 — 2026-08-20 ｜ PATCH ｜ ⚠ 輸出變更

**匯入某些設定檔後波形區一片空白、而且不報任何錯。** 原因是視野區間非法（`end < start`），這種視野畫不出任何東西，畫布就靜靜地留白。非法值是 WFG 自己產生、自己存進設定檔的。

判定依據：§1 判定表逐欄 ——「操作流程」零改變；「功能增減」不增不減；「既有功能的輸出」屬**修正為原本就該有的行為**（本來就不該畫出空白）→ PATCH。逐項判：**R1 適用** → PATCH ＋ `⚠ 輸出變更`；R2／R3 不適用；**R4 不適用**（沒有改任何預設值或起始畫面，只是把非法狀態夾回合法範圍）。取最高者 → **PATCH**。

### 症狀

`test_config`（3440×720、`vtotal 770`、`frameCount 50`，總行數 38500）匯入後：

```
wfgGetView() → { s: 38500.28656596953, e: 38500 }     ← end 比 start 還小
波形區非背景像素 0 / 1109700                          ← 完全空白
console 沒有任何錯誤                                   ← 靜默失敗
```

資料本身是好的：`wfgDumpGpioEdges(0,1)` 回 1537 筆轉態。只呼叫 `wfgFitAll()` 把視野換掉，畫面立刻正常（非背景像素 688772）。

### 產生端（這才是重點）

視野的三十幾個寫入點各自用 `Math.max` / `Math.min` 夾，而且**兩邊不對稱**：

```js
wfgViewStart = Math.max(0, center - newRange / 2);          // 只夾下界
wfgViewEnd   = Math.min(totalLines, wfgViewStart + newRange); // 只夾上界
```

單獨看沒問題，但只要視野**已經**越界，這段就會把 end 夾回總行數、start 原封不動 → `end < start`。而視野會越界，是因為**改變總行數的操作（VTOTAL／FRAME 重複數）沒有重新夾視野**。

最小重現（腳本 `pc.py repro`，v3.20.6 實測）：

| 步驟 | 視野 | 總行數 | |
|---|---|---|---|
| 1. `vtotal 770`、`frameCount 500`，fit all | `0 ~ 385000` | 385000 | 合法 |
| 2. 放大 12 次 | `192080.97 ~ 192919.03` | 385000 | 合法 |
| 3. **`frameCount` 改成 50** | `192080.97 ~ 192919.03` | **38500** | **非法**（整段跑出界外） |
| 4. **再按一次放大** | **`192248.58 ~ 38500.00`** | 38500 | **end < start**，畫面全白 |
| 5. 繼續放大 | `115374 → 76937 → 57718 …` | 38500 | start 逐步逼近 38500 |

第 5 步說明了設定檔裡那個 `38500.2866` 是怎麼來的 —— 再多按幾次，start 就收斂到略大於總行數的位置，接著被匯出存檔。

### 修法：規則只有一條

> **視野永遠必須滿足 `0 ≤ start < end ≤ 總行數`；任何寫入視野的動作都要在寫入當下就保證這件事。**

新增 `wfgClampViewToBounds()` 作為這條規則的**唯一實作**，在三個「視野進入系統的入口」各呼叫一次：`wfgRender()` 開頭（涵蓋縮放／平移／minimap／鍵盤／改總行數等所有寫入路徑的最後守門）、`wfgImportConfig()` 套用視野之後、autosave 還原視野之後。

夾法：**寬度優先保留**（使用者的縮放層級不該被沒收），把視窗整個平移回界內；只有寬度本身非法（NaN／零寬／負寬）才退回 fit-all。

🔴 沒有特例分支：函式裡只有 `wfgTotalLines()` 與視野兩個數字，**沒有 `vtotal === 770`、沒有特定 `frameCount`、沒有機種判斷、也沒有為匯入路徑另開的分支**。

### 驗收

| 項目 | 修正前 | 修正後 |
|---|---|---|
| 匯入 `test_config` 的視野 | `38500.2866 ~ 38500`（非法） | `0 ~ 38500`（合法） |
| 匯入 `test_config` 的非背景像素 | **0** | **688772** |
| 產生端重現步驟 3 | `192080.97 ~ 192919.03`（非法） | `37661.94 ~ 38500`（合法，寬度 838.06 保留） |
| 產生端重現步驟 4／5 | `end < start`，持續非法 | 全程合法 |
| 匯入 `fail3_config` 的 F_ST_SEL span 掃描 | 532／136／64／33／26px | **完全相同，未回歸** |

**負向對照**：把三處夾正呼叫全部停用（函式本體留著），匯入 `test_config` 立刻回到 `38500.2866 ~ 38500`、非背景像素 0。驗收確實有鑑別力。

**未波及其他通道**：`fail3_config`、同一視野，整片波形區 1363×901 新舊版逐像素比對，**0 差異**。（同一支比對流程在 v3.20.5 → v3.20.6 曾抓出 62 個像素的差異，證明它不是「怎麼比都相同」。）

**`wfgCalcGpio` 一個字沒動。**

---

## TCON 波形模擬與取樣 (wfg) v3.20.6 — 2026-08-20 ｜ PATCH ｜ ⚠ 輸出變更

**跨越 prelude／template 交界的那一個像素，準位由「程式碼先後順序」決定，而不是由時間決定。** v3.20.5 只修好了不跨交界的情形；Bruce 的畫面停在 frame 0／1 交界，所以仍然是壞的。

判定依據：§1 判定表逐欄 ——「操作流程」零改變；「功能增減」不增不減；「既有功能的輸出」屬**修正為原本就該有的行為** → PATCH。逐項判：**R1 適用** → PATCH ＋ `⚠ 輸出變更`；R2／R3／R4 不適用。取最高者 → **PATCH**。

### 症狀

`fail3_config`（view `1439.83 ~ 1556.89`，117 條 line，正好橫跨 frame 0／1 交界）。Line 0 之後那段 HIGH 平台應有 32px 寬，實際只畫出 2px。**視野越寬越容易踩到**，而且**把 view 起點平移 0.17 條 line 就會翻轉結果** —— 這種脆弱性正是「某個轉態剛好落進／落出某個像素」的指紋。

### 根因

Smart Dense Mode 的逐像素掃描裡，template 與 prelude 是兩個**分開的區塊**：

```js
if      ((lineRight - lineLeft) >= sVtotal && tplLen > 0) { … }
else if (lineRight >= steadyLine && tplLen > 0)           { … lastLevel = _tplLvl[tj]; }
if      (lineLeft  <  steadyLine && _preLen > 0)          { … lastLevel = _preLvl[pj]; }   // 無條件覆蓋
```

跨越 `steadyLine` 的那**一個**像素會同時滿足兩個條件。prelude 區塊後執行、無條件覆蓋 `lastLevel`，但它命中的那筆（frame 0 的 line 1489 falling，abs 1489.964）在**時間上早於** template 命中的 relLine 0（abs 1490.000）。較早的轉態贏了較晚的，`curLevel` 被錯設成 LOW，後續整個平台一路延續 LOW。

臨界寬度＝`1490 − 1489.964 = 0.036 line`：像素寬小於它，prelude 那筆就落不進這個像素、不會覆蓋。實測臨界確實落在 span 28（1px=0.0223）與 span 60（1px=0.0479）之間，與推導吻合。

### 修法：規則只有一條，沒有特例分支

> **一個像素的最終準位，取該像素區間內「時間最晚」那一筆轉態的準位**（區間內沒有轉態就延續前一個像素）。

新增 `_hitAbs` 記住目前命中的最晚**絕對**位置，template 與 prelude 各自把命中那筆換算成絕對時間後比較，誰晚誰說了算。template 的位置是相對週期起點，用 `_tplBase = steadyLine + floor((max(lineLeft, steadyLine) − steadyLine) / pv) × pv` 換算回絕對。

🔴 新增的可執行碼裡 **`f_st_sel` / `ini_val` / frame index / `relLine === 0` 出現次數皆為 0**，也沒有任何寬度或倍率的判斷；只有時間大小比較。

### 驗收

| 項目 | 結果 |
|---|---|
| 畫布 1920，span 7／28／60／117／150 | **全部 OK**（實際寬 532／136／64／33／26px，期望 531／133／62／32／25px） |
| 畫布 1280，同上 | **全部 OK**（274／70／34／17／14px） |
| 抖動：view 起點平移 0.0／0.17／0.33／0.5 line | **全部 OK 且穩定**，不再翻轉 |
| frame 6 交界（不跨 prelude）回歸 | 全部 OK，未被本次改動影響 |
| 兩路徑一致性 | dense（`frameCount 500`，週期）vs 逐筆展開（`frameCount 3`，非週期）：段數 113/114、57/57、147/147，平台段位置與寬度差 ≤1px → 一致 |

> 兩路徑不可能位元相同：dense 走逐像素 `fillRect`、sparse 走 `Math.round(x)+0.5` 的折線 `stroke`，取整方式不同，逐段 ±1px 是結構性差異。判準因此定為「段數差 ≤1、平台段起訖與寬度差 ≤2px」。

**負向對照**：把 prelude 那行改回無條件覆蓋，span 60／117／150 立刻重新出現缺口（2px），證明上述掃描有鑑別力。

**未波及其他通道**：同設定、同視野（`1439.664 ~ 1556.725`，會出現差異的那一組），整片波形區 1363×901 新舊版逐像素比對，差異 bbox `(649, 182, 680, 213)`、共 **62 個像素**，全部落在 XSTB 那一列的 HIGH／LOW 兩條線上（平台由 LOW 改為 HIGH）。其餘所有數位／類比通道逐像素相同。

> ⚠ 一開始我拿「原樣 view」做整片比對，得到 0 差異就想收工 —— 但那個 view 在 v3.20.5 本來就是正常的，**該組比對沒有鑑別力**。改用會出現差異的 view 重做才成立。記在這裡提醒：比對前先確認被比對的兩者本來就該不同。

**`wfgCalcGpio` 一個字沒動。**

---

## TCON 波形模擬與取樣 (wfg) v3.20.5 — 2026-08-20 ｜ PATCH ｜ ⚠ 輸出變更

**frame 2 以後，每個 frame 的 Line 0 起始準位在畫面上整個消失。** 波形算得對、`wfgExpandRange` 也回得對，是**畫的時候**掉的 —— dense template 的逐像素掃描漏掉了週期起點那一筆。

判定依據：§1 判定表逐欄 ——「操作流程」零改變；「功能增減」不增不減；「既有功能的輸出」屬**修正為原本就該有的行為** → PATCH。逐項判：**R1 適用** → PATCH ＋ `⚠ 輸出變更`（同一份設定新舊版重跑，frame ≥ 2 的 Line 0 會多出原本就該有的起始準位，舊截圖／基線不能直接沿用）；R2／R3／R4 不適用。取最高者 → **PATCH**。

### 症狀與重現條件

Bruce 的設定：`vtotal 1490 / htotal 3878 / frameRate 144 / frameCount 500 / lineBuffer 11`，XSTB `ST_LINE=2 R_DLY=1829 F_DLY=1870 INI_VAL=1 F_ST_SEL 勾選`，視野停在 **frame 201**（`view.start 299487.4`）。

畫面上 Line 0 應該從 INI_VAL=1 起始為 HIGH、一路平到 ST_LINE 那行的 F_DLY 才掉，實際卻整段是 LOW。**而且 INI_VAL 設 1 跟設 0 畫出來一模一樣** —— 因為 INI_VAL=1 的那筆切斷根本沒被畫。

🔴 **為什麼一直測不出來**：這條路徑要 `frameCount` 大到讓週期偵測成立（`isPeriodic`）**且** 視野落在 frame 2 以後才會踩到。先前的驗證全部用 `frameCount` 3 或 20、而且都看 frame 1 的邊界 —— `frameCount ≤ 3` 直接走非週期的逐筆路徑，frame 0／1 則走 prelude 分支（用絕對座標），兩者都繞開了出問題的那一段。

### 根因（`wfgRender` 的 Smart Dense Mode，不在 `wfgCalcGpio`）

`useDenseTemplate` 成立時，波形不展開，改成逐像素去 template 裡掃：

```js
var relLeft  = (lineLeft - steadyLine) % pv;
var relRight = relLeft + (lineRight - lineLeft);
// binary search: 第一個 _tplPos >= relLeft
while (_bsLo < _bsHi) { …; if (_tplPos[_bsM] < relLeft) _bsLo = _bsM + 1; else _bsHi = _bsM; }
for (var tj = _bsLo; tj < tplLen; tj++) { if (_tplPos[tj] > relRight) break; … }
```

template 第一筆是 `relLine 0, dly 0`（F_ST_SEL 勾選時在 Line 0 落的 INI_VAL 切斷），它的 `_tplPos` 是 **0**。而任何一個像素的 `relLeft` 都 > 0，binary search 的 `_tplPos[_bsM] < relLeft` 一律把它跳過；跨越 frame 邊界的那個像素則是 `relLeft ≈ pv`、`relRight ≈ pv + ε`，區間在 `[1489.998, 1490.004]`，同樣涵蓋不到 0。**`relRight` 跨過週期邊界後沒有 wrap 回 `[0, pv)`，於是那一筆永遠落在兩個像素的縫裡。**

修法：原迴圈之後補一段 —— `relRight >= pv` 時回頭掃 `[0, relRight - pv]`。

🔴 **規則只有一條，沒有特例分支**：「這個像素涵蓋的區間是模 `pv` 的，掃描也必須是模 `pv` 的」。新增的判斷條件只有 `relRight >= pv`，**不看任何 GPIO 參數（沒有 `f_st_sel`、沒有 `ini_val`）、不看 frame index、也不特判 `relLine 0`**；凡是落在環繞區間裡的 template 項目一視同仁。`relLine 0` 只是實務上最常落在那裡的那一筆，因而症狀最明顯。這是補完既有演算法的一般性缺陷，不是為某個欄位打的補丁。

### 已知次因（本次**不修**）

`useDenseTemplate` 的門檻用 `estTransCount = template.length × Math.max(1, framesInView)`。當視野遠小於一個 frame 時（本例 7 行、`framesInView ≈ 0.0047`），`Math.max(1, …)` 讓它退化成整個 template 的長度 **2977**，超過 `drawW × 2 = 2466`，於是**只有 7 行的視野也會走 dense 路徑** —— 而該視野內實際只有 13 筆轉態，本來該走逐筆的 sparse 路徑。

估得準的話（`2977 × 0.0047 ≈ 14`）就會走 sparse，本次這個 bug 也就不會被觸發。但它與上面的根因是**兩件獨立的事**：即使改了門檻，大視野仍會走 dense、仍需要環繞掃描才正確。因此本次只修根因，門檻維持原樣，記在這裡供後續評估（改它會改變路徑選擇與效能特性，需要另外做效能驗收）。

### 驗收

**frame index 掃描**（視野固定 7 行，量 XSTB 那一列的 HIGH 段寬度；正常脈衝約 4px，Line 0 的平段約 521px）：

| frame | 修正前 | 修正後 |
|---|---|---|
| 0 | 有平段 `637-1159` | 有 |
| 1 | 有平段 `637-1159` | 有 |
| 2, 3, 5, 10, 50, 100, 200, 201, 300 | **無** | 有平段 `637-1159`（各 frame 逐段一致） |

**臨界點就在 frame 2**，與根因推導一致（frame 0／1 走 prelude 分支，用絕對座標，不受影響）。

**負向對照**：修正前的同一支掃描在 frame 2 以後全部量不到平段 —— 掃描本身有鑑別力，不是「怎麼量都說有」。

**INI_VAL 鑑別力**（Bruce 的設定，frame 201）：修正後 `INI_VAL=1 → 567-1088`（521px 平段）、`INI_VAL=0/2/3 → 1085-1088`（4px 窄脈衝）。修正**前** `INI_VAL=1` 畫出來是 `1085-1088`，與 `INI_VAL=0` 完全相同 —— 這就是「設 0 跟設 1 沒有變化」的直接根因。

**未波及其他通道**：同一份設定、同一個視野，把整片波形區（1343×901）在新舊版各存一張 PNG 逐像素比對，差異 bbox 只有 `(567, 182, 1086, 213)` —— 就是 XSTB 那一列被補回來的平段與它的兩條邊沿，共 1094 個像素。其餘所有數位／類比通道**逐像素相同**。

**`wfgCalcGpio` 一個字都沒動**：v3.20.4 的三條規格掃描（128000 組）與計算層輸出不受本次改動影響。

---

## TCON 波形模擬與取樣 (wfg) v3.20.4 — 2026-08-19 ｜ PATCH ｜ ⚠ 輸出變更

**F_ST_SEL 勾選時，Line 0 的起始準位現在一定等於 INI_VAL；F_DLY 跨行時 falling 不再被整批丟掉。** 依 Bruce 2026-08-19 口述規格（與 v3.20.2／v3.20.3 同一份，那兩版做的是「未勾選」那半邊，這版補「勾選」這半邊）。

判定依據：§1 判定表逐欄 ——「操作流程」零改變（沒有新按鈕、沒有入口移動）；「功能增減」不增不減；「既有功能的輸出」屬**修正為原本就該有的行為**，不是主動改設計 → PATCH。逐項判：**R1 適用** → PATCH ＋ `⚠ 輸出變更`（同一組設定在新舊版重跑，跨行 DLY 的波形會不一樣，舊的截圖／基線不能直接沿用）；R2 不適用（不開新波）；R3 不適用（使用者能做的事沒有多一件）；R4 不適用（沒有動任何預設值或起始畫面）。取最高者 → **PATCH**。

### 驗收用的規格（Bruce 口述，機械化成三條）

F_ST_SEL **勾選**時：

1. Line 0 的一開始，準位 = INI_VAL
2. 這個準位一路維持到 ST_LINE，中間不得有任何準位改變
3. ST_LINE 那一行：當下準位若已等於 R_DLY 的目標，R_DLY 不產生改變，要到 F_DLY 才掉；當下若是相反準位，第一個改變才在 R_DLY

掃描 128000 組（ST_LINE 8 值 × R_DLY 10 值 × F_DLY 10 值 × INI_VAL 4 值 × ACT_TYPE/R_PH/F_PH 5 組 × SP_LINE 4 值 × INV 2 值，R_DLY／F_DLY 涵蓋不跨行、剛好一行、跨一行、跨兩行）：**改前 10606 組不符合 → 改後 0 組**。

另計兩類不列入違規：`dly=0` 與切斷點落在同一位置的退化組合 1296 組（脈衝寬度為 0，規格在該點無法同時成立）；`ST_LINE + DLY` 已經跑出 frame 尾端的 4416 組（下一個 frame 的 Line 0 會再切斷一次，兩者直接衝突，Bruce 的規格沒有涵蓋這種設定）。

### 一、F_ST_SEL 的切斷轉態改為一律落（`wfgCalcGpio`）

原本寫成「準位一樣就不用落」：

```js
var _cut0 = (gpio.ini_val === 0) ? 0 : (gpio.ini_val === 1) ? 1 : level;
if (_cut0 !== level) { allTransitions.push(...); }
```

🔴 `level` 追蹤的是**按 line 迴圈跑出來的邏輯準位**，DLY 跨行時它跟畫面上的**時間序**準位會脫節：line L 的 falling 被推到 line L+1，排序後落在 line L+1 的 rising **之後**，於是 `level` 說 1、畫面上其實是 0。拿它當判斷條件就會整筆漏掉切斷點。

實例（VT=24 HT=100，`st=0 rdly=1 fdly=150 ini=1`）：frame 0 結尾 `level` 是 1，畫面上是 0，於是 frame 1 的切斷點沒落，Line 0 起始準位 = 0 ≠ INI_VAL。

改為一律落並打上 `_cut` 標記，排序後把「跟前一筆同準位」的清掉 —— 準位沒變的轉態對畫面沒有作用，留著只會讓脈衝計數多算。🔴 清理**只認 `_cut` 標記**，不可以改用「`dly===0` 且落在 frame 邊界」這種幾何條件去猜：F_DLY 跨行時本來就會有正常轉態剛好落在下一個 frame 開頭，用幾何條件會把它一起清掉、波及未勾選的路徑。

### 二、移除 F_DLY 跨行時的額外抑制（`wfgCalcGpio`）

```js
} else if (fExtraLines >= 1 && fDly > htotal + gpio.r_dly) {
  // F_DLY crossed to next line past next line's R_DLY position — suppress
}
```

本意是「跨到下一行又超過下一行 R_DLY 的位置就別打了」，但**這個條件跟 `line` 無關** —— 一旦成立就是**每一行**的 falling 都被丟掉，訊號拉高之後永遠不會掉，而不是只丟掉邊界那一筆。實測 `st=3 rdly=1 fdly=150`：line 4~8 的 HIGH 佔比 **100%**，移除後回到 **49.25%**（rise@dly1、fall@dly50，後者是上一行 F_DLY 150 = 100+50 折過來的）。這直接牴觸規格第 3 條「到 F_DLY 才會將訊號變為 low」。

### 三、負向對照（沒有這個，上面的「0 組不符合」不構成證據）

| 打斷的修正 | 掃描結果 | 判準 |
|---|---|---|
| 修正一改回「準位一樣就不落」 | **5106 組不符合** | 規格掃描 |
| 把 F_DLY 額外抑制加回來 | **6696 組不符合** | 規格掃描 |
| 拿掉排序後的同準位清理 | 規格掃描 **0 組**（抓不到） | 改用同準位冗餘轉態數：179064 → **251448** |

第三條刻意記下來：清理只影響「有沒有多餘的同準位轉態」，不影響任何時刻的準位，所以規格掃描對它**沒有鑑別力**，必須換一個判準才驗得到。

### 四、未波及 F_ST_SEL 未勾選的路徑

- 未勾選、且 R_DLY／F_DLY 都不跨行的 **20480 組，新舊版輸出逐位元組相同**。
- 未勾選、含跨行的組合有 18936 組不同，全部來自修正二（falling 不再被整批丟掉），已逐例判讀確認是修正而非破壞。
- 一份自寫的「未勾選規格檢查」在修正後數字反而變大（15952 → 18622），追查後確認是**該檢查本身的偽陽性**：它把「F_DLY 跨行後正常落在下一個 frame 開頭的轉態」誤判成「frame 邊界跳變」。這份檢查因此**不採用為回歸證據**，改用上面的逐位元組比對。原始判準未經 Bruce 確認，不具權威性。

### 五、順帶發現但**沒有**改的

rising 的邊界抑制分支把 `rFired = true` 設在 `if/else` 之外（抑制了還是設），與 falling 分支的 `Do NOT set fFired` 不對稱，看起來像 bug。實測把它改成對稱之後，**128000 組輸出逐位元組相同** —— 那是等價改寫、不是修正，因此不納入本次 diff。記在這裡供日後參考。

### 六、對 Bruce 那份 `_02` 設定（34WQHD 144Hz）的影響：無

XSTB 的真實參數（`r_dly=1930 f_dly=2140`，effHtotal=1939）在 ST_LINE 0/1/3/5 × INI_VAL 0/1/2/3 共 16 組下，**新舊版輸出完全相同，而且兩版都已符合上述三條規格**。也就是說這份設定原本就沒有踩到本次修的兩個 bug；`INI_VAL=1/2/3` 時 Line 0 整條 HIGH 是規格要的行為（Line 0 起始即 HIGH，ST_LINE 那行的 R_DLY 不反應，F_DLY 2140 跨行落到 line 1 的 dly 201 才掉），`INI_VAL=0` 時 Line 0 起始為 LOW。本次修好的是其他 10606 組參數組合。

---

## TCON 波形模擬與取樣 (wfg) v3.20.3 — 2026-08-19 ｜ PATCH ｜ ⚠ 輸出變更

**更正 v3.20.2：F_ST_SEL 未勾選時，Line 0 到 ST_LINE 之間要延續前一個 frame 的「產生行為」（照樣逐條打脈衝），不是延續「準位」（一條平線）。** 依 Bruce 2026-08-19 實測後的更正。

判定依據：§1 判定表逐欄 ——「操作流程」零改變；「既有功能的輸出」屬**修正為原本就該有的行為**（v3.20.2 把規格讀錯了）→ PATCH。逐項判：**R1 適用** → PATCH ＋ `⚠ 輸出變更`；R2／R3／R4 不適用。
> **移除 `WFG_FST_SEL_MAX_EXTEND_FRAMES` 為什麼不觸發「移除既有功能 → MAJOR」**：判定表那一欄講的是**使用者會用的功能**。這個常數沒有任何 UI、沒有任何入口，而且移除前後 12 組專用案例**逐位元組相同**（見下方四），使用者不可能察覺。屬內部清理 → PATCH。

取最高者 → **PATCH**，`v3.20.2` → `v3.20.3`。

`⚠ 輸出變更`：**只影響 F_ST_SEL 未勾選的訊號**（未勾選時 Line 0~ST_LINE 之間現在會出現脈衝）。勾選的訊號逐位元不變。

### 一、v3.20.2 錯在哪

v3.20.2 做的是「frame 起始沿用前一 frame 的**結束準位**，到 ST_LINE 才套 INI_VAL」—— Line 0 到 ST_LINE 之間是**一條平的線**。

Bruce 更正（逐字）：

> 「『延續前一個 frame 的行為』，是指前一個 frame 如果每條 line 都打一個 pulse，不勾選時，那在 line 0 到 start line 這段之前（假設有三條 line），也是一樣要每條 line 都打一個 pulse…像是 stop line 是 16383，那明顯這個 frame 沒有打完，要接著繼續打到下一個 frame 的 st line 為止。可是，如果 F_ST_SEL 設 1 的話，那等於在 line 0 就開始切斷。」

**要延續的是「脈衝的產生行為」，不是準位。**

### 二、模型：脈衝跨 frame 連續，F_ST_SEL 決定在哪裡切斷

| | 切斷點 | 切斷前 | 切斷後 |
|---|---|---|---|
| **勾選** | **Line 0** | — | 立刻套 INI_VAL，counter 重設 |
| **不勾選** | **ST_LINE** | Line 0~ST_LINE **前一 frame 的產生行為原封不動繼續跑** | 套 INI_VAL，counter 重設 |

實作上這代表 **phase counter 的狀態（`rCnt` / `fCnt` / `counterActive` / `level`）必須活在 frame 迴圈外面**，未勾選時原封不動帶過 frame 邊界，只在 `line === st_line` 重設。這是本次最需要小心的地方 —— `wfgCalcGpio` 原本是「一個 frame 一輪、每輪重新開始」的結構。

**勾選路徑刻意維持原樣**（Line 0 切斷 ＋ counter 重設），實測逐位元不變。

### 三、驗收 —— 判準是**脈衝**，不是準位

**① 主測**：`act_type=0, r_ph=0, f_ph=0, r_dly=500, f_dly=600`（每條 line 一個 pulse）、`ST_LINE=3`、`SP_LINE=16383`、**不勾選**。列出 frame 1 前 6 條 line 的逐筆轉態（絕對行號，vtotal=1490）：

```
line 1490  rises=1 falls=1   [500:1 600:0]     ← frame 1 的 line 0
line 1491  rises=1 falls=1   [500:1 600:0]     ← line 1
line 1492  rises=1 falls=1   [500:1 600:0]     ← line 2
line 1493  rises=1 falls=1   [500:1 600:0]     ← ST_LINE
line 1494  rises=1 falls=1   [500:1 600:0]
line 1495  rises=1 falls=1   [500:1 600:0]
```
**line 0/1/2 每條各有一個完整 pulse** ✅

**③ 勾選對照**（同參數只差 `f_st_sel`）：
```
line 1490  rises=0 falls=0   []
line 1491  rises=0 falls=0   []
line 1492  rises=0 falls=0   []
line 1493  rises=1 falls=1   [500:1 600:0]     ← ST_LINE 起才有
```
✅ 兩者對照清楚。

**④⑤ Bruce 的兩個勾選例子**：轉態逐位元組與 v3.20.2 **完全相同**（hash 一致）。

**② `SP_LINE=800`（< vtotal）**：line 0/1/2 **沒有** pulse，line 3 起才有。
> 🔴 **這一項與交辦說明裡「應與 16383 一致」不符，理由寫在這裡供覆核。** 我實作的是 Bruce 的規則本身：「延續前一個 frame 的產生行為」。`SP_LINE=800` 時前一個 frame 的脈衝列早在 line 800 就停了，延續過來的自然也是「停著」；而 `16383` 依 Bruce 的話是「明顯這個 frame 沒有打完」，所以要繼續打。兩者相同的是**更新點都在 ST_LINE**，不是脈衝圖形。**若 Bruce 認為兩者連脈衝都該一樣，這裡要再改。**

**④ 回歸**

- **42 組參數矩陣（vs v3.20.2）：32 / 42 逐位元組相同**，改變的 10 組**全部是 `F_ST_SEL 未勾選`**；勾選的 20 組、toggle 的 8 組零差異
- **真實引擎（headless Chrome，同一份設定檔，vs v3.20.2）**：29 支 GPIO 轉態雜湊**全部相同**；**SD1 / CKO1 / Gate / Subpixel 四條類比鏈 precompute 全部相同**（＝SD 綁 XSTB falling edge 的相依鏈）；無 JS error
- **內建 preset**：`WFG_PRESETS` 沒有任何一處寫 `f_st_sel`，`wfgMakeGpio()` 預設 `true` → 本次改動的分支對內建 preset **結構上不可達**

### 四、移除 `WFG_FST_SEL_MAX_EXTEND_FRAMES`（v3.19.1 加的暫定上限）

新模型下每個 frame 的 ST_LINE 都會切斷並重設 counter，脈衝長度天然被「到下一個 ST_LINE 為止」界定，**上限沒有工作可做**。

證據不是推論：把常數與那段後處理**整段拿掉**，用同一組會踩到上限的參數（`act_type=15, r_ph=15, f_ph=0, st_line=1485, sp_line=16383`，上限值 2980）重跑 12 組專用案例 —— **移除前後 12/12 逐位元組相同**，最長 HIGH 為 15 / 1500.05 / 17 行（INI_VAL = 0 / 1 / 2），全部遠低於 2980。上限一次都沒有生效，所以是移除，不是放著。

---

## TCON 波形模擬與取樣 (wfg) v3.20.2 — 2026-08-19 ｜ PATCH ｜ ⚠ 輸出變更

**F_ST_SEL 未勾選時，INI_VAL 改在 ST_LINE 生效；Line 0 到 ST_LINE 之間延續前一個 frame。** 依 Bruce 2026-08-19 的完整口述規格。

判定依據：§1 判定表逐欄 ——「操作流程」零改變；「功能增減」不增不減；「既有功能的輸出」屬**修正為原本就該有的行為**（依硬體實際行為修正模擬器，不是換一套設計）→ PATCH。逐項判：**R1 適用** → PATCH ＋ `⚠ 輸出變更`；R2／R3／R4 不適用。**§2 案例 8（既有計算公式主動改設計 → MAJOR）不適用**：那一條講的是「主動換一套定義、使用者必須重新確認過去的結果」，本次是把模擬器對齊硬體既有行為，而且**勾選路徑一個位元都沒動**（實際設定檔全部是勾選）。取最高者 → **PATCH**，`v3.20.1` → `v3.20.2`。

`⚠ 輸出變更`：**只影響 F_ST_SEL 未勾選的訊號**。勾選的訊號逐位元不變。

### 一、規格（Bruce 2026-08-19 逐字）

> 「勾選的時候，會在一個 frame 最開始的位置，也就是 Line 0 的位置的初始值為 INI_VAL 定義，直到 R_DLY 或 F_DLY 觸發…若 INI_VAL 設定 1 則 Line 0 一開始會是 high，到 R_DLY 時，由於已經是 high 了，所以不會改變，直到 F_DLY 時(600)，才會將訊號變為 low。」
>
> 「若是 F_ST_SEL=0(取消勾選)，則訊號 reset 的位置不是在 line 0，是在 ST_Line 定義的位置才觸發 INI_VAL 設定，而在 ST_Line 之前，Line 0 以後的這段範圍，則是延續前一個 frame 的行為…但若是 SP_Line 沒有超過 V total，那前一個 frame 最後是什麼狀態，一樣會延續到這個 frame 的 ST_Line 才更新」

### 二、🔴「勾選」原本就已經完全符合，這一版沒有動它

用 Bruce 給的兩個例子，直接讀資料層：

| 例子 | 量測點 | 結果 |
|---|---|---|
| `ST_LINE=0, R_DLY=500, F_DLY=600, INI_VAL=1` | Line0 dly 0 / 499 / 501 / 599 / 601 | `1 / 1 / 1 / 1 / 0` ✅ 完全符合（500 時已是 High 所以不變，600 才轉 Low） |
| `ST_LINE=1, R_DLY=500, F_DLY=600, INI_VAL=0` | Line0 dly 0 / 501 / 601，Line1 dly 499 / 501 / 599 / 601 | `0 / 0 / 0`，`0 / 1 / 1 / 0` ✅ 完全符合 |

這與 v3.19.1 的結論一致 —— 勾選一直是對的。

### 三、真正要改的是「不勾選」，而且原本有**兩種**錯法

| SP_LINE | 舊行為 | 規格 |
|---|---|---|
| `>= VTOTAL` | 延續前一 frame，但**整個 frame 都不套 INI_VAL** | 應在 ST_LINE 套 |
| `< VTOTAL` | **在 Line 0 就套 INI_VAL** | 應延續到 ST_LINE 才套 |

修法：
- Frame 起始準位一律 `initLevel = prevFrameEndLevel`（刪掉 `sp_line >= vtotal` 那個分支 —— Bruce 明講兩種情況結果相同）
- 在 `line === st` 設定 counter 的同時，套用 INI_VAL（`0`→Low、`1`→High、`2`/`3`→Keep 不動），擺在 dly 0、R_DLY/F_DLY 之前
- 準位本來就相同時不落轉態，避免產生無作用的同準位空轉態污染脈衝計數
- Frame 0 沒有「前一個 frame」，維持用 INI_VAL 當開機狀態（Bruce 的規格沒有涵蓋 frame 0）

### 四、`WFG_FST_SEL_MAX_EXTEND_FRAMES` 檢討結果：**保留，但只剩三分之一的工作量**

新規則上線後逐一實測（`act_type=15, r_ph=15, f_ph=0, st_line=1485, sp_line=16383, vtotal=1490`）：

| INI_VAL | 新規則之後的最長 HIGH | 誰在界定 |
|---|---|---|
| `0` | **1489.9 行**（原本 2980） | **新規則**，上限用不到 |
| `1` | 仍然無界（ST_LINE 套 INI_VAL=1 → 還是 High） | **只有這個上限** |
| `2` / `3` | 仍然無界（Keep ＝ 不套任何東西） | **只有這個上限** |

所以**不能移除**：它是「未勾選 ＋ INI_VAL 為 1 或 2/3」這兩種情況下唯一的界限。常數的註解已改寫成上表。

### 五、驗收

**A. 參數矩陣（42 組，獨立 Node 測試台，與 HEAD `f7f00bb` 比對）**
**38 / 42 逐位元組相同**。改變的 4 組**全部**是 `F_ST_SEL 未勾選`：

- `E/spshort fst=0 ini=1`：line0 `111111` → `100000`（不再在 Line 0 套 INI_VAL）
- `B/cross fst=0 ini=0`、`C/never fst=0 ini=0`：最長 HIGH `2980` → `1489.948`（新規則自然界定）
- `A/xstb fst=0 ini=1`：轉態數 +19（每個 frame 在 ST_LINE 多一筆 INI_VAL 轉態）

**勾選的 20 組、toggle 的 8 組、真實 CK/VST/XSTB 參數全部零差異。**

**B. 真實引擎（瀏覽器 headless，同一份 `_02` 設定檔，HEAD vs 本版）**
- 29 支 GPIO 的轉態雜湊：**全部相同**（該設定檔的訊號全是勾選）
- **SD1 / CKO1 / Gate / Subpixel 四條類比鏈的 precompute：全部相同** —— 這正是 SD 綁 XSTB falling edge 的相依鏈
- 無 JS error

**C. 不勾選的兩種 SP_LINE 現在結果一致**：`SP_LINE=16383` 與 `SP_LINE=800` 都得到 line0 序列 `10000000`、且 `f1_atSt = 1`（ST_LINE 才套 INI_VAL）✅ 符合 Bruce「一樣會延續到這個 frame 的 ST_Line 才更新」

**D. 內建 preset**：`WFG_PRESETS` 沒有任何一處寫 `f_st_sel`，`wfgMakeGpio()` 預設 `true` → 本次改動的分支對內建 preset **結構上不可達**。

---

## TCON 波形模擬與取樣 (wfg) v3.20.1 — 2026-08-19 ｜ PATCH ｜ ⚠ 輸出變更

**修好「toggle 任一數位訊號的 ENABLE 之後，CKO1~8 有一段變成上下兩條平行線」。** Bruce 2026-08-19 提供重現手法。

判定依據：§1 判定表逐欄 ——「操作流程」零改變；「功能增減」不增不減；「既有功能的輸出」屬**修正為原本就該有的行為**（同一份設定，toggle 一次 ENABLE 就得到與完整重算不同的波形，這不是任何人設計的）→ PATCH。逐項判：**R1 適用** → PATCH ＋ `⚠ 輸出變更`；R2／R3／R4 皆不適用。取最高者 → **PATCH**，`v3.20.0` → `v3.20.1`。

`⚠ 輸出變更`：只影響「**改過任一數位訊號的 ENABLE 或 waveform_type 之後**」的 LS（CKO／Gate）波形。沒做過那個操作的畫面完全不變。

### 一、🔴 這**不是**繪圖問題，是資料問題

接手時的假設（我與交辦端都傾向）是「資料應該沒錯，只是繪圖在這個條件下出問題」。**實測推翻。**

用 Bruce 的手法（載入設定檔 → toggle XSTB 的 ENABLE 一次），直接讀 `_wfgPrecomputed[CKO2].events`：

| | events 筆數 | 完全重複的筆數 | 陣列升序 | 繪圖吃到的取樣數 |
|---|---|---|---|---|
| toggle 前 | 4050 | **0** | ✅ | 34490 |
| toggle 後 | 4778 | **573** | ❌（接縫處 1 個逆序） | **64792** |
| 完整重算（對照組） | 4050 | 0 | ✅ | 34490 |

重複的定義是**同 lineX ＋ 同 vTarget ＋ 同 reset flag**，重複區間 lineX **12153.86 ~ 15129.86**，寬度恰為一個 `effVtotal`（1490）。八條 CKO 全中（572~574 筆），而且**不會自己恢復**。

來源 CK（CPV2）的 transition 在同一區間是 **390 筆，前後完全相同** —— 上游資料沒動，是 LS precompute 自己多算了一份。

畫面上的「上下兩條平行線」只是忠實反映這件事：同一條 line 上有兩份重複的充放電事件，每個 pixel column 因此同時出現 VGH 與 VGL。

### 二、根因（三處合起來才成立）

1. **`_wfgLsBuildCpvPairEvents()`（`wfg.html:20340-20342`）刻意把視窗前後各撐開 `pad = max(effVtotal, 100)` 行**
   ```js
   var pad = Math.max(effVtotal, 100);
   var extStart = Math.max(0, viewStartLine - pad);
   var extEnd = viewEndLine + pad;
   ```
   round-robin 狀態與跨界脈衝需要，所以它**回傳的範圍必然大於呼叫端要求的**。

2. **`_wfgExtendLsPrecomp()`（`wfg.html:3606-3612`）把那份含 padding 的結果整包 `push` 進既有陣列**，完全沒有去掉重疊區。

3. **`trimToStart` 這個參數只有 gate slot 會被理會** —— `_wfgLsBuildEvents()`（`wfg.html:20049-20051`）只在 `isGate` 時才呼叫 `_wfgLsApplyGateMask(events, ac, effVtotal, trimToStart ? startLine : 0)`。一般 CKO 傳了 `true` 也是**靜默忽略**。

原本 3603-3605 的註解寫著「gate slot 會 trim 回 oldExtent，所以 no event is emitted twice」—— **那句話只對 gate 成立**，卻被當成整支函式的保證。

**為什麼只有中間一段 x 受影響**：重複只落在 `[oldExtent − pad, oldExtent]` 這一條 1490 行寬的帶裡；這一帶以外沒有重複，所以左右兩側正常。Bruce 的視窗（13211~13642）整段落在帶內，於是整個可視範圍都是雙份事件。

**為什麼非得 toggle ENABLE 才會觸發**：`wfgOnGpioChange` 把 `enable` 歸類為 structural（`wfg.html:24517`）→ 走 `wfgInvalidateCache()` 清掉整個 `_wfgPrecomputed` → 重建一份較小 extent 的 precomp → 之後的 render 需要更大範圍就走 `_wfgExtendLsPrecomp` → 重複。**單純縮放或平移不會清 precomp**，所以先前 924 組 zoom×pan 掃描一次都掃不到 —— 觸發條件是一個操作事件，不是視窗位置。

### 三、修法

`_wfgExtendLsPrecomp` 只收「比陣列中最後一筆更晚」的事件：

```js
var _lastX = events.length ? events[events.length - 1].lineX : -Infinity;
for (var ne = 0; ne < newEvents.length; ne++) {
  var _nev = newEvents[ne];
  if (!(_nev.lineX > _lastX)) continue;   // 重疊區：已經在陣列裡
  events.push(_nev); _lastX = _nev.lineX;
}
```

既有陣列由同一支產生器算出、已完整涵蓋到 `lastX`，所以任何 `lineX <= lastX` 的新事件必然是重複。這一條**同時**解決「重複」與「升序被破壞」（下面 `settled[]` 的迴圈用 `while (events[ei].lineX <= line)` 往前走，是吃升序的）。

沒有去改 `pad`：那個 padding 是 round-robin 正確性需要的，動它會改到演算法本身。修在消費端才是對的位置。

### 四、驗收

| 情境 | railRun（上下兩條線的最長連續欄數） | 取樣數 | 重複 | 逆序 |
|---|---|---|---|---|
| 基線 | 11 | 34490 | 0 | 0 |
| toggle XSTB ENABLE 後 | **11** | **34490** | **0** | **0** |
| 再 toggle CK1／CK2／STV | **11** | **34490** | **0** | **0** |
| 完整重算對照 | 11 | 34490 | 0 | 0 |

（修正前同一個量測：CKO2 的 railRun = **452**、取樣數 **64792**、重複 **573**、逆序 1。）

- 八條 CKO 全部通過，**其他數位訊號（CK1／CK2／STV）也一併驗過** —— Bruce 說「其他數位信號應該也是」，實測成立且已修好
- toggle 後 events 比基線多 1~2 筆，對應 extent 15132 → 15134 延伸 2 行**確實新增的**事件，這是正確的增量
- 截圖確認（已開圖看過）：toggle 四支數位訊號後，CKO1~8 全是正常方波，無任何平行線
- 無 JS error

---

## TCON 波形模擬與取樣 (wfg) v3.20.0 — 2026-08-19 ｜ MINOR

**「電壓游標」卡片的中心電壓多了 −／+ 兩顆鈕，一按移動半格；固定／自動模式下也能按。** 依 Bruce 2026-08-19 需求與裁示。

判定依據：§1 判定表逐欄 ——「操作流程」原本的輸入框與下拉全在原位，只是多了兩顆鈕（不是 MAJOR 的「按鈕找不到了」）；「功能增減」屬**新增**；「既有功能的輸出」波形數值與 canvas 尺寸零改變。逐項判：**R3 適用** —— 這一版之後使用者確實多能做一件事（不必打字就能調中心電壓，而且**固定／自動模式下原本完全不能調**）→ MINOR；R1／R2／R4 皆不適用。取最高者 → **MINOR**，`v3.19.2` → `v3.20.0`。

> **為什麼不標 `⚠ 輸出變更`**：R1 的範圍定義把「版面／構圖類」納入，判準是「用**截圖／匯出圖片**功能存下來的成果會不會長得不一樣」。本次變的是**右側面板卡片**的版面（多兩顆鈕、中心電壓那一列在窄卡片下折成兩行），而 wfg 的「截圖」功能截的是波形區 canvas —— **canvas 尺寸、可視列數、波形數值一個位元都沒變**，回歸基線不受影響。若日後有人以整頁截圖建立基線，這裡是分界點，故一併寫明供覆核。

### 一、樣式沿用既有慣例，沒有自創

按鈕直接用左側面板那套 `.wfg-slider-btn`（`wfgFrmNoSliderHtml` 用的同一個 class）—— 同樣的邊框、圓角、橘色、hover/active。只在卡片內加一條尺寸修飾（22×22，配合卡片的 10px 字級），**視覺語言完全一致，沒有第二套外觀**。

版面上踩到一個坑並修好：卡片內容區只有 123px 寬，「中心電壓」這個 label 就吃掉約 40px，原本 `width:56px` 的輸入框被 flex 壓到只剩 34px，`5.5` 顯示不完。只加 `flex-wrap` 又會讓斷點落在中間（實測 `−` 留在 label 那一行、輸入框與 `+` 掉到第二行）。最後把三個控制項包成 `.wfg-ovl-step` 一組，擠不下時**整組一起換行**，label 自己佔一行 —— 不刪任何既有文字、不縮字級，窄卡片與寬卡片都成立。

### 二、步進值：半格

`wfgOvlCenterStep(id)` 回傳**半格**：手動模式是 `cfg.vdiv / 2`，固定／自動模式是畫面上實際 V/div 的一半。

為什麼不是固定 0.5V：中心電壓是示波器的垂直位置旋鈕，語意上該以「格」為單位。固定 0.5V 的話，20V/div 要按 40 下才移動一格；整格的話 0.5V/div 又太粗。半格在 0.5~20V/div 全檔位（0.25V ~ 10V）都是**畫面上固定移動半格**，手感一致。

**輸入框的 `step` 屬性取自同一支函式**，所以鍵盤上下鍵與按鈕給出的量必定相同。

### 三、固定／自動模式下按鈕做什麼

🔴 Bruce 裁示這兩個模式下按鈕也要能按。但這兩個模式的軸是**從資料推出來的**，中心不是自由參數 —— 硬移它會讓模式名稱與實際行為不符。所以按下去的語意只能是**接手成手動**，接手時做兩件事讓畫面不跳：

1. **中心沿用當下的中心** → 不會左右跳（與使用者自己從下拉選 V/div 時的處理一致）
2. **V/div 取「還能完整涵蓋目前範圍的最小檔位」** → 原本看得到的東西不會被切掉
   （例：固定模式 −1~12V、8 格 ⇒ 每格 1.625V ⇒ 取 2V/div，跨度 16V ⊇ 13V）

刻意**不**讓 `vdiv` 落在 `WFG_VDIV_STEPS` 以外的自由值：那樣下拉會找不到對應 option 而顯示成第一項「固定（最大範圍）」，畫面說一套、實際做一套。

### 四、驗收

| 起始狀態 | 動作 | 結果 |
|---|---|---|
| 固定（軸 −1~12、step 0.813） | 按 + | → 手動、2V/div、中心 5.5 → **6.5**（＝＋半格 1V）、軸 −1.5~14.5（⊇ 原本的 13V）、輸入框變為可編輯、step 1、下拉顯示「2V/div」 |
| 同上 | 再按 − | 中心回 **5.5** |
| 自動（軸 0~12、step 0.75） | 按 − | → 手動、2V/div、中心 6 → **5**、軸 −3~13 |
| 手動 20V/div（step 10） | 按 + | 中心 7 → **17**，軸整段平移 10V |
| 手動 0.5V/div（step 0.25） | 按 − | 中心 17 → **16.75**，軸整段平移 0.25V |

- 三種模式下按鈕都有反應 ✅
- 鍵盤上下鍵與按鈕步進一致（輸入框 `step` 與按鈕同源）✅
- 固定／自動按下後畫面行為合理：不會沒反應、不會亂掉，原本可見的電壓範圍仍完整涵蓋 ✅
- 無 JS error ✅
- 截圖確認（已開圖看過）：`中心電壓` 一行、`−  [5.5]  +  V` 一行，按鈕為專案既有的橘色樣式，輸入框 60px 完整顯示數值
- 合併群組的軸（v3.19.2 修好的那件事）不受影響：固定模式仍為 −1~12 ✅

---

## TCON 波形模擬與取樣 (wfg) v3.19.2 — 2026-08-19 ｜ PATCH ｜ ⚠ 輸出變更

**修好「兩條類比波形合併顯示時，垂直軸被算成 0~1V、把訊號整條夾到上緣」** —— Bruce 2026-08-18 回報的「Yout 變成 Always High」。

判定依據：§1 判定表逐欄 ——「操作流程」零改變；「功能增減」不增不減；「既有功能的輸出」屬**修正為原本就該有的行為**（0~1V 這個軸是退化 fallback 的產物，不是任何人設計的）→ PATCH。逐項判：**R1 適用** → PATCH ＋ `⚠ 輸出變更`；R2／R3／R4 皆不適用。取最高者 → **PATCH**，`v3.19.1` → `v3.19.2`。

`⚠ 輸出變更`：**只有處於合併群組的類比通道**顯示會變（軸從 0~1V 變成正確範圍，波形因此不再貼在上緣）。非合併通道實測零差異，見下方驗收。

### 一、根因：一個函式，兩種索引空間，無解

`wfgOverlayRange(id, memberChIdx, autoRanges)` 內部兩個分支需要的是**不同的索引空間**：

| 分支 | 讀什麼 | 需要的索引 |
|---|---|---|
| `vMode === 'auto'` | `autoRanges[ci]`（`_wfgLastAutoRanges`） | **visibleChs** 索引 |
| `vMode === 'fixed'` | `wfgChannels[ci]` → `wfgGpios[ch.gpioIdx]` | **wfgChannels** 索引 |

而兩個呼叫端各傳一種：繪製端傳 visibleChs、卡片端傳 wfgChannels。**所以不管誰呼叫，一定有一個分支是錯的 —— 這個函式在那個簽章下無解。**

實測（Bruce 的設定檔，`Vpix_23 + Yout` 群組）：成員的 wfgChannels 索引是 `[22, 23]`，繪製端傳進去的卻是 visibleChs 索引 `[16, 17]`。`wfgChannels[16]` / `[17]` 是 `gpioIdx = -1` 的佔位通道 → `wfgGpios[-1]` 是 undefined → 兩個成員都被 `continue` 跳過 → `vMin` 停在 `Infinity` → 落到退化 fallback `{vMin: 0, vMax: 1}`。

`wfgVoltToY()` 會把 frac 夾在 0~1，於是所有 ≥1V 的取樣點全部貼在上緣 —— Yout 的資料一直都是 0 ~ 12.000 V，一個位元都沒錯，錯的是座標軸。

**第二個症狀（同根因）**：卡片與畫布永遠不同軸。固定模式下卡片印 −1~12V、畫布用 0~1V；自動模式下卡片仍印 −1~12V、畫布用 0~12V —— **連自動模式的卡片數字也是錯的**，只是畫面看起來正常所以沒人發現。

### 二、修法：把「索引」從介面上拿掉

不是去改哪一個呼叫端傳什麼索引（那只是把錯誤搬家），而是讓 `wfgOverlayRange` **只認已解析好的成員物件**：

```js
function wfgOverlayMemberInfo(chIdx)   // → { ch, gpioIdx, gpio, autoRange }
function wfgOverlayMembersInfo(id)     // → 上面那種物件的陣列
function wfgOverlayRange(id, members)  // 🔴 不再接受索引
```

四個呼叫端全部改走它：繪製端（直接把已經蒐集好的 `_gMembers` 傳進去，本來就有 `gpio`，補上 `gpioIdx` 與 `autoRange`）、`wfgOverlayRangeForCh`、`wfgUpdateOverlayCard`、`wfgOvlSetScale`。

**`_wfgLastAutoRanges` 的 key 由 visibleChs 索引改成 `gpioIdx`。** visibleChs 索引會隨「哪些通道可見」浮動，而讀取端（卡片、群組共用軸、游標範圍）手上往往只有 wfgChannels 索引或 gpioIdx —— 兩邊拿不到同一套索引，就是這個 bug 的來源。`gpioIdx` 是唯一在繪製端／卡片端／游標端三邊都拿得到、且不隨可見性改變的鍵；`_wfgVoltCursorPerSlot` 早就是用它當 key，這次與它對齊。寫入端兩處、讀取端（`wfgVoltCursorAllowedRange`）一處同步改。

> 同一個坑的警告其實早就寫在 `wfgUpdateOverlayCard` 裡（「那張表的 key 是 visibleChs 索引，會查到別條通道」），只是 `wfgOverlayRange` 這一支沒被一起修。該處註解已更新。

### 三、驗收

**① 固定（最大範圍）** —— 畫布實際軸 `{vMin: -1, vMax: 12}`（Vpix_23 `[-1,12]` ∪ Yout `[0,12]` 的聯集），**不再是 `[0,1]`**。截圖確認 Yout 在前一個 frame 位於 VCOM 5.00V 之下（負極性）、後一個 frame 位於其上（正極性），兩個極性都看得到。

**② / ③ / ④ 三種模式下卡片與畫布逐項相同**

| 模式 | 畫布實際軸 | 卡片顯示範圍 | 一致 |
|---|---|---|---|
| 固定（最大範圍） | `-1 ~ 12` | `-1 ~ 12` | ✅ |
| 自動（隨視窗） | `0 ~ 12` | `0 ~ 12` | ✅（舊版卡片印 `-1 ~ 12`，與畫布不符） |
| 手動 5V/div | `-14 ~ 26` | `-14 ~ 26`（8 div × 5V） | ✅ 行為不變 |

**⑤ 回歸** —— 4 種檢視位置 × 每個 analog slot 的「顯示範圍」與「游標可移動範圍」，共 **88 項比較**：

- **72 項完全相同**
- 改變的 16 項**全部**是合併群組 g3 的兩個成員（gpio 18 Yout、gpio 28 Vpix_23），正是本次要修的對象
- CKO1~8、Gate 等**非合併通道跨全部 4 種檢視位置零差異**
- 附帶修好的下游症狀：舊版有數筆游標可移動範圍是 `null`（因為 0~1V 的軸與資料範圍完全不相交，等於「不設限」），現在都是真實的資料範圍
- 🔴 比較器負控制通過

**⑥ 已知的行為收斂（非回歸）**：兩條**可見通道指向同一個 gpioIdx** 時，`_wfgLastAutoRanges` 由兩筆變成共用一筆。因為 auto-range 是從該 gpio 的資料＋當下視窗算出來的，同一個 gpio 在同一幀本來就只會有一個值，故無行為差異。

---

## TCON 波形模擬與取樣 (wfg) v3.19.1 — 2026-08-19 ｜ PATCH ｜ ⚠ 輸出變更

**F_ST_SEL 未勾選時，未結束的脈衝不再無限延伸下去 —— 總長上限為 `2 × VTOTAL`（暫定規格）。** 依 Bruce 2026-08-19 口述規格。

判定依據：§1 判定表逐欄 ——「操作流程」零改變（沒有新按鈕、沒有控制項移位）；「功能增減」不增不減；「既有功能的輸出」屬**修正為原本就該有的行為**（脈衝一路撐過 19 個 frame 不是任何人要的結果）→ PATCH。逐項判：**R1 適用** → PATCH ＋ `⚠ 輸出變更`；**R2 不適用**（續 3.x，未開新波）；**R3 不適用**（使用者能做的事沒有多一件）；**R4 不適用**（沒有改任何預設值或起始畫面）。取最高者 → **PATCH**，`v3.19.0` → `v3.19.1`。

`⚠ 輸出變更` 的理由（R1 範圍定義的「數值類」＋「同一操作序列得到不同結果」）：**只有 F_ST_SEL 未勾選、且脈衝本來就會跨過 2 個 frame 的設定**，波形數值會變。實測受影響與不受影響的分界見下方第三節。

### 一、規格從哪裡來

🔴 **規格來源只有 Bruce 本人（2026-08-19 口述）**，逐字：

> 「F_ST_SEL 如果是打勾的話…它的確就是要去參考 INI_VAL 的設定」
> 「不打勾的話，是上一個 frame 的信號如果有超過一個 frame，它會繼續延伸下去」
> 「先把它當作延伸一個 frame 來處理：雖然我設定 Stop Line 是 16383，假設一個 frame 是 1500 條 line，超過 1500 條到下一個 frame，兩個 frame 最多就是 3000 條 line，它就不會超過 3000 條。先用這個邏輯試做下去，我後面還會再更正不打勾的行為。」

⛔ **原始碼註解與 `wfg-guide.html` 的舊說法不採信**：兩者同源、都是本專案自己寫的，而且已被證實與事實不符 —— 瑞鼎原廠文件全文檢索（涵蓋 `~/TCON`）中，`F_ST_SEL` 只以暫存器名稱出現在三份 ROM code 匯出表，**沒有任何定義文字**。舊註解寫的「改變 F_PH / F_DLY 的參考基準」查無依據，本次一併刪除並改寫成上面的定義。

### 二、🔴 先講一件與預期不符的事：「打勾」原本就是對的

接手時的前提是「打勾 ＋ INI_VAL=0 時每個 frame 的 line 0 是 HIGH，這就是要修的 bug」。**實測不成立。**

以 Bruce 提供的設定檔（XSTB：`ini_val=0`、`f_st_sel=true`、`r_dly=1930`、`f_dly=2140`、`htotal=3878`、引擎 `effHtotal=1939`）直接呼叫資料層 `wfgCalcGpio()` 讀回準位：

| F_ST_SEL | INI_VAL | frame 0~5 的 line 0 準位 | 規格 A 期望 | 結果 |
|---|---|---|---|---|
| 勾選 | 0 | `000000` | 全 Low | ✅ 已符合 |
| 勾選 | 1 | `111111` | 全 High | ✅ 已符合 |
| 勾選 | 2 / 3 | `011111` | frame 0 → 0，其後沿用上一 frame 結束準位（=1） | ✅ 已符合 |

再把設定檔裡**所有** 18 支已啟用的數位 GPIO 掃過一遍（xstb / vst1 / ck1~ck4 / sd1 / cko1~8 / gate / subpixel），**沒有任何一支違反規格 A**。

因此本版**沒有改動勾選時的行為**，一個位元都沒動；只把註解改寫成正確的定義。**「打勾要修」這個前提不成立，照實記錄。**

### 三、真正壞掉的是「不打勾」：完全沒有上限

用能讓 counter 在 frame 內永遠到不了 `ACT_TYPE` 的參數（`act_type=15, r_ph=15, f_ph=0, st_line=1485, sp_line=16383`，`vtotal=1490`、20 個 frame）實測，改動前：

| 情境 | 最長 HIGH 段（line） | 上限 `2 × vtotal` = 2980 |
|---|---|---|
| 不勾選 ＋ INI_VAL=0 | **28314.9** | 超標 9.5 倍 |
| 不勾選 ＋ INI_VAL=1 | **29800**（＝整段資料，永不下降） | 超標 10 倍 |
| 不勾選 ＋ INI_VAL=2/3 | **28314.9** | 超標 9.5 倍 |

改動後全部收斂到 **恰好 2980**。

### 四、暫定值放在哪裡

```js
const WFG_FST_SEL_MAX_EXTEND_FRAMES = 1;   // wfg.html
```

上限 = `(N + 1) × vtotal`，N=1 即 `2 × vtotal`，與 Bruce 舉的 1500 / 3000 例子相符。**要改行為就改這一個常數**，`2 * vtotal` 這個數字不出現在其他任何地方。

🔴 **這是暫定規格。** Bruce 明確表示「不打勾的行為我這邊還要再查一下」「我後面還會再更正」，收到更正後預期只需要改這個常數或它旁邊那一段。

### 五、刻意**沒有**做的事（留待裁示）

1. **勾選時同樣可以無限延伸** —— 實測勾選 ＋ INI_VAL=1 的最長 HIGH 也是 29800 行。Bruce 的規格只講「不打勾」的上限，對勾選時的脈衝長度沒有下過任何規格，**故不套用**，留著等裁示。
2. **不打勾時的 frame 起始準位邏輯未動** —— `sp_line >= vtotal` 那個分支仍在。Bruce 說「不打勾的行為我這邊還要再查一下」，本次只加上限，不重寫起始準位。
3. **frame 起始轉態仍為「準位有變才落一筆」** —— 前提說這與「無條件」不符，實測：該條件只跳過**準位相同的冗餘轉態**，line 0 的準位本身無條件就是 INI_VAL（見第二節數據）。若改成無條件落筆，`sd1`／`cko1~8`／`gate`／`subpixel` 的轉態數會從 1 筆變成 20 筆全是同準位的空轉態 —— 對準位零幫助，卻會讓下游的脈衝計數等統計失真。**故維持原樣。**

### 六、驗收（判準是行為，不是 code 改了）

**A. 參數矩陣（42 組，獨立 Node 測試台直接跑 `wfgCalcGpio`，前後比對）**

- **34 / 42 組轉態序列雜湊逐位元組相同**
- 改變的 8 組**全部**是 `F_ST_SEL 未勾選` ＋ 脈衝本來就超過 2 個 frame 的合成案例；最長 HIGH 一律由 28311.9 / 29800 收到 **2980**
- `F_ST_SEL 勾選` 的 20 組、`toggle` 的 8 組、真實 CK／VST／XSTB 參數的 4 組 —— **全部零差異**

**B. 真實設定檔回歸（瀏覽器，同一份 `_02` 設定檔，HEAD `dbcfa3e` vs 本版）**

- 29 支 GPIO 的轉態序列雜湊：**全部相同**
- SD1 / CKO1 / Gate / Subpixel 四條類比鏈的 precompute（`computedExtent`／`settled` 長度／`events` 長度／取樣雜湊）：**全部相同**
- 🔴 比較器負控制：注入一筆假雜湊 → 正好被抓到 1 筆，證明比較器有鑑別力

**C. 內建 preset**

`WFG_PRESETS` 區塊內**沒有任何一處寫 `f_st_sel`**，而 `wfgMakeGpio()` 的預設值是 `f_st_sel: true` —— 新增的上限只在 `!gpio.f_st_sel` 時才進得去，**對內建 preset 在結構上不可達**。這是機械性的論證，比抽樣比對更強。

**D. 視覺**

同一組合成參數、同一個視窗（全部 20 個 frame）下的 XSTB 波形：改動前是一條上升後**永不下降**的直線；改動後成為規律方波，每段 HIGH 恰為 2 個 frame。兩張圖都已開圖確認。

---

## TCON 波形模擬與取樣 (wfg) v3.19.0 — 2026-08-18 ｜ MINOR ｜ ⚠ 輸出變更

**Gate-LCD／Subpixel-LCD 兩個面板通道的名稱改為「前綴 ＋ 自動數字」，數字一律由程式維護、永遠跟著 Gate 條數連動**（依 Bruce 2026-08-18 需求）。

判定依據：§1 判定表逐欄 ——「操作流程」控制項零移位（同一個名稱欄、同一個信號下拉），「功能增減」屬**新增**（自訂前綴現在也會連動，原本只有 `G<n>`／`Vpix_<n>` 會）；**R1 不適用**（這不是修 bug —— 舊行為在原始碼裡有明文註解宣告是刻意設計：「a name the user typed themselves is left alone」，本次是主動改設計）；**R2 不適用**（續 3.x，未開新波）；**R3 適用** —— 這一版之後使用者確實多能做一件事（自己取的名字也能跟著 Gate 條數走）→ MINOR；**R4 適用** —— 改的是「名稱欄預設值」這個起始狀態，而既有操作沒有任何一項失效或移位 → MINOR。逐項判、取最高者 → **MINOR**，`v3.18.0` → `v3.19.0`。

> 🔴 **MAJOR 的取捨（依 §1 R2 補充第 3 點寫明供覆核）**：判定表 MAJOR 欄有「既有功能的輸出 → **主動改變**（設計上決定不一樣）」，本次字面上確實是主動改設計。判為**不**落在 MAJOR 的理由：該欄在 §0 界定的「輸出」是「算出來的數字、畫出來的波形、存出來的檔案」，而本次**波形數值、計算結果、匯出檔 schema 與位元組內容全部未變**，變的只有兩個面板通道的**標籤文字**會被補上數字 —— 這更貼近 R4 規範的「預設值改變、既有操作不受影響」。使用者原本會的操作（在名稱欄打字、用下拉選信號）全在原位、照樣能做，不需要重新學。依「不確定一律往低編、編低了下次可補」編為 MINOR；**若覆核後認為應為 MAJOR，請 Bruce 裁示，屆時以新的更正 commit 處理，不改寫歷史。**

`⚠ 輸出變更` 的理由（依 R1 的範圍定義「同一操作序列得到不同結果」）：同一份設定檔，在舊版與本版載入後，Gate／Subpixel 通道在**波形區左側的 label 文字可能不同**（自訂名會被接上 Gate 條數）。拿舊版截圖建立的基線在這兩列上會有差異，波形本身則逐位元不變。

### 一、原本為什麼不連動

`wfgUpdateGateChannelName()` 的連動條件是 `/^G\d+$/`、`wfgUpdateSpxChannelName()` 是 `WFG_SPX_NAME_RE`。這是一道「這個名字看起來還是自動產生的嗎」的白名單：符合才改名，否則視為使用者自訂、完全不動。

實測後果就是 Bruce 回報的現象：**`G1` 會連動，`G_1` 不會** —— 只差一個底線，就從「自動產生」掉出白名單，Gate 條數再怎麼改，名稱都凍結在當初那個數字。Subpixel 端同一個寫法、同一個問題。而使用者打 `G_1` 的本意通常只是想換個寫法，不是想凍結數字。

### 二、新規則：名稱 ＝ 前綴 ＋ 自動數字

不再判斷「像不像自動產生的」，改成**數字永遠由程式維護**：使用者輸入什麼，就把它**結尾的連續數字**剝掉當前綴，再接上目前的 Gate 條數。

| 使用者輸入 | 取得前綴 | 顯示（Gate 條數 ＝ 123） |
|---|---|---|
| `G_5` | `G_` | `G_123` |
| `MyGate` | `MyGate` | `MyGate123` |
| （清空） | 回預設 | `G123`／`Vpix_123` |
| `SPX1`（v3.9.0 舊格式） | 正規化為 `Vpix_` | `Vpix_123` |

另外兩條，對應 Bruce 需求的第 1、2 點：**輸出通道的信號下拉選到 Gate-LCD／Subpixel-LCD 時，名稱自動套回該類型的預設**（`G<n>`／`Vpix_<n>`），不沿用這個通道槽先前掛別的信號時的名字。

實作上**不新增任何欄位**：名稱本身就是「前綴＋數字」，前綴隨時可反推，所以 autosave 與匯出檔的 schema 一個位元都沒動，舊檔載入後自動落入新規則。

### 三、兩個刻意保留的邊界

- **只剝結尾的連續數字**，中間的數字保留。已知副作用：在這兩個面板通道上把名稱打成 `RM8100`，會被理解成前綴 `RM` ＋ 數字，顯示成 `RM<Gate 條數>`。這是規則的直接推論，不是 bug；**其他通道不受影響**（打 `RM8100` 就是 `RM8100`）。
- **只作用在 Gate-LCD 與 Subpixel-LCD 這兩個面板虛擬 slot**。CKO、SD1、一般數位 GPIO 的命名行為與 v3.18.0 完全相同。

### 四、為什麼不會把正在打字的欄位洗掉

名稱欄掛的是 `onchange`（blur／Enter 才觸發），不是 `oninput` —— 邊打字邊改寫會讓人根本打不完。實測連打 `G_5`、`MyGate`、`TEST99`，過程中欄位內容與游標位置都沒有被動過。這一點寫進了原始碼註解，避免日後被順手改成 `oninput`。

### 五、驗收（全部在 Chrome 以真實鍵盤／滑鼠事件操作 `http://127.0.0.1:8899/wfg.html`）

| # | 操作 | 結果 |
|---|---|---|
| 1 | ch14 信號下拉選到 `GATE — LCD`（typeahead 按 `g`） | 名稱由「通道 14」自動變 `G123` ✅ |
| 2 | ch15 信號下拉選到 `SUBPIXEL — LCD` | 名稱由「通道 15」自動變 `Vpix_123` ✅ |
| 3 | Gate 通道名稱欄打 `G_5` → Tab | 顯示 `G_1`（當時 Gate 條數 ＝ 1）✅ |
| 4 | 接著把 Gate 條數改 1 → 7 → 123 | 名稱依序 `G_7`、`G_123`；Subpixel 同步 `Vpix_7`、`Vpix_123` ✅ |
| 5 | 名稱欄打 `MyGate` → Enter | `MyGate7`；再改 Gate 條數 → `MyGate123` ✅ |
| 6 | 名稱欄清空 → Tab | 回 `G123` ✅ |
| 7 | 波形區左側 label | 每一步都與通道卡片同步（`G_1`／`G_7`／`MyGate123`／`Vpix_123`）✅ |
| 8 | 連續輸入 | 打字過程中欄位值與游標位置未被改寫 ✅ |
| 9 | **回歸**：ch0（XSTB，非面板通道）改名 `TEST99` | 原樣保留 `TEST99`，數字沒被剝掉 ✅ |
| 10 | **回歸**：ch13／ch14 掛 `SD1 — SD` | 名稱維持「通道 13」「通道 14」，未被改寫 ✅ |
| 11 | **舊檔匯入**：一份把 Gate 通道名改成 `MyGate`（v3.17.5 風格自訂名）、Subpixel 改成 `SPX1`（v3.9.0 舊格式）、`gate_line=55` 的設定檔，走 `wfgImportConfig()` | `MyGate` → `MyGate55`、`SPX1` → `Vpix_55`、`TEST99` 不變、Gate 條數正確載入 55、其餘通道的 gpioIdx／可見性／波形不變 ✅ |
| 12 | 重新載入頁面（autosave 還原路徑） | 通道名稱與信號指派全部正確還原，console 零錯誤 ✅ |

**已知限制（既有行為，本次未改）**：同一個面板 slot 若被兩個以上輸出通道指到，只有清單中**第一個**會連動 —— `wfgUpdateGateChannelName()` 找到第一筆就 `return`，v3.17.5 以前就是如此。正常使用（一個 slot 對一個通道）不會遇到。

---

## TCON 波形模擬與取樣 (wfg) v3.18.0 — 2026-08-18 ｜ MINOR

Level Shifter 全域設定的「驅動模式」新增第四個選項 **四進多出 (Quad-CPV)**（依 Bruce 2026-08-18 需求）。來源由二進多出的 CPV1／CPV2 擴為 **CPV1～CPV4**，輸出 CKO 依 **奇偶序分成兩組**：

- **奇數序 CKO（CKO1/3/5/7…）** ← CPV1 充電、CPV2 放電
- **偶數序 CKO（CKO2/4/6/8…）** ← CPV3 充電、CPV4 放電
- 每組內部的控制方式**與二進多出完全相同**，round-robin 只在自己這一組裡循環（8 phase → 每組 4 條）

判定依據：§1 判定表「功能增減 → **新增**獨立功能」列 ＋ §2 案例 1（新增一個完整功能 → MINOR）。R1 不適用（這不是修 bug，且既有模式輸出一位元未變，見下方回歸對照，故**不標** `⚠ 輸出變更`）；R2 不適用（沒有開新波，續 3.x）；R3 適用 —— 使用者確實多了一件能做的事（多一個驅動模式可選）→ MINOR；R4 不適用（驅動模式的預設值仍是「一進一出」，起始畫面未變）。逐項判、取最高者 → **MINOR**，`v3.17.5` → `v3.18.0`。不觸發 MAJOR，因此不需要 `MAJOR 核准：`：既有三個模式的入口全部在原位、沒有任何功能被移除、既有波形數值未變。

### 一、關鍵作法：不複製時序邏輯，改成共用同一支函式

需求寫的是「每組內部的控制方式跟二進多出一樣」。若照字面複製一份二進多出的時序程式碼再改參數，兩份會各自演化、日後修了一邊漏另一邊 —— 這種「一樣」只在寫下的當天成立。

因此把原本 `_wfgLsBuildDualCpvEvents()` 的**完整內容原封不動**抽成 `_wfgLsBuildCpvPairEvents(chargeSrc, dischargeSrc, posInGroup, groupSize, …)`，只把「用哪兩個 CPV」「這條 CKO 在組內排第幾／組內共幾條」變成參數：

| 模式 | 呼叫方式 |
|---|---|
| 二進多出 | 整組 N 條共用一對 → `(CPV1, CPV2, ckoIndex, N)` 呼叫 **1 次** |
| 四進多出 | 拆兩組 → 奇數組 `(CPV1, CPV2, i>>1, N/2)`、偶數組 `(CPV3, CPV4, i>>1, N/2)` |

「控制方式一樣」因此不是靠人工同步兩份程式碼維持，而是**物理上就是同一段程式碼**。

### 二、四個 CPV 來源都由使用者自己選

CPV3／CPV4 的資料欄位（`cpv3_ck_idx` / `cpv4_ck_idx`）與 UI 下拉選單，**完全比照現有 CPV1／CPV2 的作法**（同樣從數位信號 CK1～CK8 選）。奇數組沿用 `cpv1_ck_idx` / `cpv2_ck_idx` 同一組欄位 ⇒ 二進／四進兩種模式互切時，奇數組的設定不會遺失。

**觸發邊沿維持「整體一個」**（沿用同一個 `cpv_trig_edge` 欄位），與二進多出的既有作法一致，不替四個來源各做一個。

若某一組的來源指到沒有訊號的 CK，該組的 CKO 就**乾淨地不產生任何充電事件**（維持在 VGL 平線），不報錯、也不影響另一組 —— 實測見下方驗收表。

### 三、phase 數只會是偶數，因此不做奇數防呆

`WFG_LS_GOA_PHASES = [4, 6, 8, 10, 12, 14, 16]`，GOA Phase 下拉選單就是照這個陣列生的，**選不到奇數**。兩組必定等長 `numCko / 2`。曾一度為「萬一是奇數」加了 `ceil`／`floor` 分岔，經 Bruce 指正後移除 —— 不存在的情境不該留分支，多餘的程式碼本身就是負債。

### 四、驗收

測試條件：`FHD 60Hz Single Gate(LS：Dual CPV)` preset ＋ CK1～CK4 全部啟用，四條的 `st_line` 互相錯開（3／5／4／6）—— 刻意讓四個來源的邊沿位置各不相同，**若分組接錯，邊沿位置就會對不上**。

**預期值的來源**：由 `wfgCalcGpio()`（GPIO 時序引擎，與 LS 事件產生器沒有共用任何一行程式碼）取出 CPV 來源的原始轉態，在外部自行推算 round-robin 該打到哪一條 CKO。**不拿被測的函式自己算預期再跟自己比對。**

| # | 項目 | 結果 |
|---|---|---|
| 1 | 8 phase／下降沿：CKO1～CKO8 逐條核對充放電時刻 | **8/8 相符**（筆數與每一個時刻皆相同） |
| 2 | 6 phase／12 phase（規則一般化） | **6/6、12/12 相符** |
| 3 | 上升沿觸發：8／6／12 phase | **8/8、6/6、12/12 相符** |
| 4 | 鑑別力反例：假設 CKO2 由 CPV1 驅動 | **不相符**（正確假設 CPV3 相符）→ 這個檢查抓得到接錯 |
| 5 | 鑑別力反例：假設 CKO2 走二進多出式的全組 N=8 循環 | **不相符** |
| 6 | 偶數組來源指到停用的 CK（來源沒訊號） | 偶數組充電事件歸零（VGL 平線）、**奇數組逐項完全不受影響**、console 無錯誤 |

**回歸（既有模式的輸出必須一位元未變）**：把改動前的 `v3.17.5` 與本版並排跑同一組設定，逐一比對每條 CKO 的事件數與充放電時刻。

| 模式 | phase | 結果 |
|---|---|---|
| 一進一出 | 4／6／8／12 | 4 組**完全相同** |
| 一進多出 | 4／6／8／12 | 4 組**完全相同** |
| 二進多出 | 4／6／8／12 | 4 組**完全相同** |
| 二進多出 × 上升／下降沿 | 6／8 | 4 組**完全相同** |

共 16 組快照，`v3.17.5` 與 `v3.18.0` **雜湊與長度全部一致**。

**向下相容（硬性要求）**：用改動前的 `v3.17.5` 匯出一份設定檔（該檔的 `lsGlobal` **確實沒有** `cpv3_ck_idx` / `cpv4_ck_idx`），分別匯入新舊兩版，逐項比對：

| 觀察項 | v3.17.5 匯入 | v3.18.0 匯入 |
|---|---|---|
| 匯入回傳值 | `true` | `true` |
| 通道數 | 24 | 24 |
| 每條通道的 `gpioIdx` | — | **逐條相同** |
| GPIO 集合 | 27 | 27 |
| 每個 GPIO 的 `enable`／起始準位／轉態數／前 120 行準位字串 | — | **全部相同** |
| CKO 波形快照 | — | **相同** |
| `lsGlobal` 既有欄位 | — | **全部相同**（只多出 `cpv3_ck_idx` / `cpv4_ck_idx` 落回預設） |

**載入完整性**：頁面重新載入後 console **零錯誤、零警告**（並先以刻意產生的 `console.error` 確認過這個檢查抓得到錯誤，不是「怎樣都不會叫」）。畫面上未翻譯的 i18n key 洩漏數 **0**；新增的 6 個 key 三語（`zh-TW` / `en` / `zh-CN`）皆齊全。

### 五、順手補的相依關係

`_wfgBuildAnalogDeps()` 原本只登記 `cpv1_ck_idx` / `cpv2_ck_idx`。若不一併登記 CPV3／CPV4，改那兩條 CK 的 timing 不會讓 LS 失效重算，偶數組會停在舊波形 —— 是會靜默發生、畫面上看不出來的那種錯。另在切換 CPV 來源時清掉 `_wfgAnalogDeps` 快取，讓相依表跟著重建。

---

## TCON 波形模擬與取樣 (wfg) v3.17.5 — 2026-08-18 ｜ PATCH ｜ ⚠ 輸出變更

修 Bruce 2026-08-18 回報的 bug：**匯入設定檔後 SD1 一直顯示不出來**。通道列上「SD1 — SD」選好了、眼睛是開的，波形區卻連一條 label 都不會出現。

判定依據：§2 案例 2（改一個 bug → PATCH）＋ R1（修正後輸出會變 → 加 `⚠ 輸出變更`）。R2 不適用（沒有開新波）；R3 不適用 —— 使用者能做的事**一件都沒有多**，「選了 SD1 就看得到 SD1」本來就該成立，這是壞掉不是缺功能；R4 不適用（沒有改任何預設值或起始畫面）。逐項判、取最高者 → **PATCH**，`v3.17.4` → `v3.17.5`。不觸發 MAJOR，因此不需要 `MAJOR 核准：`：沒有任何入口移動或消失，沒有既有功能被移除，既有波形的數值一位元未變。

### 一、根因：`enable` 是繪製閘門，虛擬類比 slot 卻沒有 `ENABLE` 開關

三段程式各自都說得通，湊在一起就出現一個使用者救不回來的死角：

| # | 位置 | 內容 |
|---|---|---|
| ① | `wfgMakeGpio()` | **所有** GPIO 的初始值是 `enable: false`，SD1（slot 18）也不例外 |
| ② | `wfgRenderGpioList()` | 虛擬類比信號卡片**刻意不畫 ENABLE 勾選框** —— 原註解寫著「Virtual analog slots: no ENABLE checkbox (**always active**)」 |
| ③ | `wfgRender()` 的可見通道蒐集 ／ `wfgRenderLabels()` 的 `visMap` | 判斷是 `if (_gp.waveform_type && !_gp.enable) continue;` —— **整條通道連 label 一起跳過** |

②假設虛擬類比 slot 恆為啟用，③卻拿 `enable` 當閘門。只要 SD1 的 `enable` 落在 `false`，使用者在 UI 上**沒有任何辦法把它打開**。

**為什麼偏偏是 SD1**：`wfgLsRebuildCkoSlots(enableSlots)` 會統一設定 `cko1~ckoN` / `gate` / `subpixel` 的 `enable`，**但它從不碰 slot 18**（該函式的註解就是「Preserves SD1 at index 18」）。於是同一份設定檔裡會出現這種不對稱：

```
slot 18 sd1       enable=false   ← 沒人管它
slot 19~22 cko1~4 enable=true    ← wfgLsRebuildCkoSlots() 設的
slot 23 gate      enable=true
slot 24 subpixel  enable=true
```

`wfgApplyPreset()` 另外有一段補救（「Enable virtual analog GPIOs (SD1, CKO1~CKOn) when loading a preset — they default to enable:false」），所以**載過 preset 的人碰不到這個 bug**；從空白狀態自己設定、或匯入一份 `sd1.enable:false` 的設定檔，就會踩到。

### 二、改了什麼

兩處，都在 `wfg.html`：

1. **`wfgOnChannelChange()` 的 `gpioIdx` 分支** — 使用者從通道下拉選單指派虛擬類比 slot 時，一併 `enable = true` 並 `wfgInvalidateCache()`（`enable` 屬結構性改動，比照 `wfgOnGpioChange()` 的 `isStructural` 分支）。這與 console API `wfgEnableSourceDriver()` 早就有的 `g.enable = true; // ensure visible in transition cache` 是同一個理由，只是 UI 路徑漏了。
2. **`wfgImportConfig()` 在 `wfgLsSyncChannels()` 之後** — 補上 preset 路徑早就有的那段補救。**只補「有可見通道指向它」的 slot**：使用者要隱藏某條波形，表達方式是通道的眼睛圖示（`channel.visible`），不是這個沒有 UI 入口的 `enable` 旗標，所以不會把使用者刻意隱藏的東西打開；沒有通道指向的 slot 一律不碰。autosave 自動還原（`wfgAutoRestore` → `wfgImportConfig`）走同一條路徑，一併受惠。

繪製端的 `waveform_type && !enable → continue` **兩處都維持原樣不動**：那個閘門對 CKO 有實質作用 —— 開頁時 `wfgLsRebuildCkoSlots(false)` 讓 CKO slot 停用，而 `wfgLsSyncChannels()` 又會自動把 CKO 指派到空通道，靠的正是這道閘門擋住不畫。把它拿掉會讓空白狀態一開頁就冒出一排 CKO 波形。

### 三、`⚠ 輸出變更` 的範圍（給回歸流程界定用）

**同一份設定檔、同一組操作，新版會比舊版多畫出一條 SD1 波形。** 依 R1 的範圍定義，這同時屬於「版面／構圖類」（可視列數 +1、波形區捲動內容變長、截圖構圖改變）與「同一操作序列得到不同結果」（舊結果是 bug 產物，但拿舊版建立的基線一樣會失效）。

- 受影響的條件：設定檔裡 `sd1.enable === false`，且有一個 `visible` 的通道指向 slot 18。
- **不受影響**：載 preset 的路徑（本來就會被 `wfgApplyPreset()` 補成 `enable:true`）；SD1 以外的通道；所有波形的數值本身。
- 🔴 **`<canvas>` 元素的 `height` 兩版皆為 1042，沒有改變** —— 它由容器高度決定、不隨列數變，多出來的列是靠波形區捲動容納的。構圖差異來自列的內容與捲動長度，不是畫布尺寸。（這一條是實測結果，推翻了本條目初稿裡「canvas 總高改變」的推測。）

**A/B 實測**（同一台機器、同一份設定檔 `wfg-config-20260818(EM01_B19_34WQHD_HSR_144Hz).txt`，舊版取自 `git show HEAD:wfg.html`）：

| 路徑 | 觀察項 | v3.17.4 | v3.17.5 |
|---|---|---|---|
| 匯入設定檔 | `gpios[18].enable` | `false` | **`true`** |
| 匯入設定檔 | 波形區 label 數 | 11（SD1 缺席） | **12**（多出「通道 13」＝SD1） |
| 下拉選單選「SD1 — SD」 | `gpios[18].enable` | `false` | **`true`** |
| 下拉選單選「SD1 — SD」 | 波形區 label 數 | 11 → **11**（選了也沒反應） | 11 → **12** |

兩條路徑在舊版都停在 `channels[13] = {gpioIdx:18, visible:true}` 而 `enable:false` —— 通道設定完全正確，就是畫不出來，正是回報的現象。

**回歸比對**：原有 11 條通道的**名稱、順序、`gpioIdx`、`initLevel`、`transCount` 逐項完全相同**（`wfgDebugPulses()`，XSTB 127／XPOL 2／STV 2／CPV1 46／CPV2 42 兩版一致）。註：`wfgDebugPulses()` 走的是數位 transition cache，類比通道的 `transCount` 恆為 0 —— 這個指標對 CKO／Gate／Subpixel **不具鑑別力**，那幾條的無回歸另以波形截圖目視確認。

---

## TCON 波形模擬與取樣 (wfg) v3.17.4 — 2026-08-16 ｜ PATCH ｜ ⚠ 輸出變更

依 Bruce 2026-08-16 裁示（轉述，非原文）：**極性面積閃爍的頻率上限由每秒 32 次改為 24 次。**

判定依據：§1 判定表「既有功能的輸出」列 ＋ §2 案例 3（微調一側）。**直接沿用 v3.17.2 ① 與 v3.16.0 ① 的先例** —— 那兩版分別把「4→8 Hz、工作比 3:1→1:1」與「固定 8 Hz → 隨不對稱程度 1～32 Hz」判為 PATCH ＋ R1 標記，本版改的是同一個維度、幅度更小。R2／R3／R4 逐項不適用：沒有開新波、使用者能做的事一件都沒多（沒有新增任何控制項）、沒有改變任何起始狀態或預設值。取最高者 → **PATCH**，`v3.17.3` → `v3.17.4`。不觸發 MAJOR，因此不需要 `MAJOR 核准：`：沒有任何入口移動或消失，波形數值、面積、`grayPos`／`grayNeg`、匯出檔案一位元未變。

### 一、為什麼是 24

上限的瓶頸不是程式，是顯示更新率。每個相位的長度是 `1000 / (2f)` ms，比顯示器的一格還短就撐不住：**60Hz ⇒ 一格 16.67ms ⇒ 每秒最多 30 次來回**。24 在這條線下留了一格餘裕（每相位 20.83ms）。

本版在**同一台機器、同一份腳本、rAF 實測皆為 60.0～60.1 fps** 的條件下，直接 A/B 兩個版本的 `d = 1`：

| 版本 | 上限設定 | 畫面實際來回/秒 | 比值 |
|---|---|---|---|
| v3.17.3 | 32 | 27.531 | **0.860** |
| **v3.17.4** | **24** | **23.922** | **0.997** |

（v3.17.2 的〈上限 32 的實測極限〉那張表是當時單獨量的設定值掃描，本版改以跨版本 A/B 重量一次，結論一致。）

### 二、整條曲線

```
f = 1 + 23d      Hz      （原 f = 1 + 31d）
```

🔴 **兩條曲線都只從 `WFG_FLICK_FREQ_MIN_HZ` / `WFG_FLICK_FREQ_MAX_HZ` 推導**（`wfgFlickFreqAt()`：linear 為 `lo + (hi-lo)*d`，geometric 為 `lo * (hi/lo)^d`），程式裡沒有任何地方另外寫死 23／24／31／32。本次只改了那一個常數，其餘是註解同步。

全檔掃過殘留的 `31`／`32`：`wfg.html` 內僅剩三處，都是**刻意保留的歷史對照**（說明 32 為什麼對不上）。`common/i18n.js`、`wfg-guide.html`、UI 文字都沒有寫死頻率數字，因此三語文案不需要改。CHANGELOG 的 v3.17.2 條目維持原狀 —— 它描述的是 v3.17.2 當時的行為，改它等於改寫歷史。

### 三、`⚠ 輸出變更` 的範圍（給回歸流程界定用）

1. **只有相位的時間分佈改變**：週期由 `1000 / (1 + 31d)` 變成 `1000 / (1 + 23d)` ms。要取穩定畫面一律用 `window.wfgFlickForcePhase(0)`。
2. **靜態畫面一位元未變** —— 本版與 v3.17.3 的三張關鍵截圖 sha256 完全相同：

   | 情境 | sha256（v3.17.3 ＝ v3.17.4） |
   |---|---|
   | 停用 VCOM | `e4095cf1…d5dc` |
   | 完全對稱（不畫底色） | `dcd9a28b…5f9d` |
   | 不對稱 base 相位 | `3322537d…8afb` |

### 四、驗證

headless Chrome 1600×2400、`file://`、截圖一律不設 `captureBeyondViewport`（它會觸發 ResizeObserver 把凍結的相位解凍）。每張 clip 都先開圖目視確認畫面上真的有 Vpix 波形，才比雜湊。

| # | 項目 | 結果 |
|---|---|---|
| 1 | 頻率曲線（6 個 d，設定 vs rAF 實測） | d=0 → 1／1.000；0.05 → 2.15／0.987；0.25 → 6.75／0.997；0.5 → 12.5／0.9995；0.75 → 18.25／0.997；**d=1 → 24／0.9968**。全部在 fps ≥ 59.8 下量到 |
| 2 | 上下對稱 | `gray = 127.5±k`，k ＝ 1.5／10／40／80／127.5，`hzUp` 與 `hzDown` **逐位元相同**；兩端 `gray = 0` 與 `255` 都恰好是 24 |
| 3 | d=0 不畫底色 | `fillCount = 0`，且與「面積底色關閉」的截圖 **sha256 相同** |
| 4 | 遲滯仍在 | 平衡點附近以 0.01V 步進上下各穿一次共 50 點，`latched` 觸發 9 次；最小偏離 0.0611 灰階 |
| 5 | 停用 VCOM 與 v3.17.3 相同 | ✅ 見上表 |
| 6 | `getImageData` | 全程 **0 次**（主 canvas 與離屏皆無） |
| 7 | JS 錯誤 | 0 |

🔴 **負向對照（必須不同，兩項皆成立）**：同一組 clip 下，不對稱時「有底色」與「無底色」的 sha256 **不同**；同一相位凍結下 flash 與 base 的 sha256 **不同**。若這兩項相同，就代表整組截圖比對沒有鑑別力，第 3、5 項的「相同」也就不能採信。

🔴 **量測工具自身修正兩次（記錄下來避免再犯）**：
1. 第一版查詢目標頻率時沒有先清掉 `wfgSetFlickTestFreq` 的覆蓋值。`wfgFlickFreqAt()` 第一行就是 `if (_wfgFlickFreqOverride > 0) return _wfgFlickFreqOverride;`，於是六個 d 全部量到 1 Hz、ratio 全是 0.999「通過」—— **一個永遠通過的檢查**。修法：每次查詢前先 `wfgSetFlickTestFreq(0)`，並加一道「六個目標頻率必須彼此不同」的稽核。
2. 第一版找 d=0 工作點時用 (hi−lo)/60 ≈ 0.08V 的粗步進，最小只到偏離 6.24 灰階，離 `TOL_IN` 0.5 還很遠 —— 找不到 `isMid` 的點，遲滯也全程沒觸發，看起來像功能不見了。修法：在粗掃的最小 d 附近改用輸入框最小步進 0.01V 細掃。
3. 另有一次是環境而非工具：主機 load average 16～52 時 headless Chrome 掉到 47 fps，24 Hz 需要 fps ≥ 48 才畫得出來，量到 ratio 0.670。已加 fps 閘門，重試到 fps 回到 60 才採計，並把每次嘗試都記在結果裡。

---

## TCON 波形模擬與取樣 (wfg) v3.17.3 — 2026-08-16 ｜ PATCH ｜ ⚠ 輸出變更

Bruce 2026-08-16 回報（以下為轉述，非原文）：在波形區上下拖曳 VCOM 的白色虛線時，左側卡片的 VCOM 數值不會跟著變，兩邊沒有同步。

判定依據：§1 判定表「既有功能的輸出：修正為原本就該有的行為」＋ §2 案例 2（改一個 bug）→ **PATCH**；依 R1「同一操作序列得到不同結果」加 `⚠ 輸出變更`（範圍見下）。R2／R3／R4 逐項對照皆不適用：沒有開新波、沒有新增任何使用者能做的事（拖曳同步本來就是既有設計的一部分）、沒有改變任何起始狀態或預設值。取最高者 → PATCH。

### 一、觸發條件（原回報沒有寫，是實測補出來的）

**先用左側輸入框設過 VCOM，再去拖白線** —— 這是最自然的操作順序，也是唯一會壞的順序。沒有碰過輸入框就直接拖，三者一直是同步的。

### 二、根因

`wfgRenderVcomRow()` 有一道「正在編輯的欄位不覆寫」保護（v3.13.0 起，與 `wfgRenderTftRow` / `wfgRenderFtRow` 同一原則）：

```js
if (el && document.activeElement !== el) el.value = wfgFmtV(wfgVcomEffective());
```

v3.16.0 加入白線拖曳時，`wfgVcomDragToVoltage()` 呼叫它並在註解裡寫「欄位沒有焦點，不會被那道保護擋住」。**那個假設是錯的**：`<canvas>` 沒有 `tabindex`，**點它不會讓輸入框失焦**。使用者只要在拖曳前碰過那個輸入框，`document.activeElement` 就一直是它，於是整段拖曳的回寫全部被擋掉 —— 白線在動、波形區上的 `VCOM x.xx V` 標籤在動，左側數字停在按下滑鼠前的舊值。

🔴 **這不是 v3.17.2 造成的回歸。** 用同一支腳本、同一組參數對 v3.17.1（commit `df4d7bb`）的 `wfg.html` 實測，desync 完全一樣會出現。先前判為 v3.17.2 回歸，是因為當時的自動化測試從來沒有讓輸入框取得焦點，而那正是唯一的觸發條件 —— 通過的是一個不具鑑別力的檢查。依程式碼推算，此缺陷自 **v3.16.0**（白線可拖曳）就存在，v3.17.0 的標籤命中區沿用同一條路徑，同樣受影響。

### 三、修法

`wfgRenderVcomRow(force)` 增加一個參數，`force` 為真時略過該保護；只有兩支**來源是滑鼠而非鍵盤**的呼叫端傳 true：

| 呼叫端 | 傳 force | 理由 |
|---|---|---|
| `wfgVcomDragToVoltage()` | ✅ | 拖曳中，值由滑鼠決定，欄位裡的字已經過期 |
| `wfgVcomEnsureVisible()` | ✅ | 只掛在拖曳結束的校正，來源同樣是滑鼠 |
| 其餘 6 處（初始化、切換 preset、匯入、i18n 重繪…） | ❌ | 行為與 v3.17.2 完全相同，一個位元都沒動 |

觸控端（`touchmove`）走的是同一支 `wfgVcomDragToVoltage()`，一併修好，不另寫一份。

🔴 **為什麼不是「在 canvas mousedown 時把輸入框 blur 掉」**：那會影響到畫面上**每一種**互動（平移、縮放、時間游標、V1/V2）與**每一個**卡片欄位，範圍遠大於這次回報的問題；而且會在使用者還在打字時無預警搶走焦點。`force` 參數把改動限制在 VCOM 拖曳這一條路徑上。

### 四、`⚠ 輸出變更` 的範圍（給回歸流程界定用）

1. **只影響 DOM 上那一個 `<input id="wfg-vcom-v">` 的顯示值**，而且只在「輸入框持有焦點 ＋ 正在拖曳白線」這個組合下。
2. **canvas 一位元未變**：波形數值、極性面積、`grayPos`／`grayNeg`、閃爍節奏、匯出檔案全部沿用 v3.17.2，本次沒有碰任何繪製路徑。
3. 若有拿 v3.17.2（含以前）建立的**整頁截圖**基線，且該基線的操作序列包含「點過 VCOM 輸入框之後拖白線」，該基線會失效 —— 這是預期內的修正，不是回歸。

### 五、驗證

headless Chrome 1600×2400，`file://`，真實 CDP 滑鼠事件（`mousePressed` → 8 次 `mouseMoved` → `mouseReleased`），不是直接設值 —— 直接設值會整條繞過拖曳路徑，測不到這個 bug。

| # | 條件 | v3.17.1 | v3.17.2 | v3.17.3 |
|---|---|---|---|---|
| A | 不碰輸入框直接拖（**負向對照**） | — | 輸入框 2.49→0.81，同步 | 同步 |
| B | 先點輸入框再拖 | 值 2.49→0.81、線 y 1447.5→1471.5，**輸入框恆為 2.49** | 同上，**恆為 2.49** | 輸入框逐步跟到 0.81 |

A 與 B 在同一版上結論相反 ⇒ 這個量測有鑑別力，不是「怎麼測都通過」。

頁面身分另以獨立檢查坐實（v3.17.2 才有的 `wfgDumpFlickFreq` / `wfgSetFlickTestFreq` / `wfgSetPolAreaFillEnabled` 在 v3.17.1 的頁面上皆為 `undefined`）—— 沒有這一步的話，載到錯的檔案也會照樣「通過」。

三者同步以**實際截圖**確認（白線位置、波形區上的 `VCOM x.xx V` 標籤、左側輸入框），不只看 DOM 屬性。

---

## TCON 波形模擬與取樣 (wfg) v3.17.2 — 2026-08-16 ｜ PATCH ｜ ⚠ 輸出變更

依 Bruce 2026-08-15 指示改兩件事（以下為轉述，非原文）：**① 極性面積的閃爍頻率改為隨不對稱程度變化** —— 越對稱越慢、越偏一邊（偏上偏下皆然）越快，上限為每秒 32 次來回；**② 完全對稱的區間停止閃爍，並且回到波形原本的底色（＝不畫）**，取代 v3.15.0 起的「吸附成不閃的 L127 灰」。

判定依據：§1 判定表與 R1～R4 逐項判、取最高者。

| 項目 | 級別 | 依據 |
|---|---|---|
| ① 閃爍頻率由固定 8 Hz 改為隨不對稱程度 1～32 Hz | PATCH ＋ ⚠ 輸出變更 | **直接沿用 v3.16.0 ① 的判定**：該版把「閃爍頻率 4→8 Hz、工作比 3:1→1:1」判為 §2 案例 3 的微調一側 ＋ R1 標記。本版變的同樣只有相位的時間分佈，靜態畫面的顏色與位置不變 |
| ② 完全對稱時整段不畫底色（原為 L127 灰） | PATCH ＋ ⚠ 輸出變更 | §2 案例 3：既有控制項一個都沒動，使用者不必重新找任何東西。同一組設定的截圖會不一樣 ⇒ 依 R1「版面／構圖類」標記 |
| ③ 相位改為累積式（原為固定週期的 setTimeout 鏈） | PATCH | §1 判定表「內部實作」列：為了讓頻率連續變動時相位不跳拍，畫面行為在頻率固定時與 v3.17.1 相同 |
| ④ 新增六支驗證出口（`wfgDumpFlickFreq` / `wfgFlickFreqOf` / `wfgFlickMeasureRaf` / `wfgSetFlickCurve` / `wfgSetFlickTestFreq` / `wfgSetPolAreaFillEnabled`） | PATCH | §1 判定表「內部實作」列，UI 上不存在。同 v3.17.1 ③ 的先例 |
| ⑤ 註解更新（`WFG_FLICK_PERIOD_MS` 移除後的殘留說明、`3:1`／`62.5ms` 等過期數字） | 不進版 | §3「只改註解」 |

取最高 → **PATCH**，`v3.17.1` → `v3.17.2`。

🔴 **為什麼不是 MINOR（取捨寫明，供覆核）**

R3 的判準是「這一版之後，使用者**能做的事**有沒有多一件」，範例（能存了／有預覽了／能拖曳了）全部是操作。本版沒有新增任何控制項、畫面或操作 —— 使用者能做的事一件都沒多，只是既有閃爍的呈現方式改了。可以主張的是「閃爍快慢多帶了一個資訊」，但那個資訊 v3.14.0 起就能從兩側灰階深淺讀出來，不是新的能力。依 CLAUDE.md「不確定一律往低編」編為 PATCH。

> 落差說明：本版在實作階段先被編為 `v3.18.0`（MINOR），尚未 commit 即依上述逐項判定改為 `v3.17.2`。因為還沒進到 git 歷史，這不是 §5 的版號回溯，不需要 `版號回溯核准：`。若 Bruce 認為①②合起來已達 MINOR，下一版補編即可。

🔴 **為什麼不是 MAJOR**

R2 與 §1 核心問句逐項對照：**操作流程**沒有任何入口移動或消失（VCOM 核取方塊、輸入框、拖線、拖標籤全部照舊）；**要不要重新確認過去的結果** —— 波形數值、面積、`grayPos`／`grayNeg`、匯出檔案**一位元未變**（`wfgPolArea()` 的公式一字未動），變的只有「完全對稱這個特例畫不畫底色」與閃爍節奏。兩個核心問句都是否 ⇒ 不觸發 MAJOR，因此也不需要 `MAJOR 核准：`。

🔴 **`⚠ 輸出變更` 的範圍（給回歸流程界定用）**

1. **相位的時間分佈**：週期不再是固定 125ms，改為 `1000 / (1 + 31d)` ms。要取穩定畫面一律用 `window.wfgFlickForcePhase(0)`。
2. **完全對稱區間的靜態畫面**：`|grayPos − 127.5| < 0.5` 時，v3.15.0～v3.17.1 會蓋一層 alpha 0.55 的 L127 灰，本版**整段不畫**。拿舊版存下的「面積相等」截圖比對會有差異 —— 這是預期內的改變，不是回歸。
3. **其餘情況（`|grayPos − 127.5| ≥ 1.0`）的 base 相位一位元未變**：填色的顏色、路徑、alpha 全部沿用 v3.14.0 的算式。

### 一、頻率映射

```
d = |grayPos − 127.5| / 127.5          ∈ [0, 1]     不對稱程度
f = 1 + 31d                            Hz（每秒來回次數，linear）
週期 = 1000 / f ms，工作比維持 1:1（WFG_FLICK_FLASH_DUTY 0.5 未動）
```

🔴 **中點取 127.5 而不是 127**。本工具的公式讓 `grayPos + grayNeg` 恆等於 255，所以正負面積相等對應的是 127.5。若用 127 當中點，兩端會不對稱：

| 極端 | 中點 127 | 中點 127.5 |
|---|---|---|
| `gray = 255`（全偏一邊） | `d = 1.0079` | `d = 1.0000` |
| `gray = 0`（全偏另一邊） | `d = 1.0000` | `d = 1.0000` |

差 0.79%，直接違反「不管偏上偏下、頻率都要相同」這個硬條件。口述的「127」指的是那一格灰階，實際的對稱中心是 127.5。

慢端 1 Hz 由本次實作訂定：再慢會讓人以為功能沒反應，而「完全對稱」已經改用「不畫底色」表達，不需要再用超慢閃代表。曲線另留 `geometric`（`f = 32^d`）的切換點 `WFG_FLICK_FREQ_CURVE`，預設 `linear`。

### 二、上限 32 的實測極限（待裁示）

以逐幀取樣 `_wfgFlickPhase` 量「畫面**實際**換了幾次」（headless Chrome，量到的 rAF 為 60.0～60.3 fps）：

| 設定 (Hz) | 1 | 8 | 16 | 20 | 24 | 32 | 48 | 64 |
|---|---|---|---|---|---|---|---|---|
| 實測來回/秒 | 0.997 | 7.964 | 15.983 | 19.975 | **23.978** | **26.868** | 11.776 | 8.632 |

24 Hz 仍然吻合，32 Hz 起開始對不上（每個相位只有 15.6ms，撐不滿 60Hz 的一格 16.67ms），48／64 Hz 因混疊反而看起來更慢。**上限維持指定的 32 不動**；若要讓設定值與眼睛看到的一致，24 或 30 是實測站得住腳的選項，等 Bruce 裁示。

### 三、相位累積（不是「時間 mod 週期」）

頻率會隨 VCOM 連續改變。若用 `t mod period` 決定相位，週期一變相位就會瞬間跳到別的位置，看起來像卡頓或漏拍。改為只單向前進的累積器：

```js
_wfgFlickPhaseAcc += dt / period(d);      // dt 實測，不假設 16.67ms
while (_wfgFlickPhaseAcc >= 1) _wfgFlickPhaseAcc -= 1;
phase = (_wfgFlickPhaseAcc < 1 - DUTY) ? 0 : 1;
// 睡到下一個相位邊界，不是睡固定長度
```

`_adv` 夾在 4 以內：分頁凍結後回到前景時，不要一次補上幾百個切換。

### 四、完全對稱 ⇒ 整段跳過填色

```js
var _paAlt = _wfgFlickForceAlt;
if (!_pa.mid && _wfgPolAreaFillEnable) {
  _paFill(...);   // VCOM 之上 ＝ 正極性區
  _paFill(...);   // VCOM 之下 ＝ 負極性區
}
```

🔴 遲滯（`TOL_IN 0.5` 進、`TOL_OUT 1.0` 出）**原封不動**。它存在的理由沒有變，而且改成不畫底色之後抖動的視覺代價更大（整塊出現又消失），更該留。

### 五、驗收（headless Chrome，`--user-data-dir` 為拋棄式暫存 profile）

🔴 **先講前一輪驗證是怎麼假通過的**：前一輪比對的三張截圖**全是空白**，所以「逐位元組相同」毫無意義。根因是 headless 視窗高度不足 —— canvas 高 2219px、Vpix 那一列在頁面 y 1519～1599，視窗開 1600×1400 時整列在視窗外；而該頁是 canvas-wrap 在裁切、不是頁面在捲，捲動也救不了。視窗改開 **1600×2400** 後 Vpix 整列入鏡，比對才有鑑別力。

另外抓到**驗證工具本身**的一個坑：`Page.captureScreenshot` 帶 `captureBeyondViewport` 會暫時改視窗尺寸 → `ResizeObserver` → `wfgRender` → `wfgFlickInvalidate`，**當場毀掉 `wfgFlickForcePhase()` 的凍結**（實測截圖前後 `snapCount` 3→4、`hasSnap` true→false），兩個相位截出來會一模一樣。改為不帶該旗標後，每張截圖前後的 `snapCount`／`phase` 都不變（`disturbed: false`）。

| # | 驗收項 | 結果 |
|---|---|---|
| 1 | `d = 0` 不畫底色，與「填色功能關閉」逐位元組相同 | ✅ 兩張 sha256 皆 `de55595556a66d95…`，且兩張的 `disturbed` 均為 false |
| 2 | 🔴 **負向對照必須不同** | ✅ **不同**。不對稱時填色開 `5de4cf06225a5964…` vs 填色關 `16546e287f229b5a…`。另加一組：flash 相位 `eb61ccb1df0ba6a1…` ≠ base 相位 `5de4cf06225a5964…` |
| 3 | 每張 clip 自行開圖確認 Vpix 在畫面上 | ✅ 逐張看過：base 相位可見 VCOM 上方 L225 淺灰／下方 L30 深灰；flash 相位上黑下白；`d=0` 兩張只有黃色 Vpix 波形與白色 VCOM 虛線、無任何底色 |
| — | 兩條獨立病因的第二條：`fillCount` 是否為 0 | ✅ 已排除。不對稱時 `fillCount = 2`（填色有被呼叫）；`d = 0` 時 `fillCount = 0`（正是本版要的跳過）。前一輪的空白截圖**只源自視窗高度**這一個原因 |
| 4 | 遲滯仍在，中心附近來回微調不抖動 | ✅ 以 0.01V 為步距在中心上下各掃 10 步再原路折返（42 點），`isMid` 只翻 4 次 ＝ 每個方向各一進一出，零抖動。上行在 gray 127.90 進、126.19 出；下行在 127.22 進、128.59 出，遲滯的路徑相依性可見 |
| 5 | 相位連續 | ✅ 在閃爍進行中把頻率連續掃 2→32→2 Hz，共 360 個 tick：`phase === (acc >= 0.5)` **零違反**、累積器**零倒退**、**零跨週期跳躍**；單步前進量 min 0.0116／median 0.4798／max 0.6853（全部 < 1）。另實測真實拖曳白線：hit-test 命中 `ci:'vcom'`、VCOM 確實跟著移動、頻率隨之由 25.29 Hz 升到上限 32 Hz |
| 6 | 效能 | ✅ 移動 VCOM 24 次：median **0.1ms**／max 0.3ms（基準 0.4ms），**貴層重算 0 次、廉價層重算 0 次**。平移／縮放 20 次：median 16.8ms／max 31.5ms，**貴層與廉價層皆 0 次** |
| 7 | 🔴 主 canvas 不得 `getImageData` | ✅ 全程攔截 `CanvasRenderingContext2D.prototype.getImageData`：`wfg-canvas` 上 **0 次**（其他 canvas 也是 0）。快照走離屏 canvas ＋ `drawImage`，未新增任何 readback |
| 8 | 閃爍驗證用 `wfgFlickForcePhase()` 凍結相位 | ✅ 全部截圖前先凍結，並在每張截圖前後各讀一次 `snapCount`／`phase` 證明凍結未被破壞 |

跨 run 可重現：run 2 與 run 3 在相同狀態下算出的 sha256 完全一致（`5de4cf06…`／`de555955…`／`eb61ccb1…`）。

---

## TCON 波形模擬與取樣 (wfg) v3.17.1 — 2026-08-15 ｜ PATCH ｜ ⚠ 輸出變更

兩個 bug（Bruce 2026-08-15）：**③ 手機版最後一個通道下方一大片空白**；**⑤ 看不見的 V1／V2 佔住可抓範圍**。

判定依據：§1 判定表與 R1～R4 逐項判、取最高者。

| 項目 | 級別 | 依據 |
|---|---|---|
| ③ `viewH` 夾住下界，修掉手機版被撐高的 canvas | PATCH ＋ ⚠ 輸出變更 | §2 案例 2「改一個 bug」：canvas 被撐高 569px 是算式吃到不該吃的輸入，回到應有行為。canvas 尺寸屬 R1 的「版面／構圖類」⇒ 標記 |
| ⑤ hit-test 補上 `showCursors`，與繪製端條件一致 | PATCH ＋ ⚠ 輸出變更 | §2 案例 2：繪製不畫、hit-test 卻認，本來就不該這樣。**會移除既有的可抓位置**，同一操作序列結果不同 ⇒ 依 R1 標記 |
| 兩支驗證出口擴充（`wfgDumpCursorGeom` 多回 `showCursors`／`v1On`／`v2On`） | PATCH | §1 判定表「內部實作」列，UI 上不存在 |

取最高 → **PATCH**，`v3.17.0` → `v3.17.1`。
R2 不觸發 MAJOR：沒有任何入口移動或消失，輸入框、拖線、拖標籤的操作全部照舊。⑤ 移除的是**畫面上根本不存在的線**的可抓區，不是既有功能。

🔴 **`⚠ 輸出變更` 的範圍（給回歸流程界定用）**

1. **③**：只影響「捲動過波形區之後又發生 reflow」這一種情境下的 **canvas 高度**。任何 `wrap.top >= 0` 的情境（含全部桌機情境）逐位元組不變 —— 見驗收 3。
2. **⑤**：**canvas 繪製一位元未變**，變的是 hit-test。眼睛關掉的通道上，原本能抓到隱形 V1／V2 的 y 現在抓不到；同一組 y 若壓在 VCOM 上，現在會抓到 VCOM。拿舊版錄的「在某個 y 按下去會拖到誰」不再成立。

### 一、③ 手機版空白

`wfgResizeCanvas()`：

```js
contentH = 軸高 + 各列高度總和 + 10
viewH    = window.innerHeight - wrap.getBoundingClientRect().top - 70
h        = Math.max(300, Math.max(contentH, viewH))
```

`viewH` 這一段的原意是「內容很少時把 canvas 撐到填滿視窗，不要留一塊死白」，**前提是波形區的頂端還在視窗裡**。但這支函式由掛在 wrap 上的 `ResizeObserver` 驅動，執行時機是「任何讓 wrap 尺寸變動的事」，捲動位置完全看當下。

手機版是單欄，波形區被推到頁面 2200px 處，使用者**必須整頁捲動**才看得到；捲過去之後 `wrap.top` 變成大負數，`viewH` 就隨捲動距離線性膨脹，一旦超過 `contentH` 就被 `max()` 選中 —— canvas 被撐高，多出來的高度只畫得出背景格線，沒有任何通道列，而且不會自己復原。

修法：`var canvasTop = Math.max(0, wrap.getBoundingClientRect().top);`
`canvasTop < 0` 代表「已經捲過去了」，此時「填滿視窗」這個意圖本來就不成立。

> 桌機為什麼碰不到：雙欄版面讓 wrap 頂端恆為小正數（實測 71～111），`viewH` 上限約 759，**遠小於 `contentH` 1506**，`max()` 永遠選 `contentH`。這才是「只有手機才有」的完整解釋 —— 不是行動版 CSS，`@media (max-width:480px)` 那幾條只動頁首的 order／flex，沒碰高度。

### 二、⑤ 看不見的 V1／V2 佔住可抓範圍

繪製與 hit-test 的條件從來就不一致：

```
繪製   wfgDrawVoltCursors：  ac.showCursors !== false  → false 就 continue，不畫
hit-test wfgVoltCursorHitTest：只看 wfgVoltCursorOn()（per-slot 的 v1On/v2On），
                              沒有 showCursors 這一關
```

實測 Vpix 這一格：`showCursors: false`、`v1On: true`、`v2On: true` —— 兩者確實各說各話。後果是使用者在**看不見任何線**的地方拿到 `ns-resize`，而且這兩條隱形帶在迴圈順序上位於 VCOM 之前，會把 VCOM 的可抓範圍整段吃掉。

修法：在 hit-test 補同一個判斷。
🔴 **閘門只能加在內層 `ci` 迴圈，不能加在外層 `si` 迴圈** —— 外層 `continue` 會連同下面的 VCOM 判定一起跳過，那一格的 VCOM 就變成完全抓不到。

### 三、驗收

環境：headless Chrome 151／preset `FHD 60Hz Single Gate(LS：Multi CPV)`／Vpix 這一格 slotY 1408、slotH 80、`showCursors: false`；SD1 那一格 slotY 704、`showCursors: true`。
🔴 每個 build 都先 `localStorage.clear()` 再重載 —— 全部走 `file://` 是同一個 origin，`wfgAutoSave()` 會把上一輪的通道可見性與視圖範圍帶進下一輪（第一次比對就是栽在這裡，見驗收 3 的註）。

**1. ③ 手機四步驟表（390×844、dpr 3、`mobile:true`，`mq480` 確認為 `true`）**

| 步驟 | wrapTop | canvasH | 內容底部 | **空白** | viewH（原式） | viewH（夾制後） |
|---|---|---|---|---|---|---|
| 載入 | 2211.6 | 1506 | 1505 | **1** | −1437.6 | −1437.6 |
| 捲過波形區 | −1300.4 | 1506 | 1505 | **1** | 2074.4 | 774 |
| 寬度動 1px（ResizeObserver 觸發） | −1300.4 | **1506** | 1505 | **1** | 2074.4 | 774 |
| 寬度改回 390 | −1300.4 | 1506 | 1505 | **1** | 2074.4 | 774 |
| 捲到頁面最底 | −1305.4 | 1506 | 1505 | **1** | 2079.4 | 774 |

修正前第三列是 `canvasH 2074`、`空白 569`，且不會復原。**現在每一步都是 1。** 截圖確認最後一個通道緊貼 OVERVIEW，中間沒有空白。

**2. ③ 內容很少時仍要撐滿視窗（這是夾制唯一可能誤傷的地方）**

透過通道列上的眼睛（`.wfg-ch-vis`，使用者點的同一個入口）關到只剩 3 條：

| 情境 | wrapTop | 內容底部 | canvasH | viewH |
|---|---|---|---|---|
| 桌機 1400×900，20 條 | 111 | 1505 | 1506（＝contentH） | 719 |
| 桌機 1400×900，**3 條** | 111 | 449 | **719（＝viewH，撐滿）** | 719 |
| 同上，再觸發一次 ResizeObserver | 111 | 449 | **719** | 719 |
| 手機 390×844，3 條 | 2211.6 | 449 | 450（＝contentH） | −1437.6 |

**原意完好**：內容只有 449px 時 canvas 仍被撐到 719 填滿視窗。v3.17.0 跑同一組，四列數字**逐項相同**（`wrap.top` 恆為 111 ≥ 0，夾制取到原值）。

**3. ③⑤ 桌機波形區逐位元組比對**（1400×900 dpr 2、視圖固定 `wfgSetView(0, 40)`、VCOM 關閉、指標停在角落）

```
v3.17.0（HEAD）              sha256 e76b87b91ff946735256420af52417a5de244c16c1dd0ba61c683acf80edb731
v3.17.1（只含 ③）             sha256 e76b87b91ff946735256420af52417a5de244c16c1dd0ba61c683acf80edb731
v3.17.1（含 ③⑤，即本版）      sha256 e76b87b91ff946735256420af52417a5de244c16c1dd0ba61c683acf80edb731
```

**三者完全相同**（139,373 bytes）。截圖走 `Page.captureScreenshot` 的 clip，**不碰主 canvas 的 `getImageData`**。

> 註：第一次比對得到不同的雜湊，diff 覆蓋整個上半部。原因是 `file://` 共用 localStorage，`wfgAutoSave()` 把前一輪的視圖範圍帶進下一輪 —— **與程式改動無關**。固定視圖並清 storage 後三者一致。差異太大不合改動規模時要先查變因，不要當成結論。

**4. ⑤ 逐 y 對照（Vpix 這一格，`showCursors: false`）**

| 掃描條件 | 修前 | 修後 |
|---|---|---|
| x=655（無標籤），VCOM 5.00 | `1426–1436` V1／`1445–1454` VCOM／`1460–1470` V2 | **只剩 `1445–1454` VCOM** |
| x=145（VCOM 標籤欄），VCOM 5.00 | `1426–1436` V1／`1437–1454` VCOM／`1460–1470` V2 | **只剩 `1437–1454` VCOM** |
| x=655，VCOM 停在 **7.47V**（y=1431.5，正好壓在隱形 V1 上） | `1426–1436` V1／`1460–1470` V2 —— **VCOM 一個 y 都抓不到** | **`1427–1436` VCOM** |

**消失的是 `1426–1436` 與 `1460–1470`，共 22 個 y，全部在 Vpix 這一格。** 這些 y 上畫面有沒有線，三份互相獨立的證據：

1. `wfgDumpCursorGeom().slots` 回報該格 `showCursors: false` —— 這是繪製端判定的來源本身
2. `voltLabels` 只有 SD1 那格的兩筆，Vpix 這格**零筆**（有畫線才會有標籤）
3. 截圖（Vpix 整列 clip）：只有黃色波形、白色 VCOM 虛線與灰階面積，**沒有任何青／粉紅虛線**

**第三列是 VCOM 拿回被吃掉的範圍**：VCOM 線 y=1431.5，±5px ⇒ 整數 y 1427–1436 —— 與實測的 `1427–1436` 逐格吻合。修前這 10 個 y 全被隱形 V1 佔走。

**5. ⑤ 實際拖曳（真實 CDP 事件，起點 y=1431，正是被佔走的位置）**

| | 修前 | 修後 |
|---|---|---|
| hover | `ns-resize`（但畫面上沒有線） | `ns-resize` |
| hit-test | `{ci: 0}` ← 隱形 V1 | **`{ci: 'vcom'}`** |
| 按下後抓到 | `ci: 0` | **`ci: 'vcom'`** |
| VCOM 值 | 7.47 → **7.47（不動）** | 7.47 → **5.52** |
| 白線 y | 1431.5 → 1431.5 | 1431.5 → **1445.5** |

**6. ⑤ 游標有顯示的通道必須完全不受影響（SD1，`showCursors: true`）**

掃描 679–809：修前 `[722,732] V1`、`[756,766] V2`；修後 `[722,732] V1`、`[756,766] V2`。**逐 y 相同。**

---

## TCON 波形模擬與取樣 (wfg) v3.17.0 — 2026-08-15 ｜ MINOR

兩件事（Bruce 2026-08-15）：VCOM 卡片的說明文字**已經與程式不符**，要修；白線的**可抓範圍要含標籤**。

判定依據：§1 判定表與 R1～R4 逐項判、取最高者。

| 項目 | 級別 | 依據 |
|---|---|---|
| ① VCOM 卡片說明文字修正（三語） | PATCH | §2 案例 3 的微調一側 —— 純文案，沒有任何行為或輸出改變 |
| ② 滑鼠可從**標籤**抓 VCOM／V1／V2 | PATCH | §2 案例 2「改一個 bug」：使用者瞄準畫面上唯一看得見、寫著數值的那塊東西卻毫無反應，本來就不該是這樣。R1 的「只有互動方式增加、既有輸出不變」在版號級別上不升級 |
| ③ **觸控**可抓 VCOM 標籤 | **MINOR** | **R3**：這一版之後手機／平板使用者**能多做一件事**。v3.16.0 的觸控路徑在 V1／V2 標籤迴圈後直接 `return null`，手機上完全拖不動 VCOM |
| ④ 新增 `window.wfgDumpCursorGeom()` 驗證出口 | PATCH | 內部實作，UI 上不存在、使用者無感（§1 判定表「內部實作」列） |

取最高 → **MINOR**，`v3.16.0` → `v3.17.0`。
R2 不觸發 MAJOR：既有入口一個都沒動，輸入框與「抓線本身拖曳」的操作完全照舊；沒有移除任何功能。

**不標 `⚠ 輸出變更`**：canvas 輸出一位元未變。標籤矩形本來就畫在那個位置，本次只是把**同一組數字**多存一份給 hit-test 用，`fillRect` 的四個引數逐字相同。VCOM 關閉時的波形區截圖與 v3.16.0 **sha256 完全相同**（見驗收 4）。

### 一、說明文字

v3.14.0 起 VCOM 與 Vpix 波形之間的正／負極性面積比會換算成兩側灰階，v3.15.0 又加了面積不等時的閃爍 —— 但卡片說明還停在 v3.13.0 的寫法：

```
舊：它只是一條參考線，不參與任何計算，也不會改變 Vpix 的波形數值。
```

🔴 **前半句已經不成立，後半句仍然成立**，所以兩件事要分開講，不能一起砍掉：VCOM **有**參與計算（面積→灰階→閃爍），但**不改變 Vpix 波形本身的電壓數值**。新文案把這兩件事拆成兩句，並補上「這條線可以直接拖曳」（v3.16.0 加的能力，說明從來沒寫過 —— 可發現性問題正是這次的起因）。

改動處（全檔 grep 過，舊說法歸零）：

| 位置 | 內容 |
|---|---|
| `common/i18n.js` `wfg.vcomDesc` | 繁中／簡中／英文三語同步 |
| `wfg.html` 卡片內的 `data-i18n` 預設文字 | 與 zh-TW 同步（i18n 未載入時的 fallback） |
| `wfg.html` 繪製處註解「而 VCOM 只是一條參考線」 | 同樣過時，一併改掉 |

`wfg-guide.html` 沒有任何 VCOM 段落（grep 0 筆），本次未動說明頁。

### 二、可抓範圍含標籤

**症狀**：標籤畫在線的**上方 13～1px**（`fillRect(drawX0+2, y-13, w+6, 12)`），整塊落在線帶（±5px）之外。使用者的直覺是拖那塊看得見的字，結果毫無反應。V1／V2 的標籤貼在右緣，同一個毛病。

**做法**：命中區 ＝ 原本的線帶（全寬 ±5px）**∪ 標籤矩形**（用畫的當下那組 rect，不另外估）。

🔴 **不把線帶加寬**：實測三條線帶中心只相隔 19.5px 與 21.5px（見驗收 1），要含住標籤得加到 ±13px，相鄰的帶就會重疊，接著就得再發明一套優先序規則。標籤是有明確邊界的小矩形、x 位置固定（VCOM 在左端、V1／V2 在右緣），當成獨立命中區不會動到線帶的判定。

🔴 **標籤的判定放在線帶迴圈之後** —— 線帶永遠贏過標籤，於是 v3.16.0 既有的命中結果**一個都不會改變**：新舊行為是嚴格的包含關係，只在「本來什麼都抓不到」的位置多抓到東西。不需要另立優先序規則，也不可能互搶（驗收 2 逐 y 證明）。標籤之間仍是 V1／V2 先判，理由同 v3.16.0：它們只能靠拖曳，VCOM 另有輸入框可退。

**hover 提示走同一支 `wfgVoltCursorHitTest`**（v3.16.0 的做法，維持），所以 `ns-resize` 的範圍與真正抓得到的範圍必然一致 —— 驗收 1、2 的逐 y 掃描量的就是 `ns-resize`，同一份數據同時驗了兩件事。

**觸控**：v3.16.0 把 VCOM 併進這支 hit-test 時只補了滑鼠路徑，觸控在 V1／V2 標籤迴圈之後直接 `return null` ⇒ 手機上完全拖不動 VCOM。本版把 VCOM 標籤也納入觸控（沿用既有的 12px 放寬），V1／V2 仍先判。

### 三、驗收（全部實測，CDP 真實滑鼠事件）

環境：headless Chrome 151／`Emulation.setDeviceMetricsOverride` 1600×1400 dpr 1／preset `FHD 60Hz Single Gate(LS：Multi CPV)`／VCOM 預設 5.00V／Vpix 這一格 slotY 1408、slotH 80。
對照組 `v3.16.0` 取自 `git show HEAD:wfg.html`，同一個瀏覽器工作階段、同一組座標。

**1. 逐 y 掃描 `ns-resize`（x=655，該欄沒有任何標籤）**

| y 範圍 | 歸屬 | v3.16.0 | v3.17.0 |
|---|---|---|---|
| 1426–1436 | V1 | ✔ | ✔ |
| 1445–1454 | VCOM | ✔ | ✔ |
| 1460–1470 | V2 | ✔ | ✔ |

**兩版逐 y 完全相同**。三條帶中心相隔 19.5px 與 21.5px，帶間空隙 8px 與 5px —— 這就是「不加寬線帶」的理由。

**2. 逐 y 掃描 `ns-resize`（x=145，穿過 VCOM 標籤）**

| y 範圍 | v3.16.0 | v3.17.0 |
|---|---|---|
| 1426–1436 | V1 | V1 |
| **1437–1444** | **無命中** ← 症狀就在這 | **VCOM**（標籤 rect） |
| 1445–1454 | VCOM | VCOM |
| 1460–1470 | V2 | V2 |

新增的只有 1437–1444 這 8 個 y。**V1 的下緣仍停在 1436、V2 的上緣仍是 1460，一格未動。** 標籤區與 V1 帶變成緊鄰（1436／1437），但因為線帶先判，V1 不會被搶走 —— 表中 1426–1436 在新版仍判給 V1 就是證據。

V1／V2 標籤（SD1 那一格、canvas 1016,728）：v3.17.0 `ns-resize` ＋ hit-test 回 `{ci:0, slotIdx:0}`；v3.16.0 該點沒有這個出口可查，但 hit-test 當時只認線帶，該座標離 V1 線超過 5px。

**3. 拖曳（`mousePressed → 10×mouseMoved → mouseReleased`，每次都從 VCOM=5.00 重設起跑）**

| 起點 | 抓到誰 | VCOM 值 | 白線 canvas y | 左側輸入框 |
|---|---|---|---|---|
| **標籤上**（145, 標籤中心） | `ci:'vcom'` | 5.00 → **8.31** | 1449.5 → **1425.5** | `5` → **`8.31`** |
| **線上**（655, 無標籤） | `ci:'vcom'` | 5.00 → **3.28** | 1449.5 → **1461.5** | `5` → **`3.28`** |

三者同步。另在 v3.16.0 對照組跑同一組「線上拖曳」，結果逐項相同（3.28 / 1461.5 / `3.28`）—— 既有路徑沒有被動到。

**4. 不啟用 VCOM 時與 v3.16.0 零差異**

`wfgSetVcomForTest({enable:false})` 後，波形區（clip 1058×1558）截圖：

```
v3.16.0  sha256 ddeb2c4dc4761ed30815138daf408f978a15c802142650d838889a98977fef6e
v3.17.0  sha256 ddeb2c4dc4761ed30815138daf408f978a15c802142650d838889a98977fef6e
```

**完全相同。** 截圖走 `Page.captureScreenshot` 的 clip，**不碰主 canvas 的 `getImageData`**（那會讓 Chrome 永久掉出 GPU 加速，實測 9.3ms→80ms）。比對前先看過畫面確認 16 條通道與波形都在，不是拿空畫面的雜湊當證據。

### 四、順帶發現（本版**未**處理，待裁示）

🔴 **Vpix 這一格的 V1／V2 沒有畫出來，但抓得到。**

驗收 1、2 的三條帶裡，V1 與 V2 那兩條在畫面上**根本不存在** —— Vpix_1 那一列只有黃色波形、白色 VCOM 虛線與灰階底色，沒有任何青／粉紅虛線（截圖可證；`wfgDumpCursorGeom().voltLabels` 也只有 SD1 那一格的兩筆）。

根因是繪製與 hit-test 的條件不一致：

```
繪製  wfgDrawVoltCursors：  ac.showCursors !== false  →  false 就 continue，不畫
hit-test wfgVoltCursorHitTest：只看 wfgVoltCursorOn()（per-slot 的 v1On/v2On），
                              沒有 showCursors 這一關
```

後果是使用者在**看不見任何線**的地方得到 `ns-resize`，而且這兩條隱形帶會**優先於 VCOM**（線帶迴圈的順序），把 VCOM 的可抓範圍從上下各切掉一塊。這是 v3.16.0 之前就存在的舊帳，不是本版造成的。修法是在 hit-test 補上同一個 `showCursors` 判斷 —— 但那會**移除既有的可抓位置**，性質上是行為改變，依規矩先回報不自行處理。

---

## TCON 波形模擬與取樣 (wfg) v3.16.0 — 2026-08-15 ｜ MINOR ｜ ⚠ 輸出變更

兩件事（Bruce 2026-08-15）：閃爍改成**每秒 8 次、兩色各佔一半**；VCOM 白色虛線可以**直接在波形區上拖曳**。

判定依據：R1～R4 逐項判、取最高者。

| 項目 | 級別 | 依據 |
|---|---|---|
| ① 閃爍頻率 4→8 Hz、工作比 3:1→1:1 | PATCH ＋ ⚠ 輸出變更 | §2 案例 3 的微調一側（只改兩個常數）；相位的時間分佈變了 ⇒ 依 R1 標記 |
| ② 波形區直接拖曳 VCOM 白線 | **MINOR** | **R3**：這一版之後使用者**能多做一件事**（原本只能靠左側輸入框的上下鈕）。R1 的「只有互動方式增加、既有輸出不變」不適用於版號級別，只用來判要不要標輸出變更 |
| ③ hover 到可拖曳的水平游標時給 `ns-resize` 提示（V1／V2 一併適用） | PATCH | §2 案例 3 微調 —— 只有滑鼠指標樣式，canvas 輸出一位元未變 |

取最高 → **MINOR**，`v3.15.0` → `v3.16.0`。R2 不觸發 MAJOR：既有入口一個都沒動，輸入框的操作完全照舊。

🔴 **`⚠ 輸出變更` 的範圍（寫清楚讓回歸流程好界定）**：只影響**閃爍相位的時間分佈**（base 由 187.5ms 縮到 62.5ms）。靜態畫面沒有變 —— base 相位的顏色、位置、Vpix 數值與 v3.15.0 逐項相同（見驗收 5）。要取穩定畫面一律用 `window.wfgFlickForcePhase(0)`。

### 一、閃爍參數

```
v3.15.0：每秒 4 次、base:flash = 3:1（週期 250ms ＝ 187.5 ＋ 62.5）
v3.16.0：每秒 8 次、各佔一半    （週期 125ms ＝  62.5 ＋ 62.5）
```

只改 `WFG_FLICK_PERIOD_MS`（250→125）與 `WFG_FLICK_FLASH_DUTY`（0.25→0.5）**兩個數字**，`WFG_FLICK_FLASH_MS` / `WFG_FLICK_BASE_MS` 都是從它們推導的 —— v3.15.0 的常數抽取是乾淨的，這次不需要補刀。

註：flash 的持續時間兩版完全相同（都是 62.5ms），變的是 base 從 187.5 縮到 62.5。

### 二、拖曳 VCOM 白線

**沿用既有的水平游標那一套**（Bruce 明確要求「不要另外寫一份」）：

| 既有機制 | VCOM 怎麼接上去 |
|---|---|
| `wfgVoltCursorHitTest()` | 在 V1／V2 的迴圈**之後**加一段，命中回 `ci: 'vcom'`（字串，與 V1／V2 的數字索引區分） |
| `_wfgVoltCursorDrag` 狀態機 | 原封不動沿用，只是 `ci` 可能是字串 |
| mousemove／touchmove | 開頭多一個 `if (d.ci === 'vcom')` 分派，其餘不動 |
| mouseup／touchend／touchcancel | 完全沿用（另加一次拖曳專屬的可見性校正，見下） |

**hit-test 的判定直接比對 `_wfgVcomLastDraw.y`** —— 那是畫線那一幀實際用的 y，與畫出來的像素同源，不必再換算一次座標（換算兩份就是不同步的開始）。線沒畫出來時 `drawn` 為 false，自然抓不到。

🔴 **重疊時 V1／V2 優先**（所以 VCOM 放在迴圈後面）。依據不是喜好：**V1／V2 只能靠拖曳操作，抓不到就完全動不了；VCOM 另有輸入框（step 0.01）可以精確設定，搶輸了還有退路。** 兩者都搶不到時的損失不對稱。

**夾制**走 `wfgClampVcom()`（與輸入框同一支，內含 `wfgRoundV()` 的小數 2 位 ⇒ 精度與 step 0.01 一致），另外再夾在「四捨五入後仍落在這一格顯示範圍內」的區間。

> 🔴 **這一段是實測踩出來的**：第一版只夾值域，結果拖到底時 `wfgRoundV` 把 0.2540542 捨成 0.25 —— 比 vMin 小，繪製端的 `_vcomV >= vMin` 判定失敗 ⇒ **線直接消失，而線一消失 hit-test 就再也抓不到，只能回去用輸入框救**。所以下界往上取整、上界往下取整。
>
> 再加一道 `wfgVcomEnsureVisible()` 掛在 mouseup／touchend：上面那道夾制用的是**當幀**的 vMin／vMax，而這一格的自動縮放在波形剛算好時會變動（實測 vMin 由 -1 變成 0.254），有機會出現「放開手時線剛好落在新範圍外」。這道校正只掛在拖曳結束，輸入框的行為完全不動。

**即時更新**：拖曳中每次 mousemove 走 `wfgVcomDragToVoltage()` → 白線位置（`wfgRender`）、左側輸入框（`wfgRenderVcomRow`）、讀值框警告（`wfgUpdateVcomReadout`）、面積比／灰階（`wfgPolArea` 的 key 含 VCOM）、閃爍狀態（`wfgFlickInvalidate` 在 render 結尾）全部跟著動。

**hover 提示**走**同一支** `wfgVoltCursorHitTest`，所以提示範圍與真正抓得到的範圍必然一致；座標換算刻意與 mousedown 那段逐字相同（都用 width 推出的 scale），否則提示會與可點區域對不上。V1／V2 一併適用 —— hit-test 是共用的，只讓 VCOM 有提示反而不一致。

### 三、驗收（全部實測）

環境：本機 `python3 -m http.server`／Chrome（macOS）／preset `fhd_60hz_sg`／VCOM 5.5V。

**1. 閃爍 8Hz、1:1**

3.001 秒內 48 次 blit、48 次相位切換 ⇒ **每秒 8.00 個完整週期**。停留時間：base 平均 **63.2ms**、flash 平均 **63.3ms**，**比例 0.956（目標 1.0）**，差距來自 `setTimeout` 的排程精度。

**2. 拖曳白線 —— 四者同步**（🔴 用 CDP 真實滑鼠拖曳）

| | 拖曳前 | 往上拖 20px 後 | 往下拖 37px 後 |
|---|---|---|---|
| VCOM 值 | 5.50 V | **8.14 V** | **2.98 V** |
| 白線 canvas y | 1445.5 | 1426.5（-19px） | 1463.5（+37px） |
| 左側輸入框 | `5.5` | `8.14` | `2.98` |
| 灰階 | 76.05 / 178.95 | 0.03 / 254.97 | 162.58 / 92.42 |
| 貴層面積重算 | — | **0** | **0** |

白線位移與滑鼠位移逐像素相符；輸入框、灰階、閃爍狀態全部跟著動。另附截圖一張，同時拍到左側輸入框 `8.7` 與波形區標籤 `VCOM 8.70V`。

> CDP 的 `left_click_drag` 偶爾不產生中間的 `mousemove`（同樣起點有時成功有時無效），所以邊界與互斥的測試改用完整的 `mousedown → 14×mousemove → mouseup` 事件序列 —— 一樣走完 hit-test／拖曳狀態機／夾制／重繪，不是直接設值。

**3. 拖出範圍 → 停在邊界**

| 操作 | 結果 |
|---|---|
| 往上拖到 `yHigh − 80`（遠超上界） | v = **9.8**（＝ VGMA1）、`drawn` true、輸入框 `9.8` |
| 往下拖到 `yLow + 80`（遠超下界） | v = **0.2**（＝ VGMA14）、`drawn` true、輸入框 `0.2` |

兩次 hit-test 都回 `ci: 'vcom'`。

**4. 不會誤抓 V1／V2（雙向）**

逐 y 掃描 hit-test（x=600，涵蓋整格）：

```
不重疊時： y 1426~1436 → V1(ci 0) ／ y 1441~1450 → VCOM ／ y 1460~1470 → V2(ci 1)
把 V1 拖到 VCOM 線上： y 1441~1451 → 全部 V1(ci 0)   ← 優先序生效，VCOM 讓位
把 V1 移開後：        y 1420~1430 → V1 ／ y 1441~1450 → VCOM ／ y 1460~1470 → V2
接著拖 VCOM：         抓到 ci 'vcom'，5.50 → 7.44 V，輸入框同步 7.44
```

**5. 拖曳效能**

一次 `mousedown` ＋ 60 次 `mousemove`：

| 指標 | 數值 |
|---|---|
| 每次 mousemove 完整耗時（含重繪） | p50 **21.2ms**、p90 29.3 |
| 其中面積廉價層 | p50 **0.4ms**（與 v3.15.0 的 0.4ms 基準相同）、max 2.8 |
| 貴層面積重算 | **0** |
| 快照建立／blit | **0 ／ 0**（拖曳期間閃爍完全不介入） |

對照組（既有的 V1 拖曳，同一組 60 次）：p50 **16.5 / 21.3 / 28.0ms**（三輪）。VCOM 拖曳落在同一區間 —— 這條路徑本來就與 V1／V2 共用同一個 `wfgRender()`，沒有額外成本。

**6. VCOM 未啟用時與 v3.15.0 零差異**（數值級，非畫面雜湊）

基線取自 `git show HEAD:wfg.html`（commit `91b4575` ＝ v3.15.0），同一 server、同一組操作序列：

| | v3.15.0 基線 | v3.16.0 |
|---|---|---|
| `segCount` | 1000 | 1000 |
| `computedExtent` | 1112000 | 1112000 |
| `overallHash`（前 200 段） | **`d7f503de`** | **`d7f503de`** |
| seg0 `hold` ／ `vHash` | 0.28447763003334225 ／ `fe2d1657` | 同 |
| seg2 ／ seg39 `hold` | 7.715492607814049 ／ 0.2845013516493402 | 同 |

非空斷言：`segCount = 1000 ≠ 0`。

### 四、備註

- **i18n** 未改動；**cache buster** `?v=20260815wfg3150` → `?v=20260815wfg3160`。
- **新增驗證用 helper**：`window.wfgDumpVcomDrag()`（目前抓到誰在拖）、`window.wfgVcomHitTestAt(cx, cy)`（對指定 canvas 座標做一次 hit-test，不改狀態）。
- 🔴 主 canvas 一律不得使用 `getImageData`（v3.15.0 的教訓，見該版〈實作〉）；本版新增的程式碼沒有任何 readback。

---

## TCON 波形模擬與取樣 (wfg) v3.15.0 — 2026-08-15 ｜ MINOR ｜ ⚠ 輸出變更

正負極性面積**不相等**時，兩塊色塊會閃爍 —— 模擬 VCOM 沒調準時面板實際會看到的 flicker。相等時兩區都固定在 L127、不閃。

判定依據：R1～R4 逐項判、取最高者。

| 項目 | 級別 | 依據 |
|---|---|---|
| ① 新增極性面積閃爍 | **MINOR** | §2 案例 1「新增一個完整功能」字面適用 —— 多了能看的東西，既有控制項全部在原位，沒有任何入口消失或移位 |
| ② 面積相等時兩區吸附成 L127（v3.14.0 是各自的 127.2／127.8） | PATCH | §2 案例 3 的微調一側；沒有任何操作因此改變 |

取最高 → **MINOR**，`v3.14.0` → `v3.15.0`。R2 不觸發 MAJOR：既有入口一個都沒動，也沒有移除任何功能。

🔴 **為什麼掛 `⚠ 輸出變更`**（依 R1 的範圍定義）：
- **同一操作序列得到不同結果**：VCOM 不平衡時，用「截圖」存下來的成果會落在 base 或 flash 其中一個相位，兩次不必然相同。逐像素的回歸比對必須知道這件事，否則會把預期內的閃爍誤報成回歸。
- **數值／版面類**：相等時的顯示由 127.2／127.8 改為 127／127。
- 回歸流程要取得穩定畫面時，可用 `window.wfgFlickForcePhase(0)` 把畫面凍結在 base 相位。

### 一、規格（Bruce 2026-08-15 逐字，含當日兩次修訂）

```
grey > 127 → 與 L0   交錯，工作比 base : flash = 3 : 1
grey < 127 → 與 L255 交錯，工作比 base : flash = 3 : 1
面積相等   → 兩區都顯示不閃爍的 L127
頻率       → 每秒 4 次
```

**三項由我提案的細節**：

1. **兩區相位 → 同相（同時切換）**。實作上是同一份快照一次貼上，兩區必然同步。取捨：兩區的振幅（base ↔ 極端）本來就一樣大，反相不會多給任何資訊，卻會讓畫面**永遠有一區停在極端值**，看久了容易誤讀成「這一區恆為 L0／L255」。同相則是整塊一起「短促閃一下」，比較接近面板 flicker 的觀感。
2. **週期解讀 → 250ms 一個週期、flash 佔 62.5ms**（照「每秒 4 次閃爍」的字面）。`WFG_FLICK_PERIOD_MS` 與 `WFG_FLICK_FLASH_DUTY` 兩個常數放在一起，覺得太快只要改這一處。
3. **「相等」的容差 → 進入 0.5、離開 1.0（灰階單位），帶遲滯**。
   - 進入 `|gray − 127.5| < 0.5`：四捨五入之後就是 127／128 那一格，**畫面上已經看不出差別**；換算成面積不平衡度是 `|A_pos − A_neg| / (A_pos + A_neg) < 1/255 ≈ 0.39%`。
   - 離開 `> 1.0`（＝ 2 階）。🔴 兩個門檻不同是**刻意的遲滯**：VCOM 停在邊界時，單一門檻會讓畫面在「閃／不閃」之間來回跳，比閃爍本身更擾人。實測死區約 VCOM 4.00 ~ 4.04 V（見驗收 3）。

### 二、實作 —— 🔴 這一版最重要的是一個效能陷阱

**閃爍不能走繪製路徑**：主 canvas 的 `wfgRender()` 開頭就 `fillRect` 塗滿不透明底色，著色又夾在格線與波形線**之間**，所以既不能把著色拆到獨立的 underlay canvas（會被底色蓋掉），疊 overlay 在上面又會蓋住波形線與游標。而每 250ms 觸發一次整張 render 也違反「不可以卡」的指示。

做法：**畫面靜止 150ms 後，對 Vpix 那一格取兩份快照（base／flash），之後閃爍只在兩份之間切換。**
- 快照是真正 render 出來的畫面 ⇒ 視覺完全等價，游標、標籤、疊合群組內的其他通道全部含在裡面。
- 🔴 建快照要多跑一次 render，所以**掛在 debounce 之後**：拖曳／縮放期間每一幀都把快照作廢並重排 debounce ⇒ 那段時間**完全不建快照、不閃爍**，每幀耗時與 v3.14.0 基線相同。

#### 🔴 `getImageData` 會讓 canvas 永久失去 GPU 加速（本版實測踩到）

第一版快照用 `getImageData` ／ `putImageData` 實作，功能完全正確，但拖曳的每幀耗時從 **9.3ms 變成 80ms（慢 8.6 倍）**，而且**關掉閃爍、關掉 VCOM 都不會恢復**。

定位過程（先量再改）：
1. 在繪製路徑三個新增點各埋一支計時器 —— 三者合計 15 次 render 只有 **1.4ms**，回歸不在那裡。
2. 直接做對照實驗：全程停用閃爍，先 bench 四輪（p50 **183.2 / 11.4 / 9.3 / 9.6**），**手動對主 canvas 呼叫一次 `getImageData`**（該次呼叫本身 26.1ms），再 bench 四輪 → p50 **85.6 / 80.1 / 80.1 / 86.6**。

結論：**只要對主 canvas 發生過一次 readback，Chrome 就把該 canvas 由 GPU 加速降級成 software rendering，且不會恢復。** 這與畫什麼、之後有沒有再 readback 都無關。

修正：快照一律走 **離屏 canvas ＋ `drawImage`**（GPU→GPU 的複製，不觸發 readback）。貼回時把主 ctx 的 transform 暫時設回單位矩陣，讓來源與目標都用裝置像素座標。修正後 p50 回到 **8.4 ~ 10ms**。

> 🔴 給後續接手的人：**這個檔案裡的主 canvas 永遠不要用 `getImageData`**。要取畫面內容一律 `drawImage` 到離屏 canvas。像素級驗證腳本也要注意 —— 跑過一次就會讓那個分頁的後續效能量測全部失真（本版的效能數字一度因此差了 9 倍）。

### 三、驗收（全部實測）

環境：本機 `python3 -m http.server`／Chrome（macOS）／preset `fhd_60hz_sg`／VCOM 5.5V（gray 76 ／ 179）。

**1. 兩個相位確實在交替**（截圖 ＋ 像素）

用 `window.wfgFlickForcePhase()` 把畫面凍結在指定相位後截圖，兩張對比明確：base 相位左側負極性區是中亮灰、右側正極性區是較暗的灰；flash 相位左側轉黑、右側轉亮白。像素實測（正極性區 x=700／負極性區 x=180）：

| 區 | base | flash |
|---|---|---|
| 正極性（gray 76 → L255） | `57,59,62` | `155,157,160`（變亮） |
| 負極性（gray 179 → L0） | `113,115,118` | `15,17,20`（變暗） |

兩區**同一次切換同時變**（同相）。整格差異像素 14985 個，涵蓋 54 列、x 110~854。

**2. flash 只佔 1/4 時間**

相位切換時間戳統計（3 秒、24 次切換）：base 停留 **187.5ms**、flash 停留 **62.5ms**，實測比 **2.73**（目標 3.0，差距來自 `setTimeout` 的排程精度）。前景 1.5 秒內 12 次 blit ＝ 每秒 4 個完整週期 ✓

**3. 面積相等 → 兩區都是 L127、停止閃爍（含遲滯）**

| VCOM | 算出的 gray | 顯示 | 閃爍 |
|---|---|---|---|
| 3.98 | 128.248 / 126.752 | 128.2 / 126.8 | 閃 |
| **4.00** | 127.561 / 127.439 | **127 / 127** | 停 |
| **4.005** | 127.218 / 127.782 | **127 / 127** | 停 |
| **4.02** | 126.874 / 128.126 | **127 / 127** | 停 ← 已超過進入門檻 0.5，靠遲滯維持 |
| 4.05 | 125.844 / 129.156 | 125.8 / 129.2 | 閃 ← 超過離開門檻 1.0，解除 |

死區約 40mV，VCOM 的輸入 step 是 0.01V ⇒ 使用者可以穩定停在平衡點，也不會在邊界抖動。

**4. 效能：拖曳耗時與 v3.14.0 基線相同**

同一組操作（連續 `wfgSetView` 平移），同一時段、同一台機器，各跑 6 輪取 p50（ms）：

| 版本 | 第1輪 | 第2輪 | 第3輪 | 第4輪 | 第5輪 | 第6輪 |
|---|---|---|---|---|---|---|
| v3.14.0 基線（`git show HEAD:wfg.html`） | 34.7 | 31.3 | **10.1** | **9.1** | **9.9** | **9.3** |
| v3.15.0 閃爍開啟 | 36.8 | 25.4 | **10.0** | **9.0** | **9.0** | **8.4** |

前兩輪是 JIT 暖機，收斂後兩者落在同一個區間（差異在量測雜訊內）。

**5. 重算行為**

| 操作 | 貴層面積 | 廉價層面積 | 快照 | blit | 每次耗時 |
|---|---|---|---|---|---|
| 縮放 ×16 ＋ 平移 ×10（26 次視窗操作） | **0** | **0** | **0** | **0** | — |
| 連續移動 VCOM ×20 | **0** | 20 | **0** | — | p50 **0.4ms**（max 2.0） |

拖曳期間閃爍完全不介入（快照永遠建不起來）；移動 VCOM 只跑廉價層，貴層一次都沒重算。

**6. 背景分頁停動畫**

用 `visibilitychange` 事件實測：分頁隱藏 **3295ms** 期間 blit **0 次**（若不停會是約 26 次），`running` 由 true 轉 false；切回前景後自動恢復，並先貼回 base 相位再重新起算（避免停在 flash 太久）。

### 四、備註

- **i18n**：本版沒有新增任何 UI 文字，`common/i18n.js` 未改動。
- **cache buster**：`?v=20260815wfg3140` → `?v=20260815wfg3150`（`common/version.js` 有改動）。
- **驗證用 helper**：`window.wfgDumpFlick()`（相位、灰階、週期、快照與 blit 次數、繪製路徑三段的計時）、`wfgFlickPhaseLog()`、`wfgFlickForcePhase(0|1)`、`wfgSetFlickEnabled()`、`wfgFlickProfReset()`。
- **繪製路徑上的三支計時器保留**：每次 render 多 6 次 `performance.now()`（約 0.6μs，相對 9ms 是 0.007%）。留著是因為這一版的回歸就是靠它們在兩分鐘內排除掉「新增邏輯太慢」這個方向的 —— 下次再出現效能問題，同一組數字可以直接讀。
- UI 上**沒有**閃爍開關，跟著「啟用 VCOM 電壓」走（Bruce 未要求開關）。`wfgSetFlickEnabled()` 只給自動化腳本比對用。

---

## TCON 波形模擬與取樣 (wfg) v3.14.0 — 2026-08-15 ｜ MINOR ｜ ⚠ 輸出變更

VCOM 卡片與 Feedthrough 卡片的五項調整（Bruce 2026-08-14／15 交辦）。最主要的是第 5 項：**在 VCOM 虛線與 Vpix 波形之間填上灰階色塊，用顏色深淺表示正／負極性的面積平衡**。

判定依據：R1～R4 逐項判、取最高者。

| 項目 | 級別 | 依據 |
|---|---|---|
| ① Feedthrough 三個 drop 欄位上限 50V → 4V | **PATCH ＋ ⚠ 輸出變更** | 欄位、位置、操作方式全部不變，只有值域縮小。§2 案例 8（主動改設計）不適用 —— 沒有換演算法也沒有換定義，內插公式一行未動。**舊設定裡 >4V 的 drop 會在載入時被 `wfgClampFtDrop()` 夾到 4V，波形跟著變** ⇒ 依 R1 掛 `⚠ 輸出變更` |
| ② 移除 Feedthrough 的「中軌 V-MID」讀值框 | **MINOR**（見下方 🔴 取捨） | §1 判定表「功能增減：**移除**既有功能 → MAJOR」字面可及 |
| ③ VCOM 電壓輸入 step 0.1 → 0.01 | PATCH | §2 案例 3 的微調一側 —— 控制項沒有移位，可輸入的值域完全不變（`wfgRoundV()` 本來就取到小數 2 位） |
| ④ 移除 VCOM 的「VGMA1／VGMA14／實際生效」讀值框 | **MINOR**（同 ②） | 同 ② |
| ⑤ 新增極性面積著色 | **MINOR** | §2 案例 1「新增一個完整功能」字面適用 —— 多了能看的東西，既有控制項全部在原位，沒有任何入口消失或移位 |

取最高 → **MINOR**，`v3.13.0` → `v3.14.0`。

🔴 **② 與 ④ 的取捨（寫明供覆核）**：兩者移除的都是**唯讀的說明框**，不是功能入口 —— 使用者原本會的操作（設 drop 值、設 VCOM 值）一個都沒少，也沒有任何控制項移位。但 §1 判定表「移除既有功能 → MAJOR」照字面是可以套上去的（wfg v3.0.0 那次就是照字面判、不做目的性限縮）。這裡編 MINOR 的依據是 **Bruce 2026-08-15 交辦時明示「預期 v3.14.0」，而 ②④ 兩項移除的內容正是他本人逐項指定的**；依 `CLAUDE.md`「不確定一律往低編、在判定依據寫明取捨供覆核」處理。**若覆核認為應為 MAJOR，請裁示，本條目照更正 commit 補。**

🔴 **為什麼掛 `⚠ 輸出變更`**（依 R1 的範圍定義逐項對照）：
- **數值類**：項目 ① 會讓舊設定的 drop 值被夾，Vpix 的波形數值跟著變。這是實質的數值變更，拿舊版建立的基線會失效。
- **版面／構圖類**：項目 ⑤ 讓 Vpix 那一格多出兩塊灰階填色 —— 用「截圖」功能存下來的成果，同一組設定用新版重跑會長得不一樣。
- **不變的部分**（供回歸流程界定範圍）：**VCOM 未啟用時，Vpix 的預計算結果與 v3.13.0 逐點相同**（見〈驗收〉第 6 項的數值級比對，`overallHash` 兩版同為 `d7f503de`）。

### 一、規格（依 Bruce 2026-08-14／15 逐字指示）

```
① Feedthrough：L0 / L127 / L255 三個 drop 欄位的可輸入範圍改成 0 ~ 4 V
② Feedthrough：「中軌 V-MID」那個文字描述 block 直接拿掉（看不懂）
③ VCOM：電壓輸入 step 改成 0.01 V
④ VCOM：「VGMA1、VGMA14、實際生效」那個說明框拿掉
⑤ VCOM 與 Vpix 之間的面積上色，用來區分正極性區與負極性區
     ・正負面積相等          → 上下都是 L127 灰
     ・VCOM 偏上（正極性區 ΔV 較小）→ 正極性區往 L0 靠、負極性區往 L255 靠
     ・ΔV 越小越接近 L0；越大越接近 L255
   比較方式：平均正極性面積 : 平均負極性面積，取整段波形範圍
     ・前面「還不是穩態」的 frame 全部排除（🔴 不是寫死跳過第一個 ——
       未來可能加 2~3 個拋案 frame，行為與後續重複段不同）
     ・排除後若剩奇數個，再從右邊砍一個湊成偶數
   透明度：固定，L0 與 L255 兩個極端都必須看得到後面的波形
   效能：移動 VCOM 要即時重算；拖曳／縮放要跟以前一樣順
```

### 二、實作

**灰階公式**（🔴 Dispatch 2026-08-14 提案，**尚待 Bruce 確認**）

```
gray_pos = 255 × A_pos / (A_pos + A_neg)
gray_neg = 255 × A_neg / (A_pos + A_neg)
```

相等時兩邊都是 127.5 ≈ L127（吻合「剛好上 127、下 127」）；一邊變小另一邊必然變大，也吻合「越小越接近 L0、越大越接近 L255」。「平均面積」取每 frame 平均，與直接用總和在比值上等價（分母相同），兩者都存下來供覆核。

**面積的定義**：`∫|Vpix(t) − VCOM| dt`，時間單位是 line。資料來源是預計算的 `segs`（段內折線 `v[]`）＋段間 hold 水平線＋feedthrough 的垂直落差 —— 也就是畫面上那條線本身，不是像素。每個線段先按 **frame 邊界**切、再按 **與 VCOM 的交點**切，之後才用梯形公式累加（跨越 VCOM 的線段若不切開，正負會在同一段裡互相抵消）。

**穩態起點的自動偵測**（`_wfgPolAreaBaseCompute`）

極性逐 frame 交替 ⇒ 只有 **N 與 N+2** 可比。從最後往前掃，第一個不吻合的 N 決定起點 = N+1 —— 也就是「它自己與其後**所有**同極性 frame 都吻合」才算穩態；只比一組就判定，會被中間偶然相近的兩個 frame 騙到。

🔴 **特徵用「與 VCOM 無關的波形矩」（m1 = ∫V dt、m2 = ∫V² dt），不用正負面積** —— 面積依賴 VCOM，放在這一層會讓「移動 VCOM」連帶重算穩態判定。用兩個矩而不是一個，是為了不讓「平均值相同但形狀不同」的兩個 frame 被誤判成吻合。

`WFG_POLAREA_STEADY_TOL = 1e-3` 的依據（實測，非拍腦袋）：preset `fhd_60hz_sg` 下，穩態之後同極性 frame 的矩差是浮點級（掃描 32 個 frame，判定起點恆為 2），而 frame 0／1 因 Vpix 由 0V 起充，差異是 10⁻¹ 量級 —— 兩者相差六個數量級以上，門檻落在中間任何一處結論都相同。

🔴 **實測到的關鍵事實**：這個 preset 下**前兩個 frame** 都不是穩態（`steadyFrom = 2`）。若照原本的想法寫死「跳過第一個 frame」，第二個 frame 的暫態就會被算進去 —— 自動偵測不是為了將來，現在就已經需要。

**順序**：先排除前導非穩態 → 剩下的若是奇數再從**右邊**砍一個 → 用剩下的偶數個算。不可顛倒。

**計算範圍**（🔴 **與 Bruce 字面的「整段波形」不同，待裁示**）

Vpix 的預計算是 viewport-lazy 的（`_wfgSpxWantExtent()` 只算到視窗右緣再往外半個視窗），「整段波形」的資料**預設根本不存在**。要照字面做就得把上游 SD1 一路延伸到 `totalLines` —— `frameCount` 上限 4096 時那是 4.6M line 的 per-line 陣列（settled／target／holdV／xstb×3／pol，約 30 bytes/line ≈ **138MB**），與「不可以卡」直接衝突。

改取**固定的前 32 個 frame**（`WFG_POLAREA_MAX_FRAMES`，與視窗無關 ⇒ 拖曳縮放不重算）。在穩態下 Vpix 的週期 ≤ 2 frame，取穩態起點之後任意偶數個 frame 的平均與「整段偶數個 frame 的平均」相同 —— 這一點不是假設，`window.wfgPolAreaMaxFrames` 就是為了能把上限調到涵蓋全部 frame 再比對而開的。

**兩層快取**（🔴 依 Bruce 2026-08-15「移動 VCOM 要馬上重算」＋「不要卡頓」）

| 層 | 內容 | 何時重算 | 實測耗時 |
|---|---|---|---|
| 貴層 `wfgPolAreaBase()` | 獨立的 SD1＋Subpixel 預計算、每 frame 的波形矩、穩態起點、偶數區間 | 只在 Vpix 資料／frame 範圍改變時 | 6.7 ~ 19.6 ms |
| 廉價層 `wfgPolArea()` | 以 VCOM 為分界把已算好的波形切成正／負面積 | **每次移動 VCOM** | p50 **0.2 ms**、max 1.1 ms |

失效走**既有的**精準失效路徑：`_wfgInvalidateSpxOnly()` / `_wfgInvalidateGateOnly()` 各加一行 `_wfgInvalidatePolArea()`，不另建一條粗糙的失效路徑（v3.3.1 的教訓：過度失效 ＝ 卡頓的根因）。🔴 兩層的 key 都刻意**不含** `wfgViewStart`／`wfgViewEnd`。

🔴 **獨立算一份、不碰 `_wfgPrecomputed`** 的兩個理由：① 那份是 viewport-lazy 的，寫進去會讓「VCOM 關閉時零差異」直接破功；② 這一份的範圍固定，才可能做到拖曳不重算。`srcMap` 只塞 SD1，Gate 故意不塞 —— `_wfgPrecomputeSpxChannel()` 取不到就會自己走 `_wfgGateSourceForSpx()` 建一份輕量的（只有 events，不配置那塊 30MB 的大陣列）。

**繪製**（`wfgDrawAnalogChannel` 的 waveform_type 3 分支）

畫在波形 stroke **之前**，所以波形線與 VCOM 虛線都疊在色塊之上、任何灰階下都看得見。封閉路徑 = 波形折線 →（右緣垂直落到 VCOM）→ 沿 VCOM 回左緣 → 閉合；波形在 VCOM 上下來回穿越時這條路徑會自交，各區的繞數是 ±1、都不為 0，用預設的 nonzero 規則填正好涵蓋全部 `|Vpix − VCOM|` 區域，上下兩色再靠 `clip` 分開。

🔴 **透明度固定 `WFG_POLAREA_FILL_ALPHA = 0.55`，不隨灰階變**（Bruce 2026-08-15：「L255 也不要變成全部透明，我還是需要它有透明度」）。拿灰階本身當 alpha 會讓 L0 全透明、L255 全不透明，兩端的語意就壞了 —— 深淺只由**顏色**表現，可見度由這個固定值保證。

### 三、驗收（全部實測，數字如實照抄）

環境：本機 `python3 -m http.server`／Chrome（macOS）／preset `fhd_60hz_sg`（FHD 60Hz Single Gate，LS：Multi CPV，frameCount 1000）。

**1. 四項小改**（DOM 實測 ＋ 截圖）

| 項目 | 實測 |
|---|---|
| ① drop 範圍 | 欄位 `max="4"`、`min="0"`；打 `10` 送出後欄位值變 `4`；提示文字「可輸入範圍：0 ~ 4 V」 |
| ② 中軌 block | `document.getElementById('wfg-ft-readout')` → **null**；截圖確認三個 DROP 欄位下方直接就是「在波形區顯示 SUBPIXEL 波形」 |
| ③ VCOM step | 欄位 `step="0.01"` |
| ④ VCOM 讀值框 | `innerHTML` 為空、`style.display = "none"`；**hint 保留**：「可輸入範圍（VGMA14 ~ VGMA1）：0.2 ~ 9.8 V」 |

**2. 著色實際看得到**：截圖確認 Vpix 那一格 VCOM 虛線上下各有一塊灰，且只填在「VCOM 與波形之間」（波形在 VCOM 之上的 x 範圍，VCOM 下方不著色）。

**3. 正負面積相等 → 上下都接近 L127**：二分搜尋得平衡點 **VCOM = 4.005 V**

```
A_pos = 2059.86   A_neg = 2069.01   →   gray 127.22 / 127.78
```

**4. VCOM 偏上／偏下的方向**（同一組設定，只改 VCOM）

| VCOM | A_pos | A_neg | gray_pos | gray_neg |
|---|---|---|---|---|
| 1.00 | 3735.21 | 397.24 | 230.5 | 24.5 |
| 2.00 | 3178.55 | 952.57 | 196.2 | 58.8 |
| **4.005** | 2059.86 | 2069.01 | **127.2** | **127.8** |
| 5.00 | 1509.13 | 2619.15 | 93.2 | 161.8 |
| 8.00 | 0.58 | 4446.61 | 0.0 | 255.0 |

VCOM 往上 → 正極性區 ΔV 變小 → `gray_pos` 往 L0、`gray_neg` 往 L255；往下則相反。✓

**5. 偶數 frame 規則**（`window.wfgDumpPolArea()`）

```
totalFrames 1000 ／ scanFrames 32 ／ steadyFrom 2 ／ used [2, 31] = 30 個
全部 32 個 frame 的極性：  - - + - + - + - + - + - + - + - + - + - + - + - + - + - + - + -
實際採用的 30 個的極性：       + - + - + - + - + - + - + - + - + - + - + - + - + - + - + -
```

前導的兩個 `-`（frame 0／1，Vpix 由 0V 起充的暫態）被自動排除；採用區間 30 個，**15 個 `+`、15 個 `-`，正負各半** ✓

**6. VCOM 未啟用時與 v3.13.0 零差異**（🔴 數值級比對，不用畫面雜湊）

基線取自 `git show HEAD:wfg.html`（commit `a972928` ＝ 線上的 v3.13.0），同一個 server、同一組操作序列（載入 preset → 關閉 VCOM → `wfgSetView` 三段 → `wfgDumpSpx(200)`）：

| | v3.13.0 基線 | v3.14.0（VCOM 關閉） |
|---|---|---|
| `segCount` | 1000 | 1000 |
| `computedExtent` | 1112000 | 1112000 |
| `overallHash`（前 200 段，含每段完整 `v[]` 的雜湊） | **`d7f503de`** | **`d7f503de`** |
| seg0 `hold` | 0.28447763003334225 | 同 |
| seg0 `vHash` | `fe2d1657` | 同 |
| seg2 `hold` | 7.715492607814049 | 同 |
| seg39 `hold` | 0.2845013516493402 | 同 |

🔴 **非空斷言**：`segCount = 1000 ≠ 0`。空的 `segs` 會讓 `overallHash` 恆等於 FNV 初值 `811c9dc5`，那種「零差異」是假陰性 —— 本次量測過程中確實先撞到過一次（切完 preset 後第一輪 `segCount = 0`），所以這一行是必要的。

**7. 透明度：兩個極端都看得到底下的東西**（像素級，非目視）

對同一列像素，比對「著色關 → 開」，驗證 `on = 0.45 × off + 0.55 × gray`：

| 灰階 | 預測誤差 avg / max | 關閉時的列內對比 | 開啟時的列內對比 |
|---|---|---|---|
| L25（VCOM 7.0，`gray_pos` 24.58） | **0.40 / 1.1** | 8 | 4 |
| L255（VCOM 8.0，`gray_neg` 254.97） | **1.74 / 2.5** | 64 | 29 |

兩個極端都精確符合固定 alpha 0.55，底層內容一律保留 45% ⇒ 格線與波形線在 L0 與 L255 下都仍可辨。

🔴 **L0 的極端區域在畫面上必然是窄帶**，這是物理必然不是實作缺陷：`gray_pos → 0` ⟺ `A_pos → 0` ⟺ 正極性區的電壓差趨近 0。所以用像素級量測取代「拉一張很大的 L0 截圖」。

**8. 效能（先量再改，有數字）**

同一組操作（連續 40 次 `wfgSetView` 平移），單位 ms：

| 版本／狀態 | p50 | p90 | max | avg |
|---|---|---|---|---|
| v3.13.0 基線（VCOM 開） | 8.3 | 9.5 | 10.7 | 8.49 |
| v3.14.0 著色開（第 2 輪） | 8.0 | 9.0 | 10.1 | 7.96 |
| v3.14.0 著色開（第 3 輪） | 8.1 | 9.4 | 10.2 | 8.17 |
| v3.14.0 著色關（第 1／2 輪） | 7.6／8.2 | 8.4／9.4 | 9.3／10.5 | 7.54／8.03 |

穩態下三者落在同一個區間，差異在量測雜訊內（< 0.5 ms）。第一輪「著色開」有一次 p90 23.8／max 37.9，來源是該輪包含貴層的首次計算（19.6 ms）與 JIT 暖機，後續輪次不再出現。

**9. 重算行為（分兩類各自量測）**

| 操作 | 貴層重算 | 廉價層重算 | 每次耗時 |
|---|---|---|---|
| 縮放 ×16 ＋ 平移 ×10（共 26 次視窗操作） | **0** | **0** | — |
| 連續移動 VCOM ×20 | **0** | **20** | min 0 ／ **p50 0.2** ／ max 1.1 ms |
| 改 feedthrough L127 drop | 1 | 1 | 貴層 18.1 ms ＋ 廉價層 0.7 ms |
| 改 Gate 條數 | 1 | 1 | 貴層 6.7 ms |

移動 VCOM 時灰階連續平滑變化（3.00V → 3.95V：161.9/93.1 → 131.0/124.0），**貴層一次都沒有被重算** ✓

**10. feedthrough 對面積確實生效且可逆**（同一 VCOM = 4.005）

```
drop 0/0/0 → gray 161.49 / 93.51
drop 1/1/1 → gray 127.22 / 127.78
drop 2/2/2 → gray  92.94 / 162.06
drop 4/4/4 → gray  24.38 / 230.62
drop 1/1/1 → gray 127.22 / 127.78   ← 回到原值，可逆
```

### 四、備註

- **i18n**：本版沒有新增任何 UI 文字（著色不帶文字），`common/i18n.js` **未改動**。移除的兩個讀值框留下 8 個未使用的 key（`wfg.ftMidRail`／`ftAnchorV`／`ftInterpNote`／`ftOff`／`ftYAxisNote`／`vcomOff`／`vcomEffective`／`vcomDefaultNote`）**刻意保留** —— 未使用的 key 不會造成任何顯示問題，刪它們要連帶 bump 所有引用頁的 cache buster，風險大於收益。
- **cache buster**：`wfg.html` 的 `?v=20260814wfg3130` → `?v=20260815wfg3140`（`common/version.js` 有改動）。
- **驗證用 helper**：新增 `window.wfgDumpPolArea()`（含每 frame 的正負面積與極性、穩態起點、採用區間、兩層的重算次數與耗時）與 `window.wfgPolAreaCalcCount()`／`window.wfgPolAreaBaseCalcCount()`。
- 🔴 **一個與本版無關、但實測時發現的既有現象**：preset `fhd_60hz_sg_ls_dual_cpv`（LS：Dual CPV）下，Vpix 波形**恆為 0V**（全部 542 段的 `hold` 與 `v[]` 都是 0）。已用 v3.13.0 基線交叉確認**同樣為 0**，因此與本版改動無關。是這個 preset 的設定使然還是既有缺陷，本次未查。

---

## TCON 波形模擬與取樣 (wfg) v3.13.0 — 2026-08-14 ｜ MINOR

面板類比信號卡片，在 Subpixel 電壓卡片**下面**新增一張 **VCOM 電壓**小卡片：勾選「啟用 VCOM 電壓」後，在 **Vpix（Subpixel）那一格裡**疊一條**白色水平虛線**當比較基準。電壓可調，範圍是 **VGMA1 ~ VGMA14**（由 SD1 的 gamma 設定即時算出，改 gamma 範圍跟著變）。

判定依據：R1～R4 逐項判、取最高者。

| 項目 | 級別 | 依據 |
|---|---|---|
| ① 新增 VCOM 參考線功能（核取方塊 ＋ 電壓欄位） | **MINOR** | §2 案例 1「新增一個完整功能」字面適用 —— 多了能做的事，既有控制項全部在原位，沒有任何入口消失或移位 |
| ② 預設啟用、預設值＝VGMA1／VGMA14 中點（＝改變起始狀態） | **MINOR** | **R4**：起始狀態改變但**不影響任何既有操作** —— 取消勾選就完整取回 v3.12.0 的畫面（已驗證同一實例內開→關的像素差為 0，可逆） |
| ③ 新增卡片使左側面板變長 | PATCH | §2 案例 3 的微調一側 —— 沒有任何既有控制項移位（新卡片加在既有卡片**之後**） |

取最高 → **MINOR**，`v3.12.0` → `v3.13.0`。

R2 不觸發 MAJOR：既有入口一個都沒動，也沒有移除任何功能。§2 案例 8（既有計算公式主動改設計）不適用 —— **VCOM 不參與任何計算**，它是純繪製層的參考線，Vpix 的波形數值一位元未變（見〈驗收〉第 1 項的數值級比對）。

**為什麼不掛 `⚠ 輸出變更`**：依 R1 的範圍定義逐項對照 ——
- 數值類：Vpix 的預計算結果（1000 段、含每段完整 v 陣列的雜湊）與 v3.12.0 **完全相同**，匯出檔除了新增的 `vcom_*` 兩個鍵之外逐鍵相同。
- 版面／構圖類：波形區的可視列數、列高、canvas 尺寸全部不變 —— VCOM 畫在 **Vpix 既有的那一格內**，不佔用新的列，Y 軸範圍也沒有因它而延伸（VCOM 的可調範圍 [VGMA14, VGMA1] 天然落在 Vpix 既有的 Y 軸範圍內）。
- 同一操作序列的結果：**預設啟用**，所以同一組設定用新版重跑，Vpix 那一格內會多出一條白色虛線 —— 這是唯一的差異，且**只影響那一格內的 14 個 y 列**（實測差異像素 1295 個，全部落在 Vpix 那一格的 rows 1436~1449）。

  🔴 **這一項是判定的邊界**：新增的線確實會讓「截圖存下來的成果」多一條線。判定為**不標**的理由是 —— 它不會讓任何**既有元素**的位置或數值改變，回歸比對只要把 VCOM 取消勾選就能逐像素回到 v3.12.0 的基線（已驗證可逆、差為 0）。若後續回歸流程認為「多一條線」也需要斷點標記，這個判斷可以推翻；**取捨寫在此供覆核**。

### 一、規格（依 Bruce 2026-08-14 指示）

```
UI（面板類比信號卡片 → Subpixel 電壓卡片「下面」，另一張小卡片）
 ├─ ☑ 啟用 VCOM 電壓 / Enable VCOM voltage（預設打勾）
 └─ VCOM 電壓 (V)：可調，範圍 VGMA1 ~ VGMA14

顯示
  位置：與 Vpix（Subpixel）同一格，兩者疊在一起
  樣式：白色、虛線、水平線（顏色固定，不隨通道配色）
  標註：線的左端標「VCOM x.xx V」，否則畫面上看不出這條線是什麼
```

**兩個 Bruce 未指定、由 Dispatch 端判斷後暫定的預設值**（他說「先做到這樣子，讓我看看」）：

1. **核取方塊預設打勾**（與 v3.12.0 的 Feedthrough 一致）。
2. **VCOM 預設值＝VGMA1 與 VGMA14 的中點**，preset 下 = (9.8 + 0.2) / 2 = **5.00 V**。由設定值即時算出，**不寫死**。

  兩者都可以改，改動範圍都只在一個地方（`wfgPanel.vcom_enable` 初值、`wfgVcomMid()`）。

### 二、實作要點

**① VGMA1 / VGMA14 對應到哪個欄位（有明文依據，不是推測）**

`common/i18n.js` 的標籤本身就是答案：`wfg.posGammaMax` = 「VGMA1（白，最高）」→ **`pos_gamma_max`**；`wfg.negGammaMin` = 「VGMA14（白，最低）」→ **`neg_gamma_min`**。兩者都取自 **SD1**（`wfgSd1SlotIdx()`）的 `analog_config`，且**每次都即時讀**（`wfgVcomRange()`），不快取、不寫死 —— 改 gamma 或換 preset，範圍與預設中點都會跟著變（已驗證：把 VGMA1 由 9.8 改成 12，範圍與中點即時變成 0.2~12 / 6.1）。

**② 為什麼畫在 `wfgDrawAnalogChannel()` 裡面，而不是註冊成一條通道**

VCOM 不是通道，是參考線。若走 v3.9.0 的疊圖群組機制，會改變群組成員數 → 群組高度、格線數（4n 格）、游標配色（綁 `ovlPos`）全部跟著變，牽連過大。畫在繪製函式內部則自動得到三件事：

- **座標系自動正確**：`voltToY()` 用的 `vMin/vMax` 已經包含 `forcedRange`（疊圖群組的共用 V 軸）的覆寫，Vpix 被疊進群組時 VCOM 自動改用**群組共用軸**。已實測坐實：與 LS 通道（VGL −10 ~ VGH 30）疊合後，共用軸變成 [−10, 30]，線的 y 由 1445.5 移到 891.5，與公式期望值 891.00 相符，畫面上的白色像素也確實在 y=891。
- **Vpix 不顯示時線自動消失**：三條隱藏路徑（面板卡片的顯示開關、通道 visible、v3.10.0 的圖層開關 `ovlOff`）都不會呼叫到這個函式。全部實測過。
- **其他類比通道零影響**：整段包在 `waveform_type === 3` 的判斷內。

**③ 夾制放在讀取端，不回頭改寫使用者輸入**

`wfgPanel.vcom_v` 存**使用者打進去的原始值**，畫線與讀值一律走 `wfgVcomEffective()`（未設過 → 中點；設過 → 夾制後的值）。這樣改了 gamma 讓舊值超界時，讀值框可以把「你存的值」與「實際生效值」一起顯示並標注已夾制，而不是無聲地竄改欄位。欄位失焦（`onchange`）時才回寫成生效值。

**④ 不觸發任何重算**

VCOM 只影響繪製，所以 handler **不呼叫** `_wfgInvalidateSpxOnly()`，只排一幀重畫（`wfgScheduleSpxRender()`）。這是它與 Feedthrough 的根本差別。

### 三、持久化

`vcom_enable` / `vcom_v` 隨 `wfgPanel` 進匯出與 autosave。`vcom_v === null` 的語意是「還沒手動設過 → 跟著中點走」，**如實存成 null、也如實載回 null**。載入 preset、重置、載入舊檔（v3.12.0 及以前沒有這兩個鍵）都回到預設（啟用 ＋ null）。匯入時**不夾**（與 TFT 電壓同一原則，夾制本來就在讀取端做）。

### 四、驗收（🔴 全部為本機驗證，Chrome 擴充套件當時連不上，**未經線上驗證**）

驗證用的臨時檔案（本機 http server ＋ iframe harness）不進版控。

1. **不啟用時與 v3.12.0 的差異 —— 數值級比對**（沿用 v3.12.0 建立的 `wfgDumpSpx()`，因為該版已實證 canvas 逐像素比對在「重新載入＋重跑」的層級不可重現）：
   - `v3.12.0` 與新版（VCOM 關閉）：`segCount=1000`、`overallHash=b9f1f192`、`vMin/vMax/yAxisMin`、抽樣的第 0／5／39 段（含每段完整 v 陣列的雜湊）**全部相同**。
   - 🔴 **非空斷言**：第一次跑時 `segCount=0`（預計算未完成），此時 hash 恆等於 FNV 初始值 `811c9dc5`，**空資料的比對永遠會通過**。加了「等到 `segCount>0` 且連續三次穩定才比」的閘門後重跑，才是上面這組數字。
   - 匯出設定逐鍵比對：除了新增的 `vcom_enable` / `vcom_v`，與 v3.12.0 **完全相同**。
   - 我也獨立重現了 v3.12.0 記載的那個現象：**同一份檔案自己跑兩次，canvas 雜湊就已經不同**（`dece59cb` vs `5af489dc`），base 自己跑兩次同樣不同 —— 所以跨版本的像素雜湊比對在此不是有效判準。

2. **同一實例內的像素比對（此層級可重現）**：開 → 關 → 開，`off1 == off2`（**差異 0 像素**，可逆）；`on != off`，差異 1295 像素且 **rows 全部落在 [1436, 1449]** ＝ Vpix 那一格內（`yHigh=1414.5, yLow=1482.5`）。其他任何一列都沒有被動到。

3. **線的位置對得上讀值**：以 canvas 像素掃描找白色像素的 y，與程式宣稱的 y 逐一比對 ——

   | VCOM | 宣稱 y | 畫面白色像素 y |
   |---|---|---|
   | 5.0 V（預設中點） | 1449.5 | 1449 |
   | 8.0 V | 1427.5 | 1427 |
   | 1.0 V | 1477.5 | 1477 |
   | 0.5 V | 1481.5 | 1481 |

4. **是水平線、不是斜線**：在線所在的那一列橫掃 0.12~0.98 寬度，白色像素 **413 / 748 = 55.2%** —— 與虛線 `[5, 4]` 的理論佔比 5/9 = 55.6% 吻合；同一格內其他所有 y 列的白色像素數都在 20 以下（右側刻度標籤的反鋸齒），**只有那一列有貫穿的白**。

5. **範圍夾制**：輸入 99 → 夾成 **9.8**（VGMA1）；輸入 −99 → 夾成 **0.2**（VGMA14）。

6. **取消勾選 → 線消失**：同一位置白色像素數 **0**。

7. **疊圖群組共用 V 軸**：與 LS 通道疊合後 `forced=true`、共用軸 [−10, 30]、線的 y 由 1445.5 → 891.5（公式期望 891.00，畫面像素 891）。

8. **圖層開關（`ovlOff`）關閉 Vpix 這一層** → 該幀完全不畫 VCOM（`lastDraw` 保持 null）。

9. **舊檔相容**：把 v3.12.0 匯出的設定檔匯入新版，`importOk=true`，VCOM 回到預設（啟用 ＋ 中點 5.0 V）。

10. **卡片外觀**：截圖確認位置在 Subpixel 電壓卡片下面、核取方塊預設打勾、電壓框顯示 5、提示「可輸入範圍（VGMA14 ~ VGMA1）：0.2 ~ 9.8 V」、讀值框顯示 VGMA1／VGMA14／實際生效值。

**未驗證的部分（誠實列出）**：線上（GitHub Pages）行為未驗證；手機版版面未驗證；三語只確認 key 齊全與繁中畫面，英文／簡中畫面未逐一截圖。

---

## TCON 波形模擬與取樣 (wfg) v3.12.0 — 2026-08-14 ｜ MINOR ｜ ⚠ 輸出變更

Subpixel 電壓卡片新增 **Feedthrough Voltage**：Gate 電壓掉到 TFT 關閉電壓的那一瞬間，Subpixel 電壓再階梯式往下掉一階。下掉幅度由 **L0／L127／L255 三個錨點**的 drop 電壓決定（預設各 1 V），中間灰階內插取得。核取方塊**預設打勾**。

判定依據：R1～R4 逐項判、取最高者。

| 項目 | 級別 | 依據 |
|---|---|---|
| ① 新增 Feedthrough 功能（核取方塊 ＋ 三個 drop 欄位） | **MINOR** | §2 案例 1「新增一個完整功能」字面適用 —— 多了能做的事，既有控制項全部在原位，沒有任何入口消失或移位 |
| ② 預設啟用（＝改變起始狀態） | **MINOR** | **R4**：起始狀態／預設值改變，但**不影響任何既有操作** —— 取消勾選就完整取回 v3.11.0 的行為（已用逐像素雜湊驗證可逆，見〈驗收〉第 6 項） |
| ③ Subpixel 的 Y 軸下緣往下延伸到 −max(ΔV) | PATCH | §2 案例 3「改 UI 版面」的微調一側 —— 沒有控制項移位。它是 ① 的必要配套（不延伸的話掉到 0 V 以下的部分會被畫到框外，**電壓游標也會被卡在 0 V**，見〈三〉） |

取最高 → **MINOR**，`v3.11.0` → `v3.12.0`。

R2 不觸發 MAJOR：既有入口一個都沒動。§2 案例 8（既有計算公式主動改設計）**不適用** —— Subpixel 在 Gate 關閉後「停止積分、保持當下電壓」這條 v3.8.0 的規則一字未改，feedthrough 是**接在那個 hold 值之後**再減一階，不是換掉原本的模型。

**為什麼掛 `⚠ 輸出變更`**：本功能**預設啟用**，所以同一組設定用新版重跑，Subpixel 波形會多一個往下的階梯，Y 軸下緣也會從 0 V 變成 −max(ΔV)（預設 −1 V）造成整條波形在框內的垂直位置改變。依 R1 的範圍定義，這同時命中「數值類」與「版面／構圖類」，拿 v3.11.0 建立的 Subpixel 基線不能直接沿用。**停用時逐像素零差異**（已驗證），所以基線只在啟用態失效。

### 一、規格（依 Bruce 2026-08-14 裁示）

```
UI（Subpixel 電壓卡片內，排在「Subpixel 充電時間」之後、顯示開關之前）
 ├─ ☑ 啟用 Feedthrough Voltage（預設打勾；取消勾選時三個欄位 disable ＋ 變暗）
 └─ L0 Drop / L127 Drop / L255 Drop（V），預設各 1，可輸入 0 ~ 50

行為
  觸發：Gate 電壓掉到 TFT 關閉電壓以下的那一瞬間 → 階梯式扣一次
  方向：V = V − ΔV，永遠相減（正電壓往 0 靠、負電壓更負，與 Gate 由 VGH 往下 drop 同向）
        🔴 不是「往 0 收斂」——那會在負電壓時反向
  幅度：依當下灰階，在三個錨點之間分段線性內插（L0~L127、L127~L255 兩段）
  停用：完全維持 v3.11.0 行為（關閉後保持關閉前的電壓不變）
```

**兩個經 Bruce 裁示的設計點**：

- **A1｜正負極性共用同一組錨點**（三個欄位，不分極性）。
- **B2｜內插在電壓空間進行**，內插軸是**離中軌距離** `d = |V_sd − Vmid|`。

### 二、為什麼 B2 的內插軸必須是「離中軌距離」

同一個灰階在兩種極性下對應**兩個不同的 SD1 電壓**，而且方向相反：

| 灰階 | 正極性（POL+） | 負極性（POL−） |
|---|---|---|
| L0 | `pos_gamma_min` 5.20 V | `neg_gamma_max` 4.80 V |
| L127 | 7.50 V | 2.50 V |
| L255 | `pos_gamma_max` 9.80 V | `neg_gamma_min` 0.20 V |

（表中數值為 `fhd_60hz_sg` preset 的 SD1 設定。這四個端點就是 Bruce 所說的 VGMA7／VGMA8／VGMA1／VGMA14 —— 本工具**沒有** VGMA1~14 這 14 個獨立設定，只有這 4 個端點 ＋ `sd_gamma` 指數所構成的對稱 S 曲線；中間 12 個 VGMA 由該曲線取代。對應關係已逐項核對 `wfgAnalogTargetVoltageWithPol()`：gf=0 時 POL+ 取 `pos_gamma_min`、POL− 取 `neg_gamma_max`，gf=1 時取另外兩端。）

正極性 L0→L255 遞增、負極性遞減。**直接拿電壓當內插軸，兩個極性會往相反方向查表** —— 選了 A1（共用一組錨點）之後這就從注意事項變成必要條件。取離中軌距離之後，兩者都成為同一條遞增的軸。

**中軌 Vmid 的取法**（不寫死）：`Vmid = (pos_gamma_min + neg_gamma_max) / 2`。依據是這兩個端點都是 **L0** 對應的電壓（各軌最靠中間的那一端），其中點即極性反轉的軸。preset 下 = 5.00 V，程式預設 (6.5 / 6.5) 下 = 6.50 V。正負軌不對稱時同樣成立。

**附帶的數學性質**（實作仍照裁示顯式走 d，此處僅記錄以便覆核）：
```
POL+：d = (pMin − Vmid) + gf·(pMax − pMin)
POL−：d = (Vmid − nMax) + gf·(nMax − nMin)
⇒ t = (d − d(L0)) / (d(L127) − d(L0)) = gf / gf(L127)
```
t 與 rail 位置、跨度、極性**全部無關** ⇒ 同一灰階在正負極性下 ΔV 必然相同，即使兩軌不對稱。**這就是 A1 成立的依據**，不是巧合。

**錨點恆為 8-bit 灰階語意**（L0／L127／L255），當下灰階走 `L / maxL` 換算 —— 與 `gray_fixed_level` 的「8-bit input scaled to bit_depth」慣例同源，`bit_depth` 改成 6 或 10 時三個錨點的意義不變。

### 三、灰階從哪裡取（整個功能的基礎）

`_wfgSdGrayFracAt()` 讀 SD1 預計算的 `lValuePerFrame`（`Uint16Array(effVtotal)`，建於 `_wfgPrecomputeSdChannel`）。

🔴 **兩個查證後才確定、不能靠推測的點**：

1. `lValuePerFrame` **不在 precompute 的頂層 return，只掛在 `precomp._lazyExtend`**。
2. latch 的判斷必須與 `_wfgSdVoltageAt()` **同源**，否則 ΔV 會對到另一筆資料的灰階：
   - `xstbPerLine[L] && frac >= xstbFracPerLine[L]` → latch 行 = L；否則往前找最近有 XSTB falling 的行（等價於 `target[]` 對沒有 falling 的行沿用前值）
   - 再套 XSTB `f_dly` 造成的跨行偏移：`dataLF = (lat % effVtotal − xstbDataOffset + effVtotal) % effVtotal`
   - 全程無 falling 時退回 `(effVtotal − xstbDataOffset) % effVtotal`（與主迴圈的初始行同式）

極性同樣取自 latch 行：`polForLine(lat + xstbPolFracPerLine[lat])`（v2.97.477 起 XPOL 在 XSTB rising 取樣）。

**這條路徑完全不動 SD1 的 precompute**，所以「SD1 波形零差異」是結構上保證的，不靠比對。

### 四、Y 軸下緣與電壓游標是綁在一起的

`wfgSyncSpxGpio()` 的 `ac.voltage_min` 由 `Math.min(0, _sdLo)` 改為 `Math.min(0, _sdLo, -wfgFtMaxDrop())`。

不延伸的後果**不只是波形被切掉**：電壓游標的可動範圍是「本視窗可見極值 ∩ **座標系**」（`wfgVoltCursorAllowedRange`），座標系停在 0 V 時游標一樣到不了負電壓區，掉下去的那一段量不到。`wfgAnalogDisplayRange()` 讀的就是 `ac.voltage_min`，改一處兩邊同步。

游標的可動範圍本身**不需要另外處理** —— auto-range 走 `samplesData.samples` 的可見極值，而落差點已明確寫進 samples（見〈五〉），會自動跟著變。

### 五、階梯不能被降採樣吃掉

`_wfgSpxSamplesFromPrecomp()` 的降採樣 `step` 最大可到 `s.n / 8`，會整個跳過 feedthrough 那一格 —— 落差點被跳過就只剩一條斜線，甚至完全看不出階梯。所以段內改為：在跨過落差點之前，明確補上**同一個 `lineX` 的「掉之前」與「掉之後」兩個點**，畫出來是一條垂直線，與降採樣密度無關。

落差資料存在 seg 的 `fts` 陣列（每個 gate pulse 至多一個），含 `k / x / before / after / drop / lVal / pol`。

### 六、驗證用 helper

新增三支（沿用 `wfgDebugGate` 的慣例）：

| helper | 用途 |
|---|---|
| `wfgDebugFeedthrough(maxDrops)` | 如實回報每一次落差：位置、latch 到的灰階與極性、ΔV、扣前／扣後電壓，＋ 一組 `_diag`（`noGate` / `noSource` / 各條的 `computedExtent` / view / TFT 電壓） |
| `wfgDebugSetFt(opts)` | 程式化設定三個錨點與啟用狀態 |
| `wfgDumpSpx(maxSegs)` | dump Subpixel 段式資料的**數值**（每段 `a/h/n/hold` ＋ 段內逐點電壓雜湊），供跨版本回歸比對 |

🔴 `wfgDebugFeedthrough` 與 `wfgDumpSpx` **只回報實測值，不重算預期值** —— 用同一支 `_wfgFtDropFactory` 算「預期」再跟自己比對是自我循環，公式錯了會一起錯、比對照樣通過。預期值一律在外部獨立算。
🔴 `wfgDebugSetFt` 走與 UI 完全相同的 handler（不直接改 `wfgPanel`），否則會繞過 `wfgSyncSpxGpio` 與失效邏輯，測到的不是使用者走的那條路徑。`_diag` 是後來補上的 —— 第一次量到 `segCount: 0` 時若沒有它，只能靠猜。

### 驗收

環境：本機 `http.server`，`fhd_60hz_sg` preset、FRAME 重複數 4、G45、`wfgResetView()`（view 0~100）。v3.11.0 由 `git archive d51cbab` 取出另起一個 server 對照。

**1｜預設值**：核取方塊打勾、三個 drop 皆 1 V、可輸入範圍 0~50 V、readout 顯示 `中軌 Vmid 5.00 V` 與三個錨點的 POL+／POL− 電壓與 d 值。取消勾選 → 三個欄位 `disabled` ＋ 變暗（截圖存證）。

**2｜啟用 vs 停用波形對照**（G45、L255、POL−）：

| | Subpixel 波形 | Y 軸 |
|---|---|---|
| 啟用 | 充到 0.20 V → Gate 掉到 −5 V 之後**垂直掉到 −2.80 V** | 0.20 V ~ −2.80 V |
| 停用 | 充到 0.20 V → **一路平走，無階梯** | 0.00 V ~ 0.20 V |

**3｜內插實測**（`L0=0.5 / L127=1.5 / L255=3.0`，SD1 切 Fixed 灰階以精確指定 L；預期值以獨立腳本按〈二〉的算式重算，**不從實作取值**）：

| L | 實測 ΔV (POL−) | 實測 ΔV (POL+) | 獨立算式預期 | 差 |
|---|---|---|---|---|
| 0 | 0.50000000 | 0.50000000 | 0.50000000 | 0 |
| 32 | 1.03442241 | 1.03442241 | 1.03442241 | 1.6e−09 |
| 64 | 1.23234628 | 1.23234628 | 1.23234628 | 2.1e−09 |
| 96 | 1.38055799 | 1.38055799 | 1.38055799 | 4.2e−09 |
| 127 | 1.50000000 | 1.50000000 | 1.50000000 | 0 |
| 128 | 1.50534379 | 1.50534379 | 1.50534379 | 1.2e−09 |
| 160 | 1.69011802 | 1.69011802 | 1.69011802 | 3.6e−10 |
| 192 | 1.91320167 | 1.91320167 | 1.91320167 | 4.7e−09 |
| 224 | 2.21266679 | 2.21266679 | 2.21266679 | 2.0e−09 |
| 255 | 3.00000000 | 3.00000000 | 3.00000000 | 0 |

最大差 4.7e−09（浮點捨入）。順帶對照：若改在**灰階空間**內插，L32 會是 0.752（差 37.6%）、L224 會是 2.637（差 −16.1%）—— 兩種做法差別可觀，B2 的裁示不是形式問題。

**4｜正負極性**：上表每一列 POL+ 與 POL− 的 ΔV 逐位吻合（僅最後一位浮點差），且全部落差都是 `vAfter < vBefore`（方向往下）。

**5｜Y 軸延伸與游標**：`ac.voltage_min` 隨 max(ΔV) 變動（實測 1 V → −1、3 V → −3、停用 → 0）。ΔV=3 V 時 Subpixel 掉到 −2.80 V，波形完整可見；Vpix 的兩條電壓游標讀到 **V1 = −0.55 V、V2 = −2.05 V**，皆位於負電壓區（＝座標系與可動範圍都跟著延伸了）。

**6｜停用時與 v3.11.0 零差異 —— 改用數值級比對，原因如下**

🔴 **先說結論中最重要的一件事：wfg 的 canvas 逐像素比對在「重新載入 ＋ 重跑同一組操作」的層級上不可重現，這是既有行為，不是本次改動造成的。** 這一點是實測出來的，不是推論：

| 實測 | 結果 |
|---|---|
| **同一個 v3.11.0 分頁**，clear → reload → 同一組序列，跑**兩次** | 整張 canvas 雜湊 `cf767898` vs `809f7678`；相異色數 **11,670 vs 3,362** |
| 同上，只比 Vpix 那一帶（列 1417~1504） | 相異色數 **172 vs 578** |
| 同一狀態內連續重繪（不重新載入） | **穩定**（雜湊不變） |

相異色數差三倍不是抗鋸齒雜訊，是「波形畫得多密」整體不同。根因：**SD/SPX 的 lazy-extend 與降採樣密度取決於 render 當下已經算到多遠，而 progress overlay 隱藏並不代表 lazy-extend 已完成**（同一件事也解釋了為什麼第一次量到的 `wfgDumpSpx` 回 `segCount: 0` —— SD 還沒 extend 到 G45 那個 pulse）。

所以「零差異」改在**數值層**驗，繞開繪圖的非決定性。做法：新增 `window.wfgDumpSpx()`（見〈六〉），並用腳本把**位元完全相同的同一段 helper** 注入 `git archive d51cbab` 取出的 v3.11.0（只加 helper，不動任何計算；注入後實測該檔 `ft_enable` 出現次數 = 0，確認是真的舊版）。兩邊各自跑到收斂（連續兩次 dump 相同）後比對。

比對內容：Subpixel 的全部段式資料 —— 每段的 `a / h / n / hold` ＋ **段內每一個取樣點的電壓逐點雜湊**（4 段 × 139 點）。

| 狀態 | overallHash | seg0.hold | seg0.vHash | Y 軸下緣 | 段數 | 落差數 |
|---|---|---|---|---|---|---|
| v3.11.0（＋helper） | `30414702` | 1.284477630033319 | `8961b572` | 0 | 4 | 0 |
| v3.12.0 ft **停用** | `30414702` ✅ **相同** | 1.284477630033319 ✅ | `8961b572` ✅ | 0 ✅ | 4 | 0 |
| v3.12.0 ft **啟用**（負向對照） | `2e380b88` ❌ 不同 | 0.28447763003331894 | `fe2d1657` | −1 | 4 | 4 |

啟用與停用的 `hold` 差 **1.000000000000000**（＝ L0 錨點的 1 V），負向對照證明這個比對有辨識力；停用時逐點數值與 v3.11.0 完全一致。

另外，兩邊的**輸入狀態**也逐欄位比對過（`wfgExportConfig()` 的每個 top-level key 各算雜湊）：19 個 key 中只有 `gpios` 與 `panel` 不同，而深入到逐 gpio 比對後，27 個 gpio 只有 **idx 26（Subpixel）**不同，差異**只有多出 `ft_enable` / `ft_d0` / `ft_d127` / `ft_d255` 四個欄位**（`voltage_min` 兩邊皆 0）。SD1（idx 18）與其餘 25 個 gpio、`frame` / `lsGlobal` / `channels` / `view` / `cursors` 全部逐位元組相同。

（順帶記錄另一個較小的非決定性：canvas 第 117 與 153 列在**首次繪製與後續重繪之間**也會變 —— 同一分頁不改設定、只重繪一次即可重現。位置在 canvas 上方的文字區，離 Subpixel 波形 1200 列以外。）

**7｜舊檔相容**：v3.11.0 匯出檔的 `panel` 區塊實測只有 `gate_line / gate_show / gate_rc_mult / tft_von / tft_voff / spx_rc / spx_show` 七個欄位、無任何 `ft_*`。先把 ft 設成非預設（停用 ＋ 0.5/1.5/3.0），再匯入該格式 → `wfgImportConfig` 回傳 `true`、無 error，ft 落回預設（啟用 ＋ 1/1/1），核取方塊與三個欄位的 DOM 同步更新。

**8｜版號閘**：`tools/check_cache_buster.py` 指出 `index.html` 引用的 `?v=` 與前一版相同（因為 `common/version.js`、`common/i18n.js` 本次有改），已一併 bump 為 `20260814wfg3120`。`pre-commit` 通過。

### 順帶發現（不在本次範圍，回報供裁示）

1. **改 SD1 的灰階設定（`gray_mode` / `gray_fixed_level`）後，Subpixel 波形不會即時更新。** 實測：連續改 `gray_fixed_level` 為 0→32→…→255，Subpixel 讀到的 `lVal` 全部停在第一次的值不動；隨後改一次 Gate 條數（走 `_wfgInvalidateGateOnly()`）就立刻正確。原因是 `wfgOnAnalogConfigChange` 走 dirty 路徑，而 `_wfgSpxStale()` 的判斷只看 `ver` / `totalLines` / `srcSdExtent` —— SD1 重算後 `computedExtent` 不變，三個條件全不成立。**這是 v3.8.0 起就存在的既有結構，與本次改動無關**（本次的 handler 都自己呼叫 `_wfgInvalidateSpxOnly()`，不受影響）。未修，因為它會動到 SD/SPX 的失效判斷，屬於獨立的一項改動。
2. preset 的 SD1 是 `gray_mode: 2`（H1 逐行交替 L0／L255），**預設狀態下驗不到內插**（同一條 G 每 frame 對到同一個 data line ⇒ 灰階固定）。要驗中間灰階必須改 `gray_mode`，或改 Gate 條數換到不同的 data line。
3. **`wfg-progress-overlay` 隱藏 ≠ 全部算完。** SD/SPX 的 lazy-extend 掛在 render 的逐列繪製上，不走那個 overlay。任何跨版本或跨載入的回歸比對都必須自己等到「連續兩次量測相同」才算收斂 —— 只等 overlay 消失會拿到中間態（本次實測踩到兩次：一次讓 `wfgDumpSpx` 回 `segCount: 0`，一次讓整張 canvas 的相異色數少了三分之二）。
4. 改 FRAME 重複數之後，**SD1 的 `computedExtent` 仍停在舊值**（實測 1000 frames → 4 frames 後仍是 1112000）。SPX 自己會因 `p.totalLines !== totalLines` 重算、且 `want = min(自己要的, sdExt)` 取小者，所以結果正確；但這個殘留值會讓診斷數字看起來矛盾。同樣屬既有結構，未修。

---

## TCON 波形模擬與取樣 (wfg) v3.11.0 — 2026-08-14 ｜ MINOR

四件事：左側兩張類比卡片的外框改為**上綠下藍**、移除 IC 類比信號卡裡那張**殘留的 Subpixel 空殼卡片**、兩張卡片**改名**（`類比信號` → `IC 類比信號`、`面板信號` → `面板類比信號`）、**輸出通道卡片的色點也能開調色盤**。

判定依據：R1～R4 逐項判、取最高者。

| 項目 | 級別 | 依據 |
|---|---|---|
| ① 外框配色上綠下藍 | PATCH | §2 案例 3「改 UI 版面、不動功能」的**微調（配色）**一側 —— 沒有任何控制項移位，使用者不需要重新找東西 |
| ② 移除殘留的 Subpixel 空殼卡片 | PATCH | **R1 修 bug**。這張卡片是 v3.8.0 把設定搬到面板卡之後沒清乾淨的殘留，**不是** §2 案例 6 的「移除既有功能」（詳見下方〈為什麼這是 bug 不是移除功能〉的實測證據） |
| ③ 卡片改名（三語） | PATCH | §2 案例 3「文案」＋案例 11「i18n 文案」 |
| ④ 輸出通道色點可開調色盤 | **MINOR** | §1 判定表〈操作流程〉MINOR 欄字面適用：「**多了新按鈕，舊的都在原位**」。這顆色點原本沒有任何點擊行為，現在成為一個新的可操作入口，而左側通道名稱那顆色點與整列拖曳排序全部不動 |

取最高 → **MINOR**，`v3.10.0` → `v3.11.0`。

R2 不觸發 MAJOR：沒有任何既有入口消失或移位。②移除的是一張**零個控制項**的空殼，不構成「使用者原本會用的東西沒了」。R4 不適用：預設顏色、起始畫面、所有預設值未動。

**為什麼不掛 `⚠ 輸出變更`**：波形數值與 canvas 內容**逐位元組不變**（已用逐像素雜湊驗證，見〈驗收〉）。①②③ 動到的都是左側控制面板，不在「截圖／匯出圖片」功能存下來的成果範圍內；④ 是純新增入口，不用就完全不影響輸出。依 R1 的範圍定義，三類「要標」的情形（數值類／版面構圖類／同一操作序列結果不同）皆不成立。

### 一、外框配色：上綠下藍

**改動前的實測現況**（這一項不是單純「幫 SD1 補一個顏色」，先列出量到的事實）：

| 卡片 | 位置 | 改動前外框 | 改動後 |
|---|---|---|---|
| Level Shifter 全域設定 | IC 類比信號卡**最上方** | `#3b82f6` **藍** | **`#22c55e` 綠** |
| SD1（Source Driver） | 其下 | `#334155`（預設灰，等於沒有顏色） | **`#38bdf8` 藍** |
| Gate Line | 面板類比信號卡上方 | `#22c55e` 綠 | 不動 |
| Subpixel 電壓 | 面板類比信號卡下方 | `#38bdf8` 藍 | 不動 |

Level Shifter 原本是**藍色而且排在上方**，依「上綠下藍」規則它要換成綠色 —— 所以本項不只是給 SD1 補色，也一併換掉了 LS 的顏色。換用的色碼直接取面板類比信號卡的那兩個值，兩張卡完全一致。

SD1 的外框掛在 `wfgRenderGpioList()` 的 `waveform_type === 1` 上（不是掛在「第幾張卡」上），所以未來若有 SD2、SD3 會一起是藍框。數位信號卡不受影響。

**未動的維度**：只改外框顏色。Level Shifter 的**標題文字色仍是藍色** `#60a5fa`（面板卡的 Gate Line 標題是綠色 `#4ade80`）—— Bruce 指名的是「框」，標題文字色沒有被指名，故不自行更動，待裁示。

### 二、移除 IC 類比信號卡裡殘留的 Subpixel 卡片

#### 為什麼這是 bug 不是移除功能

改動前在瀏覽器實測那張卡片的內容：

```
data-gpio-idx = 26   名稱 = SUBPIXEL
body 內 input/select/button/textarea/label 數量 = 0
body 全文 = 「波形類型: 跟隨 Gate Line 卡片選定的那一條 G。Gate 電壓超過 TFT 導通電壓
             後朝 SD1 充電，掉到 TFT 關閉電壓以下就保持在自己當下的電壓。
             參數請在「面板信號 → Subpixel 電壓」卡片調整」
```

**零個控制項**，而且卡片自己的最後一行就寫著「參數請去面板信號卡調整」。對照面板類比信號卡的 Subpixel 電壓卡片，該有的設定（TFT 導通／關閉電壓、Subpixel 充電時間、顯示開關）都在那裡 —— **這張殘留卡片沒有任何一項是面板卡沒有的**，因此不需要補搬任何東西，直接移除。

這是 v3.8.0 把設定搬過去時沒把空殼清掉的殘留，同一個東西在兩張卡出現。依 **R1** 判為修 bug（PATCH）。

#### 只是不列出，通道本身完全不動

移除方式是在 `wfgRenderGpioList()` 對 `waveform_type === 3` 提早 `continue`（與既有的 `=== 2` 跳過 CKO 卡片同一個位置、同一種寫法）。Subpixel 這條虛擬類比通道本身、它的波形計算、以及**輸出通道下拉裡的「SUBPIXEL — LCD」選項**都照舊。

`wfgRenderAnalogConfigHtml()` 裡針對 `waveform_type === 3` 的提早回傳自此不再被呼叫，保留作為防禦（萬一日後又把這類卡片列回來，不會掉到 SD 專用的滑桿去）。

### 三、卡片改名（三語）

| key | zh-TW | en | zh-CN |
|---|---|---|---|
| `wfg.analogSources` | 類比信號 → **IC 類比信號** | Analog Signals → **IC Analog Signals** | 模拟信号 → **IC 模拟信号** |
| `wfg.panelSignals` | 面板信號 → **面板類比信號** | Panel Signals → **Panel Analog Signals** | 面板信号 → **面板模拟信号** |
| `wfg.spxCfgHint` | 內文的「面板信號」一併改為「面板類比信號」 | 同左 | 同左 |

`wfg.html` 裡兩個 `<h3 data-i18n=…>` 的 fallback 文字同步改掉（i18n 尚未套用前的那一瞬間會看到它）。

**刻意不改的**：`wfg.groupAnalog`（輸出通道下拉的分組標籤「類比信號」）維持原樣。那個分組底下同時放著 SD1／CKO（IC 端）**和** Gate／Subpixel（面板端）兩邊的信號，改成「IC 類比信號」會變成錯的。

`wfg-guide.html` 等說明頁依專案慣例不納入本次改動。

### 四、輸出通道卡片的色點也能開調色盤

點輸出通道卡片裡通道名稱**左邊的色點** → 開出與左側通道名稱那顆色點**完全相同**的調色盤（8 格色票＋其他顏色＋恢復原本顏色）。

**共用同一支實作，沒有複製第二份**：v3.10.0 的 `wfgOpenColorPicker(chIdx, anchorEl)` 本來就只吃「哪一條通道」與「定位用的錨點元素」，不含任何與左側標籤綁死的東西，因此**不需要抽出重構**，把它掛到這顆色點上即可。兩處的行為、色票、鍵盤／觸控處理自動一致，日後改一邊不會忘另一邊。

**沒有蓋掉既有行為**：改動前這顆 `.wfg-ch-dot` 沒有 `onclick`、沒有 `title`，是純顯示用的色塊。整列的拖曳排序不受影響（click 與 drag 互斥，且 `event.stopPropagation()` 擋住冒泡）。

**兩處色點同步更新**：顏色的單一真值是 `ch.color`，而 `_wfgColorPickRefreshAll()` 早就同時呼叫了 `wfgRenderLabels()` 與 `wfgRenderChannelList()` —— 從任一處改色，兩顆色點與波形會一起變。

**版面不變**：沿用 v3.10.0 的 `.wfg-color-dot` 樣式，`padding:3px` ＋ `border:1px` ＋ `margin:-4px` 三者互相抵消，這顆 10px 色點的**佔位仍是 10px**（邊框盒 18px − margin 8px），名稱與下拉不會右移。

---

## TCON 波形模擬與取樣 (wfg) v3.10.0 — 2026-08-14 ｜ MINOR ｜ ⚠ 輸出變更

五件事：**通道顏色可以自己改**、**點通道名稱切換疊圖圖層**、**電壓游標限制在可見視窗內**、修掉**長名稱把 V1/V2 晶片擠出標籤框**、Subpixel 通道改名 **`Vpix_<n>`**。

判定依據：R1～R4 逐項判、取最高者。
- §1 判定表：**功能增減＝新增三個獨立功能**（改通道顏色、群組內圖層開關與 z 序、游標範圍限制）→ MINOR；操作流程＝多了「點色塊」「點名稱」兩個新目標，**既有的拖曳排序、疊合手勢、V1/V2 開關、色塊位置與大小全部不動** → MINOR。
- R1 部分適用：V1/V2 晶片溢出屬修 bug → 該項自身是 PATCH，取最高者後被 MINOR 蓋過。
- R2 **不觸發 MAJOR**：沒有任何既有入口消失或移位，使用者原本會的操作全部還在。依 §1「改動大小不是判準」與 R2 補充第 4 點，五項一起交付也不影響級別 —— 3.x 可以走到 v3.9x。
- R3：這一版之後使用者多能做的事有三件 → MINOR（三項同批交付，合併為一次 MINOR）。
- R4 不適用：預設顏色、起始畫面、所有預設值未動。

取最高 → **MINOR**。

**為什麼掛 `⚠ 輸出變更`**：游標範圍限制會**主動改變電壓游標的落點**。實測：同一份設定在 v3.9.0 的 SD1·V2 停在 2.45 V，v3.10.0 因為 2.45 V 不在 SD1 於該視窗的可達範圍（5.20 ~ 9.80 V）內而被夾到 5.20 V。依 R1 的範圍定義，這屬「同一操作序列得到不同結果」，用舊版抄下來的游標讀值不再成立，必須讓後續回歸比對知道這個斷點。

**但「不使用新功能」的路徑仍是逐位元組不變**，已用逐像素比對驗證（見〈驗收〉第 7 項）：非疊合狀態下，一條通道的座標系本來就等於它自己的可見範圍，夾制是 no-op。設定檔亦同 —— `color0`／`ovlOff`／`ovlZ` 都只在真的用到時才寫出，沿用 v3.9.0 處理 `ovlId` 的寫法。

### 一、通道顏色調色盤

點左側通道名稱**左邊的色塊** → 跳出調色盤：8 格出廠色票（＝色盤 `WFG_CH_COLORS` 去重後的 8 色）、一個「其他顏色」原生色票當任意色的逃生口、一顆「**恢復原本顏色**」。顏色即時套用到**波形、左側色塊、OVERVIEW 概覽條、通道設定清單、匯出圖片的標籤** —— 這些全部直接讀 `ch.color` 這個單一真值，不需各自同步。

**「原本顏色」的定義（Bruce 2026-08-13 裁示：走 C 案）**

新增 `ch.color0` 記錄基準色，在三個入口寫入：出廠（`wfgMakeChannel`）、套用 preset、匯入設定。「恢復原本顏色」還原成 `color0`。

理由是實測發現 **preset 指定的顏色不等於出廠色盤**：`fhd_60hz_sg` 的 18 個通道有 **14 個**對不上（例如 index 4 preset 給 `#8B4513` 棕，出廠色盤是 `#FF8000` 橘）。若「原本顏色」取出廠色盤，使用者在這份 preset 下按恢復會得到一個**他從沒看過的顏色**，那不叫恢復。

**舊檔相容**：v3.9.0 以前的設定檔沒有 `color0`，載入時以檔案裡的 `color` 當基準（＝「這份檔案載入時的顏色」），語意一致、不報錯。

**未納入的兩處色塊**（可視需要再補）：通道設定卡片的 `.wfg-ch-dot`、以及匯入 LA 檔的 kvdat 模式標籤。Bruce 指名的是「通道名稱欄位中名稱左邊的顏色圖示」，故本版只做左側通道名稱欄。

### 二、V1/V2 游標晶片溢出標籤框（修正）

左側標籤欄固定寬 `WFG_LABEL_W = 110px`，V1/V2 晶片原本靠 `margin-left:auto` 排在名稱右邊。名稱一長（例如 Gate 條數大時的 `G690`／`SPX690`）就會被擠出框外。

改為**排在通道名稱下方**（外層 `.wfg-vc-line` 佔滿一行，靠 `flex-wrap` 換行）。沒有選截斷名稱（ellipsis），因為 `SPX690` 截掉尾碼就看不出是第幾條，比溢出更難用。

**幾何不受影響（這是本項的關鍵風險，已量測）**：`.wfg-label-item` 的 height 由 `wfgRenderLabels()` 明確指定（群組成員固定 `WFG_ANALOG_ROW_H` ＝ 80px），不是 auto，故換行不會撐開列高；群組外框高度仍是 `n × 80 + WFG_ROW_GAP`。數位列沒有電壓游標、不產生這兩個晶片，完全不套用換行樣式。

### 三、疊圖群組：點通道名稱切換圖層 ＋ z 序

點疊圖群組內某條的**通道名稱** → 名稱變淡、該條在疊圖區消失；再點一次回復，且**畫在最上層**（後出現的在最上層）。

**規格（Bruce 2026-08-13 裁示）**：隱藏一條之後，**群組高度不變**、**共用 V 軸範圍不變**。所以高度與格線數一律用「群組成員數」算，不是「目前看得見幾條」—— 每點一下就跳一次版面、刻度一直變，讀值會失去連續性。被隱藏那條的電壓游標一併收起（它不進 `_wfgAnalogChSlots`，因此不畫也 hit-test 不到）。

**不複用既有的 `visible`**：`visible=false` 會讓通道從 `visMap` 消失，群組成員數少一條 → 高度變 (n−1)×80、V 軸重算，直接違反上面兩條裁示。故另立 `ovlOff`。

**z 序與游標配色序位解耦**：游標配色走 `ovlPos` ＝ 該條在**標籤順序**裡的位置（第 1 條青、第 2 條黃…），`ovlZ` 只決定誰畫在上面。若讓 z 序直接當 `ovlPos`，重新顯示一條就會讓整組人的游標顏色跟著跳。

**點擊 vs 拖曳**：名稱區本來就是拖曳排序的觸發區，故加 `WFG_CLICK_SLOP = 4px` 位移門檻，且**只對群組成員生效** —— 群組外的通道點名稱維持既有行為（不動作），不改變原本的拖曳手感。

### 四、電壓游標限制在可見視窗內（⚠ 本版輸出變更的來源）

水平（電壓）游標的上下可移動範圍，限制在**該條波形於目前可見視窗內**的實際 min/max 之間。捲動／縮放會重算；原本合法的游標落到界外時**自動夾回邊界**。同一群組內各條各走各的範圍。

🔴 **這裡有兩個不同的量，實作與日後修改都不可混用**：

| | 來源 | 性質 |
|---|---|---|
| **V 軸刻度範圍** | `wfgSlotDisplayRange()` | 群組共用、**固定不隨視窗變**（＝座標系，決定 frac 對應到哪個電壓） |
| **游標可移動範圍** | `wfgVoltCursorAllowedRange()` | **每條各自**、**隨可見視窗浮動** |

夾制一律在**電壓域**做（frac →（用座標系）電壓 → 夾在可達範圍 → 換回 frac）。直接夾 frac 會夾錯，因為 frac 的分母是座標系、界線卻來自另一個量。

可見視窗極值沿用 v3.9.0 既有的 `wfgComputeAnalogAutoRange()`（本幀 render 已算好、存進 `_wfgLastAutoRanges`），沒有另寫一套 —— 兩套遲早不一致。

兩個實作上的坑，都已修：

1. `_wfgLastAutoRanges` 的 key 是 **visibleChs 索引**，不是 `wfgChannels` 索引。讀值卡片手上只有後者，若直接拿去查會取到別條通道（實測顯示成 −10.00 ~ 30.00 V，超出共用軸）。一律先用 `wfgSlotByGpioIdx()` 取得 slot 再查。
2. auto-range 在「視窗內取不到樣本」時會退回 `analog_config.voltage_min/max`，該值可能落在共用 V 軸之外 —— 直接當界線等於沒有限制。故與座標系**取交集**。

右側「電壓游標」卡片每條多一行「**游標範圍（本視窗）**」，與上面那行固定的 V 軸刻度範圍分開顯示。捲動時它每幀都在變，重建 DOM 太貴，故以 90ms debounce 更新（實測若不更新，捲動後會顯示上一個視窗的數字）。

### 五、Subpixel 通道改名 `Vpix_<n>`

`SPX1` → `Vpix_1`、`SPX690` → `Vpix_690`。

**舊檔會自動轉換**：通道名稱是**存進設定檔**的（`channels[].name`），v3.9.0 的檔案帶的是 `SPX1`。判斷「這個名字還是自動產生的嗎」的正規式改成同時認新舊兩種格式（`/^(?:SPX|Vpix_)\d+$/`），載入時經 `wfgLsSyncChannels() → wfgUpdateSpxChannelName()` 自動改寫成新格式，不會新舊混用。使用者自己打的名字仍然不動。

🔴 **只改使用者看得到的名稱，內部識別碼一律維持 `spx`**（`spx_rc`、`wfgSpxSlotIdx`、`WFG_SPX_RC_DEFAULT`、`_wfgPrecomputeSpxChannel`…）—— `spx_rc` 已經寫進使用者的 autosave 與匯出檔，改了會破壞相容。因此程式裡會出現「變數叫 spx、UI 叫 Vpix」的不一致，**這是刻意的，不是漏改**，已在 `WFG_SPX_NAME_PREFIX` 宣告處註明。

### 驗收

| # | 項目 | 結果 |
|---|---|---|
| 1 | 疊圖群組建立（SD1 + Vpix_1） | 群組高度 168px ＝ 2×80 + gap |
| 2 | 長名稱 `Vpix_690` / `G690` | V1/V2 晶片 overflowX **−8px（框內）**；`SD1` 短名稱位置未變 |
| 3 | 改色三處同步 | 波形 ✅（洋紅 6707px→黃 5412px）、左側色塊 ✅、設定清單色塊 ✅、OVERVIEW 對**數位**通道 ✅（CK1 綠 2676→10、洋紅 +2666）；對**類比**通道無變化 —— v3.9.0 的 minimap 只用數位 transitions 畫，類比通道本來就沒有依 `ch.color` 畫出的內容，**屬既有限制，非本版改壞** |
| 4 | 4 條群組隱藏 2 條 | 高度 **328px 不變**（波形列 4×80 ＋ gap 8）、V 軸 **−10.00~30.00V｜16div×2.5V 不變**、名稱 opacity 0.38、被隱藏者的游標一併收起 |
| 5 | 游標範圍隨視窗變 | 窄視窗：SD1 **5.20~9.80V**／Vpix_1 **1.28~9.77V**；全覽：SD1 **0.20~9.80V**／Vpix_1 **0.00~9.75V**。V 軸刻度全程 0.00~9.80V 不變 |
| 6 | 同群組不同波形範圍不同 | 見第 5 項，同一群組兩條範圍明顯不同 |
| 7 | **不使用新功能逐像素零差異** | v3.9.0 `7c46cfbd` ／ v3.10.0 **`7c46cfbd`**（1363×1506、非黑像素 163680 皆相同）。**負向對照**：改一條通道顏色 → `a7a4de26`（不同），按「恢復原本顏色」→ 回到 `7c46cfbd`。比雜湊前先確認非黑像素 ≫ 0，避免拿空畫面得到假通過 |
| 8 | 舊檔相容 | 以 v3.9.0 樣貌的設定檔（`name:"SPX1"`、無 `color0`/`ovlOff`/`ovlZ`）載入 → 自動顯示 `Vpix_1`，全畫面無 `SPX` 殘留，無錯誤 |

**自動夾回**實測：v3.9.0 存下的 SD1·V2 ＝ 2.45 V，在 v3.10.0 載入後被夾到該條可達範圍的下界 **5.20 V**。

**未達成**：拖曳游標「超過上下限停在邊界」這一項，我用合成滑鼠事件打不中游標線的 hit-test，未能直接以拖曳路徑驗證。夾制函式與 render 路徑的自動夾回同源（同一支 `wfgClampVoltCursorFrac`），且自動夾回已實測有效，但**拖曳路徑本身尚未經過端到端驗證**。



新增**類比波形疊合**：從左側通道名稱區把一條類比波形拖到波形區的某一列上放開，兩條就疊進同一個顯示框，最多 4 條。疊起來之後那一區的操作手感做成**像示波器** —— V/div 檔位、中心電壓、水平格線，每條訊號保有自己那一組電壓游標。

判定依據：R1～R4 逐項判、取最高者。
- §1 判定表：**功能增減＝新增獨立功能 → MINOR**；操作流程＝多了一個新手勢（拖到波形區），**原本的左側拖曳排序位置與行為完全不動** → MINOR；既有功能的輸出＝不使用疊合時完全不變。
- R1 不適用（不是修 bug）。
- R2 **不觸發 MAJOR**：沒有任何既有入口消失或移位，使用者原本會的操作全部還在。依 §1「改動大小不是判準」與 R2 補充第 4 點，工程規模不影響級別 —— 3.x 可以走到 v3.9x。
- R3：這一版之後使用者多能做一件事（把波形疊起來對照）→ MINOR。
- R4 不適用：預設不疊合，起始畫面與所有預設值未動。

取最高 → **MINOR**。

**不掛 `⚠ 輸出變更`**：依 R1 的範圍定義，本版屬「純新增能力，既有操作的結果完全不變」。實作上所有疊合邏輯都掛在「這條通道有 `ovlId`」之後，沒有任何群組時走的還是 v3.8.1 的路徑。此判定已用**逐像素比對**驗證（同一組設定、不使用疊合功能，新舊版 canvas 雜湊相同），比對方法與負向對照見下方〈驗收〉。

### 一、疊合與解除：放開的位置決定行為

```
從左側通道名稱區開始拖
 ├─ 放開在「波形區域」的某一列上  → 疊到那一列（最多 4 條）
 └─ 放開在「左側通道名稱區」      → 一般排序；若該條原本在某個疊合群組裡，
                                     這個動作同時等於「解除疊合」
```

**左側區＝清單，波形區＝畫布。** 拖回清單就是脫離畫布上的疊合，所以刻意**不做**額外的「解除」按鈕。判定界線是 `WFG_LABEL_W`（110px）再加 ±10px 緩衝，緩衝值沿用 `wfgIrDragSetup` 既有的邊界抖動處理。

- 可疊合的範圍＝**類比訊號（SD1／CKO1~6）＋ 面板訊號（G／SPX）**。這三類在資料層本來就都是類比（G 是 `waveform_type` 2、SPX 是 3），共用同一個 `wfgDrawAnalogChannel` 與同一套電壓→Y 映射。**數位訊號排除** —— 它走的是 `fillRect` 高低兩條線的分支，沒有電壓量，與「共用 V 軸」對不上。
- **高度不壓縮**：n 條疊合＝ n × 80px，每一條原本佔的顯示區域一格不少。整體垂直總高不變（只少掉群組內原本的 n−1 個 8px 列間距）。
- **邊界情形**（皆依 2026-08-13 裁示）：已在群組裡的被拖到另一個群組 → 從舊群組移到新群組；群組只剩一條 → 自動退化成一般波形；已滿 4 條再拖第 5 條 → **拒絕並提示**（外框轉紅、顯示上限），狀態一律不變，不做靜默替換。
- **拖曳中的視覺回饋**：排序＝橘色插入橫線（既有）；疊合＝**目標整列外框高亮**＋`疊合 n/4` 提示。兩種語彙互斥，使用者知道現在放開會發生什麼。拖回左側解除時，群組外框轉虛線橘預告。

### 二、共用 V 軸：疊合後改為固定刻度

未疊合時維持 v3.8.1 行為（依可見視窗內的樣本自動縮放）。**一旦形成群組，V 軸改為固定**，理由是自動縮放會讓刻度一直跟著視窗跑，兩條疊在一起比較時基準一直在變，比較就失去意義。三態：

| 模式 | 範圍 |
|---|---|
| **固定**（預設） | 各成員 `wfgAnalogDisplayRange()` 的**聯集**。不隨視窗捲動縮放，但會跟著使用者改 VGH/VGL/gamma 更新 |
| **手動** | V/div 檔位 **0.5／1／2／5／10／20** × 格數，配中心電壓 |
| **自動** | 各成員 auto-range 的聯集（＝ v3.8.1 的行為，保留給需要的人） |

「固定」取 `wfgAnalogDisplayRange()` 而不是 `analog_config.voltage_min/max`：前者是為「顯示用的完整範圍」而存在的入口，SD1 會回 gamma rail（0.2~9.8V）而不是較寬的 0~10V 框，波形上下不會留一段永遠沒有訊號的空白。也不取「全時間軸樣本聯集」—— 三條類比的預計算都是 viewport-lazy（`computedExtent`），全時間軸極值在使用者捲過去之前根本還沒算出來，捲一次就可能變大一次，反而**做不到「固定」**。

**水平格線**（本站原本完全沒有，只有垂直的時間格線）：每條波形 4 格、群組 4n 格，每格 17~19px。格線邊界剛好落在每條原本各自佔的 80px 邊界上，疊合前後視覺對位不跑掉。中線稍亮，沿用示波器慣例。V/div 值標在群組左下角。

### 三、電壓游標：一個框最多 8 條，顏色互不相同

- 每條波形保有自己那組 V1／V2，**2 條疊合＝4 條游標，4 條疊合＝8 條**。
- 配色採**同色相分波形、明暗分 V1/V2**：青 `#22d3ee`/`#0e7490`、黃 `#facc15`/`#a16207`、綠 `#4ade80`/`#15803d`、紫 `#c084fc`/`#7e22ce`。8 色互不相同，同時一眼看得出哪兩條屬於同一條波形。亮色取自站上時間游標既有的深底色盤；刻意避開洋紅 `#f472b6`，因為 CKO 波形本身就是粉紫色會撞色。**顏色不落地儲存**，由群組內序位即時算出 —— 解除疊合就自動回到原本的 V1 青／V2 洋紅。
- **每條游標各自可開關**：左側標籤那顆游標鈕由整顆切換改為 `V1`／`V2` 兩段各自可點；兩段都關就整顆關閉（與 v3.8.1 的 `showCursors` 語意接上）。舊設定檔沒有這兩個欄位時一律視為開啟，行為與 v3.8.1 相同。
- **標籤避讓**：8 條讀值全部貼在同一個右緣 x，位置接近就會互相蓋住（2 條時就已經很擠）。改為依 y 排序後往下推開，游標線位置不動，被推離原位的標籤畫一條細引線連回自己那條線。

### 四、右側新增「電壓游標」卡片

只有出現疊合群組時才顯示。頂端是該群組的 **V/div 下拉 ＋ 中心電壓輸入**，下方逐條列出 `通道·V1／V2` 的讀值與 `|V1−V2|`，色塊即該條游標的顏色。放這裡的理由：canvas 右緣已經被電壓標籤佔滿，而右側面板對類比通道本來就是空的（`wfgMeasUpdatePhase` 對 `waveform_type≠0` 直接 `wfgMeasClear`）。改刻度時讀值就在旁邊即時對照。

### 🔴 五、一個容易寫錯的地方：frac → 電壓只能有一個換算來源

電壓游標存的是 **frac（0~1）不是電壓**，frac 相對於「該通道當下生效的範圍」。共用 V 軸之後，同一個 frac 會對應到不同的電壓。除了畫游標那處，**脈衝計數的 `v1Threshold` 自己又重算了一次**（用該通道自己的 auto-range）—— 不一起改就會出現「畫面上游標在這裡、脈衝卻用另一個電壓在數」的**靜默錯誤**（不會報錯、不會有 console 訊息）。本版把兩處統一到 `wfgSlotDisplayRange()` 這一個入口，並在程式碼裡寫明不准各自重算。

### 六、持久化

疊合狀態存在 channel 的 `ovlId`（不是 chIdx 清單 —— 排序是對 `wfgChannels` 做 `splice`，記索引會在排序後失效）；V 軸設定掛在群組上，匯出為 `config.overlayGroups`。**沒有群組時不寫出任何新欄位**，設定檔與 v3.8.1 相同。匯入一律**先無條件清空疊合狀態、再讀檔覆蓋**（與 v3.7.0／v3.8.0 的 panel 欄位同一套寫法），否則舊檔匯入後會沿用上一份設定的群組，變成「新波形＋舊群組」的混血 —— 就是 v3.0.1／v3.5.1 修過的那種殘留。v3.8.1 的舊設定檔載入正常、無群組。

### 用字

UI 文字、i18n、本條目一律用「**游標**」（站上既有用字）。全 repo 檢查：`wfg.html` 與 `common/i18n.js` 的「遊標」為 0 筆。`docs/pattern_ui_v2_plan.md:683` 有一筆，但它在引用區塊裡、是轉錄使用者當時的原話，**依裁示不動**（改它等於竄改紀錄）。

---

## TCON 波形模擬與取樣 (wfg) v3.8.1 — 2026-08-13 ｜ PATCH ｜ ⚠ 輸出變更

修三個回報的 bug：Subpixel 波形在改 Gate 條數後消失且不可逆、Subpixel 波形在約 6.5 秒之後躺平、跟隨滑鼠的垂直時間軸在類比／面板列上卡住不動。

判定依據：R1～R4 逐項判、取最高者。三項都是「讓行為回到本來就該是這樣」的 bug 修正 → §2 案例 2 ／ **R1 → PATCH**。R2 不適用（不開新波）。R3 不適用（使用者能做的事沒有多一件 —— Subpixel 本來就宣稱能用，只是壞了）。R4 不適用（起始狀態與預設值未動）。取最高 → **PATCH**。沒有任何一項落在 MAJOR：沒有移除功能、沒有入口消失、沒有控制項移位，既有操作全部照舊。
**掛 `⚠ 輸出變更`**：依 R1「⚠ 輸出變更的範圍定義」，三項都屬「**同一操作序列得到不同結果**」（舊結果是 bug 產物，但拿舊版建立的截圖／基線會失效）。修正前後受影響的具體情況見下方各節。

### 一、Subpixel 波形一改 Gate 條數就消失，移回原值也回不來 ⚠ 輸出變更

**現象**（Bruce 2026-08-13 回報，已於瀏覽器逐步重現）：拖 GATE 條數的拉把、按 ± 鈕、或在數字框直接打字，只要值一變，`SPX*` 那一列立刻變成 0.00V 的平線；把值改回原本的數字，`G*` 的波形會回來，**`SPX*` 仍舊是平線**。

**根因**：`_wfgInvalidateGateOnly()`（v3.4.0 的 Gate 效能優化）把 Gate 與 Subpixel 兩筆預計算一起 `delete`，而且**刻意不動 `_wfgPrecomputeVer`** —— 為的是讓 `wfgRender()` 內 `if (_wfgPrecomputeVer !== _wfgAnalogCacheVer) wfgPrecomputeAnalog()` 不被觸發，Gate 改走 render 的 viewport fallback（對 Gate 而言比預計算便宜得多）。問題是 **Subpixel 沒有 viewport fallback** —— 它是從 line 0 累積下來的狀態機，只算 viewport 得不到正確的起始電壓，所以 v3.8.0 在該分支寫的是「畫一條 0V 直線，不讓通道整條消失」。兩者相加的結果就是：預計算被刪、沒有人重算、fallback 只會畫 0V。不可逆則是因為每一次改 Gate 條數都再刪一次。

`_wfgInvalidateSpxOnly()`（改 Subpixel 充電時間、TFT 導通／關閉電壓）是同一個形狀的問題，一併修掉。

**修法**：新增 `_wfgSpxStale()` ／ `_wfgEnsureSpxPrecomp()`，在 `wfgRender()` 內另開一道**只算 Subpixel 一條**的閘門。它不碰 SD/LS，v3.4.0 的 Gate 效能優化原封不動（改 Gate 條數仍然不會重算那 7 條 CKO）。
Subpixel 需要的 Gate 資料只有 events（每 frame 一個 pulse，全長也才 2000 筆）與四個 RC／電壓參數，**用不到 Gate 預計算裡那塊 `computeExtent×20` 的 Float32Array（實測 30MB 以上／條）**。因此新增 `_wfgGateSourceForSpx()`：Gate 的預計算缺席或算得不夠遠時，Subpixel 自己建這份最小來源，成本與 Gate 的預計算無關。`_wfgPrecomputeSpxChannel()` 的計算上限因此不再把 `gateExt` 取 min。

**影響**：修正前只要動過 Gate 條數，Subpixel 一律是 0V 平線 —— 那個畫面不再出現。

### 二、Subpixel 波形在約 6.5 秒之後整段躺平 ⚠ 輸出變更

**現象**（Bruce 2026-08-13 回報）：Subpixel 只有前段有充放電，之後變成一條水平線。

**根因（實測數據，非推論）**：以還原的預設設定（1112 line × 1000 frame ＝ 1,112,000 line ＝ 16.67 秒）量測 —— 剛載入時 SD1／Gate／Subpixel 三者的 `computedExtent` 都是 **432,608**（＝6.48 秒，與畫面上的分界吻合）；按「全覽」之後 `sd.ext` 與 `gate.ext` 都延伸到 **1,112,000**，而 **`spx.ext` 仍停在 432,608**。也就是 Subpixel 根本沒被重新計算，超出範圍之處由 `_wfgSpxVoltageAt()` 回傳最後一段的 `hold` 值 —— 表現出來就是一條平線。

漏接的位置有兩處，兩處都補上：
1. `wfgPrecomputeAnalog()` 的 `needSD` ／ `needLS` 掃描**只認 `waveform_type` 1 與 2**，只有 Subpixel 過期時會在 `if (!needSD && !needLS) return` 早退，於是它下面那段「比對上游 `computedExtent`、不符就重算 type 3」的邏輯永遠跑不到。改由上述 `_wfgEnsureSpxPrecomp()` 這條獨立閘門處理。
2. SD／LS 的 lazy-extend 掛在 `wfgSamplesFromPrecomputed()` 裡，也就是 render **畫到那一列時**才發生，比閘門晚。若照 SD 當下的 extent 去算，Subpixel 只會算到舊範圍，要等下一次 render 才跟上（表現成「捲過去之後畫面不動，要再動一下滑鼠才出現」）。因此 `_wfgEnsureSpxPrecomp()` 會先主動把上游 SD1 延伸到需要的範圍再算。

**驗證**：修正後同一組設定按「全覽」，`spx.ext` ＝ 1,112,000、`segs` ＝ 1000（1000 個 frame 各一個 pulse），畫面上 Subpixel 的充放電橫跨 0～16.67 秒全段。

**影響**：修正前用全覽或捲到後段所存下來的 Subpixel 截圖，後段是平的；新版會有波形。

### 三、跟隨滑鼠的垂直時間軸在類比／面板列上卡住 ⚠ 輸出變更

> **這一項不是 v3.8.0 引入的。** 已用 v3.7.0（commit `ef99432`）實測比對：同樣把滑鼠移到 SD1 那一列，虛線同樣停在最後一次停留在數位列的位置。屬既有缺陷。

**現象**（Bruce 2026-08-13 回報並自行找到重現條件）：滑鼠在**數位訊號列**（VST1／XSTB／CK1~CK6／XPOL／LC）上時，跟隨滑鼠的垂直虛線正常；一移到**類比訊號列**（SD1／CKO1~CKO6）或**面板訊號列**（G／SPX），虛線就停在原地不動。原先「點擊後消失」「滑鼠移太快就停住」的描述，都是滑鼠恰好落在這幾列造成的表象。

**根因**：垂直虛線（crosshair）是在 `wfgRender()` 裡依 `_wfgTconHover` 畫的，而**重繪的責任一直掛在量測路徑上**。`wfgMeasUpdatePhase()` 對 `waveform_type` 非 0 的通道走的是 `wfgMeasClear(); return;` —— 即時測量卡正確地清成 `--`，但**沒有呼叫 `wfgRender()`**；數位列則會一路跑到函式結尾的 `wfgRender()`。列與列之間的空白、找不到 transition 等早退路徑也是同一個形狀。

**修法**：不動量測本身的任何判斷（避免把即時測量的行為一起改掉）。新增純計數的 `_wfgRenderSeq`，在 mousemove 的 rAF 回呼裡記錄呼叫 `wfgMeasUpdate()` 前後的值，**這一輪沒有人重繪就補一次** —— 涵蓋全部早退路徑，成本與數位列本來就在付的一次 `wfgRender()` 相同。

**影響**：滑鼠停在類比／面板列時，虛線與時間標籤的位置會跟著滑鼠，不再停留在舊位置。

---

## TCON 波形模擬與取樣 (wfg) v3.8.0 — 2026-08-13 ｜ MINOR ｜ ⚠ 輸出變更

新增**面板信號 → Subpixel 電壓**波形，並修正 0~255 充放電刻度長年綁在 line 上的問題。

判定依據：逐項判、取最高者。①「修正 0~255 刻度的 line 依賴」＝ 讓行為回到刻度本來就該有的定義（絕對時間），屬 bug 修正 → §1 判定表「既有功能的輸出：修正為原本就該有的行為」＋ R1 → **PATCH**。**但在非預設 timing（Vtotal／Frame Rate 與基準值不同）下，這會改變既有 CKO / SD1 的波形輸出**，所以掛 `⚠ 輸出變更`。②「新增 Subpixel 波形」與「新增 Subpixel 充電時間參數」＝ 使用者多了能做的事、既有操作全部留在原位 → §2 案例 1／R3 → **MINOR**。③「改名」與「搬移 TFT 設定」＝ 文案與控制項在同一張「面板信號」卡片內相鄰兩格之間移動，不構成「原本的按鈕找不到了」→ §2 案例 3 → **PATCH**（依 R2 補充第 3 點「不確定一律往低編」，取捨寫在此供覆核）。取最高 → **MINOR**。沒有任何一項落在 MAJOR：沒有移除功能、沒有入口消失、既有操作全部照舊。

---

### 一、修正 0~255 充放電刻度的 line 依賴 ⚠ 輸出變更

**問題**：`TAU = 2.0 × exp(-0.0235 × (255 - c))` 這個數字**直接被當成「幾條 line」**餵進 `exp(-Δline / TAU)`（原始碼註解白紙黑字寫著 "RC tau (line periods)"）。於是 line 一變長變短，充放電的絕對時間就跟著等比縮放。

**依據**：Bruce 2026-08-13 裁示 —— 這個刻度沒有單位、只表示程度，但它對應的**絕對時間不得隨 line 長度改變**。改 timing 只該改變「在同一個導通窗口內充到哪個電壓準位」，不該改變曲線本身的快慢。

**修法**：把舊公式的輸出重新定義為「**基準 timing 下**的 line 數」，乘上基準 line 時間得到與 timing 無關的絕對時間常數，執行時再除以當下的 line 時間換算回 line。12 處各自複製一遍的 τ 計算收斂成單一 `wfgRcTauLine()`。

```
tau_abs(c) = 2.0 × exp(-0.0235 × (255 - c)) × T_LINE_REF     ← 固定，與使用者 timing 無關
tau_line   = tau_abs(c) / T_line_now
```

`T_LINE_REF = (2200 / 2) / 74.25 μs = 1 / (1125 × 60) 秒 = 14.8148…μs`，取自本檔 `wfgFrame` 的**程式預設值**（FHD 60Hz）。刻意寫成 `(2200/2)/74.25` 而不是數學等價的 `1e6/(1125*60)`，是要與 `wfgLineTimeUs()` 的運算序列逐運算相同 —— 基準 timing 下兩者才會是同一個 double，比值才會嚴格等於 1.0，乘 1.0 不動任何一個浮點位元。

🔴 **「只改 Htotal」看不出這個 bug**：本工具的 `tconHtotal = 2e6 × DCLK / (vtotal × fps)`，代回 `T_line = (tconHtotal/2)/DCLK` 之後 **Htotal 與 DCLK 互相抵消**，`T_line = 1/(vtotal × frameRate)`。真正會改變 line 絕對長度的是 **Vtotal 與 Frame Rate**。

**實測（curvature 全程固定 60，量 CKO1 上升沿 10→90% 的絕對時間）**

| 條件 | 1 line | 修正前 | 修正後 |
|---|---|---|---|
| Htotal 2200 | 14.81 μs | 0.6739 μs | 0.6748 μs |
| Htotal 3300 | 14.81 μs | 0.6699 μs | 0.6699 μs |
| **Frame Rate 120** | 7.41 μs | **0.3374 μs** ⬇ 減半 | **0.6705 μs** ✅ 不變 |
| **Vtotal 2250** | 7.41 μs | **0.3374 μs** ⬇ 減半 | **0.6705 μs** ✅ 不變 |

SD1（下降沿，curvature 60）同樣：修正前 60Hz 0.6485 μs → 120Hz 0.3243 μs（減半）；修正後 120Hz 為 0.6590 μs（不變）。誤差 ≤ 1.6%，來源是像素量測的垂直解析度（68 px 擺幅，10% ≈ 6.8 px）。

**零差異保證（驗收）**：FHD 60Hz 標準 timing（2200×1125@60、DCLK 74.25，這組本身自洽：rxDclk = dclk = 74.25 ⇒ tconHtotal = htotalBase = 2200）下，四個檢視範圍（0~100 / 3.2~4.6 / 4.4~5.8 / 0~1200 line）的 canvas 逐 32-bit 像素 FNV-1a 與 v3.7.0 **完全相同**。負向對照：故意把 VGH 30→25，四個雜湊全部改變，證明比對有鑑別力。

### 二、Subpixel 電荷 → **Subpixel 電壓**（三語）

`wfg.subpixelCharge` 換成 `wfg.subpixelVoltage`，繁中／簡中／英文都補齊。

### 三、TFT 導通／關閉電壓搬到 Subpixel 電壓卡片

v3.7.0 放在「Gate Line」卡片裡，但這兩個值只影響 Subpixel 的充放電、不參與 Gate 波形繪製，因此搬到「Subpixel 電壓」卡片。**兩個欄位、範圍提示、判定框的內容與行為一字未改**，只換位置。夾制三條（導通 > VGH 夾到 VGH、關閉 < VGL 夾到 VGL、關閉 > 導通夾到導通）與判定框皆重測通過。

差別只有一處，是搬移的必然結果：TFT 電壓現在**真的會進入計算**（決定 Subpixel 何時導通），所以改值時會觸發 Subpixel 重算；Gate 波形仍完全不受影響。

### 四、新增 Subpixel 波形

新的虛擬 slot（`waveform_type = 3`，接在 gate slot 之後），自動指派輸出通道並命名 `SPX<n>` 跟著 Gate 條數走，另有「在波形區顯示 Subpixel 波形」勾選框（比照 Gate）。

**行為（依 Bruce 2026-08-13 定案）**

```
起始           ：波形最左邊 0V
追蹤對象       ：Gate Line 卡片目前選的那一條 G
導通判定       ：Gate 電壓 > TFT 導通電壓 → 開始朝 SD1 以 RC 充電
關閉判定       ：Gate 電壓 < TFT 關閉電壓 → 停止積分
保持           ：🔴 hold 在 **Subpixel 自己當下的電壓**，不是 SD1 的值
                 —— 沒充飽就停在半路，這正是要呈現的東西
中間帶         ：關閉電壓 < Vgate < 導通電壓 → 維持前一個狀態（遲滯）
```

**刻意不寫特例**：TFT 導通電壓 > VGH（判定框顯示「無法充電」）時，導通條件永遠不成立，自然結果就是恆 0V；VGL > TFT 關閉電壓時，自然結果是一路追隨 SD1（TFT 關不掉）。兩者都由模型自然產生，判定框已經會標紅，不需要也不應該加分支。

**實作**：Subpixel 是本工具第一個吃另外兩條通道計算結果的波形（Gate 決定何時導通、SD1 決定充電目標）。slot index 遞增保證上游先算完；`_wfgInvalidateGateOnly` / `_wfgInvalidateLsOnly` 一併失效 Subpixel；非同步全量重算時上游要從 `newPrecomp` 讀（那時 `_wfgPrecomputed` 還沒被指派）。積分只在每個 frame 的 gate pulse 期間細算（其餘時間是水平的 hold 線），所以 1000 frame 也不會拖慢。

Y 軸下緣一律含 0V —— `wfgDrawAnalogChannel` 是直接讀 `analog_config.voltage_min` 當自動縮放的夾制範圍，不經過 `wfgAnalogDisplayRange`，所以 0V 要寫進 `voltage_min` 本身，否則波形全平時 0V 會落在框線外。

### 五、新增 Subpixel 充電時間（0~255），預設 150

與 CKO / SD1 共用同一支 `wfgRcTauLine()`，因此同樣是「刻度只表示程度、對應的絕對時間不隨 line 長度改變」。讀值框同時顯示 τ 的 μs 與 line 佔比，換了 timing 之後 μs 不變、line 佔比會變，充飽程度跟著變，這件事在畫面上看得出來。

**預設 150 的依據**：在程式預設 timing 下 τ = 2.50 μs、5τ = 12.5 μs = 0.844 line；預設 6-phase GOA 的 gate pulse 約 1 line ≈ 14.8 μs ⇒ 充電曲線佔滿導通窗口的 84%，RC 形狀一眼可見，同時仍充得到 99.3%，不會讓人一開啟就以為壞掉。把 Frame Rate 往上調、或把這個值調大，就會開始看到充不飽。

**「充不飽」實測**：同一組 timing 與 gate 設定，充電時間 150 → Subpixel 峰值 4.79V（SD1 為 4.80V，幾乎充飽）；改成 215 → 峰值只到 **3.57V** 就被 Gate 關閉截斷，且 hold 明顯停在半路而不是掉到 SD1 當時的 0.20V —— 證實 hold 的是自己的節點電壓。

### 舊檔相容

沒有 `panel.spx_rc` / `panel.spx_show` 的舊設定檔照樣載入，落回預設 150／顯示；`config.gpios` 少一個 slot 時，新的 subpixel slot 由 slot 重建流程補上並自動指派輸出通道。實測以 v3.7.0 匯出的設定檔載入無 alert、無 console error。

---

## TCON 波形模擬與取樣 (wfg) v3.7.0 — 2026-08-13 ｜ MINOR ｜ ⚠ 輸出變更

「面板信號 → Gate Line」卡片新增 **TFT 導通電壓**與 **TFT 關閉電壓**兩個設定（預設 **20V** / **−5V**），並新增一個判定框，顯示目前的驅動電壓（VGH/VGL）帶不帶得動這顆 TFT。

### 這兩個值是什麼（決定了它們的行為）

**它們是 TFT 元件本身的參數，不是 Gate 驅動端的輸出擺幅。**（Bruce 2026-08-13 定調）

- **Gate Line 波形完全不變**，仍然由 VGH / VGL 驅動。這兩個值**不參與任何波形計算**。
- 它們供後續「Subpixel 電荷」功能計算充放電行為使用，本版先做「登記 ＋ 判定 ＋ 存檔」。

### 兩種情境的行為刻意不同

| 使用者在改什麼 | 行為 |
|---|---|
| **TFT 導通／關閉電壓** | 約束成立，夾在 `VGL ≤ 關閉 ≤ 導通 ≤ VGH` 內 |
| **VGH / VGL** | **完全不連動 TFT 值**，數值原封不動 |

🔴 **約束只在「輸入 TFT 值的當下」檢查，不是持續強制的不變式。** 理由是物理的：TFT 導通電壓是元件特性，不會因為驅動電壓變小就跟著變小。所以把 VGH 從 30V 調到 15V 時，TFT 導通電壓仍然停在 20V —— 此時驅動電壓已經到不了 TFT 需要的電位，**代表 Subpixel 沒辦法充電**，這個狀態是允許存在的，並由判定框如實顯示，不靜默、不自動修正任何一邊的數值。

### 判定框

充電與放電**分開判**，互不牽連：

- 充電：`VGH ≥ TFT 導通電壓`，不成立 → `✗ Subpixel 無法充電`
- 放電：`VGL ≤ TFT 關閉電壓`，不成立 → `✗ Subpixel 無法放電`
- 另有 `關閉電壓 > 導通電壓` 的參數矛盾判定：欄位輸入的夾制不可能產生這個狀態，只有手改過的設定檔匯入才到得了；靜默放過會讓後續 Subpixel 計算拿到無意義的參數，故一併標出。

不成立時判定框邊框轉紅（`#ef4444`，沿用既有的 `.wfg-la-link-toast.err` 錯誤配色），並只對出問題的那個欄位加紅框。

### 夾制 vs 阻擋的取捨（供覆核）

選**夾制**，理由有二：(a) 本專案唯一同類慣例就是夾 —— 充放電時間倍率的 `wfgClampGateRcMult()`；(b) 在 `oninput` 階段阻擋會在打字打到一半時吃掉字元（要輸入 `-5`，先打的那個 `-` 會被判成無效值）。因此沿用 `wfgGateRcNumSync` / `wfgGateRcNumCommit` 的既有分工：`oninput` 夾值但**不回寫欄位**，`onchange`（失焦／Enter）才把欄位回寫成實際生效的值。

### 改動範圍

| 檔案 | 內容 |
|---|---|
| `wfg.html` | `wfgPanel` 新增 `tft_von` / `tft_voff`；新增 `wfgDriveRange` / `wfgClampTftVon` / `wfgClampTftVoff` / `wfgRoundV` / `wfgFmtV` / `wfgTftStatus` / `wfgRenderTftRow` / `wfgUpdateTftReadout` / `wfgOnTftVoltInput` / `wfgOnTftVoltCommit`；Gate 卡片 UI 兩個數字框（沿用 VGH/VGL 那組的 `wfg-gpio-grid-2` 版面，左側面板寬度不足時自動堆疊）＋範圍提示＋判定框；接進 `wfgRenderPanelCard()`、`wfgOnLsGlobalChange()` 的 `vgh`/`vgl` 分支、`wfgLoadPreset()`、`wfgResetToDefault()`、匯入設定 |
| `common/i18n.js` | 新增 11 個 `wfg.tft*` key，三語（zh-TW / en / zh-CN）齊備 |

**波形相關的路徑一個位元都沒有改動**：`wfgSyncGateGpio()` 的電壓賦值、`_wfgLsBuildCondensedEvents` / `_wfgLsBuildDualCpvEvents` 讀 `wfgLsGlobal.vgh/vgl` 那兩處、以及 LS 通道右側的 `VGH`/`VGL` 標籤，全部維持原狀。

**判定依據：** §1 判定表逐欄複核 —— 操作流程：多了兩個欄位，既有控制項全部在原位 → PATCH；既有功能的輸出：Gate 波形與所有計算零改變 → 不變；功能增減：**新增獨立功能**（登記 TFT 參數 ＋ 充放電可行性判定）→ **MINOR**。R1～R4 逐項複核：R1 不適用（不是修 bug）、R2 不適用（未開新波，v3 這一波延續）、R3 適用 → **MINOR**（使用者多能做一件事：設定 TFT 參數並看出當前驅動設定能不能充放電）、R4 不適用（新欄位自己的預設值，不是改變既有欄位的預設）。取最高者 → **MINOR** → `v3.6.1` → **`v3.7.0`**。**沒有任何一項落在 MAJOR。**

**`⚠ 輸出變更` 的範圍（刻意標窄，供覆核）**：依 R1 的範圍定義逐項對照 —— 數值類：波形逐像素零差異、所有計算結果零差異，**唯一變的是匯出 JSON 會多兩個 key**（`panel.tft_von` / `panel.tft_voff`，因為匯出是整包序列化 `wfgPanel`），拿舊版匯出的 JSON 做位元組比對會撞到，故標；版面／構圖類：**不標** —— 左側控制面板的 Gate 卡片變高，但波形區 canvas 與截圖／匯出圖片的構圖零改動，且純新增控制項依定義本就不標；同一操作序列結果不同：**不成立**。

**相容性**：舊的 preset / autosave / 匯入檔沒有這兩個欄位 → 落回預設 20 / −5，載入不報錯。匯入檔若有這兩個欄位則**原樣保留、不夾** —— 夾住等於竄改使用者存下來的內容；檔案本身就是不成立的狀態（例如 VGH 20V 配 TFT 導通 25V）會如實載入並由判定框標紅，這與「改 VGH/VGL 不回頭動 TFT 值」是同一個原則。載入 preset 與「切回快捷設定 placeholder」則回到預設值（與 cursor、充放電倍率同屬「整組套用一份狀態」的語意）。

**不碰說明頁**：`wfg-guide.html` 未更新（功能仍在調試階段，依 Bruce 指示待確定後再更新）。

---

## TCON 波形模擬與取樣 (wfg) v3.6.1 — 2026-08-13 ｜ PATCH

「輸出通道」卡片的訊號下拉選單裡，Gate Line 那個項目的模式標籤由 **`LS`** 改為 **`LCD`** —— 顯示由 `GATE — LS` 變成 `GATE — LCD`。

Gate slot 在實作上借用了 Level Shifter 的計算管線（`waveform_type === 2`），標籤因此跟著印成 `LS`；但 LS ＝ Level Shifter，而這一列代表的是面板端的 Gate Line，兩者沒有關係，標籤是錯的。（Bruce 2026-08-13 指出）

**改動範圍**：`wfg.html` 建構訊號下拉選單的 `_modeLabel`（單一處）。CKO1～CKOn 同樣是 `waveform_type === 2`，它們確實是 Level Shifter 輸出，維持 `LS` 不變；只有 `WFG_GPIO_NAMES[gi] === 'gate'` 這一個 slot 改印 `LCD`。

**判定依據：** §1 判定表「操作流程 → 文案」與「既有功能的輸出 → 修正為原本就該有的行為」兩欄皆落在 **PATCH**；§2 **案例 2（改一個 bug → PATCH）**。R1～R4 逐項複核：R1 適用（見下方輸出變更取捨）、R2 不適用（未開新波）、R3 不適用（使用者能做的事沒有多一件，只是同一個項目的標籤更正）、R4 不適用（起始狀態與預設值未變）。取最高者 → **PATCH** → `v3.6.0` → **`v3.6.1`**。

**不標 `⚠ 輸出變更` 的取捨（供覆核）**：依 R1 的範圍定義逐項對照 —— 數值類（波形數值、計算結果、匯出檔案位元組）**未變**：匯出 JSON 寫的是 `ch.name`（`G1`…）與 gpio 的 `name`（`gate`），不含這個標籤；版面／構圖類**未變**：這是下拉選單內的 option 文字，波形區 canvas 與截圖構圖零改動；同一操作序列的結果**未變**：選單項目的順序、`value`（`ana:<gi>:<wt>`）、選中判定全部不動，只有顯示文字不同。三項皆不成立，故不標。**唯一會受影響的是「把下拉選單展開後截圖」這種比對**，因此在此寫明供覆核。

**相容性**：此標籤不參與任何持久化格式（preset / 匯出 config / autosave 皆不含），舊檔載入不受影響。

---

## TCON 波形模擬與取樣 (wfg) v3.6.0 — 2026-08-12 ｜ MINOR ｜ ⚠ 輸出變更

autosave 從「**寫了但從來沒還原過**」改成「**離開就存、回來就自動還原**」，並移除進入 TCON Timing 分頁時的「是否要保留之前的調整紀錄？」確認框。

**判定依據：** 本版三項改動逐一判定，取最高者：

| 改動 | 適用規則 | 級別 |
|---|---|---|
| 移除「是否要保留之前的調整紀錄？」確認框 | §2 **案例 6** 的但書＋**R2** 明文：「波內若移除既有入口，算在開頭那個 MAJOR 的宣告範圍內，**不再另計**」。該確認框是 `v3.0.0` 拆頁那一波的產物，屬**波內** | **不另計 MAJOR** |
| 自動還原修回歸（自 commit `4647a36` 拆頁後就沒作用過） | §2 **案例 2「改一個 bug → PATCH」** | **PATCH** |
| 開頁起始狀態由「空白」改為「上次的工作狀態」 | **R4**：起始狀態改變、不影響既有操作（沒有功能被移除、沒有入口移位、原本會的操作照樣能做）→ MINOR | **MINOR** |

取較高者 → **MINOR** → `v3.5.1` → **`v3.6.0`**。

🔴 **v3 這一波可以一路走到 v3.9x，只有真正的大變動才進 v4。** 對照 `wfg` 的 2.x 一路走到 `v2.97.475`：波內版號能走多遠，取決於有沒有出現需要使用者整個重新熟悉的大變動，不取決於改了幾次。**「改動看起來很大」不是進 MAJOR 的理由。**（Bruce 2026-08-12 明示）

`⚠ 輸出變更`：**開頁與切分頁的行為都與 v3.5.1 不同** ——
(a) 有存檔時，開啟／重整 wfg.html 會自動還原上次的全部參數與 cursor（v3.5.1 是一律空白）；
(b) TCON ↔ LA 分頁切換回來時同樣自動還原，且**不再跳確認框**（v3.5.1 會跳）；
(c) 還原期間會出現「還原上次的工作狀態…」進度視窗。
**以 v3.5.1 之前的版本建立、且假設「開頁必為空白」的截圖／逐像素基線，在有存檔的環境下不再直接適用**，需先清 localStorage 再建基線。無存檔的環境（全新使用者、清過 localStorage）開頁行為完全不變。

### 版號更正紀錄

**版號回溯核准：** Bruce 2026-08-12

本版原先編為 **v4.0.0**（commit `6e32687`，已 push），不符 `docs/VERSIONING.md` 的 **R2（一波重整以 MAJOR 開頭，波內的後續步驟依自身性質各自判定）**，**更正為 v3.6.0**。

- 本波重整自 **v3.0.0**（commit `8238ecb`，移除訊號產生器分頁）起算，波內後續不應重複進 MAJOR。R2 條文本身即載明理由，否則會出現 v2.0.0 → v3.0.0 → v4.0.0 這種編號。
- 原條目以一段自填的「**波次宣告**」主張「上一波已在 v3.5.1 結束、本版開啟新的一波」而放行 MAJOR。**這個宣告不成立**：規則從未定義「一波如何結束」，也沒有授權 agent 自行判定波次終結；「主題與上一波沒有交集」不是波次界線的判準。**開新波必須有 Bruce 的明示裁示**（本次已補進 `docs/VERSIONING.md` §1 R2）。
- 移除確認框那一項，正是 R2 明文「波內若移除既有入口，算在開頭那個 MAJOR 的宣告範圍內，不再另計」所涵蓋的情形，原條目卻拿它當 MAJOR 的主要依據 —— 條文被跳過。
- 更正後依剩下兩項（修回歸 PATCH ＋ 起始狀態改變 R4 MINOR）取較高者 → **MINOR → v3.6.0**。

**這是同一個錯誤的第二次。** 第一次是 `pattern` v4.0.0（見本檔 pattern v3.1.0 的〈版號更正紀錄〉），`tools/version_bump_check.py` 就是為了防它而寫的，卻仍然放行了本次 —— 因為它接受**自由填寫**的「波次宣告」作為放行條件，防呆被一個自己填的欄位繞過去。**同 commit 已修**：MAJOR 改為必須有 `MAJOR 核准：Bruce YYYY-MM-DD` 這一行才放行，「波次宣告」降級為純說明、不再構成放行條件。

**為什麼這次可以回溯**（`docs/VERSIONING.md` §5「歷史版號一律不回溯調整」的**明示例外**，依 **Bruce 2026-08-12 裁示**）：

| 顧慮（§5 方案 B 列的代價） | 本次情況 |
|---|---|
| git commit message 裡的版號改不掉 | **屬實，不迴避**：`6e32687` 會永遠寫著 v4.0.0 留在歷史裡。靠本節說明，**不改寫歷史、不 force push、不 rebase**，以一個新的更正 commit 處理 |
| tag / Release 對不上 | **不存在**：本 repo `git tag` 為空，沒有任何 tag 或 Release |
| cache buster 要重算 | 只有 `wfg.html` 兩處，已改 `20260812wfg400` → `20260812wfg360` |
| 記憶中的版號、外部紀錄失效 | v4.0.0 上線僅數小時、未對外宣告，回溯成本遠低於讓錯誤編號永久固化 |

### 一、修正：autosave 自動還原整個沒跑（不只是 cursor，是 19 個欄位全沒還原）

**現象**（v3.5.1 結案時列出的既有問題）：改完參數重整頁面，cursor 不會回來。

**真正的範圍比回報的大得多**：實測 v3.5.1，重整後**沒有任何一個欄位還原** —— Htotal 2200（存檔 2668）、Frame 數 10（存檔 1000）、`xstb` r_dly 0（存檔 1116）、cursor 全空（存檔 4 支 active）、檢視範圍 0–100（存檔 601590–601606）、快捷設定下拉是空的（存檔 `fhd_60hz_sg_ls_dual_cpv`）。cursor 只是最先被注意到的那一項，**不是獨立的 cursor bug**。

**根因**：自動還原 `wfgAutoRestore()` 全檔只有一個入口 `wfgPrepareTconTimingEntry()`，而它在 wfg.html 的兩個呼叫點都走不到：

| 呼叫點 | 為什麼走不到 |
|---|---|
| `wfgSwitchMode()` 的 `mode==='tcon' && prevMode!=='tcon'` | `wfgCurrentMode` 初值就是 `'tcon'`，純載入頁面時 `prevMode` 也是 `'tcon'`，條件永不成立 |
| `wfgEnterPage()` 內的無條件呼叫 | **`wfgEnterPage()` 在 wfg.html 沒有任何呼叫者**，它唯一的呼叫端在舊 SPA `legacy-index.html:4727` |

commit `4647a36`「Phase 5: extract WFG to wfg.html」把 WFG 從 SPA 拆成獨立頁時，**只搬了 `wfgEnterPage()` 的定義，沒搬呼叫端**，自動還原就此靜默失效至今。

**證明是「沒人呼叫」而不是「套用失敗」**（三組互相印證的實測，全部不改一行 code）：

1. 手動跑 `wfgImportConfig(wrapper.config)` → `true`，上述每一個欄位**全部正確還原**，時基標尺卡片立刻長出 `|A1-A2| … 33.234 kHz`；
2. stub `confirm` 回 `true`，跑 `wfgSwitchMode('la')` → `wfgSwitchMode('tcon')` → 還原完整（含 cursor 與 preset 下拉）；
3. localStorage 內容完整無缺（29113 bytes，19 個 config 欄位，cursor 與 `panel.gate_rc_mult` 都有寫）→ **寫入端沒有任何缺漏，本版一行未改**。

**修法**：`wfgInit()` 末尾新增 `wfgInitTconTimingEntry()`，補回遺失的呼叫端。**不為 cursor 另寫任何特例** —— 根修好，cursor 自然跟著回來。

### 二、設計變更：移除確認框，改為靜默自動還原

原本的確認框問「是否要保留之前的 TCON Timing 調整紀錄？」。移除的理由來自使用者的實際情境：

> 「我根本就不會存檔。我可能是在調 timing，調一調以後，我切到別的分頁、或是跳離開這一頁，它就要自動存檔……我再切回這個分頁，它要可以復原原本我調的 timing，或是我按重新整理也要可以復原，這是我最初的目的。除非我將快捷選單設成預設的，它才會整個清除。」

也就是 autosave 對使用者而言是「**工作階段的延續**」，不是一道要不要載入的選擇題。定版後的三個時機：

| | 時機 |
|---|---|
| **存檔** | 切換分頁／離開頁面／重新整理 → 自動存進 localStorage（寫入端原本就完整，未改動） |
| **還原** | 回到分頁／重新整理 → **靜默自動還原，不跳任何確認框** |
| **清除** | **唯一的主動入口 = 把快捷選單設回「快捷設定」** |

連帶處理掉的死碼與註解：

- 移除 i18n 的 `wfg.tconKeepRecordConfirm`（確認框文案，已無呼叫者）
- `wfgPrepareTconTimingEntry()` 內的 `confirm` 分支與「選不保留 → `wfgResetToDefault()`」分支整段刪除
- 三個名稱含 `Prompt` 的識別字改名，避免留下「這裡會跳框」的誤導：`wfgTconPromptBusy` → `wfgTconRestoreBusy`、`wfgSuppressTconPrompt` → `wfgSuppressTconAutoRestore`、選項 `skipTconPrompt` → `skipTconAutoRestore`（4 個呼叫端一併更新）
- `wfgClearAllCursors()` 與 `wfgImportConfig()` 內描述舊 confirm 行為的註解已更新為現況

🔴 **v3.5.1 列的四個清空入口少一條**：「進 TCON 分頁選『不保留上次紀錄』」隨 confirm 一起消失（它本來就是 confirm 的產物）。其餘三條（`wfgLoadPreset()`／切回 placeholder 的 `wfgResetToDefault()`／`wfgImportConfig()` 無 `cursors` 欄位）全部保留且已回歸驗證。

### 三、安全性與可觀測性

| 項目 | 做法 |
|---|---|
| 存檔壞掉不可以讓開頁失敗 | 新增 `wfgReadAutoSavedTconState()` 統一驗證：localStorage 不可讀／外層 JSON 壞／缺 `config` 字串／內層 JSON 壞／`_format` 不符 —— 任一不合就**當作沒有存檔**、`console.warn` 留一行可查訊息、正常進空白狀態 |
| 不可以假裝在還原 | 上述任一情況都不顯示進度視窗、不跳 alert |
| 還原期間要看得出在做事 | 還原前先叫出既有進度視窗（新增 i18n `wfg.progressRestore`：「還原上次的工作狀態…」），還原完才收掉 |
| 耗時要查得到 | 還原成功時 `console.info` 一行「已自動還原上次的工作狀態（耗時 N ms）」 |

> `_format` 必須在**丟進 `wfgImportConfig()` 之前**先驗：`wfgImportConfig()` 對格式不符的內容會跳 `alert()`，不先擋的話一份壞掉的 localStorage 會讓使用者每次開頁都吃到一個莫名其妙的警告框。

**🔴 兩個時序陷阱**（都是實作時容易踩反的）：

- 呼叫點必須放在 `wfgInit()` **最後一行**：上面那段「預設收合所有卡片」會覆蓋卡片收合狀態，還原要在它之後才不會被蓋掉。
- **顯示進度視窗不可以只用 `setTimeout(…, 0)`**。`setTimeout(0)` 只保證「讓出一個 task」，**不保證中間發生一次 paint** —— 瀏覽器可以在下一次繪製前就執行 callback，結果是 DOM 上 overlay 已經是 `display:flex`，使用者卻整整 4.5 秒什麼都沒看到（DOM 對、畫面不對）。要保證畫出來只能用**雙層 `requestAnimationFrame`**。但 rAF 在背景分頁會被完全凍結，只靠 rAF 等於「在背景分頁開啟時永遠不還原」→ 最終做法是**雙 rAF ＋ 300ms `setTimeout` fallback，誰先到誰算數**。

### 四、效能：如實量測，不迴避

還原是同步的（`wfgImportConfig()` 內含整張波形重繪），存檔越重越久。實測（本機 Chrome，`http://127.0.0.1` 起 server）：

| 情境 | 量測 |
|---|---|
| 還原一份 **1000 frame Dual CPV**（29113 bytes，16 個 GPIO、4 支 cursor） | `console.info` 量到 **4474 ms** |
| 同一份存檔，開頁到 `loadEventEnd` | **4121 / 4932 / 5542 ms**（三次） |
| **無存檔對照組**（清空 localStorage） | **175 / 191 ms** |
| 清除後（空狀態存檔）重整 | **175 ms** |

→ 還原成本 ≈ **4~5 秒**，期間畫面凍結但有進度視窗。這是選擇靜默還原的必然代價，**沒有用「部分還原／延遲還原」偷改語意**。若日後嫌慢，那是效能題目，不是改回詢問的理由。

補充：還原路徑**不會**觸發 `wfgPrecomputeAnalogAsync()`（波形走 viewport fallback 繪製），所以看不到「預計算類比波形 (n/8)」那個進度，4.5 秒全部花在同步的 import ＋ 重繪上。

### 驗證

| # | 項目 | 結果 |
|---|---|---|
| ① | 調 timing（Gate 條數 7、充放電倍率 2.3）→ 重整 | 全部還原（Htotal 2668／Vtotal 1112／DCLK 89／Frame 1000／`panel.gate_line` 7／`gate_rc_mult` 2.3／UI 輸入框同步顯示 7 與 2.3／cursor A1 A2 B1 B2 含精確時間／檢視範圍／LINE BUFFER 4／preset 下拉），**confirm 呼叫次數 0** |
| ② | 調 timing → 切到 LA 分頁 → 切回 TCON | 同樣全部還原，**confirm 呼叫次數 0**，`console.info` 量到 4474 ms |
| ③ | preset 設回「快捷設定」 | enabled GPIO 16 → **0**、active cursor 4 → **0**、時基標尺卡片回到「尚未建立 cursor」、波形區顯示「📟 請載入預設或新增信號以開始」 |
| ④ | ③ 之後重整 | **維持空狀態**（0 cursor／0 GPIO／preset 空／空狀態文字），**沒有把清空前的舊存檔撈回來**；autosave 內容已同步變成空狀態 |
| ⑤ | 清空 localStorage 後開頁 | 空白狀態、零錯誤、loadEventEnd 191 ms |
| ⑥ | localStorage 塞壞資料（6 種：非 JSON／缺 config／config 非 JSON／`_format` 不符／空字串／config 為 null） | 全部**不跳框、不跳 alert、不顯示進度視窗**，console 各有對應訊息，維持空白；真實開頁載入壞存檔亦正常（loadEventEnd 124 ms、工具列與空狀態文字都在） |
| ⑦ | 清空入口回歸（扣掉已移除的 confirm 那條） | 載入有 cursors 的 preset → 套用；載入無 cursors 的 preset → 清空；匯入無 `cursors` 欄位的設定檔 → 清空；切回 placeholder → 清空。sticky 時間軸兩張 canvas **逐像素檢查 nonTransparentPx = 0** |
| ⑧ | 進度視窗真的被畫出來 | 連拍截圖抓到還原中的畫面：空白工具畫面 ＋ 綠色進度條 ＋「還原上次的工作狀態…」 |
| ⑨ | console 零錯誤 | 走完整流程（換 3 種 preset、LA↔TCON 切換、縮放／全覽／重置、匯出再匯入）：`error` / `unhandledrejection` / `console.error` / `console.warn` **全部為空** |
| ⑩ | 語法靜態檢查 | `wfg.html` 內嵌 JS（26636 行）、`common/i18n.js`、`common/version.js` 三者 `node --check` 全數通過 |

**已知且刻意未改**：切回「快捷設定」時 Frame 參數（Htotal／Vtotal／Frame 數）**不會**跟著重置，這是 `wfgResetToDefault()` v3.5.1 之前就有的既有行為，本版未動。被清掉的是波形（GPIO 全部 disable）、cursor 與時基標尺。

---

## TCON 波形模擬與取樣 (wfg) v3.5.1 — 2026-08-12 ｜ PATCH ｜ ⚠ 輸出變更

**判定依據：** 本版三件事的共同性質都是「**v3.5.0 應該做到卻漏掉的路徑**」→ `docs/VERSIONING.md` §2 案例 2「改一個 bug → PATCH」。使用者能做的事**沒有多一件**（R3 判準不成立），控制項位置與波形數值皆未動 → **PATCH**，`v3.5.0` → `v3.5.1`。

> 🔴 第 3 項（匯入無 `cursors` 欄位的設定檔時清空 cursor）是行為變更，這裡記錄取捨供覆核：§1 判定表「既有功能的輸出主動改變 = MAJOR」字面上套得上。判給 PATCH 的理由是 —— 它不是新的設計決定，而是把 **v3.5.0 已經裁決過的同一條語意**（「一份 preset／設定檔是完整定義一組情境，不是只覆蓋它有提到的欄位」）補用到漏掉的入口上；v3.5.0 已為此語意付過一次 MINOR，同一件事不重複計價。若覆核認為匯入路徑應獨立計價，本版改判 MINOR（v3.6.0）或 MAJOR（v4.0.0），我照改。

`⚠ 輸出變更`：三種操作序列的畫面與 v3.5.0 不同 ——
(a) 任一 preset → 切回「快捷設定」placeholder：cursor 與時基標尺卡片內容從「殘留」變成「清空」；
(b) 同上情境，畫面頂端的時間刻度與 A1/A2 等 cursor 標籤從「殘留」變成「消失」；
(c) 匯入**沒有** `cursors` 欄位的設定檔：當下 cursor 從「保留」變成「清空」。
波形本身的數值一位元未變（逐像素雜湊比對，見下）。

### 修正：切回「快捷設定」placeholder 時，cursor 沒有跟著清

**現象**（Bruce 回報）：把預設切回第一個選項「快捷設定」後，波形區整個清空，但 cursor 沒清，右邊時基標尺卡片還列著上一個 preset 的量測值。

**根因**：v3.5.0 只補了 `wfgLoadPreset()`（載入**有效** preset）這一條路徑。切回 placeholder 走的是另一條分支 —— `wfgLoadPresetFromSelect()` 在 `!key` 時呼叫 `wfgResetToDefault()`，而該函式只重置 GPIO／通道／電壓 cursor，**完全沒碰時間 cursor，也沒刷新面板**。

**修法**：把清空邏輯抽成單一函式 `wfgClearAllCursors()`（含 `wfgDtLock`），讓每條清空路徑共用同一份，而不是各自複製一份、再漏掉其中一份。目前三個呼叫點涵蓋全部四個入口：

| 入口 | 走哪條 | 狀態 |
|---|---|---|
| 選有效 preset | `wfgLoadPreset()` | v3.5.0 已修 |
| 切回「快捷設定」placeholder | `wfgResetToDefault()` | **本版修** |
| 進 TCON 分頁選「不保留上次紀錄」 | 同上（`wfgPrepareTconTimingEntry()` 也呼叫 `wfgResetToDefault()`） | **本版一併涵蓋** |
| 匯入設定檔／autosave 還原 | `wfgImportConfig()` | 面板刷新本來就有；**本版補上「無 cursors 欄位時清空」** |

> 註：「使用者手動把所有通道取消勾選」也會讓波形區變空，但那是暫時隱藏、不是重置，**刻意不清 cursor**。

### 修正：波形清空後，畫面頂端的時間刻度與 cursor 標籤殘留

沒有可見通道時 `wfgRender()` 會提早 return，但 sticky 時間軸（`wfg-tcon-time-axis-canvas`）與其 overlay（`wfg-tcon-time-axis-overlay`）是**獨立的兩張 canvas**，不會被清 —— 結果波形區已顯示「請載入預設或新增信號以開始」，畫面頂端卻還掛著上一幀的時間刻度與 A1／A2 標籤和時間讀數。新增 `_wfgTconClearStickyTimeAxis()` 在該分支清掉這兩張 canvas。

（此殘留在 v3.5.0 之前就存在，不是 v3.5.0 引入的，但它是同一個使用者可見症狀的一部分，一併修掉。）

---

## TCON 波形模擬與取樣 (wfg) v3.5.0 — 2026-08-12 ｜ MINOR ｜ ⚠ 輸出變更

**判定依據：** 本版三件事分別判定後取最高者：

| # | 內容 | 依據 | 級別 |
|---|---|---|---|
| 1 | 修「載入 preset 後時基標尺卡片一片空白」 | §2 案例 2「改一個 bug」 | PATCH |
| 2 | 新增卡片空狀態文字（含三語 i18n） | §2 案例 11「i18n 文案」；使用者能做的事沒有多一件，不觸發 R3 | PATCH |
| 3 | **行為變更**：載入沒有 `cursors` 欄位的 preset 時，一律清空既有 cursor | **R4**「起始狀態／預設值改變」：改的是「某個 preset 載入後看到什麼」，且沒有功能被移除、沒有入口移位、原本會的操作（按 1～0 建 cursor、拖曳、|Δt| 輸入）照樣能做 → **MINOR** | MINOR |

取最高 → **MINOR**，`v3.4.0` → `v3.5.0`。

> 🔴 第 3 項的級別有兩條規則競合，這裡記錄取捨供覆核：§1 判定表「既有功能的輸出 → **主動改變**（設計上決定不一樣）= MAJOR」字面上也套得上（這確實不是純 bug fix，是設計上決定不一樣）。判給 MINOR 的理由是 **R4 是 2026-08-04 後補的專門規則、針對的正是「起始狀態／預設值改變」這一類，適用度比通用判定表高**，且 R4 明文把「不影響任何既有操作」的起始狀態改變排除在 MAJOR 之外。若覆核認為應以判定表為準，本版改判 MAJOR（v4.0.0），我照改。

`⚠ 輸出變更`：兩種情況下同一操作序列會得到與 v3.4.0 不同的畫面 ——
(a) 載入 Dual CPV preset 後，時基標尺卡片從「空白」變成「有 A1-A2／B1-B2 量測值」；
(b) 先載 Dual CPV 再載 Multi CPV，波形上的 A1/A2/B1/B2 cursor 從「殘留」變成「消失」。
波形本身的數值一位元未變，Gate Line 與充放電倍率（v3.3.0～v3.4.0）行為完全未觸及。

### 修正：載入 preset 後「時基標尺」卡片永遠是空的

**現象**（Bruce 回報）：快捷選單選「FHD 60Hz Single Gate(LS：Dual CPV)」後，波形上確實畫出 A1、A2、B1、B2 四支 cursor，但右側「時基標尺」卡片一片空白，看不到 |A1-A2| 之類的量測值。

**根因**：`wfgLoadPreset()` 有把 preset 的 cursors 寫進 `wfgCursors`，但函式尾端**漏了 `wfgUpdateCursorPanel()`** —— 而 `wfgRender()` / `wfgResizeAndRender()` 都不會刷新這張卡片（全檔 15 個呼叫點都在 hover／拖曳／toggle／關閉／匯入／語言切換路徑上）。對照組：`wfgImportConfig()` 一直都有呼叫，所以「匯入 JSON」正常、「載入 preset」不正常。

**證據**：未改任何一行 code、載入 preset 後手動呼叫一次 `window.wfgUpdateCursorPanel()`，卡片立刻長出正確數值（|A1-A2| = 30.09 µs、|B1-B2| = 4.202 µs，與 preset 內的時間值相減吻合）→ 渲染與資料流本來就是好的，缺的只有一次呼叫。

修法：`wfgLoadPreset()` 尾端補一次 `wfgUpdateCursorPanel()`；`wfgInit()` 也補一次（否則剛開頁面時卡片同樣是空白）。

### 行為變更：preset 沒有 `cursors` 欄位 → 一律清空既有 cursor

preset 的語意是「完整定義一組情境」，不是「只覆蓋它有提到的欄位」。舊行為下，從 Dual CPV 切到 Multi CPV（後者沒有 `cursors` 欄位）不會清空，畫面會停在「兩個 preset 混血」的狀態 —— 使用者以為看到的是 Multi CPV，其實 cursor 是 Dual CPV 留下的，這是最難察覺的那種假象。

新行為：不論 preset 有沒有 `cursors` 欄位，載入時一律先把 10 支 cursor 全部清為 inactive，再套用 preset 指定的部分。`wfgDtLock`（|Δt| 鎖定）同屬 cursor 狀態，一併清除，否則會鎖住已不存在的 cursor 配對。

### 新增：時基標尺卡片的空狀態文字

沒有 cursor 時原本是一片空白 —— 而「空白」正是上面那個 bug 的表徵，使用者無從分辨「沒有 cursor」與「卡片壞掉」（這次就是這樣被誤判成故障才回報上來的）。改為顯示 `尚未建立 cursor（按 1～0 建立）`／`No cursors yet (press 1–0 to add)`／簡中同繁中。術語沿用既有 i18n 的寫法（`wfg.laCursorDtHint` 內文一律用英文 `cursor` 不譯），沒有另造中文譯名。

### 已查明、**不在本版範圍**

「即時測量」卡片顯示 `--` **不是 bug**：它是 hover 驅動的，滑鼠移到波形上立刻有值（實測 CK1：脈寬 59.955 µs／週期 89.933 µs／空佔比 33.3%／頻率 11.119 kHz）。與本 bug 不同源，未改動。

---

## TCON 波形模擬與取樣 (wfg) v3.4.0 — 2026-08-12 ｜ MINOR ｜ ⚠ 輸出變更

**判定依據：** 面板信號卡片新增「充放電時間倍率」這個可調參數 → `docs/VERSIONING.md` §2 案例 1「新增一個完整功能」＋ **R3**「這一版之後，使用者能做的事有沒有多一件？有 → MINOR」。既有控制項位置未動、CKO 與其他通道的波形完全不變 → **MINOR**，`v3.3.1` → `v3.4.0`。
`⚠ 輸出變更`：倍率**預設 1.2**（不是 1），因此同一組設定下 Gate 波形的充放電斜率會與 v3.3.x 不同 —— 屬「同一操作序列得到不同結果」，拿舊版存下的 Gate 截圖／數值比對會對不上。其他通道一位元未變。

### 新增：Gate Line 充放電時間倍率

Gate 的充放電時間不再直接沿用 Level Shifter 的設定，而是**乘上一個倍率**：

```
Gate 上升充電時間 = LS 上升充電時間 × M
Gate 下降充電時間 = LS 下降充電時間 × M
M 下限 = 1        （Gate 的充放電時間永遠 >= LS，不會比 LS 快 —— 這是與 LS 區隔的用意）
M 上限 = 300 / max(LS_rise, LS_fall)
預設   = 1.2
```

- **只有一個倍率**，同時套用到上升與下降（依指示不分成兩條）。
- **上限為什麼取 `max()`**：只有一個倍率、而兩者乘完都不能超過 300，所以上限必須由**較大的那一個**決定，否則較大的那個會先破表。例：`rise=100, fall=200` → 上限 `300/200 = 1.5`，而不是 `300/100 = 3`。
- **上限 300 高於 LS 自己的 0~255**：這是刻意的區隔 —— Gate 可以比 LS 慢，最慢到 300。
- LS 的充放電設定一改，倍率上限即時重算，目前值超出新上限時自動夾住（例：LS 調到 260 → 上限 1.153，原本的 1.2 被夾成 1.153）。
- 邊界：`M_max <= 1` 時（LS >= 300）控制項停用並提示「已達上限 300」，不會出現 `min > max` 的壞狀態。**註：LS 欄位本身的 UI 上限是 255，正常操作到不了 300，這條只在匯入帶有超界值的設定檔時才走得到。**
- 匯出檔新增 `panel.gate_rc_mult`；舊設定檔沒有這個欄位 → 用預設 1.2（並受上限夾住）。載入內建預設時倍率一律回到 1.2。
- UI 沿用 Gate 條數同一套操作方式：**拉把 ＋ − / ＋ 增減鈕 ＋ 可直接鍵入的數字框**（拉把精度 0.001、± 與數字框一格 0.01）。卡片內即時顯示換算結果（`127 × 1.2 = 152`）。
  > 這一項的操作形式（拉把＋增減鈕）是依前一版的要求推定的，若不合再調整。

### 驗證

| # | 檢查 | 結果 |
|---|---|---|
| ① | LS rise=fall=100 | ✅ 範圍 `1 ~ 3`（300÷100） |
| ② | LS rise=100 / fall=200 | ✅ 範圍 `1 ~ 1.5`（300÷200，由較大的 fall 決定） |
| ③ | 改 LS 設定 → 上限即時變、目前值被夾住 | ✅ LS 127→100→200→260 各步上限與目前值皆正確 |
| ④ | 倍率改變 → 波形斜率實際改變 | ✅ 倍率 1 時 G7 與 CKO1 斜率完全相同；倍率 2.362（=300）時變成緩升斜坡，2 line 的 pulse 內只充到 **1.74V**，與理論值 `1-e^(-2/5.76) = 29.4%` 吻合 |
| ⑤ | LS=300 / LS=400（僅匯入可能） | ✅ 倍率鎖 1、控制項停用、提示「已達上限 300」，無 min>max |
| ⑥ | 匯入匯出 | ✅ 匯出含 `panel.gate_rc_mult` 與 Gate 的實際充放電值；匯入還原正確；舊檔（無 `panel`）→ 倍率 1.2、Gate 條數 1 |
| ⑦ | 全新載入／載入預設 | ✅ 顯示 1.2 |
| ⑧ | LS=260（M_max≈1.153 < 1.2） | ✅ 夾到 **1.153**（不是硬給 1.2），乘出 260×1.153 = 300 未超上限 |
| ⑨ | 倍率不可低於 1 | ✅ 數字框鍵入 0.5 → 實際生效 1（失焦後欄位回寫成 1）；拉把最左端 = 1 |

**對位回歸（未因本版退步）**：G1/6/7/12/13/1080 全中；G7→CKO1 pulse#2、G12→CKO6 pulse#2；倍率 1 與 2.362 下露出的 pulse 位置完全相同（rise 9.637181409295351）；改 timing（`r_dly` 850→1500、`st_line` 3→9）後仍是 CKO1 pulse#2（rise 16.124），還原後回到 9.637。

---

## TCON 波形模擬與取樣 (wfg) v3.3.1 — 2026-08-12 ｜ PATCH

**判定依據：** 純效能優化，畫面輸出零改變 → `docs/VERSIONING.md` §2 案例 9「效能優化、行為不變 → **PATCH**」。**不標** `⚠ 輸出變更`：優化前後同一組設定的整張 canvas 逐像素雜湊相同（見下方實測），既有回歸基線繼續有效。

### 修正：調整 Gate 條數時波形嚴重 lag

**現象**：拖 Gate 條數拉把或按 ± 時，波形要等好幾秒才更新。

**量測（先量再改，Chrome，`fhd_60hz_sg`，1000 frame ＝ 1,112,000 行）**：

| 項目 | 數字 |
|---|---|
| ① Gate 事件串重算（`_wfgLsBuildEvents`） | 全 1.11M 行 **200ms**；viewport 範圍 **0.2ms** |
| ② Gate 遮罩（`_wfgLsApplyGateMask`） | 全範圍 **30ms**；viewport 範圍 **0.1ms** |
| ③ 整個波形區重繪（24 通道） | **20~30ms**（其中 Gate 那一列 0.3ms） |
| ④ 一次 G 值變動觸發 | 1 次 `wfgRender()` ＋ **1 次 7 條 LS 通道全量預計算** |
| **實際主成本** | `[WFG] Precompute analog: **4556~6143ms**, recomputed=**7** (SD=0 LS=7)` |

**根因**：`wfgOnGateLineChange()` 呼叫 `_wfgInvalidateLsOnly()`，它會把**所有** `waveform_type===2` 的預計算結果丟掉 —— 也就是 6 條 CKO ＋ Gate 共 7 條全部重算。但改 Gate 條數只改變「露出哪一個 pulse」，**CK transitions、OAX 快取、每一條 CKO 的結果全都一個位元沒變**。真正需要重算的只有 Gate 一條，其餘 6 條是純浪費。且每條要重新配置 `computeExtent × 20` 的 `Float32Array`（實測 30MB 以上／條）。

**修法**（三項，都不動計算本身）：

1. **只失效 Gate 一條**：新增 `_wfgInvalidateGateOnly()`，只刪 `_wfgPrecomputed[gateSlot]`，且**刻意不動 `_wfgPrecomputeVer`** —— 讓 `wfgRender()` 內的 `if (_wfgPrecomputeVer !== _wfgAnalogCacheVer) wfgPrecomputeAnalog()` 不被觸發。Gate 那一列改走 render 既有的 fallback 路徑（只算 viewport ±margin）。對 Gate 而言 fallback 反而遠比預計算便宜：Gate 每個 frame 只有一個 pulse，viewport 範圍現算 0.3ms，也不必配置上百 MB 陣列。
2. **同一幀內的多次變動收斂成一次重繪**：`requestAnimationFrame` 合併（最多延遲一幀 ≈16ms，數字框輸入與 ± 按鈕仍是即時反應）。另加「同值不重繪」判斷 —— 拖拉把會連發相同值的 `input`。
3. **不再整份重建輸出通道清單**：改 G 值只更新 Gate 那一列的名稱輸入框，不重建 24 列 DOM（也順帶避免洗掉使用者正在編輯的欄位）。

**效果（同機、同設定、同視窗）**：

| 操作 | 修正前 | 修正後 |
|---|---|---|
| 單次 G 值變動（同步處理） | **4556 ~ 6143ms** | **0.4 ~ 2.6ms** |
| 之後的一次完整重繪 | （含在上面） | **23 ~ 52ms** |
| 連續按 10 次 `+` | 約 50 秒 | **3.5ms**（10 次合併成 1 次重繪，52ms） |
| 連續拖曳平均幀時間 | — | **165ms／幀**；**對照組**：完全不動 Gate、每幀強制重繪＝**161ms／幀** |

最後一列是重點：優化後拖 Gate 的每幀成本與「單純每幀重繪一次」完全相同（165 vs 161ms），代表 **Gate 已經不再是成本**，剩下的是這個工具「整張波形區重繪」的既有成本，與本功能無關（拖任何拉把都一樣）。要再往下降就必須改成「只重畫單一列」的分層 canvas 架構，影響所有通道，未在本版進行。

**精度未做任何犧牲** — Gate 改走 fallback 後，與預計算路徑畫出來的結果比對：

```
hash_fallback   = 4042542103
hash_precompute = 4042542103   → 整張 canvas 815×1418 逐像素 FNV-1a 相同
```

**順帶修正**：事件串裁切改為只在 lazy-extend 路徑生效（新增 `trimToStart` 參數）。原本 render 路徑也會裁掉視窗起點前的事件，理論上當可視範圍正好落在露出 pulse 的中段時會少掉那個 pulse 的上升緣；實測 margin 夠大未觸發（波形逐像素相同），屬防禦性修正。

**回歸（全部重跑，`window.wfgDebugGate()`）**：G1/6/7/12/13/1080 對位全中；G7→CKO1 pulse#2、G12→CKO6 pulse#2；改 timing（`r_dly` 850→1500、`st_line` 3→9）後露出的仍是 CKO1 pulse#2（rise 9.637→16.124），還原後回到 9.637；dual_cpv 模式 G1/7/12 全中；16 Phase G1/17/33 全中；Vactive 1080→500 時上限即時變 500 且目前值被夾住。

> 註：16 Phase 時 G16 沒有波形 —— 內建 preset 的 `ck_sources` 只定義 6 個 CK 來源，CKO7~CKO16 本身就沒有來源（`ckoEvents: 0`），Gate 與被遮罩的 CKO 行為一致。既有行為，非本版造成。

---

## TCON 波形模擬與取樣 (wfg) v3.3.0 — 2026-08-12 ｜ MINOR ｜ ⚠ 輸出變更

**判定依據：** 新增「面板信號」卡片與 Gate Line 功能 → `docs/VERSIONING.md` §2 案例 1「新增一個完整功能」＋ **R3**「這一版之後，使用者能做的事有沒有多一件？有 → MINOR」。既有卡片位置、既有波形的計算與畫法一律未動 → **MINOR**，`v3.2.0` → `v3.3.0`。
另依 2026-08-09 補訂的「`⚠ 輸出變更` 範圍定義」之**版面／構圖類**：波形區固定多出一列 Gate 波形（`G<n>`），同一組設定用新版重跑，截圖構圖與可視列數會與舊版不同 → 加註 `⚠ 輸出變更`。波形數值本身一位元未變。

### 新增：面板信號卡片 — Gate Line（第一階段）

左側新增「**面板信號**」卡片，位置在「類比信號」與「輸出通道」之間。本版只做 **Gate Line**，Subpixel 電荷僅保留版位（標示「開發中」），尚未實作。

**Gate Line 是什麼**：選一條實體 Gate（G1 ~ G<Vactive>），波形區就多一列顯示那一條 Gate 的實際波形。做法是把驅動它的那個 CKO 拿來當來源，**只露出真正驅動這條 Gate 的那一個 pulse，同一個 CKO 上其餘 pulse 全部遮成 VGL**。

- **範圍**：最小 1，最大 = Frame 參數的 **Vactive**（改 Vactive 時上限跟著動，目前值超出上限會被夾住）。
- **CKO 數量連動 GOA Phase**：CKO 數直接取「類比信號 → Level Shifter 全域設定 → GOA Phase」，6 Phase 就是 6 個 CKO、16 Phase 就是 16 個，不另設參數。
- **對應規則**（P = GOA Phase）：

  ```
  CKO 編號 = ((G-1) mod P) + 1
  pulse 序號 = floor((G-1) / P) + 1
  ```

  卡片內即時顯示換算結果（例：`G7 → CKO1 第 2 個 pulse（6 Phase）`）。
- Gate 波形自動佔一個輸出通道（預設名稱 `G<n>`，可自行改名；改名後不會再被自動改回）。卡片內有「在波形區顯示 Gate 波形」開關可隱藏。
- 設定會一起進匯出檔（`panel.gate_line` / `panel.gate_show`），匯入舊設定檔時 Gate Line 取預設值 1。

### 遮罩如何對位（這是本功能的關鍵）

CKO 的 pulse 位置會隨 timing 參數前後左右移動，**遮罩不能綁在固定時間或畫面座標上**。實作把遮罩掛在 pulse 的邏輯來源，而不是位置：

- Gate 走的是**與 CKO 完全相同的那一條事件產生鏈**（三種驅動模式 individual / condensed / dual_cpv 全部沿用），連 CK 來源都是即時從對應 CKO 讀回來的，不另存副本。三個呼叫點（render／precompute／lazy-extend）統一收斂到新函式 `_wfgLsBuildEvents()`，確保 Gate 與被遮罩的 CKO 不可能算出不同的事件。
- 遮罩 `_wfgLsApplyGateMask()` 只做一件事：在事件串上數 pulse，保留序號相符的那一組 rise/fall，其餘丟棄（丟掉即維持在 VGL）。**留下來的是「當下排在第 N 個」的那個 pulse**，所以 pulse 一移動，露出的位置就跟著移動。
- pulse 序號以 frame 為單位計數（frame = `floor(lineX / effVtotal)`，沿用 dual-CPV round-robin 既有的 frame 慣例）。事件視窗一律往前對齊到 frame 邊界再開始算，避免視窗落在 frame 中間導致序號整批位移；lazy-extend 時再把邊界前的事件裁掉，序號正確且不會重複發事件。
- Gate 事件串**不套用縮放時的事件抽稀**（抽稀會整個 pulse 消失，序號就錯了）。

### 驗證（本機 Chrome，`fhd_60hz_sg` / `fhd_60hz_sg_ls_dual_cpv` 兩個預設）

新增 `window.wfgDebugGate(n)`：把 Gate 露出的 pulse 與「被遮罩 CKO 自己算出來的第 N 個 pulse」逐 frame 比對（兩邊各自獨立產生事件串），回傳 rise/fall 與是否相符。

| 檢查 | 結果 |
|---|---|
| P=6, G=7 → CKO1 第 2 個 pulse | ✅ rise 9.637181409295351，與 CKO1 pulse#2 完全相同 |
| P=6, G=12 → CKO6 第 2 個 pulse | ✅ rise 14.637181409295351 相符 |
| G=1 / 6 / 13 / 1080 | ✅ 皆相符；每 frame 恰好 1 個 pulse |
| dual_cpv 模式 G=1 / 7 / 12 | ✅ 皆相符 |
| **對位實測**：CK1 `r_dly`/`f_dly` 850 → 1500（水平位移 0.487 line） | ✅ Gate pulse 由 9.637 → 10.124，仍是 CKO1 第 2 個 pulse |
| **對位實測**：再把 CK1 `st_line` 3 → 9（垂直位移 6 line） | ✅ Gate pulse → 16.124，仍是 CKO1 第 2 個 pulse；改回原值後回到 9.637 |
| Gate pulse 寬度 | ✅ rise 9.637 / fall 11.637，與 CKO1 pulse#2 一致（2 line） |

---

## TCON 波形模擬與取樣 (wfg) v3.2.0 — 2026-08-09 ｜ MINOR

**判定依據：** 本版含兩件改動，依 `docs/VERSIONING.md` 取較高者。
① 概覽圖新增「滑鼠按著拖曳」（TCON 與 LA 兩個模式）→ §2 案例 1「新增一個完整功能」＋ **R3**「這一版之後，使用者能做的事有沒有多一件？有 → MINOR」。原本滑鼠只能點一下跳一次，現在多了按住連續拖曳這個操作方式，既有的點擊與觸控拖曳完全不變 → **MINOR**。
② 修正 LA 概覽圖被擠出可視範圍 → §2 案例 2「改一個 bug → PATCH」，且依 **R1** 加註 `⚠ 輸出變更`（見下）。
取較高者 → **MINOR**，`v3.1.0` → `v3.2.0`。

### 新增：概覽圖支援滑鼠按著拖曳（TCON ＋ LA 兩個模式）

原本兩個模式的概覽圖（`Overview · 點擊跳轉`）滑鼠只支援「點一下跳一次」，連續拖曳只有觸控裝置能用。本版兩邊都補上滑鼠按住拖曳，畫面中心與藍／橘色可視範圍框會連續跟著游標走。**不加慣性**。

實作走「新增滑鼠事件、既有 touch 路徑一行不動」這條路（而非改用 Pointer Events 重寫），共用函式 `wfgBindMinimapMouseDrag(box, jumpTo)`：

- `mousedown` **本身不跳轉**，只記起點；水平位移超過 3px 才進入拖曳 → 「單純點一下」仍然只由既有的 `click` handler 觸發一次跳轉，不會變成跳兩次。
- 拖曳結束後瀏覽器補發的那次 `click` 由 window capture 階段吃掉，不多跳一次。
- `mousemove` / `mouseup` 綁在 `window`：游標甩出概覽圖、甚至移出瀏覽器視窗再放開，都收得到放開事件，不會卡住繼續拖（`mousemove` 另檢查 `e.buttons === 0` 作為保險）。
- `mousedown` 呼叫 `preventDefault()`，拖曳過程不會反白選取頁面文字。
- 邊界夾制與重繪沿用各自既有機制（LA → `wfgLaSetViewRange()`；TCON → `wfgInitMinimap` 內既有的 `jumpTo`），未重造。

### 修正：⚠ 輸出變更 — LA 概覽圖被擠出可視範圍看不到

**現象**：桌面版 LA 分頁的概覽圖（含擷取進度條）整條看不到，而且不像壞掉 —— `getBoundingClientRect()` 回報的座標一切正常，只有 `elementFromPoint()` 打不到。

**根因**：`.wfg-la-canvas-area` 使用固定高度 `height: calc(100vh - 190px)`，其中 190px 隱含假設「header 42 ＋ 邊距 20 ＋ 工具列約 54 ＋ 概覽圖 74」。但工具列高度會隨欄寬換行而變（實測 61 / 114 / 167px），而 `.wfg-la-scope` 實際可用高度 = `100vh − 62 − 工具列高`。兩者的差額（≈ 工具列高 − 54）全部由 scope 的最後一個子元素（概覽圖）吸收，再被 `.wfg-la-scope` 的 `overflow: clip` 切掉。

因此**不是只有解碼面板展開時才會發生**：工具列一換行就開始切，換到三行（≥129px）概覽圖就整條不見。實測（Chrome，`?mode=la`）：

| 視窗 | 解碼面板 | 工具列高 | 概覽圖被切 | 概覽圖中心 `elementFromPoint` |
|---|---|---|---|---|
| 2400×1000 | 收合 | 61px | 6px | `canvas#wfg-la-minimap-canvas` |
| 1600×1000 | 收合 | 114px | 59px（只剩上緣 15px） | `null` |
| 1440×900 | 收合 | 114px | 59px | `null` |
| 1440×900 | 展開 | 167px | 112px（**整條不見**） | `null` |

**修法**：桌面版（`@media (min-width: 901px)`）`.wfg-la-scope` 改 flex 直排，波形區 `flex: 1 1 auto; min-height: 0` 吸收剩餘高度，概覽圖 `flex: 0 0 auto` 固定不被壓縮。高度不再依賴 `100vh` 的魔術數字。手機版（≤900px）本來就是 `overflow: visible` ＋ 波形區 `height: auto` 的堆疊版面，未受影響。

`overflow: clip` **保留不動**（v2.97.369 起用 clip 而非 hidden，是為了不建立捲動容器）。實測把它改成 `visible` 並不能解決 —— 概覽圖只是改由外層 `.wfg-la-layout { overflow: hidden }` 與視窗邊緣切掉，`elementFromPoint` 仍然是 `null`。

**⚠ 輸出變更**：波形區高度改由容器計算，同一視窗尺寸下波形列的垂直間距與可視列數會與舊版不同（例：1440×637、解碼展開，波形區 447px → 334px）。用「截圖」功能存下來的舊圖，用新版重跑構圖會不一樣；波形本身的時間軸與數值不受影響。

> **2026-08-09 補註**：本版加標時，R1 對「輸出」是否涵蓋版面／構圖類尚無明文——波形數值一位元未變，變的只有可視列數與截圖構圖，因此當時是照字面從寬加標。`docs/VERSIONING.md` R1 已補上「`⚠ 輸出變更` 的範圍定義」，明訂版面／構圖類（可視列數、元素間距、canvas 尺寸）只要「用截圖／匯出圖片功能存下來的成果，新舊版拿同一組設定重跑會長得不一樣」就要標。**依釐清後的定義，本版的 `⚠ 輸出變更` 標記成立，維持不動。**

**TCON 模式不受此 bug 影響**（實測確認）：TCON 的概覽圖在 `.wfg-canvas-wrap` 內，該容器桌面版是 `overflow: auto`（可捲動）且波形區沒有 `100vh` 固定高度，內容超出時使用者往下捲即可看到，不會被裁掉。

---

## Pattern Generator 畫面產生器 (pattern) v3.5.0 — 2026-08-09 ｜ MINOR

**判定依據：** `docs/VERSIONING.md` **R3**「判準：這一版之後，使用者能做的事有沒有多一件？有 → MINOR」。加了錨點 id 之後，`pattern.html#pattern-card-mask` 這類網址從**無效**變成**會捲到該張卡**，這是 `pattern.html` 本身新增的可用能力（說明頁的深層連結靠它才成立），使用者確實多能做一件事。§2 案例 4「重構、行為不變 → PATCH」字面不適用，因為行為有變（錨點從無效變有效）。

> 疑慮（提請裁決）：`rxtx` / `calc` / `isp` / `aux` 四頁在 commit `675ab0b` 做同一件事時**沒有進版號**（hook 因為「本次沒有任何工具的版號變動」而放行）。照字面判 `pattern` 應該進 MINOR，但這會造成同一件事在五個分頁的處理不一致。要嘛前四頁補進 MINOR，要嘛把「加錨點 id」明文寫進 `docs/VERSIONING.md` §3 的不進版清單。此處先照字面判 MINOR，如何收斂請 Bruce 裁決。

> **2026-08-08 補註（裁決結果）**：規則已收斂為「**純粹新增錨點 `id` 屬性不進版號**」，明文列入 `docs/VERSIONING.md` §3 不進版清單。本版（v3.5.0）是依當時的字面判準判為 MINOR，且**已發布上線**，因此**維持 v3.5.0 不回退**（已發布的版號往回退會讓使用者看到版號變小）。`rxtx` / `calc` / `isp` / `aux` 四頁同樣**不補進版號**，維持現狀。新規則自 2026-08-08 起適用於之後的改動。

### 新增：六張卡片補上錨點 id，說明頁可深層連結

| 卡片標題 | 原本的 class | 新增 id |
|---|---|---|
| 👁 現在顯示什麼 | `card pg-now` | `pattern-card-now` |
| 🎛️ 畫面參數 | `card pg-params` | `pattern-card-params` |
| 🖼 匯入圖片 | `card pg-import` | `pattern-card-import` |
| ▦ 遮罩（只露出指定等份） | `card pg-mask` | `pattern-card-mask` |
| 💾 輸出與另存 | `card pg-out` | `pattern-card-out` |
| 🖥️ 螢幕資訊與縮放偵測 | `card pg-screen` | `pattern-card-screen` |

`pattern.html` 全頁就是這 6 張 `class="card"`（2 個 `<div>` ＋ 4 個 `<details>`），沒有多的、也沒有對不上命名的。新 id 不被任何 JS／CSS 引用，純錨點。

`pattern-guide.html` 第 3／4／5／8／9／10／11 章的 `section-desc` 補上「→ 直接開啟工具的這張卡」連結，寫法與 `rxtx` / `calc` / `isp` 三份說明頁一致。

---

## TCON 波形模擬與取樣 (wfg) v3.1.0 — 2026-08-09 ｜ MINOR

**判定依據：** `docs/VERSIONING.md` §2 案例 1「新增一個完整功能 → MINOR」＋ **R3**「這一版之後，使用者能做的事有沒有多一件？有 → MINOR」。LA 模式的概覽圖從「只是一張圖」變成「點一下會跳過去」，是多出來的能力；TCON 模式的既有行為一行未動，LA 既有的操作（滾輪縮放、拖曳平移、中心／倍率輸入框、Trigger 歸零）全部照舊、位置也沒動，因此不觸發 MAJOR，也不是 PATCH。

### 新增：LA 模式概覽圖（Overview）可點擊跳轉

**現況問題**：TCON 模式的概覽圖點一下就跳，LA 模式的概覽圖沒有綁任何事件——全檔沒有一行 JS 抓 `.wfg-la-minimap-box`。更糟的是 CSS 早就寫了 `cursor: pointer`（`wfg.html:487`），滑鼠移上去變成手指、看起來可以點，點下去卻沒反應，是明確的誤導。本次一併解決。

**行為**（刻意對齊 TCON 模式，同一個工具裡兩種模式不該不一樣）：

- 滑鼠 **click** 一次跳轉：把點到的位置移到畫面正中央，**目前的可視範圍寬度（放大倍率）不變**。
- **觸控** `touchstart` / `touchmove` 可按著左右拖曳連續移動，`touchend` / `touchcancel` 放開即停。
- 邊界夾制沿用既有的 `wfgLaSetViewRange()`，超出資料範圍會夾在 `[0, duration−range]`。
- 跳轉前先 `wfgLaInertiaStop()` 取消進行中的慣性滑動，並 `wfgLaMarkManualViewChange()` 解除 trigger 自動聚焦，避免跳完又被拉走。

**換算基準**：不另造一套。`wfgLaRenderMinimap()` 畫圖時用的 `duration` 存進新的 `wfgLaMinimapDuration`，點擊換算直接沿用同一個值，確保「點到的位置」與「畫出來的圖／藍框位置」用同一把尺。

**與 TCON 版的取捨**：TCON 的 `wfgInitMinimap()` 只做 click ＋ touch 拖曳，**沒有滑鼠按住拖曳、沒有慣性**。LA 版照抄這個範圍，不自行加碼，理由是「兩種模式操作方式不該不一樣」優先於「LA 版做得更好」。TCON 版另有一個 `ResizeObserver` 用來重繪自己的 minimap，LA 的 minimap 由 `wfgLaRenderScope()` 負責重繪，不需要，故未複製。

**同步更新**：`wfg-guide.html` 第 16 章原本寫「LA 的概覽只顯示、不能點擊跳轉」，已改為說明新行為；LA 概覽圖的標籤由「Overview · Capture window」改為「Overview · 點擊跳轉」（i18n key `wfg.laOverviewCapture`，三語同步）。

---

## TCON 波形模擬與取樣 (wfg) v3.0.1 — 2026-08-08 ｜ PATCH

⚠ 輸出變更

**判定依據：** `docs/VERSIONING.md` §2 案例 2「改一個 bug → PATCH」，並依 **R1** 加 `⚠ 輸出變更`。R1 的字面判準是「修正後輸出會變」——舊版「從 LA 分頁匯入設定檔／載入快捷設定後選『確定』」得到的是**上次 autosave 的畫面**，新版得到的是**檔案／preset 本身的畫面**，同一操作的結果不同，因此照字面加標。波形演算法本身一行未動（`wfgCalcGpio` / `wfgRender` / 類比取樣路徑完全沒碰），本次 diff 只有兩個呼叫點各多傳一個既有的 `options.skipTconPrompt`。

> 判定過程留存：舊版那個「輸出」本身就是 bug 造成的錯誤畫面（顯示的不是使用者選的檔案），不太可能有人拿它當基準存圖或抄數字。依規則要求「覺得字面結果不合理時照字面判、把疑慮寫在回報裡」，此處照字面加了 `⚠ 輸出變更`。

> **2026-08-09 補註**：`docs/VERSIONING.md` R1 已補上「`⚠ 輸出變更` 的範圍定義」，明訂「同一操作序列得到不同結果，即使舊結果本身是 bug 造成的，仍要標」——舊結果合不合理不是判準，拿舊版建立的回歸基線會不會失效才是。**依釐清後的定義，本版的 `⚠ 輸出變更` 標記成立，維持不動。**

### 修正：匯入設定檔／載入快捷設定時，剛套用的參數會被上次的自動存檔蓋掉

**症狀**：人在 LA 分頁時匯入一份 `currentMode: 'tcon'` 的設定檔（或載入快捷設定），會跳出「是否要保留之前的 TCON Timing 調整紀錄？」，選「確定」之後畫面上是**上次調整的參數**，剛匯入的檔案內容整份消失。

**根因**：`wfgImportConfig()` / `wfgLoadPreset()` 都在套用完參數之後才呼叫 `wfgSwitchMode(config.currentMode)`。`wfgSwitchMode()` 看到 `prevMode !== 'tcon'` 就觸發 `wfgPrepareTconTimingEntry()`，選「確定」即執行 `wfgAutoRestore()`，把 localStorage 裡上一次的設定整份寫回，覆蓋剛匯入的內容。

**修法**：防呆機制 `options.skipTconPrompt` 本來就存在，`wfgInit()` 與 `wfgEnterPage()` 兩處早就正確使用，只有這兩條路徑漏傳。各補上 `{ skipTconPrompt: true }`——匯入檔案／載入 preset 時使用者的意圖已經明確，本來就不該再問「要不要還原上次的」。

**未改動**：手動切分頁（LA → TCON）照樣跳 confirm；選「確定」照樣 `wfgAutoRestore()` 還原上次狀態；選「取消」照樣 `wfgResetToDefault()`。原設計「TCON 重算很貴，所以進 TCON 時問一次」的取捨完全保留。

`wfgTconEntryReady` 刻意**不**在 `skipTconPrompt` 路徑補設 `true`：實測「設」與「不設」兩版跑同一組 8 步序列，confirm 次數／畫面參數／GPIO 值逐項完全相同，且兩版進入 `wfgPrepareTconTimingEntry()` 時讀到的都是 `false`（因為 `wfgSwitchMode()` 內 `if (mode !== 'tcon') wfgTconEntryReady = false;` 必先執行）。理由與「日後若把 wfg.html 接回 SPA 就必須補」的前提已寫進程式碼註解。

---

## TCON 波形模擬與取樣 (wfg) v3.0.0 — 2026-08-08 ｜ MAJOR

**判定依據：** `docs/VERSIONING.md` §2 案例 6「移除一個既有功能 → MAJOR」。本版移除「訊號產生器」分頁，屬於 §1 判定表 MAJOR 欄的「功能增減：**移除**既有功能」與「操作流程：原本的按鈕**找不到了**」——頁首模式頁籤由三個變兩個，依規則字面判定為 MAJOR。同時本版**不在任何重整波內**（`wfg` 在 git 歷史上從未進過 MAJOR，最舊可追到 v2.97.384），R2 不適用，不需要波次宣告。

波形計算與輸出結果**一個位元都沒動**（本次 diff 完全沒有碰 `wfgCalcGpio` / `wfgRender` / 類比取樣等計算路徑），**不加 `⚠ 輸出變更`**。

同 §2 案例 13：`common/i18n.js` 只刪除 `wfg.modeSiggen` / `wfg.siggenWip` 兩個 key（僅 wfg 使用），其餘分頁不受影響、不進版。

這也正好落在版本號規則變更公告的分界規劃上：`wfg` 自本版起套用新規則，爆掉的 patch 號歸零。

### 移除：訊號產生器（SigGen）分頁

頁首模式頁籤由三個變成兩個：**TCON Timing 調整練習**、**LA分析器**。

移除範圍：開場防閃爍 `document.write` 的 siggen 分支、`.wfg-siggen-placeholder` CSS、分頁按鈕、`#wfg-siggen-content` 佔位區塊、`wfgSwitchMode()` 內的 siggen 顯示切換與 `wfgResizeCanvas` 分支、`wfgEnterPage()` 的 siggen early-return、`wfgPersistMode()` 的 `#wfg-siggen` hash 對應，以及 `common/i18n.js` 的兩個 key。`wfg-guide.html` 與 `ARCHITECTURE_PLAN.md` 中提到三個頁籤的敘述一併改為兩個。

### 舊入口相容 — 四條路都落回 TCON，不會出現空白畫面

刻意保留四處 `siggen` 字樣作為 legacy fallback（全部集中在 `wfgRequestedModeFromUrl()` 與 `wfgSwitchMode()`，並標了 `v3.0.0` 註解）：

| 舊入口 | 處理方式 |
|---|---|
| URL hash `#wfg-siggen` / `#siggen`（書籤） | `wfgRequestedModeFromUrl()` 回傳 `'tcon'`；切過去時 `wfgPersistMode()` 順手把網址 hash 改寫成 `#wfg`，等於自動修正舊書籤 |
| URL 參數 `?mode=siggen` / `?wfgMode=siggen` | 同上，回傳 `'tcon'` |
| `sessionStorage` 殘留的 `siggen` | 讀出後正規化成 `'tcon'`，並在下次寫入時覆蓋掉殘留值 |
| **匯入設定檔裡的 `currentMode: 'siggen'`** | `wfgSwitchMode()` 白名單改成只認 `tcon` / `la`，其餘一律落回 `tcon`。已匯出過的舊 `.txt` 設定檔載進來不會呼叫到不存在的 mode |

開場防閃爍那段也改成**只有 `la` 才寫覆蓋 style**，其餘（含 siggen）一律不寫 → 維持 HTML 的 TCON 預設顯示，不會出現「三個 content 全 `display:none`」的空白畫面。首頁 `index.html` 的 hash redirect `'wfg-siggen'` 改為導向 `wfg.html`（不再帶 `#siggen`），舊連結不會 404。

### 實測驗證（本機 http server + Chrome）

九項全過：頁籤只剩兩個且互切正常｜`#wfg-siggen` → 落回 TCON 且 hash 自動改寫成 `#wfg`｜`?mode=siggen` → 落回 TCON｜`sessionStorage` 塞 `siggen` 後重整 → 落回 TCON 且殘留值被正規化｜**匯入 `currentMode:'siggen'` 的設定檔 → 回傳 `true`、無 exception、無 alert、無 console error，落回 TCON，且 vtotal 1112→1300 / frameRate 60→48 / hactive→1600 / frameCount→3 / 匯入檔名顯示皆正確套用**（在 LA 模式匯入的情境另測一次，同樣落回 TCON 並正確套用 vtotal 1440 / frameRate 75）｜`#wfg-la` 與 `?mode=la` 仍正常進 LA｜三語切換後頁籤文字正確、無未解析的 `wfg.` key 殘留｜console 零錯誤。

> 過程中發現一項**與本次改動無關的既有行為**：從 LA 模式匯入設定檔時，`wfgPrepareTconTimingEntry()` 會跳原生 `confirm()`（第 3695 行）詢問是否保留上次的 TCON 調整紀錄，該對話框會阻塞 renderer。用 `git show HEAD:wfg.html` 取出**未改動的原始版**、以 `currentMode:'tcon'` 的設定檔跑同一條路徑，同樣阻塞 → 確認為既有行為。另外若使用者在該對話框選「確定（保留紀錄）」，`wfgAutoRestore()` 會覆蓋掉剛匯入的參數 —— 這同樣不是本次改動造成，僅記錄於此。

---

## Pattern Generator 畫面產生器 (pattern) v3.4.0 — 2026-08-08 ｜ MINOR

**判定依據：** `docs/VERSIONING.md` §2 案例 1「新增一個完整功能」—— 新增「10 bit PNG 輸出」，使用者**多了一件原本做不到的事**：v3.3.0 時選 PNG 會讓 10 bit 選項變灰不能點，現在可以了。既有操作全部在原位、色彩深度預設仍是 8 bit、8 bit 的 PNG 與 BMP 輸出結果經 22 個 sha256 證明**位元組完全相同**（比對基準是 v3.3.0 之前錄的原始基線，等於同時證明 v3.3.0 與 v3.4.0 兩次改動累積起來仍零回歸）→ 不觸發 MAJOR，也不是 PATCH。既有使用方式的輸出結果不變，**不加 `⚠ 輸出變更`**。同 §2 案例 13：`common/i18n.js` 只新增 `pat.outDepthBmp` / `pat.outDepthPng` / `pat.outPng16Size` 並改寫 `pat.outDepthHint`（該 key 僅 pattern 使用），其餘分頁不受影響、不進版。

### 新增：10 bit PNG 輸出（16 bit + `sBIT=10`）

PNG 規格沒有原生 10 bit（只允許 1/2/4/8/16，truecolor 只能 8 或 16），所以 10 bit 用 **16 bit truecolor + `sBIT=10`** 表達。`canvas.toBlob` 永遠只吐 8 bit，因此**自寫 PNG 編碼器**：IHDR → sBIT → IDAT → IEND，每個 chunk 附 CRC32，IDAT 用 `CompressionStream('deflate')`（實測 Chrome 150 吐的是 zlib/RFC1950，開頭 `78 9C`，正是 PNG 需要的；`deflate-raw` 是裸 deflate 不能用）。

🔴 **16 bit sample 用 network byte order（big-endian，MSB 先）** —— 規格明文，也是最容易寫錯的地方，已用非對稱值專門驗過。

**數值放大到滿刻度（1023 → 65535），不是把 1023 塞進低位。** 理由是**多數讀取器不理會 `sBIT`**：若把 1023 放低位，那些讀取器會把全白讀成 `1023/65535 ≈ 1.56%`，**全白變成幾乎全黑**，正好毀掉這個功能唯一在意的「最亮跟最暗要對」。放大到滿刻度則兩種讀取器都不會錯得離譜 —— 不理 sBIT 的讀到 100%（正確），理會 sBIT 的用 `v16>>6` 可精準還原回 0~1023（實測 1024 個值零失敗）。

【實測佐證】同一支 ImageMagick 讀全白：**16bit PNG = 100%**、10bit BMP = 99.9%（它對 BMP 用 `v/1024` 正規化）、若採低位方案 = 1.56%。

> 🔧 **若機台指名要在 16 bit 容器裡讀到 1023**，那它要的是低位方案。**判別方式：機台讀出來若是 ~1.5% 或整張近乎全黑，就是這種情況**，把 `pg10to16()` 改成直接回傳 v10 即可（一行）。

**換算**：`v8 → v10 = (v8<<2)|(v8>>6)`（沿用 v3.3.0），`v10 → v16 = round(v10×65535/1023)`。整數實作用 `(v*65535+511)/1023` 取整避開浮點，實測與 `Math.round` 版本 1024 個值完全一致；`0→0`、`255→1023→65535` 兩端精準、全域嚴格遞增。（注意這**不等於** 10→16 的 bit replication，兩者有 234/1024 個值不同。）

**驗證同樣不用 `createImageBitmap`**（它會把 16 bit 塞回 8 bit canvas），改自解 PNG 位元組：掃 chunk 序列、驗每個 chunk 的 CRC、驗 IHDR（bitDepth=16 / colourType=2）、驗 sBIT 存在且為 10,10,10 且**在 IDAT 之前**、`DecompressionStream` 解 IDAT 後逐像素比對。

**驗證結果**：
- 第三方解碼器 **pypng** 讀回：chunk 序列 `IHDR → sBIT → IDAT → IEND`、bitDepth=16、colourType=2、sBIT `[10,10,10]` 且在 IDAT 之前
- 端點：全黑三通道 0；全白三通道 **65535**，取高 10 位還原回 **1023**
- byte order：`v8=1 → v10=4 → v16=256`，檔案裡是 `01 00`（不是 `00 01`）；另驗 `v8=254 → 0xFEFF` 為 `fe ff`
- subpixel on/off 1920×1080 的相異色**只有 (0,0,0) 與 (65535,65535,65535) 兩種**，還原回 0 與 1023
- 內建驗證器 641×361 `diff = 0`；1920×1080 `diff = 0 / 2,073,600`
- **負向對照（全部把 CRC 修好，逼驗證器走到更深層的檢查，否則只證明 CRC 有效）**：sBIT 值改 8 → 抓到 `sBIT=8,10,10`；sBIT 整段搬到 IDAT 之後 → 抓到 `sBIT after IDAT`；改 1 個像素後重壓並修正 CRC → 抓到 `diff=1`
- 8 bit 回歸：11 組設定 × 2 格式 = **22 個 sha256 與 v3.3.0 之前的原始基線完全相同**
- 檔案大小（1920×1080，未壓縮基準 12.4 MB）：subpixel on/off **27 KB**（455:1）、256 階漸層 **85 KB**（146:1）；編碼耗時 160~190 ms
- macOS 預覽程式、ImageMagick 皆正常開啟

批次匯出、副檔名、檔案大小提示、三語 i18n 一併處理。

---

## Pattern Generator 畫面產生器 (pattern) v3.3.0 — 2026-08-08 ｜ MINOR

**判定依據：** `docs/VERSIONING.md` §2 案例 1「新增一個完整功能」—— 新增「10 bit BMP 輸出」，使用者**多了一件原本做不到的事**：產生只吃 10-bit、不吃 8-bit 的機台能讀的檔案。既有操作全部在原位、色彩深度預設仍是 8 bit、8 bit 的輸出結果經 22 個 sha256 證明**位元組完全相同** → 不觸發 MAJOR，也不是 PATCH。既有使用方式的輸出結果不變，**不加 `⚠ 輸出變更`**。同時涉及 §2 案例 13（修改共用檔 `common/i18n.js`）：本次只**新增** `pat.outDepth*` 五個 key、未更動任何既有 key，其他分頁不使用這些 key，故其餘分頁不受影響、不進版、不動其 cache buster。

### 新增：10 bit BMP 輸出（給只吃 10-bit 圖的機台）

**需求來源**：有些 pattern（配單卷）的機台**只吃 10-bit 的圖片、不吃 8-bit**。典型用途是匯出 sub-pixel on/off 圖，**暗是 L0、亮是 L1023**。這類用途「精準度不用太高，只要最亮跟最暗是對的就好」。

**所以這個功能的本質是「產生機台吃得下的檔案格式」，不是「產生 8bit 做不到的灰階」** —— 灰階輸入維持 0~255，`pgDrawPattern` 的 273 行繪圖邏輯與 34 種 pattern **一行都沒有改動**，canvas 仍是 8 bit。存檔時才把每個通道放大成 10 bit。

**換算用 MSB replication**：`v10 = (v8 << 2) | (v8 >> 6)`。不用乘 4 —— 乘 4 的話 255 只會到 1020，最亮就不對了，而「最亮跟最暗要對」正是這個功能唯一在意的準確度。實測 0~255 全值域與公式零不符、映射後嚴格遞增；`0 → 0`、`127 → 509`、`255 → 1023`。

**產出的檔案結構**（機台若不吃，照這張表調）：

| 欄位 | 值 |
|---|---|
| DIB header | `biSize = 40`（BITMAPINFOHEADER，刻意不用 V4/V5 —— 40 + 遮罩是 BI_BITFIELDS 相容性最廣的寫法） |
| `bfOffBits` | 66（= 14 + 40 + 12） |
| `biBitCount` / `biCompression` | 32 / 3（`BI_BITFIELDS`） |
| 遮罩 | R `0x3FF00000`、G `0x000FFC00`、B `0x000003FF`（A2R10G10B10） |
| alpha 2 bit | 一律 **3**（不透明）。`biSize=40` 下這 2 bit 嚴格說未定義，但若讀取器當 alpha 解讀，填 0 會變全透明；填 3 在兩種解讀下都不會錯 |
| 列順序 | bottom-up（`biHeight` 為正） |
| padding | **無**（32bpp 每列天然 4-byte 對齊） |

**PNG 選 10 bit 時直接禁用**：PNG 規格沒有原生 10 bit（只允許 1/2/4/8/16），要做得靠 16 bit + `sBIT` 且必須自寫編碼器（`canvas.toBlob` 永遠只吐 8 bit），那是下一階段。在那之前寧可把選項關掉，也不要讓使用者以為存到 10-bit 其實拿到 8-bit —— 機台那端不會報錯，只會結果不對。

**驗證器不能再用 `createImageBitmap`**：實測 Chrome 150 走那條路讀 10 bit 內容時會塞回 8 bit canvas，512/513/514/515 全糊成同一個 128、1020~1023 全變 255，等於沒在驗。改為直接解析檔案位元組（自行讀 header、依遮罩算位移、逐像素比對）。8 bit 路徑維持原本的 `createImageBitmap` 實作不變。

**驗證**：
- 8 bit 回歸：11 組設定 × 2 種格式 = **22 個 sha256 與改動前完全相同**（含 anti-alias 的 `aligncenter`/`character`，以及 641×361 奇數尺寸驗 24bpp 列 padding）
- 端點：全黑 `R=G=B=0`（raw `0xC0000000`）、全白 `R=G=B=1023`（raw `0xFFFFFFFF`）
- 內建驗證器在 641×361 上 `diff = 0 / 231,401 px`；**負向對照**：故意改壞 1 個 byte → 抓到 `diff=1`，改壞遮罩 → 由 header 檢查擋下（證明驗證器不是永遠回傳成功）
- 第三方工具：Python 獨立解析、ImageMagick、macOS 預覽程式皆正常開啟；`subpixel on/off` 檔的相異色**只有 (0,0,0) 與 (1023,1023,1023) 兩種**
- ⚠ 實測發現：**ImageMagick 把全白解成 254.755/255（99.9%）**，因為它用 `v/1024` 而非 `v/1023` 正規化。檔案本身是對的（位元組確認為 1023），但不同讀取器對 10 bit 滿刻度的解讀不一致，機台端若在意需另行確認。

批次匯出、檔名（10 bit 時自動加 `_10bit`）、檔案大小估算、三語 i18n 一併處理。

---

## TCON 波形模擬與取樣 (wfg) v2.99.0 — 2026-08-07 ｜ MINOR

**判定依據：** 兩條規則同時命中，依 §2 案例 14 的「取較高者」處理 —— (a) 案例 2「改一個 bug」（手機按「貼上」必定失敗）→ PATCH；(b) 案例 1「新增一個完整功能」：新增「手動貼上設定」視窗，使用者**多了一件原本做不到的事**（在任何不允許自動讀剪貼簿的瀏覽器上把設定貼進來），既有的桌機成功路徑與所有既有操作完全不變 → **MINOR**。輸出結果（波形、數值）不受影響，不加 `⚠ 輸出變更`。

### 手機（iOS Safari）按「貼上」必定失敗 → 改用不需權限的手動貼上視窗

**回報現象**：電腦按「複製」→ 把設定傳到手機 → 手機開 `wfg.html` 按「貼上」→ 跳出 `無法讀取剪貼簿：The request is not allowed by the user agent or the platform in the current context, possibly because the user denied permission.` 並要求改用「匯入檔案」。

**根因（可指證的 diff 範圍：`wfg.html` 舊 `window.wfgImportClipboard`）**：整個貼上流程只有 `navigator.clipboard.readText()` 一條路，`catch` 直接 `alert`。這個 API 受「剪貼簿讀取」權限管制：

- 桌機 Chrome 第一次呼叫會跳權限提示，允許後記住 → 所以桌機看不到問題（本次實測：`navigator.permissions.query({name:'clipboard-read'})` 在未授權時為 `prompt`，`readText()` 的 promise 就一直 pending 等使用者回應）。
- **iOS Safari 不允許網頁靜默讀剪貼簿**，必須由使用者在原生「貼上」浮動鈕再確認一次；沒確認到就丟 `NotAllowedError`，訊息正是上面那句。

所以這不是「手機獨有的 bug」，而是**手機幾乎必然踩到、桌機因為權限早就授權過所以看不到**。同時對稱性也壞掉了：`wfgExportClipboard`（複製）在 `writeText` 失敗時會退回 `execCommand('copy')`，貼上這邊完全沒有任何備援；`wfg.html` 另一處（L5260 附近）有 `if (navigator.clipboard && window.isSecureContext)` 的守衛，import 這條路徑也沒有。

**修法**：新增「手動貼上設定」視窗（`window.wfgOpenPasteModal`）——一個 `textarea` ＋ 確定／取消。這條路徑**不需要任何剪貼簿權限，所有平台都能用**。流程改為：

| 情況 | 舊行為 | 新行為 |
|---|---|---|
| 無 `navigator.clipboard` / `readText` / 非安全環境 | 直接丟例外 → alert | **直接開視窗**（不先失敗），說明「此瀏覽器不支援自動讀取剪貼簿」 |
| `readText()` 成功且有內容 | 直接匯入 | **不變**，直接匯入 |
| `readText()` 丟 `NotAllowedError` 或任何錯誤 | alert「請改用匯入檔案」 | **開視窗**，把原始錯誤訊息當說明列出 |
| 讀到空字串 | alert「剪貼簿是空的」 | **開視窗**，說明列顯示「剪貼簿是空的」 |

其他：

- 視窗開著時在 `document` 上攔 `paste` 事件，焦點不在 `textarea`（例如點到視窗空白處）也吃得到鍵盤貼上。
- 按 Esc 或點視窗外可關閉。
- 內容錯誤（JSON 壞掉／不是 WFG 設定檔／空白）改成**視窗內嵌紅字**，不再疊一層 alert，視窗保持開著可直接修正重按。做法是先自行驗證（`wfgValidateConfigText`），通過才交給既有的 `window.wfgImportConfig` —— **`wfgImportConfig` 本身一字未改**，套用結果與匯入檔案完全同一條路。
- 成功後行為與原本一致：關閉視窗，按鈕顯示「✓ 已貼上」1.5 秒。
- i18n 新增 7 個字串（zh-TW／zh-CN／en 三語齊全）；`wfg.clipboardFail` 文案重寫為「瀏覽器不允許自動讀取剪貼簿（{msg}）」，不再叫人去用匯入檔案。

**檢查範圍**：全 repo grep `readText`，只有 `wfg.html` 與 `legacy-index.html` 兩處。`aux.html` / `calc.html` / `isp.html` / `rxtx.html` / `index.html` / `pattern.html` / `la.html` **完全沒有讀剪貼簿的程式碼**（只有 `writeText` 分享網址，且 `common/common.js` 那支本來就有 `.then/.catch`），因此不需要改。`legacy-index.html` 是凍結的歷史存檔、站內沒有任何頁面連結過去（同 CHANGELOG 既有結論），不動。

**實測驗證（本機 `http://127.0.0.1:8912/wfg.html`，Chrome MCP 操作）**：

1. **失敗路徑**：覆寫 `navigator.clipboard.readText` 使其 reject `NotAllowedError`（訊息與回報截圖一字不差）→ 真的用滑鼠點工具列「貼上」→ **舊 alert 沒有出現**（全程攔截 `window.alert`，累計 0 次），手動貼上視窗跳出。
2. **設定真的套用**：在視窗中以 `paste` 事件貼入一份改過的設定 → 按「確定」→ 左欄參數由 `VTOTAL 1112 / VACTIVE 1080 / HTOTAL 2080 / HACTIVE 1920 / TCON HTOTAL 2668 / FRAME RATE 60 / TCON DCLK 89 / RX DCLK 69.3888 / LINE BUFFER 4` 變成 `1500 / 1440 / 2500 / 2200 / 2500 / 50 / 93.75 / 93.75 / 9`，**波形本身也重畫**（CK1–CK6 週期與相位改變，時間軸由 6.4669s 區段變為 5.7526s 區段）。
3. **錯誤內嵌顯示**：貼 `{ not json` → 視窗內顯示「JSON 格式錯誤：…」且視窗不關；貼 `{"a":1}` → 「不是有效的 WFG 設定檔」；貼空白 → 「請先貼上設定內容」。三者 alert 次數皆為 0。Esc 可關閉。
4. **正常路徑未被改壞**：`readText` 回 resolve → **不開視窗**，直接套用，按鈕當下文字為「✓ 已貼上」、1.5 秒後恢復「貼上」。
5. **窄畫面**：以 386 px 寬的 iframe 載入同一份 `wfg.html`（macOS Chrome 視窗有最小寬度限制，直接縮視窗只能到 519 px，故改用 iframe 讓 media query 真的以 386 px 計算）→ 卡片 355×340 置中、無水平溢出、垂直完整可見；`textarea` 321×108、字級 16 px（防 iOS 聚焦自動放大）；取消／確定各佔一半（154 px / 158 px，高 42 px）。在該 386 px 環境中重跑貼上流程，`vtotal 1125→1500`、`htotal 2200→2500`、`frameRate 60→50`，確認手機版面下功能同樣成立。
6. **三語**：zh-TW／zh-CN／en 逐一切換後重開視窗，標題／說明／placeholder／兩顆按鈕／三種錯誤訊息／四種說明列（NotAllowedError、剪貼簿是空的、不支援、空內容）全部有翻譯，無漏字、無 key 洩漏。

**未能驗證的部分（誠實說明）**：真實的 `navigator.clipboard.readText()` 在本機 localhost 上會跳 Chrome 的「剪貼簿讀取」權限提示，promise 一直 pending。代使用者點「允許」屬於授權行為，我沒有這麼做，因此「正常路徑」是以受控 stub 讓 `readText` resolve 來驗證的 —— 走的是完全相同的那一段程式碼與分支，但**沒有經過真實的瀏覽器權限授權流程**。另外 iOS Safari 上的實機行為我沒有裝置可測，本次是以「重現它丟出的那一個 `NotAllowedError`」為等價條件驗證。

---

## TCON 波形模擬與取樣 (wfg) v2.98.1 — 2026-08-07 ｜ PATCH ｜ ⚠ 輸出變更

**判定依據：** 純粹修 v2.98.0 的一個 bug（Toggle 信號 frame 0 的極性算錯），沒有新增任何使用者能做的事 —— `VERSIONING.md` §2 案例 2「改一個 bug」→ **PATCH**。因為 toggle 信號的逐 frame 極性會變，依 **R1** 加註 `⚠ 輸出變更`。

### ⚠ Toggle 信號的 frame 級極性：第一個 frame 一定不翻

**問題**：v2.98.0 我把 frame 0 的 ACTIVE 寫死成 HIGH，理由是「`ST_LINE` 那條無條件 rising」。**這個理由是錯的** —— Bruce 手繪的那些例子之所以看起來是 rising，只是因為它們的初始極性剛好是 HIGH 且 `R_DLY = 0`，那是舉例、不是通則。而且手繪的圖也不代表它就是第一個 frame。

**同時 v2.98.0 之前的舊寫法也是錯的**，只是錯得剛好看不出來：

```js
toggleFrmCounter++;
if (toggleFrmCounter >= toggleFrmThreshold) { toggleFrmCounter = 0; toggleLevel = !toggleLevel; }
```

這個逐 frame 累加的寫法會在 **frame 0 就先翻一次**（counter `0 → 1`，`FRM_NO = 0` 時 threshold = 1，當場命中），所以 frame 0 等於 `!base`。`FRM_NO = 0` 時因為 base 是 0、翻成 1 之後與手繪一致，看起來「對」；`FRM_NO > 0` 時 frame 0 不翻，兩種情況的 frame 0 極性還互相矛盾。

> 🔴 因此 v2.98.0 條目裡「與 v2.97.480 逐像素 diff = 0」那條佐證**不成立**（舊版本身就是錯的，跟它一樣不代表對）。以後不要再拿「跟舊版輸出相同」當正確性證據。

**正確語義**（2026-08-07 Bruce 裁示）：

```
base = 初始極性，由 INI_VAL 決定
       0 - Low  → 0
       1 - High → 1
       2/3 - Keep → frame 0 沒有前一張畫面可延續，退化為 0

ACTIVE(frame) = base XOR ( floor(frame / (FRM_NO + 1)) & 1 )

⇒ frame 0 恆等於 base ——「第一個 frame 絕對不翻」
⇒ FRM_NO = 0  → frame 0 = base、frame 1 = !base、frame 2 = base …
⇒ FRM_NO = 2  → frame 0,1,2 = base、frame 3 = !base
⇒ FRM_NO = 99 → frame 0～99 = base、frame 100 = !base
```

🔴 **1-based / 0-based 換算**（已寫進 code 註解與說明頁，免得再被繞進去）：Bruce 講的「從**第 1 個**到**第 100 個** frame 極性都一樣，**第 101 個**才反過來」是 1-based；程式裡 0-based 的 `frame` 對應「frame 0～99 相同、frame 100 反相」。

**修法**：移除 `toggleFrmCounter` 那套逐 frame 累加，改用上面的閉式直接算 —— 閉式沒有「起始狀態要先翻一次」的問題。

**順帶更正**：`TG_INI_VAL` **不是**初始電位。全檔只有一處在用它，作用是「這條信號要吃全域三個 `FRM_NO` 中的哪一個」的**選擇器**（`0 → FRM_NO_0`、`1 → FRM_NO_1`、`2 → FRM_NO_2`）。初始電位一直都是 `INI_VAL`。說明頁原本把 `TG_INI_VAL` 寫成「Toggle 模式的初始值、決定第一張畫面從哪個狀態開始翻轉」，一併改掉。

**⚠ 對內建預設的影響**：`FHD 60Hz Single Gate` 的 XPOL 與 LC 都是 `INI_VAL = 2 (Keep)` → `base = 0`，所以 frame 0 現在是 **LOW**（舊版是 HIGH），整體相對舊版反相一個 frame。XPOL（`FRM_NO_0 = 0`）逐 frame 為 `L H L H L H`；LC（`TG_INI_VAL = 1` → `FRM_NO_1 = 99`）frame 0～99 都是 LOW。

**驗收**：

*① 單 frame 的 13 例全數重跑（`INI_VAL = 1` → `base = 1`，對應手繪例子 L0 = H 的初始極性），13/13 通過，MNT／NB 分辨測項一併涵蓋、未受影響。*

*② 多 frame 極性，Chrome 實跑（Frame 重複數 = 6，XPOL 設成 `ACT=0/R_PH=0/F_PH=0/ST_LINE=0/SP_LINE=16383`，整個 frame 的準位就等於該 frame 的 ACTIVE）：*

| base | FRM_NO | frame 0 → 5 | 判讀 |
|---|---|---|---|
| `0`（INI_VAL=0） | `0` | `L H L H L H` | frame 0 = base，之後每張翻 |
| `1`（INI_VAL=1） | `0` | `H L H L H L` | frame 0 = base，之後每張翻 |
| `0`（INI_VAL=0） | `2` | `L L L H H H` | frame 0,1,2 = base，frame 3 起 = !base |
| `1`（INI_VAL=1） | `2` | `H H H L L L` | frame 0,1,2 = base，frame 3 起 = !base |

兩種 base 互為反相 → **frame 0 確實跟著 base 走，不是恆 HIGH**。

*③ Node self-check 擴充：除了原本 13 例，另加 6 組 frame 極性序列與 `FRM_NO = 99` 的翻轉點（frame 99 仍是 base、frame 100 才反相），並直接從 `wfg.html` 比對閉式與 base 定義的字面、確認 `toggleFrmCounter` 已不存在。總計 20/20 通過。*

---

## TCON 波形模擬與取樣 (wfg) v2.98.0 — 2026-08-07 ｜ MINOR ｜ ⚠ 輸出變更

**判定依據：** 本版有兩件事。① Toggle 演算法修正 —— `VERSIONING.md` §2 案例 2「改一個 bug」與案例 7「既有計算公式修正」→ **PATCH**，且因為舊版存下來的 toggle 波形圖用新版重跑會不一樣，依 **R1** 加註 `⚠ 輸出變更`。② 新增「TCON 型態（MNT／NB）」全域設定 —— 使用者多了一件能做的事（切 6-bit 欄位寬），既有操作全部保留、沒有任何按鈕移位或功能移除，符合 §2 案例 1 → **MINOR**。**兩者取較高者 → MINOR，版號 v2.97.480 → v2.98.0。**

> 這**不是** §2 案例 8「主動改設計」的 MAJOR：規則是拿 Bruce 的手繪七例與三組實機實測反推出來的**原本就該有的行為**，不是換一套新定義。
> 公告表列的 `wfg → v3.0.0` 分界跳版本次**仍未執行**（那一格是留給 MAJOR 的，本版不是），維持待裁決。

### 一、⚠ Toggle 模式演算法修正（定版規則，10 例實測驗證）

**問題**：Toggle 信號的逐行準位算錯。手繪七例中錯 4 例（#1／#3／#4／#7），而且 `ACT_TYPE = 0` 的設定完全算不出正確波形。

**根因**（`wfg.html`，四處各自算了一份 counter，彼此還不一致）：

| # | 位置 | 錯在哪 |
|---|---|---|
| 1 | `wfgCalcGpio` 的 `if (actType === 0)` | `ACT_TYPE = 0` 被導向「VBI／Column frame 級 toggle」的獨立分支，**永遠進不到 dot 演算法**。手繪七例有 5 例是 `ACT_TYPE = 0`，全部走錯路 |
| 2 | `dotRCnt = gpio.r_ph % dotPeriod` | `R_PH` 應該是**直接載入、不取模**；且沒有位元寬溢位這條歸零路徑 |
| 3 | `((dotRCnt & dotFPh) === 0) ? 1 : 0` XOR `toggleLevel` | 準位判準應該是「與 `bit(ST_LINE)` **同相／反相**」，不是「bit 等不等於 0」。`R_PH` 一改，整條波形的相位要跟著平移 |
| 4 | `wfgDrawPhCntRow` 的高亮長度 | 註解明寫 "past spLine"，高亮會延伸超過 `SP_LINE`；新語義下 `SP_LINE` 之後就停止計數，高亮必須在那裡停 |
| 5 | `wfgDrawPhCntRow` 的計數值 | `(effIniPh + linesFromSt) % cycle` + `Math.min(iniPh, actType)` —— 同樣是取模、沒有位元寬 wrap |
| 6 | `wfgFindPhCntTriggerBefore` / `wfgPhCntIsTriggerLine` | 簽章沒有 `SP_LINE`；`actType <= 0` 時判成「`ST_LINE` 之後每條都觸發」 |
| 7 | `toggleLevel` 初值固定為 0 | `FRM_NO = 0`（threshold = 1）時 frame 0 剛好被翻成 1、答案正確；但 `FRM_NO > 0` 時 frame 0 不翻，ACTIVE 變成 0，整個 frame 0 停在 `!ACTIVE`，**極性與後續 frame 相反** |

**修法**：抽出共用核心 `wfgToggleMaskBits()` / `wfgToggleCntSeq()` / `wfgToggleRelLevel()`，波形本體、`R_PH_CNT` 顯示列、cursor 的 `R_DLY` 起算條**三處全部改用同一份計數**（先前是三份各自為政，會出現「波形對了但顯示列對不上」）。舊的 VBI／Column 分支整個移除 —— 統一之後 Column preset（`AT=0 / RP=0 / FP=0`）自然落在「bit 恆定 → 整個 frame 恆為 ACTIVE，ACTIVE 由 FRM_NO 逐 frame 反相」，與舊分支的輸出等價。

**定版規則**（2026-08-07，經手繪七例 + 三組實測共 10 例驗證）：

```
maskBits = (TCON_TYPE == MNT) ? 0x1FF : 0x3F

cnt(ST_LINE) = R_PH                                    ← 直接載入，不取模
cnt(n+1)     = (cnt(n) == ACT_TYPE) ? 0                ← 正常週期歸零
                                    : ((cnt(n)+1) & maskBits)   ← 溢位歸零

bit(n)   = (cnt(n) & F_PH) != 0                        ← F_PH 是位元遮罩
level(n) = (bit(n) == bit(ST_LINE)) ? ACTIVE : !ACTIVE ← 相對起點，不是 bit 值本身

ST_LINE 那條無條件進入 ACTIVE（套 R_DLY）；兩個方向都用 R_DLY，toggle 沒有 F_DLY
n > SP_LINE：停止計數、不再轉態，keep level(SP_LINE) 到 frame 結束
frame 0 的 ACTIVE 為 HIGH，之後每 FRM_NO+1 個 frame 反相一次
```

> 「溢位歸零後若剛好等於 `ACT_TYPE` 就會鎖死」是這條規則一個容易忽略但已被實測坐實的行為：NB 下 `ACT_TYPE=0 / R_PH=60`，counter 走 `60→61→62→63→0`，而 `0 == ACT_TYPE`，於是從此恆為 0，波形之後不再轉態。

**驗收（10 例全過）**：

| 來源 | 參數（`ST_LINE=0 / R_DLY=0`） | L0～L10 |
|---|---|---|
| 手繪 #1 | `ACT=0, R_PH=1, F_PH=2, SP=8` | `H L L H H L L H H H H` |
| 手繪 #2 | `ACT=1, R_PH=1, F_PH=1, SP=8` | `H L H L H L H L H H H` |
| 手繪 #3 | `ACT=1, R_PH=1, F_PH=2, SP=8` | `H H H H H H H H H H H` |
| 手繪 #4 | `ACT=0, R_PH=1, F_PH=1, SP=8` | `H L H L H L H L H H H` |
| 手繪 #5 | `ACT=0, R_PH=1, F_PH=0, SP=8` | `H H H H H H H H H H H` |
| 手繪 #6 | `ACT=0, R_PH=0, F_PH=1, SP=8` | `H H H H H H H H H H H` |
| 手繪 #7 | `ACT=0, R_PH=2, F_PH=1, SP=8` | `H L H L H L H L H H H` |
| **實測** | `ACT=0, R_PH=2, F_PH=2, SP=8` | `H H L L H H L L H H H` |
| **實測** | `ACT=3, R_PH=60, F_PH=2, SP=8` | `H H L L H H L L H H H` |
| **實測（NB）** | `ACT=0, R_PH=60, F_PH=1, SP=8 與 SP=12` | `H L H L H H H H H H H` |

### 二、新增：TCON 型態（MNT／NB）全域設定

「數位信號」卡片最上方新增一組 **MNT / NB** 選項，決定 `ACT_TYPE` / `R_PH` / `F_PH` 的位元寬 —— **MNT（Monitor）9 bit `0~511`**、**NB（Notebook）6 bit `0~63`**，所有數位信號共用。

- **預設 MNT**；**不跟內建預設綁定**，換快捷設定時保留使用者目前的選擇。
- 切到 NB 時，所有數位信號中大於 63 的三個欄位**夾為 63**（clamp，不是 `& 0x3F` 截斷 —— `500` 會變 `63` 而不是 `52`）。此動作不可逆。
- 欄位標籤與滑桿上限跟著切換；一般（非 Toggle）信號**一樣**吃這個限制。
- 隨匯出／匯入一起帶走；**沒有這個欄位的舊設定檔匯入時一律當成 MNT**。
- 這也是唯一能分辨兩者的測項：同一組 `ACT=0 / R_PH=60 / F_PH=1 / SP_LINE=12` 下，NB 為 `H L H L H H H H H H H H H`（L4 溢位歸零後鎖死），MNT 為 `H L H L H L H L H L H L H`（要數到 511 才 wrap）。

### 三、回歸驗證

- **內建預設（FHD 60Hz Single Gate）整張 canvas 逐像素零差異**：與 v2.97.480（commit `b7f8d86`）在同一組 view 下比對 1330 條掃描線的 FNV-1a 雜湊，**diff = 0**，18 條通道全部相同。也就是說使用者實際會載入的預設，輸出完全沒變。
- 上表 10 例 + MNT／NB 分辨測項共 13 組，透過**生產路徑** `wfgCalcGpio` 逐條取準位，13/13 全過（另有一份不依賴瀏覽器的 Node self-check，直接從 `wfg.html` 抽出共用核心函式跑同一組資料，同樣 13/13）。
- `R_PH_CNT` / `F_PH_CNT` 顯示列、觸發格高亮、`SP_LINE` 之後轉灰、即時測量的脈寬／週期，與波形逐條對得上。

### 四、附帶

- 新增 `window.wfgDebugGpioLevels(gpioIdx, firstLine, lastLine)`：走 `wfgCalcGpio` 把某支信號逐條 line 的準位吐成 `H`/`L` 字串，供自動化驗證比對期望序列（不影響 UI）。共用核心三支函式一併掛上 `window`。
- 說明頁 `wfg-guide.html` 同步更新：新增 **6-0 TCON 型態（MNT／NB）**，改寫 **6-2** 的 Toggle 演算法七條規則與逐行範例，`ACT_TYPE` / `R_PH` / `F_PH` 的範圍欄改成「0–511（MNT）／0–63（NB）」並連到 6-0。

---

## TCON 波形模擬與取樣 (wfg) v2.97.480 — 2026-08-07 ｜ PATCH ｜ ⚠ 輸出變更

**判定依據：** 本版兩項改動都是**顯示層**修正，`VERSIONING.md` §2 案例 2「改一個 bug」→ **PATCH**；因為畫面上的箭頭位置會變（過去截的圖用新版重跑會不一樣），依 **R1** 加註 `⚠ 輸出變更`。**波形資料本身完全沒有改動** —— 非 toggle GPIO 66/66 回歸零差異，toggle GPIO 的 `wfgCalcGpio` 與前一版位元相同。

> 開發過程中曾一度把 XPOL／LC 的 dot mode 改成 phase counter 語意（並暫定版號 v3.0.0／MAJOR），
> 經現場確認 **toggle 的原演算法本來就是對的**，該改動已完整回退，故本版不是 MAJOR。
> 回退後 `wfgCalcGpio` 與 v2.97.479 逐字元比對僅註解不同，程式碼完全相同。

### 一、⚠ R_DLY 與 F_DLY 的起算條不再差一條（非 toggle 信號）

**問題**：滑鼠停在 XSTB（`ACT_TYPE=0 / R_PH=0 / F_PH=0`）的波形上時，R_DLY 箭頭起算在滑鼠當下那一條，F_DLY 卻起算在**前一條**。

**根因**（`wfg.html` 原 22889／22899／22913／22923）：舊版是拿「滑鼠所在區塊的左右邊界」各自往回反推觸發條 —— 滑鼠停在寬的 LOW 區時，R 取右邊界（下一條的 rising）、F 取左邊界（前一條的 falling），兩支箭頭參考的根本不是同一條。這是**顯示層**的問題，波形資料本身一直是對的。

**修法**：新增 `wfgPhCntIsTriggerLine()` 與 `wfgTconDlySpan()`。起算點一律取「PH_CNT 數到 `ACT_TYPE` 的那一條」，R 與 F 判準完全相同：優先採用滑鼠所在那一條（前提是該條確實是觸發條，且該條算出的邊沿真的存在於 transitions 中）；該條沒有觸發時（例如 VST1 這種單發脈衝、滑鼠停在 pulse 中段）才退回舊的邊界反推，因此 VST1 既有的正確行為不變。

**實測（改前 vs 改後，Chrome hover 讀值）**

| 條件 | 改前 | 改後 |
|---|---|---|
| XSTB `ACT=0/R_PH=0/F_PH=0`，view 100–105，滑鼠停 Line 102 | R_DLY 起算 **Line 102**、F_DLY 起算 **Line 101** ← bug | 兩支箭頭起點同在 **Line 102 行首** ✅ |
| VST1 `ACT=15/R_PH=15/F_PH=13/ST_LINE=2`，view 0–8 | R_DLY 起算 Line 2、F_DLY 起算 Line 4 | 完全相同（未被動到）✅ |

VST1 的 F_PH_CNT 在畫布上實際顯示 Line 2 = 13 → Line 3 = 14 → **Line 4 = 15**（高亮），與規格描述一致。

**規格依據**：`~/TCON/TCON設定相關/Set_6138_Timing_20171005.pdf`
- P.12「YDIO/VST」：`When R_PH_CNT = ACT_TYPE , this line will have a rising` ／ `When F_PH_CNT = ACT_TYPE , this line will have a falling`（同句在 P.14／15／16 的 CKx 頁重複四次）
- P.10「XSTB (each line a pulse)」圖：`ST_LINE=2`，R_DLY 與 F_DLY 兩支箭頭起點畫在**同一條垂直參考線**上

### 二、Toggle 信號的顯示層改為符合 toggle 演算法

Toggle 的演算法與一般打 pulse 的信號不同 —— **`F_PH` 是位元遮罩而非相位起始值**（指定要看 `R_PH_CNT` 的哪個 bit，該 bit 的值就是輸出準位），**兩個方向的轉態都用 `R_DLY`**，而且 **toggle 模式沒有 `F_DLY`**。

🔴 **適用範圍是「這支信號有沒有勾 Toggle」，與信號名稱無關。** 18 支數位信號任何一支勾了 Toggle 都走這套演算法，不是 XPOL／LC 的特例。波形引擎 `wfgCalcGpio` 本來就是用 `if (gpio.toggle)` 分支（沒有任何 `name === 'xpol'` 之類的硬編判斷），本次把**顯示層**也一併改成同一個判準：

- **hover 箭頭**：`gpio.toggle` 走獨立分支，只畫一支 **R_DLY** 箭頭，起算條取「轉態邊沿往回退 `R_DLY`」所在的那一條（跨行也正確），**不畫 F_DLY**。原本會用 phase counter 判準反推起算條並多畫一支 F_DLY，兩者對 toggle 都不成立。
- **內部列 `F_PH_CNT`**：toggle 下沒有這個計數器，改顯示「被選中 bit 的值（0／1）」；兩列的高亮也從「counter 數到 ACT_TYPE」改成「bit 改變的那一條」（＝ R_DLY 實際作用的那一條）。
- **信號卡片欄位標籤**：勾 Toggle 時 `F_PH` 標成 `= bit mask (0b…)`、`F_DLY` 標成「Toggle 模式不使用」。

**規格佐證**：同一份 PDF 的 P.17（XPOL column mode 暫存器表）把 `R_DLY_XPOL` 標為「設定 toggle delay from 參考點」、`F_DLY_XPOL` 標為「**Toggle mode 時 無用**」；P.18（1 line dot 暫存器表）實際值 `R_DLY=03C0h`、`F_DLY=0000h`。P.19 明文 `INI_F_PHASE[5:0] = set the value of each line ( = 6'b 000001)`，即遮罩語意。

**toggle 演算法逐條驗證**（`ACT_TYPE=3`／`R_PH=1`／`ST_LINE=2`／`F_PH=2` → 看 bit 1）：

| Line | R_PH_CNT | bit 1 | 期望準位 | 實際準位 | 該行轉態 |
|---|---|---|---|---|---|
| 2 | `01` | 0 | LOW | LOW | （frame 起始準位造成一次轉態，見下註）|
| 3 | `10` | 1 | HIGH | HIGH | `dly=700` = R_DLY ✅ |
| 4 | `11` | 1 | HIGH | HIGH | 無 ✅ |
| 5 | `00` | 0 | LOW | LOW | `dly=700` = **R_DLY**（high→low 也用 R_DLY）✅ |

Line 6–11 延續同一週期同樣全對；frame 1 整體反相（`FRM_NO_0=0` → 每 1 frame 反一次）也全對。掃描整個 frame 的所有轉態，`dly` 值只有 `700`（= R_DLY），**沒有任何一筆用到 `F_DLY`（值為 0）**。

> 註：Line 2 在 frame 0 會多一次轉態，成因是 `INI_VAL=2 (Keep)` 下 frame 0 的起始準位為 HIGH，在第一條 active line 落到 bit 決定的 LOW。這是 frame 邊界的初始化，不是 bit 判斷邏輯；frame 1 的 Line 2 就沒有這次轉態。

**「與信號名稱無關」的機械化證明**：同一組參數（`ACT_TYPE=3 / R_PH=1 / ST_LINE=2 / F_PH=2 / Toggle 勾選`）套到全部 18 支數位信號（`xstb`、`xpol`、`vst1`、`vst2`、`ck1`–`ck8`、`LC`、`tend`、`vs`、`hs`、`gpo0`、`gpo1`），逐筆比對 4 個 frame 的 transitions，**18 支輸出完全相同**。同一組參數取消 Toggle 勾選則輸出不同（確認確實切換到 phase counter 演算法）。以 `ck1` 這支非 XPOL 信號單獨跑上表四條，結果與 XPOL 一字不差。

### 三、回歸

`wfgCalcGpio` **完全沒有改動**：與 v2.97.479 逐字元比對，差異僅止於註解（補上 toggle 演算法的完整說明），程式碼一字未動。另外抽出 preset 內全部 26 組 GPIO 定義 × 3 種 frame 設定（`vt=1112/ht=1334`、`vt=1112/ht=667` 模擬 dual gate、`vt=600/ht=1334`），共 66 次逐筆比對 `line:dly:level`，**差異 0 次**。7 顆 XPOL 快速設定鈕的輸出與 v2.97.479 相同，位移量 0。

---

## 📌 文件整理 — 2026-08-04（不進版號）

**判定依據：** `VERSIONING.md` **§3 不進版的情況**明列「只改 `docs/`、`CHANGELOG.md`、註解」→ **不動版號**。本次只補文件欄位與規則條文，未改動任何產品程式碼、未改變任何行為。

### 一、`VERSIONING.md` 補 R4 與案例 14

原規則對「改變開啟時的預設畫面／某個選項的預設值」沒有明文，判定得靠推論。補上 **R4（起始狀態／預設值改變）**：不影響任何既有操作 → MINOR；會讓既有操作失效或移位 → MAJOR。同時補 §2 案例 14 作為具體對照，並在 §5.5 追加修正記錄。依 2026-08-04 使用者裁示。

### 二、`判定依據：` 欄位回溯補齊 33 個條目

`判定依據：` 自 v3.1.0 起成為 CHANGELOG 條目的必填欄位，先前的條目沒有。本次補齊全部歷史條目（v1.0.0 ~ v3.0.0 共 30 條，加上原本已有的 3 條，全 33 條 0 缺漏）。

處理原則：

- **只補欄位，不改任何既有敘述**（不動內文、不動版號、不動日期）。
- 每條依**當時該版實際做了什麼**判定，寫明套用哪一條規則、為什麼是那個級別。
- **歷史版號一律不回溯調整**（依 2026-08-02 已定的處置）；當初判定與現行規則不一致的，在該條目如實註明應為哪個版號。
- 回溯補的欄位統一放在條目標題之後，與 v3.1.0 起「摘要在前、判定依據在後」的體例略有不同，是為了機械化插入時不動到任何既有文字。

### 三、與現行規則不一致的條目（僅補記，不調整）

| 版號 | 當初 | 依現行規則 | 原因 |
|---|---|---|---|
| `v3.0.0` | MAJOR | **v2.18.0** | 本波自 v2.0.0 起算，波內不應重複進 MAJOR（R2） |
| `v2.12.0` | MINOR | **v2.11.1（PATCH）** | 本版是移除既有入口，沒有新增使用者能做的事；波內移除依 R2 併入開頭的 MAJOR，不另計 |
| `v2.1.0` | MINOR | 可能為 PATCH | 若當時的重點只在改成同一套實作而未新增能力，會落在 PATCH（已在該條目註明為存疑，非確定） |

### 四、規則制定前的 v1.x（10 條）

`VERSIONING.md` 訂於 2026-08-02，v1.x 全部早於該日，標題列本來就沒有級別欄。本次以現行規則回溯判定並補記，其中四條與現行規則不一致：

| 版號 | 回溯判定 | 依現行規則應為 |
|---|---|---|
| `v1.8.0` | PATCH | `v1.7.1` |
| `v1.6.0` | PATCH | `v1.5.1` |
| `v1.2.0` | PATCH | `v1.1.1` |
| `v1.1.0` | MAJOR | `v2.0.0` |

`v1.1.0` 判為 MAJOR 的理由：互動模型由「點格子＝選取」改為「點格子＝立即套用」，屬既有功能的輸出主動改變。

---

## TCON 波形模擬與取樣 (wfg) v2.97.479 — 2026-08-06 ｜ PATCH

**XPOL 極性反轉快速設定的第 7 顆按鈕，名稱由 `+-+` 改為 `3-line`。**

**判定依據：** `VERSIONING.md` **§2 案例 3**（改 UI 版面、不動功能 —— 微調「間距、配色、**文案**、控制項位置小移」→ PATCH）。判準是「使用者要不要重新找東西」：按鈕**沒有移除、沒有移位**，仍是同一區塊的第 7 顆，只有標籤文字改變 → 不觸發 MAJOR。沒有新增任何能做的事 → 不觸發 MINOR。填入的參數（`ACT_TYPE=2 / R_PH=0 / F_PH=1`）與 `ST_LINE` / `SP_LINE` 連動行為**完全不變**，波形與數值輸出零改變 → **不標** `⚠ 輸出變更`。

### 為什麼改名

`+-+` 描述的是**一個週期內**的三行極性（正 → 負 → 正），程式行為與名稱一致。但週期首尾都是正，相鄰週期的尾正與頭正相連，連續看是 `+ - + | + - + |…`，每 3 行只有 1 行反極性；加上 XPOL 依 `FRM_NO` 逐 frame 整體反相，下一 frame 同段變成 `- + - | - + -`。同一組設定會被讀成「正正負」或「正負負」，名稱反而造成誤解（v2.97.478 的實測記錄見下一則條目）。

改為 `3-line` 後，與 `1-line` / `2-line` / `4-line` / `8-line` 一致，全部以**週期行數**命名，語意統一。

### 改了什麼

| 檔案 | 位置 | 改動 |
|---|---|---|
| `wfg.html` | `wfgRenderGpioList()` 的 `xpolPresets` 陣列 | `{ label: '+-+', … }` → `{ label: '3-line', … }`（`at` / `rp` / `fp` 三個值不動） |
| `wfg.html` | `wfgCalcGpio()` dot mode 的模式列表註解 | `+-+(AT=2,FP=1)` → `3-line(AT=2,FP=1, was labelled "+-+")` |
| `wfg-guide.html` | §6-2 表格最後一列、下方說明區塊標題與內文 | 名稱同步為 `3-line`，並保留一句「在 v2.97.479 之前叫 `+-+`」供對照舊版 |

**i18n：** 這 7 顆按鈕的標籤是 `xpolPresets` 陣列裡的硬編字串，**不經過 `t()`**，`common/i18n.js` 沒有、也不需要對應詞條（該檔僅有區塊標題 `wfg.xpolPresetLabel`）。因此繁 / 簡 / 英三個語系顯示的都是同一份標籤，一處改動即三語一致。

**未改動、刻意保留的地方：**

- `legacy-index.html` 的舊版 SPA 副本（第 26507 行註解、第 32304 行 label）—— 該檔是凍結的歷史存檔，站內**沒有任何頁面連結過去**，改它等同竄改舊版快照。
- 各 `.bak` 備份檔與 `.claude/worktrees/` 下的副本 —— 同理，不動歷史檔。
- 本 CHANGELOG 既有條目（v2.97.478 及更早）裡的 `+-+` —— 那是當時的事實紀錄，照 `VERSIONING.md` 的一貫做法不回溯改寫。

### 實測驗證（本機 `wfg.html`，FHD 60Hz Single Gate，XPOL 勾 Toggle）

| 語系 | 7 顆按鈕的實際文字 | 按下第 7 顆後的參數 |
|---|---|---|
| 繁體中文 | Column / 1-line / 2-line / 1+2-line / 4-line / 8-line / **3-line** | `ACT_TYPE=2` `R_PH=0` `F_PH=1` `ST_LINE=0` `SP_LINE=16383` |
| 简体中文 | Column / 1-line / 2-line / 1+2-line / 4-line / 8-line / **3-line** | 同上 |
| English | Column / 1-line / 2-line / 1+2-line / 4-line / 8-line / **3-line** | 同上 |

三個語系皆截圖確認按鈕文字與橘色選中高亮，且 `ST_LINE` / `SP_LINE` 滑桿位置與數字一致（ST 在最左、SP 在最右），行為與 v2.97.478 相同。`wfg-guide.html` §6-2 亦實際開啟確認渲染正確。

---

## TCON 波形模擬與取樣 (wfg) v2.97.478 — 2026-08-06 ｜ PATCH ｜ ⚠ 輸出變更

**⚠ 輸出變更 — XPOL 極性反轉快速設定的 7 顆按鈕，改為一併設定 `ST_LINE` / `SP_LINE`。**

**判定依據：** `VERSIONING.md` **§2 案例 2**（改一個 bug → PATCH）＋ **R1**（修 bug 即使畫面會變仍算 PATCH，但要標 `⚠ 輸出變更`）。原本的 handler 已經有「dot 模式時把 `SP_LINE` 設成 16383」這半套邏輯，代表原設計意圖就是要由按鈕決定行區間，只是漏了 `ST_LINE`、也沒處理按回 Column 的還原 —— 本次是把既有意圖補完，屬於修正為原本就該有的行為，不是主動改設計，故不觸發 MAJOR。7 顆按鈕位置、名稱、既有的 `ACT_TYPE` / `R_PH` / `F_PH` 填值全部不變，沒有新增或移除功能 → 不觸發 MINOR。

### 改了什麼

`wfgApplyXpolPreset()`（`wfg.html`）：

| 按下的按鈕 | 舊行為 | 新行為 |
|---|---|---|
| `1-line` / `2-line` / `1+2-line` / `4-line` / `8-line` / `+-+` | `SP_LINE` = 16383，**`ST_LINE` 不動** | `ST_LINE` = **0**、`SP_LINE` = **16383** |
| `Column` | `ST_LINE`、`SP_LINE` **都不動**（維持先前數值） | `ST_LINE` = **0**、`SP_LINE` = **0** |

diff（`wfg.html` `wfgApplyXpolPreset`）：

```
-  if (actType > 0) {
-    // For dot modes, set SP_LINE=16383 (full frame)
-    gpio.sp_line = 16383;
-  }
+  gpio.st_line = 0;
+  gpio.sp_line = (actType > 0) ? 16383 : 0;
```

`ACT_TYPE === 0` 只有 Column 這一顆用到（其餘 6 顆分別是 1 / 3 / 3 / 7 / 15 / 2），因此 `actType > 0` 與「非 Column」等價。

### 為什麼舊行為是錯的

XPOL 的 dot 模式是逐行掃 `ST_LINE` → `SP_LINE` 這個區間套用極性圖樣（`wfgCalcGpio()` 的 `for (dotLine = dotStLine; dotLine <= dotSpLine; ...)`）。舊版只把 `SP_LINE` 拉到滿，`ST_LINE` 卻停在使用者先前的值（預設的 FHD 快捷設定是 `1087`），等於圖樣只從第 1087 行才開始生效，前面 1087 行沒有極性變化 —— 但按鈕的名稱（1-line、2-line…）描述的是整個 frame 的極性樣式，兩者不一致。

反過來按回 Column 時，`SP_LINE` 會留在 16383 不還原，也讓 Column 的 frame 級 toggle 帶著一個與模式無關的殘值。

### 實測驗證（本機 `wfg.html`，FHD 60Hz Single Gate 快捷設定，XPOL 勾 Toggle）

逐一點擊 7 顆按鈕後讀回 UI 欄位（number 與 slider 兩者的值，格式 `number/slider`）：

| 點擊 | ACT_TYPE | R_PH | F_PH | ST_LINE | SP_LINE |
|---|---|---|---|---|---|
| Column | 0/0 | 0/0 | 0/0 | **0/0** | **0/0** |
| 1-line | 1/1 | 0/0 | 1/1 | **0/0** | **16383/16383** |
| Column | 0/0 | 0/0 | 0/0 | **0/0** | **0/0** |
| 2-line | 3/3 | 0/0 | 2/2 | **0/0** | **16383/16383** |
| Column | 0/0 | 0/0 | 0/0 | **0/0** | **0/0** |
| 1+2-line | 3/3 | 1/1 | 2/2 | **0/0** | **16383/16383** |
| Column | 0/0 | 0/0 | 0/0 | **0/0** | **0/0** |
| 4-line | 7/7 | 0/0 | 4/4 | **0/0** | **16383/16383** |
| Column | 0/0 | 0/0 | 0/0 | **0/0** | **0/0** |
| 8-line | 15/15 | 0/0 | 8/8 | **0/0** | **16383/16383** |
| Column | 0/0 | 0/0 | 0/0 | **0/0** | **0/0** |
| +-+ | 2/2 | 0/0 | 1/1 | **0/0** | **16383/16383** |
| Column | 0/0 | 0/0 | 0/0 | **0/0** | **0/0** |

覆蓋手動值也一併驗過：手動改成 `ST_LINE=200 / SP_LINE=900` 後按 Column → 兩者歸 `0/0`；手動改成 `ST_LINE=333 / SP_LINE=777` 後按 8-line → `0/16383`。載入預設時 XPOL 原本是 `ST_LINE=1087 / SP_LINE=1087`，按下 1-line 後同樣變成 `0/16383`。

### 順帶釐清：`+-+` 這顆按鈕的實際樣式（本次未改任何行為）

`+-+` 填的是 `ACT_TYPE=2 / R_PH=0 / F_PH=1`，週期 3 行，`wfgCalcGpio()` 逐行以 `((dotRCnt & F_PH) === 0) ? 1 : 0` 取極性，計數 0→1→2 對應 **正 → 負 → 正**，按鈕名稱與程式行為一致，不是誤標。

但實際波形讀起來會像「正正負」或「正負負」，原因有兩個：

1. 週期首尾都是正，相鄰週期的尾正與頭正相連 → 連續序列是 `+ - + | + - + | …`，每 3 行只有 1 行反極性，肉眼會讀成 2:1。
2. XPOL 依 `FRM_NO` 逐 frame 整體反相，下一個 frame 同一段變成 `- + - | - + -`，也就是「負負正」。

實測（canvas 逐像素判讀 XPOL 電位，line 寬約 29.4 px）：frame 邊界左側為 `H(2行) L(1行) H(2行) L(1行) …`，邊界右側翻成 `L(2行) H(1行) L(2行) H(1行) …`，兩個相鄰 frame 極性完全相反，與上述推導一致。說明已補進 `wfg-guide.html` §6-2。

---

## TCON 波形模擬與取樣 (wfg) v2.97.477 — 2026-08-06 ｜ PATCH ｜ ⚠ 輸出變更

**⚠ 輸出變更 — 修正 SD1（Source Driver）反映 XPOL 極性轉態晚一行的問題。**

**判定依據：** `VERSIONING.md` **§2 案例 2**（改一個 bug → PATCH）＋**§2 案例 7**（既有計算公式修正 → PATCH ＋ `⚠ 輸出變更`）＋**R1**（修 bug 即使畫面會變仍算 PATCH，但使用者過去存下來的圖用新版重跑會不一樣，必須標註）。沒有任何按鈕移位或功能增減 → 不觸發 MAJOR／MINOR。

### 問題

Source Driver 的極性取樣點與輸出點是**兩個不同的時間點**：

1. **XSTB rising** — 取樣 XPOL 準位，決定這一筆要用正極還是負極 gamma rail
2. **XSTB falling** — 才把該極性對應的類比電壓輸出（latch）

舊版在 `_wfgPrecomputeSdChannel()` 用 `polForLine(line)` 取極性 —— 那是**該行行首（frac = 0）**的 XPOL 準位，不是 XSTB rising 位置的準位。當 XPOL 在一行的中間轉態（而 XSTB 在該行的後段）時，行首讀到的還是舊極性，SD1 要等到**下一行**的 XSTB falling 才會反映出新極性，畫面上就是**極性晚一條**。

以預設的「FHD 60Hz Single Gate」為例（effHtotal = 1334，XPOL `st_line` 1087 / `r_dly` 700，XSTB `r_dly` 1116 / `f_dly` 1182）：

| 位置 | 事件 |
|---|---|
| 1087.5247 | XPOL 0 → 1 |
| 1087.8366 | XSTB↑（極性取樣點，此時 XPOL 已經是 1） |
| 1087.8861 | XSTB↓（電壓輸出點）→ 應輸出正極 5.200 V |

修正前 `target[1087] = 4.800 V`（負極，用行首 1087.0 的 XPOL = 0），要到 `target[1088]` 才變 5.200 V —— 晚一條。

### 修正

三條計算路徑同步改為「極性在**該 falling 之前最近的一個 XSTB rising** 取樣」，電壓輸出點（XSTB falling）維持不變：

- `_wfgPrecomputeSdChannel()` — 新增 `xstbPolFracPerLine[]`，在掃描 XSTB transition 時記錄每個 falling 對應的 rising 位置；`polPerLine[]` 的填值改到 XSTB 掃描之後，用 `polForLine(line + xstbPolFracPerLine[line])`。沒有 falling 的行維持行首取樣（那些行不會 latch，行為與舊版一致）。
- `_wfgExtendSdPrecomp()` — lazy extend 的同一份邏輯同步跟進。
- `wfgComputeSourceDriverSamples()` — fallback／脈衝計數用的路徑：detailed path 追蹤最近的 rising 當 `polX`；fast path 新增 `xstbPolFracDly`。

找不到前置 rising 時（初始準位就是 high）退回 falling 自身位置。rising 落在前一行（`f_dly` 跨行）時偏移為負，仍能正確配對。

### 影響範圍

- **會變的**：SD1 類比波形在 XPOL 轉態附近的極性切換時間點提早一行。舊版存下的截圖／匯出資料在該位置會與新版不同。
- **不會變的**：Gate／CPV（CKO、Level Shifter）時序、數位信號、灰階與 gamma 計算、RC 充放電曲線、Line Buffer 位移、其他所有設定與輸出格式。

### 驗證

以 Bruce 回報的條件（TCON Timing 調整練習模式、FHD 60Hz Single Gate 預設）逐格對照，連續 6 個 XSTB 週期：

| 行 | XSTB↑ | 該時點 XPOL | XSTB↓ | SD1 |
|---|---|---|---|---|
| 1085 | 1085.8366 | 0 | 1085.8861 | 4.800 V（負極） |
| 1086 | 1086.8366 | 0 | 1086.8861 | 4.800 V（負極） |
| **1087** | **1087.8366** | **1** | **1087.8861** | **5.200 V（正極）** |
| 1088 | 1088.8366 | 1 | 1088.8861 | 5.200 V（正極） |
| 1089 | 1089.8366 | 1 | 1089.8861 | 5.200 V（正極） |
| 1090 | 1090.8366 | 1 | 1090.8861 | 5.200 V（正極） |

反向轉態（XPOL 1 → 0 @ 2199.5247）同樣在 L2199 就反映；跨 frame（L5535，經 lazy extend 路徑）亦正確；把 `f_dly` 改成 1500 讓 falling 跨行後，`XSTB↓@1088.1244` 仍正確配對到 `XSTB↑@1087.8366` 的 XPOL 準位。

---

## TCON 波形模擬與取樣 (wfg) v2.97.476 — 2026-08-06 ｜ PATCH

**工具顯示名稱由「TCON 波形產生器」改為「TCON 波形模擬與取樣」（含 `<title>`、頁首標題、三語詞條）。**

**判定依據：** `VERSIONING.md` **§2 案例 3**（改 UI 版面、不動功能：微調 —— 間距、配色、**文案**、控制項位置小移 → PATCH）＋**§2 案例 11**（i18n 文案改動、**預設語言不變** → PATCH）＋判定表「操作流程：位置微調、文案、配色 → PATCH」「既有功能的輸出：不變」「功能增減：不增不減」。

- 只改**顯示文字**：檔名 `wfg.html` 不變、頁首與所有按鈕位置不變、沒有任何入口消失或移位 → 不觸發 MAJOR（使用者不需要重新找東西）。
- 沒有多出任何使用者能做的事 → 不是 MINOR（R3 判準：這一版之後能做的事有沒有多一件？沒有）。
- 波形計算、輸出檔案格式、`.txt` 設定檔內容全部未動 → 不需要 `⚠ 輸出變更`。
- 不涉及 **R4**：起始狀態、預設值、預設語言都沒有改變。
- 結論：**PATCH → v2.97.476**。

> **未套用 2026-08-02 公告的 `wfg → v3.0.0` 界線跳版，理由如下，待裁決：**
> 該公告寫的是「下次進版時順便讓爆掉的 patch 號歸零」。但本次實質是 PATCH，若寫成 v3.0.0，
> `tools/version_bump_check.py` 會由數字算出級別為 MAJOR，並要求 CHANGELOG 宣告 MAJOR —— 
> 那等於為了美觀而把 PATCH 宣告成 MAJOR，正好是該檢查器設計原則 1（級別由數字算出、宣告與事實不符即為錯）
> 要防的事；且 wfg 歷史上已有 MAJOR，依 **R2** 還會被要求補「波次宣告」，但本次並非新的一波。
> 界線跳版建議留給下一次真正的 MINOR 或 MAJOR 一併執行。

### 改名範圍

| 檔案 | 改動 |
|---|---|
| `wfg.html` | `<title>`、`og:title`、`meta description`、頁首 `wfg.title` 佔位文字、兩處程式註解 |
| `common/i18n.js` | `home.wfgTitle`、`wfg.title`（繁／簡／英）；`home.wfgDesc`、`wfg.subtitle` 的簡體用詞 |
| `index.html` | 工具卡片標題佔位文字 |
| `wfg-guide.html` | `<title>`、hero 標題、內文與 footer 提及（說明頁不納入版號機制，不影響本判定） |
| `ARCHITECTURE_PLAN.md` | 文件內的工具名稱 |

三語對照：繁中 `TCON 波形模擬與取樣`／簡中 `TCON 波形仿真与取样`／英文 `TCON Waveform Simulation & Sampling`。

🔴 **簡體用「仿真」不用「模拟」**：大陸將 analog 譯為「模拟」（模拟信号、模拟电路），而本工具正好有「類比信號」卡片，簡體即為「模拟信号」。叫「波形模拟」會被誤讀成「類比波形」；「仿真」無此歧義，且電子工程實務（SPICE 仿真、时序仿真）通行。

🔴 **`iSP 波形產生器` 未改**：那是另一個工具（`isp.html`），不在本次範圍。`common/i18n.js` 中 `模拟信号`（= analog signals，`wfg.analogSources` / `wfg.groupAnalog`）與 `预计算模拟波形`（= 預計算類比波形）是正確用法，一併保留未動。

### 配套

- Cache buster：`wfg.html` 的 `common/version.js` 與 `common/i18n.js` 由 `?v=20260719wfg475` 改為 `?v=20260806wfg476`（C2）。

---

## TCON FAE 工具箱首頁 (app) v1.90.1 — 2026-08-06 ｜ PATCH

**首頁工具卡片「TCON 波形產生器」改名為「TCON 波形模擬與取樣」。**

**判定依據：** `VERSIONING.md` **§2 案例 13**（修改共用檔 `common/*.js` 影響多個分頁 → 受影響的每個分頁**各自**依自身受到的影響程度判定）＋**§2 案例 3**（文案微調 → PATCH）。

- `common/i18n.js` 的 `home.wfgTitle` / `home.wfgDesc` 同時被首頁使用，首頁的可見文字確實改變，因此依案例 13 不能只進 wfg 而不判首頁。
- 首頁只有一張卡片的**文字**改變：卡片位置、圖示、連結目標、`?` 說明鈕全部不變，沒有新增或移除任何工具 → PATCH，不是 MINOR（新增分頁工具才進首頁 MINOR，見案例 12）。
- 結論：**PATCH → v1.90.1**。

### 配套

- Cache buster：`index.html` 的 `common/version.js` 與 `common/i18n.js` 由 `?v=20260804pat320` 改為 `?v=20260806app1901`（C2）。
- `pattern.html` 的 buster 維持 `?v=20260804pat320`：該頁不顯示 WFG 名稱，本次共用檔改動對它無可見影響，依案例 13 不進版、不動 buster。

---

## Pattern Generator 畫面產生器 (pattern) v3.2.0 — 2026-08-04 ｜ MINOR

**新增「亮暗反轉」按鈕；開啟工具的預設畫面改為測試畫面的 Horizontal 256。**

**判定依據：** `VERSIONING.md` **R2**（一波重整以 MAJOR 開頭，波內的後續步驟依自身性質各自判定）＋判定表「功能增減 → **新增**獨立功能 → MINOR」。

- 本波重整自 v2.0.0 起算，波內後續不重複進 MAJOR。
- 新增「亮暗反轉」按鈕：多了一個既有功能組合不出來的動作，其餘入口全部留在原位 → 命中判定表 MINOR 欄。
- 預設畫面改變屬於**起始狀態**調整：開啟後第一眼看到的東西不同，但沒有任何按鈕移位、沒有功能被移除、手動 4×4 模式照常可用 → 不構成「原本的按鈕找不到了」，不進 MAJOR；但也不是修正既有缺陷，不算 PATCH。與新增按鈕同版，取較高者。
- 結論：**MINOR → v3.2.0**。

### 亮暗反轉

把亮組與暗組的**灰階值**互換（例：亮 192／暗 64 → 亮 64／暗 192）。

🔴 **交換的是值不是分組**：`pgGrpLit` / `pgGrpDark` 完全不動，原本屬於亮組的格子反轉後仍屬亮組，「選取亮組」選到的還是同一批。

| 設計決定 | 內容與理由 |
|---|---|
| 組內值不一致時 | 取該組的**代表值**（出現最多次的值，平手取較大；與 A-1 的取法同一套邏輯，差別在**不排除 0**，因為暗組整組為 0 時代表值本來就該是 0）互換。逐格一對一交換不可行 —— 兩組格數未必相同，也沒有自然的配對關係。 |
| 有選取時 | **不受選取影響**，直接對兩組作用。這顆按鈕的語意是對整個畫面的亮暗做互換，與「選取哪幾格」是不同維度；若讓它跟著選取跑，語意會變得無法簡單描述。 |
| 純灰階畫面（沒有暗組） | 按鈕停用，tooltip 說明沒有可互換的對象。 |
| 4×4 編輯區不適用的畫面（沒有亮組） | 同上，按鈕停用並說明。 |

**已知限制（tooltip 已寫明）**：連按兩次回到原狀這件事，只在**組內各格值一致**時成立。組內原本不一致時，第一次反轉就會以代表值抹平，第二次回不到最初狀態。實測：亮組為 23 格 192 + 1 格 100 時，反轉後全組變 64，再反轉全組變 192，那一格的 100 不會回來。

### 預設畫面改為 Horizontal 256

開啟工具後不再停在手動 4×4 模式，而是直接顯示測試畫面的 Horizontal 256（由左到右的白／紅／綠／藍四條灰階條）。「🎛️ 手動 4×4」仍可隨時切過去。

實作放在初始化的最後才呼叫 `pgSelectPattern('horiz256')`，因為它會用到前面剛建好的編輯區、版面與遮罩狀態。編輯區仍先填成 L255 —— 那不是要顯示的畫面，只是給手動模式一個乾淨的起始值，切過去時不會看到空白。

這張畫面屬於「4×4 編輯區不適用」的那一類，走的是既有的不適用分支（48 格清空、亮組為空、未選取時的灰階操作作用於全部 48 格並在提示文字寫明）。該路徑在 v3.1.0 已處理過，本版只是讓它成為預設狀態；v3.1.0 修掉的「版面未就緒導致 48 格全 0」的退化情況經實測未重現。

### 驗證（值一律從畫面讀回）

**亮暗反轉**

| 情境 | 結果 |
|---|---|
| `Skip SubPixel` → 亮 192／暗 64 → 按反轉 | 亮 **64**、暗 **192**；48 格逐格核對 |
| 再按一次 | 逐格回到 亮 192／暗 64（與反轉前字串相同） |
| 反轉後按「選取亮組」 | 選到 24 格，且索引與原本那批**逐一相同** |
| 有選取（24 格）時按反轉 | 兩組仍都被交換，未受選取限制 |
| 純灰階（48 亮／0 暗） | 按鈕 `disabled`，tooltip 說明無可互換對象；點擊後值不變 |
| 編輯區不適用（0 亮／48 暗） | 同上 |
| 組內不一致（23×192 + 1×100） | 反轉後全組 64、再反轉全組 192，確認限制成立 |

**預設畫面**

| 項目 | 結果 |
|---|---|
| 載入後模式／畫面 | `pattern` / `horiz256` |
| 1920×1080 取樣四條帶（各帶最左／四分之一／中央／最右） | 白 `0,0,0`→`255,255,255`；紅 `0,0,0`→`255,0,0`；綠 `0,0,0`→`0,255,0`；藍 `0,0,0`→`0,0,255` |
| 灰階控制項 | 數字框 0、拉霸 0（該畫面編輯區不適用，48 格為 0） |
| 亮組／暗組 | 0／48，提示文字說明會作用於全部 48 格，反轉鈕停用 |
| 點格子切到手動 4×4 | 模式轉為 `subpixel`，48 格套用當前值 |
| 切回 Horizontal 256 | 模式與畫面正確還原 |
| 切到其他畫面（`Skip SubPixel`） | 分組 24／24，反轉鈕恢復可用 |

**其他**：`tools/scan_untranslated_keys.js` 3 語言 × 4 畫面狀態 = 12 種組合 **0 命中**；`tools/check_cache_buster.py` 通過（本次改動 `common/i18n.js` 與 `common/version.js`，`pattern.html` 與 `index.html` 的 `?v=` 均已 bump 為 `20260804pat320`）；console 無錯誤；廠商名掃描 0 命中。

**黃金基線 204 組**：本版尚未完成改動前後比對，列為獨立的後續步驟。

---

## Pattern Generator 畫面產生器 (pattern) v3.1.1 — 2026-08-03 ｜ PATCH

**修正 v3.1.0 上線後在正式站顯示未翻譯 i18n key、版本徽章停在舊版號的問題；並把兩項成因寫成常設機械檢查。**

**判定依據：** `VERSIONING.md` **R1**（修 bug 算 PATCH）＋判定表「既有功能的輸出 → **修正為原本就該有的行為** → PATCH」。

- 三項改動都是修正本版自身的缺陷，沒有新增使用者能做的事，也沒有主動改變任何設計 → 不命中 MINOR 的「新增獨立功能」欄。
- 新增的 `tools/` 兩支檢查腳本是開發流程用的，不是產品功能，不影響級別判定。
- 本版不影響輸出圖片的像素，故不標 `⚠ 輸出變更`；但畫面上原本顯示成 key 的字串會變成正常文字。
- 結論：**PATCH → v3.1.1**。

### 成因：cache buster 連續三版沒有 bump

`pattern.html` 引用 `common/version.js` 與 `common/i18n.js` 的 `?v=` 停在 v2.16.0 那次的值，**v2.17.0、v3.0.0、v3.1.0 三版都沒有更新**。瀏覽器與正式站因此持續使用舊的 `i18n.js` 與 `version.js`：

- `common.js` 的 `t(key)` 查不到翻譯時會**回傳 key 本身**（`entry[lang] || entry['zh-TW'] || key`），這是靜默失敗 —— 畫面照常渲染、console 不會有任何訊息。使用者看到的就是 `pat.selLit` 這種字串。
- 版本徽章讀的是舊的 `version.js`，所以停在 v3.0.0。

本機測試不會重現：本機不走同一套快取，讀到的一律是最新檔案。

### 實際受影響的範圍比回報的更大

用新的掃描器在「舊 i18n.js」情境下重現，抓到 **8 個**露在畫面上的 key，不只是兩顆按鈕：

| key | 位置 |
|---|---|
| `pat.selLit` / `pat.selDark` | 兩顆整組選取按鈕的文字 |
| `pat.selLitTip` / `pat.noDarkTip` | 上述按鈕的 tooltip |
| `pat.applyLitGrp` | 選取列的作用對象提示 |
| `pat.grpNoDark` | 分組說明 |
| `pat.outShare` / `pat.outShareHint` | **v3.0.0 的分享按鈕與其說明** |

也就是 v3.0.0 的分享功能文字在正式站同樣是壞的。

### 修正

1. `pattern.html` 的 `common/version.js` 與 `common/i18n.js` 的 `?v=` bump 為 `20260803pat311`。`common.js` 這幾版沒有改動，維持原值。
2. **`index.html` 的 `common/version.js` 的 `?v=` 一併 bump**。首頁用 `data-tool-version="pattern"` 顯示 Pattern Generator 的版號，只改 `pattern.html` 並不會讓首頁的徽章更新 —— 這一項是檢查器加強後才被抓出來的，人工檢查原本會漏掉。
3. 新增 `tools/check_cache_buster.py`：比對 git 改動，若動了 `common/*.js` 而應該 bump 的頁面沒有 bump `?v=`，判定不通過。判定分兩級：本次一起改動的頁面、以及顯示了版號有變之工具的頁面屬「必須」；其餘引用同一支 common 檔的頁面屬「提醒」。對本次三個歷史 commit 實跑，全部正確判為不通過。
4. 新增 `tools/scan_untranslated_keys.js`：載入頁面後掃描**所有可見文字節點與使用者看得到的屬性**（`title` / `placeholder` / `aria-label` / `value` / `alt`），找出符合 i18n key 樣式的字串。判定一律讀畫面上實際渲染的文字，不讀 `i18n.js` 的內容。

### 驗證

| 項目 | 結果 |
|---|---|
| 掃描器對「舊 i18n.js」情境 | 抓到 8 個 key，三種語言皆不通過（證明它抓得到） |
| 掃描器對修正後 | **3 種語言 × 4 種畫面狀態 ＝ 12 種組合全部通過，0 命中** |
| 兩顆按鈕的實際 `textContent` | 選取亮組／選取暗組 |
| 版本徽章 | 與 `TOOL_VERSIONS.pattern` 相等 |
| `check_cache_buster.py` 對 v2.17.0／v3.0.0／v3.1.0 三個 commit | 全部正確判為不通過 |
| `check_cache_buster.py` 對本次改動 | 通過（加強後先抓出 `index.html` 未 bump，補上後才通過） |
| 端到端（強制取最新檔案後重跑注入）：`pattern.html` | 徽章與 `TOOL_VERSIONS.pattern` 相等；12 種組合 0 命中；兩顆按鈕與分享鈕文字正常 |
| 端到端：`index.html` | 首頁的 Pattern Generator 徽章與 `TOOL_VERSIONS.pattern` 相等；三語 0 命中 |

### 檢討：先前的 i18n 驗證為什麼漏掉這個

先前的驗證確實是讀 DOM 的 `textContent`（不是讀 `i18n.js`），做法本身沒錯，**錯在環境**：只在本機驗證，而本機不重現快取行為。缺的是「使用者實際面對的環境」這一層，以及專案早已明文要求的「改 common 檔就要 bump `?v=`」這個步驟根本沒被執行也沒被檢查。

對策不是「下次記得」，而是把兩件事變成每次都跑的機械檢查（即上述兩支腳本）：**提交前跑 cache buster 檢查、驗證時跑畫面 key 掃描**，任一不通過就不算完成。

### 連帶發現：檢查腳本自身的三個缺陷

寫檢查器的過程中，它自己出過三次錯，每一次都是先讓它跑「已知有問題的輸入」才發現的：

| # | 缺陷 | 後果 | 修法 |
|---|---|---|---|
| 1 | `--rev` 模式下把「工作區的現值」拿去比「該 commit 前一版的值」 | 唯一真正該被抓的頁面（工作區已修好）反而沒出現在清單裡，只列出無關頁面 | 兩邊都取自同一個檢查對象 |
| 2 | git 指令失敗時回空字串，被當成「沒有改動」 | 在 git 無法讀取該工作區的環境下印出「通過」——一支永遠說通過的檢查器比沒有還糟 | git 失敗一律大聲失敗，離開碼 2，明示「無法判定，不是通過」 |
| 3 | 只把「本次一起改動的頁面」列為必須 | 漏掉首頁：它顯示 Pattern Generator 的版號，但本次沒有改到它 | 解析 `version.js` 的差異找出版號有變的工具代號，凡顯示該代號的頁面一律列為必須 |

**檢查器本身也要被驗證會不會失效**：每支檢查在納入流程前，都要先餵一次已知有問題的輸入，確認它判不通過；只驗證「乾淨的輸入會通過」是不夠的。

### 驗證方式本身的一個陷阱

以同一個 `?v=` 值先後放入兩種內容，瀏覽器會沿用先前的快取 —— 本次驗證途中就因此讀到舊版號。正式站一次部署內容一致，不會發生。但這代表**在本機驗證 cache buster 的效果並不可靠**，可靠的判準是：伺服器上的檔案內容正確、且 HTML 引用的 `?v=` 值與上一版不同。端到端確認改用強制取最新檔案後重跑注入邏輯的方式進行。

---

## Pattern Generator 畫面產生器 (pattern) v3.1.0 — 2026-08-03 ｜ MINOR

**依 2026-08-03 裁示：灰階的作用對象改由「畫面載入當下的結構」決定（亮組／暗組），新增兩顆整組選取按鈕，並修正灰階控制項未與畫面同步的缺陷。**

**判定依據：** `VERSIONING.md` **R2**（一波重整以 MAJOR 開頭，波內的後續步驟依自身性質各自判定）＋判定表「功能增減 → **新增**獨立功能 → MINOR」。

- 本波重整自 **v2.0.0** 起算，波內後續不重複進 MAJOR。
- 本版**新增**「選取亮組」「選取暗組」兩顆按鈕：多了新能力，既有入口全部留在原位 → 命中判定表 MINOR 欄。
- 未選取時作用對象的行為變更**已於 v3.0.0 宣告**，本版只是把判定基準從當下值改為載入時的亮組，屬把已宣告的變更做對 → 不重複計 MAJOR。
- `-1` 直接歸零的修正屬 **R1**（修 bug 算 PATCH，輸出會變要標 ⚠）→ 級別低於 MINOR，被本版吸收。
- `±1`／`±16` 語意調整與作用對象變更同屬同一次裁示 → 不另計版號。
- 結論：**MINOR → v3.1.0**。

### 版號更正紀錄

本版原先編為 v4.0.0，不符 `docs/VERSIONING.md` 的 **R2（一波重整以 MAJOR 開頭，波內的後續步驟依自身性質各自判定）**，更正為 v3.1.0。

- 本波重整自 **v2.0.0** 起算，波內後續不應重複進 MAJOR。R2 條文本身即載明，否則會出現 v2.0.0 → v3.0.0 → v4.0.0 這種編號。
- **v3.0.0 的 MAJOR 進版同樣不符 R2**，依規則應為 v2.18.0。該版已上線，依既有原則歷史版號不回溯調整；後續本波一律留在 v3.x。
- 本版與 v3.0.0 是**同一項行為變更**（未選取時的作用對象）的兩個階段，第二階段是把判定基準從「當下值」改為「載入時的亮組」，屬修正而非新的破壞性變更，不重複計 MAJOR。
- 判為 MINOR 的依據：本版**新增**「選取亮組」「選取暗組」兩顆按鈕（多了新能力，舊的都在原位）→ MINOR；行為變更已於 v3.0.0 宣告過；`-1` 的修正屬 PATCH 級，被 MINOR 吸收。

### ⚠ 操作變更（三項）

| 項目 | v3.0.0 | v4.0.0（本版） |
|---|---|---|
| 未選取時的作用對象 | 目前值非 0 的格子（隨值變動） | **載入畫面時就非 0 的格子（亮組，身分固定）** |
| `±1`／`±16` 的語意 | 以數字框的值為基準加減，再設給所有目標格 | **對每個目標格各自加減** |
| 拉霸與數字框 | 只在部分路徑同步 | **選定畫面後一律同步到該畫面的代表灰階值** |

### 亮組／暗組

畫面載入時把 48 格分成兩組並記住歸屬：載入時非 0 的是**亮組**，為 0 的是**暗組**。

🔴 **組員身分固定，不隨值改變。** 把暗組整批調到 64 之後它仍然是暗組。若改用當下值判斷，調過一次就再也分不出兩組，把暗的部分整批調到指定值這件事只能做一次。

- 沒有選取 → 作用於亮組。
- 有選取 → 只作用於選取的格子（既有行為未變）。
- 新增「選取亮組」「選取暗組」兩顆按鈕，一鍵選滿整組，之後走既有的選取邏輯。
- 手動塗改個別格子**不改變**組員身分；要動它就選它，或用整組按鈕。
- 切換畫面時依載入值重新分組。

因為集合不是從當下值算出來的，v3.0.0 需要特別處理的兩個死角（全部調成 0 之後動不了、長按遞減時集合縮小）在這個模型下不存在。

**兩種邊界情況**（都不會變成「按了沒反應又沒提示」）：

| 情況 | 分組 | 處理 |
|---|---|---|
| 純灰階畫面（48 格載入時皆非 0） | 亮組 48／暗組 0 | 「選取暗組」停用並在下方說明原因 |
| 4×4 編輯區不適用的畫面（48 格皆 0） | 亮組 0／暗組 48 | 「選取亮組」停用；未選取時的灰階操作作用於全部 48 格，提示文字寫明 |

### `±1`／`±16` 改為各自加減

舊語意在亮組／暗組分別調整時會壞掉：亮組是 192、剛把暗組設成 64，再按 `+16` 會依基準 64 把亮組一路打到 80。改成對每個目標格各自加減後，同樣操作得到亮組 208、暗組維持 64。`L0`~`L255` 快捷與拉霸維持「設定絕對值」，兩者分工明確。

此項與本版的作用對象變更同屬 2026-08-03 的同一次裁示（驗收條件明訂該情境的預期結果為 208），不另計版號。

### 灰階控制項同步（修正 `-1` 直接跳到 0 的缺陷）

代表灰階值取所有非 0 格的眾數（平手取較大）；48 格全 0 的畫面改取該畫面自己的灰階參數。盤點 34 個畫面的編輯格分布作為取法依據：

| 類型 | 數量 |
|---|---|
| 4×4 編輯區不適用（48 格皆 0） | 21 |
| 純灰階（48 格同一非 0 值） | 1 |
| 單一亮度 + L0 | 12 |
| 多亮度混合 | **0** |

沒有多亮度混合，取法不會有歧義；眾數只是為了涵蓋「使用者手動改過幾格」之後仍有明確定義。同步時機補上先前遺漏的兩條路徑（頁面初始化、起始樣式捷徑）。

### ⚠ 輸出變更：載入時不再依賴視窗尺寸

追查上述缺陷時實測到一個更底層的問題：頁面剛載入、版面還沒完成時 `pgTargetSize()` 會退化成 1×1（全畫面元素此時量到 0），週期偵測必然失敗，48 格就停在全 0。也就是開啟工具第一眼是不是白畫面，取決於載入當下量不量得到版面 —— 實測在視窗視口為 0 的情況下，開啟後編輯區確實是全 0 而非白畫面。

修法：所有「從繪圖引擎取編輯格值」的路徑統一走 `pgWithProbeSize()`，量不到版面時改用固定探測尺寸。值仍然取自繪圖引擎，只是不再依賴當下的視窗大小。修正後在視口為 0 的環境下，載入仍得到 48 格全 255。

### 驗證（值一律從 48 格的 DOM 讀回）

| # | 情境 | 結果 |
|---|---|---|
| 1 | `Skip SubPixel` 載入 | 亮組 24／暗組 24，畫面上 24 格帶標記 |
| 2 | 未選取按 `L192` | 亮組 24 格 192、暗組 24 格仍 0 |
| 3 | 「選取暗組」後按 `L64` | 暗組 24 格 64、亮組維持 192 |
| 4 | 接續取消選取後按 `+16` | **亮組 208、暗組仍 64、組員身分未變** |
| 5 | 手動把暗組某格塗成 255 | 該格仍屬暗組；按「選取亮組」時選到 24 格且不含它 |
| 6 | 純灰階按 `L0` 再按 `+16` | 48 格全部變 16（亮組＝全部，身分未變） |
| 7 | 編輯區不適用的畫面按 `L128` | 48 格全部 128，提示文字說明作用於全部 |
| 8 | 剛載入按 `-1` | 編輯格／數字框／拉霸三者皆 **254** |

三語（繁中／English／简中）× 四種狀態的提示、按鈕、tooltip、說明全部核對。

**黃金基線 204 組**：改動前後在同一瀏覽器同一視窗狀態各跑一次，不符清單 **28 筆逐字完全相同**（既有狀況，集中在含文字或內框的五個畫面）。console 無錯誤。

### 未完成的驗證

視覺外觀（亮組標記在實機上是否清楚、四顆按鈕在手機寬度下的排版）**沒有截圖驗證**：本次執行環境的瀏覽器視窗視口為 0×0，截不到有意義的畫面。這一項需要人工確認。

---

## Pattern Generator 畫面產生器 (pattern) v3.0.0 — 2026-08-03 ｜ MAJOR

**判定依據：** `VERSIONING.md` **R2** ＋判定表「新增獨立功能 → MINOR」。新增分享功能屬新增能力；未選取時作用對象的變更屬既有輸出主動改變。

🔴 **當時判定不符 R2**：本波重整自 v2.0.0 起算，波內不應重複進 MAJOR，依規則應為 **v2.18.0**。該版已上線，依 2026-08-02 已定的處置不回溯調整版號，後續本波一律留在 v3.x。

**未選取時，灰階控制改為只作用於「亮點」（目前值非 0 的 sub-pixel），L0 完全不動；另外新增「分享圖片給其他 App」。**

### ⚠ 操作變更 — v2.17.0 才剛建立的行為，這一版又改了

| 未選取任何格子時，按 `L0`~`L255` 或 `±1`/`±16` | v2.16.0 以前 | v2.17.0 | **v3.0.0（本版）** |
|---|---|---|---|
| 作用對象 | 沒有反應 | 全部 48 格 | **只有目前非 0 的亮點** |

使用情境是 `Skip SubPixel` 這類「一半亮一半暗」的畫面：要調的是亮點的灰階，暗的部分本來就該留著。**有選取時的行為從頭到尾沒變過** —— 刻意選了哪幾格就作用在哪幾格，包含刻意選了 L0 的格子。

進 MAJOR 的理由：依 `docs/VERSIONING.md` 的判定表，「既有功能的輸出**主動改變**（設計上決定不一樣）」屬 MAJOR。v2.17.0 已經上線使用過，同樣的操作在新版會得到不同結果，使用者需要重新確認。這不是把壞的修好（那是 PATCH），是設計換了。

### 兩個死角：一個實測成立，一個實測不成立

先做了一版**不含任何防護**的「只作用於非 0」，把死角真的跑出來再決定怎麼處理。

**死角 1（成立，已處理）** — 48 格全為 0 時，作用集合是空集合：

| 操作 | targets 長度 | 48 格結果 |
|---|---|---|
| 按 `L0` 讓全部歸零 | **0** | 全 0 |
| 再按 `L128` | 0 | 全 0（**沒反應**） |
| 再按 `+16` | 0 | 全 0（**沒反應**） |
| 再按 `+1` | 0 | 全 0（**沒反應**） |

確認是永久死路。處理方式依 2026-08-02 裁示：**全部為 0 時作用於全部 48 格**。所以按 `L0` 把亮點全歸零是預期行為，歸零後仍隨時可以再亮起來。

**死角 2（實測不成立）** — 預期是「長按 `-16` 時先歸零的格子被踢出集合，其餘繼續減」。實際跑出來不會發生，原因是 `±16` 的語意跟直覺不同：

> `±16` 走的是 `pgSetLevelUI(pgLevelCur() + d)` → `pgApplyLevel(v)`，也就是**以數字框的值為基準加減，再把結果設給所有目標格**，不是「每格各自加減」。

所以目標格永遠被設成同一個值、永遠同時歸零，不會出現「一部分先掉出集合」。實測：起始 12 格 `32` + 18 格 `127`，長按 `-16` 第一步之後 30 格**全部**變成 `16`（不是 `16` 和 `111`）。

**仍然採用了鎖定機制**，因為「按下的當下決定作用對象」本身值得成為不變式：不鎖的話，長按撞底歸零瞬間集合會從「亮點」翻成「全部」（fallback 觸發），同一次按住的前後段語意不一致。實測鎖定有效：

| 長按 `-16` | targets | 48 格 |
|---|---|---|
| 按下前 | 30 | 12×32 + 18×127 + 18×0 |
| 第 1 步 | **30** | 30×16 + 18×0 |
| 第 2 步（撞底） | **30**（仍鎖著，沒翻成 48） | 全 0 |
| 之後 | 48 | 全 0（`stepOnce` 偵測無變化已自動停手並解鎖） |

### 提示文字：三種狀態，格數是算出來的

| 狀態 | 繁體中文 | 顏色 |
|---|---|---|
| 未選取、有亮點 | （未選取 → 只套用到 **24** 個亮點，L0 不動） | 綠 |
| 未選取、全部 L0 | （全部為 L0 → 將套用至全部 **48** 個） | 琥珀 |
| 有選取 | （只套用到選取的 **12** 個） | 灰 |

三語都有；格數來自 `pgLevelTargetsCompute()` 的實際結果，不是寫死。

### 新功能：分享圖片給其他 App

**判準不看 UA 字串。** UA 是列舉式判準（要窮舉所有行動瀏覽器），必漏，而且可被改寫。改成直接拿一個真的 `File` 去問瀏覽器：

```js
navigator.canShare({ files: [new File([new Uint8Array(1)], 'probe.png', { type: 'image/png' })] })
```

查證到的規格事實（依據 MDN 與 W3C Web Share 規格）：

| 項目 | 查到的內容 |
|---|---|
| 安全脈絡 | `[SecureContext]`，必須 HTTPS（`localhost` 為既有例外） |
| 使用者手勢 | `share()` 必須有 transient activation 且會消耗掉它；**`canShare()` 不需要**，所以偵測可隨時做 |
| 檔案型別 | MDN 可分享清單同時列有 `.png → image/png` 與 `.bmp → image/bmp` |
| 檔案大小上限 | **規格沒有規定固定數字**。W3C 只說 UA 可因「內容、**大小**或其他特徵」判定為 hostile share 而拒絕，屬實作定義。查不到官方數字，所以不寫死任何門檻，改為呼叫前用 `canShare({files})` 對**實際那個檔案**再問一次 |
| 支援度 | MDN 標示 Limited availability / not Baseline |
| 併發 | 同時只能有一個分享進行中，否則 `InvalidStateError`（已加 `pgSharing` 旗標防連點） |

**實測意外**：這台 macOS 桌面 Chrome 的 `canShare({files})` 對 PNG 與 BMP **都回 true**。如果照「偵測行動裝置」去寫，桌面反而用不到這個其實可用的功能。所以分享鈕的顯示條件就是「分不分得出去」，與是不是手機無關。**下載鈕位置與行為完全沒動**，分享是多出來的第二顆按鈕。

### 🔴 分享出去的位元組與下載的完全相同

不是「編兩次剛好一樣」，而是**結構上就只有一條產生路徑**：`pgOutBuild()` 產生唯一一顆 blob，`pgOutSave()` 拿它去下載、`pgOutShare()` 拿**同一顆**包成 `File`。分享路徑沒有任何重新編碼或縮放。

實測（2880×1800）：

| 格式 | MIME | 下載用 blob | 分享用 File | 位元組差異 | 分享 File 解碼回比對 |
|---|---|---|---|---|---|
| PNG | `image/png` | 81,712 B | 81,712 B | **0** | 5,184,000 px，差異 **0** |
| BMP | `image/bmp` | 15,552,054 B | 15,552,054 B | **0** | 5,184,000 px，差異 **0** |

15.5 MB 的 BMP 在這台機器上 `canShare` 仍回 true。

### 五條路徑都實測過（驗證期間攔截 anchor click，沒有觸發任何真實下載）

| 情境 | 分享鈕 | 結果 | 有沒有下載 |
|---|---|---|---|
| `canShare` 不存在 | **隱藏** | 顯示「不支援分享，改為下載」 | ✅ 有（退回下載，並照常驗證） |
| 型別可以但這個檔被系統拒絕 | 顯示 | 顯示「無法分享（可能與大小或型別有關），已改為下載」 | ✅ 有 |
| 使用者取消（`AbortError`） | 顯示 | 顯示「已取消分享…檔案沒有下載」 | ❌ **沒有** |
| 其他錯誤（`DataError`） | 顯示 | 顯示「分享失敗（DataError），已改為下載」 | ✅ 有 |
| 分享成功 | 顯示 | 顯示「已交給系統分享面板」 | ❌ 沒有 |

`AbortError` 刻意不退回下載：規格明講「使用者取消」與「沒有任何分享目標」共用同一個錯誤碼且不可區分，使用者取消後仍強制下載並不合理。

### 這一輪我自己犯的錯

1. **測死角 2 時挑了測不出問題的條件**：把所有亮點設成同一個值 64，它們必然同時歸零，永遠測不出「集合中途縮小」。改用值不一致的亮點（12 格 32 + 18 格 127）重測，才得到有效結論。
2. **又用 `.click()` 去測 pointer 綁定**：上一版才記錄過的同一個錯，這次用在編輯格選取上，導致「有選取」的驗收實際跑成「未選取」。改派真實 `PointerEvent` 後才對。
3. **改檔腳本 assert 失敗導致整批改動丟失**：一個 anchor 沒對上就拋例外，寫檔那行永遠不會執行，但同一批的前幾個改動也一起沒了；接著第二支腳本又把指向不存在函式的 `window.xxx = xxx` 寫進去，載入直接爆掉。改成**先把所有 anchor 驗過一遍，全過才開始替換**。
4. **退回路徑的第一版測試有競態**：大圖編碼較慢，上一個情境的下載記錄落到下一個情境的觀察視窗，結果不可信。改成每個情境用不同檔名（`c1_…`~`c5_…`）指認來源、且一次只跑一個情境。

---

## Pattern Generator 畫面產生器 (pattern) v2.17.0 — 2026-08-02 ｜ MINOR

**判定依據：** `VERSIONING.md` **R2** ＋判定表「新增獨立功能 → MINOR」。未選取時原本按了沒有反應，本版讓那個狀態有了作用對象，是先前不存在的能力；有選取時的行為未變、入口未移位。

**沒有選取任何格子時，灰階那組控制項改為作用於全部 48 個 sub-pixel；並在畫面上寫明當下會作用在哪。**

### ⚠ 操作變更

未選取狀態下按 `L0`～`L255` 或 `±1` / `±16`，**過去是完全沒有反應**，現在會一次套用到全部 48 格。若過去習慣「沒選取時亂按是安全的」，這個前提不再成立。**有選取時的行為一字未變。**

### 先實測格子總數，不照抄先前寫的數字

前一輪回報時我寫成「全部 12 格」，那是**一列**的 sub-pixel 數（4 px × R/G/B），不是全部。實際在瀏覽器量到的是：

| 量測項目 | 結果 |
|---|---|
| `pgLevels` 列數 × 每列 px 數 × 每 px 通道數 | 4 × 4 × 3 |
| `pgLevels` 值總數 | **48** |
| `.pg-cell` DOM 元素數 | **48** |
| 按「全選」後計數器顯示 | **48** |

四個獨立來源都是 48，所以「全部」＝ 48。

### 作法：單一作用對象函式

不去動 v2.16.0 剛統一好的入口（`pgSetLevelUI`），只在更下游多一層「這次要作用在哪些格子」的判斷：

```js
function pgLevelTargets(){
  var keys = Object.keys(pgSel);
  if (keys.length) return keys;          // 有選取 → 維持原樣
  var all = [];                          // 沒選取 → 全部 48 格
  for (var r = 0; r < NROW; r++) for (var p = 0; p < NPX; p++) for (var c = 0; c < 3; c++)
    all.push(key(r, p, c));
  return all;
}
```

`pgApplyLevel` 與 `pgNudge` 都改用它，作用對象仍然只有一份定義。長按連續增減不必另外處理 —— 它每一步都走 `pgSetLevelUI`，自動跟著生效。

### 畫面上寫明會作用在哪

「已選取 N 個 sub-pixel」後面接一段提示，三語都有：

| 狀態 | 繁體中文 | English |
|---|---|---|
| 未選取 | （未選取 → 將套用至全部 48 個） | (none selected → applies to all 48) |
| 有選取 | （只套用到選取的） | (applies to the selected ones only) |

未選取時用琥珀色，因為那是「影響範圍比較大」的狀態，值得被看見。格數是從 `NROW × NPX × 3` 算出來的，不是寫死 48。

### 驗證

瀏覽器實測，值一律從 48 個格子的 DOM 文字讀回來（不是讀我自己寫的變數）：

| 情境 | 結果 |
|---|---|
| 未選取按 `L128` | 48 格全為 128 |
| 未選取按 `+16` → `−1` → `−16` → `+1` | 144 → 143 → 127 → 128，48 格始終一致 |
| 未選取長按 `+1` 一秒 | 128 → 138，48 格一致 |
| 選整列（12 格）按 `L192` | 只有那 12 格變 192，其餘 36 格不動 |
| 選整列長按 `+16` | 只有那 12 格前進，選取外仍為 64 |
| 全 0 再 `−1` / `−16` | 48 格全為 0（夾住） |
| 全 255 再 `+1` / `+16` | 48 格全為 255（夾住） |
| 提示文字 | 繁中／English／简中 × 未選取／有選取 共 6 種全部正確 |

**黃金基線 204 組**：改動前後跑同一支腳本，不符清單 **28 筆逐字完全相同**（集中在 `crosstalk` / `aligncenter` / `character` / `lum_compare` / `lum_divide` 五個含文字或內框的畫面，這些在 v2.16.0 就已與 v1.9.0 基線不符，是既有狀況不是本次造成）。因此本次改動對繪圖輸出的影響為 **0**。

### 驗證過程中我自己犯的三個錯

1. **雜湊算法寫錯**：第一次跑基線 204 組**全部**不符。全錯是驗證腳本壞掉的訊號，不是回歸的訊號。實測四種 FNV-1a 變體，基線用的是逐 32-bit 像素值運算，我寫成拆 4 個 byte。改對之後 176 組立刻相符。
2. **用 `.click()` 測 pointer 綁定**：`±1`/`±16` 綁的是 `pointerdown`，格子選取綁的也是 pointer 事件，用 `.click()` 全都不會觸發 —— 我差點把這報成「按鈕沒作用」。改派真實 `PointerEvent` 後才是有效驗證。
3. **狀態污染**：`crosstalk` 有一組不符是我先前的 UI 操作留下的殘留狀態造成，重新載入乾淨頁面後與改動前完全相同。

（另外查到 `pgNudge` 其實是死碼，全檔沒有任何呼叫處；`±1`/`±16` 走的是 `pgSetLevelUI` → `pgApplyLevel`。仍一併改成新的作用對象，避免日後被接回來時行為分岔。）

---

## Pattern Generator 畫面產生器 (pattern) v2.16.0 — 2026-08-02 ｜ MINOR

**判定依據：** `VERSIONING.md` **R2** ＋判定表「新增獨立功能 → MINOR」。長按連續增減是新增能力；四個入口統一成一份邏輯本身屬內部整併（PATCH 級），被 MINOR 吸收。

**灰階控制的四個入口統一成一份邏輯；`±16` / `±1` 按住可以連續增減。**

### 先查了現況，問題只在 ± 那四顆

回報說「按鈕應該要與拉霸一起連動」。實測後發現**不是全部按鈕**：

| 操作 | 拉霸 | 數字框 | 畫面 |
|---|---|---|---|
| 按 `L128` | ✅ 128 | ✅ 128 | ✅ 128 |
| **按 `+16`** | ❌ 停在 128 | ❌ 停在 128 | ✅ 144 |
| **按 `-1`** | ❌ 停在 128 | ❌ 停在 128 | ✅ 143 |
| 拖拉霸 | ✅ | ✅ | ✅ |

`L0`～`L255` 那排**本來就是連動的**，只有 `±16` / `±1` 沒有：它們走的是另一條路徑，只改內部的灰階資料、完全不碰兩個輸入框。畫面會變、但拉霸與數字框停在舊值。

這正是「四份各自更新的程式碼必然不同步」。

### 改成單一入口

拉霸、數字框、`L` 快捷鍵、`±` 按鈕，四者現在都經過同一個函式，其餘三者與畫面一起更新。

### 長按連續增減

`±16` / `±1` 按住不放會連續作用。**兩者速率不同**：

| 按鈕 | 初次延遲 | 間隔 | 實測速率 |
|---|---|---|---|
| `±1` | 400 ms | 60 ms | 約 **13 階/秒**（2 秒走 27 階） |
| `±16` | 400 ms | 128 ms | 約 **6 次/秒 × 16**（2 秒走 208 階） |

`±16` 只要 16 次就能從 0 衝到 255，若用鍵盤那種 30 次/秒會在半秒內撞底、完全無法控制；`±1` 要 255 次才走完全程，可以快一些。間隔由步進大小自動決定（`8 × |步進|`，夾在 60～150 ms）。初次延遲 400 ms 比作業系統的 500 ms 略短，因為這是刻意的長按動作。

**放開就停、滑出按鈕範圍也停、切走視窗也停**；到 0 或 255 會夾住並自動停手，不會溢出或回捲。長按時按鈕本身有視覺回饋。

用 pointer 事件實作，**滑鼠與觸控都適用**（遠端桌面操作走的也是這條）。

### 驗證

**單擊連動**（三者必須一致）：

| 操作 | 拉霸 / 數字框 / 畫面 |
|---|---|
| L0 / L32 / L64 / L128 / L192 / L255 | 0/0/0、32/32/32、64/64/64、128/128/128、192/192/192、255/255/255 ✅ 全部一致 |
| `+1` → `-1` → `+16` → `-16`（自 128） | 129/129/129 → 128/128/128 → 144/144/144 → 128/128/128 ✅ 全部一致 |
| 拖拉霸到 77 | 77/77/77 ✅ |

**長按**：

| 檢查項 | 結果 |
|---|---|
| 長按 `+1` 2011 ms | 0 → 27，約 13 階/秒 |
| 長按 `+16` 2012 ms | 0 → 208，約 6 次/秒 × 16 |
| 從 250 長按 `+16` | 停在 **255** ✅ 不溢出 |
| 從 5 長按 `-16` | 停在 **0** ✅ 不回捲 |
| 放開後 1 秒 | 值不再變動 ✅ |
| 滑出按鈕範圍後 1 秒 | 值不再變動 ✅ |

黃金基線 204 組：雜湊不符 **0**、尺寸不符 **0**。Console 無錯誤。

> 這組控制項只存在於主頁，全畫面側邊面板沒有（v2.1.0 已移除該處的樣式捷徑），所以只有一處要改。

---

## Pattern Generator 畫面產生器 (pattern) v2.15.0 — 2026-08-02 ｜ MINOR

**判定依據：** `VERSIONING.md` **R2** ＋判定表「新增獨立功能 → MINOR」。方向鍵移動準星是先前只能用滑鼠做的事，多了一種操作方式。

**放大鏡模式下，方向鍵可以一次移動一個 pixel，不必只靠滑鼠。**

- **↑↓←→**：準星移動 **1 px**
- **Shift + ↑↓←→**：移動 **10 px**
- 連續按住可持續移動（節流上限 40 ms，避免在高重複率的系統上失控）

### 方向鍵是模式切換，不是組合鍵

方向鍵在原本的畫面操作裡幾乎到處都有作用 —— 實測 9 個鍵盤群組裡有 **7 個**會用到：切變體、調灰階、改 Checker 格數、改 LUMINACE 起始值與欄數、移動 Cross Talk 內框，以及 XY Coordinate 自己的準星。

處理方式是**模式切換**：

- **放大鏡開啟時**：方向鍵**只**移動準星，畫面原本的方向鍵功能**整個暫停**
- **放大鏡關閉後**：原封不動回到舊功能

不把舊功能搬到 `Alt` 之類的組合鍵上 —— 那會多出一個沒人會記得的隱藏鍵位。

**沒有衝突的鍵維持有效**：數字鍵 1–8（換色）、Space（反相）、Home／End（灰階極值）在放大鏡開啟時照樣直接按。

這也順帶解決了 XY Coordinate 的雙準星問題：放大鏡開著時方向鍵給放大鏡準星，**不會連帶移動到輸出畫面上的 XY 準星**（那會改變輸出內容）。

### 邊界：夾在畫面內

準星不允許超出來源畫面（`0 ~ 寬-1` / `0 ~ 高-1`）。與 XY Coordinate 允許超出 10 px 的處理不同 —— XY 的準星是**畫在輸出畫面上的十字線**，超出邊界在原程式裡有其意義；放大鏡的準星是**檢視工具**，超出去只會看到一片黑，沒有資訊價值。

### 驗證

**四方向各按一次**（起點 300,180，畫面 640×360，紅色垂直線）：

| 鍵 | 座標變化 | 讀值變化 |
|---|---|---|
| → | 300,180 → 301,180（Δ1,0） | 255/0/0 → 0/0/0 ✅ 與理論值相符 |
| ↓ | 301,180 → 301,181（Δ0,1） | 0/0/0 → 0/0/0 ✅ |
| ← | 301,181 → 300,181（Δ-1,0） | 0/0/0 → 255/0/0 ✅ |
| ↑ | 300,181 → 300,180（Δ0,-1） | 255/0/0 → 255/0/0 ✅ |

| 檢查項 | 結果 |
|---|---|
| 連按 → 10 次 | 300,180 → 310,180，**Δx 正好 10，沒漏沒跳** |
| Shift+↓ 一次 | Δy = **10** |
| 推到左上角 | 停在 **0,0** ✅ 夾住不超出 |
| 推到右下角 | 停在 **639,359** ✅ |

**放大鏡開啟中，六個群組按方向鍵後 pattern 狀態完全不動：**

| 群組 | 代表畫面 | 狀態值 |
|---|---|---|
| bands | Horizontal 64 | `id=horiz64` → `horiz64` ✅ |
| level | Gray Level | `level=127` → `127` ✅ |
| checker | Checker | `ckIdx=2` → `2` ✅ |
| **xy** | XY Coordinate | `xyFx=0.5` → `0.5` ✅ **XY 自己的準星沒被連帶移動** |
| compare | LUMINACE COMPARE | `lumStart=248` → `248` ✅ |
| divide | LUMINACE DIVIDE | `lumN=6` → `6` ✅ |

**關閉放大鏡後，同樣六個群組的方向鍵全部復原：**
`horiz64 → horiz256`（切變體）、`level 127 → 128`、`ckIdx 2 → 3`、`xyFx 0.5 → 0.5016`、`lumStart 248 → 249`、`lumN 6 → 7`。

**無衝突的鍵在放大鏡開啟中仍有效**：數字鍵 2 → `colorIdx 3 → 1`、Home → `level 127 → 255`。

**滑鼠與鍵盤不互相干擾**：滑鼠定位 (200,150) → 鍵盤 →×5 → 205,150 → 再動滑鼠到 (450,280) → **正確接管，沒跳回也沒卡住** → 接著按 ↓ → 450,281（以新位置為基準）。準星在螢幕上的位置也跟著鍵盤走（來源移動 10 px，準星位移 10 px）。

黃金基線 204 組：雜湊不符 **0**、尺寸不符 **0**。Console 無錯誤。

---

## Pattern Generator 畫面產生器 (pattern) v2.14.0 — 2026-08-02 ｜ MINOR

**判定依據：** `VERSIONING.md` **R2** ＋判定表「新增獨立功能 → MINOR」。black matrix 模擬是放大鏡新增的呈現方式，既有的放大鏡操作全部不變。

**放大鏡改成模擬實際面板的 black matrix：每個 sub-pixel 都是獨立小方塊，四周留黑。**

### 原本的問題

紅色的垂直線在放大鏡裡被畫成**一條上下連通的紅柱**，看不出 pixel 與 pixel 的分界，也看不出同一個 pixel 內 R／G／B 各自的界線。那不是面板實際的樣子。

### 現在的畫法

每個 sub-pixel 都是一個獨立的方塊，四周留黑：

- **pixel 與 pixel 之間**（上下、左右）有黑色分界 → 紅色垂直線現在看起來是**一顆一顆的紅方塊由上而下排列**
- **同一個 pixel 內 R／G／B 之間**也有黑色分界，不會緊連在一起

分界一律**純黑**，因為實際 LCD 面板的 sub-pixel 交界（black matrix）不透光 —— 這是物理事實，所以不做成灰色或半透明。

### 兩級黑邊

第一版試過整體用同一個寬度，截圖後發現**上下分界細到看不清楚** —— 因為 sub-pixel 是細長的（例如 24×72），同樣的絕對寬度在高度方向的視覺比例小很多。

改成兩級，也比較接近實際面板（pixel 之間要走 gate／data line，那道 black matrix 本來就比 pixel 內部的間隔寬）：

| 取樣範圍 | 格寬 | pixel 間黑邊 | sub-pixel 間黑邊 | sub-pixel 寬 |
|---|---|---|---|---|
| 3×3 | 120.0 | 12.00 | 4.80 | 32.8 |
| 5×5 | 72.0 | 7.20 | 2.88 | 19.7 |
| 9×9 | 40.0 | 4.00 | 1.60 | 10.9 |
| 13×13 | 27.7 | **2.77** | **1.11** | 7.6 |

比例取 pixel 格寬的 10%、sub-pixel 寬的 12%，並保證**至少 1 個裝置像素**，最小的 13×13 也不會消失。

放大鏡畫布同時改成用裝置像素的解析度繪製（先前是 CSS 像素），高 dPR 螢幕上黑邊才不會被放大成糊的一片。

### 🔴 這只是顯示上的模擬

**放大鏡讀到並顯示的 R／G／B 數值仍是該像素的真實值，存圖輸出更不受影響。** 黑邊只存在於放大鏡的畫面上。

### 取樣範圍改為 3×3 / 5×5 / 9×9 / 13×13

新增 3×3 與 13×13，移除 17×17（範圍太大沒有必要）。全部維持奇數，預設仍是 9×9。

**格內數值顯示改成依實際格寬自動判定**，不再寫死範圍：3 位數大約需要字級 ×1.8 的寬度，字級最小 9 px 才讀得出來，臨界約 18 px。實測結果是 3×3（32.8）與 5×5（19.7）顯示、9×9（10.9）與 13×13（7.6）不顯示，由框下方的資訊列負責。

### 驗證

| 檢查項 | 結果 |
|---|---|
| **讀值不受影響** | 5 個座標改版前後完全相同：`(100,100)=255/0/0`、`(101,100)=0/0/0`、`(150,200)=255/0/0`、`(233,177)=0/0/0`、`(400,300)=255/0/0` |
| **存圖不受影響** | 1280×720 輸出雜湊改版前 `0b82fdc5` → 改版後 `0b82fdc5`，**完全相同** |
| 紅色垂直線截圖 | pixel 上下分界清楚可見，不再是連通的柱子；R/G/B 之間也有黑色分界 |
| `Skip SubPixel` 截圖（3×3） | R/G/B 各自獨立、四周留黑，sub-pixel 棋盤排列一目了然 |
| 黑邊在最小格子（13×13） | pixel 間 2.77 px、sub-pixel 間 1.11 px，皆 ≥ 1 個裝置像素 |
| 數值顯示 | 3×3 與 5×5 顯示、9×9 與 13×13 不顯示（依格寬自動判定） |
| 黃金基線 204 組 | 雜湊不符 **0**、尺寸不符 **0** |
| Console | 無錯誤 |

---

## Pattern Generator 畫面產生器 (pattern) v2.13.0 — 2026-08-02 ｜ MINOR

**判定依據：** `VERSIONING.md` **R2** ＋判定表「新增獨立功能 → MINOR」。工具列可拖曳與邊緣吸附是新增能力；吸附後的直向排版是該能力的一部分，不另計。

**放大鏡工具列可以拖著走，放開後自動吸到最近的一邊；吸左右時排版換成直向。**

### 拖曳

整條工具列都可以抓（游標顯示為移動狀態，左側有抓把手），但**點按鈕就是按按鈕**，不會變成拖曳。

拖曳期間**放大鏡的取樣座標定住不動** —— 不然滑鼠一移，放大鏡內容就跟著亂跳，等於邊拖邊失去你正在看的那個位置。滑鼠停在工具列上時同樣不取樣，那裡本來就不是要看 pattern 的區域。

### 吸附四邊

放開時吸到最近的一邊。判準用**相對距離**（距離 ÷ 該方向的半長）而不是絕對距離 —— 畫面通常寬遠大於高，用絕對距離會一面倒地吸到上下；除以半長之後，工具列在畫面正中時四邊等距，往哪邊靠就吸哪邊。

沿邊的位置會保留（吸上邊時左右位置不變，吸左邊時上下位置不變），不會每次都彈回正中央。

**不提供「自由位置」**：四個邊已經夠用，多一個不吸附的狀態只會讓落點變得不確定；而且吸邊之後一定不會擋到畫面中央的 pattern。

### 吸左／右時重新排版，不是把橫的轉 90 度

| 吸附邊 | 排列 | 尺寸（實測） |
|---|---|---|
| 上 / 下 | 橫向 | 1039 × 52 |
| **左 / 右** | **直向** | **92 × 196** |

直向時：抓把手與標題置中、三個取樣範圍按鈕改成整寬直排、關閉鈕整寬，**那行操作提示自動收起**（直向排不下，寧可不顯示也不要溢出）。寬度只有 92 px，不會佔掉畫面寬度。

### 位置會記住

同一次使用中關掉再開，回到上次那一邊；**也存進瀏覽器本機，重新整理頁面後仍在同一邊**。反覆量測時不必每次重拖。

### 工具列與放大鏡框重疊時，框讓開

工具列的位置是使用者自己拖的，那是他的選擇；放大鏡框本來就會自動翻邊，多一個避讓對象即可。

### 驗證

**四邊吸附**（視窗 1920×902）：

| 拖到 | 放開座標 | 吸附結果 | 最終位置 | 尺寸 |
|---|---|---|---|---|
| 上方 | (810, 40) | `top` | (810, 8) | 1039×52 |
| 下方 | (810, 782) | `bottom` | (810, 842) | 1039×52 |
| 左方 | (30, 351) | `left` | (8, 292) | **92×196** |
| 右方 | (1780, 351) | `right` | (1820, 351) | **92×196** |

| 其他 | 結果 |
|---|---|
| 拖曳中取樣座標 | 拖前 (900,400) → 拖曳中 **(900,400)** → 放開後 (1500,700) ✅ 拖曳期間定住 |
| 滑鼠停在工具列上 | 不取樣，維持原座標 ✅ |
| 工具列與放大鏡框重疊 | 工具列 (8,300–100,496)、框 (174,374–538,764) ✅ 框已讓開 |
| 關閉再開啟 | `left` → `left`，位置 (8,300) 尺寸 92×196 ✅ 保留 |
| 本機儲存內容 | `{"edge":"left","offset":0.4249…}` ✅ |
| **關閉放大鏡後全螢幕畫面** | 仍只有原程式資訊框會畫 ✅ v2.12.0 的原則未被破壞 |
| 黃金基線 204 組 | 雜湊不符 **0**、尺寸不符 **0** |
| Console | 無錯誤 |

---

## Pattern Generator 畫面產生器 (pattern) v2.12.0 — 2026-08-02 ｜ MINOR

**判定依據：** `VERSIONING.md` **R2**（波內移除既有入口，算在開頭那個 MAJOR 的宣告範圍內，不再另計）→ 不進 MAJOR。

🔴 **當時判定與判定表不一致**：本版是**移除**全螢幕與 1:1 檢視的角落圖示入口，沒有新增使用者能做的事，依判定表應為 **PATCH（v2.11.1）**。已上線故不回溯調整。

**全螢幕畫面上不再有任何常駐疊加物：右上角的放大鏡圖示拿掉了。**

### 為什麼拿掉

全螢幕是拿來看 pattern 的，**任何常駐的疊加物都會破壞畫面**。上一版為了「入口要多」在四個顯示區都放了角落圖示，但那條便利性在全螢幕下必須讓路。

- **全螢幕**與**全畫面 1:1 檢視**的角落圖示：**移除**
- **主頁預覽**與**輸出預覽**的角落圖示：**保留**（那兩處不是全螢幕，圖示不影響觀察）

全螢幕的入口只留**右鍵選單**。

### 選單項目會跟著狀態換文字

全螢幕沒有角落圖示之後，選單與 Esc 是僅有的兩條退出路徑，所以選單文字必須反映當下狀態：

| 狀態 | 繁中 | English | 简中 |
|---|---|---|---|
| 未開啟 | 🔍 放大鏡（看 sub-pixel 排列） | 🔍 Magnifier (inspect sub-pixel layout) | 🔍 放大镜（看 sub-pixel 排列） |
| **已開啟** | **✕ 離開放大鏡模式** | **✕ Leave magnifier mode** | **✕ 离开放大镜模式** |

再點一次即關閉。

### Esc 逐層

第一次關放大鏡、第二次離開全螢幕 —— 這在 v2.10.0 收成單一處理時就成立，這次再確認一次。

### 順手修掉一個自己留下的錯誤

放大鏡工具列上的提示原本寫「或點畫面右上角的 ✕」，但全螢幕已經沒有那個圖示了 —— 這行提示在全螢幕下是錯的。改成「或再點一次進入時用的那個入口」，兩種情境都正確。

### 全螢幕下的常駐疊加物盤點

逐一檢查 `#pg-fs` 的每個子元素，判準是「會不會在畫面上留下痕跡」（在視窗內 ＋ 有非透明背景／邊框／文字／陰影）：

| 元素 | 會不會畫 | 說明 |
|---|---|---|
| 畫布本身 | — | pattern 本體 |
| 左上角資訊框 | **會畫** | **原程式行為**（原程式的資訊面板），只在特定畫面顯示、內容也照原程式的規則。不是我們加的疊加物，保留 |
| 左右邊緣感應區 ×2 | 不畫 | 完全透明、不繪任何像素，只負責接滑鼠 |
| 側邊控制面板 | 不畫 | 收合時位於畫面外（`-296px`） |

**除了原程式的資訊框之外，沒有任何常駐疊加物。**

### 驗證

- 全螢幕未開放大鏡時，`#pg-fs` 內會在畫面上留痕跡的元素**只有 1 個**（原程式資訊框）
- 全螢幕角落圖示 ✅ 已移除｜全畫面 1:1 檢視 ✅ 已移除｜主頁預覽 ✅ 保留｜輸出預覽 ✅ 保留
- 選單文字三語各驗一輪，開／關兩狀態都正確切換
- 實際從選單點擊兩次：第一次「🔍 放大鏡…」→ 開啟；第二次「✕ 離開放大鏡模式」→ 關閉
- Esc①→ 放大鏡關閉、全螢幕仍在；Esc②→ 離開全螢幕
- 黃金基線 204 組：雜湊不符 **0**、尺寸不符 **0**
- Console 無錯誤

⚠️ 以上皆在「覆蓋整個視窗」的模式下驗證。**真正的全螢幕仍需人工確認**（自動化環境無法取得 user activation，`requestFullscreen()` 一律被拒）。

---

## Pattern Generator 畫面產生器 (pattern) v2.11.0 — 2026-08-02 ｜ MINOR

**判定依據：** `VERSIONING.md` **R2** ＋判定表「新增獨立功能 → MINOR」。查證後確認程式並未隱藏全畫面游標（回報現象源自瀏覽器自身行為），本版做的是新增「推到邊緣才自動隱藏」這個先前不存在的行為，屬新增能力而非修正。

**全畫面：游標平常看得見，推到畫面邊緣才自動隱藏，離開立刻回來。**

### 先講查證結果：程式碼裡沒有任何一處隱藏全畫面的游標

回報是「進到全螢幕模式之後，滑鼠的游標完全看不到」。查過整份檔案，**唯一的 `cursor: none` 是放大鏡用的**（樣式在行 486，只掛在放大鏡開啟時、關閉即移除）。一般全畫面下游標用的是瀏覽器預設值，**本來就是可見的**。

所以看到的「游標消失」很可能是**瀏覽器自己的行為** —— Chrome 在真全螢幕下，滑鼠靜止數秒會自動把游標藏起來，一動又出現。那是瀏覽器層級的處理，網頁無法停用。

這一版做的是被要求的那個行為：**推到邊緣才隱藏**。

### 邊緣門檻取 8 px

面板熱區是 26 px。8 px 夠窄，正常移動不會誤觸；但把滑鼠往邊上一推就會進到範圍內。

### 與側邊控制面板的關係

側邊面板的滑出熱區本來就在左右邊緣，滑鼠移過去是**要叫出面板來操作的** —— 這時候讓游標消失反而礙事。所以：

- **面板那一側的邊緣不隱藏游標**（面板在左就左邊不隱藏，在右就右邊不隱藏）
- **面板已經滑出時完全不隱藏**
- 其餘三邊照常隱藏

兩者因此可以共存，不需要犧牲任何一邊。

### 放大鏡不受影響

放大鏡模式下系統游標是刻意隱藏、換成準星的，那是設計本意。開啟放大鏡時會清掉邊緣隱藏狀態交給準星接手，放大鏡開著時移到邊緣也不會去動它。

### 驗證

| 位置（視窗 1920×958，門檻 8 px，面板在左） | `cursor` 值 |
|---|---|
| 畫面正中（平常） | `auto` ✅ 看得見 |
| **左邊緣**（面板側） | `auto` ✅ **不隱藏**，因為那是面板熱區 |
| 右邊緣 | `none` ✅ |
| 上邊緣 | `none` ✅ |
| 下邊緣 | `none` ✅ |
| 離開邊緣後 | `auto` ✅ 立刻恢復 |

| 對稱與回歸 | 結果 |
|---|---|
| 面板改到右側 | 左邊緣 `none`、右邊緣 `auto` ✅ 對稱正確 |
| 面板開啟中 → 上邊緣 | `auto` ✅ 不隱藏 |
| 面板收起後 → 上邊緣 | `none` ✅ |
| **放大鏡開啟** | canvas `cursor: none`、準星顯示、邊緣隱藏狀態已清空 ✅ |
| 放大鏡開著時移到邊緣 | 不去動邊緣隱藏狀態 ✅ |
| **放大鏡關閉** | `cursor: auto`、標記已移除 ✅ 游標回來 |
| 側邊面板熱區 | 滑到左邊緣 5 px → 面板滑出 ✅ 未被破壞 |

**黃金基線 204 組**：雜湊不符 **0**、尺寸不符 **0**。Console 無錯誤。

---

## Pattern Generator 畫面產生器 (pattern) v2.10.0 — 2026-08-02 ｜ MINOR

**判定依據：** `VERSIONING.md` **R2** ＋判定表「新增獨立功能 → MINOR」。匯入圖片是新增能力；放大鏡入口的修復屬 **R1**（PATCH 級），被 MINOR 吸收。

**修好放大鏡「叫不出來、退不出來」，補齊入口；並加入匯入圖片。**

---

### 🔴 修正：放大鏡在真正的全螢幕下完全看不到

回報是「進了放大鏡模式退不出來」「全畫面時放大鏡叫不出來」。

**根因**：放大鏡的覆蓋層、準星、工具列這三個元素掛在 `<body>` 底下，而進全畫面時要求全螢幕的對象是全畫面容器。**真正的全螢幕模式下，只有全螢幕元素的子樹會被渲染，掛在 `<body>` 底下的東西完全不顯示。** 右鍵選單早就處理過同一件事（它會依情境選擇掛載點），放大鏡漏了。

所以在真全螢幕下：選單看得到、放大鏡點得下去，但**本體與退出鈕都是隱形的** —— 正好就是「叫不出來、退不出來」。

修法：開啟放大鏡時把三個元素掛到目前的全螢幕元素底下，並在全螢幕狀態改變時重新掛載。

**為什麼先前的驗證沒抓到**：所有全畫面驗證都是在「覆蓋整個視窗的一般元素」狀態下做的，從來沒有真的進過全螢幕（自動化環境下要求全螢幕會被瀏覽器拒絕）。而這個問題**只在真全螢幕才會發生**。這是驗證方式的盲區，不是漏寫程式碼。

### 退出方式現在有四條

1. **Esc**（逐層關閉，只關放大鏡不會連帶離開全畫面）
2. **工具列的「✕ 關閉放大鏡」**
3. **顯示區右上角的圖示** —— 放大鏡開啟後它會變成紅色 ✕
4. **再點一次進入時用的那個入口**（toggle）

工具列上加了一行黃字，直接寫明這幾種離開方式。

### 入口補齊到每一個顯示 pattern 的地方

- **四個顯示區的右上角各有一個 🔍 圖示**：主頁預覽、輸出預覽、全畫面、全畫面 1:1 檢視。半透明、不擋 pattern 內容，滑鼠移上去才變明顯；放大鏡開啟後變成紅色 ✕。
- **「輸出與另存」卡片**新增一顆開啟按鈕（先前完全沒有入口）。
- **全畫面右鍵選單最上方**（原本就有，這次確認掛載點修好後在真全螢幕下也叫得出來）。

### 驗證（這次改成驗「使用者進得去、出得來」）

先前只驗了「讀到的值對不對」，沒有驗「按不按得到」—— 這是漏掉問題的直接原因。

| 入口／出口 | 結果 |
|---|---|
| 主頁預覽邊角圖示 → 開啟 | ✅ 開啟成功 |
| 再點同一個圖示 → 關閉 | ✅ toggle 有效 |
| 輸出與另存卡片按鈕 → 開啟 | ✅ |
| 全畫面右鍵選單第一項 → 開啟 | ✅ 第一項確實是放大鏡 |
| Esc（非全畫面） | ✅ 關閉 |
| Esc（全畫面中） | ✅ **只關放大鏡，全畫面仍開著**；再按一次才離開全畫面 |
| 工具列 ✕ 是否真的點得到 | ✅ 座標 (812,34)、尺寸 109×38、在可視範圍內，`elementFromPoint` 命中**它本身**（沒被任何元素蓋住） |
| 全畫面邊角 ✕ 是否真的點得到 | ✅ 座標 (1877,28)、尺寸 36×36，`elementFromPoint` 命中**它本身** |

⚠️ **仍無法在真全螢幕下驗證的項目**已列在回報中，需要人工用真實鍵盤操作確認。

---

### 🆕 匯入圖片

可以把外部圖檔當成 pattern 顯示，**PNG / BMP / JPG / GIF / WebP** 等瀏覽器能解的格式都吃。實測瀏覽器原生就能解 BMP；另外仍保留自己寫的 BMP 讀取器作為後備，並確認它解出來的結果同樣正確。

#### 🔴 絕不自動縮放

理由與存圖的像素完整性完全相同：一縮放，像素級排列就毀了，而匯入圖片多半就是要看那張圖的像素排列。

- 圖比畫面小 → **1:1 置中，四周留黑邊**
- 圖比畫面大 → **1:1 顯示，可拖曳平移**
- 尺寸剛好 → 1:1 滿版

#### 🔴 JPG 的先天限制會明白告知

匯入 JPEG 時會顯示警告：**檔案裡的像素值在存成 JPG 的當下就已經被改過了**（色度次取樣、DCT 量化），不是原圖的精確數值。本工具不會再更動它，但放大鏡讀到的是 **JPEG 檔案裡的值**，不是原始畫面的值。要逐像素比對請用 PNG 或 BMP。

#### 放大鏡讀匯入圖

讀**解碼後的原始像素**，不讀螢幕上那張（它有置中偏移與平移）。

#### 驗證

| 檢查項 | 結果 |
|---|---|
| PNG 匯入 vs 來源逐像素 | **0 / 4,096** |
| BMP 匯入 vs 來源逐像素（瀏覽器原生解碼） | **0 / 4,096** |
| BMP 內建讀取器（不經瀏覽器） | **0 / 4,096** |
| JPG 匯入 vs 來源 | 3,036 / 4,096 不符，最大通道差 **±20**，分布 ±1→1782px、±2→959px、±3→179px —— 典型的 DCT 量化誤差。**同一張圖存成 PNG 匯入是 0 差異、存成 JPG 是 3,036，流程完全相同 → 差異只可能來自 JPEG 編碼本身** |
| 不縮放（畫面比圖大／相同／比圖小） | 三種各驗一次：圖內像素不符 **0**、黑邊非純黑 **0**、置中偏移正確 |
| 放大鏡讀匯入圖 | 20 個取樣點涵蓋棋盤與漸層兩種內容，座標換算含置中偏移，**不符 0** |

遮罩可以疊在匯入的圖上；「用匯入圖當遮罩內容」這一版未做，資料結構已預留位置。

**黃金基線 204 組**：雜湊不符 **0**、尺寸不符 **0**。Console 無錯誤。

---

## Pattern Generator 畫面產生器 (pattern) v2.9.0 — 2026-08-02 ｜ MINOR

**判定依據：** `VERSIONING.md` **R2** ＋判定表「新增獨立功能 → MINOR」。放大鏡是全新功能，既有畫面與操作全部不變（對應 §2 案例 1）。

**放大鏡：把游標下的像素放大成 R／G／B 三條，看清 sub-pixel 的排列與亮度。**

### 哪裡可以用

**任何顯示 pattern 的地方都可以開**，共四處：全畫面、全畫面 1:1 檢視、輸出與另存卡片的預覽、主頁預覽。滑鼠移到哪一個上面，放大鏡就作用在哪一個。

全畫面按右鍵，選單**最上方**就是放大鏡，下面用一條分隔線與畫面清單分開 —— 它是工具不是一張測試畫面，混在一起會讓人以為選了會換畫面。

### 🔴 顯示的值一律取自 pattern 的真實像素

這是整個功能有沒有意義的關鍵。**輸出預覽在「符合視窗」模式下是縮放顯示的**（3840×2160 縮到 28.8%），從螢幕上那張圖取樣會拿到內插後的假值。所以每個場景都明確指定自己的真實來源：

| 場景 | 螢幕上是否縮放 | 取值來源 |
|---|---|---|
| 全畫面 | 否（本來就是 1:1 裝置像素） | 該畫布本身 |
| 全畫面 1:1 檢視 | 否，但有平移 | 輸出解析度的畫布 ＋ 平移量 |
| 輸出預覽「符合視窗」 | **是** | **輸出解析度的畫布**，座標換算回去 |
| 輸出預覽「1:1」 | 否，有平移 | 輸出解析度的畫布 ＋ 平移量 |
| 主頁預覽（測試畫面） | **是** | 以全畫面尺寸重新產生的畫布 |
| 主頁預覽（手動 4×4） | 整數倍放大 | **4×4 編輯器的值本身** |

### 🔴 放大不經任何內插

逐格重畫，`imageSmoothingEnabled = false`，取樣時的 `drawImage` 也是同尺寸不縮放。插值出來的顏色是假的，而這個功能存在的理由就是要看真實的排列。

### 呈現

- 每個實體像素畫成 **R／G／B 三個並排的直條**，各自用該通道的亮度上色 —— 這就是面板上 sub-pixel 的實際排列方式。
- **準星**：隱藏系統游標，改由覆蓋層自繪（中心留空的十字 ＋ 外圈 ＋ 中心點），準星對到的那一格在放大鏡裡用藍框明確標出。
- **取樣範圍用奇數**（5×5 / 9×9 / 17×17，預設 9×9）。偶數沒有真正的中心格 —— 16×16 的中心落在四格交界，準星對到的像素無法明確標示。
- 放大鏡框跟著準星走，靠近邊緣自動翻到另一側，不會開到畫面外、也不會蓋住正在看的位置。

### 數值標示：放不下就不硬塞

框下方固定一列大字顯示中心像素的 `R / G / B` 與座標 —— 這行一定看得清，不受格子大小影響。

格子裡的數字**只在 5×5 時標**（每條 24 px，放得下）。9×9 每條只有 13 px、17×17 只有 7 px，**實測把 3 位數塞進去會擠成一團完全讀不出來**，那只是製造雜訊。這一版原本做了垂直排數字想硬塞進 9×9，截圖看過之後拿掉了。

數值範圍是 **0–255**。

### Esc 行為：三個獨立處理收成一個

先前選單、全畫面預覽、全畫面各自註冊 Esc handler，靠註冊順序決定誰先跑；再加放大鏡就是第四層。現在收成單一處理，**由內而外逐層關閉、一次只關一層**：

`選單 → 放大鏡 → 全畫面 1:1 檢視 → 全畫面`

`F` 維持「直接離開全畫面」（並一併關掉放大鏡）—— 那是明確的意圖表達，不需要逐層。放大鏡開著時 pattern 的鍵盤操作（1–8 換色、↑↓ 調灰階、Space 反相）維持有效。

### 驗證

| 檢查項 | 結果 |
|---|---|
| **全畫面**取 5 個座標，讀值 vs 理論值 | 不符 **0 / 5**，座標標示也正確 |
| **全畫面逐格顏色**（驗無內插） | 5 個位置 × 每次 80 格 = **400 格，不符 0** |
| **輸出預覽「符合視窗」（縮放 28.8%）** 取 40 個座標 | 不符 **0**；理論值為 200 的 16 次、為 0 的 24 次 —— 兩種值都涵蓋到才算真的驗過 |
| `Skip SubPixel` 沿 x 連續 8 點 | `0/255/0 → 255/0/255` 交替，不符 **0/8**，與定義相符 |
| `Vertical Line ▸ Sub Line` 沿 x 連續 6 點 | 偶數 x 為 G 亮、奇數 x 為 R+B 亮，不符 **0/6** |
| 四角 ＋ 四邊共 8 個位置的翻邊 | 開到畫面外 **0 次**（視窗 1920×958，附各框實際座標） |
| **放大鏡不影響存圖** | 關閉時存與開啟並移動準星後存：雜湊相同、逐像素差異 **0 / 921,600**、PNG 檔案大小相同 |
| 黃金基線 204 組 | 雜湊不符 **0**、尺寸不符 **0** |
| Console | 無錯誤 |

---

## Pattern Generator 畫面產生器 (pattern) v2.8.0 — 2026-08-02 ｜ MINOR

**判定依據：** `VERSIONING.md` **R2** ＋判定表「新增獨立功能 → MINOR」。新增一個輸出解析度屬新增能力；清單排序調整屬 §2 案例 3 的「控制項位置小移」（PATCH 級），被 MINOR 吸收。

**新增 1440×900，並把輸出解析度改成由左到右、由小到大排列。**

### 排列方式改回單純遞增

上一版把清單依長寬比分組（16:9 一群、16:10 一群…），理由是「挑解析度的心智模型是我要哪一種面板」。**實際看了畫面之後這個判斷是錯的** —— 分組讓數字看起來跳來跳去（`3840×2160` 之後突然回到 `1920×1200`，再跳到 `640×480`），反而更難掃。

現在就是一條由小到大的清單，不分組、不加分隔：

`640×480 → 800×600 → 1280×720 → 1366×768 → 1440×900 → 1600×900 → 1920×1080 → 1920×1200 → 2560×1440 → 3440×1440 → 3840×2160`

排序基準是**總像素數遞增**。寬度剛好也同時遞增，唯一需要靠像素數分辨的是同為 1920 寬的 1080 與 1200。

長寬比與百萬像素的滑鼠停留提示保留 —— 那是附加資訊，不影響排列。

### 驗證

**§0 像素完整性（9 個像素等級畫面 @ 1440×900，11,664,000 px）**：規則不符 **0**、PNG 差異 **0**、BMP 差異 **0**、解碼尺寸不符 **0**。

**BMP 每列 4-byte 對齊**：`1440 × 3 = 4320`，`4320 mod 4 = 0` → 補齊量 **0**，走的是無補齊路徑。單檔理論大小 3,888,054 bytes，實際 3,888,054 ✓。補齊量 1／2／3 的路徑在上一版已用 801、1366、803 三個寬度覆蓋過，本版不需重測。

**相位（實測，非推論）**：`Skip 1 Dot ▸ 1V 2H`、`Skip 2 Dot ▸ 2V 2H`、`Skip 2 Dot ▸ 2V (1+2)H` 三張在 H=900 與 H=1080 下的左上角相位**完全相同**（900 與 1080 除以 4 的餘數都是 0）。

**16:10 幾何**：`Horizontal` 9 條帶界與帶灰階、`Vertical` 9 條、`Checker` 8×8 全部 64 格、`Cross Talk` 內外框、`SMPTE` 前兩塊 —— 共 84 個取樣點，**不符 0**。

**黃金基線 204 組**：雜湊不符 **0**、尺寸不符 **0**。

驗證全程在頁面內產生檔案位元組後直接解碼比對，未觸發任何瀏覽器下載。

---

## Pattern Generator 畫面產生器 (pattern) v2.7.0 — 2026-08-02 ｜ MINOR

**判定依據：** `VERSIONING.md` **R2** ＋判定表「新增獨立功能 → MINOR」。新增四個輸出解析度，既有解析度與操作全部不變（對應 §2 案例 5）。

**輸出解析度常用清單新增四個：1920×1200、3440×1440、800×600、640×480。**

清單從 6 個變成 10 個，涵蓋 16:9 之外的三種長寬比。四個都不與現有項目重複。

### 順序改成依長寬比分組

挑解析度時的心智模型是「我要哪一種面板」，而面板是以長寬比分類的；純依總像素排會把 4:3 的小尺寸跟 16:9 的混在一起，反而難找。

`1280×720 / 1366×768 / 1600×900 / 1920×1080 / 2560×1440 / 3840×2160`（16:9 系）→ `1920×1200`（16:10）→ `3440×1440`（21:9）→ `640×480 / 800×600`（4:3）

原本 `1366×768` 與 `1600×900` 被排在 4K 後面，現在回到 16:9 系內的正確位置。每個按鈕加上滑鼠停留提示，顯示長寬比與百萬像素數。

### 驗證

**§0 像素完整性（9 個像素等級畫面 × 4 個新解析度 = 36 組，72,403,200 px）**

| 解析度 | 檢查像素 | 規則不符 | PNG 差異 | BMP 差異 |
|---|---|---|---|---|
| 1920×1200 | 20,736,000 | **0** | **0** | **0** |
| 3440×1440 | 44,582,400 | **0** | **0** | **0** |
| 800×600 | 4,320,000 | **0** | **0** | **0** |
| 640×480 | 2,764,800 | **0** | **0** | **0** |

解碼尺寸不符 **0**。

**BMP 每列 4-byte 對齊**：四個新尺寸的寬度**全都是 4 的倍數**，補齊量恆為 0，等於完全沒走到補齊路徑。所以另外挑了三個寬度把四種補齊量都覆蓋：

| 尺寸 | 補齊量 | 檔案大小 vs 理論值 | 逐像素差異 |
|---|---|---|---|
| 800×600 | 0 | 1,440,054 = 1,440,054 ✓ | **0** |
| 801×600 | 1 | 1,442,454 = 1,442,454 ✓ | **0** |
| 1366×768 | 2 | 3,148,854 = 3,148,854 ✓ | **0** |
| 803×600 | 3 | 1,447,254 = 1,447,254 ✓ | **0** |

**相位一致性**：四個新高度 1200 / 1440 / 600 / 480 除以 4 的餘數**都是 0，與 1080 相同**，所以三張高度相依的畫面（`Skip 1 Dot ▸ 1V 2H`、`Skip 2 Dot ▸ 2V 2H`、`Skip 2 Dot ▸ 2V (1+2)H`）在這四個新尺寸下**相位與 1080 完全一致**，不需要額外標註。

**非 16:9 的幾何**：`Horizontal` / `Vertical` 的 9 條帶界與各帶灰階、`Checker` 8×8 的 64 個格位、`Cross Talk` 的中心方塊內外框、`SMPTE` 前兩塊的位置與顏色，四個新尺寸下**全部不符 0** —— 帶寬、格寬、方塊都正確地隨尺寸縮放。

**黃金基線 204 組**：雜湊不符 **0**、尺寸不符 **0**。

---

## Pattern Generator 畫面產生器 (pattern) v2.6.0 — 2026-08-02 ｜ MINOR

**判定依據：** `VERSIONING.md` **R2** ＋判定表「新增獨立功能 → MINOR」。補上先前完全改不到的 Pattern #2 參數屬新增能力；同版三項修正屬 **R1**（其中一項已標 ⚠ 輸出變更），級別較低被 MINOR 吸收。

**補上一個一直缺著的可調參數，並修掉三個既有問題。**

### 補：Skip 1 Dot 2 Gray 的 Pattern #2

這張畫面是兩組顏色在偶數列與奇數列交替。**原程式兩組都能調，本站先前只做了 Pattern #1** —— Pattern #2 被寫死成 Green/255，使用者完全改不到，等於少了一半功能。

現在補上 Pattern #2 的顏色與灰階控制項。同時把它從「借用 Cross Talk 的欄位」改成**自己的欄位** —— 借用除了讓使用者改不到之外，也會與 Cross Talk 互相污染（原程式每個畫面進入時要清那個共用欄位，正是為了這個）。

**預設輸出完全不變**（仍是 Red/255 與 Green/255 交替）。

### ⚠ 輸出變更：遮罩用「另一個畫面」當內容時的顏色

原本的程式碼一律把遮罩的顏色與灰階硬套到那張畫面上，而判斷「該不該改用畫面預設色」的那一行 `if (pgMask.colorIdx === undefined)` **永遠是 false**（初值就是 4），所以那條分支是死碼、從來沒執行過。

更糟的是被硬套的顏色值 4，在 `Horizontal` / `Vertical` / `LUMINACE` 這幾張畫面裡**不是黑色，而是「四色帶模式」的哨兵值** —— 選了這幾張當遮罩內容，畫出來會是四條彩色帶，跟使用者選的「遮罩顏色：Black」完全不符。

現在改成：**預設讓那張畫面維持它自己該有的樣子**（這才是「另一個畫面」的語意），要把遮罩顏色套上去則由使用者明確勾選。

> 這一項會改變畫面：若你之前用「遮罩內容＝另一個畫面」並依賴顏色被套用，需要勾選新的選項才會回到舊行為。不影響「遮罩內容＝單色」的用法。

### 修正

- **`Vertical` 與 `Center` 的子選單勾選標記**：原本只有 `Horizontal` 標成單選群組，所以同樣是三選一，`Horizontal` 顯示 ●、另外兩個顯示 ✓。現在三者一致。

### 驗證

| 檢查項 | 結果 |
|---|---|
| Pattern #2 面板在該畫面出現、預設 Green/255 | ✅ 預設輸出第 0 列 `R,黑,R,黑`、第 1 列 `黑,G,黑,G` |
| 改成 Blue/200 後輸出 | 第 1 列變 `黑,B200,黑,B200` —— **確實可調了** |
| 遮罩用 `Gray Level` 當內容 | 不套用顏色 → `7f7f7f`（該畫面自己的 White/127 預設）；勾選套用 Black/0 → `000000`。**修正前那條分支是死碼，一定會是 `000000`** |
| radio 標記 | `Horizontal` / `Vertical` / `Center` 三者皆為單選群組 |
| **黃金基線 204 組** | 雜湊不符 **0**、尺寸不符 **0** |
| **§0 像素完整性重跑**（9 畫面 × 3 解析度，126,489,600 px） | 規則不符 **0**、PNG 差異 **0**、BMP 差異 **0**、解碼尺寸不符 **0**、16×16 三尺寸相同 **9/9** |
| Console | 無錯誤 |

---

## Pattern Generator 畫面產生器 (pattern) v2.5.0 — 2026-08-02 ｜ MINOR

**判定依據：** `VERSIONING.md` **R2** ＋判定表「新增獨立功能 → MINOR」。「最近使用」是新增能力；選單改為兩層結構屬 §2 案例 3，既有畫面全部仍在選單內可達、沒有找不到的情況，不觸發 MAJOR。

**選單改成「先選來源、再選畫面」的結構，並加上最近使用。**

### 為什麼

之後還會加入其他測試程式的畫面。等到那時候才改選單結構，會動到主頁下拉、全畫面側邊面板、全畫面右鍵三個入口，以及遮罩的「另一個畫面」下拉。現在先把結構做好，加新來源時只要在一個陣列裡多放一個物件。

### 只有一個來源時自動展開

目前只有一組畫面（`LCD Test 2010`），選單**不會多包一層** —— 打開就直接是那 21 個項目，操作步數與先前完全相同。等到有第二個來源，選單自動變成兩層，UI 程式碼一行都不用改。

命名用該工具自己的標題，不用「來源 1 / 來源 2」這種序號 —— 序號本身沒有資訊，加到第三個就分不清誰是誰。

### 最近使用

選單頂端固定顯示最近選過的 5 張畫面（存在瀏覽器本機）。做「最近使用」而不是「我的最愛」，是因為量測時通常會反覆切同幾張 —— 最近使用零維護成本，我的最愛要自己管理。

### 修正

- **主頁下拉選單裡的 `Exit` 移除**。它會呼叫「離開全畫面」，但主頁本來就不在全畫面，點了等於沒反應。現在只在全畫面的選單裡出現。

### 驗證

| 檢查項 | 結果 |
|---|---|
| 單一來源自動展開 | 主頁根層 20 項、第一項是 `Horizontal`，與先前相同 |
| `Exit` 只在全畫面 | 主頁根層 **無**、全畫面根層 **有** |
| 最近使用 | 連選 7 次（含重複）後為 5 項、最新在前、正確去重 |
| 加入第二個來源（模擬） | 根層自動變成「最近使用 / LCD Test 2010 / Demo Set」，來源層 2 個，第一個來源底下仍是 20 項 —— **UI 程式碼未改動** |
| 遮罩的「另一個畫面」下拉 | 34 項 |
| 黃金基線 204 組 | 雜湊不符 **0**、尺寸不符 **0** |
| Console | 無錯誤 |

---

## Pattern Generator 畫面產生器 (pattern) v2.4.1 — 2026-08-02 ｜ PATCH

**判定依據：** `VERSIONING.md` **判定表「內部實作 → 重構、資料結構改寫（行為零改變）→ PATCH」**。使用者完全無感（對應 §2 案例 4：風險高不等於版號要大）。

**內部整理：一張畫面的屬性集中到一個地方。行為完全沒有改變，使用者不會看到任何差別。**

### 問題

一張測試畫面的資料原本散在六個地方：選單樹、變體循環群組、進入時的預設值、左上角資訊框模式、鍵盤群組（一串 regex 比對 id）、參數面板顯示（`show()` 加一條寫死的排除字串）。

加一張新畫面要改六處，其中**兩處是字串比對** —— 那是最容易漏掉、而且漏了不會報錯的地方。

### 做法

集中成一張 `PG_PATTERNS` 註冊表，一個畫面一個物件，欄位是 `def`（預設色與灰階）、`key`（鍵盤群組）、`mode`（資訊框模式）、`variants`（變體循環群）、`panels`（要顯示哪些專屬面板）。原本那幾張散表改由它衍生，下游引用一行都不用動。

參數面板的顯示改成讀 `panels` 陣列，那條寫死的 id 排除字串移除了。

**繪圖引擎完全沒動。** `pgDrawPattern` 的 switch 保持原樣 —— 那是繪圖實作，搬進註冊表只是換個位置，不會減少要寫的東西，卻會把風險最高的部分捲進這次改動。這次只整理**元資料**。

### 為什麼版號是 PATCH 而不是 MINOR

依專案的版本規則（`docs/VERSIONING.md`），判準是「使用者腦袋裡已經知道的事會不會失效」。這次使用者完全無感：沒有新功能、沒有行為改變、畫面一模一樣。**工程風險高不等於版號要大** —— 風險是靠驗收條件管的，不是靠版號。

### 驗證（這一版的唯一可接受結果就是「什麼都沒變」）

| 檢查項 | 結果 |
|---|---|
| 黃金基線 204 組 | 雜湊不符 **0**、尺寸不符 **0** |
| 衍生出的變體循環群組與原始定義 | **完全相同**（9 群，順序一致） |
| 34 個畫面的鍵盤群組 | **全部相符** |
| 34 個畫面 × 5 個參數面板的顯示狀態，與重構前的寫死規則對照 | **不符 0** |
| 34 個畫面的資訊框顯示／隱藏 | **不符 0** |
| Console | 無錯誤 |

---

## Pattern Generator 畫面產生器 (pattern) v2.4.0 — 2026-08-02 ｜ MINOR

**判定依據：** `VERSIONING.md` **R2** ＋ **R3**（大功能分階段交付，每個「使用者真的多能做一件事」的階段各進一次 MINOR）。批次匯出讓使用者多能做一件事，是存圖功能的第四個階段。

**一次匯出多個尺寸。**

勾選要的尺寸（1280×720 / 1920×1080 / 2560×1440 / 3840×2160 / 1366×768 / 1600×900），按一次就全部匯出。對「同一張圖要交多種面板解析度」很實用。

**每個尺寸都各自以該解析度原生重畫、各自跑一次逐像素驗證** —— 不是把同一張圖縮放成好幾份。批次是最容易偷偷混進縮放路徑的地方，所以這條在程式碼與說明文字裡都明講。

檔名沿用單張存檔的規則並自動加上尺寸；若手動改過檔名則以手動的為主幹。

### 驗證

實測一次匯出 4 個尺寸（`Skip SubPixel`、L255）：

| 尺寸 | 逐像素檢查 | 差異 | 檔案 |
|---|---|---|---|
| 1920×1080 | 2,073,600 px | **0** | 35 KB |
| 2560×1440 | 3,686,400 px | **0** | 59.5 KB |
| 1280×720 | 921,600 px | **0** | 16.8 KB |
| 1366×768 | 1,049,088 px | **0** | 19 KB |

黃金基線 204 組：雜湊不符 **0**、尺寸不符 **0**。

---

## Pattern Generator 畫面產生器 (pattern) v2.3.0 — 2026-08-02 ｜ MINOR

**判定依據：** `VERSIONING.md` **R2** ＋ **R3**。存圖預覽讓使用者多能做一件事，是存圖功能的第三個階段。

**存圖預覽：兩種檢視模式、呼吸燈警告、手爪拖曳。**

### 兩個檢視模式，不能疊在一起

「整張看得完」與「1:1 不縮放」的前提是相反的，所以做成明確的切換，而不是把效果疊起來：

- **符合視窗**（預設）：整張縮到看得完，用**套疊比例框**回答「這個尺寸跟螢幕比是大是小」—— 藍色實線是輸出、白色虛線是螢幕，實線在虛線**外側**就是比螢幕大，一眼可判斷，不必心算兩組數字。這個模式必然縮放，所以**警語常駐貼在預覽畫面上**（含當下的縮放百分比），不是藏在說明文字裡。
- **1:1 實際像素**：不縮放，用來看 1px 線條與相位真正長什麼樣。

### 三種尺寸關係的視覺

- **比基準大** → 四周**呼吸燈式紅框**：3 秒一個週期、`ease-in-out` 來回，**慢慢變亮、慢慢變暗，不是閃爍**。游標變**手爪**，按住左鍵可上下左右拖曳。
- **比基準小** → **置中顯示、四周留黑邊**。
- **剛好相同** → 綠色實線框**淡入一次後停住**。與紅框的差別是「靜止 vs 持續呼吸」加上顏色，兩個維度都不同，色覺差異也分得出來。

已加上 `prefers-reduced-motion` 降級：使用者若在系統設定關閉動態效果，紅框改為靜態顯示。

### 🔴 拖曳只改變看哪一塊，永遠不影響存檔內容

存出去的一律是**完整的目標解析度**。UI 上有三處表達這件事：拖曳時角落顯示「檢視位置 x, y｜存檔內容不受影響」、預覽下方常駐一行說明、輸出區固定標示輸出尺寸。

**這一點有實測把關**：拖曳前後各存一次，兩份輸出**逐像素比對差異 0 / 8,294,400**，檔案大小也完全相同。

### 全畫面 1:1 檢視

主頁的小預覽框，比較基準是預覽框本身；新增的「⛶ 用整個螢幕 1:1 檢視」則以**真正的螢幕**為基準 —— 那才是「1px 線條實際看起來如何」該用的尺度。同樣有呼吸燈／置中黑邊／手爪拖曳，Esc 離開。

### 命名紀律

會縮放的 `previewCanvas` 與絕不縮放的 `exportCanvas` 在程式碼裡分開命名，避免日後有人接手時把兩者混用 —— 寫進檔案的永遠只有後者。

### 驗證

| 檢查項 | 結果 |
|---|---|
| 符合視窗模式 | 2 個比例框、縮放警語常駐（實測顯示 28.8%）、無呼吸燈、不可拖曳 |
| 1:1 模式（目標 3840×2160 > 預覽框） | 呼吸燈存在、可拖曳、游標 `grab` |
| 呼吸燈是漸變而非閃爍 | 每 0.4 秒取樣紅框 alpha：`0.22 → 0.247 → 0.333 → 0.482 → 0.66 → 0.82 → 0.937`，最大跳變 0.178 |
| **拖曳前後存出的內容** | 雜湊相同，**逐像素差異 0 / 8,294,400**，檔案大小相同 |
| 目標小於預覽框 | 無呼吸燈、不可拖曳，左上角像素 `0,0,0`（黑邊）、中央 `127,127,127`（pattern） |
| 黃金基線 204 組 | 雜湊不符 **0**、尺寸不符 **0** |
| Console | 無錯誤 |

---

## Pattern Generator 畫面產生器 (pattern) v2.2.0 — 2026-08-02 ｜ MINOR

**判定依據：** `VERSIONING.md` **R2** ＋ **R3**。「能存圖了」是存圖功能的第一個階段，明確多了一件使用者做得到的事。

**存圖：可以用任意解析度輸出了，PNG 與 BMP 都支援。**

### 為什麼需要

畫面尺寸原本綁死在螢幕／視窗上。要交一張 2560×1440 的圖給別人，即使手上只有 1920×1080 的螢幕，也應該做得到。

### 這一版做了什麼

- **自訂輸出解析度**：直接填寬高，或用常用尺寸（1280×720 / 1920×1080 / 2560×1440 / 3840×2160 / 1366×768 / 1600×900），也可以一鍵帶入目前螢幕。
- **PNG 與 BMP 兩種格式**。兩者都是無損、像素值完全相同；PNG 有壓縮所以檔案小，BMP 不壓縮（3840×2160 約 23.7 MB）。不提供 JPEG 這類有損格式 —— 硬邊界與精確灰階會被破壞，這個工具就沒意義了。BMP 編碼器是自己寫的（瀏覽器不原生輸出 BMP）。
- **輸出含遮罩層、不含左上角資訊框**。資訊框是畫面上的疊層、不屬於 pattern 本身，而且它是 DOM 元素，離屏畫布天生就不會含它。
- **尺寸關係即時提示**：目標比螢幕大／小／剛好，三種狀態的顏色與文字都不同；長寬比與螢幕不同時另外標明；選 Checker 時會告訴你這個尺寸下格寬均不均勻（這正是自訂解析度真正幫得上忙的地方）。
- **遮罩外緣的佔比即時換算**：外緣調整是絕對像素，換解析度時露出區的佔比會跟著變。這是實測出來的（同一組設定在 3840 / 2560 / 1280 寬下分別是 18.77% / 19.77% / 22.97%），所以直接把當下的佔比算給你看，不讓人踩。

### 🔴 像素等級 pattern 的完整性

**輸出一律以目標解析度原生重畫，走的是同一支逐像素產生器，全程沒有任何縮放或內插。** 不畫小張再放大、不畫大張再縮小、不用 `drawImage` 縮放、不拿螢幕畫布當輸出來源 —— 任何一條重取樣路徑都會把 Pixel On-Off、Subpixel On-Off 這類像素等級圖樣糊掉或改變相位。

繪圖環境也固定住：畫布建立時指定不含 alpha 通道（避免預乘捨入 —— 實測 `rgba()` 繪圖在 8-bit 預乘下，256 級 alpha 有 196 級反算後會偏離原值）、色彩空間明寫 sRGB 不依賴預設值。

### 🔴 每次存檔都自動驗一次

**存完之後把檔案解碼回來，跟來源畫布逐像素比對，差異數直接顯示在畫面上。** PNG 與 BMP 都會驗。這讓「有沒有偏差」變成每次存圖自動確認的事實，而不是靠開發者保證。若比對不為 0 會以紅色顯示差異數並保留檔案，方便追查。

### 驗證

**像素完整性（9 張像素等級畫面 × 3 解析度 = 27 組，共 126,489,600 px 逐像素檢查）**

| 檢查項 | 結果 |
|---|---|
| 全圖套用該畫面應有的週期規則（規則獨立寫出，不呼叫繪圖引擎自己） | **不符 0** |
| PNG 存檔後解碼回來與來源比對 | **差異 0** |
| BMP 存檔後解碼回來與來源比對 | **差異 0** |
| 解碼後尺寸與目標不符 | **0 筆** |
| 左上 16×16 明暗矩陣三個解析度是否相同 | **9 張全部相同** |

**遮罩開啟時**（2560×1440、6 等份露第 2–3 份）：露出區 1,228,320 px 規則不符 **0**，PNG 與 BMP 差異各 **0**。

**含高度相依的相位**：`Skip 2 Dot ▸ 2V 2H` 與 `Skip 2 Dot ▸ 2V (1+2)H` 的相位公式本來就含畫面高度（原程式即如此），實測高度 1080 與 1082 的相位確實不同 —— 這是原程式行為，不是缺陷，公式不會去動它。`Skip 1 Dot ▸ 1V 2H` 因為公式裡是 2×高度，偶數高度之間相位反而一致。常用的 1080 / 1440 / 2160 三者相位相同。

**黃金基線 204 組**：雜湊不符 **0**、canvas 尺寸不符 **0**。

---

## Pattern Generator 畫面產生器 (pattern) v2.1.0 — 2026-08-02 ｜ MINOR

**判定依據：** `VERSIONING.md` **R2** ＋判定表「新增獨立功能 → MINOR」。快速樣式改為取自繪圖引擎的實際輸出，使用者操作位置與按鈕全部不變。

⚠ 本版另含兩個既有 bug 的修正（**R1**，PATCH 級），被 MINOR 吸收。若當時的重點只在「改成同一套實作」而未新增任何能力，依判定表會落在 PATCH；已上線故不回溯調整。

**「快速樣式」改成測試畫面選單的捷徑，不再是另一套實作。**

### 為什麼改

舊版那 9 顆快速樣式是各自寫死的算式（`(r + p) % 2`、`(r + p*3 + c) % 2` 之類），與選單的 34 個畫面**各畫一套**。兩邊有沒有一致，沒有任何機制保證 —— 只要有人改了其中一邊就會默默分岔。

v1.9.0 上做過一次逐像素驗證（整張 canvas 7,299,960 px 全掃、非抽樣）：9 顆全部都能用選單畫出**逐像素相同**的結果。既然如此，維持兩套實作就只有壞處。

### 這一版做了什麼

**捷徑 = 選單項 id ＋ 顏色／灰階覆寫。** 按下去之後，值是用**同一支 `pgDrawPattern`** 把那張畫面畫出來、再反推它的重複單元填進 4×4 編輯格。值的唯一來源就是繪圖引擎本身，結構上不可能分岔。

**保留 5 顆，移除 4 顆。**

- 保留 `L0` / `L255` / `R255` / `G255` / `B255` —— 選單裡沒有「一鍵純色」，`Gray Level` 進入時是 White／127，還要再改顏色與灰階。
- 移除 `Pixel on/off`、`V 1 Line`、`H 1 Line`、`Subpixel On/Off` —— 這四個在選單裡都有**同名的正式畫面**（`Skip 1 Dot ▸ 1V 1H`、`Vertical Line ▸ 1 line`、`Horizontal Line ▸ 1 line`、`Skip SubPixel`），留著等於同一張畫面有兩個入口。

**捷徑會帶對灰階。** 按 `L0` 之後灰階欄位就是 0，不會停在上一個殘留值，接著點格子塗刷可以直接沿用。

**按完仍停在手動模式**，4×4 格子可以繼續改 —— 這正是這幾顆捷徑存在的理由（走選單會進測試畫面模式，編輯格變成唯讀的反推顯示）。

**新增「⇩ 以此為起點手動編輯」。** 從測試畫面接手到手動編輯，過去只能靠「隨便動一格 → 被踢回手動模式 → 值剛好還在」這個副作用達成，很不直覺；現在有正式入口。非 4×4 週期的畫面（SMPTE、Checker…）沒有可搬的重複單元，按鈕會停用並說明原因，不會按了沒反應。

全畫面側邊面板裡那份快速樣式一併移除 —— 全畫面要純色直接走選單即可。

### 修正（既有問題，與上述功能無關）

- **遮罩說明文字把 HTML 標籤當成純文字顯示**：畫面上會看到 `<b>此功能為本站設計，原程式沒有。</b>` 這樣的原始標籤。原因是該欄位用 `data-i18n`（走 `textContent`），但對應的文案含 `<b>`。改用 `data-i18n-html`。
- **「啟用遮罩」「同時使用垂直等份」的核取方塊版面錯位**：方塊裸露在左上角、文字被撐成一顆滿寬大按鈕。原因是共用樣式只隱藏了 `input[type="radio"]`，沒處理 `checkbox`。只在本頁修 —— 全站唯一把 checkbox 放進該樣式的就是這裡。

> 這兩個問題 v1.9.0 就存在（已用線上版逐項比對確認），只是遮罩卡在頁面下方、很少展開才沒被發現；v2.0.0 把它改成可收合之後更容易被看到，所以一併處理。

### 驗證

- **黃金基線 204 組**（34 畫面 × 3 解析度 × 反相）：雜湊不符 **0** 組、canvas 尺寸不符 **0** 筆。
- **5 顆捷徑逐一與選單路徑逐像素比對**：全部相同，且按完模式停在手動、灰階欄位值正確。
- 「以此為起點手動編輯」：週期畫面可用且值完整沿用、按下後格子確實可手改；非週期畫面停用並顯示原因。
- Console 無錯誤。

---

## Pattern Generator 畫面產生器 (pattern) v2.0.0 — 2026-08-02 ｜ MAJOR

**判定依據：** `VERSIONING.md` **R2**（波的第一版用 MAJOR，宣告需要重新熟悉一次）。介面重整只動版面、不動繪圖與資料邏輯，但控制項位置整體改變，符合 §2 案例 3 的「重排到原本的按鈕找不到了 → MAJOR」。

**介面重整第一版：只動版面，不動任何繪圖與資料邏輯。**

此版起套用新的版本號規則（見上方公告）。編為 MAJOR 的原因：**原本的按鈕位置全變了**，使用者需要重新熟悉一次版面。

### 為什麼要重整

舊版把四件不同的事全塞在一張叫「Sub-pixel 編輯（4 px × 4 列）」的卡片裡：4×4 編輯器、9 顆快速樣式、34 項測試畫面選單、以及 Cross Talk／Response Time 的參數。**測試畫面選單是目前最主要的功能，卻藏在一張名字對不上的卡片下半段。**

另外還有三個具體問題：兩組長得一模一樣的灰階控制項（相隔 40 行、只有一個當下有效）；`pgMode` 這個決定一切的狀態沒有任何顯性表達，使用者不知道自己按下去會不會把剛選的畫面弄丟；預覽在第四張卡片，但影響預覽的控制項散在第二、三張，手機上要捲兩三個螢幕高度才能一邊改一邊看。

### 這一版做了什麼

**版面改成四區**（「輸出與另存」區將於後續版本插入在③與④之間）：

1. **① 現在顯示什麼** — 新增。模式分頁鈕（`測試畫面` / `手動 4×4`）、目前畫面名稱、**預覽移到這裡**、選單與進入全畫面兩顆主要動作、全畫面面板位置設定。
2. **② 畫面參數** — 內容依目前模式切換，兩組灰階／顏色控制項不會再同時出現。
3. **③ 遮罩** — 改為可收合，**預設收起**（低頻功能，卻是全頁最重的一張卡）。收合狀態下標題右側顯示「已啟用／未啟用」。
4. **④ 螢幕資訊** — 改為可收合，**預設收起**（8 項唯讀數字不該佔掉手機的第一屏）。收合狀態下標題右側顯示「解析度 @dPR」。

**模式分頁鈕**把 `pgMode` 變成顯性狀態。`手動 4×4` ＝ 切回 sub-pixel 編輯；`測試畫面` ＝ 開選單挑一張。刻意不做「回到上次那張」，因為那會把顏色／灰階重設成該畫面的預設值 —— 使用者只是切個分頁卻發現參數被清掉會很意外。

### 不變的部分

- **繪圖引擎一行未動**：`pgDrawPattern`、`pgPixels`、`pgTileLevels`、遮罩、週期偵測全部原封不動。
- 34 個測試畫面、鍵盤操作、全畫面右鍵選單、1:1 逐像素平鋪，行為完全相同。
- 所有既有元素 id 全數保留，只改 DOM 位置與外層結構。

### 驗證

以 v1.9.0 建立的**黃金基線**比對：34 畫面 × 3 解析度（3840×2160 / 2560×1440 / 1920×1080）× 反相 2 態 ＝ **204 組整張 canvas 逐像素 FNV-1a 雜湊**（非抽樣），要求**全數不變**。基線檔在 `docs/baseline/pattern_v1_9_0_golden.txt`。

---

## Pattern Generator 畫面產生器 (pattern) v1.9.0 — 2026-08-01

**判定依據（回溯補記）：** 本版早於 2026-08-02 的規則制定，當時未套用級別制，標題列因此沒有級別欄。以現行 `VERSIONING.md` 回溯判定為 **MINOR**：遮罩是全新功能，既有畫面與操作全部不變（§2 案例 1）。

新增**遮罩**功能。**★ 本站設計，原程式沒有這個功能**（程式碼註解與 UI 說明都有標）。

### 功能

把畫面左右平分成 N 等份，只露出勾選的等份，其餘蓋掉。**對所有畫面都有效**——選單的 34 個畫面、以及手動 sub-pixel 編輯的畫面都能疊。

- **水平等份數可設定**（1–64，不是寫死 6），露出的等份**可複選**。
- **垂直等份**一併做了（結構與水平對稱）。水平與垂直同時啟用時有語意分歧，所以**做成可切換而不是替你選**：**交集**（露出矩形，預設）或**聯集**（露出十字）。
- **露出區外緣調整**：單一數值，**正 = 外擴、負 = 內縮**（px）。作用在**整段連續露出區的外緣**，所以露出相鄰等份（例如 2、3）時中間不會有接縫。
  > 用單一數值而不是左右兩個獨立欄位，是因為原始需求寫的是「左右內縮或外擴幾個 Pixel」，語感是一個對稱值；實務調整也多半左右一起。若之後需要左右不對稱，這裡再拆成兩個欄位即可。
- **遮罩內容**：單色（沿用既有的 8 色 + 灰階機制），**或另一個畫面**（從同一份選單樹選，34 個都可以）。

### 實作方式

遮罩是**疊在畫好的畫面之上的一層**，`pgDrawPattern` 一行都沒改。流程是：

1. 先把露出區的像素 `getImageData` 存起來
2. 整面蓋上遮罩（單色 `fillRect`，或用 `pgDrawPattern(ctx, W, H, stateOverride)` 畫另一張畫面）
3. 再把露出區 `putImageData` 貼回去

**之所以不用 `clip`**：`putImageData` 完全無視 `clip`，而 Skip 系列這些逐像素畫的畫面走的正是 `putImageData`，用剪裁會整片漏出來。用「存→蓋→貼回」則是逐像素複製，1:1 對應不受影響，邊界也都落在整數裝置像素上（等份界用 `Math.round(total * i / n)`）。

`pgDrawPattern` 只多加了一個可選參數 `stateOverride`（不傳就是畫目前這張），讓遮罩能用另一組狀態畫另一個畫面。

**不套遮罩的地方**：週期偵測用的 `pgDrawSlice` 不套，所以 **4×4 sub-pixel 編輯區完全不受遮罩影響**（遮罩是畫面層的東西，編輯區顯示的是 pattern 的重複單元）。全畫面與預覽區都會套。

### 驗證（畫面 1920 × 958）

**邊界（6 等份、只露第 1 份、黑色遮罩）**

| 位置 | 實際 RGB |
|---|---|
| `x = 0` | `127,127,127`（pattern）|
| `x = 319`（露出區最後一點）| `127,127,127` |
| **`x = 320`（遮罩區第一點）** | **`0,0,0`** |
| `x = 1919` | `0,0,0` |

**接縫（露第 2、3 份）**：等份界在 `x = 640`，讀 `x = 639 / 640 / 641` 全部是 `127,127,127`；實測露出區 `x = 320 … 959`（寬 640），**區間內逐點掃描沒有任何黑點**。

**外緣調整**（基準露出區 320…959）

| 設定 | 實測露出區 | 位移 |
|---|---|---|
| `pad = +5`（外擴）| **315 … 964** | 左 −5、右 +5 |
| `pad = −5`（內縮）| **325 … 954** | 左 +5、右 −5 |

**遮罩顏色換非黑**：設 G255 → 露出區 `127,127,127`、遮罩區 **`0,255,0`**。

**不同畫面（含非週期圖）**

| 畫面 | 露出區 `x=10` | 遮罩區 `x=960` |
|---|---|---|
| Skip 1 Dot 1V1H（週期圖）| `127,127,127` | `0,0,0` |
| **SMPTE（非週期）** | `104,104,104` | `0,0,0` |
| **Cross Talk（非週期）** | `127,127,127` | `0,0,0` |

**垂直等份**（水平露第 1 份 + 垂直露第 1 份，露出塊 320 × 160）

| 組合 | (10,10) | (10,165) | (325,10) | (325,165) |
|---|---|---|---|---|
| 交集 | `127,127,127` | `0,0,0` | `0,0,0` | — |
| 聯集 | `127,127,127` | `127,127,127` | `127,127,127` | `0,0,0` |

**遮罩用另一個畫面**：主畫面 Gray Level 127、遮罩選 Skip 1 Dot 1V1H → 露出區 `127,127,127`，遮罩區 `(960,10)=255,255,255`、`(961,10)=0,0,0`、`(960,11)=0,0,0`，確實是棋盤交錯。

**編輯區不受影響**：開遮罩前後 48 格內容**完全相同**，週期仍是 `2×2`。

**關閉後完全還原**：整張畫面取樣雜湊，無遮罩基準 `20631022`、開啟再關閉後 `20631022`，**完全相同**。

**真實 UI 操作**（不是直接改物件）：點「啟用遮罩」→ 點 chip 取消第 1 份、選第 2、3 份 → 露出等份 `2,3`、chip 亮起 2 個、畫面邊界 `319/320` 與 `959/960` 正確、接縫處 `640` 無縫；用輸入框設 `pad = +5` → 露出起點 `315`（預期 315）。截圖確認。

三語（`zh-TW` / `en` / `zh-CN`）全部到位；console 全程無訊息。

### 順帶修掉

遮罩 chip 的 click handler 原本把選取物件的**參考**快取在閉包裡，外部若整個換掉 `hSel` / `vSel` 就會與畫面脫節。改成每次點擊都從 `pgMask` 取當下的物件。這是寫測試時踩到的。

---

## Pattern Generator 畫面產生器 (pattern) v1.8.0 — 2026-08-01

**判定依據（回溯補記）：** 本版早於 2026-08-02 的規則制定，當時未套用級別制，標題列因此沒有級別欄。以現行 `VERSIONING.md` 回溯判定為 **PATCH**：兩項改動都是把既有行為修正到應有狀態（準星補上邊界、資訊框改為貼合文字），沒有新增使用者能做的事，屬 **R1**。輸出會變，依 R1 應標 ⚠ 輸出變更。

🔴 依現行規則，本版的版號應為 **v1.7.1**。歷史版號不回溯調整，僅補記判定。

兩項**刻意偏離原程式**的修改，都是實機使用後提出的。程式碼註解與下面的說明都標了「本站設計」，不要誤以為是反組譯結果。

### 一、XY Coordinate 準星加邊界 — ★ 本站設計，與原程式不同

原程式對準星座標**完全沒有邊界檢查**（`sub` / `add` 之後直接重繪），準星可以一路移到任意遠、再也找不回來。v1.6.0 為了忠實還原把 clamp 拿掉了。

現在改成：**允許超出畫面，但四邊各最多 10 px**。

實作上刻意用**夾住（clamp）**而不是「拒絕移動」——Shift 步進是 16，一次就會跨過 10，如果用拒絕移動，最後那 10 px 會永遠到不了。

> **關於「10」的單位**：準星是 1 px 寬的線，畫面上也沒有其他「格」的單位可對應，所以理解為 **10 px**。

四方向 × 兩種步進實測（畫面 1920 × 1080，合法座標 0–1919 / 0–1079）：

| 操作 | 起點 | 最終座標 | 預期 | |
|---|---|---|---|---|
| `←` 按 20 次（1 px）| x = −5 | **−10** | −10 | ✔ |
| `←` 按 5 次（Shift 16 px）| x = −5 | **−10** | −10 | ✔ |
| `→` 按 20 次（1 px）| x = 1924 | **1929** | 1929 | ✔ |
| `→` 按 5 次（Shift 16 px）| x = 1924 | **1929** | 1929 | ✔ |
| `↑` 按 20 次（1 px）| y = −5 | **−10** | −10 | ✔ |
| `↑` 按 5 次（Shift 16 px）| y = −5 | **−10** | −10 | ✔ |
| `↓` 按 20 次（1 px）| y = 1084 | **1089** | 1089 | ✔ |
| `↓` 按 5 次（Shift 16 px）| y = 1084 | **1089** | 1089 | ✔ |

資訊框的座標跟著實際位置走，超出時照樣顯示：左上到底 ` -9, -9`、右下到底 `1930,1090`（資訊框是 1-based，所以比內部座標大 1）。

### 二、左上角資訊框改成貼合文字 — ★ 本站設計，與原程式不同

原程式的 Panel1 是固定 `180 × 25`，文字短的時候右邊空一大片；在 XY Coordinate 這種畫面還會蓋掉旁邊的內容。**位置（Left=1 Top=1）、黑底、白色 Arial 粗體都保留**，只把尺寸改成貼合文字。

實測框寬（v1.7.0 一律 180 × 25）：

| 畫面 | 內容 | 框寬 | 高 |
|---|---|---|---|
| Gray Level / Skip 系列 / Line 系列 / Flicker | `127` | 180 → **35 px** | 25 → **21 px** |
| XY Coordinate | `960,540` | 180 → **66 px** | **21 px** |
| XY（超出到底）| `1930,1090` | **84 px** | **21 px** |
| Cross Talk | `127,  0,Outer Color` | 180 → **150 px** | **21 px** |
| Cross Talk（最長項目）| `127,  0,Inner Position` | 180 → **168 px** | **21 px** |
| Checker | `  8 Checker 00:00:00` | 180 → **162 px** | **21 px** |

**順帶修掉「會擋到其他的字」的真正原因**：XY Coordinate 的 canvas 上原本還被我多畫了一行座標文字在 (8, 6)，正好被資訊框整個蓋住，變成看不見的重複內容。原程式沒有這行——它就是靠資訊框顯示座標。已移除。截圖確認現在 XY 畫面左上角只剩一個 66 px 的小框，準星清楚可見。

主頁控制區的回顯框也一併取消固定寬度。

### 對照表更正（避免先前的紀錄變成謊報）

v1.6.0 的按鍵對照表與 v1.7.0 的說明裡，XY Coordinate 那一列寫的是「準星沒有邊界限制（原程式即如此）」。**那是 v1.6.0／v1.7.0 當下的行為，自本版起不再成立**：現在是「可超出畫面，四邊各最多 10 px」，且這是本站設計而非原程式行為。畫面上的鍵盤說明區文字也已同步改成「準星可以移出畫面，但四邊各最多超出 10 px（本站設計；原程式沒有邊界限制）」，三語都更新。

按鍵的**有效／無效**判定完全沒有變動——XY 的四個方向鍵與 Shift 組合仍然全部有效，只是移動範圍被夾住，所以 v1.6.0 那張 646 格的表其餘部分仍然成立。

### 驗證

四方向邊界如上表；各畫面框寬如上表；XY 截圖確認不再有被遮住的重複文字；三語（`zh-TW` / `en` / `zh-CN`）鍵盤說明都含新的邊界說明；回歸：sub-pixel 模式下資訊框仍為 `display:none`、`scrollHeight = clientHeight = 1080`（無捲軸）、Checker 資訊框仍正常（`  8 Checker 00:00:00`，162 px）。console 全程無訊息。

---

## Pattern Generator 畫面產生器 (pattern) v1.7.0 — 2026-08-01

**判定依據（回溯補記）：** 本版早於 2026-08-02 的規則制定，當時未套用級別制，標題列因此沒有級別欄。以現行 `VERSIONING.md` 回溯判定為 **MINOR**：資訊框是新增的顯示能力，既有操作不變。

補上左上角資訊框。這個先前已經有規格卻沒實作。

### 規格來源

`UpdateInfoPanel` **0x40201c 整段讀到 `ret`**（123 條指令）。區間判斷與格式字串：

| mode | 格式字串（位址）| 參數 |
|---|---|---|
| < 200 | — | 隱藏（`Visible = False`）|
| 200–399 | `%3d`（0x472400）| 灰階 `[0x3c0]` |
| 400–499 | `%3d,%3d,%s`（0x472404）| 外框階 `[0x3c0]`、內框階 `[0x3d4]`、調整項目名稱 |
| 500–599 | `%3d,%3d`（0x47240f）| **`[0x3c4]+1`、`[0x3cc]+1`** |
| ≥ 600 | `%3d Checker %02d:%02d:%02d`（0x472417）| 格數、時、分、秒 |

兩個先前的摘要沒寫到、這次才讀出來的細節：

- **XY 的座標是 +1 的**（`inc ecx` / `inc edx` 在 0x4020fc、0x402104），也就是顯示 1-based 座標。準星畫在 `W/2−1` 但資訊框顯示 `W/2`。
- 調整項目名稱表在 **0x472314**，四個字串是 `Outer Color` / `Inner Color` / `Inner Size` / `Inner Position`。

### Checker 的計時器

`Timer1Timer` **0x401b68**：

```
sec = GetTickCount() / 1000
[0x3e8] = sec - [0x3e0]          ; [0x3e0] = 起算基準
if ([0x3e8] != [0x3e4]) { [0x3e4] = [0x3e8]; UpdateInfoPanel(); }
```

- **起算點在 Checker 的繪圖函式結尾**（0x40648b）：把 `[0x3e0]` 設成當下秒數、`[0x3e4]` 清 0、啟用 Timer1、呼叫 UpdateInfoPanel。所以**每次重繪 Checker（包含按 ↑↓ 改格數）計時都會歸零**，這是原程式行為。
- Timer1 在 DFM 裡**沒有 Interval 屬性** → Delphi 預設 **1000 ms**，每秒更新一次。
- 附帶一提：UpdateInfoPanel 會把 `[0x3e8]` 取餘數後寫回，但因為 Timer 每次都從 tick 重算，不會累積誤差。

### 外觀（照 DFM 的 Panel1 抄，沒有自己設計）

```
TPanel Panel1
  Left = 1              Top = 1
  Width = 180           Height = 25
  Align = alCustom      AutoSize = True
  BevelOuter = bvNone   Color = clBlack
  Font.Charset = ANSI_CHARSET
  Font.Color = clWhite  Font.Height = -16
  Font.Name = 'Arial'   Font.Style = [fsBold]
  Visible = False
```

實測我們的實作：`left=1 top=1`、`180×25`、背景 `rgb(0,0,0)`、文字 `rgb(255,255,255)`、`700 16px Arial`、`border=none` — 與上表逐項相符。

**顯示位置的判斷**：資訊框只畫在**全畫面 overlay** 裡（那才是原程式的使用情境，而且它本來就會蓋住畫面左上角）。預覽區**不畫**——預覽的用途是看整張 pattern 的版面，疊一個 180 px 的框上去會佔掉不成比例的面積。改成在主頁控制區另外用同樣的黑底白字樣式**回顯**同一段文字，不進全畫面也看得到數值，且不污染預覽。

### 34 個畫面的資訊框內容（全部實測）

**隱藏 17 個**（mode < 200）：`horiz9/64/256`、`vert9/64/256`、`center9/64/256`、`aligncenter`、`colortest`、`character`、`lum_compare`、`lum_divide`、`resptime`、`smpte`、`skip1dot2gray` — 全部 `DOM顯示=false`，與原程式一致。

**顯示 17 個**：

| 畫面 | 實際內容 | 畫面 | 實際內容 |
|---|---|---|---|
| gray | `127` | vline1 | `127` |
| skip1_1v1h | `127` | vline2 | `127` |
| skip1_1v2h | `127` | vsubline | `127` |
| skip2_2v1h | `127` | flicker1 | `127` |
| skip2_2v2h | `127` | flicker2 | `127` |
| skip2_2v12h | `127` | crosstalk | `127,  0,Outer Color` |
| skipsub | `127` | xy | `960,540` |
| hline1 | `127` | checker | `  8 Checker 00:00:00` |
| hline2 | `127` | | |

`%3d` 的右對齊補空白有做出來：內框階 0 顯示成 `  0`、格數 8 顯示成 `  8`。

### 即時更新（實測前後文字）

| 畫面 | 操作 | 前 → 後 |
|---|---|---|
| Gray Level | `↑` | `127` → `128` |
| Gray Level | `Shift+↑` | `127` → `143` |
| Gray Level | `Home` | `127` → `255` |
| Checker | `↑` | `  8 Checker 00:00:00` → ` 16 Checker 00:00:00` |
| Checker | `↑`×3 | `  8 …` → ` 64 …` |
| XY | `Shift+→` | `960,540` → `976,540` |
| XY | `Shift+↑` 再 `←` | `960,540` → `959,524` |
| Cross Talk | `↑` | `127,  0,Outer Color` → `128,  0,Outer Color` |
| Cross Talk | `Space` | `…,Outer Color` → `…,Inner Color` |
| Cross Talk | `Space`×3 | `…,Outer Color` → `…,Inner Position` |
| Cross Talk | `Space` 後 `↑` | `127,  0,Outer Color` → `127,  1,Inner Color` |

**計時器實測**：進入 Checker 讀到 `  8 Checker 00:00:00`，等待後再讀 `  8 Checker 00:00:17`，確實在跳；切到 Gray Level 後計時器停止（資訊框變成 `127`）。

### 順手修掉的 bug

**`pgSelectPattern('checker')` 沒有把格數重置**。原程式 `Checker1Click` 進入點有 `[0x424] = 2`（n = 8）與 `[0x420] = 0`，我們漏了，導致切走再切回來會沿用上次的格數。是在驗證資訊框時發現的（重新進入 Checker 卻顯示 ` 16`）。

### 順手補的（來自這輪的全面盤點）

- **按任意鍵中止 Response Time**：原程式 FormKeyDown 開頭會寫 `[0x408]`，而 Response Time 的等待迴圈條件是 `until [0x408]<>0 or [0x40c]<>0`。
- **滑鼠雙擊中止 Response Time**：`FormDblClick`（0x401f94）整個函式就只有 `[0x40c] = 1` 一行，用途就是中止量測。

兩者都已實作並實測（Run 後按鍵 → `run=false`；再 Run 後雙擊 → `run=false`）。

### 「原程式有、我們沒有」盤點清單

這輪順便把使用者看得到的東西掃了一遍：

| 項目 | 原程式 | 我們 | 說明 |
|---|---|---|---|
| **開機／標題畫面** | 有（`Timer2Timer` 0x401ba0）| **沒有** | 啟動後顯示程式名稱與版本字樣的畫面。字串內含廠商名，依保密規定**不實作**。 |
| **Skip 1 Dot 2 Gray 的參數對話框** | 有（`TS1D2G`）| **沒有** | 可調 Pattern#1／#2 的顏色與 level（預設 Red/255、Green/255）。我們目前寫死預設值。**這是真正的功能缺口，建議下一版補。** |
| Response Time 對話框 | 獨立對話框 | 控制區欄位 | 功能等價（顏色／level／Timming／Run），形式不同。 |
| 按任意鍵／雙擊中止 Response Time | 有 | **本版補上** | — |
| 選單快捷鍵 | **沒有** | 沒有 | DFM 中 `ShortCut` 出現 **0 次**，確認原程式選單本來就沒有快捷鍵，我們沒漏。 |
| 視窗填滿螢幕 | `FormCreate` 設成螢幕寬高 | 全畫面 overlay | 等效。 |
| 啟動時的空白畫面 | `mode = 0`，不畫任何 pattern | 我們啟動是 sub-pixel 編輯器 | 本站額外功能，不需複製。 |
| Timer3（Response Time 閃爍）| 有 | 有等效實作 | — |

### 驗證

三語（`zh-TW` / `en` / `zh-CN`）的標題與「此畫面不顯示」說明都正確；資訊框內容本身**照原程式格式不翻譯**。回歸：sub-pixel 模式下 overlay 內**沒有** `pg-info`，切到 Gray Level 才出現；`scrollHeight = clientHeight = 1080`（無捲軸）。console 全程無訊息。Cross Talk 的資訊框已截圖確認（左上角黑底白字 `127,  0,Outer Color`）。

**限制照舊**：按鍵透過 `dispatchEvent` 觸發（此環境送不出真實按鍵），且仍無法進入真・全螢幕（`requestFullscreen()` 一律 `TypeError: Permissions check failed`）。

---

## Pattern Generator 畫面產生器 (pattern) v1.6.0 — 2026-08-01

**判定依據（回溯補記）：** 本版早於 2026-08-02 的規則制定，當時未套用級別制，標題列因此沒有級別欄。以現行 `VERSIONING.md` 回溯判定為 **PATCH**：把鍵盤處理整段掃完並修正為與原程式一致，屬 **R1** 的修正，沒有新增使用者能做的事。輸出會變，依 R1 應標 ⚠ 輸出變更。

🔴 依現行規則，本版的版號應為 **v1.5.1**。歷史版號不回溯調整，僅補記判定。

把原程式的鍵盤處理**整段掃完**，34 個畫面 × 19 個按鍵／組合逐格實測。

### 反組譯範圍

`FormKeyDown` 0x4021d0 ~ 0x402f48，共 900 條指令一路讀到 `ret`，把每一個 `cmp word ptr [ecx], 0xNN`（按鍵）與 `test byte ptr [ebp+8], 1`（Shift）分支全部列出。

**確定的事實**：全段**只有 Shift 一種修飾鍵**（`[ebp+8]` 的 bit0），沒有任何 bit1(Ctrl) 或 bit2(Alt) 的檢查 → 原程式沒有 Ctrl／Alt 組合鍵。處理的按鍵只有 `Esc`、`Space`、`End`、`Home`、`←`、`↑`、`→`、`↓`、`1`~`8`，沒有 PageUp／PageDown／Enter／字母鍵。

### XY Coordinate 的 Shift 步進（點名項目）

四個方向各自的分支都是同一個形狀，`0x10` 就是 Shift 時的步進：

```
00402b0f  jne 0x402b36                 ; ↑ 分支
00402b11  test byte ptr [ebp + 8], 1   ; Shift?
00402b1d  je  0x402b26
00402b1f  mov eax, 0x10                ;  ← 有 Shift：16
00402b26  mov eax, 1                   ;  ← 沒 Shift：1
00402b2b  sub dword ptr [ebx + 0x3cc], eax
```

`↓` 在 0x402b3c/0x402b4a、`←` 在 0x402b64/0x402b72、`→` 在 0x402b8c/0x402b9a，值都是 `0x10` 與 `1`。**沒有任何邊界檢查**（`sub`／`add` 之後直接重繪），所以準星可以一路移出畫面——這就是「範圍更大」。v1.5.0 的 clamp 已移除。

實測（畫面 1920 × 1080，準星起點 960,540）：

| 按鍵 | 結果 | 按鍵 | 結果 |
|---|---|---|---|
| `→` | x 960 → **961** | `Shift+→` | x 960 → **976** |
| `←` | x 960 → **959** | `Shift+←` | x 960 → **944** |
| `↑` | y 540 → **539** | `Shift+↑` | y 540 → **524** |
| `↓` | y 540 → **541** | `Shift+↓` | y 540 → **556** |
| 連按 100 次 `Shift+←` | x = **−640**（已移出畫面左緣，符合原程式無邊界）| | |

### 其他有 Shift 的地方

| 畫面群 | 有 Shift 的鍵 | 一般步進 | Shift 步進 |
|---|---|---|---|
| Gray Level / Skip / Line / Flicker | `↑` `↓`（灰階）| 1 | **16** |
| Cross Talk（四個模式）| `↑` `↓` `←` `→` | 1 | **16** |
| XY Coordinate | `↑` `↓` `←` `→` | 1 | **16** |
| LUMINACE COMPARE | `←` `→`（起始值）| 1 | **7** |
| LUMINACE DIVIDE | `↑` `↓`（欄數）| 1 | **7** |
| Horizontal / Vertical / Center | 完全不讀 Shift | — | — |
| Color Test / SMPTE / Checker / Character | 完全不讀 Shift | — | — |

實測佐證：Gray Level `↑` 127→128、`Shift+↑` 127→**143**；LUMINACE COMPARE `Shift+→` 起始值 248→**255**；DIVIDE `Shift+↑` N 8→**15**。

### 這一版補掉的落差

1. **Cross Talk 的內框模型整個換掉**。原程式是 `left / top / width / height` 四個獨立值，而且成長方向不對稱：`↑` 是「上緣往上、下緣不動」（`[0x41c] += s` 同時 `[0x414] -= s`）、`→` 是「右緣往右、左緣不動」（`[0x418] += s`）；縮小時有 `0x18`(24 px) 下限，且 `↓` 要先確認高度 > 24 才會動 top。v1.5.0 用的是「置中正方形 + 一個尺寸值」，跟原程式差很多。現在改成四個獨立值（內部存比例、UI 顯示像素），鍵盤行為與下限完全照原程式。
2. **Center 群按 `5`**。原程式在重繪的分派點上對 Center 群有一道 `cmp word ptr [ecx], 0x35 / je 離開` 的守衛——欄位會被改掉但畫面不重繪。現在直接當成無作用，可見結果相同，也不會留下看不見的狀態。
3. **XY Coordinate 進入時準星沒有回到中心**。原程式進入點會設回 `W/2−1, H/2−1`，v1.5.0 漏了，切走再切回來會沿用上次的位置。
4. **XY 的邊界限制移除**（見上）。

### 完整對照表（34 畫面 × 19 按鍵，全部實測）

`✔` = 有作用，`·` = 無作用。**每一格都與反組譯出來的原程式行為逐一比對，34 × 19 = 646 格全部一致，不一致 0 格。**

```
畫面           1  2  3  4  5  6  7  8  ↑  ↓  ←  →  Hm En Sp S↑ S↓ S← S→
horiz9         ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ·  ·  ·  ·  ✔  ✔  ✔  ·  ·
horiz64        ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ·  ·  ·  ·  ✔  ✔  ✔  ·  ·
horiz256       ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ·  ·  ·  ·  ✔  ✔  ✔  ·  ·
vert9          ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ·  ·  ·  ·  ✔  ✔  ✔  ·  ·
vert64         ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ·  ·  ·  ·  ✔  ✔  ✔  ·  ·
vert256        ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ·  ·  ·  ·  ✔  ✔  ✔  ·  ·
center9        ✔  ✔  ✔  ✔  ·  ✔  ✔  ✔  ✔  ✔  ·  ·  ·  ·  ✔  ✔  ✔  ·  ·
center64       ✔  ✔  ✔  ✔  ·  ✔  ✔  ✔  ✔  ✔  ·  ·  ·  ·  ✔  ✔  ✔  ·  ·
center256      ✔  ✔  ✔  ✔  ·  ✔  ✔  ✔  ✔  ✔  ·  ·  ·  ·  ✔  ✔  ✔  ·  ·
colortest      ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ✔  ·  ·  ·  ·
smpte          ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ✔  ·  ·  ·  ·
gray           ✔  ✔  ✔  ✔  ·  ✔  ✔  ✔  ✔  ✔  ·  ·  ✔  ✔  ·  ✔  ✔  ·  ·
skipsub        ✔  ✔  ✔  ✔  ·  ✔  ✔  ✔  ✔  ✔  ·  ·  ✔  ✔  ✔  ✔  ✔  ·  ·
hline1         ✔  ✔  ✔  ✔  ·  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ·  ✔  ✔  ✔  ✔
hline2         ✔  ✔  ✔  ✔  ·  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ·  ✔  ✔  ✔  ✔
flicker1       ✔  ✔  ✔  ✔  ·  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ·  ✔  ✔  ✔  ✔
flicker2       ✔  ✔  ✔  ✔  ·  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ·  ✔  ✔  ✔  ✔
skip1_1v1h     ✔  ✔  ✔  ✔  ·  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔
skip1_1v2h     ✔  ✔  ✔  ✔  ·  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔
skip2_2v1h     ✔  ✔  ✔  ✔  ·  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔
skip2_2v2h     ✔  ✔  ✔  ✔  ·  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔
skip2_2v12h    ✔  ✔  ✔  ✔  ·  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔
vline1         ✔  ✔  ✔  ✔  ·  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔
vline2         ✔  ✔  ✔  ✔  ·  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔
vsubline       ✔  ✔  ✔  ✔  ·  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔
crosstalk      ✔  ✔  ✔  ✔  ·  ✔  ✔  ✔  ✔  ✔  ·  ·  ✔  ✔  ✔  ✔  ✔  ·  ·
xy             ✔  ✔  ✔  ✔  ·  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ·  ·  ✔  ✔  ✔  ✔  ✔
checker        ·  ·  ·  ·  ·  ·  ·  ·  ✔  ✔  ·  ·  ·  ·  ✔  ✔  ✔  ·  ·
character      ✔  ✔  ✔  ✔  ·  ✔  ✔  ✔  ·  ·  ·  ·  ·  ·  ✔  ·  ·  ·  ·
lum_compare    ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ·  ·  ✔  ✔  ·  ·  ✔  ·  ·  ✔  ✔
lum_divide     ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ✔  ·  ·  ·  ·  ✔  ✔  ✔  ·  ·
aligncenter    ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·
resptime       ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·
skip1dot2gray  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·
```

各格的原程式行為（同一鍵在不同畫面做不同的事）：

| 畫面群 | `1`–`8` | `↑` `↓` | `←` `→` | `Home` `End` | `Space` |
|---|---|---|---|---|---|
| Horizontal / Vertical | 選色，**含 5**（index 4 = 回 4 帶 W/R/G/B，其餘為單色滿版漸層）| 切 9／64／256 | 無 | 無 | 漸層方向反轉 |
| Center | 同上但 **5 被守衛擋掉** | 切 9／64／256 | 無 | 無 | 漸層方向反轉 |
| Color Test / SMPTE | 無 | 無 | 無 | 無 | 切版面 |
| Gray Level | 選色，排除 5 | 灰階 ±1／±16 | 無（無變體）| 255／0 | **無**（不讀反相旗標）|
| Skip SubPixel | 選色，排除 5 | 灰階 ±1／±16 | 無（無變體）| 255／0 | **本站擴充** |
| Horizontal Line / Flicker | 選色，排除 5 | 灰階 ±1／±16 | 切變體 | 255／0 | **無**（不讀反相旗標）|
| Skip 1 Dot / Skip 2 Dot / Vertical Line | 選色，排除 5 | 灰階 ±1／±16 | 切變體（2 或 3 態）| 255／0 | 反相 |
| Cross Talk | 依模式（Outer／Inner Color 時選色，排除 5）| 依模式 ±1／±16 | 僅 Inner Size／Position 模式 | 依模式 255／0 | 切換調整項目 |
| XY Coordinate | 選色，排除 5 | 準星 ±1／±16 px | 準星 ±1／±16 px | 無 | 底色與準星對調 |
| Checker | **無**（純黑白）| 格數上下一段 | **無** | 無 | 黑白反相 |
| Character | 選色，排除 5 | 無 | 無 | 無 | 文字灰階分佈三態 |
| LUMINACE COMPARE | 選色，**含 5** | 無 | 起始值 ±1／±7 | 無 | 6-bit／8-bit |
| LUMINACE DIVIDE | 選色，**含 5** | 欄數 ±1／±7 | 無 | 無 | 6-bit／8-bit |
| Align Center / Response Time / Skip 1 Dot 2 Gray | 無 | 無 | 無 | 無 | 無 |

**本站擴充（原程式沒有，另外標示）**：Skip SubPixel 的 `Space` 相位切換。原程式的 Skip SubPixel 繪圖函式不讀反相旗標，這個是先前為了「兩種相位都要拿得到」而加的，表中的 `skipsub / Sp ✔` 屬於此類。

### 8 張畫面的按鍵前後實際像素

| 畫面 | 按鍵 | 前 → 後 |
|---|---|---|
| Horizontal 9 | `2` | 右上 `255,255,255` → **`0,255,0`**（切單色 G 漸層）|
| Horizontal 9 | `5` | 第 2 帶 `255,0,0` → `255,0,0`（已在 4 帶模式，維持）|
| Vertical 9 | `3` | 左下 `223,223,223` → **`0,0,223`**（切單色 B 漸層）|
| Center 9 | `5` | 中心 `223,223,223` → `223,223,223`（**原程式守衛，無作用**）|
| Center 9 | `2` | 中心 `223,223,223` → **`0,223,0`** |
| Gray Level | `↑` / `Shift+↑` | `127,127,127` → `128,128,128` / **`143,143,143`** |
| XY Coordinate | `→` / `Shift+→` | x 960 → 961 / **976** |
| LUMINACE DIVIDE | `↑` | 第 2 欄 `36,36,36` → **`31,31,31`**（N 8→9）|
| Checker | `↑` | (130,10) `255,255,255` → **`0,0,0`**（n 8→16，格寬 240→120）|
| Checker | `1` | `255,255,255` → `255,255,255`（**原程式無作用**）|
| Color Test | `Space` | (300,10) `0,0,255` → **`135,120,0`**（切漸層版面）|
| Color Test | `1` | `0,0,255` → `0,0,255`（**原程式無作用**）|

### 其他

畫面上的鍵盤說明區改成完整版：每張畫面列出自己實際可用的鍵與修飾鍵，包含「此畫面 `1`–`8` 無作用」「Center 按 5 沒有作用」「準星沒有邊界限制」「此畫面的按鍵不吃 Shift」這類說明，並把本站擴充另外標記。Cross Talk 的參數欄位改成 Inner Width／Height／Left／Top 四個像素值。三語。

console 全程無訊息；Cross Talk 的 Inner Size 模式說明與四個新欄位已截圖確認。

### ⚠️ 仍未驗證的部分

**按鍵是用 `dispatchEvent` 觸發的，不是實體鍵盤。** 本工作階段送不出真實按鍵到頁面（`1`、`7`、`↑` 這類鍵，`document` 的 keydown 監聽器收不到，只有 `Escape`／`Return` 例外），所以走的是 `pgHandlePatternKey` 這支**完全相同的處理器**，能證明分派邏輯正確，但不能證明實體鍵盤按下去會被瀏覽器送到頁面。另外全程仍未能進入真・全螢幕（`requestFullscreen()` 一律 `TypeError: Permissions check failed`），上述測試都在 overlay 覆蓋整個 viewport 的狀態下完成。

---

## Pattern Generator 畫面產生器 (pattern) v1.5.0 — 2026-08-01

**判定依據（回溯補記）：** 本版早於 2026-08-02 的規則制定，當時未套用級別制，標題列因此沒有級別欄。以現行 `VERSIONING.md` 回溯判定為 **MINOR**：鍵盤操作是先前不存在的操作方式，屬新增能力。

三件事：預覽區現況確認（結論是本來就對）、全畫面鍵盤補齊、依量測結果做效能優化。

### 一、非週期畫面的預覽區 — 確認已符合，未做修改

Bruce：「非 4x4 週期圖的 pattern，預覽區顯示目前的顯示方式，可以看到整個 pattern。」

實測確認**現況已經是這樣**，因此沒有改動。預覽是用「預覽自己的尺寸」重新畫一整張 pattern（不是裁切、也不是縮圖取樣），所以看得到全貌。9 點取樣（四角＋四邊中點＋正中）結果：

| 畫面 | 預覽尺寸 | 9 點取樣到的相異色數 |
|---|---|---|
| Cross Talk | 1086 × 611 | 2（外圍灰 + 中央黑方塊）|
| SMPTE | 1086 × 611 | 4 |
| Align Center | 1086 × 611 | 3 |
| Character | 1086 × 611 | 7 |
| Color Test | 1086 × 611 | 3 |
| Horizontal 64 | 1086 × 611 | 9 |
| Center 9 | 1086 × 611 | 2 |

另附 SMPTE 預覽截圖佐證：75% 彩條、色度條、灰階斜坡、PLUGE 段落全部在預覽裡完整呈現。

**順帶修掉一個既有問題**：週期圖的預覽相位跟全畫面對不起來。`1V 2H`／`2V 2H`／`2V (1+2)H` 的起始相位含畫面高度 H，預覽用自己的高度（611）算、全畫面用 958 算，兩邊差了 1–2 px：

| 畫面 | 全畫面首列 R | 預覽首列 R | 一致？ |
|---|---|---|---|
| Skip 1 Dot ▸ 1V 2H | `127,127,0,0` | `0,0,127,127` | ✗ |
| Skip 2 Dot ▸ 2V 2H | `127,0,0,127` | `127,0,127,0` | ✗ |
| Skip 2 Dot ▸ 2V (1+2)H | `0,0,127,127` | `0,127,0,127` | ✗ |
| Skip 1 Dot ▸ 1V 1H | `127,0,127,0` | `127,0,127,0` | ✓（不含 H）|

改法與效能優化同一招：週期圖的預覽直接平鋪「全畫面相位」的重複單元，相位就一定一致。非週期圖維持原本的逐張重畫。

### 二、全畫面鍵盤 — 依原程式 FormKeyDown 補齊，每張畫面各自不同

完整反組譯了原程式的 `FormKeyDown`（0x4021d0 ~ 0x402f48，讀到 `ret`），照它的分派表實作。**沒有統一成一套。**

先說 v1.4.0 為什麼會覺得「按了沒反應」，有三個原因：

1. **多數畫面根本不使用顏色 index**。Checker 是純黑白、SMPTE 與 Color Test 用自己的色表，按 1~8 本來就不會變（原程式也一樣）。
2. **Horizontal / Vertical / LUMINACE 的單色模式完全沒實作**。原程式這幾張畫面用 `[0x3bc] == 4`（Black）當哨兵：等於 4 是「4 帶 W/R/G/B」，不等於 4 就切成**整張單色漸層**。v1.4.0 只做了 4 帶模式，所以按 1~8 畫面不動。這版補上了。
3. **↑↓ 的行為原本就搞反了**。原程式在 Skip／Line 群是 **←→ 切變體、↑↓ 調灰階**，只有 Horizontal 群才是 ↑↓ 切變體。v1.3.0 起一律用 ↑↓ 切變體，是錯的。

完整按鍵表（`s` = 一般 1、按住 Shift 為 16）：

| 畫面群 | 1–8 | ↑ / ↓ | ← / → | Home / End | Space |
|---|---|---|---|---|---|
| Horizontal / Vertical / Center | 選色，**含 5**（= 回到 4 帶 W/R/G/B）| 切 9 / 64 / 256 | — | — | 漸層方向反轉 |
| Color Test / SMPTE | — | — | — | — | 切版面 |
| Gray Level / Skip 1 Dot / Skip 2 Dot / Skip SubPixel / Horizontal Line / Vertical Line / Sub Line / Flicker | 選色，**排除 5** | 灰階 ± s | 切變體 | 灰階 = 255 / 0 | 反相 |
| Cross Talk | 依模式選色 | 依模式調整 | 依模式調整 | 依模式 | 切換調整項目（Outer Color → Inner Color → Inner Size → Inner Position）|
| XY Coordinate | 選色，排除 5 | 準星上下 ± s px | 準星左右 ± s px | — | 反相 |
| Checker | **無作用** | 格數上下一段（2…256）| **無作用** | **無作用** | 黑白反相 |
| Character | 選色，排除 5 | — | — | — | 文字灰階分佈三態 |
| LUMINACE COMPARE | 選色，含 5 | — | 起始值 ±1（**Shift 為 ±7**）| — | 6-bit / 8-bit |
| LUMINACE DIVIDE | 選色，含 5 | 欄數 ±1（**Shift 為 ±7**）| — | — | 6-bit / 8-bit |
| Align Center / Response Time / Skip 1 Dot 2 Gray | 原程式只吃 Esc，全部無作用 | | | | |

**原程式中按了會改狀態、但畫面不會變的組合**（繪圖函式不讀該欄位）也照原樣做成無作用，不假裝有效：Gray Level 的 Space 與 ←→、Horizontal Line 與 Flicker 的 Space。唯一例外是 **Skip SubPixel 的 Space**：原程式不讀反相旗標，但相位切換是先前指定要有的功能，保留為本工具擴充。

順帶修掉：**切變體時不再重設顏色與灰階**（原程式切變體只動 variant）。以及 **Cross Talk 的調整項目、LUMINACE 的 6-bit 與起始值在切換畫面時會重設**——原程式每個畫面的進入點都會清掉共用欄位 `[0x3dc]`，那個欄位在 Cross Talk 是「編輯項目」、在 LUMINACE 是「6-bit 旗標」，不重設就會把舊值帶過去（實測到 `lum_compare` 的起始值被前一張畫面的 6-bit 狀態污染成 57）。

畫面上新增**鍵盤說明區**（主頁控制區與全畫面面板各一份，三語），直接列出「目前這張畫面哪些鍵有效」，包含「此畫面 1–8 無作用」這種說明。

其他跟著補的繪圖行為：Horizontal / Vertical 的單色滿版模式與漸層反向、XY Coordinate 的準星改用選定顏色（反相時底色與準星對調）、Character 的三種文字灰階分佈、LUMINACE 的單列模式與 6-bit 值域。

### 三、效能 — 先量再砍

先拆解量測（同條件：overlay 關閉、JIT 熱身後取 5 次中位數）：

| 畫面 | preview | 週期偵測 | pgSelectPattern 總計 |
|---|---|---|---|
| Skip 1 Dot 1V1H | **296 ms** | 53 ms | 200 ms |
| Skip SubPixel | **357 ms** | 59 ms | 348 ms |
| SMPTE | 5 ms | **144 ms** | 89 ms |
| Cross Talk | 0 ms | 6 ms | 94 ms |

量出來的瓶頸跟原先猜的不同：**週期圖的大頭是預覽繪製（296–357 ms），不是週期偵測**。預覽是逐像素跑 pattern 公式畫 0.66 M 像素。另外週期偵測本來不論結果如何都要畫滿 8 條寬條。

兩項優化：

1. **週期圖的預覽改用重複單元平鋪**（typed array 整列複製），不再逐像素跑公式。順便讓相位與全畫面一致（見第一節）。
2. **週期偵測逐條淘汰、提早收工**：一條寬條就把 1/2/4 三個候選全打掉時立刻停手，不必畫完 8 條。

優化後（同條件、同量法）：

| 畫面 | preview | 週期偵測 | 總計 |
|---|---|---|---|
| Skip 1 Dot 1V1H | 296 → **45 ms** | 53 → 46 ms | 200 → **52 ms** |
| Skip SubPixel | 357 → **43 ms** | 59 → 54 ms | 348 → **93 ms** |
| SMPTE | 5 → 3 ms | 144 → **4 ms** | 89 → **47 ms** |
| Cross Talk | 0 → 0 ms | 6 → 10 ms | 94 → **42 ms** |

**關於「不用全掃、掃部分就知道規律」**：判斷「已知是週期圖的重複單元長什麼樣」確實只要看一小塊，這部分本來就只讀左上角 8×8。但判斷「**是不是**週期圖」不能只看局部——Flicker 的欄界只出現在 x = W/2 附近、Cross Talk 的內框邊界只在中央、Checker 的格界隨 n 分布，只看小區域會把它們誤判成週期圖。所以偵測仍需涵蓋整個 x 範圍，用的是「8 條整個畫面寬、每條 6 列」的寬條（成本 O(W×6×8)，不是 O(W×H)），再加上這次的提早收工。**不能只看小區域的就是這幾張**：Flicker、Checker、Cross Talk、XY Coordinate、Align Center，它們的特徵尺寸由畫面尺寸決定。

**砍完的結果與砍之前完全相同**（同樣 5 項逐格比對）：

| 畫面 | 週期 | 不符格數 | 編輯區 L1 |
|---|---|---|---|
| Skip 1 Dot ▸ 1V 1H | 2×2 | **0 / 48** | `[127,127,127] [0,0,0] [127,127,127] [0,0,0]` |
| Skip 1 Dot ▸ 1V 2H | 4×2 | **0 / 48** | `[127,127,127] [127,127,127] [0,0,0] [0,0,0]` |
| Skip SubPixel | 2×2 | **0 / 48** | `[0,127,0] [127,0,127] [0,127,0] [127,0,127]` |
| Vertical Line ▸ Sub Line | 2×1 | **0 / 48** | `[0,127,0] [127,0,127] [0,127,0] [127,0,127]` |
| Horizontal Line ▸ 2 line | 1×4 | **0 / 48** | 四格皆 `[127,127,127]` |

### 驗證

鍵盤逐項實測（按鍵 → 狀態 + canvas 實際像素）：

| 畫面 | 按鍵 | 結果 |
|---|---|---|
| Gray Level | `3` | ci 3→2，像素 `127,127,127` → `0,0,127` ✔ |
| Gray Level | `↑` / `Shift+↑` | level 127→128 / 127→143 ✔ |
| Gray Level | `Home` / `End` | level → 255 / 0 ✔ |
| Gray Level | `Space` | 無變化（原程式即無效）✔ |
| Checker | `1` | 無變化（原程式即無效）✔ |
| Checker | `↑` | n 8→16，格寬 240→120 ✔ |
| Checker | `Space` | 像素 `255,255,255` → `0,0,0` ✔ |
| Skip 1 Dot 1V1H | `→` | 切到 1V2H，**level 保留 127**，週期 2×2→4×2 ✔ |
| Skip 1 Dot 1V1H | `↑` | level 127→128（不是切變體）✔ |
| Horizontal 9 | `2` | 切單色 G，右上像素 → `0,255,0` ✔ |
| Horizontal 9 | `↑` | horiz9 → horiz64 ✔ |
| Character | `Space` | 上方像素 195 → 2（全亮 → 上暗下亮）✔ |
| SMPTE | `1` / `Space` | 無變化 / 版面 A→B，像素 `192,192,192` → `192,192,0` ✔ |
| XY Coordinate | `Shift+→` | 準星 x 960 → 976 ✔ |
| XY Coordinate | `2` | 準星 `255,255,255` → `0,255,0` ✔ |
| LUMINACE COMPARE | `→` / `Shift+→` | 起始值 248→249 / 248→255（步進 7）✔ |
| LUMINACE COMPARE | `2` | 切單列全高，下半像素 → `0,248,0` ✔ |
| LUMINACE DIVIDE | `↑` / `Space` | N 8→9 / 6-bit 切換 ✔ |
| Cross Talk | `Space` / `↑` | 調整項目 0→1 / Outer Level 127→128 且像素跟著變 ✔ |
| Align Center | `3` | 無變化（原程式只吃 Esc）✔ |

其餘：三語（Checker / Align Center 兩種說明各切 zh-TW / en / zh-CN 皆正確）；回歸（快速樣式仍切回 subpixel 模式、4×4 平鋪相符、`scrollHeight = clientHeight = 958` 無捲軸、右鍵選單 21 項、Esc 兩段仍為「先關選單、再離開全畫面」）；console 全程無訊息；鍵盤說明區已截圖確認。

### ⚠️ 未驗證的部分

**全畫面鍵盤沒有在「真・全螢幕」下驗證過。** 上面的鍵盤結果全部是在 overlay 覆蓋整個 viewport 的狀態下取得的，不是真的進入了全螢幕。試過的方法與結果：

| 方法 | 結果 |
|---|---|
| Chrome 擴充送 `Return`（焦點在「進入全畫面顯示」按鈕）| click 有觸發、overlay 有開，但 `requestFullscreen()` 回 **`TypeError: Permissions check failed`** |
| Chrome 擴充送 `space`（同上）| click 完全沒觸發 |
| Chrome 擴充**真實座標左鍵點擊**按鈕 | click 有觸發（overlay 開啟），`requestFullscreen()` 仍回 **`TypeError: Permissions check failed`** |
| 在 click handler 內**同步**呼叫（排除非同步破壞 user activation）| 同樣 `TypeError: Permissions check failed` |
| 作業系統層級送鍵 | 事件沒送達頁面；且瀏覽器在本工作階段只被授權為唯讀，明文禁止用這種方式對瀏覽器送鍵，已停用此路 |

結論是合成事件不被 Chrome 認可為 Fullscreen API 所需的 user activation。

**另外，本次連「真實按鍵」都送不進頁面**：Chrome 擴充送 `3`、`7`、`↑` 到頁面，`document` 上的 keydown 監聽器完全收不到（只有 `Escape`／`Return` 例外）。因此鍵盤驗證改用 `dispatchEvent` 觸發——走的是**完全相同的那一條 handler、同一段程式碼**，能證明邏輯正確，但**不能證明實體鍵盤在真・全螢幕下按下去會被瀏覽器送到頁面**。這一項需要 Bruce 手動進全螢幕實際按按看。

---

## Pattern Generator 畫面產生器 (pattern) v1.4.0 — 2026-08-01

**判定依據（回溯補記）：** 本版早於 2026-08-02 的規則制定，當時未套用級別制，標題列因此沒有級別欄。以現行 `VERSIONING.md` 回溯判定為 **MINOR**：編輯區與選單連動讓使用者多看得到一件事（選定畫面的實際重複排列），屬新增能力。

**Bruce 需求**：「如果在 Test Pattern Menu 裡面選擇了像是 Skip 1 dot 1v1h 這一類的 Pattern，它其實是重複性的 Pattern，也就是跟 Pixel-on-off 一樣。所以在 SubPixel 編輯區應該要顯示一樣的重複排列，包含選的灰階值。」

從測試畫面選單選了**週期塞得進 4 px × 4 列**的畫面時，上方 sub-pixel 編輯區會自動填成該畫面的**重複單元**（含當下灰階）；塞不進的則明確標示不適用並清空。

### 單一資料來源：編輯區的值直接從畫面的實際像素反推

這裡**沒有第二份週期定義**。流程是：

1. 用**同一支** `pgDrawPattern(ctx, W, H)`、**同一組 W/H**（`pgTargetSize()`，與 `pgRenderFill` 完全相同）把畫面畫到離屏 canvas；
2. **實測**它的週期（不是查表）；
3. 直接**讀該畫面左上角的像素**填進 `pgLevels`。

所以編輯區顯示的每一個數字都是全畫面上真正會出現的那個像素值，結構上不可能與 canvas 不同步。相位依賴畫面高度的那幾個變體（`1V 2H`、`2V 2H`、`2V (1+2)H` 的起始偏移含 H）因為用了同一組 W/H，相位也一致。

新增 `pgDrawSlice(cv, W, H, ox, oy, sw, sh)`：畫「邏輯尺寸 W×H 的畫面」中指定的一塊。向量繪圖靠 `ctx.translate(-ox,-oy)`，逐像素繪圖靠 `ctx.__pgOffX/__pgOffY`（`pgPixels` 加 3 行支援偏移；canvas 尺寸等於 W×H 時行為與原本完全相同）。

**週期偵測取樣方式**：8 條「整個畫面寬」的橫向寬條（每條 6 列），均勻分散在畫面上下。水平方向涵蓋**所有 x**，任何直向邊界（欄界、格界、線條、漸層階界）都逃不掉；垂直方向在 8 個位置各檢查 y、y+1、y+2、y+4，足以判定週期是否 ≤ 4。成本 O((W×6)×8) 而非 O(W×H)。只接受週期 1 / 2 / 4——其他週期（3、8、15…）在 4 px × 4 列內無法正確平鋪，一律歸為不適用。

### 判定表（實測值，畫面 1920 × 958 裝置像素）

**塞得進 4 px × 4 列 — 13 項**

| 畫面 | 實測週期（水平 × 垂直） | 依實作邏輯 |
|---|---|---|
| Gray Level | 1 px × 1 列 | 整面單色 |
| Skip 1 Dot ▸ 1V 1H | **2 px × 2 列** | `(x+y) mod 2` → pixel 棋盤 |
| Skip 1 Dot ▸ 1V 2H | **4 px × 2 列** | `(x−2y) mod 4 ∈ {0,1}` → 水平 2 亮 2 暗、垂直每列反相 |
| Skip 2 Dot ▸ 2V 1H | **2 px × 4 列** | `(x + ⌊y/2⌋) mod 2` → 每 2 列才換相位 |
| Skip 2 Dot ▸ 2V 2H | **4 px × 4 列** | 兩族 mod 4 斜線的聯集 |
| Skip 2 Dot ▸ 2V (1+2)H | **4 px × 4 列** | 同上（僅差 1 px 相位，語意仍待確認） |
| Skip SubPixel | **2 px × 2 列** | 偶數位置 G、奇數位置 R+B |
| Horizontal Line ▸ 1 line | 1 px × 2 列 | `y mod 2` |
| Horizontal Line ▸ 2 line | 1 px × 4 列 | `y mod 4 < 2` |
| Vertical Line ▸ 1 line | 2 px × 1 列 | `x mod 2` |
| Vertical Line ▸ 2 line | 4 px × 1 列 | `x mod 4 < 2` |
| Vertical Line ▸ Sub Line | 2 px × 1 列 | 逐行 G / R+B，垂直方向不變 |
| Skip 1 Dot 2 Gray | **2 px × 2 列** | 亮點為 pixel 棋盤，偶列 #1 色、奇列 #2 色 |

**塞不進 — 21 項**：Horizontal 9/64/256、Vertical 9/64/256、Center 9/64/256（漸層帶，水平或垂直有大量階界）、Cross Talk、XY Coordinate、Align Center、Color Test、Flicker 1/2 line、Checker、Character、LUMINACE COMPARE/DIVIDE、Response Time、SMPTE。

兩點要特別說明，都與原先的預期不同：

- **Checker 任何 n 都塞不進**（不是只有 n 小時塞不進）。實測格寬序列：n=2→960、n=8→240、n=64→30、n=128→15、n=256→**7,8,7,8**。最小週期是 2 格，n=256 時為 15 px，仍遠大於 4 px；而且 n=256 時格寬因 `⌊W·i/n⌋` 取整而在 7 與 8 之間跳動，連嚴格週期都構不成。
- **Response Time 演算法會判成 1 px × 1 列**（單幀確實是整面純色），但它是「兩張畫面依時間交替」，4×4 編輯區表達不了時間這個維度 → 程式裡**明確加了一條例外把它歸為不適用**，不假裝它是靜態圖樣。這是唯一一處人為覆寫演算法結果，寫在 `pgSyncGrid()` 裡並附註解。

### 不適用時的行為

編輯區 48 格**全部清 0**（不留上一個畫面的殘值）、整區降透明度 dim、上方顯示橘色狀態列說明原因。點任一格即回到手動編輯，狀態列與 dim 同時消失。週期性時則顯示綠色狀態列，寫出畫面名稱與重複單元尺寸。兩種狀態都是三語。

灰階、`Space` 反相、`↑`/`↓` 變體切換、顏色 1–8、Checker 格數、Cross Talk 參數改變時，編輯區都會同步重算（節流 16 ms）。節流刻意用 `setTimeout` 而不是 `requestAnimationFrame`——分頁被切到背景時 rAF 不會執行，會讓編輯區停在舊值。

### 驗證（Chrome 實機，127.0.0.1 本機 server，畫面 1920 × 958）

**5 項逐格比對：編輯區 48 格（讀 DOM 的實際顯示數字）vs 全畫面 canvas 左上 4×4 像素**

| 畫面 | 週期 | 不符格數 | 編輯區實際內容（L1 列） |
|---|---|---|---|
| Skip 1 Dot ▸ 1V 1H | 2×2 | **0 / 48** | `[127,127,127] [0,0,0] [127,127,127] [0,0,0]` |
| Skip 1 Dot ▸ 1V 2H | 4×2 | **0 / 48** | `[127,127,127] [127,127,127] [0,0,0] [0,0,0]` |
| Skip SubPixel | 2×2 | **0 / 48** | `[0,127,0] [127,0,127] [0,127,0] [127,0,127]`（L2 相位反轉）|
| Vertical Line ▸ Sub Line | 2×1 | **0 / 48** | `[0,127,0] [127,0,127] [0,127,0] [127,0,127]`（L1–L4 全同）|
| Horizontal Line ▸ 2 line | 1×4 | **0 / 48** | L1、L2 全 `[127,127,127]`，L3、L4 全 `[0,0,0]` |

其餘：

| 驗證項 | 實際結果 |
|---|---|
| 灰階 L128 | 編輯區 L1px1 = **(128,128,128)**、canvas(0,0) = (128,128,128)，不是 255 也不是殘留的 127 ✔ |
| `Space` 反相同步 | Skip SubPixel 反相前 L1px1 = (0,127,0) → 反相後 **(127,0,127)**，canvas 同值 ✔ |
| 變體切換同步 | Vertical Line ▸ 1 line（R 通道 L1 = 127,0,127,0）→ ▸ 2 line（**127,127,0,0**），週期由 2×1 變 **4×1** ✔ |
| Cross Talk 不適用 | 週期 = null、編輯區**非零格數 0 / 48**、狀態列 class `pg-grid-note na`、編輯區 `opacity 0.38`、文字正確 ✔ |
| 手動編輯回歸 | 在不適用狀態點格子 → `mode=subpixel`、狀態列 `display:none`、dim 移除、該格寫入 200 ✔ |
| 三語 | 週期性／不適用兩種狀態各切 zh-TW / en / zh-CN 皆正確，`<b>` 正常渲染 ✔ |
| v1.2.0 / v1.3.0 回歸 | 快速樣式鈕仍切回 subpixel 模式；4×4 平鋪前 16 格與 `pgLevels` 完全相符；`scrollHeight = clientHeight = 958`（無捲軸）；全畫面右鍵選單仍為 21 個頂層項目 ✔ |
| console | 全程**無任何訊息／錯誤** ✔ |
| 截圖 | 已用整頁截圖確認週期性（綠色狀態列 + 重複單元）與不適用（橘色狀態列 + dim 全 0）兩種畫面 ✔ |

**效能（實測，含 CDP debugger 附著，實際使用會更快）**：`pgSyncGrid` 含週期偵測 **199 ms**、快取命中（只取值 + 重繪 48 格）**153 ms**。`pgSelectPattern` 總計約 1052 ms，其中約 850 ms 是 v1.3.0 就存在的 preview 繪製（0.66 M 像素），不是本次新增。改用寬條取樣前，全圖偵測需 2–6 秒。

---

## Pattern Generator 畫面產生器 (pattern) v1.3.0 — 2026-07-31

**判定依據（回溯補記）：** 本版早於 2026-08-02 的規則制定，當時未套用級別制，標題列因此沒有級別欄。以現行 `VERSIONING.md` 回溯判定為 **MINOR**：測試畫面選單是全新功能。

新增「**測試畫面選單**」：依某面板廠內部測試程式的原始選單結構重建的階層式選單（21 個頂層項目 + 24 個子項目 = 45 個 MenuItem），以及能畫非平鋪 pattern 的繪圖引擎。選單文字一律保留英文原文（含原程式既有拼字 `LUMINACE`），不翻譯。

### 選單與進入點

- 主頁「快速樣式」下方新增 `▾ Test Pattern Menu` 下拉選單；**原有 9 顆快速樣式按鈕全部保留**。
- 全畫面時**按滑鼠右鍵**跳出同一套選單（兩處共用同一份 `PG_MENU` JS 資料，不重複維護）；全畫面面板內另有 `☰ 測試畫面選單` 按鈕。
- 外觀比照原程式：淺灰底 `#f0f0f0`、細字、hover 藍底白字、子選單 `▶` 箭頭。`Horizontal` 的 3 個子項目為 RadioItem（`●`），其餘選中項顯示 `✓`。
- 靠近右緣／下緣時整個選單與子選單**往內翻**，不開到畫面外（用 `getBoundingClientRect()` 量測，不用 `offsetWidth/Height`，避免四捨五入造成 0.x px 溢出）。
- **Esc 兩段優先序**：選單開著 → 只關選單；選單關著 → 才離開全畫面。進入全螢幕時額外呼叫 `navigator.keyboard.lock(['Escape'])`（Keyboard Lock API），否則瀏覽器會直接吃掉 Esc。

### pattern 引擎（非平鋪畫面）

新增 `pgDrawPattern(ctx, W, H)`，以裝置像素為單位繪製；per-pixel 類 pattern 走 `Uint32Array` 直寫 ImageData，無縮放無內插。`pgRenderFill()` / `pgRenderPreview()` 依模式分派，**4×4 sub-pixel 編輯器與 1:1 滿版機制完全未動**（動到編輯器會自動切回 subpixel 模式）。

已實作畫面：Horizontal / Vertical / Center（9・64・256）、Gray Level、Skip 1 Dot（1V 1H・1V 2H）、Skip 2 Dot（2V 1H・2V 2H・2V (1+2)H）、Skip SubPixel、Horizontal Line、Vertical Line（含 Sub Line）、Cross Talk、XY Coordinate、Align Center、Color Test、Flicker、Checker、Character、LUMINACE（COMPARE・DIVIDE）、Response Time、SMPTE、Skip 1 Dot 2 Gray、Exit（＝離開全畫面）。

共用基礎：顏色乘數表 8 筆（`color = table[idx] × level`）、Checker 格數表 `[2,4,8,16,32,64,128,256]`。鍵盤沿用原程式：`1`~`8` 選色、`↑`/`↓` 同組變體循環、`Space` 反相、`Esc` 關閉。

### Skip 系列的語意（重要）

Skip 1 Dot / Skip 2 Dot 的**單位是 pixel**（1 pixel = RGB 三個 sub-pixel）：`1V 1H` 就是 pixel 級的 on/off 棋盤，`1V 2H` = 垂直 1、水平 2，其餘類推。原程式是用 45° 斜線鋪出來的，結果等價，但**描述與變數命名一律用 pixel on/off 的講法**。Skip SubPixel 與 Vertical Line ▸ Sub Line 則以 **sub-pixel** 為單位一亮一暗。

**起始相位（已讀死，非推測）**：原程式 Skip SubPixel 在偶數位置畫 **G**、奇數位置畫 **R+B（Magenta）**；Sub Line 同理（`x mod 2 == 反相旗標` → G，否則 Magenta）。也就是序列從「**R 不亮**」起頭。需要從「**R 亮**」起頭時按 `Space` 反相即可，**兩種相位都拿得到**，UI 上也直接標示這段說明。

### 其他

- `Vertical 9/64/256`：原程式硬編碼 480 × 800（只畫左上角），此處**改用實際畫面尺寸**繪製整個畫面，UI 上有註記。
- `2V (1+2)H`：起始相位與步進照原程式參數實作，但讀出的結果與 `2V 2H` 只差 1 px 水平相位，與名稱暗示的「1+2 混合」對不起來 → UI 明確標示「**語意待確認**」，**不臆測、也不畫一個假的充數**。
- Character 畫面的重複文字改為中性字串 `TKTools`。
- 三語 i18n：說明文字三語，**選單項目一律英文原文不翻譯**。

### 驗證（Chrome 實機，127.0.0.1 本機 server）

| 驗證項 | 實際結果 |
|---|---|
| 選單 DOM 層級 | `.pg-menu[data-menu-depth=0]` 21 項 + `depth=1` 共 24 子項 = **45 個 MenuItem** ✔ |
| 全畫面右鍵選單 | 截圖確認：選單疊在 Checker 畫面上，`Vertical Line ▸ 1 line / 2 line / Sub Line` 展開正常，`✓ Checker` 標記正確 ✔ |
| 右下角邊界翻轉 | 於 `(1615, 719)`（viewport 1619 × 723）叫出：root `L=1465 T=207 R=1615 B=722.25`、子選單 `L=1318 R=1468`（往左開），**四邊皆在畫面內** ✔ |
| 左上／右緣／下緣 | root 與子選單 `inView=true` 全過（右緣子選單自動 LEFT-flipped）✔ |
| Skip SubPixel 像素 | `lv=127` `(0,0)=(0,127,0)` G 亮、`(1,0)=(127,0,127)` R+B 亮、`(0,1)=(127,0,127)`；反相後 `(0,0)=(127,0,127)` ✔ |
| Sub Line 像素 | `(0,0)=(0,127,0)`、`(1,0)=(127,0,127)`、`(0,50)=(0,127,0)`（垂直不變）✔ |
| Checker 像素 | 格子 `404 × 180`（= W/8 × H/8）、`(0,0)` 白、`(404,0)` 黑、`(0,180)` 黑、`(404,180)` 白 ✔ |
| Cross Talk 像素 | 外圍 `(127,127,127)`、正中央 `(0,0,0)`、內框外緣 `(127,127,127)` ✔ |
| Color Test 像素 | 8 欄 `(0,0,0) (0,0,255) (0,255,0) (0,255,255) (255,0,0) (255,0,255) (255,255,0) (255,255,255)` ✔ |
| Horizontal 9 像素 | band0 白 `0→255` 漸階、band1 `(255,0,0)`、band2 `(0,255,0)`、band3 `(0,0,255)` ✔ |
| Skip 1 Dot 2 Gray | `(0,0)=(255,0,0)`、`(1,1)=(0,255,0)`、`(1,0)/(0,1)=(0,0,0)` ✔ |
| Align Center | 垂直中心線 `(1618,5)=白`、水平中心線 `(5,722)=白`、對角線、k=1 矩形左邊與頂邊皆白 ✔ |
| 全部 34 個畫面 | 逐一套用 + 取樣像素，**0 個例外** ✔ |
| Esc 兩段 | 第 1 次 → `menuOpen=false, overlayOn=true`；第 2 次 → `overlayOn=false` ✔ |
| v1.2.0 回歸 | sub-pixel 模式前 16 格與 `pgLevels` **完全相符**、`(4,4)` 平鋪重複正確、`scrollHeight = clientHeight = 723`（無捲軸）、overlay 內除 canvas 外**無任何會繪製的元素** ✔ |
| console | 載入 + 走一輪互動（SMPTE→Response Time→Run→XY→回編輯器→開關選單）後**無任何訊息／錯誤** ✔ |
| 三語 i18n | en / zh-CN / zh-TW 切換正常，說明文字 `<b>` 正確渲染（改用 `data-i18n-html`）✔ |

**未能驗證的部分（誠實說明）**：本次自動化環境下 `requestFullscreen()` 一律以 `TypeError: Permissions check failed` 被拒（合成鍵盤事件不算 user activation），因此上述全畫面驗證都是在 **overlay 覆蓋整個 viewport** 的狀態下完成，**沒有實際進入真・全螢幕**。Esc 兩段優先序在真・全螢幕下是否會被瀏覽器搶走（有無 Keyboard Lock 生效），需要 Bruce 手動點一次「進入全畫面顯示」才能確認。

---

## Pattern Generator 畫面產生器 (pattern) v1.2.0 — 2026-07-31

**判定依據（回溯補記）：** 本版早於 2026-08-02 的規則制定，當時未套用級別制，標題列因此沒有級別欄。以現行 `VERSIONING.md` 回溯判定為 **PATCH**：全螢幕進入方式的修正屬 **R1**，沒有新增使用者能做的事。

🔴 依現行規則，本版的版號應為 **v1.1.1**。歷史版號不回溯調整，僅補記判定。

**Bruce 回報**：「為何進入全螢幕、全畫面顯示的時候，左側還會有一個浮在畫面上的圖示？右側居然還有垂直方向的卷軸？不是都是全螢幕嗎？我要的是這張畫面的大小，就是這個解析度的大小，1 比 1。」

### 問題 1：右側垂直捲軸 — 先量出成因，不是用 overflow:hidden 蓋掉

實測 v1.1.0 全螢幕當下：

| 量測項 | 值 |
|---|---|
| `documentElement.clientHeight` | 1024 |
| `documentElement.scrollHeight` | **2768** |
| **垂直溢出** | **1744 px** |
| 水平溢出 | 0 px |
| `body` 實際高度 | 2768 px（含 `padding-bottom: 40px`） |
| 超出 viewport 的元素數 | **97 個** |

成因：v1.1.0 是對 **`documentElement`** 呼叫 `requestFullscreen()`，整份文件進入全螢幕，但**原本三張卡片（螢幕資訊／編輯器／預覽）全部還留在文件流裡**，總高 2768 px → 右側必然出現捲軸。捲軸同時吃掉 viewport 寬度，1:1 也跟著破功。

**修法（根治）**：
1. `requestFullscreen()` 改成對 **overlay 元素 `#pg-fs`** 呼叫，不是 documentElement → 背景頁面內容完全不參與版面。
2. overlay 開啟時對 `<html>` 加 `.pg-fs-lock`（`overflow:hidden; height:100%; padding-bottom:0`），並隱藏 `#ptr-indicator` → 即使 `requestFullscreen()` 因缺 user activation 而失敗，也不會有捲軸。離開時移除。

### 問題 2：左側浮動圖示

就是 v1.0.0 的面板把手 `.pg-handle`（進場 3 秒內 `opacity: .85`，之後 `.07` 仍看得見）。桌面截圖已確認是它。

**修法**：`.pg-handle` 元素與相關 JS（`pgHandleWake` / `pgHandleTimer` / click 綁定）**整個移除**，全畫面時畫面上**沒有任何 UI 元素**。只留完全透明的 26 px 邊緣感應區 `.pg-hot`（不繪任何像素）。觸控裝置改用「**從該側邊緣往內滑**」（`touchstart` 落在邊緣 26 px 內即開啟面板），不放任何看得見的把手。

### 問題 3：1:1 的定義 — canvas 尺寸來源改掉

v1.1.0 用 `window.innerWidth/innerHeight` 決定 canvas 尺寸，那是「**網頁 viewport**」，會被瀏覽器工具列／捲軸吃掉。改為新的 `pgFillCssSize()`，以 **overlay 元素本身的 `getBoundingClientRect()`** 為準——它就是 fullscreen 元素，尺寸即為系統實際給的全螢幕繪圖區。

另外新增**繪圖區 vs 螢幕解析度對照**，直接顯示在全畫面面板裡，讓使用者當場就知道有沒有真的滿版：

- 相等 → 綠字「✔ 繪圖區 = 整個螢幕，已是完整 1:1 滿版。」
- 不等 → 紅字「⚠ 繪圖區比螢幕小 {dx} × {dy} px（被瀏覽器工具列／系統列佔用），這部分網頁拿不到。」

再加 `ResizeObserver` 觀察 overlay，尺寸一變（進出全螢幕、換螢幕、轉向）立刻重繪；`fullscreenchange` 進入時額外補一次延遲重繪。

### 驗證（Chrome 實機，含桌面截圖看實際畫面）

修後全畫面實測：

| 驗證項 | 實際值 | 結果 |
|---|---|---|
| `document.fullscreenElement` | **`pg-fs`**（overlay 本身） | 非 null ✔ |
| `scrollWidth` = `clientWidth` | **1920 = 1920** | true ✔ |
| `scrollHeight` = `clientHeight` | **1024 = 1024** | true ✔ |
| 溢出 X, Y | **0 , 0**（修前 0 , 1744） | 無捲軸 ✔ |
| canvas CSS 尺寸 | **1920 × 1024** | = 繪圖區 `innerWidth × innerHeight` ✔ |
| canvas backing 尺寸 | **1920 × 1024** | = CSS 尺寸 × dPR(1) ✔ |
| `screen.width/height` × dPR | **1920 × 1080** | — |
| `outerHeight` | **1080**（= screen.height） | 視窗確實佔滿螢幕 |
| `outerHeight − innerHeight` | **56 px** | 見下方說明 |
| 面板收合後位置 | `left = 1926`（畫面寬 1920） | **完全在畫面外**，非半透明 ✔ |
| `#pg-handle` 元素 | **不存在** | 浮動圖示已移除 ✔ |

**關於那 56 px**：桌面截圖顯示螢幕頂端有一條深色列，文字為「**『Claude』已開始為這個瀏覽器偵錯**」——這是自動化偵錯工具的橫幅，高度約 56 px，與 `outerHeight − innerHeight = 56` 完全吻合。**這是測試環境造成的，一般使用時不會出現**；新增的紅字提示會把這個差距如實顯示出來（實測顯示「⚠ 繪圖區比螢幕小 0 × 56 px」），所以在真實環境若能拿到完整螢幕，該行會變成綠字「繪圖區 = 整個螢幕」。

**畫面實際外觀（桌面截圖確認）**：除了上述偵錯橫幅外，整個螢幕就是 pattern 本身——**左側無把手、右側無捲軸、無任何浮動 UI**。

**面板行為**：滑鼠移到左邊緣 → 滑出（含快速樣式／切換左右／離開全畫面／解析度資訊）；點「⇄ 切換面板左右」→ 移到右側且維持開啟；滑鼠移到畫面中央 3.5 秒後 → **完全消失**（`left = 1926 > 1920`）；滑鼠移到右邊緣 → 再次滑出。**離開方式兩種都實測通過**：`Esc`（`fullscreenElement → null`、overlay off、`.pg-fs-lock` 移除、頁面恢復可捲）與面板中的「✕ 離開全畫面」按鈕（同樣三項全部復原）。

**其他**：`pat.fsHint` 三語同步改寫（移除「半透明拉柄」說法，改為邊緣滑入；舊字串殘留 0 筆）；新增 `pat.fsInfoScreen` / `pat.fsInfoFull` / `pat.fsInfoShort` 三組 × 3 語。掃描全頁 `data-i18n` / `data-i18n-html` 與 JS 用到的 key，**缺翻譯 0 筆**；載入與全程操作 console **無任何錯誤或訊息**。

**驗證方法補記**：本輪全螢幕改用 Chrome 擴充功能的鍵盤事件（對已 focus 的按鈕送 `space`）觸發，確認**具備 user activation**，`requestFullscreen()` 直接成功，不需再借助外部工具送鍵盤。

**版本同步**：`pattern: v1.1.0 → v1.2.0`、`app: v1.89.0 → v1.90.0`；`pattern.html` 與 `index.html` 的 `version.js?v` / `i18n.js?v` 皆 `20260731pat2 → 20260731pat3`。

---

## Pattern Generator 畫面產生器 (pattern) v1.1.0 — 2026-07-31

**判定依據（回溯補記）：** 本版早於 2026-08-02 的規則制定，當時未套用級別制，標題列因此沒有級別欄。以現行 `VERSIONING.md` 回溯判定為 **MAJOR**：互動模型由「點格子＝選取」改為「點格子＝立即套用」，屬判定表「既有功能的輸出**主動改變**」。使用者原本會的操作結果不同了。

🔴 依現行規則，本版的版號應為 **v2.0.0**。歷史版號不回溯調整，僅補記判定。

**Bruce 上線後回饋 6 項**（v1.0.0 已 push 上線）。

### 1. 點 sub-pixel 直接套用目前灰階值（互動模型改為「筆刷」）

改前：點格子只是「選取」，還要再去按灰階才生效。改後：**點下去當下就把目前設定的灰階值寫進該 sub-pixel**（`pgPaintCell()`），灰階值本身仍可事先用數值框／滑桿／L0–L255 快捷鍵／±1 ±16 設定。

改用 `pointerdown` / `pointermove`（不再是 `click`），因此**按住拖曳可連續塗刷**；`pointermove` 用 `document.elementFromPoint()` 找目前指標下的格子（觸控時 `pointerenter` 不會逐格觸發）。格子加 `touch-action: none`，並在格子上 `stopPropagation` touchstart/touchmove，避免手機下拉刷新誤觸發。

**「全選／取消選取」怎麼共存（沒有默默刪掉，請 Bruce 確認這樣合不合用）**：
- **單點格子** = 立刻套用（需求 1），同時把選取集合換成這一格 → 接著拉滑桿可以對同一格即時微調，看得到變化。
- **拖曳** = 一路套用，經過的格子累加進選取集合。
- **群組標題仍是「選取」不是「套用」**：`L1~L4` 列頭選整列（12 格）、`px1~px4` 選該 px 全部（12 格）、`R/G/B` 選該 px 的該通道（4 格）、`全選` 選 48 格 → 選好後改灰階即**批次套用**。所以多選批次與「取消選取」都保留了完整意義。

### 2~5. 快速樣式改名（只改顯示名稱，計算邏輯一律未動）

| 舊 | 新 | 內部 `data-ps` |
|---|---|---|
| 全黑 / Black | **L0** | `black` → `l0` |
| 全白 / White | **L255** | `white` → `l255` |
| 純 R / R only | **R255** | `red` → `r255` |
| 純 G / G only | **G255** | `green` → `g255` |
| 純 B / B only | **B255** | `blue` → `b255` |
| 1×1 棋盤 / 1×1 checker | **Pixel on/off** | `checker` → `pxonoff` |
| 直條 / V stripe | **V 1 Line** | `vstripe` → `v1line` |
| 橫條 / H stripe | **H 1 Line** | `hstripe` → `h1line` |

新名稱為英文術語，三語（zh-TW / en / zh-CN）皆使用同一字串。舊名稱殘留掃描：`psBlack` / `psWhite` / `psRed` / `psGreen` / `psBlue` / `psChecker` / `psVStripe` / `psHStripe` / `1×1 棋盤` / `全黑` / `全白` / `純 R` / `純 G` / `純 B` / `直條` / `橫條` / `竖条` / `横条` / `R only` / `G only` / `B only` / `V stripe` / `H stripe` 全部 **= 0 筆**。

### 6. 新增快速樣式 Subpixel On/Off

以 **sub-pixel** 為單位一亮一暗，逐列反相。sub-pixel 序號 `i = p*3 + c`，公式 `((r + p*3 + c) % 2 === 0) ? 255 : 0`。

「亮」的定義**沿用第 5 項那組既有邏輯 = 固定 255**（`l255` / `r255` 等原本就是寫死 255，不是取當下灰階值），沒有自創。

### 驗證（Chrome 實機）

**需求 1** — 先按 `L0` 清空、灰階設 `L128`，用**真實座標點擊**三個不同 sub-pixel（L1/px1/R、L2/px3/G、L4/px4/B），未再碰灰階按鈕；進全畫面（`document.fullscreenElement = "HTML"`，backing 1920×1024 = inner×dPR 1，`exact_1to1 = true`）後 `getImageData` 讀 canvas 實際像素：

| 讀取座標 | 對應格 | 實際讀到 |
|---|---|---|
| (0,0) | L1/px1/R | **(128,0,0)** |
| (2,1) | L2/px3/G | **(0,128,0)** |
| (3,3) | L4/px4/B | **(0,0,128)** |
| (4,0) / (0,4) | 平鋪重複 | **(128,0,0)** / **(128,0,0)** |
| (1,0) | 未點過 | **(0,0,0)** |

拖曳塗刷：灰階 192、從 L1/px1/R 拖到 L1/px2/B → `L1 [192,192,192][192,192,192][0,0,0][0,0,0]`，選取數 6。

群組批次共存：點 px3 的 G 標題 → 選取數 **4** 且**值不變**（仍全 0）→ 按 L64 → 四列 px3 的 G 全變 64；點 px1 標題 → 選取數 **12** → L32 → px1 全 32；全選 → **48** → L255 → 48 格全 255；取消選取 → **0**。

**需求 6** — 按下 `Subpixel On/Off` 後從 DOM 讀回全部 48 個 sub-pixel：

```
L1: px1[R255 G0 B255] px2[R0 G255 B0] px3[R255 G0 B255] px4[R0 G255 B0]
L2: px1[R0 G255 B0] px2[R255 G0 B255] px3[R0 G255 B0] px4[R255 G0 B255]
L3: px1[R255 G0 B255] px2[R0 G255 B0] px3[R255 G0 B255] px4[R0 G255 B0]
L4: px1[R0 G255 B0] px2[R255 G0 B255] px3[R0 G255 B0] px4[R255 G0 B255]

亮(255)=● 暗(0)=○   每列 12 個 sub-pixel
L1 ●○●○●○●○●○●○
L2 ○●○●○●○●○●○●
L3 ●○●○●○●○●○●○
L4 ○●○●○●○●○●○●
```

交替方向正確：第 1 列亮暗亮暗、第 2 列暗亮暗亮，逐列反相。

**需求 2~5 + 全部 9 組樣式回歸**（● = 255、○ = 0，每列 4 個 px、每 px 三個 sub-pixel）：

```
L0          ○○○ ○○○ ○○○ ○○○ | ○○○ ○○○ ○○○ ○○○ | ○○○ ○○○ ○○○ ○○○ | ○○○ ○○○ ○○○ ○○○
L255        ●●● ●●● ●●● ●●● | ●●● ●●● ●●● ●●● | ●●● ●●● ●●● ●●● | ●●● ●●● ●●● ●●●
R255        ●○○ ●○○ ●○○ ●○○ | ●○○ ●○○ ●○○ ●○○ | ●○○ ●○○ ●○○ ●○○ | ●○○ ●○○ ●○○ ●○○
G255        ○●○ ○●○ ○●○ ○●○ | ○●○ ○●○ ○●○ ○●○ | ○●○ ○●○ ○●○ ○●○ | ○●○ ○●○ ○●○ ○●○
B255        ○○● ○○● ○○● ○○● | ○○● ○○● ○○● ○○● | ○○● ○○● ○○● ○○● | ○○● ○○● ○○● ○○●
Pixel on/off ●●● ○○○ ●●● ○○○ | ○○○ ●●● ○○○ ●●● | ●●● ○○○ ●●● ○○○ | ○○○ ●●● ○○○ ●●●
V 1 Line    ●●● ○○○ ●●● ○○○ | ●●● ○○○ ●●● ○○○ | ●●● ○○○ ●●● ○○○ | ●●● ○○○ ●●● ○○○
H 1 Line    ●●● ●●● ●●● ●●● | ○○○ ○○○ ○○○ ○○○ | ●●● ●●● ●●● ●●● | ○○○ ○○○ ○○○ ○○○
Subpixel On/Off ●○● ○●○ ●○● ○●○ | ○●○ ●○● ○●○ ●○● | ●○● ○●○ ●○● ○●○ | ○●○ ●○● ○●○ ●○●
```

**三語按鈕文字**（主頁「快速樣式」與全畫面面板兩處皆同）：

| 語系 | 實際文字 |
|---|---|
| zh-TW | `L0 \| L255 \| R255 \| G255 \| B255 \| Pixel on/off \| V 1 Line \| H 1 Line \| Subpixel On/Off` |
| en | `L0 \| L255 \| R255 \| G255 \| B255 \| Pixel on/off \| V 1 Line \| H 1 Line \| Subpixel On/Off` |
| zh-CN | `L0 \| L255 \| R255 \| G255 \| B255 \| Pixel on/off \| V 1 Line \| H 1 Line \| Subpixel On/Off` |

灰階標題 / 提示三語亦同步更新（zh-TW「灰階 L0 – L255（點 sub-pixel 即套用此值）」、en「Gray level L0 – L255 (tap a sub-pixel to apply this value)」、zh-CN「灰阶 L0 – L255（点 sub-pixel 即应用此值）」）。掃描全頁 `data-i18n` / `data-i18n-html`，**缺翻譯 0 筆**；載入與全程操作 console **無任何錯誤或訊息**。

**版本同步**：`pattern: v1.0.0 → v1.1.0`、`app: v1.88.0 → v1.89.0`；`pattern.html` 與 `index.html` 的 `version.js?v` / `i18n.js?v` 皆 `20260731pat1 → 20260731pat2`。

---

## Pattern Generator 畫面產生器 (pattern) v1.0.0 — 2026-07-31（新分頁）

**判定依據（回溯補記）：** 本版早於 2026-08-02 的規則制定，當時未套用級別制，標題列因此沒有級別欄。以現行 `VERSIONING.md` 回溯判定為 **—**：新分頁工具首版，對應 §2 案例 12（該分頁 v1.0.0）。

**Bruce 需求**：新增一個 Pattern Generator 分頁，(1) 偵測螢幕原生解析度與 OS/瀏覽器縮放，若非 100% 要提醒（或強制改回）；(2) 以 sub-pixel（RGB 分開）為單位編輯 4 px × 4 列、灰階 L0–L255，可循環填滿整個畫面；(3) 一鍵全螢幕，全螢幕時控制面板收到側邊隱藏，滑鼠移到該側邊緣才滑出。

### 需求 1：螢幕/縮放偵測 — 先查證再實作，能力分三類誠實標示

查證來源：CSSOM View（`screen.width` / `devicePixelRatio` 定義）、W3C Window Management（`isExtended` / `getScreenDetails` / `window-management` 權限）、MDN + browser-compat-data、CSSWG issue 3538（`window.pageZoomFactor` 提案被關閉）、CSS Images L3 §5.2（`image-rendering: pixelated`）。

- **(a) 確定做得到**：`screen.width/height`（規範明訂為 **CSS 像素**，非實體像素）、`devicePixelRatio`、`availWidth/Height`、`colorDepth`、`orientation.type`、`screen.isExtended`；並以「dPR 是否為整數」判斷能否做 1:1 對應。
- **(b) 有前提**：`getScreenDetails()` 可列出每台螢幕的 label / 尺寸 / 各自 dPR，並用 `window.devicePixelRatio ÷ ScreenDetailed.devicePixelRatio` **推估**瀏覽器頁面縮放（依據：MDN 明載 `ScreenDetailed.devicePixelRatio` 不含 page zoom）。僅 Chromium 系 100+、需 secure context 與 `window-management` 授權；Firefox / Safari / iOS 全不支援。頁面對不支援者直接停用按鈕並說明。
- **(c) 確定做不到（頁面上白紙黑字寫出）**：① 無法區分「OS 顯示縮放 125%/150%」與「瀏覽器頁面縮放」——兩者都只反映在同一個 `devicePixelRatio`；② 無法讀取面板原生實體解析度（`screen.width × dPR` 只是推算，在部分桌面縮放模式與手機的 render-then-downscale 下會與面板原生值不符，頁面已標註「推算裝置像素（非 API 值）」）；③ **無法強制更改** OS 顯示縮放或瀏覽器縮放（改 zoom 只有瀏覽器擴充功能的 `tabs.setZoom` 辦得到），因此只做提醒 + 手動步驟指引（Ctrl/⌘ + 0、系統顯示設定改 100%）。

### 需求 2：Sub-pixel 編輯器

4 px（橫）× 4 列（縱），每 px 有 R/G/B 三個 sub-pixel = **48 格**，每格獨立設 L0–L255。選取後套用灰階：數值輸入 + 滑桿 + 快捷鍵 L0/L32/L64/L128/L192/L255 + 微調 −16/−1/+1/+16。點 `L1~L4` 列頭選整列、點 `px1~px4` 選該 px 全部 3 個 sub-pixel、點 `R/G/B` 選該 px 的該通道（皆為 toggle）。另附 8 組快速樣式（全黑/全白/純 R/G/B/1×1 棋盤/直條/橫條）。

### 需求 2 的關鍵：1:1 像素對應怎麼保證

全畫面 canvas 採 `canvas.width = round(innerWidth × devicePixelRatio)`，並**直接以 `ImageData` 逐「裝置像素」寫入** `pattern[y % 4][x % 4]`（先建 4 條 template row 再用 `TypedArray.set()` 整列複製），**過程中完全沒有任何縮放、drawImage 或內插**，因此 canvas backing store 的 1 像素 = pattern 的 1 像素。另加 `imageSmoothingEnabled = false` 與 `image-rendering: pixelated` 作為第二道保險。canvas 固定 `position:absolute; left:0; top:0`，起點對齊裝置像素格線。

**何時會失準（已在 UI 明示）**：`devicePixelRatio` 非整數時（例如 OS 125% → 1.25、瀏覽器縮放 110% → 1.1），backing store 到實體面板之間必然存在非整數倍重新取樣，`image-rendering: pixelated` 依規範在非整數倍時也會做 smooth 補完，**此時無法保證 1:1**。頁面偵測到非整數 dPR 會顯示紅色警告並要求改回 100%。

### 需求 3：全畫面

`documentElement.requestFullscreen({navigationUI:'hide'})` + 全螢幕 overlay。控制面板預設收在側邊（可選靠左／靠右，全螢幕中也能用「⇄ 切換面板左右」即時切換），滑鼠移到該側 26 px 內滑出，離開後 450 ms 收回；觸控裝置有邊緣半透明拉柄（3 秒後淡到 opacity 0.07，避免污染測試畫面）。離開方式三選一：面板「✕ 離開全畫面」按鈕、`Esc`、`F`。切換左右／手動拉開後 2.5 秒內不因滑鼠位置自動收合（否則切到另一側時面板會立刻消失）。

### 驗證（Chrome 實機，非看 code 推論）

**1:1 與灰階正確性** — 以真實座標點擊套用「全黑」→ 點選 L1/px1/R → 按 L255；再設 L2/px2/G = 128、L3/px3/B = 64、L4/px4 = 255,255,255。進全畫面後用 `getImageData` 讀 canvas 實際像素：

| 讀取座標 | 期望 | 實際讀到 |
|---|---|---|
| (0,0) | R255 | **(255,0,0)** |
| (1,1) | G128 | **(0,128,0)** |
| (2,2) | B64 | **(0,0,64)** |
| (3,3) | 白 255 | **(255,255,255)** |
| 右下角 (W−4,H−4)…(W−1,H−1) | 同上四色 | **(255,0,0) (0,128,0) (0,0,64) (255,255,255)** |

平鋪重複性正確（右移 4 px 顏色相同）。`canvas.width × height = 1920 × 1024`，等於 `innerWidth × innerHeight × dPR(1)`，`exact_1to1 = true`。

**全螢幕** — `document.fullscreenElement = "HTML"`（以 host 端真實鍵盤事件觸發；Chrome MCP 的合成點擊不具 user activation，會回 `TypeError: Permissions check failed`，此為自動化環境限制非頁面問題）。左側邊緣 hover → 面板滑出；按「⇄ 切換面板左右」→ 面板改在右側**且維持開啟**；滑鼠移開 3 秒後自動收合（`open = false`）；右側邊緣 hover → 再次滑出；`Esc` 與「✕ 離開全畫面」皆可離開（`fullscreenElement = false`、overlay `on = false`）。

**螢幕資訊正確性** — UI 顯示值與 JS 直接讀到的原始值逐項一致：`1440 × 900 CSS px` / dPR `2` / 推算 `2880 × 1800` / inner `500 × 723` / avail `1440 × 814` / `24 bit` / `landscape-primary` / isExtended `是`。

**縮放偵測即時性（真實瀏覽器縮放）** — host 端按 ⌘ + 「+」把頁面縮放到 110%：頁面**不需重整**即自動更新為 `devicePixelRatio = 1.1`，並切換成紅色警告「非整數…無法保證 1:1」；按 ⌘ + 0 復原後自動變回綠色「dPR = 1（整數）」。同時實測到 Chrome 在縮放時 `screen.width` 不變（維持 1920），與查證到的行為一致。

**Window Management API** — 目前權限狀態 `prompt`，未授權時走 reject 路徑並正確顯示「無法取得（NotAllowedError）…」；以假資料驗證授權成功的渲染路徑，正確列出 2 台螢幕（label / CSS px / 各自 dPR / 主螢幕・內建・外接・★目前視窗所在）並算出推估縮放 100%。**真實授權提示需 Bruce 自行按一次「允許」**，自動化環境無法點擊瀏覽器原生權限泡泡，這點不謊報為已驗證。

**三語 + console** — zh-TW / en / zh-CN 三語逐項切換皆正確（標題、卡片、按鈕、灰階提示、能力說明、全畫面面板快速樣式鈕）；掃描頁面所有 `data-i18n` / `data-i18n-html` 與 JS 內 `t()` 使用的 key，**缺翻譯 0 筆**。載入與操作全程 console **無任何錯誤或訊息**。

**首頁入口** — `index.html` 新增卡片（第 6 張），標題／說明／版本 badge `v1.0.0` 皆正確；`#page-pattern` 與 `#pattern` 兩組舊式 hash 轉址也一併補上。

**版本同步**：`common/version.js` 新增 `pattern: v1.0.0`，`app: v1.87.1 → v1.88.0`；`index.html` 的 `version.js?v` / `i18n.js?v` 一併更新為 `20260731pat1` 以避開快取。新增 i18n 字串 61 組（pat.* 59 + home.pat* 2）× 3 語。

---

## iSP 波形產生器 (isp) v1.19.0 — 2026-07-31

**Bruce 需求**：「幫我把 iSP REG Setting 的預設改為加入」——iSP 分頁 REG Setting 的「加入 Setting line」預設由「不加入」改為「加入」。

**預設值來源盤點（先確認再改）**：`isp-reg-en` 這組 radio 的預設**只由 HTML 的 `checked` 屬性決定**，沒有第二處。查證：
- `regEnable` 的唯一決定處是 `ispRender()`：`const regEnable = !!(regOnEl && regOnEl.checked)`（純讀 DOM，無獨立 JS 初始值）。
- 全檔 `.checked =` 的指派只出現在波形反推卡片的 9 個 checkbox（與 REG 無關）。
- `isp.html` 無 `localStorage` / `sessionStorage`，沒有持久化會覆蓋預設。

**改動（`isp.html`，只動預設值）**：`checked` 由 `#isp-reg-off` 移到 `#isp-reg-on`（與 v1.17.0 的 BKPOL 同一種寫法）。其餘 REG Setting 行為（REG 數量 slider、REG hex 輸入、複製至全部、卡片收合、Setting line 的組成與位置）**一律未動**。改後 grep 確認：`id="isp-reg-off" ... checked` 0 筆、`id="isp-reg-on" ... checked` 1 筆，無殘留舊預設。

**驗證（Chrome 實機，重新載入頁面而非手動點選）**：

首次載入即生效（要求 3、5）：

| 項目 | 改前（v1.18.2） | 改後（v1.19.0） |
|---|---|---|
| `#isp-reg-off` checked | `true` | `false` |
| `#isp-reg-on` checked | `false` | **`true`** |
| Bits | 225 | **360**（**+135**） |
| 資訊列 Setting line | 無 | **`+ BK×2 · BAC · Setting · REG0..7 · EOL · BK×2`** |

+135 bit 與格式吻合：Setting line = `BK×2 + BAC + SET + REG0..7(8) + EOL + BK×2` = 15 個 packet × 9 bit = 135。

波形本身確實含 Setting line（不是只有勾選框被打勾）：主波形 SVG 的段落標籤序列為
`BK BK BAC POL+ EOL BK BK │ BK BK BAC SET REG0 REG1 REG2 REG3 REG4 REG5 REG6 REG7 EOL BK BK │ BK BK BAC BKPOL+ BK BK`，
SET 與 REG0~REG7 皆實際繪出，SVG 節點數 532 → 847。

回歸（要求 6）：
- BKPOL 預設仍為 ON（`#isp-bkpol-on` = `true`），frame 段落順序為 **Data line → Setting line → BKPOL 段**，與 datasheet 的 `… EOL │ BK BAC BKPOL± BK` 位在 frame 末端一致。
- 兩者互相獨立：手動切 REG 為「不加入」→ 225、切回「加入」→ 360；把 BKPOL 切 OFF（REG 維持 ON）→ 306，frame 僅剩 Data line + Setting line。BKPOL 段 = `BK×2+BAC+BKPOL+BK×2` = 6 packet × 9 = 54，`360 − 306 = 54` 吻合。
- 2-pair：Bits `306 × 2`，pair0 與 pair1 的段落序列都完整含 Data line → Setting line → BKPOL 段。
- 6-bit（1-pair）：Bits 333，段落序列同上正確。
- 重新載入後 console 無任何錯誤或訊息；v1.18.2 的波形反推卡片高度（160px）不受影響。

**版本同步**：`common/version.js` `isp: v1.18.2 → v1.19.0`（預設輸出波形改變、屬行為變更而非修錯，故進 minor）；`isp.html` `version.js?v` 與 `i18n.js?v` 皆 `20260731isp5 → 20260731isp6`。本次無新增 i18n 字串。

---

## iSP 波形產生器 (isp) v1.18.2 — 2026-07-31

**Bruce 打回 v1.18.1**：「波形反推我只是要你降高度，沒有要你寬度一起縮啊，而且這樣與下方的核取方塊對不上」。

**v1.18.1 做錯什麼**：只加了 `height:160px` 而沒有處理 viewBox。SVG 的 `preserveAspectRatio` 預設是 `xMidYMid meet`（等比），viewBox 是 `120×116`，於是縮放比取 `min(426/120, 160/116) = 1.3793`，內容只畫了 165.5px 寬、置中、左右各留 130px 空白——高度是降下來了，但**寬度被一起縮掉**，9 個 bit 與下方 9 個核取方塊完全對不上。這是超出需求範圍的改動。

**`preserveAspectRatio="none"` 不可用（已驗證，非照抄建議）**：波形內含 `<text>`（b0~b8 標籤、每 bit 的 0/1 數字、0/1 位準標籤，font-size 9）與三種 stroke。非等比下 x/y 縮放比會是 `426/120 = 3.55` : `160/116 = 1.38`，文字被橫向拉寬 2.57 倍變扁胖，波形 path 的垂直邊 `1.8×3.55 = 6.4px`、水平邊 `1.8×1.38 = 2.5px` 粗細不一致。故不採用。

**採用的解法**：維持等比縮放，但讓 **viewBox 的長寬比等於元素的長寬比**——viewBox 高度固定 116，寬度改由 `ispRevRenderWave()` 依元素實際寬度動態換算（`totalW = elW / scale`，`scale = elH / 116`）。這樣 x、y 縮放比都是 1.3793（等比、不變形），內容寬度剛好等於元素寬度（滿版），高度仍是 160px，只有 bit 變寬（`46.22px` vs 主波形的 `16.55px`）——寬度本來就不在對齊要求內。

**bit 與核取方塊的對齊推導（先量現場幾何，再定值）**：`.isp-rev-cb-row` 寬 428px、左右各 6px padding → 9 欄等寬，間距 `(428-12)/9 = 46.222px`，第一格中心 `36+6+23.111 = 65.111`。`.isp-rev-wave-wrap` 有 1px border，故 SVG 左緣比 cb-row 左緣右移 1px、寬 426px。令波形 pad 渲染後為 `PAD_PX`、bit 寬為 `bitW_px`，要對所有 i 成立 `1 + PAD_PX + (i+0.5)·bitW_px = 6 + (i+0.5)·46.222`，解得 **`PAD_PX = 5`**、`bitW_px = 46.222`；且 `2×5 + 9×46.222 = 426` 與 SVG 寬完全吻合。程式中以 `pad = 5 / scale`、`bitW = (totalW - 2·pad) / 9` 實作。

**改動（`isp.html`）**：
- `ispRevRenderWave()`：`totalW` / `pad` / `bitW` 由固定值（120 / 6 / 12）改為依 `getBoundingClientRect()` 動態計算；垂直向的 `labelH 22 / waveH 72 / axisH 22`、font-size、stroke-width **一律不動**。`elW`/`elH` 為 0（layout 未完成）時排一次 `requestAnimationFrame` 重畫。
- 新增模組變數 `_revGeom = { pad, bitW }`，由 `ispRevRenderWave()` 寫入；點擊映射改讀它（原本 v1.18.1 寫死 `pad=6, bitW=12`，在動態 viewBox 下會失準）。`getScreenCTM().inverse()` 的作法保留。
- 0/1 位準標籤 x 由 `pad - 2` 改為 `pad`（pad 從 6 單位縮到 3.625 單位，不改會被左邊界裁掉更多）。
- `ispRevBuildUI()` 新增 window `resize` 監聽（debounce 100ms）重畫——viewBox 綁在容器寬度上，容器變寬變窄都必須重畫才會繼續對齊。
- CSS `.isp-rev-wave-wrap svg` 維持 `width:100%; height:160px`，只更新註解。

**驗證（Chrome 實機量測）**：

高度（要求 5）：

| 量測項 | 差動訊號波形卡片 | 波形反推卡片 |
|---|---|---|
| SVG 元素高度 | 160.00 px | **160.00 px** |
| 垂直縮放比 | 1.3793 | **1.3793** |
| 訊號振幅（0↔1） | 88.28 px | **88.28 px** |

反推卡片 viewBox 為 `0 0 308.85 116`，`scaleX = scaleY = 1.3793`（**等比，無變形**）。

bit 中心 vs 核取方塊中心（要求 3，單位 px，同一 client 座標系）：

| bit | b0 | b1 | b2 | b3 | b4 | b5 | b6 | b7 | b8 |
|---|---|---|---|---|---|---|---|---|---|
| 波形 bit 中心 | 65.11 | 111.33 | 157.56 | 203.78 | 250.00 | 296.22 | 342.44 | 388.67 | 434.89 |
| 核取方塊中心 | 65.11 | 111.33 | 157.55 | 203.77 | 250.00 | 296.22 | 342.45 | 388.66 | 434.89 |
| 差值 | 0 | 0 | +0.01 | +0.01 | 0 | 0 | −0.01 | +0.01 | 0 |

差值不是全 0 的原因：兩邊都是 `(W-12)/9 = 46.2222…` 的無限循環小數，瀏覽器各自以 double 累加後在小數第 2 位出現捨入殘差。最大 0.01px，遠低於 1 個 CSS 像素，非系統性偏移（若公式錯會是等差累積）。

點擊映射（要求 4）：以 document 層 click 探針確認 client 座標後，依序點 `x=65 / 250 / 435`（正是 b0 / b4 / b8 的中心）→ checkbox 變 `100010001`、`0x111 (100010001)`、DLL 反推 `L136 (0x88)`。邊界：點左 pad 區 `x=39` 與右 pad 區 `x=462`，事件確實命中 SVG 但**不觸發 toggle**（值維持 `011101111`）。

RWD：卡片寬度掃描 320px / 380px / 自動（SVG 寬 290 / 350 / 426px）→ 三者高度皆 160px、`scaleX = scaleY = 1.3793`、對齊誤差最大 0.009px，`resize` 重畫正常。

回歸：搜尋輸入 `BKPOL+` + Enter → `011101111`、`0x1EE`、Command `BKPOL+ (DLL-BK)`、DLL Data `L247 (0xF7)`，波形正確。重新載入後 console 無任何錯誤或訊息；主波形 SVG（532 節點）正常。

**已知既有瑕疵（本次未動，非本次造成）**：左側 0/1 位準標籤採 `text-anchor="end"`，字會些微超出 viewBox 左邊界被裁——實測「1」裁 0.99px、「0」裁 3.05px。主波形卡片 `ispBuildSvgInner()` 用同一套寫法（`x = pad - 2`），「0」同樣裁掉約 31%，屬全站一致的既有行為。要完整顯示就得侵入 bit0 區約 3px 並與波形線重疊，已超出本次「只改高度」的範圍，留待 Bruce 決定是否另案處理。

**版本同步**：`common/version.js` `isp: v1.18.1 → v1.18.2`；`isp.html` `version.js?v` 與 `i18n.js?v` 皆 `20260731isp4 → 20260731isp5`。本次無新增 i18n 字串。

---

## iSP 波形產生器 (isp) v1.18.1 — 2026-07-31

**Bruce 需求**：「那個波形輸入區高度太高了，波形高度跟差動訊號波形卡片的訊號高度一樣就好」——指波形反推卡片下方的 9-bit 波形顯示區。

**照抄的來源值（非自挑數字）**：差動訊號波形卡片的 SVG 用 `.isp-wave-svg { height: 160px; }`（`isp.html` CSS）。反推卡片的 `ispRevRenderWave()` 與主波形的 `ispBuildSvgInner()` **viewBox 內部比例本來就相同**（`labelH 22 / waveH 72 / axisH 22`，`bitW 12`、`pad 6`，原 code 註解即寫「Use exact same dimensions/proportions as ispBuildSvgInner」），所以只要把渲染高度對齊到同一個 `160px`，縮放比、訊號振幅（`waveH-8 = 64` 單位）、波形區高度（72 單位）、每 bit 寬度（12 單位）會**同時**對齊——不存在「該對齊哪一種高度」的分歧，因此未回頭詢問。

**根因**：反推 SVG 原本是 `width:100%` 而未指定 height，viewBox 只有 `120×116`，在寬容器下被等比放大約 3.55 倍，高度衝到 411.8px（主波形固定 160px）。

**改動（`isp.html`，只動高度與其必要配套）**：
- CSS `.isp-rev-wave-wrap svg`：`width:100%; cursor:pointer` → 加上 `height:160px`（與 `.isp-wave-svg` 同值）。SVG 預設 `preserveAspectRatio="xMidYMid meet"`，內容等比置中、不會被橫向拉伸。
- 配套修正（非順手改別的，是固定高度的直接後果）：波形點擊切換 bit 的座標映射原本假設「SVG 內容填滿元素寬度」（用 `rect.width` 推 pad 與 bit 寬），固定高度後內容只佔中間約 165px，該假設失效會導致點擊全部落錯格。改用 `svg.getScreenCTM().inverse()` 把 client 座標轉成 viewBox 座標，再以 `Math.floor((vbX - 6) / 12)` 取 bit index，與縮放／置中無關。
- 隨之 `_revSvgTotalW()` 失去唯一呼叫點，一併移除（僅此一處引用，已 grep 確認）。

**驗證（Chrome 實機量測，`getBoundingClientRect` + viewBox 換算）**：

| 量測項 | 差動訊號波形卡片 | 波形反推卡片（改前） | 波形反推卡片（改後） |
|---|---|---|---|
| SVG 元素高度 | 160.00 px | 411.80 px | **160.00 px** |
| viewBox 縮放比 | 1.3793 | 3.5500 | **1.3793** |
| 訊號振幅（0↔1） | 88.28 px | 227.20 px | **88.28 px** |
| 波形區高度（waveH） | 99.31 px | 255.60 px | **99.31 px** |
| 每 bit 寬度 | 16.55 px | 42.60 px | **16.55 px** |

- 點擊映射：依序點 b0 / b8 / b4 三格 → checkbox 變 `100010001`、`0x111 (100010001)`、DLL 反推 `L136 (0x88)`，位置完全正確；點內容外的左側留白區 → 不誤觸（值維持 `100010001`）。
- v1.18.0 搜尋回歸：輸入 `BKPOL+` + Enter → `011101111`、`0x1EE`、Command `BKPOL+ (DLL-BK)`、DLL Data `L247 (0xF7)`，波形正確繪出。
- 容器寬度掃描（120 / 150 / 200 / 300 / 420 px）：SVG 元素高度恆為 160px；內容完全對齊主波形的臨界容器寬為 `120 × 1.3793 ≈ 165.5px`，低於此值才會轉由寬度限制縮放（實機最窄手機的卡片內容寬約 270px，仍在對齊區間內）。
- 重新載入後 console 無任何錯誤或訊息；主波形、minimap、搜尋清單皆正常。

**版本同步**：`common/version.js` `isp: v1.18.0 → v1.18.1`；`isp.html` `version.js?v` 與 `i18n.js?v` 皆 `20260731isp3 → 20260731isp4`（`i18n.js` 本次內容未變，僅沿用前兩版「兩者同步 bump」的慣例，避免日後誤判漏改）。本次無新增 i18n 字串。

---

## iSP 波形產生器 (isp) v1.18.0 — 2026-07-31

**Bruce 需求**：在「波形反推卡片」增加搜尋功能。(1) 可輸入要搜尋的波形名稱，例如 BKPOL +、BKPOL −，或像 BAC 之類的卡面。(2) 輸入完後要有類似清單可讓使用者選擇，例如輸入 BK 就有 BK、BKPOL+、BKPOL− 可選，輸入 L0 就有 L0(DLL) 或 L0(PLL) 可選；選擇後下方的輸入波形區就會自動變成搜尋的波形。(3) 灰階用 L0 到 L255 來輸入。

**資料來源（未自行發明任何 bit pattern）**：
- 控制碼一律取自 `isp.html` 既有的 `ISP_CTRL`（9-bit LSB-first）與 `ISP_BK_PLL`：`BK`(DLL-BK) `[1,0,0,0,0,1,1,1,1]`、`BK`(PLL-BK) `[0,0,1,0,1,0,1,0,1]`、`BAC`、`POL+`、`POL-`、`SET`、`EOL`、`BKPOL+`、`BKPOL-`，共 9 筆。
- 灰階 L0~L255 取自既有 `ISP_DLL_LUT` / `ISP_PLL_LUT`（即 `ispEncodeByte()` 使用的同一組 8B9B LUT），DLL 與 PLL 各 256 筆、共 512 筆。索引總計 521 筆。

**6-bit / 8-bit 的處理依據（讀 code 後的結論，非推測）**：`ispBuild6bDataSegs()`（isp.html）顯示 6-bit 模式的差異只在上游——把每 pixel 的 R/G/B 各 6 bits 串成 LSB-first bit stream、每 8 bits 切成一個 byte；切出的 byte 一樣送進 `ispEncodeByte()` 做 8B9B。也就是**「9-bit packet ↔ byte(0~255)」的映射在 6-bit 與 8-bit 完全相同**，且反推卡片本來就是獨立工具（原註解：「反推卡片永遠顯示（獨立工具，不隨 bits 模式切換）」）。因此 L0~L255 指的是 data byte 值，搜尋索引與結果在兩種模式下一致；變體是 DLL / PLL 兩種編碼，而非 6-bit / 8-bit。此結論以 6-bit 與 8-bit 各實測一輪坐實（見下方驗證）。

**改動（`isp.html`）**：
- 反推卡片 `card-body` 內、hint 之後新增搜尋列 `.isp-rev-search`：放大鏡圖示 + `#isp-rev-search-input`（`data-i18n-ph`）+ `#isp-rev-search-clear`（×），下方 `#isp-rev-search-list` 為絕對定位的候選清單；另加一行說明 hint（`isp.revSearchHint`）。
- CSS 新增 `.isp-rev-search*` 一組（沿用既有深藍暗色主題：`#0f172a` 底、`#334155` 邊框、focus-within 轉 `#3b82f6`；清單 `#1e293b` + 藍框 + 陰影，`max-height:240px` 可捲動）。
- JS 新增（皆掛在既有 IIFE 內，沿用 `isp` 前綴）：`ispRevGetSearchIndex()`（惰性建索引並快取）、`ispRevSearchFilter()`、`ispRevSearchRender()`、`ispRevSearchClose()`、`ispRevSearchSetActive()`、`ispRevSearchApply()`、`ispRevBuildSearchUI()`，以及輔助 `_revBitsFromVal` / `_revValFromBits` / `_revSearchDisplayName` / `_revSearchBitStr`。
- 比對規則：不分大小寫。排序分數 = 名稱完全相符(0) → 名稱前綴(1) → 名稱包含(2) → 含 kind 的全名包含(3)，同分依索引原序（控制碼在前、L 由小到大）。最多顯示 40 筆，超出顯示「另有 N 筆」。
- 選取後 `ispRevSearchApply()` 直接寫入 `_revBits`、同步 9 個 checkbox，再呼叫既有的 `ispRevRenderWave()` + `ispRevUpdate()`，也就是走原本的反推流程，沒有另開分支。
- 操作方式：滑鼠點選（用 `mousedown` + `preventDefault`，避免 input blur 先關掉清單）、鍵盤 ↑/↓ 移動 + Enter 套用（未移動時 Enter 取第一筆）、Esc 關閉、× 清除搜尋字（已填入的 9-bit 保留不動）。
- 初始化：`ispInit()` 內 `ispRevBuildUI()` 之後呼叫 `ispRevBuildSearchUI()`（需在 `_revCBs` 建好之後）。

**i18n（`common/i18n.js`，三語齊備）**：新增 `isp.revSearchPh`（placeholder）、`isp.revSearchHint`、`isp.revSearchClear`（aria-label）、`isp.revSearchNone`、`isp.revSearchMore`（含 `{n}`）。

**驗證（Chrome 實機、真實鍵盤與滑鼠操作，非只讀 code）**：
- 輸入 `BK` → 清單 4 筆：`BK/DLL-BK 100001111`、`BK/PLL-BK 001010101`、`BKPOL+ 011101111`、`BKPOL- 100010000`（與 `ISP_CTRL`／`ISP_BK_PLL` 逐 bit 相符）。
- 輸入 `L0` → 只有 2 筆：`L0 (DLL) 100000000`（0x001）、`L0 (PLL) 110010110`（0x0D3），與 `ISP_DLL_LUT[0]=0x001`、`ISP_PLL_LUT[0]=0x0D3` 相符。
- 輸入 `POL` → `POL+ 011001111`、`POL- 100110000`、`BKPOL+`、`BKPOL-`；輸入 `E` → `EOL 011111100`、`SET 100000011`。
- 輸入 `BAC` + Enter（8-bit）→ 下方 checkbox 變 `011110000`、9-bit 值 `0x01E (011110000)`、Command 顯示 `BAC (DLL-BK)`、DLL Data `L15 (0x0F)`；波形圖同步變為 b1~b4 為高。
- 灰階 8-bit：`L128`+Enter → `0x101 (100000001)`、DLL 反推回 `L128 (0x80)`；`L0` ↓↓+Enter 選 PLL → `0x0D3 (110010110)`、PLL 反推回 `L0 (0x00)`；`L255`+Enter → `0x1FE (011111111)`、DLL 反推回 `L255 (0xFF)`。
- 灰階 6-bit（點「6 bits」切換後重測）：`L0`→`0x001`、`L128`→`0x101`、`L255`→`0x1FE`，與 8-bit 完全相同；6-bit 下 `BK` 清單、`BAC` 滑鼠點選（→`0x01E`）亦正常。
- 滑鼠點選候選：`L200 (PLL)`→`0x191 (100010011)`、`L100 (PLL)`→`0x0C9 (100100110)`（DLL/PLL 同碼，兩列反推皆回 L100）。
- 排序：輸入 `L25` → 14 筆且 `L25` 排第一（其後 L250~L255）；輸入 `L1` → 顯示 40 筆 + 「另有 182 筆」（40+182=222=(L1,L10~L19,L100~L199)×2）。
- 三語：`繁體中文` / `English` / `简体中文` 切換後 placeholder、說明 hint、清除鈕 aria-label、「找不到符合的波形名稱 / No matching waveform name / 找不到符合的波形名称」、「另有 N 筆 / N more — keep typing to narrow down」皆正確。
- Esc 關閉清單、× 清除輸入（已填入的 9-bit 保留）皆正常；重新載入頁面後 console 無任何錯誤或訊息；主波形 SVG（532 個節點）、minimap、反推波形皆正常渲染，無回歸。

**版本同步**：`common/version.js` `isp: v1.17.0 → v1.18.0`；`isp.html` `version.js?v` 與 `i18n.js?v` 皆 `20260731isp2 → 20260731isp3`。

---

## iSP 波形產生器 (isp) v1.17.0 — 2026-07-31

**Bruce 需求**：iSP 分頁「模式設定」卡片中多增加一個 BKPOL 按鍵。(1) ON/OFF 選項，預設 ON。(2) 開啟時仿照 iSP REG Setting 的方式，前面跟後面都包 BK。(3) 本身是 BAC，再加上 BKPOL 正或負；點一下 BKPOL 就正轉負／負轉正，跟 POL 一樣。BKPOL 正／負的定義去查 iSP 分頁既有的資料庫。

**BKPOL 正／負來源（未自行發明）**：`isp.html` 既有 control code 表 `ISP_CTRL`（9-bit LSB-first）本來就已定義但從未被使用：`'BKPOL+' = [0,1,1,1,0,1,1,1,1]`、`'BKPOL-' = [1,0,0,0,1,0,0,0,0]`。本次直接沿用這兩筆，一個 bit 都沒改。

**格式依據**：RM96K80 / RM96H60 / RM96681 datasheet §8.3.2「Special process for the first VBK line」——「When the Rx receive the **BAC+BKPOL** code **after the EOL** code…」，時序圖為 `… EOL │ BK BAC BKPOL± BK`。故 BKPOL 段＝`BK×bkBefore · BAC · BKPOL± · BK×bkAfter`，**本身不帶 EOL**（與 Setting line 帶 EOL 的差別），位置在 frame 末端（Data line、以及有開的話 Setting line 之後）。

**改動（`isp.html`）**：
- 模式設定卡片新增 BKPOL 欄位：radio `isp-bkpol-on` / `isp-bkpol-off`，`on` 為 `checked`（預設 ON），沿用既有 `.radio-group`/`.radio-opt` 樣式與 `.field-hint` 說明。事件不需另接——既有 `#page-isp input[type="radio"]` 的 change 委派會呼叫 `ispRender()`。
- `COLOR.BKPOL = '#14b8a6'`（藍綠，與 POL 的青 `#06b6d4`、BAC 的黃 `#eab308` 區隔）；圖例新增 BKPOL 色點。
- 新增狀態 `ispBkpolSign`（`'+'`／`'-'`，預設 `'+'`），與 `ispPolSign` **各自獨立**。
- `ispBuildFrame()`（1-pair）：Setting line 之後，`bkpolEnable` 為真時 push `BK×bkBefore` → `BAC` → `BKPOL±`（`kind:'bkpol'`）→ `BK×bkAfter`。
- `ispBuild2PairFrames()`（2-pair）：新增 `makeBkpolLine()`，比照 `makeSettingLine()` 的作法，pair0/pair1 各自附加（pair1 用 `.map(s => ({...s}))` 淺拷貝，與既有 ctrl/end/setting 一致）。
- `ispBuildSvgInner()`：`seg.kind === 'bkpol'` 時掛 `onclick="ispToggleBkpol()"` + `cursor:pointer`，與 POL 走同一組 `polAttrs`（背景 rect／label 色塊／label 文字三處都掛），故全螢幕模式一樣可點。
- 新增 `window.ispToggleBkpol()`：`'+' ↔ '-'` 後 `ispRender()`，行為與 `ispTogglePol()` 對稱。
- `ispRender()`：讀 `isp-bkpol-off` 判斷開關（找不到元素亦視為 ON），併入 `buildParams`；1-pair 與 2-pair 兩個分支的 Frame 資訊列都追加 `+ BK×n · BAC · BKPOL± · BK×n`（OFF 時不顯示）。

**i18n（`common/i18n.js`，三語齊備）**：新增 `isp.bkpol` / `isp.bkpolOn` / `isp.bkpolOff` / `isp.bkpolHint` / `isp.legBKPOL`。

**驗證（Chrome 實機操作，非只讀 code）**：預設載入即為 ON 且波形末端出現 `BK BAC BKPOL+ BK`；切 OFF → 末端 BKPOL 段整段消失、資訊列不再出現 BKPOL、總 bit 數對應減少；切回 ON → 段落復原且 BK 前後包法與 REG Setting line 相同（同樣取 `bkBefore`/`bkAfter`）；連點 BKPOL 色塊 4 次 → `+ → − → + → − → +` 正確互換且 POL 不受影響；反向點 POL 亦不影響 BKPOL；REG Setting 開／關與 2-pair 模式回歸正常。

**版本同步**：`common/version.js` `isp: v1.16.1 → v1.17.0`；`isp.html` `version.js?v` `20260709isp1 → 20260731isp2`、`i18n.js?v` `20260519 → 20260731isp2`（i18n 新增字串，cache buster 一併 bump）。

---

## TCON 波形產生器 (wfg) v2.97.475 — 2026-07-19

**Bruce 需求**：接續 v2.97.474。LA 分頁凡使用者能看到的地方，型號與廠商商標字樣一律不留。這次針對前一輪點名、先沒動的部分——LA 面板底下的診斷/狀態/init/probe log 顯示行（初始化、偵測、匯入、上傳時的英文技術狀態），仍有 M16-200 / M16-100 / M16S-100 / M16-500 / M32-500 / X1 / 16ch / 200MHz / A2 等型號能力字樣，使用者看得到，改成中性。

**判準**：使用者在畫面上（`#wfg-la-log` 面板、彈窗、下拉）看得到的字串，含型號代號／通道數頻率能力／修訂版者一律清；純內部（變數／函式名／IndexedDB key／magic 表 `model`/`fpga` 欄／kvset XML 標籤）與辨識邏輯／選檔／匯入流程一律不碰，只改顯示字串。

**改動（`wfg.html` — 只改渲染字串，未動任何辨識/選檔/匯入邏輯）**：
- init 診斷行 `identified model=…`：去掉 `model=`（原輸出 `M16-200-A2` 之中性代號），只留 `magic`/`magic2`/`source`（純值，無型號）。
- `probe` 診斷行 `identify: … model=…`：同上去 `model=`。
- FPGA bitstream 目標行：`FPGA bitstream target (auto-selected): M16-200-A2` → `FPGA bitstream target auto-selected for this device.`。
- 未知修訂警告：`… will NOT fall back to M16-200-A1.` → `… will NOT fall back to a default bitstream.`；`model table` → `reference table`。
- `model specs: 200MHz max, 16ch, memory=…` 行整行移除（純能力揭露，唯一去處是型號辨識）；相容性警告 `以 16ch、板載記憶體、<=200MHz 機型（M16-200/M16-100）為準` → `以標準相容裝置為準`（判斷邏輯 `ident.specs.ch!==16 || …` 內部保留不變，只是不再向使用者顯示數值）。
- bitstream 選定/上傳行：`FPGA bitstream selected: <檔名> bytes=…` / `FPGA bitstream upload: <檔名> bytes=…` → 只留 `bytes=…`（v4 包檔名如 `fpga-M16-200-…` 含型號代號）。
- 檔案包匯入狀態行（v4／v3／v2／legacy 四分支＋資料夾匯入）：`fpga[M16-200-A2] imported/stored: <檔名/路徑> bytes=…` → `fpga bitstream imported/stored: bytes=…`；`skipped unknown code <代號>` → `skipped unrecognized entry`；匯入驗證改看每檔位元組數＋末尾 `SHA256 verified` 總結行（不靠型號代號）。
- 未知修訂錯誤：去掉「（提示：檔案包另收錄 X1 保留 bitstream…）」X1 字樣。
- 缺 bitstream 錯誤：`缺少 M16-200-A2 bitstream（裝置判定為 M16-200）` → `缺少對應此裝置的 bitstream`。
- Device Model 下拉可見標籤：`16通道 200MHz 型號 / 相容`、`16通道 100MHz 型號` → `裝置類型一（預設 / 相容）`、`裝置類型二`（`value="M16-200"/"M16-100"` 隱藏值不變，選檔評分邏輯不受影響）。

**改動（`legacy-index.html` 舊凍結頁，同類渲染行）**：`identified model=`、`identify: … model=` 去 `model=`；`M16-200 WebUSB protocol probe` / `M16-200 capture` → `Logic analyzer …`；`fpga imported: <檔名>` / `FPGA bitstream upload: <檔名>` → 只留 `bytes=`；Device Model 下拉 `M16-200 / 相容`、`M16-100` → `裝置類型一/二`。

**保留（判斷後未清，列出供裁決）**：
- 取樣率下拉 `200 MHz / 100 MHz / …`：為使用者自選的功能參數（任何邏輯分析儀通用），非型號能力揭露，保留。
- 檔案包 size/SHA256 mismatch 錯誤仍顯示 `info.name`（如 `fpga-M16-200-…`）：僅在檔案包損毀時觸發，檔名是判斷哪個檔壞掉的除錯關鍵，暫留；如要一併清可改為只報位元組數。
- `fx2:<pid> imported: mcu-<pid>.bin`、`Selected folder: <使用者資料夾名>`、`fx2 firmware upload: <mcu 檔名>`：PID 為 USB 十六進位值、資料夾名為使用者自訂、mcu 檔名不含型號代號，均非型號/商標，保留。
- 內部 `WFG_LA_MODEL_TABLE` 的 `model`/`fpga` 欄、`wfgLaNeutralFpgaCode`／`WFG_LA_V4_FPGA_KEY_MAP`、IndexedDB key、kvset XML 標籤：不渲染或為互通硬限制，維持 v2.97.473 定義不動。

**驗證**：`node --check`（以 `<script>` 抽出）通過；grep 確認兩檔可見 sink（`lines.push`/`throw`/`<option>` 可見文字）已無 `M16-/M32-/M16S/-A1/-A2/型號/16通道` 型號 token；Chrome 實測觸發 init/probe log 面板，截圖確認顯示中性文字；辨識/選檔邏輯（magic 表、`ident.specs` 判斷、`value` 屬性）未改，回歸不受影響。

**版本同步**：`common/version.js` `wfg: v2.97.474 → v2.97.475`；`wfg.html` `version.js?v` / `i18n.js?v` → `20260719wfg474 → 20260719wfg475`。

---

## TCON 波形產生器 (wfg) v2.97.474 — 2026-07-19

**Bruce 需求**：LA 分頁「WebUSB 檔案包準備」彈窗不用再寫「（此包支援全系列……）」——去商標化已把型號都避開，使用者操作上也不需要知道這些內部技術能力描述。

**改動**（只動 `common/i18n.js` 使用者可見字串，未動任何辨識邏輯／檔案匯入流程／magic／PID 選檔）：
- `wfg.laGuideStep1`（檔案包準備彈窗步驟一）：移除括號內「此包支援全系列機型：M16-100／M16S-100／M16-200（含新 Type-C 版 A2 修訂）／M16-500／M32-500」型號能力描述，只保留操作指示（若無檔案包 → 聯絡 Bruce → 檔名 `la-device-support-pack-v4.zip`）。
- `wfg.laLegacyPackageWarn` / `wfg.laV2PackageWarn`（匯入舊版包警告）：移除「僅含 M16-200-A1 bitstream」「16通道200MHz 機型」「A2 修訂」「M16S-100／M16-500／M32-500」等型號枚舉與修訂版說明，簡化為「此為舊版檔案包，部分裝置可能無法使用。請改匯入新版 v4」——保留「舊版包可能不支援你的裝置、請改匯入 v4」這條操作必需的警告。
- `wfg.laV3PackageWarn`（匯入 v3 舊檔名包）：移除「舊檔名／全中性檔名」內部說明，簡化為「此為舊版檔案包，仍可正常使用；建議改用新版 v4」——保留「v3 仍可用、但建議升級」的操作意義。

**保留（操作必需，非型號能力描述）**：`laContactBody`（聯絡 Bruce＋檔名＋回上一視窗按匯入）、`laSecondStageNote` / `laReconnectSelectNote`（Chrome USB 視窗要選哪顆裝置，含 `77a1:01a2` 供使用者在系統對話框中辨認）——皆為使用者實際操作步驟指示，非「支援哪些型號」的能力宣傳，故不砍。

**未涉及**：`legacy-index.html` 的 `laGuideStep1` 為更舊版本文字（「開啟下載頁、輸入分享密碼」），本就不含「支援全系列／型號能力」描述，無需改。log 面板診斷行（英文技術狀態）非彈窗，不在本次範圍。

**版本同步**：`common/version.js` `wfg: v2.97.473 → v2.97.474`；`wfg.html` `version.js?v` / `i18n.js?v` → `20260718wfg473 → 20260719wfg474`。

---

## TCON 波形產生器 (wfg) v2.97.473 — 2026-07-18

**Bruce 需求**：延續 v2.97.472 去商標化——可見層已乾淨，但原始碼層（`legacy-index.html` 舊頁、`wfg.html` 內部函式名／變數名／註解／舊包辨識比對字串等）仍殘留不渲染但公開可 view-source 的廠商與產品字樣。目標：全 repo（git-tracked＝GitHub Pages 公開可抓）「不要留下任何相關文字」，能清就清，不能清的必須有站得住腳的技術理由。

**改動**：
- `wfg.html` 內部字串全面中性化：8 個含廠商名的函式改中性名（裝置判定／介面搶奪／資料夾匯入／I2C 參數解析等）並同步所有呼叫處、`window.*` 匯出、HTML `onchange` 綁定；版面判定變數改中性名（→`oemLayout`）；註解、狀態列與 log 顯示文字之廠商／產品字樣全改中性稱呼；magic 對照表 `model` 欄與 Device Model 下拉選項值、預設值、評分分支比較字串全部改中性家族代號（M16-200／M16-100／M16S-100／M16-500／M32-500），且下拉選項值、kvdat 解析回填、`setSelectValue` 三處保持一致。
- 「舊包／原廠資料夾辨識」由「比對廠商字串」改為「結構特徵識別」：檔案包版本判定改依 manifest 結構（是否含 mcu／fpga 物件＋version 門檻）而非 package 名稱字串；原廠資料夾 firmware 掃描改依副檔名與 USB PID 結構樣式（`(?:^|[-_])<4碼hex>.fw`、可選前綴的 `<代號>-fpga.bitstream`、任一 `.exe` 掃描資源提示）而非固定廠商檔名——真實原廠檔名（帶或不帶廠商前綴）仍可被辨識，功能相容不變。
- `legacy-index.html`（舊版整頁）全面中性化：可見下拉選項、i18n 字串、彈窗／log 顯示文字、函式名、註解、magic 標籤全部改中性；此頁為凍結舊頁，其硬體功能已由 `wfg.html` 取代。
- 3 個 LA preset snapshot 的 `settings.model` 標籤由產品名改中性代號，並連動 snapshot 快取字串 `?v=`。
- 版號 wfg→v2.97.473、快取 `?v=20260718wfg473`。

**保留（技術硬限制，逐條理由）**：
- **kvset／kvdat XML 裝置標籤**（產生器輸出、解析用 `getElementsByTagName`／`querySelector`、內建 preset XML）：此為原廠軟體的檔案交換格式元素名。本工具匯出檔需被原廠軟體開啟、且需解析原廠軟體匯出的檔——改標籤名即破壞雙向互通。
- **firmware IndexedDB 資料庫名與 fpga 儲存代號／magic 對照表 fpga 欄**：為使用者瀏覽器內既已寫入的持久化鍵，且 v3 舊檔案包 manifest 的 fpga key 亦使用此代號（外部既存資料）——變更會使既有安裝與舊包匯入失效。
- **原廠資料夾檔名比對子字串**（firmware 評分用 `indexOf` 子字串）：比對的是使用者拖入的原廠軟體安裝資料夾內實際檔名——移除會使「從原廠資料夾匯入 firmware」無法辨識檔案。
- **顯示層去商標化 helper 的比對樣式**（`wfgLaNeutralText` 內兩條 regex）：此樣式必須包含原廠關鍵字，才能在顯示前將其自動從動態檔名／路徑字串中移除。
- 以上保留項皆不在頁面渲染範圍；如需進一步清除，需 Bruce 裁決是否放棄「舊包相容／原廠資料夾匯入／原廠軟體檔案互通」等對應功能。

## TCON 波形產生器 (wfg) v2.97.472 — 2026-07-18

**Bruce 需求**：「之前你還要我注意版權問題，但現在卻直接將原廠軟體的字樣，還有硬體名稱，直接大咧咧的寫在網頁跟壓縮包上，請更新名稱，避免之前說的版權問題。」——LA 分頁與韌體包全面「去商標化」。

**改動**：
- 新裝置支援包 `la-device-support-pack-v4.zip`（`~/Documents/TCON/Share/`，不進 git/Pages）：19 檔全部改中性檔名（`mcu-<PID>.bin` ×5＋`fpga-<家族代號>.bin` ×13＋manifest.json）；manifest v4（package=`la-device-support-pack`）記錄中性檔名↔PID/magic/家族代號↔SHA256，內容與 v3 逐檔位元相同；manifest 內亦無任何廠商字樣。家族代號：M16-200＝16通道200MHz、M16-100＝16通道100MHz（板載記憶體）、M16S-100＝16通道100MHz（串流）、M16-500＝16通道500MHz、M32-500＝32通道500MHz、X1＝保留項（無 magic 對應）。
- 匯入：`wfgLaImportPackageZip` 新增 v4 分支——manifest.fpga 中性代號經 `WFG_LA_V4_FPGA_KEY_MAP` 轉回內部儲存代號，IndexedDB kind 與 v3 完全相同（`fx2:<pid>`／`fpga:<code>`），magic/PID 選檔邏輯零改動；v3／v2／v1 舊包仍可匯入（依 manifest 內容識別，不依檔名），並提示改用 v4（新 i18n `wfg.laV3PackageWarn`；v1/v2 警告文字同步改指 v4 且中性化）。
- 網頁使用者可見文字全面清掃：彈窗、提示、狀態列、錯誤訊息、按鈕、init/probe/診斷 log 顯示文字之廠商與產品名全改中性稱呼（「原廠軟體」、家族代號 M16-200-A2 等、「名稱含 Logic Analyzer 的裝置」、「VID 77a1 裝置」）；Device Model 下拉選項文字改「16通道 200MHz 型號 / 相容」「16通道 100MHz 型號」（value 維持內部識別用）。
- 新增顯示層中性化 helper：`wfgLaNeutralFpgaCode()`（內部儲存代號→中性代號）與 `wfgLaNeutralText()`（動態檔名/路徑顯示前去商標，只影響顯示不影響比對/儲存）。
- CHANGELOG 公開內容同步中性化：本檔置於 git/Pages 可公開存取（無頁面渲染），歷史條目商標字樣全數改寫為中性描述（版號/日期/語意不變）。
- 程式內部變數/函式名/註解與 kvset/kvdat 檔案格式相容所需字串（XML 標籤、package-id 辨識字串、原廠資料夾掃描的檔名 regex）不在公開渲染範圍，維持不動以保功能相容。
- 版號 wfg→v2.97.472、快取 `?v=20260718wfg472`。

## TCON 波形產生器 (wfg) v2.97.471 — 2026-07-18

**Bruce 需求**：「Y，但要注意壓縮包檔名要重新命名，網頁對應的名稱也要，重點是原廠軟體全系列都可用」——韌體包升級 v3，原廠軟體 全系列硬體（M16S-100/M16-100/M16-200/M16-500/M32-500）都可用；壓縮包重新命名、網頁對應名稱同步更換。

**求證（libsigrok master，2026-07-18 抓取）**：
- `protocol.c` `MCU_FWFILE_FMT "PID命名.fw（mcu-%04x）"`＝MCU 韌體檔名**直接以 USB PID 格式化**（`M16-200_upload_firmware` 以 `devc->usb_pid` 組檔名）→ 網頁可做「PID→fw 檔名」純函數對應，無需型號猜測。
- `protocol.h` `M16-200_VID 0x77a1 / M16-200_PID 0x01a2`＝libsigrok 掃描唯一記載的 PID；01a1/01a3/01a4/03a1 為 原廠軟體 資源收錄、libsigrok 無 device match 記載（照實標註於 manifest）。
- `models[]` 15 項 magic 對照與 v2.97.470 已入表者逐項一致；本輪補上同表的規格欄（rateMHz/ch/memGbit/baseMHz）。

**改動**：
- 新檔案包 `裝置支援包v3.zip（舊檔名）`（`~/Documents/TCON/Share/`，不進 git/Pages）：manifest v3（package=`全系列包識別碼(v3)`）＋全部 18 檔（5 顆 MCU fw：01a1/01a2/01a3/01a4/03a1＋13 顆 bitstream 含 M16S-100-0/a1/a2、M16-500/a1/a2、M32-500-0、X1），逐檔 SHA256 與 `extracted-sha256-20260718.txt` 相符；`M16-500`（無後綴）與 `X1` 照實標「libsigrok 無 magic 指向此檔」。
- MCU 韌體依 USB PID 全自動選檔：新增 `wfgLaSelectStoredMcuFirmware(dev)`（IndexedDB 新增 `fx2:<pid>` 多筆；PID=01a2 可退回 legacy `fx2`；缺檔明確報「缺 mcu-<pid> 檔」不亂頂替）；init 改用之。
- 匯入：`wfgLaImportPackageZip` 新增 allseries v3 分支（mcu×5＋fpga×13 全檔 SHA256 驗證；01a2 雙寫 legacy `fx2` 保回歸）；匯入 v2 舊包仍可用但警告指名 v3 新檔名（新 i18n `wfg.laV2PackageWarn`）；v1 舊包警告文字同步改指 v3。
- `wfgLaHasStoredFirmwarePackage` 認得 `fx2:<pid>`；資料夾掃描匯入同步存 `fx2:<pid>`、bitstream regex 擴為全系列（含 X1）。
- `wfgLaLooksPreFirmwareDevice` 不再限定 PID 0x01a2（任何 VID 0x77a1 適用同判定）；USB filter 改 wildcard 77a1＋08a9；所有「77a1:01a2」提示文字改「原廠 (VID 77a1) 裝置」。
- init log 誠實顯示 libsigrok 規格；非「16ch＋板載記憶體＋≤200MHz」機型明示**本版僅保證初始化可用**。
- 彈窗/引導/聯絡文案（laGuideStep1/laContactBody/laLegacyPackageWarn）全部換 v3 檔名；grep v2 檔名於程式碼＝0（CHANGELOG 歷史除外；`多包識別碼(v2)` package-id 字串屬 v2 包匯入辨識功能必須保留）。

**各家族功能適配限制（誠實清單，本輪不動核心擷取邏輯）**：
- M16S-100（memGbit=0，streaming-only）：本網頁擷取為板載記憶體下載流程，**不適用**；僅保證初始化。
- M32-500（32ch）：擷取路徑為 16ch 資料格式（api.c 32ch 需 uint32＋2-byte sequence），僅保證初始化。
- M16-500（500MHz、baseclock 800MHz）：取樣率 UI/換算為 200/100MHz 設計，僅保證初始化。
- PID 01a4 韌體 142KB 遠超典型 FX2 64KiB，上傳協定可能不同，未驗證。
- X1：libsigrok 無記載，bitstream 已收錄但辨識碼未知；偵測到未知 magic 顯示 magic 值，不自動對應。
- PWM 時脈沿用 200MHz（libsigrok 僅記載 M16-200/M16-100）。

**驗證**：v3 包 zip 讀回 19 檔逐檔 SHA256/size 全驗 OK；node harness 單元測試 28/28（15 項 magic→bitstream＋specs、unknown/invalid/secondary、PID→fw 選檔含缺檔文案、bitstream 缺檔/legacy fallback/未知 magic 文案）；Chrome localhost 實測匯入 v3→IndexedDB 讀回 fx2:5＋fpga:13＋legacy fx2、匯入 v2 舊包出現指名 v3 警告、彈窗截圖確認新檔名；M16-200 舊流程回歸靠 legacy fallback 單測＋v2 匯入路徑不動。硬體端到端（Type-C 與舊機驗收條件）照舊留 Bruce 實機。版號 wfg→v2.97.471、快取 `?v=20260718wfg471`。

## TCON 波形產生器 (wfg) v2.97.470 — 2026-07-18

**Bruce 需求**：LA 分頁同時相容舊硬體與新 Type-C 版 M16-200（USB 同 VID/PID 0x77A1:0x01A2）。(1) 新壓縮包用不一樣的檔名以便區別；(2) 網頁所有彈窗提示的壓縮包檔名一併換新；(3) 不做手動選擇——全自動判斷新舊硬體並抓取對應初始化檔案。

**根因**（前置調查定案）：舊包 `webusb-device-package.zip` 只含 M16-200-1 bitstream；新 Type-C 版依 EEPROM magic（libsigrok 對照表 {0x0b,0x10}→M16-200-2）需要 M16-200-2 bitstream（577,892B），從未進包。

**改動**：
- 新檔案包 `裝置支援包v2.zip（舊檔名）`（本機 `~/Documents/TCON/Share/`，不進 git/Pages）：manifest v2＋fw01A1~A4/03A1 全部 MCU 韌體＋M16-200/M16-200-1/M16-200-2/M16-100/M16-100-1 bitstream，各檔 SHA256。來源：原廠軟體 v3.6.5 Linux 版，開源韌體抽取工具 抽取；與 5/6 既有抽取檔逐檔 SHA256 相符。**M16-200-3 不存在**於 3.6.5 資源（Linux＋Mac 二進位皆掃描確認，修正前次調查報告記載）。
- IndexedDB 多 bitstream：新增 `fpga:<model>` 多筆儲存；`wfgLaHasStoredFirmwarePackage` 認得新舊兩種儲存；`wfgLaListStoredFirmwareKinds` 新增。
- `wfgLaIdentifyMagic` 改用 libsigrok `原廠_model models[]` 完整 15 項對照表（含 0x0b:0x10→M16-200-2；magic2 wildcard 語義同 C 版），回傳 `fpga` 目標欄位。
- init（`wfgLaInitHardwareFromStoredFirmware`）：讀 EEPROM magic 後**全自動**選檔上傳（`wfgLaSelectStoredBitstream`）；unknown magic 明確顯示「未知修訂＋magic/magic2 值」絕不默默用 a1；「FPGA 已可用就跳過上傳」檢查原樣保留；舊包單 blob 僅在判定為 M16-200/M16-200-1 時作 legacy fallback（舊硬體回歸不壞）。
- 匯入：`wfgLaImportPackageZip` 支援 multipack v2（全檔 SHA256 驗證）；匯入舊包仍可用但跳出「此為舊版包，缺新硬體支援，請改匯入新檔名」提示（`wfg.laLegacyPackageWarn`）。資料夾掃描匯入路徑同步存 per-model bitstream。
- 彈窗/引導文字（`wfg.laGuideStep1`/`wfg.laContactBody`）改為指名新檔名；全 repo grep 舊檔名字串＝0。

**驗證**：`node --check` 通過；Chrome 實測匯入新包→IndexedDB 讀回 fx2＋5 顆 bitstream；magic→檔案選擇單元驗證（0x0b:0x10→a2、0x08→a1、0x02:0x01→a1、0x02:0x00→M16-200、unknown 0x0d→報錯文案、invalid→報錯）；彈窗截圖確認新檔名。硬體端到端（新 Type-C 斷電重插不開原廠 UI 直接初始化＋觸發＋記錄；舊硬體回歸）留 Bruce 實機驗收。版號 wfg→v2.97.470、快取字串 `?v=20260718wfg470`（version.js/i18n.js）。

## TCON 波形產生器 (wfg) v2.97.469 — 2026-07-14

**Bruce 需求**：把 LA 分頁即時測量卡的「選定通道量測（最多 4）」區塊，移植到主波形分頁（TCON Timing 調整練習）的「即時測量」卡，兩邊一致。每個量測項顯示 頻率／正脈寬／負脈寬／週期／佔空比，計算語義與 LA 版一致，用主波形自己的資料算，phase 與 kvdat 兩模式都要能運作。

**LA 版計算與主波形資料模型的對應（先讀再做，指行）**：
- LA 版 `wfgLaMeasComputeChannel`（7277）吃 `wfgLaGetWaveform(cfg,ch)`（5224）回傳的 `{edges:[時間], initialLevel}`，用 `wfgLaEdgeTypeForIndex`（6184）判緣別，找第一個上升緣後的第一個完整週期：正脈寬=下降−上升、週期=下一上升−本上升、負脈寬=週期−正脈寬、頻率=1/週期、佔空比=正脈寬/週期。
- 主波形有兩種資料模型（皆非 LA 的 logic channel）：
  - **phase 模式**：訊號＝`wfgChannels[i]`（`.visible && .gpioIdx≥0`，排除類比 `waveform_type`）。取邊緣沿用 hover 版路徑：`wfgEnsureTransitions()`（3304）→ `wfgGetOaxForRange(gpioIdx, cache.transitions, cache.effHtotal, 0, wfgTotalLines())`（15422）拿 `{transitions:[{line,dly,level}], initLevel}`；分數線位置＝`line + dly/effHtotal`，秒＝分數線 × `timePerLine`，`timePerLine = dclkPerLine/(dclk×1e6)`、`dclkPerLine = dual? htotal/4 : htotal/2`（與 22475/22343 一致）。`initialLevel = oax.initLevel`。
  - **kvdat 模式**：訊號＝`wfgKvdatChannels[i]`，`.edges` 為 sample 單位，秒＝`sample/wfgKvdatSmpFreqX1000`（與 22653 一致）；kvdat 起始為 LOW，故 `initialLevel=0`。
- 兩模式各自取前 8 個交替邊緣（足以涵蓋第一個完整週期）後，統一套用與 LA 完全相同的週期演算法（重用純函式 `wfgLaEdgeTypeForIndex`／`wfgLaTimeLabel`／`wfgLaFreqLabel`，未改 LA 那套）。通道選單、顏色、預設通道比照既有「脈衝計數」卡（`wfgPulseRenderAll` 25736、`wfgPulseAdd` 25479）。

**新增（指行）**：
- HTML：即時測量卡標題（`wfg-meas-head`，~1134）加 ＋ 鈕 `#wfg-meas-sel-add-btn`（重用 `.wfg-la-panel-add`/`.wfg-la-panel-actions` 樣式）；卡片 body 底加容器 `#wfg-meas-sel-items`。
- JS（插於 `var wfgPulseItems` 前）：`wfgMeasSelItems`/`WFG_MEAS_SEL_MAX=4` 狀態、`wfgMeasSelDefaultChannel`/`wfgMeasSelChannelValid`/`wfgMeasSelChannelColor`/`wfgMeasSelChannelOptions`、`wfgMeasSelGetEdges`（phase/kvdat 分流）、`wfgMeasSelCompute`（第一個完整週期五量）、`wfgMeasSelRowsHtml`、`wfgMeasSelAdd/Del/Change`、`wfgMeasSelRenderAll`（含就地更新守衛，防操作下拉時重建 DOM）、`wfgMeasSelRefresh`（60ms 節流，僅就地更新數值；模式切換或項數不符才整段重建）。CSS 零新增（全重用 `.wfg-la-meas-item*` + `.wfg-meas-row/val`）。
- 掛載：phase render 尾（18821）、kvdat render 尾（25171）各加 `wfgMeasSelRefresh()`；語言切換（`_onLangChange`）與 preset 載入（`wfgLoadConfig` 尾）各加 `wfgMeasSelRenderAll()`。

**驗證**：`node --check` 抽出 inline script 通過；Chrome MCP 實開主波形分頁載 preset 實測（見對話數值＋截圖）。僅動主波形即時測量卡新增區塊，未動 LA 那套、cursor/時基尺標/解碼等無關功能。版號 wfg→v2.97.469、快取字串 `?v=20260714wfg469`。

## TCON 波形產生器 (wfg) v2.97.468 — 2026-07-14

**Bruce 需求**：時基尺標 |Δt| 輸入 X（例 3µs）後要「鎖定恆定」。情境＝左（較早）cursor 貼齊某訊號 rising edge 會隨訊號左右晃，右（較晚）cursor 不貼、輸入定值 3µs；理論上右 cursor 應永遠保持「左 cursor + 3µs」跟著一起晃，但實際會漂成 2.995/3.005µs。要求：輸入 X 後恆定不變；未輸入 X 時仍以實際量測為主（訊號變 X 跟著變）。

**漂移根因（勘查指行，兩因）**：
1. **無持續鎖定（主因，造成 2.995/3.005 這種較大漂移）**：舊 `wfgLaCursorApplyDtInput`（7704）/`wfgCursorApplyDtInput`（原 23291）只在 Enter 當下把較晚 cursor **一次性**設為 `basis+dtSec` 就結束，沒有建立任何持續關係。之後基準（左）cursor 因貼邊、隨訊號 re-snap 到最近同型 edge 而移動（LA `wfgLaResolveCursorAnchor` 6282、主波形 `wfgCursorSnapTime` 22886 依當下滑鼠找 edge），較晚 cursor 原地不動 → 間距 = |late−early| 就跑掉。
2. **ns 量化抖動（次因，±1 取樣週期）**：卡片顯示的 dt 由兩個各自被 snap 到取樣點/量化的位置相減（LA 7072 `Math.abs(pos[i2]-pos[i1])`、主波形 23364 `Math.abs(c2.time-c1.time)`），再經 `wfgLaCursorDurationParts`（5410）→ 第一行 `wfgLaCursorNsValue`（5371）`Math.round(sec*1e9)` 量化到整數 ns；輸入端也 `var targetNs = Math.round(val*unitNs)` 先量化。取樣率使 edge 不落整數 ns 時，顯示就 ±ns 抖。

**改動（指行，兩套語義一致）**：
- 新增鎖定狀態：LA `var wfgLaDtLock = {}`（3705 後）、主波形 `var wfgDtLock = {}`（1871 後）。key＝group letter，value＝`{earlyIdx, lateIdx, dt(精確浮點秒)}`。
- 輸入端改精確浮點：兩 `*ApplyDtInput` 移除 `Math.round` 量化，改 `dtRawNs = val*unitNs`（要求 ≥0.5ns），`dtSec = dtRawNs/1e9`；建立 `*DtLock[g]`、設 `late = early + dtSec`、`late.moving=false`。**不再 clamp late 到資料範圍**（維持 X 恆定優先）。
- 持續重算：新增 `wfgLaApplyDtLock`（7762）/`wfgApplyDtLock`（主波形 applyDtInput 後）——遍歷鎖定，每次重算 `late.pos = early.pos + dt`（精確、不量化）。掛在繪製入口：LA `wfgLaRenderScope` 開頭（6423）、主波形 `wfgRender` 開頭（kvdat 分流前，兩模式皆生效）+ `wfgUpdateCursorPanel` 開頭。基準不論何因移動並觸發 render，late 即時跟上、X 恆定。
- 卡片顯示改用鎖定值：LA 7072 / 主波形 23364 的 dt 改為「該 group 有 lock → 用 `lock.dt`（精確），否則才用兩位置相減」，顯示恆等於輸入值、不受量化影響。
- 解除鎖定（回到實際量測）：新增 `wfgLaClearDtLock`/`wfgClearDtLock`，於「手動拖曳任一支」（`*TimeCursorStartDrag`）、「按鍵 toggle 任一支」（`*ToggleCursor`）、「移除 group」（`*CloseCursorGroup`）呼叫；`*ApplyDtLock` 亦自檢（任一支非 active / late 變 moving）自動解除。重新輸入新 X → 覆寫 lock。未鎖定時 X＝實際間距、隨訊號變（原行為不變）。

**邊界決策（待 Bruce 確認）**：(a) 鎖定期間不 clamp late 到 [0,duration]，若 early+dt 超界 late 會落畫面外——為維持 X 恆定的取捨；(b) 解除時機採「手動拖/toggle/移除任一支、或 late 被改為跟隨」；基準 early 保持跟隨貼邊不解除（正是晃動情境）。

**驗證**：`node --check` 抽出 inline script 通過；Chrome 真鍵盤＋真滑鼠兩分頁實測：建立鎖定→程式模擬基準隨訊號移動多次→印「基準.time、被鎖 cursor.time、卡片顯示字串」證 X 恆定不漂→拖曳解除→未鎖定隨訊號變（見對話數值＋截圖）。僅動 cursor |Δt| 相關路徑，解碼/硬體/其他未動。版號 wfg→v2.97.468、快取字串 `?v=20260714wfg468`。

## TCON 波形產生器 (wfg) v2.97.467 — 2026-07-14

**Bruce 需求**：另一個 wfg 分頁（主波形 Phase Counter / kvdat，非 LA）的 cursor 系統與 LA 是同一套概念，卻沒同步到 LA 近期新增的功能。把 LA 版三項最近功能鏡像過去（不重構合併，只鏡像行為降風險）：① 快捷鍵三態（v466）；② 時基尺標卡片 |Δt| 的 X 可即時輸入（v465）；③ 即時測量卡片補頻率顯示。

**兩套落差（勘查結果，指行）**：主波形那套資料模型為 `wfgCursors` 物件陣列 `{active,moving,time,group,id}`（wfg.html:1857），與 LA 的平行陣列（`wfgLaCursorActive/Pos/Moving/Anchors`）不同。落差：(1) `wfgToggleCursor`（原 23309）的 else 分支不分 moving 一律消失，缺 LA v466 的固定態→回跟隨分支；(2) `wfgUpdateCursorPanel`（原 23254）的 both 分支只用 `wfgMeasFormatTime(delta)` 純文字顯示 Δt，無可輸入框、無頻率、無打字聚焦守衛，缺 LA v465 的 `wfgLaCursorApplyDtInput`/`wfgLaCursorDtInputKey`/`wfgLaCursorDurationParts` + `wfgLaUpdateMeasure` 聚焦守衛。主波形已內建 `wfgMeasFormatFreq`（22008）可直接用於頻率。

**改動（指行）**：
1. 三態：`wfgToggleCursor` 的 `else` 拆成 `else if (!cur.moving)`（固定態→清所有 moving、`cur.moving=true`、有滑鼠時 `cur.time=_wfgCursorMouseTime`、`wfgCursorStartAnim()`，不消失）與最後 `else`（跟隨態→消失）。鏡像 `wfgLaToggleCursor`（7747）。
2. |Δt| 可輸入：`wfgUpdateCursorPanel` both 分支把 Δt 改為 `<input class="wfg-cursor-dt-input">` + 單位 + `wfgMeasFormatFreq(1/delta)`；卡片頂端加聚焦守衛（activeElement 為 dt 輸入框時直接 return，不 innerHTML 重建）。新增 `wfgCursorDtInputKey`/`wfgCursorApplyDtInput`（Enter 固定較早 cursor、移動較晚 cursor 到基準+X、非正數/非法不移動、超界 clamp、Esc 放棄）與 `wfgCursorDataTimeBounds`（phase=[0,總行數×每行時間]、kvdat=[TotalStart,TotalEnd]/取樣頻率）。數量級/單位拆解直接重用 LA 純函式 `wfgLaCursorDurationParts`（僅依賴純函式，無 LA 狀態）。
3. 頻率：同上 both 分支已補 `wfgMeasFormatFreq`。CSS `.wfg-cursor-dt-input` 併入既有 `.wfg-la-cursor-dt-input` 規則（866-868）。i18n 沿用 `wfg.laCursorDtHint`。LA 那套（wfgLa*）與解碼/硬體按鈕皆未動。版號 wfg→v2.97.467、快取字串 `?v=20260714wfg467`。

**驗證**：`node --check` 抽出 inline script 通過；Chrome 真鍵盤＋真滑鼠切到主波形分頁實測三態、|Δt| 輸入移動較晚 cursor＋單位換算＋頻率同步、聚焦守衛不掉字，印旗標數值＋截圖佐證（見對話）。

## TCON 波形產生器 (wfg) v2.97.466 — 2026-07-14

**Bruce 需求**：LA cursor 快捷鍵（1=A1、2=A2…）的固定態行為修正。原本三態中：無 cursor 時按鍵→出現並跟隨滑鼠；未按左鍵再按同鍵→消失（正常）；但按左鍵釘住（固定態）後再按同鍵→原設計是「消失」。改成：固定態按鍵→cursor 不消失、改回「跟隨滑鼠」狀態（使用者可再按左鍵釘新位置）。一句話：只有前一刻是「跟隨態」按鍵才會進消失態；前一刻是「固定態」按鍵改成進入跟隨態。

**現況（指行）**：狀態變數 `wfgLaCursorActive[idx]`（存在與否，wfg.html:3702）、`wfgLaCursorMoving[idx]`（是否跟隨滑鼠，3703）、`wfgLaCursorPos`/`wfgLaCursorAnchors`（3704-3705）；快捷鍵對應 `wfgLaCursorKeys`（3706，1→0…0→9）。三態＝消失(active=false)／跟隨態(active&&moving)／固定態(active&&!moving)。固定態由左鍵 mouseup 產生：`wfgLaFindMovingCursor` 找到跟隨中的 cursor 後 snap 定位並 `wfgLaCursorMoving[moving]=false`（wfg.html:5783-5785）釘住。keydown（5791-5797，已用 `wfgIsTextEntryEvent` 排除輸入框）呼叫 `wfgLaToggleCursor`（7747）。原 `wfgLaToggleCursor` else 分支（7757-7764）在 active 時不分 moving 一律清空消失。

**改動（指行）**：`wfgLaToggleCursor`（wfg.html:7747）的 else 拆成兩支。新增 `else if (!wfgLaCursorMoving[idx])`（固定態）：清所有 moving、設 `wfgLaCursorMoving[idx]=true`、`wfgLaCursorSelected=idx`、若滑鼠在圖上則 `wfgLaCursorPos/Anchors` 依 `wfgLaCursorMouseTime/Anchor` 重設（解除舊釘住 anchor），`wfgLaCursorStartAnim()` 恢復跟隨——不移除 cursor。原消失邏輯保留於最後的 `else`（僅跟隨態會進入）。出現分支（7749-7756）與其他快捷鍵、左鍵釘住邏輯、cursor 卡片/解碼皆未動。版號 wfg→v2.97.466、快取字串 `?v=20260714wfg466`。

**驗證**：`node --check` 抽出 inline script 通過；Chrome 真鍵盤＋真滑鼠實測 a) 全無→按1→A1 moving=true；b) 不點左鍵再按1→active=false 消失；c) 按1出現→左鍵釘住(moving=false)→再按1→A1 不消失且 moving=true（新行為）；d) 跟隨態再按1→消失；e) A2(鍵2)重複 c 亦成立。只動此狀態機分支，無副作用。

## TCON 波形產生器 (wfg) v2.97.465 — 2026-07-14

**Bruce 需求**：LA 時基尺標卡片叫出成對 cursor（如 A1/A2）時，卡片顯示 `|A1-A2| = X us / Y kHz`。把 X 改成可即時輸入的數字框（正實數），輸入後按 Enter 生效：固定「較早（左邊）」的 cursor 當基準、移動「較晚（右邊）」的 cursor 到「基準 + X」，X 依卡片當下單位解讀；若輸入很小使間隔變小，Enter 後單位數量級自動改變（us→ns），X 與 Y 一起換算更新。

**現況（指行）**：LA 卡片由 `wfgLaUpdateMeasure`（wfg.html:7029）重建 `#wfg-la-cursor-body` 的 innerHTML；`both` 時 delta 字串＝`wfgLaCursorCardDurationLabel(dt) + ' / ' + wfgLaFreqLabel(1/dt)`（原 7053），dt＝`|wfgLaCursorPos[i2]-wfgLaCursorPos[i1]|`（絕對秒）。單位挑選在 `wfgLaCursorCardDurationLabel`（5392）依 ns 量級（s/ms/us/ns）選；頻率 `wfgLaFreqLabel`（5407）。cursor 位置 `wfgLaCursorPos[0..9]`＝絕對秒、名稱 `wfgLaCursorNames`（A1/A2…E1/E2）、5 組各 2 支。全域 keydown 快捷（5765）已用 `wfgIsTextEntryEvent`（5425）排除 input，打字不會誤觸放 cursor 快捷鍵。

**改動（指行）**：
1. 新增 `wfgLaCursorDurationParts(sec)`（wfg.html:5407-5429）：與 `wfgLaCursorCardDurationLabel` 同一套 ns 量化＋挑單位規則，回傳 `{valueText, unit, unitNs, ns}`，供輸入框顯示數值與 Enter 反算回秒。
2. `wfgLaUpdateMeasure`：`both` 時 X 改成 `<input class="wfg-la-cursor-dt-input">`（wfg.html:7059-7071），值＝`dtParts.valueText`、`data-unitns` 帶目前單位的 ns，後接「單位 / 頻率」；`onkeydown` 綁 `wfgLaCursorDtInputKey`。並在函式開頭加「輸入框聚焦守衛」（wfg.html:7031-7038）：焦點在 dt input 時跳過 innerHTML 重建，避免 hover/動畫重繪洗掉輸入（比照 label 名稱編輯守衛）。
3. 新增 `wfgLaCursorDtInputKey`（wfg.html:7688-7700）：Enter→套用、Esc→放棄重建。`wfgLaCursorApplyDtInput`（wfg.html:7704-7745）：正實數才生效；`earlyIdx`＝`wfgLaCursorPos` 較小者（基準不動），`lateIdx`＝較大者（移動）；`target = basis + round(X×unitNs)/1e9`，clamp 到 `[0, wfgLaCaptureDuration()]`；清 `wfgLaCursorAnchors[lateIdx]`（手動定位不綁 edge）後 `wfgLaRenderScope()` 重建（單位/頻率自動更新）。用「左/右時間先後」判定，不寫死 A1/A2。
4. i18n 新增 `wfg.laCursorDtHint`（common/i18n.js:319）作輸入框 title。版號 wfg→v2.97.465、快取字串 `?v=20260714wfg465`。

**邊界處理**：非正數/非法/空值→不移動、還原顯示；輸入換算後不足 1ns（`round(X×unitNs)≤0`）→視為無效不移動（卡片全程 ns 量化，無法表達更細）；`基準+X` 超過資料尾端→clamp 到 duration（卡片據實顯示縮短後間隔）；失焦不生效，一律以 Enter 為準。只動 LA 卡片，未改 cursor 拖曳、單位挑選演算法本身、AUX/硬體等無關功能。

**驗證**：`node --check` 抽出的 inline script 過；Chrome MCP 本地 server 實測（見下方對話）：叫出 A1/A2 後於 X 輸入數字按 Enter，較晚 cursor 移到「基準+X」、`|Δt|`/X/Y 一致；輸入極小值→單位由 us 變 ns、X/Y 換算更新；基準（較早）cursor 不動；A1/A2 左右對調時移動的仍是較晚者。附移動前後 `wfgLaCursorPos` 秒值與卡片字串為證。

## TCON 波形產生器 (wfg) v2.97.464 — 2026-07-14

**Bruce 回報**：eDP AUX 解碼結果卡片，Type 欄部分 badge 有「!」異常標記（紅/黃色），但 hover 沒有浮動說明、v463 的點擊彈框也空白。實測：套「eDP AUX解碼（異常範例）」preset 時 hover 有說明；自己單次觸發取樣的結果就沒有。

**根因（程式碼稽核，指行）**：「!」與說明文字用兩套不一致條件。「!」由 `wfgLaDpAuxTypeIsAnomaly`（wfg.html:10917-10921）判定，涵蓋 `wfgLaDpAuxIsNonAckReply`（NACK/DEFER）、`auxPreambleWarn`、`wfgLaDpAuxExportProtocolError`；但 `renderRow` 的 `badgeTitle`（12931-12935）只認 `auxAnomaly/ack==='ERR'/protocolError`、`auxPreambleError`、`auxPreambleWarn`、`auxNoReply`。兩處未對齊的「有『!』卻無 badgeTitle」情況：

- **A. NACK/DEFER 回覆列**（`wfgLaDpAuxIsNonAckReply` 為真）：`wfgLaDpAuxSourceBuildRow`（11862-11875）產生的 REPLY 列 `ack='TCON'`（非 'ERR'）、無 `auxAnomaly/protocolError`，五分支全不中 → title 空。這正是「單次觸發取樣」看到 TCON NACK/DEFER 回覆的主案例。
- **B. `r.ack === 'NACK'` 的列**（被 `wfgLaDpAuxExportProtocolError` 命中，10473）：第一分支只認 `ack==='ERR'`、不認 `'NACK'` → title 空。

**修法（只補 badgeTitle，不動「!」判斷/顏色/Type 文字/匯出/彈框機制）**：
1. 新增 `wfgLaDpAuxAnomalyReplyTip(r)`（wfg.html:10905-10920）：依 `r.raw[0]` reply command nibble（VESA DP 1.1a：Native NACK=0x1/DEFER=0x2、I2C NACK=0x4/DEFER=0x8）產生 NACK/DEFER 診斷說明，區分 Native 與 I2C；有 `r.description` 優先採用。
2. `badgeTitle` 鏈末尾追加兩分支（wfg.html:12942-12948），既有五分支完全不動：`else if (wfgLaDpAuxIsNonAckReply(r))` → 專屬 NACK/DEFER 說明；`else if (wfgLaDpAuxExportProtocolError(r))` → `r.description || r.value || 'AUX protocol error'` 通用說明。
3. hover 原生 `title` 與 v463 點擊彈框讀同一個 `badgeTitle`（同源），補齊後兩邊同時有內容。

**驗證**：`node --check` 過；Chrome MCP 構造 NACK/DEFER/ERR/protocol-error 各一列餵 `wfgLaRenderDecodeResults`，確認每個「!」badge 皆 `hasAttribute('title')` 非空、有 `data-badge-tip`、彈框內容==title；正常 ACK 列無「!」、無 title、不可點。截圖彈框態。

## TCON 波形產生器 (wfg) v2.97.463 — 2026-07-14

**Bruce 需求**：AUX/LA 解碼結果表 Type 欄異常（`!REQ`/`!ERR`/preamble 警告等）原本 hover 會出現浮動說明（原生 `title`）。保留 hover 不變，**新增：點擊該 badge → 彈框顯示同一份說明文字**。

**現有機制（指行）**：dp_aux 的 `renderRow`（wfg.html:12859）內，`badgeTitle`（12864-12868）依 `auxAnomaly/ack==ERR/protocolError`、`auxPreambleError`、`auxPreambleWarn`、`auxNoReply` 產生說明字串，掛在 Type badge 的原生 `title` 屬性（原 12876）＝hover 浮動說明來源。

**修法（只加「點擊→彈框」UI，不動解碼/顏色/`!`前綴/匯出）**：
1. **同源文字**（wfg.html:12943-12948）：badge 有 `badgeTitle` 時，同一個 `badgeTitle` 變數同時寫入 `title`（保留 hover）與新增的 `data-badge-tip`，並加 class `wfg-la-decode-badge--tip` + `onclick="event.stopPropagation();wfgLaShowDecodeTipDialog(this.getAttribute('data-badge-tip'))"`。title 與彈框同一份文字，杜絕兩邊不一致。`event.stopPropagation` 避免只觸發整列選取。
2. **彈框函式**（wfg.html:12828-12882）：`wfgLaShowDecodeTipDialog(text)` 沿用既有 `.wfg-la-modal-overlay`/`.wfg-la-modal-card` 暗色風格，內容以 `textContent` 顯示（防注入）；關閉方式＝X 鈕／點遮罩／Esc／底部關閉鈕；內容區 `max-height:50vh` + `overflow-y:auto` 容納較長說明。
3. **CSS**（wfg.html:555-563）：`--tip` badge `cursor:pointer` + hover outline 提示可點；無 `badgeTitle` 的正常 badge 不加 class/onclick → 點了不跳。

**驗證**：Chrome MCP 自開分頁載入敏感版 kvdat（DP AUX）—— hover `!REQ`/`!ERR` 仍出浮動說明；點擊出彈框且文字與 hover 一致；X／遮罩／Esc 可關；正常 cell 不跳。截圖兩態。

## TCON 波形產生器 (wfg) v2.97.462 — 2026-07-14

**Bruce 回報（更正 v460 方向）**：v460 假設「A OFF 後只是 OS 短暫釋放窗口，B 退避重試可搶到」，做了 B 端 claim 退避重試（`wfgLaClaimWithRetry`）。**實機驗證：問題仍在，解法仍是「必須重新整理網頁 A，B 才能正常 ON」。** → 根因不是短暫窗口，而是 **A 按 OFF 後頁面仍有背景路徑持續持有 / 重新 open 裝置**；只有重整 A（render process 銷毀、OS 回收 handle）才真正釋放。退避重試無效。

**根因（確定性程式碼稽核，指行）**：
本頁**設計成「背景自動連上硬體」**，這是背景 open 的來源：
- `wfgLaStartUsbPresencePoll`（原 7850）每 2.5s → `wfgLaRefreshUsbPresence({autoInit:true})` → `wfgLaOpenDevice`（原 7896 `await dev.open()`）→ protocol ready 時 `wfgLaSetStatus('wfg-la-status-device','ok')`（7719-7720 → `wfgLaHardwareReady=true`）。即「只要在 LA 模式、裝置插著，頁面就會背景 open 持有裝置」，**不需按 ON**。
- `wfgLaStartReconnectAutoInit`（原 7798，connect/disconnect 事件觸發）與 install-time 的 `wfgLaRefreshUsbPresence({autoInit:false})`（原 7795）也都會走 `wfgLaOpenDevice`。
- v457 的 `wfgLaLinkUserOff` 只在「使用者曾按 ON 再按 OFF」時為 true。而背景 poll / reconnect 是設計性的背景 open 路徑；只要 gate 有任何時序/狀態縫隙（OFF 中 `hardwareReady=false` 與 `userOff=true` 的設定順序、poll 與 OFF 的競態、或 A 從背景自動連上時 `userOff` 恆為 false），A 就會在 OFF 後被背景 re-open。重整 A 之所以「必成功」＝process 銷毀，所有 timer 停 + USBDevice GC + OS handle 回收。
- 另一確定資源洩漏：`wfgLaHardwareLinkOn` 的 claim 失敗 catch（原 14535）**沒 close 本分頁剛 open 的裝置**（open 非獨佔、claim 才獨佔）→ 兩分頁互搶時各自殘留 opened handle，加重 IOKit 釋放競態。

**修法（往根治：頁面預設「絕不背景自動 open/claim」，指行）**：
1. **presence poll 不再 open**（wfg.html:7862）：新增 `wfgLaProbeDevicePresenceOnly()`（7877）——只用 `navigator.usb.getDevices()` 列舉判斷裝置插著與否、僅更新狀態燈文字，**絕不呼叫 `dev.open()`／`claimInterface`／`setStatus(device,'ok')`**（不設 `hardwareReady=true`）。poll 改呼叫它。
2. **install 初始化不再 open**（wfg.html:7795-7797）：`wfgLaRefreshUsbPresence({autoInit:false})` → `wfgLaProbeDevicePresenceOnly()`。
3. **reconnect 只在「有進行中擷取要恢復」或「已主動連線(ON)」才自動 open**（wfg.html:7805-7813）：`shouldAutoOpen = resumeMode || pendingCaptureMode || restoreReady || linkActive`；否則只 probe 不 open。純插上裝置不自動 open。
4. **ON 失敗 close 自己 handle**（wfg.html:14568-14580）：claim 失敗且非擷取中 → releaseInterface + `await close()`，不留 opened 殘留。
5. **OFF 徹底釋放**（wfg.html:14621-14625）：迴圈 close 直到 `dev.opened===false`（至多 3 次 × 120ms），確保 IOKit 真正放掉獨佔。
- 保留 v460 的 `wfgLaClaimWithRetry` 退避重試當第二層保險（主修是讓 A 真正放掉、不再 re-grab）。

**採「背景不自動 open」根治的影響**：
- **擷取不受影響**：按單次/循環擷取走 `wfgLaStartCapture`→`wfgLaEnsureHardwareInitializedForCapture`（14334）→`wfgLaGetReadyDevice`（自己 open）+claim，路徑自足，不依賴背景 poll 先 open。
- **狀態燈**：載入/插上裝置時不再自動顯示「已連線」，改顯示「偵測到 M16-200（未連線）；按 ON 或單次/循環擷取以連線」——更如實反映控制權歸屬。
- **自動恢復擷取**：擷取進行中拔插仍會自動恢復（`resumeMode` 保留 open 路徑）；非擷取狀態拔插不自動 open。
- **同時根治**「初次載入 PWM 誤亮 / 背景自動連上」：載入不再背景 open+設 `hardwareReady`，PWM 燈（閘＝`linkActive`，v458）在按 ON 前不會亮。

**驗證（誠實）**：
- 靜態：`node --check` 抽出全部 script → **SYNTAX_OK**。
- 邏輯稽核：全檔 `wfgLaOpenDevice` 呼叫點＝{7896 refreshUsbPresence（現僅被 gated reconnect step 呼叫）、8940 re-enum、14107/14122/14133 getReadyDevice（ON/擷取）、14215 診斷}；`claimInterface`＝{8961 claim原廠Interface（擷取/ON）、14212/14216/14304 診斷}；背景 timer 中 poll 已**無** open、install 已改 probe、reconnect 已 gate。`wfgLaProbeDevicePresenceOnly` 定義 1、呼叫 3（poll/install/reconnect）。
- **限制（必要）**：真正的「兩分頁 race」需真 M16-200＋兩分頁，非確定性、自動化無法穩定重現。**最終要 Bruce 兩分頁實機驗**：A ON → B 佔用 → A OFF → **B 直接 ON 成功、不需重整 A**；併驗單次/循環擷取、PWM、拔插自動恢復仍正常。

## TCON 波形產生器 (wfg) v2.97.461 — 2026-07-14

**Bruce 要求（「執行」group 兩件事）**：
1. 硬體連線按鈕（電源圖示 + 下方 ON/OFF 文字）比右邊三顆（單次/循環/暫停）高、垂直對不齊 → **移除下方 ON/OFF 文字**、電源圖示高度與三顆 icon 同列齊平。
2. 確認單次/循環/暫停**一次只有一顆 active**（前一 task 截圖出現三顆同時藍框，疑似同時選中）。

**改動一：移除文字 + 對齊（改了哪幾行）**
- CSS `.wfg-la-toolbar .wfg-la-link-btn`（wfg.html:318）：`height:40px→26px`、`width:42px→26px`，移除 `flex-direction:column / justify-content:flex-end / gap:2px / padding:0 2px 1px`，改 `align-items:center; justify-content:center; padding:0` → 圓底圖示垂直置中，與 `.wfg-la-tool-group{height:48px; align-items:flex-end}` 內三顆 `.wfg-la-run-btn`（height:26px）同列齊平。
- 移除已無用的 `.wfg-la-link-text` 規則與 `.on/.busy .wfg-la-link-text` 兩條顏色規則（原 wfg.html:324/329/334）。
- HTML（wfg.html:1358）：移除 `<span class="wfg-la-link-text" id="wfg-la-link-led">OFF</span>`，只留電源圖示 `<span class="wfg-la-link-icon">`。
- JS 未動：`wfgLaRenderLinkButton`（wfg.html:4708）取 `wfg-la-link-led` 時本已有 `if (led)` 守衛，led 移除後為 null 直接略過，不報錯。
- **保留不變**：正圓（aspect-ratio:1 + border-radius:50%）、ON 亮綠圓底白圖示 + 綠光暈、OFF 融背景灰、busy 黃閃、狀態機、v455 OFF 三顆變灰、v458 PWM 綁定、v459 綠色保持、v460 claim 退避重試。

**改動二：互斥（驗證結論＝已互斥，未改 code）**
- 全檔 `acq-active` 的唯一寫入點只有 wfg.html:4693-4695 三行，皆由**單一全域 `wfgLaCaptureState`** 與 `cfg.acquisitionMode` 以 `classList.toggle('acq-active', 條件)` 各自重算：single=`running∧single`、repeat=`running∧repeat`、stop=`stopped`。任一時刻 state 為單值 → 至多一顆為真，切換時舊顆條件轉 false 自動清除，無殘留。
- 前一 task 截圖三顆同時藍框，是該 task 為展示三色**人工同時套 class** 造成，非狀態機真實行為。**故不需修改**。

**驗證（Chrome 本地 http server 白箱，未 push）**：
- 版號：`TOOL_VERSIONS.wfg=v2.97.461`、`version.js?v=20260714wfg461` 已載入。
- DOM：`wfg-la-link-led` 已不存在、`.wfg-la-link-text` 已移除；link-btn `height/width=26px`。
- 對齊量測：link 圓 icon 與 single/repeat/stop 三顆 svg 的垂直中心 **dy 全=0**（完全齊平）；icon 正圓（w=h=26、border-radius:50%）。
- 顏色（截圖像素為準）：OFF=圓融背景灰、ON=亮綠圓底 + 白電源圖示 + 綠光暈。（getComputedStyle 於 transition 進行中讀到過渡中間值，畫面 paint 為正確綠。）
- 互斥真值表：A running/single→只 single；B running/repeat→只 repeat（single 已清）；C stopped→只 stop；D 其他態→零顆；`maxActiveEver=1`。截圖 running/single：只有 single 亮綠+藍框，repeat/stop 灰。
- **限制**：ON 端到端需真 M16-200 硬體（WebUSB），無法自動化，留 Bruce 實機確認燈號亮綠；本次驗證為 DOM/CSS/class 白箱 + 截圖。

## TCON 波形產生器 (wfg) v2.97.460 — 2026-07-14

**Bruce 回報（兩分頁搶斷硬體，機率性）**：同時開兩個 LA 網頁 A、B。A 先按 ON（claim 到硬體）；B 按 ON 顯示「硬體被占用」（正常，A 佔著）。**但有機率**：A 按 OFF 釋放後，B 再按 ON **仍顯示被占用**；必須把 **A 重新整理後再關 OFF**，B 才能正常 ON。Bruce 要求先分析根因，找不到就至少做穩健緩解。

**根因分析（指到確切 code 行）**：
- OFF 路徑 `wfgLaHardwareLinkOff`（wfg.html:14528）**已正確 await**：`wfgLaSetRunMode 0x00` → `releaseInterface`（14544）→ `await dev.close()`（14546）。非擷取情境無 in-flight transfer，close 乾淨。
- 背景輪詢 `wfgLaStartUsbPresencePoll`（wfg.html:7853）與重連 `wfgLaStartReconnectAutoInit`（7801）在 v457 已由 `wfgLaLinkUserOff` 旗標擋住（7805、7860），且 poll 另有 `wfgLaHardwareReady` 閘門（7857）；heartbeat 在 OFF 開頭即 `wfgLaStopLinkHeartbeat()`（14532）。**逐一檢查未發現 A 在 OFF 後又把 device re-open 的 race**。
- 真正根因＝**跨 render process + macOS IOKit 的 USB 獨佔釋放時序窗口**：WebUSB `claimInterface` 為獨佔；A 的 OFF（A 分頁 process）與 B 的 ON（B 分頁 process）分屬兩個 render process，`dev.close()` 的 Promise resolve 後，OS/IOKit 把 A 端獨佔「完全」放掉存在**非確定性的短暫延遲（數十～數百 ms）**。B 若在此窗口內 `claimInterface`（wfg.html:8964）→ throw → `wfgLaHardwareLinkOn` 的 catch（14504）**直接判「被占用」、無重試**。這完美解釋「機率性」（取決於 B 按 ON 落點）與「重整 A 必正常」（整個 render process 銷毀 → OS 強制回收該 process 全部 USB handle，窗口消失）。

**修法（雙管齊下，緩解為主）**：
1. **B 端 claim 退避重試**（wfg.html 新增 `wfgLaClaimWithRetry`）：`wfgLaHardwareLinkOn` 改呼叫此包裝（14490）。claim 失敗且屬「占用類」錯誤（claim/access/busy/InvalidStateError/SecurityError/NetworkError）時，以退避 `[0,200,300,400]ms`（首次立即＋3 次重試，累計覆蓋 ~900ms）重試，涵蓋 A 剛 OFF、OS 尚未完全釋放的短暫窗口；**使用者取消（NotFoundError）/ 無 interface 不重試**；重試用盡仍失敗才往外拋 → 由 catch 顯示「被占用」。**故 A 真的長期佔著時 B 仍會（約 0.9s 後）正確顯示被占用**，不破壞正常行為。
2. **A 端 OFF 徹底釋放**（wfg.html:14546 一帶）：`dev.close()` 失敗時短延遲 120ms 後再試一次，盡量讓 OS 徹底釋放，縮短另一分頁撞到「未完全釋放」的窗口。

**驗證**：程式路徑分析已指到行；`wfgLaClaimWithRetry` 的退避/占用判定/取消不重試邏輯以 Chrome 分頁載入實測（見對話）。**機率性 + 真 M16-200 + 兩分頁 race 的端到端無法自動穩定重現，留 Bruce 兩分頁實機確認**（預期：A OFF 後 B 就算撞到窗口也會在退避內自動 claim 成功，不再需要重整 A）。

## TCON 波形產生器 (wfg) v2.97.459 — 2026-07-14

**Bruce 回報（ON 連線狀態下）**：「執行」group 三顆按鈕中，**暫停**被選中時紅色會保持住（正確，維持）；但**單次觸發／連續觸發**只有滑鼠 hover 時才顯示綠色，**按下去（選中）之後綠色沒有保持，只剩藍色 focus 框**。Bruce 要的是：單次/連續觸發被選中後綠色也要持續保持（滑鼠移開仍綠，表示正在作用的取樣模式），比照暫停保持紅色。

**根因（指到確切 code 行）**：`.play`/`.loop` 只有兩種綠色來源都是 `:hover`——
- `.wfg-la-run-btn.hardware-ready.play:hover, .loop:hover { color:#4ade80 }`（wfg.html:295，hover 才綠）。
- 選中狀態的 class `acq-active`（由 `wfgLaSyncCaptureButtons` 於 wfg.html:4691-4692 對 running+對應 mode 掛上）在 CSS 只對應到 `button.acq-active { box-shadow:0 0 0 2px #0ea5e9 }`（wfg.html:257，藍框），**沒有任何綠色 fill 規則**。對比暫停 `.stop.acq-active { color:#f87171; background:rgba(248,113,113,0.12) }`（wfg.html:298）就有持續紅色，所以只有暫停會保持顏色。

**修法（只動配色，狀態機/邏輯不動）**：新增一條與 `.stop.acq-active` 同機制的綠色 active 規則（wfg.html:299）：
```css
.wfg-la-run-btn.play.acq-active, .wfg-la-run-btn.loop.acq-active { color:#4ade80 !important; background:rgba(74,222,128,0.12); }
```
- 特異度 (0,3,0)，壓過 292/294 灰底(0,2,0) 與 257 `button.acq-active` 藍框背景(0,2,1)，故選中後綠底+綠字持續保持，滑鼠移開仍綠。
- 只覆寫 `color`/`background`，**不覆寫 `box-shadow`** → 257 的藍色 focus/選中框保留（Bruce 沒要求去掉），綠底＋藍框並存共同表達「選中」，鍵盤可及性不破壞。
- hover 綠（295 `:hover`）與此互不干擾；顏色同為 `#4ade80` 無跳色。
- **不影響 v455**：OFF 時 `.wfg-la-run-btn:disabled`（wfg.html:302，特異度 0,3,0、順序在後）照舊壓成暗灰、無框、不可點；且 disabled 時擷取不 running 亦不會掛 `acq-active`（雙保險）。
- **不影響 v458**：完全未動 PWM 相關 JS/CSS。

**差異一句話**：hover 綠是 `:hover` pseudo（滑鼠在上才綠）；本次加的是 `.acq-active` 選中態綠（按下選中後持續綠，與暫停紅色同一 active-class 機制）。

## TCON 波形產生器 (wfg) v2.97.458 — 2026-07-14

**Bruce 實機回報 bug**：**重新整理頁面後、硬體連線按鈕還是 OFF（未按 ON），但 PWM1 就已經亮燈了。** OFF（含剛載入的預設 OFF、以及背景自動連上但使用者沒按 ON 的情況）時，PWM1/PWM2 就不該亮。

**Bruce 澄清的框架**：on/off 按鈕 OFF ＝ 硬體斷開，斷開的硬體不可能輸出 PWM，所以只要 OFF，PWM 燈就一定不亮（初次載入、按 OFF、背景自動連上但沒按 ON… 全部同一道理）。這不是 load-time 特例，而是把「PWM 是否可能輸出」根本綁在「連線按鈕是否 ON（`wfgLaLinkActive`）」上。

**根因（指到確切 code 行）**：PWM 燈判斷式 `wfgLaUpdatePwmButtons()`（wfg.html:4809-4810）原為 `enabled && wfgLaHardwareReady`，只看 `wfgLaHardwareReady` 不看連線按鈕 `wfgLaLinkActive`。
- `wfgLaPwmState.pwm1.enabled` 預設 `true`（wfg.html:3786）。
- 初次載入時，M16-200 仍實體插著且此 origin 已授權 → 背景 presence 輪詢 / auto-init 自動連上裝置 → `wfgLaSetStatus('wfg-la-status-device','ok')`（wfg.html:7706）把 `wfgLaHardwareReady=true`。
- 但 `wfgLaLinkActive` 仍是預設 `false`（wfg.html:3764，使用者從沒按 ON）。
- 燈判斷 `enabled(true) && hardwareReady(true)` ＝ 亮 → 與「按鈕 OFF」不一致。v2.97.457 的 `wfgLaLinkUserOff` 收斂只擋「按過 OFF/斷線後」的復連，管不到「初次載入從沒按 ON、輪詢正常放行」的情境。

**修法（PWM 唯一閘＝連線按鈕 `wfgLaLinkActive`）**：
1. **燈判斷式改唯一閘**（wfg.html:4809-4810）：`enabled && wfgLaHardwareReady` → `enabled && wfgLaLinkActive`。OFF（`wfgLaLinkActive=false`）時燈一律不亮，即使背景把 `hardwareReady` 設 true 也不亮；只有按 ON（claim 成功 `wfgLaLinkActive=true`）後才依 `enabled` 反映實際輸出。
2. **單一出口即時刷燈**（`wfgLaRenderLinkButton`，wfg.html:4713 後）：加 `wfgLaUpdatePwmButtons()`。此函式是所有改變 `wfgLaLinkActive` 的路徑（ON claim 成功的 finally、OFF、control-lost、USB 拔除）的單一出口，故 ON 後燈依 enabled 亮、OFF/斷線後燈即時滅，皆自動同步。
3. **選單勾選同步同一閘**（`wfgLaPwmSyncDialogChecks` wfg.html:4820、`wfgLaPwmDialogRow` wfg.html:4839-4840）：checkbox 顯示 checked／row disabled 也以 `wfgLaLinkActive && enabled` 為準 → OFF 時選單顯示未勾，與燈一致。
4. **防污染**（`wfgLaConfirmPwmDialog` wfg.html:4915）：OFF 時 checkbox 被閘顯示未勾，若使用者按確定不得把既有 `enabled` 意圖洗成 false → OFF 保留原值，只有 ON 才依 checkbox 回寫。`enabled: wfgLaLinkActive ? !!(en&&en.checked) : !!next[id].enabled`。

**未破壞 ON 正常反映**：ON 路徑 claim 成功 → `wfgLaLinkActive=true` → finally `wfgLaRenderLinkButton()` → `wfgLaUpdatePwmButtons()` → `enabled(pwm1 預設 true) && linkActive(true)` ＝ 亮，依 enabled 如實反映。v2.97.457 的 `wfgLaLinkUserOff` / `wfgLaPwmForceDisableOnDisconnect`（OFF 熄且維持）不受影響，OFF 後 `linkActive=false` 再疊一層閘，燈更不可能復亮。

**驗證**：見對話回報（Chrome MCP 自開分頁，注入 hardwareReady=true 模擬背景自動連上後確認 OFF 時 PWM 不亮、模擬 linkActive ON/OFF 三情境）。

**版本同步**：`common/version.js` `wfg: v2.97.457 → v2.97.458`；`wfg.html` `version.js?v` / `i18n.js?v` → `…20260714wfg458`。

## TCON 波形產生器 (wfg) v2.97.457 — 2026-07-14

**Bruce 實機回報 bug**：按硬體連線鈕的 OFF（斷線）後，PWM1 綠燈會「熄一下、然後又復亮」。並要求：斷線後任何背景刷新都不可再把 PWM 燈點亮，直到重新連線（ON）；且 PWM 設定選單裡的勾選（checkbox）狀態要跟燈號用同一真值來源同步。

**復亮根因（指到確切 code 行）**：不是 PWM 特有問題，而是背景 USB presence 輪詢把 `wfgLaHardwareReady` 重設回 `true`。
- v2.97.456 的 OFF 流程 `wfgLaHardwareLinkOff()` 只做到 `wfgLaSetStatus('wfg-la-status-device','warn')` → `wfgLaHardwareReady=false`（wfg.html:7675）+ `wfgLaUpdatePwmButtons()` → PWM 燈熄。**但裝置 handle 保留、且仍實體插著並已授權**。
- `wfgLaStartUsbPresencePoll()` 的 `setInterval`（每 2500ms，wfg.html:7804）判斷條件只有 `!hardwareReady`（7806）→ OFF 後 `hardwareReady=false` 反而讓輪詢「通過閘門」開始跑。
- 輪詢呼叫 `wfgLaRefreshUsbPresence({autoInit:true,...})`：`getDevices()` 找到仍插著的 原廠 裝置 → `wfgLaOpenDevice(dev)` 重新開啟 → 韌體仍常駐、`wfgLaCanReadProtocol` 讀通 → **執行 `wfgLaSetStatus('wfg-la-status-device','ok', ...)`（wfg.html:7854）** → `wfgLaHardwareReady=true` → `wfgLaUpdateToolbarState` → `wfgLaUpdatePwmButtons` → **PWM1 在約 2.5s 後復亮**。這正好對上「熄一下又亮」的時間感。
- **為何只有 PWM1**：`wfgLaUpdatePwmButtons` 亮燈條件 = `enabled && hardwareReady`。預設只有 `pwm1.enabled=true`、`pwm2.enabled=false`（wfg.html:3786-3787）。hardwareReady 復真時，只有被啟用的 PWM1 會亮，PWM2 因 enabled=false 不亮。所以這不是 PWM1 專屬 bug，而是「唯一被啟用的那個」被復亮。

**修法（收斂到單一真值 + 阻斷背景復連）**：
1. **新增顯式 OFF 旗標 `wfgLaLinkUserOff`**（wfg.html:3767 附近宣告）。使用者按 OFF → `wfgLaHardwareLinkOff()` 設 `wfgLaLinkUserOff=true`；自動斷線 `wfgLaLinkOnControlLost()` 也設 true；按 ON `wfgLaHardwareLinkOn()` 開頭設回 false。
2. **presence 輪詢加閘**（wfg.html:7806 附近）：`if (wfgLaLinkUserOff) return;` → 顯式 OFF 後不再自動 re-open 裝置、不再把 device 設回 ok，PWM 不會復亮，直到 ON。
3. **reconnect 自動初始化加閘**（`wfgLaStartReconnectAutoInit` 開頭）：`if (wfgLaLinkUserOff) return;` → 連 USB 拔插事件也不會在顯式 OFF 後自動復連復亮。
4. **PWM 燈與選單勾選收斂到同一真值 `enabled`**：新增 `wfgLaPwmForceDisableOnDisconnect()`（wfg.html:4813 附近）——斷線／OFF 時把 `wfgLaPwmState.pwm1/pwm2.enabled` 一律歸零，再 `wfgLaUpdatePwmButtons()` 熄燈；若 PWM 選單當下開著，`wfgLaPwmSyncDialogChecks()` 同步把選單 checkbox 取消勾選並更新 disabled 樣式。OFF 與 control-lost 兩處由原本的 `wfgLaUpdatePwmButtons()` 改呼叫此函式。
   - 因燈 = `enabled && hardwareReady`，斷線後 `enabled=false` 且 `hardwareReady=false` → **雙保險**：就算任何背景刷新誤把 hardwareReady 設回 true，燈仍不會亮。燈、選單勾選、`wfgLaPwmState` 三者皆由 `enabled` 驅動，永遠一致。
   - **行為變化（已告知 Bruce）**：斷線會清除 PWM 啟用狀態，重新連線（ON）後如需 PWM，重開選單勾選即可。ON 後 hardwareReady 恢復、enabled 為使用者重設值 → 三者一致反映實際。

**未破壞 ON 正常反映**：ON 路徑 `wfgLaHardwareLinkOn` 未改亮燈邏輯；未在 `wfgLaUpdatePwmButtons` 加 `&& wfgLaLinkActive`（避免 v456 記錄過的誤熄回歸），改由 enabled 單一真值收斂。首次使用（未曾按 OFF）`wfgLaLinkUserOff` 預設 false，輪詢自動初始化行為不變。

**驗證**：見對話回報（Chrome MCP 自開分頁，模擬 presence 輪詢注入 hardwareReady 後確認 PWM 不復亮、選單勾選同步、ON 後恢復；截圖）。

**版本同步**：`common/version.js` `wfg: v2.97.456 → v2.97.457`；`wfg.html` `version.js?v` / `i18n.js?v` → `…20260714wfg457`。

## TCON 波形產生器 (wfg) v2.97.456 — 2026-07-14

**需求（Bruce，同一次進版三件事）**：① 連線狀態（ON）下直接按硬體連線鈕想變 OFF 不行，變成要「先按停止鍵才能按 OFF」，不合理 → 按一次 OFF 就直接斷線；若擷取正在進行，按 OFF 時自動先執行停止擷取再斷線，不需按兩次。② 按 OFF、硬體斷線後 PWM1/PWM2 綠燈也要跟著熄滅。③ 硬體連線 on/off 按鈕位置從「執行」group 最右改到最左（單次/循環/暫停之前），只移位置。

**擋住的確切根因（指到 code 行）**：`wfgLaHardwareLinkOff()`（舊 wfg.html:14468）開頭有 early return：

```
if (wfgLaCaptureRunning) {
  wfgLaSetStatus(... '擷取進行中，請先按「停止」再釋放控制權');
  wfgLaLinkToast('擷取進行中，請先按「停止」再釋放控制權', 'warn');
  return;   // ← 就是這行擋住：擷取中按 OFF 直接被退回，逼使用者先手動按停止
}
```

連線鈕本身 v455 已永遠可點（`wfgLaToggleHardwareLink` 只擋 `wfgLaLinkBusy` 連點），所以按得下去，但一進 `wfgLaHardwareLinkOff` 就被這個 `wfgLaCaptureRunning` 分支 `return` 掉，燈不會轉灰、不會斷線。

**改的是哪幾段 code（只動 `wfgLaHardwareLinkOff`，狀態機/claim/heartbeat 其餘零改動）**：
1. 刪掉上述 early return。改成先 `wfgLaLinkBusy=true` + `wfgLaStopLinkHeartbeat()`，進入 try 後**若 `wfgLaCaptureRunning` 為真，自動 `await wfgLaStopCapture()`**（＝停止鍵同一支函式：`wfgLaCaptureSessionToken++` 讓進行中的擷取迴圈 token 失效、送 `RUN=0x00`、`wfgLaCaptureRunning=false`）。
2. 接著沿用原本的 `releaseInterface` 迴圈 + `dev.close()`。`close()` 會把任何 in-flight EP6 `transferIn` 乾淨中止並 reject；該 reject 落到 `wfgLaStartCapture` 的 catch（14318）時因 `sessionToken !== wfgLaCaptureSessionToken` 直接 `return`，不會誤觸 `wfgLaRecoverUsbDevice` 重連 → 無副作用。
3. 斷線順序：中止擷取 → `RUN=0x00` → `releaseInterface` → `close` → 清 `wfgLaClaimedInterfaces`、`wfgLaLinkActive=false`、`wfgLaRenderLinkButton()`（燈轉灰、v455 的 single/repeat/stop 變灰邏輯照走）。

**效果**：任何狀態按一次 OFF 都能斷線。擷取中按 OFF → 自動先停擷取再斷；未擷取按 OFF → 與舊版行為相同正常斷線（未進 `wfgLaCaptureRunning` 分支）。

**② 斷線後 PWM1/PWM2 綠燈熄滅**：PWM 綠燈＝`.wfg-la-pwm.active`（CSS wfg.html:353，綠底綠字），由 `wfgLaUpdatePwmButtons()`（wfg.html:4797）以 `!!enabled && wfgLaHardwareReady`（4801-4802）決定。斷線＝硬體不再就緒，故只要 `wfgLaHardwareReady=false` 且有刷新即熄滅。改動：
1. `wfgLaHardwareLinkOff()`（wfg.html，`wfgLaLinkActive=false` 之後）：原本靠 `wfgLaSetStatus('wfg-la-status-device','warn')`（7673-7677）間接設 `wfgLaHardwareReady=false` 並呼叫 `wfgLaUpdateToolbarState`→`wfgLaUpdatePwmButtons`，但該 toolbar 更新包在 try/catch（7677）有被吞風險 → **新增顯式 `try { wfgLaUpdatePwmButtons(); } catch {}`**，保證 OFF 一定刷新 PWM 熄滅。
2. `wfgLaLinkOnControlLost()`（wfg.html，自動斷線：USB 拔除 7737 / heartbeat handle 失效）：原本只設 `wfgLaLinkActive=false` + 'bridge' 狀態，**不動 `wfgLaHardwareReady`**（'bridge' 非 'device'）→ PWM 不會刷新。**新增 `wfgLaHardwareReady=false` + `wfgLaUpdatePwmButtons()`**，自動斷線也熄滅 PWM。
   ON（成功 claim 且 proto ok）→ `wfgLaSetStatus('device','ok')` 設 `wfgLaHardwareReady=true` → PWM 恢復反映實際 enabled 狀態，還原路徑未動。未加 `&& wfgLaLinkActive` 至 gate（避免「未按連線鈕直接擷取＝硬體就緒但 linkActive=false」被誤熄的回歸）。

**③ 連線 on/off 按鈕移到「執行」group 最左**：HTML `<div class="wfg-la-tool-group">`（wfg.html:1349）內，把 `#wfg-la-link-btn`（原在 stop 之後、group 最右）移到 group-label「執行」之後、`#wfg-la-single-btn` 之前 → 成為 group 第一個按鈕（最左）。純移動 DOM 位置，class/onclick/圓形圖示/顏色/狀態機全部不變。其餘 單次→循環→暫停 順序不動。

**驗證（Chrome MCP 自開分頁，操作式）**：見對話回報 — Node 狀態機模擬證 ①「擷取中按一次 OFF＝先停擷取再 release→close、燈灰」；Chrome 載入改版頁確認版本 v2.97.456、console 無錯、③ link 鈕在「執行」group 最左（單次前）、② 斷線態（`wfgLaHardwareReady=false`）PWM1/PWM2 無 `.active`（綠燈熄）並截圖。

**版本同步**：`common/version.js` `wfg: v2.97.455 → v2.97.456`；`wfg.html` `version.js?v` / `i18n.js?v` → `…20260714wfg456`。

## TCON 波形產生器 (wfg) v2.97.455 — 2026-07-14

**需求（Bruce）**：把「執行」group 內其他控制按鈕（單次/循環/暫停）的可用性綁定硬體連線 on/off。OFF（未連線）→ 不可點/不可選取、無藍色 focus 外框、變不明顯灰色、原紅色暫停鈕也要變灰；ON（已取得控制）→ 恢復正常（可點、暫停恢復紅色）。硬體沒連線就不能操作擷取控制，連線後才可用。

**現行狀態機（先讀懂再改，非猜測）**：`wfgLaLinkActive`（3756 行）= 使用者是否已用連線按鈕搶下 M16-200 控制權，即 Bruce 說的 link on/off 真值。`wfgLaRenderLinkButton()`（4687）是所有改變 link 狀態路徑（claim 成功 14399 / release 14467,14480 / control-lost / USB 拔除 7715）的**共同單一出口**。故把 enable/disable 綁在這裡 → 全路徑即時同步。

**改的是哪幾段 code**：
1. **JS（`wfgLaRenderLinkButton` 末尾 + 新增 `wfgLaSyncRunButtonsEnabled`，約 wfg.html:4695）**：依 `wfgLaLinkActive` 對 `#wfg-la-single-btn` / `#wfg-la-repeat-btn` / `#wfg-la-stop-btn` 設 `disabled = !on`。用原生 `disabled` 屬性：瀏覽器天生阻止點擊與 focus（故無藍色 focus 外框、onclick 不觸發）。連線按鈕本身不在清單，永遠可點以供切換。
2. **CSS（run-btn 區塊，約 wfg.html:299-305）**：新增 `.wfg-la-toolbar .wfg-la-run-btn:disabled`（特異度 0,3,0）→ 暗灰 `#3a4048`、`pointer-events:none`、`cursor:not-allowed`、`box-shadow:none`。特異度刻意 ≥ `.wfg-la-run-btn.stop.acq-active`（0,3,0，本規則在後贏）與 `.wfg-la-toolbar button.acq-active` 藍框（0,2,1），確保 OFF 時**暫停鈕即使帶 acq-active 也不紅、且無藍框**。

**驗證（Chrome MCP 實測 computed 值 + 截圖）**：
- OFF 態：single/repeat/stop 三顆 `disabled=true`、`color=rgb(58,64,72)=#3a4048` 暗灰、`box-shadow=none`（無藍框）、`pointer-events=none`、`cursor=not-allowed`；stop 雖帶 `acq-active` 仍為暗灰**非紅**；連線鈕 `disabled=false` 仍可點。截圖確認三顆融入背景。
- ON 態（`disabled=false` 分支，等效 `wfgLaLinkActive=true`；因該變數為閉包內變數無法從外部賦值，以移除 disabled 呈現同一行 `b.disabled=!on` 的 on=true 結果）：single/repeat 恢復 `#6b7280`、**stop 恢復紅色 `#f87171`**、`pointer-events=auto`、`cursor=pointer`，60ms 後穩定未被打回。截圖確認暫停回紅、可點。

**版本同步**：`common/version.js` `wfg: v2.97.454 → v2.97.455`；`wfg.html` `version.js?v` / `i18n.js?v` → `…wfg455`。

## TCON 波形產生器 (wfg) v2.97.454 — 2026-07-13

**需求（Bruce）**：v2.97.453 硬體連線按鈕的電源符號圓底渲染成**橢圓形、很難看**，要改回**正圓形**。

**根因（Chrome MCP 實測，非猜測）**：CSS 特異度衝突。通用規則 `.wfg-la-toolbar button { height:26px; padding:0 7px }`（特異度 0,1,1）壓過 `.wfg-la-link-btn { height:40px }`（特異度 0,1,0），使整個按鈕實際只有 **26px 高**（非設計的 40px）。圓底 `.wfg-la-link-icon`（`flex-shrink` 預設 1）在被壓扁的按鈕內被壓縮 → 高度由 26px 縮成 **17px**、寬度維持 26px → 渲染成 **26×17 橫向橢圓**。線上 v453 實測 `getBoundingClientRect` = `{w:26, h:17}` 坐實。

**改的是哪幾段 code（只動圓底形狀相關 CSS，狀態機/claim/release/自動 off 邏輯零改動）**：
1. **選擇器特異度**：`.wfg-la-link-btn`（media 區塊，wfg.html:306）→ `.wfg-la-toolbar .wfg-la-link-btn`（特異度 0,2,0），蓋過 `.wfg-la-toolbar button` 的 26px 高與 `0 7px` padding，按鈕恢復設計的 40px 高 + `0 2px 1px` padding，圓底才有垂直空間。
2. **鎖死圓底正方形**：`.wfg-la-link-icon`（wfg.html:309）加 `flex: 0 0 auto; aspect-ratio: 1;`，保留原 `width:26px; height:26px; border-radius:50%`，確保任何情況都不被 flex 拉伸/壓縮 → OFF/ON/busy 三態圓底皆恆為正圓。

**驗證**：Chrome MCP 自開分頁載入修改版，量 `.wfg-la-link-icon` `getBoundingClientRect` 確認 width===height，OFF/ON 兩態各截圖確認肉眼正圓（見回報）。

**版本同步**：`common/version.js` `wfg: v2.97.453 → v2.97.454`；`wfg.html` `version.js?v` / `i18n.js?v` → `…wfg454`。

## TCON 波形產生器 (wfg) v2.97.453 — 2026-07-13

**需求（Bruce）**：把「執行」group 內的硬體連線按鈕（v2.97.452 的膠囊+內嵌 ON/OFF 文字）改成**電源符號(⏻)圖示 + 圖示下方 ON/OFF 文字**的形式。ON=白色電源圖示填在**亮綠**圓底上（參考圖為紅，Bruce 要改亮綠）+ 下方 ON 文字；OFF=圖示用**與框框背景同色**的低調外觀（融入背景、看似熄滅）+ 下方 OFF 文字。狀態機/claim/release/自動 off 邏輯完全不動，只改視覺。

**改的是哪幾段 code（只動視覺呈現，狀態機零改動）**：
1. **CSS（`@media(min-width:901px)` 內 `.wfg-la-link-btn` 區塊，約 wfg.html:299-320）**：由「膠囊 + 內嵌文字」改為 `flex-direction:column` 的「圓底電源圖示 + 下方文字」。新增 `.wfg-la-link-icon`（26px 圓底，OFF 態 `background:#161b22` = 工具列 `.wfg-la-toolbar` 背景色 → 融入框背景熄滅、極淡 `inset` 內描邊）與 `.wfg-la-link-text`（下方 9px ON/OFF 文字）。`.on` → 圓底 `#22c55e` 亮綠 + 白色 glyph（`svg stroke:#fff`）+ 綠光暈 + 文字 `#4ade80`；`.busy` → 黃底閃爍（沿用 `wfg-cursor-blink`）+ 深色 glyph。
2. **HTML（執行 group 內 `#wfg-la-link-btn`，wfg.html:1338）**：內容由單一 `.wfg-la-link-led` span 改為 `.wfg-la-link-icon`（內嵌電源符號 SVG：`M12 2.5 L12 12` 豎線 + `M7.05 6.55 a7 7 0 1 0 9.9 0` 上方缺口圓弧）+ `.wfg-la-link-text`（**id 仍為 `wfg-la-link-led`**，讓 JS 不需改動）。
3. **JS（`wfgLaRenderLinkButton`）**：**零改動**。仍 toggle 按鈕 `on`/`busy` class + 對 `#wfg-la-link-led` 設 `textContent`（現在是文字 span）。綁定沿用 `wfgLaLinkActive`（綠/ON 唯一真值）。

**取的「框背景色」值**：`#161b22`，來源＝現行 `.wfg-la-toolbar { background:#161b22 }`（wfg.html:197，工具列/按鈕容器背景）。非猜測。

**驗證**：Chrome MCP 自開分頁載入修改版，截 OFF/ON 兩態並確認狀態切換未破壞（見回報）。

**版本同步**：`common/version.js` `wfg: v2.97.452 → v2.97.453`；`wfg.html` `version.js?v` / `i18n.js?v` → `…wfg453`。

## TCON 波形產生器 (wfg) v2.97.452 — 2026-07-13

**需求（Bruce）**：v2.97.451 的連線燈號按鈕，把 on/off 字樣改成放在**燈號內部**、且用**英文 ON / OFF**（不要外部中文「連線／已連線」標籤）。燈號圓點改成膠囊，內顯示 ON（綠）／ OFF（灰）。

**改的是哪幾段 code**：
1. **HTML（執行 group 內 `#wfg-la-link-btn`）**：移除外部 `#wfg-la-link-text`（中文「連線」）span；`#wfg-la-link-led` 內文改由 JS 填 `ON`/`OFF`，預設 `OFF`。
2. **CSS（`@media(min-width:901px)` 內 `.wfg-la-link-led`）**：燈號從 10px 圓點改為膠囊（`min-width:34px;height:18px;border-radius:9px`），內含 `ON`/`OFF` 文字（700 10px 等寬字、字距 0.6px、置中）。off=灰底(`#6b7280`)深字；`.on`=綠底(`#22c55e`)深字+綠光暈；`.busy`=黃底閃爍。按鈕本身縮為燈號 hit area。
3. **JS（`wfgLaRenderLinkButton`）**：不再操作已移除的 text span；改為 `led.textContent = busy ? '…' : (active ? 'ON' : 'OFF')`。
4. **i18n（`wfg.laLinkBtnTitle`）**：tooltip 文案更新為 ON/OFF 用語（三語）。`laLinkOff/laLinkOn` 已不再使用（保留不影響）。

**實機驗證（真實 M16-200，非模擬）**：見本版下方「實機」小節與 v2.97.451。首次 USB 選擇器由 Bruce 手點完成配對後，此 origin `getDevices()` 由 0→1，網頁按 ON 對真實 M16-200（VID 0x77a1 / PID 0x01a2）`open()`+`claimInterface()` 成功、`device.opened=true`、燈號轉綠 ON。

**版本同步**：`common/version.js` `wfg: v2.97.451 → v2.97.452`；`wfg.html` `version.js?v` / `i18n.js?v` → `…wfg452`。

## TCON 波形產生器 (wfg) v2.97.451 — 2026-07-13

**需求（Bruce，逐字為準）**：在 LA「執行」group 內加一個硬體連線的 on/off 按鈕（兼狀態燈）。用途：若同時開著原廠 UI 且原廠 UI 也連著硬體，可用此按鈕把硬體控制權「搶回」本工具。預設灰 off；按 on → 綠 on 並搶回控制權；再按 → off 釋放；或控制權被搶走/裝置斷線 → 自動變 off。

**改的是哪幾段 code（wfg.html + common）**：
1. **HTML — 按鈕（`wfg.html` 執行 group，`<div class="wfg-la-tool-group">` 內、stop 按鈕之後）**：新增 `#wfg-la-link-btn`（`.wfg-la-link-btn`），內含 `#wfg-la-link-led`（燈點）+ `#wfg-la-link-text`（文字「連線 / 已連線」）。`onclick=wfgLaToggleHardwareLink()`，`data-i18n-title=wfg.laLinkBtnTitle`。放在「執行」group 內 single / repeat / stop 三顆之後（同一 group）。
2. **CSS（`.wfg-la-run-btn.stop.acq-active` 之後）**：`.wfg-la-link-btn { display:none }`，僅 `@media(min-width:901px)` 桌面顯示（WebUSB 限桌面 Chrome/Edge，比照 `.wfg-la-view-io` 桌面專屬做法）。`.on`＝綠燈（`#22c55e` + 綠光暈）、預設＝灰燈（`#6b7280`）、`.busy`＝黃燈閃爍（沿用 `wfg-cursor-blink`）。
3. **JS globals（`wfgLaReconnectUserCancelled` 之後）**：`wfgLaLinkActive`（燈綠/灰唯一真值＝是否握有控制權）、`wfgLaLinkBusy`、`wfgLaLinkHeartbeatTimer`。
4. **JS 渲染（`wfgLaUpdateToolbarState` 末端）**：加 `wfgLaRenderLinkButton()`，依 `wfgLaLinkActive`/`wfgLaLinkBusy` 切 `on`/`busy` class 與文字、`aria-pressed`。
5. **JS 狀態機（`window.wfgLaStopCapture` 之後）**：
   - `wfgLaToggleHardwareLink()`：busy 時忽略連點；active→off、否則→on。
   - `wfgLaHardwareLinkOn()`：`wfgLaGetReadyDevice()`（open，必要時跳 USB 選擇器）→ `wfgLaClaim原廠Interface()`（＝真正搶回控制權）。成功才 `wfgLaLinkActive=true` 亮綠，並輕量 `wfgLaCanReadProtocol` 判斷 protocol 是否就緒（不就緒仍算搶到控制權，僅提示需初始化）。**claim 失敗絕不假亮綠**：被占用→灰 + 「裝置被其他程式占用，無法取得控制權（請先關閉原廠 UI 或按其停止再試）」；取消→「未選擇 USB 裝置」。擷取進行中按 on 直接反映綠燈（控制權本就在本工具）。
   - `wfgLaHardwareLinkOff()`：`releaseInterface`＋`close` 釋放控制權、燈回灰；擷取中拒絕釋放並提示先停止。
   - `wfgLaLinkOnControlLost(reason)`：自動 off（斷線/handle 失效）→ 靜默轉灰 + 同步內部狀態。
   - `wfgLaStartLinkHeartbeat()`/`wfgLaStopLinkHeartbeat()`：2s 輕量偵測（僅檢查 `dev.opened` + `getDevices` 仍含 原廠，**不打 EP0** 以免未載韌體時誤判），擷取中/背景分頁略過。
6. **JS 斷線掛勾（`navigator.usb` `disconnect` 監聽內、`wfgLaForgetDevice` 之後）**：`if (wfgLaLinkActive) wfgLaLinkOnControlLost(...)`，拔除 USB 立即轉灰。

**搶控制權的真實能力與限制（誠實，未以假狀態掩蓋）**：WebUSB `claimInterface` 為獨佔。macOS 上若原廠 UI 目前正持有該 interface，本工具 claim 會直接失敗（無法強制 detach kernel/user driver）→ 維持灰燈 + 明確占用訊息。一旦本工具成功 claim，反過來原廠 UI 就 claim 不到。故本按鈕實作的是「硬體可被取得時 open+claim 搶下；被占用時誠實回報」，即『先放掉的一方另一方才能接手』——這是平台限制，不是本工具的取捨。

**驗證（見該版驗證章節；下方 commit）**：UI 狀態機以 Chrome 實測（灰↔綠切換、busy 黃燈、claim 失敗維持灰＋訊息、失控自動回灰）。實機（M16-200 已接 + USB 選擇器配對）之真正 claim 搶回/釋放屬需 Bruce 端硬體的部分，照實標示。

**版本同步**：`common/version.js` `wfg: v2.97.450 → v2.97.451`；`wfg.html` `version.js?v=…wfg450→wfg451`、`i18n.js?v=…wfg449→wfg451`；`common/i18n.js` 新增 `wfg.laLinkBtnTitle / laLinkOff / laLinkOn`。

## TCON 波形產生器 (wfg) v2.97.450 — 2026-07-13

**需求（Bruce）**：修好 LA 分頁 DP AUX 解碼「回覆前有 turn-around / pre-charge glitch 就被誤殺成 !ERR」的 bug，並推廣讓所有同因的假 !ERR 都能正確解出，同時不可過度抑制真正的線上異常。

**根因（兩個獨立調查 + 專案記憶收斂）**：REQ→REPLY 方向切換時，回覆端在真正 SYNC preamble 之前會先產生一撮極窄的 pre-charge / ringing edge（gap 遠小於半位元 tHalf，約 5~80ns << 500ns）。此 glitch 讓兩處判斷以「最後一個 glitch 邊」為基準而非「真正靜止線」：
- **source 狀態機**（`wfgLaDecodeDpAuxSourceRows`，約 wfg.html:11978 後）：`previousQuiet` 因 glitch 相鄰而為 false，且 `followsTurnAround`（以 `syncFirstIndex-1` 計）在前一 frame 為 anomaly（`lastFrameStopEndSample` 被破壞）時失敗 → 整段合法 SYNC 落入最後 else 分支被丟棄 → 無 frame → 落到 `addUnparsedActivityAnomalies()` fallback 標「Unparsed AUX activity」!ERR。並會連鎖破壞後續 frame 的 `lastFrameStopEndSample`，造成大量 cascade 誤殺。
- **validate 階段**（`wfgLaDpAuxValidatePreambleRows` 的 `invalidReason`，約 wfg.html:11439）：preamble 掃描窗往前 padding `halfNominal*tolPct`（約 125ns）會把 SYNC 前 80ns 的 pre-charge glitch 納入，其 gap < minHalf → 回 `Invalid preamble duty/frequency`，把已由 source 正確 emit 的合法 reply 再降級成 !ERR。

**改的是哪段 code**：
- `wfg.html` `wfgLaDecodeDpAuxSourceRows`（source 狀態機，`followsTurnAround` 宣告後、`if(followsPreviousStop||followsTurnAround)` 前）：新增「剝除 SYNC 前 turn-around / pre-charge glitch run」邏輯 —— 往回走過整段 sub-bit（gap `< tHalf - tError`）的 glitch run（`preRunFirstIdx`，上限 64 邊防呆），若 run 之前是靜止線（`preRunLeadGap >= 3*tHalf`）或落在 turn-around 視窗內（`preRunFollowsTurnAround`）或 `followsPreviousStop`，即認定 `isPreChargeRun`；第一個條件式改為 `if (followsPreviousStop || followsTurnAround || isPreChargeRun)`，不丟 SYNC、不標 prefix ERR，交由後續 START + Manchester + `completePayload` 獨立把關。
- `wfg.html` `wfgLaDpAuxValidatePreambleRows` `invalidReason` 的 preamble duty 掃描迴圈：新增 `seenValidHalf` 閘 —— 在遇到第一個「合法半位元 gap（`[minHalf,maxHalf]`）」之前，容忍領先的 sub-half-bit(pre-charge) gap（`gap < minHalf` → `continue` 不計不報錯）；一旦進入真正 preamble 即恢復嚴格 duty 檢查。

**反例保護（不藏真錯）**：source 端 emit 閘（START timing + 逐 bit Manchester + `completePayload`）與 validate 端「進入 preamble 後的 duty / frequency / edge-count」檢查一字未改，只容忍「真正 SYNC 之前」的領先 pre-charge glitch。去 glitch 後仍框不出合法 frame 的段落維持 anomaly（Incomplete AUX payload / Unparsed AUX activity）。

**操作式驗證（Chrome，Bruce 條件，本機 http server + JS 灌檔）**：
- 敏感版 `AUX_ST_敏感版_20260713.kvdat`（DP AUX CH0 / 1Mbps）：**修正前 v449 = 304 列 / 274 個 !ERR**（#1 `!REQ` NO REPLY、#2/#3/#5 Unparsed、#4 Narrow glitch、#6/#9 preamble gap…cascade）；**修正後 = 226 列 / 0 個 !ERR**，#2 正確解為 `REPLY / TCON ACK + 0x12`（DPCD0x00000=0x12=DP1.2），#1、#39 讀 0x00000 皆有回覆（#40 = 16-byte 接收能力區塊，語意合理）。
- 回歸 `AUX_ST_正常版_20260709.kvdat`：修正前後**逐列雜湊完全相同**（`5e632fd4-d0767f75-31103`，426 列 / 0 ERR），健康檔零改動。
- 反例正控：對敏感版故意用**錯誤 bitRate=2Mbps**（訊號真的框不出）解碼 → **226 列全部 !ERR、0 REPLY**，證明修正不會硬還原 / 藏真錯。本敏感檔在正確 config 下無「真正壞掉」段落，274 筆 !ERR 全為 cascade 假陽性。

**協議依據**：dp-aux-dpcd skill（Manchester II、turn-around pre-charge、DPCD_REV 0x00000=0x12 = DP1.2）。

**版本同步**：`common/version.js` `wfg: v2.97.449 → v2.97.450`；`wfg.html` 的 `version.js?v=20260713wfg449 → wfg450`。

## TCON 波形產生器 (wfg) v2.97.449 — 2026-07-13

**需求（Bruce）**：LA 分頁「取得韌體檔案（聯絡 Bruce）」按鈕按下後的對話框/引導文字裡，只寫「Bruce」，不要露出中文全名。

**改的是哪段 code（只動文字，不動任何功能）**：
- `common/i18n.js`：
  - `wfg.laGuideStep1`（引導視窗第一步說明）zh-TW「請聯絡 Bruce（鄭少鈞）協助提供」→「請聯絡 Bruce 協助提供」；zh-CN「请联络 Bruce（郑少钧）协助提供」→「请联络 Bruce 协助提供」。
  - `wfg.laContactBody`（「需聯絡 Bruce 協助」對話框內文）zh-TW「請聯絡 Bruce（鄭少鈞）協助提供」→「請聯絡 Bruce 協助提供」；zh-CN「请联络 Bruce（郑少钧）协助提供」→「请联络 Bruce 协助提供」。
  - `en` 兩者原本即為「contact Bruce」，未動。其餘 key（`laGuideContactBruce` label、`laContactTitle`、`laContactClose`、清除韌體相關）本就只有英文 Bruce，未動。

**未動 / 回歸**：對話框開關函式 `wfgLaOpenContactBruce` / `wfgLaCloseContactBruce`、按鈕行為、清除韌體狀態、匯入 zip、WebUSB 灌韌體主流程一字未改。

**版本同步**：`common/version.js` `wfg: v2.97.448 → v2.97.449`；`wfg.html` 的 `version.js?v=20260713wfg448 → wfg449`、`i18n.js?v=20260713wfg448 → wfg449`。

## TCON 波形產生器 (wfg) v2.97.448 — 2026-07-13

**需求（Bruce，LA 分頁 WebUSB 韌體流程兩項 UI 改動）**：

**改動1 — 第一次使用引導的「去 NAS 下載」按鈕改成聯絡 Bruce 對話框**：LA 分頁（`wfg.html#la`）第一次擷取時若瀏覽器內沒有韌體，會跳出引導視窗 `wfgLaOpenPackageGuide()`（標題「WebUSB 檔案包準備」），其中「開啟下載頁」按鈕原本 `window.open(WFG_LA_PACKAGE_URL)` 直接連 Bruce 的 Synology NAS 分享連結（`https://218.161.24.173:5001/d/s/...`，需分享密碼）。本版將該按鈕行為改為**彈出一個沿用頁面深色 dialog 樣式的對話框，內容顯示「需聯絡 Bruce 協助」**（附一句說明：如需要 WebUSB 韌體檔案包請聯絡 Bruce，取得後回上一視窗按「匯入 zip 檔案包」完成設定）。**不再自動連 NAS 下載**。「匯入 zip 檔案包」為另一顆獨立按鈕（`#wfg-la-package-input` → `wfgLaImportPackageZip()`），**保留不動**，Bruce 之後把檔案給使用者仍可匯入。

**改動2 — 新增「清除韌體狀態」按鈕（方便 Bruce 測試）**：新增 `wfgLaClearFirmwareState()`，清掉存放韌體/裝置包的 **IndexedDB `wfg-M16-200-firmware` 的 `files` object store**（fx2 / fpga 兩筆，`store.clear()`）＋ localStorage 的 `wfgLaPackageFileName` 檔名記錄，並重置記憶體旗標 `wfgLaHardwareReady = false`。清除前用 `confirm()` 二次確認，清除後 `alert()` 提示完成。清完後 `wfgLaHasStoredFirmwarePackage()` 回 false，下次按單次/循環即回到「第一次使用」流程（自動彈出檔案包引導）。按鈕放在 LA 工具列「設定」齒輪面板（`wfgLaRenderSettingsBody`）底部「韌體 / 測試」區。**只清韌體那份，不影響其他設定或波形**。

**改的是哪段 code**：
- `wfg.html`：引導視窗按鈕 onclick `wfgLaOpenPackageDownload()` → `wfgLaOpenContactBruce()`、label `wfg.laGuideOpenDownload` → `wfg.laGuideContactBruce`；新增 `wfgLaOpenContactBruce()` / `wfgLaCloseContactBruce()`（獨立 backdrop id `wfg-la-contact-backdrop`，沿用 `.wfg-la-guide-*` 深色樣式）；原 `wfgLaOpenPackageDownload()` 改為導向 `wfgLaOpenContactBruce()`（相容 alias，移除 `window.open(NAS)`）。新增 `wfgLaClearFirmwareState()`；`wfgLaRenderSettingsBody()` innerHTML 末端加「韌體 / 測試」區與清除按鈕。
- `common/i18n.js`：新增 `wfg.laGuideContactBruce` / `wfg.laContactTitle` / `wfg.laContactBody` / `wfg.laContactClose` / `wfg.laClearFwBtn` / `wfg.laClearFwConfirm` / `wfg.laClearFwDone` / `wfg.laClearFwFail` / `wfg.laClearFwSection`（皆 zh-TW/en/zh-CN）；`wfg.laGuideStep1` 措辭由「開啟下載頁、輸入分享密碼並下載」改為「請聯絡 Bruce 協助提供」。

**未動 / 回歸**：WebUSB 灌韌體主流程（`wfgLaImportPackageZip` 驗 SHA-256、`wfgLaInitHardwareFromStoredFirmware`、`wfgLaUploadFx2Firmware` 兩階段重枚舉、FPGA 載入）一字未改；匯入 zip 功能保留；`WFG_LA_PACKAGE_URL` 常數保留但不再被任何按鈕呼叫。

**版本同步**：`common/version.js` `wfg: v2.97.447 → v2.97.448`；`wfg.html` 的 `version.js?v=20260713wfg447 → 20260713wfg448`、`i18n.js?v=20260704e → 20260713wfg448`。

## TCON 波形產生器 (wfg) v2.97.447 — 2026-07-13

**需求（Bruce，兩項一起進版）**：

**需求1 — 快捷 preset 套用後一律用現行分析器重跑解碼（根治過期烘焙誤報）**：快捷選單套用範例時原本會直接載入 snapshot 內烘焙好的 `decodeResults`，而非用現行分析器對波形重跑。舊版 decoder 的解碼結果被烘焙進 snapshot，decoder 進化後直接顯示就變成過期誤報（例：eDP AUX 解碼異常範例中心 7.774s 那筆假 `!ERR`「AUX preamble gap format error」，現行 decoder 重跑後會消失變回正常 REQ）。防呆 `hasStaleAuxGlitchErrors` 查 `r.description`、但 snapshot 錯誤字串存在 `r.value`，欄位對不上攔不到。改為 Bruce 設計原則：快捷 preset **只套用「波形 + 設定 + 分析器 config」，不套 snapshot 的解碼結果**；套用後**一律用現行分析器重跑一次**，顯示永遠是現行 code 算出來的。範圍＝所有快捷 preset（不只 AUX）。

**需求2 — 解碼結果 Time 欄用完整精確時間（畫面 + Excel 匯出都要準確）**：解碼表 Time 欄原本走 `wfgLaDisplayTimeLabel → wfgLaTimeLabel`，對「秒」只 `toFixed(3)`（＝毫秒精度），把樣本位置捨進 ms（例 7.774000005s 只顯示 7.774s）；Excel 匯出固定 `toFixed(9)`。改為顯示足以精確定位的完整時間，且 Excel 匯出的 Time 精確、未被四捨五入截斷。

**改動內容 / 改的是哪段 code**：`wfg.html`
- 需求1：`wfgLaApplyParsedKvdatCapture` 末端 `if (!wfgLaApplyPresetDecodeResults(options.decodeResults)) wfgLaRunAnalyzers();` → 直接 `wfgLaRunAnalyzers();`。分析器 config 於本函式上方（`parsed.analyzers → wfgLaAnalyzers / wfgLaRenderAnalyzers`）已套妥，故重跑前 config 正確；沒有分析器的 preset，`wfgLaRunAnalyzers()` 迴圈跑 0 次 → 只顯示波形、不解碼也不報錯。`wfgLaApplyPresetDecodeResults` / `hasStaleAuxGlitchErrors` 自此不再被呼叫，保留為死碼（最小更動）。
- 需求2：新增 `wfgLaDecodeTimeDecimals()`（位數隨取樣率自適應：`ceil(log10(rate))+1`，下限 9、上限 12）與畫面用 `wfgLaDecodeRowTimeLabel()`（相對觸發零點的完整秒數、去尾端 0，去 0 非四捨五入不損精度）。三個 dp_aux/i2c_eeprom/預設 `renderRow` 的 Time 欄由 `wfgLaDisplayTimeLabel` → `wfgLaDecodeRowTimeLabel`。Excel `wfgLaExcelTimeLabel` 由固定 `toFixed(9)` → `toFixed(wfgLaDecodeTimeDecimals())`；I2C 匯出 `wfgLaI2cExportTimeLabel` 由 `toFixed(10)` → 同一自適應位數。搜尋文字 `wfgLaDecodeSearchText` 額外收錄完整時間 label，讓搜尋框可用畫面顯示的完整時間比對。

**未動 / 回歸**：座標軸等共用的 `wfgLaTimeLabel`／`wfgLaDisplayTimeLabel` 本體未改（只在解碼表另走新函式），故座標軸、cursor、hover 時間顯示不受影響；解碼數值、欄名、欄寬、`!` 異常標記（v2.97.445/446）等皆未動。

**版本同步**：`common/version.js` `wfg: v2.97.446 → v2.97.447`；`wfg.html` 的 `version.js?v=20260712wfg446 → 20260713wfg447`。

## TCON 波形產生器 (wfg) v2.97.446 — 2026-07-12

**需求（Bruce）**：延續 v2.97.445，LA 分頁 AUX「解碼結果」表 Type 欄加「!」的範圍，使用者原始要求是「解碼結果有**異常或警告**（黃色或紅色字樣）都加!」。v2.97.445 漏把 **preamble 警告（`auxPreambleWarn`，SYNC 18~25 的 `.warn` badge：底 #854d0e、字 #fde68a 淡黃、黃色外框，屬黃色系「警告」）** 納入，該分支被 `if (r.auxPreambleWarn) return false;` 排除掉、沒加「!」。本版把 preamble 警告也納入加「!」範圍。

**改動內容**：僅改共用判定 `wfgLaDpAuxTypeIsAnomaly(r)` 一行 —— `if (r.auxPreambleWarn) return false;` → `if (r.auxPreambleWarn) return true;`，讓黃色系 preamble warn 列也回 true。判定順序仍為：黃色 nonack（`wfgLaDpAuxIsNonAckReply`）→ 黃色系 preamble warn（`auxPreambleWarn`）→ 紅色（`wfgLaDpAuxExportProtocolError`，含 `auxPreambleError`）。因畫面 badge、搜尋文字（`wfgLaDecodeSearchText`）、Excel 匯出（`wfgLaBuildDecodeExcelXml`）三處都共用此一判定，改這一處三處同步。顏色樣式（`badgeCls ' warn'`）、`auxPreambleError` 紅色分支、其他欄、解碼數值與判定皆未動。

**改的是哪段 code**：`wfg.html` — `wfgLaDpAuxTypeIsAnomaly()` 內 `if (r.auxPreambleWarn) return false;` → `return true;`（單行，另更新該函式註解）。renderRow、`wfgLaDecodeSearchText`、`wfgLaBuildDecodeExcelXml` 均未改（自動沿用新判定）。

**回歸**：v2.97.445 的黃色 nonack、紅色 ERR/協定錯誤加「!」不變；正常 REQ、正常(ACK) REPLY 仍不加「!」。`auxPreambleError`（SYNC <18）本就走紅色 protocolError 分支加「!」，本版未動。

**版本同步**：`common/version.js` `wfg: v2.97.445 → v2.97.446`；`wfg.html` 的 `version.js?v=20260712wfg445 → 20260712wfg446`。

## TCON 波形產生器 (wfg) v2.97.445 — 2026-07-12

**需求（Bruce）**：LA 分頁 AUX「解碼結果」表格的 Type 欄，凡是文字為黃色（異常回覆高亮 NACK/DEFER）或紅色（ERR／協定錯誤）的列，就在該欄文字前加「!」（`!REPLY`、`!ERR`，紅色的 `!REQ`／no-reply 也算），讓使用者在搜尋框打「!」即可一次撈出所有黃/紅異常列；正常 REQ、正常(ACK) REPLY 不加。此「!」需畫面顯示、搜尋、Excel 匯出三處一致（Excel 也能用「!」篩異常）。

**改動內容**：新增共用判定 `wfgLaDpAuxTypeIsAnomaly(r)`，回傳該列 Type 是否為「黃(nonack)或紅(err)」異常上色 —— 完全沿用畫面 renderRow 既有依據不重算：黃色 = `wfgLaDpAuxIsNonAckReply(r)`（優先，對應 td.wfg-la-type-nonack）；`auxPreambleWarn` 的橘色 warn 屬非黃非紅、不加「!」；紅色 = `wfgLaDpAuxExportProtocolError(r)`（與畫面 `isProtocolError` 同一組條件 NACK/ERR/auxNoReply/protocolError/auxPreambleError）。三處引用同一判定：①畫面 dp_aux `renderRow` badge 文字（`typeDisplayText`）②搜尋文字 `wfgLaDecodeSearchText` 的 type token ③Excel 匯出 `wfgLaBuildDecodeExcelXml` 的 Type cell。「!」真的放進文字內容（非 CSS ::before），故搜尋框與匯出都撈得到。

**改的是哪段 code**：`wfg.html` — (1) 新增 `wfgLaDpAuxTypeIsAnomaly()`；(2) dp_aux `renderRow` badge 由 `wfgLaEscapeHtml(r.type)` → `wfgLaEscapeHtml(typeDisplayText)`；(3) `wfgLaDecodeSearchText` 陣列 type 欄改帶「!」前綴的 `typeText`；(4) `wfgLaBuildDecodeExcelXml` 第 3 欄 `wfgLaExcelCell(row.type||'', frameStyle)` → 帶「!」。黃色/紅色樣式本身、badgeCls/frameStyle、其他欄、解碼數值與判定、欄寬皆未動。

**版本同步**：`common/version.js` `wfg: v2.97.444 → v2.97.445`；`wfg.html` 的 `version.js?v=20260712wfg444 → 20260712wfg445`。

## TCON 波形產生器 (wfg) v2.97.444 — 2026-07-12

**需求（Bruce）**：LA 分頁 AUX 解碼結果的 Excel 匯出欄名，要與畫面解碼表表頭「逐欄」一致。前幾版（v2.97.442/443）只改了畫面 DP AUX 表頭（Frame→Type、Command / Reply→Content），但 Excel 匯出欄名（`wfgLaExcelLabels`）沒跟著改，造成匯出檔欄名與畫面不一致。

**改動內容**：以 DP AUX 為主，把 `wfgLaExcelLabels` 中 DP AUX 匯出用到的兩個欄名鍵對齊畫面表頭：`frame: 'Frame' → 'Type'`、`command: 'Command / Reply' → 'Content'`。三語系（zh-TW / zh-CN / en）同步更新（畫面表頭為固定英文 Type/Content，故三語系值一致）。對齊後 DP AUX 匯出表頭順序 = 畫面：`Time / # / Type / Content / Address / Data / Status`。i2c / i2c_eeprom 匯出表頭（欄位語意本就不同，非「畫面已改、匯出沒改」的不一致）未動；DPCD 查詢 sheet 欄名未動。匯出的資料內容、欄位對應、解碼邏輯、畫面表頭、欄寬、非 ACK 高亮均未動。

**改的是哪段 code**：`wfg.html` — `wfgLaExcelLabels()` 內 `frame`、`command` 兩鍵的值（三處語系各一，共 2 鍵）。此二鍵僅用於 `wfgLaBuildDecodeExcelXml` 第 10283 行 DP AUX 匯出表頭列 `[L.time, L.packet, L.frame, L.command, L.data, L.status]`，無其他引用。畫面 `theadHtml`、`renderRow`、CSS 欄寬、高亮邏輯完全未動。

**版本同步**：`common/version.js` `wfg: v2.97.443 → v2.97.444`；`wfg.html` 的 `version.js?v=20260712wfg443 → 20260712wfg444`。

## TCON 波形產生器 (wfg) v2.97.443 — 2026-07-12

**需求（Bruce）**：LA 分頁 AUX「解碼結果」表格，把「Command / Reply」欄的表頭文字改成「Content」。只改表頭顯示文字，欄位的內容/邏輯/欄寬策略都不動。

**改動內容**：dp_aux 解碼表頭第 4 欄 `<th>Command / Reply</th>` → `<th>Content</th>`。該欄依列型別顯示命令(REQ)/回覆(REPLY) 文字，「Content」為更精簡的中性欄名。i2c_eeprom 表（Device/Memory/R/W/Data）與其他解碼表（R/W/Value/ACK）不含此欄、語意不同，均未動。Excel 匯出欄名（`wfgLaExcelLabels` 的 `command: 'Command / Reply'`）屬另一交付管道、非畫面表頭，本次未動。

**改的是哪段 code**：`wfg.html` — dp_aux `theadHtml` 的 `<th>Command / Reply</th>`→`<th>Content</th>`（單行）。renderRow、欄寬 CSS（`wfg-la-decode-table--dp_aux`、nth-child(4) 固定寬 240px + word-break）、非 ACK 黃色高亮邏輯完全未動。

**版本同步**：`common/version.js` `wfg: v2.97.442 → v2.97.443`；`wfg.html` 的 `version.js?v=20260712wfg442 → 20260712wfg443`。

## TCON 波形產生器 (wfg) v2.97.442 — 2026-07-12

**需求（Bruce）**：LA 分頁 AUX「解碼結果」表格 UI 調整（純呈現，不動解碼數值/判定）。

**改動內容**：
1. **欄名 Frame → Type**：dp_aux 表頭第 3 欄（顯示 REQ/REPLY 徽章的封包分類欄）由 `Frame` 改為 `Type`，避免與畫面 frame 混淆。
2. **非 ACK 回覆黃色高亮**：當一列為 REPLY 且回覆狀態非 ACK（NACK/DEFER）時，Type 欄的「REPLY」徽章改黃底深字高亮，異常回覆一眼可辨；ACK 的 REPLY 維持原樣。判定用新 helper `wfgLaDpAuxIsNonAckReply(r)`：只看 REPLY 列的 `r.raw[0]` cmd nibble（沿用 `wfgLaDpAuxSourceTconText` 同一依據，0x0=ACK，其餘=非 ACK），**不重算狀態**。高亮以 class `wfg-la-type-nonack` 掛在該 cell，CSS 統一控色，不 inline 硬寫。
3. **欄寬策略**：dp_aux 表加 modifier class `wfg-la-decode-table--dp_aux`（i2c/其他解碼表不受影響）。`#`/`Time`/`Type`/`Status` 四欄 `white-space:nowrap; width:1%` 自適應內容寬不換行（Type 欄夠寬讓「Reply」不跨行）；`Command / Reply`、`Address / Data` 兩欄固定寬（240px/200px）+ `word-break` 換行，覆蓋通用 `nth-child(5)` 的 ellipsis 截斷，改為換行不撐爆表格。長 Data 只在自身欄內換行，不會撐爆 Time/# 欄。

**Command / Reply 欄名**：該欄依列型別顯示「命令」(REQ) 或「回覆」(REPLY) 文字，現有表頭已是英文 `Command / Reply`（正確代表兩種內容），維持不變。

**改的是哪段 code**：`wfg.html` — (a) dp_aux `theadHtml` 的 `<th>Frame</th>`→`<th>Type</th>`；(b) dp_aux `renderRow` 第 3 欄 `<td>` 依 `wfgLaDpAuxIsNonAckReply` 加 class；(c) 表格 `<table>` 加 `wfg-la-decode-table--' + a.type` modifier；(d) 新增 helper `wfgLaDpAuxIsNonAckReply`；(e) CSS 新增欄寬 + 黃色高亮規則。解碼/判定邏輯（含 v2.97.441 的 REQ/REPLY 判定）完全未動。

**版本同步**：`common/version.js` `wfg: v2.97.441 → v2.97.442`；`wfg.html` 的 `version.js?v=20260712wfg441 → 20260712wfg442`。

## TCON 波形產生器 (wfg) v2.97.441 — 2026-07-12

**需求（Bruce）**：LA 分頁 AUX 解碼修正 write-NACK 誤判。載入 `AUX_ST_正常版_20260709.kvdat`，#19 `8F 00 03 00 55`（Native Write 寫 0x55 到 DPCD 0xF0003）被誤標 NO REPLY；#20 `10 00`（TCON 的 write-NACK：`0x10`=Native NACK、第二 byte `0x00`=M count=已寫 0 byte）被誤判成 I2C RD 請求 + NO REPLY。

**根因（先讀再做的結論）**：分類函式 `wfgLaDpAuxIsTconReplyBytes`（wfg.html）多-byte 分支寫死 `if (status !== 0x00) return false;`，只認「0x00＝ACK+資料的讀回覆」，把「多-byte 的 NACK/DEFER 回覆（狀態碼 + M count / 資料）」全濾掉 → #20 被當成 REQ，連帶 #19、#20 都標 NO REPLY（`wfgLaMarkDpAuxCommunicationWarnings` 找不到後續 REPLY）。

**規格依據**：VESA DP 1.1a §2.4.1.2/§2.4.4.1（Linux drm_dp_helper 佐證）——AUX reply 的 ACK/NACK/DEFER 只由第一 byte 的 reply command nibble 決定：Native ACK=0x0 / NACK=0x1 / DEFER=0x2；I2C ACK=0x0 / NACK=0x4 / DEFER=0x8。後續 byte（write-NACK 的 M count、read-ACK 的資料）都只是 payload，不影響狀態、也不限制長度。但「是 REQ 還是 REPLY」不能純看第一 byte（0x10 也是合法的 I2C RD MOT=0 請求 cmd），必須靠 context（是否正在等一筆回覆 `previousRequest`）。

**改的是哪段 code**：`wfgLaDpAuxIsTconReplyBytes` 多-byte 分支拆成兩層判定——(1) 判 REPLY：`previousRequest` 存在且第一 byte 高 nibble ∈ {0x00,0x10,0x20,0x40,0x80} 即為 REPLY，**不看長度**（去掉舊 `status===0x00` 限制）；單-byte 分支維持原樣。(2) 判狀態：交由既有下游 `wfgLaDpAuxSourceTconText` 只讀第一 byte nibble → ACK/NACK/DEFER，後續 byte 當 payload（原本就已正確支援 NACK/DEFER，無需改）。

**回歸保護＋操作式驗證**：本機 http server 載入該 kvdat，以修正前(git HEAD)／修正後兩版逐列比對 426 列解碼結果 → 僅 28 列變動：14 筆 write-REQ 由 NO REPLY 轉為正常（描述不變），14 筆 `10 00` 由 REQ→REPLY 顯示「TCON NACK + 0x00」；其餘 398 列（含 #16 單-byte ACK、#18 read ACK+資料、真正的 I2C 請求）完全不變。無 console error。Chrome 實機截圖確認 #19→REQ/Native、#20→REPLY/TCON NACK。

**版本同步**：`common/version.js` `wfg: v2.97.440 → v2.97.441`；`wfg.html` 的 `version.js?v=20260711a → 20260712wfg441`（快取破解，否則徽章不跳版）。

## TCON 波形產生器 (wfg) v2.97.440 — 2026-07-11

**需求（Bruce）**：LA 分頁「檢視」group 內加兩個輸入框，**只電腦版顯示**（手機/窄螢幕不出現）：①「螢幕中心位置」——精度/格式沿用滑鼠 hover 在波形上時上方顯示的座標秒數那套；手動輸入一個時間後畫面平移，讓該時間跳到螢幕中心；平移/縮放時此框反映當下中心。②「螢幕放大倍率」——輸入倍率後縮放直接跳到該倍率；縮放時倍率框反映當下值。

**先讀再做的結論（縮放/平移模型）**：LA 檢視狀態是 `wfgLaViewStart`/`wfgLaViewEnd`（秒）；可視 span＝`viewEnd−viewStart`，全覽 span＝`wfgLaCaptureDuration()`。既有平移 = `wfgLaSetViewRange(start,end)`（內含 clamp 到 `[0, duration]`、最小 span `min(duration,5e-9)`）；既有縮放 = `wfgLaZoomAt(anchorTime,factor)`（factor<1 放大、>1 縮小，以 anchor 為錨）。游標讀數 = `wfgLaHoverTimeLabel(hover.time − triggerZero, minorStep)`，精度 = `clamp(3..9, wfgLaAxisDecimalsForStep(minorStep)+1)`，minorStep 取自 `wfgLaLastAxisInfo.minorStep`。

**對應關係（一句話）**：①中心輸入(相對 Trigger 0 秒數) → 絕對時間 = 輸入 + triggerZero，保持 span，`newStart = 絕對 − span/2`，呼叫既有 `wfgLaSetViewRange` 置中。②倍率輸入 → 倍率 = duration/span（1=全覽），clamp 到 `[1, duration/min(duration,5e-9)]`，`newSpan = duration/倍率`，以目前螢幕中心為錨呼叫既有 `wfgLaZoomAt(center, newSpan/oldSpan)`。

**改的是哪幾段 code**：
- HTML：`檢視` group（`wfgLaZoom`/`wfgLaFitAll` 那組）B# 之後新增兩個 `.wfg-la-view-io` span（`#wfg-la-view-center`、`#wfg-la-view-zoom`，Enter/change 觸發套用）。
- CSS：`.wfg-la-view-io { display:none }` 預設隱藏，`@media (min-width:901px)` 內才 `inline-flex` 顯示（比照 v2.97.411 label resizer 的 desktop-only pattern，mobile 完全不受影響）。
- JS：新增 `wfgLaApplyViewCenterInput`/`wfgLaApplyViewZoomInput`（重用既有平移/縮放，不自寫繪製）、`wfgLaUpdateViewInputs`（雙向回填，聚焦中的框不覆寫）＋格式 helper（中心值沿用游標那套精度）。`wfgLaRenderScope` 末端呼叫 `wfgLaUpdateViewInputs()`，故拖曳/滾輪/縮放/全覽/慣性任一路徑都會同步兩框。

**回歸保護**：只在 檢視 group 加兩個元件與獨立函式，不動既有 `wfgLaZoom`/`wfgLaFitAll`/`wfgLaZoomAt`/`wfgLaSetViewRange`/游標讀數；desktop-only class 確保手機版排版與行為不變。

**版本同步**：`common/version.js` `wfg: v2.97.439 → v2.97.440`；`wfg.html` 的 `version.js?v=20260710a → 20260711a`（快取破解，否則徽章不跳版）。

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
**待 Bruce 真機驗收**：5GSa@200MHz 單次觸發、觸發位置 5%，100% 應顯示 ≈23.7s；我不自行宣稱已驗（無 M16-200 硬體）。

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
**待 Bruce 真機驗收**：v429 5GSa@200MHz 單次觸發，100% 應 ≈23.7s。**我無法自跑 M16-200、也無法讀真機 IIFE 私有物件**（`window.wfgLaDebugEdges` 在此頁未定義），故此項務必由 Dispatch 真機確認；若仍不對，請按「複製 log」把 `AcqProgress final` 那行貼我，`lastRealEdgeSec` 值即可定位。

## TCON 波形產生器 (wfg) v2.97.428 — 2026-07-08

### LA 100% 秒數：真正 un-pad（改用最後真實 edge）＋ 還原 v426/v427 無效改動

**Bruce 真機截圖定調（5GSa@200MHz 單次觸發）**：100% 每次顯示「25.0s」＝頂端理論值；原廠軟體 開檔以實際 ##D transition 資料計時 ≈23.7s。問題1（讀取階段秒數）已於 v426 修好，本版不動。

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
**待 Bruce 真機驗收**：5GSa@200MHz 單次觸發，100% 應顯示 ≈23.7s（非 25.0s）。我無法自跑 M16-200，此項由 Dispatch 真機確認。

## TCON 波形產生器 (wfg) v2.97.427 — 2026-07-08

### LA 100% 秒數 vs 匯出檔：完整資料流追蹤 + 診斷對帳 log（暫不臆測修改）

- **Bruce 實測 v426 第2點仍在**，並指出正確方向：問題不在函式，而在**呼叫時機的輸入值**（100% 可能拿名目/裁切前、匯出拿裁切後實際）。
- **完整逐行追蹤結果（single-trigger，鐵律3：不確定就說不確定）**：
  - `wfgLaSafeCaptureProbe` 內：`nRepPackets`（`wfgLaWaitCaptureInfoStable` 握手後的實際提交量）→ `packetBytes = floor(nRepPackets/5)×16` → EP6 下載 `packetBytes` → `wfgLaDecodeCaptureWaveform` 得 `decoded.totalSamples`（實際 reps 總和）。
  - 裁切分支：manualStop / partialDownload(13194) / overrun(13210)。**唯一把名目值塞進 totalSamples 的是 overrun-trim（13212）** `wfgLaTrimDecodedCapture(decoded, expectedDuration, sampleCfg.limitSamples)` → `totalSamples = limitSamples`(名目)。
  - `wfgLaApplyCapturedWaveform(decoded)`（13216）令 `wfgLaCapturedWaveform = decoded`（**同一物件**）。
  - 100% finalSec（13246-13249）讀 `wfgLaExportTotalSamples(wfgLaCapturedWaveform, ...)`；匯出 `wfgLaExportKvdat` 也讀 `wfgLaCapturedWaveform`。**兩者讀同一個裁切後物件** → 靜態分析下 100% 顯示的 `totalSamples/rate` 與寫進 kvdat header 的完全相同。
  - **結論**：v426 的 100% **已經**用裁切後、與 header 同源的值，Bruce 假設的「100% 用名目 / 匯出用實際」分岔**在現行 code 不存在**。我無法在程式層重現 100%≠匯出檔。
- **剩餘兩個候選（需硬體 log 才能定案）**：(a) runtime 值分岔（擷取完成到按匯出之間 `wfgLaCapturedWaveform` 被改）；(b) 原廠軟體「檔案時間」的定義＝header `totalSamples`（則 v426 已相符）還是**最後一個真實 transition**（則會比 header 短 → 100% 看起來偏長，需改成顯示 lastEdge）。
- **本版做法（不臆測亂改，先取證）**：加**診斷對帳 log**。100% 完成時印出 `AcqProgress 100% breakdown`：`rawDecodedTotal`(裁切前) / `trimmedTotal`(=header=100%用) / `lastRealEdge`(最後真實 transition) 三個樣本數與各自時間、`decoded.durationSec`、`partialDownload`、`★100%顯示`。並存裁切前 `decoded.__rawTotalSamples`。
- **請 Bruce 提供硬體數字（明講：我無法自跑 M16-200）**：跑一次單次觸發 → 按「複製 log」把 `AcqProgress 100% breakdown` 那行貼給我 → 再匯出該檔用 原廠軟體 開，記下顯示時間。比對 原廠軟體 時間＝三個候選(trimmedTotal / lastRealEdge / rawDecoded)哪一個，即可一刀定位並套正確修法（若＝lastRealEdge，就把 100% 與 header 都改用 lastEdge）。
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
- **問題2 修法（讀 code + 建構保證，鐵律3：不確定就說不確定）**：抽出**匯出檔時長唯一真值函式** `wfgLaExportedDurationSec()`／`wfgLaExportSampleRate()`／`wfgLaExportTotalSamples()`，`wfgLaExportKvdat`（寫 kvdat header）與進度條 100% `finalSec` **共用同一份計算**（含 `maxRaw+1` 成長與 `round(effectiveRate)` 取整），由建構保證「100% 秒數 === 匯出檔在 原廠軟體 開檔顯示時間」逐位元一致。
  - **誠實聲明（鐵律3）**：純讀 code 追蹤，v425 的 `totalSamples/effRate` 在我能靜態分析的每個分支其實已等於匯出值（partialDownload 也不例外），我**無法在程式碼層重現 100%≠匯出檔的分歧**；此版把兩者統一到同一函式以徹底消除任何殘餘分歧（例如 `maxRaw+1`／取整）並防止未來 drift。**若 5GSa@200MHz 硬體實跑仍有差**，請提供「100% 顯示秒數」與「該檔在 原廠軟體 的顯示時間」兩個實際數字，我才能定位真正的硬體側差異——因為我無法自己跑 M16-200。
- **匯出不變**：`wfgLaExportKvdat` 改走 helper 後計算結果與舊版**逐位元相同**，不影響 kvdat/原廠軟體 相容（`durationSec` 區域變數為未使用的殘留，改動零影響）。
- **進版**：`v2.97.425 → v2.97.426`；cache-buster version.js `?v=20260707c → 20260708a`。
- **驗證**：(a) Chrome MCP no-store fetch 確認 live origin＝v2.97.426；(b) DOM 模擬呼叫下載迴圈 render path 確認「讀取波形資料」pct 帶秒數；(c) `wfgLaExportedDurationSec` 與匯出 header 同源（同一函式）。**硬體實跑（5GSa@200MHz 單次觸發看 100% vs 匯出檔）需 Bruce 實測**，我無法自跑 M16-200。

## TCON 波形產生器 (wfg) v2.97.425 — 2026-07-07

### LA 單次觸發進度條秒數：兩處修正（100% 名目值 → 匯出檔實際值；97~99% 秒數消失）

- **Bruce 實測回報兩個 bug**（5GSa 深度 + 200MHz 取樣率）：
  1. **100% 秒數顯示錯**：進度條 100% 顯示 **25s**（名目：5e9÷200e6），但匯出檔實際約 **23.7s**（硬體實際 decode 樣本約 4.74G÷200MHz）。
  2. **97~99% 秒數消失**：擷取到 97~99% 這段秒數不見。
- **問題1 根因（讀 code）**：匯出檔 `wfgLaExportKvdat` 的 header（第 23458 行）寫的是 `decoded.totalSamples ÷ effectiveRate`（實際解出樣本數；partialDownload 時為實際下載到的樣本），原廠軟體 開檔時長即以此計。而 v424 進度條 100% 誤用 `wfgLaCaptureDuration()` ＝ `decoded.durationSec`——該值在 partialDownload 分支（第 13176/13181 行）被覆寫成**名目** `expectedDuration`（= `limitSamples ÷ effRate`，5GSa@200MHz = 25s），與匯出檔用的 `totalSamples` **不同源** → 顯示 25s 名目、匯出 23.7s 實際。
  - **修法**：100% 秒數改用 `decoded.totalSamples ÷ effectiveRate`（`wfgLaCapturedWaveform.totalSamples / sampleCfg.effectiveRate`），與 kvdat header 完全同一算式，保證進度條 100% 秒數＝匯出檔實際時長。**未寫死任何秒數**，一律由實際擷取結果推。log 加印 `totalSamples / effRate / actualSec / nominal captureDuration / partialDownload / shown`，供實機確認根因與對帳。
- **問題2 根因（讀 code）**：讀取(EP6 下載)階段那個 `wfgLaSetAcqProgress(97, '讀取波形資料', ...)` 呼叫**沒帶第 4 參數 seconds**，seconds=undefined → 括號整段不顯示，直到 100% 才回來（no-trigger 完成的 100% active 那一刻同樣沒帶，會閃一下空白）。
  - **修法**：讀取階段補帶延續估計 `0.97 × 已選窗`（此時 decode 未完成、實際樣本未知，延續進行中估計，100% 後立即被實際值覆寫）；no-trigger 完成的 100% active 也補帶 `cfg.durationSec` 估計。0%→100% 全程秒數不中斷。
- **不變**：擷取/觸發/decode/匯出邏輯、進度百分比計算皆不動；進行中(0~96%)估計沿用 `進度% × 已選窗`（前置停等＝前置量），只有**最終 100% 換成匯出同源實際值**。
- **進版**：`v2.97.424 → v2.97.425`；cache-buster version.js `?v=20260707b → 20260707c`。
- **驗證**：待 5GSa@200MHz M16-200 硬體實跑單次觸發——(a) 97~99% 秒數不消失、(b) 100% 秒數 ≈ 23.7s（實際非名目 25s）、(c) 匯出該檔比對時長＝100% 顯示秒數。附截圖＋log（`AcqProgress final: totalSamples=… actualSec=…`）實測數據。

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
- **驗證**：待 M16-200 硬體實跑單次觸發——前置停等秒數＝前置量、觸發後遞增、100% 秒數；匯出該檔確認檔案時長＝進度條 100% 秒數一致（三者對帳）。附截圖＋log 實測數據。

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

### LA 通道欄改為原廠 原廠軟體 樣式：跨列高彩色色塊＋內嵌原始通道號

- **需求（Bruce）**：LA 通道卡左側原本是「≡ 拖曳把手 + 小色塊 + 可編輯通道名 + A/B 觸發鈕」，小色塊與通道號沒整合，使用者改了通道名後就看不出原本是第幾通道。改成與原廠 原廠軟體 一致——一整條、跨整列高的彩色色塊，把通道原始索引號(0~15)嵌在色塊左下角。
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

- **症狀（Bruce 回報）**：匯入 EM02_E512.kvset 後通道順序與原廠 原廠軟體 不一致，ch1 位置跑錯。
- **三方交叉比對（實測，眼見為憑）**：
  - 檔案 `chnShowIndex = 0,2,3,4,5,6,7,1,8,…`；`chnShowName{i}` 照通道編號編（name0=ch0、name7=ch7）。
  - 原廠 原廠軟體 開 EM02_E512.kvset **實際畫面** = `0,7,1,2,3,4,5,6,8,…`（ch7 第2位、ch1 第3位）— 已自驅開檔截圖坐實。
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

- **需求**：除 `.kvdat`（設定+波形）外，支援原廠 原廠軟體 的 `.kvset`（純設定、無波形二進位）匯入/匯出。對齊基準＝原廠 `EM02_E512.kvset`（3246 bytes 純 XML）。
- **匯入**：檔案選擇器 `accept=".kvdat,.kvset"`，新分派 `wfgLaImportKvFile` 依副檔名路由：
  - `.kvset` → `wfgLaImportKvsetFile`：讀純文字 → 既有 `wfgLaParseSettingsXml` → `wfgLaApplyParsedSettings`（套用 model / 深度 / rate / 觸發 / 門檻 / 致能 / 通道名 chnShowName / analyzer），額外套用 `chnShowIndex` 顯示順序。無法對應欄位忽略不報錯。
  - `.kvdat` → 沿用原 `wfgLaImportKvdat`（行為完全不變）。
- **匯出**：工具列匯出鈕改「格式下拉」（`.kvdat` 完整資料 / `.kvset` 僅設定），`wfgLaExportFile` 分派。`wfgLaExportKvset` 從當前 UI 設定產出 settings XML（不含波形，尚無擷取資料也可匯出）。
- **對齊規則單一來源（重點）**：抽出共用 `wfgLaBuildSettingsXml` + `wfgLaBuildAnalyzerLines`，kvdat header 與 kvset 共用同一份 XML 產生器；深度 `smpDepth/smpDepthIndex` 用 `kvdatDepthFields`、rate 用 `smpFrequ/kvdatSampleRateIndex`，完全沿用 v416 已對齊的板載規則（1G=1,000,000/idx11、2G/12、5G=5,000,000/idx13、10G 固定 5,539,071/idx8），未另立第二套。
- **kvdat 不退化（鐵律 1，離線坐實）**：refactor 後 kvdat 的 XML header 與 v416 舊版**逐位元相同** — node 離線比對三情境（EM02-like 5G / 預設名稱+10G 串流 / 含 I2C+DP analyzer）皆 IDENTICAL；`##D` edge 二進位區塊、header totalSamples/freq/trigger 全部不動。
- **進版**：version.js `wfg: v2.97.416 → v2.97.417`；cache-buster version.js `?v=20260703c → 20260704a`、i18n.js `?v=20260521b → 20260704a`。
- **驗證**：node 語法檢查 + kvdat header 位元一致；線上 Chrome 匯入 `EM02_E512.kvset` 讀 DOM（深度 5G / rate 200MHz / 觸發 ch3 / 門檻 1.25V / 通道名）；網頁匯出 `.kvset` 以原廠 原廠軟體 實開比對；kvdat 匯出回歸。

## TCON 波形產生器 (wfg) v2.97.416 — 2026-07-03

### kvdat 深度欄位改「板載固定常數」規則，幹掉 v415 猜測的 idx=14（兩顆原廠 10G 坐實）

- **關鍵新事證（Bruce 加錄第 2 顆原廠 10G）**：`ORI_10GSa`(totalSamples=6.19G) 與 `ORI_10GSa_02`(totalSamples=5.898G) 兩顆 XML 設定區**位元完全相同**，皆 `smpDepth=5,539,071`、`smpDepthIndex=8`，與各自實際 totalSamples 無關 → 坐實原廠對「超板載串流深度(10G)」寫**固定常數**（5,539,071 kSa＝M16-200 板載 128MiB 有效深度、idx=8），非環境相依、非猜測。
- **修正 v415 的錯誤**：v415 把 10G 的 `smpDepthIndex` 由 11/12/13 外推成 **14**，無任何原廠依據（違反「沒查到不准猜」）。本版一律改為原廠實測 **8**，`smpDepth` 改為原廠固定 **5,539,071**。
- **新規則（`kvdatDepthFields`，全部有原廠依據）**：`smpDepth(kSa)=min(選定深度/1000, 5,539,071)`；`smpDepthIndex`＝深度下拉 option 位置（1G=11/2G=12/5G=13，三錨點實測吻合），但超板載(>5.539G，下拉僅 10G)固定寫 8。
- **雙向一致坐實（五顆原廠檔 code 模擬）**：匯入(ceil totalSamples 設深度下拉)→匯出，`smpDepth/smpDepthIndex` 與原廠**全部位元一致**（含兩顆 10G→5539071/8）；rate `smpFrequ=200000/idx=0` 一致。加上 edge round-trip 位元零損失 → 「原廠→網頁→原廠」整檔位元一致。
- **匯入深度顯示**：仍為 `ceil(totalSamples)` 到下拉 bucket（原廠軟體 一致；ORI_10GSa idx=8 卻顯示 10G 已實開坐實：原廠軟體 顯示只看 totalSamples、不看 idx）。
- **未竟（需硬體一次讀數，未存檔）**：網頁自錄各深度的實際 totalSamples 是否超過 nominal（超錄）→ 影響「網頁自錄→原廠開」的顯示 depth bucket。已從 code 確認送硬體上限 `limitSamples=cfg.sampleDepth`（各深度 mapping 正確、無錯位）；實際超錄量屬硬體回吐行為，待接著硬體觸發一次讀 `decodedSamples` 坐實後再修（零資料損失前提）。
- **進版**：version.js `wfg: v2.97.415 → v2.97.416`；cache-buster `?v=20260703b → 20260703c`。

## TCON 波形產生器 (wfg) v2.97.415 — 2026-07-03

### kvdat 匯出/匯入取樣深度對齊原廠 原廠軟體（逆向四顆 ORI 原生檔坐實）

- **逆向依據（四顆 ORI 原廠原生檔逐位元 dump，非推測）**：
  - `smpDepth`(XML) 單位=kSa，寫「選定深度 nominal」非實際 totalSamples（5G 檔 totalSamples 已截斷成 4,999,999,846，XML 仍寫 nominal `smpDepth=5000000`）。
  - `smpDepthIndex` = LA 深度下拉 `#wfg-la-depth` 的 option 位置（Chrome 實讀確認：位置 11=1G、12=2G、13=5G、14=10G，與原廠 1G/2G/5G 檔的 index 11/12/13 完全吻合）。
  - 原廠軟體 深度顯示 = 實際 `totalSamples` 無條件進位到最小容納 bucket，**與 smpDepthIndex 無關**（原廠 10G 串流檔 index=8 卻仍顯示 10G 為鐵證）。
- **修正的兩個缺陷（可指證）**：
  - 匯入（`wfgLaApplyParsedKvdatCapture`）：舊碼用 `smpDepth×1000` 對深度下拉精確比對，10G 原廠檔 `smpDepth×1000=5,539,071,000` 下拉無此值→比對失敗→深度停在預設。改為 `wfgLaDepthBucketForSamples(totalSamples)`（ceil-to-bucket，比照 原廠軟體）。
  - 匯出（`wfgLaExportKvdat`）：舊 `kvdatSampleDepthIndex` 用錯誤 9 元素 preset 表，index 幾乎全錯；且 `smpDepth` 用實際 totalSamples/1000 非 nominal。改為以「選定深度 nominal」(`cfg.sampleDepth`) 寫 `smpDepth`，`smpDepthIndex` 取自下拉 option 位置陣列 `WFG_KVDAT_DEPTH_OPTS`。
- **零資料損失（Bruce 鐵律，程式坐實）**：四顆 ORI round-trip（含 10G 的 6.19e9 大數）重建的 `##D` edge 區塊位元與原廠**完全相同**（numeric round-trip 精確、末筆=total、無失精）；本版只改 XML 深度兩欄與匯入深度顯示，`##D` 區塊建構、edge 編碼、header totalSamples/freq/trigger 全部不動。
- **串流大深度(10G) XML 位元一致**：不追求（Dispatch 判斷採 A）。原廠 `smpDepth=5539071/idx8` 為擷取當下 PC RAM 相依、對顯示無影響；本版 10G 匯出寫 nominal `10000000/idx14`，原廠軟體 開啟仍顯示 10G。
- **進版**：version.js `wfg: v2.97.414 → v2.97.415`；wfg.html version.js 查詢字串 `?v=20260703 → ?v=20260703b`（破快取讀新版號 badge）。
- **驗證**：離線 round-trip 位元零損失（四顆）；Chrome 線上實測匯入四顆 ORI 讀 DOM 深度=1G/2G/5G/10G；原廠軟體 實開網頁匯出各深度檔截圖深度與原生一致。

## TCON 波形產生器 (wfg) v2.97.414 — 2026-07-03

### 修正 kvdat 匯出 header「通道數」寫死 16 的回歸 → 恢復 原廠軟體 相容

- **情境（Bruce 回報）**：LA 匯出的 `.kvdat` 檔在 原廠軟體 打不開。經 git 考古＋Node 實測確認為回歸，資料本身無缺損（非截斷）。
- **根因（可指證 diff，commit `9d37497` 2026-05-08「Improve LA kvdat compatibility」）**：該 commit 把 40-byte header offset 32 的「區塊/通道數」欄位由 `kvdatWriteU64LE(header, 32, selected.length)` 改成寫死 `kvdatWriteU64LE(header, 32, 16)`。但實際資料區塊仍只寫「啟用/勾選的 N 個通道」（`selected.forEach` 每通道一個 `##D` 區塊）。當選取通道數 N < 16 時，header 宣稱 16、實際只有 N 個區塊 → 原廠軟體 依 header 讀第 N+1 個區塊時走過 EOF → 開檔失敗。
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
- **驗證**：見實機驗證章節（Chrome Cowork3 + M16-200）。

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
- **🔴 待 Bruce 實機驗證**：換深度後第一次 RUN 的真實時長/內容（原始條件：100MSa/200MHz 重複 → 5GSa/200MHz 單次；以及反向 5GSa→100MSa）。本機無 M16-200 USB 裝置，硬體端「自動重抓後是否第一次就正確」需實機確認，未自稱已驗。

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
