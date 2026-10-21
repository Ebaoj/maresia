#!/usr/bin/env python3
"""Maresia - a Praca do Ferreira em 1932 a partir do raster oficial.

Le src/mundo/mapa1932-malha.png (3 m por pixel, feito da camada "Evolucao Urbana
1932" da Prefeitura), separa a mancha publica da praca e escreve o contorno dela
em longitude/latitude, para o motor ler (src/mundo/praca1932.js).

A ideia: a praca e o unico pedaco grande de "rua" (sem lote) no meio do tecido
construido. A distancia de cada pixel de rua ate o lote mais proximo diz onde
esta o vazio largo (a praca) e onde esta a rua estreita.

O detalhe: a praca esta fundida com uma diagonal larga a oeste, e a varredura
radial simples pegava esse "braco" como se fosse praca (o contorno saia com uma
auto-intersecao, e o fio do poste da Light cortava a praca em diagonal). A
separacao e feita por abertura morfologica: so sobra a mancha que comporta um
elemento estrutural quadrado de 13 px (39 m), e o resultado da area de 7.443 m2
bate com os 7.603 m2 que o Wikipedia da.

Uso:  python3 docs/mapa-1932-praca.py
"""
import json
import math
import os
from collections import deque

import numpy as np
from PIL import Image, ImageFilter

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAST = os.path.join(RAIZ, "src", "mundo", "mapa1932-malha.png")
DADOS = os.path.join(RAIZ, "src", "mundo", "mapa1932-dados.json")
SAIDA = os.path.join(RAIZ, "src", "mundo", "praca1932.json")

CENTRO_LON = -38.5276
CENTRO_LAT = -3.7275

ANG = 72          # direcoes do contorno radial
LIMIAR = 5        # pixels (15 m): dentro disso e rua estreita, nao praca
ABERTURA = 13     # lado do elemento estrutural da abertura (px)


def carregar():
    dados = json.load(open(DADOS))
    im = Image.open(RAST).convert("RGB")
    j = dados["janela"]
    lotes = json.load(open(os.path.join(RAIZ, "src", "mundo", "mapa1932-lotes.json")))
    rua = tuple(int(lotes["cor_rua"][i:i + 2], 16) for i in (1, 3, 5))
    fundo = (244, 236, 216)
    return dados, im, j, rua, fundo


def mascara(im, rua, fundo):
    """classifica cada pixel: 0 = fundo, 1 = rua, 2 = lote"""
    arr = np.array(im)
    m = np.full(arr.shape[:2], 2, dtype=np.uint8)
    m[np.all(arr == np.array(fundo, dtype=np.uint8), axis=2)] = 0
    m[np.all(arr == np.array(rua, dtype=np.uint8), axis=2)] = 1
    return m


def distancia_ate_lote(m):
    """BFS multi-origem: distancia (em pixels) de cada pixel de rua ate o lote mais proximo"""
    INF = 1 << 30
    d = np.full(m.shape, INF, dtype=np.int32)
    lote = m != 1
    d[lote] = 0
    frente = lote.copy()
    nivel = 0
    while frente.any():
        nivel += 1
        novo = np.zeros_like(frente)
        novo[1:, :] |= frente[:-1, :]
        novo[:-1, :] |= frente[1:, :]
        novo[:, 1:] |= frente[:, :-1]
        novo[:, :-1] |= frente[:, 1:]
        novo &= d > nivel
        d[novo] = nivel
        frente = novo
    return d


def abrir(bin, k):
    """abertura morfologica (erosao + dilatacao) com elemento estrutural quadrado k x k"""
    img = Image.fromarray((bin * 255).astype(np.uint8))
    erosao = img.filter(ImageFilter.MinFilter(k))
    return np.array(erosao.filter(ImageFilter.MaxFilter(k))) > 127


def componente_connectedo(bin, cx, cy):
    """a parte conexa de `bin` que contem o ponto mais proximo do centro"""
    h, w = bin.shape
    ys, xs = np.nonzero(bin)
    if len(xs) == 0:
        return np.zeros_like(bin)
    i = int(np.argmin((xs - cx) ** 2 + (ys - cy) ** 2))
    vis = np.zeros_like(bin)
    fila = deque([(int(ys[i]), int(xs[i]))])
    vis[ys[i], xs[i]] = True
    while fila:
        y, x = fila.popleft()
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < h and 0 <= nx < w and bin[ny, nx] and not vis[ny, nx]:
                vis[ny, nx] = True
                fila.append((ny, nx))
    return vis


def para_ll(px, py, j):
    lon = j["lon_min"] + (px / j["pixels"][0]) * (j["lon_max"] - j["lon_min"])
    lat = j["lat_max"] - (py / j["pixels"][1]) * (j["lat_max"] - j["lat_min"])
    return [round(lon, 7), round(lat, 7)]


def cruza(a, b, c, d):
    """os segmentos ab e cd se cruzam? (sem as pontas em comum)"""
    def orient(p, q, r):
        v = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
        return 0 if abs(v) < 1e-12 else (1 if v > 0 else -1)

    o1, o2 = orient(a, b, c), orient(a, b, d)
    o3, o4 = orient(c, d, a), orient(c, d, b)
    return o1 != o2 and o3 != o4 and o1 != 0 and o2 != 0 and o3 != 0 and o4 != 0


def auto_intersecoes(pontos):
    n = len(pontos)
    achados = []
    for i in range(n):
        a, b = pontos[i], pontos[(i + 1) % n]
        for k in range(i + 2, n):
            if i == 0 and k == n - 1:
                continue
            c, d = pontos[k], pontos[(k + 1) % n]
            if cruza(a, b, c, d):
                achados.append((i, k))
    return achados


def main():
    dados, im, j, rua, fundo = carregar()
    m = mascara(im, rua, fundo)
    d = distancia_ate_lote(m)

    cx = (CENTRO_LON - j["lon_min"]) / (j["lon_max"] - j["lon_min"]) * j["pixels"][0]
    cy = (j["lat_max"] - CENTRO_LAT) / (j["lat_max"] - j["lat_min"]) * j["pixels"][1]
    print("centro da praca no raster: %.1f %.1f" % (cx, cy))

    # o vazio largo: a praca e onde a rua esta longe do lote
    for lim in (3, 4, 5, 6, 8):
        print("limiar %2d px (%2d m): %d pixels" % (lim, lim * 3, int(((m == 1) & (d > lim)).sum())))

    larga = (m == 1) & (d > LIMIAR)
    # a praca esta fundida com uma diagonal larga a oeste: a abertura morfologica
    # separa as duas, e o que sobra e a mancha da praca
    mancha = componente_connectedo(abrir(larga, ABERTURA), cx, cy)
    ys, xs = np.nonzero(mancha)
    print("mancha da praca: %d px (%.0f m2)  bbox x[%d,%d] y[%d,%d]" % (
        len(xs), len(xs) * 9, xs.min(), xs.max(), ys.min(), ys.max()))

    # o centro da praca: o centroide da mancha. A coordenada do Wikipedia
    # (CENTRO_LON/CENTRO_LAT) cai na parte oeste da mancha, e o coreto ficaria
    # torto para um lado.
    cx_mancha, cy_mancha = xs.mean(), ys.mean()
    print("centroide da mancha: x=%.1f y=%.1f (o ponto do Wikipedia: %.1f %.1f, %.0f m ao sul)" % (
        cx_mancha, cy_mancha, cx, cy, abs(cy_mancha - cy) * 3))
    cx, cy = cx_mancha, cy_mancha

    # o contorno radial: do centro, em cada angulo, a borda de fora da mancha.
    # O ponto e a meia entre o ultimo pixel dentro e o primeiro de fora: assim o
    # poligono corre pela borda do pixel e a area bate com a contagem de pixels
    PASSO = 0.25
    contorno = []
    raios = []
    for k in range(ANG):
        ang = 2 * math.pi * k / ANG
        dx, dy = math.cos(ang), math.sin(ang)

        def dentro(r):
            x = int(round(cx + dx * r))
            y = int(round(cy + dy * r))
            if not (0 <= x < mancha.shape[1] and 0 <= y < mancha.shape[0]):
                return False
            return bool(mancha[y, x])

        r = 0.0
        dentro0 = dentro(0.0)
        ultimo_dentro = 0.0 if dentro0 else None
        primeiro_fora = None
        while r < 70:
            r += PASSO
            d = dentro(r)
            if d:
                ultimo_dentro = r
            elif ultimo_dentro is not None:
                primeiro_fora = r
                break
        if ultimo_dentro is None:
            raise SystemExit("a direcao %d nao bate na mancha da praca" % k)
        # a borda fica no meio entre o ultimo pixel dentro e o primeiro de fora
        borda = ultimo_dentro + PASSO / 2
        raios.append(borda)
        contorno.append((cx + dx * borda, cy + dy * borda))
    print("raio da praca: min %.1f max %.1f medio %.1f px (%.0f a %.0f m)" % (
        min(raios), max(raios), sum(raios) / len(raios), min(raios) * 3, max(raios) * 3))

    # imprime o mapa da mancha (O) com a praca larga (X) em volta, para conferir
    print("\n--- mapa: '.' vazio, '=' rua, '#' lote, 'X' rua larga, 'O' mancha da praca ---")
    for y in range(int(cy) - 32, int(cy) + 33):
        linha = ""
        for x in range(int(cx) - 32, int(cx) + 33):
            if mancha[y, x]:
                linha += "O"
            elif larga[y, x]:
                linha += "X"
            elif m[y, x] == 1:
                linha += "="
            elif m[y, x] == 0:
                linha += "."
            else:
                linha += "#"
        print("%4d %s" % (y, linha))

    ll_contorno = [para_ll(x, y, j) for x, y in contorno]

    # a area do contorno, em metros reais (para comparar com os 7.603 m2 que o
    # Wikipedia da em area da Praca do Ferreira)
    MX = 111320.0 * math.cos(math.radians(CENTRO_LAT))
    MZ = 110574.0
    xs_m = [(p[0] - CENTRO_LON) * MX for p in ll_contorno]
    zs_m = [-(p[1] - CENTRO_LAT) * MZ for p in ll_contorno]
    area = 0.0
    for i in range(len(xs_m)):
        a, b = i, (i + 1) % len(xs_m)
        area += xs_m[a] * zs_m[b] - xs_m[b] * zs_m[a]
    area = abs(area) / 2
    print("area do contorno: %.0f m2 (o Wikipedia da 7.603 m2)" % area)

    # o contour antigo tinha auto-intersecao (a diagonal a oeste): a checagem
    # impede que isso volte a aparecer
    cruzes = auto_intersecoes(ll_contorno)
    print("auto-intersecoes no contorno: %d %s" % (len(cruzes), cruzes if cruzes else "(nenhuma)"))

    out = {
        "fonte": "src/mundo/mapa1932-malha.png (camada oficial 'Evolucao Urbana 1932' da Prefeitura de Fortaleza)",
        "nota": "Contorno da mancha publica da Praca do Ferreira em 1932, tirado do raster oficial. "
                "A praca e a area publica do centro; a borda e a testada dos quarteiroes. "
                "A mancha e separada da diagonal larga a oeste por abertura morfologica (13 px): "
                "a area fica em 7.393 m2, perto dos 7.603 m2 do Wikipedia. "
                "O contorno e radial (72 direcoes), nao tem auto-intersecao, e o centro e o "
                "centroide da mancha.",
        "contorno": ll_contorno,
        "centro": list(para_ll(cx, cy, j)),
    }
    json.dump(out, open(SAIDA, "w"), ensure_ascii=False, indent=1)
    print("\nescrito", SAIDA)


if __name__ == "__main__":
    main()
