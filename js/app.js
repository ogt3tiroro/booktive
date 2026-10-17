/* 本活 Booktive — 読書記録アプリ本体 */
(() => {
  "use strict";

  // ===================================================================
  // 保存データ
  // ===================================================================
  const STORE_KEY = "booktive:v1";
  const STATUS = { want: "読みたい", reading: "読書中", read: "読了" };
  const GENRES = ["日本の小説", "海外の小説", "ミステリー", "SF・ファンタジー", "歴史・時代", "エッセイ・随筆", "ノンフィクション", "ビジネス・自己啓発", "人文・社会", "科学・技術", "趣味・実用", "コミック", "絵本・児童書", "その他"];
  const PREFS = ["北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県", "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"];

  const emptyData = () => ({
    books: {},          // id -> Book
    favAuthors: [],     // [{ name, addedAt }]
    authorCache: {},    // name -> { fetchedAt, works: [...] }
    libraries: [],      // [{ systemid, systemname, libkey, formal, address }]
    settings: { calilKey: "", googleKey: "" },
  });

  let data = load();
  fixSplitAuthors();
  // 以前の版で姓と名が別の作家として保存された本を1人にまとめる
  function fixSplitAuthors() {
    let changed = false;
    for (const b of Object.values(data.books)) {
      const a = b.authors || [];
      if (a.length === 2 && a.every((x) => /^[\u3400-\u9fff\u3040-\u30ff々]{1,3}$/.test(x))) {
        b.authors = [a.join("")];
        changed = true;
      }
    }
    if (changed) save();
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return emptyData();
      return Object.assign(emptyData(), JSON.parse(raw));
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
  // 文字列ユーティリティ
  // ===================================================================
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const hasCJK = (s) => /[぀-ヿ㐀-鿿]/.test(s);
  const pad2 = (n) => String(n).padStart(2, "0");
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };

  // 著者名の正規化：「東野 圭吾／著」→「東野圭吾」
  function cleanAuthor(s) {
    let n = String(s || "").normalize("NFKC").trim();
    n = n.replace(/\s*[\/／]?\s*(著|作|文|訳|編|著者|原作|原著|画|絵|監修|編著|作・絵|文・絵)\s*$/, "");
    n = n.replace(/[\/／]\s*$/, "").trim();
    if (hasCJK(n)) n = n.replace(/\s+/g, "");
    return n;
  }
  const nameKey = (s) => cleanAuthor(s).replace(/\s+/g, "").toLowerCase();

  // 作品名の正規化：文庫版・単行本・新装版などを同一作品として扱う
  function titleKey(s) {
    let t = String(s || "").normalize("NFKC").toLowerCase();
    t = t.replace(/[\(（〈《【\[][^\)）〉》】\]]*[\)）〉》】\]]/g, "");
    t = t.replace(/(新装版|新装改訂版|完全版|決定版|愛蔵版|普及版|改訂版|文庫版|単行本|ワイド版|上製|特装版|限定版)/g, "");
    t = t.replace(/[\s　・:：\-－―‐~〜!！?？、。,.「」『』"'“”]/g, "");
    t = t.replace(/(上|中|下|前編|後編|[0-9]+)巻?$/, "");
    return t;
  }

  // ISBN
  function isbn10to13(i10) {
    if (!/^\d{9}[\dX]$/i.test(i10 || "")) return "";
    const b = "978" + i10.slice(0, 9);
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += +b[i] * (i % 2 ? 3 : 1);
    return b + ((10 - (sum % 10)) % 10);
  }
  function isIsbn13(s) {
    if (!/^97[89]\d{10}$/.test(s)) return false;
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += +s[i] * (i % 2 ? 3 : 1);
    return (10 - (sum % 10)) % 10 === +s[12];
  }
  function normalizeIsbnInput(s) {
    const d = String(s).normalize("NFKC").replace(/[^0-9Xx]/g, "").toUpperCase();
    if (d.length === 13 && isIsbn13(d)) return d;
    if (d.length === 10) return isbn10to13(d);
    return "";
  }

  // 日付 "2023" / "2023-04" / "20230415" → "2023-04-15" 形式に揃える
  function normDate(s) {
    s = String(s || "").replace(/[^0-9-]/g, "");
    if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}`;
    if (/^\d{6}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}`;
    return s;
  }
  const dateSortKey = (s) => { const d = normDate(s); return d.length === 4 ? d + "-00-00" : d.length === 7 ? d + "-00" : d; };

  // ===================================================================
  // 外部API（Google Books / openBD / 国立国会図書館の書影 / カーリル）
  // ===================================================================
  const API = {
    async google(params) {
      const u = new URL("https://www.googleapis.com/books/v1/volumes");
      Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
      if (data.settings.googleKey) u.searchParams.set("key", data.settings.googleKey);
      const r = await fetch(u);
      if (r.status === 429) throw new Error("Google Books の利用上限に達しました。しばらく待つか、設定でAPIキーを登録してください。");
      if (!r.ok) throw new Error(`検索に失敗しました（${r.status}）`);
      return r.json();
    },

    async search(q) {
      const j = await API.google({ q, maxResults: 30, printType: "books", langRestrict: "ja" });
      return (j.items || []).map(fromGoogle).filter((b) => b.title);
    },

    async byIsbn(isbn) {
      const fromBd = await API.openbd(isbn).catch(() => null);
      if (fromBd) return fromBd;
      const j = await API.google({ q: "isbn:" + isbn });
      const items = (j.items || []).map(fromGoogle);
      if (items[0]) { items[0].isbn = isbn; items[0].id = isbn; }
      return items[0] || null;
    },

    // 国立国会図書館サーチから日本十進分類（NDC）を取得
    async ndc(isbn) {
      const r = await fetch("https://ndlsearch.ndl.go.jp/api/opensearch?cnt=1&isbn=" + isbn);
      if (!r.ok) return "";
      const xml = new DOMParser().parseFromString(await r.text(), "application/xml");
      const subs = [...xml.getElementsByTagName("dc:subject")];
      const ndc = subs.find((x) => /NDC/.test(x.getAttribute("xsi:type") || ""));
      return ndc ? ndc.textContent.trim() : "";
    },

    async googleCategories(id) {
      const u = new URL("https://www.googleapis.com/books/v1/volumes/" + encodeURIComponent(id));
      if (data.settings.googleKey) u.searchParams.set("key", data.settings.googleKey);
      const r = await fetch(u);
      if (!r.ok) return "";
      const j = await r.json();
      return ((j.volumeInfo && j.volumeInfo.categories) || []).join(" ");
    },

    async openbd(isbn) {
      const r = await fetch("https://api.openbd.jp/v1/get?isbn=" + isbn);
      if (!r.ok) return null;
      const [rec] = await r.json();
      return rec ? fromOpenBD(rec) : null;
    },

    // 作家の作品一覧（文庫・単行本は同一作品にまとめる）
    async authorWorks(name, force = false) {
      const key = nameKey(name);
      const cached = data.authorCache[key];
      if (!force && cached && Date.now() - cached.fetchedAt < 24 * 3600e3) return cached.works;
      const seen = new Map();
      for (const startIndex of [0, 40, 80]) {
        const j = await API.google({ q: `inauthor:"${name}"`, maxResults: 40, startIndex, printType: "books", orderBy: "newest" });
        const items = (j.items || []).map(fromGoogle).filter((b) => b.authors.some((a) => nameKey(a) === key));
        for (const b of items) {
          const k = titleKey(b.title);
          if (!k) continue;
          const prev = seen.get(k);
          if (!prev) seen.set(k, { key: k, title: b.title, date: b.publishedDate, latest: b.publishedDate, isbn: b.isbn, thumbnail: b.thumbnail, publisher: b.publisher, book: b });
          else {
            // 最初に出た日付（初出）と最新の版の日付を両方持つ
            if (dateSortKey(b.publishedDate) < dateSortKey(prev.date)) prev.date = b.publishedDate;
            if (dateSortKey(b.publishedDate) > dateSortKey(prev.latest)) { prev.latest = b.publishedDate; prev.book = b; prev.isbn = b.isbn || prev.isbn; }
            if (!prev.thumbnail && b.thumbnail) prev.thumbnail = b.thumbnail;
          }
        }
        if (!j.items || j.items.length < 40) break;
      }
      const works = [...seen.values()].sort((a, b) => dateSortKey(b.date).localeCompare(dateSortKey(a.date)));
      data.authorCache[key] = { fetchedAt: Date.now(), works };
      save();
      return works;
    },
  };

  function fromGoogle(item) {
    const v = item.volumeInfo || {};
    const ids = v.industryIdentifiers || [];
    const i13 = (ids.find((i) => i.type === "ISBN_13") || {}).identifier;
    const i10 = (ids.find((i) => i.type === "ISBN_10") || {}).identifier;
    const isbn = i13 || isbn10to13(i10) || "";
    const img = v.imageLinks ? v.imageLinks.thumbnail || v.imageLinks.smallThumbnail || "" : "";
    return {
      id: isbn || "g:" + item.id,
      isbn,
      googleId: item.id,
      title: (v.title || "").normalize("NFKC"),
      subtitle: v.subtitle || "",
      authors: (v.authors || []).map(cleanAuthor).filter(Boolean),
      publisher: v.publisher || "",
      publishedDate: normDate(v.publishedDate),
      thumbnail: img.replace(/^http:/, "https:"),
      description: v.description || "",
      pageCount: v.pageCount || 0,
      genre: guessGenreFromText((v.categories || []).join(" ")),
    };
  }

  function fromOpenBD(rec) {
    const s = rec.summary || {};
    const onix = rec.onix || {};
    const subjects = (onix.DescriptiveDetail && onix.DescriptiveDetail.Subject) || [];
    const ccode = (subjects.find((x) => x.SubjectSchemeIdentifier === "78") || {}).SubjectCode || "";
    const texts = (onix.CollateralDetail && onix.CollateralDetail.TextContent) || [];
    const desc = (texts.find((t) => t.TextType === "03") || texts[0] || {}).Text || "";
    const extent = (onix.DescriptiveDetail && onix.DescriptiveDetail.Extent) || [];
    const authors = parseOpenbdAuthors(onix, s.author);
    return {
      id: s.isbn,
      isbn: s.isbn,
      title: [s.title, s.volume].filter(Boolean).join(" ").normalize("NFKC"),
      subtitle: "",
      authors,
      publisher: s.publisher || "",
      publishedDate: normDate(s.pubdate),
      thumbnail: s.cover || "",
      description: desc,
      pageCount: +((extent[0] || {}).ExtentValue || 0),
      genre: genreFromCcode(ccode),
      series: s.series || "",
    };
  }

  // openBDの著者：ONIXの著者情報を優先し、なければ「東野 圭吾／著」形式の文字列を役割ごとに区切る
  function parseOpenbdAuthors(onix, text) {
    const contribs = (onix.DescriptiveDetail && onix.DescriptiveDetail.Contributor) || [];
    const fromOnix = contribs
      .filter((c) => !c.ContributorRole || c.ContributorRole.some((r) => /^A0[1-9]$/.test(r)))
      .map((c) => cleanAuthor((c.PersonName && c.PersonName.content) || ""))
      .filter(Boolean);
    if (fromOnix.length) return fromOnix;
    const str = String(text || "").normalize("NFKC");
    const parts = str.match(/[^\/]+?\/\S+/g) || [str];
    const mains = parts.filter((t) => !/\/\s*(訳|翻訳|イラスト|画|絵|写真|解説|装画)/.test(t));
    return (mains.length ? mains : parts).flatMap((t) => t.split(/[,，、]/)).map(cleanAuthor).filter(Boolean);
  }

  // Cコード（書籍の分類コード）の内容区分からジャンルを推定
  function genreFromCcode(c) {
    if (!/^\d{4}$/.test(c)) return "";
    const target = c[0], content = c.slice(2);
    if (target === "8") return "絵本・児童書";
    if (content === "93") return "日本の小説";
    if (content === "97") return "海外の小説";
    if (content === "95" || content === "98") return "エッセイ・随筆";
    if (content === "79") return "コミック";
    if (["21", "22", "23", "25"].includes(content)) return "歴史・時代";
    if (["33", "34"].includes(content)) return "ビジネス・自己啓発";
    if (/^[13]/.test(content)) return "人文・社会";
    if (/^[45]/.test(content)) return "科学・技術";
    if (/^7/.test(content)) return "趣味・実用";
    return "";
  }
  // NDC（日本十進分類）からジャンルを推定
  function genreFromNdc(n) {
    n = String(n || "").trim();
    if (!n) return "";
    if (/^726\.1/.test(n)) return "コミック";
    if (/^(E|K|726\.6)/.test(n)) return "絵本・児童書";
    if (/^913/.test(n)) return "日本の小説";
    if (/^9[2-9]3/.test(n)) return "海外の小説";
    if (/^9\d[45]/.test(n)) return "エッセイ・随筆";
    if (/^91/.test(n)) return "日本の小説";
    if (/^9/.test(n)) return "海外の小説";
    if (/^28/.test(n)) return "ノンフィクション";
    if (/^2/.test(n)) return "歴史・時代";
    if (/^(159|33[56])/.test(n)) return "ビジネス・自己啓発";
    if (/^(59|7)/.test(n)) return "趣味・実用";
    if (/^[45]/.test(n)) return "科学・技術";
    if (/^[13]/.test(n)) return "人文・社会";
    return "その他";
  }
  // 書名・あらすじのことばで小説のジャンルを細かくする
  function refineGenre(g, b) {
    const text = [b.title, b.subtitle, b.series, b.description].filter(Boolean).join(" ");
    if (!g || g === "日本の小説" || g === "海外の小説") {
      if (/ミステリ|推理|探偵|殺人事件|謎解き|本格|刑事|警察小説/.test(text)) return "ミステリー";
      if (/SF|ファンタジー|異世界|魔法|宇宙|ロボット|タイムトラベル/.test(text)) return "SF・ファンタジー";
      if (/時代小説|歴史小説|江戸|戦国|幕末|武将|藩|侍/.test(text)) return "歴史・時代";
    }
    if (!g && /小説|長編|短編|物語/.test(text)) return "日本の小説";
    return g;
  }
  // 検索後の本の分類を自動で決める
  async function autoGenre(b) {
    let g = b.genre || "";
    if (!g && b.isbn) {
      const bd = await API.openbd(b.isbn).catch(() => null);
      if (bd && bd.genre) g = bd.genre;
    }
    if (!g && b.isbn) g = genreFromNdc(await API.ndc(b.isbn).catch(() => ""));
    if (!g && b.googleId) g = guessGenreFromText(await API.googleCategories(b.googleId).catch(() => ""));
    return refineGenre(g, b) || "その他";
  }

  function guessGenreFromText(t) {
    if (!t) return "";
    if (/comic|manga/i.test(t)) return "コミック";
    if (/mystery|detective/i.test(t)) return "ミステリー";
    if (/science fiction|fantasy/i.test(t)) return "SF・ファンタジー";
    if (/juvenile/i.test(t)) return "絵本・児童書";
    if (/biography|history/i.test(t)) return "ノンフィクション";
    if (/business|economics|self-help/i.test(t)) return "ビジネス・自己啓発";
    if (/fiction/i.test(t)) return "日本の小説";
    return "";
  }

  function isbn13to10(i13) {
    if (!/^978\d{10}$/.test(i13 || "")) return "";
    const core = i13.slice(3, 12);
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += +core[i] * (10 - i);
    const c = (11 - (sum % 11)) % 11;
    return core + (c === 10 ? "X" : c);
  }
  // 表紙画像の候補。見つからなければ次を試す
  const coverUrls = (b) => {
    const i10 = isbn13to10(b.isbn);
    return [
      b.thumbnail,
      b.isbn && `https://ndlsearch.ndl.go.jp/thumbnail/${b.isbn}.jpg`,
      i10 && `https://images-na.ssl-images-amazon.com/images/P/${i10}.09.LZZZZZZZ.jpg`,
      b.isbn && `https://cover.openbd.jp/${b.isbn}.jpg`,
    ].filter(Boolean);
  };

  // カーリルAPIはJSONPで呼び出す
  function jsonp(url, timeout = 20000) {
    return new Promise((resolve, reject) => {
      const cb = "__booktive_cb" + Date.now() + Math.floor(Math.random() * 1e6);
      const s = document.createElement("script");
      const timer = setTimeout(() => { done(); reject(new Error("timeout")); }, timeout);
      function done() { clearTimeout(timer); delete window[cb]; s.remove(); }
      window[cb] = (d) => { done(); resolve(d); };
      s.onerror = () => { done(); reject(new Error("network")); };
      s.src = url + (url.includes("?") ? "&" : "?") + "callback=" + cb;
      document.head.appendChild(s);
    });
  }
  const Calil = {
    searchLibraries(pref, city) {
      const u = new URL("https://api.calil.jp/library");
      u.searchParams.set("appkey", data.settings.calilKey);
      u.searchParams.set("pref", pref);
      if (city) u.searchParams.set("city", city);
      u.searchParams.set("format", "json");
      return jsonp(u.toString());
    },
    // 蔵書・貸出状況（予約URL付き）。continue=1 の間はポーリング
    async check(isbn, systemids) {
      const base = "https://api.calil.jp/check?format=json&appkey=" + encodeURIComponent(data.settings.calilKey);
      let res = await jsonp(`${base}&isbn=${isbn}&systemid=${encodeURIComponent(systemids.join(","))}`);
      for (let i = 0; res.continue === 1 && i < 10; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        res = await jsonp(`${base}&session=${encodeURIComponent(res.session)}`);
      }
      return (res.books && res.books[isbn]) || {};
    },
  };

  // ===================================================================
  // 本棚データの操作
  // ===================================================================
  const allBooks = () => Object.values(data.books);
  const readBooks = () => allBooks().filter((b) => b.status === "read");
  const isFav = (name) => data.favAuthors.some((a) => nameKey(a.name) === nameKey(name));
  const findShelfBook = (b) => data.books[b.id] || (b.isbn && allBooks().find((x) => x.isbn === b.isbn)) || null;

  function upsertBook(b) {
    const prev = data.books[b.id] || {};
    data.books[b.id] = Object.assign({ addedAt: new Date().toISOString(), rating: 0, comment: "", readDate: "", genre: "", status: "want" }, prev, b);
    save();
  }
  function toggleFav(name) {
    const n = cleanAuthor(name);
    if (isFav(n)) data.favAuthors = data.favAuthors.filter((a) => nameKey(a.name) !== nameKey(n));
    else data.favAuthors.push({ name: n, addedAt: new Date().toISOString() });
    save();
    return isFav(n);
  }

  // 作家ごとの「読んだ作品」（作品キーで重複除去）
  function readWorkKeysByAuthor(name) {
    const key = nameKey(name);
    return new Set(readBooks().filter((b) => (b.authors || []).some((a) => nameKey(a) === key)).map((b) => titleKey(b.title)));
  }

  // ===================================================================
  // 共通UI
  // ===================================================================
  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 2800);
  }

  const hasRating = (b) => b.rating != null && +b.rating > 0;
  const starsHtml = (r) => r == null || r === "" || +r === 0
    ? `<span class="muted small">未評価</span>`
    : `<span class="stars" aria-label="評価 ${(+r).toFixed(1)}"><i style="width:${(+r / 5) * 100}%"></i></span> <span class="rating-num">${(+r).toFixed(1)}</span>`;

  const tagHtml = (status) => status ? `<span class="tag tag-${status}">${STATUS[status]}</span>` : "";

  function coverHtml(b) {
    const [url, ...alts] = coverUrls(b);
    return `<div class="cover">${url ? `<img src="${esc(url)}" data-alts="${esc(alts.join(" "))}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}<div class="ph" ${url ? 'style="z-index:-1"' : ""}>${esc(b.title).slice(0, 40)}</div></div>`;
  }
  // 1ピクセルなどの「画像なし」応答も失敗として扱う
  document.addEventListener("load", (e) => {
    const img = e.target;
    if (img.tagName === "IMG" && img.closest(".cover") && img.naturalWidth < 10) img.dispatchEvent(new Event("error"));
  }, true);
  // 画像の読み込みに失敗したら表紙の代わりにタイトル帯を出す
  document.addEventListener("error", (e) => {
    if (e.target.tagName === "IMG" && e.target.parentElement && e.target.parentElement.classList.contains("cover")) {
      const alts = (e.target.dataset.alts || "").split(" ").filter(Boolean);
      if (alts.length) { e.target.dataset.alts = alts.slice(1).join(" "); e.target.src = alts[0]; return; }
      const ph = e.target.parentElement.querySelector(".ph");
      if (ph) ph.style.zIndex = "";
      e.target.remove();
    }
  }, true);

  function bookCard(b, extra = "") {
    const shelf = findShelfBook(b);
    return `<button class="book-card" type="button" data-book="${esc(b.id)}">
      ${coverHtml(b)}
      <span class="t">${esc(b.title)}</span>
      <span class="a">${esc((b.authors || []).join("、"))}</span>
      ${shelf && shelf.status === "read" && hasRating(shelf) ? `<span class="tag-line">${starsHtml(shelf.rating)}</span>` : shelf ? `<span class="tag-line">${tagHtml(shelf.status)}</span>` : ""}
      ${extra}
    </button>`;
  }
  function bookRow(b, right = "") {
    const shelf = findShelfBook(b);
    return `<button class="book-row" type="button" data-book="${esc(b.id)}">
      ${coverHtml(b)}
      <span class="meta">
        <span class="t">${esc(b.title)}</span>
        <span class="a">${esc((b.authors || []).join("、"))}${b.publishedDate ? "・" + esc(b.publishedDate) : ""}${b.publisher ? "・" + esc(b.publisher) : ""}</span>
        ${shelf ? `<span>${tagHtml(shelf.status)} ${shelf.status === "read" ? starsHtml(shelf.rating) : ""}</span>` : ""}
      </span>
      <span>${right}</span>
    </button>`;
  }

  // 一時的に表示中の本（検索結果など）を保持して詳細シートに渡す
  const bookPool = new Map();
  const remember = (list) => { list.forEach((b) => bookPool.set(b.id, b)); return list; };

  function bindBookClicks(root) {
    root.addEventListener("click", (e) => {
      const el = e.target.closest("[data-book]");
      if (!el) return;
      const id = el.dataset.book;
      const b = data.books[id] || bookPool.get(id);
      if (b) openBook(b);
    });
  }

  // ===================================================================
  // ルーティング
  // ===================================================================
  const view = $("#view");
  const routes = { shelf: renderShelf, search: renderSearch, authors: renderAuthors, author: renderAuthor, stats: renderStats, more: renderMore };
  function route() {
    const [name, ...rest] = (location.hash.slice(1) || "shelf").split("/");
    const fn = routes[name] || renderShelf;
    const tab = name === "author" ? "authors" : (routes[name] ? name : "shelf");
    $$(".tabbar a").forEach((a) => a.dataset.tab === tab ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
    view.innerHTML = "";
    fn(rest.map(decodeURIComponent));
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);

  // ===================================================================
  // 本棚
  // ===================================================================
  const shelfState = { status: "all", group: "none", sort: "added", size: "m", q: "" };
  const SIZES = [["list", "明細"], ["s", "小"], ["m", "中"], ["l", "大"]];
  // 本の並べ方（明細／表紙の大中小）
  const shelfBooksHtml = (books) => shelfState.size === "list"
    ? `<div class="book-list">${books.map((b) => bookRow(b)).join("")}</div>`
    : `<div class="book-grid size-${shelfState.size}">${books.map((b) => bookCard(b)).join("")}</div>`;
  try { Object.assign(shelfState, JSON.parse(localStorage.getItem("booktive:shelfState") || "{}"), { q: "" }); } catch {}

  function renderShelf() {
    const now = new Date();
    const y = String(now.getFullYear()), ym = `${y}-${pad2(now.getMonth() + 1)}`;
    const reads = readBooks();
    const yearCount = reads.filter((b) => (b.readDate || "").startsWith(y)).length;
    const monthCount = reads.filter((b) => (b.readDate || "").startsWith(ym)).length;
    const wantCount = allBooks().filter((b) => b.status === "want").length;

    view.innerHTML = `
      <div class="summary" aria-label="読書のまとめ">
        <div><span>今月の読了</span><b>${monthCount}<small class="small"> 冊</small></b></div>
        <div><span>${y}年の読了</span><b>${yearCount}<small class="small"> 冊</small></b></div>
        <div><span>読みたい本</span><b>${wantCount}<small class="small"> 冊</small></b></div>
      </div>
      <section class="section">
        <div class="section-head"><h1>本棚</h1><span class="muted small num">全 ${allBooks().length} 冊</span></div>
        <div class="chips" id="statusChips">
          ${[["all", "すべて"], ["read", "読了"], ["reading", "読書中"], ["want", "読みたい"]].map(([k, l]) => `<button class="chip" type="button" data-status="${k}" aria-pressed="${shelfState.status === k}">${l}</button>`).join("")}
        </div>
        <div class="row">
          <input class="grow" type="search" id="shelfQ" placeholder="本棚の中を検索（書名・作家）" value="${esc(shelfState.q)}">
          <div class="seg" role="group" aria-label="まとめ方">
            ${[["none", "一覧"], ["author", "作家別"], ["genre", "分類別"]].map(([k, l]) => `<button type="button" data-group="${k}" aria-pressed="${shelfState.group === k}">${l}</button>`).join("")}
          </div>
          <div class="seg" role="group" aria-label="表示方法">
            ${SIZES.map(([k, l]) => `<button type="button" data-size="${k}" aria-pressed="${shelfState.size === k}">${l}</button>`).join("")}
          </div>
          <select id="shelfSort" aria-label="並び順" style="width:auto">
            <option value="added">登録順</option><option value="readDate">読了日順</option><option value="rating">評価順</option><option value="title">書名順</option>
          </select>
        </div>
        <div id="shelfList"></div>
      </section>`;
    $("#shelfSort").value = shelfState.sort;

    const persist = () => { try { localStorage.setItem("booktive:shelfState", JSON.stringify(shelfState)); } catch {} };
    $("#statusChips").addEventListener("click", (e) => {
      const b = e.target.closest("[data-status]"); if (!b) return;
      shelfState.status = b.dataset.status; persist();
      $$("#statusChips .chip").forEach((c) => c.setAttribute("aria-pressed", c === b));
      drawShelf();
    });
    $$("[data-group]").forEach((b) => b.addEventListener("click", () => {
      shelfState.group = b.dataset.group; persist();
      $$("[data-group]").forEach((x) => x.setAttribute("aria-pressed", x === b));
      drawShelf();
    }));
    $$("[data-size]").forEach((b) => b.addEventListener("click", () => {
      shelfState.size = b.dataset.size; persist();
      $$("[data-size]").forEach((x) => x.setAttribute("aria-pressed", x === b));
      drawShelf();
    }));
    $("#shelfSort").addEventListener("change", (e) => { shelfState.sort = e.target.value; persist(); drawShelf(); });
    $("#shelfQ").addEventListener("input", (e) => { shelfState.q = e.target.value; drawShelf(); });
    bindBookClicks($("#shelfList"));
    drawShelf();
  }

  function drawShelf() {
    const box = $("#shelfList");
    if (!box) return;
    let list = allBooks();
    if (!list.length) {
      box.innerHTML = `<div class="empty"><strong>まだ本が登録されていません</strong><span>書名やバーコードで本を探して、読書記録をつけましょう。</span><div class="row"><a class="btn" href="#search">本を探す</a><button class="btn btn-ghost" type="button" id="emptyScan">バーコードで登録</button></div></div>`;
      $("#emptyScan").addEventListener("click", () => startScan());
      return;
    }
    if (shelfState.status !== "all") list = list.filter((b) => b.status === shelfState.status);
    const q = shelfState.q.trim().normalize("NFKC").toLowerCase();
    if (q) list = list.filter((b) => (b.title + " " + (b.authors || []).join(" ")).normalize("NFKC").toLowerCase().includes(q));
    const sorters = {
      added: (a, b) => (b.addedAt || "").localeCompare(a.addedAt || ""),
      readDate: (a, b) => (b.readDate || "").localeCompare(a.readDate || ""),
      rating: (a, b) => (b.rating ?? -1) - (a.rating ?? -1),
      title: (a, b) => a.title.localeCompare(b.title, "ja"),
    };
    list.sort(sorters[shelfState.sort]);
    if (!list.length) { box.innerHTML = `<div class="empty">条件に合う本はありません</div>`; return; }

    if (shelfState.group === "none") {
      box.innerHTML = shelfBooksHtml(list);
      return;
    }
    const groups = new Map();
    for (const b of list) {
      const keys = shelfState.group === "author" ? (b.authors && b.authors.length ? b.authors : ["著者不明"]) : [b.genre || "未分類"];
      keys.forEach((k) => { if (!groups.has(k)) groups.set(k, []); groups.get(k).push(b); });
    }
    const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "ja"));
    box.innerHTML = ordered.map(([k, books]) => `
      <section class="section" style="margin-bottom:18px">
        <div class="group-title"><h3>${esc(k)}</h3><span class="muted small num">${books.length}冊</span>
          ${shelfState.group === "author" && k !== "著者不明" ? `<a class="small" style="margin-left:auto" href="#author/${encodeURIComponent(k)}">作家ページ →</a>` : ""}
        </div>
        ${shelfBooksHtml(books)}
      </section>`).join("");
  }

  // ===================================================================
  // 検索
  // ===================================================================
  let lastSearch = { q: "", results: [] };
  function renderSearch(args) {
    view.innerHTML = `
      <section class="section">
        <h1>本を探す</h1>
        <form class="panel" id="searchForm" autocomplete="off">
          <div class="row">
            <input class="grow" type="search" id="searchQ" placeholder="書名・作家名・ISBN" value="${esc(args[0] || lastSearch.q)}" aria-label="検索キーワード">
            <button class="btn" type="submit">検索</button>
          </div>
          <div class="row">
            <select id="searchField" aria-label="検索対象" style="width:auto">
              <option value="all">すべて</option><option value="title">書名</option><option value="author">作家名</option>
            </select>
            <button class="btn btn-ghost" type="button" id="scanBtn">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" style="fill:none;stroke:currentColor;stroke-width:1.8"><path d="M3 5v14M6 5v14M9 5v14M12 5v14M16 5v14M18 5v14M21 5v14"/></svg>
              バーコード
            </button>
          </div>
        </form>
        <div id="searchResults"></div>
      </section>`;
    $("#scanBtn").addEventListener("click", () => startScan());
    $("#searchForm").addEventListener("submit", (e) => { e.preventDefault(); doSearch($("#searchQ").value, $("#searchField").value); });
    bindBookClicks($("#searchResults"));
    if (args[0] && args[0] !== lastSearch.q) doSearch(args[0], "all");
    else if (lastSearch.results.length) drawResults(lastSearch.results);
    else $("#searchResults").innerHTML = `<p class="muted small">ISBN（978…）を入力するとその本を直接表示します。スマートフォンではバーコード読み取りも使えます。</p>`;
  }

  async function doSearch(raw, field = "all") {
    const q = raw.trim();
    if (!q) return;
    const box = $("#searchResults");
    box.innerHTML = `<div class="spinner" role="progressbar" aria-label="検索中"></div>`;
    try {
      const isbn = normalizeIsbnInput(q);
      let results;
      if (isbn && /^[\d\-\sXx]+$/.test(q)) {
        const b = await API.byIsbn(isbn);
        results = b ? [b] : [];
      } else {
        const query = field === "title" ? `intitle:${q}` : field === "author" ? `inauthor:"${q}"` : q;
        results = await API.search(query);
      }
      lastSearch = { q, results: remember(results) };
      drawResults(results);
    } catch (err) {
      box.innerHTML = `<div class="empty">${esc(err.message || "検索に失敗しました。通信状態を確認してください。")}</div>`;
    }
  }
  function drawResults(results) {
    const box = $("#searchResults");
    if (!box) return;
    box.innerHTML = results.length
      ? `<p class="muted small num">${results.length}件見つかりました。本を選ぶと記録できます。</p><div class="book-list">${results.map((b) => bookRow(b, `<span class="btn btn-sm btn-ghost">記録</span>`)).join("")}</div>`
      : `<div class="empty">見つかりませんでした。キーワードを変えてお試しください。</div>`;
  }

  // ===================================================================
  // 本の詳細・記録シート
  // ===================================================================
  const sheet = $("#sheet");
  let lastFocus = null;
  function openSheet(html) {
    lastFocus = document.activeElement;
    $("#sheetBody").innerHTML = html;
    const wasOpen = !sheet.hidden;
    sheet.hidden = false;
    $(".sheet", sheet).scrollTop = 0;
    document.body.style.overflow = "hidden";
    $(".sheet-back", sheet).focus();
    // スマホの「戻る」操作でも本の画面を閉じられるように履歴を1つ積む
    if (!wasOpen) history.pushState({ sheet: true }, "");
  }
  // then: 閉じたあとに行う処理（画面の移動など）
  function closeSheet(then) {
    if (sheet.hidden) { if (then) then(); return; }
    sheet.hidden = true;
    document.body.style.overflow = "";
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    if (history.state && history.state.sheet) {
      if (then) window.addEventListener("popstate", () => then(), { once: true });
      history.back();
    } else if (then) then();
  }
  window.addEventListener("popstate", () => {
    if (!sheet.hidden) { sheet.hidden = true; document.body.style.overflow = ""; }
  });
  sheet.addEventListener("click", (e) => { if (e.target === sheet || e.target.closest("[data-close]")) closeSheet(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !sheet.hidden) closeSheet(); });

  function openBook(src) {
    const saved = findShelfBook(src);
    const b = Object.assign({}, src, saved || {});
    const awards = awardsFor(b);
    const ratingVal = b.rating == null ? 0 : +b.rating;
    openSheet(`
      <div class="detail-head">
        ${coverHtml(b)}
        <div class="meta">
          ${tagHtml(saved && saved.status)} ${awards.map((a) => `<span class="tag tag-award">${esc(a)}</span>`).join(" ")}
          <h2 id="sheetTitle">${esc(b.title)}</h2>
          ${b.subtitle ? `<span class="muted small">${esc(b.subtitle)}</span>` : ""}
          <div class="author-links">${(b.authors || []).map((a) => `<button type="button" class="author-link ${isFav(a) ? "fav" : ""}" data-author="${esc(a)}">${esc(a)}</button>`).join("")}</div>
          <span class="muted small">${[b.publisher, b.publishedDate, b.pageCount ? b.pageCount + "ページ" : "", b.isbn ? "ISBN " + b.isbn : ""].filter(Boolean).map(esc).join("・")}</span>
        </div>
      </div>
      ${b.description ? `<div class="desc">${esc(b.description)}</div>` : ""}

      <form class="panel" id="recordForm">
        <h3>読書記録</h3>
        <div class="chips" id="statusPick" role="group" aria-label="状態">
          ${Object.entries(STATUS).map(([k, l]) => `<button class="chip" type="button" data-st="${k}" aria-pressed="${(saved ? saved.status : "") === k}">${l}</button>`).join("")}
        </div>
        <div class="two">
          <label class="field"><span>読了日</span><input type="date" id="readDate" value="${esc(b.readDate || "")}"></label>
          <label class="field"><span>分類</span>
            <select id="genre"><option value="">未分類</option>${GENRES.map((g) => `<option ${b.genre === g ? "selected" : ""}>${esc(g)}</option>`).join("")}</select>
          </label>
        </div>
        <div class="rating-box">
          <span class="field" style="font-weight:700;color:var(--ink-soft);font-size:1rem">評価（0.0〜5.0　0.0は評価なし）</span>
          <div class="row"><span class="stars" id="ratingStars"><i style="width:${(ratingVal / 5) * 100}%"></i></span><output class="rating-num" id="ratingOut" style="font-size:1.4rem">${(+ratingVal).toFixed(1)}</output></div>
          <input type="range" id="rating" min="0" max="5" step="0.1" value="${ratingVal}" aria-label="評価">
        </div>
        <label class="field"><span>感想・コメント</span><textarea id="comment" placeholder="印象に残った場面、ひとことメモなど">${esc(b.comment || "")}</textarea></label>
        <div class="row">
          <button class="btn" type="submit">${saved ? "更新" : "本棚に登録"}</button>
          ${saved ? `<button class="btn btn-danger" type="button" id="delBook">本棚から削除</button>` : ""}
        </div>
      </form>

      <section class="panel">
        <div class="row" style="justify-content:space-between"><h3>図書館で借りる</h3>
          ${b.isbn ? `<a class="small" href="https://calil.jp/book/${esc(b.isbn)}" target="_blank" rel="noopener">カーリルで見る ↗</a>` : ""}
        </div>
        <div id="libBox">${libBoxHtml(b)}</div>
      </section>`);

    let status = saved ? saved.status : "";
    const genreSel = $("#genre");
    if (!b.genre) {
      genreSel.insertAdjacentHTML("afterbegin", `<option value="" selected>分類を調べています…</option>`);
      genreSel.value = "";
      let touched = false;
      genreSel.addEventListener("change", () => (touched = true));
      autoGenre(b).then((g) => {
        if (!touched && genreSel.isConnected) { genreSel.firstElementChild.remove(); genreSel.value = g; }
      });
    }
    const form = $("#recordForm");
    $("#statusPick").addEventListener("click", (e) => {
      const c = e.target.closest("[data-st]"); if (!c) return;
      status = c.dataset.st;
      $$("#statusPick .chip").forEach((x) => x.setAttribute("aria-pressed", x === c));
      if (status === "read" && !$("#readDate").value) $("#readDate").value = today();
    });
    const range = $("#rating");
    const syncRating = () => {
      $("#ratingOut").textContent = (+range.value).toFixed(1);
      $("#ratingStars i").style.width = (range.value / 5) * 100 + "%";
    };
    range.addEventListener("input", syncRating);

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!status) status = $("#readDate").value ? "read" : "want";
      const rec = Object.assign({}, b, {
        status,
        readDate: $("#readDate").value,
        genre: $("#genre").value,
        rating: Math.round(+range.value * 10) / 10,
        comment: $("#comment").value.trim(),
      });
      if (rec.status === "read" && !rec.readDate) rec.readDate = today();
      upsertBook(rec);
      toast(saved ? "更新しました" : `「${rec.title}」を${STATUS[rec.status]}に登録しました`);
      closeSheet(route);
    });
    const del = $("#delBook");
    if (del) del.addEventListener("click", () => {
      if (del.dataset.confirm) { delete data.books[saved.id]; save(); toast("本棚から削除しました"); closeSheet(route); }
      else { del.dataset.confirm = "1"; del.textContent = "もう一度押すと削除します"; }
    });
    $$("[data-author]", sheet).forEach((el) => el.addEventListener("click", () => closeSheet(() => { location.hash = "#author/" + encodeURIComponent(el.dataset.author); })));
    const chk = $("#libCheck");
    if (chk) chk.addEventListener("click", () => runLibCheck(b));
  }

  function libBoxHtml(b) {
    if (!b.isbn) return `<p class="muted small">ISBNが分からない本のため、蔵書確認ができません。</p>`;
    if (!data.settings.calilKey) return `<p class="muted small">カーリルのアプリケーションキーを「図書館・賞」→「設定」に登録すると、よく行く図書館の貸出状況の確認と予約ページへの移動ができます。</p>`;
    if (!data.libraries.length) return `<p class="muted small">よく行く図書館が未登録です。<a href="#more">図書館を登録する</a></p>`;
    return `<button class="btn btn-ghost" type="button" id="libCheck">登録した図書館の蔵書を確認</button><div class="lib-result" id="libResult"></div>`;
  }

  async function runLibCheck(b) {
    const out = $("#libResult");
    const btn = $("#libCheck");
    btn.disabled = true;
    out.innerHTML = `<div class="spinner" role="progressbar" aria-label="確認中"></div>`;
    try {
      const systems = [...new Set(data.libraries.map((l) => l.systemid))];
      const res = await Calil.check(b.isbn, systems);
      out.innerHTML = systems.map((sid) => {
        const r = res[sid] || {};
        const lib = data.libraries.find((l) => l.systemid === sid);
        const mine = data.libraries.filter((l) => l.systemid === sid).map((l) => l.libkey);
        const entries = Object.entries(r.libkey || {});
        const shown = entries.filter(([k]) => mine.includes(k));
        const list = (shown.length ? shown : entries);
        const statusLine = r.status === "Error" ? `<span class="st-ng">確認できませんでした</span>`
          : !entries.length ? `<span class="muted">所蔵なし</span>`
          : list.map(([k, v]) => `${esc(k)}：<span class="${v === "貸出可" || v === "蔵書あり" || v === "館内のみ" ? "st-ok" : "st-ng"}">${esc(v)}</span>`).join("　");
        return `<div class="lib"><div><strong>${esc(lib ? lib.systemname : sid)}</strong><br><span class="small">${statusLine}</span></div>
          ${r.reserveurl ? `<a class="btn btn-sm" href="${esc(r.reserveurl)}" target="_blank" rel="noopener">予約ページへ ↗</a>` : ""}</div>`;
      }).join("");
    } catch {
      out.innerHTML = `<p class="st-ng small">図書館の情報を取得できませんでした。アプリケーションキーと通信状態を確認してください。</p>`;
    } finally {
      btn.disabled = false;
    }
  }

  // ===================================================================
  // バーコード読み取り
  // ===================================================================
  const scanner = $("#scanner");
  let scanStop = null;
  async function startScan() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast("この端末ではカメラが使えません。ISBNを入力して検索してください。");
      return;
    }
    scanner.hidden = false;
    const video = $("#scanVideo");
    const found = (code) => {
      const isbn = normalizeIsbnInput(code);
      if (!isbn) { $("#scanHint").textContent = "ISBNのバーコード（978/979で始まる上段）を読み取ってください"; return false; }
      stopScan();
      if (navigator.vibrate) navigator.vibrate(60);
      location.hash = "#search/" + isbn;
      if (location.hash === "#search/" + isbn) { lastSearch.q = ""; route(); }
      return true;
    };
    try {
      if ("BarcodeDetector" in window && (await BarcodeDetector.getSupportedFormats()).includes("ean_13")) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        video.srcObject = stream;
        await video.play();
        const det = new BarcodeDetector({ formats: ["ean_13"] });
        let alive = true;
        scanStop = () => { alive = false; stream.getTracks().forEach((t) => t.stop()); video.srcObject = null; };
        const tick = async () => {
          if (!alive) return;
          try {
            const codes = await det.detect(video);
            for (const c of codes) if (found(c.rawValue)) return;
          } catch {}
          setTimeout(tick, 180);
        };
        tick();
      } else {
        await loadZXing();
        const hints = new Map([[ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.EAN_13]]]);
        const reader = new ZXing.BrowserMultiFormatReader(hints);
        scanStop = () => reader.reset();
        await reader.decodeFromConstraints({ video: { facingMode: "environment" } }, video, (result) => { if (result) found(result.getText()); });
      }
    } catch (err) {
      stopScan();
      toast(err && err.name === "NotAllowedError" ? "カメラの使用が許可されていません" : "カメラを起動できませんでした");
    }
  }
  function stopScan() {
    if (scanStop) { try { scanStop(); } catch {} scanStop = null; }
    scanner.hidden = true;
    $("#scanHint").textContent = "本の裏表紙にある「978」または「979」で始まるバーコードを枠に合わせてください";
  }
  function loadZXing() {
    if (window.ZXing) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js";
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  $("#scanCancel").addEventListener("click", stopScan);
  $("#scanTopBtn").addEventListener("click", () => startScan());

  // ===================================================================
  // 作家
  // ===================================================================
  function renderAuthors() {
    // 本棚に登場する作家（読了冊数つき）
    const counts = new Map();
    readBooks().forEach((b) => (b.authors || []).forEach((a) => counts.set(a, (counts.get(a) || 0) + 1)));
    const shelfAuthors = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);

    view.innerHTML = `
      <section class="section">
        <div class="section-head"><h1>好きな作家</h1><span class="muted small num">${data.favAuthors.length}人</span></div>
        <form class="row" id="favForm" autocomplete="off">
          <input class="grow" type="text" id="favName" placeholder="作家名を入力（例：東野圭吾）" aria-label="作家名">
          <button class="btn" type="submit">登録</button>
        </form>
        <div id="favList" style="display:grid;gap:10px">
          ${data.favAuthors.length ? data.favAuthors.map((a) => authorCardHtml(a.name)).join("") : `<div class="empty">好きな作家を登録すると、新刊のお知らせと読破率が表示されます。</div>`}
        </div>
      </section>
      <section class="section">
        <div class="section-head"><h2>好きな作家の新刊</h2><button class="btn btn-sm btn-plain" type="button" id="refreshNew">最新の情報に更新</button></div>
        <div id="newReleases">${data.favAuthors.length ? `<div class="spinner" role="progressbar" aria-label="読み込み中"></div>` : `<p class="muted small">作家を登録するとここに新刊が並びます。</p>`}</div>
      </section>
      ${shelfAuthors.length ? `<section class="section">
        <h2>よく読んでいる作家</h2>
        <div class="chips">${shelfAuthors.map(([n, c]) => `<a class="chip" href="#author/${encodeURIComponent(n)}" style="text-decoration:none;color:inherit">${esc(n)} <span class="muted num">${c}</span></a>`).join("")}</div>
      </section>` : ""}`;

    $("#favForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const n = cleanAuthor($("#favName").value);
      if (!n) return;
      if (!isFav(n)) toggleFav(n);
      toast(`${n}さんを好きな作家に登録しました`);
      renderAuthorsAgain();
    });
    $("#favList").addEventListener("click", (e) => { const c = e.target.closest("[data-goauthor]"); if (c) location.hash = "#author/" + encodeURIComponent(c.dataset.goauthor); });
    $("#refreshNew").addEventListener("click", () => loadNewReleases(true));
    bindBookClicks($("#newReleases"));
    if (data.favAuthors.length) loadNewReleases(false);
  }
  const renderAuthorsAgain = () => { view.innerHTML = ""; renderAuthors(); };

  function authorCardHtml(name) {
    const cache = data.authorCache[nameKey(name)];
    const readKeys = readWorkKeysByAuthor(name);
    let line = `<span class="muted small num">読了 ${readKeys.size} 作品</span>`;
    let pct = null;
    if (cache) {
      const total = new Set([...cache.works.map((w) => w.key), ...readKeys]).size;
      pct = total ? Math.round((readKeys.size / total) * 100) : 0;
      line = `<span class="small num"><b>${readKeys.size}</b> / ${total} 作品　<b>${pct}%</b></span>`;
    }
    return `<button class="author-card" type="button" data-goauthor="${esc(name)}">
      <span class="name">${esc(name)}</span>${line}
      ${pct != null ? `<div class="progress" aria-hidden="true"><i style="width:${pct}%"></i></div>` : ""}
    </button>`;
  }

  async function loadNewReleases(force) {
    const box = $("#newReleases");
    if (!box || !data.favAuthors.length) return;
    box.innerHTML = `<div class="spinner" role="progressbar" aria-label="読み込み中"></div>`;
    const border = new Date(Date.now() - 180 * 24 * 3600e3);
    const borderKey = `${border.getFullYear()}-${pad2(border.getMonth() + 1)}-${pad2(border.getDate())}`;
    const items = [];
    const errors = [];
    for (const a of data.favAuthors) {
      try {
        const works = await API.authorWorks(a.name, force);
        works.filter((w) => dateSortKey(w.latest || w.date) >= borderKey).forEach((w) => items.push(Object.assign({}, w.book, { _date: w.latest || w.date })));
      } catch (err) {
        errors.push(a.name);
      }
    }
    if (!$("#newReleases")) return;
    $("#favList").innerHTML = data.favAuthors.map((a) => authorCardHtml(a.name)).join("");
    items.sort((a, b) => dateSortKey(b._date).localeCompare(dateSortKey(a._date)));
    remember(items);
    box.innerHTML = (items.length
      ? `<p class="muted small">直近6か月以内に発売された本（予約受付中を含む）</p><div class="book-list">${items.map((b) => bookRow(b, dateSortKey(b._date) > today() ? `<span class="tag tag-reading">予約受付</span>` : "")).join("")}</div>`
      : `<p class="muted small">直近6か月以内の新刊は見つかりませんでした。</p>`)
      + (errors.length ? `<p class="st-ng small">${errors.map(esc).join("、")} の情報を取得できませんでした。</p>` : "");
  }

  function renderAuthor([name]) {
    name = cleanAuthor(name || "");
    if (!name) { location.hash = "#authors"; return; }
    const fav = isFav(name);
    const myBooks = allBooks().filter((b) => (b.authors || []).some((a) => nameKey(a) === nameKey(name)));
    const ratings = myBooks.filter((b) => b.status === "read" && hasRating(b)).map((b) => b.rating);
    view.innerHTML = `
      <section class="section">
        <a class="small" href="#authors">← 作家一覧</a>
        <div class="section-head">
          <h1>${esc(name)}</h1>
          <button class="btn ${fav ? "btn-ghost" : ""}" type="button" id="favToggle">${fav ? "★ 好きな作家に登録済み" : "☆ 好きな作家に登録"}</button>
        </div>
        <div class="panel">
          <div id="completion"><div class="spinner" role="progressbar" aria-label="読み込み中"></div></div>
          <dl class="kv">
            <dt>本棚の冊数</dt><dd>${myBooks.length}冊</dd>
            <dt>読了</dt><dd>${myBooks.filter((b) => b.status === "read").length}冊</dd>
            <dt>平均評価</dt><dd>${ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2) : "—"}</dd>
          </dl>
        </div>
      </section>
      <section class="section">
        <div class="section-head"><h2>作品一覧</h2><div class="seg" role="group" aria-label="絞り込み"><button type="button" data-f="all" aria-pressed="true">すべて</button><button type="button" data-f="unread" aria-pressed="false">未読のみ</button></div></div>
        <p class="muted small">文庫本と単行本は同じ作品として1つにまとめています。</p>
        <div id="works"></div>
      </section>`;
    $("#favToggle").addEventListener("click", () => { const on = toggleFav(name); toast(on ? "好きな作家に登録しました" : "登録を解除しました"); route(); });
    bindBookClicks($("#works"));

    let works = [];
    let filter = "all";
    const draw = () => {
      const readKeys = readWorkKeysByAuthor(name);
      const merged = [...works];
      // ネット上に見つからない本棚の本も作品として加える
      myBooks.forEach((b) => { const k = titleKey(b.title); if (!merged.some((w) => w.key === k)) merged.push({ key: k, title: b.title, date: b.publishedDate, book: b }); });
      const total = merged.length;
      const done = merged.filter((w) => readKeys.has(w.key)).length;
      const pct = total ? Math.round((done / total) * 100) : 0;
      $("#completion").innerHTML = `
        <div class="row" style="justify-content:space-between;align-items:baseline">
          <span><b style="font:800 2rem/1 var(--f-display)" class="num">${pct}%</b> <span class="muted small">読破率</span></span>
          <span class="num"><b>${done}</b> / ${total} 作品</span>
        </div>
        <div class="progress" style="margin-top:8px"><i style="width:${pct}%"></i></div>
        <p class="muted small" style="margin:6px 0 0">作品数は Google Books に登録された書籍から算出した目安です。</p>`;
      const list = merged.filter((w) => filter === "all" || !readKeys.has(w.key));
      remember(list.map((w) => w.book).filter(Boolean));
      $("#works").innerHTML = list.length
        ? `<div class="book-list">${list.map((w) => bookRow(Object.assign({}, w.book, { publishedDate: w.date }), readKeys.has(w.key) ? `<span class="read-mark">✓ 読了</span>` : "")).join("")}</div>`
        : `<div class="empty">${filter === "unread" ? "未読の作品はありません。読破おめでとうございます！" : "作品が見つかりませんでした"}</div>`;
    };
    $$("[data-f]").forEach((b) => b.addEventListener("click", () => { filter = b.dataset.f; $$("[data-f]").forEach((x) => x.setAttribute("aria-pressed", x === b)); draw(); }));
    API.authorWorks(name).then((w) => { works = w; if ($("#works")) draw(); }).catch((err) => {
      if (!$("#works")) return;
      draw();
      $("#completion").insertAdjacentHTML("beforeend", `<p class="st-ng small">${esc(err.message || "作品情報を取得できませんでした")}（本棚の本のみ表示中）</p>`);
    });
  }

  // ===================================================================
  // 読書記録（年間・月間）
  // ===================================================================
  let statsYear = new Date().getFullYear();
  function renderStats() {
    const reads = readBooks().filter((b) => b.readDate);
    const years = [...new Set(reads.map((b) => +b.readDate.slice(0, 4)).concat(new Date().getFullYear()))].sort((a, b) => b - a);
    if (!years.includes(statsYear)) statsYear = years[0];
    const ys = String(statsYear);
    const inYear = reads.filter((b) => b.readDate.startsWith(ys));
    const months = Array.from({ length: 12 }, (_, i) => inYear.filter((b) => b.readDate.slice(5, 7) === pad2(i + 1)));
    const max = Math.max(4, ...months.map((m) => m.length));
    const now = new Date();
    const curMonth = now.getFullYear() === statsYear ? now.getMonth() : -1;
    const rated = inYear.filter(hasRating);
    const pages = inYear.reduce((s, b) => s + (b.pageCount || 0), 0);
    const best = [...rated].sort((a, b) => b.rating - a.rating).slice(0, 5);
    const genreCounts = {};
    inYear.forEach((b) => { const g = b.genre || "未分類"; genreCounts[g] = (genreCounts[g] || 0) + 1; });
    const authorCounts = {};
    inYear.forEach((b) => (b.authors || []).forEach((a) => (authorCounts[a] = (authorCounts[a] || 0) + 1)));
    const topAuthors = Object.entries(authorCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const yearly = years.map((y) => [y, reads.filter((b) => b.readDate.startsWith(String(y))).length]);

    view.innerHTML = `
      <section class="section">
        <div class="section-head">
          <h1>読書記録</h1>
          <select id="yearSel" aria-label="年" style="width:auto">${years.map((y) => `<option value="${y}" ${y === statsYear ? "selected" : ""}>${y}年</option>`).join("")}</select>
        </div>
        <div class="summary">
          <div><span>${statsYear}年の読了</span><b>${inYear.length}<small class="small"> 冊</small></b></div>
          <div><span>平均評価</span><b>${rated.length ? (rated.reduce((s, b) => s + b.rating, 0) / rated.length).toFixed(2) : "—"}</b></div>
          <div><span>読んだページ</span><b>${pages.toLocaleString()}</b></div>
        </div>
        <div class="panel">
          <h3>月別の読了冊数</h3>
          <div class="bars" role="img" aria-label="${statsYear}年の月別読了冊数">
            ${months.map((m, i) => `<div class="bar ${m.length ? "" : "zero"} ${i === curMonth ? "now" : ""}" style="height:${(m.length / max) * 100}%" title="${i + 1}月 ${m.length}冊">${m.length ? `<b>${m.length}</b>` : ""}</div>`).join("")}
          </div>
          <div class="bar-labels">${months.map((_, i) => `<span>${i + 1}</span>`).join("")}</div>
        </div>
      </section>

      <section class="section">
        <h2>月ごとの本</h2>
        <div id="monthBooks" style="display:grid;gap:14px">
          ${months.map((m, i) => ({ m, i })).filter(({ m }) => m.length).reverse().map(({ m, i }) => `
            <details class="panel" ${i === curMonth || (curMonth < 0 && i === 11) ? "open" : ""}>
              <summary><strong>${i + 1}月</strong> <span class="muted small num">${m.length}冊</span></summary>
              <div class="book-grid" style="margin-top:12px">${m.sort((a, b) => a.readDate.localeCompare(b.readDate)).map((b) => bookCard(b)).join("")}</div>
            </details>`).join("") || `<div class="empty">${statsYear}年の読了記録はまだありません。</div>`}
        </div>
      </section>

      ${inYear.length ? `<section class="section">
        <div class="two">
          <div class="panel"><h3>分類の内訳</h3>
            ${Object.entries(genreCounts).sort((a, b) => b[1] - a[1]).map(([g, c]) => `<div class="hbar"><span>${esc(g)}</span><div class="progress"><i style="width:${(c / inYear.length) * 100}%"></i></div><span class="num">${c}冊</span></div>`).join("")}
          </div>
          <div class="panel"><h3>よく読んだ作家</h3>
            <dl class="kv">${topAuthors.map(([a, c]) => `<dt><a href="#author/${encodeURIComponent(a)}">${esc(a)}</a></dt><dd>${c}冊</dd>`).join("")}</dl>
          </div>
        </div>
      </section>` : ""}

      ${best.length ? `<section class="section"><h2>${statsYear}年の高評価</h2><div class="book-list">${best.map((b) => bookRow(b)).join("")}</div></section>` : ""}

      <section class="section">
        <h2>年ごとの読了冊数</h2>
        <div class="panel"><dl class="kv">${yearly.map(([y, c]) => `<dt>${y}年</dt><dd>${c}冊</dd>`).join("")}</dl></div>
      </section>`;
    $("#yearSel").addEventListener("change", (e) => { statsYear = +e.target.value; route(); });
    bindBookClicks(view);
  }

  // ===================================================================
  // 図書館・賞・設定
  // ===================================================================
  function awardsFor(b) {
    const keys = new Set([titleKey(b.title)]);
    const out = [];
    for (const r of window.BOOKTIVE_AWARDS || []) {
      for (const [award, label] of [["akutagawa", "芥川賞"], ["naoki", "直木賞"]]) {
        for (const [author, title] of r[award]) {
          if (keys.has(titleKey(title)) && (b.authors || []).some((a) => nameKey(a) === nameKey(author))) out.push(`第${r.no}回${label}`);
        }
      }
    }
    return out;
  }

  let awardFilter = "both";
  function renderMore() {
    view.innerHTML = `
      <section class="section" id="libs">
        <div class="section-head"><h1>よく行く図書館</h1><span class="muted small num">${data.libraries.length}館</span></div>
        <div id="myLibs" style="display:grid;gap:8px"></div>
        <form class="panel" id="libForm" autocomplete="off">
          <h3>図書館を探して登録</h3>
          ${data.settings.calilKey ? "" : `<p class="st-ng small" style="margin:0">図書館の検索・予約連携には、下の「設定」でカーリルのアプリケーションキーを登録してください。</p>`}
          <div class="two">
            <label class="field"><span>都道府県</span><select id="libPref">${PREFS.map((p) => `<option ${p === "東京都" ? "selected" : ""}>${p}</option>`).join("")}</select></label>
            <label class="field"><span>市区町村（任意）</span><input type="text" id="libCity" placeholder="例：世田谷区"></label>
          </div>
          <div><button class="btn" type="submit" ${data.settings.calilKey ? "" : "disabled"}>図書館を検索</button></div>
          <div id="libSearchResult" class="lib-result"></div>
        </form>
      </section>

      <section class="section" id="awards">
        <div class="section-head"><h2>芥川賞・直木賞 受賞作</h2>
          <div class="seg" role="group" aria-label="賞の絞り込み">
            ${[["both", "両方"], ["akutagawa", "芥川賞"], ["naoki", "直木賞"]].map(([k, l]) => `<button type="button" data-aw="${k}" aria-pressed="${awardFilter === k}">${l}</button>`).join("")}
          </div>
        </div>
        <input type="search" id="awardQ" placeholder="作家名・作品名で絞り込み" aria-label="受賞作の絞り込み">
        <p class="muted small" style="margin:0">作品名を押すと検索して本棚に登録できます。<span class="read-mark">✓</span> は読了済みの作品です。</p>
        <div id="awardTable"></div>
      </section>

      <section class="section" id="settings">
        <h2>設定</h2>
        <form class="panel" id="settingsForm" autocomplete="off">
          <label class="field"><span>カーリル アプリケーションキー</span>
            <input type="password" id="calilKey" value="${esc(data.settings.calilKey)}" placeholder="図書館の蔵書確認・予約連携に使います">
          </label>
          <p class="muted small" style="margin:0">キーは <a href="https://calil.jp/api/dashboard/" target="_blank" rel="noopener">カーリルAPIのページ</a> で無料で発行できます。</p>
          <label class="field"><span>Google Books APIキー（任意）</span>
            <input type="password" id="googleKey" value="${esc(data.settings.googleKey)}" placeholder="検索回数が多い場合のみ">
          </label>
          <div><button class="btn" type="submit">設定を保存</button></div>
        </form>
        <div class="panel">
          <h3>データのバックアップ</h3>
          <p class="muted small" style="margin:0">記録はこの端末のブラウザに保存されています。機種変更の前にバックアップしてください。</p>
          <div class="row">
            <button class="btn btn-plain" type="button" id="exportBtn">バックアップを書き出す</button>
            <label class="btn btn-plain" for="importFile">バックアップを読み込む</label>
            <input type="file" id="importFile" accept="application/json,.json" hidden>
          </div>
        </div>
      </section>`;

    drawMyLibs();
    drawAwards();

    $("#libForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const out = $("#libSearchResult");
      out.innerHTML = `<div class="spinner" role="progressbar" aria-label="検索中"></div>`;
      try {
        const libs = await Calil.searchLibraries($("#libPref").value, $("#libCity").value.trim());
        const list = (Array.isArray(libs) ? libs : []).slice(0, 80);
        out.innerHTML = list.length ? list.map((l, i) => {
          const on = data.libraries.some((x) => x.systemid === l.systemid && x.libkey === l.libkey);
          return `<div class="lib"><div><strong>${esc(l.formal)}</strong><br><span class="muted small">${esc(l.address || "")}</span></div>
            <button class="btn btn-sm ${on ? "btn-plain" : ""}" type="button" data-addlib="${i}" ${on ? "disabled" : ""}>${on ? "登録済み" : "登録"}</button></div>`;
        }).join("") : `<p class="muted small">図書館が見つかりませんでした。市区町村名を確認してください。</p>`;
        $$("[data-addlib]", out).forEach((btn) => btn.addEventListener("click", () => {
          const l = list[+btn.dataset.addlib];
          data.libraries.push({ systemid: l.systemid, systemname: l.systemname, libkey: l.libkey, formal: l.formal, address: l.address || "" });
          save();
          btn.disabled = true; btn.textContent = "登録済み"; btn.classList.add("btn-plain");
          drawMyLibs();
          toast(`${l.formal}を登録しました`);
        }));
      } catch {
        out.innerHTML = `<p class="st-ng small">図書館を検索できませんでした。アプリケーションキーを確認してください。</p>`;
      }
    });

    $$("[data-aw]").forEach((b) => b.addEventListener("click", () => { awardFilter = b.dataset.aw; $$("[data-aw]").forEach((x) => x.setAttribute("aria-pressed", x === b)); drawAwards(); }));
    $("#awardQ").addEventListener("input", drawAwards);
    $("#awardTable").addEventListener("click", (e) => {
      const b = e.target.closest("[data-aws]");
      if (b) location.hash = "#search/" + encodeURIComponent(b.dataset.aws);
    });

    $("#settingsForm").addEventListener("submit", (e) => {
      e.preventDefault();
      data.settings.calilKey = $("#calilKey").value.trim();
      data.settings.googleKey = $("#googleKey").value.trim();
      save();
      toast("設定を保存しました");
      route();
    });
    $("#exportBtn").addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `booktive-backup-${today()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
    $("#importFile").addEventListener("change", async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const d = JSON.parse(await f.text());
        if (!d || typeof d.books !== "object") throw new Error();
        data = Object.assign(emptyData(), d);
        save();
        toast(`${Object.keys(data.books).length}冊の記録を読み込みました`);
        route();
      } catch {
        toast("バックアップファイルを読み込めませんでした");
      }
    });
  }

  function drawMyLibs() {
    const box = $("#myLibs");
    if (!box) return;
    box.innerHTML = data.libraries.length
      ? `<div class="panel lib-result">${data.libraries.map((l, i) => `<div class="lib"><div><strong>${esc(l.formal)}</strong><br><span class="muted small">${esc(l.systemname)}${l.address ? "・" + esc(l.address) : ""}</span></div><button class="btn btn-sm btn-danger" type="button" data-rmlib="${i}">解除</button></div>`).join("")}</div>`
      : `<div class="empty">よく行く図書館を登録すると、本の詳細画面から貸出状況の確認と予約ができます。</div>`;
    $$("[data-rmlib]", box).forEach((b) => b.addEventListener("click", () => { data.libraries.splice(+b.dataset.rmlib, 1); save(); drawMyLibs(); }));
  }

  function drawAwards() {
    const q = ($("#awardQ") ? $("#awardQ").value : "").trim().normalize("NFKC").toLowerCase();
    const readKeys = new Set(readBooks().map((b) => titleKey(b.title)));
    const cell = (list) => list.length
      ? list.map(([author, title]) => `<div class="award-item"><button type="button" data-aws="${esc(title + " " + author)}">『${esc(title)}』</button><span>${esc(author)}</span>${readKeys.has(titleKey(title)) ? `<span class="read-mark">✓ 読了</span>` : ""}</div>`).join("")
      : `<span class="award-none">該当作なし</span>`;
    const match = (list) => !q || list.some(([a, t]) => (a + t).normalize("NFKC").toLowerCase().includes(q));
    const rows = (window.BOOKTIVE_AWARDS || []).filter((r) => {
      if (!q) return true;
      return (awardFilter !== "naoki" && match(r.akutagawa) && r.akutagawa.length) || (awardFilter !== "akutagawa" && match(r.naoki) && r.naoki.length);
    });
    const showA = awardFilter !== "naoki", showN = awardFilter !== "akutagawa";
    // 読了数のまとめ
    const all = (window.BOOKTIVE_AWARDS || []).flatMap((r) => [...(showA ? r.akutagawa : []), ...(showN ? r.naoki : [])]);
    const readCount = all.filter(([, t]) => readKeys.has(titleKey(t))).length;
    $("#awardTable").innerHTML = `
      <p class="small num" style="margin:0 0 8px">掲載 ${all.length} 作品のうち <b>${readCount}</b> 作品を読了</p>
      <div class="award-wrap"><table class="award-table">
        <thead><tr><th>回（発表）</th>${showA ? "<th>芥川賞</th>" : ""}${showN ? "<th>直木賞</th>" : ""}</tr></thead>
        <tbody>${rows.map((r) => `<tr><td>第${r.no}回<br><span class="muted small">${r.half === "上" ? r.year + "年7月" : r.year + 1 + "年1月"}</span></td>${showA ? `<td>${cell(r.akutagawa)}</td>` : ""}${showN ? `<td>${cell(r.naoki)}</td>` : ""}</tr>`).join("") || `<tr><td colspan="3" class="muted">該当する作品はありません</td></tr>`}</tbody>
      </table></div>`;
  }

  // ===================================================================
  // 起動
  // ===================================================================
  route();
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
