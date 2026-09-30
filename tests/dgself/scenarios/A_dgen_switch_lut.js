/* A／B／D：DG_EN 開關在摘要列與 T-CON 列之間移動（同一個節點）；開關寫 bit0；OFF 時 LUT 鈕用等距表不讀 T-CON；
   頁面以為 ON、IC 實際 OFF 時先重讀 DG_EN；讀不到（0xFF）時開關停用、不假裝是等距表。不是從 DG 開啟。 */
(async function () {
  try {
    // B2 讀 LUT：假 I2C 未設的位址要回非零，否則頁面（v1.6.0 起）會正確地判成 allZero 拒收
    window.__lutFill = true;
    await __wait(500); await __arm(); await __wait(300);
    var box = document.getElementById('dst-hw-more');
    function inSlot(s) { var sw = document.getElementById('dst-dgsw'); return sw.parentNode && sw.parentNode.id === 'dst-dgsw-slot-' + s; }
    __ok('A1 collapsed -> switch in summary', !box.open && inSlot('sum') && __vis('dst-dgsw-on'));
    box.open = true; await __wait(300);
    __ok('A2 expanded -> switch in T-CON row', inSlot('row') && __vis('dst-dgsw-on') && __vis('dst-dgsw-off'));
    __ok('A2 only one switch node', document.querySelectorAll('#dst-dgsw').length === 1 && document.querySelectorAll('[id=dst-dgsw-on]').length === 1);
    __ok('A2 status text hidden (switch is the state)', !__vis('dst-v-dg'), __txt('dst-v-dg'));
    __ok('A2 yellow line visible under it (on)', __vis('dst-dg-warn'), __txt('dst-dg-warn'));
    __ok('A2 on lit', __cls('dst-dgsw-on', 'on') && !__cls('dst-dgsw-off', 'on'));
    __ok('A2 no keep-as-is button in hw card', !document.querySelector('#dst-hw-card #dst-dg-rec, #dst-hw-card #dst-dg-rec-keep'));
    __clickSw('off'); await __wait(1500);
    __ok('A3 click off in T-CON row -> one write bit0', window.__rawwrites.length === 1 && window.__rawwrites[0].data[0] === 0x0C, JSON.stringify(window.__rawwrites));
    __ok('A3 state off, off lit, box still open', dstDg.state === 'off' && __cls('dst-dgsw-off', 'on') && box.open);
    __ok('A3 yellow line gone', !__vis('dst-dg-warn'));
    box.open = false; await __wait(300);
    __ok('A4 collapsed -> back to summary, still off', inSlot('sum') && __vis('dst-dgsw-off') && __cls('dst-dgsw-off', 'on'));
    // LUT button while off -> identity, no T-CON read
    var nr = window.__reads;
    document.getElementById('dst-lut-read').click(); await __wait(1500);
    __ok('B1 off: LUT read button -> linear table', dstLut && dstLut.src === 'ident', dstLut ? dstLut.src : 'null');
    __ok('B1 off: only DG_EN byte read (no AHB/LUT read)', window.__readAddrs.filter(function (a) { return a !== 0x005D; }).length === 0, JSON.stringify(window.__readAddrs.slice(0, 10)));
    __ok('B1 note shown', __vis('dst-lut-identnote') && /等間距/.test(__txt('dst-lut-identnote')), __txt('dst-lut-identnote'));
    __ok('B1 state line', /等距表/.test(__txt('dst-lut-state')), __txt('dst-lut-state'));
    // switch on -> LUT follows (reads T-CON), note hidden
    window.__readAddrs = [];
    __clickSw('on'); await __wait(2500);
    __ok('B2 on: LUT view re-read from T-CON', dstLut && dstLut.src !== 'ident', dstLut ? dstLut.src : ('null err=' + JSON.stringify(dstLutErr)));
    __ok('B2 on: T-CON actually read', window.__readAddrs.some(function (a) { return a !== 0x005D; }), window.__readAddrs.length + ' reads');
    __ok('B2 note hidden', !__vis('dst-lut-identnote'));
    // stale state: page thinks on, IC is off -> button re-reads DG_EN first
    window.__regs[0x005D] = 0x0C; window.__readAddrs = [];
    document.getElementById('dst-lut-read').click(); await __wait(1500);
    __ok('B3 stale on / IC off -> re-read DG_EN, linear table', dstDg.state === 'off' && dstLut && dstLut.src === 'ident' && __vis('dst-lut-identnote'),
      dstDg.state + ' ' + (dstLut && dstLut.src));
    __ok('B3 switch followed to off', __cls('dst-dgsw-off', 'on'));
    // unknown -> expanded row keeps reason text, switch disabled
    window.__dgIdle = true; box.open = true; await __wait(200);
    await dstGuard(async function () { await dstReadDgEn(); }); dstRenderBtns(); await __wait(200);
    __ok('D1 unknown: switch disabled in T-CON row', inSlot('row') && __dis('dst-dgsw-on') && __dis('dst-dgsw-off'));
    __ok('D1 unknown: reason text visible', __vis('dst-v-dg') && __txt('dst-v-dg').length > 1, __txt('dst-v-dg'));
    document.getElementById('dst-lut-read').click(); await __wait(1500);
    __ok('D2 unknown: LUT button does not claim linear table', !(dstLut && dstLut.src === 'ident') && !__vis('dst-lut-identnote'), (dstLut && dstLut.src) + ' err=' + JSON.stringify(dstLutErr));
  } catch (e) { window.__errs.push('test threw: ' + (e && e.stack || e)); }
  __done();
})();
