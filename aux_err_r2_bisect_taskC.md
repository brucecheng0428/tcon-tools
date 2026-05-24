# AUX 解析器 ERR 誤判修復 — 第二輪 Task C：改動追溯報告

## 聚焦範圍

本報告深入追溯 195 筆 "Unparsed AUX activity" 誤判的根因機制，聚焦三個核心問題：
1. STOP detection 的完整邏輯與缺陷
2. SYNC preamble 偵測流程與失敗條件
3. Unparsed 判定機制（兩個獨立函式）

---

## 一、STOP Detection 邏輯完整分析

### 1.1 STOP 的定義（DP AUX 協議）

DP AUX Manchester II 協議中，STOP = 兩個 bit time 的固定 pattern（HHLL，即 HIGH-HIGH-LOW-LOW）。
在波形層面，STOP 表現為：最後一個 data byte 結束後，有一段特定 timing 的 edge sequence。

### 1.2 解碼器中 STOP 的「偵測」方式（wfg.html 行 11184~11197）

**關鍵發現：解碼器並沒有「主動偵測」STOP pattern。** 它的做法是：

```
// 讀完一個 byte 的 8 個 bit 後...
i++;                                    // 行 11184: 前進到下一個 edge
var stopNext = edges[i];                // 行 11186
var stopDist = stopNext - lastEdge;     // 行 11187

if (inRange(stopDist, tHalf)) {         // 情況 A: 下一個 edge 距離 ≈ tHalf
    // → 認為是 byte 間的 Manchester mid-cell transition
    // → 再前進一步確認下一個 edge 也是 tHalf
    // → 如果是 → 繼續讀下一個 byte
    // → 如果不是 → synchronized = false，frame 結束
} else if (!inRange(stopDist, 2 * tHalf)) {  // 情況 B: 距離 ≠ tHalf 也 ≠ 2*tHalf
    synchronized = false;               // → 無法識別 → frame 結束
}
// 隱含情況 C: 距離 ≈ 2*tHalf → 認為是 bit boundary → 繼續讀下一個 byte
```

**STOP 是「被動」結束的**：當 edge timing 不符合任何 data pattern 時，`synchronized = false`，byte-reading 迴圈自然結束。解碼器不會去驗證「結束的原因是否真的是 STOP pattern」。

### 1.3 stopRegionEnd 的計算（行 11206~11207）

```javascript
var stopRegionStart = payloadEndTime;
var stopRegionEnd = stopRegionStart + 4 * auxBitT;
```

**stopRegionEnd 是固定偏移算出來的（payloadEnd + 4 bit times），不是根據實際 STOP edge 位置。**
這代表 `lastFrameStopEndSample`（行 11295）也是估算值，不是精確的 STOP 結束位置。

### 1.4 lastFrameStopEndSample 的問題

```javascript
lastFrameStopEndSample = Math.round(stopRegionEnd * sampleRate);  // 行 11295
```

這個值在下一輪 SYNC 偵測中被用來判斷 `followsPreviousStop` 和 `followsTurnAround`：

```javascript
var followsPreviousStop = isFinite(lastFrameStopEndSample)
    && edges[syncFirstIndex - 1] <= lastFrameStopEndSample + tError   // pre-charge edge ≤ 估算 STOP 結束
    && edges[syncFirstIndex] >= lastFrameStopEndSample - tError;      // SYNC 第一 edge ≥ 估算 STOP 結束

var followsTurnAround = isFinite(lastFrameStopEndSample)
    && edges[syncFirstIndex - 1] >= lastFrameStopEndSample - tError
    && (edges[syncFirstIndex - 1] - lastFrameStopEndSample) <= auxTurnAroundMaxSamples;
```

**問題**：如果中間有一個 frame 解碼失敗（decoder 跳過了它），`lastFrameStopEndSample` 停留在更早的值，與當前 SYNC 之間可能隔了好幾個 frame 的距離，導致 `followsTurnAround` 的 400μs 門檻也不夠用。

### 1.5 STOP detection 失敗的場景

| 場景 | 描述 | 後果 |
|------|------|------|
| **STOP edge timing 偏差** | STOP 的 edge 間距不在 `tHalf ± tError` 範圍內 | `synchronized = false`，但 `i` 停在 STOP 中間，可能跳過下一個 SYNC |
| **Frame 中間解碼失敗** | 某個 byte 的 Manchester 解碼失敗（decodedBit == null） | `synchronized = false`，`i` 停在失敗的 edge，後面的 SYNC 需要重新搜尋 |
| **lastFrameStopEndSample 過時** | 中間有未解碼的 frame | `followsPreviousStop` 和 `followsTurnAround` 都可能失效 |

### 1.6 歷史追溯

| Commit | 日期 | 改動 |
|--------|------|------|
| `ef620db` | 初版 | STOP 以 `synchronized = false` 被動結束，無 `lastFrameStopEndSample` |
| `4aa8298` | 2026-05-09 | 大規模重構 AUX rendering，新增 `addUnparsedActivityAnomalies()`，STOP 判定邏輯未變 |
| `1aa248e` (v2.97.218) | 2026-05-10 | **新增 `lastFrameStopEndSample` + `followsPreviousStop`**，嘗試區分 pre-charge edge 和 glitch |
| `255034a` (v2.97.388) | 2026-05-23 | 新增 `followsTurnAround`（400μs 門檻），修復 832 筆 Narrow glitch |
| `02e911f` (v2.97.389) | 2026-05-23 | 後處理移除殘留 Narrow glitch |

**結論：STOP detection 從初版到現在一直是「被動結束」設計，從未有「主動偵測 STOP pattern」的邏輯。**

---

## 二、SYNC Preamble 偵測完整流程

### 2.1 偵測邏輯（行 11051~11101）

解碼器的 SYNC 偵測是一個線性掃描：

```
步驟 1: 逐 edge 前進，計算相鄰 edge 間距 dist
步驟 2: 若 dist ≈ tHalf（inRange） → syncCount++
步驟 3: 若 dist ≈ 5*tHalf 且 syncCount ≥ 2*syncBits → 進入 START 判定
步驟 4: 若 dist 不符合 → syncCount 歸零，重新開始
```

### 2.2 SYNC 偵測門檻

- **syncBits**：cfg.syncBits 或預設 16（代表 16 個 SYNC bit = 32 個 half-bit edge）
- **最低要求**：syncCount ≥ 2 × syncBits = 32 個連續 half-bit edge
- **edge 間距容忍**：`inRange(dist, tHalf)` = `dist > (tHalf - tError) && dist < (tHalf + tError)`
- **tError 計算**：`tError = max(3, round(tHalf × tolPct))`，tolPct 預設 25%
- **5*tHalf 條件**：SYNC→START 之間的 gap 必須 ≈ 5 × tHalf

### 2.3 SYNC 偵測失敗的場景

**場景 A — 解碼器 `i` 指標跳進 SYNC 中間**：

這是 195 筆 Unparsed 的核心根因。當前一個 frame 解碼失敗（`synchronized = false`），`i` 可能停在該 frame 數據區的某個位置。外層 while 迴圈從這個 `i` 開始重新搜尋 SYNC。但如果下一個 frame 的 SYNC preamble 開頭已經被 `i` 跳過了，剩餘的 SYNC edge 數量 < 2 × syncBits，就無法偵測到這個 SYNC。

```
情境圖：
Frame A (成功)  |  Frame B (失敗)  |  Frame C (SYNC 被跳過)  |  Frame D (成功)
  SYNC START DATA STOP  |  SYNC START ???  |  SYNC START DATA STOP  |  SYNC START DATA STOP
                            ↑ i 停在這裡      ↑ 但 SYNC 前半已被跳過
                                                → syncCount < 32 → 偵測不到
                                                → Frame C 被標記為 Unparsed
```

**場景 B — edge timing 微偏**：

如果 SYNC 中間有一個 edge 的間距略超出 `tHalf ± tError`，syncCount 歸零。即使前面已經累積了 30 個半週期，一個異常 edge 就會打斷整個 SYNC 偵測。

**場景 C — SYNC→START transition 不匹配**：

即使 SYNC 累積夠了，如果 SYNC 結尾的 5*tHalf gap 不在容忍範圍內（行 11062），解碼器會執行 `addAnomaly`（如果 syncCountBits ≥ syncBits）而不是正常解碼。

### 2.4 容忍範圍分析

以預設參數（bitRate=1MHz, sampleRate=200MHz, tolerance=25%）：
- tHalf = 100 samples
- tError = max(3, round(100 × 0.25)) = 25 samples
- 容忍範圍：75 ~ 125 samples（即 375ns ~ 625ns，標稱 500ns）
- 5*tHalf 容忍：475 ~ 525 samples（即 2.375μs ~ 2.625μs）

**這個容忍範圍在理想訊號下是足夠的，但如果邏輯分析儀的取樣率較低或訊號有 jitter，容忍範圍可能不夠。**

### 2.5 歷史追溯

syncBits 門檻自 `ef620db`（初版）以來一直是 16（需 32 個連續 half-bit edge），**從未被修改過**。
`inRange` 函式的容忍計算（`tHalf × tolPct`）也從未修改。

---

## 三、Unparsed 判定機制（兩個獨立函式）

### 3.1 函式一：addUnparsedActivityAnomalies()（行 10964~11039）

**呼叫時機**：在 `wfgLaDecodeDpAuxSourceRows` 主解碼迴圈結束後、建立 rows 之前（行 11306）。

**邏輯**：
1. 計算 activityGap = max(8 × tHalf, round(sampleRate × bitT × 4))
2. 將所有 edge 按 activityGap 分成連續活動 span
3. 每個 span 須 ≥ minEdges（12 個 edge）且 span ≥ minSpan（max(bitT × 12, 8μs)）
4. 從每個 span 中扣除已被 frames 和 anomalies 覆蓋的區域
5. 剩餘的未覆蓋區域，如果 ≥ minSpan 且 edge 數 ≥ minEdges → 標記為 "Unparsed AUX activity"

**門檻值的由來**：
- **12 edge**：≈ 1.5 bytes（一個 Manchester byte = 8 data edge + ~8 clock edge），確保不是零星噪聲
- **bitT × 12**（12 bit times ≈ 12μs @1MHz）：≈ 1.5 bytes 的持續時間
- **8μs 下限**：absolute minimum，防止在低 bitRate 時門檻太小

**這些門檻值自 `4aa8298` 引入以來從未被修改。**

### 3.2 函式二：wfgLaDpAuxAddUncoveredActivityRows()（行 10091~10198）

**呼叫時機**：在 `wfgLaDecodeDpAuxFrames` 管線中，於 ValidatePreamble → Normalize → TrimIdleHigh 之後被呼叫**兩次**（行 11403 和 11409）。

**與函式一的差異**：
- 函式一在「源碼解碼」層（wfgLaDecodeDpAuxSourceRows 內部），處理的是 sample-based edges
- 函式二在「管線後處理」層（wfgLaDecodeDpAuxFrames 中），處理的是 time-based edgesSec
- 函式二有 `coverAnomalies` 選項：第一次呼叫時 anomaly rows 也算覆蓋區域，第二次不算

**門檻值**：與函式一相同（minEdges=12, minSpan=max(bitT×12, 8μs)）

**這兩個函式在管線中會合作產生 Unparsed ERR**：
1. 函式一：在源碼解碼階段找到解碼器跳過的活動區段 → anomaly
2. anomaly 經 BuildAnomalyRows 轉為 ERR row
3. 函式二（第一次）：找到被其他 anomaly 覆蓋但仍有殘留的未覆蓋活動
4. 函式二（第二次，coverAnomalies=false）：忽略 anomaly 覆蓋，只看正常 row 的覆蓋

### 3.3 與 wfgLaDpAuxSourceBuildAnomalyRows 的關係（行 10029~10089）

此函式將 anomalies 陣列轉為 ERR rows。重點邏輯：

```javascript
// 行 10041: 短於 12 bit times 的 anomaly 被丟棄（shortFormatError 除外）
if (!a.shortFormatError && span < Math.max(bitT * 12, 1e-6)) return;

// 行 10042~10045: 如果 anomaly 55%+ 被已知 frame 覆蓋 → 丟棄
for (var ci = 0; ci < covered.length; ci++) {
    var ov = Math.min(end, covered[ci].end) - Math.max(start, covered[ci].start);
    if (ov > span * 0.55) return;
}

// 行 10047: 相鄰 anomaly 合併（間距 ≤ 4 bit times）
if (last && !last.shortFormatError && !a.shortFormatError 
    && start - last.endTime <= Math.max(bitT * 4, 2e-6)) {
    last.endTime = Math.max(last.endTime, end);
    last.value = last.value + ' / ' + (a.reason || 'invalid');
    ...
}
```

**合併邏輯產生了 "153× Unparsed AUX activity" 這種大量堆疊的 ERR description**：
當多個連續的未解碼區段間距 ≤ 4 bit times 時，它們被合併成一筆 ERR，description 用 " / " 串接。

---

## 四、195 筆無法解碼的根因路徑分析

### 4.1 模擬解碼器處理路徑

根據第一輪 Task E 的發現：
- 195 筆 ERR 的前一行和後一行 100% 都是正常 REQ 或 REPLY
- Unparsed 數量呈兩極分布：149 筆含 153 個 Unparsed、46 筆含 1 個 Unparsed

**假設 Frame 序列為 A → B → C → D（A/D 成功解碼，B/C 為 Unparsed）：**

```
Step 1: 解碼器成功解碼 Frame A（REQ）
        → lastFrameStopEndSample = Frame A 的 stopRegionEnd（估算值）
        → i 停在 Frame A STOP 後面

Step 2: 解碼器開始搜尋下一個 SYNC
        → 遇到 turn-around pre-charge edge
        → followsTurnAround 通過（Frame A STOP → 400μs 內）
        → 偵測到 Frame B 的 SYNC preamble（≥32 half-bit edges）

Step 3: 進入 Frame B 的 START 判定
        → ✅ 成功辨識 START

Step 4: 進入 Frame B 的 byte-reading 迴圈
        → ⚠️ 在某個 byte 的解碼過程中，edge timing 不符合
        → synchronized = false
        → ⚠️ 此時 i 可能已經前進到 Frame B 的 data 區中間

Step 5: Frame B 仍然有 bytes（bytes.length > 0）
        → 但 sampledPayload 驗證失敗（completePayload = false, edgeParsedPayload = false）
        → addAnomaly('Incomplete AUX payload') → 或直接跳過
        → ⚠️ 也可能 bytes.length == 0 → 直接 continue，不更新 lastFrameStopEndSample

Step 6: 外層 while 迴圈從當前 i 繼續搜尋 SYNC
        → ⚠️ 如果 Frame C 的 SYNC preamble 開頭已被 i 跳過
        → 剩餘 SYNC edge 不足 32 個
        → SYNC 偵測失敗 → Frame C 的活動不被解碼

Step 7: 解碼器繼續搜尋，最終找到 Frame D 的 SYNC
        → Frame D 成功解碼
        → 但 lastFrameStopEndSample 還停留在 Frame A 的值
        → 如果 Frame A→D 跨度 > 400μs → followsTurnAround 也失效

Step 8: addUnparsedActivityAnomalies() 掃描所有 edges
        → 找到 Frame B/C 的活動區段未被覆蓋
        → 標記為 "Unparsed AUX activity" ERR
```

### 4.2 解碼器在哪一步放棄

根據上述分析，解碼器放棄解碼的可能斷點有三個：

**斷點 1 — Byte-reading 中 Manchester 解碼失敗（行 11160）**：
```javascript
if (edgeBit == null) { synchronized = false; break; }
```
Manchester 要求每個 bit 的前半和後半 level 不同。如果某個 bit 的 transition 不存在（因為 edge timing 偏差導致 `levelAtSourceTime` 在兩個取樣點回傳相同 level），`manchesterBitFromTransition` 回傳 null。

**斷點 2 — Byte 間的 edge timing 不符（行 11173~11176）**：
```javascript
if (!inRange(d, tHalf)) { synchronized = false; break; }
// 或
if (!inRange(d, 2 * tHalf)) { synchronized = false; break; }
```
Byte 內部 bit 之間需要 tHalf 或 2*tHalf 的間距，任何偏差都會打斷。

**斷點 3 — STOP 區域的 edge timing 不符（行 11194~11196）**：
```javascript
if (!inRange(stopDist, tHalf)) synchronized = false;
// 或
if (!inRange(stopDist, 2 * tHalf)) synchronized = false;
```

**三個斷點的共同後果**：`i` 停在 frame 中間或 STOP 位置，下一輪 SYNC 搜尋可能跳過後續 frame 的 preamble。

### 4.3 為什麼是 195 筆而非更多或更少

- 195 筆對應的是那些「前一個 frame 解碼失敗導致 `i` 跳過後續 SYNC」的特定位置
- 兩極分布（149 筆含 153 個 Unparsed vs 46 筆含 1 個 Unparsed）暗示：
  - **單一 Unparsed（46 筆）**：只有一個 frame 被跳過，後續的 SYNC 被成功偵測到
  - **大量 Unparsed（149 筆 × 153 個）**：連續多個 frame 被跳過，形成 cascade 效應
- 持續時間穩定在 4 個離散值（62/70/78/87μs）→ 對應 AUX transaction 的固定結構大小

### 4.4 根因總結

```
                   ┌─────────────────────────────────┐
                   │  根因：STOP 是「被動結束」設計    │
                   │  沒有主動偵測 STOP pattern       │
                   └──────────┬──────────────────────┘
                              │
                   ┌──────────▼──────────────────────┐
                   │  後果 1：byte-reading 中斷時      │
                   │  i 指標停在 frame 數據區中間      │
                   └──────────┬──────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
   ┌──────────▼──────────┐     ┌──────────────▼──────────┐
   │ 後果 2a：            │     │ 後果 2b：                │
   │ 下一個 SYNC 被跳過   │     │ lastFrameStopEndSample  │
   │ (i 已經在 SYNC 後面) │     │ 不更新 → 太遠            │
   └──────────┬──────────┘     └──────────────┬──────────┘
              │                               │
              │            ┌──────────────────┘
              │            │
   ┌──────────▼────────────▼─────────┐
   │  最終結果：                       │
   │  正常 AUX 活動被標記為           │
   │  "Unparsed AUX activity" ERR    │
   └─────────────────────────────────┘
```

---

## 五、為 Task D 提供的修復方向

### 方案 1：主動 STOP detection + i 回退

在 `synchronized = false` 斷點之後，主動搜尋 STOP pattern（尋找 idle-high gap），並將 `i` 回退到 STOP 之後的第一個 edge，確保不會跳過後續 SYNC。

**優點**：根本修復，不再跳過 frame
**風險**：需要定義可靠的 STOP pattern 辨識規則；改動核心解碼迴圈

### 方案 2：i 回退到 activity gap

不偵測 STOP，而是在 `synchronized = false` 時，將 `i` 回退到前一個「長 gap」（> activityGap）之後的位置，從那裡重新開始 SYNC 搜尋。

**優點**：簡單，不需要理解 STOP pattern
**風險**：可能造成同一段 edge 被重複掃描，需要防止無限迴圈

### 方案 3：二次解碼嘗試

在 `addUnparsedActivityAnomalies` 標記的區段上，嘗試用不同的 syncBits 門檻（降低到 8 或 12）重新解碼。

**優點**：不改動主解碼迴圈
**風險**：如果根因是 `i` 跳過而非 syncBits 太高，這個方案無效

### 方案 4：後處理修正（最低風險）

類似 v2.97.389 的做法：在後處理階段，如果一個 "Unparsed AUX activity" ERR 的前後都是正常 REQ/REPLY（夾心結構），就把它降級為 WARN 或移除。

**優點**：風險最低，不改解碼邏輯
**缺點**：只隱藏症狀，不修復根因；那些 frame 的 data 仍然無法解碼

### 建議

**方案 1（主動 STOP + i 回退）是唯一能根本修復的方案。** 具體做法：

1. 當 `synchronized = false` 導致 byte-reading 中斷時，在 frame push 之前，搜尋「從當前 `i` 開始，往前找 idle-high（edge 間距 > 3 × tHalf）的位置」
2. 如果找到 idle-high gap，將 `i` 設為 gap 後的第一個 edge index
3. 確保 `lastFrameStopEndSample` 在解碼失敗時也能合理更新（用 `frameEnd` 估算）
4. 如果方案 1 太複雜，可以先用 **方案 4（後處理修正）** 做為臨時措施，把 ERR 降級為 INFO/WARN

---

*報告日期：2026-05-23*
*調查者：Claude (Task C, 第二輪)*
*對應版本：v2.97.389*
