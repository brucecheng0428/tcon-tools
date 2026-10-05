# AGENTS.md — 給所有 AI agent（Codex、Claude、其他）

本 repo 的完整規則在 **`CLAUDE.md`**（版號、交付、實作、驗證）。不論你是哪個 AI，**先讀 `CLAUDE.md`，全部照做**；本檔不另立規則，只把最容易出事的 git 提交步驟寫在這裡，兩邊都適用。

## git 提交安全（P105，2026-10-05）

背景：2026-10-05 P104 發現主工作區 `.git/index` 過期，若照常 `git commit` 會刪掉 33 個仍在的檔、把 11 檔退回 9/21–9/28 舊版。以下每條都是為了讓這種事不再發生。

1. **新機器／新 clone／新 worktree 第一次 commit 前先跑** `sh tools/setup-hooks.sh`；之後每次 commit 前可用 `sh tools/setup-hooks.sh --check` 確認 hooks 有啟用。
2. **只 `git add` 自己這次改的檔，逐檔列路徑。** 禁止 `git commit -a`、`git add -A`、`git add .`、`git add -u`、不帶路徑的 `git commit`（當 index 裡有別人的或過期的內容時）。
3. **禁止 `--no-verify`。** hook 擋下＝內容有問題；認為是誤判就回報 Dispatch，不自己繞過。GitHub 上的 history-guard 會再查一次，且會標出沒經過 hook 的 commit。
4. **commit 前必看兩個指令並核對：** `git status` 與 `git diff --cached --stat`。staged 清單裡出現你沒動過的檔、出現刪除（D）、或檔案數比你改的多，**先停**：多半是 index 過期，用 `git restore --staged -- <路徑>` 只修 index（不動檔案），再重看。
5. **不要在掛載或沙盒裡的 clone 提交**（路徑含 `/sessions/`、`/mnt/`，或目錄裡有 `.fuse_hidden*` 檔的那種）。提交一律在主機端（Mac mini／MBP）本機的 repo 做；pre-commit 會擋 Linux 沙盒路徑。
6. 刻意退版或一次刪 >5 個檔是允許的，但要在 commit message 寫明：`Allow-Revert: <原因>`／`Allow-Mass-Delete: <原因>`（`git revert` 自動產生的訊息免寫）。
7. 不 force push、不 rebase 已推出的 commit、不改寫歷史；修正用新 commit。push 照 `CLAUDE.md` 的分工。

三道防線：本機 hooks（`tools/hooks/pre-commit`、`tools/hooks/commit-msg`）→ 本檔規則 → GitHub Actions `.github/workflows/history-guard.yml`（與誰提交無關，失敗時標紅並自動開 issue）。
