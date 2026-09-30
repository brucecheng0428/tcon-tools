/* H：v2.2.0 第 2 輪以後讀到 DG_EN OFF ⇒ 自動寫 ON 一次並讀回確認（先顯示切換中…）、提示一行文字（三語）；
   同一輪不重寫；使用者手動關掉後同一輪不再自動開；下一輪再自動開；寫入沒生效只試一次、保留警示。 */
(async function () {
  try {
    await __wait(500);
    function w5d() { return window.__rawwrites.filter(function (w) { return w.addr === 0x005D; }); }
    function lb(id) { var e = document.querySelector('#' + id + ' .dst-sw-lb'); return e ? e.textContent : null; }
    window.__regs[0x005D] = 0x0C;          // DG_EN OFF (bit0=0), 12-bit, target
    window.__lutFill = true;
    await __arm(); await __wait(200);
    __ok('H0 from DG, round 2, DG_EN read OFF', dstDgAlive() && dstDgRound === 2 && dstDg.state === 'off', 'round=' + dstDgRound + ' st=' + dstDg.state);
    __ok('H0 before auto: warn2 row visible, note hidden', __vis('dst-dg-rec') && !__vis('dst-dg-autonote'));
    // 1. connect finished -> auto ON (slow bridge to catch "switching…")
    window.__replyDelay = 150;
    var p = dstDgAutoThenStep1('connect');
    await __wait(40);
    __ok('H1 pending: ON shows 切換中…', lb('dst-dgsw-on') === '切換中…' && __cls('dst-dgsw-on', 'pending'), lb('dst-dgsw-on'));
    await p; await __wait(3000); window.__replyDelay = 0;
    var ws = w5d();
    __ok('H1 exactly one DG_EN write, bit0 only (0x0C -> 0x0D)', ws.length === 1 && ws[0].data[0] === 0x0D && ws[0].was === 0x0C, JSON.stringify(ws));
    __ok('H1 read back ON, switch ON lit, pending cleared', dstDg.state === 'on' && __cls('dst-dgsw-on', 'on') && lb('dst-dgsw-on') === 'ON');
    __ok('H1 note visible in hardware card with exact text', __vis('dst-dg-autonote') && __txt('dst-dg-autonote') === '確認結果：已自動開啟 DG_EN，套用新的 LUT' && document.getElementById('dst-hw-card').contains(document.getElementById('dst-dg-autonote')), __txt('dst-dg-autonote'));
    __ok('H1 warn2 row gone', !__vis('dst-dg-rec'));
    __ok('H1 step ① re-fetched from T-CON (not linear table)', dstLut && dstLut.src !== 'ident', dstLut && dstLut.src);
    // collapsed box: note still visible
    var box = document.getElementById('dst-hw-more'); box.open = false; await __wait(200);
    __ok('H1 note visible with hardware box collapsed', __vis('dst-dg-autonote'));
    // 2. same round, another trigger -> nothing more written
    await dstDgAutoThenStep1('probe'); await __wait(500);
    __ok('H2 second trigger in same round: no extra write', w5d().length === 1, w5d().length);
    // 3. user turns it OFF by hand -> stays OFF, rec row back, note gone
    __clickSw('off'); await __wait(2500);
    __ok('H3 manual OFF took effect', dstDg.state === 'off' && w5d().length === 2 && w5d()[1].data[0] === 0x0C);
    __ok('H3 note hidden, warn2 row back (建議列照常)', !__vis('dst-dg-autonote') && __vis('dst-dg-rec'), __txt('dst-dg-rec-txt'));
    await dstDgAutoThenStep1('probe'); await __wait(800);
    dstDgApplyTask({ type: 'dg-measure-task', round: 2, job: 'j1', mode: 'gray', step: 'gray', task: 1 }); await __wait(2500);
    __ok('H3 after manual OFF: probe + same-round task do not auto ON', dstDg.state === 'off' && w5d().length === 2, 'writes=' + w5d().length + ' st=' + dstDg.state);
    // 4. next round (3) arrives with DG_EN OFF -> auto ON again
    dstDgApplyTask({ type: 'dg-measure-task', round: 3, job: 'j1', mode: 'gray', step: 'gray', task: 2 }); await __wait(3500);
    __ok('H4 round 3: re-read then auto ON once', dstDgRound === 3 && dstDg.state === 'on' && w5d().length === 3 && w5d()[2].data[0] === 0x0D, 'writes=' + w5d().length + ' st=' + dstDg.state);
    __ok('H4 note visible again', __vis('dst-dg-autonote'));
    // 5. languages
    applyLang('en'); await __wait(100);
    __ok('H5 en note', __txt('dst-dg-autonote') === 'Confirmation: DG_EN was turned on automatically to apply the new LUT', __txt('dst-dg-autonote'));
    applyLang('zh-CN'); await __wait(100);
    __ok('H5 zh-CN note', __txt('dst-dg-autonote') === '确认结果：已自动开启 DG_EN，套用新的 LUT', __txt('dst-dg-autonote'));
    applyLang('zh-TW'); await __wait(100);
    // 6. round 4: write does not stick -> tried once, warning stays, no retry
    __clickSw('off'); await __wait(2500);
    window.__ignoreWrites = true;
    dstDgApplyTask({ type: 'dg-measure-task', round: 4, job: 'j1', mode: 'gray', step: 'gray', task: 3 }); await __wait(3500);
    var n4 = w5d().length;
    __ok('H6 round 4 write fails: one attempt, still OFF', dstDgRound === 4 && dstDg.state === 'off' && n4 === 5, 'writes=' + n4 + ' st=' + dstDg.state);
    __ok('H6 failure: note hidden, warn2 row + reason shown', !__vis('dst-dg-autonote') && __vis('dst-dg-rec') && /讀回/.test(__txt('dst-say-link') || ''), __txt('dst-say-link'));
    await dstDgAutoThenStep1('probe'); await __wait(800);
    dstDgApplyTask({ type: 'dg-measure-task', round: 4, job: 'j2', mode: 'gray', step: 'gray', task: 4 }); await __wait(2500);
    __ok('H6 no retry in the same round', w5d().length === n4, w5d().length);
    window.__ignoreWrites = false;
    __checkVersion('H7');
  } catch (e) { window.__errs.push('test threw: ' + (e && e.stack || e)); }
  __done();
})();
