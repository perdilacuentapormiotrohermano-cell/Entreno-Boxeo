/* ============================================================
   voice.js — voz del coach
   Dos formas de hablar:
     • Voz del dispositivo (Web Speech API). Si hay voces "Natural" (Edge/Windows,
       Chrome/Android) las pone primero: suenan mucho más humanas.
     • Pack de audios (Sonidos/voz/*.mp3): frases pregrabadas con una voz neuronal.
       Sin demora y con timing exacto. Se genera con tools/generar_voz.py.
   speak*() devuelve una promesa que se resuelve cuando la voz TERMINA,
   así el coach nunca habla encima de sí mismo.
   ============================================================ */
(function (root) {
  const Coach = (root.Coach = root.Coach || {});
  const synth = root.speechSynthesis;
  let voices = [];
  let selectedName = '';
  let current = null;      // referencia fuerte: si el navegador la recolecta, onend nunca se dispara
  let pending = null;      // { resolve, timer, u }
  let onListChange = null;

  /* ---------- voces del dispositivo ---------- */
  const isNatural = (v) => /natural|neural|online|premium|enhanced|mejorada/i.test(v.name);

  function refresh() {
    voices = synth ? synth.getVoices() : [];
    if (onListChange) onListChange(spanishVoices());
  }

  function spanishVoices() {
    const es = voices.filter((v) => /^es([-_]|$)/i.test(v.lang));
    // 1.º las naturales, 2.º Argentina/Latinoamérica, 3.º España.
    const loc = (v) => (/AR/i.test(v.lang) ? 0 : /(MX|US|419|CL|CO|UY)/i.test(v.lang) ? 1 : 2);
    return es.sort((a, b) => (isNatural(b) - isNatural(a)) || loc(a) - loc(b) || a.name.localeCompare(b.name));
  }

  function init(cb) {
    onListChange = cb;
    if (!synth) { if (cb) cb([]); return; }
    refresh();
    if (synth.addEventListener) synth.addEventListener('voiceschanged', refresh);
    else synth.onvoiceschanged = refresh;
    let tries = 0;   // Chrome a veces carga las voces tarde
    const iv = setInterval(() => { if (voices.length || ++tries > 12) clearInterval(iv); else refresh(); }, 250);
  }

  function pick() {
    return voices.find((v) => v.name === selectedName) || spanishVoices()[0] || null;
  }

  /* ---------- pack de audios ---------- */
  const CLIP_DIR = 'Sonidos/voz/';
  let clipKeys = null;           // Set con los clips disponibles (manifest.json)
  let clipToken = 0;             // para cancelar una reproducción en curso
  let clipAudio = null;
  let clipResolve = null;
  let onClipsChange = null;

  const slug = (t) => (Coach.Combos ? Coach.Combos.slug(t) : String(t));

  async function loadClips(cb) {
    onClipsChange = cb || onClipsChange;
    try {
      const r = await fetch(CLIP_DIR + 'manifest.json', { cache: 'no-cache' });
      if (r.ok) {
        const j = await r.json();
        clipKeys = new Set(j.clips || []);
      }
    } catch (e) { clipKeys = null; }
    if (onClipsChange) onClipsChange(!!(clipKeys && clipKeys.size));
  }

  const clipsAvailable = () => !!(clipKeys && clipKeys.size);
  const canPlayClips = (parts) => clipsAvailable() && parts && parts.length && parts.every((p) => clipKeys.has(slug(p)));

  function stopClips() {
    clipToken++;
    if (clipAudio) { try { clipAudio.pause(); } catch (e) {} clipAudio = null; }
    if (clipResolve) { const r = clipResolve; clipResolve = null; r(); }
  }

  function speakClips(parts, opts) {
    opts = opts || {};
    stopClips();
    const token = ++clipToken;
    return new Promise((resolve) => {
      clipResolve = resolve;
      let i = 0;
      const next = () => {
        if (token !== clipToken) return;
        if (i >= parts.length) { clipResolve = null; resolve(); return; }
        const a = new Audio(CLIP_DIR + slug(parts[i++]) + '.mp3');
        clipAudio = a;
        a.volume = opts.volume == null ? 1 : opts.volume;
        try { a.playbackRate = Math.min(2, Math.max(0.6, opts.rate || 1)); a.preservesPitch = true; } catch (e) {}
        a.onended = () => setTimeout(next, 60);
        a.onerror = next;
        const p = a.play();
        if (p && p.catch) p.catch(next);
      };
      next();
    });
  }

  /* ---------- API común ---------- */
  function cancel() {
    stopClips();
    if (pending) { clearTimeout(pending.timer); const r = pending.resolve; pending = null; r(); }
    current = null;
    if (synth) synth.cancel();
  }

  /* opts: { rate, volume, pitch, estimateMs } */
  function speak(text, opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      if (!synth || !text) return resolve();
      cancel();
      const u = new SpeechSynthesisUtterance(text);
      const v = pick();
      u.lang = (v && v.lang) || 'es-ES';
      try { if (v) u.voice = v; } catch (e) { /* voz no asignable: usa la predeterminada del idioma */ }
      u.rate = Math.min(2, Math.max(0.5, opts.rate || 1));
      u.pitch = opts.pitch == null ? 0.95 : opts.pitch;
      u.volume = opts.volume == null ? 1 : opts.volume;
      current = u;

      const done = () => {
        if (!pending || pending.u !== u) return;
        clearTimeout(pending.timer);
        pending = null;
        resolve();
      };
      // Si el navegador no avisa que terminó (pasa en algunos motores), seguimos igual.
      const fallback = (opts.estimateMs || 2500) * 1.6 + 1500;
      pending = { resolve, u, timer: setTimeout(done, fallback) };
      u.onend = done;
      u.onerror = done;
      synth.speak(u);
    });
  }

  /* Dice algo: con el pack de audios si está elegido y tiene TODAS las frases; si no, con la voz del dispositivo. */
  function say(text, parts, opts) {
    opts = opts || {};
    if (opts.mode === 'clips' && canPlayClips(parts)) { cancel(); return speakClips(parts, opts); }
    return speak(text, opts);
  }

  /* iOS/Safari solo habla si la primera locución sale de un toque del usuario. */
  function unlock() {
    if (!synth) return;
    try {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      synth.speak(u);
    } catch (e) {}
  }

  Coach.Voice = {
    init, speak, say, cancel, unlock, loadClips,
    list: spanishVoices,
    isNatural,
    clipsAvailable,
    select(name) { selectedName = name || ''; },
    get supported() { return !!synth; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
