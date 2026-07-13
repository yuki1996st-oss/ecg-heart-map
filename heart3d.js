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

  // ---- 刺激伝導系（自作の作り込み） ----
  const conduction = new THREE.Group();
  // 教科書の前面像の慣例に合わせて左右反転（洞結節＝右房を画面の左側に）
  conduction.scale.x = -1;
  heartGroup.add(conduction);

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

  function nodeSphere(partId, pos, radius, range) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 20, 20), makeStandardMat(COLOR.conduction));
    m.position.set(...pos);
    m.renderOrder = 1;
    return registerMesh(partId, m, range);
  }

  function nodeTube(partId, points, radius, range) {
    const m = tubeBetween(points, radius, COLOR.conduction);
    m.renderOrder = 1;
    return registerMesh(partId, m, range);
  }

  // 洞結節
  nodeSphere("sa_node", NODES.sa, 0.11, ECG_TIMING.saFire);
  // 心房内の伝導（洞結節→房室結節）と心房のふくらみを模式的に表現
  nodeTube("atria", [NODES.sa, [0.35, 0.75, 0.4], [0.12, 0.4, 0.32], NODES.av], 0.04, ECG_TIMING.atriaConduct);
  nodeTube("atria", [NODES.sa, [0.9, 0.85, 0.2], [0.7, 0.5, 0.0], [0.2, 0.35, 0.15]], 0.03, ECG_TIMING.atriaConduct);
  nodeTube("atria", [NODES.sa, [-0.2, 0.95, 0.35], [-0.5, 0.7, 0.15], [-0.2, 0.45, 0.2]], 0.03, ECG_TIMING.atriaConduct);
  // 房室結節
  nodeSphere("av_node", NODES.av, 0.1, ECG_TIMING.avNodeDelay);
  // His束
  nodeTube("his_bundle", [NODES.av, NODES.his, NODES.hisEnd], 0.05, ECG_TIMING.hisBundle);
  // 左脚
  nodeTube("bundle_branch_l", [NODES.hisEnd, [-0.3, -0.7, 0.05], [-0.5, -1.2, -0.02], [-0.45, -1.55, -0.05]], 0.035, ECG_TIMING.bundleBranches);
  // 右脚
  nodeTube("bundle_branch_r", [NODES.hisEnd, [0.28, -0.7, 0.12], [0.45, -1.1, 0.08], [0.4, -1.4, 0.05]], 0.035, ECG_TIMING.bundleBranches);

  // プルキンエ線維（左右の心尖から放射状に広がる線）
  const purkinjeMat = new THREE.LineBasicMaterial({ color: COLOR.conduction });
  const purkinjeLines = [];
  function addPurkinjeFan(origin, spread, count) {
    for (let i = 0; i < count; i++) {
      const ang = (i / (count - 1) - 0.5) * spread;
      const end = [
        origin[0] + Math.sin(ang) * 0.5,
        origin[1] - 0.35 - Math.random() * 0.15,
        origin[2] + Math.cos(ang) * 0.2 * (i % 2 === 0 ? 1 : -1),
      ];
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(...origin),
        new THREE.Vector3(...end),
      ]);
      const line = new THREE.Line(geo, purkinjeMat);
      line.userData.partId = "purkinje";
      line.renderOrder = 1;
      conduction.add(line);
      purkinjeLines.push(line);
    }
  }
  addPurkinjeFan([-0.45, -1.55, -0.05], 1.8, 8);
  addPurkinjeFan([0.4, -1.4, 0.05], 1.6, 7);
  parts["purkinje"] = { meshes: [], range: ECG_TIMING.purkinje, lines: purkinjeLines };

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

  // ---- 日本語ラベル（クリックで解説） ----
  const LABELS = [
    { partId: "sa_node", text: "洞結節", pos: NODES.sa, off: [0.15, 0.15, 0] },
    { partId: "av_node", text: "房室結節", pos: NODES.av, off: [0.35, 0.05, 0] },
    { partId: "his_bundle", text: "His束", pos: [0.0, -0.15, 0.15], off: [0.3, 0, 0] },
    { partId: "bundle_branch_l", text: "左脚", pos: [-0.45, -1.1, 0], off: [-0.35, 0, 0] },
    { partId: "bundle_branch_r", text: "右脚", pos: [0.42, -1.0, 0.08], off: [0.3, 0, 0] },
    { partId: "purkinje", text: "プルキンエ線維", pos: [-0.2, -1.75, 0], off: [0, -0.2, 0] },
    { partId: "atria", text: "心房", pos: [0.15, 0.95, 0.3], off: [0, 0.2, 0] },
  ];
  LABELS.forEach((L) => {
    const div = document.createElement("div");
    div.className = "cLabel";
    div.textContent = L.text;
    div.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      if (callbacks.onPartClick) callbacks.onPartClick(L.partId);
    });
    const obj = new CSS2DObject(div);
    obj.position.set(L.pos[0] + L.off[0], L.pos[1] + L.off[1], L.pos[2] + L.off[2]);
    conduction.add(obj);
  });

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

  // ---- 障害部位のハイライト（疾患ごとに「どこが傷んでいるか」を赤く示す） ----
  let damagedIds = [];
  function setDamage(ids) {
    damagedIds = Array.isArray(ids) ? ids : ids ? [ids] : [];
  }

  // ---- 発光の対象 ----
  const repolTargets = ["bundle_branch_l", "bundle_branch_r", "purkinje"]; // 心室側（T波で青く）

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
    flashPart(partId, ms = 1200) {
      const p = parts[partId];
      if (!p) return;
      (p.meshes || []).forEach((m) => setEmissive(m, COLOR.depolarize, 1));
      setTimeout(() => (p.meshes || []).forEach((m) => setEmissive(m, 0x000000, 0)), ms);
    },
  };
}

export { create };
