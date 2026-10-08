/* R：dg v2.4.0 一輪結束的那一步並列「查看目前結果」與「進行第 N+1 輪」。注入在 dg.html 的 IIFE 裡。
   用產品自己的路徑跑一輪：量測頁訊息帶入第 2／3 部分 → 預設 LUT → 計算 → 確認量測帶入第 4 部分。
   驗：兩顆並列、「查看目前結果」是框裡唯一實心；按它只導覽（輪數、第 1～4 部分、比較清單都不動）、
       結果卡出現「停在第 N 輪」、「進行第 N+1 輪」照樣在而且按得下去；
       第 1 輪算完照舊問「要不要確認」（有「先不確認」）；第 2 輪起不再問，直接到下一層
       （電腦畫面＝path、自檢＝push、沒選模式＝wpick），「先不確認」那一層不出現；
       換一份確認量測 ⇒「停在第 N 輪」收掉。
   v2.4.7：電腦畫面／PQ 匯入（沒選模式）算完先停在「輸出」，下載 LUT 之後才問 ⇒ 這兩種先 takeLut() 再看視窗。
   __rCase：PC／TCON／NOMODE（行為）、SHOT-DECIDE／SHOT-VIEW／SHOT-NEXT（停在要截圖的畫面）。 */
(async function () {
  try {
    await __boot(1500);
    var C = window.__rCase || 'PC';
    /* 2026-10-09 去偶發：計算、捲動、量測頁訊息帶入之後，改成等畫面狀態到位（含逾時），不固定等 N ms。 */
    window.postMessage = function () {};
    function send(d) {
      window.dispatchEvent(new MessageEvent('message', { data: d, origin: window.location.origin, source: window }));
    }
    function rows(k) { var a = []; for (var g = 0; g < 256; g++) a.push([g, 0.3127, 0.329, Math.pow(g / 255, 2.2) * 200 * k + 0.1]); return a; }
    var prim = [['r', 0.64, 0.33, 40], ['g', 0.30, 0.60, 130], ['b', 0.15, 0.06, 15]];
    function vis(id) { var e = $(id); if (!e) return false; var r = e.getBoundingClientRect(); return e.offsetParent !== null && r.width > 0 && r.height > 0; }
    function confStep() {
      var m = $('dg-modal-conf');
      if (!m || !m.classList.contains('open')) return null;
      var s = null;
      Array.prototype.forEach.call(m.querySelectorAll('.dg-lut-step'), function (x) { if (x.style.display !== 'none') s = x.getAttribute('data-step'); });
      return s;
    }
    var mode = (C === 'TCON') ? 'tcon' : (C === 'NOMODE') ? null : 'pc';
    var byFile = mode !== 'tcon';
    function takeLut() {
      var ac = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () {};
      $('dg-btn-lutfile').click();
      HTMLAnchorElement.prototype.click = ac;
    }
    /* 直接設（不走 dgWmodeSet：tcon 會去開自檢分頁）。沒選模式＝走入口③（DG_PQ）。 */
    DG_WMODE = mode;
    DG_PQ = !mode;
    dgWmodeSync();
    DG_ROUND = 1;

    // ① 第 1 輪：第 2／3 部分由量測頁帶入、第 1 部分預設 LUT、計算
    DG_LIVE_TASKS[31] = 'gray'; DG_LIVE_TASK_KIND[31] = mode || 'pc';
    send({ type: 'dg-measure-result', mode: 'gray', task: 31, rows: rows(1), prim: prim, at: 'r1', cmpAsk: true });
    await __wait(50);
    dgFillDefault();
    await __wait(50);
    dgDoCalc();
    await __until(function () { return !!lastLut && (byFile ? vis('dg-btn-lutfile') : confStep() === 'ask'); });
    __ok('R0 round 1 has a result', !!lastLut, dgMissingParts().join(','));
    if (byFile) {
      __ok('R0 file mode: no question yet, output is the step', confStep() === null && vis('dg-btn-lutfile'), confStep());
      takeLut(); await __until(function () { return confStep() === 'ask'; });
    }
    __ok('R0 round 1 still asks "confirm?" (with 先不確認)', confStep() === 'ask' && vis('dg-btn-conf-no'), confStep());
    $('dg-btn-conf-no').click();
    __ok('R0 decide box hidden before any confirmation measurement', !vis('dg-conf-decide'));
    __ok('R0 ④ is solid when there is no confirmation yet', $('dg-btn-conf-setup').classList.contains('dg-btn-imp'));

    // ② 確認量測帶入第 4 部分 ⇒ 一輪結束的那一步
    DG_LIVE_TASKS[32] = 'conf'; DG_LIVE_TASK_KIND[32] = mode || 'pc';
    send({ type: 'dg-measure-result', mode: 'gray', task: 32, rows: rows(0.95), prim: prim, at: 'r2', cmpAsk: true });
    await __until(function () { return vis('dg-conf-decide') && vis('dg-btn-view-result') && vis('dg-btn-next-round'); });
    var box = $('dg-conf-decide');
    var bv = $('dg-btn-view-result'), bn = $('dg-btn-next-round');
    __ok('R1 decide box shown with both buttons side by side', vis('dg-conf-decide') && vis('dg-btn-view-result') && vis('dg-btn-next-round')
      && bv.parentNode === bn.parentNode && Math.abs(bv.getBoundingClientRect().top - bn.getBoundingClientRect().top) < 4);
    __ok('R1 labels: 查看目前結果 / 進行第二輪', bv.textContent === '查看目前結果' && bn.textContent === '進行第二輪', bn.textContent);
    __ok('R1 single primary in the box = 查看目前結果', box.querySelectorAll('.dg-btn.primary').length === 1
      && bv.classList.contains('primary') && !bn.classList.contains('primary'));
    __ok('R1 ④ yields to outline while the box is shown (only one solid in part 4)', !$('dg-btn-conf-setup').classList.contains('dg-btn-imp')
      && $('dg-card-p4').querySelectorAll('.dg-btn.primary, .dg-btn.dg-btn-imp, .dg-btn.dg-btn-live').length === 1);
    __ok('R1 view button comes first', bv.compareDocumentPosition(bn) & Node.DOCUMENT_POSITION_FOLLOWING);
    __ok('R1 no view note yet', !vis('dg-view-note'));

    if (C === 'SHOT-DECIDE') {
      var cr = box.getBoundingClientRect();
      window.scrollTo(0, Math.max(0, cr.top + window.pageYOffset - 380));
      await __wait(400);
      __done(); return;
    }

    // ③ 查看目前結果：只導覽
    var p4 = DG_P4, lut = lastLut, nSlots = DG_SLOTS.length, inLut = $('dg-in-lut').value, inGray = $('dg-in-gray').value;
    // 失敗時要看得出是誰捲走的：記下這之後所有程式捲動（只記錄，照常執行）
    var scrollLog = [], sT0 = Date.now(), oST = window.scrollTo, oSIV = Element.prototype.scrollIntoView;
    window.scrollTo = function (a, b) { scrollLog.push((Date.now() - sT0) + 'ms to ' + (typeof a === 'object' ? JSON.stringify(a) : a + ',' + b)); return oST.apply(window, arguments); };
    Element.prototype.scrollIntoView = function (o) { scrollLog.push((Date.now() - sT0) + 'ms into #' + (this.id || this.className)); return oSIV.call(this, o); };
    var lastSY = -1, onSc = function () { var y = Math.round(window.scrollY); if (Math.abs(y - lastSY) > 300 || y < 100) scrollLog.push((Date.now() - sT0) + 'ms y=' + y); lastSY = y; };
    window.addEventListener('scroll', onSc);
    window.scrollTo(0, document.body.scrollHeight);
    await __still();
    scrollLog.push((Date.now() - sT0) + 'ms click view');
    bv.click();
    // 等結果卡捲進來、捲動停下來才量位置（原本固定等 0.7 秒）
    await __until(function () { var q = $('dg-card-result').getBoundingClientRect(); return vis('dg-view-note') && q.top > -120 && q.top < window.innerHeight - 120; }, 8000);
    await __still();
    __ok('R2 view: nothing changed (round, parts 1-4, result, comparison)', DG_ROUND === 1 && DG_P4 === p4 && lastLut === lut
      && DG_SLOTS.length === nSlots && $('dg-in-lut').value === inLut && $('dg-in-gray').value === inGray);
    __ok('R2 view: no modal opened', confStep() === null);
    var rc = $('dg-card-result').getBoundingClientRect();
    var inView = rc.top > -120 && rc.top < window.innerHeight - 120;
    __ok('R2 view: scrolled to the result card', inView,
      Math.round(rc.top) + (inView ? '' : ' scrollY=' + Math.round(window.scrollY) + ' log=' + scrollLog.join(' | ')));
    window.scrollTo = oST; Element.prototype.scrollIntoView = oSIV; window.removeEventListener('scroll', onSc);
    var vn = $('dg-view-note');
    __ok('R2 view note: 停在第一輪 + where to go next', vis('dg-view-note') && vn.textContent.indexOf('停在第一輪') === 0
      && vn.textContent.indexOf('下載新產出 RGB LUT 檔') >= 0 && vn.textContent.indexOf('光學資料比較') >= 0
      && vn.textContent.indexOf('「進行第二輪」') >= 0, vn.textContent);
    __ok('R2 part 4 status says stopped, next round still available', ($('dg-conf-status').textContent || '').indexOf('已停在第一輪') === 0);
    __ok('R2 next-round button still there and enabled', vis('dg-btn-next-round') && !bn.disabled);
    bv.click(); await __wait(50);
    __ok('R2 pressing view twice is harmless', DG_ROUND === 1 && DG_P4 === p4 && vis('dg-view-note'));

    if (C === 'SHOT-VIEW') {
      window.scrollTo(0, Math.max(0, $('dg-card-result').getBoundingClientRect().top + window.pageYOffset - 90));
      await __wait(300);
      __done(); return;
    }

    // ④ 換一份確認量測 ⇒「停在第一輪」收掉（它講的是上一份）
    DG_LIVE_TASKS[33] = 'conf'; DG_LIVE_TASK_KIND[33] = mode || 'pc';
    send({ type: 'dg-measure-result', mode: 'gray', task: 33, rows: rows(0.93), prim: prim, at: 'r3', cmpAsk: true });
    await __until(function () { return DG_P4 !== p4 && !vis('dg-view-note'); });
    __ok('R3 new confirmation replaces the old ⇒ view note hidden', DG_P4 !== p4 && !vis('dg-view-note'));
    bv.click(); await __wait(50);
    __ok('R3 view again shows it for this one', vis('dg-view-note'));

    // ⑤ 之後仍然可以進行下一輪；第 2 輪算完不再問「要不要確認」
    bn.click();
    await __until(function () { return DG_ROUND === 2 && !!lastLut && (byFile ? vis('dg-btn-lutfile') : confStep() !== null); });
    __ok('R4 next round started (round 2)', DG_ROUND === 2 && !!lastLut, DG_ROUND);
    if (byFile) {
      __ok('R4 file mode: round 2 stops at the output first (no modal)', confStep() === null && vis('dg-btn-lutfile'), confStep());
      takeLut(); await __until(function () { return confStep() !== null; });
    }
    var want = mode === 'tcon' ? 'push' : mode === 'pc' ? 'path' : 'wpick';
    __ok('R4 round 2: no "confirm?" layer, straight to ' + want, confStep() === want, confStep());
    __ok('R4 先不確認 not shown anywhere', !vis('dg-btn-conf-no'));
    __ok('R4 view note gone with the old round', !vis('dg-view-note'));
    if (mode === 'pc') __ok('R4 pc: path layer shows the "update it yourself first" reminder', vis('dg-conf-path-pc'));
    if (C === 'SHOT-NEXT') { __done(); return; }
    // 關掉視窗 ＝ 不想現在量；之後自己按 ④ 回來
    $('dg-modal-conf-close').click();
    __ok('R5 closing the modal is still possible', confStep() === null);
    DG_LIVE_TASKS[34] = 'conf'; DG_LIVE_TASK_KIND[34] = mode || 'pc';
    send({ type: 'dg-measure-result', mode: 'gray', task: 34, rows: rows(0.97), prim: prim, at: 'r4', cmpAsk: true });
    await __until(function () { return vis('dg-btn-view-result') && bn.textContent === '進行第三輪'; });
    __ok('R5 round 2 end: same two buttons, next says 進行第三輪', vis('dg-btn-view-result') && bn.textContent === '進行第三輪', bn.textContent);
    bv.click(); await __wait(50);
    __ok('R5 view note says 停在第二輪', ($('dg-view-note').textContent || '').indexOf('停在第二輪') === 0);
    __ok('R version = common/version.js dg (' + window.__expectDgVer + ')', TOOL_VERSIONS.dg === window.__expectDgVer, TOOL_VERSIONS.dg);
  } catch (e) { window.__errs.push('scenario: ' + (e && e.stack || e)); }
  __done();
})();
