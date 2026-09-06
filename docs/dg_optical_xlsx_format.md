# 多組光學比較 xlsx —— 參考檔結構解析與本專案的產生規格

解析對象：`~/TCON/share/DG/光學確認_20250114.xlsx`（下稱**參考檔**）
解析方式：純 JS（node 內建 `zlib` 解 deflate-raw，自己走 ZIP 中央目錄），零外部套件 —— 與 `dg.html` 裡既有的 `dgUnzip()` 同一套做法，確保筆記裡量到的東西產品端做得出來。
解析腳本：`_tmp_dg_parse_ref.js`（全量倒 XML）、`_tmp_dg_parse_ref2.js`（結構摘要 ＋ 拆出 chart 骨架）

> **去識別化提醒**：參考檔的 `xl/workbook.xml` 內嵌了原始絕對路徑（`x15ac:absPath`），裡面帶著產品型號代稱。**本專案產生的檔一律不寫 `absPath`、不寫 `docProps`，也不沿用參考檔的工作表名稱以外的任何識別字串。**

---

## 一、參考檔的 ZIP 內容

| 檔案 | 大小 | 我們要不要 |
|---|---:|---|
| `[Content_Types].xml` | 1.9 KB | 要（自己寫） |
| `_rels/.rels` | 0.6 KB | 要 |
| `xl/workbook.xml` ＋ `xl/_rels/workbook.xml.rels` | 1.3 / 1.0 KB | 要 |
| `xl/worksheets/sheet1.xml` ＋ `_rels` | 441 KB / 0.3 KB | 要 |
| `xl/styles.xml` | 10 KB | 要（自己寫精簡版） |
| `xl/sharedStrings.xml` | 1.7 KB | **不要** —— 全部改用 inline string（`t="inlineStr"`），少一個檔、少一層索引 |
| `xl/drawings/drawing1.xml` ＋ `_rels` | 3.4 / 0.6 KB | 要 |
| `xl/charts/chart{1,2,3}.xml` | 173 / 181 / 126 KB | 要（但**不含 cache**，見 §四） |
| `xl/theme/theme1.xml` | 6.8 KB | **不要** —— 圖表配色改用明碼 `srgbClr`，就不必帶佈景主題 |
| `xl/calcChain.xml` | 82 KB | **不要** —— 這是 Excel 的算式相依快取，可省略，開檔時會自己重建 |
| `xl/externalLinks/externalLink1.xml` | 188 KB | **不要** —— 參考檔連到另一個活頁簿的殘留，我們不需要 |
| `docProps/*` | 1.4 KB | **不要** |

> 三張 chart 各 120～180 KB，其中 **95% 以上是 `<c:numCache>`／`<c:strCache>`**（Excel 存的算好的值）。把 cache 抽掉之後骨架只有 **7.5 / 8.2 / 8.2 KB** —— 這就是我們要手寫的量。

---

## 二、工作表版面（參考檔＝ 5 組）

`dimension = A1:AM259`，`defaultColWidth = 7.875`、`defaultRowHeight = 14.25`。

列的用途固定：

| 列 | 內容 |
|---|---|
| 1 | 大標題（`A1:AB1` 合併） |
| 2 | 區塊標題（各區各自合併） |
| 3 | 欄位表頭（組別名稱 `1#`～`5#` 就在這一列） |
| 4 ～ 259 | 資料，**每一列一個灰階**（0 ～ 255，共 256 列） |

欄的用途（參考檔）：

| 欄 | 內容 | 性質 |
|---|---|---|
| A | `Gray` 0～255 | 常數 |
| B ～ F | 五組的**亮度原始值** | 常數（貼進來的量測值） |
| G | 空白間隔 | — |
| H | `Gray` | 常數 |
| I / J / K | 色溫 上限 / 中心 / 下限 | **公式**：`I4 = J4+500`、`K4 = J4-500`；第 5 列起 `I5 = I$4`、`J5 = J$4`、`K5 = K$4` |
| L ～ P | 五組的**色溫原始值** | 常數 |
| Q ～ S | 空白間隔 | — |
| T | `Gray` | 常數 |
| U / V / W | 標準 Gamma 2.0 / 2.2 / 2.4 | **公式**：`(T4/T$259)^2`、`^2.2`、`^2.4` |
| X ～ AB | 五組的**相對亮度** | **公式**：`(B4-B$4)/(B$259-B$4)`，逐組換欄 |
| AC / AD / AE | 標準 Gamma 值 2.0 / 2.2 / 2.4 | 常數（每列都是 2 / 2.2 / 2.4） |
| AF ～ AJ | 五組的**逐階 Gamma 值** | **公式**：`IFERROR(LOG(X4)/LOG($T4/255),2.2)`，逐組換欄 |

合併儲存格 7 個：`A1:AB1`、`B2:F2`、`L2:P2`、`U2:W2`、`X2:AB2`、`AC2:AE2`、`AF2:AJ2`。

欄寬（`<cols>`）：A=12.75、B=11.25、C:D=10.25、E:F=6.125、G:R=6.125、S:T=6.125、U:X=7.875(bestFit)、Y:AE=6.125、其餘 7.875。

數字格式（`styles.xml` 的 `numFmt`）：

| numFmtId | formatCode | 用在哪 |
|---|---|---|
| 9（內建） | `0%` | 相對亮度（X～AB） |
| 176 | `0.0_);[Red]\(0.0\)` | 色溫欄 |
| 177 | `0.0_ ` | 逐階 Gamma（AF～AJ） |
| 179 | `0.000%` | 標準 Gamma 曲線（U～W） |

**沒有用到的組**：參考檔的 C～F、M～P（第 2～5 組）**整欄是空的**，但 **Y～AB、AH～AJ 的公式照樣一路寫到第 259 列**，開起來就是滿滿的 `#DIV/0!`。這正是「欄位、公式、數列都存在，只是資料是空的」的實際長相 —— **我們照做**。

---

## 三、`<f>` 公式的兩種寫法

參考檔混用兩種，兩種 Excel 與 LibreOffice 都吃：

1. **完整式**：`<c r="X4" s="16"><f>(B4-B$4)/(B$259-B$4)</f><v>0</v></c>`
2. **共用式**（省檔案大小）：第一格寫 `<f t="shared" ref="X4:X259" si="7">…</f>`，後續格只寫 `<f t="shared" si="7"/>`

參考檔 4095 個公式格裡有 3000 多個是共用式。

> **本專案一律用完整式。** 理由：共用式要維護 `si` 編號與 `ref` 範圍的一致性，寫錯 Excel 一樣會說檔案損毀，而省下來的只是檔案大小（我們的檔本來就沒有 cache，已經很小）。**在「不會被 Excel 判損毀」這件事上，簡單的寫法就是對的寫法。**

另外參考檔的每個公式格都帶著 `<v>` 算好的值。**我們不寫 `<v>`** —— 只留 `<f>`，開檔時 Excel／LibreOffice 會自己算。這也正好是「公式是活的、不是把算好的值烤進去」最直接的證據：檔案裡根本沒有那個值。

---

## 四、圖表 XML

三張都是 **`<c:scatterChart>`、`scatterStyle = smoothMarker`、`<c:smooth val="1"/>`、`<c:marker><c:symbol val="none"/>`**，每張 8 個數列（3 條參考線 ＋ 5 組）。

| 圖 | 標題 | X 範圍 | Y 數列 | X 軸 | Y 軸 |
|---|---|---|---|---|---|
| chart1 | `Gamma curve` | `$T$4:$T$259` | U,V,W（標準）＋ X～AB（各組相對亮度） | 0～255，`General` | 0～1，`0%` |
| chart2 | `Gamma curve` | `$T$4:$T$259` | AC,AD,AE（標準）＋ AF～AJ（各組 Gamma） | 0～255，`General` | 1.6～2.8，`#,##0.0_);[Red]\(#,##0.0\)` |
| chart3 | `色溫` | `$H$4:$H$259` | I,J,K（上/中/下限）＋ L～P（各組色溫） | 0～255，`General` | min 4000（max 自動），同上格式 |

數列的參照長這樣（**這就是「原生圖表」的定義：指到儲存格，不是圖片**）：

```xml
<c:ser>
  <c:idx val="3"/><c:order val="3"/>
  <c:tx><c:strRef><c:f>工作表1!$X$3</c:f></c:strRef></c:tx>
  <c:marker><c:symbol val="none"/></c:marker>
  <c:xVal><c:numRef><c:f>工作表1!$T$4:$T$259</c:f></c:numRef></c:xVal>
  <c:yVal><c:numRef><c:f>工作表1!$X$4:$X$259</c:f></c:numRef></c:yVal>
  <c:smooth val="1"/>
</c:ser>
```

`<c:numCache>` / `<c:strCache>` 在 schema 上是 **optional**，整段省略即可 —— 這也是為什麼我們的檔會比參考檔小兩個數量級。

三張圖用 `xl/drawings/drawing1.xml` 的三個 `<xdr:twoCellAnchor>` 定位，各自 `r:id` 指到 `chart1/2/3`。

`[Content_Types].xml` 必須為每張 chart 各宣告一次 `application/vnd.openxmlformats-officedocument.drawingml.chart+xml`，drawing 宣告 `…drawing+xml`。**漏一條 Excel 就會說檔案損毀，而且不會告訴你是哪一條。**

---

## 五、本專案要產生的檔（擴充成 10 組）

同一份版面往右長：組數由 5 → **10**，資料列維持 256 列（第 4 ～ 259 列）。

| 欄 | 內容 | 對應 |
|---|---|---|
| A | Gray | 常數 0～255 |
| **B** | **原始 Excel 檔名** | 見下方 |
| C ～ L | 第 1 ～ 10 組的亮度 | 常數（空組留空） |
| N | Gray | 常數 |
| O / P / Q | 色溫 上限 / 中心 / 下限 | 公式 `=P4+500` / 5000 / `=P4-500` |
| R ～ AA | 第 1 ～ 10 組的色溫 | 常數（空組留空） |
| AC | Gray | 常數 |
| AD / AE / AF | 標準 Gamma 2.0 / 2.2 / 2.4 曲線 | 公式 `(AC4/AC$259)^2` … |
| AG ～ AP | 第 1 ～ 10 組的相對亮度 | 公式 `(C4-C$4)/(C$259-C$4)` … |
| AR / AS / AT | 標準 Gamma 值 2.0 / 2.2 / 2.4 | 常數 |
| AU ～ BD | 第 1 ～ 10 組的逐階 Gamma | 公式 `IFERROR(LOG(AG4)/LOG($AC4/255),2.2)` … |

**原始 Excel 檔名欄**（Bruce 明確要求的追溯欄位）：參考檔沒有這個東西，是本專案新增的。放在**第 3 列的組別表頭底下一列放不下**（第 4 列起就是資料），所以改放在**表格左上角的一個獨立小區塊**：

| 位置 | 內容 |
|---|---|
| `B3` | 表頭「原始檔名」 |
| `B4` ～ `B13` | 第 1 ～ 10 組的原始 Excel 檔名（一組一列，空組留空） |

這樣「第 N 組」在第 3 列的欄表頭與 B 欄的第 N 列各出現一次，**用組別編號對得起來**，而且不佔資料區。

---

## 六、實作順序（Bruce 指定）

1. 先產生**只有一張圖表**的最小版本 → `soffice --headless --convert-to csv` 實際打開，確認沒有修復提示、公式是活的。
2. 通過之後才擴到三張。

理由（Bruce 原話）：chart XML 一個地方寫錯 Excel 就會說檔案損毀，而且不會告訴你錯在哪。

**實作後的結果**：最小版本（1 張圖）一次就通過 LibreOffice，擴到 3 張也一次通過。

---

## 七、驗證這件事本身踩到的兩個坑（實測，寫下來免得下次再踩）

### 坑 1：`soffice --convert-to csv` 不套用自訂數字格式 —— 但那不是我們的檔有問題

我們的檔轉出來的 csv 裡，色溫欄是 `12982.0939689333`（沒有套 `0.0`）、標準 Gamma 是 `0%`（沒有套 `0.000%`）。
第一眼看起來像是 `numFmt` 沒生效。

**正控制推翻了這個判斷**：把**參考檔本身**（Excel 做的、用同一組自訂格式）丟給同一條指令，色溫欄一樣是 `7711.79758908076`。
所以這是 LibreOffice csv 匯出器的行為，不是檔案缺陷 —— 內建格式（`0%`，numFmtId 9）會套，自訂的（176/177/179）不會。

**要驗數字格式與欄寬，改走 ods 那條路**（`--convert-to ods` 之後讀 `number:percentage-style`、`style:column-width`），那條路兩者都帶得過去。

### 坑 2：🔴「LibreOffice 打得開」對壞掉的 chart XML **也成立**

負控制實測（故意弄壞再轉一次）：

| 故意弄壞的地方 | LibreOffice 的反應 |
|---|---|
| `[Content_Types].xml` 抽掉 `chart2` 的 `Override` | **照樣讀得出完整的 chart2** —— 這條路**抓不到**這一類錯（Excel 比 LibreOffice 嚴，仍可能抱怨） |
| `chart3.xml` 砍掉一半（不合法 XML） | **不報錯**，靜靜換上一個空圖：**1 個數列、6 KB**（正常是 13 個數列、435 KB） |

**結論**：「轉得出 csv／ods」這句話鑑別力很低，不能當作圖表沒問題的證據。
有鑑別力的斷言是**數每張圖的數列數**（`--convert-to ods` 之後數 `<chart:series>`，必須是 13）。
`_tmp_verify_dg144.js` 的【4】【6】就是照這個結論寫的。
