#!/bin/sh
# 啟用 repo 內版控的 git hooks（P105，2026-10-05）。
#   用法：sh tools/setup-hooks.sh          啟用（設定 core.hooksPath=tools/hooks）
#         sh tools/setup-hooks.sh --check  只檢查；沒啟用時 exit 1
#   為什麼用 core.hooksPath：.git/hooks 不進版控，新 clone 預設沒有任何檢查；
#   core.hooksPath 直接指向版控中的 tools/hooks，正本更新就立即生效，worktree 也共用。
#   任何人（Claude、Codex、其他 AI、人）在新機器／新 clone 第一次 commit 前都要跑一次。
set -e
REPO="$(git rev-parse --show-toplevel)"
cd "$REPO"
want="tools/hooks"
cur="$(git config --get core.hooksPath || true)"

if [ "$1" = "--check" ]; then
  ok=1
  [ "$cur" = "$want" ] || ok=0
  for h in pre-commit commit-msg; do [ -x "$want/$h" ] || ok=0; done
  if [ $ok -eq 1 ]; then
    echo "✓ hooks 已啟用（core.hooksPath=$cur）"
    exit 0
  fi
  echo "🛑🛑 hooks 沒有啟用（core.hooksPath='${cur}'）。這份 clone 的 commit 不會被檢查！"
  echo "    先跑：sh tools/setup-hooks.sh"
  exit 1
fi

chmod +x "$want"/* 2>/dev/null || true
git config core.hooksPath "$want"
echo "✓ 已設定 core.hooksPath=$want（$(git config --get core.hooksPath)）"
for h in pre-commit commit-msg; do
  if [ -x "$want/$h" ]; then echo "  ✓ $h"; else echo "  🛑 $want/$h 不存在或不可執行"; exit 1; fi
done
command -v python3 >/dev/null 2>&1 || { echo "🛑 找不到 python3：hooks 會擋下所有 commit"; exit 1; }
echo "完成。commit 前請照 AGENTS.md「git 提交安全」核對。"
