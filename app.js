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
  }

  function saveSettingsFromInputs() {
    const s = state.settings;
    s.public = parseFloat($("p_public").value) || 0;
    s.public_xp = parseFloat($("p_public_xp").value) || 0;
    s.home = parseFloat($("p_home").value) || 0;
    s.home_xp = parseFloat($("p_home_xp").value) || 0;
    D.saveState(state);
    U.toast("Prices saved", "good");
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
      id: crypto.randomUUID(),
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
      id: crypto.randomUUID(),
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

  // ---------- wiring ----------

  function wire() {
    // default date
    $("date").value = todayISO();
    $("c_date").value = todayISO();

    $("addEntry").addEventListener("click", onAddEntry);
    $("sameAsLast").addEventListener("click", onSameAsLast);

    $("c_add").addEventListener("click", onAddCost);

    $("savePrices").addEventListener("click", saveSettingsFromInputs);

    syncSettingsToInputs();
    wireTabs();
    renderAll();
  }

  wire();
})();
