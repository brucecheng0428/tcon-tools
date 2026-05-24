# 曼徹斯特編碼 01 對齊問題 — 歷史調查報告

## 曼徹斯特 II 編碼規則

- **bit 0** = 正緣（rising edge, L→H transition at mid-cell）
- **bit 1** = 負緣（falling edge, H→L transition at mid-cell）

程式碼中的定義（`manchesterBitFromTransition` 函式，目前位於 wfg.html L10886）：
```js
if (beforeLevel === 0 && afterLevel === 1) return 0;  // rising → 0
if (beforeLevel === 1 && afterLevel === 0) return 1;  // falling → 1
```

---

## 相關改動時間線

### 1. 初版：AUX 波形 Manchester II 功能新增
- **Commit**: `9d955e5`
- **日期**: 2026-04-19
- **版本**: 主頁 v1.17.0 + 子頁 v1.4.0
- **內容**: 新增 AUX 波形（Manchester II）功能到 AUX 子頁（index.html 的 page-aux），使用 **SVG** 渲染。
- **觸發**: 功能新增（非 bug 修復）
- **實作**: SVG 路徑繪製，bit 1 = H→L 跳變，bit 0 = L→H 跳變，每 bit = 1μs。這是 AUX 子頁的靜態波形展示工具，與 LA tab 的即時波形分析不同。
- **與目前 bug 的關係**: 無直接關係。此 SVG 實作位於 AUX 子頁，不是 LA tab 的 Canvas 渲染。

### 2. LA AUX 解碼器建立（Codex 時期）
- **Commit 範圍**: v2.97.20 ~ v2.97.215（約 144 commits by Codex, 2026-05-05 ~ 2026-05-10）
- **內容**: 建立 LA Logic Analyzer 的 DP AUX 解碼器，核心函式包括：
  - `wfgLaDecodeDpAuxSourceRows`：邊緣解析器，逐 edge 解碼 Manchester 位元
  - `decodeManchesterBitsInRange`：Manchester 驗證器，用算術方式（`startTime + mbi * bitT`）取樣
  - `drawByteBits`：在 Canvas 上繪製已解碼的 byte 位元數字
  - `drawBitValues`：在 Canvas 上繪製位元陣列數字
  - `drawRawBits`：在 Canvas 上繪製原始位元（用於 SYNC 區域）
- **bitTimes 來源**:
  - **邊緣解析器**（L11212）: `byteBitTimes.push(lastEdge / sampleRate)` — 記錄的是 **edge 本身的時間**（mid-cell transition 時間點）
  - **Manchester 驗證器**（L10933）: `bitTimes.push(t0 + bitT * 0.5)` — 記錄的是 **bit cell 的中點**

### 3. AUX fallback bits snap to edges
- **Commit**: `f6344f8`
- **日期**: 2026-05-17
- **版本**: 未標明（wfg.html 改動）
- **觸發**: AUX bit 數字位置不準確
- **修復方法**: 在 `drawByteBits` 中加入 `snapDpAuxBitTime()` — 用最近鄰搜尋將算術位置 snap 到最近的 waveform edge
- **問題**: 只 snap 到最近的 edge，不區分 rising/falling，可能 snap 到錯誤的 edge

### 4. AUX fallback bits match edge direction
- **Commit**: `93cb724`
- **日期**: 2026-05-17
- **版本**: 未標明
- **觸發**: 前一版 snap 可能匹配到方向錯誤的 edge
- **修復方法**: 改進 `snapDpAuxBitTime(t, bitVal)` — 新增 `desired = bitVal ? 'falling' : 'rising'` 方向過濾，搜尋附近 ±3 個 edge 中方向正確且最近的
- **問題**: 搜尋窗口 ±3 太小？或在 SYNC 區域效果不好？

### 5. AUX fallback bits match configured period
- **Commit**: `0dfab4b`
- **日期**: 2026-05-17
- **版本**: 未標明
- **觸發**: 前兩版仍有問題
- **修復方法**: 重寫為 `buildDpAuxFallbackTimes()` 查表方式 + 加入 `configuredBitRate` 覆蓋（使用者設定的 bit rate 優先於測量值）
- **重大改動**: 引入了 `configuredBitRate` override 邏輯到 `drawByteBits`

### 6. Restore AUX preset ERR overlay metadata
- **Commit**: `1556a81`
- **日期**: 2026-05-17
- **內容**: 大量 preset snapshot 資料修復，非直接 bit 位置問題

### 7. fix AUX encoded digit positions — textAlign/textBaseline
- **Commit**: `1c471a9`
- **日期**: 2026-05-20
- **版本**: v2.97.350
- **觸發**: 位元數字的 Canvas 渲染位置偏移
- **修復方法**: 在 `drawRawBits`、`drawByteBits`（的 fallback 路徑）、`drawBitValues` 三個函式中加入 `ctx.textAlign = 'center'` 和 `ctx.textBaseline = 'middle'`
- **根因**: 之前沒有明確設定 textAlign/textBaseline，依賴 Canvas 預設值（`start` / `alphabetic`），導致文字位置偏移

### 8. ⭐ AUX bit digit edge-walk — fix cumulative drift（drawByteBits）
- **Commit**: `09c039c`
- **日期**: 2026-05-21
- **版本**: v2.97.351
- **觸發**: bit 數字隨著位數增加越來越偏離波形 edge（累積漂移）
- **修復方法**: 在 `drawByteBits` 的 `buildDpAuxFallbackTimes()` 中，將「搜尋窗口 + 容忍度」方式改為**順序 edge-walk**：
  - 從 payload 起始處開始，逐一遍歷 edge
  - 每個 bit 直接綁定到其 **mid-cell transition edge**
  - Manchester: bit 0 = rising edge, bit 1 = falling edge
  - 遇到 boundary transition（相鄰同值 bit 之間的邊界）則跳過
  - 完全消除算術累積漂移
- **同時修正**: `configuredBitRate` override 只在沒有 measured `baseBitT` 時才生效
- **問題**: **只修了 `drawByteBits`，沒修 `drawBitValues`**

### 9. ⭐ fix AUX bit drift in drawBitValues（the ACTUAL code path）
- **Commit**: `26e68eb`
- **日期**: 2026-05-21
- **版本**: v2.97.352
- **觸發**: 發現 v2.97.351 只修了 `drawByteBits` 但實際解碼後的 row 走的是 `drawBitValues`（因為 `row.bits` 有值），所以漂移問題還在
- **修復方法**: 在 `drawBitValues` 中新增完整的 edge-walk 邏輯：
  - 讀取 waveform edges
  - 順序遍歷，每個 bit 直接對應 mid-cell transition edge
  - 結果存入 `auxEdgeTimes[]`
  - 繪製時優先用 `auxEdgeTimes`，fallback 到 `times[bvi]`
- **Commit message 明確指出**: *"v2.97.351 only fixed drawByteBits but active decoder rows go through drawBitValues"*

### 10. ⭐ fix AUX bitTimes override — preserve edge-parsed precise bitTimes
- **Commit**: `9aecda8`
- **日期**: 2026-05-21
- **版本**: v2.97.353
- **觸發**: 發現 decoder 源頭的問題 — commit `4aa8298` 加的 `bitTimes = sampledPayload.bitTimes.slice(0, expectedBits)` 無條件把邊緣解析器產生的精確 bitTimes 覆蓋成 Manchester 驗證器的算術 bitTimes
- **修復方法**: 改為條件判斷：
  ```js
  if (edgeParsedPayload) {
    bitTimes = bitTimes.slice(0, expectedBits);  // 保留邊緣解析器的精確時間
  } else {
    bitTimes = sampledPayload.bitTimes.slice(0, expectedBits);  // 回退到算術時間
  }
  ```
- **保留**: drawBitValues 的 edge-walk 作為 defense in depth

---

## 問題是否反覆出現？

**是的，同一個核心問題至少出現了 4 輪修復**：

| 輪次 | 日期 | Commits | 問題描述 | 修復位置 |
|------|------|---------|----------|----------|
| 第 1 輪 | 05-17 | f6344f8, 93cb724, 0dfab4b | bit 數字和波形 edge 不對齊 | `drawByteBits` (snap to edge) |
| 第 2 輪 | 05-20 | 1c471a9 | 數字繪製位置偏移（textAlign） | `drawRawBits`, `drawByteBits`, `drawBitValues` |
| 第 3 輪 | 05-21 | 09c039c, 26e68eb | 累積漂移（算術 bitT 不精確） | `drawByteBits` → 再修 `drawBitValues` |
| 第 4 輪 | 05-21 | 9aecda8 | decoder 源頭 bitTimes 被覆蓋 | `wfgLaDecodeDpAuxSourceRows` |

**反覆出現的根本原因**：

1. **三條繪製路徑並存**：`drawRawBits`（SYNC 區域）、`drawByteBits`（fallback byte 渲染）、`drawBitValues`（主要 bit 渲染）。修一個容易漏另一個。
2. **bitTimes 雙重來源混淆**：邊緣解析器產生的 bitTimes 是 edge 時間本身，Manchester 驗證器產生的是 bit cell 中點。在 `applyTiming`（L9789）還會再加 `bitT / 2`。如果 bitTimes 已經是 edge 時間，再加半個 bitT 就會推到 cell 尾部。
3. **SYNC 區域特別脆弱**：`drawRawBits` 使用純算術定位 `t0 + (dbi + 0.5) * drawBitT`，沒有任何 edge-walk 修正。

---

## 目前程式碼架構分析

### bitTimes 的資料流

```
wfgLaDecodeDpAuxSourceRows (decoder)
  ├─ 邊緣解析器: byteBitTimes.push(lastEdge / sampleRate)  ← edge 時間
  ├─ decodeManchesterBitsInRange: bitTimes.push(t0 + bitT * 0.5)  ← cell 中點
  │
  ├─ v2.97.353 修正: edgeParsedPayload ? 保留邊緣時間 : 用算術時間
  │
  └─ frame.bitTimes = bitTimes
       │
       ├─ wfgLaDecodeDpAuxFrames → applyTiming:
       │   row.bitTimes = frame.bitTimes.map(t => t + bitT / 2)  ← 再加半個 bitT!
       │
       └─ overlay renderer:
           ├─ drawBitValues(row.bits, row.bitTimes, ...)
           │   └─ v2.97.352: edge-walk 補償（auxEdgeTimes）
           ├─ drawByteBits(row.raw, row.bitTimes, ...)
           │   └─ v2.97.351: edge-walk 補償（dpAuxFallbackTimes）
           └─ drawRawBits(syncStart, fill(0), ...)  ← 純算術，無補償!
```

### SYNC 區域的特殊問題

`drawRawBits` 被呼叫於 SYNC 區域（L12475）：
```js
drawRawBits(syncStart, Array(Math.min(256, Number(row.syncCount) || 0)).fill(0), centerY, bitT, auxAnomalyRanges);
```

- 所有 SYNC bit 硬編碼為 0
- 定位方式: `t0 + (dbi + 0.5) * drawBitT` — 純算術
- **沒有 edge-walk 補償**
- 如果 `bitT` 與實際波形有微小誤差，在大量 SYNC bit（通常有 16+ 個）後會產生可見的累積漂移

---

## 關鍵疑問（待 Task B 調查）

1. **`applyTiming` 的 `+ bitT / 2` 是否正確？** — 如果邊緣解析器的 bitTimes 已經是 mid-cell edge 時間，再加半個 bitT 會把數字推到 cell 尾部。v2.97.352 的 edge-walk 是在 drawBitValues 裡重新計算來「修正」這個問題，但源頭的偏移可能才是根因。

2. **SYNC 區域的 `drawRawBits` 為何沒有 edge-walk？** — 前面修了 drawByteBits 和 drawBitValues，但 drawRawBits（SYNC 區域）完全沒改。

3. **I2C+AUX 範例的 SYNC 錯位** — 如果是 I2C+AUX preset，SYNC 區域的 bit 數量和 bitT 可能與實際 edge 差距更大。

---

## 相關 Memory 記錄

- `project_codex_handoff_v297.md`：記載了 `wfgLaDecodeDpAuxSourceRows`（Manchester 編碼）→ `wfgLaDecodeDpAuxFrames` 的架構關係
- 專案 CLAUDE.md：不存在（專案根目錄無此檔案）
- 無 `feedback_aux_bit_position_edge_walk.md` 記錄
