#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   check_no_verif_labels.mjs — 對外網頁不顯示驗證等級／來源標籤（Bruce 2026-10-23）
   Bruce 原話：「NB tcon DBG 應用網頁不要寫什麼『原廠文件』，然後『實測驗證』這些也都不要寫，那一列都拿掉。」
   ⇒ 驗證等級（實測驗證／原廠腳本／原廠文件／推論，未實測）與出處只留在 assistant_kb，頁面、tooltip、匯出內容都不寫。
   掃「去註解後」的發佈內容（使用者看得到的字：HTML 文字、tooltip、JS 字串；匯出檔的字也來自這些字串），
   範圍同 check_no_names.mjs：根目錄 *.html、common／data 的 js（tools、tests、docs 等不是頁面，不掃）。
   用法：node tools/check_no_verif_labels.mjs <去註解後的目錄，例如 _site>
         node tools/check_no_verif_labels.mjs --repo .   （本機：先去註解到暫存目錄再掃）
   Pages 工作流程在「去註解」之後跑這支；不過就不發佈。
   ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import { execFileSync } from 'node:child_process';

/* 三語（zh-TW／zh-CN／en）。只放「等級／來源標籤」的固定字樣，不擋一般敘述（例：「實測 188 份檔案」是資料統計，不是等級標籤）。 */
export const VERIF_LABELS = [
  '實測驗證', '实测验证', 'Verification level', '驗證等級', '验证等级',
  '原廠文件', '原厂文件', 'Vendor document',
  '原廠腳本', '原厂脚本', 'Vendor script',
  '推論，未實測', '推论，未实测', 'Inferred, not measured', 'not measured',
  '實測設定', '实测设定', '原廠 debug 文件', '原厂 debug 文件',
  '未實機確認', '未实机确认', 'not been checked on real hardware'
];
export function findVerifLabels(s) {
  const out = [];
  for (const w of VERIF_LABELS) { let i = -1; while ((i = s.indexOf(w, i + 1)) >= 0) out.push({ at: i, word: w }); }
  return out.sort((a, b) => a.at - b.at);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const args = process.argv.slice(2);
  let dir = args[0] || '_site';
  if (args[0] === '--repo') {
    const repo = path.resolve(args[1] || '.');
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'noverif-'));
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
      for (const hit of findVerifLabels(l)) { bad++; console.log(`  ✗ ${f}:${i + 1}:${hit.at + 1}  「${hit.word}」  …${l.slice(Math.max(0, hit.at - 30), hit.at + 40).trim()}…`); }
    });
  }
  if (bad) { console.log(`✗ check_no_verif_labels：${bad} 處驗證等級／來源標籤——對外頁面不寫等級與出處（只留在 assistant_kb）`); process.exit(1); }
  console.log(`✓ check_no_verif_labels：${files.length} 個發佈檔沒有驗證等級／來源標籤（${VERIF_LABELS.length} 個字樣）`);
}
