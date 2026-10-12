/* ═══════════════════════════════════════════════════════════════════════════
   common/i2c-bridge.js — 所有用 I2C Bridge 的頁面共用：連線位址、下載連結、
   「沒有 I2C Bridge」提示、連線狀態徽章（單一來源）。

   由來（Bruce 2026-10-12）：「為什麼這一頁如果沒有 I2C bridge 的話，沒有像其他要使用到
   I2C 的做法一樣，可以去下載這個 I2C bridge 的壓縮包？」
   根因：下載包的資料（HELPER_PKG，common/version.js）早就是單一來源，但「怎麼提示、
   連結怎麼組、狀態怎麼顯示」每一頁各寫一套 —— i2c.html（i2ctNeedHelper／i2ctFillHelperCard）、
   dg-selftest.html（dstRenderDl）、dg.html（選擇畫面下載列）各自組 href；datamap.html v1.0.0
   只照抄了 WebSocket 協定，連不上時只跳一則「連不上 I2C Bridge」toast，沒有下載入口。
   另外 dg／dg-selftest 被 I2C Bridge 端出來（127.0.0.1）時用相對路徑，那裡沒有 data/ ⇒ 會 404；
   i2c.html 有改指線上網址。統一後一律走 dlHref()。

   API（window.I2CBridge）：
     PORT, WS_URL, ONLINE_BASE
     isLocal(host)            本頁是不是 I2C Bridge 端出來的（127.0.0.1／localhost）
     pkg()                    HELPER_PKG（讀不到回 {}）
     dlHref()                 下載網址（含 ?v= 包版號）；HELPER_PKG 讀不到回 ''（不留會 404 的連結）
     fillDl(a, verEl)         把 <a> 設成下載連結；回傳是否可下載（不可下載時 a 加 hidden 屬性）
     mountNeed(el, why)       在 el 內畫標準「沒有 I2C Bridge」提示（原因＋下載鈕＋安裝步驟＋說明頁）
     unmountNeed(el)          收起提示
     badge(el, state)         連線狀態徽章：'on' 綠／'busy' 黃／'off' 灰／'none'、'drop' 紅
     text(key, vars)          本模組三語字串（zh-TW／en／zh-CN，依 <html lang>）
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var PORT = 8899;
  var ONLINE_BASE = 'https://brucecheng0428.github.io/tcon-tools/';
  var T = {
    on:     ['I2C 已連線', 'I2C connected', 'I2C 已连接'],
    off:    ['I2C 未連線', 'I2C not connected', 'I2C 未连接'],
    busy:   ['I2C 連線中…', 'I2C connecting…', 'I2C 连接中…'],
    none:   ['找不到 I2C Bridge', 'I2C Bridge not found', '找不到 I2C Bridge'],
    drop:   ['I2C 已斷線', 'I2C disconnected', 'I2C 已断线'],
    needT:  ['連不上 I2C Bridge：這台電腦可能還沒有執行 I2C Bridge', 'Cannot reach the I2C Bridge: it may not be running on this computer', '连不上 I2C Bridge：这台电脑可能还没有执行 I2C Bridge'],
    dropT:  ['I2C Bridge 已關閉或斷線', 'The I2C Bridge closed or dropped', 'I2C Bridge 已关闭或断线'],
    dl:     ['⬇ 下載 I2C Bridge {ver}', '⬇ Download I2C Bridge {ver}', '⬇ 下载 I2C Bridge {ver}'],
    dlMiss: ['（下載包資訊讀不到，請到「I2C 讀寫測試」頁下載）', '(Package info unavailable; download it from the I2C page)', '（下载包信息读不到，请到「I2C 读写测试」页下载）'],
    steps:  ['下載 → 全部解壓到同一個資料夾 → 雙擊 i2c-bridge.exe → 回這頁按「連線」', 'Download → unzip everything into one folder → double-click i2c-bridge.exe → come back and press Connect', '下载 → 全部解压到同一个文件夹 → 双击 i2c-bridge.exe → 回这页按「连接」'],
    more:   ['詳細說明與疑難排解：I2C 讀寫測試頁', 'Details and troubleshooting: the I2C page', '详细说明与疑难排解：I2C 读写测试页'],
    small:  ['沒有 I2C Bridge？下載 {ver}', 'No I2C Bridge? Download {ver}', '没有 I2C Bridge？下载 {ver}']
  };
  function langIdx() {
    var l = (root.document && root.document.documentElement && root.document.documentElement.lang) || 'zh-TW';
    return l === 'en' ? 1 : (l === 'zh-CN' ? 2 : 0);
  }
  function text(k, v) {
    var a = T[k]; if (!a) return k;
    var s = a[langIdx()] || a[0];
    if (v) Object.keys(v).forEach(function (n) { s = s.split('{' + n + '}').join(v[n]); });
    return s.replace(/\s*\{ver\}/g, '');
  }
  function isLocal(host) { return host === '127.0.0.1' || host === 'localhost' || host === '[::1]' || host === '::1'; }
  function pkg() { return (typeof root.HELPER_PKG !== 'undefined' && root.HELPER_PKG) ? root.HELPER_PKG : {}; }
  function dlHref() {
    var p = pkg(); if (!p.file) return '';
    var host = root.location ? root.location.hostname : '';
    return (isLocal(host) ? ONLINE_BASE : '') + p.file + '?v=' + (p.pkg || '');
  }
  function fillDl(a, verEl) {
    if (!a) return false;
    var h = dlHref();
    if (!h) { a.removeAttribute('href'); a.setAttribute('hidden', ''); if (verEl) verEl.textContent = ''; return false; }
    a.setAttribute('href', h); a.setAttribute('download', ''); a.removeAttribute('hidden');
    a.setAttribute('data-i2cb-dl', pkg().pkg || '');
    if (verEl) verEl.textContent = pkg().pkg || '';
    return true;
  }
  var CSS = '.i2cb-badge{display:inline-flex;align-items:center;gap:6px;padding:2px 10px;border-radius:999px;font-size:12.5px;font-weight:700;line-height:1.6;white-space:nowrap;border:1px solid transparent}' +
    '.i2cb-badge::before{content:"";width:9px;height:9px;border-radius:50%;background:currentColor;flex:none}' +
    '.i2cb-badge.i2cb-on{background:rgba(34,197,94,.18);color:#22c55e;border-color:rgba(34,197,94,.6);box-shadow:0 0 0 1px rgba(34,197,94,.25),0 0 10px rgba(34,197,94,.35)}' +
    '.i2cb-badge.i2cb-on::before{box-shadow:0 0 6px #22c55e}' +
    '.i2cb-badge.i2cb-busy{background:rgba(245,158,11,.15);color:#f59e0b;border-color:rgba(245,158,11,.5)}' +
    '.i2cb-badge.i2cb-off{background:rgba(148,163,184,.12);color:#94a3b8;border-color:rgba(148,163,184,.35)}' +
    '.i2cb-badge.i2cb-none,.i2cb-badge.i2cb-drop{background:rgba(239,68,68,.14);color:#f87171;border-color:rgba(239,68,68,.5)}' +
    '.i2cb-need{margin:10px 0;padding:12px 14px;border:1px solid rgba(239,68,68,.55);border-radius:10px;background:rgba(239,68,68,.08)}' +
    '.i2cb-need-t{font-weight:700;color:#f87171;margin-bottom:8px}' +
    '.i2cb-need-dl{display:inline-block;padding:9px 16px;border-radius:8px;background:#2563eb;color:#fff !important;font-weight:700;text-decoration:none;min-height:24px}' +
    '.i2cb-need-dl:hover{filter:brightness(1.12)}' +
    '.i2cb-need-s{margin-top:8px;font-size:13px;opacity:.85;line-height:1.6}' +
    '.i2cb-need-s a{color:inherit}' +
    '.i2cb-small{font-size:12.5px;margin-left:8px;white-space:nowrap}';
  function css() {
    var d = root.document; if (!d || d.getElementById('i2cb-css')) return;
    var s = d.createElement('style'); s.id = 'i2cb-css'; s.textContent = CSS;
    (d.head || d.documentElement).appendChild(s);
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function mountNeed(el, why) {
    if (!el) return; css();
    var p = pkg(), h = dlHref();
    el.className = (el.className.replace(/\bi2cb-need\b/g, '').trim() + ' i2cb-need').trim();
    el.removeAttribute('hidden'); el.setAttribute('role', 'alert'); el.setAttribute('data-i2cb-need', why || 'none');
    el.innerHTML = '<div class="i2cb-need-t">' + esc(text(why === 'drop' ? 'dropT' : 'needT')) + '</div>' +
      (h ? '<a class="i2cb-need-dl" data-i2cb-dl="' + esc(p.pkg || '') + '" href="' + esc(h) + '" download>' + esc(text('dl', { ver: p.pkg || '' })) + '</a>'
         : '<div class="i2cb-need-s">' + esc(text('dlMiss')) + '</div>') +
      '<div class="i2cb-need-s">' + esc(text('steps')) + '<br><a href="i2c.html" target="_blank" rel="noopener">' + esc(text('more')) + '</a></div>';
  }
  function unmountNeed(el) { if (!el) return; el.setAttribute('hidden', ''); el.innerHTML = ''; el.removeAttribute('data-i2cb-need'); }
  var STATES = ['on', 'off', 'busy', 'none', 'drop'];
  function badge(el, state, label) {
    if (!el) return; css();
    if (STATES.indexOf(state) < 0) state = 'off';
    STATES.forEach(function (s) { el.classList.remove('i2cb-' + s); });
    el.classList.add('i2cb-badge'); el.classList.add('i2cb-' + state);
    el.setAttribute('data-i2c', state);
    el.textContent = label || text(state);
  }
  root.I2CBridge = {
    PORT: PORT, WS_URL: 'ws://127.0.0.1:' + PORT + '/ws', ONLINE_BASE: ONLINE_BASE,
    isLocal: isLocal, pkg: pkg, dlHref: dlHref, fillDl: fillDl,
    mountNeed: mountNeed, unmountNeed: unmountNeed, badge: badge, text: text, css: css
  };
})(typeof window !== 'undefined' ? window : this);
