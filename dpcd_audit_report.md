# DPCD 資料庫二次獨立審查報告

**審查日期**: 2026-05-22
**審查對象**: `data/dpcd-db.js`（3822 行，289 筆暫存器定義）
**參考規格書**:
- DP v1.4a (VESA, 933 頁) — `DP_v1.4a_mem.pdf`
- eDP v1.4b (VESA, 273 頁) — `eDP_v1_4b.pdf`

**審查範圍**: 000h-0FFh, 100h-1FFh, 200h-2FFh, 300h-5FFh, 600h-7FFh, 2000h+, F0000h

---

## 問題摘要

| 嚴重度 | 數量 |
|--------|------|
| CRITICAL（bit 定義錯誤，影響解讀正確性） | 5 |
| MAJOR（名稱錯誤或缺漏欄位） | 6 |
| MINOR（描述文字錯誤或不精確） | 4 |
| **合計** | **15** |

---

## 詳細問題列表

### CRITICAL — Bit 定義錯誤

| # | DPCD 位址 | 問題 | DB 內容 | 正確定義（依規格書） | 來源 |
|---|-----------|------|---------|---------------------|------|
| 1 | 0000Ch bits 1-5 | **I2C 速度完全錯誤** — 缺 5Kbps，所有 bit 位移 | bit1=10K, bit2=100K, bit3=400K, bit4=1M（無 5Kbps，全部偏移一位） | bit1=5Kbps, bit2=10Kbps, bit3=100Kbps, bit4=400Kbps, bit5=1Mbps | DP v1.4a p388 Table 2-161 |
| 2 | 00070h | **結構性錯誤** — 應為 byte-wide enum，卻做成 bit flags | bit0=PSR1, bit1=PSR2, bit2=Y_COORD 作為獨立 bit | 整個 byte 為列舉值：00h=無, 01h=PSR1, 02h=PSR2, 03h=PSR2+Y_COORD | eDP v1.4b p149 Table 6-5 |
| 3 | 00071h bits 1-5 | **Bit 佈局錯誤** — PSR 設定時間欄位分割錯誤 | bits 2:1=setup_low, bit3=SU_GRAN, bit4=setup_high | bits 3:1=PSR_SETUP_TIME（連續3-bit），bit4=Y_COORD_REQUIRED，bit5=SU_GRANULARITY_REQUIRED | eDP v1.4b p150 Table 6-5 |
| 4 | 00090h bits 1-7 | **FEC 能力 bit 完全錯誤** — 與規格書不符 | bit1=CORR_BLK, bit2=UNCMPR, bit3=CMPR, 7:4=RSVD | bit1=UNCORR_BLK, bit2=CORR_BLK, bit3=BIT_ERR, bit4=PARITY_BLK, bit5=PARITY_ERR, bit7=ERR_POLICY | DP v1.4a p406-407 Table 2-161 |
| 5 | 00200h bits 7,5:0 | **SINK_COUNT 欄位寬度錯誤** — 漏掉 bit 7 | bits 5:0=SINK_COUNT, bit7=RESERVED | bits [7, 5:0]=SINK_COUNT（7-bit 欄位，bit 6 為 CP_READY 插在中間） | DP v1.4a p425 Table 2-163 |

### MAJOR — 名稱錯誤或缺漏欄位

| # | DPCD 位址 | 問題 | DB 內容 | 正確定義（依規格書） | 來源 |
|---|-----------|------|---------|---------------------|------|
| 6 | 00003h bit 6 | **Bit 名稱用詞不精確** | NO_AUX_HANDSHAKE_LINK_TRAINING | NO_AUX_TRANSACTION_LINK_TRAINING | DP v1.4a p381 Table 2-161 |
| 7 | 00008h bits 3-5 | **缺少 3 個 bit 定義** — 全部標為 RESERVED | bits 7:3 皆 RESERVED | bit3=HBLANK_EXPANSION_CAPABLE, bit4=BUFFER_SIZE_UNIT, bit5=BUFFER_SIZE_PER_PORT | DP v1.4a p386 Table 2-161 |
| 8 | 0006Dh | **不應為 RESERVED** — 缺少整個暫存器 | RESERVED（空白） | DSC_SLICE_CAPABILITIES_2（支援 16/20/24 slices） | DP v1.4a p400 Table 2-161 |
| 9 | 0006Fh | **不應為 RESERVED** — 缺少整個暫存器 | RESERVED（空白） | BITS_PER_PIXEL_INCREMENT（3-bit field） | DP v1.4a p400 Table 2-161 |
| 10 | 00080h bits 4-7 | **Bit 佈局錯誤** — 4-bit 欄位拆成 RESERVED + 1-bit | bits 6:4=RSVD, bit7=NON_EDID | bits 7:4=NON_EDID_DFPX_ATTRIBUTE（4-bit 連續欄位） | DP v1.4a p401-402 Table 2-161 |
| 11 | 00600h bits 6-7 | **缺少 2 個 bit 定義** | 僅 bit5=SET_DP_PWR5V，其餘未定義 | bit6=SET_DN_DEVICE_DP_PWR_12V, bit7=SET_DN_DEVICE_DP_PWR_18V | DP v1.4a p451 Table 2-167 |

### MINOR — 描述文字錯誤

| # | DPCD 位址 | 問題 | DB 內容 | 正確定義（依規格書） | 來源 |
|---|-----------|------|---------|---------------------|------|
| 12 | 00211h bit 7 | **Bit 名稱語義不同** | SYM_ERR_COUNT_OVERFLOW（溢位旗標） | SYMBOL_ERROR_COUNT_LANE0_VALID（有效旗標，0=無效, 1=有效） | DP v1.4a p430 Table 2-163 |
| 13 | 00218h bit 7 | **Bit 不應有定義** | TEST_AUDIO_PATTERN | DP v1.4a 明確標示 bits 7:4 為 RESERVED | DP v1.4a p431 Table 2-163 |
| 14 | 00703h | **英文描述錯誤** | de="Panel luminance control granularity" | 應為 "LCD Overdrive functionality" | eDP v1.4b p231 Table 10-4 |
| 15 | 00704h | **X/Y 英文描述互換** | X_REGION de="vertical", Y_REGION de="horizontal" | X=horizontal（水平），Y=vertical（垂直） | eDP v1.4b p232 Table 10-4 |

---

## 補充說明

### 關於 00120h FEC_CONFIGURATION
DB 中 bits 7:6 定義了 `PRECODING_DISABLE`（bit 7）和 `AGGREGATED_ENABLED_LANES_ERRORS`（bit 6），但 DP v1.4a 規格書將 bits 7:6 標為 RESERVED。這些欄位可能來自 DP 2.0 或更新版本。此外，bits 3:1 的 `FEC_ERROR_COUNT_SEL` 缺少 `100b=PARITY_BLOCK_ERROR_COUNT` 和 `101b=PARITY_BIT_ERROR_COUNT` 兩個值（DP v1.4a 有定義）。因這些可能涉及跨版本差異，列為備註而非正式錯誤。

### 關於 300h-5FFh 區段（Source/Sink/Branch OUI）
00300h-0030Bh（Source）、00400h-0040Bh（Sink）、00500h-0050Bh（Branch）主要為 OUI、Device ID String、Hardware/Firmware Revision 等簡單的 byte-level 暫存器，DB 定義與規格書一致，未發現錯誤。

### 關於 00310h-003FFh 區段（Intel/AMD 自定義）
此區段大量暫存器為 Intel 或 AMD 自定義 DPCD（如 Adaptive Sync、HDR 控制、ALPM、AUPI 等），不屬於 VESA 標準規格書範圍，無法以公開 DP/eDP 規格驗證其正確性。

### 關於 2000h+ 區段（ESI / Extended Receiver Capability）
ESI 區域（02002h-0200Fh）為 200h 區段的鏡像，DB 定義使用 `m`/`s` 格式而非 `r` 格式，但 bit 佈局與 DP v1.4a 一致。Extended Receiver Capability（02200h-022FFh）的暫存器結構同 000h 區段的對應暫存器，未發現額外錯誤。

### 已確認正確的關鍵暫存器
以下高使用率暫存器已逐 bit 比對，確認無誤：
00000h (DPCD_REV), 00001h (MAX_LINK_RATE), 00002h (MAX_LANE_COUNT), 00100h (LINK_BW_SET), 00101h (LANE_COUNT_SET), 00102h (TRAINING_PATTERN_SET), 00103h-00106h (TRAINING_LANEx_SET), 00107h (DOWNSPREAD_CTRL), 00202h-00204h (LANE_STATUS / ALIGN), 00206h-00207h (ADJUST_REQUEST), 00700h-00702h (eDP 能力), 00720h-00721h (eDP 顯示/背光控制)

---

## 修正優先順序建議

1. **最優先**：#1 (0000Ch I2C speeds)、#2 (00070h PSR enum)、#4 (00090h FEC bits) — 這三個會導致使用者看到完全錯誤的解讀
2. **高優先**：#3 (00071h PSR layout)、#5 (00200h SINK_COUNT)、#10 (00080h bit layout)、#11 (00600h missing power bits)
3. **中優先**：#6-#9（缺漏欄位和名稱修正）
4. **低優先**：#12-#15（描述文字修正）
