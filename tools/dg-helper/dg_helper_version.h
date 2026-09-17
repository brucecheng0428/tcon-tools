#ifndef DG_HELPER_VERSION_H
#define DG_HELPER_VERSION_H
/* helper 版本與協定版本分離：
 * - DG_HELPER_VERSION：每次改 helper 都動（使用者要重下載＝重過 SmartScreen）
 * - DG_HELPER_PROTO  ：只有 wire format 真的改了才動；網頁靠這個判相容 */
#define DG_HELPER_VERSION "1.0.0"
#define DG_HELPER_PROTO   1
#endif
