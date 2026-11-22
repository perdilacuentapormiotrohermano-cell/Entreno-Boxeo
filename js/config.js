/* ============================================================
   config.js — constantes, presets, ritmos y fórmula de puntos
   ============================================================ */
(function (root) {
  const Coach = (root.Coach = root.Coach || {});

  const MODES = {
    normal:    { label: 'Clásico',      desc: 'Combinaciones estables y ritmo constante.',            mult: 1 },
    sparring:  { label: 'Impredecible', desc: 'Duración variable y presión aleatoria.',               mult: 1.25 },
    intensity: { label: 'Progresivo',   desc: 'Cada round sube la velocidad y baja el descanso.',     mult: 1.5 },
  };

  const LEVELS = {
    1: { label: 'Básico',     mult: 1 },
    2: { label: 'Intermedio', mult: 1.15 },
    3: { label: 'Avanzado',   mult: 1.3 },
  };

  /* Ritmo = cuánto tiempo se le da al boxeador para ejecutar lo que se le cantó.
     punchMs: milisegundos que lleva tirar un golpe a ritmo cómodo.
     resetMs: pausa para volver a guardia antes del próximo llamado. */
  const PACES = {
    relajado: { label: 'Relajado', punchMs: 800, resetMs: 1700 },
    normal:   { label: 'Normal',   punchMs: 600, resetMs: 1100 },
    rapido:   { label: 'Rápido',   punchMs: 470, resetMs: 700  },
    maximo:   { label: 'Máximo',   punchMs: 380, resetMs: 450  },
  };

  /* Tipo de ronda (solo con coach): cambia QUÉ canta y cómo. */
  const ROUND_TYPES = {
    sombra:     { label: 'Sombra',            desc: 'Combinaciones libres, como frente al espejo.' },
    manoplas:   { label: 'Manoplas',          desc: 'Cantadas con números, como te las canta el entrenador. Sin pasos.' },
    bolsa:      { label: 'Bolsa',             desc: 'Combos largos y seguidos, con pasos y ráfagas de ritmo alto. Sin esquives.' },
    defensa:    { label: 'Defensa y contra',  desc: 'Siempre un esquive y el contragolpe que sale de ahí.' },
    repeticion: { label: 'Repetición',        desc: 'Un mismo combo una y otra vez, hasta que te salga solo.' },
    reflejos:   { label: 'Reflejos',          desc: 'Órdenes sueltas y cortas, a destiempo: no podés anticiparte.' },
  };

  /* Calentamiento y vuelta a la calma guiados: cada paso se anuncia por voz y se ve en pantalla.
     La duración total se escala (3, 5 u 8 min) manteniendo las proporciones. */
  const GUIDES = {
    warmup: { label: 'Calentamiento', baseSec: 300, steps: [
      { label: 'Trote suave en el lugar',          sec: 45 },
      { label: 'Cuello y hombros',                 sec: 30 },
      { label: 'Círculos de brazos',               sec: 30 },
      { label: 'Cintura y torso',                  sec: 30 },
      { label: 'Sentadillas sin peso',             sec: 30 },
      { label: 'Soga o saltitos',                  sec: 60 },
      { label: 'Sombra suave, jab y cross',        sec: 45 },
      { label: 'Sombra con movimiento de cintura', sec: 30 },
    ] },
    cooldown: { label: 'Vuelta a la calma', baseSec: 300, steps: [
      { label: 'Caminá y respirá hondo',           sec: 45 },
      { label: 'Estirá hombros y pecho',           sec: 45 },
      { label: 'Estirá tríceps y brazos',          sec: 40 },
      { label: 'Cuello, suave',                    sec: 30 },
      { label: 'Torso y espalda baja',             sec: 45 },
      { label: 'Piernas: cuádriceps y gemelos',    sec: 55 },
      { label: 'Respiración profunda',             sec: 40 },
    ] },
  };
  function guideSteps(kind, minutes) {
    const g = GUIDES[kind]; if (!g) return [];
    const f = ((minutes || 5) * 60) / g.baseSec;
    return g.steps.map((x) => ({ label: x.label, sec: Math.max(15, Math.round((x.sec * f) / 5) * 5) }));
  }

  const PRESETS = [
    { id: 'amateur',  label: 'Amateur 3×3',     rounds: 3,  workSec: 180, restSec: 60, prepSec: 10 },
    { id: 'pro',      label: 'Pro 12×3',        rounds: 12, workSec: 180, restSec: 60, prepSec: 10 },
    { id: 'inicio',   label: 'Principiante',    rounds: 3,  workSec: 120, restSec: 60, prepSec: 10 },
    { id: 'fem',      label: 'Femenino 10×2',   rounds: 10, workSec: 120, restSec: 60, prepSec: 10 },
    { id: 'cardio',   label: 'Cardio 6×1',      rounds: 6,  workSec: 60,  restSec: 30, prepSec: 5  },
    { id: 'tabata',   label: 'Tabata 8×20/10',  rounds: 8,  workSec: 20,  restSec: 10, prepSec: 5  },
  ];

  /* Rutinas completas: lista de bloques. Cada bloque tiene sus propios rounds y tiempos.
     type 'coach' = el coach canta combos · type 'free' = solo reloj (saco, soga, abdominales…).
     restAfter = descanso al terminar el bloque (antes del siguiente). */
  const ROUTINES = [
    { id: 'clase', name: 'Clase completa (≈ 45 min)', builtin: true, blocks: [
      { label: 'Calentamiento',        type: 'warmup', minutes: 5, restAfter: 15 },
      { label: 'Técnica',              type: 'coach', rounds: 3, workSec: 120, restSec: 30, restAfter: 45, mode: 'normal',   level: 1, pace: 'relajado' },
      { label: 'Sparring',             type: 'coach', rounds: 3, workSec: 180, restSec: 60, restAfter: 60, mode: 'sparring', level: 2, pace: 'normal' },
      { label: 'Saco',                 type: 'free',  rounds: 3, workSec: 180, restSec: 60, restAfter: 45 },
      { label: 'Abdominales',          type: 'free',  rounds: 1, workSec: 180, restSec: 0,  restAfter: 30 },
      { label: 'Vuelta a la calma',    type: 'cooldown', minutes: 5, restAfter: 0 },
    ] },
    { id: 'cardio', name: 'Cardio + técnica (≈ 26 min)', builtin: true, blocks: [
      { label: 'Soga',          type: 'free',  rounds: 2, workSec: 120, restSec: 30, restAfter: 30 },
      { label: 'Combinaciones', type: 'coach', rounds: 4, workSec: 120, restSec: 30, restAfter: 45, mode: 'normal',    level: 2, pace: 'normal' },
      { label: 'Progresivo',    type: 'coach', rounds: 3, workSec: 120, restSec: 40, restAfter: 30, mode: 'intensity', level: 2, pace: 'normal' },
      { label: 'Vuelta a la calma', type: 'cooldown', minutes: 3, restAfter: 0 },
    ] },
    { id: 'tecnica', name: 'Técnica y defensa (≈ 40 min)', builtin: true, blocks: [
      { label: 'Calentamiento',     type: 'warmup', minutes: 5, restAfter: 15 },
      { label: 'Repetición',        type: 'coach', roundType: 'repeticion', rounds: 3, workSec: 120, restSec: 30, restAfter: 30, mode: 'normal', level: 2, pace: 'relajado' },
      { label: 'Defensa y contra',  type: 'coach', roundType: 'defensa',    rounds: 3, workSec: 120, restSec: 30, restAfter: 30, mode: 'normal', level: 2, pace: 'normal' },
      { label: 'Manoplas',          type: 'coach', roundType: 'manoplas',   rounds: 3, workSec: 150, restSec: 45, restAfter: 30, mode: 'normal', level: 2, pace: 'normal' },
      { label: 'Reflejos',          type: 'coach', roundType: 'reflejos',   rounds: 2, workSec: 90,  restSec: 30, restAfter: 30, mode: 'normal', level: 2, pace: 'rapido' },
      { label: 'Vuelta a la calma', type: 'cooldown', minutes: 5, restAfter: 0 },
    ] },
    { id: 'pelea', name: 'Preparación de pelea (≈ 70 min)', builtin: true, blocks: [
      { label: 'Calentamiento',  type: 'warmup', minutes: 5, restAfter: 15 },
      { label: 'Técnica',        type: 'coach', rounds: 3, workSec: 180, restSec: 45, restAfter: 45, mode: 'normal',    level: 2, pace: 'normal' },
      { label: 'Sparring',       type: 'coach', rounds: 6, workSec: 180, restSec: 60, restAfter: 60, mode: 'sparring',  level: 3, pace: 'rapido' },
      { label: 'Intensidad',     type: 'coach', rounds: 3, workSec: 180, restSec: 45, restAfter: 45, mode: 'intensity', level: 3, pace: 'rapido' },
      { label: 'Bolsa',          type: 'coach', roundType: 'bolsa', rounds: 3, workSec: 180, restSec: 45, restAfter: 30, mode: 'normal', level: 3, pace: 'rapido' },
      { label: 'Vuelta a la calma', type: 'cooldown', minutes: 5, restAfter: 0 },
    ] },
  ];

  const DEFAULTS = {
    kind: 'coach',           // 'clock' | 'coach' | 'routine'
    routineId: 'clase',
    voiceMode: 'tts',        // 'tts' = voz del dispositivo · 'clips' = pack de audios (Sonidos/voz)
    rounds: 3,
    workSec: 180,
    restSec: 60,
    prepSec: 10,
    mode: 'normal',
    level: 2,
    pace: 'normal',
    roundType: 'sombra',     // ver ROUND_TYPES
    drillCombo: '',          // combo a repetir en la ronda «Repetición» (vacío = el coach elige)
    warmup: 0,               // minutos de calentamiento guiado antes de empezar (0 = no)
    cooldown: 0,             // minutos de vuelta a la calma al terminar
    voiceRate: 1.0,
    voiceName: '',
    stance: 'ortodoxo',      // 'ortodoxo' | 'zurdo'
    callStyle: 'nombres',    // 'nombres' | 'numeros'
    slipStyle: 'ambos',      // cómo canta el esquive: 'ambos' (al jab, derecha) | 'direccion' | 'golpe'
    defense: true,
    movement: true,
    body: false,
    announce: true,          // el coach dice "Round 2" / "Último round"
    bellSound: 'file',       // 'file' | 'synth' | 'horn'
    endDings: 1,
    bellVolume: 0.6,
    voiceVolume: 1,
    warn10: true,
    vibrate: true,
  };

  /* Puntos del ranking.
     Base: 10 pts por minuto trabajado + 20 por round completado.
     Se multiplica por el modo (1 / 1.25 / 1.5) y por el nivel (1 / 1.15 / 1.3).
     Máximo teórico del multiplicador: 1.5 × 1.3 = 1.95 (las reglas de Firestore topean en 2). */
  function pointsRaw(workSeconds, rounds, mode, level) {
    const base = (workSeconds / 60) * 10 + rounds * 20;
    const m = (MODES[mode] || MODES.normal).mult * (LEVELS[level] || LEVELS[1]).mult;
    return base * m;
  }
  function points(workSeconds, rounds, mode, level) {
    return Math.round(pointsRaw(workSeconds, rounds, mode, level));
  }

  Coach.Config = { MODES, LEVELS, PACES, ROUND_TYPES, GUIDES, guideSteps, PRESETS, ROUTINES, DEFAULTS, points, pointsRaw };
  if (typeof module !== 'undefined' && module.exports) module.exports = Coach.Config;
})(typeof window !== 'undefined' ? window : globalThis);
