/* Z：v2.7.3「只看當下這一步」（Bruce 2026-10-01 核准）。window.__zCase 由 runner 指定。
   R1   ＝第 1 輪（從 DG 開）：① 是當下、②③／④ 完全不顯示、進度條不顯示、資料卡收起 ⇒ 做完 ① ⇒ ① 縮成淡灰
          「✓ ①…」一行（點一下展開、再點收回）、②③ 是當下、全頁唯一實心＝開始量測 ⇒ 量完 ⇒ ④ 出現並醒目、
          ②③ 也縮成一行、資料卡自動展開、基準量測沒有決策框
   MAN  ＝資料卡隨時可以自己點開／收起（滑鼠與鍵盤），流程還沒跑完也可以
   R2   ＝第 2 輪：自動開 DG_EN ＋ ① 自動完成 ⇒ 直接停在 ②③，① 是「✓」淡灰行
   CONF ＝確認量測量完：④ 醒目＋決策框緊接在下面，兩者一起是焦點（決策框在 ④ 正下方）
   EN   ＝做完那一行的字跟著語言
   NODG ＝不是從 DG 開的 ⇒ 不收合任何東西（維持全部攤開） */
(async function () {
  var C = window.__zCase || 'R1';
  function tx(id) { return __txt(id) || ''; }
  function blues() {
    return Array.prototype.filter.call(document.querySelectorAll('button, .dst-back-cta'), function (el) {
      return el.offsetParent !== null && getComputedStyle(el).backgroundColor === __BLUE; }).map(function (el) { return el.id || el.className; });
  }
  var CARDS = ['dst-lut-card', 'dst-meas-card', 'dst-log-card'];
  function folded() { return CARDS.filter(function (id) { return __cls(id, 'dst-fold'); }); }
  if (window.opener) window.opener.postMessage = function (m) {
    if (m.type === 'dg-cmp-query') setTimeout(function () {
      dstCmpOnInfo({ type: 'dg-cmp-info', task: m.task, count: 1, max: 10, list: [], round: dstDgRound, job: dstDgJob, name: 'x', same: null, full: false });
    }, 20);
  };
  try {
    window.__lutFill = true;
    if (C === 'EN') applyLang('en');
    await __boot(500); await __arm(); await __settle();

    if (C === 'NODG') {
      __ok('Z-NODG no focus mode', !__cls('dst-steps-card', 'dst-focus'));
      __ok('Z-NODG data cards not folded', folded().length === 0, folded().join(','));
      __ok('Z-NODG ②③ visible', __vis('dst-go-gray'));
      __checkVersion('Z-NODG'); throw 'done';
    }
    __ok('Z0 focus mode on (from DG)', __cls('dst-steps-card', 'dst-focus'));

    if (C === 'R2') {
      await dstDgAutoThenStep1('connect');
      await __untilIdle(function () { return !!dstStepDone.lut && __cls('dst-group23', 'dst-fs-cur') && __vis('dst-go-gray') && __vis('dst-fs-line-lut'); });
      __ok('Z-R2 ① done automatically (sent to DG part 1)', !!dstStepDone.lut, JSON.stringify(dstStepDone));
      __ok('Z-R2 starts at ②③: ② box is current, its button visible', __cls('dst-group23', 'dst-fs-cur') && __vis('dst-go-gray'));
      __ok('Z-R2 ① shown as a pale done line only', __vis('dst-fs-line-lut') && tx('dst-fs-line-lut') === '✓ ① 讀回目前的 RGB LUT' && !__vis('dst-go-lut'), tx('dst-fs-line-lut'));
      __ok('Z-R2 ④ not shown yet', !__vis('dst-box-back'));
      __checkVersion('Z-R2'); throw 'done';
    }

    // ── 第 1 輪、剛打開 ──
    __ok('Z1 ① is current (full)', __cls('dst-box-lut', 'dst-fs-cur') && __vis('dst-go-lut'));
    __ok('Z1 ②③ not shown at all (no title)', !__vis('dst-group23') && !__vis('dst-step-gray-t'));
    __ok('Z1 ④ not shown at all', !__vis('dst-box-back') && !__vis('dst-back-warn'));
    __ok('Z1 progress bar not shown before a run', !__vis('dst-steps-prog') && !__vis('dst-steps-progtxt'));
    __ok('Z1 data cards folded (header visible, body hidden)', folded().length === 3 && !__vis('dst-lut-state') && !__vis('dst-res-wrap')
      && document.querySelector('#dst-lut-card .dst-fold-ico').textContent === '▸', folded().join(','));

    if (C === 'MAN') {
      var hd = document.querySelector('#dst-meas-card > .card-header');
      hd.click(); await __wait(50);
      __ok('Z-MAN click header opens the card before the flow is done', !__cls('dst-meas-card', 'dst-fold') && hd.getAttribute('aria-expanded') === 'true'
        && document.querySelector('#dst-meas-card .dst-fold-ico').textContent === '▾');
      hd.click(); await __wait(50);
      __ok('Z-MAN click again folds it', __cls('dst-meas-card', 'dst-fold'));
      document.querySelector('#dst-lut-card > .card-header').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await __wait(50);
      __ok('Z-MAN keyboard Enter opens too', !__cls('dst-lut-card', 'dst-fold') && __vis('dst-lut-state'));
      __checkVersion('Z-MAN'); throw 'done';
    }

    // ── 做完 ① ──
    await dstStepLut();
    await __untilIdle(function () { return !!dstStepDone.lut && __cls('dst-box-lut', 'tc-step-done') && __cls('dst-group23', 'dst-fs-cur') && __vis('dst-go-gray'); });
    __ok('Z2 ① done (sent to DG)', !!dstStepDone.lut);
    __ok('Z2 ① collapsed to a pale "✓ ①" line', __cls('dst-box-lut', 'tc-step-done') && __vis('dst-fs-line-lut') && !__vis('dst-go-lut')
      && (C === 'EN' ? tx('dst-fs-line-lut') === '✓ ' + I18N['dst.stepLut'].en : tx('dst-fs-line-lut') === '✓ ① 讀回目前的 RGB LUT')
      && parseFloat(getComputedStyle(document.getElementById('dst-fs-line-lut')).opacity) < 0.8, tx('dst-fs-line-lut'));
    __ok('Z2 ②③ now current and shown', __cls('dst-group23', 'dst-fs-cur') && __vis('dst-go-gray'));
    __ok('Z2 ④ still hidden', !__vis('dst-box-back'));
    __ok('Z2 only one solid button = 開始量測', blues().length === 1 && blues()[0] === 'dst-go-gray', blues().join(','));
    if (C === 'EN') { __checkVersion('Z-EN'); throw 'done'; }
    document.getElementById('dst-fs-line-lut').click(); await __wait(50);
    __ok('Z3 click the done line ⇒ expands to look back', __cls('dst-box-lut', 'tc-step-peek') && __vis('dst-go-lut') && tx('dst-fs-line-lut').indexOf('▾ ') === 0);
    document.getElementById('dst-fs-line-lut').click(); await __wait(50);
    __ok('Z3 click again ⇒ collapsed again', __cls('dst-box-lut', 'tc-step-done') && !__vis('dst-go-lut'));

    // ── 量完 ──
    await dstRun();
    // 2026-10-09 去偶發：等「加入比較」視窗真的開了再按「不加入」，再等 ④ 與資料卡都到位、捲動停下來才量（原本固定 0.2＋1.2 秒）
    await __until(function () { return document.getElementById('dst-modal-cmp').classList.contains('open') && dstCmpPhase !== 'ask'; }, 5000);
    if (document.getElementById('dst-modal-cmp').classList.contains('open')) { document.getElementById('dst-cmp-cancel').click(); }
    await __untilIdle(function () { return __cls('dst-group23', 'tc-step-done') && __cls('dst-box-back', 'dst-fs-hot') && folded().length === 0 && __vis('dst-res-wrap')
      && (C !== 'CONF' || (__vis('dst-dec') && document.getElementById('dst-box-back').getBoundingClientRect().top >= 0
        && document.getElementById('dst-dec').getBoundingClientRect().bottom <= window.innerHeight)); });
    await __still();
    __ok('Z4 ②③ collapsed to a done line', __cls('dst-group23', 'tc-step-done') && __vis('dst-fs-line-g23') && tx('dst-fs-line-g23').indexOf('✓ ') === 0, tx('dst-fs-line-g23'));
    __ok('Z4 ④ shown in full and highlighted (current)', __cls('dst-box-back', 'dst-fs-hot') && __vis('dst-back-warn') && __vis('dst-cmp-row'));
    __ok('Z4 data cards opened automatically once the flow is done', folded().length === 0 && __vis('dst-res-wrap'), folded().join(','));
    __ok('Z4 progress bar hidden again after the run', !__vis('dst-steps-prog'));
    if (C === 'CONF') {
      var dec = document.getElementById('dst-dec');
      __ok('Z-CONF decision box right under ④ and shown', __vis('dst-dec') && document.getElementById('dst-box-back').nextElementSibling === dec);
      var rb = document.getElementById('dst-box-back').getBoundingClientRect(), rd = dec.getBoundingClientRect();
      __ok('Z-CONF ④ and the decision box are both on screen (focus)', rb.top >= 0 && rd.bottom <= window.innerHeight,
        Math.round(rb.top) + '..' + Math.round(rd.bottom) + ' / ' + window.innerHeight);
      __checkVersion('Z-CONF'); throw 'done';
    }
    __ok('Z4 baseline measurement: no decision box', !__vis('dst-dec'));
    __checkVersion('Z-R1');
  } catch (e) { if (e !== 'done') window.__errs.push('test threw: ' + (e && e.stack || e)); }
  __done();
})();
