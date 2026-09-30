/* I：不該自動寫 DG_EN 的情況（window.__caseI 由 runner 指定）：on＝第 2 輪已是 ON；idle＝讀不到；r1off／r1on＝第 1 輪 main。 */
(async function () {
  try {
    await __wait(500);
    function w5d() { return window.__rawwrites.filter(function (w) { return w.addr === 0x005D; }); }
    var c = window.__caseI;
    if (c === 'on') window.__regs[0x005D] = 0x0D;
    if (c === 'idle') { window.__regs[0x005D] = 0x0C; window.__dgIdle = true; }
    if (c === 'r1off') window.__regs[0x005D] = 0x0C;
    await __arm(); await __wait(200);
    await dstDgAutoThenStep1('connect'); await __wait(2500);
    dstDgApplyTask({ type: 'dg-measure-task', round: dstDgRound, job: 'j1', mode: 'gray', step: 'gray', task: 1 }); await __wait(2500);
    if (c === 'on') {
      __ok('I-on round 2 already ON: no DG_EN write', dstDgRound === 2 && dstDg.state === 'on' && w5d().length === 0, 'writes=' + w5d().length);
      __ok('I-on no note, no rec row', !__vis('dst-dg-autonote') && !__vis('dst-dg-rec'));
    } else if (c === 'idle') {
      __ok('I-idle round 2 unreadable: no DG_EN write', dstDgRound === 2 && dstDg.state === 'unknown' && w5d().length === 0, 'st=' + dstDg.state + ' writes=' + w5d().length);
      __ok('I-idle no note; unreadable row shown; steps blocked', !__vis('dst-dg-autonote') && __vis('dst-dg-rec') && dstDgWhyKey() === 'dst.whyDgUnk', __txt('dst-dg-rec-txt'));
      __ok('I-idle switch disabled', __dis('dst-dgsw-on') && __dis('dst-dgsw-off'));
      window.__dgIdle = false;   // bus back: user presses 重新讀 -> OFF read, still no auto write (re-read path is not an auto trigger)
      if (dstAskResolve) dstAskResolve(false);
      await __wait(300);
      await dstDgRecMain(); await __wait(1500);
      __ok('I-idle after manual re-read OFF: warn2 row, no auto write', dstDg.state === 'off' && w5d().length === 0 && __vis('dst-dg-rec'), 'st=' + dstDg.state + ' writes=' + w5d().length);
    } else if (c === 'r1off') {
      __ok('I-r1 round 1 OFF: no DG_EN write, no note', dstDgRound === 1 && dstDg.state === 'off' && w5d().length === 0 && !__vis('dst-dg-autonote'), 'writes=' + w5d().length);
    } else if (c === 'r1on') {
      __ok('I-r1on round 1 ON: not auto-closed (only the recommendation)', dstDgRound === 1 && dstDg.state === 'on' && w5d().length === 0 && __vis('dst-dg-rec'), 'writes=' + w5d().length);
    }
  } catch (e) { window.__errs.push('test threw: ' + (e && e.stack || e)); }
  __done();
})();
