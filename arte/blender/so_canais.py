# Deixa em cada animação de um .glb só os canais dos ossos que ela deve mexer (o exportador do Blender põe todos os
# ossos em toda animação, e aí um clipe do rabo travaria o corpo no repouso). Regras: rabo_* -> tail0..tail6,
# orelha_* -> ossos ear_*; outras animações saem do arquivo. Edita só o JSON do glb; o bloco binário fica igual.
# Uso: python3 so_canais.py ARQUIVO.glb
import json, struct, sys, re

arq = sys.argv[1]
b = open(arq, "rb").read()
assert b[:4] == b"glTF"
n_json = struct.unpack("<I", b[12:16])[0]
j = json.loads(b[20:20 + n_json]); resto = b[20 + n_json:]
nos = j["nodes"]
REGRAS = {"rabo_": re.compile(r"^tail[0-6]$"), "orelha_": re.compile(r"^ear_(left|right)_[01]$")}
novas = []
for an in j.get("animations", []):
    regra = next((r for p, r in REGRAS.items() if an["name"].startswith(p)), None)
    if regra is None: print("removida:", an["name"]); continue
    canais = [c for c in an["channels"] if regra.match(nos[c["target"]["node"]].get("name", ""))]
    usados = sorted({c["sampler"] for c in canais}); mapa = {s: i for i, s in enumerate(usados)}
    an["samplers"] = [an["samplers"][s] for s in usados]
    for c in canais: c["sampler"] = mapa[c["sampler"]]
    an["channels"] = canais; novas.append(an)
    print(f"{an['name']}: {len(canais)} canais em {sorted({nos[c['target']['node']]['name'] for c in canais})}")
j["animations"] = novas
txt = json.dumps(j, separators=(",", ":")).encode()
txt += b" " * ((4 - len(txt) % 4) % 4)
total = 12 + 8 + len(txt) + len(resto)
open(arq, "wb").write(b"glTF" + struct.pack("<II", 2, total) + struct.pack("<I", len(txt)) + b"JSON" + txt + resto)
