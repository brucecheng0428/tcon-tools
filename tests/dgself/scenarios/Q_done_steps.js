/* Q：dg v2.4.4「做完的部分縮成 ✓ 一行」（Bruce 2026-10-01 核准，與自檢頁同一套 common/done-step.*）。注入在 dg.html 的 IIFE 裡。
   __qCase：MAIN（校正分頁：第 2／3 部分由量測頁帶入 ⇒ ✓；第 1 部分 ⇒ ✓ 並捲到「開始計算」；點 ✓ 行展開／收回；
                   樣式＝淡灰小字、沒有外框；還沒到的部分不隱藏）
            TYPE（他正在第 2 部分裡打字、打到齊了 ⇒ 不收起來、不捲走，改成展開回看的樣子）
            CONV（深度轉換分頁：① 匯入一張真的 LUT 檔 ⇒ ✓ ①（帶檔名）、捲到 ②；按下載 ⇒ ✓ ②；點 ✓ 行展開）
            EN  （深度轉換分頁兩個步驟名跟著語言） */
(async function () {
  try {
    await __wait(1500);
    var C = window.__qCase || 'MAIN';
    window.postMessage = function () {};
    function send(d) { window.dispatchEvent(new MessageEvent('message', { data: d, origin: window.location.origin, source: window })); }
    function rows(k) { var a = []; for (var g = 0; g < 256; g++) a.push([g, 0.3127, 0.329, Math.pow(g / 255, 2.2) * 200 * k + 0.1]); return a; }
    var prim = [['r', 0.64, 0.33, 40], ['g', 0.30, 0.60, 130], ['b', 0.15, 0.06, 15]];
    function vis(el) { if (typeof el === 'string') el = $(el); if (!el) return false; var r = el.getBoundingClientRect(); return el.offsetParent !== null && r.width > 0 && r.height > 0; }
    function has(id, c) { var e = $(id); return !!(e && e.classList.contains(c)); }
    var scrolled = [], osv = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (o) { scrolled.push(this.id || this.className); return osv.call(this, o); };

    if (C === 'CONV' || C === 'EN') {
      if (C === 'EN') { applyLang('en'); await __wait(100); }
      dgSwitchMode('conv'); await __wait(100);
      __ok('Q-C0 both steps shown in full before anything (not hidden, not ✓)', vis('dg-btn-conv-imp') && vis('dg-btn-conv-dl')
        && !has('dg-conv-step-imp', 'tc-step-done') && !has('dg-conv-step-dl', 'tc-step-done'));
      if (C === 'EN') {
        __ok('Q-EN step titles in English', $('dg-conv-step-imp').querySelector('.dg-conv-step-t').textContent === '① Import an RGB LUT file'
          && $('dg-conv-step-dl').querySelector('.dg-conv-step-t').textContent === '② Choose the target depth and download',
          $('dg-conv-step-imp').querySelector('.dg-conv-step-t').textContent);
      }
      // 做一張真的 LUT 檔（EM02 12-bit 格式，與 DG 第 3 部分下載的同一個產生器）
      var f = TCONDgLutFmt.fmtFromTcon('EM02', 12, 12, 256), body = [];
      for (var i = 0; i < 256; i++) body.push([i * 16, i * 16, i * 16]);
      var bytes = TCONXlsx.build([{ name: f.sheetName, rows: TCONDgLutFmt.lutRowsForFmt(f, body), merges: f.merges }]);
      scrolled.length = 0;
      dgConvImport(new File([bytes], 'q_test.xlsx')); await __wait(800);
      __ok('Q-C1 import worked', !!DG_CV && DG_CV.name === 'q_test.xlsx', $('dg-conv-status').textContent);
      var imp = C === 'EN' ? '① Import an RGB LUT file' : '① 匯入 RGB LUT 檔';
      __ok('Q-C1 ① collapsed to "✓ ①…（file name）"', has('dg-conv-step-imp', 'tc-step-done') && vis('dg-done-conv-imp')
        && $('dg-done-conv-imp').textContent === '✓ ' + imp + '（q_test.xlsx）' && !vis('dg-btn-conv-imp'), $('dg-done-conv-imp').textContent);
      __ok('Q-C1 ② is the current step (full) and got the focus', !has('dg-conv-step-dl', 'tc-step-done') && vis('dg-btn-conv-dl')
        && scrolled.indexOf('dg-btn-conv-dl') >= 0, JSON.stringify(scrolled));
      if (C === 'EN') { __done(); return; }
      var ac = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () {};
      $('dg-btn-conv-dl').click(); await __wait(200);
      HTMLAnchorElement.prototype.click = ac;
      __ok('Q-C2 after download ② collapses to "✓ ② 選目標深度並下載"', has('dg-conv-step-dl', 'tc-step-done') && $('dg-done-conv-dl').textContent === '✓ ② 選目標深度並下載'
        && vis('dg-conv-status'), $('dg-done-conv-dl').textContent);
      $('dg-done-conv-imp').click(); await __wait(50);
      __ok('Q-C3 click ✓ ① ⇒ expands (can import another file)', has('dg-conv-step-imp', 'tc-step-peek') && vis('dg-btn-conv-imp')
        && $('dg-done-conv-imp').textContent.indexOf('▾ ') === 0);
      $('dg-done-conv-imp').click(); await __wait(50);
      __ok('Q-C3 click again ⇒ collapsed', has('dg-conv-step-imp', 'tc-step-done') && !vis('dg-btn-conv-imp'));
      __ok('Q version = common/version.js dg (' + window.__expectDgVer + ')', TOOL_VERSIONS.dg === window.__expectDgVer, TOOL_VERSIONS.dg);
      __done(); return;
    }

    DG_WMODE = 'tcon'; DG_PQ = false; dgWmodeSync(); DG_ROUND = 1;
    __ok('Q0 nothing done yet ⇒ parts shown as before (not hidden, no ✓)', vis('dg-part-lut') && vis('dg-part-gray') && vis('dg-part-prim')
      && !has('dg-part-lut', 'tc-step-done') && !has('dg-part-gray', 'tc-step-done'));

    if (C === 'TYPE') {
      var g = rows(1).map(function (r) { return r.join('\t'); }).join('\n');
      $('dg-in-gray').value = g; dgRefreshReady(); await __wait(50);
      __ok('QT0 gray rows but no white point yet ⇒ part 2 not done', !has('dg-part-gray', 'tc-step-done'));
      var w = $('dg-in-white'); w.focus(); scrolled.length = 0;
      w.value = '0.3127\t0.3290'; w.dispatchEvent(new Event('input', { bubbles: true })); await __wait(100);
      __ok('QT1 typing inside part 2 completes it ⇒ not collapsed, not scrolled away (shown as "▾ …" look-back)',
        dgPartFilled('gray') && !has('dg-part-gray', 'tc-step-done') && has('dg-part-gray', 'tc-step-peek') && vis('dg-in-white')
        && scrolled.length === 0, JSON.stringify(scrolled));
      __done(); return;
    }

    // 第 2／3 部分由量測頁帶入
    DG_LIVE_TASKS[31] = 'gray'; DG_LIVE_TASK_KIND[31] = 'tcon';
    send({ type: 'dg-measure-result', mode: 'gray', task: 31, rows: rows(1), prim: prim, at: 'r1', cmpAsk: true });
    await __wait(200);
    __ok('Q1 part 2 and 3 done ⇒ pale "✓ 第 N 部分 …" lines', has('dg-part-gray', 'tc-step-done') && has('dg-part-prim', 'tc-step-done')
      && $('dg-done-gray').textContent.indexOf('✓ 第 2 部分') === 0 && $('dg-done-prim').textContent.indexOf('✓ 第 3 部分') === 0,
      $('dg-done-gray').textContent + ' | ' + $('dg-done-prim').textContent);
    var ln = $('dg-done-gray'), cs = getComputedStyle(ln), pc = getComputedStyle($('dg-part-gray'));
    __ok('Q1 same look as the self-test: small, pale, no frame', cs.fontSize === '13px' && parseFloat(cs.opacity) < 0.8
      && pc.borderTopColor === 'rgba(0, 0, 0, 0)' && pc.backgroundColor === 'rgba(0, 0, 0, 0)', cs.fontSize + ' ' + cs.opacity + ' ' + pc.borderTopColor);
    __ok('Q1 part 1 still the current one (full, not hidden)', !has('dg-part-lut', 'tc-step-done') && vis($('dg-part-lut').querySelector('.dg-part-head')));
    scrolled.length = 0;
    dgFillDefault(); dgRefreshReady(); await __wait(200);
    __ok('Q2 part 1 done ⇒ ✓ line too', has('dg-part-lut', 'tc-step-done') && $('dg-done-lut').textContent.indexOf('✓ 第 1 部分') === 0, $('dg-done-lut').textContent);
    __ok('Q2 focus moves to what to do now: 開始計算新的 RGB LUT', scrolled.indexOf('dg-calc-act') >= 0 && vis('dg-btn-calc'), JSON.stringify(scrolled));
    ln.click(); await __wait(50);
    __ok('Q3 click ✓ 第 2 部分 ⇒ expands (content visible, not folded)', has('dg-part-gray', 'tc-step-peek') && vis($('dg-part-gray').querySelector('.dg-part-body'))
      && ln.textContent.indexOf('▾ ') === 0 && ln.getAttribute('aria-expanded') === 'true');
    ln.click(); await __wait(50);
    __ok('Q3 click again ⇒ collapsed', has('dg-part-gray', 'tc-step-done') && !vis($('dg-part-gray').querySelector('.dg-part-body')));
    __ok('Q4 part 4 (confirm) is not collapsed by this', !has('dg-part-conf', 'tc-step-done'));
    __ok('Q version = common/version.js dg (' + window.__expectDgVer + ')', TOOL_VERSIONS.dg === window.__expectDgVer, TOOL_VERSIONS.dg);
  } catch (e) { window.__errs.push('scenario: ' + (e && e.stack || e)); }
  __done();
})();
