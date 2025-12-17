/* ui.js - toast + labels + attachments editor builders */
(function () {
  const { sanitizeAttachment } = window.EVData;

  function $(id) { return document.getElementById(id); }
  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }

  // Labels
  function typeLabel(t) {
    if (t === "public") return "Публично";
    if (t === "public_exp") return "Публично скъпо";
    if (t === "home") return "Домашно";
    if (t === "home_exp") return "Домашно скъпо";
    return "Друга";
  }
  function costCatLabel(c) {
    const m = {
      tyres: "Tyres",
      brakes: "Brakes",
      service: "Service",
      mot: "MOT",
      insurance: "Insurance",
      tax: "Tax",
      repairs: "Repairs",
      accessories: "Accessories",
      other: "Other"
    };
    return m[c] || "Other";
  }
  function vehicleLabel(v) { return (v === "ice") ? "ICE" : "EV"; }
  function spreadLabel(s) {
    if (s === "monthly") return "Monthly";
    if (s === "yearly") return "Yearly";
    return "One-off";
  }

  // Toast
  let toastTimer = null;
  function hideToast() {
    const el = $("toast");
    if (!el) return;
    el.classList.remove("show");
    setTimeout(() => { el.innerHTML = ""; el.className = ""; }, 220);
  }
  function toast(text, kind = "") {
    const el = $("toast");
    if (!el) return;
    el.innerHTML = `<div class="toastRow"><div>${escapeHtml(text || "")}</div></div>`;
    el.className = "";
    if (kind) el.classList.add(kind);
    el.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => hideToast(), 1800);
  }
  function toastUndo(text, onUndo) {
    const el = $("toast");
    if (!el) return;
    el.innerHTML = `
      <div class="toastRow">
        <div>${escapeHtml(text || "")}</div>
        <div class="toastActions">
          <button class="toastBtn" id="toastUndoBtn" type="button">Undo</button>
          <button class="toastBtn" id="toastDismissBtn" type="button">Dismiss</button>
        </div>
      </div>
    `;
    el.className = "";
    el.classList.add("show");
    $("toastUndoBtn")?.addEventListener("click", () => { hideToast(); onUndo?.(); });
    $("toastDismissBtn")?.addEventListener("click", () => hideToast());
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => hideToast(), 5000);
  }

  // Attachments UI
  function attCountText(atts) {
    const n = Array.isArray(atts) ? atts.length : 0;
    return n > 0 ? `📎${n}` : "";
  }

  function buildAttachmentsEditor(draftObj) {
    const wrap = document.createElement("div");
    wrap.className = "attList";

    const header = document.createElement("div");
    header.className = "small";
    header.textContent = "Attachments (name + link). Пример: Google Drive share link.";
    wrap.appendChild(header);

    const list = document.createElement("div");
    wrap.appendChild(list);

    function renderList() {
      list.innerHTML = "";
      const atts = draftObj.attachments || [];
      if (!atts.length) {
        const s = document.createElement("div");
        s.className = "small";
        s.style.opacity = "0.8";
        s.style.marginTop = "6px";
        s.textContent = "— няма attachments";
        list.appendChild(s);
        return;
      }
      atts.forEach((a, idx) => {
        const row = document.createElement("div");
        row.className = "attRow";

        const name = document.createElement("input");
        name.type = "text";
        name.placeholder = "Name (invoice, receipt...)";
        name.value = a.name || "";
        name.oninput = () => { a.name = name.value; };

        const url = document.createElement("input");
        url.type = "url";
        url.placeholder = "https://drive.google.com/...";
        url.value = a.url || "";
        url.oninput = () => { a.url = url.value; };

        const del = document.createElement("button");
        del.type = "button";
        del.className = "mini";
        del.textContent = "Remove";
        del.onclick = () => {
          draftObj.attachments.splice(idx, 1);
          renderList();
        };

        row.appendChild(name);
        row.appendChild(url);
        row.appendChild(del);
        list.appendChild(row);

        if (a.url) {
          const link = document.createElement("a");
          link.className = "attLink";
          link.href = a.url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = a.url;
          list.appendChild(link);
        }
      });
    }

    const addRow = document.createElement("div");
    addRow.className = "attRow";
    addRow.style.marginTop = "10px";

    const newName = document.createElement("input");
    newName.type = "text";
    newName.placeholder = "New attachment name";
    const newUrl = document.createElement("input");
    newUrl.type = "url";
    newUrl.placeholder = "New attachment link (Drive)";

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "mini";
    addBtn.textContent = "Add";
    addBtn.onclick = () => {
      const a = sanitizeAttachment({ name: newName.value, url: newUrl.value });
      if (!a) { toast("Attachment празен", "bad"); return; }
      draftObj.attachments.push(a);
      newName.value = "";
      newUrl.value = "";
      renderList();
    };

    addRow.appendChild(newName);
    addRow.appendChild(newUrl);
    addRow.appendChild(addBtn);
    wrap.appendChild(addRow);

    renderList();
    return wrap;
  }

  window.EVUI = {
    escapeHtml,
    typeLabel,
    costCatLabel,
    vehicleLabel,
    spreadLabel,
    toast,
    toastUndo,
    attCountText,
    buildAttachmentsEditor
  };
})();
