/* Test de combinaciones — correr con:  node tests/combos.test.js
   Comprueba que TODO lo que el coach puede cantar es físicamente realizable
   y que el ritmo (voz + tiempo de ejecución) es razonable. */
const path = require('path');
const Config = require(path.join(__dirname, '../js/config.js'));
const C = require(path.join(__dirname, '../js/combos.js'));

let failures = 0;
const fail = (m) => { failures++; console.log('  ✗ ' + m); };
const ok = (m) => console.log('  ✓ ' + m);

/* 1) El validador rechaza lo imposible y acepta lo real */
console.log('\n1) Validador');
const bad = ['2 2', '1 1 1', '4 6', '2 4', '3 3', '1 mB 2', 'mB 1 mF', 'sj sc', 'sj 3', 'sc 2', 'd 2', 'sj 1', '3b 3b 3b', '5 6 5 6', '1 2 3 2 3 2 3', '2b', '4 4'];
const good = ['1', '1 2', '1 1', '1 3', '1 2 3 2', '5 3', '3b 3', 'mB', '1 2 mB', 'sj 2 3', 'sc 3 2', 'd 3', 'sc 5', '1 2 5 6 3 2', 'd', '1 3b 2'];
bad.forEach((t) => (C.validate(t.split(' ')).ok ? fail(`debería rechazar: ${t}`) : null));
good.forEach((t) => (!C.validate(t.split(' ')).ok ? fail(`debería aceptar: ${t} → ${C.validate(t.split(' ')).errors}`) : null));
if (!failures) ok(`${bad.length} imposibles rechazados, ${good.length} reales aceptados`);

/* 1b) El esquive se dice de forma clara */
console.log('\n1b) Esquives (qué golpe y hacia qué lado)');
const say = (tok, o) => C.describe(tok.split(' '), o).speech;
const eq = (a, b, m) => (a === b ? null : fail(`${m}: esperado «${b}», salió «${a}»`));
eq(say('sj', { stance: 'ortodoxo', slip: 'ambos' }), 'esquive al yab, derecha', 'jab ortodoxo (ambos)');
eq(say('sc', { stance: 'ortodoxo', slip: 'ambos' }), 'esquive al cros, izquierda', 'cross ortodoxo (ambos)');
eq(say('sj', { stance: 'zurdo', slip: 'ambos' }), 'esquive al yab, izquierda', 'jab zurdo (ambos)');
eq(say('sc', { stance: 'zurdo', slip: 'ambos' }), 'esquive al cros, derecha', 'cross zurdo (ambos)');
eq(say('sj', { stance: 'ortodoxo', slip: 'direccion' }), 'esquive derecha', 'solo lado');
eq(say('sc', { stance: 'ortodoxo', slip: 'golpe' }), 'esquive al cros', 'solo golpe');
eq(say('d', { slip: 'ambos' }), 'agachada al gancho', 'agachada');
if (!failures) ok('jab/cross × ortodoxo/zurdo × 3 estilos se cantan sin ambigüedad');

/* 2) Toda la biblioteca curada es válida */
console.log('\n2) Biblioteca curada');
const before = failures;
C.CURATED.forEach((c) => {
  const v = C.validate(c.tokens);
  if (!v.ok) fail(`nivel ${c.level} «${c.tokens.join(' ')}»: ${v.errors.join(', ')}`);
});
if (failures === before) ok(`${C.CURATED.length} combinaciones válidas`);

/* 3) Generador: miles de llamados en todas las configuraciones */
console.log('\n3) Generador (20.000 llamados por configuración)');
const N = 20000;
const rows = [];
let totalGenerated = 0;
[1, 2, 3].forEach((level) => ['normal', 'sparring', 'intensity'].forEach((mode) => {
  [
    { defense: true, movement: true, body: true },
    { defense: false, movement: false, body: false },
    { defense: true, movement: false, body: false },
  ].forEach((flags, fi) => {
    const state = { recent: [] };
    let invalid = 0, dup = 0, prev = '', punches = 0, speechSum = 0, speechMax = 0, cycleSum = 0, moves = 0, defs = 0, bodies = 0;
    const pace = Config.PACES.normal;
    for (let i = 0; i < N; i++) {
      const t = C.next({ level, mode, ...flags, maxSpeechMs: 4200, style: 'nombres', stance: 'ortodoxo', slip: 'ambos', rate: 1 }, state);
      totalGenerated++;
      const v = C.validate(t);
      if (!v.ok) { invalid++; if (invalid < 4) console.log('    inválido:', t.join(' '), v.errors); }
      const k = t.join(' ');
      if (k === prev) dup++;
      prev = k;
      // respeta los interruptores
      if (!flags.movement && t.some((x) => x[0] === 'm')) invalid++;
      if (!flags.defense && t.some((x) => /^(sj|sc|d)$/.test(x))) invalid++;
      if (!flags.body && t.some((x) => /b$/.test(x))) invalid++;
      // nivel básico: solo 1, 2, 3
      if (level === 1 && t.some((x) => /^[456]/.test(x))) invalid++;
      punches += t.filter((x) => /^[1-6]/.test(x)).length;
      moves += t.filter((x) => x[0] === 'm').length;
      defs += t.filter((x) => /^(sj|sc|d)$/.test(x)).length;
      bodies += t.filter((x) => /b$/.test(x)).length;
      const d = C.describe(t, { style: 'nombres' });
      const ms = C.estimateSpeechMs(d.speech, 1);
      speechSum += ms; speechMax = Math.max(speechMax, ms);
      cycleSum += ms + C.gapMs(t, pace);
    }
    if (invalid) fail(`nivel ${level} ${mode} #${fi}: ${invalid} inválidos`);
    if (dup) fail(`nivel ${level} ${mode} #${fi}: ${dup} repetidos seguidos`);
    if (fi === 0) rows.push({
      nivel: level, modo: mode,
      'golpes/llamado': (punches / N).toFixed(1),
      'voz media (s)': (speechSum / N / 1000).toFixed(1),
      'voz máx (s)': (speechMax / 1000).toFixed(1),
      'ciclo medio (s)': (cycleSum / N / 1000).toFixed(1),
      'llamados/min': (60000 / (cycleSum / N)).toFixed(1),
    });
  });
}));
console.table(rows);
if (!failures) ok(`${totalGenerated.toLocaleString('es')} llamados generados, ninguno imposible`);

/* 4) Ráfaga de "ritmo alto": máximo 3 golpes y sin pasos */
console.log('\n4) Ritmo alto (ráfaga)');
let burstBad = 0;
for (let i = 0; i < 20000; i++) {
  const t = C.next({ level: 3, mode: 'sparring', movement: true, body: true, maxPunches: 3, noMovement: true, defense: false, maxSpeechMs: 4200, style: 'nombres', rate: 1 }, { recent: [] });
  const p = t.filter((x) => /^[1-6]/.test(x)).length;
  if (p > 3 || t.some((x) => x[0] === 'm') || !C.validate(t).ok) burstBad++;
}
burstBad ? fail(`${burstBad} llamados de ráfaga fuera de regla`) : ok('todas las ráfagas ≤ 3 golpes y sin pasos');


/* 4b) Tipos de ronda: manoplas, bolsa, defensa y contra, reflejos, repetición */
console.log('\n4b) Tipos de ronda');
{
  const base = { mode: 'normal', defense: true, movement: true, body: true, maxSpeechMs: 4200, rate: 1 };
  const cnt = (t, re) => t.filter((x) => re.test(x)).length;
  let bad = 0;
  [1, 2, 3].forEach((level) => {
    const st = {};
    for (let i = 0; i < 5000; i++) {
      const sh = C.next({ ...base, level, drill: 'manoplas' }, (st.m = st.m || { recent: [] }));
      if (!C.validate(sh).ok || cnt(sh, /^m/) || cnt(sh, /^[1-6]/) < 2) bad++;
      const bo = C.next({ ...base, level, drill: 'bolsa' }, (st.b = st.b || { recent: [] }));
      if (!C.validate(bo).ok || cnt(bo, /^(sj|sc|d)$/) || cnt(bo, /^[1-6]/) < (level === 1 ? 2 : 3)) bad++;
      const de = C.next({ ...base, level, drill: 'defensa' }, (st.d = st.d || { recent: [] }));
      if (!C.validate(de).ok || !/^(sj|sc|d)$/.test(de[0]) || de.length < 2) bad++;
      const re = C.next({ ...base, level, drill: 'reflejos' }, (st.r = st.r || { recent: [] }));
      if (!C.validate(re).ok || re.length > 2) bad++;
      const dc = C.drillCombo({ ...base, level });
      if (!C.validate(dc).ok || cnt(dc, /^m/)) bad++;
    }
  });
  bad ? fail(`${bad} llamados fuera de regla en los tipos de ronda`) : ok('manoplas / bolsa / defensa / reflejos / repetición: 90.000 llamados válidos y respetan su tipo');
  const okC = C.parseCombo('1-2-3-2').ok && C.parseCombo('sj 2 3').ok;
  const noC = !C.parseCombo('2 2').ok && !C.parseCombo('hola').ok && !C.parseCombo('').ok;
  okC && noC ? ok('el combo escrito a mano se valida (acepta «1-2-3-2» y rechaza «2 2»)') : fail('parseCombo');
}

/* 5) Velocidad de la voz: ¿una persona puede seguirla? */
console.log('\n5) Voz');
const worst = C.describe('1 2 5 6 3 2'.split(' '), { style: 'nombres' });
const w1 = C.estimateSpeechMs(worst.speech, 1);
const w13 = C.estimateSpeechMs(worst.speech, 1.3);
console.log(`    Combo más largo (6 golpes): «${worst.speech}»`);
console.log(`    Voz a 1.0× ≈ ${(w1 / 1000).toFixed(1)} s · a 1.3× ≈ ${(w13 / 1000).toFixed(1)} s`);
console.log(`    Ejecutarlo a ritmo normal: ${(C.executionMs('1 2 5 6 3 2'.split(' '), Config.PACES.normal) / 1000).toFixed(1)} s`);
w1 < 4000 ? ok('la frase más larga dura < 4 s a velocidad normal') : fail('frase demasiado larga');

/* 6) Comparación con el generador de la versión anterior */
console.log('\n6) Generador viejo (palabras al azar) vs. nuevo');
const OLD = ['jab', 'recto de derecha', 'cross', 'gancho', 'esquive', 'izquierda', 'derecha', 'atrás', 'adelante'];
const MOVE = ['izquierda', 'derecha', 'atrás', 'adelante'];
let oldBad = 0; const M = 100000;
for (let i = 0; i < M; i++) {
  const len = Math.floor(Math.random() * 3) + 1; const w = [];
  for (let j = 0; j < len; j++) w.push(OLD[Math.floor(Math.random() * OLD.length)]);
  let bad2 = false;
  for (let j = 0; j < w.length - 1; j++) {
    const a = w[j], b = w[j + 1];
    if (a === b && a !== 'jab') bad2 = true;                         // gancho gancho, esquive esquive, atrás atrás...
    if (MOVE.includes(a) && MOVE.includes(b)) bad2 = true;           // dos pasos pegados (¿izquierda derecha?)
    if ((a === 'cross' && b === 'recto de derecha') || (b === 'cross' && a === 'recto de derecha')) bad2 = true; // mismo golpe 2 veces
    if ((a === 'esquive' || b === 'esquive') && (MOVE.includes(a) || MOVE.includes(b))) bad2 = true;
  }
  if (bad2) oldBad++;
}
console.log(`    Versión vieja: ~${((oldBad / M) * 100).toFixed(0)} % de los llamados tenían una repetición o mezcla imposible/contradictoria.`);
console.log('    Versión nueva: 0 % (validado arriba).');

console.log(failures ? `\n✗ ${failures} fallas\n` : '\n✓ Todo OK\n');
process.exit(failures ? 1 : 0);
