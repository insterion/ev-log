// calc.js – simple calculations

(function () {
  function getMonthKey(dateStr) {
    if (!dateStr) return "";
    return dateStr.slice(0, 7); // "YYYY-MM"
  }

  function groupByMonth(entries) {
    const map = new Map();
    for (const e of entries) {
      const key = getMonthKey(e.date);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(e);
    }
    return map;
  }

  function monthTotals(entries) {
    const kwh = entries.reduce((s, e) => s + (e.kwh || 0), 0);
    const cost = entries.reduce((s, e) => s + (e.kwh * e.price || 0), 0);
    return { kwh, cost, count: entries.length };
  }

  function daysInMonthKey(key) {
    // key = "YYYY-MM"
    if (!key || key.length < 7) return 30;
    const parts = key.split("-");
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10); // 1–12
    if (!year || !month) return 30;
    // new Date(year, month, 0) -> last day of that month
    return new Date(year, month, 0).getDate();
  }

  function buildSummary(entries) {
    if (!entries.length) return { thisMonth: null, lastMonth: null, avg: null };

    const map = groupByMonth(entries);
    const keys = Array.from(map.keys()).sort(); // ascending

    const now = new Date();
    const thisKey = now.toISOString().slice(0, 7);
    const lastDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastKey = lastDate.toISOString().slice(0, 7);

    let thisMonth = null;
    let lastMonth = null;

    const thisArr = map.get(thisKey);
    if (thisArr) {
      thisMonth = monthTotals(thisArr);
      const dim = daysInMonthKey(thisKey);
      thisMonth.avgPrice =
        thisMonth.kwh > 0 ? thisMonth.cost / thisMonth.kwh : 0;
      thisMonth.perDay = dim > 0 ? thisMonth.cost / dim : 0;
    }

    const lastArr = map.get(lastKey);
    if (lastArr) {
      lastMonth = monthTotals(lastArr);
      const dimL = daysInMonthKey(lastKey);
      lastMonth.avgPrice =
        lastMonth.kwh > 0 ? lastMonth.cost / lastMonth.kwh : 0;
      lastMonth.perDay = dimL > 0 ? lastMonth.cost / dimL : 0;
    }

    // average over all months we have
    const monthTotalsArr = keys.map((k) => monthTotals(map.get(k)));
    const totalKwh = monthTotalsArr.reduce((s, m) => s + m.kwh, 0);
    const totalCost = monthTotalsArr.reduce((s, m) => s + m.cost, 0);
    const avg = {
      kwh: totalKwh / monthTotalsArr.length,
      cost: totalCost / monthTotalsArr.length,
      avgPrice: totalKwh > 0 ? totalCost / totalKwh : 0
    };

    return { thisMonth, lastMonth, avg };
  }

  function buildCompare(entries, settings) {
    if (!entries.length) return null;

    const totalKwh = entries.reduce((s, e) => s + (e.kwh || 0), 0);
    const evCost = entries.reduce((s, e) => s + (e.kwh * e.price || 0), 0);

    // Assumptions
    const evMilesPerKwh = 3.0;
    const iceMpg = 45;
    const icePerLitre = 1.50;

    const miles = totalKwh * evMilesPerKwh;

    // mpg (imperial) -> litres:
    // miles / mpg = gallons, gallons * 4.546 = litres
    const gallons = miles / iceMpg;
    const litres = gallons * 4.546;
    const iceCost = litres * icePerLitre;

    const evPerMile = miles > 0 ? evCost / miles : 0;
    const icePerMile = miles > 0 ? iceCost / miles : 0;

    // home charger payoff vs "everything at public rate"
    const publicRate =
      settings && typeof settings.public === "number"
        ? settings.public
        : 0;

    let allPublicCost = null;
    let savedVsPublic = null;

    if (publicRate > 0) {
      allPublicCost = totalKwh * publicRate;
      savedVsPublic = allPublicCost - evCost;
    }

    const hw =
      settings && typeof settings.chargerHardware === "number"
        ? settings.chargerHardware
        : 0;
    const inst =
      settings && typeof settings.chargerInstall === "number"
        ? settings.chargerInstall
        : 0;
    const chargerInvestment = hw + inst;

    let remainingToRecover = null;
    if (chargerInvestment > 0 && savedVsPublic !== null) {
      remainingToRecover = chargerInvestment - savedVsPublic;
    }

    return {
      totalKwh,
      evCost,
      miles,
      iceCost,
      iceMpg,
      icePerLitre,
      evMilesPerKwh,
      evPerMile,
      icePerMile,
      publicRate,
      allPublicCost,
      savedVsPublic,
      chargerInvestment,
      remainingToRecover
    };
  }

  window.EVCalc = {
    buildSummary,
    buildCompare
  };
})();
