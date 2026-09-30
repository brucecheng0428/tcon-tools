/* J／K（window.__caseJ）：conf＝第 1 輪「確認結果」也自動開 DG_EN，且不出現「關掉 DG_EN／維持現狀」；
   main2conf（K）＝同一輪先 main 手動關掉，再來 conf 指派 ⇒ 自動開一次。 */
(async function () {
  try {
    await __wait(500);
    function w5d() { return window.__rawwrites.filter(function (w) { return w.addr === 0x005D; }); }
    function recShown() { return __vis('dst-dg-rec'); }
    function keepShown() { return __vis('dst-dg-rec-keep'); }
    var c = window.__caseJ;
    window.__lutFill = true;
    if (c === 'conf') {
      window.__regs[0x005D] = 0x0C;
      await __arm(); await __wait(200);
      __ok('J0 round 1 job conf, DG_EN OFF', dstDgRound === 1 && dstDgJob === 'conf' && dstDg.state === 'off', 'r=' + dstDgRound + ' j=' + dstDgJob);
      await dstDgAutoThenStep1('connect'); await __wait(3000);
      __ok('J1 conf: auto ON, one write', dstDg.state === 'on' && w5d().length === 1 && w5d()[0].data[0] === 0x0D, 'writes=' + w5d().length);
      __ok('J1 conf: note visible', __vis('dst-dg-autonote'));
      __ok('J1 conf: no rec row, no 維持現狀, no 關掉 DG_EN', !recShown() && !keepShown() && !/關掉 DG_EN/.test(document.body.innerText), __txt('dst-dg-rec-txt'));
      __ok('J1 conf: steps not blocked by DG_EN', dstDgWhyKey() === null, dstDgWhyKey());
      __clickSw('off'); await __wait(2500);
      __ok('J2 conf manual OFF: stays OFF, note gone, warn2 (開啟 DG_EN) row', dstDg.state === 'off' && !__vis('dst-dg-autonote') && recShown() && __txt('dst-dg-rec-go') === '開啟 DG_EN', __txt('dst-dg-rec-go'));
      await dstDgAutoThenStep1('probe'); await __wait(800);
      __ok('J2 conf: no re-auto same job', w5d().length === 2, w5d().length);
    } else if (c === 'main2conf') {
      window.__regs[0x005D] = 0x0D;
      await __arm(); await __wait(200);
      await dstDgAutoThenStep1('connect'); await __wait(1500);
      __ok('K0 round 1 main, ON: rec1 (關掉 DG_EN) shown, no auto write', dstDgRound === 1 && dstDgJob === 'main' && recShown() && __txt('dst-dg-rec-go') === '關掉 DG_EN' && w5d().length === 0, __txt('dst-dg-rec-go'));
      await dstDgRecMain(); await __wait(2500);
      __ok('K1 user turned OFF via rec1', dstDg.state === 'off' && w5d().length === 1 && !recShown());
      dstDgApplyTask({ type: 'dg-measure-task', round: 1, job: 'conf', mode: 'gray', step: 'gray', task: 2 }); await __wait(3500);
      __ok('K2 same round, job conf arrives: auto ON once', dstDgJob === 'conf' && dstDg.state === 'on' && w5d().length === 2 && w5d()[1].data[0] === 0x0D, 'writes=' + w5d().length + ' st=' + dstDg.state);
      __ok('K2 note visible, no rec row / 維持現狀 / 關掉 DG_EN', __vis('dst-dg-autonote') && !recShown() && !keepShown() && !/關掉 DG_EN/.test(document.body.innerText));
      __ok('K2 not blocked', dstDgWhyKey() === null, dstDgWhyKey());
    }
  } catch (e) { window.__errs.push('test threw: ' + (e && e.stack || e)); }
  __done();
})();
