#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   check_commit_names.mjs — commit message、作者欄與新增內容不可出現同事／客戶人名（Bruce 2026-10-22）
   起因：check_no_names.mjs 只擋「發佈的頁面」；CHANGELOG、tools、tests 與 commit message 仍寫進人名，
   repo 公開，歷史裡的人名一樣看得到（2026-10-22 已改寫整個歷史清掉）。這支把關「之後新增的」：
   - commit-msg hook：訊息＋暫存區新增的行（--msg-file <檔> --staged）
   - CI（.github/workflows/name-guard.yml）：區間內每個 commit 的訊息、作者／提交者名字、新增的行（--range A..B）
   名單與比對：同 tools/name-guard.mjs（雜湊名單 tools/name-guard.json，明文只在 assistant_kb）。
   只看名單命中（kind=name）與 email；email 允許 Bruce 本人、Claude／GitHub noreply。
   「某某 10/14」這類出處格式不在這裡擋（Dispatch 10/7、Per Bruce 2026-09-30 等誤判太多），頁面由 check_no_names 擋。
   名單誤判（一般詞剛好同名單）：該行加「name-guard:allow」。
   輸出只印遮罩後片段（CI log 公開）。exit 0 通過、1 有人名、2 檢查跑不起來（不當作通過）。
   ═══════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { findNames } from './name-guard.mjs';

const ZERO = /^0+$/;
const EMAIL_OK = /^(?:brucecheng0428@gmail\.com|bruce@rad-ic\.com|noreply@anthropic\.com|[^@\s]+@users\.noreply\.github\.com|noreply@github\.com)$/i;
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 2 ** 30 });

let bad = 0;
function scan(text, where) {
  text.split('\n').forEach((ln, i) => {
    if (ln.includes('name-guard:allow')) return;
    for (const h of findNames(ln)) {
      if (h.kind !== 'name' && h.kind !== 'email') continue;
      if (h.kind === 'email' && EMAIL_OK.test(ln.slice(h.at, h.at + h.masked.length))) continue;
      bad++; console.log(`  ✗ ${where}:${i + 1}  ${h.kind}「${h.masked}」`);
    }
  });
}
/* 新增的行（+ 開頭，不含 +++ 檔頭）；二進位差異 git 只印一行說明，自然略過 */
function added(diff, label) {
  let file = '?', out = [];
  for (const ln of diff.split('\n')) {
    if (ln.startsWith('+++ ')) { file = ln.slice(4).replace(/^b\//, ''); continue; }
    if (ln.startsWith('+')) out.push([file, ln.slice(1)]);
  }
  const byFile = new Map();
  for (const [f, l] of out) { if (!byFile.has(f)) byFile.set(f, []); byFile.get(f).push(l); }
  for (const [f, ls] of byFile) scan(ls.join('\n'), `${label}${f}（新增行）`);
}

try {
  const msgFile = opt('--msg-file');
  if (msgFile) scan(readFileSync(msgFile, 'utf8').split('\n').filter(l => !l.startsWith('#')).join('\n'), 'commit message');
  if (args.includes('--staged')) added(git('diff', '--cached', '-U0', '--no-color', '--no-ext-diff'), '');
  const range = opt('--range');
  if (range) {
    const [a, b] = range.split('..');
    let shas;
    const isCommit = s => { try { return git('cat-file', '-t', s).trim() === 'commit'; } catch { return false; } };
    if (!a || ZERO.test(a)) {
      let base = null; for (const r of ['origin/main', 'main']) if (isCommit(r)) { base = r; break; }
      shas = (base ? git('rev-list', '--max-count=50', b, '--not', base) : '').split('\n').filter(Boolean);
      if (!shas.length) shas = [git('rev-parse', b).trim()];
    } else if (!isCommit(a)) shas = [git('rev-parse', b).trim()];   // force push：舊 sha 不在了，只查最新
    else shas = git('rev-list', `${a}..${b}`).split('\n').filter(Boolean);
    for (const s of shas) {
      const short = s.slice(0, 8);
      scan(git('log', '-1', '--format=%an%n%cn', s), `${short} 作者／提交者`);
      scan(git('log', '-1', '--format=%B', s), `${short} commit message`);
      added(git('diff-tree', '-p', '-U0', '--no-color', '--no-ext-diff', '--root', '-m', '--first-parent', s), `${short} `);
    }
    console.log(`  （檢查 ${shas.length} 個 commit）`);
  }
  if (!msgFile && !range && !args.includes('--staged')) { console.log('用法：--msg-file <檔> [--staged] | --staged | --range A..B'); process.exit(2); }
} catch (e) { console.log('✗ check_commit_names 跑不起來：' + e.message.split('\n')[0]); process.exit(2); }

if (bad) { console.log(`✗ check_commit_names：${bad} 處人名／email —— commit message 與 repo 內容改寫成中性稱呼（同事、客戶 RD、原廠 FAE、實測設定（2026-10））；名單誤判才在該行加 name-guard:allow`); process.exit(1); }
console.log('✓ check_commit_names：commit message 與新增內容沒有人名');
