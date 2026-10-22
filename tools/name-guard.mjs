/* ═══════════════════════════════════════════════════════════════════════════
   tools/name-guard.mjs — 對外網頁不可出現同事／客戶人名與信件出處（Bruce 2026-10-22）
   起因：Bruce 指出 nbdebug v1.0.0 的驗證標籤與說明寫了同事名字與信件出處，「這樣很不好吧」。
   名單是雜湊（tools/name-guard.json，由 tools/name_guard_gen.py 從 assistant_kb 通訊錄產生）：repo 公開，
   明文名單放進來本身就是外洩。比對：把文字切成候選片段（中文 2–4 字、英文 1–3 個字），雜湊後查表。
   另外擋三種「出處格式」：email、英文名＋日期（同事H 10/14、Ab Cd 2026-10-02）、英文字＋「信」（某某信）。
   輸出只印遮罩後的片段（CI log 是公開的）。
   用法：import { findNames } from './name-guard.mjs'; findNames(text) → [{ kind, at, masked }]
   ═══════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const G = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'name-guard.json'), 'utf8'));
const SALT = G.salt;
const CJK = new Set(G.cjk), EN_FULL = new Set(G.enFull), EN_ONE = new Set(G.enOne);
const h = s => createHash('sha256').update(SALT + s, 'utf8').digest('hex').slice(0, 20);

/* 出處格式（不靠名單）：email、英文名＋日期、英文字＋信 */
const PATTERNS = [
  ['email', /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z0-9.-]*[A-Za-z]{2,}/g],
  ['name+date', /\b[A-Z][a-z]{2,}(?:\s[A-Z][a-z]+)?\s(?:20\d\d-\d\d-\d\d|\d{1,2}\/\d{1,2})\b(?!\/)/g],
  ['name+信', /\b[A-Z][a-z]{2,}(?:\s[A-Z][a-z]+)?\s?(?:的)?信(?:件)?(?![號号息用心任賴箱])/g],
];
/* 出處格式的已知非人名（一律寫理由） */
const FMT_ALLOW = [
  /^Bruce\s/,   // 網站作者本人（頁尾 Designed by Bruce、需求出處），不是同事人名
  /^(?:Gamma|Frame|Line|Lane|Bank|Page|Step|Case|Port|Pixel|Type|Mode|Table|Ver|Rev|Version|Sheet|Row|Col|Slot|Group|Panel|Item|Test|Total|Data|Rate|Phase|Overlay|Layer|Channel|Bit|Byte)\s/,   // 「Gamma 2/2」之類是數值，不是人名＋日期
];
function mask(s) { return s.length <= 2 ? s[0] + '*' : s[0] + '*'.repeat(s.length - 2) + s[s.length - 1]; }

export function findNames(text) {
  const hits = [];
  /* 中文：每段連續漢字，取 2–4 字的所有子字串 */
  for (const m of text.matchAll(/[㐀-鿿]{2,}/g)) {
    const run = m[0];
    for (let i = 0; i < run.length; i++) for (let n = 2; n <= 4 && i + n <= run.length; n++) {
      const sub = run.slice(i, i + n);
      if (CJK.has(h(sub))) hits.push({ kind: 'name', at: m.index + i, masked: mask(sub) });
    }
  }
  /* 英文：字串切字（區分大小寫），單字／連續 2–3 字 */
  const toks = [...text.matchAll(/[A-Za-z][A-Za-z'\-]*/g)];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i][0];
    if (EN_ONE.has(h(t))) hits.push({ kind: 'name', at: toks[i].index, masked: mask(t) });
    for (let n = 2; n <= 3 && i + n <= toks.length; n++) {
      const seg = toks.slice(i, i + n);
      const gapOk = seg.every((x, k) => k === 0 || /^\s+$/.test(text.slice(seg[k - 1].index + seg[k - 1][0].length, x.index)));
      if (!gapOk) break;
      const s = seg.map(x => x[0]).join(' ');
      if (EN_FULL.has(h(s))) hits.push({ kind: 'name', at: toks[i].index, masked: mask(s) });
    }
  }
  for (const [kind, re] of PATTERNS) for (const m of text.matchAll(re)) {
    if (kind !== 'email' && FMT_ALLOW.some(a => a.test(m[0]))) continue;
    hits.push({ kind, at: m.index, masked: mask(m[0]) });
  }
  return hits;
}
export const NAME_GUARD_COUNTS = G.counts;
