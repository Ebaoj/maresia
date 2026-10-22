#!/usr/bin/env python3
"""A planta oficial de 1932 por cima da vista de cima do jogo (docs/mapa-1932.md, v16).

Para cada foto de cima (NOME.png + NOME.lonlat de sobrepor-planta.mjs), pinta por cima o contorno dos lotes da
planta (mapa1932-malha.png): onde o jogo bate com a planta, a casa do jogo fica dentro do contorno vermelho e
as ruas do jogo correm na direcao das ruas da planta.

uso: python3 scripts/diagnostico/sobrepor-planta.py PASTA NOME SAIDA.png [titulo]
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def main():
    pasta, nome, saida = sys.argv[1:4]
    titulo = sys.argv[4] if len(sys.argv) > 4 else nome
    W, H = 640, 360
    ll = np.fromfile(os.path.join(pasta, nome + ".lonlat"), np.float32).reshape(H, W, 2)
    dados = json.load(open(os.path.join(RAIZ, "src", "mundo", "mapa1932-dados.json")))
    jan = dados["janela"]
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
    # o contorno do lote: lote que encosta em não-lote
    m = Image.fromarray((lote * 255).astype(np.uint8))
    borda = np.array(m.filter(ImageFilter.MaxFilter(3))) > 0
    borda &= ~(np.array(m.filter(ImageFilter.MinFilter(3))) > 0)
    foto = np.array(Image.open(os.path.join(pasta, nome + ".png")).convert("RGB").resize((W, H))).astype(float)
    foto[lote] = foto[lote] * 0.75 + np.array([255, 230, 120]) * 0.25
    foto[borda] = [220, 20, 20]
    img = Image.fromarray(foto.astype(np.uint8))
    d = ImageDraw.Draw(img)
    try:
        fonte = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 14)
    except OSError:
        fonte = ImageFont.load_default()
    d.rectangle([0, 0, W, 20], fill=(255, 255, 255))
    d.text((6, 2), titulo, fill=(0, 0, 0), font=fonte)
    img.save(saida)


if __name__ == "__main__":
    main()
