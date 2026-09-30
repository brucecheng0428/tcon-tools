/* L：v2.3.0「已送回 DG」醒目的下一步提示（window.__ctaCase 由 runner 指定；皆由 DG 開啟，分頁可見度用 pre.js 的 __hid 控制）。
   共同：主色實心藍、18px、↗、全頁唯一實心藍、自動捲到可視範圍、分頁標題加「↩ 請回 DG」並輪替、呼吸燈 2 秒無限循環。
   A ＝離開分頁後呼吸燈停、回來標題復原且不再重啟；換一份工作後清掉，下一次送出再亮。
   B ＝按「切到 DG 分頁」：呼叫 opener.focus()、呼吸燈停、標題復原；還留在本頁時顯示「瀏覽器沒有讓本頁切換分頁」說明。
   C ＝點提示文字本身：呼吸燈停、標題復原。
   RM＝prefers-reduced-motion：不動畫、改靜態光暈、標題不輪替。
   EN＝英文介面文字。 */
(async function () {
  try {
    var T = window.__ctaCase || 'A';
    await __wait(1500);
    var bw = document.getElementById('dst-back-warn');
    var orig = document.title;
    function solidBlue() { var n = 0, who = [];
      document.querySelectorAll('button,a,div,span').forEach(function (e) { var cs = getComputedStyle(e);
        if (cs.backgroundColor === __BLUE && e.offsetParent) { n++; who.push(e.id || e.className); } });
      return [n, who.join(',')]; }
    __ok('L0 from DG, before send: no cta', dstDgAlive() && !bw.classList.contains('dst-back-cta'));
    window.scrollTo(0, 0);
    /* v2.7.4：這個情境不接硬體，直接把步驟設成做完 ⇒ 整頁依序出現要先走到「步驟卡」那一階（否則步驟卡不出現）。 */
    dstAlignDone = true; dstPgMax = 3;
    dstStepDone.gray = true; dstStepDone.prim = true; dstStepDone.lut = true;
    dstRenderSteps();
    var cs = getComputedStyle(bw);
    __ok('L1 cta class', bw.classList.contains('dst-back-cta'));
    __ok('L1 bg primary solid', cs.backgroundColor === __BLUE, cs.backgroundColor);
    __ok('L1 font 18px', cs.fontSize === '18px', cs.fontSize);
    __ok('L1 icon ↗', bw.textContent.indexOf('↗') >= 0);
    __ok('L1 text', bw.textContent.indexOf('已送回 DG') >= 0, bw.textContent);
    __ok('L1 focus button', !!document.getElementById('dst-back-focus'));
    var rm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    __ok('L1 reduced-motion media = ' + (T === 'RM'), rm === (T === 'RM'));
    if (T === 'RM') {
      __ok('L1 RM: no animation', cs.animationName === 'none', cs.animationName);
      __ok('L1 RM: static glow', cs.boxShadow !== 'none', cs.boxShadow);
    } else {
      __ok('L1 breath anim 2s infinite', cs.animationName === 'dst-back-breath' && cs.animationDuration === '2s' && cs.animationIterationCount === 'infinite',
        cs.animationName + ' ' + cs.animationDuration + ' ' + cs.animationIterationCount);
    }
    var sb = solidBlue(); __ok('L1 only one solid blue (the cta)', sb[0] === 1 && sb[1] === 'dst-back-warn', sb[0] + ' ' + sb[1]);
    __ok('L1 no .dst-main', document.querySelectorAll('.dst-main').length === 0);
    __ok('L1 title prefixed', document.title.indexOf('↩ 請回 DG') === 0, document.title);
    var t1 = document.title;
    dstRenderSteps(); __ok('L1 rerender keeps breath/title', bw.classList.contains('dst-back-breath') && document.title === t1);
    await __wait(1100);
    var r = bw.getBoundingClientRect();
    __ok('L2 scrolled into view', r.top >= 0 && r.bottom <= innerHeight, Math.round(r.top) + '..' + Math.round(r.bottom) + ' / ' + innerHeight + ' scrollY=' + Math.round(scrollY));
    var t2 = document.title;
    if (T === 'RM') __ok('L2 RM: title static (no alternation)', t2 === t1, t2);
    else __ok('L2 title alternates', t2 === orig, t2);
    if (T === 'A' || T === 'RM') {
      window.__hid = true; document.dispatchEvent(new Event('visibilitychange'));
      __ok('L3 leave: breath stops', !bw.classList.contains('dst-back-breath') && getComputedStyle(bw).animationName === 'none');
      __ok('L3 leave: cta still there', bw.classList.contains('dst-back-cta'));
      await __wait(1200);
      __ok('L3 leave: title still flashing/prefixed', dstBackTitleOn);
      window.__hid = false; document.dispatchEvent(new Event('visibilitychange'));
      __ok('L4 return: title restored', document.title === orig && !dstBackTitleOn, document.title);
      dstRenderSteps();
      __ok('L4 return+rerender: breath not restarted', !bw.classList.contains('dst-back-breath') && document.title === orig);
      dstClearRound(1, false);
      __ok('L5 new job: cta gone', !bw.classList.contains('dst-back-cta'));
      dstStepDone.gray = true; dstStepDone.prim = true; dstRenderSteps();
      __ok('L5 new job sent: breath+title again', bw.classList.contains('dst-back-breath') && document.title.indexOf('↩') === 0);
      dstClearRound(1, false); dstRenderSteps();
      __ok('L5 clear while flashing: title restored', document.title === orig && !dstBackTitleOn, document.title);
    } else if (T === 'C') {
      bw.querySelector('.dst-cta-txt').click();
      __ok('L3 click cta: breath stops', !bw.classList.contains('dst-back-breath'));
      __ok('L3 click cta: title restored', document.title === orig, document.title);
      await __wait(1500);
      __ok('L3 click cta: title stays restored', document.title === orig);
    } else if (T === 'B') {
      document.getElementById('dst-back-focus').click();
      __ok('L3 button: opener.focus called', window.__focusCalls === 1, window.__focusCalls);
      __ok('L3 button: breath stops', !bw.classList.contains('dst-back-breath'));
      __ok('L3 button: title restored', document.title === orig, document.title);
      await __wait(700);
      var sub = document.getElementById('dst-back-sub');
      __ok('L3 button: fallback note shown when still here', sub && !sub.classList.contains('dst-hidden') && sub.textContent.indexOf('瀏覽器沒有讓本頁切換分頁') === 0, sub && sub.textContent);
      dstRenderSteps(); var s2 = document.getElementById('dst-back-sub');
      __ok('L3 note survives rerender', s2 && !s2.classList.contains('dst-hidden'));
    } else if (T === 'EN') {
      applyLang('en'); dstRenderSteps(); await __wait(100);
      __ok('L3 en text', bw.textContent.indexOf('Sent back to DG') >= 0 && !/[一-鿿]/.test(bw.textContent), bw.textContent);
      __ok('L3 en still cta + solid blue', bw.classList.contains('dst-back-cta') && getComputedStyle(bw).backgroundColor === __BLUE);
      applyLang('zh-CN'); dstRenderSteps(); await __wait(100);
      __ok('L3 zh-CN text', bw.textContent.indexOf('已送回 DG，请切回 DG 分页继续') >= 0, bw.textContent);
      applyLang('zh-TW');
      __checkVersion('L4');
    }
  } catch (e) { window.__errs.push('test threw: ' + (e && e.stack || e)); }
  __done();
})();
