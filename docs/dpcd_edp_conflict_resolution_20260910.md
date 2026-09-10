# DPCD 位元配置衝突裁定報告（6 個位址，正式裁定）

格式沿用 `dpcd_704h_conflict_resolution.md`（2026-05-22，逐 bit 引用權威來源原文裁定）。

報告日期：2026-09-10
狀態：**已裁定。6 個位址全部裁定完成，含「無實質衝突」的兩個。**

> **與 `docs/dpcd_edp_7xx_conflict_resolution.md` 的關係**：那一份（同日稍早，v2.5.2 隨附）記錄的是**發現衝突、但本機查不到逐 bit 依據**的狀態，6 個全部標「待外部佐證」。本份是它的**續篇＝正式裁定**：Bruce 於 2026-09-10 提供了該份「下一步」清單中列名的第一項來源（Linux kernel `include/drm/display/drm_dp.h`）的原文，逐 bit 裁定因此得以完成。那一份的 §4「裁定」表自本份起**失效**，以本份為準；其餘章節（兩邊現況盤點、本機依據盤點）仍然有效。

---

## 1. 背景

`data/dpcd-db.js`（AUX 工具的資料庫）與 `dp-aux-dpcd` skill（`SKILL.md`）對 6 個位址給出**互斥**的位元配置。發現時機：v2.5.1 徹查手寫總結的位元切片錯誤時，比對兩份資料才浮現。

這不是「哪一份比較新」的問題 —— 兩邊的欄位名稱與 bit 位置**根本對不起來**，必有一邊是錯的。這是 FAE 判讀真實 log 的工具，錯一個 bit 的語意比缺一段總結嚴重。

v2.5.1 當時的處置是「不自行選邊」：把讀取位置無依據的子句直接移除（`00107h` 的 MSA 子句、`0010Ah` 的 bit 2 子句），並把 6 個位址列入待裁示清單。v2.5.2 則把 `00701h`／`00720h`／`00721h` 三個落在清單裡的位址從 C 類補值工作中撤出，交付 17 個而非 20 個。**本份裁定完成後，這兩筆保留都可以解除。**

---

## 2. 權威來源原文

**來源**：Linux kernel `include/drm/display/drm_dp.h`。

**為什麼這一份算權威**：本專案 `dpcd_version_final.json` 的 `evidence` 欄位**一律**引用這份標頭檔（290 筆條目皆然），「以 `drm_dp.h` 為依據」在本專案是既有慣例，不是這次才發明的判準。`docs/dpcd_edp_7xx_conflict_resolution.md` §5 的「下一步」清單也把它列為第一順位查證對象。

原文摘錄（由 Bruce 於 2026-09-10 提供）：

```c
#define DP_TRAINING_PATTERN_SET             0x102
# define DP_TRAINING_PATTERN_DISABLE     0
# define DP_TRAINING_PATTERN_1           1
# define DP_TRAINING_PATTERN_2           2
# define DP_TRAINING_PATTERN_2_CDS       3      /* 2.0 E11 */
# define DP_TRAINING_PATTERN_3           3      /* 1.2 */
# define DP_TRAINING_PATTERN_4           7      /* 1.4 */
# define DP_TRAINING_PATTERN_MASK        0x3
# define DP_TRAINING_PATTERN_MASK_1_4    0xf

#define DP_DOWNSPREAD_CTRL                  0x107
# define DP_SPREAD_AMP_0_5                          (1 << 4)
# define DP_FIXED_VTOTAL_AS_SDP_EN_IN_PR_ACTIVE     (1 << 6)
# define DP_MSA_TIMING_PAR_IGNORE_EN                (1 << 7) /* eDP */

#define DP_EDP_CONFIGURATION_SET            0x10a   /* XXX 1.2? */
# define DP_ALTERNATE_SCRAMBLER_RESET_ENABLE        (1 << 0)
# define DP_FRAMING_CHANGE_ENABLE                   (1 << 1)
# define DP_PANEL_SELF_TEST_ENABLE                  (1 << 7)

#define DP_EDP_GENERAL_CAP_1                0x701
# define DP_EDP_TCON_BACKLIGHT_ADJUSTMENT_CAP       (1 << 0)
# define DP_EDP_BACKLIGHT_PIN_ENABLE_CAP            (1 << 1)
# define DP_EDP_BACKLIGHT_AUX_ENABLE_CAP            (1 << 2)
# define DP_EDP_PANEL_SELF_TEST_PIN_ENABLE_CAP      (1 << 3)
# define DP_EDP_PANEL_SELF_TEST_AUX_ENABLE_CAP      (1 << 4)
# define DP_EDP_FRC_ENABLE_CAP                      (1 << 5)
# define DP_EDP_COLOR_ENGINE_CAP                    (1 << 6)
# define DP_EDP_SET_POWER_CAP                       (1 << 7)

#define DP_EDP_BACKLIGHT_ADJUSTMENT_CAP     0x702
# define DP_EDP_BACKLIGHT_BRIGHTNESS_PWM_PIN_CAP    (1 << 0)
# define DP_EDP_BACKLIGHT_BRIGHTNESS_AUX_SET_CAP    (1 << 1)
# define DP_EDP_BACKLIGHT_BRIGHTNESS_BYTE_COUNT     (1 << 2)
# define DP_EDP_BACKLIGHT_AUX_PWM_PRODUCT_CAP       (1 << 3)
# define DP_EDP_BACKLIGHT_FREQ_PWM_PIN_PASSTHRU_CAP (1 << 4)
# define DP_EDP_BACKLIGHT_FREQ_AUX_SET_CAP          (1 << 5)
# define DP_EDP_DYNAMIC_BACKLIGHT_CAP               (1 << 6)
# define DP_EDP_VBLANK_BACKLIGHT_UPDATE_CAP         (1 << 7)

#define DP_EDP_GENERAL_CAP_2                0x703
# define DP_EDP_OVERDRIVE_ENGINE_ENABLED            (1 << 0)
# define DP_EDP_PANEL_LUMINANCE_CONTROL_CAPABLE     (1 << 4)
# define DP_EDP_SMOOTH_BRIGHTNESS_CAPABLE           (1 << 6) /* eDP 2.0 */

#define DP_EDP_GENERAL_CAP_3                0x704    /* eDP 1.4 */
# define DP_EDP_X_REGION_CAP_MASK                   (0xf << 0)
# define DP_EDP_X_REGION_CAP_SHIFT                  0
# define DP_EDP_Y_REGION_CAP_MASK                   (0xf << 4)

#define DP_EDP_DISPLAY_CONTROL_REGISTER     0x720
# define DP_EDP_BACKLIGHT_ENABLE                    (1 << 0)
# define DP_EDP_BLACK_VIDEO_ENABLE                  (1 << 1)
# define DP_EDP_FRC_ENABLE                          (1 << 2)
# define DP_EDP_COLOR_ENGINE_ENABLE                 (1 << 3)
# define DP_EDP_VBLANK_BACKLIGHT_UPDATE_ENABLE      (1 << 7)

#define DP_EDP_BACKLIGHT_MODE_SET_REGISTER  0x721
# define DP_EDP_BACKLIGHT_CONTROL_MODE_MASK         (3 << 0)
# define DP_EDP_BACKLIGHT_CONTROL_MODE_PWM          (0 << 0)
# define DP_EDP_BACKLIGHT_CONTROL_MODE_PRESET       (1 << 0)
# define DP_EDP_BACKLIGHT_CONTROL_MODE_DPCD         (2 << 0)
# define DP_EDP_BACKLIGHT_CONTROL_MODE_PRODUCT      (3 << 0)
# define DP_EDP_BACKLIGHT_FREQ_PWM_PIN_PASSTHRU_ENABLE (1 << 2)
# define DP_EDP_BACKLIGHT_FREQ_AUX_SET_ENABLE       (1 << 3)
# define DP_EDP_DYNAMIC_BACKLIGHT_ENABLE            (1 << 4)
# define DP_EDP_REGIONAL_BACKLIGHT_ENABLE           (1 << 5)
# define DP_EDP_UPDATE_REGION_BRIGHTNESS            (1 << 6) /* eDP 1.4 */
# define DP_EDP_PANEL_LUMINANCE_CONTROL_ENABLE      (1 << 7)
```

---

## 3. 逐位址裁定

### 3.1 `00701h` EDP_GENERAL_CAPABILITY_1 — **本庫正確，skill 錯**

| bit | `data/dpcd-db.js` | `dp-aux-dpcd/SKILL.md` | `drm_dp.h` 巨集 | 裁定 |
|---|---|---|---|---|
| 0 | TCON_BACKLIGHT_ADJUSTMENT_CAPABLE | TCON_BACKLIGHT_ADJUSTMENT_CAP | `DP_EDP_TCON_BACKLIGHT_ADJUSTMENT_CAP (1 << 0)` | 兩邊一致 ✔ |
| 1 | BACKLIGHT_PIN_ENABLE_CAPABLE | BACKLIGHT_AUX_ENABLE_CAP | `DP_EDP_BACKLIGHT_PIN_ENABLE_CAP (1 << 1)` | **本庫正確** |
| 2 | BACKLIGHT_AUX_ENABLE_CAPABLE | PANEL_LUMINANCE_CONTROL_CAP | `DP_EDP_BACKLIGHT_AUX_ENABLE_CAP (1 << 2)` | **本庫正確** |
| 3 | PANEL_SELF_TEST_PIN_ENABLE_CAPABLE | PANEL_SELF_TEST_CAP | `DP_EDP_PANEL_SELF_TEST_PIN_ENABLE_CAP (1 << 3)` | **本庫正確**（skill 少了 PIN／AUX 的區分） |
| 4 | PANEL_SELF_TEST_AUX_ENABLE_CAPABLE | DYNAMIC_BACKLIGHT_CONTROL_CAP | `DP_EDP_PANEL_SELF_TEST_AUX_ENABLE_CAP (1 << 4)` | **本庫正確** |
| 5 | FRC_ENABLE_CAPABLE | EDP_OVERDRIVE_ENGINE_ENABLED | `DP_EDP_FRC_ENABLE_CAP (1 << 5)` | **本庫正確** |
| 6 | COLOR_ENGINE_CAPABLE | PANEL_IDLE_ACTIVE_FRAME_LOCK_CAP | `DP_EDP_COLOR_ENGINE_CAP (1 << 6)` | **本庫正確** |
| 7 | SET_POWER_CAPABLE | （未列） | `DP_EDP_SET_POWER_CAP (1 << 7)` | **本庫正確** |

**skill 那幾個名稱去了哪裡**（不是憑空捏造，是**放錯位址**）：

- `PANEL_LUMINANCE_CONTROL_CAP` 真正的位置是 **`00703h` bit 4**（`DP_EDP_PANEL_LUMINANCE_CONTROL_CAPABLE (1 << 4)`），不是 `00701h` bit 2。
- `EDP_OVERDRIVE_ENGINE_ENABLED` 真正的位置是 **`00703h` bit 0**（`DP_EDP_OVERDRIVE_ENGINE_ENABLED (1 << 0)`），不是 `00701h` bit 5。
- `DYNAMIC_BACKLIGHT_*_CAP` 真正的位置是 **`00702h` bit 6**（`DP_EDP_DYNAMIC_BACKLIGHT_CAP (1 << 6)`），不是 `00701h` bit 4。

也就是說 skill 的 `00701h` 是把 `00702h`／`00703h` 的欄位混進來了。

**處置**：`data/dpcd-db.js` 不動（本來就對）；`SKILL.md` 的 `0x00701` 表格全表改寫成上表，每列附 `drm_dp.h` 巨集名。`00701h` 的 8 個 `v` 值對照（v2.5.2 撤回的那批）於 v2.5.4 補回。

---

### 3.2 `00721h` EDP_BACKLIGHT_MODE_SET — **本庫正確，skill 錯**

| bit | `data/dpcd-db.js` | `dp-aux-dpcd/SKILL.md` | `drm_dp.h` 巨集 | 裁定 |
|---|---|---|---|---|
| 1:0 = 00 | 由 BL_PWM_DIM pin 控制 | 由面板韌體自行控制 | `DP_EDP_BACKLIGHT_CONTROL_MODE_PWM (0 << 0)` | **本庫正確**（PWM ＝ pin） |
| 1:0 = 01 | 面板預設亮度等級 | 由 AUX 通道設定 | `DP_EDP_BACKLIGHT_CONTROL_MODE_PRESET (1 << 0)` | **本庫正確**（PRESET ＝ 預設等級） |
| 1:0 = 10 | 由 AUX 暫存器控制（00722h/00723h） | 由外部 PWM 訊號控制 | `DP_EDP_BACKLIGHT_CONTROL_MODE_DPCD (2 << 0)` | **本庫正確**（DPCD ＝ AUX 暫存器） |
| 1:0 = 11 | PWM × AUX 乘積模式 | 保留 | `DP_EDP_BACKLIGHT_CONTROL_MODE_PRODUCT (3 << 0)` | **本庫正確**（PRODUCT ＝ 乘積） |
| 2 | BACKLIGHT_FREQ_PWM_PIN_PASSTHRU_ENABLE | AMBIENT_LIGHT_SENSOR_ENABLE | `DP_EDP_BACKLIGHT_FREQ_PWM_PIN_PASSTHRU_ENABLE (1 << 2)` | **本庫正確** |
| 3 | BACKLIGHT_FREQ_AUX_SET_ENABLE | BACKLIGHT_PWM_FREQ_PRESET_SELECT | `DP_EDP_BACKLIGHT_FREQ_AUX_SET_ENABLE (1 << 3)` | **本庫正確** |
| 4 | DYNAMIC_BACKLIGHT_ENABLE | DYNAMIC_BACKLIGHT_FINER_CONTROL | `DP_EDP_DYNAMIC_BACKLIGHT_ENABLE (1 << 4)` | **本庫正確** |
| 5 | REGIONAL_BACKLIGHT_ENABLE | （未列） | `DP_EDP_REGIONAL_BACKLIGHT_ENABLE (1 << 5)` | **本庫正確** |
| 6 | UPDATE_REGION_BRIGHTNESS | REGIONAL_BACKLIGHT_ENABLE | `DP_EDP_UPDATE_REGION_BRIGHTNESS (1 << 6)` | **本庫正確** |
| 7 | RESERVED | （未列） | `DP_EDP_PANEL_LUMINANCE_CONTROL_ENABLE (1 << 7)` | 兩邊都漏，見 §5.2 |

🔴 **這一條對 FAE 影響最直接**：skill 說「01 = AUX 控制，大多數筆電用模式 01」，而 kernel 明寫 `MODE_PRESET (1 << 0)`、`MODE_DPCD (2 << 0)` —— **AUX（DPCD）控制是 `10`，不是 `01`**。照 skill 判讀真實 log 會把「面板預設亮度」誤讀成「OS 正在用 AUX 調亮度」，方向完全相反。

**旁證**（本機、非本次外部來源）：`DPCD_VERSION_DIFF_ARBITRATION.md` 第 171～173 行逐條引用 **eDP v1.4b p235**，裁定 bit5 = Regional Backlight、bit6 = Update Region Brightness ⇒ 與 `drm_dp.h` 完全一致，也與本庫一致。兩個獨立來源同向，`00721h` 的裁定強度高於其他五個。

**處置**：`data/dpcd-db.js` 不動；`SKILL.md` 的 `0x00721` 表格全表改寫。`00721h` 的 6 個 `v` 值對照於 v2.5.4 補回。

---

### 3.3 `00107h` DOWNSPREAD_CTRL — **本庫正確，skill 錯**

| bit | `data/dpcd-db.js` | `dp-aux-dpcd/SKILL.md` | `drm_dp.h` 巨集 | 裁定 |
|---|---|---|---|---|
| 3:0 | RESERVED | SPREAD_AMP（0x1 = SSC on） | （無定義） | **本庫正確** |
| 4 | SPREAD_AMP | RESERVED | `DP_SPREAD_AMP_0_5 (1 << 4)` | **本庫正確** |
| 5 | RESERVED | MSA_TIMING_PAR_IGNORE_EN | （無定義） | **本庫正確** |
| 6 | ADAPTIVE_SYNC_SDP_EN（eDP 1.5+） | RESERVED | `DP_FIXED_VTOTAL_AS_SDP_EN_IN_PR_ACTIVE (1 << 6)` | 本庫方向正確，名稱另見 §5.3 |
| 7 | MSA_TIMING_PAR_IGNORE_EN | RESERVED | `DP_MSA_TIMING_PAR_IGNORE_EN (1 << 7) /* eDP */` | **本庫正確** |

**處置**：

1. `data/dpcd-db.js` 不動。
2. `SKILL.md` 的 `0x00107` 表格全表改寫。
3. `aux.html` 的 `00107h` 手寫總結**兩處**都要改（v2.5.4）：
   - **MSA 子句依 bit 7 補回**。v2.5.1 移除它是因為當時兩來源互斥、無從判定（本庫說 bit 7、skill 說 bit 5），依規矩不選邊；現在有依據了，補回。
   - 🔴 **SSC 改讀 bit 4**。舊版讀的是 **bit 0**（`v & 1`），那是照 skill 的「`[3:0]` SPREAD_AMP、0x1 = SSC on」寫的。本庫與 `drm_dp.h` 都說 SSC 在 bit 4 ⇒ 舊版讀錯位置。**這是 v2.5.1 那一輪漏掉的同型錯**：當時只處理了 MSA 子句，沒有回頭檢查同一支函式裡的 SSC 子句。

---

### 3.4 `0010Ah` eDP_CONFIGURATION_SET — **bit 2 兩邊一致，v2.5.1 的移除正確**

| bit | `data/dpcd-db.js` | `dp-aux-dpcd/SKILL.md` | `drm_dp.h` 巨集 | 裁定 |
|---|---|---|---|---|
| 0 | ALTERNATE_SCRAMBLER_RESET_ENABLE | ALTERNATE_SCRAMBLER_RESET_ENABLE | `DP_ALTERNATE_SCRAMBLER_RESET_ENABLE (1 << 0)` | 兩邊一致 ✔ |
| 1 | RESERVED | FRAMING_CHANGE_ENABLE | `DP_FRAMING_CHANGE_ENABLE (1 << 1)` | **skill 正確**，見 §5.1 |
| 2 | RESERVED | RESERVED | （無定義） | **兩邊一致 ✔ ⇒ v2.5.1 移除該子句正確** |
| 3 | RESERVED | PANEL_SELF_TEST_ENABLE | （無定義） | **本庫正確** |
| 7 | PANEL_SELF_TEST_ENABLE | RESERVED | `DP_PANEL_SELF_TEST_ENABLE (1 << 7)` | **本庫正確** |

**針對本次裁定範圍（bit 2）的結論**：`drm_dp.h` 在 `0x10a` 底下只定義 bit 0／bit 1／bit 7，**bit 2 確實沒有任何定義** ⇒ 兩邊都標 RESERVED 是對的 ⇒ **v2.5.1 移除「EDID 暫存器模式」那個讀 bit 2 的子句，處置正確**，無須回補。

**bit 1 是本次裁定衍生出來的新發現**，見 §5.1；本批**未動**。

---

### 3.5 `00720h` EDP_DISPLAY_CONTROL — **本庫正確，skill 錯（原列為衝突，實為 skill 單方面錯）**

| bit | `data/dpcd-db.js` | `dp-aux-dpcd/SKILL.md` | `drm_dp.h` 巨集 | 裁定 |
|---|---|---|---|---|
| 0 | BACKLIGHT_ENABLE | BACKLIGHT_ENABLE | `DP_EDP_BACKLIGHT_ENABLE (1 << 0)` | 兩邊一致 ✔ |
| 1 | BLACK_VIDEO_ENABLE | BLACK_FRAME_INSERT | `DP_EDP_BLACK_VIDEO_ENABLE (1 << 1)` | **本庫正確** |
| 2 | FRC_ENABLE | PANEL_SELF_TEST_ENABLE | `DP_EDP_FRC_ENABLE (1 << 2)` | **本庫正確** |
| 3 | COLOR_ENGINE_ENABLE | OVERDRIVE_ENABLE | `DP_EDP_COLOR_ENGINE_ENABLE (1 << 3)` | **本庫正確** |
| 6:4 | RESERVED | bit4 DYNAMIC_BACKLIGHT_ENABLE | （無定義） | **本庫正確**（DYNAMIC_BACKLIGHT_ENABLE 真正在 `00721h` bit 4） |
| 7 | VBLANK_BACKLIGHT_UPDATE_ENABLE | （未列） | `DP_EDP_VBLANK_BACKLIGHT_UPDATE_ENABLE (1 << 7)` | **本庫正確** |

> 本位址在 v2.5.1 的待裁示表裡列為「衝突」，實際上是 **skill 單方面錯**，本庫與 `drm_dp.h` 逐 bit 相同、無一處出入。

**處置**：`data/dpcd-db.js` 不動。`SKILL.md` 的 `0x00720` 條目**本批未改**（Bruce 本次指定要修的是 `00701h`／`00721h`／`00107h` 三個），列入下一批。`00720h` 的 5 個 `v` 值對照於 v2.5.4 補回。

---

### 3.6 `00102h` TRAINING_PATTERN_SET — **無實質衝突**

| 項目 | `data/dpcd-db.js` | `drm_dp.h` | 裁定 |
|---|---|---|---|
| 欄位寬度 | `[3:0]` TRAINING_PATTERN_SELECT | `DP_TRAINING_PATTERN_MASK_1_4 0xf`（DP 1.4）／`DP_TRAINING_PATTERN_MASK 0x3`（1.4 之前） | **一致** — 本庫取 DP 1.4 的 4-bit 版本，欄位名亦註明「DP v1.4a: 4-bit field」 |
| 0x0 | Training 關閉 | `DP_TRAINING_PATTERN_DISABLE 0` | 一致 ✔ |
| 0x1 | TPS1（Clock Recovery） | `DP_TRAINING_PATTERN_1 1` | 一致 ✔ |
| 0x2 | TPS2（Channel EQ） | `DP_TRAINING_PATTERN_2 2` | 一致 ✔ |
| 0x3 | TPS3（HBR2 EQ，DP 1.2+） | `DP_TRAINING_PATTERN_3 3 /* 1.2 */` | 一致 ✔ |
| 0x7 | TPS4（HBR3 EQ，DP 1.4） | `DP_TRAINING_PATTERN_4 7 /* 1.4 */` | 一致 ✔ |

skill 的「`[1:0]` TRAINING_PATTERN_SELECT ＋ `[3:2]` LINK_QUAL_PATTERN_EN」對應的是 **DP 1.1／1.2 時代的舊配置**（`DP_TRAINING_PATTERN_MASK 0x3`），在 DP 1.4 下欄位已擴成 4-bit（`..._MASK_1_4 0xf`）才容得下 TPS4 = 7。兩者不是互斥，是**版本差異**。

**處置**：兩邊都不必改（本庫已標明是 4-bit 版本）。`SKILL.md` 若日後要補，應改為註明「DP 1.2 以前 `[1:0]`、DP 1.4 起 `[3:0]`」而不是二選一。**本批未動 skill 的這一條。**

> ⚠ 但 `aux.html` 的 `00102h` 手寫總結另有問題，見 §5.4。

---

## 4. 裁定彙總

| 位址 | 裁定 | `data/dpcd-db.js` | `SKILL.md` | `aux.html` |
|---|---|---|---|---|
| `00701h` | **本庫正確，skill 錯** | 不動（補 8 個 `v`） | **本批改寫** | — |
| `00721h` | **本庫正確，skill 錯** | 不動（補 6 個 `v`） | **本批改寫** | — |
| `00107h` | **本庫正確，skill 錯** | 不動 | **本批改寫** | **本批改**：MSA 依 bit 7 補回、SSC 改讀 bit 4 |
| `0010Ah` | bit 2 兩邊一致（RESERVED） | 不動 | 本批未動（bit 1 見 §5.1） | 不動（v2.5.1 的移除正確） |
| `00720h` | **本庫正確，skill 錯** | 不動（補 5 個 `v`） | 本批未動，列下一批 | — |
| `00102h` | 無實質衝突（版本差異） | 不動 | 本批未動 | 另有問題，見 §5.4 |

---

## 5. 裁定衍生發現（本批**未**處理，列清單待裁示）

這五條都是比對 `drm_dp.h` 原文時順帶浮現的，**不在 Bruce 本次指定的處置範圍內，一律未動資料**。列出來是為了不遺忘，也避免下次重查。

### 5.1 `0010Ah` bit 1：本庫標 RESERVED，但 kernel 有定義

`DP_FRAMING_CHANGE_ENABLE (1 << 1)` ⇒ **skill 正確、本庫漏列**。方向與其他五個相反（其餘都是本庫對）。

🔴 而且 `aux.html` 的 `0010Ah` 手寫總結**已經在讀 bit 1 並輸出「Framing Change」**（v2.5.1 保留的既有行為）—— 也就是**總結與本庫自己的位元表互相矛盾**，總結那一側是對的。

未處理的理由：Bruce 本次的裁定句是「六個全部以 `data/dpcd-db.js` 為準，要修的是 skill」，改本庫的 `b[]` 與該句相反。**需要 Bruce 明示是否更正本庫的 `b[]`。**

### 5.2 `00721h` bit 7：兩邊都標 RESERVED／未列，但 kernel 有定義

`DP_EDP_PANEL_LUMINANCE_CONTROL_ENABLE (1 << 7)`。本庫標 RESERVED、skill 未列 ⇒ **兩邊都不完整**（不是衝突）。與 §5.4 的 `00703h` bit 4 是同一個功能的 CAP／ENABLE 配對。

### 5.3 `00107h` bit 6：本庫的名稱與 kernel 不同

本庫：`ADAPTIVE_SYNC_SDP_EN`（eDP 1.5+）；kernel：`DP_FIXED_VTOTAL_AS_SDP_EN_IN_PR_ACTIVE`。

兩者都是「Adaptive-Sync SDP」相關，但 kernel 的名稱明確限定在 **Panel Replay Active 期間、固定 VTotal** 這個情境，語意窄得多。**位置一致（bit 6），名稱與適用範圍存疑，未動。**

### 5.4 `00703h` 只定義 bit 0，但 kernel 另有 bit 4／bit 6

本庫 `00703h` 的 `b[]` 是「bit 0 OVERDRIVE_ENGINE_ENABLED ＋ bits7:1 RESERVED」，`d` 欄註明「eDP v1.4b 此暫存器只定義 bit 0」。kernel 另有：

- `DP_EDP_PANEL_LUMINANCE_CONTROL_CAPABLE (1 << 4)`
- `DP_EDP_SMOOTH_BRIGHTNESS_CAPABLE (1 << 6) /* eDP 2.0 */`

bit 6 標明是 **eDP 2.0** 才有，本庫寫的是 eDP v1.4b 的內容 ⇒ 這比較像**版本差異**而非錯誤。bit 4 沒有版本註記，需再查。**未動。**

### 5.5 🔴 `aux.html` 的 `00102h` 手寫總結讀 bits 1:0，會把 TPS4 誤判成 TPS3

```js
"00102": function(v) {
  var tp = v & 3, ...          // ← 只取 bits 1:0
  var tpMap = {0:"無（正常傳輸）",1:"TPS1…",2:"TPS2…",3:"TPS3（EQ，HBR2+）"};
```

本庫位元表與 `drm_dp.h` 都說 DP 1.4 下這是 **4-bit** 欄位、TPS4 = 7。輸入 `0x07` 時，`v & 3` = 3 ⇒ 總結輸出「TPS3」，而**同一頁的位元表輸出「TPS4」** —— 與 v2.5.1 修掉的 `00206h` 是完全同型的錯（總結與位元表互相矛盾，位元表是對的）。

未處理的理由：Bruce 本次的裁定表寫 `00102h`「kernel 與本庫一致 ⇒ 無衝突」，處置欄沒有指示改 `aux.html`。**這是獨立於裁定的產品 bug，建議下一批單獨修並標 `⚠ 輸出變更`**（受影響：bit 3 或 bit 2 為 1 的值）。

---

## 6. 處置與驗證

**本批（`aux` v2.5.4）實際動到的東西**：

| 檔案 | 改動 |
|---|---|
| `data/dpcd-db.js` | `00701h` 補 8 個 `v`、`00720h` 補 5 個、`00721h` 補 6 個（v2.5.2 撤回的那 19 個，語意逐字取自各欄位既有的 `d` 說明）；`02002h` SINK_COUNT 補 `u` 單位欄 |
| `aux.html` | `00107h` 手寫總結：MSA 依 bit 7 補回、SSC 改讀 bit 4；cache buster bump |
| `dp-aux-dpcd/SKILL.md` | `0x00701`／`0x00721`／`0x00107` 三個表格改寫，每列附 `drm_dp.h` 巨集名 |
| `docs/` | 本檔；並在 `dpcd_edp_7xx_conflict_resolution.md` 開頭加一行指向本檔 |

**驗證方式**（全程本機、未連網，jsdom 走真正的 `auxLookupDPCD()`）：詳見 `CHANGELOG.md` 的 v2.5.4 條目。

**下次不要再分岔**：`data/dpcd-db.js` 與 `SKILL.md` 對這三個位址各留一行出處（`drm_dp.h` 的巨集名）。日後任一邊要改，先看那一行。

---

報告日期：2026-09-10
裁定依據提供者：Bruce（2026-09-10，Linux kernel `include/drm/display/drm_dp.h` 原文）
