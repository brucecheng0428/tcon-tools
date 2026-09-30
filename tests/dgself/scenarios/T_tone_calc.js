/* T：dg v2.4.3「要不要調色溫」那兩顆按下去就直接開始計算（Bruce 2026-10-01 核准）。注入在 dg.html 的 IIFE 裡。
   跑法與 R 情境相同：量測頁訊息帶入第 2／3 部分 → 按「Default LUT」（出廠等距表，三通道相同 ⇒ 問要不要調色溫）。
   __tCase：CCT（調色溫並產生 ⇒ 直接算出結果、走色溫那一條）／GAMMA（不調色溫並產生 ⇒ 直接算出、只調 Gamma）／
            MISS（第 2／3 部分都還沒有 ⇒ 按了照既有的錯誤提示「還不能計算」，沒有結果）／EN／CN（鈕面字）。 */
(async function () {
  try {
    await __wait(1500);
    var C = window.__tCase || 'CCT';
    window.postMessage = function () {};
    function send(d) { window.dispatchEvent(new MessageEvent('message', { data: d, origin: window.location.origin, source: window })); }
    function rows(k) { var a = []; for (var g = 0; g < 256; g++) a.push([g, 0.3127, 0.329, Math.pow(g / 255, 2.2) * 200 * k + 0.1]); return a; }
    var prim = [['r', 0.64, 0.33, 40], ['g', 0.30, 0.60, 130], ['b', 0.15, 0.06, 15]];
    function vis(id) { var e = $(id); if (!e) return false; var r = e.getBoundingClientRect(); return e.offsetParent !== null && r.width > 0 && r.height > 0; }
    function lutStep() {
      var m = $('dg-modal-lut'); if (!m || !m.classList.contains('open')) return null;
      var st = null;
      Array.prototype.forEach.call(m.querySelectorAll('.dg-lut-step'), function (x) { if (x.style.display !== 'none') st = x.getAttribute('data-step'); });
      return st;
    }
    DG_WMODE = 'tcon'; DG_PQ = false; dgWmodeSync(); DG_ROUND = 1;
    if (C === 'EN' || C === 'CN') {
      applyLang(C === 'EN' ? 'en' : 'zh-CN'); await __wait(100);
      __ok('T-' + C + ' button labels', C === 'EN'
        ? ($('dg-btn-tone-cct').textContent === 'Tune colour temperature and generate the new RGB LUT' && $('dg-btn-tone-gamma').textContent === 'Generate the new RGB LUT without colour-temperature tuning')
        : ($('dg-btn-tone-cct').textContent === '调色温并产生新的 RGB LUT' && $('dg-btn-tone-gamma').textContent === '不调色温并产生新的 RGB LUT'),
        $('dg-btn-tone-cct').textContent + ' | ' + $('dg-btn-tone-gamma').textContent);
      __done(); return;
    }
    if (C !== 'MISS') {
      DG_LIVE_TASKS[31] = 'gray'; DG_LIVE_TASK_KIND[31] = 'tcon';
      send({ type: 'dg-measure-result', mode: 'gray', task: 31, rows: rows(1), prim: prim, at: 'r1', cmpAsk: true });
      await __wait(80);
    }
    dgLutModalOpen(); await __wait(50);
    $('dg-btn-default').click(); await __wait(100);
    __ok('T0 LUT identical on 3 channels ⇒ asks "tune colour temperature?"', lutStep() === 'tone', lutStep());
    __ok('T0 labels say what happens', $('dg-btn-tone-cct').textContent === '調色溫並產生新的 RGB LUT' && $('dg-btn-tone-gamma').textContent === '不調色溫並產生新的 RGB LUT');
    __ok('T0 no result yet', !lastLut);
    __ok('T0 the calculate button is still there', !!$('dg-btn-calc'));
    var btn = (C === 'GAMMA') ? 'dg-btn-tone-gamma' : 'dg-btn-tone-cct';
    $(btn).click(); await __wait(300);
    __ok('T1 popup closed', !$('dg-modal-lut').classList.contains('open'));
    if (C === 'MISS') {
      var st = ($('dg-status') || {}).textContent || '';
      __ok('T-MISS nothing to calculate yet ⇒ existing error, no result', !lastLut && /還不能計算：缺/.test(st), st.slice(0, 80));
      __done(); return;
    }
    __ok('T1 calculated immediately (no extra click on 開始計算新的 RGB LUT)', !!lastLut && !!lastCtx);
    __ok('T1 mode = ' + (C === 'GAMMA' ? 'gamma only' : 'with colour temperature'), DG_TONE === (C === 'GAMMA' ? 'gamma' : 'cct') && dgToneMode() === (C === 'GAMMA' ? 'gamma' : 'cct'), DG_TONE + '/' + dgToneMode());
    __ok('T version = common/version.js dg (' + window.__expectDgVer + ')', TOOL_VERSIONS.dg === window.__expectDgVer, TOOL_VERSIONS.dg);
  } catch (e) { window.__errs.push('scenario: ' + (e && e.stack || e)); }
  __done();
})();
