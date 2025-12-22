// app.js – main wiring for EV Log (with "applies to" + EV/ICE maintenance + Costs filter + Insurance breakdown)

(function () {
  const D = window.EVData;
  const C = window.EVCalc;
  const U = window.EVUI;

  const $ = (id) => document.getElementById(id);

  const state = D.loadState();
  let currentEditId = null;      // charging entry id being edited
  let currentEditCostId = null;  // cost id being edited

  // ---------- normalise existing costs (backwards compatibility) ----------

  function ensureCostAppliesDefaults() {
    if (!Array.isArray(state.costs)) return;
    for (const c of state.costs) {
      if (!c) continue;
      if (!c.applies) {
        // старите записи по подразбиране – other (можеш да смениш на "ev" ако искаш)
        c.applies = "other";
      } else {
        c.applies = String(c.applies).toLowerCase();
      }
    }
  }

  ensureCostAppliesDefaults();

  // ---------- tabs ----------

  function wireTabs() {
    const tabs = document.querySelectorAll(".tab");
    const btns = document.querySelectorAll(".tabbtn");

    function activate(name) {
      tabs.forEach((t) => {
        t.classList.toggle("active", t.id === name);
      });
      btns.forEach((b) => {
        b.classList.toggle("active", b.dataset.tab === name);
      });
    }

    btns.forEach((b) =>
      b.addEventListener("click", () => activate(b.dataset.tab))
    );

    activate("log");
  }

  // ---------- settings sync ----------

  function syncSettingsToInputs() {
    $("p_public").value = state.settings.public;
    $("p_public_xp").value = state.settings.public_xp;
    $("p_home").value = state.settings.home;
    $("p_home_xp").value = state.settings.home_xp;
    $("p_hw").value = state.settings.chargerHardware || 0;
    $("p_install").value = state.settings.chargerInstall || 0;
  }

  function saveSettingsFromInputs() {
    const s = state.settings;
    s.public = parseFloat($("p_public").value) || 0;
    s.public_xp = parseFloat($("p_public_xp").value) || 0;
    s.home = parseFloat($("p_home").value) || 0;
    s.home_xp = parseFloat($("p_home_xp").value) || 0;
    s.chargerHardware = parseFloat($("p_hw").value) || 0;
    s.chargerInstall = parseFloat($("p_install").value) || 0;
    D.saveState(state);
    U.toast("Settings saved", "good");
  }

  // ---------- helpers ----------

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function autoPriceForType(type) {
    const s = state.settings;
    switch (type) {
      case "public":
        return s.public;
      case "public-xp":
        return s.public_xp;
      case "home":
        return s.home;
      case "home-xp":
        return s.home_xp;
      default:
        return 0;
    }
  }

  function resetEditMode() {
    currentEditId = null;
    const addBtn = $("addEntry");
    if (addBtn) {
      addBtn.textContent = "Add entry";
    }
  }

  function resetCostEditMode() {
    currentEditCostId = null;
    const btn = $("c_add");
    if (btn) {
      btn.textContent = "Add cost";
    }
  }

  function startEditEntry(id) {
    if (!id) {
      U.toast("Missing entry id", "bad");
      return;
    }
    const entry = state.entries.find((e) => e.id === id);
    if (!entry) {
      U.toast("Entry not found", "bad");
      return;
    }

    currentEditId = id;

    $("date").value = entry.date || todayISO();
    $("kwh").value = entry.kwh;
    $("type").value = entry.type;
    $("price").value = entry.price;
    $("note").value = entry.note || "";

    const addBtn = $("addEntry");
    if (addBtn) {
      addBtn.textContent = "Update entry";
    }

    U.toast("Editing entry", "info");
  }

  function startEditCost(id) {
    if (!id) {
      U.toast("Missing cost id", "bad");
      return;
    }
    const cost = state.costs.find((c) => c.id === id);
    if (!cost) {
      U.toast("Cost not found", "bad");
      return;
    }

    currentEditCostId = id;

    $("c_date").value = cost.date || todayISO();
    $("c_category").value = cost.category || "Tyres";
    $("c_amount").value = cost.amount;
    $("c_note").value = cost.note || "";

    const appliesSelect = $("c_applies");
    if (appliesSelect) {
      const v = (cost.applies || "other").toLowerCase();
      if (v === "ev" || v === "ice" || v === "both" || v === "other") {
        appliesSelect.value = v;
      } else {
        appliesSelect.value = "other";
      }
    }

    const btn = $("c_add");
    if (btn) {
      btn.textContent = "Update cost";
    }

    U.toast("Editing cost", "info");
  }

  function getAppliesFromForm() {
    const el = $("c_applies");
    if (!el) return "other";
    const v = (el.value || "").toLowerCase();
    if (v === "ev" || v === "ice" || v === "both" || v === "other") {
      return v;
    }
    return "other";
  }

  // ---------- maintenance totals (all-time, split EV/ICE) ----------

  function computeMaintenanceTotals() {
    const costs = state.costs || [];
    let evOnly = 0;
    let iceOnly = 0;
    let both = 0;
    let other = 0;

    for (const c of costs) {
      if (!c) continue;
      const amount = Number(c.amount ?? 0) || 0;
      if (!amount) continue;

      const a = (c.applies || "other").toLowerCase();
      if (a === "ev") {
        evOnly += amount;
      } else if (a === "ice") {
        iceOnly += amount;
      } else if (a === "both") {
        both += amount;
      } else {
        other += amount;
      }
    }

    const ev = evOnly + both;
    const ice = iceOnly + both;
    const total = evOnly + iceOnly + both + other;

    return {
      ev,
      ice,
      both,
      other,
      total
    };
  }

  function computeMaintenanceTotalAllTime() {
    return computeMaintenanceTotals().total;
  }

  // ---------- insurance totals (all-time, split EV/ICE) ----------

  function computeInsuranceTotals() {
    const costs = state.costs || [];
    let evOnly = 0;
    let iceOnly = 0;
    let both = 0;
    let other = 0;

    for (const c of costs) {
      if (!c) continue;
      const amount = Number(c.amount ?? 0) || 0;
      if (!amount) continue;

      const cat = String(c.category || "").toLowerCase();
      if (cat !== "insurance") continue;

      const a = (c.applies || "other").toLowerCase();
      if (a === "ev") {
        evOnly += amount;
      } else if (a === "ice") {
        iceOnly += amount;
      } else if (a === "both") {
        both += amount;
      } else {
        other += amount;
      }
    }

    const ev = evOnly + both;
    const ice = iceOnly + both;
    const total = evOnly + iceOnly + both + other;

    return {
      ev,
      ice,
      both,
      other,
      total
    };
  }

  function renderMaintenanceTotalInCosts() {
    try {
      const container = $("costTable");
      if (!container) return;

      const totals = computeMaintenanceTotals();
      let el = $("maintenanceTotalCosts");
      if (!el) {
        el = document.createElement("p");
        el.id = "maintenanceTotalCosts";
        el.className = "small";
        el.style.marginTop = "6px";
        if (container.parentNode) {
          container.parentNode.insertBefore(el, container.nextSibling);
        }
      }

      const diff = totals.ev - totals.ice;

      el.textContent =
        "Maintenance totals (all time) – " +
        "EV: " + U.fmtGBP(totals.ev) +
        ", ICE: " + U.fmtGBP(totals.ice) +
        ", Both: " + U.fmtGBP(totals.both) +
        ", Other: " + U.fmtGBP(totals.other) +
        ", Diff (EV–ICE): " + U.fmtGBP(diff);
    } catch (e) {
      console && console.warn && console.warn("renderMaintenanceTotalInCosts failed", e);
    }
  }

  function renderMaintenanceTotalInCompare() {
    try {
      const container = $("compareStats");
      if (!container) return;

      const totals = computeMaintenanceTotals();
      let el = $("maintenanceTotalCompare");
      if (!el) {
        el = document.createElement("p");
        el.id = "maintenanceTotalCompare";
        el.className = "small";
        el.style.marginTop = "8px";
        container.appendChild(el);
      }

      const diff = totals.ev - totals.ice;

      el.textContent =
        "Maintenance (all time) – " +
        "EV: " + U.fmtGBP(totals.ev) +
        ", ICE: " + U.fmtGBP(totals.ice) +
        ", Both: " + U.fmtGBP(totals.both) +
        ", Other: " + U.fmtGBP(totals.other) +
        ", Diff (EV–ICE): " + U.fmtGBP(diff);
    } catch (e) {
      console && console.warn && console.warn("renderMaintenanceTotalInCompare failed", e);
    }
  }

  // ---------- costs filter controls (UI) ----------

  function ensureCostFilterControls() {
    // ако вече има select – не правим нищо
    if ($("c_filter_applies")) return;

    const container = $("costTable");
    if (!container || !container.parentNode) return;

    const wrapper = document.createElement("div");
    wrapper.style.display = "flex";
    wrapper.style.alignItems = "center";
    wrapper.style.gap = "6px";
    wrapper.style.marginBottom = "6px";

    const label = document.createElement("label");
    label.setAttribute("for", "c_filter_applies");
    label.textContent = "Filter:";

    const select = document.createElement("select");
    select.id = "c_filter_applies";

    const options = [
      ["all", "All"],
      ["ev", "EV only"],
      ["ice", "ICE only"],
      ["both", "Both"],
      ["other", "Other"]
    ];

    options.forEach(([val, text]) => {
      const opt = document.createElement("option");
      opt.value = val;
      opt.textContent = text;
      select.appendChild(opt);
    });

    select.addEventListener("change", () => {
      renderAll();
    });

    wrapper.appendChild(label);
    wrapper.appendChild(select);

    container.parentNode.insertBefore(wrapper, container);
  }

  function getCostFilterValue() {
    const sel = $("c_filter_applies");
    if (!sel) return "all";
    const v = (sel.value || "all").toLowerCase();
    if (v === "ev" || v === "ice" || v === "both" || v === "other" || v === "all") {
      return v;
    }
    return "all";
  }

  // ---------- rendering ----------

  function renderAll() {
    U.renderLogTable("logTable", state.entries);

    // филтрирани разходи за таблицата (Totals / Compare вървят по всички costs)
    let costsToRender = state.costs;
    const filter = getCostFilterValue();
    if (filter !== "all") {
      costsToRender = (state.costs || []).filter((c) => {
        const a = (c.applies || "other").toLowerCase();
        return a === filter;
      });
    }

    U.renderCostTable("costTable", costsToRender);

    const summary = C.buildSummary(state.entries);
    U.renderSummary(
      ["summary_this", "summary_last", "summary_avg"],
      summary
    );

    // EV vs ICE compare (енергия) + добавяме поддръжка и insurance в data
    const cmp = C.buildCompare(state.entries, state.settings);

    const mt = computeMaintenanceTotals();
    cmp.maintEv = mt.ev;
    cmp.maintIce = mt.ice;
    cmp.maintBoth = mt.both;
    cmp.maintOther = mt.other;

    const ins = computeInsuranceTotals();
    cmp.insuranceEv = ins.ev;
    cmp.insuranceIce = ins.ice;
    cmp.insuranceBoth = ins.both;
    cmp.insuranceOther = ins.other;
    cmp.insuranceTotal = ins.total;

    U.renderCompare("compareStats", cmp);

    // maintenance totals от Costs (all time) – винаги за всички costs
    renderMaintenanceTotalInCosts();
    renderMaintenanceTotalInCompare();
  }

  // ---------- add / update entry ----------

  function onAddEntry() {
    let date = $("date").value || todayISO();
    const kwh = parseFloat($("kwh").value);
    const type = $("type").value;
    let price = parseFloat($("price").value);
    const note = $("note").value.trim();

    if (isNaN(kwh) || kwh <= 0) {
      U.toast("Please enter kWh", "bad");
      return;
    }

    if (isNaN(price) || price <= 0) {
      price = autoPriceForType(type);
    }

    if (!currentEditId) {
      // normal add
      const entry = {
        id:
          window.crypto && window.crypto.randomUUID
            ? window.crypto.randomUUID()
            : "e_" + Date.now().toString(36),
        date,
        kwh,
        type,
        price,
        note
      };

      state.entries.push(entry);
      D.saveState(state);
      renderAll();
      U.toast("Entry added", "good");
    } else {
      // update existing
      const idx = state.entries.findIndex((e) => e.id === currentEditId);
      if (idx === -1) {
        U.toast("Entry to update not found", "bad");
        resetEditMode();
        return;
      }

      const entry = state.entries[idx];
      entry.date = date;
      entry.kwh = kwh;
      entry.type = type;
      entry.price = price;
      entry.note = note;

      D.saveState(state);
      renderAll();
      U.toast("Entry updated", "good");
      resetEditMode();
    }
  }

  function onSameAsLast() {
    if (!state.entries.length) {
      U.toast("No previous entry", "info");
      return;
    }
    const last = state.entries[state.entries.length - 1];
    $("date").value = last.date;
    $("kwh").value = last.kwh;
    $("type").value = last.type;
    $("price").value = last.price;
    $("note").value = last.note || "";
    U.toast("Filled from last", "info");
  }

  // ---------- add / update cost ----------

  function onAddCost() {
    const date = $("c_date").value || todayISO();
    const category = $("c_category").value;
    const amount = parseFloat($("c_amount").value);
    const note = $("c_note").value.trim();
    const applies = getAppliesFromForm();

    if (isNaN(amount) || amount <= 0) {
      U.toast("Please enter amount", "bad");
      return;
    }

    if (!currentEditCostId) {
      const cost = {
        id:
          window.crypto && window.crypto.randomUUID
            ? window.crypto.randomUUID()
            : "c_" + Date.now().toString(36),
        date,
        category,
        amount,
        note,
        applies
      };

      state.costs.push(cost);
      D.saveState(state);
      renderAll();
      U.toast("Cost added", "good");
    } else {
      const idx = state.costs.findIndex((c) => c.id === currentEditCostId);
      if (idx === -1) {
        U.toast("Cost to update not found", "bad");
        resetCostEditMode();
        return;
      }

      const cost = state.costs[idx];
      cost.date = date;
      cost.category = category;
      cost.amount = amount;
      cost.note = note;
      cost.applies = applies;

      D.saveState(state);
      renderAll();
      U.toast("Cost updated", "good");
      resetCostEditMode();
    }
  }

  // ---------- delete entry / cost ----------

  function handleDeleteEntry(id) {
    if (!id) {
      U.toast("Missing entry id", "bad");
      return;
    }
    const idx = state.entries.findIndex((e) => e.id === id);
    if (idx === -1) {
      U.toast("Entry not found", "bad");
      return;
    }
    const ok = window.confirm("Delete this entry?");
    if (!ok) return;

    state.entries.splice(idx, 1);
    if (currentEditId === id) {
      resetEditMode();
    }
    D.saveState(state);
    renderAll();
    U.toast("Entry deleted", "good");
  }

  function handleDeleteCost(id) {
    if (!id) {
      U.toast("Missing cost id", "bad");
      return;
    }
    const idx = state.costs.findIndex((c) => c.id === id);
    if (idx === -1) {
      U.toast("Cost not found", "bad");
      return;
    }
    const ok = window.confirm("Delete this cost?");
    if (!ok) return;

    state.costs.splice(idx, 1);
    if (currentEditCostId === id) {
      resetCostEditMode();
    }
    D.saveState(state);
    renderAll();
    U.toast("Cost deleted", "good");
  }

  function onLogTableClick(ev) {
    const target = ev.target;
    if (!target) return;
    const btn = target.closest("button[data-action]");
    if (!btn) return;

    const action = btn.getAttribute("data-action");
    const id = btn.getAttribute("data-id");

    if (action === "delete-entry") {
      handleDeleteEntry(id);
    } else if (action === "edit-entry") {
      startEditEntry(id);
    }
  }

  function onCostTableClick(ev) {
    const target = ev.target;
    if (!target) return;
    const btn = target.closest("button[data-action]");
    if (!btn) return;

    const action = btn.getAttribute("data-action");
    const id = btn.getAttribute("data-id");

    if (action === "delete-cost") {
      handleDeleteCost(id);
    } else if (action === "edit-cost") {
      startEditCost(id);
    }
  }

  // ---------- CSV export helpers ----------

  function csvEscape(value) {
    if (value == null) return "";
    const s = String(value);
    if (s.includes('"') || s.includes(",") || s.includes("\n")) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function downloadCSV(filename, csvText) {
    try {
      const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      U.toast("CSV exported", "good");
    } catch (e) {
      console.error("CSV download failed", e);
      U.toast("CSV export failed", "bad");
    }
  }

  function exportEntriesCSV() {
    if (!state.entries.length) {
      U.toast("No entries to export", "info");
      return;
    }

    const header = [
      "Date",
      "kWh",
      "Type",
      "Price_per_kWh",
      "Cost",
      "Note"
    ];

    const rows = state.entries
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((e) => {
        const cost = (e.kwh || 0) * (e.price || 0);
        return [
          csvEscape(e.date || ""),
          csvEscape(e.kwh != null ? e.kwh : ""),
          csvEscape(e.type || ""),
          csvEscape(e.price != null ? e.price : ""),
          csvEscape(cost),
          csvEscape(e.note || "")
        ].join(",");
      });

    const csv = [header.join(","), ...rows].join("\n");
    const today = todayISO();
    const filename = `ev_log_entries_${today}.csv`;
    downloadCSV(filename, csv);
  }

  function exportCostsCSV() {
    if (!state.costs.length) {
      U.toast("No costs to export", "info");
      return;
    }

    const header = ["Date", "Category", "Amount", "Note", "AppliesTo"];

    const rows = state.costs
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((c) => {
        return [
          csvEscape(c.date || ""),
          csvEscape(c.category || ""),
          csvEscape(c.amount != null ? c.amount : ""),
          csvEscape(c.note || ""),
          csvEscape(c.applies || "other")
        ].join(",");
      });

    const csv = [header.join(","), ...rows].join("\n");
    const today = todayISO();
    const filename = `ev_log_costs_${today}.csv`;
    downloadCSV(filename, csv);
  }

  function ensureExportButtons() {
    const logTable = $("logTable");
    if (logTable && !$("exportEntriesCsv")) {
      const btn = document.createElement("button");
      btn.id = "exportEntriesCsv";
      btn.textContent = "Export log CSV";
      btn.type = "button";
      btn.style.marginTop = "6px";
      btn.addEventListener("click", exportEntriesCSV);
      if (logTable.parentNode) {
        logTable.parentNode.insertBefore(btn, logTable.nextSibling);
      }
    }

    const costTable = $("costTable");
    if (costTable && !$("exportCostsCsv")) {
      const btn2 = document.createElement("button");
      btn2.id = "exportCostsCsv";
      btn2.textContent = "Export costs CSV";
      btn2.type = "button";
      btn2.style.marginTop = "6px";
      btn2.addEventListener("click", exportCostsCSV);
      if (costTable.parentNode) {
        costTable.parentNode.insertBefore(btn2, costTable.nextSibling);
      }
    }
  }

  // ---------- backup / restore ----------

  async function exportBackup() {
    try {
      const backup = JSON.stringify(state);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(backup);
        U.toast("Backup copied to clipboard", "good");
      } else {
        const ok = window.prompt("Backup JSON (copy this):", backup);
        if (ok !== null) {
          U.toast("Backup shown (copy manually)", "info");
        }
      }
    } catch (e) {
      console.error(e);
      U.toast("Backup failed", "bad");
    }
  }

  function importBackup() {
    const raw = window.prompt(
      "Paste backup JSON here. Current data will be replaced."
    );
    if (!raw) {
      return;
    }
    try {
      const parsed = JSON.parse(raw);

      if (
        typeof parsed !== "object" ||
        !parsed ||
        !Array.isArray(parsed.entries) ||
        !parsed.settings
      ) {
        U.toast("Invalid backup format", "bad");
        return;
      }

      state.entries = Array.isArray(parsed.entries) ? parsed.entries : [];
      state.costs = Array.isArray(parsed.costs) ? parsed.costs : [];
      state.settings = Object.assign({}, state.settings, parsed.settings);

      ensureCostAppliesDefaults();

      D.saveState(state);
      syncSettingsToInputs();
      renderAll();
      resetEditMode();
      resetCostEditMode();
      U.toast("Backup restored", "good");
    } catch (e) {
      console.error(e);
      U.toast("Import failed", "bad");
    }
  }

  // ---------- wiring ----------

  function wire() {
    $("date").value = todayISO();
    $("c_date").value = todayISO();

    // по подразбиране OTHER за нови разходи
    const appliesSelect = $("c_applies");
    if (appliesSelect && !appliesSelect.value) {
      appliesSelect.value = "other";
    }

    $("addEntry").addEventListener("click", onAddEntry);
    $("sameAsLast").addEventListener("click", onSameAsLast);

    $("c_add").addEventListener("click", onAddCost);

    $("savePrices").addEventListener("click", saveSettingsFromInputs);
    $("exportBackup").addEventListener("click", exportBackup);
    $("importBackup").addEventListener("click", importBackup);

    const logContainer = $("logTable");
    if (logContainer) {
      logContainer.addEventListener("click", onLogTableClick);
    }

    const costContainer = $("costTable");
    if (costContainer) {
      costContainer.addEventListener("click", onCostTableClick);
    }

    syncSettingsToInputs();
    wireTabs();
    ensureCostFilterControls();
    renderAll();
    ensureExportButtons();
    resetEditMode();
    resetCostEditMode();
  }

  wire();
})();
