# DPCD 資料庫第三次獨立審查報告

**審查日期**：2026-05-22  
**審查範圍**：`data/dpcd-db.js` 中指定暫存器 + 抽查暫存器  
**參考規格書**：DP_v1_2.pdf, DP_v1_3.pdf, DP_v1.4a_mem.pdf, DP_v2.0_mem_2019.pdf, eDP_v1_3.pdf, eDP_v1_4b.pdf, eDP-v1.5-mem.pdf

---

## 問題總覽

| # | DPCD 地址 | 問題 bit | 嚴重程度 | 簡述 |
|---|-----------|----------|----------|------|
| 1 | 0000Ch | bit 1~5 | CRITICAL | I2C 速率整組錯位，遺漏 5Kbps |
| 2 | 00070h | bit 7:0 | CRITICAL | PSR_SUPPORT 應為 enum 值而非 bit field |
| 3 | 00071h | bit 3:1 | CRITICAL | PSR_SETUP_TIME 範圍錯誤（應為連續 3-bit） |
| 4 | 00071h | bit 4 | CRITICAL | Y_COORDINATE_REQUIRED 被誤標為 SETUP_TIME 高位 |
| 5 | 00090h | bit 1~6 | CRITICAL | FEC_CAPABILITY bit 定義幾乎全部錯誤 |
| 6 | 00200h | bit 7 | MAJOR | SINK_COUNT bit 7 是 MSB 非 RESERVED |
| 7 | 00211h | bit 7 | MAJOR | VALID flag 被誤標為 OVERFLOW（語義相反） |
| 8 | 00003h | bit 6 | MAJOR | 名稱應為 NO_AUX_TRANSACTION（非 HANDSHAKE） |
| 9 | 00003h | bit 1 | MAJOR | 遺漏 DP 2.0 STREAM_REGENERATION_STATUS_CAPABILITY |
| 10 | 00008h | bit 3 | MAJOR | 遺漏 HBLANK_EXPANSION_CAPABLE (DP 1.4) |
| 11 | 00008h | bit 4 | MAJOR | 遺漏 BUFFER_SIZE_UNIT (DP 1.4) |
| 12 | 00008h | bit 5 | MAJOR | 遺漏 BUFFER_SIZE_PER_PORT (DP 1.4) |
| 13 | 0006Dh | bit 2:0 | MAJOR | 應為 DSC_SLICE_CAPABILITIES_2 非 RESERVED |
| 14 | 0006Fh | bit 2:0 | MAJOR | 應為 DSC_BITS_PER_PIXEL_INCREMENT 非 RESERVED |
| 15 | 00071h | bit 5 | MAJOR | 遺漏 SU_GRANULARITY_REQUIRED (eDP 1.4b) |
| 16 | 00071h | bit 6 | MAJOR | 遺漏 FRAME_SYNC_NOT_NEEDED (eDP 1.5) |
| 17 | 00218h | bit 7 | MAJOR | TEST_AUDIO_PATTERN 應為 TEST_AUDIO_DISABLED_VIDEO (DP 2.0) |
| 18 | 00218h | bit 4 | MAJOR | FAUX_TEST_PATTERN 已在 DP 1.3 deprecated |
| 19 | 00600h | bit 2:0 | MAJOR | 05h 描述「AUX off」與規格書語義相反 |
| 20 | 00600h | bit 6 | MAJOR | 遺漏 SET_DN_DEVICE_DP_PWR_12V |
| 21 | 00600h | bit 7 | MAJOR | 遺漏 SET_DN_DEVICE_DP_PWR_18V |
| 22 | 00060h | bit 2~3 | MINOR | 遺漏 DP 2.0 Dynamic PPS Update bits |
| 23 | 00080h | bit 7 | MINOR | NON_EDID_DWN_STRM_PORT 名稱非規格書用語 |
| 24 | 00080h | bit 6:4 | MINOR | 缺少條件性定義（依 DETAILED_CAP_INFO） |
| 25 | 00703h | bit 2:1 | MINOR | 遺漏 eDP 1.5 BACKLIGHT_BRIGHTNESS_BIT_ALIGNMENT |
| 26 | 00218h | bit 5:4 | MINOR | 遺漏 DP 2.0 PHY_TEST_CHANNEL_CODING_TYPE |
| 27 | 00218h | bit 6 | MINOR | 遺漏 DP 2.0 TEST_AUDIO_PATTERN_REQUESTED |

**統計：CRITICAL × 5、MAJOR × 16、MINOR × 6，共 27 個問題**

---

## 詳細問題描述

### 問題 #1 — 0000Ch I2C_SPEED_CAP：速率整組錯位 [CRITICAL]

**問題 bit**：bit 1 ~ bit 5

**目前 DB 定義**：
- bit 4: I2C_1MBPS
- bit 3: I2C_400KBPS
- bit 2: I2C_100KBPS
- bit 1: I2C_10KBPS
- bit 0: I2C_1KBPS
- bit 7:5: RESERVED

**規格書正確定義**：
- bit 5: I2C_1MBPS (1Mbps)
- bit 4: I2C_400KBPS (400Kbps)
- bit 3: I2C_100KBPS (100Kbps)
- bit 2: I2C_10KBPS (10Kbps)
- bit 1: **I2C_5KBPS (5Kbps)** ← 遺漏的速率
- bit 0: I2C_1KBPS (1Kbps)
- bit 7:6: RESERVED

**根因**：DB 遺漏了 **5Kbps (bit 1)**，導致 bit 2~5 的速率全部向低位偏移一格，同時 1Mbps (bit 5) 被錯誤地標為 RESERVED。

**依據**：DP_v1.4a_mem.pdf Page 388  
**版本適用**：DP 1.2 / 1.3 / 1.4 / 2.0（所有版本均有 5Kbps）

---

### 問題 #2 — 00070h PSR_SUPPORT：enum 誤拆為 bit field [CRITICAL]

**問題 bit**：bit 7:0 全部

**目前 DB 定義**：
- bit 7:3: RESERVED
- bit 2: Y_COORDINATE_REQUIRED
- bit 1: PSR2_SUPPORTED
- bit 0: PSR_SUPPORT

**規格書正確定義**：整個 byte 是一個 **8-bit 列舉值**（enum），不是 bit field：
- 00h = 不支援 PSR
- 01h = PSR1 支援
- 02h = PSR2 支援（不需 Y 座標）
- 03h = PSR2 支援（需要 Y 座標）
- 04h = PSR2 + SU Region Early Transport（eDP v1.5 新增）

**影響**：DB 的 bit field 解讀碰巧與低值相容（01h/02h/03h），但無法表達 04h（eDP v1.5），且語義錯誤可能導致混淆。

**依據**：eDP_v1_4b.pdf Page 148, eDP-v1.5-mem.pdf Page 372  
**版本適用**：eDP 1.3 / 1.4 / 1.5

---

### 問題 #3 — 00071h PSR_CAPABILITIES bit 3:1：SETUP_TIME 範圍錯 [CRITICAL]

**問題 bit**：bit 3:1

**目前 DB 定義**：
- bit 3: SU_GRANULARITY_REQUIRED
- bit 2:1: PSR_SETUP_TIME_LOW（低 2 位）

**規格書正確定義**：
- bit 3:1: PSR_SETUP_TIME（連續 3-bit 欄位）
  - 000b = 330µs, 001b = 275µs, 010b = 220µs, 011b = 165µs, 100b = 110µs, 101b = 55µs, 110b = 0µs

**根因**：DB 把 PSR_SETUP_TIME 拆成 bit 4（高位）+ bit 2:1（低位），跳過 bit 3 給了 SU_GRANULARITY_REQUIRED。但規格書中 SETUP_TIME 是連續的 bit 3:1。

**依據**：eDP_v1_4b.pdf Page 149  
**版本適用**：eDP 1.3 / 1.4 / 1.5

---

### 問題 #4 — 00071h PSR_CAPABILITIES bit 4：Y_COORDINATE 誤標 [CRITICAL]

**問題 bit**：bit 4

**目前 DB 定義**：PSR_SETUP_TIME（高位）

**規格書正確定義**：Y_COORDINATE_REQUIRED — PSR2 是否需要 Y 座標資訊

**根因**：與問題 #3 連動。DB 把 SETUP_TIME 拆成不連續的 [4] + [2:1]，導致 bit 4 的真正功能（Y 座標需求）被覆蓋。

**依據**：eDP_v1_4b.pdf Page 150, eDP-v1.5-mem.pdf Page 374  
**版本適用**：eDP 1.4a / 1.4b / 1.5

---

### 問題 #5 — 00090h FEC_CAPABILITY：bit 定義幾乎全錯 [CRITICAL]

**問題 bit**：bit 1~6

**目前 DB 定義**：
- bit 7:4: RESERVED
- bit 3: FEC_CAPABLE_FOR_COMPRESSED
- bit 2: FEC_CAPABLE_FOR_UNCOMPRESSED
- bit 1: FEC_CORR_BLK_ERR_COUNT_CAP
- bit 0: FEC_CAPABLE

**規格書正確定義**：
- bit 7: RESERVED
- bit 6: FEC_ERROR_REPORTING_POLICY_SUPPORTED（DP 1.4a）/ FEC_RUNNING_INDICATOR_SUPPORTED（DP 2.0 新增）
- bit 5: PARITY_ERROR_COUNT_CAPABLE
- bit 4: PARITY_BLOCK_ERROR_COUNT_CAPABLE
- bit 3: BIT_ERROR_COUNT_CAPABLE
- bit 2: CORRECTED_BLOCK_ERROR_COUNT_CAPABLE
- bit 1: UNCORRECTED_BLOCK_ERROR_COUNT_CAPABLE
- bit 0: FEC_CAPABLE ← 唯一正確的

**根因**：DB 中 bit 1~3 的欄位名稱（FEC_CAPABLE_FOR_COMPRESSED 等）在規格書中完全不存在。bit 4~6 被錯誤合併為 RESERVED。

**依據**：DP_v1.4a_mem.pdf DPCD 00090h 定義  
**版本適用**：DP 1.4 / 2.0

---

### 問題 #6 — 00200h SINK_COUNT bit 7：不連續欄位遺漏 [MAJOR]

**問題 bit**：bit 7

**目前 DB 定義**：bit 7 = RESERVED

**規格書正確定義**：bit 7 = SINK_COUNT 的最高位（MSB）。SINK_COUNT 是不連續的 7-bit 欄位，bit 7 + bit 5:0 組成完整計數值。

**影響**：當 Sink 數量 > 63 時讀值錯誤（雖然實際場景罕見）。

**依據**：DP_v1.4a_mem.pdf Page 395  
**版本適用**：DP 1.2 / 1.3 / 1.4 / 2.0

---

### 問題 #7 — 00211h bit 7：VALID vs OVERFLOW 語義相反 [MAJOR]

**問題 bit**：bit 7

**目前 DB 定義**：SYM_ERR_COUNT_OVERFLOW — 計數器溢位（0=未溢位, 1=已溢位）

**規格書正確定義**：SYMBOL_ERROR_COUNT_LANE0_VALID — 計數值有效旗標（0=無效, 1=有效）

**影響**：語義完全相反。讀到 bit 7=1 時，DB 會告訴使用者「錯誤太多溢位了」，但實際意思是「計數值有效可信」。

**依據**：DP_v1.4a_mem.pdf DPCD 00211h  
**版本適用**：DP 1.2 / 1.3 / 1.4 / 2.0

---

### 問題 #8 — 00003h bit 6：名稱過時 [MAJOR]

**問題 bit**：bit 6

**目前 DB 定義**：NO_AUX_HANDSHAKE_LINK_TRAINING

**規格書正確定義**：
- DP 1.2：NO_AUX_HANDSHAKE_LINK_TRAINING（舊名）
- DP 1.3 / 1.4 / 2.0：**NO_AUX_TRANSACTION_LINK_TRAINING**（新名）

**影響**：DB 使用 DP 1.2 的舊名稱，應更新為 DP 1.3+ 的新名稱。

**依據**：DP_v1_3.pdf Page 296, DP_v1.4a_mem.pdf Page 380  
**版本適用**：名稱從 DP 1.3 起變更

---

### 問題 #9 — 00003h bit 1：遺漏 DP 2.0 新增欄位 [MAJOR]

**問題 bit**：bit 1

**目前 DB 定義**：RESERVED（包含在 bit 5:1 範圍內）

**規格書正確定義**：DP 2.0 新增 STREAM_REGENERATION_STATUS_CAPABILITY

**依據**：DP_v2.0_mem_2019.pdf Page 430  
**版本適用**：DP 2.0

---

### 問題 #10~12 — 00008h bit 3~5：遺漏 DP 1.4 新增欄位 [MAJOR × 3]

**問題 bit**：bit 3, bit 4, bit 5

**目前 DB 定義**：bit 7:3 全部為 RESERVED

**規格書正確定義**：
- bit 3: HBLANK_EXPANSION_CAPABLE — 水平消隱擴展能力
- bit 4: BUFFER_SIZE_UNIT — Buffer 大小單位（0=pixel, 1=byte）
- bit 5: BUFFER_SIZE_PER_PORT — Buffer 是 per-lane 還是 per-port

**影響**：bit 4/5 影響 00009h BUFFER_SIZE 的解讀方式。

**依據**：DP_v1.4a_mem.pdf Page 386  
**版本適用**：DP 1.4 / 2.0

---

### 問題 #13 — 0006Dh：DSC_SLICE_CAPABILITIES_2 被標為 RESERVED [MAJOR]

**問題 bit**：bit 2:0

**目前 DB 定義**：整個暫存器標為 RESERVED，b: []

**規格書正確定義**：暫存器名稱 = DSC_SLICE_CAPABILITIES_2
- bit 2: 24_Slices_per_DP_DSC_Sink_Device
- bit 1: 20_Slices_per_DP_DSC_Sink_Device
- bit 0: 16_Slices_per_DP_DSC_Sink_Device
- bit 7:3: RESERVED

**依據**：DP_v1.4a_mem.pdf DPCD field listing  
**版本適用**：DP 1.4 / 2.0

---

### 問題 #14 — 0006Fh：DSC BPP_INCREMENT 被標為 RESERVED [MAJOR]

**問題 bit**：bit 2:0

**目前 DB 定義**：整個暫存器標為 RESERVED，b: []

**規格書正確定義**：暫存器名稱 = BITS_PER_PIXEL_INCREMENT
- bit 2:0: BPP 精度增量
  - 000b = 1/16 bpp
  - 001b = 1/8 bpp
  - 010b = 1/4 bpp
  - 011b = 1/2 bpp
  - 100b = 1 bpp
- bit 7:3: RESERVED

**依據**：DP_v1.4a_mem.pdf DPCD field listing  
**版本適用**：DP 1.4 / 2.0

---

### 問題 #15 — 00071h bit 5：SU_GRANULARITY_REQUIRED 遺漏 [MAJOR]

**問題 bit**：bit 5

**目前 DB 定義**：歸入 RESERVED（bit 7:5）

**規格書正確定義**：SU_GRANULARITY_REQUIRED — 是否需要特定 Selective Update 粒度

**注意**：DB 中 bit 3 被錯誤標為 SU_GRANULARITY_REQUIRED（參見問題 #3），但正確位置是 bit 5。

**依據**：eDP_v1_4b.pdf Page 150  
**版本適用**：eDP 1.4b / 1.5

---

### 問題 #16 — 00071h bit 6：FRAME_SYNC_NOT_NEEDED 遺漏 [MAJOR]

**問題 bit**：bit 6

**目前 DB 定義**：歸入 RESERVED（bit 7:5）

**規格書正確定義**：FRAME_SYNC_NOT_NEEDED_FOR_SU — eDP v1.5 新增

**依據**：eDP-v1.5-mem.pdf Page 375  
**版本適用**：eDP 1.5

---

### 問題 #17 — 00218h bit 7：TEST_AUDIO_PATTERN 名稱錯誤 [MAJOR]

**問題 bit**：bit 7

**目前 DB 定義**：TEST_AUDIO_PATTERN

**規格書正確定義**：
- DP 1.4a：TEST_AUDIO_PATTERN（名稱匹配）
- DP 2.0：**TEST_AUDIO_DISABLED_VIDEO**（名稱和語義改變）

**依據**：DP_v2.0_mem_2019.pdf  
**版本適用**：DP 2.0 改名

---

### 問題 #18 — 00218h bit 4：FAUX 已 deprecated [MAJOR]

**問題 bit**：bit 4

**目前 DB 定義**：FAUX_TEST_PATTERN (DP 1.3+)

**規格書正確定義**：DP 1.3 已將 FAUX 標為 deprecated RESERVED

**依據**：DP_v1_3.pdf  
**版本適用**：DP 1.3 起 deprecated

---

### 問題 #19 — 00600h bit 2:0 值 05h：描述語義相反 [MAJOR]

**問題 bit**：bit 2:0 的值 05h

**目前 DB 定義**：05h = D3 + AUX 關閉

**規格書正確定義**：05h = D3 + **keep AUX block fully powered**（維持 AUX 完整供電）

**影響**：「AUX 關閉」和「維持 AUX 供電」語義完全相反。

**依據**：DP_v1.4a_mem.pdf  
**版本適用**：DP 1.4 / 2.0

---

### 問題 #20~21 — 00600h bit 6/7：遺漏電壓控制 [MAJOR × 2]

**問題 bit**：bit 6, bit 7

**目前 DB 定義**：僅定義 bit 5 (SET_DP_PWR5V)，bit 6/7 未定義

**規格書正確定義**：
- bit 6: SET_DN_DEVICE_DP_PWR_12V
- bit 7: SET_DN_DEVICE_DP_PWR_18V

**依據**：DP_v1.4a_mem.pdf  
**版本適用**：DP 1.2+ 

---

### 問題 #22 — 00060h bit 2~3：遺漏 DP 2.0 Dynamic PPS [MINOR]

**問題 bit**：bit 2, bit 3

**目前 DB 定義**：RESERVED（但已從 DP 2.0 加入了 bit 1 DSC_PASSTHROUGH）

**規格書正確定義**：
- bit 2: Dynamic PPS Update - Compressed-to-Compressed
- bit 3: Dynamic PPS Update - Uncompressed-to/from-Compressed

**依據**：DP_v2.0_mem_2019.pdf  
**版本適用**：DP 2.0

---

### 問題 #23 — 00080h bit 7：欄位名稱非規格書用語 [MINOR]

**問題 bit**：bit 7

**目前 DB 定義**：NON_EDID_DWN_STRM_PORT

**規格書正確定義**：此名稱在規格書中的用法取決於 DETAILED_CAP_INFO_AVAILABLE 的值，不是一個固定的 bit 名稱。

**依據**：DP_v1.4a_mem.pdf  
**版本適用**：所有版本

---

### 問題 #24 — 00080h bit 6:4：缺少條件性定義 [MINOR]

**問題 bit**：bit 6:4

**目前 DB 定義**：RESERVED

**規格書正確定義**：當 DETAILED_CAP_INFO=0 且 TYPE=100b 時為 NON_EDID_DFPX_ATTRIBUTE

**依據**：DP_v1.4a_mem.pdf  
**版本適用**：所有版本

---

### 問題 #25 — 00703h bit 2:1：遺漏 eDP 1.5 新增欄位 [MINOR]

**問題 bit**：bit 2:1

**目前 DB 定義**：歸入 RESERVED (mask 0xFE)

**規格書正確定義**：BACKLIGHT_BRIGHTNESS_BIT_ALIGNMENT（eDP 1.5 新增）

**依據**：eDP-v1.5-mem.pdf  
**版本適用**：eDP 1.5

---

### 問題 #26~27 — 00218h bit 5:4/6：遺漏 DP 2.0 新增欄位 [MINOR × 2]

**問題 bit**：bit 5:4, bit 6

**目前 DB 定義**：RESERVED

**規格書正確定義**：
- bit 5:4: PHY_TEST_CHANNEL_CODING_TYPE (00b=8b/10b, 01b=128b/132b)
- bit 6: TEST_AUDIO_PATTERN_REQUESTED

**依據**：DP_v2.0_mem_2019.pdf  
**版本適用**：DP 2.0

---

## 抽查結果（完全正確的暫存器）

以下暫存器經抽查比對後**確認定義正確**，無需修改：

| DPCD 地址 | 名稱 | 比對結果 |
|-----------|------|----------|
| 00002h | MAX_LANE_COUNT | 全部 bit 正確 |
| 00005h | DOWN_STREAM_PORT_PRESENT | 全部 bit 正確 |
| 00100h | LINK_BW_SET | 值列表正確 |
| 00101h | LANE_COUNT_SET | 全部 bit 正確 |
| 00202h | LANE0_1_STATUS | 全部 bit 正確 |
| 00203h | LANE2_3_STATUS | 全部 bit 正確 |
| 00204h | LANE_ALIGN_STATUS_UPDATED | 全部 bit 正確 |
| 00704h | EDP_GENERAL_CAPABILITY_3 | X/Y_REGION_CAP 正確 |

---

## 00071h 正確 bit mapping 參照

由於 00071h 有多個 CRITICAL 錯誤，附上規格書的正確定義：

```
00071h PSR_CAPABILITIES（eDP v1.5）:
  bit 0:   LINK_TRAINING_ON_EXIT         ← DB 正確
  bit 3:1: PSR_SETUP_TIME (連續 3-bit)   ← DB 錯誤拆成 [4]+[2:1]
  bit 4:   Y_COORDINATE_REQUIRED         ← DB 錯標為 SETUP_TIME 高位
  bit 5:   SU_GRANULARITY_REQUIRED       ← DB 遺漏（放在 bit 3）
  bit 6:   FRAME_SYNC_NOT_NEEDED         ← DB 遺漏（eDP 1.5 新增）
  bit 7:   RESERVED
```

---

## 審查方法說明

1. 從 `data/dpcd-db.js` 提取所有指定暫存器的完整 bit 定義
2. 讀取 8 份規格書 PDF 的對應頁面，逐 bit 比對
3. 追蹤不同 DP/eDP 版本間的差異
4. 額外抽查 10 個常用暫存器作為交叉驗證
