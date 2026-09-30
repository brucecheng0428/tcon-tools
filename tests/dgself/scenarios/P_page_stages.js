/* P：v2.7.4 整頁照步驟依序出現（Bruce 2026-10-01 核准）。window.__pCase 由 runner 指定。
   SEQ    ＝開頁只有「讀寫 I2C 治具」→ I2C 通 ⇒ T-CON／量測儀群組 → IC＋量測儀 ⇒ 畫面測試卡（唯一實心＝對位畫面）
            → 按「對位畫面」⇒ 步驟卡出現、硬體卡與畫面測試卡縮成 ✓ 一行（點開／收回）、捲到步驟卡
   DROPLN ＝對位後 I2C 斷線 ⇒ 已出現的區塊不藏回去、最上方「I2C 已斷線…」是目前這一步、硬體卡展開；重連 ⇒ 回到步驟卡
   DROPCA ＝同上，量測儀斷線
   RELOAD ＝重新整理（這個分頁剛才連著、對位過）⇒ 硬體自動重連成功 ⇒ 直接到步驟卡
   R2     ＝同一次作業的第 2 輪（DG 帶 round=2）⇒ 硬體與對位視為已完成（✓），直接停在 ②
   EN     ＝斷線提示與 ✓ 行跟著語言
   NODG   ＝不是從 DG 開的 ⇒ 不分階段，全部照舊攤開 */
(function () {
  /* 同步段（在 dstBind 之前跑）：模擬「重新整理之前這個分頁連著、也對位過」。 */
  if (window.__pCase === 'RELOAD') {
    try { sessionStorage.setItem('dst-pg-v1', JSON.stringify({ aligned: true, ln: true, ca: true })); } catch (e) {}
    try { Object.defineProperty(navigator, 'serial', { configurable: true, value: { getPorts: async function () { return [{}]; } } }); } catch (e) {}
    window.__reconn = { ln: 0, ca: 0 };
    dstConnect = async function () {
      window.__reconn.ln++;
      dstWs = __fakeWs(); dstWs.onmessage = dstOnMessage; dstLinked = true;
      dstIc = DST_ICS.filter(function (x) { return x.key === 'EM02A1'; })[0];
    };
    dstCaOpen = async function () { window.__reconn.ca++; dstCaLinked = true; return true; };
  }
})();
(async function () {
  var C = window.__pCase || 'SEQ';
  function tx(id) { return __txt(id) || ''; }
  function blues() {
    return Array.prototype.filter.call(document.querySelectorAll('button, .dst-back-cta'), function (el) {
      return el.offsetParent !== null && getComputedStyle(el).backgroundColor === __BLUE; }).map(function (el) { return el.id || el.className; });
  }
  function cardVis(id) { var e = document.getElementById(id); return !!(e && e.offsetParent !== null); }
  var DATA = ['dst-lut-card', 'dst-meas-card', 'dst-log-card'];
  try {
    window.__lutFill = true;
    if (C === 'EN') applyLang('en');
    await __wait(500);

    if (C === 'RELOAD') {
      await __wait(3500);
      __ok('P-RELOAD reconnected both (I2C via the ON path, meter via the granted port)', window.__reconn.ln === 1 && window.__reconn.ca === 1 && dstLinked && dstCaLinked, JSON.stringify(window.__reconn));
      __ok('P-RELOAD went straight to the step card', cardVis('dst-steps-card') && __cls('dst-test-card', 'dst-pg-done') && __cls('dst-hw-card', 'dst-pg-done'));
      __checkVersion('P-RELOAD'); throw 'done';
    }
    await __arm(); await __wait(300);
    if (C === 'NODG') {
      __ok('P-NODG no staging: test card, step card, data cards all shown', cardVis('dst-test-card') && cardVis('dst-steps-card') && DATA.every(cardVis));
      __ok('P-NODG no ✓ lines', !__cls('dst-hw-card', 'dst-pg-done') && !__cls('dst-test-card', 'dst-pg-done'));
      __checkVersion('P-NODG'); throw 'done';
    }
    if (C === 'R2') {
      dstAlignDone = false; dstPgMax = 0; dstRenderBtns();
      __ok('P-R2 round 2: hardware and alignment count as done (✓ lines), step card shown',
        __cls('dst-hw-card', 'dst-pg-done') && __cls('dst-test-card', 'dst-pg-done') && cardVis('dst-steps-card'));
      await dstDgAutoThenStep1('connect'); await __wait(3000);
      __ok('P-R2 stops at ②', __cls('dst-group23', 'dst-fs-cur') && __vis('dst-go-gray') && !!dstStepDone.lut);
      __checkVersion('P-R2'); throw 'done';
    }

    // ── 回到「剛開頁」：什麼都還沒連、沒對位（__arm 已把量測／出圖 I/O 換成假的）──
    dstAlignDone = false; dstPgMax = 0; dstLinked = false; dstIc = null; dstCaLinked = false;
    try { sessionStorage.removeItem('dst-pg-v1'); } catch (e) {}
    dstRenderBtns(); await __wait(50);
    __ok('P0 only the hardware card, only the I2C group', cardVis('dst-hw-card') && __vis('dst-hwgrp-bridge')
      && !__vis('dst-hwgrp-tcon') && !__vis('dst-hwgrp-meter'));
    __ok('P0 test card, step card, data cards not shown at all', !cardVis('dst-test-card') && !cardVis('dst-steps-card') && DATA.every(function (id) { return !cardVis(id); }));
    __ok('P0 summary line has no T-CON / meter bits yet', !__vis('dst-hw-sum') && !__vis('dst-casw-slot-sum'));
    __ok('P0 no "all three must be connected" note while only one is shown', !document.querySelector('#dst-hw-card [data-i18n="dst.hwNote"]').offsetParent);
    __ok('P0 no drop alert, at most one solid button', !__vis('dst-pg-alert') && blues().length <= 1, blues().join(','));

    if (C === 'SEQ' || C === 'EN') {
      dstLinked = true; dstWs = __fakeWs(); dstWs.onmessage = dstOnMessage; dstRenderBtns(); await __wait(50);
      __ok('P1 I2C on ⇒ T-CON and meter groups appear', __vis('dst-hwgrp-tcon') && __vis('dst-hwgrp-meter'));
      __ok('P1 test card still hidden', !cardVis('dst-test-card') && !cardVis('dst-steps-card'));
      dstIc = DST_ICS.filter(function (x) { return x.key === 'EM02A1'; })[0]; dstRenderBtns(); await __wait(50);
      __ok('P1 IC identified but meter not on ⇒ still no test card', !cardVis('dst-test-card'));
      dstCaLinked = true; dstRenderBtns(); await __wait(50);
      __ok('P2 meter on ⇒ test card appears (full), step card still hidden', cardVis('dst-test-card') && __vis('dst-align') && !cardVis('dst-steps-card'));
      __ok('P2 the only solid button = 對位畫面', blues().length === 1 && blues()[0] === 'dst-align', blues().join(','));
      window.scrollTo(0, 0);
      var scrolled = [], osv = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = function (o) { scrolled.push(this.id || this.className); return osv.call(this, o); };
      document.getElementById('dst-align').click(); await __wait(1500);
      __ok('P3 alignment shown', dstShowing === 'align');
      __ok('P3 step card appears', cardVis('dst-steps-card') && __vis('dst-go-lut'));
      __ok('P3 test card and hardware card collapsed to pale ✓ lines', __cls('dst-test-card', 'dst-pg-done') && __cls('dst-hw-card', 'dst-pg-done')
        && !__vis('dst-align') && !__vis('dst-hwgrp-bridge')
        && document.querySelector('#dst-test-card .dst-pg-ico').textContent === '✓'
        && parseFloat(getComputedStyle(document.querySelector('#dst-test-card > .card-header')).opacity) < 0.8);
      var r = document.getElementById('dst-steps-card').getBoundingClientRect();
      __ok('P3 scrolled to the step card (scrollIntoView on it; ends near the top)', scrolled.indexOf('dst-steps-card') >= 0 && r.top >= -2 && r.top < 220,
        JSON.stringify(scrolled) + ' top=' + Math.round(r.top) + ' scrollY=' + window.scrollY);
      __ok('P3 data cards present (folded until the flow is done)', DATA.every(cardVis) && DATA.every(function (id) { return __cls(id, 'dst-fold'); }));
      __ok('P3 remembered for a reload (sessionStorage)', JSON.parse(sessionStorage.getItem('dst-pg-v1') || '{}').aligned === true);
      __ok('P3 the only solid button is in the step card now', blues().length === 1 && document.getElementById('dst-steps-card').contains(document.getElementById(blues()[0])), blues().join(','));
      if (C === 'EN') {
        __ok('P-EN ✓ line header keeps its (English) title', /Test pattern|Screen test|test/i.test(tx('dst-test-card') || document.querySelector('#dst-test-card > .card-header').textContent), document.querySelector('#dst-test-card > .card-header').textContent);
        dstLinked = false; dstRenderBtns(); await __wait(50);
        __ok('P-EN drop alert in English', tx('dst-pg-alert') === 'The I2C link dropped — reconnect it (switch “I2C read/write adapter” back to ON).', tx('dst-pg-alert'));
        __checkVersion('P-EN'); throw 'done';
      }
      var th = document.querySelector('#dst-test-card > .card-header');
      th.click(); await __wait(50);
      __ok('P4 click the ✓ line ⇒ test card expands (can re-align)', __cls('dst-test-card', 'dst-pg-peek') && __vis('dst-align') && document.querySelector('#dst-test-card .dst-pg-ico').textContent === '▾');
      th.click(); await __wait(50);
      __ok('P4 click again ⇒ collapsed', __cls('dst-test-card', 'dst-pg-done') && !__vis('dst-align'));
      __checkVersion('P-SEQ'); throw 'done';
    }

    // DROPLN／DROPCA：先走到步驟卡
    dstLinked = true; dstIc = DST_ICS.filter(function (x) { return x.key === 'EM02A1'; })[0]; dstCaLinked = true;
    dstAlignDone = true; dstRenderBtns(); await __wait(50);
    __ok('PD0 at the step card', cardVis('dst-steps-card') && __cls('dst-hw-card', 'dst-pg-done'));
    if (C === 'DROPLN') { dstLinked = false; } else { dstCaLinked = false; }
    dstRenderBtns(); await __wait(50);
    var msg = (C === 'DROPLN') ? 'I2C 已斷線，請重新連線（「讀寫 I2C 治具」切回 ON）。' : '光學量測儀已斷線，請重新連線（「光學量測儀」切回 ON）。';
    __ok('PD1 alert at the top is the current step', __vis('dst-pg-alert') && tx('dst-pg-alert') === msg
      && document.getElementById('dst-pg-alert').getBoundingClientRect().top < document.getElementById('dst-hw-card').getBoundingClientRect().top, tx('dst-pg-alert'));
    __ok('PD1 nothing hidden again (test card, step card, data cards stay)', cardVis('dst-test-card') && cardVis('dst-steps-card') && DATA.every(cardVis));
    __ok('PD1 hardware card expanded (the reconnect switch is right there)', !__cls('dst-hw-card', 'dst-pg-done')
      && (C === 'DROPLN' ? __vis('dst-lnsw-on') : __vis('dst-casw-on')));
    __ok('PD1 no solid step button while disconnected', blues().filter(function (id) { return /dst-go-/.test(id); }).length === 0, blues().join(','));
    if (C === 'DROPLN') { dstLinked = true; } else { dstCaLinked = true; }
    dstRenderBtns(); await __wait(50);
    __ok('PD2 reconnected ⇒ alert gone, back to the step card', !__vis('dst-pg-alert') && __cls('dst-hw-card', 'dst-pg-done') && cardVis('dst-steps-card'));
    __checkVersion('P-' + C);
  } catch (e) { if (e !== 'done') window.__errs.push('test threw: ' + (e && e.stack || e)); }
  __done();
})();
