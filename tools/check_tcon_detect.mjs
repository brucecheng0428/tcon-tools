#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   check_tcon_detect.mjs — 全站共用 T-CON 辨認（common/tcon-detect.js）的模擬 I2C 測試
   所有頁面（i2c、datamap、dg-selftest、nbdebug、外部 Flash）都呼叫同一支 TconDetect.detect，
   這裡測過＝每頁同一個結果。
   重點案例（Bruce 2026-10-22「I2C check TCON 明明是 EN01 的，卻會跑出 6138」）：
     舊流程 7C:98＝0 → 7D:007D 不在 E503 表（00–04）⇒ 直接判 DAZ613x，根本沒讀 EN01 的 ID（3E:207E）。
     EN01 的 7D:007D 讀到表外的值時就會變成「6138」。新流程：E501 表沒命中就先讀 3E:207E，10／11 ⇒ EN01。
   M-Bus→C-Bus：RCP2（WPF RomCodeProcessUI）RM81008 的 MbusToCbus＝slave 0x7E、1-byte offset 0xAB、寫 CD（ICDefine.cs:578–579），
   I2C 讀寫前都先送（RegisterModule.cs:36、AppViewModel.cs:1554／1681、DPStatusModule.cs:75…）；TconDetect.detect 一開始就送，這裡驗順序。
   v1.1（Bruce 2026-10-22「把所有 6138 的 T-CON check 方式都移掉」）：DAZ6138／6139 不再自動辨認；
   舊流程會判 DAZ613x 的讀值（7D:007D 不在 E503 表）現在一律「認不出」＋原始值，手選清單仍有 DAZ6138／6139。
   用法：node tools/check_tcon_detect.mjs
   ═══════════════════════════════════════════════════════════════════════════ */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const req = createRequire(import.meta.url);
const TD = req(join(dirname(fileURLToPath(import.meta.url)), '..', 'common', 'tcon-detect.js'));
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (c ? '' : '  ' + (d || ''))); };
/* 假 I2C：mem['7C:95']＝值；nack＝不回應的 slave；FF00＝{ slave: [3 byte] } */
function io(mem, nack = [], ff00 = {}) {
  const k = (s, a) => s.toString(16).toUpperCase() + ':' + a.toString(16).toUpperCase();
  const log = [];
  return {
    log,
    read: async (s, aw, a, n) => {
      log.push('R ' + k(s, a));
      if (nack.includes(s)) return null;
      if (a === 0xFF00 && n === 3) return ff00[s] || null;
      return [mem[k(s, a)] ?? 0];
    },
    write: async (s, aw, a, d) => { log.push('W ' + k(s, a)); return nack.includes(s) ? { ok: false, err: 'NACK' } : { ok: true }; }
  };
}
const C = [
  /* [名稱, mem, nack, ff00, 期望 family, 期望 name 片段] */
  ['EN01 A1：7C:98＝0、7D:007D＝0A（不在 E503 表；舊流程判 DAZ613x）', { '7C:95': 0x22, '7C:98': 0, '7D:7D': 0x0A, '3E:207E': 0x10 }, [], {}, 'EN01', 'EN01'],
  ['EN01 A2：7C:98＝0、7D:007D＝1F', { '7C:95': 0x22, '7C:98': 0, '7D:7D': 0x1F, '3E:207E': 0x11 }, [], {}, 'EN01', 'EN01'],
  ['EN01 A1：7D:007D＝03（與 E503 撞）', { '7C:95': 0x22, '7C:98': 0, '7D:7D': 0x03, '3E:207E': 0x10 }, [], {}, 'EN01', 'EN01'],
  ['EN01 A1：7C:98≠0、7C:95＝20（不在 E501 表）', { '7C:95': 0x20, '7C:98': 0x01, '3E:207E': 0x10 }, [0x7D], {}, 'EN01', 'EN01'],
  ['EN01 A2：7C、7D 都不回，只有 3E', { '3E:207E': 0x11 }, [0x7C, 0x7D], {}, 'EN01', 'EN01'],
  ['舊 6138 回應：7C:98＝0、7D:007D＝0A、3E:207E＝00 ⇒ 認不出（不再判 6138）', { '7C:95': 0x22, '7C:98': 0, '7D:7D': 0x0A, '3E:207E': 0x00 }, [], {}, null, 'null'],
  ['舊 6138 回應：7C:98＝0、7D:007D＝0A、3E 不回 ⇒ 認不出', { '7C:95': 0x22, '7C:98': 0, '7D:7D': 0x0A }, [0x3E], {}, null, 'null'],
  ['舊 6138 回應：7C:95＝00、7C:98＝00、7D:007D＝77（i2c 自測 ④ 的值）⇒ 認不出', { '7C:95': 0x00, '7C:98': 0, '7D:7D': 0x77, '3E:207E': 0xFF }, [], {}, null, 'null'],
  ['舊 6138 回應：7D:007D＝FF、3E:207E＝00 ⇒ 認不出', { '7C:95': 0x00, '7C:98': 0, '7D:7D': 0xFF, '3E:207E': 0x00 }, [], {}, null, 'null'],
  ['E503A2：7D:007D＝03、3E:207E＝20', { '7C:95': 0x22, '7C:98': 0, '7D:7D': 0x03, '3E:207E': 0x20 }, [], {}, 'E503', 'E503A2'],
  ['E503A1 T1：7D:007D＝00、3E:207E＝00', { '7C:98': 0, '7D:7D': 0x00, '3E:207E': 0x00 }, [], {}, 'E503', 'E503A1 T1'],
  ['E501A：7C:98≠0、7C:95＝00（不讀 3E）', { '7C:95': 0x00, '7C:98': 0x01 }, [], {}, 'E501A', 'E501A'],
  ['E501B2：7C:95＝41', { '7C:95': 0x41, '7C:98': 0x01, '7D:7F': 0x01 }, [], {}, 'E501B', 'E501B2'],
  ['DAZ6111：7C:95＝7E', { '7C:95': 0x7E, '7C:98': 0x01 }, [], {}, 'DAZ6111', 'DAZ6111'],
  ['EM01：7C／7D／3E 不回、0x68 讀 01 EF A1', {}, [0x7C, 0x7D, 0x3E], { 0x68: [0x01, 0xEF, 0xA1] }, 'EM01', 'EM01A1'],
];
for (const [nm, mem, nack, ff, fam, name] of C) {
  const x = io(mem, nack, ff);
  const r = await TD.detect(x, {});
  if (fam === null) ok(r.family === null && r.unknown && !/DAZ613/.test(String(r.name)) && !r.alts.includes('DAZ6138') && !r.alts.includes('DAZ6139') && r.alts.includes('EN01') && /7D:007D/.test(r.rawText), nm + ' ⇒ 認不出（清單有 EN01、沒有 DAZ6138／6139）', JSON.stringify({ family: r.family, name: r.name, raw: r.rawText }));
  else ok(r.family === fam && String(r.name).includes(name) && !(fam === 'EN01' && r.ambiguous), nm + ' ⇒ ' + fam, JSON.stringify({ family: r.family, name: r.name, amb: r.ambiguous, raw: r.rawText }));
  ok(x.log[0] === 'W 7E:AB', '  └ 先下 M-Bus→C-Bus（0x7E:0xAB←CD，同 RCP2 ICDefine.cs:578–579 MbusToCbus）再辨認', x.log.slice(0, 3).join(','));
  if (fam === 'E501A' || fam === 'E501B' || fam === 'DAZ6111') ok(!x.log.some(l => /^R 3E:207E/.test(l)), '  └ E501 系列不碰 3E:207E');
  if (fam === 'EM01') ok(x.log.filter(l => /^W 7E:AB/.test(l)).length === 1, '  └ EM01 只下一次 7E:AB←CD（7C 不回時不補下）', x.log.join(','));
}
/* 隨機 7C／7D／3E 讀值：任何組合都不可回 DAZ613x（全站已無 6138 自動辨認） */
{ let bad = 0, n = 0; for (let i = 0; i < 4096; i++) { const v = j => (i * 2654435761 >>> (j * 8)) & 0xFF;
    const r = await TD.detect(io({ '7C:95': v(0), '7C:98': v(1) & 1 ? 0 : v(1), '7D:7D': v(2), '3E:207E': v(3) }), {}); n++;
    if (r.family === 'DAZ613x' || /DAZ613/.test(String(r.name))) bad++; }
  ok(bad === 0, `隨機 ${n} 組 7C／7D／3E 讀值 ⇒ 0 組判成 DAZ613x`, 'bad=' + bad); }
const u = await TD.detect(io({}, [0x7C, 0x7D, 0x3E, 0x60, 0x61, 0x68, 0x69]), {});
ok(u.unknown && u.alts.includes('EN01') && !u.alts.some(a => /6138|6139/.test(a)), '全部不回 ⇒ 認不出、清單有 EN01、沒有 DAZ6138／6139');
ok(!TD.ALL_NAMES.some(a => /6138|6139/.test(a)), 'TconDetect.ALL_NAMES 沒有 DAZ6138／6139');
/* v1.3：DP AUX 的 DPCD 判法（原廠 IdentifyChipId：43C＝E5 03 且 7C:95 在 0x20–0x24 ⇒ E503，不分版本）；I2C 不傳 dpcd43C ⇒ 行為不變 */
{ const mem = { '7C:95': 0x24, '7C:98': 0x00, '3E:207E': 0x00 };
  const x = io(mem, [0x7D]); const r = await TD.detect(x, { mbus: false, icid: false, dpcd43C: async () => [0xE5, 0x03] });
  ok(r.family === 'E503' && r.name === 'E503' && !r.unknown && !r.alts && r.src === 'dpcd', 'AUX：7D 不回＋43C＝E5 03＋7C:95＝24 ⇒ E503（不分版本）', JSON.stringify({ f: r.family, n: r.name, raw: r.rawText }));
  ok(!x.log.some(l => /^W /.test(l)) && !x.log.some(l => /^R 7D/.test(l) && false), '  └ mbus:false 時一筆寫入都沒有', x.log.join(','));
  ok(/DPCD 43C = E5 03/.test(r.rawText), '  └ 原始值列出 DPCD 43C', r.rawText);
  const r2 = await TD.detect(io(mem, [0x7D]), { mbus: false, icid: false, dpcd43C: async () => [0xE5, 0x01] });
  ok(r2.unknown && r2.family === null, 'AUX：43C 不是 E5 03 ⇒ 認不出', JSON.stringify({ f: r2.family, n: r2.name }));
  const r3 = await TD.detect(io({ '7C:95': 0x30, '7C:98': 0x00, '3E:207E': 0x00 }, [0x7D]), { mbus: false, icid: false, dpcd43C: async () => [0xE5, 0x03] });
  ok(r3.unknown, 'AUX：7C:95＝30（不在 20–24）⇒ 認不出', JSON.stringify({ f: r3.family, n: r3.name }));
  const r4 = await TD.detect(io(mem, [0x7D]), { icid: false });
  ok(r4.unknown && !('DPCD:43C' in r4.raw), 'I2C（不傳 dpcd43C）⇒ 跟以前一樣認不出、不碰 43C', JSON.stringify({ f: r4.family, raw: r4.rawText }));
  const r5 = await TD.detect(io({ '7C:95': 0x22, '7C:98': 0x00, '3E:207E': 0x10 }, [0x7D]), { mbus: false, icid: false, dpcd43C: async () => [0xE5, 0x03] });
  ok(r5.family === 'EN01', 'AUX：3E:207E＝10 ⇒ 仍判 EN01（共用判斷優先，DPCD 判法只在認不出時才用）', JSON.stringify({ f: r5.family, n: r5.name }));
  const r6 = await TD.detect(io({ '7C:95': 0x22, '7C:98': 0x00 }, [0x7D, 0x3E]), { mbus: false, icid: false, dpcd43C: async () => [0xE5, 0x03] });
  ok(r6.unknown && r6.ambiguous && r6.alts.join() === 'E503,EN01', 'AUX：43C＝E5 03 但 3E:207E 讀不到 ⇒ 不猜，E503／EN01 給使用者選（EN01 的原廠條件相同）', JSON.stringify({ f: r6.family, n: r6.name, a: r6.alts }));
  ok(TD.e503ByDpcd([0xE5, 0x03], 0x20) && TD.e503ByDpcd([0xE5, 0x03], 0x24) && !TD.e503ByDpcd([0xE5, 0x03], 0x25) && !TD.e503ByDpcd([0xE5, 0x03], 0x1F) && !TD.e503ByDpcd(null, 0x20), 'e503ByDpcd 邊界 0x20／0x24');
}
console.log(`\n${fail ? '✗' : '✓'} check_tcon_detect：${pass} 通過、${fail} 失敗`);
process.exit(fail ? 1 : 0);
