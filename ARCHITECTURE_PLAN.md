# TCON FAE 工具箱 — 多頁架構拆分規劃

> 版本：v1.0 | 日期：2026-05-16 | 作者：Claude (規劃) + Bruce (審閱)
> 狀態：待審閱 — 本文件為純規劃，不包含任何程式碼修改

---

## 1. 現況分析

### 1.1 檔案總覽

| 項目 | 數值 |
|------|------|
| 檔案 | `index.html`（單一檔案） |
| 總大小 | 3,526,335 chars（3.36 MB） |
| 總行數 | 37,293 行 |
| CSS | 2,087 行（107 KB） |
| HTML（所有頁面） | 1,880 行（119 KB） |
| JavaScript | 33,269 行（1,527 KB） |
| kvdat base64 嵌入 | 1 行（1,688 KB）— 佔總大小 48% |
| 版本 | v2.97.38 |

### 1.2 各子工具大小明細

| 子工具 | HTML | CSS | JS | 合計 | 函式數 |
|--------|------|-----|-----|------|--------|
| 首頁 Home | 7 KB (75行) | 2 KB (42行) | — | **8 KB** | — |
| Rx/Tx 頻率計算 | 20 KB (383行) | 5 KB (118行) | 19 KB (464行) | **45 KB** | 13 |
| mLVDS Skew | 16 KB (308行) | 4 KB (118行) | 11 KB (314行) | **31 KB** | ~15 |
| iSP 波形產生器 | 17 KB (335行) | 11 KB (422行) | 92 KB (2,188行) | **121 KB** | 75 |
| eDP AUX/DPCD | 15 KB (231行) | 9 KB (176行) | 325 KB (6,475行) | **350 KB** | 122 |
| WFG (TCON+SigGen+LA) | 42 KB (548行) | 57 KB (566行) | 1,000 KB (22,624行) | **1,098 KB** | 775 |

| 共用資源 | 大小 |
|----------|------|
| Global CSS（通用樣式） | 12 KB (392行) |
| Responsive CSS | 5 KB (160行) |
| Hex Drum Picker CSS | 2 KB (93行) |
| Anti-flash script | 2 KB (36行) |
| i18n 系統（519 鍵值） | 55 KB (501行) |
| Global JS（share/nav/lang） | 8 KB (212行) |
| Pull-to-Refresh | 3 KB (91行) |
| 示波器 Lightbox | 6 KB (159行) |
| Session Persistence | 9 KB (239行) |
| **共用資源小計** | **102 KB** |

| 嵌入二進位資料 | 大小 | 用途 |
|----------------|------|------|
| `wfg-la-i2c-aux-kvdat-b64` | 1,688 KB (1行) | LA 分析器 I2C+AUX 範例 kvdat |
| `WFG_LA_I2C_MEASURE_KVDAT_B64` | 5 KB (50行) | LA I2C 量測範例 |
| `WFG_LA_EDP_AUX_ANOMALY_KVDAT_B64` | 56 KB (62行) | LA eDP AUX 異常範例 |
| **嵌入資料小計** | **1,749 KB** |

### 1.3 現有架構

```
index.html (3.36 MB)
├── <head>
│   ├── Anti-flash script (line 14-49) — 防閃爍，決定初始顯示頁面
│   └── <style> (line 50-2136) — 所有 CSS
├── <body>
│   ├── Header（共用） — sticky header + 語言切換 + 返回按鈕
│   ├── #page-home (line 2142) — 首頁卡片導航
│   ├── #page-calc (line 2217) — mLVDS Skew 計算
│   ├── #page-rxtx (line 2525) — Rx/Tx 頻率計算
│   ├── #page-isp (line 2908) — iSP 波形產生器
│   ├── #page-wfg (line 3243) — WFG 波形產生器
│   │   ├── #wfg-tcon-content — TCON 模式
│   │   ├── #wfg-siggen-content — 訊號產生器模式
│   │   └── #wfg-la-content — LA 分析器模式
│   └── #page-aux (line 3791) — eDP AUX 解碼 / DPCD 查詢
├── <script> (line 4022-37290) — 所有 JavaScript
│   ├── i18n 系統 (55 KB, 519 鍵值, 3語言)
│   ├── Global 函式（showPage, applyLang, t(), share）
│   ├── mLVDS Skew JS (11 KB)
│   ├── Rx/Tx JS (19 KB)
│   ├── Pull-to-Refresh (3 KB, 通用)
│   ├── 示波器 Lightbox (6 KB, 通用)
│   ├── iSP 波形 JS (92 KB)
│   ├── AUX/DPCD JS (325 KB)
│   │   ├── DPCD_DB 資料庫 (151 KB, 5,281行)
│   │   ├── DPCD EN 翻譯補丁 (40 KB)
│   │   ├── AUX 解碼邏輯 (71 KB)
│   │   ├── Hex Drum Picker (16 KB)
│   │   └── AUX Manchester 波形 (53 KB)
│   ├── WFG JS (1,000 KB)
│   └── Session Persistence (9 KB)
└── <script type="text/plain"> (line 37291) — kvdat base64 (1,688 KB)
```

### 1.4 現有問題

1. **首頁載入 3.36 MB**：使用者只想看首頁或某個小工具，卻被迫下載全部程式碼，手機體驗差
2. **Chrome MCP 超時**：WFG/LA 模式的 DOM + JS 過大，導致 Chrome extension renderer 凍結
3. **git diff 不可讀**：任何小改動都在 37,000 行的單檔中，code review 困難
4. **kvdat 佔 48%**：1.69 MB 的 base64 資料即使不用 LA 分析器也要下載
5. **維護風險**：函式命名衝突風險高（目前靠前綴 `rt`/`sk`/`isp`/`aux`/`wfg` 避免）

### 1.5 跨工具依賴關係

```
全域共用（所有工具都用）:
  ├── currentLang / t() / I18N — i18n 翻譯系統
  ├── applyLang() — 語言切換套用
  ├── showPage() — SPA 頁面切換
  ├── escapeHtml() — HTML 安全過濾
  ├── debounce() — 事件節流
  ├── sessionStorage — 頁面記憶
  └── CSS 變數 + 共用樣式

工具間依賴:
  ├── iSP → 示波器 Lightbox（雙指縮放）
  ├── iSP → Pull-to-Refresh
  ├── WFG → 無外部依賴（自包含，僅用全域函式）
  ├── AUX/DPCD → Hex Drum Picker CSS
  ├── AUX/DPCD → 無跨工具 JS 依賴
  ├── Rx/Tx → 無跨工具依賴
  └── mLVDS Skew → 無跨工具依賴

結論: 子工具之間無直接依賴，全部透過全域共用層連接。
      這是拆分的最佳基礎——每個工具只需引入共用層即可獨立運作。
```

---

## 2. 多頁架構設計方案

### 2.1 目標頁面結構

```
tcon-tools/
├── index.html          — 首頁（導航入口）
├── rxtx.html           — Rx/Tx 頻率計算
├── calc.html           — mLVDS Skew 計算
├── isp.html            — iSP 波形產生器
├── aux.html            — eDP AUX 解碼 / DPCD 查詢
├── wfg.html            — WFG 波形產生器（含 TCON/SigGen/LA 三模式）
├── common/
│   ├── common.css      — 全域共用 CSS（變數 + 通用樣式 + RWD）
│   ├── common.js       — 全域共用 JS（i18n + lang + nav helpers）
│   └── i18n.js         — i18n 鍵值資料（獨立檔案，方便維護）
├── data/
│   ├── dpcd-db.js      — DPCD 資料庫（275 KB → 可能壓到 ~80 KB gzip）
│   └── kvdat-samples/
│       ├── i2c-measure.kvdat.b64.js      — I2C 量測範例 (5 KB)
│       ├── edp-aux-anomaly.kvdat.b64.js  — eDP AUX 異常範例 (56 KB)
│       └── i2c-aux-full.kvdat.b64.js     — I2C+AUX 完整範例 (1,688 KB)
└── og-image.png
```

### 2.2 各頁面預估大小

| 頁面 | 預估大小 | gzip 後估計 | 說明 |
|------|----------|-------------|------|
| `index.html`（首頁） | ~30 KB | ~8 KB | 含 common.css/js inline 或 link |
| `rxtx.html` | ~65 KB | ~15 KB | 含共用 CSS/JS + 工具 CSS/JS |
| `calc.html` | ~50 KB | ~12 KB | 含共用 CSS/JS + 工具 CSS/JS |
| `isp.html` | ~140 KB | ~35 KB | 含示波器 Lightbox + Pull-to-Refresh |
| `aux.html` | ~120 KB | ~30 KB | 不含 DPCD_DB（lazy load） |
| `aux.html` + DPCD 載入後 | ~395 KB | ~90 KB | DPCD 查詢 tab 切換時載入 |
| `wfg.html` | ~1,120 KB | ~200 KB | 不含 kvdat 範例資料 |
| `data/dpcd-db.js` | ~275 KB | ~80 KB | 按需載入 |
| `data/kvdat-samples/*.js` | ~1,749 KB | ~100 KB | 按需載入（二進位壓縮率高） |

**關鍵改善：首頁從 3.36 MB → ~30 KB（降低 99%）**

### 2.3 共用資源管理

#### 2.3.1 `common/common.css`（~19 KB）

包含：

- CSS 變數（`:root` 定義）
- Body / 字體基礎
- Header 樣式（`.header`, `.back-row`, `.back-btn`）
- Language Switcher
- Container / Card / Form 通用樣式
- Radio Group / Chips Selector
- Results / Footer
- Responsive breakpoints（480px / 768px / 1024px）

不包含：各工具專屬 CSS（留在各 `.html` 的 `<style>` 中，或獨立 CSS 檔）

#### 2.3.2 `common/common.js`（~17 KB）

包含：

- `currentLang` 變數
- `t(key, vars)` 翻譯函式
- `escapeHtml()` 安全函式
- `applyLang(lang)` 語言切換
- `debounce()` 節流函式
- Language select 初始化
- Back 按鈕功能（改為 `<a href="index.html">`）
- Pull-to-Refresh（通用）
- Session persistence 共用邏輯

#### 2.3.3 `common/i18n.js`（~55 KB）

i18n 鍵值可依策略選擇：

**方案 A（推薦）：全部 i18n 集中一檔**
- 優點：維護簡單，一處修改即可
- 缺點：每頁載入 55 KB（gzip 後 ~15 KB，可接受）
- 實作：`const I18N = { ... }; window.I18N = I18N;`

**方案 B：按工具拆分 i18n**
- 優點：最小化載入
- 缺點：維護分散，新增翻譯要找對檔案
- 實作：`common-i18n.js` + `rxtx-i18n.js` + `wfg-i18n.js` + ...

**建議採用方案 A**，原因：55 KB gzip 後僅 ~15 KB，對載入影響極小，且大幅降低維護複雜度。

### 2.4 kvdat 資料處理策略

目前 kvdat 嵌入方式：
1. 大型 kvdat（1,688 KB）放在 `<script type="text/plain">` 中，JS 首次需要時讀取 `.textContent`（已是 lazy 解碼）
2. 中小型 kvdat（5 KB, 56 KB）直接在 JS 中以 base64 字串陣列存儲

**拆分後策略：**

```javascript
// wfg.html 中的 LA preset 定義
const LA_PRESETS = [
  {
    name: 'I2C Measure',
    kvdatUrl: 'data/kvdat-samples/i2c-measure.kvdat.b64.js',
    fileName: '公司NB(Intel13th)_ROM_ReadEDID(TMA_I2C_NG)_20241126.kvdat'
  },
  {
    name: 'eDP AUX Anomaly',
    kvdatUrl: 'data/kvdat-samples/edp-aux-anomaly.kvdat.b64.js',
    fileName: '2026-03-06_14-02-44-G156ED11-NG.kvdat'
  },
  {
    name: 'I2C+AUX Full',
    kvdatUrl: 'data/kvdat-samples/i2c-aux-full.kvdat.b64.js',
    fileName: 'HP_Qualcomm_NB2_eDP_swing0_1620Mbps_NG.kvdat'
  }
];

// 使用者點選 preset 時 lazy load
async function loadKvdatPreset(preset) {
  showProgress('載入範例資料...');
  const module = await import(preset.kvdatUrl);
  const b64 = module.default;
  const parsed = wfgParseKvdatBytes(wfgLaBase64ToArrayBuffer(b64));
  wfgLaApplyParsedKvdatCapture(parsed, preset.fileName);
}
```

kvdat 資料檔格式（ES module）：
```javascript
// data/kvdat-samples/i2c-aux-full.kvdat.b64.js
export default "PD94bWwgdmVyc2lvbj0iMS4w...";
```

### 2.5 DPCD 資料庫 lazy loading

DPCD_DB（275 KB）僅在 AUX/DPCD 工具中使用，且只在 DPCD 查詢 tab 需要完整資料。

```javascript
// aux.html 中
let DPCD_DB = null;

async function ensureDpcdDb() {
  if (DPCD_DB) return;
  const module = await import('./data/dpcd-db.js');
  DPCD_DB = module.default;
  // 套用 EN 翻譯補丁
  module.applyEnPatch(DPCD_DB);
}

// DPCD 查詢 tab 啟用時載入
function onDpcdTabActivate() {
  ensureDpcdDb().then(() => {
    dpcdSearch(currentQuery);
  });
}
```

### 2.6 頁面間導航

**從 SPA 改為多頁導航：**

```html
<!-- index.html 首頁 -->
<a href="rxtx.html" class="tool-card">Rx/Tx 頻率計算</a>
<a href="calc.html" class="tool-card">mLVDS Skew 計算</a>
<a href="isp.html" class="tool-card">iSP 波形產生器</a>
<a href="aux.html" class="tool-card">eDP AUX / DPCD</a>
<a href="wfg.html" class="tool-card">TCON 波形產生器</a>

<!-- 各工具頁面的返回按鈕 -->
<a href="index.html" class="back-btn">← 返回首頁</a>
```

**Hash 路由相容：**
- 舊的 `index.html#rxtx` 連結需要相容
- 在 `index.html` 保留 hash redirect 邏輯：

```javascript
// index.html 中的 redirect
(function() {
  var hash = location.hash.replace('#', '');
  var redirectMap = {
    'rxtx': 'rxtx.html',
    'calc': 'calc.html',
    'isp': 'isp.html',
    'aux': 'aux.html',
    'wfg': 'wfg.html',
    'wfg-la': 'wfg.html#la',
    'wfg-siggen': 'wfg.html#siggen'
  };
  if (redirectMap[hash]) {
    location.replace(redirectMap[hash]);
  }
})();
```

### 2.7 狀態共享

需要跨頁面共享的狀態：

| 狀態 | 目前儲存方式 | 拆分後方式 |
|------|-------------|-----------|
| 語言設定 | `localStorage('tcon-lang')` | 不變（localStorage 跨頁面天然共享） |
| 當前頁面 | `sessionStorage('tcon_page')` | 不再需要（改用多頁面路由） |
| WFG 模式 | `sessionStorage('wfg_active_mode')` | 改用 `wfg.html#la` 等 hash |
| AUX tab | `sessionStorage('aux_active_tab')` | 改用 `aux.html?tab=dpcd` 或 hash |
| 表單數值 | sessionStorage 各欄位 | 各頁面獨立 sessionStorage，key 不變 |
| WFG Auto-save | `localStorage('wfg-autosave-*')` | 不變（僅 wfg.html 使用） |

### 2.8 GitHub Pages 路由注意事項

- GitHub Pages 原生支援多 HTML 檔案，無需特殊設定
- 路徑直接對應檔案：`/tcon-tools/rxtx.html` → `rxtx.html`
- 不需要 `404.html` SPA fallback（因為不用 HTML5 History API）
- OG meta tags 可以在每個頁面獨立設定
- `og-image.png` 路徑不變

### 2.9 各頁面 HTML 模板

每個工具頁面的基本結構：

```html
<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta name="description" content="[工具描述]">
  <meta property="og:title" content="[工具名稱] — TCON FAE專用工具箱">
  <meta property="og:image" content="https://brucecheng0428.github.io/tcon-tools/og-image.png">
  <title>[工具名稱] — TCON FAE專用工具箱</title>
  <link rel="stylesheet" href="common/common.css">
  <style>
    /* 此工具專屬 CSS */
  </style>
</head>
<body>
  <div class="header">
    <div class="back-row">
      <a href="index.html" class="back-btn" data-i18n="nav.back">← 返回首頁</a>
    </div>
    <h1 data-i18n="[tool].title">[工具名稱]</h1>
    <p data-i18n="[tool].subtitle">[副標題]</p>
    <div class="lang-switcher">
      <select id="lang-select" class="lang-select">
        <option value="zh-TW">繁體中文</option>
        <option value="en">English</option>
        <option value="zh-CN">简体中文</option>
      </select>
    </div>
  </div>

  <div class="container">
    <!-- 工具內容 -->
  </div>

  <script src="common/i18n.js"></script>
  <script src="common/common.js"></script>
  <script>
    /* 此工具專屬 JS */
  </script>
</body>
</html>
```

---

## 3. 遷移計劃

### 3.1 拆分順序

依據「風險低、體量小 → 風險高、體量大」的原則：

| 階段 | 工具 | 複雜度 | 理由 |
|------|------|--------|------|
| **Phase 0** | 共用資源 + 首頁 | 低 | 建立 `common/` 基礎設施，首頁最簡單 |
| **Phase 1** | Rx/Tx 頻率計算 | 低 | 最小的工具（45 KB），無特殊依賴，適合驗證拆分流程 |
| **Phase 2** | mLVDS Skew | 低 | 第二小的工具（31 KB），同樣獨立 |
| **Phase 3** | iSP 波形產生器 | 中 | 中等大小（121 KB），依賴 Lightbox + Pull-to-Refresh |
| **Phase 4** | eDP AUX/DPCD | 中高 | 較大（350 KB），需處理 DPCD_DB lazy loading |
| **Phase 5** | WFG | 高 | 最大最複雜（1,098 KB + 1,749 KB kvdat），775 函式 |
| **Phase 6** | 清理 + 舊 URL 相容 | 低 | 移除舊 `index.html` 中的殘留，確認所有舊連結可用 |

### 3.2 Phase 0：共用資源 + 首頁（建議首先完成）

**步驟：**

1. 建立 `common/` 目錄
2. 抽出 `common/common.css`：
   - CSS 變數 `:root { ... }`
   - Body / font 基礎
   - Header / back-btn
   - Language switcher
   - Container / Card / Form
   - Radio Group / Chips
   - Results / Footer
   - Responsive media queries
   - _約 19 KB_
3. 抽出 `common/i18n.js`：
   - 完整 `I18N` 物件（519 鍵值）
   - `window.I18N = I18N;`
   - _約 55 KB_
4. 抽出 `common/common.js`：
   - `t()`, `escapeHtml()`, `applyLang()`, `debounce()`
   - Language select 初始化
   - Pull-to-Refresh 通用邏輯
   - Hash redirect 邏輯
   - _約 17 KB_
5. 建立新 `index.html`（首頁）：
   - 引入 `common/common.css` + `common/common.js`
   - 首頁 HTML（工具卡片、免責聲明、分享按鈕）
   - 導航改為 `<a href="xxx.html">`
   - Hash redirect 相容舊 URL
   - _約 30 KB_

**驗證：**
- 新首頁在手機上可正常顯示
- 語言切換正常
- 所有工具卡片連結正確
- 舊的 `index.html#rxtx` 等 URL 能正確 redirect

### 3.3 Phase 1：Rx/Tx 頻率計算

**步驟：**

1. 建立 `rxtx.html`
2. 移入 Rx/Tx 專屬 HTML（383 行）
3. 移入 Rx/Tx 專屬 CSS（118 行）— 放在 `<style>` 中
4. 移入 Rx/Tx JS（464 行，13 函式）— 放在 `<script>` 中
5. 確認所有 `data-i18n` key 在 `i18n.js` 中存在
6. Header 加返回按鈕

**驗證：**
- 四個計算區塊全部正常
- 即時計算功能正常（input event → `rtCalcAll()`）
- 語言切換正常
- 手機排版正常

### 3.4 Phase 2：mLVDS Skew

**步驟：**

1. 建立 `calc.html`
2. 移入 Skew 專屬 HTML（308 行）
3. 移入 Skew 專屬 CSS（118 行）
4. 移入 Skew JS（314 行）+ 共用 state/chips 邏輯（需確認哪些是 Skew 專用）
5. 示波器示意圖 CSS（349-441 行）判斷是 Skew 專用或共用

**驗證：**
- 示波器 A Event B 設定表正確
- UI cof_cnt 分界值表正確（含 EM01/EM02 切換）
- Skew 檔位參照表正確
- Copy to All / X1 cascade 正常
- COF 拖移正常

### 3.5 Phase 3：iSP 波形產生器

**步驟：**

1. 建立 `isp.html`
2. 移入 iSP 專屬 HTML（335 行）
3. 移入 iSP CSS（422 行 + Reverse Lookup CSS 48 行）
4. 移入 iSP JS（2,188 行，75 函式）
5. 示波器 Lightbox（159 行）— 目前為通用，但只有 iSP 使用，可直接內嵌到 `isp.html`
6. Pull-to-Refresh 已在 `common.js` 中

**驗證：**
- DLL/PLL 模式切換正常
- 8-bit/6-bit 波形繪製正確
- Minimap 縮放 / 平移正常
- 反推功能（Reverse Lookup）正常
- 觸控手勢（雙指縮放/慣性滑動）正常

### 3.6 Phase 4：eDP AUX/DPCD

**步驟：**

1. 建立 `aux.html`
2. 建立 `data/dpcd-db.js` — 抽出 DPCD_DB + EN patch（約 275 KB）
3. 移入 AUX 專屬 HTML（231 行）
4. 移入 AUX/DPCD CSS（176 行 + Hex Drum Picker CSS 93 行）
5. 移入 AUX/DPCD JS（6,475 行，122 函式）
6. 實作 DPCD_DB lazy loading：
   - AUX 解碼 tab 不需要 DPCD_DB，可立即使用
   - DPCD 查詢 tab 啟動時 `import('./data/dpcd-db.js')`
   - AUX Manchester 波形不依賴 DPCD_DB
7. Hex Drum Picker — 判斷是否只有 AUX 使用（是 → 內嵌；否 → 放 common）

**驗證：**
- AUX 解碼 tab 立即可用（不等 DPCD_DB 載入）
- DPCD 查詢 tab 切換時載入 DPCD_DB，loading 提示
- DPCD 地址滾筒 (drum picker) 正常
- DPCD 反向搜尋正常
- AUX Manchester 波形繪製正常
- 從 AUX 解碼跳到 DPCD 查詢的連動正常

### 3.7 Phase 5：WFG（TCON 波形產生器）

**步驟：**

1. 建立 `wfg.html`
2. 建立 `data/kvdat-samples/` 目錄 + 三個 kvdat 檔案
3. 移入 WFG 專屬 HTML（548 行）
4. 移入 WFG CSS（566 行）
5. 移入 WFG JS（22,624 行，775 函式） — 最大的工作量
6. 三模式 tab（TCON / SigGen / LA）維持在同一頁面
7. kvdat 範例改為 lazy load：
   - 使用者選擇 LA preset 時才下載對應 `.kvdat.b64.js`
   - 進度條顯示下載進度
8. WFG Auto-save/restore 邏輯保留（localStorage 已跨頁面）
9. WFG 匯出/匯入（JSON + kvdat）邏輯保留

**子步驟（WFG JS 過大，建議分批搬移）：**

1. 先搬 WFG state + config + preset（~100 KB）
2. 搬 TCON timing engine（GPIO/phase counter/OAX）（~150 KB）
3. 搬 Canvas renderer（~200 KB）
4. 搬 Interaction（drag/zoom/touch/inertia）（~100 KB）
5. 搬 Analog waveform（SD/LS）（~200 KB）
6. 搬 Measurement + Cursor + Pulse counter（~100 KB）
7. 搬 LA kvdat import/export（~50 KB）
8. 搬 Minimap + Auto-save + Init（~100 KB）

**驗證（逐步，每搬一批就測）：**
- TCON 模式：波形顯示、通道切換、preset 載入
- SigGen 模式：訊號產生器
- LA 模式：kvdat 匯入、波形顯示、量測
- Canvas 互動：滑鼠滾輪縮放、拖曳平移、觸控手勢
- 類比波形：SD / LS 顯示正確
- 量測卡：數值正確
- Cursor：V1/V2 標尺
- 脈衝計數器
- Minimap
- 匯出/匯入 JSON
- Auto-save / Auto-restore

### 3.8 Phase 6：清理 + 舊 URL 相容

**步驟：**

1. 確認所有頁面功能正常
2. `index.html` 僅保留首頁 + hash redirect
3. `la.html` 更新 redirect 到 `wfg.html#la`
4. 更新 `og-image.png` 路徑引用
5. 更新 OG meta 的 `og:url`
6. 移除不再需要的 Anti-flash script（多頁面架構不再需要 SPA 防閃爍）
7. 測試所有舊 URL 路徑的 redirect

---

## 4. 風險評估

### 4.1 高風險項目

| 風險 | 影響 | 緩解措施 |
|------|------|----------|
| WFG 775 函式搬移可能遺漏依賴 | WFG 功能中斷 | 分批搬移 + 每批驗證；保留舊 `index.html` 作為 fallback |
| i18n 鍵值拆分後遺漏 | UI 顯示 raw key | 寫腳本驗證所有 `data-i18n` 屬性對應的 key 都存在 |
| sessionStorage key 碰撞 | 跨頁面狀態異常 | 各工具用有前綴的 key（已是如此，無需改動） |

### 4.2 中風險項目

| 風險 | 影響 | 緩解措施 |
|------|------|----------|
| 舊 URL (`index.html#xxx`) 失效 | 書籤/分享連結壞掉 | `index.html` 保留 hash redirect 邏輯 |
| DPCD_DB lazy load 失敗 | DPCD 查詢不可用 | 加 error handling + retry + 離線提示 |
| kvdat lazy load 太慢 | 使用者等很久 | 進度條 + 預估大小提示 |
| GitHub Pages 快取問題 | 舊版本快取不更新 | 檔案名加版本號或用 cache-busting query string |

### 4.3 低風險項目

| 風險 | 影響 | 緩解措施 |
|------|------|----------|
| 多頁面跳轉略慢於 SPA | 頁面切換有白閃 | 輕量頁面載入快；可考慮 `<link rel="prefetch">` |
| CSS 重複載入 | 額外網路請求 | common.css 會被瀏覽器快取，實際只下載一次 |

### 4.4 回退方案

1. **完整回退**：舊 `index.html` 保留為 `index-legacy.html`，一鍵 rename 即可回退
2. **部分回退**：每個 Phase 獨立 commit，可 `git revert` 單一 Phase
3. **並行期**：Phase 0-2 完成後，舊 URL 仍可用（redirect），新 URL 也可用，可觀察一段時間再清理

---

## 5. 驗證清單

### 5.1 每個 Phase 完成後必須驗證

- [ ] 手機（iOS Safari / Android Chrome）頁面載入正常
- [ ] 語言切換（繁中/英/簡中）所有文字正確
- [ ] 所有計算/功能結果與舊版一致
- [ ] 返回首頁按鈕正常
- [ ] 舊 URL（`index.html#xxx`）redirect 正常
- [ ] Chrome MCP 可正常操作（特別是 WFG 拆分後）

### 5.2 最終驗證

- [ ] 所有 6 個工具頁面功能完整
- [ ] 首頁載入大小 < 50 KB
- [ ] WFG 頁面不含 kvdat 嵌入（改為 lazy load）
- [ ] `git diff` 在各檔案中可讀
- [ ] GitHub Pages 部署正常
- [ ] OG 分享預覽正常

### 5.3 自動化驗證（建議開發）

```bash
# 1. 檢查所有 data-i18n key 都有對應翻譯
grep -oP 'data-i18n="([^"]+)"' *.html | sort -u > used-keys.txt
grep -oP "'([^']+)':" common/i18n.js | sort -u > defined-keys.txt
comm -23 used-keys.txt defined-keys.txt  # 應該為空

# 2. 檢查頁面大小
for f in *.html; do echo "$f: $(wc -c < $f) bytes"; done

# 3. 檢查無 broken links
grep -oP 'href="([^"]+)"' *.html | while read url; do
  [ -f "$url" ] || echo "BROKEN: $url"
done
```

---

## 6. 附錄：完整函式清單統計

| 區塊 | 函式數 | 行範圍 |
|------|--------|--------|
| Global (i18n/nav/lang) | 15 | 4023-5049 |
| Rx/Tx | 13 | 5050-5513 |
| Common (PtR + Lightbox) | 10 | 5514-5763 |
| iSP | 75 | 5764-7951 |
| AUX/DPCD | 122 | 7952-14426 |
| WFG | 775 | 14427-37050 |
| Session | 4 | 37052-37290 |
| **總計** | **1,014** | |
