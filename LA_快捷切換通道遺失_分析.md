# LA tab「快捷設定 I2C→切回 16ch」後深度 ≥2GSa 只錄到 2 通道 — 根因分析

> 唯讀調查報告。**未修改任何程式碼、未進版號、未 git commit/push。**
> 調查日期：2026-06-03　調查者：Claude（瑞鼎 TCON FAE 常用計算工具專案）
> 標的檔案：`wfg.html`（LA tab，部署於 https://brucecheng0428.github.io/tcon-tools/wfg.html#la ）

---

## 1. 結論（先講重點）

**Bruce 描述屬實，且 100% 由 code 確認。**

根因是一個函式：`wfgLaHardwareCaptureChannels()`（`wfg.html` 第 **4576–4595** 行）。

它在「**取樣深度 > 1 GSa**」時，會放棄使用者勾選的通道清單，改用「**上一次擷取有訊號的通道**」(`wfgLaLastEdgeCounts`) 來決定實際送給 LA2016 的通道遮罩。

而「快捷設定→I2C範例→切回快捷設定」的流程，會讓 `wfgLaLastEdgeCounts` **殘留 I2C 範例的狀態（只有 CH0/CH1 有 edge）**，且「切回快捷設定」的程式分支**沒有清掉這個殘留、也沒有重新擷取**。

於是深度 ≥2GSa 時：畫面雖顯示 16 通道全勾，實際送硬體的通道遮罩卻只剩 **CH0、CH1**。深度 ≤1GSa 時函式直接回傳全部勾選通道，所以正常。

**取樣率（100M / 200M）完全不影響**——這個函式根本沒讀取樣率，只看「深度」與「勾選通道數」。這與 Bruce 補充 #1（2GSa 配 100M 仍 NG）完全一致。

---

## 2. 重現結果（操作式驗證）

### 2.1 我用什麼管道驗證（誠實說明）

- **走「實際部署版 + 實機決策邏輯」驗證，非合成資料臆測。**
- 我先確認**線上部署版**的 `wfgLaHardwareCaptureChannels` 原始碼與本機分析完全相同（含 `length <= 8`、`1000000000` 門檻、`wfgLaLastEdgeCounts` 引用三項皆在）。
- 然後在線上頁面 console 中，用**部署版的這支函式本體**，餵入「I2C 範例實際產生的 edge-count 樣態」，量測它回傳的通道遮罩。這個遮罩就是第 8381–8390 行寫入 LA2016 `REG_TRIGGER channelMask` 的值，硬體只會擷取遮罩內的通道——所以這支函式的輸出 = 實機實際錄到的通道。
- **edge-count 輸入不是我猜的**：我直接讀部署版 I2C 範例快照檔 `data/la-presets/i2c-measure.snapshot.js`，確認它 `enabledChannels:[0,1]`、且 16 通道中**只有 CH0(SDA, edgeCount=69)、CH1(SCL, edgeCount=301)** 有 edge，其餘 14 通道 edgeCount=0。這正是切回後殘留在 `wfgLaLastEdgeCounts` 的值。

> **我未做、且誠實標註的部分**：我沒有遠端觸發 Bruce 實機 LA2016 的「單次擷取」實體動作（WebUSB 需使用者手勢、且擷取屬有副作用動作、超出本次唯讀範圍）；另外 I2C「異常範例」快照解碼很重，遠端驅動的分頁渲染器在解碼時凍結，導致我無法穩定地從 DOM 讀回切回後的內部 edge-count。因此「實機實體單次觸發」這一步我以**部署版決策函式 + 實際快照資料**取代，兩者輸出對實機行為具決定性。若 Bruce 要 100% 黑箱實機佐證，可在實機上照下表條件實際單次觸發一次，結果必為下表所列。

### 2.2 量測結果（執行部署版 `wfgLaHardwareCaptureChannels`）

固定條件：16 通道全勾選、`wfgLaLastEdgeCounts` = I2C 範例殘留（僅 CH0/CH1 有 edge）。

| 案例 | 取樣深度 | 勾選通道 | **實際錄到通道** | 結果 |
|------|----------|----------|------------------|------|
| A（對照：全 16ch 有訊號） | 2 GSa | 16 | CH0–CH15（16 個） | 正常 |
| **B（I2C 殘留）** | **2 GSa** | 16 | **CH0, CH1（2 個）** | **NG ← 重現 Bruce 問題** |
| **C（I2C 殘留）** | **1 GSa** | 16 | CH0–CH15（16 個） | 正常 ← 符合「≤1GSa 正常」 |
| D（I2C 殘留 + Trigger CH5） | 2 GSa | 16 | CH0, CH1, CH5（3 個） | NG（trigger 通道會被加回） |
| E（I2C 殘留） | 5 GSa | 16 | CH0, CH1（2 個） | NG |

**關鍵對照 B vs C**：勾選通道（16）與殘留 edge-count（僅 CH0/CH1）**完全相同**，唯一改變的變數是「取樣深度」，輸出就從 2 通道翻成 16 通道。取樣率自始至終不是這支函式的輸入。→ 與 Bruce 補充 #1（焦點在深度、與取樣率無關）一致。

---

## 3. 根因分析（附檔案／行號）

### 3.1 退化的決策函式 — `wfg.html` 第 4576–4595 行

```js
function wfgLaHardwareCaptureChannels(cfg) {
  cfg = cfg || wfgLaBuildConfig();
  var selected = (cfg.enabledChannels && cfg.enabledChannels.length ? cfg.enabledChannels
                  : [cfg.trigger && cfg.trigger.channel != null ? cfg.trigger.channel : 0]).slice();
  var selectedMap = {};
  selected.forEach(function(ch) { selectedMap[ch] = true; });
  if (selected.length <= 8 || Number(cfg.sampleDepth) <= 1000000000) return selected;   // ← 第 4581 行：門檻
  var picked = {};
  function add(ch) {
    ch = Number(ch);
    if (isFinite(ch) && ch >= 0 && ch < 16 && selectedMap[ch]) picked[ch] = true;
  }
  if (cfg.trigger && cfg.trigger.enabled) add(cfg.trigger.channel);
  for (var i = 0; i < wfgLaLastEdgeCounts.length; i++) {                                  // ← 第 4588 行：用「上次擷取的 edge」
    if (wfgLaLastEdgeCounts[i] > 0) add(i);
  }
  add(selected[0]);
  add(selected[1]);
  var hardware = Object.keys(picked).map(Number).sort(function(a, b) { return a - b; });
  return hardware.length ? hardware : selected;
}
```

- **第 4581 行**：只有當「勾選通道 > 8 **且** 深度 > 1e9（即 ≥2GSa）」才進入下方退化分支；否則（含 ≤1GSa）直接回傳全部勾選通道 → 這就是「≤1GSa 一切正常」的原因。
- **第 4588–4590 行**：退化分支用 `wfgLaLastEdgeCounts`（上一次擷取/載入的各通道 edge 數）挑通道。設計本意應是模擬 LA2016 深記憶體模式下無法同時擷取全部 16 通道的硬體限制，因此「只保留上次真的有訊號的通道」。**但它信任的是『上一次』的狀態，這正是 bug 來源。**

### 3.2 這個遮罩會直接送進硬體 — `wfg.html` 第 8378–8395、12618 行

```js
// 第 12618 行（單次/循環擷取主流程 wfgLaSafeCaptureProbe）
cfg.hardwareChannels = wfgLaHardwareCaptureChannels(cfg);
...
// 第 8381–8390 行（wfgLaSetTriggerConfig）
var hardwareChannels = cfg.hardwareChannels && cfg.hardwareChannels.length ? cfg.hardwareChannels : cfg.enabledChannels;
for (var i = 0; i < hardwareChannels.length; i++) channelMask |= (1 << hardwareChannels[i]);
...
wfgLaPushU32LE(bytes, channelMask >>> 0);   // ← channelMask 寫入 LA2016 REG_TRIGGER
```

→ 退化後的 `hardwareChannels`（只剩 CH0/CH1）變成 `channelMask`，寫進 LA2016。硬體只擷取遮罩內通道，下載/解碼也只處理這些通道 → **實機記錄結果只有 2 通道**。

### 3.3 殘留是怎麼產生並「卡住」的

**(a) 載入 I2C 範例時，`wfgLaLastEdgeCounts` 被設成只有 2 通道 — 第 8631–8632 行**

```js
wfgLaCapturedWaveform = decoded;
wfgLaLastEdgeCounts = decoded.edgeCounts || [];   // ← 第 8632 行
```

I2C 範例快照 `data/la-presets/i2c-measure.snapshot.js` 實測：`enabledChannels:[0,1]`，16 通道中只有 CH0(SDA,69)、CH1(SCL,301) 有 edge，其餘為 0。所以套用後 `wfgLaLastEdgeCounts` 只有 index 0、1 > 0。

**(b) 「切回快捷設定」分支沒有清掉殘留、也沒有重新擷取 — 第 4279… 實際在第 22262–22278 行**

```js
if (!preset) {                       // 選回「快捷設定」(value="")
  ...
  wfgLaSetChannels(16, true);        // ← 第 22274 行：把 16 個 checkbox 全部勾起（畫面顯示 16ch）
  wfgLaUpdateSummary();
  ...
  return;
}
```

這段把畫面恢復成 16 通道（所以「畫面顯示已是 16 通道」屬實），但：

1. **完全沒有重設 `wfgLaLastEdgeCounts`。** 全檔搜尋 `wfgLaLastEdgeCounts` 只有兩處賦值：第 3571 行初始化 `[]`、第 8632 行擷取時設定。**沒有任何地方在切換 preset 時重設它。**
2. **沒有重新跑擷取去重算 16 通道的 edge-count。** 第 22275 行的 `wfgLaUpdateSummary()` 內（第 4642 行）只有在 `!wfgLaCapturedWaveform || wfgLaCapturedWaveform.demo` 時才會重載 demo 重算 edge-count；但此時 `wfgLaCapturedWaveform` 是 I2C 的「真實擷取」(非 demo)，條件不成立 → **不重載、殘留留存。**

> 補充：在「全新載入、沒碰過 I2C」時為什麼 2GSa 正常？因為初始 demo 會在 16 通道全部產生訊號，`wfgLaLastEdgeCounts` 16 個都 >0，退化分支挑出 16 個 → 正常。只有「載過 2 通道的 I2C 範例又切回」這條路徑會把殘留壓成 2 通道。

### 3.4 完整因果鏈

1. 選 I2C 範例 → 第 8632 行把 `wfgLaLastEdgeCounts` 設為「只有 CH0/CH1 >0」。
2. 切回「快捷設定」→ 第 22274 行把 16 個 checkbox 全勾（畫面對的），但**未重設 `wfgLaLastEdgeCounts`、未重擷取**（第 22262–22278、4642 行）。
3. 設 200M（或 100M）+ 深度 ≥2GSa → 單次觸發 → 第 12618 行呼叫 `wfgLaHardwareCaptureChannels`。
4. 第 4581 行條件成立（16ch 且 >1e9）→ 進退化分支 → 第 4588 行用殘留的 `wfgLaLastEdgeCounts` → 只挑出 CH0、CH1。
5. 第 8390 行把這 2 通道組成 `channelMask` 寫入 LA2016 → **實機只錄到 2 通道**。
6. 深度 ≤1GSa：第 4581 行直接 `return selected` → 16 通道全錄 → **正常**。

---

## 4. 建議修正方向（**僅分析，未實作**）

供 Bruce 後續決策，皆未動 code：

- **A. 切回快捷設定時清掉殘留**：在第 22262–22278 的 `if(!preset)` 分支內，把 `wfgLaLastEdgeCounts` 重設為「全 16 通道視為有訊號」或 `[]`，讓退化分支不再沿用 I2C 的 2 通道。
- **B. 退化分支的 fallback 更安全**：第 4588 行那段，當「勾選通道數 > 上次有訊號通道數」時，不應只信任上次 edge-count（過時資料），可改為以「使用者目前勾選」為準（或至少保留勾選的全部，硬體真有限制時再依實際擷取結果調整）。
- **C. 釐清退化分支的必要性**：若 LA2016 深記憶體模式其實能擷取使用者勾選的全部通道，這個「自動縮減通道」的最佳化本身可能就是非必要的退化來源，值得重新檢視是否該觸發。

> ⚠️ 以上方向需先確認 LA2016 在 ≥2GSa 深度下的**實體通道數限制**（硬體是否真的無法同時錄 16ch），再決定採 A/B/C 哪種，避免改了之後撞到真實硬體上限。此點我**無法只靠讀 code 確認**，標為待驗證。

---

## 5. 不確定 / 待進一步驗證之處（誠實標註）

1. **實機實體單次觸發未由我親自執行**：我驗證的是「決定送硬體哪些通道」的部署版函式 + 實際快照資料，對實機結果具決定性；但未遠端按下 Bruce 實機的單次擷取。如需黑箱實機佐證，照第 2.2 表條件實測即可，結果應一致。
2. **LA2016 在 ≥2GSa 是否真有通道數硬體上限**：退化分支的設計動機（深記憶體無法錄滿 16ch）我只從 code 與註解推測，未查 KingstVIS/LA2016 硬體規格證實。修正前需先釐清，否則可能撞真實上限。
3. **遠端分頁渲染器於 I2C「異常範例」快照解碼時凍結**：導致我無法穩定從 DOM 讀回切回後的內部 edge-count 投影（has-signal）。此為環境限制，不影響根因結論（已用實際快照檔資料 + 部署版函式佐證）。

---

---

# 第二部分：退化分支的來歷、壓縮機制、必要性評估（2026-06-03 補查）

> 回應 Bruce 的新方向：退化分支是否是「前一個模型為交差隨便加的、違背真正需求」。
> 仍為唯讀調查，未改任何 code。

## 6. 退化分支的 git 來歷（commit + 理由）

**引入 commit：`a72417e` — "Optimize LA deep capture channel mask"**

| 項目 | 內容 |
|------|------|
| Commit | `a72417e9bb281b09cc67f3585f61cd447f4961cd` |
| 作者 | Bruce Cheng <brucecheng0428@gmail.com>（git 一律以 Bruce 名義 commit，無法從 author 判斷實際是哪個 AI 模型寫的） |
| 日期 | **2026-05-07 13:52:50 +0800** |
| Commit message | 只有一行標題「**Optimize LA deep capture channel mask**」，**完全沒有 body、沒有理由說明、沒有實機驗證依據** |
| 改動檔案 | `index.html`（當時的單體檔，後來才拆出 `wfg.html`），+39 / −4 行 |

`git show a72417e` 的 diff 確認：**整個 `wfgLaHardwareCaptureChannels` 函式（含 `length <= 8 || sampleDepth <= 1000000000` 門檻、`wfgLaLastEdgeCounts` 挑通道邏輯）就是這個 commit 一次加進來的**，同時改了 `wfgLaSetTriggerConfig` 改用 `hardwareChannels` 組 channelMask、`wfgLaSafeCaptureProbe` 呼叫它。

**佐證 Bruce 的懷疑——這確實像「交差式」做法：**

1. **commit message 無理由**：只說「optimize」，沒解釋為何深度高就要砍通道、砍到剩誰、依據什麼硬體限制。
2. **CHANGELOG.md 完全沒有對應條目**：全檔搜尋 `hardwareChannels`／`通道遮罩`／`壓縮`／`channel mask`／`砍通道` 等，CHANGELOG 沒有任何說明這個行為的紀錄（唯一一筆「壓縮」是手機版 RWD，無關）。
3. **沒有實機驗證痕跡**：commit、CHANGELOG、code 註解都沒有任何「LA2016 在 X 深度下實測只能錄 Y 通道」這類量測依據。
4. **註解自相矛盾**：它加的 log 文字寫「Hardware channel mask **optimized for deep compressed capture**」——一邊承認是「壓縮擷取」，一邊卻砍通道。但壓縮擷取的重點正是「靠壓縮塞下深度」，不是「砍通道」。這個理由是牽強的。

> 結論：退化分支是 `a72417e`（2026-05-07）以一行 "optimize" 無理由 commit 加入，無 CHANGELOG、無實機依據，附帶一個自相矛盾的「deep compressed capture」說法。**符合 Bruce 形容的「為交差隨便加 + 附牽強理由」。**

## 7. LA2016 硬體壓縮(RLE)機制與深度處理

### 7.1 UI 文字位置

「**實際長度依硬體壓縮率**」這句在 `common/i18n.js` **第 170 行**：

```js
'wfg.laActualLengthHint': { 'zh-TW': '實際長度依硬體壓縮率',
  'en': 'actual length depends on hardware compression', 'zh-CN': '实际长度依硬体压缩率' },
```

顯示時機由 `wfgLaHasCompressionDurationRisk`（`wfg.html` 第 4562–4567 行）決定：**深度 ≥ 1e9 且理論時間 > 5s** 時，在「理論取樣時間」後面補這句提示（第 4572、4625 行）。

### 7.2 code 怎麼處理壓縮／深度（這是關鍵證據）

LA2016 回傳的是 **RLE（run-length）壓縮封包**，解碼在 `wfgLaDecodeCaptureWaveform`（第 8485–8542 行）與 `wfgLaDecodeCaptureChunk`（第 8428–8444 行）：

```js
var sample = wfgLaReadU16LE(bytes, p);   // ← 每個封包一個「16-bit sample」= 一次取樣全部 16 通道的狀態
var rep    = bytes[p + 2] || 0;          // ← 連續重複次數（RLE run length）
...
totalSamples += rep;                      // 累加還原出真實取樣數
... // sample ^ currentSample 找出哪些 bit(通道)翻轉 → 記 edge
durationSec: totalSamples / effectiveRate
```

**這段 code 透露三件決定性的事：**

1. **每個封包恆為「16-bit sample + 1-byte 重複數」≈ 3 bytes，永遠包含全部 16 通道**。封包大小**與啟用通道數無關**——勾 2 通道或 16 通道，每個封包都是同樣的 16-bit 字。
2. **佔用記憶體的是「封包數」，不是「取樣數」**。`totalSamples`（真實深度）是把所有封包的 `rep` 加總還原出來的。深度 2GSa/10GSa 是「要求的取樣視窗」，能不能塞進 SDRAM 取決於**訊號跳變次數**（跳變越多→封包越多→相同記憶體能容納的真實時間越短）。這正是「實際長度依硬體壓縮率」的意思。
3. 因此 **工具本身早就知道：深度是壓縮後的、可變的，由硬體壓縮率決定**——它甚至為此做了提示文字與 `wfgLaHasCompressionDurationRisk` 判斷。周邊 commit（`03e60e4` Base LA compression warning on duration and depth、`048272d`、`c1c059b` Preserve full LA capture duration、`5644c8e` Read full LA EP6 capture in chunks）也都是圍繞「壓縮深度可變」設計的。

SDRAM 大小：code 第 8408 行用 `128 * 1024 * 1024`（**128 MiB**），與官方規格一致。

## 8. 退化分支到底必不必要？（必要性評估）

### 8.1 LA2016 規格（已查證）

- **16 通道、最高 200MHz 取樣率、128 MiB 取樣記憶體、支援壓縮、大取樣深度。**（sigrok / 廠商頁面，見 Sources）
- 規格上 **16 通道與 200MHz 是同時成立的**，**沒有任何「高取樣率／高深度時通道數要減半」的硬體限制記載**。深度靠壓縮塞進 128 MiB，與通道數無關（封包恆為 16-bit 全通道字）。

### 8.2 評估結論

> 🔴 **本節（純讀 code/規格的推論）部分被第三部分實機修正**：當時推「砍通道唯一作用是間接影響壓縮率、方向全錯」。實機證實 **(1) channelMask 真的讓硬體停採未選通道（非僅工具端）**；**(2) 減通道確實能讓相同 128MiB 錄更久（少跳變→高壓縮）**，所以「高深度要取捨」是真的。正確結論見 §12：bug 在「挑通道的方式（過時 edge counts、靜默、砍到有訊號的通道）」，不在「取捨本身」。以下原推論保留供對照。

**退化分支「>8 通道且 >1GSa 就砍通道」的『挑法』是錯的（但『取捨存在』本身為真）。** 理由：

1. **砍通道對「資料寬度」零幫助**：RLE 封包恆為 16-bit 全通道字（第 8503 行），勾 2 或 16 通道，每封包大小一樣。砍通道**不會**讓每個封包變小。
2. **砍通道唯一的作用是「減少跳變→拉高壓縮率→塞更久」**——但這是用「丟掉使用者要的通道」去換「使用者沒要求的更長時間」，本末倒置。Bruce 的需求正好相反：**要 16 通道全錄，深度交給壓縮**。
3. **門檻是個 magic-number 啟發式（>8、>1e9），不是量測值**：沒有任何實機數據支撐「2GSa 時 16 通道塞不下、必須砍到 8 以下」。
4. 疊加第一部分的 bug，它還用**過時的 `wfgLaLastEdgeCounts`** 挑通道，連「智慧砍」都做不到，會砍掉明明有訊號的通道。

→ **正解方向（與 Bruce 需求一致）**：擷取**所有勾選通道**，深度交給 LA2016 硬體壓縮，實際可錄長度由壓縮率決定（工具已有「實際長度依硬體壓縮率」提示與 `wfgLaHasCompressionDurationRisk` 機制承接）。退化分支應移除或改為「永遠回傳勾選通道」。

### 8.3 「10GSa + 200MHz → 完整錄 50s、16 通道全錄」是否成立？（誠實標註不確定）

- **設定數字本身一致**：10GSa ÷ 200MHz = **50s**，深度下拉也有 10GSa 選項（第 1077–1080 行）。規格層面 16ch@200MHz 合法。
- **能不能真的塞下 50s × 16ch，取決於「真實訊號的跳變密度 vs 128 MiB 封包預算」**——這是壓縮率問題，**我無法只靠讀 code 或規格保證**。若 50s 內 16 通道的總跳變數產生的封包量超過 128 MiB 可容納，硬體會在記憶體滿時停止（實際錄到的時間 < 50s），但**那是「時間被壓縮率截短」，不是「通道被砍」**——而且工具已用「實際長度依硬體壓縮率」如實反映這點。
- ~~**因此：把通道砍掉並不能解決「深度塞不下」的問題**~~ → **此句被實機推翻**：砍通道雖不縮小封包寬度，但**確實減少跳變→拉高壓縮率→相同 128MiB 能錄更久**（§11 Q2c 實證：2 通道達 10s 滿深度、8 通道只到 30.9s）。所以「減通道換時間」是有效的取捨手段，只是退化分支用過時資料、靜默執行、砍到有訊號通道，才是 bug。

> ✅ **此點已於第三部分實機驗證**：10GSa+200MHz+16 通道（8 活躍）跑單次擷取，**實際只錄到 30.9s（未達理論 50s），被 128MiB 截斷**——證實高深度確有記憶體取捨。詳見 §10–§12（並更正先前誤報的 61.8s）。

### 8.4 修正建議（更新，仍未實作）

- **首選**：移除／停用 `wfgLaHardwareCaptureChannels` 的退化分支，讓它永遠回傳 `cfg.enabledChannels`（全勾選通道）。深度交給硬體壓縮，沿用既有「實際長度依壓縮率」提示。
- 若日後確有需求要在記憶體不足時提示，應改為「**全通道擷取 + 記憶體滿時告知實際錄到的時間**」，而非預先砍通道。
- （第一部分的殘留 bug 在移除退化分支後**自動消失**，因為不再依賴 `wfgLaLastEdgeCounts` 來挑通道。）

## 9. 第二部分不確定處（誠實標註）

1. **「哪個模型寫的」無法從 git 證實**：commit author 一律是 Bruce，無法判斷是不是 opus 4.7。我能證實的是 commit `a72417e`（2026-05-07）一行無理由 message、無 CHANGELOG、無實機依據——這部分是事實。
2. **50s/16ch 是否完整不截斷**：取決於真實訊號壓縮率，需實機量測；但不影響「不該砍通道」的結論（見 8.3）。
3. **channelMask 是否讓硬體完全停採未選通道**：~~由 code 推論，標為推論~~ → **已於第三部分用實機量測證實：channelMask 確實會讓 LA2016 停採未選通道（未選通道回傳全平、0 edge），是真實的硬體層資料遺失，非工具端丟棄。**（修正第二部分的保留推論。）

---

# 第三部分：實機實測（2026-06-03，LA2016 已接）

> Bruce 授權實機跑。方法：Chrome MCP 開正式 LA tab，於 **USB transport 層**掛可逆量測（tee EP6 原始 RLE 封包自行解碼 + 攔 `controlTransferOut` 的 channelMask）。**未改原始檔、未 commit**；reload 即還原。
> 因 `wfgLaHardwareCaptureChannels` 是 module-scoped 無法從 console 覆寫，改在 transport 層把送往 LA2016 的 channelMask 改寫成 0xFFFF —— 對硬體的效果與「讓該函式回傳全通道」完全相同。
> 過程曾遇另一個 tcon-tools 分頁 claim 住 LA2016 導致擷取中止；關閉該分頁釋放裝置後，本分頁成功 claim、hardware-ready，兩案例皆**擷取完成**。

> 🔴 **重大更正（2026-06-03 第二輪實機）**：本節**第一版**曾寫「案例2 下載 268MB、實錄 61.8s、16ch@10GSa 完整未截斷」。經 Bruce 抓出「268MB > 128MiB SDRAM」矛盾後重驗，**確認那是錯的**——我的量測 tee **重複累加**了讀取，把數字灌成 2 倍。以下為**用裝置自報 nRepPackets 校正後的正確數據**。

## 10. 兩案例實測數據（同一台 LA2016、200MHz、16 通道全勾；已校正）

| 量測項 | 案例 1：未 override（重現 bug） | 案例 2：override channelMask=0xFFFF |
|--------|-------------------------------|--------------------------------------|
| 取樣深度設定 | 2 GSa（理論 10s） | 10 GSa（理論 50s） |
| 退化分支算出的 mask | **0x3（只 CH0/CH1）** | 0x35f（殘留 8ch；仍砍） |
| **實際送到 LA2016 的 channelMask** | **0x3** | 我 transport 層改寫為 **0xFFFF** |
| **裝置自報 nRepPackets** | — | **41,942,960** → ⌊/5⌋×16 = **128.00 MiB**（SDRAM 填滿） |
| EP6 下載（校正後） | （未截，深度小）| **128.00 MiB**（單一緩衝，非 268MB） |
| 解碼總取樣數 | 2.0 G | **6.18 G** |
| **實際錄到時間長度** | **10.0 s**（達設定深度） | **30.9 s** ←**未達理論 50s，被 128MiB 截斷** |
| **實際錄到有訊號的通道** | **只 CH0、CH1（2 個）** | **CH0,1,2,3,4,6,8,9（8 個）** |
| 各通道 edge 數 | CH0=2408, CH1=2408, 其餘 0 | CH0/1/2≈3.7k, **CH3=8.05M, CH4=8.05M, CH6=8.48M, CH8=8.48M**, CH9≈1.9k, CH5/7/10–15=0 |

## 11. 實測結論（逐題回答 Bruce，已校正）

**Q1：實機重現 bug → 成立（不變）。**
16ch 全勾、200MHz、2GSa、單次觸發，**送硬體 channelMask 實測=0x3**，實機**只錄 CH0、CH1**，其餘全平。是退化分支造成。截圖見「案例1 全覽」。

**Q2：硬體真實能力（override 全通道、10GSa）→ 通道全錄、但深度沒錄滿。**
- (a) **是否全錄**：強制 0xFFFF 後，**所有有訊號的通道都錄到了**（CH0,1,2,3,4,6,8,9）。對照案例1，**CH3/4/6/8 各約 800 萬 edge 的高頻訊號在 bug 下被整個丟掉**——正是你說的「其他通道有訊號卻沒錄到」。
- (b) **實際錄幾秒（更正）**：**只有 ~30.9 秒**，**並未達到 10GSa÷200M 的理論 50s**。裝置自報 nRepPackets=41.94M 換算正好 **128.00 MiB**——SDRAM 在 30.9s 就填滿、擷取截斷。**先前「61.8s 完整錄滿」是錯的**（tee 重複累加導致樣本數與秒數都灌 2 倍）。全覽截圖上工具標「理論 50.0s」，但時間軸實際只展開到 ~30s。
- (c) **封包/壓縮**：8 個活躍通道（含 4 個高頻 ~800 萬跳變）使 128MiB 在 30.9s 填滿。**通道越多→跳變越多→相同 128MiB 能錄的時間越短**——這個取捨是**真實存在**的。

**Q3：channelMask 對硬體的真實作用 → 真的讓硬體少採樣（不變，已實機證實）。**
案例1（0x3）CH2–15 全平；案例2（0xFFFF）同樣的 CH2,3,4,6,8 立刻冒出大量 edge。**同一批實體訊號、只差 mask** → 證明 **LA2016 依 channelMask 決定採不採；未選通道不被採樣**。砍通道是真實、不可回復的資料遺失。**且砍通道確實會拉高壓縮率、讓相同記憶體錄更久**（案例1 的 2 個低頻通道輕鬆達 10s 滿深度；案例2 的 8 通道只到 30.9s）。

## 12. 最終判定（已校正——推翻先前過度樂觀的結論）

1. **退化分支挑通道的方式是 bug**：用過時 `wfgLaLastEdgeCounts`、靜默砍掉使用者勾選且有訊號的高頻通道（案例1證實）。這點不變。
2. **但「高深度要取捨」這件事本身是真的**：128 MiB SDRAM 是硬上限，**通道越多、訊號越密 → 能錄的時間越短**。實機證實 16ch（8 活躍）+10GSa **錄不滿 50s，只到 30.9s**。**先前我說「16ch@10GSa 完整可行」是錯的，正確是：會被記憶體截斷。**
3. **因此正解不是「無腦永遠錄全 16 通道」**：那會在訊號密時把錄製時間砍短、且若靜默發生同樣不好。**正解是「正確且透明的取捨」**：
   - 擷取**使用者目前實際勾選**的通道（不要用過時 edge counts 亂挑）；
   - 記憶體不足時**據實顯示實際錄到的長度**（工具已有「實際長度依硬體壓縮率」機制可承接），而非靜默砍通道；
   - 若要用「減通道換更長時間」當功能，應由使用者明確選擇、且基於當前選擇，不可偷偷砍。
4. Bruce 原始期望「10GSa+200M、16 通道、完整 50s」**在訊號活躍時硬體做不到**（128MiB 限制）；要嘛接受較短實際長度、要嘛減少通道/降頻/降深度換時間。這與你提的「原生 KingstVIS 也做不到 16ch@10GSa@200M 滿錄」一致。

## 13. 第三部分不確定／注意（已校正）

1. **先前 61.8s/268MB 錯誤的根因**：量測 tee 在 EP6 讀取上重複累加（疑似把 probe 讀取或重疊 chunk 也計入），使位元組數與 totalSamples 約灌 2 倍。校正依據＝**裝置自報 nRepPackets=41,942,960**（ctrl-IN 0x20/0x10），換算正好 128.00 MiB，與下載量、解碼封包數三者一致。
2. **「深度↔實際秒數」**：案例1 設 2GSa 實得 10.0s（達標，因 2 低頻通道資料量小）；案例2 設 10GSa 實得 30.9s（未達 50s，被 128MiB 截斷）。確認深度是「目標」、實際長度由壓縮率＋128MiB 決定。
3. CH5,7,10–15 兩案例皆 0 edge：研判面板未接訊號（非被砍），未量物理電平，標為合理推論。
4. 未測：**2 通道 @ 10GSa 能否達滿 50s**（理論上低頻 2 通道資料量小應可接近，可佐證「減通道換時間」）；如需要可再跑。
5. instrumentation 為 transport 層 tee/override，reload 全消，未改原始檔。

---

## 附：本次已操作式確認的事實清單

- [x] 部署版 `wfgLaHardwareCaptureChannels` 原始碼 = 本機分析版（門檻 `length<=8`、`1000000000`、`wfgLaLastEdgeCounts` 三項皆在）。
- [x] 執行部署版該函式：2GSa+I2C殘留 → 回傳 [0,1]；1GSa+同狀態 → 回傳全 16；取樣率非其輸入。
- [x] I2C 範例快照實際資料：`enabledChannels:[0,1]`，僅 CH0/CH1 有 edge（69/301），其餘 14 通道為 0。
- [x] 全檔 `wfgLaLastEdgeCounts` 僅兩處賦值（init `[]`、擷取設定），切 preset 無重設。
- [x] 切回快捷設定分支（22262–22278）只勾回 16 checkbox，未重設殘留、未重擷取。
- [x] 退化分支由 commit `a72417e`（2026-05-07，"Optimize LA deep capture channel mask"）一次引入，無 body／無 CHANGELOG／無實機依據。
- [x] RLE 封包恆為 16-bit 全通道字 + 1-byte 重複數（第 8503–8520 行），封包大小與通道數無關。
- [x] LA2016 規格：16ch @ 200MHz、128 MiB、支援壓縮；無「高深度需砍通道」之硬體限制記載。
- [x] 工具早已知深度為壓縮後可變（i18n.js 170「實際長度依硬體壓縮率」+ wfgLaHasCompressionDurationRisk 4562）。
- [x] **實機**：2GSa 案例 channelMask 實測=0x3，只錄 CH0/CH1（bug 成立）。
- [x] **實機（已校正）**：override channelMask=0xFFFF + 10GSa → 8 個有訊號通道全錄，但**實錄僅 30.9s、被 128MiB 截斷、未達理論 50s**（裝置自報 nRepPackets=41,942,960=128.00MiB 佐證）。
- [x] **實機**：mask 0x3↔0xFFFF 對照證實 channelMask 真的讓 LA2016 停採未選通道（真實資料遺失），並修正第二部分的純 code 推測。
- [x] **更正**：先前回報「268MB / 61.8s 完整錄滿」為量測 tee 重複累加之**錯誤**；正確＝128MiB / 30.9s / 截斷。
- [x] **校正結論**：16ch@10GSa@200M 訊號活躍時**錄不滿 50s**（記憶體上限），「高深度需取捨」屬實；退化分支「挑通道方式」是 bug，但「取捨本身」非全錯——正解為透明且基於當前選擇的取捨，而非靜默亂砍。
