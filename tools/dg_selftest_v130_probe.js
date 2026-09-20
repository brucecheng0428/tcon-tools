/* ═══════════════════════════════════════════════════════════════════════════
   dg_selftest_v130_probe.js — dgself v1.3.0 的驗收夾具（jsdom）
   ───────────────────────────────────────────────────────────────────────────
   驗 Bruce 2026-09-20 第二輪交辦的六項（總原則：「流程越簡單越好，按的次數越少
   越好」；判準：他按的鈕字面就是那個動作 ⇒ 不要再跳確認）：

     ① 開始掃描**不跳任何確認視窗**（window.confirm 一次都不准被呼叫）
     ② 「離開出圖模式」鈕移除；按「開始掃描」時**離開序列照送**（逐筆對位址）
     ③ 對位畫面 ＝ **一顆切換鈕**：按一下出 L127 ＋ 中心十字，再按一次回到原本狀態
     ④ 整張卡所有有狀態的鈕都有**選取態**
     ⑤ 8/10/12-bit：鈕上顯示 255／1023／4095，而**送進 IC 的值不跟著改**
     ⑥ 匯出 CSV 整顆移除（含死碼）

   🔴 這一支只驗得到**邏輯與 DOM**。真的治具、真的 TCON、真的量測儀、真瀏覽器的
      版面與配色驗不到 —— 另附截圖（tools/dg_selftest_v130_shots.sh）。

   用法：node tools/dg_selftest_v130_probe.js
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
const hex = a => '0x' + ('000' + a.toString(16).toUpperCase()).slice(-4);

function inline(file) {
  let html = fs.readFileSync(path.join(repo, file), 'utf8');
  return html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
    const f = path.join(repo, src.split('?')[0]);
    if (!fs.existsSync(f)) return '<script>/* missing ' + src + ' */</script>';
    return '<script>\n' + fs.readFileSync(f, 'utf8') + '\n</script>';
  });
}
const ORIGIN = 'https://example.invalid';

/* 假的 I2C Bridge：做法沿用既有兩支夾具，不另寫一套。
   🔴 `writes` 是逐筆的寫入紀錄 —— 第 ② 項要靠它證明離開序列真的送出去了。 */
function makeFakeWs(readMap) {
  const wires = [], writes = [];
  const ws = {
    readyState: 1, onmessage: null, sent: wires, writes,
    send(txt) {
      const m = JSON.parse(txt);
      wires.push(m);
      let rep;
      if (m.type === 'read') {
        const key = (readMap && readMap[m.slave] && readMap[m.slave][m.addr])
          || (readMap && readMap[m.addr]);
        let data = key ? key.slice() : new Array(m.len).fill(0x00);
        if (data.length > m.len) data = data.slice(0, m.len);
        while (data.length < m.len) data.push(0x00);
        rep = { type: 'result', id: m.id, cmd: 'read', ok: true, status: 0, data };
      } else if (m.type === 'write') {
        writes.push({ addr: m.addr, data: m.data.slice() });
        rep = { type: 'result', id: m.id, cmd: 'write', ok: true, status: 0, transferred: m.data.length };
      } else if (m.type === 'ping') {
        rep = { type: 'pong', id: m.id, helper: '1.16.0', proto: 5 };
      } else {
        rep = { type: 'result', id: m.id, cmd: m.type, ok: true };
      }
      setTimeout(() => { if (ws.onmessage) ws.onmessage({ data: JSON.stringify(rep) }); }, 0);
    },
    close() { ws.readyState = 3; }
  };
  return ws;
}

async function load(qs) {
  const dom = new JSDOM(inline('dg-selftest.html'), {
    url: ORIGIN + '/dg-selftest.html' + (qs || ''), runScripts: 'dangerously', pretendToBeVisual: true
  });
  await sleep(120);
  /* 🔴 不是「補一個 confirm 讓流程過得去」，是**抓有沒有人呼叫它**。
     v1.3.0 的產品路徑一次都不該呼叫。 */
  dom.window.__confirmCalls = [];
  Object.defineProperty(dom.window, 'confirm', {
    value: (msg) => { dom.window.__confirmCalls.push(String(msg)); return true; },
    configurable: true
  });
  return dom;
}

const MES_OK = 'OK00,P1,0,0.3127,0.3290,123.456';
function meter(mesFn) {
  return cmd => {
    if (/^MES/.test(cmd)) return mesFn ? mesFn() : MES_OK;
    if (/^MVS/.test(cmd)) return 'OK,60.00';
    return 'OK';
  };
}
/* 連得上、認得出 EM02A1、儀器掛著的一頁。 */
async function armed(opts) {
  opts = opts || {};
  const dom = await load(opts.qs);
  const w = dom.window, P = w.dstProbe;
  const ws = makeFakeWs({ 0xFF00: [0x02, 0xEF, 0xA0], 0x0000: [0x61, 0x41, 0xB4] });
  P.__attachFakeWs(ws);
  P.setIcForTest(opts.ic || 'EM02A1', -1);
  P.__attachFakeMeter(meter(opts.mes));
  w.document.getElementById('dst-settle').value = '300';
  if (opts.bits) P.setBits(opts.bits);
  return { dom, w, P, ws };
}

(async function main() {

  const SRC = fs.readFileSync(path.join(repo, 'dg-selftest.html'), 'utf8');
  const I18N = fs.readFileSync(path.join(repo, 'common/i18n.js'), 'utf8');
  /* 註解裡寫「為什麼拿掉」是刻意的 ⇒ 比對前先把註解剝掉，驗的是**程式碼**。 */
  const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const CODE = strip(SRC), I18NCODE = strip(I18N);

  /* ═══ ① 開始掃描不跳確認 ═══════════════════════════════════════════════ */
  H('1. 按「開始掃描」不跳任何確認視窗');
  {
    CHECK(!/window\.confirm/.test(CODE), '產品程式碼裡一個 window.confirm 都沒有');
    CHECK(!/'dst\.confirmRun'|'dst\.confirmAligned'/.test(I18NCODE),
      'i18n 的 dst.confirmRun／dst.confirmAligned 兩個 key 已刪除');
    CHECK(!/dst\.confirmRun|dst\.confirmAligned/.test(CODE), '頁面也不再引用那兩個 key');

    const { w, P } = await armed({ qs: '?mode=prim' });
    await P.run();
    console.log('    整輪掃描期間 window.confirm 被呼叫：' + w.__confirmCalls.length + ' 次');
    CHECK(w.__confirmCalls.length === 0, '整輪跑完，confirm 一次都沒被呼叫', w.__confirmCalls);
    CHECK(P.rows().length === 3, '而且掃描真的跑完了（prim 三階）', P.rows().length);
    CHECK(P.runOk() === true, 'dstRunOk = true');
  }

  /* ═══ ② 離開出圖模式：鈕沒了，序列照送 ══════════════════════════════════ */
  H('2. 「離開出圖模式」鈕移除；開始掃描時離開序列照送');
  {
    const { w, P, ws } = await armed({ qs: '?mode=prim' });
    CHECK(w.document.getElementById('dst-leave') === null, '#dst-leave 這顆鈕不存在了');
    CHECK(w.document.getElementById('dst-cross-on') === null, '#dst-cross-on 也不存在了');
    CHECK(w.document.getElementById('dst-cross-off') === null, '#dst-cross-off 也不存在了');
    CHECK(!/'dst\.btnLeave'|'dst\.btnCrossOn'|'dst\.btnCrossOff'/.test(I18NCODE),
      'i18n 的三個 key 也刪了（不留死字串）');

    /* 先用對位鈕進出圖模式（＝使用者擺探頭的那一步），再按開始掃描。 */
    await P.alignToggle();
    CHECK(P.showing() === 'align', '對位畫面已開啟');
    const n0 = ws.writes.length;
    await P.run();

    const seq = ws.writes.slice(n0);
    const txt = seq.map(x => hex(x.addr) + ' <- ' + x.data.map(v => ('0' + v.toString(16).toUpperCase()).slice(-2)).join(' '));
    console.log('    按下「開始掃描」之後送出去的前 8 筆：');
    txt.slice(0, 8).forEach(s => console.log('      ' + s));

    /* EM02A1 的離開序列 ＝ ① 0x0C00 寫回進入前的原值（假 bridge 的原值是 0x00）
                            ② SetCursorOFF：0xFF20 → reg & 0xFD
       接著才是新一輪的進入序列（0x0C00 ←(0&0xB3)|0x4C = 0x4C）。 */
    CHECK(seq[0] && seq[0].addr === 0x0C00 && seq[0].data[0] === 0x00,
      '第 1 筆 ＝ 0x0C00 寫回進入前的原值（SetAgingMode(false)）', txt[0]);
    CHECK(seq[1] && seq[1].addr === 0xFF20,
      '第 2 筆 ＝ 0xFF20（SetCursorOFF，十字關掉）', txt[1]);
    const enterAt = seq.findIndex(x => x.addr === 0x0C00 && x.data[0] === 0x4C);
    CHECK(enterAt > 1, '離開之後才重新進出圖模式（0x0C00 ← 0x4C）', enterAt);
    CHECK(P.showing() === null, '掃描開始後對位鈕不再是選取態（已離開那張畫面）', P.showing());

    /* 反面：沒進過出圖模式就按掃描 ⇒ 不送離開序列（不對沒動過的暫存器寫東西）。 */
    const b = await armed({ qs: '?mode=prim' });
    const m0 = b.ws.writes.length;
    await b.P.run();
    const first = b.ws.writes[m0];
    console.log('    沒進過出圖模式時的第 1 筆：' + hex(first.addr) + ' <- ' + first.data[0]);
    CHECK(first.addr === 0x0C00 && first.data[0] === 0x4C,
      '沒進過出圖模式 ⇒ 第 1 筆直接是「進入」，沒有多送一次離開', first.data[0]);
  }

  /* ═══ ③ 對位畫面 ＝ 一顆切換鈕 ═════════════════════════════════════════ */
  H('3. 對位畫面切換鈕：按一下出圖，再按一次回到原本狀態');
  {
    const { w, P, ws } = await armed();
    const btn = w.document.getElementById('dst-align');
    CHECK(P.showing() === null && btn.getAttribute('aria-pressed') === 'false',
      '一開始是未選取');

    const a0 = ws.writes.length;
    await P.alignToggle();
    const on = ws.writes.slice(a0);
    console.log('    第一次按（開）送出去的序列：');
    on.forEach(x => console.log('      ' + hex(x.addr) + ' <- '
      + x.data.map(v => ('0' + v.toString(16).toUpperCase()).slice(-2)).join(' ')));
    CHECK(on.some(x => x.addr === 0x0C00 && x.data[0] === 0x4C), '① 進出圖模式（0x0C00 ← 0x4C）');
    CHECK(on.some(x => x.addr === 0x0C01 && x.data[0] === 58), '② pattern 58（Edge）');
    /* L127 ＝ 12-bit 2032 ⇒ 五個 byte：F0 07 7F 07… 依 dstPackRgb12(2032,2032,2032) */
    const want = P.packRgb12(2032, 2032, 2032);
    CHECK(on.some(x => x.addr === 0x0C39 && JSON.stringify(x.data) === JSON.stringify(want)),
      '③ L127（12-bit 2032）寫進 inside（0x0C39）', want);
    CHECK(on.some(x => x.addr === 0xFF22 && x.data.length === 4),
      '④ 十字座標寫 0xFF22 四個 byte');
    const pos = on.filter(x => x.addr === 0xFF22).pop();
    EQ(pos.data, P.packXY(960, 540), '   …座標 ＝ 1920x1080 的正中心 (960,540)');
    CHECK(P.showing() === 'align' && btn.getAttribute('aria-pressed') === 'true'
      && btn.classList.contains('on'), '按下之後是選取態（aria-pressed ＋ .on）');
    console.log('    按下之後的鈕面文字：' + JSON.stringify(btn.textContent));
    CHECK(/開啟中/.test(btn.textContent), '鈕面文字也看得出是開著的');

    const b0 = ws.writes.length;
    await P.alignToggle();
    const off = ws.writes.slice(b0);
    console.log('    第二次按（關）送出去的序列：');
    off.forEach(x => console.log('      ' + hex(x.addr) + ' <- '
      + x.data.map(v => ('0' + v.toString(16).toUpperCase()).slice(-2)).join(' ')));
    CHECK(off.length === 2, '離開序列就是兩筆（還原 ＋ SetCursorOFF）', off.length);
    CHECK(off[0].addr === 0x0C00 && off[0].data[0] === 0x00,
      '① 0x0C00 寫回進入前的原值 ⇒ 面板回到原本的畫面', off[0].data[0]);
    CHECK(off[1].addr === 0xFF20, '② SetCursorOFF（十字收掉）');
    CHECK(P.showing() === null && btn.getAttribute('aria-pressed') === 'false'
      && !btn.classList.contains('on'), '再按一次之後回到未選取態');
    console.log('    再按之後的鈕面文字：' + JSON.stringify(btn.textContent));
    CHECK(/對位畫面/.test(btn.textContent) && !/開啟中/.test(btn.textContent),
      '鈕面文字換回「對位畫面（L127 ＋ 中心十字）」');
  }

  /* ═══ ④ 整張卡的選取態 ═════════════════════════════════════════════════ */
  H('4. 有狀態的鈕都有選取態（逐顆檢查）');
  {
    const { w, P } = await armed();
    const ids = ['dst-q-w', 'dst-q-r', 'dst-q-g', 'dst-q-b', 'dst-align'];
    for (const [id, key] of [['dst-q-w', 'w'], ['dst-q-r', 'r'], ['dst-q-g', 'g'], ['dst-q-b', 'b']]) {
      /* 🔴 按之前先等鈕不是 disabled —— 上一筆寫入還在飛的時候整排鈕是灰的
         （dstGuard 的 dstBusy，v1.0.0 就有的行為），這時候 click() 什麼都不會發生。
         這是夾具要配合產品的時序，不是放寬斷言。 */
      for (let i = 0; i < 100 && w.document.getElementById(id).disabled; i++) await sleep(20);
      w.document.getElementById(id).click();
      await sleep(30);
      const st = P.pickLabels();
      console.log('    按 ' + id + ' ⇒ ' + JSON.stringify(st.map(x => x.id + (x.on ? '[選取]' : ''))));
      CHECK(P.showing() === key, id + ' 按下 ⇒ showing=' + key, P.showing());
      st.forEach(x => CHECK(x.on === (x.id === id),
        '   …只有 ' + id + ' 亮著（' + x.id + ' on=' + x.on + '）'));
      CHECK(st.find(x => x.id === id).pressed === 'true', '   …aria-pressed=true');
    }
    /* 拉霸一動，選取態要收掉（畫面已經不是那顆鈕打出來的東西了）。 */
    const sl = w.document.getElementById('dst-sl-r');
    sl.value = '10';
    sl.dispatchEvent(new w.Event('input', { bubbles: true }));
    await sleep(30);
    console.log('    拉動 R 拉霸之後：' + JSON.stringify(P.pickLabels().map(x => x.on)));
    CHECK(P.showing() === null, '拉霸一動 ⇒ 沒有任何一顆是選取態', P.showing());
    CHECK(P.pickLabels().every(x => !x.on), '   …五顆鈕全部不亮');

    /* 兩個既有的開關（I2C 連線、儀器連線）本來就有選取態，一併確認沒被弄壞。 */
    CHECK(w.document.getElementById('dst-link').getAttribute('aria-pressed') === 'true',
      'I2C 連線開關：連上了 ⇒ aria-pressed=true');
    CHECK(w.document.getElementById('dst-ca').getAttribute('aria-pressed') === 'true',
      '量測儀開關：連上了 ⇒ aria-pressed=true');
    /* 其餘的鈕都是**瞬時動作**，沒有狀態可言 —— 逐顆列出來，證明是查過的不是漏的。 */
    console.log('    無狀態（瞬時動作）的鈕：dst-probe／dst-run／dst-stop／dst-xlsx／'
      + 'dst-log-copy／dst-log-clear／dst-fail-retry／dst-fail-abort');
    CHECK(ids.length === 5, '有狀態的鈕共 5 顆（四顆色鈕 ＋ 對位切換鈕）');
  }

  /* ═══ ⑤ 顯示值 vs 送出值 ═══════════════════════════════════════════════ */
  H('5. 8/10/12-bit：顯示滿刻度，送出的值不跟著改');
  {
    CHECK(!/'dst\.kvSend'/.test(I18NCODE), 'i18n 的 dst.kvSend 已刪除');
    CHECK(!/dst-v-send/.test(CODE), '頁面程式碼不再寫 #dst-v-send');
    CHECK(SRC.indexOf('id="dst-v-send"') < 0, '「送進 IC 的 12-bit 值」那一列已從畫面移除');

    const table = [];
    for (const bits of [8, 10, 12]) {
      const { w, P, ws } = await armed({ bits });
      const labels = P.pickLabels();
      const n0 = ws.writes.length;
      w.document.getElementById('dst-q-w').click();
      await sleep(60);
      /* 送出去的那一筆 ＝ inside（EM02A1 是 0x0C39）的五個 byte。 */
      const paint = ws.writes.slice(n0).filter(x => x.addr === 0x0C39).pop();
      const r12 = paint.data[0] | ((paint.data[1] & 0x0F) << 8);
      table.push({ bits, 鈕面: labels[0].text, 送進IC的12bit值: r12,
                   換算: P.userMax(bits) + ' × ' + P.scale(bits) });
      CHECK(labels[0].text === '白 ' + P.userMax(bits),
        bits + '-bit：白鈕的字是「白 ' + P.userMax(bits) + '」', labels[0].text);
      CHECK(r12 === P.to12(P.userMax(bits), bits),
        '   …而送出去的是 ' + P.to12(P.userMax(bits), bits) + '（依 dstTo12，沒有被顯示值帶著跑）', r12);
      const note = w.document.getElementById('dst-bits-note').textContent;
      console.log('    ' + bits + '-bit 說明行：' + JSON.stringify(note));
      CHECK(!/12-bit/.test(note), '   …說明行裡沒有 12-bit 字樣', note);
    }
    console.log('\n    顯示值 vs 送出值對照（兩者刻意不相等，見 dstRenderPick 的註解）：');
    console.table ? console.table(table) : console.log(JSON.stringify(table, null, 2));
    CHECK(table[0].送進IC的12bit值 === 4080 && table[1].送進IC的12bit值 === 4092
      && table[2].送進IC的12bit值 === 4095,
      '三種深度送出去的值分別是 4080／4092／4095（與 v1.2.0 一字未改）',
      table.map(x => x.送進IC的12bit值));
  }

  /* ═══ ⑥ 匯出 CSV 移除 ══════════════════════════════════════════════════ */
  H('6. 匯出 CSV 整顆移除（含死碼）');
  {
    const { w, P } = await armed();
    CHECK(w.document.getElementById('dst-csv') === null, '#dst-csv 這顆鈕不存在');
    CHECK(typeof P.csvText === 'undefined', 'dstProbe.csvText 已移除');
    CHECK(typeof P.exportCsv === 'undefined', 'dstProbe.exportCsv 已移除');
    CHECK(!/dstCsvText|dstExportCsv/.test(CODE), '程式碼裡沒有 dstCsvText／dstExportCsv（死碼已清）');
    CHECK(!/'dst\.btnCsv'/.test(I18NCODE), 'i18n 的 dst.btnCsv 已刪除');
    CHECK(/dstXlsxBytes/.test(CODE), '（對照）XLSX 那一條還在');
    /* 版面（24 欄）一字未動 —— 這一批不准碰它。 */
    EQ(P.exportHeader(), ['Gray', 'W_x', 'W_y', 'W_Y', 'W_T', 'W_duv',
      'R_x', 'R_y', 'R_Y', 'G_x', 'G_y', 'G_Y', 'B_x', 'B_y', 'B_Y',
      'C_x', 'C_y', 'C_Y', 'M_x', 'M_y', 'M_Y', 'Y_x', 'Y_y', 'Y_Y'],
      'XLSX 的 24 欄表頭與 v1.2.0 完全相同（這一批沒動匯出版面）');
  }

  /* ═══ 卡片改名與定位說明 ═══════════════════════════════════════════════ */
  H('7. 卡片改名「畫面測試」＋ 一行定位說明');
  {
    const { w } = await armed();
    const hd = Array.prototype.map.call(w.document.querySelectorAll('.card-header'),
      e => e.textContent.trim());
    console.log('    四張卡的標題：' + JSON.stringify(hd));
    CHECK(hd.some(t => /畫面測試/.test(t)), '卡片標題是「畫面測試」');
    CHECK(!hd.some(t => /^🎚️?出圖$/.test(t)), '沒有叫「出圖」的卡片了');
    const note = w.document.querySelector('[data-i18n="dst.testNote"]').textContent;
    console.log('    定位說明：' + JSON.stringify(note));
    CHECK(/量測前/.test(note), '講了是「量測前」的事');
    CHECK(/不會影響/.test(note), '講了不會影響實際量測');
    CHECK(/擺好位置|對位/.test(note), '講了對位是給量測儀擺位用');
    CHECK(note.length <= 80, '一句話就好（≤80 字，版面精簡）', note.length);
  }

  /* ═══ ⑦ 垂直同步頻率（MVS）══════════════════════════════════════════════ */
  H('9a. MVS 判讀：四種回覆各判對（純函式）');
  {
    const { P } = await armed();
    EQ(P.parseMvs('OK00,120.00'), { state: 'ok', code: 'OK00', hz: 120 },
      'OK00 ⇒ 量到了，頻率取第 2 欄');
    EQ(P.parseMvs('OK02,60.00'), { state: 'ok', code: 'OK02', hz: 60 },
      'OK02（溫度變化大）⇒ 值仍然有效');
    /* 🔴 這兩條是這一項的重點：回來的數字是**我們自己送進去的設計值**。 */
    EQ(P.parseMvs('OK08,60.00'), { state: 'noperiod', code: 'OK08' },
      'OK08 ⇒ 沒有週期性，回的是我們的猜測值 ⇒ 不可當量測值');
    EQ(P.parseMvs('OK10,240.00'), { state: 'noperiod', code: 'OK10' },
      'OK10 ⇒ 同上');
    CHECK(P.parseMvs('OK08,60.00').hz === undefined,
      '   …而且它根本不回 hz（下游想用也拿不到）', P.parseMvs('OK08,60.00').hz);
    /* 🔴 ER20 的回覆多一欄：Error code,P[Probe No.],[1] */
    EQ(P.parseMvs('ER20,P1,119.88'), { state: 'range', code: 'ER20', hz: 119.88 },
      'ER20 ⇒ 頻率取**第 3 欄**（第 2 欄是探頭編號）');
    CHECK(P.parseMvs('ER20,P1,119.88').hz !== 1,
      '   …不會把探頭編號 P1 當成頻率', P.parseMvs('ER20,P1,119.88').hz);
    EQ(P.parseMvs('ER22'), { state: 'err', code: 'ER22' }, '其他錯誤碼 ⇒ err');
    EQ(P.parseMvs('OK64,7.4'), { state: 'err', code: 'OK64' }, '沒把握的 OK 碼也不採信 ⇒ err');
    EQ(P.parseMvs(null), { state: 'none' }, '逾時 ⇒ none');
    const guesses = P.hzGuesses();
    console.log('    猜測清單：' + JSON.stringify(guesses));
    CHECK(guesses.length === 10 && guesses[0] === 60, '猜測清單沿用 v1.2.0（10 個常見更新率）');
  }

  for (const [name, reply, want] of [
    /* 🔴 只有猜到 120 時才量得到（其餘回 OK08 ＝ 找不到週期性），而且量到的是
       **119.98**，不是我們送進去的 120.00 —— 兩者長得不一樣，才分得出畫面上那個
       數字到底是量到的還是猜的。 */
    ['OK00（真的量到）', g => (g === 120 ? 'OK00,119.98' : 'OK08,' + g.toFixed(2)), /119\.98 Hz/],
    ['OK08（找不到週期性，回我們的猜測值）', g => 'OK08,' + g.toFixed(2), /未偵測到/],
    ['OK10（同上）', g => 'OK10,' + g.toFixed(2), /未偵測到/],
    ['ER20（量到但超出 ±2 Hz）', () => 'ER20,P1,119.88', /119\.88 Hz.*超出設計值/],
    ['逾時', () => null, /未偵測到/]
  ]) {
    H('9b. 掃描時的顯示：' + name);
    const { w, P } = await armed({
      qs: '?mode=prim',
      // MES 一律正常；MVS 依這一輪的劇本回
      mes: () => MES_OK
    });
    /* armed() 只接得住 MES，MVS 要另外掛 —— 直接換一支假儀器。 */
    P.__attachFakeMeter(cmd => {
      const m = /^MVS,([\d.]+)/.exec(cmd);
      if (m) return reply(parseFloat(m[1]));
      if (/^MES/.test(cmd)) return MES_OK;
      return 'OK';
    });
    await P.run();
    const txt = P.hzText();
    console.log('    畫面上那一列：' + JSON.stringify(txt) + '   （標灰＝' + P.hzIsNa() + '）');
    CHECK(want.test(txt), '顯示正確', txt);
    /* 🔴 這一條是總閘門：猜測清單裡的任何一個數字都不准出現在畫面上
       （除非它真的是量到的 —— 第一種劇本刻意回 119.98 而不是 120.00 就是為了
       讓「量到的」與「猜的」長得不一樣，分得出來）。 */
    const leaked = P.hzGuesses().filter(g => txt.indexOf(g.toFixed(2)) >= 0);
    CHECK(leaked.length === 0, '畫面上沒有出現任何一個猜測值（' + JSON.stringify(leaked) + '）', txt);
    if (/未偵測到/.test(txt)) {
      CHECK(!/\d+\.\d\d Hz/.test(txt), '   …量不到時一個數字都不顯示', txt);
      CHECK(P.hzIsNa() === true, '   …而且那一列是標灰的（不是正常值）');
    }
  }

  /* ═══ 三語 ═══════════════════════════════════════════════════════════════ */
  H('8. 新增／改動的 i18n key 三語齊備');
  {
    function entry(key) {
      const i = I18N.indexOf("'" + key + "':");
      return i < 0 ? '' : I18N.slice(i, i + 1200).split('\n  \'')[0];
    }
    ['dst.hdTest', 'dst.testNote', 'dst.btnAlign', 'dst.btnAlignOn', 'dst.alignNote',
     'dst.bitsNote', 'dst.pgLeave', 'dst.abortedAt', 'dst.btnQw', 'dst.btnQr',
     'dst.btnQg', 'dst.btnQb',
     'dst.kvHz', 'dst.hzOk', 'dst.hzRange', 'dst.hzNone'].forEach(k => {
      const e = entry(k);
      CHECK(!!e, k + ' 存在');
      ['zh-TW', 'zh-CN', 'en'].forEach(L =>
        CHECK(e.indexOf("'" + L + "'") >= 0, '   ' + k + ' 有 ' + L));
    });
    /* 切語言之後，JS 填的字（四顆色鈕、對位鈕）要跟著換，而且數字不能被洗掉。 */
    const { w, P } = await armed({ bits: 10 });
    for (const lang of ['en', 'zh-CN', 'zh-TW']) {
      const sel = w.document.getElementById('lang-select');
      sel.value = lang;
      sel.dispatchEvent(new w.Event('change', { bubbles: true }));
      await sleep(40);
      const L = P.pickLabels();
      console.log('    ' + lang + '：' + JSON.stringify(L.map(x => x.text)));
      CHECK(L[0].text.indexOf('1023') >= 0, lang + '：白鈕仍帶著 1023（切語言沒把數字洗掉）', L[0].text);
      CHECK(!/^dst\./.test(L[4].text), lang + '：對位鈕不是未翻譯的 key', L[4].text);
    }
  }

  console.log('\n' + '═'.repeat(60));
  if (fail) { console.log('🛑 失敗 ' + fail + ' 項（通過 ' + pass + ' 項）'); process.exit(1); }
  console.log('✅ 全過：' + pass + ' 項');
  console.log('🔴 這支驗不到的：真的治具、真的 TCON、真的量測儀、真瀏覽器的版面與配色（另附截圖）。');
})().catch(e => { console.error(e); process.exit(2); });
