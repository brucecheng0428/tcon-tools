# AUX 解析器歷史變更與誤判修復報告

> 產生日期：2026-05-23
> 專案：tcon-tools-deploy (WFG / LA Logic Analyzer)
> 主檔案：wfg.html（原 index.html，Phase 4 後拆分）

---

## 一、時間線概覽

AUX 解析器的開發分為三個階段：

| 階段 | 時間 | 版本範圍 | 說明 |
|------|------|----------|------|
| AUX/DPCD 子頁工具 | 2026-04-18 ~ 04-19 | v1.14.0 ~ v1.17.0 | 獨立 AUX 解碼引擎 + DPCD 資料庫 + Manchester II 波形 |
| LA AUX Analyzer | 2026-05-08 ~ 05-10 | v2.97.150 ~ v2.97.228 | Codex 建立 LA 內建 DP AUX 解碼器，Claude 回歸後大量修正 |
| Overlay / Bit 對齊 | 2026-05-15 ~ 05-23 | v2.97.294 ~ v2.97.354 | preset 異常範例、bit 數字 edge-walk、overlay 修復 |

---

## 二、每次相關改動的詳細記錄

### 階段 1：AUX/DPCD 子頁工具（2026-04-18 ~ 04-19）

#### `7f50d2f` — 2026-04-18 — Add eDP AUX/DPCD 查詢工具
- 首次建立 AUX 解碼引擎：`auxDecodeRequest` / `auxDecodeReply`
- 196 筆中文教學級 DPCD 資料庫
- 8 種 AUX 命令支援

#### `48d9b56` — 2026-04-18 — v1.15.0：AUX 結構化輸入、異常值判斷
- 新增 `auxIsAbnormalDpcdByte` 異常偵測

#### `bcacf36` — 2026-04-18 — v1.15.1：修復多 byte AUX 解碼
- 修正多 byte 資料的解碼錯誤

#### `9d955e5` — 2026-04-19 — v1.17.0：新增 AUX 波形 Manchester II 功能
- 首次實作 Manchester II 編碼波形視覺化

#### `619cef2` — 2026-04-19 — 修正 AUX 波形 idle 電平
- idle 電平改為中間電平，移除多餘 idle 段

---

### 階段 2：LA AUX Analyzer — 核心解碼引擎（2026-05-08 ~ 05-10）

這是 AUX 誤判修復最密集的階段。Codex 在 05-08 建立了初版 LA AUX Analyzer（`ef620db`，+959 行），隨後在同一天和隔天進行了密集的 bug 修復。

#### `ef620db` — 2026-05-08 13:29 — Add DisplayPort AUX LA analyzer
- 初版 LA 內建 DP AUX 解碼器（+959 行）
- Manchester II 解碼核心邏輯
- SYNC preamble 偵測 + START/STOP 解析
- DPCD 交叉對照

#### `b1545bd` — 2026-05-08 21:38 — Flag AUX requests without replies (v2.97.151)
- **新增功能**：偵測 REQ 後面沒有跟著 REPLY 的異常情況
- 新增 `wfgLaMarkDpAuxCommunicationWarnings` 函式
- 加入 `.aux-no-reply` CSS 樣式（紅色高亮）

#### `89b975b` — 2026-05-08 22:20 — Tighten AUX sync validation (v2.97.152)
- **修復誤判類型：假 SYNC 誤識別**
- **問題**：preamble 前面如果有活動（preGap < 3*tHalf），解析器會錯誤地將非 SYNC 的 edge 序列當作合法 SYNC
- **修復**：新增 `syncFirstIndex` 追蹤 SYNC 起始位置，並檢查 preamble 前的間距（preGap）。若 preGap < 3*tHalf，代表 SYNC 之前還有活動，直接丟棄此 SYNC 候選
- **核心邏輯**：在 `inRange(dist, 5 * tHalf) && syncCount >= 2 * syncBits` 條件成立後，額外檢查 `preGap`

#### `46ef1a3` — 2026-05-08 22:24 — Match AUX preamble warning thresholds
- 對齊 preamble 警告閾值

#### `bb0cfb0` — 2026-05-08 22:30 — Keep AUX preamble highlight on sync
- 保持 SYNC 區域的 preamble 高亮

#### `9a44897` — 2026-05-08 22:47 — Flag undecodable AUX timing segments (v2.97.155)
- **新增功能**：將無法解碼的 AUX 時序區段標記為 FORMAT ERR
- 新增 `wfgLaDpAuxSourceBuildAnomalyRows` 函式
- ERR 判定條件：
  - anomaly 的 span 必須 >= `bitT * 12`（太短不算）
  - 與已解碼 frame 重疊超過 55% 的不算
  - 相鄰 anomaly 間距 <= `bitT * 4` 時合併
  - SYNC 計數 < `max(18, syncBits)` 時不標記（避免雜訊誤判）
- **修復誤判類型：雜訊被當成 ERR**
- 新增 `wfgLaMarkDpAuxCommunicationWarnings` 改進：跳過 auxAnomaly 行再找 REPLY

#### `2c548a5` — 2026-05-08 23:02 — Avoid flagging AUX short-turnaround replies (v2.97.156)
- **修復誤判類型：短 turnaround reply 被誤標為 ERR**
- **問題**：某些 AUX sink 回覆時間極短（short-turnaround），導致 reply 的 SYNC preamble 被解析器誤認為 "Invalid START timing"
- **修復**：新增 `isSystemRequestFrame` 檢查前一個 frame 是否為系統請求（cmd 0x0/0x1/0x4/0x5/0x8/0x9），若是且 turnaround 時間 <= 300us，則不標記為 anomaly

#### `4feaeb6` — 2026-05-08 23:06 — Decode short-turnaround AUX zero replies (v2.97.157)
- **修復誤判類型：零回覆的 short-turnaround reply 無法解碼**
- 新增 `shortReplyRequestInfo` + `addShortTurnaroundReplyFrame`
- 當 sync 計數接近預期 bit 數（容差 15%）時，自動產生 synthetic reply frame（bytes 全零）
- 標記 `syntheticReply: true`

#### `ae2642d` — 2026-05-08 23:12 — Fix AUX synthetic reply overlay span
- 修正 synthetic reply 在波形上的覆蓋範圍

#### `bca9d8d` — 2026-05-08 23:39 — Fix AUX long sync reply regression (v2.97.159)
- **修復誤判類型：長 SYNC reply 被誤認為 short-turnaround**
- **問題**：前一個修復（v2.97.157）的 `addShortTurnaroundReplyFrame` 邏輯太寬鬆，會把正常的長 SYNC reply 也當成 short-turnaround
- **修復**：重構為 `makeShortTurnaroundReplyFrame` + `isShortTurnaroundReplyCandidate`，加入更嚴格的驗證（turnaround 時間、預期 bit 數比對）

#### `30300db` — 2026-05-09 00:13 — Improve AUX frame recovery and preamble overlay (v2.97.160)
- 新增 `applyTiming` 統一設定 frame 的時序欄位（auxBitT, payloadStart/End, startRegion, stopRegion, bitTimes）
- 新增 `wfgLaMergeDpAuxSourceAndCandidateRows` 合併多來源解碼結果
- 改進 preamble overlay 渲染

#### `31c84a3` — 2026-05-09 00:36 — Require valid AUX framing for normal labels
- 正常標籤只在有效 framing 時顯示

#### `b2a173a` — 2026-05-09 00:46 — Label AUX HHLL as levels
- AUX HHLL 模式標註為電平等級

#### `5e72b8d` — 2026-05-09 00:49 — Show HHLL only on AUX format errors
- HHLL 標示僅出現在 format error 區段

#### `a519166` — 2026-05-09 01:08 — Expand AUX format error overlays
- 擴展 ERR overlay 顯示範圍

#### `4bee15c` — 2026-05-09 01:34 — Render AUX error segment labels
- ERR 區段加上文字標籤

#### `57f1c79` — 2026-05-09 02:53 — Fix AUX error overlay decoding (v2.97.166)
- 新增 `debug_la` 調試模式（URL param），可匯出完整解碼結果供檢查
- 修正 ERR overlay 的解碼顯示問題

#### `481f9df` — 2026-05-10 02:30 — 修正 LA AUX preamble 異常解碼 (v2.97.216)
- **修復誤判類型：短 format error 被錯誤合併/過濾**
- **問題**：`wfgLaDpAuxSourceBuildAnomalyRows` 的過濾條件 `span < bitT * 12` 會把短小的真實 format error 過濾掉
- **修復**：新增 `shortFormatError` 標記，短 format error 不受最小 span 過濾、不與相鄰 anomaly 合併
- 新增 `syncBits` 可調參數（Min SYNC bits），預設 16

#### `1aa248e` — 2026-05-10 03:01 — 修正 LA AUX ERR 區段判定 (v2.97.218)
- **修復誤判類型：正常 frame 的 stop-to-preamble 過渡被誤標為 ERR**
- **問題**：當一個正常 frame 的 STOP 緊接著下一個 frame 的 preamble 時，preGap < 3*tHalf 的檢查會錯誤拒絕合法 SYNC
- **修復**：
  - 新增 `lastFrameStopEndSample` 追蹤上一個 frame 結束位置
  - 新增 `followsPreviousStop` 檢查：如果前一個 edge 正好在上一個 frame 的 stop 範圍內，則視為合法過渡
  - 新增 `pendingPrefixFormatError` 機制：不立即標記 ERR，而是暫存等確認
  - 新增 `isHalfRange` + `precedingHalfRunGapCount` + `precedingActivityStartSample` 輔助函式
  - **分類 preGap 異常**：
    1. `followsPreviousStop` → 正常，清除 pending error
    2. `preGap <= glitchMax && previousQuiet` → "Narrow AUX format glitch"
    3. `preGap > glitchMax && !isHalfRange(preGap)` → "AUX preamble gap format error"
    4. 其他 → 丟棄 SYNC 候選

#### `7afd5c3` — 2026-05-10 03:18 — 補齊 LA AUX ERR 與 SYNC 警示 (v2.97.219)
- 新增 `wfgLaMarkDpAuxPreambleWarnings`：SYNC 計數 18~25 為黃色警告，<18 為紅色錯誤
- 新增 `wfgLaNumberDpAuxRows`：統一行號排序
- 新增 `.aux-sync-warn` CSS 樣式

#### `3310143` — 2026-05-10 09:23 — 修正 LA AUX ERR overlay 疊影 (v2.97.226)
- **修復顯示 bug**：ERR overlay 與正常 frame overlay 重疊
- **修復**：ERR row（`row.auxAnomaly`）不繪製正常的黑底白字 overlay，避免疊影

---

### 階段 3：Preset / Overlay / Bit 對齊（2026-05-15 ~ 05-23）

#### `0ccfe66` — 2026-05-15 — v2.97.294：新增 AUX 異常範例 preset
- 內建 AUX 異常範例的 LA preset 資料（+17,308 行 kvdat base64 資料）

#### `defb9fa` — 2026-05-16 — v2.97.317：放大 overlay 字體並補齊 AUX overlay
#### `d4e45b2` — 2026-05-16 — v2.97.318：移除 AUX 粗略覆蓋區
#### `282e6e2` — 2026-05-17 — Restore AUX payload bit overlay
#### `f6344f8` — 2026-05-17 — Snap AUX fallback bits to waveform edges
- 將 fallback bits 對齊到實際波形 edges

#### `93cb724` — 2026-05-17 — Match AUX fallback bits by edge direction
- 根據 edge 方向匹配 fallback bits（rising→0, falling→1）

#### `0dfab4b` — 2026-05-17 — Match AUX fallback bits by configured period
- 按設定的 bit period 匹配 fallback bits

#### `1556a81` — 2026-05-17 — Restore AUX preset ERR overlay metadata (v2.97.331)
- 修復 preset 中的 ERR overlay metadata

#### `1c471a9` — 2026-05-20 — v2.97.350：fix AUX encoded digit positions
- 修正 AUX 編碼數字的位置

#### `09c039c` — 2026-05-21 00:18 — v2.97.351：AUX bit digit edge-walk
- **修復誤判類型：bit 數字位置累計漂移**
- **問題**：`decodeManchesterBitsInRange` 使用 `startTime + mbi * bitT` 純算術定位，長序列會累計漂移
- **修復**：`drawByteBits` 改用 sequential edge-walk，每個 Manchester digit 綁定實際 mid-cell transition edge

#### `26e68eb` — 2026-05-21 00:30 — v2.97.352：fix AUX bit drift in drawBitValues
- **修復同類問題**：v2.97.351 只修了 `drawByteBits`，但實際解碼行走的是 `drawBitValues`（有 `row.bits`）
- 同樣加入 edge-walk

#### `9aecda8` — 2026-05-21 01:01 — v2.97.353：fix AUX bitTimes override
- **修復**：保留 decoder 端 edge-parsed 的精確 bitTimes，不被覆蓋

#### `2351080` — 2026-05-23 16:01 — 修復 Manchester II bit 數字對齊（最終統一版）
- **根本性修復**：統一三條繪製路徑 `drawRawBits`/`drawByteBits`/`drawBitValues` 為單一 `drawDigitsAtTimes`
- decoder 端為 SYNC 區域產生 edge-based `syncBitTimes`（走訪 rising edges）
- 刪除死碼 `wfgLaDpAuxBuildFrameRows`（含錯誤的 `applyTiming +bitT/2`）
- 加入 runtime drift guard（bitTimes 偏差 > 0.4*bitT 時 console.warn）
- 加入醒目警告註解：Manchester II 規則 + 相關函式清單
- bitTimes 語義文件化：mid-cell transition 時間（秒）

---

## 三、AUX 誤判類型總結

| # | 誤判類型 | 修復版本 | 根因 | 修復方式 |
|---|----------|----------|------|----------|
| 1 | 假 SYNC 誤識別 | v2.97.152 | SYNC 前有活動但被忽略 | 檢查 preGap < 3*tHalf 時丟棄 |
| 2 | 雜訊被當成 ERR | v2.97.155 | 無過濾機制 | span < bitT*12 過濾 + SYNC 計數門檻 |
| 3 | Short-turnaround reply 誤標 ERR | v2.97.156 | 短回覆時間被誤認為 invalid timing | 檢查是否為系統請求 + turnaround <= 300us |
| 4 | 零回覆 reply 無法解碼 | v2.97.157 | 無 synthetic reply 機制 | 自動產生 synthetic reply frame |
| 5 | 長 SYNC reply 誤認為 short-turnaround | v2.97.159 | short-turnaround 判斷太寬鬆 | 加嚴驗證條件 |
| 6 | 短 format error 被過濾 | v2.97.216 | span < bitT*12 過濾掉真實短 error | shortFormatError 標記繞過過濾 |
| 7 | Stop-to-preamble 過渡被誤標 ERR | v2.97.218 | preGap 檢查不考慮正常 frame 銜接 | followsPreviousStop + pendingPrefixFormatError |
| 8 | ERR overlay 疊影 | v2.97.226 | ERR row 也畫正常 overlay | auxAnomaly 行跳過正常 overlay |
| 9 | Bit 數字累計漂移 | v2.97.351~354 | 純算術 `startTime + i*bitT` 定位 | edge-walk 綁定實際波形 edge |
| 10 | 三條繪製路徑不一致 | v2.97.354(2351080) | drawRawBits/drawByteBits/drawBitValues 各自算位置 | 統一為 drawDigitsAtTimes |

---

## 四、目前 AUX 解析器核心邏輯概述

### 4.1 入口函式

`wfgLaDecodeDpAuxSourceRows(decoded, cfg, ch)` — 位於 wfg.html L10778

### 4.2 Manchester II 編碼規則

- bit 0 = rising edge (L->H)
- bit 1 = falling edge (H->L)
- 由 `manchesterBitFromTransition(beforeLevel, afterLevel)` 定義

### 4.3 SYNC Preamble 偵測

- 以 `inRange(dist, tHalf)` 檢查連續 edge 間距是否為半週期
- 累計 `syncCount`，需達到 `2 * syncBits`（預設 syncBits=16，即 32 個 half-bit edges）
- 偵測到 `inRange(dist, 5 * tHalf)` 時視為 START 的開始

### 4.4 START 驗證

START 由 HHLL 模式組成（5*tHalf gap）。驗證邏輯：
1. 檢查 `bitStateAfterEdge(i) === 0`（必須是正確的電平）
2. 下一個 gap 必須也是 `5*tHalf` 或 `4*tHalf`
3. 不符合時標記為 "Invalid START timing" 或 "Invalid START level" anomaly

### 4.5 preGap 分類（v2.97.218 引入）

當 SYNC 前的間距 `preGap < 3*tHalf` 時，分四類處理：
1. **followsPreviousStop**：前一個 edge 在上一個 frame 的 stop 範圍內 → 正常
2. **Narrow glitch**：preGap <= glitchMax 且之前安靜 → 標記為 "Narrow AUX format glitch"
3. **Preamble gap error**：preGap > glitchMax 且不是半週期 → 標記為 "AUX preamble gap format error"
4. **其他**：丟棄此 SYNC 候選，重新搜尋

### 4.6 Payload 解碼

逐 byte 讀取 8 個 Manchester bit：
- 每個 bit 透過 `manchesterBitFromTransition` 判斷
- bit 間的間距必須為 `tHalf`（同方向）或 `2*tHalf`（跨方向）
- 不符合時中斷解碼

### 4.7 STOP 偵測

payload 結束後檢查間距：
- `tHalf` 或 `2*tHalf` → 正常 STOP
- 其他 → 中斷

### 4.8 Anomaly 處理流程

1. `addAnomaly` — 記錄完整 anomaly（含 SYNC 計數門檻）
2. `addShortFormatError` — 記錄短 format error（不受 span 過濾）
3. `addUnparsedActivityAnomalies` — 掃描所有未被 frame/anomaly 覆蓋的活動區段
4. `wfgLaDpAuxSourceBuildAnomalyRows` — 將 anomaly 轉為顯示用的 ERR row
5. `wfgLaNormalizeDpAuxAnomalyRows` — 正規化 anomaly row
6. `wfgLaMarkDpAuxCommunicationWarnings` — 標記 REQ 無 REPLY
7. `wfgLaMarkDpAuxPreambleWarnings` — SYNC 計數警告（18~25 黃色 / <18 紅色）

### 4.9 ERR 判定條件總結

一個時序區段被判定為 ERR 需滿足：
1. SYNC 計數 >= syncBits（預設 16），**或**是 shortFormatError
2. 不與已成功解碼的 frame 大幅重疊（>55%）
3. 非 short-turnaround reply（系統請求後 300us 內的不算）
4. 非正常 frame 的 stop-to-preamble 過渡
5. Span >= bitT * 12（shortFormatError 除外）

### 4.10 Bit 數字繪製

統一由 `drawDigitsAtTimes` 負責，使用 edge-based bitTimes：
- bitTimes 語義：每個 bit 的 mid-cell transition 絕對時間（秒）
- SYNC 區域使用 `syncBitTimes`（decoder 端產生）
- Runtime drift guard：偏差 > 0.4*bitT 時發出 console.warn

---

## 五、經驗教訓

### 5.1 AUX 協議的邊界情況極多

DisplayPort AUX 通訊的實際波形遠比規格書描述的複雜：
- Short-turnaround reply：某些 sink 回覆極快，preamble 可能極短或缺失
- Stop-to-preamble 無間隔：連續封包之間可能沒有 idle gap
- Glitch：實際線路上會有窄脈衝雜訊

### 5.2 ERR 判定必須保守

- v2.97.155 的教訓：SYNC 計數門檻太低會把雜訊標成 ERR
- v2.97.156 的教訓：不考慮通訊情境就標 ERR 會產生大量 false positive
- v2.97.218 的教訓：不追蹤 frame 銜接關係會把正常過渡誤判

### 5.3 多條繪製路徑是 bug 溫床

v2.97.351~354 的四輪修復證明：同一個功能（bit 數字繪製）有三條獨立路徑時，改一條漏兩條是必然的。最終統一為 `drawDigitsAtTimes` 才根本解決。

### 5.4 先讀再改、用使用者的條件驗證

Manchester II 的 bit 對齊問題經歷了 4 輪修復退化，根因是每次只看局部不看全貌。鐵律記錄在 `feedback_manchester_bit_alignment.md`。

### 5.5 測試資料的重要性

v2.97.294 內建 AUX 異常範例 preset（+17,308 行 kvdat 資料），讓後續開發都能快速驗證 ERR 判定邏輯，大幅減少回歸問題。
