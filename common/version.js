/* ═══════════════════════════════════════════════════════════════
   TCON FAE 工具箱 — 版本號單一來源（version.js）
   所有頁面的版本 badge 從這裡讀取，改版只需改這一個檔案。
   必須在 common.js 之前載入。
   ═══════════════════════════════════════════════════════════════ */

var TOOL_VERSIONS = {
  app:     'v1.92.1',      // 首頁 app 總版號
  rxtx:    'v1.13.0',      // Rx/Tx 頻率計算工具
  calc:    'v1.6.0',       // mLVDS Skew 計算工具
  isp:     'v1.20.0',      // iSP 波形產生器
  aux:     'v2.10.1',     // eDP AUX / DPCD 查詢工具
  wfg:     'v4.47.0',     // 面板訊號模擬與取樣
  pattern: 'v3.8.2',       // Pattern Generator 畫面產生器
  dg:      'v1.67.2',      // Digital Gamma 迭代校正
  i2c:     'v1.13.2',       // I2C（讀寫測試）
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
     SHA256 46cff89a3de8db52ca2967c11235c010fdba7e823539245c85a0af28f2516577 */
  pkg:    'v1.11.2',                      // 下載包（zip）版本 ＝ 檔名
  exe:    '1.11.2',                       // exe 內的 I2C_BRIDGE_VERSION（ping 回報值）
  proto:  3,                             // wire protocol 版本（3 起有 lock：量測中拒絕接手）
  file:   'data/i2c-bridge-v1.11.2.zip',
  bytes:  351209,                             // zip 位元組數（打包後填）
  zipSha: 'e6c5d59ad35e22c8ebab37e697d01c46dc72953b64c6823ab02e5db3fb05383d',
  exeSha: '6ff329335ffe57b34a2572a8c6deb3629d2492dd0c1981fc9c9471e2e21ccb0c'
};
