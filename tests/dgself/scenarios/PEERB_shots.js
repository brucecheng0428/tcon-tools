/* 截圖用（DGSELF_SHOTS）：改前／改後同一支腳本。window.__shotCase = 'PQ'（dg.html）或 'CA'（dg-selftest.html）。
   CA 的假儀器只在 38400／7 bit／Even 開埠時回 BPR（＝dg-measure 規格參數；模擬，不是真機）。 */
(async function(){ try {
  if (window.__shotCase === 'PQ') {
    await __boot(1500);
    DG_WMODE = null; DG_PQ = true; dgWmodeSync();
    var sel = $('dg-preset-select');
    sel.value = 'sampleA'; sel.dispatchEvent(new Event('change', { bubbles: true }));
    $('dg-btn-clear').click();
    await new Promise(function (r) { setTimeout(r, 600); });
    var m = $('dg-modal-pq');
    if (!m.classList.contains('open')) $('dg-btn-clear').scrollIntoView({ block: 'center' });
    __ok('shot PQ taken (modal open=' + m.classList.contains('open') + ')', true);
  } else {
    await __boot(1500);
    var cur = null;
    var port = { getInfo: function () { return { usbVendorId: 0x132b, usbProductId: 0x2141 }; },
      open: async function (o) { cur = o || {}; }, close: async function () {},
      writable: { getWriter: function () { return { write: async function () {}, releaseLock: function () {} }; } },
      readable: { getReader: function () { return { read: function () { return new Promise(function () {}); }, cancel: async function () {}, releaseLock: function () {} }; } } };
    Object.defineProperty(navigator, 'serial', { configurable: true, value: {
      getPorts: async function () { return [port]; }, requestPort: async function () { return port; } } });
    dstCaCmd = async function (t) {
      if (t !== 'BPR') return 'OK00';
      return (cur && cur.baudRate === 38400 && cur.dataBits === 7 && cur.parity === 'even') ? 'OK00,38400' : null;
    };
    var box = document.getElementById('dst-hw-more'); if (box) box.open = true;
    document.getElementById('dst-casw-on').click();
    await new Promise(function (r) { setTimeout(r, 1500); });
    document.getElementById('dst-casw').scrollIntoView({ block: 'center' });
    __ok('shot CA taken (linked=' + dstCaLinked + ')', true);
  }
} catch (e) { __ok('scenario exception', false, String(e.stack || e)); }
__done(); })();
