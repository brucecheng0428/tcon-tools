/* MO：dg v2.8.0「只量測（不調整）」入口＋比較清單每組摘要（平均 Gamma、白點 x,y、最高階色溫）＋Excel「資料來源」四欄。
   注入在 dg.html 的 IIFE 裡。__moCase：
     MAIN：入口第四顆存在 → 按下去切到「光學資料比較」、跳既有二選一（slot 那一列）、不動 DG_WMODE／DG_PQ；
           選「電腦畫面量測」⇒ 以那一號任務送回模擬量測（gamma 2.2、D65）⇒ 進比較清單、摘要數字正確；
           無色度組顯示「—」；檔內有色溫 T 就用 T；匯出 Excel「資料來源」多四欄且數字一致；匯出檔再匯入照樣 3 組、來源不掉。
     EN／CN：鈕面、副標、摘要標籤三語。
     SHOT：入口卡截圖用（停在主分頁入口卡）。 SHOT-PICK：按下後跳出二選一的截圖用。 SHOT-CMP：比較分頁三組＋摘要截圖用。 */
(async function () {
  try {
    await __boot(1500);
    var C = window.__moCase || 'MAIN';
    function vis(id) { var e = $(id); if (!e) return false; var r = e.getBoundingClientRect(); return e.offsetParent !== null && r.width > 0 && r.height > 0; }
    function send(d) { window.dispatchEvent(new MessageEvent('message', { data: d, origin: window.location.origin, source: window })); }
    function rowsArr(gam, x, y, k) { var a = []; for (var g = 0; g < 256; g++) a.push([g, x, y, Math.pow(g / 255, gam) * 200 * (k || 1) + 0.1]); return a; }
    function rowsObj(gam, x, y, T) { var a = []; for (var g = 0; g < 256; g++) a.push({ g: g, x: x, y: y, Y: Math.pow(g / 255, gam) * 180 + 0.2, T: T }); return a; }
    var b = $('dg-btn-wmode-meas');
    __ok('MO0 4th entry button exists in the entry card', !!b && $('dg-card-wmode').contains(b));

    if (C === 'EN' || C === 'CN') {
      applyLang(C === 'EN' ? 'en' : 'zh-CN'); await __wait(100);
      var want = C === 'EN' ? ['Measure only (no tuning)', 'Just measure gamma', 'Avg gamma', 'White point', 'CCT']
                            : ['只量测（不调整）', '只量 Gamma 与色温', '平均 Gamma', '白点', '色温'];
      __ok('MO-' + C + ' button text', b.textContent === want[0], b.textContent);
      var sub = b.parentNode.querySelector('.dg-fork-sub').textContent;
      __ok('MO-' + C + ' sub text', sub.indexOf(want[1]) === 0, sub);
      dgSlotAdd({ rows: rowsObj(2.2, 0.3127, 0.329, null) }, 'mo.csv');
      var t = (document.querySelector('#dg-slot-list .dg-slot-sum') || {}).textContent || '';
      __ok('MO-' + C + ' summary labels', t.indexOf(want[2]) === 0 && t.indexOf(want[3]) > 0 && t.indexOf(want[4]) > 0, t);
      __done(); return;
    }
    if (C === 'SHOT') { __done(); return; }

    var wm0 = DG_WMODE, pq0 = DG_PQ;
    b.click(); await __until(function () { return dgApi.pickOpen(); });
    __ok('MO1 switched to the comparison tab', DG_MODE === 'cmp' && vis('dg-cmp-content') && !vis('dg-main-content'));
    __ok('MO1 existing PC / T-CON pick popup opened for the comparison list', dgApi.pickOpen() && dgApi.pickPending() === 'slot', dgApi.pickPending());
    __ok('MO1 work mode and PQ state untouched', DG_WMODE === wm0 && DG_PQ === pq0, String(DG_WMODE) + '/' + DG_PQ);
    __ok('MO1 both choices shown', vis('dg-btn-pick-pc') && vis('dg-btn-pick-tcon'));
    if (C === 'SHOT-PICK') { __done(); return; }
    var t0 = dgLiveTaskId;
    $('dg-btn-pick-pc').click();
    await __until(function () { return dgLiveTaskId > t0; });
    var task = dgLiveTaskId;
    __ok('MO2 PC pick starts a comparison-list task', DG_LIVE_TASKS[task] === 'slot' && DG_LIVE_TASK_KIND[task] === 'pc', DG_LIVE_TASKS[task] + '/' + DG_LIVE_TASK_KIND[task]);
    send({ type: 'dg-measure-result', mode: 'gray', task: task, rows: rowsArr(2.2, 0.3127, 0.329), at: 'mo1' });
    await __until(function () { return DG_SLOTS.length >= 1; });
    __ok('MO2 simulated result lands in the comparison list, part 2 untouched', DG_SLOTS.length === 1 && DG_SLOTS[0].srcMode === 'pc' && !dgPartFilled('gray'),
      'slots=' + DG_SLOTS.length + ' gray=' + dgPartFilled('gray'));
    __ok('MO2 no LUT produced', !lastLut);
    if (C === 'MAIN') { var mp = $('dg-modal-pick'); if (mp) mp.classList.remove('open'); }

    var m = dgSlotSummary(DG_SLOTS[0].rows), cct = dgCCT(0.3127, 0.329);
    __ok('MO3 avg gamma = 2.2 (synthetic exact)', Math.abs(m.gam - 2.2) < 1e-9 && m.nGam === 254, m.gam + ' n=' + m.nGam);
    __ok('MO3 white point = top row x,y; CCT = dgCCT(x,y)', m.x === 0.3127 && m.y === 0.329 && Math.abs(m.cct - cct) < 1e-9 && m.top === 255, JSON.stringify(m));
    var row = document.querySelector('#dg-slot-list [data-dg-slot-row="0"] .dg-slot-sum');
    var txt = row ? row.textContent : '';
    __ok('MO3 summary line shown under group 1', !!row && txt.indexOf('平均 Gamma 2.20') === 0 && txt.indexOf('白點 x 0.3127, y 0.3290') > 0
      && txt.indexOf('L255 色溫 ' + Math.round(cct) + 'K') > 0, txt);

    dgSlotAdd({ rows: rowsArr(2.4, 0, 0).map(function (r) { return { g: r[0], Y: r[3], x: null, y: null }; }) }, 'noxy.xlsx');
    var t2 = (document.querySelector('#dg-slot-list [data-dg-slot-row="1"] .dg-slot-sum') || {}).textContent || '';
    __ok('MO4 no chromaticity => gamma only, x/y/CCT shown as —', t2.indexOf('平均 Gamma 2.40') === 0 && t2.indexOf('x —, y —') > 0 && t2.indexOf('色溫 —') > 0, t2);
    dgSlotAdd({ rows: rowsObj(2.0, 0.30, 0.32, 7100) }, 'withT.xlsx');
    var m3 = dgSlotSummary(DG_SLOTS[2].rows);
    __ok('MO5 measured CCT T used when present', m3.cct === 7100 && Math.abs(m3.gam - 2.0) < 1e-9, JSON.stringify(m3));

    if (C === 'SHOT-CMP') { window.scrollTo(0, 0); __done(); return; }

    var files = await dgUnzip(dgSlotExportBytes().buffer);
    var s2 = new TextDecoder().decode(files['xl/worksheets/sheet2.xml']);
    __ok('MO6 Excel 資料來源 sheet has the 4 summary headers', ['平均 Gamma（逐階平均）', '白點 x（最高階）', '白點 y（最高階）', '最高階色溫（K）'].every(function (h) { return s2.indexOf(h) > 0; }));
    __ok('MO6 Excel row 1 values', s2.indexOf('<c r="G4"><v>2.2</v></c>') > 0 && s2.indexOf('<c r="H4"><v>0.3127</v></c>') > 0
      && s2.indexOf('<c r="I4"><v>0.329</v></c>') > 0 && s2.indexOf('<c r="J4"><v>' + Math.round(cct) + '</v></c>') > 0, s2.slice(s2.indexOf('<row r="4"'), s2.indexOf('<row r="4"') + 600));
    __ok('MO6 Excel no-xy group leaves x/y/CCT blank', s2.indexOf('<c r="H5"/>') > 0 && s2.indexOf('<c r="J5"/>') > 0 && s2.indexOf('<c r="G5"><v>2.4</v></c>') > 0);
    __ok('MO6 Excel dimension covers A:J', s2.indexOf('<dimension ref="A1:J6"/>') > 0);

    var bytes = dgSlotExportBytes(), srcs = DG_SLOTS.map(function (s) { return s.file; });
    dgSlotClearAll();
    dgSlotImportFile(new File([bytes], 'mo_roundtrip.xlsx'));
    await __until(function () { return DG_SLOTS.length === 3; });
    __ok('MO7 exported file re-imports: 3 groups, sources kept, summary same', DG_SLOTS.length === 3
      && DG_SLOTS.map(function (s) { return s.file; }).join('|') === srcs.join('|')
      && Math.abs(dgSlotSummary(DG_SLOTS[0].rows).gam - 2.2) < 1e-6, DG_SLOTS.map(function (s) { return s.file; }).join('|'));
  } catch (e) {
    window.__errs.push('scenario: ' + (e && e.stack || e));
  }
  __done();
})();
