/* V：dgself v2.5.0「加入光學資料比較」視窗的「查看光學資料比較 ↗」（window.__viewCase 由 runner 指定）。
   假 DG 同 M 情境（換掉 opener.postMessage，回覆直接呼叫 dstCmpOnInfo／dstCmpOnAdded）；
   window.open 換成假的，記下網址／視窗名，回傳假視窗或 null（模擬被擋）。
   OPEN   ＝確定前沒有這顆；加入後出現、線框（確定／關閉仍是唯一實心）；點 ⇒ 開 dg.html?view=cmp、固定視窗名、保留 opener（v2.5.1）
   BLK    ＝window.open 回 null ⇒ 「請切回 DG 分頁…」提示（實心、↗），「關閉」讓位成線框；重開視窗提示消失
   NOSTORE＝DG 回 stored:false（存檔沒寫成）⇒ 不開新分頁，直接顯示提示
   EN     ＝英文字面 */
(async function () {
  try {
    var C = window.__viewCase || 'OPEN';
    await __wait(800);
    if (C === 'EN') applyLang('en');
    var dg = { count: 2 };
    function list(n) { var a = []; for (var i = 0; i < n; i++) a.push({ no: i + 1, name: '組' + (i + 1), t: Date.now() - 60000 * (n - i) }); return a; }
    window.opener.postMessage = function (m) {
      if (m.type === 'dg-cmp-query') setTimeout(function () {
        dstCmpOnInfo({ type: 'dg-cmp-info', task: m.task, count: dg.count, max: 10, list: list(dg.count),
          round: 1, job: 'main', name: '第一輪', same: null, full: false });
      }, 40);
      if (m.type === 'dg-cmp-add') setTimeout(function () {
        dg.count++; var la = list(dg.count); la[dg.count - 1].name = m.name;
        dstCmpOnAdded({ type: 'dg-cmp-added', task: m.task, ok: true, updated: false, no: dg.count, name: m.name,
          count: dg.count, max: 10, list: la, stored: (C !== 'NOSTORE') });
      }, 40);
    };
    var opens = [], fakeWin = { opener: window, focused: 0, focus: function () { this.focused++; } };
    window.open = function (u, n) { opens.push({ url: u, name: n }); return (C === 'BLK') ? null : fakeWin; };
    function vis(id) { var e = document.getElementById(id); return !!(e && e.offsetParent !== null && !e.classList.contains('dst-hidden')); }
    function solid() {
      return Array.prototype.filter.call(document.querySelectorAll('button, .dst-back-cta, .dst-cmp-go'), function (el) {
        return el.offsetParent !== null && getComputedStyle(el).backgroundColor === __BLUE; }).map(function (el) { return el.id || el.className; });
    }
    await __arm();
    await dstRun();
    await __wait(150);
    __ok('V0 popup open after the run', document.getElementById('dst-modal-cmp').classList.contains('open'));
    __ok('V0 view button hidden before OK (not in the comparison yet)', !vis('dst-cmp-view'));
    document.getElementById('dst-cmp-ok').click();
    await __wait(150);
    __ok('V1 added', dstCmpPhase === 'done' && dstCmpSaved && dstCmpSaved.no === 3, JSON.stringify(dstCmpSaved));
    __ok('V1 view button shown after OK', vis('dst-cmp-view'));
    var vb = document.getElementById('dst-cmp-view');
    if (C === 'EN') __ok('V1 EN label', vb.textContent === 'View optical comparison ↗', vb.textContent);
    else __ok('V1 label', vb.textContent === '查看光學資料比較 ↗', vb.textContent);
    __ok('V1 view button is outline (not solid)', getComputedStyle(vb).backgroundColor !== __BLUE, getComputedStyle(vb).backgroundColor);
    var s1 = solid();
    __ok('V1 only Close/OK is solid blue', s1.length === 1 && s1[0] === 'dst-cmp-ok', s1.join(','));
    __ok('V1 view button sits left of Close', vb.getBoundingClientRect().left < document.getElementById('dst-cmp-ok').getBoundingClientRect().left);
    vb.click();
    await __wait(50);
    var go = document.getElementById('dst-cmp-go');
    if (C === 'OPEN' || C === 'EN') {
      __ok('V2 window.open called once', opens.length === 1, JSON.stringify(opens));
      __ok('V2 url = dg.html?view=cmp', opens[0] && opens[0].url === 'dg.html?view=cmp');
      __ok('V2 fixed window name (reuse the same tab)', opens[0] && opens[0].name === 'tcon-dg-cmpview');
      __ok('V2 opener kept (Safari named-tab reuse) + focused', fakeWin.opener === window && fakeWin.focused === 1);
      __ok('V2 no fallback hint', !vis('dst-cmp-go'));
      __ok('V2 popup stays open (Close still there)', document.getElementById('dst-modal-cmp').classList.contains('open') && solid().join(',') === 'dst-cmp-ok');
      vb.click(); await __wait(30);
      __ok('V2 second click reuses the same name', opens.length === 2 && opens[1].name === 'tcon-dg-cmpview');
    } else {
      if (C === 'BLK') __ok('V3 tried window.open', opens.length === 1);
      else __ok('V3 stored:false ⇒ did not open a tab', opens.length === 0, opens.length);
      __ok('V3 hint shown', vis('dst-cmp-go'));
      __ok('V3 hint text', __txt('dst-cmp-go-txt') === '請切回 DG 分頁，點「光學資料比較」查看', __txt('dst-cmp-go-txt'));
      __ok('V3 hint looks like "sent back to DG" (solid primary, ↗, 18px bold)', getComputedStyle(go).backgroundColor === __BLUE
        && go.querySelector('.dst-cta-ico').textContent === '↗' && getComputedStyle(go).fontSize === '18px' && getComputedStyle(go).fontWeight === '700',
        getComputedStyle(go).backgroundColor + ' ' + getComputedStyle(go).fontSize);
      var s3 = solid();
      __ok('V3 hint is the only solid; Close yields to outline', s3.length === 1 && s3[0] === 'dst-cmp-go', s3.join(','));
      if (C === 'BLK') {
        // 關掉再從 ④ 底下重開 ⇒ 提示不殘留
        document.getElementById('dst-cmp-ok').click(); await __wait(30);
        document.getElementById('dst-cmp-open').click(); await __wait(150);
        __ok('V3 reopen: hint cleared, view button still there (already added)', !vis('dst-cmp-go') && vis('dst-cmp-view'));
        document.getElementById('dst-cmp-ok').click(); await __wait(150);   // 再按確定（假 DG 加第 4 筆）
        vb.click(); await __wait(30);   // 截圖停在「已加入 ⇒ 提示」的狀態
        __ok('V3 hint again after OK; Close yields', vis('dst-cmp-go') && dstCmpPhase === 'done' && solid().join(',') === 'dst-cmp-go', solid().join(','));
      }
    }
    __checkVersion('V-' + C);
  } catch (e) { window.__errs.push('scenario: ' + (e && e.stack || e)); }
  __done();
})();
