/* ============================================================
   stats.js — estadísticas del historial: racha, semanas, calendario, récords.
   Son funciones puras (sin pantalla): se pueden probar con node tests/stats.test.js
   ============================================================ */
(function (root) {
  const Coach = (root.Coach = root.Coach || {});

  const pad = (n) => String(n).padStart(2, '0');
  const dayStart = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const addDays = (ts, n) => { const d = new Date(ts); d.setDate(d.getDate() + n); return d.getTime(); };
  const dayKey = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  /* La semana arranca el lunes (igual que el ranking). */
  const weekStart = (ts) => { const d = new Date(dayStart(ts)); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); };

  /* Los entrenos viejos solo tenían rounds/tiempo del coach; los nuevos guardan el total (tRounds / tSec). */
  const roundsOf = (e) => (e.tRounds != null ? e.tRounds : e.rounds) || 0;
  const secOf = (e) => (e.tSec != null ? e.tSec : e.workSeconds) || 0;

  function summarize(entries, now, opts) {
    now = now || Date.now();
    const nWeeks = (opts && opts.weeks) || 8, nHeat = (opts && opts.heatWeeks) || 12;
    const list = (entries || []).filter((e) => e);
    const dated = list.filter((e) => e.ts);

    const total = { sessions: list.length, rounds: 0, sec: 0, points: 0 };
    list.forEach((e) => { total.rounds += roundsOf(e); total.sec += secOf(e); total.points += e.points || 0; });

    // minutos por día
    const perDay = {};
    dated.forEach((e) => { const k = dayKey(e.ts); perDay[k] = (perDay[k] || 0) + secOf(e); });

    // racha: días seguidos con al menos un entreno. Sigue viva si el último fue ayer.
    const today = dayStart(now);
    let cur = 0, d = perDay[dayKey(today)] ? today : addDays(today, -1);
    while (perDay[dayKey(d)]) { cur++; d = addDays(d, -1); }
    const days = Object.keys(perDay).map((k) => { const [y, m, dd] = k.split('-').map(Number); return new Date(y, m - 1, dd).getTime(); }).sort((a, b) => a - b);
    let best = 0, run = 0;
    days.forEach((t, i) => {
      run = i > 0 && dayKey(addDays(days[i - 1], 1)) === dayKey(t) ? run + 1 : 1;
      best = Math.max(best, run);
    });

    // semanas
    const byWeek = {};
    dated.forEach((e) => {
      const k = weekStart(e.ts);
      const w = byWeek[k] || (byWeek[k] = { start: k, rounds: 0, sec: 0, sessions: 0 });
      w.rounds += roundsOf(e); w.sec += secOf(e); w.sessions++;
    });
    const thisWeek = weekStart(now);
    const weeks = [];
    for (let i = nWeeks - 1; i >= 0; i--) {
      const k = addDays(thisWeek, -7 * i);
      weeks.push(byWeek[k] || { start: k, rounds: 0, sec: 0, sessions: 0 });
    }
    const week = weeks[weeks.length - 1], prevWeek = weeks[weeks.length - 2] || { rounds: 0, sec: 0, sessions: 0 };

    // calendario (nHeat semanas, lunes primero; cada columna es una semana)
    const heat = [];
    for (let w = nHeat - 1; w >= 0; w--) {
      const col = [];
      const ws = addDays(thisWeek, -7 * w);
      for (let i = 0; i < 7; i++) {
        const t = addDays(ws, i);
        col.push({ ts: t, key: dayKey(t), sec: perDay[dayKey(t)] || 0, future: t > today });
      }
      heat.push(col);
    }

    // récords
    const pickMax = (fn) => list.reduce((b, e) => (fn(e) > (b ? fn(b) : 0) ? e : b), null);
    const bestWeek = Object.values(byWeek).reduce((b, w) => (w.sec > (b ? b.sec : 0) ? w : b), null);
    const records = {
      points: pickMax((e) => e.points || 0),
      longest: pickMax(secOf),
      rounds: pickMax(roundsOf),
      week: bestWeek,
    };

    return { total, streak: { current: cur, best }, week, prevWeek, weeks, heat, records, activeDays: days.length };
  }

  const csvCell = (v) => { const s = String(v == null ? '' : v); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  function toCSV(entries) {
    const head = ['fecha', 'hora', 'tipo', 'rounds', 'minutos', 'puntos', 'modo', 'nivel'];
    const kinds = { clock: 'Reloj', coach: 'Coach', routine: 'Rutina' };
    const rows = (entries || []).map((e) => {
      const d = e.ts ? new Date(e.ts) : null;
      return [
        d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : e.dateStr || '',
        d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '',
        kinds[e.kind] || 'Coach', roundsOf(e), (secOf(e) / 60).toFixed(1), e.points || 0, e.mode || '', e.level || '',
      ];
    });
    return '﻿' + [head].concat(rows).map((r) => r.map(csvCell).join(',')).join('\n');
  }

  Coach.Stats = { summarize, dayKey, dayStart, weekStart, addDays, roundsOf, secOf, toCSV };
  if (typeof module !== 'undefined' && module.exports) module.exports = Coach.Stats;
})(typeof window !== 'undefined' ? window : globalThis);
