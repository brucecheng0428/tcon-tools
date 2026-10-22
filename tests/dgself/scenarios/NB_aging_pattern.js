/* NB_aging_pattern.js — dgself v2.9.0：NB T-CON（EN01／E503／E501A／E501B）自檢出圖（模擬 I2C）。
   驗：① 沒有 MNT 0xFF00 命中時用共用 TconDetect 認出 NB 型號、slave 0x3E
       ② 進 aging 的寫入順序：AG_PGEN_PAT＝0 → Pattern 0 R/G/B → AG_PGEN_EN＝1 → AG_INV＝1（AG_INV 最後）
       ③ 每個 byte 只改自己的 bit（RMW），10-bit 值拆 hi 8／lo 2 正確
       ④ 換色只寫 Pattern 0，不再碰 AG_INV／AG_PGEN_EN
       ⑤ 十字：座標 12 bit 打包、CTL EN＝1／MODE＝0（cross）／COLOR＝紅
       ⑥ 離開：AG_INV／AG_PGEN_EN／AG_PGEN_PAT 寫回原值、十字關
       ⑦ 白名單：NB 位址以外一律擋；NB 寫入全走 rawwrite（2-byte）
       ⑧ 12-bit 選項 NB 停用；NB 不讀 MNT 的 0xFF26 解析度
       EM02 情境：MNT 認得出 ⇒ 一筆 NB 讀取都不做、照舊用 write。 */
(async function () {
  await __boot(300);
  var C = window.__nbCase || 'EN01';
  var BOARDS = {
    EN01:  { present: [0x7C, 0x7D, 0x3E], mem: { '124:149': 0x22, '124:152': 0x00, '125:125': 0x0A, '62:8318': 0x10 } },
    E503:  { present: [0x7C, 0x7D, 0x3E], mem: { '124:149': 0x22, '124:152': 0x00, '125:125': 0x03, '62:8318': 0x00 } },
    E501A: { present: [0x7C, 0x7D, 0x3E], mem: { '124:149': 0x00, '124:152': 0x01, '125:30': 0x00 } },
    E501B: { present: [0x7C, 0x7D, 0x3E], mem: { '124:149': 0x41, '124:152': 0x01, '125:127': 0x01 } },
    EM02:  { present: [0x68], mem: {}, ff00: { 0x68: [0x02, 0xEF, 0xA0] } }
  };
  /* 各 NB 的暫存器（照 .model；與頁面的表獨立寫一份，對得上才算過） */
  var REG = {
    EN01:  { inv: 0x226, en: 0x241, pat: 0x239, rh: 0x23C, gh: 0x23D, bh: 0x23E, rl: 0x23A, gbl: 0x23B, cur: 0x600 },
    E503:  { inv: 0x1F8, en: 0x213, pat: 0x20B, rh: 0x20E, gh: 0x20F, bh: 0x210, rl: 0x20C, gbl: 0x20D, cur: 0x311 },
    E501A: { inv: 0x2E0, en: 0x2FB, pat: 0x2F3, rh: 0x2F6, gh: 0x2F7, bh: 0x2F8, rl: 0x2F4, gbl: 0x2F5, cur: 0x3E2 },
    E501B: { inv: 0x2E0, en: 0x2FB, pat: 0x2F3, rh: 0x2F6, gh: 0x2F7, bh: 0x2F8, rl: 0x2F4, gbl: 0x2F5, cur: 0x3E2 }
  };
  var bd = BOARDS[C], R = REG[C];
  var mem = Object.assign({}, bd.mem), msgs = [];
  /* 進入前的原值：其他欄位故意放 1，驗 RMW 不會清掉 */
  if (R) {
    mem['62:' + R.inv] = 0x40; mem['62:' + R.en] = 0x45; mem['62:' + R.pat] = 0x85;
    mem['62:' + R.rl] = 0xFC; mem['62:' + R.gbl] = 0xCC; mem['62:' + R.cur] = 0x41;
  }
  var ws = { readyState: 1, onmessage: null, close: function () { ws.readyState = 3; },
    send: function (t) {
      var m = JSON.parse(t), rep = { type: 'result', id: m.id, cmd: m.type, ok: true, status: 0 };
      if (window.TconMbus && window.TconMbus.autoSending) { setTimeout(function () { ws.onmessage && ws.onmessage({ data: JSON.stringify(rep) }); }, 0); return; }
      msgs.push({ t: m.type, s: m.slave, a: m.addr, d: m.data ? m.data.slice() : null, aw: m.awid, n: m.len });
      if (['read', 'write', 'rawwrite'].indexOf(m.type) >= 0 && bd.present.indexOf(m.slave) < 0 && m.slave !== 0x7E) { rep.ok = false; rep.err = 'NACK'; rep.status = 2; }
      else if (m.type === 'read') {
        if (m.addr === 0xFF00 && bd.ff00 && bd.ff00[m.slave]) rep.data = bd.ff00[m.slave].slice();
        else { rep.data = []; for (var i = 0; i < (m.len || 1); i++) rep.data.push(mem[m.slave + ':' + (m.addr + i)] != null ? mem[m.slave + ':' + (m.addr + i)] : 0); }
      } else if (m.type === 'rawwrite' || m.type === 'write') (m.data || []).forEach(function (b, i) { mem[m.slave + ':' + (m.addr + i)] = b; });
      setTimeout(function () { ws.onmessage && ws.onmessage({ data: JSON.stringify(rep) }); }, 0);
    } };
  dstWs = ws; dstWs.onmessage = dstOnMessage; dstLinked = true;
  function hx(v) { return '0x' + (v >>> 0).toString(16).toUpperCase(); }
  function writes() { return msgs.filter(function (m) { return m.t === 'write' || m.t === 'rawwrite'; }); }
  function firstW(a, from) { var w = writes(); for (var i = from || 0; i < w.length; i++) if (w[i].a === a) return i; return -1; }
  function g(a) { return mem['62:' + a]; }

  try {
    await dstScanIdentify();
    await dstReadRes();
    if (C === 'EM02') {
      __ok('EM02: MNT identified as EM02A1', dstIc && dstIc.key === 'EM02A1', dstIc && dstIc.key);
      __ok('EM02: no NB reads (7C/7D/3E) when MNT matched', msgs.filter(function (m) { return [0x7C, 0x7D, 0x3E].indexOf(m.s) >= 0; }).length === 0);
      __ok('EM02: 12-bit option enabled', !document.querySelector('#dst-bits option[value="12"]').disabled);
      msgs.length = 0;
      await dstWriteReg(0x0C40, [1, 2, 3, 4, 5]);
      __ok('EM02: MNT writes still use type write', writes().length === 1 && writes()[0].t === 'write', JSON.stringify(writes()));
      __checkVersion('NB-EM02');
      __done(); return;
    }
    __ok(C + ': identified', dstIc && dstIc.nb && dstIc.key === C, dstIc && dstIc.key);
    __ok(C + ': slave 0x3E', dstSlave === 0x3E, hx(dstSlave));
    __ok(C + ': IC name on screen', (__txt('dst-v-ic') || '').indexOf(C) >= 0, __txt('dst-v-ic'));
    __ok(C + ': resolution not read from MNT 0xFF26', msgs.filter(function (m) { return m.t === 'read' && m.a === 0xFF26; }).length === 0 && dstRes.from === 'none');
    __ok(C + ': 12-bit option disabled', document.querySelector('#dst-bits option[value="12"]').disabled);

    /* ② ③ 進入＋第一個顏色：R 4092→1023、G 2036→509、B 8→2（10-bit） */
    msgs.length = 0;
    await dstSetRgb12(4092, 2036, 8);
    var iPat = firstW(R.pat), iR = firstW(R.rh), iEn = firstW(R.en), iInv = firstW(R.inv);
    __ok(C + ': order PGEN_PAT < PAT0 < PGEN_EN < AG_INV', iPat >= 0 && iPat < iR && iR < iEn && iEn < iInv, [iPat, iR, iEn, iInv].join(','));
    __ok(C + ': AG_INV is the last write', iInv === writes().length - 1, iInv + '/' + writes().length);
    __ok(C + ': AG_PGEN_PAT = 0, bit7 kept', g(R.pat) === 0x80, hx(g(R.pat)));
    __ok(C + ': AG_PGEN_EN bit7 = 1, others kept', g(R.en) === 0xC5, hx(g(R.en)));
    __ok(C + ': AG_INV bit0 = 1, others kept', g(R.inv) === 0x41, hx(g(R.inv)));
    __ok(C + ': R = 1023 (hi 0xFF, lo[1:0] 3, rest kept)', g(R.rh) === 0xFF && g(R.rl) === 0xFF, hx(g(R.rh)) + ' ' + hx(g(R.rl)));
    __ok(C + ': G = 509 (hi 0x7F, lo[5:4] 1)', g(R.gh) === 0x7F && ((g(R.gbl) >> 4) & 3) === 1, hx(g(R.gh)) + ' ' + hx(g(R.gbl)));
    __ok(C + ': B = 2 (hi 0x00, lo[1:0] 2)', g(R.bh) === 0x00 && (g(R.gbl) & 3) === 2, hx(g(R.bh)) + ' ' + hx(g(R.gbl)));
    __ok(C + ': other bits of G/B lo byte kept', (g(R.gbl) & 0xCC) === 0xCC, hx(g(R.gbl)));
    __ok(C + ': all NB writes are rawwrite slave 0x3E awid 2', writes().every(function (w) { return w.t === 'rawwrite' && w.s === 0x3E && w.aw === 2; }));
    __ok(C + ': all NB reads are slave 0x3E awid 2', msgs.filter(function (m) { return m.t === 'read'; }).every(function (m) { return m.s === 0x3E && m.aw === 2; }));

    /* ④ 換色只動 Pattern 0 */
    msgs.length = 0;
    await dstSetRgb12(0, 0, 0);
    __ok(C + ': second colour does not touch AG_INV / PGEN_EN / PGEN_PAT', firstW(R.inv) < 0 && firstW(R.en) < 0 && firstW(R.pat) < 0, JSON.stringify(writes().map(function (w) { return hx(w.a); })));
    __ok(C + ': black written', g(R.rh) === 0 && g(R.gh) === 0 && g(R.bh) === 0 && (g(R.rl) & 3) === 0 && (g(R.gbl) & 0x33) === 0);

    /* ⑤ 十字（解析度讀不到 ⇒ 1920x1080 中心 960,540） */
    msgs.length = 0;
    await dstCrossOn();
    __ok(C + ': cursor XY packed (960,540)', g(R.cur + 1) === 0x23 && g(R.cur + 2) === 0xC0 && g(R.cur + 3) === 0x1C, [g(R.cur + 1), g(R.cur + 2), g(R.cur + 3)].map(hx).join(' '));
    __ok(C + ': cursor CTL EN=1 MODE=0 COLOR=R, bit0/bit7 kept', g(R.cur) === 0x0B, hx(g(R.cur)));

    /* ⑦ 白名單 */
    var blocked = false; try { await dstWriteReg(0x0100, [0]); } catch (e) { blocked = true; }
    __ok(C + ': write outside NB whitelist blocked', blocked);

    /* ⑥ 離開 */
    msgs.length = 0;
    await dstLeavePattern();
    __ok(C + ': leave restores AG_INV', g(R.inv) === 0x40, hx(g(R.inv)));
    __ok(C + ': leave restores AG_PGEN_EN', g(R.en) === 0x45, hx(g(R.en)));
    __ok(C + ': leave restores AG_PGEN_PAT', g(R.pat) === 0x85, hx(g(R.pat)));
    __ok(C + ': leave turns cursor off (bit1 = 0)', (g(R.cur) & 0x02) === 0, hx(g(R.cur)));
    __ok(C + ': leave clears pattern state', dstInitPtg === null && !dstInPattern);

    /* 對位畫面（L127 + 十字）一個動作 */
    msgs.length = 0;
    await dstAlignPattern();
    __ok(C + ': align = L127 grey (10-bit 508) + cross', g(R.rh) === 127 && g(R.gh) === 127 && g(R.bh) === 127 && (g(R.cur) & 0x02) === 2 && g(R.inv) === 0x41 && g(R.en) === 0xC5);
    await dstLeavePattern();
    __checkVersion('NB-' + C);
  } catch (e) { __ok(C + ': no exception', false, String(e && e.stack || e)); }
  __done();
})();
