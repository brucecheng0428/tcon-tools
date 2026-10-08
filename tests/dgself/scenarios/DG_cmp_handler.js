/* DG：dg v2.2.0 DG 主頁（dg.html）這一側。注入在 dg.html 的 IIFE 裡。
   量測頁的訊息用真的 MessageEvent 送進產品的 message 處理器（origin＝本頁、source＝本頁）；
   DG 的回覆（e.source.postMessage）以換掉 window.postMessage 的方式收下來。
   驗：帶 cmpAsk 的量測結果（第 2 部分／第 4 部分／比較分頁三條落點）照常落地但不自動加組；
       查詢回筆數與預設名；確定 ⇒ 加組（名稱、純色、加入時間）；再按 ⇒ 只更新不重複；改名；
       滿 10 組 ⇒ 回原因；DG 手上沒有那一份 ⇒ 用訊息帶的資料建組；舊版量測頁（沒有 cmpAsk）照舊自動加。 */
(async function () {
  try {
    await __boot(1500);
    var rep = [];
    window.postMessage = function (m) { rep.push(m); };
    function send(d) {
      window.dispatchEvent(new MessageEvent('message', { data: d, origin: window.location.origin, source: window }));
    }
    function rows(k) { var a = []; for (var g = 0; g < 256; g++) a.push([g, 0.3127, 0.329, Math.pow(g / 255, 2.2) * 200 * k + 0.1]); return a; }
    var prim = [['r', 0.64, 0.33, 40], ['g', 0.30, 0.60, 130], ['b', 0.15, 0.06, 15]];
    function last(t) { for (var i = rep.length - 1; i >= 0; i--) if (rep[i].type === t) return rep[i]; return null; }
    DG_ROUND = 1;
    if (window.__dgCase === 'NR') {
      /* 確認結果那次在量測頁按了取消 ⇒ 「進行第二輪」不可以自動把它補記進比較清單（v2.1.0 以前會）。
         用產品自己的路徑算出一張表：第 1 部分預設 LUT、第 2 部分＋第 3 部分由第一次量測帶入。 */
      DG_LIVE_TASKS[21] = 'gray'; DG_LIVE_TASK_KIND[21] = 'tcon';
      send({ type: 'dg-measure-result', mode: 'gray', task: 21, rows: rows(1), prim: prim, at: 'n1', cmpAsk: true });
      await __wait(50);
      dgFillDefault();
      await __wait(50);
      dgDoCalc();
      await __until(function () { return !!lastLut; });   // 2026-10-09 去偶發：等條件，不固定等
      __ok('NR1 a result exists (lastLut)', !!lastLut, dgMissingParts().join(','));
      DG_LIVE_TASKS[22] = 'conf'; DG_LIVE_TASK_KIND[22] = 'tcon';
      send({ type: 'dg-measure-result', mode: 'gray', task: 22, rows: rows(0.95), prim: prim, at: 'n2', cmpAsk: true });
      await __until(function () { return DG_P4 && DG_P4.cmpAsk; });
      __ok('NR2 conf landed, nothing in comparison (user will cancel)', DG_P4 && DG_P4.cmpAsk && DG_SLOTS.length === 0, DG_SLOTS.length);
      var okNR = dgNextRound();
      await __until(function () { return DG_ROUND === 2 && ($('dg-status').textContent || '').indexOf('這一輪也不自動加入') >= 0; });
      __ok('NR3 next round started', okNR === true && DG_ROUND === 2, DG_ROUND);
      __ok('NR3 cancelled conf NOT auto-recorded', DG_SLOTS.length === 0, DG_SLOTS.length);
      __ok('NR3 status says why', ($('dg-status').textContent || '').indexOf('這一輪也不自動加入') >= 0);
      /* 對照：確認結果那次按了確定 ⇒ 下一輪把那一組改名成新輪數（既有 v1.26.0 行為照舊） */
      DG_LIVE_TASKS[23] = 'conf'; DG_LIVE_TASK_KIND[23] = 'tcon';
      dgDoCalc(); await __until(function () { return !!lastLut; });
      send({ type: 'dg-measure-result', mode: 'gray', task: 23, rows: rows(0.9), prim: prim, at: 'n3', cmpAsk: true });
      await __wait(50);
      send({ type: 'dg-cmp-add', task: 23, name: '第二輪確認', edited: false });
      __ok('NR4 conf added via popup', DG_SLOTS.length === 1 && dgSlotDisplayName(0) === '第二輪確認', dgSlotDisplayName(0));
      dgNextRound();
      await __until(function () { return DG_ROUND === 3 && dgSlotDisplayName(0) === '第三輪'; });
      __ok('NR4 next round retitles that set (existing rule kept)', DG_ROUND === 3 && DG_SLOTS.length === 1 && dgSlotDisplayName(0) === '第三輪', dgSlotDisplayName(0));
      __done(); return;
    }
    var n0 = DG_SLOTS.length;
    __ok('DG0 starts empty', n0 === 0, n0);

    // ① 第 2 部分（主量測）帶 cmpAsk
    DG_LIVE_TASKS[11] = 'gray'; DG_LIVE_TASK_KIND[11] = 'tcon';
    send({ type: 'dg-measure-result', mode: 'gray', task: 11, rows: rows(1), prim: prim, durMs: 1234, settleMs: 300, at: 't1', cmpAsk: true });
    await __until(function () { return $('dg-in-gray').value.split('\n').filter(function (l) { return l.trim(); }).length >= 256 && !!DG_CMP_PEND[11]; });
    __ok('DG1 part 2 got the data', $('dg-in-gray').value.split('\n').filter(function (l) { return l.trim(); }).length >= 256);
    __ok('DG1 NOT auto-added', DG_SLOTS.length === 0, DG_SLOTS.length);
    __ok('DG1 no dg-slot-auto reply', !last('dg-slot-auto'));
    __ok('DG1 status says the popup decides', ($('dg-status').textContent || '').indexOf('由量測分頁的視窗決定') >= 0);
    __ok('DG1 pending kept for task 11', !!DG_CMP_PEND[11] && DG_CMP_PEND[11].rows.length === 256 && DG_CMP_PEND[11].job === 'main');
    send({ type: 'dg-cmp-query', task: 11 });
    var q = last('dg-cmp-info');
    __ok('DG2 info: count/max/round/job/name', q && q.task === 11 && q.count === 0 && q.max === 10 && q.round === 1 && q.job === 'main'
      && q.name === '第一輪' && !q.same && !q.full && q.list.length === 0, JSON.stringify(q));
    send({ type: 'dg-cmp-add', task: 11, name: '第一輪', edited: false });
    var a = last('dg-cmp-added');
    __ok('DG3 added as set 1', a && a.ok && a.no === 1 && a.count === 1 && !a.updated && a.name === '第一輪', JSON.stringify(a));
    __ok('DG3 reply carries max + latest list (v2.2.1)', a.max === 10 && Array.isArray(a.list) && a.list.length === 1 && a.list[0].no === 1
      && a.list[0].name === '第一輪' && typeof a.list[0].t === 'number', JSON.stringify(a.list));
    var s0 = DG_SLOTS[0] || {};
    __ok('DG3 default name is not user-set (next round can retitle)', s0.nameIsUserSet === false && dgSlotDisplayName(0) === '第一輪');
    __ok('DG3 primaries of this round stored', !!(s0.prim && s0.prim.r && s0.prim.g && s0.prim.b));
    __ok('DG3 duration + addedAt stored', s0.durMs === 1234 && typeof s0.addedAt === 'number' && Math.abs(Date.now() - s0.addedAt) < 10000);
    __ok('DG3 same rows as part 2 export (dedupe with "transfer")', dgSlotFindSame(dgSlotRowsFromText($('dg-in-gray').value)) === 0);
    send({ type: 'dg-cmp-query', task: 11 });
    q = last('dg-cmp-info');
    __ok('DG4 info now: count 1, same = set 1, list has time', q.count === 1 && q.same && q.same.no === 1 && q.list[0].name === '第一輪' && typeof q.list[0].t === 'number');
    send({ type: 'dg-cmp-add', task: 11, name: '第一輪', edited: false });
    a = last('dg-cmp-added');
    __ok('DG5 second OK does not duplicate', a.ok && a.updated && a.no === 1 && DG_SLOTS.length === 1);
    send({ type: 'dg-cmp-add', task: 11, name: '  量測 A ', edited: true });
    a = last('dg-cmp-added');
    __ok('DG5 edited name updates set 1', a.ok && a.updated && a.name === '量測 A' && DG_SLOTS[0].nameIsUserSet === true && DG_SLOTS.length === 1, a.name);
    __ok('DG5 updated reply list shows the new name', a.list && a.list.length === 1 && a.list[0].name === '量測 A', JSON.stringify(a.list));

    // ② 第 4 部分（確認結果）帶 cmpAsk
    DG_LIVE_TASKS[12] = 'conf'; DG_LIVE_TASK_KIND[12] = 'tcon';
    send({ type: 'dg-measure-result', mode: 'gray', task: 12, rows: rows(0.9), prim: prim, at: 't2', cmpAsk: true });
    await __until(function () { return DG_P4 && DG_P4.rows.length === 256 && DG_P4.cmpAsk === true; });
    __ok('DG6 part 4 got the data, not auto-recorded', DG_P4 && DG_P4.rows.length === 256 && DG_P4.cmpAsk === true && DG_SLOTS.length === 1);
    send({ type: 'dg-cmp-query', task: 12 });
    q = last('dg-cmp-info');
    __ok('DG6 conf default name', q.job === 'conf' && q.name === '第一輪確認' && q.count === 1, q.name);
    send({ type: 'dg-cmp-add', task: 12, name: '第一輪確認', edited: false });
    a = last('dg-cmp-added');
    __ok('DG6 conf added as set 2', a.ok && a.no === 2 && dgSlotDisplayName(1) === '第一輪確認' && DG_SLOTS[1].nameIsUserSet === false
      && dgSlotFindSame(DG_P4.rows) === 1);

    // 自動保存：addedAt／p4.cmpAsk 跟著存（選填欄位）。要在第 2 部分再進新資料之前拍（那會清掉第 4 部分）
    var snap = dgAsSnapshot();
    __ok('DG6 autosave keeps addedAt + p4.cmpAsk', typeof snap.slots[0].addedAt === 'number' && snap.p4 && snap.p4.cmpAsk === true,
      JSON.stringify({ t: snap.slots[0].addedAt, p4: !!snap.p4 }));

    // ③ 光學資料比較分頁的即時量測帶 cmpAsk
    DG_LIVE_TASKS[13] = 'slot'; DG_LIVE_TASK_KIND[13] = 'pc';
    send({ type: 'dg-measure-result', mode: 'gray', task: 13, rows: rows(0.8), prim: null, at: 't3', cmpAsk: true });
    await __until(function () { return ($('dg-slot-status').textContent || '').indexOf('由量測分頁的視窗決定') >= 0; });
    __ok('DG7 slot path not auto-added', DG_SLOTS.length === 2 && ($('dg-slot-status').textContent || '').indexOf('由量測分頁的視窗決定') >= 0);
    send({ type: 'dg-cmp-query', task: 13 });
    q = last('dg-cmp-info');
    __ok('DG7 slot default name = next set number', q.job === 'slot' && q.name === '第 3 組', q.name);
    send({ type: 'dg-cmp-add', task: 13, name: '第 3 組', edited: false });
    a = last('dg-cmp-added');
    __ok('DG7 slot added, source = pc', a.ok && a.no === 3 && DG_SLOTS[2].srcMode === 'pc' && dgSlotDisplayName(2) === '第 3 組');

    // ④ DG 手上沒有那一份（例如 DG 重整過）⇒ 用訊息帶的資料建組
    send({ type: 'dg-cmp-add', task: 99, name: '', edited: false, rows: rows(0.7), prim: prim, job: 'main', at: 't4', kind: 'tcon' });
    a = last('dg-cmp-added');
    __ok('DG8 fallback from message data', a.ok && a.no === 4 && DG_SLOTS[3].rows.length === 256 && DG_SLOTS[3].srcMode === 'tcon' && dgSlotDisplayName(3) === '第一輪', a.name);

    // ⑤ 舊版量測頁（沒有 cmpAsk）⇒ 照舊自動加，並回 dg-slot-auto
    DG_LIVE_TASKS[14] = 'gray'; DG_LIVE_TASK_KIND[14] = 'pc';
    var before = rep.length;
    send({ type: 'dg-measure-result', mode: 'gray', task: 14, rows: rows(0.6), prim: null, at: 't5' });
    await __until(function () { return DG_SLOTS.length === 5 && rep.slice(before).some(function (m) { return m.type === 'dg-slot-auto'; }); });
    var auto = rep.slice(before).filter(function (m) { return m.type === 'dg-slot-auto'; })[0];
    __ok('DG9 legacy page: auto-added + dg-slot-auto reply', DG_SLOTS.length === 5 && auto && auto.no === 5, DG_SLOTS.length);

    // ⑥ 滿 10 組
    for (var k = 0; k < 5; k++) send({ type: 'dg-cmp-add', task: 200 + k, name: '', edited: false, rows: rows(0.5 - k * 0.05), job: 'slot', kind: 'pc' });
    __ok('DG10 filled to 10', DG_SLOTS.length === 10, DG_SLOTS.length);
    DG_LIVE_TASKS[15] = 'gray'; DG_LIVE_TASK_KIND[15] = 'tcon';
    send({ type: 'dg-measure-result', mode: 'gray', task: 15, rows: rows(0.2), prim: null, at: 't6', cmpAsk: true });
    await __wait(50);
    send({ type: 'dg-cmp-query', task: 15 });
    q = last('dg-cmp-info');
    __ok('DG10 info says full', q.full === true && q.count === 10);
    send({ type: 'dg-cmp-add', task: 15, name: '', edited: false });
    a = last('dg-cmp-added');
    __ok('DG10 full ⇒ not added, reason given', !a.ok && DG_SLOTS.length === 10 && a.note.indexOf('已滿 10 組') >= 0, a.note);
    __ok('DG10 failed reply still carries list (10)', a.list && a.list.length === 10 && a.max === 10);

    __ok('DG version = common/version.js dg (' + window.__expectDgVer + ')', TOOL_VERSIONS.dg === window.__expectDgVer, TOOL_VERSIONS.dg);
  } catch (e) { window.__errs.push('scenario: ' + (e && e.stack || e)); }
  __done();
})();
