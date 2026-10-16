// v1.23.0 Benchmark 反推表格回歸（Bruce 10/12「做一個 Benchmark 的按鈕…下方會再多一個表格…填完…一鍵 Copy 回實際 Data Mapping 表格」；
// 按鈕名稱依 Bruce 10/12 定為「套用到主表」／確認視窗「套用到主表？」／「復原」）。
// 用法：node tools/check_datamap_bench.js [repo]（jsdom 用 repo node_modules；localStorage 用記憶體替身，可檢查存的內容）
//
// 矩陣：全部型號 × （MNT：全部 Preset；NB：Single／Dual）× Mirror 0/1 × CHRB 0/1（有該欄位才跑）；EN01 × 全部 Gate。
//   S1 結構一致：主表先 All Same X，打開 Benchmark（第一次＝全部 X）⇒ 兩張表的表頭、列名、每格（值、可否選、樣式 class、選項清單、T 標示）逐格相同。
//   S2 round-trip：在 Benchmark 每格用 UI 下拉選一個名稱 → 套用到主表 ⇒ 主表每格名稱＝Benchmark 每格名稱（含 Single 複本列）。
//   S3 復原：套用後按「復原」⇒ 主表全部欄位回到套用前。
//   S4 未填完：只填 3 格 → 按「套用到主表」⇒ 視窗標題「套用到主表？」、內容寫未填格數 → 只套用已填 ⇒ 只有那 3 格變、其他格保持原值；
//       按取消 ⇒ 主表不變。
// 另：localStorage 依型號／設定分開存、切換後還原；匯出／匯入 JSON；黃框標原表格最後改的格；收起時不產生 Benchmark 格子（不影響其他測試）。
'use strict';
const path = require('path');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const { JSDOM, VirtualConsole } = require(path.join(ROOT, 'node_modules/jsdom'));
const DM = require(path.join(ROOT, 'common/datamap-core.js'));
let pass = 0, fail = 0; const cnt = {};
const ok = (c, g, m) => { cnt[g] = (cnt[g] || 0) + 1; if (c) pass++; else { fail++; if (fail < 60) console.log('  ✗ [' + g + '] ' + m); } return c; };

(async () => {
  const LS = {};
  const vc = new VirtualConsole(); vc.on('jsdomError', e => { console.log('jsdomError', e.message); fail++; });
  const dom = await JSDOM.fromFile(path.join(ROOT, 'datamap.html'), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.WebSocket = function () { throw new Error('no ws'); };
      Object.defineProperty(w, 'localStorage', { configurable: true, value: { getItem: k => (k in LS ? LS[k] : null), setItem: (k, v) => { LS[k] = String(v); }, removeItem: k => { delete LS[k]; } } });
    } });
  await new Promise(r => dom.window.addEventListener('load', r));
  const w = dom.window, d = w.document, $ = id => d.getElementById(id), S = w.dmState, B = w.dmBench;
  const fire = (el, v) => { if (v !== undefined) { if (el.type === 'checkbox') el.checked = v; else el.value = v; } el.dispatchEvent(new w.Event('change')); };
  const setModel = k => { if ($('dm-model').value !== k) { fire($('dm-model'), k); if (!$('dm-ask').classList.contains('hidden')) $('dm-ask-yes').click(); } };
  const show = s => { S.cur = DM.cloneState(s); w.dmRender(); };
  const IGN = /^(chg|dm-bhit|dm-flashcol)$/;
  const snap = id => {
    const t = $(id); if (!t) return null;
    return { head: Array.from(t.querySelectorAll('thead th')).map(x => x.textContent),
      rows: Array.from(t.querySelectorAll('tbody tr')).map(tr => ({ th: tr.querySelector('th').textContent, cls: tr.className,
        tsel: (tr.querySelector('.dm-en01t') || {}).textContent,   // v1.35.19：T 唯讀標籤
        cells: Array.from(tr.querySelectorAll('select.dm-cell')).map(s => ({ v: s.value, dis: s.disabled, cls: Array.from(s.classList).filter(c => !IGN.test(c)).sort().join(' '),
          opts: Array.from(s.options).map(o => o.value).join(','), t: s.getAttribute('data-t'), tt: ((s.parentNode.querySelector('.dm-tt') || {}).textContent) || '' })) })) };
  };
  const diff = (a, b) => { const A = JSON.stringify(a), Bs = JSON.stringify(b); if (A === Bs) return ''; for (let i = 0; i < Math.max(A.length, Bs.length); i++) if (A[i] !== Bs[i]) return '…' + A.slice(Math.max(0, i - 60), i + 40) + ' ≠ …' + Bs.slice(Math.max(0, i - 60), i + 40); return '?'; };
  const en = k => DM.MODELS[k].kind === 'en01';
  const tabs = () => { const t = []; for (let r = 0; r < 24; r++) t.push(DM.en01RowT(S.cur, r)); return t; };   // v1.35.19：T 只由 FORCE_DE_SEL 推出
  const viewTxt = (k, s, r, c) => { const v = en(k) ? DM.en01CellView(s, r, c, tabs()[r]) : DM.cellView(k, s, r, c); return v.blank ? null : (v.std ? v.txt : '0x' + DM.hex(v.raw, 2)); };
  const allNames = (k, s) => { const o = []; const rows = en(k) ? DM.en01Rows(S.en01Seg) : [0, 1, 2, 3]; rows.forEach(r => { for (let c = 0; c < (en(k) ? 12 : 6); c++) o.push(viewTxt(k, s, r, c)); }); return o; };
  /* 和頁面 All Same Pixel 一樣：經 commit 的 firstEdit */
  const sameX = (k, s) => { const x = en(k) ? (DM.en01Gate(s) === 'off' ? null : DM.en01AllSame(s, 'X', DM.en01Rows(S.en01Seg), tabs())) : DM.allSame(k, s, 'X'); return x ? DM.firstEdit(k, s, x.state).state : s; };
  const bsel = (r, c) => $((en(S.model) ? 'dm-be' : 'dm-bc') + r + '-' + c);

  /* ── 收起時沒有 Benchmark 格子（其他 check_datamap_* 用 document 全域查詢不受影響） ── */
  ok($('dm-bench').classList.contains('hidden') && !$('dm-bgrid').querySelector('select'), 'closed', '預設收起、#dm-bgrid 沒有任何格子');
  ok($('dm-bench-tog').textContent.trim() === 'Benchmark' && $('dm-bench-apply').textContent.trim() === '套用到主表' && $('dm-bench-apply').title === '把 Benchmark 結果套用到 Data Mapping 表格' && $('dm-bench-undo').textContent.trim() === '復原', 'names',
    '按鈕名稱：Benchmark／套用到主表（title＝把 Benchmark 結果套用到 Data Mapping 表格）／復原：' + [$('dm-bench-tog').textContent, $('dm-bench-apply').textContent, $('dm-bench-apply').title, $('dm-bench-undo').textContent].join('｜'));

  /* ── 變化組合 ── */
  const hand = (k, s) => (en(k) ? DM.setHand(k, s, true) : ((s.hand | 0) ? s : (DM.setHand(k, s, true) || s)));
  const V = [];
  DM.SELECT_KEYS.forEach(k => {
    const bases = [];
    if (DM.MODELS[k].kind === 'mnt') DM.PRESETS.forEach((p, i) => { const s = hand(k, DM.applyPreset(k, hand(k, DM.emptyState(k)), i)); bases.push({ n: k + ' ' + p.name, s }); });
    else if (en(k)) DM.EN01_GATES.forEach(g => { const s = DM.setGate(k, hand(k, DM.emptyState(k)), g[0]); if (s) bases.push({ n: k + ' ' + g[0], s }); });
    else ['Single-Gate', 'Dual-Gate', 'Tri-Gate'].forEach(gt => { const s = DM.setGate(k, hand(k, DM.emptyState(k)), gt); if (s) bases.push({ n: k + ' ' + gt, s: hand(k, s) }); });
    const fm = DM.fieldById(k, 'mirror'), fc = DM.fieldById(k, 'chrb');
    bases.forEach(b => [0, 1].forEach(mi => [0, 1].forEach(ch => {
      if ((mi && !fm) || (ch && !fc)) return;
      const s = DM.cloneState(b.s); if (fm) s.mirror = mi; if (fc) s.chrb = ch;
      V.push({ k, n: b.n + (fm ? ' mir' + mi : '') + (fc ? ' chrb' + ch : ''), s });
    })));
  });
  console.log('組合數：' + V.length + '（' + DM.SELECT_KEYS.join('、') + '）');

  let nRT = 0, nCells = 0, nEmpty = 0;
  const T0 = Date.now(); let iv = 0;
  /* 分片平行跑：BM_SHARD=i/n（i 從 0 起）只跑第 i 片矩陣；其他檢查只在第 0 片跑 */
  const SH = (process.env.BM_SHARD || '0/1').split('/').map(Number);
  const ONLY = process.env.BM_ONLY || '';
  const FROM = +(process.env.BM_FROM || 0);
  for (const v of V.filter((x, i) => i >= FROM && i % SH[1] === SH[0] && (!ONLY || x.n.indexOf(ONLY) >= 0))) {
    $('dm-log').innerHTML = ''; $('dm-toasts').innerHTML = '';   // 記錄區會一直長，jsdom 越跑越慢
    iv++; if (process.env.BM_PROGRESS) process.stderr.write('[' + iv + '/' + V.length + '] ' + v.n + ' ' + ((Date.now() - T0) / 1000).toFixed(0) + 's fail=' + fail + '\n');
    /* EN01：jsdom 重建 288 格×最多 133 個選項（每個帶 inline style）一次約 45 秒（Chrome 實測 50ms）⇒
       一組跑完整 24 列，其餘用「code 只有 P1 段」的 6 列（頁面本來就支援的顯示方式），格位規則相同 */
    setModel(v.k); S.en01Seg = en(v.k) && v.n !== 'EN01 Dual-Gate mir0 chrb0' ? { p2: false, p3: false } : null; S.en01T = [];
    const X = sameX(v.k, v.s);
    show(X); B.clear(); B.open(true);
    /* S1 */
    const cells = B.cells(S.cur);
    if (!cells.length) nEmpty++;
    const sm = snap('dm-grid'), sb = snap('dm-bgrid');
    ok(!diff(sm, sb), 'S1', v.n + ' 主表（全 X）≠ Benchmark：' + diff(sm, sb));
    ok(cells.every(([r, c]) => bsel(r, c).value === 'X'), 'S1x', v.n + ' 第一次打開不是全部 X');
    if (!cells.length) continue;
    /* S2：UI 逐格選名稱（每格選目前選單裡第 (r×7＋c×3) 個非 X 名稱） */
    const before = DM.cloneState(S.cur);
    /* EN01 有 288 格（每格最多 133 個選項），jsdom 逐格重畫太慢：前 12 格走 UI 下拉，其餘用匯入 JSON 寫進同一組（同樣經 benchState 填回） */
    const uiCells = en(v.k) ? cells.slice(0, 12) : cells;
    for (const [r, c] of uiCells) {
      const sel = bsel(r, c), o = Array.from(sel.options).map(x => x.value).filter(x => x !== 'X' && x !== '__ns');
      if (o.length) fire(sel, o[(r * 7 + c * 3) % o.length]);
    }
    if (uiCells.length < cells.length) {
      const N = Object.assign({}, B.names());
      cells.slice(uiCells.length).forEach(([r, c]) => { const o = DM.en01Defs(tabs()[r]).map(x => x.name).filter(x => x !== 'X'); N[r + '-' + c] = o[(r * 7 + c * 3) % o.length]; });
      B._setNames(N);
      ok(+$('dm-bench').getAttribute('data-filled') === cells.length, 'S2', v.n + ' EN01 288 格填入後已填數＝' + $('dm-bench').getAttribute('data-filled'));
    }
    const bnames = allNames(v.k, B.state());
    const ret = B.apply(false); nRT++; nCells += cells.length;
    const mnames = allNames(v.k, S.cur);
    ok(ret && !ret.bad.length && JSON.stringify(mnames) === JSON.stringify(bnames), 'S2', v.n + ' 套用後主表≠Benchmark：' + diff(mnames, bnames) + (ret && ret.bad.length ? ' bad=' + ret.bad.join(',') : ''));
    ok(!diff(snap('dm-grid').rows.map(r => r.cells.map(c => c.v)), snap('dm-bgrid').rows.map(r => r.cells.map(c => c.v))), 'S2ui', v.n + ' 套用後兩張表畫面的值不同');
    /* S3 */
    ok(!$('dm-bench-undo').classList.contains('hidden'), 'S3', v.n + ' 套用後沒有出現「復原」');
    $('dm-bench-undo').click();
    ok(JSON.stringify(S.cur) === JSON.stringify(before), 'S3', v.n + ' 復原後主表≠套用前：' + diff(S.cur, before));
    ok($('dm-bench-undo').classList.contains('hidden'), 'S3', v.n + ' 復原只能一次（按後隱藏）');
    /* S4：主表換成原始設定（非全 X），Benchmark 只填 3 格 → UI 套用（部分） */
    show(v.s); B.clear(); B.open(true);
    const base = DM.cloneState(S.cur), pickN = cells.slice(0, 3);
    for (const [r, c] of pickN) { const sel = bsel(r, c), o = Array.from(sel.options).map(x => x.value).filter(x => x !== 'X' && x !== '__ns'); if (o.length) fire(sel, o[o.length - 1]); }
    const want = allNames(v.k, base), bst = B.state(), rowsK = en(v.k) ? DM.en01Rows(S.en01Seg) : [0, 1, 2, 3], W = en(v.k) ? 12 : 6;
    /* 預期：已填格＝Benchmark 名稱；Single 複本列跟著來源列；其他＝原值 */
    let exp = DM.cloneState(base);
    for (const [r, c] of pickN) { const nm = viewTxt(v.k, bst, r, c); const x = en(v.k) ? DM.en01Pick(exp, r, c, tabs()[r], nm) : DM.pickCell(v.k, exp, r, c, nm); if (x) exp = x.state; }
    const expN = allNames(v.k, DM.firstEdit(v.k, base, exp).state);
    const filled = +$('dm-bench').getAttribute('data-filled');
    $('dm-bench-apply').click();
    const askT = $('dm-ask-t').textContent, askD = $('dm-ask-d').textContent;
    ok(!$('dm-ask').classList.contains('hidden') && askT === '套用到主表？' && askD.indexOf('還有 ' + (cells.length - filled) + ' 格未填') >= 0, 'S4', v.n + ' 未填完的確認視窗：' + askT + '｜' + askD);
    $('dm-ask-no').click();
    ok(JSON.stringify(S.cur) === JSON.stringify(base), 'S4', v.n + ' 取消後主表有變');
    $('dm-bench-apply').click(); $('dm-ask-yes').click();
    const got = allNames(v.k, S.cur);
    ok(JSON.stringify(got) === JSON.stringify(expN), 'S4', v.n + ' 只套用已填：' + diff(got, expN));
    void want; void rowsK; void W;
    $('dm-bench-undo').click();
    ok(JSON.stringify(S.cur) === JSON.stringify(base), 'S4', v.n + ' 部分套用後復原≠套用前');
  }
  console.log('round-trip 組合 ' + nRT + '，Benchmark 格數合計 ' + nCells + '；無可填格（Gate 關／Tri／組合不符，只比結構）' + nEmpty);

  /* ── 全部填完時的確認視窗、localStorage 分型號／設定保存、黃框 ── */
  if (SH[0] === 0) {
    const k = 'E503'; setModel(k);
    const s0 = DM.setGate(k, DM.setHand(k, DM.emptyState(k), true), 'Dual-Gate'), X = sameX(k, s0);
    show(X); B.clear(); B.open(true);
    const cells = B.cells(S.cur);
    cells.forEach(([r, c]) => fire(bsel(r, c), 'R1'));
    $('dm-bench-apply').click();
    ok($('dm-ask-t').textContent === '套用到主表？' && $('dm-ask-d').textContent.indexOf(cells.length + ' 格') === 0 && $('dm-ask-yes').textContent === '套用', 'ask', '全部填完的確認視窗：' + $('dm-ask-t').textContent + '｜' + $('dm-ask-d').textContent);
    $('dm-ask-no').click();
    const keyD = B.key(), stored = JSON.parse(LS[B.lsKey] || '{}');
    ok(stored.all && stored.all[keyD] && Object.keys(stored.all[keyD].names).length === cells.length, 'ls', 'localStorage 存了這組（' + keyD + '）');
    /* 換到 Single：另一組，空的 */
    show(sameX(k, DM.setGate(k, S.cur, 'Single-Gate')));
    ok(B.key() !== keyD && +$('dm-bench').getAttribute('data-filled') === 0, 'ls', '換 Gate ⇒ 另一組（空的）：' + B.key());
    fire(bsel(0, 0), 'G2');
    /* 換型號再換回來 */
    setModel('EM02'); ok(+$('dm-bench').getAttribute('data-filled') === 0 || B.key().indexOf('EM02|') === 0, 'ls', '換型號 ⇒ 該型號自己的組');
    setModel(k); show(X);
    ok(B.key() === keyD && +$('dm-bench').getAttribute('data-filled') === cells.length && cells.every(([r, c]) => bsel(r, c).value === 'R1'), 'ls', '換回 E503 Dual ⇒ 原本填的還在');
    /* 重新載入頁面（同一個 localStorage）⇒ 還在、開合狀態也記得 */
    const dom2 = await JSDOM.fromFile(path.join(ROOT, 'datamap.html'), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
      beforeParse(w2) { w2.WebSocket = function () { throw new Error('no ws'); }; Object.defineProperty(w2, 'localStorage', { configurable: true, value: { getItem: kk => (kk in LS ? LS[kk] : null), setItem: (kk, vv) => { LS[kk] = String(vv); }, removeItem: kk => { delete LS[kk]; } } }); } });
    await new Promise(r => dom2.window.addEventListener('load', r));
    const w2 = dom2.window; w2.dmState.cur = DM.cloneState(X); w2.dmRender();
    ok(!w2.document.getElementById('dm-bench').classList.contains('hidden') && +w2.document.getElementById('dm-bench').getAttribute('data-filled') === cells.length, 'ls', '重新載入後：Benchmark 仍展開、E503 Dual 的 ' + cells.length + ' 格還在');
    dom2.window.close();
    /* 匯出 → 清空全部 → 匯入 */
    ok(!$('dm-bench-exp') && !$('dm-bench-imp') && !$('dm-bench-file'), 'nojson', 'v1.23.1：沒有匯出／匯入 JSON（Bruce 10/12「Benchmark 的表格不用匯出 JSON 跟匯入 JSON」）');
    B.clear(); ok(+$('dm-bench').getAttribute('data-filled') === 0, 'nojson', '清空重來 ⇒ 0 格');
    /* 黃框：原表格最後改的格（全 X 後改 Line 2-1 Data 4 ＝ R1） */
    show(X); fire($('dm-c2-3'), 'R1');
    const hits = Array.from(d.querySelectorAll('#dm-bgrid .dm-bhit')).map(s => s.id);
    ok(hits.length === 1 && hits[0] === 'dm-bc2-3' && !$('dm-bench-hit').classList.contains('hidden'), 'hit', '黃框只標 Benchmark 同一格：' + hits.join(','));
    fire($('dm-c2-3'), 'X');
    ok(!d.querySelector('#dm-bgrid .dm-bhit'), 'hit', '那格改回 X ⇒ 黃框消失');
    /* 收合（標題列）與收起（Benchmark 按鈕） */
    $('dm-bench-h').click(); ok($('dm-bench').classList.contains('dm-bfold') && $('dm-bench-h').getAttribute('aria-expanded') === 'false', 'fold', '點標題列 ⇒ 收合');
    $('dm-bench-h').click(); ok(!$('dm-bench').classList.contains('dm-bfold'), 'fold', '再點 ⇒ 展開');
    $('dm-bench-tog').click(); ok($('dm-bench').classList.contains('hidden') && $('dm-bench-tog').getAttribute('aria-expanded') === 'false', 'fold', '按 Benchmark ⇒ 收起');
  }
  console.log(Object.keys(cnt).map(g => g + ' ' + cnt[g]).join('、'));
  console.log((fail ? '✗' : '✓') + ' check_datamap_bench：' + pass + ' 通過、' + fail + ' 失敗');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
