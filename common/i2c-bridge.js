/* ═══════════════════════════════════════════════════════════════════════════
   common/i2c-bridge.js — 所有用 I2C and AUX Bridge 的頁面共用：連線位址、下載連結、
   「沒有 I2C and AUX Bridge」提示、連線狀態徽章（單一來源）。

   由來（Bruce 2026-10-12）：「為什麼這一頁如果沒有 I2C and AUX Bridge 的話，沒有像其他要使用到
   I2C 的做法一樣，可以去下載這個 I2C and AUX Bridge 的壓縮包？」
   根因：下載包的資料（HELPER_PKG，common/version.js）早就是單一來源，但「怎麼提示、
   連結怎麼組、狀態怎麼顯示」每一頁各寫一套 —— i2c.html（i2ctNeedHelper／i2ctFillHelperCard）、
   dg-selftest.html（dstRenderDl）、dg.html（選擇畫面下載列）各自組 href；datamap.html v1.0.0
   只照抄了 WebSocket 協定，連不上時只跳一則「連不上 I2C and AUX Bridge」toast，沒有下載入口。
   另外 dg／dg-selftest 被 I2C and AUX Bridge 端出來（127.0.0.1）時用相對路徑，那裡沒有 data/ ⇒ 會 404；
   i2c.html 有改指線上網址。統一後一律走 dlHref()。

   API（window.I2CBridge）：
     PORT, WS_URL, ONLINE_BASE
     isLocal(host)            本頁是不是 I2C and AUX Bridge 端出來的（127.0.0.1／localhost）
     pkg()                    HELPER_PKG（讀不到回 {}）
     dlHref()                 下載網址（含 ?v= 包版號）；HELPER_PKG 讀不到回 ''（不留會 404 的連結）
     fillDl(a, verEl)         把 <a> 設成下載連結；回傳是否可下載（不可下載時 a 加 hidden 屬性）
     mountNeed(el, why)       在 el 內畫標準「沒有 I2C and AUX Bridge」提示（下一步＋下載鈕＋原因＋三步驟＋同一支程式＋疑難排解，
                             文字＝i2c.html 的 i18n 鍵；按下載會跳與 i2c.html 相同的說明視窗）
    showHowto()／wireHowto(a) 跳出「下載好了，接著這樣做」說明視窗／讓某個下載連結按下時跳出它
     unmountNeed(el)          收起提示
     badge(el, state)         連線狀態徽章：'on' 綠／'busy' 黃／'off' 灰／'none'、'drop' 紅
     text(key, vars)          本模組三語字串（zh-TW／en／zh-CN，依 <html lang>）
     check(pong)              v1.2.0：比 ping 回的 helper／proto 與 HELPER_PKG.exe／proto ⇒ {state:'old'|'stale'|'ok',…}
     gate(pong, {reconnect})  v1.2.0：old ⇒ 擋住整頁的彈窗（下載最新版＋「我已更新，重新連線」，沒有略過）；
                              stale ⇒ 「這個分頁是舊的，請按 Ctrl+F5」彈窗；回 state。頁面拿到 'old' 一定要 throw oldError(pong)
     oldError(pong)／blocked()／cmpVer(a,b)
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var PORT = 8899;
  var ONLINE_BASE = 'https://brucecheng0428.github.io/tcon-tools/';
  var T = {
    on:     ['I2C 已連線', 'I2C connected', 'I2C 已连接'],
    off:    ['I2C 未連線', 'I2C not connected', 'I2C 未连接'],
    busy:   ['I2C 連線中…', 'I2C connecting…', 'I2C 连接中…'],
    none:   ['找不到 I2C and AUX Bridge', 'I2C and AUX Bridge not found', '找不到 I2C and AUX Bridge'],
    drop:   ['I2C 已斷線', 'I2C disconnected', 'I2C 已断线'],
    needT:  ['連不上 I2C and AUX Bridge：這台電腦可能還沒有執行 I2C and AUX Bridge', 'Cannot reach the I2C and AUX Bridge: it may not be running on this computer', '连不上 I2C and AUX Bridge：这台电脑可能还没有执行 I2C and AUX Bridge'],
    dropT:  ['I2C and AUX Bridge 已關閉或斷線', 'The I2C and AUX Bridge closed or dropped', 'I2C and AUX Bridge 已关闭或断线'],
    dl:     ['⬇ 下載 I2C and AUX Bridge {ver}', '⬇ Download I2C and AUX Bridge {ver}', '⬇ 下载 I2C and AUX Bridge {ver}'],
    dlMiss: ['（下載包資訊讀不到，請到「I2C / AUX 讀寫測試」頁下載）', '(Package info unavailable; download it from the I2C / AUX page)', '（下载包信息读不到，请到「I2C / AUX 读写测试」页下载）'],
    steps:  ['下載 → 全部解壓到同一個資料夾 → 雙擊 i2c-aux-bridge.exe → 回這頁按「連線」', 'Download → unzip everything into one folder → double-click i2c-aux-bridge.exe → come back and press Connect', '下载 → 全部解压到同一个文件夹 → 双击 i2c-aux-bridge.exe → 回这页按「连接」'],
    more:   ['詳細說明與疑難排解：I2C / AUX 讀寫測試頁', 'Details and troubleshooting: the I2C / AUX page', '详细说明与疑难排解：I2C / AUX 读写测试页'],
    small:  ['沒有 I2C and AUX Bridge？下載 {ver}', 'No I2C and AUX Bridge? Download {ver}', '没有 I2C and AUX Bridge？下载 {ver}']
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
    '.i2cb-need-nx{font-weight:700;font-size:15px;color:#fecaca;margin-bottom:10px}' +
    '.i2cb-need-row{display:flex;flex-wrap:wrap;align-items:center;gap:10px}' +
    /* 下載鈕＝i2c.html #dl 的樣式（同色、同字級） */
    '.i2cb-need-dl{display:inline-block;background:#0369a1;border:1px solid #0ea5e9;border-radius:8px;color:#e0f2fe !important;padding:12px 22px;text-decoration:none;font-weight:700;font-size:17px}' +
    '.i2cb-need-dl:hover{filter:brightness(1.12)}' +
    '.i2cb-need-why{font-size:13px;color:#cbd5e1}' +
    '.i2cb-need-steps{margin:12px 0 4px;padding-left:1.6em;font-size:16px;line-height:1.9}' +
    '.i2cb-need-steps code,.i2cb-modalbox code{font-family:ui-monospace,Menlo,Consolas,monospace}' +
    '.i2cb-need-s{margin-top:8px;font-size:13px;opacity:.9;line-height:1.7}' +
    '.i2cb-need-s a{color:inherit}' +
    '.i2cb-need-ts{margin-top:8px}.i2cb-need-ts summary{cursor:pointer;font-size:13px;color:#94a3b8}' +
    /* 說明視窗＝i2c.html .modal／.modalbox（標題 24px、步驟 22px） */
    '.i2cb-modal{position:fixed;inset:0;background:rgba(2,6,23,.82);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px}' +
    '.i2cb-modal[hidden]{display:none}' +
    '.i2cb-modalbox{background:#111827;border:1px solid #38bdf8;border-radius:14px;padding:26px 30px;max-width:560px;width:100%;color:#e2e8f0}' +
    '.i2cb-modalbox h3{margin:0 0 18px;font-size:24px;font-weight:700;color:#e0f2fe}' +
    '.i2cb-modalbox ol{margin:0 0 22px;padding-left:1.4em}' +
    '.i2cb-modalbox li{font-size:22px;line-height:1.85;margin-bottom:6px}' +
    '.i2cb-modalbox code{font-size:21px}' +
    '.i2cb-modalbox button{font-size:16px;padding:9px 22px;border-radius:8px;border:1px solid #38bdf8;background:#0c4a6e;color:#e0f2fe;cursor:pointer}' +
    '.i2cb-small{font-size:12.5px;margin-left:8px;white-space:nowrap}' +
    /* v1.2.0：版本過舊／分頁過舊彈窗（過舊在最上層、下載說明視窗再蓋在它上面） */
    '.i2cb-modal.i2cb-oldm{z-index:2000}.i2cb-modal.i2cb-stalem{z-index:1900}#i2cb-howto{z-index:2100}' +
    '.i2cb-oldbox{border-color:#f59e0b;max-width:640px}.i2cb-oldbox h3{color:#fde68a}' +
    '.i2cb-old-msg{font-size:19px;line-height:1.7;margin:0 0 20px;color:#f1f5f9}' +
    '.i2cb-old-row{display:flex;flex-wrap:wrap;gap:12px;align-items:center}' +
    '.i2cb-old-s{margin:16px 0 0;font-size:14px;color:#cbd5e1}' +
    '.i2cb-modalbox button.i2cb-btn2{background:transparent;border-color:#64748b;color:#cbd5e1}';
  function css() {
    var d = root.document; if (!d || d.getElementById('i2cb-css')) return;
    var s = d.createElement('style'); s.id = 'i2cb-css'; s.textContent = CSS;
    (d.head || d.documentElement).appendChild(s);
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  /* v1.1.0（Bruce 2026-10-13「應該要像 I2C 網頁那樣，不是只提供下載，還要教導要怎麼樣應用，最好有步驟的說明，
     做得跟 I2C 網頁一模一樣」）：提示的文字直接取 i2c.html 用的那幾個 i18n 鍵（common/i18n.js 的 i2c.howto1~3、
     i2c.howtoTitle、i2c.dlShared、i2c.tsTitle／tsBody、i2c.nxGetBridge、i2c.gotIt），不另寫一份；頁面沒載 i18n.js 時退回本檔 T。
     版面照 i2c.html 的 #gethelper（大下載鈕＋原因）＋按下載後跳的 #howto 說明視窗（三步、字 22px）＋「跑不起來／連不上？」疑難排解。 */
  var TX = {
    'i2c.nxPrefix': ['下一步：', 'Next: ', '下一步：'],
    'i2c.nxGetBridge': ['先下載 I2C and AUX Bridge，解壓後執行 i2c-aux-bridge.exe，再按「連線」。', 'Download I2C and AUX Bridge, unzip it, run i2c-aux-bridge.exe, then press "Connect".', '先下载 I2C and AUX Bridge，解压后执行 i2c-aux-bridge.exe，再按「连接」。'],
    'i2c.howtoTitle': ['下載好了，接著這樣做', 'Downloaded — here is what to do next', '下载好了，接着这样做'],
    'i2c.howto1': ['把整包<b>解壓縮</b>到一個資料夾', '<b>Unzip</b> the whole package into one folder', '把整包<b>解压</b>到一个文件夹'],
    'i2c.howto2': ['雙擊 <code class="mono">i2c-aux-bridge.exe</code>', 'Double-click <code class="mono">i2c-aux-bridge.exe</code>', '双击 <code class="mono">i2c-aux-bridge.exe</code>'],
    'i2c.howto3': ['回到這一頁按<b>「連線」</b>', 'Come back to this page and press <b>"Connect"</b>', '回到这一页按<b>“连接”</b>'],
    'i2c.gotIt': ['知道了', 'Got it', '知道了'],
    'i2c.dlShared': ['「TCON 自檢畫面量測」用的是<b>同一支程式</b>，兩邊只要下載一次。', 'The T-CON self-test measurement uses <b>the same program</b>; download it once.', '「TCON 自检画面测量」用的是<b>同一支程序</b>，两边只要下载一次。'],
    'i2c.tsTitle': ['跑不起來 / 連不上？', 'Will not start / cannot connect?', '跑不起来 / 连不上？'],
    'i2c.tsBody': ['五個檔要在同一個資料夾：<code class="mono">i2c-aux-bridge.exe</code>、<code class="mono">libMPSSE.dll</code>、<code class="mono">ftd2xx.dll</code>、<code class="mono">DLL_I2C_BCB.dll</code>、<code class="mono">DLL_AUX_VC.dll</code>（DP AUX 用）。', 'All five files must sit in the same folder.', '五个文件要在同一个文件夹。']
  };
  var LANGS = ['zh-TW', 'en', 'zh-CN'];
  /* i2c.html 用的同一份字（HTML 片段，字典是本站自己的、不含使用者輸入） */
  function htx(k) {
    var lang = LANGS[langIdx()];
    try { if (typeof root.I18N !== 'undefined' && root.I18N[k]) { var e = root.I18N[k]; return e[lang] || e['zh-TW']; } } catch (e) {}
    try { if (typeof I18N !== 'undefined' && I18N[k]) return I18N[k][lang] || I18N[k]['zh-TW']; } catch (e) {}
    var a = TX[k]; return a ? (a[langIdx()] || a[0]) : k;
  }
  /* 按下載後跳的說明視窗：與 i2c.html #howto 同一份文字、同樣字級；整頁只建一個 */
  function howtoEl() {
    var d = root.document; if (!d) return null; css();
    var m = d.getElementById('i2cb-howto');
    if (!m) {
      m = d.createElement('div'); m.id = 'i2cb-howto'; m.className = 'i2cb-modal'; m.setAttribute('hidden', '');
      m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
      m.addEventListener('click', function (e) { if (e.target === m || (e.target && e.target.id === 'i2cb-howto-ok')) hideHowto(); });
      (d.body || d.documentElement).appendChild(m);
    }
    m.innerHTML = '<div class="i2cb-modalbox"><h3>' + htx('i2c.howtoTitle') + '</h3><ol><li>' + htx('i2c.howto1') + '</li><li>' + htx('i2c.howto2') + '</li><li>' + htx('i2c.howto3') + '</li></ol>' +
      '<button type="button" id="i2cb-howto-ok">' + htx('i2c.gotIt') + '</button></div>';
    return m;
  }
  function showHowto() { var m = howtoEl(); if (m) m.removeAttribute('hidden'); }
  function hideHowto() { var d = root.document, m = d && d.getElementById('i2cb-howto'); if (m) m.setAttribute('hidden', ''); }
  /* 下載連結按下去 ⇒ 照常下載，同時跳說明視窗（與 i2c.html 的 #dl 一樣） */
  function wireHowto(a) { if (a && !a.__i2cbHowto) { a.__i2cbHowto = true; a.addEventListener('click', function () { showHowto(); }); } }
  function mountNeed(el, why) {
    if (!el) return; css();
    var p = pkg(), h = dlHref();
    el.className = (el.className.replace(/\bi2cb-need\b/g, '').trim() + ' i2cb-need').trim();
    el.removeAttribute('hidden'); el.setAttribute('role', 'alert'); el.setAttribute('data-i2cb-need', why || 'none');
    el.innerHTML = '<div class="i2cb-need-nx">' + esc(htx('i2c.nxPrefix')) + esc(htx('i2c.nxGetBridge')) + '</div>' +
      '<div class="i2cb-need-row">' +
      (h ? '<a class="i2cb-need-dl mono" data-i2cb-dl="' + esc(p.pkg || '') + '" href="' + esc(h) + '" download>' + esc(text('dl', { ver: p.pkg || '' })) + '</a>'
         : '<span class="i2cb-need-s">' + esc(text('dlMiss')) + '</span>') +
      '<span class="i2cb-need-why">' + esc(text(why === 'drop' ? 'dropT' : 'needT')) + '</span></div>' +
      '<ol class="i2cb-need-steps"><li>' + htx('i2c.howto1') + '</li><li>' + htx('i2c.howto2') + '</li><li>' + htx('i2c.howto3') + '</li></ol>' +
      '<div class="i2cb-need-s">' + htx('i2c.dlShared') + '</div>' +
      '<details class="i2cb-need-ts"><summary>' + htx('i2c.tsTitle') + '</summary><div class="i2cb-need-s">' + htx('i2c.tsBody') + '</div></details>' +
      '<div class="i2cb-need-s"><a href="i2c.html" target="_blank" rel="noopener">' + esc(text('more')) + '</a></div>';
    wireHowto(el.querySelector('a.i2cb-need-dl'));
    var m = root.document && root.document.getElementById('i2cb-howto'); if (m && !m.hasAttribute('hidden')) howtoEl();   /* 換語言時說明視窗跟著換 */
  }
  function unmountNeed(el) { if (!el) return; el.setAttribute('hidden', ''); el.innerHTML = ''; el.removeAttribute('data-i2cb-need'); }
  /* ═══ v1.2.0（Bruce 2026-10-24）：Bridge 版本過舊 ⇒ 擋住操作的彈窗（全站共用，各頁只呼叫 gate） ═══
     Bruce 原話：「I2C bridge 或是 I2C AUX bridge 的版本一直在更新，所以是不是也要有一個檢測？如果使用者用的
     不是最新版本，就要跳出警告，請他關閉以後更換下載。最好是跳出彈窗的這種更新警告。如果他沒有下載最新的，
     就不讓他繼續使用。」
     判準（單一來源＝common/version.js 的 HELPER_PKG）：
       · old   ＝ ping 回的 proto < HELPER_PKG.proto，或 helper 版本 < HELPER_PKG.exe
                 ⇒ 擋住整頁的彈窗（沒有略過、Esc 關不掉、背後元素 inert），頁面不得往下開通道
       · stale ＝ helper 版本 > HELPER_PKG.exe（或 proto 較新）⇒ 本頁是舊的，彈窗請他 Ctrl+F5（可先關掉）
       · ok    ＝ 相同；HELPER_PKG 讀不到（無從判斷）也算 ok，不擋
     比的是 exe（ping 回報值），不是 pkg：只換 zip 沒重編 exe 時，手上的 exe 仍是最新，不能擋。
     helper 不是數字版號（例如測試用 'fake'）⇒ 只看 proto。 */
  var TG = {
    oldT:    ['需要更新 I2C and AUX Bridge', 'I2C and AUX Bridge update required', '需要更新 I2C and AUX Bridge'],
    oldB:    ['I2C and AUX Bridge 版本過舊（目前 {have}，最新 {want}），請關閉舊程式，下載最新版後重新開啟。',
              'I2C and AUX Bridge is out of date (current {have}, latest {want}). Please close the old program, download the latest version and start it again.',
              'I2C and AUX Bridge 版本过旧（目前 {have}，最新 {want}），请关闭旧程序，下载最新版后重新打开。'],
    oldDl:   ['⬇ 下載最新版 {ver}', '⬇ Download the latest {ver}', '⬇ 下载最新版 {ver}'],
    oldRe:   ['我已更新，重新連線', 'I have updated — reconnect', '我已更新，重新连接'],
    oldNo:   ['版本沒更新前，讀寫與連線都不能使用。', 'Reading, writing and connecting stay disabled until the bridge is updated.', '版本没更新前，读写与连接都不能使用。'],
    staleT:  ['這個分頁是舊的', 'This tab is out of date', '这个标签页是旧的'],
    staleB:  ['I2C and AUX Bridge 已是 {have}，本頁還是預期 {want} 的舊版，請按 Ctrl+F5 重新整理。',
              'The I2C and AUX Bridge is already {have}, but this page still expects {want}. Press Ctrl+F5 to reload.',
              'I2C and AUX Bridge 已是 {have}，本页还是预期 {want} 的旧版，请按 Ctrl+F5 重新整理。'],
    staleRe: ['重新整理（Ctrl+F5）', 'Reload (Ctrl+F5)', '重新整理（Ctrl+F5）'],
    later:   ['先關閉', 'Close', '先关闭']
  };
  function gt(k, v) {
    var a = TG[k]; if (!a) return k;
    var s = a[langIdx()] || a[0];
    if (v) Object.keys(v).forEach(function (n) { s = s.split('{' + n + '}').join(v[n]); });
    return s.replace(/\s*\{ver\}/g, '');
  }
  /* a 與 b 比：-1／0／1；任一邊不是數字版號 ⇒ null（不確定就不據此判） */
  function cmpVer(a, b) {
    var re = /^v?\d+(\.\d+)*$/; a = String(a == null ? '' : a).trim(); b = String(b == null ? '' : b).trim();
    if (!re.test(a) || !re.test(b)) return null;
    var pa = a.replace(/^v/, '').split('.'), pb = b.replace(/^v/, '').split('.');
    for (var i = 0; i < Math.max(pa.length, pb.length); i++) {
      var x = parseInt(pa[i] || '0', 10), y = parseInt(pb[i] || '0', 10);
      if (x !== y) return x > y ? 1 : -1;
    }
    return 0;
  }
  function check(pong) {
    var p = pkg(), want = p.exe ? String(p.exe) : '', need = p.proto | 0;
    var have = (pong && pong.helper) ? String(pong.helper) : '', proto = pong ? (pong.proto | 0) : 0;
    var r = { state: 'ok', have: have, want: want, proto: proto, needProto: need, pkg: p.pkg || '' };
    if (!want || !need) return r;                       /* 下載包資訊讀不到 ⇒ 無從判斷，不擋 */
    if (root.I2CBridge && root.I2CBridge._testNoGate === true) return r;   /* 只給 tools/ 舊版行為測試用；畫面上沒有任何略過 */
    var c = cmpVer(have, want);
    if (proto < need || c === -1) r.state = 'old';
    else if (c === 1 || proto > need) r.state = 'stale';
    return r;
  }
  var G = { old: null, stale: null, esc: null, obs: null };
  function blocked() { return !!G.old; }
  function verTxt(r) { return (r.have || '?') + ((r.proto < r.needProto) ? ' · proto ' + r.proto : ''); }
  function wantTxt(r) { return (r.want || '?') + ((r.proto < r.needProto) ? ' · proto ' + r.needProto : ''); }
  function setInert(on) {
    var d = root.document; if (!d || !d.body) return;
    Array.prototype.forEach.call(d.body.children, function (el) {
      if (el.id === 'i2cb-old' || el.id === 'i2cb-howto' || el.id === 'i2cb-stale') return;
      if (on) { if (!el.hasAttribute('inert')) { el.setAttribute('inert', ''); el.setAttribute('data-i2cb-inert', '1'); } }
      else if (el.getAttribute('data-i2cb-inert') === '1') { el.removeAttribute('inert'); el.removeAttribute('data-i2cb-inert'); }
    });
  }
  function modalEl(id) {
    var d = root.document; if (!d) return null; css();
    var m = d.getElementById(id);
    if (!m) {
      m = d.createElement('div'); m.id = id; m.className = 'i2cb-modal ' + (id === 'i2cb-old' ? 'i2cb-oldm' : 'i2cb-stalem');
      m.setAttribute('role', 'alertdialog'); m.setAttribute('aria-modal', 'true');
      m.setAttribute('aria-labelledby', id + '-t'); m.setAttribute('aria-describedby', id + '-b');
      (d.body || d.documentElement).appendChild(m);
    }
    return m;
  }
  function renderOld() {
    var r = G.old && G.old.r; if (!r) return;
    var m = modalEl('i2cb-old'); if (!m) return;
    var h = dlHref(), p = pkg();
    m.setAttribute('data-i2cb-have', r.have || ''); m.setAttribute('data-i2cb-want', r.want || '');
    m.innerHTML = '<div class="i2cb-modalbox i2cb-oldbox"><h3 id="i2cb-old-t">⚠ ' + esc(gt('oldT')) + '</h3>' +
      '<p id="i2cb-old-b" class="i2cb-old-msg">' + esc(gt('oldB', { have: verTxt(r), want: wantTxt(r) })) + '</p>' +
      '<div class="i2cb-old-row">' +
      (h ? '<a id="i2cb-old-dl" class="i2cb-need-dl mono" data-i2cb-dl="' + esc(p.pkg || '') + '" href="' + esc(h) + '" download>' + esc(gt('oldDl', { ver: p.pkg || '' })) + '</a>' : '') +
      '<button type="button" id="i2cb-old-re">' + esc(gt('oldRe')) + '</button></div>' +
      '<p class="i2cb-old-s">' + esc(gt('oldNo')) + '</p></div>';
    wireHowto(m.querySelector('#i2cb-old-dl'));
    m.querySelector('#i2cb-old-re').addEventListener('click', function () {
      var o = G.old; hideOld();
      if (o && typeof o.opts.reconnect === 'function') { try { o.opts.reconnect(); } catch (e) {} }
      else { try { root.location.reload(); } catch (e) {} }
    });
  }
  function renderStale() {
    var r = G.stale; if (!r) return;
    var m = modalEl('i2cb-stale'); if (!m) return;
    m.innerHTML = '<div class="i2cb-modalbox"><h3 id="i2cb-stale-t">' + esc(gt('staleT')) + '</h3>' +
      '<p id="i2cb-stale-b" class="i2cb-old-msg">' + esc(gt('staleB', { have: r.have || '?', want: r.want || '?' })) + '</p>' +
      '<div class="i2cb-old-row"><button type="button" id="i2cb-stale-re">' + esc(gt('staleRe')) + '</button>' +
      '<button type="button" id="i2cb-stale-x" class="i2cb-btn2">' + esc(gt('later')) + '</button></div></div>';
    m.querySelector('#i2cb-stale-re').addEventListener('click', function () { try { root.location.reload(); } catch (e) {} });
    m.querySelector('#i2cb-stale-x').addEventListener('click', hideStale);
  }
  function watchLang() {
    var d = root.document; if (G.obs || !d || typeof root.MutationObserver !== 'function') return;
    G.obs = new root.MutationObserver(function () { if (G.old) renderOld(); if (G.stale) renderStale(); });
    G.obs.observe(d.documentElement, { attributes: true, attributeFilter: ['lang'] });
  }
  function showOld(r, opts) {
    G.old = { r: r, opts: opts || {} }; renderOld(); watchLang();
    var m = root.document.getElementById('i2cb-old'); m.removeAttribute('hidden');
    setInert(true);
    if (!G.esc) {
      G.esc = function (e) { if (G.old && (e.key === 'Escape' || e.key === 'Esc')) { e.preventDefault(); e.stopPropagation(); } };
      root.document.addEventListener('keydown', G.esc, true);
    }
    try { var b = root.document.getElementById('i2cb-old-re'); if (b) b.focus(); } catch (e) {}
  }
  function hideOld() {
    G.old = null; setInert(false);
    var d = root.document, m = d && d.getElementById('i2cb-old'); if (m) m.setAttribute('hidden', '');
    if (G.esc && d) { d.removeEventListener('keydown', G.esc, true); G.esc = null; }
  }
  function showStale(r) { G.stale = r; renderStale(); watchLang(); var m = root.document.getElementById('i2cb-stale'); if (m) m.removeAttribute('hidden'); }
  function hideStale() { G.stale = null; var d = root.document, m = d && d.getElementById('i2cb-stale'); if (m) m.setAttribute('hidden', ''); }
  /* 頁面在 ping 之後呼叫：gate(pong, { reconnect: fn })；回 'old'／'stale'／'ok'。
     'old' ⇒ 頁面一定要停（throw oldError(pong)），不得送 open／讀寫。 */
  function gate(pong, opts) {
    var r = check(pong);
    if (!root.document) return r.state;
    if (r.state === 'old') { hideStale(); showOld(r, opts); }
    else { if (G.old) hideOld(); if (r.state === 'stale') showStale(r); else hideStale(); }
    return r.state;
  }
  function oldError(pong) {
    var r = check(pong);
    var e = new Error(gt('oldB', { have: verTxt(r), want: wantTxt(r) }));
    e.i2cbOld = true; return e;
  }

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
    mountNeed: mountNeed, unmountNeed: unmountNeed, showHowto: showHowto, hideHowto: hideHowto, wireHowto: wireHowto, badge: badge, text: text, css: css,
    /* v1.2.0：版本檢查與擋用彈窗 */
    cmpVer: cmpVer, check: check, gate: gate, oldError: oldError, blocked: blocked, hideOld: hideOld, hideStale: hideStale,
    _testNoGate: root.__I2CB_TEST_NO_GATE__ === true   /* 只給 tools/ 舊版 bridge 行為測試用（頁面載入前由測試夾具設）；畫面上沒有任何略過 */
  };
})(typeof window !== 'undefined' ? window : this);
