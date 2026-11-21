/* ============================================================
   ui.js — conecta ajustes, reloj, coach, sonido y ranking con la pantalla
   ============================================================ */
(function (root) {
  const Coach = (root.Coach = root.Coach || {});

  function init() {
    const { Config, Storage, Audio, Voice, Combos, Engine, Driver, Ranking, Stats, Music } = Coach;
    const $ = (id) => document.getElementById(id);
    const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));
    const body = document.body;

    let S = Storage.getSettings();
    let engine = null, driver = null, session = null;
    let lastPhase = 'idle';
    let wake = null;
    let roundWorkSec = {};              // duración real (variable en modo Impredecible)

    /* ---------------- utilidades ---------------- */
    const pad = (n) => String(n).padStart(2, '0');
    const fmt = (sec) => `${pad(Math.floor(sec / 60))}:${pad(Math.floor(sec % 60))}`;
    const fmtShort = (sec) => `${Math.floor(sec / 60)}:${pad(Math.floor(sec % 60))}`;
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));

    function parseTime(str) {
      str = String(str).trim().replace(',', '.');
      if (!str) return NaN;
      if (str.includes(':')) {
        const [m, s] = str.split(':');
        return (parseInt(m, 10) || 0) * 60 + (parseInt(s, 10) || 0);
      }
      return parseInt(str, 10);   // "90" = 90 segundos
    }

    let toastTimer = null;
    function toast(msg) {
      const t = $('toast');
      t.textContent = msg; t.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
    }

    const running = () => engine && engine.state !== 'idle';

    /* ---------------- rutinas y plan de entrenamiento ----------------
       Todo entrenamiento (reloj, coach o rutina) se convierte en un PLAN:
       una lista de segmentos preparación / round / descanso, cada uno con su bloque. */
    const clone = (o) => JSON.parse(JSON.stringify(o));
    const userRoutines = () => Storage.get('routines', []);
    const allRoutines = () => Config.ROUTINES.concat(userRoutines());
    let draft = null;                     // la rutina que se está editando / va a correr

    function loadDraft() {
      const saved = Storage.get('routineDraft', null);
      if (saved && Array.isArray(saved.blocks) && saved.blocks.length) draft = saved;
      else draft = clone(allRoutines().find((r) => r.id === S.routineId) || Config.ROUTINES[0]);
    }
    const saveDraft = () => Storage.set('routineDraft', draft);

    function normBlock(b) {
      const n = (v, d) => (isNaN(parseInt(v, 10)) ? d : parseInt(v, 10));
      const type = ['coach', 'free', 'warmup', 'cooldown'].includes(b.type) ? b.type : 'free';
      const minutes = [3, 5, 8].includes(n(b.minutes, 5)) ? n(b.minutes, 5) : 5;
      return {
        label: String(b.label || '').slice(0, 40),
        type, minutes,
        roundType: Config.ROUND_TYPES[b.roundType] ? b.roundType : 'sombra',
        combo: String(b.combo || '').slice(0, 40),
        rounds: type === 'warmup' || type === 'cooldown' ? 1 : clamp(n(b.rounds, 1), 1, 30),
        workSec: clamp(n(b.workSec, 180), 10, 3600),
        restSec: clamp(n(b.restSec, 0), 0, 600),
        restAfter: clamp(n(b.restAfter, 0), 0, 600),
        mode: Config.MODES[b.mode] ? b.mode : 'normal',
        level: Config.LEVELS[b.level] ? Number(b.level) : 2,
        pace: Config.PACES[b.pace] ? b.pace : 'normal',
      };
    }

    function blocksForRun() {
      if (S.kind === 'routine') return draft.blocks.map(normBlock);
      const list = [];
      if (S.warmup > 0) list.push(normBlock({ label: 'Calentamiento', type: 'warmup', minutes: S.warmup, restAfter: 10 }));
      list.push({
        label: '', type: S.kind === 'coach' ? 'coach' : 'free',
        rounds: S.rounds, workSec: S.workSec, restSec: S.restSec, restAfter: S.cooldown > 0 ? 10 : 0,
        mode: S.mode, level: S.level, pace: S.pace,
        roundType: S.kind === 'coach' ? S.roundType : 'sombra', combo: S.drillCombo || '',
      });
      if (S.cooldown > 0) list.push(normBlock({ label: 'Vuelta a la calma', type: 'cooldown', minutes: S.cooldown, restAfter: 0 }));
      return list;
    }

    /* Duración del round r de un bloque. Impredecible: ±15 s (o ±25 %) desde el 2.º round. */
    function blockWork(b, r, estimate) {
      if (!estimate && b.type === 'coach' && b.mode === 'sparring' && r > 1) {
        const d = Math.min(15, Math.floor(b.workSec * 0.25));
        return Math.max(10, b.workSec + randInt(-d, d));
      }
      return b.workSec;
    }
    /* Progresivo: el descanso baja 5 s por round (mínimo 15 s). */
    function blockRest(b, r) {
      if (b.type === 'coach' && b.mode === 'intensity') return Math.max(Math.min(b.restSec, 15), b.restSec - 5 * (r - 1));
      return b.restSec;
    }

    function buildPlan(estimate) {
      const blocks = blocksForRun();
      const plan = [];
      blocks.forEach((b, bi) => {
        const nb = blocks.length, lastBlock = bi === nb - 1;
        if (b.type === 'warmup' || b.type === 'cooldown') {
          // calentamiento / vuelta a la calma: una serie de ejercicios cortos, cada uno con su nombre
          const steps = Config.guideSteps(b.type, b.minutes);
          let meta = null;
          steps.forEach((st, si) => {
            meta = { type: 'free', guide: b.type, label: st.label, workSec: st.sec, rounds: 1 };
            plan.push({ phase: 'work', durationMs: st.sec * 1000, round: si + 1, rounds: steps.length, bi, nb, meta });
          });
          if (!lastBlock && b.restAfter > 0 && meta) plan.push({ phase: 'rest', durationMs: b.restAfter * 1000, round: steps.length, rounds: steps.length, bi, nb, meta });
          return;
        }
        for (let r = 1; r <= b.rounds; r++) {
          plan.push({ phase: 'work', durationMs: blockWork(b, r, estimate) * 1000, round: r, rounds: b.rounds, bi, nb, meta: b });
          const rest = r < b.rounds ? blockRest(b, r) : (!lastBlock ? b.restAfter : 0);
          if (rest > 0) plan.push({ phase: 'rest', durationMs: rest * 1000, round: r, rounds: b.rounds, bi, nb, meta: b });
        }
      });
      if (S.prepSec > 0 && plan.length) {
        const f = plan[0];
        plan.unshift({ phase: 'prep', durationMs: S.prepSec * 1000, round: f.round, rounds: f.rounds, bi: f.bi, nb: f.nb, meta: f.meta });
      }
      return plan;
    }
    const totalSeconds = () => Math.round(buildPlan(true).reduce((t, p) => t + p.durationMs, 0) / 1000);
    /* El primer bloque "de verdad" (el que se muestra en la pantalla de inicio). */
    function firstBlock() {
      const bl = blocksForRun();
      const real = bl.find((x) => x.type === 'coach' || x.type === 'free');
      if (real) return real;
      const g = Config.guideSteps(bl[0].type, bl[0].minutes);
      return { rounds: g.length, workSec: g[0] ? g[0].sec : 60, type: 'free' };
    }

    /* ---------------- ajustes <-> pantalla ---------------- */
    const STEPPERS = {
      rounds:  { input: 'roundsInput', min: 1, max: 99,  step: 1,  time: false },
      prepSec: { input: 'prepInput',   min: 0, max: 60,  step: 5,  time: true },
      workSec: { input: 'workInput',   min: 10, max: 1800, step: 10, time: true },
      restSec: { input: 'restInput',   min: 0, max: 600, step: 5,  time: true },
    };
    const SIMPLE = [
      ['voiceRate', 'num'], ['voiceMode', 'str'], ['bellVolume', 'num'], ['voiceVolume', 'num'], ['bellSound', 'str'],
      ['defense', 'bool'], ['movement', 'bool'], ['body', 'bool'], ['warn10', 'bool'],
      ['announce', 'bool'], ['vibrate', 'bool'],
      ['roundType', 'str'], ['warmup', 'num'], ['cooldown', 'num'],
      ['musicVolume', 'num'], ['musicDuck', 'bool'], ['mixAudio', 'bool'],
    ];
    const RADIOS = { kind: 'str', mode: 'str', level: 'num', pace: 'str', stance: 'str', callStyle: 'str', slipStyle: 'str', endDings: 'num', musicWhen: 'str' };

    function drawSteppers() {
      Object.entries(STEPPERS).forEach(([key, d]) => {
        const el = $(d.input);
        if (document.activeElement !== el) el.value = d.time ? fmtShort(S[key]) : String(S[key]);
      });
    }

    function drawAll() {
      drawSteppers();
      SIMPLE.forEach(([id, type]) => {
        const el = $(id);
        if (type === 'bool') el.checked = !!S[id]; else el.value = S[id];
      });
      Object.keys(RADIOS).forEach((name) => {
        $$(`input[name="${name}"]`).forEach((r) => { r.checked = String(S[name]) === r.value; });
      });
      body.dataset.kind = S.kind;
      $('rateOut').textContent = `${Number(S.voiceRate).toFixed(2)}× · ${rateWord(S.voiceRate)}`;
      $('levelHint').textContent = {
        1: 'Jab, cross y gancho. Combos de 1 a 3 golpes.',
        2: 'Suma uppers y ganchos de atrás. Combos de 2 a 4 golpes.',
        3: 'Combos largos de hasta 6 golpes con defensa y movimiento.',
      }[S.level] || '';
      const z = S.stance === 'zurdo';
      $('slipHint').textContent = `Al jab la cabeza sale a tu ${z ? 'izquierda' : 'derecha'}; al cross, a tu ${z ? 'derecha' : 'izquierda'} (siempre por afuera del golpe). «Agachada» es para pasar por debajo de un gancho.`;
      $('roundTypeHint').textContent = (Config.ROUND_TYPES[S.roundType] || {}).desc || '';
      $('drillComboField').hidden = S.roundType !== 'repeticion';
      if (document.activeElement !== $('drillCombo')) $('drillCombo').value = S.drillCombo || '';
      drawComboHint();
      $('guideHint').textContent = S.warmup || S.cooldown
        ? (S.kind === 'clock' ? 'Cada ejercicio se ve en pantalla (en modo Reloj no hay voz).' : 'Cada ejercicio se ve en pantalla y el coach lo anuncia.')
        : '';
      drawPresets();
      drawTotal();
      drawIdle();
      applyLocks();
    }

    function drawComboHint() {
      const h = $('drillComboHint'), v = (S.drillCombo || '').trim();
      h.className = 'hint-line';
      if (!v) { h.textContent = 'Sin combo: el coach elige uno distinto en cada round y lo repite.'; return; }
      const p = Combos.parseCombo(v);
      if (p.ok) {
        h.textContent = '✓ ' + Combos.describe(p.tokens, { stance: S.stance, style: S.callStyle, slip: S.slipStyle }).label;
        h.classList.add('ok');
      } else {
        h.textContent = 'No se puede hacer así (' + p.errors[0] + '). Usá 1 jab · 2 cross · 3 y 4 ganchos · 5 y 6 uppers · sj / sc esquives. Ej: 1 2 3 2.';
        h.classList.add('err');
      }
    }

    function rateWord(r) {
      return r < 0.9 ? 'lenta' : r <= 1.15 ? 'normal' : r <= 1.35 ? 'rápida' : 'muy rápida';
    }

    function drawTotal() {
      let txt;
      if (S.kind === 'routine') {
        const blocks = draft.blocks.map(normBlock);
        const rounds = blocks.filter((b) => b.type === 'coach' || b.type === 'free').reduce((t, b) => t + b.rounds, 0);
        txt = `⏱ Total ≈ ${fmtShort(totalSeconds())} · ${blocks.length} ${blocks.length === 1 ? 'bloque' : 'bloques'} · ${rounds} rounds`;
      } else {
        const approx = S.kind === 'coach' && S.mode === 'sparring' ? '≈ ' : '';
        txt = `⏱ Total ${approx}${fmtShort(totalSeconds())} · ${S.rounds} × ${fmtShort(S.workSec)}`;
        if (S.rounds > 1) txt += S.kind === 'coach' && S.mode === 'intensity' ? ' · descansos decrecientes' : ` · descanso ${fmtShort(S.restSec)}`;
        if (S.warmup || S.cooldown) txt += ` · con ${[S.warmup ? 'calentamiento' : '', S.cooldown ? 'vuelta a la calma' : ''].filter(Boolean).join(' y ')}`;
      }
      $('totalPreview').textContent = txt;
    }

    function commit() {
      Storage.saveSettings(S);
      Audio.configure({ sound: S.bellSound, volume: S.bellVolume, vibrate: S.vibrate });
      Voice.select(S.voiceName);
      Music.setVolume(S.musicVolume); Music.setDuck(S.musicDuck);
      applyAudioSession();
      drawAll();
    }

    /* iPhone/Safari: «ambient» deja sonar la música de otra app (y respeta el modo silencio). */
    function applyAudioSession() {
      try { if (navigator.audioSession) navigator.audioSession.type = S.mixAudio ? 'ambient' : 'auto'; } catch (e) {}
    }

    function applyLocks() {
      const on = running();
      $$('[data-lock]').forEach((el) => {
        el.classList.toggle('locked', on);
        $$('input,button,select', el).forEach((i) => { i.disabled = on; });
        if (el.matches('input,button,select')) el.disabled = on;
      });
      $$('input[name="kind"]').forEach((i) => { i.disabled = on; });
      $('routineSelect').disabled = on;
      $('roundType').disabled = on;
      $('blocks').classList.toggle('locked', on);
      $$('.kind-seg label').forEach((l) => l.classList.toggle('locked', on));
    }

    /* presets */
    function buildPresets() {
      const box = $('presets');
      Config.PRESETS.forEach((p) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'preset'; b.dataset.id = p.id; b.dataset.lock = '';
        b.textContent = p.label;
        b.addEventListener('click', () => {
          S.rounds = p.rounds; S.workSec = p.workSec; S.restSec = p.restSec; S.prepSec = p.prepSec;
          commit();
        });
        box.appendChild(b);
      });
    }
    function drawPresets() {
      $$('.preset').forEach((b) => {
        const p = Config.PRESETS.find((x) => x.id === b.dataset.id);
        b.classList.toggle('active', p.rounds === S.rounds && p.workSec === S.workSec && p.restSec === S.restSec && p.prepSec === S.prepSec);
      });
    }

    /* steppers: botones (con repetición al mantener) + escritura directa */
    function bindSteppers() {
      $$('[data-stepper]').forEach((box) => {
        const key = box.dataset.stepper, d = STEPPERS[key], input = $(d.input);
        const bump = (dir) => { S[key] = clamp(S[key] + dir * d.step, d.min, d.max); commit(); };
        $$('button', box).forEach((btn) => {
          let t1 = null, t2 = null;
          const stop = () => { clearTimeout(t1); clearInterval(t2); };
          btn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            const dir = +btn.dataset.dir;
            bump(dir);
            t1 = setTimeout(() => { t2 = setInterval(() => bump(dir), 80); }, 420);
          });
          ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => btn.addEventListener(ev, stop));
          btn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); bump(+btn.dataset.dir); }
          });
        });
        const apply = () => {
          const v = d.time ? parseTime(input.value) : parseInt(input.value, 10);
          if (!isNaN(v)) S[key] = clamp(v, d.min, d.max);
          commit();
        };
        input.addEventListener('change', apply);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { input.blur(); } });
        input.addEventListener('focus', () => input.select());
      });
    }

    function bindSimple() {
      SIMPLE.forEach(([id, type]) => {
        const el = $(id);
        el.addEventListener('input', () => {
          S[id] = type === 'bool' ? el.checked : type === 'num' ? parseFloat(el.value) : el.value;
          commit();
        });
      });
      Object.entries(RADIOS).forEach(([name, type]) => {
        $$(`input[name="${name}"]`).forEach((r) => r.addEventListener('change', () => {
          if (!r.checked) return;
          S[name] = type === 'num' ? Number(r.value) : r.value;
          commit();
          if (name === 'kind') renderRoutineUI();
          if (name === 'endDings') Audio.ding(S.endDings);
        }));
      });
      $('voiceSelect').addEventListener('change', (e) => { S.voiceName = e.target.value; commit(); });
      Object.entries(Config.ROUND_TYPES).forEach(([k, v]) => {
        const o = document.createElement('option'); o.value = k; o.textContent = v.label; $('roundType').appendChild(o);
      });
      $('drillCombo').addEventListener('input', () => { S.drillCombo = $('drillCombo').value; Storage.saveSettings(S); drawComboHint(); });
    }

    /* ---------------- voces ---------------- */
    function fillVoices(list) {
      const sel = $('voiceSelect');
      sel.innerHTML = '';
      list.forEach((v) => {
        const o = document.createElement('option');
        o.value = v.name; o.textContent = (Voice.isNatural(v) ? '⭐ ' : '') + v.name;
        sel.appendChild(o);
      });
      if (!list.length) {
        const o = document.createElement('option'); o.textContent = 'Sin voces en español'; o.value = '';
        sel.appendChild(o);
      }
      if (list.some((v) => v.name === S.voiceName)) sel.value = S.voiceName;
      else if (list.length) { S.voiceName = list[0].name; sel.value = S.voiceName; }
      Voice.select(S.voiceName);
      let hint = '';
      if (!Voice.supported) hint = 'Este navegador no tiene síntesis de voz: el coach te muestra los golpes en pantalla.';
      else if (!list.length) hint = 'No encontré voces en español en este dispositivo. Probá con Chrome o Edge; en pantalla se ven igual.';
      else if (!list.some(Voice.isNatural)) hint = 'Tip: Microsoft Edge trae voces «Natural» gratis (marcadas con ⭐) que suenan mucho más humanas.';
      else hint = '⭐ = voz natural (más humana).';
      $('voiceHint').textContent = hint;
    }

    function drawClips(avail) {
      const opt = $('voiceMode').querySelector('option[value="clips"]');
      opt.disabled = !avail;
      $('clipsHint').textContent = avail
        ? 'Pack detectado ✓. Voz neuronal sin demora; si falta una frase usa la voz del dispositivo.'
        : 'No encontré el pack en Sonidos/voz. Generalo gratis con tools/generar_voz.py (ver README).';
      if (!avail && S.voiceMode === 'clips') $('voiceMode').value = 'tts';
    }

    $('btnTestVoice').addEventListener('click', () => {
      Voice.unlock();
      const tokens = Combos.next({ level: S.level, mode: S.mode, defense: S.defense, movement: S.movement, body: S.body, stance: S.stance, style: S.callStyle, slip: S.slipStyle, rate: S.voiceRate, maxSpeechMs: 4200 }, {});
      const d = Combos.describe(tokens, { stance: S.stance, style: S.callStyle, slip: S.slipStyle });
      renderCombo(d);
      Voice.say(d.speech, d.parts, { rate: S.voiceRate, volume: S.voiceVolume, estimateMs: Combos.estimateSpeechMs(d.speech, S.voiceRate), mode: S.voiceMode });
    });
    $('btnTestBell').addEventListener('click', () => { Audio.unlock(); Audio.ding(S.endDings); });

    /* ---------------- editor de rutinas ---------------- */
    function el(tag, props, ...kids) {
      const e = document.createElement(tag);
      Object.entries(props || {}).forEach(([k, v]) => { if (k === 'dataset') Object.assign(e.dataset, v); else e[k] = v; });
      kids.forEach((k) => e.append(k));
      return e;
    }
    const labelled = (text, input) => el('label', {}, text, input);
    function optionList(map, selected) {
      const sel = el('select');
      Object.entries(map).forEach(([k, v]) => { const o = el('option', { value: k, textContent: v.label }); if (String(selected) === k) o.selected = true; sel.append(o); });
      return sel;
    }

    function routineChanged() { saveDraft(); drawTotal(); drawIdle(); }

    const GUIDE_NAME = { warmup: 'Calentamiento', cooldown: 'Vuelta a la calma' };

    function renderBlocks() {
      const box = $('blocks');
      box.innerHTML = '';
      draft.blocks.forEach((b, i) => {
        const card = el('div', { className: 'block', dataset: { type: ['coach', 'warmup', 'cooldown'].includes(b.type) ? b.type : 'free' } });

        const name = el('input', { type: 'text', value: b.label || '', maxLength: 40, placeholder: 'Nombre del bloque' });
        name.addEventListener('input', () => { b.label = name.value; saveDraft(); });
        const up = el('button', { type: 'button', textContent: '▲', title: 'Subir', disabled: i === 0 });
        const down = el('button', { type: 'button', textContent: '▼', title: 'Bajar', disabled: i === draft.blocks.length - 1 });
        const del = el('button', { type: 'button', textContent: '✕', title: 'Quitar bloque', disabled: draft.blocks.length === 1 });
        up.addEventListener('click', () => { [draft.blocks[i - 1], draft.blocks[i]] = [draft.blocks[i], draft.blocks[i - 1]]; renderBlocks(); routineChanged(); });
        down.addEventListener('click', () => { [draft.blocks[i + 1], draft.blocks[i]] = [draft.blocks[i], draft.blocks[i + 1]]; renderBlocks(); routineChanged(); });
        del.addEventListener('click', () => { draft.blocks.splice(i, 1); renderBlocks(); routineChanged(); });
        card.append(el('div', { className: 'block-head' }, el('span', { className: 'num', textContent: String(i + 1) }), name, up, down, del));

        const type = el('select');
        [['coach', 'Con coach (combos)'], ['free', 'Libre (solo reloj)'], ['warmup', 'Calentamiento guiado'], ['cooldown', 'Vuelta a la calma guiada']].forEach(([v, t]) => {
          const o = el('option', { value: v, textContent: t }); if (b.type === v) o.selected = true; type.append(o);
        });
        type.addEventListener('change', () => {
          b.type = type.value;
          if (GUIDE_NAME[b.type]) { if (![3, 5, 8].includes(+b.minutes)) b.minutes = 5; if (!b.label || /^(Nuevo bloque|Calentamiento|Vuelta a la calma)$/.test(b.label)) b.label = GUIDE_NAME[b.type]; }
          renderBlocks(); routineChanged();
        });

        const num = (key, min, max) => {
          const inp = el('input', { type: 'number', value: b[key] ?? 1, min, max, inputMode: 'numeric' });
          inp.addEventListener('change', () => { b[key] = clamp(parseInt(inp.value, 10) || min, min, max); inp.value = b[key]; routineChanged(); });
          return inp;
        };
        const time = (key, min, max) => {
          const inp = el('input', { type: 'text', value: fmtShort(b[key] ?? 0), inputMode: 'numeric' });
          inp.addEventListener('focus', () => inp.select());
          inp.addEventListener('change', () => { const v = parseTime(inp.value); b[key] = clamp(isNaN(v) ? min : v, min, max); inp.value = fmtShort(b[key]); routineChanged(); });
          return inp;
        };
        card.append(el('div', { className: 'block-grid' },
          labelled('Tipo', type),
          labelled('Rounds', num('rounds', 1, 30)),
          labelled('Duración del round', time('workSec', 10, 3600)),
          labelled('Descanso entre rounds', time('restSec', 0, 600)),
          labelled('Descanso al terminar el bloque', time('restAfter', 0, 600))));

        // calentamiento / vuelta a la calma
        const typeG = el('select');
        [['coach', 'Con coach (combos)'], ['free', 'Libre (solo reloj)'], ['warmup', 'Calentamiento guiado'], ['cooldown', 'Vuelta a la calma guiada']].forEach(([v, t]) => {
          const o = el('option', { value: v, textContent: t }); if (b.type === v) o.selected = true; typeG.append(o);
        });
        typeG.addEventListener('change', () => { type.value = typeG.value; type.dispatchEvent(new Event('change')); });
        const mins = el('select');
        [3, 5, 8].forEach((m) => { const o = el('option', { value: String(m), textContent: m + ' min' }); if (+b.minutes === m) o.selected = true; mins.append(o); });
        mins.addEventListener('change', () => { b.minutes = Number(mins.value); routineChanged(); });
        const nSteps = GUIDE_NAME[b.type] ? Config.guideSteps(b.type, b.minutes || 5).length : 0;
        card.append(el('div', { className: 'guide-fields' },
          labelled('Tipo', typeG), labelled('Duración', mins),
          labelled('Descanso al terminar el bloque', time('restAfter', 0, 600)),
          el('p', { className: 'hint-line', textContent: nSteps ? `${nSteps} ejercicios, uno atrás de otro. Se anuncian por voz y se ven en pantalla.` : '' })));

        const mode = optionList(Config.MODES, b.mode || 'normal');
        const level = optionList(Config.LEVELS, b.level || 2);
        const pace = optionList(Config.PACES, b.pace || 'normal');
        mode.addEventListener('change', () => { b.mode = mode.value; routineChanged(); });
        level.addEventListener('change', () => { b.level = Number(level.value); routineChanged(); });
        pace.addEventListener('change', () => { b.pace = pace.value; routineChanged(); });
        card.append(el('div', { className: 'coach-fields' }, labelled('Modo', mode), labelled('Nivel', level), labelled('Ritmo', pace)));

        // tipo de ronda (+ combo a repetir)
        const rtSel = optionList(Config.ROUND_TYPES, b.roundType || 'sombra');
        const combo = el('input', { type: 'text', value: b.combo || '', maxLength: 40, placeholder: 'Ej: 1 2 3 2  (vacío = al azar)', autocomplete: 'off' });
        const comboLbl = labelled('Combo a repetir', combo);
        const err = el('p', { className: 'err-line' });
        const drawCombo = () => {
          comboLbl.hidden = (b.roundType || 'sombra') !== 'repeticion';
          const v = (b.combo || '').trim(), p = v ? Combos.parseCombo(v) : { ok: true };
          err.textContent = v && !p.ok ? 'No se puede hacer así: ' + p.errors[0] : '';
        };
        rtSel.addEventListener('change', () => { b.roundType = rtSel.value; drawCombo(); routineChanged(); });
        combo.addEventListener('input', () => { b.combo = combo.value; drawCombo(); saveDraft(); });
        drawCombo();
        card.append(el('div', { className: 'round-fields' }, labelled('Tipo de ronda', rtSel), comboLbl, err));
        box.append(card);
      });
    }

    function renderRoutineSelect() {
      const sel = $('routineSelect');
      sel.innerHTML = '';
      allRoutines().forEach((r) => {
        const o = el('option', { value: r.id, textContent: (r.builtin ? '' : '★ ') + r.name });
        if (r.id === draft.id) o.selected = true;
        sel.append(o);
      });
      $('routineName').value = draft.name || '';
      const mine = userRoutines().some((r) => r.id === draft.id);
      $('btnRoutineDelete').hidden = !mine;
      $('routineHint').textContent = mine ? 'Es una rutina tuya: «Guardar» la actualiza.' : 'Podés cambiar lo que quieras y tocar «Guardar como mía» para conservarla.';
    }

    function renderRoutineUI() {
      renderRoutineSelect();
      renderBlocks();
      drawTotal();
      drawIdle();
    }

    $('routineSelect').addEventListener('change', (e) => {
      const r = allRoutines().find((x) => x.id === e.target.value);
      if (!r) return;
      draft = clone(r); S.routineId = r.id; saveDraft(); Storage.saveSettings(S);
      renderRoutineUI();
    });
    $('routineName').addEventListener('input', () => { draft.name = $('routineName').value; saveDraft(); });
    $('btnAddBlock').addEventListener('click', () => {
      draft.blocks.push({ label: 'Nuevo bloque', type: 'coach', rounds: 3, workSec: 180, restSec: 60, restAfter: 60, mode: 'normal', level: 2, pace: 'normal' });
      renderBlocks(); routineChanged();
    });
    $('btnRoutineSave').addEventListener('click', () => {
      const list = userRoutines();
      draft.name = (draft.name || '').trim() || 'Mi rutina';
      const mineIdx = list.findIndex((r) => r.id === draft.id);
      const copy = { id: draft.id, name: draft.name, blocks: clone(draft.blocks.map(normBlock)) };
      if (mineIdx >= 0) list[mineIdx] = copy;
      else { copy.id = 'u' + Date.now(); list.push(copy); draft.id = copy.id; }
      Storage.set('routines', list);
      S.routineId = draft.id; Storage.saveSettings(S); saveDraft();
      renderRoutineSelect(); toast('Rutina guardada ✓');
    });
    $('btnRoutineDelete').addEventListener('click', () => {
      const list = userRoutines().filter((r) => r.id !== draft.id);
      Storage.set('routines', list);
      draft = clone(Config.ROUTINES[0]); S.routineId = draft.id; saveDraft(); Storage.saveSettings(S);
      renderRoutineUI(); toast('Rutina eliminada');
    });

    /* ---------------- pantalla del reloj ---------------- */
    const RING_C = 2 * Math.PI * 54;
    const ring = $('ringFg');
    ring.style.strokeDasharray = RING_C.toFixed(2);

    function setRing(frac) { ring.style.strokeDashoffset = (RING_C * (1 - clamp(frac, 0, 1))).toFixed(2); }

    function drawDots(current, done, n) {
      const box = $('roundDots');
      // Muchos rounds: los puntos se achican y se acomodan en varias filas.
      box.dataset.size = n <= 15 ? 'l' : n <= 30 ? 'm' : n <= 60 ? 's' : 'xs';
      if (box.children.length !== n) {
        box.innerHTML = '';
        for (let i = 0; i < n; i++) box.appendChild(document.createElement('i'));
      }
      Array.from(box.children).forEach((d, i) => {
        d.className = i < done ? 'done' : i + 1 === current ? 'now' : '';
      });
    }

    function drawIdle() {
      if (running()) return;
      const fb = firstBlock();
      body.dataset.phase = 'idle';
      body.dataset.guide = '';
      body.classList.remove('urgent', 'burst');
      $('phaseLabel').textContent = 'LISTO';
      if (S.kind === 'routine') {
        const n = draft.blocks.length;
        $('roundLabel').textContent = `${n} ${n === 1 ? 'BLOQUE' : 'BLOQUES'}`;
      } else $('roundLabel').textContent = `${S.rounds} ${S.rounds === 1 ? 'ROUND' : 'ROUNDS'}`;
      $('timeText').textContent = fmt(fb.workSec);
      const pre = S.kind !== 'routine' && S.warmup > 0 ? 'Empieza con calentamiento · ' : '';
      $('subText').textContent = S.prepSec > 0 ? `${pre}Preparación de ${S.prepSec} s` : (pre || 'Tocá COMENZAR');
      $('btnMain').textContent = 'COMENZAR';
      $('btnStop').disabled = true;
      setRing(1);
      drawDots(0, 0, fb.rounds);
      document.title = 'Coach Boxeo';
    }

    function setPhaseUI(seg, plan, index) {
      const m = seg.meta, routine = S.kind === 'routine', g = m.guide;
      const gname = g ? Config.GUIDES[g].label : '';
      body.dataset.phase = seg.phase;
      body.dataset.guide = g ? '1' : '';
      body.classList.remove('urgent');
      $('roundLabel').textContent = g
        ? `${gname.toUpperCase()} · ${seg.round}/${seg.rounds}`
        : routine ? `${(m.label || 'BLOQUE').toUpperCase()} · ${seg.round}/${seg.rounds}` : `ROUND ${seg.round} / ${seg.rounds}`;
      if (seg.phase === 'prep') {
        $('phaseLabel').textContent = 'PREPARATE';
        $('subText').textContent = g ? `Empieza: ${gname.toLowerCase()}`
          : routine && m.label ? `Empieza: ${m.label}` : `Empieza el round ${seg.round}`;
      } else if (seg.phase === 'work') {
        if (g) {
          $('phaseLabel').textContent = g === 'warmup' ? 'CALENTÁ' : 'ENFRIÁ';
          $('subText').textContent = m.label;
        } else {
          $('phaseLabel').textContent = seg.rounds > 1 ? `ROUND ${seg.round}` : 'A TRABAJAR';
          const parts = [];
          if (routine) parts.push(`Bloque ${seg.bi + 1} de ${seg.nb}`);
          if (m.type === 'coach') {
            const rt = m.roundType && m.roundType !== 'sombra' ? Config.ROUND_TYPES[m.roundType].label : '';
            parts.push(rt ? `${rt} · ${Config.LEVELS[m.level].label}` : `${Config.MODES[m.mode].label} · ${Config.LEVELS[m.level].label}`);
            if (m.mode === 'intensity') parts.push(`ritmo ×${(1 / Math.max(0.6, 1 - 0.06 * (seg.round - 1))).toFixed(1)}`);
          } else if (!routine) parts.push('En marcha');
          $('subText').textContent = parts.join(' · ');
        }
      } else if (seg.phase === 'rest') {
        $('phaseLabel').textContent = 'DESCANSO';
        const nx = plan[index + 1];
        $('subText').textContent = !nx ? '' : nx.meta !== m && nx.meta.label ? `Siguiente: ${nx.meta.label}` : `Siguiente: round ${nx.round}`;
      }
      drawDots(seg.round, seg.phase === 'rest' ? seg.round : seg.round - 1, seg.rounds);
    }

    /* lo que canta el coach */
    const history = [];
    function flash(kind) {
      const c = $('callout');
      ['flash-punch', 'flash-defense', 'flash-move'].forEach((k) => c.classList.remove(k));
      if (!kind) return;
      void c.offsetWidth;
      c.classList.add('flash-' + kind);
    }
    function renderCombo(desc, extra) {
      const box = $('comboChips');
      box.innerHTML = '';
      desc.chips.forEach((c, i) => {
        const e = document.createElement('div');
        e.className = `chip ${c.kind}${c.body ? ' body' : ''}`;
        e.style.animationDelay = `${i * 70}ms`;
        if (c.icon) { const ic = document.createElement('span'); ic.className = 'ico'; ic.textContent = c.icon; e.appendChild(ic); }
        const mn = document.createElement('span'); mn.className = 'main'; mn.textContent = c.main; e.appendChild(mn);
        if (c.sub) { const sb = document.createElement('span'); sb.className = 'sub'; sb.textContent = c.sub; e.appendChild(sb); }
        box.appendChild(e);
      });
      if (curBS && curBS.roundType === 'reflejos') flash(desc.chips[0] && desc.chips[0].kind);
      if (extra && extra.rep) { $('comboHistory').textContent = `Repetición ${extra.rep}`; return; }
      $('comboHistory').textContent = history.slice(-3).reverse().join('   ·   ');
      history.push(desc.label);
      if (history.length > 8) history.shift();
    }
    function clearCombo(msg) {
      const box = $('comboChips');
      box.innerHTML = '';
      const sp = document.createElement('span'); sp.className = 'hint';
      sp.textContent = msg || 'Acá vas a ver lo que canta el coach';
      box.appendChild(sp);
      $('comboHistory').textContent = '';
      history.length = 0;
      flash(null);
    }

    /* ---------------- sesión ---------------- */
    async function lockScreen() {
      try { if ('wakeLock' in navigator) wake = await navigator.wakeLock.request('screen'); } catch (e) { wake = null; }
    }
    function unlockScreen() { try { if (wake) wake.release(); } catch (e) {} wake = null; }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') { if (running()) lockScreen(); if (engine) engine.tick(); }
    });

    let curBS = null;           // ajustes efectivos del bloque actual (modo/nivel/ritmo del bloque)
    let announceTimer = null;

    /* Foto de la configuración: sirve para «Repetir» este entrenamiento desde Progreso. */
    function snapshot() {
      const p = {};
      ['kind', 'rounds', 'workSec', 'restSec', 'prepSec', 'mode', 'level', 'pace', 'roundType', 'drillCombo', 'warmup', 'cooldown'].forEach((k) => { p[k] = S[k]; });
      if (S.kind === 'routine') p.routine = clone(draft);
      return p;
    }

    /* Música: en «solo rounds» suena en los rounds y calla en preparación y descanso. */
    function musicSync(phase) {
      if (!Music.count) return;
      if (S.musicWhen === 'always' || phase === 'work') Music.play(); else Music.pause();
    }

    function start() {
      Audio.unlock(); Voice.unlock(); applyAudioSession();
      Audio.configure({ sound: S.bellSound, volume: S.bellVolume, vibrate: S.vibrate });
      const plan = buildPlan(false);
      if (!plan.length) return;
      const coachSegs = plan.filter((p) => p.phase === 'work' && p.meta.type === 'coach');
      session = { kind: S.kind, plan, acc: [], done: [], coachTotal: coachSegs.length, snap: snapshot() };
      lastPhase = 'idle'; curBS = S;
      clearCombo(coachSegs.length ? 'Preparate… el coach empieza después de la campana' : '');

      driver = coachSegs.length ? new Driver({
        getSettings: () => curBS || S,
        getRemainingMs: () => (engine ? engine.remainingMs : 0),
        onCall: (desc, tokens, extra) => renderCombo(desc, extra),
        onBurst: (on) => { body.classList.toggle('burst', on); $('burstBadge').hidden = !on; },
      }) : null;

      engine = new Engine({ plan, warnAtMs: S.warn10 ? 10000 : 0 }, {
        onPhase: ({ phase, round, rounds, seg, index }) => {
          const m = seg.meta;
          // Cada bloque trae su propio modo/nivel/ritmo; el resto (voz, guardia, etc.) es global.
          curBS = m.type === 'coach' ? Object.assign({}, S, { mode: m.mode, level: m.level, pace: m.pace, roundType: m.roundType || 'sombra', combo: m.combo || '' }) : S;
          setPhaseUI(seg, plan, index);
          clearTimeout(announceTimer);
          musicSync(phase);
          if (phase === 'work' && m.guide) {
            // ejercicio de calentamiento / vuelta a la calma: un toque suave, sin campana, y se dice cuál es
            Audio.countdown(1);
            if (driver) driver.stop();
            clearCombo(`${m.label} 💪`);
            if (S.announce && S.kind !== 'clock') {
              announceTimer = setTimeout(() => Voice.speak(m.label, { rate: Math.min(1.15, S.voiceRate), volume: S.voiceVolume, estimateMs: 2500 }), 500);
            }
          } else if (phase === 'work') {
            if (lastPhase !== 'work') Audio.ding(1);                    // campana de inicio
            const routine = S.kind === 'routine';
            const label = routine && round === 1 && m.label ? m.label : '';
            const last = round === rounds && rounds > 1;
            const rtxt = last ? 'último raund' : rounds > 1 ? `raund ${round}` : '';
            if (m.type === 'coach' && driver) {
              const intro = S.announce ? [label, rtxt].filter(Boolean).join(', ') : '';
              driver.start({ round, intro, introParts: !label && rtxt ? [rtxt] : null });
              if (m.type === 'coach' && routine) clearCombo('');
            } else {
              if (driver) driver.stop();
              if (routine) clearCombo(m.label ? `${m.label} 💪` : '');
              if (S.announce && routine && label) {
                announceTimer = setTimeout(() => Voice.speak(label, { rate: Math.min(1.2, S.voiceRate), volume: S.voiceVolume, estimateMs: 1500 }), 1400);
              }
            }
          } else if (phase === 'rest') {
            clearCombo('Descanso. Respirá y tomá agua 💧');
          }
          lastPhase = m.guide ? 'guide' : phase;
        },
        onPhaseEnd: ({ phase, seg }) => {
          if (phase === 'work') {
            if (!seg.meta.guide) Audio.ding(S.endDings);                // campana de fin (los ejercicios guiados no la usan)
            clearTimeout(announceTimer);
            if (driver) driver.stop();
            session.done.push({ sec: seg.durationMs / 1000, guide: !!seg.meta.guide });
            if (seg.meta.type === 'coach') session.acc.push({ sec: seg.durationMs / 1000, mode: seg.meta.mode, level: seg.meta.level });
          }
        },
        onTick: ({ phase, remainingMs, durationMs, seg }) => {
          const sec = Math.ceil(remainingMs / 1000);
          $('timeText').textContent = fmt(sec);
          setRing(remainingMs / durationMs);
          const urgent = phase === 'work' && sec <= 10 && durationMs > 20000 && !(seg && seg.meta.guide);
          body.classList.toggle('urgent', urgent);
          document.title = `${fmt(sec)} · ${phase === 'rest' ? 'Descanso' : phase === 'prep' ? 'Preparate' : 'Round'} · Coach Boxeo`;
          if (driver && driver.burstUntil) {
            $('burstLeft').textContent = String(Math.max(0, Math.ceil((driver.burstUntil - Date.now() - 1800) / 1000)));
          }
        },
        onWarn: () => { if (!(engine && engine.seg && engine.seg.meta.guide)) Audio.clapper(); },
        onCountdown: ({ n }) => Audio.countdown(n),
        onFinish: (res) => finish(res),
      });

      body.dataset.state = 'running';
      $('btnMain').textContent = 'PAUSAR';
      $('btnStop').disabled = false;
      applyLocks();
      lockScreen();
      engine.start();
    }

    function pause() {
      engine.pause(); if (driver) driver.pause();
      clearTimeout(announceTimer); Voice.cancel(); Music.pause();
      body.dataset.state = 'paused';
      $('btnMain').textContent = 'REANUDAR';
      $('subText').textContent = 'En pausa';
    }
    function resume() {
      engine.resume(); if (driver) driver.resume();
      musicSync(engine.phase);
      body.dataset.state = 'running';
      $('btnMain').textContent = 'PAUSAR';
      setPhaseUI(engine.seg, session.plan, engine.index);
    }

    function resetToIdle() {
      engine = null; driver = null;
      body.dataset.state = 'idle';
      unlockScreen();
      applyLocks();
      drawIdle();
    }

    function stop() {
      if (!engine) return;
      engine.stop();
      clearTimeout(announceTimer);
      if (driver) driver.stop();
      Voice.cancel(); Music.stop();
      const entry = recordSession(true);
      resetToIdle();
      clearCombo();
      if (entry && entry.coach) openFinish(entry, true);
      else if (entry) toast('Entrenamiento guardado en tu progreso 📈');
    }

    function finish() {
      if (driver) driver.stop();
      clearTimeout(announceTimer);
      const lastSeg = session && session.plan[session.plan.length - 1];
      if (lastSeg && lastSeg.meta.guide) Audio.ding(S.endDings);   // el último ejercicio guiado no suena a campana: la ponemos acá
      Music.stop();
      body.dataset.state = 'idle';
      body.dataset.phase = 'done';
      body.dataset.guide = '';
      $('phaseLabel').textContent = 'FIN';
      $('timeText').textContent = '00:00';
      $('subText').textContent = '¡Buen trabajo! 🥊';
      $('btnMain').textContent = 'COMENZAR';
      $('btnStop').disabled = true;
      setRing(0);
      document.title = 'Fin · Coach Boxeo';
      const entry = recordSession(false);
      engine = null; driver = null;
      unlockScreen(); applyLocks();
      clearCombo('¡Terminaste! 💪');
      if (entry && entry.coach) setTimeout(() => openFinish(entry, false), 1500);
      else toast(entry ? '¡Terminó el entrenamiento! Quedó en tu progreso 📈' : '¡Terminó el entrenamiento! 🔔');
    }

    function mainAction() {
      if (!engine || engine.state === 'idle') start();
      else if (engine.state === 'running') pause();
      else resume();
    }
    $('btnMain').addEventListener('click', mainAction);
    $('btnStop').addEventListener('click', stop);
    document.addEventListener('keydown', (e) => {
      if (e.code !== 'Space') return;
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (/INPUT|SELECT|TEXTAREA|BUTTON/.test(tag)) return;
      e.preventDefault(); mainAction();
    });

    /* ---------------- fin de entrenamiento ---------------- */
    let lastResult = null;

    /* Puntos = suma de los rounds con coach (cada uno con el modo y nivel de su bloque). */
    function sessionTotals() {
      const acc = session.acc;
      const sec = acc.reduce((t, a) => t + a.sec, 0);
      const points = Math.round(acc.reduce((t, a) => t + Config.pointsRaw(a.sec, 1, a.mode, a.level), 0));
      const bySec = {};
      acc.forEach((a) => { bySec[a.mode] = (bySec[a.mode] || 0) + a.sec; });
      const mode = Object.keys(bySec).sort((a, b) => bySec[b] - bySec[a])[0] || 'normal';
      const level = Math.max(...acc.map((a) => a.level));
      return { rounds: acc.length, workSeconds: Math.round(sec), points, mode, level };
    }

    /* Guarda el entrenamiento en el historial (sea reloj, coach o rutina). */
    function recordSession(partial) {
      if (!session || !session.done.length) return null;
      const done = session.done;
      const t = session.acc.length ? sessionTotals() : { rounds: 0, workSeconds: 0, points: 0, mode: S.mode, level: 0 };
      const entry = Object.assign({
        id: 'l' + Date.now(), ts: Date.now(), dateStr: new Date().toLocaleDateString('es-AR'), published: false,
        kind: session.kind, coach: session.acc.length > 0, partial: !!partial,
        tRounds: done.filter((x) => !x.guide).length,
        tSec: Math.round(done.reduce((a, x) => a + x.sec, 0)),
        plan: session.snap,
      }, t);
      Storage.addHistory(entry);
      return entry;
    }

    function openFinish(entry, partial) {
      if (!entry) return;
      const t = entry;
      lastResult = entry;

      $('finishTitle').textContent = partial ? 'Entrenamiento detenido' : '¡Entrenamiento terminado!';
      $('stRounds').textContent = `${t.rounds}${partial && session ? '/' + session.coachTotal : ''}`;
      $('stTime').textContent = fmtShort(t.workSeconds);
      $('stPoints').textContent = String(t.points);
      const streak = Stats.summarize(Storage.getHistory()).streak.current;
      $('finishMeta').textContent = `${Config.MODES[t.mode].label} · ${Config.LEVELS[t.level].label}` + (streak >= 2 ? ` · 🔥 racha de ${streak} días` : '');
      $('finishName').value = Storage.getName();
      const pub = $('btnPublish'), nameField = $('finishNameField');
      if (Ranking.configured()) {
        pub.hidden = false; nameField.hidden = false; pub.disabled = false;
        pub.textContent = 'Subir al ranking mundial';
        $('finishNote').textContent = 'Ya quedó guardado en tus entrenos. Si querés, subilo al ranking para que lo vean todos.';
      } else {
        pub.hidden = true; nameField.hidden = true;
        $('finishNote').textContent = 'Guardado en tus entrenos. (El ranking mundial está desactivado: falta configurar Firebase, mirá el README.)';
      }
      const dlg = $('finishDialog');
      if (!dlg.open) { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', ''); }
      renderRanking();
    }

    $('btnPublish').addEventListener('click', async () => {
      const pub = $('btnPublish');
      const name = Ranking.cleanName($('finishName').value);
      if (name.length < 2) { $('finishNote').textContent = 'Poné un nombre de al menos 2 letras.'; $('finishName').focus(); return; }
      Storage.setName(name); $('playerName').value = name;
      pub.disabled = true; pub.textContent = 'Subiendo…';
      try {
        await Ranking.submit(Object.assign({ name, avatar: avatar(), group: Ranking.cleanGroup($('groupCode').value) }, lastResult));
        pub.textContent = '¡Subido! ✓';
        $('finishNote').textContent = 'Listo, ya aparecés en el ranking.';
        scope = 'global'; Storage.set('scope', scope); drawScope();
        loadRanking(true);
      } catch (e) {
        pub.disabled = false; pub.textContent = 'Reintentar';
        $('finishNote').textContent = 'No se pudo subir (' + (e.message || 'error') + '). Tu entreno quedó guardado en tu historial.';
      }
    });

    /* ---- tarjeta para compartir ---- */
    async function makeShareBlob() {
      const r = lastResult; if (!r) return null;
      const W = 1080, H = 1350;
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const x = c.getContext('2d');
      const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2a0f0d'); g.addColorStop(0.45, '#0c0e12'); g.addColorStop(1, '#0c0e12');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      x.strokeStyle = '#ff3b30'; x.lineWidth = 14; x.lineCap = 'round';
      x.beginPath(); x.arc(W / 2, 400, 250, -Math.PI / 2, Math.PI * 1.25); x.stroke();
      x.textAlign = 'center'; x.fillStyle = '#f3f5f8';
      const F = '"Barlow Condensed", "Arial Narrow", "Segoe UI", Arial, sans-serif';
      x.font = `120px ${F}`; x.fillText(avatar(), W / 2, 330);
      x.font = `bold 230px ${F}`; x.fillStyle = '#ffb020'; x.fillText(String(r.points), W / 2, 500);
      x.font = `bold 56px ${F}`; x.fillStyle = '#98a2b1'; x.fillText('PUNTOS', W / 2, 570);
      const name = Ranking.cleanName($('finishName').value || Storage.getName()) || 'Boxeador';
      x.font = `bold 96px ${F}`; x.fillStyle = '#f3f5f8'; x.fillText(name.toUpperCase(), W / 2, 780);
      x.font = `500 52px ${F}`; x.fillStyle = '#98a2b1';
      x.fillText(`${r.rounds} ${r.rounds === 1 ? 'round' : 'rounds'} · ${fmtShort(r.workSeconds)} trabajados`, W / 2, 880);
      x.fillText(`${Config.MODES[r.mode].label} · ${Config.LEVELS[r.level].label}`, W / 2, 950);
      x.fillText(new Date(r.ts).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }), W / 2, 1020);
      x.font = `bold 64px ${F}`; x.fillStyle = '#ff3b30'; x.fillText('COACH BOXEO', W / 2, 1240);
      x.font = `40px ${F}`; x.fillStyle = '#98a2b1'; x.fillText('🥊 ¿Me superás?', W / 2, 1300);
      return new Promise((res) => c.toBlob(res, 'image/png'));
    }
    $('btnShare').addEventListener('click', async () => {
      const blob = await makeShareBlob(); if (!blob) return;
      const file = new File([blob], 'coach-boxeo.png', { type: 'image/png' });
      try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: 'Coach Boxeo', text: `${lastResult.points} puntos en Coach Boxeo 🥊` });
          return;
        }
      } catch (e) { if (e && e.name === 'AbortError') return; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'coach-boxeo.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast('Imagen descargada 📥');
    });

    /* ---------------- ranking ---------------- */
    const AVATARS = ['🥊', '🔥', '🦁', '🐯', '🦅', '🐺', '⚡', '👑', '🐉', '🦈', '🐻', '🏆'];
    const avatar = () => Storage.get('avatar', '🥊');

    function buildAvatars() {
      const box = $('avatarPick');
      AVATARS.forEach((a) => {
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = a; b.setAttribute('aria-label', 'Avatar ' + a);
        b.addEventListener('click', () => { Storage.set('avatar', a); drawAvatars(); });
        box.appendChild(b);
      });
      drawAvatars();
    }
    function drawAvatars() {
      $$('#avatarPick button').forEach((b) => b.classList.toggle('active', b.textContent === avatar()));
    }

    let scope = Storage.get('scope', Ranking.configured() ? 'global' : 'local');
    if (scope !== 'local' && !Ranking.configured()) scope = 'local';
    let filter = Storage.get('filter', 'all');
    const cache = {};

    function buildFilters() {
      const box = $('rankFilters');
      const items = [['all', 'Todos']].concat(Object.entries(Config.MODES).map(([k, v]) => [k, v.label]));
      items.forEach(([k, label]) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'chipbtn'; b.dataset.filter = k; b.textContent = label;
        b.addEventListener('click', () => { filter = k; Storage.set('filter', k); drawFilters(); renderRanking(); });
        box.appendChild(b);
      });
      drawFilters();
    }
    function drawFilters() {
      $$('#rankFilters .chipbtn').forEach((b) => b.classList.toggle('active', b.dataset.filter === filter));
    }
    function drawScope() {
      $$('input[name="scope"]').forEach((r) => { r.checked = r.value === scope; });
    }

    /* Inicio del período elegido (ms). La semana arranca el lunes. */
    function periodStart(period) {
      const d = new Date(); d.setHours(0, 0, 0, 0);
      if (period === 'today') return d.getTime();
      if (period === 'week') { d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); }
      return 0;
    }
    const groupCode = () => Ranking.cleanGroup($('groupCode').value);
    const cacheKey = () => (scope === 'group' ? 'grp:' + groupCode() : 'glb:' + $('rankPeriod').value);

    async function loadRanking(force) {
      const status = $('rankStatus');
      if (scope === 'local' || !Ranking.configured()) { renderRanking(); return; }
      if (scope === 'group' && !groupCode()) { renderRanking(); return; }
      const key = cacheKey();
      if (!cache[key] || force) {
        status.textContent = 'Cargando ranking…';
        try {
          cache[key] = scope === 'group'
            ? await Ranking.fetchGroup(groupCode())
            : await Ranking.fetchGlobal(periodStart($('rankPeriod').value));
          status.textContent = '';
        } catch (e) {
          status.textContent = 'No se pudo cargar el ranking (' + (e.message || 'error') + ').';
        }
      } else status.textContent = '';
      renderRanking();
    }

    function renderRanking() {
      const list = $('rankList');
      list.innerHTML = '';
      const status = $('rankStatus');
      const period = $('rankPeriod').value;
      const addEmpty = (msg) => { const li = document.createElement('li'); li.className = 'empty'; li.textContent = msg; list.appendChild(li); };

      let rows;
      if (scope !== 'local' && !Ranking.configured()) {
        status.textContent = 'El ranking mundial está desactivado: falta pegar la configuración de Firebase (ver README).';
        return;
      }
      if (scope === 'group' && !groupCode()) { addEmpty('Poné un código de grupo (abajo) para ver el ranking de tus amigos.'); return; }
      if (scope === 'local') rows = Storage.getHistory().filter((r) => r.coach !== false && (r.points || 0) > 0);
      else rows = cache[cacheKey()] || [];

      const since = periodStart(period);
      rows = rows.filter((r) => {
        if (filter !== 'all' && r.mode !== filter) return false;
        if (since) return r.ts && r.ts >= since;
        return true;
      });
      rows = rows.slice().sort((a, b) => (b.points - a.points) || (b.workSeconds - a.workSeconds)).slice(0, 10);

      if (!rows.length) { addEmpty(scope === 'local' ? 'Todavía no hiciste entrenamientos con el coach.' : 'Todavía no hay registros en esta categoría.'); return; }
      rows.forEach((r, i) => {
        const li = document.createElement('li');
        li.className = 'rank-row' + (scope !== 'local' && r.uid && r.uid === Ranking.uid ? ' me' : '');
        const pos = document.createElement('span'); pos.className = 'pos'; pos.textContent = ['🥇', '🥈', '🥉'][i] || String(i + 1);
        const who = document.createElement('span'); who.className = 'who';
        const main = document.createElement('b');
        const dateTxt = r.ts ? new Date(r.ts).toLocaleDateString('es-AR', { day: 'numeric', month: 'numeric' }) : (r.dateStr || '');
        main.textContent = scope !== 'local' ? `${r.avatar ? r.avatar + ' ' : ''}${r.name}` : dateTxt;
        const meta = document.createElement('small');
        const parts = [`${r.rounds} ${r.rounds === 1 ? 'round' : 'rounds'}`, `${Math.round(r.workSeconds / 60)} min`, (Config.MODES[r.mode] || {}).label];
        if (r.level && Config.LEVELS[r.level]) parts.push(Config.LEVELS[r.level].label);
        if (scope !== 'local') parts.push(dateTxt);
        meta.textContent = parts.filter(Boolean).join(' · ');
        who.append(main, meta);
        const pts = document.createElement('span'); pts.className = 'pts'; pts.textContent = `${r.points} pts`;
        li.append(pos, who, pts);
        list.appendChild(li);
      });
    }

    $$('input[name="scope"]').forEach((r) => r.addEventListener('change', () => {
      scope = r.value; Storage.set('scope', scope); loadRanking(false);
    }));
    $('rankPeriod').addEventListener('change', () => loadRanking(false));
    $('btnRefresh').addEventListener('click', () => loadRanking(true));
    $('playerName').value = Storage.getName();
    $('playerName').addEventListener('change', () => {
      const n = Ranking.cleanName($('playerName').value);
      $('playerName').value = n; Storage.setName(n);
    });
    $('groupCode').value = Storage.get('group', '');
    $('groupCode').addEventListener('change', () => {
      const g = groupCode(); $('groupCode').value = g; Storage.set('group', g);
      if (scope === 'group') loadRanking(false);
    });

    /* ---------------- progreso ---------------- */
    const KIND_NAME = { clock: 'Reloj', coach: 'Coach', routine: 'Rutina' };
    const fmtDur = (sec) => { const m = Math.round(sec / 60); return m >= 60 ? `${Math.floor(m / 60)} h ${pad(m % 60)}` : `${m} min`; };
    const dm = (ts) => new Date(ts).toLocaleDateString('es-AR', { day: 'numeric', month: 'numeric' });
    const delta = (a, b, unit) => {
      const d = a - b;
      if (!b && !a) return '';
      return `<span class="${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '▲ +' : '▼ '}${d}${unit}</span> vs. semana pasada`;
    };

    function renderProgress() {
      const hist = Storage.getHistory();
      const st = Stats.summarize(hist);
      const tiles = $('progTiles');
      const tile = (big, label, small, cls) => `<div class="tile ${cls || ''}"><b>${big}</b><span>${label}</span><small>${small || ''}</small></div>`;
      tiles.innerHTML = [
        tile(st.streak.current, 'días seguidos', `mejor racha: ${st.streak.best}`, st.streak.current > 0 ? 'hot' : ''),
        tile(st.week.rounds, 'rounds esta semana', delta(st.week.rounds, st.prevWeek.rounds, '')),
        tile(Math.round(st.week.sec / 60), 'min esta semana', delta(Math.round(st.week.sec / 60), Math.round(st.prevWeek.sec / 60), '')),
        tile(st.total.sessions, 'entrenamientos', ''),
        tile(st.total.rounds, 'rounds en total', ''),
        tile(fmtDur(st.total.sec), 'tiempo total', ''),
      ].join('');

      const max = Math.max(1, ...st.weeks.map((w) => w.rounds));
      $('progWeeks').innerHTML = st.weeks.map((w, i) =>
        `<div class="wk${i === st.weeks.length - 1 ? ' now' : ''}"><div class="bar-wrap"><div class="bar" style="height:${Math.round((w.rounds / max) * 100)}%"></div></div><b>${w.rounds}</b><small>${dm(w.start)}</small></div>`).join('');

      const heat = $('progHeat'); heat.innerHTML = '';
      const todayKey = Stats.dayKey(Date.now());
      st.heat.forEach((col) => col.forEach((c) => {
        const m = Math.round(c.sec / 60);
        const i = document.createElement('i');
        i.className = 'l' + (m <= 0 ? 0 : m < 15 ? 1 : m < 30 ? 2 : m < 60 ? 3 : 4) + (c.future ? ' future' : '') + (c.key === todayKey ? ' today' : '');
        i.title = c.future ? '' : `${dm(c.ts)}: ${m} min`;
        heat.appendChild(i);
      }));

      const rec = $('progRecords'); rec.innerHTML = '';
      const addRec = (label, big, small) => { const li = document.createElement('li'); li.innerHTML = `<span>${label}<small>${small || ''}</small></span><b>${big}</b>`; rec.appendChild(li); };
      const R = st.records;
      if (R.points) addRec('Mejor puntaje', `${R.points.points} pts`, R.points.ts ? dm(R.points.ts) : '');
      if (R.longest) addRec('Entrenamiento más largo', fmtDur(Stats.secOf(R.longest)), R.longest.ts ? dm(R.longest.ts) : '');
      if (R.rounds) addRec('Más rounds en un día de entrenamiento', String(Stats.roundsOf(R.rounds)), R.rounds.ts ? dm(R.rounds.ts) : '');
      if (R.week) addRec('Mejor semana', fmtDur(R.week.sec), `semana del ${dm(R.week.start)} · ${R.week.rounds} rounds`);
      if (!rec.children.length) { const li = document.createElement('li'); li.className = 'empty-msg'; li.textContent = 'Todavía no hay récords: hacé tu primer entrenamiento.'; rec.appendChild(li); }

      const hl = $('progHistory'); hl.innerHTML = '';
      const recent = hist.filter((e) => e.ts).sort((a, b) => b.ts - a.ts).slice(0, 15);
      if (!recent.length) { const li = document.createElement('li'); li.className = 'empty-msg'; li.textContent = 'Acá van a aparecer tus entrenamientos.'; hl.appendChild(li); }
      recent.forEach((e) => {
        const li = document.createElement('li');
        const d = new Date(e.ts);
        const when = d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'numeric' }) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
        const info = document.createElement('span');
        info.innerHTML = `<b>${when} · ${KIND_NAME[e.kind] || 'Coach'}</b><small>${Stats.roundsOf(e)} rounds · ${fmtDur(Stats.secOf(e))}${e.coach !== false && e.points ? ' · ' + e.points + ' pts' : ''}${e.partial ? ' · cortado' : ''}</small>`;
        li.appendChild(info);
        if (e.plan) {
          const b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn-small'; b.textContent = 'Repetir';
          b.addEventListener('click', () => repeatPlan(e.plan));
          li.appendChild(b);
        }
        hl.appendChild(li);
      });
    }

    function repeatPlan(p) {
      if (running()) { toast('Primero terminá el entrenamiento que está en marcha'); return; }
      ['kind', 'rounds', 'workSec', 'restSec', 'prepSec', 'mode', 'level', 'pace', 'roundType', 'drillCombo', 'warmup', 'cooldown'].forEach((k) => { if (p[k] !== undefined) S[k] = p[k]; });
      if (p.routine && Array.isArray(p.routine.blocks)) { draft = clone(p.routine); S.routineId = draft.id; saveDraft(); }
      commit(); renderRoutineUI();
      $('progressDialog').close();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      toast('Listo: tocá COMENZAR 🥊');
    }

    $('btnProgress').addEventListener('click', () => {
      renderProgress();
      const dlg = $('progressDialog');
      if (!dlg.open) { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', ''); }
    });
    $('btnProgressClose').addEventListener('click', () => $('progressDialog').close());
    $('btnCsv').addEventListener('click', () => {
      const blob = new Blob([Stats.toCSV(Storage.getHistory())], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'coach-boxeo-historial.csv';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    });
    $('btnClearHistory').addEventListener('click', () => {
      if (!confirm('¿Borrar todo tu historial de entrenamientos? No se puede deshacer.')) return;
      Storage.clearHistory(); renderProgress(); renderRanking(); toast('Historial borrado');
    });

    /* ---------------- música ---------------- */
    let duckSpeech = false, duckBell = false;
    const applyDuck = () => Music.duck(duckSpeech || duckBell);
    Voice.hooks.speaking = (on) => { duckSpeech = on; applyDuck(); };
    Audio.hooks.sound = (ms) => { duckBell = true; applyDuck(); setTimeout(() => { duckBell = false; applyDuck(); }, ms); };

    function drawMusic(info) {
      info = info || Music.info();
      const has = info.count > 0;
      $('btnMusicToggle').textContent = info.playing ? '⏸' : '▶';
      ['btnMusicPrev', 'btnMusicToggle', 'btnMusicNext'].forEach((id) => { $(id).disabled = !has; });
      $('musicNow').textContent = has
        ? `${info.count} ${info.count === 1 ? 'canción' : 'canciones'} · ${info.playing ? 'suena' : 'lista'}: ${info.name}`
        : 'Todavía no elegiste canciones.';
    }
    Music.onChange(drawMusic);
    $('musicFiles').addEventListener('change', (e) => {
      const n = Music.setFiles(e.target.files);
      toast(n ? `${n} ${n === 1 ? 'canción cargada' : 'canciones cargadas'} 🎵` : 'No encontré audios en esa selección');
      e.target.value = '';
    });
    $('btnMusicToggle').addEventListener('click', () => { if (Music.playing) Music.pause(); else Music.play(); });
    $('btnMusicNext').addEventListener('click', () => Music.next());
    $('btnMusicPrev').addEventListener('click', () => Music.prev());

    /* ---------------- pantalla completa ---------------- */
    $('btnFullscreen').addEventListener('click', () => {
      const on = !body.classList.contains('tv');
      body.classList.toggle('tv', on);
      try {
        if (on && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
        else if (!on && document.fullscreenElement) document.exitFullscreen();
      } catch (e) {}
    });
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement) body.classList.remove('tv');
    });

    /* ---------------- arranque ---------------- */
    Storage.migrateLegacy();
    loadDraft();
    buildPresets();
    buildFilters();
    buildAvatars();
    bindSteppers();
    bindSimple();
    drawScope();
    Voice.init(fillVoices);
    Voice.loadClips(drawClips);
    Audio.configure({ sound: S.bellSound, volume: S.bellVolume, vibrate: S.vibrate });
    Music.setVolume(S.musicVolume); Music.setDuck(S.musicDuck);
    drawMusic();
    drawAll();
    renderRoutineUI();
    loadRanking(false);

    Coach._debug = {
      get S() { return S; }, get engine() { return engine; }, get draft() { return draft; },
      buildPlan, makeShareBlob, setLast(r) { lastResult = r; }, renderProgress, Music,
    };
  }

  Coach.UI = { init };
})(typeof window !== 'undefined' ? window : globalThis);
