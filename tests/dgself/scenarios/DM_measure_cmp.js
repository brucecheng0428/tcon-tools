/* DM：dg v2.2.0 電腦畫面量測頁（dg-measure.html）量完 ⇒ 跳「加入光學資料比較」視窗。
   注入在 dg-measure.html 的 IIFE 裡：假序列埠（cmd／dgmSerialOn／closePort）、畫面與等待一律立即完成，
   真的跑一輪 run()（256 階 ＋ 三個純色），走產品的送出路徑。假 DG 同 M 情境（換掉 opener.postMessage）。
   A ＝正常加入；C ＝DG 不回；EN ＝英文字面（語言取 localStorage tcon-lang）；PRIM ＝純色模式不跳視窗。 */
(async function () {
  try {
    var C = window.__cmpCase || 'A';
    if (C === 'EN') { try { localStorage.setItem('tcon-lang', 'en'); } catch (e) {} }
    await __wait(300);
    var sent = [], dg = { count: 4, reply: (C !== 'C') };
    window.opener.postMessage = function (m) {
      sent.push(m);
      if (!dg.reply) return;
      if (m.type === 'dg-cmp-query') setTimeout(function () {
        dgmCmpOnInfo({ type: 'dg-cmp-info', task: m.task, count: dg.count, max: 10,
          list: [1, 2, 3, 4].map(function (i) { return { no: i, name: '組' + i, t: Date.now() }; }),
          round: 3, job: 'main', name: '第三輪', same: null, full: false });
      }, 40);
      if (m.type === 'dg-cmp-add') setTimeout(function () {
        dg.count++;
        var ls = [];
        for (var i = 1; i < dg.count; i++) ls.push({ no: i, name: '組' + i, t: Date.now() });
        ls.push({ no: dg.count, name: m.name, t: Date.now() });
        dgmCmpOnAdded({ type: 'dg-cmp-added', task: m.task, ok: true, updated: false, no: dg.count, name: m.name, count: dg.count, max: 10, list: ls });
      }, 40);
    };
    dgmGateLines = function () { return []; };
    try { Object.defineProperty(navigator, 'serial', { configurable: true, value: {} }); } catch (e) {}
    dgmSerialOn = async function () { return true; };
    closePort = async function () {};
    waitOrAbort = function () { return Promise.resolve(); };
    painted = function () { return Promise.resolve(); };
    dgmPaint = async function () { return true; };
    cmd = async function (t) {
      if (/^MES/.test(t)) return 'OK00,P1,0,0.3127,0.3290,123.456';
      if (/^MVS/.test(t)) return 'OK00,60.00';
      return 'OK00';
    };
    var modal = document.getElementById('dgm-cmp-modal');
    function open() { return modal.classList.contains('on'); }
    function tx(id) { return __txt(id) || ''; }
    __ok('DM0 no modal before run', !open());
    await run();
    await __wait(20);
    var iRes = -1, iQ = -1;
    sent.forEach(function (m, i) { if (m.type === 'dg-measure-result' && iRes < 0) iRes = i; if (m.type === 'dg-cmp-query' && iQ < 0) iQ = i; });
    var R = sent[iRes] || {};
    if (C === 'PRIM') {
      __ok('DM-PRIM result sent, cmpAsk false', iRes >= 0 && R.mode === 'prim' && R.cmpAsk === false);
      __ok('DM-PRIM no popup, no query', !open() && iQ < 0);
      __ok('DM-PRIM re-add row hidden', document.getElementById('dgm-cmp-row').classList.contains('dgm-hidden'));
      __done(); return;
    }
    __ok('DM1 run finished + result sent', iRes >= 0 && R.rows && R.rows.length === 256 && R.prim && R.prim.length === 3, R.rows && R.rows.length);
    __ok('DM1 result carries cmpAsk', R.cmpAsk === true && R.mode === 'gray' && R.task === 7);
    __ok('DM1 result sent BEFORE the popup asks', iQ > iRes, iRes + ' ' + iQ);
    __ok('DM1 modal open', open());
    __ok('DM1 focus on OK', document.activeElement && document.activeElement.id === 'dgm-cmp-ok', document.activeElement && document.activeElement.id);
    var box = modal.querySelector('.dgm-cmp-box');
    __ok('DM1 box fits (≤ 440u and ≤ viewport)', box.getBoundingClientRect().width <= innerWidth, Math.round(box.getBoundingClientRect().width) + '/' + innerWidth);
    __ok('DM1 msg still says done', tx('dgm-msg').indexOf('✔ 已完成：256 筆') === 0, tx('dgm-msg'));
    // v2.2.1：「確定」與自檢頁同一種實心主按鈕（#2563eb）；視窗開著時「重新量測」綠色實心讓位
    var BLUE = 'rgb(37, 99, 235)', GREEN = 'rgb(22, 163, 74)';
    __ok('DM1 OK is solid primary blue (same as selftest)', getComputedStyle(document.getElementById('dgm-cmp-ok')).backgroundColor === BLUE,
      getComputedStyle(document.getElementById('dgm-cmp-ok')).backgroundColor);
    var st = document.getElementById('dgm-start');
    __ok('DM1 page main button yields while open', st.disabled || getComputedStyle(st).backgroundColor !== GREEN, getComputedStyle(st).backgroundColor + ' dis=' + st.disabled);
    var solid = ['dgm-start', 'dgm-fs', 'dgm-link'].filter(function (id) { var e = document.getElementById(id);
      return !e.disabled && getComputedStyle(e).backgroundColor !== 'rgba(0, 0, 0, 0)'; });
    __ok('DM1 no other solid page button while open', solid.length === 0, solid.join(','));
    await __wait(150);
    if (C === 'C') {
      __ok('DM-C this line falls back to DG step name', tx('dgm-cmp-this') === '這一筆：電腦畫面', tx('dgm-cmp-this'));
      await __wait(1500);
      __ok('DM-C unknown count', tx('dgm-cmp-count') === '無法取得目前的筆數，按「確定」仍會送出。', tx('dgm-cmp-count'));
      document.getElementById('dgm-cmp-ok').click();
      __ok('DM-C OK still sends', sent.filter(function (m) { return m.type === 'dg-cmp-add'; }).length === 1);
      await __wait(2200);
      __ok('DM-C no reply reported', tx('dgm-cmp-res').indexOf('沒有收到 DG 的回覆') >= 0, tx('dgm-cmp-res'));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      __ok('DM-C Esc closes', !open());
      __done(); return;
    }
    if (C === 'EN') {
      __ok('DM-EN title', tx('dgm-cmp-title') === 'Add to "Optical data comparison"?', tx('dgm-cmp-title'));
      __ok('DM-EN this', tx('dgm-cmp-this') === 'This set: Round 3 · Main measurement · PC screen', tx('dgm-cmp-this'));
      __ok('DM-EN count', tx('dgm-cmp-count') === '"Optical data comparison" has 4 set(s) now (max 10).', tx('dgm-cmp-count'));
      __ok('DM-EN buttons', tx('dgm-cmp-ok') === 'OK' && tx('dgm-cmp-cancel') === 'Cancel');
      document.getElementById('dgm-cmp-cancel').click();
      __ok('DM-EN re-add button', tx('dgm-cmp-open') === 'Add to optical comparison…', tx('dgm-cmp-open'));
      __done(); return;
    }
    __ok('DM2 this line', tx('dgm-cmp-this') === '這一筆：第 3 輪 · 主量測 · 電腦畫面', tx('dgm-cmp-this'));
    __ok('DM2 count', tx('dgm-cmp-count') === '「光學資料比較」目前已有 4 筆（上限 10）。', tx('dgm-cmp-count'));
    __ok('DM2 list 4 items', document.getElementById('dgm-cmp-list-ol').children.length === 4);
    __ok('DM2 name prefilled', document.getElementById('dgm-cmp-name').value === '第三輪');
    document.getElementById('dgm-cmp-cancel').click();
    __ok('DM3 cancel closes, nothing added', !open() && !sent.some(function (m) { return m.type === 'dg-cmp-add'; }));
    __ok('DM3 re-add row visible', !document.getElementById('dgm-cmp-row').classList.contains('dgm-hidden')
      && tx('dgm-cmp-state') === '這一輪還沒加入「光學資料比較」。', tx('dgm-cmp-state'));
    document.getElementById('dgm-cmp-open').click();
    await __wait(150);
    document.getElementById('dgm-cmp-ok').click();
    await __wait(150);
    var add = sent.filter(function (m) { return m.type === 'dg-cmp-add'; })[0] || {};
    __ok('DM4 add sent (kind pc, default name)', add.kind === 'pc' && add.name === '第三輪' && add.edited === false && add.rows.length === 256 && add.task === 7);
    __ok('DM4 added text', tx('dgm-cmp-res') === '已加入，目前共 5 筆。', tx('dgm-cmp-res'));
    var ol = document.getElementById('dgm-cmp-list-ol');
    __ok('DM4 count line + list updated to 5', tx('dgm-cmp-count') === '「光學資料比較」目前已有 5 筆（上限 10）。' && ol.children.length === 5
      && ol.children[4].textContent.indexOf('第三輪 · ') === 0 && tx('dgm-cmp-list-sum') === '看全部 5 筆', tx('dgm-cmp-count') + '|' + ol.children.length + '|' + tx('dgm-cmp-list-sum'));
    document.getElementById('dgm-cmp-ok').click();
    __ok('DM4 closed + row says added', !open() && tx('dgm-cmp-state') === '已加入第 5 筆（第三輪）。', tx('dgm-cmp-state'));
    __ok('DM4 page main button restored after close', !document.body.classList.contains('dgm-cmp-on')
      && (st.disabled || getComputedStyle(st).backgroundColor === GREEN), getComputedStyle(st).backgroundColor + ' dis=' + st.disabled);
    __ok('DM version = common/version.js dg (' + window.__expectDgVer + ')', TOOL_VERSIONS.dg === window.__expectDgVer, TOOL_VERSIONS.dg);
  } catch (e) { window.__errs.push('scenario: ' + (e && e.stack || e)); }
  __done();
})();
