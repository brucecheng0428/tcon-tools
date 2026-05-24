# AUX 解析器 ERR 誤判修復 — 第二輪 Task A：歷史記錄

> 產生日期：2026-05-23
> 聚焦主題：Unparsed AUX activity（195 筆誤判）
> 前置報告：`aux_err_fix_summary.md`（第一輪完整結果）

---

## 一、問題回顧

第一輪修復（v2.97.388~389）消除了全部 832 筆 "Narrow AUX format glitch" 誤判。
剩餘 195 筆 ERR 全部是 "Unparsed AUX activity" 類型，且經第一輪 Task E 確認**全部為誤判**（100% 被正常 REQ/REPLY 夾心）。

根因推論：**STOP detection 缺陷 → 後續 frame 的 SYNC 找不到正確起始點 → 整段 AUX 活動被 `addUnparsedActivityAnomalies()` 標記為 Unparsed**。

本報告深入分析相關程式碼邏輯與歷史脈絡。

---

## 二、STOP Detection 邏輯（wfg.html L11180~11197）

### 2.1 現行 STOP 偵測機制

AUX 解碼器**沒有獨立的 STOP 偵測函式**。STOP 的判定是隱含在 payload byte 讀取迴圈的「下一個 byte 是否存在」檢查中：

```javascript
// L11180~11197 — payload 讀取迴圈尾部
if (!synchronized) break;
frameEnd = (i < edges.length ? edges[i] : lastEdge) + tHalf;
bytes.push(value & 0xff);
bitTimes = bitTimes.concat(byteBitTimes);
i++;
if (i >= edges.length) break;
var stopNext = edges[i];
var stopDist = stopNext - lastEdge;
if (inRange(stopDist, tHalf)) {
  // 半週期 → 可能是 byte 間的 mid-cell transition，繼續讀
  lastEdge = edges[i];
  i++;
  if (i >= edges.length) break;
  stopNext = edges[i];
  stopDist = stopNext - lastEdge;
  if (!inRange(stopDist, tHalf)) synchronized = false;  // ← STOP 點 A
} else if (!inRange(stopDist, 2 * tHalf)) {
  synchronized = false;  // ← STOP 點 B
}
```

**STOP 判定邏輯**：
- 讀完一個 byte 後，檢查下一個 edge 距離
- 如果距離是 `tHalf`：再讀一個 edge，若接下來的距離不是 `tHalf` → STOP（點 A）
- 如果距離不是 `tHalf` 也不是 `2*tHalf` → STOP（點 B）
- 如果距離是 `2*tHalf`：視為 Manchester II 的跨方向 transition，繼續下一個 byte

### 2.2 STOP 後的區域計算

STOP 被偵測後（`synchronized = false`），frame 的 STOP 區域是**純算術計算**的，不是從波形中真正偵測 STOP pattern：

```javascript
// L11206~11207
var stopRegionStart = payloadEndTime;
var stopRegionEnd = stopRegionStart + 4 * auxBitT;  // ← 固定 4 bit-times
```

`lastFrameStopEndSample` 的更新（L11295）：
```javascript
lastFrameStopEndSample = Math.round(stopRegionEnd * sampleRate);
```

### 2.3 STOP Detection 的根本缺陷

**缺陷 1 — 沒有真正偵測 STOP pattern**：DP AUX 協議的 STOP 是一個特定的電平轉換序列（data ends → line goes to idle level）。但現行解碼器只是在 byte 讀取失敗時判定為 STOP，沒有驗證是否符合 STOP pattern。

**缺陷 2 — stopRegionEnd 是估算值**：`stopRegionEnd = payloadEndTime + 4 * auxBitT` 是固定偏移，不反映實際波形中 STOP 結束的位置。如果實際 STOP 較長或有 post-STOP 活動，`lastFrameStopEndSample` 會偏移。

**缺陷 3 — STOP 偵測與 SYNC 偵測的銜接不連續**：當 STOP 判定結束後，edge index `i` 的位置可能不精確。如果 STOP 點落在一個 AUX transaction 的中間（例如因為 timing 容差導致某個 byte 的 edge 被誤判為 STOP），後續的 SYNC 搜尋就會從錯誤的位置開始。

---

## 三、addUnparsedActivityAnomalies() 完整邏輯（wfg.html L10964~11038）

### 3.1 函式概覽

此函式在**所有 frame 和 anomaly 解碼完成後**才執行（L11306），負責掃描波形中被解碼器「漏掉」的活動區段。

### 3.2 參數與門檻值

```javascript
var bitT = (2 * tHalf) / sampleRate;         // 名義 bit period（秒）
var activityGap = Math.max(8 * tHalf, Math.round(sampleRate * bitT * 4));
    // ≈ 4 bit-times 的 sample 數，用來切割活動段
var pad = Math.max(2 * tHalf, Math.round(sampleRate * bitT));
    // ≈ 1 bit-time 的前置 padding
var minEdges = 12;        // 最少 12 個 edge 才算有意義
var minSpan = Math.max(bitT * 12, 8e-6);  // 最短 span ≈ max(12 bit-times, 8μs)
```

**門檻值來源推測**：
- `minEdges = 12`：12 個 edge 足以構成 6 個 Manchester bit-cell（最短有意義的 AUX 片段）
- `minSpan = max(bitT*12, 8μs)`：確保不把極短的雜訊標記為 Unparsed
- 這些門檻值**從未被調整過**，在 v2.97.155 首次引入 anomaly 機制時就是這些值

### 3.3 演算法步驟

**步驟 1 — 建立已覆蓋區域清單**（L10978~10987）：
```javascript
var covered = [];
frames.forEach(function(frame) {
  var start = validNumber(frame.syncStartTime);
  var end = validNumber(frame.endTime);
  if (isFinite(Number(frame.stopRegionEnd)))
    end = Math.max(end, Number(frame.stopRegionEnd));  // ← 包含 STOP 區域
  pushCovered(covered, isFinite(start) ? start : frame.time, end);
});
anomalies.forEach(function(a) {
  pushCovered(covered, a.startTime, a.endTime);   // ← 其他 anomaly 也算覆蓋
});
```

**步驟 2 — 找出活動段（spans）**（L11005~11022）：
- 線性掃描所有 edge，根據 `activityGap` 切割成獨立的活動段
- 每個活動段需滿足：`edgeCount >= minEdges` 且 `endTime - startTime >= minSpan`

**步驟 3 — 找出未覆蓋區域**（L11023~11038）：
- 對每個活動段，用 `uncoveredPieces()` 扣除已被 frames/anomalies 覆蓋的部分
- 剩餘的未覆蓋區域若滿足 `piece.end - piece.start >= minSpan` 且 `lastEdge - firstEdge >= minEdges`
- → 標記為 `"Unparsed AUX activity"` anomaly

### 3.4 關鍵觀察

**為什麼正常 AUX 交易會被標記為 Unparsed？**

根據演算法，只有在 frame 解碼迴圈（L11043~11304）**完全跳過**某段 AUX 活動時，該區段才會被 `addUnparsedActivityAnomalies()` 捕獲。這表示：

1. **SYNC 偵測失敗**：解碼器的 SYNC 搜尋迴圈沒有找到合法的 SYNC preamble
2. **或 SYNC 被錯誤丟棄**：找到了 SYNC 但因為 preGap 等檢查而丟棄
3. **或 edge index 跳過了整段**：前一個 frame 的 STOP 判定結束後，`i` 已經超過了下一個 frame 的 SYNC 起始位置

### 3.5 歷史改動

`addUnparsedActivityAnomalies()` 函式的**核心邏輯從 v2.97.155（2026-05-08）首次引入後從未被修改過**。歷次改動都集中在其他函式（`followsPreviousStop`、`followsTurnAround`、`addShortFormatError` 等），但 Unparsed 的門檻值和演算法本體一直保持原樣。

---

## 四、SYNC Preamble 偵測完整邏輯（wfg.html L11040~11144）

### 4.1 SYNC 搜尋迴圈

```javascript
while (!synchronized && i < edges.length - 1) {
  var edge = edges[i];
  i++;
  var next = edges[i];
  var dist = next - edge;

  if (inRange(dist, tHalf)) {
    // 半週期間距 → 累計 SYNC count
    if (!syncCount) {
      syncFirstEdge = edge;
      syncFirstIndex = i - 1;
    }
    syncCount++;

  } else if (inRange(dist, 5 * tHalf) && syncCount >= 2 * syncBits) {
    // 5 倍半週期（START gap）且 SYNC 數量足夠 → 進入 START 驗證
    // → preGap 分類（見 4.2）
    // → START 時序驗證（見 4.3）

  } else {
    // 其他間距 → 重置 SYNC 計數
    syncCount = 0;
    syncFirstEdge = 0;
    syncFirstIndex = -1;
    startRegionSample = 0;
    pendingPrefixFormatError = null;
  }
}
```

### 4.2 preGap 分類（L11063~11100）

當偵測到 `5*tHalf` 的 START gap 時，檢查 SYNC 前方的間距：

```javascript
var preGap = syncFirstIndex > 0
  ? (edges[syncFirstIndex] - edges[syncFirstIndex - 1])
  : Infinity;

if (preGap < 3 * tHalf) {
  // SYNC 前面有活動（不夠安靜）→ 分四類
  if (followsPreviousStop || followsTurnAround) {
    // 正常 frame 銜接 → 接受
  } else if (preGap <= glitchMax && previousQuiet) {
    // 窄脈衝 glitch → "Narrow AUX format glitch"（已被 v2.97.388~389 修復）
  } else if (preGap > glitchMax && !isHalfRange(preGap) && ...) {
    // 寬 gap format error → "AUX preamble gap format error"
  } else {
    // 其他 → 丟棄此 SYNC 候選，重新搜尋  ← ⚠️ 關鍵丟棄路徑
    syncCount = 0;
    continue;
  }
}
// preGap >= 3*tHalf → 正常，繼續 START 驗證
```

### 4.3 START 時序驗證（L11103~11137）

```javascript
if (bitStateAfterEdge(i) === 0) {
  // 電平正確 → 檢查 START pattern
  dist = next - edge;
  if (inRange(dist, 5 * tHalf)) {
    synchronized = true;  // 標準 START
  } else if (inRange(dist, 4 * tHalf)) {
    synchronized = true;  // 替代 START timing
    // 再讀一個 edge 驗證
  } else {
    addAnomaly(..., 'Invalid START timing', ...);
    syncCount = 0;  // ← START 驗證失敗
  }
} else {
  addAnomaly(..., 'Invalid START level', ...);
  syncCount = 0;  // ← 電平錯誤
}
```

### 4.4 SYNC 辨識失敗的可能情況

**情況 A — SYNC 數量不足**：
- 條件：`syncCount < 2 * syncBits`（預設 syncBits=16，即需要 32 個 half-bit edges）
- 效果：不會觸發 `5*tHalf` 分支，SYNC 候選被忽略
- 可能原因：部分 SYNC edge 的 timing 略超出 `tHalf ± tError` 容差範圍

**情況 B — preGap 導致 SYNC 被丟棄**：
- 條件：`preGap < 3*tHalf` 且不滿足四個分類中的任何一個
- 第四分類（else 分支，L11093~11099）會直接 `continue`，丟棄整個 SYNC 候選
- `precedingHalfRunGapCount(syncFirstIndex - 1) >= 2 * syncBits` 時會進入此分支
- 意味著 SYNC 前方有連續的半週期 edge（看起來像另一段 SYNC），但不被視為 preamble gap error

**情況 C — edge index 已跳過 SYNC**：
- 前一個 frame 的 byte 讀取迴圈或 STOP 判定消耗了 edge，`i` 已經超過下一個 frame 的 SYNC 起始
- 此時 SYNC 搜尋迴圈會從中間開始，可能只看到部分 SYNC edge → `syncCount` 不足
- **這是最可能導致大量 Unparsed 的情況**

**情況 D — START 驗證失敗**：
- SYNC 被正確偵測，但 START 的 `5*tHalf` 或 `4*tHalf` timing 不符
- 產生 "Invalid START timing" anomaly（有獨立的 anomaly 記錄，不會變成 Unparsed）
- 不太可能是 195 筆 Unparsed 的主因

**情況 E — `inRange` 的 else 分支重置**：
- SYNC 累計過程中遇到不是 `tHalf` 也不是 `5*tHalf` 的間距 → 重置 `syncCount`
- 可能原因：STOP 殘餘 edge 被計入 SYNC，造成累計中途中斷

---

## 五、SYNC 與 STOP 的銜接問題

### 5.1 正常銜接流程

正常的 AUX 通訊序列：
```
frame N STOP → idle → frame N+1 SYNC preamble → START → payload → STOP
```

解碼器的處理：
1. frame N 的 STOP 判定結束 → `synchronized = false` → 回到 SYNC 搜尋
2. `lastFrameStopEndSample` 更新為 `stopRegionEnd * sampleRate`
3. 遇到下一段 SYNC preamble → 累計 `syncCount`
4. 到達 `5*tHalf` gap → 檢查 `preGap` → `followsPreviousStop` 或 `followsTurnAround` 通過 → 接受

### 5.2 銜接斷裂的情形

**場景 1 — 前一個 frame STOP 消耗過多 edge**：

如果 STOP 判定不精確（例如 STOP 後的 idle→pre-charge→SYNC 開頭幾個 edge 被 byte 讀取迴圈的「下一個 byte」嘗試消耗掉），edge index `i` 就會跳過下一個 frame 的 SYNC 前幾個 edge。結果：
- 下一個 SYNC 被偵測到時 `syncCount` 不足 → 被丟棄
- 或 `syncFirstIndex` 指向錯誤位置 → `preGap` 計算錯誤

**場景 2 — lastFrameStopEndSample 偏移過大**：

當 frame N 和 frame N+1 之間有一段被跳過的 AUX 活動（例如場景 1 導致中間某個 frame 未被解碼），`lastFrameStopEndSample` 會停留在 frame N 的 STOP 位置，離 frame N+2 的 SYNC 前方 edge 太遠，使 `followsPreviousStop` 和 `followsTurnAround` 都失敗。

**場景 3 — 連鎖效應**：

一旦一個 frame 的 SYNC 辨識失敗，整段 AUX 活動被跳過。下一個 frame 的 `lastFrameStopEndSample` 就會距離太遠，導致它的 preGap 檢查也失敗 → 再次被跳過 → 連鎖反應，直到遇到一個足夠長的 idle gap 讓 SYNC 搜尋重新歸位。

這解釋了為什麼 195 筆中有 149 筆包含 153 個 Unparsed（大量連續 frame 被跳過），而 46 筆只有 1 個 Unparsed（單次偶發）。

---

## 六、syncBits 門檻相關歷史

### 6.1 syncBits 的引入

- **v2.97.216**（`481f9df`, 2026-05-10）：首次引入 `syncBits` 為可調參數
- UI 控件：`<input id="wfg-la-analyzer-syncbits" min="2" max="32" step="1" value="16">`
- 預設值：16（即需要 32 個 half-bit edges 才算合法 SYNC）

### 6.2 syncBits 在解碼中的使用位置

1. **SYNC 數量門檻**（L11062）：`syncCount >= 2 * syncBits` → 才進入 START 驗證
2. **addAnomaly 的門檻**（L10953）：`syncCountBits < syncBits` → 跳過此 anomaly（不夠顯著）
3. **preGap 分類第三項**（L11087）：`precedingHalfRunGapCount < 2 * syncBits` → preamble gap error

### 6.3 syncBits 門檻從未被調整

syncBits = 16 在引入後一直保持預設值不變。DP AUX 規格要求 SYNC preamble 至少 16 bit（32 half-bit edges），所以 16 是規格值。但實測中某些 source/sink 可能產生稍短的 preamble（例如 14 或 15 bit），這些就會被丟棄。

---

## 七、frame 邊界判定相關函式

### 7.1 stopRegionEnd 計算（L11207）

```javascript
var stopRegionEnd = stopRegionStart + 4 * auxBitT;
```

固定 4 bit-times。不考慮實際波形中 STOP 到下一個活動的間距。

### 7.2 lastFrameStopEndSample 更新（L11295）

```javascript
lastFrameStopEndSample = Math.round(stopRegionEnd * sampleRate);
```

只在成功解碼一個完整 frame 後更新。如果中間有 frame 未被解碼，此值不會前進。

### 7.3 wfgLaDpAuxSourceBuildAnomalyRows（L10029~10088）

anomaly 轉 ERR row 時的額外邏輯：
- **span 門檻**：`!a.shortFormatError && span < Math.max(bitT * 12, 1e-6)` → 過濾掉
- **重疊檢查**：與已解碼 frame 重疊 > 55% → 過濾掉
- **合併邏輯**：相鄰 anomaly 間距 ≤ `bitT * 4` → 合併為一筆，value 用 `/` 串接
  - 這就是為什麼 ERR 顯示 "153× Unparsed AUX activity"：153 個獨立 Unparsed 被合併成一筆

---

## 八、第一輪 Task A~E 中相關的觀察

### 8.1 第一輪 Task B 的 Unparsed 特徵分析

| 特徵 | 數值 |
|------|------|
| 持續時間分布 | 62μs (96筆)、70μs (69筆)、78μs (14筆)、87μs (16筆) |
| 出現模式 | 全部被正常 REQ/REPLY 夾心 |
| 與 I2C 重疊 | 0/195 |

四個離散持續時間值暗示 Unparsed 區段內有固定數量的 byte（差距 ≈ 8μs ≈ 8 bit-times ≈ 1 byte），可能對應不同長度的 AUX transaction。

### 8.2 第一輪 Task E 的驗證結論

- 195 筆 ERR 的前一行和後一行 **100% 都是正常 REQ 或 REPLY**
- Unparsed 數量呈兩極分布：149 筆含 153 個 Unparsed、46 筆含 1 個 Unparsed
- 波形顯示正常 AUX 訊號脈衝，不是噪聲或 glitch

---

## 九、綜合結論與修復方向建議

### 9.1 根因鏈

```
STOP 判定不精確（edge index 偏移）
  → 下一個 frame 的 SYNC edge 部分被消耗
    → syncCount 不足 或 preGap 分類失敗
      → SYNC 候選被丟棄
        → frame 未被解碼
          → addUnparsedActivityAnomalies() 標記為 ERR
            → 連鎖效應：lastFrameStopEndSample 不更新 → 更多 frame 失敗
```

### 9.2 可能的修復方向

1. **改善 STOP detection**：
   - 在 byte 讀取迴圈失敗時，精確定位 STOP 結束的 edge，而不是用 `payloadEndTime + 4*auxBitT` 估算
   - 確保 `i` 不會過度前進到下一個 frame 的 SYNC 區域

2. **SYNC 搜尋的容錯**：
   - 當 SYNC 被 preGap 第四分類丟棄時，回退 `i` 到 `syncFirstIndex` 重新搜尋
   - 或放寬 preGap 檢查，允許更多的前導活動情況

3. **addUnparsedActivityAnomalies 後處理**：
   - 類似 v2.97.389 的做法：如果 Unparsed 區段被正常 frame 夾心，降低嚴重性或移除
   - 嘗試用放寬的 syncBits 重新 parse Unparsed 區段

4. **lastFrameStopEndSample 的補充更新**：
   - 在 anomaly 產生時也更新 `lastFrameStopEndSample`，避免連鎖效應

---

*報告產出時間：2026-05-23*
*分析版本：v2.97.389*
*分析範圍：wfg.html L10029~11325*
