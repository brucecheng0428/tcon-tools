/* C：由 DG 開啟、第 1 輪 main、DG_EN ON ⇒ 步驟卡出現「關掉 DG_EN／維持現狀」建議列；按「關掉」後硬體列開關同步 OFF、送等距表；再開回 ON 建議列回來。 */
(async function () {
  try {
    await __wait(500); await __arm(); await __wait(300);
    /* v2.7.4：對位之後硬體卡縮成「✓ 外接硬體連線」一行 ⇒ 先點標題展開（使用者也是這樣回看），再打開細節。 */
    __ok('C0 hardware card collapsed to a ✓ line after alignment', __cls('dst-hw-card', 'dst-pg-done'));
    document.querySelector('#dst-hw-card > .card-header').click(); await __wait(50);
    var box = document.getElementById('dst-hw-more'); box.open = true; await __wait(300);
    __ok('C0 from DG round 1', dstDgAlive() && dstDgRound === 1, 'round=' + dstDgRound);
    __ok('C1 rec row (step card) + switch in T-CON row both visible', __vis('dst-dg-rec') && __vis('dst-dgsw-off') && document.getElementById('dst-dgsw').parentNode.id === 'dst-dgsw-slot-row');
    __ok('C1 keep-as-is only in step card', !!document.querySelector('#dst-dg-rec button') && !document.getElementById('dst-hw-card').contains(document.getElementById('dst-dg-rec')), __txt('dst-dg-rec'));
    document.getElementById('dst-dg-rec-go').click(); await __wait(2500);
    __ok('C2 step-card "turn off" -> T-CON row switch shows off', dstDg.state === 'off' && __cls('dst-dgsw-off', 'on') && !__cls('dst-dgsw-on', 'on'));
    __ok('C2 rec row gone, yellow line gone', !__vis('dst-dg-rec') && !__vis('dst-dg-warn'));
    // v2.7.3：DG LUT 卡在流程跑完前是收起來的 ⇒ 看狀態（class），不看是否在畫面上
    __ok('C2 linear table sent to DG, note set (card folded until the flow is done)', dstLut && dstLut.src === 'ident' && !__cls('dst-lut-identnote', 'dst-hidden')
      && __cls('dst-lut-card', 'dst-fold'), (dstLut && dstLut.src));
    __clickSw('on'); await __wait(2500);
    __ok('C3 switch on in T-CON row -> rec row back (same state)', dstDg.state === 'on' && __vis('dst-dg-rec') && __vis('dst-dg-warn'));
  } catch (e) { window.__errs.push('test threw: ' + (e && e.stack || e)); }
  __done();
})();
