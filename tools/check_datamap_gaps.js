#!/usr/bin/env node
/* check_datamap_gaps.js — datamap v1.35.23（派工 237043078094487552；#c8911321「EN01_code範圍與網頁一致性查證_20261017」第 3、4 節 6 缺口）矩陣測試
   G1 第二組名稱單一來源：EM01／EM02／E512 × 長循環 4 種（pix58／row34／line58／mux3）× FORCE_DE_EN 1 × FORCE_DE_SEL 1～63 × 列 0～3 × code 0～31：
      DM.secondName ＝ linName(mntIdx(起始欄＋相對欄, code))，30＝null、31＝X；且與 Auto 接線 wiringFromState 的第二組 Data 線位置逐條相同（round-trip linIdx）。
      secondOptions(m,s,row) 名稱＝secondName；沒給 key ⇒ 只有數字（Benchmark 用）。
   G2 ③ TFT（jsdom，window.dmPvModel）：MNT Dual pix58／row34 第二組 code 18～29 不再畫成 X、跟 FORCE_DE_SEL 起始欄（名稱＝secondName）。
   G3 Excel 非標準值 round-trip：MNT 3＋NB e50x 5 型號 × Single／Dual × code 0～31 每格 ⇒ excelRows → excelToNames → applyNames 讀回同值（30 不再變 31）；Tri 同（triExcelRows／triApplyNames）。
   G4 Tri code 30：wiringFromState(keepBad) ok、bad＝格數、其他 Data 線位置與沒有 30 時相同；不給 opt 仍 ok:false（Line OD 行為不變）。
   G5 未定義 code 提示（jsdom）：TCON Register 欄位輸入 MNT c0＝30、NB E503 c0＝30、EN01 e0＝132／200／254 ⇒ 提示「未定義」；29／31、EN01 131／255 不提示；byte 框輸入 1FF ⇒ 擋下不改。
   G6 文字：三語 dm.rowGn2／dm.nextTri 不含 GN／「Python UI 不提供」；圖例寫範圍（MNT／NB 0～29、X＝31；EN01 0～131、X＝255）；home.dmDesc 三語含 EN01；各型號頁面可見文字沒有 GN1／GN2。
   G7 寫入 byte：MNT／NB X＝31 ⇒ 欄位 5 bit 全 1（1F）、30 顯示非標準；EN01 X ⇒ FF、132～254 非標準（cellView std＝false）、0～131 有名稱。
   用法：node tools/check_datamap_gaps.js [repo] */
'use strict';
const path = require('path');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const DM = require(path.join(ROOT, 'common', 'datamap-core.js'));
const AU = require(path.join(ROOT, 'common', 'datamap-auto.js'));
let pass = 0, fail = 0; const bad = {}, cnt = {};
const ok = (c, tag, m) => { cnt[tag] = (cnt[tag] || 0) + 1; if (c) pass++; else { fail++; bad[tag] = (bad[tag] || 0) + 1; if (bad[tag] <= 4) console.log('  ✗ [' + tag + '] ' + m); } };
const st = (key, o) => Object.assign(DM.emptyState(key), o);
const triId = (row, col) => { const R = DM.TRI_ROWS[row]; return R.f + (R.slot * 6 + col); };
const MNT = ['EM01', 'EM02', 'E512'], NB = ['E501A', 'E501B', 'E503', 'DAZ6138', 'DAZ6139'];
const LONG = [['pix58', 2, 4], ['row34', 2, 5], ['line58', 1, 6], ['line58', 1, 7], ['mux3', 3, 0], ['mux3', 3, 2]];

/* ── G1 */
for (const m of MNT) for (const [mean, pm, sub] of LONG) for (let ds = 1; ds < 64; ds++) {
  const s = st(m, { hand: 1, panel: pm, subPanel: sub, rd: pm === 2 ? 1 : pm === 3 ? 2 : 0, deEn: 1, deSel: ds });
  const R = DM.secondSetRule(m, s); if (R.meaning !== mean) { ok(false, 'G1', m + ' pm' + pm + ' sub' + sub + ' meaning ' + R.meaning); continue; }
  const g = DM.gateOf(m, s), b = DM.mntBaseT(s, g).t;
  for (let row = 0; row < 4; row++) {
    const T = DM.secondT(m, s, row), want = mean === 'pix58' ? b + 2 + (row & 1) : mean === 'row34' ? b + (row & 1) : mean === 'line58' ? b : b + 2;
    ok(T === want, 'G1', m + ' ' + mean + ' ds' + ds + ' row' + row + ' secondT ' + T + ' want ' + want);
    const opts = DM.secondOptions(m, s, row);
    for (let code = 0; code <= 31; code++) {
      const nm = DM.secondName(m, s, row, code), exp = code === 31 ? 'X' : code === 30 ? null : DM.linName(DM.mntIdx(want, code));
      ok(nm === exp, 'G1', m + ' ' + mean + ' ds' + ds + ' row' + row + ' code' + code + ' ' + nm + '≠' + exp);
      const o = opts.find(x => x.value === code);
      ok(code === 30 ? !o : (o && o.name === exp), 'G1', 'secondOptions ' + m + ' ' + mean + ' row' + row + ' code' + code);
    }
  }
  // 與 Auto 接線同一位置：主組 c 全填 A（合法）、第二組 x 全填 B，比對第二組 Data 線位置
  for (const B of [0, 5, 12, 17, 18, 23, 24, 29]) {
    const A = 7, s2 = DM.cloneState(s); for (let k = 0; k < 24; k++) { s2['c' + k] = A; s2['x' + k] = B; }
    const w = AU.wiringFromState(m, s2); if (!w.ok) { ok(false, 'G1w', m + ' ' + mean + ' ds' + ds + ' B' + B + ' wiring ' + w.why); continue; }
    const rows = w.t.rows, pos = [];
    if (mean === 'line58') { if (rows.length >= 8) for (let r = 0; r < 4; r++) pos.push([rows[4 + r][0], r, 0]); }
    else if (mean === 'pix58') for (let l = 0; l < rows.length; l++) for (let gi = 0; gi < 2; gi++) pos.push([rows[l][gi].slice(6), 2 * l + gi, 0]);
    else if (mean === 'row34') { for (let l = 2; l < rows.length; l++) for (let gi = 0; gi < 2; gi++) pos.push([rows[l][gi], 2 * (l - 2) + gi, 0]); }
    else if (mean === 'mux3') for (let l = 0; l < rows.length; l++) pos.push([rows[l][2], 2 * l, 0]);
    ok(pos.length > 0, 'G1w', m + ' ' + mean + ' ds' + ds + ' B' + B + ' 找不到第二組 Data 線（rows ' + rows.length + '）');
    pos.forEach(([arr, row]) => arr.forEach(v => ok(v === DM.linIdx(DM.secondName(m, s2, row, B)), 'G1w', m + ' ' + mean + ' ds' + ds + ' row' + row + ' B' + B + ' wiring ' + v + ' ≠ secondName ' + DM.secondName(m, s2, row, B))));
  }
}
ok(DM.secondOptions().length === 31 && DM.secondOptions().every(o => o.value === 31 ? o.name === 'X' : o.name === ''), 'G1', 'secondOptions() 不帶型號 ⇒ 只有數字＋X');
ok(DM.secondName('E503', st('E503', { hand: 1 }), 0, 5) === null, 'G1', 'NB 沒有第二組 ⇒ null');

/* ── G3 Excel round-trip */
const CODES = [0, 5, 17, 18, 23, 29, 30, 31];
for (const m of MNT.concat(NB)) for (const [g, pm, rd] of [['single', 0, 0], ['dual', 2, 1]]) {
  const base = st(m, { hand: 1, panel: pm, rd: rd, deEn: 1, deSel: 14 });
  if (DM.gateOf(m, base) !== g) { ok(false, 'G3', m + ' gate ' + DM.gateOf(m, base)); continue; }
  for (const code of CODES) for (const cell of [0, 7, 13, 23]) {
    const s = DM.cloneState(base); s['c' + cell] = code; if (g === 'single' && !/^E[MD5]/.test(m) && DM.MODELS[m].sem === 'e50x' && DM.MODELS[m].kind !== 'mnt') { const r = Math.floor(cell / 6); if (r & 1) s['c' + (cell - 6)] = code; else s['c' + (cell + 6)] = code; }
    const rows = DM.excelRows(m, s), r = DM.excelToNames(rows); if (!r.ok) { ok(false, 'G3', m + ' excelToNames ' + r.reason); continue; }
    const ns = DM.applyNames(m, s, r.names);
    const v0 = DM.cellView(m, s, Math.floor(cell / 6), cell % 6), v1 = ns && DM.cellView(m, ns, Math.floor(cell / 6), cell % 6);
    ok(ns && v1.raw === v0.raw && v1.txt === v0.txt, 'G3', m + ' ' + g + ' c' + cell + '=' + code + ' 匯出「' + v0.txt + '」→ 匯入 ' + (v1 && v1.raw));
  }
}
// Tri
for (const m of MNT) {
  const base = st(m, { hand: 1, panel: 3, rd: 2, deEn: 1, deSel: 12 });
  if (!DM.triOn(m, base)) { ok(false, 'G3t', m + ' triOn false'); continue; }
  for (const code of CODES) for (let row = 0; row < 6; row++) {
    const s = DM.cloneState(base); s[triId(row, 2)] = code;
    const rows = DM.triExcelRows(m, s), r = DM.triExcelToNames(rows); if (!r.ok) { ok(false, 'G3t', m + ' ' + r.reason); continue; }
    const ns = DM.triApplyNames(m, s, r.names);
    ok(ns && (ns[triId(row, 2)] | 0) === code, 'G3t', m + ' Tri row' + row + ' code ' + code + ' 匯入 ' + (ns && ns[triId(row, 2)]));
  }
}
ok(DM.rawCodeText('0x1E', 31) === 30 && DM.rawCodeText('0x20', 31) === null && DM.rawCodeText('0x0F', 15) === 15 && DM.rawCodeText('0x10', 15) === null && DM.rawCodeText('R1', 31) === null, 'G3', 'rawCodeText 範圍');

/* ── G4 Tri code 30 */
for (const m of MNT) for (let ds = 1; ds < 64; ds += 3) for (let row = 0; row < 6; row++) {
  const s = st(m, { hand: 1, panel: 3, rd: 2, deEn: 1, deSel: ds });
  for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) s[triId(r, c)] = (r * 6 + c) % 30;
  const ref = AU.wiringFromState(m, s, false, undefined, { keepBad: true });
  const s30 = DM.cloneState(s); s30[triId(row, 1)] = 30;
  const w0 = AU.wiringFromState(m, s30), w1 = AU.wiringFromState(m, s30, false, undefined, { keepBad: true });
  ok(!w0.ok && w0.why === 'code', 'G4', m + ' ds' + ds + ' 不給 opt 仍 ok:false');
  ok(w1.ok && w1.bad === 1, 'G4', m + ' ds' + ds + ' row' + row + ' keepBad ok/bad ' + w1.ok + '/' + w1.bad);
  if (w1.ok && ref.ok) {
    let diff = 0, nul = 0; const A = JSON.stringify(ref.t.rows), B = w1.t.rows;
    ref.t.rows.forEach((ln, i) => ln.forEach((r, j) => r.forEach((v, k) => { const u = B[i] && B[i][j] ? B[i][j][k] : undefined; if (u === null && v !== null) nul++; else if (u !== v) diff++; })));
    ok(diff === 0 && nul >= 1, 'G4', m + ' ds' + ds + ' row' + row + ' 其他 Data 線不變（diff ' + diff + '、空 ' + nul + '）' + (A.length ? '' : ''));
  }
}

/* ── G7 寫入 byte／名稱範圍 */
const fieldBits = (m, s, id) => { const img = {}; DM.encode(m, s).forEach(e => { img[e.reg] = ((img[e.reg] | 0) & ~e.mask) | (e.val & e.mask); }); const f = DM.fieldById(m, id); let v = 0; f.parts.forEach(p => { const w = p[1] - p[2] + 1; v = (v << w) | (((img[p[0]] | 0) >> p[2]) & ((1 << w) - 1)); }); return v; };
for (const m of MNT.concat(NB)) {
  const s = st(m, { hand: 1, panel: 2, rd: 1, deEn: 1, deSel: 14 }); s.c0 = 31; s.c1 = 30;
  ok(fieldBits(m, s, 'c0') === 0x1F && DM.cellView(m, s, 0, 0).txt === 'X', 'G7', m + ' X＝31 ⇒ 1F');
  ok(DM.cellView(m, s, 0, 1).std === false && DM.cellView(m, s, 0, 1).txt === '0x1E', 'G7', m + ' 30 ⇒ 非標準 0x1E');
}
{ const m = 'EN01', s = st(m, { hand: 1, deEn: 1, deSel: 0x0E, rd: 0 });
  for (let v = 0; v <= 255; v++) { s.e0 = v; const cv = DM.en01CellView(s, 0, 0, DM.en01RowT(s, 0)); const want = v === 255 ? 'X' : v <= 131 ? 'name' : 'ns';
    ok(want === 'X' ? cv.txt === 'X' && fieldBits(m, s, 'e0') === 0xFF : want === 'name' ? cv.std && /^[RGB]-?\d+$/.test(cv.txt) : !cv.std && cv.txt === '0x' + v.toString(16).toUpperCase().padStart(2, '0'), 'G7', 'EN01 e0=' + v + ' ⇒ ' + cv.txt); } }

/* ── jsdom：G2／G5／G6 */
(async () => {
  const { JSDOM, VirtualConsole } = require(path.join(ROOT, 'node_modules/jsdom'));
  const vc = new VirtualConsole(); vc.on('jsdomError', e => { console.log('jsdomError', e.message); fail++; });
  const dom = await JSDOM.fromFile(path.join(ROOT, 'datamap.html'), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) { w.WebSocket = function () { throw new Error('no ws'); }; try { w.localStorage.clear(); } catch (e) {} } });
  await new Promise(r => dom.window.addEventListener('load', r));
  const w = dom.window, d = w.document, $ = id => d.getElementById(id);
  const fire = (el, ev) => el.dispatchEvent(new w.Event(ev || 'change', { bubbles: true }));
  const setModel = m => { $('dm-model').value = m; fire($('dm-model')); };
  const setState = o => { const s = w.TCONDataMap.cloneState(w.dmState.cur); Object.assign(s, o); w.dmState.cur = s; w.dmRender(); };
  const lastToast = () => { const t = $('dm-toasts'); return t && t.lastElementChild ? t.lastElementChild.textContent : ''; };
  const clearToasts = () => { const t = $('dm-toasts'); if (t) t.innerHTML = ''; };

  // G2 TFT 第二組
  for (const m of MNT) {
    setModel(m);
    for (const [mean, pm, sub] of [['pix58', 2, 4], ['row34', 2, 5]]) for (const ds of [0x0E, 0x02, 0x08, 0x20]) {
      const o = { hand: 1, panel: pm, subPanel: sub, rd: 1, deEn: 1, deSel: ds, mirror: 0, chrb: 0 };
      for (let k = 0; k < 24; k++) { o['c' + k] = 7; o['x' + k] = 18 + (k % 12); }
      setState(o);
      const P = w.dmPvModel(), s = w.dmState.cur;
      if (!P || !P.ok) { ok(false, 'G2', m + ' ' + mean + ' pvModel 不 ok'); continue; }
      let hit = 0, X = 0;
      P.rows.forEach(rw => {
        const names = rw.names.map(n => n.raw || n.name);
        if (mean === 'pix58') { const r = rw.k * 2 + rw.gi; for (let c = 0; c < 6; c++) { const want = w.TCONDataMap.secondName(m, s, r, s['x' + (r * 6 + c)]); hit++; if (names[6 + c] !== want) { X++; if (X <= 2) console.log('    G2 ' + m + ' pix58 ds' + ds + ' r' + r + ' c' + c + ' 畫 ' + names[6 + c] + ' 應 ' + want); } } }
        else if (rw.k >= 2) { const r = (rw.k - 2) * 2 + rw.gi; for (let c = 0; c < 6; c++) { const want = w.TCONDataMap.secondName(m, s, r, s['x' + (r * 6 + c)]); hit++; if (names[c] !== want) { X++; if (X <= 2) console.log('    G2 ' + m + ' row34 ds' + ds + ' r' + r + ' c' + c + ' 畫 ' + names[c] + ' 應 ' + want); } } }
      });
      ok(hit >= 24 && X === 0, 'G2', m + ' ' + mean + ' deSel 0x' + ds.toString(16) + ' 第二組 ' + hit + ' 條名稱＝secondName（不符 ' + X + '）');
    }
  }

  // G5 未定義 code 提示
  const regInput = id => d.querySelector('input[data-f="' + id + '"]');
  const typeField = (id, v) => { const i = regInput(id); if (!i) return false; i.dispatchEvent(new w.Event('focus')); i.value = String(v); i.dispatchEvent(new w.Event('blur')); return true; };
  const openRegs = () => { const t = $('card-reg') || null; void t; };
  for (const [m, id, vals] of [['EM01', 'c0', [[30, 1], [29, 0], [31, 0]]], ['E503', 'c0', [[30, 1], [17, 0], [31, 0]]], ['EN01', 'e0', [[132, 1], [200, 1], [254, 1], [131, 0], [255, 0]]]]) {
    setModel(m); setState(m === 'EN01' ? { hand: 1, deEn: 1, deSel: 0x0E, rd: 0 } : { hand: 1, panel: 2, rd: 1, deEn: 1, deSel: 14 }); openRegs();
    for (const [v, warn] of vals) {
      clearToasts(); setState({ [id]: 0 });
      const okT = typeField(id, v); if (!okT) { ok(false, 'G5', m + ' 找不到欄位輸入框 ' + id); break; }
      const t = lastToast(), got = (w.dmState.cur[id] | 0);
      ok(got === v && (warn ? /未定義/.test(t) : !/未定義/.test(t)), 'G5', m + ' ' + id + '＝' + v + ' ⇒ 值 ' + got + '、提示「' + t + '」（預期' + (warn ? '' : '不') + '提示）');
    }
  }
  // byte 框（onCodeText）：v1.18.22 起 TCON Register 只剩「依 Register 名稱」檢視，頁面沒有 byte 輸入框呼叫 onCodeText（只留防呆：>0xFF 擋下）；欄位輸入超出 bit 數本來就擋（dm.regRange）
  { setModel('EM01'); setState({ hand: 1, panel: 2, rd: 1, deEn: 1, deSel: 14 }); clearToasts(); const s0 = JSON.stringify(w.dmState.cur);
    typeField('c0', '0x20'); ok(JSON.stringify(w.dmState.cur) === s0 && /範圍/.test(lastToast()), 'G5', 'c0 輸入 0x20（超過 5 bit）⇒ 不改、提示（' + lastToast() + '）');
    clearToasts(); setModel('EN01'); setState({ hand: 1, deEn: 1, deSel: 0x0E, rd: 0 }); const s1 = JSON.stringify(w.dmState.cur);
    typeField('e0', '0x1FF'); ok(JSON.stringify(w.dmState.cur) === s1 && /範圍/.test(lastToast()), 'G5', 'EN01 e0 輸入 0x1FF（超過 8 bit）⇒ 不改、提示（' + lastToast() + '）'); }

  // G6 文字
  const I = w.DM_I18N || null; void I;
  const src = require('fs').readFileSync(path.join(ROOT, 'datamap.html'), 'utf8');
  const line = k => ((src.split('\n').find(l => l.indexOf("'" + k + "':") >= 0) || '').split('],')[0]);   // 只看三語陣列（同行 // 註解不算）
  ok(!/GN\d/.test(line('dm.rowGn2')), 'G6', 'dm.rowGn2 三語不含 GN1／GN2：' + line('dm.rowGn2').trim().slice(0, 80));
  ok(!/Python UI 不提供|does not edit|不提供表格编辑/.test(line('dm.nextTri')), 'G6', 'dm.nextTri 不再說不提供表格');
  for (const [m, re] of [['EM01', /0～29.*X＝31/], ['E503', /0～29.*X＝31/], ['EN01', /0～131.*X＝255/], ['DAZ6111', /^[^0-9]*$/]]) {
    setModel(m); setState(m === 'EN01' ? { hand: 1, deEn: 1, deSel: 0x0E, rd: 0 } : { hand: 1 });
    const lg = $('dm-legend').textContent; ok(re.test(lg.replace('已改', '')), 'G6', m + ' 圖例「' + lg + '」');
    const tw = d.createTreeWalker(d.body, 4); let body = '', nd; while ((nd = tw.nextNode())) { const pe = nd.parentElement; if (pe && !/^(SCRIPT|STYLE|TEMPLATE)$/.test(pe.tagName)) body += nd.textContent + ' '; }   // 可見文字（不含 script 原始碼）
    d.querySelectorAll('[title]').forEach(e => { body += e.getAttribute('title') + ' '; }); ok(!/GN[12]/.test(body), 'G6', m + ' 頁面文字出現 GN1／GN2');
  }
  const i18n = require('fs').readFileSync(path.join(ROOT, 'common', 'i18n.js'), 'utf8').split('\n').find(l => l.indexOf("'home.dmDesc'") >= 0) || '';
  ok((i18n.match(/EN01/g) || []).length === 3, 'G6', 'home.dmDesc 三語含 EN01');

  Object.keys(cnt).sort().forEach(k => console.log('  ' + k + '：' + cnt[k] + ' 項，fail ' + (bad[k] || 0)));
  console.log(`check_datamap_gaps: ${pass} pass / ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
