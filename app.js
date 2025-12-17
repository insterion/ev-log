(() => {
  const $ = (id) => document.getElementById(id);

  // ---------- Storage ----------
  const STORAGE_KEY = "ev_log_final_v1";
  const LEGACY_KEYS = [
    "ev_log_tabs_v3_edit_filter_same",
    "ev_log_tabs_v2_savedcol",
    "ev_log_tabs_v1",
    "ev_log_v3_stacked_prices_ice",
    "ev_log_v2_payback",
    "ev_log_v1"
  ];

  // ---------- Edit drafts ----------
  let editingId = null;
  const editDrafts = new Map();

  // ---------- Filter ----------
  let currentFilter = localStorage.getItem("ev_month_filter") || "all"; // all | this | last
  const uiFilter = {
    search: "",
    type: "all",
    from: "",
    to: ""
  };

  // ---------- Undo delete ----------
  let undoTimer = null;
  let lastDeleted = null; // { entry, index }

  // ---------- Toast ----------
  let toastTimer = null;
  function toast(text, kind=""){
    const el = $("toast");
    if (!el) return;

    el.innerHTML = `<div class="toastRow"><div>${escapeHtml(text || "")}</div></div>`;
    el.className = "";
    if (kind) el.classList.add(kind);
    el.classList.add("show");

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(()=> hideToast(), 1800);
  }

  function toastUndo(text, onUndo){
    const el = $("toast");
    if (!el) return;

    el.innerHTML = `
      <div class="toastRow">
        <div>${escapeHtml(text || "")}</div>
        <div class="toastActions">
          <button class="toastBtn" id="toastUndoBtn" type="button">Undo</button>
          <button class="toastBtn" id="toastDismissBtn" type="button">Dismiss</button>
        </div>
      </div>
    `;
    el.className = "";
    el.classList.add("show");

    const u = $("toastUndoBtn");
    const d = $("toastDismissBtn");
    u?.addEventListener("click", () => { hideToast(); onUndo?.(); });
    d?.addEventListener("click", () => hideToast());

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(()=> hideToast(), 5000);
  }

  function hideToast(){
    const el = $("toast");
    if (!el) return;
    el.classList.remove("show");
    setTimeout(()=>{ el.innerHTML=""; el.className=""; }, 220);
  }

  // ---------- Utils ----------
  function nowISODate(){
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,"0");
    const day = String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${day}`;
  }
  function num(v){ const n = Number(v); return Number.isFinite(n) ? n : 0; }
  function fmtGBP(x, decimals=2){ return "£" + (Number.isFinite(x) ? x.toFixed(decimals) : "0.00"); }
  function fmt(x, decimals=1){ return (Number.isFinite(x) ? x.toFixed(decimals) : "0.0"); }
  function escapeHtml(s){
    return String(s ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }
  function genId(){
    return (crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
  }
  function typeLabel(t){
    if (t === "public") return "Публично";
    if (t === "public_exp") return "Публично скъпо";
    if (t === "home") return "Домашно";
    if (t === "home_exp") return "Домашно скъпо";
    return "Друга";
  }
  function normalizeEntryType(t){
    if (t === "home_cheap") return "home";
    if (t === "public") return "public";
    if (t === "public_exp") return "public_exp";
    if (t === "home_exp") return "home_exp";
    return t || "custom";
  }
  function monthKeyFromISO(iso){
    return (typeof iso === "string" && iso.length >= 7) ? iso.slice(0,7) : "unknown";
  }
  function thisMonthKey(){
    return nowISODate().slice(0,7);
  }
  function lastMonthKey(){
    const [y, m] = thisMonthKey().split("-").map(n => parseInt(n,10));
    const mm = m - 1;
    if (mm >= 1) return `${y}-${String(mm).padStart(2,"0")}`;
    return `${y-1}-12`;
  }

  // ---------- State schema ----------
  function defaultState(){
    return {
      schema: 1,
      prices: { public: 0.56, public_exp: 0.76, home: 0.09, home_exp: 0.30 },
      investment: { charger: 700, install: 300 },
      compare: { ice_mpg: 45, ev_mpkwh: 3, fuel_price: 1.50 },
      entries: []
    };
  }

  function sanitizeEntry(e){
    if (!e || typeof e !== "object") return null;
    const date = (typeof e.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.date)) ? e.date : nowISODate();
    const type = normalizeEntryType(e.type);
    const price = num(e.price);
    const kwh = num(e.kwh);
    const note = (typeof e.note === "string") ? e.note.trim() : "";
    const id = (typeof e.id === "string" && e.id.length >= 6) ? e.id : genId();
    const createdAt = (typeof e.createdAt === "string" && e.createdAt.length >= 10) ? e.createdAt : new Date().toISOString();
    if (!(kwh >= 0) || !(price >= 0)) return null;
    return { id, date, type, price, kwh, note, createdAt };
  }

  function stableEntrySort(a,b){
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    const ac = a.createdAt || "";
    const bc = b.createdAt || "";
    if (ac !== bc) return ac.localeCompare(bc);
    return (a.id||"").localeCompare(b.id||"");
  }

  function sanitizeState(obj){
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
    st.compare.ice_mpg = num(c.ice_mpg ?? st.compare.ice_mpg) || st.compare.ice_mpg;
    st.compare.ev_mpkwh = num(c.ev_mpkwh ?? st.compare.ev_mpkwh) || st.compare.ev_mpkwh;
    st.compare.fuel_price = num(c.fuel_price ?? st.compare.fuel_price);

    const arr = Array.isArray(o.entries) ? o.entries : [];
    st.entries = arr.map(e => sanitizeEntry(e)).filter(Boolean);
    st.entries.sort(stableEntrySort);

    return st;
  }

  function loadState(){
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw){
      try{ return sanitizeState(JSON.parse(raw)); }catch(e){}
    }
    for (const key of LEGACY_KEYS){
      const legacyRaw = localStorage.getItem(key);
      if (!legacyRaw) continue;
      try{
        const legacy = JSON.parse(legacyRaw);
        const st = sanitizeState(legacy);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(st));
        return st;
      }catch(e){}
    }
    return defaultState();
  }

  function saveState(state){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  // ---------- Math ----------
  function calcTotalsForEntries(state, entries){
    const basePublic = num(state.prices.public);
    let kwh = 0, cost = 0, saved = 0, publicCost = 0;

    const byType = {};
    for (const e of entries){
      const ek = num(e.kwh);
      const ep = num(e.price);
      const ec = ek * ep;

      kwh += ek;
      cost += ec;

      const t = e.type || "custom";
      if (!byType[t]) byType[t] = { kwh:0, cost:0, count:0 };
      byType[t].kwh += ek;
      byType[t].cost += ec;
      byType[t].count++;

      const isPublic = (t === "public" || t === "public_exp");
      if (isPublic) publicCost += ec;
      if (!isPublic) saved += (basePublic - ep) * ek;
    }

    return { kwh, cost, saved, publicCost, byType, basePublic };
  }

  function breakdownText(totals){
    const order = ["public","public_exp","home","home_exp","custom"];
    const parts = [];
    for (const t of order){
      if (!totals.byType[t]) continue;
      const b = totals.byType[t];
      parts.push(`${typeLabel(t)}: ${fmt(b.kwh,1)} kWh, ${fmtGBP(b.cost,2)} (${b.count})`);
    }
    return parts.length
      ? (parts.join(" • ") + ` • base public ${fmtGBP(totals.basePublic,3)}/kWh`)
      : "Няма записи.";
  }

  // ---------- Filters ----------
  function passesFilters(e){
    const s = (uiFilter.search || "").trim().toLowerCase();
    if (s){
      const note = (e.note || "").toLowerCase();
      if (!note.includes(s)) return false;
    }
    if (uiFilter.type && uiFilter.type !== "all"){
      if ((e.type || "custom") !== uiFilter.type) return false;
    }
    if (uiFilter.from){
      if (e.date < uiFilter.from) return false;
    }
    if (uiFilter.to){
      if (e.date > uiFilter.to) return false;
    }
    return true;
  }

  function applyMonthFilter(entries){
    if (currentFilter === "all") return entries;
    const thisKey = thisMonthKey();
    const lastKey = lastMonthKey();
    return entries.filter(e => {
      const k = monthKeyFromISO(e.date);
      return currentFilter === "this" ? k === thisKey : k === lastKey;
    });
  }

  function applyAllFilters(entries){
    const a = applyMonthFilter(entries);
    return a.filter(passesFilters);
  }

  // ---------- Edit drafts ----------
  function startEdit(entry){
    editingId = entry.id;
    editDrafts.set(entry.id, {
      type: entry.type,
      kwh: num(entry.kwh),
      price: num(entry.price),
      note: entry.note || ""
    });
  }
  function cancelEdit(){
    if (editingId) editDrafts.delete(editingId);
    editingId = null;
  }
  function saveEdit(state){
    const id = editingId;
    const d = id ? editDrafts.get(id) : null;
    if (!id || !d) return;

    const idx = state.entries.findIndex(e => e.id === id);
    if (idx >= 0){
      state.entries[idx] = { ...state.entries[idx], ...d };
      state.entries = state.entries.map(sanitizeEntry).filter(Boolean);
      state.entries.sort(stableEntrySort);
    }

    editDrafts.delete(id);
    editingId = null;

    saveState(state);
    render(state);
    toast("Saved ✅", "good");
  }

  // ---------- UI helpers ----------
  function syncInputs(state){
    $("p_public").value = state.prices.public;
    $("p_public_exp").value = state.prices.public_exp;
    $("p_home").value = state.prices.home;
    $("p_home_exp").value = state.prices.home_exp;

    $("charger_cost").value = state.investment.charger;
    $("install_cost").value = state.investment.install;

    $("ice_mpg").value = state.compare.ice_mpg;
    $("ev_mpkwh").value = state.compare.ev_mpkwh;
    $("fuel_price").value = state.compare.fuel_price;

    $("monthFilter").value = currentFilter;
  }

  function readInputsToState(state){
    state.prices.public = num($("p_public").value);
    state.prices.public_exp = num($("p_public_exp").value);
    state.prices.home = num($("p_home").value);
    state.prices.home_exp = num($("p_home_exp").value);

    state.investment.charger = num($("charger_cost").value);
    state.investment.install = num($("install_cost").value);

    state.compare.ice_mpg = Math.max(0.1, num($("ice_mpg").value) || 45);
    state.compare.ev_mpkwh = Math.max(0.1, num($("ev_mpkwh").value) || 3);
    state.compare.fuel_price = Math.max(0, num($("fuel_price").value));
  }

  function currentPriceForType(state, t){
    if (t === "public") return num(state.prices.public);
    if (t === "public_exp") return num(state.prices.public_exp);
    if (t === "home") return num(state.prices.home);
    if (t === "home_exp") return num(state.prices.home_exp);
    return 0;
  }

  function autoFillEntryPrice(state){
    const t = $("e_type").value;
    if (t === "custom") return;
    $("e_price").value = currentPriceForType(state, t).toFixed(3);
  }

  // Quick type buttons
  function setTypeQuick(state, type){
    $("e_type").value = type;
    autoFillEntryPrice(state);
    $("e_kwh").focus();
  }

  // Last kWh buttons (render only when Quick is opened)
  function buildLastKwhButtons(state){
    const host = $("lastKwhBtns");
    if (!host) return;
    host.innerHTML = "";

    const sorted = [...state.entries].sort((a,b) => (b.createdAt||"").localeCompare(a.createdAt||""));
    const uniq = [];
    for (const e of sorted){
      const k = num(e.kwh);
      if (!(k > 0)) continue;
      const key = k.toFixed(1);
      if (!uniq.includes(key)) uniq.push(key);
      if (uniq.length >= 3) break;
    }

    if (!uniq.length){
      const span = document.createElement("span");
      span.className = "small";
      span.textContent = "— (няма още записи)";
      host.appendChild(span);
      return;
    }

    uniq.forEach(kStr => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pill";
      btn.textContent = kStr;
      btn.onclick = () => {
        $("e_kwh").value = kStr;
        $("e_kwh").focus();
      };
      host.appendChild(btn);
    });
  }

  // ---------- Actions ----------
  function addEntry(state){
    cancelEdit();

    const date = $("e_date").value || nowISODate();
    const kwh = num($("e_kwh").value);
    const type = $("e_type").value;
    const price = num($("e_price").value);
    const note = ($("e_note").value || "").trim();

    if (!(kwh > 0)) { toast("Въведи kWh", "bad"); return; }
    if (!(price >= 0)) { toast("Въведи цена", "bad"); return; }

    const entry = sanitizeEntry({
      id: genId(),
      date,
      type,
      price,
      kwh,
      note,
      createdAt: new Date().toISOString()
    });

    state.entries.push(entry);
    state.entries.sort(stableEntrySort);
    saveState(state);
    render(state);

    $("e_kwh").value = "";
    $("e_note").value = "";
    $("e_date").value = date;
    if (type !== "custom") autoFillEntryPrice(state);

    $("e_kwh").focus();
    toast("Добавено ✅", "good");
  }

  function deleteEntry(state, id){
    cancelEdit();

    const idx = state.entries.findIndex(e => e.id === id);
    if (idx < 0) return;

    const removed = state.entries[idx];
    state.entries.splice(idx, 1);
    saveState(state);
    render(state);

    // store undo info
    lastDeleted = { entry: removed, index: idx };
    if (undoTimer) clearTimeout(undoTimer);
    undoTimer = setTimeout(() => { lastDeleted = null; }, 5000);

    toastUndo("Deleted. Undo?", () => undoDelete(state));
  }

  function undoDelete(state){
    if (!lastDeleted) return;
    const { entry, index } = lastDeleted;

    // insert back near original position
    const safeIndex = Math.min(Math.max(index, 0), state.entries.length);
    state.entries.splice(safeIndex, 0, entry);
    state.entries.sort(stableEntrySort);

    lastDeleted = null;
    saveState(state);
    render(state);
    toast("Restored ✅", "good");
  }

  function latestEntry(entries){
    if (!entries.length) return null;
    return entries.reduce((best, e) => {
      const b = best?.createdAt ? Date.parse(best.createdAt) : Date.parse((best?.date || "1970-01-01") + "T00:00:00Z");
      const n = e?.createdAt ? Date.parse(e.createdAt) : Date.parse((e?.date || "1970-01-01") + "T00:00:00Z");
      return (n > b) ? e : best;
    }, entries[0]);
  }

  function applySameAsLast(state){
    cancelEdit();
    const last = latestEntry(state.entries);
    if (!last){
      toast("Няма предишен запис", "bad");
      return;
    }
    $("e_date").value = nowISODate();
    $("e_type").value = last.type || "custom";
    $("e_price").value = num(last.price).toFixed(3);
    $("e_kwh").value = num(last.kwh) ? String(num(last.kwh)) : "";
    $("e_note").value = last.note || "";
    $("e_kwh").focus();
    toast("Попълнено ✅", "good");
  }

  function duplicateEntry(state, entry){
    cancelEdit();
    const copy = sanitizeEntry({
      id: genId(),
      date: nowISODate(),
      type: entry.type,
      price: num(entry.price),
      kwh: num(entry.kwh),
      note: entry.note || "",
      createdAt: new Date().toISOString()
    });

    state.entries.push(copy);
    state.entries.sort(stableEntrySort);
    saveState(state);
    render(state);
    toast("Copied ✅", "good");
  }

  // ---------- Export/Import ----------
  function downloadText(filename, text){
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportJSON(state){
    const payload = JSON.stringify(state, null, 2);
    if (navigator.clipboard?.writeText){
      navigator.clipboard.writeText(payload)
        .then(()=> toast("Export copied ✅", "good"))
        .catch(()=> { downloadText(`ev_export_${nowISODate()}.json`, payload); toast("Clipboard fail → file ✅","good"); });
    } else {
      downloadText(`ev_export_${nowISODate()}.json`, payload);
      toast("Export file ✅", "good");
    }
  }

  function importJSONPrompt(){
    cancelEdit();
    const raw = prompt("Paste JSON (замества текущите данни):");
    if (!raw) return null;
    try{
      const parsed = JSON.parse(raw);
      const newState = sanitizeState(parsed);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
      toast("Import OK ✅", "good");
      return newState;
    }catch(e){
      toast("Invalid JSON ❌", "bad");
      return null;
    }
  }

  function csvEscape(v){
    const s = String(v ?? "");
    if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
    return s;
  }

  function csvFromEntries(state, entries){
    const basePublic = num(state.prices.public);
    const header = ["Date","Type","kWh","Price_per_kWh","Cost_GBP","Saved_vs_BasePublic_GBP","Note"];
    const rows = entries.map(e => {
      const k = num(e.kwh);
      const p = num(e.price);
      const cost = k * p;
      const isPublic = (e.type === "public" || e.type === "public_exp");
      const saved = !isPublic ? (basePublic - p) * k : 0;
      return [
        e.date,
        e.type,
        k.toFixed(1),
        p.toFixed(3),
        cost.toFixed(2),
        saved.toFixed(2),
        e.note || ""
      ];
    });

    return [header, ...rows]
      .map(r => r.map(csvEscape).join(","))
      .join("\n");
  }

  function exportCSVAll(state){
    cancelEdit();
    const csv = csvFromEntries(state, state.entries);
    downloadText(`ev_log_${nowISODate()}_all.csv`, csv);
    toast("CSV downloaded ✅", "good");
  }

  function exportCSVThisMonth(state){
    cancelEdit();
    const key = thisMonthKey();
    const entries = state.entries.filter(e => monthKeyFromISO(e.date) === key);
    const csv = csvFromEntries(state, entries);
    downloadText(`ev_log_${nowISODate()}_this_month.csv`, csv);
    toast("CSV (this month) ✅", "good");
  }

  function downloadJSONFile(state){
    cancelEdit();
    const filename = `ev_backup_${nowISODate()}.json`;
    const text = JSON.stringify(state, null, 2);
    downloadText(filename, text);

    localStorage.setItem("ev_last_backup", new Date().toISOString());
    render(state);

    toast("Backup file ✅", "good");
  }

  function restoreFromJSONText(text){
    cancelEdit();
    const parsed = JSON.parse(text);
    const newState = sanitizeState(parsed);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
    localStorage.setItem("ev_last_backup", new Date().toISOString());
    toast("Restore OK ✅", "good");
    return newState;
  }

  function restoreJSONFile(stateSetter){
    const input = $("restoreFileInput");
    input.value = "";
    input.click();

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;

      try{
        const text = await file.text();
        const newState = restoreFromJSONText(text);
        stateSetter(newState);
      }catch(e){
        toast("Restore failed ❌", "bad");
      }
    };
  }

  // ---------- Compare ----------
  function compareTotals(state, totalsAll){
    const iceMPG = Math.max(0.1, num(state.compare.ice_mpg));
    const evMPKWh = Math.max(0.1, num(state.compare.ev_mpkwh));
    const fuelPrice = Math.max(0, num(state.compare.fuel_price));

    const estMiles = totalsAll.kwh * evMPKWh;
    const ukGallons = estMiles / iceMPG;
    const liters = ukGallons * 4.54609;
    const iceCost = liters * fuelPrice;
    const diff = iceCost - totalsAll.cost;

    return { estMiles, iceCost, diff };
  }

  // ---------- Monthly summary ----------
  function monthlyLine(label, totals){
    return `${label}: ${fmt(totals.kwh,1)} kWh · ${fmtGBP(totals.cost,2)} · saved ${fmtGBP(totals.saved,2)}`;
  }

  async function copyText(text){
    try{
      await navigator.clipboard.writeText(text);
      toast("Copied ✅","good");
    } catch {
      downloadText(`ev_summary_${nowISODate()}.txt`, text);
      toast("Clipboard failed → file ✅","good");
    }
  }

  // ---------- Render ----------
  function render(state){
    const totalsAll = calcTotalsForEntries(state, state.entries);

    $("tot_kwh").textContent = fmt(totalsAll.kwh, 1);
    $("tot_cost").textContent = fmtGBP(totalsAll.cost, 2);
    $("public_cost").textContent = fmtGBP(totalsAll.publicCost, 2);
    $("saved_vs_public").textContent = fmtGBP(totalsAll.saved, 2);

    const investment = num(state.investment.charger) + num(state.investment.install);
    $("inv_total").textContent = fmtGBP(investment, 0);

    const remain = investment + totalsAll.publicCost - totalsAll.saved;
    const remainEl = $("remain_payback");
    remainEl.textContent = fmtGBP(remain, 2);
    if (remain <= 0){
      remainEl.className = "v good";
      $("remain_note").textContent = "✅ Изплатено/надминато";
    } else {
      remainEl.className = "v";
      $("remain_note").textContent = "Инвестиция + публични − спестено";
    }

    const cmp = compareTotals(state, totalsAll);
    $("est_miles").textContent = cmp.estMiles.toFixed(0);
    $("ice_cost").textContent = fmtGBP(cmp.iceCost, 2);
    $("ev_cost_for_miles").textContent = fmtGBP(totalsAll.cost, 2);
    const diffEl = $("ice_vs_ev_diff");
    diffEl.textContent = fmtGBP(cmp.diff, 2);
    diffEl.className = "v " + (cmp.diff >= 0 ? "good" : "bad");

    const bAll = breakdownText(totalsAll);
    $("breakdown_log").textContent = bAll;
    $("breakdown_summary").textContent = bAll;
    $("breakdown_compare").textContent = bAll;

    const thisKey = thisMonthKey();
    const lastKey = lastMonthKey();
    const thisEntries = state.entries.filter(e => monthKeyFromISO(e.date) === thisKey);
    const lastEntries = state.entries.filter(e => monthKeyFromISO(e.date) === lastKey);
    const thisTotals = calcTotalsForEntries(state, thisEntries);
    const lastTotals = calcTotalsForEntries(state, lastEntries);

    const monthLineEl = $("monthLine");
    monthLineEl.textContent = thisTotals.kwh || thisTotals.cost || thisTotals.saved
      ? `This month: ${fmt(thisTotals.kwh,1)} kWh · ${fmtGBP(thisTotals.cost,2)} · Saved ${fmtGBP(thisTotals.saved,2)}`
      : "";
    monthLineEl.style.display = monthLineEl.textContent ? "block" : "none";

    const lastMonthLineEl = $("lastMonthLine");
    lastMonthLineEl.textContent = lastTotals.kwh || lastTotals.cost || lastTotals.saved
      ? `Last month: ${fmt(lastTotals.kwh,1)} kWh · ${fmtGBP(lastTotals.cost,2)} · Saved ${fmtGBP(lastTotals.saved,2)}`
      : "";
    lastMonthLineEl.style.display = lastMonthLineEl.textContent ? "block" : "none";

    $("m_this_line").textContent = `${fmt(thisTotals.kwh,1)} kWh`;
    $("m_this_sub").textContent = `${fmtGBP(thisTotals.cost,2)} · saved ${fmtGBP(thisTotals.saved,2)}`;
    $("m_last_line").textContent = `${fmt(lastTotals.kwh,1)} kWh`;
    $("m_last_sub").textContent = `${fmtGBP(lastTotals.cost,2)} · saved ${fmtGBP(lastTotals.saved,2)}`;

    const lb = localStorage.getItem("ev_last_backup");
    const lbEl = $("lastBackupLine");
    if (lbEl){
      if (lb){
        const d = new Date(lb);
        lbEl.textContent = `Last backup: ${d.toLocaleString()}`;
        lbEl.style.display = "block";
      } else {
        lbEl.textContent = "";
        lbEl.style.display = "none";
      }
    }

    const visibleEntries = applyAllFilters(state.entries);
    const totalsVisible = calcTotalsForEntries(state, visibleEntries);

    const tbody = $("tbody");
    tbody.innerHTML = "";

    const basePublic = totalsAll.basePublic;

    for (const e of visibleEntries){
      const isEditing = (editingId === e.id);
      const d = isEditing ? editDrafts.get(e.id) : null;

      const viewType = isEditing ? d.type : e.type;
      const viewKwh  = isEditing ? d.kwh  : num(e.kwh);
      const viewPrice= isEditing ? d.price: num(e.price);
      const viewNote = isEditing ? d.note : (e.note || "");

      const cost = viewKwh * viewPrice;
      const isPublic = (viewType === "public" || viewType === "public_exp");
      const saved = !isPublic ? (basePublic - viewPrice) * viewKwh : 0;

      const tr = document.createElement("tr");

      const tdDate = document.createElement("td");
      tdDate.textContent = e.date;

      const tdType = document.createElement("td");
      if (isEditing){
        const sel = document.createElement("select");
        ["public","public_exp","home","home_exp","custom"].forEach(t=>{
          const o = document.createElement("option");
          o.value = t;
          o.textContent = typeLabel(t);
          if (t === viewType) o.selected = true;
          sel.appendChild(o);
        });
        sel.onchange = () => { d.type = sel.value; render(state); };
        tdType.appendChild(sel);

        const noteInp = document.createElement("input");
        noteInp.type = "text";
        noteInp.value = viewNote;
        noteInp.oninput = () => { d.note = noteInp.value; };
        noteInp.style.marginTop = "6px";
        tdType.appendChild(noteInp);
      } else {
        tdType.innerHTML =
          `<span class="tag">${typeLabel(viewType)}</span>` +
          (viewNote ? `<span class="note">${escapeHtml(viewNote)}</span>` : "");
      }

      const tdKwh = document.createElement("td");
      if (isEditing){
        const inp = document.createElement("input");
        inp.type = "number";
        inp.step = "0.1";
        inp.value = viewKwh;
        inp.oninput = () => { d.kwh = num(inp.value); };
        tdKwh.appendChild(inp);
      } else {
        tdKwh.textContent = fmt(viewKwh, 1);
      }

      const tdPrice = document.createElement("td");
      if (isEditing){
        const inp = document.createElement("input");
        inp.type = "number";
        inp.step = "0.001";
        inp.value = viewPrice;
        inp.oninput = () => { d.price = num(inp.value); };
        tdPrice.appendChild(inp);
      } else {
        tdPrice.textContent = viewPrice.toFixed(3);
      }

      const tdCost = document.createElement("td");
      tdCost.textContent = fmtGBP(cost, 2);

      const tdSaved = document.createElement("td");
      tdSaved.textContent = fmtGBP(saved, 2);
      if (saved > 0) tdSaved.className = "good";
      if (saved < 0) tdSaved.className = "bad";

      // Row menu (single column)
      const tdMenu = document.createElement("td");
      const menu = document.createElement("details");
      menu.className = "rowMenu";
      const sum = document.createElement("summary");
      sum.textContent = "⋯";
      menu.appendChild(sum);

      const box = document.createElement("div");
      box.className = "rowMenuBox";

      const btnCopy = document.createElement("button");
      btnCopy.className = "mini";
      btnCopy.type = "button";
      btnCopy.textContent = "Copy";
      btnCopy.onclick = () => { menu.open = false; duplicateEntry(state, e); };

      const btnEdit = document.createElement("button");
      btnEdit.className = "mini";
      btnEdit.type = "button";
      btnEdit.textContent = isEditing ? "Save" : "Edit";
      btnEdit.onclick = () => {
        menu.open = false;
        if (isEditing) saveEdit(state);
        else { cancelEdit(); startEdit(e); render(state); }
      };

      const btnDel = document.createElement("button");
      btnDel.className = "mini";
      btnDel.type = "button";
      btnDel.textContent = isEditing ? "Cancel" : "Del";
      btnDel.onclick = () => {
        menu.open = false;
        if (isEditing){ cancelEdit(); render(state); }
        else deleteEntry(state, e.id);
      };

      box.appendChild(btnCopy);
      box.appendChild(btnEdit);
      box.appendChild(btnDel);

      menu.appendChild(box);
      tdMenu.appendChild(menu);

      tr.appendChild(tdDate);
      tr.appendChild(tdType);
      tr.appendChild(tdKwh);
      tr.appendChild(tdPrice);
      tr.appendChild(tdCost);
      tr.appendChild(tdSaved);
      tr.appendChild(tdMenu);

      tbody.appendChild(tr);
    }

    const tfoot = $("tfoot");
    tfoot.innerHTML = "";
    const label = (currentFilter === "all" ? "All" : (currentFilter === "this" ? "This month" : "Last month"));
    const trf = document.createElement("tr");
    trf.innerHTML = `
      <th colspan="2">TOTAL (${label})</th>
      <th>${fmt(totalsVisible.kwh,1)}</th>
      <th></th>
      <th>${fmtGBP(totalsVisible.cost,2)}</th>
      <th>${fmtGBP(totalsVisible.saved,2)}</th>
      <th></th>
    `;
    tfoot.appendChild(trf);

    syncInputs(state);
  }

  // ---------- Tabs ----------
  function wireTabs(){
    const buttons = Array.from(document.querySelectorAll(".tabbtn"));
    function activate(tabName){
      buttons.forEach(b => b.classList.toggle("active", b.dataset.tab === tabName));
      document.querySelectorAll(".section").forEach(sec => sec.classList.remove("active"));
      const target = document.getElementById("tab-" + tabName);
      if (target) target.classList.add("active");
      localStorage.setItem("ev_last_tab", tabName);
    }
    buttons.forEach(btn => btn.addEventListener("click", ()=> activate(btn.dataset.tab)));
    const last = localStorage.getItem("ev_last_tab");
    if (last) activate(last);
  }

  // ---------- Wire ----------
  function wire(){
    let state = loadState();

    $("e_date").value = nowISODate();
    syncInputs(state);
    autoFillEntryPrice(state);
    render(state);

    // Quick panel: collapsed by default, remember state
    const quickPanel = $("quickPanel");
    if (quickPanel){
      quickPanel.open = (localStorage.getItem("ev_quick_open") === "1");
      if (quickPanel.open) buildLastKwhButtons(state);

      quickPanel.addEventListener("toggle", () => {
        localStorage.setItem("ev_quick_open", quickPanel.open ? "1" : "0");
        if (quickPanel.open) buildLastKwhButtons(state);
      });
    }

    // Filters panel: collapsed by default
    const filterPanel = $("filterPanel");
    if (filterPanel){
      filterPanel.open = false;
    }

    // Prices/investment/compare inputs
    [
      "p_public","p_public_exp","p_home","p_home_exp",
      "charger_cost","install_cost",
      "ice_mpg","ev_mpkwh","fuel_price"
    ].forEach(id=>{
      $(id).addEventListener("input", ()=>{
        cancelEdit();
        readInputsToState(state);
        saveState(state);
        autoFillEntryPrice(state);
        render(state);
      });
    });

    $("e_type").addEventListener("change", ()=> autoFillEntryPrice(state));

    // Quick type buttons
    $("qt_public").addEventListener("click", ()=> setTypeQuick(state, "public"));
    $("qt_public_exp").addEventListener("click", ()=> setTypeQuick(state, "public_exp"));
    $("qt_home").addEventListener("click", ()=> setTypeQuick(state, "home"));
    $("qt_home_exp").addEventListener("click", ()=> setTypeQuick(state, "home_exp"));

    // Core actions
    $("addBtn").addEventListener("click", ()=> addEntry(state));
    $("sameBtn").addEventListener("click", ()=> applySameAsLast(state));

    // More menu actions
    $("exportBtn").addEventListener("click", ()=> exportJSON(state));
    $("csvBtn").addEventListener("click", ()=> exportCSVAll(state));
    $("csvThisMonthBtn").addEventListener("click", ()=> exportCSVThisMonth(state));

    $("backupFileBtn").addEventListener("click", ()=> downloadJSONFile(state));
    $("restoreFileBtn").addEventListener("click", ()=>{
      restoreJSONFile((newState)=>{
        state = newState;
        cancelEdit();
        render(state);
        autoFillEntryPrice(state);
        syncInputs(state);
        if ($("quickPanel")?.open) buildLastKwhButtons(state);
      });
    });

    $("importBtn").addEventListener("click", ()=>{
      const newState = importJSONPrompt();
      if (newState){
        state = newState;
        cancelEdit();
        render(state);
        autoFillEntryPrice(state);
        syncInputs(state);
        if ($("quickPanel")?.open) buildLastKwhButtons(state);
      }
    });

    $("clearBtn").addEventListener("click", ()=>{
      if (!confirm("Да изтрия всичко?")) return;
      cancelEdit();
      state.entries = [];
      saveState(state);
      render(state);
      toast("Cleared ✅", "good");
    });

    // Month filter
    $("monthFilter").addEventListener("change", (e)=>{
      currentFilter = e.target.value;
      localStorage.setItem("ev_month_filter", currentFilter);
      cancelEdit();
      render(state);
    });

    // Filters UI
    $("toggleFiltersBtn").addEventListener("click", ()=>{
      const fp = $("filterPanel");
      fp.open = !fp.open;
      // scroll to it a bit for clarity
      if (fp.open) fp.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    const fSearch = $("f_search");
    const fType = $("f_type");
    const fFrom = $("f_from");
    const fTo = $("f_to");

    function onFilterChange(){
      uiFilter.search = fSearch.value || "";
      uiFilter.type = fType.value || "all";
      uiFilter.from = fFrom.value || "";
      uiFilter.to = fTo.value || "";
      cancelEdit();
      render(state);
    }

    [fSearch, fType, fFrom, fTo].forEach(el => el.addEventListener("input", onFilterChange));

    $("clearFiltersBtn").addEventListener("click", ()=>{
      fSearch.value = "";
      fType.value = "all";
      fFrom.value = "";
      fTo.value = "";
      onFilterChange();
      toast("Filters cleared ✅","good");
    });

    // Copy monthly summary
    $("copyMonthlyBtn")?.addEventListener("click", ()=>{
      const thisKey = thisMonthKey();
      const lastKey = lastMonthKey();
      const thisEntries = state.entries.filter(e => monthKeyFromISO(e.date) === thisKey);
      const lastEntries = state.entries.filter(e => monthKeyFromISO(e.date) === lastKey);
      const tThis = calcTotalsForEntries(state, thisEntries);
      const tLast = calcTotalsForEntries(state, lastEntries);

      const allTotals = calcTotalsForEntries(state, state.entries);
      const inv = num(state.investment.charger) + num(state.investment.install);
      const remain = inv + allTotals.publicCost - allTotals.saved;

      const lines = [
        "EV Log — monthly summary",
        monthlyLine("This month", tThis),
        monthlyLine("Last month", tLast),
        `Investment: ${fmtGBP(inv,0)}`,
        `Payback remaining: ${fmtGBP(remain,2)}`
      ].join("\n");

      copyText(lines);
    });

    // Fast keyboard flow (Enter)
    $("e_date").addEventListener("keydown", (ev)=>{
      if (ev.key !== "Enter") return;
      ev.preventDefault();
      $("e_kwh").focus();
    });
    $("e_kwh").addEventListener("keydown", (ev)=>{
      if (ev.key !== "Enter") return;
      ev.preventDefault();
      $("e_price").focus();
    });
    $("e_price").addEventListener("keydown", (ev)=>{
      if (ev.key !== "Enter") return;
      ev.preventDefault();
      $("e_note").focus();
    });
    $("e_note").addEventListener("keydown", (ev)=>{
      if (ev.key !== "Enter") return;
      ev.preventDefault();
      addEntry(state);
    });

    wireTabs();
  }

  wire();
})();
