/* ============================================================
   audio.js — campana (tu mp3 o sintetizada), bocina, aviso de 10 s,
   beeps de cuenta regresiva y vibración
   ============================================================ */
(function (root) {
  const Coach = (root.Coach = root.Coach || {});

  let ctx = null;
  const bellEl = new Audio('Sonidos/campana.mp3');
  bellEl.preload = 'auto';

  const cfg = { sound: 'file', volume: 0.6, vibrate: true };

  function ctxReady() {
    if (!ctx) {
      const AC = root.AudioContext || root.webkitAudioContext;
      if (AC) ctx = new AC();
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /* Hay que llamarlo dentro de un click/tap: los navegadores bloquean el audio hasta entonces. */
  function unlock() {
    ctxReady();
    try {
      bellEl.muted = true;
      const p = bellEl.play();
      if (p && p.then) p.then(() => { bellEl.pause(); bellEl.currentTime = 0; bellEl.muted = false; }).catch(() => { bellEl.muted = false; });
    } catch (e) { bellEl.muted = false; }
  }

  function tone(freq, startAt, dur, vol, type) {
    const c = ctxReady(); if (!c) return;
    const t = c.currentTime + startAt;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + dur + 0.05);
  }

  /* Campana sintetizada: parciales inarmónicos de un metal golpeado. */
  function synthBell(vol) {
    [[1, 1], [2.76, 0.6], [5.4, 0.35], [8.93, 0.2]].forEach(([mult, g]) => {
      tone(640 * mult, 0, 2.2 / Math.sqrt(mult), vol * 0.55 * g, 'sine');
    });
  }

  /* Bocina de gimnasio: dos tonos secos. */
  function horn(vol) {
    tone(440, 0, 0.55, vol * 0.5, 'sawtooth');
    tone(444, 0, 0.55, vol * 0.5, 'sawtooth');
  }

  function playOnce(vol) {
    const kind = cfg.sound;
    if (kind === 'synth') return synthBell(vol);
    if (kind === 'horn') return horn(vol);
    try {
      const a = bellEl.cloneNode();
      a.volume = Math.min(1, vol);
      const p = a.play();
      if (p && p.catch) p.catch(() => synthBell(vol));
    } catch (e) { synthBell(vol); }
  }

  /* n campanadas seguidas (separadas ~0,7 s). */
  function ding(n) {
    n = Math.max(1, n || 1);
    for (let i = 0; i < n; i++) setTimeout(() => playOnce(cfg.volume), i * 700);
    buzz(n === 1 ? [220] : [180, 90, 180]);
  }

  /* Aviso de 10 segundos: el típico "clap" doble de los relojes de boxeo. */
  function clapper() {
    const c = ctxReady(); if (!c) return;
    [0, 0.14].forEach((delay) => {
      const t = c.currentTime + delay;
      const len = Math.floor(c.sampleRate * 0.07);
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      const src = c.createBufferSource(); src.buffer = buf;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.9;
      const g = c.createGain(); g.gain.value = Math.min(1, cfg.volume * 1.6);
      src.connect(f); f.connect(g); g.connect(c.destination);
      src.start(t);
    });
    buzz([80, 60, 80]);
  }

  /* 3-2-1: beeps cortos; el último más agudo. */
  function countdown(n) {
    tone(n === 1 ? 1175 : 880, 0, 0.14, cfg.volume * 0.5, 'sine');
    buzz([40]);
  }

  function buzz(pattern) {
    if (cfg.vibrate && navigator.vibrate) { try { navigator.vibrate(pattern); } catch (e) {} }
  }

  Coach.Audio = {
    configure(o) { Object.assign(cfg, o); },
    unlock, ding, clapper, countdown, buzz,
    testBell() { playOnce(cfg.volume); },
  };
})(typeof window !== 'undefined' ? window : globalThis);
