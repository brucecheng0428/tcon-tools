/* ZM：dg v2.4.12「圖表放大檢視關不掉」回歸（Bruce 10/13「放大以後就關不掉」「點了關閉按鈕也關不掉」）。
   根因：唯讀檢視旗標與縮放堆疊同名（var DG_VIEW 兩次），旗標的 false 蓋掉物件 ⇒ 關閉時 DG_VIEW[id] = [] 丟 TypeError。
   矩陣：每張畫過的圖 × 開法（⤢ 鈕／API）× 縮放前置（無／滾輪放大／滾輪＋上一層／滾輪＋還原）× 關法（關閉鈕／點暗色區／Escape），
   每格都驗：關得掉、關閉鈕在最上層可點、關後再開仍正常、縮放層數歸零、頁面可捲動、沒有 JS 錯誤。
   另驗：表格放大檢視、圖表→表格切換、其他浮動視窗的關閉鈕。 */
(async function () {
  try {
    await __boot(1500);
    var E0 = window.__errs.length;
    function newErrs() { return window.__errs.slice(E0); }
    __ok('Z0 DG_VIEW is the zoom-stack object (not the view flag)', DG_VIEW && typeof DG_VIEW === 'object', typeof DG_VIEW);
    __ok('Z0 view-only flag off on normal DG', DG_VIEW_ONLY === false && window.dgApi.viewMode() === false);
    function rows(k) { var a = []; for (var g = 0; g < 256; g++) a.push([g, 0.3127 + k * 0.002, 0.329, Math.pow(g / 255, 2.2) * 200 * k + 0.1]); return a; }
    var prim = [['r', 0.64, 0.33, 40], ['g', 0.30, 0.60, 130], ['b', 0.15, 0.06, 15]];
    window.postMessage = function () {};
    function send(d) { window.dispatchEvent(new MessageEvent('message', { data: d, origin: location.origin, source: window })); }
    send({ type: 'dg-cmp-add', task: 31, name: 'A', edited: true, rows: rows(1), prim: prim, at: 't1', kind: 'tcon', job: 'main' });
    send({ type: 'dg-cmp-add', task: 32, name: 'B', edited: true, rows: rows(0.9), prim: prim, at: 't2', kind: 'tcon', job: 'main' });
    await __wait(300);
    var M = document.getElementById('dg-modal');
    function isOpen() { return M.classList.contains('open'); }
    function closeOnTop() {
      var b = document.getElementById('dg-modal-close').getBoundingClientRect();
      if (!b.width || b.top < 0 || b.left < 0 || b.right > innerWidth || b.bottom > innerHeight) return 'offscreen ' + JSON.stringify([b.left, b.top, b.right, b.bottom]);
      var t = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return t && (t.id === 'dg-modal-close') ? 'ok' : ('covered by ' + (t ? (t.id || t.className || t.tagName) : 'null'));
    }
    function wheelIn() {
      var c = document.getElementById('dg-zoom-canvas'), s = c && c.querySelector('svg');
      if (!s) return;
      var r = s.getBoundingClientRect();
      c.dispatchEvent(new WheelEvent('wheel', { deltaY: -240, clientX: r.left + r.width * 0.5, clientY: r.top + r.height * 0.5, bubbles: true, cancelable: true }));
    }
    var closers = {
      btn: function () { document.getElementById('dg-modal-close').click(); },
      backdrop: function () { M.dispatchEvent(new MouseEvent('click', { bubbles: true })); },
      esc: function () { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); }
    };
    var pres = {
      none: function () {},
      wheel: function () { wheelIn(); },
      wheelBack: function () { wheelIn(); wheelIn(); var b = document.getElementById('dg-zoom-back'); b && b.click(); },
      wheelReset: function () { wheelIn(); var b = document.getElementById('dg-zoom-reset'); b && b.click(); }
    };
    var pass = 0, fail = [], cells = 0, tested = {};
    async function runTab(mode) {
      dgSwitchMode(mode); await __wait(250);
      if (mode === 'main') { revealAll(); await __wait(150); }
      var hosts = Object.keys(DG_CHART_LAST).filter(function (h) { var e = document.getElementById(h); return e && e.offsetParent; });
      for (var hi = 0; hi < hosts.length; hi++) {
        var h = hosts[hi]; if (tested[h]) continue; tested[h] = 1;
        var btn = document.querySelector('.dg-chart-zoom[data-chart="' + h + '"]');
        var opens = { api: function () { dgChartZoomOpen(h); } };
        if (btn && btn.offsetParent) opens.btn = function () { btn.click(); };
        for (var o in opens) for (var p in pres) for (var c in closers) {
          cells++;
          var e0 = window.__errs.length, why = [];
          opens[o](); await __frame();
          if (!isOpen() || DG_ZOOM_CHART !== h) why.push('not opened');
          pres[p](); await __frame();
          if (p === 'wheel' && !((DG_VIEW[h] || []).length)) why.push('wheel did not zoom');
          var ct = closeOnTop(); if (ct !== 'ok') why.push('close btn ' + ct);
          closers[c](); await __frame();
          if (isOpen()) why.push('still open');
          if (DG_ZOOM_CHART) why.push('DG_ZOOM_CHART left');
          if ((DG_VIEW[h] || []).length) why.push('zoom stack not reset');
          if (M.classList.contains('dg-modal-chart')) why.push('chart class left');
          if (window.__errs.length > e0) why.push('js err ' + window.__errs.slice(e0).join(' | '));
          if (why.length) fail.push(h + '/' + o + '/' + p + '/' + c + ': ' + why.join('; ')); else pass++;
        }
        // 關掉後再開一次仍正常
        dgChartZoomOpen(h); await __frame();
        var re = isOpen() && document.querySelector('#dg-zoom-canvas svg');
        closers.btn(); await __frame();
        if (!re || isOpen()) fail.push(h + ' reopen'); else pass++;
        cells++;
      }
    }
    await runTab('cmp');
    // 主分頁：量測頁帶入白灰階 → 出廠等距表 → 調色溫並產生（圖一～四、圖表資料表都畫出來）
    dgSwitchMode('main'); await __wait(100);
    DG_WMODE = 'tcon'; DG_PQ = false; dgWmodeSync(); DG_ROUND = 1;
    DG_LIVE_TASKS[41] = 'gray'; DG_LIVE_TASK_KIND[41] = 'tcon';
    send({ type: 'dg-measure-result', mode: 'gray', task: 41, rows: rows(1), prim: prim, at: 'r1', cmpAsk: true });
    await __wait(80);
    var rec = document.getElementById('dg-modal-rec'); if (rec && rec.classList.contains('open')) dgRecAnswer(false);
    dgLutModalOpen(); await __wait(50);
    document.getElementById('dg-btn-default').click(); await __wait(300);
    var tb = document.getElementById('dg-btn-tone-cct'); if (tb && tb.offsetParent) tb.click();
    await __until(function () { return !!lastLut; }, 5000); await __wait(300);
    __ok('Z1 main tab computed (charts 1-4 drawn)', !!lastLut, Object.keys(DG_CHART_LAST).join(','));
    ['dg-modal-conf', 'dg-modal-rec', 'dg-modal-uni', 'dg-modal-lut'].forEach(function (id) { var m = document.getElementById(id); if (m) m.classList.remove('open'); });
    Array.prototype.forEach.call(document.querySelectorAll('.dg-part.folded'), function (e) { e.classList.remove('folded'); });
    await __wait(100);
    /* 測試用：把收折的區塊／卡片攤開（只改 inline display，不碰資料），讓主分頁每張圖與表格的 ⤢ 都點得到 */
    function reveal(el) { while (el && el !== document.body) { if (!el.classList.contains('dg-modal') && getComputedStyle(el).display === 'none') el.style.setProperty('display', 'block', 'important'); el = el.parentElement; } }
    function revealAll() {
      Object.keys(DG_CHART_LAST).forEach(function (h) { reveal(document.getElementById(h)); });
      Array.prototype.forEach.call(document.querySelectorAll('.dg-grid-zoom'), reveal);
    }
    await runTab('main');
    __ok('Z1 matrix: every chart × open × pre-zoom × close works', fail.length === 0 && cells > 0,
      'cells=' + cells + ' pass=' + pass + ' charts=' + Object.keys(tested).join(',') + (fail.length ? ' FAIL ' + fail.slice(0, 6).join(' || ') : ''));
    __ok('Z1 covered >= 4 charts', Object.keys(tested).length >= 4, Object.keys(tested).join(','));
    // 頁面捲動恢復（關掉後 body 沒被鎖）
    var se = document.scrollingElement; se.scrollTop = 0; se.scrollTop = 300;
    __ok('Z2 page scrolls after close (no scroll lock left)', se.scrollTop > 0 && getComputedStyle(document.body).overflow !== 'hidden' && getComputedStyle(document.documentElement).overflow !== 'hidden',
      se.scrollTop + ' / ' + se.scrollHeight + ' / ' + se.clientHeight);
    // 表格放大檢視（同一個殼）＋ 圖表 → 表格切換
    revealAll(); await __wait(100);
    var gz = Array.prototype.filter.call(document.querySelectorAll('.dg-grid-zoom:not(.dg-chart-zoom)'), function (b) { return b.offsetParent; });
    if (gz.length) {
      var gres = [];
      for (var c2 in closers) {
        var e1 = window.__errs.length;
        gz[0].click(); await __frame();
        var op = isOpen(), top = closeOnTop();
        closers[c2](); await __frame();
        gres.push(c2 + ':' + (op && top === 'ok' && !isOpen() && window.__errs.length === e1 ? 'ok' : 'bad(' + op + ',' + top + ',' + isOpen() + ')'));
      }
      __ok('Z3 table zoom opens/closes (btn/backdrop/esc)', gres.every(function (x) { return /:ok$/.test(x); }), gres.join(' '));
      var h0 = Object.keys(tested)[0];
      dgSwitchMode(document.getElementById(h0).closest('#dg-cmp-content') ? 'cmp' : 'main'); await __wait(150);
      dgChartZoomOpen(h0); await __frame();
      dgSwitchMode('main'); await __wait(150); revealAll(); await __wait(100);
      gz = Array.prototype.filter.call(document.querySelectorAll('.dg-grid-zoom:not(.dg-chart-zoom)'), function (b) { return b.offsetParent; });
      var e2 = window.__errs.length;
      if (gz.length) { gz[0].click(); await __frame(); }
      var sw = isOpen() && !DG_ZOOM_CHART && !M.classList.contains('dg-modal-chart');
      closers.btn(); await __frame();
      __ok('Z3 chart -> table in the same modal, then close', sw && !isOpen() && window.__errs.length === e2, String(window.__errs.slice(e2)));
    } else __ok('Z3 table zoom button present', false, 'no visible .dg-grid-zoom');
    // 疊層：從其他浮動視窗裡開放大檢視（例：第 2 部分視窗裡的表格 ⤢）⇒ 放大檢視在最上層、Escape／關閉鈕先收它
    var stack = [], h1 = Object.keys(tested)[0];
    ['dg-modal-gray', 'dg-modal-lut', 'dg-modal-prim', 'dg-modal-conf', 'dg-modal-slot', 'dg-modal-pq'].forEach(function (id) {
      var m = document.getElementById(id); if (!m) return;
      m.classList.add('open');
      dgChartZoomOpen(h1);
      var top = closeOnTop();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      var a = !isOpen() && m.classList.contains('open');
      dgChartZoomOpen(h1); closers.btn();
      var b = !isOpen() && m.classList.contains('open');
      m.classList.remove('open');
      stack.push(id + ':' + (top === 'ok' && a && b ? 'ok' : 'bad(' + top + ',' + a + ',' + b + ')'));
    });
    __ok('Z5 zoom stacks above other modals; Esc / close button close the zoom first', stack.length >= 5 && stack.every(function (x) { return /:ok$/.test(x); }), stack.join(' '));
    // 其他浮動視窗：關閉鈕在最上層、按了就關
    var others = ['dg-modal-lut', 'dg-modal-gray', 'dg-modal-slot', 'dg-modal-prim', 'dg-modal-pq', 'dg-modal-conf', 'dg-modal-info'];
    var ores = [];
    others.forEach(function (id) {
      var m = document.getElementById(id); if (!m) { ores.push(id + ':missing'); return; }
      var cb = document.getElementById(id + '-close');
      m.classList.add('open');
      var b = cb.getBoundingClientRect(), t = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      var e3 = window.__errs.length;
      cb.click();
      ores.push(id + ':' + ((t === cb) && !m.classList.contains('open') && window.__errs.length === e3 ? 'ok' : 'bad(top=' + (t === cb) + ',open=' + m.classList.contains('open') + ')'));
      m.classList.remove('open');
    });
    __ok('Z4 other modals close via their close button', ores.every(function (x) { return /:ok$/.test(x); }), ores.join(' '));
    __ok('Z9 no JS errors', newErrs().length === 0, newErrs().join(' | '));
  } catch (e) { __ok('exception', false, e && e.stack); }
  __done();
})();
