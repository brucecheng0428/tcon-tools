#!/usr/bin/env python3
"""name_guard_gen.py — 產生 tools/name-guard.json（對外網頁人名檢查用的雜湊名單）

為什麼是雜湊：repo 是公開的。把同事／客戶名單明文放進 repo，本身就是外洩。
這裡只存 sha256(SALT + 名字)，檢查時把頁面上的字切成候選片段再雜湊比對（tools/name-guard.mjs）。

名單來源（只在本機有，不進 repo）：
  1) assistant_kb/通訊錄/*.md 的檔名（「English (中文).md」「中文.md」）
  2) assistant_kb/datamap/RD問答/*.md 的檔名（RD 窗口）
  3) assistant_kb/reference/對外網頁人名檢查名單.md 的條列（信件寄件人、暱稱等通訊錄沒有的）
中文名同時存繁體與簡體（opencc）。

用法：python3 tools/name_guard_gen.py [--kb ~/Obsidian/assistant_kb] [--out tools/name-guard.json]
需要：pip install opencc-python-reimplemented
"""
import argparse, hashlib, json, os, re, sys

SALT = 'tcon-tools-name-guard-v1|'
# 不當成「單字名」的英文字：一般英文字、職務代稱、拼音姓氏（拼音名第一個字多半是姓，單獨出現不算人名）
STOP = set('''Monitor Tablet Will Max Team Grace Lee Song
Zhang Liu Li Wang Huang Xu Lu Gao Chen Bai Dan Hou Pan Ran Sha Shen Tang Wei Xie Yao Zheng Zuo Jia Lin Wu
Chang
Ken Sam Tim Vic Rui Eric'''.split())
# 其他不當單字名的字（拼音全名、代號等本身就是人名，明文不能放進公開 repo）：放 assistant_kb/reference/對外網頁人名檢查_不當單字名.md，
#   一行可放多個字、# 開頭是註解；main() 讀進 STOP（2026-10-22 改寫歷史時從上面的清單移出）。
CJK = re.compile(r'[㐀-鿿]')


def sha(s):
    return hashlib.sha256((SALT + s).encode('utf-8')).hexdigest()[:20]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--kb', default=os.path.expanduser('~/Obsidian/assistant_kb'))
    ap.add_argument('--out', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'name-guard.json'))
    ap.add_argument('--list', action='store_true', help='只印出明文名單（本機檢查用，不寫檔）')
    a = ap.parse_args()
    stop_extra = os.path.join(a.kb, 'reference', '對外網頁人名檢查_不當單字名.md')
    if os.path.exists(stop_extra):
        for line in open(stop_extra, encoding='utf-8'):
            if not line.lstrip().startswith('#'):
                STOP.update(line.split())
    try:
        import opencc
        t2s = opencc.OpenCC('t2s').convert
        s2t = opencc.OpenCC('s2t').convert
    except Exception:
        sys.exit('需要 opencc：pip3 install --user opencc-python-reimplemented')

    cjk, en_full, en_one = set(), set(), set()

    def add_cjk(n):
        n = re.sub(r'\s+', '', n)
        if len(n) < 2 or len(n) > 4 or not all(CJK.match(c) for c in n):
            return
        for v in {n, t2s(n), s2t(n)}:
            cjk.add(v)

    def add_en(n):
        toks = re.findall(r"[A-Za-z][A-Za-z'\-]*", n)
        if not toks:
            return
        if len(toks) == 1:
            if toks[0] not in STOP and len(toks[0]) >= 3:
                en_one.add(toks[0])
            return
        en_full.add(' '.join(toks))
        en_full.add(toks[0] + ' ' + toks[-1])
        if toks[0] not in STOP and len(toks[0]) >= 3:
            en_one.add(toks[0])

    def add_any(n):
        n = n.strip()
        if not n:
            return
        if CJK.search(n):
            add_cjk(n)
        else:
            add_en(n)

    d = os.path.join(a.kb, '通訊錄')
    for f in sorted(os.listdir(d)):
        if not f.endswith('.md'):
            continue
        base = re.sub(r'_\d+$', '', f[:-3])
        if base.startswith('未命名') or 'Team' in base:
            continue
        if base.startswith('Bruce Cheng'):   # 網站作者本人（頁尾 Designed by Bruce），不擋
            continue
        m = re.match(r'^(.*?)\s*\((.*?)\)\s*$', base)
        if m:
            outer, inner = m.group(1), m.group(2)
            if outer.startswith('Grace'):      # Grace(寰科)：括號是公司
                add_any('Grace'); continue
            for part in (outer, inner):
                part = re.sub(r'^(Monitor|Tablet)\s+', '', part)
                if part in ('Monitor', 'Tablet'):
                    continue
                if part.endswith('總') or part.endswith('工'):   # 陳總／莫工：稱謂，取姓不取
                    continue
                add_any(part)
        else:
            add_any(base)
    d2 = os.path.join(a.kb, 'datamap', 'RD問答')
    if os.path.isdir(d2):
        for f in os.listdir(d2):
            if f.endswith('.md') and not f.startswith('待問'):
                for p in f[:-3].split('_'):
                    add_any(p)
    extra = os.path.join(a.kb, 'reference', '對外網頁人名檢查名單.md')
    if os.path.exists(extra):
        for line in open(extra, encoding='utf-8'):
            m = re.match(r'^\s*[-*]\s+(.+?)\s*(?:#.*)?$', line)
            if m:
                for p in re.split(r'[,，、]', m.group(1)):
                    add_any(p)
    if a.list:
        print('CJK', sorted(cjk)); print('EN_FULL', sorted(en_full)); print('EN_ONE', sorted(en_one)); return
    out = {
        'v': 1,
        'salt': SALT,
        'note': '對外網頁人名檢查（雜湊名單，明文來源在 assistant_kb，不進 repo）。由 tools/name_guard_gen.py 產生。',
        'counts': {'cjk': len(cjk), 'enFull': len(en_full), 'enOne': len(en_one)},
        'cjk': sorted(sha(x) for x in cjk),
        'enFull': sorted(sha(x) for x in en_full),
        'enOne': sorted(sha(x) for x in en_one),
    }
    with open(a.out, 'w', encoding='utf-8') as fh:
        json.dump(out, fh, ensure_ascii=False, indent=0)
        fh.write('\n')
    print('寫入 %s：中文 %d、英文全名 %d、英文單名 %d' % (a.out, len(cjk), len(en_full), len(en_one)))


if __name__ == '__main__':
    main()
