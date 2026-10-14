/* ═══════════════════════════════════════════════════════════════════════════
   syscrc.js — EM01／EM02 SYS CRC 第二道確認（v1.0.0，2026-10-14）
   ───────────────────────────────────────────────────────────────────────────
   型號仍由各頁原本的方式判斷（datamap-core locate、wfg codec）；這支只在判斷完後驗 SYS 區 CRC：
     match    ＝ 存值＝計算值 ⇒ 確認型號
     blank    ＝ 存值 0000／FFFF（V512 這類）⇒ 照舊、不提醒
     mismatch ＝ 不符 ⇒ 不擋路提醒；others＝其他型號位置有沒有吻合，空＋EM01 Flash ⇒ notRaydium（可能不是瑞鼎 code）
   出處：Jacky 10/14 信＋EM01／EM02 UI App/RApp_Common.cpp RApp_Common_CRC16（初值 0x0052、LSB 存前）；
   crc16 逐字移植自 ~/TCON/TCON設定相關/Jacky_20261014_1512/em_syscrc_probe.js（1249 個 bin：EM02 132、EM01 EEPROM 66、EM01 Flash 157 吻合，互認錯 0）。
   位置（皆從檔案 0 起算）：EM02 SYS 0x00～0x87、CRC 0x88；EM01 EEPROM 0x00～0xBF、CRC 0xC0；EM01 Flash 0x00～0xF1、CRC 0xF2。
   瀏覽器 window.TCONSysCrc，node module.exports。
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  function crc16(b, s, len) {
    var o = 0x0052;
    for (var p = s; p < s + len; p++) {
      var bp = b[p];
      var O = function (k) { return (o >> k) & 1; }, I = function (k) { return (bp >> k) & 1; };
      var x = function (a) { return a.reduce(function (u, v) { return u ^ v; }, 0); };
      var n = [];
      n[15] = x([O(0),O(1),O(2),O(3),O(4),O(5),O(6),O(7),O(8),O(9),O(10),O(11),O(12),O(14),O(15),I(0),I(1),I(2),I(3),I(4),I(5),I(6),I(7)]);
      n[14] = O(12) ^ O(13); n[13] = O(11) ^ O(12); n[12] = O(10) ^ O(11); n[11] = O(9) ^ O(10); n[10] = O(8) ^ O(9);
      n[9] = O(7) ^ O(8) ^ I(7);
      n[8] = O(6) ^ O(7) ^ I(6) ^ I(7);
      n[7] = O(5) ^ O(6) ^ I(5) ^ I(6);
      n[6] = O(4) ^ O(5) ^ I(4) ^ I(5);
      n[5] = O(3) ^ O(4) ^ I(3) ^ I(4);
      n[4] = O(2) ^ O(3) ^ I(2) ^ I(3);
      n[3] = O(1) ^ O(2) ^ O(15) ^ I(1) ^ I(2);
      n[2] = O(0) ^ O(1) ^ O(14) ^ I(0) ^ I(1);
      n[1] = x([O(1),O(2),O(3),O(4),O(5),O(6),O(7),O(8),O(9),O(10),O(11),O(12),O(13),O(14),I(1),I(2),I(3),I(4),I(5),I(6),I(7)]);
      n[0] = x([O(0),O(1),O(2),O(3),O(4),O(5),O(6),O(7),O(8),O(9),O(10),O(11),O(12),O(13),O(15),I(0),I(1),I(2),I(3),I(4),I(5),I(6),I(7)]);
      o = n.reduce(function (u, v, k) { return u | (v << k); }, 0);
    }
    return o;
  }
  /* CRC 位置＝SYS 長度（SYS 0..len-1，CRC 在 len、len+1） */
  var SPOTS = [
    { id: 'EM02', model: 'EM02', kind: 'eeprom', len: 0x88 },
    { id: 'EM01', model: 'EM01', kind: 'eeprom', len: 0xC0 },
    { id: 'EM01F', model: 'EM01', kind: 'flash', len: 0xF2 }
  ];
  var FLASH_MIN = 0x40000;   // 與 datamap-core EM01_FLASH_MIN 相同
  function spotOf(model, kind) {
    for (var i = 0; i < SPOTS.length; i++) if (SPOTS[i].model === model && SPOTS[i].kind === kind) return SPOTS[i];
    return null;
  }
  function stored(b, L) { return b[L] | (b[L + 1] << 8); }
  function hits(b, L) { return b.length >= L + 2 && crc16(b, 0, L) === stored(b, L); }
  /* bytes：Uint8Array／Array；model：'EM01'／'EM02'；kind：'eeprom'／'flash'（省略＝依大小，≥256KB 為 flash）。
     回傳 null＝這個型號沒有 SYS CRC（NB、E512、EN01…）。 */
  function sysCrcCheck(bytes, model, kind) {
    if (!bytes) return null;
    if (kind !== 'eeprom' && kind !== 'flash') kind = bytes.length >= FLASH_MIN ? 'flash' : 'eeprom';
    var S = spotOf(model, kind);
    if (!S || bytes.length < S.len + 2) return null;
    var st = stored(bytes, S.len), calc = crc16(bytes, 0, S.len);
    var r = { status: 'match', model: model, kind: kind, at: S.len, stored: st, calc: calc, others: [], notRaydium: false };
    if (st === calc) return r;
    if (st === 0x0000 || st === 0xFFFF) { r.status = 'blank'; return r; }
    r.status = 'mismatch';
    SPOTS.forEach(function (O) { if (O !== S && hits(bytes, O.len)) r.others.push(O.id); });
    r.notRaydium = (model === 'EM01' && kind === 'flash' && !r.others.length);
    return r;
  }
  var API = { crc16: crc16, sysCrcCheck: sysCrcCheck, SPOTS: SPOTS };
  if (typeof module === 'object' && module.exports) module.exports = API;
  else root.TCONSysCrc = API;
})(typeof window !== 'undefined' ? window : this);
