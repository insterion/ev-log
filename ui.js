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
        const safeNote = e.note ? e.note.replace(/</g, "&lt;") : "";
        const idAttr = e.id ? String(e.id) : "";

        return `<tr>
          <td>${fmtDate(e.date)}</td>
          <td>${fmtNum(e.kwh, 1)}</td>
          <td><span class="badge">${typeLabel}</span></td>
          <td>${fmtGBP(cost)}</td>
          <td>${safeNote}</td>
          <td>
            <button
              type="button"
              class="btn-small"
              data-action="edit-entry"
              data-id="${idAttr}"
              title="Edit this entry"
              style="padding:2px 6px;font-size:0.8rem;margin-right:4px;"
            >
              Edit
            </button>
            <button
              type="button"
              class="btn-small"
              data-action="delete-entry"
              data-id="${idAttr}"
              title="Delete this entry"
              style="padding:2px 8px;font-size:0.8rem;"
            >
              ✕
            </button>
          </td>
        </tr>`;
      });

    const totalKwh = entries.reduce((s, e) => s + (e.kwh || 0), 0);
    const totalCost = entries.reduce(
      (s, e) => s + (e.kwh * e.price || 0),
      0
    );
    const sessions = entries.length;

    const summaryBlock = `
      <p style="margin:4px 0 6px;font-size:0.85rem;color:#cccccc;">
        Total so far:
        <strong>${fmtNum(totalKwh, 1)} kWh</strong> •
        <strong>${fmtGBP(totalCost)}</strong> •
        <strong>${sessions}</strong> sessions
      </p>
    `;

    const html = `
      ${summaryBlock}
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>kWh</th>
            <th>Type</th>
            <th>£</th>
            <th>Note</th>
            <th>Actions</th>
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
      const safeNote = c.note ? c.note.replace(/</g, "&lt;") : "";
      const idAttr = c.id ? String(c.id) : "";

      const appliesRaw = (c.applies || "other").toLowerCase();
      let appliesLabel = "Other";
      if (appliesRaw === "ev") appliesLabel = "EV";
      else if (appliesRaw === "ice") appliesLabel = "ICE";
      else if (appliesRaw === "both") appliesLabel = "Both";
      else appliesLabel = "Other";

      return `<tr>
        <td>${fmtDate(c.date)}</td>
        <td><span class="badge">${c.category}</span></td>
        <td><span class="badge">${appliesLabel}</span></td>
        <td>${fmtGBP(c.amount)}</td>
        <td>${safeNote}</td>
        <td>
          <button
            type="button"
            class="btn-small"
            data-action="edit-cost"
            data-id="${idAttr}"
            title="Edit this cost"
            style="padding:2px 6px;font-size:0.8rem;margin-right:4px;"
          >
            Edit
          </button>
          <button
            type="button"
            class="btn-small"
            data-action="delete-cost"
            data-id="${idAttr}"
            title="Delete this cost"
            style="padding:2px 8px;font-size:0.8rem;"
          >
            ✕
          </button>
        </td>
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

    const legend = `
      <p class="small" style="margin-top:8px;line-height:1.35;">
        <strong>For</strong> means which vehicle the cost applies to:
        <strong>EV</strong> = electric car only,
        <strong>ICE</strong> = petrol/diesel car only,
        <strong>Both</strong> = shared/combined cost,
        <strong>Other</strong> = not tied to a specific car.
      </p>
    `;

    el.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Category</th>
            <th>For</th>
            <th>£</th>
            <th>Note</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rows.join("")}
        </tbody>
        <tfoot>
          <tr class="total-row">
            <td>Total</td>
            <td></td>
            <td></td>
            <td>${fmtGBP(total)}</td>
            <td></td>
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

      ${legend}
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

    const miles = data.miles || 0;
    const evPerMile =
      miles > 0 ? data.evPerMile ?? data.evCost / miles : 0;
    const icePerMile =
      miles > 0 ? data.icePerMile ?? data.iceCost / miles : 0;

    let extraLine = "";
    if (diff > 1) {
      extraLine = `<p>For your recorded EV miles, ICE would cost <strong>${fmtGBP(
        diff
      )}</strong> more.</p>`;
    } else if (diff < -1) {
      extraLine = `<p>For your recorded EV miles, EV would cost <strong>${fmtGBP(
        Math.abs(diff)
      )}</strong> more than ICE (check prices/assumptions).</p>`;
    } else {
      extraLine = `<p>For your recorded EV miles, EV and ICE are roughly the same cost.</p>`;
    }

    // ---- maintenance + all-in EV vs ICE ----
    const maintEv = Number(data.maintEv ?? 0);
    const maintIce = Number(data.maintIce ?? 0);
    const maintBoth = Number(data.maintBoth ?? 0);
    const maintOther = Number(data.maintOther ?? 0);

    const evTotalAll = data.evCost + maintEv;
    const iceTotalAll = data.iceCost + maintIce;
    const diffAll = iceTotalAll - evTotalAll;

    // ---- quick summary блок ----
    let topSummary = "";
    if (miles > 0) {
      const per1000Ev = evPerMile * 1000;
      const per1000Ice = icePerMile * 1000;
      const per1000Diff = per1000Ice - per1000Ev;

      let perText = "about the same per 1000 miles";
      if (per1000Diff > 1) perText = "ICE more expensive per 1000 miles";
      else if (per1000Diff < -1) perText = "EV more expensive per 1000 miles";

      let allText = "about the same overall";
      if (diffAll > 1) allText = "ICE more expensive overall";
      else if (diffAll < -1) allText = "EV more expensive overall";

      topSummary = `
        <div style="margin-bottom:8px;padding:6px 8px;border-radius:6px;background:#111;">
          <p style="margin:0 0 4px;"><strong>Quick summary</strong></p>
          <p style="margin:0 0 3px;">
            All-in difference (ICE – EV): <strong>${fmtGBP(
              Math.abs(diffAll)
            )}</strong> (${allText})
          </p>
          <p style="margin:0;">
            Per 1000 miles: EV <strong>${fmtGBP(
              per1000Ev
            )}</strong>, ICE <strong>${fmtGBP(
        per1000Ice
      )}</strong> (${perText})
          </p>
        </div>
      `;
    }

    let maintBlock = "";
    if (maintEv !== 0 || maintIce !== 0 || maintBoth !== 0 || maintOther !== 0) {
      let diffAllText = "about the same";
      if (diffAll > 1) diffAllText = "ICE more expensive";
      else if (diffAll < -1) diffAllText = "EV more expensive";

      maintBlock = `
        <h4 style="margin-top:10px;">EV vs ICE including maintenance</h4>
        <p>Maintenance – EV: <strong>${fmtGBP(
          maintEv
        )}</strong>, ICE: <strong>${fmtGBP(
        maintIce
      )}</strong>, Both: <strong>${fmtGBP(
        maintBoth
      )}</strong>, Other: <strong>${fmtGBP(maintOther)}</strong></p>
        <p>Total EV (energy + EV maintenance): <strong>${fmtGBP(
          evTotalAll
        )}</strong></p>
        <p>Total ICE (fuel + ICE maintenance): <strong>${fmtGBP(
          iceTotalAll
        )}</strong></p>
        <p>Difference (ICE – EV): <strong>${fmtGBP(
          Math.abs(diffAll)
        )}</strong> (${diffAllText})</p>
      `;
    }

    // ---- insurance breakdown ----
    const insEv = Number(data.insuranceEv ?? 0);
    const insIce = Number(data.insuranceIce ?? 0);
    const insBoth = Number(data.insuranceBoth ?? 0);
    const insOther = Number(data.insuranceOther ?? 0);
    const insTotal = Number(data.insuranceTotal ?? 0);

    const insDiff = insIce - insEv;

    let insuranceBlock = "";
    if (insEv !== 0 || insIce !== 0 || insBoth !== 0 || insOther !== 0) {
      let insDiffText = "about the same";
      if (insDiff > 1) insDiffText = "ICE insurance higher";
      else if (insDiff < -1) insDiffText = "EV insurance higher";

      insuranceBlock = `
        <h4 style="margin-top:10px;">Insurance EV vs ICE</h4>
        <p>Insurance – EV: <strong>${fmtGBP(
          insEv
        )}</strong>, ICE: <strong>${fmtGBP(
        insIce
      )}</strong>, Both: <strong>${fmtGBP(
        insBoth
      )}</strong>, Other: <strong>${fmtGBP(insOther)}</strong>, Total: <strong>${fmtGBP(
        insTotal
      )}</strong></p>
        <p>Difference (ICE – EV): <strong>${fmtGBP(
          Math.abs(insDiff)
        )}</strong> (${insDiffText})</p>
      `;
    }

    // блок за зарядното
    let chargerBlock = "";
    if (data.publicRate && data.publicRate > 0) {
      const pr = data.publicRate;
      const allPub = data.allPublicCost ?? 0;
      const saved = data.savedVsPublic ?? 0;
      const invest = data.chargerInvestment ?? 0;
      const remaining =
        typeof data.remainingToRecover === "number" ? data.remainingToRecover : null;

      chargerBlock += `<h4 style="margin-top:10px;">Home charger payoff</h4>`;
      chargerBlock += `<p>If all your EV kWh were at public price (£${pr.toFixed(
        3
      )}/kWh), cost would be <strong>${fmtGBP(allPub)}</strong>.</p>`;
      chargerBlock += `<p>Your actual EV charging cost so far: <strong>${fmtGBP(
        data.evCost
      )}</strong>.</p>`;

      const savedAbs = Math.abs(saved);
      if (saved > 1) {
        chargerBlock += `<p>Saved vs all-public: <strong>${fmtGBP(saved)}</strong>.</p>`;
      } else if (saved < -1) {
        chargerBlock += `<p>Extra vs all-public: <strong>${fmtGBP(
          savedAbs
        )}</strong> (your effective price is higher than public benchmark).</p>`;
      } else {
        chargerBlock += `<pAlmost no difference vs all-public price.</p>`;
      }

      if (invest > 0 && remaining !== null) {
        chargerBlock += `<p>Charger investment (hardware + install): <strong>${fmtGBP(
          invest
        )}</strong>.</p>`;

        if (remaining > 1) {
          chargerBlock += `<p>Still to recover: <strong>${fmtGBP(
            remaining
          )}</strong> from future savings vs public.</p>`;
        } else if (remaining < -1) {
          const over = Math.abs(remaining);
          chargerBlock += `<p>Charger investment already recovered by about <strong>${fmtGBP(
            over
          )}</strong>.</p>`;
        } else {
          chargerBlock += `<p>Charger is roughly at break-even point.</p>`;
        }
      }
    }

    el.innerHTML = `
      ${topSummary}
      <p>Total kWh (all time): <strong>${fmtNum(
        data.totalKwh,
        1
      )}</strong></p>
      <p>Estimated miles (@ ${fmtNum(
        data.evMilesPerKwh,
        1
      )} mi/kWh): <strong>${fmtNum(miles, 0)}</strong></p>
      <p>EV cost: <strong>${fmtGBP(data.evCost)}</strong></p>
      <p>ICE cost (approx): <strong>${fmtGBP(data.iceCost)}</strong></p>
      <p>EV £/mile: <strong>£${evPerMile.toFixed(3)}</strong></p>
      <p>ICE £/mile: <strong>£${icePerMile.toFixed(3)}</strong></p>
      <p>Difference: <strong>${fmtGBP(Math.abs(diff))}</strong> (${sign})</p>
      ${extraLine}
      ${maintBlock}
      ${insuranceBlock}
      ${chargerBlock}
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
