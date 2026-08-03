/* ═══════════════════════════════════════════════════════════════════════
   常設機械檢查 ①：畫面上不得出現「未翻譯的 i18n key」
   ───────────────────────────────────────────────────────────────────────
   為什麼需要這支：common.js 的 t(key) 在查不到翻譯時會**回傳 key 本身**
   （`(entry && entry[lang]) || (entry && entry['zh-TW']) || key`），
   這是靜默失敗 —— 畫面照樣渲染、console 一個字都不會叫。只要
   ① 新增 key 忘了補翻譯，或 ② 瀏覽器吃到舊的 i18n.js 快取，
   使用者就會看到 `pat.selLit` 這種字串，而任何「讀 DOM textContent」
   式的驗證都會照單全收（因為它讀到的就是那個 key）。

   用法（在目標頁面的 console 或自動化工具執行）：
     1. 貼上本檔內容
     2. pgScanKeys()                → 掃目前語言
     3. await pgScanKeysAllLangs()  → 依序掃三種語言（需要頁面有 applyLang）
   回傳 { pass, hits }；pass 為 false 就是有未翻譯的 key 露在畫面上。

   判定方式刻意不看 i18n.js 的內容 —— 那正是先前漏掉這個缺陷的原因。
   一律讀「畫面上實際渲染出來的文字」。
   ═══════════════════════════════════════════════════════════════════════ */
(function (global) {

  // i18n key 的樣式：小寫開頭的命名空間 + 點 + 名稱，全長無空白。
  // 例：pat.selLit / common.save / aux.dpcdRev
  var KEY_RE = /^[a-z][a-zA-Z0-9]*\.[a-zA-Z0-9_]+$/;

  // 這些字串長得像 key 但其實是正常內容，明列白名單避免誤報。
  // 每一筆都要寫清楚為什麼，不可以為了讓檢查過關而隨手加。
  var WHITELIST = [
    /^\d+\.\d+$/,                 // 純數字，例如版號片段或小數
    /\.(png|bmp|jpg|jpeg|html|js|css|zip|txt|md)$/i,  // 副檔名
  ];

  function isWhitelisted(s) {
    return WHITELIST.some(function (re) { return re.test(s); });
  }

  // 元素是否真的看得到（display:none / visibility:hidden / 尺寸為 0 都不算）
  function visible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    var st = global.getComputedStyle(el);
    if (!st || st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return false;
    var r = el.getBoundingClientRect();
    // 注意：視窗尺寸異常時所有元素都會量到 0，此時不用尺寸當判準，
    // 否則整份掃描會靜默地什麼都查不到 —— 那比誤報還危險。
    if (global.innerWidth > 0 && global.innerHeight > 0 && r.width === 0 && r.height === 0) return false;
    return true;
  }

  function scanKeys() {
    var hits = [];

    // ① 所有文字節點
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    var n;
    while ((n = walker.nextNode())) {
      var txt = (n.nodeValue || '').trim();
      if (!txt || !KEY_RE.test(txt) || isWhitelisted(txt)) continue;
      var el = n.parentElement;
      if (!visible(el)) continue;
      hits.push({ where: 'text', key: txt, tag: el.tagName.toLowerCase(), id: el.id || '', cls: el.className || '' });
    }

    // ② 使用者看得到的屬性（tooltip、placeholder、按鈕值、無障礙標籤）
    ['title', 'placeholder', 'aria-label', 'value', 'alt'].forEach(function (attr) {
      Array.prototype.forEach.call(document.querySelectorAll('[' + attr + ']'), function (el) {
        var v = (el.getAttribute(attr) || '').trim();
        if (!v || !KEY_RE.test(v) || isWhitelisted(v)) return;
        if (!visible(el)) return;
        hits.push({ where: attr, key: v, tag: el.tagName.toLowerCase(), id: el.id || '', cls: el.className || '' });
      });
    });

    return { pass: hits.length === 0, lang: global.currentLang || '(未知)', hits: hits };
  }

  // 三種語言各掃一次：只有一種語言缺翻譯也要抓出來
  function scanKeysAllLangs(langs) {
    langs = langs || ['zh-TW', 'en', 'zh-CN'];
    var prev = global.currentLang;
    var all = [];
    langs.forEach(function (L) {
      if (typeof global.applyLang === 'function') { try { global.applyLang(L); } catch (e) {} }
      var r = scanKeys();
      all.push({ lang: L, pass: r.pass, hits: r.hits });
    });
    if (typeof global.applyLang === 'function' && prev) { try { global.applyLang(prev); } catch (e) {} }
    return { pass: all.every(function (x) { return x.pass; }), perLang: all };
  }

  global.pgScanKeys = scanKeys;
  global.pgScanKeysAllLangs = scanKeysAllLangs;
})(typeof window !== 'undefined' ? window : this);
