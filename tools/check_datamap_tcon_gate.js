// 用法：node tools/check_datamap_tcon_gate.js <repo> <EM01 code.bin>
// v1.18.11（Bruce 10/8）：讀寫 T-CON 要本次連線 Check T-CON 成功且型號＝目前型號；④ 移除 Write／Load，只剩匯出 script
// v1.18.14（Bruce 10/8）：TCON Out 紫／SD Out 藍（共用色票）＋ ③ 點擊跳到 ② 表格／Source Driver 設定
// v1.18.13（Bruce 10/8）：TCON Register 確認卡（獨立卡、列全部、預設展開）
// v1.18.12（Bruce 10/8）：離線（匯入 code／Excel）與線上（I2C）互斥；頂端顯示模式
// mock I2C Bridge（假的 WebSocket）跑：
//   ① 連線中匯入 → 確認 → 已斷線且沒寫 TCON   ② 取消 → 維持連線、沒匯入
//   ③ 匯入後連線 → 確認 → 匯入清掉、自動 Check、回讀   ④ 取消 → 維持離線
//   ⑤ 沒匯入直接連線不問   ⑥ Check 出的型號和鎖定時不同 ⇒ 自動解鎖；同型號保留鎖定
//   另：Check 失敗不讀不寫、手選換型號清確認、斷線清確認、即時寫入只在確認後
const path = require('path'), fs = require('fs');
const ROOT = path.resolve(process.argv[2] || '.'), CODE = process.argv[3];
const { JSDOM, VirtualConsole } = require(path.join(ROOT, 'node_modules/jsdom'));
let fail = 0, pass = 0; const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (c) pass++; else fail++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DMC = require(path.join(ROOT, 'common/datamap-core.js'));

async function open(opt) {
  opt = opt || {};
  const log = [], mem = {};
  const vc = new VirtualConsole(); vc.on('jsdomError', e => { console.log('jsdomError', e.message); });
  const dom = await JSDOM.fromFile(path.join(ROOT, 'datamap.html'), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.WebSocket = function () {
        const ws = this; ws.readyState = 0;
        setTimeout(() => { ws.readyState = 1; ws.onopen && ws.onopen(); }, 5);
        ws.send = s => { const m = JSON.parse(s); log.push(m); let r = { id: m.id, ok: true };
          if (m.type === 'ping') r = { id: m.id, ok: true, helper: 'mock', proto: 1 };
          else if (m.type === 'read') {
            if (opt.fail) r = { id: m.id, ok: false, err: 'nack' };
            else if (m.addr === 0xFF00 && m.len === 3) r = m.slave === 0x68 ? { id: m.id, ok: true, data: opt.id || [0x01, 0xEF, 0xA0] } : { id: m.id, ok: false, err: 'nack' };
            else { const a = []; for (let i = 0; i < m.len; i++) a.push(mem[(m.slave << 16) | (m.addr + i)] | 0); r = { id: m.id, ok: true, data: a }; }
          } else if (m.type === 'rawwrite') (m.data || []).forEach((b, i) => { mem[(m.slave << 16) | (m.addr + i)] = b; });
          setTimeout(() => ws.onmessage && ws.onmessage({ data: JSON.stringify(r) }), 1); };
        ws.close = () => { ws.readyState = 3; setTimeout(() => ws.onclose && ws.onclose(), 1); };
      };
    } });
  await new Promise(r => dom.window.addEventListener('load', r));
  const w = dom.window, d = w.document, $ = id => d.getElementById(id);
  const isId = m => m.type === 'read' && ((m.addr === 0xFF00 && m.len === 3) || m.slave === 0x7C || m.slave === 0x7D);
  return { w, d, $, log, opt, mem, reads: () => log.filter(m => m.type === 'read' && !isId(m)).length,
    writes: () => log.filter(m => m.type === 'rawwrite' && !(m.slave === 0x7E && m.addr === 0xAB)).length,
    mode: () => $('dm-modebar').getAttribute('data-mode') + '｜' + $('dm-modebar').textContent,
    askOpen: () => !$('dm-ask').classList.contains('hidden'), askT: () => $('dm-ask-t').textContent };
}
const wait = async (f, ms) => { for (let i = 0; i < (ms || 3000) / 20; i++) { if (f()) return true; await sleep(20); } return false; };
const toggleHand = a => { const h = a.$('dm-hand'); h.checked = !h.checked; h.dispatchEvent(new a.w.Event('change')); };
const connect = async a => { a.$('dm-link').click(); await wait(() => a.w.dmState.linked && !a.w.dmState.busy && (a.w.dmState.checked || a.opt.fail), 4000); await sleep(200); };

(async () => {
  console.log('按鈕與模式列');
  { const a = await open(); const { $, d } = a;
    ok(!$('dm-write') && !$('dm-load') && !$('dm-bar-write') && !!$('dm-export') && /匯出 script/.test(d.querySelector('[data-i18n="dm.stp3"]').textContent), '④ 沒有 Write to TCON／Load from TCON，只剩匯出 script');
    ok(/自動 Check T-CON 並回讀；要重讀再按一次/.test(d.querySelector('[data-i18n="dm.checkHint"]').textContent), 'Check T-CON 旁說明：連線後自動 Check＋回讀，要重讀再按一次');
    ok(/^off｜離線/.test(a.mode()) && /未匯入、未連線/.test(a.mode()), '開頁：頂端模式列＝離線（未匯入、未連線）');
    if (CODE) { a.w.dmImportBytes(new Uint8Array(fs.readFileSync(CODE)), path.basename(CODE)); await sleep(50);
      ok(/^off｜離線/.test(a.mode()) && a.mode().indexOf(path.basename(CODE)) >= 0 && !a.askOpen(), '未連線匯入：不問，模式列＝離線：匯入 ' + path.basename(CODE)); } }

  console.log('⑤ 沒匯入直接連線不問；連線 → 自動 Check（EM01）→ 回讀；確認後才即時寫入');
  { const a = await open(); const { $, w } = a;
    $('dm-link').click(); await sleep(30);
    ok(!a.askOpen(), '⑤ 沒有匯入資料 ⇒ 按連線不問');
    await wait(() => w.dmState.checked === 'EM01' && !w.dmState.busy, 4000); await sleep(200);
    ok(w.dmState.linked && w.dmState.checked === 'EM01' && a.reads() > 0 && w.dmState.src.kind === 'tcon', '連線後自動 Check T-CON 認到 EM01，之後才回讀（' + a.reads() + ' 次）');
    ok(/^on｜線上/.test(a.mode()) && /EM01/.test(a.mode()) && /已確認/.test(a.mode()), '模式列＝線上：I2C EM01（Check T-CON 已確認）');
    let wr0 = a.writes(); toggleHand(a); await wait(() => a.writes() > wr0, 1500);
    ok(a.writes() > wr0, '確認後改值 ⇒ 即時寫入');
    $('dm-model').value = 'EM02'; $('dm-model').dispatchEvent(new w.Event('change')); await sleep(150);
    wr0 = a.writes(); const rd0 = a.reads(); toggleHand(a); await sleep(250);
    ok(w.dmState.checked === null && $('dm-live').disabled && a.writes() === wr0 && a.reads() === rd0 && /^onq｜線上/.test(a.mode()), '手選換成 EM02 ⇒ 確認清掉、即時寫入停用、不讀不寫，模式列＝線上（尚未確認）');
    $('dm-check').click(); await wait(() => w.dmState.checked === 'EM01' && !w.dmState.busy, 4000); await sleep(150);
    ok(w.dmState.checked === 'EM01' && a.reads() > rd0, '再按 Check T-CON ⇒ 重新辨認＋回讀');
    /* ② 連線中匯入 → 取消 */
    if (CODE) {
      const rd1 = a.reads(), wr1 = a.writes();
      w.dmImportBytes(new Uint8Array(fs.readFileSync(CODE)), path.basename(CODE)); await sleep(50);
      ok(a.askOpen() && /匯入會中斷 I2C 連線並進入離線模式/.test(a.askT()), '連線中匯入 ⇒ 先問「匯入會中斷 I2C 連線並進入離線模式，確定？」');
      w.dmAskAnswer(false); await sleep(150);
      ok(w.dmState.linked && w.dmState.src.kind === 'tcon' && /^on｜/.test(a.mode()), '② 取消 ⇒ 維持連線、沒有匯入');
      /* ① 確定 */
      w.dmImportBytes(new Uint8Array(fs.readFileSync(CODE)), path.basename(CODE)); await sleep(50); w.dmAskAnswer(true);
      await wait(() => !w.dmState.linked && w.dmState.src.kind === 'file', 3000); await sleep(150);
      ok(!w.dmState.linked && w.dmState.checked === null && w.dmState.src.kind === 'file' && a.log.some(m => m.type === 'close'), '① 確定 ⇒ 已斷線（關 Bridge 通道）、匯入完成');
      ok(a.writes() === wr1, '① 匯入後沒有寫任何東西到 TCON');
      ok(/^off｜離線/.test(a.mode()) && a.mode().indexOf(path.basename(CODE)) >= 0, '模式列＝離線：匯入 ' + path.basename(CODE));
      /* ④ 離線時按連線 → 取消 */
      a.log.length = 0; $('dm-link').click(); await sleep(50);
      ok(a.askOpen() && /連線會清除匯入的資料/.test(a.askT()), '離線（有匯入）按連線 ⇒ 先問「連線會清除匯入的資料，改讀 TCON 實際值，確定？」');
      w.dmAskAnswer(false); await sleep(150);
      ok(!w.dmState.linked && w.dmState.src.kind === 'file' && a.log.length === 0, '④ 取消 ⇒ 維持離線、匯入保留、沒有連線');
      /* ③ 確定 */
      $('dm-link').click(); await sleep(30); w.dmAskAnswer(true);
      await wait(() => w.dmState.checked === 'EM01' && !w.dmState.busy, 4000); await sleep(200);
      ok(w.dmState.linked && !w.dmState.raw && w.dmState.src.kind === 'tcon' && w.dmState.checked === 'EM01' && a.reads() > 0, '③ 確定 ⇒ 匯入清掉、連線、自動 Check T-CON、回讀');
    }
    $('dm-link').click(); await wait(() => !w.dmState.linked, 2000); await sleep(100);
    ok(w.dmState.checked === null && $('dm-live').disabled && /^off｜/.test(a.mode()), '斷線 ⇒ 確認清掉、回到離線');
  }

  console.log('⑥ 鎖定：Check 出的型號和鎖定時不同 ⇒ 自動解鎖；同型號保留');
  { const a = await open({ id: [0x01, 0xEF, 0xA0] }); const { $, w } = a;
    $('dm-model').value = 'EM02'; $('dm-model').dispatchEvent(new w.Event('change')); await sleep(30);
    $('dm-pv-lock').click(); ok($('dm-pv-lock').getAttribute('data-locked') === '1', '離線（EM02）鎖定接線');
    await connect(a);
    ok(w.dmState.checked === 'EM01' && $('dm-pv-lock').getAttribute('data-locked') === '0' && /自動解除接線鎖定/.test(Array.from($('dm-toasts').children).map(e => e.textContent).join('|')), '⑥ 連線 Check 認到 EM01 ≠ 鎖定時 EM02 ⇒ 自動解鎖並提示');
    $('dm-pv-lock').click(); $('dm-link').click(); await wait(() => !w.dmState.linked, 2000); await sleep(100);
    await connect(a);
    ok(w.dmState.checked === 'EM01' && $('dm-pv-lock').getAttribute('data-locked') === '1', '⑥ 鎖定時 EM01、再連線 Check 也是 EM01 ⇒ 保留鎖定');
    if (CODE) { $('dm-link').click(); await wait(() => !w.dmState.linked, 2000); w.dmImportBytes(new Uint8Array(fs.readFileSync(CODE)), path.basename(CODE)); await sleep(50);
      $('dm-link').click(); await sleep(30); w.dmAskAnswer(true); await wait(() => w.dmState.checked === 'EM01' && !w.dmState.busy, 4000); await sleep(150);
      ok($('dm-pv-lock').getAttribute('data-locked') === '1' && !w.dmState.raw, '⑥ 鎖定中（EM01）匯入後再連線：清除匯入、Check 同型號 ⇒ 鎖定保留'); }
  }

  console.log('Check 失敗：不回讀、不寫');
  { const a = await open({ fail: true }); const { $, w } = a;
    await connect(a);
    ok(w.dmState.linked && w.dmState.checked === null && a.reads() === 0 && $('dm-live').disabled && /^onq｜/.test(a.mode()), 'Check 失敗 ⇒ 沒有確認、沒有回讀、即時寫入停用，模式列＝線上（尚未確認）');
    const wr0 = a.writes(); toggleHand(a); await sleep(250);
    ok(a.writes() === wr0, 'Check 失敗時改值也不會寫進 T-CON');
  }

  console.log('TCON Register 確認卡（v1.18.13）');
  { const a = await open(); const { $, d, w } = a;
    const cards = Array.from(d.querySelectorAll('.card.stp')).map(e => e.id);
    ok(cards.indexOf('card-reg') === cards.indexOf('card-pv') + 1 && cards.indexOf('card-out') === cards.indexOf('card-reg') + 1, '獨立卡 card-reg 位在 ③ 與 ④ 之間：' + cards.join(' → '));
    ok($('dm-codebox').tagName === 'DETAILS' && $('dm-codebox').open && /TCON Register 確認/.test($('dm-codebox').querySelector('summary').textContent), '卡名「TCON Register 確認」，預設展開、可收合');
    ok(!$('dm-codeonly') && !$('dm-pmhelp') && !$('card-dm').contains($('dm-code')), '「只看變動的位置」勾選已移除；② 不再有暫存器表與 Panel mode 說明表');
    ok(/^進階$/.test($('card-dm').querySelector('.dm-secfoot .dm-sech').textContent), '② 最下面區塊改名「進階」');
    if (CODE) { w.dmImportBytes(new Uint8Array(fs.readFileSync(CODE)), path.basename(CODE)); await sleep(80); }
    $('dm-reg-va').click(); await sleep(20);   // v1.18.22：預設改成依 Register 名稱；這段驗的是「依位址」檢視
    const addrs = () => Array.from(new Set(Array.from($('dm-code').querySelectorAll('tr[data-a]')).map(r => r.getAttribute('data-a'))));
    const n0 = addrs().length, sum0 = $('dm-codesum').textContent;
    ok(n0 > 24 && sum0.indexOf(n0 + ' 個位址，0 個已修改') === 0, '沒改任何值也列出全部 ' + n0 + ' 個位址（含 Panel mode 等，不只 24 個 force_sel）：' + sum0);
    const hdr = Array.from($('dm-code').querySelectorAll('th')).map(e => e.textContent).join('|');
    ok(hdr === '位址|Byte|bit|名稱|值', '欄位：' + hdr);
    const names = Array.from($('dm-code').querySelectorAll('tbody tr')).map(r => r.cells[r.cells.length - 2].textContent).join(',');
    ok(/Mirror|MIRROR/i.test(names) && /FORCE_SEL_EN|force_sel_en/i.test(names), '名稱含 Mirror、FORCE_SEL_EN 等 Panel mode 欄位');
    const mir = $('f-mirror'); mir.checked = !mir.checked; mir.dispatchEvent(new w.Event('change')); await sleep(80);
    ok(/個已修改/.test($('dm-codesum').textContent) && !/，0 個已修改/.test($('dm-codesum').textContent) && addrs().length === n0 && $('dm-code').querySelectorAll('tr.chg').length > 0, '改 Mirror ⇒ 列數不變、改過的列標色：' + $('dm-codesum').textContent);
    const inp = Array.from($('dm-code').querySelectorAll('input[data-a]')).find(i => !i.closest('tr').classList.contains('chg'));
    const aa = +inp.getAttribute('data-a'), nv = ((w.dmState.img[aa] | 0) ^ 0x01) & 0xFF;
    inp.dispatchEvent(new w.Event('focus')); inp.value = nv.toString(16).padStart(2, '0'); inp.dispatchEvent(new w.Event('blur')); await sleep(80);
    ok((w.dmState.img[aa] | 0) === nv && $('dm-code').querySelector('tr[data-a="' + aa + '"]').classList.contains('chg'), '直接改 Byte（0x' + aa.toString(16) + '）⇒ 寫進頁面值並標色');
  }

  console.log('TCON Out／SD Out 配色與點擊跳轉（v1.18.14）');
  { const a = await open(); const { $, d, w } = a;
    const scrolled = []; w.Element.prototype.scrollIntoView = function () { scrolled.push(this.id || this.className); };
    if (CODE) { w.dmImportBytes(new Uint8Array(fs.readFileSync(CODE)), path.basename(CODE)); await sleep(80); }
    const css = d.querySelector('style').textContent;
    ok(/--dm-tcon-out: #c084fc/.test(css) && /--dm-sd-out: #7dd3fc/.test(css), '共用色票 --dm-tcon-out（紫）／--dm-sd-out（藍）');
    ok($('dm-gridbox').classList.contains('dm-tcoframe') && $('dm-drv-sec').classList.contains('dm-sdframe'), '② 表格外框＝紫；Source Driver 設定區外框＝藍');
    const T = $('dm-pv-tft'), Q = sel => T.querySelector(sel), QA = sel => Array.from(T.querySelectorAll(sel));
    ok(QA('text[data-dof]').length > 0 && QA('text[data-dof]').every(e => /dm-tco/.test(e.getAttribute('class')) && e.getAttribute('data-jump') === 'tc' && e.getAttribute('tabindex') === '0') && !QA('[data-rep] text[data-dof]').length,
      'TCON Out 每欄文字：紫色 class、可點、可 Tab；前後循環不在 45% 暗組內（改 60%：' + QA('text[data-dof][opacity="0.6"]').length + ' 個）');
    ok(QA('text[data-dlab]').every(e => /dm-sdo/.test(e.getAttribute('class')) && e.getAttribute('data-jump') === 'sd'), 'SD Out 每欄 D 標號：藍色 class、可點');
    const click = el => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    scrolled.length = 0; click(Q('[data-rowhead="sd"] text')); ok(scrolled[0] === 'dm-drv-sec' && w.dmState.lastJump.kind === 'sd', '點 SD Out 標題 ⇒ 捲到 Source Driver 設定');
    scrolled.length = 0; click(Q('text[data-dlab]')); await wait(() => $('dm-drv-sec').classList.contains('dm-flash'), 1600); ok(scrolled[0] === 'dm-drv-sec' && $('dm-drv-sec').classList.contains('dm-flash'), '點 D 標號 ⇒ 捲到 Source Driver 設定，外框閃一下');
    scrolled.length = 0; click(Q('[data-rowhead="tc"] text')); ok(scrolled[0] === 'dm-gridbox' && w.dmState.lastJump.kind === 'tc', '點 TCON Out 標題 ⇒ 捲到 ② Data Mapping 表格');
    const t5 = QA('text[data-dof]').find(e => e.getAttribute('data-dof') === '5') || QA('text[data-dof]')[0], k5 = +t5.getAttribute('data-dof'), col = ((k5 - 1) % 6) + 1;
    scrolled.length = 0; click(t5); await wait(() => $('dm-grid').rows[0].cells[col].classList.contains('dm-flashcol'), 1600);
    ok(scrolled[0] === 'dm-gridbox' && w.dmState.lastJump.col === col && $('dm-grid').rows[0].cells[col].classList.contains('dm-flashcol') && $('dm-grid').rows[1].cells[col].classList.contains('dm-flashcol'), '點 Data ' + k5 + ' ⇒ 捲到 ② 表格，Data ' + col + ' 欄高亮');
    scrolled.length = 0; Q('[data-rowhead="tc"]').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); ok(scrolled[0] === 'dm-gridbox', '鍵盤 Enter 也能跳');
    scrolled.length = 0; click(d.querySelector('#card-dm [data-jump="pvtc"]')); click(d.querySelector('#dm-drv-sec [data-jump="pvsd"]')); ok(scrolled.join(',') === 'dm-pv-tfth,dm-pv-tfth', '② 與 Source Driver 區的短標籤可跳回 ③ 接線圖');
    const wr = $('dm-pv-wrap'); scrolled.length = 0;
    wr.dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 100 })); w.dispatchEvent(new w.MouseEvent('mousemove', { clientX: 140 })); w.dispatchEvent(new w.MouseEvent('mouseup', {}));
    click(t5); ok(scrolled.length === 0, '拖曳接線圖（位移 40px）後放開：不觸發跳轉');
    click(t5); ok(scrolled.length === 1, '拖曳結束後再點一次：正常跳轉');
  }

  console.log('Slave 選單（v1.18.16）');
  { const a = await open(); const { $, w } = a;
    const opts = Array.from($('dm-slave').options).map(o => o.textContent.trim());
    ok(opts.join(',') === '自動,0x68,0x69,0x6A,0x6B,0x6C,0x6D,0x6E,0x6F', '手選清單＝0x68～0x6F（原 0x68／0x69／0x60／0x61）：' + opts.join(','));
    await connect(a);
    const scan = a.log.filter(m => m.type === 'read' && m.addr === 0xFF00 && m.len === 3).map(m => '0x' + m.slave.toString(16));
    ok(scan.join(',') === '0x60,0x61,0x68' && w.dmState.checked === 'EM01', '「自動」照 PQ Tool 順序掃到 0x68 就停：' + scan.join(','));
    $('dm-link').click(); await wait(() => !w.dmState.linked, 2000);
    $('dm-slave').value = '106'; $('dm-slave').dispatchEvent(new w.Event('change'));
    a.log.length = 0; $('dm-link').click(); await wait(() => w.dmState.linked && !w.dmState.busy, 4000); await sleep(300);
    const scan2 = a.log.filter(m => m.type === 'read' && m.addr === 0xFF00 && m.len === 3).map(m => '0x' + m.slave.toString(16));
    ok(scan2.join(',') === '0x6a', '手選 0x6A ⇒ 只讀 0x6A：' + scan2.join(','));
  }

  console.log('v1.18.20：比較表點「需改 TCON」列 ⇒ 依即時寫入規則寫 Mirror');
  { const a = await open(); const { $, w } = a;
    await connect(a);
    const curKey = $('dm-pv-combotbl').querySelector('tr.dm-ccur').getAttribute('data-combo'), m0 = +curKey.charAt(4), alt = curKey.slice(0, 4) + (1 - m0);
    const wr0 = a.writes(); w.dmApplyCombo(alt); await sleep(300);
    ok((w.dmState.cur.mirror | 0) === 1 - m0 && a.writes() > wr0, '線上且 Check 已確認：套用 ' + alt + ' ⇒ ② Mirror 改成 ' + (1 - m0) + ' 並即時寫入 TCON（寫入 ' + (a.writes() - wr0) + ' 筆）');
    $('dm-link').click(); await wait(() => !w.dmState.linked, 2000);
    const wr1 = a.writes(); w.dmApplyCombo(curKey); await sleep(200);
    ok((w.dmState.cur.mirror | 0) === m0 && a.writes() === wr1, '離線：套用只改頁面上的 Mirror，不寫 TCON');
  }

  console.log('v1.18.22：Register 卡依名稱＋寫入安全');
  { const a = await open(); const { $, w, d } = a;
    w.document.getElementById('dm-model').value = 'E503'; w.document.getElementById('dm-model').dispatchEvent(new w.Event('change')); await sleep(40);
    const hdr = Array.from($('dm-code').querySelectorAll('th')).map(t => t.textContent).join('|');
    ok($('dm-reg-vf').classList.contains('on') && hdr === 'Register 名稱|值|bit 數|組成位置', '預設「依 Register 名稱」，欄位順序：' + hdr);
    const row = id => $('dm-code').querySelector('tr[data-f="' + id + '"]');
    const g10 = DMC.fieldsOf('E503').find(f => f.name === 'FORCE_SEL_G1_0');
    ok(g10 && row(g10.id).cells[0].textContent === 'FORCE_SEL_G1_0' && row(g10.id).cells[2].textContent === '5' && row(g10.id).cells[3].textContent === '0x326, 5, 5, 0x325, 7, 5, 0x324, 7, 7', 'E503 FORCE_SEL_G1_0：一列、5 bit、組成位置＝Python UI 寫法「0x326, 5, 5, 0x325, 7, 5, 0x324, 7, 7」（RomCodeProcessUI.py:1881）');
    const others = () => ['FORCE_SEL_R0_1', 'FORCE_SEL_R1_3', 'FORCE_SEL_G1_1', 'FORCE_SEL_R0_3', 'FORCE_SEL_R0_2'].map(n => w.dmState.cur[DMC.fieldsOf('E503').find(f => f.name === n).id]).join(',');
    w.dmState.img[0x324] = 0x00; const o0 = others();
    const setF = (id, v) => { const inp = row(id).querySelector('input'); inp.dispatchEvent(new w.Event('focus')); inp.value = v; inp.dispatchEvent(new w.Event('blur')); };
    setF(g10.id, '32'); await sleep(30);
    ok((w.dmState.cur[g10.id] | 0) === 0 && /5 bit，範圍 0～0x1F／31/.test(d.querySelector('.dm-toasts').textContent), '輸入 32（超過 5 bit）⇒ 不改、提示範圍 0～0x1F／31');
    setF(g10.id, '0x1F'); await sleep(30);
    const im = w.dmState.img;
    ok((w.dmState.cur[g10.id] | 0) === 31 && (im[0x326] & 0x20) && ((im[0x325] >> 5) & 7) === 7 && (im[0x324] & 0x80) && others() === o0, '輸入 0x1F ⇒ 0x326[5]、0x325[7:5]、0x324[7] 全為 1；同 byte 的其他欄位不變');
    setF(g10.id, '0b1'); await sleep(20); setF(g10.id, '10'); await sleep(30);
    ok((w.dmState.cur[g10.id] | 0) === 10 && ((im[0x326] >> 5) & 1) === 0 && ((im[0x325] >> 5) & 7) === 5 && ((im[0x324] >> 7) & 1) === 0, '輸入十進位 10（01010b）⇒ MSB 0x326[5]＝0、0x325[7:5]＝101、LSB 0x324[7]＝0');
  }
  { const a = await open(); const { $, w, d } = a;
    a.mem[(0x68 << 16) | 0x401] = 0x66;   // EM01 rt7+0x01：bit1、2、5、6 不屬於任何欄位
    await connect(a);
    const mid = DMC.fieldsOf('EM01').find(f => f.id === 'mirror');
    const before = a.log.length;
    const inp = $('dm-code').querySelector('tr[data-f="mirror"] input'); inp.dispatchEvent(new w.Event('focus')); inp.value = '1'; inp.dispatchEvent(new w.Event('blur')); await sleep(300);
    const seq = a.log.slice(before).filter(m => (m.type === 'read' || m.type === 'rawwrite') && m.addr === 0x401).map(m => m.type + (m.data ? ':' + m.data.map(x => x.toString(16)).join('') : ''));
    ok(seq.join(',') === 'read,rawwrite:67,read' && a.mem[(0x68 << 16) | 0x401] === 0x67, 'I2C：改 mirror ⇒ 先讀 0x401（66）→ 只改 bit0 寫 67 → 回讀；非欄位 bit（0x66）保留：' + seq.join(','));
    const sc = w.dmBuildScript().text;
    ok(/write -m 0401 01 99/.test(sc), '匯出 script：0401 值 01、mask 99（只含 force_sel_en／chwb／chrb／mirror 的 bit，非欄位 bit 不寫）');
    $('dm-reg-va').click(); await sleep(20);
    const bi = $('dm-code').querySelector('input[data-a="1025"]'); bi.dispatchEvent(new w.Event('focus')); bi.value = 'E7'; bi.dispatchEvent(new w.Event('blur')); await sleep(60);
    ok(/連帶改到：force_sel_en/.test(d.querySelector('.dm-toasts').textContent), '依位址改整個 byte（67→E7）⇒ 提示連帶改到 force_sel_en');
    const bi2 = $('dm-code').querySelector('input[data-a="1025"]'); bi2.dispatchEvent(new w.Event('focus')); bi2.value = 'C7'; bi2.dispatchEvent(new w.Event('blur')); await sleep(60);
    ok(/不屬於任何欄位的 bit（mask 0x66）不會寫入/.test(d.querySelector('.dm-toasts').textContent), '改到非欄位 bit（bit5）⇒ 提示「不屬於任何欄位的 bit（mask 0x66）不會寫入」');
  }
  console.log((fail ? '✗ ' : '✓ ') + 'check_datamap_tcon_gate ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('✗ ', e && e.stack || e); process.exit(1); });
