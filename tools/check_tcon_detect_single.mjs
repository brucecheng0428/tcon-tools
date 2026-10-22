#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   check_tcon_detect_single.mjs — 認 T-CON 全站只有 common/tcon-detect.js 一套（Bruce 2026-10-22）
   Bruce 原話：「認Tcon的方式全部都一樣啊，你管他是哪個分頁、哪個網頁？」
   掃「去註解後」的發佈內容（根目錄 *.html、common／data 的 js），除了 common/tcon-detect.js 之外，
   出現下列「自己辨認」的特徵就失敗：
     ・讀 ID 暫存器：7C:0x95／0x98（1-byte offset）、7D:0x007D、3E:0x207E、0xFF00 讀 3 byte
     ・ID 表：CheckICID 的 ID 位元組（01 EF／02 EF／12 E5／05 E5／12 F5）、E503 版本名表、SY 表（0x10:'A1'）
   要用就呼叫 TconDetect（detect／scanIcId／matchIcId／e501ByRom／readEn01Ver／REG）。
   用法：node tools/check_tcon_detect_single.mjs <去註解後的目錄，例如 _site>
         node tools/check_tcon_detect_single.mjs --repo .
   ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import { execFileSync } from 'node:child_process';
const args = process.argv.slice(2);
let dir = args[0] || '_site';
if (args[0] === '--repo') {
  const repo = path.resolve(args[1] || '.');
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tcondet-'));
  execFileSync(process.execPath, [path.join(repo, 'tools/build/strip-comments.mjs'), repo, dir], { stdio: 'ignore' });
}
const OWNER = 'common/tcon-detect.js';
const RULES = [
  ['讀 7C:0x95／0x98（E501 ID）', /0x7C\s*,\s*1\s*,\s*0x9[58]\b/i],
  ['讀 7D:0x007D（E503 版本）', /0x7D\s*,\s*2\s*,\s*0x0*7D\b/i],
  ['讀 3E:0x207E（EN01 版本）', /(?:,|addr\s*:)\s*0x207E\b/i],
  ['讀 0xFF00 ×3（CheckICID）', /0xFF00\s*,\s*3\s*\)/i],
  ['CheckICID ID 位元組表', /\[\s*0x(?:01|02|12|05)\s*,\s*0x(?:EF|E5|F5)\s*,/i],
  ['E503 版本名表', /['"]E503A1 T[123]['"]\s*[,}\]]/],
  ['SY 表（EN01 A1／A2）', /0x1[01]\s*:\s*['"]A[12]['"]/],
];
/* 例外（一條一個理由）：不是辨認型號，而是通訊自檢的黃金向量 */
const ALLOW = [
  [/^i2c\.html$/, /var I2CT_ID_VEC = /],   // 通訊自檢：同一塊實機板 0xFF00 讀回值逐 byte 比對（含版本 nibble），只當附帶資訊、不判型號
];
const files = [];
(function walk(d, rel) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) { if (!/^(node_modules|archive|tools|tests|docs|staging|outputs|scripts|_build|_ref|\.git)$/.test(e.name)) walk(path.join(d, e.name), r); }
    else if (/\.(html|js)$/.test(e.name) && r !== OWNER) files.push(r);
  }
})(dir, '');
let bad = 0;
for (const f of files) {
  fs.readFileSync(path.join(dir, f), 'utf8').split('\n').forEach((l, i) => {
    if (ALLOW.some(([fr, lr]) => fr.test(f) && lr.test(l))) return;
    for (const [what, re] of RULES) { const m = l.match(re); if (m) { bad++; console.log(`  ✗ ${f}:${i + 1}  ${what}：…${l.slice(Math.max(0, m.index - 30), m.index + m[0].length + 20).trim()}…`); } }
  });
}
if (!fs.existsSync(path.join(dir, OWNER))) { console.log(`✗ 找不到 ${OWNER}`); process.exit(1); }
if (bad) { console.log(`✗ check_tcon_detect_single：${bad} 處自己寫的 T-CON 辨認——改呼叫 ${OWNER}（TconDetect）`); process.exit(1); }
console.log(`✓ check_tcon_detect_single：${files.length} 個發佈檔沒有自建的 T-CON 辨認，全部走 ${OWNER}`);
