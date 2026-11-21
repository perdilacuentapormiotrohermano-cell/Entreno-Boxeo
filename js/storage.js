/* ============================================================
   storage.js — ajustes e historial en localStorage (a prueba de fallos)
   ============================================================ */
(function (root) {
  const Coach = (root.Coach = root.Coach || {});
  const KEYS = {
    settings: 'cb.settings.v2',
    history: 'cb.history.v2',
    name: 'cb.name',
    filter: 'cb.rankFilter',
    scope: 'cb.rankScope',
    avatar: 'cb.avatar',
    group: 'cb.group',
    routines: 'cb.routines.v1',
    routineDraft: 'cb.routineDraft.v1',
    legacy: 'boxingHistory',          // ranking de la versión vieja
    legacyDone: 'cb.legacyMigrated',
  };

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  }

  const Storage = {
    KEYS,
    getSettings() {
      return Object.assign({}, Coach.Config.DEFAULTS, read(KEYS.settings, {}));
    },
    saveSettings(s) { write(KEYS.settings, s); },

    getName() { return read(KEYS.name, ''); },
    setName(n) { write(KEYS.name, n); },
    get(key, fallback) { return read(KEYS[key] || key, fallback); },
    set(key, value) { write(KEYS[key] || key, value); },

    getHistory() { return read(KEYS.history, []); },
    addHistory(entry) {
      const list = Storage.getHistory();
      list.push(entry);
      let out = list.slice(-1000);
      // si el navegador se queda sin lugar, se descartan los «planes» viejos (lo que usa «Repetir») y se reintenta
      if (!write(KEYS.history, out)) {
        out = out.map((e, i) => (i < out.length - 20 && e.plan ? Object.assign({}, e, { plan: undefined }) : e));
        if (!write(KEYS.history, out)) write(KEYS.history, out.slice(-300));
      }
    },

    clearHistory() { write(KEYS.history, []); },

    /* Trae lo que había en la versión anterior ("boxingHistory") una sola vez. */
    migrateLegacy() {
      if (read(KEYS.legacyDone, false)) return;
      const old = read(KEYS.legacy, []);
      if (Array.isArray(old) && old.length) {
        const list = Storage.getHistory();
        old.forEach((e, i) => {
          list.push({
            id: 'legacy-' + i,
            ts: null,
            dateStr: e.date || '',
            rounds: e.rounds || 0,
            workSeconds: (e.minutes || 0) * 60,
            mode: e.mode || 'normal',
            level: 0,
            points: e.points || 0,
          });
        });
        write(KEYS.history, list);
      }
      write(KEYS.legacyDone, true);
    },
  };

  Coach.Storage = Storage;
})(typeof window !== 'undefined' ? window : globalThis);
