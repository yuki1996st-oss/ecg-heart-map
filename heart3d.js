/* ============================================================
   heart3d.js
   3D心臓モデルと刺激伝導系の描画（Three.js使用）。

   ★このバージョンの作り★
   ・心臓の外形は「本物のリアルな3Dモデル(STL)」を読み込み、半透明で表示します
     （出典：neshallads「Realistic Human Heart」CC BY 4.0）。
   ・刺激伝導系（洞結節→房室結節→His束→左右脚→プルキンエ線維）は、
     どの3Dモデルにも部品として含まれないため、こちらで解剖学的な位置に沿って
     作り込み、半透明の心臓の“中に”はっきり見えるようにしています。
   ・各部位には日本語ラベルが付き、タップ/クリックで解説が出ます。
   ・心電図のタイミング(ECG_TIMING)に合わせて、伝導路が順番に光ります。

   ★位置や向きの微調整★
   下の「調整用の定数」を変えると、モデルの向き・大きさ・伝導路の位置を調整できます。
   ============================================================ */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { ECG_TIMING, phaseWeight } from "./ecg-model.js";

/* ---------- 調整用の定数（ここを触れば見た目を調整できます） ---------- */
const MODEL_URL = "./models/heart.stl";
const MODEL_TARGET_HEIGHT = 3.6;         // 画面内での心臓の高さ（大きさ）
const MODEL_ROT = { x: 0, y: 0, z: 0 };  // モデルの回転（ラジアン）。向きがおかしければここを調整
const HEART_OPACITY = 0.22;              // 心臓シェルの透明度（小さいほど透ける）

/* ---------- 色 ---------- */
const COLOR = {
  heart: 0xc26a60,       // 半透明の心臓（筋肉の赤）
  conduction: 0xffd23f,  // 伝導系の通常色（金色。赤い心臓の中でも見やすい）
  depolarize: 0xff7a00,  // 脱分極で光る色（オレンジ）
  repolarize: 0x4fa3ff,  // 再分極で光る色（青）
  damage: 0xff2d2d,      // 障害部位のハイライト色（赤）
  valve: 0xe8d59a,
  oxyRed: 0xd23b3b,      // 高酸素（動脈血）＝赤：大動脈・肺静脈・左心系
  deoxyBlue: 0x3b6fd2,   // 低酸素（静脈血）＝青：大静脈・肺動脈・右心系
  coronary: 0xb5322b,    // 冠動脈（心臓表面を走る動脈）＝深い赤
};

/* ---------- 刺激伝導系の座標（心臓の高さを約3.6に正規化した空間） ----------
   x: 右(+)／左(-)  … 画面上の左右
   y: 上(+)／下(-)  … 心房が上、心尖が下
   z: 前(+)／後(-)  … 手前が前面
   ※これは解剖学的な平均位置に沿った模式的な配置です（本物の壁内組織は見えないため）。
*/
const NODES = {
  sa:  [0.55, 1.15, 0.5],    // 洞結節（右心房の上部）
  av:  [0.0, 0.2, 0.28],     // 房室結節（心房と心室の境目・中央）
  his: [0.0, -0.05, 0.18],   // His束の入口
  hisEnd: [0.0, -0.28, 0.12],// His束の分岐点
};

function makeStandardMat(colorHex, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color: colorHex,
    emissive: 0x000000,
    emissiveIntensity: 0,
    roughness: 0.5,
    metalness: 0.05,
    transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
    depthWrite: opts.depthWrite ?? true,
  });
}

function tubeBetween(points, radius, colorHex) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const geo = new THREE.TubeGeometry(curve, 40, radius, 10, false);
  return new THREE.Mesh(geo, makeStandardMat(colorHex));
}

/* 先細り（テーパー）する滑らかなチューブを作る。
   本物の伝導路は「太いHis束 → 細い脚 → さらに細いプルキンエ」と
   だんだん細くなるので、始点の半径 r0 から終点の半径 r1 へなめらかに細める。*/
function taperedTube(points, r0, r1, colorHex, tubularSegments = 64, radialSegments = 9) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const frames = curve.computeFrenetFrames(tubularSegments, false);
  const positions = [], normals = [], indices = [];
  for (let i = 0; i <= tubularSegments; i++) {
    const u = i / tubularSegments;
    const r = r0 + (r1 - r0) * u;
    const P = curve.getPointAt(u);
    const N = frames.normals[i];
    const B = frames.binormals[i];
    for (let j = 0; j <= radialSegments; j++) {
      const v = (j / radialSegments) * Math.PI * 2;
      const nrm = new THREE.Vector3()
        .addScaledVector(N, Math.cos(v))
        .addScaledVector(B, Math.sin(v))
        .normalize();
      positions.push(P.x + nrm.x * r, P.y + nrm.y * r, P.z + nrm.z * r);
      normals.push(nrm.x, nrm.y, nrm.z);
    }
  }
  const cols = radialSegments + 1;
  for (let i = 0; i < tubularSegments; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * cols + j, b = (i + 1) * cols + j, c = (i + 1) * cols + j + 1, d = i * cols + j + 1;
      indices.push(a, b, d, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setIndex(indices);
  return new THREE.Mesh(geo, makeStandardMat(colorHex));
}

/* ベクトル小道具（プルキンエ網の枝分かれ生成に使う） */
function vadd(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function vscale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
function vnorm(a) {
  const L = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / L, a[1] / L, a[2] / L];
}

function create(container, callbacks = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xeef0f2);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 0.4, 6.6);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  // ラベル用の別レンダラー（文字を常に手前にくっきり表示）
  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.style.position = "absolute";
  labelRenderer.domElement.style.top = "0";
  labelRenderer.domElement.style.left = "0";
  labelRenderer.domElement.style.pointerEvents = "none";
  container.appendChild(labelRenderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 3;
  controls.maxDistance = 12;

  // ライト
  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const key = new THREE.DirectionalLight(0xffffff, 0.85);
  key.position.set(4, 6, 5);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.35);
  fill.position.set(-5, -2, -3);
  scene.add(fill);

  const heartGroup = new THREE.Group();
  scene.add(heartGroup);

  // ---- リアルな心臓シェル（STL・半透明）を読み込む ----
  const loader = new STLLoader();
  loader.load(
    MODEL_URL,
    (geometry) => {
      geometry.center();
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      const size = new THREE.Vector3();
      geometry.boundingBox.getSize(size);
      const scale = MODEL_TARGET_HEIGHT / size.y;

      const mat = makeStandardMat(COLOR.heart, {
        transparent: true,
        opacity: HEART_OPACITY,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.scale.setScalar(scale);
      mesh.rotation.set(MODEL_ROT.x, MODEL_ROT.y, MODEL_ROT.z);
      mesh.userData.partId = "atria"; // シェル自体をクリックしたら心房の解説（暫定）
      mesh.renderOrder = 2; // 伝導系の後に描画して重ねる
      heartGroup.add(mesh);
    },
    undefined,
    (err) => {
      console.error("心臓モデルの読み込みに失敗:", err);
    }
  );

  // ---- 表示レイヤー（トグルで出し入れできる） ----
  // すべて教科書の前面像に合わせて左右反転（患者の右側＝画面の左側）
  const conduction = new THREE.Group();  // 刺激伝導系
  const layerVessel = new THREE.Group();  // 大血管（動脈＝赤／静脈＝青）
  const layerCoronary = new THREE.Group();// 冠動脈
  const layerChamber = new THREE.Group(); // 部屋名ラベル（メッシュなし・文字だけ）
  [conduction, layerVessel, layerCoronary, layerChamber].forEach((g) => {
    g.scale.x = -1;
    heartGroup.add(g);
  });
  const layers = { conduction, vessel: layerVessel, coronary: layerCoronary, chamber: layerChamber };
  // 初期状態：伝導系と部屋名は表示、大血管・冠動脈は最初は隠す（ごちゃつき防止）
  layerVessel.visible = false;
  layerCoronary.visible = false;

  // ---- ラベル管理（レイヤーごと＋全体の文字ON/OFF） ----
  let labelsOn = true;
  const labelRegistry = []; // { obj, layer }
  function addLabel(text, partId, worldPos, off, parentGroup, layerName) {
    const div = document.createElement("div");
    div.className = "cLabel";
    div.textContent = text;
    div.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      if (callbacks.onPartClick) callbacks.onPartClick(partId);
    });
    const obj = new CSS2DObject(div);
    obj.position.set(worldPos[0] + off[0], worldPos[1] + off[1], worldPos[2] + off[2]);
    parentGroup.add(obj);
    labelRegistry.push({ obj, layer: layerName });
    return obj;
  }
  function refreshLabels() {
    labelRegistry.forEach(({ obj, layer }) => {
      const layerVisible = layers[layer] ? layers[layer].visible : true;
      obj.visible = labelsOn && layerVisible;
    });
  }

  // 各パーツをまとめて管理（発光アニメ・障害ハイライト・クリックに使う）
  const parts = {}; // partId -> { meshes:[], baseColor, range, repol? }

  function registerMesh(partId, mesh, range) {
    mesh.userData.partId = partId;
    conduction.add(mesh);
    if (!parts[partId]) parts[partId] = { meshes: [], range };
    parts[partId].meshes.push(mesh);
    if (range) parts[partId].range = range;
    return mesh;
  }

  // 卵形のノード（洞結節・房室結節）。本物は球でなく細長い塊なので少しつぶす。
  function nodeBlob(partId, pos, rx, ry, rz, range) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 20), makeStandardMat(COLOR.conduction));
    m.scale.set(rx, ry, rz);
    m.position.set(...pos);
    m.renderOrder = 1;
    return registerMesh(partId, m, range);
  }

  // 先細りチューブで1本の伝導路を作る
  function nodeTaper(partId, points, r0, r1, range) {
    const m = taperedTube(points, r0, r1, COLOR.conduction);
    m.renderOrder = 1;
    return registerMesh(partId, m, range);
  }

  /* ---- 心房内伝導（内結節路＋バッハマン束）＝解剖学的なルートに沿って ---- */
  // 前結節路（洞結節→前方を回って房室結節へ）
  nodeTaper("atria", [NODES.sa, [0.34, 0.78, 0.46], [0.14, 0.46, 0.36], [0.04, 0.3, 0.3], NODES.av], 0.045, 0.03, ECG_TIMING.atriaConduct);
  // 中結節路（Wenckebach：後方寄りを通る）
  nodeTaper("atria", [NODES.sa, [0.42, 0.72, 0.1], [0.28, 0.45, -0.02], [0.1, 0.3, 0.08], NODES.av], 0.035, 0.025, ECG_TIMING.atriaConduct);
  // 後結節路（Thorel：右房外側の後下方を通る）
  nodeTaper("atria", [NODES.sa, [0.7, 0.6, -0.1], [0.55, 0.3, -0.12], [0.22, 0.22, 0.0], NODES.av], 0.03, 0.022, ECG_TIMING.atriaConduct);
  // バッハマン束（右房→左房へ橋渡し。左房の興奮の遅れ＝P波後半に対応）
  nodeTaper("atria", [NODES.sa, [0.2, 1.05, 0.35], [-0.25, 0.98, 0.2], [-0.6, 0.78, 0.05], [-0.75, 0.55, -0.05]], 0.035, 0.02, ECG_TIMING.atriaConduct);

  // 洞結節（右房上部・細長い紡錘形）
  nodeBlob("sa_node", NODES.sa, 0.09, 0.16, 0.09, ECG_TIMING.saFire);
  // 房室結節（心房中隔の底・小さな卵形）
  nodeBlob("av_node", NODES.av, 0.12, 0.09, 0.09, ECG_TIMING.avNodeDelay);

  /* ---- His束（貫通束）：房室結節から膜性中隔を貫いて心室中隔の頂へ ---- */
  const hisTop = NODES.av;
  const hisCrest = [0.0, -0.34, 0.08]; // 筋性中隔の頂（ここで左右脚に分岐）
  nodeTaper("his_bundle", [hisTop, [0.0, 0.0, 0.16], NODES.his, hisCrest], 0.06, 0.045, ECG_TIMING.hisBundle);

  /* ---- 右脚：細い1本の索状で中隔右側を心尖へ下り、右室前壁へ ---- */
  const rbbEnd = [0.36, -1.5, 0.02];
  nodeTaper(
    "bundle_branch_r",
    [hisCrest, [0.16, -0.6, 0.12], [0.3, -1.05, 0.1], [0.36, -1.35, 0.06], rbbEnd],
    0.032, 0.02, ECG_TIMING.bundleBranches
  );

  /* ---- 左脚本幹：中隔左側へ短く抜けてすぐ前枝・後枝に分岐 ---- */
  const lbbFork = [-0.16, -0.52, 0.0];
  nodeTaper("bundle_branch_l", [hisCrest, [-0.08, -0.42, 0.05], lbbFork], 0.05, 0.038, ECG_TIMING.bundleBranches);
  // 左脚前枝（前上側→前側壁上部。細い）
  const lafEnd = [-0.52, -1.35, 0.12];
  nodeTaper("lantfasc", [lbbFork, [-0.34, -0.85, 0.14], [-0.46, -1.15, 0.13], lafEnd], 0.028, 0.017, ECG_TIMING.bundleBranches);
  // 左脚後枝（後下側→下後壁。太め）
  const lpfEnd = [-0.48, -1.4, -0.16];
  nodeTaper("lpostfasc", [lbbFork, [-0.36, -0.9, -0.12], [-0.45, -1.2, -0.15], lpfEnd], 0.034, 0.02, ECG_TIMING.bundleBranches);

  /* ---- プルキンエ線維網：各脚の末端から、心室内膜に沿って枝分かれしながら
     上方へ広がる細い網。再帰的に二又分岐させて“網”らしい密度を出す。---- */
  const purkinjeMeshes = [];
  let purkinjeBudget = 46; // 生成する枝の総数の上限（増やすと密になる）
  function growPurkinje(start, dir, len, radius, depth) {
    if (depth <= 0 || purkinjeBudget <= 0 || len < 0.12) return;
    const d = vnorm(dir);
    const mid = vadd(start, vadd(vscale(d, len * 0.5), [(Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.06]));
    const end = vadd(start, vscale(d, len));
    const tube = taperedTube([start, mid, end], radius, radius * 0.62, COLOR.conduction, 10, 6);
    tube.userData.partId = "purkinje";
    tube.renderOrder = 1;
    conduction.add(tube);
    purkinjeMeshes.push(tube);
    purkinjeBudget--;
    // 二又に分岐（心尖から上へ、内膜に沿って左右に開く）
    const spread = 0.5 + Math.random() * 0.3;
    const branch = (sign) => {
      const nd = vnorm([
        d[0] + sign * spread * (0.6 + Math.random() * 0.5),
        d[1] * (0.7 + Math.random() * 0.3) + 0.15, // 上向き成分を足す
        d[2] + sign * spread * 0.4 * (Math.random() - 0.2),
      ]);
      growPurkinje(end, nd, len * (0.62 + Math.random() * 0.18), radius * 0.72, depth - 1);
    };
    branch(+1);
    branch(-1);
  }
  // 右室（右脚末端）から上方へ
  growPurkinje(rbbEnd, [0.25, 0.55, 0.25], 0.42, 0.02, 4);
  growPurkinje(rbbEnd, [0.4, 0.4, -0.1], 0.36, 0.018, 4);
  // 左室 前枝末端
  growPurkinje(lafEnd, [-0.25, 0.6, 0.2], 0.44, 0.02, 4);
  // 左室 後枝末端
  growPurkinje(lpfEnd, [-0.25, 0.6, -0.22], 0.44, 0.02, 4);
  // 中隔側にも少し
  growPurkinje([0.0, -1.55, 0.02], [0.05, 0.7, 0.1], 0.4, 0.018, 3);
  parts["purkinje"] = { meshes: purkinjeMeshes, range: ECG_TIMING.purkinje };

  // ---- 弁（4つ・クリック可能な小さなリング） ----
  const valveDefs = [
    { id: "valve_tricuspid", pos: [0.45, 0.3, 0.35], r: 0.16 },
    { id: "valve_mitral", pos: [-0.4, 0.3, 0.1], r: 0.16 },
    { id: "valve_pulmonary", pos: [0.35, 0.7, 0.35], r: 0.12 },
    { id: "valve_aortic", pos: [-0.05, 0.65, 0.15], r: 0.12 },
  ];
  valveDefs.forEach((v) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(v.r, 0.035, 10, 24), makeStandardMat(COLOR.valve, { transparent: true, opacity: 0.85 }));
    m.position.set(...v.pos);
    m.rotation.x = Math.PI / 2.2;
    m.userData.partId = v.id;
    m.renderOrder = 1;
    conduction.add(m);
  });

  // ======================================================================
  //  大血管（動脈＝赤／静脈＝青。色は「酸素の有無」で分ける教科書式）
  //  ※心臓の“上（base）”に生えている血管を模式的に色づけして表示。
  // ======================================================================
  function vesselTube(partId, points, r0, r1, colorHex) {
    const m = taperedTube(points, r0, r1, colorHex, 48, 10);
    m.userData.partId = partId;
    m.renderOrder = 1;
    layerVessel.add(m);
    return m;
  }
  // 大動脈（左室から上行→弓部を患者の左へ）＝赤
  vesselTube("aorta", [[0.02, 0.85, 0.0], [0.0, 1.4, -0.02], [-0.05, 1.75, -0.08], [-0.45, 1.78, -0.15], [-0.75, 1.55, -0.2]], 0.13, 0.1, COLOR.oxyRed);
  // 肺動脈幹（右室から前を通って患者の左後方へ）＝青（中身は静脈血）
  vesselTube("pa", [[-0.05, 0.9, 0.32], [-0.2, 1.35, 0.28], [-0.35, 1.62, 0.15], [-0.5, 1.7, -0.02]], 0.12, 0.09, COLOR.deoxyBlue);
  // 上大静脈（患者の右上→右房）＝青
  vesselTube("svc", [[0.5, 1.75, 0.0], [0.5, 1.35, 0.02], [0.48, 1.0, 0.05]], 0.1, 0.1, COLOR.deoxyBlue);
  // 下大静脈（患者の右下→右房）＝青
  vesselTube("ivc", [[0.5, 0.05, -0.05], [0.5, 0.35, 0.0], [0.48, 0.6, 0.05]], 0.1, 0.1, COLOR.deoxyBlue);
  // 肺静脈（患者の左後方→左房、代表として2本）＝赤（中身は動脈血）
  vesselTube("pv", [[-0.75, 1.05, -0.3], [-0.62, 0.9, -0.32], [-0.5, 0.8, -0.3]], 0.07, 0.07, COLOR.oxyRed);
  vesselTube("pv", [[-0.75, 0.7, -0.35], [-0.6, 0.68, -0.34], [-0.48, 0.72, -0.3]], 0.07, 0.07, COLOR.oxyRed);

  // ======================================================================
  //  冠動脈（心臓表面を走る動脈。梗塞部位と心電図変化の対応学習に重要）
  // ======================================================================
  function coronaryTube(partId, points, r0, r1) {
    const m = taperedTube(points, r0, r1, COLOR.coronary, 56, 8);
    m.userData.partId = partId;
    m.renderOrder = 1;
    layerCoronary.add(m);
    return m;
  }
  // 右冠動脈（大動脈起始→患者右の房室溝を下り、下壁へ回る）
  coronaryTube("rca", [[0.1, 0.78, 0.28], [0.4, 0.55, 0.34], [0.55, 0.2, 0.3], [0.52, -0.25, 0.2], [0.3, -0.6, 0.05]], 0.05, 0.03);
  // 左前下行枝（前面の前室間溝を心尖へ）
  coronaryTube("lad", [[-0.02, 0.8, 0.36], [-0.05, 0.35, 0.44], [-0.07, -0.2, 0.44], [-0.06, -0.75, 0.34], [-0.03, -1.15, 0.2]], 0.05, 0.025);
  // 左回旋枝（左房室溝を患者の左後方へ）
  coronaryTube("lcx", [[-0.1, 0.78, 0.28], [-0.38, 0.6, 0.16], [-0.56, 0.28, -0.05], [-0.55, -0.05, -0.2]], 0.045, 0.025);

  // ======================================================================
  //  ラベル（クリックで解説）。レイヤーごとに登録して一括で出し入れできる。
  // ======================================================================
  // 刺激伝導系
  addLabel("洞結節", "sa_node", NODES.sa, [0.2, 0.18, 0], conduction, "conduction");
  addLabel("房室結節", "av_node", NODES.av, [0.4, 0.02, 0], conduction, "conduction");
  addLabel("His束", "his_bundle", [0.0, -0.15, 0.12], [0.32, 0, 0], conduction, "conduction");
  addLabel("左脚", "bundle_branch_l", [-0.16, -0.52, 0], [-0.28, 0.06, 0], conduction, "conduction");
  addLabel("左脚前枝", "lantfasc", [-0.5, -1.28, 0.12], [-0.28, 0.06, 0], conduction, "conduction");
  addLabel("左脚後枝", "lpostfasc", [-0.47, -1.36, -0.16], [-0.28, -0.16, 0], conduction, "conduction");
  addLabel("右脚", "bundle_branch_r", [0.34, -1.1, 0.06], [0.3, 0, 0], conduction, "conduction");
  addLabel("プルキンエ線維", "purkinje", [0.0, -1.7, 0], [0, -0.22, 0], conduction, "conduction");

  // 部屋名（心房・心室）
  addLabel("右心房", "ra", [0.55, 0.62, 0.25], [0.05, 0.12, 0], layerChamber, "chamber");
  addLabel("左心房", "la", [-0.55, 0.72, -0.1], [-0.1, 0.12, 0], layerChamber, "chamber");
  addLabel("右心室", "rv", [0.4, -0.6, 0.3], [0.18, -0.1, 0], layerChamber, "chamber");
  addLabel("左心室", "lv", [-0.5, -0.7, 0.05], [-0.2, -0.1, 0], layerChamber, "chamber");

  // 大血管
  addLabel("大動脈", "aorta", [-0.55, 1.78, -0.15], [0, 0.14, 0], layerVessel, "vessel");
  addLabel("肺動脈", "pa", [-0.45, 1.7, -0.02], [-0.16, 0.12, 0], layerVessel, "vessel");
  addLabel("上大静脈", "svc", [0.5, 1.7, 0.0], [0.22, 0.08, 0], layerVessel, "vessel");
  addLabel("下大静脈", "ivc", [0.5, 0.1, -0.05], [0.22, -0.08, 0], layerVessel, "vessel");
  addLabel("肺静脈", "pv", [-0.72, 0.88, -0.32], [-0.18, 0, 0], layerVessel, "vessel");

  // 冠動脈
  addLabel("右冠動脈", "rca", [0.55, 0.2, 0.3], [0.24, 0.04, 0], layerCoronary, "coronary");
  addLabel("左前下行枝", "lad", [-0.06, -0.4, 0.44], [-0.26, 0, 0], layerCoronary, "coronary");
  addLabel("左回旋枝", "lcx", [-0.56, 0.28, -0.05], [-0.26, 0.06, 0], layerCoronary, "coronary");

  // ---- クリック／タップ判定（3Dメッシュ側） ----
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  function handlePick(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(heartGroup.children, true);
    for (const h of hits) {
      const id = h.object.userData.partId;
      if (id) {
        if (callbacks.onPartClick) callbacks.onPartClick(id);
        return;
      }
    }
  }
  let downXY = null;
  renderer.domElement.addEventListener("pointerdown", (e) => { downXY = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (!downXY) return;
    const moved = Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]);
    if (moved < 6) handlePick(e.clientX, e.clientY); // ドラッグ回転と区別
    downXY = null;
  });

  // ---- サイズ調整 ----
  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    labelRenderer.setSize(w, h);
  }
  window.addEventListener("resize", resize);
  resize();
  refreshLabels(); // 初期のラベル表示状態を反映

  // ---- 障害部位のハイライト（疾患ごとに「どこが傷んでいるか」を赤く示す） ----
  let damagedIds = [];
  function setDamage(ids) {
    damagedIds = Array.isArray(ids) ? ids : ids ? [ids] : [];
  }

  // ---- 発光の対象 ----
  const repolTargets = ["bundle_branch_l", "bundle_branch_r", "lantfasc", "lpostfasc", "purkinje"]; // 心室側（T波で青く）

  function setEmissive(mesh, hex, intensity) {
    if (!mesh.material || !mesh.material.emissive) return;
    mesh.material.emissive.setHex(hex);
    mesh.material.emissiveIntensity = intensity;
  }

  function update(t) {
    // すべてリセット（金色に戻す）
    Object.values(parts).forEach((p) => {
      (p.meshes || []).forEach((m) => setEmissive(m, 0x000000, 0));
      (p.lines || []).forEach((l) => l.material.color.setHex(COLOR.conduction));
    });

    // 脱分極：各フェーズで順番にオレンジに光る
    Object.entries(parts).forEach(([id, p]) => {
      if (!p.range) return;
      const w = phaseWeight(t, p.range);
      if (w > 0) {
        (p.meshes || []).forEach((m) => setEmissive(m, COLOR.depolarize, w * 1.0));
        (p.lines || []).forEach((l) => l.material.color.setHex(COLOR.depolarize));
      }
    });

    // 再分極（T波）：心室側を青く
    const rw = phaseWeight(t, ECG_TIMING.repolarization);
    if (rw > 0) {
      repolTargets.forEach((id) => {
        const p = parts[id];
        if (!p) return;
        (p.meshes || []).forEach((m) => setEmissive(m, COLOR.repolarize, rw * 0.7));
        (p.lines || []).forEach((l) => l.material.color.setHex(COLOR.repolarize));
      });
    }

    // 障害部位：常に赤く（点滅させて目立たせる）
    if (damagedIds.length) {
      const blink = 0.5 + 0.5 * Math.sin(performance.now() / 250);
      damagedIds.forEach((id) => {
        const p = parts[id];
        if (!p) return;
        (p.meshes || []).forEach((m) => setEmissive(m, COLOR.damage, 0.6 + blink * 0.6));
        (p.lines || []).forEach((l) => l.material.color.setHex(COLOR.damage));
      });
    }

    controls.update();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  }

  return {
    update,
    resize,
    setDamage,
    // 文字ラベル全体の出し入れ（心臓の絵を見たいときにOFFにできる）
    setLabelsVisible(v) { labelsOn = !!v; refreshLabels(); },
    // レイヤー（conduction / vessel / coronary / chamber）ごとの出し入れ
    setLayerVisible(name, v) {
      if (layers[name]) layers[name].visible = !!v;
      refreshLabels();
    },
    isLayerVisible(name) { return layers[name] ? layers[name].visible : false; },
    flashPart(partId, ms = 1200) {
      const p = parts[partId];
      if (!p) return;
      (p.meshes || []).forEach((m) => setEmissive(m, COLOR.depolarize, 1));
      setTimeout(() => (p.meshes || []).forEach((m) => setEmissive(m, 0x000000, 0)), ms);
    },
  };
}

export { create };
