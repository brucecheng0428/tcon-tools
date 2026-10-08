// v1.18.24（Bruce 10/8）：③ 垂直重複到 max(4, 垂直週期) 列、水平擴到 24 條 Data 線後的比對。
// 用法：node tools/check_datamap_svg_rep.js /tmp/dm1175wt . tools/check_datamap_kickoff.js <蘇坤 EM02 bin>（全民 code 讀 /tmp/qm.bin）
// 方法（未鎖定；資料組 qm／sk／kmir × Mirror 0/1 × CH1 左右 × SHL × RGB/BGR × 輸出對調 ＝ 96 種，同 check_datamap_svg_vs_tag.js --sem）：
//  A. 原本的部分與 v1.17.5 語意相同（不比座標，因為多畫的線／列會改變 SVG 寬高、繞線軌道數與 CH1 在右時的翻轉基準）：
//     ・Data 線：v1.17.5 的第 p 條（共 2×週期）對應新版第 p＋off 條（CH1 在左 off＝0；CH1 在右 off＝新條數−2×週期，因為主循環是最左那組＝最後一個週期）。
//       比 SD Out 標號文字、TCON Out（Data k）文字／顏色／透明度、data-src（扣 off）、主／重複、data-gap（扣 off 個週期的位移）。
//     ・接線（每列 × 每條線 × 上下 gate）：TFT 送的名稱、drain 長度、是否畫面外、顏色。
//     ・子像素格（原本的列，位置 s 以格子 x 換算、CH1 在右時扣平移）：data-pv、實體顏色；data-in 只留原本那 2×週期條線（換成舊編號）後必須相同；
//       沒有被新增線接到的格子，格內文字、顏色、亮暗層次、外框、滑鼠提示也必須相同；被新增線接到的格子，舊版必須是前後循環或 dummy（記數）。
//     ・Gate 標籤（原本的列）、最長 drain／左右不均（data-maxlen、bal 等）相同。
//  B. 新增部分是週期重複：
//     ・垂直：第 k 列（k ≥ 原本列數 v）的每一格、每條接線＝第 k mod v 列（格內文字、顏色、層次、data-in、接線名稱／長度／顏色）；
//       Line／G 編號照實際順序、重複列不標「第二組」。
//     ・水平：第 p 條（p ≥ 週期 n）的 data-gap＝第 p−n 條＋pSub、data-src＝第 p−n 條＋n、TCON Out 文字相同、SD Out 標號照實際順序；
//       每條接線的目標格＝第 p−n 條的目標格往右 pSub 格（畫面外除外）、drain 長度相同；主循環只有一個週期（n 條）。
const path = require('path'), fs = require('fs');
const [BASE, NEW, KT, SK] = process.argv.slice(2).map((x, i) => i < 2 ? path.resolve(x) : x);
const FX = JSON.parse(/const FX = (\{.*?\});\n/s.exec(fs.readFileSync(KT, 'utf8'))[1]);
const { JSDOM } = require(path.join(__dirname, '..', 'node_modules/jsdom'));
const LX = 92, PIT = 58;
let pass = 0, fail = 0; const fails = [];
const cats = {};
const ok = (c, m) => { if (c) pass++; else { fail++; if (fails.length < 30) fails.push(m); const cat = m.replace(/^\S+ M\d \S+ /, '').replace(/ vs .*$/, '').replace(/[\d:]+/g, 'N').slice(0, 90); cats[cat] = (cats[cat] || 0) + 1; } };
const own = e => Array.from(e.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent).join('');
function parse(T) {
  const A = n => T.getAttribute(n), npre = +(A('data-npre') || 0), smin = -npre;
  const o = { nd: +(A('data-nd') || 0), nl: +(A('data-nl') || 0), vper: +(A('data-vper') || 0), n: +A('data-plines'), pSub: +A('data-period'), fl: A('data-dir') === 'rl',
    glob: ['data-maxlen', 'data-maxlen0', 'data-bal', 'data-bal0', 'data-swap', 'data-ng', 'data-npre'].map(a => a + '=' + A(a)).join(' '), lines: {}, cells: {}, wires: {}, glab: [] };
  const byX = {};
  T.querySelectorAll('path[data-dl]').forEach(e => { const p = +e.getAttribute('data-dl') - 1; o.lines[p] = { gap: +e.getAttribute('data-gap'), src: +e.getAttribute('data-src'), rep: e.getAttribute('data-rep') }; byX[e.getAttribute('data-x')] = p; });
  if (!o.nd) o.nd = Object.keys(o.lines).length;
  T.querySelectorAll('text[data-dlab]').forEach(e => { const p = byX[String(Math.round(+e.getAttribute('x')))]; if (p !== undefined) o.lines[p].dlab = own(e); });
  T.querySelectorAll('text[data-dof]').forEach(e => { const p = byX[String(Math.round(+e.getAttribute('x')))]; if (p !== undefined) o.lines[p].dof = [own(e), e.getAttribute('data-dof'), (e.closest('[data-rep]') || e.getAttribute('opacity') === '0.6') ? 'R' : 'M'].join('|'); });
  T.querySelectorAll('rect[data-pv]').forEach(r => {
    const k = +r.getAttribute('data-pv').split(':')[0] - 1, s = Math.round((+r.getAttribute('x') - LX - 10) / PIT) + smin, g = r.parentNode;
    const at = {}; ['data-pv', 'data-dn', 'data-phys', 'data-mis', 'data-st', 'data-tier', 'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'data-col'].forEach(a => { at[a] = r.getAttribute(a); });
    const txt = Array.from(g.querySelectorAll('text')).map(t => own(t) + '/' + t.getAttribute('fill') + '/' + (t.getAttribute('opacity') || '')).join(';');
    const ti = g.querySelector('title'); o.cells[k + ':' + s] = { k, s, at, txt, tip: ti ? ti.textContent : '', inn: (r.getAttribute('data-in') || '').split(',').filter(Boolean) };
  });
  T.querySelectorAll('path[data-w]').forEach(e => { const [k, dp, ud, ...nm] = e.getAttribute('data-w').split(':'); o.wires[(k - 1) + ':' + (dp.slice(1) - 1) + ':' + ud] = { name: nm.join(':'), len: e.getAttribute('data-len'), off: e.getAttribute('data-off'), col: e.getAttribute('stroke') }; });
  T.querySelectorAll('text[data-glabel]').forEach(e => { const sub = e.nextElementSibling && e.nextElementSibling.hasAttribute('data-gsub') ? own(e.nextElementSibling) : ''; o.glab.push({ y: +e.getAttribute('y'), main: own(e), sub }); });
  o.glab.sort((a, b) => a.y - b.y);
  return o;
}
const edge = { wires: 0, cells: 0, keys: {} };
function compareOld(key, a, b) {
  edge.keys = {};
  const n = a.n, nOld = 2 * n, off = b.fl ? b.nd - nOld : 0, goff = b.fl ? b.pSub * (b.nd / n - 2) : 0, vper = b.vper;
  ok(a.n === b.n && a.pSub === b.pSub && a.fl === b.fl, key + ' 週期／方向不同');
  ok(a.glob === b.glob, key + ' 全域屬性不同 ' + a.glob + ' vs ' + b.glob);
  ok(Object.keys(a.lines).length === nOld, key + ' 舊版線數≠2×週期');
  for (let p = 0; p < nOld; p++) {
    const L = a.lines[p], M = b.lines[p + off];
    ok(M && L.dlab === M.dlab && L.dof === M.dof && L.rep === M.rep && L.src === M.src - off && L.gap === M.gap - goff, key + ' Data 線 ' + p + ' 不同 ' + JSON.stringify(L) + ' vs ' + JSON.stringify(M));
  }
  const oldNl = Math.max(...Object.values(a.cells).map(c => c.k)) + 1;
  ok(oldNl === vper, key + ' 原本列數 ' + oldNl + ' ≠ 新版垂直週期 ' + vper);
  // 接線：同一個模型索引 p 的 TFT 名稱（② 解出的資料）必須相同；畫面上對應的那條（p＋off）drain 長度、畫面外與否、顏色必須相同
  Object.keys(a.wires).forEach(wk => { const [k, p, ud] = wk.split(':'); const W = a.wires[wk], U = b.wires[wk], V = b.wires[k + ':' + (+p + off) + ':' + ud];
    ok(U && W.name === U.name, key + ' 接線名稱 ' + wk + ' 不同 ' + W.name + ' vs ' + (U && U.name));
    // 舊版畫面外（右界只到第 2×週期條線）的重複線，新版右界變寬後落在畫面內 ⇒ 允許，記數
    if (V && W.off === '1' && V.off === '0' && a.lines[p].rep === '1') { edge.wires++; edge.keys[k + ':' + (+p + off) + ':' + ud] = 1; return; }
    ok(V && W.len === V.len && W.off === V.off && W.col === V.col, key + ' 接線 ' + wk + ' 長度／畫面外／顏色不同 ' + JSON.stringify(W) + ' vs ' + JSON.stringify(V)); });
  ok(JSON.stringify(a.glab.map(g => g.main + '|' + g.sub)) === JSON.stringify(b.glab.slice(0, a.glab.length).map(g => g.main + '|' + g.sub)), key + ' 原本列的 Gate 標籤不同');
  const sOff = b.fl ? b.pSub * (b.nd / n - 2) : 0, mapIn = x => { const m = /^D(\d+)(.*)$/.exec(x), p = +m[1] - 1 - off; return p >= 0 && p < nOld ? 'D' + (p + 1) + m[2] : null; };
  let extra = 0, same = 0;
  Object.values(a.cells).forEach(c => {
    const d = b.cells[c.k + ':' + (c.s + sOff)];
    if (!d) { ok(false, key + ' 缺格 ' + c.k + ':' + c.s); return; }
    const fin = d.inn.map(mapIn).filter(Boolean);
    ok(fin.join(',') === c.inn.join(','), key + ' 格 ' + c.k + ':' + c.s + ' data-in ' + c.inn + ' vs ' + d.inn);
    ok(c.at['data-pv'] === d.at['data-pv'] && c.at['data-phys'] === d.at['data-phys'], key + ' 格 ' + c.k + ':' + c.s + ' 名稱／實體色不同');
    if (fin.length === d.inn.length) {
      same++;
      ok(JSON.stringify(c.at) === JSON.stringify(d.at) && c.txt === d.txt && c.tip === d.tip, key + ' 格 ' + c.k + ':' + c.s + ' 內容不同 ' + JSON.stringify(c.at) + c.txt + ' vs ' + JSON.stringify(d.at) + d.txt);
    } else { extra++; ok(c.at['data-tier'] !== 'main', key + ' 格 ' + c.k + ':' + c.s + ' 舊版主循環卻被新增線接到'); }
  });
  // 原本的列裡，舊版沒有的格子不能被原本那 2×週期條線接到
  Object.values(b.cells).forEach(d => { if (d.k >= vper) return; if (a.cells[d.k + ':' + (d.s - sOff)]) return;
    const hitOrig = d.inn.filter(x => mapIn(x)), bad = hitOrig.filter(x => { const m = /^D(\d+)(.*)$/.exec(x); return !edge.keys[d.k + ':' + (m[1] - 1) + ':' + m[2]]; });
    if (hitOrig.length && !bad.length) edge.cells++;
    ok(!bad.length, key + ' 新格 ' + d.k + ':' + d.s + ' 被原本的線接到（且舊版不是畫面外）' + bad); });
  return { extra, same };
}
function checkPeriodic(key, b) {
  const n = b.n, nd = b.nd, v = b.vper, pSub = b.pSub;
  ok(nd >= 24 && nd % n === 0 && nd >= 2 * n, key + ' 線數 ' + nd + ' 不是 ≥24 的週期倍數');
  ok(b.nl === Math.max(4, v), key + ' 列數 ' + b.nl + ' ≠ max(4,' + v + ')');
  // 水平
  let mains = 0;
  for (let p = 0; p < nd; p++) {
    const L = b.lines[p];
    const want = b.fl ? (k => 'Dn' + (k > 0 ? '+' + k : (k < 0 ? '−' + (-k) : '')))(p - (nd - n) + 1) : 'D' + (p + 1);
    ok(L.dlab === want, key + ' SD Out 標號 p=' + p + ' ' + L.dlab + ' ≠ ' + want);
    const isMain = b.fl ? p >= nd - n : p < n; if (L.rep === '0') mains++;
    ok((L.rep === '0') === isMain, key + ' 主／重複 p=' + p);
    if (p >= n) { const Q = b.lines[p - n]; ok(L.gap === Q.gap + pSub && L.src === Q.src + n && L.dof.split('|')[0] === Q.dof.split('|')[0], key + ' 水平週期 p=' + p); }
  }
  ok(mains === n, key + ' 主循環 ' + mains + ' 條 ≠ 週期 ' + n);
  const hit = {};
  Object.values(b.cells).forEach(c => c.inn.forEach(x => { const m = /^D(\d+)(.*)$/.exec(x); hit[c.k + ':' + (m[1] - 1) + ':' + m[2]] = c.s; }));
  Object.keys(b.wires).forEach(wk => { const [k, p, ud] = wk.split(':'); if (+p < n) return; const W = b.wires[wk], V = b.wires[k + ':' + (p - n) + ':' + ud];
    ok(V && (W.len === V.len || W.off === '1' || V.off === '1'), key + ' 水平週期接線長度 ' + wk + ' ' + W.len + ' vs ' + (V && V.len));
    if (V && V.off !== '1' && W.off !== '1' && W.name !== 'X') ok(hit[wk] === hit[k + ':' + (p - n) + ':' + ud] + pSub, key + ' 水平週期目標格 ' + wk + ' ' + hit[wk] + ' vs ' + hit[k + ':' + (p - n) + ':' + ud]); });
  // 垂直
  Object.values(b.cells).forEach(c => { if (c.k < v) return; const d = b.cells[(c.k % v) + ':' + c.s];
    const strip = at => { const x = Object.assign({}, at); x['data-pv'] = x['data-pv'].replace(/^\d+:/, ''); return JSON.stringify(x); };
    const tipN = t => t.replace(/\(\d+-(\d+)\)/g, '(k-$1)');   // Tri 的來源標籤含列號 (k-gi)
    ok(d && strip(c.at) === strip(d.at) && c.txt === d.txt && c.inn.join(',') === d.inn.join(',') && tipN(c.tip) === tipN(d.tip), key + ' 垂直週期 格 ' + c.k + ':' + c.s + ' ' + (d ? tipN(c.tip) + ' | ' + tipN(d.tip) : '')); });
  Object.keys(b.wires).forEach(wk => { const [k, p, ud] = wk.split(':'); if (+k < v) return; const W = b.wires[wk], V = b.wires[(k % v) + ':' + p + ':' + ud];
    ok(V && W.name === V.name && W.len === V.len && W.off === V.off && W.col === V.col, key + ' 垂直週期 接線 ' + wk); });
  const NG = b.glab.length / b.nl;
  b.glab.forEach((g, i) => { const k = Math.floor(i / NG), gi = i % NG;
    ok(g.main === 'Line ' + (k + 1) + (NG > 1 ? '-' + (gi + 1) : ''), key + ' Line 標號 ' + g.main);
    ok(g.sub.split(' ')[0] === 'G' + (i + 1), key + ' G 編號 ' + g.sub + ' ≠ G' + (i + 1));
    if (k >= v) ok(!/第二組/.test(g.sub), key + ' 重複列不該標第二組 ' + g.sub); });
}
async function run(ROOT, isNew) {
  const dom = await JSDOM.fromFile(path.join(ROOT, 'datamap.html'), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, beforeParse(w) { w.WebSocket = function () { throw 1; }; } });
  await new Promise(r => dom.window.addEventListener('load', r));
  const w = dom.window, d = w.document, out = {}, $ = id => d.getElementById(id);
  const fire = (el, v) => { if (el.type === 'checkbox') el.checked = v; else el.value = v; el.dispatchEvent(new w.Event('change')); };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const datasets = {
    qm: async () => { fire($('dm-model'), 'EM01'); await sleep(20); w.dmImportBytes(new Uint8Array(fs.readFileSync('/tmp/qm.bin')), 'qm.bin'); await sleep(60); },
    sk: async () => { fire($('dm-model'), 'EM02'); await sleep(20); w.dmImportBytes(new Uint8Array(fs.readFileSync(SK)), path.basename(SK)); await sleep(60); },
    kmir: async () => { fire($('dm-model'), 'EM02'); await sleep(20); const mr = FX.mir, rows = [mr.line0.c0, mr.line0.c1, mr.line1.c0, mr.line1.c1];
      const s = Object.assign(require(path.join(ROOT, 'common/datamap-core.js')).emptyState('EM02'), { hand: 1, panel: 2, subPanel: 0, rd: 1, mirror: 1 }); rows.forEach((r, i) => r.forEach((v, c) => { s['c' + (i * 6 + c)] = v; })); w.dmState.cur = s; w.dmRender(); await sleep(20); },
  };
  for (const ds of Object.keys(datasets)) {
    await datasets[ds]();
    const mir0 = $('f-mirror').checked;
    for (const mi of [mir0, !mir0]) for (const first of ['l', 'r']) for (const drv of ['f', 'r']) for (const st of ['rgb', 'bgr']) for (const sw of [false, true]) {
      fire($('f-mirror'), mi); fire($('dm-pv-first'), first); fire($('dm-pv-drv'), drv); fire($('dm-pv-stripe'), st); fire($('dm-pv-swap'), sw);
      await sleep(5);
      out[ds + ' M' + (mi ? 1 : 0) + ' ' + first + drv + st + (sw ? 'S' : '')] = parse($('dm-pv-tft'));
    }
    fire($('f-mirror'), mir0);
  }
  if (isNew) {   // 只做週期檢查的額外架構：NB 2 列（E501A）、E512 Zigzag 8 列（HSD／line58）、Line OD 測試各 Type（含 Tri）
    const extra = {};
    fire($('dm-model'), 'E501A'); await sleep(30);
    for (const first of ['l', 'r']) { fire($('dm-pv-first'), first); await sleep(5); extra['E501A ' + first] = parse($('dm-pv-tft')); }
    // EM02／E512／EM01 Hand：Panel_mode（0 1D1G／1 Zigzag／2 HSD／3 LTPS）× sub_panel 0~7，code 用 sk 的值；② 畫不出來的組合（例 EM02 Single）跳過
    await datasets.sk();
    const base = w.dmState.cur, CORE = require(path.join(ROOT, 'common/datamap-core.js'));
    for (const mdl of ['EM02', 'E512', 'EM01']) {
      fire($('dm-model'), mdl); await sleep(20);
      for (let pm = 0; pm < 4; pm++) for (let sp = 0; sp < 8; sp++) for (const first of ['l', 'r']) {
        const s = CORE.emptyState(mdl); Object.keys(base).forEach(k => { if (/^[cx]\d+$/.test(k)) s[k] = base[k]; });
        s.hand = 1; s.panel = pm; s.subPanel = sp; s.mirror = 0; w.dmState.cur = s; w.dmRender(); fire($('dm-pv-first'), first); await sleep(5);
        const T = $('dm-pv-tft'); if (T && T.querySelector('path[data-dl]') && !$('dm-pvbody').classList.contains('hidden')) extra[mdl + ' panel' + pm + ' sub' + sp + ' ' + first] = parse(T);
      }
    }
    const lodSel = $('dm-pv-lod');
    fire($('dm-model'), 'EM02'); await sleep(30);
    Array.from(lodSel.options).forEach(() => {});
    for (const op of Array.from(lodSel.options)) { if (op.value === '' || +op.value < 0) continue;
      for (const first of ['l', 'r']) { fire(lodSel, op.value); fire($('dm-pv-first'), first); await sleep(5); const T = $('dm-pv-tft'); if (T && T.querySelector('path[data-dl]')) extra['LOD ' + op.textContent.slice(0, 24) + ' ' + first] = parse(T); } }
    fire(lodSel, lodSel.options[0].value);
    out.__extra = extra;
  }
  return out;
}
(async () => {
  const a = await run(BASE, false), b = await run(NEW, true);
  let nC = 0, ext = 0, sameC = 0; const shapes = {};
  for (const k in a) { const r = compareOld(k, a[k], b[k]); ext += r.extra; sameC += r.same; checkPeriodic(k, b[k]); nC++; shapes[b[k].vper + '→' + b[k].nl + '列×' + b[k].nd + '條(週期' + b[k].n + ')'] = 1; }
  for (const k in b.__extra) { checkPeriodic(k, b.__extra[k]); shapes[k.replace(/ [lr]$/, '') + '：' + b.__extra[k].vper + '→' + b.__extra[k].nl + '列×' + b.__extra[k].nd + '條'] = 1; }
  fails.forEach(f => console.log('✗', f));
  Object.keys(cats).sort((x, y) => cats[y] - cats[x]).slice(0, 25).forEach(c => console.log('  ✗類別', cats[c], c));
  console.log('結構：', Object.keys(shapes).join('；'));
  console.log('原本格子：內容逐項相同', sameC, '格；被新增線接到（舊版為前後循環／dummy）', ext, '格；舊版畫面外的重複線新版落在畫面內', edge.wires, '條（接到的新格', edge.cells, '）');
  console.log((fail ? '✗ ' : '✓ ') + 'SVGREP', nC, 'cases vs v1.17.5 +', Object.keys(b.__extra).length, 'periodic-only cases;', pass, 'checks pass,', fail, 'fail');
  process.exit(fail ? 1 : 0);
})();
