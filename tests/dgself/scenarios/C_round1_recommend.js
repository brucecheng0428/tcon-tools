/* C：由 DG 開啟、第 1 輪 main、DG_EN ON ⇒ 步驟卡出現「關掉 DG_EN／維持現狀」建議列；按「關掉」後硬體列開關同步 OFF、送等距表；再開回 ON 建議列回來。 */
(async function () {
  try {
    await __wait(500); await __arm(); await __wait(300);
    var box = document.getElementById('dst-hw-more'); box.open = true; await __wait(300);
    __ok('C0 from DG round 1', dstDgAlive() && dstDgRound === 1, 'round=' + dstDgRound);
    __ok('C1 rec row (step card) + switch in T-CON row both visible', __vis('dst-dg-rec') && __vis('dst-dgsw-off') && document.getElementById('dst-dgsw').parentNode.id === 'dst-dgsw-slot-row');
    __ok('C1 keep-as-is only in step card', !!document.querySelector('#dst-dg-rec button') && !document.getElementById('dst-hw-card').contains(document.getElementById('dst-dg-rec')), __txt('dst-dg-rec'));
    document.getElementById('dst-dg-rec-go').click(); await __wait(2500);
    __ok('C2 step-card "turn off" -> T-CON row switch shows off', dstDg.state === 'off' && __cls('dst-dgsw-off', 'on') && !__cls('dst-dgsw-on', 'on'));
    __ok('C2 rec row gone, yellow line gone', !__vis('dst-dg-rec') && !__vis('dst-dg-warn'));
    __ok('C2 linear table sent to DG, note shown', dstLut && dstLut.src === 'ident' && __vis('dst-lut-identnote'), (dstLut && dstLut.src));
    __clickSw('on'); await __wait(2500);
    __ok('C3 switch on in T-CON row -> rec row back (same state)', dstDg.state === 'on' && __vis('dst-dg-rec') && __vis('dst-dg-warn'));
  } catch (e) { window.__errs.push('test threw: ' + (e && e.stack || e)); }
  __done();
})();
