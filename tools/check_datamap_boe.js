#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   check_datamap_boe.js — v1.27.0 全民 code ＝ 同事A（瑞鼎 RD）Excel「BOE」分頁 逐格比對
   用法：node tools/check_datamap_boe.js [repo] [--qm <全民 EM01 code.bin>] [--boe <EM01A1_rt7_register_force_mapping.xlsx>]
     ・BOE 分頁（同事A 2026-10-13 17:18 寄來；Bruce：「針對全民的 code 特別做的…data mapping 那個表格要跟 BOE 這邊的設定完全一樣」）
       已抽成下方 FX（原廠檔、客戶 code 不進版控）；給 --boe 時用 python3＋openpyxl 重新抽一次，先確認 FX＝檔案內容。
     1) Pool 表（code 0~29 × 第 1~9 欄）＝ mntName（Mirror 0／1 都一樣：Mirror 不平移名稱）
     2) 起始欄表（reg_force_de_en／reg_force_de_sel）＝ mntBaseT（de_en＝0 那列照 1D1G 比，同事A：1D1G＝第 1 欄）
     3) 給 --qm：匯入全民 code ⇒ ② 每一格名稱＝BOE（_0＝Gate1、_1＝Gate2 逐格；_2／_3 的 INDEX 與 _0／_1 相同 ⇒ 同一組答案），
        逐格列出比對表；每格也要＝Pool[code][T1 起始欄＋gate 偏移]。
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path'), fs = require('fs'), cp = require('child_process');
const args = process.argv.slice(2), opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const QM = opt('--qm'), BOE = opt('--boe');
const pos = args.filter((a, i) => !/^--/.test(a) && !/^--/.test(args[i - 1] || ''));
const ROOT = path.resolve(pos[0] || path.join(__dirname, '..'));
const DM = require(path.join(ROOT, 'common/datamap-core.js'));
global.TCONDataMap = DM;
let fail = 0, pass = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const hex2 = v => (v | 0).toString(16).toUpperCase().padStart(2, '0');
const FX = {"start":[{"row":5,"en":0,"sel":"X","T1col":1,"ts":{"T1":1,"T2":2,"T3":3,"T4":4,"T5":5}},{"row":7,"en":1,"sel":"0_0001","T1col":1,"ts":{"T1":1,"T2":2,"T3":3,"T4":4,"T5":5}},{"row":9,"en":1,"sel":"0_0010","T1col":2,"ts":{"T1":2,"T2":3,"T3":4,"T4":5,"T5":6}},{"row":11,"en":1,"sel":"0_0100","T1col":3,"ts":{"T1":3,"T2":4,"T3":5,"T4":6,"T5":7}},{"row":13,"en":1,"sel":"0_1000","T1col":4,"ts":{"T1":4,"T2":5,"T3":6,"T4":7,"T5":8}},{"row":15,"en":1,"sel":"1_0000","T1col":5,"ts":{"T1":5,"T2":6,"T3":7,"T4":8,"T5":9}},{"row":17,"en":1,"sel":"1_1111","T1col":1,"ts":{"T1":1,"T2":2,"T3":3,"T4":4,"T5":5,"T6":6,"T7":7,"T8":8,"T9":9}}],"pool":{"0":{"1":"R1","2":"R3","3":"R5","4":"R7","5":"R9"},"1":{"1":"G1","2":"G3","3":"G5","4":"G7","5":"G9"},"2":{"1":"B1","2":"B3","3":"B5","4":"B7","5":"B9"},"3":{"1":"R2","2":"R4","3":"R6","4":"R8","5":"R10"},"4":{"1":"G2","2":"G4","3":"G6","4":"G8","5":"G10"},"5":{"1":"B2","2":"B4","3":"B6","4":"B8","5":"B10"},"6":{"1":"R-2","2":"R1","3":"R3","4":"R5","5":"R7","6":"R9"},"7":{"1":"G-2","2":"G1","3":"G3","4":"G5","5":"G7","6":"G9"},"8":{"1":"B-2","2":"B1","3":"B3","4":"B5","5":"B7","6":"B9"},"9":{"1":"R-1","2":"R2","3":"R4","4":"R6","5":"R8","6":"R10"},"10":{"1":"G-1","2":"G2","3":"G4","4":"G6","5":"G8","6":"G10"},"11":{"1":"B-1","2":"B2","3":"B4","4":"B6","5":"B8","6":"B10"},"12":{"1":"R-4","2":"R-2","3":"R1","4":"R3","5":"R5","6":"R7","7":"R9"},"13":{"1":"G-4","2":"G-2","3":"G1","4":"G3","5":"G5","6":"G7","7":"G9"},"14":{"1":"B-4","2":"B-2","3":"B1","4":"B3","5":"B5","6":"B7","7":"B9"},"15":{"1":"R-3","2":"R-1","3":"R2","4":"R4","5":"R6","6":"R8","7":"R10"},"16":{"1":"G-3","2":"G-1","3":"G2","4":"G4","5":"G6","6":"G8","7":"G10"},"17":{"1":"B-3","2":"B-1","3":"B2","4":"B4","5":"B6","6":"B8","7":"B10"},"18":{"1":"R-6","2":"R-4","3":"R-2","4":"R1","5":"R3","6":"R5","7":"R7","8":"R9"},"19":{"1":"G-6","2":"G-4","3":"G-2","4":"G1","5":"G3","6":"G5","7":"G7","8":"G9"},"20":{"1":"B-6","2":"B-4","3":"B-2","4":"B1","5":"B3","6":"B5","7":"B7","8":"B9"},"21":{"1":"R-5","2":"R-3","3":"R-1","4":"R2","5":"R4","6":"R6","7":"R8","8":"R10"},"22":{"1":"G-5","2":"G-3","3":"G-1","4":"G2","5":"G4","6":"G6","7":"G8","8":"G10"},"23":{"1":"B-5","2":"B-3","3":"B-1","4":"B2","5":"B4","6":"B6","7":"B8","8":"B10"},"24":{"1":"R-8","2":"R-6","3":"R-4","4":"R-2","5":"R1","6":"R3","7":"R5","8":"R7","9":"R9"},"25":{"1":"G-8","2":"G-6","3":"G-4","4":"G-2","5":"G1","6":"G3","7":"G5","8":"G7","9":"G9"},"26":{"1":"B-8","2":"B-6","3":"B-4","4":"B-2","5":"B1","6":"B3","7":"B5","8":"B7","9":"B9"},"27":{"1":"R-7","2":"R-5","3":"R-3","4":"R-1","5":"R2","6":"R4","7":"R6","8":"R8","9":"R10"},"28":{"1":"G-7","2":"G-5","3":"G-3","4":"G-1","5":"G2","6":"G4","7":"G6","8":"G8","9":"G10"},"29":{"1":"B-7","2":"B-5","3":"B-3","4":"B-1","5":"B2","6":"B4","7":"B6","8":"B8","9":"B10"}},"examples":[{"label":"Gate1","regs":["r0_0","g0_0","b0_0","r1_0","g1_0","b1_0"],"index":[17,16,15,14,13,12],"names":["B-3","G-3","R-3","B-4","G-4","R-4"],"de":"T1"},{"label":"Gate2","regs":["r0_1","g0_1","b0_1","r1_1","g1_1","b1_1"],"index":[16,15,14,13,12,23],"names":["G-3","R-3","B-4","G-4","R-4","B-5"],"de":"T1"}]};
const PY = "import sys, json, openpyxl\nwb = openpyxl.load_workbook(sys.argv[1], data_only=True); ws = wb['BOE']\nstart = []\nfor r in range(5, 18, 2):\n    en, sel = ws.cell(r, 3).value, ws.cell(r, 4).value\n    if en is None: continue\n    ts = {}\n    for c in range(8, 20):\n        v = ws.cell(r, c).value\n        if isinstance(v, str) and v.startswith('T'): ts[v] = c - 7\n    start.append({'row': r, 'en': en, 'sel': str(sel), 'T1col': ts.get('T1'), 'ts': ts})\npool = {}\nfor r in range(20, 50):\n    code = ws.cell(r, 6).value\n    pool[str(code)] = {str(c - 7): ws.cell(r, c).value for c in range(8, 20) if ws.cell(r, c).value is not None}\nex = []\nfor (hr, ir, nr) in [(54, 55, 56), (58, 59, 60)]:\n    regs = [ws.cell(hr, c).value for c in range(8, 14)]\n    idx = [ws.cell(ir, c).value for c in range(8, 14)]\n    names = [ws.cell(nr, c).value for c in range(8, 14)]\n    ex.append({'label': ws.cell(nr, 6).value, 'regs': regs, 'index': idx, 'names': names, 'de': ws.cell(53, 8).value})\nprint(json.dumps({'start': start, 'pool': pool, 'examples': ex}, ensure_ascii=False))\n";
console.log('── 0) FX＝BOE 分頁' + (BOE ? '（--boe 重新抽取比對）' : '（沒給 --boe，用內建 FX）'));
if (BOE) {
  let out = null;
  try { out = cp.execFileSync('python3', ['-c', PY, BOE], { encoding: 'utf8', cwd: require('os').tmpdir() }); } catch (e) { console.log('  python3／openpyxl 失敗：' + String(e.message || e).split('\n')[0]); }
  ok(out && JSON.stringify(JSON.parse(out)) === JSON.stringify(FX), '內建 FX 與 ' + path.basename(BOE) + ' 的 BOE 分頁逐格相同');
}
console.log('── 1) Pool 表＝mntName（Mirror 0／1）');
{ let n = 0; const bad = [];
  Object.keys(FX.pool).forEach(code => Object.keys(FX.pool[code]).forEach(col => {
    const ex = FX.pool[code][col], m0 = DM.mntName('single', 0, +code, 0, +col), m1 = DM.mntName('single', 0, +code, 1, +col); n++;
    if (ex !== m0 || ex !== m1) bad.push('code ' + code + ' 第 ' + col + ' 欄：BOE ' + ex + '／網頁 ' + m0 + '／Mirror1 ' + m1);
  }));
  ok(!bad.length, 'Pool 表 ' + n + ' 格全部相同' + (bad.length ? '：' + bad.slice(0, 6).join('；') : ''));
  console.log('    Pool 表比對 ' + (n - bad.length) + '/' + n + ' 格相同（Mirror 0、Mirror 1 各比一次）'); }
console.log('── 2) 起始欄表＝mntBaseT');
FX.start.forEach(r => {
  const s = Object.assign(DM.emptyState('EM01'), r.en ? { deEn: 1, deSel: parseInt(r.sel.replace('_', ''), 2) } : { deEn: 0, panel: 0 });
  const t = DM.mntBaseT(s, 'single').t;
  ok(t === r.T1col, 'de_en=' + r.en + ' de_sel=' + r.sel + '：BOE T1 在第 ' + r.T1col + ' 欄，網頁 ' + t);
  console.log('    de_en=' + r.en + ' de_sel=' + r.sel + (r.en ? '' : '（照 1D1G）') + '：BOE T1＝第 ' + r.T1col + ' 欄／網頁第 ' + t + ' 欄 ' + (t === r.T1col ? '✓' : '✗'));
});
function done() { console.log((fail ? '✗' : '✓') + ' check_datamap_boe ' + pass + ' pass / ' + fail + ' fail'); process.exit(fail ? 1 : 0); }
(async () => {
  if (!QM) { console.log('── 3) 沒給 --qm，略過全民 code 比對'); return done(); }
  console.log('── 3) 全民 code：' + path.basename(QM));
  const { JSDOM, VirtualConsole } = require(path.join(ROOT, 'node_modules/jsdom'));
  const vc = new VirtualConsole(); vc.on('jsdomError', e => { console.log('jsdomError', e.message); fail++; });
  const dom = await JSDOM.fromFile(path.join(ROOT, 'datamap.html'), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) { w.WebSocket = function () { throw new Error('no ws'); }; } });
  await new Promise(r => dom.window.addEventListener('load', r));
  const w = dom.window, d = w.document, $ = id => d.getElementById(id);
  const fire = (el, v) => { if (v !== undefined) el.value = v; el.dispatchEvent(new w.Event('change')); };
  const ask = () => { const a = $('dm-ask'); if (a && !a.classList.contains('hidden')) $('dm-ask-yes').click(); };
  if (w.dmClearImport) w.dmClearImport();
  fire($('dm-model'), 'EM01'); ask();
  w.dmImportBytes(new Uint8Array(fs.readFileSync(QM)), path.basename(QM)); ask();
  await new Promise(r => setTimeout(r, 100));
  const s = w.dmState.cur, gate = (DM.gateOf && DM.gateOf('EM01', s)) || 'single', T1 = DM.mntBaseT(s, gate).t;
  ok((s.deEn | 0) === 1 && T1 === 1, '全民 de_en＝' + s.deEn + '、de_sel＝0x' + hex2(s.deSel) + ' ⇒ T1 在第 ' + T1 + ' 欄（BOE「DE T1」＝第 1 欄）');
  ok((s.mirror | 0) === 1, '全民 Mirror＝1（BOE 答案是 Mirror 1 的 code 直接查表）');
  const cells = Array.from(d.querySelectorAll('[id^="dm-c"]')).filter(e => /^dm-c\d+-\d+$/.test(e.id));
  const nRow = 1 + Math.max.apply(null, cells.map(e => +e.id.split('-')[1].slice(1)));
  const RGB = ['r0', 'g0', 'b0', 'r1', 'g1', 'b1'];
  console.log('    gate＝' + gate + '；② 表格 ' + nRow + ' 列 × 6 格；BOE 分頁有 _0（Gate1）與 _1（Gate2）；_2／_3 的 INDEX 與 _0／_1 相同 ⇒ 用同一組 BOE 答案');
  console.log('    列 | 暫存器 | code | ② 名稱 | BOE 名稱 | 結果');
  let nCmp = 0, nOk = 0;
  for (let r = 0; r < nRow; r++) {
    const ex = FX.examples.find(e => e.index.every((v, c) => (s['c' + (r * 6 + c)] | 0) === v));
    const rel = DM.mntRel ? DM.mntRel(gate, r) : 0;
    for (let c = 0; c < 6; c++) {
      const code = s['c' + (r * 6 + c)] | 0, nm = $('dm-c' + r + '-' + c).value;
      const pool = (FX.pool[String(code)] || {})[String(T1 + rel)] || DM.mntName('single', 0, code, 0, T1 + rel);
      const want = ex ? ex.names[c] : pool, good = nm === want && nm === pool;
      nCmp++; if (good) nOk++;
      console.log('    _' + r + ' | ' + RGB[c] + '_' + r + ' | ' + code + ' | ' + nm + ' | ' + want + (ex ? '（' + ex.label + '）' : '（Pool 第 ' + (T1 + rel) + ' 欄）') + ' | ' + (good ? '✓' : '✗'));
    }
    if (r < 2) ok(!!ex && ex.label === (r ? 'Gate2' : 'Gate1'), '_' + r + ' 的 code ＝ BOE ' + (r ? 'Gate2' : 'Gate1') + ' 的 INDEX');
  }
  ok(nOk === nCmp, '② 全部 ' + nCmp + ' 格名稱＝BOE 分頁（' + nOk + '/' + nCmp + '）');
  console.log('    合計 ' + nOk + '/' + nCmp + ' 格一致');
  dom.window.close();
  done();
})().catch(e => { console.log('✗ ' + (e && e.stack || e)); process.exit(1); });
