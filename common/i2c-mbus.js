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

  g.TconMbus = {
    CMD: CMD,
    LOG: 'W 0x7E:0xAB <- CD (M-Bus to C-Bus)',
    open: open
  };
})(typeof window !== 'undefined' ? window : globalThis);
