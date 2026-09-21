/* ═══════════════════════════════════════════════════════════════════════════
   dg_selftest_v173_probe.js — dgself v1.7.3 的驗收夾具（jsdom）

   Bruce 2026-09-21 從真機截圖回報的兩條 bug。

   ═══ Bug 1：連線按鈕與「開始掃描」的閘門互相矛盾 ═══════════════════════════
   截圖：那顆鈕是綠色的「儀器已連線」，正下方卻寫「還不能開始：光學量測儀尚未連線」，
   而「開始掃描」是灰的。
   🔴 **根因與他當下的判讀相反**（讀碼＋本夾具第 ② 組實測）：
      `dstCaLinked = true` 一直都只寫在 requestPort() ＋ open() 都成功之後，
      catch 從來沒有碰它 ⇒ 使用者取消選埠時鈕**沒有**變綠。
      真正壞的是：`dstCaOpen()`／`dstCaClose()` 只叫 `dstRenderCa()`（那顆鈕的字與
      顏色），而「開始掃描」的 disabled 與它下面那行原因寫在 `dstRenderBtns()` 裡
      ⇒ **鈕更新了、閘門那兩處是舊的**。
      log 裡「open failed 之後又出現 serial opened」也不是失敗路徑走到成功的記錄點
      （兩行在同一個 try/catch 的兩側，`return true` 之後到不了 catch）——
      那是按了兩次：第一次取消、第二次選了埠。第 ② 組把這一點釘住。

   ═══ Bug 2：`{detail}` 佔位符直接露在畫面上 ═══════════════════════════════
   截圖：`讀取中斷：{detail}  [I2C Bridge 逾時未回復（read）]`
   根因：`dstT(dstLutErr.stepKey)` 沒有帶第二個參數，`t()` 只在有 vars 時才替換。
   🔴 這一支是**七個** key 的唯一出口（lutErrNoSpec／Bus／Data／Depth／Mode／
      ModeNotDg／Step），模板全部含 `{detail}` ⇒ 七條訊息都在漏，不只他踩到那一條。
      第 ③ 組逐條驗，而且驗「字串裡不得出現 `{`」這個**不必列舉 key** 的判準。

   ═══ 🔴 怎麼避免「自己驗自己」════════════════════════════════════════════
     · 期望字串在本檔自己組（從 I18N 的模板自己替換一次），不呼叫產品的組字函式。
     · 第 ④ 組是突變測試：把兩個修正各改回原本的寫法，對應的斷言必須變紅。

   🔴 **沒驗到的**：真的 COM port、真的量測儀、真瀏覽器的 Web Serial 權限視窗。
      這裡是把 `navigator.serial` 換成假的（jsdom 根本沒有這個 API），驗的是
      「失敗／成功之後，畫面三處說的是不是同一件事」。

   用法：node tools/dg_selftest_v173_probe.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const repo = path.join(__dirname, '..');
let pass = 0, fail = 0;
function CHECK(cond, msg, got) {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg + (got === undefined ? '' : '   got=' + JSON.stringify(got))); }
}
function EQ(a, b, msg) { CHECK(JSON.stringify(a) === JSON.stringify(b), msg, a); }
function H(n) { console.log('\n── ' + n + ' ' + '─'.repeat(Math.max(0, 58 - n.length))); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

function inlineSrc(html) {
  return html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
    const f = path.join(repo, src.split('?')[0]);
    if (!fs.existsSync(f)) return '<script>/* missing ' + src + ' */</script>';
    return '<script>\n' + fs.readFileSync(f, 'utf8') + '\n</script>';
  });
}
const SRC = fs.readFileSync(path.join(repo, 'dg-selftest.html'), 'utf8');
const ORIGIN = 'https://example.invalid';

async function load(opts) {
  opts = opts || {};
  const errs = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errs.push(String(e.message)));
  const dom = new JSDOM(inlineSrc(opts.src || SRC), {
    url: ORIGIN + '/dg-selftest.html', runScripts: 'dangerously',
    pretendToBeVisual: true, virtualConsole: vc
  });
  await sleep(150);
  const w = dom.window, P = w.dstProbe;
  if (opts.ws) {
    P.__attachFakeWs(opts.ws);
    P.setIcForTest(opts.ic || 'EM01A1', -1);
    P.setSlaveForTest(opts.slave == null ? 0x68 : opts.slave);
    P.__renderBtns();
  }
  await sleep(20);
  return { dom, w, doc: w.document, P, errs };
}

/* ═══ 假的 I2C Bridge（只要「連上了」這件事，不必真的讀寫）════════════════ */
function makeBridge(regs) {
  regs = regs || {};
  const ws = {
    readyState: 1, onmessage: null,
    send(txt) {
      const m = JSON.parse(txt);
      let rep;
      if (m.type === 'read') {
        const d = [];
        for (let i = 0; i < m.len; i++) {
          const src = regs[m.addr + i];
          d.push(Array.isArray(regs[m.addr]) ? (regs[m.addr][i] == null ? 0 : regs[m.addr][i])
                                             : (src == null ? 0 : src));
        }
        rep = { type: 'result', id: m.id, cmd: 'read', ok: true, status: 0, data: d };
      } else if (m.type === 'ping') {
        rep = { type: 'pong', id: m.id, helper: '1.16.0', proto: 5 };
      } else {
        rep = { type: 'result', id: m.id, cmd: m.type, ok: true, status: 0, transferred: 1 };
      }
      setTimeout(() => { if (ws.onmessage) ws.onmessage({ data: JSON.stringify(rep) }); }, 0);
    },
    close() { ws.readyState = 3; }
  };
  return ws;
}
const EM01_REGS = { 0xFF00: [0x01, 0xEF, 0xA0], 0x1160: 0x05, 0x00A0: 0x00, 0x1170: 0x5A };

/* ═══ 假的 Web Serial ═════════════════════════════════════════════════════
   `mode`：
     'cancel'      requestPort 丟例外（＝ 使用者按取消，Bruce 踩到的那一次）
     'ok'          一切成功
     'halfOpen'    port.open() 成功、getWriter() 才丟出來（半開的埠）
   🔴 假的只到「瀏覽器 API」這一層，`dstCaOpen()` 本身是產品那一支。 */
function fakeSerial(mode) {
  const st = { opened: 0, closed: 0, requested: 0 };
  function makePort() {
    return {
      open: async () => { st.opened++; },
      close: async () => { st.closed++; },
      get writable() {
        if (mode === 'halfOpen') throw new Error('writable not available');
        return { getWriter: () => ({ write: async () => {}, releaseLock: () => {} }) };
      },
      get readable() {
        return { getReader: () => ({ read: () => new Promise(() => {}), cancel: async () => {},
                                     releaseLock: () => {} }) };
      }
    };
  }
  return {
    st,
    api: {
      getPorts: async () => [],
      requestPort: async () => {
        st.requested++;
        if (mode === 'cancel') {
          throw new Error("Failed to execute 'requestPort' on 'Serial': No port selected by the user.");
        }
        return makePort();
      }
    }
  };
}
function attachSerial(w, mode) {
  const f = fakeSerial(mode);
  Object.defineProperty(w.navigator, 'serial', { value: f.api, configurable: true });
  return f;
}


/* ═══ 🔴 dgself v1.10.1 改判：本檔原本用 `#dst-run`（「開始掃描」）當「閘門有沒有
   擋住」的觀測點，而那一顆依 Bruce 2026-09-21 裁示**整顆移除**了（量測只留步驟卡
   那一顆兩段式鈕）。
   刪改原因不是為了讓測試變綠：本檔驗的是「鈕、閘門、畫面上那行原因三處一致」，
   這件事一個字都沒變 —— **只是承接那道閘門的鈕換了一顆**。
   現在擋「沒接量測儀」的是步驟卡那顆的**第二段**，所以先走一次對位（第一段不需要
   量測儀）進到第二段，再看它是不是灰的。 */
async function armGray(P) { await P.stepAlign(); await sleep(20); }
function grayDisabled(doc) {
  const e = doc.getElementById('dst-go-gray');
  return e ? e.disabled : null;
}
/* 🔴 「連上之後閘門有沒有跟著重畫」這件事，**必須先進第二段、再連儀器**再讀 ——
   反過來做的話 `stepAlign()` 自己就會重畫一次，把「忘了重畫」這個缺陷蓋掉
   （第 ④ 組的突變 1 當場抓到這一點：先連再 arm 會讓那個突變變成綠的）。 */
async function armedGrayDisabled(P, doc) { await armGray(P); return grayDisabled(doc); }

(async function main() {

  /* ═══════════════════════════════════════════════════════════════════════
     ① 前置：三處說的必須是同一件事（未連線時）
     ═══════════════════════════════════════════════════════════════════════ */
  H('① 未連線時三處一致');
  {
    const { P, doc } = await load({ ws: makeBridge(EM01_REGS), ic: 'EM01A1' });
    EQ(P.caLinked(), false, '前置條件：儀器沒連');
    EQ(P.caPressed(), 'false', '那顆鈕的 aria-pressed ＝ false');
    EQ(P.runWhyKey(), 'dst.whyNoMeter', '閘門的原因是「沒有儀器」');
    EQ(await armedGrayDisabled(P, doc), true, '🔴 步驟卡那顆的第二段「開始量測」是灰的');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ② 🔴 Bug 1：open 失敗（使用者取消選埠）之後
     ═══════════════════════════════════════════════════════════════════════ */
  H('② 🔴 Bug 1：open 失敗後的狀態');
  {
    const { w, P, doc } = await load({ ws: makeBridge(EM01_REGS), ic: 'EM01A1' });
    const f = attachSerial(w, 'cancel');
    const ok = await P.caOpen();
    await sleep(30);
    CHECK(ok === false, 'dstCaOpen() 回傳 false');
    EQ(f.st.requested, 1, '前置條件：真的走到 requestPort 了');
    /* 🔴 這四條就是 Bruce 要的「open 失敗後按鈕狀態必須是未連線」 */
    EQ(P.caLinked(), false, '🔴 失敗後 dstCaLinked 是 false');
    EQ(P.caPressed(), 'false', '🔴 失敗後那顆鈕的 aria-pressed 回到 false（不是綠的）');
    CHECK((P.caText() || '').indexOf('未連線') >= 0,
      '🔴 失敗後鈕上的字是「儀器未連線」', P.caText());
    /* 🔴 而且閘門與鈕說的是同一件事（這才是截圖裡矛盾的那一半） */
    EQ(P.runWhyKey(), 'dst.whyNoMeter', '🔴 閘門仍說「沒有儀器」—— 與鈕一致');
    EQ(await armedGrayDisabled(P, doc), true, '🔴 第二段「開始量測」仍是灰的');
    /* 🔴 log：失敗那一次**不可以**出現 serial opened */
    const log = doc.getElementById('dst-log').textContent || '';
    CHECK(log.indexOf('serial open failed') >= 0, 'log 有記下 open failed');
    CHECK(log.indexOf('serial opened') < 0,
      '🔴 失敗那一次**沒有**印 serial opened（截圖裡那一行是第二次按才出現的）',
      log.slice(-160));
  }
  {
    /* 半開的埠：open() 成功、getWriter() 才丟 ⇒ catch 必須把埠收掉 */
    const { w, P } = await load({ ws: makeBridge(EM01_REGS), ic: 'EM01A1' });
    const f = attachSerial(w, 'halfOpen');
    const ok = await P.caOpen();
    await sleep(30);
    CHECK(ok === false, '半開那一種也回傳 false');
    EQ(f.st.opened, 1, '前置條件：埠真的被打開過');
    EQ(f.st.closed, 1, '🔴 catch 有把那個半開的埠關掉（否則下一次按會「already open」）');
    EQ(P.caLinked(), false, '半開之後也是未連線');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ②-2 成功之後三處也要一致（修的是雙向，不只失敗那一半）
     ═══════════════════════════════════════════════════════════════════════ */
  H('②-2 open 成功後三處一致');
  {
    const { w, P, doc } = await load({ ws: makeBridge(EM01_REGS), ic: 'EM01A1' });
    await armGray(P);                      // 🔴 先進第二段，再連儀器（見 armedGrayDisabled 的說明）
    EQ(grayDisabled(doc), true, '前置條件：還沒連儀器 ⇒ 第二段是灰的');
    attachSerial(w, 'ok');
    const ok = await P.caOpen();
    await sleep(30);
    CHECK(ok === true, 'dstCaOpen() 回傳 true');
    EQ(P.caLinked(), true, '連上了');
    EQ(P.caPressed(), 'true', '鈕變成已連線');
    /* 🔴 這一條就是截圖裡的主症狀：鈕綠了，閘門卻還說沒儀器 */
    EQ(P.runWhyKey(), null, '🔴 連上之後閘門不再說「沒有儀器」');
    EQ(P.runWhyText(), '', '🔴 而且畫面上那一行原因一個字都不留');
    EQ(grayDisabled(doc), false, '🔴 第二段「開始量測」可以按了（連上之後閘門有跟著重畫）');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ③ 🔴 Bug 2：訊息字串不得含 `{`
     ═══════════════════════════════════════════════════════════════════════ */
  H('③ 🔴 Bug 2：{detail} 不得露出');
  {
    const { w, P, doc } = await load({ ws: makeBridge(EM01_REGS), ic: 'EM01A1' });
    /* ── 先確認「這一支是七個 key 的共同出口」，而且七個模板都含 {detail} ──
       🔴 這一段釘的是**影響範圍**：修一條不算修好，七條共用同一行組字。
          三語都查，因為漏填是語言無關的（模板每一種語言都有那個佔位符）。 */
    const KEYS = ['dst.lutErrNoSpec', 'dst.lutErrBus', 'dst.lutErrData', 'dst.lutErrDepth',
                  'dst.lutErrMode', 'dst.lutErrModeNotDg', 'dst.lutErrStep'];
    const missing = [];
    for (const k of KEYS) {
      const e = w.I18N[k];
      if (!e) { missing.push(k + ':missing'); continue; }
      for (const lang of ['zh-TW', 'en', 'zh-CN']) {
        if (String(e[lang] || '').indexOf('{detail}') < 0) missing.push(k + ':' + lang);
      }
    }
    EQ(missing, [], `🔴 這 ${KEYS.length} 個 key 的三語模板都含 {detail}（＝ 七條訊息共用同一個漏洞）`);
    CHECK((SRC.match(/dstSay\('dst-say-lut'/g) || []).length === 1,
      '🔴 而且畫面上只有一個出口（dst-say-lut 只被寫一次）⇒ 修那一處就是修全部');

    /* 要驗**畫面上的字**就得讓產品真的走進失敗 —— 用「認得出 IC、但這一顆沒有
       dgLut 規格」這條最短的路（dst.lutErrNoSpec，模板含 {detail}，detail ＝ IC 代號）。 */
    const ics = P.icTable();
    const noSpec = ics.find(x => !x.dgLut);
    CHECK(!!noSpec, '找得到一顆「沒有 DG LUT 讀取規格」的 IC 來走這條路', noSpec && noSpec.key);
    if (noSpec) {
      P.setIcForTest(noSpec.key, -1);
      await P.readDgLut();
      await sleep(40);
      const err = P.lutErr();
      EQ(err && err.stepKey, 'dst.lutErrNoSpec', '前置條件：真的停在「沒有讀取規格」這一步');
      const shown = doc.getElementById('dst-say-lut').textContent || '';
      CHECK(shown.indexOf('{') < 0,
        '🔴 畫面上的訊息**不含 `{`**（模板原形沒有露出來）', shown);
      CHECK(shown.indexOf(noSpec.key) >= 0,
        '🔴 而且 {detail} 真的被換成 IC 代號了', shown);
      /* 🔴 已經在句子裡 ⇒ 不再多一個中括號重複一次 */
      CHECK(shown.split(noSpec.key).length - 1 === 1,
        '🔴 detail 只出現一次（沒有「句子裡有、後面又括號一次」的重複）', shown);
      EQ(P.lutErrText(), shown, '組字函式與畫面上的字一致（同一個出口）');
    }
    /* 沒有佔位符的那一種：detail 仍要補在中括號裡（既有行為不得退化）*/
    {
      const { P: P2, doc: d2 } = await load({});
      await P2.readDgLut();                     // 未連線 ⇒ dst.lutErrLink，detail ＝ ''
      await sleep(30);
      EQ(P2.lutErr().stepKey, 'dst.lutErrLink', '未連線那一條的 key');
      const s2 = d2.getElementById('dst-say-lut').textContent || '';
      CHECK(s2.indexOf('{') < 0, '沒有佔位符的訊息也不含 `{`', s2);
      CHECK(s2.indexOf('[') < 0, 'detail 是空字串 ⇒ 不掛空的中括號', s2);
    }
    /* 模擬「模板沒有佔位符、但 detail 有值」：dst.lutErrDecode（detail ＝ chN）*/
    {
      const tpl = w.I18N['dst.lutErrDecode'];
      CHECK(!!tpl && String(tpl['zh-TW']).indexOf('{') < 0,
        'dst.lutErrDecode 的模板沒有佔位符（它的 detail 走中括號）');
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ④ 🔴 突變測試：把兩個修正改回去，對應的斷言必須變紅
     ═══════════════════════════════════════════════════════════════════════ */
  H('④ 🔴 突變測試');
  {
    /* 突變 1：dstRenderCa 尾巴那一行 dstRenderBtns() 拿掉 ⇒ 第 ②-2 組必須紅 */
    const orig = '  dstRenderBtns();\n}\n/* ═══ v1.3.0：畫面測試那張卡的字與**選取態**';
    CHECK(SRC.indexOf(orig) > 0, '找得到 dstRenderCa 尾巴那一行 dstRenderBtns()');
    const mut = SRC.replace(orig, '}\n/* ═══ v1.3.0：畫面測試那張卡的字與**選取態**');
    CHECK(mut !== SRC, '突變 1 真的套上去了');
    const { w, P, doc } = await load({ src: mut, ws: makeBridge(EM01_REGS), ic: 'EM01A1' });
    await armGray(P);                      // 🔴 先進第二段，再連儀器
    attachSerial(w, 'ok');
    await P.caOpen();
    await sleep(30);
    EQ(P.caLinked(), true, '突變後也連上了（鈕是對的）');
    EQ(grayDisabled(doc), true,
      '🔴 突變後第二段「開始量測」仍是灰的 ⇒ 重現截圖裡的矛盾，證明第 ②-2 組真的在驗東西');
    CHECK((P.runWhyText() || '').indexOf('儀器') >= 0,
      '🔴 突變後那行原因還說「沒有儀器」（鈕卻是綠的）', P.runWhyText());
  }
  {
    /* 突變 2：組字時不帶 vars（＝ v1.7.2 的寫法）⇒ 第 ③ 組必須紅 */
    const orig = "var msg = dstT(dstLutErr.stepKey, { detail: detail });";
    CHECK(SRC.indexOf(orig) > 0, '找得到組字那一行');
    const mut = SRC.replace(orig, "var msg = dstT(dstLutErr.stepKey);");
    const { P, doc } = await load({ src: mut, ws: makeBridge(EM01_REGS), ic: 'EM01A1' });
    const ics = P.icTable();
    const noSpec = ics.find(x => !x.dgLut);
    P.setIcForTest(noSpec.key, -1);
    await P.readDgLut();
    await sleep(40);
    const shown = doc.getElementById('dst-say-lut').textContent || '';
    CHECK(shown.indexOf('{detail}') >= 0,
      '🔴 突變後 {detail} 又露出來了 ⇒ 證明第 ③ 組真的在驗東西', shown);
  }

  console.log('\n' + '═'.repeat(64));
  console.log('  pass ' + pass + '   fail ' + fail);
  console.log('═'.repeat(64));
  console.log('🔴 這支驗不到的：真的 COM port、真的量測儀、真瀏覽器的 Web Serial 權限視窗。');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
