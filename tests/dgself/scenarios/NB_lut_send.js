/* NB_lut_send.js — dgself v2.10.0：NB 量測照 T-CON 內部 RGB LUT[n] 送 PAT0_USER（模擬 I2C＋假量測儀，跑真的 dstRun()）。
   window.__nbLutCase：
     EN01／E503／E501A／E501B ＝ DG 開（DGM_EN bit0＝1），非線性 LUT（L128＝R500 G510 B520）：
        ① 量測前讀 DGM_EN 與 960 byte LUT（slave 0x3E、2-byte offset、位址照各顆）
        ② L0／L128／L255 與 R／G／B 純色送出的 PAT0_USER ＝ LUT[n]（不再 R=G=B）；256 階逐筆相同
        ③ 畫面：筆數、讀到時間、校驗、L128 值、「DG 開啟：Ln 送 PAT0_USER ＝ LUT[n]」
     OFF   ＝ DG 關：送等間隔 n×4（R=G=B），畫面「DG 關閉：送預設等間隔值」
     NEW   ＝ 讀完之後 DG 頁寫入新 LUT ⇒ 畫面標過期；下一輪量測重讀 ⇒ 送出值跟著新表
     FAIL  ＝ DG 開但 LUT 全 0xFF ⇒ 擋下量測（一筆 MES 都沒有）、講原因
     SHORT ＝ DG 開但 LUT 讀回筆數不足 ⇒ 擋下、講「只讀到」
     FAILOFF ＝ DG 關、LUT 讀不到 ⇒ 不擋（LUT 用不到），送 n×4
     EN／CN ＝ 英文／簡中字面
     DG    ＝ 由 DG 開啟：上方步驟列多一步「讀 LUT」；讀完打勾
   LUT 編碼在這裡獨立寫一份（R 256 → G 256 → B 256，每筆 10 bit，byte 內高位先），與頁面的解碼對得上才算過。 */
(async function () {
  await __boot(300);
  var C = window.__nbLutCase || 'EN01';
  var IC = ({ E503: 'E503', E501A: 'E501A', E501B: 'E501B' })[C] || 'EN01';
  var BOARDS = {
    EN01:  { mem: { '124:149': 0x22, '124:152': 0x00, '125:125': 0x0A, '62:8318': 0x10 }, en: 0x62B, lut: 0x1400 },
    E503:  { mem: { '124:149': 0x22, '124:152': 0x00, '125:125': 0x03, '62:8318': 0x00 }, en: 0x2BC, lut: 0x0760 },
    E501A: { mem: { '124:149': 0x00, '124:152': 0x01, '125:30': 0x00 }, en: 0x39B, lut: 0x0820 },
    E501B: { mem: { '124:149': 0x41, '124:152': 0x01, '125:127': 0x01 }, en: 0x39B, lut: 0x0820 }
  };
  var PAT = {
    EN01:  { rh: 0x23C, gh: 0x23D, bh: 0x23E, rl: 0x23A, gbl: 0x23B },
    E503:  { rh: 0x20E, gh: 0x20F, bh: 0x210, rl: 0x20C, gbl: 0x20D },
    E501A: { rh: 0x2F6, gh: 0x2F7, bh: 0x2F8, rl: 0x2F4, gbl: 0x2F5 },
    E501B: { rh: 0x2F6, gh: 0x2F7, bh: 0x2F8, rl: 0x2F4, gbl: 0x2F5 }
  };
  var bd = BOARDS[IC], P = PAT[IC], mem = Object.assign({}, bd.mem), msgs = [];
  var dgOn = !(C === 'OFF' || C === 'FAILOFF');
  mem['62:' + bd.en] = dgOn ? 0x81 : 0x80;          // bit7 DGM_RET_N＝1（其他位元）＋bit0 DGM_EN
  function mkLut(k) {
    var r = [], g = [], b = [];
    for (var n = 0; n < 256; n++) {
      var x = Math.pow(n / 255, 2.2 + k);
      r.push(Math.round(1023 * x)); g.push(Math.min(1023, Math.round(1023 * x * 0.97) + 3)); b.push(Math.min(1023, Math.round(1023 * x * 0.93) + 7));
    }
    if (!k) { r[128] = 500; g[128] = 510; b[128] = 520; }
    return { r: r, g: g, b: b };
  }
  function enc(l) {
    var out = [];
    ['r', 'g', 'b'].forEach(function (c) {
      var bits = [];
      l[c].forEach(function (v) { for (var i = 9; i >= 0; i--) bits.push((v >> i) & 1); });
      for (var j = 0; j < bits.length; j += 8) { var by = 0; for (var q = 0; q < 8; q++) by = (by << 1) | bits[j + q]; out.push(by); }
    });
    return out;
  }
  function putLut(bytes) { bytes.forEach(function (v, i) { mem['62:' + (bd.lut + i)] = v; }); }
  var LUT = mkLut(0);
  if (C === 'FAIL' || C === 'FAILOFF') putLut(new Array(960).fill(0xFF)); else putLut(enc(LUT));
  var shortAt = (C === 'SHORT') ? bd.lut + 512 : -1;
  var ws = { readyState: 1, onmessage: null, close: function () { ws.readyState = 3; },
    send: function (t) {
      var m = JSON.parse(t), rep = { type: 'result', id: m.id, cmd: m.type, ok: true, status: 0 };
      if (window.TconMbus && window.TconMbus.autoSending) { setTimeout(function () { ws.onmessage && ws.onmessage({ data: JSON.stringify(rep) }); }, 0); return; }
      msgs.push({ t: m.type, s: m.slave, a: m.addr, aw: m.awid, n: m.len });
      var present = [0x7C, 0x7D, 0x3E];
      if (['read', 'write', 'rawwrite'].indexOf(m.type) >= 0 && present.indexOf(m.slave) < 0 && m.slave !== 0x7E) { rep.ok = false; rep.err = 'NACK'; rep.status = 2; }
      else if (m.type === 'read') {
        rep.data = [];
        var len = (m.addr === shortAt) ? Math.floor((m.len || 1) / 2) : (m.len || 1);
        for (var i = 0; i < len; i++) { var k = m.slave + ':' + (m.addr + i); rep.data.push(mem[k] != null ? mem[k] : 0); }
      } else if (m.type === 'rawwrite' || m.type === 'write') (m.data || []).forEach(function (b, i) { mem[m.slave + ':' + (m.addr + i)] = b; });
      setTimeout(function () { ws.onmessage && ws.onmessage({ data: JSON.stringify(rep) }); }, 0);
    } };
  function g8(a) { return mem['62:' + a] || 0; }
  function pat10() {
    return { r: (g8(P.rh) << 2) | (g8(P.rl) & 3), g: (g8(P.gh) << 2) | ((g8(P.gbl) >> 4) & 3), b: (g8(P.bh) << 2) | (g8(P.gbl) & 3) };
  }
  var sent = [];
  function armMeter() {
    dstCaLinked = true; window.__mes = 0;
    dstWaitOrAbort = function () { return Promise.resolve(!dstAbort); };
    dstCaClose = async function () {};
    dstCaCmd = async function (cmd) {
      if (/^MES/.test(cmd)) { window.__mes++; sent.push(pat10()); return 'OK00,P1,0,0.3127,0.3290,123.456'; }
      if (/^MVS,([\d.]+)/.test(cmd)) return 'OK00,60.00';
      return 'OK00';
    };
  }
  function eq(a, b) { return a && b && a.r === b.r && a.g === b.g && a.b === b.b; }
  function at(l, n) { return { r: l.r[n], g: l.g[n], b: l.b[n] }; }
  function fmt(v) { return v ? ('R' + v.r + ' G' + v.g + ' B' + v.b) : String(v); }
  try {
    dstWs = ws; dstWs.onmessage = dstOnMessage; dstLinked = true;
    await dstScanIdentify();
    __ok(C + ': identified ' + IC, dstIc && dstIc.nb && dstIc.key === IC, dstIc && dstIc.key);
    dstRenderBtns();
    __ok(C + ': NB LUT box shown, button enabled', !__cls('dst-box-nblut', 'dst-hidden') && __dis('dst-nblut-go') === false);
    __ok(C + ': before reading ⇒ "還沒讀"', /還沒讀/.test(__txt('dst-v-nblut') || ''), __txt('dst-v-nblut'));
    armMeter();

    if (C === 'MNT') {
      await __arm(); dstRenderBtns();
      __ok('MNT: EM02 ⇒ NB LUT box hidden, no NB LUT step', __cls('dst-box-nblut', 'dst-hidden') && !dstIc.nb);
      __checkVersion('NBL-MNT'); __done(); return;
    }
    if (C === 'DG') {
      if (typeof dstAlignDone !== 'undefined') dstAlignDone = true;
      dstRenderBtns(); dstRenderSteps(); await __wait(50);
      function bar() {
        var el = document.getElementById('dst-stepbar');
        var items = Array.prototype.map.call(el.querySelectorAll('.tc-sb-i'), function (li) {
          return { s: li.classList.contains('tc-sb-done') ? 'D' : li.classList.contains('tc-sb-cur') ? 'C' : 'T',
                   t: (li.querySelector('.tc-sb-short') || {}).textContent || '' };
        });
        return items;
      }
      var b0 = bar(), i0 = b0.map(function (x) { return x.t; }).indexOf('量測用 LUT');
      __ok('DG: step bar has a "量測用 LUT" step (NB), not done yet', i0 >= 0 && b0[i0].s !== 'D', JSON.stringify(b0));
      await dstNbReadLut('t'); dstRenderSteps(); await __wait(50);
      var b1 = bar(), i1 = b1.map(function (x) { return x.t; }).indexOf('量測用 LUT');
      __ok('DG: after reading ⇒ "量測用 LUT" step done (green)', i1 >= 0 && b1[i1].s === 'D', JSON.stringify(b1));
      __ok('DG: NB box tick ✓', __txt('dst-tick-nblut') === '✓');
      dstNbLutMarkStale(); dstRenderSteps(); await __wait(50);
      var b2 = bar(), i2 = b2.map(function (x) { return x.t; }).indexOf('量測用 LUT');
      __ok('DG: new LUT written ⇒ step not done again', i2 >= 0 && b2[i2].s !== 'D' && __txt('dst-tick-nblut') === '○', JSON.stringify(b2));
      __ok('DG: box fits the viewport width (no horizontal overflow)', document.getElementById('dst-box-nblut').scrollWidth <= document.getElementById('dst-box-nblut').clientWidth + 1
        && document.documentElement.scrollWidth <= window.innerWidth + 1, document.documentElement.scrollWidth + '/' + window.innerWidth);
      __checkVersion('NBL-DG'); __done(); return;
    }

    if (C === 'FAIL' || C === 'SHORT') {
      await dstRun();
      __ok(C + ': run blocked, no measurement at all', !dstRunOk && window.__mes === 0 && dstRows.length === 0, 'mes=' + window.__mes + ' rows=' + dstRows.length);
      var say = __txt('dst-say-run') || '';
      __ok(C + ': reason on screen ("不能開始量測" + why)', /不能開始量測/.test(say) && (C === 'FAIL' ? /0xFF/.test(say) : /只讀到/.test(say)), say);
      __ok(C + ': no default values sent (PAT0 never written)', msgs.filter(function (m) { return (m.t === 'rawwrite') && [P.rh, P.gh, P.bh].indexOf(m.a) >= 0; }).length === 0);
      __ok(C + ': box shows the failure', /讀 LUT 失敗/.test(__txt('dst-v-nblut') || '') && __txt('dst-tick-nblut') === '○', __txt('dst-v-nblut'));
      __checkVersion('NBL-' + C); __done(); return;
    }

    /* ① 按「讀 LUT」 */
    msgs.length = 0;
    await dstNbReadLut('t');
    var lr = msgs.filter(function (m) { return m.t === 'read'; });
    var lutReads = lr.filter(function (m) { return m.a >= bd.lut && m.a < bd.lut + 960; });
    var nBytes = lutReads.reduce(function (s, m) { return s + (m.n || 0); }, 0);
    __ok(C + ': reads DGM_EN at ' + bd.en.toString(16), lr.some(function (m) { return m.a === bd.en && m.n === 1; }), JSON.stringify(lr.map(function (m) { return m.a.toString(16) + 'x' + m.n; })));
    __ok(C + ': reads 960 LUT bytes from 0x' + bd.lut.toString(16) + ' (slave 0x3E, 2-byte offset)', nBytes === 960 && lutReads[0].a === bd.lut
      && lr.every(function (m) { return m.s === 0x3E && m.aw === 2; }), nBytes);
    __ok(C + ': reading the LUT writes nothing', msgs.filter(function (m) { return m.t !== 'read'; }).length === 0);
    if (C !== 'FAILOFF') {
      var allMatch = true; for (var n = 0; n < 256; n++) if (!eq(at(dstNbLut, n), at(LUT, n))) { allMatch = false; break; }
      __ok(C + ': decoded LUT = fixture for all 256 × RGB', allMatch, 'first diff at ' + n);
      __ok(C + ': L128 = R500 G510 B520', eq(at(dstNbLut, 128), { r: 500, g: 510, b: 520 }), fmt(at(dstNbLut, 128)));
      var t = __txt('dst-v-nblut') || '';
      __ok(C + ': box shows count, time, checksum, L128', /已讀 256 筆/.test(t) && /\d\d:\d\d:\d\d/.test(t) && /校驗 0x[0-9A-F]{4}/.test(t) && /L128 R500 G510 B520/.test(t), t);
      __ok(C + ': tick ✓', __txt('dst-tick-nblut') === '✓');
    }
    __ok(C + ': DG_EN row follows DGM_EN', (__txt('dst-v-dg') || '').indexOf(dgOn ? '開啟' : '關閉') >= 0, __txt('dst-v-dg'));
    var sl = __txt('dst-nb-send') || '';
    __ok(C + ': send line says what is sent', dgOn ? /DG 開啟：Ln 送 PAT0_USER ＝ LUT\[n\]/.test(sl) : /DG 關閉：送預設等間隔值/.test(sl), sl);

    if (C === 'EN' || C === 'CN') {
      applyLang(C === 'EN' ? 'en' : 'zh-CN'); dstRenderBtns(); await __wait(50);
      var tt = (__txt('dst-v-nblut') || '') + ' | ' + (__txt('dst-nb-send') || '') + ' | ' + (__txt('dst-nblut-go') || '') + ' | ' + (__txt('dst-nblut-name') || '');
      if (C === 'EN') __ok('EN: English text, no CJK', /Read 256 entries/.test(tt) && /DG on: Ln sends PAT0_USER/.test(tt) && /Read LUT/.test(tt) && !/[一-鿿]/.test(tt), tt);
      else __ok('CN: 简中字面', /已读 256 笔/.test(tt) && /校验/.test(tt) && /读 LUT/.test(tt) && /DG 开启/.test(tt), tt);
      applyLang('zh-TW');
      __checkVersion('NBL-' + C); __done(); return;
    }

    if (C === 'NEW') {
      LUT = mkLut(0.4); putLut(enc(LUT));                 // DG 頁寫入了一張新表
      dstNbLutMarkStale();
      __ok('NEW: box says the copy is out of date', /已過期/.test(__txt('dst-v-nblut') || '') && __txt('dst-tick-nblut') === '○', __txt('dst-v-nblut'));
    }

    /* ② 真的跑一輪 */
    sent.length = 0; msgs.length = 0;
    await dstRun();
    __ok(C + ': run finished, 259 measurements', dstRunOk && window.__mes === 259 && sent.length === 259, 'ok=' + dstRunOk + ' mes=' + window.__mes + ' ' + (__txt('dst-say-run') || ''));
    var runReads = msgs.filter(function (m) { return m.t === 'read' && m.a >= bd.lut && m.a < bd.lut + 960; }).reduce(function (s, m) { return s + m.n; }, 0);
    __ok(C + ': the run re-reads the LUT first (960 bytes)', runReads === 960, runReads);
    if (dgOn) {
      __ok(C + ': L0 sent = LUT[0]', eq(sent[0], at(LUT, 0)), fmt(sent[0]) + ' vs ' + fmt(at(LUT, 0)));
      __ok(C + ': L128 sent = LUT[128]' + (C === 'NEW' ? ' (new table)' : ' = R500 G510 B520'), eq(sent[128], at(LUT, 128)), fmt(sent[128]) + ' vs ' + fmt(at(LUT, 128)));
      __ok(C + ': L255 sent = LUT[255]', eq(sent[255], at(LUT, 255)), fmt(sent[255]) + ' vs ' + fmt(at(LUT, 255)));
      var all = true; for (var k2 = 0; k2 < 256; k2++) if (!eq(sent[k2], at(LUT, k2))) { all = false; break; }
      __ok(C + ': every grey level n sent = LUT[n]', all, 'first diff at L' + k2 + ' ' + fmt(sent[k2]));
      __ok(C + ': L128 is not R=G=B', !(sent[128].r === sent[128].g && sent[128].g === sent[128].b), fmt(sent[128]));
      __ok(C + ': R / G / B primaries = LUT_R[255] / LUT_G[255] / LUT_B[255], other channels LUT[0]',
        eq(sent[256], { r: LUT.r[255], g: LUT.g[0], b: LUT.b[0] }) && eq(sent[257], { r: LUT.r[0], g: LUT.g[255], b: LUT.b[0] })
        && eq(sent[258], { r: LUT.r[0], g: LUT.g[0], b: LUT.b[255] }), [256, 257, 258].map(function (i) { return fmt(sent[i]); }).join(' / '));
      __ok(C + ': rows record the PAT0_USER really sent', dstRows[128].nb10 && dstRows[128].nb10.r === LUT.r[128] && dstRows[128].nb10.from === 'lut' && dstRows[128].drv.r === LUT.r[128] * 4,
        JSON.stringify(dstRows[128].nb10));
      if (C === 'NEW') __ok('NEW: box no longer out of date after the run re-read', !/已過期/.test(__txt('dst-v-nblut') || '') && __txt('dst-tick-nblut') === '✓', __txt('dst-v-nblut'));
    } else {
      var even = true; for (var k3 = 0; k3 < 256; k3++) if (!eq(sent[k3], { r: k3 * 4, g: k3 * 4, b: k3 * 4 })) { even = false; break; }
      __ok(C + ': DG off ⇒ every level n sent = n×4 (R=G=B, evenly spaced)', even, 'first diff at L' + k3 + ' ' + fmt(sent[k3]));
      __ok(C + ': L0 / L128 / L255 = 0 / 512 / 1020', sent[0].r === 0 && sent[128].r === 512 && sent[255].r === 1020, fmt(sent[128]));
      __ok(C + ': primaries R/G/B = 1020 on one channel, 0 on the others', eq(sent[256], { r: 1020, g: 0, b: 0 }) && eq(sent[258], { r: 0, g: 0, b: 1020 }));
      __ok(C + ': send line "DG 關閉：送預設等間隔值"', /DG 關閉：送預設等間隔值/.test(__txt('dst-nb-send') || ''), __txt('dst-nb-send'));
      if (C === 'FAILOFF') __ok('FAILOFF: LUT problem still explained (not used while DG off)', /用不到 LUT/.test(__txt('dst-nb-send') || ''), __txt('dst-nb-send'));
    }
    __checkVersion('NBL-' + C);
  } catch (e) { __ok(C + ': no exception', false, String(e && e.stack || e)); }
  __done();
})();
