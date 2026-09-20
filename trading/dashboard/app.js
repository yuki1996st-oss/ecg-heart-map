/* ============================================================
   模擬取引ダッシュボード（表示専用）
   Python が書き出した portfolio_data.js / backtest_data.js を読んで描くだけ。
   発注の機能はここには一切ありません。
   ============================================================ */
(function () {
  "use strict";

  // ---------- 小道具 ----------------------------------------
  const $ = (id) => document.getElementById(id);
  const yen = (v) => Math.round(v).toLocaleString("ja-JP");
  const pct = (v) => (v > 0 ? "+" : "") + v.toFixed(2) + "%";
  const sign = (v) => (v > 0 ? "pos" : v < 0 ? "neg" : "");
  const arrow = (v) => (v > 0 ? "▲" : v < 0 ? "▼" : "—");

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function tile(label, value, sub, cls) {
    const t = el("div", "tile");
    t.appendChild(el("span", "tile-label", label));
    t.appendChild(el("span", "tile-value" + (cls ? " " + cls : ""), value));
    if (sub) t.appendChild(el("span", "tile-sub", sub));
    return t;
  }

  function emptyRow(table, cols, msg) {
    const tr = el("tr");
    const td = el("td", "empty", msg);
    td.colSpan = cols;
    tr.appendChild(td);
    table.tBodies[0].appendChild(tr);
  }

  // ---------- テーマ切り替え --------------------------------
  const toggle = $("themeToggle");
  const saved = (() => { try { return localStorage.getItem("dash-theme"); } catch (e) { return null; } })();
  if (saved) document.documentElement.setAttribute("data-theme", saved);
  toggle.addEventListener("click", () => {
    const now = document.documentElement.getAttribute("data-theme");
    const isDark = now
      ? now === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches;
    const next = isDark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("dash-theme", next); } catch (e) { /* 無視 */ }
    if (chart) chart.draw();
  });

  /* =========================================================
     1. 今日のサイン
     ========================================================= */
  (function renderSignals() {
    const host = $("signalList");
    const sg = window.SIGNALS;

    if (!sg) {
      host.appendChild(el("div", "sig-quiet",
        "まだサインを確認していません。ターミナルで 6_signal_check.py を実行すると、ここに出ます。"));
      return;
    }

    const m = sg.meta;
    $("sigUpdated").textContent =
      `最終確認 ${m.checked_at}　/　${m.rule}　/　`
      + `${m.watchlist_size}銘柄を監視　/　1銘柄あたり上限 ${yen(m.budget_per_stock_jpy)} 円`;

    const KIND = {
      BUY:  { cls: "buy",  icon: "●", text: "買い候補" },
      SELL: { cls: "sell", icon: "■", text: "売り候補" },
      STOP: { cls: "stop", icon: "▲", text: "損切り検討" },
      INFO: { cls: "info", icon: "－", text: "見送り" },
    };

    const list = el("div", "sig-list");
    const acts = sg.signals.filter((s) => s.kind !== "INFO");

    if (!sg.signals.length) {
      list.appendChild(el("div", "sig-quiet",
        "今日は売買のサインなし。何もしなくて大丈夫です。"));
    }

    sg.signals.forEach((s) => {
      const k = KIND[s.kind] || KIND.INFO;
      const card = el("div", "sig-card " + k.cls);

      const tag = el("span", "sig-tag");
      tag.appendChild(el("span", null, k.icon));
      tag.appendChild(el("span", null, k.text));
      card.appendChild(tag);

      const head = el("div", "sig-head", s.code.replace("US.", ""));
      const jpy = s.price * m.usdjpy;
      head.appendChild(el("span", "sig-price",
        `$${s.price.toFixed(2)}　約 ${yen(jpy)} 円`));
      card.appendChild(head);

      card.appendChild(el("div", "sig-reason", s.reason));

      if (s.kind === "BUY") {
        const a = el("div", "sig-action");
        a.innerHTML =
          `買うなら <b>${s.qty}</b> 株　＝　約 <b>${yen(jpy * s.qty)}</b> 円`
          + `　／　損切りの目安 <b>$${(s.price * (1 - m.stop_loss_pct / 100)).toFixed(2)}</b>`;
        card.appendChild(a);
      } else if (s.kind === "SELL" || s.kind === "STOP") {
        const a = el("div", "sig-action");
        const cls = sign(s.pnl_pct);
        a.innerHTML = `保有 <b>${s.qty}</b> 株　／　損益 `
          + `<b class="${cls}">${arrow(s.pnl_pct)} ${pct(s.pnl_pct)}</b>`;
        card.appendChild(a);
      } else {
        card.appendChild(el("div", "sig-action", "様子を見ます。"));
      }
      list.appendChild(card);
    });
    host.appendChild(list);

    // 見張っている銘柄ぜんぶの状態
    if (sg.watchlist && sg.watchlist.length) {
      const row = el("div", "watch-row");
      sg.watchlist.forEach((w) => {
        const chip = el("span", "watch-chip");
        chip.appendChild(el("span", null, w.code.replace("US.", "")));
        chip.appendChild(el("span", null, `$${w.price.toFixed(2)}`));
        const t = el("span", "trend " + (w.trend_up ? "up" : "down"),
          w.trend_up ? "▲ 上昇" : "▼ 下降");
        chip.appendChild(t);
        row.appendChild(chip);
      });
      host.appendChild(row);
    }

    if (acts.length) document.title = `(${acts.length}) 模擬取引ダッシュボード`;
  })();

  /* =========================================================
     2. 模擬口座
     ========================================================= */
  (function renderAccount() {
    const tiles = $("accTiles");
    const table = $("posTable");
    const p = window.PORTFOLIO;

    if (!p) {
      tiles.appendChild(tile("口座データ", "未取得", "5_export_dashboard.py を実行してください"));
      emptyRow(table, 6, "まだ口座データがありません。ターミナルで 5_export_dashboard.py を実行すると、ここに表示されます。");
      $("accUpdated").textContent = "";
      return;
    }

    // 本番口座のデータだった場合は赤いバッジに切り替える
    if (p.meta && p.meta.is_paper === false) {
      const b = $("envBadge");
      b.textContent = "本番・実際のお金";
      b.className = "badge badge-real";
    }

    $("accUpdated").textContent =
      `最終更新 ${p.meta.updated_at}　/　${p.meta.trd_env}　/　${p.meta.market}`;

    const a = p.account;
    const totalPnl = p.positions.reduce((s, x) => s + x.pnl_value, 0);
    tiles.appendChild(tile("総資産", yen(a.total_assets) + " 円"));
    tiles.appendChild(tile("現金", yen(a.cash) + " 円"));
    tiles.appendChild(tile("株式の評価額", yen(a.market_value) + " 円"));
    tiles.appendChild(tile(
      "評価損益",
      `${arrow(totalPnl)} ${yen(Math.abs(totalPnl))} 円`,
      "保有中の銘柄の合計",
      sign(totalPnl)
    ));

    if (!p.positions.length) {
      emptyRow(table, 6, "保有している銘柄はありません。");
      return;
    }
    p.positions.forEach((x) => {
      const tr = el("tr");
      tr.appendChild(el("td", null, `${x.name}（${x.code}）`));
      tr.appendChild(el("td", "num", yen(x.qty)));
      tr.appendChild(el("td", "num", yen(x.cost_price)));
      tr.appendChild(el("td", "num", yen(x.current_price)));
      tr.appendChild(el("td", "num", yen(x.market_value)));
      const pnl = el("td", "num " + sign(x.pnl_value),
        `${arrow(x.pnl_value)} ${yen(Math.abs(x.pnl_value))}（${pct(x.pnl_pct)}）`);
      tr.appendChild(pnl);
      table.tBodies[0].appendChild(tr);
    });
  })();

  /* =========================================================
     3. バックテスト
     ========================================================= */
  const bt = window.BACKTEST;
  let chart = null;

  (function renderBacktest() {
    const tiles = $("btTiles");
    const tradeTable = $("tradeTable");

    if (!bt) {
      tiles.appendChild(tile("検証結果", "未実行", "4_backtest.py を実行してください"));
      emptyRow(tradeTable, 5, "まだバックテストを実行していません。");
      return;
    }

    if (bt.meta.is_sample) $("sampleWarn").hidden = false;

    $("btMeta").textContent =
      `${bt.meta.strategy}　/　${bt.meta.period}（${bt.meta.bars}営業日）　`
      + `/　元手 ${yen(bt.meta.initial_cash)} 円　/　手数料想定 ${bt.meta.fee_rate_pct}%`;

    const m = bt.metrics;
    tiles.appendChild(tile(
      "総リターン", pct(m.total_return_pct),
      `ずっと保有なら ${pct(m.buyhold_return_pct)}`, sign(m.total_return_pct)
    ));
    tiles.appendChild(tile("年率換算", pct(m.cagr_pct), null, sign(m.cagr_pct)));
    tiles.appendChild(tile(
      "最大ドローダウン", m.max_drawdown_pct.toFixed(2) + "%",
      "途中で耐える下落幅", "neg"
    ));
    tiles.appendChild(tile("取引回数", m.trade_count + " 回"));
    tiles.appendChild(tile("勝率", m.win_rate_pct + "%",
      `${m.trade_count} 回のうち勝ちの割合`));

    $("figSub").textContent = `元手 ${yen(bt.meta.initial_cash)} 円がどう増減したか`;

    // --- 売買の記録 -----------------------------------------
    if (!bt.trades.length) {
      emptyRow(tradeTable, 5, "この期間には売買のシグナルが出ませんでした。");
    } else {
      bt.trades.forEach((t) => {
        const tr = el("tr");
        tr.appendChild(el("td", null, t.entry_date));
        tr.appendChild(el("td", "num", yen(t.entry_price)));
        tr.appendChild(el("td", null, t.exit_date));
        tr.appendChild(el("td", "num", yen(t.exit_price)));
        tr.appendChild(el("td", "num " + sign(t.pnl_pct),
          `${arrow(t.pnl_pct)} ${pct(t.pnl_pct)}`));
        tradeTable.tBodies[0].appendChild(tr);
      });
    }

    // --- 凡例 -----------------------------------------------
    const legend = $("legend");
    [["戦略（移動平均クロス）", "var(--series-1)"],
     ["ずっと保有していた場合", "var(--series-2)"]].forEach(([name, color]) => {
      const item = el("span", "legend-item");
      const sw = el("span", "legend-swatch");
      sw.style.background = color;
      item.appendChild(sw);
      item.appendChild(el("span", null, name));
      legend.appendChild(item);
    });

    // --- 数字の表（色だけに頼らないための代替表示） ------------
    const toggleBtn = $("tableToggle");
    const wrap = $("seriesTableWrap");
    let built = false;
    toggleBtn.addEventListener("click", () => {
      const open = wrap.hidden;
      wrap.hidden = !open;
      toggleBtn.setAttribute("aria-expanded", String(open));
      toggleBtn.textContent = open ? "表を閉じる" : "数字の表で見る";
      if (open && !built) {
        built = true;
        const body = $("seriesTable").tBodies[0];
        const s = bt.series;
        const step = Math.max(1, Math.ceil(s.dates.length / 260));
        const frag = document.createDocumentFragment();
        for (let i = 0; i < s.dates.length; i += step) {
          const tr = el("tr");
          tr.appendChild(el("td", null, s.dates[i]));
          tr.appendChild(el("td", "num", yen(s.strategy[i])));
          tr.appendChild(el("td", "num", yen(s.buyhold[i])));
          frag.appendChild(tr);
        }
        body.appendChild(frag);
        $("seriesTableNote").textContent =
          step > 1 ? `見やすさのため ${step} 営業日ごとに間引いて表示しています。` : "";
      }
    });

    chart = makeChart($("chartHost"), $("tooltip"), bt.series);
    chart.draw();
    window.addEventListener("resize", chart.draw);
  })();

  /* =========================================================
     4. 折れ線グラフ（SVG を手で組み立てる）
     ========================================================= */
  function makeChart(host, tip, s) {
    const NS = "http://www.w3.org/2000/svg";
    const n = s.dates.length;
    let geom = null;

    function svgEl(tag, attrs) {
      const e = document.createElementNS(NS, tag);
      for (const k in attrs) e.setAttribute(k, attrs[k]);
      return e;
    }

    // 目盛りの刻み幅を「きりのいい数字」にする
    function niceStep(range, count) {
      const raw = range / count;
      const mag = Math.pow(10, Math.floor(Math.log10(raw)));
      const norm = raw / mag;
      const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
      return step * mag;
    }

    const fmtY = (v) =>
      Math.abs(v) >= 10000 ? (v / 10000).toFixed(v % 10000 === 0 ? 0 : 1) + "万" : String(Math.round(v));

    function draw() {
      const w = Math.max(host.clientWidth || 320, 300);
      const small = w < 520;
      const h = small ? 240 : 320;
      const pad = { t: 14, r: small ? 54 : 84, b: 26, l: small ? 46 : 56 };

      const lo = Math.min(...s.strategy, ...s.buyhold);
      const hi = Math.max(...s.strategy, ...s.buyhold);
      const span = (hi - lo) || 1;
      const yMin = lo - span * 0.06;
      const yMax = hi + span * 0.06;

      const plotW = w - pad.l - pad.r;
      const plotH = h - pad.t - pad.b;
      const X = (i) => pad.l + (n <= 1 ? 0 : (i / (n - 1)) * plotW);
      const Y = (v) => pad.t + (1 - (v - yMin) / (yMax - yMin)) * plotH;
      geom = { X, Y, pad, plotW, plotH, w, h };

      const svg = svgEl("svg", {
        viewBox: `0 0 ${w} ${h}`,
        role: "img",
        "aria-label": "戦略とずっと保有した場合の資産推移の折れ線グラフ",
      });

      // --- 横の目盛り線（控えめに） --------------------------
      const step = niceStep(yMax - yMin, small ? 3 : 4);
      for (let v = Math.ceil(yMin / step) * step; v <= yMax; v += step) {
        svg.appendChild(svgEl("line", {
          x1: pad.l, x2: w - pad.r, y1: Y(v), y2: Y(v),
          stroke: "var(--grid)", "stroke-width": 1,
        }));
        const t = svgEl("text", {
          x: pad.l - 8, y: Y(v) + 4, "text-anchor": "end",
          fill: "var(--text-muted)", "font-size": 11,
          "font-family": "inherit", "font-variant-numeric": "tabular-nums",
        });
        t.textContent = fmtY(v);
        svg.appendChild(t);
      }

      // --- 下の軸線 ------------------------------------------
      svg.appendChild(svgEl("line", {
        x1: pad.l, x2: w - pad.r, y1: pad.t + plotH, y2: pad.t + plotH,
        stroke: "var(--axis)", "stroke-width": 1,
      }));

      // --- 日付ラベル ----------------------------------------
      const ticks = small ? 3 : 5;
      for (let k = 0; k < ticks; k++) {
        const i = Math.round((k / (ticks - 1)) * (n - 1));
        const t = svgEl("text", {
          x: X(i), y: h - 8,
          "text-anchor": k === 0 ? "start" : k === ticks - 1 ? "end" : "middle",
          fill: "var(--text-muted)", "font-size": 11, "font-family": "inherit",
        });
        t.textContent = s.dates[i].slice(0, 7).replace("-", "/");
        svg.appendChild(t);
      }

      // --- 折れ線 --------------------------------------------
      const line = (vals) =>
        vals.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join("");

      [[s.buyhold, "var(--series-2)", "ずっと保有"],
       [s.strategy, "var(--series-1)", "戦略"]].forEach(([vals, color, label]) => {
        svg.appendChild(svgEl("path", {
          d: line(vals), fill: "none", stroke: color,
          "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round",
        }));
        if (!small) {
          // 線の右端に名前を直接添える（凡例を目で往復しなくて済む）
          const last = vals[n - 1];
          svg.appendChild(svgEl("circle", {
            cx: X(n - 1), cy: Y(last), r: 4, fill: color,
            stroke: "var(--surface-1)", "stroke-width": 2,
          }));
          const t = svgEl("text", {
            x: X(n - 1) + 10, y: Y(last) + 4,
            fill: "var(--text-secondary)", "font-size": 11, "font-family": "inherit",
          });
          t.textContent = label;
          svg.appendChild(t);
        }
      });

      // --- カーソルを合わせたときの表示 -----------------------
      const hover = svgEl("g", { opacity: 0 });
      const vline = svgEl("line", {
        y1: pad.t, y2: pad.t + plotH, stroke: "var(--axis)", "stroke-width": 1,
      });
      const dotA = svgEl("circle", {
        r: 4.5, fill: "var(--series-1)", stroke: "var(--surface-1)", "stroke-width": 2,
      });
      const dotB = svgEl("circle", {
        r: 4.5, fill: "var(--series-2)", stroke: "var(--surface-1)", "stroke-width": 2,
      });
      hover.appendChild(vline); hover.appendChild(dotB); hover.appendChild(dotA);
      svg.appendChild(hover);

      host.querySelectorAll("svg").forEach((o) => o.remove());
      host.insertBefore(svg, tip);

      // --- 当たり判定 ----------------------------------------
      function at(clientX) {
        const box = svg.getBoundingClientRect();
        const px = ((clientX - box.left) / box.width) * w;
        const ratio = (px - pad.l) / plotW;
        return Math.min(n - 1, Math.max(0, Math.round(ratio * (n - 1))));
      }

      function show(e) {
        const i = at(e.clientX);
        const xs = X(i);
        vline.setAttribute("x1", xs); vline.setAttribute("x2", xs);
        dotA.setAttribute("cx", xs); dotA.setAttribute("cy", Y(s.strategy[i]));
        dotB.setAttribute("cx", xs); dotB.setAttribute("cy", Y(s.buyhold[i]));
        hover.setAttribute("opacity", 1);

        tip.innerHTML = "";
        tip.appendChild(el("div", "tt-date", s.dates[i]));
        [["戦略", s.strategy[i], "var(--series-1)"],
         ["ずっと保有", s.buyhold[i], "var(--series-2)"]].forEach(([name, v, c]) => {
          const row = el("div", "tt-row");
          const sw = el("span", "legend-swatch");
          sw.style.background = c;
          row.appendChild(sw);
          row.appendChild(el("span", null, name));
          row.appendChild(el("span", "tt-val", yen(v) + " 円"));
          tip.appendChild(row);
        });
        tip.hidden = false;

        const scale = svg.getBoundingClientRect().width / w;
        let left = xs * scale + 14;
        if (left + tip.offsetWidth > host.clientWidth) left = xs * scale - tip.offsetWidth - 14;
        tip.style.left = Math.max(0, left) + "px";
        tip.style.top = "10px";
      }

      function hide() {
        hover.setAttribute("opacity", 0);
        tip.hidden = true;
      }

      svg.addEventListener("pointermove", show);
      svg.addEventListener("pointerdown", show);
      svg.addEventListener("pointerleave", hide);
    }

    return { draw };
  }
})();
