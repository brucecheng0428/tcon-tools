/* WP：dg v2.5.0 白點兩種調法（Bruce 2026-10-14，Barry 信「希望新增自訂目標色溫調整選項」）。注入在 dg.html 的 IIFE 裡。
   ① 沿用目前白點（預設）＝ v2.4.12 原本的計算（mode 0），LUT 逐值不變；
   ② 指定新白點 ＝ 原廠 User define xyT（mode 2，AlgorithmIrene），x／y ⇄ 色溫照原廠 CCTForm.cs DoxyToCCT／DoCCTToxy。
   __wpCase：CONV（換算對照原廠公式＋畫面三格互算）／REG（模式① 與改版前逐值相同）／NEW（模式② 目標白點傳入演算法）／
             GAMMA（只調 Gamma 時選②會擋）／EN／CN（字面）。 */
(async function () {
  try {
    await __boot(1500);
    var C = window.__wpCase || 'CONV';
    window.postMessage = function () {};
    function send(d) { window.dispatchEvent(new MessageEvent('message', { data: d, origin: window.location.origin, source: window })); }
    function rows() { var a = []; for (var g = 0; g < 256; g++) a.push([g, 0.3127 + 0.01 * (1 - g / 255) * (1 - g / 255), 0.329 - 0.004 * (1 - g / 255), Math.pow(g / 255, 2.3) * 220 + 0.15]); return a; }
    var prim = [['r', 0.64, 0.33, 46], ['g', 0.30, 0.60, 158], ['b', 0.15, 0.06, 16]];
    function fire(id) { $(id).dispatchEvent(new Event('input', { bubbles: true })); }
    function pick(id) { $(id).checked = true; $(id).dispatchEvent(new Event('change', { bubbles: true })); }
    /* 原廠公式逐字（CCTForm.cs:780-784、806-822），只拿來當對照 */
    function rdXyToCct(x, y) { var n = (x - 0.332) / (y - 0.1858); return -449.0 * Math.pow(n, 3) + 3525.0 * Math.pow(n, 2) - 6823.3 * n + 5520.33; }
    function rdCctToXy(T) {
      var x, y;
      if (T >= 4000 && T <= 7000) { x = -4.607 * Math.pow(10, 9) / Math.pow(T, 3) + 2.9678 * Math.pow(10, 6) / Math.pow(T, 2) + 0.09911 * Math.pow(10, 3) / T + 0.244063; y = -3 * x * x + 2.87 * x - 0.275; }
      else if (T > 7000 && T <= 25000) { x = -2.0064 * Math.pow(10, 9) / Math.pow(T, 3) + 1.9018 * Math.pow(10, 6) / Math.pow(T, 2) + 0.24748 * Math.pow(10, 3) / T + 0.23704; y = -3 * x * x + 2.87 * x - 0.275; }
      else { x = -1; y = -1; }
      return [x, y];
    }
    function hash(a) { var s = JSON.stringify(a), h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(16) + ':' + s.length; }

    if (C === 'EN' || C === 'CN') {
      applyLang(C === 'EN' ? 'en' : 'zh-CN'); await __wait(100);
      var lb = $('dg-wpt').textContent.replace(/\s+/g, ' ');
      __ok('WP-' + C + ' labels', C === 'EN' ? /White point.*Keep current white point.*Set a new white point/.test(lb) : /白点.*沿用目前白点.*指定新白点/.test(lb), lb.slice(0, 120));
      __done(); return;
    }

    if (C === 'CONV') {
      var pts = [[0.3127, 0.3290], [0.312778876194811, 0.329183498498041], [0.2831, 0.2971], [0.3457, 0.3585], [0.302566, 0.330295]];
      pts.forEach(function (p) {
        var a = dgCCT(p[0], p[1]), b = rdXyToCct(p[0], p[1]);
        __ok('WP1 x,y→CCT ' + p.join(',') + ' = ' + a.toFixed(2) + 'K (Raydium ' + b.toFixed(2) + ')', Math.abs(a - b) < 1e-6);
      });
      [4000, 5000, 6500, 7000, 7001, 9300, 12000, 25000].forEach(function (T) {
        var a = dgCctToXy(T), b = rdCctToXy(T);
        __ok('WP2 CCT→x,y ' + T + 'K = ' + a[0].toFixed(6) + ',' + a[1].toFixed(6), Math.abs(a[0] - b[0]) < 1e-12 && Math.abs(a[1] - b[1]) < 1e-12);
      });
      __ok('WP2 out of range (3999K / 25001K) ⇒ no x,y (Raydium -1)', dgCctToXy(3999) === null && dgCctToXy(25001) === null && rdCctToXy(3999)[0] === -1);
      /* 畫面：預設① ⇒ 三格不出現；選② ⇒ 出現並帶入 6500K（還沒有白點）；輸入色溫 ⇒ x,y；輸入 x,y ⇒ 色溫 */
      __ok('WP3 default = keep current white point, inputs hidden', $('dg-wpt-keep').checked && $('dg-wpt-in').style.display === 'none' && dgReadCfg().mode === 0);
      pick('dg-wpt-new');
      __ok('WP3 pick new ⇒ inputs shown, prefilled 6500K', $('dg-wpt-in').style.display !== 'none' && $('dg-wpt-cct').value === '6500' && $('dg-wpt-x').value === rdCctToXy(6500)[0].toFixed(6), $('dg-wpt-x').value + ',' + $('dg-wpt-y').value + ',' + $('dg-wpt-cct').value);
      $('dg-wpt-cct').value = '9300'; fire('dg-wpt-cct');
      var e93 = rdCctToXy(9300);
      __ok('WP4 type 9300K ⇒ x,y = ' + $('dg-wpt-x').value + ',' + $('dg-wpt-y').value, $('dg-wpt-x').value === e93[0].toFixed(6) && $('dg-wpt-y').value === e93[1].toFixed(6));
      $('dg-wpt-x').value = '0.3127'; fire('dg-wpt-x'); $('dg-wpt-y').value = '0.3290'; fire('dg-wpt-y');
      __ok('WP5 type x,y 0.3127,0.3290 ⇒ ' + $('dg-wpt-cct').value + 'K', $('dg-wpt-cct').value === String(Math.round(rdXyToCct(0.3127, 0.329))));
      __ok('WP5 cfg.mode = 2 (User define xyT)', dgReadCfg().mode === 2);
      $('dg-wpt-cct').value = '3000'; fire('dg-wpt-cct');
      __ok('WP6 3000K (out of range) ⇒ x,y blank, marked invalid, not used', $('dg-wpt-x').value === '' && $('dg-wpt-in').classList.contains('bad') && dgWptCustom() === null);
      pick('dg-wpt-keep');
      __ok('WP7 back to keep ⇒ hidden, mode 0', $('dg-wpt-in').style.display === 'none' && dgReadCfg().mode === 0);
      __done(); return;
    }

    DG_WMODE = 'tcon'; DG_PQ = false; dgWmodeSync(); DG_ROUND = 1;
    DG_LIVE_TASKS[51] = 'gray'; DG_LIVE_TASK_KIND[51] = 'tcon';
    send({ type: 'dg-measure-result', mode: 'gray', task: 51, rows: rows(), prim: prim, at: 'r1', cmpAsk: true });
    await __wait(80);
    function lutStep() {
      var m = $('dg-modal-lut'); if (!m || !m.classList.contains('open')) return null;
      var st = null;
      Array.prototype.forEach.call(m.querySelectorAll('.dg-lut-step'), function (x) { if (x.style.display !== 'none') st = x.getAttribute('data-step'); });
      return st;
    }
    dgLutModalOpen(); await __wait(50);
    $('dg-btn-default').click(); await __until(function () { return lutStep() === 'tone'; }, 5000);
    $(C === 'GAMMA' ? 'dg-btn-tone-gamma' : 'dg-btn-tone-cct').click();
    await __until(function () { return !!lastLut; }, 8000);
    try { dgStepModalClose('dg-modal-conf'); } catch (eM) {}

    if (C === 'GAMMA') {
      pick('dg-wpt-new'); $('dg-wpt-cct').value = '9300'; fire('dg-wpt-cct');
      dgDoCalc(); await __wait(50);
      var stg = ($('dg-status') || {}).textContent || '';
      __ok('WP-GAMMA gamma only + new white point ⇒ stopped with reason, no result', !lastLut && /只調 Gamma/.test(stg), stg.slice(0, 100));
      __done(); return;
    }

    var keepLut = JSON.parse(JSON.stringify(lastLut));
    var KEEP = hash(keepLut);
    __ok('WP-REG keep (mode 0) LUT fingerprint ' + KEEP, lastCtx.cfg.mode === 0);
    if (C === 'REG') {
      /* 指紋由 v2.4.12（改版前的 dg.html）跑同一份資料取得：見 CHANGELOG v2.5.0 */
      __ok('WP-REG same as v2.4.12 (' + window.__wpRegHash + ')', !window.__wpRegHash || KEEP === window.__wpRegHash, KEEP);
      pick('dg-wpt-new'); $('dg-wpt-cct').value = '9300'; fire('dg-wpt-cct'); dgDoCalc();
      pick('dg-wpt-keep'); dgDoCalc();
      __ok('WP-REG ② then back to ① ⇒ identical LUT again', hash(lastLut) === KEEP);
      __done(); return;
    }

    // NEW：指定 9300K
    pick('dg-wpt-new'); $('dg-wpt-cct').value = '9300'; fire('dg-wpt-cct');
    __ok('WP-NEW result invalidated when the white point changes', !lastLut);
    dgDoCalc();
    var xy = rdCctToXy(9300), tw = lastCtx.data.targetWhite, res = lastCtx.res;
    var tx = Number($('dg-wpt-x').value), ty = Number($('dg-wpt-y').value);
    __ok('WP-NEW calculated with mode 2', !!lastLut && lastCtx.cfg.mode === 2, (($('dg-status') || {}).textContent || '').slice(0, 80));
    __ok('WP-NEW target white x,y = the new white point (' + tw[0] + ',' + tw[1] + ')', tw[0] === tx && tw[1] === ty && Math.abs(tx - xy[0]) < 5e-5);
    var tgtTop = res.target[res.target.length - 1];
    __ok('WP-NEW colour-temperature curve ends at the new white point', Math.abs(tgtTop[0] - tx) < 1e-12 && Math.abs(tgtTop[1] - ty) < 1e-12);
    __ok('WP-NEW curve passes the turn gray (25) already at the new white', Math.abs(res.target[40][0] - tx) < 1e-12 && Math.abs(res.target[40][1] - ty) < 1e-12);
    /* 目標亮度：原廠 Autodecide ＝ 最高階實測 Y ÷ max(b/a) */
    var A = res.A, Ai = dgInv3(A), W = lastCtx.data.grayXYZ[lastCtx.data.grayXYZ.length - 1];
    var a = dgMul3x1(Ai, [W[0] / W[1], 1, W[2] / W[1]]), b = dgMul3x1(Ai, [tx / ty, 1, (1 - tx - ty) / ty]);
    var k = Math.max(b[0] / a[0], b[1] / a[1], b[2] / a[2]);
    __ok('WP-NEW target Lv = top Y / max(b/a) = ' + (W[1] / k).toFixed(3) + ' (top ' + W[1].toFixed(3) + ')', Math.abs(tw[2] - W[1] / k) < 1e-9 && tw[2] <= W[1] + 1e-9);
    var tTop = res.Tar[res.Tar.length - 1];
    __ok('WP-NEW brightest channel stays full, others lowered (top Tar ' + tTop.map(function (v) { return v.toFixed(3); }).join('/') + ')', Math.abs(Math.max.apply(null, tTop) - 1) < 1e-9 && Math.min.apply(null, tTop) < 0.999);
    __ok('WP-NEW LUT differs from keep', hash(lastLut) !== KEEP);
    __ok('WP-NEW chart 3 baseline follows the new white point (' + dgCctBase().center + 'K)', dgCctBase().ok && dgCctBase().center === 9300);
    if (window.__wpShot) {   // 截圖用：停在「指定新白點 9300K」算完的畫面
      try { dgStepModalClose('dg-modal-conf'); } catch (eM2) {} DG_FS_FOLD.setup = true; dgDoneStepsSync();
      await __wait(100); $('dg-wpt').scrollIntoView({ block: 'center' }); await __wait(300);
      __ok('WP-SHOT white point row visible', $('dg-wpt').getBoundingClientRect().height > 0);
      __done(); return;
    }
    pick('dg-wpt-keep');
    __ok('WP-NEW back to keep ⇒ chart 3 baseline back to the current white point', dgCctBase().center !== 9300);
  } catch (e) { window.__errs.push('scenario: ' + (e && e.stack || e)); }
  __done();
})();
