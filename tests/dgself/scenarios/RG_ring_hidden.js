/* RG：dg v2.5.1 電腦畫面量測頁按「開始量測」後中心紅圈要消失（Barry 2026-10-14「中間中心點紅圈開始量測後不會消失，影響灰階數據」）。
   根因：8f9c21f（dg v1.68.0）刪掉了 dgmStart() 的 `running = true` ⇒ 紅圈、提示一直顯示，主鈕不變「■ 停止」。
   走真正的 dgmStart()（不是直接呼叫 run()）；假序列埠、畫面等待立即完成，每次 MES 時取樣紅圈狀態。
   __rgShot：量到第 30 階就停在量測中（截圖用）。 */
(async function () {
  try {
    await __boot(300);
    window.opener.postMessage = function () {};
    dgmGateLines = function () { return []; };
    try { Object.defineProperty(navigator, 'serial', { configurable: true, value: {} }); } catch (e) {}
    dgmSerialOn = async function () { return true; };
    closePort = async function () {};
    waitOrAbort = function () { return Promise.resolve(!aborted); };
    painted = function () { return Promise.resolve(); };
    dgmPaint = async function () { return true; };
    var mesN = 0, seen = [];
    function ringState() { var e = $('dgm-ring'); return (e.classList.contains('dgm-hidden') && getComputedStyle(e).display === 'none') ? 'hidden' : 'SHOWN'; }
    cmd = async function (t) {
      if (/^MES/.test(t)) { mesN++; await __wait(2); seen.push(ringState() + (running ? '' : '/notRunning')); return 'OK00,P1,0,0.3127,0.3290,123.456'; }
      if (/^MVS/.test(t)) return 'OK00,60.00';
      return 'OK00';
    };
    __ok('RG0 before start: ring shown (alignment)', ringState() === 'SHOWN');
    dgmStart();
    await __until(function () { return mesN >= 30; }, 20000);
    __ok('RG1 every MES so far taken with the ring hidden (' + seen.length + ')', seen.length >= 30 && seen.every(function (s) { return s === 'hidden'; }), seen.slice(0, 3).join(' '));
    __ok('RG1 main button became stop', /停止/.test($('dgm-start').textContent), $('dgm-start').textContent);
    __ok('RG1 bottom hint hidden too', $('dgm-hint').classList.contains('dgm-hidden'));
    if (window.__rgShot) { __done(); return; }
    var n0 = mesN; dgmStart(); await __wait(30);
    __ok('RG2 pressing start again while running does not start a second run', running && mesN >= n0);
    await __until(function () { return !running; }, 60000);
    __ok('RG3 all ' + seen.length + ' MES taken with the ring hidden', seen.every(function (s) { return s === 'hidden'; }), seen.filter(function (s) { return s !== 'hidden'; }).length + ' bad');
    __ok('RG3 after the run the ring comes back (Bruce 9/11: shown whenever not measuring)', ringState() === 'SHOWN');
  } catch (e) { window.__errs.push('scenario: ' + (e && e.stack || e)); }
  __done();
})();
