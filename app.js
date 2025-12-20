// app.js – main wiring

(function () {
  const D = window.EVData;
  const C = window.EVCalc;
  const U = window.EVUI;

  const $ = (id) => document.getElementById(id);

  const state = D.loadState();

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

  // ---------- rendering ----------

  function renderAll() {
    U.renderLogTable("logTable", state.entries);
    U.renderCostTable("costTable", state.costs);

    const summary = C.buildSummary(state.entries);
    U.renderSummary(
      ["summary_this", "summary_last", "summary_avg"],
      summary
    );

    const cmp = C.buildCompare(state.entries, state.settings);
    U.renderCompare("compareStats", cmp);
  }

  // ---------- add entry ----------

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

    const entry = {
      id: (window.crypto && window.crypto.randomUUID)
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

  // ---------- add cost ----------

  function onAddCost() {
    const date = $("c_date").value || todayISO();
    const category = $("c_category").value;
    const amount = parseFloat($("c_amount").value);
    const note = $("c_note").value.trim();

    if (isNaN(amount) || amount <= 0) {
      U.toast("Please enter amount", "bad");
      return;
    }

    const cost = {
      id: (window.crypto && window.crypto.randomUUID)
        ? window.crypto.randomUUID()
        : "c_" + Date.now().toString(36),
      date,
      category,
      amount,
      note
    };

    state.costs.push(cost);
    D.saveState(state);
    renderAll();
    U.toast("Cost added", "good");
  }

  // ---------- delete entry ----------

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
    D.saveState(state);
    renderAll();
    U.toast("Entry deleted", "good");
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
    }
  }

  // ---------- backup / restore ----------

  async function exportBackup() {
    try {
      const backup = JSON.stringify(state);
      // първо опитваме в clipboard
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(backup);
        U.toast("Backup copied to clipboard", "good");
      } else {
        // fallback – prompt за копиране ръчно
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

      // базова проверка
      if (
        typeof parsed !== "object" ||
        !parsed ||
        !Array.isArray(parsed.entries) ||
        !parsed.settings
      ) {
        U.toast("Invalid backup format", "bad");
        return;
      }

      // презаписваме текущото state
      state.entries = Array.isArray(parsed.entries) ? parsed.entries : [];
      state.costs = Array.isArray(parsed.costs) ? parsed.costs : [];
      state.settings = Object.assign({}, state.settings, parsed.settings);

      D.saveState(state);
      syncSettingsToInputs();
      renderAll();
      U.toast("Backup restored", "good");
    } catch (e) {
      console.error(e);
      U.toast("Import failed", "bad");
    }
  }

  // ---------- wiring ----------

  function wire() {
    // default date
    $("date").value = todayISO();
    $("c_date").value = todayISO();

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

    syncSettingsToInputs();
    wireTabs();
    renderAll();
  }

  wire();
})();