# EM01 三模 GPO Timing：匯出走 CURRENT ＋ 官方 UI 複製 —— **結案**

日期：2026-08-23
狀態：✅ **已結案，工作流程由 Bruce 於 2026-08-23 裁示採用。**

## 結論（先講）

> **wfg 匯出的 script 一律寫入 CURRENT；要放到 Normal／133%／200%，在 EM01 官方 TCON UI 用複製功能完成後半段。**

Bruce 原話：
> 「現在就是走這個方向。也就是說，匯出的 scraper（口誤，指 script）都只能寫到 current 的那個部分，
> 後面我再用 UI 去把它 copy 到看是 normal、133% 還是 200%，這條路是 OK 的。」

**⇒ wfg 現行的匯出行為本來就是對的，不需要任何行為變更。**
v4.13.3 只做了兩件事：匯出後多一段說明（見 §4），以及把印給人看的位址標明是檔案偏移（見 §2）。

完整流程：

| # | 在哪 | 做什麼 |
|---|---|---|
| 1 | wfg | 匯出 script（內容寫的是 CURRENT 的暫存器位址） |
| 2 | 官方 TCON UI | 載入 script → 值進入 **CURRENT**（校驗值由該工具自動處理） |
| 3 | 官方 TCON UI | `Flash R/W` → `From Current` 複製 |
| 4 | 官方 TCON UI | `Flash R/W` → `Write Normal`／`Write 133%`／`Write 200%` |

（步驟 3、4 的選單名稱取自官方工具的表單資源，**未實機驗證**，證據等級見 §3。）

---

## 1'. 這一題原本怎麼走偏的

原提案（Bruce）：「匯入時偵測到三模，那匯出的時候，是否也可以選擇我要匯出哪一個？……也就是這個 script 也要對應到相對的位置。」

我花了一整輪評估「把 script 的 `write` 位址平移到 slot」，最後是 Bruce 自己看出問題：
> 「Register 的位置應該沒有這麼多，而 Flash 的位置才有這麼多，所以這條路是沒辦法做，因為寫入 script 好像寫不了 Flash，它只能寫 Register。」

他是對的。下一節就是這個錯的完整解剖 —— 留著它，是因為**根因（兩種位址空間重合）還會再出現**。

---

## 1. 🔴 兩種位址空間 —— 這次就是栽在把它們混為一談

| | **register 位址** | **Flash 檔案偏移** |
|---|---|---|
| 是什麼 | 晶片上的暫存器編號 | .bin 檔案裡的第幾個位元組 |
| 範圍 | `0x0000`～**`0xFFFF`**（`bank_offset` 分頁，最高是 `tm` bank 的 `hff00`～`hffff`） | `0`～**`0x3FFFF`**（256 KB Flash） |
| 誰用它 | `write -m` / `write -n` script、Excel register bank | 解析 .bin 的程式 |
| EM01 Flash 的 `0x0500`／`0x0600` | ✅ 是（低位區是平坦映像，兩者數值恰好相同） | ✅ 也是（同一個數字，但**是巧合造成的重合**，不是同義） |
| EM01 EEPROM 的 `0x0457`／`0x0556` | ❌ **不是** | ✅ 只是檔案偏移（對應的 register 位址是 `0x0500`／`0x0600`） |
| mode slot `0x35000 + k×0x300` | ❌ **不是**，而且遠超出 register 空間 | ✅ 只是檔案偏移 |

**為什麼會混淆**：EM01 Flash 低位是平坦映像，`fileOff == regAddr`，於是 `0x0500` 這個數字**同時**是兩者。
一旦習慣了「0x0500 就是那個位置」，再看到 `0x35000`，就會不自覺地把它也當成同一種位址 —— 而它不是。

**後果**：我據此評估了一個**原理上做不到**的方案（把 script 的 `write -m` 位址平移到 slot）。
`0x35000` 是 217,088，register 空間根本沒有這麼大；`write` 也寫不到 Flash。

### 佐證：script 的位址欄位只有 16 bit

從 `TCON_UI/EM01/Raydium_TCON_Tool_RM80100_v0.3.42Beta9.exe` 取出的內建說明與格式字串：

```
=> write -m 0F26 12 FF
=> write -m 0F26 1234 FFFF
=> write -n 0F26 12
=> write -n 0F26 1234
write -n %02X%02X %02X      ← 位址固定兩個位元組
```

`%02X%02X` ＝ 4 位十六進位 ＝ 上限 `0xFFFF`。旁證：EM01 官方 `TCON_UI/EM01/SCRIPT/` 的範例、
`TCON/Model` 底下所有 `.script`、E512 官方 Script 的 335 個 `write` —— **位址全部是 4 位**。
exe 裡也沒有任何 script 層級的 flash 寫入指令（`Flashwrite_trig` 是 UI 內部的暫存器名，不是 script 指令）。

---

## 2. 回頭稽核：我們自己的說法哪裡清楚、哪裡沒標

**程式碼內部：清楚。** `wfg.html` 從 v4.2.0 起就有明文警語（`wfgEm02RegAddrDoc()` 上方）：

> 🔴🔴 **兩個座標系，永遠不可以混用** …… 同一條 xstb，regAddr 是 0x05A0、fileOff 是 0x04E0 —— 差 0x0C0。

`WFG_EM01_LAYOUT` 的 `base1/base2/base3`、`WFG_EM01_MODE_SLOT_BASE` 都註明是 fileOff；
`WFG_GPO_REGMAP_EM01` 的 `0x05A0`／`0x0600`／`0x0583`／`0x0504`／`0x052E` 都註明是 regAddr。**這部分沒有錯。**

**🔴 使用者看得到的地方：只印裸位址，沒有標明是「檔案偏移」。** —— ✅ **已於 v4.13.3 修正**

新增兩個小函式：`wfgCodeOffLabel()`（走 i18n，給畫面用）、
`wfgCodeOffLabelAscii()`（固定英文，給 **.script 檔案內容**用 —— .script 只吃 ASCII，兩者不可互換）。

| 位置 | 改前 | 改後（v4.13.3） |
|---|---|---|
| EM01 匯入卡片 detail | `GPO CURRENT @0x500/0x600` | `GPO CURRENT 檔案偏移 0x500/0x600` |
| Timing 選擇框每一項（`.wfg-ack-where`） | `…　@0x35000` | `…　檔案偏移 0x35000` |
| 匯出 script 的來源註解 | `// source timing: read from 200% @0x35000` | `…read from 200% (file offset 0x35000 in the code file, NOT a register address); …` |
| **EM02** 匯入卡片 detail | `GPO @0x4E0` | `GPO 檔案偏移 0x4E0` |
| **E512** 匯入卡片 detail | `GPO @0x…/0x…` | `GPO 檔案偏移 0x…/0x…` |

後兩處原本不在盤點清單裡，是查證時發現的**同型缺陷**（EM02／E512 的 base 同樣是掃描 buf 得到的
檔案偏移）。只修 EM01 那三處，等於留下兩個一模一樣的地雷，所以一併修掉。

第三處原本最危險：那一行夾在一整串 `write -m 0626 …`（全部是 register 位址）之間，
讀者幾乎不可能不把 `@0x35000` 也當成 register 位址 —— 所以它除了標明偏移，還直接寫上
`NOT a register address`。

---

## 3. ✅ 官方 TCON UI 的 `Flash R/W` 選單（本案採用的後半段）

### 3.1 🔴 證據等級：**我沒有看過 UI**

- ❌ 沒有執行過那支程式（Windows .exe，開發環境是 macOS／Linux）
- ❌ 沒有截圖、沒有說明文件、沒有 Excel 來源
- ✅ 唯一做的事：**對 exe 做二進位字串萃取**，讀出 Delphi 表單資源（DFM）裡的元件定義

⇒ **全部是間接證據。** 但比對過兩層，第二層（Caption）強度較高。

### 3.2 來源與逐字原文

**檔案**：`TCON_UI/EM01/Raydium_TCON_Tool_RM80100_v0.3.42Beta9/Raydium_TCON_Tool_RM80100_v0.3.42Beta9.exe`
20,879,872 bytes，MD5 `3cc619cf2aaf7f97c5cede108b095a7e`

**第一層 —— 元件名**（`strings -a -t d -n 6 <exe> | grep GPO_Mode`，逐字節錄）：

```
12652875 (PopupMenu_System_GPO_Mode_Flash_WriteAll<8
12653063 +PopupMenu_System_GPO_Mode_Flash_WriteNormalL8
12653113 (PopupMenu_System_GPO_Mode_Flash_Write200P8
12653160 (PopupMenu_System_GPO_Mode_Flash_Write133T8
```

名字前的 `(`／`+` 不是雜訊，是 Delphi 的**長度前綴位元組**：`(` ＝ 0x28 ＝ 40，
而 `PopupMenu_System_GPO_Mode_Flash_WriteAll` 剛好 40 字元 —— 這本身就證明它是結構化字串表。

**第二層 —— DFM 資源，含 Caption**（偏移 `20808271` 附近，逐字）：

```
TMenuItem(PopupMenu_System_GPO_Mode_Flash_Write133 | Caption | Write 133% |
OnClick | *PopupMenu_System_GPO_Mode_Flash_WriteClick |
TMenuItem(PopupMenu_System_GPO_Mode_Flash_WriteAll | Caption | Write All |
OnClick | *PopupMenu_System_GPO_Mode_Flash_WriteClick | PNG | IHDR ...
```

標準 DFM 版面：`型別 TMenuItem` → `元件名` → `屬性 Caption` → **值** → `事件 OnClick` → 處理函式。
後面接 `PNG IHDR` 是選單項的小圖示。**Caption 就是使用者在畫面上看到的文字。**

### 3.3 重建出來的選單

| 元件名 | Caption（畫面文字） | 中譯 |
|---|---|---|
| `..._Load` ／ `..._Save` | `Load` ／ `Save` | 載入／儲存 |
| `..._InitThreeMode` | `Init Three Mode` | 初始化三模 |
| （分隔標題） | `--- Copy Data ---` | ---複製資料--- |
| `..._CopyNormal` ／ `Copy200` ／ `Copy133` ／ `CopyCurrent` | `From Normal` ／ `From 200%` ／ `From 133%` ／ **`From Current`** | 從 … |
| `..._Flash_ReadNormal` ／ `Read200` ／ `Read133` ／ `ReadAll` | `Read Normal` ／ `Read 200%` ／ `Read 133%` ／ `Read All` | 讀取 … |
| `..._Flash_WriteNormal` ／ `Write200` ／ `Write133` ／ `WriteAll` | **`Write Normal`** ／ `Write 200%` ／ `Write 133%` ／ `Write All` | 寫入 … |

**開啟這個選單的按鈕**：`Button_System_GPO_Mode_FlashReadWrite`，Caption ＝ **`Flash R/W`**。

⚠ `Button_System_GPO_Mode_WriteRegister` 的 Caption 抓取時解析視窗溢出到隔壁元件，
拿到的值不可採信，**該按鈕的 Caption 未確認**。

### 3.4 各項主張的確定程度

| 主張 | 等級 |
|---|---|
| exe 內有這四個 `TMenuItem`，顯示文字為 `Write Normal／133%／200%／All` | **間接但強**（DFM 結構完整、直接讀到 Caption 值） |
| 四個 Write 項共用同一個 `OnClick` 處理函式 | **間接但強**（有接事件，不是沒實作的空殼） |
| 開啟選單的按鈕上寫著 `Flash R/W` | 間接、中等（單一樣本、未交叉驗證） |
| `Flash_` 前綴 ＝ 走 Flash 讀寫路徑、對應 `0x35000/0x35300/0x35600` 三個 slot | 🔴 **推測**（由命名與檔案結構對上，非讀到） |
| 這組功能實際可用、沒有前置條件 | 🔴 **推測** —— 未執行過。`Label_System_GPO_Mode_LockedMsg`（「鎖定訊息」）的存在暗示某些狀態下不可用 |

### 3.5 旁證

- `Button_GPO_r_dly_2_*` ／ `f_dly_2_*` —— 證實 UI 有第二組延遲欄位（即 wfg 一直沒有的 `_2nd`）
- `TCON_UI/EM01/MCU/m0_CRC_DLG_GPO_Table_Test_FF97_T1.bin` —— 三模表在 MCU 側叫 **GPO Table**

---

## 4. 已查到但本題用不上的事實（留檔）

- **slot 的實際版面**（更正先前的說法）：slot 內 **rt8_tcon_1 佔 0x100 bytes**（`+0x000..+0x0FF`），不是 0xCC ——
  `+0x0CC..+0x0FF` 有資料且三個 slot 完全相同，與 CURRENT 的 `0x05CC..0x05FF` 一致。
  rt8_tcon_2 在 `+0x100..+0x1FF`，`+0x200` 是 2 bytes 校驗值，`+0x202..+0x2FF` 全 0。
- **假如**日後要直接改檔案（而不是走 script）：`0x0504→+0x004`、`0x06FB→+0x1FB`，
  落在 `+0x000..+0x1FF` 內，不會踩到 `+0x200` 的校驗值。
- **EEPROM**：實測 10 個檔 **0 個有 slot**，CURRENT 就是唯一位置。
- **Flash 但沒有候選 slot**：56 個檔中有 **51 個**屬於這一類。

---

## 5. 校驗值反推：純知識記錄（非待辦）

Bruce 已說明「script 由 TCON UI 載入，校驗值 UI 會自動處理」，所以校驗值不是本案的阻礙。
但在得知這件事之前已經做完的反推，結論記錄如下：

- slot `+0x200` 的 2 bytes **確實是內容的函數**：兩個檔中內容相同的 slot，校驗值也相同（`34BF`、`EEDD` 各出現兩次）
- 4 個不重複樣本：`34BF` / `5234` / `C691` / `EEDD`
- **全 65536 個多項式 × 3 種資料範圍（rt8_tcon_1／rt8_tcon_2／兩者合併）× refin × 端序的差分掃描 → 0 個候選**
  （差分可同時消掉 init 與 xorout，所以這個掃描涵蓋所有 init／xorout 組合）
- 常見 CRC-16 目錄、sum16、Fletcher-16、XOR-16 也全部不中
- ⇒ **不是涵蓋上述範圍的標準 CRC-16。演算法未知。**
  任何「直接改 .bin」的方案都必須先解決這一點，走 script／UI 路徑則不受影響。

---

## 6. 教訓

**當兩種位址空間在某個區段數值重合時，重合本身就是陷阱。**
EM01 Flash 低位 `fileOff == regAddr`，讓「0x0500」同時是兩種東西；
我們把這個巧合當成通則，一路推到 `0x35000`，然後花了一輪去評估一個原理上做不到的方案。

防止再犯的具體做法：**凡是輸出給人看的位址，一律標明是哪一種空間**（見 §2 的三處建議）。
程式碼內部早就有這條規矩且遵守得很好 —— 漏掉的是「給人看的那一層」。
