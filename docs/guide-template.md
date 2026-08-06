# 說明頁範本（Guide Template v1.0）

本專案所有工具的使用手冊 —— `*-guide.html` —— 一律照這份範本做，長相與操作必須完全一致。
目前的參考實作（等同「母版」）是 **`wfg-guide.html`**：要開新的說明頁，直接複製它再換內容，不要另起爐灶。

> 為什麼範本說明放這裡而不放 HTML 註解裡：
> HTML 註解會被每一頁複製 N 份，改一次要改 N 個檔案、而且必然會漂移。
> 放 `docs/` 只有一份、是唯一真相，且不會增加線上頁面的下載量。
> `wfg-guide.html` 的 `<style>` 開頭仍保留一段簡短註解指回本文件。

---

## 1. 檔案與路徑慣例

| 項目 | 慣例 | 範例 |
|------|------|------|
| 檔名 | `<工具檔名去掉 .html>-guide.html`，放在專案根目錄 | `wfg.html` → `wfg-guide.html` |
| 進入點 | `index.html` 工具卡片右側的 `?` 按鈕，`openGuide(event,'xxx-guide.html')` | — |
| 版本號 | 🔴 **說明頁不納入版本號機制**，`common/version.js` 不加條目、頁面不顯示版號 | — |
| 相依 | 單一 HTML 檔，CSS/JS 全部內嵌，不引用 `common/` 也不引用任何 CDN | — |

單檔的理由：說明頁要能被單獨存檔、單獨寄給客戶、離線開啟。

---

## 2. 主題機制（亮／暗雙主題）

### 2.1 運作方式

```
<html data-theme="dark">   ← 預設值直接寫在 HTML 上，避免亮暗閃爍(FOUC)
   ↑
   └── <head> 內的同步 script 讀網址參數 ?theme=light|dark 後覆寫
   └── 使用者按右上角 🌙/☀️ 鈕 → toggleTheme() 改屬性 + history.replaceState 改網址
```

- **預設暗色**，與工具本體（`--bg:#0f172a`）一致。
- 🔴 **禁止使用 `localStorage` / `sessionStorage`**。記憶完全靠**網址參數**：切換後網址變成 `?theme=light`，
  重新整理、加書籤、把網址傳給別人都會沿用同一個主題。
- 頁內指向其他說明頁的連結（`a[href*="-guide.html"]`）會由 `syncGuideLinkTheme()` 自動帶上同一個 `theme` 參數，
  在多頁之間跳轉不會突然變色。指向工具本身（`wfg.html`、`index.html`）的連結**不加**參數，避免污染工具的網址。

### 2.2 色票 token 命名

色票**只**定義在 `[data-theme="dark"]` / `[data-theme="light"]` 兩個區塊裡，各自一份、名稱完全對稱。
與主題無關的常數（圓角、等寬字型、品牌色）放 `:root`。

| Token | 用途 | dark | light |
|-------|------|------|-------|
| `--bg` | 頁面底色 | `#0f172a` | `#f5f7fa` |
| `--card` | 卡片底、偶數章節的帶狀背景 | `#1b2740` | `#ffffff` |
| `--card-alt` | 偶數章節「之內」的卡片（必須比 `--card` 再亮／再暗一階） | `#243352` | `#f9fafb` |
| `--text` | 內文 | `#e2e8f0` | `#1a1a2e` |
| `--muted` | 次要文字、說明文 | `#94a3b8` | `#6b7280` |
| `--border` | 所有框線、分隔線 | `#334155` | `#e5e7eb` |
| `--accent-ink` | 主色系的**文字**（`h4`、連結、導覽 active） | `#fdba74` | `#c2410c` |
| `--primary-soft` | 主色淡底（callout 預設、表格 hover、zone 說明區） | `rgba(249,115,22,.13)` | `#fff7ed` |
| `--primary-line` | 主色淡框 | `rgba(249,115,22,.42)` | `#fed7aa` |
| `--nav-bg` | sticky 導覽半透明底 | `rgba(15,23,42,.92)` | `rgba(255,255,255,.94)` |
| `--input-bg` / `--input-border` | 搜尋框、tab 鈕、快捷鍵鍵帽、主題鈕 | `#0f172a` / `#3f4d68` | `#ffffff` / `#d1d5db` |
| `--code-bg` / `--code-fg` | 行內 `<code>` | `#0f172a` / `#fdba74` | `#f1f5f9` / `#c2410c` |
| `--table-bg` | 表格底 | `#17223a` | `#ffffff` |
| `--mark-bg` / `--mark-fg` | 搜尋高亮 `<mark>` | `#a16207` / `#fffbeb` | `#fde68a` / `#1a1a2e` |
| `--shadow` | 卡片陰影（暗色要更重才看得出層次） | `0 2px 12px rgba(0,0,0,.45)` | `0 2px 12px rgba(0,0,0,.08)` |
| `--callout-{warn,danger,success,info}-bg` | 四種 callout 底色 | 半透明 `rgba(...,.14)` | 極淡實色 |
| `--tag-*-bg` / `--tag-*-fg` | 表格型別標籤 `.t-type` 九種色 | 半透明底＋亮字 | 淡底＋深字 |

品牌固定色（兩個主題都一樣，作為**色塊填色**，其上文字用 `--on-primary`）：
`--primary #f97316`、`--primary-dark #c2410c`、`--on-primary #fff`、
`--accent-{green,amber,red,purple,blue,cyan}`。

### 2.3 鐵則

1. **元件規則裡禁止寫死顏色字面值**，一律 `var(--token)`。要換主題只改上面兩個色票區塊。
2. **文字色與塊面色要分開**：`--primary` 是拿來當底的，暗底上的**文字**一定用 `--accent-ink`，
   直接把 `--primary-dark`(#c2410c) 當暗色主題的文字會糊掉。
3. **唯一例外**：`.ui-mock` / `.wave-demo` / 介面示意圖容器，兩個主題都固定深色 —— 因為它們在模擬工具本體的實際外觀，
   跟著主題變反而失真。這三處的深色字面值是刻意保留的，改動時請維持。
4. 每加一個新元件，**兩個主題都要各截一張圖確認可讀**，不能只看預設的暗色。

---

## 3. 版面骨架（順序固定，不要調換）

```html
<html data-theme="dark">
<head>
  <meta charset / viewport>
  <script>  ← 主題初始化（必須在 <style> 之前）
  <title> / <meta name="description">
  <style>   ← 第 2 節的色票 + 以下所有元件
</head>
<body>
  <div class="hero">          … 標題、副標、膠囊徽章、hero-links（開啟工具／回首頁）
  <div class="sticky-nav">    … .nav-inner > .nav-btn × N + .search-wrap + .theme-toggle
  <section id="…"> × N        … 每章一個，內含 .container > .section-title + 內容
  <footer>                    … 標題、連結、免責聲明、Designed by Bruce Cheng
  <button id="to-top">
  <script>                    … toggleTheme / updateNav / toggleAccordion / switchTab / 搜尋
</body>
```

`section` 的奇偶背景交替是靠 `section:nth-child(even)` 做的，
所以 **`<section>` 必須是 `<body>` 的直接子元素**，不要包在額外的 `<div>` 裡，否則交替會亂掉。

---

## 4. 共用元件清單

新頁面只准用這些元件，需要新元件時請先加進本文件與母版，再兩邊同步。

| 元件 | class / id | 說明 |
|------|-----------|------|
| Hero | `.hero` `.subtitle` `.version` `.hero-links` | 漸層固定（深藍→橘），亮暗兩色相同 |
| Sticky 導覽 | `.sticky-nav` `.nav-inner` `.nav-btn` | 每章一顆鈕，`onclick="scrollToSection('#id')"`；捲動時 `updateNav()` 自動高亮 |
| 搜尋 | `.search-wrap` `#ctrl-search` `#search-count` | 只搜 `table tbody tr`，命中列高亮並自動展開所在的手風琴／頁籤 |
| 主題切換鈕 | `.theme-toggle` `#theme-toggle` | 固定放導覽列最右；窄螢幕（≤640px）搜尋框隱藏後它自動靠右 |
| 章節 | `section` `.section-title` `.sec-num` `.section-desc` | `.sec-num` 是圓形章節編號 |
| 卡片 | `.card`（`h3` / `h4` / `p` / `ul`） | 內容的基本容器 |
| 格線 | `.grid-2` `.grid-3` | ≤820px 自動變單欄 |
| 步驟 | `.steps` > `.step` | 自動編號＋連接線 |
| 表格 | `.table-wrap` > `table` + `.t-name` + `.t-type.tt-*` | **搜尋只認表格**，所以「逐項欄位說明」一律用表格寫 |
| Callout | `.callout` `.warn` `.danger` `.success` `.info` | 第一個 `<strong>` 自動變成獨佔一行的標題 |
| 手風琴 | `.accordion-item` `.accordion-header` `.accordion-body` `.arrow` | `onclick="toggleAccordion(this)"`，展開上限 `max-height:4000px` |
| 頁籤 | `.tabs` `.tab-btn` `.tab-panel` + `data-tabgroup` / `data-tabpanels` | `switchTab(btn, group, panelId)` |
| 流程圖 | `.flow` `.flow-node` `.flow-arrow` | 節點底色用 `--accent-*` |
| UI 模擬 | `.ui-mock` `.ui-card` `.ui-input` `.ui-chip` `.ui-val` | 🔒 固定深色 |
| 互動示意圖 | `.zone[data-zone]` + `#zone-desc` | hover/click 換說明；文案放 JS 的 `zoneDescriptions` |
| 波形 SVG | `.wave-demo` > `svg` | 🔒 固定深色，`min-width:560px` 可橫向捲 |
| 快捷鍵 | `.keyboard` `.key` `#key-desc` | 點鍵帽換說明 |
| 三態卡 | `.tri-state` `.tri-box` | |
| 搜尋高亮 | `mark` `tr.search-hide` | |
| 回到頂端 | `#to-top` | 捲過 500px 才出現 |

---

## 5. 章節撰寫慣例

1. 章節編號從 1 開始連續，`<span class="sec-num">N</span>` 與導覽鈕順序一致。
2. **每一個控制項都要進表格**，欄位固定為：`控制項｜型別｜範圍／選項｜說明`。
   型別用 `.t-type` 標籤：`tt-num` 數值輸入、`tt-sel` 下拉、`tt-chk` 核取、`tt-btn` 按鈕、
   `tt-out` 唯讀顯示、`tt-sld` 滑桿、`tt-rad` 單選鈕、`tt-txt` 文字輸入。
   理由：搜尋功能只掃表格列，沒進表格的控制項使用者搜不到。
3. 最後一章固定是「常見問題」，全部用手風琴。
4. 免責聲明固定放 footer，措辭沿用母版。
5. 🔴 **公開面禁止出現廠商商標**（IC 型號、儀器品牌等），一律用中性描述。

---

## 6. 新增一頁說明的步驟

1. `cp wfg-guide.html <tool>-guide.html`
2. 換掉 `<title>` / `<meta description>` / hero 標題與副標 / hero-links 的目標檔名。
3. 刪掉所有 `<section>` 內容，依 §5 重寫；同步改導覽鈕與 `.sec-num` 編號。
4. `zoneDescriptions`、`keyMap` 這類文案物件按需保留或整段刪掉（連同對應的 HTML 區塊）。
5. 🔴 **`<style>` 區塊與主題相關的 JS（`toggleTheme` / `syncGuideLinkTheme` / head 的初始化 script）一個字都不要動**，
   整段照抄。要調樣式請改母版再同步回所有說明頁。
6. `index.html` 對應的工具卡片加上 `?` 按鈕：`onclick="openGuide(event,'<tool>-guide.html')"`。
7. 驗證（缺一不可）：暗色首屏、亮色首屏，再加暗色下的表格／`code`／SVG 示意圖 hover／搜尋高亮／手風琴展開各一張截圖。

---

## 7. 已知刻意的取捨

- **主題不跟隨系統 `prefers-color-scheme`**：工具本體固定深色，說明頁跟著固定預設深色比較不突兀；
  想要亮色的人按一下就有，而且網址會記住。
- **列印固定沿用當下主題的版面**，但會隱藏導覽／搜尋／主題鈕／回到頂端，並強制展開所有手風琴與頁籤。
- **搜尋不搜內文只搜表格**：內文命中會產生大量無用結果，且無法用「隱藏未命中列」的方式呈現。
