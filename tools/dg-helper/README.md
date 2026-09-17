# DG I2C 本機橋接 helper

網頁沒有任何管道直接呼叫本機的 FTDI 驅動（D2XX），這支小程式就是那條「電話線」：

```
網頁 ──WebSocket(127.0.0.1)──> dg-helper.exe ──libMPSSE(D2XX)──> 治具 ──I2C──> TCON
```

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

`libMPSSE.dll`（x86，48,109 bytes）與它相依的 `ftd2xx.dll`。**不隨附**（FTDI
二進位再散布 ＋ 去商標化規定）。helper 啟動時去找使用者電腦上已有的那顆：
exe 同目錄 → `dg-helper.ini` 記住的路徑 → 幾個常見 PQ Tool 相對路徑 → 都找不到
才在 console 問一次。會用這工具的人一定有 PQ Tool，所以不是額外負擔。
`ftd2xx.dll` 由已安裝的 FTDI 驅動從系統解析。
