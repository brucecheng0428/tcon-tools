#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""version_bump_check.py — 版號判定的機械檢查（守則 B，2026-08-03）

────────────────────────────────────────────────────────────────────────────
解的問題
  `docs/VERSIONING.md` 於 2026-08-02 訂立，其中 R2 明文寫著「一波重整以 MAJOR 開頭、
  波內後續各自判定」，理由就寫在條文裡：「否則會出現 v2.0.0 → v3.0.0 → v4.0.0 這種編號」。
  2026-08-03 實測結果（git log --format 於 common/version.js）：
      50af00d  pattern v2.0.0   ← 波的開頭 MAJOR
      ...      pattern v2.1.0 ~ v2.17.0
      a5c842c  pattern v3.0.0   ← 波內第 2 次 MAJOR（違反 R2）
      2c3ec80  pattern v4.0.0   ← 波內第 3 次 MAJOR（違反 R2）
  規則寫得再清楚，只要判定完全靠人在當下自覺，壓力大的時候就會失效。

🔴 2026-08-12 修訂：本工具第一版**沒擋住同一個錯的第二次**
  6e32687  wfg v4.0.0   ← 波內第 2 次 MAJOR（違反 R2），本工具放行
  原因：第一版把「波內再進 MAJOR」的放行條件設成「有沒有填 `波次宣告：` 這個欄位」，
  而那個欄位是**自由填寫**的。agent 只要寫一段「上一波已在 vX 結束、本版開啟新的一波」
  就通過了 —— 防呆被一個自己填的欄位繞過去。
  更根本的問題：`VERSIONING.md` **從未定義「一波如何結束」**，所以「這是新的一波」
  這個判斷本身沒有可檢驗的判準，任何說詞都不可證偽。**不可證偽的欄位不能當閘門。**

  修法（依 Bruce 2026-08-12 裁示）：
    · MAJOR 一律需要 `MAJOR 核准：<人名> <YYYY-MM-DD>` —— 這不是判斷題，是**事實陳述**：
      有沒有人核准過。填了而實際沒有＝說謊，不是判斷失準，性質完全不同。
    · `波次宣告：` **保留但降級**為純說明，**不再構成任何放行條件**。
    · 開新波必須有 Bruce 的明示裁示，agent 不得自行判定某一波「已結束」
      （已寫進 `docs/VERSIONING.md` §1 R2）。

設計原則
  1. 判定級別**不是**由人宣告，而是由 `common/version.js` 的數字跳躍**算出來**；
     人在 CHANGELOG 標的級別只是「宣告」，兩者不一致就是錯，機械可比。
  2. R2 不靠記憶：波的開頭由 git 歷史算出來（回溯該工具上一次 MAJOR）。
  3. 「為什麼是這個級別」必須是 CHANGELOG 裡一個**具名欄位**（`判定依據：`），
     不是散落在文字裡讓人事後解讀。欄位缺席＝機械可測，不需要任何關鍵字清單。

     🔴 為什麼用具名欄位而不是「文字裡有沒有提到規則」：
        後者是列舉式判準（要列出 R1/R2/R3/案例 N/判準…），列舉必漏，本專案已經
        在 brief_guard 的收據觸發、gate_selfcheck 的寫入目標掃描上各吃過一次虧。
        「某個欄位在不在」是 schema 層的事實，措辭怎麼改都不影響判定。
  4. 🔴 **閘門只能建立在不可自行認定的事實上。** 「這是不是新的一波」是判斷，agent
     自己就能認定 → 不可當閘門。「Bruce 有沒有核准」是外部事實，agent 認定不了
     → 可以當閘門。第一版違反這條，所以被繞過去了。

退出碼
  0 = 全部通過（或本次沒有任何版號變動）
  1 = 有違規（呼叫端應該拒絕 commit / 拒絕宣告上線）
  2 = 檢查本身跑不起來（缺 git、缺檔案、解析不出來）——**不當作通過**

用法
  version_bump_check.py --worktree     # 比 HEAD 與工作區（commit 前）
  version_bump_check.py --staged       # 比 HEAD 與 index（pre-commit hook 用）
  version_bump_check.py --head         # 比 HEAD~1 與 HEAD（已 commit，宣告上線前用）
  version_bump_check.py --repo <path>  # 指定 repo（預設 tcon-tools-deploy）
  version_bump_check.py --json         # 機器可讀輸出（hook 用）
"""
import os, re, sys, json, subprocess, datetime

DEFAULT_REPO = os.path.expanduser("~/ClaudeData/Projects/tcon-tools-deploy")
VERSION_FILE = "common/version.js"
CHANGELOG = "CHANGELOG.md"
HISTORY_LIMIT = 400            # 回溯 version.js 的 commit 數上限

# CHANGELOG 條目標頭（C3 格式）：## <中文名> (<tool>) vX.Y.Z — YYYY-MM-DD ｜ LEVEL
ENTRY_RE = re.compile(
    r"^##\s+.*?\((?P<tool>[a-z][a-z0-9_]*)\)\s+v(?P<ver>\d+\.\d+\.\d+)\s*[—\-–]\s*"
    r"(?P<date>\d{4}-\d{2}-\d{2})\s*[｜|]\s*(?P<level>MAJOR|MINOR|PATCH)\b",
    re.M)
# 版號來源：var TOOL_VERSIONS = { pattern: 'v3.1.0', ... }
VER_RE = re.compile(r"^\s*([a-z][a-z0-9_]*)\s*:\s*'v?(\d+)\.(\d+)\.(\d+)'", re.M)

# 具名欄位（schema，不是關鍵字列舉）
FIELD_BASIS = "判定依據"      # 為什麼是這個級別
FIELD_WAVE = "波次宣告"       # 🔻 2026-08-12 降級：純說明，**不再是放行條件**
FIELD_APPROVAL = "MAJOR 核准"  # 🔴 MAJOR 唯一的放行條件（外部事實，agent 認定不了）
FIELD_ROLLBACK = "版號回溯核准"  # 🔴 版號倒退唯一的放行條件（同上）

# `MAJOR 核准：Bruce 2026-08-12` —— 要有核准人與日期，兩者缺一不可
APPROVAL_RE = re.compile(r"^(?P<who>\S+)\s+(?P<date>\d{4}-\d{2}-\d{2})\s*$")

# MAJOR 被擋下時印的說明。獨立成常數，是為了讓「這不是補個欄位就能過的」
# 這件事在錯誤訊息裡講到不能再清楚 —— 下一個 agent 只會看到這段字。
MAJOR_BLOCK_HELP = """
  ─────────────────────────────────────────────────────────────────────────
  🔴 這不是「補一個欄位就能過」的檢查。
     `%(field)s：` 記錄的是**外部事實**（Bruce 有沒有核准過這次 MAJOR），
     不是可以自己判斷、自己填的說明欄。**沒有實際取得核准就填 = 說謊。**

  R2 原文（docs/VERSIONING.md §1）：
     「一波重整以 MAJOR 開頭，波內的後續步驟依自身性質各自判定
      （否則會出現 v2.0.0 → v3.0.0 → v4.0.0 這種荒謬編號）。
       波內若移除既有入口，算在開頭那個 MAJOR 的宣告範圍內，不再另計。」
     並且：**開新波必須有 Bruce 的明示裁示，agent 不得自行判定某一波「已結束」。**

  前車之鑑（同一個錯已經發生兩次）：
     · 2c3ec80  pattern v4.0.0 —— 波內第 3 次 MAJOR，事後回溯更正為 v3.1.0
     · 6e32687  wfg     v4.0.0 —— 波內第 2 次 MAJOR，事後回溯更正為 v3.6.0
       ↑ 這一次填了 `%(wave)s：` 就被本工具放行。那個欄位現在**只是說明，不放行**。
     兩次的共同點都是「改動看起來很大 → 覺得該進 MAJOR」。
     **改動大小不是 MAJOR 的判準**，wfg 的 2.x 一路走到 v2.97.475 就是對照。

  正確做法：
     1. 先照 §1 判定表與 R1~R4 逐項判，取最高者 —— 多半會落在 MINOR 或 PATCH；
     2. 真的認為必須進 MAJOR（＝要開新的一波）→ **停下來問 Bruce**，取得裁示後
        在該 CHANGELOG 條目寫上一行：  %(field)s：Bruce YYYY-MM-DD
     3. 不確定就照較低的級別編，並在 `%(basis)s：` 裡寫明取捨供覆核。
        編低了可以下次補，編高了會永久留在 git 歷史裡。
""" % {"field": FIELD_APPROVAL, "wave": FIELD_WAVE, "basis": FIELD_BASIS}

ROLLBACK_BLOCK_HELP = """
  ─────────────────────────────────────────────────────────────────────────
  🔴 版號倒退預設就是錯的。`docs/VERSIONING.md` §5 與 CHANGELOG 頂端公告都寫著
     「**歷史版號一律不回溯調整**」—— 改了會讓 CHANGELOG 與 git commit 裡的版號永久矛盾。
     絕大多數看似「上一版編錯了」的情況，正確處置是**在下一版的 CHANGELOG 註明**，
     不是把號碼改回去。

  唯一的合法途徑：**Bruce 明示裁示**，並在該 CHANGELOG 條目寫上一行：
        %(field)s：Bruce YYYY-MM-DD

  取得裁示前必須先窮舉回溯成本並全部處理完（§5 明示例外那張表）：
     · git commit message 裡的舊版號改不掉 —— **不改寫歷史、不 force push、不 rebase**，
       只能用一個新的更正 commit ＋ CHANGELOG〈版號更正紀錄〉說明
     · 有沒有 git tag / GitHub Release 指向舊版號（`git tag` 要確認）
     · 各 html 的 cache buster `?v=` 字串要一起改
     · 舊版號是否已對外宣告、是否已被外部紀錄引用
  成本可窮舉且已全部處理完 → 才可行；否則不動歷史。

  已核准的回溯會改以「被回溯掉的那一版**之前**」為基準重新判定級別，
  其餘檢查（判定依據、宣告級別相符、MAJOR 核准）一項都不會少。
""" % {"field": FIELD_ROLLBACK}


def die(msg):
    print("VERSION CHECK CANNOT RUN: %s" % msg)
    sys.exit(2)


def git(repo, *args):
    p = subprocess.run(["git", "-C", repo] + list(args),
                       capture_output=True, text=True, timeout=60)
    if p.returncode != 0:
        raise RuntimeError("git %s -> rc=%d %s" % (" ".join(args), p.returncode,
                                                   (p.stderr or "")[:200]))
    return p.stdout


def parse_versions(text):
    out = {}
    for m in VER_RE.finditer(text or ""):
        out[m.group(1)] = (int(m.group(2)), int(m.group(3)), int(m.group(4)))
    return out


def vstr(t):
    return "v%d.%d.%d" % t


def classify(old, new):
    """算出這次跳躍的級別。回傳 (level, 說明)。level ∈ MAJOR/MINOR/PATCH/IRREGULAR"""
    if new == old:
        return None, "無變動"
    if new < old:
        return "IRREGULAR", "版號倒退 %s → %s" % (vstr(old), vstr(new))
    om, oi, op = old
    nm, ni, npz = new
    if nm != om:
        if nm != om + 1:
            return "IRREGULAR", "MAJOR 一次跳 %d 格（%s → %s）" % (nm - om, vstr(old), vstr(new))
        if (ni, npz) != (0, 0):
            return "IRREGULAR", "進 MAJOR 但 minor/patch 未歸零（%s）" % vstr(new)
        return "MAJOR", "%s → %s" % (vstr(old), vstr(new))
    if ni != oi:
        if ni != oi + 1:
            return "IRREGULAR", "MINOR 一次跳 %d 格（%s → %s）" % (ni - oi, vstr(old), vstr(new))
        if npz != 0:
            return "IRREGULAR", "進 MINOR 但 patch 未歸零（%s）" % vstr(new)
        return "MINOR", "%s → %s" % (vstr(old), vstr(new))
    if npz != op + 1:
        return "IRREGULAR", "PATCH 一次跳 %d 格（%s → %s）" % (npz - op, vstr(old), vstr(new))
    return "PATCH", "%s → %s" % (vstr(old), vstr(new))


def changelog_entry(cl_text, tool, ver):
    """回傳 (level, body) 或 (None, None)。body = 該條目到下一個 '## ' 之前的全文。"""
    for m in ENTRY_RE.finditer(cl_text or ""):
        if m.group("tool") != tool or m.group("ver") != ver:
            continue
        start = m.end()
        nxt = cl_text.find("\n## ", start)
        body = cl_text[start:] if nxt < 0 else cl_text[start:nxt]
        return m.group("level"), body
    return None, None


def has_field(body, name):
    """具名欄位存在且有內容。允許 `判定依據：xxx` / `**判定依據**：xxx` / `- 判定依據: xxx`。"""
    if not body:
        return False
    pat = re.compile(r"(?:^|\n)[\s\-\*>#]*(?:\*\*)?%s(?:\*\*)?\s*[:：]\s*(\S.*)" % re.escape(name))
    m = pat.search(body)
    return bool(m and len(m.group(1).strip()) >= 4)


def field_value(body, name):
    pat = re.compile(r"(?:^|\n)[\s\-\*>#]*(?:\*\*)?%s(?:\*\*)?\s*[:：]\s*(.*)" % re.escape(name))
    m = pat.search(body or "")
    # `**欄位：** 內容` 這種寫法（粗體含冒號）會讓收尾的 `**` 落進值裡，先剝掉
    return (m.group(1).strip().lstrip("*").strip() if m else "")


def _check_approval(value, m_date=None):
    """驗 `MAJOR 核准：<人名> <YYYY-MM-DD>`。回傳 (ok, 說明)。

    為什麼要驗格式而不是「有字就算」：格式鬆的欄位會退化成「寫點東西交差」，
    第一版的 `波次宣告` 就是這樣被填成一段作文然後放行的。
    要求具名的人與具體的日期，是為了讓「這行是不是真的」可以事後被 Bruce 一眼查核。
    """
    if not value:
        return False, "欄位缺席"
    m = APPROVAL_RE.match(value.strip().strip("*` "))
    if not m:
        return False, "格式不符，實際內容：%r" % value[:60]
    try:
        d = datetime.date(*[int(x) for x in m.group("date").split("-")])
    except ValueError:
        return False, "日期不是合法日期：%s" % m.group("date")
    today = datetime.date.today()
    if d > today:
        return False, "核准日期 %s 在未來（今天 %s）——核准不可能還沒發生就存在" % (d, today)
    return True, "核准人 %s，日期 %s" % (m.group("who"), d)


def _batch_blobs(repo, specs):
    """一次 subprocess 取回多個 <sha>:<path> 的內容（git cat-file --batch）。
    為什麼不用逐個 git show：實測 400 個 commit 逐個 spawn 會讓檢查跑到逾時
    （第一版就是這樣被自己的 45 秒上限擋掉的），而 hook 只有幾十秒可用。
    回傳 {spec: text}；取不到的 spec 直接缺席，不拋例外。"""
    inp = ("\n".join(specs) + "\n").encode("utf-8")
    p = subprocess.run(["git", "-C", repo, "cat-file", "--batch"],
                       input=inp, capture_output=True, timeout=120)
    out, buf, i = {}, p.stdout, 0
    for spec in specs:
        nl = buf.find(b"\n", i)
        if nl < 0:
            break
        header = buf[i:nl].decode("utf-8", "replace")
        i = nl + 1
        parts = header.split()
        if len(parts) < 3 or parts[1] != "blob":
            continue                      # missing / 非 blob，跳過
        size = int(parts[2])
        out[spec] = buf[i:i + size].decode("utf-8", "replace")
        i += size + 1                     # 內容後面固定一個 \n
    return out


def version_history(repo, tool, ref="HEAD"):
    """回傳該工具在 git 歷史上的版號序列，由新到舊：[(sha, subject, ver_tuple)]。
    ref 決定回溯的起點（--at 模式要從被檢查的那個 commit 往回看，不是從 HEAD）。"""
    log = git(repo, "log", ref, "--format=%H\x1f%s", "-%d" % HISTORY_LIMIT,
              "--", VERSION_FILE)
    rows = [l.split("\x1f", 1) for l in log.splitlines() if "\x1f" in l]
    blobs = _batch_blobs(repo, ["%s:%s" % (sha, VERSION_FILE) for sha, _ in rows])
    out = []
    for sha, subj in rows:
        v = parse_versions(blobs.get("%s:%s" % (sha, VERSION_FILE), "")).get(tool)
        if v:
            out.append((sha, subj, v))
    return out


def last_major_commit(repo, tool, hist):
    """回傳 (sha, subject, from_ver, to_ver) —— 歷史上最後一次 major 增加的那一版。
    hist 由新到舊。找不到回 None。"""
    for i in range(len(hist) - 1):
        sha, subj, v = hist[i]
        _, _, prev = hist[i + 1]
        if v[0] > prev[0]:
            return (sha, subj, prev, v)
    return None


def check(repo, mode, at=None):
    problems, notes, checked = [], [], []
    hist_ref = "HEAD"
    for f in (VERSION_FILE, CHANGELOG):
        if not os.path.exists(os.path.join(repo, f)):
            die("repo 缺少 %s（repo=%s）" % (f, repo))
    try:
        if mode == "at":
            # 不 checkout、不動工作區，直接比對任一個歷史 commit 與它的前一版。
            # 回歸測試要重現 2026-08-03 的事故就是靠這個模式。
            old_txt = git(repo, "show", "%s~1:%s" % (at, VERSION_FILE))
            new_txt = git(repo, "show", "%s:%s" % (at, VERSION_FILE))
            cl_txt = git(repo, "show", "%s:%s" % (at, CHANGELOG))
            base_desc = "%s~1 → %s" % (at, at)
            hist_ref = at
        elif mode == "head":
            old_txt = git(repo, "show", "HEAD~1:%s" % VERSION_FILE)
            new_txt = git(repo, "show", "HEAD:%s" % VERSION_FILE)
            cl_txt = git(repo, "show", "HEAD:%s" % CHANGELOG)
            base_desc = "HEAD~1 → HEAD"
        elif mode == "staged":
            old_txt = git(repo, "show", "HEAD:%s" % VERSION_FILE)
            new_txt = git(repo, "show", ":%s" % VERSION_FILE)          # index
            try:
                cl_txt = git(repo, "show", ":%s" % CHANGELOG)
            except Exception:
                cl_txt = git(repo, "show", "HEAD:%s" % CHANGELOG)
            base_desc = "HEAD → index(staged)"
        else:
            old_txt = git(repo, "show", "HEAD:%s" % VERSION_FILE)
            new_txt = open(os.path.join(repo, VERSION_FILE), encoding="utf-8").read()
            cl_txt = open(os.path.join(repo, CHANGELOG), encoding="utf-8").read()
            base_desc = "HEAD → 工作區"
    except Exception as e:
        die("取檔失敗：%s: %s" % (type(e).__name__, e))

    old, new = parse_versions(old_txt), parse_versions(new_txt)
    if not new:
        die("解析不出任何版號（%s 格式改了？）" % VERSION_FILE)

    for tool, nv in sorted(new.items()):
        ov = old.get(tool)
        if ov is None:
            notes.append("%s 是新工具（%s），本檢查不判級別" % (tool, vstr(nv)))
            continue
        level, why = classify(ov, nv)
        if level is None:
            continue
        checked.append(tool)

        # ── 版號回溯（倒退）：預設違規，唯一出口是 Bruce 明示裁示 ──────────────
        # 為什麼要留這個出口而不是一律擋死：擋死的實際後果是走 `git commit --no-verify`，
        # 那等於整道閘門在最需要它的時候被整個關掉。留一個**要具名核准**的窄門，
        # 檢查才會留在流程裡。門的性質與 MAJOR 那道一樣：外部事實，agent 認定不了。
        if level == "IRREGULAR" and nv < ov:
            _, rb_body = changelog_entry(cl_txt, tool, "%d.%d.%d" % nv)
            ok_rb, rb_note = _check_approval(field_value(rb_body, FIELD_ROLLBACK))
            if not ok_rb:
                problems.append(
                    "[%s] 版號倒退 %s → %s，且沒有有效的 `%s：` 核准標記（%s）。\n"
                    "      需要的格式（整行）：  %s：Bruce YYYY-MM-DD\n%s"
                    % (tool, vstr(ov), vstr(nv), FIELD_ROLLBACK, rb_note,
                       FIELD_ROLLBACK, ROLLBACK_BLOCK_HELP))
                continue
            # 核准後改以「被回溯掉的那一版之前」為基準重判 —— 回溯不等於免檢，
            # 只是換一個正確的比較基準，其餘每一項檢查照跑。
            try:
                hist = version_history(repo, tool, hist_ref)
                base = next((v for _, _, v in hist if v != ov), None)
            except Exception as e:
                problems.append("[%s] 版號回溯已核准，但讀 git 歷史失敗（%s）"
                                "，無法確定重判基準——不當作通過" % (tool, type(e).__name__))
                continue
            if base is None:
                problems.append("[%s] 版號回溯已核准，但 git 歷史裡找不到 %s 之前的版本"
                                "，無法確定重判基準——不當作通過" % (tool, vstr(ov)))
                continue
            level, why = classify(base, nv)
            notes.append("[%s] 版號回溯已核准（%s）：%s → %s。改以被回溯版之前的 %s 為基準"
                         "重判 → %s（%s）"
                         % (tool, rb_note, vstr(ov), vstr(nv), vstr(base), level, why))
            if level is None:
                notes.append("[%s] 回溯後與基準同版，無級別可判" % tool)
                continue

        if level == "IRREGULAR":
            problems.append("[%s] 版號跳躍不合法：%s" % (tool, why))
            continue

        ver = "%d.%d.%d" % nv
        declared, body = changelog_entry(cl_txt, tool, ver)

        # C2：條目必須存在（C3 格式）
        if declared is None:
            problems.append(
                "[%s] %s（實算 %s）在 CHANGELOG 找不到符合 C3 格式的條目。"
                "應為 `## <名稱> (%s) v%s — YYYY-MM-DD ｜ %s`"
                % (tool, why, level, tool, ver, level))
            continue

        # C3：宣告的級別必須等於實算的級別
        if declared != level:
            problems.append(
                "[%s] CHANGELOG 標 %s，但 version.js 的實際跳躍是 %s（%s）。"
                "宣告與事實不符——級別由數字算出，不由標註決定"
                % (tool, declared, level, why))

        # C4：必須有書面判定理由（具名欄位）
        if not has_field(body, FIELD_BASIS):
            problems.append(
                "[%s] v%s 的 CHANGELOG 條目缺少 `%s：` 欄位。"
                "VERSIONING.md 的哪一條、為什麼是 %s，必須寫下來才算判定過"
                % (tool, ver, FIELD_BASIS, level))

        # C5 / R2：MAJOR 一律需要 Bruce 的核准標記
        #
        # 🔴 這裡是 2026-08-12 的修訂重點。舊版的放行條件是「波內再進 MAJOR 時，
        #    有沒有填 `波次宣告：`」——自由填寫的欄位，agent 自己就能滿足，
        #    所以 wfg v4.0.0 照樣通過。新版把閘門換成 agent 認定不了的外部事實：
        #    有沒有人核准。**不分是不是第一次 MAJOR，一律要核准**，因為
        #    「這是不是新的一波」正是 agent 判斷不可靠的那個點。
        if level == "MAJOR":
            approval = field_value(body, FIELD_APPROVAL)
            ok_approval, approval_note = _check_approval(approval, m_date=None)

            # 上一次 MAJOR 只用來把訊息講清楚，**不再影響放行與否**
            prev_major_desc = ""
            try:
                hist = version_history(repo, tool, hist_ref)
                # head/at 模式下，被檢查的那個 commit 本身就在歷史第一筆。
                # 不剔除的話 last_major_commit() 會把「本次這個 MAJOR」當成「上一次 MAJOR」。
                if mode in ("head", "at") and hist and hist[0][2] == nv:
                    hist = hist[1:]
                lm = last_major_commit(repo, tool, hist)
                if lm:
                    sha, subj, fv, tv = lm
                    prev_major_desc = ("這個工具在 %s（%s）已經進過 MAJOR（%s → %s），"
                                       "本次是**同一波內的第 2 次以上 MAJOR**。"
                                       % (sha[:7], subj[:40], vstr(fv), vstr(tv)))
                else:
                    prev_major_desc = "這是該工具歷史上第一次 MAJOR。"
            except Exception as e:
                # 讀不到歷史不影響核准這道閘門（核准是唯一放行條件），只降級成 note
                notes.append("[%s] 上一次 MAJOR 查不到（%s），不影響核准檢查"
                             % (tool, type(e).__name__))

            if not ok_approval:
                problems.append(
                    "[%s] 本次要進 MAJOR（%s），但 CHANGELOG 條目沒有有效的 `%s：` 核准標記"
                    "（%s）。%s\n"
                    "      需要的格式（整行）：  %s：Bruce YYYY-MM-DD\n%s"
                    % (tool, why, FIELD_APPROVAL, approval_note, prev_major_desc,
                       FIELD_APPROVAL, MAJOR_BLOCK_HELP))
            else:
                notes.append("[%s] MAJOR 已附 %s：%s（%s）"
                             % (tool, FIELD_APPROVAL, approval, prev_major_desc))

            # 波次宣告：保留但降級 —— 只印出來，缺席不擋、填了也不放行
            wave = field_value(body, FIELD_WAVE)
            if wave:
                notes.append("[%s] %s（僅供說明，不構成放行條件）：%s"
                             % (tool, FIELD_WAVE, wave[:100]))

    return problems, notes, checked, base_desc


def main():
    argv = sys.argv[1:]
    repo = DEFAULT_REPO
    if "--repo" in argv:
        repo = os.path.expanduser(argv[argv.index("--repo") + 1])
    mode, at = "worktree", None
    if "--staged" in argv:
        mode = "staged"
    elif "--head" in argv:
        mode = "head"
    elif "--at" in argv:
        mode, at = "at", argv[argv.index("--at") + 1]
    as_json = "--json" in argv
    repo = os.path.abspath(repo)
    if not os.path.exists(os.path.join(repo, ".git")):
        die("不是 git repo：%s" % repo)

    problems, notes, checked, base_desc = check(repo, mode, at)
    if as_json:
        print(json.dumps({"ok": not problems, "mode": mode, "base": base_desc,
                          "checked": checked, "problems": problems, "notes": notes},
                         ensure_ascii=False))
    else:
        print("版號判定檢查（%s，比對基準 %s）" % (repo, base_desc))
        if not checked:
            print("  本次沒有任何工具的版號變動 → 不需判定")
        for n in notes:
            print("  · " + n)
        if problems:
            print("VERSION CHECK FAILED %d 項：" % len(problems))
            for p in problems:
                print("  🔴 " + p)
        else:
            print("VERSION CHECK OK（變動的工具：%s）" % (", ".join(checked) or "無"))
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
