#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   check_no_names.mjs — 對外網頁不可出現同事／客戶人名與信件出處（Bruce 2026-10-22）
   掃「去註解後」的發佈內容（使用者看得到的字：HTML 文字、tooltip、JS 字串），範圍同 check_no_vendor_ui.mjs：
   根目錄 *.html、common／data 的 js（tools、tests、docs 等不是頁面，不掃）。
   名單與比對規則見 tools/name-guard.mjs（雜湊名單，明文不進 repo）。輸出只印遮罩後的片段。
   用法：node tools/check_no_names.mjs <去註解後的目錄，例如 _site>
         node tools/check_no_names.mjs --repo .   （本機：先去註解到暫存目錄再掃）
   Pages 工作流程在「去註解」之後跑這支；不過就不發佈。
   ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import { execFileSync } from 'node:child_process';
import { findNames, NAME_GUARD_COUNTS } from './name-guard.mjs';
const PLAIN = process.argv.includes('--plain');   /* 本機除錯：印原文片段（CI 不要加，log 公開） */
const args = process.argv.slice(2).filter(a => a !== '--plain');
let dir = args[0] || '_site';
if (args[0] === '--repo') {
  const repo = path.resolve(args[1] || '.');
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'noname-'));
  execFileSync(process.execPath, [path.join(repo, 'tools/build/strip-comments.mjs'), repo, dir], { stdio: 'ignore' });
}
const files = [];
(function walk(d, rel) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) { if (!/^(node_modules|archive|tools|tests|docs|staging|outputs|scripts|_build|_ref|\.git)$/.test(e.name)) walk(path.join(d, e.name), r); }
    else if (/\.(html|js)$/.test(e.name)) files.push(r);
  }
})(dir, '');
let bad = 0;
for (const f of files) {
  const lines = fs.readFileSync(path.join(dir, f), 'utf8').split('\n');
  lines.forEach((l, i) => {
    for (const hit of findNames(l)) { bad++; console.log(`  ✗ ${f}:${i + 1}:${hit.at + 1}  ${hit.kind}「${hit.masked}」` + (PLAIN ? '  …' + l.slice(Math.max(0, hit.at - 30), hit.at + 40).trim() + '…' : '')); }
  });
}
if (bad) { console.log(`✗ check_no_names：${bad} 處人名／信件出處——對外頁面改寫成中性來源（例：實測設定（2026-10）、原廠 debug 文件、model 暫存器表）`); process.exit(1); }
console.log(`✓ check_no_names：${files.length} 個發佈檔沒有人名／信件出處（名單：中文 ${NAME_GUARD_COUNTS.cjk}、英文全名 ${NAME_GUARD_COUNTS.enFull}、英文單名 ${NAME_GUARD_COUNTS.enOne}）`);
