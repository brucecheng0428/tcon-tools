#ifndef DG_HELPER_VERSION_H
#define DG_HELPER_VERSION_H
/* helper 版本與協定版本分離：
 * - DG_HELPER_VERSION：每次改 helper 都動（使用者要重下載＝重過 SmartScreen）
 * - DG_HELPER_PROTO  ：只有 wire format 真的改了才動；網頁靠這個判相容 */
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
 * 🔴 exe 內容改變 ⇒ SHA 變 ⇒ 使用者要重新過一次 SmartScreen。 */
#define DG_HELPER_VERSION "1.5.0"
#define DG_HELPER_PROTO   2
#endif
