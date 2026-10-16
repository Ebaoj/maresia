"""Atualiza o que o visor mostra. Uso:
.venv/bin/python visor/estado.py "texto" --glb saida/x.glb --img "saida/a.png|legenda" --img ...
"""
import argparse, json, time
from pathlib import Path
p = argparse.ArgumentParser(); p.add_argument("texto"); p.add_argument("--glb"); p.add_argument("--img", action="append", default=[])
a = p.parse_args()
destino = Path(__file__).parent / "estado.json"
anterior = json.loads(destino.read_text()) if destino.exists() else {}
imgs = [dict(zip(("arquivo", "legenda"), (i.split("|", 1) + [""])[:2])) for i in a.img] or anterior.get("imagens", [])
destino.write_text(json.dumps({"texto": a.texto, "glb": a.glb or anterior.get("glb"), "imagens": imgs,
                               "atualizado": time.strftime("%H:%M:%S")}, ensure_ascii=False, indent=1))
