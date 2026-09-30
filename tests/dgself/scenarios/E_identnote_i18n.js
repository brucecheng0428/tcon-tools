/* E：DG_EN OFF 時「使用等間距 LUT」說明的三語文字＋版號一致。 */
(async function () { try { await __wait(500); await __arm(); await __wait(200);
  window.__regs[0x005D] = 0x0C; await dstGuard(async function(){ await dstReadDgEn(); }); dstRenderBtns();
  document.getElementById('dst-lut-read').click(); await __wait(1500);
  applyLang('en'); await __wait(100); __ok('E en note', __txt('dst-lut-identnote'), __txt('dst-lut-identnote'));
  applyLang('zh-CN'); await __wait(100); __ok('E zh-CN note', /等间距/.test(__txt('dst-lut-identnote')), __txt('dst-lut-identnote')); applyLang('zh-TW'); __checkVersion('E');
 } catch (e) { window.__errs.push('test threw: ' + (e && e.stack || e)); } __done(); })();
