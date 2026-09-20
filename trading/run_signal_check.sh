#!/bin/bash
# 毎朝の自動チェック用。launchd（Mac の自動実行の仕組み）から呼ばれます。
# 手で実行しても構いません:  ./run_signal_check.sh

cd "$(dirname "$0")" || exit 1
mkdir -p logs

if [ ! -d venv ]; then
  echo "venv がありません。README の準備2を先に実行してください。" >&2
  exit 1
fi

source venv/bin/activate
echo "===== $(date '+%Y-%m-%d %H:%M:%S') =====" >> logs/signal_check.log
python3 6_signal_check.py >> logs/signal_check.log 2>&1
