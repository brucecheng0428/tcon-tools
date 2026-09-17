# DG I2C 本機橋接 helper

網頁沒有任何管道直接呼叫本機的 FTDI 驅動（D2XX），這支小程式就是那條「電話線」：

```
網頁 ──WebSocket(127.0.0.1)──> dg-helper.exe ──libMPSSE(D2XX)──> 治具 ──I2C──> TCON
```

## 使用者流程（v1.2.0，Bruce 2026-09-17 回饋後）

1. 下載加密 zip → 用密碼 **1234** 解壓（得到**三個檔**：`dg-helper.exe`＋`dg-measure.html`＋`libMPSSE.dll`，放同一資料夾）
2. 雙擊 `dg-helper.exe`（SmartScreen「其他資訊 → 仍要執行」兩下）
3. helper **自己打開預設瀏覽器** `http://127.0.0.1:8899`，量測頁由 helper 自己端出來、**自動連好** —— 不必按任何連線鈕
4. 要用原廠 PQ Tool 時先關掉 helper 黑視窗（擇一使用）

> **v1.2.0：`libMPSSE.dll` 直接包進 zip**（Bruce 2026-09-17 裁示）。原本不隨附是顧慮
> FTDI 二進位再散布授權＋去商標化，但這是公司內部工具、加密壓縮、用的人本來就有
> PQ Tool —— 把不確定的顧慮放大成阻礙、讓使用者搬檔案是錯的取捨。改為附上。
> `ftd2xx.dll` **不附**：它隨 FTDI 驅動裝進系統，跑得動 PQ Tool 就一定有；缺它時
> 狀態碼是 **F**（與「檔案不存在」的 **D** 分開）。

**Console 全英文**（Windows console 中文會亂碼）。黑視窗最後一行是**單一大寫狀態字母**，詳細英文寫進 exe 旁的 `dg-helper.log`。

| 字母 | 意思 | 處置 |
|---|---|---|
| **G** | all good | 已開已連，直接用 |
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
cc -O2 test_proto.c -o test_proto && ./test_proto   # 32/32 通過
```

測到：WebSocket 握手（RFC 6455 標準向量）、SHA1／Base64、JSON 擷取、
位址白名單 `0x1200–0x12FF`、Origin 白名單（含 spoof 後綴的阻擋）。

🔴 **未經實機驗證**：D2XX 連線、libMPSSE 呼叫、實際 I2C 通訊在無 Windows、
無 FTDI 硬體的環境全部無法自驗。只驗到「PE 正確、能載 winsock、能對
libMPSSE.dll 做 GetProcAddress」這一層。

## WebSocket 協定（proto 1）

只 bind `127.0.0.1`，WS 升級時檢查 Origin（只收 `https://brucecheng0428.github.io`
與 `http://127.0.0.1`/`localhost`）。連上後 helper 先送 `hello`。

| 網頁送 | helper 回 |
|---|---|
| `{"type":"ping","id":N}` | `{"type":"pong","id":N,"helper":"1.0.0","proto":1}` |
| `{"type":"open","clockHz":150000}` | `{"type":"result","cmd":"open","ok":true,"channels":N}` |
| `{"type":"read","slave":96,"addr":65280,"len":3}` | `{"type":"result","cmd":"read","ok":true,"data":[..],"status":0}` |
| `{"type":"write","slave":96,"addr":4608,"data":[..]}` | `{"type":"result","cmd":"write","ok":true,"status":0}` |
| `{"type":"close"}` | `{"type":"result","cmd":"close","ok":true}` |

I2C 序列（照抄 PQ Tool 反組譯 `xCtrl_FTDI_I2C.cs` / `xCtrl_I2C_App.cs`）：
- open：`I2C_InitChannel(ClockRate=150000, LatencyTimer=1, Options=3)`，channel 0
- read：寫 2-byte 位址 `options=0x19`（repeated start，無 STOP）→ 讀 `options=0x0B`
- write：位址+資料串成一 buffer `options=0x17`
- 🔴 寫入位址白名單 `0x1200–0x12FF` 在 helper 端**再擋一次**（不只靠網頁）

## 相依 DLL

`libMPSSE.dll`（x86，48,109 bytes，PE machine `0x014c`，SHA256
`916584dffeaa0e072a7364b1eb896520f233ac5c70c24919e623893ae6362ad2`）**v1.2.0 起
直接包進加密 zip**，來源＝`Release V1.5.0/libMPSSE.dll`。打包腳本從主機端的 PQ
Tool 資料夾讀它（不進版控成 repo 裡的裸檔 —— git-tracked＝公開，只放進加密 zip）。

`ftd2xx.dll`（libMPSSE 的相依）**不隨附**：它隨 FTDI D2XX 驅動裝進系統，跑得動 PQ
Tool 就一定有；缺它時 helper 印狀態碼 **F**（與「libMPSSE.dll 檔不存在」的 **D** 分開）。
載入前 `SetDllDirectory()` 把 DLL 所在目錄加進搜尋路徑，讓 ftd2xx.dll 從系統解析。
