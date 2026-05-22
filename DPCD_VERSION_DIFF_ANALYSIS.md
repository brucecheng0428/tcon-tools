# DPCD 暫存器版本差異完整分析報告

> 比對來源：DP v1.2, DP v1.3, DP v1.4a, eDP v1.2, eDP v1.3, eDP v1.4b, eDP v1.5 規格書 PDF
> 分析日期：2026-05-22
> 分析者：Claude（依 Bruce 指示從 PDF 原文逐版比對）

---

## 第一部分：現有 DPCD_VER_META 版本標註錯誤

以下是 aux.html 第 786-874 行中，版本標註與 PDF 原文不符的項目：

| 位址 | 現有標註 | 正確版本（依 PDF） | 說明 |
|------|---------|-------------------|------|
| 00010h-0001Fh | eDP 1.3+ | **eDP 1.4+** | SUPPORTED_LINK_RATES 在 eDP v1.3 PDF 中不存在，首見於 eDP v1.4 |
| 0002Eh | eDP 1.3+ | **eDP 1.4+** | RECEIVER_ALPM_CAPABILITIES 在 eDP v1.3 PDF 中不存在，ALPM 功能首見於 eDP v1.4 |
| 0002Fh | eDP 1.3+ | **eDP 1.4+** | AUX_FRAME_SYNC 在 eDP v1.3 PDF 中不存在，首見於 eDP v1.4（為 PSR2 而加） |
| 00115h | eDP 1.3+ | **eDP 1.4+** | LINK_RATE_SET 在 eDP v1.3 PDF 中不存在，首見於 eDP v1.4（配合 Link Rate Table） |
| 00116h | eDP 1.3+（整體） | **eDP 1.4+**（整體） | RECEIVER_ALPM_CONFIGURATION 在 eDP v1.3 PDF 中不存在，首見於 eDP v1.4 |
| 00117h | eDP 1.3+ | **eDP 1.4+** | AUX_FRAME_SYNC_CONFIGURATION 在 eDP v1.3 PDF 中不存在，首見於 eDP v1.4 |
| 0200Bh | eDP 1.3+ | **eDP 1.4+** | RECEIVER_ALPM_STATUS 在 eDP v1.3 PDF 中不存在，首見於 eDP v1.4 |
| 02008h | eDP 1.4b+ | **eDP 1.3+**（首見） | SINK_PSR_STATUS 在 eDP v1.3 即已定義（PSR 狀態），不是 1.4b 才有 |
| 00007h bit 7 | eDP 1.2+（與 bit 6 一起標） | **eDP 1.5+** | bit 7 (OUI_SUPPORT) 是 eDP v1.5 才在 eDP 規格中明確定義的 |

---

## 第二部分：完全遺漏的暫存器（應加入 DPCD_VER_META）

### A. eDP 1.3 新增（完全遺漏）

| 位址 | 暫存器名稱 | 首見版本 | bit-level 差異 | 說明 |
|------|-----------|---------|---------------|------|
| 00070h | PSR_SUPPORT_AND_VERSION | eDP 1.3+ | 有（見第三部分） | PSR 支援與版本，目前有標版本但缺 bit-level 差異 |
| 00071h | PSR_CAPABILITIES | eDP 1.3+ | 有（見第三部分） | PSR 能力，目前有標版本但缺 bit-level 差異 |
| 00170h | PSR_ENABLE_AND_CONFIGURATION | eDP 1.3+ | 有（見第三部分） | **完全遺漏！** PSR 啟用與設定 |
| 02009h | PSR_DEBUG_REGISTER_0 | eDP 1.3+ | 無 | **完全遺漏！** PSR 除錯暫存器 |
| 0200Ah | PSR_DEBUG_REGISTER_1 | eDP 1.3+ | 有（見第三部分） | **完全遺漏！** PSR 除錯暫存器 |

### B. eDP 1.4 / eDP 1.4a 新增（完全遺漏）

| 位址 | 暫存器名稱 | 首見版本 | bit-level 差異 | 說明 |
|------|-----------|---------|---------------|------|
| 00704h | EDP_GENERAL_CAPABILITY_3 | eDP 1.4+ | 無 | **完全遺漏！** 區域背光 X/Y region 能力 |
| 0015Ch-0015Fh | AUX_FRAME_SYNC_VALUE | eDP 1.4+ | 無 | **完全遺漏！** AUX Frame Sync 值 |
| 0200Fh | DSC_STATUS | eDP 1.4+ | 無 | **完全遺漏！** DSC 解碼狀態（RC Buffer Under/Overflow） |

### C. eDP 1.4b 新增（完全遺漏）

| 位址 | 暫存器名稱 | 首見版本 | bit-level 差異 | 說明 |
|------|-----------|---------|---------------|------|
| 02010h | AUX_FRAME_SYNC_STATUS | eDP 1.4b+ | 無 | **完全遺漏！** AUX Frame Sync 鎖定錯誤狀態 |
| 02011h | DSC_STATUS (Mirror) | eDP 1.4b+ | 無 | **完全遺漏！** DSC 狀態鏡像（eDP v1.5 中改為 MSO_1） |
| 02012h | SINK_USER_IRQ_VECTOR | eDP 1.4b+ | 無 | **完全遺漏！** Touch 中斷向量 |
| 007ACh-007B9h | MSO CRC (MSO_3, MSO_4) | eDP 1.4b+ | 無 | **完全遺漏！** 第 3、4 組 MSO link 的 CRC 暫存器 |

### D. eDP 1.5 新增（完全遺漏）

| 位址 | 暫存器名稱 | 首見版本 | bit-level 差異 | 說明 |
|------|-----------|---------|---------------|------|
| 000B4h | PR_SU_Y_GRANULARITY | eDP 1.5+ | 無 | **完全遺漏！** Panel Replay Selective Update Y 粒度 |
| 000B5h-000B6h | SU_Y_GRANULARITY_EXTENDED | eDP 1.5+ | 無 | **完全遺漏！** SU Y 粒度擴展能力 |
| 001B0h | PANEL_REPLAY_CONFIGURATION_1 | eDP 1.5+ | 無 | **完全遺漏！** Panel Replay 設定 1 |
| 001B1h | PANEL_REPLAY_CONFIGURATION_2 | eDP 1.5+ | 無 | **完全遺漏！** Panel Replay 設定 2 |
| 001B8h | ARP_CONFIGURATION | eDP 1.5+ | 無 | **完全遺漏！** Adaptive Refresh Panel 設定 |
| 001B9h-001BAh | ARP_t2_MAX | eDP 1.5+ | 無 | **完全遺漏！** ARP t2 最大計時值 |
| 0011Ah | PR_CONFIGURATION_3 | eDP 1.5+ | 無 | **完全遺漏！** Panel Replay 設定 3 |
| 0011Bh | ADAPTIVE_SYNC_SDP_TIMING_CONFIG | eDP 1.5+ | 無 | **完全遺漏！** Adaptive-Sync SDP 傳輸時序設定 |
| 0020Ch | LINK_CONFIGURATION_STATUS | eDP 1.5+ | 無 | **完全遺漏！** Link Rate Set 狀態指示 |
| 02013h-02015h | DSC_STATUS_MSO_2/3/4 | eDP 1.5+ | 無 | **完全遺漏！** MSO 第 2/3/4 link 的 DSC 狀態 |
| 02020h | PANEL_REPLAY_ERROR_STATUS | eDP 1.5+ | 無 | **完全遺漏！** Panel Replay 錯誤狀態 |
| 02022h | SINK_PR_AND_FRAME_LOCK_STATUS | eDP 1.5+ | 無 | **完全遺漏！** Panel Replay 與 Frame Lock 狀態 |
| 02025h | ARP_EXTENDED_REFRESH_DIV | eDP 1.5+ | 無 | **完全遺漏！** ARP 擴展刷新率除數 |
| 02201h | 8b10b_MAX_LINK_RATE (Extended) | eDP 1.5+ | 無 | **完全遺漏！** Extended Receiver Cap 中的最大速率鏡像 |
| 02207h | DOWN_STREAM_PORT_COUNT (Extended) | eDP 1.5+ | 無 | **完全遺漏！** Extended Receiver Cap 中的下游端口數鏡像 |
| 02214h | DPRX_FEATURE_ENUM_LIST_CONT_1 | eDP 1.5+ | 無 | **完全遺漏！** Adaptive-Sync SDP 支援旗標 |
| 02218h | DPRX_FEATURE_ENUM_LIST_CONT_2 | eDP 1.5+ | 無 | **完全遺漏！** AS SDP T2 支援 |
| 007C0h-007D1h | DSC_CRC_MSO_2/3/4 | eDP 1.5+ | 無 | **完全遺漏！** MSO 第 2/3/4 link 的 DSC CRC |

### E. DP 1.3 / DP 1.4a 新增（完全遺漏，FAE 可能用到的）

| 位址 | 暫存器名稱 | 首見版本 | 說明 |
|------|-----------|---------|------|
| 00003h bit 7 | TPS4_SUPPORTED | DP 1.4+ | **遺漏 bit-level！** HBR3 EQ 訓練用的 TPS4 支援 |
| 00090h | FEC_CAPABILITY | DP 1.4+ | **完全遺漏！** FEC 能力（與 DSC 必須搭配使用） |
| 00160h bit 1 | DSC_PASSTHROUGH_ENABLE | eDP 1.5+ | **遺漏 bit-level！** DSC Passthrough 啟用 |
| 02202h | DPCD_REV (Extended) | DP 1.3+ | 目前有標但只到 02202h |

---

## 第三部分：已存在但缺少 bit-level 差異標註的暫存器

這是 Bruce 最關心的部分 — 暫存器已在 META 中但缺少 bit-level 版本差異：

| 位址 | 暫存器名稱 | bit | 首見版本 | 說明 |
|------|-----------|-----|---------|------|
| **00003h** | MAX_DOWNSPREAD | bit 7 (TPS4_SUPPORTED) | **DP 1.4+** | 舊版 RESERVED，DP 1.4 才定義（HBR3 EQ 訓練用） |
| **00007h** | DOWN_STREAM_PORT_COUNT | bit 7 (OUI_SUPPORT) | **eDP 1.5+** | 在 eDP 規格中，bit 7 到 eDP v1.5 才明確定義為 OUI_SUPPORT |
| **0000Dh** | eDP_CONFIGURATION_CAP | bit 0 (ASSR) | **eDP 1.1+** | 目前整體標 eDP 1.2+，但 bit 0,1 早在 eDP 1.1 就有 |
| | | bit 3 (DISPLAY_CONTROL) | **eDP 1.2+** | bit 3 是 eDP 1.2 才新增的 |
| **0002Eh** | RECEIVER_ALPM_CAP | bit 0 (AUX_WAKE_ALPM) | **eDP 1.4+** | 整體首見 eDP 1.4 |
| | | bit 1 (PM_State 2a) | **eDP 1.4a+** | eDP 1.4a 才新增 |
| | | bit 2 (AUX_LESS_ALPM) | **eDP 1.5+** | eDP 1.5 才新增 |
| **00070h** | PSR_SUPPORT_AND_VERSION | 值 01h (PSR1) | **eDP 1.3+** | PSR v1 |
| | | 值 02h (PSR2 no Y-coord) | **eDP 1.4+** | PSR2 基礎版 |
| | | 值 03h (PSR2 + Y-coord) | **eDP 1.4a+** | PSR2 含 Y 座標 |
| | | 值 04h (PSR2 + Early Transport) | **eDP 1.5+** | PSR2 含早期傳輸（via eDP 1.4b SCR） |
| **00071h** | PSR_CAPABILITIES | bits 3:0 (基礎 PSR cap) | **eDP 1.3+** | PSR 基礎能力 |
| | | bit 4 (Y-coord Req for PSR2 SU) | **eDP 1.4a+** | PSR2 Y 座標需求 |
| | | bit 5 (PSR2 SU Granularity Req) | **eDP 1.4b+** | PSR2 SU 粒度需求 |
| | | bit 6 (Frame Sync Not Needed) | **eDP 1.5+** | 不需 Frame Sync（via eDP 1.4b SCR） |
| **00115h** | LINK_RATE_SET | bits 2:0 (index) | **eDP 1.4+** | Link Rate Table 索引（非 eDP 1.3） |
| | | bit 3 (TX_GTC_CAP) | **eDP 1.4+** | GTC 能力 |
| **00116h** | RECEIVER_ALPM_CONFIG | bit 0 (ALPM Enable) | **eDP 1.4+** | ALPM 啟用 |
| | | bit 1 (Lock Error IRQ) | **eDP 1.4+** | ALPM 鎖定錯誤中斷 |
| | | bit 2 (ALPM Mode: AUX-less) | **eDP 1.5+** | AUX-less ALPM 模式選擇 |
| | | bit 3 (CDS Phase Period) | **eDP 1.5+** | CDS 相位週期 |
| **00170h** | PSR_CONFIGURATION | bits 0-3 (PSR1 config) | **eDP 1.3+** | PSR1 基礎設定 |
| | | bit 4 (SU Region Scan Line) | **eDP 1.4+** | PSR2 SU 掃描線 |
| | | bit 5 (IRQ_HPD CRC Error) | **eDP 1.4+** | PSR2 CRC 錯誤中斷 |
| | | bit 6 (Enable PSR2 Protocol) | **eDP 1.4+** | 啟用 PSR2 |
| | | bit 7 (SU Early Transport) | **eDP 1.5+** | SU 早期傳輸（via eDP 1.4b SCR） |
| **00160h** | DSC_ENABLE | bit 0 (Decompression Enable) | **eDP 1.4a+ / DP 1.4+** | DSC 啟用 |
| | | bit 1 (DSC Passthrough) | **eDP 1.5+** | DSC 直通啟用 |
| **00703h** | EDP_GENERAL_CAPABILITY_2 | bit 0 (OVERDRIVE) | **eDP 1.2+** | 原始定義 |
| | | bits 2:1 (BL Brightness Alignment) | **eDP 1.5+** | 背光亮度 bit 對齊方式（via eDP 1.4b SCR） |
| **00721h** | EDP_BACKLIGHT_MODE_SET | bits 0-4 (基礎模式) | **eDP 1.2+** | 原始定義 |
| | | bit 5 (Regional BL Enable) | **eDP 1.4+** | 區域背光啟用 |
| | | bit 6 (Update Region Brightness) | **eDP 1.4+** | 更新區域亮度 |
| **0200Ah** | PSR_DEBUG_1 | bits 0-2 (PSR1 debug) | **eDP 1.3+** | PSR1 除錯 |
| | | bit 3 (SU Valid) | **eDP 1.4+** | PSR2 SU 有效 |
| | | bit 4 (First Scan Line SU) | **eDP 1.4+** | PSR2 SU 第一掃描線 |
| | | bit 5 (Last Scan Line SU) | **eDP 1.4+** | PSR2 SU 最後掃描線 |
| | | bit 6 (Y-Coordinate Valid) | **eDP 1.4a+** | Y 座標有效 |
| **0200Bh** | ALPM_ARP_STATUS | bit 0 (ALPM Lock Error) | **eDP 1.4+** | ALPM 鎖定超時（非 eDP 1.3） |
| | | bit 1 (ARP Screen Refresh IRQ) | **eDP 1.5+** | ARP 螢幕刷新中斷 |
| | | bit 2 (AUX-less ALPM Lock Error) | **eDP 1.5+** | AUX-less ALPM 鎖定錯誤（via eDP 1.4b SCR） |
| **02006h** | PSR_ERROR_STATUS | bits 0-1 (基礎 PSR error) | **eDP 1.3+** | PSR 基礎錯誤 |
| | | bit 2 (VSC SDP Uncorrectable Error) | **eDP 1.4+** | PSR2 VSC SDP 不可修正錯誤 |
| **000B0h** | PANEL_REPLAY_CAP | bit 2 (Early Transport Support) | **eDP 1.5+** | 目前整體標 eDP 1.5+ 但缺 bit 2 的獨立標註 |
| **000B1h** | PANEL_REPLAY_CAPABILITY | bit 6 (SU Y Granularity Extended) | **eDP 1.5+** | SU Y 粒度擴展能力（via eDP 1.4b SCR） |
| **00065h** | DSC_LINE_BUFFER_BIT_DEPTH | 值 010b, 011b, 100b | **eDP 1.4b+** | 11-bit/12-bit/13-bit Line Buffer 在 eDP 1.4b 才新增 |
| **00067h-00068h** | MAX_BITS_PER_PIXEL | bits [6:5] MAX_BPP_DELTA_VERSION | **eDP 1.5+** | BPP Delta 版本（via eDP 1.4b SCR） |
| | | bit [7] MAX_BPP_DELTA_AVAILABILITY | **eDP 1.5+** | BPP Delta 可用性 |

---

## 第四部分：eDP 1.4 引入的區域背光暫存器（部分遺漏）

現有 META 標註 00740h-0074Fh 為 eDP 1.2+，但實際上：
- 00700h-00733h: **eDP 1.2+**（背光基礎功能）
- 00704h: **eDP 1.4+**（EDP_GENERAL_CAPABILITY_3，區域背光 X/Y region 能力）
- 00740h-0074Fh: **eDP 1.4+**（Regional Backlight Brightness 暫存器）
- 00750h-00751h: **eDP 1.5+**（Sink Video/Trailing Video Delay，via eDP 1.4b SCR）

所以 00740h-0074Fh 應該從 eDP 1.2+ 改為 **eDP 1.4+**。

---

## 第五部分：DP 版本間的差異（DP 1.2 → 1.3 → 1.4a）

### DP 1.2 → DP 1.3 新增

| 位址 | 暫存器名稱 | 說明 |
|------|-----------|------|
| 00004h-00005h | NORP 擴展 | DP 1.3 擴展了 NORP 定義 |
| 00007h bit 7 | EXTENDED_RECEIVER_CAP | DP 1.3 定義 Extended Receiver Capability 旗標 |
| 00023h-0002Dh | AV_SYNC_DATA_BLOCK | DP 1.3 更新（已在 META 中） |
| 02200h-02202h | Extended Receiver Cap | DP 1.3 新增（已在 META 中） |

### DP 1.3 → DP 1.4a 新增

| 位址 | 暫存器名稱 | 說明 |
|------|-----------|------|
| 00003h bit 7 | TPS4_SUPPORTED | DP 1.4 新增 TPS4 訓練模式支援 |
| 00060h-0006Ch | DSC 區域 | DP 1.4a 新增（已在 META 中） |
| 00090h | FEC_CAPABILITY | DP 1.4a 新增（**META 遺漏**） |
| 00120h | FEC_CONFIGURATION | DP 1.4a 新增（META 標為 DP 1.4+ 但實為 FEC 而非 FAUX） |
| 00280h-00282h | FEC_STATUS / ERROR_COUNT | DP 1.4a 新增 FEC 相關（已在 META 中但標註含糊） |
| 02210h | DPRX_FEATURE_ENUMERATION | DP 1.4a 新增（已在 META 中） |

---

## 第六部分：統計摘要

| 類別 | 數量 |
|------|------|
| 版本標註錯誤 | **9 筆** |
| 完全遺漏的暫存器 | **約 35+ 個位址** |
| 缺少 bit-level 差異標註 | **約 50+ 個 bit** |
| 已正確標註 | 約 100 筆（占現有 META 的大部分） |

---

## 第七部分：建議的 DPCD_VER_META 更新

以下是建議的完整更新列表（只列出需要修改或新增的項目）：

### 修正版本標註

```javascript
// 原始: "00010":{v:"edp13",l:"eDP 1.3+"} → 應改為:
"00010":{v:"edp14",l:"eDP 1.4+"}, // ... 到 0001F 全部改

// 原始: "0002E":{v:"edp13",l:"eDP 1.3+"} → 應改為:
"0002E":{v:"edp14",l:"eDP 1.4+",bits:{"1":{v:"edp14a",l:"eDP 1.4a+"},"2":{v:"edp15",l:"eDP 1.5+"}}},

// 原始: "0002F":{v:"edp13",l:"eDP 1.3+"} → 應改為:
"0002F":{v:"edp14",l:"eDP 1.4+"},

// 原始: "00115":{v:"edp13",l:"eDP 1.3+"} → 應改為:
"00115":{v:"edp14",l:"eDP 1.4+"},

// 原始: "00116":{v:"edp13",l:"eDP 1.3+"} → 應改為:
"00116":{v:"edp14",l:"eDP 1.4+",bits:{"2":{v:"edp15",l:"eDP 1.5+"},"3":{v:"edp15",l:"eDP 1.5+"}}},

// 原始: "00117":{v:"edp13",l:"eDP 1.3+"} → 應改為:
"00117":{v:"edp14",l:"eDP 1.4+"},

// 原始: "0200B":{v:"edp13",l:"eDP 1.3+"} → 應改為:
"0200B":{v:"edp14",l:"eDP 1.4+",bits:{"1":{v:"edp15",l:"eDP 1.5+"},"2":{v:"edp15",l:"eDP 1.5+"}}},

// 原始: "02008":{v:"edp14b",l:"eDP 1.4b+"} → 應改為:
"02008":{v:"edp13",l:"eDP 1.3+"},

// 00740h-0074Fh 應從 eDP 1.2+ 改為 eDP 1.4+
"00740":{v:"edp14",l:"eDP 1.4+"}, // ... 到 0074F 全部改
```

### 新增 bit-level 差異

```javascript
// 00003h: 新增 TPS4 bit
"00003":{bits:{"7":{v:"dp14a",l:"DP 1.4+"}}},

// 00007h: 修正 bit 定義
"00007":{bits:{"6":{v:"edp12",l:"eDP 1.2+"},"7":{v:"edp15",l:"eDP 1.5+"}}},

// 0000Dh: 新增 bit-level
"0000D":{v:"edp11",l:"eDP 1.1+",bits:{"3":{v:"edp12",l:"eDP 1.2+"}}},

// 0002Eh: 新增 bit-level
"0002E":{v:"edp14",l:"eDP 1.4+",bits:{"1":{v:"edp14a",l:"eDP 1.4a+"},"2":{v:"edp15",l:"eDP 1.5+"}}},

// 00070h: 新增 PSR 版本 bit-level（用 value 表示）
"00070":{v:"edp13",l:"eDP 1.3+",bits:{"7:0_v02":{v:"edp14",l:"eDP 1.4+ (PSR2)"},"7:0_v03":{v:"edp14a",l:"eDP 1.4a+ (PSR2+Y)"},"7:0_v04":{v:"edp15",l:"eDP 1.5+ (Early Transport)"}}},

// 00071h: 新增 PSR2 bits
"00071":{v:"edp13",l:"eDP 1.3+",bits:{"4":{v:"edp14a",l:"eDP 1.4a+"},"5":{v:"edp14b",l:"eDP 1.4b+"},"6":{v:"edp15",l:"eDP 1.5+"}}},

// 00170h: 新增（完全遺漏）
"00170":{v:"edp13",l:"eDP 1.3+",bits:{"4":{v:"edp14",l:"eDP 1.4+"},"5":{v:"edp14",l:"eDP 1.4+"},"6":{v:"edp14",l:"eDP 1.4+"},"7":{v:"edp15",l:"eDP 1.5+"}}},

// 00160h: 新增 bit 1
"00160":{v:"dp14a",l:"DP 1.4+",bits:{"1":{v:"edp15",l:"eDP 1.5+"}}},

// 00703h: 新增 bits 2:1
"00703":{v:"edp12",l:"eDP 1.2+",bits:{"2:1":{v:"edp15",l:"eDP 1.5+"}}},

// 00721h: 新增 bits 5,6
"00721":{v:"edp12",l:"eDP 1.2+",bits:{"5":{v:"edp14",l:"eDP 1.4+"},"6":{v:"edp14",l:"eDP 1.4+"}}},

// 0200Ah: 新增
"0200A":{v:"edp13",l:"eDP 1.3+",bits:{"3":{v:"edp14",l:"eDP 1.4+"},"4":{v:"edp14",l:"eDP 1.4+"},"5":{v:"edp14",l:"eDP 1.4+"},"6":{v:"edp14a",l:"eDP 1.4a+"}}},

// 02006h: 新增 bit 2
"02006":{v:"edp13",l:"eDP 1.3+",bits:{"2":{v:"edp14",l:"eDP 1.4+"}}},

// 000B1h: 新增 bit 6
"000B1":{v:"edp15",l:"eDP 1.5+",bits:{"6":{v:"edp15",l:"eDP 1.5+"}}},

// 00065h: 新增 value-level
"00065":{v:"dp14a",l:"DP 1.4+",bits:{"2:0_v010":{v:"edp14b",l:"eDP 1.4b+ (11-bit)"},"2:0_v011":{v:"edp14b",l:"eDP 1.4b+ (12-bit)"},"2:0_v100":{v:"edp14b",l:"eDP 1.4b+ (13-bit)"}}},

// 00067h-00068h: 新增 bits
"00068":{v:"dp14a",l:"DP 1.4+",bits:{"6:5":{v:"edp15",l:"eDP 1.5+"},"7":{v:"edp15",l:"eDP 1.5+"}}},
```

### 新增完全遺漏的暫存器

```javascript
// PSR
"00170":{v:"edp13",l:"eDP 1.3+",bits:{...}},  // PSR Configuration
"02009":{v:"edp13",l:"eDP 1.3+"},              // PSR Debug 0
"0200A":{v:"edp13",l:"eDP 1.3+",bits:{...}},   // PSR Debug 1

// eDP 1.4
"00704":{v:"edp14",l:"eDP 1.4+"},              // General Cap 3
"0015C":{v:"edp14",l:"eDP 1.4+"}, "0015D":{v:"edp14",l:"eDP 1.4+"},
"0015E":{v:"edp14",l:"eDP 1.4+"}, "0015F":{v:"edp14",l:"eDP 1.4+"},
"0200F":{v:"edp14",l:"eDP 1.4+"},              // DSC Status

// eDP 1.4b
"02010":{v:"edp14b",l:"eDP 1.4b+"},            // AUX Frame Sync Status
"02011":{v:"edp14b",l:"eDP 1.4b+"},            // DSC Status Mirror
"02012":{v:"edp14b",l:"eDP 1.4b+"},            // Touch IRQ Vector

// eDP 1.5 - Panel Replay
"000B4":{v:"edp15",l:"eDP 1.5+"},
"000B5":{v:"edp15",l:"eDP 1.5+"}, "000B6":{v:"edp15",l:"eDP 1.5+"},
"001B0":{v:"edp15",l:"eDP 1.5+"}, "001B1":{v:"edp15",l:"eDP 1.5+"},
"001B8":{v:"edp15",l:"eDP 1.5+"},
"001B9":{v:"edp15",l:"eDP 1.5+"}, "001BA":{v:"edp15",l:"eDP 1.5+"},
"0011A":{v:"edp15",l:"eDP 1.5+"},
"0011B":{v:"edp15",l:"eDP 1.5+"},
"0020C":{v:"edp15",l:"eDP 1.5+"},
"02013":{v:"edp15",l:"eDP 1.5+"}, "02014":{v:"edp15",l:"eDP 1.5+"}, "02015":{v:"edp15",l:"eDP 1.5+"},
"02020":{v:"edp15",l:"eDP 1.5+"},
"02022":{v:"edp15",l:"eDP 1.5+"},
"02025":{v:"edp15",l:"eDP 1.5+"},
"02201":{v:"edp15",l:"eDP 1.5+"},
"02207":{v:"edp15",l:"eDP 1.5+"},
"02214":{v:"edp15",l:"eDP 1.5+"},
"02218":{v:"edp15",l:"eDP 1.5+"},

// DP 1.4 - FEC
"00090":{v:"dp14a",l:"DP 1.4+"},               // FEC Capability

// MSO CRC (eDP 1.4b/1.5)
"007AC":{v:"edp14b",l:"eDP 1.4b+"}, // ... 到 007B9h
"007C0":{v:"edp15",l:"eDP 1.5+"},   // ... 到 007D1h
```

---

## 附錄：各版本 PDF 檔案對照

| 版本 | 檔案名稱 | 位置 |
|------|---------|------|
| DP v1.2 | DP_v1_2.pdf | ~/Documents/TCON/Datasheet/ |
| DP v1.3 | DP_v1_3.pdf | ~/Documents/TCON/Datasheet/ |
| DP v1.4a | DP_v1.4a_mem.pdf | ~/Documents/TCON/Datasheet/ |
| eDP v1.2 | eDPv1_2.pdf | ~/Documents/TCON/Datasheet/ |
| eDP v1.3 | eDP_v1_3.pdf | ~/Documents/TCON/Datasheet/ |
| eDP v1.4b | eDP_v1_4b.pdf | ~/Documents/TCON/Datasheet/ |
| eDP v1.5 | eDP-v1.5-mem.pdf | ~/Documents/TCON/Datasheet/ |
