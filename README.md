# 🥊 Coach Boxeo

Reloj de boxeo + coach por voz que canta combinaciones **realizables**.

## Qué tiene
- **📋 Rutina** (nuevo): una sesión completa por bloques, cada uno con sus rounds, tiempos y tipo (con coach o solo reloj): calentamiento → técnica → sparring → saco → abdominales → estiramiento. Trae 3 rutinas listas; podés editar, reordenar, agregar bloques y guardarlas como tuyas. Los puntos cuentan solo los rounds con coach.
- **⏱ Reloj**: rounds, duración, descanso y preparación; campana al empezar y al terminar el round, aviso de 10 s, beeps 3‑2‑1. Sin voz.
- **🎙 Coach**: canta golpes (jab, cross, ganchos, uppers, al cuerpo), esquives y pasos. Modos **Clásico**, **Impredecible** (rounds de duración variable + ráfagas de "ritmo alto") y **Progresivo** (cada round más rápido y con menos descanso).
- Niveles Básico / Intermedio / Avanzado, ritmo (Relajado → Máximo), guardia ortodoxo/zurdo, llamar con nombres o números (1‑6).
- Lo que canta el coach también se ve en pantalla. Botón de pantalla completa para verlo de lejos.
- Ranking: **mundial**, **de tu grupo de amigos** (código compartido), y tus entrenos; por categoría y por período (hoy / esta semana desde el lunes / siempre). Avatar, y botón para **compartir una imagen** con tu resultado.
- Voz: usa primero las voces «Natural» del dispositivo (⭐) o un **pack de audios con voz neuronal** (ver abajo). Funciona como app instalable (PWA).

## Archivos
```
index.html            estructura
css/styles.css        diseño
js/config.js          modos, niveles, ritmos, presets y fórmula de puntos
js/combos.js          biblioteca de combos + generador + VALIDADOR
js/coach.js           cuándo y qué canta el coach
js/timer.js           motor del reloj (fases)
js/audio.js           campana, aviso 10 s, beeps
js/voice.js           voz (dispositivo + pack de audios)
js/ranking.js         Firebase + ranking
js/firebase-config.js TU configuración de Firebase
js/ui.js, main.js     pantalla
firestore.rules       reglas de seguridad del ranking
tests/combos.test.js  prueba de que todo lo cantado es posible
tools/generar_voz.py  genera el pack de audios (voz neuronal)
tools/frases.json     frases que dice el coach
```

## Esquives (cómo los canta el coach)
Hay tres defensas, cada una contra un golpe concreto:
- **Esquive al jab** → la cabeza sale **por afuera** del golpe: guardia ortodoxa = a tu **derecha** (zurdo = izquierda). Después puede salir un cross, gancho de atrás o upper de atrás.
- **Esquive al cross** → ortodoxo = a tu **izquierda** (zurdo = derecha). Después sale gancho o upper de adelante.
- **Agachada** → para pasar por debajo de un gancho; se sube con gancho o upper.

En *Ajustes → Cómo canta el esquive* elegís qué dice la voz: **Golpe y lado** («esquive al jab, derecha»), **Solo golpe** o **Solo lado**. En pantalla siempre se ve completo, con una flecha. El validador no deja que después de un esquive salga un golpe que no se puede tirar desde esa posición.

## Voz más natural
1. **Gratis y sin hacer nada:** abrí la app en **Microsoft Edge**: trae voces «Natural» (ej. *Elena Online (Natural) – Spanish (Argentina)*). Aparecen primero y con ⭐.
2. **Pack de audios (voz neuronal, sin demora):**
   ```
   pip install edge-tts
   python3 tools/generar_voz.py                    # voz argentina femenina
   python3 tools/generar_voz.py es-AR-TomasNeural  # masculina
   ```
   Crea `Sonidos/voz/*.mp3`. Después, en Ajustes → *Tipo de voz* → *Pack de audios*. Se genera una sola vez (necesita internet solo para eso). Si falta una frase (por ejemplo el nombre de un bloque de tu rutina), usa la voz del dispositivo.

## Ranking mejorado
- **Mi grupo:** inventá un código (ej. `gym-pepe`) y pasáselo a tus amigos; al subir un resultado con ese código, aparecen en «Mi grupo». El código no es una contraseña: quien lo sepa puede verlo.
- **Esta semana** arranca el lunes. Hoy / semana consultan solo lo reciente, así no dependen de los récords históricos.
- Si actualizás desde la v1, **volvé a pegar `firestore.rules`** (ahora incluyen avatar y grupo).
- Validar los puntos en un servidor (Cloud Functions) requiere el plan Blaze de Firebase; no está incluido.

## Cómo usarlo
Abrilo desde un servidor (no con doble clic): `python3 -m http.server` en esta carpeta y entrá a `http://localhost:8000`, o subilo a GitHub Pages / Firebase Hosting.

## Activar el ranking mundial (Firebase)
1. En [console.firebase.google.com](https://console.firebase.google.com) creá un proyecto (o usá uno existente).
2. **Build → Firestore Database → Crear base de datos** (modo producción).
3. **Build → Authentication → Comenzar → Anónimo → Habilitar.**
4. **Firestore → Reglas**: pegá el contenido de `firestore.rules` y **Publicar**.
5. **Configuración del proyecto → Tus apps → Web (`</>`)**: copiá `firebaseConfig` y pegalo en `js/firebase-config.js`.
6. **Authentication → Configuración → Dominios autorizados**: agregá el dominio donde lo publiques (ej. `tuusuario.github.io`).

Sin configurar, todo funciona igual con ranking local. El ranking mundial trae los 100 mejores y filtra por categoría/período en el navegador, así no hace falta crear índices.

**Límite honesto:** los puntos se calculan en el celular, así que alguien técnico podría mandar datos falsos. Las reglas ponen topes razonables, pero para una competencia seria habría que validar en un servidor (Cloud Functions).

## Puntos
`(10 por minuto trabajado + 20 por round completado) × modo (1 / 1,25 / 1,5) × nivel (1 / 1,15 / 1,3)`. Solo cuenta el modo Coach.

## Personalizar combos
En `js/combos.js`, listas `RAW`. Cada combo es una lista de golpes: `1` jab, `2` cross, `3`/`4` gancho adelante/atrás, `5`/`6` upper, `3b` gancho al cuerpo, `sj` esquive al jab, `sc` esquive al cross, `d` agachada, `mL mR mB mF` pasos. Después corré `node tests/combos.test.js`: si agregás algo imposible (p. ej. `2 2`), el test te avisa.
La pronunciación de la voz ("jab" → "yab") está en `SPEECH_FIX`.
