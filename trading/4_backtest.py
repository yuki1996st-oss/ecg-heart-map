"""
ステップ2-b：過去データで戦略を検証する（バックテスト）
======================================================
お金も注文も一切動きません。過去の値動きに対して
「このルールで売買していたらどうなっていたか」を計算するだけです。

戦略：短期の移動平均が長期を上抜いたら買い、下抜いたら手仕舞い
      （ゴールデンクロス／デッドクロス）

使い方:
    python3 4_backtest.py                  ← サンプルデータで実行
    python3 4_backtest.py data/US_AAPL.csv ← 取得した実データ1銘柄で実行
    python3 4_backtest.py --all            ← data/ の全銘柄を比較する
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
def run(df: pd.DataFrame, fee_rate: float | None = None) -> dict:
    fee = config.FEE_RATE if fee_rate is None else fee_rate
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
    df["strategy_ret"] = df["hold"] * df["ret"] - df["trade"] * fee

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

    d0 = pd.to_datetime(df["date"].iloc[0])
    d1 = pd.to_datetime(df["date"].iloc[-1])
    years = max((d1 - d0).days / 365.25, 1e-9)
    final = float(df["equity"].iloc[-1])
    total_ret = (final / cash - 1) * 100
    cagr = ((final / cash) ** (1 / years) - 1) * 100 if final > 0 else -100.0
    bh_final = float(df["buyhold"].iloc[-1])
    bh_cagr = ((bh_final / cash) ** (1 / years) - 1) * 100 if bh_final > 0 else -100.0

    return {
        "meta": {
            "generated_from": "バックテスト（過去データの計算のみ・実売買なし）",
            "strategy": f"移動平均クロス {short}日 / {long}日",
            "period": f"{df['date'].iloc[0]} 〜 {df['date'].iloc[-1]}",
            "bars": len(df),
            "initial_cash": config.INITIAL_CASH,
            "fee_rate_pct": round(fee * 100, 4),
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
            "buyhold_cagr_pct": round(bh_cagr, 2),
            "years": round(years, 2),
        },
        "series": {
            "dates": df["date"].tolist(),
            "strategy": [round(v) for v in df["equity"].tolist()],
            "buyhold": [round(v) for v in df["buyhold"].tolist()],
        },
        "trades": trades,
    }


# ---------------------------------------------------------------
def compare_all() -> None:
    """data/ にある全 CSV をまとめて検証し、横並びで比べる。"""
    files = sorted(
        f for f in os.listdir(os.path.join(HERE, "data"))
        if f.endswith(".csv") and f != "sample_daily.csv"
    )
    if not files:
        sys.exit("data/ に CSV がありません。先に 3_fetch_history.py を実行してください。")

    print("\n" + "=" * 72)
    print(f"  銘柄ごとの比較　（{config.SMA_SHORT}日 / {config.SMA_LONG}日 クロス）")
    print("=" * 72)
    print("  ※ 期間が違う銘柄どうしを比べられるよう、年率に直しています。")
    print("-" * 72)
    print(f"  {'銘柄':<12}{'期間':>8}{'年率':>10}{'保有の年率':>12}"
          f"{'最大DD':>10}{'取引':>7}{'勝率':>7}")
    print("-" * 72)

    rows = []
    for fn in files:
        is_crypto = fn.startswith("CRYPTO_")
        fee = config.FEE_RATE_CRYPTO if is_crypto else config.FEE_RATE
        try:
            r = run(load(os.path.join(HERE, "data", fn)), fee_rate=fee)
        except SystemExit as e:
            print(f"  {fn:<12} {e}")
            continue
        m = r["metrics"]
        name = fn.replace(".csv", "").replace("US_", "").replace("CRYPTO_", "*")
        rows.append((name, m))
        print(f"  {name:<12}{m['years']:>6.1f}年{m['cagr_pct']:>9.1f}%"
              f"{m['buyhold_cagr_pct']:>11.1f}%"
              f"{m['max_drawdown_pct']:>9.1f}%"
              f"{m['trade_count']:>6}回{m['win_rate_pct']:>6.0f}%")

    print("=" * 72)
    if any(n.startswith("*") for n, _ in rows):
        print(f"  * = 仮想通貨（手数料 {config.FEE_RATE_CRYPTO * 100}% で計算。"
              f"株は {config.FEE_RATE * 100}%）")
    beat = [n for n, m in rows if m["cagr_pct"] > m["buyhold_cagr_pct"]]
    print(f"  「ずっと保有」に勝てたのは {len(beat)} / {len(rows)} 銘柄"
          + (f"（{', '.join(beat)}）" if beat else ""))
    print("\n  ※ これは過去の話です。勝てた銘柄が今後も勝つ保証はありません。")
    print("     勝率より、最大DD（途中で耐える下落幅）を見てください。")
    print("     年率が高くても最大DDが深ければ、途中で耐えられません。")
    print("\n  グラフで見たい銘柄は:  python3 4_backtest.py data/US_XXXX.csv\n")


def main() -> None:
    if len(sys.argv) > 1 and sys.argv[1] == "--all":
        compare_all()
        return

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
          f"（年率 {m['buyhold_cagr_pct']} % / {m['buyhold_final']:,} 円）")
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
