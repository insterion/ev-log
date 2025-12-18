/* data.js - storage + schema + sanitize */
(function () {
  const STORAGE_KEY = "ev_log_final_v4_tco_attachments_split";
  const LEGACY_KEYS = [
    "ev_log_final_v4_tco_attachments",
    "ev_log_final_v3_tco",
    "ev_log_final_v2",
    "ev_log_final_v1",
    "ev_log_tabs_v3_edit_filter_same",
    "ev_log_tabs_v2_savedcol",
    "ev_log_tabs_v1",
    "ev_log_v3_stacked_prices_ice",
    "ev_log_v2_payback",
    "ev_log_v1"
  ];

  function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
  function genId() {
    return (crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
  }
  function nowISODate() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function stableSortByDateCreated(a, b) {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    const ac = a.createdAt || "";
    const bc = b.createdAt || "";
    if (ac !== bc) return ac.localeCompare(bc);
    return (a.id || "").localeCompare(b.id || "");
  }

  // Attachments
  function sanitizeAttachment(a) {
    if (!a || typeof a !== "object") return null;
    const name = typeof a.name === "string" ? a.name.trim() : "";
    const url = typeof a.url === "string" ? a.url.trim() : "";
    if (!name && !url) return null;
    return { name, url };
  }
  function sanitizeAttachments(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.map(sanitizeAttachment).filter(Boolean);
  }

  function normalizeEntryType(t) {
    if (t === "home_cheap") return "home";
    if (t === "public") return "public";
    if (t === "public_exp") return "public_exp";
    if (t === "home_exp") return "home_exp";
    return t || "custom";
  }

  function defaultState() {
    return {
      schema: 4,
      prices: { public: 0.56, public_exp: 0.76, home: 0.09, home_exp: 0.30 },
      investment: { charger: 700, install: 300 },
      compare: { ice_mpg: 45, ev_mpkwh: 3, fuel_price: 1.50, ice_maint_per_mile: 0.03 },
      entries: [],
      costs: []
    };
  }

  function sanitizeEntry(e) {
    if (!e || typeof e !== "object") return null;
    const date = (typeof e.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.date)) ? e.date : nowISODate();
    const type = normalizeEntryType(e.type);
    const price = num(e.price);
    const kwh = num(e.kwh);
    const note = (typeof e.note === "string") ? e.note.trim() : "";
    const id = (typeof e.id === "string" && e.id.length >= 6) ? e.id : genId();
    const createdAt = (typeof e.createdAt === "string" && e.createdAt.length >= 10) ? e.createdAt : new Date().toISOString();
    const attachments = sanitizeAttachments(e.attachments);
    if (!(kwh >= 0) || !(price >= 0)) return null;
    return { id, date, type, price, kwh, note, attachments, createdAt };
  }

  function sanitizeCost(c) {
    if (!c || typeof c !== "object") return null;
    const date = (typeof c.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.date)) ? c.date : nowISODate();
    const category = (typeof c.category === "string" && c.category) ? c.category : "other";
    const amount = num(c.amount);
    const miles = c.miles === "" || c.miles == null ? "" : String(Math.max(0, Math.round(num(c.miles))));
    const note = (typeof c.note === "string") ? c.note.trim() : "";
    const vehicle = (c.vehicle === "ice") ? "ice" : "ev";
    const spread = (c.spread === "monthly" || c.spread === "yearly") ? c.spread : "oneoff";
    const id = (typeof c.id === "string" && c.id.length >= 6) ? c.id : genId();
    const createdAt = (typeof c.createdAt === "string" && c.createdAt.length >= 10) ? c.createdAt : new Date().toISOString();
    const attachments = sanitizeAttachments(c.attachments);
    if (!(amount >= 0)) return null;
    return { id, date, category, amount, miles, note, vehicle, spread, attachments, createdAt };
  }

  function sanitizeState(obj) {
    const st = defaultState();
    const o = (obj && typeof obj === "object") ? obj : {};

    const p = o.prices && typeof o.prices === "object" ? o.prices : {};
    st.prices.public = num(p.public ?? p.publicPrice ?? st.prices.public);
    st.prices.public_exp = num(p.public_exp ?? p.publicExp ?? st.prices.public_exp);
    st.prices.home = num(p.home ?? p.cheap ?? p.homeCheap ?? st.prices.home);
    st.prices.home_exp = num(p.home_exp ?? p.exp ?? p.homeExpensive ?? st.prices.home_exp);

    const inv = o.investment && typeof o.investment === "object" ? o.investment : {};
    st.investment.charger = num(inv.charger ?? st.investment.charger);
    st.investment.install = num(inv.install ?? st.investment.install);

    const c = o.compare && typeof o.compare === "object" ? o.compare : {};
    st.compare.ice_mpg = Math.max(0.1, num(c.ice_mpg ?? st.compare.ice_mpg) || st.compare.ice_mpg);
    st.compare.ev_mpkwh = Math.max(0.1, num(c.ev_mpkwh ?? st.compare.ev_mpkwh) || st.compare.ev_mpkwh);
    st.compare.fuel_price = Math.max(0, num(c.fuel_price ?? st.compare.fuel_price));
    st.compare.ice_maint_per_mile = Math.max(0, num(c.ice_maint_per_mile ?? st.compare.ice_maint_per_mile));

    const arr = Array.isArray(o.entries) ? o.entries : [];
    st.entries = arr.map(sanitizeEntry).filter(Boolean).sort(stableSortByDateCreated);

    const costsArr = Array.isArray(o.costs) ? o.costs : [];
    st.costs = costsArr.map(sanitizeCost).filter(Boolean).sort(stableSortByDateCreated);

    return st;
  }

  function loadState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try { return sanitizeState(JSON.parse(raw)); } catch (e) {}
    }
    for (const key of LEGACY_KEYS) {
      const legacyRaw = localStorage.getItem(key);
      if (!legacyRaw) continue;
      try {
        const legacy = JSON.parse(legacyRaw);
        const st = sanitizeState(legacy);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(st));
        return st;
      } catch (e) {}
    }
    return defaultState();
  }

  function saveState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  window.EVData = {
    STORAGE_KEY,
    LEGACY_KEYS,
    num,
    genId,
    nowISODate,
    defaultState,
    sanitizeState,
    sanitizeEntry,
    sanitizeCost,
    sanitizeAttachments,
    sanitizeAttachment,
    normalizeEntryType,
    loadState,
    saveState,
    stableSortByDateCreated
  };
})();