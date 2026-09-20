/* ═══════════════════════════════════════════════════════════════════════════
   scan_keys_probe.js — 在**真的 Chrome** 裡跑 `pgScanKeysAllLangs()`，把結果寫進
   document.title 讓外面用 `--dump-dom` 取回。
   ───────────────────────────────────────────────────────────────────────────
   🔴 為什麼要這一支：`tools/scan_untranslated_keys.js` 的用法原本寫的是
      「貼到 console 裡執行」—— 那是人工步驟，不會有人每次都記得做，
      而它擋的正是**靜默失敗**（`t(key)` 查不到翻譯時回傳 key 本身，
      畫面照樣渲染、console 一個字都不會叫）。人工步驟守不住靜默失敗。

   🔴 它必須是**真瀏覽器**：判定依據是「元素看不看得見」（display/visibility/
      尺寸），jsdom 不做排版，量到的尺寸一律是 0。

   用法：
     bash tools/scan_keys.sh [頁面.html]
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  function done(obj) {
    try { document.title = 'SCANKEYS' + JSON.stringify(obj); } catch (e) {
      document.title = 'SCANKEYS{"pass":false,"err":"stringify failed"}';
    }
  }
  /* 頁面自己的初始化（自動連線、第一次渲染）要先跑完，否則掃到的是半張畫面。 */
  setTimeout(function () {
    if (typeof window.pgScanKeysAllLangs !== 'function') {
      done({ pass: false, err: 'pgScanKeysAllLangs 不存在（scan_untranslated_keys.js 沒注入？）' });
      return;
    }
    if (typeof window.applyLang !== 'function') {
      /* 🔴 這一條**不可以當成通過**：沒有 applyLang 就只掃得到一種語言，
         而三語最容易漏的正好是另外兩種。 */
      done({ pass: false, err: '頁面沒有 applyLang，無法逐語言掃 —— 不當作通過' });
      return;
    }
    Promise.resolve(window.pgScanKeysAllLangs(['zh-TW', 'en', 'zh-CN'])).then(function (r) {
      /* hits 可能很多，只留前 20 筆避免 title 爆長 */
      var per = (r.perLang || []).map(function (x) {
        return { lang: x.lang, pass: x.pass, n: (x.hits || []).length,
                 hits: (x.hits || []).slice(0, 20) };
      });
      done({ pass: !!r.pass, perLang: per });
    }).catch(function (e) { done({ pass: false, err: String(e && e.message || e) }); });
  }, 1200);
})();
