// v1.18.3（Bruce 10/8）：未鎖定時 ③ 必須和 datamap-v1.17.5 逐字相同。
// 用法：git archive datamap-v1.17.5 | tar -x -C /tmp/dm1175wt；node tools/check_datamap_svg_vs_tag.js /tmp/dm1175wt . tools/check_datamap_kickoff.js <蘇坤 EM02 bin>（全民 code 讀 /tmp/qm.bin）
// v1.18.14：加 --norm（Bruce 10/8 TCON Out 紫色／SD Out 藍色＋點擊跳轉）。刻意改的只有顏色與連結屬性，正規化後仍須逐字相同：
//   ・兩邊都拿掉 text[data-dof]（TCON Out 每欄 Data k），另外把 (x, y, data-dof, transform, 文字, 主循環 M／前後循環 R) 排序後比對；
//     舊版 R＝在 45% 暗組內，新版 R＝opacity 0.6（v1.18.14 不再放進暗組）。
//   ・兩邊都拿掉 class／data-jump／tabindex／role 屬性；SD Out 每欄 D 標號與兩個列標題的 fill／font-weight 拿掉；列標題 <title> 去掉「 — 跳到…」。
//   用法：node tools/check_datamap_svg_vs_tag.js /tmp/dm1175wt . tools/check_datamap_kickoff.js <EM02 bin> --norm
// v1.18.15：加 --sem（Bruce 10/8 表頭依訊號方向：上 TCON Out、下 SD Out）。在 --norm 之外：
//   ・SD Out 每欄 D 標號（text[data-dlab]）也拿出來，依 (x, transform, 文字, 主循環／前後循環) 排序比對，不比 y；
//   ・兩個列標題（[data-rowhead]）拿掉，只比文字（去掉 <title>）；
//   ・其餘（Gate 線、Data 線路徑、TFT、子像素方格與格內文字／顏色、跳線、圖例）照樣逐字比對 innerHTML。
// 未鎖定時 ③ TFT 接線圖（#dm-pv-tft innerHTML：線端點 path d、格內文字 data-dn、標號）逐字比對
const path = require('path'), fs = require('fs');
const SEM = process.argv.includes('--sem');   // v1.18.15：表頭兩列上下對調（TCON Out 上、SD Out 下）⇒ y 不同，改語意比對（隱含 --norm）
const NORM = SEM || process.argv.includes('--norm');
const LEGACY = process.argv.includes('--legacy');   // v1.18.24：新版切回 v1.17.5 幾何（dmPvGeom(0,0)）後逐項比對；新幾何另由 check_datamap_svg_rep.js 驗證
const [BASE, NEW, KT, SK] = process.argv.slice(2).filter(x => !/^--/.test(x)).map((x, i) => i < 2 ? path.resolve(x) : x);
function normSvg(T) {
  const c = T.cloneNode(true);
  const dof = Array.from(c.querySelectorAll('text[data-dof]')).map(e => [e.getAttribute('x'), SEM ? '' : e.getAttribute('y'), e.getAttribute('data-dof'), e.getAttribute('transform') || '', Array.from(e.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent).join(''),
    (e.closest('[data-rep]') || e.getAttribute('opacity') === '0.6') ? 'R' : 'M'].join('|')).sort();
  c.querySelectorAll('title[data-jt]').forEach(e => e.remove());   // v1.18.15：圖內可點文字的滑鼠提示
  c.querySelectorAll('text[data-dof]').forEach(e => e.remove());
  let semTxt = '';
  if (SEM) {
    const own = e => Array.from(e.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent).join('');
    const dl = Array.from(c.querySelectorAll('text[data-dlab]')).map(e => [e.getAttribute('x'), e.getAttribute('transform') || '', own(e), e.getAttribute('data-dlab'), e.closest('[data-rep]') ? 'R' : 'M'].join('|')).sort();
    c.querySelectorAll('text[data-dlab]').forEach(e => e.remove());
    const rh = Array.from(c.querySelectorAll('[data-rowhead]')).map(g => g.getAttribute('data-rowhead') + '=' + Array.from(g.querySelectorAll('text')).map(own).join('')).sort();
    c.querySelectorAll('[data-rowhead]').forEach(e => e.remove());
    semTxt = '\n#DLAB ' + dl.join(';') + '\n#RH ' + rh.join(';');
  }
  c.querySelectorAll('*').forEach(e => { ['class', 'data-jump', 'tabindex', 'role'].forEach(a => e.removeAttribute(a)); });
  c.querySelectorAll('text[data-dlab], [data-rowhead] text').forEach(e => { e.removeAttribute('fill'); e.removeAttribute('font-weight'); });
  c.querySelectorAll('[data-rowhead] title').forEach(e => { e.textContent = e.textContent.replace(/ — 跳到.*$/, ''); });
  return c.innerHTML + '\n#DOF ' + dof.join(';') + semTxt;
}
const FX = JSON.parse(/const FX = (\{.*?\});\n/s.exec(fs.readFileSync(KT, 'utf8'))[1]);
const { JSDOM } = require(path.join(__dirname, '..', 'node_modules/jsdom'));
async function run(ROOT) {
  const dom = await JSDOM.fromFile(path.join(ROOT, 'datamap.html'), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, beforeParse(w) { w.WebSocket = function () { throw 1; }; } });
  await new Promise(r => dom.window.addEventListener('load', r));
  const w = dom.window, d = w.document, DM = w.DM || w.DMCore || null, out = {};
  if (LEGACY && w.dmPvGeom) w.dmPvGeom(0, 0);
  const $ = id => d.getElementById(id);
  const fire = (el, v) => { if (el.type === 'checkbox') el.checked = v; else el.value = v; el.dispatchEvent(new w.Event('change')); };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const datasets = {
    qm: async () => { fire($('dm-model'), 'EM01'); await sleep(20); w.dmImportBytes(new Uint8Array(fs.readFileSync('/tmp/qm.bin')), 'qm.bin'); await sleep(60); },
    sk: async () => { fire($('dm-model'), 'EM02'); await sleep(20); w.dmImportBytes(new Uint8Array(fs.readFileSync(SK)), path.basename(SK)); await sleep(60); },
    kmir: async () => { fire($('dm-model'), 'EM02'); await sleep(20); const mr = FX.mir, rows = [mr.line0.c0, mr.line0.c1, mr.line1.c0, mr.line1.c1];
      const s = Object.assign(require(path.join(ROOT, 'common/datamap-core.js')).emptyState('EM02'), { hand: 1, panel: 2, subPanel: 0, rd: 1, mirror: 1 }); rows.forEach((r, i) => r.forEach((v, c) => { s['c' + (i * 6 + c)] = v; })); w.dmState.cur = s; w.dmRender(); await sleep(20); },
  };
  for (const ds of Object.keys(datasets)) {
    await datasets[ds]();
    const mir0 = $('f-mirror').checked;
    for (const mi of [mir0, !mir0]) for (const first of ['l', 'r']) for (const drv of ['f', 'r']) for (const st of ['rgb', 'bgr']) for (const sw of [false, true]) {
      fire($('f-mirror'), mi); fire($('dm-pv-first'), first); fire($('dm-pv-drv'), drv); fire($('dm-pv-stripe'), st); fire($('dm-pv-swap'), sw);
      await sleep(5);
      const T = $('dm-pv-tft');
      out[ds + ' M' + (mi ? 1 : 0) + ' ' + first + drv + st + (sw ? 'S' : '')] = T ? (NORM ? normSvg(T) : T.innerHTML) : 'NONE';
    }
    fire($('f-mirror'), mir0);
  }
  return out;
}
(async () => {
  const a = await run(BASE), b = await run(NEW); let same = 0, diff = 0;
  for (const k in a) { if (a[k] === b[k]) same++; else { diff++; if (diff <= 5) { let i = 0; while (a[k][i] === b[k][i]) i++; console.log('DIFF', k, '@' + i, '\n  old:', a[k].slice(Math.max(0, i - 80), i + 120), '\n  new:', b[k].slice(Math.max(0, i - 80), i + 120)); } } }
  const mirCases = Object.keys(a).filter(k => / M1 /.test(k)).length, rCases = Object.keys(a).filter(k => / M\d r/.test(k)).length;
  console.log((diff ? '✗ ' : '✓ ') + 'SVGCMP' + (SEM ? '(sem)' : NORM ? '(norm)' : '') + (LEGACY ? '(legacy geom)' : ''), same, 'SAME /', diff, 'DIFF of', Object.keys(a).length, '(Mirror=1 cases', mirCases, ', CH1 right cases', rCases, ')'); process.exit(diff ? 1 : 0);
})();
