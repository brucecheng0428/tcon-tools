/* Q：dg「只看目前這一步」—— v2.4.4 做完縮成 ✓ 一行（common/done-step.*，與自檢頁同一套）＋
   v2.4.5 還沒走到的步驟整個不顯示、資料卡片流程跑完前收起（Bruce 2026-10-01「還沒走到的一定要隱藏，邏輯是一樣的」）。
   注入在 dg.html 的 IIFE 裡。__qCase：
     MAIN   校正分頁：工作模式 ✓；只有第 1 部分出現、第 2／3 部分與計算整個不顯示；第 2／3 部分由量測頁帶入 ⇒ ✓；
            第 1 部分 ⇒ ✓、計算出現並捲過去；點 ✓ 行展開／收回；樣式＝淡灰小字、沒有外框
     TYPE   他正在第 2 部分裡打字、打到齊了 ⇒ 不收起來、不捲走（改成展開回看的樣子）
     WMODE  還沒選工作模式 ⇒ 只有最上方那張卡；選了 ⇒ 縮成「✓ 電腦畫面量測」、第 1 部分出現；點 ✓ 行可以換
     FLOW   計算 ⇒ 計算 ✓、第 4 部分出現；輸出卡與設定卡收起（標題看得到、點得開）；查看目前結果 ⇒ 輸出卡打開、
            唯一實心＝下載；進行第二輪 ⇒ 第 1／2 部分、計算都是 ✓，停在第 4 部分（捲到那裡）
     UNLOCK 電腦畫面模式按了「解除依序限制」⇒ 還沒到的部分照樣顯示（那顆鈕的用途就是跳著做）
     CONV   深度轉換分頁：只有 ①；匯入一張真的 LUT 檔 ⇒ ✓ ①（帶檔名）、② 出現並捲過去；下載 ⇒ ✓ ②；點 ✓ 行展開
     EN     深度轉換分頁兩個步驟名跟著語言 */
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
    function hd(id) { return $(id).querySelector(':scope > .card-header'); }
    function solids() {
      return Array.prototype.filter.call(document.querySelectorAll('#dg-main-content .dg-btn.primary'), function (b) { return vis(b); })
        .map(function (b) { return b.id; });
    }
    var scrolled = [], osv = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (o) { scrolled.push(this.id || this.className); return osv.call(this, o); };

    if (C === 'CONV' || C === 'EN') {
      if (C === 'EN') { applyLang('en'); await __wait(100); }
      dgSwitchMode('conv'); await __wait(100);
      __ok('Q-C0 only ① at the start; ② not shown at all (not even its title)', vis('dg-btn-conv-imp') && !vis('dg-conv-step-dl')
        && !has('dg-conv-step-imp', 'tc-step-done'));
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
      __ok('Q-C1 ② appears as the current step (full) and got the focus', !has('dg-conv-step-dl', 'tc-step-done') && vis('dg-btn-conv-dl')
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
      dgConvClear(); await __wait(50);
      __ok('Q-C4 cleared ⇒ back to only ①', vis('dg-btn-conv-imp') && !vis('dg-conv-step-dl'));
      __ok('Q version = common/version.js dg (' + window.__expectDgVer + ')', TOOL_VERSIONS.dg === window.__expectDgVer, TOOL_VERSIONS.dg);
      __done(); return;
    }

    if (C === 'WMODE') {
      __ok('Q-W0 nothing chosen ⇒ only the mode card (full, no ✓), everything below hidden', vis('dg-btn-wmode-pc') && !has('dg-card-wmode', 'tc-step-done')
        && !vis('dg-card-setup') && !vis('dg-part-lut') && !vis('dg-calc-act'));
      scrolled.length = 0;
      dgWmodeSet('pc'); await __wait(200);
      __ok('Q-W1 chosen ⇒ mode card collapsed to "✓ 電腦畫面量測"', has('dg-card-wmode', 'tc-step-done') && $('dg-done-wmode').textContent === '✓ ' + dgT('dg.wmodePc')
        && !vis('dg-btn-wmode-pc'), $('dg-done-wmode').textContent);
      __ok('Q-W1 part 1 is the current step; parts 2/3 and 計算 not shown at all', vis($('dg-part-lut').querySelector('.dg-part-head'))
        && !vis('dg-part-gray') && !vis('dg-part-prim') && !vis('dg-calc-act'));
      __ok('Q-W1 focus moved to part 1', scrolled.indexOf('dg-part-lut') >= 0, JSON.stringify(scrolled));
      __ok('Q-W1 setup card folded (title visible, body hidden)', vis(hd('dg-card-setup')) && !vis($('dg-card-setup').querySelector('.card-body'))
        && hd('dg-card-setup').getAttribute('aria-expanded') === 'false');
      hd('dg-card-setup').click(); await __wait(50);
      __ok('Q-W2 click setup title ⇒ opens', vis('dg-gamma'));
      hd('dg-card-setup').click(); await __wait(50);
      __ok('Q-W2 click again ⇒ folded', !vis('dg-gamma'));
      $('dg-done-wmode').click(); await __wait(50);
      __ok('Q-W3 click ✓ line ⇒ mode buttons back (can switch)', has('dg-card-wmode', 'tc-step-peek') && vis('dg-btn-wmode-tcon'));
      $('dg-done-wmode').click(); await __wait(50);
      __ok('Q-W3 click again ⇒ collapsed', has('dg-card-wmode', 'tc-step-done') && !vis('dg-btn-wmode-tcon'));
      __ok('Q-W4 one solid button in part 1 (① 設定 RGB 的 LUT)', $('dg-btn-lut-setup').classList.contains('dg-btn-imp') && solids().length === 0, solids().join(','));
      __done(); return;
    }

    DG_WMODE = (C === 'UNLOCK') ? 'pc' : 'tcon'; DG_PQ = false; dgWmodeSync(); DG_ROUND = 1;
    await __wait(50);
    __ok('Q0 mode chosen ⇒ "✓ …" line on top', has('dg-card-wmode', 'tc-step-done'));
    __ok('Q0 only part 1 shown; parts 2/3 and 計算 hidden (not even titles)', vis($('dg-part-lut').querySelector('.dg-part-head'))
      && !vis('dg-part-gray') && !vis('dg-part-prim') && !vis('dg-calc-act') && !has('dg-part-lut', 'tc-step-done'));

    if (C === 'UNLOCK') {
      dgSeqUnlock = true; dgRefreshReady(); await __wait(50);
      __ok('Q-U1 unlocked ⇒ parts 2/3 shown (to skip ahead)', vis('dg-part-gray') && vis('dg-part-prim'));
      dgSeqUnlock = false; dgRefreshReady(); await __wait(50);
      __ok('Q-U2 re-locked ⇒ hidden again', !vis('dg-part-gray') && !vis('dg-part-prim'));
      __done(); return;
    }

    if (C === 'TYPE') {
      dgFillDefault(); dgRefreshReady(); await __wait(100);
      __ok('QT0 part 1 done ⇒ part 2 is now the current step (shown)', has('dg-part-lut', 'tc-step-done') && vis($('dg-part-gray').querySelector('.dg-part-head')) && !vis('dg-part-prim'),
        $('dg-part-lut').className + ' | ' + $('dg-part-gray').className + ' | ' + $('dg-part-prim').className + ' ingray=' + vis('dg-in-gray'));
      var g = rows(1).map(function (r) { return r.join('\t'); }).join('\n');
      $('dg-in-gray').value = g; dgRefreshReady(); await __wait(50);
      __ok('QT0 gray rows but no white point yet ⇒ part 2 not done', !has('dg-part-gray', 'tc-step-done'));
      var w = $('dg-in-white'); w.focus(); scrolled.length = 0;
      w.value = '0.3127\t0.3290'; w.dispatchEvent(new Event('input', { bubbles: true })); await __wait(100);
      __ok('QT1 typing inside part 2 completes it ⇒ not collapsed, not scrolled away (shown as "▾ …" look-back)',
        dgPartFilled('gray') && !has('dg-part-gray', 'tc-step-done') && has('dg-part-gray', 'tc-step-peek') && vis('dg-in-white')
        && scrolled.length === 0, JSON.stringify(scrolled));
      __ok('QT1 part 3 appears as the next step', vis('dg-part-prim'));
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
    __ok('Q1 part 1 still the current one (full); 計算 still hidden', !has('dg-part-lut', 'tc-step-done') && vis($('dg-part-lut').querySelector('.dg-part-head'))
      && !vis('dg-calc-act'));
    scrolled.length = 0;
    dgFillDefault(); dgRefreshReady(); await __wait(200);
    __ok('Q2 part 1 done ⇒ ✓ line too', has('dg-part-lut', 'tc-step-done') && $('dg-done-lut').textContent.indexOf('✓ 第 1 部分') === 0, $('dg-done-lut').textContent);
    __ok('Q2 開始計算 appears and gets the focus', scrolled.indexOf('dg-calc-act') >= 0 && vis('dg-btn-calc'), JSON.stringify(scrolled));
    __ok('Q2 the only solid button = 開始計算', solids().join(',') === 'dg-btn-calc', solids().join(','));
    ln.click(); await __wait(50);
    __ok('Q3 click ✓ 第 2 部分 ⇒ expands (content visible, not folded)', has('dg-part-gray', 'tc-step-peek') && vis($('dg-part-gray').querySelector('.dg-part-body'))
      && ln.textContent.indexOf('▾ ') === 0 && ln.getAttribute('aria-expanded') === 'true');
    ln.click(); await __wait(50);
    __ok('Q3 click again ⇒ collapsed', has('dg-part-gray', 'tc-step-done') && !vis($('dg-part-gray').querySelector('.dg-part-body')));

    if (C === 'FLOW') {
      $('dg-btn-calc').click(); await __wait(300);
      if ($('dg-modal-conf').classList.contains('open')) $('dg-btn-conf-no').click();
      await __wait(50);
      __ok('QF1 calculated ⇒ "✓ 開始計算新的 RGB LUT"; part 4 is the current step', has('dg-calc-act', 'tc-step-done')
        && $('dg-done-calc').textContent === '✓ 開始計算新的 RGB LUT' && vis('dg-btn-conf-setup') && !has('dg-card-p4', 'tc-step-done'), $('dg-done-calc').textContent + ' lut=' + !!lastLut + ' p4cls=' + $('dg-card-p4').className
        + ' modal=' + $('dg-modal-conf').className + ' confVis=' + vis('dg-btn-conf-setup') + ' res=' + $('dg-card-result').className);
      __ok('QF1 output card folded until the flow is done (title visible, click to open)', vis(hd('dg-card-result')) && !vis('dg-btn-lutfile')
        && has('dg-card-result', 'dg-fold'));
      hd('dg-card-result').click(); await __wait(50);
      __ok('QF2 click output title ⇒ opens (download reachable any time)', vis('dg-btn-lutfile'), JSON.stringify(DG_FS_FOLD) + ' ' + $('dg-card-result').className
        + ' body=' + getComputedStyle($('dg-card-result').querySelector('.card-body')).display + ' lf=' + getComputedStyle($('dg-btn-lutfile')).display + ' calc=' + $('dg-calc-act').className);
      hd('dg-card-result').click(); await __wait(50);
      __ok('QF2 click again ⇒ folded', !vis('dg-btn-lutfile'));
      DG_LIVE_TASKS[32] = 'conf'; DG_LIVE_TASK_KIND[32] = 'tcon';
      send({ type: 'dg-measure-result', mode: 'gray', task: 32, rows: rows(0.95), prim: prim, at: 'r2', cmpAsk: true });
      await __wait(150);
      __ok('QF3 confirmation in ⇒ decide box; the only solid = 查看目前結果', vis('dg-conf-decide') && solids().join(',') === 'dg-btn-view-result', solids().join(','));
      $('dg-btn-view-result').click(); await __wait(700);
      __ok('QF4 查看目前結果 ⇒ flow done: output card opens by itself, note shown', !has('dg-card-result', 'dg-fold') && vis('dg-view-note') && vis('dg-btn-lutfile'));
      __ok('QF4 data cards open (setup too)', vis('dg-gamma'));
      __ok('QF4 one solid button: 下載新產出 RGB LUT 檔 (查看目前結果 yields to outline)', solids().join(',') === 'dg-btn-lutfile', solids().join(','));
      __ok('QF4 part 4 still full (進行第二輪 reachable)', vis('dg-btn-next-round') && !has('dg-card-p4', 'tc-step-done'));
      $('dg-btn-next-round').click(); await __wait(900);
      if ($('dg-modal-conf').classList.contains('open')) $('dg-modal-conf-close').click();
      await __wait(50);
      __ok('QF5 round 2: parts 1/2/3 and 計算 are ✓, part 4 is where we stop', DG_ROUND === 2 && !!lastLut
        && ['dg-part-lut', 'dg-part-gray', 'dg-part-prim', 'dg-calc-act'].every(function (id) { return has(id, 'tc-step-done'); })
        && vis('dg-btn-conf-setup'), DG_ROUND);
      var r4 = $('dg-card-p4').getBoundingClientRect();
      __ok('QF5 scrolled to part 4 (not back to part 1)', r4.top > -120 && r4.top < window.innerHeight - 60, Math.round(r4.top));
      __ok('QF5 new round ⇒ output card folded again', has('dg-card-result', 'dg-fold'));
    } else {
      __ok('Q4 part 4 (confirm) is not collapsed by this', !has('dg-part-conf', 'tc-step-done'));
    }
    __ok('Q version = common/version.js dg (' + window.__expectDgVer + ')', TOOL_VERSIONS.dg === window.__expectDgVer, TOOL_VERSIONS.dg);
  } catch (e) { window.__errs.push('scenario: ' + (e && e.stack || e)); }
  __done();
})();
