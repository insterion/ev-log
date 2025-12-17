/* app.js - main UI wiring + render */
(() => {
  const D = window.EVData;
  const C = window.EVCalc;
  const U = window.EVUI;

  const $ = (id) => document.getElementById(id);

  // Edit drafts
  let editingId = null;
  const editDrafts = new Map();

  let costEditingId = null;
  const costEditDrafts = new Map();

  // Filters
  let currentFilter = localStorage.getItem("ev_month_filter") || "all"; // all | this | last
  const uiFilter = { search: "", type: "all", from: "", to: "" };

  // Undo
  let lastDeleted = null;
  let undoTimer = null;

  function syncInputs(state) {
    $("p_public").value = state.prices.public;
    $("p_public_exp").value = state.prices.public_exp;
    $("p_home").value = state.prices.home;
    $("p_home_exp").value = state.prices.home_exp;
    $("charger_cost").value = state.investment.charger;
    $("install_cost").value = state.investment.install;

    $("ice_mpg").value = state.compare.ice_mpg;
    $("ev_mpkwh").value = state.compare.ev_mpkwh;
    $("fuel_price").value = state.compare.fuel_price;
    $("ice_maint_per_mile").value = state.compare.ice_maint_per_mile;

    $("monthFilter").value = currentFilter;
  }

  function readInputsToState(state) {
    state.prices.public = D.num($("p_public").value);
    state.prices.public_exp = D.num($("p_public_exp").value);
    state.prices.home = D.num($("p_home").value);
    state.prices.home_exp = D.num($("p_home_exp").value);
    state.investment.charger = D.num($("charger_cost").value);
    state.investment.install = D.num($("install_cost").value);

    state.compare.ice_mpg = Math.max(0.1, D.num($("ice_mpg").value) || 45);
    state.compare.ev_mpkwh = Math.max(0.1, D.num($("ev_mpkwh").value) || 3);
    state.compare.fuel_price = Math.max(0, D.num($("fuel_price").value));
    state.compare.ice_maint_per_mile = Math.max(0, D.num($("ice_maint_per_mile").value));
  }

  function currentPriceForType(state, t) {
    if (t === "public") return D.num(state.prices.public);
    if (t === "public_exp") return D.num(state.prices.public_exp);
    if (t === "home") return D.num(state.prices.home);
    if (t === "home_exp") return D.num(state.prices.home_exp);
    return 0;
  }

  function autoFillEntryPrice(state) {
    const t = $("e_type").value;
    if (t === "custom") return;
    $("e_price").value = currentPriceForType(state, t).toFixed(3);
  }

  function latestEntry(entries) {
    if (!entries.length) return null;
    return entries.reduce((best, e) => {
      const b = best?.createdAt ? Date.parse(best.createdAt) : Date.parse((best?.date || "1970-01-01") + "T00:00:00Z");
      const n = e?.createdAt ? Date.parse(e.createdAt) : Date.parse((e?.date || "1970-01-01") + "T00:00:00Z");
      return (n > b) ? e : best;
    }, entries[0]);
  }

  function buildLastKwhButtons(state) {
    const host = $("lastKwhBtns");
    if (!host) return;
    host.innerHTML = "";
    const sorted = [...state.entries].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    const uniq = [];
    for (const e of sorted) {
      const k = D.num(e.kwh);
      if (!(k > 0)) continue;
      const key = k.toFixed(1);
      if (!uniq.includes(key)) uniq.push(key);
      if (uniq.length >= 3) break;
    }
    if (!uniq.length) {
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
      btn.onclick = () => { $("e_kwh").value = kStr; $("e_kwh").focus(); };
      host.appendChild(btn);
    });
  }

  // ---- Edit drafts ----
  function startEdit(entry) {
    editingId = entry.id;
    editDrafts.set(entry.id, {
      type: entry.type,
      kwh: D.num(entry.kwh),
      price: D.num(entry.price),
      note: entry.note || "",
      attachments: D.sanitizeAttachments(entry.attachments)
    });
  }
  function cancelEdit() {
    if (editingId) editDrafts.delete(editingId);
    editingId = null;
  }
  function saveEdit(state) {
    const id = editingId;
    const d = id ? editDrafts.get(id) : null;
    if (!id || !d) return;
    const idx = state.entries.findIndex(e => e.id === id);
    if (idx >= 0) {
      state.entries[idx] = { ...state.entries[idx], ...d };
      state.entries = state.entries.map(D.sanitizeEntry).filter(Boolean).sort(D.stableSortByDateCreated);
    }
    editDrafts.delete(id);
    editingId = null;
    D.saveState(state);
    render(state);
    U.toast("Saved ✅", "good");
  }

  function startCostEdit(cost) {
    costEditingId = cost.id;
    costEditDrafts.set(cost.id, {
      date: cost.date,
      vehicle: cost.vehicle,
      category: cost.category,
      amount: D.num(cost.amount),
      spread: cost.spread || "oneoff",
      miles: cost.miles ?? "",
      note: cost.note || "",
      attachments: D.sanitizeAttachments(cost.attachments)
    });
  }
  function cancelCostEdit() {
    if (costEditingId) costEditDrafts.delete(costEditingId);
    costEditingId = null;
  }
  function saveCostEdit(state) {
    const id = costEditingId;
    const d = id ? costEditDrafts.get(id) : null;
    if (!id || !d) return;
    const idx = state.costs.findIndex(c => c.id === id);
    if (idx >= 0) {
      state.costs[idx] = D.sanitizeCost({ ...state.costs[idx], ...d });
      state.costs = state.costs.filter(Boolean).sort(D.stableSortByDateCreated);
    }
    costEditDrafts.delete(id);
    costEditingId = null;
    D.saveState(state);
    render(state);
    U.toast("Cost saved ✅", "good");
  }

  // ---- CRUD entries ----
  function addEntry(state) {
    cancelEdit(); cancelCostEdit();

    const date = $("e_date").value || D.nowISODate();
    const kwh = D.num($("e_kwh").value);
    const type = $("e_type").value;
    const price = D.num($("e_price").value);
    const note = ($("e_note").value || "").trim();

    if (!(kwh > 0)) { U.toast("Въведи kWh", "bad"); return; }
    if (!(price >= 0)) { U.toast("Въведи цена", "bad"); return; }

    const entry = D.sanitizeEntry({
      id: D.genId(), date, type, price, kwh, note,
      attachments: [],
      createdAt: new Date().toISOString()
    });
    state.entries.push(entry);
    state.entries.sort(D.stableSortByDateCreated);
    D.saveState(state);
    render(state);

    $("e_kwh").value = "";
    $("e_note").value = "";
    $("e_date").value = date;
    if (type !== "custom") autoFillEntryPrice(state);
    $("e_kwh").focus();
    U.toast("Добавено ✅", "good");
  }

  function applySameAsLast(state) {
    cancelEdit();
    const last = latestEntry(state.entries);
    if (!last) { U.toast("Няма предишен запис", "bad"); return; }
    $("e_date").value = D.nowISODate();
    $("e_type").value = last.type || "custom";
    $("e_price").value = D.num(last.price).toFixed(3);
    $("e_kwh").value = D.num(last.kwh) ? String(D.num(last.kwh)) : "";
    $("e_note").value = last.note || "";
    $("e_kwh").focus();
    U.toast("Попълнено ✅", "good");
  }

  function duplicateEntry(state, entry) {
    cancelEdit();
    const copy = D.sanitizeEntry({
      id: D.genId(),
      date: D.nowISODate(),
      type: entry.type,
      price: D.num(entry.price),
      kwh: D.num(entry.kwh),
      note: entry.note || "",
      attachments: D.sanitizeAttachments(entry.attachments),
      createdAt: new Date().toISOString()
    });
    state.entries.push(copy);
    state.entries.sort(D.stableSortByDateCreated);
    D.saveState(state);
    render(state);
    U.toast("Copied ✅", "good");
  }

  function deleteCharging(state, id) {
    cancelEdit();
    const idx = state.entries.findIndex(e => e.id === id);
    if (idx < 0) return;
    const removed = state.entries[idx];
    state.entries.splice(idx, 1);
    D.saveState(state);
    render(state);

    lastDeleted = { kind: "charge", item: removed, index: idx };
    if (undoTimer) clearTimeout(undoTimer);
    undoTimer = setTimeout(() => { lastDeleted = null; }, 5000);
    U.toastUndo("Deleted. Undo?", () => undoDelete(state));
  }

  // ---- CRUD costs ----
  function addCost(state) {
    cancelEdit(); cancelCostEdit();

    const date = $("c_date").value || D.nowISODate();
    const vehicle = $("c_vehicle").value || "ev";
    const category = $("c_cat").value || "other";
    const amount = D.num($("c_amount").value);
    const miles = ($("c_miles").value || "").trim();
    const note = ($("c_note").value || "").trim();
    const spread = $("c_spread_default").value || "oneoff";

    if (!(amount > 0)) { U.toast("Въведи сума (£)", "bad"); return; }

    const cost = D.sanitizeCost({
      id: D.genId(),
      date, vehicle, category, amount, spread, miles, note,
      attachments: [],
      createdAt: new Date().toISOString()
    });

    state.costs.push(cost);
    state.costs.sort(D.stableSortByDateCreated);
    D.saveState(state);
    render(state);

    $("c_amount").value = "";
    $("c_miles").value = "";
    $("c_note").value = "";
    $("c_date").value = date;
    $("c_amount").focus();
    U.toast("Cost added ✅", "good");
  }

  function duplicateCost(state, cost) {
    cancelCostEdit();
    const copy = D.sanitizeCost({
      id: D.genId(),
      date: D.nowISODate(),
      vehicle: cost.vehicle,
      category: cost.category,
      amount: D.num(cost.amount),
      spread: cost.spread || "oneoff",
      miles: cost.miles ?? "",
      note: cost.note || "",
      attachments: D.sanitizeAttachments(cost.attachments),
      createdAt: new Date().toISOString()
    });
    state.costs.push(copy);
    state.costs.sort(D.stableSortByDateCreated);
    D.saveState(state);
    render(state);
    U.toast("Cost copied ✅", "good");
  }

  function deleteCost(state, id) {
    cancelCostEdit();
    const idx = state.costs.findIndex(c => c.id === id);
    if (idx < 0) return;
    const removed = state.costs[idx];
    state.costs.splice(idx, 1);
    D.saveState(state);
    render(state);

    lastDeleted = { kind: "cost", item: removed, index: idx };
    if (undoTimer) clearTimeout(undoTimer);
    undoTimer = setTimeout(() => { lastDeleted = null; }, 5000);
    U.toastUndo("Cost deleted. Undo?", () => undoDelete(state));
  }

  // ---- Undo ----
  function undoDelete(state) {
    if (!lastDeleted) return;
    const { kind, item, index } = lastDeleted;
    lastDeleted = null;

    if (kind === "charge") {
      const i = Math.min(Math.max(index, 0), state.entries.length);
      state.entries.splice(i, 0, item);
      state.entries.sort(D.stableSortByDateCreated);
      D.saveState(state);
      render(state);
      U.toast("Restored ✅", "good");
      return;
    }
    if (kind === "cost") {
      const i = Math.min(Math.max(index, 0), state.costs.length);
      state.costs.splice(i, 0, item);
      state.costs.sort(D.stableSortByDateCreated);
      D.saveState(state);
      render(state);
      U.toast("Cost restored ✅", "good");
      return;
    }
  }

  // ---- Export/CSV/Backup ----
  function downloadText(filename, text) {
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
  function csvEscape(v) {
    const s = String(v ?? "");
    if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
    return s;
  }
  function attachmentsToCSV(atts) {
    const arr = D.sanitizeAttachments(atts);
    return arr.map(a => `${(a.name || "").replaceAll("|", "/")}|${a.url || ""}`).join(" ; ");
  }
  function csvFromEntries(state, entries) {
    const basePublic = D.num(state.prices.public);
    const header = ["Date","Type","kWh","Price_per_kWh","Cost_GBP","Saved_vs_BasePublic_GBP","Note","AttachmentCount","Attachments"];
    const rows = entries.map(e => {
      const k = D.num(e.kwh);
      const p = D.num(e.price);
      const cost = k * p;
      const isPublic = (e.type === "public" || e.type === "public_exp");
      const saved = !isPublic ? (basePublic - p) * k : 0;
      const atts = D.sanitizeAttachments(e.attachments);
      return [
        e.date, e.type, k.toFixed(1), p.toFixed(3),
        cost.toFixed(2), saved.toFixed(2),
        e.note || "",
        String(atts.length),
        attachmentsToCSV(atts)
      ];
    });
    return [header, ...rows].map(r => r.map(csvEscape).join(",")).join("\n");
  }
  function exportCSVAll(state) {
    downloadText(`ev_log_${D.nowISODate()}_all.csv`, csvFromEntries(state, state.entries));
    U.toast("CSV downloaded ✅", "good");
  }
  function exportCSVThisMonth(state) {
    const key = C.thisMonthKey();
    const entries = state.entries.filter(e => C.monthKeyFromISO(e.date) === key);
    downloadText(`ev_log_${D.nowISODate()}_this_month.csv`, csvFromEntries(state, entries));
    U.toast("CSV (this month) ✅", "good");
  }
  function exportCostsCSV(state) {
    const header = ["Date","Vehicle","Category","Amount_GBP","Spread","Mileage","Note","AttachmentCount","Attachments"];
    const rows = state.costs.map(c => {
      const atts = D.sanitizeAttachments(c.attachments);
      return [
        c.date,
        c.vehicle,
        c.category,
        D.num(c.amount).toFixed(2),
        c.spread || "oneoff",
        c.miles ?? "",
        c.note || "",
        String(atts.length),
        attachmentsToCSV(atts)
      ];
    });
    const csv = [header, ...rows].map(r => r.map(csvEscape).join(",")).join("\n");
    downloadText(`ev_costs_${D.nowISODate()}.csv`, csv);
    U.toast("Costs CSV ✅", "good");
  }

  function exportJSON(state) {
    const payload = JSON.stringify(state, null, 2);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(payload)
        .then(() => U.toast("Export copied ✅", "good"))
        .catch(() => { downloadText(`ev_export_${D.nowISODate()}.json`, payload); U.toast("Clipboard fail → file ✅", "good"); });
    } else {
      downloadText(`ev_export_${D.nowISODate()}.json`, payload);
      U.toast("Export file ✅", "good");
    }
  }

  function importJSONPrompt() {
    cancelEdit(); cancelCostEdit();
    const raw = prompt("Paste JSON (замества текущите данни):");
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      const newState = D.sanitizeState(parsed);
      D.saveState(newState);
      U.toast("Import OK ✅", "good");
      return newState;
    } catch (e) {
      U.toast("Invalid JSON ❌", "bad");
      return null;
    }
  }

  function downloadJSONFile(state) {
    downloadText(`ev_backup_${D.nowISODate()}.json`, JSON.stringify(state, null, 2));
    localStorage.setItem("ev_last_backup", new Date().toISOString());
    render(state);
    U.toast("Backup file ✅", "good");
  }

  function restoreFromJSONText(text) {
    const parsed = JSON.parse(text);
    const newState = D.sanitizeState(parsed);
    D.saveState(newState);
    localStorage.setItem("ev_last_backup", new Date().toISOString());
    U.toast("Restore OK ✅", "good");
    return newState;
  }

  function restoreJSONFile(stateSetter) {
    const input = $("restoreFileInput");
    input.value = "";
    input.click();
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        stateSetter(restoreFromJSONText(text));
      } catch (e) {
        U.toast("Restore failed ❌", "bad");
      }
    };
  }

  // ---- Render ----
  function breakdownText(totals) {
    const order = ["public","public_exp","home","home_exp","custom"];
    const parts = [];
    for (const t of order) {
      if (!totals.byType[t]) continue;
      const b = totals.byType[t];
      parts.push(`${U.typeLabel(t)}: ${C.fmt(b.kwh,1)} kWh, ${C.fmtGBP(b.cost,2)} (${b.count})`);
    }
    return parts.length ? (parts.join(" • ") + ` • base public ${C.fmtGBP(totals.basePublic,3)}/kWh`) : "Няма записи.";
  }

  function render(state) {
    const entriesPeriod = C.applyMonthFilterEntries(state.entries, currentFilter);
    const costsPeriod = C.applyMonthFilterCosts(state.costs, currentFilter);

    const totalsPeriod = C.calcTotalsForEntries(state, entriesPeriod);
    const totalsAll = C.calcTotalsForEntries(state, state.entries);

    $("tot_kwh").textContent = C.fmt(totalsAll.kwh, 1);
    $("tot_cost").textContent = C.fmtGBP(totalsAll.cost, 2);
    $("public_cost").textContent = C.fmtGBP(totalsAll.publicCost, 2);
    $("saved_vs_public").textContent = C.fmtGBP(totalsAll.saved, 2);

    const evCostsPeriod = C.calcCostsTotals(costsPeriod, currentFilter, "ev").total;
    const iceCostsPeriod = C.calcCostsTotals(costsPeriod, currentFilter, "ice").total;
    $("ev_costs_period").textContent = C.fmtGBP(evCostsPeriod, 2);
    $("ice_costs_period").textContent = C.fmtGBP(iceCostsPeriod, 2);

    const investment = D.num(state.investment.charger) + D.num(state.investment.install);
    $("inv_total").textContent = C.fmtGBP(investment, 0);
    const remain = investment + totalsAll.publicCost - totalsAll.saved;
    const remainEl = $("remain_payback");
    remainEl.textContent = C.fmtGBP(remain, 2);
    if (remain <= 0) {
      remainEl.className = "v good";
      $("remain_note").textContent = "✅ Изплатено/надминато";
    } else {
      remainEl.className = "v";
      $("remain_note").textContent = "Инвестиция + публични − спестено";
    }

    const thisKey = C.thisMonthKey();
    const lastKey = C.lastMonthKey();
    const thisEntries = state.entries.filter(e => C.monthKeyFromISO(e.date) === thisKey);
    const lastEntries = state.entries.filter(e => C.monthKeyFromISO(e.date) === lastKey);
    const thisTotals = C.calcTotalsForEntries(state, thisEntries);
    const lastTotals = C.calcTotalsForEntries(state, lastEntries);

    const monthLineEl = $("monthLine");
    monthLineEl.textContent = thisTotals.kwh || thisTotals.cost || thisTotals.saved
      ? `This month: ${C.fmt(thisTotals.kwh,1)} kWh · ${C.fmtGBP(thisTotals.cost,2)} · Saved ${C.fmtGBP(thisTotals.saved,2)}`
      : "";
    monthLineEl.style.display = monthLineEl.textContent ? "block" : "none";

    const lastMonthLineEl = $("lastMonthLine");
    lastMonthLineEl.textContent = lastTotals.kwh || lastTotals.cost || lastTotals.saved
      ? `Last month: ${C.fmt(lastTotals.kwh,1)} kWh · ${C.fmtGBP(lastTotals.cost,2)} · Saved ${C.fmtGBP(lastTotals.saved,2)}`
      : "";
    lastMonthLineEl.style.display = lastMonthLineEl.textContent ? "block" : "none";

    $("m_this_line").textContent = `${C.fmt(thisTotals.kwh,1)} kWh`;
    $("m_this_sub").textContent = `${C.fmtGBP(thisTotals.cost,2)} · saved ${C.fmtGBP(thisTotals.saved,2)}`;
    $("m_last_line").textContent = `${C.fmt(lastTotals.kwh,1)} kWh`;
    $("m_last_sub").textContent = `${C.fmtGBP(lastTotals.cost,2)} · saved ${C.fmtGBP(lastTotals.saved,2)}`;

    $("breakdown_log").textContent = breakdownText(totalsAll);
    $("breakdown_summary").textContent = breakdownText(totalsAll);

    const cmp = C.compareRealistic(state, totalsPeriod, costsPeriod, currentFilter);
    $("est_miles").textContent = cmp.miles.toFixed(0);
    $("ev_total_real").textContent = C.fmtGBP(cmp.evTotal, 2);
    $("ice_total_real").textContent = C.fmtGBP(cmp.iceTotal, 2);

    const diffEl = $("ice_vs_ev_diff");
    diffEl.textContent = C.fmtGBP(cmp.diff, 2);
    diffEl.className = "v " + (cmp.diff >= 0 ? "good" : "bad");

    $("ev_per_mile").textContent = cmp.miles > 0 ? (cmp.evPerMile.toFixed(3)) : "0.000";
    $("ice_per_mile").textContent = cmp.miles > 0 ? (cmp.icePerMile.toFixed(3)) : "0.000";

    const label = (currentFilter === "all" ? "All" : (currentFilter === "this" ? "This month" : "Last month"));
    $("breakdown_compare").textContent = [
      `Period: ${label}`,
      `Miles (est): ${cmp.miles.toFixed(0)} (from ${C.fmt(totalsPeriod.kwh,1)} kWh @ ${D.num(state.compare.ev_mpkwh).toFixed(1)} mi/kWh)`,
      `EV: charging ${C.fmtGBP(totalsPeriod.cost,2)} + EV costs ${C.fmtGBP(cmp.evCosts,2)} = ${C.fmtGBP(cmp.evTotal,2)}`,
      `ICE: fuel ${C.fmtGBP(cmp.fuelCost,2)} (${cmp.liters.toFixed(1)} L) + maint ${C.fmtGBP(cmp.iceMaint,2)} ${cmp.hasIceCosts ? "(from ICE costs)" : "(fallback £/mile)"} = ${C.fmtGBP(cmp.iceTotal,2)}`
    ].join(" • ");

    const lb = localStorage.getItem("ev_last_backup");
    const lbEl = $("lastBackupLine");
    if (lbEl) {
      if (lb) {
        const d = new Date(lb);
        lbEl.textContent = `Last backup: ${d.toLocaleString()}`;
        lbEl.style.display = "block";
      } else {
        lbEl.textContent = "";
        lbEl.style.display = "none";
      }
    }

    // --- Charging table ---
    const visibleEntries = C.applyAllEntryFilters(state, currentFilter, uiFilter);
    const totalsVisible = C.calcTotalsForEntries(state, visibleEntries);

    const tbody = $("tbody");
    tbody.innerHTML = "";

    for (const e of visibleEntries) {
      const isEditing = (editingId === e.id);
      const d = isEditing ? editDrafts.get(e.id) : null;

      const viewType = isEditing ? d.type : e.type;
      const viewKwh = isEditing ? d.kwh : D.num(e.kwh);
      const viewPrice = isEditing ? d.price : D.num(e.price);
      const viewNote = isEditing ? d.note : (e.note || "");
      const viewAtts = isEditing ? d.attachments : D.sanitizeAttachments(e.attachments);

      const cost = viewKwh * viewPrice;
      const isPublic = (viewType === "public" || viewType === "public_exp");
      const saved = !isPublic ? (totalsAll.basePublic - viewPrice) * viewKwh : 0;

      const tr = document.createElement("tr");

      const tdDate = document.createElement("td"); tdDate.textContent = e.date;

      const tdType = document.createElement("td");
      if (isEditing) {
        const sel = document.createElement("select");
        ["public","public_exp","home","home_exp","custom"].forEach(t => {
          const o = document.createElement("option");
          o.value = t; o.textContent = U.typeLabel(t);
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

        const det = document.createElement("details");
        det.style.marginTop = "8px";
        const sum = document.createElement("summary");
        sum.textContent = `Attachments ${U.attCountText(viewAtts) || ""}`.trim();
        det.appendChild(sum);
        det.appendChild(U.buildAttachmentsEditor(d));
        tdType.appendChild(det);

      } else {
        const attTxt = U.attCountText(viewAtts);
        tdType.innerHTML =
          `<span class="tag">${U.typeLabel(viewType)}</span>` +
          (viewNote
            ? `<span class="note">${U.escapeHtml(viewNote)}${attTxt ? `<span class="attCount"> ${attTxt}</span>` : ""}</span>`
            : (attTxt ? `<span class="note"><span class="attCount">${attTxt}</span></span>` : "")
          );
      }

      const tdKwh = document.createElement("td");
      if (isEditing) {
        const inp = document.createElement("input");
        inp.type = "number"; inp.step = "0.1"; inp.value = viewKwh;
        inp.oninput = () => { d.kwh = D.num(inp.value); };
        tdKwh.appendChild(inp);
      } else tdKwh.textContent = C.fmt(viewKwh, 1);

      const tdPrice = document.createElement("td");
      if (isEditing) {
        const inp = document.createElement("input");
        inp.type = "number"; inp.step = "0.001"; inp.value = viewPrice;
        inp.oninput = () => { d.price = D.num(inp.value); };
        tdPrice.appendChild(inp);
      } else tdPrice.textContent = viewPrice.toFixed(3);

      const tdCost = document.createElement("td"); tdCost.textContent = C.fmtGBP(cost, 2);

      const tdSaved = document.createElement("td");
      tdSaved.textContent = C.fmtGBP(saved, 2);
      if (saved > 0) tdSaved.className = "good";
      if (saved < 0) tdSaved.className = "bad";

      const tdMenu = document.createElement("td");
      const menu = document.createElement("details");
      menu.className = "rowMenu";
      const sumMenu = document.createElement("summary");
      sumMenu.textContent = "⋯";
      menu.appendChild(sumMenu);

      const box = document.createElement("div");
      box.className = "rowMenuBox";

      const btnCopy = document.createElement("button");
      btnCopy.className = "mini"; btnCopy.type = "button"; btnCopy.textContent = "Copy";
      btnCopy.onclick = () => { menu.open = false; duplicateEntry(state, e); };

      const btnEdit = document.createElement("button");
      btnEdit.className = "mini"; btnEdit.type = "button"; btnEdit.textContent = isEditing ? "Save" : "Edit";
      btnEdit.onclick = () => {
        menu.open = false;
        if (isEditing) saveEdit(state);
        else { cancelEdit(); startEdit(e); render(state); }
      };

      const btnDel = document.createElement("button");
      btnDel.className = "mini"; btnDel.type = "button"; btnDel.textContent = isEditing ? "Cancel" : "Del";
      btnDel.onclick = () => {
        menu.open = false;
        if (isEditing) { cancelEdit(); render(state); }
        else deleteCharging(state, e.id);
      };

      box.appendChild(btnCopy); box.appendChild(btnEdit); box.appendChild(btnDel);
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
    const trf = document.createElement("tr");
    trf.innerHTML = `
      <th colspan="2">TOTAL (${label})</th>
      <th>${C.fmt(totalsVisible.kwh,1)}</th>
      <th></th>
      <th>${C.fmtGBP(totalsVisible.cost,2)}</th>
      <th>${C.fmtGBP(totalsVisible.saved,2)}</th>
      <th></th>
    `;
    tfoot.appendChild(trf);

    // --- Costs table ---
    const evT = C.calcCostsTotals(costsPeriod, currentFilter, "ev");
    const iceT = C.calcCostsTotals(costsPeriod, currentFilter, "ice");
    $("costsTotalsLine").textContent =
      `Period: ${label} • EV ${C.fmtGBP(evT.total,2)} • ICE ${C.fmtGBP(iceT.total,2)} • Total ${C.fmtGBP(evT.total + iceT.total,2)} (spread applied)`;

    const costsTbody = $("costsTbody");
    costsTbody.innerHTML = "";

    for (const c of state.costs) {
      const isEditing = (costEditingId === c.id);
      const d = isEditing ? costEditDrafts.get(c.id) : null;

      const vDate = isEditing ? d.date : c.date;
      const vVeh = isEditing ? d.vehicle : c.vehicle;
      const vCat = isEditing ? d.category : c.category;
      const vAmt = isEditing ? D.num(d.amount) : D.num(c.amount);
      const vSpr = isEditing ? d.spread : (c.spread || "oneoff");
      const vMiles = isEditing ? (d.miles ?? "") : (c.miles ?? "");
      const vNote = isEditing ? (d.note ?? "") : (c.note || "");
      const vAtts = isEditing ? d.attachments : D.sanitizeAttachments(c.attachments);

      const tr = document.createElement("tr");

      const tdDate = document.createElement("td");
      if (isEditing) {
        const inp = document.createElement("input");
        inp.type = "date"; inp.value = vDate;
        inp.oninput = () => { d.date = inp.value; };
        tdDate.appendChild(inp);
      } else tdDate.textContent = vDate;

      const tdCat = document.createElement("td");
      if (isEditing) {
        const vehSel = document.createElement("select");
        ["ev","ice"].forEach(v => {
          const o = document.createElement("option");
          o.value = v; o.textContent = U.vehicleLabel(v);
          if (v === vVeh) o.selected = true;
          vehSel.appendChild(o);
        });
        vehSel.onchange = () => { d.vehicle = vehSel.value; };

        const catSel = document.createElement("select");
        ["tyres","brakes","service","mot","insurance","tax","repairs","accessories","other"].forEach(k => {
          const o = document.createElement("option");
          o.value = k; o.textContent = U.costCatLabel(k);
          if (k === vCat) o.selected = true;
          catSel.appendChild(o);
        });
        catSel.onchange = () => { d.category = catSel.value; };

        tdCat.appendChild(vehSel);
        tdCat.appendChild(document.createElement("div")).className = "divider";
        tdCat.appendChild(catSel);

      } else {
        tdCat.innerHTML = `<span class="tag">${U.vehicleLabel(vVeh)} · ${U.costCatLabel(vCat)}</span>`;
      }

      const tdAmt = document.createElement("td");
      if (isEditing) {
        const inp = document.createElement("input");
        inp.type = "number"; inp.step = "0.01"; inp.value = vAmt;
        inp.oninput = () => { d.amount = D.num(inp.value); };
        tdAmt.appendChild(inp);
      } else tdAmt.textContent = C.fmtGBP(vAmt, 2);

      const tdSpread = document.createElement("td");
      if (isEditing) {
        const sel = document.createElement("select");
        ["oneoff","monthly","yearly"].forEach(s => {
          const o = document.createElement("option");
          o.value = s; o.textContent = U.spreadLabel(s);
          if (s === vSpr) o.selected = true;
          sel.appendChild(o);
        });
        sel.onchange = () => { d.spread = sel.value; };
        tdSpread.appendChild(sel);
      } else tdSpread.textContent = U.spreadLabel(vSpr);

      const tdMiles = document.createElement("td");
      if (isEditing) {
        const inp = document.createElement("input");
        inp.type = "number"; inp.step = "1"; inp.value = vMiles;
        inp.oninput = () => { d.miles = inp.value; };
        tdMiles.appendChild(inp);
      } else tdMiles.textContent = vMiles || "";

      const tdNote = document.createElement("td");
      if (isEditing) {
        const inp = document.createElement("input");
        inp.type = "text"; inp.value = vNote;
        inp.oninput = () => { d.note = inp.value; };
        tdNote.appendChild(inp);

        const det = document.createElement("details");
        det.style.marginTop = "8px";
        const sum = document.createElement("summary");
        sum.textContent = `Attachments ${U.attCountText(vAtts) || ""}`.trim();
        det.appendChild(sum);
        det.appendChild(U.buildAttachmentsEditor(d));
        tdNote.appendChild(det);

      } else {
        const attTxt = U.attCountText(vAtts);
        tdNote.innerHTML = `${U.escapeHtml(vNote)}${attTxt ? `<span class="attCount"> ${attTxt}</span>` : ""}`;
      }

      const tdMenu = document.createElement("td");
      const menu = document.createElement("details");
      menu.className = "rowMenu";
      const sumMenu = document.createElement("summary");
      sumMenu.textContent = "⋯";
      menu.appendChild(sumMenu);

      const box = document.createElement("div");
      box.className = "rowMenuBox";

      const btnCopy = document.createElement("button");
      btnCopy.className = "mini"; btnCopy.type = "button"; btnCopy.textContent = "Copy";
      btnCopy.onclick = () => { menu.open = false; duplicateCost(state, c); };

      const btnEdit = document.createElement("button");
      btnEdit.className = "mini"; btnEdit.type = "button"; btnEdit.textContent = isEditing ? "Save" : "Edit";
      btnEdit.onclick = () => {
        menu.open = false;
        if (isEditing) saveCostEdit(state);
        else { cancelCostEdit(); startCostEdit(c); render(state); }
      };

      const btnDel = document.createElement("button");
      btnDel.className = "mini"; btnDel.type = "button"; btnDel.textContent = isEditing ? "Cancel" : "Del";
      btnDel.onclick = () => {
        menu.open = false;
        if (isEditing) { cancelCostEdit(); render(state); }
        else deleteCost(state, c.id);
      };

      box.appendChild(btnCopy); box.appendChild(btnEdit); box.appendChild(btnDel);
      menu.appendChild(box);
      tdMenu.appendChild(menu);

      tr.appendChild(tdDate);
      tr.appendChild(tdCat);
      tr.appendChild(tdAmt);
      tr.appendChild(tdSpread);
      tr.appendChild(tdMiles);
      tr.appendChild(tdNote);
      tr.appendChild(tdMenu);

      costsTbody.appendChild(tr);
    }

    const costsTfoot = $("costsTfoot");
    costsTfoot.innerHTML = "";
    const trc = document.createElement("tr");
    trc.innerHTML = `
      <th colspan="2">TOTAL (period)</th>
      <th>${C.fmtGBP(evT.total + iceT.total,2)}</th>
      <th colspan="4"></th>
    `;
    costsTfoot.appendChild(trc);

    if ($("quickPanel")?.open) buildLastKwhButtons(state);
    syncInputs(state);
  }

  // ---- Tabs ----
  function wireTabs() {
    const buttons = Array.from(document.querySelectorAll(".tabbtn"));
    function activate(tabName) {
      buttons.forEach(b => b.classList.toggle("active", b.dataset.tab === tabName));
      document.querySelectorAll(".section").forEach(sec => sec.classList.remove("active"));
      const target = document.getElementById("tab-" + tabName);
      if (target) target.classList.add("active");
      localStorage.setItem("ev_last_tab", tabName);
    }
    buttons.forEach(btn => btn.addEventListener("click", () => activate(btn.dataset.tab)));
    const last = localStorage.getItem("ev_last_tab");
    if (last) activate(last);
  }

  // ---- Main wire ----
  function wire() {
    let state = D.loadState();

    $("e_date").value = D.nowISODate();
    $("c_date").value = D.nowISODate();

    syncInputs(state);
    autoFillEntryPrice(state);
    render(state);

    const quickPanel = $("quickPanel");
    if (quickPanel) {
      quickPanel.open = (localStorage.getItem("ev_quick_open") === "1");
      quickPanel.addEventListener("toggle", () => {
        localStorage.setItem("ev_quick_open", quickPanel.open ? "1" : "0");
      });
    }
    $("filterPanel").open = false;

    ["p_public","p_public_exp","p_home","p_home_exp","charger_cost","install_cost","ice_mpg","ev_mpkwh","fuel_price","ice_maint_per_mile"]
      .forEach(id => {
        $(id).addEventListener("input", () => {
          cancelEdit(); cancelCostEdit();
          readInputsToState(state);
          D.saveState(state);
          autoFillEntryPrice(state);
          render(state);
        });
      });

    $("e_type").addEventListener("change", () => autoFillEntryPrice(state));

    $("qt_public").addEventListener("click", () => { $("e_type").value = "public"; autoFillEntryPrice(state); $("e_kwh").focus(); });
    $("qt_public_exp").addEventListener("click", () => { $("e_type").value = "public_exp"; autoFillEntryPrice(state); $("e_kwh").focus(); });
    $("qt_home").addEventListener("click", () => { $("e_type").value = "home"; autoFillEntryPrice(state); $("e_kwh").focus(); });
    $("qt_home_exp").addEventListener("click", () => { $("e_type").value = "home_exp"; autoFillEntryPrice(state); $("e_kwh").focus(); });

    $("addBtn").addEventListener("click", () => addEntry(state));
    $("sameBtn").addEventListener("click", () => applySameAsLast(state));

    $("c_addBtn").addEventListener("click", () => addCost(state));
    $("c_csvBtn").addEventListener("click", () => exportCostsCSV(state));

    $("toggleFiltersBtn").addEventListener("click", () => {
      const fp = $("filterPanel");
      fp.open = !fp.open;
      if (fp.open) fp.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    function onFilterChange() {
      uiFilter.search = $("f_search").value || "";
      uiFilter.type = $("f_type").value || "all";
      uiFilter.from = $("f_from").value || "";
      uiFilter.to = $("f_to").value || "";
      cancelEdit();
      render(state);
    }
    ["f_search","f_type","f_from","f_to"].forEach(id => $(id).addEventListener("input", onFilterChange));
    $("clearFiltersBtn").addEventListener("click", () => {
      $("f_search").value = "";
      $("f_type").value = "all";
      $("f_from").value = "";
      $("f_to").value = "";
      onFilterChange();
      U.toast("Filters cleared ✅", "good");
    });

    $("exportBtn").addEventListener("click", () => exportJSON(state));
    $("csvBtn").addEventListener("click", () => exportCSVAll(state));
    $("csvThisMonthBtn").addEventListener("click", () => exportCSVThisMonth(state));

    $("backupFileBtn").addEventListener("click", () => downloadJSONFile(state));
    $("restoreFileBtn").addEventListener("click", () => {
      restoreJSONFile((newState) => {
        state = newState;
        cancelEdit(); cancelCostEdit();
        render(state);
        autoFillEntryPrice(state);
        syncInputs(state);
      });
    });

    $("importBtn").addEventListener("click", () => {
      const newState = importJSONPrompt();
      if (newState) {
        state = newState;
        cancelEdit(); cancelCostEdit();
        render(state);
        autoFillEntryPrice(state);
        syncInputs(state);
      }
    });

    $("clearBtn").addEventListener("click", () => {
      if (!confirm("Да изтрия всичко?")) return;
      cancelEdit(); cancelCostEdit();
      state.entries = [];
      state.costs = [];
      D.saveState(state);
      render(state);
      U.toast("Cleared ✅", "good");
    });

    $("monthFilter").addEventListener("change", (e) => {
      currentFilter = e.target.value;
      localStorage.setItem("ev_month_filter", currentFilter);
      cancelEdit(); cancelCostEdit();
      render(state);
    });

    $("e_note").addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); addEntry(state); } });
    $("c_note").addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); addCost(state); } });

    wireTabs();
  }

  wire();
})();
