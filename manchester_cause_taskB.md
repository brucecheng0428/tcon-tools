# 曼徹斯特編碼 01 對齊問題 — Task B 調查報告

## 結論

**主要原因：commit `705f274` (v2.97.354) 移除了渲染端 edge-walk 對齊邏輯。**

v2.97.351/352 加入的 edge-walk 是將每個 Manchester bit 數字直接綁定到實際波形 transition edge 的機制（0 綁 rising edge、1 綁 falling edge）。v2.97.354 以「decoder 源頭已修復」為由，將 `drawBitValues` 和 `drawByteBits` 中的 edge-walk 邏輯**全部刪除**（75 行程式碼），回退到使用 decoder 提供的 `bitTimes` 或算術定位。

**次要問題：SYNC 區域的 `drawRawBits` 從未有過 edge-walk，一直使用算術定位。**

---

## 時間線

| Commit | 版本 | 改動 |
|--------|------|------|
| `09c039c` | v2.97.351 | 在 `drawByteBits` 加入 edge-walk，修復 bit drift |
| `26e68eb` | v2.97.352 | 在 `drawBitValues` 也加入 edge-walk（這才是實際繪製路徑） |
| `9aecda8` | v2.97.353 | 修正 decoder 端：保留 edge-parsed bitTimes，不被 sampledPayload 算術 bitTimes 覆蓋 |
| **`705f274`** | **v2.97.354** | **移除 drawByteBits + drawBitValues 中所有 edge-walk 邏輯（75 行）** |
| `4a66a1b` | — | CSS：decode-expanded grid 改為 4fr 3fr + 移除 preset-attention class |
| `79a9e61` | — | CSS：wfg-la-main grid 改為 4fr 3fr |
| `1ea3290` | — | CSS：還原 workbench.decode-expanded 為 minmax 值 |

---

## 詳細分析

### 1. 被刪除的 edge-walk 邏輯（v2.97.354 刪的內容）

**drawByteBits 中被刪的：**
```javascript
// v2.97.351 加入的 edge-walk
function buildDpAuxFallbackTimes() {
  // 從實際波形 edges 逐一走訪
  // Manchester: bit 0 = rising edge, bit 1 = falling edge
  // 跳過 boundary transition，只記錄 mid-cell edge time
  var ei = wfgLaLowerBound(edges, drawPayloadStart - drawBitT * 0.4);
  for (var ai = 0; ai < bitTotal && ei < edges.length; ai++) {
    var bitVal = rawBitValue(ai);
    var desired = bitVal ? 'falling' : 'rising';
    // ... 比對 edge 方向，記錄實際 edge time
    out[ai] = edges[ei];
    ei++;
  }
}
```

**drawBitValues 中被刪的：**
```javascript
// v2.97.352 加入的 edge-walk
var auxEdgeTimes = null;
if (analyzer.type === 'dp_aux' && drawBitT > 0) {
  // 同樣的 edge-walk 邏輯
  // 直接綁定每個 digit 到 mid-cell transition edge
  auxEdgeTimes[abi] = awEdges[aei]; // actual edge time
}
// 繪製時使用：
var bitTime = auxEdgeTimes && auxEdgeTimes[bvi] != null 
  ? auxEdgeTimes[bvi]   // ← edge-walk 精確定位
  : times[bvi];          // ← fallback
```

**刪除後變成：**
```javascript
var bitTime = times[bvi];  // 只用 decoder 的 bitTimes
if (bitTime == null) bitTime = drawPayloadStart + (bvi + 0.5) * drawBitT;  // 算術 fallback
```

### 2. v2.97.353 的 decoder 修復是否足夠？

v2.97.353 修了 decoder 端，讓 `row.bitTimes` 保留 edge-parsed 的精確時間而非被 `sampledPayload` 的算術 bitTimes 覆蓋：

```javascript
if (edgeParsedPayload) {
  bitTimes = bitTimes.slice(0, expectedBits);  // 保留 edge-parsed times
} else {
  bitTimes = sampledPayload.bitTimes.slice(0, expectedBits);  // 算術 fallback
}
```

Decoder edge parser 存的 bitTimes 是 `edges[i] / sampleRate`（實際 edge 時間），**理論上**應該正確。但有一個問題：

decoder 的 edge-parsed bitTimes 是在 **解碼階段** 記錄的 edge 時間，而 v2.97.351/352 的 rendering edge-walk 是在 **繪製階段** 從波形資料重新走訪 edges。兩者的 edge index 起點和走訪邏輯有微妙差異，可能在某些情況下產生不同結果。

### 3. SYNC 區域的根本問題

SYNC bits 使用 `drawRawBits(syncStart, Array(syncCount).fill(0), ...)`:

```javascript
// drawRawBits 內部：
var rawBitTime = t0 + (dbi + 0.5) * drawBitT;
// 即 syncStart + (dbi + 0.5) * bitT
```

`syncStart = syncFirstEdge / sampleRate`，而 `syncFirstEdge` 是 SYNC 模式的**第一個 edge**。

問題在於：這第一個 edge 可能是 **boundary edge（falling）** 或 **mid-cell edge（rising）**，取決於 SYNC 前的信號電位：

- 如果 SYNC 前是 HIGH → 第一個 edge 是 falling boundary → `syncStart` 在 bit period 邊界 → 0.5 偏移正確 ✓
- 如果 SYNC 前是 LOW → 第一個 edge 是 rising mid-cell → `syncStart` 在 mid-cell → 0.5 偏移多餘，0 顯示在兩個 rising edge 中間 ✗

**SYNC 的 `drawRawBits` 從未有 edge-walk 補償，它一直使用純算術定位。**

### 4. CSS 改動的影響

最近 3 個 commit（`4a66a1b`, `79a9e61`, `1ea3290`）只改了 CSS grid 佈局：
- `grid-template-columns: 4fr 3fr`（scope vs decode panel 比例）
- `min-width: 0` 和 `overflow: hidden`
- decode table 的 `table-layout`, `white-space`, `word-break`

這些改動 **不直接影響 bit position 計算**，但改變了 canvas 的實際 CSS 寬度。`xOf()` 函式會根據 canvas 寬度做時間→像素轉換，所以不同寬度下，同樣的時間偏差在像素層面可能更大或更小，使原本潛在的對齊問題變得更明顯或更不明顯。

---

## 問題點整理

1. **`drawBitValues` / `drawByteBits`（payload bits）**：v2.97.354 刪除 edge-walk 後，依賴 decoder 的 `row.bitTimes`。如果 decoder 的 edge-parsed bitTimes 正確，payload 對齊應該沒問題。但需要實際驗證 decoder 在各種情況下都能正確記錄 mid-cell edge time。

2. **`drawRawBits`（SYNC bits）**：從未有 edge-walk，一直使用 `syncStart + (dbi + 0.5) * bitT` 算術定位。根據 `syncFirstEdge` 是 boundary 還是 mid-cell edge，可能有 0.5 × bitT 的系統性偏差。

3. **edge-walk 被刪除的根本原因**：v2.97.354 的 commit message 只說「decoder 源頭已修復」，但沒有驗證過 SYNC 區域（因為 SYNC 從來不用 edge-walk），也沒有完整驗證 decoder bitTimes 在所有邊界情況下都正確。

---

## 建議修復方向

1. **恢復 drawBitValues / drawByteBits 的 edge-walk**：從 v2.97.352 的 commit 中恢復 edge-walk 邏輯，作為 decoder bitTimes 的補充/覆蓋
2. **為 SYNC 加入 edge-walk**：`drawRawBits` 也需要根據實際波形 edges 對齊，而非純算術定位
3. **或者**：統一在 decoder 端為 SYNC 也產生 edge-based bitTimes，讓渲染端統一使用
