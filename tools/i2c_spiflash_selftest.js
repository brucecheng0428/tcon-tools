#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   i2c_spiflash_selftest.js — common/i2c-spiflash.js 的序列測試（i2c v1.29.0；v1.30.0 加 EN01 寫入／Erase All）
   ───────────────────────────────────────────────────────────────────────────
   用假 I2C 後端錄下每一筆交易（寫／讀／等待），逐筆比對原廠原始碼的序列，
   每一段期望值旁邊寫原廠出處行號（代號見 common/i2c-spiflash.js 開頭）。
   另外每個家族各有一個「假裝置」：照同一套暫存器語意把 Flash 存在記憶體裡，
   用來驗讀、寫、抹除、讀回比對、重試、中止、收尾在資料上真的對得起來。

   🔴 這支驗不到真的 TCON 與 Flash —— 上機由 Bruce 驗（10/6）。它釘住的是：
      送出的位元組、順序、slave（7-bit）、offset 寬度，與原廠一致。

   後半段用 jsdom 載入真的 i2c.html，以同一批假裝置驗畫面（位址鎖定、確認窗、錯誤、中止、三語）。
   用法：node tools/i2c_spiflash_selftest.js     （jsdom 用 repo 根目錄的 node_modules，與 i2c_tool_selftest.js 相同）
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path');
const SF = require(path.join(__dirname, '..', 'common', 'i2c-spiflash.js'));

let total = 0, fails = 0;
function G(n) { console.log('\n── ' + n); }
function CHECK(c, n) { total++; if (!c) { fails++; console.log('   🔴 FAIL ' + n); } }
function EQ(g, w, n) { const a = JSON.stringify(g), b = JSON.stringify(w); CHECK(a === b, n + (a === b ? '' : '\n      got =' + a.slice(0, 900) + '\n      want=' + b.slice(0, 900))); }
const H = (v, w) => v.toString(16).toUpperCase().padStart(w || 2, '0');
const W = (s, aw, a, bytes) => 'W ' + H(s) + '/' + aw + ' ' + H(a, aw * 2) + ': ' + bytes.map(b => H(b)).join(' ');
const Rd = (s, aw, a, n) => 'R ' + H(s) + '/' + aw + ' ' + H(a, aw * 2) + ' x' + n;
const S = ms => 'S ' + ms;
const Z9 = [0, 0, 0, 0, 0, 0, 0, 0, 0];

/* ── 錄製後端：dev.read(slave, awid, addr, len) 回資料；dev.write(...) 更新裝置狀態 ── */
function recorder(dev, opt) {
  const log = [];
  opt = opt || {};
  return {
    log,
    io: {
      w: async (s, aw, a, b) => {
        log.push(W(s, aw, a, b));
        if (opt.failAt && log.length === opt.failAt) throw new Error('I2C NACK (模擬)');
        dev.write(s, aw, a, b.slice());
      },
      r: async (s, aw, a, n) => {
        log.push(Rd(s, aw, a, n));
        if (opt.failAt && log.length === opt.failAt) throw new Error('I2C NACK (模擬)');
        return dev.read(s, aw, a, n);
      },
      sleep: async ms => { log.push(S(ms)); }
    }
  };
}
function pattern(n, seed) { const a = []; let x = seed || 7; for (let i = 0; i < n; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; a.push((x >> 16) & 0xFF); } return a; }

/* ═══ 假 E501（PY 的暫存器語意）══════════════════════════════════════════════ */
function fakeE501(isA, o) {
  o = o || {};
  const mem = new Uint8Array(o.size || 0x40000).fill(0xFF);
  const r3e = {};
  let busy = o.busy || 0, mode = 0, pendingProg = null;
  const stats = { erase: [], prog: 0, flipOnce: o.flipOnce || 0 };
  const addrAt = base => ((r3e[base] << 16) | (r3e[base + 1] << 8) | r3e[base + 2]) >>> 0;
  return {
    mem, stats,
    write(s, aw, a, b) {
      if (s === 0x3E) {
        b.forEach((v, i) => { r3e[a + i] = v; });
        if (a === 0x00AD && b.length >= 2) mode = b[1];
        if (a === 0x00AE) mode = b[0];
        if (a === 0x00B5 && b[0] === 0x02) {          /* 抹除觸發 */
          const op = r3e[0xAE], ad = addrAt(0xAF), sz = op === 0xD8 ? 0x10000 : 0x1000;
          const st = ad - (ad % sz);
          stats.erase.push((op === 0xD8 ? 'D8@' : '20@') + H(st, 6));
          mem.fill(0xFF, st, st + sz);
        }
        if (a === 0x00B5 && b[0] === 0x10) pendingProg = addrAt(0xAF);
      }
      if (s === 0x64 && pendingProg !== null) {
        let d = b;
        if (stats.flipOnce > 0) { d = b.slice(); d[5] ^= 0x01; stats.flipOnce--; }
        d.forEach((v, i) => { mem[pendingProg + i] &= v; });
        pendingProg = null; stats.prog++;
      }
    },
    read(s, aw, a, n) {
      if (s === 0x7C && a === 0x95) return [isA ? 0x00 : (o.id95 !== undefined ? o.id95 : 0x41)];
      if (s === 0x7C && a === 0x98) return [o.v98 !== undefined ? o.v98 : 0x01];
      if (s === 0x7C && a === 0xD8) return [0x02];
      if (s === 0x7C && a === 0xBB) return [0x00, 0x00, 0x00];
      if (s === 0x7D && a === 0x0246) return [0xEF, 0x40, 0x16];
      if (s === 0x7C && a === 0xD0) {
        if (mode === 0x9F) return [0xEF, 0x40, 0x15].slice(0, n);
        if (mode === 0x05) { if (busy > 0) { busy--; return [0x03]; } return [0x00]; }
        const ad = addrAt(0xAF); return Array.from(mem.slice(ad, ad + n));
      }
      if (s === 0x64 && n === 4096) { const ad = addrAt(0xAF); return Array.from(mem.slice(ad, ad + n)); }
      return new Array(n).fill(0);
    }
  };
}

/* ═══ 假 EM01（BK_SPI＝0xFE00 的語意，spim.md；AHB 暫存區在 0x58）═══════════════ */
function fakeEM01(o) {
  o = o || {};
  const mem = new Uint8Array(0x80000).fill(0xFF);
  const ahb = new Uint8Array(0x2000);
  const reg = { 0xFF1F: 0x80, 0xFE4D: 0x04, 0xFE00: 0x00, 0xFFF1: 0x10 };
  let sr0 = o.sr0 !== undefined ? o.sr0 : 0x00, cmd = 0, flip = o.flipReads || 0, vflip = o.flipVerify || 0;
  const flashAddr = () => reg[0xFE11] | (reg[0xFE12] << 8) | (reg[0xFE13] << 16);
  const ahbAddr = () => (reg[0xFE0C] | (reg[0xFE0D] << 8)) & 0x1FFF;
  return {
    mem, reg,
    write(s, aw, a, b) {
      if (s === 0x58) { b.forEach((v, i) => { ahb[(a + i) & 0x1FFF] = v; }); return; }
      b.forEach((v, i) => { reg[a + i] = v; });
      if (a === 0xFE10 && b[0] === 0x08) { const ad = flashAddr() & ~0xFFF; mem.fill(0xFF, ad, ad + 0x1000); }
      if (a === 0xFE10 && b[0] === 0x80) { const fa = flashAddr(), aa = ahbAddr(); for (let i = 0; i < 256; i++) mem[fa + i] &= ahb[aa + i]; }
      if (a === 0xFE10 && b[0] === 0x04) {
        const fa = flashAddr(), aa = ahbAddr(), n = reg[0xFE23] | (reg[0xFE24] << 8);
        for (let i = 0; i < n; i++) ahb[aa + i] = mem[fa + i];
        if (flip > 0) { ahb[aa + 3] ^= (flip & 0xFF) || 1; flip--; }   /* 每次翻不同的值 ⇒ 連續兩次讀到的不同 */
        else if (vflip > 0) { ahb[aa + 9] ^= 0x01; vflip--; }
      }
      if (a === 0xFE10 && b[0] === 0x02) { reg[0xFE46] = 0xEF; reg[0xFE47] = 0x40; reg[0xFE48] = 0x16; }
      if (a === 0xFE02) cmd = b[0];
      if (a === 0xFE09 && b[0] === 0x20) sr0 = reg[0xFE4B];
    },
    read(s, aw, a, n) {
      if (s === 0x58) return Array.from(ahb.slice(a & 0x1FFF, (a & 0x1FFF) + n));
      if (a === 0xFE14) return [0x01];
      if (a === 0xFE28) return [0x00];
      if (a === 0xFE29) return [cmd === 0x05 ? sr0 : 0x00];
      const out = []; for (let i = 0; i < n; i++) out.push(reg[a + i] !== undefined ? reg[a + i] : 0); return out;
    }
  };
}

/* ═══ 假 EN01（ENP／ICD 的 0x0098–0x00A4 語意，規格 outputs/EN01_flash_write_seq_20261006.md）══════
   觸發都看「00A0 寫入的值＋當時 0099 的指令」：01＋06＝WREN、01＋C7＝整顆抹除、02＋20＝sector 抹除、
   08＋05/35/15＝讀狀態、10＋02＝準備寫頁（下一筆 0x64 寫進 Flash）、04＋03＝讀頁。
   Unlock／Lock：00A1←08 時把 00A4 寫進 0099 指定的 SR（01/31/11）。SR1 有 BP 位元（0x1C）時抹除無效
   （模擬保護；Lock 值 0x9C 有 BP 位元）。o.sr1 預設 0x9C（出廠已鎖），所以不 Unlock 就寫不進去。 */
function fakeEN01(o) {
  o = o || {};
  const mem = new Uint8Array(0x40000); for (let i = 0; i < mem.length; i++) mem[i] = (i * 7 + (i >> 8)) & 0xFF;
  const r = {};
  const sr = { 0x01: o.sr1 !== undefined ? o.sr1 : 0x9C, 0x31: 0x00, 0x11: 0x60 };
  let busy = 0, pend = null, flip = o.flipProg || 0;
  const stats = { erase: [], eraseAll: 0, prog: 0, wren: 0 };
  const addr = () => ((r[0x9A] << 16) | (r[0x9B] << 8) | r[0x9C]) >>> 0;
  const prot = () => (sr[0x01] & 0x1C) !== 0;
  return {
    mem, r, sr, stats,
    write(s, aw, a, b) {
      if (s === 0x3E) {
        b.forEach((v, i) => { r[a + i] = v; });
        const c = r[0x99];
        if (a === 0xA0 && b[0] === 0x01 && c === 0x06) stats.wren++;
        if (a === 0xA0 && b[0] === 0x01 && c === 0xC7) { stats.eraseAll++; if (!prot()) mem.fill(0xFF); busy = o.eraseAllBusy || 0; }
        if (a === 0xA0 && b[0] === 0x02 && c === 0x20) { const st = addr() & ~0xFFF; stats.erase.push(H(st, 6)); if (!prot()) mem.fill(0xFF, st, st + 0x1000); busy = o.eraseBusy || 0; }
        if (a === 0xA0 && b[0] === 0x10 && c === 0x02) pend = addr();
        if (a === 0xA1 && b[0] === 0x08 && !o.ignoreLock && sr[c] !== undefined) sr[c] = r[0xA4];
      }
      if (s === 0x64 && pend !== null) {
        let d = b; if (flip > 0) { d = b.slice(); d[5] ^= 0x01; flip--; }
        d.forEach((v, i) => { mem[pend + i] &= v; }); pend = null; stats.prog++;
      }
    },
    read(s, aw, a, n) {
      if (s === 0x3E && a === 0x207E) return [o.icVer !== undefined ? o.icVer : 0x01];
      if (s === 0x3E && a === 0x230B) { if (busy > 0) { busy--; return [0x03]; } return [0x00]; }
      if (s === 0x3E && a === 0x0001) return [0x01];
      if (s === 0x7C && a === 0xD0) return [({ 0x05: sr[0x01], 0x35: sr[0x31], 0x15: sr[0x11] })[r[0x99]] || 0];
      if (s === 0x64) { const ad = addr(); return Array.from(mem.slice(ad, ad + n)); }
      return new Array(n).fill(0);
    }
  };
}
/* EN01 header（ENHF:30–34、262–274）：每 16 B 一筆，MAP_ST_ADDR＝byte5<<8|byte6，byte8 bit0 EDID、bit1 MCU。 */
function en01Header(maps, flags) {
  const d = pattern(0x1000, 41);
  for (let i = 0; i < 22; i++) { d[i * 16 + 5] = 0x77; d[i * 16 + 6] = 0x77; d[i * 16 + 8] = 0x00; }
  maps.forEach((m, i) => { d[i * 16 + 5] = m >> 8; d[i * 16 + 6] = m & 0xFF; d[i * 16 + 8] = (flags && flags[i]) || 0; });
  return d;
}

(async function main() {
  const P = SF.PROFILES;

  /* ════════════════════════ E501B ════════════════════════ */
  G('E501B 確認 Flash（PY:33523–33576）');
  {
    const dv = fakeE501(false), rc = recorder(dv);
    const r = await P.E501B.detect(rc.io, {});
    EQ(rc.log, [
      Rd(0x7C, 1, 0x95, 1), Rd(0x7C, 1, 0x98, 1),                         /* PY:33507–33508 */
      W(0x7C, 1, 0x0F, [0x80]), S(10),                                     /* PY:33990–33993 */
      W(0x3E, 2, 0xAD, [0xE5]), W(0x3E, 2, 0xAE, [0x9F]), W(0x3E, 2, 0xB3, [0x20]), W(0x3E, 2, 0xB5, [0x08]),  /* PY:33532–33542 */
      Rd(0x7C, 1, 0xD8, 1), W(0x3E, 2, 0xB5, [0x00]),                      /* PY:33544–33547 */
      Rd(0x7D, 2, 0x0246, 3),                                              /* PY:33552 */
      Rd(0x7C, 1, 0xBB, 3)                                                 /* PY:33583 */
    ], '序列逐筆相同');
    EQ([r.flash.id, r.flash.name, r.flash.size, r.tconId], ['EF4016', 'Winbond W25Q32BV', 0x400000, 0x41], 'JEDEC → W25Q32BV 4 MB、tcon 0x41');
  }
  G('E501B 型號不符就擋（7C:95＝0x00 是 E501A）');
  {
    const dv = fakeE501(false, { id95: 0x00 }), rc = recorder(dv);
    let err = null; try { await P.E501B.read(rc.io, 0, 0x1000, {}); } catch (e) { err = e; }
    EQ(err && err.sfKey, 'i2c.sfErrE501Mismatch', '丟 E501 型號不符');
    CHECK(rc.log.every(l => l.startsWith('R ')), '擋下前只有讀，沒有任何寫入');
    const dv2 = fakeE501(false, { v98: 0x00 }), rc2 = recorder(dv2);
    err = null; try { await P.E501B.detect(rc2.io, {}); } catch (e) { err = e; }
    EQ(err && err.sfKey, 'i2c.sfErrNotE501', '7C:98＝0 ⇒ 不是 E501');
  }
  G('E501B 讀 8 KB（PY:5565 → 5640–5642；PY:34204–34223 每 4 KB）');
  {
    const dv = fakeE501(false); const src = pattern(0x40000, 3); dv.mem.set(src);
    const rc = recorder(dv);
    const res = await P.E501B.read(rc.io, 0x1000, 0x2000, {});
    const one = a => [W(0x3E, 2, 0xB6, [0x40]), W(0x3E, 2, 0xAD, [0xE5, 0x03, a >> 16, (a >> 8) & 0xFF, a & 0xFF, 0x00, 0xF0, 0xFF, 0x04]), Rd(0x64, 1, 0x00, 4096), W(0x3E, 2, 0xB6, [0x00])];
    EQ(rc.log, [Rd(0x7C, 1, 0x95, 1), Rd(0x7C, 1, 0x98, 1), W(0x7C, 1, 0x0F, [0x80]), S(10)]
      .concat(one(0x1000), one(0x2000), [W(0x3E, 2, 0xAD, Z9)]), '序列逐筆相同（含結束 3E 00AD←00×9，PY:34178–34179）');
    CHECK(res.ok && Buffer.from(res.bytes).equals(Buffer.from(src.slice(0x1000, 0x3000))), '資料與假 Flash 內容相同');
  }
  G('E501B 寫 1 個 sector（PY:32915–32931、34288–34340）');
  {
    const dv = fakeE501(false), rc = recorder(dv), data = pattern(0x1000, 9);
    const res = await P.E501B.write(rc.io, 0x3000, data, {});
    const wren = [W(0x3E, 2, 0xAD, [0xE5]), W(0x3E, 2, 0xAE, [0x06]), W(0x3E, 2, 0xB5, [0x00]), W(0x3E, 2, 0xB5, [0x01]), Rd(0x7C, 1, 0xD8, 1)];  /* PY:34037–34051 */
    const head = [Rd(0x7C, 1, 0x95, 1), Rd(0x7C, 1, 0x98, 1), W(0x7C, 1, 0x0F, [0x80]), S(10)]
      .concat(wren, [W(0x3E, 2, 0xAD, [0xE5, 0x20, 0x00, 0x30, 0x00]), W(0x3E, 2, 0xB5, [0x00]), W(0x3E, 2, 0xB5, [0x02]), S(100), Rd(0x7C, 1, 0xD8, 1)],  /* PY:34061–34072 */
              [W(0x3E, 2, 0xAD, [0xE5]), W(0x3E, 2, 0xAE, [0x05]), W(0x3E, 2, 0xB3, [0x00]), W(0x3E, 2, 0xB5, [0x00]), Rd(0x7C, 1, 0xD8, 1), W(0x3E, 2, 0xB5, [0x08]), Rd(0x7C, 1, 0xD0, 1)]);  /* PY:34105–34122 */
    let pages = [];
    for (let p = 0; p < 16; p++) {
      const a = 0x3000 + p * 256;
      pages = pages.concat(wren, [W(0x3E, 2, 0xAE, [0x02, 0x00, a >> 8, 0x00, 0x00, 0x00, 0xFF, 0x00, 0x80]), W(0x3E, 2, 0xB5, [0x10]), Rd(0x7C, 1, 0xD8, 1),  /* PY:34155–34161 */
        W(0x64, 1, 0x00, data.slice(p * 256, p * 256 + 256)), S(10), W(0x3E, 2, 0xB6, [0x00]), Rd(0x7C, 1, 0xD8, 1)]);  /* PY:34167–34172、34011–34012 */
    }
    const tail = [W(0x3E, 2, 0xB6, [0x40]), W(0x3E, 2, 0xAD, [0xE5, 0x03, 0x00, 0x30, 0x00, 0x00, 0xF0, 0xFF, 0x04]), Rd(0x64, 1, 0x00, 4096), W(0x3E, 2, 0xB6, [0x00]),
                  W(0x3E, 2, 0xAD, Z9)];
    EQ(rc.log, head.concat(pages, tail), '序列逐筆相同（抹除→RDSR→16 頁→整個 4 KB 讀回→結束）');
    CHECK(res.ok && Buffer.from(dv.mem.slice(0x3000, 0x4000)).equals(Buffer.from(data)), '假 Flash 內容＝寫入資料');
    EQ(dv.stats.erase, ['20@003000'], '只抹除 0x3000 一個 sector');
  }
  G('E501B 64 KB＋4 KB：D8 抹除＋餘數 20h 抹除位址要加起點（PY:32874–32910，修 PY:32896 漏加起點）');
  {
    const dv = fakeE501(false), rc = recorder(dv), data = pattern(0x11000, 4);
    const res = await P.E501B.write(rc.io, 0x10000, data, {});
    EQ(dv.stats.erase, ['D8@010000', '20@020000'], '抹除：0x10000 起 64 KB，接著 0x20000 起 4 KB（原廠 bug 會抹 0x10000）');
    CHECK(res.ok && Buffer.from(dv.mem.slice(0x10000, 0x21000)).equals(Buffer.from(data)), '68 KB 全部寫對');
    EQ(dv.stats.prog, 17 * 16, '共 272 頁');
  }
  G('E501B 讀回不符：不重抹除、重寫，第 3 次仍不符就停並送結束（PY:34299–34331）');
  {
    const dv = fakeE501(false, { flipOnce: 1 }), rc = recorder(dv), data = pattern(0x1000, 5);
    const logs = [];
    const res = await P.E501B.write(rc.io, 0, data, { log: (k, v) => logs.push(k) });
    /* 第 1 輪把 data[5] 的 bit0 翻成 1 寫進去（＝該寫 0 的位元沒寫到），第 2 輪重寫（不抹除）補成 0 ⇒ 成功 */
    CHECK((data[5] & 1) === 0, '前提：data[5] bit0＝0');
    CHECK(res.ok, '重寫一輪之後比對成功');
    EQ(dv.stats.prog, 32, '同一 sector 寫了 2 輪（16×2 頁）');
    EQ(dv.stats.erase.length, 1, '重寫前沒有重新抹除');
    CHECK(logs.includes('i2c.sfLogRetry'), 'log 有重試');
    const dv2 = fakeE501(false, { flipOnce: 99 }), rc2 = recorder(dv2);
    let err = null; try { await P.E501B.write(rc2.io, 0, data, {}); } catch (e) { err = e; }
    EQ(err && err.sfKey, 'i2c.sfErrVerify', '一直不符 ⇒ 丟讀回比對錯誤');
    EQ(rc2.log.filter(l => l.startsWith(W(0x64, 1, 0, []).slice(0, 11))).length, 48, '同一 sector 寫了 3 輪（16×3 頁）');
    EQ(dv2.stats.erase.length, 1, '重試不重新抹除（照原廠）');
    EQ(rc2.log[rc2.log.length - 1], W(0x3E, 2, 0xAD, Z9), '失敗也送結束 3E 00AD←00×9');
  }
  G('E501 RDSR 輪詢次數（PY:34102–34131）');
  {
    const dv = fakeE501(false, { busy: 3 }), rc = recorder(dv);
    await SF._E501.waitIdle(rc.io);
    EQ(rc.log.filter(l => l === Rd(0x7C, 1, 0xD0, 1)).length, 4, '忙 3 次、第 4 次讀到 0 就結束');
    const dv2 = fakeE501(false, { busy: 999 }), rc2 = recorder(dv2);
    let err = null; try { await SF._E501.waitIdle(rc2.io); } catch (e) { err = e; }
    EQ(err && err.sfKey, 'i2c.sfErrEraseBusy', '一直忙 ⇒ 逾時錯誤');
    EQ(rc2.log.filter(l => l === Rd(0x7C, 1, 0xD0, 1)).length, 21, '讀 21 次後判失敗（while_time > 20）');
  }
  G('E501B 中止：做完目前 4 KB 才停，一定送結束');
  {
    const dv = fakeE501(false), rc = recorder(dv), data = pattern(0x3000, 6);
    let n = 0;
    const res = await P.E501B.write(rc.io, 0, data, { progress: () => { n++; }, aborted: () => n >= 1 });
    CHECK(res.aborted && res.stopAt === 0x1000, '停在 0x001000');
    EQ(dv.stats.erase, ['20@000000'], '只動了第一個 sector');
    EQ(rc.log[rc.log.length - 1], W(0x3E, 2, 0xAD, Z9), '最後一筆是結束序列');
  }
  G('E501B I2C 出錯：照樣送結束');
  {
    const dv = fakeE501(false), rc = recorder(dv, { failAt: 30 });
    let err = null; try { await P.E501B.write(rc.io, 0, pattern(0x1000), {}); } catch (e) { err = e; }
    CHECK(!!err, '錯誤往上丟');
    EQ(rc.log[rc.log.length - 1], W(0x3E, 2, 0xAD, Z9), '出錯後最後一筆是結束序列');
  }

  /* ════════════════════════ E501A ════════════════════════ */
  G('E501A 確認 Flash：init 多兩步、JEDEC 從 7C:D0 讀（PY:33973–33988、33550）');
  {
    const dv = fakeE501(true), rc = recorder(dv);
    const r = await P.E501A.detect(rc.io, {});
    EQ(rc.log.slice(0, 8), [Rd(0x7C, 1, 0x95, 1), Rd(0x7C, 1, 0x98, 1), W(0x7C, 1, 0x0F, [0x80]), W(0x7C, 1, 0x08, [0xEE, 0xE0]), W(0x7C, 1, 0x08, [0xEF, 0x40]), W(0x3E, 2, 0xAD, [0xE5]), W(0x3E, 2, 0xB5, [0x00]), S(10)], 'init 序列');
    EQ(rc.log[rc.log.length - 2], Rd(0x7C, 1, 0xD0, 3), 'JEDEC 從 7C:D0 讀 3 byte');
    EQ(r.flash.id, 'EF4015', 'JEDEC EF4015');
  }
  G('E501A 讀 4 KB：read_start 一次＋512×（00AF 位址、00B5←04、7C:D0 讀 8）（PY:34430–34464）');
  {
    const dv = fakeE501(true); const src = pattern(0x40000, 8); dv.mem.set(src);
    const rc = recorder(dv);
    const res = await P.E501A.read(rc.io, 0x2000, 0x1000, {});
    const body = rc.log.slice(9, rc.log.length - 1);
    EQ(rc.log[8], W(0x3E, 2, 0xAD, [0xE5, 0x03]), 'read_start（PY:34229–34230）');
    EQ(body.slice(0, 3), [W(0x3E, 2, 0xAF, [0x00, 0x20, 0x00, 0x00, 0x70, 0x00, 0x00]), W(0x3E, 2, 0xB5, [0x04]), Rd(0x7C, 1, 0xD0, 8)], '第一筆 8 B（PY:34251–34255）');
    EQ(body.length, 512 * 3, '512 輪');
    EQ(body[body.length - 3], W(0x3E, 2, 0xAF, [0x00, 0x2F, 0xF8, 0x00, 0x70, 0x00, 0x00]), '最後一輪位址 0x002FF8');
    CHECK(Buffer.from(res.bytes).equals(Buffer.from(src.slice(0x2000, 0x3000))), '資料相同');
  }
  G('E501A 寫入讀回只比頭尾各 256 B（PY:34388、34265–34282）');
  {
    const dv = fakeE501(true), rc = recorder(dv), data = pattern(0x1000, 11);
    const res = await P.E501A.write(rc.io, 0, data, {});
    CHECK(res.ok, '寫入成功');
    const reads = rc.log.filter(l => l === Rd(0x7C, 1, 0xD0, 8)).length;
    EQ(reads, 64, '讀回 64×8 B（頭 256＋尾 256）');
    CHECK(rc.log.includes(W(0x3E, 2, 0xAF, [0x00, 0x0F, 0x00, 0x00, 0x70, 0x00, 0x00])), '尾段從 0x000F00 開始（offset+3840）');
    CHECK(Buffer.from(dv.mem.slice(0, 0x1000)).equals(Buffer.from(data)), '假 Flash 內容相同');
  }

  /* ════════════════════════ EM01 ════════════════════════ */
  const RW = (a, b) => W(0x68, 2, a, b), RR = (a, n) => Rd(0x68, 2, a, n || 1);
  const getInfo = pad => [RW(0xFF44, [pad]), RW(0xFE00, [0x20]), RW(0xFE10, [0x00]), RW(0xFE10, [0x02]), RW(0xFE10, [0x02]), RR(0xFE14), RR(0xFE46, 3)];  /* EMF:523、559–598 */
  const wpSeq = [RW(0xFE10, [0]), RW(0xFE02, [0x05]), RW(0xFE09, [0x08]), RR(0xFE29), RW(0xFE02, [0x35]), RW(0xFE09, [0x00]), RW(0xFE09, [0x08]), RR(0xFE29),
                 RW(0xFE02, [0x00]), RW(0xFE09, [0x00]), RW(0xFE4A, [0x10]), RW(0xFE4B, [0x02]), RW(0xFE4C, [0x02])];  /* EMF:762–817 */
  G('EM01 Get（EMS:1514–1550）：主 code');
  {
    const dv = fakeEM01(), rc = recorder(dv);
    const r = await P.EM01.detect(rc.io, { pad: 1 });
    EQ(rc.log, [RW(0xFF44, [0x01])].concat(getInfo(0x01), [RR(0xFFF1)], wpSeq), '序列逐筆相同（setPad → RDID → 型號 → 保護狀態）');
    EQ([r.flash.id, r.model, r.wp], ['EF4016', 'RM80203', 'wpOff'], 'ID／型號／未保護');
  }
  G('EM01 Demura（SSPI PAD）寫 0xFF44←02（EMF:514–523）');
  {
    const rc = recorder(fakeEM01());
    await P.EM01.detect(rc.io, { pad: 2 });
    EQ(rc.log[0], RW(0xFF44, [0x02]), '第一筆 FF44←02');
  }
  const sectorRead = (a, v) => [RW(0xFE0C, [0, 0, 0, 0]), RW(0xFE11, [a & 0xFF, (a >> 8) & 0xFF, a >> 16]), RW(0xFE23, [0x00, 0x10, 0x00]), RR(0xFE00), RW(0xFE00, [v]),
                                RW(0xFE10, [0x00]), RW(0xFE10, [0x04]), RR(0xFE14), Rd(0x58, 4, 0, 4096)];   /* EMF:255–326 */
  G('EM01 讀 4 KB（EMF:1369–1437、EMT:1149–1300）');
  {
    const dv = fakeEM01(); const src = pattern(0x80000, 2); dv.mem.set(src);
    const rc = recorder(dv);
    const res = await P.EM01.read(rc.io, 0x5000, 0x1000, { pad: 1 });
    EQ(rc.log, [RR(0x0980), RR(0xFF1F), RW(0xFF1F, [0x00]), RW(0xFF44, [0x01]), RR(0xFE4D), RW(0xFE4D, [0x00]), RR(0x0980)]   /* EMF:1386–1411 */
      .concat(sectorRead(0x5000, 0x20), sectorRead(0x5000, 0x20),                       /* EMT:1188–1189 讀兩次 */
              getInfo(0x01), [RR(0xFFF1)]), '序列逐筆相同（MCU OFF → PAD → word mode → 每 4 KB 讀兩次 → 讀完再讀一次 ID）');
    CHECK(Buffer.from(res.bytes).equals(Buffer.from(src.slice(0x5000, 0x6000))), '資料相同');
  }
  G('EM01 讀：兩次不同就重讀，第 5 次仍失敗中止（EMT:1180–1235）');
  {
    const dv = fakeEM01({ flipReads: 4 }); const rc = recorder(dv);
    const res = await P.EM01.read(rc.io, 0, 0x1000, {});
    CHECK(res.ok, '兩次不一致之後重讀成功');
    EQ(rc.log.filter(l => l === Rd(0x58, 4, 0, 4096)).length, 6, '共讀 6 次（3 輪×2）');
    const dv2 = fakeEM01({ flipReads: 99 }); const rc2 = recorder(dv2);
    let err = null; try { await P.EM01.read(rc2.io, 0, 0x1000, {}); } catch (e) { err = e; }
    EQ(err && err.sfKey, 'i2c.sfErrRead', '一直不一致 ⇒ 中止');
    EQ(rc2.log.filter(l => l === Rd(0x58, 4, 0, 4096)).length, 10, '5 輪×2 次後中止');
  }
  G('EM01 寫 1 個 sector，Flash 原本有保護（EMF:1937–2045、EMT:876–1133）');
  {
    const dv = fakeEM01({ sr0: 0x7C }), rc = recorder(dv), data = pattern(0x1000, 13);
    const pre = await P.EM01.writePre(rc.io, { pad: 1 });
    EQ(rc.log, getInfo(0x01).concat([RR(0xFFF1)], wpSeq), '寫前：Chip_Info ＋ 保護狀態（EMF:1978–1981）');
    EQ(pre.wp, 'wpOn', '讀到已保護');
    rc.log.length = 0;
    const res = await P.EM01.write(rc.io, 0x8000, data, { pad: 1, wp: pre.wp });
    const we = [RW(0xFE10, [0]), RW(0xFE4A, [0]), RW(0xFE02, [6]), RW(0xFE09, [0]), RW(0xFE09, [1]), RW(0xFE02, [0]), RW(0xFE09, [0]), RR(0xFE28)];  /* EMF:684–698 */
    const wpOff = we.concat([RW(0xFE4B, [0x00]), RW(0xFE4C, [0x00]), RW(0xFE4A, [0x02]), RW(0xFE09, [0x20]), RW(0xFE09, [0x00]), RR(0xFE28)]);   /* EMF:730–747 */
    const wpOn = we.concat([RW(0xFE4B, [0x7C]), RW(0xFE4C, [0x00]), RW(0xFE4A, [0x02]), RW(0xFE09, [0x00]), RW(0xFE09, [0x20]), RW(0xFE09, [0x00]), RR(0xFE28)]);  /* EMF:710–747 */
    let prog = [];
    for (let x = 0; x < 16; x++) { const a = 0x8000 + x * 256, h = x * 256; prog = prog.concat([RW(0xFE0C, [h & 0xFF, h >> 8, 0, 0]), RW(0xFE11, [a & 0xFF, (a >> 8) & 0xFF, a >> 16]), RW(0xFE10, [0x00]), RW(0xFE10, [0x80]), RR(0xFE14)]); }  /* EMF:194–232 */
    let ahb = []; for (let c = 0; c < 16; c++) ahb.push(W(0x58, 4, c * 256, data.slice(c * 256, c * 256 + 256)));
    EQ(rc.log, [RW(0xFF44, [0x01])].concat(wpOff, wpSeq,                                  /* EMT:909–915（解除後讀一次狀態，EMT:862） */
      [RR(0xFE4D), RW(0xFE4D, [0x00]), RR(0x0980), RW(0xFE00, [0x20]), RR(0xFF1F), RW(0xFF1F, [0x00])],   /* EMT:918–946 */
      [RW(0xFE11, [0x00, 0x80, 0x00]), RW(0xFE10, [0x00]), RW(0xFE10, [0x08]), RR(0xFE14)],   /* EMF:143–177 */
      ahb, [RW(0xFE26, [0x00, 0x01])], prog,                                              /* EMT:987–1004 */
      sectorRead(0x8000, 0x20),                                                           /* EMT:1027 */
      wpOn, wpSeq), '序列逐筆相同（解除保護 → 準備 → 抹除 → 暫存區 16×256 → 16 次 program → 讀回 → 開回保護）');
    CHECK(res.ok && Buffer.from(dv.mem.slice(0x8000, 0x9000)).equals(Buffer.from(data)), '假 Flash 內容相同');
    CHECK(rc.log.every(l => !l.startsWith('W 58') || l.split(' ').length - 3 <= 256), '每筆 0x58 寫入 ≤256 B');
  }
  G('EM01 讀回比對一直失敗：第 5 次中止，仍把保護開回去（EMT:1054–1059、1110–1114）');
  {
    const dv = fakeEM01({ flipVerify: 99 }), rc = recorder(dv);
    let err = null; try { await P.EM01.write(rc.io, 0, pattern(0x1000), { pad: 1, wp: 'wpOff' }); } catch (e) { err = e; }
    EQ(err && err.sfKey, 'i2c.sfErrVerify', '丟讀回比對錯誤');
    EQ(rc.log.filter(l => l === RW(0xFE10, [0x08])).length, 5, '同一 sector 抹除→寫→比對共 5 輪（每輪重新抹除）');
    CHECK(rc.log.includes(RW(0xFE4B, [0x7C])), '中止後仍送開保護（4B←7C）');
  }
  G('EM01 尾巴不足 4 KB 補 0x00（EMF:1737）／E501 要求 4096 的倍數（PY:32819）');
  {
    const p = SF.prepWrite(P.EM01, [1, 2, 3]);
    EQ([p.data.length, p.data[3], p.data[4095]], [4096, 0, 0], 'EM01 補到 4096、補 0x00');
    EQ(SF.prepWrite(P.E501B, [1, 2, 3]).err.k, 'i2c.sfErrFileLen', 'E501 不是 4096 倍數 ⇒ 擋');
  }

  /* ════════════════════════ EN01 ════════════════════════ */
  G('EN01：IC 版本 3E:0x207E（RCI:1397–1416）；v1.30.0 開放寫入與 Erase All');
  {
    const rc = recorder(fakeEN01());
    const r = await P.EN01.detect(rc.io);
    EQ(rc.log, [Rd(0x3E, 2, 0x207E, 1)], '只讀 207E');
    EQ(r.icVerTxt, 'A2', '0x01 ⇒ A2');
    EQ([P.EN01.canWrite, typeof P.EN01.write, typeof P.EN01.eraseAll], [true, 'function', 'function'], 'EN01 有寫入與 Erase All');
  }
  G('EN01 讀（RCIo:1059–1067、FMo:58–88；009A 當高位元組，CL:600–605）');
  {
    const dv = fakeEN01(), rc = recorder(dv);
    const res = await P.EN01.read(rc.io, 0x10000, 0x1000, {});
    const pg = a => { const hi = a >> 16, mid = (a >> 8) & 0xFF;
      return [W(0x3E, 2, 0x9A, [hi]), W(0x3E, 2, 0x9B, [mid]), W(0x3E, 2, 0x9C, [0]), W(0x3E, 2, 0x99, Z9), W(0x3E, 2, 0xA1, [0x40]), W(0x3E, 2, 0x99, [0x03]),
              W(0x3E, 2, 0x9A, [hi]), W(0x3E, 2, 0x9B, [mid]), W(0x3E, 2, 0x9C, [0]), W(0x3E, 2, 0x9E, [0x10]), W(0x3E, 2, 0x9F, [0x00]), W(0x3E, 2, 0xA0, [0x04]), W(0x3E, 2, 0xA0, [0x00]),
              Rd(0x64, 1, 0x00, 256)]; };
    let body = []; for (let i = 0; i < 16; i++) body = body.concat(pg(0x10000 + i * 256));
    EQ(rc.log, [W(0x3E, 2, 0x39, [0xC0]), W(0x3E, 2, 0x99, Z9), W(0x3E, 2, 0x99, Z9), W(0x3E, 2, 0x98, [0xE5])].concat(body, [W(0x3E, 2, 0x99, Z9), W(0x3E, 2, 0x98, [0x00])]),
       '序列逐筆相同（0x10000 起：009A＝01、009B＝00…0F；結尾 0099←00×9、0098←00，ENP:38–41）');
    CHECK(Buffer.from(res.bytes).equals(Buffer.from(dv.mem.slice(0x10000, 0x11000))), '資料相同');
  }
  G('EN01 讀到一半 I2C 出錯／中止：一定送清控制 0099←00×9、0098←00');
  {
    const rc = recorder(fakeEN01(), { failAt: 40 });
    let err = null; try { await P.EN01.read(rc.io, 0, 0x2000, {}); } catch (e) { err = e; }
    CHECK(!!err, '錯誤往上丟');
    EQ(rc.log.slice(-2), [W(0x3E, 2, 0x99, Z9), W(0x3E, 2, 0x98, [0x00])], '最後兩筆是清控制');
    const rc2 = recorder(fakeEN01()); let n = 0;
    const r2 = await P.EN01.read(rc2.io, 0, 0x3000, { progress: () => n++, aborted: () => n >= 1 });
    CHECK(r2.aborted && r2.stopAt === 0x1000, '中止停在 0x1000');
    EQ(rc2.log.slice(-2), [W(0x3E, 2, 0x99, Z9), W(0x3E, 2, 0x98, [0x00])], '中止後送清控制');
  }

  /* ── EN01 寫入／抹除：期望序列照規格逐筆手寫（不呼叫被測程式的任何 helper），每段附原廠行號 ── */
  const N3 = (reg, v) => W(0x3E, 2, reg, Array.isArray(v) ? v : [v]);
  const enLock = lock => {                                                  /* ICD:755–828 Unlock／680–753 Lock */
    let a = [W(0x7C, 1, 0x0F, [0x80]), W(0x7C, 1, 0x08, [0xEE]), W(0x7C, 1, 0x09, [0xE0]), W(0x7C, 1, 0x08, [0xEF]), W(0x7C, 1, 0x09, [0x40]),   /* ICD:760–764／685–689 */
             N3(0x98, 0xE5), N3(0x98, 0x00)];                                                                                                      /* :766–767／691–692 */
    for (let r = 0x99; r <= 0xA1; r++) a.push(N3(r, 0x00));                                                                                       /* :768–776／693–701 */
    [[0x01, lock ? 0x9C : 0x00, lock ? 53 : 73], [0x31, 0x00, lock ? 64 : 94], [0x11, 0x60, lock ? 69 : 84]].forEach(b => {                      /* :779–815／704–740 */
      a = a.concat([N3(0x98, 0xE5), N3(0x99, 0x06), N3(0xA0, 0x00), N3(0xA0, 0x01), N3(0x99, b[0]), N3(0x9F, 0x00), N3(0xA0, 0x00), N3(0xA0, 0x20),
                    N3(0xA4, b[1]), N3(0xA1, 0x00), N3(0xA1, 0x08), S(b[2])]);
    });
    for (let r = 0x98; r <= 0xA1; r++) a.push(N3(r, 0x00));                                                                                       /* :817–826／742–751 */
    return a;
  };
  const enPoll = nBusy => { let a = []; for (let i = 0; i <= nBusy; i++) {                                                                       /* ENP:57–88 */
    a = a.concat([N3(0x99, 0x05), N3(0x9E, 0x00), N3(0xA0, 0x08), N3(0xA0, 0x00), Rd(0x3E, 2, 0x230B, 1)]); if (i < nBusy) a.push(S(20)); } return a; };
  const enErase = (s, nBusy) => [N3(0x98, 0xE5), N3(0x99, 0x06), N3(0xA0, 0x01), N3(0xA0, 0x00), N3(0x99, 0x20),                               /* ENP:192–196 */
    N3(0x9A, (s >> 4) & 0xFF), N3(0x9B, (s << 4) & 0xFF), N3(0x9C, 0x00), N3(0xA0, 0x02), N3(0xA0, 0x00)].concat(enPoll(nBusy || 0));          /* :197–203 */
  const enWrite = (s, sd) => { let a = [];
    for (let k = 0; k * 256 < sd.length; k++) { const pg = s * 16 + k, c = sd.slice(k * 256, k * 256 + 256); while (c.length < 256) c.push(0);   /* ENP:233–235 補 0x00 */
      a = a.concat([N3(0x99, Z9), N3(0x99, 0x06), N3(0xA0, 0x01), N3(0xA0, 0x00), N3(0xA1, 0x80), N3(0x99, 0x02),                              /* ENP:250–255 */
                    N3(0x9A, pg >> 8), N3(0x9B, pg & 0xFF), N3(0x9C, 0x00), N3(0x9F, 0xFF), N3(0xA0, 0x10), N3(0xA0, 0x00), W(0x64, 1, 0x00, c)]); }  /* :256–265 */
    return a.concat([N3(0x99, Z9)]); };                                                                                                          /* :275 */
  const enRead = (s, n) => { let a = [];
    for (let k = 0; k * 256 < n; k++) { const pg = s * 16 + k;
      a = a.concat([N3(0x9A, pg >> 8), N3(0x9B, pg & 0xFF), N3(0x9C, 0x00), N3(0x99, Z9), N3(0xA1, 0x40), N3(0x99, 0x03),                     /* ENP:127–132 */
                    N3(0x9A, pg >> 8), N3(0x9B, pg & 0xFF), N3(0x9C, 0x00), N3(0x9E, 0x10), N3(0x9F, 0x00), N3(0xA0, 0x04), N3(0xA0, 0x00),       /* :133–139 */
                    Rd(0x64, 1, 0x00, Math.min(256, n - k * 256))]); }                                                                            /* :141–142 */
    return a.concat([N3(0x99, Z9)]); };                                                                                                          /* :151 */
  const enSector = (s, sd, nBusy) => enErase(s, nBusy).concat(enWrite(s, sd), [Rd(0x3E, 2, 0x0001, 1)], enRead(s, sd.length));                /* ENP:349–366 */
  const enTail = [].concat(enLock(true),                                                                                                         /* AVM:1782 */
    [N3(0x98, 0xE5), N3(0x99, 0x05), N3(0xA0, 0x08), N3(0xA0, 0x00), Rd(0x7C, 1, 0xD0, 1),                                                        /* ICD:638–641、672 */
     N3(0x99, 0x35), N3(0xA0, 0x08), N3(0xA0, 0x00), Rd(0x7C, 1, 0xD0, 1),                                                                        /* ICD:650–652 */
     N3(0x99, 0x15), N3(0xA0, 0x08), N3(0xA0, 0x00), Rd(0x7C, 1, 0xD0, 1),                                                                        /* ICD:661–663 */
     N3(0x98, 0x00)]);                                                                                                                           /* AVM:1808 */

  G('EN01 寫 0x1780 byte（1 個整 sector＋最後一頁不足 256 B）：逐筆照規格（AVM:1749–1813、ENP:299–398）');
  {
    const dv = fakeEN01(), rc = recorder(dv), data = pattern(0x1780, 17), logs = [];
    const res = await P.EN01.write(rc.io, 0, data, { log: (k, v, c) => logs.push([k, v, c]) });
    EQ(rc.log, [].concat(enLock(false),                                            /* AVM:1764 Unlock */
      [N3(0xA1, 0x00)],                                                            /* RCI:1468–1472 EraseInitial（非 A1 不送 0039） */
      enSector(0, data.slice(0, 0x1000)), enSector(1, data.slice(0x1000)),         /* 每 sector：抹除→寫→CV→讀回 */
      [N3(0x98, 0x00)],                                                            /* ENP:396 */
      enTail), '序列逐筆相同（Unlock → 00A1←00 → 2×[抹除＋輪詢 → 寫頁 → 3E:0001 → 讀回] → 0098←00 → Lock → 3 區狀態 → 0098←00）');
    CHECK(res.ok && Buffer.from(dv.mem.slice(0, 0x1780)).equals(Buffer.from(data)), '假 Flash 內容＝檔案');
    CHECK(dv.mem.slice(0x1780, 0x1800).every(v => v === 0x00) && dv.mem.slice(0x1800, 0x2000).every(v => v === 0xFF), '最後一頁尾巴補 0x00（ENP:233–235），之後保持抹除後的 FF');
    EQ(rc.log.filter(l => l === Rd(0x64, 1, 0, 128)).length, 1, '讀回最後一頁只讀實際 128 B（ENP:116、327）');
    EQ([dv.sr[0x01], dv.sr[0x31], dv.sr[0x11]], [0x9C, 0x00, 0x60], '結束後 SR1＝9C（已鎖，ICD:712）');
    EQ(res.protect, [0x9C, 0x00, 0x60], '回傳 3 區保護狀態');
    CHECK(logs.some(l => l[0] === 'i2c.sfLogEn01Cv' && l[1].v === '01'), 'Check Write Value 只記 log（ENP:354–358、FM:137）');
    CHECK(!logs.some(l => l[0] === 'i2c.sfLogEn01NotLocked'), 'Zone1＝9C ⇒ 沒有未鎖警告');
    CHECK(!rc.log.some(l => l.startsWith('S 1 ') || l === S(1)), '不送原廠給 UI 喘氣的 Task.Delay(1)（ENP:272）');
  }
  G('EN01 沒 Unlock 就抹不掉（假裝置模擬 SR1 保護）⇒ 驗證 Unlock 真的在抹除前送出');
  {
    const dv = fakeEN01(), rc = recorder(dv);
    await SF._EN.eraseSector(rc.io, 0);
    CHECK(dv.mem[0] !== 0xFF, '保護中（SR1＝9C）直接抹除 ⇒ 沒抹掉');
    await SF._EN.lockSeq(rc.io, false); await SF._EN.eraseSector(rc.io, 0);
    CHECK(dv.sr[0x01] === 0x00 && dv.mem[0] === 0xFF, 'Unlock 後（SR1＝00）抹得掉');
  }
  G('EN01 A1 排列判斷（ENH:214–233、ENHF:262–274；RCI:1389–1390、1459–1465）');
  {
    EQ(SF.en01IsA1(en01Header([0x0000, 0x1400, 0x1800])), true, 'Bank14_17（1400）在 Bank18_19（1800）前 ⇒ A1');
    EQ(SF.en01IsA1(en01Header([0x0000, 0x1800, 0x1400])), false, '1800 在前 ⇒ A2');
    EQ(SF.en01IsA1(en01Header([0x0000, 0x1400])), false, '少一個 ⇒ false（不猜）');
    EQ(SF.en01IsA1(en01Header([0x1400, 0x0000, 0x1800], [0x01])), false, '第 1 筆 EDID 位元＝1 ⇒ 不算 1400（EDID 優先，ENHF:266）');
    EQ(SF.en01IsA1(en01Header([0x1400, 0x0000, 0x1800], [0x02])), false, '第 1 筆 MCU 位元＝1 ⇒ 不算 1400（ENHF:267）');
    EQ(SF.en01IsA1(en01Header([0x0000, 0x1400, 0x1800]).slice(0, 0xFFF)), false, '不到 4096 B ⇒ false（ENH:35）');
    const h = en01Header([0x0000, 0x1400, 0x1800]); h[16 + 5] = 0x00; h[16 + 6] = 0x14;
    EQ(SF.en01IsA1(h), false, 'byte5/6 位元組順序反過來（0x0014）不算（MAP_ST_ADDR＝byte5<<8|byte6）');
    const dv = fakeEN01(), rc = recorder(dv), data = en01Header([0x0000, 0x1400, 0x1800]);
    const res = await P.EN01.write(rc.io, 0, data, {});
    const u = enLock(false).length;
    EQ(rc.log.slice(u, u + 2), [N3(0x39, 0xC0), N3(0xA1, 0x00)], 'A1 檔 ⇒ Unlock 之後先 0039←C0 再 00A1←00（AVM:1764→1768；RCI:1459–1472）');
    CHECK(res.ok && res.a1 === true, '寫入成功、回報 A1');
    const rc2 = recorder(fakeEN01());
    await P.EN01.write(rc2.io, 0x1000, data, {});
    CHECK(!rc2.log.includes(N3(0x39, 0xC0)), '起點不是 0（header 不在這段）⇒ 不送 0039');
  }
  G('EN01 讀回不符：整個 sector 重來（重新抹除），重試前等 100 ms（ENP:335–382、DM:122–134）');
  {
    const dv = fakeEN01({ flipProg: 1 }), rc = recorder(dv), data = pattern(0x1000, 19), logs = [];
    CHECK((data[5] & 1) === 0, '前提：data[5] bit0＝0（翻成 1 就寫不進去）');
    const res = await P.EN01.write(rc.io, 0, data, { log: k => logs.push(k) });
    CHECK(res.ok, '第 2 次成功');
    EQ(rc.log, [].concat(enLock(false), [N3(0xA1, 0x00)], enSector(0, data), [S(100)], enSector(0, data), [N3(0x98, 0x00)], enTail),
       '序列：第 1 次 → 等 100 ms → 整個 sector 再一次（抹除→寫→CV→讀回）→ 收尾');
    EQ(dv.stats.erase, ['000000', '000000'], '重試會重新抹除');
    CHECK(logs.includes('i2c.sfLogRetry'), 'log 有重試');
  }
  G('EN01 重試 3 次仍不符：0098←00（ENP:389）→ 停，後面 sector 不做 → Lock 收尾');
  {
    const dv = fakeEN01({ flipProg: 9999 }), rc = recorder(dv), data = pattern(0x2000, 19), logs = [];
    let err = null; try { await P.EN01.write(rc.io, 0, data, { log: (k, v) => logs.push([k, v]) }); } catch (e) { err = e; }
    EQ(err && err.sfKey, 'i2c.sfErrVerify', '丟讀回比對錯誤');
    EQ(err && err.stopAt, 0, 'stopAt＝0x000000');
    const s0 = data.slice(0, 0x1000);
    EQ(rc.log, [].concat(enLock(false), [N3(0xA1, 0x00)], enSector(0, s0), [S(100)], enSector(0, s0), [S(100)], enSector(0, s0), [S(100)], enSector(0, s0),
       [N3(0x98, 0x00)], enTail), '序列：同一 sector 共 4 次（retryCount=3，ENP:320）→ 0098←00 → Lock → 3 區 → 0098←00；第 2 個 sector 沒動');
    EQ(dv.stats.erase, ['000000', '000000', '000000', '000000'], '只抹 sector 0、4 次');
    CHECK(logs.some(l => l[0] === 'i2c.sfLogEn01Mis' && l[1].a === '000000' && l[1].b === '000FFF' && l[1].n === 16) &&
          logs.filter(l => l[0] === 'i2c.sfLogEn01MisAt').length === 8, 'log 列出 sector 起訖與差異筆數（16 頁各 1 byte），前 8 筆明細（FM:140–147）');
  }
  G('EN01 busy 輪詢：每 20 ms 一次，最多 21 次，逾時停並鎖回（ENP:57–88）');
  {
    const dv = fakeEN01({ eraseBusy: 3 }), rc = recorder(dv), data = pattern(0x1000, 2);
    const res = await P.EN01.write(rc.io, 0, data, {});
    CHECK(res.ok, '忙 3 次後完成');
    EQ(rc.log, [].concat(enLock(false), [N3(0xA1, 0x00)], enSector(0, data, 3), [N3(0x98, 0x00)], enTail), '序列：輪詢 4 輪、中間 3 次 S 20');
    const dv2 = fakeEN01({ eraseBusy: 99999 }), rc2 = recorder(dv2);
    let err = null; try { await P.EN01.write(rc2.io, 0, data, {}); } catch (e) { err = e; }
    EQ(err && err.sfKey, 'i2c.sfErrEraseBusy', '一直忙 ⇒ 逾時錯誤');
    EQ(rc2.log.filter(l => l === Rd(0x3E, 2, 0x230B, 1)).length, 21, '讀 230B 21 次（maxRetries=20，`retries++ > 20`）');
    EQ(rc2.log, [].concat(enLock(false), [N3(0xA1, 0x00)], enErase(0, 21).slice(0, -5), enTail),
       '逾時後：不讀 CV、不送 ENP:396 的 0098←00（例外跳出），直接 Lock → 3 區 → 0098←00');
  }
  G('EN01 中止：做完目前 sector 才停，不送 ENP:396，照樣 Lock 收尾');
  {
    const dv = fakeEN01(), rc = recorder(dv), data = pattern(0x3000, 6);
    let n = 0;
    const res = await P.EN01.write(rc.io, 0, data, { progress: () => { n++; }, aborted: () => n >= 1 });
    CHECK(res.aborted && res.stopAt === 0x1000, '停在 0x001000');
    EQ(rc.log, [].concat(enLock(false), [N3(0xA1, 0x00)], enSector(0, data.slice(0, 0x1000)), enTail), '序列：第 1 個 sector → 直接 Lock 收尾');
    EQ(dv.stats.erase, ['000000'], '只動了第 1 個 sector');
  }
  G('EN01 I2C 出錯：照樣送完 Lock、3 區狀態、0098←00（AVM:1780–1808）');
  {
    const u = enLock(false).length;
    for (const at of [3, u + 30]) {
      const rc = recorder(fakeEN01(), { failAt: at });
      let err = null; try { await P.EN01.write(rc.io, 0, pattern(0x1000), {}); } catch (e) { err = e; }
      CHECK(!!err && /NACK/.test(err.message), '第 ' + at + ' 筆出錯 ⇒ 錯誤往上丟');
      EQ(rc.log.slice(at), enTail, '第 ' + at + ' 筆出錯 ⇒ 後面就是完整的 Lock → 3 區 → 0098←00' + (at === 3 ? '（Unlock 送到一半也會 Lock）' : ''));
    }
    const rc3 = recorder(fakeEN01(), { failAt: u + 4 + enSector(0, pattern(0x1000)).length + 1 + 5 });   /* Lock 送到一半出錯 */
    let err3 = null; try { await P.EN01.write(rc3.io, 0, pattern(0x1000), {}); } catch (e) { err3 = e; }
    CHECK(!!err3, 'Lock 送一半出錯 ⇒ 仍回報錯誤');
    EQ(rc3.log[rc3.log.length - 1], N3(0x98, 0x00), '仍然送到最後的 0098←00');
  }
  G('EN01 Lock 後 Zone1 不是 9C ⇒ log 標紅警告（規格 §3.8 建議；原廠只顯示）');
  {
    const logs = [];
    const res = await P.EN01.write(recorder(fakeEN01({ sr1: 0x00, ignoreLock: true })).io, 0, pattern(0x1000), { log: (k, v, c) => logs.push([k, c]) });
    CHECK(res.ok, '寫入仍算成功（原廠不依保護狀態擋，AVM:1795–1802）');
    CHECK(logs.some(l => l[0] === 'i2c.sfLogEn01NotLocked' && l[1] === 'e'), 'log 有紅字警告');
  }
  G('EN01 起點 0x20000：sector／page 號照位址換算（ENP:189–198、256–257）');
  {
    const dv = fakeEN01(), rc = recorder(dv), data = pattern(0x1000, 23);
    const res = await P.EN01.write(rc.io, 0x20000, data, {});
    const u = enLock(false).length + 1;
    EQ(rc.log.slice(u, u + 10), enErase(0x20).slice(0, 10), '抹除 009A＝02、009B＝00');
    CHECK(rc.log.includes(N3(0x9A, 0x02)) && rc.log.includes(N3(0x9B, 0x0F)), '寫頁 page 0x200–0x20F');
    CHECK(res.ok && Buffer.from(dv.mem.slice(0x20000, 0x21000)).equals(Buffer.from(data)), '假 Flash 0x20000 起＝資料');
  }
  G('EN01 Erase All（DM:96–116 → FM:64–77 → ENP:162–181）');
  {
    const dv = fakeEN01({ sr1: 0x00, eraseAllBusy: 5 }), rc = recorder(dv);
    const res = await P.EN01.eraseAll(rc.io, {});
    EQ(rc.log, [N3(0xA1, 0x00), N3(0x98, 0xE5), N3(0x99, Z9), N3(0x99, 0x06), N3(0xA0, 0x01), N3(0xA0, 0x00),     /* ENP:166–171 */
                N3(0x99, Z9), N3(0x99, 0xC7), N3(0xA0, 0x01), N3(0xA0, 0x00)].concat(enPoll(5)),                  /* :172–178 */
       '序列逐筆相同（10 筆＋輪詢；前後沒有 Unlock／Lock／0098←00，照原廠）');
    CHECK(res.ok && dv.mem.every(v => v === 0xFF), '整顆變 FF');
    const dv2 = fakeEN01({ sr1: 0x00, eraseAllBusy: 99999 }), rc2 = recorder(dv2);
    let err = null; try { await P.EN01.eraseAll(rc2.io, {}); } catch (e) { err = e; }
    EQ(err && err.sfKey, 'i2c.sfErrEraseBusy', '一直忙 ⇒ 逾時');
    EQ(rc2.log.filter(l => l === Rd(0x3E, 2, 0x230B, 1)).length, 401, '讀 230B 401 次（maxRetries=400，DM:89–91）');
    const dv3 = fakeEN01({ sr1: 0x00, eraseAllBusy: 99999 }), rc3 = recorder(dv3); let k = 0;
    const r3 = await P.EN01.eraseAll(rc3.io, { aborted: () => ++k > 3 });
    CHECK(r3.aborted && rc3.log.filter(l => l === Rd(0x3E, 2, 0x230B, 1)).length === 3, '中止 ⇒ 停止輪詢（ENP:64）');
    const dv4 = fakeEN01(), rc4 = recorder(dv4);
    await P.EN01.eraseAll(rc4.io, {});
    CHECK(dv4.stats.eraseAll === 1 && dv4.mem[0] !== 0xFF, '原廠 Erase All 不先 Unlock：SR1 保護中抹不掉（假裝置模擬；確認窗有寫）');
  }
  G('EN01 prepWrite：不補到 4 KB（最後一頁才補 0x00，ENP:233–235）');
  {
    const p = SF.prepWrite(P.EN01, [1, 2, 3]);
    EQ([p.data.length, p.pagePad], [3, true], '3 byte ⇒ 不補、標 pagePad');
    EQ(SF.prepWrite(P.EN01, new Array(512).fill(1)).pagePad, false, '512 byte ⇒ 不用補');
  }

  /* ════════════════════════ 共用 ════════════════════════ */
  G('JEDEC 容量用容量碼 2^n（修正原廠表的 bit／byte 錯置）');
  EQ(SF.jedecInfo([0x85, 0x60, 0x10]).size, 0x10000, 'PUYA P25Q05U＝64 KB（PY:2590 寫 512K Bytes、EMH:150 寫 0x80000 都是錯的）');
  EQ(SF.jedecInfo([0xC8, 0x60, 0x13]).size, 0x80000, 'GD25LE40C＝512 KB');
  EQ(SF.jedecInfo([0xEF, 0x40, 0x14]).size, 0x100000, 'W25Q80BL＝1 MB（與兩張表相同）');
  EQ(SF.jedecInfo([0xFF, 0xFF, 0xFF]).blank, true, 'FF FF FF ⇒ 沒有 Flash');
  EQ(SF.jedecInfo([0x00, 0x00, 0x00]).blank, true, '00 00 00 ⇒ 沒有 Flash');
  G('範圍檢查');
  EQ(SF.checkRange(0x800, 0x1000, 0), { k: 'i2c.sfErrAlignStart' }, '起點沒對齊 4 KB');
  EQ(SF.checkRange(0, 0x1800, 0), { k: 'i2c.sfErrAlignLen' }, '長度不是 4 KB 倍數');
  EQ(SF.checkRange(0x3F000, 0x2000, 0x40000).k, 'i2c.sfErrOverCap', '超過容量');
  EQ(SF.checkRange(0, 0x40000, 0x40000), null, '整顆剛好');
  G('畫面列的 slave 都是 7-bit（≤0x7F）');
  Object.keys(P).forEach(k => CHECK(P[k].slaves.every(s => s[1] <= 0x7F), k + ' 的 slave 都 ≤0x7F'));
  EQ(P.E501B.slaves.map(s => s[1]), [0x3E, 0x7C, 0x64, 0x7D], 'E501B：3E／7C／64／7D');
  EQ(P.EM01.slaves.map(s => s[1]), [0x68, 0x58], 'EM01：68／58');
  EQ(P.EN01.slaves.map(s => s[1]), [0x3E, 0x64], 'EN01：3E／64');


  /* ════════════════════════ 畫面（jsdom ＋ 假連線工具）════════════════════════
     以真的 i2c.html 驅動：每一則送出的 WS 訊息（rawwrite／read）交給上面的假裝置，
     驗位址鎖定、按鈕開關、確認窗、讀寫結果、錯誤與中止時的收尾、三語。 */
  await uiTests();

  async function uiTests() {
    let JSDOM;
    try { JSDOM = require('jsdom').JSDOM; }
    catch (e) { console.log('\n🔴 缺 jsdom（repo 根目錄 npm install jsdom），畫面測試沒跑'); fails++; total++; return; }
    const fs = require('fs');
    const repo = path.join(__dirname, '..');
    let html = fs.readFileSync(path.join(repo, 'i2c.html'), 'utf8');
    html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
      const f = path.join(repo, src.split('?')[0]);
      return fs.existsSync(f) ? '<script>\n' + fs.readFileSync(f, 'utf8') + '\n</script>' : '<script></script>';
    });
    const pageErrors = [];
    let dev = null, sent = [], failWriteAt = 0, nackSlaves = [], downloads = [], wsFail = false;
    const dom = new JSDOM(html, {
      url: 'http://127.0.0.1:8899/i2c.html', runScripts: 'dangerously', pretendToBeVisual: true,
      beforeParse(win) {
        win.addEventListener('error', e => pageErrors.push(String(e.message || e.error)));
        win.URL.createObjectURL = () => 'blob:x'; win.URL.revokeObjectURL = () => {};
        /* v1.31.0：記下每一次「下載」（a[download].click），驗「讀出不自動存檔、另存新檔才存」 */
        win.HTMLAnchorElement.prototype.click = function () { if (this.download) downloads.push(this.download); };
        class MockWS {
          constructor() { if (wsFail) throw new Error('ws refused (test)'); this.readyState = 0; setTimeout(() => { this.readyState = 1; this.onopen && this.onopen(); }, 0); }
          send(txt) {
            const m = JSON.parse(txt); sent.push(m);
            let r = { ok: true };
            if (m.type === 'ping') r = { helper: '1.17.0', proto: 6, ok: true };
            else if (m.type === 'open') r = { ok: true, channels: 1 };
            else if (m.type === 'read' && nackSlaves.includes(m.slave)) r = { ok: false, err: 'nack', status: 4 };
            else if (m.type === 'read') r = { ok: true, data: dev ? dev.read(m.slave, m.awid, m.addr, m.len) : new Array(m.len).fill(0) };
            else if (m.type === 'rawwrite') {
              if (failWriteAt && sent.filter(x => x.type === 'rawwrite').length === failWriteAt) r = { ok: false, err: 'nack', status: 4 };
              else { if (dev) dev.write(m.slave, m.awid, m.addr, m.data); r = { ok: true, transferred: m.data.length }; }
            }
            setTimeout(() => this.onmessage && this.onmessage({ data: JSON.stringify(Object.assign({ id: m.id, type: 'result' }, r)) }), 0);
          }
          close() { this.readyState = 3; this.onclose && this.onclose(); }
        }
        win.WebSocket = MockWS;
      }
    });
    const win = dom.window, doc = win.document, $ = id => doc.getElementById(id);
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const until = async (f, ms) => { for (let i = 0; i < (ms || 3000) / 5; i++) { if (f()) return true; await sleep(5); } return false; };
    await sleep(400);
    const A = win.__i2ct, SFU = win.__i2ctSf;
    for (let i = 0; i < 100 && A.state().busy; i++) await sleep(10);
    await A.disconnect(); await sleep(10); await A.connect();
    for (let i = 0; i < 200 && A.state().busy; i++) await sleep(10);
    await sleep(30);
    const logText = () => $('log').textContent;
    const vis = el => { for (let e = el; e && e !== doc.body; e = e.parentElement) if (e.style && e.style.display === 'none') return false; return true; };
    const since = n => sent.slice(n).filter(m => m.type === 'read' || m.type === 'rawwrite');
    const asLine = m => m.type === 'read' ? Rd(m.slave, m.awid, m.addr, m.len) : W(m.slave, m.awid, m.addr, m.data);

    G('畫面：載入與模式切換');
    CHECK(pageErrors.length === 0, '載入沒有 JS 例外：' + pageErrors.join(' | '));
    CHECK(!!SFU && A.state().linked, '測試掛勾存在、已連線');
    EQ(Array.from(doc.querySelectorAll('#in-devtype option')).map(o => o.value), ['gen', 'ee', 'sf'], '裝置類型多了「外部 Flash」');
    CHECK(!vis($('sf-panel')), '一般模式看不到 Flash 面板');
    SFU.setMode(true);
    CHECK(vis($('sf-panel')), '選外部 Flash ⇒ 面板出現');
    CHECK(!vis($('in-slave')) && !vis($('in-awid')) && !vis($('in-len')) && !vis($('in-data')) && !vis($('btn-read')), 'slave／offset／byte 數／寫入資料／一般讀寫鈕都收起來');
    EQ($('in-devtype').value, 'sf', '選單停在外部 Flash（EEPROM 模式沒有把它改回一般）');
    CHECK($('sf-detect').disabled && $('sf-read').disabled && $('sf-write').disabled, '沒選型號前：讀 ID／讀出／寫入都停用');
    G('畫面：v1.33.0 讀取長度預設 0x40000（Bruce 2026-10-06）');
    EQ([$('sf-rd-len').value, $('sf-rd-len-dec').textContent], ['0x040000', '（256 KB, 262,144 Byte）'], '頁面載入：長度 0x040000（256 KB, 262,144 Byte）');

    G('畫面：E501B 位址自動帶入並鎖定（7-bit）');
    SFU.setModel('E501B');
    const cards = Array.from($('sf-slaves').children).map(d => d.textContent);
    EQ(cards.map(t => (t.match(/0x[0-9A-F]{2}/) || [''])[0]), ['0x3E', '0x7C', '0x64', '0x7D'], '四個 slave：3E／7C／64／7D');
    CHECK(cards.every(t => /7-bit/.test(t)), '每張都標 7-bit');
    CHECK(/7C\/7D/.test(cards[0]) && /C8\/C9/.test(cards[2]), '8-bit 只當說明顯示（0x3E ⇒ 7C/7D、0x64 ⇒ C8/C9）');
    EQ($('sf-slaves').querySelectorAll('input,select').length, 0, '位址卡沒有任何可編輯欄位');
    CHECK(!$('sf-detect').disabled && $('sf-read').disabled && $('sf-write').disabled, '選了型號：只開讀 ID');

    G('畫面：v1.31.0 沒按過 Check T-CON ⇒ 手選');
    CHECK(!SFU.state().ckModel && /還沒按 Check T-CON/.test($('sf-cknote').textContent) && /EN01 請手動選/.test($('sf-cknote').textContent),
          '型號來源那一行：還沒按 Check T-CON、EN01 手選：' + $('sf-cknote').textContent);
    EQ(SFU.state().src, 'manual', '這時的型號是手選');

    G('畫面：E501B 讀 ID → 讀出 8 KB → 進 Dump → 另存新檔 .bin');
    dev = fakeE501(false); const src = pattern(0x40000, 21); dev.mem.set(src);
    let n0 = sent.length;
    await SFU.detect();
    EQ(since(n0).map(asLine)[since(n0).length - 2], Rd(0x7D, 2, 0x0246, 3), '畫面送出的 JEDEC 讀取 7D:0246（7-bit、2-byte offset）');
    CHECK(/EF 40 16/.test($('sf-id').textContent) && /4 MB/.test($('sf-id').textContent), '顯示 JEDEC 與容量：' + $('sf-id').textContent);
    EQ([$('sf-rd-start').value, $('sf-rd-len').value], ['0x000000', '0x040000'], 'v1.33.0：4 MB Flash 讀 ID 後長度帶預設 0x040000（不再帶整顆 0x400000）');
    CHECK(!$('sf-rd-all').disabled, 'v1.33.0：「讀整顆」照舊可勾（整顆另由它讀）');
    CHECK(!$('sf-read').disabled && $('sf-write').disabled, '讀出開了；沒選檔前寫入仍停用');
    $('sf-rd-start').value = '0x001000'; $('sf-rd-len').value = '0x2000';
    n0 = sent.length;
    const dl0 = downloads.length;
    await SFU.read();
    const lines = since(n0).map(asLine);
    EQ(lines.slice(3, 7), [W(0x3E, 2, 0xB6, [0x40]), W(0x3E, 2, 0xAD, [0xE5, 0x03, 0, 0x10, 0, 0, 0xF0, 0xFF, 0x04]), Rd(0x64, 1, 0, 4096), W(0x3E, 2, 0xB6, [0])], '經 WS 送出的第一個 4 KB 序列與原廠相同（4096 一次讀完、不分段）');
    EQ(lines[lines.length - 1], W(0x3E, 2, 0xAD, Z9), '最後送結束');
    EQ(downloads.length, dl0, 'v1.31.0：讀出不自動存檔');
    const ds = SFU.dumpSet();
    CHECK(ds && ds.sf && ds.base === 0x1000 && Buffer.from(ds.bytes).equals(Buffer.from(src.slice(0x1000, 0x3000))), 'v1.31.0：讀出的內容進 16×16 Dump（＝Flash 0x1000 起 8 KB）');
    const dl = SFU.exportBuild('bin');
    CHECK(dl && Buffer.from(dl.data).equals(Buffer.from(src.slice(0x1000, 0x3000))), 'Dump 另存新檔的 bin＝Flash 內容');
    CHECK(dl && /^E501B_Flash_0x001000_0x002000_CKS_[0-9A-F]{6}\.bin$/.test(dl.name), '另存檔名保留型號、位址、長度、CKS：' + (dl && dl.name));
    CHECK(/^\s*\S/.test($('readbanner').textContent) && /Dump/.test($('readbanner').textContent), 'Dump 上方說明內容來自外部 Flash：' + $('readbanner').textContent);
    $('sf-rd-start').value = '0x000800';
    n0 = sent.length; await SFU.read();
    EQ(since(n0).length, 0, '起點沒對齊 4 KB ⇒ 一筆都不送');
    CHECK(/0x1000/.test($('sf-progtxt').textContent), '畫面說明原因：' + $('sf-progtxt').textContent);

    G('畫面：E501B 寫入 → 確認窗 → 取消／確定');
    const data = pattern(0x2000, 33);
    SFU.setFile('fw.bin', data);
    CHECK(!$('sf-write').disabled, '選檔後寫入開了');
    $('sf-wr-start').value = '0x004000';
    n0 = sent.length;
    let p = SFU.write(); await until(() => SFU.state().confirmOpen);
    CHECK(vis($('sf-confirm')), '確認窗出現');
    const cf = $('sf-cf-tbl').textContent;
    CHECK(/E501B/.test(cf) && /0x3E \/ 0x7C \/ 0x64 \/ 0x7D/.test(cf) && /0x004000 – 0x005FFF/.test(cf) && /fw\.bin/.test(cf) && /CKS 0x/.test(cf), '確認窗列出型號、位址、範圍、檔名＋CKS：' + cf);
    EQ(since(n0).filter(m => m.type === 'rawwrite').length, 0, '按確定之前沒有任何寫入');
    SFU.answer(false); await p;
    EQ(since(n0).filter(m => m.type === 'rawwrite').length, 0, '取消 ⇒ 沒有任何寫入');
    p = SFU.write(); await until(() => SFU.state().confirmOpen); SFU.answer(true); await p;
    CHECK(Buffer.from(dev.mem.slice(0x4000, 0x6000)).equals(Buffer.from(data)), '確定 ⇒ 假 Flash 0x4000 起＝檔案內容');
    EQ(dev.stats.erase.slice(-2), ['20@004000', '20@005000'], '只抹除 0x4000、0x5000 兩個 sector');
    CHECK(/重新上電/.test($('sf-progtxt').textContent), '寫完提示重新上電：' + $('sf-progtxt').textContent);

    G('畫面：寫到一半 I2C 出錯 ⇒ 停下並送結束');
    dev = fakeE501(false); await SFU.detect();
    n0 = sent.length; failWriteAt = sent.filter(x => x.type === 'rawwrite').length + 40;
    p = SFU.write(); await until(() => SFU.state().confirmOpen); SFU.answer(true); await p;
    failWriteAt = 0;
    const l2 = since(n0).map(asLine);
    EQ(l2[l2.length - 1], W(0x3E, 2, 0xAD, Z9), '出錯後最後一筆是結束序列');
    CHECK(/✕ I2C W/.test(logText()), 'log 有錯誤原因');
    CHECK(!SFU.state().running && !$('sf-read').disabled, '按鈕恢復可用');

    G('畫面：中止 ⇒ 做完目前 4 KB 才停');
    dev = fakeE501(false); await SFU.detect();
    SFU.setFile('big.bin', pattern(0x3000, 5)); $('sf-wr-start').value = '0x000000';
    p = SFU.write(); await until(() => SFU.state().confirmOpen); SFU.answer(true);
    await until(() => SFU.state().running); SFU.abort(); await p;
    EQ(dev.stats.erase, ['20@000000'], '只做了第一個 sector');
    CHECK(/0x001000/.test($('sf-progtxt').textContent), '畫面寫停在 0x001000：' + $('sf-progtxt').textContent);

    G('畫面：型號不符就擋');
    dev = fakeE501(true);          /* 實際是 E501A，畫面選 E501B */
    await SFU.detect();
    CHECK(/E501B/.test($('sf-id').textContent) && /0x00/.test($('sf-id').textContent), '顯示選的與讀到的不同：' + $('sf-id').textContent);
    CHECK($('sf-read').disabled && $('sf-write').disabled, '讀寫都停用');

    G('畫面：自動判斷（E501）');
    dev = fakeE501(true); await SFU.auto();
    EQ($('sf-model').value, 'E501A', '7C:95＝00 ⇒ E501A');

    G('畫面：EM01（主 code／Demura）');
    SFU.setModel('EM01');
    CHECK(vis($('sf-pad')), 'EM01 才出現「哪一顆 Flash」');
    EQ(Array.from($('sf-slaves').children).map(d => (d.textContent.match(/0x[0-9A-F]{2}/) || [''])[0]), ['0x68', '0x58'], 'EM01：0x68／0x58');
    CHECK(/offset 4 B/.test($('sf-slaves').children[1].textContent), '0x58 標 offset 4 B');
    dev = fakeEM01(); $('sf-pad').value = '2'; $('sf-pad').dispatchEvent(new win.Event('change'));
    n0 = sent.length; await SFU.detect();
    EQ(since(n0).map(asLine)[0], W(0x68, 2, 0xFF44, [0x02]), 'Demura ⇒ 第一筆 0xFF44←02');
    CHECK(/RM80203/.test($('sf-id').textContent) && /寫保護：關/.test($('sf-id').textContent), '顯示型號與寫保護狀態：' + $('sf-id').textContent);
    $('sf-rd-all').checked = true; $('sf-rd-all').dispatchEvent(new win.Event('change'));
    CHECK($('sf-rd-start').disabled, '勾整顆 ⇒ 起點長度停用');
    $('sf-rd-all').checked = false; $('sf-rd-all').dispatchEvent(new win.Event('change'));
    $('sf-rd-start').value = '0'; $('sf-rd-len').value = '0x1000';
    await SFU.read();
    CHECK(/^EM01_Demura_Flash_0x000000_0x001000_/.test(SFU.exportBuild('bin').name), 'Demura 讀出的另存檔名標 Demura：' + SFU.exportBuild('bin').name);
    SFU.setFile('em.bin', [1, 2, 3]); $('sf-wr-start').value = '0x010000';
    p = SFU.write(); await until(() => SFU.state().confirmOpen);
    CHECK(/補 0x00 到 4096/.test($('sf-cf-tbl').textContent) && /Demura/.test($('sf-cf-tbl').textContent), '確認窗寫明補 0x00 與 Demura');
    SFU.answer(true); await p;
    EQ([dev.mem[0x10000], dev.mem[0x10002], dev.mem[0x10003], dev.mem[0x10FFF]], [1, 3, 0, 0], 'EM01 寫入：資料＋補 0x00');

    CHECK(!vis($('sf-eraseall')), 'EM01 沒有「整顆抹除」鈕');

    G('畫面：EN01 讀取、寫入、整顆抹除（v1.30.0）');
    $('sf-rd-len').value = '0x2000';
    SFU.setModel('EN01');
    EQ($('sf-rd-len').value, '0x040000', 'v1.33.0：換型號 ⇒ 長度回預設 0x040000');
    EQ(Array.from($('sf-slaves').querySelectorAll('b')).map(b => b.textContent), ['0x3E', '0x64'], 'EN01：0x3E／0x64');
    CHECK(/待上機確認/.test($('sf-modelnote').textContent) && /現行序列/.test($('sf-modelnote').textContent), '畫面標「依原廠現行序列，待上機確認」');
    CHECK(/待上機確認/.test($('sf-wrnote').textContent) && /Lock/.test($('sf-wrnote').textContent), '寫入說明標「待上機確認」並寫明 Unlock／Lock');
    CHECK(!vis($('sf-auto')), 'EN01 不顯示自動判斷');
    CHECK(vis($('sf-eraseall')) && $('sf-eraseall').disabled, 'EN01 出現「整顆抹除」鈕，讀 IC 版本前停用');
    dev = fakeEN01(); await SFU.detect();
    CHECK(/A2/.test($('sf-id').textContent), '顯示 IC 版本 A2');
    CHECK(!$('sf-pick').disabled && !$('sf-eraseall').disabled, '讀到 IC 版本後：選檔、整顆抹除開了');
    $('sf-rd-start').value = '0'; $('sf-rd-len').value = '0x2000';
    await SFU.read();
    CHECK(Buffer.from(SFU.dumpSet().bytes).equals(Buffer.from(dev.mem.slice(0, 0x2000))), 'EN01 讀出內容正確（Dump）');
    const enData = en01Header([0x0000, 0x1400, 0x1800]).concat(pattern(0x80, 3));   /* A1 header＋0x80 ⇒ 0x1080 byte */
    SFU.setFile('en.bin', enData); $('sf-wr-start').value = '0x000000';
    CHECK(!$('sf-write').disabled, '選檔後寫入開了');
    n0 = sent.length;
    p = SFU.write(); await until(() => SFU.state().confirmOpen);
    const cfe = $('sf-cf-tbl').textContent;
    CHECK(/EN01/.test(cfe) && /0x000000 – 0x00107F/.test(cfe) && /2 × 4 KB/.test(cfe) && /A1（寫入前送 0039←C0）/.test(cfe) && /補 0x00（讀回只比檔案長度）/.test(cfe),
          '確認窗：範圍照實際長度、2 個 sector、A1、最後一頁補 0x00：' + cfe);
    CHECK(/尚未上機確認/.test($('sf-cf-warn').textContent) && /確認寫入/.test($('sf-cf-title').textContent) && /確定寫入/.test($('sf-cf-yes').textContent), '確認窗警告「尚未上機確認」，標題／按鈕是寫入');
    EQ(since(n0).filter(m => m.type === 'rawwrite').length, 0, '按確定之前沒有任何寫入');
    SFU.answer(true); await p;
    const lw = since(n0).map(asLine);
    EQ(lw.slice(0, 5), [W(0x7C, 1, 0x0F, [0x80]), W(0x7C, 1, 0x08, [0xEE]), W(0x7C, 1, 0x09, [0xE0]), W(0x7C, 1, 0x08, [0xEF]), W(0x7C, 1, 0x09, [0x40])], '經 WS 送出的第一段是 Unlock 前置（ICD:760–764）');
    CHECK(lw.includes(N3(0x39, 0xC0)), 'A1 檔 ⇒ 有送 0039←C0');
    EQ(lw.slice(-1), [N3(0x98, 0x00)], '最後一筆 0098←00（AVM:1808）');
    CHECK(Buffer.from(dev.mem.slice(0, enData.length)).equals(Buffer.from(enData)) && dev.sr[0x01] === 0x9C, '假 Flash＝檔案、結束後已鎖（SR1＝9C）');
    CHECK(/Zone1 0x9C/.test(logText()) && /重新上電/.test($('sf-progtxt').textContent), 'log 有 Lock 後保護狀態、提示重新上電');
    { const t = SFU.logText();
      CHECK(/Unlock（解除 Flash 保護）/.test(t) && /抹除 4 KB @0x000000/.test(t) && /寫入 0x000000–0x000FFF/.test(t) && /寫入 0x001000–0x00107F/.test(t)
            && /Check Write Value/.test(t) && /0x001000 寫入並比對 OK/.test(t) && /Lock（鎖回 Flash 保護）/.test(t) && /Zone1 0x9C/.test(t)
            && /完成：EN01 0x000000–0x00107F · 0x001080（4\.125 KB, 4,224 Byte） · CKS 0x[0-9A-F]{6}/.test(t),
            'v1.31.0 Flash 紀錄窗：解鎖 → 抹除 → 寫入範圍 → 比對 OK → 鎖回＋Zone1 → 完成摘要（byte、CKS）'); }
    G('畫面：EN01 整顆抹除 → 確認窗 → 取消／確定');
    dev.sr[0x01] = 0x00;                     /* 原廠 Erase All 不 Unlock；假裝置先解除保護才看得到抹除效果 */
    n0 = sent.length;
    p = SFU.eraseAll(); await until(() => SFU.state().confirmOpen);
    CHECK(/抹除整顆/.test($('sf-cf-title').textContent) && /確定抹除/.test($('sf-cf-yes').textContent) && /C7h/.test($('sf-cf-tbl').textContent)
          && /Unlock／Lock/.test($('sf-cf-warn').textContent) && /寫回 code/.test($('sf-cf-note').textContent), '確認窗換成抹除的標題、按鈕、動作與警告');
    SFU.answer(false); await p;
    EQ(since(n0).filter(m => m.type === 'rawwrite').length, 0, '取消 ⇒ 沒有任何寫入');
    p = SFU.eraseAll(); await until(() => SFU.state().confirmOpen); SFU.answer(true); await p;
    EQ(since(n0).map(asLine).slice(0, 10), [N3(0xA1, 0x00), N3(0x98, 0xE5), N3(0x99, Z9), N3(0x99, 0x06), N3(0xA0, 0x01), N3(0xA0, 0x00), N3(0x99, Z9), N3(0x99, 0xC7), N3(0xA0, 0x01), N3(0xA0, 0x00)], '經 WS 送出 ENP:166–175 的 10 筆');
    CHECK(dev.mem.every(v => v === 0xFF) && /整顆抹除完成/.test($('sf-progtxt').textContent), '假 Flash 全 FF、畫面顯示完成');
    p = SFU.write(); await until(() => SFU.state().confirmOpen);
    CHECK(/確認寫入/.test($('sf-cf-title').textContent) && /確定寫入/.test($('sf-cf-yes').textContent), '之後再按寫入，確認窗換回寫入的字');
    SFU.answer(false); await p;

    /* ════════ v1.31.0（Bruce 2026-10-06 上機回饋）════════ */
    const ck = () => $('sf-cknote');
    const slv = () => Array.from($('sf-slaves').querySelectorAll('b')).map(b => b.textContent);
    G('畫面：v1.31.0 型號跟 Check T-CON —— 有結果');
    SFU.setModel('EN01');                                   /* 先手選別的，看 Check T-CON 會不會蓋過去 */
    dev = fakeE501(false);                                  /* 7C:98＝01、7C:95＝41 ⇒ E501B2 */
    await A.checkTcon();
    EQ(A.ckResult() && A.ckResult().name, 'E501B2', 'Check T-CON 認出 E501B2');
    EQ($('sf-model').value, 'E501B', '型號自動帶入 E501B（蓋掉原本手選的 EN01）');
    EQ(SFU.state().src, 'ck', '型號來源記成 Check T-CON');
    EQ(slv(), ['0x3E', '0x7C', '0x64', '0x7D'], 'slave 位址一起帶入');
    EQ($('sf-slaves').querySelectorAll('input,select').length, 0, '位址仍鎖定、沒有可編輯欄位');
    CHECK(/依 Check T-CON 結果（E501B2）帶入/.test(ck().textContent) && /\bok\b/.test(ck().className), '畫面註明「依 Check T-CON 結果」（綠）：' + ck().textContent);
    CHECK(!vis($('sf-auto')), '有 Check T-CON 結果 ⇒ 不顯示「自動判斷」');
    CHECK(/Check T-CON 結果 E501B2 ⇒ 型號帶入 E501B/.test(SFU.logText()), 'Flash 紀錄寫明型號來源');
    CHECK(SFU.state().det === null && !$('sf-detect').disabled, '帶入後要重新讀 ID（讀 ID 鈕可按）');

    G('畫面：v1.31.0 型號跟 Check T-CON —— 手選和結果衝突');
    SFU.setModel('E501A');
    CHECK(/選的是 E501A，但 Check T-CON 結果是 E501B2（E501B）/.test(ck().textContent) && /\bbad\b/.test(ck().className), '手選與結果不同 ⇒ 紅字警告：' + ck().textContent);
    { const reds = Array.from($('sf-log').querySelectorAll('span.e')).map(s => s.textContent);
      CHECK(reds.some(t => /選的是 E501A/.test(t)), 'Flash 紀錄也有紅字警告'); }
    EQ(SFU.state().src, 'manual', '型號來源記成手選');
    SFU.setModel('E501B');
    CHECK(/\bok\b/.test(ck().className), '選回 E501B ⇒ 警告消失');

    G('畫面：v1.31.0 型號跟 Check T-CON —— 換板子再按');
    dev = fakeE501(true);                                   /* 7C:95＝00 ⇒ E501A */
    await A.checkTcon();
    EQ($('sf-model').value, 'E501A', '換成 E501A 的板子再按 ⇒ 型號跟著換');
    EQ(slv(), ['0x3E', '0x7C', '0x64'], '位址卡跟著換成 E501A 的三個');
    await SFU.detect();
    CHECK(!$('sf-read').disabled, 'E501A 讀 ID 後可讀出');

    G('畫面：v1.31.0 型號跟 Check T-CON —— 沒有可用的結果');
    dev = { read: (s, aw, a, n) => new Array(n).fill(0), write() {} };   /* 7C:98＝00、7D:007D＝00 ⇒ E503A1 T1 */
    await A.checkTcon();
    EQ(A.ckResult() && A.ckResult().name, 'E503A1 T1', 'Check T-CON 結果是 E503A1 T1');
    EQ($('sf-model').value, '', '原本依結果帶入的型號清空（不留上一塊板子的型號）');
    CHECK(/E503A1 T1 不是外部 Flash 支援的型號/.test(ck().textContent), '註明結果不支援、請手選：' + ck().textContent);
    CHECK(vis($('sf-auto')) && $('sf-detect').disabled, '回到手選：自動判斷出現、讀 ID 停用');
    SFU.setModel('EN01'); await A.checkTcon();
    EQ($('sf-model').value, 'EN01', '手選的型號不會被不支援的結果清掉（EN01 Check T-CON 認不出，只能手選）');
    dev = fakeEM01(); dev.reg[0xFF00] = 0x01; dev.reg[0xFF01] = 0xEF; dev.reg[0xFF02] = 0xA1;   /* ICID 01 EF A1 ＋ A 段 E503 ⇒ 兩段衝突 */
    await A.checkTcon();
    CHECK(A.ckResult() && A.ckResult().conflict && $('sf-model').value === 'EN01', '兩段結果衝突（E503／EM01A1）⇒ 不帶，維持手選');
    nackSlaves = [0x7C, 0x7D];                              /* A 段讀不到 ⇒ 只剩 ICID */
    await A.checkTcon(); nackSlaves = [];
    EQ([A.ckResult() && A.ckResult().name, $('sf-model').value], ['EM01A1', 'EM01'], 'ICID 01 EF A1 ⇒ EM01A1 ⇒ 型號帶入 EM01');
    EQ(slv(), ['0x68', '0x58'], 'EM01 位址帶入 0x68／0x58');
    await A.ckPick('VM01S1');
    EQ($('sf-model').value, '', 'Check T-CON 下拉改選 VM01S1（撞號的另一顆）⇒ 不再帶 EM01');
    nackSlaves = [0x7C, 0x7D]; await A.checkTcon(); nackSlaves = [];
    await A.disconnect(); await sleep(10);
    EQ([A.ckResult(), $('sf-model').value], [null, ''], '斷線 ⇒ Check T-CON 結果與帶入的型號一起清掉');
    await A.connect(); for (let i = 0; i < 200 && A.state().busy; i++) await sleep(10); await sleep(30);

    G('畫面：v1.31.0 讀出 128 KB → Dump 分頁 → 另存新檔（hex／bin）→ 再讀一次比對');
    dev = fakeE501(false); const big = pattern(0x40000, 77); dev.mem.set(big);
    await A.checkTcon(); await SFU.detect();
    $('sf-rd-start').value = '0x000000'; $('sf-rd-len').value = '0x20000';
    const dlb = downloads.length;
    await SFU.read();
    EQ(downloads.length, dlb, '讀出不自動存檔');
    { const d = SFU.dumpSet();
      CHECK(d && d.sf && d.base === 0 && d.bytes.length === 0x20000 && Buffer.from(d.bytes).equals(Buffer.from(big.slice(0, 0x20000))), 'Dump＝Flash 0x000000 起 128 KB'); }
    CHECK(/第 1 \/ 512 頁/.test($('pageinfo').textContent), 'Dump 分頁：128 KB ＝ 512 頁、只畫目前這頁：' + $('pageinfo').textContent);
    CHECK(doc.querySelectorAll('#dump td').length < 600, '畫面上只畫一頁的格子（' + doc.querySelectorAll('#dump td').length + ' 個 td）');
    A.jumpTo('0x1FF00');
    CHECK(/第 512 \/ 512 頁/.test($('pageinfo').textContent), '跳到最後一頁（位址 0x1FF00）：' + $('pageinfo').textContent);
    $('sav-fmt').value = 'hex'; $('btn-save').click();
    CHECK(downloads.length === dlb + 1 && /^E501B_Flash_0x000000_0x020000_CKS_[0-9A-F]{6}\.hex$/.test(downloads[downloads.length - 1]), '按 Dump 的「另存新檔」才存，hex 檔名保留型號／範圍／CKS：' + downloads[downloads.length - 1]);
    { const hx = SFU.exportBuild('hex').data;
      CHECK(hx.startsWith(':10000000') && hx.includes(':020000040001'), 'hex 從 0 起、跨 64 KB 插 type 04'); }
    { const b2 = SFU.exportBuild('bin'); const cks = H(big.slice(0, 0x20000).reduce((s, v) => s + v, 0) & 0xFFFFFF, 6);
      CHECK(b2.name === 'E501B_Flash_0x000000_0x020000_CKS_' + cks + '.bin', 'bin 檔名 CKS＝內容總和低 24 位（手算 ' + cks + '）：' + b2.name); }
    await SFU.read();
    CHECK(A.srcA() && /外部 Flash E501B · 0x000000 起/.test(A.srcA()) && A.diffCount() === 0 && /外部 Flash E501B/.test(A.srcB() || ''), '同範圍再讀一次 ⇒ 進 B 跟 A 比對（0 處不同）：A=' + A.srcA() + ' B=' + A.srcB());
    SFU.setMode(false);
    $('btn-write').disabled = false; n0 = sent.length; $('btn-write').click(); await sleep(20);
    EQ(since(n0).filter(m => m.type === 'rawwrite').length, 0, 'Flash 內容在 Dump 時，一般 I2C 寫入不會送出');
    CHECK(/外部 Flash/.test($('readbanner').textContent), '畫面說明為什麼不能寫：' + $('readbanner').textContent);
    SFU.setMode(true);

    G('畫面：v1.31.0 Flash 紀錄窗（階段、百分比、紅字、完成摘要、清除、複製）');
    CHECK(vis($('sf-log')) && vis($('sf-log-copy')) && vis($('sf-log-clear')), '外部 Flash 面板有紀錄窗、複製全部、清除');
    $('sf-log-clear').click();
    EQ(SFU.logText(), '', '清除 ⇒ 紀錄窗清空');
    dev = fakeE501(false, { flipOnce: 1 }); await SFU.detect();
    SFU.setFile('fw2.bin', pattern(0x2000, 51)); $('sf-wr-start').value = '0x004000';
    p = SFU.write(); await until(() => SFU.state().confirmOpen); SFU.answer(true); await p;
    { const t = SFU.logText();
      CHECK(/讀 Flash ID/.test(t) && /抹除 4 KB @0x004000/.test(t) && /寫入 0x004000–0x004FFF/.test(t) && /讀回不符/.test(t) && /0x004000 重試第 1 次/.test(t)
            && /0x004000 寫入並比對 OK/.test(t) && /0x005000 寫入並比對 OK/.test(t), '階段：讀 ID → 抹除 → 寫入範圍 → 讀回不符 → 重試 → 比對 OK');
      CHECK(/完成：E501B 0x004000–0x005FFF · 0x002000（8 KB, 8,192 Byte） · CKS 0x[0-9A-F]{6} · /.test(t), '完成摘要：範圍、byte 數、CKS、耗時');
      const reds = Array.from($('sf-log').querySelectorAll('span.e')).map(s => s.textContent);
      CHECK(reds.some(x => /讀回不符/.test(x)), '比對不符是紅字'); }
    CHECK($('sf-prog').firstElementChild.style.width === '100%' && /重新上電/.test($('sf-progtxt').textContent), '進度條到 100%、狀態列換成完成提示：' + $('sf-progtxt').textContent);
    dev = fakeE501(false); await SFU.detect();
    failWriteAt = sent.filter(x => x.type === 'rawwrite').length + 40;
    p = SFU.write(); await until(() => SFU.state().confirmOpen); SFU.answer(true); await p; failWriteAt = 0;
    { const reds = Array.from($('sf-log').querySelectorAll('span.e')).map(s => s.textContent);
      CHECK(reds.some(x => /✕ I2C W 失敗/.test(x)) && reds.some(x => /寫入未完成：已完成 0x[0-9A-F]{6}（([\d,.]+ KB, )?[\d,]+ Byte）/.test(x)), 'I2C 錯誤與未完成摘要是紅字：' + reds.slice(-2).join(' | ')); }
    $('sf-rd-start').value = '0'; $('sf-rd-len').value = '0x4000';
    await SFU.read();
    CHECK(/已讀 0x001000（4 KB, 4,096 Byte） · 25%/.test(SFU.logText()) && /已讀 0x004000（16 KB, 16,384 Byte） · 100%/.test(SFU.logText()) && /完成：讀出 0x004000（16 KB, 16,384 Byte） · CKS 0x/.test(SFU.logText()), '讀出：每 10% 記一行百分比、完成摘要');
    SFU.copyLog();
    CHECK(SFU.lastCopy === SFU.logText() && SFU.lastCopy.split('\n').length > 10, '複製全部＝紀錄窗全部內容（' + SFU.lastCopy.split('\n').length + ' 行）');
    CHECK(/\[Flash\] 完成：讀出 0x004000（16 KB, 16,384 Byte）/.test(logText()), '同一行也寫進頁面下方的操作紀錄');

    G('畫面：v1.31.0 EM01 主 slave 0x68～0x6F，記憶體暫存區跟著＝主 − 0x10');
    const emChange = v => { $('sf-emslv').value = v; $('sf-emslv').dispatchEvent(new win.Event('change')); };
    SFU.setModel('EM01');
    CHECK(vis($('sf-emslv')) && $('sf-emslv').value === '68', 'EM01 出現主 slave 選單，預設 0x68');
    EQ(Array.from($('sf-emslv').options).map(o => o.value), ['68', '69', '6A', '6B', '6C', '6D', '6E', '6F'], '選項只有 0x68～0x6F');
    EQ(slv(), ['0x68', '0x58'], '預設 0x68／0x58');
    CHECK(/0x68～0x6F/.test($('sf-locknote').textContent) && /主 slave − 0x10/.test($('sf-locknote').textContent), 'EM01 的鎖定說明換成可選主 slave：' + $('sf-locknote').textContent);
    emChange('69');
    EQ(slv(), ['0x69', '0x59'], '改 0x69 ⇒ 記憶體暫存區自動 0x59');
    CHECK(/記憶體暫存區 0x59/.test($('sf-emslv-hint').textContent) && /8-bit D2\/D3/.test($('sf-slaves').textContent), '提示與 8-bit 說明跟著換：' + $('sf-emslv-hint').textContent);
    EQ($('sf-slaves').querySelectorAll('input,select').length, 0, '記憶體暫存區不能單獨改（位址卡仍沒有可編輯欄位）');
    /* 假 EM01 掛在 0x69／0x59：只認這兩個位址，其他位址回 0（＝沒有裝置） */
    const em69 = fakeEM01(); em69.mem.set(pattern(0x2000, 17));
    const at = s => (s === 0x69 ? 0x68 : (s === 0x59 ? 0x58 : -1));
    dev = { mem: em69.mem, write(s, aw, a, b) { if (at(s) >= 0) em69.write(at(s), aw, a, b); },
            read(s, aw, a, n) { return at(s) >= 0 ? em69.read(at(s), aw, a, n) : new Array(n).fill(0); } };
    $('sf-pad').value = '1'; $('sf-pad').dispatchEvent(new win.Event('change'));
    await SFU.detect();
    $('sf-rd-start').value = '0'; $('sf-rd-len').value = '0x1000';
    n0 = sent.length; await SFU.read();
    { const ms = since(n0); const ss = Array.from(new Set(ms.map(m => m.slave))).sort((a, b) => a - b);
      EQ(ss, [0x59, 0x69], '讀出經 WS 只送到 0x69／0x59（不再送 0x68／0x58）');
      CHECK(ms.every(m => (m.slave === 0x69 && m.awid === 2) || (m.slave === 0x59 && m.awid === 4)), 'offset 寬度不變：0x69 用 2 B、0x59 用 4 B'); }
    CHECK(Buffer.from(SFU.dumpSet().bytes).equals(Buffer.from(dev.mem.slice(0, 0x1000))), '掛在 0x69／0x59 的假 EM01 讀出內容正確');
    emChange('6F');
    EQ(slv(), ['0x6F', '0x5F'], '0x6F ⇒ 0x5F');
    CHECK(SFU.state().det === null, '換位址後 Flash ID 要重讀');
    nackSlaves = [0x7C, 0x7D]; dev = fakeEM01(); dev.reg[0xFF00] = 0x01; dev.reg[0xFF01] = 0xEF; dev.reg[0xFF02] = 0xA1;
    await A.checkTcon(); nackSlaves = [];
    EQ([$('sf-model').value, $('sf-emslv').value], ['EM01', '68'], 'Check T-CON 帶入 EM01 ⇒ 位址回預設 0x68／0x58');
    SFU.setModel('E501B');
    CHECK(!vis($('sf-emslv')) && /不能手改/.test($('sf-locknote').textContent), 'E501B 沒有位址選單、維持鎖定');
    SFU.setModel('EN01');
    CHECK(!vis($('sf-emslv')), 'EN01 沒有位址選單、維持鎖定');

    G('畫面：v1.32.0 起點／長度旁的換算（≥1 KB 寫 KB 與 Byte、不到 1 KB 只寫 Byte）');
    const decOf = (id, v) => { $(id).value = v; $(id).dispatchEvent(new win.Event('input')); return $(id + '-dec').textContent; };
    EQ(decOf('sf-rd-len', '0x400000'), '（4,096 KB, 4,194,304 Byte）', '0x400000 ⇒ 4,096 KB, 4,194,304 Byte');
    EQ(decOf('sf-rd-len', '0x1080'), '（4.125 KB, 4,224 Byte）', '0x1080 ⇒ 4.125 KB, 4,224 Byte（不是整數顯示小數）');
    EQ(decOf('sf-rd-len', '0x200'), '（512 Byte）', '0x200 ⇒ 只寫 512 Byte');
    EQ(decOf('sf-rd-start', '0x000000'), '（0 Byte）', '起點 0 ⇒ 0 Byte');
    EQ(decOf('sf-rd-start', '0x010000'), '（64 KB, 65,536 Byte）', '起點 0x010000 ⇒ 64 KB, 65,536 Byte');
    EQ(decOf('sf-wr-start', '0x1F000'), '（124 KB, 126,976 Byte）', '寫入起點 0x1F000 ⇒ 124 KB, 126,976 Byte');
    EQ(decOf('sf-rd-len', '0x100001'), '（1,024.001 KB, 1,048,577 Byte）', '0x100001 ⇒ 1,024.001 KB（手算 1048577/1024）');
    G('畫面：v1.32.0 長度／Flash 位址：不加 0x ＝ 十進位、加 0x ＝ 十六進位（輸入與換算）');
    EQ(decOf('sf-rd-len', '4096'), '= 0x001000（4 KB, 4,096 Byte）', '十進位 4096 ⇒ 補上 0x001000');
    EQ(decOf('sf-rd-len', '4194304'), '= 0x400000（4,096 KB, 4,194,304 Byte）', '十進位 4194304 ⇒ 0x400000');
    EQ(decOf('sf-rd-len', '4,096'), '= 0x001000（4 KB, 4,096 Byte）', '貼上畫面上的千分位 4,096 也吃');
    EQ(decOf('sf-rd-len', '512'), '= 0x000200（512 Byte）', '十進位 512 ⇒ 不到 1 KB 只寫 Byte');
    EQ(decOf('sf-rd-len', '1023'), '= 0x0003FF（1,023 Byte）', '邊界 1023 ⇒ 還不到 1 KB');
    EQ(decOf('sf-rd-len', '1024'), '= 0x000400（1 KB, 1,024 Byte）', '邊界 1024 ⇒ 1 KB');
    EQ(decOf('sf-rd-len', '0x1000'), '（4 KB, 4,096 Byte）', '0x1000 ⇒ 十六進位，不重複印 0x');
    EQ(decOf('sf-rd-len', '0X1000'), '（4 KB, 4,096 Byte）', '大寫 0X 也是十六進位');
    EQ(decOf('sf-rd-start', '65536'), '= 0x010000（64 KB, 65,536 Byte）', '起始位址也吃十進位');
    EQ(decOf('sf-wr-start', '0'), '= 0x000000（0 Byte）', '寫入位址 0（十進位）');
    ['1000h', '1A', '0x', '-5', '1.5', 'abc', '', '0x1G', '4,09'].forEach(j => {
      const t = decOf('sf-rd-len', j);
      CHECK(/看不懂/.test(t) && $('sf-rd-len').classList.contains('bad'), '非法輸入「' + j + '」⇒ 紅字規則、欄位標紅：' + t);
    });
    decOf('sf-rd-len', '0x1000');
    CHECK(!$('sf-rd-len').classList.contains('bad'), '改回合法值 ⇒ 紅框拿掉');
    { const A = win.__i2ct;
      if (A && A.parseLen) {
        EQ(['4096', '0x1000', '4,096', '0', '  8192 ', '1A', '100h', '#256', '256d', '0x', '-1', '1.5'].map(A.parseLen),
           [4096, 4096, 4096, 0, 8192, null, null, null, null, null, null, null], 'parseLen：只認 0x 與純數字（含千分位）');
      } else CHECK(false, '__i2ct.parseLen 存在'); }
    /* 起點用十進位 4096 讀 4 KB ⇒ 送出的範圍＝0x1000（不是 0x4096） */
    { SFU.setModel('E501B'); dev = fakeE501(false); await SFU.detect();
      $('sf-rd-start').value = '4096'; $('sf-rd-len').value = '4096';
      await SFU.read();
      const ds = SFU.dumpSet();
      CHECK(ds && ds.base === 0x1000 && ds.bytes.length === 0x1000, '十進位起點 4096／長度 4096 ⇒ 讀 0x1000 起 4 KB：' + (ds && ds.base));
      CHECK(/0x001000（4 KB, 4,096 Byte）/.test(SFU.logText()), 'log 摘要用新格式'); }

    G('畫面：v1.32.0 步驟式引導（③ 分段鈕、各步狀態、下一步）');
    { const seg = m => doc.querySelector('#mode-seg [data-mode="' + m + '"]');
      seg('gen').click(); await sleep(5);
      EQ($('in-devtype').value, 'gen', '按「一般暫存器讀寫」⇒ 裝置類型＝一般（同一個 select、同一個 change）');
      CHECK(!vis($('sf-panel')) && vis($('in-slave')) && seg('gen').classList.contains('on') && !seg('sf').classList.contains('on'), '一般模式：Flash 面板收起、slave 回來、分段鈕亮在一般');
      seg('ee').click(); await sleep(5);
      EQ($('in-devtype').value, 'ee', '按 EEPROM ⇒ 裝置類型＝EEPROM');
      CHECK(vis($('ee-grp')) && seg('ee').classList.contains('on'), 'EEPROM 組出現、分段鈕亮在 EEPROM');
      seg('sf').click(); await sleep(5);
      CHECK($('in-devtype').value === 'sf' && vis($('sf-panel')) && !vis($('in-slave')) && seg('sf').classList.contains('on'), '按外部 Flash ⇒ 面板出現、slave 整組收起');
      SFU.setMode(false); await sleep(5);
      CHECK(seg('gen').classList.contains('on'), '程式改 select（舊掛勾）⇒ 分段鈕跟著');
      SFU.setMode(true); await sleep(5);
      CHECK($('card-conn').classList.contains('done') && $('stp-tk-link').textContent === '✔', '① 已連線 ⇒ ✔');
      CHECK(/^下一步：/.test($('stp-next').textContent), '整頁有一行「下一步」：' + $('stp-next').textContent);
      /* v1.32.1：① 不再縮成一行（Bruce 2026-10-06「應該是要 always 顯示才對」） */
      CHECK(!$('card-conn').classList.contains('tc-step-done') && !$('card-conn').querySelector('.tc-done-line') && vis($('btn-link')) && vis($('linktext')),
            '① 已連線也完整顯示（沒有 done-step 那一行、開關與狀態字都在）');
      SFU.setModel('');
      CHECK(/TCON 型號/.test($('stp-why-run').textContent) || /型號/.test($('stp-next').textContent), '外部 Flash 沒選型號 ⇒ ④ 或下一步提示選型號：' + $('stp-next').textContent);
      win.applyLang('en'); await sleep(10);
      EQ(Array.from(doc.querySelectorAll('.stp .stp-t')).map(x => x.textContent),
         ['① Connect the I2C adapter', '② Identify the T-CON', '③ Choose what to do', '④ Set up and run', '⑤ Results and log'], '切英文 ⇒ 五步標題英文');
      CHECK(/^Next: /.test($('stp-next').textContent) && /External Flash/.test(seg('sf').textContent), '下一步與分段鈕英文：' + $('stp-next').textContent);
      win.applyLang('zh-CN'); await sleep(10);
      CHECK(/^下一步：/.test($('stp-next').textContent) && /设置并执行/.test($('stp-run').textContent), '切簡體');
      win.applyLang('zh-TW'); await sleep(10);
      const leak2 = (doc.querySelector('.wrap').textContent.match(/i2c\.(stp|nx|why|mode|lenRule)[A-Za-z]*/g) || []);
      EQ(leak2, [], '步驟與下一步沒有沒翻到的 key'); }

    G('畫面：三語');
    SFU.setModel('EN01');                                  /* v1.31.0 的組會換型號；EN01 說明那兩項要在 EN01 下驗 */
    win.applyLang('en'); await sleep(10);
    CHECK(/Control/.test($('sf-slaves').children[0].textContent), '切英文 ⇒ 位址卡換成英文');
    CHECK(/hardware check/.test($('sf-modelnote').textContent), 'EN01 說明換成英文');
    CHECK(/EN01 is selected but Check T-CON found /.test($('sf-cknote').textContent) && /^Read$/.test($('sf-read').textContent) && /Copy all/.test($('sf-log-copy').textContent),
          'v1.31.0 型號來源、讀出鈕、紀錄窗按鈕換成英文：' + $('sf-cknote').textContent);
    win.applyLang('zh-CN'); await sleep(10);
    CHECK(/控制/.test($('sf-slaves').children[0].textContent) && /待上机确认/.test($('sf-modelnote').textContent), '切簡體');
    win.applyLang('zh-TW'); await sleep(10);
    SFU.setModel('E501B');
    const leak = (($('sf-panel').textContent + $('sf-confirm').textContent + Array.from(doc.querySelectorAll('#sf-panel [title]')).map(e => e.title).join(' ')).match(/i2c\.sf[A-Za-z_]*/g) || []);
    EQ(leak, [], 'Flash 面板與確認窗沒有沒翻到的 key');

    G('畫面：v1.32.1 ① 連線狀態常駐（連線前／連線成功／斷線／錯誤）');
    { const card = $('card-conn'), info = () => $('conn-info').textContent, lt = () => $('linktext').textContent;
      const shownFull = () => vis(card) && vis($('btn-link')) && vis($('linktext')) && !card.classList.contains('tc-step-done') && !card.querySelector('.tc-done-line');
      /* 連線成功（＋ Check T-CON 有結果時型號也在 ① 這一行） */
      await A.checkTcon(); await sleep(10);
      CHECK(A.state().linked && shownFull() && card.classList.contains('done') && !card.classList.contains('err'), '連線成功：① 完整顯示、✔、不是紅框');
      CHECK(/已連線/.test(lt()) && /I2C Bridge 1\.17\.0/.test($('helperinfo').textContent) && /I2C 時脈 400 kHz/.test(info()), '連線成功：狀態字、Bridge 版本、時脈：' + lt() + ' | ' + info());
      CHECK(/T-CON：\S+/.test(info()) && !/認不出/.test(info()), '連線成功＋Check T-CON ⇒ ① 這一行也有型號：' + info());
      EQ($('btn-link').getAttribute('aria-pressed'), 'true', '開關亮（按下去＝中斷）');
      /* 斷線（非預期：bridge 那頭關掉）⇒ 立刻變紅、寫原因；之後自動重連 */
      win.eval('i2ctWs.close()');
      CHECK(!A.state().linked && shownFull() && card.classList.contains('err') && /連線中斷/.test(lt()), '斷線：① 仍完整顯示、整框紅、原因：' + lt());
      CHECK($('conn-info').classList.contains('err') && /I2C Bridge 在執行/.test(info()) && !/T-CON/.test(info()), '斷線：紅字寫該檢查什麼、型號清掉：' + info());
      EQ($('btn-link').getAttribute('aria-pressed'), 'false', '斷線：開關變灰（按下去＝連線）');
      CHECK(await until(() => A.state().linked && !A.state().busy, 4000), '斷線後自動重連成功');
      CHECK(!card.classList.contains('err') && shownFull() && /I2C 時脈/.test(info()), '重連後紅框拿掉');
      /* 使用者自己按中斷 ＝ 連線前的狀態（不是錯誤、不紅） */
      await A.disconnect(); await sleep(10);
      CHECK(shownFull() && !card.classList.contains('err') && !card.classList.contains('done') && /已中斷/.test(lt()) && info() === '', '按中斷：① 完整顯示、不紅、狀態「已中斷」：' + lt());
      EQ($('btn-link').textContent, '連線', '未連線：開關寫「連線」');
      /* 錯誤：連不到 I2C Bridge（WebSocket 建不起來） */
      wsFail = true; await A.connect(); await sleep(20); wsFail = false;
      CHECK(!A.state().linked && shownFull() && card.classList.contains('err') && /WebSocket|I2C Bridge/.test(lt()) && $('conn-info').classList.contains('err'), '錯誤：① 完整顯示、紅框、原因：' + lt() + ' | ' + info());
      win.applyLang('en'); await sleep(10);
      CHECK(/I2C Bridge is running/.test(info()) && shownFull(), '錯誤提示切英文：' + info());
      win.applyLang('zh-CN'); await sleep(10);
      CHECK(/I2C Bridge 在运行/.test(info()), '錯誤提示切簡體：' + info());
      win.applyLang('zh-TW'); await sleep(10);
      await A.connect(); for (let i = 0; i < 200 && A.state().busy; i++) await sleep(10); await sleep(20);
      CHECK(A.state().linked && !card.classList.contains('err') && /I2C 時脈 400 kHz/.test(info()), '再連一次 ⇒ 回到已連線');
      win.applyLang('en'); await sleep(10);
      CHECK(/I2C clock 400 kHz/.test(info()) && /Connected/.test(lt()), '已連線資訊切英文：' + info());
      win.applyLang('zh-TW'); await sleep(10);
      EQ((card.textContent.match(/i2c\.conn[A-Za-z]*/g) || []), [], '① 沒有沒翻到的 key'); }

    G('畫面：v1.33.0 Check T-CON 手選 EN01 ⇒ 讀 3E:207E 顯示 A1／A2／Unknown');
    { const reads207E = n => sent.slice(n).filter(m => m.type === 'read' && m.slave === 0x3E);
      const writes = n => sent.slice(n).filter(m => m.type === 'rawwrite').map(asLine);
      const pickEn01 = async (icVer) => {
        dev = fakeEN01({ icVer }); nackSlaves = [0x7C, 0x7D];          /* A 段讀不到、0xFF00 讀到 00 00 00 ⇒ 認不出來 */
        await A.checkTcon(); nackSlaves = [];
        const n = sent.length;
        await A.ckPick('EN01'); await sleep(5);
        return n; };
      /* 反面先做：E501 板 Check T-CON、E501／EM01 手選 ⇒ 一筆 0x3E 都不讀 */
      dev = fakeE501(false); let n0 = sent.length;
      await A.checkTcon();
      EQ([A.ckResult().name, reads207E(n0).length], ['E501B2', 0], 'E501 板按 Check T-CON ⇒ 沒有讀 0x3E（不對 E501 多探測）');
      dev = fakeEN01({ icVer: 0 }); nackSlaves = [0x7C, 0x7D]; await A.checkTcon(); nackSlaves = [];
      CHECK(A.ckResult().unknown && Array.from($('tcon-pick').options).some(o => o.value === 'EN01'), '認不出來 ⇒ 下拉有 EN01 可選');
      n0 = sent.length; await A.ckPick('E501B1'); await sleep(5);
      n0 = sent.length; await A.ckPick('EM01A1'); await sleep(5);
      EQ(reads207E(n0).length, 0, '手選 E501B1／EM01A1 ⇒ 沒有讀 0x3E');
      /* 0 ⇒ A1 */
      n0 = await pickEn01(0);
      EQ(reads207E(n0).map(asLine), [Rd(0x3E, 2, 0x207E, 1)], 'A1：只讀一次 3E / 2-byte / 0x207E / 1 byte（RCI:1397–1416）');
      EQ(writes(n0), [], 'A1：讀得到就沒有任何寫入');
      EQ([A.ckResult().name, A.ckResult().en01Ver && A.ckResult().en01Ver.txt], ['EN01', 'A1'], 'bit3:0 = 0 ⇒ A1');
      CHECK(/^EN01\s+\(RM81008\) · A1$/.test($('tcon-name').textContent), '② 型號旁顯示 A1：' + $('tcon-name').textContent);
      CHECK(/T-CON：EN01 · A1/.test($('conn-info').textContent), '① 連線區 T-CON 欄位顯示 A1：' + $('conn-info').textContent);
      EQ($('tcon-pick').value, 'EN01', '讀完重畫後下拉仍停在 EN01');
      EQ($('sf-model').value, 'EN01', '外部 Flash 型號跟著帶入 EN01');
      CHECK(/EN01 IC 版本：A1（3E:207E = 0x00）/.test(logText()), 'log 記原始值：0x00');
      /* 1 ⇒ A2；高 nibble 不看 */
      n0 = await pickEn01(0x31);
      EQ(A.ckResult().en01Ver.txt, 'A2', '0x31（bit3:0 = 1）⇒ A2（只看 bit3:0）');
      CHECK(/EN01\s+\(RM81008\) · A2/.test($('tcon-name').textContent) && /T-CON：EN01 · A2/.test($('conn-info').textContent), '兩處都顯示 A2');
      /* 其他 ⇒ Unknown */
      n0 = await pickEn01(0x02);
      EQ(A.ckResult().en01Ver.txt, 'Unknown', '2 ⇒ Unknown（RCI:1414）');
      CHECK(/· Unknown/.test($('tcon-name').textContent) && /T-CON：EN01 · Unknown/.test($('conn-info').textContent), '兩處都顯示 Unknown');
      /* 0xFF ⇒ 補 7E:AB←CD 再讀一次，仍 0xFF ⇒ Unknown */
      n0 = await pickEn01(0xFF);
      EQ(writes(n0), [W(0x7E, 1, 0xAB, [0xCD])], '讀到 0xFF ⇒ 只補一筆 EN01 M-Bus→C-Bus 7E:AB←CD（不下 E503 的 3E:0059）');
      EQ(reads207E(n0).length, 2, '補完重讀一次（共兩次）');
      EQ(A.ckResult().en01Ver.txt, 'Unknown', '仍 0xFF ⇒ Unknown');
      /* 讀不到 ⇒ 「版本讀不到」 */
      dev = fakeEN01({ icVer: 0 }); nackSlaves = [0x7C, 0x7D]; await A.checkTcon();
      nackSlaves = [0x7C, 0x7D, 0x3E]; n0 = sent.length; await A.ckPick('EN01'); await sleep(5); nackSlaves = [];
      CHECK(A.ckResult().en01Ver && A.ckResult().en01Ver.fail && /EN01\s+\(RM81008\) · 版本讀不到/.test($('tcon-name').textContent), '0x3E 沒回應 ⇒ 顯示「版本讀不到」：' + $('tcon-name').textContent);
      win.applyLang('en'); await sleep(10);
      CHECK(/version unreadable/.test($('tcon-name').textContent), '切英文：' + $('tcon-name').textContent);
      win.applyLang('zh-TW'); await sleep(10);
      /* 改選別顆 ⇒ 版本拿掉 */
      await A.ckPick('E501A'); await sleep(5);
      CHECK(!A.ckResult().en01Ver && !/·/.test($('tcon-name').textContent), '改選 E501A ⇒ 不留 EN01 版本：' + $('tcon-name').textContent);
      /* 重按 Check T-CON ⇒ 結果重來 */
      n0 = await pickEn01(1); dev = fakeE501(false); await A.checkTcon();
      CHECK(!A.ckResult().en01Ver && A.ckResult().name === 'E501B2', '重按 Check T-CON ⇒ 版本跟著舊結果清掉'); }

    G('畫面：切回一般模式，原本的讀寫照舊');
    SFU.setMode(false);
    CHECK(!vis($('sf-panel')) && vis($('in-slave')) && vis($('in-awid')) && vis($('btn-read')), '面板收起、原欄位回來');
    EQ($('in-devtype').value, 'gen', '選單回到一般');
    CHECK(pageErrors.length === 0, '全程沒有 JS 例外：' + pageErrors.join(' | '));
    win.close();
  }

  console.log('\n' + (fails ? '🔴 ' + fails + ' / ' + total + ' 項失敗' : '✅ ' + total + ' 項全過'));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
