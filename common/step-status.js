/* ═══════════════════════════════════════════════════════════════════════════
   common/step-status.js — 步驟完成狀態一眼看得出來（DG 三頁共用：dg.html、dg-measure.html、dg-selftest.html）
   樣式：common/step-status.css（同一組數值三頁共用）。

   Bruce 2026-10-23：「第一步驟做完以後要做第二步驟，但是第一步驟實在是太不清楚、字太小了，有時候根本就不
   知道它已經做完了…打勾用綠色、字稍微大一點就好了，不要讓我覺得完全不知道現在在第幾步驟、之前的到底有沒有
   做完…不只電腦畫面，量測、自檢這些也都確認一遍…是用這個邏輯再去套用全部的步驟」。

   三種狀態（每一步都一樣）：
     done  已完成   ＝ 綠色實心圓 ✓ ＋「已完成」字樣，字放大（手機看得清楚）
     cur   目前這一步 ＝ 外框加粗＋淡藍底，框裡寫「第 N 步（共 M 步）· 目前這一步」
     todo  還沒做   ＝ 步驟列裡灰色
   頁面上方的步驟列（bar）同時顯示全部步驟與「目前在第幾步」。

   🔴 這支**不判斷任何事情**：每一步做完了沒、目前是哪一步，一律由頁面用它既有的完成條件算好再交進來
      （量完、算完、寫入完成…）。這裡只負責畫。
   🔴 不改 common/done-step.js（i2c.html 也在用）：DG 三頁載入這一支之後，TCONDoneStep.set() 畫出的
      「✓ 步驟名稱」那一行改成綠色圓勾＋「已完成」；那一行的 textContent 不變（仍是「✓ 名稱」／「▾ 名稱」）。

   API（window.TCONStepStatus）
     lang()                         目前語言（common.js 的 currentLang → 存的 tcon-lang → zh-TW）
     txt(key, vars)                 本支自己的三語字串（stepOf／cur／done／allDone／barLabel）
     bar(el, steps)                 把步驟列畫進 el；steps ＝ [{ name, short, state:'done'|'cur'|'todo'|'skip'|'err' }]，
                                    空陣列或 null ⇒ el 整個不顯示
                                    skip ＝ 這顆 IC／這次不需要做（灰虛線圈「—」＋「不需要」），算進「全部完成」；
                                    err  ＝ 做了但沒成功（紅 ✕）。2026-10-23 nbdebug／i2c 加的，DG 三頁不用這兩種
     cur(box, info)                 info ＝ { no, total } ⇒ box 標成目前這一步（外框＋「第 N 步（共 M 步）」）；
                                    info ＝ null ⇒ 拿掉標記
     number(steps)                  依 steps 算出 { no, total, curIdx }（給 cur() 用；全部完成 ⇒ curIdx = -1）
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  var S = {
    stepOf:   { 'zh-TW': '第 {n} 步（共 {m} 步）', 'zh-CN': '第 {n} 步（共 {m} 步）', 'en': 'Step {n} of {m}' },
    cur:      { 'zh-TW': '目前這一步', 'zh-CN': '当前这一步', 'en': 'Current step' },
    done:     { 'zh-TW': '已完成', 'zh-CN': '已完成', 'en': 'Done' },
    skip:     { 'zh-TW': '不需要', 'zh-CN': '不需要', 'en': 'Not needed' },
    err:      { 'zh-TW': '沒有成功', 'zh-CN': '没有成功', 'en': 'Failed' },
    allDone:  { 'zh-TW': '全部 {m} 步已完成', 'zh-CN': '全部 {m} 步已完成', 'en': 'All {m} steps done' },
    barLabel: { 'zh-TW': '步驟進度', 'zh-CN': '步骤进度', 'en': 'Step progress' }
  };
  function lang() {
    var l = null;
    try { if (typeof currentLang === 'string') l = currentLang; } catch (e) {}
    if (!l) { try { l = localStorage.getItem('tcon-lang') || sessionStorage.getItem('tcon-lang'); } catch (e) {} }
    return (l === 'en' || l === 'zh-CN') ? l : 'zh-TW';
  }
  function txt(k, v) {
    var e = S[k], s = e ? (e[lang()] || e['zh-TW']) : k;
    if (v) Object.keys(v).forEach(function (n) { s = s.split('{' + n + '}').join(String(v[n])); });
    return s;
  }
  function number(steps) {
    var total = steps ? steps.length : 0, curIdx = -1, i;
    for (i = 0; i < total; i++) if (steps[i].state === 'cur') { curIdx = i; break; }
    return { no: curIdx + 1, total: total, curIdx: curIdx };
  }
  function bar(el, steps) {
    if (!el) return;
    var on = !!(steps && steps.length);
    el.classList.toggle('tc-sb-off', !on);
    if (!on) { el.innerHTML = ''; return; }
    var n = number(steps), allDone = steps.every(function (s) { return s.state === 'done' || s.state === 'skip'; });
    el.classList.add('tc-stepbar');
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', txt('barLabel'));
    var head = document.createElement('div'); head.className = 'tc-sb-head';
    var now = document.createElement('span'); now.className = 'tc-sb-now';
    var nm = document.createElement('span'); nm.className = 'tc-sb-name';
    if (n.curIdx >= 0) {
      now.textContent = txt('stepOf', { n: n.no, m: n.total });
      nm.textContent = steps[n.curIdx].name || '';
    } else if (allDone) {
      now.textContent = '✓ ' + txt('allDone', { m: n.total });
      el.classList.add('tc-sb-alldone');
    }
    el.classList.toggle('tc-sb-alldone', n.curIdx < 0 && allDone);
    head.appendChild(now); if (nm.textContent) head.appendChild(nm);
    var ol = document.createElement('ol'); ol.className = 'tc-sb-list';
    steps.forEach(function (s, i) {
      var li = document.createElement('li');
      li.className = 'tc-sb-i tc-sb-' + s.state;
      li.title = (i + 1) + '. ' + (s.name || '') + ' — ' + (s.state === 'done' ? txt('done') : s.state === 'cur' ? txt('cur') : s.state === 'skip' ? txt('skip') : s.state === 'err' ? txt('err') : '');
      var dot = document.createElement('span'); dot.className = 'tc-sb-dot';
      dot.textContent = s.state === 'done' ? '✓' : s.state === 'skip' ? '—' : s.state === 'err' ? '✕' : String(i + 1);
      var sh = document.createElement('span'); sh.className = 'tc-sb-short';
      sh.textContent = s.short || s.name || '';
      li.appendChild(dot); li.appendChild(sh);
      if (s.state === 'cur') li.setAttribute('aria-current', 'step');
      ol.appendChild(li);
    });
    el.innerHTML = '';
    el.appendChild(head); el.appendChild(ol);
  }
  function cur(box, info) {
    if (!box) return;
    var hd = null, i;
    for (i = 0; i < box.children.length; i++) if (box.children[i].classList.contains('card-header')) { hd = box.children[i]; break; }
    var host = hd || box, tag = null;
    for (i = 0; i < host.children.length; i++) if (host.children[i].classList.contains('tc-cur-tag')) { tag = host.children[i]; break; }
    var on = !!(info && info.no > 0);
    box.classList.toggle('tc-step-cur', on);
    if (!on) { if (tag) tag.parentNode.removeChild(tag); return; }
    if (!tag) {
      tag = document.createElement('div');
      tag.className = 'tc-cur-tag' + (hd ? ' tc-in-hd' : '');
      if (hd) hd.appendChild(tag);
      else {
        /* 放在「✓ 名稱」那一行（done-step 插在最前面）之後、其餘內容之前 */
        var ref = box.firstChild;
        while (ref && ref.nodeType === 1 && ref.classList.contains('tc-done-line')) ref = ref.nextSibling;
        box.insertBefore(tag, ref);
      }
    }
    tag.textContent = '▶ ' + txt('stepOf', { n: info.no, m: info.total }) + ' · ' + txt('cur');
  }
  /* done-step.js 畫出的「✓ 名稱」那一行：拆成綠色圓勾＋名稱，掛上「已完成」字樣（CSS ::after）。textContent 不變。 */
  function decorate(ln) {
    if (!ln) return ln;
    var t = String(ln.textContent || ''), ico = t.charAt(0), rest = t.slice(1);
    if (ico !== '✓' && ico !== '▾') return ln;
    ln.innerHTML = '';
    var a = document.createElement('span'); a.className = 'tc-done-ico'; a.textContent = ico;
    a.setAttribute('aria-hidden', 'true');
    var b = document.createElement('span'); b.className = 'tc-done-txt'; b.textContent = rest;
    ln.appendChild(a); ln.appendChild(b);
    ln.setAttribute('data-tc-done', txt('done'));
    return ln;
  }
  function hookDoneStep() {
    var D = window.TCONDoneStep;
    if (!D || D.__tcStepStatus) return;
    var orig = D.set;
    D.set = function (box, opt) { return decorate(orig.call(D, box, opt)); };
    D.__tcStepStatus = true;
  }
  hookDoneStep();
  window.TCONStepStatus = { lang: lang, txt: txt, bar: bar, cur: cur, number: number, decorate: decorate, hookDoneStep: hookDoneStep };
})();
