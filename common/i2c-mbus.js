/* ═══════════════════════════════════════════════════════════════════════════
   common/i2c-mbus.js — Check T-CON 之前一律先下的「M-Bus 導通 C-Bus」
   ───────────────────────────────────────────────────────────────────────────
   需求（Bruce 2026-10-08）：「按下 Check T-CON 時，不管搭配是哪個 T-CON，都要
   自動去下 Mbus 導通 Cbus 這個 command」；接 E503 的 M-Bus 時，沒先下這一筆，
   C-Bus 上的 7C／7D／3E 讀不到，Check T-CON 就認不出 E503。

   command 出處（原廠程式，逐字）：RomCodeProcessUI.py V5.0.4
     `i2c_open_mbus_to_cbus()` L31832–31850
       L31834  # E503適用，由MBUS開啟Mbus控制Cbus
       L31838  list_write_data = [0xCD]
       L31839  self.i2c_write_data(0x7E, 1, 0xAB, list_write_data, 32)
     ⇒ slave 0x7E（7-bit）、1-byte offset 0xAB、資料 [0xCD]，一筆，原廠沒有延遲。
   原廠的「Check Flash」鈕（`check_flash()` L6074–6078）也是**先**下這一筆，
   才進 i2c_flash_info → i2c_flash_check_ic_version 讀 7C:95／7C:98 認 IC。

   🔴 同一支原廠函式後半的 3E:0059 ← 1E（L31841–31846）**不在這裡**：那一筆
      只給 RM81000～RM81004（E503，WP 用），EN01 不能下（SY 辨認表 2026-10-06）。
      各頁仍是認到 E503 之後才下，這裡只負責不分型號的那一筆。

   重複下是否無害：原廠在 30 多個讀寫入口（L4840、L6076、L7364 … L32759）
   每次動作前都先呼叫 i2c_open_mbus_to_cbus()，不判斷是否已導通 ⇒ 已導通時
   再下一次是原廠的常態用法（依原始碼；沒有實機量測）。

   寫入失敗：回 { ok:false, err }，**不丟例外**；呼叫端照樣往下辨認（EM01 等
   沒有 0x7E 的板子會 NACK，不能因此擋掉辨認），訊息寫進 log，認不出來時
   再把這個原因顯示在畫面上。

   用法：TconMbus.open(write) —— write(slave, awid, addr, bytes) 回 {ok, err}
   或丟例外都可以（i2c.html 的 i2ctDoWrite、datamap 的 rawWrite、dg-selftest
   的 rawwrite 包一層）。所有頁面共用這一支，不各寫一份。
   ═══════════════════════════════════════════════════════════════════════════ */
(function (g) {
  'use strict';
  var CMD = { slave: 0x7E, awid: 1, addr: 0xAB, data: [0xCD] };   /* L31839 */

  /* 三語訊息掛在 I18N 上（t() 呼叫當下才查表）；不動 common/i18n.js。 */
  var KEYS = {
    'tcon.mbusLog': {
      'zh-TW': 'Check T-CON 前先下 M-Bus 導通 C-Bus：0x7E:0xAB ← CD（不分型號）',
      'en': 'Before Check T-CON: M-Bus to C-Bus 0x7E:0xAB ← CD (all T-CON models)',
      'zh-CN': 'Check T-CON 前先下 M-Bus 导通 C-Bus：0x7E:0xAB ← CD（不分型号）'
    },
    'tcon.mbusOk': {
      'zh-TW': '✔ M-Bus 導通 C-Bus 已寫入（0x7E:0xAB ← CD）',
      'en': '✔ M-Bus to C-Bus written (0x7E:0xAB ← CD)',
      'zh-CN': '✔ M-Bus 导通 C-Bus 已写入（0x7E:0xAB ← CD）'
    },
    'tcon.mbusFail': {
      'zh-TW': '✕ M-Bus 導通 C-Bus（0x7E:0xAB ← CD）寫入失敗：{err}。接 E503 的 M-Bus 時會因此認不到 T-CON，請確認治具接線與 I2C Bridge 後再按一次。',
      'en': '✕ M-Bus to C-Bus write (0x7E:0xAB ← CD) failed: {err}. On an E503 M-Bus the T-CON cannot be identified without it; check the fixture wiring and the I2C Bridge, then try again.',
      'zh-CN': '✕ M-Bus 导通 C-Bus（0x7E:0xAB ← CD）写入失败：{err}。接 E503 的 M-Bus 时会因此认不到 T-CON，请确认治具接线与 I2C Bridge 后再按一次。'
    }
  };
  if (typeof g.I18N === 'object' && g.I18N) {
    for (var k in KEYS) if (Object.prototype.hasOwnProperty.call(KEYS, k) && !g.I18N[k]) g.I18N[k] = KEYS[k];
  }

  async function open(write) {
    var r;
    try { r = await write(CMD.slave, CMD.awid, CMD.addr, CMD.data.slice()); }
    catch (e) { return { ok: false, err: String((e && e.message) || e || 'write failed') }; }
    if (r && r.ok === false) {
      return { ok: false, err: String(r.err || (r.status != null ? 'status ' + r.status : 'write failed')) };
    }
    return { ok: true };
  }

  /* ═══ v1.1（Bruce 2026-10-22「所有用到 I2C 的網頁都應該要修正喔，你有做到嗎？」）═══════════════
     連線後第一次 I2C 讀寫前，一律先下 M-Bus 導通 C-Bus。做法只寫在這裡，頁面只呼叫：
       頁面把自己的 WebSocket send 包一層 TconMbus.session(send)，之後每一則訊息都先經過 ensure()——
       ・ping／open／close／note／abortwrite／chandiag（不碰 I2C 匯流排）直接送；open／close 把「這次連線已導通」歸零。
       ・這次連線第一則碰 I2C 的訊息（read／rawwrite／write／batchwrite…）送出前，先送一筆 rawwrite 0x7E:0xAB ← CD。
         那一則本身就是 7E:AB←CD（Check T-CON／TconDetect.detect／dg-selftest 自己下的）⇒ 不重複送。
       ・失敗不中止（沒有 0x7E 的板子會 NACK，例如 MNT），log 記一次，之後照常讀寫。
     出處：RCP2（WPF RomCodeProcessUI）每個 I2C 動作前都送 MbusToCbus（ICDefine.cs:576–580、RegisterModule.cs:36）；
           Python UI i2c_open_mbus_to_cbus（RomCodeProcessUI.py L31832–31839）。
     0x7E 在 I2C 規格是保留位址（1111xxx），一般 EEPROM／PMIC／感測器不會回應 ⇒ I2C 頁的通用讀寫不受影響。
     全站檢查：tools/check_i2c_pages.mjs（Pages 發佈關卡）。 */
  var META = { ping: 1, open: 1, close: 1, note: 1, abortwrite: 1, chandiag: 1, hello: 1 };
  function isCmd(o) {
    return !!o && o.type === 'rawwrite' && (o.slave | 0) === CMD.slave && (o.addr | 0) === CMD.addr &&
      (o.awid == null || (o.awid | 0) === CMD.awid) && Array.isArray(o.data) && o.data.length === 1 && (o.data[0] & 0xFF) === CMD.data[0];
  }
  function session(send, opts) {
    opts = opts || {};
    var st = { open: false, pending: null, last: null, auto: 0, gen: 0 };
    function reset() { st.open = false; st.pending = null; st.gen++; }
    function ensure(obj) {
      var t = obj && obj.type;
      if (t === 'open' || t === 'close') { reset(); return Promise.resolve(null); }
      if (!t || META[t] || st.open) return Promise.resolve(null);
      if (isCmd(obj)) { st.open = true; return Promise.resolve(null); }
      if (!st.pending) {
        var gen = st.gen;
        st.pending = (async function () {
          var r;
          /* autoSending：只在呼叫 send 的同步瞬間為 true（頁面 send 在這一刻把 JSON 交給 WebSocket），
             讓測試夾具分得出「這一筆是自動補的」；送出去的內容與一般 rawwrite 完全相同。 */
          var p;
          try { if (g.TconMbus) g.TconMbus.autoSending = true; p = send({ type: 'rawwrite', slave: CMD.slave, addr: CMD.addr, data: CMD.data.slice(), awid: CMD.awid }); }
          catch (e) { p = Promise.reject(e); }
          finally { if (g.TconMbus) g.TconMbus.autoSending = false; }
          try { r = await p; }
          catch (e) { r = { ok: false, err: String((e && e.message) || e || 'write failed') }; }
          var res = (r && r.ok === false) ? { ok: false, err: String(r.err || (r.status != null ? 'status ' + r.status : 'write failed')) } : { ok: true };
          if (gen === st.gen) { st.open = true; st.last = res; st.auto++; }
          if (opts.log) { try { opts.log(res); } catch (e) {} }
          return res;
        })();
      }
      return st.pending;
    }
    function guarded(obj) { return ensure(obj).then(function () { return send(obj); }); }
    return { send: guarded, ensure: ensure, reset: reset, state: st };
  }
  function autoText(res) {
    return (res && res.ok) ? 'W 0x7E:0xAB <- CD (M-Bus to C-Bus, before the first I2C transfer of this connection)'
      : 'M-Bus to C-Bus 0x7E:0xAB <- CD: no ACK (' + ((res && res.err) || '?') + '); continuing (normal when the board has no M-Bus switch)';
  }

  g.TconMbus = {
    VERSION: '1.1',
    autoSending: false,
    CMD: CMD,
    LOG: 'W 0x7E:0xAB <- CD (M-Bus to C-Bus)',
    open: open,
    session: session,
    isCmd: isCmd,
    autoText: autoText
  };
  if (typeof module === 'object' && module.exports) module.exports = g.TconMbus;
})(typeof window !== 'undefined' ? window : globalThis);
