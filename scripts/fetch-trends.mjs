// SNSで今日話題になっている言葉を集めて data/trends.json に書き出す（GitHub Actions で定期実行）
// X・Threads・Instagram はブラウザから直接読めないため、ここでサーバー側として取得する。
//   X         : trends24.in（X の日本のトレンドを1時間ごとに記録しているサイト）。だめなら Yahoo!リアルタイム検索
//   Threads   : THREADS_ACCESS_TOKEN があればキーワード検索APIで人気投稿を取得
//   Instagram : IG_USER_ID と IG_ACCESS_TOKEN があればハッシュタグ検索APIで人気投稿を取得
//   Google    : 急上昇ワードと関連ニュース（話題になった理由の手がかりに使う）
// 使い方: node scripts/fetch-trends.mjs [出力先]
import { readFile, writeFile } from "node:fs/promises";

const OUT = process.argv[2] || new URL("../data/trends.json", import.meta.url);
const UA = "Mozilla/5.0 (compatible; BooktiveTrends/1.0; +https://ogt3tiroro.github.io/booktive/)";
const { THREADS_ACCESS_TOKEN = "", IG_USER_ID = "", IG_ACCESS_TOKEN = "" } = process.env;
const MAX_TOPICS = 30;
const THREADS_QUERIES = 10;   // 1回の実行で Threads を調べる話題の数（上位から）
const INSTAGRAM_QUERIES = 3;  // Instagram はハッシュタグ検索が7日間で30種類までのため少なめ

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url, type = "text") {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "ja,en;q=0.5" } });
      if (!r.ok) throw new Error(`HTTP ${r.status} ${url.split("?")[0]}`);
      return type === "json" ? await r.json() : await r.text();
    } catch (e) {
      if (i === 2) throw e;
      await sleep(2000 * (i + 1));
    }
  }
}
const decode = (s) => String(s || "")
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();
export const norm = (s) => String(s || "").normalize("NFKC").toLowerCase().replace(/^#/, "").replace(/[\s_・]/g, "");
const startOfTodayJst = () => { const d = new Date(Date.now() + 9 * 3600e3); d.setUTCHours(0, 0, 0, 0); return d.getTime() - 9 * 3600e3; };
const parseCount = (s) => {
  const m = String(s || "").replace(/,/g, "").match(/([\d.]+)\s*([KkMm万千]?)/);
  if (!m) return 0;
  return Math.round(+m[1] * ({ k: 1e3, K: 1e3, m: 1e6, M: 1e6, 万: 1e4, 千: 1e3 }[m[2]] || 1));
};

// --- X: trends24.in の1時間ごとのトレンド表 ---
export function parseTrends24(html) {
  const hours = [];
  const parts = html.split(/<ol[^>]*class="[^"]*trend-card__list[^"]*"[^>]*>/).slice(1);
  let prevTail = html.split(/<ol[^>]*class="[^"]*trend-card__list/)[0];
  parts.forEach((part, i) => {
    const body = part.split("</ol>")[0];
    // 直前にある data-timestamp（秒）がその表の時刻。無ければ1時間ずつさかのぼる
    const ts = [...prevTail.matchAll(/data-timestamp="([\d.]+)"/g)].pop();
    const at = ts ? Math.round(+ts[1] * 1000) : Date.now() - i * 3600e3;
    const items = [];
    for (const li of body.split(/<li[\s>]/).slice(1)) {
      const a = li.match(/<a[^>]*>([\s\S]*?)<\/a>/);
      if (!a) continue;
      const name = decode(a[1]);
      const c = li.match(/data-count="(\d+)"/) || li.match(/class="[^"]*tweet-count[^"]*"[^>]*>([^<]*)</);
      if (name) items.push({ name, count: c ? parseCount(c[1]) : 0 });
    }
    if (items.length) hours.push({ at, items });
    prevTail = part.split("</ol>").slice(1).join("</ol>");
  });
  return hours;
}

// --- X の予備: Yahoo!リアルタイム検索のトレンド（ページ内のJSONから言葉を拾う）---
export function parseYahooRealtime(html) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return [];
  let best = [];
  const walk = (v) => {
    if (Array.isArray(v)) {
      const names = v.map((o) => o && typeof o === "object" ? (o.query || o.word || o.keyword || o.title) : null).filter((s) => typeof s === "string" && s.length <= 60);
      if (names.length >= 10 && names.length > best.length) best = names;
      v.forEach(walk);
    } else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  try { walk(JSON.parse(m[1])); } catch { return []; }
  return best.length ? [{ at: Date.now(), items: best.map((name) => ({ name, count: 0 })) }] : [];
}

async function fetchX() {
  let hours = [];
  let via = "trends24.in";
  try { hours = parseTrends24(await get("https://trends24.in/japan/")); } catch (e) { console.warn("trends24:", e.message); }
  if (!hours.length) {
    via = "Yahoo!リアルタイム検索";
    hours = parseYahooRealtime(await get("https://search.yahoo.co.jp/realtime"));
  }
  if (!hours.length) throw new Error("X のトレンドを読み取れませんでした");
  hours.sort((a, b) => b.at - a.at);
  const today = startOfTodayJst();
  const todays = hours.filter((h) => h.at >= today);
  const latest = hours[0];
  const map = new Map();
  // 今日のどこかの時間にトレンド入りしたもの（最新の順位を優先）
  (todays.length ? todays : [latest]).forEach((h) => h.items.forEach((it, idx) => {
    const k = norm(it.name);
    const t = map.get(k) || { name: it.name, rank: null, bestRank: idx + 1, count: 0, hours: 0, firstAt: h.at, ranks: [] };
    if (h === latest) t.rank = idx + 1;
    t.bestRank = Math.min(t.bestRank, idx + 1);
    t.count = Math.max(t.count, it.count);
    t.hours += 1;
    t.firstAt = Math.min(t.firstAt, h.at);
    t.ranks.push([h.at, idx + 1]);
    map.set(k, t);
  }));
  const topics = [...map.values()].map((t) => ({
    ...t, ranks: t.ranks.sort((a, b) => a[0] - b[0]),
    url: `https://x.com/search?q=${encodeURIComponent(t.name)}&src=trend_click`,
  }));
  return { via, hoursTracked: (todays.length || 1), topics };
}

// --- Google 急上昇ワード（RSS）---
export function parseGoogleRss(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, it]) => {
    const tag = (n) => decode((it.match(new RegExp(`<${n}>([\\s\\S]*?)</${n}>`)) || [])[1]);
    const news = [...it.matchAll(/<ht:news_item>([\s\S]*?)<\/ht:news_item>/g)].map(([, n]) => ({
      title: decode((n.match(/<ht:news_item_title>([\s\S]*?)<\/ht:news_item_title>/) || [])[1]),
      source: decode((n.match(/<ht:news_item_source>([\s\S]*?)<\/ht:news_item_source>/) || [])[1]),
      url: decode((n.match(/<ht:news_item_url>([\s\S]*?)<\/ht:news_item_url>/) || [])[1]),
    })).filter((n) => n.title);
    return { name: tag("title"), traffic: tag("ht:approx_traffic"), startedAt: Date.parse(tag("pubDate")) || null, news };
  }).filter((g) => g.name);
}
async function fetchGoogle() {
  return parseGoogleRss(await get("https://trends.google.co.jp/trending/rss?geo=JP"));
}

// --- Threads: キーワード検索（人気順）---
async function fetchThreads(q) {
  const u = `https://graph.threads.net/v1.0/keyword_search?q=${encodeURIComponent(q)}&search_type=TOP&fields=id,text,permalink,timestamp,username&access_token=${THREADS_ACCESS_TOKEN}`;
  const j = await get(u, "json");
  const posts = (j.data || []).map((p) => ({ text: (p.text || "").slice(0, 200), url: p.permalink, at: Date.parse(p.timestamp) || null, user: p.username }));
  const today = startOfTodayJst();
  return { todayPosts: posts.filter((p) => p.at >= today).length, posts: posts.slice(0, 3), url: `https://www.threads.net/search?q=${encodeURIComponent(q)}&serp_type=default` };
}

// --- Instagram: ハッシュタグの人気投稿 ---
async function fetchInstagram(tag, cache) {
  const key = norm(tag);
  let id = cache[key];
  if (!id) {
    const s = await get(`https://graph.facebook.com/v21.0/ig_hashtag_search?user_id=${IG_USER_ID}&q=${encodeURIComponent(key)}&access_token=${IG_ACCESS_TOKEN}`, "json");
    id = s.data?.[0]?.id;
    if (!id) return null;
    cache[key] = id;
  }
  const j = await get(`https://graph.facebook.com/v21.0/${id}/top_media?user_id=${IG_USER_ID}&fields=caption,like_count,comments_count,permalink,timestamp&limit=25&access_token=${IG_ACCESS_TOKEN}`, "json");
  const media = j.data || [];
  const today = startOfTodayJst();
  return {
    likes: media.reduce((a, m) => a + (m.like_count || 0), 0), comments: media.reduce((a, m) => a + (m.comments_count || 0), 0),
    todayPosts: media.filter((m) => Date.parse(m.timestamp) >= today).length,
    posts: media.slice(0, 3).map((m) => ({ text: (m.caption || "").slice(0, 200), url: m.permalink, likes: m.like_count || 0, comments: m.comments_count || 0 })),
    url: `https://www.instagram.com/explore/tags/${encodeURIComponent(key)}/`,
  };
}

// X の言葉と Google 急上昇ワード・ニュースを結びつける
export function matchGoogle(name, google) {
  const k = norm(name);
  if (k.length < 2) return null;
  return google.find((g) => { const gk = norm(g.name); return gk === k || (gk.length >= 2 && (gk.includes(k) || k.includes(gk))); })
    || google.find((g) => g.news.some((n) => norm(n.title).includes(k)))
    || null;
}

async function main() {
  let prev = {};
  try { prev = JSON.parse(await readFile(OUT, "utf8")); } catch {}
  const sources = {};
  const out = { updatedAt: new Date().toISOString(), sources, topics: [] };

  let x = null;
  try { x = await fetchX(); sources.x = { ok: true, via: x.via, hoursTracked: x.hoursTracked }; }
  catch (e) { sources.x = { ok: false, error: e.message }; }

  let google = [];
  try { google = await fetchGoogle(); sources.google = { ok: true, count: google.length }; }
  catch (e) { sources.google = { ok: false, error: e.message }; }

  // 話題の一覧：X のトレンドが軸。X が取れなければ Google の急上昇ワードを候補にして他のSNSで確かめる
  const base = x ? x.topics.sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || a.bestRank - b.bestRank) : google.map((g) => ({ name: g.name }));
  out.topics = base.slice(0, MAX_TOPICS).map((t) => {
    const g = matchGoogle(t.name, google);
    return { name: t.name, x: x && t.rank !== undefined ? { rank: t.rank, bestRank: t.bestRank, count: t.count, hours: t.hours, firstAt: t.firstAt, ranks: t.ranks, url: t.url } : null, google: g ? { name: g.name, traffic: g.traffic, startedAt: g.startedAt, news: g.news.slice(0, 3) } : null };
  });

  if (THREADS_ACCESS_TOKEN) {
    let n = 0;
    for (const t of out.topics.slice(0, THREADS_QUERIES)) {
      try { t.threads = await fetchThreads(t.name.replace(/^#/, "")); n++; } catch (e) { sources.threads = { ok: false, error: e.message }; break; }
    }
    if (!sources.threads) sources.threads = { ok: true, queried: n };
  } else sources.threads = { ok: false, error: "未設定（THREADS_ACCESS_TOKEN）" };

  if (IG_USER_ID && IG_ACCESS_TOKEN) {
    const cache = prev.instagramHashtagIds || {};
    let n = 0;
    // 空白を含まない言葉だけがハッシュタグとして検索できる
    for (const t of out.topics.filter((t) => !/\s/.test(t.name.trim())).slice(0, INSTAGRAM_QUERIES)) {
      try { t.instagram = await fetchInstagram(t.name, cache); n++; } catch (e) { sources.instagram = { ok: false, error: e.message }; break; }
    }
    out.instagramHashtagIds = cache;
    if (!sources.instagram) sources.instagram = { ok: true, queried: n };
  } else sources.instagram = { ok: false, error: "未設定（IG_USER_ID・IG_ACCESS_TOKEN）" };

  if (!out.topics.length && prev.topics?.length) {
    console.warn("今回は話題を取得できなかったため、前回のデータを残します");
    return;
  }
  await writeFile(OUT, JSON.stringify(out, null, 1) + "\n");
  console.log(`topics: ${out.topics.length}`, JSON.stringify(sources));
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
