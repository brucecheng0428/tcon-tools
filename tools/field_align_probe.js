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
    /* 🔴 視窗窄的時候 `.row` 會**換行**（flex-wrap，這是刻意的 RWD 行為）。
       換行之後不同視覺行的 top 本來就不一樣，拿整列去比會得到「未對齊 77px」
       這種假警報。所以先依 top 把控制項分成**視覺行**，只在同一行內比對齊。
       （2026-09-19：第一版就是這樣誤報的，記在這裡免得下次又改回去。） */
    var lines = [];
    c.forEach(function (x) {
      var ln = lines.filter(function (l) { return Math.abs(l[0].top - x.top) < 2; })[0];
      if (ln) ln.push(x); else lines.push([x]);
    });
    var topSpreadMax = Math.max.apply(null, lines.map(function (l) {
      return spread(l.map(function (x) { return x.top; }));
    }));
    res.rows.push({
      i: i, n: c.length, lines: lines.length,
      topSpread: topSpreadMax,
      hSpread:   spread(c.map(function (x) { return x.height; })),
      labTopSpread: (function () {
        var g = [];
        l.forEach(function (x) {
          var ln = g.filter(function (q) { return Math.abs(q[0].top - x.top) < 2; })[0];
          if (ln) ln.push(x); else g.push([x]);
        });
        return Math.max.apply(null, g.map(function (q) { return spread(q.map(function (x) { return x.top; })); }));
      })(),
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

  /* ═══ 🔴 所有互動元件的內容不得溢出自身邊界（2026-09-19 新增）═════════════
     起因：說明視窗的「知道了」字級放大到 19px，但按鈕還套著寫死的
     `height:30px`，字**溢出到按鈕外面**。Bruce 拍照回報。
     教訓不是「那一顆按鈕沒調好」，是**我的驗證只涵蓋我被點名的那一項**：
     上一輪只量了輸入列的對齊，沒量「內容有沒有跑出元件外」，也沒驗 modal
     打開之後的狀態。所以這一節走訪**每一顆**按鈕／輸入框／下拉，逐顆判：

       1. scrollWidth/scrollHeight 不得大於 clientWidth/clientHeight（沒有被裁掉）
       2. 文字本身的 bounding box（用 Range 量，不是估的）要完整落在元件內，
          四邊內距 ≥ MIN_PAD
       3. 同一列的按鈕高度一致

     🔴 量 modal 要在它**打開**的狀態下量 —— display:none 的東西量出來全是 0，
        會安靜地通過。所以先把所有 modal 打開，量完再關回去。 */
  /* 🔴 內距門檻要跟著頁面的單位系統縮放。dg-measure 整頁的尺寸都建立在
     `--dgm-u: min(1vw/19.2, 1vh/10.8)` 上（1920×1080 時 ＝ 1px），視窗小一半
     所有東西就等比小一半。對這種頁面套**絕對 6px**，等於要求視窗越小內距占比
     越大 —— 那不是「沒顧到美觀」，是判準本身用錯了尺。
     沒有 --dgm-u 的頁面（i2c.html、index.html）factor ＝ 1，門檻就是 6px。 */
  /* 🔴 不能用 parseFloat 讀 --dgm-u：自訂屬性是**原樣代入**的，Chrome 回傳的是
     字串 `min(1vw / 19.2, 1vh / 10.8)`，parseFloat 得到 NaN ⇒ 門檻悄悄退回 6px，
     看起來有在縮放其實沒有。改成照那個公式**自己算**（1920×1080 時剛好 ＝ 1）。 */
  var DGU = getComputedStyle(document.documentElement).getPropertyValue('--dgm-u').trim()
    ? Math.min(window.innerWidth / 1920, window.innerHeight / 1080) : 1;
  var MIN_PAD = +(6 * Math.min(1, DGU)).toFixed(2);
  res.minPad = MIN_PAD;
  function textRect(el) {
    /* 只量真正的文字節點；元素自己的 rect 不能用（那就是被比較的對象）。 */
    var best = null;
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i];
      if (n.nodeType !== 3 || !n.nodeValue.trim()) continue;
      var rg = document.createRange(); rg.selectNodeContents(n);
      var r = rg.getBoundingClientRect(); rg.detach && rg.detach();
      if (!r.width && !r.height) continue;
      if (!best) best = { top: r.top, left: r.left, right: r.right, bottom: r.bottom };
      else {
        best.top = Math.min(best.top, r.top); best.left = Math.min(best.left, r.left);
        best.right = Math.max(best.right, r.right); best.bottom = Math.max(best.bottom, r.bottom);
      }
    }
    return best;
  }
  var reopened = [];
  Array.prototype.slice.call(document.querySelectorAll('.modal, [id$="-modal"], #howto, #dgm-howto'))
    .forEach(function (m) {
      if (getComputedStyle(m).display === 'none') { m.style.display = 'flex'; reopened.push(m); }
    });

  res.fit = [];
  Array.prototype.slice.call(document.querySelectorAll('button, input[type=text], select, a[download]'))
    .forEach(function (el) {
      var cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      var r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      var t = textRect(el);
      var bad = [];
      if (el.scrollWidth  > el.clientWidth  + 1) bad.push('scrollW ' + el.scrollWidth + '>' + el.clientWidth);
      if (el.scrollHeight > el.clientHeight + 1) bad.push('scrollH ' + el.scrollHeight + '>' + el.clientHeight);
      var pads = null;
      if (t) {
        pads = { l: +(t.left - r.left).toFixed(1), r: +(r.right - t.right).toFixed(1),
                 t: +(t.top - r.top).toFixed(1),   b: +(r.bottom - t.bottom).toFixed(1) };
        /* input 的文字可以貼近左右邊（那是捲動區），只對按鈕類要求四邊內距。 */
        /* `data-compact` ＝ 標記上明示放棄 6px 內距（例如一格切兩半的上下鍵，
           幾何上不可能有 6px）。即使豁免，文字仍然必須完整落在元件內。
           input 的文字可以貼近左右邊（那是捲動區），也不套 6px。 */
        var strict = (el.tagName === 'BUTTON' || el.tagName === 'A') && !el.hasAttribute('data-compact');
        var lim = strict ? MIN_PAD : 0;
        ['l', 'r', 't', 'b'].forEach(function (k) {
          if (pads[k] < lim) bad.push('pad.' + k + '=' + pads[k] + '<' + lim);
        });
      }
      res.fit.push({ id: el.id || (el.className || el.tagName) + ':' + (el.textContent || '').trim().slice(0, 8),
                     tag: el.tagName, fs: cs.fontSize,
                     w: +r.width.toFixed(1), h: +r.height.toFixed(1), pads: pads,
                     bad: bad });
    });
  reopened.forEach(function (m) { m.style.display = 'none'; });
  res.fitFails = res.fit.filter(function (x) { return x.bad.length; });
  window.__ALIGN__ = res;
  document.title = 'ALIGN' + JSON.stringify(res);
  return res;
})();
