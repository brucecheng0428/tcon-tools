// v1.37.0 EN01 Benchmark「自動反推」回歸（Bruce 2026-10-21「為何 EN01 的 DataMap 網頁它沒有反推的功能？」→「可以，可以派人做」；派工 238563327454375936）
// 用法：node tools/check_datamap_en01rev.js [repo]      （EN01REV_FULL=1 另跑 MUX6 全 288 格一次，jsdom 建頁要 10 分鐘以上）
//   E1 已知接線：tools/datamap_en01_xlsm_examples.json（E507 xlsm 原廠範例）每種 Gate／MUX 取一組 Mirror 0 當鎖定接線（＝已知正確的 Data Mapping），
//      改 Driver／面板 6 種（對調、SHL、BGR、CH1、對調＋BGR、SHL＋CH1）→ 自動反推（DRY：只算不套用）⇒ 0 錯，且用完整評分驗算 0 錯（每個子像素收到的＝鎖定時的）。
//      xlsm 的 Mirror 1 範例不拿來當鎖定接線：鎖定當下就有錯（只有第 0 循環有填、其他填 0，見 assistant_kb 型號/EN01 §7.4），不是正確接線。
//      Mirror 1 改用「CH1 在右的 0 錯解」當鎖定接線（Mirror 1、CH1 右），再改其他設定／CH1 改回左 ⇒ 0 錯（Single／Dual／MUX2；MUX3／4 見下方註解）。
//      MUX6 的 CH1 換邊：網頁模型下改 TCON 設定改不回來（不限時間＋FORCE_DE_SEL 8 bit 窮舉最少 168 錯）⇒ 預期「有錯、不套用」，列出不算失敗。
//   E2 改回鎖定時的 Driver／面板再反推 ⇒ ②-2 每格、Mirror／CHRB／READ_RVS 回到原本接線（算回已知接線）。
//   E3 快速路徑＝逐格下降：≤96 格的組合另用逐格下降（現行演算法）算一次，結果 state 逐欄相同。
//   E4 多組 0 錯解：rev.zero＝0 錯候選去重後的組數，>1 時結果行有「共 N 組」。
//   E5 頁面：EN01 有「自動反推」按鈕、沒有舊的「EN01 不提供」說明；實際套用（非 DRY）⇒ Hand 開、呼吸燈 0、可復原。
//   E6 非同步：按鈕路徑（reverseAsync）結果＝同步；取消 ⇒ 設定不變、結果行「已取消」；計算中改設定 ⇒ 結果作廢不套用。
'use strict';
const path = require('path'), fs = require('fs');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const { JSDOM, VirtualConsole } = require(path.join(ROOT, 'node_modules/jsdom'));
let pass = 0, fail = 0; const cnt = {}, fails = [];
const ok = (c, g, m) => { cnt[g] = (cnt[g] || 0) + 1; if (c) pass++; else { fail++; if (fails.length < 80) fails.push('[' + g + '] ' + m); } return c; };
(async () => {
  const LS = {};
  const vc = new VirtualConsole(); vc.on('jsdomError', e => { fails.push('jsdomError ' + e.message); fail++; });
  const dom = await JSDOM.fromFile(path.join(ROOT, 'datamap.html'), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) { w.WebSocket = function () { throw new Error('no ws'); }; Object.defineProperty(w, 'localStorage', { configurable: true, value: { getItem: k => (k in LS ? LS[k] : null), setItem: (k, v) => { LS[k] = String(v); }, removeItem: k => { delete LS[k]; } } }); } });
  await new Promise(r => dom.window.addEventListener('load', r));
  const w = dom.window, d = w.document, $ = id => d.getElementById(id), B = w.dmBench, S = w.dmState, DM = w.TCONDataMap;
  const fire = (el, v) => { if (v !== undefined) { if (el.type === 'checkbox') el.checked = v; else el.value = v; } el.dispatchEvent(new w.Event('change')); };
  const HW = { swap: ['dm-pv-swap', false, true], shl: ['dm-pv-drv', 'f', 'r'], bgr: ['dm-pv-stripe', 'rgb', 'bgr'], ch1: ['dm-pv-first', 'l', 'r'] };
  const hwSet = on => Object.keys(HW).forEach(k => { const want = on.includes(k) ? HW[k][2] : HW[k][1], el = $(HW[k][0]); if ((el.type === 'checkbox' ? el.checked : el.value) !== want) fire(el, want); });
  const hwReset = () => { if ($('dm-pv-lock').getAttribute('data-locked') === '1') $('dm-pv-lock').click(); B.open(false); hwSet([]); };
  const KEYS = /^(e\d+|mirror|chrb|rvsL|rvsH|deSel|deEn|panel|subPanel|rd|hand|hsdInv)$/;
  const regs = st => JSON.stringify(Object.keys(st).filter(k => KEYS.test(k)).sort().map(k => k + '=' + (st[k] >>> 0)));
  const tbl = st => JSON.stringify(Object.keys(st).filter(k => /^(e\d+|mirror|chrb|rvsL|rvsH)$/.test(k)).sort().map(k => k + '=' + (st[k] >>> 0)));
  fire($('dm-model'), 'EN01'); if (!$('dm-ask').classList.contains('hidden')) $('dm-ask-yes').click();
  const EX = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/datamap_en01_xlsm_examples.json'), 'utf8'));
  const RD = { 1: 0, 2: 1, 3: 2, 4: 3, 6: 5 };
  const pickEx = [], seen = {};
  EX.forEach(e => { const k = e.sheet + '|' + e.m; if (e.mirror !== 0 || seen[k]) return; seen[k] = 1; pickEx.push(e); });
  const build = e => {
    const s = DM.emptyState('EN01'); s.hand = 1; s.deEn = 1; s.rd = RD[e.m]; s.deSel = 1 << e.sFirst; s.mirror = e.mirror ? 1 : 0; s.rvsL = e.mirror ? 0xFF : 0;
    if (/^MUX[23]$/.test(e.sheet)) { s.panel = 3; s.subPanel = s.rd === 1 ? 1 : 0; }
    for (let L = 0; L < 4; L++) for (let j = 0; j < e.m; j++) for (let c = 0; c < 12; c++) s['e' + ((L * 6 + j) * 12 + c)] = e.codes[c][j];
    return s;
  };
  /* jsdom 整頁 render 的 ② EN01 下拉很慢（MUX6 288 格要數分鐘）⇒ 只顯示 Line 1～2（P1，MUX4／MUX6 加 P2：一條 line 的全部 SW）；反推的格子＝畫面顯示的格子 */
  const segOf = m => (m <= 3 ? { p2: false, p3: false } : { p2: true, p3: false });
  const CHG = [['swap'], ['shl'], ['bgr'], ['ch1'], ['swap', 'bgr'], ['shl', 'ch1']];
  const T = []; let tMax = 0, tMaxTag = '';
  const setup = (e, seg) => { hwReset(); S.cur = build(e); S.en01Seg = seg; w.dmRender(); $('dm-pv-lock').click(); B.open(true); };
  /* ── E5（頁面）：EN01 鎖定＋Benchmark ⇒ 有按鈕、沒有舊說明 ── */
  setup(pickEx[0], segOf(pickEx[0].m));
  ok(!!$('dm-bench-rev') && !$('dm-bench-reven01') && !/不提供自動反推/.test($('dm-bench').textContent), 'E5', 'EN01 鎖定＋Benchmark：有「自動反推」按鈕、沒有「EN01 不提供」說明');
  ok(!!$('dm-bench-revx') && $('dm-bench-revx').classList.contains('hidden'), 'E5', '取消鈕平常隱藏');
  /* ── E1～E4 ── */
  const NOSOL = []; const noSol = (e, chg) => e.m === 6 && chg.includes('ch1');
  const runCase = (tagE, nCells, chg, base, slowOK) => {
    const tag = tagE + ' × ' + (chg.length ? chg.join('+') : '（全部改回）');
    hwSet(chg);
    const e1 = B.lockErr().bad, t0 = Date.now(), R = B.reverse(), dt = Date.now() - t0;
    if (dt > tMax) { tMax = dt; tMaxTag = tag; }
    T.push({ tag, cells: nCells, before: e1, ms: R && R.rev && R.rev.ms, wall: dt, evals: R && R.rev && R.rev.evals, fast: R && R.rev && R.rev.fast, zero: R && R.rev && R.rev.zero, bad: R && R.bad, mir: R && R.st && R.st.mirror, chrb: R && R.st && R.st.chrb });
    if (base.nosol) { NOSOL.push(tag + '：最少 ' + (R && R.bad) + ' 錯（改後 ' + e1 + '）'); ok(R && R.dry && R.bad > 0 && e1 > 0, 'E1', tag + '：預期無 0 錯解'); return R; }
    ok(R && R.dry && R.bad === 0, 'E1', tag + '：反推 0 錯（改後 ' + e1 + '、反推 ' + (R && R.bad) + '：' + (R && R.rev && R.rev.txt) + '）');
    ok(R && R.st && B.evalErr(R.st) === 0, 'E1', tag + '：完整評分驗算 0 錯');
    ok(R && R.rev && (R.rev.zero > 1) === /共 \d+ 組 0 錯解/.test(R.rev.txt), 'E4', tag + '：多解提示與組數一致（zero ' + (R && R.rev && R.rev.zero) + '）');
    if (slowOK) {
      B.slow(true); const t1 = Date.now(), R2 = B.reverse(), dt2 = Date.now() - t1; B.slow(false);
      T[T.length - 1].slowMs = dt2; T[T.length - 1].slowEvals = R2 && R2.rev && R2.rev.evals;
      ok(R2 && R && regs(R2.st) === regs(R.st) && R2.bad === R.bad, 'E3', tag + '：快速路徑＝逐格下降（逐欄相同；快 ' + dt + ' ms／逐格 ' + dt2 + ' ms）');
    }
    return R;
  };
  for (const e of pickEx) {
    const seg = segOf(e.m), tagE = e.sheet + ' m' + e.m + ' 列' + e.row0;
    console.log('… ' + tagE + '（' + new Date().toTimeString().slice(0, 8) + '）'); setup(e, seg);
    const nCells = B.cells(S.cur).length, G = tbl(S.glass), e0 = B.lockErr();
    ok(e0 && e0.bad === 0, 'E1', tagE + '：鎖定當下 0 錯（' + (e0 && e0.bad) + '）');
    B.dry(true);
    let chSol = null;
    for (const chg of CHG) {
      const R = runCase(tagE + ' Mirror0', nCells, chg, { nosol: noSol(e, chg) }, nCells <= 96 && ['swap', 'ch1'].includes(chg.join()));
      if (chg.join() === 'ch1' && R && R.bad === 0) chSol = R.st;
    }
    hwSet([]);
    const R0 = B.reverse();
    ok(R0 && R0.bad === 0 && tbl(R0.st) === G, 'E2', tagE + '：改回鎖定時設定 ⇒ ②-2 每格與 Mirror／CHRB／READ_RVS 回到原本接線');
    B.dry(false);
    /* Mirror 1 鎖定接線＝CH1 在右的 0 錯解。只做 Single／Dual／MUX2（每條 line ≤2 段）：MUX3 的這組解拿來重新鎖定時，鎖定當下就有 96 錯（MUX＋Mirror 走線是推論，§7.4／9.5）；
       MUX4 由它改回 CH1 左，不限時間＋第二層全展開也最少 96 錯（原本的 Mirror 0 表在這個鎖定下 192 錯）＝模型限制，不是搜尋漏掉（2026-10-21 實測 exp_derived） */
    if (chSol && e.m <= 2) {
      ok((chSol.mirror | 0) === 1, 'E1', tagE + '：CH1 換邊的 0 錯解用 Mirror 1');
      hwReset(); hwSet(['ch1']); S.cur = DM.cloneState(chSol); S.en01Seg = seg; w.dmRender(); $('dm-pv-lock').click(); B.open(true);
      const G1 = tbl(S.glass), e01 = B.lockErr().bad;
      ok(e01 === 0, 'E1', tagE + ' Mirror1（CH1 右）：鎖定當下 0 錯（' + e01 + '）');
      B.dry(true);
      for (const chg of [['ch1', 'swap'], ['ch1', 'shl'], ['ch1', 'bgr'], [], ['swap', 'bgr']]) runCase(tagE + ' Mirror1（CH1 右鎖定）', nCells, chg, {}, false);
      hwSet(['ch1']); const R1 = B.reverse();
      ok(R1 && R1.bad === 0 && tbl(R1.st) === G1, 'E2', tagE + ' Mirror1：改回鎖定時設定 ⇒ 回到鎖定接線');
      B.dry(false);
    }
  }
  /* ── E5 實際套用（非 DRY）＋復原 ── */
  {
    const e = pickEx.find(x => x.sheet === 'HSD' && !x.mirror) || pickEx[0];
    setup(e, segOf(e.m)); hwSet(['ch1', 'bgr']);
    const pre = JSON.stringify(S.cur), e1 = B.lockErr().bad, R = B.reverse();
    ok(R && R.applied === true && R.bad === 0 && B.lockErr().bad === 0 && S.cur.hand === 1 && $('dm-bench-revst').textContent === R.txt, 'E5', 'HSD CH1＋BGR 實際套用：0 錯、Hand 開、結果行＝' + ($('dm-bench-revst') || {}).textContent + '（改後 ' + e1 + '）');
    ok(!$('dm-bench-undo').classList.contains('hidden'), 'E5', '套用後可復原');
    $('dm-bench-undo').click();
    ok(JSON.stringify(S.cur) === pre, 'E5', '復原回到反推前');
  }
  /* ── E6 非同步（按鈕路徑） ── */
  {
    const e = pickEx.find(x => x.sheet === 'MUX4') || pickEx[0];
    setup(e, segOf(e.m)); hwSet(['shl', 'ch1']);
    B.dry(true); const Rs = B.reverse(); B.dry(false);
    const pre = JSON.stringify(S.cur);
    let p = B.reverseAsync();
    ok(B.running() && $('dm-bench-rev').disabled && !$('dm-bench-revx').classList.contains('hidden') && /計算中/.test($('dm-bench-revst').textContent), 'E6', '計算中：按鈕停用、顯示取消鈕與進度「' + $('dm-bench-revst').textContent + '」');
    B.cancel(); let R = await p;
    ok(R && R.bad === -2 && JSON.stringify(S.cur) === pre && !B.running() && /已取消/.test($('dm-bench-revst').textContent), 'E6', '取消 ⇒ 設定不變、結果行「' + $('dm-bench-revst').textContent + '」');
    p = $('dm-bench-rev').click() || null; ok(B.running(), 'E6', '按按鈕 ⇒ 分段執行');
    for (let i = 0; i < 6000 && B.running(); i++) await new Promise(r => setTimeout(r, 10));
    ok(!B.running() && B.lockErr().bad === 0 && Rs && tbl(S.cur) === tbl(Rs.st) && /反推完成/.test($('dm-bench-revst').textContent), 'E6', '按鈕（分段）結果＝同步結果、0 錯：' + $('dm-bench-revst').textContent);
    $('dm-bench-undo').click();
    const pre2 = JSON.stringify(S.cur);
    p = B.reverseAsync(); fire($(HW.bgr[0]), 'bgr'); R = await p;
    ok(R && R.bad === -2 && JSON.stringify(S.cur) === pre2 && /作廢/.test($('dm-bench-revst').textContent), 'E6', '計算中改設定 ⇒ 結果作廢、不套用：' + $('dm-bench-revst').textContent);
  }
  /* ── 選配：MUX6 全 288 格 ── */
  if (process.env.EN01REV_FULL) {
    const e = pickEx.find(x => x.sheet === 'MUX6');
    hwReset(); S.cur = build(e); S.en01Seg = { p2: false, p3: false }; w.dmRender(); $('dm-pv-lock').click(); B.open(true); S.en01Seg = null; w.dmPvRender();
    B.dry(true);
    for (const chg of CHG) { hwSet(chg); const t0 = Date.now(), R = B.reverse(), dt = Date.now() - t0; T.push({ tag: 'MUX6 全 288 格 × ' + chg.join('+'), cells: B.cells(S.cur).length, ms: R.rev.ms, wall: dt, evals: R.rev.evals, fast: R.rev.fast, zero: R.rev.zero, bad: R.bad }); ok(R.bad === 0 && B.evalErr(R.st) === 0, 'E1', 'MUX6 288 格 × ' + chg.join('+') + ' 0 錯（' + dt + ' ms）'); }
    B.dry(false);
  }
  hwReset();
  const out = process.env.EN01REV_OUT || '/tmp/en01rev_timing.json';
  fs.writeFileSync(out, JSON.stringify(T, null, 1));
  console.log('timing → ' + out + '；最慢 ' + tMax + ' ms（' + tMaxTag + '）');
  console.log('預期無 0 錯解（MUX6 CH1 換邊）' + NOSOL.length + '：' + NOSOL.join('；'));
  console.log(Object.keys(cnt).map(k => k + ' ' + cnt[k]).join('  '));
  fails.forEach(f => console.log('  ✗ ' + f));
  console.log((fail ? 'FAIL' : 'PASS') + ' ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
})();
