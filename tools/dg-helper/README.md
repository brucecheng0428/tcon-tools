# DG I2C 本機橋接 helper

網頁沒有任何管道直接呼叫本機的 FTDI 驅動（D2XX），這支小程式就是那條「電話線」：

```
網頁 ──WebSocket(127.0.0.1)──> dg-helper.exe ──libMPSSE(D2XX)──> 治具 ──I2C──> TCON
```

## 使用者流程（v1.3.0，Bruce 2026-09-17 回饋後）

1. **下載**（不加密 zip，Windows 內建就解得開）
2. 🔴 **整包解壓到一個資料夾**（例如桌面）—— **不要**直接在壓縮檔預覽視窗裡點 exe
3. 在那個資料夾**雙擊 `dg-helper.exe`**（SmartScreen「其他資訊 → 仍要執行」兩下）→ 瀏覽器自己開、自己連好，直接用

解壓後是**四個檔**（`dg-helper.exe`＋`dg-measure.html`＋`i2c.html`＋`libMPSSE.dll`）要在同一資料夾。要用原廠 PQ Tool 時先關掉 helper 黑視窗（擇一使用）。

> **v1.2.0：`libMPSSE.dll` 直接包進 zip**（Bruce 裁示）。`ftd2xx.dll` **不附**（系統隨 FTDI 驅動提供，缺它是狀態碼 **F**）。
>
> **v1.3.0（Bruce 2026-09-17）**：
> - **主下載改不加密**。原本壓密碼只是為了繞下載掃描，但密碼 `1234` 本來就印在頁面上＝沒有機密性，只多一步輸入 → 拿掉。被公司掃描器擋住的話再給加密版。
> - 🔴 **偵測「在暫存目錄執行」＝狀態碼 T**。最可能造成 Bruce 出 D 的真因：在檔案總管的**壓縮檔預覽**裡直接雙擊 exe，Windows 只把 exe 解到 `%TEMP%` 執行，`libMPSSE.dll` 留在壓縮檔沒跟出來 → 找不到。這種情況印 **T**（不是 D），並直接叫使用者「整包解壓到資料夾再從那裡跑」。

**Console 全英文**（Windows console 中文會亂碼）。黑視窗最後一行是**單一大寫狀態字母**，詳細英文寫進 exe 旁的 `dg-helper.log`。

| 字母 | 意思 | 處置 |
|---|---|---|
| **G** | all good | 已開已連，直接用 |
| **T** | 在壓縮檔預覽／暫存目錄直接跑 exe，dll 沒跟出來 | 把**整包解壓到一個資料夾**再從那裡雙擊 exe |
| **D** | libMPSSE.dll 檔不存在 | 它本來就跟 exe 一起在 zip 裡；若你把 exe 搬出來了，把 `libMPSSE.dll` 放回 exe 旁（或直接在解壓的資料夾裡跑） |
| **F** | 找到 libMPSSE.dll 但相依的 ftd2xx.dll 載不到 | 裝 FTDI D2XX 驅動，或先跑一次原廠 PQ Tool（會把 ftd2xx.dll 裝進系統），重跑 |
| **X** | libMPSSE.dll 載得起來但不對（位元數不合／損壞） | 換 32 位元的 `libMPSSE.dll` |
| **J** | FTDI jig not found | 插上治具（USB／電源），重跑 |
| **U** | jig in use | 關掉原廠 PQ Tool／AUX GUI，重跑 |
| **P** | port 127.0.0.1 busy | 已有一個 helper 在跑，關掉再開 |
| **B** | browser did not open | 自己開 `http://127.0.0.1:8899` |

字母刻意避開易混淆的 I／O／L／0／1。失敗時視窗不關（P 會等 Enter，其餘因為 server 還在跑所以視窗自然留著）。
🔴 **D／F／X 三種 DLL 失敗分成不同字母**：D＝檔案根本不存在、F＝檔案在但相依的 ftd2xx 載不到、X＝檔案在也載得起來但不是對的（exports 缺）。`SetDllDirectory()` 在載入前把 DLL 所在目錄加進搜尋路徑，讓 ftd2xx.dll 能從系統解析。

## DLL 搜尋順序（v1.2.0）

`libMPSSE.dll` 已包進 zip，正常情況同目錄第一順位就命中。但搜尋邏輯保留（使用者自己拆開放、或未來換版的退路），且**逐條路徑寫進 `dg-helper.log`**：

1. 環境變數 `DG_HELPER_DLL_DIR`（進階使用者明路）
2. exe 所在目錄
3. 目前工作目錄
4. 選填的 `dg-helper.ini`（單行＝資料夾）
5. 登錄檔 Uninstall 鍵（HKLM 64/32-bit view、HKCU）比對 DisplayName 含 Raydium／PQ，取 InstallLocation
6. `Program Files`／`Program Files (x86)` 底下名字像 Raydium/PQ/TCON 的資料夾（限深度，不全碟掃）
7. 使用者 `Desktop`／`Downloads`／`Documents` 底下同上
8. `PATH` 上每個目錄
9. 相對 `.\Release V1.5.0`、`..\Release V1.5.0`（退路，放最後）

## 自我診斷（寫進 dg-helper.log，全英文）

OS 版本、行程是否 32-bit、**搜尋過的每一條路徑**＋命中與否、`libMPSSE.dll` 完整路徑、FTDI 裝置列舉（幾顆、VID/PID/desc）、channel 0 開得起來與否（分辨 J／U）、port 綁定、瀏覽器是否自動開起來。每項 `OK` / `FAIL:<reason>`。

## 為什麼是原生 C，不是 C#（net472）

前輪報告定案要用 C# net472、32 位元、framework-dependent。實際動手才發現：

**交付環境（macOS/Linux、無 Visual Studio、無 mono、無 dotnet，且沙箱連不到
Microsoft／Mono／Debian 套件庫）根本編不出 C# net472。** 依 Bruce 指示「編不出來就
立刻回報，不要硬做」，同時找到一條**滿足全部硬條件、而且更輕**的路：

| 硬條件（前輪定案） | C# net472 | 原生 C（本方案） |
|---|---|---|
| **必須 32 位元**（否則載不動 x86 的 libMPSSE.dll） | ✅ `Prefer32Bit` | ✅ PE machine `0x014c`（實測） |
| 單檔、免安裝 | ✅ 但需 .NET Framework 4.7.2 在場 | ✅ **連 .NET 都不需要**，只用 Win32 API |
| 能在此環境編出來 | ❌ **編不出來** | ✅ `zig cc -target x86-windows-gnu` |
| I2C 序列照抄 PQ Tool | ✅ | ✅ 同一顆 libMPSSE.dll，函式簽章一字不差 |

原生 C 版**比 C# 更少前提**：不依賴 .NET Framework，只 import `WS2_32.dll`、
`KERNEL32.dll` 與 UCRT（Windows 10/11 內建）。

> 🔴 語言從 C# 改成原生 C 是與前輪定案的偏離，已回報 Bruce 供覆核。若最終要回到
> C#，本檔的 WebSocket 協定、位址白名單、I2C 序列都可原封搬過去。

## 檔案

| 檔 | 作用 |
|---|---|
| `dg_helper.c` | 主程式：DLL 尋找／載入、I2C 動作（照抄 PQ Tool）、WebSocket 伺服 |
| `dg_helper_proto.h` | 可攜協定工具：SHA1／Base64（WS 握手）、JSON 擷取、位址白名單、Origin 檢查 |
| `dg_helper_version.h` | helper 版本 ＋ 協定版本（分離） |
| `test_proto.c` | `dg_helper_proto.h` 的單元測試（在 Linux/macOS 上編來跑） |
| `build.sh` | 用 zig 交叉編譯成 32 位元 Windows exe |

## 編譯

```bash
# 需要 zig（pip 套件 ziglang 亦可）
ZIG=/path/to/zig ./build.sh          # 產出 dg-helper.exe（32 位元、PE32、console）
```

驗證 PE：`python3` 讀 `f[0x3c:0x40]` 取 PE offset、再讀 machine，應為 `0x014c`。

## 測試（可自驗的部分）

```bash
cc -O2 test_proto.c -o test_proto && ./test_proto   # 111/111 通過（v1.6.0；v1.4.0 為 76/76，原為 32/32）
```

測到：WebSocket 握手（RFC 6455 標準向量）、SHA1／Base64、JSON 擷取、
位址白名單 `0x1200–0x12FF`、Origin 白名單（含 spoof 後綴的阻擋），
以及 v1.4.0 新增的 offset 寬度組包、寫入 frame 逐 byte、Content-Type 白名單、
HTTP 請求路徑解析（正反都驗）。

🔴 **未經實機驗證**：D2XX 連線、libMPSSE 呼叫、實際 I2C 通訊在無 Windows、
無 FTDI 硬體的環境全部無法自驗。只驗到「PE 正確、能載 winsock、能對
libMPSSE.dll 做 GetProcAddress」這一層。

## WebSocket 協定（proto 2，v1.4.0 起）

只 bind `127.0.0.1`，WS 升級時檢查 Origin（只收 `https://brucecheng0428.github.io`
與 `http://127.0.0.1`/`localhost`）。連上後 helper 先送 `hello`。

| 網頁送 | helper 回 |
|---|---|
| `{"type":"ping","id":N}` | `{"type":"pong","id":N,"helper":"1.4.0","proto":2}` |
| `{"type":"open","clockHz":150000}` | `{"type":"result","cmd":"open","ok":true,"channels":N}` |
| `{"type":"read","slave":96,"addr":65280,"len":3,"awid":2}` | `{"type":"result","cmd":"read","ok":true,"data":[..],"status":0}` |
| `{"type":"write","slave":96,"addr":4608,"data":[..]}` | `{"type":"result","cmd":"write","ok":true,"status":0}` |
| `{"type":"rawwrite","slave":104,"addr":0,"data":[..],"awid":2}` | `{"type":"result","cmd":"rawwrite","ok":true,"status":0,"transferred":N}` |
| `{"type":"lock","id":N,"on":1}` | `{"type":"result","cmd":"lock","ok":true,"locked":true}` |
| `{"type":"close"}` | `{"type":"result","cmd":"close","ok":true}` |

**proto 1 → 2 的差異（向後相容）**

- `read` 多一個選填欄位 **`awid`**（offset／sub-address 寬度，只接受 `0/1/2/4`，
  **缺省 2**）。缺省值就是 proto 1 的行為，所以舊呼叫端的 wire byte 一個都沒變。
  `awid=0` ＝ 完全不送位址 ＝ I2C **current address read**（合法模式，非「沒填」）。
  位址一律 **MSB first**。
- 新增 **`rawwrite`**：I2C 序列與 `write` 完全相同，但 **不套位址白名單**。
  🔴 這是給 `i2c.html`（I2C 讀寫測試）用的 —— 測試工具的性質就是要能任意讀寫。
  代價用**可觀測性**補：每一筆 `rawwrite` 都完整寫進 `dg-helper.log`
  （slave／awid／位址／全部 byte），而且**先寫 log 再碰匯流排**，I2C 卡住也留得下紀錄。
  既有的 `write` 與它的白名單**原封未動**，dg-measure 的防線不受影響。
- 網頁端用 `pong.proto` 判相容：`dg-measure.html` 需要 `proto >= 1`、
  `i2c.html` 需要 `proto >= 2`。

**proto 2 → 3 的差異（向後相容）**

- 新增 **`lock`**：只有 channel 的**持有者**能設。`on:1` 之後，別人帶 `takeover:1`
  的 `open` 會被拒絕並回 `busy:true` **＋ `locked:true`** —— 兩個旗標分開是刻意的：
  頁面要能分辨「對方拿著」與「對方正在量測」，因為下一步完全不同。
  🔴 存在的理由只有一個：dg 正在跑 Gray 0~255 量測時，使用者切到別的分頁
  **不可以**把那條量測打斷。
  lock 在三種情況會自動清掉：持有者斷線、持有者 `close`、持有權易主。
  忘了清的後果是 helper 永遠認為「有人忙碌中」，只能重開 —— 正好是 v1.6.0 要免掉的事。
- `hello` 與 `pong` 多回 `locked`（`pong` 另回 `owner`）。
- 🔴 網頁端**仍只要求 proto ≥ 2**。lock 是選配：沒有它只是少一道保護，
  不該讓拿著舊 helper 的人整條路斷掉。網頁送 lock 是 fire-and-forget，
  舊 helper 不回覆也不影響量測。

**位址白名單（`write`）v1.6.0 起是幾個區間的聯集**

| 區間 | 誰用 |
|---|---|
| `0x0001–0x0004` | cursor clock enable（per-IC 落在其中一個 byte） |
| `0x0200–0x02FF` | ptg：E512A1 / V512S1 |
| `0x0C00–0x0CFF` | ptg：EM02A1 / V512S2 / VM02S1 |
| `0x1200–0x12FF` | ptg：EM01A1 / VM01S1 |
| `0xFF20–0xFF25` | tm：cursor 開關／模式／顏色與 x,y 座標 |

🔴 **helper 這一份必然是粗的：它不知道對面是哪一顆 IC**（IC 識別在網頁端）。
精確的那一份在 `dg-measure.html` 的 `dgmI2cWrRangesOf()`，依識別出來的 IC 逐顆查表，
而且**認不出來就一個位址都不寫**。兩份的分工是刻意的 —— 把 helper 這份也做成
per-IC 等於讓它相信網頁傳來的判斷，那就不是第二道防線，只是把第一道抄了一份。

I2C 序列（照抄 PQ Tool 反組譯 `xCtrl_FTDI_I2C.cs` / `xCtrl_I2C_App.cs`）：
- open：`I2C_InitChannel(ClockRate=150000, LatencyTimer=1, Options=3)`，channel 0
- read：寫 `awid`-byte 位址 `options=0x19`（repeated start，無 STOP）→ 讀 `options=0x0B`
  （`awid=0` 時跳過位址相位，直接讀）
- write：位址+資料串成一 buffer `options=0x17`
- 🔴 `slave` 是 **7-bit**，`I2C_DeviceRead/Write` 的 `deviceAddress` 收 7-bit，
  左移由 libMPSSE 內部做 —— **這一層不准左移**
- 🔴 寫入位址白名單 `0x1200–0x12FF` 在 helper 端**再擋一次**（不只靠網頁），
  但**只套用在 `write`**，不套用在 `rawwrite`（見上）

## HTTP：服務 exe 所在的資料夾（v1.4.0 起）

v1.3.x 不看路徑、一律回 `dg-measure.html`，所以第二個工具頁根本端不出來。
v1.4.0 改成服務 exe 旁的靜態檔 —— **以後新增頁面不必再改 exe**（也就不必再讓
使用者重過 SmartScreen）。

| 路徑 | 結果 |
|---|---|
| `/` | `dg-measure.html`（與 v1.3.x 相同；檔案不在時仍是原本那頁提示） |
| `/i2c.html` | I2C 讀寫測試頁 |
| 其他 | exe 旁的同名檔，找不到就 404 |

從嚴的地方（`dgh_req_filename` / `dgh_mime_for`，都在 `dg_helper_proto.h`，
`test_proto.c` 正反都驗）：不支援子目錄、不做 percent-decode、
拒絕 `..` `/` `\` `:` `%` 與 dotfile；副檔名白名單只放行
`.html/.htm/.js/.css/.json/.svg/.png/.ico/.txt` —— `.exe`／`.dll`／`.log`／`.c`
一律不端出去。回應帶 `Cache-Control: no-store`。

另新增 `--page=<file>`：指定啟動時自動開啟哪一頁（預設 `/`）。
啟動橫幅偵測到 exe 旁有 `i2c.html` 時會多印一行它的網址。

## 相依 DLL

`libMPSSE.dll`（x86，48,109 bytes，PE machine `0x014c`，SHA256
`916584dffeaa0e072a7364b1eb896520f233ac5c70c24919e623893ae6362ad2`）**v1.2.0 起
直接包進加密 zip**，來源＝`Release V1.5.0/libMPSSE.dll`。打包腳本從主機端的 PQ
Tool 資料夾讀它（不進版控成 repo 裡的裸檔 —— git-tracked＝公開，只放進加密 zip）。

`ftd2xx.dll`（libMPSSE 的相依）**不隨附**：它隨 FTDI D2XX 驅動裝進系統，跑得動 PQ
Tool 就一定有；缺它時 helper 印狀態碼 **F**（與「libMPSSE.dll 檔不存在」的 **D** 分開）。
載入前 `SetDllDirectory()` 把 DLL 所在目錄加進搜尋路徑，讓 ftd2xx.dll 從系統解析。
