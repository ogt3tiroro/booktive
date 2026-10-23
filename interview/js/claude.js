/* Claude API との通信（添削・書類の読み取り・質問の生成） */
import Anthropic from "../vendor/anthropic-sdk.js";

const MODEL = "claude-opus-5-5";

export class AiError extends Error {}

// 構造化出力（JSON）で1回問い合わせる
async function askJSON(apiKey, { system, content, schema, effort = "medium" }) {
  if (!apiKey) throw new AiError("「設定」で Claude の APIキーを登録してください。");
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  let msg;
  try {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 16000,
      system,
      messages: [{ role: "user", content }],
      output_config: { effort, format: { type: "json_schema", schema } },
      // 安全判定で断られたときは推奨モデルで自動的にやり直す
      fallbacks: "default",
      betas: ["server-side-fallback-2026-07-01"],
    });
    msg = await stream.finalMessage();
  } catch (e) {
    throw new AiError(describeError(e));
  }
  if (msg.stop_reason === "refusal") throw new AiError("この内容には回答できませんでした。表現を変えてもう一度お試しください。");
  if (msg.stop_reason === "max_tokens") throw new AiError("結果が長すぎて途中で切れました。書類や回答を短くしてお試しください。");
  const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  try {
    return JSON.parse(text);
  } catch {
    throw new AiError("結果を読み取れませんでした。もう一度お試しください。");
  }
}

function describeError(e) {
  if (e instanceof Anthropic.AuthenticationError) return "APIキーが正しくありません。「設定」で確認してください。";
  if (e instanceof Anthropic.PermissionDeniedError) return "このAPIキーでは利用できません。キーの権限を確認してください。";
  if (e instanceof Anthropic.RateLimitError) return "利用の上限に達しました。少し時間をおいてお試しください。";
  if (e instanceof Anthropic.BadRequestError) {
    const m = String(e.message || "");
    if (/credit|billing/i.test(m)) return "APIの残高が不足しています。Anthropic Console でクレジットを確認してください。";
    if (/too large|too long|size/i.test(m)) return "ファイルが大きすぎます。ページ数や画像サイズを減らしてください。";
    return "送信内容に問題がありました: " + m;
  }
  if (e instanceof Anthropic.APIConnectionError) return "通信できませんでした。ネットワーク接続を確認してください。";
  if (e instanceof Anthropic.InternalServerError) return "サーバーが混み合っています。少し時間をおいてお試しください。";
  if (e instanceof Anthropic.APIError) return "エラーが発生しました: " + (e.message || e.status);
  return "エラーが発生しました: " + (e?.message || e);
}

const str = { type: "string" };
const strList = { type: "array", items: str };
const obj = (properties) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });

function contextText(ctx) {
  const lines = [];
  if (ctx.company) lines.push(`応募先企業: ${ctx.company}`);
  if (ctx.position) lines.push(`応募職種: ${ctx.position}`);
  if (ctx.notes) lines.push(`企業・求人についてのメモ: ${ctx.notes}`);
  if (ctx.profile) lines.push(`応募者の書類（履歴書・職務経歴書）の要約:\n${ctx.profile}`);
  return lines.length ? lines.join("\n") : "（応募先や書類の情報はありません）";
}

// ---------------------------------------------------------------------------
// 回答の添削
// ---------------------------------------------------------------------------
const REVIEW_SCHEMA = obj({
  score: { type: "integer", description: "面接回答としての完成度。0〜100" },
  summary: { type: "string", description: "総評。2〜3文" },
  good_points: strList,
  corrections: {
    type: "array",
    items: obj({ before: str, after: str, reason: str }),
  },
  revised: { type: "string", description: "修正後の回答全文。元の回答から変えた・加えた箇所だけを **と** で囲む" },
});

export function reviewAnswer(apiKey, { question, answer, ctx }) {
  const system = "あなたは日本企業の採用面接を数多く見てきたキャリアアドバイザーです。応募者が声に出して話す回答を、面接官に伝わりやすく好印象になるよう添削します。";
  const content = `次の面接の質問への回答を添削してください。

${contextText(ctx)}

# 質問
${question}

# 応募者の回答
${answer}

# 添削の方針
- 回答は音声入力の場合があります。誤変換・「えー」「あの」などのつなぎ言葉・句読点の抜けも直してください。
- 結論を先に述べ、具体的なエピソードや数字で裏づけ、応募先で活かせる点につなげる構成にしてください。
- 応募者の経験や事実を勝手に作らないでください。具体例が足りない箇所は「（ここに○○の具体例）」のように補う場所を示してください。
- 書類の要約がある場合は、内容の食い違いがないかも確認してください。
- 面接で話すことを前提に、自然な話し言葉（です・ます調）で、1分〜1分半（300〜400字程度）を目安にしてください。質問の性質上短く答えるべきものは短くてかまいません。
- revised には修正後の回答全文を入れ、元の回答から変更・追加した部分だけを **太字にする部分** のように ** で囲んでください。変えていない部分は囲まないでください。
- corrections には主な修正点を、元の表現（before）・修正後（after）・理由（reason）で挙げてください。before が無い追加の場合は before を空文字にしてください。
- good_points には回答の良い点を挙げてください。`;
  return askJSON(apiKey, { system, content, schema: REVIEW_SCHEMA, effort: "medium" });
}

// ---------------------------------------------------------------------------
// 履歴書・職務経歴書の読み取り
// ---------------------------------------------------------------------------
const PROFILE_SCHEMA = obj({
  summary: { type: "string", description: "応募者の経歴の要約。3〜5文" },
  education: strList,
  career: {
    type: "array",
    items: obj({ period: str, company: str, role: str, details: str }),
  },
  skills: strList,
  qualifications: strList,
  achievements: strList,
  self_pr: { type: "string", description: "書類に書かれた自己PR・志望動機の要点。無ければ空文字" },
  concerns: { type: "array", items: str, description: "面接官が深掘りしそうな点（空白期間、短期離職、職種の変更など）" },
});

// docs: [{ kind: "履歴書" | "職務経歴書", files: [{ type: "pdf"|"image"|"text", mediaType, data, name }] }]
export function readDocuments(apiKey, docs) {
  const content = [];
  for (const doc of docs) {
    for (const f of doc.files) {
      content.push({ type: "text", text: `【${doc.kind}】${f.name}` });
      if (f.type === "pdf") content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: f.data } });
      else if (f.type === "image") content.push({ type: "image", source: { type: "base64", media_type: f.mediaType, data: f.data } });
      else content.push({ type: "text", text: f.data });
    }
  }
  content.push({
    type: "text",
    text: `上の履歴書・職務経歴書を読み取り、面接対策に使えるよう内容を整理してください。
- 書類に書かれている事実だけをまとめ、推測で補わないでください。読み取れない項目は空にしてください。
- 氏名・住所・電話番号・メールアドレス・生年月日などの個人を特定する情報は出力に含めないでください。
- career は新しい順に、期間・会社名・役職や職種・主な業務と成果を入れてください。
- concerns には、面接官が質問しそうな気になる点を挙げてください。`,
  });
  const system = "あなたは日本の採用書類（履歴書・職務経歴書）を読み慣れた人事担当者です。";
  return askJSON(apiKey, { system, content, schema: PROFILE_SCHEMA, effort: "medium" });
}

// ---------------------------------------------------------------------------
// 想定質問の生成
// ---------------------------------------------------------------------------
const QUESTIONS_SCHEMA = obj({
  questions: {
    type: "array",
    items: obj({
      question: { type: "string", description: "面接官が実際に口にする言い方の質問文" },
      category: { type: "string", enum: ["基本", "志望動機", "自己分析", "経験", "スキル", "キャリア", "書類の深掘り", "その他"] },
      intent: { type: "string", description: "面接官がこの質問で確かめたいこと" },
      tip: { type: "string", description: "答え方のコツ。書類のどの経験を使うとよいか" },
    }),
  },
});

export function generateQuestions(apiKey, { profile, ctx, stage, count }) {
  const system = "あなたは日本企業の面接官です。応募者の書類を読み込んだうえで、本番で実際に聞く質問を考えます。";
  const content = `次の応募者に、${stage}で聞く質問を${count}個つくってください。

${contextText({ ...ctx, profile })}

# 方針
- 書類の具体的な経験・成果・スキル・経歴の変化に踏み込んだ、この応募者ならではの質問を中心にしてください。
- 「経歴の中で〜とありますが」のように、書類のどこを見て聞いているかが分かる言い方にしてください。
- 気になる点（空白期間・短期離職・職種変更など）があれば、それを確かめる質問も入れてください。
- 応募先・職種が分かる場合は、そこで活かせるかを確かめる質問も入れてください。
- 同じ趣旨の質問を重複させないでください。`;
  return askJSON(apiKey, { system, content, schema: QUESTIONS_SCHEMA, effort: "medium" });
}
