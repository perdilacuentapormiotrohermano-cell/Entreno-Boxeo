/* ============================================================
   ranking.js — ranking mundial (Firebase/Firestore) + historial local
   Firebase se carga recién cuando hace falta; si no hay internet o no está
   configurado, todo sigue funcionando con el ranking local.
   ============================================================ */
(function (root) {
  const Coach = (root.Coach = root.Coach || {});
  const FB_VERSION = '10.12.5';
  const COLLECTION = 'ranking';

  let db = null, auth = null, uid = null, initPromise = null, lastError = '';

  const cfg = () => root.COACH_FIREBASE || {};
  const configured = () => !!(cfg().apiKey && cfg().projectId);

  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.async = false;
      s.onload = res; s.onerror = () => rej(new Error('No se pudo cargar ' + src));
      document.head.appendChild(s);
    });
  }

  function init() {
    if (!configured()) return Promise.reject(new Error('Firebase no está configurado'));
    if (initPromise) return initPromise;
    initPromise = (async () => {
      const base = `https://www.gstatic.com/firebasejs/${FB_VERSION}/`;
      await loadScript(base + 'firebase-app-compat.js');
      await loadScript(base + 'firebase-auth-compat.js');
      await loadScript(base + 'firebase-firestore-compat.js');
      if (!root.firebase.apps.length) root.firebase.initializeApp(cfg());
      db = root.firebase.firestore();
      auth = root.firebase.auth();
      // Sesión anónima: no pide cuenta, pero permite que las reglas validen quién escribe.
      if (!auth.currentUser) await auth.signInAnonymously();
      uid = auth.currentUser && auth.currentUser.uid;
    })().catch((e) => { initPromise = null; lastError = e.message || String(e); throw e; });
    return initPromise;
  }

  function cleanName(n) {
    return String(n || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20);
  }
  /* Código de grupo: minúsculas, números y guiones (ej. "gym-pepe"). */
  function cleanGroup(g) {
    return String(g || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 20);
  }

  /* entry: { name, mode, level, rounds, workSeconds, points } */
  async function submit(entry) {
    await init();
    const name = cleanName(entry.name);
    if (name.length < 2) throw new Error('Poné un nombre de al menos 2 letras');
    const doc = {
      uid,
      name,
      avatar: String(entry.avatar || '').slice(0, 8),
      group: cleanGroup(entry.group),
      mode: entry.mode,
      level: entry.level,
      rounds: entry.rounds,
      workSeconds: Math.round(entry.workSeconds),
      points: Math.round(entry.points),
      createdAt: root.firebase.firestore.FieldValue.serverTimestamp(),
    };
    const ref = await db.collection(COLLECTION).add(doc);
    return ref.id;
  }

  function mapDocs(snap) {
    return snap.docs.map((d) => {
      const x = d.data();
      return {
        id: d.id, uid: x.uid, name: x.name, avatar: x.avatar || '', group: x.group || '',
        mode: x.mode, level: x.level,
        rounds: x.rounds, workSeconds: x.workSeconds, points: x.points,
        ts: x.createdAt && x.createdAt.toMillis ? x.createdAt.toMillis() : Date.now(),
      };
    });
  }

  /* Ranking mundial.
     • "siempre": los 100 mejores de todos los tiempos.
     • hoy / semana: todo lo posterior a `since` (ms), así un ranking semanal no depende de los récords históricos.
     Ninguna de las dos consultas necesita índices compuestos. */
  async function fetchGlobal(since) {
    await init();
    const col = db.collection(COLLECTION);
    const q = since
      ? col.where('createdAt', '>=', root.firebase.firestore.Timestamp.fromMillis(since)).orderBy('createdAt', 'desc').limit(300)
      : col.orderBy('points', 'desc').limit(100);
    return mapDocs(await q.get());
  }

  /* Ranking de un grupo de amigos (se filtra por código; el orden y período se hacen acá). */
  async function fetchGroup(code) {
    await init();
    const g = cleanGroup(code);
    if (!g) return [];
    return mapDocs(await db.collection(COLLECTION).where('group', '==', g).limit(300).get());
  }

  Coach.Ranking = {
    configured,
    init, submit, fetchGlobal, fetchGroup, cleanName, cleanGroup,
    get uid() { return uid; },
    get lastError() { return lastError; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
