"""
ステップ2-a：過去の株価データを CSV に保存する
==============================================
バックテスト（過去データでの検証）に使う材料を集めます。
注文は出しません。

使い方:
    python3 3_fetch_history.py
"""

import os

import pandas as pd
from moomoo import AuType

import _common as c
import config

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")


def main() -> None:
    os.makedirs(DATA_DIR, exist_ok=True)

    c.hr(f"{config.TEST_CODE} の過去データを取得")
    print(f"  期間 : {config.HISTORY_START} 〜 {config.HISTORY_END}")

    frames = []
    page_key = None

    with c.quote_context() as q:
        while True:
            ret, data, page_key = q.request_history_kline(
                code=config.TEST_CODE,
                start=config.HISTORY_START,
                end=config.HISTORY_END,
                ktype=config.HISTORY_KTYPE,
                autype=AuType.QFQ,       # 株式分割などを調整した価格
                max_count=1000,
                page_req_key=page_key,
            )
            if ret != 0:
                print(f"\n【失敗】過去データの取得\n       {data}\n{c.HINT}")
                print("  ※ 権限が無くても大丈夫です。サンプルデータで")
                print("     4_backtest.py を試せます。")
                return
            frames.append(data)
            print(f"  ... {len(data)} 本 取得")
            if page_key is None:
                break

    df = pd.concat(frames, ignore_index=True)
    out = os.path.join(DATA_DIR, f"{config.TEST_CODE.replace('.', '_')}.csv")
    df.to_csv(out, index=False)

    print(f"\n  合計 {len(df)} 本を保存しました")
    print(f"  保存先: {out}\n")


if __name__ == "__main__":
    main()
