"""
ステップ3：模擬口座の状況を読み取って、ダッシュボード用に書き出す
=================================================================
【読むだけ】のスクリプトです。
発注・取消の機能はこのファイルには一切入っていません。

使い方:
    python3 5_export_dashboard.py
"""

import json
import os
from datetime import datetime

import _common as c
import config

OUT_JS = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                      "dashboard", "portfolio_data.js")


def main() -> None:
    c.warn_if_real()

    c.hr("模擬口座の状況を読み取り中")

    with c.trade_context() as t:
        info = c.unwrap(
            t.accinfo_query(trd_env=config.TRD_ENV, currency=c.acc_currency()),
            "口座残高の取得",
        ).iloc[0]

        pos = c.unwrap(
            t.position_list_query(trd_env=config.TRD_ENV, currency=c.acc_currency()),
            "保有銘柄の取得",
        )

    positions = []
    for _, r in pos.iterrows():
        positions.append({
            "code": r["code"],
            "name": r.get("stock_name", r["code"]),
            "qty": float(r["qty"]),
            "cost_price": float(r["cost_price"]),
            "current_price": float(r["nominal_price"]),
            "market_value": float(r["market_val"]),
            "pnl_value": float(r["pl_val"]),
            "pnl_pct": round(float(r["pl_ratio"]), 2),
        })

    payload = {
        "meta": {
            "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "trd_env": str(config.TRD_ENV),
            "market": str(config.TRD_MARKET),
            "is_paper": True,
        },
        "account": {
            "total_assets": float(info["total_assets"]),
            "cash": float(info["cash"]),
            "market_value": float(info["market_val"]),
            "power": float(info["power"]),
        },
        "positions": positions,
    }

    os.makedirs(os.path.dirname(OUT_JS), exist_ok=True)
    with open(OUT_JS, "w", encoding="utf-8") as f:
        f.write("// 5_export_dashboard.py が自動生成。手で編集しないでください。\n")
        f.write("window.PORTFOLIO = ")
        json.dump(payload, f, ensure_ascii=False, indent=1)
        f.write(";\n")

    print(f"  総資産   : {payload['account']['total_assets']:,.0f}")
    print(f"  保有銘柄 : {len(positions)} 件")
    print(f"\n  書き出しました: {OUT_JS}")
    print("  dashboard/index.html を開くと表示されます。\n")


if __name__ == "__main__":
    main()
