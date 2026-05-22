# DPCD 版本差異分析 — 第三方仲裁報告

> **仲裁日期**：2026-05-22
> **仲裁者**：Claude（獨立第三方，不信任任一報告結論）
> **驗證方式**：逐筆從 7 份 PDF 原文（DP v1.2/v1.3/v1.4a、eDP v1.2/v1.3/v1.4b/v1.5）以 `pdftotext -layout` 轉文字後搜尋驗證，每一筆皆附具體查證紀錄
> **報告一**：DPCD_VERSION_DIFF_ANALYSIS.md（分析報告）
> **報告二**：DPCD_VERSION_DIFF_REVIEW.md（審核報告）

---

## 一、報告二指出的 6 個爭議點仲裁

### 爭議點 1：0200Fh vs 0020Fh — DSC_STATUS 位址

| 項目 | 報告一說法 | 報告二說法 | PDF 原文查證 | 仲裁結論 |
|------|-----------|-----------|-------------|---------|
| DSC_STATUS 位址 | 0200Fh | 應為 0020Fh | eDP v1.4b 第 186 頁 Table 8-6 明確寫 "0020Fh DSC STATUS"，"New to eDP v1.4"。0200Fh 在 eDP v1.5 中指向 SINK_STATUS_ESI 相關暫存器，非 DSC_STATUS | **報告二正確**。報告一位址寫錯，0200Fh→0020Fh |

### 爭議點 2：00007h bit 7 — OUI_SUPPORT vs EXTENDED_RECEIVER_CAP

| 項目 | 報告一說法 | 報告二說法 | PDF 原文查證 | 仲裁結論 |
|------|-----------|-----------|-------------|---------|
| 00007h bit 7 功能名稱 | Part 5 寫 "EXTENDED_RECEIVER_CAP — DP 1.3" | OUI_SUPPORT 從 DP v1.2 起就有；EXTENDED_RECEIVER_CAP 在 0000Eh bit 7 | DP v1.2 第 209 頁 00007h bit 7 = "OUI Support"（明確定義）；DP v1.3 第 14566 行 0000Eh bit 7 = EXTENDED_RECEIVER_CAPABILITY_FIELD_PRESENT | **報告二正確**。報告一 Part 5 把功能名稱和位址都搞混了：00007h bit 7 自 DP v1.2 即為 OUI_SUPPORT，EXTENDED_RECEIVER_CAP 在 0000Eh |
| 00007h bit 7 eDP 版本 | Part 3 寫 "eDP 1.5+" | — | eDP v1.3 只定義 bit 6（MSA_TIMING_PAR_IGNORED）；eDP v1.4b 同樣只有 bit 6；eDP v1.5 第 9927 行才有 00007h[7] OUI_SUPPORT | **報告一 Part 3 在 eDP 脈絡下正確（eDP 1.5+），但 Part 5 的位址和名稱有誤** |

### 爭議點 3：00003h bit 7 TPS4_SUPPORTED — DP 1.3+ 還是 DP 1.4+

| 項目 | 報告一說法 | 報告二說法 | PDF 原文查證 | 仲裁結論 |
|------|-----------|-----------|-------------|---------|
| TPS4_SUPPORTED 首見版本 | DP 1.4+ | DP 1.3+ | DP v1.2 第 209 頁 00003h bit 7 = "RESERVED. Read all 0s"；DP v1.3 第 14308 行 00003h bit 7 = "TPS4_SUPPORTED"，明確定義 | **報告二正確**。TPS4 在 DP v1.3 即已定義，非 DP 1.4 |

### 爭議點 4：02210h DPRX_FEATURE_ENUMERATION_LIST — DP 1.3+ 還是 DP 1.4a

| 項目 | 報告一說法 | 報告二說法 | PDF 原文查證 | 仲裁結論 |
|------|-----------|-----------|-------------|---------|
| 02210h 首見版本 | DP 1.4a 新增 | DP 1.3+ | DP v1.2 無此位址；DP v1.3 第 17488 行 "02210h DPRX_FEATURE_ENUMERATION_LIST"，含 bits 0 (GTC_CAP)、2 (AV_SYNC_CAP)、3 (VSC_SDP_EXTENSION)，第 374 頁 | **報告二正確**。02210h 在 DP v1.3 即已定義 |

### 爭議點 5：00170h bit 6 Enable PSR2 Protocol — eDP 1.4+ 還是 eDP 1.4a+

| 項目 | 報告一說法 | 報告二說法 | PDF 原文查證 | 仲裁結論 |
|------|-----------|-----------|-------------|---------|
| bit 6 首見版本 | eDP 1.4+ | eDP 1.4a+ | eDP v1.4b 第 152 頁 Table 6-6 (Continued) 00170h bit 6 "Enable PSR2 Protocol — **New to eDP v1.4a** for PSR2 support" | **報告二正確**。明確標記 "New to eDP v1.4a"，不是 v1.4 |

### 爭議點 6：eDP 版本命名 "eDP 1.4+" 問題

| 項目 | 報告一說法 | 報告二說法 | PDF 原文查證 | 仲裁結論 |
|------|-----------|-----------|-------------|---------|
| 是否存在 "eDP v1.4" 概念 | 使用 "eDP 1.4+" 標記 | 質疑是否只有 v1.4a/v1.4b | eDP v1.4b PDF 中大量使用 "New to eDP v1.4" 標記（如 0002Eh、0002Fh、00115h 等），明確區分 v1.4 vs v1.4a vs v1.4b | **兩報告皆不算錯**。eDP v1.4 作為版本概念確實存在於 v1.4b 規格書中，雖然我們手上沒有獨立的 "eDP v1.4" PDF |

---

## 二、Part 1 版本標註錯誤（全 9 筆逐筆驗證）

| # | 位址 | 報告一說法 | 報告二說法 | PDF 查證 | 仲裁結論 |
|---|------|-----------|-----------|---------|---------|
| 1 | 00010h-0001Fh | eDP 1.3+→eDP 1.4+ | 正確 | eDP v1.3 無此區段；eDP v1.4b 第 96 頁 "SUPPORTED_LINK_RATES — New to eDP v1.4" | ✅ 兩報告皆正確 |
| 2 | 0002Eh | eDP 1.3+→eDP 1.4+ | 正確 | eDP v1.3 無；eDP v1.4b 第 112 頁 "RECEIVER_ADVANCED_LINK_POWER_MANAGEMENT_CAPABILITIES — New to eDP v1.4" | ✅ 兩報告皆正確 |
| 3 | 0002Fh | eDP 1.3+→eDP 1.4+ | 正確 | eDP v1.3 無；eDP v1.4b 第 168 頁 "AUX FRAME SYNC — New to eDP v1.4 for PSR2 support" | ✅ 兩報告皆正確 |
| 4 | 00115h | eDP 1.3+→eDP 1.4+ | 正確 | eDP v1.3 無；eDP v1.4b 第 97 頁 "LINK_RATE_SET — New to eDP v1.4" | ✅ 兩報告皆正確 |
| 5 | 00116h | eDP 1.3+→eDP 1.4+ | 正確 | eDP v1.3 無；eDP v1.4b 第 112 頁 "RECEIVER ADVANCED LINK POWER MANAGEMENT CONFIGURATION — New to eDP v1.4" | ✅ 兩報告皆正確 |
| 6 | 00117h | eDP 1.3+→eDP 1.4+ | 正確 | eDP v1.3 無；eDP v1.4b 第 169 頁 "SINK DEVICE AUX_FRAME_SYNC CONFIGURATION — New to eDP v1.4 for PSR2 support" | ✅ 兩報告皆正確 |
| 7 | 0200Bh | eDP 1.3+→eDP 1.4+ | 正確 | eDP v1.3 無；eDP v1.4b 第 113 頁 "RECEIVER ADVANCED LINK POWER MANAGEMENT STATUS — New to eDP v1.4" | ✅ 兩報告皆正確 |
| 8 | 02008h | eDP 1.4b+→eDP 1.3+ | 正確 | eDP v1.3 第 34 頁 "2008h — SINK PANEL SELF REFRESH STATUS"，已明確定義 | ✅ 兩報告皆正確 |
| 9 | 00007h bit 7 | eDP 1.2+→eDP 1.5+ | 正確 | eDP v1.3 只有 bit 6；eDP v1.4b 只有 bit 6（第 57 頁）；eDP v1.5 第 9927 行 00007h[7] OUI_SUPPORT。但 DP v1.2 第 209 頁已有 bit 7 = OUI Support | ✅ eDP 脈絡下正確，但須注意 DP v1.2 早已定義 |

**Part 1 小結**：報告一 9 筆全部正確。報告二對此 9 筆也全部認同。

---

## 三、Part 2 完全遺漏暫存器（全部逐筆驗證）

### Part 2A：eDP 1.3 新增（6 筆）

| # | 位址 | 暫存器名稱 | 報告一說法 | PDF 查證 | 仲裁結論 |
|---|------|-----------|-----------|---------|---------|
| 1 | 00070h | PSR_SUPPORT_AND_VERSION | eDP 1.3+ | eDP v1.3 第 32 頁 "00070h PANEL SELF REFRESH CAPABILITY SUPPORTED AND VERSION"；eDP v1.2 無 | ✅ 正確 |
| 2 | 00071h | PSR_CAPABILITIES | eDP 1.3+ | eDP v1.3 第 32 頁 "00071h PANEL SELF REFRESH CAPABILITIES"；eDP v1.2 無 | ✅ 正確 |
| 3 | 00170h | PSR_ENABLE_AND_CONFIGURATION | eDP 1.3+ | eDP v1.3 第 33 頁 "00170h PANEL SELF REFRESH ENABLE AND CONFIGURATION"；eDP v1.2 無 | ✅ 正確 |
| 4 | 02009h | PSR_DEBUG_REGISTER_0 | eDP 1.3+ | eDP v1.3 第 36 頁 "2009h DEBUG REGISTER 0"；eDP v1.2 無 | ✅ 正確 |
| 5 | 0200Ah | PSR_DEBUG_REGISTER_1 | eDP 1.3+ | eDP v1.3 第 37 頁 "200Ah DEBUG REGISTER 1"；eDP v1.2 無 | ✅ 正確 |
| 6 | 02008h | SINK_PSR_STATUS | 已在 Part 1 #8 處理 | — | 重複項，略 |

### Part 2B：eDP 1.4 / eDP 1.4a 新增（7 筆）

| # | 位址 | 暫存器名稱 | 報告一說法 | PDF 查證 | 仲裁結論 |
|---|------|-----------|-----------|---------|---------|
| 1 | 00704h | EDP_GENERAL_CAPABILITY_3 | eDP 1.4+ | eDP v1.4b 第 232 頁 "New to eDP v1.4"；eDP v1.3 第 26 頁 00704h = "RESERVED" | ✅ 正確 |
| 2 | 0015Ch-0015Fh | AUX_FRAME_SYNC_VALUE | eDP 1.4+ | eDP v1.4b 第 169 頁 "New to eDP v1.4 for PSR2 support" | ✅ 正確 |
| 3 | **0200Fh** | DSC_STATUS | eDP 1.4+ | ❌ **位址筆誤**：eDP v1.4b 第 186 頁 "0020Fh DSC STATUS — New to eDP v1.4"。正確位址為 **0020Fh** | ⚠️ 版本正確（eDP 1.4+），**位址寫錯** |
| 4 | 0020Ch | LINK_CONFIGURATION_STATUS | eDP 1.5+ | 報告一 Part 2B 未列此項（在 Part 2D 中）| — |

### Part 2C：eDP 1.4b 新增（4 筆）

| # | 位址 | 暫存器名稱 | 報告一說法 | PDF 查證 | 仲裁結論 |
|---|------|-----------|-----------|---------|---------|
| 1 | 02010h | AUX_FRAME_SYNC_STATUS | eDP 1.4b+ | eDP v1.4b 第 169-170 頁 "New to eDP v1.4b for PSR2 support" | ✅ 正確 |
| 2 | 02011h | DSC_STATUS (Mirror) | 報告一說 eDP 1.4b+ | eDP v1.4b 第 186 頁 Table 8-6 "0020Fh and 02011h — New to eDP v1.4"。02011h 標記為 "New to eDP v1.4"，不是 1.4b | ❌ **報告一版本錯誤**：應為 eDP 1.4+，非 eDP 1.4b+ |
| 3 | 02012h | SINK_USER_IRQ_VECTOR | eDP 1.4b+ | eDP v1.4b 第 213 頁 "New to eDP v1.4b" | ✅ 正確 |
| 4 | 007ACh-007B9h | MSO CRC (MSO_3, MSO_4) | eDP 1.4b+ | eDP v1.4b 第 69 頁 "New to eDP v1.4b for Multi-SST Operation" | ✅ 正確 |

### Part 2D：eDP 1.5 新增（18 筆）

| # | 位址 | 暫存器名稱 | 報告一說法 | PDF 查證 | 仲裁結論 |
|---|------|-----------|-----------|---------|---------|
| 1 | 000B4h | PR_SU_Y_GRANULARITY | eDP 1.5+ | eDP v1.4b 無；eDP v1.5 第 34950 行有定義 | ✅ 正確 |
| 2 | 000B5h-000B6h | SU_Y_GRANULARITY_EXTENDED | eDP 1.5+ | eDP v1.4b 無；eDP v1.5 有（15 hits） | ✅ 正確 |
| 3 | 001B0h | PANEL_REPLAY_CONFIGURATION_1 | eDP 1.5+ | eDP v1.4b 無；eDP v1.5 有（15 hits） | ✅ 正確 |
| 4 | 001B1h | PANEL_REPLAY_CONFIGURATION_2 | eDP 1.5+ | eDP v1.4b 無；eDP v1.5 有（19 hits） | ✅ 正確 |
| 5 | 001B8h | ARP_CONFIGURATION | eDP 1.5+ | eDP v1.4b 無；eDP v1.5 有（8 hits） | ✅ 正確 |
| 6 | 001B9h-001BAh | ARP_t2_MAX | eDP 1.5+ | eDP v1.4b 無；eDP v1.5 有（5 hits） | ✅ 正確 |
| 7 | 0011Ah | PR_CONFIGURATION_3 | eDP 1.5+ | eDP v1.4b 無；eDP v1.5 有（9 hits） | ✅ 正確 |
| 8 | 0011Bh | ADAPTIVE_SYNC_SDP_TIMING_CONFIG | eDP 1.5+ | eDP v1.4b 無；eDP v1.5 有（9 hits） | ✅ 正確 |
| 9 | 0020Ch | LINK_CONFIGURATION_STATUS | eDP 1.5+ | eDP v1.4b 無；eDP v1.5 有（6 hits） | ✅ 正確 |
| 10 | 02013h-02015h | DSC_STATUS_MSO_2/3/4 | eDP 1.5+ | eDP v1.4b 無；eDP v1.5 有 | ✅ 正確 |
| 11 | 02020h | PANEL_REPLAY_ERROR_STATUS | eDP 1.5+ | eDP v1.4b 無；eDP v1.5 有（8 hits） | ✅ 正確 |
| 12 | 02022h | SINK_PR_AND_FRAME_LOCK_STATUS | eDP 1.5+ | eDP v1.4b 無；eDP v1.5 有（11 hits） | ✅ 正確 |
| 13 | 02025h | ARP_EXTENDED_REFRESH_DIV | eDP 1.5+ | eDP v1.4b 無；eDP v1.5 有（16 hits） | ✅ 正確 |
| 14 | 02201h | 8b10b_MAX_LINK_RATE (Extended) | eDP 1.5+ | eDP v1.4b 無；eDP v1.5 有（17 hits） | ✅ 正確 |
| 15 | 02207h | DOWN_STREAM_PORT_COUNT (Extended) | eDP 1.5+ | eDP v1.4b 無；eDP v1.5 有（11 hits） | ✅ 正確 |
| 16 | 02214h | DPRX_FEATURE_ENUM_LIST_CONT_1 | eDP 1.5+ | eDP v1.4b 無；eDP v1.5 有（14 hits） | ✅ 正確 |
| 17 | 02218h | DPRX_FEATURE_ENUM_LIST_CONT_2 | eDP 1.5+ | eDP v1.4b 無；eDP v1.5 有（5 hits） | ✅ 正確 |
| 18 | 007C0h-007D1h | DSC_CRC_MSO_2/3/4 | eDP 1.5+ | eDP v1.4b 無；eDP v1.5 有 | ✅ 正確 |

### Part 2E：DP 1.3/1.4a 新增（4 筆）

| # | 位址 | 暫存器名稱 | 報告一說法 | PDF 查證 | 仲裁結論 |
|---|------|-----------|-----------|---------|---------|
| 1 | 00003h bit 7 | TPS4_SUPPORTED | DP 1.4+ | DP v1.2 bit 7 = RESERVED；DP v1.3 第 14308 行 bit 7 = TPS4_SUPPORTED | ❌ **應為 DP 1.3+** |
| 2 | 00090h | FEC_CAPABILITY | DP 1.4+ | DP v1.3 第 15084 行 00090h = RESERVED；DP v1.4a 第 51070 行 = FEC_CAPABILITY | ✅ 正確（嚴格說是 DP 1.4a+） |
| 3 | 00160h bit 1 | DSC_PASSTHROUGH_ENABLE | eDP 1.5+ | eDP v1.5 第 47124 行 bit 1 "New to eDP v1.5" | ✅ 正確 |
| 4 | 02202h | DPCD_REV (Extended) | DP 1.3+ | DP v1.2 無；DP v1.3 第 17155 行有 02202h | ✅ 正確 |

**Part 2 小結**：報告一約 35 筆遺漏暫存器中有 3 個錯誤：0200Fh 位址筆誤（→0020Fh）、02011h 版本錯（eDP 1.4b+→eDP 1.4+）、00003h bit 7 版本錯（DP 1.4+→DP 1.3+）。

---

## 四、Part 3 bit-level 差異（全部逐筆驗證）

| # | 位址 | bit | 報告一說法 | PDF 查證 | 仲裁結論 |
|---|------|-----|-----------|---------|---------|
| 1 | 00003h | bit 7 (TPS4) | DP 1.4+ | DP v1.2 bit 7 = RESERVED；DP v1.3 第 14308 行 = TPS4_SUPPORTED | ❌ 應為 **DP 1.3+** |
| 2 | 00007h | bit 7 (OUI_SUPPORT) | eDP 1.5+ | eDP v1.3 只有 bit 6；eDP v1.4b 第 57 頁只有 bit 6；eDP v1.5 第 9927 行才有 bit 7。但 DP v1.2 第 209 頁已有 | ✅ eDP 脈絡正確，但不完整（DP v1.2 已有） |
| 3 | 0000Dh | bit 0 (ASSR) | eDP 1.1+ | eDP v1.2 第 19 頁已有 bit 0 = ALTERNATE_SCRAMBLER_RESET_CAPABLE。無 eDP v1.1 PDF 可驗 | ⚠️ **無法驗證 eDP 1.1**，僅確認 eDP 1.2 已有 |
| 4 | 0000Dh | bit 3 (DISPLAY_CONTROL) | eDP 1.2+ | eDP v1.2 第 19 頁 Table 3-4 標題 "Assignment of DPCD Register 0000Dh Bit 3 **within eDP v1.2**" | ✅ 正確 |
| 5 | 0002Eh | bit 0 (AUX_WAKE_ALPM) | eDP 1.4+ | eDP v1.4b 第 112 頁 "New to eDP v1.4" | ✅ 正確 |
| 6 | 0002Eh | bit 1 (PM_State 2a) | eDP 1.4a+ | eDP v1.4b 第 112 頁 "New to eDP v1.4a" | ✅ 正確 |
| 7 | 0002Eh | bit 2 (AUX_LESS_ALPM) | eDP 1.5+ | eDP v1.4b 7:2 = RESERVED；eDP v1.5 新增 | ✅ 正確 |
| 8 | 00070h | 值 01h (PSR1) | eDP 1.3+ | eDP v1.3 第 32 頁 "01h = Panel Self Refresh Capability supported and PSR version is 01h" | ✅ 正確 |
| 9 | 00070h | 值 02h (PSR2) | eDP 1.4+ | eDP v1.4b 第 149 頁 "02h = ...Supported by eDP v1.4 (and higher)" | ✅ 正確 |
| 10 | 00070h | 值 03h (PSR2+Y) | eDP 1.4a+ | eDP v1.4b 第 149 頁 "03h = ...Supported by eDP v1.4a (and higher)" | ✅ 正確 |
| 11 | 00070h | 值 04h (Early Transport) | eDP 1.5+ | eDP v1.5 第 45416 行 "04h = Panel Self Refresh PSR1 function is supported, and the PSR2 function that includes...SU Region Early Transport is supported" | ✅ 正確 |
| 12 | 00071h | bits 3:0 (基礎) | eDP 1.3+ | eDP v1.3 第 32 頁已定義 bits 0, 3:1 | ✅ 正確 |
| 13 | 00071h | bit 4 (Y-coord) | eDP 1.4a+ | eDP v1.4b 第 150 頁 "New to eDP v1.4a" | ✅ 正確 |
| 14 | 00071h | bit 5 (SU Granularity) | eDP 1.4b+ | eDP v1.4b 第 150 頁 "New to eDP v1.4b" | ✅ 正確 |
| 15 | 00071h | bit 6 (Frame Sync) | eDP 1.5+ | eDP v1.5 第 374 頁 "New in eDP v1.5 through adopted eDP v1.4b SCR" | ✅ 正確 |
| 16 | 00115h | bits 2:0 (index) | eDP 1.4+ | eDP v1.4b 第 97 頁 "New to eDP v1.4" | ✅ 正確 |
| 17 | 00115h | bit 3 (TX_GTC_CAP) | eDP 1.4+ | 同 00115h 整體 "New to eDP v1.4" | ✅ 正確 |
| 18 | 00116h | bit 0 (ALPM Enable) | eDP 1.4+ | eDP v1.4b 第 112 頁 "New to eDP v1.4" | ✅ 正確 |
| 19 | 00116h | bit 1 (Lock Error IRQ) | eDP 1.4+ | 同 00116h 整體 "New to eDP v1.4" | ✅ 正確 |
| 20 | 00116h | bit 2 (AUX-less ALPM) | eDP 1.5+ | eDP v1.4b 7:2 = RESERVED；eDP v1.5 新增 | ✅ 正確 |
| 21 | 00116h | bit 3 (CDS Phase) | eDP 1.5+ | eDP v1.4b 7:2 = RESERVED；eDP v1.5 新增 | ✅ 正確 |
| 22 | 00170h | bits 0-3 (PSR1 config) | eDP 1.3+ | eDP v1.3 第 33 頁已定義 bits 0-3 | ✅ 正確 |
| 23 | 00170h | bit 4 (SU Scan Line) | eDP 1.4+ | eDP v1.4b 第 152 頁 "New to eDP v1.4 for PSR2 support" | ✅ 正確 |
| 24 | 00170h | bit 5 (IRQ_HPD CRC) | eDP 1.4+ | eDP v1.4b 第 152 頁 "New to eDP v1.4 for PSR2 support" | ✅ 正確 |
| 25 | 00170h | bit 6 (Enable PSR2) | eDP 1.4+ | eDP v1.4b 第 152 頁 "**New to eDP v1.4a** for PSR2 support" | ❌ 應為 **eDP 1.4a+** |
| 26 | 00170h | bit 7 (SU Early Transport) | eDP 1.5+ | eDP v1.4b 無 bit 7 定義；eDP v1.5 第 26991 行有 00170h[7] | ✅ 正確 |
| 27 | 00160h | bit 0 (Decompression) | eDP 1.4a+ / DP 1.4+ | eDP v1.4b 第 185 頁 "00160h DSC ENABLE — New to eDP v1.4"（非 1.4a）；DP v1.4a 有 | ⚠️ eDP 部分應為 **eDP 1.4+**（非 1.4a），DP 部分正確 |
| 28 | 00160h | bit 1 (DSC Passthrough) | eDP 1.5+ | eDP v1.5 第 47124 行 "New to eDP v1.5" | ✅ 正確 |
| 29 | 00703h | bit 0 (OVERDRIVE) | eDP 1.2+ | eDP v1.2 第 24 頁 00703h bit 0 = OVERDRIVE_ENGINE_ENABLED | ✅ 正確 |
| 30 | 00703h | bits 2:1 (BL Alignment) | eDP 1.5+ | eDP v1.4b 第 231 頁 7:1 = RESERVED；eDP v1.5 新增 | ✅ 正確 |
| 31 | 00721h | bits 0-4 (基礎模式) | eDP 1.2+ | eDP v1.2 第 24 頁 00721h 已定義 bits 0-4 | ✅ 正確 |
| 32 | 00721h | bit 5 (Regional BL) | eDP 1.4+ | eDP v1.4b 第 235 頁 "New to eDP v1.4" | ✅ 正確 |
| 33 | 00721h | bit 6 (Update Region) | eDP 1.4+ | eDP v1.4b 第 235 頁 "New to eDP v1.4" | ✅ 正確 |
| 34 | 0200Ah | bits 0-2 (PSR1 debug) | eDP 1.3+ | eDP v1.3 第 37 頁 200Ah bits 0-2 已定義 | ✅ 正確 |
| 35 | 0200Ah | bit 3 (SU Valid) | eDP 1.4+ | eDP v1.4b 第 157 頁 "New to eDP v1.4" | ✅ 正確 |
| 36 | 0200Ah | bit 4 (First Scan Line) | eDP 1.4+ | eDP v1.4b 第 157 頁 "New to eDP v1.4" | ✅ 正確 |
| 37 | 0200Ah | bit 5 (Last Scan Line) | eDP 1.4+ | eDP v1.4b 第 157 頁 "New to eDP v1.4" | ✅ 正確 |
| 38 | 0200Ah | bit 6 (Y-Coordinate) | eDP 1.4a+ | eDP v1.4b 第 157 頁 "New to eDP v1.4a" | ✅ 正確 |
| 39 | 0200Bh | bit 0 (ALPM Lock Error) | eDP 1.4+ | eDP v1.4b 第 113 頁 "New to eDP v1.4" | ✅ 正確 |
| 40 | 0200Bh | bit 1 (ARP Refresh IRQ) | eDP 1.5+ | eDP v1.4b 7:1 = RESERVED；eDP v1.5 新增 | ✅ 正確 |
| 41 | 0200Bh | bit 2 (AUX-less ALPM Lock) | eDP 1.5+ | eDP v1.4b 7:1 = RESERVED；eDP v1.5 新增 | ✅ 正確 |
| 42 | 02006h | bits 0-1 (基礎 PSR error) | eDP 1.3+ | eDP v1.3 第 34 頁 2006h bits 0-1 已定義 | ✅ 正確 |
| 43 | 02006h | bit 2 (VSC SDP Error) | eDP 1.4+ | eDP v1.4b 第 154 頁 "New to eDP v1.4 for PSR2 support" | ✅ 正確 |
| 44 | 000B0h | bit 2 (Early Transport) | eDP 1.5+ | eDP v1.4b 無 000B0h；eDP v1.5 第 10013 行有定義 | ✅ 正確 |
| 45 | 000B1h | bit 6 (SU Y Gran Ext) | eDP 1.5+ | eDP v1.4b 無 000B1h；eDP v1.5 第 10015 行有定義 | ✅ 正確 |
| 46 | 00065h | 值 010/011/100 | eDP 1.4b+ | eDP v1.4b 第 183 頁 "Support for values 010, 011, and 100 added in eDP v1.4b" | ✅ 正確 |
| 47 | 00067h-00068h | bits [6:5] BPP_DELTA_VER | eDP 1.5+ | eDP v1.4b 第 184 頁 00068h 7:2 = RESERVED；eDP v1.5 新增 | ✅ 正確 |
| 48 | 00067h-00068h | bit [7] BPP_DELTA_AVAIL | eDP 1.5+ | 同上 | ✅ 正確 |

**Part 3 小結**：報告一 48 筆 bit-level 差異中有 2 個確定錯誤（#1 TPS4 和 #25 PSR2 bit 6）、1 個部分錯誤（#27 00160h bit 0 eDP 版本）、1 個無法驗證（#3 eDP 1.1）。報告二準確找到了 #1 和 #25 的錯誤。

---

## 五、Part 4 區域背光暫存器（全 4 筆驗證）

| # | 位址範圍 | 報告一說法 | PDF 查證 | 仲裁結論 |
|---|---------|-----------|---------|---------|
| 1 | 00700h-00733h | eDP 1.2+ | eDP v1.2 第 19-26 頁定義了 00700h-00733h | ✅ 正確 |
| 2 | 00704h | eDP 1.4+ | eDP v1.4b 第 232 頁 "New to eDP v1.4" | ✅ 正確 |
| 3 | 00740h-0074Fh | 應從 eDP 1.2+ 改 eDP 1.4+ | eDP v1.4b 第 243 頁 "00740h REGIONAL_BACKLIGHT_BASE — New to eDP v1.4"；eDP v1.2 00734h-0073Fh = RESERVED | ✅ 正確 |
| 4 | 00750h-00751h | eDP 1.5+ | eDP v1.4b 第 273 頁前 00750h = RESERVED；eDP v1.5 新增 | ✅ 正確 |

**Part 4 小結**：報告一全部正確。

---

## 六、Part 5 DP 版本差異（全 10 筆驗證）

| # | 位址 | 報告一說法 | PDF 查證 | 仲裁結論 |
|---|------|-----------|---------|---------|
| 1 | 00004h-00005h | DP 1.3 擴展 NORP | DP v1.2 只有 NORP bit 0；DP v1.3 第 14324 行新增 DP_PWR_VOLTAGE_CAP bits | ✅ 正確 |
| 2 | 00007h bit 7 | EXTENDED_RECEIVER_CAP DP 1.3 | DP v1.2 第 209 頁 00007h bit 7 = OUI Support；0000Eh bit 7 = EXTENDED_RECEIVER_CAP（DP v1.3 第 14566 行） | ❌ **位址和功能名稱都錯** |
| 3 | 00023h-0002Dh | DP 1.3 更新 | DP v1.3 確認更新了 AV_SYNC_DATA_BLOCK 定義 | ✅ 正確 |
| 4 | 02200h-02202h | DP 1.3 新增 | DP v1.2 無；DP v1.3 有 Extended Receiver Cap | ✅ 正確 |
| 5 | 00003h bit 7 | DP 1.4 新增 TPS4 | DP v1.3 第 14308 行已定義 TPS4_SUPPORTED | ❌ **應為 DP 1.3+** |
| 6 | 00060h-0006Ch | DP 1.4a 新增 DSC | DP v1.3 00060h 為 eDP only/RESERVED；DP v1.4a 第 33216 行 = DSC Capabilities | ✅ 正確 |
| 7 | 00090h | DP 1.4a 新增 FEC | DP v1.3 第 15084 行 RESERVED；DP v1.4a 第 51070 行 = FEC_CAPABILITY | ✅ 正確 |
| 8 | 00120h | DP 1.4a FEC_CONFIG | DP v1.3 第 15563 行 RESERVED；DP v1.4a 第 52849 行 = FEC_CONFIGURATION | ✅ 正確 |
| 9 | 00280h-00282h | DP 1.4a FEC 相關 | DP v1.3 第 16587 行 RESERVED；DP v1.4a 第 55923 行 = FEC_STATUS | ✅ 正確 |
| 10 | 02210h | DP 1.4a 新增 | DP v1.3 第 17488 行已定義 02210h DPRX_FEATURE_ENUMERATION_LIST | ❌ **應為 DP 1.3+** |

**Part 5 小結**：報告一 10 筆中有 3 個錯誤（#2 位址/名稱錯、#5 TPS4 版本錯、#10 02210h 版本錯）。

---

## 七、最終統計與結論

### 報告一（分析報告）正確率

| 部分 | 總筆數 | 正確 | 錯誤 | 無法驗證 | 正確率 |
|------|--------|------|------|----------|--------|
| Part 1 版本標註 | 9 | 9 | 0 | 0 | 100% |
| Part 2 遺漏暫存器 | ~35 | ~32 | 3 | 0 | ~91% |
| Part 3 bit-level | 48 | 44 | 3 | 1 | ~92% |
| Part 4 區域背光 | 4 | 4 | 0 | 0 | 100% |
| Part 5 DP 差異 | 10 | 7 | 3 | 0 | 70% |
| **合計** | **~106** | **~96** | **~9** | **1** | **~91%** |

### 報告二（審核報告）正確率

| 項目 | 結果 |
|------|------|
| 找到的 6 個錯誤 | 6/6 全部經 PDF 驗證為正確判定 |
| 漏網的報告一錯誤 | 3 個未找到：02011h 版本錯（eDP 1.4b+→eDP 1.4+）、00160h bit 0 eDP 版本小偏差、Part 1 #9 不完整（未提 DP v1.2） |
| 誤判（把正確說成錯誤） | 0 |
| **整體準確度** | **100%（找到的全對，但有遺漏）** |

### 報告一完整錯誤清單

| # | 位置 | 錯誤內容 | 正確答案 | 嚴重度 |
|---|------|---------|---------|--------|
| 1 | Part 2B/5/7 | 0200Fh（位址筆誤） | 0020Fh | 高 |
| 2 | Part 3/5/7 | 00003h bit 7 = DP 1.4+ | DP 1.3+ | 中 |
| 3 | Part 5 | 00007h bit 7 = EXTENDED_RECEIVER_CAP 在 00007h | OUI_SUPPORT 在 00007h（自 DP v1.2）；EXTENDED_RECEIVER_CAP 在 0000Eh（DP v1.3） | 高 |
| 4 | Part 5 | 02210h = DP 1.4a 新增 | DP 1.3+ | 中 |
| 5 | Part 3 | 00170h bit 6 = eDP 1.4+ | eDP 1.4a+ | 中 |
| 6 | Part 2C | 02011h = eDP 1.4b+ | eDP 1.4+（PDF 標 "New to eDP v1.4"） | 低 |
| 7 | Part 3 | 00160h bit 0 = eDP 1.4a+ | eDP 1.4+（PDF 標 "New to eDP v1.4"） | 低 |
| 8 | Part 3 | 0000Dh bit 0 = eDP 1.1+ | 無法驗證（無 eDP v1.1 PDF），至少 eDP 1.2+ | 低 |

### 最終建議

**可直接採納的項目**：
- Part 1 全 9 筆版本修正
- Part 2 除 0200Fh→0020Fh 和 02011h 版本外全部
- Part 3 除上列 3-4 個錯誤外全部
- Part 4 全部
- Part 5 除 #2、#5、#10 外全部

**需要修正後採納的項目**：
1. 0200Fh → **0020Fh**（位址修正）
2. 00003h bit 7 TPS4_SUPPORTED → **DP 1.3+**（非 DP 1.4+）
3. 02210h DPRX_FEATURE_ENUMERATION → **DP 1.3+**（非 DP 1.4a）
4. 00007h bit 7：Part 5 的描述需刪除或改正（EXTENDED_RECEIVER_CAP 在 0000Eh，非 00007h）
5. 00170h bit 6 → **eDP 1.4a+**（非 eDP 1.4+）
6. 02011h → **eDP 1.4+**（非 eDP 1.4b+）
7. 00160h bit 0 eDP 版本 → **eDP 1.4+**（非 eDP 1.4a+）

**無法確認的項目**：
- 0000Dh bit 0 (ASSR) 是否真為 eDP 1.1+（無 eDP v1.1 PDF 可驗）

---

> 仲裁完成。兩份報告整體品質都不錯，報告一的大方向正確（91% 正確率），報告二的審核工作也到位（找出的 6 個錯誤全部正確）。報告二另外漏掉了 3 個報告一的錯誤，但沒有任何誤判。
