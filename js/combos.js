/* ============================================================
   combos.js — biblioteca de combinaciones, generador y VALIDADOR

   Cada llamado es una lista de "tokens":
     1..6   golpes (sistema numérico clásico)
            1 jab · 2 cross · 3 gancho adelante · 4 gancho atrás
            5 upper adelante · 6 upper atrás
            ("adelante" = mano de adelante de la guardia, "atrás" = la de atrás)
     3b..6b el mismo golpe pero al cuerpo
     sj / sc  esquive al jab / esquive al cross (la cabeza sale hacia el lado de afuera del golpe)
     d        agachada (para pasar por debajo de un gancho)
     mL mR mB mF  paso a izquierda / derecha / atrás / adelante

   Todo lo que se canta pasa por validate(): si una combinación no
   se puede hacer físicamente, el generador la descarta.
   ============================================================ */
(function (root) {
  const Coach = (root.Coach = root.Coach || {});

  const HAND = { 1: 'lead', 2: 'rear', 3: 'lead', 4: 'rear', 5: 'lead', 6: 'rear' };

  /* ---------- parseo ---------- */
  function parse(t) {
    let m;
    if ((m = /^([1-6])(b?)$/.exec(t))) {
      const n = +m[1];
      if (m[2] && n < 3) return null; // el jab y el cross no se tiran "al cuerpo" en este sistema
      return { type: 'punch', n, body: m[2] === 'b', hand: HAND[n], tok: t };
    }
    if (t === 'sj') return { type: 'defense', id: 'slipJab', tok: t };
    if (t === 'sc') return { type: 'defense', id: 'slipCross', tok: t };
    if (t === 'd') return { type: 'defense', id: 'duck', tok: t };
    if ((m = /^m([LRBF])$/.exec(t))) return { type: 'move', dir: m[1], tok: t };
    return null;
  }

  /* ---------- reglas de realizabilidad ----------
     Dos golpes seguidos con la MISMA mano casi nunca se pueden encadenar
     sin perder velocidad/equilibrio. Estas son las únicas excepciones
     que se ven en cualquier gimnasio: */
  const SAME_HAND_OK = new Set([
    '1>1',   // doble jab
    '1>3',   // jab + gancho de la misma mano
    '1>3b',  // jab arriba + gancho al hígado
    '5>3',   // upper + gancho de la misma mano
    '3b>3',  // gancho al cuerpo + gancho a la cabeza (cambio de nivel)
  ]);
  /* Qué golpe sale de forma natural después de cada defensa (la posición del cuerpo lo permite):
       esquive al jab   → la cabeza sale por afuera hacia el lado de la mano de atrás → cross / gancho o upper de atrás
       esquive al cross → el peso queda sobre el lado de adelante → gancho o upper de adelante
       agachada         → se sube con gancho o upper */
  const COUNTER = { slipJab: [2, 4, 6], slipCross: [3, 5], duck: [3, 4, 5, 6] };
  const key = (a, b) => `${a.n}${a.body ? 'b' : ''}>${b.n}${b.body ? 'b' : ''}`;

  function validate(tokens) {
    const errors = [];
    if (!tokens || !tokens.length) return { ok: false, errors: ['vacío'] };
    const p = tokens.map(parse);
    if (p.some((x) => !x)) return { ok: false, errors: ['token inválido'] };

    const punches = p.filter((x) => x.type === 'punch');
    const moves = p.filter((x) => x.type === 'move');
    const defs = p.filter((x) => x.type === 'defense');

    if (punches.length > 6) errors.push('más de 6 golpes');
    if (moves.length > 1) errors.push('más de un movimiento');
    if (moves.length === 1 && p.length > 1) {
      const i = p.findIndex((x) => x.type === 'move');
      if (i !== 0 && i !== p.length - 1) errors.push('movimiento en el medio del combo');
    }
    if (defs.length > 2) errors.push('más de 2 defensas');
    if (punches.filter((x) => x.body).length > 2) errors.push('más de 2 golpes al cuerpo');
    if (punches.filter((x) => x.n >= 5).length > 2) errors.push('más de 2 uppers');

    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i], b = p[i + 1];
      if (a.type === 'punch' && b.type === 'punch') {
        if (a.hand === b.hand && !SAME_HAND_OK.has(key(a, b))) {
          errors.push(`misma mano seguida (${key(a, b)})`);
        }
        const c = p[i + 2];
        if (c && c.type === 'punch' && a.n === 1 && b.n === 1 && c.n === 1) errors.push('triple jab');
      }
      if (a.type === 'defense' && b.type === 'defense') errors.push('dos defensas seguidas');
      if (a.type === 'defense' && b.type === 'punch' && !COUNTER[a.id].includes(b.n)) {
        errors.push(`tras ${a.tok} no sale el golpe ${b.n}`);
      }
    }
    return { ok: errors.length === 0, errors };
  }

  /* ---------- biblioteca "de gimnasio" ---------- */
  const RAW = {
    1: [
      '1', '2', '1 2', '1 1', '1 1 2', '1 2 3', '2 3 2', '1 2 1', '3 2', '2 3', '1 3 2',
      // con defensa
      'sj 2', '1 2 sj', 'd 3', 'sj', 'sc', 'd',
      // con movimiento
      'mB', 'mF', 'mL', 'mR', '1 2 mB', 'mL 1 2', 'mF 1', '1 mB',
    ],
    2: [
      '1 2 3 2', '1 2 3 4', '1 2 5 2', '1 1 2 3', '1 2 3 6', '1 6 3 2', '1 2 5 6',
      '5 2 3', '2 1 2', '3 2 3', '2 3 4 3', '1 4 3 2', '2 3 2 3',
      // con defensa
      '1 2 sj 2', 'sj 2 3', 'sj 2 3 2', 'sc 3 2', '2 sc 3 2', 'd 3 2', '1 2 d 3 2', '1 2 sj 2 3', '1 2 sc 3 2',
      // con movimiento
      '1 2 3 mB', '1 2 3 mL', 'mR 1 2 3', 'mB 1 2 3',
      // al cuerpo
      '1 3b 2', '1 2 3b 2', '2 3b 2', '1 1 3b 2',
    ],
    3: [
      '1 2 3 2 3 2', '1 1 2 3 2', '1 2 5 6 3 2', '1 6 3 2 3 2', '2 3 2 3 2', '1 2 5 2 3 2',
      '1 2 3 6 3 2', '5 2 3 2 3', '1 2 3 4 3 2',
      // con defensa
      '1 2 sj 2 3 2', '1 2 3 sc 3 2', 'sj 2 3 2 sc 3', '1 2 3 2 sj 2', '1 2 d 3 2 3', '1 2 d 3 4', 'sc 5 2 3',
      // con movimiento
      '1 2 d 3 4 mB', 'mL 1 2 3 2', '1 2 3 2 mR', 'mF 1 2 3 2',
      // al cuerpo
      '1 2 3b 3 2', '1 3b 3 2', '1 2 3 2 3b 3', '1 2 3 4b 3', '1 2 3b 3 2 3',
    ],
  };

  const CURATED = [];
  Object.keys(RAW).forEach((lv) => {
    RAW[lv].forEach((s) => {
      const tokens = s.split(' ');
      CURATED.push({
        level: +lv,
        tokens,
        hasBody: tokens.some((t) => /b$/.test(t)),
        hasMove: tokens.some((t) => t[0] === 'm'),
        hasDef: tokens.some((t) => t === 'sj' || t === 'sc' || t === 'd'),
        punches: tokens.filter((t) => /^[1-6]/.test(t)).length,
      });
    });
  });

  /* ---------- generador ---------- */
  const DEFS = ['sj', 'sc', 'd'];
  const NEXT = { 1: [2, 4, 6, 1, 3], 2: [1, 3, 5], 3: [2, 4, 6], 4: [1, 3, 5], 5: [2, 4, 6, 3], 6: [1, 3, 5] };
  const W = { 1: 3, 2: 3.2, 3: 2, 4: 1.2, 5: 1, 6: 1.2 };
  const LEN_W = {
    1: { 1: 2, 2: 5, 3: 4 },
    2: { 2: 3, 3: 5, 4: 3 },
    3: { 3: 3, 4: 4, 5: 3, 6: 2 },
  };
  const LEN_RANGE = { 1: [1, 3], 2: [2, 4], 3: [3, 6] };

  function wpick(items, wfn, rng) {
    let total = 0;
    const ws = items.map((x) => { const w = Math.max(0, wfn(x)); total += w; return w; });
    if (total <= 0) return items[Math.floor(rng() * items.length)];
    let r = rng() * total;
    for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r <= 0) return items[i]; }
    return items[items.length - 1];
  }

  function generate(o, rng) {
    const L = o.level;
    const mode = o.mode;
    const boost = mode === 'sparring' ? 1.6 : 1;

    // llamados sueltos: un paso o una defensa ("reflejos")
    if (!o.minPunches) {
      if (o.movement && !o.noMovement && rng() < 0.04 * boost) return [pickMove(rng, o)];
      if (o.defense && rng() < 0.04 * boost) return [DEFS[Math.floor(rng() * DEFS.length)]];
    }

    const allowed = L === 1 ? [1, 2, 3] : [1, 2, 3, 4, 5, 6];
    let [minP, maxP] = LEN_RANGE[L];
    maxP = Math.min(maxP, o.maxPunches || 6);
    minP = Math.min(Math.max(minP, o.minPunches || 0), maxP);
    const lens = Object.keys(LEN_W[L]).map(Number).filter((n) => n >= minP && n <= maxP);
    const len = wpick(lens.length ? lens : [maxP], (n) => LEN_W[L][n] || 1, rng);

    const first = wpick(allowed, (n) => ({ 1: 40, 2: 20, 3: 12, 4: 8, 5: 10, 6: 10 }[n]), rng);
    const seq = [first];
    while (seq.length < len) {
      const prev = seq[seq.length - 1];
      const cand = NEXT[prev].filter((n) => allowed.includes(n));
      const pick = wpick(cand, (n) => {
        let w = W[n];
        if (HAND[n] === HAND[prev]) w *= 0.5; // excepciones de misma mano: menos frecuentes
        if (n === 1 && prev === 1 && seq[seq.length - 2] === 1) w = 0; // sin triple jab
        return w;
      }, rng);
      seq.push(pick);
    }

    let tokens = seq.map(String);

    // al cuerpo (solo ganchos/uppers, nunca el primero)
    if (o.body && L >= 2) {
      let bodies = 0;
      tokens = tokens.map((t, i) => {
        if (i > 0 && +t >= 3 && bodies < 2 && rng() < 0.3) { bodies++; return t + 'b'; }
        return t;
      });
    }
    // defensa
    if (o.defense && rng() < (L === 1 ? 0.12 : 0.2)) {
      // prueba esquives en un lugar al azar hasta encontrar uno que deje un contraataque posible
      const pos = Math.floor(rng() * (tokens.length + 1));
      const opts = DEFS.slice().sort(() => rng() - 0.5);
      for (const d of opts) {
        const t2 = tokens.slice(); t2.splice(pos, 0, d);
        if (validate(t2).ok) { tokens = t2; break; }
      }
    }
    // movimiento al inicio o al final
    if (o.movement && !o.noMovement && rng() < 0.12) {
      const m = pickMove(rng, o);
      if (rng() < 0.5) tokens.unshift(m); else tokens.push(m);
    }
    return tokens;
  }

  function pickMove(rng, o) {
    const opts = ['mL', 'mR', 'mB', 'mF'].filter((m) => m !== (o._lastMove || ''));
    return opts[Math.floor(rng() * opts.length)];
  }


  /* ---------- tipos de ronda ---------- */
  const ALLOWED = (L) => (L === 1 ? [1, 2, 3] : [1, 2, 3, 4, 5, 6]);

  /* Defensa y contra: SIEMPRE empieza con un esquive/agachada y sigue con golpes que salen de esa posición. */
  function defenseDrill(o, rng) {
    const L = o.level, allowed = ALLOWED(L);
    const [minE, maxE0] = { 1: [1, 2], 2: [1, 3], 3: [2, 4] }[L] || [1, 3];
    const maxE = Math.max(1, Math.min(maxE0, o.maxPunches || 6));
    const ids = { sj: 'slipJab', sc: 'slipCross', d: 'duck' };
    for (let attempt = 0; attempt < 40; attempt++) {
      const d = wpick(['sj', 'sc', 'd'], (x) => (x === 'd' ? 0.6 : 1) * (x === o._lastDef && attempt < 20 ? 0.15 : 1), rng);
      const cand = COUNTER[ids[d]].filter((n) => allowed.includes(n));
      if (!cand.length) continue;
      const seq = [wpick(cand, (n) => W[n], rng)];
      const len = minE + Math.floor(rng() * (Math.max(minE, maxE) - minE + 1));
      while (seq.length < len) {
        const prev = seq[seq.length - 1];
        const nx = NEXT[prev].filter((n) => allowed.includes(n));
        seq.push(wpick(nx, (n) => W[n] * (HAND[n] === HAND[prev] ? 0.5 : 1), rng));
      }
      const t = [d].concat(seq.map(String));
      if (validate(t).ok && fits(t, o)) return t;
    }
    return ['sj', '2'];
  }

  /* Reflejos: una orden suelta y corta (un golpe, dos golpes, una defensa o un paso). */
  function reflexCall(o, state, rng) {
    const L = o.level, allowed = ALLOWED(L);
    const wDef = o.defense ? 0.28 : 0, wMove = o.movement ? 0.14 : 0, wPair = L >= 2 ? 0.16 : 0;
    for (let attempt = 0; attempt < 20; attempt++) {
      const r = rng();
      let t;
      if (r < wDef) t = [DEFS[Math.floor(rng() * DEFS.length)]];
      else if (r < wDef + wMove) t = [pickMove(rng, o)];
      else if (r < wDef + wMove + wPair) {
        const a = wpick(allowed, (n) => ({ 1: 40, 2: 25, 3: 12, 4: 8, 5: 8, 6: 8 }[n]), rng);
        const b = wpick(NEXT[a].filter((n) => allowed.includes(n)), (n) => W[n], rng);
        t = [String(a), String(b)];
      } else t = [String(wpick(allowed, (n) => ({ 1: 40, 2: 30, 3: 14, 4: 6, 5: 5, 6: 5 }[n]), rng))];
      const k = t.join(' ');
      if (validate(t).ok && !(state.recent || []).slice(-2).includes(k)) return t;
    }
    return ['1'];
  }

  /* Combo para «Repetición» cuando el usuario no puso uno: de la biblioteca, largo suficiente y sin pasos. */
  function drillCombo(o, rng) {
    rng = rng || Math.random;
    const q = Object.assign({}, o, { movement: false, noMovement: true, minPunches: o.level === 1 ? 2 : 3 });
    return pickCurated(q, rng) || ['1', '2', '3', '2'];
  }

  /* Lo que escribe el usuario: «1 2 3 2», «1-2-3-2», «sj 2 3»… → tokens validados. */
  function parseCombo(str) {
    const tokens = String(str || '').toLowerCase().split(/[\s,;\-–—>·]+/).filter(Boolean);
    if (!tokens.length) return { ok: false, tokens: [], errors: ['vacío'] };
    if (tokens.length > 10) return { ok: false, tokens, errors: ['demasiado largo'] };
    const v = validate(tokens);
    return { ok: v.ok, tokens, errors: v.errors };
  }

  /* ¿Lo que dice la voz entra en el tiempo máximo? (frases largas no se pueden seguir) */
  function fits(tokens, o) {
    if (!o.maxSpeechMs) return true;
    const d = describe(tokens, { stance: o.stance, style: o.style, slip: o.slip });
    return estimateSpeechMs(d.speech, o.rate || 1) <= o.maxSpeechMs;
  }

  function pickCurated(o, rng) {
    const pool = CURATED.filter((c) =>
      c.level <= o.level &&
      fits(c.tokens, o) &&
      (o.body || !c.hasBody) &&
      (o.movement && !o.noMovement ? true : !c.hasMove) &&
      (o.defense || !c.hasDef) &&
      c.punches <= (o.maxPunches || 6) &&
      c.punches >= (o.minPunches || 0) &&
      !(o._lastMove && c.tokens.includes(o._lastMove)) &&   // no repetir el mismo paso dos veces seguidas
      // los combos de nivel inferior pesan menos
      (c.level === o.level || rng() < 0.35)
    );
    if (!pool.length) return null;
    // los combos con pasos o defensa pesan menos, para que no dominen el entrenamiento
    const pick = wpick(pool, (c) => (c.hasMove ? 0.4 : 1) * (c.hasDef ? 0.7 : 1), rng);
    return pick.tokens.slice();
  }

  /* opts: { level, mode, defense, movement, body, maxPunches, noMovement,
            maxSpeechMs, style, stance, rate }
     state: objeto que se va pasando para evitar repeticiones. */
  function next(opts, state, rng) {
    rng = rng || Math.random;
    const o = Object.assign({ level: 2, mode: 'normal', defense: true, movement: true, body: false }, opts);
    state = state || { recent: [], lastMove: '' };
    state.recent = state.recent || [];
    o._lastMove = state.lastMove;
    o._lastDef = state.lastDef;

    // Cada tipo de ronda ajusta lo que se puede cantar.
    if (o.drill === 'manoplas') { o.movement = false; o.minPunches = Math.max(o.minPunches || 0, 2); }
    if (o.drill === 'bolsa') { o.defense = false; o.minPunches = Math.max(o.minPunches || 0, o.level === 1 ? 2 : 3); }

    if (o.drill === 'defensa' || o.drill === 'reflejos') {
      const tk = o.drill === 'defensa' ? defenseDrill(o, rng) : reflexCall(o, state, rng);
      const kk = tk.join(' ');
      state.recent.push(kk);
      if (state.recent.length > 4) state.recent.shift();
      const d0 = tk.find((t) => t === 'sj' || t === 'sc' || t === 'd'); if (d0) state.lastDef = d0;
      const mv0 = tk.find((t) => t[0] === 'm'); if (mv0) state.lastMove = mv0;
      return tk;
    }

    const pCur = { normal: 0.65, intensity: 0.55, sparring: 0.35 }[o.mode] ?? 0.6;
    let tokens = null, k = '';
    for (let attempt = 0; attempt < 12; attempt++) {
      tokens = null;
      if (rng() < pCur) tokens = pickCurated(o, rng);
      if (!tokens) {
        for (let i = 0; i < 30 && !tokens; i++) {
          const t = generate(o, rng);
          if (validate(t).ok && fits(t, o)) tokens = t;
        }
      }
      if (!tokens) tokens = ['1', '2'];
      k = tokens.join(' ');
      if (!state.recent.includes(k)) break;
    }
    state.recent.push(k);
    if (state.recent.length > 4) state.recent.shift();
    const mv = tokens.find((t) => t[0] === 'm');
    if (mv) state.lastMove = mv;
    return tokens;
  }

  /* ---------- texto, chips y tiempos ---------- */
  const NUM_WORDS = ['uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis'];
  // Cómo se escribe en pantalla -> cómo lo pronuncia el motor de voz en español.
  const SPEECH_FIX = [
    [/\bjab\b/gi, 'yab'],
    [/\bcross\b/gi, 'cros'],
    [/\bupper\b/gi, 'áper'],
  ];
  const MOVES = {
    L: { say: 'paso izquierda', text: 'PASO IZQUIERDA', icon: '←' },
    R: { say: 'paso derecha',   text: 'PASO DERECHA',   icon: '→' },
    B: { say: 'paso atrás',     text: 'PASO ATRÁS',     icon: '↓' },
    F: { say: 'paso adelante',  text: 'PASO ADELANTE',  icon: '↑' },
  };

  function punchWords(p, stance) {
    const lead = stance === 'zurdo' ? 'derecho' : 'izquierdo';
    const rear = stance === 'zurdo' ? 'izquierdo' : 'derecho';
    const side = p.hand === 'lead' ? lead : rear;
    if (p.n === 1) return { name: 'jab', short: 'JAB' };
    if (p.n === 2) return { name: 'cross', short: 'CROSS' };
    const base = p.n <= 4 ? 'gancho' : 'upper';
    return {
      name: `${base} ${side}`,
      short: `${base.toUpperCase()} ${side === 'izquierdo' ? 'IZQ' : 'DER'}`,
    };
  }

  function describe(tokens, opts) {
    const stance = (opts && opts.stance) || 'ortodoxo';
    const style = (opts && opts.style) || 'nombres';
    const slipStyle = (opts && opts.slip) || 'ambos';   // ambos | direccion | golpe
    const chips = [];
    const say = [];
    const parts = [];   // frases sueltas (cada una puede ser un clip de audio)
    tokens.forEach((t) => {
      const x = parse(t);
      if (!x) return;
      if (x.type === 'punch') {
        const w = punchWords(x, stance);
        if (style === 'numeros') {
          chips.push({ kind: 'punch', main: String(x.n), sub: x.body ? 'AL CUERPO' : w.short, body: x.body });
          say.push(NUM_WORDS[x.n - 1] + (x.body ? ' al cuerpo' : ''));
          parts.push(NUM_WORDS[x.n - 1]); if (x.body) parts.push('al cuerpo');
        } else {
          chips.push({ kind: 'punch', main: w.short, sub: x.body ? 'AL CUERPO' : '', body: x.body });
          say.push(w.name + (x.body ? ' al cuerpo' : ''));
          parts.push(w.name); if (x.body) parts.push('al cuerpo');
        }
      } else if (x.type === 'defense') {
        if (x.id === 'duck') {
          chips.push({ kind: 'defense', main: 'AGACHADA', sub: 'AL GANCHO', icon: '↓' });
          const w = slipStyle === 'direccion' ? 'agachada' : 'agachada al gancho';
          say.push(w); parts.push(w);
        } else {
          const jab = x.id === 'slipJab';
          // Guardia ortodoxa: al jab la cabeza sale a la derecha, al cross a la izquierda. Zurdo: al revés.
          const right = jab ? stance !== 'zurdo' : stance === 'zurdo';
          const dir = right ? 'derecha' : 'izquierda', target = jab ? 'jab' : 'cross';
          chips.push({ kind: 'defense', main: 'ESQUIVE', sub: `AL ${target.toUpperCase()} · ${dir.toUpperCase()}`, icon: right ? '→' : '←' });
          if (slipStyle === 'direccion') { say.push(`esquive ${dir}`); parts.push(`esquive ${dir}`); }
          else if (slipStyle === 'golpe') { say.push(`esquive al ${target}`); parts.push(`esquive al ${target}`); }
          else { say.push(`esquive al ${target}, ${dir}`); parts.push(`esquive al ${target}`, dir); }
        }
      } else {
        const m = MOVES[x.dir];
        chips.push({ kind: 'move', main: m.text, sub: '', icon: m.icon });
        say.push(m.say);
        parts.push(m.say);
      }
    });
    let speech = say.join(', ');
    SPEECH_FIX.forEach(([re, to]) => { speech = speech.replace(re, to); });
    return { chips, speech, parts, label: say.join(' · ') };
  }

  /* Nombre de archivo de un clip: «gancho izquierdo» → gancho-izquierdo */
  function slug(text) {
    return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function phonetic(text) {
    let t = text;
    SPEECH_FIX.forEach(([re, to]) => { t = t.replace(re, to); });
    return t;
  }

  /* Todas las frases que el coach puede decir (para generar un pack de audios). */
  function allPhrases() {
    const list = ['jab', 'cross', 'gancho izquierdo', 'gancho derecho', 'upper izquierdo', 'upper derecho', 'al cuerpo']
      .concat(NUM_WORDS, ['esquive al jab', 'esquive al cross', 'esquive derecha', 'esquive izquierda', 'derecha', 'izquierda', 'agachada', 'agachada al gancho'],
        Object.keys(MOVES).map((k) => MOVES[k].say));
    for (let i = 1; i <= 15; i++) list.push('raund ' + i);
    list.push('último raund', 'ritmo alto, diez segundos', 'ritmo alto, quince segundos', 'ritmo normal', 'otra', 'combo');
    return list.map((t) => ({ key: slug(t), text: t, say: phonetic(t) }));
  }

  /* Duración aproximada de lo que dice la voz (a velocidad 1.0 ≈ 5.5 sílabas/seg). */
  function estimateSpeechMs(text, rate) {
    const syll = (text.match(/[aeiouáéíóúü]+/gi) || []).length;
    const commas = (text.match(/,/g) || []).length;
    return (syll * 185 + commas * 130) / (rate || 1);
  }

  /* Tiempo razonable que tarda el boxeador en ejecutar lo cantado. */
  function executionMs(tokens, pace) {
    let ms = 0;
    tokens.forEach((t) => {
      const x = parse(t);
      if (!x) return;
      if (x.type === 'punch') ms += pace.punchMs;
      else if (x.type === 'defense') ms += pace.punchMs * 0.9;
      else ms += pace.punchMs * 1.3;
    });
    return ms;
  }

  /* Espera entre el FIN de la voz y el próximo llamado. */
  function gapMs(tokens, pace, scale) {
    return (executionMs(tokens, pace) + pace.resetMs) * (scale || 1);
  }

  Coach.Combos = { parse, parseCombo, validate, CURATED, next, defenseDrill, reflexCall, drillCombo, describe, estimateSpeechMs, executionMs, gapMs, generate, SAME_HAND_OK, slug, allPhrases };
  if (typeof module !== 'undefined' && module.exports) module.exports = Coach.Combos;
})(typeof window !== 'undefined' ? window : globalThis);
