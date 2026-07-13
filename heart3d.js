/* ============================================================
   heart3d.js
   3D心臓モデルと刺激伝導系の描画（Three.js使用）。

   ★注意（正直な補足）★
   ここで作っているのは「解剖学的に完全に正確な3Dスキャンモデル」ではなく、
   楕円体などの基本図形を使って心臓の4部屋・弁・刺激伝導系の
   「位置関係」と「動くタイミング」を正しく再現した、学習用の簡略化モデルです。
   より写実的な見た目にしたい場合は、後から本物の心臓3Dモデル（GLTFファイルなど）を
   読み込む形に差し替えることもできます（その場合は要相談）。
   ============================================================ */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { ECG_TIMING, phaseWeight } from "./ecg-model.js";

// 色の定義（脱分極＝オレンジ系、再分極＝青系、通常時＝落ち着いた組織色）
const COLOR = {
  atriumBase: 0xcf8f7a,
  ventricleBase: 0xb5544a,
  nodeBase: 0x555555,
  valveBase: 0xd9c98a,
  depolarize: 0xffb020,
  repolarize: 0x4fa3ff,
};

function makePart(geometry, colorHex, opts = {}) {
  const mat = new THREE.MeshStandardMaterial({
    color: colorHex,
    emissive: 0x000000,
    emissiveIntensity: 0,
    roughness: 0.55,
    metalness: 0.05,
    transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1,
  });
  const mesh = new THREE.Mesh(geometry, mat);
  return mesh;
}

function tubeBetween(points, radius, colorHex) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const geo = new THREE.TubeGeometry(curve, 32, radius, 8, false);
  return makePart(geo, colorHex);
}

/*
  create(container, callbacks) を呼ぶとシーンが作られ、コントロールAPIを返す。
  callbacks.onPartClick(partId) : パーツをクリック/タップしたときに呼ばれる
*/
function create(container, callbacks = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf3f1ec);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 0.6, 6.5);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 3;
  controls.maxDistance = 12;

  // ライト
  scene.add(new THREE.AmbientLight(0xffffff, 0.65));
  const key = new THREE.DirectionalLight(0xffffff, 0.9);
  key.position.set(4, 6, 5);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.35);
  fill.position.set(-5, -2, -3);
  scene.add(fill);

  const heartGroup = new THREE.Group();
  scene.add(heartGroup);

  // ---- 4部屋（右心房・右心室・左心房・左心室） ----
  const RA = makePart(new THREE.SphereGeometry(0.62, 32, 24), COLOR.atriumBase);
  RA.scale.set(1, 0.85, 0.8);
  RA.position.set(1.05, 0.95, 0.25);
  RA.userData.partId = "atria";

  const LA = makePart(new THREE.SphereGeometry(0.58, 32, 24), COLOR.atriumBase);
  LA.scale.set(1, 0.85, 0.8);
  LA.position.set(-0.95, 0.95, -0.35);
  LA.userData.partId = "atria";

  const RV = makePart(new THREE.SphereGeometry(0.85, 32, 24), COLOR.ventricleBase);
  RV.scale.set(1, 1.15, 0.9);
  RV.position.set(0.85, -0.55, 0.35);
  RV.rotation.z = -0.15;
  RV.userData.partId = "purkinje";

  const LV = makePart(new THREE.SphereGeometry(0.95, 32, 24), COLOR.ventricleBase);
  LV.scale.set(1, 1.35, 1);
  LV.position.set(-0.55, -0.85, -0.05);
  LV.rotation.z = 0.12;
  LV.userData.partId = "purkinje";

  const apexCone = makePart(new THREE.ConeGeometry(0.55, 0.9, 24), COLOR.ventricleBase);
  apexCone.position.set(-0.6, -1.75, -0.05);
  apexCone.rotation.x = Math.PI;
  apexCone.userData.partId = "purkinje";

  [RA, LA, RV, LV, apexCone].forEach((m) => heartGroup.add(m));

  // ---- 弁（4つ） ----
  const valveGeo = () => new THREE.TorusGeometry(0.28, 0.07, 12, 24);
  const tricuspid = makePart(valveGeo(), COLOR.valveBase);
  tricuspid.position.set(1.0, 0.2, 0.4);
  tricuspid.rotation.x = Math.PI / 2.3;
  tricuspid.userData.partId = "valve_tricuspid";

  const mitral = makePart(valveGeo(), COLOR.valveBase);
  mitral.position.set(-0.8, 0.2, -0.25);
  mitral.rotation.x = Math.PI / 2.3;
  mitral.userData.partId = "valve_mitral";

  const pulmonary = makePart(new THREE.TorusGeometry(0.2, 0.06, 12, 24), COLOR.valveBase);
  pulmonary.position.set(1.15, 1.35, 0.5);
  pulmonary.rotation.x = Math.PI / 2;
  pulmonary.userData.partId = "valve_pulmonary";

  const aortic = makePart(new THREE.TorusGeometry(0.2, 0.06, 12, 24), COLOR.valveBase);
  aortic.position.set(-0.1, 1.45, -0.05);
  aortic.rotation.x = Math.PI / 2;
  aortic.userData.partId = "valve_aortic";

  [tricuspid, mitral, pulmonary, aortic].forEach((m) => heartGroup.add(m));

  // ---- 大血管（見た目のアクセント。クリック対象ではない） ----
  const vesselMat = new THREE.MeshStandardMaterial({ color: 0xcdb9a8, roughness: 0.6 });
  const pa = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.1, 16), vesselMat);
  pa.position.set(1.25, 2.0, 0.5);
  pa.rotation.z = 0.25;
  const ao = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.2, 16), vesselMat);
  ao.position.set(-0.15, 2.05, -0.05);
  [pa, ao].forEach((m) => heartGroup.add(m));

  // ---- 刺激伝導系 ----
  const nodeMat = () => COLOR.nodeBase;

  const saNode = makePart(new THREE.SphereGeometry(0.11, 16, 16), nodeMat());
  saNode.position.set(1.35, 1.35, 0.45);
  saNode.userData.partId = "sa_node";

  const avNode = makePart(new THREE.SphereGeometry(0.1, 16, 16), nodeMat());
  avNode.position.set(0.2, 0.05, 0.15);
  avNode.userData.partId = "av_node";

  const internodal = tubeBetween(
    [
      [1.35, 1.35, 0.45],
      [1.15, 0.95, 0.4],
      [0.6, 0.45, 0.25],
      [0.2, 0.05, 0.15],
    ],
    0.035,
    nodeMat()
  );
  internodal.userData.partId = "sa_node";

  const hisBundle = tubeBetween(
    [
      [0.2, 0.05, 0.15],
      [0.1, -0.25, 0.1],
      [0.02, -0.45, 0.05],
    ],
    0.045,
    nodeMat()
  );
  hisBundle.userData.partId = "his_bundle";

  const leftBranch = tubeBetween(
    [
      [0.02, -0.45, 0.05],
      [-0.25, -0.75, -0.02],
      [-0.55, -1.3, -0.05],
      [-0.6, -1.85, -0.05],
    ],
    0.03,
    nodeMat()
  );
  leftBranch.userData.partId = "bundle_branch_l";

  const rightBranch = tubeBetween(
    [
      [0.02, -0.45, 0.05],
      [0.4, -0.7, 0.15],
      [0.75, -1.15, 0.3],
      [0.9, -1.35, 0.35],
    ],
    0.03,
    nodeMat()
  );
  rightBranch.userData.partId = "bundle_branch_r";

  [saNode, avNode, internodal, hisBundle, leftBranch, rightBranch].forEach((m) => heartGroup.add(m));

  // プルキンエ線維：左右の心尖部から放射状に広がる細い線（見た目のアクセント＋クリック対象）
  const purkinjeGroup = new THREE.Group();
  const purkinjeMat = new THREE.LineBasicMaterial({ color: nodeMat() });
  function addPurkinjeFan(origin, spread, count) {
    for (let i = 0; i < count; i++) {
      const ang = (i / (count - 1) - 0.5) * spread;
      const end = [
        origin[0] + Math.sin(ang) * 0.55,
        origin[1] - 0.5 - Math.random() * 0.15,
        origin[2] + Math.cos(ang) * 0.25 * (i % 2 === 0 ? 1 : -1),
      ];
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(...origin),
        new THREE.Vector3(...end),
      ]);
      const line = new THREE.Line(geo, purkinjeMat);
      line.userData.partId = "purkinje";
      purkinjeGroup.add(line);
    }
  }
  addPurkinjeFan([-0.6, -1.85, -0.05], 1.8, 7);
  addPurkinjeFan([0.9, -1.35, 0.35], 1.6, 6);
  heartGroup.add(purkinjeGroup);

  // ---- クリック／タップ判定 ----
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  function handlePick(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(heartGroup.children, true);
    if (hits.length && callbacks.onPartClick) {
      // 一番手前でpartIdを持っているものを探す
      for (const h of hits) {
        const id = h.object.userData.partId;
        if (id) {
          callbacks.onPartClick(id);
          return;
        }
      }
    }
  }
  renderer.domElement.addEventListener("pointerdown", (e) => {
    handlePick(e.clientX, e.clientY);
  });

  // ---- サイズ調整 ----
  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener("resize", resize);
  resize();

  // ---- アニメーション更新（心周期内の位相 t 秒を受け取って発光を変える） ----
  const glowTargets = [
    { mesh: saNode, range: ECG_TIMING.saFire, mode: "depolarize" },
    { mesh: internodal, range: ECG_TIMING.atriaConduct, mode: "depolarize" },
    { mesh: RA, range: ECG_TIMING.atriaConduct, mode: "depolarize" },
    { mesh: LA, range: ECG_TIMING.atriaConduct, mode: "depolarize" },
    { mesh: avNode, range: ECG_TIMING.avNodeDelay, mode: "depolarize" },
    { mesh: hisBundle, range: ECG_TIMING.hisBundle, mode: "depolarize" },
    { mesh: leftBranch, range: ECG_TIMING.bundleBranches, mode: "depolarize" },
    { mesh: rightBranch, range: ECG_TIMING.bundleBranches, mode: "depolarize" },
    { mesh: RV, range: ECG_TIMING.purkinje, mode: "depolarize" },
    { mesh: LV, range: ECG_TIMING.purkinje, mode: "depolarize" },
    { mesh: apexCone, range: ECG_TIMING.purkinje, mode: "depolarize" },
  ];
  const repolTargets = [RV, LV, apexCone];

  function setEmissive(mesh, hex, intensity) {
    if (!mesh.material) return;
    mesh.material.emissive.setHex(hex);
    mesh.material.emissiveIntensity = intensity;
  }

  function update(t) {
    // 一旦すべてリセット
    glowTargets.forEach(({ mesh }) => setEmissive(mesh, 0x000000, 0));
    purkinjeGroup.children.forEach((line) => {
      const w = phaseWeight(t, ECG_TIMING.purkinje);
      line.material.color.setHex(w > 0 ? COLOR.depolarize : COLOR.nodeBase);
    });

    glowTargets.forEach(({ mesh, range }) => {
      const w = phaseWeight(t, range);
      if (w > 0) setEmissive(mesh, COLOR.depolarize, w * 0.9);
    });

    // 再分極（T波）：心室を青く光らせる
    const rw = phaseWeight(t, ECG_TIMING.repolarization);
    if (rw > 0) {
      repolTargets.forEach((mesh) => setEmissive(mesh, COLOR.repolarize, rw * 0.7));
    }

    controls.update();
    renderer.render(scene, camera);
  }

  return {
    update,
    resize,
    // 特定パーツを外部からハイライトしたい時に使う（用語集の「3Dモデルで見る」など）
    flashPart(partId, ms = 1200) {
      const targets = heartGroup.children.filter((c) => c.userData.partId === partId);
      targets.forEach((m) => setEmissive(m, COLOR.depolarize, 1));
      setTimeout(() => {
        targets.forEach((m) => setEmissive(m, 0x000000, 0));
      }, ms);
    },
  };
}

export { create };
