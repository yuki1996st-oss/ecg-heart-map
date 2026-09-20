"""
共通の下ごしらえ（直接実行はしません）
各スクリプトが読み込んで使う、接続ヘルパーと安全装置。
"""

import sys
from contextlib import contextmanager

from moomoo import (
    RET_OK,
    OpenQuoteContext,
    OpenSecTradeContext,
    TrdEnv,
)

import config


# ---------------------------------------------------------------
# 安全装置：模擬取引以外では走らせない
# ---------------------------------------------------------------
def assert_paper() -> None:
    if config.TRD_ENV != TrdEnv.SIMULATE:
        sys.exit(
            "\n【中止】config.py の TRD_ENV が SIMULATE になっていません。\n"
            f"       現在の値: {config.TRD_ENV}\n"
            "       このフォルダのスクリプトは模擬取引専用です。\n"
        )


# ---------------------------------------------------------------
# 接続ヘルパー（with で使うと、終わったら必ず切断してくれる）
# ---------------------------------------------------------------
@contextmanager
def quote_context():
    ctx = OpenQuoteContext(host=config.HOST, port=config.PORT)
    try:
        yield ctx
    finally:
        ctx.close()


@contextmanager
def trade_context():
    ctx = OpenSecTradeContext(
        filter_trdmarket=config.TRD_MARKET,
        host=config.HOST,
        port=config.PORT,
        security_firm=config.SECURITY_FIRM,
    )
    try:
        yield ctx
    finally:
        ctx.close()


# ---------------------------------------------------------------
# 結果チェック：SDK は (戻り値, 中身) のペアを返すので、その受け取り役
# ---------------------------------------------------------------
def unwrap(result, what: str):
    """成功なら中身を返す。失敗なら理由を表示して終了する。"""
    ret, data = result
    if ret != RET_OK:
        sys.exit(f"\n【失敗】{what}\n       moomoo からの返答: {data}\n{HINT}")
    return data


HINT = """
--- よくある原因 ---
  1. OpenD が起動していない（一番多い）
     → moomoo OpenD を立ち上げて「接続済み」になっているか確認
  2. OpenD にログインできていない
  3. config.py の TRD_MARKET / SECURITY_FIRM が口座と合っていない
  4. 株価データの取得権限がない（相場データの権限を口座側で確認）
"""


def hr(title: str = "") -> None:
    """見出しの区切り線。"""
    print("\n" + "=" * 56)
    if title:
        print(f"  {title}")
        print("=" * 56)
