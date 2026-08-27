#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════════
常設機械檢查 ⑤：匯出提醒視窗的紅字閃爍強調沒有被靜默拆掉
───────────────────────────────────────────────────────────────────────────
Bruce 2026-08-28：「『要到 GPO 分頁按一次 Read』還不夠明顯」「Read 要用非常大
的字體，而且用紅色的字 highlight 出來，最好還有閃爍」「『匯出的 script 一律
寫入 current』這個也用紅字閃爍 highlight 出來」。

v4.34.1 的做法是**在既有文案裡找片語、包 span**（不加字）。這個做法有一個
先天的靜默失效模式：

    片語對不上 ⇒ 什麼事都不會發生 ⇒ 畫面上就只是「沒有強調」的普通文字。
    不會拋錯、console 不會叫、i18n 也不會回傳 key（因為片語本身查得到，
    對不上的是「片語 vs 被強調的那則文案」）。

也就是說，只要日後有人改一個字（把「匯出的」改成「輸出的」、把 CURRENT 改成
Current、英文句子重寫一次），強調就會**無聲無息地消失**，而回報的人會是
Bruce ——「怎麼又不明顯了」。這正是 CLAUDE.md 說的那類錯：本機測試時不會出現，
只能靠機械檢查擋。

本檔檢查三件事（三語各驗一次）：
  ① `wfg.gpoRdHlRead` 必須是 `wfg.gpoRdName` 的子字串（否則標題那行不會有大紅字）
  ② `wfg.gpoRdHlCur` 必須是 `wfg.codeExportCurrentOnly` 的子字串
     （否則「一律寫入 CURRENT」那一句不會轉紅閃爍）
  ③ wfg.html 必須同時具備 `@keyframes wfgHlBlink`、三個 `.wfg-hl-*` class、
     `prefers-reduced-motion` 的關閉規則，以及 `wfgHlRead` / `wfgHlCur` /
     `wfgHlMsg` 三個呼叫點 —— 少任何一個都代表強調鏈被拆斷了。

🔴 這支只證明「鏈子沒斷」。**它不能取代實機驗證** —— 閃爍是不是真的在動、
   字級比例夠不夠大、三語版面會不會被 1.85em 撐爆，仍然要在瀏覽器裡看
   （見 CHANGELOG v4.34.1 的實測章節）。

用法：
  python3 tools/check_export_warn_highlight.py
離開碼 0 = 通過，1 = 不通過。
═══════════════════════════════════════════════════════════════════════════
"""
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
I18N = os.path.join(REPO, 'common', 'i18n.js')
WFG = os.path.join(REPO, 'wfg.html')
LANGS = ('zh-TW', 'en', 'zh-CN')


def read(path):
    with open(path, encoding='utf-8') as f:
        return f.read()


def grab_key(src, key):
    """從 i18n.js 取出某個 key 的三語字串。

    🔴 不用 JSON 解析：i18n.js 是 JS 原始碼（帶註解、單引號、跨行），
       解析器寫下去就是第二個會壞的東西。這裡只做一件很窄的事 ——
       找到 `'<key>':` 之後，在後面一段文字裡抓 `'<lang>': '<value>'`。
       抓不到就回 None，由呼叫端當成不通過（大聲失敗，不猜）。
    """
    m = re.search(r"'" + re.escape(key) + r"'\s*:", src)
    if not m:
        return None
    # 從 key 之後往後取一段（涵蓋三語，含跨行），到下一個頂層 key 為止。
    tail = src[m.end():m.end() + 6000]
    nxt = re.search(r"\n  '(?:wfg|pat|app|rt|isp|aux|calc|ui|nav)\.", tail)
    if nxt:
        tail = tail[:nxt.start()]
    out = {}
    for lang in LANGS:
        mm = re.search(r"'" + re.escape(lang) + r"'\s*:\s*'((?:\\.|[^'\\])*)'", tail)
        if mm:
            # JS 字串轉義還原：本檔只關心 \n 與 \' \\ 這三種（文案裡出現過的）。
            v = mm.group(1)
            v = v.replace('\\n', '\n').replace("\\'", "'").replace('\\\\', '\\')
            out[lang] = v
    return out if len(out) == len(LANGS) else None


def main():
    fails = []

    i18n = read(I18N)
    wfg = read(WFG)

    pairs = [
        # (片語 key, 被強調的文案 key, 這條斷掉時使用者會看到什麼)
        ('wfg.gpoRdHlRead', 'wfg.gpoRdName',
         '標題那一行的「Read」不會變成大紅字'),
        ('wfg.gpoRdHlCur', 'wfg.codeExportCurrentOnly',
         '「匯出的 script 一律寫入 CURRENT」那一句不會轉紅閃爍'),
    ]

    for hl_key, text_key, why in pairs:
        hl = grab_key(i18n, hl_key)
        tx = grab_key(i18n, text_key)
        if hl is None:
            fails.append('找不到（或三語不齊）i18n key：%s' % hl_key)
            continue
        if tx is None:
            fails.append('找不到（或三語不齊）i18n key：%s' % text_key)
            continue
        for lang in LANGS:
            if hl[lang] not in tx[lang]:
                fails.append(
                    '[%s] %s 的片語不是 %s 的子字串 ⇒ %s\n'
                    '        片語：%r\n'
                    '        文案開頭：%r'
                    % (lang, hl_key, text_key, why, hl[lang], tx[lang][:60]))

    # ③ 強調鏈的另一半：CSS 與呼叫點。少一個都等於整條鏈斷掉。
    #
    # 🔴 用**正則加尾界**而不是 `in`：第一版寫成 `'@keyframes wfgHlBlink' in wfg`，
    #    負控制把動畫改名成 `wfgHlBlinkXXX` 時**照樣通過** —— 因為改名後的字串
    #    仍然包含原字串當前綴。子字串比對對「改名」這種最常見的破壞方式沒有鑑別力，
    #    而檢查本身沒有鑑別力比沒有檢查更糟（它會給人一個假的綠燈）。
    need = [
        (r'@keyframes\s+wfgHlBlink\s*\{', '閃爍動畫本體'),
        (r'\.wfg-hl-key\b', '大紅字（Read）的 class'),
        (r'\.wfg-hl-cur\b', 'CURRENT／次級強調的 class'),
        (r'\.wfg-hl-warn\b', '整句紅字閃爍的 class'),
        (r'animation:\s*wfgHlBlink\b', 'class 真的有掛上那個動畫'),
        (r'prefers-reduced-motion', '尊重系統「減少動態效果」的關閉規則'),
        (r'function\s+wfgHlWrap\b', '包 span 的工具函式'),
        (r'wfgHlRead\(\s*escapeHtml\b', '標題行的呼叫點'),
        (r'wfgHlCur\(\s*escapeHtml\b', '說明行的呼叫點'),
        (r'wfgHlMsg\(\s*escapeHtml\b', '訊息項的呼叫點'),
    ]
    for pat, why in need:
        if not re.search(pat, wfg):
            fails.append('wfg.html 找不到 /%s/（%s）' % (pat, why))

    # 🔴 順序契約：一定是 escapeHtml() 之後才包 span。反過來標籤會被跳脫成字面，
    #    畫面上會出現 `<span class="wfg-hl-key">Read</span>` 這串字。
    if re.search(r'escapeHtml\(\s*wfgHl(Read|Cur|Msg)\(', wfg):
        fails.append('順序錯誤：出現 escapeHtml(wfgHl...(...))，'
                     '必須是 wfgHl...(escapeHtml(...))，否則 span 會被跳脫成字面')

    if fails:
        print('🛑 匯出提醒視窗的強調鏈檢查未通過（%d 項）：' % len(fails))
        for f in fails:
            print('  ・' + f)
        print('\n  修法：讓片語重新成為文案的子字串，或同步更新 '
              'wfg.gpoRdHlRead / wfg.gpoRdHlCur。')
        return 1

    print('✅ 匯出提醒視窗的強調鏈完整（三語片語命中、CSS 與三個呼叫點齊備）')
    return 0


if __name__ == '__main__':
    sys.exit(main())
