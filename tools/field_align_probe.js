/* ═══════════════════════════════════════════════════════════════════════════
   field_align_probe.js — 把「美觀」變成可以逐條檢查的數字
   ───────────────────────────────────────────────────────────────────────────
   🔴 為什麼要這一支：Bruce 2026-09-18「Slave addr 那邊，它的輸入格高低、位置跟
      其他輸入格的垂直位置又不一樣。請注重美觀問題…現在這個感覺就是沒有顧到
      美觀」。審美需求如果只靠「看起來還可以」就會一路歪下去，所以先訂判準：

        1. 同一列所有控制項的 height 完全相同（差 0）
        2. 同一列所有控制項的 top    完全相同（差 0）
        3. 同一列的標籤字級／顏色一致
        4. 相鄰欄位的水平間距一致

   🔴 jsdom 量不了這些（getBoundingClientRect 全回 0，它不做排版）⇒ 這一支要在
      **真的瀏覽器**裡跑。tools/layout_probe.sh 用 headless Chrome 載入頁面並執行
      它，把結果塞進 document.title，再用 --dump-dom 取回來。

   注入後會在 window 留下 __ALIGN__；也會把 JSON 寫進 document.title。
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  function ctlsOf(row) {
    /* 一列裡「使用者會去點的東西」＝ input / select / button / chips 群組。
       chips 是一整組（視覺上是一個控制項），量整組的外框。 */
    var out = [];
    row.querySelectorAll('input[type=text], select, button, .chips').forEach(function (el) {
      if (el.closest('.chips') && !el.classList.contains('chips')) return;   /* chip 本身不算 */
      if (el.offsetParent === null && getComputedStyle(el).display === 'none') return;
      var r = el.getBoundingClientRect();
      out.push({ id: el.id || el.className || el.tagName.toLowerCase(),
                 top: +r.top.toFixed(2), height: +r.height.toFixed(2),
                 left: +r.left.toFixed(2), right: +r.right.toFixed(2) });
    });
    return out;
  }
  function labelsOf(row) {
    var out = [];
    row.querySelectorAll(':scope > label.f > span:first-child, :scope > .f > span:first-child')
      .forEach(function (el) {
        var cs = getComputedStyle(el), r = el.getBoundingClientRect();
        out.push({ text: el.textContent.trim().slice(0, 14), top: +r.top.toFixed(2),
                   fontSize: cs.fontSize, color: cs.color });
      });
    return out;
  }
  function spread(a) { return a.length ? +(Math.max.apply(null, a) - Math.min.apply(null, a)).toFixed(2) : 0; }

  var rows = Array.prototype.slice.call(document.querySelectorAll('.card .row'))
    .filter(function (r) { return r.querySelector('label.f'); });
  var res = { w: window.innerWidth, rows: [] };
  rows.forEach(function (row, i) {
    var c = ctlsOf(row), l = labelsOf(row);
    /* 間距＝前一個控制項的右緣到下一個的左緣（只看同一條水平線上的） */
    var gaps = [];
    for (var k = 1; k < c.length; k++) if (Math.abs(c[k].top - c[k - 1].top) < 0.5) gaps.push(+(c[k].left - c[k - 1].right).toFixed(2));
    res.rows.push({
      i: i, n: c.length,
      topSpread: spread(c.map(function (x) { return x.top; })),
      hSpread:   spread(c.map(function (x) { return x.height; })),
      labTopSpread: spread(l.map(function (x) { return x.top; })),
      labFonts: Array.from(new Set(l.map(function (x) { return x.fontSize; }))),
      labColors: Array.from(new Set(l.map(function (x) { return x.color; }))),
      gaps: Array.from(new Set(gaps)),
      ctls: c
    });
  });
  /* 版面溢出：卡片內容有沒有被擠出去 */
  res.overflow = Array.prototype.slice.call(document.querySelectorAll('.card')).some(function (c) {
    return c.scrollWidth > c.clientWidth + 1;
  });
  res.docOverflow = document.documentElement.scrollWidth > window.innerWidth + 1;
  window.__ALIGN__ = res;
  document.title = 'ALIGN' + JSON.stringify(res);
  return res;
})();
