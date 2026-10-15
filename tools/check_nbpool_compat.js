// v1.35.7 相容檢查：NB e50x 改用 MNT pool 後，code 0～17（GN1）／0～23（GN2）的名稱必須與 Python UI 字典逐一相同；只多出 code 18～29。
'use strict';
const path = require('path');
const ROOT = path.resolve(process.argv[2] || '.');
const DM = require(path.join(ROOT, 'common/datamap-core.js'));
const GN1 = { 'R3': 0, 'G3': 1, 'B3': 2, 'R4': 3, 'G4': 4, 'B4': 5, 'R1': 6, 'G1': 7, 'B1': 8, 'R2': 9, 'G2': 10, 'B2': 11, 'R-2': 12, 'G-2': 13, 'B-2': 14, 'R-1': 15, 'G-1': 16, 'B-1': 17, 'X': 31 };
const GN2 = { 'R5': 0, 'G5': 1, 'B5': 2, 'R6': 3, 'G6': 4, 'B6': 5, 'R3': 6, 'G3': 7, 'B3': 8, 'R4': 9, 'G4': 10, 'B4': 11, 'R1': 12, 'G1': 13, 'B1': 14, 'R2': 15, 'G2': 16, 'B2': 17, 'R-2': 18, 'G-2': 19, 'B-2': 20, 'R-1': 21, 'G-1': 22, 'B-1': 23, 'X': 31 };
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const inv = d => { const o = {}; Object.keys(d).forEach(k => o[d[k]] = k); return o; };
const NB = DM.SELECT_KEYS.filter(k => DM.MODELS[k].kind === 'nb' && DM.MODELS[k].sem === 'e50x');
for (const k of NB) for (const de of [[0, 0], [1, 0xE], [1, 0x1F], [0, 0x3]]) for (const [gate, panel, rd] of [['single', 0, 0], ['dual', 2, 1]]) {
  const s = Object.assign(DM.emptyState(k), { hand: 1, panel, rd, deEn: de[0], deSel: de[1] });
  for (let row = 0; row < 4; row++) {
    if (gate === 'single' && (row & 1)) continue;   // Single 的 1-2／2-2 是複本列
    const ref = inv(gate === 'dual' && (row & 1) ? GN2 : GN1), lim = gate === 'dual' && (row & 1) ? 24 : 18;
    const name = c => { const t = DM.cloneState(s); t['c' + row * 6] = c; return DM.cellView(k, t, row, 0).txt; };
    for (let c = 0; c < lim; c++) ok(name(c) === ref[c], k + ' ' + gate + ' row' + row + ' de' + de + ' code ' + c + '：' + name(c) + ' vs PY ' + ref[c]);
    ok(name(31) === 'X', k + ' X');
    const extra = []; for (let c = lim; c < 30; c++) extra.push(name(c)); if (k === NB[0] && de[0] === 1 && row < 2) console.log('  ' + k + ' ' + gate + ' row' + row + ' 新開放 code ' + lim + '～29：' + extra.join(' '));
  }
}
console.log('NB 型號 ' + NB.join('、') + '｜check_nbpool_compat：' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
