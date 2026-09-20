/* ═══════════════════════════════════════════════════════════════════════════
   i2c_v1221_probe.js — v1.22.1 那五項改動的**真實瀏覽器**驗收

     ① 快照鈕寫「快照 A」，tooltip 講到會清空 B，行為與前版相同
     ② 連線／中斷合併成一顆開關（灰／綠、忙碌中不能點、主動中斷不自動重連）
     ③ 按鈕與說明字級放大，但 A／B 的**檔名維持原大小**，且版面沒有溢出
     ④ 差異清單的固定標頭（Data A 藍／Data B 紫、捲動不動、各種 offset 寬度都對齊）
     ⑤ 點差異列 ⇒ 十字＋頁面＋左上角輸入框三者一起到位，且值不被改動

   🔴 為什麼不能用 jsdom：這五項全部是「畫面上量得到的東西」——
      getComputedStyle 的字級、getBoundingClientRect 的欄位邊緣、捲動後的 top。
      jsdom 不做排版（rect 全回 0），這些在它裡面**永遠是綠的**。

   🔴 自帶假 I2C Bridge（抄 tools/i2c_timeline_diff_probe.js 那一份）：
      連線狀態要能真的從「未連線」走到「已連線」，否則第 ② 項只驗得到一半。

   用法：tools/ui_probe.sh i2c.html tools/i2c_v1221_probe.js
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  const R = [];
  const ok = (name, cond, extra) => R.push({ name, pass: !!cond, extra: extra === undefined ? '' : String(extra) });
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const ERRS = [];
  window.confirm = function () { return true; };
  window.addEventListener('error', (e) => ERRS.push('error: ' + (e.message || '') + ' @' + (e.lineno || '')));
  window.addEventListener('unhandledrejection', (e) => ERRS.push('rejection: ' + ((e.reason && (e.reason.message || e.reason)) || '')));

  /* ═══ 假 I2C Bridge（必須在頁面自動連線之前換掉 window.WebSocket）═══════════ */
  const MEM = new Map();
  const key = (s, a) => s * 0x100000 + a;
  [0xA1, 0xD8, 0xFB].forEach((b, i) => MEM.set(key(0x68, i), b));   /* 讓自動自檢過 */
  class MockWS {
    constructor() { this.readyState = 0; setTimeout(() => { this.readyState = 1; if (this.onopen) this.onopen(); }, 0); }
    send(txt) {
      const m = JSON.parse(txt);
      let rep = { ok: true };
      if (m.type === 'ping') rep = { helper: '1.16.0', proto: 5, ok: true };
      else if (m.type === 'open') rep = { ok: true, channels: 1 };
      else if (m.type === 'rawwrite') { (m.data || []).forEach((b, i) => MEM.set(key(m.slave, m.addr + i), b & 0xFF)); rep = { ok: true, us: 300 }; }
      else if (m.type === 'read') {
        const d = [];
        for (let i = 0; i < m.len; i++) { const v = MEM.get(key(m.slave, m.addr + i)); d.push(v === undefined ? 0xFF : v); }
        rep = { ok: true, data: d, us: 200, usbrt: 1 };
      }
      setTimeout(() => { if (this.onmessage) this.onmessage({ data: JSON.stringify(Object.assign({ id: m.id, type: 'result' }, rep)) }); }, 0);
    }
    close() { this.readyState = 3; if (this.onclose) this.onclose(); }
  }
  window.WebSocket = MockWS;

  const $ = (id) => document.getElementById(id);
  const cs = (el, p) => getComputedStyle(el)[p];
  const rc = (el) => el.getBoundingClientRect();
  const r2 = (n) => Math.round(n * 100) / 100;

  (async function () {
    let A = null;
    for (let i = 0; i < 100 && !A; i++) { A = window.__i2ct; if (!A) await sleep(50); }
    if (!A) { document.title = 'UIPROBE' + JSON.stringify([{ name: '等不到 __i2ct', pass: false, extra: '' }]); return; }
    for (let i = 0; i < 100 && document.readyState !== 'complete'; i++) await sleep(50);
    for (let i = 0; i < 60 && !document.querySelector('#dump td'); i++) await sleep(50);
    const quiesce = async () => { for (let i = 0; i < 400 && A.state().busy; i++) await sleep(10); };
    await sleep(300); await quiesce();

    /* ═══════════════════════════════════════════════════════════════════════
       ① 快照 A
       ═════════════════════════════════════════════════════════════════════ */
    {
      const b = $('btn-snap');
      ok('1a 快照鈕的文字是「快照 A」', b.textContent.trim() === '快照 A', b.textContent.trim());
      const t = b.getAttribute('title') || '';
      ok('1b tooltip 講到會清空 B', /B/.test(t) && t.indexOf('清空') >= 0, t);
      ok('1c tooltip 也講了它是在做什麼（存成 A 當基準）', t.indexOf('A') >= 0 && t.indexOf('基準') >= 0, t);
    }

    /* ═══════════════════════════════════════════════════════════════════════
       ② 連線開關
       ═════════════════════════════════════════════════════════════════════ */
    {
      ok('2a 舊的兩顆按鈕都不在了（btn-conn / btn-disc）', !$('btn-conn') && !$('btn-disc'),
         'conn=' + !!$('btn-conn') + ' disc=' + !!$('btn-disc'));
      const lb = $('btn-link');
      ok('2b 新的開關存在', !!lb);
      /* 自動連線（假 bridge）⇒ 這時候應該已經是已連線 */
      ok('2c 已連線 ⇒ aria-pressed=true、文字「已連線」', A.state().linked === true
         && lb.getAttribute('aria-pressed') === 'true' && lb.textContent.trim() === '已連線',
         'linked=' + A.state().linked + ' pressed=' + lb.getAttribute('aria-pressed') + ' text=' + lb.textContent.trim());
      const onBg = cs(lb, 'backgroundColor');
      ok('2d 已連線 ⇒ 底色是綠的', onBg === 'rgb(22, 163, 74)', onBg);
      ok('2e 已連線 ⇒ tooltip 保留舊「中斷」的語意（會釋放治具給別的程式用）',
         (lb.title || '').indexOf('釋放') >= 0 && (lb.title || '').indexOf('中斷') >= 0, lb.title);

      /* 忙碌中不能點：不 await，趁 busy 時量 */
      const p = A.doRead();
      await sleep(5);
      const busyNow = A.state().busy;
      ok('2f 忙碌中按鈕被 disabled 擋住', busyNow ? (lb.disabled === true) : true,
         'busy=' + busyNow + ' disabled=' + lb.disabled);
      try { await p; } catch (e) {}
      await quiesce();

      /* 使用者主動中斷 ⇒ 灰、文字「連線」、而且**不自動重連** */
      lb.click();
      await sleep(120); await quiesce();
      const offBg = cs(lb, 'backgroundColor');
      ok('2g 按一下 ⇒ 中斷；aria-pressed=false、文字「連線」', A.state().linked === false
         && lb.getAttribute('aria-pressed') === 'false' && lb.textContent.trim() === '連線',
         'linked=' + A.state().linked + ' pressed=' + lb.getAttribute('aria-pressed') + ' text=' + lb.textContent.trim());
      ok('2h 未連線 ⇒ 底色是灰的（不是綠、也不是原本的藍）', offBg === 'rgb(51, 65, 85)', offBg);
      ok('2i 未連線 ⇒ 按鈕仍可點（不再像舊版那樣灰掉一半）', lb.disabled === false, 'disabled=' + lb.disabled);
      /* 第一次自動重試的退避是 1000ms ⇒ 等 2.4 秒足以抓到誤重連 */
      await sleep(2400);
      ok('2j 🔴 主動中斷後**不會自動重連**（等 2.4 秒，第一次退避是 1 秒）',
         A.state().linked === false, 'linked=' + A.state().linked);
      /* 再按一次 ⇒ 連回來（開關兩個方向都通） */
      lb.click();
      await sleep(200); await quiesce();
      ok('2k 再按一次 ⇒ 連回來（綠、「已連線」）', A.state().linked === true
         && lb.getAttribute('aria-pressed') === 'true' && cs(lb, 'backgroundColor') === 'rgb(22, 163, 74)',
         'linked=' + A.state().linked + ' bg=' + cs(lb, 'backgroundColor'));
    }

    /* ═══════════════════════════════════════════════════════════════════════
       ③ 字級與版面
       ═════════════════════════════════════════════════════════════════════ */
    /* 先弄出 A／B 兩份資料，檔名那兩列才量得到 */
    const mk = (n, f) => new Uint8Array(Array.from({ length: n }, (_, i) => f(i)));
    A.setInputs({ slave: '0x50', awid: 2, off: '0x0000', len: '512' });
    A.abPickAuto('auto');
    A.loadFile('probe_a.bin', mk(512, i => i & 0xFF)); await sleep(90);
    A.loadFile('probe_b.bin', mk(512, i => (i === 0x123 ? 0x5A : (i & 0xFF)))); await sleep(120);

    {
      ok('3a 按鈕字級 ＝ 14px（原 12.5）', cs($('btn-read'), 'fontSize') === '14px', cs($('btn-read'), 'fontSize'));
      ok('3b 說明小字（.hint）字級 ＝ 12px（原 10.5）', cs($('lenhint'), 'fontSize') === '12px', cs($('lenhint'), 'fontSize'));
      ok('3c 欄位標籤字級 ＝ 12.5px（原 11）', cs($('offlabel'), 'fontSize') === '12.5px', cs($('offlabel'), 'fontSize'));
      const who = document.querySelector('.abrow .who');
      ok('3d 🔴 A／B 的**檔名維持 14px**（他明講不要動）', who && cs(who, 'fontSize') === '14px', who && cs(who, 'fontSize'));
      const len = document.querySelector('.abrow .len');
      ok('3e 🔴 檔名那一列的長度字也維持 12.5px', len && cs(len, 'fontSize') === '12.5px', len && cs(len, 'fontSize'));

      /* 說明小字不可以被裁掉（放大之後最容易發生的事）。
         🔴 已知例外只有兩個，而且它們在 **HEAD（v1.22.0、10.5px）就已經被裁掉** ——
            實測 #twrhint +236px、#findeg +48px（tools/_tmp_measure_probe.js 量的）。
            這兩行的文字本身就遠長於欄寬，不是字級造成的；放大讓它更糟（+287／+80），
            所以 v1.22.1 一律把完整內容掛到 title（i2ctHintTips）⇒ 滑過看得到。
            這裡**不是放寬判準**：名單是列舉式白名單，多出第三個就會 FAIL，
            而且白名單裡的每一個都另外要求「必須有完整內容的 title」。 */
      const KNOWN_CUT = ['twrhint', 'findeg'];
      const cutAll = Array.from(document.querySelectorAll('.hint'))
        .filter(h => h.offsetParent !== null && h.textContent.trim() && h.textContent.trim() !== ' ')
        .map(h => ({ id: h.id || '(no id)', over: h.scrollWidth - h.clientWidth,
                     tip: (h.getAttribute('title') || '') === h.textContent.trim() }))
        .filter(x => x.over > 1);
      const cut = cutAll.filter(x => KNOWN_CUT.indexOf(x.id) < 0);
      ok('3f 🔴 除了 HEAD 就已經裁掉的那兩行，沒有**新增**被裁掉的說明小字', cut.length === 0,
         '新增裁切：' + (cut.map(x => x.id + ' +' + x.over + 'px').join(', ') || '(無)')
         + '｜既有：' + (cutAll.filter(x => KNOWN_CUT.indexOf(x.id) >= 0).map(x => x.id + ' +' + x.over).join(', ') || '(無)'));
      const noTip = cutAll.filter(x => !x.tip);
      ok('3f2 🔴 被裁掉的說明小字都有完整內容的 title（滑過看得到）', noTip.length === 0,
         noTip.map(x => x.id).join(', ') || '全部都有');
      const tipAll = Array.from(document.querySelectorAll('.hint'))
        .filter(h => h.textContent.trim() && h.textContent.trim() !== ' ');
      ok('3f3 每一行有字的說明小字都掛了 title（不只被裁的那幾行）',
         tipAll.length > 0 && tipAll.every(h => (h.getAttribute('title') || '') === h.textContent.trim()),
         'n=' + tipAll.length + ' 缺：' + (tipAll.filter(h => (h.getAttribute('title') || '') !== h.textContent.trim()).map(h => h.id).join(', ') || '(無)'));

      /* 欄位標籤也不可以被裁掉 */
      const cutL = Array.from(document.querySelectorAll('label.f > span:first-child, .f > span:first-child'))
        .filter(s => s.offsetParent !== null && s.textContent.trim() && s.textContent.trim() !== ' ')
        .map(s => ({ t: s.textContent.trim().slice(0, 10), over: s.scrollWidth - s.clientWidth }))
        .filter(x => x.over > 1);
      ok('3g 🔴 沒有任何欄位標籤被裁掉', cutL.length === 0, cutL.map(x => x.t + ' +' + x.over + 'px').join(', '));

      /* 下拉選單的字不可以被裁掉（Page 大小那一格最長） */
      const wp = $('wr-page');
      ok('3h 🔴 「Page 大小」下拉放得下最長的選項', wp.scrollWidth - wp.clientWidth <= 1,
         'scroll=' + wp.scrollWidth + ' client=' + wp.clientWidth);

      /* 同一列的控制項仍然同高同頂（v1.22.0 訂的版面判準，字級改了不得破） */
      const rowsSel = Array.from(document.querySelectorAll('.card .row')).filter(r => r.querySelector('label.f'));
      let bad = [];
      rowsSel.forEach((row, ri) => {
        const ctl = Array.from(row.querySelectorAll('input[type=text], select, button, .chips'))
          .filter(el => !(el.closest('.chips') && !el.classList.contains('chips')))
          .filter(el => el.offsetParent !== null && cs(el, 'display') !== 'none')
          .filter(el => !el.closest('.dbgonly'))
          /* 🔴 `#ab-sel`（.absel）排除：它的 28px 是**刻意**比一般控制項更緊的
             （CSS 註解：「視覺重量接近一顆小標籤」），而且拿 HEAD v1.22.0 量到的
             也是同一組數字（row2/line1 Δtop=1 Δh=2）⇒ 既有的設計選擇，不是本版弄壞的。
             排除的是「已知且刻意的例外」，其他控制項的判準一個 px 都沒放寬。 */
          .filter(el => !el.classList.contains('absel'))
          .map(el => ({ id: el.id || el.className, top: r2(rc(el).top), h: r2(rc(el).height) }));
        /* 視窗窄時 .row 會換行 ⇒ 依 top 分視覺行，只在行內比 */
        const lines = [];
        ctl.forEach(x => { const l = lines.find(l => Math.abs(l[0].top - x.top) < 2); if (l) l.push(x); else lines.push([x]); });
        lines.forEach(l => {
          const tops = l.map(x => x.top), hs = l.map(x => x.h);
          const dt = Math.max(...tops) - Math.min(...tops), dh = Math.max(...hs) - Math.min(...hs);
          if (dt > 0.6 || dh > 0.6) bad.push('row' + ri + ' Δtop=' + r2(dt) + ' Δh=' + r2(dh)
            + ' [' + l.map(x => x.id + '@' + x.top + '/' + x.h).join(' ') + ']');
        });
      });
      ok('3i 🔴 同一視覺行的控制項仍然同高同頂（放大字級沒有把對齊弄壞）', bad.length === 0, bad.join(' ⏐ '));

      /* group card 的標籤不可以被外框壓到（grplab 9 → 10.5px） */
      const gl = document.querySelector('.grp > .grplab');
      const gp = gl && gl.parentNode;
      ok('3j group card 標籤仍在框線上、沒被內容壓到', gl && rc(gl).bottom <= rc(gp).top + parseFloat(cs(gp, 'paddingTop')) + 1.5,
         gl ? ('lab.bottom=' + r2(rc(gl).bottom) + ' grp.top+pad=' + r2(rc(gp).top + parseFloat(cs(gp, 'paddingTop')))) : 'n/a');

      /* 耗時紀錄的序號欄仍是 20px、欄位左緣沒跳掉（上一輪的成果不得退步） */
      const tb = document.querySelector('.timebox .trow');
      ok('3k 耗時紀錄的欄位樣板沒被動到（第一欄仍 20px）',
         !tb || cs(tb, 'gridTemplateColumns').split(' ')[0] === '20px',
         tb ? cs(tb, 'gridTemplateColumns') : '(還沒有紀錄)');
    }

    /* ═══════════════════════════════════════════════════════════════════════
       ④ 差異清單的固定標頭
       ═════════════════════════════════════════════════════════════════════ */
    {
      const hd = $('diffhd'), body = $('diffbody');
      ok('4a 有 1 處差異 ⇒ 標頭出現', A.diffCount() === 1 && hd && cs(hd, 'display') !== 'none',
         'n=' + A.diffCount() + ' display=' + (hd && cs(hd, 'display')));
      ok('4b 標頭在捲動容器 #diffbody **外面**（結構上捲不走）',
         hd && !body.contains(hd) && hd.nextElementSibling === body,
         hd ? ('inBody=' + body.contains(hd) + ' next=' + (hd.nextElementSibling && hd.nextElementSibling.id)) : 'n/a');
      ok('4c 標頭三欄的文字是 位址 / Data A / Data B',
         hd.querySelector('.a').textContent.trim() === '位址'
         && hd.querySelector('.o').textContent.trim() === 'Data A'
         && hd.querySelector('.n').textContent.trim() === 'Data B',
         hd.textContent);
      ok('4d Data A 是藍（與 .o 同色）、Data B 是紫（與 .n 同色）',
         cs(hd.querySelector('.o'), 'color') === 'rgb(125, 211, 252)'
         && cs(hd.querySelector('.n'), 'color') === 'rgb(240, 171, 252)',
         cs(hd.querySelector('.o'), 'color') + ' / ' + cs(hd.querySelector('.n'), 'color'));

      /* 各種 offset 寬度都要對齊（寫死空格數就會壞在這裡） */
      const alignAt = async (awid) => {
        A.setInputs({ slave: '0x50', awid: awid, off: '0x0000', len: '512' });
        A.abPickAuto('auto');
        A.loadFile('w' + awid + '_a.bin', mk(512, i => i & 0xFF)); await sleep(80);
        A.loadFile('w' + awid + '_b.bin', mk(512, i => (i === 0x123 ? 0x5A : (i & 0xFF)))); await sleep(110);
        const row = document.querySelector('#diffrows .diffrow');
        if (!row) return { awid, err: '沒有差異列（n=' + A.diffCount() + '）' };
        const g = (sel) => [rc(hd.querySelector(sel)), rc(row.querySelector(sel))];
        const [ha, ra] = g('.a'), [ho, ro] = g('.o'), [hn, rn] = g('.n');
        return { awid,
                 dA: r2(Math.abs(ha.left - ra.left)),
                 dO: r2(Math.abs(ho.right - ro.right)),
                 dN: r2(Math.abs(hn.left - rn.left)),
                 lbl: row.querySelector('.a').textContent,
                 dfaddr: cs(hd, 'gridTemplateColumns').split(' ')[0] };
      };
      for (const w of [0, 1, 2, 3, 4]) {
        const m = await alignAt(w);
        ok('4e-awid' + w + ' 🔴 標頭與資料列三欄對齊（位址左緣 / Data A 右緣 / Data B 左緣）',
           !m.err && m.dA < 0.6 && m.dO < 0.6 && m.dN < 0.6,
           m.err || ('位址列=' + m.lbl + ' 位址欄寬=' + m.dfaddr
                     + ' Δleft(位址)=' + m.dA + ' Δright(A)=' + m.dO + ' Δleft(B)=' + m.dN));
      }

      /* 多筆差異 ⇒ 捲動，標頭不動 */
      A.setInputs({ slave: '0x50', awid: 2, off: '0x0000', len: '512' });
      A.abPickAuto('auto');
      A.loadFile('many_a.bin', mk(512, i => i & 0xFF)); await sleep(80);
      A.loadFile('many_b.bin', mk(512, i => ((i & 0xFF) ^ 0xFF))); await sleep(140);
      const n = A.diffCount();
      const before = r2(rc(hd).top);
      body.scrollTop = 240;
      body.dispatchEvent(new Event('scroll'));
      await sleep(80);
      const after = r2(rc(hd).top);
      ok('4f 🔴 捲動差異清單 ⇒ 標頭的 top 一個 px 都沒動', before === after && body.scrollTop > 0,
         'n=' + n + ' scrollTop=' + body.scrollTop + ' top: ' + before + ' → ' + after);
      /* 捲動後仍然對齊（虛擬捲動會整批換掉 #diffrows 的內容） */
      {
        const row = document.querySelector('#diffrows .diffrow');
        const dO = r2(Math.abs(rc(hd.querySelector('.o')).right - rc(row.querySelector('.o')).right));
        const dN = r2(Math.abs(rc(hd.querySelector('.n')).left - rc(row.querySelector('.n')).left));
        ok('4g 捲動之後（重繪過的列）仍然對齊', dO < 0.6 && dN < 0.6, 'ΔA=' + dO + ' ΔB=' + dN);
      }
      /* 差異為 0 ⇒ 標頭收掉（不留孤零零一條） */
      $('btn-clrdiff').click(); await sleep(80);
      ok('4h 差異 0 ⇒ 標頭收掉（不留孤零零的標頭配空清單）',
         A.diffCount() === 0 && cs(hd, 'display') === 'none',
         'n=' + A.diffCount() + ' display=' + cs(hd, 'display'));
      $('btn-recmp').click(); await sleep(80);
      ok('4i 「重新比較」之後標頭回來', A.diffCount() > 0 && cs(hd, 'display') !== 'none',
         'n=' + A.diffCount() + ' display=' + cs(hd, 'display'));

      /* ═══ 🔴 v1.22.2 補做 A：差異卡下方的說明必須描述**這張卡**的行為 ═══════
         舊文案寫的是 dump 卡的操作（「點一格就能改值 → Enter 寫回」），而差異列
         的點擊自 v1.22.1 起只定位、不改值 ⇒ 那句話會讓人以為在這裡也能改值。
         判準訂成「不准出現『改值』以外還把它講成在這張卡做」很難機械化，所以拆兩條：
         ① 必須講到它真正做的事（跳到 dump／十字／位址）
         ② 不准出現會讓人以為**在這張卡按 Enter 就會寫進裝置**的字樣。 */
      const dcHints = Array.from($('diffcard').querySelectorAll('.hint'))
        .filter(h => h.offsetParent !== null).map(h => h.textContent.trim());
      const dcText = dcHints.join(' ');
      ok('4j 🔴 差異卡的說明描述的是**這張卡**的行為（跳位址／十字）',
         dcHints.length > 0 && /dump/i.test(dcText) && dcText.indexOf('十字') >= 0,
         JSON.stringify(dcHints));
      ok('4k 🔴 差異卡的說明不再暗示可以在這裡改值（不得出現「可直接改值」「Enter 寫回」）',
         dcText.indexOf('可直接改值') < 0 && dcText.indexOf('Enter 寫回') < 0,
         dcText);

      /* ═══ 🔴 v1.22.2 補做 B：畫面上的顏色圖例只准有一份 ════════════════════
         舊版在 diff 卡下方有第二份 `.legend dbgonly`，其中「寫入過」指向 v1.20.2
         就刪掉的顏色。`check_legend_items.js` 只看 `#celllegend`，看不到它 ⇒
         這一條在**真的 DOM 上**再釘一次，含 debug 模式打開的情況
         （dbgonly 平常不顯示，所以只看「看得見的元素」會漏掉它）。 */
      ok('4l 🔴 DOM 裡只有一份顏色圖例（#celllegend），沒有第二份 .legend',
         document.querySelectorAll('.legend').length === 0
         && document.querySelectorAll('#celllegend').length === 1,
         '.legend=' + document.querySelectorAll('.legend').length
         + ' #celllegend=' + document.querySelectorAll('#celllegend').length);
      {
        /* debug 模式打開 ⇒ dbgonly 全部現形，再確認一次沒有漏網的第二份圖例 */
        A.setDebug(true); await sleep(60);
        const dbgLegend = document.querySelectorAll('.legend').length;
        const stale = Array.from(document.querySelectorAll('#diffcard span'))
          .filter(sp => /寫入過/.test(sp.textContent || '')).length;
        A.setDebug(false); await sleep(40);
        ok('4m 🔴 連 debug 模式打開都沒有第二份圖例、也沒有「寫入過」這個過時項目',
           dbgLegend === 0 && stale === 0, '.legend=' + dbgLegend + ' 過時項目=' + stale);
      }

      /* ═══ 🔴 v1.22.2 補做 C：「操作紀錄」════════════════════════════════════ */
      {
        const h2s = Array.from(document.querySelectorAll('.card h2')).map(h => h.textContent.trim());
        ok('4n 🔴 log 卡的標題是「操作紀錄」，畫面上不再有 transaction 的中文直譯',
           h2s.indexOf('操作紀錄') >= 0 && !h2s.some(t => t.indexOf('交易') >= 0),
           JSON.stringify(h2s));
        const logTxt = ($('log') || {}).textContent || '';
        ok('4o 🔴 操作紀錄裡的就緒訊息也改掉了（不得出現「每一筆交易」）',
           logTxt.indexOf('每一筆交易') < 0 && logTxt.indexOf('每一筆讀寫都記在這裡') >= 0,
           logTxt.slice(0, 80));
      }
    }

    /* ═══════════════════════════════════════════════════════════════════════
       ⑤ 點差異列 ⇒ 十字 ＋ 頁面 ＋ 左上角輸入框
       ═════════════════════════════════════════════════════════════════════ */
    {
      const mk2 = (n, f) => new Uint8Array(Array.from({ length: n }, (_, i) => f(i)));
      const clickDiffAt = async (awid, idx) => {
        A.setInputs({ slave: '0x50', awid: awid, off: '0x0000', len: '512' });
        A.abPickAuto('auto');
        A.loadFile('c' + awid + '_a.bin', mk2(512, i => i & 0xFF)); await sleep(80);
        A.loadFile('c' + awid + '_b.bin', mk2(512, i => (i === idx ? 0x5A : (i & 0xFF)))); await sleep(120);
        A.setCross(null); await sleep(40);                    /* 歸零，確保不是殘留值 */
        const bytesBefore = Array.from(A.curSet().bytes);
        const row = document.querySelector('#diffrows .diffrow[data-idx="' + idx + '"]');
        if (!row) return { err: '找不到 idx=' + idx + ' 的差異列（n=' + A.diffCount() + '）' };
        row.click(); await sleep(120);
        const td = document.querySelector('#dump td.xc');
        return { cross: A.cross(), pageIdx: A.pageIdx(), xhair: ($('xhair') || {}).value,
                 xcIdx: td ? parseInt(td.getAttribute('data-idx'), 10) : null,
                 xh: document.querySelectorAll('#dump td.xh').length,
                 thxh: document.querySelectorAll('#dump th.xh:not(.corner)').length,
                 corner: !!document.querySelector('#dump th.corner.xh'),
                 same: Array.from(A.curSet().bytes).every((b, i) => b === bytesBefore[i]),
                 base: A.curSet().base };
      };

      /* 不在當前頁的位址（0x123 ⇒ 第 1 頁；點之前在第 0 頁） */
      {
        A.setInputs({ slave: '0x50', awid: 2, off: '0x0000', len: '512' });
        const m = await clickDiffAt(2, 0x123);
        ok('5a 🔴 點「不在當前頁」的差異列 ⇒ 換頁 ＋ 十字 ＋ 左上角三者一起到位',
           !m.err && m.cross === m.base + 0x123 && m.pageIdx === 1
           && m.xhair === '0x0123' && m.xcIdx === 0x123,
           m.err || ('cross=0x' + (m.cross || 0).toString(16) + ' pageIdx=' + m.pageIdx
                     + ' #xhair=' + m.xhair + ' td.xc 的 data-idx=0x' + (m.xcIdx || 0).toString(16)));
        /* 🔴 正確的數字是 31，不是我原本寫的 32：渲染條件是 `r === xr || c2 === xc`
           ⇒ 一整列 16 格 ∪ 一整欄 16 格，交集（中心那一格）只算一次 ⇒ 16+16-1 = 31。
           中心那一格是**另外**再加 .xc（不是改成 .xc），所以它也在這 31 格裡面。
           表頭另有 2 格 th.xh（列標 ＋ 欄標），左上角那格刻意不亮 —— 下一條分開驗。 */
        ok('5b 十字真的畫出來了（一列 16 ∪ 一欄 16，交集算一次 ⇒ td.xh = 31）',
           m.xh === 31, 'td.xh = ' + m.xh);
        ok('5b2 列標與欄標也跟著亮（th.xh = 2），左上角那格刻意不亮',
           m.thxh === 2 && m.corner === false, 'th.xh=' + m.thxh + ' corner.xh=' + m.corner);
        ok('5c 🔴 點完之後**值一個 byte 都沒變**', m.same === true, 'same=' + m.same);
      }
      /* 同一頁內的位址 ⇒ 不換頁，十字與左上角一樣到位 */
      {
        const m = await clickDiffAt(2, 0x0057);
        ok('5d 同一頁內（0x0057）⇒ 不換頁，十字與左上角仍到位',
           !m.err && m.cross === m.base + 0x57 && m.pageIdx === 0 && m.xhair === '0x0057' && m.xcIdx === 0x57,
           m.err || ('cross=0x' + (m.cross || 0).toString(16) + ' pageIdx=' + m.pageIdx + ' #xhair=' + m.xhair));
      }
      /* offset 寬度 4 ⇒ 位址換算與顯示位數仍正確 */
      {
        const m = await clickDiffAt(4, 0x0123);
        ok('5e offset 寬度 4 ⇒ 位址換算仍正確（左上角顯示同一個位址）',
           !m.err && m.cross === m.base + 0x123 && m.xcIdx === 0x123
           && /^0x0*123$/.test(String(m.xhair)),
           m.err || ('cross=0x' + (m.cross || 0).toString(16) + ' #xhair=' + m.xhair + ' pageIdx=' + m.pageIdx));
      }
      /* 舊的 1.5 秒綠框不應該再出現（兩種視覺不得並存） */
      {
        const m = await clickDiffAt(2, 0x0123);
        await sleep(60);
        ok('5f 不再有「看起來像選取但不是選取」的綠框（td.sel 為 0）',
           document.querySelectorAll('#dump td.sel').length === 0 && A.selRange() === null,
           'td.sel=' + document.querySelectorAll('#dump td.sel').length + ' selRange=' + JSON.stringify(A.selRange()));
      }
    }

    ok('Z 全程沒有未預期的 JS 例外', ERRS.length === 0, ERRS.slice(0, 3).join(' ⏐ '));
    document.title = 'UIPROBE' + JSON.stringify(R);
  })().catch(e => {
    R.push({ name: '🔴 probe 自己爆了：' + (e && e.message), pass: false, extra: String((e && e.stack) || '').slice(0, 240) });
    document.title = 'UIPROBE' + JSON.stringify(R);
  });
})();
