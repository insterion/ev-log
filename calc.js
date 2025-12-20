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

  function buildSummary(entries) {
    if (!entries.length) return { thisMonth: null, lastMonth: null, avg: null };

    const map = groupByMonth(entries);
    const keys = Array.from(map.keys()).sort(); // ascending

    const now = new Date();
    const thisKey = now.toISOString().slice(0, 7);
    const lastDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastKey = lastDate.toISOString().slice(0, 7);

    const thisMonth = map.get(thisKey)
      ? monthTotals(map.get(thisKey))
      : null;
    const lastMonth = map.get(lastKey)
      ? monthTotals(map.get(lastKey))
      : null;

    // average over all months we have
    const monthTotalsArr = keys.map((k) => monthTotals(map.get(k)));
    const totalKwh = monthTotalsArr.reduce((s, m) => s + m.kwh, 0);
    const totalCost = monthTotalsArr.reduce((s, m) => s + m.cost, 0);
    const avg = {
      kwh: totalKwh / monthTotalsArr.length,
      cost: totalCost / monthTotalsArr.length
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

    return {
      totalKwh,
      evCost,
      miles,
      iceCost,
      iceMpg,
      icePerLitre,
      evMilesPerKwh
    };
  }

  window.EVCalc = {
    buildSummary,
    buildCompare
  };
})();
