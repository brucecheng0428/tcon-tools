# DPCD 版本仲裁報告（Task C'）

## 概要

- **Task A' 檔案**：`dpcd_version_taskA2.json`
- **Task B' 檔案**：`dpcd_version_taskB2.json`
- **仲裁日期**：2026-05-23
- **最終產出**：`dpcd_version_final.json`（290 筆暫存器）

### 統計

| 項目 | 數量 |
|------|------|
| 版本分歧 | 74 筆 |
| 版本一致但 B 標記 uncertain | 12 筆 |
| 僅存在 A | 1 筆（地址格式問題） |
| 僅存在 B | 2 筆（1 筆地址格式 + 1 筆新增暫存器） |

---

## 分歧分類與仲裁結果

### 類別 1：dp14 vs dp14a（DSC/FEC 區塊，22 筆）

**涉及地址**：0x060-0x06F（DSC）、0x090-0x092（FEC）、0x120（FEC Config）、0x160（DSC Enable）、0x280（FEC Status）

**分歧**：Task A 使用 `dp14`，Task B 使用 `dp14a`

**仲裁結果**：**採 dp14a（Task B 正確）**

**理由**：雙方都同意這些暫存器是 DP 1.4 引入的功能（DSC、FEC）。分歧在於版本代碼格式。根據本次任務定義的統一版本代碼列表，`dp14` 不在允許的代碼中，正確代碼為 `dp14a`（合併 DP 1.4 與 DP 1.4a）。drm_dp.h 標記為 [1.4]，DSC 隨 DP 1.4（2016-03）發布，使用 `dp14a` 代碼是正確的。

---

### 類別 2：vendor_intel vs vendor（Intel 私有暫存器，28 筆）

**涉及地址**：0x310-0x358（Intel Adaptive Sync、HDR TCON、Luminance、Brightness Control 等）

**分歧**：Task A 使用 `vendor_intel`，Task B 使用 `vendor`（且標記 uncertain）

**仲裁結果**：**採 vendor_intel（Task A 正確）**

**理由**：這些暫存器全部位於 Source Device Specific 區塊（0x30C-0x3FF），且均為 Intel i915 驅動程式中定義的 Intel 私有暫存器（Intel Adaptive Sync、eDP HDR TCON Capability、Content Luminance、Nits Brightness Control 等）。使用 `vendor_intel` 比泛用的 `vendor` 更精確且資訊量更大。

---

### 類別 3：vendor_intel vs edp14（0x330，1 筆）

**分歧**：Task A 標記 `vendor_intel`（非標準 ALPM 地址），Task B 標記 `edp14`（ALPM 是 eDP 1.4 功能）

**仲裁結果**：**採 vendor_intel（Task A 正確）**

**理由**：地址 0x330 位於 Source Device Specific 區塊。標準 ALPM 能力暫存器在 0x02E（Receiver ALPM CAP），ALPM 配置在 0x116。0x330 並非 VESA 標準定義的 ALPM 地址，而是 Intel 在 Source Device Specific 空間自定義的 ALPM 電源管理狀態暫存器。

---

### 類別 4：vendor_intel vs edp14a（0x370-0x37B，7 筆）

**涉及地址**：0x370、0x373-0x374、0x378-0x37B

**分歧**：Task A 標記 `vendor_intel`，Task B 標記 `edp14a`（PSR2 Y-coordinate 是 eDP 1.4a）

**仲裁結果**：**採 vendor_intel（Task A 正確）**

**理由**：雖然這些暫存器功能上與 PSR2 相關（VTotal、Pixel Deviation 等），但地址 0x370-0x37B 仍位於 Source Device Specific 區塊（0x30C-0x3FF）。VESA 標準的 PSR2 相關暫存器在 0x070-0x074（Capability）和 0x2006-0x2008（Status/Event），不在 0x370 區域。這些是 Intel 為 PSR2 實作自定義的私有暫存器。

---

### 類別 5：vendor_intel vs edp15（0x3F0，1 筆）

**分歧**：Task A 標記 `vendor_intel`，Task B 標記 `edp15`（Early Transport 是 eDP 1.5 功能）

**仲裁結果**：**採 vendor_intel（Task A 正確）**

**理由**：同上，地址 0x3F0 位於 Source Device Specific 區塊。Early Transport for PSR2 雖然是 eDP 1.5 標準功能，但此地址上的「Early Scanline SDP for PSR2」是 Intel 在 Source 端私有空間的實作，非 VESA 定義的標準地址。

---

### 類別 6：vendor_amd vs vendor（AMD 私有暫存器，9 筆）

**涉及地址**：0x40F-0x417

**分歧**：Task A 使用 `vendor_amd`，Task B 使用 `vendor`（且標記 uncertain）

**仲裁結果**：**採 vendor_amd（Task A 正確）**

**理由**：這些暫存器位於 Sink Device Specific 區塊（0x40C-0x4FF），均為 AMD AUPI（AMD Upstream Panel Info）或 AMD TCON 設定等 AMD 私有暫存器。`vendor_amd` 比泛用的 `vendor` 更精確。

---

### 類別 7：edp13 vs edp14b（0x075，1 筆）

**分歧**：Task A 標記 `edp13`（PSR 區塊保留空間隨 eDP 1.3 分配），Task B 標記 `edp14b`（相鄰 PSR2 SU 粒度暫存器）

**仲裁結果**：**採 edp13（Task A 正確）**

**理由**：PSR 能力區塊 0x070-0x07F 是在 eDP 1.3（2011-02）引入 PSR 時整體分配的。0x070（PSR_SUPPORT）和 0x071（PSR_CAPS）明確為 eDP 1.3。0x075 作為該區塊內的保留空間，隨區塊一起在 eDP 1.3 時就存在了。eDP 1.4b 只是在 0x072-0x074 新增了 PSR2 SU 粒度定義，並未改變 0x075 的分配時間。

---

### 類別 8：dp20 vs edp15（0x02214，1 筆）

**分歧**：Task A 標記 `dp20`（drm_dp.h 標記 "2.0 E11"），Task B 標記 `edp15`（Adaptive Sync SDP 是 eDP 1.5 功能）

**仲裁結果**：**採 dp20（Task A 正確）**

**理由**：drm_dp.h 明確標記 `DP_DPRX_FEATURE_ENUMERATION_LIST_CONT_1 0x2214 /* 2.0 E11 */`。此暫存器地址在 Extended Receiver Capability 區塊，隨 DP 2.0（2019-06）定義。雖然其中包含 Adaptive Sync SDP 相關 bit（與 eDP 1.5 功能對應），但暫存器地址本身首見於 DP 2.0 規格。DP 2.0（2019-06）早於 eDP 1.5（2021-10）。

---

### 類別 9：地址格式問題（1 筆）

Task A 使用 `0x0F0000`（7 位 hex），Task B 使用 `0xF0000`（5 位 hex）。DPCD 地址空間為 20-bit（5 位 hex），統一使用 `0xF0000`。

---

### 類別 10：B 獨有暫存器（1 筆）

**0x00705（EDP_SEGMENTED_BACKLIGHT_CAP）**：Task B 標記 `edp14`（uncertain）。eDP 1.4 確實引入了 regional/segmented backlight 功能，且此地址位於 eDP Capability 區塊（0x700-0x70F），合理納入最終版本，確認為 `edp14`。

---

### 已確認的 uncertain 項目（12 筆）

以下項目雙方版本一致，但 Task B 標記 uncertain。經審查後全部確認：

| 地址 | 名稱 | 確認版本 | 確認理由 |
|------|------|----------|----------|
| 0x730 | 背光控制 | edp14 | eDP 1.4 regional backlight 區塊 |
| 0x731 | 背光控制 | edp14 | 同上 |
| 0x734-0x736 | Nits Brightness | edp14 | drm_dp.h: DP_EDP_PANEL_TARGET_LUMINANCE_VALUE，eDP 1.4 |
| 0x737-0x73B | Smooth Brightness | edp14 | eDP 1.4 smooth brightness transition 功能 |
| 0xDEF | HDR Capability | vendor | 非標準 DPCD 地址，確認為 vendor-specific |
| 0xFEA | HDR Capability | vendor | 非標準 DPCD 地址，確認為 vendor-specific |

---

## 仲裁方法論

1. **版本代碼格式**：嚴格依照允許的代碼列表（dp12, edp12, edp13, edp14, dp13, edp14a, edp14b, dp14a, dp20, edp15, vendor, vendor_intel, vendor_amd）
2. **DPCD 地址空間歸屬**：依據 VESA DP 規格的地址區塊定義判斷暫存器是否為 vendor-specific
   - Source Device Specific：0x30C-0x3FF
   - Sink Device Specific：0x40C-0x4FF
   - Branch Device Specific：0x50C-0x5FF
   - Vendor Specific Field：0xF0000-0xFFFFF
3. **權威來源優先序**：VESA 規格 > Linux drm_dp.h 版本標記 > Intel/AMD 驅動原始碼 > 推測
4. **首見原則**：以暫存器地址首次出現在哪個規格文件為準，而非該地址後來被哪個版本擴充了 bit 定義
