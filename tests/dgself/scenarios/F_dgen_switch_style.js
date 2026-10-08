/* F：DG_EN 分段開關的樣式與狀態：ON 綠／OFF 灰實心＋●、未選中外框＋○、切換中…（◌、虛線、aria-busy）、讀回不符時退回、量測中停用但保留底色、三語。 */
(async function () {
  try {
    await __boot(500); await __arm(); await __settle();
    /* 2026-10-09 去偶發：「切換中…」是中間態。原本假 Bridge 每筆延遲 300ms、點下後固定等 60ms 才看 —— CI 一卡頓就錯過。
       改成每筆延遲 PEND ms（中間態至少維持這麼久）、點下後「等到出現切換中…」才判斷；確認結果改成「等到讀回完成」。 */
    var PEND = 1200;
    function swDone() { return !__busy() && !__cls('dst-dgsw-on', 'pending') && !__cls('dst-dgsw-off', 'pending'); }
    function lb(id) { var e = document.querySelector('#' + id + ' .dst-sw-lb'); return e ? e.textContent : null; }
    function ic(id) { var e = document.querySelector('#' + id + ' .dst-sw-ic'); return e ? e.textContent : null; }
    function bg(id) { return getComputedStyle(document.getElementById(id)).backgroundColor; }
    function fg(id) { return getComputedStyle(document.getElementById(id)).color; }
    function bd(id) { return getComputedStyle(document.getElementById(id)).borderTopStyle; }
    var GREEN = 'rgb(22, 163, 74)', GRAY = 'rgb(100, 116, 139)', WHITE = 'rgb(255, 255, 255)';
    var box = document.getElementById('dst-hw-more');
    __ok('F1 summary: labels ON/OFF', lb('dst-dgsw-on') === 'ON' && lb('dst-dgsw-off') === 'OFF', lb('dst-dgsw-on') + '/' + lb('dst-dgsw-off'));
    __ok('F1 summary: ON selected = green solid + white + ●', bg('dst-dgsw-on') === GREEN && fg('dst-dgsw-on') === WHITE && ic('dst-dgsw-on') === '●', bg('dst-dgsw-on') + ' ' + fg('dst-dgsw-on'));
    __ok('F1 summary: OFF unselected = no fill + ○', /rgba\(0, 0, 0, 0\)|transparent/.test(bg('dst-dgsw-off')) && ic('dst-dgsw-off') === '○', bg('dst-dgsw-off'));
    __ok('F1 no 開/關 text left on the switch', !/[開關开关]/.test(document.getElementById('dst-dgsw').textContent.replace(/DG_EN/, '')), document.getElementById('dst-dgsw').textContent);
    box.open = true; await __until(function () { return document.getElementById('dst-dgsw').parentNode.id === 'dst-dgsw-slot-row'; });
    __ok('F2 T-CON row: same node, same look', document.getElementById('dst-dgsw').parentNode.id === 'dst-dgsw-slot-row' && bg('dst-dgsw-on') === GREEN && lb('dst-dgsw-on') === 'ON');
    // pending: slow bridge
    window.__replyDelay = PEND;
    __clickSw('off'); await __until(function () { return lb('dst-dgsw-off') === '切換中…'; }, PEND);
    __ok('F3 pending: OFF shows 切換中… + ◌ + dashed', lb('dst-dgsw-off') === '切換中…' && ic('dst-dgsw-off') === '◌' && bd('dst-dgsw-off') === 'dashed' && __cls('dst-dgsw-off', 'pending'), lb('dst-dgsw-off') + ' ' + bd('dst-dgsw-off'));
    __ok('F3 pending: still ON lit (not yet confirmed), both disabled', __cls('dst-dgsw-on', 'on') && bg('dst-dgsw-on') === GREEN && __dis('dst-dgsw-on') && __dis('dst-dgsw-off'), dstDg.state);
    __ok('F3 pending: aria-busy', document.getElementById('dst-dgsw-off').getAttribute('aria-busy') === 'true');
    await __until(function () { return swDone() && dstDg.state === 'off'; }, 20000);
    __ok('F4 confirmed: OFF lit gray solid + white + ●, label OFF', dstDg.state === 'off' && bg('dst-dgsw-off') === GRAY && fg('dst-dgsw-off') === WHITE && ic('dst-dgsw-off') === '●' && lb('dst-dgsw-off') === 'OFF' && !__cls('dst-dgsw-off', 'pending'), bg('dst-dgsw-off') + ' ' + lb('dst-dgsw-off'));
    __ok('F4 confirmed: ON now outline + ○', ic('dst-dgsw-on') === '○' && !/22, 163, 74/.test(bg('dst-dgsw-on')), bg('dst-dgsw-on'));
    // write that does not stick -> pending cleared, stays OFF
    window.__ignoreWrites = true;
    __clickSw('on'); await __until(function () { return lb('dst-dgsw-on') === '切換中…'; }, PEND);
    __ok('F5 pending shown on ON', lb('dst-dgsw-on') === '切換中…');
    await __until(swDone, 20000);
    __ok('F5 read-back mismatch: pending cleared, still OFF lit', dstDg.state === 'off' && lb('dst-dgsw-on') === 'ON' && !__cls('dst-dgsw-on', 'pending') && __cls('dst-dgsw-off', 'on'), lb('dst-dgsw-on') + ' ' + dstDg.state);
    window.__ignoreWrites = false; window.__replyDelay = 0;
    // busy (measuring): selected keeps its fill
    dstRunning = true; dstRenderDgSw();
    __ok('F6 disabled while running: OFF keeps gray fill', __dis('dst-dgsw-off') && bg('dst-dgsw-off') === GRAY, bg('dst-dgsw-off'));
    dstRunning = false; dstRenderDgSw();
    // languages
    applyLang('en'); await __wait(100);
    __ok('F7 en: ON/OFF', lb('dst-dgsw-on') === 'ON' && lb('dst-dgsw-off') === 'OFF');
    applyLang('zh-CN'); await __wait(100);
    __ok('F7 zh-CN: ON/OFF', lb('dst-dgsw-on') === 'ON' && lb('dst-dgsw-off') === 'OFF');
    window.__replyDelay = PEND; __clickSw('on'); await __until(function () { return lb('dst-dgsw-on') === '切换中…'; }, PEND);
    __ok('F7 zh-CN pending text', lb('dst-dgsw-on') === '切换中…', lb('dst-dgsw-on'));
    await __until(function () { return swDone() && dstDg.state === 'on'; }, 20000); window.__replyDelay = 0;
    applyLang('en'); await __wait(100);
    window.__replyDelay = PEND; __clickSw('off'); await __until(function () { return lb('dst-dgsw-off') === 'Switching…'; }, PEND);
    __ok('F7 en pending text', lb('dst-dgsw-off') === 'Switching…', lb('dst-dgsw-off'));
    await __until(function () { return swDone() && dstDg.state === 'off'; }, 20000); window.__replyDelay = 0;
    applyLang('zh-TW'); await __wait(100);
    __ok('F8 end state OFF, labels restored', dstDg.state === 'off' && lb('dst-dgsw-off') === 'OFF' && lb('dst-dgsw-on') === 'ON');
  } catch (e) { window.__errs.push('test threw: ' + (e && e.stack || e)); }
  __done();
})();
