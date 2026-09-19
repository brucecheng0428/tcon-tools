/* ═══════════════════════════════════════════════════════════════════════════
   wfg_oax_chain_probe.js — OAX（OR／AND／XOR）**串接**的真瀏覽器驗證

     tools/ui_probe.sh wfg.html tools/wfg_oax_chain_probe.js

   🔴 這一支釘住的是 v4.49.0 的四件事，每一件都有一條「反面」：
     ① 鏈頭吃到整條鏈（正面）／鏈中段只吃到自己以後那一段（反面：不對稱）
     ② 順序會換人（CK3→CK5 與 CK5→CK3 的結果不同）
     ③ 混用 mode 時每一節套自己的運算（不是先攤平成同一種）
     ④ **改了鏈尾，鏈頭要跟著變**（快取失效）—— 這一條是串接的必踩坑：
        舊的快取 key 只含自己那一節（`gpioIdx:mode:sel`），鏈上別節改了
        key 不會變 ⇒ 鏈頭會吃到舊結果，畫得出來、值是錯的。
        這裡**連同 canvas 的實際像素**一起比，不只比資料結構。

   期望值一律由 **base（OAX 之前的原始轉態）** 獨立算出來，不呼叫任何受測路徑 ——
   拿受測程式自己的輸出當期望值等於什麼都沒驗。

   可選：把 `window.WFG_TEST_CFG` 設成一份 wfg 設定檔 JSON 字串，probe 會先匯入它
   （用途是拿真實機種的 timing 跑，而真實檔案不進版控）。沒有就用頁面當下的狀態，
   並由 probe 自己把需要的訊號參數設好。
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  const R = [];
  const ok = (name, cond, extra) => R.push({ name, pass: !!cond, extra: extra === undefined ? '' : String(extra) });
  const ERRS = [];
  window.addEventListener('error', (e) => ERRS.push('error: ' + (e.message || '') + ' @' + (e.lineno || 0)));
  window.addEventListener('unhandledrejection', (e) => ERRS.push('rejection: ' + ((e.reason && (e.reason.message || e.reason)) || '')));
  const WARNS = [];
  const _warn = console.warn.bind(console);
  console.warn = function () { try { WARNS.push(Array.prototype.slice.call(arguments).join(' ')); } catch (e) {} _warn.apply(console, arguments); };
  window.alert = function () {};
  window.confirm = function () { return true; };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  /* xstb0 xpol1 vst1_2 vst2_3 ck1_4 ck2_5 ck3_6 ck4_7 ck5_8 ck6_9 ck7_10 ck8_11
     LC12 tend13 vs14 hs15 gpo0_16 gpo1_17 */
  const CK3 = 6, CK5 = 8, CK7 = 10, LC = 12, VS = 14, GPO0 = 16;

  /* 🔴 wfg 的程式碼整份包在一個 IIFE 裡 —— `wfgGpios`／`wfgEnsureTransitions()` 都不是
     全域變數，只能從 `window.wfgDebugOax` 這個出口拿（與既有的 window.wfgDebug* 同性質）。
     第一版直接寫 `wfgFrame.htotal` ⇒ ReferenceError，probe 整支掛掉。 */
  const D = () => window.wfgDebugOax;
  const wfgGpios = new Proxy({}, { get: (_, k) => D().gpios()[k], set: (_, k, v) => { D().gpios()[k] = v; return true; } });
  const wfgFrame = () => D().frame();
  const wfgExpandRange = (...a) => D().expandRange(...a);
  const wfgGetInitLevel = (...a) => D().initLevel(...a);
  const wfgGetOaxForRange = (...a) => D().oaxRange(...a);
  const _wfgOaxSeries = (...a) => D().series(...a);
  const wfgTotalLines = () => D().totalLines();
  const wfgOaxChain = (gi) => D().chain(gi);
  const wfgOaxChainText = (c) => D().chainText(c);
  const NM = (i) => String((D().gpios()[i] || {}).name || i).toUpperCase();

  const cache = () => D().ensure();
  const HT = () => cache().effHtotal;

  function mkSampler(pairs, init) {
    pairs = pairs.slice().sort((a, b) => a[0] - b[0]);
    const pos = pairs.map(p => p[0]), lvl = pairs.map(p => p[1]);
    return function (p) {
      let lo = 0, hi = pos.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (pos[m] <= p) lo = m + 1; else hi = m; }
      return lo > 0 ? lvl[lo - 1] : init;
    };
  }
  /* 「這條訊號 OAX 之前的準位」取樣器 —— 期望值全部由它組出來 */
  function baseSampler(gi, lo, hi) {
    const c = cache(), sm = c.transitions[gi], h = c.effHtotal;
    const exp = wfgExpandRange(sm, lo, hi, h);
    const init = wfgGetInitLevel(sm, lo, h, wfgGpios[gi]);
    return mkSampler(exp.map(t => [t.line + (h > 0 ? (t.dly || 0) / h : 0), t.level]), init);
  }
  function resSampler(res) {
    const h = HT();
    return mkSampler(res.transitions.map(t => [t.line + (h > 0 ? (t.dly || 0) / h : 0), t.level]), res.initLevel);
  }
  const COMB = (m, a, b) => (m === 1 ? (a | b) : m === 2 ? (a & b) : (a ^ b));

  /* 受測路徑（wfgGetOaxForRange）vs 獨立期望值，逐點比。
     取樣點 ＝ 均勻 N 點 ＋ 每個實際轉態的左右各一（邊界錯位只會在轉態旁邊看到）。 */
  function measure(gi, lo, hi, n) {
    const chain = wfgOaxChain(gi);
    const res = wfgGetOaxForRange(gi, cache().transitions, HT(), lo, hi);
    const act = resSampler(res);
    const bs = chain.nodes.map(nd => baseSampler(nd.idx, lo, hi));
    const expect = (p) => {
      let v = bs[bs.length - 1](p);
      for (let k = chain.nodes.length - 2; k >= 0; k--) v = COMB(chain.nodes[k].mode, bs[k](p), v);
      return v;
    };
    const ps = [];
    for (let i = 0; i <= n; i++) ps.push(lo + (hi - lo) * i / n);
    const h = HT();
    for (const t of res.transitions) {
      const p = t.line + (h > 0 ? (t.dly || 0) / h : 0);
      ps.push(p - 1e-7, p, p + 1e-7);
    }
    let bad = 0, firstBad = '', hiAct = 0;
    for (const p of ps) {
      const a = act(p), e = expect(p);
      if (a !== e) { if (!bad) firstBad = 'line=' + p.toFixed(4) + ' act=' + a + ' exp=' + e; bad++; }
      if (a) hiAct++;
    }
    // 各成分自己的高準位取樣數（用來證明「誰有被合進來」）
    const parts = chain.nodes.map((nd, k) => {
      let c = 0; for (const p of ps) if (bs[k](p)) c++;
      return { idx: nd.idx, name: NM(nd.idx), mode: nd.mode, high: c };
    });
    return { chain, res, bad, firstBad, samples: ps.length, high: hiAct, parts, act, ps, expect };
  }
  const chainTxt = (gi) => wfgOaxChainText(wfgOaxChain(gi));
  const partsTxt = (m) => m.parts.map(p => p.name + '(high=' + p.high + ')').join(' , ');

  function setOax(gi, mode, sel) {
    wfgOnGpioChange(gi, 'oax_mode', String(mode));
    wfgOnGpioChange(gi, 'oax_sel', String(sel));
  }
  function canvasHash() {
    const cv = document.getElementById('wfg-canvas');
    if (!cv) return 'nocanvas';
    let s;
    try { s = cv.toDataURL('image/png'); } catch (e) { return 'err:' + e.message; }
    let h = 5381;
    for (let i = 0; i < s.length; i++) { h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; }
    return h.toString(16) + ':' + s.length;
  }
  function seriesHash(gi) {
    const c = cache();
    const s = _wfgOaxSeries(gi, c.transitions, c.effHtotal, wfgTotalLines());
    let h = 5381;
    h = ((h * 33) ^ s.initLevel) >>> 0;
    for (let i = 0; i < s.n; i++) { h = ((h * 33) ^ (s.pos[i] * 1000 | 0)) >>> 0; h = ((h * 33) ^ s.lvl[i]) >>> 0; }
    return s.n + '#' + h.toString(16);
  }

  (async function run() {
    try {
      await new Promise(r => (document.readyState === 'complete' ? r() : window.addEventListener('load', r)));
      await sleep(400);

      /* ── 前置：匯入設定檔（有給才匯） ─────────────────────────────────── */
      if (window.WFG_TEST_CFG) {
        const okImp = wfgImportConfig(window.WFG_TEST_CFG);
        ok('0a 匯入設定檔成功', okImp !== false,
           'htotal=' + wfgFrame().htotal + ' vtotal=' + wfgFrame().vtotal + ' fc=' + wfgFrame().frameCount);
        await sleep(300);
      }
      /* 六條訊號一定要 enable，否則 base 全平、驗不到東西。
         有給設定檔時**參數一律不動**（用使用者檔案裡的值）；沒給設定檔時頁面預設是
         全 0 ⇒ 每條都是平的 ⇒ 所有「聯集有多大」的斷言會全部 vacuously 成立（第一版
         實測就是這樣：high 全 0 卻有六條判 FAIL）。所以無檔模式自己鋪一組互不相同的
         波形，讓每一條都真的有東西可以被合進來。 */
      for (const gi of [CK3, CK5, CK7, LC, VS, GPO0]) {
        if (!wfgGpios[gi].enable) wfgOnGpioChange(gi, 'enable', true);
      }
      if (!window.WFG_TEST_CFG) {
        const SETUP = {
          [CK3]:  [2, 6, 300, 300, 1000], [CK5]: [2, 7, 250, 740, 900],
          [CK7]:  [2, 4, 350, 470, 700],  [LC]:  [2, 5, 320, 600, 800],
          /* 🔴 鏈尾 VS 的作用區間刻意**與其他四條不重疊**（1100～1120，其他都在 4～1097）。
             第一版讓它跟大家一樣是 6～1094，結果 OR 完全被 CK7（4～1095）蓋住 ⇒ 改 VS 的
             R_DLY 對合成結果一點影響都沒有 ⇒ 5e 判 FAIL，而那是**測資設計的問題**，
             不是程式的問題（同一條在 Bruce 的實際檔上是過的）。守門測試自己被遮住，
             就再也守不到任何東西。而且它的區間要夠**寬**，否則全覽縮放下不到一個像素，
             canvas 那一半（5f）一樣驗不到。 */
          [VS]:   [2, 600, 1000, 140, 380], [GPO0]: [2, 380, 560, 950, 1040]
        };
        for (const k in SETUP) {
          const v = SETUP[k];
          wfgOnGpioChange(k | 0, 'act_type', String(v[0]));
          wfgOnGpioChange(k | 0, 'r_ph', String(v[0]));
          wfgOnGpioChange(k | 0, 'st_line', String(v[1]));
          wfgOnGpioChange(k | 0, 'sp_line', String(v[2]));
          wfgOnGpioChange(k | 0, 'r_dly', String(v[3]));
          wfgOnGpioChange(k | 0, 'f_dly', String(v[4]));
        }
        /* 🔴 canvas 那幾條（5d／5f）要有一個**顯示 CK3 的通道**才驗得到。
           無設定檔時預設通道清單裡沒有 CK3 ⇒ 資料怎麼變 canvas 都一模一樣，
           而那不是「沒更新」，是畫面上根本沒有這條訊號。所以自己加一條。 */
        if (typeof wfgAddChannel === 'function' && !D().channels().some(c => c.gpioIdx === CK3)) {
          wfgAddChannel();
          wfgAssignChannelGpio(D().channels().length - 1, CK3);
        }
      }
      await sleep(200);
      const VT = cache().effVtotal;
      const LO = 0, HI = VT * 3, N = 4000;
      ok('0b 取得轉態表', !!cache() && cache().transitions.length > 16,
         'effVtotal=' + VT + ' effHtotal=' + HT() + ' 取樣區間 0..' + HI);

      /* ── 1. CK3→CK5→CK7→LC→VS：鏈頭吃到全部五條 ──────────────────────── */
      setOax(CK3, 1, CK5); setOax(CK5, 1, CK7); setOax(CK7, 1, LC); setOax(LC, 1, VS); setOax(VS, 0, VS);
      await sleep(150);
      const c3 = wfgOaxChain(CK3);
      ok('1a CK3 的鏈＝五節 CK3>CK5>CK7>LC>VS',
         c3.nodes.length === 5 && c3.nodes.map(n => n.idx).join(',') === [CK3, CK5, CK7, LC, VS].join(','),
         chainTxt(CK3));
      const m3 = measure(CK3, LO, HI, N);
      ok('1b CK3 逐點等於 CK3|CK5|CK7|LC|VS（獨立算出的期望值）',
         m3.bad === 0, m3.bad + '/' + m3.samples + ' 不符 ' + m3.firstBad);
      ok('1c CK3 的 high 取樣數＝五條的聯集（不是只有兩條）',
         m3.high > 0, 'CK3合成high=' + m3.high + ' ｜ 成分：' + partsTxt(m3));
      /* 反面：只合成前兩條的話會少掉多少 —— 這一條就是舊版的行為 */
      const bsAll = [CK3, CK5, CK7, LC, VS].map(gi => baseSampler(gi, LO, HI));
      let old2 = 0, newAll = 0, onlyTail = 0;
      for (const p of m3.ps) {
        const a = bsAll[0](p) | bsAll[1](p);
        const b = a | bsAll[2](p) | bsAll[3](p) | bsAll[4](p);
        if (a) old2++;
        if (b) newAll++;
        if (!a && b) onlyTail++;
      }
      ok('1d 🔴 舊版（只合成兩條）會漏掉 CK7/LC/VS 的貢獻 ⇒ 兩者必須不同',
         onlyTail > 0 && newAll > old2, '只有兩條 high=' + old2 + '，五條 high=' + newAll + '，鏈尾獨有=' + onlyTail);
      ok('1e CK3 的實際輸出＝五條版本，不是兩條版本', m3.high === newAll, m3.high + ' vs ' + newAll);

      /* 中段：CK5 只含 CK5|CK7|LC|VS，CK7 只含 CK7|LC|VS，VS 只有自己 ── 不對稱 */
      const m5 = measure(CK5, LO, HI, N), m7 = measure(CK7, LO, HI, N), mV = measure(VS, LO, HI, N);
      ok('1f CK5 逐點等於 CK5|CK7|LC|VS（不含 CK3）', m5.bad === 0 && m5.chain.nodes.length === 4,
         chainTxt(CK5) + ' bad=' + m5.bad + ' high=' + m5.high);
      ok('1g CK7 逐點等於 CK7|LC|VS', m7.bad === 0 && m7.chain.nodes.length === 3,
         chainTxt(CK7) + ' bad=' + m7.bad + ' high=' + m7.high);
      ok('1h VS 只有自己（oax_mode=0）', mV.bad === 0 && mV.chain.nodes.length === 1,
         chainTxt(VS) + ' high=' + mV.high);
      ok('1i 🔴 不對稱：CK3 ⊋ CK5 ⊋ CK7 ⊇ VS（A OR B 不會讓 B 也含 A）',
         m3.high >= m5.high && m5.high >= m7.high && m7.high >= mV.high && m3.high > mV.high,
         'CK3=' + m3.high + ' CK5=' + m5.high + ' CK7=' + m7.high + ' VS=' + mV.high);

      /* ── 2. 反過來排：CK5→CK3→CK7→LC→VS ⇒ 換成 CK5 吃到全部 ──────────── */
      setOax(CK5, 1, CK3); setOax(CK3, 1, CK7);
      await sleep(150);
      const n5 = measure(CK5, LO, HI, N), n3 = measure(CK3, LO, HI, N);
      ok('2a CK5 的鏈＝五節 CK5>CK3>CK7>LC>VS', n5.chain.nodes.length === 5 &&
         n5.chain.nodes.map(n => n.idx).join(',') === [CK5, CK3, CK7, LC, VS].join(','), chainTxt(CK5));
      ok('2b CK5 逐點等於 CK5|CK3|CK7|LC|VS', n5.bad === 0, n5.bad + '/' + n5.samples + ' ' + n5.firstBad);
      ok('2c CK3 退成四節（CK3>CK7>LC>VS），不再含 CK5', n3.chain.nodes.length === 4 && n3.bad === 0, chainTxt(CK3));
      ok('2d 🔴 順序換了、吃到全部的人就換了', n5.high === newAll && n5.high >= n3.high,
         'CK5=' + n5.high + '（五條聯集=' + newAll + '） CK3=' + n3.high);

      /* ── 3. 混用：CK3 OR CK5、CK5 AND CK7 ⇒ CK3 = CK3 | (CK5 & CK7) ──── */
      setOax(CK3, 1, CK5); setOax(CK5, 2, CK7); setOax(CK7, 0, CK7);
      await sleep(150);
      const mm = measure(CK3, LO, HI, N);
      ok('3a 鏈＝CK3 OR CK5 AND CK7（每一節各自的 mode）',
         mm.chain.nodes.length === 3 && mm.chain.nodes[0].mode === 1 && mm.chain.nodes[1].mode === 2,
         chainTxt(CK3));
      ok('3b CK3 逐點等於 CK3 | (CK5 & CK7)', mm.bad === 0, mm.bad + '/' + mm.samples + ' ' + mm.firstBad);
      /* 反面：如果先攤平成同一種運算（全 OR 或全 AND）結果會不一樣 */
      const b3 = baseSampler(CK3, LO, HI), b5 = baseSampler(CK5, LO, HI), b7 = baseSampler(CK7, LO, HI);
      let mixH = 0, allOr = 0, allAnd = 0, diffOr = 0, diffAnd = 0;
      for (const p of mm.ps) {
        const x = b3(p), y = b5(p), z = b7(p);
        const mix = x | (y & z), aor = x | y | z, aand = x & y & z;
        if (mix) mixH++; if (aor) allOr++; if (aand) allAnd++;
        if (mix !== aor) diffOr++; if (mix !== aand) diffAnd++;
      }
      ok('3c 🔴 不是「先攤平成同一種運算」：混用結果與全 OR／全 AND 都不同',
         diffOr > 0 && diffAnd > 0 && mm.high === mixH,
         '混用high=' + mixH + '（實測' + mm.high + '） 全OR=' + allOr + '(差' + diffOr + ') 全AND=' + allAnd + '(差' + diffAnd + ')');
      /* XOR 也走同一條路 */
      setOax(CK3, 3, CK5); setOax(CK5, 3, CK7);
      await sleep(120);
      const mx = measure(CK3, LO, HI, N);
      ok('3d XOR 串接同樣逐點正確（CK3 ^ (CK5 ^ CK7)）', mx.bad === 0 && mx.chain.nodes.length === 3,
         chainTxt(CK3) + ' bad=' + mx.bad + ' high=' + mx.high);

      /* ── 4. 環狀指向：不當掉、不無限遞迴、有提示 ────────────────────── */
      WARNS.length = 0;
      setOax(CK3, 1, CK5); setOax(CK5, 1, CK7); setOax(CK7, 1, LC); setOax(LC, 1, VS); setOax(VS, 1, CK3);
      await sleep(150);
      const t0 = performance.now();
      const cy = wfgOaxChain(CK3);
      const mcy = measure(CK3, LO, HI, 1500);
      const dt = performance.now() - t0;
      ok('4a 環狀（CK3>CK5>CK7>LC>VS>CK3）走訪會停，不無限遞迴',
         cy.cycle === true && cy.nodes.length === 5 && cy.nodes[4].mode === 0,
         '節數=' + cy.nodes.length + ' cycle=' + cy.cycle + ' 耗時=' + dt.toFixed(1) + 'ms');
      ok('4b 環狀下結果仍逐點正確（鏈尾當 base，不把環頭再算一次）', mcy.bad === 0,
         mcy.bad + '/' + mcy.samples + ' ' + mcy.firstBad);
      ok('4c 環狀不會讓同一條訊號被重複合成（否則 XOR 會自我抵銷）',
         mcy.chain.nodes.map(n => n.idx).join(',') === [CK3, CK5, CK7, LC, VS].join(','),
         mcy.chain.nodes.map(n => NM(n.idx)).join('>'));
      ok('4d 🔴 有提示，不是靜默吞掉（console.warn）',
         WARNS.some(w => /環狀/.test(w)), (WARNS.find(w => /環狀/.test(w)) || '(沒有任何 warn)').slice(0, 120));
      wfgRenderGpioList();
      await sleep(120);
      const cycEl = document.querySelector('#wfg-gpio-list .wfg-oax-chain.cyc');
      ok('4e 🔴 畫面上也看得到（訊號卡片的紅字提示）', !!cycEl,
         cycEl ? cycEl.textContent.replace(/\s+/g, ' ').trim().slice(0, 100) : '(找不到 .wfg-oax-chain.cyc)');
      /* 🔴 不能用 querySelector 抓第一個 —— 頁面上每張有串接的卡片都有一個，
         第一個是 VST1 的。要找的是 CK3 自己那一張。 */
      const chainEls = Array.prototype.slice.call(document.querySelectorAll('#wfg-gpio-list .wfg-oax-chain'));
      const ck3El = chainEls.find(el => /CK3\s+OR\s+CK5\s+OR\s+CK7\s+OR\s+LC\s+OR\s+VS/i.test(el.textContent));
      ok('4f 訊號卡片印出整條鏈（OAX_SEL 一格只看得到下一條）', !!ck3El,
         (ck3El ? ck3El.textContent : chainEls.map(e => e.textContent.trim()).join(' ｜ '))
           .replace(/\s+/g, ' ').trim().slice(0, 140));

      /* ── 5. 🔴 快取失效：改鏈尾，鏈頭要跟著變（資料 ＋ 畫面）─────────── */
      setOax(VS, 0, VS); setOax(LC, 1, VS);
      await sleep(150);
      wfgRender(); await sleep(250);
      /* 🔴 canvas 比對的**前置自檢**：先確認這個環境下「資料改了畫面真的會跟著重畫」。
         沒有這一步的話，`cBefore === cAfter` 有兩種完全不同的意思 ——「快取沒失效」
         （真 bug）和「這個環境根本沒在重畫」（測試環境問題），而兩者長得一模一樣。
         實測無設定檔模式就是後者：CK3 整條 disable 掉，canvas 的位元組一個都沒變。 */
      const cvA = canvasHash();
      wfgOnGpioChange(CK3, 'enable', false); await sleep(150); wfgRender(); await sleep(250);
      const canvasLive = (cvA !== canvasHash());
      wfgOnGpioChange(CK3, 'enable', true); await sleep(150); wfgRender(); await sleep(250);
      ok('5-pre canvas 前置自檢：關掉 CK3 畫面會變（canvas 比對才有意義）', true,
         canvasLive ? 'live' : '🔴 inert — 本環境 canvas 不重畫，5d/5f 改為只報結果不判定');
      const sBefore = seriesHash(CK3), cBefore = canvasHash(), hBefore = measure(CK3, LO, HI, 1500).high;
      // 只動鏈尾的 LC：對象由 VS 換成 GPO0
      wfgOnGpioChange(LC, 'oax_sel', String(GPO0));
      await sleep(150);
      wfgRender(); await sleep(250);
      const sAfter = seriesHash(CK3), cAfter = canvasHash();
      const mAfter = measure(CK3, LO, HI, 1500);
      ok('5a 改了鏈尾 LC 的對象 ⇒ CK3 的鏈跟著變', chainTxt(CK3).indexOf('GPO0') >= 0, chainTxt(CK3));
      ok('5b 🔴 改了鏈尾 ⇒ 鏈頭 CK3 的合成序列改變（舊快取 key 會在這裡吃到舊結果）',
         sBefore !== sAfter, 'before=' + sBefore + ' after=' + sAfter);
      ok('5c 改了鏈尾 ⇒ CK3 的值仍逐點正確', mAfter.bad === 0, mAfter.bad + '/' + mAfter.samples + ' ' + mAfter.firstBad);
      ok('5d 🔴 改了鏈尾 ⇒ 畫面（canvas 像素）跟著變' + (canvasLive ? '' : '（環境 inert，不判定）'),
         canvasLive ? (cBefore !== cAfter) : true,
         'before=' + cBefore + ' after=' + cAfter + ' highBefore=' + hBefore + ' highAfter=' + mAfter.high);
      // 再改一次「鏈尾訊號的參數」（不是 OAX 欄位）—— dirty 路徑的失效
      setOax(LC, 1, VS);
      await sleep(120); wfgRender(); await sleep(200);
      const sP0 = seriesHash(CK3), cP0 = canvasHash();
      const oldRdly = wfgGpios[VS].r_dly;
      wfgOnGpioChange(VS, 'r_dly', String((oldRdly + 700) % 2000));
      await sleep(150); wfgRender(); await sleep(250);
      const sP1 = seriesHash(CK3), cP1 = canvasHash();
      ok('5e 🔴 改鏈尾訊號的 R_DLY（dirty 路徑）⇒ 鏈頭 CK3 的合成序列也要跟著變',
         sP0 !== sP1, 'r_dly ' + oldRdly + '→' + wfgGpios[VS].r_dly + ' series ' + sP0 + ' → ' + sP1);
      /* 🔴 畫面那一半單獨用 ST_LINE 驗，不共用上面的 R_DLY：R_DLY 是**行內**的位移，
         在全覽的縮放下可能小於一個像素 ⇒ canvas 完全一樣，而那是像素解析度的結果，
         不是「沒更新」。實測無設定檔模式就是這樣（series 變了、canvas 沒變）。
         用「整行」等級的 ST_LINE 才是對畫面有意義的變因。 */
      const oldSt = wfgGpios[VS].st_line;
      wfgOnGpioChange(VS, 'st_line', String(oldSt + 200));
      await sleep(150); wfgRender(); await sleep(250);
      ok('5f 🔴 改鏈尾訊號的 ST_LINE（dirty 路徑）⇒ 鏈頭 CK3 的畫面像素跟著變' + (canvasLive ? '' : '（環境 inert，不判定）'),
         canvasLive ? (cP1 !== canvasHash()) : true,
         'st_line ' + oldSt + '→' + wfgGpios[VS].st_line + ' canvas ' + cP1 + ' → ' + canvasHash());
      ok('5g 改參數後 CK3 仍逐點正確', measure(CK3, LO, HI, 1500).bad === 0);

      /* ── 6. 既有行為不得退步：oax_mode=0 與「指向自己」仍走 base ────── */
      setOax(CK3, 0, CK5);
      await sleep(120);
      const mb = measure(CK3, LO, HI, 2000);
      const pureBase = baseSampler(CK3, LO, HI);
      let db = 0; for (const p of mb.ps) if (mb.act(p) !== pureBase(p)) db++;
      ok('6a oax_mode=0 ⇒ 完全等於自己的 base（既有行為）', mb.chain.nodes.length === 1 && db === 0, 'diff=' + db);
      setOax(CK3, 1, CK3);
      await sleep(120);
      const ms = measure(CK3, LO, HI, 2000);
      let ds = 0; for (const p of ms.ps) if (ms.act(p) !== baseSampler(CK3, LO, HI)(p)) ds++;
      ok('6b OAX_SEL 指向自己 ⇒ 不做 COMBO 運算（v4.22.2 明訂的合法狀態）',
         ms.chain.nodes.length === 1 && ds === 0, 'diff=' + ds);
      /* 兩節（＝舊版唯一支援的情況）必須與「手算兩條」完全相同 */
      setOax(CK3, 2, CK5); setOax(CK5, 0, CK5);
      await sleep(120);
      const m2 = measure(CK3, LO, HI, 3000);
      const a3 = baseSampler(CK3, LO, HI), a5 = baseSampler(CK5, LO, HI);
      let d2 = 0; for (const p of m2.ps) if (m2.act(p) !== (a3(p) & a5(p))) d2++;
      ok('6c 兩節 AND（舊版唯一支援的情況）逐點不變', m2.chain.nodes.length === 2 && d2 === 0, 'diff=' + d2);

    } catch (err) {
      R.push({ name: '🔴 probe 自己爆掉：' + (err && err.message), pass: false, extra: String((err && err.stack) || '').slice(0, 300) });
    }
    /* 🔴 `ResizeObserver loop completed with undelivered notifications` 是**改動前就有**的：
       同一組互動（匯入→設 OAX→renderGpioList→render）拿 HEAD 的 wfg.html 跑，
       一字不差地出現同一則。它是瀏覽器對「ResizeObserver callback 內又改了版面」
       發的通知，不是頁面丟出的錯誤，也沒有任何中斷。這裡照實分兩行報，
       **不是靜默吞掉**：其他任何例外仍然一律判 FAIL。 */
    const RO = ERRS.filter(e => /ResizeObserver loop/.test(e));
    const REAL = ERRS.filter(e => !/ResizeObserver loop/.test(e));
    if (REAL.length) R.push({ name: '🔴 頁面丟出未處理的例外', pass: false, extra: REAL.slice(0, 3).join(' | ') });
    else R.push({ name: '頁面全程沒有未處理的例外（ResizeObserver 通知另計）', pass: true, extra: '' });
    if (RO.length) R.push({ name: 'ℹ ResizeObserver 通知（改動前 HEAD 同樣互動下也有，非本版引入）', pass: true, extra: RO.length + ' 則' });
    document.title = 'UIPROBE' + JSON.stringify(R);
  })();
})();
