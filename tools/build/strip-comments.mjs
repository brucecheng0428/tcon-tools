#!/usr/bin/env node
// Pages 建置：把要發佈的檔案去掉註解，輸出到 <outDir>（P103，Bruce 2026-10-05 選 A）。
//
// 為什麼：wfg.html 原始 2.87MB／gzip 909KB，其中約六成是註解；網路到 GitHub Pages 變慢時，
// 從首頁進 WFG 要轉將近一分鐘。去掉註解後下載量大減，畫面與功能不變。
//
// 用法：node tools/build/strip-comments.mjs <repoRoot> <outDir>
//   - 複製 repoRoot 裡所有 git 追蹤的檔案到 outDir（跟以前「整個 repo 直接發佈」的檔案集合相同）。
//   - 只處理會被瀏覽器載入的檔：根目錄 *.html、common/**/*.js|css、data/**/*.js。其餘原樣複製。
//   - 產出 outDir/_build/report.json（每個檔的大小、刪了幾段註解、行號位移表）。
//
// 怎麼刪（用解析器，不用正規式猜）：
//   HTML：parse5（符合 HTML 規格的解析器）找出註解節點、<script>、<style> 的確切位置。
//   JS  ：acorn 完整解析，onComment 回報每段註解的確切範圍（字串、正規式、樣板字串內的 // /* 不會被誤判）。
//   CSS ：postcss 解析，取註解節點的位置。
//   保留：/*! … */、@license、@preserve、sourceMappingURL/sourceURL、HTML 條件註解 <!--[if …]> <![endif]-->。
//   不碰：type 不是 JS 的 <script>（JSON、樣板）、行內 on* 事件屬性與 style 屬性、非 JS/CSS/HTML 檔。
//
// 行號：刪掉的註解若跨行，就換成同樣數量的換行，所以「線上行號＝原始碼行號」。
//   例外只有「夾在兩個非空白字元中間的跨行 HTML 註解」與 <pre> 內的 HTML 註解（換行會改變畫面，只能整段刪）；
//   這些位移逐筆記在 report.json 的 lineShifts，tools/build/map-line.mjs 可換算。
//
// 自我驗證（任何一項失敗 → exit 1，不產生可發佈的輸出）：
//   JS ：去註解前後用 acorn 斷詞，逐個 token（種類、值、前面有沒有換行＝ASI 依據）必須完全相同。
//   CSS：去註解前後用 postcss 斷詞，去掉空白與註解後的 token 序列必須完全相同。
//   HTML：去註解前後用 parse5 解析，去掉註解節點後的元素樹（標籤、屬性、文字；文字只容許空白差異）必須相同。
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import * as acorn from 'acorn';
import { parse as parseHtml } from 'parse5';
import postcss from 'postcss';
import tokenizer from 'postcss/lib/tokenize';

const [, , srcArg, outArg] = process.argv;
if (!srcArg || !outArg) { console.error('usage: strip-comments.mjs <repoRoot> <outDir>'); process.exit(2); }
const SRC = resolve(srcArg), OUT = resolve(outArg);

const JS_TYPES = new Set(['', 'text/javascript', 'application/javascript', 'module', 'text/ecmascript', 'application/ecmascript', 'application/x-javascript', 'text/x-javascript', 'text/jscript', 'text/livescript', 'text/javascript1.5']);
const keepJsComment = t => /^\s*!/.test(t) || /@license|@preserve|@cc_on|[#@]\s*source(Mapping)?URL=/.test(t);
const keepHtmlComment = t => /^\[if\b|^\s*\[endif\]|^<!\[endif\]|^\s*!|@license/i.test(t);
const PRE_TAGS = new Set(['pre', 'listing', 'plaintext', 'textarea', 'xmp']);
const NL_RE = /\r\n|\n|\r|\u2028|\u2029/g;
const isHWs = c => c === ' ' || c === '\t';
const isWs = c => c === undefined || /\s/.test(c);

const errors = [];
const fail = (file, msg) => errors.push(`${file}: ${msg}`);

// ── 共用：依範圍刪除。r = {start, end, keepNewlines, trimBefore}
function applyRemovals(code, ranges) {
  ranges.sort((a, b) => a.start - b.start);
  let out = '', pos = 0; const shifts = [];
  let line = 1; // 原始碼行號（到 pos 為止）
  const countNl = s => (s.match(NL_RE) || []).length;
  for (const r of ranges) {
    if (r.start < pos) continue; // 重疊（理論上不會）—— 保守跳過
    let start = r.start;
    const seg = code.slice(pos, start);
    let keep = seg;
    if (r.trimBefore) {
      // 註解前面同一行只有水平空白（或註解是行尾的 // 註解）→ 把那段空白一起去掉
      let k = keep.length; while (k > 0 && isHWs(keep[k - 1])) k--;
      const atLineStart = k === 0 ? (out.length === 0 || /[\n\r\u2028\u2029]$/.test(out)) : /[\n\r\u2028\u2029]/.test(keep[k - 1]);
      if (r.trimBefore === 'always' || atLineStart) keep = keep.slice(0, k);
    }
    out += keep; line += countNl(seg);
    const body = code.slice(r.start, r.end);
    const nl = body.match(NL_RE) || [];
    let rep = r.keepNewlines ? nl.join('') : '';
    if (!rep && r.spaceIfNeeded && !isWs(out[out.length - 1]) && !isWs(code[r.end])) rep = ' ';
    out += rep;
    if (nl.length && !r.keepNewlines) shifts.push({ line: line + nl.length, delta: -nl.length });
    line += nl.length; pos = r.end;
  }
  out += code.slice(pos);
  return { out, shifts };
}

// ── JS
function jsComments(code, file) {
  const attempts = [{ sourceType: 'script' }, { sourceType: 'module' }];
  let lastErr;
  for (const a of attempts) {
    const comments = [];
    try {
      acorn.parse(code, { ecmaVersion: 'latest', sourceType: a.sourceType, allowHashBang: true, allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true, locations: false,
        onComment: (block, text, start, end) => comments.push({ block, text, start, end }) });
      return { comments, sourceType: a.sourceType };
    } catch (e) { lastErr = e; }
  }
  return { error: lastErr };
}
function jsTokens(code, sourceType) {
  const toks = []; let prevEnd = 0;
  for (const t of acorn.tokenizer(code, { ecmaVersion: 'latest', sourceType, allowHashBang: true, allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true })) {
    const gap = code.slice(prevEnd, t.start);
    toks.push(`${t.type.label}\u0001${t.value === undefined ? '' : String(t.value)}\u0001${/[\n\r\u2028\u2029]/.test(gap) ? 'NL' : ''}`);
    prevEnd = t.end;
  }
  return toks;
}
// 回傳 {out, ranges(相對 code), removed, skipped}
function stripJs(code, file) {
  const r = jsComments(code, file);
  if (r.error) return { out: code, ranges: [], removed: 0, skipped: `JS 解析失敗，原樣保留：${r.error.message}` };
  const ranges = r.comments.filter(c => !keepJsComment(c.text)).map(c => ({
    start: c.start, end: c.end, keepNewlines: true, spaceIfNeeded: true, trimBefore: c.block ? 'lineStart' : 'always' }));
  if (!ranges.length) return { out: code, ranges: [], removed: 0 };
  const { out } = applyRemovals(code, ranges.map(x => ({ ...x })));
  // 驗證：token 序列完全相同（含「前面有沒有換行」）
  const a = jsTokens(code, r.sourceType), b = jsTokens(out, r.sourceType);
  if (a.length !== b.length || a.some((t, i) => t !== b[i])) {
    const i = a.findIndex((t, k) => t !== b[k]);
    fail(file, `JS 去註解後 token 不一致（第 ${i} 個：${JSON.stringify(a[i])} vs ${JSON.stringify(b[i])}）`);
  }
  return { out, ranges, removed: ranges.length };
}

// ── CSS
// CSS 的註解不等於空白（div/**/.x ≠ div .x），所以比對時「有沒有空白」也要一致：
// 連續空白（中間夾的註解先拿掉）壓成一個 S。
function cssTokens(code) {
  const tk = tokenizer({ css: code }); const out = [];
  while (!tk.endOfFile()) {
    const t = tk.nextToken();
    if (t[0] === 'comment') continue;
    if (t[0] === 'space') { if (out[out.length - 1] !== 'S') out.push('S'); continue; }
    out.push(t[0] + '\u0001' + t[1]);
  }
  return out;
}
function stripCss(code, file) {
  try { postcss.parse(code); } catch (e) { return { out: code, ranges: [], removed: 0, skipped: `CSS 解析失敗，原樣保留：${e.message}` }; }
  // 位置由 postcss 的 tokenizer 給（它認得字串、url(…)，宣告值裡的註解也抓得到）
  const ranges = [];
  const tk = tokenizer({ css: code });
  while (!tk.endOfFile()) {
    const t = tk.nextToken();
    if (t[0] !== 'comment') continue;
    const s = t[2], e = t[3] + 1;
    if (code.slice(s, e) !== t[1]) { fail(file, `CSS tokenizer 位置對不上（offset ${s}）`); continue; }
    if (/^\/\*\s*!/.test(t[1]) || /@license|@preserve|sourceMappingURL/.test(t[1])) continue;
    // 跨行註解換成換行只在「至少一側本來就是空白」時才安全，否則整段刪（不插空白）
    const keepNl = isWs(code[s - 1]) || isWs(code[e]);
    ranges.push({ start: s, end: e, keepNewlines: keepNl, trimBefore: 'lineStart' });
  }
  if (!ranges.length) return { out: code, ranges: [], removed: 0 };
  const { out } = applyRemovals(code, ranges.map(x => ({ ...x })));
  const a = cssTokens(code), b = cssTokens(out);
  if (a.length !== b.length || a.some((t, i) => t !== b[i])) {
    const i = a.findIndex((t, k) => t !== b[k]);
    fail(file, `CSS 去註解後 token 不一致（第 ${i} 個：${a[i]} vs ${b[i]}）`);
  }
  return { out, ranges, removed: ranges.length };
}

// ── HTML
function walk(node, fn, ancestors = []) {
  fn(node, ancestors);
  const kids = node.childNodes || [];
  for (const k of kids) walk(k, fn, [...ancestors, node]);
  if (node.content) walk(node.content, fn, [...ancestors, node]);
}
function htmlShape(html) {
  // 去掉註解、把文字的空白壓成一個，序列化成可比對的字串
  const doc = parseHtml(html); const parts = [];
  walk(doc, (n, anc) => {
    if (n.nodeName === '#comment') return;
    if (n.nodeName === '#text') {
      const inScriptOrStyle = anc.length && ['script', 'style'].includes(anc[anc.length - 1].nodeName);
      if (inScriptOrStyle) return; // script/style 內容另有 token 驗證
      const inPre = anc.some(a => PRE_TAGS.has(a.nodeName));
      parts.push((inPre ? 'P:' : 'T:') + n.value); // <pre> 內逐字比對，其他地方只容許空白差異
      return;
    }
    if (n.tagName) parts.push('E:' + n.tagName + JSON.stringify((n.attrs || []).map(a => [a.name, a.value])));
  });
  // 相鄰文字合併（刪註解會讓兩段文字節點變一段）
  const merged = [];
  for (const p of parts) {
    const last = merged[merged.length - 1];
    if ((p.startsWith('T:') || p.startsWith('P:')) && last && last.slice(0, 2) === p.slice(0, 2)) merged[merged.length - 1] += p.slice(2);
    else merged.push(p);
  }
  return merged.map(p => p.startsWith('T:') ? p.replace(/\s+/g, ' ') : p).filter(p => p !== 'T: ' && p !== 'T:' && p !== 'P:');
}
function stripHtml(html, file) {
  const doc = parseHtml(html, { sourceCodeLocationInfo: true });
  const ranges = []; const notes = []; let removed = 0;
  walk(doc, (n, anc) => {
    const loc = n.sourceCodeLocation;
    if (n.nodeName === '#comment') {
      if (!loc || keepHtmlComment(n.data)) return;
      const inPre = anc.some(a => PRE_TAGS.has(a.nodeName));
      const prev = html[loc.startOffset - 1], next = html[loc.endOffset];
      // 換行可以保留的條件：不在 <pre> 裡，且註解至少一側本來就是空白（多加換行只是延長空白，不改畫面）
      const keepNl = !inPre && (isWs(prev) || isWs(next));
      ranges.push({ start: loc.startOffset, end: loc.endOffset, keepNewlines: keepNl, trimBefore: inPre ? false : 'lineStart' });
      removed++;
      return;
    }
    if ((n.nodeName === 'script' || n.nodeName === 'style') && loc && loc.startTag && loc.endTag) {
      const s = loc.startTag.endOffset, e = loc.endTag.startOffset;
      const content = html.slice(s, e);
      if (n.nodeName === 'script') {
        const type = ((n.attrs.find(a => a.name === 'type') || {}).value || '').trim().toLowerCase();
        if (!JS_TYPES.has(type) || n.attrs.some(a => a.name === 'src') && !content.trim()) return;
        const r = stripJs(content, `${file} <script>@${s}`);
        if (r.skipped) notes.push(`<script>@${s}: ${r.skipped}`);
        for (const x of r.ranges) ranges.push({ ...x, start: x.start + s, end: x.end + s });
        removed += r.removed;
      } else {
        const r = stripCss(content, `${file} <style>@${s}`);
        if (r.skipped) notes.push(`<style>@${s}: ${r.skipped}`);
        for (const x of r.ranges) ranges.push({ ...x, start: x.start + s, end: x.end + s });
        removed += r.removed;
      }
    }
  });
  const { out, shifts } = applyRemovals(html, ranges);
  const a = htmlShape(html), b = htmlShape(out);
  if (a.length !== b.length || a.some((t, i) => t !== b[i])) {
    const i = a.findIndex((t, k) => t !== b[k]);
    fail(file, `HTML 去註解後結構不一致（第 ${i} 項：${String(a[i]).slice(0, 120)} vs ${String(b[i]).slice(0, 120)}）`);
  }
  return { out, removed, shifts, notes };
}

// ── 主流程
const files = execFileSync('git', ['-C', SRC, 'ls-files', '-z'], { maxBuffer: 1 << 28 }).toString().split('\0').filter(Boolean);
if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const report = { builtAt: new Date().toISOString(), commit: (() => { try { return execFileSync('git', ['-C', SRC, 'rev-parse', 'HEAD']).toString().trim(); } catch { return null; } })(), files: {} };
let tb = 0, ta = 0;
for (const f of files) {
  const src = join(SRC, f), dst = join(OUT, f);
  if (!existsSync(src)) continue; // 已刪除但 index 還在
  mkdirSync(dirname(dst), { recursive: true });
  const isHtml = /^[^/]+\.html$/.test(f);
  const isJs = /^(common|data)\/.+\.js$/.test(f);
  const isCss = /^common\/.+\.css$/.test(f);
  if (!isHtml && !isJs && !isCss) { copyFileSync(src, dst); continue; }
  const code = readFileSync(src, 'utf8');
  let r;
  if (isHtml) r = stripHtml(code, f);
  else if (isJs) { const x = stripJs(code, f); r = { out: x.out, removed: x.removed, shifts: [], notes: x.skipped ? [x.skipped] : [] }; }
  else { const x = stripCss(code, f); r = { out: x.out, removed: x.removed, shifts: [], notes: x.skipped ? [x.skipped] : [] }; }
  // 行號：除了 shifts 記下的位移，行數必須相同
  const nlA = (code.match(NL_RE) || []).length, nlB = (r.out.match(NL_RE) || []).length;
  const shiftSum = r.shifts.reduce((s, x) => s + x.delta, 0);
  if (nlA + shiftSum !== nlB) fail(f, `行數對不上：原 ${nlA}、新 ${nlB}、記錄位移 ${shiftSum}`);
  writeFileSync(dst, r.out);
  const before = Buffer.byteLength(code), after = Buffer.byteLength(r.out);
  tb += before; ta += after;
  report.files[f] = { before, after, commentsRemoved: r.removed, lineShifts: r.shifts, notes: r.notes };
}
report.totals = { before: tb, after: ta };
mkdirSync(join(OUT, '_build'), { recursive: true });
writeFileSync(join(OUT, '_build', 'report.json'), JSON.stringify(report, null, 1));
const top = Object.entries(report.files).sort((a, b) => b[1].before - a[1].before).slice(0, 8);
for (const [f, x] of top) console.log(`${f}: ${x.before} → ${x.after} B（刪 ${x.commentsRemoved} 段註解${x.lineShifts.length ? `，行號位移 ${x.lineShifts.length} 處` : ''}）`);
console.log(`合計 ${tb} → ${ta} B`);
const allNotes = Object.entries(report.files).flatMap(([f, x]) => x.notes.map(n => `${f}: ${n}`));
if (allNotes.length) console.log('原樣保留的片段：\n  ' + allNotes.join('\n  '));
if (errors.length) { console.error('🛑 去註解自我驗證失敗：\n  ' + errors.join('\n  ')); process.exit(1); }
console.log('✓ 去註解自我驗證全過（JS/CSS token、HTML 結構、行數）');
