#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""tests/dgself/target_sync.py — 目標 Gamma／白點 DG ⇄ T-CON 自檢頁同步（真的兩個分頁，window.open）。

同事B 2026-10-19 第四封：「是不是可以直接把Gamma/色座標的設定放在這頁……DG分頁本來的目標GAMMA跟白點設定
就跟使用者在TCON自檢畫面量測同步就好」。dg v2.7.0／dgself v2.8.0。

  S1  DG 按「T-CON 自檢畫面量測」開自檢頁 ⇒ 自檢頁出現「目標 Gamma 與白點」卡，值＝DG 目前的值
  S2  自檢頁改 Gamma ⇒ DG #dg-gamma 跟著變、自動保存寫進去
  S3  自檢頁選「指定新白點」、填色溫 ⇒ DG 換算 x、y 並回傳 ⇒ 兩邊 x、y、K 一致
  S4  自檢頁填 x、y ⇒ DG 算色溫回傳
  S5  DG 改 Gamma／切回沿用目前白點 ⇒ 自檢頁跟著變
  S6  無效色溫（3000K）⇒ 兩邊都標錯
  S7  單獨開自檢頁（沒有 DG）⇒ 卡片不出現
  S8  DG「要不要調色溫」視窗列出本輪目標
用法：python3 tests/dgself/target_sync.py [--headful]
"""
import json, os, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import tabs  # noqa: E402
from tabs import Browser, ok, RES, BASE  # noqa: E402


def st_of(b):
    return b.page(lambda u: u.startswith('dg-selftest.html'))


def ev(b, t, js, gesture=False):
    return b.ev(t, js, gesture)


def st_set(b, st, id_, val):
    """在自檢頁像使用者一樣填一格（設值＋input 事件）。"""
    ev(b, st, "(function(){var e=document.getElementById(%s); e.focus(); e.value=%s;"
              "e.dispatchEvent(new Event('input',{bubbles:true})); e.blur(); return 1})()" % (json.dumps(id_), json.dumps(val)), True)
    time.sleep(0.6)


def dg_val(b, id_):
    return ev(b, b.dg(), "document.getElementById(%s).value" % json.dumps(id_))


def st_val(b, st, id_):
    return ev(b, st, "document.getElementById(%s).value" % json.dumps(id_))


def main():
    b = Browser()
    try:
        dg = b.dg()
        ev(b, dg, "localStorage.clear(), 1")
        # S1 開自檢頁（DG 自己的按鈕＝dgOpenSelftest 同一條路）
        before = {t['id'] for t in b.tabs()}
        ev(b, dg, "document.getElementById('dg-gamma').value='2.20'; document.getElementById('dg-btn-wmode-tcon').click(), 1", True)
        b.wait(lambda: st_of(b) and ev(b, st_of(b), "document.readyState==='complete'"), 20, 'selftest open')
        st = st_of(b)
        ok('S1 a new selftest tab opened', st is not None and st['id'] not in before)
        b.wait(lambda: ev(b, st, "!document.getElementById('dst-tgt-card').classList.contains('dst-hidden')"), 10, 'target card shown')
        ok('S1 target card visible', ev(b, st, "!document.getElementById('dst-tgt-card').classList.contains('dst-hidden')"))
        ok('S1 gamma mirrors DG (2.20)', st_val(b, st, 'dst-tgt-gamma') == '2.20', st_val(b, st, 'dst-tgt-gamma'))
        ok('S1 white point = keep', ev(b, st, "document.getElementById('dst-tgt-keep').checked") is True)
        ok('S1 card is above the steps card', ev(b, st, "!!(document.getElementById('dst-tgt-card').compareDocumentPosition(document.getElementById('dst-steps-card')) & 4)"))

        # S2 自檢頁改 Gamma
        st_set(b, st, 'dst-tgt-gamma', '2.4')
        ok('S2 DG gamma follows selftest (2.4)', dg_val(b, 'dg-gamma') == '2.4', dg_val(b, 'dg-gamma'))
        # S3 指定新白點＋色溫
        ev(b, st, "var r=document.getElementById('dst-tgt-new'); r.click(), 1", True)
        time.sleep(0.6)
        ok('S3 DG switched to custom white point', ev(b, b.dg(), "document.getElementById('dg-wpt-new').checked") is True)
        ok('S3 selftest shows x/y/K inputs', ev(b, st, "document.getElementById('dst-tgt-in').style.display!=='none'"))
        st_set(b, st, 'dst-tgt-cct', '10000')
        dx, dy, dk = dg_val(b, 'dg-wpt-x'), dg_val(b, 'dg-wpt-y'), dg_val(b, 'dg-wpt-cct')
        sx, sy, sk = st_val(b, st, 'dst-tgt-x'), st_val(b, st, 'dst-tgt-y'), st_val(b, st, 'dst-tgt-cct')
        ok('S3 DG got 10000 K', dk == '10000', dk)
        T = 10000.0; ex = -2.0064e9 / T ** 3 + 1.9018e6 / T ** 2 + 0.24748e3 / T + 0.23704; ey = -3 * ex * ex + 2.87 * ex - 0.275
        ok('S3 DG converted x,y with the vendor CIE daylight formula (%.6f, %.6f)' % (ex, ey), abs(float(dx) - ex) < 1e-6 and abs(float(dy) - ey) < 1e-6, (dx, dy))
        ok('S3 selftest shows the same x,y,K as DG', (sx, sy, sk) == (dx, dy, dk), (sx, sy, sk, dx, dy, dk))

        # S4 填 x、y
        st_set(b, st, 'dst-tgt-x', '0.3127')
        st_set(b, st, 'dst-tgt-y', '0.3290')
        dk = dg_val(b, 'dg-wpt-cct')
        ok('S4 DG computed CCT from x,y (~6505 K)', dk and abs(int(dk) - 6505) <= 5, dk)
        ok('S4 selftest CCT = DG CCT', st_val(b, st, 'dst-tgt-cct') == dk, st_val(b, st, 'dst-tgt-cct'))
        ok('S4 DG x,y = typed', (dg_val(b, 'dg-wpt-x'), dg_val(b, 'dg-wpt-y')) == ('0.3127', '0.3290'))

        # S6 無效色溫
        st_set(b, st, 'dst-tgt-cct', '3000')
        ok('S6 DG marks bad', ev(b, b.dg(), "document.getElementById('dg-wpt-in').classList.contains('bad')") is True)
        ok('S6 selftest marks bad + note', ev(b, st, "document.getElementById('dst-tgt-in').classList.contains('bad') && !document.getElementById('dst-tgt-bad').classList.contains('dst-hidden')") is True)

        # S5 DG 這邊改
        ev(b, b.dg(), "var g=document.getElementById('dg-gamma'); g.value='2.6'; g.dispatchEvent(new Event('input',{bubbles:true})); "
                      "var k=document.getElementById('dg-wpt-keep'); k.checked=true; k.dispatchEvent(new Event('change',{bubbles:true})), 1", True)
        time.sleep(0.6)
        ok('S5 selftest gamma follows DG (2.6)', st_val(b, st, 'dst-tgt-gamma') == '2.6', st_val(b, st, 'dst-tgt-gamma'))
        ok('S5 selftest back to keep, inputs hidden', ev(b, st, "document.getElementById('dst-tgt-keep').checked && document.getElementById('dst-tgt-in').style.display==='none' && document.getElementById('dst-tgt-bad').classList.contains('dst-hidden')") is True)

        # S5b 程式直接改值（載入範例）也會對齊
        ev(b, b.dg(), "document.getElementById('dg-gamma').value='2.3'; (window.dgApi&&dgApi.refresh)?dgApi.refresh():0, 1")

        # S8 「要不要調色溫」視窗那一行
        txt = ev(b, b.dg(), "(function(){var b=document.getElementById('dg-btn-lut-setup'); b.click(); var e=document.getElementById('dg-tone-tgt'); return e?e.textContent:''})()", True)
        ok('S8 tone modal line lists the targets', 'Gamma 2.30' in (txt or '') or 'Gamma 2.60' in (txt or ''), txt)
        no_err = ev(b, b.dg(), "(window.__errs||[]).length")
        ok('DG no JS errors captured', not no_err, no_err)
        # S7 單獨開自檢頁（noopener ⇒ 沒有 DG 可同步）
        st2 = b.open_kid('dg-selftest.html', noopener=True)
        time.sleep(1.0)
        ok('S7 standalone selftest: no target card', ev(b, st2, "document.getElementById('dst-tgt-card').classList.contains('dst-hidden')") is True)
    finally:
        b.close()

    bad = [r for r in RES if not r[0]]
    print('\n%d/%d passed' % (len(RES) - len(bad), len(RES)))
    return 1 if bad or not RES else 0


if __name__ == '__main__':
    sys.exit(main())
