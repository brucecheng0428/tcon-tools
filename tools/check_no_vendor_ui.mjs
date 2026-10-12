#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   check_no_vendor_ui.mjs — 網頁上不可再出現「原廠 UI」（Bruce 2026-10-12）
   Bruce 原話：「網頁裡面有寫到原廠 UI 的，不要寫原廠，寫瑞鼎 UI」。
   掃「去註解後」的發佈內容（使用者看得到的字：HTML 文字、tooltip、JS 字串），註解不算。
   擋：原廠 UI／原廠 TCON UI／原廠 EM01 UI／原廠 Python UI（含簡體「原厂」）、英文 vendor UI。
   不擋：原廠圖／原廠表／原廠規格等（指原廠資料或規格，不是 UI 名稱）；非瑞鼎產品（量測儀、邏輯分析儀）
         的軟體一律寫「原廠軟體」或產品名，不寫「原廠 UI」。
   用法：node tools/check_no_vendor_ui.mjs <去註解後的目錄，例如 _site>
         node tools/check_no_vendor_ui.mjs --repo .   （本機：先去註解到暫存目錄再掃）
   Pages 工作流程在「去註解」之後跑這支；不過就不發佈。
   ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import { execFileSync } from 'node:child_process';
const args = process.argv.slice(2);
let dir = args[0] || '_site';
if (args[0] === '--repo') {
  const repo = path.resolve(args[1] || '.');
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'novui-'));
  execFileSync(process.execPath, [path.join(repo, 'tools/build/strip-comments.mjs'), repo, dir], { stdio: 'ignore' });
}
const BAD = /原[廠厂]\s*(?:TCON\s*|EM0\d\s*|E5\d\d\s*|Python\s*)?UI|\b[Vv]endor\s+(?:TCON\s+)?UI\b/;
const files = [];
(function walk(d, rel) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) { if (!/^(node_modules|archive|tools|tests|docs|staging|outputs|scripts|_build|\.git)$/.test(e.name)) walk(path.join(d, e.name), r); }
    else if (/\.(html|js)$/.test(e.name)) files.push(r);
  }
})(dir, '');
let bad = 0;
for (const f of files) {
  const lines = fs.readFileSync(path.join(dir, f), 'utf8').split('\n');
  lines.forEach((l, i) => { const m = l.match(BAD); if (m) { bad++; const s = Math.max(0, m.index - 30); console.log(`  ✗ ${f}:${i + 1}: …${l.slice(s, m.index + m[0].length + 30)}…`); } });
}
if (bad) { console.log(`✗ check_no_vendor_ui：${bad} 處「原廠 UI」——請改成「瑞鼎 UI」（非瑞鼎產品寫「原廠軟體」或產品名）`); process.exit(1); }
console.log(`✓ check_no_vendor_ui：${files.length} 個發佈檔沒有「原廠 UI」`);
