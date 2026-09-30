/* M：v2.4.0 量完一輪 ⇒ 在自檢頁跳「加入光學資料比較」視窗（window.__cmpCase 由 runner 指定）。
   假 DG：換掉 window.opener.postMessage，收到 dg-cmp-query／dg-cmp-add 就非同步呼叫
   dstCmpOnInfo／dstCmpOnAdded 回覆（等同 DG 的 postMessage 回覆被收訊處理器轉進來）。
   用 __arm() 的假 I2C／假量測儀真的跑一輪 dstRun()，走的是產品的送出路徑。
   A   ＝正常：先送 dg-measure-result（cmpAsk）再問筆數；視窗內容、焦點在「確定」、預填名稱、按確定 ⇒ 已加入共 N 筆
   B   ＝Esc 取消 ⇒ 不送 add、結果仍在頁面；④ 底下的鈕重開 ⇒ 重問一次；改名後按 Enter ⇒ 送出 edited 名稱
   C   ＝DG 不回 ⇒「無法取得，按確定仍會送出」；確定照送；沒回覆 ⇒ 如實說沒收到
   FULL＝已滿 10 筆（第 2 輪確認結果）⇒ 警告、DG 回 ok:false ⇒ 顯示原因
   SAME＝逐值相同 ⇒ 提示只更新名稱、DG 回 updated
   EN／CN＝英文／簡中字面
   NODG＝不是從 DG 開的 ⇒ 不送、不跳視窗 */
(async function () {
  try {
    var C = window.__cmpCase || 'A';
    await __wait(800);
    if (C === 'EN') applyLang('en');
    if (C === 'CN') applyLang('zh-CN');
    var sent = [], dg = { count: (C === 'FULL') ? 10 : 2, reply: (C !== 'C'), adds: [] };
    var now = Date.now();
    function list(n) { var a = []; for (var i = 0; i < n; i++) a.push({ no: i + 1, name: '組' + (i + 1), t: (i === 1) ? null : now - 60000 * (i + 1) }); return a; }
    if (window.opener) window.opener.postMessage = function (m) {
      sent.push(m);
      if (!dg.reply) return;
      if (m.type === 'dg-cmp-query') setTimeout(function () {
        dstCmpOnInfo({ type: 'dg-cmp-info', task: m.task, count: dg.count, max: 10, list: list(dg.count),
          round: (C === 'FULL') ? 2 : 1, job: (C === 'FULL') ? 'conf' : 'main',
          name: (C === 'SAME') ? '組1' : (C === 'FULL') ? '第二輪確認' : '第一輪',
          same: (C === 'SAME') ? { no: 1, name: '組1' } : null, full: dg.count >= 10 });
      }, 40);
      if (m.type === 'dg-cmp-add') setTimeout(function () {
        dg.adds.push(m);
        if (dg.count >= 10) dstCmpOnAdded({ type: 'dg-cmp-added', task: m.task, ok: false, count: 10, note: '光學量測組已滿 10 組，沒有加入。' });
        else if (C === 'SAME') dstCmpOnAdded({ type: 'dg-cmp-added', task: m.task, ok: true, updated: true, no: 1, name: m.name, count: dg.count });
        else { dg.count++; dstCmpOnAdded({ type: 'dg-cmp-added', task: m.task, ok: true, updated: false, no: dg.count, name: m.name, count: dg.count }); }
      }, 40);
    };
    var modal = document.getElementById('dst-modal-cmp');
    function open() { return modal.classList.contains('open'); }
    function tx(id) { return __txt(id) || ''; }
    await __arm();
    __ok('M0 no modal before run', !open());
    await dstRun();
    await __wait(20);
    var iRes = -1, iQ = -1;
    sent.forEach(function (m, i) { if (m.type === 'dg-measure-result' && iRes < 0) iRes = i; if (m.type === 'dg-cmp-query' && iQ < 0) iQ = i; });
    if (C === 'NODG') {
      __ok('M-NODG: not from DG ⇒ nothing sent', !dstDgAlive() && sent.length === 0);
      __ok('M-NODG: no modal', !open());
      __ok('M-NODG: re-add row hidden', __cls('dst-cmp-row', 'dst-hidden'));
      __checkVersion('M-NODG');
      __done(); return;
    }
    __ok('M1 run ok + result sent', dstRunOk && iRes >= 0, 'rows=' + dstRows.length);
    var R = sent[iRes] || {};
    __ok('M1 result carries cmpAsk (DG will not auto-add)', R.cmpAsk === true && R.mode === 'gray');
    __ok('M1 result sent BEFORE the popup asks', iQ > iRes, 'res#' + iRes + ' query#' + iQ);
    __ok('M1 modal open right after the run', open());
    __ok('M1 focus on OK', document.activeElement && document.activeElement.id === 'dst-cmp-ok', document.activeElement && document.activeElement.id);
    var zh = (C !== 'EN' && C !== 'CN');
    if (C === 'FULL') __ok('M1 this line (round 2 · conf · DG_EN)', tx('dst-cmp-this') === '這一筆：第 2 輪 · 確認結果 · DG_EN ON', tx('dst-cmp-this'));
    else if (zh) __ok('M1 this line (round 1 · main · DG_EN)', tx('dst-cmp-this') === '這一筆：第 1 輪 · 主量測 · DG_EN ON', tx('dst-cmp-this'));
    if (zh && C !== 'C') __ok('M1 asking state first', tx('dst-cmp-count').indexOf('查詢') >= 0, tx('dst-cmp-count'));
    var box = modal.querySelector('.dst-modal-box');
    __ok('M1 quiet style: neutral border, box ≤ 440px', getComputedStyle(box).borderTopColor === 'rgb(51, 65, 85)' && box.getBoundingClientRect().width <= 440,
      getComputedStyle(box).borderTopColor + ' w=' + Math.round(box.getBoundingClientRect().width));
    __ok('M1 OK button not solid blue (single-primary rule)', getComputedStyle(document.getElementById('dst-cmp-ok')).backgroundColor !== __BLUE);
    await __wait(150);

    if (C === 'C') {
      await __wait(1500);
      __ok('M-C unknown count text', tx('dst-cmp-count') === '無法取得目前的筆數，按「確定」仍會送出。', tx('dst-cmp-count'));
      __ok('M-C list hidden', __cls('dst-cmp-list', 'dst-hidden'));
      document.getElementById('dst-cmp-ok').click();
      var add = sent.filter(function (m) { return m.type === 'dg-cmp-add'; });
      __ok('M-C OK still sends', add.length === 1 && add[0].rows && add[0].rows.length === R.rows.length && add[0].job === 'main', add.length);
      __ok('M-C sending state', tx('dst-cmp-ok') === '送出中…' && __dis('dst-cmp-ok'));
      await __wait(2200);
      __ok('M-C no reply reported honestly', tx('dst-cmp-res').indexOf('沒有收到 DG 的回覆') >= 0 && __cls('dst-cmp-res', 'err'), tx('dst-cmp-res'));
      __ok('M-C close button', tx('dst-cmp-ok') === '關閉');
      document.getElementById('dst-cmp-ok').click();
      __ok('M-C closed', !open());
      __ok('M-C row says not added', tx('dst-cmp-state') === '這一輪還沒加入「光學資料比較」。', tx('dst-cmp-state'));
      __done(); return;
    }

    if (C === 'EN') {
      __ok('M-EN title', tx('dst-cmp-title') === 'Add to "Optical data comparison"?', tx('dst-cmp-title'));
      __ok('M-EN this', tx('dst-cmp-this') === 'This set: Round 1 · Main measurement · DG_EN ON', tx('dst-cmp-this'));
      __ok('M-EN count', tx('dst-cmp-count') === '"Optical data comparison" has 2 set(s) now (max 10).', tx('dst-cmp-count'));
      __ok('M-EN buttons', tx('dst-cmp-ok') === 'OK' && tx('dst-cmp-cancel') === 'Cancel');
      __ok('M-EN list summary', tx('dst-cmp-list-sum') === 'Show the other 2');
      document.getElementById('dst-cmp-ok').click(); await __wait(150);
      __ok('M-EN added', tx('dst-cmp-res') === 'Added. 3 set(s) now.', tx('dst-cmp-res'));
      document.getElementById('dst-cmp-ok').click();
      __ok('M-EN re-add button', tx('dst-cmp-open') === 'Add to optical comparison…', tx('dst-cmp-open'));
      __done(); return;
    }
    if (C === 'CN') {
      __ok('M-CN title', tx('dst-cmp-title') === '加入“光学数据比较”？', tx('dst-cmp-title'));
      __ok('M-CN this', tx('dst-cmp-this') === '这一笔：第 1 轮 · 主测量 · DG_EN ON', tx('dst-cmp-this'));
      __ok('M-CN count', tx('dst-cmp-count') === '“光学数据比较”目前已有 2 笔（上限 10）。', tx('dst-cmp-count'));
      __ok('M-CN buttons', tx('dst-cmp-ok') === '确定' && tx('dst-cmp-cancel') === '取消');
      __done(); return;
    }

    __ok('M2 count from DG', tx('dst-cmp-count') === '「光學資料比較」目前已有 ' + dg.count + ' 筆（上限 10）。', tx('dst-cmp-count'));
    var ol = document.getElementById('dst-cmp-list-ol');
    __ok('M2 list folded, has names + time', !document.getElementById('dst-cmp-list').open && ol.children.length === dg.count
      && ol.children[0].textContent.indexOf('組1 · ') === 0 && ol.children[1].textContent === '組2 · —', ol.children.length + ' ' + (ol.children[1] || {}).textContent);
    __ok('M2 list summary', tx('dst-cmp-list-sum') === '看其他 ' + dg.count + ' 筆', tx('dst-cmp-list-sum'));
    var nm = document.getElementById('dst-cmp-name');

    if (C === 'FULL') {
      __ok('M-FULL warn', tx('dst-cmp-warn') === '已滿 10 筆，按「確定」也加不進去；請先到 DG 的「光學資料比較」刪掉一筆。', tx('dst-cmp-warn'));
      __ok('M-FULL name prefilled', nm.value === '第二輪確認', nm.value);
      document.getElementById('dst-cmp-ok').click(); await __wait(150);
      var a2 = sent.filter(function (m) { return m.type === 'dg-cmp-add'; });
      __ok('M-FULL add sent with job conf', a2.length === 1 && a2[0].job === 'conf');
      __ok('M-FULL shows DG reason', tx('dst-cmp-res') === '沒有加入：光學量測組已滿 10 組，沒有加入。' && __cls('dst-cmp-res', 'err'), tx('dst-cmp-res'));
      document.getElementById('dst-cmp-ok').click();
      __ok('M-FULL row says not added', tx('dst-cmp-state') === '這一輪還沒加入「光學資料比較」。');
      __done(); return;
    }
    if (C === 'SAME') {
      __ok('M-SAME warn', tx('dst-cmp-warn') === '這一份與第 1 筆（組1）逐值相同，按「確定」只會更新名稱。', tx('dst-cmp-warn'));
      nm.value = '改過的名字'; nm.dispatchEvent(new Event('input'));
      document.getElementById('dst-cmp-ok').click(); await __wait(150);
      var a3 = sent.filter(function (m) { return m.type === 'dg-cmp-add'; })[0] || {};
      __ok('M-SAME sends edited name', a3.name === '改過的名字' && a3.edited === true);
      __ok('M-SAME updated text', tx('dst-cmp-res') === '已更新第 1 筆（改過的名字），目前共 2 筆。', tx('dst-cmp-res'));
      __done(); return;
    }

    __ok('M2 name prefilled with DG default', nm.value === '第一輪', nm.value);
    __ok('M2 cancel visible', !__cls('dst-cmp-cancel', 'dst-hidden') && tx('dst-cmp-cancel') === '取消');

    if (C === 'B') {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      __ok('M-B Esc closes', !open());
      __ok('M-B nothing added', !sent.some(function (m) { return m.type === 'dg-cmp-add'; }));
      __ok('M-B result still on page', !__cls('dst-res-wrap', 'dst-hidden') && document.getElementById('dst-res').children.length > 0);
      __ok('M-B re-add row shown', !__cls('dst-cmp-row', 'dst-hidden') && tx('dst-cmp-open') === '加入光學資料比較…'
        && tx('dst-cmp-state') === '這一輪還沒加入「光學資料比較」。', tx('dst-cmp-state'));
      var nq = sent.filter(function (m) { return m.type === 'dg-cmp-query'; }).length;
      document.getElementById('dst-cmp-open').click();
      __ok('M-B reopen asks DG again', open() && sent.filter(function (m) { return m.type === 'dg-cmp-query'; }).length === nq + 1);
      await __wait(150);
      nm.value = '  我的第一輪 '; nm.dispatchEvent(new Event('input'));
      nm.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await __wait(150);
      var a1 = sent.filter(function (m) { return m.type === 'dg-cmp-add'; });
      __ok('M-B Enter sends edited name (trimmed)', a1.length === 1 && a1[0].name === '我的第一輪' && a1[0].edited === true, a1[0] && a1[0].name);
      __ok('M-B added', tx('dst-cmp-res') === '已加入，目前共 3 筆。', tx('dst-cmp-res'));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      __ok('M-B row says added', tx('dst-cmp-state') === '已加入第 3 筆（我的第一輪）。', tx('dst-cmp-state'));
      __done(); return;
    }

    // A
    document.getElementById('dst-cmp-ok').click();
    await __wait(150);
    var add = sent.filter(function (m) { return m.type === 'dg-cmp-add'; });
    __ok('M3 one add, default name not marked edited', add.length === 1 && add[0].name === '第一輪' && add[0].edited === false);
    __ok('M3 add carries the round data (fallback for a reloaded DG)', add[0] && add[0].rows.length === R.rows.length && add[0].task === R.task
      && add[0].kind === 'tcon' && add[0].job === 'main');
    __ok('M3 added text', tx('dst-cmp-res') === '已加入，目前共 3 筆。' && !__cls('dst-cmp-res', 'err'), tx('dst-cmp-res'));
    __ok('M3 OK becomes Close, cancel hidden', tx('dst-cmp-ok') === '關閉' && __cls('dst-cmp-cancel', 'dst-hidden'));
    __ok('M3 focus stays on the button', document.activeElement && document.activeElement.id === 'dst-cmp-ok');
    document.getElementById('dst-cmp-ok').click();
    __ok('M3 closed', !open());
    __ok('M3 row says added', tx('dst-cmp-state') === '已加入第 3 筆（第一輪）。', tx('dst-cmp-state'));
    __ok('M3 CTA (sent back to DG) still there', document.getElementById('dst-back-warn').classList.contains('dst-back-cta'));
    __checkVersion('M-A');
  } catch (e) { window.__errs.push('scenario: ' + (e && e.stack || e)); }
  __done();
})();
