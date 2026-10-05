#!/usr/bin/env node
// 線上（去註解版）行號 → repo 原始碼行號（P103，2026-10-05）
//
// 用法：node tools/build/map-line.mjs <檔名> <線上行號> [線上欄位]
//   例：node tools/build/map-line.mjs wfg.html 41235 17
// 依據：線上的 /_build/report.json（建置時記下的行號位移表）。預設抓正式站；
//   REPORT=<本機 report.json 路徑> 可改用本機建置結果（node tools/build/strip-comments.mjs . _site 產生 _site/_build/report.json）。
//
// 大多數檔案行號完全相同（跨行註解換成同樣數量的換行）；只有少數「整段刪除」的跨行 HTML 註解會讓後面的行往前移，
// 位移逐筆記在 report.json。欄位：同一行裡若有被刪的行內註解，註解之後的欄位會往左移，請以印出的原始碼行內容對照。
import { readFileSync, existsSync } from 'node:fs';

const [, , file, lineArg, colArg] = process.argv;
if (!file || !lineArg) { console.error('usage: map-line.mjs <file> <siteLine> [siteCol]'); process.exit(2); }
const siteLine = Number(lineArg);
const SITE = process.env.SITE_URL || 'https://brucecheng0428.github.io/tcon-tools';
const report = process.env.REPORT ? JSON.parse(readFileSync(process.env.REPORT, 'utf8')) : await (await fetch(`${SITE}/_build/report.json`, { cache: 'no-store' })).json();
const info = report.files[file];
if (!info) { console.log(`${file} 沒有經過去註解處理（原樣發佈），行號＝原始碼行號：${siteLine}`); process.exit(0); }
let cum = 0;
for (const s of [...info.lineShifts].sort((a, b) => a.line - b.line)) {
  const siteAfter = s.line + cum + s.delta; // 這筆位移之後的第一行，在線上的行號
  if (siteLine >= siteAfter) cum += s.delta; else break;
}
const srcLine = siteLine - cum;
console.log(`線上 ${file}:${siteLine}${colArg ? ':' + colArg : ''} → 原始碼 ${file}:${srcLine}（建置 commit ${report.commit?.slice(0, 7) || '?'}）`);
if (existsSync(file)) {
  const lines = readFileSync(file, 'utf8').split(/\r\n|\n|\r/);
  console.log(`原始碼該行：${(lines[srcLine - 1] || '').slice(0, 200)}`);
  console.log('⚠ 請確認本機 repo 與上面的建置 commit 相同（git log -1），不同版本的行號不能直接對照。');
}
