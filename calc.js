/* calc.js - month helpers + totals + filters + compare */
(function () {
  const { num } = window.EVData;

  function fmtGBP(x, decimals = 2) { return "£" + (Number.isFinite(x) ? x.toFixed(decimals) : "0.00"); }
  function fmt(x, decimals = 1) { return (Number.isFinite(x) ? x.toFixed(decimals) : "0.0"); }

  function monthKeyFromISO(iso) {
    return (typeof iso === "string" && iso.length >= 7) ? iso.slice(0, 7) : "unknown";
  }
  function thisMonthKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }
  function lastMonthKey() {
    const [y, m] = thisMonthKey().split("-").map(n => parseInt(n, 10));
    const mm = m - 1;
    if (mm >= 1) return `${y}-${String(mm).padStart(2, "0")}`;
    return `${y - 1}-12`;
  }

  function applyMonthFilterEntries(entries, currentFilter) {
    if (currentFilter === "all") return entries;
    const thisKey = thisMonthKey();
    const lastKey = lastMonthKey();
    return entries.filter(e => {
      const k = monthKeyFromISO(e.date);
      return currentFilter === "this" ? k === thisKey : k === lastKey;
    });
  }
  function applyMonthFilterCosts(costs, currentFilter) {
    if (currentFilter === "all") return costs;
    const thisKey = thisMonthKey();
    const lastKey = lastMonthKey();
    return costs.filter(c => {
      const k = monthKeyFromISO(c.date);
      return currentFilter === "this" ? k === thisKey : k === lastKey;
    });
  }

  function calcTotalsForEntries(state, entries) {
    const basePublic = num(state.prices.public);
    let kwh = 0, cost = 0, saved = 0, publicCost = 0;
    const byType = {};
    for (const e of entries) {
      const ek = num(e.kwh);
      const ep = num(e.price);
      const ec = ek * ep;
      kwh += ek;
      cost += ec;
      const t = e.type || "custom";
      if (!byType[t]) byType[t] = { kwh: 0, cost: 0, count: 0 };
      byType[t].kwh += ek; byType[t].cost += ec; byType[t].count++;
      const isPublic = (t === "public" || t === "public_exp");
      if (isPublic) publicCost += ec;
      if (!isPublic) saved += (basePublic - ep) * ek;
    }
    return { kwh, cost, saved, publicCost, byType, basePublic };
  }

  function spreadFactorForCurrentPeriod(spread, currentFilter) {
    if (currentFilter === "all") return 1;
    if (spread === "yearly") return 1 / 12;
    if (spread === "monthly") return 1;
    return 1;
  }
  function calcCostsTotals(costs, currentFilter, vehicle /* 'ev'|'ice'|null */) {
    let total = 0;
    const byCat = {};
    const f = (spread) => spreadFactorForCurrentPeriod(spread, currentFilter);
    for (const c of costs) {
      if (vehicle && c.vehicle !== vehicle) continue;
      const a = num(c.amount) * f(c.spread);
      total += a;
      const k = c.category || "other";
      if (!byCat[k]) byCat[k] = { total: 0, count: 0 };
      byCat[k].total += a;
      byCat[k].count++;
    }
    return { total, byCat };
  }

  // ---- Search includes note + attachments (Option 1) ----
  function entryMatchesSearch(e, searchLower) {
    if (!searchLower) return true;
    const note = (e.note || "").toLowerCase();
    if (note.includes(searchLower)) return true;

    const atts = Array.isArray(e.attachments) ? e.attachments : [];
    for (const a of atts) {
      const n = (a?.name || "").toLowerCase();
      const u = (a?.url || "").toLowerCase();
      if (n.includes(searchLower) || u.includes(searchLower)) return true;
    }
    return false;
  }

  function passesFiltersEntry(e, uiFilter) {
    const s = (uiFilter.search || "").trim().toLowerCase();
    if (!entryMatchesSearch(e, s)) return false;

    if (uiFilter.type && uiFilter.type !== "all") {
      if ((e.type || "custom") !== uiFilter.type) return false;
    }
    if (uiFilter.from && e.date < uiFilter.from) return false;
    if (uiFilter.to && e.date > uiFilter.to) return false;
    return true;
  }

  function applyAllEntryFilters(state, currentFilter, uiFilter) {
    const monthFiltered = applyMonthFilterEntries(state.entries, currentFilter);
    return monthFiltered.filter(e => passesFiltersEntry(e, uiFilter));
  }

  function compareRealistic(state, chargingTotalsPeriod, costsPeriod, currentFilter) {
    const evMPKWh = Math.max(0.1, num(state.compare.ev_mpkwh));
    const iceMPG = Math.max(0.1, num(state.compare.ice_mpg));
    const fuelPrice = Math.max(0, num(state.compare.fuel_price));
    const iceMaintFallback = Math.max(0, num(state.compare.ice_maint_per_mile));

    const miles = chargingTotalsPeriod.kwh * evMPKWh;

    const evCosts = calcCostsTotals(costsPeriod, currentFilter, "ev").total;
    const evTotal = chargingTotalsPeriod.cost + evCosts;

    const ukGallons = miles / iceMPG;
    const liters = ukGallons * 4.54609;
    const fuelCost = liters * fuelPrice;

    const iceCostsTotals = calcCostsTotals(costsPeriod, currentFilter, "ice");
    const hasIceCosts = (iceCostsTotals.total > 0.0001);
    const iceMaint = hasIceCosts ? iceCostsTotals.total : (miles * iceMaintFallback);

    const iceTotal = fuelCost + iceMaint;
    const diff = iceTotal - evTotal;

    const evPerMile = miles > 0 ? (evTotal / miles) : 0;
    const icePerMile = miles > 0 ? (iceTotal / miles) : 0;

    return { miles, evCosts, iceCosts: iceCostsTotals.total, hasIceCosts, evTotal, fuelCost, iceMaint, iceTotal, diff, evPerMile, icePerMile, liters };
  }

  window.EVCalc = {
    fmtGBP,
    fmt,
    monthKeyFromISO,
    thisMonthKey,
    lastMonthKey,
    applyMonthFilterEntries,
    applyMonthFilterCosts,
    calcTotalsForEntries,
    calcCostsTotals,
    applyAllEntryFilters,
    compareRealistic
  };
})();
