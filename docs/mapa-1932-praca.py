#!/usr/bin/env python3
"""Maresia - a Praca do Ferreira em 1932 a partir do raster oficial.

Le src/mundo/mapa1932-malha.png (3 m por pixel, feito da camada "Evolucao Urbana
1932" da Prefeitura), separa a mancha publica da praca e escreve o contorno dela
em longitude/latitude, para o motor ler (src/mundo/praca1932.js).

A ideia: a praca e o unico pedaco grande de "rua" (sem lote) no meio do tecido
construido. A distancia de cada pixel de rua ate o lote mais proximo diz onde
esta o vazio largo (a praca) e onde esta a rua estreita.

Uso:  python3 docs/mapa-1932-praca.py
"""
import json
import math
import os
from collections import deque

from PIL import Image

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAST = os.path.join(RAIZ, "src", "mundo", "mapa1932-malha.png")
DADOS = os.path.join(RAIZ, "src", "mundo", "mapa1932-dados.json")
SAIDA = os.path.join(RAIZ, "src", "mundo", "praca1932.json")

CENTRO_LON = -38.5276
CENTRO_LAT = -3.7275


def carregar():
    dados = json.load(open(DADOS))
    im = Image.open(RAST).convert("RGB")
    j = dados["janela"]
    lotes = json.load(open(os.path.join(RAIZ, "src", "mundo", "mapa1932-lotes.json")))
    rua = tuple(int(lotes["cor_rua"][i:i + 2], 16) for i in (1, 3, 5))
    fundo = (244, 236, 216)
    return dados, im, j, rua, fundo


def mascara(im, j, rua, fundo):
    """classifica cada pixel: 0 = fundo, 1 = rua, 2 = lote"""
    w, h = im.size
    px = im.load()
    m = bytearray(w * h)
    for y in range(h):
        for x in range(w):
            c = px[x, y]
            if c == fundo:
                m[y * w + x] = 0
            elif c == rua:
                m[y * w + x] = 1
            else:
                m[y * w + x] = 2
    return m, w, h


def distancia_ate_lote(m, w, h):
    """BFS multi-origem: distancia (em pixels) de cada pixel de rua ate o lote mais proximo"""
    INF = 1 << 30
    d = [INF] * (w * h)
    fila = deque()
    for i, v in enumerate(m):
        if v != 1:
            d[i] = 0
            fila.append(i)
    while fila:
        i = fila.popleft()
        dv = d[i] + 1
        x, y = i % w, i // w
        for jx, jy in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= jx < w and 0 <= jy < h:
                k = jy * w + jx
                if dv < d[k]:
                    d[k] = dv
                    fila.append(k)
    return d


def para_ll(px, py, j):
    lon = j["lon_min"] + (px / j["pixels"][0]) * (j["lon_max"] - j["lon_min"])
    lat = j["lat_max"] - (py / j["pixels"][1]) * (j["lat_max"] - j["lat_min"])
    return [round(lon, 7), round(lat, 7)]


def main():
    dados, im, j, rua, fundo = carregar()
    m, w, h = mascara(im, j, rua, fundo)
    d = distancia_ate_lote(m, w, h)

    cx = (CENTRO_LON - j["lon_min"]) / (j["lon_max"] - j["lon_min"]) * j["pixels"][0]
    cy = (j["lat_max"] - CENTRO_LAT) / (j["lat_max"] - j["lat_min"]) * j["pixels"][1]
    print("centro da praca no raster: %.1f %.1f" % (cx, cy))

    # o vazio largo: a praca e onde a rua esta longe do lote
    for lim in (3, 4, 5, 6, 8):
        print("limiar %2d px (%2d m): %d pixels" % (lim, lim * 3, sum(1 for i, v in enumerate(m) if v == 1 and d[i] > lim)))

    # o contorno radial: do centro, em cada angulo, ate onde a praca ainda e larga
    # (a razao: um pixel de rua e "da praca" enquanto a distancia ao lote for grande;
    # a rua estreita que sai da praca tem distancia pequena e corta a linha)
    ANG = 72
    limiar = 5  # pixels (15 m): dentro disso e rua, nao praca
    contorno = []
    raios = []
    for k in range(ANG):
        ang = 2 * math.pi * k / ANG
        dx, dy = math.cos(ang), math.sin(ang)
        ultimo = None
        r = 0.0
        while r < 70:
            x = int(round(cx + dx * r))
            y = int(round(cy + dy * r))
            if not (0 <= x < w and 0 <= y < h):
                break
            i = y * w + x
            if m[i] != 1:
                break  # lote ou vazio: a praca acabou
            if d[i] <= limiar:
                break  # aqui ja e a rua estreita que sai da praca
            ultimo = (x, y)
            r += 0.5
        raios.append(r)
        contorno.append(ultimo)
    print("raio da praca: min %.1f max %.1f medio %.1f px (%.0f a %.0f m)" % (
        min(raios), max(raios), sum(raios) / len(raios), min(raios) * 3, max(raios) * 3))

    # imprime o mapa do "da praca" (X) e do "coracao" (o) para conferir
    print("\n--- mapa: '.' vazio, '=' rua, '#' lote, 'X' rua larga (da praca) ---")
    for y in range(int(cy) - 40, int(cy) + 41, 2):
        linha = ""
        for x in range(int(cx) - 40, int(cx) + 41, 1):
            i = y * w + x
            if m[i] == 0:
                linha += "."
            elif m[i] == 2:
                linha += "#"
            elif d[i] > limiar:
                linha += "X"
            else:
                linha += "="
        print("%4d %s" % (y, linha))

    ll_contorno = [para_ll(x, y, j) for x, y in contorno]

    # a area do contorno, em metros reais (para comparar com os 7.603 m2 que o
    # Wikipedia da em area da Praca do Ferreira)
    MX = 111320.0 * math.cos(math.radians(CENTRO_LAT))
    MZ = 110574.0
    xs = [(ll[0] - CENTRO_LON) * MX for ll in ll_contorno]
    zs = [-(ll[1] - CENTRO_LAT) * MZ for ll in ll_contorno]
    area = 0.0
    for i in range(len(xs)):
        a, b = i, (i + 1) % len(xs)
        area += xs[a] * zs[b] - xs[b] * zs[a]
    area = abs(area) / 2
    print("area do contorno: %.0f m2 (o Wikipedia da 7.603 m2)" % area)

    out = {
        "fonte": "src/mundo/mapa1932-malha.png (camada oficial 'Evolucao Urbana 1932' da Prefeitura de Fortaleza)",
        "nota": "Contorno da mancha publica da Praca do Ferreira em 1932, tirado do raster oficial: "
                "em cada direcao, o ultimo pixel que ainda e praça larga (longe do lote). "
                "A praca e a area publica do centro; a borda e a testada dos quarteiroes.",
        "contorno": ll_contorno,
        "centro": [CENTRO_LON, CENTRO_LAT],
    }
    json.dump(out, open(SAIDA, "w"), ensure_ascii=False, indent=1)
    print("\nescrito", SAIDA)


if __name__ == "__main__":
    main()
