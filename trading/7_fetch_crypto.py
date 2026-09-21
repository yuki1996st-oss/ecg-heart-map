"""
仮想通貨の過去データを取ってくる（検証用）
==========================================
Binance の【公開】価格データを取得します。

  ・APIキーは要りません
  ・口座とは一切関係ありません（ログインもしません）
  ・注文は当然出しません

取ったデータは data/CRYPTO_〇〇.csv に保存され、
4_backtest.py でそのまま検証できます。

使い方:
    python3 7_fetch_crypto.py                 ← BTC と ETH
    python3 7_fetch_crypto.py BTCUSDT SOLUSDT ← 銘柄を指定
"""

import csv
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")

#  接続先の候補。上から順に試します。
#  data-api.binance.vision は「価格データ専用」の公開サーバーです。
HOSTS = [
    "https://data-api.binance.vision",
    "https://api.binance.com",
    "https://api1.binance.com",
]

DEFAULT_SYMBOLS = ["BTCUSDT", "ETHUSDT"]
START = "2018-01-01"          # ここから今日まで
DAY_MS = 86_400_000


# ---------------------------------------------------------------
def fetch_page(host: str, symbol: str, start_ms: int) -> list:
    url = (f"{host}/api/v3/klines?symbol={symbol}"
           f"&interval=1d&startTime={start_ms}&limit=1000")
    req = urllib.request.Request(url, headers={"User-Agent": "backtest-fetch/1.0"})
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.loads(res.read().decode("utf-8"))


def pick_host(symbol: str, start_ms: int) -> str | None:
    """つながるサーバーを1つ選ぶ。"""
    for host in HOSTS:
        try:
            fetch_page(host, symbol, start_ms)
            print(f"  接続先 : {host}")
            return host
        except Exception as e:
            print(f"  {host} … 失敗（{type(e).__name__}）")
    return None


# ---------------------------------------------------------------
def fetch_symbol(symbol: str) -> bool:
    start_ms = int(datetime.strptime(START, "%Y-%m-%d")
                   .replace(tzinfo=timezone.utc).timestamp() * 1000)

    host = pick_host(symbol, start_ms)
    if host is None:
        print("\n  【失敗】Binance の価格サーバーにつながりませんでした。")
        print("  ・ネットにつながっているか")
        print("  ・会社や学校の回線だと弾かれることがあります")
        return False

    rows = []
    cursor = start_ms
    while True:
        try:
            page = fetch_page(host, symbol, cursor)
        except urllib.error.HTTPError as e:
            print(f"  {symbol}: サーバーが {e.code} を返しました。"
                  f"銘柄名が正しいか確認してください（例: BTCUSDT）")
            return False
        if not page:
            break
        for k in page:
            rows.append({
                "date": datetime.fromtimestamp(k[0] / 1000, timezone.utc)
                                .strftime("%Y-%m-%d"),
                "open": k[1], "high": k[2], "low": k[3], "close": k[4],
                "volume": k[5],
            })
        cursor = page[-1][0] + DAY_MS
        print(f"    ... {len(rows)} 日ぶん")
        if len(page) < 1000:
            break
        time.sleep(0.4)        # サーバーへの配慮

    if not rows:
        print(f"  {symbol}: データが空でした。")
        return False

    os.makedirs(DATA_DIR, exist_ok=True)
    out = os.path.join(DATA_DIR, f"CRYPTO_{symbol}.csv")
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["date", "open", "high", "low", "close", "volume"])
        w.writeheader()
        w.writerows(rows)

    print(f"  {symbol}: {len(rows)} 日ぶん保存 "
          f"（{rows[0]['date']} 〜 {rows[-1]['date']}）→ {os.path.basename(out)}")
    return True


# ---------------------------------------------------------------
def main() -> None:
    symbols = [s.upper() for s in sys.argv[1:]] or DEFAULT_SYMBOLS

    print("\n" + "=" * 56)
    print("  仮想通貨の過去データを取得（公開データ・口座不要）")
    print("=" * 56)
    print(f"  対象 : {', '.join(symbols)}")
    print(f"  期間 : {START} 〜 今日\n")

    ok = 0
    for s in symbols:
        if fetch_symbol(s):
            ok += 1
        print()

    print("=" * 56)
    print(f"  {ok} / {len(symbols)} 銘柄を保存しました")
    if ok:
        print("\n  次はこれで、米国株と横並びに比べられます:")
        print("      python3 4_backtest.py --all\n")


if __name__ == "__main__":
    main()
