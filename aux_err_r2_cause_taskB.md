# AUX 解析器 ERR 誤判分析報告 — 第二輪 Task B

## 概覽

第一輪修復（v2.97.388~389）消除了 832 筆 "Narrow AUX format glitch" 誤判後，剩餘 **195 筆 ERR**。本報告分析這 195 筆 ERR 的根因、觸發的程式碼路徑、以及可執行的修復方案。

| 類型 | 數量 | ERR 內容 | 根因 |
|------|------|----------|------|
| Type 1：Invalid START timing | 149 | "Invalid START timing / 16 SYNCs / 153× Unparsed AUX activity" | START 驗證的 dead zone |
| Type 2：純 Unparsed | 46 | "Unparsed AUX activity" | preGap discard 邏輯誤殺 |

**判定：195 筆全部為誤判。** 100% 被正常 REQ/REPLY frame 夾心，前後鄰居均為 syncCount=31、auxBitT=1004ns 的正常 frame。

---

## 規範基礎

### Preamble 結構（DP AUX 規範，引用自 aux.html）

```
┌─────────────────────┬──────────────────┬──────────────────┐
│    Pre-charge        │      SYNC        │   AUX 交易資料    │
│   (10~16 個 0)       │  (8 或 16 個 0)   │                  │
└─────────────────────┴──────────────────┴──────────────────┘
```

| 規格 | Pre-charge | SYNC | Preamble 最少連續 0 |
|------|-----------|------|-------------------|
| DP / eDP 1.2~1.3 | 10~16 個 0 | 16 個 0 | **26 個** |
| eDP 1.4+ | 10~16 個 0 | 8 個 0 | **18 個** |

接收端無法區分 Pre-charge 和 SYNC，兩者在 Manchester-II 編碼中都是連續的 0。

### START Condition 結構

START = raw HHLL（Manchester-II 非法序列）：
- H for 2 bit-periods + L for 2 bit-periods
- 總共 4 bit periods = 8 tHalf

Manchester-II 編碼定義：
- bit 0 = L→H 跳變（中間點）
- bit 1 = H→L 跳變（中間點）

SYNC（全 0）的 edge pattern：每 tHalf 一個 edge，交替 L→H / H→L。

START 在波形上的 edge 結構：
1. SYNC 最後一個 center edge（L→H，line goes HIGH）
2. **正常應有的 boundary edge 被 START 取代**，line 維持 HIGH
3. HIGH 持續 2 bit periods → 第一個 START edge（H→L）距離上一個 SYNC edge = **5×tHalf**
4. LOW 持續 2 bit periods → 第二個 START edge（L→H）距離 H→L = **4×tHalf 或 5×tHalf**（取決於第一個 data bit）

### 本次 capture 中觀測到的 SYNC 數量

| syncCount | 數量 | auxBitT | 對應規格 |
|-----------|------|---------|----------|
| 17 | 510 筆 | 1034ns | eDP 1.4+（Pre-charge ~9 + SYNC 8） |
| 18 | 127 筆 | 1039~1040ns | eDP 1.4+（Pre-charge ~10 + SYNC 8） |
| 31 | 832 筆 | 1004ns | DP/eDP 1.2~1.3（Pre-charge ~15 + SYNC 16） |

**所有 195 筆 ERR 的鄰居 frame 均為 syncCount=31、auxBitT=1004ns。ERR 發生在 DP/eDP 1.2~1.3 規範的 frame 群中。**

---

## Type 1：Invalid START timing（149 筆）

### 特徵

| 項目 | 值 |
|------|-----|
| ERR 內容 | "Invalid START timing / 16 SYNCs / 153× Unparsed AUX activity" |
| SYNC bits | 16（= 32 half-edges）|
| auxBitT | 1205ns（偽值，見下方說明）|
| 持續時間 | 62μs (72)、70μs (55)、78μs (9)、87μs (13) |
| 前一行 | REPLY(sync31) 117 筆 / REQ(sync31) 32 筆 |
| 後一行 | REQ(sync31) 72 筆 / REPLY(sync31) 77 筆 |

### 觸發的程式碼路徑

位於 `wfgLaDecodeDpAuxSourceRows()` 的 SYNC 偵測迴圈，wfg.html 第 11051~11145 行。

**步驟 1 — SYNC 計數成功**（line 11056~11061）：
```javascript
if (inRange(dist, tHalf)) {
  if (!syncCount) { syncFirstEdge = edge; syncFirstIndex = i - 1; }
  syncCount++;   // 累積到 syncCount = 32（= 16 bits，符合 syncBits=16 門檻）
}
```

**步驟 2 — 偵測到第一個 START gap**（line 11062）：
```javascript
} else if (inRange(dist, 5 * tHalf) && syncCount >= 2 * syncBits) {
  // dist ≈ 251 samples → 在 5×tHalf ± tError = [237, 263] 範圍內 ✓
```

**步驟 3 — preGap 檢查通過**（line 11063~11101）：
因為 `followsTurnAround` 為 true（前一個正常 frame 的 STOP 在 400μs 內），preGap 被正確放行。

**步驟 4 — bitStateAfterEdge 檢查通過**（line 11103）：
```javascript
if (bitStateAfterEdge(i) === 0) {  // H→L edge，line goes LOW ✓
```

**步驟 5 — 第二個 START gap 驗證失敗**（line 11109~11124）：
```javascript
edge = edges[i]; i++;
next = edges[i]; dist = next - edge;
if (inRange(dist, 5 * tHalf)) {          // [237, 263] — FAIL
  synchronized = true; ...
} else if (inRange(dist, 4 * tHalf)) {   // [187, 213] — FAIL
  synchronized = true; ...
} else {
  addAnomaly(syncFirstEdge, next + tHalf, 'Invalid START timing', syncCount, edge);
  // ← 149 筆 ERR 在此產生
}
```

### 根因：START 驗證的 Dead Zone

解碼器用配置的 `tHalf = 50 samples`（bitRate=1MHz, sampleRate=100MHz）做 START 驗證：

| 檢查 | 範圍 (samples) | 範圍 (ns) |
|------|---------------|-----------|
| `inRange(dist, 5*tHalf)` | 237 ~ 263 | 2370 ~ 2630 |
| `inRange(dist, 4*tHalf)` | 187 ~ 213 | 1870 ~ 2130 |
| **Dead Zone** | **214 ~ 236** | **2140 ~ 2360** |

Dead zone 寬度 = 23 samples = 230ns，佔 4~5 tHalf 範圍的 **15%**。

**為何 gap 落入 dead zone？**

sync31 frame 的實測 auxBitT = 1004ns，實際 tHalf_actual = 502ns = 50.2 samples。

第二個 START gap 的預期值取決於第一個 data bit：
- data bit = 0 → gap = 5 × tHalf_actual = 251 samples → 在 [237, 263] ✓
- data bit = 1 → gap = 4 × tHalf_actual = 200.8 samples → 在 [187, 213] ✓

以上計算顯示，如果 bit rate 完全穩定在 1004ns，gap 不會落入 dead zone。但實際波形中，AUX 訊號的 edge jitter 和 clock 偏差可能導致 gap 偏移到 dead zone 邊界。

**更可能的根因**：第二個 gap 實際上不是純粹的 4×tHalf 或 5×tHalf，而是受到以下因素影響：

1. **Source/Sink 方向切換的 clock 差異**：REQ 和 REPLY 來自不同的驅動端（Source vs Sink），bit rate 可能有微小差異（1004ns vs 1035ns）
2. **Pre-charge edge 與 SYNC edge 的 timing 偏移**：pre-charge 由新 driver 產生，其 edge timing 可能比穩態 SYNC 有偏差
3. **SYNC 計數位移**：如果 SYNC 計數時多包含或少包含了一個 edge，會導致 START gap 的起算點偏移一個 tHalf

上述任一因素使 gap 偏移 ±15~25 samples（150~250ns），就足以讓 gap 落入 214~236 的 dead zone。

### auxBitT = 1205ns 是偽值

`measuredBitTFromSync`（line 10837~10849）的計算：
```javascript
measured = (syncEndSample - syncStartSample) / sampleRate / syncCountBits
```

對於 addAnomaly 呼叫（line 10954）：
- `syncStartSample` = `syncFirstEdge`（SYNC 第一個 edge）
- `syncEndSample` = `edge`（START H→L edge **之後**再 advance 的 edge）
- `syncCountBits` = 16

span 包含了 SYNC（31 個 tHalf gaps = ~15.6μs）**加上** START gap（~2.5μs），但只除以 16 bits，導致 measured bitT 被膨脹到 ~1205ns。這不是真正的 bit rate。

### Unparsed AUX activity（153 × 合併）

Type 1 ERR 之所以包含 153 個 "Unparsed AUX activity"，是因為：

1. addAnomaly 在 line 11124 只處理了 START 失敗點附近的一小段
2. ERR 後的 SYNC 重置（syncCount=0），解碼器無法 parse 後續的 AUX 活動
3. `addUnparsedActivityAnomalies()`（line 10964~11039）在後處理中找到大量未被覆蓋的 edge 活動
4. anomaly merging（line 10047）把這些在 4×bitT 內的 anomaly 合併成一筆 ERR

結果：1 個 "Invalid START timing" + 153 個 "Unparsed AUX activity" → 合併為 1 筆 ERR，持續時間涵蓋整段未解碼的 AUX 交易（62~87μs）。

---

## Type 2：純 Unparsed AUX activity（46 筆）

### 特徵

| 項目 | 值 |
|------|-----|
| ERR 內容 | "Unparsed AUX activity"（單獨 1 個 part） |
| auxBitT | 1000ns（預設值，因無 SYNC 可量測） |
| 持續時間 | 62μs (24)、70μs (14)、78μs (5)、87μs (3) |
| 前一行 | REPLY(sync31) 37 筆 / REQ(sync31) 9 筆 |
| 後一行 | REPLY(sync31) 22 筆 / REQ(sync31) 24 筆 |

### 觸發的程式碼路徑

**步驟 1 — SYNC 計數成功**：累積到 syncCount ≥ 32。

**步驟 2 — 偵測到 5×tHalf gap**：進入 START 處理。

**步驟 3 — preGap 檢查中的 SYNC discard**（line 11063~11099）：

```javascript
var preGap = edges[syncFirstIndex] - edges[syncFirstIndex - 1];
if (preGap < 3 * tHalf) {   // preGap < 150 → 進入
  // ... followsPreviousStop → false
  // ... followsTurnAround → false（lastFrameStopEndSample 無效或離太遠）
  // ... preGap <= glitchMax(25) → false（preGap 在 37~63 範圍）
  // ... !isHalfRange(preGap) → false（preGap IS in isHalfRange）
  
  } else {
    // ← 46 筆 Type 2 ERR 在此觸發 SYNC discard
    syncCount = 0;         // 完全丟棄已計數的 SYNC
    syncFirstEdge = 0;
    syncFirstIndex = -1;
    startRegionSample = 0;
    pendingPrefixFormatError = null;
    continue;              // 回到 while 迴圈繼續找下一個 SYNC
  }
```

### 根因：preGap 在 isHalfRange 時被誤殺

`preGap` = SYNC 第一個被計數的 edge 與它前面一個 edge 的距離。

當 `preGap` 落在 `isHalfRange`（37~63 samples = 370~630ns）內：
- **它不是 glitch**（glitchMax = 25 samples）
- **它不是 preamble gap**（因為 `!isHalfRange(preGap)` 為 false）
- **它不是 turn-around pre-charge**（因為 `followsTurnAround` 為 false）

所以 preGap 落入了 else 分支，整個 SYNC 被丟棄。

**但這個 edge 實際上是 SYNC preamble 的一部分！** 它是 pre-charge 或 SYNC 的一個 edge，與已計數的 SYNC edges 有正常的 tHalf 間距。只是因為解碼器從某個 edge 開始計數 SYNC 時「漏掉了」前面這個 edge，導致它被歸類為 preGap 而非 SYNC 本體。

**`followsTurnAround` 為何失敗？**

```javascript
var followsTurnAround = isFinite(lastFrameStopEndSample)
    && edges[syncFirstIndex - 1] >= lastFrameStopEndSample - tError
    && (edges[syncFirstIndex - 1] - lastFrameStopEndSample) <= auxTurnAroundMaxSamples;
```

失敗原因有二：
1. `lastFrameStopEndSample` 不是有效值（`!isFinite`）：前一個 frame 因為 Type 1 ERR 導致 STOP 沒被記錄
2. `lastFrameStopEndSample` 離太遠：前一個成功的 frame 之間隔了一個 ERR，STOP 位置距離當前 SYNC 超過 400μs

**連鎖效應**：Type 1 ERR（Invalid START timing）→ `lastFrameStopEndSample` 不更新 → 下一個 frame 的 `followsTurnAround` 失敗 → Type 2 ERR（SYNC discard）→ `lastFrameStopEndSample` 繼續不更新 → 惡性循環

### 後續：addUnparsedActivityAnomalies

SYNC 被丟棄後，解碼器在這段波形中找不到有效 SYNC，整段 edge 活動在 `addUnparsedActivityAnomalies()` 後處理中被標記為 "Unparsed AUX activity"。

---

## 兩類 ERR 的關聯

Type 1 和 Type 2 常成對出現。典型序列：

```
正常 REPLY(sync31) → [Type 1 ERR] → 正常 REQ(sync31) → 正常 REPLY(sync31) → [Type 2 ERR] → ...
```

Type 1 ERR 破壞了 `lastFrameStopEndSample` 的連續性，增加了後續 frame 觸發 Type 2 的機率。兩者的持續時間分佈完全一致（62/70/78/87μs），進一步證實它們都是正常 AUX 交易被錯誤標記的結果。

---

## 修復方案

### 方案 A：消除 START 驗證 Dead Zone（修 Type 1）

**位置**：wfg.html line 11109~11122

**問題**：`inRange(dist, 5*tHalf)` 和 `inRange(dist, 4*tHalf)` 之間有 23 samples 的 dead zone。

**方案 A1 — 合併為連續範圍**（推薦）：

將兩個離散的 `inRange` 檢查改為一個連續範圍檢查：

```javascript
// 修改前：
if (inRange(dist, 5 * tHalf)) { ... }
else if (inRange(dist, 4 * tHalf)) { ... }

// 修改後：
var startGapMin = 4 * tHalf - tError;    // 187 samples
var startGapMax = 5 * tHalf + tError;    // 263 samples
if (dist > startGapMin && dist < startGapMax) {
  // 在 4~5 tHalf 的連續範圍內都接受為 START
  // 用 dist 與 4.5*tHalf 的比較來判斷 first data bit
  if (dist >= 4.5 * tHalf) {
    // closer to 5*tHalf → first data bit = 0
    synchronized = true;
    packet++;
    startSample = next - tHalf;
  } else {
    // closer to 4*tHalf → first data bit = 1
    synchronized = true;
    packet++;
    startSample = next;
    edge = edges[i]; i++;
    if (i >= edges.length) break;
    next = edges[i]; dist = next - edge;
    if (!inRange(dist, tHalf)) synchronized = false;
  }
}
```

**方案 A2 — 使用實測 bitT 做 START 驗證**：

用 SYNC span 計算出的實測 tHalf_m 取代配置的 tHalf 做 START 驗證：

```javascript
// 在 syncCount >= 2 * syncBits 確認後，計算實測 tHalf
var tHalf_m = (edges[i - 1] - edges[syncFirstIndex]) / syncCount;
// 用 tHalf_m 做 START gap 驗證
if (inRange_m(dist, 5 * tHalf_m)) { ... }
else if (inRange_m(dist, 4 * tHalf_m)) { ... }
```

其中 `inRange_m` 使用 `tHalf_m * tolPct` 作為容差。這樣 dead zone 隨實測 bit rate 自適應。

### 方案 B：修復 preGap isHalfRange Discard（修 Type 2）

**位置**：wfg.html line 11087~11099

**問題**：preGap 在 isHalfRange（37~63 samples）但不滿足 followsPreviousStop / followsTurnAround 時，SYNC 被完全丟棄。

**修復**：當 preGap 是 tHalf 間距時，把這個 edge 納入 SYNC 計數，而不是丟棄整個 SYNC：

```javascript
// 修改前（line 11093~11099）：
} else {
  syncCount = 0;
  // ... 完全丟棄
  continue;
}

// 修改後：
} else if (isHalfRange(preGap)) {
  // preGap 是 tHalf 間距 → 這個 edge 本身就是 SYNC preamble 的一部分
  // 擴展 SYNC 起始點以包含此 edge，不丟棄
  syncFirstIndex = syncFirstIndex - 1;
  syncFirstEdge = edges[syncFirstIndex];
  syncCount++;
  pendingPrefixFormatError = null;
} else {
  syncCount = 0;
  // ... 丟棄
  continue;
}
```

### 方案 C：後處理修正（安全網，修 Type 1 + Type 2）

在 `addUnparsedActivityAnomalies()` 之後增加一個後處理步驟：

```javascript
// 在 addUnparsedActivityAnomalies() 之後加入
function removeNormalSandwichedErrors() {
  if (anomalies.length === 0 || frames.length === 0) return;
  // 建立 frame 時間索引
  var allFrameTimes = frames.map(function(f) { return f.startTime; }).sort();
  
  anomalies = anomalies.filter(function(a) {
    // 找到 ERR 前後最近的正常 frame
    var prevFrame = null, nextFrame = null;
    for (var fi = 0; fi < frames.length; fi++) {
      if (frames[fi].endTime <= a.startTime + 1e-9) prevFrame = frames[fi];
      if (!nextFrame && frames[fi].startTime >= a.endTime - 1e-9) nextFrame = frames[fi];
    }
    // 如果前後都有正常 frame 且 ERR 持續時間合理（< 100μs），移除此 ERR
    var dur = a.endTime - a.startTime;
    if (prevFrame && nextFrame && dur < 100e-6) {
      return false;  // 移除
    }
    return true;  // 保留
  });
}
```

### 方案 D：降低嚴重性（最小改動，修 Type 1 + Type 2）

將被正常 frame 夾心的 ERR 降級為 WARN：

```javascript
// 在解碼完成後，掃描 anomalies
anomalies.forEach(function(a) {
  if (a.reason && (a.reason.indexOf('Invalid START timing') >= 0 || a.reason.indexOf('Unparsed AUX activity') >= 0)) {
    // 檢查是否被正常 frame 夾心
    var sandwiched = frames.some(function(f) { return f.endTime < a.startTime && (a.startTime - f.endTime) < 200e-6; })
                  && frames.some(function(f) { return f.startTime > a.endTime && (f.startTime - a.endTime) < 200e-6; });
    if (sandwiched) {
      a.severity = 'warn';  // 從 ERR 降級為 WARN
    }
  }
});
```

### 推薦修復順序

1. **方案 A1**（最高優先）：消除 dead zone，一次修掉 149 筆 Type 1
2. **方案 B**（次高優先）：修復 preGap discard，修掉 46 筆 Type 2
3. **方案 C 或 D**（安全網）：作為最後防線，處理方案 A/B 無法覆蓋的邊界情況

預計 A1 + B 即可消除全部 195 筆 ERR。方案 C/D 作為保險，防止未來出現類似的邊界情況。

---

## ERR 持續時間分佈

Type 1 和 Type 2 的持續時間分佈完全一致，進一步證實兩者的底層 AUX 活動是相同的：

| 持續時間 (μs) | Type 1 | Type 2 | 合計 |
|-------------|--------|--------|------|
| 62 | 72 | 24 | 96 |
| 70 | 55 | 14 | 69 |
| 78 | 9 | 5 | 14 |
| 87 | 13 | 3 | 16 |
| **合計** | **149** | **46** | **195** |

四個離散的持續時間對應 AUX 交易的四種 payload 長度，是正常 AUX 通訊的特徵。

---

## 驗證指標

修復完成後的預期結果：

| 指標 | 修復前 | 修復後（預期） |
|------|--------|---------------|
| 總行數 | 1664 | ~1859（+195 新解碼 frame）|
| REQ | 733 | ~830 |
| REPLY | 736 | ~834 |
| ERR | 195 | 0 |
| Invalid START timing | 149 | 0 |
| Unparsed AUX activity | 22843（合併後） | 0 |

---

*報告產出時間：2026-05-23*
*版本：v2.97.389（分析基準）*
*分析者：Task B（第二輪）*
