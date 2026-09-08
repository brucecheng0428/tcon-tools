/* dg.html 文案字數量測（改前／改後對照用）
   「可見字數」＝ 該區塊 textContent 去掉所有空白字元後的長度。
   HTML 註解不計（jsdom 的 textContent 不含 Comment 節點）。
   每一層另外拆成兩塊：
     · 說明文字 ＝ `.dg-note`（就是 Bruce 說的「廢話」那一塊）
     · 選項與按鈕 ＝ `.dg-lut-opt-title` ＋ `button`（不可壓縮的骨架）
   用法：node tools/dg_wordcount.js [dg.html 路徑]  */
'use strict';
var fs = require('fs');
var path = require('path');
var JSDOM = require(process.env.DG_JSDOM || 'jsdom').JSDOM;

var file = process.argv[2] || path.join(__dirname, '..', 'dg.html');
var dom = new JSDOM(fs.readFileSync(file, 'utf8'));
var doc = dom.window.document;

function cnt(s) { return (s || '').replace(/\s+/g, '').length; }
function txt(el) { return el ? cnt(el.textContent) : 0; }
function sum(el, sel) {
  if (!el) return 0;
  var n = 0;
  Array.prototype.forEach.call(el.querySelectorAll(sel), function (e) { n += txt(e); });
  return n;
}

var rows = [];
function add(group, name, total, note, opt) {
  rows.push({ group: group, name: name, n: total, note: note, opt: opt });
}

var MODALS = [
  ['dg-modal-lut', '① 設定 RGB 的 LUT'],
  ['dg-modal-gray', '② 設定白灰階亮度'],
  ['dg-modal-slot', '光學比較：新增資料'],
  ['dg-modal-prim', '③ 設定 RGB 純色 Pattern']
];
MODALS.forEach(function (m) {
  var box = doc.getElementById(m[0]);
  if (!box) return;
  Array.prototype.forEach.call(box.querySelectorAll('.dg-lut-step'), function (s) {
    add('視窗', m[1] + ' ▸ ' + s.getAttribute('data-step'),
      txt(s), sum(s, '.dg-note'), sum(s, '.dg-lut-opt-title') + sum(s, 'button'));
  });
});

Array.prototype.forEach.call(doc.querySelectorAll('.dg-info-src'), function (e) {
  add('說明鈕', '#' + e.id, txt(e), txt(e), 0);
});

/* JS 內字串常值裡的 HTML（提醒視窗）*/
var html = fs.readFileSync(file, 'utf8');
function grabFn(name) {
  var i = html.indexOf('function ' + name + '(');
  if (i < 0) return null;
  var j = html.indexOf('\n  }', i);
  return html.slice(i, j < 0 ? i + 4000 : j);
}
function strLits(src) {
  if (!src) return '';
  var out = '', re = /'((?:[^'\\]|\\.)*)'/g, m;
  while ((m = re.exec(src))) out += m[1];
  return out;
}
function cntHtmlStr(s) { return cnt(String(s).replace(/<[^>]*>/g, '')); }
var a = cntHtmlStr(strLits(grabFn('dgGrayNoXYNote')).replace(/^[^,]*,/, ''));
add('提醒視窗', 'dgGrayNoXYNote()', a, a, 0);
var b = cntHtmlStr(strLits(grabFn('dgPrimNaSync')));
add('提醒視窗', 'dgPrimNaSync()', b, b, 0);

var groups = {};
rows.forEach(function (r) { (groups[r.group] = groups[r.group] || []).push(r); });
var T = 0, TN = 0, TO = 0;
Object.keys(groups).forEach(function (g) {
  console.log('\n── ' + g + ' ──   (合計 / 說明文字 / 選項與按鈕)');
  var s = 0, sn = 0, so = 0;
  groups[g].forEach(function (r) {
    console.log('  ' + String(r.n).padStart(5) + String(r.note).padStart(7)
      + String(r.opt).padStart(7) + '   ' + r.name);
    s += r.n; sn += r.note; so += r.opt;
  });
  console.log('  ' + String(s).padStart(5) + String(sn).padStart(7) + String(so).padStart(7) + '   ── 小計');
  T += s; TN += sn; TO += so;
});
console.log('\n════ 總計 ' + T + ' 字（說明文字 ' + TN + ' ／ 選項與按鈕 ' + TO + '）════');
