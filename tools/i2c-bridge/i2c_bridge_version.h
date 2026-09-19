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
/* 1.13.1 / proto 3 不變（2026-09-19，**只有文字與註解**）：
 *   - 🔴 `dgh_mode` 的註解與啟動橫幅與程式碼不符：`int dgh_mode = DGH_MODE_VENDOR;`
 *     早就是預設，橫幅卻還印著 "Vendor path is OPT-IN ONLY (--vendor or open mode:0)
 *     because v1.11.7 crashed after connect... root cause undetermined."
 *     ⇒ 下一個讀 log 的人會以為預設不是 vendor。改成描述現況：預設就是原廠 DLL，
 *     理由是 AN2232C-01（此晶片的 MPSSE 無三相、無開汲極 ⇒ MPSSE 做 I2C 走不通）。
 *   - 🔴 **據實標明**：v1.11.7 當機的疑似根因（vendor typedef 漏 `__stdcall`，
 *     32 位元 x86 上 stdcall 由被呼叫端清堆疊 ⇒ 堆疊失衡 ⇒ 行程死亡）已修正，
 *     但**那次當機從未被重現驗證**，只有「症狀與已證實的缺失一致」。
 *     log 與註解都寫成 NOT REPRODUCED/CONFIRMED，不得寫成已確認。
 *   - `GetClock()` 探針與 `Open()` 失敗降級到 `DGH_MODE_SLOW` 一律保留。
 *   - ⚠️ **行為零改變 ⇒ exe 未重編**。使用者手上的 1.13.0 exe 仍然可用；
 *     這些文字要等下一次重編才會出現在他的 log 裡。`data/*.zip` 未動。 */
/* 1.14.0 / proto 3 不變（2026-09-19，Bruce「為什麼燒錄完後的讀取驗證，不是一次
 *   讀完 8192，而是分 256 byte、256 byte 這樣讀？」→「不是一次讀 8192 的值，
 *   而是一次讀全部我設定的長度值。不一定是 8192 啊，萬一我要讀 65536 呢？」
 *   →「我只要讀到我不要讀的，我再停止回 nack 就好啊」）：
 *   - 🔴🔴 **單次讀取的長度上限整個拿掉。** 他是對的：I2C 循序讀在匯流排上沒有
 *     長度上限，master 讀夠了回 NACK ＋ STOP 就結束。4096 從來不是協定或硬體的
 *     限制，是我們自己加的。
 *   - 🔴 **一個名字被當成兩件事用**，這就是這次搞混的根源。拆開：
 *       `DGH_RAW_READ_MAX` (4096) ＝ **自建 raw MPSSE 的命令緩衝區大小**（靜態
 *          配置，真的是記憶體限制）—— 只有那一條路用，保留。
 *       `DGH_READ_ALLOC_MAX` (262144) ＝ **配置上限**，＝ 網頁的 `I2CT_MAX_LEN`，
 *          防的是壞封包寫 "len":4000000000。**超過回明確錯誤，不夾取。**
 *     舊的 `DGH_READ_MAX` 這個名字已刪除，不留別名 —— 留著就會有人再用錯一次。
 *   - 🔴 **靜默夾取修掉**：舊碼 `if(len>DGH_READ_MAX) len=DGH_READ_MAX;` 會讓
 *     「要 8192、拿到 4096」附帶 `"ok":true`。安靜少給資料比整個失敗還糟，
 *     因為使用者不會知道。所有長度限制現在一律回明確錯誤，訊息帶「上限多少、
 *     下一步怎麼辦、有沒有真的去讀匯流排」。
 *   - 🔴 資料與回覆緩衝區改 **malloc，依實際長度配置**（`static uint8_t
 *     buf[常數]` 拿掉）。回覆 JSON 最壞情況 ＝ 每個資料 byte 4 個字元
 *     （"255" ＋ 逗號）⇒ `len*4 + 1024 + DGH_LASTERR_MAX`。
 *     len=8192 ⇒ 34,392；len=65535 ⇒ 263,764；len=262144 ⇒ 1,050,200 byte。
 *     配置失敗回明確錯誤。讀 3 byte 只配 1,636 byte（以前固定吃 24 KB）。
 *   - 🔴 read 回覆新增 `want` / `got`：少讀時一眼看得出「要幾個、拿到幾個」。
 *     `vendor_read()` 的少讀／異常回傳現在也會填 `err`（以前只有 bridge 那台
 *     機器的 log 檔裡有，網頁端拿到的是一個沒有理由的失敗）。
 *     wire format 只有**新增**欄位 ⇒ proto 維持 3。
 *   - 🔴 `DLL_I2C_BCB.dll` 路徑的**唯一**新上限：`len > 0xFFFF` 明確回錯誤。
 *     依據是簽章 `U16 GetBytesEx(U8 addr, U32 reg, U32 count, U8* data)`
 *     —— **要求長度 32 位元，回報的讀取數量只有 16 位元** ⇒ 65536 會回繞成 0，
 *     「全部成功」與「完全失敗」在回傳值上長得一樣，無法驗證完整性。
 *   - ⚠️🔴 **未驗證、只有硬體端能確認**：`GetBytesEx` 一次到底吃不吃得下超過
 *     4096，**沒有任何證據**（那套 Python UI 的樣本只有 4096）。這一版**沒有**
 *     替它猜上限、也沒有寫死任何「安全值」；它若自己只給一部分，會以
 *     `want`/`got` ＋ partial read 的 `err` 照實回報，讓人一眼分得出是 DLL 擋的
 *     還是我們擋的。**不得宣稱一次讀 8192／65536 在硬體上會成功。**
 *   - 時序／three-phase／`ck_delay`／ACK 守衛**一律未動**，波形與 1.13.x 相同。
 *   - 用詞：「原廠」這個詞同時指過 `DLL_I2C_BCB.dll` 與 FTDI 的
 *     `ftd2xx.dll`／`libMPSSE.dll`，Bruce 被它搞混過 ⇒ 註解與 log 一律改寫檔名。 */
/* 1.15.0 / **proto 4**（2026-09-19，Bruce：「把 EEPROM 整批寫入的段間距從約 15 ms
 *   壓下來」，做法已核准）：
 *   - 🔴🔴 新增 **`batchwrite`**：一次請求帶整段 payload，**bridge 自己分頁、
 *     自己等 tWR**。往返從 ×256 變成 ×1。
 *     依據是 Bruce 的實測分層：每段 `ws=8~13ms`／`dev=4.5~5ms`／`wait=5~6ms`，
 *     其中 **`ws − dev` ＝ 4~8 ms 就是網頁↔bridge 的 WebSocket＋JSON＋await
 *     往返開銷**，×256 次 ⇒ 是 15 ms 裡最大的一塊，而且是純軟體。
 *     （`dev` 的 4.5~5 ms 裡理論匯流排只佔 0.79 ms ＝ 35 byte × 9 bit ÷ 400 kHz，
 *       其餘是每次 DLL／USB 呼叫的固定成本 —— 那一塊這一版動不了。）
 *     🔴 **實際的段間距會降到多少，只有他的硬體能量。** 本版只證明了
 *        「往返次數 256 → 1」（test_server §11 實測印出數字），
 *        **不得宣稱段間距變成幾毫秒。**
 *   - 🔴 **進度與中止沒有消失**（硬要求）：bridge 過程中主動送 `progress`
 *     （時間節流，預設每 100 ms 最多一則；實測 8192 byte／tWR 5 ms ⇒ 15 則，
 *     每段一則會是 256 則 ＝ 把省下來的往返又加回去）；網頁送 `abortwrite`，
 *     bridge 在**下一個分頁邊界**停。
 *   - 🔴 中止／失敗的回覆一律講清楚**裝置處於什麼狀態**：`segsDone`／`done`／
 *     `lastAddr`／`nextAddr` ＋ 一句「0xAAAA-0xBBBB 寫進去了、0xCCCC 之後沒寫、
 *     現在是半寫完的映像」。半寫完的 EEPROM 使用者必須知道。
 *   - 🔴 **舊的單段 `rawwrite` 一個字都沒動**（逐格即時寫入還要用它）。
 *     網頁靠 `proto >= 4` 決定要不要走新路 ⇒ 拿著舊 exe 的人自動走舊路。
 *   - 🔴 收訊緩衝區改**動態配置**（舊碼是 main 迴圈的 `char msg[8192]`，
 *     batchwrite 一則 40 KB~1.3 MB 連收都收不到）。上限由 payload 上限推導
 *     （262144×4＋4096），超過**明確回錯誤且不斷線**，不是安靜截斷。
 *   - 🔴🔴 **順手修掉一個既有的安靜 bug**：`ws_send_text` 對 ≥ 65536 byte 的回覆
 *     只送 `126` ＋ 兩個 byte 的長度 ⇒ 長度欄溢位成 `n & 0xFFFF`，frame 邊界錯位。
 *     RFC 6455 §5.2 規定 ≥ 65536 要用 `127` ＋ 八個 byte。這條路**自 1.14.0
 *     拿掉讀取長度上限起就存在**（讀 20000 byte 的回覆約 80 KB），收端一直認得
 *     127、只有送端沒有，所以它完全安靜。test_server §10 用真 socket 釘住。
 *   - ACK polling（資料手冊建議的做法）：**做成預設關閉的選項 `"ackpoll":1`**。
 *     🔴 `DLL_I2C_BCB.dll` 只匯出 9 個函式，**沒有「只送位址看 ACK」的原語**；
 *        最接近的替代是拿 `GetBytesEx(slave, addr, 1, buf)` 讀 1 個 byte 當探針。
 *     🔴 已知的問題：探針自己要花 4.5~5 ms（＝ 每次 DLL／USB 呼叫的固定成本），
 *        而 tWR 本身就是 5 ms ⇒ **成本與整段等待同一個數量級，省不到東西。**
 *     ⚠️ 未知的問題：「忙碌時 GetBytesEx 會回報失敗」**未在硬體上驗證**。
 *     ⇒ 因此加了一道**自我校準**守衛：每一段的第一次探針必須回報忙碌
 *        （剛下完 STOP，裝置一定在燒）；一次就成功 ⇒ 證明探針測不出忙碌 ⇒
 *        這一段補足**完整的固定 tWR** 並寫進 log。把未驗證的假設變成程式
 *        每一段都在檢查的東西，而不是賭它成立。
 *     🔴 **沒有把 tWR 改短。** tWR 是裝置規格，寫太快是靜默寫不進去。
 *   - proto 進 4 的理由：多了 `batchwrite`／`abortwrite` 兩個命令型別與
 *     `progress` 這個**主動推送**的訊息型別 ⇒ 依 C2 的反面（wire format 真的變了）。
 *     🔴 網頁端仍只要求 `proto >= 2`（rawwrite 那條路完全沒變），
 *        batchwrite 另外用 `proto >= 4` 判斷 —— 不讓拿著舊 exe 的人整條路斷掉。 */
#define I2C_BRIDGE_VERSION "1.15.0"
#define I2C_BRIDGE_PROTO   4
/* 🔴 batchwrite 需要的 proto 下限。網頁用它決定走新路還是舊的逐段 rawwrite，
   寫成一個名字而不是在兩邊各寫一個 `4`。 */
#define I2C_BRIDGE_PROTO_BATCHWRITE 4
/* 🔴🔴 1.14.0：這裡本來只有**一個** `I2C_BRIDGE_FALLBACK_PKG`，同時被兩種意思用，
   而那兩種意思在這一版分岔了。拆成兩個，不要再共用一個名字（這一版的主題就是
   「一個名字被當成兩件事用」，不要在同一次改動裡又留一個）。

   (1) 「上一個版本」——啟動橫幅與『新版有問題就先退回去』的泛用退路。
       1.14.0 的上一個是 **v1.13.0**。 */
/* 🔴 1.15.0：上一個版本是 **v1.14.0**（1.14.0 時這裡指 v1.13.0）。 */
#define I2C_BRIDGE_PREV_PKG \
    "https://brucecheng0428.github.io/tcon-tools/data/i2c-bridge-v1.14.0.zip"
/* (2) 「**沒有 ACK 守衛**的那一版」——只出現在 ACK 守衛擋下讀寫時的錯誤訊息裡。
       它的意思不是「上一版」，而是「**這道守衛不存在的那一版**」：使用者若判斷
       是守衛誤殺，他要的是一個不做這個檢查的 exe。
       🔴 所以它**必須停在 v1.12.0**，不能跟著版號往前走 —— v1.13.0 起都有守衛，
          指過去等於叫他換一個會用同樣理由擋下他的版本。
       `data/i2c-bridge-v1.12.0.zip` 因此**刻意保留不刪**。 */
#define I2C_BRIDGE_NOACKGUARD_PKG \
    "https://brucecheng0428.github.io/tcon-tools/data/i2c-bridge-v1.12.0.zip"
#endif
