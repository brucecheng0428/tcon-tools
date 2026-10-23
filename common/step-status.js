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
     refresh()                      重新量一次固定位置（頁面自己改了頂端標題列高度時可呼叫；捲動／縮放時自動做）
   2026-10-23 第二版：bar() 畫的步驟列一律固定在最上方、捲動後縮成一行（見檔尾 sticky()）。
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  var S = {
    stepOf:   { 'zh-TW': '第 {n} 步（共 {m} 步）', 'zh-CN': '第 {n} 步（共 {m} 步）', 'en': 'Step {n} of {m}' },
    cur:      { 'zh-TW': '目前這一步', 'zh-CN': '当前这一步', 'en': 'Current step' },
    done:     { 'zh-TW': '已完成', 'zh-CN': '已完成', 'en': 'Done' },
    skip:     { 'zh-TW': '不需要', 'zh-CN': '不需要', 'en': 'Not needed' },
    err:      { 'zh-TW': '沒有成功', 'zh-CN': '没有成功', 'en': 'Failed' },
    allDone:  { 'zh-TW': '全部 {m} 步已完成', 'zh-CN': '全部 {m} 步已完成', 'en': 'All {m} steps done' },
    barLabel: { 'zh-TW': '步驟進度', 'zh-CN': '步骤进度', 'en': 'Step progress' },
    miniOf:   { 'zh-TW': '第 {n} 步／共 {m} 步', 'zh-CN': '第 {n} 步／共 {m} 步', 'en': 'Step {n}/{m}' },
    expand:   { 'zh-TW': '展開', 'zh-CN': '展开', 'en': 'Show' },
    collapse: { 'zh-TW': '收起', 'zh-CN': '收起', 'en': 'Hide' }
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
    if (!on) { el.innerHTML = ''; sticky(el); return; }
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
    /* 縮成一行版（捲動後固定在頂端時才顯示；CSS 控制）：「第 N 步／共 M 步 · 名稱  ✓✓●○○○  ▾ 展開」 */
    var mini = document.createElement('button'); mini.type = 'button'; mini.className = 'tc-sb-mini-line';
    var mN = document.createElement('span'); mN.className = 'tc-sbm-now';
    var mT = document.createElement('span'); mT.className = 'tc-sbm-name';
    if (n.curIdx >= 0) { mN.textContent = txt('miniOf', { n: n.no, m: n.total }); mT.textContent = '· ' + (steps[n.curIdx].name || ''); }
    else if (allDone) mN.textContent = '✓ ' + txt('allDone', { m: n.total });
    var mD = document.createElement('span'); mD.className = 'tc-sbm-dots'; mD.setAttribute('aria-hidden', 'true');
    steps.forEach(function (s) {
      var d = document.createElement('span'); d.className = 'tc-sbm-d tc-sbm-' + s.state;
      d.textContent = s.state === 'done' ? '✓' : s.state === 'cur' ? '●' : s.state === 'skip' ? '–' : s.state === 'err' ? '✕' : '○';
      mD.appendChild(d);
    });
    var mG = document.createElement('span'); mG.className = 'tc-sbm-tg';
    mini.appendChild(mN); mini.appendChild(mT); mini.appendChild(mD); mini.appendChild(mG);
    el.innerHTML = '';
    el.appendChild(mini); el.appendChild(head); el.appendChild(ol);
    sticky(el);
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

  /* ═══ 2026-10-23（第二版）：步驟列固定在最上方＋捲動後縮成一行（Bruce：「固定在最上方…不管操作到哪裡都看得到它」，
     「進度條依你建議」＝固定在最上方、捲動後縮成一行、點擊展開）。用到 bar() 的頁面全部自動生效，頁面不用改。
     · 頁面往下捲、步驟列碰到頂端 ⇒ 停在頂端（position: sticky），同時縮成一行：
         「第 3 步／共 6 步 · 名稱  ✓✓●○○○  ▾ 展開」；點一下展開完整步驟列，再點一下收回。捲回頁首自動恢復完整版。
     · 頁面本來就有固定在頂端的標題列（.header／.hdr／DG 的輪次橫幅 .dg-round-bar／LA 引導視窗的標題列，或頁面自己標
       data-tc-sb-above 的元素）⇒ 步驟列接在它們下面（top＝它們的 top＋高度取最大），不互相遮擋。
       量的是「同一個捲動容器」裡、排在步驟列前面的那幾個；彈出視窗（LA 引導）裡的步驟列只看該視窗自己的標題列。
     · 縮成一行／點開時用 margin-bottom 補差，佔的版面高度維持原本完整版 ⇒ 下面的內容與捲動位置不會跳。
     · 不蓋住輸入框／按鈕：焦點移到被步驟列擋住的元素 ⇒ 自動往下捲讓它露出來；捲動容器加 scroll-padding-top；
       手機鍵盤跳出（visualViewport 變矮）⇒ 展開的步驟列自動收回成一行。
       對話框（position: fixed 的遮罩，z-index ≥ 90）本來就疊在步驟列（z-index 18）上面。
     · 不固定的情況：步驟列本身就在 position: fixed 的區塊裡（dg-measure 底部提示區，原本就一直看得到）、
       或頁面在元素上標 data-tc-sticky="off"。
     🔴 這段只管「擺在哪裡、縮不縮」，不判斷步驟狀態（狀態照舊由頁面算好交給 bar()）。 */
  var SBS = [], OPEN = {}, TOPSEL = '.header, .hdr, .dg-round-bar, .wfg-la-guide-head, [data-tc-sb-above]';
  function scrollerOf(el) {
    var sc = null;
    for (var p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      var c = getComputedStyle(p);
      if (c.position === 'fixed' && !sc) return 'fixed';
      if (!sc && /(auto|scroll|overlay)/.test(c.overflowY)) sc = p;
    }
    return sc;
  }
  /* getComputedStyle 在某些環境（jsdom 測試）很慢，bar() 又常被呼叫 ⇒ 每個元素的捲動容器只算一次 */
  var SCC = typeof WeakMap === 'function' ? new WeakMap() : null;
  function scOfCached(el) {
    if (!SCC) return scrollerOf(el);
    if (!SCC.has(el)) SCC.set(el, scrollerOf(el));
    return SCC.get(el);
  }
  function scTop(sc) { return sc ? sc.scrollTop : (window.pageYOffset || document.documentElement.scrollTop || 0); }
  function scEdge(sc) { return sc ? sc.getBoundingClientRect().top + sc.clientTop : 0; }
  function topOff(el, sc) {
    var off = 0, root = sc || document;
    Array.prototype.forEach.call(root.querySelectorAll(TOPSEL), function (h) {
      if (h === el || h.contains(el) || el.contains(h)) return;
      if (!(h.compareDocumentPosition(el) & 4)) return;              // 排在步驟列前面的才算
      if (!h.getClientRects().length) return;                         // 看不到的（display:none）不算
      var c = getComputedStyle(h);
      if (c.position !== 'sticky' && !(c.position === 'fixed' && !sc)) return;
      if (c.position === 'sticky' && scOfCached(h) !== sc) return;    // 別的捲動容器（例：彈出視窗）裡的不算
      var t = parseFloat(c.top); if (isNaN(t)) return;
      off = Math.max(off, t + h.getBoundingClientRect().height);
    });
    return Math.round(off);
  }
  function stOf(el) {
    for (var i = 0; i < SBS.length; i++) if (SBS[i].el === el) return SBS[i];
    var st = { el: el, sc: null, off: false, comp: 0 };
    SBS.push(st);
    el.addEventListener('click', function () {
      if (!el.classList.contains('tc-sb-mini')) return;
      setOpen(st, !el.classList.contains('tc-sb-open'));
    });
    return st;
  }
  function key(st) { return st.el.id || '_'; }
  function syncMiniBtn(st) {
    var b = st.el.querySelector('.tc-sb-mini-line'), open = st.el.classList.contains('tc-sb-open');
    if (!b) return;
    b.setAttribute('aria-expanded', open ? 'true' : 'false');
    var tg = b.querySelector('.tc-sbm-tg');
    if (tg) tg.innerHTML = '<span aria-hidden="true">' + (open ? '▴' : '▾') + '</span><span class="tc-sbm-tgt"> ' + txt(open ? 'collapse' : 'expand') + '</span>';
  }
  /* 高度一律用「看不見的複製品」量（position:absolute，不佔版面）：直接切換 class 再讀高度，會在中途觸發瀏覽器的
     捲動錨定（scroll anchoring）把頁面往上拉（實測 dg 390 寬：點開再收回時整頁跳回頁首）。 */
  function hOf(el, mini, open) {
    var c = el.cloneNode(true);
    c.removeAttribute('id'); c.removeAttribute('aria-label'); c.setAttribute('aria-hidden', 'true');
    c.classList.remove('tc-sb-mini', 'tc-sb-open', 'tc-sb-stuck');
    if (mini) { c.classList.add('tc-sb-mini'); c.classList.add('tc-sb-stuck'); }
    if (open) c.classList.add('tc-sb-open');
    c.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;left:0;top:0;margin:0;width:' + el.getBoundingClientRect().width + 'px';
    el.parentNode.appendChild(c);
    var h = c.getBoundingClientRect().height;
    el.parentNode.removeChild(c);
    return h;
  }
  /* 固定在頂端時，不論縮成一行（較矮）或點開（多一行、較高），佔的版面高度一律＝原本完整版的高度：
     用 margin-bottom 補差（點開時是負值，多出來的那一行疊在下面的內容上）⇒ 下面的內容與捲動位置都不會跳。
     先量好、再一次改 class＋margin（中間不讀版面）。 */
  function setState(st, mini, open) {
    var el = st.el;
    var full = 0, now = 0;
    if (mini) { full = hOf(el, false, false); now = hOf(el, true, open); }
    var inl = el.style.marginBottom; el.style.marginBottom = '';
    var mb = parseFloat(getComputedStyle(el).marginBottom) || 0;   // 只算樣式、不排版
    el.style.marginBottom = inl;
    el.classList.toggle('tc-sb-mini', !!mini);
    el.classList.toggle('tc-sb-open', !!(mini && open));
    st.comp = mini ? full - now : 0;
    el.style.marginBottom = st.comp ? (mb + st.comp) + 'px' : '';
    syncMiniBtn(st);
  }
  function setOpen(st, on) {
    OPEN[key(st)] = !!on;
    setState(st, true, !!on); pad(st);
  }
  /* 有固定步驟列的捲動容器關掉瀏覽器的捲動錨定（overflow-anchor: none）：步驟列在頂端切換「一行／展開」時，
     Chrome 的捲動錨定會把頁面整個拉回頁首（實測 dg 390 寬，就算版面高度補到不變也一樣）；關掉後只差 ≤ 2px。
     頁面自己有設 overflow-anchor 的就不動；步驟列不用了（隱藏／移除）就還原。 */
  function anchor(st, on) {
    var host = st.sc || document.documentElement;
    if (host.__tcSbOaOwn === undefined) host.__tcSbOaOwn = !host.style.overflowAnchor;
    if (!host.__tcSbOaOwn) return;
    if (!on && SBS.some(function (o) { return o !== st && o.el.isConnected && (o.sc || document.documentElement) === host && o.el.classList.contains('tc-sb-sticky') && !o.el.classList.contains('tc-sb-off'); })) return;
    host.style.overflowAnchor = on ? 'none' : '';
  }
  function pad(st) {   // 捲動容器的 scroll-padding-top：焦點／scrollIntoView 停在步驟列下面
    var host = st.sc || document.documentElement;
    if (host.__tcSbPadOwn === undefined) host.__tcSbPadOwn = !host.style.scrollPaddingTop && getComputedStyle(host).scrollPaddingTop === 'auto';
    if (!host.__tcSbPadOwn) return;
    var on = st.el.isConnected && st.el.classList.contains('tc-sb-stuck');
    if (!on && !host.style.scrollPaddingTop) return;
    host.style.scrollPaddingTop = on ? Math.round(st.el.getBoundingClientRect().bottom - scEdge(st.sc) + 8) + 'px' : '';
  }
  function update(st) {
    var el = st.el;
    if (!el.isConnected || el.classList.contains('tc-sb-off') || st.off) {
      el.classList.remove('tc-sb-stuck', 'tc-sb-mini', 'tc-sb-open'); el.style.marginBottom = ''; st.comp = 0; pad(st); anchor(st, false); return;
    }
    var was0 = el.classList.contains('tc-sb-mini');
    if (!was0 && scTop(st.sc) <= 2) { el.classList.remove('tc-sb-stuck'); pad(st); return; }   // 在頁首：一定沒固定，不用量
    var off = topOff(el, st.sc);
    if (el.style.top !== off + 'px') el.style.top = off + 'px';
    var r = el.getBoundingClientRect(), edge = scEdge(st.sc) + off;
    var stuck = scTop(st.sc) > 2 && r.top <= edge + 1.5;
    var was = el.classList.contains('tc-sb-mini');
    if (stuck && !was) { el.classList.add('tc-sb-stuck'); setState(st, true, !!OPEN[key(st)] && !kbOpen()); }
    else if (!stuck && was) { OPEN[key(st)] = false; el.classList.remove('tc-sb-stuck'); setState(st, false, false); }
    else el.classList.toggle('tc-sb-stuck', stuck);
    pad(st);
  }
  function sticky(el) {
    var st = stOf(el);
    st.sc = scOfCached(el);
    st.off = st.sc === 'fixed' || el.getAttribute('data-tc-sticky') === 'off';
    if (st.sc === 'fixed') st.sc = null;
    el.classList.toggle('tc-sb-sticky', !st.off);
    if (!st.off && !el.classList.contains('tc-sb-off')) anchor(st, true);
    if (el.classList.contains('tc-sb-mini')) setState(st, true, !!OPEN[key(st)]);   // 內容重畫過 ⇒ 重量高度
    else syncMiniBtn(st);
    update(st);
  }
  var raf = 0;
  function all() {
    raf = 0;
    SBS = SBS.filter(function (st) { if (st.el.isConnected) return true; update(st); return false; });
    SBS.forEach(update);
  }
  function soon() { if (!raf) raf = (window.requestAnimationFrame || setTimeout)(all); }
  var vvMax = 0;
  function kbOpen() {   // 手機鍵盤跳出：可視高度比看過的最大值少 25% 以上
    var vv = window.visualViewport; if (!vv) return false;
    vvMax = Math.max(vvMax, vv.height);
    return vv.height < vvMax * 0.75;
  }
  function guard(t) {   // 焦點移到被步驟列擋住的元素 ⇒ 往下捲讓它露出來
    if (!t || t.nodeType !== 1 || !t.getBoundingClientRect) return;
    SBS.forEach(function (st) {
      var el = st.el;
      if (!el.isConnected || !el.classList.contains('tc-sb-stuck') || el.contains(t)) return;
      var sc = scrollerOf(t); if (sc === 'fixed' || sc !== st.sc) return;
      var b = el.getBoundingClientRect().bottom, r = t.getBoundingClientRect();
      if (r.height && r.top < b + 4 && r.bottom > scEdge(st.sc)) {
        var d = Math.ceil(b + 8 - r.top);
        if (st.sc) st.sc.scrollTop -= d; else window.scrollBy(0, -d);
      }
    });
  }
  if (typeof document !== 'undefined' && !window.__tcSbWired) {
    window.__tcSbWired = true;
    document.addEventListener('scroll', soon, true);
    window.addEventListener('resize', soon);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', function () {
      if (kbOpen()) SBS.forEach(function (st) { if (st.el.classList.contains('tc-sb-open') && st.el.classList.contains('tc-sb-mini')) setState(st, true, false); });
      soon();
    });
    document.addEventListener('focusin', function (e) {
      var t = e.target; setTimeout(function () { guard(t); }, 0); setTimeout(function () { guard(t); }, 400);
    }, true);
  }

  hookDoneStep();
  window.TCONStepStatus = { lang: lang, txt: txt, bar: bar, cur: cur, number: number, decorate: decorate, hookDoneStep: hookDoneStep,
    refresh: soon, topOffset: topOff };
})();
