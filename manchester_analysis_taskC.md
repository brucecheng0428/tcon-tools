# 曼徹斯特編碼 01 對齊問題 — Task C 根因分析

## 摘要

此問題在 5 月 17 日至 21 日之間經歷了至少 4 輪修復（共 7 個 commit），然後被 v2.97.354 (commit `705f274`) 一次性移除所有渲染端修補。問題反覆出現的根本原因是**架構性的**：bit 位置計算散落在三個獨立的繪製函式中，沒有單一事實來源（single source of truth），導致每次修復都是局部補丁，無法系統性解決。

---

## 1. 為什麼此問題反覆重現？結構性原因

### 1.1 三條繪製路徑各自獨立

目前 bit 數字的繪製分散在三個函式：

| 函式 | 用途 | 位置計算方式 | 有過 edge-walk？ |
|------|------|-------------|-----------------|
| `drawRawBits` (L12333) | SYNC 區域 | 純算術 `t0 + (i+0.5)*bitT` | **從未有過** |
| `drawByteBits` (L12365) | payload fallback（無 bits 時） | `times[i]` 或算術 fallback | v2.97.351 加入，v2.97.354 刪除 |
| `drawBitValues` (L12401) | payload 主路徑（有 bits 時） | `times[i]` 或算術 fallback | v2.97.352 加入，v2.97.354 刪除 |

**這三個函式做的事幾乎一模一樣**——在 canvas 上某個 x 座標畫一個數字。差異僅在於「數字值從哪來」和「x 座標怎麼算」。但因為是三個獨立函式，每次修 bug 都只改其中一兩個，遺漏第三個。

歷史證據：
- v2.97.351 修了 `drawByteBits` 的 edge-walk，漏了 `drawBitValues`
- v2.97.352 補修 `drawBitValues`，但 `drawRawBits` 自始至終沒人碰
- v2.97.354 移除兩個函式的 edge-walk，`drawRawBits` 依然是算術定位

### 1.2 bitTimes 的資料流過長且語義混淆

從波形 edge 到畫面上的數字位置，資料流經 4 層：

```
Layer 1: 邊緣解析器 (L11212)
   byteBitTimes.push(edges[i] / sampleRate)
   語義：mid-cell transition 的實際時間
         ↓
Layer 2: frame 輸出 (L11305-11308)
   edgeParsedPayload ? 保留 edge 時間 : 用算術 bitTimes
   語義：仍然是 mid-cell transition 時間
         ↓
Layer 3: row 建構 (L10836, wfgLaDpAuxSourceBuildRow)
   row.bitTimes = frame.bitTimes.slice()  ← 直接複製
   語義：仍然是 mid-cell transition 時間
         ↓
Layer 4: 渲染 (L12417, drawBitValues)
   bitTime = times[bvi]  ← 使用 row.bitTimes
   fallback: payloadStart + (bvi + 0.5) * bitT
```

**問題**：中間任何一層如果誤解語義（例如以為是 cell 起點而非 mid-cell），就會引入偏移。過去就發生過：

- `decodeManchesterBitsInRange` (L10933) 產生的 bitTimes 是 `t0 + bitT * 0.5`（算術 mid-cell），與 edge parser 的 `edges[i]/sampleRate`（實際 edge）語義相同但精度不同
- 死碼 `applyTiming` (L9789) 對 bitTimes 做 `+ bitT/2`，如果它被啟用會把時間推到 cell 尾部——這是個潛在炸彈
- commit `4aa8298` 曾無條件用算術 bitTimes 覆蓋 edge bitTimes，直到 v2.97.353 才修正

### 1.3 沒有斷言或防衛

程式碼中沒有任何檢查來確保 bitTimes 的語義正確。例如：
- 沒有檢查 `bitTimes[0]` 是否在 `payloadStart` 和 `payloadStart + bitT` 之間
- 沒有檢查 `bitTimes[i+1] - bitTimes[i]` 是否約等於 `bitT`
- 沒有 log 警告不正常的 bitTime 值

任何上游的語義錯誤都會靜默傳播到渲染層。

---

## 2. 三條繪製路徑能不能統一？

**完全可以，也應該統一。**

三個函式的核心邏輯都是：
```js
for (每個 bit) {
    計算 bitTime
    var x = xOf(bitTime);
    if (x 不在可見範圍) continue;
    if (bitTime 落在 skip 區域) continue;
    ctx.strokeText(digit, x, y);
    ctx.fillText(digit, x, y);
}
```

唯一的差異是「digit 從哪來」和「bitTime 從哪來」：

| 函式 | digit 來源 | bitTime 來源 |
|------|-----------|-------------|
| `drawRawBits` | `bits[i]`（外部傳入） | `t0 + (i+0.5)*bitT` |
| `drawByteBits` | `(rawBytes[rb] >> bi) & 1` | `times[bitIdx]` 或算術 fallback |
| `drawBitValues` | `bits[bvi]` | `times[bvi]` 或算術 fallback |

這三個完全可以合併成一個：
```js
function drawDigitsAtTimes(digits, times, yText, drawBitT, skipRanges) {
    // digits[i] = 要畫的數字
    // times[i] = 要畫的 x 時間座標
    // 統一繪製邏輯
}
```

呼叫端負責準備 `digits[]` 和 `times[]`，繪製函式只管畫。

---

## 3. Commit `705f274` (v2.97.354) 移除 edge-walk 是否正確？

### 結論：部分正確，但過於激進

**正確的部分**：
- v2.97.353 確實修正了 decoder 端——讓 edge-parsed bitTimes 不再被算術 bitTimes 覆蓋
- 如果 decoder 的 bitTimes 總是正確的，渲染端的 edge-walk 確實是多餘的

**錯誤的部分**：

1. **未驗證就移除**：commit message 只說「decoder 源頭已修復」，但沒有針對所有邊界情況驗證 decoder bitTimes 的正確性

2. **移除了 defense-in-depth**：渲染端的 edge-walk 是獨立於 decoder 的第二層保護。即使 decoder 有 bug，edge-walk 也能在渲染時修正。移除後，一旦 decoder bitTimes 有問題，就沒有任何安全網

3. **完全忽視 SYNC 區域**：`drawRawBits` 從未有過 edge-walk，v2.97.354 的 commit 沒有提到也沒有處理這個問題

4. **忽視 `decodeManchesterBitsInRange` 路徑**：當 `!edgeParsedPayload` 時（edge parser 失敗但算術取樣成功），bitTimes 來自算術計算 `t0 + bitT * 0.5`。這條路徑的累積漂移問題完全沒有被 v2.97.353 解決

### v2.97.353 修復的實際涵蓋範圍

v2.97.353 的修正邏輯（L11305-11308）：
```js
if (edgeParsedPayload) {
    bitTimes = bitTimes.slice(0, expectedBits);  // edge 時間 → 精確
} else {
    bitTimes = sampledPayload.bitTimes.slice(0, expectedBits);  // 算術時間 → 有漂移風險
}
```

只有 `edgeParsedPayload === true` 時才保證精確。而 `edgeParsedPayload` 的條件是：
```js
var edgeParsedPayload = bytes.length > 0 && bitTimes.length >= expectedBits;
```

如果 edge parser 在解碼過程中因為 timing error 提前跳出（`synchronized = false`），`bitTimes.length < expectedBits`，就會 fallback 到算術 bitTimes。此時沒有 edge-walk 就沒有任何漂移補償。

---

## 4. bitTimes 語義分析

### 4.1 兩個產生 bitTimes 的來源

**來源 A — 邊緣解析器** (L11212)：
```js
byteBitTimes.push(lastEdge / sampleRate);
```
- `lastEdge` = `edges[i]`，即當前 bit 的 **mid-cell transition edge** 的 sample index
- 語義：**mid-cell transition 的絕對時間**
- 精度：取決於 sample rate，是波形 edge 的精確位置

**來源 B — Manchester 驗證器** (L10933)：
```js
bitTimes.push(t0 + bitT * 0.5);
```
- `t0 = startTime + mbi * bitT`（算術推算的 cell 起點）
- 語義：**算術推算的 mid-cell 時間**
- 精度：取決於 `bitT` 的測量精度，會有累積漂移

**兩者語義相同（都是 mid-cell 時間）但精度不同**。

### 4.2 `applyTiming` 的 `+ bitT/2` 是否正確？

`wfgLaDpAuxBuildFrameRows` 中的 `applyTiming` (L9789)：
```js
row.bitTimes = frame.bitTimes.map(function(t) { return t + bitT / 2; });
```

**這是錯誤的。** 如果 `frame.bitTimes` 已經是 mid-cell 時間，再加 `bitT/2` 會把位置推到 cell 尾部（接近下一個 cell 的起點）。

**但這是死碼。** `wfgLaDpAuxBuildFrameRows` 在整個程式碼中只有定義（L9774），沒有任何地方呼叫它。實際使用的是 `wfgLaDpAuxSourceBuildRow` (L10809)，它直接複製 `frame.bitTimes`（L10836）不做任何偏移。

**死碼中的 bug 不影響當前行為，但它是「語義混淆」的證據**——寫這段程式的人不確定 bitTimes 代表什麼，所以加了 `+ bitT/2` 試圖「修正」。這種不確定性正是 bug 反覆出現的原因。

### 4.3 繪製端的 fallback 算術

三個繪製函式的 fallback 都用 `baseStart + (i + 0.5) * bitT`：
- `drawRawBits`: `t0 + (dbi + 0.5) * drawBitT`（L12344）
- `drawByteBits`: `drawPayloadStart + (bitIdx + 0.5) * drawBitT`（L12390）
- `drawBitValues`: `drawPayloadStart + (bvi + 0.5) * drawBitT`（L12418）

`+ 0.5` 的意圖是把數字放在 cell 中點（對應 mid-cell transition）。**如果 baseStart 是 cell 邊界且 bitT 精確，這個算術是正確的。**

問題在於：
1. `bitT` 是測量值，有誤差
2. 誤差在多個 bit 後會累積
3. 實際波形的 edge 間距不是精確等間距的

---

## 5. SYNC 區域的 `drawRawBits` 分析

### 5.1 `syncStart` 的語義

`syncStart`（在 renderer 中）= `row.syncStartTime` = `frame.syncStartTime` (L11263)：
```js
syncStartTime = syncFirstEdge 
    ? Math.max(0, syncFirstEdge / sampleRate)  // 第一個 SYNC edge 的時間
    : Math.max(0, syncEndTime - syncCountBits * auxBitT);  // 算術 fallback
```

`syncFirstEdge` 是 SYNC 模式偵測到的**第一個 edge** (L11120)：
```js
if (!syncCount) {
    syncFirstEdge = edge;  // 第一個半週期 edge
}
```

### 5.2 第一個 edge 是 boundary 還是 mid-cell？

Manchester 編碼中，SYNC 全是 0（rising = 0）。AUX idle 狀態通常是 HIGH。所以：

```
IDLE (HIGH) → SYNC starts:
  ↓ falling (boundary)   ← syncFirstEdge 通常在這裡
  ↑ rising  (mid-cell)   = bit 0 的 transition
  ↓ falling (boundary)
  ↑ rising  (mid-cell)   = bit 1 的 transition
  ...
```

**如果 syncFirstEdge 是 boundary edge**（falling，cell 起點）：
- `drawRawBits` 用 `syncStart + (0 + 0.5) * bitT` = 中點 ✓

**如果 syncFirstEdge 是 mid-cell edge**（rising，某些非標準情況）：
- `drawRawBits` 用 `syncStart + (0 + 0.5) * bitT` = 比實際 edge 多偏了 0.5*bitT ✗

### 5.3 為什麼 SYNC 從未用 edge-walk？

可能的設計意圖：SYNC 全是 0，每個 bit 的波形完全相同，理論上純算術就夠了。而且 SYNC 的 edge 很規則，不像 payload 那樣 bit 值變化導致 boundary/mid-cell edge 交替出現。

**但這忽略了**：
1. `bitT` 測量誤差在 16+ 個 SYNC bit 後的累積
2. `syncFirstEdge` 可能不是 cell 邊界的情況
3. 波形的 jitter（edge 間距微小變化）

### 5.4 設計缺陷還是有意為之？

**是設計缺陷。** SYNC 區域因為「看起來簡單」（全是 0，等間距）而被跳過，但它和 payload 面臨同樣的累積漂移問題。從歷史看，v2.97.351/352 修 edge-walk 時只關注 payload，完全沒考慮 SYNC。v2.97.354 移除 edge-walk 時也沒提到 SYNC。

---

## 6. 根本解法建議

### 6.1 核心思路：單一事實來源

**所有 bit 的渲染位置都應該來自同一個計算流程，不是三個函式各自算。**

具體方案：

#### Step 1：在 decoder 端為每個 frame 產生完整的 `allBitTimes[]`

包含 SYNC + START + PAYLOAD + STOP 的所有 bit 時間，全部用 edge-walk：

```js
// 在 wfgLaDecodeDpAuxSourceRows 中，frame 輸出增加：
frame.syncBitTimes = buildSyncEdgeTimes(syncFirstEdge, syncCountBits, edges, ...);
frame.payloadBitTimes = bitTimes;  // 已有的 edge-parsed bitTimes
```

SYNC 的 edge-walk：
```js
function buildSyncEdgeTimes(firstEdge, count, edges) {
    var times = [];
    var ei = findEdgeIndex(edges, firstEdge);
    for (var i = 0; i < count; i++) {
        // SYNC bit 0 = rising edge
        // 找下一個 rising edge
        while (ei < edges.length && !isRisingEdge(ei)) ei++;
        if (ei < edges.length) {
            times.push(edges[ei] / sampleRate);
            ei++;
        } else {
            // fallback: 算術
            times.push(firstEdge / sampleRate + (i + 0.5) * bitT);
        }
    }
    return times;
}
```

#### Step 2：row 建構時將 syncBitTimes 也傳到 row

```js
row.syncBitTimes = frame.syncBitTimes || [];
```

#### Step 3：統一渲染函式

```js
function drawDigitsAtTimes(digits, times, yText, fallbackStart, fallbackBitT, skipRanges) {
    if (!digits.length) return;
    var drawBitT = Number(fallbackBitT) || bitT;
    if (xOf(fallbackStart + drawBitT) - xOf(fallbackStart) < 3.5) return;
    ctx.font = 'bold 12px "SF Mono", Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(2,6,23,0.98)';
    ctx.lineWidth = 2.5;
    for (var i = 0; i < digits.length; i++) {
        if (digits[i] == null) continue;
        var t = (times && times[i] != null) ? times[i] : (fallbackStart + (i + 0.5) * drawBitT);
        if (bitTimeInRanges(t, drawBitT, skipRanges)) continue;
        var x = xOf(t);
        if (x < g.drawX0 || x > g.cssW) continue;
        ctx.strokeText(String(digits[i]), x, yText);
        ctx.fillText(String(digits[i]), x, yText);
    }
    ctx.lineWidth = 1;
}
```

呼叫方式：
```js
// SYNC
drawDigitsAtTimes(
    Array(syncCount).fill(0),
    row.syncBitTimes,        // ← edge-walked SYNC times
    centerY, syncStart, bitT, auxAnomalyRanges
);

// Payload (有 bits)
drawDigitsAtTimes(
    bitsToDraw,
    bitTimes,                // ← row.bitTimes (edge-parsed)
    centerY, payloadStart, bitT, hhllSkipRanges
);

// Payload fallback (只有 raw bytes)
var byteDigits = [];
for (var rb = 0; rb < raw.length; rb++)
    for (var bi = 7; bi >= 0; bi--)
        byteDigits.push((raw[rb] >> bi) & 1);
drawDigitsAtTimes(
    byteDigits,
    bitTimes,
    centerY, payloadStart, bitT, hhllSkipRanges
);
```

#### Step 4：清理死碼和語義文件

1. **刪除** `wfgLaDpAuxBuildFrameRows`（含有錯誤的 `applyTiming + bitT/2`，從未被呼叫）
2. **在 decoder 輸出處加註釋**明確定義 bitTimes 的語義：
   ```js
   // bitTimes[i] = mid-cell transition time for bit i (seconds)
   // For Manchester: this is the edge that defines the bit value
   // For bit 0: rising edge time; for bit 1: falling edge time
   ```
3. **加入 debug assertion**（可在開發模式啟用）：
   ```js
   if (DEBUG && bitTimes.length && bitT > 0) {
       for (var di = 0; di < bitTimes.length; di++) {
           var expected = payloadStart + (di + 0.5) * bitT;
           if (Math.abs(bitTimes[di] - expected) > bitT * 0.4) {
               console.warn('bitTime drift:', di, bitTimes[di], expected);
           }
       }
   }
   ```

### 6.2 為什麼這次能一勞永逸？

| 過去的問題 | 解法如何解決 |
|-----------|------------|
| 三個函式各自定位 | 統一成一個 `drawDigitsAtTimes` |
| SYNC 沒有 edge-walk | decoder 端產生 `syncBitTimes` |
| bitTimes 語義混淆 | 明確文件化 + 刪除死碼中的 `+bitT/2` |
| edge-walk 被移除後無安全網 | edge-walk 移到 decoder 端，是 bitTimes 的一等公民而非渲染端補丁 |
| 算術 fallback 的累積漂移 | edge-walked times 是主路徑，算術只在完全沒有 edge 資料時才用 |

### 6.3 實作優先序

1. **P0**：統一三個繪製函式為一個（純重構，不改行為）
2. **P1**：在 decoder 端為 SYNC 區域也產生 edge-based bitTimes
3. **P2**：刪除死碼 `wfgLaDpAuxBuildFrameRows`
4. **P3**：加入 bitTimes 語義註釋和 debug assertion

---

## 附錄：完整資料流圖

```
┌─────────────────────────────────────────────────────┐
│  wfgLaDecodeDpAuxSourceRows (decoder)               │
│                                                     │
│  ┌─────────────────┐   ┌──────────────────────────┐ │
│  │ Edge Parser      │   │ Manchester Validator     │ │
│  │ L11200-11250     │   │ decodeManchesterBitsIn.. │ │
│  │                  │   │ L10919-10954             │ │
│  │ byteBitTimes     │   │ bitTimes                 │ │
│  │ = edges[i]/SR    │   │ = t0 + bitT*0.5          │ │
│  │ (精確 edge time) │   │ (算術 mid-cell time)     │ │
│  └──────┬──────────┘   └───────────┬──────────────┘ │
│         │                          │                 │
│         ▼                          ▼                 │
│  L11305: edgeParsedPayload?                          │
│    YES → bitTimes = edge bitTimes (精確)             │
│    NO  → bitTimes = 算術 bitTimes (有漂移)           │
│                                                     │
│  frame.bitTimes = bitTimes                           │
│  frame.syncStartTime = syncFirstEdge / sampleRate    │
│  frame.syncCount = syncCountBits                     │
└──────────────┬──────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────┐
│  wfgLaDpAuxSourceBuildRow (row builder, L10809)     │
│                                                     │
│  row.bitTimes = frame.bitTimes.slice()  ← 直接複製  │
│  row.syncStartTime = frame.syncStartTime            │
│  row.syncCount = frame.syncCount                    │
│  (不做任何偏移)                                      │
└──────────────┬──────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────┐
│  Overlay Renderer (L12230+)                         │
│                                                     │
│  bitTimes = row.bitTimes                             │
│  syncStart = row.syncStartTime                      │
│                                                     │
│  ┌──────────────┐                                   │
│  │ drawRawBits  │ ← SYNC: 純算術 t0+(i+0.5)*bitT   │
│  │              │   ⚠ 無 edge 資料，會累積漂移      │
│  └──────────────┘                                   │
│  ┌──────────────┐                                   │
│  │drawBitValues │ ← Payload 主路徑                  │
│  │              │   用 bitTimes[i]（精確，如果有）    │
│  │              │   fallback: 算術（有漂移）         │
│  └──────────────┘                                   │
│  ┌──────────────┐                                   │
│  │ drawByteBits │ ← Payload fallback                │
│  │              │   同上                            │
│  └──────────────┘                                   │
└─────────────────────────────────────────────────────┘

  ⚠ 死碼 (L9774 wfgLaDpAuxBuildFrameRows):
     applyTiming 做 bitTimes + bitT/2 — 語義錯誤
     但從未被呼叫，不影響當前行為
```

---

## 結論

問題反覆出現的根因不是個別函式的 bug，而是**架構設計**：

1. **三個繪製函式各自計算位置**——修一漏二
2. **bitTimes 語義未文件化**——寫程式的人不確定它代表什麼
3. **SYNC 被視為「不需要修」**——直到它壞了才發現也有同樣問題
4. **渲染端補丁 vs. decoder 端修正的拉鋸**——v2.97.351/352 在渲染端補，v2.97.353 在 decoder 端修，v2.97.354 移除渲染端補丁。但沒有一次是「整體重新設計」

**一勞永逸的解法是：統一繪製函式 + 在 decoder 端為所有區域（含 SYNC）產生 edge-based bitTimes + 明確定義 bitTimes 語義 + 清理死碼。**
