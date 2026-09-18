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
 * 🔴 exe 內容改變 ⇒ SHA 變 ⇒ 使用者要重新過一次 SmartScreen。 */
#define DG_HELPER_VERSION "1.4.0"
#define DG_HELPER_PROTO   2
#endif
