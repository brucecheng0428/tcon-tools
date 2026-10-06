#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   i2c_spiflash_selftest.js — common/i2c-spiflash.js 的序列測試（i2c v1.29.0）
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

/* ═══ 假 EN01（FMo 的 0x0098–0x00A1 語意）═════════════════════════════════════ */
function fakeEN01() {
  const mem = new Uint8Array(0x40000); for (let i = 0; i < mem.length; i++) mem[i] = (i * 7 + (i >> 8)) & 0xFF;
  const r = {};
  return {
    mem,
    write(s, aw, a, b) { if (s === 0x3E) b.forEach((v, i) => { r[a + i] = v; }); },
    read(s, aw, a, n) {
      if (s === 0x3E && a === 0x207E) return [0x01];
      if (s === 0x64) { const ad = (r[0x9A] << 16) | (r[0x9B] << 8) | r[0x9C]; return Array.from(mem.slice(ad, ad + n)); }
      return new Array(n).fill(0);
    }
  };
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
  G('EN01：IC 版本 3E:0x207E（RCI:1397–1416）；寫入停用');
  {
    const rc = recorder(fakeEN01());
    const r = await P.EN01.detect(rc.io);
    EQ(rc.log, [Rd(0x3E, 2, 0x207E, 1)], '只讀 207E');
    EQ(r.icVerTxt, 'A2', '0x01 ⇒ A2');
    EQ(P.EN01.canWrite, false, 'EN01 不開放寫入（Unlock／Lock 值在未分享的共用庫）');
    CHECK(typeof P.EN01.write === 'undefined', 'EN01 沒有寫入函式');
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
    let dev = null, sent = [], failWriteAt = 0;
    const dom = new JSDOM(html, {
      url: 'http://127.0.0.1:8899/i2c.html', runScripts: 'dangerously', pretendToBeVisual: true,
      beforeParse(win) {
        win.addEventListener('error', e => pageErrors.push(String(e.message || e.error)));
        win.URL.createObjectURL = () => 'blob:x'; win.URL.revokeObjectURL = () => {};
        class MockWS {
          constructor() { this.readyState = 0; setTimeout(() => { this.readyState = 1; this.onopen && this.onopen(); }, 0); }
          send(txt) {
            const m = JSON.parse(txt); sent.push(m);
            let r = { ok: true };
            if (m.type === 'ping') r = { helper: '1.17.0', proto: 6, ok: true };
            else if (m.type === 'open') r = { ok: true, channels: 1 };
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

    G('畫面：E501B 位址自動帶入並鎖定（7-bit）');
    SFU.setModel('E501B');
    const cards = Array.from($('sf-slaves').children).map(d => d.textContent);
    EQ(cards.map(t => (t.match(/0x[0-9A-F]{2}/) || [''])[0]), ['0x3E', '0x7C', '0x64', '0x7D'], '四個 slave：3E／7C／64／7D');
    CHECK(cards.every(t => /7-bit/.test(t)), '每張都標 7-bit');
    CHECK(/7C\/7D/.test(cards[0]) && /C8\/C9/.test(cards[2]), '8-bit 只當說明顯示（0x3E ⇒ 7C/7D、0x64 ⇒ C8/C9）');
    EQ($('sf-slaves').querySelectorAll('input,select').length, 0, '位址卡沒有任何可編輯欄位');
    CHECK(!$('sf-detect').disabled && $('sf-read').disabled && $('sf-write').disabled, '選了型號：只開讀 ID');

    G('畫面：E501B 讀 ID → 讀出 8 KB → 存 .bin');
    dev = fakeE501(false); const src = pattern(0x40000, 21); dev.mem.set(src);
    let n0 = sent.length;
    await SFU.detect();
    EQ(since(n0).map(asLine)[since(n0).length - 2], Rd(0x7D, 2, 0x0246, 3), '畫面送出的 JEDEC 讀取 7D:0246（7-bit、2-byte offset）');
    CHECK(/EF 40 16/.test($('sf-id').textContent) && /4 MB/.test($('sf-id').textContent), '顯示 JEDEC 與容量：' + $('sf-id').textContent);
    CHECK(!$('sf-read').disabled && $('sf-write').disabled, '讀出開了；沒選檔前寫入仍停用');
    $('sf-rd-start').value = '0x001000'; $('sf-rd-len').value = '0x2000';
    n0 = sent.length;
    await SFU.read();
    const lines = since(n0).map(asLine);
    EQ(lines.slice(3, 7), [W(0x3E, 2, 0xB6, [0x40]), W(0x3E, 2, 0xAD, [0xE5, 0x03, 0, 0x10, 0, 0, 0xF0, 0xFF, 0x04]), Rd(0x64, 1, 0, 4096), W(0x3E, 2, 0xB6, [0])], '經 WS 送出的第一個 4 KB 序列與原廠相同（4096 一次讀完、不分段）');
    EQ(lines[lines.length - 1], W(0x3E, 2, 0xAD, Z9), '最後送結束');
    const dl = SFU.lastDownload;
    CHECK(dl && Buffer.from(dl.bytes).equals(Buffer.from(src.slice(0x1000, 0x3000))), '另存的 bin＝Flash 內容');
    CHECK(dl && /^E501B_Flash_0x001000_0x002000_CKS_[0-9A-F]{6}\.bin$/.test(dl.name), '檔名含位址、長度、CKS：' + (dl && dl.name));
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
    CHECK(/^EM01_Demura_Flash_0x000000_0x001000_/.test(SFU.lastDownload.name), 'Demura 讀出的檔名標 Demura：' + SFU.lastDownload.name);
    SFU.setFile('em.bin', [1, 2, 3]); $('sf-wr-start').value = '0x010000';
    p = SFU.write(); await until(() => SFU.state().confirmOpen);
    CHECK(/補 0x00 到 4096/.test($('sf-cf-tbl').textContent) && /Demura/.test($('sf-cf-tbl').textContent), '確認窗寫明補 0x00 與 Demura');
    SFU.answer(true); await p;
    EQ([dev.mem[0x10000], dev.mem[0x10002], dev.mem[0x10003], dev.mem[0x10FFF]], [1, 3, 0, 0], 'EM01 寫入：資料＋補 0x00');

    G('畫面：EN01 只開讀取');
    SFU.setModel('EN01');
    EQ(Array.from($('sf-slaves').querySelectorAll('b')).map(b => b.textContent), ['0x3E', '0x64'], 'EN01：0x3E／0x64');
    CHECK(/待上機確認/.test($('sf-modelnote').textContent) && /寫入暫時停用/.test($('sf-modelnote').textContent), '畫面標「待上機確認」與寫入停用原因');
    CHECK(!vis($('sf-auto')), 'EN01 不顯示自動判斷');
    dev = fakeEN01(); await SFU.detect();
    CHECK(/A2/.test($('sf-id').textContent), '顯示 IC 版本 A2');
    SFU.setFile('en.bin', pattern(0x1000));
    CHECK($('sf-write').disabled && $('sf-pick').disabled && /停用/.test($('sf-write').title), '寫入鈕、選檔鈕停用，滑鼠提示寫原因');
    $('sf-rd-start').value = '0'; $('sf-rd-len').value = '0x2000';
    await SFU.read();
    CHECK(Buffer.from(SFU.lastDownload.bytes).equals(Buffer.from(dev.mem.slice(0, 0x2000))), 'EN01 讀出內容正確');

    G('畫面：三語');
    win.applyLang('en'); await sleep(10);
    CHECK(/Control/.test($('sf-slaves').children[0].textContent), '切英文 ⇒ 位址卡換成英文');
    CHECK(/hardware check/.test($('sf-modelnote').textContent), 'EN01 說明換成英文');
    win.applyLang('zh-CN'); await sleep(10);
    CHECK(/控制/.test($('sf-slaves').children[0].textContent) && /待上机确认/.test($('sf-modelnote').textContent), '切簡體');
    win.applyLang('zh-TW'); await sleep(10);
    SFU.setModel('E501B');
    const leak = (($('sf-panel').textContent + $('sf-confirm').textContent + Array.from(doc.querySelectorAll('#sf-panel [title]')).map(e => e.title).join(' ')).match(/i2c\.sf[A-Za-z_]*/g) || []);
    EQ(leak, [], 'Flash 面板與確認窗沒有沒翻到的 key');

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
