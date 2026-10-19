#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   check_datamap_muxall.js — datamap v1.35.29 全型號 MUX 三層接線圖（派工 237801403670081536）
   Bruce 10/19 12:5x「為何Data mapping網頁，其他tcon的mux接線，沒有一併更新成最新的畫法?」、15:0x「其他tcon的mux畫法也沒改進」
   （截圖：EM01 Auto、Panel_mode LTPS、MUX3 normal type1 仍顯示 Tri-Gate、Line 1-1/1-2/1-3）。

   A  原廠範例逐格比對（MNT）：同事A EM01A1_rt7_register_force_mapping.xlsx LTPS 分頁 8 種 LTPS MUX 的「Data mapping」範例
      （每個 Data 的 SW1～SWk code 與每個循環輸出的 pixel 名稱，mirror 0／1、line 0／1）⇒ 網頁 Hand 模式同一組 code 畫出的 ③：
      Data c 的 SW j、第 b 個循環接到的名稱（Mirror 只比第 0 循環，決策 A31 座標系差異）。
   B  demux 走線＝TYPE 公式：同事A 8 組／E512 隱藏表（NB Auto）／瑞鼎 Excel（MNT Auto）解出的 pixel，Normal 每格在 pvMuxEnc 那條 Data 線正下方；
      Zigzag 第 2 條 line 全部接左邊相鄰 subpixel。
   C  情境矩陣：EM01／EM02／E512 × Auto／Hand × LTPS sub 0～7（含 Bruce 15:0x 截圖：EM01 Auto MUX3 normal type1）＋ Hand Tri-Gate（BOE）＋ NB E503／E501A／E501B／DAZ6138 Auto LTPS
      ⇒ Gate Type 文字、③ 模型（mux、gate 數＝1、TYPE）、② 列名、SVG 三層（SW 匯流排、demux TFT）。
   D  Gate 選單連動：MNT Single／Dual／Tri／MUX2／MUX3 寫入的 panel／sub／rd（v1.35.31：rd＝data 分段數－1，MUX2＝1、MUX3／Tri＝2）。
   E  列名：Excel 匯出新列名、匯入新舊列名都認；EN01 MUX＝Line n-SWk、Dual／Tri＝Line n-k。
   F  v1.35.31 rd 規則矩陣（派工 237903570581180416）：MNT 3＋NB 5 型號 × panel 0～3 × sub 0～7 × Auto／Gate 選單 ⇒ rd＝分段數－1，
      MUX2＝HSD＝1、MUX3／Tri-Gate＝2；MNT 與 NB（E503 Auto 清單）同一組 panel／sub 的 rd 相同；Excel 接線用的 rd 也同。
   用法：node tools/check_datamap_muxall.js [repo] [--xlsx 同事A.xlsx]
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path'), fs = require('fs'), cp = require('child_process');
const args = process.argv.slice(2), opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const ROOT = path.resolve(args[0] && !args[0].startsWith('--') ? args[0] : path.join(__dirname, '..'));
const XLSX = opt('--xlsx') || path.join(process.env.HOME || '', 'TCON/TCON設定相關/RD_peera_DataMapping_20261013/reply_110503_0924/EM01A1_rt7_register_force_mapping.xlsx');
const DM = require(path.join(ROOT, 'common/datamap-core.js')); global.TCONDataMap = DM;
const LOD = require(path.join(ROOT, 'common/datamap-lod.js')); global.TCONDataMapLOD = LOD;
const A = require(path.join(ROOT, 'common/datamap-auto.js'));
let pass = 0, fail = 0; const fails = [], tables = {};
const ok = (c, m) => { if (c) pass++; else { fail++; if (fails.length < 400) fails.push(m); } };
const tab = (k, row) => { (tables[k] = tables[k] || []).push(row); };
const PT = { 2: { 1: [[1, 2], [3, 4]], 2: [[1, 3], [2, 4]] }, 3: { 1: [[1, 2, 3], [4, 5, 6]], 2: [[1, 5, 3], [4, 2, 6]] } };
const enc = (M, ty, c, j) => { const n = 6 * M, b = Math.floor(c / 6), ci = c - b * 6; return n * b + 2 * M * Math.floor(ci / 2) + PT[M][ty][ci % 2][j] - 1; };

/* ── 讀 同事A LTPS 分頁的 Data mapping 範例 ── */
const PY = `import sys, json, openpyxl
wb = openpyxl.load_workbook(sys.argv[1], data_only=True); ws = wb['LTPS']
out = []; panel = None; r = 1
while r <= ws.max_row:
    a = ws.cell(r, 1).value; b = ws.cell(r, 2).value
    if a == 'Panel': panel = str(b)
    if b == 'DE':
        lab = []; rr = r + 1
        while isinstance(ws.cell(rr, 2).value, str) and ws.cell(rr, 2).value.startswith(('line', 'mirror')): lab.append(ws.cell(rr, 2).value); rr += 1
        rows = []
        for q in range(rr, rr + 9):
            codes = [ws.cell(q, c).value for c in (3, 4, 5)]
            if codes[0] is None: continue
            names = [ws.cell(q, c).value for c in range(6, 23)]
            rows.append({'row': q, 'codes': codes, 'names': names})
        out.append({'panel': panel, 'at': r, 'lab': lab, 'rows': rows})
    r += 1
print(json.dumps(out, ensure_ascii=False))`;
let EX = [];
try { EX = JSON.parse(cp.execFileSync('python3', ['-c', PY, XLSX], { encoding: 'utf8', cwd: require('os').tmpdir() })); } catch (e) { console.log('  python3／openpyxl／同事A xlsx 讀不到：' + String(e.message || e).split('\n')[0]); }

(async () => {
  const { JSDOM, VirtualConsole } = require(path.join(ROOT, 'node_modules/jsdom'));
  const vc = new VirtualConsole(); const jerr = []; vc.on('jsdomError', e => jerr.push(e.message));
  const dom = await JSDOM.fromFile(path.join(ROOT, 'datamap.html'), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc, beforeParse(win) { win.WebSocket = function () { throw new Error('no ws'); }; } });
  await new Promise(r => dom.window.addEventListener('load', r));
  const w = dom.window, d = w.document, $ = id => d.getElementById(id);
  const fire = (id, v) => { const e = $(id); e.value = v; e.dispatchEvent(new w.Event('change')); };
  const setState = (k, s) => { if (w.dmState.model !== k) fire('dm-model', k); w.dmState.cur = DM.cloneState(s); w.dmPvRender(); };
  const nameAt = (P, l, p) => { const r = P.rows.find(x => x.k === l && x.gi === 0); const c = r && r.names[p]; return c && !c.off ? c.name : null; };

  /* ── A：同事A 範例 ── */
  const PN = { 'mux3 normal tpye1': 0, 'mux3 normal type1': 0, 'mux2 normal tpye1': 1, 'mux2 normal type1': 1, 'mux3 zigzag type1': 2, 'mux2 zigzag tpye1': 3, 'mux2 zigzag type1': 3,
    'mux3 normal type2': 4, 'mux2 normal tpye2': 5, 'mux2 normal type2': 5, 'mux3 zigzag type2': 6, 'mux2 zigzag tpye2': 7, 'mux2 zigzag type2': 7 };
  const subOf = p => { const m = /(mux\d (?:normal|zigzag) t[yp]{2}e\d)/i.exec(p.toLowerCase()); return m ? PN[m[1]] : null; };
  for (const k of ['EM01', 'EM02', 'E512']) {
    let blocks = 0, cells = 0, diffs = 0;
    for (const ex of EX) {
      const sub = subOf(ex.panel || ''); if (sub === null || sub === undefined) continue;
      const mi = ex.lab.some(x => /mirror=1/.test(x)) ? 1 : 0;
      let line = ex.lab.some(x => /line=1/.test(x)) ? 1 : 0;
      const M = (sub & 1) ? 2 : 3;
      /* 同事A MUX2 zigzag 第 3 段標成 line=1 mirror=0，內容是 line 0 的 Mirror（code 與 mirror=1 line 0 相同順序）⇒ 用 code 判斷哪條 line：line 1 的 code 解出來是左移 1 */
      const s = DM.emptyState(k); s.hand = 1; s.panel = 3; s.subPanel = sub; s.rd = 2; s.deEn = 0; s.deSel = 0; s.mirror = mi; s.triGate = 0;
      const fill = (L) => { ex.rows.forEach((r, c) => { for (let j = 0; j < M; j++) { const v = r.codes[j]; if (j < 2) s['c' + ((2 * L + j) * 6 + c)] = v; else s['x' + (2 * L * 6 + c)] = v; } }); };
      fill(0); fill(1);
      setState(k, s);
      const P = w.dmPvModel();
      ok(P.ok && P.mux === M && P.NG === 1 && P.muxType === ((sub >> 2) & 1) + 1, k + ' A 模型 ' + ex.panel + ' @' + ex.at);
      blocks++;
      const n = 6 * M;
      /* 同事A LTPS!A413／A424（MUX3 zigzag type2、mirror=1）：這兩段的名稱欄和同列 code 對不上（H 欄空、整段右移一欄、列順序不同；同分頁其他 22 段都是「同列 code 解出的名稱」），
         屬 Excel 排版 ⇒ 改比「名稱集合」（第 0 循環全部 Data×SW 的名稱，排序後相同），另記 tab A。 */
      if (sub === 6 && mi) {
        const row = P.rows.find(x => x.k === line && x.gi === 0), web = [], xl = [];
        ex.rows.forEach((r, c) => { for (let j = 0; j < M; j++) { const cell = row.names[enc(M, 2, c, j)]; web.push(cell && !cell.off ? cell.raw : 'X'); } r.names.slice(2, 2 + M + 1).forEach(v => { if (v) xl.push(v); }); });
        /* 實測：Excel 本段名稱＝網頁名稱整體 +6 subpixel（＝起始欄多 1 欄解碼；同分頁其他段與網頁同欄）⇒ 原廠表內差異，與 MUX 畫法無關（v1.35.28 Tri 路徑解出的名稱相同） */
        const sh6 = x => { const i = DM.linIdx(x); return i === null ? x : DM.linName(i + 6); };
        const a = web.map(sh6).sort().join(','), b = xl.slice().sort().join(',');
        ok(a === b, k + ' A ' + ex.panel + ' @' + ex.at + ' 名稱集合：網頁 ' + a + '｜Excel ' + b);
        cells += web.length; if (k === 'EM01') tab('A', [ex.panel, ex.lab.join(' '), 'LTPS!C' + (ex.rows[0] && ex.rows[0].row), '名稱集合比對（Excel 本段名稱欄與 code 錯位）', M]);
        continue;
      }
      ex.rows.forEach((r, c) => {
        const nCyc = mi ? 1 : Math.floor(((P.rows[0] || { names: [] }).names.length) / n);   // 網頁畫出的循環數（MUX3 2 個、MUX2 2 個）
        for (let b = 0; b < nCyc; b++) for (let j = 0; j < M; j++) {
          const col = 2 + b * M + j;   // names[0]=F 欄、[1]=G、[2]=H 起＝第 0 循環 SW1
          const xv = r.names[col]; if (xv === null || xv === '' || xv === undefined) continue;
          /* 網頁：第 l 條 line、Data c、SW j、第 b 循環 ⇒ Data 線 enc(c, j)＋n·b（Mirror 時位置整行反轉：第 0 循環的名稱取 base 名稱＝raw） */
          const dl = enc(M, ((sub >> 2) & 1) + 1, c, j) + n * b, row = P.rows.find(x => x.k === line && x.gi === 0), cell = row && row.names[dl];
          const got = cell && !cell.off ? (mi ? cell.raw : cell.name) : null;
          cells++; if (got !== xv) { diffs++; ok(false, k + ' A ' + ex.panel + ' @' + ex.at + ' ' + ex.lab.join('/') + ' Data' + (c + 1) + ' SW' + (j + 1) + ' 循環' + b + '：Excel ' + xv + ' 網頁 ' + got); } else pass++;
        }
      });
      if (k === 'EM01') tab('A', [ex.panel, ex.lab.join(' '), 'LTPS!' + 'C' + (ex.rows[0] && ex.rows[0].row), ex.rows.length + ' Data', M]);
    }
    tab('Asum', [k, blocks, cells, diffs]);
  }

  /* ── B：pixel 來源 × TYPE 公式 ── */
  const chkT = (name, t, M, ty, zz) => {
    const L = LOD.linesN(t, 6); let bad = 0, n = 0;
    L.forEach(r => { if (r.gate > M) return; r.names.forEach((nm, c) => { if (nm === 'X') return; const k = DM.linIdx ? DM.linIdx(nm) : null; const want = enc(M, ty, c, r.gate - 1) - (zz && r.line === 2 ? 1 : 0); n++; if (k !== want) { bad++; ok(false, 'B ' + name + ' line' + r.line + ' Data' + (c + 1) + ' SW' + r.gate + '：' + nm + '(' + k + ') ≠ ' + want); } else pass++; }); });
    tab('B', [name, 'MUX' + M + ' TYPE ' + ty + (zz ? ' Zigzag' : ''), n, bad]);
  };
  A.XL_MNT.filter(r => r.panel === 3 && r.auto).forEach(r => { const st = DM.emptyState('EM02'); st.panel = 3; st.subPanel = r.sub; const x = A.xlsxWire('EM02', st); chkT('瑞鼎 Excel（MNT Auto）' + r.name, x.t, (r.sub & 1) ? 2 : 3, ((r.sub >> 2) & 1) + 1, (r.sub >> 1) & 1); });
  A.list('E503').forEach(e => { if (e.set.panel !== 3) return; const sp = e.set.subPanel; chkT('NB ' + e.name + '（' + (e.lod != null ? 'Line OD ' + e.lod : '隱藏表 ' + A.HIDDEN[e.hid].name) + '）', A.wiring(e), (sp & 1) ? 2 : 3, ((sp >> 2) & 1) + 1, (sp >> 1) & 1); });

  /* ── C：情境矩陣 ── */
  const svgChk = (id, M) => { const svg = $('dm-pv-tft'); const t = svg ? svg.innerHTML : ''; const nTft = (t.match(/data-mxtft/g) || []).length, swl = /data-mxlg/.test(t); return { svg: !!t, swl, nTft }; };
  const GT = { 0: 'MUX3', 1: 'MUX2' };
  for (const k of ['EM01', 'EM02', 'E512']) for (const hand of [0, 1]) for (let sub = 0; sub < 8; sub++) {
    const s = DM.emptyState(k); s.panel = 3; s.subPanel = sub; s.rd = 2; s.hand = hand;
    if (hand) { const x = A.XL_MNT.filter(r => r.panel === 3 && r.sub === sub && r.auto)[0]; for (let i = 0; i < 24; i++) { s['c' + i] = x.c[i]; if (x.x) s['x' + i] = x.x[i]; } s.deEn = 0; }
    setState(k, s);
    const P = w.dmPvModel(), M = (sub & 1) ? 2 : 3, gt = $('dm-gate') ? DM.gateText(k, s) : '', sv = svgChk('', M);
    const lab = DM.rowsFor(k, s).map(x => x.label.replace(/（.*$/, ''));
    const id = k + (hand ? ' Hand' : ' Auto') + ' sub' + sub + ' ' + DM.SUB_PANEL[3][sub];
    ok(P.ok && P.mux === M && P.NG === 1, id + ' ③ 模型 mux=' + P.mux + ' NG=' + P.NG);
    ok(gt === GT[sub & 1], id + ' Gate Type 文字 ' + gt);
    ok(sv.swl && sv.nTft > 0, id + ' SVG 三層（SW 匯流排／demux TFT）' + JSON.stringify(sv));
    ok(!hand || lab.every(l => /-SW\d$/.test(l)), id + ' ② 列名 ' + lab.join(','));
    ok(P.rows.every(r => r.gi === 0), id + ' 一列 pixel 一條 gate');
    ok($('dm-pv-keylg').innerHTML.indexOf('dm.rowLg') >= 0, id + ' 圖例列名說明');
    if (k === 'EM01') tab('C', [id, gt, 'MUX' + P.mux + ' TYPE ' + P.muxType, hand ? lab.join(' ') : '（Auto 無表格）', sv.nTft]);
  }
  /* Bruce 15:0x 截圖情境：EM01 Auto、LTPS、MUX3 normal type1（panel 3、sub 0、rd 2） */
  { const s = DM.emptyState('EM01'); s.hand = 0; s.panel = 3; s.subPanel = 0; s.rd = 2; setState('EM01', s); render(); const P = w.dmPvModel();
    ok($('dm-gate').value === 'MUX3', 'C 截圖情境 Gate Type ＝ MUX3：' + $('dm-gate').value);
    ok(/MUX3/.test($('st-pv').textContent) && !/Tri/.test($('dm-pvtag').textContent + $('st-pv').textContent), 'C 截圖情境標題不是 Tri：' + $('dm-pvtag').textContent + '／' + $('st-pv').textContent);
    const lbl = Array.from($('dm-pv-tft').querySelectorAll('text')).map(t => t.textContent).filter(x => /^Line /.test(x));
    ok(!lbl.some(x => /-\d$/.test(x)), 'C 截圖情境 ③ 沒有 Line 1-1/1-2/1-3：' + lbl.slice(0, 6).join(','));
    tab('C0', [$('dm-gate').value, $('dm-pvtag').textContent, $('st-pv').textContent, lbl.slice(0, 4).join(' ')]); }
  /* Tri-Gate（BOE）維持 gate 分段 */
  for (const k of ['EM01', 'EM02', 'E512']) {
    let s = DM.emptyState(k); s.hand = 1; s = DM.setGate(k, s, 'Tri-Gate'); const bx = A.XL_MNT.filter(r => /BOE/.test(r.name))[0]; for (let i = 0; i < 24; i++) { s['c' + i] = bx.c[i]; s['x' + i] = bx.x[i]; }
    setState(k, s); const P = w.dmPvModel();
    ok(P.ok && !P.mux && P.NG === 3 && P.tri, k + ' Tri-Gate（BOE）仍 3 條 gate');
    ok(DM.rowsFor(k, s)[0].label === 'Line 1-1', k + ' Tri 列名 Line 1-1');
    const s2 = DM.cloneState(s); delete s2.triGate; ok(DM.muxPanel(k, s2).kind === 'tri', k + ' 匯入 BOE 表（沒選過 Gate）判成 Tri-Gate');
    const p21 = DM.PRESETS.findIndex(p => /^\(21\)/.test(p.name)), p17 = DM.PRESETS.findIndex(p => /^\(18\)/.test(p.name));
    ok(DM.muxPanel(k, DM.applyPreset(k, DM.emptyState(k), p21)).kind === 'tri', k + ' (21) Tri+BOE ⇒ Tri-Gate');
    ok(DM.muxPanel(k, DM.applyPreset(k, DM.emptyState(k), p17)).kind === 'mux3', k + ' (18) Tri+ZZ+LR ⇒ MUX3（原廠名稱 Tri＝LTPS 3 段）');
  }
  /* 同事A MUX 表全部不會被誤判成 Tri（triSig） */
  A.XL_MNT.filter(r => r.panel === 3 && !/BOE/.test(r.name)).forEach(r => { const s = DM.emptyState('EM02'); s.hand = 1; s.panel = 3; s.subPanel = r.sub; for (let i = 0; i < 24; i++) { s['c' + i] = r.c[i]; if (r.x) s['x' + i] = r.x[i]; } ok(!DM.triSig(s), 'triSig 誤判 ' + r.name); });
  /* NB Auto LTPS */
  for (const k of ['E503', 'E501A', 'E501B', 'DAZ6138']) {
    if (!DM.MODELS[k]) continue;
    for (let sub = 0; sub < 8; sub++) {
      const s = DM.emptyState(k); s.hand = 0; s.panel = 3; s.subPanel = sub; if (DM.fieldById(k, 'rd')) s.rd = (sub & 1) ? 1 : 2;
      setState(k, s); const P = w.dmPvModel(), M = (sub & 1) ? 2 : 3, sv = svgChk();
      ok(P.ok && P.mux === M && P.NG === 1 && sv.swl, k + ' Auto sub' + sub + ' MUX' + M + ' 三層 ' + JSON.stringify(sv) + ' mux=' + P.mux);
      if (k === 'E503') tab('NB', [k + ' Auto ' + DM.SUB_PANEL[3][sub], 'MUX' + P.mux + ' TYPE ' + P.muxType, sv.nTft]);
    }
  }

  /* ── D：Gate 選單連動 ── */
  for (const k of ['EM01', 'EM02', 'E512']) {
    const exp = { 'Single-Gate': [0, 0, 0], 'Dual-Gate': [2, 0, 1], 'Tri-Gate': [3, null, 2], 'MUX2': [3, 1, 1], 'MUX3': [3, 0, 2] };
    for (const from of [0, 1, 2, 3]) for (const g of DM.gateItems(k)) {
      const s0 = DM.emptyState(k); s0.hand = 1; s0.panel = from; s0.subPanel = from === 1 ? 5 : (from === 3 ? 6 : 0);
      const ns = DM.setGate(k, s0, g), e = exp[g];
      const pw = g === 'Single-Gate' && from === 1 ? 1 : e[0], sw = g === 'Single-Gate' && from === 1 ? 5 : (g === 'Dual-Gate' && from === 2 ? s0.subPanel : (g === 'Tri-Gate' ? s0.subPanel : (g.startsWith('MUX') && from === 3 ? (6 | e[1]) & 7 : e[1])));
      ok(ns.panel === pw && ns.rd === e[2] && ns.subPanel === sw && DM.gateText(k, ns) === g, k + ' D ' + g + ' from panel ' + from + '：panel ' + ns.panel + ' sub ' + ns.subPanel + ' rd ' + ns.rd + ' text ' + DM.gateText(k, ns));
      if (k === 'EM02' && from === 0) tab('D', [g, ns.panel, ns.subPanel, ns.rd, ns.triGate]);
    }
  }
  /* ── E：列名、Excel ── */
  { const s = DM.emptyState('EM02'); s.hand = 1; const m2 = DM.setGate('EM02', s, 'MUX2'), m3 = DM.setGate('EM02', s, 'MUX3'), du = DM.setGate('EM02', s, 'Dual-Gate'), tr = DM.setGate('EM02', s, 'Tri-Gate');
    ok(DM.excelRows('EM02', m2)[1][0] === 'Line 1-SW1' && DM.excelRows('EM02', du)[1][0] === 'Line 1-1', 'E Excel 匯出列名 MUX2／Dual');
    ok(DM.triExcelRows('EM02', m3)[3][0] === 'Line 1-SW3' && DM.triExcelRows('EM02', tr)[3][0] === 'Line 1-3', 'E Tri Excel 列名 MUX3／Tri');
    const rowsOld = DM.excelRows('EM02', du), rowsNew = DM.excelRows('EM02', m2);
    ok(DM.excelToNames(rowsOld).ok && DM.excelToNames(rowsNew).ok, 'E Excel 匯入新舊列名');
    ok(DM.triExcelToNames(DM.triExcelRows('EM02', m3)).ok && DM.triExcelToNames(DM.triExcelRows('EM02', tr)).ok, 'E Tri Excel 匯入新舊列名');
    ok(DM.triExcelToNames([['Line 1·SW1', 1, 2, 3, 4, 5, 6], ['Line 1·SW2', 1, 2, 3, 4, 5, 6], ['Line 1·SW3', 1, 2, 3, 4, 5, 6], ['Line 2·SW1', 1, 2, 3, 4, 5, 6], ['Line 2·SW2', 1, 2, 3, 4, 5, 6], ['Line 2·SW3', 1, 2, 3, 4, 5, 6]]).ok, 'E v1.35.28 舊 EN01 寫法 Line 1·SW1 也認');
    const e = DM.emptyState('EN01'); e.hand = 1; e.deEn = 1;
    const lb = st => DM.rowsFor('EN01', st).filter(x => x.show).map(x => x.label.replace(/（.*$/, '')).slice(0, 3).join(',');
    const en = (g) => DM.setGate('EN01', e, g);
    ok(lb(en('MUX2 (RD_MODE=1)')) === 'Line 1-SW1,Line 1-SW2,Line 2-SW1' && lb(en('MUX4 (RD_MODE=3)')).startsWith('Line 1-SW1') && lb(en('Dual-Gate')) === 'Line 1-1,Line 1-2,Line 2-1' && lb(en('Single-Gate')).startsWith('Line 1,'), 'E EN01 列名：' + [lb(en('MUX2 (RD_MODE=1)')), lb(en('Dual-Gate')), lb(en('Single-Gate'))].join(' | '));
    ['MUX2 (RD_MODE=1)', 'MUX3 (RD_MODE=2)', 'MUX4 (RD_MODE=3)', 'MUX6 (RD_MODE=5)', 'Single-Gate', 'Dual-Gate', 'Tri-Gate'].forEach(g => tab('E', ['EN01 ' + g, lb(en(g))]));
    [['EM02 MUX2', m2], ['EM02 MUX3', m3], ['EM02 Dual', du], ['EM02 Tri-Gate', tr]].forEach(([n, st]) => tab('E', [n, DM.rowsFor('EM02', st).map(x => x.label.replace(/（.*$/, '')).join(',')]));
  }
  /* ── F：rd 規則矩陣（v1.35.31） ── */
  { const seg = (p, sb, tri) => p <= 1 ? 1 : (p === 2 ? 2 : (tri ? 3 : ((sb & 1) ? 2 : 3)));
    const MNT = ['EM01', 'EM02', 'E512'], NB = ['E503', 'E501A', 'E501B', 'DAZ6138', 'DAZ6139'].filter(k => DM.MODELS[k] && DM.fieldById(k, 'rd'));
    let nF = 0;
    for (const k of MNT.concat(NB)) for (let p = 0; p <= 3; p++) for (let sb = 0; sb < 8; sb++) for (const tri of DM.MODELS[k].kind === 'mnt' && p === 3 ? [0, 1] : [0]) {
      const s = DM.emptyState(k); s.panel = p; s.subPanel = sb; s.triGate = tri; nF++;
      ok(DM.autoRd(k, s) === seg(p, sb, tri) - 1, 'F autoRd ' + k + ' p' + p + ' sub' + sb + ' tri' + tri + ' = ' + DM.autoRd(k, s));
    }
    for (const k of NB) for (const e of A.list(k)) if (e.set.rd !== undefined) { const s = DM.emptyState(k); s.panel = e.set.panel; s.subPanel = e.set.subPanel; ok(DM.autoRd(k, s) === e.set.rd, 'F NB 清單 ' + k + ' ' + e.name + ' rd ' + e.set.rd + ' vs autoRd ' + DM.autoRd(k, s)); nF++; }
    for (let sb = 0; sb < 8; sb++) { const a = DM.emptyState('EM01'), b = DM.emptyState('E503'); a.panel = b.panel = 3; a.subPanel = b.subPanel = sb; ok(DM.autoRd('EM01', a) === DM.autoRd('E503', b), 'F MNT＝NB LTPS sub' + sb); nF++; }
    for (const k of MNT) { const h = DM.setGate(k, Object.assign(DM.emptyState(k), { hand: 1, panel: 2 }), 'Dual-Gate'), m = DM.setGate(k, Object.assign(DM.emptyState(k), { hand: 1, panel: 3 }), 'MUX2');
      ok(h.rd === 1 && m.rd === 1 && h.rd === m.rd, 'F ' + k + ' MUX2 rd＝HSD rd：' + m.rd + '／' + h.rd); nF++;
      for (let from = 0; from <= 3; from++) for (const g of DM.autoGateItems(k)) { const s0 = DM.emptyState(k); s0.hand = 0; s0.panel = from; const ns = DM.autoSetGate(k, s0, g);
        if (ns) { ok(ns.rd === DM.autoRd(k, ns) && ns.rd === seg(ns.panel, ns.subPanel, ns.triGate) - 1, 'F Auto Gate ' + k + ' ' + g + ' from ' + from + ' rd ' + ns.rd); nF++; } } }
    tab('F', ['rd 規則矩陣', nF + ' 項']);
  }
  function render() { w.dmRender(); }
  ok(!jerr.length, 'jsdomError：' + jerr.slice(0, 3).join(' | '));
  if (process.env.MUXALL_JSON) fs.writeFileSync(process.env.MUXALL_JSON, JSON.stringify(tables, null, 1));
  console.log(fails.join('\n'));
  console.log('check_datamap_muxall：' + pass + ' pass / ' + fail + ' fail');
  console.log(JSON.stringify(tables.Asum), JSON.stringify((tables.B || []).map(x => x[3])));
  dom.window.close(); process.exit(fail ? 1 : 0);
})();
