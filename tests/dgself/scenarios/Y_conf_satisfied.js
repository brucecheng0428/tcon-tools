/* Y：dg v2.4.2 自檢頁「滿意 → 匯出 DG LUT（Excel）」送來 dg-conf-satisfied ⇒ DG 停在「查看目前結果」。
   注入在 dg.html 的 IIFE 裡。用產品自己的路徑跑到一輪結束（與 R 情境同一段：第 2／3 部分帶入 → 預設 LUT →
   計算 → 確認量測帶入第 4 部分），再模擬自檢頁送來那一則（source 用本頁自己，回覆經 window.postMessage 收下）。
   __yCase：OK（有確認量測 ⇒ 停在查看、寫「自檢頁已確認滿意（第一輪）」、「進行第二輪」照樣在、回 ok）／
            NOP4（還沒有確認量測 ⇒ 不假裝停在哪一輪、回 ok:false 與原因）。 */
(async function () {
  try {
    await __boot(1500);
    var C = window.__yCase || 'OK';
    /* MessageEvent 的 source 必須是真的視窗 ⇒ 用本頁自己當來源，DG 的回覆（e.source.postMessage）就落在這裡。 */
    var replies = [];
    window.postMessage = function (m) { if (m && m.type === 'dg-conf-satisfied-ack') replies.push(m); };
    function send(d) {
      window.dispatchEvent(new MessageEvent('message', { data: d, origin: window.location.origin, source: window }));
    }
    function rows(k) { var a = []; for (var g = 0; g < 256; g++) a.push([g, 0.3127, 0.329, Math.pow(g / 255, 2.2) * 200 * k + 0.1]); return a; }
    var prim = [['r', 0.64, 0.33, 40], ['g', 0.30, 0.60, 130], ['b', 0.15, 0.06, 15]];
    function vis(id) { var e = $(id); if (!e) return false; var r = e.getBoundingClientRect(); return e.offsetParent !== null && r.width > 0 && r.height > 0; }
    DG_WMODE = 'tcon'; DG_PQ = false; dgWmodeSync(); DG_ROUND = 1;
    DG_LIVE_TASKS[31] = 'gray'; DG_LIVE_TASK_KIND[31] = 'tcon';
    send({ type: 'dg-measure-result', mode: 'gray', task: 31, rows: rows(1), prim: prim, at: 'r1', cmpAsk: true });
    await __wait(50);
    dgFillDefault(); await __wait(50);
    dgDoCalc(); await __until(function () { return !!lastLut; });   // 2026-10-09 去偶發：等條件，不固定等
    if ($('dg-btn-conf-no') && vis('dg-btn-conf-no')) $('dg-btn-conf-no').click();
    __ok('Y0 round 1 has a result', !!lastLut);

    if (C === 'NOP4') {
      send({ type: 'dg-conf-satisfied', task: 99, round: 1, file: 'DG_LUT_EM02A1_20261001_1200_R1.xlsx' });
      await __until(function () { return replies.length >= 1; }); await __wait(100);
      __ok('Y-NOP4 replies ok:false with a reason, same task', replies.length === 1 && replies[0].type === 'dg-conf-satisfied-ack'
        && replies[0].ok === false && replies[0].task === 99 && /沒有這一輪的確認量測/.test(replies[0].why || ''), JSON.stringify(replies));
      __ok('Y-NOP4 no "stopped at round" note', !vis('dg-view-note'));
      __ok('Y-NOP4 round unchanged', DG_ROUND === 1);
      __done(); return;
    }

    // 確認量測帶入第 4 部分 ⇒ 一輪結束（決策框出現）
    DG_LIVE_TASKS[32] = 'conf'; DG_LIVE_TASK_KIND[32] = 'tcon';
    send({ type: 'dg-measure-result', mode: 'gray', task: 32, rows: rows(0.95), prim: prim, at: 'r2', cmpAsk: true });
    await __until(function () { return vis('dg-conf-decide'); });
    __ok('Y1 decide box shown, view note not yet', vis('dg-conf-decide') && !vis('dg-view-note'));
    var p4 = DG_P4, cmpN = (typeof DG_SLOTS !== 'undefined' && DG_SLOTS) ? DG_SLOTS.length : null;

    // 自檢頁「滿意 → 匯出」
    send({ type: 'dg-conf-satisfied', task: 32, round: 1, file: 'DG_LUT_EM02A1_20261001_1200_R1.xlsx' });
    await __until(function () { return replies.length >= 1 && vis('dg-view-note'); }); await __wait(100);
    __ok('Y2 replies ok with the same task and DG round', replies.length === 1 && replies[0].type === 'dg-conf-satisfied-ack'
      && replies[0].ok === true && replies[0].task === 32 && replies[0].round === 1, JSON.stringify(replies));
    var vn = ($('dg-view-note') || {}).textContent || '';
    __ok('Y2 stopped at "view current result": note shown, starts with 自檢頁已確認滿意（第一輪）',
      vis('dg-view-note') && vn.indexOf('自檢頁已確認滿意（第一輪）。已匯出 DG_LUT_EM02A1_20261001_1200_R1.xlsx。') === 0 && vn.indexOf('停在第一輪') > 0, vn.slice(0, 120));
    __ok('Y2 same as pressing 查看目前結果 (DG_VIEW_P4 = this confirmation)', DG_VIEW_P4 === DG_P4 && DG_P4 === p4);
    __ok('Y2 "進行第二輪" still there and enabled', vis('dg-btn-next-round') && !$('dg-btn-next-round').disabled && $('dg-btn-next-round').textContent === '進行第二輪',
      $('dg-btn-next-round').textContent);
    __ok('Y2 nothing else changed (round, part 4, comparison list)', DG_ROUND === 1 && DG_P4 === p4
      && (cmpN === null || DG_SLOTS.length === cmpN));
    // 按「進行第二輪」照樣能走（note 跟著收掉）
    $('dg-btn-next-round').click(); await __until(function () { return DG_ROUND === 2 && !vis('dg-view-note'); });
    __ok('Y3 next round still works after the sync', DG_ROUND === 2 && !vis('dg-view-note'), 'round=' + DG_ROUND);
    __ok('Y version = common/version.js dg (' + window.__expectDgVer + ')', TOOL_VERSIONS.dg === window.__expectDgVer, TOOL_VERSIONS.dg);
  } catch (e) { window.__errs.push('scenario: ' + (e && e.stack || e)); }
  __done();
})();
