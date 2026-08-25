#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════════
常設機械檢查 ④：Line Buffer 的 .5 只准出現在 Dual Gate
───────────────────────────────────────────────────────────────────────────
Bruce 2026-08-25 逐字：「LineBuffer 出現 .5，只存在 Dual gate 的情況下。」

為什麼需要這支（而不是靠記得）：
  Line Buffer ＝ First Line Read ÷ mult，mult 只有 1（single）或 2（dual）。
  FLR 永遠是整數（它是 register 值），所以 single gate 下 LB ＝ FLR **結構上**
  不可能有小數 —— 除非有人在某一條路徑上把 `step` 或 `mult` 寫死成別的東西。
  這種錯在本機測試時看起來完全正常（畫面上就是一個數字），只有在
  「single gate ＋ 上下鍵微調」或「匯入某份 code」時才會冒出 x.5，
  而那時使用者已經拿著錯的波形在跟客戶對數字了。

本檔用**靜態掃描**擋住兩類寫法：
  ① 任何 `<X>.step = ...` 的三元條件，其條件必須是 `wfgFlrMult() === 2`
     （或等價的 `mult === 2`）—— 也就是「只有 dual 才給 0.5」。
  ② 全檔不得出現寫死的 `step="0.5"` / `step: '0.5'`（HTML 屬性或 JS 常數）。

🔴 這支只證明「程式碼沒有寫錯」。**它不能取代實機驗證** ——
   六顆型號在瀏覽器裡逐一切 single/dual 量 `step` 與實際可輸入值那一段，
   仍然要跑（見 CHANGELOG v4.24.0 的實測章節）。

用法：
  python3 tools/check_line_buffer_half_step.py
離開碼 0 = 通過，1 = 不通過。
═══════════════════════════════════════════════════════════════════════════
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.path.join(ROOT, 'wfg.html')

# 允許的 dual 判定寫法（收斂點就這兩種；新增第三種請一併加進來並說明理由）
OK_COND = re.compile(r"(wfgFlrMult\(\)|mult)\s*===?\s*2")

# `xxx.step = <cond> ? <a> : <b>;`
STEP_ASSIGN = re.compile(r"^\s*(\w+)\.step\s*=\s*(.+?);\s*$")

# 寫死的半條 step
HARD_HALF = re.compile(r"""step\s*[=:]\s*["']0\.5["']""")


def main():
    if not os.path.exists(TARGET):
        print('查不到 %s' % TARGET)
        return 1
    with open(TARGET, encoding='utf-8') as fh:
        lines = fh.read().split('\n')

    bad = []
    checked = 0
    for i, ln in enumerate(lines, 1):
        m = STEP_ASSIGN.match(ln)
        if m:
            checked += 1
            rhs = m.group(2)
            if '0.5' not in rhs:
                continue                      # 沒有半條 ⇒ 與本規則無關
            if not OK_COND.search(rhs):
                bad.append((i, ln.strip(),
                            "`.step` 給了 0.5 但條件不是 `wfgFlrMult() === 2`"))
        # HTML 屬性 / JS 常數寫死 0.5
        if HARD_HALF.search(ln) and not STEP_ASSIGN.match(ln):
            bad.append((i, ln.strip(),
                        "寫死的 step 0.5：single gate 下也會生效"))

    if bad:
        print('不通過：Line Buffer 的半條 step 有未受 dual gate 保護的寫法')
        for n, txt, why in bad:
            print('  wfg.html:%d  %s' % (n, why))
            print('      %s' % txt[:140])
        return 1

    print('通過：共檢查 %d 處 `.step` 指派，半條 step 全部只在 '
          '`wfgFlrMult() === 2`（Dual Gate）下生效，且無寫死的 step 0.5。' % checked)
    return 0


if __name__ == '__main__':
    sys.exit(main())
