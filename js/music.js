/* ============================================================
   music.js — música propia (archivos del dispositivo).
   Suena durante los rounds y BAJA sola cuando habla el coach o suena la campana.
   Los archivos no se suben a ningún lado: se leen en el propio navegador.
   (En iPhone el volumen de un audio no se puede bajar por código: ahí no hay "bajar", solo sube/baja el sistema.)
   ============================================================ */
(function (root) {
  const Coach = (root.Coach = root.Coach || {});

  const DUCK = 0.28;                 // a qué fracción baja mientras habla el coach
  let list = [], idx = 0, el = null;
  let vol = 0.5, duckOn = true, ducked = false, duckTimer = null;
  let cur = 0, rampIv = null, wantPlay = false;
  let onChange = null;

  const clamp = (v) => Math.min(1, Math.max(0, v));
  const target = () => (wantPlay ? clamp(vol * (duckOn && ducked ? DUCK : 1)) : 0);
  const notify = () => { if (onChange) onChange(info()); };

  function audio() {
    if (!el) {
      el = new Audio();
      el.preload = 'auto';
      el.addEventListener('ended', () => next());
      el.addEventListener('error', () => { if (wantPlay && list.length > 1) next(); });
    }
    return el;
  }

  /* El volumen sube y baja de a poco (sin saltos bruscos). */
  function ramp() {
    if (rampIv) return;
    rampIv = setInterval(() => {
      const t = target();
      cur += Math.max(-0.12, Math.min(0.06, t - cur));
      if (Math.abs(t - cur) < 0.01) cur = t;
      if (el) { try { el.volume = clamp(cur); } catch (e) {} }
      if (cur === t) {
        clearInterval(rampIv); rampIv = null;
        if (t === 0 && el && !wantPlay) { try { el.pause(); } catch (e) {} }
      }
    }, 40);
  }

  function load() {
    if (!list.length) return false;
    const a = audio();
    const url = list[idx].url;
    if (a.dataset.src !== url) { a.src = url; a.dataset.src = url; }
    return true;
  }

  function setFiles(files) {
    const ok = Array.from(files || []).filter((f) => /^audio\//.test(f.type) || /\.(mp3|m4a|aac|wav|ogg|opus|flac|webm)$/i.test(f.name));
    list.forEach((x) => { try { URL.revokeObjectURL(x.url); } catch (e) {} });
    list = ok.map((f) => ({ name: f.name.replace(/\.[^.]+$/, ''), url: URL.createObjectURL(f) }));
    idx = list.length ? Math.floor(Math.random() * list.length) : 0;
    if (el) { el.pause(); el.removeAttribute('src'); delete el.dataset.src; }
    wantPlay = false; cur = 0;
    notify();
    return list.length;
  }

  function play() {
    if (!load()) return false;
    wantPlay = true;
    const a = audio();
    try { const p = a.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
    ramp(); notify();
    return true;
  }
  function pause() { wantPlay = false; ramp(); notify(); }
  function stop() { wantPlay = false; ducked = false; clearTimeout(duckTimer); ramp(); notify(); }
  function next(dir) {
    if (!list.length) return;
    idx = (idx + (dir || 1) + list.length) % list.length;
    const was = wantPlay;
    load();
    if (was) { try { const p = audio().play(); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
    notify();
  }

  /* La música baja mientras `on` sea true; al terminar vuelve con una pequeña demora
     (así no "respira" entre las palabras de un mismo combo). */
  function duck(on) {
    clearTimeout(duckTimer);
    if (on) { ducked = true; ramp(); }
    else duckTimer = setTimeout(() => { ducked = false; ramp(); }, 450);
  }

  function info() {
    return { count: list.length, name: list[idx] ? list[idx].name : '', playing: wantPlay, index: idx };
  }

  Coach.Music = {
    setFiles, play, pause, stop, next, prev() { next(-1); }, duck,
    setVolume(v) { vol = clamp(v); ramp(); },
    setDuck(b) { duckOn = !!b; ramp(); },
    info, onChange(fn) { onChange = fn; },
    get playing() { return wantPlay; },
    get count() { return list.length; },
    get _el() { return el; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
