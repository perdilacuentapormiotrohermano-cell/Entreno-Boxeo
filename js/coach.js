/* ============================================================
   coach.js — el "entrenador": decide QUÉ cantar y CUÁNDO.

   Cada llamado: elige combinación válida → la dice → espera a que la
   voz termine → deja el tiempo que lleva ejecutarla (según el ritmo
   elegido) → siguiente. Así nunca se superponen ni se acumulan.
   ============================================================ */
(function (root) {
  const Coach = (root.Coach = root.Coach || {});

  const rnd = (a, b) => a + Math.random() * (b - a);

  /* deps: getSettings(), getRemainingMs(), onCall(desc, tokens), onBurst(active, untilTs) */
  function Driver(deps) {
    const { Combos, Voice, Config } = Coach;
    let active = false, paused = false, timer = null, gen = 0;
    let round = 1;
    let comboState = { recent: [], lastMove: '' };
    let burstUntil = 0, burstCooldown = 0, burstEndPending = false;

    const schedule = (ms) => { clearTimeout(timer); timer = setTimeout(step, ms); };

    function paceScale(s) {
      return s.mode === 'intensity' ? Math.max(0.6, 1 - 0.06 * (round - 1)) : 1;
    }
    function voiceRate(s, inBurst) {
      let r = s.voiceRate;
      if (s.mode === 'intensity') r += Math.min(0.3, 0.04 * (round - 1));
      if (inBurst) r += 0.1;
      return Math.min(1.6, Math.max(0.7, r));
    }

    /* Dice algo y espera a que termine (aunque no haya voz disponible). */
    function say(text, s, rate, estMs, parts) {
      if (Voice.supported || (s.voiceMode === 'clips' && Voice.clipsAvailable())) {
        return Voice.say(text, parts, { rate, volume: s.voiceVolume, estimateMs: estMs, mode: s.voiceMode });
      }
      return new Promise((res) => setTimeout(res, estMs));
    }

    function step() {
      if (!active || paused) return;
      const s = deps.getSettings();
      const rem = deps.getRemainingMs();
      if (rem < 2200) return; // no arrancamos un llamado que no llegaría a terminarse
      const myGen = gen;
      const nowTs = Date.now();

      // --- Impredecible: ráfagas de "ritmo alto" de 10 o 15 s ---
      if (s.mode === 'sparring') {
        if (burstUntil && nowTs >= burstUntil && !burstEndPending) burstEndPending = true;
        if (burstEndPending) {
          burstEndPending = false; burstUntil = 0;
          burstCooldown = nowTs + rnd(20000, 40000);
          deps.onBurst(false, 0);
          const r = voiceRate(s, false);
          say('ritmo normal', s, r, 900, ['ritmo normal']).then(() => { if (active && !paused && gen === myGen) schedule(900); });
          return;
        }
        if (!burstUntil && nowTs > burstCooldown && rem > 22000 && Math.random() < 0.22) {
          const dur = Math.random() < 0.5 ? 10 : 15;
          burstUntil = nowTs + dur * 1000 + 1800; // +1,8 s de la propia frase
          deps.onBurst(true, burstUntil);
          const r = voiceRate(s, true);
          const alto = `ritmo alto, ${dur === 10 ? 'diez' : 'quince'} segundos`;
          say(alto, s, r, 1800, [alto])
            .then(() => { if (active && !paused && gen === myGen) schedule(500); });
          return;
        }
      }
      const inBurst = !!burstUntil;

      // --- elegir y decir el combo ---
      const rate = voiceRate(s, inBurst);
      const opts = {
        level: s.level, mode: s.mode,
        defense: s.defense, movement: s.movement, body: s.body,
        stance: s.stance, style: s.callStyle, slip: s.slipStyle, rate,
        maxSpeechMs: 4200,
      };
      if (inBurst) { opts.maxPunches = 3; opts.noMovement = true; opts.defense = false; }
      const tokens = Combos.next(opts, comboState);
      const desc = Combos.describe(tokens, { stance: s.stance, style: s.callStyle, slip: s.slipStyle });
      const est = Combos.estimateSpeechMs(desc.speech, rate);
      deps.onCall(desc, tokens);

      say(desc.speech, s, rate, est, desc.parts).then(() => {
        if (!active || paused || gen !== myGen) return;
        const pace = Config.PACES[s.pace] || Config.PACES.normal;
        let scale = paceScale(s);
        if (inBurst) scale *= 0.6;
        if (s.mode === 'sparring') scale *= rnd(0.8, 1.35);
        schedule(Combos.gapMs(tokens, pace, scale));
      });
    }

    return {
      /* info: { round, intro } — intro = frase que se dice después de la campana */
      start(info) {
        active = true; paused = false; gen++;
        round = info.round || 1;
        burstUntil = 0; burstEndPending = false;
        burstCooldown = Date.now() + rnd(15000, 30000);
        deps.onBurst(false, 0);
        const myGen = gen;
        clearTimeout(timer);
        timer = setTimeout(() => {
          if (!active || gen !== myGen) return;
          const s = deps.getSettings();
          if (info.intro) {
            say(info.intro, s, Math.min(1.2, s.voiceRate), 900, info.introParts).then(() => {
              if (active && !paused && gen === myGen) schedule(800);
            });
          } else schedule(200);
        }, 1400); // deja sonar la campana
      },
      pause() {
        if (!active) return;
        paused = true; gen++;
        clearTimeout(timer);
        Voice.cancel();
      },
      resume() {
        if (!active || !paused) return;
        paused = false;
        schedule(900);
      },
      stop() {
        active = false; paused = false; gen++;
        clearTimeout(timer);
        Voice.cancel();
        if (burstUntil) { burstUntil = 0; deps.onBurst(false, 0); }
      },
      get burstUntil() { return burstUntil; },
    };
  }

  Coach.Driver = Driver;
})(typeof window !== 'undefined' ? window : globalThis);
