// ui.js – formatting + rendering helpers (with apply-based filters)

(function () {
  // --- UI-only filter state (не се пази в localStorage) ---
  let logFilterText = "";
  let costFilterText = "";

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

  function safeLower(v) {
    return String(v ?? "").toLowerCase();
  }

  // ------- render charging log -------

  function renderLogTable(containerId, entries) {
    const el = document.getElementById(containerId);
    if (!el) return;

    if (!entries.length) {
      el.innerHTML = "<p>No entries yet.</p>";
      return;
    }

    const filter = safeLower(logFilterText).trim();

    // NEWEST FIRST (descending)
    const sorted = entries
      .slice()
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    const filtered = !filter
      ? sorted
      : sorted.filter((e) => {
          const typeLabel =
            e.type === "public"
              ? "public"
              : e.type === "public-xp"
              ? "public xp"
              : e.type === "home"
              ? "home"
              : "home xp";

          const hay = [
            e.date,
            e.kwh,
            e.price,
            typeLabel,
            e.type,
            e.note || ""
          ]
            .map((x) => safeLower(x))
            .join(" ");

          return hay.includes(filter);
        });

    const rows = filtered.map((e) => {
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
        <td class="actcol">
          <button
            type="button"
            class="btn-mini"
            data-action="edit-entry"
            data-id="${idAttr}"
            title="Edit this entry"
            aria-label="Edit"
          ><span class="ico">✎</span><span class="txt"> Edit</span></button>
          <button
            type="button"
            class="btn-mini danger"
            data-action="delete-entry"
            data-id="${idAttr}"
            title="Delete this entry"
            aria-label="Delete"
          >✕</button>
        </td>
      </tr>`;
    });

    const totalKwhAll = entries.reduce((s, e) => s + (e.kwh || 0), 0);
    const totalCostAll = entries.reduce(
      (s, e) => s + (e.kwh * e.price || 0),
      0
    );
    const sessionsAll = entries.length;

    const totalKwhShown = filtered.reduce((s, e) => s + (e.kwh || 0), 0);
    const totalCostShown = filtered.reduce(
      (s, e) => s + (e.kwh * e.price || 0),
      0
    );
    const sessionsShown = filtered.length;

    const summaryBlock = `
      <details open style="margin:4px 0 8px;">
        <summary style="cursor:pointer;color:#cccccc;">
          <strong>Total so far</strong>
        </summary>
        <div style="margin-top:6px;font-size:0.85rem;color:#cccccc;">
          <p style="margin:0 0 4px;">
            All: <strong>${fmtNum(totalKwhAll, 1)} kWh</strong> •
            <strong>${fmtGBP(totalCostAll)}</strong> •
            <strong>${sessionsAll}</strong> sessions
          </p>
          ${
            filter
              ? `<p style="margin:0;">
                  Shown: <strong>${fmtNum(totalKwhShown, 1)} kWh</strong> •
                  <strong>${fmtGBP(totalCostShown)}</strong> •
                  <strong>${sessionsShown}</strong> sessions
                </p>`
              : ""
          }
        </div>
      </details>
    `;

    const filterBlock = `
      <div style="margin:0 0 8px;display:flex;gap:6px;align-items:center;flex-wrap:nowrap;">
        <input
          id="logFilterInput"
          type="text"
          placeholder="Filter by date, note, type…"
          value="${(logFilterText || "").replace(/"/g, "&quot;")}"
          style="flex:1;min-width:0;"
        />
        <button id="logFilterApply" type="button">Apply</button>
        <button id="logFilterClear" type="button">Clear</button>
      </div>
      <p class="small" style="margin:0 0 4px;color:#aaaaaa;">
        Tip: type “home”, “public”, a date (2025-12-23), or a word from your note.
      </p>
    `;

    el.innerHTML = `
      ${summaryBlock}
      ${filterBlock}
      ${
        filtered.length
          ? `<table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>kWh</th>
                  <th>Type</th>
                  <th>£</th>
                  <th>Note</th>
                  <th class="actcol">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${rows.join("")}
              </tbody>
              <tfoot>
                <tr class="total-row">
                  <td>Total</td>
                  <td>${fmtNum(totalKwhShown, 1)}</td>
                  <td></td>
                  <td>${fmtGBP(totalCostShown)}</td>
                  <td></td>
                  <td class="actcol"></td>
                </tr>
              </tfoot>
            </table>`
          : `<p class="small" style="margin-top:4px;">No matches for filter.</p>`
      }
    `;

    // Събития за филтъра – НЕ ререндваме при всяка буква
    const inp = document.getElementById("logFilterInput");
    const btnApply = document.getElementById("logFilterApply");
    const btnClear = document.getElementById("logFilterClear");

    if (inp) {
      inp.addEventListener("input", () => {
        // само пазим текста, не ререндваме
        logFilterText = inp.value || "";
      });
    }

    if (btnApply) {
      btnApply.addEventListener("click", () => {
        // при Apply ререндваме
        renderLogTable(containerId, entries);
      });
    }

    if (btnClear) {
      btnClear.addEventListener("click", () => {
        logFilterText = "";
        renderLogTable(containerId, entries);
      });
    }
  }

  // ------- render costs -------

  function renderCostTable(containerId, costs) {
    const el = document.getElementById(containerId);
    if (!el) return;

    if (!costs.length) {
      el.innerHTML = "<p>No costs yet.</p>";
      return;
    }

    const filter = safeLower(costFilterText).trim();

    // NEWEST FIRST (descending)
    const sorted = costs
      .slice()
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    const filtered = !filter
      ? sorted
      : sorted.filter((c) => {
          const appliesRaw = (c.applies || "other").toLowerCase();
          const hay = [
            c.date,
            c.category,
            c.amount,
            c.note || "",
            appliesRaw
          ]
            .map((x) => safeLower(x))
            .join(" ");
          return hay.includes(filter);
        });

    const rows = filtered.map((c) => {
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
        <td class="actcol">
          <button
            type="button"
            class="btn-mini"
            data-action="edit-cost"
            data-id="${idAttr}"
            title="Edit this cost"
            aria-label="Edit"
          ><span class="ico">✎</span><span class="txt"> Edit</span></button>
          <button
            type="button"
            class="btn-mini danger"
            data-action="delete-cost"
            data-id="${idAttr}"
            title="Delete this cost"
            aria-label="Delete"
          >✕</button>
        </td>
      </tr>`;
    });

    const totalAll = sorted.reduce((s, c) => s + (c.amount || 0), 0);
    const totalShown = filtered.reduce((s, c) => s + (c.amount || 0), 0);

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

    const filterBlock = `
      <div style="margin:0 0 8px;display:flex;gap:6px;align-items:center;flex-wrap:nowrap;">
        <input
          id="costFilterInput"
          type="text"
          placeholder="Filter by category, note, EV/ICE…"
          value="${(costFilterText || "").replace(/"/g, "&quot;")}"
          style="flex:1;min-width:0;"
        />
        <button id="costFilterApply" type="button">Apply</button>
        <button id="costFilterClear" type="button">Clear</button>
      </div>
      <p class="small" style="margin:0 0 4px;color:#aaaaaa;">
        Tip: type “insurance”, “tyres”, “ev”, “ice”, or a word from your note.
      </p>
    `;

    el.innerHTML = `
      ${filterBlock}
      ${
        filtered.length
          ? `<table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Category</th>
                  <th>For</th>
                  <th>£</th>
                  <th>Note</th>
                  <th class="actcol">Actions</th>
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
                  <td>${fmtGBP(totalShown)}</td>
                  <td></td>
                  <td class="actcol"></td>
                </tr>
              </tfoot>
            </table>`
          : `<p class="small" style="margin-top:4px;">No matches for filter.</p>`
      }

      <details style="margin-top:10px;">
        <summary style="cursor:pointer;"><strong>Totals by category</strong></summary>
        <div style="margin-top:6px;">
          <p class="small" style="margin:0 0 8px;">
            All costs total: <strong>${fmtGBP(totalAll)}</strong>
          </p>
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
        </div>
      </details>

      <details style="margin-top:10px;">
        <summary style="cursor:pointer;"><strong>What does “For” mean?</strong></summary>
        <div style="margin-top:6px;">
          ${legend}
        </div>
      </details>
    `;

    const inp = document.getElementById("costFilterInput");
    const btnApply = document.getElementById("costFilterApply");
    const btnClear = document.getElementById("costFilterClear");

    if (inp) {
      inp.addEventListener("input", () => {
        costFilterText = inp.value || "";
      });
    }

    if (btnApply) {
      btnApply.addEventListener("click", () => {
        renderCostTable(containerId, costs);
      });
    }

    if (btnClear) {
      btnClear.addEventListener("click", () => {
        costFilterText = "";
        renderCostTable(containerId, costs);
      });
    }
  }

  // ------- render summary (COMPACT + COLLAPSIBLE) -------

  function renderSummary(containerIds, summary) {
    const [idThis, idLast, idAvg] = containerIds.map((id) =>
      document.getElementById(id)
    );
    if (!idThis || !idLast || !idAvg) return;

    function compactLines(data) {
      if (!data) return "<p>No data.</p>";

      const kwh = fmtNum(data.kwh, 1);
      const cost = fmtGBP(data.cost);
      const count = data.count != null ? data.count : null;

      const avgPrice =
        data.avgPrice && data.avgPrice > 0 ? `£${data.avgPrice.toFixed(3)}/kWh` : null;

      const perDay =
        data.perDay && data.perDay > 0 ? fmtGBP(data.perDay) + "/day" : null;

      return `
        <p style="margin:0 0 4px;">
          <strong>${kwh} kWh</strong> • <strong>${cost}</strong>
          ${count != null ? ` • <strong>${count}</strong> sessions` : ""}
        </p>
        <p style="margin:0;font-size:0.85rem;color:#b0b0b0;">
          ${avgPrice ? `Avg: <strong style="color:#f5f5f5;">${avgPrice}</strong>` : "Avg: n/a"}
          ${perDay ? ` • ~ <strong style="color:#f5f5f5;">${perDay}</strong>` : ""}
        </p>
      `;
    }

    idThis.innerHTML = `
      <details open>
        <summary style="cursor:pointer;"><strong>This month</strong></summary>
        <div style="margin-top:6px;">
          ${compactLines(summary.thisMonth)}
        </div>
      </details>
    `;

    idLast.innerHTML = `
      <details>
        <summary style="cursor:pointer;"><strong>Last month</strong></summary>
        <div style="margin-top:6px;">
          ${compactLines(summary.lastMonth)}
        </div>
      </details>
    `;

    idAvg.innerHTML = `
      <details>
        <summary style="cursor:pointer;"><strong>Average (all months)</strong></summary>
        <div style="margin-top:6px;">
          ${
            summary.avg
              ? `
                <p style="margin:0 0 4px;">
                  <strong>${fmtNum(summary.avg.kwh, 1)} kWh</strong> •
                  <strong>${fmtGBP(summary.avg.cost)}</strong>
                </p>
                <p style="margin:0;font-size:0.85rem;color:#b0b0b0;">
                  Avg price: <strong style="color:#f5f5f5;">£${summary.avg.avgPrice.toFixed(
                    3
                  )}</strong> / kWh
                </p>
              `
              : "<p>No data.</p>"
          }
        </div>
      </details>
    `;
  }

  // ------- render compare (както преди – clean + collapsible) -------

  function renderCompare(containerId, data) {
    const el = document.getElementById(containerId);
    if (!el) return;

    if (!data || isNaN(data.evCost)) {
      el.innerHTML = "<p>Not enough data yet.</p>";
      return;
    }

    const miles = data.miles || 0;

    const evPerMile = miles > 0 ? data.evPerMile ?? data.evCost / miles : 0;
    const icePerMile = miles > 0 ? data.icePerMile ?? data.iceCost / miles : 0;

    const diffEnergy = data.iceCost - data.evCost;

    // maintenance / all-in
    const maintEv = Number(data.maintEv ?? 0);
    const maintIce = Number(data.maintIce ?? 0);
    const maintBoth = Number(data.maintBoth ?? 0);
    const maintOther = Number(data.maintOther ?? 0);

    const evTotalAll = data.evCost + maintEv;
    const iceTotalAll = data.iceCost + maintIce;
    const diffAll = iceTotalAll - evTotalAll;

    // insurance
    const insEv = Number(data.insuranceEv ?? 0);
    const insIce = Number(data.insuranceIce ?? 0);
    const insBoth = Number(data.insuranceBoth ?? 0);
    const insOther = Number(data.insuranceOther ?? 0);
    const insTotal = Number(data.insuranceTotal ?? 0);
    const insDiff = insIce - insEv;

    // ---- Quick summary (always visible) ----
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
        <div style="margin-bottom:8px;padding:6px 8px;border-radius:12px;background:#0a0a0a;border:1px solid #222;">
          <p style="margin:0 0 4px;"><strong>Quick summary</strong></p>
          <p style="margin:0 0 3px;">
            All-in difference (ICE – EV): <strong>${fmtGBP(
              Math.abs(diffAll)
            )}</strong> (${allText})
          </p>
          <p style="margin:0;">
            Per 1000 miles: EV <strong>${fmtGBP(per1000Ev)}</strong>, ICE <strong>${fmtGBP(
        per1000Ice
      )}</strong> (${perText})
          </p>
        </div>
      `;
    }

    // ---- Energy explanation (short) ----
    let energyExplain = "";
    if (diffEnergy > 1) {
      energyExplain = `ICE would cost <strong>${fmtGBP(
        diffEnergy
      )}</strong> more for your recorded EV miles.`;
    } else if (diffEnergy < -1) {
      energyExplain = `EV would cost <strong>${fmtGBP(
        Math.abs(diffEnergy)
      )}</strong> more than ICE (check assumptions).`;
    } else {
      energyExplain = `EV and ICE are roughly the same cost for your recorded EV miles.`;
    }

    const energyBlock = `
      <details open>
        <summary style="cursor:pointer;"><strong>Energy vs ICE (details)</strong></summary>
        <div style="margin-top:6px;">
          <p>Total kWh (all time): <strong>${fmtNum(data.totalKwh, 1)}</strong></p>
          <p>Estimated miles (@ ${fmtNum(
            data.evMilesPerKwh,
            1
          )} mi/kWh): <strong>${fmtNum(miles, 0)}</strong></p>
          <p>EV energy cost: <strong>${fmtGBP(data.evCost)}</strong></p>
          <p>ICE fuel cost (approx): <strong>${fmtGBP(data.iceCost)}</strong></p>
          <p>EV £/mile: <strong>£${evPerMile.toFixed(3)}</strong></p>
          <p>ICE £/mile: <strong>£${icePerMile.toFixed(3)}</strong></p>
          <p>Difference (ICE – EV): <strong>${fmtGBP(
            Math.abs(diffEnergy)
          )}</strong></p>
          <p>${energyExplain}</p>
        </div>
      </details>
    `;

    let maintBlock = "";
    if (maintEv !== 0 || maintIce !== 0 || maintBoth !== 0 || maintOther !== 0) {
      let diffAllText = "about the same";
      if (diffAll > 1) diffAllText = "ICE more expensive";
      else if (diffAll < -1) diffAllText = "EV more expensive";

      maintBlock = `
        <details>
          <summary style="cursor:pointer;"><strong>Maintenance (details)</strong></summary>
          <div style="margin-top:6px;">
            <p>Maintenance – EV: <strong>${fmtGBP(
              maintEv
            )}</strong>, ICE: <strong>${fmtGBP(maintIce)}</strong></p>
            <p>Shared (Both): <strong>${fmtGBP(
              maintBoth
            )}</strong>, Other: <strong>${fmtGBP(maintOther)}</strong></p>
            <p>Total EV (energy + EV maintenance): <strong>${fmtGBP(
              evTotalAll
            )}</strong></p>
            <p>Total ICE (fuel + ICE maintenance): <strong>${fmtGBP(
              iceTotalAll
            )}</strong></p>
            <p>All-in difference (ICE – EV): <strong>${fmtGBP(
              Math.abs(diffAll)
            )}</strong></p>
          </div>
        </details>
      `;
    }

    let insuranceBlock = "";
    if (insEv !== 0 || insIce !== 0 || insBoth !== 0 || insOther !== 0) {
      let insDiffText = "about the same";
      if (insDiff > 1) insDiffText = "ICE insurance higher";
      else if (insDiff < -1) insDiffText = "EV insurance higher";

      insuranceBlock = `
        <details>
          <summary style="cursor:pointer;"><strong>Insurance (details)</strong></summary>
          <div style="margin-top:6px;">
            <p>Insurance – EV: <strong>${fmtGBP(
              insEv
            )}</strong>, ICE: <strong>${fmtGBP(insIce)}</strong></p>
            <p>Shared (Both): <strong>${fmtGBP(
              insBoth
            )}</strong>, Other: <strong>${fmtGBP(insOther)}</strong></p>
            <p>Total insurance: <strong>${fmtGBP(insTotal)}</strong></p>
            <p>Difference (ICE – EV): <strong>${fmtGBP(
              Math.abs(insDiff)
            )}</strong> (${insDiffText})</p>
          </div>
        </details>
      `;
    }

    let chargerBlock = "";
    if (data.publicRate && data.publicRate > 0) {
      const pr = data.publicRate;
      const allPub = data.allPublicCost ?? 0;
      const saved = data.savedVsPublic ?? 0;
      const invest = data.chargerInvestment ?? 0;
      const remaining =
        typeof data.remainingToRecover === "number" ? data.remainingToRecover : null;

      let savedLine = "";
      if (saved > 1)
        savedLine = `Saved vs all-public: <strong>${fmtGBP(saved)}</strong>.`;
      else if (saved < -1)
        savedLine = `Extra vs all-public: <strong>${fmtGBP(
          Math.abs(saved)
        )}</strong>.`;
      else savedLine = `Almost no difference vs all-public price.`;

      let investLine = "";
      if (invest > 0 && remaining !== null) {
        if (remaining > 1)
          investLine = `Still to recover: <strong>${fmtGBP(remaining)}</strong>.`;
        else if (remaining < -1)
          investLine = `Already recovered by about <strong>${fmtGBP(
            Math.abs(remaining)
          )}</strong>.`;
        else investLine = `Charger is roughly at break-even.`;
      }

      chargerBlock = `
        <details>
          <summary style="cursor:pointer;"><strong>Home charger payoff (details)</strong></summary>
          <div style="margin-top:6px;">
            <p>Public benchmark: <strong>£${pr.toFixed(3)}</strong> / kWh</p>
            <p>If all EV kWh were public: <strong>${fmtGBP(allPub)}</strong></p>
            <p>Your actual EV charging cost: <strong>${fmtGBP(data.evCost)}</strong></p>
            <p>${savedLine}</p>
            ${
              invest > 0
                ? `<p>Charger investment (hardware + install): <strong>${fmtGBP(
                    invest
                  )}</strong></p>`
                : ""
            }
            ${investLine ? `<p>${investLine}</p>` : ""}
          </div>
        </details>
      `;
    }

    el.innerHTML = `
      ${topSummary}
      ${energyBlock}
      ${maintBlock}
      ${insuranceBlock}
      ${chargerBlock}
      <p style="margin-top:10px;font-size:0.85rem;color:#b0b0b0;">
        Assumptions: ICE ${data.iceMpg} mpg, £${data.icePerLitre.toFixed(
      2
    )}/litre unleaded, EV ${fmtNum(data.evMilesPerKwh, 1)} mi/kWh.
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