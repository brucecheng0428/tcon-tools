# AUX 解析器 ERR 誤判分析報告

## 概覽

在 I2C+AUX(異常範例) 快捷範例中，共 2496 筆 DP AUX 解碼結果，其中 **1027 筆被標記為 ERR**（佔 41.1%）。

ERR 分為兩類：

| 類型 | 數量 | 持續時間 | 判定 |
|------|------|----------|------|
| Narrow AUX format glitch | 832 | 190~220 ns | **全部誤判** |
| Unparsed AUX activity | 195 | 61~87 μs | **待確認（可能部分誤判）** |

---

## 第一類：Narrow AUX format glitch（832 筆，全部誤判）

### #1913 封包具體分析

- **時間**：44.35739886s ~ 44.35739907s（持續 21 ns）
- **前一封包**：#1910 ERR (Narrow glitch) → #1911 REPLY (TCON ACK) → #1912 REQ (SYS DPCD RD)
- **後一封包**：#1914 REPLY (TCON ACK)
- **判定值**：`Narrow AUX format glitch`
- **實際情況**：#1913 的 `endTime` (44.35739907s) **完全等於** #1914 REPLY 的 `syncStartTime`，代表這個「glitch」其實是 REPLY preamble 的第一個 edge

### 觸發的程式碼路徑

位於 `wfgLaDecodeDpAuxSourceRows()` 的 SYNC 偵測迴圈（wfg.html 約第 11043~11128 行）：

```
步驟 1：decoder 累積 syncCount >= 32 個 tHalf 間距的 edge（合法 SYNC preamble）
步驟 2：偵測到 5*tHalf 間距（START condition）
步驟 3：檢查 preGap = edges[syncFirstIndex] - edges[syncFirstIndex - 1]
步驟 4：preGap (200ns) < 3*tHalf (1500ns) → 進入 prefix 檢查分支
步驟 5：計算 glitchMax = tHalf * 0.5 = 250ns
步驟 6：preGap (200ns) <= glitchMax (250ns) → 判定為 "Narrow AUX format glitch"
步驟 7：檢查 followsPreviousStop → FAIL（因為上一個 frame 的 stopRegionEnd 距離太遠）
步驟 8：產生 pendingPrefixFormatError，後續在成功 parse frame 後透過 addShortFormatError() 寫入 anomalies
```

### 誤判根因

**`edges[syncFirstIndex - 1]` 不是外來 glitch，而是 REPLY 方向切換時的正常 pre-charge edge。**

DP AUX 協定中，REQ→REPLY 的方向切換（turn-around）流程：
1. Source 發送 REQ 的 STOP（line 維持 HIGH ≥ 2 bit times）
2. Sink 開始驅動 line → **先拉 LOW（pre-charge）再放開**
3. Sink 開始 SYNC preamble（alternating edges at tHalf 間距）

`edges[syncFirstIndex - 1]` 就是步驟 2 中 pre-charge 結束時的 transition edge。decoder 把這個 edge 誤認為不屬於任何 frame 的「glitch」。

**`followsPreviousStop` 為何沒有攔截？**

```javascript
var followsPreviousStop = isFinite(lastFrameStopEndSample)
    && edges[syncFirstIndex - 1] <= lastFrameStopEndSample + tError
    && edges[syncFirstIndex] >= lastFrameStopEndSample - tError;
```

這個條件要求 `edges[syncFirstIndex - 1]` 要在前一個 frame 的 `lastFrameStopEndSample ± tError` 範圍內。但實測中，REQ 的 STOP 結束到 REPLY 的 pre-charge edge 之間有 17.6~82 μs 的間隔（turn-around time），遠超 `tError`（~125ns），所以 `followsPreviousStop` 永遠回傳 false。

### 統計驗證

- 所有 832 筆 Narrow glitch 的 `endTime` **完全等於**下一筆 row 的 `syncStartTime`（驗證結果：832/832 = 100%）
- 持續時間統一在 190~220 ns（中位數 210 ns），符合 pre-charge pulse 特徵
- 637 筆出現在 `REQ → ERR → REPLY` 模式（佔 76.6%），其餘出現在包含 Unparsed activity 的序列中

---

## 第二類：Unparsed AUX activity（195 筆，需進一步確認）

### 特徵

- 持續時間分布：62μs (96筆)、70μs (69筆)、78μs (14筆)、87μs (16筆)
- 出現模式：
  - `REPLY → Unparsed → ERR(Narrow glitch)`：154 筆
  - `REQ → Unparsed → ERR(Narrow glitch)`：41 筆
- 與 I2C 交易**無重疊**（0/195）

### 產生機制

在 `addUnparsedActivityAnomalies()` 函式中產生（wfg.html 約第 10956~11031 行）：
1. 掃描所有 edge，找出未被 frames/anomalies 覆蓋的活動區段
2. 要求至少 12 個 edge 且 span ≥ 12 bit times
3. 符合條件的區段被標記為 "Unparsed AUX activity"

### 可能原因

這些 61~87μs 的活動區段可能是：
1. **TCON 側的 AUX transaction**（sink-originated），但 preamble 長度或 timing 不符合 decoder 預期
2. **AUX DEFER 後的重試**，timing 偏移導致 SYNC detection 失敗
3. **真正的異常信號**（較少可能，因為持續時間一致性高）

考量到這些區段持續時間穩定（四個離散值），且都出現在已知的 REQ/REPLY 通訊間隙中，**大概率也是誤判**——它們是合法的 AUX transaction，但因為某些 timing 特徵（如 preamble bit 數不同、bit rate 微偏）而未被正確 parse。

---

## 誤判案例清單

### Narrow AUX format glitch（832 筆，全部誤判）

全部 832 筆模式一致：

| 封包範圍 | 時間範圍 | 正確判定 |
|----------|----------|----------|
| #2 ~ #3973 | 95.89ms ~ 99.843s | 應忽略或標記為 "turn-around pre-charge" |

代表性案例：
- **#2** (95.89ms)：第一筆 ERR，REQ#1 → **ERR#2** → REPLY#3
- **#1913** (42.358s)：REQ#1912 → **ERR#1913** → REPLY#1914
- **#1964** (44.962s)：Unparsed#1963 → **ERR#1964** → REPLY#1965

### Unparsed AUX activity（195 筆，高度懷疑誤判）

| 封包範圍 | 時間範圍 | 持續時間 |
|----------|----------|----------|
| #7 ~ #3970 | 108.9ms ~ 99.838s | 62~87 μs |

---

## 正確判定結果應該是什麼

### Narrow AUX format glitch → 應消除

這 832 筆 ERR 代表的是 DP AUX 協定中 REQ→REPLY turn-around 的正常 pre-charge edge，**不是格式錯誤**。正確做法：

1. **方案 A（推薦）**：擴大 `followsPreviousStop` 的容忍範圍，或新增一個 `followsTurnAround` 條件，當 `preGap <= glitchMax` 且下一個 row 是合法 REPLY 時，不產生 ERR
2. **方案 B**：在 `pendingPrefixFormatError` 邏輯中，若 preGap 的 edge 實際上是下一個 SYNC preamble 的前導 edge（可透過檢查 `edges[syncFirstIndex]` 是否與 SYNC 第一個 edge 一致來判斷），直接跳過

### Unparsed AUX activity → 需更仔細判斷

這 195 筆可能需要：
1. 嘗試用不同的 SYNC bits 門檻重新 parse
2. 或標記為 "Unrecognized AUX activity"（比 "ERR" 嚴重程度低）

---

## 共同模式歸納

| 模式 | 根因 | 影響 |
|------|------|------|
| pre-charge edge 被誤判為 glitch | `followsPreviousStop` 容忍範圍太小（~125ns vs 實際 17~82μs turn-around） | 832 筆假 ERR |
| 合法 AUX activity 未被 parse | SYNC detection 對 timing 要求過嚴 | 195 筆假 ERR |
| ERR 數量膨脹 | 兩類誤判在 REQ/REPLY 交替中反覆出現 | 1027 筆 ERR 中估計 >95% 為誤判 |
