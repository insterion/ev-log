// ui.js – formatting + rendering helpers

(function () {
  function fmtGBP(v) {
    if (isNaN(v)) return "£0.00";
    return "£" + v.toFixed(2);
  }

  function fmtNum(v, digits = 1) {
    if (isNaN(v)) return "0";
    return v.toFixed(digits);
  }

  function fmtDate(d) {
    // expect "YYYY-MM-DD"
    return d || "";
  }

  function toast(msg, kind = "info") {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    el.className = "";
    el.classList.add("show", kind);
    setTimeout(() => {
      el.classList.remove("show");
    }, 1700);
  }

  // ------- render charging log -------

  function renderLogTable(containerId, entries) {
    const el = document.getElementById(containerId);
    if (!el) return;

    if (!entries.length) {
      el.innerHTML = "<p>No entries yet.</p>";
      return;
    }

    const rows = entries
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((e) => {
        const typeLabel =
          e.type === "public"
            ? "Public"
            : e.type === "public-xp"
            ? "Public xp"
            : e.type === "home"
            ? "Home"
            : "Home xp";

        const cost = e.kwh * e.price;

        return `<tr>
          <td>${fmtDate(e.date)}</td>
          <td>${fmtNum(e.kwh, 1)}</td>
          <td><span class="badge">${typeLabel}</span></td>
          <td>${fmtGBP(cost)}</td>
          <td>${e.note ? e.note.replace(/</g, "&lt;") : ""}</td>
        </tr>`;
      });

    const totalKwh = entries.reduce((s, e) => s + (e.kwh || 0), 0);
    const totalCost = entries.reduce(
      (s, e) => s + (e.kwh * e.price || 0),
      0
    );

    const html = `
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>kWh</th>
            <th>Type</th>
            <th>£</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          ${rows.join("")}
        </tbody>
        <tfoot>
          <tr class="total-row">
            <td>Total</td>
            <td>${fmtNum(totalKwh, 1)}</td>
            <td></td>
            <td>${fmtGBP(totalCost)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    `;

    el.innerHTML = html;
  }

  // ------- render costs -------

  function renderCostTable(containerId, costs) {
    const el = document.getElementById(containerId);
    if (!el) return;

    if (!costs.length) {
      el.innerHTML = "<p>No costs yet.</p>";
      return;
    }

    const sorted = costs
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date));

    const rows = sorted.map((c) => {
      return `<tr>
        <td>${fmtDate(c.date)}</td>
        <td><span class="badge">${c.category}</span></td>
        <td>${fmtGBP(c.amount)}</td>
        <td>${c.note ? c.note.replace(/</g, "&lt;") : ""}</td>
      </tr>`;
    });

    const total = sorted.reduce((s, c) => s + (c.amount || 0), 0);

    // totals by category
    const catMap = new Map();
    for (const c of sorted) {
      const key = c.category || "Other";
      const prev = catMap.get(key) || 0;
      catMap.set(key, prev + (c.amount || 0));
    }

    const catRows = Array.from(catMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(
        ([cat, sum]) => `<tr>
          <td>${cat}</td>
          <td>${fmtGBP(sum)}</td>
        </tr>`
      );

    el.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Category</th>
            <th>£</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          ${rows.join("")}
        </tbody>
        <tfoot>
          <tr class="total-row">
            <td>Total</td>
            <td></td>
            <td>${fmtGBP(total)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>

      <h4 style="margin-top:10px;">Totals by category</h4>
      <table>
        <thead>
          <tr>
            <th>Category</th>
            <th>Total £</th>
          </tr>
        </thead>
        <tbody>
          ${catRows.join("")}
        </tbody>
      </table>
    `;
  }

  // ------- render summary -------

  function renderSummary(containerIds, summary) {
    const [idThis, idLast, idAvg] = containerIds.map((id) =>
      document.getElementById(id)
    );
    if (!idThis || !idLast || !idAvg) return;

    function block(data) {
      if (!data) return "<p>No data.</p>";

      const avgPriceLine =
        data.avgPrice && data.avgPrice > 0
          ? `<p>Avg price: <strong>£${data.avgPrice.toFixed(
              3
            )}</strong> / kWh</p>`
          : "";

      const perDayLine =
        data.perDay && data.perDay > 0
          ? `<p>~ <strong>${fmtGBP(
              data.perDay
            )}</strong> / day (calendar)</p>`
          : "";

      const sessionsLine =
        data.count != null
          ? `<p>Sessions: <strong>${data.count}</strong></p>`
          : "";

      return `
        <p>kWh: <strong>${fmtNum(data.kwh, 1)}</strong></p>
        <p>Cost: <strong>${fmtGBP(data.cost)}</strong></p>
        ${sessionsLine}
        ${avgPriceLine}
        ${perDayLine}
      `;
    }

    idThis.innerHTML = block(summary.thisMonth);
    idLast.innerHTML = block(summary.lastMonth);

    idAvg.innerHTML = summary.avg
      ? `
      <p>Avg kWh / month: <strong>${fmtNum(
        summary.avg.kwh,
        1
      )}</strong></p>
      <p>Avg £ / month: <strong>${fmtGBP(summary.avg.cost)}</strong></p>
      <p>Avg price (all months): <strong>£${summary.avg.avgPrice.toFixed(
        3
      )}</strong> / kWh</p>
    `
      : "<p>No data.</p>";
  }

  // ------- render compare -------

  function renderCompare(containerId, data) {
    const el = document.getElementById(containerId);
    if (!el) return;

    if (!data || isNaN(data.evCost)) {
      el.innerHTML = "<p>Not enough data yet.</p>";
      return;
    }

    const diff = data.iceCost - data.evCost;
    const sign = diff > 0 ? "saved" : "extra";

    el.innerHTML = `
      <p>Total kWh (all time): <strong>${fmtNum(
        data.totalKwh,
        1
      )}</strong></p>
      <p>Estimated miles (@ ${fmtNum(
        data.evMilesPerKwh,
        1
      )} mi/kWh): <strong>${fmtNum(data.miles, 0)}</strong></p>
      <p>EV cost: <strong>${fmtGBP(data.evCost)}</strong></p>
      <p>ICE cost (approx): <strong>${fmtGBP(data.iceCost)}</strong></p>
      <p>Difference: <strong>${fmtGBP(
        Math.abs(diff)
      )}</strong> (${sign})</p>
      <p class="small">
        Assumptions: ICE ${data.iceMpg} mpg, £${data.icePerLitre.toFixed(
      2
    )}/litre unleaded, EV ${fmtNum(
      data.evMilesPerKwh,
      1
    )} mi/kWh. For a quick feeling only.
      </p>
    `;
  }

  window.EVUI = {
    fmtGBP,
    fmtNum,
    toast,
    renderLogTable,
    renderCostTable,
    renderSummary,
    renderCompare
  };
})();
