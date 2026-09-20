"""
サンプルデータ作成（おまけ）
============================
口座やネット接続がなくても 4_backtest.py を試せるように、
ダミーの日足データを作ります。実在の銘柄の値動きではありません。

使い方:
    python3 make_sample_data.py
"""

import csv
import math
import os
import random
from datetime import date, timedelta

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "sample_daily.csv")


def main() -> None:
    random.seed(20260920)          # 毎回まったく同じデータになるよう固定
    price = 2500.0
    d = date(2022, 1, 3)
    rows = []

    for i in range(900):
        while d.weekday() >= 5:    # 土日は飛ばす
            d += timedelta(days=1)
        # ゆるやかな上昇トレンド＋周期的な波＋ランダムな揺れ
        drift = 0.00022
        wave = 0.0016 * math.sin(i / 47.0) + 0.0009 * math.sin(i / 13.0)
        noise = random.gauss(0, 0.013)
        price *= (1 + drift + wave + noise)
        price = max(price, 50.0)
        rows.append({"date": d.isoformat(), "close": round(price, 1)})
        d += timedelta(days=1)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["date", "close"])
        w.writeheader()
        w.writerows(rows)

    print(f"ダミーデータ {len(rows)} 本を書き出しました: {OUT}")


if __name__ == "__main__":
    main()
