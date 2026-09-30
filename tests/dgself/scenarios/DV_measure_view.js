/* DV：dg v2.3.0 電腦畫面量測頁（dg-measure.html）「加入光學資料比較」視窗的「查看光學資料比較 ↗」。
   假序列埠／假 DG 同 DM 情境；window.open 換成假的。
   OPEN＝加入後出現、線框、點了開 dg.html?view=cmp（固定視窗名、斷 opener）；BLK＝被擋 ⇒ 提示（實心、↗），「關閉」讓位。 */
(async function () {
  try {
    var C = window.__viewCase || 'OPEN';
    await __wait(300);
    var dg = { count: 4 };
    window.opener.postMessage = function (m) {
      if (m.type === 'dg-cmp-query') setTimeout(function () {
        dgmCmpOnInfo({ type: 'dg-cmp-info', task: m.task, count: dg.count, max: 10,
          list: [1, 2, 3, 4].map(function (i) { return { no: i, name: '組' + i, t: Date.now() }; }),
          round: 3, job: 'main', name: '第三輪', same: null, full: false });
      }, 40);
      if (m.type === 'dg-cmp-add') setTimeout(function () {
        dg.count++;
        var ls = [];
        for (var i = 1; i < dg.count; i++) ls.push({ no: i, name: '組' + i, t: Date.now() });
        ls.push({ no: dg.count, name: m.name, t: Date.now() });
        dgmCmpOnAdded({ type: 'dg-cmp-added', task: m.task, ok: true, updated: false, no: dg.count, name: m.name,
          count: dg.count, max: 10, list: ls, stored: true });
      }, 40);
    };
    dgmGateLines = function () { return []; };
    try { Object.defineProperty(navigator, 'serial', { configurable: true, value: {} }); } catch (e) {}
    dgmSerialOn = async function () { return true; };
    closePort = async function () {};
    waitOrAbort = function () { return Promise.resolve(); };
    painted = function () { return Promise.resolve(); };
    dgmPaint = async function () { return true; };
    cmd = async function (t) {
      if (/^MES/.test(t)) return 'OK00,P1,0,0.3127,0.3290,123.456';
      if (/^MVS/.test(t)) return 'OK00,60.00';
      return 'OK00';
    };
    var opens = [], fakeWin = { opener: window, focused: 0, focus: function () { this.focused++; } };
    window.open = function (u, n) { opens.push({ url: u, name: n }); return (C === 'BLK') ? null : fakeWin; };
    var BLUE = 'rgb(37, 99, 235)';
    function vis(id) { var e = document.getElementById(id); return !!(e && e.offsetParent !== null && !e.classList.contains('dgm-hidden')); }
    function solidIn() { return Array.prototype.filter.call(document.querySelectorAll('#dgm-cmp-modal button, #dgm-cmp-go'), function (el) {
      return el.offsetParent !== null && getComputedStyle(el).backgroundColor === BLUE; }).map(function (el) { return el.id; }); }
    await run();
    await __wait(150);
    __ok('DV0 popup open', document.getElementById('dgm-cmp-modal').classList.contains('on'));
    __ok('DV0 view button hidden before OK', !vis('dgm-cmp-view'));
    document.getElementById('dgm-cmp-ok').click();
    await __wait(150);
    var vb = document.getElementById('dgm-cmp-view');
    __ok('DV1 view button shown after OK', vis('dgm-cmp-view') && vb.textContent === '查看光學資料比較 ↗', vb.textContent);
    __ok('DV1 view button is outline', getComputedStyle(vb).backgroundColor !== BLUE, getComputedStyle(vb).backgroundColor);
    __ok('DV1 only Close is solid', solidIn().join(',') === 'dgm-cmp-ok', solidIn().join(','));
    vb.click();
    await __wait(50);
    if (C === 'OPEN') {
      __ok('DV2 opened dg.html?view=cmp in the fixed tab', opens.length === 1 && opens[0].url === 'dg.html?view=cmp' && opens[0].name === 'tcon-dg-cmpview', JSON.stringify(opens));
      __ok('DV2 opener cut + focused', fakeWin.opener === null && fakeWin.focused === 1);
      __ok('DV2 no hint', !vis('dgm-cmp-go'));
    } else {
      var go = document.getElementById('dgm-cmp-go');
      __ok('DV3 hint shown', vis('dgm-cmp-go') && __txt('dgm-cmp-go-txt') === '請切回 DG 分頁，點「光學資料比較」查看', __txt('dgm-cmp-go-txt'));
      __ok('DV3 hint solid primary with ↗', getComputedStyle(go).backgroundColor === BLUE && go.querySelector('.dgm-go-ico').textContent === '↗');
      __ok('DV3 hint is the only solid; Close yields', solidIn().join(',') === 'dgm-cmp-go', solidIn().join(','));
    }
    __ok('DV version = common/version.js dg (' + window.__expectDgVer + ')', TOOL_VERSIONS.dg === window.__expectDgVer, TOOL_VERSIONS.dg);
  } catch (e) { window.__errs.push('scenario: ' + (e && e.stack || e)); }
  __done();
})();
