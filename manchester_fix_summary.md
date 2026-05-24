# 曼徹斯特編碼 01 對齊問題 — 完整修復報告

## 問題描述

Manchester II 編碼的 bit 數字（0/1）無法精確對齊到波形的正確 edge 位置：
- bit 0 應在 rising edge（L→H 跳變處）
- bit 1 應在 falling edge（H→L 跳變處）

問題在 v2.97.351~354 之間經歷了 4 輪修復又退化，根因是架構性的。

---

## Task A：歷史記錄

### 相關 commit 時間線

| 日期 | Commit | 版本 | 內容 |
|------|--------|------|------|
| 05-17 | `f6344f8` | — | `drawByteBits` 加入 snap-to-edge |
| 05-17 | `93cb724` | — | 改進 snap 方向過濾（rising/falling） |
| 05-17 | `0dfab4b` | — | 重寫為 `buildDpAuxFallbackTimes()` + configuredBitRate |
| 05-20 | `1c471a9` | v2.97.350 | 修正 textAlign/textBaseline |
| 05-21 | `09c039c` | v2.97.351 | `drawByteBits` 加入 edge-walk（消除累積漂移） |
| 05-21 | `26e68eb` | v2.97.352 | `drawBitValues` 也加入 edge-walk（實際繪製路徑） |
| 05-21 | `9aecda8` | v2.97.353 | decoder 端保留 edge-parsed bitTimes 不被算術覆蓋 |
| 05-21 | `705f274` | v2.97.354 | **移除所有渲染端 edge-walk（75 行），問題重現** |

詳見 `manchester_history_taskA.md`。

---

## Task B：本次改動調查

**主因**：commit `705f274` (v2.97.354) 以「decoder 源頭已修復」為由，將 `drawBitValues` 和 `drawByteBits` 中的 edge-walk 邏輯全部刪除，回退到依賴 decoder 提供的 `bitTimes` 或算術定位。

**次因**：SYNC 區域的 `drawRawBits` 從未有過 edge-walk，一直使用純算術定位 `t0 + (i+0.5)*bitT`。

詳見 `manchester_cause_taskB.md`。

---

## Task C：根因分析

問題反覆出現的**結構性原因**：

1. **三條繪製路徑各自獨立**：`drawRawBits`（SYNC）、`drawByteBits`（payload fallback）、`drawBitValues`（payload 主路徑）做幾乎相同的事但各自計算位置，修一漏二。
2. **bitTimes 語義未文件化**：edge parser 產生的是 mid-cell transition 時間，Manchester validator 產生的是算術 mid-cell 時間，死碼 `applyTiming` 又做 `+bitT/2`，寫程式的人不確定 bitTimes 代表什麼。
3. **SYNC 被視為「不需要修」**：v2.97.351/352 修 edge-walk 時只關注 payload，完全沒考慮 SYNC。
4. **渲染端補丁 vs decoder 端修正的拉鋸**：v2.97.354 移除渲染端補丁但沒有整體重新設計。

詳見 `manchester_analysis_taskC.md`。

---

## Task D：修復內容

### Commit `2351080` — 修復 Manchester II bit 數字對齊

**改動統計**：109 行新增、150 行刪除，全部在 `wfg.html`。

### 具體修改

#### 1. 統一繪製函式 `drawDigitsAtTimes`

取代了 `drawRawBits`、`drawByteBits`、`drawBitValues` 三個獨立函式，統一為一個：

```javascript
function drawDigitsAtTimes(digits, times, yText, fallbackStart, fallbackBitT, skipRanges) {
    // digits[i] = 要畫的數字
    // times[i] = edge-based 精確時間（優先）
    // fallback: fallbackStart + (i+0.5) * fallbackBitT（算術）
}
```

所有區域（SYNC / PAYLOAD）都透過此函式繪製，不再各自實作。

#### 2. Decoder 端產生 `syncBitTimes`

在 `wfgLaDecodeDpAuxSourceRows` 中新增 edge-walk 邏輯，為 SYNC 區域產生 edge-based bit times：

```javascript
var syncBitTimes = [];
if (syncCountBits > 0 && syncFirstIndex >= 0) {
    for (var sei = syncFirstIndex; sei < edges.length && syncBitTimes.length < syncCountBits; sei++) {
        if (edges[sei] > syncEndSample + tError) break;
        // rising edge = afterState is 1 → mid-cell transition for bit 0
        if (((initial + sei + 1) & 1) === 1) {
            syncBitTimes.push(edges[sei] / sampleRate);
        }
    }
}
```

#### 3. Row builder 傳遞 `syncBitTimes`

```javascript
row.syncBitTimes = frame.syncBitTimes ? frame.syncBitTimes.slice() : [];
```

#### 4. 刪除死碼 `wfgLaDpAuxBuildFrameRows`

80 行死碼（無任何呼叫端），內含語義錯誤的 `applyTiming` (bitTimes + bitT/2)。

#### 5. 防護機制

- **Runtime drift guard**：如果 `times[i]` 和算術預期值偏差超過 0.4×bitT，發出 `console.warn`
- **醒目警告註解**：在 `manchesterBitFromTransition` 和 `drawDigitsAtTimes` 前各加入完整的規則說明和相關函式清單
- **bitTimes 語義文件化**：明確定義 bitTimes = mid-cell transition 時間（秒）

#### 6. `bytesToDigitsAndTimes` helper

將 `drawByteBits` 的 rawBytes 展開邏輯改為 helper 函式，輸出 `{digits, times}` 格式供 `drawDigitsAtTimes` 使用。

---

## Task E：驗證結果

### 程式碼審查

- Manchester II 規則正確：bit 0 = rising (L→H), bit 1 = falling (H→L) ✓
- `drawDigitsAtTimes` 統一函式邏輯正確 ✓
- SYNC `syncBitTimes` edge-walk 邏輯正確（走訪 rising edges） ✓
- 死碼已刪除（附說明註解） ✓
- 防護機制完備（drift guard + 警告註解） ✓
- 無誤動不相關程式碼（259 行改動全部與 Manchester 對齊相關） ✓

### 視覺驗證（本地 + 線上）

**本地驗證** (`localhost:8765/wfg.html#la`, I2C+AUX 異常範例 preset)：

- SYNC 區域：所有 "0" 精確對齊在 rising edge（L→H 跳變處） ✓
- DATA 區域："0" 在 rising edge、"1" 在 falling edge ✓
- 截圖 ID：ss_67870f6tv（全景）、ss_49575cw5d（SYNC zoom）、ss_7204v7t9f（DATA 0→1 過渡 zoom）

**線上驗證** (`brucecheng0428.github.io/tcon-tools/wfg.html#wfg-la`)：

- v2.97.387 正確載入
- SYNC 和 DATA 區域的 bit 數字對齊均正確 ✓
- 截圖 ID：ss_5200qxl2q（全景）、ss_8416d474v（SYNC zoom）、ss_02272jx46（DATA zoom）

### 部署

- Git push 成功：`1ea3290..2351080 main → main`
- GitHub Pages 已生效

---

## 防護機制清單

| # | 防護機制 | 位置 | 防護什麼 |
|---|---------|------|---------|
| 1 | **統一繪製函式** `drawDigitsAtTimes` | L12279 | 防止三條路徑各自計算位置、修一漏二 |
| 2 | **SYNC edge-based bitTimes** `syncBitTimes` | decoder L11243 | 防止 SYNC 區域純算術累積漂移 |
| 3 | **Runtime drift guard** | `drawDigitsAtTimes` 內 | 偵測 bitTimes 語義錯誤或 edge-walk 故障 |
| 4 | **醒目警告註解** | `manchesterBitFromTransition` 前 + `drawDigitsAtTimes` 前 | 修改前必讀，列出所有相關函式清單 |
| 5 | **bitTimes 語義文件化** | decoder L11230 | 明確定義 bitTimes = mid-cell transition 時間 |
| 6 | **刪除死碼** `wfgLaDpAuxBuildFrameRows` | L9774 | 消除含有 `+bitT/2` 語義錯誤的潛在炸彈 |
| 7 | **相關函式清單** | 註解中 | 改一個必須檢查所有：manchesterBitFromTransition、drawDigitsAtTimes、buildSyncBitTimes、wfgLaDpAuxSourceBuildRow |

---

## 若需要再跑一輪

如果後續又發現 bit 對齊問題：

1. **先讀本報告**，了解架構和歷史
2. **檢查 `drawDigitsAtTimes` 是否仍是唯一繪製入口**——如果有人新增了其他繪製函式，那就是問題來源
3. **檢查 console 有無 drift guard 警告**——`[Manchester drift guard]` 開頭的 warn
4. **檢查 decoder 端的 `syncBitTimes` 和 `bitTimes` 是否被覆蓋**——搜尋 `bitTimes =` 和 `syncBitTimes =`
5. **確認 `manchesterBitFromTransition` 的規則沒被改動**——bit 0 = rising, bit 1 = falling
6. **重跑 Task A~E 流程**：
   - A: `git log --oneline --all -- wfg.html | head -30` 看最近改動
   - B: `git diff <last-known-good>..<current>` 找出什麼改了
   - C: 分析根因（是否又出現多條繪製路徑？）
   - D: 修復（確保只有一條繪製路徑）
   - E: 本報告同樣的驗證流程
