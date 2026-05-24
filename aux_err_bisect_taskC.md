# AUX 解析器 ERR 誤判 — 改動追溯報告 (Task C)

## 結論摘要

**我無法確定某個具體 commit 導致 ERR 誤判復現。** 以下是完整的調查過程和發現。

---

## 調查範圍

檢查了 `wfg.html` 最近 50+ 個 commit（從 `4647a36` Phase 5 拆檔至 `2351080` HEAD），
重點追蹤所有 AUX 解碼器相關函式的變動。

## 核心發現：解碼器邏輯自拆檔以來未被修改

AUX 解碼管線由以下函式組成，全部在 `4647a36`（拆檔至 wfg.html）時定型，**之後完全沒有被任何 commit 修改過**：

| 函式 | 功能 | 最後修改 |
|------|------|----------|
| `wfgLaDecodeDpAuxSourceRows` | 主解碼器：edge → frame → row | `4647a36`（僅 `2351080` 加了 `syncBitTimes` 新欄位，未改解碼邏輯） |
| `wfgLaDpAuxValidatePreambleRows` | Preamble 驗證，無效 → ERR | `4647a36` 未改 |
| `wfgLaDpAuxSourceBuildAnomalyRows` | 異常時序 → ERR 行 | `4647a36` 未改 |
| `wfgLaDpAuxAddUncoveredActivityRows` | 未覆蓋活動 → ERR | `4647a36` 未改 |
| `wfgLaDpAuxAddActivityGapErrorRows` | 活動間隙 → ERR | `4647a36` 未改 |
| `wfgLaDpAuxSplitLeadingShortFormatErrorRows` | 短格式錯誤分割 | `4647a36` 未改 |
| `wfgLaDpAuxTrimIdleHighAnomalyRows` | 修剪閒置高電平異常 | `4647a36` 未改 |
| `wfgLaMarkDpAuxPreambleWarnings` | 標記 Preamble 警告 | `4647a36` 未改 |
| `wfgLaMarkDpAuxCommunicationWarnings` | 標記通訊警告 | `4647a36` 未改 |
| `wfgLaNormalizeDpAuxAnomalyRows` | 正規化異常行 | `4647a36` 未改 |
| `wfgLaDpAuxClassifyBytes` | 分類 REQ/REPLY | `4647a36` 未改 |

## 最近改動 wfg.html 的 commit 分析

### commit `2351080`（Manchester II bit 數字對齊）
**這是最可疑的 commit**，但經分析，它改的是渲染層，不是解碼層：

1. **刪除死碼 `wfgLaDpAuxBuildFrameRows`** — 已確認無任何呼叫端（grep 只有定義，沒有調用），刪除不影響功能
2. **新增 `syncBitTimes` 欄位** — 純粹新增屬性到 frame/row 物件，不改變現有的 syncCount / syncStartTime / syncEndTime，不影響 ValidatePreambleRows 的判定
3. **統一渲染函式** — `drawRawBits` / `drawByteBits` / `drawBitValues` → `drawDigitsAtTimes`，這是純視覺渲染，不影響解碼結果
4. **var syncEndSample** — 已檢查無 scope 衝突（同名變數只存在於 nested function 的參數中）

### commit `4a66a1b`（呼吸燈 + 面板寬度）
只改 CSS（`.decode-expanded` grid 比例）和移除 `preset-attention` class 的添加。**無解碼邏輯改動。**

### commit `79a9e61`、`1ea3290`（面板寬度修正）
純 CSS 改動（grid-template-columns）。**無解碼邏輯改動。**

### v2.97.355 ~ v2.97.384（全部）
全部是 UI/CSS/佈局改動（sticky toolbar, 左面板, 解碼面板寬度, 工具列 icon, 設定面板重構等）。**無解碼邏輯改動。**

### v2.97.351 ~ v2.97.354（AUX bit drift 修復系列）
這四個 commit 只改了**渲染端**的 edge-walk 邏輯，用來讓 bit 數字對齊波形 edge：
- `09c039c` v2.97.351: 新增 edge-walk 渲染
- `26e68eb` v2.97.352: 修復 drawBitValues 路徑
- `9aecda8` v2.97.353: 保留 edge-parsed bitTimes
- `705f274` v2.97.354: 移除渲染端 edge-walk（decoder 源頭已修復）

**全部是渲染端改動，不影響 ERR 判定。**

## Preset snapshot 分析

- `edp-aux-anomaly.snapshot.js` 包含預先解碼好的 rows（含 `auxAnomaly: true` 和 `type: 'ERR'`）
- 載入 preset 時走 `wfgLaApplyPresetDecodeResults`，**直接使用 snapshot 的 rows，不經過解碼器**
- Snapshot 檔案自 `1556a81`（v2.97.331）後未修改內容（後續只改 cache buster 版號）

## 可能的解釋

既然解碼器邏輯完全沒變，ERR 誤判可能來自以下原因：

### 假說 1：ERR 一直存在，但之前沒注意到
解碼器的 ERR 判定邏輯（特別是 `wfgLaDpAuxValidatePreambleRows` 和 `wfgLaDpAuxAddActivityGapErrorRows`）可能在特定資料上一直會產生誤判，只是之前關注焦點在其他地方而未發覺。

### 假說 2：渲染變化導致視覺誤解
commit `2351080` 的 `drawDigitsAtTimes` 統一函式改變了 bit 數字的位置計算方式。如果 bit 數字對不準 edge，視覺上可能讓正常的 frame 看起來像是解析錯誤，但實際上解碼表裡的 REQ/REPLY 分類是正確的。

### 假說 3：需要具體重現場景才能判斷
**如果能提供具體是在哪個 preset 或哪個 kvdat 檔案上看到 ERR 誤判，以及「之前正常」是哪個版本的頁面，我可以做更精確的 bisect。**

## 建議下一步

1. **確認 ERR 誤判的具體場景**：是哪個 preset？還是特定 kvdat 檔案？
2. **確認「誤判」是指**：解碼表中的 ERR 行？還是波形上的紅色 overlay？
3. **用 `?debug_la` URL 參數** 開啟頁面，在 console 執行 `wfgLaDebugView()` 查看 rows 的 `auxAnomaly` / `type` / `ack` 欄位
4. 如果能給我「正常」時的版本號，我可以用 git checkout 精確比對

---

*報告日期：2026-05-23*
*調查者：Claude (Task C)*
