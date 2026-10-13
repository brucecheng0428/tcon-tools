/* DO：dg v2.4.11 計算輸出一律是 T-CON LUT 模式的合法表＋量測異常警告（Bruce 2026-10-13，同事B 量測儀器對著天空）。
   注入在 dg.html 的 IIFE 裡。自檢頁那一端用訊息模擬：dg-ic-info（EM02A1、10-bit、lutMode）＋ dg-measure-result（白灰階＋純色）。
   __oCase：SKY（offset，白灰階亮度幾乎不變＝儀器沒對準畫面）／SKYT（同一份資料，target 模式）／
            NORM（offset，正常 γ2.2 白灰階）／OLD（舊版自檢頁沒送 lutMode ⇒ 不約束，行為同 v2.4.10）／
            RAND（第 1 部分＝同事B 機台的表、白灰階亮度亂跳 ⇒ 原始計算會超出 offset 限制）。 */
(async function () {
  try {
    await __boot(1500);
    var C = window.__oCase || 'SKY';
    /* 同事B 的 code（RM80103.PC_newcode.v2）裡的 DG LUT，R/G/B 各 257 筆（offset 6-bit 解開）。 */
    var PEERB = [[0,6,12,17,20,23,27,31,34,38,41,44,48,51,55,57,60,64,67,70,73,76,80,83,86,89,92,96,99,103,106,109,113,117,120,124,128,132,135,139,143,147,151,155,159,163,167,171,176,180,184,188,193,197,202,206,211,216,220,225,229,234,238,242,246,250,253,257,260,264,268,271,275,279,282,286,290,293,297,301,305,309,313,316,320,324,328,332,335,339,343,347,351,354,358,362,365,369,373,377,380,384,388,392,396,400,404,408,412,416,420,424,428,433,437,440,444,448,452,457,460,464,468,472,476,480,483,487,491,495,499,503,506,510,514,518,522,526,530,534,538,542,546,549,553,557,561,565,569,573,577,581,586,590,594,598,602,606,610,614,619,623,627,631,636,640,644,649,653,657,662,666,670,674,679,683,688,692,696,701,705,709,713,718,722,726,730,735,739,743,748,752,757,762,767,771,776,781,786,791,796,801,806,810,815,820,824,829,834,838,843,847,851,856,860,865,869,873,878,882,886,890,895,899,903,907,911,915,919,922,926,930,934,938,941,945,948,952,955,959,962,965,969,972,975,978,981,984,987,990,992,995,999,1002,1005,1008,1023],[0,1,5,12,17,21,25,29,33,36,40,43,47,50,54,58,60,63,66,70,73,76,79,82,86,89,92,96,99,103,106,110,114,117,121,125,129,133,137,141,144,148,152,157,161,165,169,173,177,182,186,191,195,200,204,209,213,218,223,228,232,237,241,245,249,252,256,260,263,267,271,274,278,282,285,289,293,297,301,304,308,312,316,320,324,328,331,335,339,343,347,351,355,358,362,366,370,373,377,381,385,389,393,397,401,405,409,413,417,421,425,429,433,437,441,445,449,453,457,461,465,469,473,477,480,484,488,492,496,500,504,507,511,515,519,523,527,531,535,539,543,547,551,555,559,562,566,571,575,579,583,587,591,595,599,603,607,611,616,620,624,628,633,637,641,646,650,654,659,663,667,671,676,680,684,689,693,697,702,706,710,714,719,723,727,731,736,740,744,748,753,758,763,768,772,777,782,787,792,797,802,806,811,816,820,825,830,834,839,843,848,852,856,861,865,869,874,878,882,886,891,895,899,903,907,911,914,918,922,926,930,934,937,941,944,948,951,954,958,961,964,968,971,974,977,980,982,985,988,991,993,996,999,1002,1005,1008,1023],[0,1,2,3,11,18,22,27,32,35,38,42,46,49,52,55,59,62,65,69,72,75,79,82,85,89,92,96,99,103,107,110,114,118,122,126,130,134,138,142,146,150,154,158,162,167,171,175,180,184,188,193,198,202,207,212,217,221,226,231,235,240,244,248,251,255,259,263,266,270,274,278,282,285,289,293,297,301,304,308,312,316,320,324,328,332,336,340,344,347,351,355,359,363,367,370,374,378,382,386,390,394,398,402,406,411,415,419,423,427,431,435,439,443,447,451,455,459,463,467,471,475,479,483,486,490,494,498,502,506,510,514,518,522,526,530,534,538,542,546,550,554,558,562,566,570,574,578,582,586,590,594,599,603,607,611,615,620,624,628,633,637,641,645,650,654,659,663,667,671,676,680,685,689,693,698,702,706,711,715,719,723,728,732,736,741,745,749,754,759,763,768,773,778,783,788,793,798,803,807,812,816,821,826,830,835,839,844,848,853,857,861,865,870,874,878,882,887,891,895,899,903,907,910,914,918,922,925,929,933,936,940,943,947,950,953,956,959,963,966,969,972,975,977,980,982,985,987,990,992,995,998,1000,1003,1005,1008,1023]];
    window.postMessage = function () {};
    function send(d) { window.dispatchEvent(new MessageEvent('message', { data: d, origin: window.location.origin, source: window })); }
    /* 天空：亮度 12.4～12.9 隨機起伏、色度在 同事B 照片的白點附近（固定種子，每次相同）。 */
    var seed = 12345; function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
    function skyRows() { var a = []; for (var g = 0; g < 256; g++) a.push([g, 0.4009 + (rnd() - 0.5) * 0.004, 0.4095 + (rnd() - 0.5) * 0.004, 12.4 + rnd() * 0.5]); return a; }
    function normRows() { var a = []; for (var g = 0; g < 256; g++) a.push([g, 0.3127, 0.329, Math.pow(g / 255, 2.2) * 250 + 0.1]); return a; }
    /* RAND：白灰階亮度隨機跳動（儀器亂晃）。 */
    function randRows() { var a = []; for (var g = 0; g < 256; g++) a.push([g, 0.40 + (rnd() - 0.5) * 0.02, 0.41 + (rnd() - 0.5) * 0.02, 0.5 + rnd() * 12]); return a; }
    var prim = (C === 'NORM') ? [['r', 0.64, 0.33, 50], ['g', 0.30, 0.60, 170], ['b', 0.15, 0.06, 20]]
                              : [['r', 0.41, 0.40, 12.5], ['g', 0.40, 0.41, 12.7], ['b', 0.40, 0.40, 12.6]];
    function lutStep() {
      var m = $('dg-modal-lut'); if (!m || !m.classList.contains('open')) return null;
      var st = null;
      Array.prototype.forEach.call(m.querySelectorAll('.dg-lut-step'), function (x) { if (x.style.display !== 'none') st = x.getAttribute('data-step'); });
      return st;
    }
    DG_WMODE = 'tcon'; DG_PQ = false; dgWmodeSync(); DG_ROUND = 1;
    var ic = { type: 'dg-ic-info', version: TOOL_VERSIONS.dgself, at: '15:00', ic: 'EM02A1', icKey: 'EM02A1', lutDepth: 10, lutDepthWhy: '', txBits: 8, txWhy: '' };
    if (C !== 'OLD') ic.lutMode = (C === 'SKYT') ? 'target' : 'offset';
    send(ic); await __until(function () { return DG_IC && DG_IC.icKey === 'EM02A1'; }, 5000);
    __ok('O0 IC info landed (mode ' + (DG_IC && DG_IC.lutMode) + ', out ' + dgOutBit() + '-bit)', DG_IC && dgOutBit() === 10 && DG_IC.lutMode === (C === 'OLD' ? null : (C === 'SKYT' ? 'target' : 'offset')));
    DG_LIVE_TASKS[41] = 'gray'; DG_LIVE_TASK_KIND[41] = 'tcon';
    send({ type: 'dg-measure-result', mode: 'gray', task: 41, rows: (C === 'NORM') ? normRows() : (C === 'RAND' ? randRows() : skyRows()), prim: prim, at: 'r1', cmpAsk: true });
    await __wait(80);
    if (C === 'RAND') {
      var lr = []; for (var q = 0; q < 256; q++) lr.push([q, PEERB[0][q], PEERB[1][q], PEERB[2][q]]);
      dgApplyLiveLut(lr, 'EM02A1', { lutSrc: 'tcon' });
      DG_TONE = 'cct';
      /* 照片情境：原始計算的 B 第 1 筆＝500（10-bit），在演算法輸出那一層注入，之後的路（輸出深度、
         offset 約束、狀態文字、指紋）全部走產品本身。亂跳的白灰階同時觸發量測異常警告。 */
      var dgCompute0 = dgCompute;
      dgCompute = function (cfg, data) { var r = dgCompute0(cfg, data); r.lut[1][2] = 500 * Math.pow(2, cfg.hw - 10); return r; };
      dgDoCalc();
    } else {
      dgLutModalOpen(); await __wait(50);
      $('dg-btn-default').click(); await __until(function () { return lutStep() === 'tone'; }, 5000);
      $('dg-btn-tone-cct').click();
    }
    await __until(function () { return !!lastLut && /計算完成|錯誤/.test((($('dg-status') || {}).textContent) || ''); }, 8000);
    try { dgStepModalClose('dg-modal-conf'); } catch (eM) {}
    var st = ($('dg-status') || {}).textContent || '';
    __ok('O1 calculated', !!lastLut && /計算完成/.test(st), st.slice(0, 120));
    var body = dgOutLutBody() || [];
    /* 合法性（offset 6-bit）：第 0 筆 0～63（基準 0），1～251 每筆比前一筆多 0～63，全部 0～1023。 */
    var bad = [], ch, i, prev;
    for (ch = 0; ch < 3; ch++) for (i = 0; i < body.length; i++) {
      var v = body[i][ch];
      if (!(v >= 0 && v <= 1023)) bad.push('ch' + ch + '[' + i + ']=' + v);
      if (i < 252) { prev = i ? body[i - 1][ch] : 0; if (v - prev < 0 || v - prev > 63) bad.push('ch' + ch + '[' + i + '] ' + prev + '->' + v); }
    }
    var maxStep = 0; for (ch = 0; ch < 3; ch++) for (i = 1; i < 252; i++) maxStep = Math.max(maxStep, body[i][ch] - body[i - 1][ch]);
    if (C === 'RAND') {
      __ok('O2 erratic measurement + real T-CON LUT: output is a legal offset 6-bit table', body.length === 256 && bad.length === 0, bad.slice(0, 6).join(' ') + ' maxStep=' + maxStep);
      __ok('O3 the raw calculation did break the offset limit (fit exercised)', DG_OUT_FIT && DG_OUT_FIT.n > 0, JSON.stringify(DG_OUT_FIT && { n: DG_OUT_FIT.n, perCh: DG_OUT_FIT.perCh, big: DG_OUT_FIT.maxAbs }));
      __ok('O5 measurement warning + adjust detail shown', /量測資料異常，請確認量測儀器有對準畫面/.test(st) && /T-CON 是 Offset 模式/.test(st) && /→/.test(st), st);
      __ok('O4 push fingerprint uses the legal table', dgP4LutSig() === dgOutBit() + ':' + body.map(function (r) { return r.join(','); }).join(';'));
    }
    if (C === 'SKY' || C === 'NORM') {
      __ok('O2 output is a legal offset 6-bit table (256 rows)', body.length === 256 && bad.length === 0, bad.slice(0, 6).join(' ') + ' maxStep=' + maxStep);
      __ok('O3 fit recorded', !!DG_OUT_FIT, JSON.stringify(DG_OUT_FIT && { n: DG_OUT_FIT.n, perCh: DG_OUT_FIT.perCh }));
      /* 「一鍵複製」與「即時更新」的指紋都走同一個出口 */
      __ok('O4 push fingerprint uses the legal table', dgP4LutSig() === dgOutBit() + ':' + body.map(function (r) { return r.join(','); }).join(';'));
    }
    if (C === 'SKY') {
      __ok('O5 measurement warning shown', /量測資料異常，請確認量測儀器有對準畫面/.test(st), st);
      __ok('O6 offset adjust explained (which entries, from→to)', DG_OUT_FIT.n === 0 || (/T-CON 是 Offset 模式/.test(st) && /→/.test(st)), st);
    }
    if (C === 'NORM') __ok('O5 normal data: no measurement warning', !/量測資料異常/.test(st), st);
    if (C === 'SKYT') {
      __ok('O2 target mode: no offset fitting, values 0..1023', DG_OUT_FIT === null && body.every(function (r) { return r.every(function (v) { return v >= 0 && v <= 1023; }); }));
      __ok('O5 measurement warning still shown', /量測資料異常/.test(st), st);
    }
    if (C === 'OLD') __ok('O2 no lutMode from old self-test page: output not constrained', DG_OUT_FIT === null);
    __ok('O version = common/version.js dg (' + window.__expectDgVer + ')', TOOL_VERSIONS.dg === window.__expectDgVer, TOOL_VERSIONS.dg);
    var s = $('dg-status'); if (s && s.scrollIntoView) s.scrollIntoView({ block: 'center' });
    await __wait(300);
  } catch (e) { window.__errs.push('scenario: ' + (e && e.stack || e)); }
  __done();
})();
