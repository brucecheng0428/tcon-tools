/* TS：dgself v2.7.10「重新識別」與畫面測試（白／紅／綠／藍、對位畫面）識別完就能按（Barry 2026-10-14 第 2 點：約 7～8 秒才可按）。
   假 I2C Bridge 加上延遲模型（每指令 20 ms ＋ 每 byte 16 ms，v2.7.8 實測慢路徑 15～16 ms/byte）。
   從 DG 開、第 1 輪、DG_EN 開著、停在畫面測試那一步 ⇒ 按「重新識別」：
     · 識別完到按鈕可按的時間（v2.7.9 會接著自動讀整張 DG LUT，全程停用）
     · 讀 DG LUT 的 AHB 指令數＝0（延到對位後）
   再按「對位畫面」⇒ 步驟卡出現、① 自動讀表並送進 DG（行為照舊，只是換時點）。
   __tsOld：給改版前的頁面跑，只量時間（不判通過）。 */
(async function () {
  try {
    window.__lutFill = true;
    await __boot(500);
    await __arm(); await __settle();
    dstAlignDone = false; dstPgMax = 0; dstStepDone.lut = false; dstLut = null; dstLutErr = null; dstRenderBtns();
    var ws = __fakeWs(), send0 = ws.send, ahb = 0, cmds = 0, mem = dstIc.dgLut.memSlave;
    window.__regs[0x005D] = 0x01; window.__regs[0xFF00] = 0x02; window.__regs[0xFF01] = 0xEF; window.__regs[0xFF02] = 0xA0;   // DG_EN on（EM02：bit0）＋ EM02A1 ID
    ws.send = function (t) {
      var m = JSON.parse(t), n = m.type === 'read' ? m.len : (m.data ? m.data.length : 0);
      cmds++; if (m.type === 'read' && m.slave === mem) ahb++;
      window.__replyDelay = window.__tsFast ? 0 : 20 + 16 * n;
      send0(t);
    };
    dstWs = ws; dstWs.onmessage = dstOnMessage;
    var stage = (typeof dstPgCur === 'function') ? dstPgCur() : '?';
    __ok('TS0 at the picture-test stage, DG_EN on', stage === 'test', stage + ' dg=' + dstDg.state);
    var t0 = performance.now();
    $('dst-probe').click();
    await __wait(30);
    await __until(function () { return !$('dst-probe').disabled && !$('dst-align').disabled && !dstLutBusy && !dstBusy; }, 60000);
    var ms = Math.round(performance.now() - t0);
    if (window.__tsOld) { __ok('TS-OLD re-identify -> buttons usable after ' + ms + ' ms (' + ahb + ' DG LUT reads, ' + cmds + ' cmds)', true); __done(); return; }
    __ok('TS1 re-identify -> re-identify and picture buttons usable after ' + ms + ' ms (< 1500)', ms < 1500, cmds + ' cmds');
    __ok('TS1 no DG LUT read while at the picture-test stage', ahb === 0, ahb);
    __ok('TS1 W/R/G/B buttons enabled', ['dst-q-w', 'dst-q-r', 'dst-q-g', 'dst-q-b'].every(function (id) { return !$(id).disabled; }));
    window.__tsFast = true; $("dst-align").click();
    await __until(function () { return !!dstStepDone.lut && !dstLutBusy && !dstBusy; }, 60000);
    __ok('TS2 after alignment step ① reads the DG LUT automatically and sends it to DG', ahb > 0 && !!dstStepDone.lut && !!dstLut, 'ahb=' + ahb);
    __ok('TS2 now at the step card', dstPgCur() === 'steps', dstPgCur());
    var ids0 = window.__readAddrs.filter(function (a) { return a === 0xFF00; }).length;
    $('dst-probe').click(); await __wait(30);
    await __until(function () { return !$('dst-probe').disabled && !dstBusy && !dstLutBusy; }, 20000);
    var idn = window.__readAddrs.filter(function (a) { return a === 0xFF00; }).length - ids0;
    __ok('TS3 re-identify again: remembered slave tried first, stops at the known IC (' + idn + ' ID read)', idn === 1 && dstIc && dstIc.key === 'EM02A1', localStorage.getItem('dst-last-slave'));
  } catch (e) { window.__errs.push('scenario: ' + (e && e.stack || e)); }
  __done();
})();
