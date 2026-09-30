/* DGV：dg v2.3.0「光學資料比較」唯讀檢視（dg.html?view=cmp）。注入在 dg.html 的 IIFE 裡，同一個分頁跑兩段：
   ① 一般 DG（沒有 view 參數）：量測頁按「確定」加入（真的 MessageEvent 進產品處理器）⇒ 回覆帶 stored:true、
      自動保存**立刻**寫進 localStorage（不等 800 ms debounce）⇒ 導到同一個檔 ?view=cmp。
   ② 唯讀檢視：只剩比較分頁、改資料的鈕藏起來、讀到存檔那一組；另一個分頁寫入（改 localStorage ＋ storage 事件，
      等同瀏覽器對其他分頁發的那一則）⇒ 自動變 2 組；讀不到存檔 ⇒ 提示切回 DG；檢視頁本身一個位元組都不寫、
      不收任何 postMessage。 */
(async function () {
  try {
    var KEY = 'tcon-dg-autosave';
    function rows(k) { var a = []; for (var g = 0; g < 256; g++) a.push([g, 0.3127, 0.329, Math.pow(g / 255, 2.2) * 200 * k + 0.1]); return a; }
    var prim = [['r', 0.64, 0.33, 40], ['g', 0.30, 0.60, 130], ['b', 0.15, 0.06, 15]];
    function send(d) { window.dispatchEvent(new MessageEvent('message', { data: d, origin: window.location.origin, source: window })); }
    var isView = /[?&]view=cmp\b/.test(location.search);
    await __wait(1500);
    if (/[?&]role=writer\b/.test(location.search)) {
      /* ③ 另一份真的 DG（iframe，同一個 localStorage）：讀回存檔的 2 組，量測頁按確定加第 3 組 ⇒ 寫存檔。
         檢視頁收到的是瀏覽器真的發的 storage 事件。 */
      window.postMessage = function () {};
      send({ type: 'dg-cmp-add', task: 41, name: '第三輪 C', edited: true, rows: rows(0.8), prim: prim, at: 't3', kind: 'pc', job: 'main' });
      return;
    }
    if (!isView) {
      var rep = [];
      window.postMessage = function (m) { rep.push(m); };
      __ok('P1 normal DG (not the view)', window.dgApi.viewMode() === false && !document.documentElement.hasAttribute('data-dg-view'));
      __ok('P1 view bar hidden on normal DG', !__vis('dg-view-bar'));
      DG_ROUND = 2;
      send({ type: 'dg-cmp-add', task: 31, name: '第一輪 A', edited: true, rows: rows(1), prim: prim, at: 't1', kind: 'tcon', job: 'main' });
      var r = rep.filter(function (m) { return m.type === 'dg-cmp-added'; })[0] || {};
      var raw = localStorage.getItem(KEY), w = raw ? JSON.parse(raw) : null;
      __ok('P1 added + reply says stored', r.ok === true && r.stored === true && DG_SLOTS.length === 1, JSON.stringify({ ok: r.ok, stored: r.stored }));
      __ok('P1 autosave written right away (no 800 ms wait)', !!(w && w.shared && w.shared.slots.length === 1), raw ? raw.length : 'none');
      sessionStorage.setItem('__dgv_raw1', raw || '');
      sessionStorage.setItem('__dgv_res1', JSON.stringify(__res));
      location.href = location.href.split('?')[0].split('#')[0] + '?view=cmp';
      return;   // 第二段在新載入的頁面裡回報
    }
    var raw1 = sessionStorage.getItem('__dgv_raw1') || '';
    try { JSON.parse(sessionStorage.getItem('__dgv_res1') || '[]').forEach(function (x) { __res.push(x); }); } catch (e) {}
    var H = document.documentElement;
    function shown(id) { var e = document.getElementById(id); return !!(e && e.offsetParent !== null); }
    __ok('V1 view mode on', window.dgApi.viewMode() === true && H.getAttribute('data-dg-view') === 'cmp');
    __ok('V1 only the comparison tab is visible', shown('dg-cmp-content') && !shown('dg-main-content') && !shown('dg-conv-content') && !shown('dg-mode-tabs'),
      [shown('dg-cmp-content'), shown('dg-main-content'), shown('dg-conv-content'), shown('dg-mode-tabs')].join(','));
    __ok('V1 read the saved set (1)', window.dgApi.viewCount() === 1 && DG_SLOTS.length === 1
      && document.querySelectorAll('#dg-slot-list .dg-slot-row').length === 1, window.dgApi.viewCount());
    __ok('V1 banner says read-only + count', __vis('dg-view-bar') && __txt('dg-view-bar').indexOf('唯讀檢視') >= 0 && __txt('dg-view-bar').indexOf('共 1 組') >= 0, __txt('dg-view-bar'));
    __ok('V1 edit buttons hidden (import／clear／delete)', !shown('dg-btn-slot-new') && !shown('dg-btn-slot-clear')
      && !Array.prototype.some.call(document.querySelectorAll('.dg-slot-del'), function (e) { return e.offsetParent !== null; }));
    __ok('V1 export still available', shown('dg-btn-slot-xlsx'));
    __ok('V1 no restore banner / round bar', !shown('dg-auto-bar') && !shown('dg-round-bar'));
    __ok('V1 autosave OFF in the view', window.dgApi.asEnabled() === false);
    // 另一個分頁（原 DG）加入第 2 組 ⇒ localStorage 變了、瀏覽器對這個分頁發 storage 事件
    var w = JSON.parse(localStorage.getItem(KEY));
    var s2 = JSON.parse(JSON.stringify(w.shared.slots[0]));
    s2.rows = s2.rows.map(function (x) { var y = x.slice ? x.slice() : JSON.parse(JSON.stringify(x)); return y; });
    s2.name = '第二輪 B';
    w.shared.slots.push(s2); w._ts = Date.now();
    var raw2 = JSON.stringify(w);
    localStorage.setItem(KEY, raw2);
    window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: raw2, storageArea: localStorage }));
    await __wait(400);
    __ok('V2 live update: now 2 sets', window.dgApi.viewCount() === 2 && document.querySelectorAll('#dg-slot-list .dg-slot-row').length === 2
      && __txt('dg-view-bar').indexOf('共 2 組') >= 0, window.dgApi.viewCount() + ' | ' + __txt('dg-view-bar'));
    // 檢視頁不寫存檔：勾掉「顯示」（會走 change 與 dgRenderCharts 的保存掛點）、等過 debounce
    var cb = document.querySelector('#dg-slot-list input[type=checkbox]');
    if (cb) { cb.click(); }
    await __wait(1200);
    __ok('V3 the view never writes the autosave', localStorage.getItem(KEY) === raw2);
    // 量測頁的訊息送到這裡 ⇒ 一律不理（不會變成第二個 DG）
    var got = [];
    window.postMessage = function (m) { got.push(m); };
    send({ type: 'dg-cmp-add', task: 99, name: 'X', edited: true, rows: rows(0.5), prim: prim, at: 'x', kind: 'pc', job: 'main' });
    send({ type: 'dg-cmp-query', task: 99 });
    await __wait(100);
    __ok('V3 messages ignored (no reply, no new set)', got.length === 0 && DG_SLOTS.length === 2, got.length + ' / ' + DG_SLOTS.length);
    // 讀不到存檔 ⇒ 提示切回 DG
    localStorage.removeItem(KEY);
    window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: null, storageArea: localStorage }));
    await __wait(400);
    __ok('V4 no autosave ⇒ switch-back hint', window.dgApi.viewCount() === -1 && __txt('dg-view-bar').indexOf('請切回 DG 分頁，點「光學資料比較」查看') >= 0
      && document.getElementById('dg-view-bar').classList.contains('err'), __txt('dg-view-bar'));
    localStorage.setItem(KEY, raw2);
    window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: raw2, storageArea: localStorage }));
    await __wait(400);
    __ok('V4 comes back when DG writes again', window.dgApi.viewCount() === 2 && !document.getElementById('dg-view-bar').classList.contains('err'));
    __ok('V0 first phase stored exactly what the view read', raw1.length > 0);
    // ③ 真的跨文件：iframe 裡的一般 DG 加第 3 組 ⇒ 瀏覽器發 storage 事件 ⇒ 這裡自動變 3 組
    var fr = document.createElement('iframe');
    fr.style.cssText = 'position:fixed;left:-3000px;top:0;width:900px;height:600px';
    fr.src = location.href.split('?')[0].split('#')[0] + '?role=writer';
    document.body.appendChild(fr);
    var t0 = Date.now();
    while (Date.now() - t0 < 15000 && window.dgApi.viewCount() !== 3) await __wait(200);
    __ok('V5 real storage event from another DG document ⇒ 3 sets', window.dgApi.viewCount() === 3
      && document.querySelectorAll('#dg-slot-list .dg-slot-row').length === 3, window.dgApi.viewCount() + ' after ' + (Date.now() - t0) + 'ms');
    fr.remove();
    /* ⑥ dg v2.3.1：storage 事件漏掉（分頁被凍結）⇒ 切回這個分頁時自己再對一次存檔。
       同一文件 setItem 不會對自己發 storage 事件 ⇒ 正好模擬「沒收到」。存檔沒變時不重畫（勾選不被重設）。 */
    var cb6 = document.querySelector('#dg-slot-list input[type=checkbox]');
    var cb6was = cb6 ? cb6.checked : null;
    if (cb6) cb6.click();
    document.dispatchEvent(new Event('visibilitychange'));
    await __wait(200);
    var cb6b = document.querySelector('#dg-slot-list input[type=checkbox]');
    __ok('V6 back to front, autosave unchanged ⇒ no re-render (local 顯示 toggle kept)', !!cb6b && cb6b.checked === !cb6was, [cb6was, cb6b && cb6b.checked]);
    var w6 = JSON.parse(localStorage.getItem(KEY));
    var s6 = JSON.parse(JSON.stringify(w6.shared.slots[0])); s6.name = '第四輪 D';
    w6.shared.slots.push(s6); w6._ts = Date.now();
    localStorage.setItem(KEY, JSON.stringify(w6));
    await __wait(300);
    __ok('V6 missed storage event ⇒ still 3 until the tab comes back', window.dgApi.viewCount() === 3, window.dgApi.viewCount());
    document.dispatchEvent(new Event('visibilitychange'));
    await __wait(300);
    __ok('V6 tab comes back to front ⇒ re-reads ⇒ 4 sets', window.dgApi.viewCount() === 4
      && document.querySelectorAll('#dg-slot-list .dg-slot-row').length === 4, window.dgApi.viewCount());
    __ok('DGV version = common/version.js dg (' + window.__expectDgVer + ')', TOOL_VERSIONS.dg === window.__expectDgVer, TOOL_VERSIONS.dg);
  } catch (e) { window.__errs.push('scenario: ' + (e && e.stack || e)); }
  __done();
})();
