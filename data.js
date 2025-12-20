// data.js – load/save state in localStorage

(function () {
  const STORAGE_KEY = "ev_log_state_v1";

  const defaultState = {
    entries: [], // charging
    costs: [],   // maintenance
    settings: {
      public: 0.56,
      public_xp: 0.76,
      home: 0.09,
      home_xp: 0.30,
      chargerHardware: 0,
      chargerInstall: 0
    }
  };

  function cloneDefault() {
    return JSON.parse(JSON.stringify(defaultState));
  }

  function ensureEntryIds(state) {
    if (!state || !Array.isArray(state.entries)) return;
    let counter = 0;
    for (const e of state.entries) {
      if (!e.id) {
        let newId = null;
        try {
          if (window.crypto && window.crypto.randomUUID) {
            newId = window.crypto.randomUUID();
          }
        } catch (err) {
          console.warn("crypto.randomUUID not available, fallback id", err);
        }
        if (!newId) {
          newId =
            "e_" +
            Date.now().toString(36) +
            "_" +
            (counter++).toString(36);
        }
        e.id = newId;
      }
    }
  }

  function ensureCostIds(state) {
    if (!state || !Array.isArray(state.costs)) return;
    let counter = 0;
    for (const c of state.costs) {
      if (!c.id) {
        let newId = null;
        try {
          if (window.crypto && window.crypto.randomUUID) {
            newId = window.crypto.randomUUID();
          }
        } catch (err) {
          console.warn("crypto.randomUUID not available for costs, fallback id", err);
        }
        if (!newId) {
          newId =
            "c_" +
            Date.now().toString(36) +
            "_" +
            (counter++).toString(36);
        }
        c.id = newId;
      }
    }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return cloneDefault();
      const parsed = JSON.parse(raw);
      // simple merge – ако липсва нещо, взимаме от default
      const state = cloneDefault();
      if (parsed.entries) state.entries = parsed.entries;
      if (parsed.costs) state.costs = parsed.costs;
      if (parsed.settings) {
        Object.assign(state.settings, parsed.settings);
      }

      // гарантираме, че всички entries и costs имат id (за Edit/Delete)
      ensureEntryIds(state);
      ensureCostIds(state);

      // по желание – записваме обратно, за да се запазят id-тата
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (e) {
        console.warn("Could not persist migrated ids", e);
      }

      return state;
    } catch (e) {
      console.error("Failed to load state", e);
      return cloneDefault();
    }
  }

  function saveState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error("Failed to save state", e);
    }
  }

  window.EVData = {
    loadState,
    saveState
  };
})();