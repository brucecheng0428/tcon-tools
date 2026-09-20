/* ═══════════════════════════════════════════════════════════════
   TCON FAE 工具箱 — 版本號單一來源（version.js）
   所有頁面的版本 badge 從這裡讀取，改版只需改這一個檔案。
   必須在 common.js 之前載入。
   ═══════════════════════════════════════════════════════════════ */

var TOOL_VERSIONS = {
  app:     'v1.92.3',      // 首頁 app 總版號
  rxtx:    'v1.13.0',      // Rx/Tx 頻率計算工具
  calc:    'v1.6.0',       // mLVDS Skew 計算工具
  isp:     'v1.20.0',      // iSP 波形產生器
  aux:     'v2.10.1',     // eDP AUX / DPCD 查詢工具
  wfg:     'v4.53.0',     // 面板訊號模擬與取樣
  pattern: 'v3.8.2',       // Pattern Generator 畫面產生器
  dg:      'v1.68.1',      // Digital Gamma 迭代校正（含量測頁 dg-measure.html）
  i2c:     'v1.25.1',       // I2C（讀寫測試）
  /* 🔴 TCON 自檢畫面量測（dg-selftest.html）。
     這一頁**還沒登記在首頁**（入口與 dg-measure 的拆除是下一階段），所以
     `app` 這一輪不動 —— 首頁上看不到任何新東西。等入口接上去再依
     docs/VERSIONING.md §2 案例 12 把 app 進一次 MINOR。 */
  dgself:  'v1.6.0',       // TCON 自檢畫面量測（由 TCON 自己出圖）
  // 🔴 臨時診斷頁（fstest.html），不在首頁登記、使用者看不到它的版號徽章。
  //    全螢幕 not granted 的根因定位完就會連同這一行一起刪除。
  fstest:  'v1.0.0'        // 全螢幕變因對照測試（臨時，測完即刪）
};

/* ═══════════════════════════════════════════════════════════════
   I2C Bridge 下載包的**單一來源**（2026-09-18）

   🔴 v1.7.0 起這支程式叫 **I2C Bridge**（舊名 helper）。Bruce：「helper 的字樣
      是不是其實不夠貼切？它的功能應該是 I2C 的 bridge」—— 完全正確，它本來就
      不專屬於 dg，而且「helper」沒有告訴任何人它在做什麼。
      變數名 `HELPER_PKG` 與 wire 欄位 `helper` **刻意保留**：前者是內部識別字
      （改了要動兩頁十幾處，對使用者零差別），後者是協定欄位（改了會讓新舊版
      互接時版本顯示變成 undefined）。使用者看得到的字樣一律是 I2C Bridge。

   `dg-measure.html` 與 `i2c.html` 都要顯示下載連結與雜湊。原本只有
   dg-measure 有，而且數字是硬編在那一頁裡 —— 第二頁要用就得複製一份，
   複製出來的數字遲早會不同步（`?v=` cache buster 早就吃過這個虧）。
   一律從這裡讀，任何一頁都不准再寫第二份字面值。

   🔴 **`pkg` 與 `exe` 是兩個不同的版本，不要混用。**
      `pkg` ＝ zip 的版本（＝檔名）。只要包內任何一個檔改了就要換，
             因為換檔名是讓瀏覽器與使用者確實拿到新包的唯一可靠方式。
      `exe` ＝ 編進 exe 的 `DG_HELPER_VERSION`，也是 helper 透過
             `ping` 回報的那個字串。**exe 沒重編就不會變。**
      這兩個在歷史上已經分岔過：v1.3.0 → v1.3.1 → v1.3.2 三個包的
      exe 全部是 byte-identical 的 `1.3.0`，但畫面上只顯示 `pkg`，
      所以「頁面說 v1.3.2、helper 自報 1.3.0」看起來像 bug 其實不是。
      現在兩個都存、畫面兩個都顯示，這個歧義就消失了。
   ═══════════════════════════════════════════════════════════════ */
var HELPER_PKG = {
  /* 🔴 v1.7.0（2026-09-18）：exe **有動**（拿掉自動開瀏覽器、靜態檔服務改成
     預設關閉）⇒ SHA 變 ⇒ 使用者要重新過一次 SmartScreen。
     包內也從四個檔縮成兩個：**只有 exe ＋ libMPSSE.dll**，不再附 html。 */
  /* 🔴 v1.11.2 起包內是**三個檔**：exe ＋ libMPSSE.dll ＋ **ftd2xx.dll**。
     ftd2xx.dll 是 D2XX 介面本體，快速讀取路徑要靠它的 FT_Write／FT_Read。
     依 FTDI TN_153，隨應用程式附帶 D2XX 是官方支持的做法。
     載入順序：**先系統已安裝的，載不到才用包內這一份**（見 i2c_bridge.c）。
     ftd2xx.dll 419,256 bytes，
     SHA256 46cff89a3de8db52ca2967c11235c010fdba7e823539245c85a0af28f2516577

   🔴 v1.11.8 起包內是**四個檔**，多了 **`DLL_I2C_BCB.dll`**（原廠 I2C DLL）。
      Bruce 2026-09-19：「為什麼你自己不先把電腦上的 DLL_I2C_BCB.dll 先找到，
      然後包在那個壓縮檔裡面呢？」—— 完全正確，而且這與我們對 libMPSSE.dll、
      ftd2xx.dll 的做法本來就一致。我先前做了一套跨磁碟遞迴搜尋＋環境變數＋ini，
      **而正解只是把檔案放進 zip**。搜尋保留當備援，載入時 **exe 同目錄優先**。
      來源：`TCON/TCON_UI/EM02/Raydium_TCON_Tool_EM02_v0.4.0/DLL_I2C_BCB.dll`
      69,120 bytes，coff-i386（32 位元，與我們的 bridge 相符）
      SHA256 d441d08edb9b4c6ba411493567c38f6f8d2dce2cc0ed4d12240a38dac3b63c4b
      （與 `EM01/Raydium_TCON_Tool_RM80100_v0.3.35/` 那份**雜湊相同**，兩處交叉驗證）
      ⚠️ 不是 `Python_Jacky/DLL_I2C_BCB_DEMO_20220606/` 那份（64,512 bytes，舊版），
         也不是 `DLL_I2C_BCB_64.dll`（64 位元，載不進 32 位元的 bridge）。 */
  /* 🔴 v1.12.0（2026-09-19）：exe **有動** —— 原廠 DLL 的寫入（SendBytesEx）
     接上去了。v1.14.x 之後原廠路徑是採用中的讀取後端，而寫入還停在拒絕狀態，
     等於整個寫入功能不能用。⇒ 使用者要重新過一次 SmartScreen。 */
  /* 🔴 v1.13.0（2026-09-19）：exe **有重編** —— 這一版存在的唯一理由就是
     「把收緊過的 ACK 守衛變成 Bruce 手上真的在跑的 exe」。commit 15f7db9 只動了
     原始碼，exe 與下載包都沒重編，所以那次收緊**一直沒有生效**。
     ⇒ SHA 變 ⇒ 使用者要重新過一次 SmartScreen。
     🔴 **`data/i2c-bridge-v1.12.0.zip` 刻意保留不刪**：收緊只可能讓「本來會過的讀取」
        變成失敗，萬一他那顆晶片正常時 ACK 槽就不是 0x00，新版會擋下每一次讀取。
        舊包留著他才有當場能走的退路，路徑也印在 exe 的啟動橫幅與每一則錯誤訊息裡。
     包內四個檔不變，三支 DLL 是**從 v1.12.0 的包原樣搬過來**（SHA 逐一比對相同，
     見上面各自的紀錄），只有 exe 換掉。 */
  /* 🔴 v1.14.0（2026-09-19）：exe **有重編** —— 單次讀取的長度上限拿掉了。
     Bruce：「不是一次讀 8192 的值，而是一次讀全部我設定的長度值。不一定是 8192 啊，
     萬一我要讀 65536 呢？」「我只要讀到我不要讀的，我再停止回 nack 就好啊」。
     舊碼會把超過 4096 的讀取**靜默夾取**到 4096 再回 `"ok":true`（要 8192 拿到
     4096 而且畫面看起來正常）；現在資料與回覆緩衝區依實際長度動態配置，
     所有剩下的限制一律回明確錯誤。⇒ SHA 變 ⇒ 使用者要重新過一次 SmartScreen。
     🔴 **`data/i2c-bridge-v1.13.0.zip` 與 `v1.12.0.zip` 都刻意保留不刪**：
        前者是「1.14.0 有問題就先退回去」的退路，後者是「ACK 守衛誤殺時」的退路
        （1.13.0 起都有守衛，退到它沒用）。兩個路徑分別印在 exe 的啟動橫幅裡，
        巨集也拆成 `I2C_BRIDGE_PREV_PKG` 與 `I2C_BRIDGE_NOACKGUARD_PKG` 兩個。
     包內四個檔不變，三支 DLL 是**從 v1.13.0 的包原樣搬過來**（SHA 逐一比對相同：
     libMPSSE 916584df…、ftd2xx 46cff89a…、DLL_I2C_BCB d441d08e…），只有 exe 換掉。
     ⚠️🔴 **未驗證**：一次讀超過 4096（乃至 65535）在真實硬體上會不會成功，
        只有 Bruce 的機器能確認 —— 本版不得宣稱它會成功。 */
  /* 🔴 v1.15.0（2026-09-20）：exe **有重編** —— 新增 `batchwrite`，EEPROM 整批寫入
     改成**一次請求**交給 bridge，由它自己分頁、自己等 tWR。
     依據是 Bruce 2026-09-19 的實測分層（8192 byte / 32 byte 一段 ＝ 256 段）：
     每段 `ws=8~13ms`／`dev=4.5~5ms`／`wait=5~6ms`，其中 **`ws − dev` ＝ 4~8 ms
     就是網頁↔bridge 的往返開銷**（WebSocket＋JSON＋await），×256 ⇒ 是最大的一塊，
     而且是純軟體。改動後往返 **256 → 1**（tools/i2c-bridge/test/test_server.c §11
     用真 socket 量出這個數字，i2c_tool_selftest.js 第 63 組在網頁端量同一件事）。
     🔴 **實際的段間距會降到多少，只有 Bruce 的硬體能量** —— 本版不得宣稱毫秒數。
     🔴 進度與中止**沒有消失**：bridge 過程中主動送 `progress`（時間節流，
        8192 byte／tWR 5 ms 實測 15 則），網頁送 `abortwrite` 可在分頁邊界停，
        中止後回報「寫到哪個位址為止、後面沒寫」。
     🔴 順手修掉一個既有的安靜 bug：`ws_send_text` 對 ≥ 64 KB 的回覆長度欄溢位
        （自 1.14.0 拿掉讀取長度上限起就存在，讀 20000 byte 就會踩到）。
     🔴 proto 3 ⇒ **4**（多了兩個命令與一個主動推送的訊息型別）。網頁端仍只要求
        proto ≥ 2；整批寫入另外用 proto ≥ 4 判斷，**拿著舊 exe 的人自動走舊路**。
     🔴 **`data/i2c-bridge-v1.14.0.zip`／`v1.13.0.zip`／`v1.12.0.zip` 一律保留不刪**
        （依 Bruce 裁示：舊包是他在外地時當場能走的退路）。
     包內四個檔不變，三支 DLL 是**從 v1.14.0 的包原樣搬過來**（逐位元組 cmp 相同、
     SHA 逐一比對相同：libMPSSE 916584df…、ftd2xx 46cff89a…、DLL_I2C_BCB d441d08e…），
     只有 exe 換掉。exe 驗證：`file` ⇒ PE32 executable (console) Intel 80386，
     machine 0x014c、subsystem 3。 */
  /* 🔴 v1.15.1（2026-09-20）：exe **有重編** —— tWR 的等待不再用 `Sleep`。
     根因是 Bruce 的實機 log 自己的分項，不是推論：`batch : DONE -- 256/256
     segments, 8192/8192 bytes, 4308 ms total (device 1400 ms, tWR 2846 ms)`
     ⇒ tWR **2846 ÷ 255 ＝ 每次 11.2 ms，而要求值是 5 ms**（2.2 倍）；
     `SendBytesEx` 自己是 1400 ÷ 256 ＝ 5.5 ms。`batch_wait_twr()` 在 ackpoll
     關閉（預設）時做的就是 `Sleep(5)` ⇒ **這台機器上 Sleep 的解析度不是 1 ms。**
     這也解釋了 v1.15.0 整批化之後反而更慢：舊路徑的 5 ms 等待在**瀏覽器**
     （`setTimeout(5)` 約就是 5 ms），搬進 bridge 變 11.2 ms ⇒ 省下的 255 次
     往返被多出來的 6.2 ms × 255 ≈ 1.6 s 吃光還有找。
     🔴 改成**高解析度可等待計時器**（CreateWaitableTimerExW ＋
        CREATE_WAITABLE_TIMER_HIGH_RESOLUTION）＋ 最後 0.3 ms 用 QPC 自旋補足；
        建不起來就退回 Sleep，並在 log 與結果裡標明走了哪一條。
     🔴 **等待只能 ≥ 要求值**（tWR 是裝置規格，等不夠是靜默寫不進去）——
        tools/i2c-bridge/test/test_wait.c 32 項逐次釘住，含退路那一條。
     🔴 開機自檢**不再印假設**：v1.15.0 橫幅寫死「Sleep(1) is now ~1ms」，
        被這份 log 打臉。改成實測 precise_wait(5)／Sleep(5)／Sleep(1) 的中位數
        並列印出（總成本 < 100 ms）。
     🔴 batchwrite 的結果與 log 多回 twrreqms／twravgms／twrwaits／waitmode。
     🔴 **不得宣稱他那邊的 tWR 現在是幾毫秒** —— 理論上應從 11.2 降到接近 5，
        實際只有他的硬體能量。proto 維持 4（只有新增欄位）。
     🔴 **v1.15.0／v1.14.0／v1.13.0／v1.12.0 的包一律保留不刪**（Bruce 裁示：
        舊包是他在外地時當場能走的退路）。
     包內四個檔不變，三支 DLL 從 v1.15.0 的包**原樣搬過來**，SHA 逐一比對相同：
     libMPSSE 916584df…、ftd2xx 46cff89a…、DLL_I2C_BCB d441d08e…；只有 exe 換掉。
     exe 驗證：`file` ⇒ PE32 executable (console) Intel 80386、machine 0x014c、
     subsystem 3；zip 解出來後四個檔的 SHA256 逐一重算相同。 */
  /* 🔴 v1.16.0（2026-09-20）：exe **有重編**，兩件行為改變 ⇒ 要重新過 SmartScreen。
     ① **offset 寬度放行 3**（24 位元 sub-address）。擋掉 3 的一直是**我們自己**
        （`dgh_awid_ok` 只收 0/1/2/4），不是硬體也不是原廠 DLL。依據是反組譯實查：
        `DLL_I2C_BCB.dll` 的位址相位產生器（0x402208）把位址拆成 4 個 byte 放在
        堆疊上（`-1(%ebp)`＝bit31-24 … `-4(%ebp)`＝bit7-0），再用
        `leal -5(%ebp,%ecx), %edi` 依寬度 n 取起點、**MSB first 送出 n 個** ⇒
        n＝0/1/2/3/4 全部正確；同一段也給出真正的上限：**n ≥ 5 會讀過那個 4 byte
        緩衝區的頭**（送出堆疊垃圾而且不報錯）⇒ 一律擋下並回明確錯誤。
        🔴 順帶修掉一個安靜的錯誤：原廠 DLL 路徑的 `offBytes` 參數本來是
        `(awid<=2)?awid:0xFF`，也就是 **awid=4 會送 255 進去** —— 0xFF 不是拒絕值，
        它會讓 DLL 去送 255 個位址 byte。改成一律送實際寬度。
        ⚠️ 依反組譯，未在硬體上驗證。
     ② **`batchwrite` 新增 `gap`＝目標段間距**，取代 `twr` 的「額外睡多久」語意。
        bridge **自己量**每段的固定開銷（段週期 − 理論匯流排時間 − 上一段的睡眠），
        睡「目標 − 開銷」。🔴 開銷**不是寫死的 4 ms** —— 那個 4 是 Bruce 那台機器
        上量到的，寫死等於又埋一個會過期的魔術數字。
        `gap` 缺席 ⇒ 完全走舊的 `twr` 行為 ⇒ 舊網頁的 wire byte 一個都沒變。
        log 與回覆同時印出**四個數字**：目標／實測開銷／實際睡了多久／實際平均段間距。
     ③ proto 4 → **5**（新增欄位 ＋ 放寬 awid 值域）。網頁仍只要求 proto ≥ 2；
        整批寫入要 ≥ 4；awid 3 與 gap 要 ≥ 5，不到就在畫面上先講清楚。
     🔴 **v1.15.1／v1.15.0／v1.14.0／v1.13.0／v1.12.0 的包一律保留不刪**（Bruce 裁示：
        舊包是他在外地時當場能走的退路）。
     包內四個檔不變，三支 DLL 從 v1.15.1 的包**原樣搬過來**，SHA256 逐一比對相同：
     libMPSSE 916584df…、ftd2xx 46cff89a…、DLL_I2C_BCB d441d08e…；只有 exe 換掉。
     exe 驗證：`file` ⇒ PE32 executable (console) Intel 80386、machine 0x014c、
     subsystem 3；337,408 bytes（v1.15.1 是 333,312）。 */
  pkg:    'v1.16.0',                      // 下載包（zip）版本 ＝ 檔名
  exe:    '1.16.0',                       // exe 內的 I2C_BRIDGE_VERSION（ping 回報值）
  proto:  5,                             // wire protocol 版本（5 起有 awid 3 與 batchwrite 的 gap）
  file:   'data/i2c-bridge-v1.16.0.zip',
  bytes:  404776,                             // zip 位元組數（打包後填）
  zipSha: '19d0aa2f6e0537d81c423b736fee2461da8c196d4b528672577d743a8a189370',
  exeSha: '8182604f113e80d6575fd815ded051cf0b3c09d114c5d46640a77ea6aa3ed48e'
};
