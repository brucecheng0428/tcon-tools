// v1.19.0（Bruce 10/9）：③ TFT 接線圖「V 方向 Line 數」4／8／12 設定，與鎖定時 Gate Type 不可修改。
// 用法：node tools/check_datamap_vlines.js [repo]（預設＝本檔上一層；jsdom 用 repo node_modules；fixture 讀 tools/check_datamap_kickoff.js 的 FX.mir）
// 寫法照 10/9 去偶發：一律「等條件成立」（waitFor），不固定等待。
// 檢查：
//  A. V 方向 Line 數（多種架構 × CH1 左右 × 4／8／12）：
//     ・列數 data-nl ＝ max(所選, 垂直週期)；週期大於所選時設定旁有提示，否則沒有。
//     ・水平不變：Data 線條數、每條線 x、SVG 寬度、子像素格寬、格子 x 集合都和選 4 時相同；只有高度隨列數變。
//     ・選 4 時畫出的列（k < max(4,週期)）在選 8／12 時逐格相同（屬性與文字）；新增列＝第 k mod 週期列的資料（Hand 調暗時只比資料）。
//     ・接線：k < 原列數的每條接線名稱／長度／顏色相同。
//  B. 「回到初始設定」把 V 方向 Line 數回 4。
//  C. 鎖定：Gate Type 停用＋提示；送 change 也不會改到 TCON；比較表的列不變；解除鎖定後恢復可改；鎖定下 V 方向 Line 數照常可切。
const path = require('path'), fs = require('fs');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const { JSDOM, VirtualConsole } = require(path.join(ROOT, 'node_modules/jsdom'));
const KT = path.join(ROOT, 'tools/check_datamap_kickoff.js');
const FX = JSON.parse(/const FX = (\{.*?\});\n/s.exec(fs.readFileSync(KT, 'utf8'))[1]);
let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { fail++; if (fails.length < 40) fails.push(m); } };
const own = e => Array.from(e.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent).join('');

function parse(T) {
  const A = n => T.getAttribute(n);
  const o = { nl: +A('data-nl'), vper: +(A('data-vper') || A('data-nl')), nd: +A('data-nd'), hd: A('data-handdim') === '1', vlsel: A('data-vlsel'),
    w: A('width'), h: A('height'), vb: A('viewBox'), lines: [], cells: {}, wires: {}, cellX: new Set(), cellW: new Set() };
  T.querySelectorAll('path[data-dl]').forEach(e => o.lines.push(e.getAttribute('data-dl') + '@' + e.getAttribute('data-x')));
  T.querySelectorAll('rect[data-pv]').forEach(r => {
    const k = +r.getAttribute('data-pv').split(':')[0] - 1, x = r.getAttribute('x'), g = r.parentNode;
    o.cellX.add(x); o.cellW.add(r.getAttribute('width'));
    const at = {}; ['data-pv', 'data-dn', 'data-phys', 'data-mis', 'data-st', 'data-tier', 'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'data-col', 'data-in', 'width', 'x'].forEach(a => { at[a] = r.getAttribute(a); });
    const txt = Array.from(g.querySelectorAll('text')).map(t => own(t) + '/' + t.getAttribute('fill') + '/' + (t.getAttribute('opacity') || '')).join(';');
    o.cells[k + ':' + x] = { k, at, txt };
  });
  T.querySelectorAll('path[data-w]').forEach(e => { const [k, ...rest] = e.getAttribute('data-w').split(':'); o.wires[(k - 1) + ':' + rest.join(':')] = { len: e.getAttribute('data-len'), off: e.getAttribute('data-off'), col: e.getAttribute('stroke'), k: k - 1 }; });
  return o;
}

async function open() {
  const vc = new VirtualConsole(); vc.on('jsdomError', e => { fail++; fails.push('jsdomError ' + e.message); });
  const dom = await JSDOM.fromFile(path.join(ROOT, 'datamap.html'), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) { w.WebSocket = function () { throw new Error('no ws'); }; } });
  await new Promise(r => dom.window.addEventListener('load', r));
  const w = dom.window, d = w.document, $ = id => d.getElementById(id);
  const waitFor = async (fn, what, ms = 5000) => { const t0 = Date.now(); for (;;) { let v; try { v = fn(); } catch (e) { v = false; } if (v) return v; if (Date.now() - t0 > ms) { ok(false, '逾時：' + what); return false; } await new Promise(r => setTimeout(r, 10)); } };
  const fire = (el, v) => { if (el.type === 'checkbox') el.checked = v; else el.value = v; el.dispatchEvent(new w.Event('change')); };
  return { w, d, $, waitFor, fire };
}

const CORE = require(path.join(ROOT, 'common/datamap-core.js'));
function kmirState(mdl, extra) {
  const mr = FX.mir, rows = [mr.line0.c0, mr.line0.c1, mr.line1.c0, mr.line1.c1];
  const s = Object.assign(CORE.emptyState(mdl), { hand: 1, panel: 2, subPanel: 0, rd: 1, mirror: 1 }, extra || {});
  rows.forEach((r, i) => r.forEach((v, c) => { s['c' + (i * 6 + c)] = v; }));
  return s;
}

(async () => {
  const P = await open(), { w, $, waitFor, fire } = P;
  ok(w.TOOL_VERSIONS && /^v1\.(19|2\d)\./.test(w.TOOL_VERSIONS.datamap), '版號 ' + (w.TOOL_VERSIONS && w.TOOL_VERSIONS.datamap));
  const sel = $('dm-pv-vl');
  ok(sel && Array.from(sel.options).map(o => o.value).join(',') === '4,8,12' && sel.value === '4', 'V 方向 Line 數選單＝4／8／12、預設 4');
  const tft = () => $('dm-pv-tft');
  const setVl = async n => { fire(sel, String(n)); return waitFor(() => tft().getAttribute('data-vlsel') === String(n) && +tft().getAttribute('data-nl') >= n, 'V=' + n + ' 重畫'); };

  // ── A. 架構清單：kmir（EM02 HSD）、E501A（NB 2 列）、EM02／E512／EM01 Panel_mode × sub_panel（含 Zigzag 8 列）
  const cases = [];
  cases.push({ name: 'EM02 kmir', set: async () => { fire($('dm-model'), 'EM02'); await waitFor(() => $('dm-model').value === 'EM02', 'EM02'); w.dmState.cur = kmirState('EM02'); w.dmRender(); } });
  cases.push({ name: 'E501A 預設', set: async () => { fire($('dm-model'), 'E501A'); await waitFor(() => $('dm-model').value === 'E501A', 'E501A'); } });
  for (const mdl of ['EM02', 'E512', 'EM01']) for (let pm = 0; pm < 4; pm++) for (const sp of [0, 1, 2, 3, 4, 5, 6, 7])
    cases.push({ name: mdl + ' panel' + pm + ' sub' + sp, set: async () => { if ($('dm-model').value !== mdl) { fire($('dm-model'), mdl); await waitFor(() => $('dm-model').value === mdl, mdl); } w.dmState.cur = kmirState(mdl, { panel: pm, subPanel: sp, mirror: 0 }); w.dmRender(); } });

  // Line OD 測試來源各 Type（含 Zigzag 8 列、Tri）：EM02
  for (let i = 0; i < 64; i++) cases.push({ name: 'LOD#' + i, lod: i, set: async () => { if ($('dm-model').value !== 'EM02') { fire($('dm-model'), 'EM02'); await waitFor(() => $('dm-model').value === 'EM02', 'EM02'); }
    const L = $('dm-pv-lod'), op = Array.from(L.options).filter(o => o.value !== '' && +o.value >= 0)[i]; if (!op) return false; fire(L, op.value); return true; } });
  let nCase = 0; const shapes = {};
  for (const c of cases) for (const first of ['l', 'r']) {
    await setVl(4); if (await c.set() === false) continue; fire($('dm-pv-first'), first);
    if (!tft().querySelector('path[data-dl]') || $('dm-pvbody').classList.contains('hidden')) continue;
    const key = c.name + ' ' + first;
    const base = parse(tft()), v = base.vper || base.nl;
    const vper = Math.min(v, base.nl);   // data-vper 不存在時退回 nl
    ok(base.nl === Math.max(4, vper), key + ' V=4 列數 ' + base.nl + ' ≠ max(4,' + vper + ')');
    { const nt = $('dm-pv-vlnote').textContent; ok(vper > 4 ? nt.indexOf(String(vper)) >= 0 : nt === '', key + ' V=4 提示「' + nt + '」與週期 ' + vper + ' 不符'); }
    for (const n of [8, 12]) {
      await setVl(n);
      const b = parse(tft()), kk = key + ' V=' + n;
      shapes[c.name.replace(/ sub\d+/, '').replace(/LOD#\d+/, 'LOD') + '：週期' + vper + '→' + b.nl] = 1;
      ok(b.nl === Math.max(n, vper), kk + ' 列數 ' + b.nl + ' ≠ max(' + n + ',' + vper + ')');
      ok(b.vlsel === String(n), kk + ' data-vlsel');
      const note = $('dm-pv-vlnote').textContent;
      ok(vper > n ? note.indexOf(String(vper)) >= 0 : note === '', kk + ' 提示「' + note + '」與週期 ' + vper + ' 不符');
      // 水平不變
      ok(JSON.stringify(b.lines) === JSON.stringify(base.lines), kk + ' Data 線（條數／x）和 V=4 不同');
      ok(b.nd === base.nd, kk + ' data-nd 不同');
      ok(b.w === base.w, kk + ' SVG 寬度 ' + b.w + ' vs ' + base.w);
      ok(b.vb.split(' ')[2] === base.vb.split(' ')[2], kk + ' viewBox 寬度不同');
      ok([...b.cellX].sort().join() === [...base.cellX].sort().join() && [...b.cellW].join() === [...base.cellW].join(), kk + ' 格子 x／寬度不同');
      ok(b.nl === base.nl ? b.h === base.h : +b.h > +base.h, kk + ' 高度沒有隨列數變');
      // 原本的列逐格相同
      let same = 0;
      Object.keys(base.cells).forEach(ck => { const x = base.cells[ck], y = b.cells[ck];
        ok(y && JSON.stringify(x.at) === JSON.stringify(y.at) && x.txt === y.txt, kk + ' 原本列 格 ' + ck + ' 不同'); if (y) same++; });
      Object.keys(base.wires).forEach(wk => { const x = base.wires[wk], y = b.wires[wk]; ok(y && x.len === y.len && x.off === y.off && x.col === y.col, kk + ' 原本列 接線 ' + wk + ' 不同'); });
      // 新增列＝第 k mod 週期列
      const core = at => [at['data-pv'].replace(/^\d+:/, ''), at['data-dn'], at['data-phys'], at['data-mis'], at['data-st'], at['data-in']].join('|');
      Object.values(b.cells).forEach(y => { if (y.k < base.nl) return; const src = b.cells[(y.k % vper) + ':' + y.at.x];
        ok(src && core(src.at) === core(y.at), kk + ' 新增列 格 ' + y.k + ':' + y.at.x + ' ≠ 第 ' + (y.k % vper) + ' 列');
        if (b.hd) ok(y.at['data-tier'] !== 'main', kk + ' Hand 調暗：新增列不該有主循環格'); });
      const nRows = new Set(Object.values(b.cells).map(y => y.k)).size;
      ok(nRows === b.nl, kk + ' 實際畫出 ' + nRows + ' 列 ≠ data-nl ' + b.nl);
      nCase++;
    }
  }
  await setVl(4);
  { const L = $('dm-pv-lod'); fire(L, L.options[0].value); }

  // ── B. 回到初始設定 ⇒ V 方向 Line 數回 4（沒有匯入時也回）
  fire($('dm-model'), 'EM02'); await waitFor(() => $('dm-model').value === 'EM02', 'EM02');
  w.dmState.cur = kmirState('EM02'); w.dmRender();
  await setVl(12);
  const rr = w.dmRestoreInit(); if (rr && rr.then) await rr;
  await waitFor(() => sel.value === '4' && tft().getAttribute('data-vlsel') === '4' && +tft().getAttribute('data-nl') === Math.max(4, +tft().getAttribute('data-vper') || 4), '回到初始設定後 V=4');

  // ── C. 鎖定時 Gate Type 不可修改
  const gate = $('dm-gate'), note = $('dm-gate-locknote');
  ok(!gate.disabled, '未鎖定 Hand Mode：Gate Type 可改');
  const combos0 = $('dm-pv-combotbl').querySelectorAll('tr[data-combo]').length;
  const g0 = gate.value, st0 = JSON.stringify(w.dmState.cur);
  $('dm-pv-lock').click();
  await waitFor(() => gate.disabled && gate.getAttribute('data-hwlock') === '1', '鎖定後 Gate Type 停用');
  ok(!note.classList.contains('hidden'), '鎖定後 Gate Type 旁出現 🔒 提示');
  ok(gate.title && gate.title.indexOf('Gate Type') >= 0, '鎖定後 Gate Type 滑鼠提示');
  ok(!$('dm-pv-vl').disabled, '鎖定時 V 方向 Line 數仍可切');
  const combosL = Array.from($('dm-pv-combotbl').querySelectorAll('tr[data-combo]')).map(r => r.getAttribute('data-combo')).join();
  // 停用時即使有程式送 change 也不能改 TCON
  const other = Array.from(gate.options).map(o => o.value).find(v => v && v !== g0);
  ok(!!other, 'Gate Type 有其他選項可試');
  gate.disabled = false; gate.value = other; gate.dispatchEvent(new w.Event('change'));
  await waitFor(() => gate.value === g0 && gate.disabled, '鎖定時送 change 後 Gate Type 回原值');
  ok(JSON.stringify(w.dmState.cur) === st0, '鎖定時 Gate Type change 沒有改到 TCON 狀態');
  ok(Array.from($('dm-pv-combotbl').querySelectorAll('tr[data-combo]')).map(r => r.getAttribute('data-combo')).join() === combosL, '鎖定時比較表的列不變');
  ok(!/Gate 類型／週期和鎖定的架構不同/.test($('dm-pvnote').textContent), '鎖定後沒有出現架構不符提示');
  // 鎖定下切 V＝8／12：列數照規則、無架構不符
  for (const n of [8, 12]) { await setVl(n); const b = parse(tft()); ok(b.nl === Math.max(n, b.vper || 4), '鎖定 V=' + n + ' 列數 ' + b.nl); ok(!tft().querySelector('[data-lockng="1"]'), '鎖定 V=' + n + ' 無不符標記屬性'); }
  await setVl(4);
  // 解除鎖定 ⇒ Gate Type 恢復可改、提示消失，change 生效
  $('dm-pv-lock').click();
  await waitFor(() => !gate.disabled && gate.getAttribute('data-hwlock') === '0', '解鎖後 Gate Type 可改');
  ok(note.classList.contains('hidden') && !gate.title, '解鎖後提示消失');
  fire(gate, other);
  await waitFor(() => gate.value === other, '解鎖後 Gate Type 可改成 ' + other);
  ok($('dm-pv-combotbl').querySelectorAll('tr[data-combo]').length > 0 && combos0 > 0, '比較表有列');

  fails.forEach(f => console.log('✗', f));
  console.log('結構：', Object.keys(shapes).sort().join('；'));
  console.log((fail ? '✗ ' : '✓ ') + 'VLINES', nCase, 'cases (×8/12);', pass, 'checks pass,', fail, 'fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('✗ 例外', e && e.stack); process.exit(1); });
