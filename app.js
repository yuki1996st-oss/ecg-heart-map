/* ============================================================
   app.js
   アプリ全体の司令塔。3D心臓・12誘導心電図・メニュー・再生コントロールを
   つなぎ合わせるファイルです。

   ★文章コンテンツ（解説文など）はここではなく data.js を編集してください★
   ここは「表示の仕組み」だけを扱います。
   ============================================================ */

import { create as createHeart } from "./heart3d.js";
import { createEcgRenderer } from "./ecg-render.js";
import { ECG_TIMING, cycleSeconds, phaseTime } from "./ecg-model.js";
import { PART_INFO, PATTERNS, BASICS_SECTIONS } from "./data.js";

/* ---------- ナビゲーション（メニュー開閉・画面切り替え） ---------- */
const menuBtn = document.getElementById("menuBtn");
const navDrawer = document.getElementById("navDrawer");
const navOverlay = document.getElementById("navOverlay");
const views = document.querySelectorAll(".view");

function openMenu() {
  navDrawer.classList.remove("hidden");
  navOverlay.classList.remove("hidden");
}
function closeMenu() {
  navDrawer.classList.add("hidden");
  navOverlay.classList.add("hidden");
}
menuBtn.addEventListener("click", openMenu);
navOverlay.addEventListener("click", closeMenu);

function showView(viewId) {
  views.forEach((v) => v.classList.toggle("hidden", v.id !== viewId));
}
document.querySelectorAll(".navItem").forEach((btn) => {
  btn.addEventListener("click", () => {
    showView(btn.dataset.view);
    closeMenu();
  });
});

/* ---------- 3D心臓の初期化 ---------- */
const heartContainer = document.getElementById("heartContainer");
const heart = createHeart(heartContainer, {
  onPartClick(partId) {
    showPartPopup(partId);
  },
});

/* ---------- 表示レイヤー切替（文字ラベル・伝導系・部屋名・大血管・冠動脈） ---------- */
const toggleMap = {
  tgLabels: (on) => heart.setLabelsVisible(on),
  tgConduction: (on) => heart.setLayerVisible("conduction", on),
  tgChamber: (on) => heart.setLayerVisible("chamber", on),
  tgVessel: (on) => heart.setLayerVisible("vessel", on),
  tgCoronary: (on) => heart.setLayerVisible("coronary", on),
};
Object.entries(toggleMap).forEach(([id, fn]) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener("change", () => fn(el.checked));
});

/* ---------- 12誘導心電図の初期化 ---------- */
const ecgCanvas = document.getElementById("ecgCanvas");
const ecgRenderer = createEcgRenderer(ecgCanvas);

/* ---------- パーツ解説ポップアップ ---------- */
const partPopup = document.getElementById("partPopup");
const popupTitle = document.getElementById("popupTitle");
const popupBody = document.getElementById("popupBody");
const popupExam = document.getElementById("popupExam");
const popupClose = document.getElementById("popupClose");

function showPartPopup(partId) {
  const info = PART_INFO[partId];
  if (!info) return;
  popupTitle.textContent = info.name;
  popupBody.textContent = info.body;
  popupExam.textContent = info.exam || "";
  popupExam.classList.toggle("hidden", !info.exam);
  partPopup.classList.remove("hidden");
}
popupClose.addEventListener("click", () => partPopup.classList.add("hidden"));
partPopup.addEventListener("click", (e) => {
  if (e.target === partPopup) partPopup.classList.add("hidden");
});

/* ---------- 波形パターン選択＋解説パネル ---------- */
const patternSelect = document.getElementById("patternSelect");
const explainPanel = document.getElementById("explainPanel");
const expName = document.getElementById("expName");
const expNameEn = document.getElementById("expNameEn");
const expOverview = document.getElementById("expOverview");
const expFindings = document.getElementById("expFindings");
const expMechanism = document.getElementById("expMechanism");
const expExamPoints = document.getElementById("expExamPoints");
const expSimilar = document.getElementById("expSimilar");
const expUrgency = document.getElementById("expUrgency");

let currentPattern = null;

// 実装済みのパターンのみ選択肢に出す（未実装は今後のフェーズで追加）
const implementedPatterns = PATTERNS.filter((p) => p.implemented);
implementedPatterns.forEach((p) => {
  const opt = document.createElement("option");
  opt.value = p.id;
  opt.textContent = p.name;
  patternSelect.appendChild(opt);
});

function currentTiming() {
  if (!currentPattern || !currentPattern.timingOverride) return ECG_TIMING;
  return Object.assign({}, ECG_TIMING, currentPattern.timingOverride);
}

function selectPattern(patternId) {
  const p = implementedPatterns.find((x) => x.id === patternId);
  if (!p) return;
  currentPattern = p;
  patternSelect.value = p.id;
  renderExplainPanel(p);
}

// 選択した瞬間に解説パネルを自動で開く（クリックを挟まない）
function renderExplainPanel(p) {
  expName.textContent = p.name;
  expNameEn.textContent = p.nameEn || "";
  expOverview.textContent = p.explain.overview;
  expFindings.textContent = p.explain.findings;
  expMechanism.textContent = p.explain.mechanism;
  expExamPoints.textContent = p.explain.examPoints;
  expSimilar.textContent = p.explain.similar;
  expUrgency.textContent = p.explain.urgency;
  explainPanel.classList.remove("hidden");
}

patternSelect.addEventListener("change", () => selectPattern(patternSelect.value));

if (implementedPatterns.length) {
  selectPattern(implementedPatterns[0].id);
}

/* ---------- 再生コントロール（再生/一時停止・速度・1拍送り） ---------- */
const playPauseBtn = document.getElementById("playPauseBtn");
const speedRange = document.getElementById("speedRange");
const speedValue = document.getElementById("speedValue");
const stepBtn = document.getElementById("stepBtn");

let playing = true;
let speed = 1;
let simTime = 0;

playPauseBtn.addEventListener("click", () => {
  playing = !playing;
  playPauseBtn.textContent = playing ? "⏸ 一時停止" : "▶ 再生";
});

speedRange.addEventListener("input", () => {
  speed = parseFloat(speedRange.value);
  speedValue.textContent = `${speed.toFixed(2)}×`;
});

stepBtn.addEventListener("click", () => {
  const timing = currentTiming();
  simTime += cycleSeconds(timing.hr);
});

/* ---------- アニメーションループ ---------- */
let lastFrameMs = null;
function tick(nowMs) {
  if (lastFrameMs === null) lastFrameMs = nowMs;
  const dtSec = (nowMs - lastFrameMs) / 1000;
  lastFrameMs = nowMs;

  if (playing) {
    simTime += dtSec * speed;
  }

  const timing = currentTiming();
  const { t } = phaseTime(simTime, timing.hr);

  heart.update(t);
  ecgRenderer.render(simTime, timing.hr, timing);

  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

/* ---------- 基礎知識モードのコンテンツ描画 ---------- */
const basicsContent = document.getElementById("basicsContent");
BASICS_SECTIONS.forEach((sec) => {
  const wrap = document.createElement("div");
  wrap.className = "basicSection";
  const h3 = document.createElement("h3");
  h3.textContent = sec.title;
  wrap.appendChild(h3);
  sec.body.forEach((line) => {
    const p = document.createElement("p");
    p.textContent = line;
    wrap.appendChild(p);
  });
  basicsContent.appendChild(wrap);
});
