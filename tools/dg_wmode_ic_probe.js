/* ═══════════════════════════════════════════════════════════════════════════
   dg_wmode_ic_probe.js — dg v1.71.0 ／ dgself v1.9.0 的驗收夾具（jsdom）

   Bruce 2026-09-21 交辦的兩件事：
     A. 迭代校正分頁最上方先選工作模式（T-CON 自檢畫面／電腦畫面）
     B. 連上 IC 之後，「位元深度與目標設定」整張卡片連動更新

   ═══ 這支釘住的東西（逐條對應他列的驗證項目）═══════════════════════════════
     ① 未選模式時，下方所有卡片全部隱藏
     ② 選 T-CON 會開自檢頁（走 DG_LIVE_PAGES.tcon 那一槽）且 DG 卡片同時展開
     ③ 兩模式資料互不覆蓋（在 A 存資料、切到 B、切回 A 資料還在）
     ④ 重整後仍跳二選一，且兩套資料都保留
     ⑤ 分別清空只清掉該模式
     ⑥ 光學資料比較不隨模式隔離，且每一組帶來源標記
     ⑦ 認出 IC 後三項卡片資訊被更新；讀不到的欄位顯示讀不到、而且那一格不被動到

   ═══ 🔴 怎麼避免「自己驗自己」═══════════════════════════════════════════════
     ① 期望值在本檔自己寫死（8／6／10 的對應、0x0F00／0x0270／0x0200／0x0260 這些
        位址），**不呼叫產品的函式來對答案** —— 它們來自原廠 UI 源碼，行號記在
        dg-selftest.html 的 `tx:` 欄位註解裡，覆核時對那份看。
     ② 第 ⑧ 組是**突變測試**：把產品端四個關鍵行為各改壞一次，對應的斷言必須變紅。
        沒有這一組的話，「全部通過」也可能只是因為斷言根本沒在驗東西。
     ③ 「重整」是真的把整個 jsdom 砍掉重建，localStorage 用同一份字串搬過去 ——
        不是呼叫 dgInit() 假裝重整（那樣記憶體裡的狀態會殘留，等於沒驗到）。

   🔴 **沒驗到的（誠實列出）**：
     · 真治具、真 TCON、真量測儀 —— 這台機器沒有硬體。所以「TX bit 讀回來的值對不對」
       只驗到「給定 byte ⇒ 解出哪一個 bit 數」與「讀哪一個位址」，**沒有驗過真 IC
       回的 byte 是什麼**。
     · E512 的 LUT 深度旗標（0x002F bit2）是這一版從 C 原始碼補上的，**尚未在真機
       驗過**（手邊沒有 E512 板子）。
     · 真瀏覽器的分頁行為（window.open 的視窗位置、opener.focus()）。jsdom 的是假的。
     · 版面／視覺（卡片藏起來是看 style.display，不是看截圖）。

   用法：node tools/dg_wmode_ic_probe.js
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
const DG_SRC = fs.readFileSync(path.join(repo, 'dg.html'), 'utf8');
const SELF_SRC = fs.readFileSync(path.join(repo, 'dg-selftest.html'), 'utf8');

/* 開一份 DG 頁。`store` 是要塞進 localStorage 的內容（模擬「上一次存好的」）。
   🔴 window.open 換成假的，並把開過的網址記下來 —— ② 要驗的正是「開了哪一個檔」。 */
async function openDg(src, store) {
  const errs = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errs.push('jsdomError: ' + e.message));
  vc.on('error', (...a) => errs.push('error: ' + a.join(' ')));
  const dom = new JSDOM(inlineSrc(src || DG_SRC), {
    runScripts: 'dangerously', url: 'https://x.test/dg.html',
    virtualConsole: vc, pretendToBeVisual: true,
    beforeParse(w) {
      if (store != null) { try { w.localStorage.setItem('tcon-dg-autosave', store); } catch (e) {} }
      const opened = [];
      w.__opened = opened;
      w.open = function (url) {
        opened.push(String(url));
        return { closed: false, postMessage(m) { (w.__posted = w.__posted || []).push(m); }, focus() {} };
      };
    }
  });
  await sleep(900);
  const w = dom.window;
  return {
    dom, w, errs,
    $: id => w.document.getElementById(id),
    api: w.dgApi,
    opened: () => w.__opened.slice(),
    posted: () => (w.__posted || []).slice(),
    store: () => w.localStorage.getItem('tcon-dg-autosave')
  };
}

async function openSelf() {
  const errs = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errs.push('jsdomError: ' + e.message));
  vc.on('error', (...a) => errs.push('error: ' + a.join(' ')));
  const dom = new JSDOM(inlineSrc(SELF_SRC), {
    runScripts: 'dangerously', url: 'https://x.test/dg-selftest.html?task=1&step=lut',
    virtualConsole: vc, pretendToBeVisual: true
  });
  await sleep(700);
  return { dom, w: dom.window, errs, P: dom.window.dstProbe };
}

/* 第 2 部分塞一份**完整的 256 階**白灰階。
   🔴 不能只塞兩列：v1.51.0／v1.52.0 的完整性閘門（dgGrayGate）會把不完整的量測擋在
      「轉出到光學資料比較」那條路之外 —— 塞兩列的話 ⑥ 會因為「資料被正確地拒收」
      而失敗，看起來像功能壞了。這是第一版寫這支夾具時實際踩到的。
   🔴 `hi` 是最後一階（L255）的亮度，拿它當「這是哪一份資料」的指紋。 */
function fillGray(ctx, hi) {
  const rows = [];
  for (let g = 0; g <= 255; g++) {
    const Y = (g === 255) ? Number(hi) : (0.5 + (Number(hi) - 0.5) * Math.pow(g / 255, 2.2));
    rows.push(g + '\t0.3127\t0.3290\t' + Y.toFixed(4));
  }
  ctx.$('dg-in-gray').value = rows.join('\n');
  ctx.$('dg-in-gray').dispatchEvent(new ctx.w.Event('input', { bubbles: true }));
}
function grayHi(ctx) {
  const v = String(ctx.$('dg-in-gray').value || '');
  if (!v.trim()) return '';
  const m = v.trim().split('\n').pop().split('\t');
  return String(Math.round(Number(m[m.length - 1])));
}
/* 等自動保存的 debounce（800 ms）真的把東西寫出去。
   🔴 不可以只 sleep 60 ms 就去讀 localStorage —— 讀到的是**上一次**寫進去的，
      而斷言會失敗得像功能壞了。第一版寫這支時實際踩到（⑥ 少一組）。 */
async function flushed(ctx) { await sleep(950); return ctx.store(); }
function grayRows(ctx) {
  const v = String(ctx.$('dg-in-gray').value || '');
  return v.trim() ? v.trim().split('\n').length : 0;
}

async function main() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('  dg v1.71.0 ／ dgself v1.9.0 驗收夾具');
  console.log('════════════════════════════════════════════════════════════════');

  /* ═══ ① 未選模式 ⇒ 下方卡片全隱藏 ═══════════════════════════════════════ */
  H('① 未選工作模式時，下方所有卡片隱藏');
  let c = await openDg();
  EQ(c.errs, [], 'DG 這一頁沒有拋出任何 jsdom 錯誤');
  CHECK(!!c.api, 'window.dgApi 在');
  EQ(c.api.wmode(), null, '起點是「還沒選」');
  CHECK(!c.api.wmodeCardsVisible(), '整袋卡片是收起來的');
  EQ(c.$('dg-main-cards').style.display, 'none', '#dg-main-cards 的 display 是 none');
  CHECK(c.$('dg-card-wmode') && c.$('dg-card-wmode').offsetParent !== undefined,
        '二選一那張卡片本身在畫面上（它在袋子外面）');
  /* 🔴 負面：袋子裡每一張卡片都真的在袋子裡（不是漏掉一張留在外面）。
     這一條是「列舉式清單會漏」的那個教訓 —— 用包含關係驗，不用清單驗。 */
  ['dg-preset-card', 'dg-card-setup', 'dg-card-input', 'dg-calc-act', 'dg-card-result', 'dg-card-p4']
    .forEach(id => CHECK(c.$('dg-main-cards').contains(c.$(id)), '　' + id + ' 在袋子裡'));
  CHECK(!c.$('dg-main-cards').contains(c.$('dg-card-wmode')), '　二選一卡片**不**在袋子裡');

  /* ═══ ② 選 T-CON ⇒ 開自檢頁，且卡片同時展開 ══════════════════════════════ */
  H('② 選 T-CON ⇒ 開自檢分頁，DG 卡片同時展開');
  c.$('dg-btn-wmode-tcon').click();
  await sleep(50);
  EQ(c.api.wmode(), 'tcon', '工作模式變成 tcon');
  CHECK(c.api.wmodeCardsVisible(), '下方卡片同時展開了（不是等他自己再按一次）');
  const urls = c.opened();
  EQ(urls.length, 1, '只開了一個分頁');
  CHECK(/^dg-selftest\.html\?/.test(urls[0]), '開的是 dg-selftest.html', urls[0]);
  CHECK(/[?&]step=lut(&|$)/.test(urls[0]), '帶的 step 是 lut（第 1 部分那一步）', urls[0]);
  CHECK(/[?&]task=\d+/.test(urls[0]), '帶了任務編號', urls[0]);
  EQ(c.api.liveWinsAlive(), { pc: false, tcon: true }, '握著的是 tcon 那一槽（pc 那一槽沒被碰）');
  /* 再選一次 T-CON ⇒ 同一槽已經活著 ⇒ 不可以再開第二個分頁 */
  c.$('dg-btn-wmode-tcon').click();
  await sleep(50);
  EQ(c.opened().length, 1, '已經選著 tcon 時再按一次，不會再開一個分頁');
  /* 切到 pc 再切回 tcon ⇒ 仍然重用那一槽 */
  c.$('dg-btn-wmode-pc').click(); await sleep(50);
  c.$('dg-btn-wmode-tcon').click(); await sleep(50);
  EQ(c.opened().length, 1, '切走再切回來，自檢分頁是重用的（沒有第二個）');

  H('②-b 選了模式之後，另一條路的入口不出現');
  c.$('dg-btn-wmode-pc').click(); await sleep(50);
  EQ(c.$('dg-btn-tcon-lut').style.display, 'none', '電腦畫面模式下，「接上 T-CON 讀回 LUT」不出現');
  EQ(c.$('dg-btn-tcon-gray').style.display, 'none', '　「從 T-CON 取」（第 2 部分）不出現');
  EQ(c.$('dg-btn-tcon-prim').style.display, 'none', '　「從 T-CON 取」（第 3 部分）不出現');
  EQ(c.$('dg-btn-live-gray').style.display, '', '　「電腦畫面量測」照常在');
  CHECK(c.$('dg-btn-tcon-lut').closest('.dg-lut-opt').style.display === 'none',
        '　整區只剩那一顆時，那一區也收起來（不留空標題）');
  c.$('dg-btn-wmode-tcon').click(); await sleep(50);
  EQ(c.$('dg-btn-live-gray').style.display, 'none', 'T-CON 模式下，「電腦畫面量測」不出現');
  EQ(c.$('dg-btn-tcon-gray').style.display, '', '　「從 T-CON 取」照常在');
  /* 🔴 光學資料比較那兩個入口是共用的，任何模式下都不准被藏起來 */
  EQ(c.$('dg-btn-slot-live').style.display, '', '光學資料比較的「量測」入口不受模式影響');
  EQ(c.$('dg-btn-conf-live').style.display, '', '第 4 部分的「量測」入口不受模式影響');

  /* ═══ ③ 兩模式資料互不覆蓋 ═══════════════════════════════════════════════ */
  H('③ 兩模式的第 1～4 部分資料互不覆蓋');
  c = await openDg();
  c.$('dg-btn-wmode-pc').click(); await sleep(30);
  fillGray(c, '111'); c.$('dg-gamma').value = '2.45';
  c.$('dg-gamma').dispatchEvent(new c.w.Event('input', { bubbles: true }));
  await sleep(30);
  c.$('dg-btn-wmode-tcon').click(); await sleep(60);
  EQ(c.$('dg-in-gray').value, '', '切到 T-CON：第 2 部分是空的（沒有把 pc 那一份帶過來）');
  EQ(c.$('dg-gamma').value, '2.20', '　目標 Gamma 回到出廠值');
  fillGray(c, '222'); c.$('dg-gamma').value = '1.85';
  c.$('dg-gamma').dispatchEvent(new c.w.Event('input', { bubbles: true }));
  await sleep(30);
  c.$('dg-btn-wmode-pc').click(); await sleep(60);
  EQ(grayHi(c), '111', '切回電腦畫面：拿回自己那一份（111）');
  EQ(c.$('dg-gamma').value, '2.45', '　目標 Gamma 也是自己那一份');
  c.$('dg-btn-wmode-tcon').click(); await sleep(60);
  EQ(grayHi(c), '222', '再切回 T-CON：也還在（222）');
  EQ(c.$('dg-gamma').value, '1.85', '　目標 Gamma 也還在');

  /* ═══ ④ 重整之後仍跳二選一，兩套都留著 ═══════════════════════════════════ */
  H('④ 重整後仍跳二選一，且兩套資料都保留');
  const saved = await flushed(c);
  CHECK(!!saved, 'localStorage 裡有存檔');
  const wrap = JSON.parse(saved);
  EQ(wrap._v, 2, '存檔版本是 2');
  CHECK(!!(wrap.modes && wrap.modes.tcon && wrap.modes.pc), '兩套都在存檔裡', Object.keys(wrap.modes || {}));
  CHECK(!('wmode' in wrap) && !/"wmode"/.test(saved),
        '🔴 存檔裡**沒有**記「上次選了哪一種」（記了就會自動套用，違反第 6 條）');
  const c2 = await openDg(null, saved);   // ← 真的重開一個 jsdom，不是呼叫 dgInit()
  EQ(c2.errs, [], '重整後這一頁沒有拋出任何 jsdom 錯誤');
  EQ(c2.api.wmode(), null, '重整後回到「還沒選」（不自動套用上次的選擇）');
  CHECK(!c2.api.wmodeCardsVisible(), '　下方卡片又收起來了');
  EQ(c2.$('dg-in-gray').value, '', '　第 2 部分是空的（還沒選模式，不該先擺一套出來）');
  c2.$('dg-btn-wmode-pc').click(); await sleep(60);
  EQ(grayHi(c2), '111', '選電腦畫面 ⇒ 接上重整前那一份');
  EQ(c2.$('dg-gamma').value, '2.45', '　設定也接上了');
  c2.$('dg-btn-wmode-tcon').click(); await sleep(60);
  EQ(grayHi(c2), '222', '選 T-CON ⇒ 接上它自己那一份');

  /* ═══ ⑤ 分別清空 ════════════════════════════════════════════════════════ */
  H('⑤ 分別清空：只清掉該模式那一套');
  c2.$('dg-btn-wmode-clr-tcon').click(); await sleep(60);
  EQ(c2.$('dg-in-gray').value, '', '清掉 T-CON 那一套 ⇒ 目前畫面（正是 T-CON）被清空');
  EQ(c2.$('dg-gamma').value, '2.20', '　設定回出廠');
  c2.$('dg-btn-wmode-pc').click(); await sleep(60);
  EQ(grayHi(c2), '111', '🔴 電腦畫面那一套**沒有**被動到');
  EQ(c2.$('dg-gamma').value, '2.45', '　它的設定也沒有被動到');
  const w5 = JSON.parse(await flushed(c2));
  EQ(w5.modes.tcon, null, '存檔裡 T-CON 那一套已經不在');
  CHECK(!!w5.modes.pc, '存檔裡電腦畫面那一套還在');
  /* 清「目前不是自己」的那一套：畫面不該被動到 */
  c2.$('dg-btn-wmode-clr-tcon').click(); await sleep(40);
  EQ(grayHi(c2), '111', '清一個本來就空的、而且不是目前這一套 ⇒ 畫面不動');

  /* ═══ ⑥ 光學資料比較共用 ＋ 來源標記 ════════════════════════════════════ */
  H('⑥ 光學資料比較不隨模式隔離，且每一組帶來源標記');
  const c3 = await openDg();
  c3.$('dg-btn-wmode-pc').click(); await sleep(40);
  /* 「第 2 部分 ⇒ 轉出到光學資料比較」那條路（三種來源之一）。
     🔴 直接走產品的那顆鈕，不自己呼叫 dgSlotAdd —— 驗的是那條路有沒有帶標記。 */
  fillGray(c3, '300'); await sleep(60);
  c3.$('dg-btn-gray-toslot').click(); await sleep(60);
  EQ(c3.api.slotModes(), ['pc'], '在電腦畫面模式轉出的那一組，標記是 pc');
  c3.$('dg-btn-wmode-tcon').click(); await sleep(80);
  EQ(c3.api.slotModes(), ['pc'], '🔴 切到 T-CON ⇒ 那一組**還在**（比較分頁是共用的）');
  fillGray(c3, '400'); await sleep(60);
  c3.$('dg-btn-gray-toslot').click(); await sleep(60);
  EQ(c3.api.slotModes(), ['pc', 'tcon'], '兩種模式的組**疊在一起**，各自帶自己的標記');
  const rowTxt = c3.$('dg-slot-list').textContent;
  CHECK(rowTxt.indexOf('電腦畫面') >= 0 && rowTxt.indexOf('T-CON 自檢畫面') >= 0,
        '兩個標記都寫在畫面上（不是只存在資料裡）');
  /* 存檔裡：slots 在 shared，不在任何一個 mode 底下 */
  const w6 = JSON.parse(await flushed(c3));
  EQ(w6.shared.slots.length, 2, '存檔裡兩組都放在 shared');
  EQ(w6.shared.slots.map(s => s.srcMode), ['pc', 'tcon'], '　而且各自帶著來源標記');
  ['tcon', 'pc'].forEach(k => CHECK(!(w6.modes[k] && w6.modes[k].slots),
        '　🔴 ' + k + ' 那一套底下**沒有**第二份 slots（不重複存）'));
  /* 分別清空不可以動到比較分頁 */
  c3.$('dg-btn-wmode-clr-tcon').click(); await sleep(60);
  EQ(c3.api.slotModes(), ['pc', 'tcon'], '清掉一個模式的紀錄 ⇒ 比較分頁那兩組一組都沒少');

  /* ═══ ⑦ 認出 IC ⇒ 卡片三項連動；讀不到就明講且不動那一格 ═══════════════ */
  H('⑦ 認出 IC 後，「位元深度與目標設定」三項連動更新');
  const c4 = await openDg();
  c4.$('dg-btn-wmode-tcon').click(); await sleep(40);
  const before = [c4.$('dg-tcon').value, c4.$('dg-outbit').value, c4.$('dg-sd').value];
  EQ(before, ['', '10', '6'], '起點：目標 TCON 未指定、輸出 10 bit、SD 6 bit');

  c4.api.applyIcInfo({ type: 'dg-ic-info', at: '14:32', ic: 'EM01A1', icKey: 'EM01A1',
                       lutDepth: 12, lutDepthWhy: '', txBits: 8, txWhy: '' });
  EQ(c4.$('dg-tcon').value, 'EM01', 'EM01A1 ⇒ 目標 TCON 設成 EM01');
  EQ(c4.$('dg-outbit').value, '12', '　LUT 輸出深度設成 12 bit');
  EQ(c4.$('dg-sd').value, '8', '　Source Driver 設成 8 bit');
  EQ(c4.$('dg-sd-badge').textContent, '機台讀回', '　SD 徽章寫「機台讀回」');
  EQ(c4.$('dg-outbit-badge').textContent, '機台讀回', '　輸出深度徽章寫「機台讀回」');
  EQ(c4.$('dg-outbit-badge').style.display, '', '　而且它顯示出來了');
  CHECK(c4.$('dg-ic-box').style.display !== 'none', '　卡片上那塊「已從機台讀回」出現了');
  CHECK(c4.$('dg-ic-box').textContent.indexOf('14:32') >= 0, '　而且帶著讀回的時間');
  /* 🔴 使用者看得出「這是機台來的」＝ 三個徽章 ＋ 那一塊說明，缺一不可 */
  CHECK(/EM01A1/.test(c4.$('dg-ic-box').textContent), '　說明裡寫著讀到的型號');

  H('⑦-b 讀不到的欄位：明講讀不到，而且那一格不被動到');
  const keep = [c4.$('dg-tcon').value, c4.$('dg-outbit').value, c4.$('dg-sd').value];
  c4.api.applyIcInfo({ type: 'dg-ic-info', at: '14:40', ic: 'E512A1', icKey: 'E512AX',
                       lutDepth: null, lutDepthWhy: '深度旗標讀不回來', txBits: null, txWhy: 'TX 沒讀到' });
  EQ(c4.$('dg-tcon').value, 'E512', 'IC 讀到了 ⇒ 目標 TCON 照樣更新成 E512');
  EQ(c4.$('dg-outbit').value, keep[1], '🔴 深度讀不到 ⇒ 那一格**維持原值**，沒有被填預設值');
  EQ(c4.$('dg-sd').value, keep[2], '🔴 TX 讀不到 ⇒ 那一格**維持原值**');
  EQ(c4.$('dg-outbit-badge').style.display, 'none', '　輸出深度的「機台讀回」徽章撤掉了');
  CHECK(c4.$('dg-sd-badge').textContent !== '機台讀回', '　SD 的「機台讀回」徽章也撤掉了',
        c4.$('dg-sd-badge').textContent);
  const t4 = c4.$('dg-ic-box').textContent;
  CHECK(t4.indexOf('讀不到') >= 0, '　卡片上明講「讀不到」');
  CHECK(t4.indexOf('深度旗標讀不回來') >= 0, '　而且原樣寫出自檢頁給的原因');
  CHECK(t4.indexOf('TX 沒讀到') >= 0, '　兩個原因都寫了');
  CHECK(t4.indexOf('沒有被動到') >= 0, '　並且告訴他那幾格沒有被動到');

  H('⑦-c 認不出 IC：三格一個都不准動');
  const keep2 = [c4.$('dg-tcon').value, c4.$('dg-outbit').value, c4.$('dg-sd').value];
  c4.api.applyIcInfo({ type: 'dg-ic-info', at: '14:45', ic: '—', icKey: '',
                       lutDepth: null, lutDepthWhy: '還沒認出 IC', txBits: null, txWhy: '還沒認出 IC' });
  EQ([c4.$('dg-tcon').value, c4.$('dg-outbit').value, c4.$('dg-sd').value], keep2,
     '認不出 IC ⇒ 三個選單一個都沒被動到');

  H('⑦-d 清單裡沒有的那顆：如實說沒有，不硬塞一個最像的');
  c4.api.applyIcInfo({ type: 'dg-ic-info', at: '14:50', ic: 'V007SX', icKey: 'V007SX',
                       lutDepth: null, lutDepthWhy: 'x', txBits: null, txWhy: 'y' });
  EQ(c4.$('dg-tcon').value, keep2[0], 'V007SX 沒有對應項目 ⇒ 目標 TCON 不被動到');
  CHECK(c4.$('dg-ic-box').textContent.indexOf('V007SX') >= 0, '　但卡片上如實寫出讀到的是 V007SX');

  H('⑦-e 使用者自己改過之後，徽章要改口');
  c4.api.applyIcInfo({ type: 'dg-ic-info', at: '15:00', ic: 'EM02A1', icKey: 'EM02A1',
                       lutDepth: 10, lutDepthWhy: '', txBits: 6, txWhy: '' });
  EQ(c4.$('dg-outbit').value, '10', 'EM02 10-bit 先套上');
  c4.$('dg-outbit').value = '12';
  c4.$('dg-outbit').dispatchEvent(new c4.w.Event('change', { bubbles: true }));
  EQ(c4.$('dg-outbit-badge').style.display, 'none', '手動改成 12 ⇒ 「機台讀回」徽章撤掉');
  CHECK(c4.$('dg-ic-box').textContent.indexOf('你自己改成了 12 bit') >= 0,
        '　而且如實寫「機台讀回的是 10 bit，你自己改成了 12 bit」');
  c4.$('dg-sd').value = '10';
  c4.$('dg-sd').dispatchEvent(new c4.w.Event('change', { bubbles: true }));
  EQ(c4.$('dg-sd-badge').textContent, '手動指定', '手動改 SD ⇒ 徽章退回「手動指定」');

  /* ═══ ⑦-f 自檢頁那一端：TX 讀法與 IC 狀態包 ═══════════════════════════════ */
  H('⑦-f 自檢頁：TX bit count 的解碼與讀取位址');
  const sc = await openSelf();
  EQ(sc.errs, [], '自檢頁沒有拋出任何 jsdom 錯誤');
  const P = sc.P;
  /* 🔴 期望值寫死在這裡（出處＝原廠 UI 源碼，行號在 dg-selftest.html 的 tx: 註解）。
     不呼叫產品函式來產生期望值，否則就是拿它自己驗它自己。 */
  const em01 = P.txSpecOf('EM01A1'), em02 = P.txSpecOf('EM02A1'), e512 = P.txSpecOf('E512AX');
  EQ(em01 && em01.typeAddr, 0x0F00, 'EM01 的 TX type 讀 0x0F00（BK_TX_DTOP_P2P）');
  EQ(em01 && em01.miniAddr, 0x0270, 'EM01 的 MiniTX 讀 0x0270（BK_MINI_TX）');
  EQ(em01 && em01.opts, [8, 6, 10], 'EM01 的選項 index 0→8、1→6、2→10');
  EQ(em02 && em02.miniAddr, 0x0200, 'EM02 讀 0x0200（BK_TX_TOP_P2P = BK_MINI_TX）');
  EQ(em02 && em02.opts, [8, 6], 'EM02 的選項只有 8／6（沒有 10bit）');
  EQ(em02 && em02.kind, 'mini', 'EM02 是寫死 MiniTX，沒有 eType 分支');
  EQ(e512 && e512.miniAddr, 0x0260, 'E512 讀 0x0260');
  EQ(e512 && e512.opts, [8, 6], 'E512 的選項與 EM02 相同');
  EQ(e512 && e512.kind, 'mini', 'E512 也是寫死 MiniTX');
  /* 🔴 不要用 ComboBox_System_TX_InterFace_ISP_bit_mode（讀它的程式碼整段被註解掉） */
  CHECK(!/InterFace_ISP_bit_mode/.test(SELF_SRC.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '')),
        '🔴 產品程式碼（去掉註解後）沒有用到那個死掉的控制項');

  H('⑦-g TX 解碼的每一條分支');
  EQ(P.txDecode(em01, 0x00, 0x00).bits, 8,  'EM01／MiniTX／bit4=0 ⇒ 8');
  EQ(P.txDecode(em01, 0x00, 0x10).bits, 6,  'EM01／MiniTX／bit4=1 ⇒ 6');
  EQ(P.txDecode(em01, 0x12, null).bits, 10, 'EM01／非 MiniTX（eType=1）／byte0&3=2 ⇒ 10');
  EQ(P.txDecode(em01, 0x10, null).bits, 8,  'EM01／非 MiniTX／byte0&3=0 ⇒ 8');
  EQ(P.txDecode(em01, 0x11, null).bits, 6,  'EM01／非 MiniTX／byte0&3=1 ⇒ 6');
  EQ(P.txDecode(em01, 0x13, null).bits, null, '🔴 index 3 不在選項表裡 ⇒ 不猜，回 null');
  EQ(P.txDecode(em01, 0x13, null).whyKey, 'dst.txWhyBadIdx', '　而且講得出是哪一種讀不到');
  EQ(P.txDecode(em02, null, 0x00).bits, 8,  'EM02／bit4=0 ⇒ 8');
  EQ(P.txDecode(em02, null, 0x1F).bits, 6,  'EM02／bit4=1 ⇒ 6');
  EQ(P.txDecode(e512, null, 0x00).bits, 8,  'E512／bit4=0 ⇒ 8');
  EQ(P.txDecode(e512, null, 0x10).bits, 6,  'E512／bit4=1 ⇒ 6');
  EQ(P.txDecode(null, 0, 0).whyKey, 'dst.txWhyNoSpec', '沒有 tx 規格的顆 ⇒ 回「查不到依據」');
  /* 🔴 EM02／E512 **不看 eType** —— 就算 type 那幾位是別的值，結果也不能變 */
  EQ(P.txDecode(em02, 0x70, 0x10).bits, 6, 'EM02 不看 eType（餵一個假 typeByte 進去，結果不變）');

  H('⑦-h 自檢頁送回 DG 的那一包');
  P.setIcForTest('EM01A1');
  P.__setDgForTest({ state: 'on', raw: 0x03, depth: 10, target: 'offset', whyKey: null });
  let pl = P.icInfoPayload();
  EQ(pl.type, 'dg-ic-info', '訊息型別是 dg-ic-info');
  EQ(pl.icKey, 'EM01A1', 'icKey 是生效中那一顆');
  EQ(pl.lutDepth, 12, '🔴 EM01 是**固定 12-bit**（mask 0x0F00），不跟著深度旗標走');
  P.setIcForTest('EM02A1');
  P.__setDgForTest({ state: 'on', raw: 0x00, depth: 10, target: 'offset', whyKey: null });
  EQ(P.icInfoPayload().lutDepth, 10, 'EM02 旗標 10 ⇒ 10 bit');
  P.__setDgForTest({ state: 'on', raw: 0x04, depth: 12, target: 'offset', whyKey: null });
  EQ(P.icInfoPayload().lutDepth, 12, 'EM02 旗標 12 ⇒ 12 bit');
  P.setIcForTest('EM02A1', 0);   // 替代顆 V512S2
  EQ(P.icInfoPayload().icKey, 'V512S2', '🔴 選了替代顆 ⇒ 送的是替代顆的 key，不是母顆');
  P.setIcForTest('V007SX');
  pl = P.icInfoPayload();
  EQ(pl.lutDepth, null, '沒有 LUT 規格的顆 ⇒ 深度 null');
  CHECK(pl.lutDepthWhy && pl.lutDepthWhy.length > 6, '　而且講得出為什麼（不是空字串）', pl.lutDepthWhy);
  CHECK(pl.lutDepthWhy.indexOf('dst.') !== 0, '🔴 送出去的是翻譯過的字，不是 i18n key', pl.lutDepthWhy);
  CHECK(pl.txWhy.indexOf('dst.') !== 0, '🔴 txWhy 也是翻譯過的字', pl.txWhy);

  H('⑦-i 換任務時補送一次，而且一定排在 hello 後面');
  {
    const msgs = [];
    sc.w.opener = { closed: false, postMessage: m => msgs.push(m), focus() {} };
    sc.P.dgPostHello(77);
    EQ(msgs.length, 2, '送了兩則（hello ＋ 機台狀態）');
    EQ(msgs[0].type, 'dg-measure-hello', '🔴 第一則是 hello');
    EQ(msgs[0].task, 77, '　而且帶著問的那一號任務');
    EQ(msgs[1].type, 'dg-ic-info', '🔴 第二則才是機台狀態');
    /* 🔴 hello 是 DG 那端**有超時在等**的那一則，不可以被排到後面去。
       既有夾具 dg_live_fork_probe.js 拿 msgs[0] 當 hello 在驗 —— 這一條把同一個
       順序在本檔也釘一次，免得下一個人只看本檔就把順序調掉。 */
  }

  /* ═══ ⑧ 突變測試：把產品端改壞，對應的斷言必須變紅 ═══════════════════════ */
  H('⑧ 突變測試（沒有這一組，「全綠」可能只是斷言沒在驗東西）');

  /* M1：dgAsWrapSync 不分模式（永遠寫 tcon）⇒ ③ 的「互不覆蓋」必須失敗 */
  {
    const mut = DG_SRC.replace("      _dgAsWrap.modes[DG_WMODE] =\n        (dgAsStableJson",
                               "      _dgAsWrap.modes.tcon =\n        (dgAsStableJson");
    CHECK(mut !== DG_SRC, 'M1 突變體有套用');
    const m = await openDg(mut);
    m.$('dg-btn-wmode-pc').click(); await sleep(30);
    fillGray(m, '111'); await sleep(30);
    m.$('dg-btn-wmode-tcon').click(); await sleep(60);
    m.$('dg-btn-wmode-pc').click(); await sleep(60);
    CHECK(grayHi(m) !== '111', '🔴 M1（兩套寫進同一格）⇒ 資料確實被覆蓋了 ⇒ ③ 抓得到', grayHi(m));
    m.dom.window.close();
  }

  /* M2：dgWmodeSet 不先 reset 主分頁 ⇒ 「機台那一塊漏到另一套」必須被抓到。
     🔴 為什麼用「機台那一塊」而不是用第 2 部分的資料當指標 —— 誠實記錄實測結果：
        第 2 部分那四個資料欄位**就算拿掉 dgAsResetMain() 也不會漏**，因為
        dgAsApply() 會把「空白主分頁」的出廠欄位值（含 dg-in-gray=''）寫上去。
        真正只有 dgAsResetMain() 在管的是**不是欄位的那些東西**：dgIcForget()、
        DG_P4、以及 dgClearAll() 收掉的來源與結果。所以突變要打在那些上面，
        打在欄位上會得到一個「怎麼改壞都照樣綠」的假突變。 */
  {
    const mut = DG_SRC.replace("  function dgAsApplyFor(mode) {\n    dgAsResetMain();",
                               "  function dgAsApplyFor(mode) {\n    ;");
    CHECK(mut !== DG_SRC, 'M2 突變體有套用');
    const m = await openDg(mut);
    m.$('dg-btn-wmode-tcon').click(); await sleep(30);
    m.api.applyIcInfo({ type: 'dg-ic-info', at: '11:11', ic: 'EM01A1', icKey: 'EM01A1',
                        lutDepth: 12, txBits: 8 });
    CHECK(m.$('dg-ic-box').style.display !== 'none', '　M2：先讓機台那一塊出現');
    m.$('dg-btn-wmode-pc').click(); await sleep(60);
    CHECK(m.$('dg-ic-box').style.display !== 'none',
          '🔴 M2（切模式不清主分頁）⇒ 機台那一塊確實漏到另一套去了 ⇒ ③-b 抓得到');
    m.dom.window.close();
  }

  /* M3：讀不到深度時改成「補 12 bit」⇒ ⑦-b 的「維持原值」必須失敗 */
  {
    const mut = DG_SRC.replace("      info.lutWhy = String(d.lutDepthWhy || '自檢頁沒有讀到深度旗標。');",
                               "      $('dg-outbit').value = '12'; info.lutWhy = 'x';");
    CHECK(mut !== DG_SRC, 'M3 突變體有套用');
    const m = await openDg(mut);
    m.$('dg-btn-wmode-tcon').click(); await sleep(30);
    m.api.applyIcInfo({ type: 'dg-ic-info', ic: 'EM02A1', icKey: 'EM02A1', lutDepth: 10, txBits: 8 });
    const was = m.$('dg-outbit').value;
    m.api.applyIcInfo({ type: 'dg-ic-info', ic: 'EM02A1', icKey: 'EM02A1', lutDepth: null,
                        lutDepthWhy: '讀不到', txBits: 8 });
    CHECK(m.$('dg-outbit').value !== was, '🔴 M3（讀不到就補預設值）⇒ 那一格確實被改掉了 ⇒ ⑦-b 抓得到',
          [was, m.$('dg-outbit').value]);
    m.dom.window.close();
  }

  /* M4：slots 改存進模式底下 ⇒ ⑥ 的「共用」必須失敗 */
  {
    const mut = DG_SRC.replace("      shared: { fields: fShared, slots: snap.slots, conv: snap.conv, cctMode: cct },",
                               "      shared: { fields: fShared, slots: [], conv: snap.conv, cctMode: cct },");
    CHECK(mut !== DG_SRC, 'M4 突變體有套用');
    const m = await openDg(mut);
    m.$('dg-btn-wmode-pc').click(); await sleep(30);
    fillGray(m, '300'); await sleep(60);
    m.$('dg-btn-gray-toslot').click(); await sleep(60);
    const s0 = m.api.slotModes().length;
    m.$('dg-btn-wmode-tcon').click(); await sleep(80);
    CHECK(m.api.slotModes().length !== s0, '🔴 M4（slots 不放共用）⇒ 切模式時組數確實變了 ⇒ ⑥ 抓得到',
          [s0, m.api.slotModes().length]);
    m.dom.window.close();
  }

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('  pass ' + pass + '   fail ' + fail);
  console.log('════════════════════════════════════════════════════════════════');
  console.log('🔴 這支驗不到的：真治具、真 TCON、真量測儀、真瀏覽器的分頁行為、版面視覺；');
  console.log('   以及 E512 的 LUT 深度旗標（0x002F bit2，這一版才從 C 原始碼補上，手邊沒有板子）。');
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
