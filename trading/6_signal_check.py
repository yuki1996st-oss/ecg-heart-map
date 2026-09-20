"""
ステップ4：売買サインを探して知らせる（承認制の心臓部）
======================================================
【注文は絶対に出しません。】
ウォッチリストを調べて「買いどき／売りどきかもしれない」銘柄を見つけ、
Mac の通知とダッシュボードでお知らせするだけです。

実際に買うかどうかは、通知を見てからご自身で判断し、
moomoo アプリで発注してください。

使い方:
    python3 6_signal_check.py
"""

import json
import os
import subprocess
import time
from datetime import datetime, timedelta

import pandas as pd
from moomoo import AuType, KLType

import _common as c
import config

OUT_JS = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                      "dashboard", "signals_data.js")


# ---------------------------------------------------------------
# 日足を取り、移動平均とクロスを調べる
# ---------------------------------------------------------------
def analyze(quote_ctx, code: str) -> dict | None:
    start = (datetime.now() - timedelta(days=400)).strftime("%Y-%m-%d")
    ret, df, _ = quote_ctx.request_history_kline(
        code=code, start=start, ktype=KLType.K_DAY,
        autype=AuType.QFQ, max_count=1000,
    )
    if ret != 0 or df is None or len(df) < config.SMA_LONG + 5:
        print(f"    {code}: データが取れませんでした（{df}）")
        return None

    df = df[["time_key", "close"]].copy()
    df["close"] = df["close"].astype(float)
    df["sma_s"] = df["close"].rolling(config.SMA_SHORT).mean()
    df["sma_l"] = df["close"].rolling(config.SMA_LONG).mean()
    df = df.dropna().reset_index(drop=True)
    if len(df) < config.SIGNAL_LOOKBACK_DAYS + 2:
        return None

    above = df["sma_s"] > df["sma_l"]

    # 直近 N 営業日のうちに、上下どちらかのクロスが起きたか
    look = config.SIGNAL_LOOKBACK_DAYS
    recent = above.iloc[-(look + 1):].tolist()
    golden = (not recent[0]) and recent[-1]      # 下 → 上（買いサイン）
    dead = recent[0] and (not recent[-1])        # 上 → 下（売りサイン）

    last = df.iloc[-1]
    return {
        "code": code,
        "date": str(last["time_key"])[:10],
        "price": round(float(last["close"]), 2),
        "sma_short": round(float(last["sma_s"]), 2),
        "sma_long": round(float(last["sma_l"]), 2),
        "trend_up": bool(above.iloc[-1]),
        "golden_cross": bool(golden),
        "dead_cross": bool(dead),
    }


# ---------------------------------------------------------------
# Mac の通知センターに出す
# ---------------------------------------------------------------
def notify(title: str, body: str) -> None:
    try:
        subprocess.run(
            ["osascript", "-e",
             f'display notification {json.dumps(body)} with title {json.dumps(title)}'],
            check=False, capture_output=True, timeout=10,
        )
    except Exception:
        pass   # Mac 以外や通知が使えない環境でも止めない


# ---------------------------------------------------------------
def main() -> None:
    c.warn_if_real()

    c.hr("売買サインの確認（注文は出しません）")
    print(f"  ルール : 移動平均 {config.SMA_SHORT}日 / {config.SMA_LONG}日 のクロス")
    print(f"  対象   : {len(config.WATCHLIST)} 銘柄")
    print(f"  予算   : 全体 {config.TOTAL_BUDGET_JPY:,} 円"
          f" / 1銘柄あたり上限 {config.BUDGET_PER_STOCK_JPY:,} 円")

    # --- いま持っている銘柄を調べる（読むだけ） -----------------
    held = {}
    with c.trade_context() as t:
        pos = c.unwrap(
            t.position_list_query(trd_env=config.TRD_ENV,
                                  currency=c.acc_currency()),
            "保有銘柄の取得",
        )
        for _, r in pos.iterrows():
            held[r["code"]] = {
                "qty": float(r["qty"]),
                "cost_price": float(r["cost_price"]),
                "pnl_pct": float(r["pl_ratio"]),
            }

    print(f"  保有中 : {len(held)} 銘柄")

    # --- ウォッチリストを1つずつ調べる ---------------------------
    print("\n  調査中...")
    rows = []
    with c.quote_context() as q:
        for code in config.WATCHLIST:
            a = analyze(q, code)
            if a:
                rows.append(a)
                print(f"    {code:10s} {a['price']:>9.2f}  "
                      f"{'上昇トレンド' if a['trend_up'] else '下降トレンド'}")
            time.sleep(0.6)      # API への配慮（連続リクエストを避ける）

    # --- サインを組み立てる --------------------------------------
    signals = []
    for a in rows:
        code = a["code"]
        h = held.get(code)
        usd = a["price"]
        jpy = c.to_jpy(usd)

        if h:
            if h["pnl_pct"] <= -config.STOP_LOSS_PCT:
                signals.append({
                    **a, "kind": "STOP", "label": "損切り検討",
                    "reason": f"取得価格から {h['pnl_pct']:.1f}% 下落"
                              f"（設定した損切りライン -{config.STOP_LOSS_PCT}% を超えました）",
                    "qty": h["qty"], "pnl_pct": round(h["pnl_pct"], 2),
                })
            elif a["dead_cross"]:
                signals.append({
                    **a, "kind": "SELL", "label": "売り候補",
                    "reason": f"{config.SMA_SHORT}日線が{config.SMA_LONG}日線を"
                              f"下抜けました（デッドクロス）",
                    "qty": h["qty"], "pnl_pct": round(h["pnl_pct"], 2),
                })
        else:
            if a["golden_cross"]:
                if len(held) >= config.MAX_POSITIONS:
                    reason = (f"買いサインが出ていますが、保有銘柄が上限"
                              f"（{config.MAX_POSITIONS}銘柄）に達しています")
                    kind, label, qty = "INFO", "見送り", 0
                else:
                    qty = int(config.BUDGET_PER_STOCK_JPY // jpy)
                    if qty < 1:
                        reason = (f"買いサインが出ていますが、1株 約{jpy:,.0f}円 が"
                                  f"1銘柄あたりの上限 {config.BUDGET_PER_STOCK_JPY:,}円 を超えます")
                        kind, label = "INFO", "見送り"
                    else:
                        reason = (f"{config.SMA_SHORT}日線が{config.SMA_LONG}日線を"
                                  f"上抜けました（ゴールデンクロス）")
                        kind, label = "BUY", "買い候補"
                signals.append({
                    **a, "kind": kind, "label": label, "reason": reason,
                    "qty": qty, "pnl_pct": None,
                })

    # --- 予算に対して高すぎる銘柄を知らせる -----------------------
    too_pricey = [a for a in rows
                  if c.to_jpy(a["price"]) > config.BUDGET_PER_STOCK_JPY]
    if too_pricey:
        print("\n  ⚠ 1株の値段が予算の枠を超えている銘柄があります"
              f"（1銘柄あたり上限 {config.BUDGET_PER_STOCK_JPY:,} 円）:")
        for a in too_pricey:
            print(f"     {a['code']:10s} 1株 約 {c.to_jpy(a['price']):,.0f} 円")
        print("     → サインが出ても買えません。config.py の WATCHLIST を")
        print("       1株の安い銘柄に入れ替えるか、MAX_POSITIONS を減らしてください。")

    # --- 画面に出す ----------------------------------------------
    c.hr("結果")
    actionable = [s for s in signals if s["kind"] in ("BUY", "SELL", "STOP")]

    if not signals:
        print("  今日は動きなし。何もしなくて大丈夫です。")
    for s in signals:
        jpy = c.to_jpy(s["price"])
        print(f"\n  【{s['label']}】{s['code']}")
        print(f"     現在値 : ${s['price']}  （約 {jpy:,.0f} 円）")
        print(f"     理由   : {s['reason']}")
        if s["kind"] == "BUY":
            print(f"     目安   : {s['qty']} 株　＝　約 {jpy * s['qty']:,.0f} 円")
            print(f"     損切り : ${s['price'] * (1 - config.STOP_LOSS_PCT / 100):.2f} "
                  f"を割ったら手仕舞いを検討")
        elif s["kind"] in ("SELL", "STOP"):
            print(f"     保有   : {s['qty']:.0f} 株（損益 {s['pnl_pct']:+.2f}%）")

    print("\n" + "-" * 56)
    print("  ※ このスクリプトは注文を出しません。")
    print("     実際の売買は moomoo アプリで、ご自身で確認してから行ってください。")
    print("-" * 56)

    # --- 通知 ----------------------------------------------------
    if actionable:
        names = "、".join(f"{s['code'].replace('US.', '')}（{s['label']}）"
                         for s in actionable[:3])
        notify("moomoo 売買サイン", f"{len(actionable)}件: {names}")

    # --- ダッシュボードへ書き出し ---------------------------------
    payload = {
        "meta": {
            "checked_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "rule": f"移動平均 {config.SMA_SHORT}日 / {config.SMA_LONG}日 クロス",
            "watchlist_size": len(config.WATCHLIST),
            "held_count": len(held),
            "budget_total_jpy": config.TOTAL_BUDGET_JPY,
            "budget_per_stock_jpy": config.BUDGET_PER_STOCK_JPY,
            "stop_loss_pct": config.STOP_LOSS_PCT,
            "usdjpy": config.USDJPY_ASSUMED,
            "too_pricey": [a["code"] for a in too_pricey],
        },
        "signals": signals,
        "watchlist": rows,
    }
    os.makedirs(os.path.dirname(OUT_JS), exist_ok=True)
    with open(OUT_JS, "w", encoding="utf-8") as f:
        f.write("// 6_signal_check.py が自動生成。手で編集しないでください。\n")
        f.write("window.SIGNALS = ")
        json.dump(payload, f, ensure_ascii=False, indent=1)
        f.write(";\n")
    print(f"\n  ダッシュボード用に書き出しました: {OUT_JS}\n")


if __name__ == "__main__":
    main()
