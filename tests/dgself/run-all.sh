#!/bin/bash
# 一鍵跑完 DG 自檢頁的全部 headless 情境。參數原樣傳給 run.py（例如 --keep、--jobs 2、H I-on）。
exec python3 "$(dirname "$0")/run.py" "$@"
