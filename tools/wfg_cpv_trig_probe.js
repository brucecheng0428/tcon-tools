/* ═══════════════════════════════════════════════════════════════════════════
   wfg_cpv_trig_probe.js — CKO 上升／下降的觸發沿**可以分開設**（v4.50.0）

     tools/ui_probe.sh wfg.html tools/wfg_cpv_trig_probe.js
     WFG_CFG=<設定檔路徑> tools/ui_probe.sh wfg.html tools/wfg_cpv_trig_probe.js

   釘住的東西，每一條都刻意有「反面」——只驗正面的判準是本專案吃過三次虧的
   同一個破口（見 CLAUDE.md 的 `check_nb_code_import.js` / `check_em01_code_import.js`）：

     ① 上升設 A、下降設 B ⇒ 充電只落在 CPV1 的 A 沿、放電只落在 CPV2 的 B 沿（正面）
        ／且**完全不落在**各自的另一種沿（反面：舊版共用一個 activeLevel 時必爆）
     ② 兩邊設不同 ⇒ 波形真的不一樣（反面：欄位接錯、兩個下拉其實都寫到同一格，
        所有「正面」斷言仍然會過，只有這一條抓得到）
     ③ 兩邊設同值 ⇒ 與「另一邊也設同值」的結果一致，且 rise/fall 互為對偶
     ④ 二進（dual_cpv）與四進（quad_cpv）兩種模式都要驗；四進的兩組來源不同，
        奇數組吃 (CPV1,CPV2)、偶數組吃 (CPV3,CPV4)，group size 減半
     ⑤ 匯出→重新匯入 ⇒ 兩個欄位與波形一位元未變（round-trip）
     ⑥ 舊檔相容：只有舊欄位 `cpv_trig_edge` 的設定檔，載入後兩邊都等於那個舊值

   🔴 期望值怎麼來的：**不呼叫 `_wfgLsBuildCpvPairEvents()`**。CPV 的轉態從
      `window.wfgDebugOax.oaxRange()`（LS 的**上游**，v4.49.0 另有 probe 釘住）取，
      「哪一個邊沿該打到哪一條 CKO」在這支檔案裡自己算一遍。用受測函式自己的
      輸出當期望值等於什麼都沒驗。

   設定檔（`window.WFG_TEST_CFG`）有給就用，沒給就用頁面預設 preset（dual_cpv 那一個），
   兩種情況都會跑完整組斷言。
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  const R = [];
  const ok = (name, cond, extra) => R.push({ name, pass: !!cond, extra: extra === undefined ? '' : String(extra) });
  const ERRS = [];
  window.addEventListener('error', (e) => ERRS.push('error: ' + (e.message || '') + ' @' + (e.lineno || 0)));
  window.addEventListener('unhandledrejection', (e) => ERRS.push('rejection: ' + ((e.reason && (e.reason.message || e.reason)) || '')));
  window.alert = function () {};
  window.confirm = function () { return true; };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const D = () => window.wfgDebugOax;
  const EPS = 1e-9;

  /* ── 獨立期望值 ──────────────────────────────────────────────────────────
     `srcIdx` 的真實邊沿（走 OAX 層，與畫面同一組轉態），挑出 `edge` 那一種，
     每個 frame 內從 0 開始 round-robin，命中 `pos` 的就是這條 CKO 的事件。
     回傳 { hits, other }：`other` ＝ **另一種**極性的邊沿時間，給反面斷言用。 */
  function pickEdges(srcIdx, edge, groupSize, pos, effH, effV, endLine) {
    const tc = D().ensure();
    const pad = Math.max(effV, 100);
    const oax = D().oaxRange(srcIdx, tc.transitions, effH, 0, endLine + pad);
    const trans = (oax && oax.transitions) || [];
    const want = (edge === 'rising') ? 1 : 0;
    let prev = oax ? oax.initLevel : 0;
    let idx = 0, lastFrame = -1;
    const hits = [], other = [];
    for (let i = 0; i < trans.length; i++) {
      const tr = trans[i];
      if (tr.level === prev) continue;          // 週期邊界的重複宣告不是邊沿
      prev = tr.level;
      const lineX = tr.line + (effH > 0 ? (tr.dly || 0) / effH : 0);
      if (tr.level !== want) { other.push(lineX); continue; }
      const f = (effV > 0) ? Math.floor(tr.line / effV) : 0;
      if (f !== lastFrame) { idx = 0; lastFrame = f; }
      if (idx === pos) hits.push(lineX);
      idx = (idx + 1) % groupSize;
    }
    return { hits, other };
  }

  /* 期望的 rise/fall：把充電事件、放電事件、每個 frame 邊界的 reset 併成一串，
     依 lineX 排序後跑同一台狀態機（低→高記 rise、高→低記 fall；reset 恆為低）。
     排序的相對順序與實作一致：reset 先進、再充電、再放電（Array.sort 穩定）。 */
  function expectRF(chargeIdx, dischargeIdx, eRise, eFall, groupSize, pos, effH, effV, endLine) {
    const c = pickEdges(chargeIdx, eRise, groupSize, pos, effH, effV, endLine);
    const d = pickEdges(dischargeIdx, eFall, groupSize, pos, effH, effV, endLine);
    const pad = Math.max(effV, 100);
    const extEnd = endLine + pad;
    const evs = [];
    if (effV > 0) {
      const eps = effH > 1 ? (0.5 / effH) : 0.0001;
      for (let f = 0; f <= Math.ceil(extEnd / effV); f++) {
        const fb = f * effV;
        if (fb >= 0 && fb <= extEnd) evs.push({ x: Math.max(0, fb - eps), hi: false, rst: true });
      }
    }
    for (const x of c.hits) evs.push({ x, hi: true, rst: false });
    for (const x of d.hits) evs.push({ x, hi: false, rst: false });
    evs.sort((a, b) => a.x - b.x);
    const rises = [], falls = [];
    let prevHigh = false;
    for (const e of evs) {
      if (e.rst) { if (prevHigh) falls.push(e.x); prevHigh = false; continue; }
      if (e.hi && !prevHigh) rises.push(e.x);
      else if (!e.hi && prevHigh) falls.push(e.x);
      prevHigh = e.hi;
    }
    return { rises, falls, chargeOther: c.other, dischargeOther: d.other };
  }

  const clip = (a, end) => a.filter(v => v < end - EPS);
  function sameList(a, b) {
    if (a.length !== b.length) return { ok: false, why: 'n ' + a.length + ' vs ' + b.length };
    for (let i = 0; i < a.length; i++) {
      if (Math.abs(a[i] - b[i]) > 1e-9) return { ok: false, why: '#' + i + ' ' + a[i] + ' vs ' + b[i] };
    }
    return { ok: true, why: 'n=' + a.length };
  }
  /* 兩串時間有沒有交集（容差 1e-9）。反面斷言用：充電事件**不可以**落在
     CPV1 的另一種沿上 —— 這一條才是「兩邊真的分開」的證據。 */
  function anyNear(a, b) {
    const s = b.slice().sort((x, y) => x - y);
    for (const v of a) {
      let lo = 0, hi = s.length - 1;
      while (lo <= hi) {
        const m = (lo + hi) >> 1;
        if (Math.abs(s[m] - v) <= 1e-9) return v;
        if (s[m] < v) lo = m + 1; else hi = m - 1;
      }
    }
    return null;
  }
  const digest = (a) => a.length + ':' + a.slice(0, 2).map(v => v.toFixed(4)).join(',')
                        + '…' + a.slice(-1).map(v => v.toFixed(4)).join(',');

  function setEdges(rise, fall) {
    window.wfgOnLsGlobalChange('cpv_trig_edge_rise', rise);
    window.wfgOnLsGlobalChange('cpv_trig_edge_fall', fall);
  }
  function srcOf(mode, ckoIdx0, g) {
    if (mode === 'quad_cpv') {
      const odd = (ckoIdx0 % 2 === 0);
      return { c: odd ? g.cpv1 : g.cpv3, d: odd ? g.cpv2 : g.cpv4 };
    }
    return { c: g.cpv1, d: g.cpv2 };
  }

  /* 一個情境走完整組比對，回傳每條 CKO 的 rises 摘要供後續「有沒有差」比對 */
  function checkScenario(tag, mode, eRise, eFall) {
    const d = window.wfgDumpLsCko(2);
    if (!d || !d.ok) { ok(tag + ' dump 成功', false, JSON.stringify(d && d.reason)); return null; }
    const okEdge = (d.trigEdgeRise === eRise && d.trigEdgeFall === eFall);
    ok(tag + ' 設定有吃進去（' + eRise + ' / ' + eFall + '）', okEdge,
       'rise=' + d.trigEdgeRise + ' fall=' + d.trigEdgeFall);
    const effH = d.effHtotal, effV = d.effVtotal, endLine = d.endLine;
    const G = (mode === 'quad_cpv') ? (d.phase / 2) : d.phase;
    let bad = 0, badWhy = '', crossC = null, crossD = null, sample = '';
    const sig = [];
    for (const c of (d.ckos || [])) {
      const i0 = c.cko - 1;
      const s = srcOf(mode, i0, d.src);
      const pos = (mode === 'quad_cpv') ? (i0 >> 1) : i0;
      const exp = expectRF(s.c, s.d, eRise, eFall, G, pos, effH, effV, endLine);
      const ar = clip(c.rises, endLine), af = clip(c.falls, endLine);
      const er = clip(exp.rises, endLine), ef = clip(exp.falls, endLine);
      const r1 = sameList(ar, er), r2 = sameList(af, ef);
      if (!r1.ok && !badWhy) badWhy = 'CKO' + c.cko + ' rise ' + r1.why;
      if (!r2.ok && !badWhy) badWhy = 'CKO' + c.cko + ' fall ' + r2.why;
      if (!r1.ok || !r2.ok) bad++;
      if (crossC === null) crossC = anyNear(ar, clip(exp.chargeOther, endLine));
      if (crossD === null) {
        // 放電事件要扣掉 frame 邊界的 reset（那不是 CPV2 的邊沿）
        const noReset = af.filter(v => (effV <= 0) || (Math.abs(v - Math.round(v / effV) * effV) > 2e-4));
        crossD = anyNear(noReset, clip(exp.dischargeOther, endLine));
      }
      if (c.cko === 1) sample = 'CKO1 rise ' + digest(ar) + ' | fall ' + digest(af);
      sig.push(c.cko + '#' + ar.length + '@' + ar.slice(0, 3).map(v => v.toFixed(6)).join(',')
               + '/' + af.slice(0, 3).map(v => v.toFixed(6)).join(','));
    }
    ok(tag + ' 每一條 CKO 的 rise/fall 與獨立期望值逐點相同', bad === 0,
       bad === 0 ? (d.ckos.length + ' 條全過｜' + sample) : (bad + ' 條不符｜' + badWhy));
    ok(tag + ' 反面：充電事件**沒有**落在 CPV1 的另一種沿上', crossC === null,
       crossC === null ? 'ok' : ('誤中 ' + crossC));
    ok(tag + ' 反面：放電事件**沒有**落在 CPV2 的另一種沿上', crossD === null,
       crossD === null ? 'ok' : ('誤中 ' + crossD));
    return sig.join(';');
  }

  (async function run() {
    try {
      await new Promise(r => (document.readyState === 'complete' ? r() : window.addEventListener('load', r)));
      await sleep(400);

      let usedCfg = false;
      if (window.WFG_TEST_CFG) {
        const okImp = window.wfgImportConfig(window.WFG_TEST_CFG);
        ok('0a 匯入真實設定檔成功', okImp !== false, '');
        usedCfg = true;
        await sleep(300);
      } else {
        /* `wfgLoadPreset` 不在 window 上，走使用者真正的那條路徑：改下拉再觸發 onchange */
        const _sel = document.getElementById('wfg-preset-select');
        _sel.value = 'fhd_60hz_sg_ls_dual_cpv';
        window.wfgLoadPresetFromSelect(_sel);
        await sleep(300);
        ok('0a 載入內建 preset（無外部設定檔）', true, 'fhd_60hz_sg_ls_dual_cpv');
      }

      /* ⑥ 舊檔相容 —— 這一條要在**動任何設定之前**驗：匯入的檔案（Bruce 的實檔與
         內建 preset 都是舊格式）只有單一 `cpv_trig_edge`，載入後兩邊必須都等於它。 */
      const d0 = window.wfgDumpLsCko(1);
      const legacyVal = (function () {
        try {
          const o = JSON.parse(window.WFG_TEST_CFG || '{}');
          return (o.lsGlobal && o.lsGlobal.cpv_trig_edge) || null;
        } catch (e) { return null; }
      })();
      ok('1 舊檔相容：只有舊欄位的設定檔載入後，上升／下降都等於那個舊值',
         d0.trigEdgeRise === d0.trigEdgeFall
           && (!legacyVal || (d0.trigEdgeRise === legacyVal && d0.trigEdgeFall === legacyVal)),
         '檔案 cpv_trig_edge=' + legacyVal + ' → rise=' + d0.trigEdgeRise + ' fall=' + d0.trigEdgeFall);

      /* 四進多出的另外兩個來源固定 CK7 / CK8，讓兩組真的吃到不同訊號 */
      window.wfgOnLsGlobalChange('cpv3_ck_idx', '10');
      window.wfgOnLsGlobalChange('cpv4_ck_idx', '11');
      await sleep(80);

      const SIG = {};
      for (const mode of ['dual_cpv', 'quad_cpv']) {
        window.wfgOnLsGlobalChange('mode', mode);
        await sleep(150);
        const label = (mode === 'dual_cpv') ? '二進' : '四進';
        for (const [rise, fall] of [['falling', 'falling'], ['rising', 'falling'],
                                    ['falling', 'rising'], ['rising', 'rising']]) {
          setEdges(rise, fall);
          await sleep(120);
          const n = '2 ' + label + ' ' + rise[0].toUpperCase() + '/' + fall[0].toUpperCase();
          SIG[mode + '|' + rise + '|' + fall] = checkScenario(n, mode, rise, fall);
        }
      }

      /* ② 反面：兩邊設不同，波形必須**真的不一樣**。
         這一條專門抓「兩個下拉其實寫到同一格」——那種情況上面每一條都還是會過。 */
      for (const mode of ['dual_cpv', 'quad_cpv']) {
        const label = (mode === 'dual_cpv') ? '二進' : '四進';
        const ff = SIG[mode + '|falling|falling'], rf = SIG[mode + '|rising|falling'];
        const fr = SIG[mode + '|falling|rising'], rr = SIG[mode + '|rising|rising'];
        ok('3 ' + label + ' 反面：只改「上升」那一格，波形要變（F/F ≠ R/F）', ff && rf && ff !== rf, '');
        ok('3 ' + label + ' 反面：只改「下降」那一格，波形要變（F/F ≠ F/R）', ff && fr && ff !== fr, '');
        ok('3 ' + label + ' 反面：R/F 與 F/R 不是同一條波形', rf && fr && rf !== fr, '');
        ok('3 ' + label + ' 四種組合互不相同', new Set([ff, rf, fr, rr]).size === 4,
           '相異 ' + new Set([ff, rf, fr, rr]).size + ' 種');
      }

      /* ⑤ round-trip：匯出 → 重新匯入 → 兩個欄位與波形一位元未變 */
      window.wfgOnLsGlobalChange('mode', 'dual_cpv');
      setEdges('rising', 'falling');
      await sleep(150);
      const beforeSig = checkScenario('4 round-trip 前', 'dual_cpv', 'rising', 'falling');
      const json = window.wfgExportConfig();
      const parsed = JSON.parse(json);
      ok('4 匯出檔有寫兩個新欄位',
         parsed.lsGlobal.cpv_trig_edge_rise === 'rising' && parsed.lsGlobal.cpv_trig_edge_fall === 'falling',
         JSON.stringify({ r: parsed.lsGlobal.cpv_trig_edge_rise, f: parsed.lsGlobal.cpv_trig_edge_fall,
                          legacy: parsed.lsGlobal.cpv_trig_edge }));
      ok('4 兩邊不同值時**不寫**舊欄位（沒有任何一個值是對的，寧可不給）',
         !('cpv_trig_edge' in parsed.lsGlobal), String(parsed.lsGlobal.cpv_trig_edge));
      window.wfgImportConfig(json);
      await sleep(250);
      const afterSig = checkScenario('4 round-trip 後', 'dual_cpv', 'rising', 'falling');
      ok('4 round-trip：匯出→匯入後波形逐點相同', beforeSig && beforeSig === afterSig, '');

      /* 兩邊同值時，舊欄位要寫出來（舊版讀得到、而且那個值確實正確） */
      setEdges('rising', 'rising');
      await sleep(120);
      const p2 = JSON.parse(window.wfgExportConfig());
      ok('4 兩邊同值時**要**寫舊欄位（給舊版讀）', p2.lsGlobal.cpv_trig_edge === 'rising',
         String(p2.lsGlobal.cpv_trig_edge));

      ok('0b 用的是真實設定檔', usedCfg, usedCfg ? 'WFG_TEST_CFG' : '內建 preset（相容性以外的斷言不受影響）');
    } catch (err) {
      R.push({ name: '🔴 probe 自己爆掉：' + (err && err.message), pass: false, extra: String((err && err.stack) || '').slice(0, 300) });
    }
    const REAL = ERRS.filter(e => !/ResizeObserver loop/.test(e));
    if (REAL.length) R.push({ name: '🔴 頁面丟出未處理的例外', pass: false, extra: REAL.slice(0, 3).join(' | ') });
    else R.push({ name: '頁面全程沒有未處理的例外（ResizeObserver 通知另計）', pass: true, extra: '' });
    document.title = 'UIPROBE' + JSON.stringify(R);
  })();
})();
