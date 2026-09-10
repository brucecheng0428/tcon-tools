# DPCD 位元配置衝突裁定報告（6 個位址）

格式沿用 `dpcd_704h_conflict_resolution.md`（2026-05-22，逐 bit 引用規格書原文裁定）。

報告日期：2026-09-10
狀態：**尚未裁定，6 個位址全部標為「待外部佐證」。本次未修改任何一邊的資料。**

---

## 1. 背景

`data/dpcd-db.js`（AUX 工具的資料庫）與 `dp-aux-dpcd` skill（`SKILL.md`）對以下 6 個位址給出**互斥**的位元配置。發現時機：v2.5.1 徹查手寫總結的位元切片錯誤時，比對兩份資料才浮現。

這不是「哪一份比較新」的問題 —— 兩邊的欄位名稱與 bit 位置**根本對不起來**，必有一邊是錯的。這是 FAE 判讀真實 log 的工具，錯一個 bit 的語意比缺一段總結嚴重。

---

## 2. 兩邊現況

| 位址 | `data/dpcd-db.js` | `dp-aux-dpcd/SKILL.md` |
|---|---|---|
| `00102h` TRAINING_PATTERN_SET | `[3:0]` TRAINING_PATTERN_SELECT | `[1:0]` TRAINING_PATTERN_SELECT ＋ `[3:2]` LINK_QUAL_PATTERN_EN |
| `00107h` DOWNSPREAD_CTRL | `[3:0]` RESERVED、`[4]` SPREAD_AMP、`[5]` RESERVED、`[6]` ADAPTIVE_SYNC_SDP_EN、`[7]` MSA_TIMING_PAR_IGNORE_EN | `[3:0]` SPREAD_AMP、`[4]` RESERVED、`[5]` MSA_TIMING_PAR_IGNORE_EN、`[7:6]` RESERVED |
| `0010Ah` eDP_CONFIGURATION_SET | `[0]` ALTERNATE_SCRAMBLER_RESET_ENABLE、`[1]` RESERVED、`[6:2]` RESERVED、`[7]` PANEL_SELF_TEST_ENABLE | `[0]` ALTERNATE_SCRAMBLER_RESET_ENABLE、`[1]` FRAMING_CHANGE_ENABLE、`[2]` RESERVED、`[3]` PANEL_SELF_TEST_ENABLE、`[7:4]` RESERVED |
| `00701h` EDP_GENERAL_CAPABILITY_1 | bit1 BACKLIGHT_PIN_ENABLE_CAPABLE、bit2 BACKLIGHT_AUX_ENABLE_CAPABLE、bit3/4 PANEL_SELF_TEST_*_CAPABLE、bit5 FRC_ENABLE_CAPABLE、bit6 COLOR_ENGINE_CAPABLE、bit7 SET_POWER_CAPABLE | bit1 BACKLIGHT_AUX_ENABLE_CAP、bit2 PANEL_LUMINANCE_CONTROL_CAP、bit3 PANEL_SELF_TEST_CAP、bit4 DYNAMIC_BACKLIGHT_CONTROL_CAP、bit5 EDP_OVERDRIVE_ENGINE_ENABLED、bit6 PANEL_IDLE_ACTIVE_FRAME_LOCK_CAP |
| `00720h` EDP_DISPLAY_CONTROL | bit1 BLACK_VIDEO_ENABLE、bit2 FRC_ENABLE、bit3 COLOR_ENGINE_ENABLE、bit7 VBLANK_BACKLIGHT_UPDATE_ENABLE | bit1 BLACK_FRAME_INSERT、bit2 PANEL_SELF_TEST_ENABLE、bit3 OVERDRIVE_ENABLE、bit4 DYNAMIC_BACKLIGHT_ENABLE |
| `00721h` EDP_BACKLIGHT_MODE_SET | bits1:0：00 = BL_PWM_DIM pin／01 = 面板預設亮度／10 = AUX（00722h/00723h）／11 = PWM × AUX 乘積；bit5 REGIONAL_BACKLIGHT_ENABLE、bit6 UPDATE_REGION_BRIGHTNESS | bits1:0：00 = 面板韌體／01 = AUX／10 = 外部 PWM／11 = 保留；bit2 AMBIENT_LIGHT_SENSOR_ENABLE、bit6 REGIONAL_BACKLIGHT_ENABLE |

---

## 3. 本機（不連網）可取得的依據

### 3.1 `DPCD_VERSION_DIFF_ARBITRATION.md`（repo 內，2026-05 仲裁報告）

第 171～173 行，逐條引用 **eDP 規格書頁碼**：

```
| 31 | 00721h | bits 0-4 (基礎模式)   | eDP 1.2+ | eDP v1.2 第 24 頁 00721h 已定義 bits 0-4       | ✅ 正確 |
| 32 | 00721h | bit 5 (Regional BL)   | eDP 1.4+ | eDP v1.4b 第 235 頁 "New to eDP v1.4"        | ✅ 正確 |
| 33 | 00721h | bit 6 (Update Region) | eDP 1.4+ | eDP v1.4b 第 235 頁 "New to eDP v1.4"        | ✅ 正確 |
```

**這一條支持 `data/dpcd-db.js`**：`00721h` bit5 = Regional Backlight、bit6 = Update Region Brightness，與 dpcd-db.js 一致；skill 把 Regional 放在 bit6、且完全沒有 Update Region。

⚠ 但它只裁定了 `00721h` 的 bit5／bit6，**沒有涵蓋 bits1:0 的模式值**，也沒有涵蓋其餘 5 個位址。

### 3.2 `dpcd_version_final.json`（repo 內，290 筆定版）

6 個位址都有條目，但 `evidence` 欄位只寫「該暫存器是哪一版引入的」，**不含逐 bit 定義**。例：

```json
"00721": {"name": "EDP_BACKLIGHT_MODE_SET", "first_ver": "edp12",
          "evidence": "drm_dp.h: DP_EDP_BACKLIGHT_MODE_SET_REGISTER 0x721，含 eDP 1.4 bits"}
```

**可注意的一點**：本專案先前的仲裁工作，`evidence` 欄一律引用 **Linux kernel DRM 的 `drm_dp.h`** 作為權威來源之一。也就是說「以 drm_dp.h 為依據」在本專案是既有慣例，不是這次才發明的。

### 3.3 `dpcd_registers_dp_v1_2.json`

188 筆，**這 6 個位址一筆都沒有**（該檔只涵蓋 DP v1.2 的一部分）。

### 3.4 `dpcd_704h_conflict_resolution.md`

同型工作的範本，處理的是 `00704h`，**不涵蓋這 6 個**。其結論（X_REGION = 水平、Y_REGION = 垂直）與現行 `dpcd-db.js` 一致。

---

## 4. 裁定

| 位址 | 本機依據 | 裁定 | 處置 |
|---|---|---|---|
| `00102h` | 無逐 bit 依據 | **未裁定** | 🔴 待外部佐證，兩邊資料維持原狀 |
| `00107h` | 無逐 bit 依據 | **未裁定** | 🔴 待外部佐證，兩邊資料維持原狀 |
| `0010Ah` | 無逐 bit 依據 | **未裁定** | 🔴 待外部佐證，兩邊資料維持原狀 |
| `00701h` | 無逐 bit 依據 | **未裁定** | 🔴 待外部佐證，兩邊資料維持原狀 |
| `00720h` | 無逐 bit 依據 | **未裁定** | 🔴 待外部佐證，兩邊資料維持原狀 |
| `00721h` | bits 5／6 有（§3.1，eDP v1.4b p235） | **bits 5／6 支持 dpcd-db.js**；bits1:0 的模式值**未裁定** | 🔴 整個位址一併待外部佐證後再改，避免只改一半 |

**本次沒有修改任何一邊的資料。** v2.5.2 的 C 類補值工作**刻意跳過** `00701h`／`00720h`／`00721h` 這三個落在衝突清單裡的位址（原本已寫好的 19 個 `v` 值對照已撤回），交付 17 個而非 20 個。

### 為什麼不先照 §3.1 把 `00721h` 改掉

只有 bits 5／6 有依據，bits1:0 的四個模式值（00/01/10/11 分別代表什麼）沒有 —— 而**那四個值才是 FAE 實際判讀背光模式時會看的東西**。改一半會讓同一個暫存器出現「一部分已裁定、一部分沒有」的狀態，下次接手的人分不出哪一段可信。整個位址一起處理。

---

## 5. 下一步（需要外部來源時再做，由 Bruce 安排時機）

建議查證對象與**要找的具體字串**（列出來是為了下次可以一次查完，不必重新摸索）：

| 來源 | 要找的內容 |
|---|---|
| Linux kernel `include/drm/display/drm_dp.h` | `DP_EDP_GENERAL_CAP_1`(0x701)、`DP_EDP_DISPLAY_CONTROL_REGISTER`(0x720)、`DP_EDP_BACKLIGHT_MODE_SET_REGISTER`(0x721) 及其底下的 `(1 << n)` 定義；`DP_TRAINING_PATTERN_SET`(0x102)、`DP_DOWNSPREAD_CTRL`(0x107)、`DP_EDP_CONFIGURATION_SET`(0x10a) |
| eDP v1.4b 規格書 Table 10-4 | 本專案 `00704h` 那份裁定用的就是這張表（p232）；`00701h`／`00702h`／`00720h`／`00721h` 同表 |
| Coreboot／U-Boot／Chromium EC | 交叉比對，避免單一實作的口味 |

裁定完成後：**兩邊都要改到一致**，並在 `data/dpcd-db.js` 的該位址與 `SKILL.md` 的該條目**各留一行出處**，避免下次又分岔。若裁定導致解碼輸出改變，CHANGELOG 該條目必須標 `⚠ 輸出變更` 並列出受影響的位址與值範圍。

---

## 6. 附記：`00700h` EDP_DPCD_REV 的值對應也可能有問題

不在原本的 6 個之內，但同一輪查證時浮現，一併記錄以免遺忘：

`data/dpcd-db.js` 與 `SKILL.md` **都**寫「01h = eDP v1.1、02h = v1.2、03h = v1.3、04h = v1.4、05h = v1.4b、06h = v1.5」，兩邊一致所以不算衝突 —— 但這串對應**沒有 v1.4a**，而 v1.4a 是實際存在的版本。一個沒有空位的枚舉通常代表整串偏移了一位。

**目前狀態：未裁定，資料維持原狀**（v2.5.0 的 `00700h` 總結就是照現行資料寫的）。需要外部來源確認 `00h` 到底代表什麼。這一條同樣列入下一輪查證清單。
