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
    let rep = {};                       // ronda «Repetición»: el combo que se repite y cuántas veces va

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
      const rt = s.roundType || 'sombra';
      const callStyle = rt === 'manoplas' ? 'numeros' : s.callStyle;   // las manoplas se cantan con números
      if (rt === 'repeticion') return stepRepeat(s, callStyle, myGen);

      // --- Impredecible (y bolsa): ráfagas de "ritmo alto" de 10 o 15 s ---
      const bursts = rt === 'bolsa' || (s.mode === 'sparring' && rt !== 'reflejos' && rt !== 'defensa');
      if (bursts) {
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
        stance: s.stance, style: callStyle, slip: s.slipStyle, rate,
        maxSpeechMs: rt === 'reflejos' ? 2200 : 4200,
        drill: rt,
      };
      if (inBurst) { opts.maxPunches = 3; opts.noMovement = true; opts.defense = false; }
      const tokens = Combos.next(opts, comboState);
      const desc = Combos.describe(tokens, { stance: s.stance, style: callStyle, slip: s.slipStyle });
      const est = Combos.estimateSpeechMs(desc.speech, rate);
      deps.onCall(desc, tokens);

      say(desc.speech, s, rate, est, desc.parts).then(() => {
        if (!active || paused || gen !== myGen) return;
        const pace = Config.PACES[s.pace] || Config.PACES.normal;
        let scale = paceScale(s);
        if (inBurst) scale *= 0.6;
        if (s.mode === 'sparring') scale *= rnd(0.8, 1.35);
        if (rt === 'reflejos') {
          // a destiempo: lo que tarda en hacerse + una pausa al azar, para que no se pueda anticipar
          schedule(Combos.executionMs(tokens, pace) * 0.8 + pace.resetMs * rnd(0.25, 1.7) * paceScale(s));
          return;
        }
        schedule(Combos.gapMs(tokens, pace, scale));
      });
    }


    /* Repetición: se canta el combo entero al principio y cada 6 veces; el resto, solo «otra». */
    function stepRepeat(s, callStyle, myGen) {
      const rate = voiceRate(s, false);
      if (!rep.tokens) {
        const parsed = s.combo ? Combos.parseCombo(s.combo) : null;
        rep.tokens = parsed && parsed.ok ? parsed.tokens
          : Combos.drillCombo({ level: s.level, defense: s.defense, body: s.body, stance: s.stance, style: callStyle, slip: s.slipStyle, rate, maxSpeechMs: 4200 });
        rep.desc = Combos.describe(rep.tokens, { stance: s.stance, style: callStyle, slip: s.slipStyle });
        rep.count = 0;
      }
      const first = rep.count === 0, full = first || rep.count % 6 === 0;
      rep.count++;
      deps.onCall(rep.desc, rep.tokens, { rep: rep.count });
      const text = full ? (first ? 'combo, ' : '') + rep.desc.speech : 'otra';
      const parts = full ? (first ? ['combo'].concat(rep.desc.parts) : rep.desc.parts) : ['otra'];
      const est = full ? Combos.estimateSpeechMs(text, rate) : 450;
      say(text, s, rate, est, parts).then(() => {
        if (!active || paused || gen !== myGen) return;
        const pace = Config.PACES[s.pace] || Config.PACES.normal;
        schedule(Combos.gapMs(rep.tokens, pace, paceScale(s)));
      });
    }

    return {
      /* info: { round, intro } — intro = frase que se dice después de la campana */
      start(info) {
        active = true; paused = false; gen++;
        round = info.round || 1;
        burstUntil = 0; burstEndPending = false;
        rep = {};
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
