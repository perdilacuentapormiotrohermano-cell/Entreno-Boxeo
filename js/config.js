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
    { id: 'clase', name: 'Clase completa (≈ 35 min)', builtin: true, blocks: [
      { label: 'Calentamiento · soga', type: 'free',  rounds: 1, workSec: 180, restSec: 0,  restAfter: 30 },
      { label: 'Técnica',              type: 'coach', rounds: 3, workSec: 120, restSec: 30, restAfter: 45, mode: 'normal',   level: 1, pace: 'relajado' },
      { label: 'Sparring',             type: 'coach', rounds: 3, workSec: 180, restSec: 60, restAfter: 60, mode: 'sparring', level: 2, pace: 'normal' },
      { label: 'Saco',                 type: 'free',  rounds: 3, workSec: 180, restSec: 60, restAfter: 45 },
      { label: 'Abdominales',          type: 'free',  rounds: 1, workSec: 180, restSec: 0,  restAfter: 30 },
      { label: 'Estiramiento',         type: 'free',  rounds: 1, workSec: 240, restSec: 0,  restAfter: 0 },
    ] },
    { id: 'cardio', name: 'Cardio + técnica (≈ 25 min)', builtin: true, blocks: [
      { label: 'Soga',          type: 'free',  rounds: 2, workSec: 120, restSec: 30, restAfter: 30 },
      { label: 'Combinaciones', type: 'coach', rounds: 4, workSec: 120, restSec: 30, restAfter: 45, mode: 'normal',    level: 2, pace: 'normal' },
      { label: 'Progresivo',    type: 'coach', rounds: 3, workSec: 120, restSec: 40, restAfter: 30, mode: 'intensity', level: 2, pace: 'normal' },
      { label: 'Estiramiento',  type: 'free',  rounds: 1, workSec: 180, restSec: 0,  restAfter: 0 },
    ] },
    { id: 'pelea', name: 'Preparación de pelea (≈ 50 min)', builtin: true, blocks: [
      { label: 'Calentamiento',  type: 'free',  rounds: 1, workSec: 240, restSec: 0,  restAfter: 30 },
      { label: 'Técnica',        type: 'coach', rounds: 3, workSec: 180, restSec: 45, restAfter: 45, mode: 'normal',    level: 2, pace: 'normal' },
      { label: 'Sparring',       type: 'coach', rounds: 6, workSec: 180, restSec: 60, restAfter: 60, mode: 'sparring',  level: 3, pace: 'rapido' },
      { label: 'Intensidad',     type: 'coach', rounds: 3, workSec: 180, restSec: 45, restAfter: 45, mode: 'intensity', level: 3, pace: 'rapido' },
      { label: 'Saco y core',    type: 'free',  rounds: 3, workSec: 180, restSec: 45, restAfter: 30 },
      { label: 'Enfriamiento',   type: 'free',  rounds: 1, workSec: 240, restSec: 0,  restAfter: 0 },
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

  Coach.Config = { MODES, LEVELS, PACES, PRESETS, ROUTINES, DEFAULTS, points, pointsRaw };
  if (typeof module !== 'undefined' && module.exports) module.exports = Coach.Config;
})(typeof window !== 'undefined' ? window : globalThis);
