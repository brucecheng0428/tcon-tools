/* ═══════════════════════════════════════════════════════════════════════════
   dg_selftest_v150_probe.js — dgself v1.5.0 的驗收夾具（jsdom）

   Bruce 2026-09-21 的三件：
     ① 對位畫面開著時「開始掃描」被擋 —— 🔴 **重現不出來**，這一組把「對位這一維
        對 `dst-run.disabled` 沒有影響」與「按下掃描會自動離開對位再掃」釘住，
        讓下一次回報同樣症狀時有東西可以對照（真正的原因在別處）。
     ② IC 識別卡片的 `DG` → `DG_EN`（三語）。
     ③ 量測表格 sticky-to-bottom 的**三個狀態轉換**。

   🔴 jsdom 沒有 layout ⇒ `scrollHeight`／`clientHeight` 恆為 0，直接測一定假過。
      這裡在元素實例上自建一組**有真實語意**的捲動幾何：scrollTop 會被夾在
      [0, scrollHeight − clientHeight]，寫入會發 scroll 事件 —— 與瀏覽器一致。
      這是「讓驗證成立」，不是「讓驗證通過」：把產品那一行拿掉，第 ③ 組會紅。

   用法：node tools/dg_selftest_v150_probe.js
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
function makeFakeWs(readMap) {
  const map = Object.assign({}, readMap);
  const ws = {
    readyState: 1, onmessage: null,
    send(txt) {
      const m = JSON.parse(txt);
      let rep;
      if (m.type === 'read') {
        let d = (map[m.addr] || []).slice();
        if (d.length > m.len) d = d.slice(0, m.len);
        while (d.length < m.len) d.push(0x00);
        rep = { type: 'result', id: m.id, cmd: 'read', ok: true, status: 0, data: d };
      } else if (m.type === 'rawwrite') {
        map[m.addr] = m.data.slice();
        rep = { type: 'result', id: m.id, cmd: 'rawwrite', ok: true, status: 0, transferred: m.data.length };
      } else if (m.type === 'ping') {
        rep = { type: 'pong', id: m.id, helper: '1.16.0', proto: 5 };
      } else {
        rep = { type: 'result', id: m.id, cmd: m.type, ok: true, status: 0,
                transferred: (m.data || []).length };
      }
      setTimeout(() => { if (ws.onmessage) ws.onmessage({ data: JSON.stringify(rep) }); }, 0);
    },
    close() { ws.readyState = 3; }
  };
  return ws;
}
const MES_OK = 'OK00,P1,0,0.3127,0.3290,123.456';
const meter = cmd => (/^MES/.test(cmd) ? MES_OK : (/^MVS/.test(cmd) ? 'OK,60.00' : 'OK'));

async function load(opts) {
  opts = opts || {};
  const dom = new JSDOM(inline('dg-selftest.html'), {
    url: 'https://example.invalid/dg-selftest.html', runScripts: 'dangerously', pretendToBeVisual: true
  });
  await sleep(140);
  const w = dom.window, P = w.dstProbe;
  if (opts.i2c !== false) {
    P.__attachFakeWs(makeFakeWs({ 0xFF00: [0x02, 0xEF, 0xA0], 0x0000: [0x61, 0x41, 0xB4], 0x005D: [0x00] }));
    P.setIcForTest('EM02A1', -1);
  }
  if (opts.ca !== false) P.__attachFakeMeter(meter);
  /* 🔴 修復（dgself v1.11.0）：一定要重畫一次。
     `__attachFakeMeter()` 自己會呼叫 dstRenderBtns，所以 `ca !== false` 的路徑
     「剛好」是對的；而 `ca:false` 那條路**完全沒有重畫**，讀到的按鈕狀態是
     頁面剛載入（什麼都沒連）時留下來的 —— 於是「儀器沒連 ⇒ 鈕是灰的」在舊版
     裡是**因為沒重畫才綠的**，不是因為產品判對了。那是假綠。
     ⇒ 一律重畫，讓兩條路讀到的都是真的狀態。（與 v1.10.1 夾具同一個做法。） */
  if (P.__renderBtns) P.__renderBtns();
  await sleep(20);
  return { dom, w, doc: w.document, P };
}

/* 在元素實例上裝一組有真實語意的捲動幾何（見檔頭說明）。 */
function fitScroll(win, el, rowH, viewH) {
  let top = 0;
  Object.defineProperty(el, 'clientHeight', { get: () => viewH, configurable: true });
  Object.defineProperty(el, 'scrollHeight', {
    get: () => el.querySelectorAll('tbody tr').length * rowH, configurable: true });
  Object.defineProperty(el, 'scrollTop', {
    get: () => top,
    set: v => {
      const max = Math.max(0, el.scrollHeight - el.clientHeight);
      const nv = Math.max(0, Math.min(max, Number(v) || 0));
      if (nv === top) return;
      top = nv;
      el.dispatchEvent(new win.Event('scroll'));
    },
    configurable: true
  });
  return { max: () => Math.max(0, el.scrollHeight - el.clientHeight) };
}

(async function main() {

  /* ═══ ① 對位畫面與「開始掃描」════════════════════════════════════════════ */
  H('① 對位畫面這一維對「開始掃描」沒有影響（根因不在這裡）');
  {
    const rows = [];
    for (const o of [{ i2c: true, ca: true, align: false }, { i2c: true, ca: true, align: true },
                     { i2c: true, ca: false, align: false }, { i2c: true, ca: false, align: true }]) {
      const { doc, P } = await load({ i2c: o.i2c, ca: o.ca });
      if (o.align) { await P.alignToggle(); await sleep(60); }
      /* ═══ 🔴 修復（dgself v1.11.0）：這一段自 v1.10.1 起就是**爆掉**的 ═══════════
         原因：`#dst-run`（「開始掃描」那一顆獨立按鈕）在 v1.10.1 依 Bruce 裁示
         **整顆移除**，量測改由步驟卡 ②③ 那一顆兩段式的鈕（`#dst-go-gray`）發動。
         這支還在對一個不存在的元素取 `.disabled` ⇒ `TypeError` ⇒ **整支中斷**，
         第 ②③ 組一條都沒跑到。不是本輪改出來的，但留著就是一支假死的夾具。
         🔴 驗的事情沒有變：**對位這一維不影響「能不能開始量」**。 */
      rows.push({ ca: o.ca, align: o.align,
                  disabled: doc.getElementById('dst-go-gray').disabled, showing: P.showing() });
    }
    EQ(rows[1].showing, 'align', '前置：對位畫面真的進去了');
    EQ(rows[3].showing, 'align', '前置：CA 未連時對位畫面也進得去');
    CHECK(rows[0].disabled === rows[1].disabled,
      '🔴 儀器連著：對位開／關 ⇒ ②③ 那顆鈕的 disabled **相同**', [rows[0].disabled, rows[1].disabled]);
    CHECK(rows[2].disabled === rows[3].disabled,
      '🔴 儀器未連：對位開／關 ⇒ ②③ 那顆鈕的 disabled **相同**', [rows[2].disabled, rows[3].disabled]);
    CHECK(rows[0].disabled === false, '儀器連著 ⇒ 可按', rows[0].disabled);
    /* ═══ 🔴 v1.14.0：這一條**翻面了**（產品的刻意改動，不是夾具遷就）═══════════
       v1.10.1～v1.13.0 那顆鈕是兩段式的，第一段只是出對位畫面 —— 用不到量測儀，
       所以未連時第一段照樣可按。v1.14.0 兩段式取消（「畫面測試」卡在 v1.13.0 搬到
       步驟卡正上方，第一段變成同一件事的第二顆鈕，Bruce 2026-09-22 裁示直接開始量）
       ⇒ 那顆鈕現在**每一次按都是真的開始量** ⇒ 沒接量測儀就該是灰的。
       🔴 這是**收緊**：原本「未連也可按」，現在「未連一律不可按」。 */
    CHECK(rows[2].disabled === true,
      '🔴 儀器未連 ⇒ 那顆鈕是灰的（它現在按下去就直接開始量）', rows[2].disabled);
  }
  H('① 沒接量測儀 ⇒「開始量測」一進來就是灰的');
  {
    const { doc, P } = await load({ ca: false });
    EQ(P.realignExists(), false, '前置：「重新對位」那顆鈕已整顆移除（v1.14.0）');
    CHECK(doc.getElementById('dst-go-gray').disabled === true,
      '🔴 真正讓它變灰的是「儀器沒連」，而且**不必先按任何東西**（v1.14.0 起）',
      doc.getElementById('dst-go-gray').disabled);
    EQ(P.runWhyKey(), 'dst.whyNoMeter', '🔴 而且畫面上講得出原因：沒有量測儀');
  }
  H('① 按下「開始量測」會自動離開對位畫面再掃（v1.3.0 起就在做）');
  {
    const { doc, P } = await load({});
    doc.getElementById('dst-settle').value = '300';
    await P.alignToggle(); await sleep(60);       // 對位走「畫面測試」卡那顆切換鈕
    EQ(P.showing(), 'align', '前置：對位畫面開著');
    P.goGrayClick();                              // 🔴 v1.14.0：按**一次**就真的開始量
    await sleep(300);
    EQ(P.showing(), null, '🔴 按下去之後對位畫面**自動關掉**（dstRun 開頭的離開序列）');
    CHECK(/1\/256/.test(P.progText() || ''), '🔴 而且掃描真的跑起來了', P.progText());
    EQ(P.sayRun(), '', '沒有任何錯誤訊息擋住他');
  }

  /* ═══ ② DG → DG_EN ════════════════════════════════════════════════════ */
  H('② IC 識別卡片的標籤是 DG_EN（三語）');
  {
    const I18N = fs.readFileSync(path.join(repo, 'common/i18n.js'), 'utf8');
    const m = /'dst\.kvDg':\s*\{([^}]*)\}/.exec(I18N);
    CHECK(!!m, 'i18n 有 dst.kvDg');
    ['zh-TW', 'en', 'zh-CN'].forEach(lg => {
      const mm = new RegExp("'" + lg + "':\\s*'([^']*)'").exec(m[1]);
      EQ(mm && mm[1], 'DG_EN', '  ' + lg + ' ＝ DG_EN');
    });
    for (const lg of ['zh-TW', 'en', 'zh-CN']) {
      const { doc, w } = await load({});
      const sel = doc.getElementById('lang-select');
      if (sel) { sel.value = lg; sel.dispatchEvent(new w.Event('change', { bubbles: true })); await sleep(30); }
      const el = doc.querySelector('[data-i18n="dst.kvDg"]');
      EQ(el && el.textContent.trim(), 'DG_EN', '  畫面上（' + lg + '）渲染出來就是 DG_EN');
    }
  }

  /* ═══ ③ 量測表格 sticky-to-bottom ═════════════════════════════════════ */
  H('③ 量測表格：三個狀態轉換');
  {
    const { w, doc, P } = await load({});
    const wrap = doc.getElementById('dst-res-wrap');
    const ROW = 24, VIEW = 260;
    const geo = fitScroll(w, wrap, ROW, VIEW);
    EQ(P.stickEps(), 0.5, '容差 ＝ 0.5（出處 dg-measure.html:5520／:5526，不是拍的）');

    function addRows(n, from) {
      const cur = [];
      for (let i = 0; i < (from || 0) + n; i++)
        cur.push({ key: 'L' + i, idx: i, x: 0.3127, y: 0.329, lv: 100 });
      P.__setRowsForTest(cur);
      P.renderRows();
    }

    /* 狀態 1：量測中、沒動捲軸 ⇒ 每加一列都自動到底 */
    P.__setRunning(true);
    addRows(30);
    EQ(P.rowStick(), true, '1. 起手是跟著最新一列');
    EQ(wrap.scrollTop, geo.max(), '🔴 1. 量測中加列 ⇒ 自動捲到最底');
    addRows(10, 30);
    EQ(wrap.scrollTop, geo.max(), '🔴 1. 再加 10 列 ⇒ 仍然停在最底（跟著走）');

    /* 狀態 2：使用者往上滾 ⇒ 立刻停止自動捲 */
    wrap.scrollTop = geo.max() - 100;
    EQ(P.rowStick(), false, '🔴 2. 往上滾 ⇒ 停止自動捲');
    const held = wrap.scrollTop;
    addRows(10, 40);
    EQ(wrap.scrollTop, held, '🔴 2. 又加了 10 列，**畫面一動也不動**（不把他拉走）');

    /* 狀態 3：自己滾回最底 ⇒ 恢復自動捲 */
    wrap.scrollTop = geo.max();
    EQ(P.rowStick(), true, '🔴 3. 自己滾回最底 ⇒ 恢復自動捲');
    addRows(10, 50);
    EQ(wrap.scrollTop, geo.max(), '🔴 3. 再加列 ⇒ 又開始跟著走');

    /* 容差：差 0.4px 仍算在底部；差 5px 就不算 */
    wrap.scrollTop = geo.max() - 0.4;
    EQ(P.rowStick(), true, '容差內（0.4 < 0.5）仍算在底部');
    wrap.scrollTop = geo.max() - 5;
    EQ(P.rowStick(), false, '差 5px ⇒ 不算在底部（反面）');

    /* 狀態 4：停止量測 ⇒ 停止自動捲 */
    wrap.scrollTop = geo.max();
    EQ(P.rowStick(), true, '前置：回到底部');
    P.__setRunning(false);
    wrap.scrollTop = geo.max() - 80;
    const parked = wrap.scrollTop;
    addRows(10, 60);
    EQ(wrap.scrollTop, parked, '🔴 4. 停止量測後即使表格重繪也不自動捲');
  }

  console.log('\n' + '═'.repeat(64));
  if (fail) { console.log('🔴 ' + fail + ' / ' + (pass + fail) + ' 項未通過'); process.exit(1); }
  console.log('✅ 全部通過：' + pass + ' 項');
  console.log('🔴 沒驗到：真瀏覽器的實際捲動（jsdom 沒有 layout，幾何是夾具自建的）、');
  console.log('   真治具／真 TCON／真量測儀，以及①「被擋住」那個症狀本身（重現不出來）。');
  process.exit(0);
})().catch(e => { console.error('🔴 probe 本身爆掉：', e); process.exit(2); });
