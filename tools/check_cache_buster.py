#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════════
常設機械檢查 ②：改了 common/*.js 就必須 bump 引用它的頁面的 ?v=
───────────────────────────────────────────────────────────────────────────
為什麼需要這支：common/ 底下的檔案是跨頁共用的，瀏覽器與 GitHub Pages 都會
快取。若改了 i18n.js 卻沒 bump 引用它的 `?v=`，線上會繼續吃舊檔 ——
新增的 i18n key 查不到翻譯，t() 就把 key 本身印在畫面上；version.js 沒更新
則版本徽章停在舊版號。兩者在本機測試時都不會出現（本機不走同一套快取），
所以必須用機械檢查擋，不能靠記得。

實測案例：pattern.html 的 cache buster 停在 v2.16.0 那次，
v2.17.0 / v3.0.0 / v3.1.0 連續三版都沒 bump，線上因此顯示未翻譯的 key。

用法：
  python3 tools/check_cache_buster.py                # 檢查工作區未提交的改動
  python3 tools/check_cache_buster.py --rev HEAD     # 檢查最後一個 commit
離開碼 0 = 通過，1 = 不通過。
═══════════════════════════════════════════════════════════════════════════
"""
import re
import subprocess
import sys
import os
import glob

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class GitUnavailable(RuntimeError):
    pass


def git(args):
    """跑 git 並在失敗時大聲失敗。

    🔴 不可以把「git 執行失敗」誤當成「沒有改動」。實測過一種環境：git 在該檔案
    系統上會 Resource deadlock / Bus error，`git diff` 回空字串且退出碼非 0；
    若照單全收就會印出「通過：本次沒有改動」——一支永遠說通過的檢查器比沒有還糟。
    """
    r = subprocess.run(['git', '-C', ROOT] + args, capture_output=True, text=True)
    if r.returncode != 0:
        raise GitUnavailable(
            'git ' + ' '.join(args) + ' 失敗（退出碼 ' + str(r.returncode) + '）：'
            + (r.stderr.strip().split('\n')[0] if r.stderr.strip() else '(無錯誤訊息)'))
    return r.stdout


def changed_files(rev=None):
    if rev:
        out = git(['diff-tree', '--no-commit-id', '--name-only', '-r', rev])
    else:
        out = git(['diff', '--name-only', 'HEAD'])
    return [f for f in out.split('\n') if f.strip()]


def read_at(rel, rev=None):
    """讀某個版本的檔案內容；rev 為 None 時讀工作區。"""
    if rev is None:
        try:
            return open(os.path.join(ROOT, rel), encoding='utf-8').read()
        except OSError:
            return ''
    # 檔案在該版本不存在是正常情況（新檔），回空字串；其他 git 失敗則往上拋。
    r = subprocess.run(['git', '-C', ROOT, 'show', rev + ':' + rel],
                       capture_output=True, text=True)
    if r.returncode != 0:
        if 'does not exist' in r.stderr or 'exists on disk' in r.stderr or 'unknown revision' in r.stderr:
            return ''
        raise GitUnavailable('git show ' + rev + ':' + rel + ' 失敗：'
                             + (r.stderr.strip().split('\n')[0] or '(無錯誤訊息)'))
    return r.stdout


def buster_in(src, common_file):
    """從 html 原始碼取出引用 common_file 的 ?v= 值（沒引用回 None）"""
    m = re.search(r'src="' + re.escape(common_file) + r'\?v=([^"]*)"', src)
    return m.group(1) if m else None


def main():
    rev = None
    if '--rev' in sys.argv:
        rev = sys.argv[sys.argv.index('--rev') + 1]

    changed = changed_files(rev)
    common_changed = [f for f in changed if f.startswith('common/') and f.endswith('.js')]
    if not common_changed:
        print('通過：本次沒有改動 common/*.js，無需 bump cache buster。')
        return 0

    # 🔴 兩邊都要取自「同一個檢查對象」：檢查某個 commit 時，現值必須讀該 commit
    #    的內容，不能讀工作區 —— 否則工作區已修好的檔案會讓真正出問題的頁面漏掉。
    #    （這支檢查器第一版就犯了這個錯，跑 --rev HEAD 時唯一該被抓的 pattern.html
    #      反而沒有出現在清單裡。）
    base = (rev + '^') if rev else 'HEAD'
    cur = rev  # None = 工作區

    # 版號有變的工具代號 → 任何顯示該工具版號的頁面都必須 bump version.js 的 ?v=，
    # 即使那個頁面本身沒被改到。首頁就是這種情況：它用
    # data-tool-version="pattern" 顯示 Pattern Generator 的版號，只改 pattern.html
    # 的 ?v= 並不會讓首頁的徽章更新。這條規則不能靠人看提醒，必須機械化。
    bumped_tools = set()
    if 'common/version.js' in common_changed:
        def versions(src):
            return dict(re.findall(r"(\w+)\s*:\s*'(v[^']+)'", src))
        vnow = versions(read_at('common/version.js', cur))
        vold = versions(read_at('common/version.js', base))
        bumped_tools = {k for k, v in vnow.items() if vold.get(k) != v}

    def shows_bumped_tool(rel, src):
        return any(('data-tool-version="%s"' % k) in src for k in bumped_tools)

    # 分兩級：
    #   必須 — 本次一起改動的頁面，或顯示了版號有變之工具的頁面
    #   提醒 — 其他引用同一支 common 檔的頁面（新增 key 對它們無害，但改到既有
    #          key 或共用行為時就有影響，交由人判斷）
    must, warn = [], []
    for common_file in common_changed:
        for html in sorted(glob.glob(os.path.join(ROOT, '*.html'))):
            rel = os.path.relpath(html, ROOT)
            src_now = read_at(rel, cur)
            now = buster_in(src_now, common_file)
            if now is None:
                continue  # 這個頁面沒引用該檔
            before = buster_in(read_at(rel, base), common_file)
            if before is None or before != now:
                continue  # 已經 bump 過
            hard = (rel in changed) or (common_file == 'common/version.js'
                                        and shows_bumped_tool(rel, src_now))
            (must if hard else warn).append((rel, common_file, now))

    if must:
        print('🔴 不通過：本次一起改動的頁面沒有 bump ?v=')
        for rel, cf, v in must:
            print(f'   {rel} 引用 {cf}?v={v} —— 與前一版相同，線上會繼續吃舊快取')
        print('\n   修法：把該頁 <script src="…?v=…"> 的值改成新的，'
              '慣例是 yyyymmdd + 工具代號 + 版號（例：20260803pat311）。')
        if warn:
            print('\n   另有其他引用同一支 common 檔、但本次未改動的頁面（需自行判斷）：')
            for rel, cf, v in warn:
                print(f'     {rel} ← {cf}?v={v}')
        return 1

    print('通過：本次改動的頁面對應的 cache buster 都已 bump。')
    for f in common_changed:
        print(f'   改動了 {f}')
    if warn:
        print('   提醒：以下頁面也引用同一支 common 檔但本次未改動，'
              '若這次動到既有 key 或共用行為，它們也要一起 bump：')
        for rel, cf, v in warn:
            print(f'     {rel} ← {cf}?v={v}')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except GitUnavailable as e:
        # 大聲失敗：無法取得改動清單就無法判定，一律視為不通過。
        print('🔴 無法判定（不是通過）：' + str(e))
        print('   這個環境的 git 無法正常讀取此工作區，請改在 git 可用的環境執行本檢查。')
        sys.exit(2)
