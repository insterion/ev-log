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
      home_xp: 0.30
    }
  };

  function cloneDefault() {
    return JSON.parse(JSON.stringify(defaultState));
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
