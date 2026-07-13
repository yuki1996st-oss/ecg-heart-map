/* ============================================================
   ecg-render.js
   12誘導心電図をCanvasに描画する部分（心電図用紙っぽい見た目にする）。
   ============================================================ */

import { LEAD_LAYOUT, sampleLead, cycleSeconds } from "./ecg-model.js";

const GRID_COLOR = "#f0c9d2";
const TRACE_COLOR = "#1a2b1a";
const LABEL_COLOR = "#444";

function drawGrid(ctx, x, y, w, h) {
  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = 1;
  const step = 8;
  for (let gx = 0; gx <= w; gx += step) {
    ctx.beginPath();
    ctx.moveTo(x + gx, y);
    ctx.lineTo(x + gx, y + h);
    ctx.stroke();
  }
  for (let gy = 0; gy <= h; gy += step) {
    ctx.beginPath();
    ctx.moveTo(x, y + gy);
    ctx.lineTo(x + w, y + gy);
    ctx.stroke();
  }
}

/*
  createEcgRenderer(canvas) -> { render(simTime, hr, timing) }
  simTime: アプリ開始からの経過秒（一時停止・速度変更を反映した「シミュレーション内時刻」）
  hr, timing: ecg-model.js の ECG_TIMING と同じ形（疾患パターンで差し替え可能）
*/
function createEcgRenderer(canvas) {
  const ctx = canvas.getContext("2d");
  const WINDOW_SEC = 2.6; // 画面に表示する秒数（横幅）

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  function render(simTime, hr, timing) {
    const rect = canvas.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#fff8f8";
    ctx.fillRect(0, 0, W, H);

    const cols = LEAD_LAYOUT[0].length;
    const rows = LEAD_LAYOUT.length;
    const cellW = W / cols;
    const cellH = H / rows;
    const pxPerSec = cellW / WINDOW_SEC;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const lead = LEAD_LAYOUT[r][c];
        const x0 = c * cellW;
        const y0 = r * cellH;
        drawGrid(ctx, x0, y0, cellW, cellH);

        // 枠線
        ctx.strokeStyle = "#e2b5c0";
        ctx.strokeRect(x0, y0, cellW, cellH);

        // ラベル
        ctx.fillStyle = LABEL_COLOR;
        ctx.font = "600 12px sans-serif";
        ctx.fillText(lead, x0 + 6, y0 + 16);

        // 波形
        const midY = y0 + cellH * 0.58;
        const scale = cellH * 0.30;
        ctx.strokeStyle = TRACE_COLOR;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        const startT = simTime - WINDOW_SEC;
        const stepSec = 1 / 240; // サンプリング解像度
        let first = true;
        for (let tt = startT; tt <= simTime; tt += stepSec) {
          const cyc = cycleSeconds(hr);
          let phase = tt % cyc;
          if (phase < 0) phase += cyc;
          const v = sampleLead(lead, phase, timing);
          const px = x0 + (tt - startT) * pxPerSec;
          const py = midY - v * scale;
          if (first) {
            ctx.moveTo(px, py);
            first = false;
          } else {
            ctx.lineTo(px, py);
          }
        }
        ctx.stroke();

        // 現在時刻のカーソル線
        ctx.strokeStyle = "#c23b5e";
        ctx.lineWidth = 1;
        const cursorX = x0 + cellW - 1;
        ctx.beginPath();
        ctx.moveTo(cursorX, y0 + 2);
        ctx.lineTo(cursorX, y0 + cellH - 2);
        ctx.stroke();
      }
    }
  }

  return { render, resize };
}

export { createEcgRenderer };
