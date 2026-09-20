"""
ステップ1-a：つながるかどうかだけ確認する
=========================================
注文は一切出しません。ただ「見るだけ」のスクリプトです。

使い方:
    python3 1_check_connection.py
"""

import _common as c
import config
from moomoo import TrdEnv


def main() -> None:
    c.assert_paper()

    c.hr("1. 設定の確認")
    print(f"  取引モード : {config.TRD_ENV}  （SIMULATE = 模擬＝仮想のお金）")
    print(f"  市場       : {config.TRD_MARKET}")
    print(f"  接続先     : {config.HOST}:{config.PORT}")
    print(f"  テスト銘柄 : {config.TEST_CODE}")

    c.hr("2. 株価が取れるか（OpenD への接続確認）")
    with c.quote_context() as q:
        snap = c.unwrap(q.get_market_snapshot([config.TEST_CODE]), "株価の取得")
        row = snap.iloc[0]
        print(f"  {row['code']} の現在値 : {row['last_price']}")
        print(f"  高値 / 安値          : {row['high_price']} / {row['low_price']}")
    print("  → OK。OpenD とつながっています。")

    c.hr("3. 模擬口座が見えるか")
    with c.trade_context() as t:
        accs = c.unwrap(t.get_acc_list(), "口座一覧の取得")
        sim = accs[accs["trd_env"] == TrdEnv.SIMULATE]
        if sim.empty:
            print("  模擬口座が見つかりませんでした。")
            print("  moomoo アプリ側で『模擬取引』を一度開いて口座を作ってください。")
            return
        print(sim[["acc_id", "trd_env", "acc_type", "trdmarket_auth"]].to_string(index=False))

        info = c.unwrap(
            t.accinfo_query(trd_env=config.TRD_ENV, currency="JPY"),
            "口座残高の取得",
        )
        r = info.iloc[0]
        print(f"\n  模擬口座の総資産 : {r['total_assets']:,.0f}")
        print(f"  買付可能額       : {r['power']:,.0f}")

    c.hr("すべて成功しました")
    print("  次は 2_paper_order.py で、仮想のお金で1回だけ注文を出してみます。\n")


if __name__ == "__main__":
    main()
