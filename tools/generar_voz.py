#!/usr/bin/env python3
"""
Genera el PACK DE AUDIOS del coach con una voz neuronal gratuita (Microsoft Edge TTS).

Uso (en la carpeta del proyecto):
    pip install edge-tts
    python3 tools/generar_voz.py                    # voz argentina de mujer (Elena)
    python3 tools/generar_voz.py es-AR-TomasNeural  # voz argentina de hombre
    python3 tools/generar_voz.py es-ES-AlvaroNeural --rate=+10%

Crea Sonidos/voz/*.mp3 y Sonidos/voz/manifest.json. Después, en la app:
Ajustes → Voz → "Tipo de voz" → "Pack de audios".

Requiere internet SOLO al generarlo; después la app funciona sin conexión.
Si un clip falta, la app usa la voz del dispositivo para esa frase.
Para ver voces disponibles:  edge-tts --list-voices | grep es-
"""
import asyncio, json, sys, pathlib

try:
    import edge_tts
except ImportError:
    sys.exit("Falta la librería: pip install edge-tts")

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "Sonidos" / "voz"
args = [a for a in sys.argv[1:] if not a.startswith("--")]
VOICE = args[0] if args else "es-AR-ElenaNeural"
RATE = next((a.split("=", 1)[1] for a in sys.argv[1:] if a.startswith("--rate=")), "+0%")


async def main():
    frases = json.loads((ROOT / "tools" / "frases.json").read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)
    ok = []
    for f in frases:
        path = OUT / f"{f['key']}.mp3"
        try:
            await edge_tts.Communicate(f["say"], VOICE, rate=RATE).save(str(path))
            ok.append(f["key"])
            print("✓", f["text"])
        except Exception as e:  # sigue con las demás
            print("✗", f["text"], e)
    (OUT / "manifest.json").write_text(json.dumps({"voice": VOICE, "clips": ok}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\nListo: {len(ok)}/{len(frases)} clips en {OUT}")


asyncio.run(main())
