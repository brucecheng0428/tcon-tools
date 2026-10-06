#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   check_datamap.js — Data Mapping 分頁（datamap.html）核心的機械檢查
   ───────────────────────────────────────────────────────────────────────────
   測的是 common/datamap-core.js（頁面與這支共用同一份程式，不是複製品）。
   本 repo 公開可抓，客戶 code 不可進版控 ⇒ 這裡用**合成語料**：照各型號 sys 區的
   bank 起點表（出處見 datamap-core.js 檔頭 ④）組出結構合法的映像。
   真檔自測另外跑（不進版控）：node tools/check_datamap.js --real <檔案或資料夾>...

   檢查項目
     ① 三顆的 .bin 定位：恰好命中自己、不誤認別顆；表頭不一致 ⇒ 拒絕
     ② 解碼：每個欄位讀到的值 ＝ 寫進去的值（含 E512 force_de_sel 在 0x02[7:4]）
     ③ 匯出 script → 套回原檔：只有 Data Mapping 的 byte 變、而且只變遮罩內的位元
     ④ I2C 假裝置：寫入位址與值正確、遮罩外位元保留、寫後讀回比對
     ⑤ 預設樣式：EM02 原廠工具的 (32) 套上去 ＝ 原廠表的值；matchPreset 認得出來
     ⑥（選擇性）原廠 RApp_TX.h 在本機時，逐字比對 34 筆預設樣式
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs'), path = require('path');
const DM = require(path.join(__dirname, '..', 'common', 'datamap-core.js'));

let fails = 0, passes = 0;
function ok(cond, msg) { if (cond) passes++; else { fails++; console.log('  ✗ ' + msg); } }
function sec(t) { console.log('── ' + t); }

/* 合成映像：各型號照 sys 區表頭擺 bank 起點 */
function synth(model) {
  const b = new Uint8Array(model === 'EM01F' ? 0x40000 : 0x1000);
  for (let i = 0; i < b.length; i++) b[i] = (i * 37 + 11) & 0xFF;   // 填雜訊，確保「沒改的 byte」有值可比
  let o7, o8, base;
  if (model === 'EM02') { o7 = 0x033E; o8 = 0x0440; b[0x31] = o7 & 0xFF; b[0x32] = o7 >> 8; b[0x33] = o8 & 0xFF; b[0x34] = o8 >> 8; }
  if (model === 'E512') { o7 = 0x02DE; o8 = 0x03D7; b[0x43] = o7 & 0xFF; b[0x44] = o7 >> 8; b[0x45] = o8 & 0xFF; b[0x46] = o8 >> 8; }
  if (model === 'EM01') { o7 = 0x0358; o8 = 0x0457; b[0x46] = o7 & 0xFF; b[0x47] = o7 >> 8; b[0x48] = o8 & 0xFF; b[0x49] = o8 >> 8; }
  /* 其他型號的表頭位置故意放不吻合的值，避免偶然雙命中 */
  if (model !== 'EM02') { b[0x31] = 0x11; b[0x32] = 0x01; b[0x33] = 0x22; b[0x34] = 0x02; }
  if (model !== 'E512' && model !== 'EM01') { b[0x43] = 0x10; b[0x44] = 0x01; b[0x45] = 0x30; b[0x46] = 0x02; }
  if (model !== 'EM01') { b[0x47] = 0x00; b[0x48] = 0x05; b[0x49] = 0x07; }
  if (model === 'E512') { b[0x47] = 0xA5; b[0x48] = 0x04; b[0x49] = 0x77; }   // 真檔 0x47 ＝ rt8tcon2 起點，與 EM01 判準不吻合
  if (model === 'EM01F') { b[0x500] = 1920 & 0xFF; b[0x501] = 1920 >> 8; b[0x502] = 1080 & 0xFF; b[0x503] = 1080 >> 8; }
  return { bytes: b, o7, o8 };
}

function fileMapOf(res) { return res.fileOf; }

function sampleState() {
  const s = DM.emptyState();
  s.panelMode = 2; s.ltpsZz = 1; s.subPanel = 5; s.mirror = 1; s.chrb = 1; s.chwb = 0; s.handMode = 1;
  s.forceDeEn = 1; s.forceDeSel = 9; s.rvs = 0xA55A; s.rdMode = 1;
  for (let i = 0; i < 48; i++) s.sel[i] = (i * 7) % 30;
  return s;
}

/* ① ② 定位與解碼 */
sec('① 定位 ＋ ② 解碼');
for (const mk of ['EM02', 'E512', 'EM01', 'EM01F']) {
  const model = mk === 'EM01F' ? 'EM01' : mk;
  const syn = synth(mk);
  const hits = DM.locate(syn.bytes);
  ok(hits.length === 1 && hits[0].model === model, mk + ' 只命中自己（實得 ' + hits.map(h => h.model).join(',') + '）');
  /* 把 sampleState 寫進檔案（用 fileOf 換算） */
  const s = sampleState();
  if (model === 'E512') s.forceDeSel = 9 & 0xF;
  const enc = DM.encode(model, s);
  for (const e of enc) { const o = hits[0].fileOf(e.reg); syn.bytes[o] = DM.maskedMerge(syn.bytes[o], e.val, e.mask); }
  const r = DM.parseCode(syn.bytes);
  ok(r.ok && r.model === model, mk + ' parseCode 成功且型號正確');
  if (r.ok) {
    ok(JSON.stringify(r.state) === JSON.stringify(s), mk + ' 解碼值 ＝ 寫入值');
  }
  /* 指定錯的型號 ⇒ 拒絕 */
  const other = model === 'EM02' ? 'E512' : 'EM02';
  const r2 = DM.parseCode(syn.bytes, other);
  ok(!r2.ok, mk + ' 指定成 ' + other + ' 時拒絕');
}
/* 表頭鏈不一致 ⇒ 拒絕 */
{
  const syn = synth('EM02'); syn.bytes[0x33] = 0x41;   // rt8 起點錯 1
  ok(DM.locate(syn.bytes).length === 0, 'EM02 表頭 rt8 起點不等於 rt7+0x102 ⇒ 不命中');
  ok(!DM.parseCode(new Uint8Array(50)).ok, '太小的檔 ⇒ 拒絕');
}
/* E512 force_de_sel 位置 */
{
  const f = DM.fieldsOf('E512').find(x => x.id === 'forceDeSel');
  ok(f.reg === 0x0482 && f.shift === 4 && f.bits === 4, 'E512 force_de_sel ＝ 0x0482[7:4]');
  const g = DM.fieldsOf('EM02').find(x => x.id === 'forceDeSel');
  ok(g.reg === 0x04C5 && g.shift === 0 && g.bits === 6, 'EM02 force_de_sel ＝ 0x04C5[5:0]');
  const h = DM.fieldsOf('EM01').find(x => x.id === 'forceDeSel');
  ok(h.reg === 0x0445, 'EM01 force_de_sel ＝ 0x0445[5:0]');
}
/* 遮罩不含 TX（rt7+0 bit0） */
for (const m of DM.MODEL_KEYS) {
  const r0 = DM.regsOf(m).find(e => e.reg === DM.MODELS[m].rt7);
  ok(r0 && (r0.mask & 0x01) === 0, m + ' rt7+0 遮罩不含 bit0（reg_isp_mlvds_sel）');
}

/* ③ 匯出 → 套回原檔 */
sec('③ 匯出 script → 套回原檔');
for (const mk of ['EM02', 'E512', 'EM01', 'EM01F']) {
  const model = mk === 'EM01F' ? 'EM01' : mk;
  const syn = synth(mk);
  const r = DM.parseCode(syn.bytes);
  if (!r.ok) { ok(false, mk + ' 無法解析'); continue; }
  const s = DM.cloneState(r.state);
  s.panelMode = (s.panelMode + 1) & 3; s.handMode ^= 1; s.sel[0] = (s.sel[0] + 3) % 30; s.sel[47] = 31; s.rdMode = (s.rdMode + 1) & 3;
  s.forceDeSel = (s.forceDeSel + 1) & (model === 'E512' ? 0xF : 0x3F); s.rvs ^= 0x0F0F;
  const out = DM.buildScript(model, s, { version: 'test', source: 'synthetic' });
  ok(out.ok, mk + ' buildScript 成功');
  const img = Uint8Array.from(syn.bytes);
  const ap = DM.applyScript(out.text, {
    get: reg => img[r.fileOf(reg)],
    set: (reg, v) => { img[r.fileOf(reg)] = v; }
  });
  ok(ap.bad.length === 0, mk + ' script 每一行都是 write -m（bad=' + ap.bad.join(',') + '）');
  /* 允許變動的位置：DM byte 的遮罩位元 */
  const allow = {};
  for (const e of DM.regsOf(model)) allow[r.fileOf(e.reg)] = e.mask;
  let outside = 0, outsideBits = 0, changed = 0;
  for (let i = 0; i < img.length; i++) {
    if (img[i] === syn.bytes[i]) continue;
    changed++;
    if (!(i in allow)) { outside++; continue; }
    if ((img[i] ^ syn.bytes[i]) & ~allow[i] & 0xFF) outsideBits++;
  }
  ok(changed > 0, mk + ' 套回後確實有變（' + changed + ' bytes）');
  ok(outside === 0, mk + ' 沒有 Data Mapping 以外的 byte 被改（' + outside + '）');
  ok(outsideBits === 0, mk + ' DM byte 內遮罩外的位元沒被改（' + outsideBits + '）');
  const back = DM.parseCode(img, model);
  ok(back.ok && JSON.stringify(back.state) === JSON.stringify(s), mk + ' 套回後重新解碼 ＝ 匯出前的狀態');
}

/* ④ I2C 假裝置 */
sec('④ I2C 假裝置');
(async function () {
  for (const model of DM.MODEL_KEYS) {
    const mem = new Uint8Array(0x10000);
    for (let i = 0; i < mem.length; i++) mem[i] = (i * 13 + 5) & 0xFF;
    const writes = [];
    const io = {
      read: async (a, n) => Array.from(mem.slice(a, a + n)),
      write: async (a, bytes) => { writes.push([a, bytes.slice()]); for (let k = 0; k < bytes.length; k++) mem[a + k] = bytes[k]; }
    };
    const before = Uint8Array.from(mem);
    const s0 = await DM.readState(io, model);
    const expect0 = DM.decode(model, reg => before[reg]);
    ok(JSON.stringify(s0) === JSON.stringify(expect0), model + ' readState ＝ 直接解碼');
    const s1 = DM.cloneState(s0); s1.sel[5] = (s1.sel[5] + 1) % 30; s1.handMode ^= 1; s1.forceDeSel ^= 1;
    const d = DM.diffRegs(model, s0, s1);
    const res = await DM.writeRegs(io, d, () => {});
    ok(res.ok && res.written === d.length, model + ' 寫入 ' + d.length + ' 個 byte 全部成功');
    const m = DM.MODELS[model];
    const expAddrs = [m.rt7 + 0x01, m.rt7 + m.deSel.off, m.rt7 + 0x03 + 5].sort((a, b) => a - b);
    const gotAddrs = writes.map(w => w[0]).sort((a, b) => a - b);
    ok(JSON.stringify(gotAddrs) === JSON.stringify(Array.from(new Set(expAddrs)).sort((a, b) => a - b)),
       model + ' 寫入位址 ＝ ' + expAddrs.map(a => '0x' + a.toString(16)).join(',') + '（實得 ' + gotAddrs.map(a => '0x' + a.toString(16)).join(',') + '）');
    for (const w of writes) {
      const e = d.find(x => x.reg === w[0]);
      ok(e && w[1].length === 1 && w[1][0] === DM.maskedMerge(before[w[0]], e.val, e.mask),
         model + ' 0x' + w[0].toString(16) + ' 寫入值 ＝ 原值遮罩外保留＋新值');
    }
    let stray = 0; for (let i = 0; i < mem.length; i++) if (mem[i] !== before[i] && !writes.some(w => w[0] === i)) stray++;
    ok(stray === 0, model + ' 沒有寫到別的位址');
    const s2 = await DM.readState(io, model);
    ok(JSON.stringify(s2) === JSON.stringify(s1), model + ' 寫完讀回 ＝ 目標狀態');
    /* 讀回不符 ⇒ 回報失敗 */
    const bad = { read: io.read, write: async () => {} };
    const r3 = await DM.writeRegs(bad, [{ reg: m.rt7 + 0x03, val: (mem[m.rt7 + 0x03] + 1) & 0x1F, mask: 0x1F }], () => {});
    ok(!r3.ok && r3.failed.length === 1, model + ' 寫不進去（讀回不符）時回報失敗');
  }

  /* ⑤ 預設樣式 */
  sec('⑤ 預設樣式');
  ok(DM.PRESETS.length === 34, '預設樣式 34 筆（原廠 35 筆扣掉 (33) User define；(0) 有 Normal／Mirror 兩筆）');
  const p32 = DM.PRESETS.findIndex(p => p.name.indexOf('(32)') === 0);
  const s = DM.applyPreset('EM02', DM.emptyState(), p32);
  ok(s.rdMode === 1 && s.panelMode === 2 && s.handMode === 1 && s.forceDeEn === 1 && s.forceDeSel === 14, '(32) 欄位值正確');
  ok(s.sel.slice(0, 24).join(',') === '10,17,8,15,8,15,7,12,7,12,16,23,4,11,2,9,2,9,1,6,1,6,10,17', '(32) r0..b1 索引正確');
  ok(DM.matchPreset('EM02', s) === p32, 'matchPreset 認得 (32)');
  ok(DM.idxName(0, 1) === 'R1' && DM.idxName(6, 1) === 'R-2' && DM.idxName(12, 1) === null && DM.idxName(12, 2) === 'R-2' &&
     DM.idxName(29, 5) === 'B2' && DM.idxName(29, 4) === 'B-1' && DM.idxName(3, 2) === 'R4', 'idxName 與 diagram 對得上');

  /* ⑥ 原廠表逐字比對（本機有原始碼才跑） */
  const H = path.join(process.env.HOME || '', 'ClaudeData/Projects/VCL_TV_TCON_EM02_Tool/App/TX/RApp_TX.h');
  if (fs.existsSync(H)) {
    sec('⑥ 原廠預設樣式表逐字比對');
    const src = fs.readFileSync(H, 'latin1');
    const blk = src.slice(src.indexOf('stRt7MapType[TX_MAP_ITEM_NUM] ='));
    const rows = blk.split('\n').filter(l => /^\s*"\(\d+\)/.test(l));
    let n = 0;
    for (const row of rows) {
      const cells = (row.match(/"[^"]*"/g) || []).map(c => c.slice(1, -1));
      const name = cells[0], vals = cells.slice(1);
      const p = DM.PRESETS.find(q => q.name === name);
      if (name.indexOf('User define') >= 0) continue;
      if (!p) { ok(false, '找不到 ' + name); continue; }
      const head = ['rdMode', 'panelMode', 'ltpsZz', 'subPanel', 'mirror', 'chrb', 'forceDeEn', 'forceDeSel', 'rvsL', 'rvsH', 'handMode'];
      let same = true;
      for (let i = 0; i < vals.length; i++) {
        const id = i < 11 ? head[i] : 'sel' + (i - 11);
        const want = vals[i] === 'x' ? undefined : +vals[i];
        if (p.set[id] !== want) { same = false; console.log('    ' + name + ' ' + id + ' 原廠=' + vals[i] + ' 本表=' + p.set[id]); }
      }
      ok(same, name + ' 與原廠表一致'); n++;
    }
    ok(n === 34, '原廠表比對筆數 34（實得 ' + n + '）');
  }

  /* 真檔（選擇性，不進版控） */
  const ri = process.argv.indexOf('--real');
  if (ri >= 0) {
    sec('真檔');
    const list = [];
    const walk = p => { const st = fs.statSync(p); if (st.isDirectory()) fs.readdirSync(p).forEach(f => walk(path.join(p, f))); else if (/\.bin$/i.test(p)) list.push(p); };
    process.argv.slice(ri + 1).forEach(walk);
    const cnt = {};
    for (const f of list) {
      const b = new Uint8Array(fs.readFileSync(f));
      const r = DM.parseCode(b);
      const k = r.ok ? r.model + '/' + r.medium : 'REJECT:' + r.reason;
      cnt[k] = (cnt[k] || 0) + 1;
    }
    console.log('  ' + JSON.stringify(cnt));
  }

  console.log((fails ? '✗ ' : '✓ ') + passes + ' 項通過、' + fails + ' 項失敗');
  process.exit(fails ? 1 : 0);
})();
