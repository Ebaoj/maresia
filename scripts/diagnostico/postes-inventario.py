#!/usr/bin/env python3
"""O inventario dos postes do mundo (docs/mapa-1932.md, v16): tudo que e poste, lampiao, fio ou haste, contado e
posto no mapa, ANTES e DEPOIS.

A entrada e o JSON que o item "inventario" de scripts/fotos-escala.mjs devolve (o jogo rodando: cada malha cujo
nome fala de poste, lampiao, fio, telegrafo, parada ou bonde, com o lon/lat de cada copia).

uso: python3 scripts/diagnostico/postes-inventario.py ANTES.json DEPOIS.json SAIDA.png SAIDA.md
"""
import json
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFont

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# o que cada malha e (o nome no jogo -> a categoria do inventario)
CATEGORIAS = [
    ("vida-postes-bonde", "poste do bonde (Light, eletrico)", (220, 30, 30)),
    ("vida-fio-bonde", "fio aereo do bonde (eletrico)", (220, 30, 30)),
    ("paradas-bonde", "placa da parada do bonde", (240, 120, 0)),
    ("ferrovia-telegrafo", "poste de telegrafo da via ferrea", (30, 90, 220)),
    ("lampioes-coluna", "lampiao a gas de coluna (rua)", (60, 150, 60)),
    ("lampioes", "lampiao a gas de parede (fachada)", (150, 200, 120)),
    ("marcos-lamp", "lampiao a gas das pracas (marcos)", (20, 110, 40)),
]
JANELA = (-38.575, -38.505, -3.75, -3.712)


def categoria(nome):
    for chave, rotulo, cor in CATEGORIAS:
        if nome == chave or nome == chave + "-vidro":
            return chave, rotulo, cor
    return None


def painel(inv, lotes, titulo):
    W, H = 1100, 600
    img = Image.new("RGB", (W, H), (250, 248, 242))
    d = ImageDraw.Draw(img)
    lo0, lo1, la0, la1 = JANELA

    def P(lon, lat):
        return ((lon - lo0) / (lo1 - lo0) * W, (la1 - lat) / (la1 - la0) * H)

    for f in lotes["fachadas"]:
        d.line([P(f[1], f[2]), P(f[3], f[4])], fill=(180, 180, 180))
    for nome, v in inv.items():
        c = categoria(nome)
        if not c or nome.endswith("-vidro"):
            continue
        for lon, lat in v["pos"]:
            x, y = P(lon, lat)
            if 0 <= x < W and 0 <= y < H:
                d.ellipse([x - 1.5, y - 1.5, x + 1.5, y + 1.5], fill=c[2])
    try:
        fonte = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 16)
    except OSError:
        fonte = ImageFont.load_default()
    d.rectangle([0, 0, W, 24], fill=(255, 255, 255))
    d.text((8, 3), titulo, fill=(0, 0, 0), font=fonte)
    y = 30
    for chave, rotulo, cor in CATEGORIAS:
        n = inv.get(chave, {}).get("n", 0)
        d.rectangle([8, y + 3, 18, y + 13], fill=cor)
        d.text((24, y), f"{rotulo}: {n}", fill=(0, 0, 0), font=fonte)
        y += 20
    return img


def main():
    antes, depois = (json.load(open(a)) for a in sys.argv[1:3])
    lotes = json.load(open(os.path.join(RAIZ, "src", "mundo", "mapa1932-lotes.json")))
    a = painel(antes, lotes, "ANTES (a764f60): postes, lampioes e fios")
    b = painel(depois, lotes, "DEPOIS: postes, lampioes e fios")
    folha = Image.new("RGB", (a.width, a.height * 2 + 10), (255, 255, 255))
    folha.paste(a, (0, 0))
    folha.paste(b, (0, a.height + 10))
    folha.save(sys.argv[3])
    linhas = ["| o que | antes | depois |", "|---|---|---|"]
    for chave, rotulo, _ in CATEGORIAS:
        linhas.append(f"| {rotulo} (`{chave}`) | {antes.get(chave, {}).get('n', 0)} | {depois.get(chave, {}).get('n', 0)} |")
    outros = sorted(set(antes) | set(depois))
    outros = [k for k in outros if not categoria(k)]
    for k in outros:
        linhas.append(f"| outro: `{k}` | {antes.get(k, {}).get('n', 0)} | {depois.get(k, {}).get('n', 0)} |")
    open(sys.argv[4], "w").write("\n".join(linhas) + "\n")
    print("\n".join(linhas))


if __name__ == "__main__":
    main()
