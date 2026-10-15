#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   check_datamap_sd_snapshot_selftest.js — 快照格式 2 的自我檢查（Bruce 10/15「快照結果不能再錯」）
   在暫存資料夾複製目前程式，拍一份小基準（SNAP_IDS 篩選的組合），再跑 4 種情況：
     A 原程式            ⇒ 必須 0 差異
     B 只改字級＋欄距＋格子大小（PIT、CW/CH、HFS、列頭字級）⇒ 必須 0 差異
     C 故意改接線：第 2 列接在 D1 的 TFT 改接到 D2 ⇒ 必須報錯，且指出「第 N 列、第 M 欄」
     D 故意改一個暫存器欄位（SNAP_MUT，例 c3+1）⇒ 必須報錯（暫存器／script，TFT 有變時也指出第 N 列、第 M 欄）
   用法：node tools/check_datamap_sd_snapshot_selftest.js [repo]
         ST_IDS＝組合篩選 regex（預設 EM01 的 Hand Single／Dual、sub 0、FORCE_DE 0、Mirror 0/1、CHRB 0）
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path'), fs = require('fs'), cp = require('child_process');
const REPO = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const IDS = process.env.ST_IDS || '^EM01\\|P0\\|H1\\|p[012]\\|sp0\\|de0/0\\|m[01]\\|c0$';
const MUT = process.env.ST_MUT || 'c3+1';
const SCRIPT = path.join(__dirname, 'check_datamap_sd_snapshot.js');
const TMP = fs.mkdtempSync('/tmp/dmsnap_selftest_'), BASE = path.join(TMP, 'base.json');
const copyTree = (name, patches) => {
  const d = path.join(TMP, name); fs.mkdirSync(d);
  fs.cpSync(path.join(REPO, 'common'), path.join(d, 'common'), { recursive: true });
  fs.symlinkSync(fs.realpathSync(path.join(REPO, 'node_modules')), path.join(d, 'node_modules'));
  let html = fs.readFileSync(path.join(REPO, 'datamap.html'), 'utf8');
  (patches || []).forEach(([a, b]) => { if (html.indexOf(a) < 0) throw new Error(name + '：找不到要改的程式片段 ' + a); html = html.split(a).join(b); });
  fs.writeFileSync(path.join(d, 'datamap.html'), html);
  return d;
};
const run = (root, extra, write) => {
  const env = Object.assign({}, process.env, { SNAP_FILE: BASE, SNAP_IDS: IDS, SNAP_DET: '2' }, extra || {});
  delete env.SNAP_ONLY;
  const r = cp.spawnSync('nice', ['-n', '15', process.execPath, SCRIPT, root].concat(write ? ['--write'] : []), { env, encoding: 'utf8', maxBuffer: 64 << 20 });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
};
let bad = 0;
const ok = (c, msg) => { console.log((c ? '✓ ' : '✗ ') + msg); if (!c) bad++; };
const show = (o, n) => o.split('\n').filter(Boolean).slice(0, n || 40).map(s => '    | ' + s).join('\n');
/* 原程式拍小基準 */
const orig = copyTree('orig');
const w = run(orig, { SNAP_BASE: 'selftest（目前程式）' }, true);
ok(w.code === 0 && fs.existsSync(BASE), '拍小基準（' + IDS + '）'); console.log(show(w.out, 4));
/* A 原程式 */
const a = run(orig);
ok(a.code === 0 && / 0 fail/.test(a.out), 'A 原程式 ⇒ 0 差異'); console.log(show(a.out, 4));
/* B 只改版面 */
const lay = copyTree('layout', [
  ['CW = 38, CH = 40', 'CW = 52, CH = 56'],
  ['PIT = Math.max(58, Math.ceil(labW + 16))', 'PIT = Math.max(96, Math.ceil(labW + 40))'],
  ['var HFS = 2 * (', 'var HFS = 3 * ('],
  ['var PV_HDR_FS = 24;', 'var PV_HDR_FS = 36;'],
]);
const b = run(lay);
ok(b.code === 0 && / 0 fail/.test(b.out), 'B 只改字級（×1.5）、欄距（58→96）、格子大小（38×40→52×56）⇒ 0 差異'); console.log(show(b.out, 4));
/* C 改接線 */
const anchor = 'var G = []; for (var gp = 0; gp < nD; gp++) G.push(Gm[gp % n] + pSub * Math.floor(gp / n));';
const wir = copyTree('wiring', [[anchor, anchor + ' spec.forEach(function (w) { if (w.k === 1 && w.p === 0 && !w.off) w.p = 1; });   /* selftest：第 2 列接 D1 的 TFT 改接 D2 */']]);
const c = run(wir);
ok(c.code !== 0 && /第 2 列、第 -?\d+ 欄/.test(c.out) && /③ TFT 接線圖（逐格）/.test(c.out), 'C 第 2 列接 D1 的 TFT 改接到 D2 ⇒ 報錯並指出第 2 列、第 M 欄'); console.log(show(c.out, 30));
/* D 改暫存器 */
const dd = run(orig, { SNAP_MUT: MUT });
ok(dd.code !== 0 && /暫存器／script／CKS／表格名稱/.test(dd.out), 'D 故意改暫存器欄位 ' + MUT + ' ⇒ 報錯'); console.log(show(dd.out, 30));
console.log(bad ? '✗ 自我檢查 ' + bad + ' 項沒過' : '✓ 自我檢查 4 項全過（暫存資料夾 ' + TMP + '）');
process.exit(bad ? 1 : 0);
