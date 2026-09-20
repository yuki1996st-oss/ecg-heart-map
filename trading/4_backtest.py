"""
ステップ2-b：過去データで戦略を検証する（バックテスト）
======================================================
お金も注文も一切動きません。過去の値動きに対して
「このルールで売買していたらどうなっていたか」を計算するだけです。

戦略：短期の移動平均が長期を上抜いたら買い、下抜いたら手仕舞い
      （ゴールデンクロス／デッドクロス）

使い方:
    python3 4_backtest.py                 ← サンプルデータで実行
    python3 4_backtest.py data/JP_7203.csv ← 取得した実データで実行
"""

import json
import math
import os
import sys

import pandas as pd

import config

HERE = os.path.dirname(os.path.abspath(__file__))
SAMPLE = os.path.join(HERE, "data", "sample_daily.csv")
OUT_JS = os.path.join(HERE, "dashboard", "backtest_data.js")


# ---------------------------------------------------------------
def load(path: str) -> pd.DataFrame:
    df = pd.read_csv(path)
    # moomoo の CSV は time_key、サンプルは date という列名
    date_col = "time_key" if "time_key" in df.columns else "date"
    df = df[[date_col, "close"]].rename(columns={date_col: "date"})
    df["date"] = pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d")
    df["close"] = df["close"].astype(float)
    return df.dropna().reset_index(drop=True)


# ---------------------------------------------------------------
def run(df: pd.DataFrame) -> dict:
    short, long = config.SMA_SHORT, config.SMA_LONG
    if len(df) < long + 5:
        sys.exit(f"データが短すぎます（{len(df)}本）。長期移動平均 {long} 本ぶん以上必要です。")

    df["sma_s"] = df["close"].rolling(short).mean()
    df["sma_l"] = df["close"].rolling(long).mean()

    # 保有フラグ：短期 > 長期 なら 1（保有）、そうでなければ 0（現金）
    # shift(1) で「前日の判断で当日を持つ」＝ 未来を覗かないようにする
    df["hold"] = (df["sma_s"] > df["sma_l"]).astype(int).shift(1).fillna(0)

    df["ret"] = df["close"].pct_change().fillna(0.0)
    df["trade"] = df["hold"].diff().abs().fillna(0.0)          # 売買が起きた日は 1
    df["strategy_ret"] = df["hold"] * df["ret"] - df["trade"] * config.FEE_RATE

    cash = config.INITIAL_CASH
    df["equity"] = cash * (1 + df["strategy_ret"]).cumprod()
    df["buyhold"] = cash * (1 + df["ret"]).cumprod()

    # --- 1往復ごとの損益（勝率の計算用） -------------------------
    trades, entry = [], None
    for _, r in df.iterrows():
        if r["hold"] == 1 and entry is None:
            entry = {"date": r["date"], "price": r["close"]}
        elif r["hold"] == 0 and entry is not None:
            pnl = (r["close"] - entry["price"]) / entry["price"]
            trades.append({
                "entry_date": entry["date"], "entry_price": round(entry["price"], 2),
                "exit_date": r["date"], "exit_price": round(r["close"], 2),
                "pnl_pct": round(pnl * 100, 2),
            })
            entry = None
    if entry is not None:  # 最終日まで持ち越し
        last = df.iloc[-1]
        pnl = (last["close"] - entry["price"]) / entry["price"]
        trades.append({
            "entry_date": entry["date"], "entry_price": round(entry["price"], 2),
            "exit_date": "保有中", "exit_price": round(last["close"], 2),
            "pnl_pct": round(pnl * 100, 2),
        })

    wins = [t for t in trades if t["pnl_pct"] > 0]

    # --- 最大ドローダウン（山からの下落幅の最大） -----------------
    peak = df["equity"].cummax()
    max_dd = float(((df["equity"] - peak) / peak).min() * 100)

    years = max(len(df) / 252.0, 1e-9)
    final = float(df["equity"].iloc[-1])
    total_ret = (final / cash - 1) * 100
    cagr = ((final / cash) ** (1 / years) - 1) * 100 if final > 0 else -100.0
    bh_final = float(df["buyhold"].iloc[-1])

    return {
        "meta": {
            "generated_from": "バックテスト（過去データの計算のみ・実売買なし）",
            "strategy": f"移動平均クロス {short}日 / {long}日",
            "period": f"{df['date'].iloc[0]} 〜 {df['date'].iloc[-1]}",
            "bars": len(df),
            "initial_cash": config.INITIAL_CASH,
            "fee_rate_pct": config.FEE_RATE * 100,
        },
        "metrics": {
            "total_return_pct": round(total_ret, 2),
            "cagr_pct": round(cagr, 2),
            "max_drawdown_pct": round(max_dd, 2),
            "trade_count": len(trades),
            "win_rate_pct": round(len(wins) / len(trades) * 100, 1) if trades else 0.0,
            "final_equity": round(final),
            "buyhold_return_pct": round((bh_final / cash - 1) * 100, 2),
            "buyhold_final": round(bh_final),
        },
        "series": {
            "dates": df["date"].tolist(),
            "strategy": [round(v) for v in df["equity"].tolist()],
            "buyhold": [round(v) for v in df["buyhold"].tolist()],
        },
        "trades": trades,
    }


# ---------------------------------------------------------------
def main() -> None:
    path = sys.argv[1] if len(sys.argv) > 1 else SAMPLE
    if not os.path.exists(path):
        sys.exit(f"ファイルが見つかりません: {path}")

    is_sample = os.path.abspath(path) == os.path.abspath(SAMPLE)
    print("\n" + "=" * 56)
    print("  バックテスト（実際の売買はしません）")
    print("=" * 56)
    if is_sample:
        print("  ※ 今回は【ダミーのサンプルデータ】です。実在の値動きでは")
        print("     ありません。仕組みの確認用と考えてください。")
    print(f"  データ : {path}")

    result = run(load(path))
    m, meta = result["metrics"], result["meta"]
    result["meta"]["is_sample"] = is_sample

    print(f"  戦略   : {meta['strategy']}")
    print(f"  期間   : {meta['period']}（{meta['bars']}営業日）")
    print("-" * 56)
    print(f"  元手                 : {meta['initial_cash']:>12,} 円")
    print(f"  最終資産             : {m['final_equity']:>12,} 円")
    print(f"  総リターン           : {m['total_return_pct']:>12} %")
    print(f"  年率換算             : {m['cagr_pct']:>12} %")
    print(f"  最大ドローダウン     : {m['max_drawdown_pct']:>12} %  ← 途中で耐える下落幅")
    print(f"  取引回数             : {m['trade_count']:>12} 回")
    print(f"  勝率                 : {m['win_rate_pct']:>12} %")
    print("-" * 56)
    print(f"  参考：ずっと持っていた場合 {m['buyhold_return_pct']} %"
          f"（{m['buyhold_final']:,} 円）")
    print("=" * 56)

    os.makedirs(os.path.dirname(OUT_JS), exist_ok=True)
    with open(OUT_JS, "w", encoding="utf-8") as f:
        f.write("// 4_backtest.py が自動生成。手で編集しないでください。\n")
        f.write("window.BACKTEST = ")
        json.dump(result, f, ensure_ascii=False, indent=1)
        f.write(";\n")
    print(f"\n  ダッシュボード用データを書き出しました: {OUT_JS}")
    print("  dashboard/index.html をダブルクリックすると図で見られます。\n")


if __name__ == "__main__":
    main()
