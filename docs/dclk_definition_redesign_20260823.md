# wfg DCLK 定義重整 — 現況調查與方案（2026-08-23）

狀態：**調查＋提案，未動任何產品程式碼。** 待 Bruce 裁示後才實作。
起因：Bruce 2026-08-23 指出 EM01 與 EM02/E512 的 TCON UI 上「DCLK」定義不同，
而 wfg 的 Frame 參數卡片沒有考慮這件事。

---

## 0. 一句話結論

> wfg 目前那個叫做 **「TCON DCLK」** 的輸入欄，實際餵給波形區、語意上是 **TX DCLK**（＝ TCON 側 Pixel Rate ÷ 2）。
> 名字裡的「TCON」讓使用者以為要填 TCON UI 上看到的那個數字 ——
> 在 **EM02／E512** 上那個數字是 **Pixel Rate 本身（1:1）**，填進去就**差兩倍**。
> 這是數值正確性問題，不只是命名問題。

Bruce 的佐證已在程式碼層確認（`wfg.html:2940` 預設值、`wfg.html:25194`）：

```
HTOTAL 2200 × VTOTAL 1125 × 60 Hz = 148.5 MHz   ← Pixel Rate（目前 UI 上沒有這個數字）
wfgCalcRxDclk() = 2200×1125×60/2/1e6 = 74.25    ← RX DCLK 欄位顯示 74.25 ✅
wfgFrame.dclk 預設 = 74.25                       ← 欄位標題卻是「TCON DCLK」 ❌
```

線上版（`fa305e3` ＝ v4.5.3）逐字確認同一段 HTML 仍是 `<label>TCON DCLK …`，
所以這不是本機未 push 的狀態差異。

---

## 1. 現況（逐項附檔案行號，非推測）

### 1.1 三大類 vs 現況對照

| Bruce 定義的類別 | 定義式 | wfg 現況 |
|---|---|---|
| **① Pixel Rate** | H-Total × V-Total × Frame Rate | **UI 上完全不存在**。只以 `/2` 的形式隱含在 `wfgCalcRxDclk()` 裡 |
| **② 波形區 RX DCLK ／ TX DCLK** | Pixel Rate ÷ 2 | RX＝`wfg-rx-dclk` 欄位＋波形列 `RX DCLK`（名稱正確）；TX＝`wfg-dclk` 欄位＋波形列 **`TCON DCLK`**（名稱錯誤） |
| **③ TCON UI 的 DCLK** | EM01 系列＋所有 NB ＝ Pixel Rate ÷ 2；EM02／E512 ＝ Pixel Rate（1:1） | **完全沒有實作**，也沒有任何地方標示目前是哪一顆 TCON |

### 1.2 「1:2 關係」在程式裡是自洽的（重要，這條決定方案能不能只做顯示層）

`wfgUpdateTconHtotal()`（`wfg.html:25205-25217`）：

```
tconHtotal = round(htotalBase × dclk / rxDclk)
```

把它代回去：

```
TCON 側 Pixel Rate ÷ 2 = tconHtotal × vtotal × fps / 2
                       = (htotalBase × dclk / rxDclk) × vtotal × fps / 2
                       = rxDclk × dclk / rxDclk
                       = dclk                                   ← 就是 wfg-dclk 這一格
```

實際代內建 preset 的數字驗算（`wfg.html:2819`：htotalBase 2080 / vtotal 1112 / 60 Hz / dclk 89）：

```
rxDclk     = 2080×1112×60/2/1e6 = 69.3888
tconHtotal = round(2080 × 89 / 69.3888) = 2668
TCON 側 Pixel Rate ÷ 2 = 2668×1112×60/2/1e6 = 89.004…  ≈ 89 ✅（差值來自 tconHtotal 的 round）
```

**⇒ `wfgFrame.dclk` 精確地就是「TX DCLK」，＝ TCON 側 Pixel Rate ÷ 2。**
Bruce 說的「波形區不管 RX 還是 TX，跟 Pixel Rate 都是 1:2」在程式裡逐項成立 ——
只是各自對應自己那一側的 Pixel Rate（RX 側用 `htotalBase`，TX 側用 `tconHtotal`）。

這一條讓方案有一個很重要的性質：**類別③ 可以純粹做成顯示／換算層，不需要動任何波形計算。**

### 1.3 `wfg-dclk` / `wfg-rx-dclk` 實際餵給誰

| 元素 | 變數 | 下游 |
|---|---|---|
| `wfg-dclk`（輸入，`wfg.html:1412`） | `wfgFrame.dclk` | `wfgUpdateTconHtotal()` → `wfgFrame.htotal` → **整張波形的時間軸**；波形區「TCON DCLK」列的週期（`wfg.html:23440`）；`wfgRecalcHtotal()`；游標時基 |
| `wfg-rx-dclk`（唯讀，`wfg.html:1416`） | `wfgFrame.rxDclk`（`wfgCalcRxDclk()` 算出） | RX DE 寬度、RX DCLK 列週期、TCON DCLK 下限夾值（`wfgClampTconDclk()`） |
| 定頻／變頻 radio（`wfg.html:1403-1404`） | `wfgFrame.dclkMode` | 定頻：`dclk` 可輸入且夾 ≥ `rxDclk`；變頻：`dclk` 恆等於 `rxDclk` 且唯讀 |

### 1.4 波形區的通道名稱在哪裡定義

**全部是硬編字串，不走 i18n**：

| 位置 | 內容 |
|---|---|
| `wfg.html:23442-23447` | `_irLabels` 陣列：`RX DCLK(xx ns)` / `RX DE` / **`TCON DCLK(xx ns)`** / `TX DE` / `R_PH_CNT` / `F_PH_CNT` |
| `wfg.html:5580` | `WFG_INTERNAL_ROWS = 6` 的註解 |
| `wfg.html:5591` | 群組定義註解 `RX DCLK(0)+RX DE(1), TCON DCLK(2)+TX DE(3)` |
| `wfg.html:5597` | `_wfgPromotedTcon`（group 1 ＝ TCON DCLK + TX DE） |
| `wfg.html:28966` | hover 量測用 `deName = 'RX DE' / 'TX DE'`（這兩個名字是對的，不動） |

**這些名稱不會被寫進任何匯出檔**（設定檔匯出的是 `frame.dclk` 這種鍵名，不是畫面標籤），
所以改名不會破壞既有設定檔 —— 詳見 §3.5。

### 1.5 匯入 code 的提醒視窗填的是哪一個量

`wfg.html:2124-2141`（v4.3.0～v4.6.0 那張 ack 卡片）：

- 項目 1 標題：`TCON DCLK 必須手動設定`（i18n `wfg.ackDclkName`）
- 位置提示：`位置：左側「Frame 參數」卡片 → TCON DCLK`（`wfg.ackDclkWhere`）
- 輸入框 `wfg-ack-dclk-in` → `wfgAckCommit('dclk')` → **直接寫進 `wfgFrame.dclk`**

**⇒ 這張卡片問的是 TX DCLK，但字面上叫「TCON DCLK」，而且它出現的時機正好是
「使用者剛從某顆 TCON 的 UI／code 過來」—— 這是誤填最容易發生的那一刻。**

### 1.6 Code Group 的 TCON 選擇是什麼機制

| 項目 | 現況 |
|---|---|
| DOM | `<select id="wfg-code-tcon">`（`wfg.html:1654`），選項由 `wfgCodeInitUi()`（`wfg.html:34284`）從表生成 |
| 資料來源 | `WFG_TCON_CODECS`（`wfg.html:34228-34250`）—— **UI 完全不認識任何型號** |
| 選項 | `em02`／`e512`／`em01 *`／`e503 *`／`e501 *`／`en01 *`（`*` ＝ 尚無 parser） |
| 目前值 | 模組層變數 `var wfgCodeTcon = 'em02'`（`wfg.html:34251`） |
| 既有欄位 | `label` / `tconClass`（MNT/NB）/ `importExts` / `exportFormat` / `parseCode` / `buildExport` |
| 既有連動 | **單向、且只在匯入成功時**：`wfgCodeApplyToWfg()` → `wfgSetTconType(codec.tconClass)`（`wfg.html:35391-35393`） |
| **持久化** | 🔴 **完全沒有**。`wfgCodeTcon` 不在 `wfgFrame` 裡、不在 `wfgExportConfig()` 裡、不在 autosave 裡 → **重整網頁就跳回 `em02`** |

🔴 附帶發現（既有小 bug，非本輪造成）：**在下拉選單改型號不會同步「數位信號」卡片的 MNT/NB 型態**——
只有「匯入成功」那條路徑才會呼叫 `wfgSetTconType()`。
所以「選 E503（NB）→ 還沒匯入就先編輯」的狀態下，位元寬仍停在 MNT 的 9 bit。

### 1.7 旁證：rxtx 分頁**早就**用了正確的三分法（命名可以直接沿用）

`rxtx.html:296-330` 的欄位名稱：

```
Pixel Rate        ← 類別①，名稱一字不差
FPGA UI DCLK      ← FPGA 側的 UI 數值
TCON UI DCLK      ← 類別③，名稱一字不差
```

且 `rxtx.html:308` 的提示寫著 `FPGA UI DCLK = TCON UI DCLK ÷ 2`。

**⇒ 「Pixel Rate」與「TCON UI DCLK」兩個詞在本工具箱裡已經是既有用語，wfg 直接沿用即可，不必另創名詞。**
（⚠ rxtx 的 `tcon_dclk = fpga_dclk × 2` 是 LVDS 端的關係、與 port 數有關，語意脈絡與 wfg 不同，
本輪不動 rxtx，只借用它的**名詞**。）

---

## 2. 命名／數值不一致盤點

| # | 檔案:行 | 目前叫什麼 | 實際是哪一大類 | 處置 |
|---|---|---|---|---|
| 1 | `wfg.html:1411` | 輸入欄 label `TCON DCLK` | ② TX DCLK | **改名 `TX DCLK`** |
| 2 | `wfg.html:23444` | 波形區列名 `TCON DCLK(xx ns)` | ② TX DCLK | **改名 `TX DCLK(xx ns)`**（Bruce 明示） |
| 3 | `wfg.html:1415` | `RX DCLK` | ② RX DCLK | 正確，不動 |
| 4 | `wfg.html:23443/23445` | `RX DE` / `TX DE` | — | 正確，不動（Bruce 明示 TX DE 維持） |
| 5 | `wfg.html:1369` | `HTOTAL` / `TCON HTOTAL` 唯讀值 | — | 正確，不動 |
| 6 | — | **Pixel Rate** | ① | **新增唯讀顯示**（目前 UI 上不存在） |
| 7 | — | **TCON UI DCLK** | ③ | **新增**（目前完全不存在） |
| 8 | i18n `wfg.ackDclkName` | `TCON DCLK 必須手動設定` | ② | 改名＋三語同步 |
| 9 | i18n `wfg.ackDclkWhere` | `…卡片 → TCON DCLK` | ② | 改名＋三語同步 |
| 10 | i18n `wfg.ackErrDclkMin` | `TCON DCLK 不可低於 RX DCLK` | ② | 改名＋三語同步 |
| 11 | i18n `wfg.spotDclk` | `這裡就是 TCON DCLK…` | ② | 改名＋三語同步 |
| 12 | i18n `wfg.ackDclkVarMode` | `變頻應用：TCON DCLK 自動等於 RX DCLK` | ② | 改名＋三語同步 |
| 13 | `wfg.html` 註解 ×27 處 | 註解裡的 `TCON DCLK`（31 筆總數扣掉 #1/#2/#8/#9 那 4 行實際 UI 字串） | ② | 一併改（不影響行為，但留著會誤導下一個人） |
| 14 | `wfg-guide.html` ×11 處 | 說明頁 | ② | 一併改（說明頁不納入版號機制） |
| 15 | `wfg.html:34251` | `wfgCodeTcon` 不持久化 | — | 併入 `wfgFrame`（見 §3） |
| 16 | `wfg.html:34298` | 改下拉不同步 MNT/NB | — | 順手修（既有 bug） |

**i18n 統計**：`common/i18n.js` 中含 `TCON DCLK` 的 wfg 鍵共 5 個（16 行，含三語）。
`rxtx.modeB`（`給定 TCON DCLK`）屬 rxtx 分頁、語意不同，**不動**。

---

## 3. 方案

### 3.1 總則（一句話）

> **「存的東西」不變（永遠存 TX DCLK），只增加一層「TCON UI ↔ TX」的雙向換算與顯示。**

這樣可以同時滿足三件事：

1. 波形計算路徑一行不改 → **不會有波形回歸風險**；
2. 既有 autosave／匯出檔的 `frame.dclk` 語意不變 → **零遷移**；
3. 使用者可以直接把 TCON UI 上看到的數字填進來 → **Bruce 的原始痛點被解掉**。

### 3.2 D-Clock 群組改版後長相

```
┌ D-Clock (MHz) ────────────────────────────────┐
│  ○ 定頻應用   ● 變頻應用                        │   ← 不動
│  ┌ Pixel Rate ─────┐ ┌ RX DCLK ──────┐         │
│  │   148.5  (唯讀)  │ │  74.25 (唯讀) │         │   ← Pixel Rate 為新增
│  └─────────────────┘ └───────────────┘         │
│  ┌ TX DCLK ────────┐ ┌ TCON UI DCLK [EM02 ▾]┐ │
│  │  [ 74.25 ]      │ │  [ 148.5 ]           │ │   ← 兩格互為換算，都可輸入
│  └─────────────────┘ └──────────────────────┘ │
└───────────────────────────────────────────────┘
```

- `Pixel Rate` ＝ `HTOTAL × VTOTAL × FrameRate`（RX 側）＝ `RX DCLK × 2`，唯讀。
- `TX DCLK` ＝ 目前的 `wfg-dclk`，**行為、夾值、定頻/變頻規則一字不改**。
- `TCON UI DCLK` ＝ `TX DCLK × uiDclkRatio`，**可輸入**；填了就反算 `TX DCLK = 值 ÷ ratio`，
  再走**既有的** `wfgOnDclkManualChange()`（不另開計算路徑，沿用唯一收斂點）。
- 機種下拉就嵌在 `TCON UI DCLK` 的 label 裡 —— 讓「這個數字依機種而異」在視覺上無法被忽略。
- 變頻應用時 `TX DCLK` 唯讀 → `TCON UI DCLK` 同步唯讀（維持既有語意，不製造第二條寫入路徑）。

### 3.3 換算係數放哪裡：`WFG_TCON_CODECS` 加一欄

沿用 `tconClass` 已經建立的模式 —— **型號的屬性一律查表，不用字串前綴推導**（`wfg.html:34222` 已明文）：

```js
em01: { label:'EM01', tconClass:'MNT', uiDclkRatio: 1, … }   // UI DCLK = Pixel Rate ÷ 2 = TX DCLK
em02: { label:'EM02', tconClass:'MNT', uiDclkRatio: 2, … }   // UI DCLK = Pixel Rate      = TX × 2
e512: { label:'E512', tconClass:'MNT', uiDclkRatio: 2, … }   // 與 EM02 同系列（Bruce 補充：E512 在前，EM02 是它的改版）
e501: { label:'E501', tconClass:'NB',  uiDclkRatio: 1, … }
e503: { label:'E503', tconClass:'NB',  uiDclkRatio: 1, … }
en01: { label:'EN01', tconClass:'NB',  uiDclkRatio: 1, … }
```

定義：**`TCON UI DCLK = TX DCLK × uiDclkRatio`**。
新增型號時填一格即可，UI 一行都不用改 —— 與這張表原本的設計意圖一致。

### 3.4 Bruce 的三個待議點：明確建議

#### Q1. Default 設定選用的 TCON 是什麼？

**建議：維持 `em02`（＝現行預設），不改成 EM01。**

Bruce 傾向 EM01 的理由是「跟 TX DCLK 關係一致」（ratio = 1，不會有隱形的 ÷2）。
這個顧慮在本方案下**不成立**，理由有二：

1. **本方案沒有任何隱形換算**。驅動波形的永遠是 `TX DCLK` 那一格，它的值與行為與今天**完全相同**；
   `uiDclkRatio` 只作用在新增的 `TCON UI DCLK` 那一格上，而那一格的 label 旁邊就寫著機種。
   換機種**不會改變任何既有數值或波形**，只會改變 `TCON UI DCLK` 這個新顯示值。
2. **改成 `em01` 有一個實質代價**：`em01` 的 `parseCode` 是 `null`（`wfg.html:34242`），
   選單上顯示 `EM01 *`。把它設成預設 ⇒ **開頁後按 Code 匯入的預設對象是一個「尚未支援」的型號**，
   使用者每次都得先改下拉才能匯入 EM02 的 bin。這是把一個新的每日摩擦點裝進最常走的路徑。

> 🔴 **若 Bruce 仍要 EM01 當預設**：那就必須拆成兩個獨立選擇（「Code 匯入型號」維持 em02、
> 「DCLK 換算機種」預設 em01），代價是兩者可以不一致 ⇒ 要定義誰贏、要處理不一致的顯示，
> 且與 Q3 的「雙向綁定」直接衝突。我不建議，但可以做 —— 請裁示。

#### Q2. 要不要有 TCON 選擇的選項？

**建議：要，但不新增第二個選單。** 直接把 Code group 現有的 `#wfg-code-tcon` 升格為
「這張波形代表哪一顆 TCON」的**全域單一來源**，並在 D-Clock 群組放一個**鏡射**的下拉。

理由：

- 語意上本來就是同一件事 —— 「我現在在模擬／匯入哪一顆 TCON」。
- 這張表已經在扮演這個角色：`tconClass` 決定 ACT_TYPE/R_PH/F_PH 位元寬，早就不只是「匯入格式」。
- 兩個獨立選單必然產生「兩者不一致」的狀態，而那個狀態沒有正確答案，只能靠規則硬掰。

#### Q3. 要不要與 Code Group 的 TCON 選擇雙向綁定？

**建議：要 —— 而且用「同一個變數的兩個視圖」來實現，而不是「兩份狀態互相同步」。**

「互相同步」是要靠列舉所有寫入路徑來維持的，列舉必漏（這一點在 `wfgAckStartNowWatch()` 的
註解裡已經踩過一次、也已經被寫成守則）。單一變數則從結構上不可能不一致：

```
wfgFrame.codeTcon   ← 單一真值
   ├─ #wfg-code-tcon  (Code group 的下拉)      … onchange → 寫入，並刷新另一個
   └─ #wfg-ui-tcon    (D-Clock 群組的鏡射下拉)  … onchange → 寫入，並刷新另一個
```

順帶把 §1.6 的既有 bug 一併修掉：**改下拉時也呼叫 `wfgSetTconType(codec.tconClass)`**，
不再只有匯入成功時才同步 MNT/NB。
（⚠ 這一項會改變既有輸出：「選 NB → 不匯入直接編輯」時 R_PH/ACT_TYPE 上限會從 511 變 63，
超限值會被夾。屬 R1「修 bug 但輸出會變」→ CHANGELOG 要標 `⚠ 輸出變更`。**這一項也可以獨立拆出來，請 Bruce 決定要不要併進本次。**）

### 3.5 相容性

| 項目 | 影響 | 處置 |
|---|---|---|
| `frame.dclk`（匯出／autosave） | **零影響** —— 語意、數值、鍵名全部不變 | 不動 |
| `frame.dclkMode` / `frame.dclkFixed` | 零影響 | 不動 |
| 舊設定檔匯入新版 | 沒有 `codeTcon` 欄位 | 退回 `'em02'`（＝現行行為） |
| 新設定檔給舊版讀 | 多一個 `frame.codeTcon` | 舊版忽略未知欄位，**可正常開啟**（與 v3.9.0 `ovlId`、v3.27.0 `frameRateMax` 同一套做法） |
| 匯出欄位名稱 | 🔴 專案有「畫面欄名改了、匯出欄名要跟著改」的先例（CHANGELOG v2.97.444，LA Excel）。**但本次不適用**：設定檔匯出的是**程式鍵名** `dclk`，不是畫面標籤 `TCON DCLK`；`TCON DCLK` 這個字串在全庫**沒有任何匯出路徑**會寫出去（已逐處確認 §1.4） | 不改鍵名。若改 `dclk` → `txDclk`，反而會破壞所有既有 autosave 與匯出檔，得不償失 |
| `.script` code 匯出 | 只寫 GPO 暫存器，不含 DCLK | 零影響 |
| `TX DCLK` 這個字串 | 全庫目前**零出現**（`wfg.html` 0 筆、`i18n.js` 0 筆） | 乾淨的改名目標，不會撞名 |
| 使用者的截圖／匯出圖 | 波形區列名由 `TCON DCLK(13.5ns)` 變 `TX DCLK(13.5ns)`；Frame 卡片多兩格、變高 | **要標 `⚠ 輸出變更`**（VERSIONING §1 R1「版面／構圖類」） |

### 3.6 使用者操作流程會變成什麼樣

**情境 A — 從 EM02 的 TCON UI 抄 DCLK（Bruce 的原始痛點）**

| 今天 | 本方案之後 |
|---|---|
| 看到「TCON DCLK」→ 填 148.5 → **波形時基整個錯兩倍，沒有任何提示** | 機種顯示 `EM02`，`TCON UI DCLK` 填 148.5 → `TX DCLK` 自動變 74.25 → 波形正確 |

**情境 B — 匯入 EM02 code 之後的提醒卡片**

項目 1 改為兩個並列輸入框：`TX DCLK` ／ `EM02 UI DCLK`，兩格互相換算，填任一格都算確認。
（沿用 v4.6.0 已經建立的「合法即通過 ＋ 雙向綁定 ＋ 守衛輪詢」機制，不新增第三套。）

**情境 C — 既有使用者、只用波形不碰 TCON UI**

`TX DCLK` 那一格在原位、預設值一樣、夾值規則一樣，**除了標題字變了以外沒有任何差異**。

---

## 4. 版號判定初步意見

依 `docs/VERSIONING.md` §1 判定表與 R1～R4 **逐項判、取最高者**：

| 依據 | 判定 | 理由 |
|---|---|---|
| 判定表・操作流程 | PATCH | 欄位在同一張卡片、同一個群組、同一個位置，只換字 → 屬「文案」欄 |
| 判定表・既有功能的輸出 | — | 波形數值、`frame.dclk` 語意、計算路徑**零改變**（§1.2 已證明本方案是純顯示層） |
| 判定表・功能增減 | **MINOR** | **新增**「Pixel Rate 顯示」「TCON UI DCLK 輸入」「機種選擇的持久化與鏡射」——皆為新增，無移除 |
| R1（修 bug 輸出會變） | PATCH ＋ `⚠ 輸出變更` | §3.4-Q3 的 MNT/NB 同步修正（若併入本次） |
| R2（開新波） | 不適用 | 不開新波 |
| R3（分階段交付） | **MINOR** | 使用者**多能做一件事**：直接用 TCON UI 上的數字設定 |
| R4（預設值改變） | 不適用（若維持 `em02`） | 若 Bruce 裁示改成 `em01`：仍是 MINOR（「不影響任何既有操作」） |

### ⇒ 初步判定：**MINOR**，並掛 `⚠ 輸出變更`

- **不是 MAJOR。** 可能的反論是「使用者找不到『TCON DCLK』了」，但那一格在原位、
  新名字旁邊就是新增的「TCON UI DCLK」，兩者同時在視野內；VERSIONING §1 判定表把「文案」
  明列在 PATCH 欄，且 §1 明文「改動大小不是判準」。
- **`⚠ 輸出變更` 一定要標**：波形區列名文字改變 ＋ Frame 卡片高度改變 ⇒
  「用截圖／匯出圖片存下來的成果，新舊版拿同一組設定重跑會長得不一樣」，符合「版面／構圖類」判準。

### 🔴 版號數字本身有一個障礙，需要 Bruce 一併裁示

下一個 MINOR 應該是 **v4.6.0**，但 **`wfg.html` 裡已經有 45 處註解寫著 `v4.6.0`**
（區段式類比預計算、ack 卡片雙向綁定等），而 **CHANGELOG 裡根本沒有 v4.6.0 這個條目**
（`grep "v4.6.0" CHANGELOG.md` ＝ 0 筆；`common/version.js` 目前是 v4.5.5）。
那些工作最後是以 v4.5.1／v4.5.5 出版的，**註解上的版號是舊的、沒改回來的殘留**。

兩個處理方式：

- **(a) 建議**：先用一個**不進版**的更正 commit 把那 45 處註解改成實際版號（VERSIONING §3：只改註解不進版），
  之後本案照常編 **v4.6.0**。
- (b) 直接跳過 v4.6.0、編 v4.7.0，把數字讓給那批註解。
  ⚠ 這會在 CHANGELOG 留下一個沒有對應條目的空號，之後查版更難。

我建議 (a)。**這一項是既有殘留、不是本案造成的，但本案會第一個撞上它。**

---

## 5. 待 Bruce 裁示 / 我不確定的地方（不自行圓回去）

| # | 問題 | 我目前的理解 | 為什麼需要確認 |
|---|---|---|---|
| A1 | EM02 UI 上的 DCLK，對應的是 **TCON 側** Pixel Rate（`TCON HTOTAL × VTOTAL × FPS`）還是 **RX 側**（`HTOTAL × …`）？ | 我假設是 **TCON 側**，即 `UI DCLK = TX DCLK × 2` | 定頻應用且 `TX DCLK > RX DCLK` 時（例如內建 preset：TCON HTOTAL 2668 vs HTOTAL 2080）**兩者不相等**，係數要乘在誰身上會差很多。148.5/74.25 那個例子剛好兩側相同，驗證不出差別 |
| A2 | 「所有 NB TCON」是否確定涵蓋 `E501` / `E503` / `EN01` 三顆，ratio 都是 1？ | 依 Bruce 原話「EM01/與 NB 所有 TCON」→ 是 | 表要一次填對，漏一顆就是又一個差兩倍 |
| A3 | 除了 EM02／E512，MNT 系列還有沒有別的 1:1 型號？ | 目前表上 MNT 只有 em01/em02/e512 | 未來加型號時的預設 ratio 該是 1 還是 2 |
| A4 | §3.4-Q3 的 MNT/NB 同步 bug 要併進本次，還是獨立一版？ | 建議獨立，因為它會改變既有輸出、驗收條件不同 | 影響版號與驗收範圍 |
| A5 | 波形區列名要 `TX DCLK` 還是 `TX DCLK(13.5ns)`（保留現有的週期標註）？ | 建議保留 ns 標註，只換前綴 | Bruce 原話只說「改成 TX DCLK」 |

---

## 附：本輪查證方式（供覆核）

- 全部結論來自 `wfg.html` / `common/i18n.js` / `rxtx.html` 的**逐行閱讀與 grep**，行號皆已標註。
- 數值關係（§1.2）以 `node` 實算驗證，非推導後直接下結論。
- 線上狀態以 `git show fa305e3:wfg.html` 逐字比對（`fa305e3` ＝ 已 push 的 v4.5.3），確認不是本機差異。
- `TCON DCLK` 在全庫的出現位置已逐處列舉（`wfg.html` 31 筆、`wfg-guide.html` 11 筆、`i18n.js` 16 行/5 鍵、`rxtx` 1 筆不動）。
- **未執行任何產品程式碼修改。**
