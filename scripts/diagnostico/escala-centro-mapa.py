#!/usr/bin/env python3
"""O mapa da escala (docs/mapa-1932.md, v16): a escala local e a anisotropia, ANTES em cima e DEPOIS embaixo.

Le o que scripts/diagnostico/escala-centro.mjs escreveu (escala-<rotulo>.json/.esc/.ani) e desenha, no quadro
da grade (u para a direita, v para cima, 10 m por pixel), com as testadas de 1932 por cima:
  - a escala local (unidades de jogo por metro de verdade): branco = 1:1, cada faixa de cor um fator de 2;
  - a anisotropia (a direcao que mais estica sobre a que menos estica): verde = 1, amarelo = 1,5, vermelho >= 3.

uso: python3 scripts/diagnostico/escala-centro-mapa.py PASTA_DOS_DADOS SAIDA.png
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PRACA_LON, PRACA_LAT = -38.5275014, -3.7274448
M_LON = 111320 * math.cos(PRACA_LAT * math.pi / 180)
M_LAT = 110574
PSI = (72.19 - 90) * math.pi / 180
CU, SU = math.cos(PSI), math.sin(PSI)


def uv(lon, lat):
    e = (lon - PRACA_LON) * M_LON
    n = (lat - PRACA_LAT) * M_LAT
    return e * CU + n * SU, -e * SU + n * CU


def carregar(pasta, rotulo):
    m = json.load(open(os.path.join(pasta, f"escala-{rotulo}.json")))
    esc = np.fromfile(os.path.join(pasta, f"escala-{rotulo}.esc"), np.float32).reshape(m["H"], m["W"])
    ani = np.fromfile(os.path.join(pasta, f"escala-{rotulo}.ani"), np.float32).reshape(m["H"], m["W"])
    return m, esc, ani


def cor_escala(esc):
    # log2 da escala: 0 (1:1) branco, -1 (2x comprimido) amarelo, -2 laranja, -3 vermelho, -4 roxo
    t = np.clip(-np.log2(np.maximum(esc, 1e-6)), 0, 4.5)
    paleta = np.array([[250, 250, 245], [245, 220, 120], [235, 150, 60], [205, 70, 50], [120, 40, 110], [40, 20, 70]], float)
    i = np.minimum(np.floor(t).astype(int), 4)
    f = (t - i)[..., None]
    rgb = paleta[i] * (1 - f) + paleta[i + 1] * f
    # as curvas de nivel (cada fator de 2): uma linha escura
    frac = t - np.round(t)
    rgb[(np.abs(frac) < 0.03) & (t > 0.5)] *= 0.55
    return rgb


def cor_aniso(ani):
    t = np.clip(np.log(np.maximum(ani, 1)) / math.log(3), 0, 1)
    r = np.clip(2 * t, 0, 1) * 255
    g = np.clip(2 - 2 * t, 0, 1) * 220
    return np.stack([r, g, 60 * (1 - t)], -1)


def painel(m, rgb, titulo, lotes, dados):
    img = Image.fromarray(rgb.astype(np.uint8))
    d = ImageDraw.Draw(img)

    def P(u, v):
        return ((u - m["u0"]) / m["px"], (m["v1"] - v) / m["px"])

    for f in lotes["fachadas"]:
        d.line([P(*uv(f[1], f[2])), P(*uv(f[3], f[4]))], fill=(30, 30, 30))
    d.line([P(*uv(a, b)) for a, b in dados["costa"]], fill=(0, 120, 200), width=2)
    for g in range(-6000, 3001, 1000):
        d.line([P(g, m["v0"]), P(g, m["v1"])], fill=(150, 150, 150))
    for g in range(-3000, 2401, 1000):
        d.line([P(m["u0"], g), P(m["u1"], g)], fill=(150, 150, 150))
    try:
        fonte = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 22)
    except OSError:
        fonte = ImageFont.load_default()
    d.rectangle([0, 0, 900, 34], fill=(255, 255, 255))
    d.text((8, 5), titulo, fill=(0, 0, 0), font=fonte)
    return img


def main():
    pasta, saida = sys.argv[1], sys.argv[2]
    lotes = json.load(open(os.path.join(RAIZ, "src", "mundo", "mapa1932-lotes.json")))
    dados = json.load(open(os.path.join(RAIZ, "src", "mundo", "mapa1932-dados.json")))
    linhas = []
    for rotulo, nome in (("antes", os.environ.get("NOME_ANTES", "ANTES (a764f60)")), ("agora", "DEPOIS")):
        m, esc, ani = carregar(pasta, rotulo)
        linhas.append([
            painel(m, cor_escala(esc), f"{nome}: escala local (branco 1:1; cada cor, mais 2x comprimido)", lotes, dados),
            painel(m, cor_aniso(ani), f"{nome}: anisotropia (verde 1, amarelo 1,7, vermelho 3+)", lotes, dados),
        ])
    w, h = linhas[0][0].size
    folha = Image.new("RGB", (2 * w + 10, 2 * h + 10), (255, 255, 255))
    for i, (a, b) in enumerate(linhas):
        folha.paste(a, (0, i * (h + 10)))
        folha.paste(b, (w + 10, i * (h + 10)))
    folha.save(saida)
    print("escrito", saida, folha.size)


if __name__ == "__main__":
    main()
