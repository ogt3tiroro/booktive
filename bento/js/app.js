/* お弁当ツクール — 1週間のお弁当献立アプリ本体 */
(() => {
  "use strict";

  // ===================================================================
  // 定数
  // ===================================================================
  const STORE_KEY = "bento-tsukuru:v1";
  const CATS = { main: "主菜", side: "副菜", staple: "主食", soup: "汁物" };
  const COLORS = {
    red: { label: "赤", hex: "#e05a47" },
    yellow: { label: "黄", hex: "#f0b429" },
    green: { label: "緑", hex: "#5a9a3c" },
    brown: { label: "茶", hex: "#a8703f" },
    white: { label: "白", hex: "#e6e0d2" },
  };
  // 彩りチェックで「入っていてほしい」色
  const VIVID = ["red", "yellow", "green"];
  const WD = ["日", "月", "火", "水", "木", "金", "土"];
  const TAGS = ["作り置き", "冷凍OK", "レンジ", "汁気", "火を使わない"];
  const SLOTS = [
    { k: "staple", cat: "staple", label: "主食" },
    { k: "main", cat: "main", label: "主菜" },
    { k: "side0", cat: "side", label: "副菜1" },
    { k: "side1", cat: "side", label: "副菜2" },
    { k: "soup", cat: "soup", label: "汁物" },
  ];
  // おまかせは主菜を先に決め、主食・副菜をそれに合わせる
  const FILL_ORDER = ["main", "staple", "side0", "side1", "soup"].map((k) => SLOTS.find((s) => s.k === k));

  // 弁当箱の形。regions の k は詰める料理の枠、place は詰め方の説明に使う
  const BOXES = {
    rect: {
      name: "一段・長方形", note: "いちばん定番。ごはんとおかずが半分ずつ", vb: [320, 200],
      parts: [{ shape: "rect", x: 8, y: 8, w: 304, h: 184, r: 22, regions: [
        { k: "staple", x: 8, y: 8, w: 132, h: 184, place: "左半分" },
        { k: "main", x: 140, y: 8, w: 172, h: 96, place: "右上" },
        { k: "side0", x: 140, y: 104, w: 86, h: 88, place: "右下の左" },
        { k: "side1", x: 226, y: 104, w: 86, h: 88, place: "右下の右" },
      ] }],
    },
    two: {
      name: "二段", note: "下の段にごはん、上の段におかず", vb: [320, 214],
      parts: [
        { label: "上段（おかず）", shape: "rect", x: 8, y: 26, w: 148, h: 180, r: 18, regions: [
          { k: "main", x: 8, y: 26, w: 148, h: 92, place: "上段の上半分" },
          { k: "side0", x: 8, y: 118, w: 74, h: 88, place: "上段の左下" },
          { k: "side1", x: 82, y: 118, w: 74, h: 88, place: "上段の右下" },
        ] },
        { label: "下段（主食）", shape: "rect", x: 164, y: 26, w: 148, h: 180, r: 18, regions: [
          { k: "staple", x: 164, y: 26, w: 148, h: 180, place: "下段いっぱい" },
        ] },
      ],
    },
    round: {
      name: "丸型", note: "ごはんを半月形にして、おかずを並べる", vb: [320, 220],
      parts: [{ shape: "circle", x: 60, y: 10, w: 200, h: 200, regions: [
        { k: "staple", x: 60, y: 10, w: 92, h: 200, place: "左の半月" },
        { k: "main", x: 152, y: 10, w: 108, h: 86, place: "右上" },
        { k: "side0", x: 152, y: 96, w: 108, h: 58, place: "右のまん中" },
        { k: "side1", x: 152, y: 154, w: 108, h: 56, place: "右下" },
      ] }],
    },
    wappa: {
      name: "曲げわっぱ（楕円）", note: "ごはんを片側に寄せ、おかずを並べる", vb: [320, 200],
      parts: [{ shape: "ellipse", x: 8, y: 8, w: 304, h: 184, regions: [
        { k: "staple", x: 8, y: 8, w: 124, h: 184, place: "左側" },
        { k: "main", x: 132, y: 8, w: 96, h: 184, place: "まん中" },
        { k: "side0", x: 228, y: 8, w: 84, h: 92, place: "右上" },
        { k: "side1", x: 228, y: 100, w: 84, h: 92, place: "右下" },
      ] }],
    },
    jarset: {
      name: "弁当箱＋スープジャー", note: "汁物を温かいまま持っていける", soup: true, vb: [320, 200],
      parts: [
        { shape: "rect", x: 8, y: 8, w: 214, h: 184, r: 20, regions: [
          { k: "staple", x: 8, y: 8, w: 92, h: 184, place: "左側" },
          { k: "main", x: 100, y: 8, w: 122, h: 96, place: "右上" },
          { k: "side0", x: 100, y: 104, w: 61, h: 88, place: "右下の左" },
          { k: "side1", x: 161, y: 104, w: 61, h: 88, place: "右下の右" },
        ] },
        { label: "スープジャー", labelBelow: true, shape: "circle", x: 232, y: 56, w: 80, h: 80, regions: [
          { k: "soup", x: 232, y: 56, w: 80, h: 80, place: "スープジャー" },
        ] },
      ],
    },
    lunchjar: {
      name: "保温ランチジャー", note: "ごはん・おかず・汁物の3つの容器", soup: true, hot: true, vb: [320, 236],
      parts: [
        { label: "おかず容器", shape: "rect", x: 8, y: 22, w: 304, h: 56, r: 14, regions: [
          { k: "main", x: 8, y: 22, w: 140, h: 56, place: "おかず容器の左" },
          { k: "side0", x: 148, y: 22, w: 82, h: 56, place: "おかず容器のまん中" },
          { k: "side1", x: 230, y: 22, w: 82, h: 56, place: "おかず容器の右" },
        ] },
        { label: "ごはん容器（保温）", shape: "rect", x: 8, y: 100, w: 304, h: 56, r: 14, regions: [
          { k: "staple", x: 8, y: 100, w: 304, h: 56, place: "ごはん容器" },
        ] },
        { label: "スープ容器（保温）", shape: "rect", x: 8, y: 178, w: 304, h: 50, r: 14, regions: [
          { k: "soup", x: 8, y: 178, w: 304, h: 50, place: "スープ容器" },
        ] },
      ],
    },
  };

  // 調味料・常備品。材料検索の「足りないもの」や買い物リストには出さない
  const ALWAYS = new Set(["醤油", "みりん", "砂糖", "塩", "塩こしょう", "酢", "味噌", "片栗粉", "小麦粉", "パン粉", "ケチャップ", "マヨネーズ", "ウスターソース", "ソース", "オイスターソース", "甜麺醤", "豆板醤", "カレー粉", "コンソメ", "鶏がらスープの素", "ごま", "すりごま", "黒ごま", "ごま油", "オリーブオイル", "バター", "かつお節", "青のり", "生姜", "にんにく", "唐辛子", "レモン汁", "粉チーズ", "塩昆布", "ゆかり", "米", "焼きのり"]);
  // 材料入力の表記ゆれ（ひらがなに直したあとで置き換える）
  const ALIAS = [["とりにく", "鶏肉"], ["とり肉", "鶏肉"], ["ぶたにく", "豚肉"], ["ぶた肉", "豚肉"], ["ぎゅうにく", "牛肉"], ["ぎゅう肉", "牛肉"], ["人参", "にんじん"], ["玉葱", "玉ねぎ"], ["たまねぎ", "玉ねぎ"], ["たまご", "卵"], ["玉子", "卵"], ["ほうれんそう", "ほうれん草"], ["じゃが芋", "じゃがいも"], ["馬鈴薯", "じゃがいも"], ["南瓜", "かぼちゃ"], ["牛蒡", "ごぼう"], ["蓮根", "れんこん"], ["胡瓜", "きゅうり"], ["茄子", "なす"], ["海老", "えび"], ["しゃけ", "鮭"], ["さーもん", "鮭"], ["さけ", "鮭"], ["挽き肉", "ひき肉"], ["挽肉", "ひき肉"], ["びき肉", "ひき肉"], ["みんち", "ひき肉"], ["さつま芋", "さつまいも"], ["里芋", "里いも"], ["さといも", "里いも"], ["葱", "ねぎ"]];
  // 「鶏肉」と入れたら鶏もも肉・むね肉なども対象にする
  const GROUPS = {
    "鶏肉": ["鶏もも肉", "鶏むね肉", "鶏ひき肉", "鶏ささみ", "鶏手羽元"],
    "豚肉": ["豚ロース薄切り", "豚ロース", "豚バラ薄切り", "豚こま切れ", "豚ひき肉"],
    "牛肉": ["牛こま切れ"],
    "魚": ["生鮭", "さば", "ぶり", "たら"],
  };
  const QUICK = ["鶏もも肉", "鶏むね肉", "豚こま切れ", "豚バラ薄切り", "合いびき肉", "生鮭", "卵", "ちくわ", "ウインナー", "木綿豆腐", "キャベツ", "にんじん", "玉ねぎ", "ピーマン", "ブロッコリー", "ほうれん草", "じゃがいも", "かぼちゃ", "さつまいも", "ミニトマト", "きゅうり", "コーン缶"];

  const ICON = {
    dice: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="8.5" cy="8.5" r="1.3" class="fill"/><circle cx="15.5" cy="15.5" r="1.3" class="fill"/><circle cx="12" cy="12" r="1.3" class="fill"/></svg>',
    lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  };

  // ===================================================================
  // 保存データ
  // ===================================================================
  const emptyData = () => ({
    plans: {},        // "2026-10-26" -> { staple, main, side0, side1, soup, lock: { main: true } }
    custom: {},       // id -> 自分で登録したレシピ
    favs: [],         // ヘビロテに登録したレシピ id
    pantry: [],       // 「材料から」に入れた食材
    shop: {},         // 週の月曜 -> 買い物リストでチェックした材料
    settings: { box: "rect", days: [1, 2, 3, 4, 5], usePantry: false },
  });
  let data = load();
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return emptyData();
      const d = Object.assign(emptyData(), JSON.parse(raw));
      d.settings = Object.assign(emptyData().settings, d.settings);
      return d;
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

  // 画面だけの状態（保存しない）
  const ui = { week: 0, packDay: "", recCat: "all", recFav: false, recQuery: "", panCat: "all" };

  // ===================================================================
  // ユーティリティ
  // ===================================================================
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad2 = (n) => String(n).padStart(2, "0");
  const keyOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const dateOf = (key) => { const [y, m, d] = key.split("-").map(Number); return new Date(y, m - 1, d); };
  const md = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
  const dayLabel = (key) => { const d = dateOf(key); return `${WD[d.getDay()]}曜 ${md(d)}`; };
  const todayKey = () => keyOf(new Date());

  function mondayOf(offset) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset * 7);
    return d;
  }
  // 設定でお弁当を作る曜日だけを並べる（月曜はじまり）
  function weekKeys(offset) {
    const mon = mondayOf(offset);
    const out = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(mon);
      d.setDate(mon.getDate() + i);
      if (data.settings.days.includes(d.getDay())) out.push(keyOf(d));
    }
    return out;
  }

  // ===================================================================
  // レシピ
  // ===================================================================
  const BUILTIN = window.BENTO_RECIPES || [];
  let recipeMap = new Map();
  function indexRecipes() {
    recipeMap = new Map([...BUILTIN, ...Object.values(data.custom)].map((r) => [r.id, r]));
  }
  indexRecipes();
  const allRecipes = () => [...recipeMap.values()];
  const byId = (id) => (id ? recipeMap.get(id) || null : null);
  const isFav = (id) => data.favs.includes(id);
  const isCustom = (id) => !!data.custom[id];
  function toggleFav(id) {
    data.favs = isFav(id) ? data.favs.filter((x) => x !== id) : [...data.favs, id];
    save();
    toast(isFav(id) ? "ヘビロテに登録しました" : "ヘビロテから外しました");
  }
  const sortRecipes = (list) => list.slice().sort((a, b) => (isFav(b.id) - isFav(a.id)) || a.name.localeCompare(b.name, "ja"));

  // ===================================================================
  // 材料の照合
  // ===================================================================
  const kataToHira = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
  function norm(s) {
    let x = kataToHira(String(s || "").normalize("NFKC").trim().toLowerCase());
    for (const [a, b] of ALIAS) x = x.split(a).join(b);
    return x;
  }
  const GROUP_N = Object.fromEntries(Object.entries(GROUPS).map(([k, v]) => [norm(k), v.map(norm)]));
  function ingMatches(ing, query) {
    const a = norm(ing), b = norm(query);
    if (!a || !b) return false;
    if (a.includes(b) || (a.length >= 2 && b.includes(a))) return true;
    return (GROUP_N[b] || []).includes(a);
  }
  const realIngs = (r) => r.ings.filter((i) => !ALWAYS.has(i));
  const matchedIngs = (r, list = data.pantry) => realIngs(r).filter((i) => list.some((q) => ingMatches(i, q)));
  const pantryOn = () => data.settings.usePantry && data.pantry.length > 0;

  // ===================================================================
  // 献立
  // ===================================================================
  const box = () => BOXES[data.settings.box] || BOXES.rect;
  const activeSlots = () => SLOTS.filter((s) => s.k !== "soup" || box().soup);
  function planOf(key, create = false) {
    if (!data.plans[key] && create) data.plans[key] = { lock: {} };
    const p = data.plans[key];
    if (p && !p.lock) p.lock = {};
    return p || { lock: {} };
  }
  const dayRecipes = (plan, exceptK) => activeSlots().filter((s) => s.k !== exceptK).map((s) => byId(plan[s.k])).filter(Boolean);

  function weightedPick(list, wfn) {
    const ws = list.map(wfn);
    const total = ws.reduce((a, b) => a + b, 0);
    if (total <= 0) return null;
    let x = Math.random() * total;
    for (let i = 0; i < list.length; i++) { x -= ws[i]; if (x <= 0) return list[i]; }
    return list[list.length - 1];
  }

  // おまかせの重み：ヘビロテ・冷蔵庫の材料は出やすく、同じ週の重複・同じたんぱく源の連続・同じ色の副菜は出にくく
  function weight(r, slot, plan, ctx) {
    if (dayRecipes(plan, slot.k).some((x) => x.id === r.id)) return 0;
    let w = r.id === "st01" ? 5 : 1;
    if (isFav(r.id)) w *= 4;
    if (pantryOn()) { const m = matchedIngs(r).length; w *= m ? 1 + m * 3 : 0.3; }
    const n = ctx.used.get(r.id) || 0;
    if (n && r.id !== "st01") w *= Math.pow(r.cat === "main" ? 0.05 : 0.2, n);
    if (r.cat === "main" && r.p && ctx.nearP.includes(r.p)) w *= 0.25;
    const main = byId(plan.main);
    if (r.cat === "staple" && r.p && main && main.p === r.p) w *= 0.2;
    if (r.cat === "side") {
      const colors = dayRecipes(plan, slot.k).map((x) => x.color);
      if (colors.includes(r.color)) w *= 0.4;
      else if (VIVID.includes(r.color)) w *= 2;
    }
    return w;
  }
  function fillContext(key, keys, slotK) {
    const used = new Map();
    for (const k of keys) {
      const p = planOf(k);
      for (const s of SLOTS) {
        if (k === key && s.k === slotK) continue;
        if (p[s.k]) used.set(p[s.k], (used.get(p[s.k]) || 0) + 1);
      }
    }
    const i = keys.indexOf(key);
    const nearP = [keys[i - 1], keys[i + 1]].filter(Boolean).map((k) => byId(planOf(k).main)).filter(Boolean).map((r) => r.p);
    return { used, nearP };
  }
  function fillSlot(key, slot, keys) {
    const plan = planOf(key, true);
    plan[slot.k] = null;
    const ctx = fillContext(key, keys, slot.k);
    const pick = weightedPick(allRecipes().filter((r) => r.cat === slot.cat), (r) => weight(r, slot, plan, ctx));
    plan[slot.k] = pick ? pick.id : null;
  }
  function fillDays(keys, { onlyEmpty = false } = {}) {
    const ctxKeys = weekKeys(ui.week);
    const slots = FILL_ORDER.filter((s) => s.k !== "soup" || box().soup);
    for (const key of keys) {
      const plan = planOf(key, true);
      for (const s of slots) {
        if (plan.lock[s.k]) continue;
        if (onlyEmpty && byId(plan[s.k])) continue;
        fillSlot(key, s, ctxKeys.includes(key) ? ctxKeys : [key]);
      }
    }
    save();
  }

  // ===================================================================
  // 弁当箱の図
  // ===================================================================
  function shapeEl(part, attrs) {
    if (part.shape === "circle") return `<circle cx="${part.x + part.w / 2}" cy="${part.y + part.h / 2}" r="${part.w / 2}" ${attrs}/>`;
    if (part.shape === "ellipse") return `<ellipse cx="${part.x + part.w / 2}" cy="${part.y + part.h / 2}" rx="${part.w / 2}" ry="${part.h / 2}" ${attrs}/>`;
    return `<rect x="${part.x}" y="${part.y}" width="${part.w}" height="${part.h}" rx="${part.r || 0}" ${attrs}/>`;
  }
  // 枠の大きさに合わせて料理名を折り返す
  function fitLines(text, w, h) {
    for (const fs of [13, 11.5, 10]) {
      const per = Math.max(2, Math.floor((w * 0.86) / fs));
      const maxLines = Math.max(1, Math.floor((h * 0.82 - 12) / (fs * 1.25)));
      // 行数を決めてから均等に割り、「コーンバタ／ー」のような1文字だけの行を作らない
      const n = Math.ceil(text.length / per), even = Math.ceil(text.length / n);
      const lines = [];
      for (let i = 0; i < text.length; i += even) lines.push(text.slice(i, i + even));
      if (lines.length <= maxLines) return { fs, lines };
      if (fs === 10) return { fs, lines: [...lines.slice(0, maxLines - 1), lines[maxLines - 1].slice(0, -1) + "…"] };
    }
  }
  // 丸型・楕円では枠の角が切れるので、文字は実際に見えている横幅の中央に置く
  function visibleSpan(part, rg, y) {
    if (part.shape === "rect") return [rg.x, rg.x + rg.w];
    const rx = part.w / 2, ry = part.h / 2, pcx = part.x + rx, pcy = part.y + ry;
    const t = Math.min(1, Math.abs(y - pcy) / ry);
    const half = rx * Math.sqrt(1 - t * t) - 6;
    return [Math.max(rg.x, pcx - half), Math.min(rg.x + rg.w, pcx + half)];
  }
  let svgSeq = 0;
  function boxSvg(boxId, plan, { mini = false } = {}) {
    const b = BOXES[boxId];
    const [W, H] = b.vb;
    let defs = "", body = "";
    for (const part of b.parts) {
      const cid = `bxclip${++svgSeq}`;
      defs += `<clipPath id="${cid}">${shapeEl(part, "")}</clipPath>`;
      body += `<g clip-path="url(#${cid})">${shapeEl(part, 'class="bx-base"')}`;
      for (const rg of part.regions) {
        const r = plan && byId(plan[rg.k]);
        const fill = r ? `fill="${COLORS[r.color]?.hex || COLORS.white.hex}" fill-opacity="${mini ? 0.55 : 0.5}"` : 'class="bx-empty"';
        body += `<rect x="${rg.x}" y="${rg.y}" width="${rg.w}" height="${rg.h}" ${fill}/><rect x="${rg.x}" y="${rg.y}" width="${rg.w}" height="${rg.h}" class="bx-div"/>`;
      }
      body += `</g>${shapeEl(part, 'class="bx-outline"')}`;
      if (mini) continue;
      if (part.label) {
        body += part.labelBelow
          ? `<text x="${part.x + part.w / 2}" y="${part.y + part.h + 17}" text-anchor="middle" class="bx-part">${esc(part.label)}</text>`
          : `<text x="${part.x + 4}" y="${part.y - 7}" class="bx-part">${esc(part.label)}</text>`;
      }
      for (const rg of part.regions) {
        const r = plan && byId(plan[rg.k]);
        const slot = SLOTS.find((s) => s.k === rg.k);
        // 曲線の端にかかる枠は、文字を少し中心寄りに上げ下げする
        const pcy = part.y + part.h / 2;
        let cy = rg.y + rg.h / 2 + (part.shape === "rect" ? 0 : (pcy - rg.y - rg.h / 2) * 0.25);
        // 外周に近い側の行が切れないよう、中心から遠い位置の横幅で測る
        const [x0, x1] = visibleSpan(part, rg, cy + Math.sign(cy - pcy) * Math.min(rg.h * 0.3, 20));
        const cx = (x0 + x1) / 2;
        const { fs, lines } = fitLines(r ? r.name : "未定", x1 - x0, rg.h);
        const total = 12 + lines.length * fs * 1.25;
        cy = Math.min(Math.max(cy, rg.y + total / 2 + 2), rg.y + rg.h - total / 2 - 2);
        let y = cy - total / 2 + 9;
        body += `<text x="${cx}" y="${y}" text-anchor="middle" class="bx-slot">${slot.label}</text>`;
        y += 4;
        for (const ln of lines) { y += fs * 1.25; body += `<text x="${cx}" y="${y - 3}" text-anchor="middle" class="bx-name${r ? "" : " empty"}" font-size="${fs}">${esc(ln)}</text>`; }
      }
    }
    const label = mini ? b.name : `${b.name}の詰め方の図`;
    return `<svg class="bx${mini ? " mini" : ""}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}"><defs>${defs}</defs>${body}</svg>`;
  }
  const regionOf = (b, k) => b.parts.flatMap((p) => p.regions).find((rg) => rg.k === k);

  // 詰める順番
  function packSteps(plan, b) {
    const R = (k) => byId(plan[k]);
    const place = (k) => regionOf(b, k)?.place || "";
    const out = [];
    const st = R("staple"), mn = R("main");
    if (st) out.push(b.hot ? `<b>${esc(st.name)}</b>は温かいまま${place("staple")}に詰め、すぐふたをする` : `<b>${esc(st.name)}</b>を${place("staple")}に先に詰め、ふたを開けたまま冷ます`);
    if (mn) out.push(`<b>${esc(mn.name)}</b>を${place("main")}へ。大きいおかずから詰めると形が決まる`);
    const sides = ["side0", "side1"].map((k) => [k, R(k)]).filter(([, r]) => r);
    // 形の決まった副菜を先に、ミニトマトのようなすき間埋めは最後に
    sides.sort(([, a], [, b2]) => a.tags.includes("火を使わない") - b2.tags.includes("火を使わない"));
    for (const [k, r] of sides) {
      let s = `<b>${esc(r.name)}</b>を${place(k)}に`;
      if (r.tags.includes("汁気")) s += "。汁気をよく切っておかずカップに入れる";
      else if (r.tags.includes("火を使わない")) s += "。すき間を埋めるように最後に入れる";
      out.push(s);
    }
    const sp = b.soup && R("soup");
    if (sp) {
      out.push("スープジャーに熱湯を入れてふたをし、3分おいて予熱する（湯は捨てる）");
      out.push(`<b>${esc(sp.name)}</b>をしっかり沸騰させ、口元から1cm下まで注いですぐふたをする`);
    }
    if (out.length && !b.hot) out.push("全部が冷めてからふたをする。湯気がこもると傷みやすくなる");
    return out;
  }

  // ===================================================================
  // 画面
  // ===================================================================
  const view = $("#view");
  function route() { return (location.hash || "#week").slice(1).split("/")[0] || "week"; }
  function render() {
    const r = route();
    const map = { week: renderWeek, pack: renderPack, pantry: renderPantry, recipes: renderRecipes };
    view.innerHTML = (map[r] || renderWeek)();
    document.querySelectorAll(".tabbar a").forEach((a) => (a.dataset.tab === r ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
  }
  const dot = (r) => `<i class="dot" style="--c:${COLORS[r.color]?.hex || COLORS.white.hex}" title="${COLORS[r.color]?.label || ""}"></i>`;
  const catTag = (cat) => `<span class="tag tag-${cat}">${CATS[cat]}</span>`;
  const favMark = (id) => (isFav(id) ? '<span class="fav-mark" title="ヘビロテ">★</span>' : "");

  function weekNav() {
    const mon = mondayOf(ui.week);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const label = ui.week === 0 ? "今週" : ui.week === 1 ? "来週" : ui.week === -1 ? "先週" : `${md(mon)}の週`;
    return `<div class="week-nav">
      <button class="btn btn-plain btn-sm" data-act="week" data-d="-1" aria-label="前の週">‹</button>
      <div class="week-title"><h1>${label}のお弁当</h1><span class="muted small num">${md(mon)}〜${md(sun)}</span></div>
      <button class="btn btn-plain btn-sm" data-act="week" data-d="1" aria-label="次の週">›</button>
    </div>`;
  }

  // ---------- 献立（1週間） ----------
  function renderWeek() {
    const keys = weekKeys(ui.week);
    const b = box();
    const pantryToggle = data.pantry.length
      ? `<label class="check"><input type="checkbox" data-act="use-pantry" ${data.settings.usePantry ? "checked" : ""}> おまかせで冷蔵庫の材料（${data.pantry.length}品）を優先</label>`
      : "";
    return `${weekNav()}
      ${ui.week !== 0 ? '<button class="btn btn-ghost btn-sm back-now" data-act="week" data-d="0">今週に戻る</button>' : ""}
      <section class="panel">
        <div class="row">
          <button class="btn grow" data-act="fill-week">${ICON.dice}1週間おまかせ</button>
          <button class="btn btn-ghost grow" data-act="fill-empty">空いている所だけ</button>
        </div>
        ${pantryToggle}
        <p class="small muted box-line">弁当箱：<b>${esc(b.name)}</b>${b.soup ? "（汁物つき）" : ""} <a href="#pack">変更</a> ・ 固定したおかずはおまかせでも変わりません</p>
        <div class="row">
          <button class="btn btn-plain btn-sm" data-act="shopping">買い物リスト</button>
          <button class="btn btn-plain btn-sm" data-act="clear-week">この週をクリア</button>
        </div>
      </section>
      ${keys.length ? `<div class="day-grid">${keys.map(dayCard).join("")}</div>` : '<div class="empty">お弁当を作る曜日が選ばれていません。<button class="btn btn-ghost" data-act="settings">曜日を選ぶ</button></div>'}`;
  }
  function dayCard(key) {
    const plan = planOf(key);
    const isToday = key === todayKey();
    const rows = activeSlots().map((s) => {
      const r = byId(plan[s.k]);
      return `<li><button class="slot" data-act="pick" data-day="${key}" data-slot="${s.k}">
        <span class="slot-label tag-${s.cat}">${s.label}</span>
        <span class="slot-name">${r ? `${dot(r)}${esc(r.name)}${favMark(r.id)}` : '<span class="muted">未定 — タップで選ぶ</span>'}</span>
        ${plan.lock[s.k] ? `<span class="lock" title="固定">${ICON.lock}</span>` : ""}
      </button></li>`;
    }).join("");
    return `<article class="day-card${isToday ? " today" : ""}">
      <header class="day-head">
        <h2>${dayLabel(key)}${isToday ? ' <span class="today-badge">今日</span>' : ""}</h2>
        <div class="row">
          <button class="btn btn-plain btn-sm" data-act="fill-day" data-day="${key}" aria-label="${dayLabel(key)}をおまかせ">${ICON.dice}おまかせ</button>
          <button class="btn btn-plain btn-sm" data-act="pack-day" data-day="${key}">詰め方</button>
        </div>
      </header>
      <ul class="slot-list">${rows}</ul>
    </article>`;
  }

  // ---------- 詰め方 ----------
  function renderPack() {
    const keys = weekKeys(ui.week);
    if (!keys.includes(ui.packDay)) ui.packDay = keys.includes(todayKey()) ? todayKey() : keys[0] || "";
    const b = box();
    const plan = ui.packDay ? planOf(ui.packDay) : { lock: {} };
    const boxes = Object.entries(BOXES).map(([id, bx]) => `<button class="box-opt" data-act="box" data-id="${id}" aria-pressed="${data.settings.box === id}">
        ${boxSvg(id, null, { mini: true })}<span class="box-name">${esc(bx.name)}</span><span class="box-note">${esc(bx.note)}</span></button>`).join("");
    const dayChips = keys.map((k) => `<button class="chip" data-act="pack-pick" data-day="${k}" aria-pressed="${k === ui.packDay}">${dayLabel(k)}</button>`).join("");
    const dishes = dayRecipes(plan);
    const steps = packSteps(plan, b);

    // 彩りチェック
    const present = new Set(dishes.map((r) => r.color));
    const missing = VIVID.filter((c) => !present.has(c));
    const colorRow = Object.entries(COLORS).map(([c, v]) => `<span class="color-pill${present.has(c) ? " on" : ""}" style="--c:${v.hex}">${v.label}</span>`).join("");
    let colorHelp = "";
    if (dishes.length && missing.length) {
      const sugg = missing.map((c) => {
        const list = sortRecipes(allRecipes().filter((r) => r.cat === "side" && r.color === c && !dishes.some((d) => d.id === r.id))).slice(0, 3);
        return `<div class="sugg"><span class="color-pill on" style="--c:${COLORS[c].hex}">${COLORS[c].label}</span>
          ${list.map((r) => `<button class="chip" data-act="swap-side" data-id="${r.id}">${esc(r.name)}${favMark(r.id)}</button>`).join("")}</div>`;
      }).join("");
      colorHelp = `<p class="small">${missing.map((c) => COLORS[c].label).join("・")}が足りません。副菜2をこれに入れ替えると彩りがよくなります。</p>${sugg}`;
    } else if (dishes.length) {
      colorHelp = '<p class="small good">赤・黄・緑がそろっていて彩りばっちりです。</p>';
    }

    return `${weekNav()}
      <section class="section">
        <div class="section-head"><h2>詰め方</h2></div>
        ${keys.length ? `<div class="chips">${dayChips}</div>` : ""}
        ${ui.packDay ? `<div class="panel pack-panel">
          <h3>${dayLabel(ui.packDay)} ・ ${esc(b.name)}</h3>
          ${boxSvg(data.settings.box, plan)}
          ${dishes.length ? "" : `<div class="row"><button class="btn" data-act="fill-day" data-day="${ui.packDay}">${ICON.dice}この日をおまかせ</button></div>`}
          ${steps.length ? `<h3>詰める順番</h3><ol class="steps">${steps.map((s) => `<li>${s}</li>`).join("")}</ol>` : ""}
        </div>
        <div class="panel">
          <h3>彩りチェック</h3>
          <div class="row">${colorRow}</div>
          ${colorHelp || '<p class="small muted">献立を入れると、赤・黄・緑がそろっているか確認できます。</p>'}
        </div>
        ${b.soup ? `<div class="panel"><h3>スープジャーのコツ</h3><ul class="tips">
          <li>予熱が大事。熱湯を入れて3分温めてから中身を入れると、お昼まで温かい</li>
          <li>スープは一度しっかり沸騰させてから。具は小さめに切ると温度が下がりにくい</li>
          <li>口元から1cm下まで入れる。少ないと冷めやすい</li>
          <li>乳製品のスープは傷みやすいので、6時間以内に食べる</li></ul></div>` : ""}` : ""}
      </section>
      <section class="section">
        <h2>弁当箱の形</h2>
        <p class="small muted">スープジャーつき・保温ランチジャーを選ぶと、献立に汁物が加わります。</p>
        <div class="box-grid">${boxes}</div>
      </section>`;
  }

  // ---------- 材料から ----------
  function renderPantry() {
    const chips = data.pantry.map((p, i) => `<button class="chip on" data-act="pantry-del" data-i="${i}" aria-label="${esc(p)}を外す">${esc(p)} ×</button>`).join("");
    const quick = QUICK.filter((q) => !data.pantry.some((p) => norm(p) === norm(q))).map((q) => `<button class="chip" data-act="pantry-add" data-v="${esc(q)}">＋${esc(q)}</button>`).join("");
    let results = "";
    if (data.pantry.length) {
      const list = allRecipes()
        .filter((r) => ui.panCat === "all" || r.cat === ui.panCat)
        .map((r) => ({ r, hit: matchedIngs(r), miss: realIngs(r).filter((i) => !matchedIngs(r).includes(i)) }))
        .filter((x) => x.hit.length)
        .sort((a, b) => b.hit.length - a.hit.length || a.miss.length - b.miss.length || isFav(b.r.id) - isFav(a.r.id));
      const catChips = [["all", "すべて"], ...Object.entries(CATS)].map(([k, v]) => `<button class="chip" data-act="pan-cat" data-v="${k}" aria-pressed="${ui.panCat === k}">${v}</button>`).join("");
      results = `<section class="section">
        <div class="section-head"><h2>作れるレシピ <span class="muted small">${list.length}品</span></h2></div>
        <div class="chips">${catChips}</div>
        ${list.length ? `<div class="rec-list">${list.map(({ r, hit, miss }) => `<article class="rec-card">
            <button class="rec-main" data-act="recipe" data-id="${r.id}">
              <span class="rec-title">${dot(r)}${esc(r.name)}${favMark(r.id)}</span>
              <span class="rec-meta">${catTag(r.cat)} <span class="muted small">${r.min}分</span></span>
              <span class="small">使える：<b class="hit">${hit.map(esc).join("・")}</b></span>
              <span class="small muted">${miss.length ? `ほかに：${miss.map(esc).join("・")}` : "冷蔵庫の材料だけで作れます"}</span>
            </button>
            <button class="btn btn-ghost btn-sm" data-act="assign" data-id="${r.id}">献立に入れる</button>
          </article>`).join("")}</div>` : '<div class="empty">この材料で作れるレシピが見つかりませんでした。</div>'}
      </section>`;
    }
    return `<section class="section">
        <h1>材料から考える</h1>
        <p class="muted small">冷蔵庫にある食材を入れると、使えるレシピを探します。調味料は入れなくて大丈夫です。</p>
        <form class="row" data-form="pantry">
          <input class="grow" type="text" name="v" placeholder="例：鶏肉、ピーマン、卵" autocomplete="off" enterkeyhint="done">
          <button class="btn" type="submit">追加</button>
        </form>
        ${chips ? `<div class="chips">${chips}</div>` : ""}
        <details class="quick"${data.pantry.length ? "" : " open"}><summary>よく使う食材から選ぶ</summary><div class="chips">${quick}</div></details>
        ${data.pantry.length ? `<div class="row">
          <button class="btn grow" data-act="pantry-fill">${ICON.dice}この材料を優先して1週間おまかせ</button>
          <button class="btn btn-plain" data-act="pantry-clear">材料を全部消す</button></div>` : ""}
      </section>${results}`;
  }

  // ---------- レシピ ----------
  function renderRecipes() {
    const q = norm(ui.recQuery);
    const list = sortRecipes(allRecipes().filter((r) =>
      (ui.recCat === "all" || r.cat === ui.recCat) && (!ui.recFav || isFav(r.id)) &&
      (!q || norm(r.name).includes(q) || r.ings.some((i) => norm(i).includes(q)))));
    const catChips = [["all", "すべて"], ...Object.entries(CATS)].map(([k, v]) => `<button class="chip" data-act="rec-cat" data-v="${k}" aria-pressed="${ui.recCat === k}">${v}</button>`).join("");
    return `<section class="section">
        <div class="section-head"><h1>レシピ</h1><button class="btn btn-sm" data-act="rec-new">＋ レシピを登録</button></div>
        <input type="search" id="recQuery" placeholder="料理名・材料で絞り込み" value="${esc(ui.recQuery)}">
        <div class="chips">${catChips}<button class="chip chip-fav" data-act="rec-fav" aria-pressed="${ui.recFav}">★ ヘビロテ（${data.favs.filter(byId).length}）</button></div>
        <p class="small muted">★をつけたヘビロテのレシピは、おまかせで選ばれやすくなります。</p>
      </section>
      <div class="rec-rows" id="recRows">${recRows(list)}</div>`;
  }
  function recRows(list) {
    if (!list.length) return '<div class="empty">該当するレシピがありません。</div>';
    return list.map((r) => `<div class="rec-row">
        <button class="rec-main" data-act="recipe" data-id="${r.id}">
          <span class="rec-title">${dot(r)}${esc(r.name)}${isCustom(r.id) ? ' <span class="tag tag-mine">自分</span>' : ""}</span>
          <span class="rec-meta">${catTag(r.cat)} <span class="muted small">${r.min}分 ・ ${r.ings.filter((i) => !ALWAYS.has(i)).slice(0, 4).map(esc).join("、")}</span></span>
        </button>
        <button class="star" data-act="fav" data-id="${r.id}" aria-pressed="${isFav(r.id)}" aria-label="ヘビロテ">${isFav(r.id) ? "★" : "☆"}</button>
      </div>`).join("");
  }

  // ===================================================================
  // シート
  // ===================================================================
  const sheet = $("#sheet");
  let lastFocus = null;
  let sheetCtx = null;
  function openSheet(title, html, ctx = null) {
    lastFocus = document.activeElement;
    sheetCtx = ctx;
    $("#sheetTitle").textContent = title;
    $("#sheetBody").innerHTML = html;
    const wasOpen = !sheet.hidden;
    sheet.hidden = false;
    $("#sheetBody").scrollTop = 0;
    document.body.style.overflow = "hidden";
    $(".sheet-close", sheet).focus();
    // スマホの「戻る」でもシートを閉じられるように履歴を1つ積む
    if (!wasOpen) history.pushState({ sheet: true }, "");
  }
  function closeSheet() {
    if (sheet.hidden) return;
    sheet.hidden = true;
    sheetCtx = null;
    document.body.style.overflow = "";
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    if (history.state && history.state.sheet) history.back();
  }
  window.addEventListener("popstate", () => {
    if (!sheet.hidden) { sheet.hidden = true; sheetCtx = null; document.body.style.overflow = ""; }
  });
  sheet.addEventListener("click", (e) => { if (e.target === sheet || e.target.closest("[data-close]")) closeSheet(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });

  // 料理を選ぶ
  function openPicker(key, slotK, query = "") {
    const slot = SLOTS.find((s) => s.k === slotK);
    const plan = planOf(key);
    const cur = byId(plan[slotK]);
    openSheet(`${dayLabel(key)}の${slot.label}`, `
      <div class="row">
        <button class="btn grow" data-act="pick-random">${ICON.dice}おまかせ</button>
        <button class="btn btn-ghost grow" data-act="pick-lock" aria-pressed="${!!plan.lock[slotK]}">${ICON.lock}${plan.lock[slotK] ? "固定を外す" : "固定する"}</button>
      </div>
      ${cur ? `<div class="current">今：${dot(cur)}<b>${esc(cur.name)}</b>
        <button class="btn btn-plain btn-sm" data-act="recipe" data-id="${cur.id}">作り方</button>
        <button class="btn btn-plain btn-sm" data-act="pick-clear">空にする</button></div>` : ""}
      <input type="search" id="pickQuery" placeholder="${CATS[slot.cat]}を料理名・材料で探す" value="${esc(query)}">
      <div class="pick-list" id="pickList">${pickRows(slot, query, cur)}</div>`, { kind: "picker", key, slotK });
  }
  function pickRows(slot, query, cur) {
    const q = norm(query);
    const list = sortRecipes(allRecipes().filter((r) => r.cat === slot.cat && (!q || norm(r.name).includes(q) || r.ings.some((i) => norm(i).includes(q)))));
    if (!list.length) return '<p class="muted">見つかりません。「レシピ」タブで登録できます。</p>';
    return list.map((r) => `<button class="pick-row${cur && cur.id === r.id ? " cur" : ""}" data-act="pick-set" data-id="${r.id}">
        ${dot(r)}<span class="grow">${esc(r.name)}${favMark(r.id)}</span><span class="muted small">${r.min}分</span></button>`).join("");
  }

  // レシピ詳細
  function openRecipe(id) {
    const r = byId(id);
    if (!r) return;
    const hit = matchedIngs(r);
    openSheet(r.name, `
      <div class="rec-detail-head">
        <h2>${dot(r)}${esc(r.name)}</h2>
        <div class="row">${catTag(r.cat)} <span class="muted small">約${r.min}分</span> ${r.tags.map((t) => `<span class="tag tag-plain">${esc(t)}</span>`).join(" ")} ${isCustom(r.id) ? '<span class="tag tag-mine">自分のレシピ</span>' : ""}</div>
      </div>
      <div class="row">
        <button class="btn ${isFav(r.id) ? "" : "btn-ghost"}" data-act="fav" data-id="${r.id}" aria-pressed="${isFav(r.id)}">${isFav(r.id) ? "★ ヘビロテ登録中" : "☆ ヘビロテに登録"}</button>
        <button class="btn btn-ghost" data-act="assign" data-id="${r.id}">献立に入れる</button>
      </div>
      <section class="panel"><h3>材料</h3>
        <ul class="ings">${r.ings.map((i) => `<li class="${hit.includes(i) ? "hit" : ""}${ALWAYS.has(i) ? " always" : ""}">${esc(i)}${hit.includes(i) ? " <small>（冷蔵庫にある）</small>" : ""}</li>`).join("")}</ul>
      </section>
      <section class="panel"><h3>作り方</h3><ol class="steps">${r.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol></section>
      <div class="row">
        ${isCustom(r.id)
          ? `<button class="btn btn-plain" data-act="rec-edit" data-id="${r.id}">編集</button><button class="btn btn-danger" data-act="rec-del" data-id="${r.id}">削除</button>`
          : `<button class="btn btn-plain" data-act="rec-copy" data-id="${r.id}">アレンジして自分のレシピにする</button>`}
      </div>`, { kind: "recipe", id });
  }

  // 献立に入れる（週の日を選ぶ）
  function openAssign(id) {
    const r = byId(id);
    const keys = weekKeys(ui.week);
    const slots = activeSlots().filter((s) => s.cat === r.cat);
    if (!slots.length) { toast("今の弁当箱には汁物の枠がありません。「詰め方」でスープジャーつきを選んでください。"); return; }
    const rows = keys.map((k) => {
      const plan = planOf(k);
      return `<div class="assign-row"><b>${dayLabel(k)}</b><div class="row">${slots.map((s) => {
        const cur = byId(plan[s.k]);
        return `<button class="btn btn-plain btn-sm" data-act="assign-set" data-day="${k}" data-slot="${s.k}" data-id="${r.id}">${s.label}に${cur ? `<span class="muted small">（今：${esc(cur.name)}）</span>` : ""}</button>`;
      }).join("")}</div></div>`;
    }).join("");
    openSheet(`「${r.name}」を献立に入れる`, `${weekNav()}${keys.length ? `<div class="assign-list">${rows}</div>` : '<p class="muted">お弁当を作る曜日が選ばれていません。</p>'}`, { kind: "assign", id });
  }

  // レシピ登録・編集
  function openForm(src = null, editId = null) {
    const r = src || { name: "", cat: "main", color: "brown", min: 15, ings: [], steps: [], tags: [] };
    const opt = (obj, cur) => Object.entries(obj).map(([k, v]) => `<option value="${k}" ${k === cur ? "selected" : ""}>${esc(typeof v === "string" ? v : v.label)}</option>`).join("");
    openSheet(editId ? "レシピを編集" : "レシピを登録", `
      <form class="rec-form" data-form="recipe" data-edit="${editId || ""}">
        <label class="field"><span>料理名</span><input type="text" name="name" required value="${esc(r.name)}" placeholder="例：うちの唐揚げ"></label>
        <div class="two">
          <label class="field"><span>種類</span><select name="cat">${opt(CATS, r.cat)}</select></label>
          <label class="field"><span>おもな色（彩りチェック用）</span><select name="color">${opt(COLORS, r.color)}</select></label>
        </div>
        <label class="field"><span>調理時間（分）</span><input type="number" name="min" min="1" max="240" value="${r.min}" inputmode="numeric"></label>
        <label class="field"><span>材料（「、」か改行で区切る）</span><textarea name="ings" placeholder="鶏もも肉、醤油、生姜">${esc(r.ings.join("、"))}</textarea></label>
        <label class="field"><span>作り方（1行に1手順）</span><textarea name="steps" placeholder="一口大に切って下味をつける">${esc(r.steps.join("\n"))}</textarea></label>
        <fieldset class="field"><legend>特徴</legend><div class="chips">${TAGS.map((t) => `<label class="chip-check"><input type="checkbox" name="tags" value="${t}" ${r.tags.includes(t) ? "checked" : ""}> ${t}</label>`).join("")}</div></fieldset>
        <label class="check"><input type="checkbox" name="fav" ${editId ? (isFav(editId) ? "checked" : "") : "checked"}> ヘビロテに登録する</label>
        <button class="btn" type="submit">保存する</button>
      </form>`, { kind: "form" });
  }
  function saveForm(form) {
    const fd = new FormData(form);
    const name = String(fd.get("name") || "").trim();
    if (!name) { toast("料理名を入れてください"); return; }
    const split = (s, re) => String(s || "").split(re).map((x) => x.trim()).filter(Boolean);
    const id = form.dataset.edit || "c" + Date.now().toString(36);
    const prev = data.custom[id] || {};
    const cat = String(fd.get("cat"));
    data.custom[id] = {
      id, cat, name,
      color: String(fd.get("color")),
      min: Math.max(1, parseInt(fd.get("min"), 10) || 15),
      ings: split(fd.get("ings"), /[、,，\n]/),
      steps: split(fd.get("steps"), /\n/),
      tags: fd.getAll("tags").map(String),
      p: prev.p || "",
    };
    const wantFav = fd.get("fav") === "on";
    if (wantFav !== isFav(id)) data.favs = wantFav ? [...data.favs, id] : data.favs.filter((x) => x !== id);
    save();
    indexRecipes();
    toast("レシピを保存しました");
    closeSheet();
    render();
    setTimeout(() => openRecipe(id), 0);
  }

  // 買い物リスト
  function openShopping() {
    const keys = weekKeys(ui.week);
    const monKey = keyOf(mondayOf(ui.week));
    const checked = new Set(data.shop[monKey] || []);
    const items = new Map();
    for (const k of keys) {
      const plan = planOf(k);
      for (const s of activeSlots()) {
        const r = byId(plan[s.k]);
        if (!r) continue;
        for (const i of realIngs(r)) {
          if (!items.has(i)) items.set(i, new Set());
          items.get(i).add(r.name);
        }
      }
    }
    const list = [...items.entries()].sort((a, b) => a[0].localeCompare(b[0], "ja"));
    const inPantry = (i) => data.pantry.some((q) => ingMatches(i, q));
    openSheet("買い物リスト", list.length ? `
      <p class="small muted">${md(mondayOf(ui.week))}からの週の献立に使う材料です（調味料・米は除いています）。買ったものにチェック。</p>
      <ul class="shop">${list.map(([i, dishes]) => `<li><label class="check"><input type="checkbox" data-act="shop-check" data-v="${esc(i)}" ${checked.has(i) ? "checked" : ""}>
          <span><b>${esc(i)}</b>${inPantry(i) ? ' <span class="tag tag-plain">冷蔵庫にある</span>' : ""}<br><span class="small muted">${[...dishes].map(esc).join("・")}</span></span></label></li>`).join("")}</ul>
      <button class="btn btn-ghost" data-act="shop-copy">まだ買っていない材料をコピー</button>`
      : '<p class="muted">この週の献立がまだありません。</p>', { kind: "shop", monKey, items: list.map(([i]) => i) });
  }

  // 設定
  function openSettings() {
    openSheet("設定", `
      <section class="panel"><h3>お弁当を作る曜日</h3>
        <div class="chips">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<label class="chip-check"><input type="checkbox" data-act="set-day" value="${d}" ${data.settings.days.includes(d) ? "checked" : ""}> ${WD[d]}</label>`).join("")}</div>
      </section>
      <section class="panel"><h3>データのバックアップ</h3>
        <p class="small muted">献立・自分のレシピ・ヘビロテはこの端末のブラウザに保存されています。機種変更のときはファイルに書き出してください。</p>
        <div class="row">
          <button class="btn btn-ghost" data-act="export">書き出す</button>
          <label class="btn btn-ghost">読み込む<input type="file" accept="application/json,.json" data-act="import" hidden></label>
        </div>
      </section>
      <section class="panel"><h3>リセット</h3>
        <button class="btn btn-danger" data-act="reset">すべてのデータを消す</button>
      </section>`, { kind: "settings" });
  }

  // ===================================================================
  // 操作
  // ===================================================================
  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 2600);
  }
  // シートを開いたまま、中身と後ろの画面を描き直す
  function refreshSheet() {
    const c = sheetCtx;
    if (!c) return;
    if (c.kind === "picker") openPicker(c.key, c.slotK, $("#pickQuery")?.value || "");
    else if (c.kind === "recipe") openRecipe(c.id);
    else if (c.kind === "assign") openAssign(c.id);
  }

  const ACTIONS = {
    week(el) {
      const d = +el.dataset.d;
      ui.week = d === 0 ? 0 : ui.week + d;
      render();
      if (sheetCtx && sheetCtx.kind === "assign") openAssign(sheetCtx.id);
    },
    "fill-week"() {
      const keys = weekKeys(ui.week);
      if (!keys.length) return;
      fillDays(keys);
      render();
      toast("1週間分の献立を考えました");
    },
    "fill-empty"() {
      fillDays(weekKeys(ui.week), { onlyEmpty: true });
      render();
      toast("空いている所を埋めました");
    },
    "fill-day"(el) {
      fillDays([el.dataset.day]);
      render();
    },
    "pack-day"(el) { ui.packDay = el.dataset.day; location.hash = "#pack"; },
    "pack-pick"(el) { ui.packDay = el.dataset.day; render(); },
    "clear-week"() {
      if (!confirm("この週の献立をすべて消しますか？（固定したものも消えます）")) return;
      for (const k of weekKeys(ui.week)) delete data.plans[k];
      save();
      render();
    },
    "use-pantry"(el) { data.settings.usePantry = el.checked; save(); },
    pick(el) { openPicker(el.dataset.day, el.dataset.slot); },
    "pick-set"(el) {
      const { key, slotK } = sheetCtx;
      planOf(key, true)[slotK] = el.dataset.id;
      save();
      closeSheet();
      render();
    },
    "pick-random"() {
      const { key, slotK } = sheetCtx;
      const plan = planOf(key, true);
      plan.lock[slotK] = false;
      fillSlot(key, SLOTS.find((s) => s.k === slotK), weekKeys(ui.week));
      save();
      render();
      refreshSheet();
    },
    "pick-lock"() {
      const { key, slotK } = sheetCtx;
      const plan = planOf(key, true);
      plan.lock[slotK] = !plan.lock[slotK];
      save();
      render();
      refreshSheet();
    },
    "pick-clear"() {
      const { key, slotK } = sheetCtx;
      const plan = planOf(key, true);
      plan[slotK] = null;
      plan.lock[slotK] = false;
      save();
      render();
      refreshSheet();
    },
    box(el) { data.settings.box = el.dataset.id; save(); render(); },
    "swap-side"(el) {
      if (!ui.packDay) return;
      const plan = planOf(ui.packDay, true);
      const k = !byId(plan.side0) ? "side0" : !byId(plan.side1) || !plan.lock.side1 ? "side1" : "side0";
      plan[k] = el.dataset.id;
      save();
      render();
      toast(`${byId(el.dataset.id).name}に入れ替えました`);
    },
    "pantry-add"(el) { addPantry(el.dataset.v); },
    "pantry-del"(el) { data.pantry.splice(+el.dataset.i, 1); if (!data.pantry.length) data.settings.usePantry = false; save(); render(); },
    "pantry-clear"() { data.pantry = []; data.settings.usePantry = false; save(); render(); },
    "pantry-fill"() {
      data.settings.usePantry = true;
      const keys = weekKeys(ui.week);
      fillDays(keys);
      location.hash = "#week";
      toast("冷蔵庫の材料を優先して献立を考えました");
    },
    "pan-cat"(el) { ui.panCat = el.dataset.v; render(); },
    "rec-cat"(el) { ui.recCat = el.dataset.v; render(); },
    "rec-fav"() { ui.recFav = !ui.recFav; render(); },
    "rec-new"() { openForm(); },
    "rec-edit"(el) { openForm(byId(el.dataset.id), el.dataset.id); },
    "rec-copy"(el) { const r = byId(el.dataset.id); openForm({ ...r, name: `${r.name}（うちの味）` }); },
    "rec-del"(el) {
      const id = el.dataset.id;
      if (!confirm(`「${byId(id).name}」を削除しますか？`)) return;
      delete data.custom[id];
      data.favs = data.favs.filter((x) => x !== id);
      for (const p of Object.values(data.plans)) for (const s of SLOTS) if (p[s.k] === id) p[s.k] = null;
      save();
      indexRecipes();
      closeSheet();
      render();
      toast("削除しました");
    },
    recipe(el) { openRecipe(el.dataset.id); },
    fav(el) { toggleFav(el.dataset.id); render(); refreshSheet(); },
    assign(el) { openAssign(el.dataset.id); },
    "assign-set"(el) {
      const plan = planOf(el.dataset.day, true);
      plan[el.dataset.slot] = el.dataset.id;
      save();
      render();
      toast(`${dayLabel(el.dataset.day)}に入れました`);
      refreshSheet();
    },
    shopping() { openShopping(); },
    "shop-check"(el) {
      const { monKey } = sheetCtx;
      const set = new Set(data.shop[monKey] || []);
      el.checked ? set.add(el.dataset.v) : set.delete(el.dataset.v);
      data.shop[monKey] = [...set];
      save();
    },
    "shop-copy"() {
      const { monKey, items } = sheetCtx;
      const done = new Set(data.shop[monKey] || []);
      const text = items.filter((i) => !done.has(i)).map((i) => `・${i}`).join("\n");
      if (!text) { toast("全部買い終わっています"); return; }
      (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject())
        .then(() => toast("コピーしました"), () => toast("コピーできませんでした"));
    },
    settings() { openSettings(); },
    "set-day"(el) {
      const d = +el.value;
      data.settings.days = el.checked ? [...new Set([...data.settings.days, d])] : data.settings.days.filter((x) => x !== d);
      save();
      render();
    },
    export() {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `bento-tsukuru-${todayKey()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
    reset() {
      if (!confirm("献立・自分のレシピ・ヘビロテをすべて消します。よろしいですか？")) return;
      data = emptyData();
      save();
      indexRecipes();
      closeSheet();
      render();
    },
  };

  function addPantry(v) {
    const items = String(v || "").split(/[、,，\s]+/).map((x) => x.trim()).filter(Boolean);
    for (const it of items) if (!data.pantry.some((p) => norm(p) === norm(it))) data.pantry.push(it);
    save();
    render();
  }

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el || el.tagName === "INPUT") return;
    const fn = ACTIONS[el.dataset.act];
    if (fn) { e.preventDefault(); fn(el, e); }
  });
  document.addEventListener("change", (e) => {
    const el = e.target;
    if (el.dataset.act === "import") {
      const f = el.files && el.files[0];
      if (!f) return;
      f.text().then((txt) => {
        const d = JSON.parse(txt);
        if (!d || typeof d !== "object" || !d.plans) throw new Error();
        data = Object.assign(emptyData(), d);
        data.settings = Object.assign(emptyData().settings, d.settings);
        save();
        indexRecipes();
        closeSheet();
        render();
        toast("読み込みました");
      }).catch(() => toast("読み込めませんでした。お弁当ツクールのバックアップファイルか確認してください。"));
      return;
    }
    if (el.tagName === "INPUT" && el.dataset.act && ACTIONS[el.dataset.act]) ACTIONS[el.dataset.act](el, e);
  });
  document.addEventListener("input", (e) => {
    if (e.target.id === "recQuery") {
      ui.recQuery = e.target.value;
      const q = norm(ui.recQuery);
      $("#recRows").innerHTML = recRows(sortRecipes(allRecipes().filter((r) =>
        (ui.recCat === "all" || r.cat === ui.recCat) && (!ui.recFav || isFav(r.id)) &&
        (!q || norm(r.name).includes(q) || r.ings.some((i) => norm(i).includes(q))))));
    } else if (e.target.id === "pickQuery" && sheetCtx) {
      const plan = planOf(sheetCtx.key);
      $("#pickList").innerHTML = pickRows(SLOTS.find((s) => s.k === sheetCtx.slotK), e.target.value, byId(plan[sheetCtx.slotK]));
    }
  });
  document.addEventListener("submit", (e) => {
    const f = e.target;
    if (f.dataset.form === "pantry") {
      e.preventDefault();
      addPantry(f.elements.v.value);
      setTimeout(() => $('[data-form="pantry"] input')?.focus(), 0);
    } else if (f.dataset.form === "recipe") {
      e.preventDefault();
      saveForm(f);
    }
  });

  $("#settingsBtn").addEventListener("click", openSettings);
  window.addEventListener("hashchange", () => { render(); window.scrollTo(0, 0); });
  render();

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
