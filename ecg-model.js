/* ============================================================
   ecg-model.js
   心電図の「波形」と「刺激伝導系タイミング」を定義するファイル。

   ここは心電図検定の医学知識そのものに一番近い場所です。
   波形の形・タイミングを調整したいときはこのファイルを触ります。
   ============================================================ */

// 1心拍の基準タイミング（正常洞調律、心拍数72/分を基準にした「割合」ではなく「秒」で定義）
// t=0 が「洞結節(SA node)が発火した瞬間」です。
const ECG_TIMING = {
  hr: 72,                 // 基準心拍数（bpm）。再生速度スライダーとは別に、疾患パターンごとにここを変えられる
  pStart: 0.00,  pDur: 0.09,   // P波：心房の脱分極
  prSegStart: 0.09, // PR分節の開始（P波が終わったあと、房室結節での遅延）
  qrsStart: 0.16, qrsDur: 0.09,  // QRS波：心室の脱分極
  stSegStart: 0.25, // ST分節の開始
  tStart: 0.32, tDur: 0.16,     // T波：心室の再分極
  // 刺激伝導系アニメーション用のタイミング（3D心臓側で使う）
  saFire: [0.00, 0.02],        // 洞結節が光る期間
  atriaConduct: [0.00, 0.09],  // 心房内を興奮が広がる期間（P波と同期）
  avNodeDelay: [0.09, 0.16],   // 房室結節で伝導が遅くなる期間（PR分節と同期）
  hisBundle: [0.16, 0.18],     // His束を興奮が通過する期間
  bundleBranches: [0.16, 0.20],// 左脚・右脚を興奮が通過する期間
  purkinje: [0.16, 0.25],      // プルキンエ線維〜心室全体の脱分極（QRSと同期）
  repolarization: [0.32, 0.48],// 心室の再分極（T波と同期、脱分極とは別の色で表現する）
};

function cycleSeconds(hr) {
  return 60 / hr;
}

// ガウス関数（波形のふくらみを作る基本パーツ）
function gauss(t, center, sigma, amp) {
  const d = (t - center) / sigma;
  return amp * Math.exp(-0.5 * d * d);
}

/*
  12誘導それぞれの「P波・Q波・R波・S波・T波」の振幅テーブル。
  実測データではなく、教育用に「正常洞調律らしい向き・高さ」を再現した近似値です
  （心電図検定の学習用途としては十分ですが、診断用途には使えません）。
  値の単位はmVっぽいイメージの相対値（-1.5〜+1.5くらい）。
  符号がマイナス＝下向きの波、という意味です。

  ★ここを書き換えると、疾患パターンごとの「異常な波形」も表現できます★
  （例：ST上昇なら st の値を足す、房室ブロックならPR間隔を伸ばす、など）
*/
const LEAD_TABLE = {
  I:   { p: 0.10, q: -0.05, r: 0.80, s: -0.10, t: 0.25 },
  II:  { p: 0.15, q: -0.05, r: 1.20, s: -0.15, t: 0.30 },
  III: { p: 0.05, q: -0.02, r: 0.50, s: -0.10, t: 0.10 },
  aVR: { p: -0.10, q: 0.05, r: -0.60, s: 0.10, t: -0.20 },
  aVL: { p: 0.05, q: -0.05, r: 0.40, s: -0.15, t: 0.10 },
  aVF: { p: 0.12, q: -0.05, r: 0.90, s: -0.15, t: 0.25 },
  V1:  { p: 0.10, q: 0.00, r: 0.20, s: -0.80, t: -0.10 },
  V2:  { p: 0.08, q: 0.00, r: 0.40, s: -1.00, t: 0.30 },
  V3:  { p: 0.08, q: -0.05, r: 0.80, s: -0.60, t: 0.40 },
  V4:  { p: 0.08, q: -0.08, r: 1.20, s: -0.30, t: 0.45 },
  V5:  { p: 0.10, q: -0.10, r: 1.40, s: -0.10, t: 0.40 },
  V6:  { p: 0.10, q: -0.10, r: 1.10, s: -0.05, t: 0.35 },
};

const LEAD_ORDER = ["I", "II", "III", "aVR", "aVL", "aVF", "V1", "V2", "V3", "V4", "V5", "V6"];
// 標準的な心電図用紙のレイアウト（縦3段×横4列）
const LEAD_LAYOUT = [
  ["I", "aVR", "V1", "V4"],
  ["II", "aVL", "V2", "V5"],
  ["III", "aVF", "V3", "V6"],
];

/*
  指定した時刻 t（心周期の先頭からの経過秒）における、指定リードの振幅を返す。
  timing: ECG_TIMINGと同じ形の設定を渡す（疾患パターンで変える場合はコピーして書き換える）
*/
function sampleLead(leadName, t, timing) {
  const cfg = LEAD_TABLE[leadName];
  const tm = timing || ECG_TIMING;
  let v = 0;

  // P波
  v += gauss(t, tm.pStart + tm.pDur / 2, tm.pDur / 4.2, cfg.p);

  // QRS波（Q・R・Sの3つの山を合成）
  const qc = tm.qrsStart + tm.qrsDur * 0.18;
  const rc = tm.qrsStart + tm.qrsDur * 0.45;
  const sc = tm.qrsStart + tm.qrsDur * 0.75;
  v += gauss(t, qc, tm.qrsDur * 0.10, cfg.q);
  v += gauss(t, rc, tm.qrsDur * 0.13, cfg.r);
  v += gauss(t, sc, tm.qrsDur * 0.12, cfg.s);

  // T波
  v += gauss(t, tm.tStart + tm.tDur / 2, tm.tDur / 3.6, cfg.t);

  return v;
}

/*
  与えられた絶対時刻 simTime（アプリ起動からの秒数を想定）から、
  現在の心周期内での経過秒（0〜cycleLen）を計算するユーティリティ。
*/
function phaseTime(simTime, hr) {
  const cycleLen = cycleSeconds(hr);
  const t = simTime % cycleLen;
  return { t, cycleLen };
}

// 現在の位相 t が、与えられた [start, end] 区間内にあるかどうか（0〜1の重なり具合を返す。0=範囲外、1=中心）
function phaseWeight(t, range) {
  const [s, e] = range;
  if (t < s || t > e) return 0;
  const mid = (s + e) / 2;
  const half = (e - s) / 2;
  if (half <= 0) return 1;
  return 1 - Math.abs(t - mid) / half;
}

/* ---------- 他ファイルから使えるようにする（中身はここより上を見てください） ---------- */
export {
  ECG_TIMING,
  LEAD_TABLE,
  LEAD_ORDER,
  LEAD_LAYOUT,
  cycleSeconds,
  sampleLead,
  phaseTime,
  phaseWeight,
};
