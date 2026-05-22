# DPCD_VERSION_DIFF_ANALYSIS.md 獨立審核報告

**審核日期**：2026-05-22
**審核方式**：逐筆核對報告每一項宣稱，對照 7 份 PDF 原文（DP v1.2/v1.3/v1.4a、eDP v1.2/v1.3/v1.4b/v1.5）以 `pdftotext -layout` 擷取全文後搜尋驗證。

---

## 審核結果摘要

| 類別 | 項目數 | 正確 | 有誤 | 無法驗證 |
|------|--------|------|------|----------|
| 第一部分：版本標註錯誤 | 9 | 9 | 0 | 0 |
| 第二部分：完全遺漏暫存器 | ~35 地址 | ~34 | 1（位址筆誤） | 0 |
| 第三部分：bit-level 差異 | ~30 項 | ~27 | 2 | 1 |
| 第四部分：區域背光暫存器 | 4 項 | 4 | 0 | 0 |
| 第五部分：DP 版本差異 | 10 項 | 7 | 3 | 0 |
| 第七部分：建議 code 修改 | ~40 項 | ~37 | 3（繼承前述錯誤） | 0 |

**整體可信度：約 92%（6 個獨立錯誤 / ~80 項宣稱）**

報告的大方向正確，對 eDP/DP 各版本暫存器的首見版本判斷絕大多數準確，是有價值的參考文件。以下列出所有發現的錯誤。

---

## 發現的錯誤（共 6 個獨立錯誤）

### 錯誤 1：00003h bit 7 TPS4_SUPPORTED 版本標註

| 項目 | 內容 |
|------|------|
| **報告宣稱** | Part 5 第174行："DP 1.4 新增 TPS4 訓練模式支援"；Part 7 第233行建議 `dp14a` / "DP 1.4+" |
| **PDF 查證** | DP v1.2 (`dp12.txt`) 00003h bit 7 = RESERVED；DP v1.3 (`dp13.txt`) line 14261: bit 7 = `TPS4_SUPPORTED`，明確定義 |
| **正確版本** | **DP 1.3+**（非 DP 1.4+） |
| **嚴重程度** | 中 — 會導致 DPCD 工具在 DP 1.3 裝置上錯誤地將 TPS4 標為「未定義」 |

### 錯誤 2：00007h bit 7 暫存器地址錯誤

| 項目 | 內容 |
|------|------|
| **報告宣稱** | Part 5 第166行："00007h bit 7 — EXTENDED_RECEIVER_CAP — DP 1.3 定義" |
| **PDF 查證** | DP v1.2 (`dp12.txt`) 00007h bit 7 = `OUI_SUPPORT`（已存在於 DP v1.2）；`EXTENDED_RECEIVER_CAPABILITY_FIELD_PRESENT` 實際位於 **0000Eh bit 7**（DP v1.3 `dp13.txt` line 14517 確認） |
| **正確內容** | EXTENDED_RECEIVER_CAP 在 **0000Eh** bit 7，非 00007h；00007h bit 7 自 DP v1.2 即為 OUI_SUPPORT |
| **嚴重程度** | 高 — 位址完全錯誤，若照此修改 META 會標記錯誤的暫存器 |

### 錯誤 3：02210h DPRX_FEATURE_ENUMERATION_LIST 版本標註

| 項目 | 內容 |
|------|------|
| **報告宣稱** | Part 5 第179行："DP 1.4a 新增"（已在 META 中） |
| **PDF 查證** | DP v1.3 (`dp13.txt`) line 17488 已定義 02210h，含 bits 0 (GTC_CAP)、2 (AV_SYNC_CAP)、3 (VSC_SDP_EXTENSION) |
| **正確版本** | **DP 1.3+**（非 DP 1.4a） |
| **嚴重程度** | 低 — 報告備註 "已在 META 中"，此條主要影響歷史敘述而非 code 修改建議 |

### 錯誤 4：0200Fh 位址筆誤

| 項目 | 內容 |
|------|------|
| **報告宣稱** | Part 2B 列出 "0200Fh DSC_STATUS" 為 eDP 1.4+ 遺漏暫存器 |
| **PDF 查證** | eDP v1.4b (`edp14b.txt`) 及 eDP v1.5 中，DSC Status 暫存器地址為 **0020Fh**（非 0200Fh）。0200Fh 在所有 PDF 中未出現 |
| **正確地址** | **0020Fh** |
| **嚴重程度** | 高 — 位址錯誤會導致 META 中登記不存在的暫存器；Part 7 第290行的建議也繼承此錯誤 |

### 錯誤 5：00170h bit 6 (Enable PSR2 Protocol) 版本標註

| 項目 | 內容 |
|------|------|
| **報告宣稱** | Part 3 第120行：bit 6 = "eDP 1.4+"；Part 7 第251行建議 `edp14` |
| **PDF 查證** | eDP v1.4b (`edp14b.txt`) line 3918: "New to eDP v1.4a for PSR2 support" |
| **正確版本** | **eDP 1.4a+**（非 eDP 1.4+） |
| **嚴重程度** | 中 — eDP 1.4 與 1.4a 差一個子版本，對精確追蹤有影響 |

### 錯誤 6：Part 7 第233行 TPS4 bit 建議代碼

| 項目 | 內容 |
|------|------|
| **報告宣稱** | `"00003":{bits:{"7":{v:"dp14a",l:"DP 1.4+"}}}` |
| **正確代碼** | 應為 `"00003":{bits:{"7":{v:"dp13",l:"DP 1.3+"}}}` |
| **說明** | 此為錯誤 1 在 code 建議中的延伸 |

---

## 各部分逐筆核對紀錄

### 第一部分：版本標註錯誤（9 筆）— 全部正確

| # | 報告宣稱 | PDF 查證 | 結果 |
|---|---------|---------|------|
| 1 | 00010h-0001Fh 從 eDP 1.3+ 改 eDP 1.4+ | eDP v1.3 無此區段；eDP v1.4b 標 "New to eDP v1.4" | ✅ 正確 |
| 2 | 0002Eh 從 eDP 1.3+ 改 eDP 1.4+ | eDP v1.3 無此位址；eDP v1.4b 標 "New to eDP v1.4" | ✅ 正確 |
| 3 | 0002Fh 從 eDP 1.3+ 改 eDP 1.4+ | eDP v1.3 無此位址；eDP v1.4b 標 "New to eDP v1.4" | ✅ 正確 |
| 4 | 00115h 從 eDP 1.3+ 改 eDP 1.4+ | eDP v1.3 無此位址；eDP v1.4b 標 "New to eDP v1.4" | ✅ 正確 |
| 5 | 00116h 從 eDP 1.3+ 改 eDP 1.4+ | eDP v1.3 無此位址；eDP v1.4b 標 "New to eDP v1.4" | ✅ 正確 |
| 6 | 00117h 從 eDP 1.3+ 改 eDP 1.4+ | eDP v1.3 無此位址；eDP v1.4b 標 "New to eDP v1.4" | ✅ 正確 |
| 7 | 0200Bh 從 eDP 1.3+ 改 eDP 1.4+ | eDP v1.3 無此位址；eDP v1.4b 標 "New to eDP v1.4" | ✅ 正確 |
| 8 | 02008h 從 eDP 1.4b+ 改 eDP 1.3+ | eDP v1.3 line 3379 已定義 PSR_STATUS | ✅ 正確 |
| 9 | 00740h-0074Fh 從 eDP 1.2+ 改 eDP 1.4+ | eDP v1.2/v1.3 無此區段；eDP v1.4b 標 "New to eDP v1.4" | ✅ 正確 |

### 第二部分：完全遺漏暫存器 — 1 筆位址錯誤

| 子部分 | 項目數 | 結果 |
|--------|--------|------|
| 2A: eDP 1.3 遺漏（00070h, 00071h, 00170h, 02008h, 02009h, 0200Ah） | 6 | ✅ 全部正確 |
| 2B: eDP 1.4 遺漏（0015Ch-0015Fh, 00704h, 0200Fh, 0020Ch） | 7 | ❌ 0200Fh 應為 0020Fh（見錯誤 4） |
| 2C: eDP 1.4b 遺漏（02010h, 02011h, 02012h） | 3 | ✅ 全部正確 |
| 2D: eDP 1.5 遺漏（000B0h-000B6h, 001B0h-001BAh, 0011Ah-0011Bh, 02013h-02025h, 02201h, 02207h, 02214h, 02218h） | ~18 | ✅ 全部正確 |

### 第三部分：bit-level 差異 — 2 筆錯誤

| 暫存器 | 報告宣稱 | PDF 查證 | 結果 |
|--------|---------|---------|------|
| 00070h PSR_VERSION values | 02=eDP1.4(PSR2), 03=eDP1.4a, 04=eDP1.5 | eDP v1.4b/v1.5 確認 | ✅ |
| 00071h bits 4,5,6 | 4=eDP1.4a, 5=eDP1.4b, 6=eDP1.5 | PDF 確認各 bit 新增版本 | ✅ |
| 00170h bit 4,5 | eDP 1.4+ | eDP v1.4b 標 "New to eDP v1.4" | ✅ |
| 00170h bit 6 | eDP 1.4+ | eDP v1.4b 標 "New to eDP v1.4a" | ❌ 應為 eDP 1.4a+（見錯誤 5） |
| 00170h bit 7 | eDP 1.5+ | eDP v1.5 確認 | ✅ |
| 0200Ah bits 3-6 | 3-5=eDP1.4, 6=eDP1.4a | eDP v1.4b 確認各 bit | ✅ |
| 0200Bh bit 0 | eDP 1.4+ | eDP v1.4b 標 "New to eDP v1.4" | ✅ |
| 0200Bh bits 1,2 | eDP 1.5+ | eDP v1.5 新增 | ✅ |
| 02006h bit 2 | eDP 1.4+ | eDP v1.4b 標 "New to eDP v1.4" | ✅ |
| 00703h bits 2:1 | eDP 1.5+ | eDP v1.5 through eDP v1.4b SCR | ✅ |
| 00721h bits 5,6 | eDP 1.4+ | eDP v1.4b 標 "New to eDP v1.4" | ✅ |
| 0000Dh bit 0 ASSR | eDP 1.1+ | eDP v1.2 已存在，v1.1 無 PDF 可驗 | ⚠️ 無法驗證（可能正確） |
| 0000Dh bit 3 | eDP 1.2+ | eDP v1.2 確認 | ✅ |
| 0002Eh bit 0 | eDP 1.4+ | eDP v1.4b 標 "New to eDP v1.4" | ✅ |
| 0002Eh bit 1 | eDP 1.4a+ | eDP v1.4b 標 "New to eDP v1.4a" | ✅ |
| 0002Eh bit 2 | eDP 1.5+ | eDP v1.5 新增 | ✅ |
| 00116h bits 2,3 | eDP 1.5+ | eDP v1.4b 為 RESERVED；eDP v1.5 新增 | ✅ |
| 000B0h bit 2 | eDP 1.5+ | eDP v1.5 標 "New to eDP v1.5" | ✅ |
| 000B1h bit 6 | eDP 1.5+ | eDP v1.5 through eDP v1.4b SCR | ✅ |
| 00065h values | eDP 1.4b+ 新增 11/12/13-bit | eDP v1.5 revision history 提到修正此暫存器 | ✅ |
| 00068h bits 6:5, 7 | eDP 1.5+ | DP v1.4a 為 RESERVED；eDP v1.5 新增 | ✅ |
| 00160h bit 1 | eDP 1.5+ | eDP v1.5 新增 DSC Passthrough | ✅ |

### 第四部分：區域背光暫存器 — 全部正確

| 項目 | 報告宣稱 | PDF 查證 | 結果 |
|------|---------|---------|------|
| 00700h-00733h | eDP 1.2+ | eDP v1.2 已定義 | ✅ |
| 00704h | eDP 1.4+ | eDP v1.4b 標 "New to eDP v1.4" | ✅ |
| 00740h-0074Fh | 應改 eDP 1.4+ | eDP v1.4b 標 "New to eDP v1.4" | ✅ |
| 00750h-00751h | eDP 1.5+ | eDP v1.5 through eDP v1.4b SCR | ✅ |

### 第五部分：DP 版本差異 — 3 筆錯誤

| 項目 | 報告宣稱 | PDF 查證 | 結果 |
|------|---------|---------|------|
| 00004h-00005h | DP 1.3 擴展 NORP | DP v1.3 新增 DP_PWR bits | ✅ 大致正確 |
| 00007h bit 7 | EXTENDED_RECEIVER_CAP DP 1.3 | 實際在 0000Eh bit 7 | ❌ 錯誤（見錯誤 2） |
| 00023h-0002Dh | DP 1.3 更新 | DP v1.3 確認 | ✅ |
| 02200h-02202h | DP 1.3 新增 | DP v1.3 確認 | ✅ |
| 00003h bit 7 | DP 1.4 新增 TPS4 | DP v1.3 已有 | ❌ 應為 DP 1.3+（見錯誤 1） |
| 00060h-0006Ch | DP 1.4a 新增 DSC | DP v1.4a 確認 | ✅ |
| 00090h | DP 1.4a 新增 FEC | DP v1.3 為 RESERVED，v1.4a 定義 | ✅ |
| 00120h | DP 1.4a FEC_CONFIG | DP v1.4a 確認（取代 FAUX） | ✅ |
| 00280h-00282h | DP 1.4a FEC 相關 | DP v1.4a 確認 | ✅ |
| 02210h | DP 1.4a 新增 | DP v1.3 已有 | ❌ 應為 DP 1.3+（見錯誤 3） |

---

## 結論與建議

1. **報告整體品質良好**，92% 的宣稱經逐筆核對為正確。對 eDP 各子版本（1.4 vs 1.4a vs 1.4b vs 1.5）的區分多數精確，顯示作者確實花了大量工夫逐版比對。

2. **6 個錯誤中 2 個為高嚴重度**（位址錯誤：0200Fh→0020Fh、00007h→0000Eh），這類錯誤若直接套用到 META 代碼會產生功能性 bug，建議優先修正。

3. **3 個版本標註錯誤**（TPS4 應為 DP 1.3+、02210h 應為 DP 1.3+、00170h bit 6 應為 eDP 1.4a+）屬於精確度問題，建議在套用 code 修改前先修正。

4. **建議在套用 Part 7 的 code 修改時**，先修正上述 6 項錯誤，其餘建議可直接採用。
