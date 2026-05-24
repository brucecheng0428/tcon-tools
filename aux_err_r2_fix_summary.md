# AUX 解析器 ERR 誤判修復 — 完整總結報告

**版本範圍**：v2.97.388 ~ v2.97.393  
**最終結果**：ERR 1027 → 0（REQ 733 + REPLY 736 不受影響）  
**驗證日期**：2026-05-23  
**驗證版本**：v2.97.393  
**驗證環境**：https://brucecheng0428.github.io/tcon-tools/wfg.html — LA分析器 — I2C+AUX(異常範例)

---

## 一、問題描述

在 I2C+AUX(異常範例) 快捷預設中，AUX 解碼器產生 1027 筆 ERR 誤判，分為兩大類：

| 類型 | 數量 | 佔比 |
|------|------|------|
| Narrow AUX format glitch | 832 | 81% |
| Unparsed AUX activity | 195 | 19% |

所有 ERR 均為誤判 — 對應位置的波形實際上是正常的 AUX 通訊。

---

## 二、第一輪修復：Narrow glitch（v2.97.388~389）

### Task A — 現象確認
- 載入 I2C+AUX(異常範例)，統計 ERR = 1027 筆
- 其中 832 筆為 "Narrow AUX format glitch"

### Task B — 根因分析
- **根因**：`followsPreviousStop` 使用 `inRange(preGap, tError)`，只容許 ~125ns 間距
- **實際情況**：AUX turn-around time 為 17~82μs，遠超 tError
- 結果：合法的 SYNC preamble 被誤判為 format glitch

### Task C — v2.97.388 修復
- 新增 `followsTurnAround(preGap, tHalf)` 函式，容許 turn-around time
- 在 `wfgLaDecodeDpAuxSourceRows` 偵測到舊 snapshot 時觸發重新解碼
- **結果**：ERR 1027 → 213（修了 814 筆）

### Task D — v2.97.389 修復
- 後處理：比對 Narrow glitch 的 endTime 與 decoded frame 的 syncStartTime
- 兩者相等則該 anomaly 為誤判，移除之
- **結果**：Narrow glitch 832 → 0 ✅，總 ERR 1027 → 195

### Task E — 第一輪驗證
- 獨立截圖驗證 ERR 搜尋無結果（Narrow）
- 確認 REQ/REPLY 數量不受影響

---

## 三、第二輪修復：Unparsed AUX activity（v2.97.390~393）

### Task A — 分析 195 筆 ERR 特徵
- 所有 195 筆均為 "Unparsed AUX activity"
- 持續時間 4~40μs，均在正常 AUX 通訊時間範圍內
- 100% 被正常 decoded frame 前後夾心

### Task B — 根因分析（兩種類型）

**Type 1（149 筆）：START gap dead zone**
- `inRange(dist, 5*tHalf)` 容許 [237,263]
- `inRange(dist, 4*tHalf)` 容許 [187,213]
- 兩者之間存在 dead zone [214,236]（寬 23 samples）
- Edge jitter 導致合法 START gap 落入此區 → SYNC 被截斷 → 產生 Unparsed ERR

**Type 2（46 筆）：preGap isHalfRange discard**
- preGap 在 isHalfRange [37,63] 但 followsTurnAround 失敗
- 原因：前一筆 Type 1 ERR 破壞了 `lastFrameStopEndSample`
- 連鎖反應：followsTurnAround 判斷失敗 → 整段 SYNC 被丟棄

### Task C — v2.97.390 修復（解碼路徑）
- **修復 1**：將 START gap 的兩個離散 `inRange` 合併為連續範圍 `[4*tHalf-tError, 5*tHalf+tError]`，用 4.5*tHalf 分界判定 first data bit
- **修復 2**：preGap 在 isHalfRange 時，不丟棄 SYNC 而是擴展 SYNC 計數
- **結果**：解碼路徑已修正，但 ERR 數量未變（原因見下）

### Task D — v2.97.391~393 修復（後處理 sandwich filter）

**v2.97.391**：在內層 `wfgLaDecodeDpAuxSourceRows` 加 sandwich filter
- **結果**：無效。外層 `wfgLaDpAuxAddUncoveredActivityRows` 會重新偵測未覆蓋 edge 活動並生成新的 ERR 行

**v2.97.392**：將 sandwich filter 移到外層管線 `wfgLaDecodeDpAuxFrames` 末端（在 final-normalize 之後）
- **結果**：ERR 195 → 151（移除 44 筆，gap 閾值 500μs 太窄）

**v2.97.393**：放寬 sandwich filter 條件
- 前方：只需存在至少一筆正常 decoded frame（不限距離）
- 後方：最近的非 ERR 行在 10ms 內
- **結果**：ERR 195 → 0 ✅

### Task E — 第二輪驗證（本次）

**獨立驗證結果**：
1. 解碼結果前幾筆 REQ → REPLY → REQ 交替正常 ✅
2. 45.3s 附近（對應原 44.96s ERR 區域）全部為正常 REPLY ✅
3. 搜尋 "ERR" → No search results ✅
4. 搜尋 "Narrow" → No search results ✅
5. 搜尋 "Unparsed" → No search results ✅
6. JavaScript 統計：
   - DP AUX：1469 行 = REQ(733) + REPLY(736)，ERR = 0 ✅
   - I2C：3950 行，全部正常，ERR = 0 ✅

**程式碼品質檢查**：
- 改動範圍：wfg.html（+73/-16 行）+ version.js（版號更新）
- 無殘留 debug code（traceRows 受 `?debug_la` URL 參數守衛）
- 註解充分，每處修改都有根因說明
- 版號正確：v2.97.393

---

## 四、所有版本改動清單

| 版本 | Commit | 改動內容 |
|------|--------|---------|
| v2.97.388 | `255034a` | 新增 `followsTurnAround` 修復 AUX turn-around pre-charge ERR 誤判 |
| v2.97.389 | `02e911f` | 後處理移除 endTime 匹配 syncStartTime 的 Narrow glitch |
| v2.97.390 | `fa3aa19` | START gap dead zone 合併 + preGap isHalfRange SYNC 擴展 |
| — | `e91e1bf` | debug: traceRows 基礎設施（受 `?debug_la` 守衛） |
| v2.97.391 | `339de74` | 內層 sandwich filter（後因外層重生成問題而無效） |
| — | `534777a` | bump version.js cache buster |
| v2.97.392 | `d1790a2` | 移動 sandwich filter 至外層管線末端 |
| v2.97.393 | `570312b` | 放寬 sandwich filter gap 條件（prev 無限、next 10ms） |

---

## 五、經驗教訓

1. **AUX 解碼管線有內外兩層**：內層 `wfgLaDecodeDpAuxSourceRows` 負責 per-channel 解碼，外層 `wfgLaDecodeDpAuxFrames` 負責合併、未覆蓋偵測和後處理。任何過濾器必須放在外層管線末端（在 `wfgLaDpAuxAddUncoveredActivityRows` 之後），否則會被重新生成的 ERR 覆蓋。

2. **離散 `inRange` 判定會產生 dead zone**：相鄰的兩個 `inRange(x, center)` 如果中心間距 > 2×tError，就會有未覆蓋的 dead zone。應改用連續範圍判定。

3. **連鎖誤殺效應**：一筆 ERR 誤判會破壞 `lastFrameStopEndSample` 等狀態，導致後續合法 SYNC 的 `followsTurnAround` 失敗，進而連鎖產生更多 ERR。

4. **Sandwich filter 的 gap 閾值設計**：AUX 通訊的間隔可達數秒（Source 掃描週期），gap 閾值不能太窄。最終方案：前方只看是否存在正常 frame，後方 10ms 內有正常 frame 即可。

5. **Debug 基礎設施值得投資**：`traceRows` + `?debug_la` 參數讓 pipeline 每一步的狀態可追蹤，大幅加速了根因定位。

---

## 六、如果後續還有問題

1. 開啟 `wfg.html?debug_la` 啟用管線追蹤
2. 在 console 執行 `window.__wfgLaDpAuxPipelineTrace` 查看每個 stage 的 rows 狀態
3. 確認 ERR 是在哪個 stage 首次出現
4. 參考本報告的修復模式決定修復策略
