#ifndef I2C_BRIDGE_VERSION_H
#define I2C_BRIDGE_VERSION_H
/* helper 版本與協定版本分離：
 * - I2C_BRIDGE_VERSION：每次改 helper 都動（使用者要重下載＝重過 SmartScreen）
 * - I2C_BRIDGE_PROTO  ：只有 wire format 真的改了才動；網頁靠這個判相容 */
/* 1.4.0 / proto 2（2026-09-18）：
 *   - read 新增 awid（offset 寬度 0/1/2/4），**缺省 2 ⇒ proto 1 的 wire byte 未變**
 *   - 新增 rawwrite：不套位址白名單（測試工具要能任意寫），改以完整 log 留痕
 *   - HTTP 改服務 exe 所在資料夾的靜態檔（"/" 仍為 dg-measure.html）
 *   - --page=<file> 指定自動開啟的頁面
 * 1.5.0 / proto 2 不變（2026-09-18，Bruce 回報「helper 一按下就被 dg 佔住」）：
 *   - 🔴 伺服迴圈改 select() 多路複用。v1.4.x 是單連線阻塞式，dg 的 WS 一開，
 *     helper 連第二個 HTTP 請求都 accept 不到 ⇒ i2c.html 根本載不進來
 *   - 🔴 "/" 改為內建極簡入口頁（自己不碰 I2C），不再直接開 dg-measure.html
 *   - I2C channel 加擁有權：同時只有一個 client 持有；被佔時回 busy=true
 *     可判別錯誤，open 帶 takeover:1 可主動接手（舊持有者收到 taken 後被斷線）
 *   - wire format 只有**新增**選填欄位與新回傳欄位 ⇒ **proto 維持 2**
 * 1.6.0 / proto 3（2026-09-18，Bruce「helper 只要開一次就好、切到哪頁哪頁自動接手」）：
 *   - 🔴 新增 `lock` 命令：持有者可以把自己標成「忙碌中」，此時**別人的 takeover
 *     會被拒絕**（回 busy:true + locked:true）。存在的理由只有一個 —— dg 正在跑
 *     Gray 0~255 量測時，使用者切到別的分頁不可以把那條量測打斷。
 *   - hello／pong 多回 `locked`，頁面才知道拒絕的理由是「對方忙」不是「對方在」
 *   - wire format 只有**新增**命令與新回傳欄位，舊頁面完全不受影響；但因為多了
 *     一個命令型別，依 C2「只有 wire format 真的改了才動」的反面 ⇒ proto 進 3。
 *     🔴 網頁端仍只要求 proto ≥ 2 —— lock 是選配，沒有它只是少一道保護，
 *     不該讓拿著舊 helper 的人整條路斷掉。
 * 1.7.0 / proto 3 不變（2026-09-18，Bruce「那個 local 的網頁不是已經叫你不要再用了嗎？
 *   而且我解壓縮以後，裡面一樣會有這個網頁啊！」）：
 *   - 🔴 **啟動不再自動開任何網頁**。helper 就是一支背景服務。
 *   - 🔴 **靜態檔服務預設關閉**（`--serve` 才開，可用 `--serve=<dir>` 指目錄）。
 *     沒開時任何 HTTP 請求都回同一句話，指向線上的 tcon-tools。
 *   - 狀態碼 **B（瀏覽器沒開）取消** —— 已經沒有「開瀏覽器」這個步驟。
 *   - zip 裡不再放 dg-measure.html / i2c.html，只剩 exe ＋ libMPSSE.dll。
 *   🔴 為什麼這條路成立（先前我判成不可行是錯的）：Chrome 147（2026-04 stable）起，
 *     公開來源連 loopback 的 WebSocket 會**跳一次權限提示**，按允許就通；
 *     same-space（本機頁連本機）才不跳。headless 沒有人可以按那個提示，
 *     所以看起來像「收到 TCP 但一個 byte 都沒送就關」—— 那是環境限制，不是結論。
 *     出處：developer.chrome.com/blog/local-network-access
 * 1.8.0 / proto 3 不變（2026-09-19，Bruce「I2C 讀取的速度好像有點太慢了」）：
 *   - 🔴 **讀取改走 libMPSSE 的 fast transfer 路徑**（OPT_READ_DATA 加上 0x10）。
 *     根因：沒有 FAST_TRANSFER 位元時，I2C_DeviceRead 對**每一個 byte**做
 *     「送 ~17 byte MPSSE 命令 → INFRA_SLEEP(1) → 讀 1 byte」⇒ 4096 byte 光 sleep
 *     就 4 秒，外加 8192 次 USB 往返。理論 I2C 時間 @400kHz 只有 0.09 秒。
 *     🔴 而我們原本**只有讀取沒帶這個位元**（位址相位與寫入都有）⇒ 慢的一直只有讀取。
 *   - `--slow-read` 與 open 的 `"fastread":0` 可退回舊路徑（不必換 exe）。
 *   - read／rawwrite 的回覆多帶 `us`（libMPSSE 呼叫本身的耗時）與 `fast` 旗標，
 *     網頁據此把「傳輸層 vs 裝置」分開記在 log。wire 只有**新增**欄位 ⇒ proto 不變。
 * 1.9.0 / proto 3 不變（2026-09-19，Bruce「讀的還是太慢了…你確定這個讀是 Burst Read 嗎？」）：
 *   - 🔴 新增 **raw MPSSE 路徑**：自己組整段命令 ⇒ **一次 FT_Write ＋ 一次 FT_Read**，
 *     繞開 libMPSSE 每 byte 的兩次 USB 往返與 INFRA_SLEEP(1)。
 *     4096 byte：8192 次往返 ⇒ **2 次**。
 *   - 🔴 **預設關**（`--raw-mpsse` 或 open 帶 `"rawmpsse":1` 才開）。理由與 v1.8.0
 *     的教訓一致：命令序列**沒有在他的硬體上跑過**，沒有實證不當預設值。
 *   - 命令序列是 `dg-measure.html` WebUSB 路徑的 C 移植，**逐位元組相同**
 *     （test_proto.c 與 dg_i2c_selftest.js 各釘同一個向量互相對照）。
 *   - 每個 byte 的 ACK 都檢查，最後一個 byte 送 NACK；任何 NACK 都回報，不靜默吞掉。
 *   - 回覆多帶 `raw` 與 `usbrt`（USB 往返次數），網頁的耗時紀錄據此標出走了哪條路。
 *   🔴 查證結論（反組譯實查，附行號）：PQ Tool 的讀取**也不是 burst** ——
 *     `I2C_tool/xCtrl_I2C_App.cs:73` 資料相位 options=11u(0x0B)，沒有 FAST_TRANSFER。
 *     它不慢只是因為 `RaydiumEM02A1.cs:220` `new byte[48]`：**一次只讀 48 byte**
 *     （全庫最大 228）。48 byte 逐 byte 讀約 0.1 秒，4096 byte 就是 10~20 秒。
 *     ⇒ **照抄原廠不會變快，原廠沒有這個需求所以沒有答案。**
 * 1.10.0 / proto 3 不變（2026-09-19，照原廠 RomCode UI 的標準操作放寬）：
 *   - 單次讀取上限 1024 ⇒ **4096**（`DGH_READ_MAX`）。原廠標準操作就是
 *     「slave 0x50、offset 寬度 2、一次讀 4096」，沒有 chunk 迴圈
 *     （`RomCodeProcessUI.py:30842` 與 `:31669`）。1024 是我們自己加的。
 *   - 回覆緩衝區 8192 ⇒ 24576：4096 個數字的 JSON 陣列約 16.4 KB，
 *     8192 會**安靜截斷**成壞掉的 JSON。
 *   - raw 路徑的命令／輸入緩衝區改 static 並依 DGH_READ_MAX 算大小
 *     （4096 byte 的 MPSSE 命令約 50 KB，放堆疊會爆）。
 *   🔴 **查證更正**：我們用的 libMPSSE **自己就呼叫了**
 *     `FT_SetUSBParameters(handle, 65536, 65536)`（`_FT_InitChannel` 內，
 *     rva 0x26CB/0x26D3），與原廠 DLL 的 (65536, 65535) 實質相同。
 *     ⇒ 「我們沒設 USB buffer 所以慢」是**錯的**，不得當成加速理由。
 * 🔴 exe 內容改變 ⇒ SHA 變 ⇒ 使用者要重新過一次 SmartScreen。
 *    （實測：同一份原始碼用同一個 zig 重編兩次，SHA 也不同 —— 這個編譯流程不是
 *      可重現建置，所以「只要動 exe 就一定要重過」，沒有例外。） */
/* 1.12.0 / proto 3 不變（2026-09-19，Bruce「原廠路徑下改 bit 核取方塊會跳紅字」）：
 *   - 🔴 **實作原廠 DLL 的寫入**（`vendor_write` ⇒ `SendBytesEx`）。v1.14.x 之後
 *     原廠路徑成為採用的讀取後端，而寫入還停在「拒絕並請使用者關掉快速模式」
 *     ⇒ 逐格改值、位元核取方塊、整批寫入**全部不能用**。那是功能退步。
 *   - 🔴 **這一層不做分段**（Bruce 更正：「只有 EEPROM 才需要分段」）。原廠 Python
 *     的 `div=32` 是 EEPROM 的 page size，不是通則。網頁已經依 page size 切好，
 *     bridge 收到的一則就是一段，原樣一次送出。兩處各切一次必然分岔。
 *   - `Detect()` 保留成寫完之後的健康檢查（分辨「送不出去」與「治具不見了」）。
 *   - `SendBytesEx` 的原始回傳值印進 log（語意未確認，判定只用「有沒有回 0」）。
 *   - write／rawwrite 的守門改成 `backend_is_open()`；那句帶實作名詞的拒絕訊息刪除。
 *   - wire format **只有移除一個錯誤回覆**，沒有新增／改變欄位 ⇒ proto 維持 3。 */
/* 1.13.0 / proto 3 不變（2026-09-19，ACK 守衛收緊後的第一次重編）：
 *   - 🔴 **這一版存在的唯一理由是「把 15f7db9 的原始碼變成使用者手上跑的 exe」**。
 *     那個 commit 只改了原始碼，exe 與下載包都沒有重編 ⇒ 收緊完全沒有生效。
 *   - 守衛本體：`dgh_mp_ack_ok()`（`(v & 0x81) == 0`）換成三態 `dgh_mp_ack_kind()`，
 *     ACK 槽只認 0x00（ACK）／0x80（NACK），其餘一律判為位元流異常，
 *     回新錯誤碼 `0xFFFFFFF4`（NACK 仍是 `0xFFFFFFF3`）。read 側的檢查在把資料
 *     複製進 out[] **之前**，壞資料一個 byte 都不交出去。
 *     實證：2026-09-19 的 bridge log，同一次連線兩段 4096 byte 讀回，
 *     位址相位 ACK 分別是 `00 00 00 00`（addr=0x0000）與 `0E 1C 38 70`
 *     （addr=0x1000，每個是前一個左移一位）。後者 `& 0x81` 全為 0
 *     ⇒ 舊判準四個全部放行 ⇒ 4096 byte 壞資料被當好資料回傳。
 *   - 🔴 **大聲失敗**：log 與**回給網頁的 `err` 欄位**都印出「哪一個 ACK 槽／
 *     原始值／slave／addr／長度」＋下一步。v1.12.0 的 read 回覆失敗時**只有
 *     `status` 沒有 `err`** ⇒ 使用者畫面上就是一個裸的十進位數字。
 *   - 🔴 **刻意不加旁路開關**：預設關的開關等於沒做這件事。退路是「舊的包還在線上」，
 *     路徑印在啟動橫幅與每一則錯誤訊息裡（`I2C_BRIDGE_FALLBACK_PKG`）。
 *   - ⚠️ 已知風險，**只有硬體端能確認**：若 FTDI 在 1-bit 讀回時 bit0–bit6 是
 *     未定義殘值，收緊後每一次讀都會被擋。目前只有一個正面樣本
 *     （第一段讀回的 `00 00 00 00`）⇒ 不能宣稱讀取已正常。
 *   - 時序／three-phase／`ck_delay` **一律未動**，波形與 v1.12.0 相同。
 *   - wire format 只有**新增**一個選填的 `err` 欄位 ⇒ proto 維持 3。 */
#define I2C_BRIDGE_VERSION "1.13.0"
#define I2C_BRIDGE_PROTO   3
/* 🔴 上一個已知可用的下載包。出現在啟動橫幅與每一則 ACK 錯誤訊息裡 ——
   使用者被新守衛擋住時，這是他當場就能走的退路，不必等人回訊息。
   v1.12.0 的檔案**刻意保留不刪**。 */
#define I2C_BRIDGE_FALLBACK_PKG \
    "https://brucecheng0428.github.io/tcon-tools/data/i2c-bridge-v1.12.0.zip"
#endif
