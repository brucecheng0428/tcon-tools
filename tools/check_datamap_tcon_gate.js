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
    /* v1.18.25（Bruce 10/8「拿掉依位址，只保留依 Register 名稱…也不用做那個 Tab」）：原本這段驗「依位址」檢視，改驗依名稱檢視 */
    ok(!$('dm-reg-va') && !$('dm-reg-vf') && !d.querySelector('#card-reg .dm-seg'), 'v1.18.25 Register 卡沒有「依位址」與切換 Tab');
    const nF = DMC.fieldsOf(w.dmState.model).length, rowsF = () => $('dm-code').querySelectorAll('tbody tr[data-f]').length, sum0 = $('dm-codesum').textContent;
    ok(rowsF() === nF && /0 個已修改/.test(sum0), '沒改任何值也列出全部 ' + nF + ' 個欄位：' + sum0);
    const names = Array.from($('dm-code').querySelectorAll('tbody tr[data-f]')).map(r => r.cells[0].textContent).join(',');
    ok(/MIRROR|mirror/i.test(names) && /FORCE_SEL_EN|force_sel_en/i.test(names), '名稱含 Mirror、FORCE_SEL_EN 等 Panel mode 欄位');
    const mir = $('f-mirror'); mir.checked = !mir.checked; mir.dispatchEvent(new w.Event('change')); await sleep(80);
    ok(!/，0 個已修改/.test($('dm-codesum').textContent) && rowsF() === nF && $('dm-code').querySelector('tr.chg[data-f="mirror"]'), '改 Mirror ⇒ 列數不變、Mirror 那列標色：' + $('dm-codesum').textContent);
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
    ok(hdr === 'Register 名稱|值|bit 數|組成位置', '依 Register 名稱，欄位順序：' + hdr);
    const row = id => $('dm-code').querySelector('tr[data-f="' + id + '"]');
    const g10 = DMC.fieldsOf('E503').find(f => f.name === 'FORCE_SEL_G1_0');
    ok(g10 && row(g10.id).cells[0].textContent === 'FORCE_SEL_G1_0' && row(g10.id).cells[2].textContent === '5' && row(g10.id).cells[3].textContent === '0x326[5],0x325[7:5],0x324[7]', 'E503 FORCE_SEL_G1_0：一列、5 bit、組成位置＝「0x326[5],0x325[7:5],0x324[7]」（v1.18.25 格式；Python UI 原寫法 0x326, 5, 5, 0x325, 7, 5, 0x324, 7, 7（RomCodeProcessUI.py:1881）');
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
  }

  console.log('v1.18.25：組成位置格式、Hand 亮色範圍、字級、回到初始設定');
  { const a = await open(); const { $, w, d } = a;
    const fmt = /^0x[0-9A-F]{3,4}\[\d+(:\d+)?\](,0x[0-9A-F]{3,4}\[\d+(:\d+)?\])*$/;
    let bad = [], n3 = 0, n1 = 0;
    for (const m of ['EM01', 'EM02', 'E512', 'E503', 'E501A', 'DAZ6138', 'DAZ6111', 'DAZ7353']) {
      if (!DMC.MODELS[m]) continue;
      $('dm-model').value = m; $('dm-model').dispatchEvent(new w.Event('change')); await sleep(20);
      Array.from($('dm-code').querySelectorAll('tbody tr[data-f]')).forEach(r => { const t = r.cells[3].textContent, f = DMC.fieldById(m, r.getAttribute('data-f'));
        const want = f.parts.map(q => '0x' + q[0].toString(16).toUpperCase().padStart(q[0] > 0xFFF ? 4 : 3, '0') + '[' + q[1] + (q[1] !== q[2] ? ':' + q[2] : '') + ']').join(',');
        if (!fmt.test(t) || t !== want || /\[(\d+):\1\]/.test(t) || / /.test(t)) bad.push(m + ' ' + f.name + ' ' + t + ' ≠ ' + want);
        if (f.parts.length >= 3) n3++; if (f.bits === 1) n1++; });
    }
    ok(!bad.length && n3 > 0 && n1 > 0, '8 型號全部欄位的組成位置＝「位址[MSB:LSB]」、單 bit 寫 [7]、逗號不加空格、高位段在前（三段 ' + n3 + ' 個、單 bit ' + n1 + ' 個）' + (bad.length ? '：' + bad.slice(0, 3).join('；') : ''));
    $('dm-model').value = 'EM01'; $('dm-model').dispatchEvent(new w.Event('change')); await sleep(20);
    const mrow = $('dm-code').querySelector('tr[data-f="mirror"]');
    ok(mrow && mrow.cells[3].textContent === '0x401[0]', 'EM01 MIRROR 單一 bit ⇒ 「0x401[0]」：' + (mrow && mrow.cells[3].textContent));
    // B：字級
    const T = $('dm-pv-tft'), fsz = sel => Array.from(new Set(Array.from(T.querySelectorAll(sel)).map(e => e.getAttribute('font-size'))));
    const cellFs = fsz('text[data-name]').filter(x => x !== '10.5');
    ok(fsz('text[data-dof]').join() === '12' && fsz('text[data-dlab]').join() === '12' && fsz('[data-rowhead] text').join() === '12' && cellFs.join() === '12',
      'TCON Out／SD Out（列頭與每欄）字級 12＝子像素格內文字 12：' + [fsz('text[data-dof]'), fsz('text[data-dlab]'), fsz('[data-rowhead] text'), cellFs].join(' / '));
    // C：下拉選單樣式
    const css = Array.from(d.querySelectorAll('style')).map(e => e.textContent).join('\n');
    ok(/appearance: base-select/.test(css) && /\.dm-cell option:hover[^{]*\{ outline: 3px solid #ffffff/.test(css) && !/\.dm-cell option:hover[^{]*\{[^}]*background/.test(css), '② 下拉：可自訂選單時 hover／focus 只加白色外框、不改底色（底色＝選項原色）');
    // A：Hand 亮色範圍（NB E501A Hand，表格 2 條 line）
    $('dm-model').value = 'E501A'; $('dm-model').dispatchEvent(new w.Event('change')); await sleep(30);
    const hand0 = w.dmState.cur.hand | 0;
    if (!hand0) { toggleHand(a); await sleep(30); }
    const rowsTier = () => { const o = {}; Array.from($('dm-pv-tft').querySelectorAll('rect[data-pv]')).forEach(r => { const k = r.getAttribute('data-pv').split(':')[0]; (o[k] = o[k] || {})[r.getAttribute('data-tier')] = ((o[k] || {})[r.getAttribute('data-tier')] | 0) + 1; }); return o; };
    let rt = rowsTier(), T2 = $('dm-pv-tft');
    ok(T2.getAttribute('data-handdim') === '1' && T2.getAttribute('data-vper') === '2' && T2.getAttribute('data-nl') === '4' && rt[1].main > 0 && rt[2].main > 0 && !rt[3].main && !rt[4].main && rt[3].rep === rt[1].main + rt[1].rep && rt[4].rep === rt[2].main + rt[2].rep,
      'Hand：② 表格 2 條 line ⇒ 只有 Line 1、2 有亮色主循環格，Line 3、4 同樣的格子全部調暗（E501A 預設 code 全 0，D1~D6 都接同一格）：' + JSON.stringify(rt));
    ok(Array.from(T2.querySelectorAll('path[data-w]')).filter(e => +e.getAttribute('data-w').split(':')[0] >= 3).every(e => e.closest('[data-rep]')), 'Hand：Line 3、4 的 TFT／drain 都在調暗組');
    ok(/Hand Mode：② 表格定義 2 列/.test($('dm-pv-pos').textContent), '③ 說明文字寫出 Hand Mode 只亮表格定義的 2 列');
    toggleHand(a); await sleep(40); T2 = $('dm-pv-tft');
    ok(T2.getAttribute('data-handdim') === '0', 'Auto（Hand 關）⇒ 維持 v1.18.24（重複列不調暗）');
  }
  { // E：離線（匯入 code）
    const a = await open(); const { $, w, d } = a;
    ok($('dm-restore') && $('dm-restore').disabled && $('dm-restore').getAttribute('data-has') === '0', '開頁沒有初始快照 ⇒「回到初始設定」停用');
    if (CODE) {
      w.dmImportBytes(new Uint8Array(fs.readFileSync(CODE)), path.basename(CODE)); await sleep(60);
      const sc0 = w.dmBuildScript().text, st0 = JSON.stringify(w.dmState.cur);
      ok(!$('dm-restore').disabled && /匯入/.test($('dm-rstst').textContent), '匯入 code ⇒ 建立初始快照、按鈕可用：' + $('dm-rstst').textContent);
      const mir = $('f-mirror'); mir.checked = !mir.checked; mir.dispatchEvent(new w.Event('change')); await sleep(30);
      const sel = $('dm-c0-0'), opt = Array.from(sel.options).find(o => o.value !== sel.value && o.value !== '__ns');
      if (opt) { sel.value = opt.value; sel.dispatchEvent(new w.Event('change')); await sleep(30); }
      ok(JSON.stringify(w.dmState.cur) !== st0, '改 Mirror 與 ② 一格 ⇒ 狀態和初始不同');
      $('dm-restore').click(); await sleep(60);
      ok(JSON.stringify(w.dmState.cur) === st0 && w.dmBuildScript().text === sc0 && /已回到初始設定：\d+ 個欄位（只改頁面；離線）/.test(d.querySelector('.dm-toasts').textContent), '離線按「回到初始設定」⇒ 全部 TCON 欄位回到匯入時、匯出 script 和匯入時逐字相同、提示一行');
      w.dmImportBytes(new Uint8Array(fs.readFileSync(CODE)), path.basename(CODE)); await sleep(60);
      ok(!!w.dmState.init && w.dmState.init.cur && JSON.stringify(w.dmState.init.cur) === st0, '再匯入一次 ⇒ 快照重建');
      w.dmClearImport(); await sleep(30);
      ok(!w.dmState.init && $('dm-restore').disabled, '清除匯入 ⇒ 快照清掉、按鈕停用');
    }
  }
  { // E：線上（mock I2C）：第一次 Check 讀回＝初始（Auto）→ 第一次開 Hand 補表格 → 改值（即時寫入）→ 還原 ⇒ 寫回＋回讀核對
    const a = await open(); const { $, w, d } = a;
    await connect(a);
    const I0 = w.dmState.init;
    ok(I0 && I0.model === 'EM01' && /第一次 Check T-CON 讀回/.test($('dm-rstst').textContent), '連線後第一次 Check 讀回 ⇒ 建立初始快照：' + $('dm-rstst').textContent);
    const auto0 = !(w.dmState.cur.hand | 0);
    if (!auto0) { toggleHand(a); await sleep(200); }
    ok(!(w.dmState.init.cur.hand | 0) || !auto0, '初始是 Auto（mock 記憶體 hand＝0）');
    toggleHand(a); await sleep(300);
    const I1 = w.dmState.init, cf = DMC.fieldsOf('EM01').filter(f => /^c\d+$/.test(f.id));
    ok(I1.handAdd && !(I1.cur.hand | 0) && cf.every(f => (I1.cur[f.id] >>> 0) === (w.dmState.cur[f.id] >>> 0)) && /第一次開 Hand Mode/.test($('dm-rstst').textContent),
      '第一次打開 Hand Mode ⇒ 把當下表格（' + cf.length + ' 格 force_sel）補進快照，快照的 Hand 仍是 Auto');
    $('dm-live').checked = true; $('dm-live').dispatchEvent(new w.Event('change'));
    const mir = $('f-mirror'); mir.checked = !mir.checked; mir.dispatchEvent(new w.Event('change')); await sleep(300);
    const sel = $('dm-c0-0'), opt = Array.from(sel.options).find(o => o.value !== sel.value && o.value !== '__ns');
    if (opt) { sel.value = opt.value; sel.dispatchEvent(new w.Event('change')); await sleep(300); }
    const want = JSON.stringify(I1.cur), wr0 = a.writes(), l0 = a.log.length;
    const r = await w.dmRestoreInit(); await sleep(200);
    const mem = addr => a.mem[(0x68 << 16) | addr] | 0;
    const enc = DMC.encode('EM01', I1.cur), memOk = enc.every(e => ((mem(e.reg) ^ e.val) & e.mask) === 0);
    const rw = a.log.slice(l0).filter(m => m.type === 'rawwrite').map(m => m.addr);
    const rbOk = rw.every(ad => a.log.slice(l0).filter(m => m.type === 'read' && m.addr === ad).length >= 2);
    ok(JSON.stringify(w.dmState.cur) === want && a.writes() > wr0 && memOk && rbOk && r && r.ok && /寫回 TCON \d+ byte，回讀核對一致/.test(d.querySelector('.dm-toasts').textContent),
      '線上按「回到初始設定」⇒ 頁面＝快照（Auto＋第一次開 Hand 的表格）、只寫不同的 byte（' + rw.length + ' 筆，每筆寫前讀、寫後回讀）、TCON 記憶體 mask 內＝快照、提示核對一致');
    ok(!(w.dmState.cur.hand | 0) && !$('dm-hand').checked, '還原後 Hand Mode Enable 回到初始的 Auto');
    $('dm-link').click(); await wait(() => !w.dmState.linked, 2000);
    ok(!!w.dmState.init && !$('dm-restore').disabled, '斷線後快照保留（離線也能回到初始）');
    $('dm-model').value = 'EM02'; $('dm-model').dispatchEvent(new w.Event('change')); await sleep(30);
    ok(!w.dmState.init && $('dm-restore').disabled, '換型號 ⇒ 快照清掉');
  }
  console.log((fail ? '✗ ' : '✓ ') + 'check_datamap_tcon_gate ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('✗ ', e && e.stack || e); process.exit(1); });
