/* 面接練習ノート — アプリ本体 */
import { reviewAnswer, readDocuments, generateQuestions, AiError } from "./claude.js";

// ===================================================================
// 保存データ
// ===================================================================
const STORE_KEY = "mensetsu:v1";
const CATEGORIES = ["基本", "志望動機", "自己分析", "経験", "スキル", "キャリア", "書類の深掘り", "その他"];
const PRESETS = [
  ["基本", "自己紹介をお願いします。"],
  ["志望動機", "当社を志望した理由を教えてください。"],
  ["自己分析", "自己PRをお願いします。"],
  ["自己分析", "あなたの長所と短所を教えてください。"],
  ["経験", "これまでの経験で、最も力を入れて取り組んだことは何ですか。"],
  ["キャリア", "転職を考えた理由を教えてください。"],
  ["経験", "仕事での成功体験を教えてください。"],
  ["経験", "失敗した経験と、そこから学んだことを教えてください。"],
  ["経験", "チームで働くうえで大切にしていることは何ですか。"],
  ["自己分析", "ストレスを感じたとき、どのように対処していますか。"],
  ["志望動機", "入社後にどのような仕事をしたいですか。"],
  ["キャリア", "5年後・10年後のキャリアプランを教えてください。"],
  ["その他", "他社の選考状況を教えてください。"],
  ["その他", "最後に、何か質問はありますか。（逆質問）"],
];

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const emptyData = () => ({
  apiKey: "",
  ctx: { company: "", position: "", notes: "" },
  questions: PRESETS.map(([category, text], i) => ({ id: "p" + i, text, category, source: "preset", answer: "", reviews: [] })),
  profile: null,      // 書類から読み取った内容
  generated: [],      // 生成した質問（練習リストに追加する前）
});

let data = load();
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? Object.assign(emptyData(), JSON.parse(raw)) : emptyData();
  } catch {
    return emptyData();
  }
}
function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
  } catch {
    toast("保存できませんでした。ブラウザの保存領域を確認してください。");
  }
}

// ===================================================================
// ユーティリティ
// ===================================================================
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// **〜** で囲まれた修正箇所を太字にする
const boldMarked = (s) => esc(s).replace(/\*\*([\s\S]+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>");
const stripMarks = (s) => String(s).replace(/\*\*([\s\S]+?)\*\*/g, "$1");
const fmtDate = (t) => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`; };
const charCount = (s) => s.replace(/\s/g, "").length;
// 話す速さは1分あたり約300字
const speakTime = (n) => { const sec = Math.round((n / 300) * 60); return sec < 60 ? `約${sec}秒` : `約${Math.floor(sec / 60)}分${sec % 60 ? (sec % 60) + "秒" : ""}`; };

let toastTimer;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 3500);
}

function profileText(p) {
  if (!p) return "";
  const out = [];
  if (p.summary) out.push(`概要: ${p.summary}`);
  if (p.education?.length) out.push(`学歴: ${p.education.join(" / ")}`);
  if (p.career?.length) out.push("職歴:\n" + p.career.map((c) => `- ${c.period} ${c.company} ${c.role}: ${c.details}`).join("\n"));
  if (p.skills?.length) out.push(`スキル: ${p.skills.join("、")}`);
  if (p.qualifications?.length) out.push(`資格: ${p.qualifications.join("、")}`);
  if (p.achievements?.length) out.push(`実績: ${p.achievements.join(" / ")}`);
  if (p.self_pr) out.push(`書類の自己PR・志望動機: ${p.self_pr}`);
  return out.join("\n");
}
const aiCtx = () => ({ ...data.ctx, profile: profileText(data.profile) });

// ===================================================================
// 音声入力（Web Speech API）
// ===================================================================
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;

function attachDictation(textarea, button, onChange) {
  if (!SpeechRec) {
    button.disabled = true;
    button.title = "このブラウザは音声入力に対応していません";
    return () => {};
  }
  let rec = null, wanted = false, before = "", after = "", finals = "";
  const setUi = (on) => {
    button.classList.toggle("recording", on);
    button.setAttribute("aria-pressed", on);
    button.querySelector("span").textContent = on ? "停止" : "音声入力";
  };
  const begin = () => {
    rec = new SpeechRec();
    rec.lang = "ja-JP";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finals += r[0].transcript;
        else interim += r[0].transcript;
      }
      textarea.value = before + finals + interim + after;
      onChange();
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        wanted = false;
        toast("マイクの使用が許可されていません。ブラウザの設定で許可してください。");
      } else if (e.error === "no-speech") {
        // 無音でも録音を続ける
      } else if (e.error !== "aborted") {
        toast("音声を認識できませんでした（" + e.error + "）");
      }
    };
    // 一定時間で自動的に止まるブラウザがあるので、停止を押すまで続ける
    rec.onend = () => {
      if (wanted) {
        before = before + finals;
        finals = "";
        try { rec.start(); } catch { wanted = false; setUi(false); }
      } else setUi(false);
    };
    rec.start();
  };
  const stop = () => {
    wanted = false;
    rec?.stop();
    setUi(false);
  };
  button.addEventListener("click", () => {
    if (wanted) return stop();
    const pos = textarea.selectionStart ?? textarea.value.length;
    before = textarea.value.slice(0, pos);
    after = textarea.value.slice(pos);
    finals = "";
    wanted = true;
    setUi(true);
    try { begin(); } catch { stop(); toast("音声入力を開始できませんでした。"); }
  });
  return stop;
}

function speak(text) {
  if (!("speechSynthesis" in window)) return toast("このブラウザは読み上げに対応していません。");
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/（逆質問）/, ""));
  u.lang = "ja-JP";
  u.rate = 1;
  speechSynthesis.speak(u);
}

// ===================================================================
// 画面の切り替え
// ===================================================================
let cleanup = () => {};
function route() {
  cleanup();
  cleanup = () => {};
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  const hash = location.hash.slice(1) || "questions";
  const [name, arg] = hash.split("/");
  const tab = name === "q" ? "questions" : name;
  $$(".tabbar a").forEach((a) => a.classList.toggle("active", a.dataset.tab === tab));
  const view = $("#view");
  if (name === "q") renderQuestion(view, decodeURIComponent(arg || ""));
  else if (name === "docs") renderDocs(view);
  else if (name === "settings") renderSettings(view);
  else renderQuestions(view);
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);

// ===================================================================
// 質問一覧
// ===================================================================
let filter = "すべて";
function renderQuestions(view) {
  const qs = data.questions;
  const cats = ["すべて", ...CATEGORIES.filter((c) => qs.some((q) => q.category === c))];
  if (!cats.includes(filter)) filter = "すべて";
  const shown = filter === "すべて" ? qs : qs.filter((q) => q.category === filter);
  const answered = qs.filter((q) => q.answer.trim()).length;
  const target = [data.ctx.company, data.ctx.position].filter(Boolean).join("・");

  view.innerHTML = `
    <section class="hero">
      <h1>よく聞かれる質問</h1>
      <p class="muted">回答を書くか話して、AIに添削してもらいましょう。</p>
      <div class="progress" aria-label="回答済み ${answered} / ${qs.length}">
        <div class="progress-bar" style="width:${qs.length ? (answered / qs.length) * 100 : 0}%"></div>
      </div>
      <p class="small">回答済み ${answered} / ${qs.length}問 ・ 応募先: ${target ? esc(target) : `<a href="#settings">未設定</a>`}</p>
    </section>
    ${data.apiKey ? "" : `<div class="notice">添削や質問の生成には Claude の APIキーが必要です。<a href="#settings">設定で登録</a></div>`}
    <div class="chips" role="tablist">
      ${cats.map((c) => `<button type="button" class="chip${c === filter ? " on" : ""}" data-cat="${esc(c)}">${esc(c)}</button>`).join("")}
    </div>
    <ul class="qlist">
      ${shown.map((q) => {
        const last = q.reviews[0];
        const status = last ? `<span class="badge score">${last.score}点</span>` : q.answer.trim() ? `<span class="badge">回答済み</span>` : `<span class="badge empty">未回答</span>`;
        return `<li><a href="#q/${encodeURIComponent(q.id)}">
          <span class="qcat">${esc(q.category)}${q.source === "generated" ? " ・書類から" : ""}</span>
          <span class="qtext">${esc(q.text)}</span>
          ${status}
        </a></li>`;
      }).join("")}
    </ul>
    <form class="card add-form" id="addForm">
      <h2>質問を追加</h2>
      <label class="field"><span>質問</span><textarea name="text" rows="2" required placeholder="例: 前職で最も苦労したことは何ですか。"></textarea></label>
      <label class="field"><span>分類</span><select name="category">${CATEGORIES.map((c) => `<option>${c}</option>`).join("")}</select></label>
      <div class="row-btns">
        <button type="button" class="btn ghost" id="addMic"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg><span>音声入力</span></button>
        <button class="btn primary" type="submit">追加する</button>
      </div>
    </form>`;

  $$(".chip", view).forEach((b) => b.addEventListener("click", () => { filter = b.dataset.cat; renderQuestions(view); }));
  const form = $("#addForm", view);
  cleanup = attachDictation(form.text, $("#addMic", view), () => {});
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = form.text.value.trim();
    if (!text) return;
    data.questions.push({ id: uid(), text, category: form.category.value, source: "custom", answer: "", reviews: [] });
    save();
    toast("質問を追加しました。");
    renderQuestions(view);
  });
}

// ===================================================================
// 質問の詳細（回答・音声入力・添削）
// ===================================================================
function renderQuestion(view, id) {
  const q = data.questions.find((x) => x.id === id);
  if (!q) { location.hash = "#questions"; return; }

  view.innerHTML = `
    <a class="back" href="#questions">← 質問一覧</a>
    <section class="card question-card">
      <span class="qcat">${esc(q.category)}</span>
      <h1 class="qtitle">${esc(q.text)}</h1>
      ${q.intent ? `<p class="small"><b>面接官の意図:</b> ${esc(q.intent)}</p>` : ""}
      ${q.tip ? `<p class="small"><b>答え方のコツ:</b> ${esc(q.tip)}</p>` : ""}
      <button type="button" class="btn ghost small-btn" id="speakBtn"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg><span>質問を読み上げる</span></button>
    </section>

    <section class="card">
      <div class="card-head">
        <h2>あなたの回答</h2>
        <span class="small muted" id="count"></span>
      </div>
      <textarea id="answer" rows="9" placeholder="ここに回答を入力するか、「音声入力」を押して話してください。">${esc(q.answer)}</textarea>
      <div class="row-btns">
        <button type="button" class="btn ghost" id="micBtn" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg><span>音声入力</span></button>
        <button type="button" class="btn primary" id="reviewBtn">添削する</button>
      </div>
      ${SpeechRec ? "" : `<p class="small muted">このブラウザは音声入力に対応していません。Chrome か Safari をお使いいただくか、キーボードのマイクボタンで入力してください。</p>`}
    </section>

    <section id="result" aria-live="polite"></section>

    ${q.reviews.length > 1 ? `
    <section class="card">
      <h2>これまでの添削</h2>
      <ul class="history">
        ${q.reviews.slice(1).map((r, i) => `<li><button type="button" class="link" data-review="${i + 1}">${fmtDate(r.at)} ・ ${r.score}点</button></li>`).join("")}
      </ul>
    </section>` : ""}

    ${q.source === "preset" ? "" : `<button type="button" class="btn danger-text" id="delBtn">この質問を削除</button>`}`;

  const ta = $("#answer", view);
  const countEl = $("#count", view);
  const updateCount = () => {
    const n = charCount(ta.value);
    countEl.textContent = n ? `${n}字 ・ 話すと${speakTime(n)}` : "";
  };
  const persist = () => { q.answer = ta.value; save(); updateCount(); };
  ta.addEventListener("input", persist);
  updateCount();
  cleanup = attachDictation(ta, $("#micBtn", view), persist);
  $("#speakBtn", view).addEventListener("click", () => speak(q.text));

  const result = $("#result", view);
  if (q.reviews[0]) showReview(result, q, q.reviews[0], ta, persist);
  $$("[data-review]", view).forEach((b) => b.addEventListener("click", () => {
    showReview(result, q, q.reviews[+b.dataset.review], ta, persist);
    result.scrollIntoView({ behavior: "smooth" });
  }));

  const reviewBtn = $("#reviewBtn", view);
  reviewBtn.addEventListener("click", async () => {
    const answer = ta.value.trim();
    if (!answer) return toast("先に回答を入力してください。");
    cleanup();
    reviewBtn.disabled = true;
    result.innerHTML = `<div class="card loading"><span class="spinner" aria-hidden="true"></span>添削しています…（30秒〜1分ほどかかります）</div>`;
    try {
      const r = await reviewAnswer(data.apiKey, { question: q.text, answer, ctx: aiCtx() });
      const review = { at: Date.now(), answer, ...r };
      q.reviews.unshift(review);
      q.reviews = q.reviews.slice(0, 10);
      save();
      if (location.hash.slice(1) === "q/" + encodeURIComponent(q.id)) showReview(result, q, review, ta, persist);
    } catch (e) {
      result.innerHTML = `<div class="card error">${esc(e instanceof AiError ? e.message : "エラーが発生しました: " + e.message)}${data.apiKey ? "" : ` <a href="#settings">設定へ</a>`}</div>`;
    } finally {
      reviewBtn.disabled = false;
    }
  });

  $("#delBtn", view)?.addEventListener("click", () => {
    if (!confirm("この質問と回答を削除しますか？")) return;
    data.questions = data.questions.filter((x) => x.id !== q.id);
    save();
    location.hash = "#questions";
  });
}

function showReview(el, q, r, ta, persist) {
  el.innerHTML = `
    <section class="card review">
      <div class="card-head">
        <h2>添削結果</h2>
        <span class="small muted">${fmtDate(r.at)}</span>
      </div>
      <div class="score-row">
        <div class="score-ring" style="--p:${Math.max(0, Math.min(100, r.score))}"><span>${r.score}</span><small>点</small></div>
        <p>${esc(r.summary)}</p>
      </div>

      <h3>修正後の回答 <span class="small muted">（太字が修正した箇所）</span></h3>
      <div class="revised">${boldMarked(r.revised)}</div>
      <div class="row-btns">
        <button type="button" class="btn ghost" id="copyBtn">コピー</button>
        <button type="button" class="btn ghost" id="speakRevised">読み上げ</button>
        <button type="button" class="btn primary" id="applyBtn">この回答に置き換える</button>
      </div>

      ${r.corrections?.length ? `
      <h3>修正したポイント</h3>
      <ol class="corrections">
        ${r.corrections.map((c) => `<li>
          ${c.before ? `<div class="before">${esc(c.before)}</div>` : ""}
          <div class="after"><strong>${esc(c.after)}</strong></div>
          <div class="reason">${esc(c.reason)}</div>
        </li>`).join("")}
      </ol>` : ""}

      ${r.good_points?.length ? `
      <h3>よかった点</h3>
      <ul class="good">${r.good_points.map((g) => `<li>${esc(g)}</li>`).join("")}</ul>` : ""}

      <details>
        <summary>添削前の回答</summary>
        <p class="pre">${esc(r.answer)}</p>
      </details>
    </section>`;
  const plain = stripMarks(r.revised);
  $("#copyBtn", el).addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(plain); toast("コピーしました。"); } catch { toast("コピーできませんでした。"); }
  });
  $("#speakRevised", el).addEventListener("click", () => speak(plain));
  $("#applyBtn", el).addEventListener("click", () => {
    ta.value = plain;
    persist();
    toast("回答を修正後の内容に置き換えました。");
    ta.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

// ===================================================================
// 書類の読み取りと質問の生成
// ===================================================================
const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.gif,.heic,.docx,.txt,application/pdf,image/*";
const picked = { "履歴書": [], "職務経歴書": [] }; // 読み取り前のファイル（保存はしない）
let busy = false;

function renderDocs(view) {
  const p = data.profile;
  view.innerHTML = `
    <section class="hero">
      <h1>書類から想定質問をつくる</h1>
      <p class="muted">履歴書と職務経歴書を読み取り、あなたの経歴に合わせた質問を自動で考えます。</p>
    </section>
    ${data.apiKey ? "" : `<div class="notice">この機能には Claude の APIキーが必要です。<a href="#settings">設定で登録</a></div>`}

    <section class="card">
      <h2>1. 書類を選ぶ</h2>
      <p class="small muted">PDF・画像（スマホで撮影した写真も可）・Word（.docx）・テキストに対応しています。Excel の書類は PDF で保存してから選んでください。</p>
      ${Object.keys(picked).map((kind) => `
        <div class="slot">
          <div class="slot-head">
            <b>${kind}</b>
            <label class="btn ghost small-btn">ファイルを選ぶ<input type="file" accept="${ACCEPT}" multiple data-kind="${kind}" hidden></label>
          </div>
          <ul class="files">
            ${picked[kind].length ? picked[kind].map((f, i) => `<li><span>${esc(f.name)}</span><button type="button" class="link" data-remove="${kind}:${i}">外す</button></li>`).join("") : `<li class="muted small">未選択</li>`}
          </ul>
        </div>`).join("")}
      <button type="button" class="btn primary wide" id="readBtn" ${picked["履歴書"].length + picked["職務経歴書"].length ? "" : "disabled"}>読み取る</button>
      <p class="small muted">選んだ書類は Claude（Anthropic）に送って読み取ります。ファイル自体はこの端末にも保存しません。</p>
      <div id="readStatus" aria-live="polite"></div>
    </section>

    ${p ? `
    <section class="card profile">
      <div class="card-head"><h2>2. 読み取った内容</h2><button type="button" class="link" id="clearProfile">消去</button></div>
      ${p.summary ? `<p>${esc(p.summary)}</p>` : ""}
      ${p.career?.length ? `<h3>職歴</h3><ul class="career">${p.career.map((c) => `<li><span class="small muted">${esc(c.period)}</span><b>${esc(c.company)}</b> ${esc(c.role)}<div class="small">${esc(c.details)}</div></li>`).join("")}</ul>` : ""}
      ${p.education?.length ? `<h3>学歴</h3><ul>${p.education.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
      ${p.skills?.length ? `<h3>スキル</h3><p class="tags">${p.skills.map((x) => `<span>${esc(x)}</span>`).join("")}</p>` : ""}
      ${p.qualifications?.length ? `<h3>資格</h3><p class="tags">${p.qualifications.map((x) => `<span>${esc(x)}</span>`).join("")}</p>` : ""}
      ${p.achievements?.length ? `<h3>実績</h3><ul>${p.achievements.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
      ${p.self_pr ? `<h3>書類の自己PR・志望動機</h3><p>${esc(p.self_pr)}</p>` : ""}
      ${p.concerns?.length ? `<h3>深掘りされそうな点</h3><ul class="concerns">${p.concerns.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
      <p class="small muted">この内容は添削のときにも参考にして、書類との食い違いを確認します。</p>
    </section>

    <section class="card">
      <h2>3. 質問をつくる</h2>
      <div class="grid2">
        <label class="field"><span>応募先企業</span><input id="company" value="${esc(data.ctx.company)}" placeholder="任意"></label>
        <label class="field"><span>職種</span><input id="position" value="${esc(data.ctx.position)}" placeholder="任意"></label>
        <label class="field"><span>面接の段階</span><select id="stage">${["一次面接", "二次面接", "最終面接", "カジュアル面談"].map((s) => `<option>${s}</option>`).join("")}</select></label>
        <label class="field"><span>質問の数</span><select id="count">${[5, 10, 15].map((n) => `<option ${n === 10 ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      </div>
      <button type="button" class="btn primary wide" id="genBtn">質問を生成する</button>
      <div id="genStatus" aria-live="polite"></div>
    </section>` : ""}

    ${data.generated.length ? `
    <section class="card">
      <div class="card-head"><h2>生成した質問</h2><button type="button" class="link" id="checkAll">すべて選ぶ</button></div>
      <ul class="generated">
        ${data.generated.map((g, i) => `<li>
          <label>
            <input type="checkbox" data-gen="${i}" ${g.added ? "disabled checked" : ""}>
            <span>
              <span class="qcat">${esc(g.category)}${g.added ? " ・追加済み" : ""}</span>
              <span class="qtext">${esc(g.question)}</span>
              <span class="small"><b>意図:</b> ${esc(g.intent)}</span>
              <span class="small"><b>コツ:</b> ${esc(g.tip)}</span>
            </span>
          </label>
        </li>`).join("")}
      </ul>
      <button type="button" class="btn primary wide" id="addGen">選んだ質問を練習リストに追加</button>
    </section>` : ""}`;

  $$("input[type=file]", view).forEach((inp) => inp.addEventListener("change", () => {
    for (const f of inp.files) {
      if (/\.(xlsx?|doc|pages|numbers)$/i.test(f.name)) { toast(`${f.name} は読み取れません。PDFで保存してから選んでください。`); continue; }
      picked[inp.dataset.kind].push(f);
    }
    renderDocs(view);
  }));
  $$("[data-remove]", view).forEach((b) => b.addEventListener("click", () => {
    const [kind, i] = b.dataset.remove.split(":");
    picked[kind].splice(+i, 1);
    renderDocs(view);
  }));

  $("#readBtn", view).addEventListener("click", async () => {
    if (busy) return;
    const status = $("#readStatus", view);
    busy = true;
    $("#readBtn", view).disabled = true;
    status.innerHTML = `<div class="loading"><span class="spinner" aria-hidden="true"></span>書類を読み取っています…（1分ほどかかります）</div>`;
    try {
      const docs = [];
      for (const kind of Object.keys(picked)) {
        if (picked[kind].length) docs.push({ kind, files: await Promise.all(picked[kind].map(prepareFile)) });
      }
      data.profile = await readDocuments(data.apiKey, docs);
      data.profile.readAt = Date.now();
      save();
      picked["履歴書"] = [];
      picked["職務経歴書"] = [];
      toast("書類を読み取りました。");
      if (location.hash === "#docs") renderDocs(view);
    } catch (e) {
      status.innerHTML = `<div class="error">${esc(e.message)}</div>`;
      $("#readBtn", view).disabled = false;
    } finally {
      busy = false;
    }
  });

  $("#clearProfile", view)?.addEventListener("click", () => {
    if (!confirm("読み取った書類の内容を消去しますか？")) return;
    data.profile = null;
    save();
    renderDocs(view);
  });

  $("#genBtn", view)?.addEventListener("click", async () => {
    if (busy) return;
    data.ctx.company = $("#company", view).value.trim();
    data.ctx.position = $("#position", view).value.trim();
    save();
    const status = $("#genStatus", view);
    busy = true;
    $("#genBtn", view).disabled = true;
    status.innerHTML = `<div class="loading"><span class="spinner" aria-hidden="true"></span>質問を考えています…（30秒〜1分ほどかかります）</div>`;
    try {
      const r = await generateQuestions(data.apiKey, {
        profile: profileText(data.profile),
        ctx: data.ctx,
        stage: $("#stage", view).value,
        count: +$("#count", view).value,
      });
      data.generated = r.questions.map((g) => ({ ...g, added: false }));
      save();
      if (location.hash === "#docs") renderDocs(view);
    } catch (e) {
      status.innerHTML = `<div class="error">${esc(e.message)}</div>`;
      $("#genBtn", view).disabled = false;
    } finally {
      busy = false;
    }
  });

  $("#checkAll", view)?.addEventListener("click", () => $$("[data-gen]:not(:disabled)", view).forEach((c) => (c.checked = true)));
  $("#addGen", view)?.addEventListener("click", () => {
    const chosen = $$("[data-gen]:checked:not(:disabled)", view).map((c) => data.generated[+c.dataset.gen]);
    if (!chosen.length) return toast("追加する質問を選んでください。");
    for (const g of chosen) {
      data.questions.push({ id: uid(), text: g.question, category: g.category, source: "generated", intent: g.intent, tip: g.tip, answer: "", reviews: [] });
      g.added = true;
    }
    save();
    toast(`${chosen.length}問を練習リストに追加しました。`);
    renderDocs(view);
  });
}

// ファイルを Claude に送れる形にする
async function prepareFile(file) {
  const name = file.name;
  if (file.type === "application/pdf" || /\.pdf$/i.test(name)) {
    return { type: "pdf", name, data: await toBase64(file) };
  }
  if (/\.docx$/i.test(name)) {
    const mammoth = await loadMammoth();
    const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return { type: "text", name, data: value };
  }
  if (file.type.startsWith("text/") || /\.txt$/i.test(name)) {
    return { type: "text", name, data: await file.text() };
  }
  if (file.type.startsWith("image/") || /\.(heic|jpe?g|png|webp|gif)$/i.test(name)) {
    return { type: "image", name, mediaType: "image/jpeg", data: await shrinkImage(file) };
  }
  throw new AiError(`${name} は読み取れない形式です。PDFか画像で選んでください。`);
}

function toBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = () => reject(new AiError("ファイルを読み込めませんでした。"));
    r.readAsDataURL(blob);
  });
}

// 撮影した写真は大きいので、文字が読める程度に縮小して JPEG にする
async function shrinkImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new AiError(`${file.name} を画像として開けませんでした。JPEGかPNGで選んでください。`));
      im.src = url;
    });
    const scale = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const g = canvas.getContext("2d");
    g.fillStyle = "#fff";
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.88).split(",")[1];
  } finally {
    URL.revokeObjectURL(url);
  }
}

let mammothPromise;
function loadMammoth() {
  mammothPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "vendor/mammoth.browser.min.js";
    s.onload = () => resolve(window.mammoth);
    s.onerror = () => { mammothPromise = null; reject(new AiError("Wordファイルを読み込む準備ができませんでした。")); };
    document.head.append(s);
  });
  return mammothPromise;
}

// ===================================================================
// 設定
// ===================================================================
function renderSettings(view) {
  view.innerHTML = `
    <section class="hero"><h1>設定</h1></section>

    <form class="card" id="keyForm">
      <h2>Claude APIキー</h2>
      <p class="small muted">回答の添削・書類の読み取り・質問の生成に使います。<a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">Anthropic Console</a> で発行したキーを入力してください。キーはこの端末のブラウザにだけ保存されます。</p>
      <label class="field"><span>APIキー</span><input name="key" type="password" autocomplete="off" spellcheck="false" placeholder="sk-ant-..." value="${esc(data.apiKey)}"></label>
      <div class="row-btns">
        ${data.apiKey ? `<button type="button" class="btn ghost" id="clearKey">削除</button>` : ""}
        <button class="btn primary" type="submit">保存</button>
      </div>
    </form>

    <form class="card" id="ctxForm">
      <h2>応募先</h2>
      <p class="small muted">入力しておくと、その企業・職種に合わせて添削します。</p>
      <label class="field"><span>企業名</span><input name="company" value="${esc(data.ctx.company)}"></label>
      <label class="field"><span>職種</span><input name="position" value="${esc(data.ctx.position)}"></label>
      <label class="field"><span>企業・求人のメモ</span><textarea name="notes" rows="4" placeholder="事業内容、求める人物像、求人票の必須条件など">${esc(data.ctx.notes)}</textarea></label>
      <button class="btn primary" type="submit">保存</button>
    </form>

    <section class="card">
      <h2>データ</h2>
      <p class="small muted">回答と添削結果はこの端末のブラウザに保存されています。</p>
      <div class="row-btns">
        <button type="button" class="btn ghost" id="resetAnswers">回答と添削をすべて消去</button>
        <button type="button" class="btn danger" id="resetAll">すべて初期状態に戻す</button>
      </div>
    </section>`;

  $("#keyForm", view).addEventListener("submit", (e) => {
    e.preventDefault();
    data.apiKey = e.target.key.value.trim();
    save();
    toast(data.apiKey ? "APIキーを保存しました。" : "APIキーを削除しました。");
    renderSettings(view);
  });
  $("#clearKey", view)?.addEventListener("click", () => { data.apiKey = ""; save(); toast("APIキーを削除しました。"); renderSettings(view); });
  $("#ctxForm", view).addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target;
    data.ctx = { company: f.company.value.trim(), position: f.position.value.trim(), notes: f.notes.value.trim() };
    save();
    toast("応募先を保存しました。");
  });
  $("#resetAnswers", view).addEventListener("click", () => {
    if (!confirm("すべての回答と添削結果を消去しますか？")) return;
    data.questions.forEach((q) => { q.answer = ""; q.reviews = []; });
    save();
    toast("回答と添削を消去しました。");
  });
  $("#resetAll", view).addEventListener("click", () => {
    if (!confirm("APIキー・追加した質問・回答・書類の読み取り結果をすべて消去しますか？")) return;
    data = emptyData();
    save();
    toast("初期状態に戻しました。");
    renderSettings(view);
  });
}

route();
