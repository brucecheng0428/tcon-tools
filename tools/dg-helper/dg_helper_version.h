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
 * 1.6.0 / proto 3（2026-09-18，Bruce「helper 只要開一次就好、切到哪頁哪頁自動接手」）：
 *   - 🔴 新增 `lock` 命令：持有者可以把自己標成「忙碌中」，此時**別人的 takeover
 *     會被拒絕**（回 busy:true + locked:true）。存在的理由只有一個 —— dg 正在跑
 *     Gray 0~255 量測時，使用者切到別的分頁不可以把那條量測打斷。
 *   - hello／pong 多回 `locked`，頁面才知道拒絕的理由是「對方忙」不是「對方在」
 *   - wire format 只有**新增**命令與新回傳欄位，舊頁面完全不受影響；但因為多了
 *     一個命令型別，依 C2「只有 wire format 真的改了才動」的反面 ⇒ proto 進 3。
 *     🔴 網頁端仍只要求 proto ≥ 2 —— lock 是選配，沒有它只是少一道保護，
 *     不該讓拿著舊 helper 的人整條路斷掉。
 * 🔴 exe 內容改變 ⇒ SHA 變 ⇒ 使用者要重新過一次 SmartScreen。
 *    （實測：同一份原始碼用同一個 zig 重編兩次，SHA 也不同 —— 這個編譯流程不是
 *      可重現建置，所以「只要動 exe 就一定要重過」，沒有例外。） */
#define DG_HELPER_VERSION "1.6.0"
#define DG_HELPER_PROTO   3
#endif
