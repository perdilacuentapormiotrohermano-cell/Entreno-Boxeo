/* ============================================================
   timer.js — motor del reloj. Recorre un PLAN de segmentos:
     [{ phase:'prep'|'work'|'rest', durationMs, round, rounds, meta }, …]
   Sirve igual para un reloj simple, un modo coach o una rutina de varios bloques.

   Usa marcas de tiempo reales (no cuenta "1 segundo" con setTimeout),
   así no se atrasa si la pestaña queda en segundo plano o la compu se frena.
   Este motor NO conoce el sonido ni la voz: solo emite eventos.
   ============================================================ */
(function (root) {
  const Coach = (root.Coach = root.Coach || {});

  /* cfg: { plan, warnAtMs }
     h:   { onPhase, onPhaseEnd, onTick, onWarn, onCountdown, onFinish } */
  function Engine(cfg, h) {
    h = h || {};
    const plan = cfg.plan;
    const emit = (name, arg) => { if (h[name]) h[name](arg); };
    const now = () => performance.now();

    let state = 'idle';            // idle | running | paused
    let idx = -1, seg = null;
    let phaseDur = 0, phaseEnd = 0, remaining = 0;
    let warned = false, lastCount = null;
    let iv = null;
    let workDoneMs = 0, completedRounds = 0;

    function begin(i) {
      idx = i; seg = plan[i];
      phaseDur = seg.durationMs;
      phaseEnd = now() + phaseDur;
      warned = false; lastCount = null;
      emit('onPhase', { phase: seg.phase, round: seg.round, rounds: seg.rounds, durationMs: phaseDur, seg, index: i, total: plan.length });
      tick();
    }

    function finish() {
      clearInterval(iv); iv = null;
      state = 'idle'; seg = null;
      emit('onFinish', { completedRounds, workMs: workDoneMs });
    }

    function advance() {
      const ended = seg;
      emit('onPhaseEnd', { phase: ended.phase, round: ended.round, seg: ended });
      if (ended.phase === 'work') { workDoneMs += phaseDur; completedRounds++; }
      if (idx + 1 >= plan.length) { finish(); return; }
      begin(idx + 1);
    }

    function tick() {
      if (state !== 'running' || !seg) return;
      let rem = phaseEnd - now();
      let guard = 0;
      while (rem <= 0 && state === 'running' && seg && guard++ < 50) {
        advance();
        if (state !== 'running' || !seg) return;
        rem = phaseEnd - now();
      }
      const secLeft = Math.ceil(rem / 1000);
      emit('onTick', { phase: seg.phase, round: seg.round, remainingMs: rem, durationMs: phaseDur, seg });

      if (seg.phase === 'work' && cfg.warnAtMs && !warned && phaseDur > cfg.warnAtMs * 2 && rem <= cfg.warnAtMs) {
        warned = true;
        emit('onWarn', { round: seg.round });
      }
      if ((seg.phase === 'prep' || seg.phase === 'rest') && secLeft <= 3 && secLeft >= 1 && secLeft !== lastCount && phaseDur > 4000) {
        lastCount = secLeft;
        emit('onCountdown', { n: secLeft, phase: seg.phase });
      }
    }

    function startInterval() { clearInterval(iv); iv = setInterval(tick, 100); }

    return {
      start() {
        if (state !== 'idle' || !plan.length) return;
        state = 'running';
        workDoneMs = 0; completedRounds = 0;
        startInterval();
        begin(0);
      },
      pause() {
        if (state !== 'running') return;
        remaining = Math.max(0, phaseEnd - now());
        state = 'paused';
        clearInterval(iv); iv = null;
      },
      resume() {
        if (state !== 'paused') return;
        phaseEnd = now() + remaining;
        state = 'running';
        startInterval();
        tick();
      },
      stop() {
        clearInterval(iv); iv = null;
        const snapshot = { completedRounds, workMs: workDoneMs };
        state = 'idle'; seg = null;
        return snapshot;
      },
      tick,
      get state() { return state; },
      get seg() { return seg; },
      get index() { return idx; },
      get phase() { return seg ? seg.phase : 'idle'; },
      get round() { return seg ? seg.round : 0; },
      get remainingMs() { return state === 'paused' ? remaining : Math.max(0, phaseEnd - now()); },
      get completedRounds() { return completedRounds; },
      get workMs() { return workDoneMs; },
    };
  }

  Coach.Engine = Engine;
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
})(typeof window !== 'undefined' ? window : globalThis);
