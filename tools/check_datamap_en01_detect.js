// 用法：node tools/check_datamap_en01_detect.js [repo]
// datamap v1.37.2（Bruce 2026-10-22「I2C check TCON 明明是 EN01 的，卻會跑出 6138」「把所有 6138 的 T-CON check 方式都移掉，
//   然後 EN01 檢查一下」；派工 238945607310413824）：整頁＋假 I2C and AUX Bridge（jsdom）按 Check T-CON：
//   ① RM81008 的各種 7C／7D 回應 ⇒ 都認成 EN01；送出順序＝先 M-Bus→C-Bus（0x7E:0xAB←CD）再讀任何 ID 暫存器
//   ② 舊版會判成 DAZ6138 的回應 ⇒ 認不出（不切到 DAZ6138），畫面列出讀到的原始值
//   ③ DAZ6138／DAZ6139 仍可在型號下拉手選
const path = require('path');
const ROOT = path.resolve(process.argv[2] || '.');
const { JSDOM, VirtualConsole } = require(path.join(ROOT, 'node_modules/jsdom'));
let fail = 0, pass = 0; const ok = (c, m, d) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || d == null ? '' : '  ' + d)); if (c) pass++; else fail++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const key = (s, a) => s.toString(16).toUpperCase() + ':' + a.toString(16).toUpperCase();
async function open(mem, nack) {
  const log = [];
  const vc = new VirtualConsole(); vc.on('jsdomError', e => { console.log('jsdomError', e.message); });
  const dom = await JSDOM.fromFile(path.join(ROOT, 'datamap.html'), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.WebSocket = function () {
        const ws = this; ws.readyState = 0;
        setTimeout(() => { ws.readyState = 1; ws.onopen && ws.onopen(); }, 5);
        ws.send = s => { const m = JSON.parse(s); log.push(m); let r = { id: m.id, ok: true };
          if (m.type === 'ping') r = { id: m.id, ok: true, helper: 'mock', proto: 1 };
          else if (m.type === 'read') {
            if (nack.includes(m.slave) || (m.addr === 0xFF00 && m.len === 3)) r = { id: m.id, ok: false, err: 'nack' };
            else { const a = []; for (let i = 0; i < m.len; i++) { const v = mem[key(m.slave, m.addr + i)]; a.push(v == null ? 0 : v); } r = { id: m.id, ok: true, data: a }; }
          } else if (m.type === 'rawwrite') { if (nack.includes(m.slave)) r = { id: m.id, ok: false, err: 'nack' }; }
          setTimeout(() => ws.onmessage && ws.onmessage({ data: JSON.stringify(r) }), 1); };
        ws.close = () => { ws.readyState = 3; setTimeout(() => ws.onclose && ws.onclose(), 1); };
      };
    } });
  await new Promise(r => dom.window.addEventListener('load', r));
  return { w: dom.window, d: dom.window.document, $: id => dom.window.document.getElementById(id), log };
}
const wait = async (f, ms) => { for (let i = 0; i < (ms || 4000) / 20; i++) { if (f()) return true; await sleep(20); } return false; };
const isIdRead = m => m.type === 'read' && (m.slave === 0x7C || m.slave === 0x7D || (m.slave === 0x3E && m.addr === 0x207E) || m.addr === 0xFF00);
const EN01 = [
  ['RM81008 A1：7C:98＝0、7D:007D＝0A（舊版判 DAZ6138 的情況）', { '7C:95': 0x22, '7C:98': 0, '7D:7D': 0x0A, '3E:207E': 0x10 }, []],
  ['RM81008 A2：7C:98＝0、7D:007D＝1F', { '7C:95': 0x22, '7C:98': 0, '7D:7D': 0x1F, '3E:207E': 0x11 }, []],
  ['RM81008 A1：7D:007D＝03（與 E503 撞）', { '7C:95': 0x22, '7C:98': 0, '7D:7D': 0x03, '3E:207E': 0x10 }, []],
  ['RM81008 A1：7C:95＝20、7C:98＝01（不在 E501 表）、7D 不回', { '7C:95': 0x20, '7C:98': 0x01, '3E:207E': 0x10 }, [0x7D]],
  ['RM81008 A2：7C、7D 都不回', { '3E:207E': 0x11 }, [0x7C, 0x7D]],
];
const OLD6138 = [
  ['舊 6138 回應：7D:007D＝0A、3E:207E＝00', { '7C:95': 0x22, '7C:98': 0, '7D:7D': 0x0A, '3E:207E': 0x00 }, []],
  ['舊 6138 回應：7D:007D＝77、3E:207E＝FF', { '7C:95': 0x00, '7C:98': 0, '7D:7D': 0x77, '3E:207E': 0xFF }, []],
  ['舊 6138 回應：7D:007D＝0A、3E 不回', { '7C:95': 0x22, '7C:98': 0, '7D:7D': 0x0A }, [0x3E]],
];
(async () => {
  console.log('① RM81008 ⇒ EN01，先導通再辨認');
  for (const [nm, mem, nack] of EN01) {
    const a = await open(mem, nack);
    a.$('dm-link').click();
    await wait(() => a.w.dmState.linked && !a.w.dmState.busy && a.w.dmState.checked, 5000); await sleep(150);
    ok(a.w.dmState.checked === 'EN01' && a.w.dmState.model === 'EN01' && /EN01/.test(a.$('dm-ic').textContent), nm + ' ⇒ EN01', JSON.stringify({ checked: a.w.dmState.checked, ic: a.$('dm-ic').textContent }));
    const iW = a.log.findIndex(m => m.type === 'rawwrite' && m.slave === 0x7E && m.addr === 0xAB && m.data && m.data[0] === 0xCD);
    const iR = a.log.findIndex(isIdRead);
    ok(iW >= 0 && iR > iW, '  └ 送出順序：0x7E:0xAB←CD（M-Bus→C-Bus）在第一筆 ID 讀取之前', 'w=' + iW + ' r=' + iR);
    const iRb = a.log.findIndex((m, i) => i > iR && m.type === 'read' && m.slave === 0x3E && m.addr !== 0x207E);
    if (iRb >= 0) { const iW2 = a.log.slice(0, iRb).map(m => m.type === 'rawwrite' && m.slave === 0x7E).lastIndexOf(true);
      ok(iW2 > iR, '  └ 認到 EN01 後回讀前也先下一次 0x7E:0xAB←CD（preamble，同 RCP2 Load／Register 讀寫前 TasksMtoC）', 'w2=' + iW2 + ' r=' + iR); }
  }
  console.log('② 舊 6138 回應 ⇒ 認不出（不再判 DAZ6138）');
  for (const [nm, mem, nack] of OLD6138) {
    const a = await open(mem, nack);
    a.$('dm-link').click();
    await wait(() => a.w.dmState.linked && !a.w.dmState.busy && /認不出/.test(a.$('dm-ic').textContent), 5000); await sleep(150);
    const t = a.$('dm-ic').textContent;
    ok(!a.w.dmState.checked && a.w.dmState.model !== 'DAZ6138' && a.w.dmState.model !== 'DAZ6139' && /認不出/.test(t) && /7D:007D/.test(t) && !/DAZ613x/.test(t), nm + ' ⇒ 認不出、沒切到 DAZ6138、列出原始值', JSON.stringify({ checked: a.w.dmState.checked, model: a.w.dmState.model, ic: t }));
  }
  console.log('③ 手選清單');
  { const a = await open({}, []); const opts = [...a.$('dm-model').options].map(o => o.value);
    ok(opts.includes('DAZ6138') && opts.includes('DAZ6139') && opts.includes('EN01'), '型號下拉仍有 DAZ6138／DAZ6139（手選）與 EN01', opts.join(',')); }
  console.log(`\n${fail ? '✗' : '✓'} check_datamap_en01_detect ${pass} pass / ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
