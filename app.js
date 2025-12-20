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
  let currentFilter = localStorage.getItem("ev_month_filter") || "all";

  // all | this | last
  const uiFilter = { search: "", type: "all", from: "", to: "" };

  // Undo
  let lastDeleted = null;
  let undoTimer = null;

  function syncInputs(state) {
    $("p_public").value = state.settings.public;
    $("p_public_exp").value = state.settings.publicExp;
    $("p_home").value = state.settings.home;
    $("p_home_exp").value = state.settings.homeExp;
    $("p_ice").value = state.settings.icePerLitre;
    $("p_ice_mpg").value = state.settings.iceMpg;
    $("p_ev_kwhmi").value = state.settings.evEfficiency;
  }

  function addEntry(state) {
    const date = $("e_date").value;
    const kwh = parseFloat($("e_kwh").value);
    const type = $("e_type").value;
    const price = parseFloat($("e_price").value);
    const note = $("e_note").value.trim();

    if (!date || isNaN(kwh) || isNaN(price)) {
      U.toast("Missing date, kWh or price ❗", "bad");
      return;
    }

    const entry = { id: crypto.randomUUID(), date, kwh, type, price, note };
    state.entries.push(entry);
    D.saveState(state);
    render(state);
    U.toast("Added ✔", "good");
  }

  function addCost(state) {
    const date = $("c_date").value;
    const applies = $("c_applies").value;
    const category = $("c_category").value;
    const amount = parseFloat($("c_amount").value);
    const mileage = $("c_mileage").value.trim();
    const note = $("c_note").value.trim();
    const spread = $("c_spread").value;

    if (!date || isNaN(amount)) {
      U.toast("Missing date or amount ❗", "bad");
      return;
    }

    const cost = {
      id: crypto.randomUUID(),
      date,
      applies,
      category,
      amount,
      mileage,
      note,
      spread,
    };

    state.costs.push(cost);
    D.saveState(state);
    render(state);
    U.toast("Cost added ✔", "good");
  }

  function deleteEntry(state, id) {
    const idx = state.entries.findIndex((x) => x.id === id);
    if (idx === -1) return;

    lastDeleted = state.entries[idx];
    state.entries.splice(idx, 1);
    D.saveState(state);
    render(state);

    U.toast("Deleted ❌ Undo?", "warn");
  }

  function undoDelete(state) {
    if (lastDeleted) {
      state.entries.push(lastDeleted);
      D.saveState(state);
      render(state);
      U.toast("Undo ✔", "good");
      lastDeleted = null;
    }
  }

  function clearState(state) {
    if (!confirm("Delete ALL entries + ALL costs?")) return;
    state.entries = [];
    state.costs = [];
    D.saveState(state);
    render(state);
    U.toast("Cleared ✔", "good");
  }

  $("monthFilter").addEventListener("change", (e) => {
    currentFilter = e.target.value;
    localStorage.setItem("ev_month_filter", currentFilter);
    render(state);
  });

  $("e_note").addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      addEntry(state);
    }
  });

  $("c_note").addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      addCost(state);
    }
  });

  function wireTabs() {
    const buttons = Array.from(document.querySelectorAll(".tabbtn"));
    function activate(tabName) {
      buttons.forEach((b) => b.classList.toggle("active", b.dataset.tab === tabName));
      document.querySelectorAll(".tab").forEach((t) =>
        t.classList.toggle("active", t.dataset.tab === tabName)
      );
    }
    buttons.forEach((b) =>
      b.addEventListener("click", () => activate(b.dataset.tab))
    );
  }

  function render(state) {
    syncInputs(state);

    C.fillLog(state, currentFilter);
    C.fillSummary(state);
    C.fillCosts(state, currentFilter);
    C.fillCompare(state);
  }

  const state = D.loadState();
  wireTabs();
  render(state);
})();
