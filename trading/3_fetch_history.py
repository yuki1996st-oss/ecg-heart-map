"""
ステップ2-a：過去の株価データを CSV に保存する
==============================================
バックテスト（過去データでの検証）に使う材料を集めます。
注文は出しません。

使い方:
    python3 3_fetch_history.py              ← config.py の WATCHLIST 全部
    python3 3_fetch_history.py US.AAPL      ← 銘柄を指定する場合
"""

import os
import sys
import time

import pandas as pd
from moomoo import AuType

import _common as c
import config

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")


def fetch_one(quote_ctx, code: str) -> bool:
    frames = []
    page_key = None
    while True:
        ret, data, page_key = quote_ctx.request_history_kline(
            code=code,
            start=config.HISTORY_START,
            end=config.HISTORY_END,
            ktype=config.HISTORY_KTYPE,
            autype=AuType.QFQ,       # 株式分割などを調整した価格
            max_count=1000,
            page_req_key=page_key,
        )
        if ret != 0:
            print(f"  {code:10s} 失敗: {data}")
            return False
        frames.append(data)
        if page_key is None:
            break

    df = pd.concat(frames, ignore_index=True)
    out = os.path.join(DATA_DIR, f"{code.replace('.', '_')}.csv")
    df.to_csv(out, index=False)
    print(f"  {code:10s} {len(df):>5} 本 → {os.path.basename(out)}")
    return True


def main() -> None:
    os.makedirs(DATA_DIR, exist_ok=True)

    codes = sys.argv[1:] or config.WATCHLIST

    c.hr("過去データを取得")
    print(f"  期間   : {config.HISTORY_START} 〜 {config.HISTORY_END}")
    print(f"  対象   : {len(codes)} 銘柄\n")

    ok = 0
    with c.quote_context() as q:
        for code in codes:
            if fetch_one(q, code):
                ok += 1
            time.sleep(0.6)      # API への配慮

    print(f"\n  {ok} / {len(codes)} 銘柄を保存しました（保存先: {DATA_DIR}）")
    if ok < len(codes):
        print(f"{c.HINT}")
        print("  ※ 取れない銘柄があっても、サンプルデータで")
        print("     4_backtest.py の動作は確認できます。")
    print()


if __name__ == "__main__":
    main()
