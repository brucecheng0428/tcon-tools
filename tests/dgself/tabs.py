#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""tests/dgself/tabs.py — 「查看光學資料比較 ↗」跨分頁實測（真的多個分頁，不是假 window.open）。

Bruce 2026-09-30：比較分頁可能是別的頁開的，這一頁手上沒有它的參照。驗三種情境（＋兩個延伸）：
  T1   DG 開的比較分頁已存在 ⇒ 自檢頁按 ⇒ 沿用同一個、帶到前面
  T2   自檢頁開的已存在     ⇒ DG 加入第 2 組（已開的比較分頁自動更新）⇒ 量測頁按 ⇒ 沿用、帶到前面、2 組
  T2b  量測頁開的已存在     ⇒ 自檢頁按 ⇒ 沿用、帶到前面
  T3   兩者都沒有           ⇒ 自檢頁按 ⇒ 新開一個、在前面、資料正確
  T3b  自檢頁不在同一個 browsing context group（noopener 開的）⇒ 找不到別人開的那個 ⇒ 新開第二個、在前面；
       兩個比較分頁資料相同；DG 再加一組 ⇒ 兩個都自動更新（不缺筆、不衝突）
做法：本機 http 伺服器直接服務 repo（同一個來源，localStorage 共用），自有 profile 的 headless Chrome（CDP）。
「帶到前面」＝那個分頁 document.visibilityState === 'visible'，其餘都 hidden
（實測 headless=new 與實體視窗結果一致）。按鈕一律帶 userGesture（等同使用者點的）。
DG 的資料用產品自己的 `dg-cmp-add` 處理器加入（真的寫自動保存），不直接改 localStorage。

用法：python3 tests/dgself/tabs.py [T1 T2 ...]   選項：--headful 開實體視窗
退出碼：0 全過；1 有失敗；2 跑不起來。
"""
import functools, http.server, json, os, shutil, socketserver, subprocess, sys, tempfile, threading, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from run import CDP, free_port, CHROME, REPO  # noqa: E402

HEADFUL = '--headful' in sys.argv
WANT = [a for a in sys.argv[1:] if not a.startswith('--')]
RES = []


def ok(name, cond, detail=''):
    RES.append((bool(cond), name, detail))
    print(('PASS ' if cond else 'FAIL ') + name + ('' if cond else '  | ' + str(detail)), flush=True)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def serve():
    port = free_port()
    srv = socketserver.ThreadingTCPServer(('127.0.0.1', port), functools.partial(Quiet, directory=REPO))
    srv.daemon_threads = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return 'http://127.0.0.1:%d/' % port


BASE = serve()


class Browser:
    def __init__(self):
        self.dp = free_port()
        self.prof = tempfile.mkdtemp(prefix='dgself-tabs-')
        args = [CHROME, '--user-data-dir=' + self.prof, '--remote-debugging-port=%d' % self.dp,
                '--no-first-run', '--no-default-browser-check', '--window-size=1200,800']
        if not HEADFUL:
            args.append('--headless=new')
        args.append(BASE + 'dg.html')
        self.p = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(150):
            try:
                urllib.request.urlopen('http://127.0.0.1:%d/json/version' % self.dp).read()
                break
            except Exception:
                time.sleep(0.1)
        self.wait(lambda: self.ev(self.dg(), "!!(window.dgApi && document.readyState==='complete')"), 20, 'DG ready')

    def close(self):
        self.p.terminate()
        try:
            self.p.wait(10)
        except Exception:
            self.p.kill()
        shutil.rmtree(self.prof, ignore_errors=True)

    def tabs(self):
        return [t for t in json.load(urllib.request.urlopen('http://127.0.0.1:%d/json/list' % self.dp)) if t['type'] == 'page']

    def ev(self, t, expr, gesture=False):
        c = CDP(t['webSocketDebuggerUrl'])
        try:
            r = c.call('Runtime.evaluate', expression=expr, returnByValue=True, userGesture=gesture, awaitPromise=True)
            return r.get('result', {}).get('value')
        finally:
            c.s.close()

    def wait(self, fn, sec, what):
        t0 = time.time()
        while time.time() - t0 < sec:
            try:
                if fn():
                    return True
            except Exception:
                pass
            time.sleep(0.2)
        raise RuntimeError('timeout: ' + what)

    def page(self, pred):
        m = [t for t in self.tabs() if pred(t['url'].replace(BASE, ''))]
        return m[0] if m else None

    def dg(self):
        return self.page(lambda u: u == 'dg.html')

    def views(self):
        return [t for t in self.tabs() if 'view=cmp' in t['url']]

    def activate(self, t):
        urllib.request.urlopen('http://127.0.0.1:%d/json/activate/%s' % (self.dp, t['id'])).read()
        time.sleep(0.6)

    def visible(self):
        out = []
        for t in self.tabs():
            try:
                if self.ev(t, 'document.visibilityState') == 'visible':
                    out.append(t['url'].replace(BASE, ''))
            except Exception:
                pass
        return out

    # ── 動作 ──
    def dg_add(self, name):
        """用 DG 自己的 dg-cmp-add 處理器加一組（真的寫自動保存），回傳加完的組數。
        每組 task 與數值都不同（同 task／逐值相同會被 DG 當成同一筆）。"""
        self.nadd = getattr(self, 'nadd', 0) + 1
        k = self.nadd
        n = self.ev(self.dg(), """(function(){
          var rows=[]; for (var g=0; g<256; g++) rows.push([g,0.3127,0.329,Math.pow(g/255,2.2)*200+0.1+%d]);
          var prim=[['r',0.64,0.33,40],['g',0.30,0.60,130],['b',0.15,0.06,15]];
          window.dispatchEvent(new MessageEvent('message',{data:{type:'dg-cmp-add',task:%d,name:%s,edited:true,
            rows:rows,prim:prim,at:'t',kind:'pc',job:'main'},origin:location.origin,source:null}));
          var w=JSON.parse(localStorage.getItem('tcon-dg-autosave')||'null'); return w&&w.shared?w.shared.slots.length:-1; })()"""
                    % (k, 100 + k, json.dumps(name)))
        return n

    def open_kid(self, file, noopener=False):
        before = {t['id'] for t in self.tabs()}
        self.ev(self.dg(), "window.open(%s,'_blank'%s), true" % (json.dumps(file), ",'noopener'" if noopener else ''), gesture=True)
        self.wait(lambda: [t for t in self.tabs() if t['id'] not in before and file.split('?')[0] in t['url']
                           and self.ev(t, "document.readyState==='complete'")], 20, 'open ' + file)
        t = [t for t in self.tabs() if t['id'] not in before and file.split('?')[0] in t['url']][0]
        time.sleep(1.0)
        return t

    def click_view(self, t, kind):
        """在該頁按「查看光學資料比較 ↗」（使用者點擊）。自檢頁／量測頁都用產品的按鈕處理器。"""
        self.activate(t)
        btn = 'dst-cmp-view' if kind == 'st' else 'dgm-cmp-view' if kind == 'dm' else None
        if btn:
            r = self.ev(t, "document.getElementById('%s').click(), 'ok'" % btn, gesture=True)
        else:   # DG 本身沒有這顆鈕；模擬「DG 開的比較分頁」：DG 用同一個名字 window.open
            r = self.ev(t, "!!window.open('dg.html?view=cmp','tcon-dg-cmpview')", gesture=True)
        time.sleep(1.5)
        self.wait(lambda: all(self.ev(v, "document.readyState==='complete' && !!window.dgApi") for v in self.views()), 20, 'view loaded')
        time.sleep(0.5)
        return r

    def view_counts(self):
        return [self.ev(v, 'window.dgApi.viewCount()') for v in self.views()]


def expect_front_single(b, tag, n_sets):
    vs, vis = b.views(), b.visible()
    ok(tag + ' exactly one comparison tab', len(vs) == 1, [v['url'] for v in vs])
    ok(tag + ' it is brought to the front (only visible tab)', len(vis) == 1 and 'view=cmp' in vis[0], vis)
    ok(tag + ' shows %d sets' % n_sets, b.view_counts() == [n_sets], b.view_counts())


def T1(b):
    b.dg_add('第一輪 A')
    st = b.open_kid('dg-selftest.html?round=1&job=main')
    b.click_view(b.dg(), 'dg')
    ok('T1 DG-opened comparison tab exists', len(b.views()) == 1, len(b.views()))
    b.click_view(st, 'st')
    expect_front_single(b, 'T1 selftest ⇒', 1)


def T2(b):
    b.dg_add('第一輪 A')
    st = b.open_kid('dg-selftest.html?round=1&job=main')
    dm = b.open_kid('dg-measure.html?task=7')
    b.click_view(st, 'st')
    expect_front_single(b, 'T2 selftest first ⇒', 1)
    n = b.dg_add('第二輪 B')
    ok('T2 DG now has 2 sets', n == 2, n)
    b.wait(lambda: b.view_counts() == [2], 10, 'open comparison tab auto-updates')
    ok('T2 already-open comparison tab auto-updated to 2 (storage event)', b.view_counts() == [2], b.view_counts())
    b.click_view(dm, 'dm')
    expect_front_single(b, 'T2 then measure page ⇒', 2)


def T2b(b):
    b.dg_add('第一輪 A')
    dm = b.open_kid('dg-measure.html?task=7')
    st = b.open_kid('dg-selftest.html?round=1&job=main')
    b.click_view(dm, 'dm')
    expect_front_single(b, 'T2b measure first ⇒', 1)
    b.click_view(st, 'st')
    expect_front_single(b, 'T2b then selftest ⇒', 1)


def T3(b):
    b.dg_add('第一輪 A')
    b.dg_add('第二輪 B')
    st = b.open_kid('dg-selftest.html?round=1&job=main')
    ok('T3 no comparison tab yet', len(b.views()) == 0)
    b.click_view(st, 'st')
    expect_front_single(b, 'T3 none existed ⇒ new tab', 2)
    b.click_view(st, 'st')
    expect_front_single(b, 'T3 press again ⇒ same tab', 2)


def T3b(b):
    b.dg_add('第一輪 A')
    dm = b.open_kid('dg-measure.html?task=7')
    b.click_view(dm, 'dm')
    expect_front_single(b, 'T3b measure ⇒', 1)
    st = b.open_kid('dg-selftest.html?round=1&job=main', noopener=True)
    b.click_view(st, 'st')
    vs, vis = b.views(), b.visible()
    ok('T3b other group ⇒ a second comparison tab (worst case, not "nothing")', len(vs) == 2, len(vs))
    ok('T3b the new one is in front', len(vis) == 1 and 'view=cmp' in vis[0], vis)
    ok('T3b both show the same data (1 set)', b.view_counts() == [1, 1], b.view_counts())
    b.dg_add('第二輪 B')
    b.wait(lambda: b.view_counts() == [2, 2], 10, 'both update')
    ok('T3b DG adds one ⇒ both comparison tabs update to 2 (no missing set, no conflict)', b.view_counts() == [2, 2], b.view_counts())
    raw = b.ev(b.dg(), "localStorage.getItem('tcon-dg-autosave')")
    time.sleep(1.2)
    ok('T3b comparison tabs never write the autosave', b.ev(b.dg(), "localStorage.getItem('tcon-dg-autosave')") == raw)


TESTS = [('T1', T1), ('T2', T2), ('T2b', T2b), ('T3', T3), ('T3b', T3b)]


def main():
    if not os.path.exists(CHROME):
        print('找不到 Chrome：' + CHROME)
        return 2
    for name, fn in TESTS:
        if WANT and name not in WANT:
            continue
        b = Browser()
        try:
            fn(b)
        except Exception as e:
            ok(name + ' ran to the end', False, repr(e))
        finally:
            b.close()
    bad = [r for r in RES if not r[0]]
    print('\n%d/%d passed' % (len(RES) - len(bad), len(RES)))
    return 1 if bad or not RES else 0


if __name__ == '__main__':
    sys.exit(main())
