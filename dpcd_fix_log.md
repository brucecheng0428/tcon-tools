# DPCD 資料庫修正紀錄

**修正日期**：2026-05-22
**修正來源**：兩次獨立審查確認的 12 個錯誤
**驗證依據**：DP v1.4a spec (933 頁) + eDP v1.4b spec (273 頁)

---

## CRITICAL 修正（4 項）

### #1 — 0x0000C I2C_SPEED_CAP：缺少 5Kbps、bit 位置全錯

| 項目 | 舊值 | 新值 |
|------|------|------|
| bit 7:5 | RESERVED | → bit 7:6 RESERVED |
| bit 4 | I2C_1MBPS | → bit 5 I2C_1MBPS |
| bit 3 | I2C_400KBPS | → bit 4 I2C_400KBPS |
| bit 2 | I2C_100KBPS | → bit 3 I2C_100KBPS |
| bit 1 | I2C_10KBPS | → bit 2 I2C_10KBPS |
| bit 0 | I2C_1KBPS | → bit 1 **I2C_5KBPS（新增）**, bit 0 I2C_1KBPS |

**PDF 出處**：DP v1.4a page 388 — `01h=1Kbps, 02h=5Kbps, 04h=10Kbps, 08h=100Kbps, 10h=400Kbps, 20h=1Mbps, 40h/80h=RESERVED`

### #2 — 0x00070 PSR_SUPPORT：應為列舉值（enumerated），非獨立 bit flag

| 項目 | 舊值 | 新值 |
|------|------|------|
| 結構 | 獨立 bit flags (bit 0=PSR1, bit 1=PSR2, bit 2=Y_COORD) | 8-bit 列舉值 |
| 值定義 | — | 00h=不支援, 01h=PSR1, 02h=PSR2(不需Y座標), 03h=PSR2+Y座標 |

**PDF 出處**：eDP v1.4b page 149

### #3 — 0x00071 PSR_CAPABILITIES：bit layout 多處錯誤

| 項目 | 舊值 | 新值 |
|------|------|------|
| bit 7:5 | RESERVED | → bit 7:6 RESERVED |
| bit 4 | PSR_SETUP_TIME (高位) | → bit 5 SU_GRANULARITY_REQUIRED |
| bit 3 | SU_GRANULARITY_REQUIRED | → bit 4 Y_COORDINATE_REQUIRED |
| bit 2:1 | PSR_SETUP_TIME_LOW (2-bit) | → bit 3:1 PSR_SETUP_TIME (3-bit) |
| bit 0 | LINK_TRAINING_ON_EXIT | bit 0 LINK_TRAINING_ON_EXIT（不變） |

**PDF 出處**：eDP v1.4b page 150

### #4 — 0x00090 FEC_CAPABILITY：bit 1-7 定義全錯

| 項目 | 舊值 | 新值 |
|------|------|------|
| bit 7 | (part of RESERVED 7:4) | FEC_ERROR_REPORTING_POLICY_SUPPORTED |
| bit 6 | (part of RESERVED 7:4) | RESERVED |
| bit 5 | (part of RESERVED 7:4) | PARITY_ERROR_COUNT_CAPABLE |
| bit 4 | (part of RESERVED 7:4) | PARITY_BLOCK_ERROR_COUNT_CAPABLE |
| bit 3 | FEC_CAPABLE_FOR_COMPRESSED | BIT_ERROR_COUNT_CAPABLE |
| bit 2 | FEC_CAPABLE_FOR_UNCOMPRESSED | CORRECTED_BLOCK_ERROR_COUNT_CAPABLE |
| bit 1 | FEC_CORR_BLK_ERR_COUNT_CAP | UNCORRECTED_BLOCK_ERROR_COUNT_CAPABLE |
| bit 0 | FEC_CAPABLE（不變） | FEC_CAPABLE（不變） |

**PDF 出處**：DP v1.4a pages 406-407

---

## MAJOR 修正（6 項）

### #5 — 0x00003 MAX_DOWNSPREAD bit 6：名稱錯誤

| 項目 | 舊值 | 新值 |
|------|------|------|
| bit 6 名稱 | NO_AUX_HANDSHAKE_LINK_TRAINING | NO_AUX_TRANSACTION_LINK_TRAINING |
| bit 6 中文 | 免 AUX 握手訓練 | 免 AUX 交易訓練 |

**PDF 出處**：DP v1.4a page 381

### #6 — 0x00008 RECEIVE_PORT0_CAP_0：缺少 bit 3-5 定義

| 項目 | 舊值 | 新值 |
|------|------|------|
| bit 7:3 | RESERVED | → bit 7:6 RESERVED |
| bit 5 | (part of RESERVED) | BUFFER_SIZE_PER_PORT（per-lane vs per-port） |
| bit 4 | (part of RESERVED) | BUFFER_SIZE_UNIT（pixel vs byte） |
| bit 3 | (part of RESERVED) | HBLANK_EXPANSION_CAPABLE |

**PDF 出處**：DP v1.4a page 386 — "Support for bits 5:3 added in DP v1.4"

### #7 — 0x0006D：標為 RESERVED 但實為 DSC_SLICE_CAPABILITIES_2

| 項目 | 舊值 | 新值 |
|------|------|------|
| 暫存器名稱 | RESERVED | DSC_SLICE_CAPABILITIES_2 |
| bit 0 | — | 16_SLICES_PER_SINK |
| bit 1 | — | 20_SLICES_PER_SINK |
| bit 2 | — | 24_SLICES_PER_SINK |

**PDF 出處**：DP v1.4a page 400

### #8 — 0x0006F：標為 RESERVED 但實為 BITS_PER_PIXEL_INCREMENT

| 項目 | 舊值 | 新值 |
|------|------|------|
| 暫存器名稱 | RESERVED | BITS_PER_PIXEL_INCREMENT |
| bit 2:0 | — | BPP 增量（000b=1/16, 001b=1/8, 010b=1/4, 011b=1/2, 100b=1 bpp） |

**PDF 出處**：DP v1.4a page 400

### #9 — 0x00080 DOWNSTREAM_PORT_0_CAP_0：缺少 DETAILED_CAP_INFO 模式區分 + DP++ 類型

| 項目 | 舊值 | 新值 |
|------|------|------|
| bit 7 | NON_EDID_DWN_STRM_PORT | → bit 7:4 NON_EDID_DFPX_ATTR（條件屬性） |
| bit 6:4 | RESERVED | （合併入 bit 7:4） |
| bit 3 | HPD_AWARE | → DFPX_HPD |
| bit 2:0 TYPE | 無 101b=DP++ | 新增 101b=DP++（雙模式端口） |
| 結構 | 單一模式 | 區分 DETAILED_CAP_INFO_AVAILABLE=0/1 兩種模式 |

**PDF 出處**：DP v1.4a pages 401-405

### #10 — 0x00600 SET_POWER：bit layout 不完整

| 項目 | 舊值 | 新值 |
|------|------|------|
| bit 0 | SET_POWER_STATE (single bit) | → bit 2:0 SET_POWER_STATE（3-bit 欄位） |
| bit 5 | SET_DP_PWR5V | → SET_DN_DEVICE_DP_PWR_5V |
| bit 6 | (missing) | SET_DN_DEVICE_DP_PWR_12V（新增） |
| bit 7 | (missing) | SET_DN_DEVICE_DP_PWR_18V（新增） |
| bit 4:3 | (missing) | RESERVED |

**PDF 出處**：DP v1.4a pages 450-451

---

## MINOR 修正（2 項）

### #11 — 0x00211/213/215/217 SYMBOL_ERROR_COUNT_LANEx_HIGH bit 7：溢位→有效旗標

| 項目 | 舊值 | 新值 |
|------|------|------|
| bit 7 名稱 | SYM_ERR_COUNT_OVERFLOW | SYM_ERR_COUNT_LANEx_VALID |
| bit 7 語義 | 計數器溢位（錯誤太多） | 計數有效旗標（0=無效, 1=有效） |
| 計數器行為 | 暗示回繞 | 飽和在 32767（不回繞），讀取清除 |

**PDF 出處**：DP v1.4a page 430 — "7: SYMBOL_ERROR_COUNT_LANE0_VALID, 0=Not valid, 1=Valid"

### #12 — 0x00218 TEST_REQUEST：bit 4 和 bit 7 定義錯誤

| 項目 | 舊值 | 新值 |
|------|------|------|
| bit 4 | FAUX_TEST_PATTERN（功能位元） | RESERVED（已棄用的 FAUX 相關位元） |
| bit 7 | TEST_AUDIO_PATTERN | RESERVED |
| bit 6:5 | RESERVED | （合併入 bit 7:4 RESERVED） |

**PDF 出處**：DP v1.4a page 431 — "7:4 RESERVED (Bit 4 is a deprecated FAUX-related bit.) Read all 0s"

---

## v2.1.1 追加修正（3 項）— 2026-05-22

### #13 — 0x00200 SINK_COUNT：bit 7 從 RESERVED 改為 SINK_COUNT MSB

| 項目 | 舊值 | 新值 |
|------|------|------|
| bit 7 | RESERVED | SINK_COUNT[6]（MSB） |
| bit 5:0 | SINK_COUNT | SINK_COUNT[5:0]（低 6 位元） |
| 欄位結構 | 6-bit 連續 | 7-bit 不連續（bit[7] + bit[5:0]），bit 6 = CP_READY |

**PDF 出處**：DP v1.4a page 425 — SINK_COUNT 為不連續 7-bit 欄位

### #14 — 0x00703 EDP_GENERAL_CAPABILITY_2：英文描述層整段誤植

| 項目 | 舊值 | 新值 |
|------|------|------|
| `e` 描述 | 提到 backlight frequency、regional backlight、PSR2、Adaptive Sync（全屬 00702h） | 正確描述 LCD Overdrive 功能 |
| bit 0 `de` | "Panel luminance control granularity"（屬 00702h） | "LCD Overdrive functionality" |
| bit 1~5 `de` | 5 個不該存在的英文 bit 描述（從 00702h 誤複製） | 已移除（主定義中 bit 7:1 為 RESERVED） |

**根因**：EDP_DESC 區塊建構時，00703 的英文描述從 00702h 誤複製過來

### #15 — 0x00704 EDP_GENERAL_CAPABILITY_3：英文 de X/Y 方向互換

| 項目 | 舊值 | 新值 |
|------|------|------|
| bit 3:0 (X_REGION_CAP) `de` | "vertical direction" | "horizontal direction" |
| bit 7:4 (Y_REGION_CAP) `de` | "horizontal direction" | "vertical direction" |

**備註**：中文主定義（水平/垂直）原本就正確，僅英文 EDP_DESC 層寫反
