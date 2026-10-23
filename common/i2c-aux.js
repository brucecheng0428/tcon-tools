/* ═══════════════════════════════════════════════════════════════════════════
   common/i2c-aux.js — DP AUX 連線方式（I2C and AUX Bridge 1.18.0 起，open mode 4）網頁端共用規則
   ───────────────────────────────────────────────────────────────────────────
   Bruce 2026-10-23：「AUX bridge 可以的話跟 i2c bridge 做在一起，用一套轉發就好」
                     「先用 I2C 網頁加入 AUX 控制（但一定要透過 tcon 來控制 i2c，不能直接對 eeprom 也寫入）」
   ⇒ 同一支 I2C and AUX Bridge、同一條 WebSocket、同一組 read／rawwrite／write／batchwrite 訊息；
     選 DP AUX 時 bridge 依 slave 路由到顯示卡 AUX（3E／7C 走 DPCD 視窗、7D／7E 走 I2C-over-AUX）。

   🔴 安全規則有兩道，內容一致：
     ・網頁（本檔 TconAux.check）：送出前擋，訊息三語。
     ・bridge（tools/i2c-bridge/i2c_bridge_aux.h dgh_aux_check）：網頁整個壞掉也擋得住。
     白名單只有 T-CON 的 slave：0x3E、0x7C、0x7D、0x7E。EEPROM 0x50–0x57 讀寫一律擋；
     其他 slave 也擋（AUX 只到得了 T-CON）。DPCD 寫入擋 0x480–0x48F（T-CON 的 EEPROM 控制窗）。
     tools/check_i2c_aux.mjs 比對兩份清單一致。

   API（window.TconAux）：
     MODE（4）、NEED_PROTO（7）、SLAVES、EE_LO／EE_HI、DPCD_EE_LO／DPCD_EE_HI
     allowed(slave)            這個 slave 在 AUX 模式能不能用
     check(msg)                送出前檢查一則 bridge 訊息；可以送回 null，不行回 { code, slave }
     text(code, vars)          錯誤／說明文字（依 <html lang>）
     dpcdWriteOk(addr, n)      raw DPCD 寫入是否放行
   ═══════════════════════════════════════════════════════════════════════════ */
(function (g) {
  'use strict';
  var SLAVES = [0x3E, 0x7C, 0x7D, 0x7E];
  var EE_LO = 0x50, EE_HI = 0x57, DPCD_EE_LO = 0x480, DPCD_EE_HI = 0x48F;
  var BUS = { read: 1, rawwrite: 1, write: 1, batchwrite: 1 };
  var T = {
    ee: ['DP AUX 模式不能直接存取 EEPROM（slave 0x{s}）：EEPROM 只能透過 T-CON 控制。這一筆沒有送出。',
         'DP AUX mode cannot access the EEPROM directly (slave 0x{s}): the EEPROM may only be reached through the T-CON. Nothing was sent.',
         'DP AUX 模式不能直接存取 EEPROM（slave 0x{s}）：EEPROM 只能通过 T-CON 控制。这一笔没有送出。'],
    notTcon: ['DP AUX 模式只到得了 T-CON（0x3E、0x7C、0x7D、0x7E），slave 0x{s} 不行。這一筆沒有送出。',
              'DP AUX mode only reaches the T-CON (0x3E, 0x7C, 0x7D, 0x7E); slave 0x{s} is not allowed. Nothing was sent.',
              'DP AUX 模式只到得了 T-CON（0x3E、0x7C、0x7D、0x7E），slave 0x{s} 不行。这一笔没有送出。'],
    awid: ['DP AUX 模式：slave 0x{s} 的 offset 寬度要 {w} byte。這一筆沒有送出。',
           'DP AUX mode: slave 0x{s} needs a {w}-byte offset. Nothing was sent.',
           'DP AUX 模式：slave 0x{s} 的 offset 宽度要 {w} byte。这一笔没有送出。'],
    xport: ['連線方式', 'Connection', '连接方式'],
    jig: ['I2C 治具', 'I2C jig', 'I2C 治具'],
    aux: ['DP AUX（顯示卡）', 'DP AUX (graphics card)', 'DP AUX（显卡）'],
    tipX: ['DP AUX：不用治具，經筆電的顯示卡直接讀寫面板上的 T-CON；只能讀寫 T-CON，不能直接寫 EEPROM。',
           'DP AUX: no jig; reads and writes the panel T-CON through this computer\'s graphics card. T-CON only; the EEPROM cannot be written directly.',
           'DP AUX：不用治具，经笔电的显卡直接读写面板上的 T-CON；只能读写 T-CON，不能直接写 EEPROM。'],
    reconnect: ['連線方式已改，請重新按「連線」。', 'Connection type changed. Press Connect again.', '连接方式已改，请重新按「连接」。'],
    oldBridge: ['這個 I2C and AUX Bridge（{have}）不支援 DP AUX，請下載新版 I2C and AUX Bridge（1.18.0 以上）。',
                'This I2C and AUX Bridge ({have}) does not support DP AUX. Download the new I2C and AUX Bridge (1.18.0 or later).',
                '这个 I2C and AUX Bridge（{have}）不支持 DP AUX，请下载新版 I2C and AUX Bridge（1.18.0 以上）。'],
    info: ['DP AUX：{card} · 螢幕 {mon}', 'DP AUX: {card} · display {mon}', 'DP AUX：{card} · 屏幕 {mon}'],
    adminOk: ['系統管理員 ✔', 'administrator ✔', '系统管理员 ✔'],
    adminNo: ['不是系統管理員', 'not administrator', '不是系统管理员'],
    psrOff: ['PSR 已關（關閉連線時還原）', 'PSR off (restored on disconnect)', 'PSR 已关（关闭连接时还原）'],
    psrOffNat: ['PSR 關', 'PSR off', 'PSR 关'],
    psrOn: ['PSR 開著', 'PSR on', 'PSR 开着'],
    bnAdmin: ['Intel 顯示卡的 AUX 寫入要系統管理員：關掉 I2C and AUX Bridge 黑視窗，在 i2c-bridge.exe 按右鍵 →「以系統管理員身分執行」，再回來按連線。讀取不受影響。',
              'Intel graphics need administrator rights for AUX writes: close the I2C and AUX Bridge window, right-click i2c-bridge.exe → "Run as administrator", then press Connect again. Reads are not affected.',
              'Intel 显卡的 AUX 写入要系统管理员：关掉 I2C and AUX Bridge 黑窗口，在 i2c-bridge.exe 按右键 →「以管理员身份运行」，再回来按连接。读取不受影响。'],
    bnPsr: ['PSR（面板自我更新）還開著，AUX 寫入可能失敗。', 'PSR (panel self refresh) is still on; AUX writes may fail.', 'PSR（面板自我刷新）还开着，AUX 写入可能失败。'],
    eeOff: ['DP AUX 模式不能直接讀寫 EEPROM（只能透過 T-CON）', 'Not available in DP AUX mode (EEPROM only through the T-CON)', 'DP AUX 模式不能直接读写 EEPROM（只能通过 T-CON）']
  };
  function langIdx() {
    var l = (g.document && g.document.documentElement && g.document.documentElement.lang) || 'zh-TW';
    return l === 'en' ? 1 : (l === 'zh-CN' ? 2 : 0);
  }
  function text(k, v) {
    var a = T[k]; if (!a) return k;
    var s = a[langIdx()] || a[0];
    if (v) Object.keys(v).forEach(function (n) { s = s.split('{' + n + '}').join(String(v[n])); });
    return s;
  }
  function hex2(n) { return ('0' + ((n | 0) & 0xFF).toString(16).toUpperCase()).slice(-2); }
  function allowed(slave) { return SLAVES.indexOf(slave | 0) >= 0; }
  function awidFor(slave) { return slave === 0x3E ? 2 : (slave === 0x7C ? 1 : 0); }
  function check(msg) {
    if (!msg || !BUS[msg.type]) return null;
    var s = msg.slave | 0;
    if (s >= EE_LO && s <= EE_HI) return { code: 'ee', slave: s, msg: text('ee', { s: hex2(s) }) };
    if (!allowed(s)) return { code: 'notTcon', slave: s, msg: text('notTcon', { s: hex2(s) }) };
    var want = awidFor(s), aw = (msg.awid == null) ? 2 : (msg.awid | 0);
    if (msg.type !== 'write' && want && aw !== want) return { code: 'awid', slave: s, msg: text('awid', { s: hex2(s), w: want }) };
    return null;
  }
  function dpcdWriteOk(addr, n) {
    addr = addr | 0; n = n | 0;
    if (n < 1 || n > 16 || addr < 0 || addr + n - 1 > 0xFFFFF) return false;
    return (addr + n - 1 < DPCD_EE_LO) || (addr > DPCD_EE_HI);
  }
  g.TconAux = {
    VERSION: '1.0', MODE: 4, NEED_PROTO: 7,
    SLAVES: SLAVES.slice(), EE_LO: EE_LO, EE_HI: EE_HI, DPCD_EE_LO: DPCD_EE_LO, DPCD_EE_HI: DPCD_EE_HI,
    allowed: allowed, awidFor: awidFor, check: check, text: text, dpcdWriteOk: dpcdWriteOk
  };
  if (typeof module === 'object' && module.exports) module.exports = g.TconAux;
})(typeof window !== 'undefined' ? window : globalThis);
