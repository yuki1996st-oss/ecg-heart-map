/* ============================================================
   app.js（嚥下評価アプリ）
   画面の組み立て・自動判定・保存を担当するファイルです。

   ★文章や評価項目の中身を直したいときは、このファイルではなく
     data.js を編集してください★
   ============================================================ */

import {
  DISCLAIMER, CONSCIOUSNESS, NUTRITION_ROUTE, POSTURE, SAFETY_CHECKS,
  EAT10_ITEMS, EAT10_CHOICES, EAT10_NOTE, SEIREI_ITEMS, SEIREI_NOTE,
  RSST_NOTE, MWST_NOTE, MWST_CHOICES, FT_NOTE, FT_CHOICES,
  WST30_NOTE, WST30_CHOICES, AUSCULTATION_ITEMS, SIGN_ITEMS, COUGH_TEST_CHOICES,
  OHAT_ITEMS, OHAT_NOTE, ODK_NOTE,
  DSS_CHOICES, GRADE_CHOICES, FILS_CHOICES, FOIS_CHOICES,
  DIET_CODES, THICKNESS_CHOICES, COMPENSATION_ITEMS, TRAINING_ITEMS,
  REFERENCE_SECTIONS, HELP_SECTIONS,
} from "./data.js";

const STORAGE_KEY = "dysphagia_records_v1";
const $ = (id) => document.getElementById(id);

/* ============================================================
   1. 画面の切り替え（メニュー）
   ============================================================ */
$("menuBtn").addEventListener("click", () => {
  $("navDrawer").classList.remove("hidden");
  $("navOverlay").classList.remove("hidden");
});
$("navOverlay").addEventListener("click", closeMenu);
function closeMenu() {
  $("navDrawer").classList.add("hidden");
  $("navOverlay").classList.add("hidden");
}
document.querySelectorAll(".navItem").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".view").forEach((v) => {
      v.classList.toggle("hidden", v.id !== btn.dataset.view);
    });
    if (btn.dataset.view === "listView") renderRecordList();
    closeMenu();
    window.scrollTo(0, 0);
  });
});

/* ============================================================
   2. 部品を作る小さな関数たち
   ============================================================ */
function esc(text) {
  return String(text == null ? "" : text).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

/* セレクトボックスに選択肢を入れる */
function fillSelect(field, options, placeholder = "選択") {
  const el = document.querySelector(`[data-field="${field}"]`);
  el.innerHTML =
    `<option value="">${placeholder}</option>` +
    options.map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join("");
}

/* チェックボックスの並び */
function renderCheckList(containerId, items) {
  $(containerId).innerHTML = items.map((it) => `
    <label class="checkItem">
      <input type="checkbox" data-field="${esc(it.id)}">
      <span>${esc(it.label)}</span>
    </label>`).join("");
}

/* ラジオボタンの並び（1つ選ぶ） */
function renderRadioList(containerId, field, choices, extraClass = "") {
  $(containerId).innerHTML =
    choices.map((c) => `
      <label class="radioItem ${extraClass}">
        <input type="radio" name="${esc(field)}" data-field="${esc(field)}" value="${esc(c.value)}">
        <span>${esc(c.label)}${c.detail ? `<small>${esc(c.detail)}</small>` : ""}</span>
      </label>`).join("") +
    `<button type="button" class="linkBtn" data-clear="${esc(field)}">選択を取り消す</button>`;
  $(containerId).querySelector("[data-clear]").addEventListener("click", () => {
    document.querySelectorAll(`input[name="${field}"]`).forEach((r) => (r.checked = false));
    update();
  });
}

/* 質問1行ごとに点数ボタンが並ぶ形（EAT-10・聖隷式・OHAT用） */
function renderScaleList(containerId, fieldPrefix, items, choicesFor) {
  $(containerId).innerHTML = items.map((item, i) => {
    const field = `${fieldPrefix}_${i + 1}`;
    const q = typeof item === "string" ? item : item.q || item.name;
    const choices = choicesFor(item);
    return `
      <div class="scaleItem">
        <div class="scaleQ"><span class="scaleNo">${i + 1}</span>${esc(q)}</div>
        <div class="scaleChoices">
          ${choices.map((c) => `
            <label class="chip" title="${esc(c.title || c.label)}">
              <input type="radio" name="${field}" data-field="${field}" value="${esc(c.value)}">
              <span>${esc(c.label)}</span>
            </label>`).join("")}
        </div>
      </div>`;
  }).join("");
}

/* ============================================================
   3. 画面の中身を組み立てる
   ============================================================ */
$("disclaimer").textContent = DISCLAIMER;
$("eat10Note").textContent = EAT10_NOTE;
$("seireiNote").textContent = SEIREI_NOTE;
$("ohatNote").textContent = OHAT_NOTE;
$("odkNote").textContent = ODK_NOTE;
$("rsstNote").textContent = RSST_NOTE;
$("mwstNote").textContent = MWST_NOTE;
$("ftNote").textContent = FT_NOTE;
$("wst30Note").textContent = WST30_NOTE;

fillSelect("consciousness", CONSCIOUSNESS);
fillSelect("nutritionRoute", NUTRITION_ROUTE);
fillSelect("posture", POSTURE);

renderCheckList("safetyChecks", SAFETY_CHECKS);
renderCheckList("auscItems", AUSCULTATION_ITEMS);
renderCheckList("signItems", SIGN_ITEMS);
renderCheckList("compItems", COMPENSATION_ITEMS);
renderCheckList("trainItems", TRAINING_ITEMS);

renderScaleList("eat10Items", "eat10", EAT10_ITEMS, () => EAT10_CHOICES);
renderScaleList("seireiItems", "seirei", SEIREI_ITEMS, (item) => [
  { value: "A", label: `A ${item.a}` },
  { value: "B", label: `B ${item.b}` },
  { value: "C", label: `C ${item.c}` },
]);
renderScaleList("ohatItems", "ohat", OHAT_ITEMS, (item) => [
  { value: 0, label: "0 健全", title: item.c0 },
  { value: 1, label: "1 やや不良", title: item.c1 },
  { value: 2, label: "2 病的", title: item.c2 },
]);

renderRadioList("mwstChoices", "mwst", MWST_CHOICES);
renderRadioList("ftChoices", "ft", FT_CHOICES);
renderRadioList("wst30Choices", "wst30", WST30_CHOICES);
renderRadioList("coughChoices", "coughTest", COUGH_TEST_CHOICES);
renderRadioList("dssChoices", "dss", DSS_CHOICES);
renderRadioList("gradeChoices", "grade", GRADE_CHOICES, "compactItem");
renderRadioList("filsChoices", "fils", FILS_CHOICES, "compactItem");
renderRadioList("foisChoices", "fois", FOIS_CHOICES, "compactItem");
renderRadioList("dietChoices", "dietCode", DIET_CODES);
renderRadioList("thickChoices", "thickness", THICKNESS_CHOICES);

/* 早見表・ヘルプ */
$("refContent").innerHTML = REFERENCE_SECTIONS.map((sec) => `
  <details class="card" open>
    <summary>${esc(sec.title)}</summary>
    <div class="cardBody">
      <table class="refTable">
        <tbody>
          ${sec.rows.map((r) => `<tr><th>${esc(r[0])}</th><td>${esc(r[1])}</td></tr>`).join("")}
        </tbody>
      </table>
    </div>
  </details>`).join("");

$("helpContent").innerHTML = HELP_SECTIONS.map((sec) => `
  <details class="card" open>
    <summary>${esc(sec.title)}</summary>
    <div class="cardBody"><p class="helpBody">${esc(sec.body)}</p></div>
  </details>`).join("") +
  `<p class="note">${esc(DISCLAIMER)}</p>`;

/* 評価日の初期値は今日 */
document.querySelector('[data-field="date"]').value = todayString();
function todayString() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* ============================================================
   4. 入力内容の読み書き
   ============================================================ */
function collect() {
  const rec = {};
  document.querySelectorAll("#assessView [data-field]").forEach((el) => {
    const f = el.dataset.field;
    if (el.type === "checkbox") rec[f] = el.checked;
    else if (el.type === "radio") { if (el.checked) rec[f] = el.value; }
    else if (el.value !== "") rec[f] = el.value;
  });
  return rec;
}

function apply(rec) {
  document.querySelectorAll("#assessView [data-field]").forEach((el) => {
    const v = rec[el.dataset.field];
    if (el.type === "checkbox") el.checked = v === true;
    else if (el.type === "radio") el.checked = v != null && String(v) === el.value;
    else el.value = v == null ? "" : v;
  });
  update();
}

function clearForm(keepPatient = false) {
  const id = document.querySelector('[data-field="patientId"]').value;
  const assessor = document.querySelector('[data-field="assessor"]').value;
  apply({});
  document.querySelector('[data-field="date"]').value = todayString();
  if (keepPatient) {
    document.querySelector('[data-field="patientId"]').value = id;
    document.querySelector('[data-field="assessor"]').value = assessor;
  }
  editingId = null;
  update();
}

/* 数値として取り出す（未入力なら null） */
const num = (rec, f) => (rec[f] == null || rec[f] === "" ? null : Number(rec[f]));

/* ============================================================
   5. 自動判定
   ============================================================ */
function compute(rec) {
  const s = { findings: [], flags: [] };

  /* --- BMI --- */
  const h = num(rec, "height"), w = num(rec, "weight");
  if (h && w) {
    s.bmi = w / ((h / 100) * (h / 100));
    if (s.bmi < 18.5) s.flags.push({ level: "mid", text: `低体重（BMI ${s.bmi.toFixed(1)}）。低栄養・サルコペニアが嚥下機能に影響している可能性があります。` });
  }

  /* --- 安全チェック --- */
  const safetyDone = SAFETY_CHECKS.filter((c) => rec[c.id] === true).length;
  s.safetyDone = safetyDone;
  s.safetyTotal = SAFETY_CHECKS.length;
  s.safetyMissing = SAFETY_CHECKS.filter((c) => rec[c.id] !== true).map((c) => c.label);

  /* --- EAT-10 --- */
  const eat = EAT10_ITEMS.map((_, i) => num(rec, `eat10_${i + 1}`)).filter((v) => v != null);
  if (eat.length) {
    s.eat10 = eat.reduce((a, b) => a + b, 0);
    s.eat10Answered = eat.length;
    if (eat.length === EAT10_ITEMS.length && s.eat10 >= 3) {
      s.flags.push({ level: "mid", text: `EAT-10 が ${s.eat10}点（3点以上）。嚥下の効率や安全性に問題がある可能性があります。` });
    }
  }

  /* --- 聖隷式 --- */
  const seirei = SEIREI_ITEMS.map((_, i) => rec[`seirei_${i + 1}`]).filter(Boolean);
  if (seirei.length) {
    s.seireiA = seirei.filter((v) => v === "A").length;
    s.seireiB = seirei.filter((v) => v === "B").length;
    s.seireiAnswered = seirei.length;
    if (s.seireiA > 0) {
      s.seireiJudge = "嚥下障害の可能性が高い";
      s.flags.push({ level: "mid", text: `聖隷式嚥下質問紙で A が ${s.seireiA}項目。嚥下障害の可能性が高いと判断されます。` });
    } else if (s.seireiB > 0) {
      s.seireiJudge = "軽度の疑い";
    } else {
      s.seireiJudge = "問題なし";
    }
  }

  /* --- OHAT --- */
  const ohat = OHAT_ITEMS.map((_, i) => num(rec, `ohat_${i + 1}`));
  const ohatAnswered = ohat.filter((v) => v != null);
  if (ohatAnswered.length) {
    s.ohat = ohatAnswered.reduce((a, b) => a + b, 0);
    s.ohatAnswered = ohatAnswered.length;
    s.ohatBad = OHAT_ITEMS.filter((it, i) => ohat[i] === 2).map((it) => it.name);
    if (s.ohatBad.length) {
      s.flags.push({ level: "mid", text: `OHAT-J で「病的（2点）」の項目があります（${s.ohatBad.join("・")}）。口腔ケアの強化と歯科への相談を検討してください。` });
    } else if (s.ohat >= 5) {
      s.flags.push({ level: "low", text: `OHAT-J 合計 ${s.ohat}点。口腔環境の改善が誤嚥性肺炎の予防につながります。` });
    }
  }

  /* --- オーラルディアドコキネシス --- */
  const odk = ["Pa", "Ta", "Ka"].map((k) => {
    const v = num(rec, `odk${k}`);
    return v == null ? null : v / 5;
  });
  if (odk.some((v) => v != null)) {
    s.odk = odk;
    const low = ["パ", "タ", "カ"].filter((_, i) => odk[i] != null && odk[i] < 6);
    if (low.length) s.flags.push({ level: "low", text: `オーラルディアドコキネシスが目安（6回/秒）を下回っています（${low.join("・")}）。口腔・舌の運動機能低下が疑われます。` });
  }

  /* --- RSST --- */
  const rsst = num(rec, "rsst");
  if (rsst != null) {
    s.rsst = rsst;
    if (rsst < 3) s.flags.push({ level: "mid", text: `RSST ${rsst}回/30秒（3回未満）。嚥下反射の惹起性低下が疑われます。` });
  }

  /* --- MWST --- */
  const mwst = num(rec, "mwst");
  if (mwst != null) {
    s.mwst = mwst;
    if (mwst <= 2) s.flags.push({ level: "high", text: `改訂水飲みテスト ${mwst}点。誤嚥のリスクが高く、水分の経口摂取は慎重に判断してください。` });
    else if (mwst === 3) s.flags.push({ level: "mid", text: "改訂水飲みテスト 3点。水分にとろみを付けるなどの調整を検討してください。" });
  }

  /* --- FT --- */
  const ft = num(rec, "ft");
  if (ft != null) {
    s.ft = ft;
    if (ft <= 2) s.flags.push({ level: "high", text: `フードテスト ${ft}点。食物の誤嚥リスクが高い状態です。` });
    else if (ft === 3) s.flags.push({ level: "mid", text: "フードテスト 3点。口腔内残留・咽頭残留に注意が必要です。" });
  }

  /* --- 30mL水飲み --- */
  const wst = num(rec, "wst30");
  const wstTime = num(rec, "wst30Time");
  if (wst != null) {
    s.wst30 = wst;
    s.wst30Time = wstTime;
    if (wst >= 3) s.flags.push({ level: wst >= 4 ? "high" : "mid", text: `30mL水飲みテスト プロフィール${wst}。異常と判定されます。` });
    else if (wst === 2 || (wst === 1 && wstTime != null && wstTime > 5)) s.flags.push({ level: "mid", text: "30mL水飲みテストは「疑い」の範囲です。" });
  }

  /* --- SpO2 --- */
  const sRest = num(rec, "spo2Rest"), sMin = num(rec, "spo2Min");
  if (sRest != null && sMin != null) {
    s.spo2Drop = sRest - sMin;
    if (s.spo2Drop >= 3) s.flags.push({ level: "high", text: `テスト中に SpO2 が ${s.spo2Drop}% 低下しています。誤嚥を疑い、実施を中止して全身状態を確認してください。` });
  }

  /* --- 頸部聴診・症状 --- */
  if (rec.ausc_wet || rec.ausc_bubble) s.flags.push({ level: "high", text: "頸部聴診で湿性音・液体振動音を聴取。咽頭残留または誤嚥が疑われます。" });
  if (rec.ausc_long) s.flags.push({ level: "mid", text: "嚥下音の延長・減弱。喉頭挙上や送り込みの低下が疑われます。" });
  if (rec.ausc_stridor) s.flags.push({ level: "high", text: "喘鳴・気道狭窄音あり。速やかに医師へ報告してください。" });
  if (rec.sign_silent) s.flags.push({ level: "high", text: "むせがないのに湿性音あり。不顕性誤嚥が疑われます。" });
  if (rec.sign_wetvoice) s.flags.push({ level: "mid", text: "湿性嗄声あり。咽頭残留が疑われます（空嚥下・交互嚥下を試してください）。" });
  if (rec.coughTest === "abnormal") s.flags.push({ level: "mid", text: "咳テスト異常（1分間に4回以下）。咳反射の低下＝不顕性誤嚥のリスクがあります。" });

  /* --- 体温 --- */
  const temp = num(rec, "temperature");
  if (temp != null && temp >= 37.5) s.flags.push({ level: "mid", text: `体温 ${temp}℃。発熱時は誤嚥性肺炎の可能性を考え、経口摂取の可否を主治医と確認してください。` });

  /* --- 意識レベル --- */
  if (rec.consciousness && ["JCS30", "JCS100", "JCS200", "JCS300"].includes(rec.consciousness)) {
    s.flags.push({ level: "high", text: "覚醒が不十分です。この状態での経口摂取・スクリーニングは推奨されません。" });
  }

  /* --- 総合リスク --- */
  const tested = [rsst, mwst, ft, wst].some((v) => v != null);
  s.tested = tested;
  if (s.flags.some((f) => f.level === "high")) s.risk = "high";
  else if (s.flags.some((f) => f.level === "mid")) s.risk = "mid";
  else if (tested) s.risk = "low";
  else s.risk = null;

  /* --- 参考となる対応の目安 --- */
  s.advice = [];
  if (s.risk === "high") {
    s.advice.push("誤嚥のリスクが高い所見があります。経口摂取の開始・継続は主治医と相談し、VE（嚥下内視鏡）やVF（嚥下造影）による精査を検討してください。");
    s.advice.push("当面は口腔ケアと間接訓練を中心に、覚醒・姿勢・全身状態を整えることを優先します。");
  } else if (s.risk === "mid") {
    s.advice.push("嚥下障害が疑われます。食形態・とろみの調整と代償法を用いたうえで、経過を追って再評価してください。");
    s.advice.push("改善が乏しい場合や所見が変動する場合は、VE・VFでの精査を検討します。");
  } else if (s.risk === "low") {
    s.advice.push("スクリーニング上、明らかな異常所見は認めません。食事場面の観察を継続し、発熱・痰の増加など変化があれば再評価してください。");
  }
  if (mwst != null && ft != null) {
    if (mwst <= 2 || ft <= 2) s.advice.push("【食形態の目安】直接訓練の開始は慎重に判断し、行う場合もゼリー（コード0j）少量からの評価を推奨します。");
    else if (ft >= 4 && mwst >= 4 && (rsst == null || rsst >= 3)) s.advice.push("【食形態の目安】コード3〜4相当の嚥下調整食から開始し、水分のとろみは反応をみて調整できる可能性があります。");
    else if (ft >= 4 && mwst === 3) s.advice.push("【食形態の目安】食事はコード2-1〜3、水分は中間のとろみから開始するのが無難です。");
    else s.advice.push("【食形態の目安】コード0j〜1j（ゼリー・ムース状）と、濃いめのとろみ水から段階的に進めることを検討します。");
  }
  if (s.ohatBad && s.ohatBad.length) s.advice.push("口腔内に病的な所見があります。歯科・歯科衛生士への相談と、毎食後の口腔ケアを計画に入れてください。");
  if (s.safetyMissing.length) s.advice.push(`実施前チェックで未確認の項目があります（${s.safetyMissing.length}項目）。条件を整えてから実施・再評価してください。`);

  return s;
}

/* ============================================================
   6. 画面への反映
   ============================================================ */
function labelOf(choices, value) {
  if (value == null || value === "") return "";
  const hit = choices.find((c) => String(c.value) === String(value));
  return hit ? hit.label : String(value);
}

function update() {
  const rec = collect();
  const s = compute(rec);

  /* 各セクションの小さな判定表示 */
  $("bmiLine").textContent = s.bmi ? `BMI：${s.bmi.toFixed(1)}${s.bmi < 18.5 ? "（低体重）" : ""}` : "";

  $("safetyResult").textContent = `確認済み ${s.safetyDone}/${s.safetyTotal} 項目` +
    (s.safetyMissing.length ? ` ／ 未確認：${s.safetyMissing.length}項目` : " ／ 実施条件は整っています");
  $("safetyResult").className = "resultLine " + (s.safetyMissing.length ? "warn" : "ok");

  setResult("eat10Result", s.eat10 == null ? "" :
    `合計 ${s.eat10}点（${s.eat10Answered}/10項目 回答）` + (s.eat10Answered === 10 ? (s.eat10 >= 3 ? " → 問題の可能性あり" : " → 基準内") : " ※全項目回答で判定"),
    s.eat10Answered === 10 && s.eat10 >= 3 ? "warn" : "ok");

  setResult("seireiResult", s.seireiJudge == null ? "" :
    `A ${s.seireiA}項目 ／ B ${s.seireiB}項目（${s.seireiAnswered}/15項目 回答） → ${s.seireiJudge}`,
    s.seireiA > 0 ? "warn" : "ok");

  setResult("ohatResult", s.ohat == null ? "" :
    `合計 ${s.ohat}／16点（${s.ohatAnswered}/8項目 回答）` + (s.ohatBad.length ? ` ／ 病的：${s.ohatBad.join("・")}` : ""),
    s.ohatBad && s.ohatBad.length ? "warn" : "ok");

  setResult("odkResult", s.odk == null ? "" :
    ["パ", "タ", "カ"].map((k, i) => (s.odk[i] == null ? null : `${k} ${s.odk[i].toFixed(1)}回/秒`)).filter(Boolean).join(" ／ "),
    s.odk && s.odk.some((v) => v != null && v < 6) ? "warn" : "ok");

  setResult("rsstResult", s.rsst == null ? "" :
    `${s.rsst}回/30秒 → ${s.rsst < 3 ? "3回未満：嚥下障害の疑い" : "基準内"}`, s.rsst < 3 ? "warn" : "ok");

  setResult("mwstResult", s.mwst == null ? "" :
    `${s.mwst}点 → ${s.mwst <= 3 ? "嚥下障害の疑い" : "基準内"}`, s.mwst <= 3 ? "warn" : "ok");

  setResult("ftResult", s.ft == null ? "" :
    `${s.ft}点 → ${s.ft <= 3 ? "嚥下障害の疑い" : "基準内"}`, s.ft <= 3 ? "warn" : "ok");

  setResult("wst30Result", s.wst30 == null ? "" :
    `プロフィール${s.wst30}${s.wst30Time != null ? `・${s.wst30Time}秒` : ""} → ` +
    (s.wst30 >= 3 ? "異常" : s.wst30 === 2 || (s.wst30Time != null && s.wst30Time > 5) ? "疑い" : "正常範囲"),
    s.wst30 >= 2 ? "warn" : "ok");

  /* 総合バナー */
  const banner = $("riskBanner");
  const riskText = {
    high: "⚠️ 誤嚥リスクが高い所見があります（参考判定）",
    mid: "△ 嚥下障害が疑われる所見があります（参考判定）",
    low: "○ スクリーニング上、明らかな異常所見は認めません（参考判定）",
  };
  banner.textContent = s.risk ? riskText[s.risk] : "スクリーニングを入力すると、ここに目安が表示されます。";
  banner.className = "riskBanner " + (s.risk || "none");

  /* 所見リスト */
  const order = { high: 0, mid: 1, low: 2 };
  const sorted = [...s.flags].sort((a, b) => order[a.level] - order[b.level]);
  $("findingList").innerHTML =
    sorted.map((f) => `<li class="finding ${f.level}">${esc(f.text)}</li>`).join("") +
    s.advice.map((a) => `<li class="finding advice">${esc(a)}</li>`).join("");

  /* 選択済みの見た目を付ける（:has() が使えない古いブラウザ向けの保険） */
  document.querySelectorAll("#assessView .chip, #assessView .radioItem").forEach((lab) => {
    const input = lab.querySelector("input");
    lab.classList.toggle("isChecked", !!(input && input.checked));
  });

  $("reportText").value = buildReport(rec, s);
  return { rec, s };
}

function setResult(id, text, cls) {
  const el = $(id);
  el.textContent = text;
  el.className = "resultLine " + (text ? cls : "");
}

/* ============================================================
   7. カルテ貼り付け用テキストの作成
   ============================================================ */
function checkedLabels(rec, items) {
  return items.filter((it) => rec[it.id] === true).map((it) => it.label);
}

function buildReport(rec, s) {
  const L = [];
  const add = (t) => L.push(t);
  const jpDate = rec.date ? rec.date.replace(/-/g, "/") : "";

  add(`【嚥下評価】${jpDate}${rec.assessor ? `　評価者：${rec.assessor}` : ""}`);
  const who = [
    rec.patientId ? `患者：${rec.patientId}` : null,
    rec.age ? `${rec.age}歳` : null,
    rec.sex || null,
    rec.ward ? `${rec.ward}` : null,
  ].filter(Boolean).join("　");
  if (who) add(who);
  if (rec.diagnosis) add(`主病名・病態：${rec.diagnosis}`);

  const cond = [
    rec.consciousness ? `意識：${labelOf(CONSCIOUSNESS, rec.consciousness)}` : null,
    rec.nutritionRoute ? `栄養経路：${labelOf(NUTRITION_ROUTE, rec.nutritionRoute)}` : null,
    rec.posture ? `姿勢：${labelOf(POSTURE, rec.posture)}` : null,
  ].filter(Boolean).join("　");
  if (cond) add(cond);

  const vital = [
    rec.temperature ? `BT ${rec.temperature}℃` : null,
    rec.spo2Rest ? `SpO2 ${rec.spo2Rest}%` : null,
    rec.spo2Min ? `（テスト中最低 ${rec.spo2Min}%）` : null,
    s.bmi ? `BMI ${s.bmi.toFixed(1)}` : null,
  ].filter(Boolean).join("　");
  if (vital) add(vital);

  /* 問診 */
  const interview = [];
  if (s.eat10 != null) interview.push(` EAT-10：${s.eat10}点${s.eat10Answered === 10 ? (s.eat10 >= 3 ? "（3点以上：問題の可能性あり）" : "（基準内）") : `（${s.eat10Answered}/10項目回答）`}`);
  if (s.seireiJudge) interview.push(` 聖隷式嚥下質問紙：A ${s.seireiA}項目／B ${s.seireiB}項目 → ${s.seireiJudge}`);
  if (interview.length) { add(""); add("■ 問診"); interview.forEach(add); }

  /* 口腔 */
  const oral = [];
  if (s.ohat != null) oral.push(` OHAT-J：${s.ohat}/16点${s.ohatBad.length ? `（病的：${s.ohatBad.join("・")}）` : ""}`);
  if (s.odk) oral.push(` オーラルディアドコキネシス：${["パ", "タ", "カ"].map((k, i) => (s.odk[i] == null ? null : `${k} ${s.odk[i].toFixed(1)}回/秒`)).filter(Boolean).join("　")}`);
  if (rec.oralMemo) oral.push(` 口腔所見：${rec.oralMemo}`);
  if (oral.length) { add(""); add("■ 口腔"); oral.forEach(add); }

  /* スクリーニング */
  const scr = [];
  if (s.rsst != null) scr.push(` RSST：${s.rsst}回/30秒${s.rsst < 3 ? "（3回未満：疑いあり）" : ""}`);
  if (s.mwst != null) scr.push(` MWST（3mL）：${s.mwst}点${s.mwst <= 3 ? "（疑いあり）" : ""}`);
  if (s.ft != null) scr.push(` フードテスト：${s.ft}点${s.ft <= 3 ? "（疑いあり）" : ""}`);
  if (s.wst30 != null) scr.push(` 30mL水飲みテスト：プロフィール${s.wst30}${s.wst30Time != null ? `・${s.wst30Time}秒` : ""}`);
  if (rec.coughTest && rec.coughTest !== "na") scr.push(` 咳テスト：${labelOf(COUGH_TEST_CHOICES, rec.coughTest)}`);
  const ausc = checkedLabels(rec, AUSCULTATION_ITEMS);
  if (ausc.length) scr.push(` 頸部聴診：${ausc.join("／")}`);
  const signs = checkedLabels(rec, SIGN_ITEMS);
  if (signs.length) scr.push(` 観察された症状：${signs.join("／")}`);
  if (s.spo2Drop != null && s.spo2Drop > 0) scr.push(` SpO2低下：${s.spo2Drop}%`);
  if (rec.screenMemo) scr.push(` メモ：${rec.screenMemo}`);
  if (scr.length) { add(""); add("■ スクリーニング"); scr.forEach(add); }

  /* 判定 */
  const judge = [];
  if (rec.dss) judge.push(` DSS：${labelOf(DSS_CHOICES, rec.dss)}`);
  if (rec.grade) judge.push(` 摂食嚥下能力グレード：${labelOf(GRADE_CHOICES, rec.grade)}`);
  if (rec.fils) judge.push(` FILS：${labelOf(FILS_CHOICES, rec.fils)}`);
  if (rec.fois) judge.push(` FOIS：${labelOf(FOIS_CHOICES, rec.fois)}`);
  if (judge.length) { add(""); add("■ 重症度・摂取レベル"); judge.forEach(add); }

  /* プラン */
  const plan = [];
  if (rec.dietCode) plan.push(` 食事：${labelOf(DIET_CODES, rec.dietCode)}`);
  if (rec.thickness) plan.push(` 水分：${labelOf(THICKNESS_CHOICES, rec.thickness)}`);
  const comp = checkedLabels(rec, COMPENSATION_ITEMS);
  if (comp.length) plan.push(` 代償法・条件：${comp.join("／")}`);
  const tr = checkedLabels(rec, TRAINING_ITEMS);
  if (tr.length) plan.push(` 訓練：${tr.join("／")}`);
  if (rec.planMemo) plan.push(` 方針：${rec.planMemo}`);
  if (plan.length) { add(""); add("■ 対応プラン"); plan.forEach(add); }

  /* 総合 */
  if (s.risk || s.advice.length) {
    add("");
    add("■ 総合（参考）");
    const riskLabel = { high: "誤嚥リスクが高い所見あり", mid: "嚥下障害が疑われる", low: "明らかな異常所見なし" };
    if (s.risk) add(` 参考判定：${riskLabel[s.risk]}`);
    s.advice.forEach((a) => add(` ・${a}`));
  }

  add("");
  add("※本文は嚥下評価アプリの入力内容から自動生成したものです。最終判断は評価者・主治医が行っています。");
  return L.join("\n");
}

/* ============================================================
   8. 保存・読み込み（この端末の中だけ）
   ============================================================ */
let editingId = null;

function loadAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn("保存データの読み込みに失敗しました", e);
    return [];
  }
}

function saveAll(records) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    return true;
  } catch (e) {
    alert("保存できませんでした。ブラウザの保存容量がいっぱいか、プライベートブラウズ中かもしれません。");
    return false;
  }
}

$("saveBtn").addEventListener("click", () => {
  const { rec } = update();
  if (!rec.patientId) {
    alert("患者ID／イニシャルを入力してください（氏名は入力しないでください）。");
    return;
  }
  const records = loadAll();
  rec.savedAt = new Date().toISOString();
  if (editingId) {
    const i = records.findIndex((r) => r.id === editingId);
    rec.id = editingId;
    if (i >= 0) records[i] = rec; else records.push(rec);
  } else {
    rec.id = `r${Date.now()}${Math.floor(Math.random() * 1000)}`;
    records.push(rec);
    editingId = rec.id;
  }
  if (saveAll(records)) {
    showStatus(`保存しました（${records.length}件）。「記録一覧」から確認できます。`);
  }
});

function showStatus(text) {
  const el = $("saveStatus");
  el.textContent = text;
  el.className = "resultLine ok";
  setTimeout(() => { el.textContent = ""; }, 4000);
}

$("copyBtn").addEventListener("click", async () => {
  const text = $("reportText").value;
  try {
    await navigator.clipboard.writeText(text);
    showStatus("カルテ用テキストをコピーしました。");
  } catch (e) {
    const ta = $("reportText");
    ta.removeAttribute("readonly");
    ta.select();
    ta.setSelectionRange(0, text.length);
    document.execCommand("copy");
    ta.setAttribute("readonly", "readonly");
    showStatus("コピーしました（うまくいかない場合は長押しで全選択してください）。");
  }
});

$("printBtn").addEventListener("click", () => window.print());
window.addEventListener("beforeprint", () => {
  document.querySelectorAll("details").forEach((d) => (d.open = true));
});

$("clearBtn").addEventListener("click", () => {
  if (confirm("入力内容をクリアします。保存済みの記録は消えません。よろしいですか？")) {
    clearForm(false);
    showStatus("入力をクリアしました。");
  }
});

/* ============================================================
   9. 記録一覧
   ============================================================ */
function renderRecordList() {
  const records = loadAll().sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  const box = $("recordList");
  if (!records.length) {
    box.innerHTML = `<p class="note">まだ保存された記録はありません。</p>`;
    return;
  }
  /* 患者IDごとにまとめる */
  const groups = {};
  records.forEach((r) => {
    const key = r.patientId || "（ID未入力）";
    (groups[key] = groups[key] || []).push(r);
  });

  box.innerHTML = Object.keys(groups).map((key) => {
    const rows = groups[key].map((r) => {
      const s = compute(r);
      const badge = s.risk ? `<span class="badge ${s.risk}">${{ high: "高", mid: "疑", low: "可" }[s.risk]}</span>` : "";
      const cells = [
        r.date || "-",
        `RSST ${s.rsst ?? "-"}`,
        `MWST ${s.mwst ?? "-"}`,
        `FT ${s.ft ?? "-"}`,
        r.fils ? `FILS ${r.fils}` : "FILS -",
        r.dietCode ? `食形態 ${r.dietCode === "normal" ? "常食" : r.dietCode}` : "食形態 -",
      ];
      return `<tr>
        <td>${badge}${esc(cells[0])}</td>
        <td>${cells.slice(1).map(esc).join(" ／ ")}</td>
        <td class="rowBtns">
          <button class="linkBtn" data-open="${esc(r.id)}">開く</button>
          <button class="linkBtn danger" data-del="${esc(r.id)}">削除</button>
        </td>
      </tr>`;
    }).join("");
    return `<details class="card" open>
      <summary>${esc(key)}（${groups[key].length}件）</summary>
      <div class="cardBody"><table class="recordTable"><tbody>${rows}</tbody></table></div>
    </details>`;
  }).join("");

  box.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => {
    const rec = loadAll().find((r) => r.id === b.dataset.open);
    if (!rec) return;
    apply(rec);
    editingId = rec.id;
    document.querySelectorAll(".view").forEach((v) => v.classList.toggle("hidden", v.id !== "assessView"));
    window.scrollTo(0, 0);
    showStatus("記録を読み込みました。修正して保存すると、この記録が上書きされます。");
  }));

  box.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => {
    if (!confirm("この記録を削除します。元に戻せません。よろしいですか？")) return;
    const records = loadAll().filter((r) => r.id !== b.dataset.del);
    saveAll(records);
    if (editingId === b.dataset.del) editingId = null;
    renderRecordList();
  }));
}

/* ---------- 書き出し ---------- */
function download(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const CSV_COLUMNS = [
  ["date", "評価日"], ["patientId", "患者ID"], ["age", "年齢"], ["sex", "性別"],
  ["ward", "病棟"], ["assessor", "評価者"], ["diagnosis", "主病名"],
  ["consciousness", "意識レベル"], ["nutritionRoute", "栄養経路"], ["posture", "姿勢"],
  ["temperature", "体温"], ["spo2Rest", "SpO2安静"], ["spo2Min", "SpO2最低"],
  ["height", "身長"], ["weight", "体重"],
  ["rsst", "RSST"], ["mwst", "MWST"], ["ft", "FT"], ["wst30", "30mL水飲み"], ["wst30Time", "30mL所要秒"],
  ["coughTest", "咳テスト"], ["dss", "DSS"], ["grade", "Gr"], ["fils", "FILS"], ["fois", "FOIS"],
  ["dietCode", "食事コード"], ["thickness", "とろみ"],
  ["oralMemo", "口腔メモ"], ["screenMemo", "スクリーニングメモ"], ["planMemo", "方針"],
];

$("csvBtn").addEventListener("click", () => {
  const records = loadAll();
  if (!records.length) { alert("書き出す記録がありません。"); return; }
  const q = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
  const header = [...CSV_COLUMNS.map((c) => c[1]), "EAT-10合計", "聖隷A", "OHAT合計", "参考判定", "頸部聴診", "症状", "代償法", "訓練"];
  const lines = [header.map(q).join(",")];
  records.forEach((r) => {
    const s = compute(r);
    const riskLabel = { high: "高リスク", mid: "疑い", low: "異常なし" };
    const row = [
      ...CSV_COLUMNS.map((c) => r[c[0]] ?? ""),
      s.eat10 ?? "", s.seireiA ?? "", s.ohat ?? "", s.risk ? riskLabel[s.risk] : "",
      checkedLabels(r, AUSCULTATION_ITEMS).join("；"),
      checkedLabels(r, SIGN_ITEMS).join("；"),
      checkedLabels(r, COMPENSATION_ITEMS).join("；"),
      checkedLabels(r, TRAINING_ITEMS).join("；"),
    ];
    lines.push(row.map(q).join(","));
  });
  /* Excelで文字化けしないようにBOMを付けます */
  download(`嚥下評価_${todayString()}.csv`, "﻿" + lines.join("\r\n"), "text/csv;charset=utf-8");
});

$("jsonBtn").addEventListener("click", () => {
  const records = loadAll();
  if (!records.length) { alert("書き出す記録がありません。"); return; }
  download(`嚥下評価バックアップ_${todayString()}.json`, JSON.stringify(records, null, 2), "application/json");
});

$("importBtn").addEventListener("click", () => $("importFile").click());
$("importFile").addEventListener("change", (ev) => {
  const file = ev.target.files && ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const incoming = JSON.parse(String(reader.result));
      if (!Array.isArray(incoming)) throw new Error("形式が違います");
      const records = loadAll();
      const known = new Set(records.map((r) => r.id));
      let added = 0;
      incoming.forEach((r) => {
        if (r && typeof r === "object" && !known.has(r.id)) {
          records.push(r);
          known.add(r.id);
          added++;
        }
      });
      saveAll(records);
      renderRecordList();
      alert(`${added}件を読み込みました。`);
    } catch (e) {
      alert("読み込めませんでした。このアプリで書き出したJSONファイルを選んでください。");
    }
    ev.target.value = "";
  };
  reader.readAsText(file);
});

$("wipeBtn").addEventListener("click", () => {
  if (!confirm("この端末に保存された嚥下評価の記録をすべて削除します。元に戻せません。よろしいですか？")) return;
  if (!confirm("本当に削除しますか？　必要ならバックアップ（JSON）を先に書き出してください。")) return;
  localStorage.removeItem(STORAGE_KEY);
  editingId = null;
  renderRecordList();
});

/* ============================================================
   10. 入力を変えたら自動で再計算
   ============================================================ */
document.getElementById("assessView").addEventListener("input", update);
document.getElementById("assessView").addEventListener("change", update);

update();

/* オフラインでも使えるようにする（対応ブラウザのみ） */
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => { /* 使えなくても支障ありません */ });
  });
}
