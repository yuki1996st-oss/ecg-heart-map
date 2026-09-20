"""
ステップ1-b：模擬取引で1回だけ注文を出す
========================================
仮想のお金です。実際の資産は一切動きません。
（config.py の TRD_ENV が SIMULATE でないと、起動した瞬間に止まります）

使い方:
    python3 2_paper_order.py
"""

import _common as c
import config
from moomoo import OrderType, TrdSide


def main() -> None:
    c.assert_paper()

    c.hr("模擬注文のテスト")
    print("  ※ これは仮想のお金での練習です。実際のお金は動きません。")

    # --- いまの株価を見る -------------------------------------
    with c.quote_context() as q:
        snap = c.unwrap(q.get_market_snapshot([config.TEST_CODE]), "株価の取得")
        last_price = float(snap.iloc[0]["last_price"])

    # 現在値より 5% 安い指値（すぐには約定しにくい価格）を置きます。
    # 「注文が通るか」を確かめるのが目的なので、これで十分です。
    price = round(last_price * 0.95, 1)

    print(f"\n  銘柄     : {config.TEST_CODE}")
    print(f"  現在値   : {last_price}")
    print(f"  注文価格 : {price}  （現在値より5%安い指値）")
    print(f"  株数     : {config.TEST_QTY}")
    print(f"  売買     : 買い")

    answer = input("\n  この内容で模擬注文を出しますか？ yes と入力: ").strip()
    if answer.lower() != "yes":
        print("  中止しました。")
        return

    # --- 発注 --------------------------------------------------
    with c.trade_context() as t:
        order = c.unwrap(
            t.place_order(
                price=price,
                qty=config.TEST_QTY,
                code=config.TEST_CODE,
                trd_side=TrdSide.BUY,
                order_type=OrderType.NORMAL,   # 指値
                trd_env=config.TRD_ENV,        # ← 必ず SIMULATE
            ),
            "模擬注文の発注",
        )
        row = order.iloc[0]
        print("\n  注文を受け付けました。")
        print(f"    注文番号 : {row['order_id']}")
        print(f"    状態     : {row['order_status']}")

        c.hr("現在の未約定注文")
        orders = c.unwrap(
            t.order_list_query(trd_env=config.TRD_ENV), "注文一覧の取得"
        )
        if orders.empty:
            print("  （なし）")
        else:
            cols = ["code", "trd_side", "order_status", "price", "qty", "dealt_qty"]
            print(orders[cols].to_string(index=False))

    print("\n  取り消したいときは moomoo アプリの『模擬取引』画面から消せます。\n")


if __name__ == "__main__":
    main()
