# EM01「匯出時選擇寫到哪一模」評估 —— **暫停**，以及一次概念混淆的記錄

日期：2026-08-23
狀態：🔴 **本題由 Bruce 裁示暫停，不往下實作。** 本文只保留概念釐清、已取得的發現與知識記錄。
提案（Bruce 原話）：「匯入時偵測到三模，那匯出的時候，是否也可以選擇我要匯出哪一個？……也就是這個 script 也要對應到相對的位置。」
暫停理由（Bruce 原話）：「Register 的位置應該沒有這麼多，而 Flash 的位置才有這麼多，所以這條路是沒辦法做，因為寫入 script 好像寫不了 Flash，它只能寫 Register。」

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

**🔴 使用者看得到的地方：三處只印裸位址，沒有標明是「檔案偏移」。**

| 位置 | 目前顯示 | 問題 |
|---|---|---|
| 匯入提醒卡片的 detail | `GPO CURRENT @0x500` ／ `GPO SLOT @0x35600` | 未標明是檔案偏移 |
| Timing 選擇框每一項（`.wfg-ack-where`） | `…　@0x500`、`@0x35000` | 兩種位址並列，最容易誤導 |
| 匯出 script 的來源註解 | `// source timing: read from 200% @0x35000` | 出現在一個**全部都是 register 位址**的檔案裡，最容易被當成 register 位址 |

第三處尤其值得注意：那一行夾在一整串 `write -m 0626 …`（register 位址）之間，
讀者很難不把 `@0x35000` 也當成 register 位址。

**建議（不在本輪實作，等 Bruce 決定）**：這三處把位址標成 `file 0x35000` 或加註「（檔案偏移，非暫存器位址）」。
成本很小，能從源頭消掉這個誤解。

---

## 3. ✅ 發現：EM01 官方 TCON UI **自己就有三模寫入功能**

這是本次評估唯一有價值的產出，可能是日後真正的解法方向。

**在哪看到**：`TCON_UI/EM01/Raydium_TCON_Tool_RM80100_v0.3.42Beta9/Raydium_TCON_Tool_RM80100_v0.3.42Beta9.exe`
（20.9 MB，Delphi/VCL 程式）。用 `strings` 取出的 **VCL 表單元件名**如下，`TMenuItem` 前綴代表它們是彈出選單項：

```
TMenuItem  PopupMenu_System_GPO_Mode_Flash_WriteNormal
TMenuItem  PopupMenu_System_GPO_Mode_Flash_Write133
TMenuItem  PopupMenu_System_GPO_Mode_Flash_Write200
TMenuItem  PopupMenu_System_GPO_Mode_Flash_WriteAll
TMenuItem  PopupMenu_System_GPO_Mode_Flash_ReadNormal / Read133 / Read200 / ReadAll
TMenuItem  PopupMenu_System_GPO_Mode_CopyCurrent / CopyNormal / Copy133 / Copy200
TMenuItem  PopupMenu_System_GPO_Mode_InitThreeMode
           PopupMenu_System_GPO_Mode_Load / Save / FileIO
           Button_System_GPO_Mode_WriteRegister
           CheckBox_System_GPO_Mode_RealTime
```

**怎麼讀這組名字**：

- `Flash_Write<模式>`／`Flash_Read<模式>` —— 走的是 **Flash 讀寫路徑**，不是 script。
  這正是「寫到 slot」該用的機制，而 script 做不到的也正是這件事。
- `Copy<模式>` —— 看起來是在 UI 內部把目前編輯中的一組值複製到某一模的欄位。
- `InitThreeMode` —— 初始化三模表（對應我們在檔案裡看到的 `0x35000/0x35300/0x35600` 三個 slot）。
- `WriteRegister` —— 寫暫存器，對應的就是 CURRENT。
- 另有 `Button_GPO_r_dly_2_*` / `f_dly_2_*`，證實 UI 有第二組延遲欄位（即我們一直沒寫的 `_2nd`）。
- MCU 檔名也可交叉印證：`TCON_UI/EM01/MCU/m0_CRC_DLG_GPO_Table_Test_FF97_T1.bin` —— 三模表在 MCU 側叫 **GPO Table**。

⚠️ **這些是從 exe 的元件名讀出來的，我沒有執行過那支工具**，實際選單位置、操作步驟與行為請 Bruce 實機確認。

**若日後要恢復本題**，方向應該是：wfg 匯出 script 寫進 **CURRENT** → 在 TCON UI 用 `GPO Mode → Flash Write <模式>`
把它寫進指定的模式。wfg 這邊不需要、也做不到最後那一步。

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
