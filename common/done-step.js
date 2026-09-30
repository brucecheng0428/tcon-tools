/* ═══════════════════════════════════════════════════════════════════════════
   common/done-step.js — 「已完成的步驟」縮成一行（Bruce 2026-10-01 核准，樣式見 common/done-step.css）
   自檢頁（dg-selftest.html）、DG 校正分頁與「RGB LUT 深度轉換」分頁（dg.html）共用。

   TCONDoneStep.set(box, opt)
     box ＝ 步驟的外框元素；opt ＝ { key, done, name, lineId, onToggle }
       key      ＝ 這一步的代號（記「有沒有被點開回看」用，同一頁內唯一）
       done     ＝ 這一步完成了沒 —— 🔴 由頁面自己的既有狀態決定，這支不判斷任何東西
       name     ＝ 「✓ 」後面那幾個字（頁面自己給，三語由頁面負責）
       lineId   ＝ 那一行的 id（可省略）
       onToggle ＝ 點了那一行之後要做什麼（通常是頁面重畫；可省略）
     回傳那一行（<button class="tc-done-line">），第一次呼叫時插在 box 的最前面。
   TCONDoneStep.peek(key[, v])  讀／設「這一步被點開回看」；TCONDoneStep.reset() 全部收回（換一份工作時用）。
   🔴 那一行是 <button>：鍵盤可以 Tab 到、Enter／空白鍵展開；aria-expanded 跟著狀態走。
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  var peekOf = {};
  function lineOf(box, opt) {
    var ln = null, i;
    for (i = 0; i < box.children.length; i++) if (box.children[i].classList.contains('tc-done-line')) { ln = box.children[i]; break; }
    if (!ln) {
      ln = document.createElement('button');
      ln.type = 'button';
      ln.className = 'tc-done-line';
      box.insertBefore(ln, box.firstChild);
    }
    if (opt.lineId && ln.id !== opt.lineId) ln.id = opt.lineId;
    ln.onclick = function () {
      peekOf[opt.key] = !peekOf[opt.key];
      if (typeof opt.onToggle === 'function') opt.onToggle(!!peekOf[opt.key]);
      else TCONDoneStep.set(box, opt);
    };
    return ln;
  }
  var TCONDoneStep = {
    set: function (box, opt) {
      if (!box || !opt) return null;
      var ln = lineOf(box, opt);
      var done = !!opt.done, peek = done && !!peekOf[opt.key];
      ln.textContent = (peek ? '▾ ' : '✓ ') + String(opt.name || '');
      ln.setAttribute('aria-expanded', String(peek));
      box.classList.toggle('tc-step-done', done && !peek);
      box.classList.toggle('tc-step-peek', peek);
      return ln;
    },
    peek: function (key, v) { if (v !== undefined) peekOf[key] = !!v; return !!peekOf[key]; },
    reset: function () { peekOf = {}; }
  };
  window.TCONDoneStep = TCONDoneStep;
})();
