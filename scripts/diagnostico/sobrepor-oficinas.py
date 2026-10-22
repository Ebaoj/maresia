#!/usr/bin/env python3
"""A planta por cima da vista de cima do jogo, com as linhas (docs/mapa-1932.md, v17; branch cidade-ajustes).

Como scripts/diagnostico/sobrepor-planta.py (o contorno dos lotes da planta oficial de 1932, mapa1932-malha.png), e
mais, desenhados pela mesma transformada do jogo (NOME.lonlat de sobrepor-planta.mjs):
  - a via ferrea da Planta de 1931-1932 (ferrovia1932.json), em preto;
  - o recinto das Oficinas da RVC (ferrovia1932.json, "patios"), em magenta;
  - a cerca do Campo do Urubu (DADOS: o mapa1932-dados.json da versao da foto), em vermelho;
  - a costa de 1932 (DADOS, "costa"), em azul;
  - com --scan, o proprio scan da Planta de 1931-1932 em volta das oficinas (levado por uma afim local casada com os
    cantos do recinto e a ponta do desvio: 5,6 m por pixel, residuo de 13 a 21 m; longe das oficinas ela nao vale).

uso: python3 scripts/diagnostico/sobrepor-oficinas.py PASTA NOME SAIDA.png TITULO DADOS.json [--scan]
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from scipy.spatial import cKDTree

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCAN = os.path.expanduser("~/Projetos/marcos-1932-pesquisa/fotos/mapas/Planta_da_cidade_de_Fortaleza_1931-1932.png")
PRACA_LON, PRACA_LAT = -38.5275014, -3.7274448
M_LON = 111320 * math.cos(PRACA_LAT * math.pi / 180)
M_LAT = 110574
# a afim local do scan (pixel do scan -> metros leste/norte a partir da praca)
AFIM = np.array([[5.61257040, -0.908153069], [-0.663721266, -5.49474390], [-5026.54698, 1714.00500]])


def main():
    pasta, nome, saida, titulo, dados_arq = sys.argv[1:6]
    com_scan = "--scan" in sys.argv
    W, H = 640, 360
    ll = np.fromfile(os.path.join(pasta, nome + ".lonlat"), np.float32).reshape(H, W, 2).astype(float)
    dados = json.load(open(dados_arq))
    fer = json.load(open(os.path.join(RAIZ, "src", "mundo", "ferrovia1932.json")))
    jan = json.load(open(os.path.join(RAIZ, "src", "mundo", "mapa1932-dados.json")))["janela"]
    malha = np.array(Image.open(os.path.join(RAIZ, "src", "mundo", "mapa1932-malha.png")).convert("RGB")).astype(int)
    mh, mw = malha.shape[:2]
    px = ((ll[..., 0] - jan["lon_min"]) / (jan["lon_max"] - jan["lon_min"]) * jan["pixels"][0]).astype(int)
    py = ((jan["lat_max"] - ll[..., 1]) / (jan["lat_max"] - jan["lat_min"]) * jan["pixels"][1]).astype(int)
    dentro = (px >= 0) & (py >= 0) & (px < mw) & (py < mh)
    cor = np.zeros((H, W, 3), int)
    cor[dentro] = malha[py[dentro], px[dentro]]
    fundo = np.array([244, 236, 216])
    rua = np.array([0x4A, 0x55, 0x60])
    lote = dentro & (np.abs(cor - fundo).sum(-1) > 12) & (np.abs(cor - rua).sum(-1) > 12)
    m = Image.fromarray((lote * 255).astype(np.uint8))
    borda = (np.array(m.filter(ImageFilter.MaxFilter(3))) > 0) & ~(np.array(m.filter(ImageFilter.MinFilter(3))) > 0)
    foto = np.array(Image.open(os.path.join(pasta, nome + ".png")).convert("RGB").resize((W, H))).astype(float)
    if com_scan:
        sc = np.array(Image.open(SCAN).convert("L")).astype(float)
        # a tinta: o pixel bem mais escuro que o papel em volta (a mediana local tira manchas e dobras)
        fundo_sc = np.array(Image.fromarray(sc.astype(np.uint8)).filter(ImageFilter.MedianFilter(9))).astype(float)
        sc = np.clip(fundo_sc - sc, 0, 255)
        e = (ll[..., 0] - PRACA_LON) * M_LON - AFIM[2, 0]
        n = (ll[..., 1] - PRACA_LAT) * M_LAT - AFIM[2, 1]
        inv = np.linalg.inv(AFIM[:2])
        sx = e * inv[0, 0] + n * inv[1, 0]
        sy = e * inv[0, 1] + n * inv[1, 1]
        # so perto das oficinas (a afim foi casada ali): 900 m do meio do recinto
        perto = np.hypot(e + AFIM[2, 0] - (-38.56886 - PRACA_LON) * M_LON, n + AFIM[2, 1] - (-3.71483 - PRACA_LAT) * M_LAT) < 900
        ok = perto & (sx >= 0) & (sy >= 0) & (sx < sc.shape[1] - 1) & (sy < sc.shape[0] - 1)
        tinta = np.zeros((H, W))
        tinta[ok] = sc[sy[ok].astype(int), sx[ok].astype(int)]
        escuro = ok & (tinta > 28)
        foto[escuro] = foto[escuro] * 0.35 + np.array([40, 30, 20]) * 0.65
    foto[lote] = foto[lote] * 0.75 + np.array([255, 230, 120]) * 0.25
    foto[borda] = [220, 20, 20]
    img = Image.fromarray(foto.clip(0, 255).astype(np.uint8))
    d = ImageDraw.Draw(img)
    # lon/lat -> pixel: o pixel mais perto (em metros) na grade de lon/lat da foto
    arvore = cKDTree(np.stack([ll[..., 0].ravel() * M_LON, ll[..., 1].ravel() * M_LAT], 1))
    passo_px = np.median(np.hypot(np.diff(ll[0, :, 0]) * M_LON, np.diff(ll[0, :, 1]) * M_LAT))

    def linha(pts, cor_, larg=2, fechar=False):
        pts = list(pts) + ([pts[0]] if fechar else [])
        q = []
        for (a, b), (c, e2) in zip(pts[:-1], pts[1:]):
            k = max(1, int(math.hypot((c - a) * M_LON, (e2 - b) * M_LAT) / 3))
            for t in np.linspace(0, 1, k, endpoint=False):
                q.append((a + (c - a) * t, b + (e2 - b) * t))
        q.append(pts[-1])
        q = np.array(q)
        dist, idx = arvore.query(np.stack([q[:, 0] * M_LON, q[:, 1] * M_LAT], 1))
        anterior = None
        for dd, i in zip(dist, idx):
            if dd > 2 * passo_px:
                anterior = None
                continue
            p = (i % W, i // W)
            if anterior is not None and math.hypot(p[0] - anterior[0], p[1] - anterior[1]) < 30:
                d.line([anterior, p], fill=cor_, width=larg)
            anterior = p

    linha(dados["costa"], (40, 90, 220), 2)
    for l in fer["linhas"]:
        linha(l["tracado"], (10, 10, 10), 2)
    for p in fer["patios"]:
        linha(p["poligono"], (190, 0, 190), 2, True)
    linha(dados["campoUrubu"]["poligono"], (230, 30, 30), 3, True)
    try:
        fonte = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 13)
    except OSError:
        fonte = ImageFont.load_default()
    d.rectangle([0, 0, W, 34], fill=(255, 255, 255))
    d.text((6, 2), titulo, fill=(0, 0, 0), font=fonte)
    d.text((6, 18), "lotes de 1932 (vermelho fino), via ferrea (preto), recinto das oficinas (magenta), cerca do campo (vermelho), costa (azul)"
           + (", scan da planta (escuro)" if com_scan else ""), fill=(60, 60, 60), font=ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 10) if os.path.exists("/System/Library/Fonts/Supplemental/Arial.ttf") else fonte)
    img.save(saida)


if __name__ == "__main__":
    main()
