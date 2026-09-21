/* ═══════════════════════════════════════════════════════════════════════════
   dg_selftest_v160_probe.js — dgself v1.6.0 的驗收夾具（jsdom）

   Bruce 2026-09-21 交辦：
     ① 讀 DG LUT（EM02 優先，EM01 同時做），bus-enable 兩個候選都實作、可切換
     ② 新卡片：RGB LUT 檢視（曲線 ＋ 可摺疊數值表 ＋ 吻合度 ＋ 失敗講在哪一步）
     ③ 連動 DG 第一部分 —— **這一輪刻意不做**，所以這裡有一條斷言把它釘住
     ④ 「開始掃描」變灰時要說明原因

   ═══ 🔴 這支夾具怎麼避免「自己驗自己」════════════════════════════════════
   打包用的 `packBits()` 是**本檔獨立寫的 writer**，產品端是 reader。
   兩邊只共用「規格怎麼寫」，不共用任何一行程式碼 —— reader 寫錯就對不上。
   而且第 ① 組最後有一條**負向**斷言：identity 只能被「正確的那一個 packing」
   解出 100%，其餘候選必須低於 100%。少了這一條，「全部候選都回 identity」
   這種假過會通過。

   🔴 **沒驗到的（誠實列在這裡，不要在回報裡含糊過去）**：
      真治具、真 TCON、真 AHB 視窗。這台 Mac 沒有硬體 ⇒ I2C 那一段全部是假的
      WebSocket。這支能證明的是「序列與解碼邏輯正確」，**不能**證明真機讀得回來。

   用法：node tools/dg_selftest_v160_probe.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const repo = path.join(__dirname, '..');
let pass = 0, fail = 0;
function CHECK(cond, msg, got) {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg + (got === undefined ? '' : '   got=' + JSON.stringify(got))); }
}
function EQ(a, b, msg) { CHECK(JSON.stringify(a) === JSON.stringify(b), msg, a); }
function H(n) { console.log('\n── ' + n + ' ' + '─'.repeat(Math.max(0, 58 - n.length))); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

function inline(file) {
  let html = fs.readFileSync(path.join(repo, file), 'utf8');
  return html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
    const f = path.join(repo, src.split('?')[0]);
    if (!fs.existsSync(f)) return '<script>/* missing ' + src + ' */</script>';
    return '<script>\n' + fs.readFileSync(f, 'utf8') + '\n</script>';
  });
}

/* ── 獨立的 bit writer（產品端只有 reader，這裡刻意另寫一份）────────────── */
function packBits(vals, w, msbFirst) {
  const out = [];
  let cur = 0, nbit = 0;
  function push(bit) {
    if (msbFirst) cur = ((cur << 1) | bit) & 0xFF;
    else cur |= bit << nbit;
    nbit++;
    if (nbit === 8) { out.push(cur); cur = 0; nbit = 0; }
  }
  for (const v of vals) {
    if (msbFirst) { for (let i = w - 1; i >= 0; i--) push((v >> i) & 1); }
    else { for (let i = 0; i < w; i++) push((v >> i) & 1); }
  }
  if (nbit) { if (msbFirst) cur = (cur << (8 - nbit)) & 0xFF; out.push(cur); }
  return out;
}
function identity(entries, entryBits, depth) {
  const k = Math.pow(2, depth - entryBits), a = [];
  for (let i = 0; i < entries; i++) a.push(i * k);
  a[entries - 1] = Math.pow(2, depth) - 1;
  return a;
}
/* planar：R 全部、G 全部、B 全部 */
function packPlanar(r, g, b, w, msbFirst) { return packBits(r.concat(g).concat(b), w, msbFirst); }
/* inter：每一階 R,G,B */
function packInter(r, g, b, w, msbFirst) {
  const seq = [];
  for (let i = 0; i < r.length; i++) seq.push(r[i], g[i], b[i]);
  return packBits(seq, w, msbFirst);
}

/* ── 假的 I2C Bridge ─────────────────────────────────────────────────────
   模型要有真實語意，否則測不出東西：
     · 暫存器（awid 2、slave 0x68）：一張 byte map，rawwrite 真的會改它
     · AHB（awid 4、slave 0x58）：**只有在 bus-enable 那一位是 1 的時候**才回
       LUT 資料，否則回全 0x00 —— 這正是「候選錯了會讀到全 0」的行為
   ws.trace 收下每一則命令，供「序列正確嗎」「有沒有關回去」的斷言使用。 */
function makeBridge(opts) {
  opts = opts || {};
  const regs = Object.assign({ 0xFF00: [0x02, 0xEF, 0xA0] }, opts.regs || {});
  const lut = opts.lut || [];                 // AHB 視窗的內容
  const busAddr = opts.busAddr, busBit = opts.busBit;
  const trace = [];
  function regByte(a) { const v = regs[a]; return Array.isArray(v) ? v[0] : (v == null ? 0x00 : v); }
  const ws = {
    readyState: 1, onmessage: null, trace,
    send(txt) {
      const m = JSON.parse(txt);
      trace.push(m);
      let rep;
      if (m.type === 'read' && m.awid === 4) {
        const busOn = (busAddr == null) ? true : (((regByte(busAddr) >> busBit) & 1) === 1);
        const off = (m.addr >>> 0) - 0x40010000;
        const d = [];
        for (let i = 0; i < m.len; i++) {
          const v = (busOn && off + i < lut.length) ? lut[off + i] : (busOn ? 0x00 : 0x00);
          d.push(v);
        }
        rep = { type: 'result', id: m.id, cmd: 'read', ok: true, status: 0, want: m.len, got: d.length, data: d };
      } else if (m.type === 'read') {
        let d = [];
        for (let i = 0; i < m.len; i++) {
          const src = regs[m.addr + i];
          d.push(Array.isArray(regs[m.addr]) ? (regs[m.addr][i] == null ? 0x00 : regs[m.addr][i])
                                             : (src == null ? 0x00 : src));
        }
        rep = { type: 'result', id: m.id, cmd: 'read', ok: true, status: 0, data: d };
      } else if (m.type === 'rawwrite') {
        if (Array.isArray(regs[m.addr])) regs[m.addr] = m.data.slice();
        else regs[m.addr] = m.data[0];
        rep = { type: 'result', id: m.id, cmd: 'rawwrite', ok: true, status: 0, transferred: m.data.length };
      } else if (m.type === 'ping') {
        rep = { type: 'pong', id: m.id, helper: '1.16.0', proto: 5 };
      } else {
        rep = { type: 'result', id: m.id, cmd: m.type, ok: true, status: 0, transferred: (m.data || []).length };
      }
      setTimeout(() => { if (ws.onmessage) ws.onmessage({ data: JSON.stringify(rep) }); }, 0);
    },
    close() { ws.readyState = 3; },
    reg: a => regByte(a)
  };
  return ws;
}

async function load(opts) {
  opts = opts || {};
  const dom = new JSDOM(inline('dg-selftest.html'), {
    url: 'https://example.invalid/dg-selftest.html', runScripts: 'dangerously', pretendToBeVisual: true
  });
  await sleep(140);
  const w = dom.window, P = w.dstProbe;
  if (opts.ws) {
    P.__attachFakeWs(opts.ws);
    P.setIcForTest(opts.ic || 'EM02A1', -1);
    /* 正式流程的 slave 由 dstScanIdentify() 掃出來；夾具直接指定 IC ⇒ 這裡補上。
       0x68 ＝ EM01/EM02 家族的暫存器 slave（§1.5）。 */
    P.setSlaveForTest(opts.slave == null ? 0x68 : opts.slave);
  }
  await sleep(20);
  return { dom, w, doc: w.document, P };
}

/* ═══════════════════════════════════════════════════════════════════════════
   🔴 dgself v1.11.0 加的前置檢查 —— 這支夾具目前**驗的是一個已經不存在的設計**
   ───────────────────────────────────────────────────────────────────────────
   本檔（v1.6.0）驗的是「把 SRAM 用 17 種候選排法各解一次、逐一評分讓使用者挑」。
   **v1.7.0 依 Bruce 裁示把那一整組移除**（CHANGELOG：「前提已經不成立…留著候選
   清單的實際效果是：畫面上同時擺 17 個已知是錯的選項」），解碼改成只有一條、
   直接照原廠源碼的排法走，並由 `dg_selftest_v170_probe.js` ／ `v171` ／ `v173` 接手。

   於是本檔用到的 12 個觀測點（lutEntryBits／lutCandidates／lutScore …）全部沒了，
   跑起來是 `TypeError: P.lutEntryBits is not a function` —— **自 v1.7.0 起就是紅的**，
   而那個 TypeError 看不出是「設計換掉了」還是「產品壞了」。

   🔴 這裡**不自行刪檔、也不改寫成 v1.7.x 的版本**：
      · 刪一支夾具是有永久性的決定，依本專案的規矩要 Bruce 裁示；
      · 改寫成 v1.7.x 版等於再寫一份 v170／v171 已經在驗的東西（兩份遲早分岔）。
   ⇒ 只做一件事：把失敗的**原因**講清楚，並且**仍然以非零狀態結束**
      （「檢查跑不起來不當作通過」是本專案既有原則，見 tools/hooks/pre-commit）。
   ═══════════════════════════════════════════════════════════════════════════ */
const OBSOLETE_HOOKS = ['lutEntryBits', 'lutEntries', 'lutMemSlave', 'lutSlaveDocd',
  'lutReadLen', 'lutUnpackUniform', 'lutUnpack16', 'lutCandidates', 'lutBits',
  'lutScore', 'lutBusList', 'lutCandRowCount'];

(async function main() {

  {
    const { P } = await load({});
    const gone = OBSOLETE_HOOKS.filter(k => typeof P[k] !== 'function');
    if (gone.length) {
      console.log('\n════════════════════════════════════════════════════════════════');
      console.log('🛑 本檔驗的是 dgself v1.6.0 的「候選排法 ＋ 評分讓使用者挑」設計。');
      console.log('   那一整組在 **v1.7.0 依 Bruce 裁示移除**（改成只有一條照原廠源碼的解碼路徑），');
      console.log('   接手的是 tools/dg_selftest_v170_probe.js / v171 / v173。');
      console.log('   已經不存在的觀測點：' + gone.join('、'));
      console.log('   ⇒ 這不是產品壞了，是這支夾具過期了。**要不要刪掉它請 Bruce 裁示**，');
      console.log('      在那之前它維持紅色（檢查跑不起來不當作通過）。');
      console.log('════════════════════════════════════════════════════════════════\n');
      process.exit(2);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ① 純函式：解包／identity／評分。**不碰 DOM、不碰 I2C。**
     ═══════════════════════════════════════════════════════════════════════ */
  H('① 解包與評分（純函式）');
  {
    const { P } = await load({});
    const E = 257, EB = 8, D = 12;
    const id = identity(E, EB, D);
    EQ(P.lutIdentity(E, EB, D).slice(0, 4), [0, 16, 32, 48], 'identity 前四筆 = 0,16,32,48（AN-DG p13）');
    EQ(P.lutIdentity(E, EB, D)[255], 4080, 'identity[255] = 4080');
    EQ(P.lutIdentity(E, EB, D)[256], 4095, 'identity[256] = 4095（末筆是 2^12−1，不是 4080）');
    EQ(P.lutIdentity(1025, 10, 12).slice(0, 3), [0, 4, 8], '10-bit entry 的 identity 是 0,4,8,…');

    EQ(P.lutEntryBits(0), 10, 'reg_dg_mode_sel 0 ⇒ 10-bit entry');
    EQ(P.lutEntryBits(2), 8, 'reg_dg_mode_sel 2 ⇒ 8-bit entry');
    EQ(P.lutEntryBits(4), 8, 'reg_dg_mode_sel 4 ⇒ 8-bit entry (VRR)');
    EQ(P.lutEntryBits(1), null, 'reg_dg_mode_sel 1 (mp only) ⇒ 不是 entry 寬度 ⇒ null，不硬塞 8');
    EQ(P.lutEntryBits(3), null, 'reg_dg_mode_sel 3 (ddg+mp) ⇒ null');
    EQ(P.lutEntries(8), 257, '8-bit entry ⇒ 257 筆（0…256）');
    EQ(P.lutEntries(10), 1025, '10-bit entry ⇒ 1025 筆');

    EQ(P.lutMemSlave(0x68), 0x58, '暫存器 slave 0x68 ⇒ 4-byte 記憶體 slave 0x58（§24.4 原表）');
    EQ(P.lutMemSlave(0x60), 0x50, '暫存器 slave 0x60 ⇒ 0x50（§24.4 原表）');
    EQ(P.lutMemSlave(0x69), 0x59, '0x69 ⇒ 0x59（同一個 −0x10，推導）');
    EQ(P.lutSlaveDocd(0x68), true, '0x68 在規格表裡 ⇒ docd');
    EQ(P.lutSlaveDocd(0x69), false, '0x69 不在規格表裡 ⇒ 標成推導，不假裝有出處');

    /* 讀取長度：要同時容得下 bit-packing 與「每筆 2 byte」兩種假設 */
    CHECK(P.lutReadLen(257, 12) >= 257 * 3 * 2, 'readLen 容得下 16-bit/筆 的假設', P.lutReadLen(257, 12));
    CHECK(P.lutReadLen(257, 12) >= Math.ceil(257 * 3 * 12 / 8), 'readLen 容得下 12-bit packing', P.lutReadLen(257, 12));

    /* ── 四種 uniform packing，逐一打包再解回來 ── */
    const combos = [
      ['planar', true], ['planar', false], ['inter', true], ['inter', false]
    ];
    for (const [layout, msb] of combos) {
      const bytes = (layout === 'planar' ? packPlanar : packInter)(id, id, id, D, msb);
      const got = P.lutUnpackUniform(bytes, E, D, msb, layout);
      CHECK(got !== null, `${layout}/${msb ? 'msb' : 'lsb'}：解得出完整一張表`);
      EQ(got && got.r, id, `${layout}/${msb ? 'msb' : 'lsb'}：R 逐筆等於 identity`);
      EQ(got && got.b, id, `${layout}/${msb ? 'msb' : 'lsb'}：B 逐筆等於 identity`);
    }

    /* ── 16-bit LE / BE ── */
    const le = [];
    for (const ch of [id, id, id]) for (const v of ch) { le.push(v & 0xFF, (v >> 8) & 0xFF); }
    EQ(P.lutUnpack16(le, E, true, 'planar').g, id, '16-bit LE planar 解得回 identity');
    const be = [];
    for (const ch of [id, id, id]) for (const v of ch) { be.push((v >> 8) & 0xFF, v & 0xFF); }
    EQ(P.lutUnpack16(be, E, false, 'planar').g, id, '16-bit BE planar 解得回 identity');

    /* ── 🔴 負向：identity 只能被「對的那一個」解成 100%，其餘必須低於 100% ── */
    /* 🔴 用產品端真正會讀的長度（readLen）來打包 —— 短了的話 16-bit 候選會因為
       「bytes 不夠」被丟掉，測出來的候選數就不是實際跑起來的那個數。 */
    const bytesRef = packPlanar(id, id, id, D, true);
    while (bytesRef.length < P.lutReadLen(E, D)) bytesRef.push(0x00);
    const cands = P.lutCandidates(bytesRef, E, EB, [D], 'target');
    CHECK(cands.length >= 8, `target 模式至少 8 個候選（4 種 bit-packing ＋ 4 種 16-bit）`, cands.length);
    EQ(cands[0].score.match, 1, '分數最高的候選吻合度 = 100%');
    CHECK(/12b\/msb\/planar/.test(cands[0].label), '最高分的就是 12b/msb/planar', cands[0].label);
    const others = cands.slice(1).filter(c => c.score.match >= 1);
    EQ(others.length, 0, '🔴 沒有第二個候選也拿到 100%（證明夾具不是「全部都對」的假過）');
    CHECK(cands.every(c => !/累加|Offset/.test(c.label)), 'target 模式不產生累加／Offset 候選');

    /* ── offset 模式：累加與 Offset 格式候選都要出現 ── */
    const co = P.lutCandidates(bytesRef, E, EB, [D], 'offset');
    CHECK(co.some(c => /累加/.test(c.label)), 'offset 模式會產生「累加」候選');
    CHECK(co.some(c => /^Offset/.test(c.label)), 'offset 模式會產生 AN-DG 的 Offset 格式候選');
    CHECK(co.every(c => !/^12b\/msb\/planar$/.test(c.label)), 'offset 模式不產生純絕對值候選');

    /* ── target 未知 ⇒ 兩邊都給 ── */
    const cu = P.lutCandidates(bytesRef, E, EB, [D], null);
    CHECK(cu.length > cands.length && cu.length > co.length, '型態未知 ⇒ 候選是兩者的聯集', cu.length);

    /* ── 深度未知 ⇒ 10 與 12 都試 ── */
    const cd = P.lutCandidates(bytesRef, E, EB, [12, 10], 'target');
    CHECK(cd.some(c => c.depth === 10) && cd.some(c => c.depth === 12), '深度未知 ⇒ 10 與 12 兩種都在候選裡');

    /* ── 退化判定 ── */
    EQ(P.lutDegenerate(new Array(64).fill(0x00)), 'allZero', '全 0x00 ⇒ allZero（AHB 視窗沒開）');
    EQ(P.lutDegenerate(new Array(64).fill(0xFF)), 'allFF', '全 0xFF ⇒ allFF（匯流排沒回應）');
    EQ(P.lutDegenerate(bytesRef), null, '真資料 ⇒ 不是退化');
    EQ(P.lutDegenerate([1, 2]), 'short', '太短 ⇒ short');

    /* ── 越界不補 0 ── */
    EQ(P.lutBits([0xFF], 0, 12, true), null, '🔴 位元越界回 null，不補 0（補 0 會讓「沒資料」長得像「值是 0」）');

    /* ── 評分的四個指標 ── */
    const s = P.lutScore({ r: id, g: id, b: id }, id, D);
    EQ(s.match, 1, 'score.match = 1');
    EQ(s.inRange, 1, 'score.inRange = 1');
    EQ(s.mono, 1, 'score.mono = 1');
    EQ(s.last, [4095, 4095, 4095], 'score.last 是三個通道的末筆');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ② bus-enable 候選：順序、出處旗標、可切換
     ═══════════════════════════════════════════════════════════════════════ */
  H('② bus-enable 候選（§27 #21 兩個都實作，依證據排序）');
  {
    const { P } = await load({});
    const tbl = P.icTable();
    const em01 = tbl.find(x => x.key === 'EM01A1');
    const em02 = tbl.find(x => x.key === 'EM02A1');
    CHECK(!!(em01 && em01.dgLut), 'EM01 有 dgLut 設定');
    CHECK(!!(em02 && em02.dgLut), 'EM02 有 dgLut 設定');
    EQ(em01.dgLut.busEn.length, 1, 'EM01 只有一個候選（三方對得上）');
    EQ([em01.dgLut.busEn[0].addr, em01.dgLut.busEn[0].bit], [0x00A0, 5], 'EM01 ＝ sys 0x00A0 bit5 reg_dgm_ahb_bus_en');
    EQ(em01.dgLut.busEn[0].docd, true, 'EM01 那個候選有出處');
    EQ(em01.dgLut.entryReg.addr, 0x1170, 'EM01 的 reg_dg_mode_sel ＝ dgm_top base 0x1160 + 0x10');

    EQ(em02.dgLut.busEn.length, 2, '🔴 EM02 兩個候選都實作（Bruce：不要挑一個）');
    EQ([em02.dgLut.busEn[0].addr, em02.dgLut.busEn[0].bit], [0x0001, 2],
       '🔴 自動模式先試有出處的 sys 0x0001 bit2（BANK-EM02 reg_dg_lut_bus_en）');
    EQ(em02.dgLut.busEn[0].docd, true, '0x0001 bit2 有出處');
    EQ([em02.dgLut.busEn[1].addr, em02.dgLut.busEn[1].bit], [0x00A0, 5], '第二候選 ＝ 與 EM01 同址的 0x00A0 bit5');
    EQ(em02.dgLut.busEn[1].docd, false,
       '🔴 0x00A0 標成無出處（EM02 的 sys 表最後一格是 h0087，根本沒有 h00A0）');
    EQ(em02.dgLut.entryReg, null, 'EM02 沒有 reg_dg_mode_sel ⇒ entryReg 為 null，不猜');

    /* 下拉切換：指定某一個候選 ⇒ 只剩那一個 */
    P.setIcForTest('EM02A1', -1);
    EQ(P.lutBusList(em02, 'auto').length, 2, 'auto ⇒ 兩個候選都在清單裡');
    EQ(P.lutBusList(em02, 'busEm02').map(b => b.addr), [0x0001], '指定 busEm02 ⇒ 只走 0x0001');
    EQ(P.lutBusList(em02, 'busEm01a0').map(b => b.addr), [0x00A0], '指定 busEm01a0 ⇒ 只走 0x00A0');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ③ 端到端：EM02，第一候選就讀得到 identity
     ═══════════════════════════════════════════════════════════════════════ */
  H('③ 端到端讀取（EM02，0x0001 bit2 命中）');
  {
    const E = 257, D = 12, id = identity(E, 8, D);
    const lut = packPlanar(id, id, id, D, true);
    /* 0x005D：bit0=1 DG 開、bit2=1 深度 12-bit、bit3=1 Target */
    const ws = makeBridge({ regs: { 0x005D: 0x0D, 0x0001: 0x00 }, lut, busAddr: 0x0001, busBit: 2 });
    const { P, doc } = await load({ ws, ic: 'EM02A1' });
    await P.readDgLut();
    await sleep(20);

    const st = P.lutState();
    CHECK(!!st, '讀取成功（lutState 不是 null）');
    EQ(P.lutErr(), null, '沒有錯誤');
    EQ(st.busKey, 'busEm02', '🔴 走的是有出處的那個候選');
    EQ(st.entryBits, 8, 'EM02 讀不到 entry 寬度 ⇒ 預設 8');
    EQ(st.entryFrom, 'default', '而且如實標成 default，不冒充成讀到的');
    EQ(st.depths, [12], '深度讀自 0x005D bit2');
    EQ(st.target, 'target', '型態讀自 0x005D bit3');
    EQ(st.bestMatch, 1, '🔴 最佳候選與 identity 100% 吻合');
    CHECK(/12b\/msb\/planar/.test(st.bestLabel), '最佳候選 = 12b/msb/planar', st.bestLabel);

    /* 畫面 */
    EQ(P.lutHidden('dst-lut-body'), false, '成功後曲線區塊出現');
    CHECK((P.lutChartHtml() || '').indexOf('<svg') === 0, '曲線是真的畫出來的 SVG');
    CHECK((P.lutChartHtml().match(/<path /g) || []).length === 3, 'R/G/B 三條線都畫了');
    EQ(P.lutRowCount(), 257, '數值表 257 列');
    CHECK(P.lutCandRowCount() >= 8, '候選分數表列出所有候選', P.lutCandRowCount());
    EQ(doc.getElementById('dst-lut-det').hasAttribute('open'), false, '🔴 數值表預設收起來（不要一進頁面被 257 列洗版）');
    EQ(P.lutHidden('dst-lut-warn'), true, '吻合度 100% ⇒ 不掛「未定案」黃字');
    CHECK(/100\.0%/.test(P.lutText('dst-lut-fit')), '吻合度那一列印出 100.0%', P.lutText('dst-lut-fit'));

    /* 🔴 bus-enable 一定要關回去 */
    EQ((ws.reg(0x0001) >> 2) & 1, 0, '🔴 讀完 bus-enable 那一位被清回去了');
    const raws = ws.trace.filter(m => m.type === 'rawwrite' && m.addr === 0x0001);
    EQ(raws.length, 2, 'bus-enable 只寫了兩筆（設起來、清回去）');
    EQ(raws[0].data, [0x04], '第一筆把 bit2 設起來');
    EQ(raws[1].data, [0x00], '第二筆把 bit2 清掉');
    CHECK(raws.every(m => m.awid === 2), 'bus-enable 用 awid 2');

    /* 🔴 AHB 讀取的參數 */
    const ahb = ws.trace.filter(m => m.type === 'read' && m.awid === 4);
    CHECK(ahb.length > 0, 'AHB 讀取真的發出去了', ahb.length);
    EQ(P.currentSlave(), 0x68, '暫存器 slave 是 0x68');
    EQ(ahb[0].slave, 0x58, '🔴 AHB 走 4-byte 記憶體 slave 0x58（＝暫存器 slave − 0x10，不是暫存器 slave）');
    EQ(ahb[0].addr, 0x40010000, '起始位址 0x40010000');
    CHECK(ahb.every(m => m.len <= P.lutConst().chunk), '每一段不超過分段上限');
    EQ(ahb[1] && ahb[1].addr, 0x40010000 + P.lutConst().chunk, '第二段的位址明確遞增（不靠隱式循序讀）');

    /* 🔴 刻意不連動 DG 第 1 部分 */
    EQ(P.dgLutWired(), null, '🔴 dstDgLut 仍是 null —— 連動 DG 第 1 部分這一輪刻意不做');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ④ 自動退到第二候選（第一候選讀回全 0）
     ═══════════════════════════════════════════════════════════════════════ */
  H('④ 自動嘗試：第一候選讀不到 ⇒ 退到第二候選');
  {
    const E = 257, D = 12, id = identity(E, 8, D);
    const lut = packPlanar(id, id, id, D, true);
    /* 這一台的 AHB 視窗只認 0x00A0 bit5 —— 0x0001 bit2 設了也讀回全 0 */
    const ws = makeBridge({ regs: { 0x005D: 0x0D, 0x0001: 0x00, 0x00A0: 0x00 }, lut, busAddr: 0x00A0, busBit: 5 });
    const { P } = await load({ ws, ic: 'EM02A1' });
    await P.readDgLut();
    await sleep(20);
    const st = P.lutState();
    CHECK(!!st, '最後還是讀到了');
    EQ(st.busKey, 'busEm01a0', '🔴 自動退到第二候選 —— 哪個對是由讀回來的資料決定的');
    EQ(st.bestMatch, 1, '解出來仍是 identity');
    EQ((ws.reg(0x0001) >> 2) & 1, 0, '第一候選（失敗的那個）也被清回去了');
    EQ((ws.reg(0x00A0) >> 5) & 1, 0, '第二候選用完也清回去了');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ⑤ 失敗路徑：一定講在哪一步，而且不畫曲線
     ═══════════════════════════════════════════════════════════════════════ */
  H('⑤ 失敗路徑（🔴 不准畫一條猜出來的曲線）');
  {
    /* (a) 兩個候選都讀回全 0 */
    const ws = makeBridge({ regs: { 0x005D: 0x0D }, lut: [], busAddr: null });
    const { P } = await load({ ws, ic: 'EM02A1' });
    await P.readDgLut();
    await sleep(20);
    EQ(P.lutState(), null, '讀不到 ⇒ 沒有結果');
    EQ(P.lutErr().stepKey, 'dst.lutErrRead', '🔴 失敗鍵指向「每個候選都沒讀到資料」');
    CHECK(/allZero/.test(P.lutErr().detail), '細節裡講出是 allZero（AHB 視窗沒開）', P.lutErr().detail);
    EQ(P.lutHidden('dst-lut-body'), true, '🔴 失敗 ⇒ 曲線區塊整個不出現');
    CHECK((P.lutText('dst-say-lut') || '').length > 10, '說話行有寫出原因', P.lutText('dst-say-lut'));
  }
  {
    /* (b) 沒連線 */
    const { P } = await load({});
    await P.readDgLut();
    await sleep(20);
    EQ(P.lutErr().stepKey, 'dst.lutErrLink', '沒連線 ⇒ dst.lutErrLink');
    EQ(P.lutState(), null, '沒讀任何東西');
  }
  {
    /* (c) 這一顆沒有 dgLut 設定（E512AX） */
    const ws = makeBridge({ regs: { 0x002F: 0x01 } });
    const { P } = await load({ ws, ic: 'E512AX' });
    await P.readDgLut();
    await sleep(20);
    EQ(P.lutErr().stepKey, 'dst.lutErrNoCfg', '🔴 沒有出處的顆 ⇒ 明講查不到位址，不拿 EM01 的位址去試');
    EQ(P.lutState(), null, '沒讀任何東西');
    const ahb = ws.trace.filter(m => m.awid === 4);
    EQ(ahb.length, 0, '🔴 一個 AHB 讀取都沒發出去');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ⑥ 吻合度低：曲線照畫，但**明講未定案**
     ═══════════════════════════════════════════════════════════════════════ */
  H('⑥ 吻合度低 ⇒ 不宣稱成功，也不假裝讀不到');
  {
    const E = 257, D = 12;
    /* 一張明顯非 identity 的表（gamma 2.2 之類）—— 任何 packing 都不會 100% */
    const curve = [];
    for (let i = 0; i < E; i++) curve.push(Math.min(4095, Math.round(Math.pow(i / 256, 2.2) * 4080)));
    const lut = packPlanar(curve, curve, curve, D, true);
    const ws = makeBridge({ regs: { 0x005D: 0x0D, 0x0001: 0x00 }, lut, busAddr: 0x0001, busBit: 2 });
    const { P } = await load({ ws, ic: 'EM02A1' });
    await P.readDgLut();
    await sleep(20);
    const st = P.lutState();
    CHECK(!!st, '讀取本身成功');
    CHECK(st.bestMatch < 1, '吻合度不是 100%', st.bestMatch);
    EQ(P.lutHidden('dst-lut-body'), false, '曲線照畫（那是真的 bytes 解出來的）');
    EQ(P.lutHidden('dst-lut-warn'), false, '🔴 掛上「未定案」的黃字');
    const wtxt = P.lutText('dst-lut-warn');
    CHECK(/DG_EN/.test(wtxt), '🔴 黃字裡點名 DG_EN 關閉不會讓 LUT 變 identity', wtxt.slice(0, 40));
    CHECK(/①/.test(wtxt) && /②/.test(wtxt), '🔴 兩種可能都寫出來（解錯 vs 本來就非 identity）');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ⑦ EM01：entry 寬度讀自 reg_dg_mode_sel
     ═══════════════════════════════════════════════════════════════════════ */
  H('⑦ EM01：entry 寬度是讀出來的');
  {
    const E = 257, D = 12, id = identity(E, 8, D);
    const lut = packPlanar(id, id, id, D, true);
    /* 0x1160：bit0=1 DG 開、bit1=1 深度 12、bit2=1 Target；0x1170 bits[6:4]=2 ⇒ 8-bit entry */
    const ws = makeBridge({ regs: { 0xFF00: [0x01, 0xEF, 0xA0], 0x1160: 0x07, 0x1170: 0x20, 0x00A0: 0x00 },
                            lut, busAddr: 0x00A0, busBit: 5 });
    const { P } = await load({ ws, ic: 'EM01A1' });
    await P.readDgLut();
    await sleep(20);
    const st = P.lutState();
    CHECK(!!st, 'EM01 讀取成功');
    EQ(st.busKey, 'em01a0', 'EM01 走 sys 0x00A0 bit5');
    EQ(st.modeSel, 2, 'reg_dg_mode_sel 讀到 2');
    EQ(st.entryBits, 8, '⇒ 8-bit entry');
    EQ(st.entryFrom, 'read', '🔴 標成「讀自 IC」，與 EM02 的 default 分得出來');
    EQ(st.entries, 257, '257 筆');
    EQ(st.bestMatch, 1, '解出 identity');
    EQ((ws.reg(0x00A0) >> 5) & 1, 0, 'bus-enable 清回去了');
  }
  {
    /* 10-bit entry：reg_dg_mode_sel = 0 ⇒ 1025 筆 */
    const E = 1025, D = 12, id = identity(E, 10, D);
    const lut = packPlanar(id, id, id, D, true);
    const ws = makeBridge({ regs: { 0xFF00: [0x01, 0xEF, 0xA0], 0x1160: 0x07, 0x1170: 0x00, 0x00A0: 0x00 },
                            lut, busAddr: 0x00A0, busBit: 5 });
    const { P } = await load({ ws, ic: 'EM01A1' });
    await P.readDgLut();
    await sleep(20);
    const st = P.lutState();
    CHECK(!!st, '10-bit entry 也讀得到');
    EQ(st.entryBits, 10, 'reg_dg_mode_sel 0 ⇒ 10-bit entry');
    EQ(st.entries, 1025, '1025 筆');
    EQ(st.bestMatch, 1, '解出 10-bit entry 的 identity（0,4,8,…）');
    EQ(P.lutRowCount(), 1025, '數值表 1025 列');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ⑧ 「開始掃描」變灰的原因
     ═══════════════════════════════════════════════════════════════════════ */
  H('⑧ 開始掃描：灰掉講原因、可按時一個字都沒有');
  {
    /* 沒連 I2C、沒連儀器 */
    const { P, doc } = await load({});
    EQ(P.runWhyKey(), 'dst.whyNoI2c', '沒連 I2C ⇒ 先講 I2C');
    CHECK((P.runWhyText() || '').indexOf('I2C') >= 0, '畫面上印出來了', P.runWhyText());
    EQ(doc.getElementById('dst-run').disabled, true, '鈕確實是灰的');
  }
  {
    const ws = makeBridge({ regs: { 0x005D: 0x00 } });
    const { P, doc } = await load({ ws, ic: 'EM02A1' });
    P.__renderBtns();
    EQ(P.runWhyKey(), 'dst.whyNoMeter', '連了 I2C 但沒儀器 ⇒ 講儀器');
    EQ(doc.getElementById('dst-run').disabled, true, '鈕還是灰的');
    /* 掛上假儀器 ⇒ 可按 ⇒ 一個字都不出現 */
    P.__attachFakeMeter(cmd => (/^MES/.test(cmd) ? 'OK00,P1,0,0.3127,0.3290,123.456' : 'OK'));
    P.__renderBtns();
    EQ(P.runWhyKey(), null, '🔴 可按 ⇒ 沒有原因');
    EQ(P.runWhyText(), '', '🔴 可按 ⇒ 畫面上一個字都不出現');
    EQ(doc.getElementById('dst-run').disabled, false, '鈕可以按了');
    /* 正在跑 */
    P.__setRunning(true); P.__renderBtns();
    EQ(P.runWhyKey(), 'dst.whyRunning', '正在跑 ⇒ 講正在跑');
    P.__setRunning(false); P.__renderBtns();
    EQ(P.runWhyKey(), null, '停下來 ⇒ 又沒有原因了');
  }
  {
    /* 🔴 對位畫面這一維**不得**出現在原因裡（v1.5.0 實測它與可按性無關） */
    const ws = makeBridge({ regs: { 0x005D: 0x00 } });
    const { P } = await load({ ws, ic: 'EM02A1' });
    P.__attachFakeMeter(cmd => 'OK');
    P.__renderBtns();
    const before = P.runWhyKey();
    EQ(before, null, '對位關著時可按');
    const src = fs.readFileSync(path.join(repo, 'dg-selftest.html'), 'utf8');
    const fn = src.slice(src.indexOf('function dstRunWhyKey'), src.indexOf('function dstRenderBtns'));
    CHECK(!/dstShowing|dstInPattern|align/i.test(fn),
      '🔴 dstRunWhyKey 的函式本體裡沒有任何對位／出圖的旗標（與 disabled 同一組條件）');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ⑨ i18n：新增的 key 三語齊全、沒有漏
     ═══════════════════════════════════════════════════════════════════════ */
  H('⑨ i18n 三語');
  {
    const src = fs.readFileSync(path.join(repo, 'common/i18n.js'), 'utf8');
    const keys = ['dst.hdLut', 'dst.lutNote', 'dst.btnLutRead', 'dst.lutBusAuto', 'dst.lutBusBlind',
      'dst.lutKvState', 'dst.lutKvCfg', 'dst.lutKvBus', 'dst.lutKvFit', 'dst.lutBusy', 'dst.lutFailed',
      'dst.lutOk', 'dst.lutCfgDepth', 'dst.lutCfgEntry', 'dst.lutEntryRead', 'dst.lutEntryDefault',
      'dst.lutTargetUnknown', 'dst.lutFitParts', 'dst.lutFitLow', 'dst.lutLbPick', 'dst.lutTblSum',
      'dst.lutCandSum', 'dst.lutThIdx', 'dst.lutThPack', 'dst.lutThFit', 'dst.lutThRange', 'dst.lutThMono',
      'dst.lutThLast', 'dst.lutErrLink', 'dst.lutErrNoIc', 'dst.lutErrNoCfg', 'dst.lutErrRead',
      'dst.lutErrDecode', 'dst.lutErrStep', 'dst.whyRunning', 'dst.whyNoI2c', 'dst.whyNoMeter'];
    let bad = [];
    for (const k of keys) {
      const i = src.indexOf("'" + k + "'");
      if (i < 0) { bad.push(k + ':missing'); continue; }
      const row = src.slice(i, src.indexOf('\n', src.indexOf('},', i)));
      for (const lang of ['zh-TW', 'en', 'zh-CN']) if (row.indexOf("'" + lang + "'") < 0) bad.push(k + ':' + lang);
    }
    EQ(bad, [], `新增的 ${keys.length} 個 key 三語全部齊全`);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ⑩ 🔴 突變測試：把產品端解包的 bit 序寫反，第 ① 組必須變紅
     ═══════════════════════════════════════════════════════════════════════ */
  H('⑩ 突變測試（證明夾具真的在驗東西）');
  {
    const src = fs.readFileSync(path.join(repo, 'dg-selftest.html'), 'utf8');
    const orig = 'v = (v << 1) | ((b >> (7 - (p & 7))) & 1);';
    CHECK(src.indexOf(orig) > 0, '找得到要突變的那一行');
    const mutated = src.replace(orig, 'v = (v << 1) | ((b >> (p & 7)) & 1);');
    const dom = new JSDOM(mutated.replace(/<script src="([^"]+)"><\/script>/g, (m, s2) => {
      const f = path.join(repo, s2.split('?')[0]);
      return fs.existsSync(f) ? '<script>\n' + fs.readFileSync(f, 'utf8') + '\n</script>' : '<script></script>';
    }), { url: 'https://example.invalid/x.html', runScripts: 'dangerously', pretendToBeVisual: true });
    await sleep(140);
    const P = dom.window.dstProbe;
    const E = 257, D = 12, id = identity(E, 8, D);
    const bytes = packPlanar(id, id, id, D, true);
    const got = P.lutUnpackUniform(bytes, E, D, true, 'planar');
    CHECK(JSON.stringify(got.r) !== JSON.stringify(id), '🔴 把 msb 那一行改壞 ⇒ 解出來就對不上 identity（夾具不是假過）');
  }

  console.log('\n' + '═'.repeat(64));
  console.log('  pass ' + pass + '   fail ' + fail);
  console.log('═'.repeat(64));
  process.exit(fail ? 1 : 0);
})();
