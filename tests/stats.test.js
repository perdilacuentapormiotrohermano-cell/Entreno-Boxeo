/* Test de estadísticas — node tests/stats.test.js */
const path = require('path');
const S = require(path.join(__dirname, '../js/stats.js'));
let fails = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fails++; console.log(`  ✗ ${m}: esperado ${JSON.stringify(b)}, salió ${JSON.stringify(a)}`); } else console.log('  ✓ ' + m); };

// Sábado 21/11/2026 15:00 (hora local). Esa semana arranca el lunes 16/11.
const now = new Date(2026, 10, 21, 15, 0).getTime();
const at = (m, d, h = 10) => new Date(2026, m - 1, d, h, 0).getTime();
const e = (ts, tRounds, tSec, points = 0, kind = 'coach') => ({ ts, tRounds, tSec, points, kind });

console.log('Racha');
let r = S.summarize([e(at(11, 21), 3, 540, 100), e(at(11, 20), 3, 540), e(at(11, 19), 2, 300), e(at(11, 17), 1, 100)], now);
eq(r.streak.current, 3, 'tres días seguidos hasta hoy');
eq(r.streak.best, 3, 'mejor racha 3');
r = S.summarize([e(at(11, 20), 3, 540), e(at(11, 19), 2, 300)], now);
eq(r.streak.current, 2, 'sigue viva si el último fue ayer');
r = S.summarize([e(at(11, 18), 3, 540)], now);
eq(r.streak.current, 0, 'se corta si pasó más de un día');
r = S.summarize([e(at(10, 1), 1, 60), e(at(10, 2), 1, 60), e(at(10, 3), 1, 60), e(at(10, 4), 1, 60), e(at(11, 20), 1, 60)], now);
eq(r.streak.best, 4, 'mejor racha del pasado (4) aunque la actual sea 1');
eq(r.streak.current, 1, 'actual 1');

console.log('Semanas');
r = S.summarize([e(at(11, 16), 3, 600), e(at(11, 21), 2, 300), e(at(11, 12), 5, 900), e(at(11, 15, 23), 1, 60)], now);
eq(r.week.rounds, 5, 'esta semana: 3 + 2 rounds (lunes a sábado)');
eq(r.prevWeek.rounds, 6, 'semana anterior: jueves 12 y domingo 15');
eq(r.weeks.length, 8, '8 semanas');
eq(r.weeks[7].sessions, 2, 'sesiones esta semana');
eq(r.heat.length, 12, '12 columnas');
eq(r.heat[11].map((c) => c.future), [false, false, false, false, false, false, true], 'el domingo de esta semana es futuro');
eq(r.heat[11][0].key, '2026-11-16', 'la columna arranca el lunes');

console.log('Compatibilidad con entrenos viejos');
r = S.summarize([{ ts: at(11, 21), rounds: 3, workSeconds: 540, points: 80 }, { ts: null, rounds: 2, workSeconds: 240, points: 40 }], now);
eq(r.total.rounds, 5, 'suma rounds (viejos incluidos)');
eq(r.total.sec, 780, 'suma segundos');
eq(r.streak.current, 1, 'sin fecha no cuenta para la racha');

console.log('Récords y CSV');
r = S.summarize([e(at(11, 21), 3, 540, 100), e(at(11, 10), 9, 1800, 400), e(at(11, 11), 4, 600, 150)], now);
eq(r.records.points.points, 400, 'mejor puntaje');
eq(r.records.longest.tSec, 1800, 'entreno más largo');
eq(r.records.rounds.tRounds, 9, 'más rounds');
const csv = S.toCSV([e(at(11, 21), 3, 540, 100, 'routine')]);
eq(csv.split('\n')[1], '2026-11-21,10:00,Rutina,3,9.0,100,,', 'fila CSV');
console.log(fails ? `\n✗ ${fails} fallas\n` : '\n✓ Todo OK\n');
process.exit(fails ? 1 : 0);
