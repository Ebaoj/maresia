# Prova de imagem do trabalho "fluido" (docs/fluido-22-10.md): ANTES em cima, DEPOIS embaixo e, ao lado, o mapa do
# que mudou (pixels com diferença > LIMIAR em qualquer canal, em vermelho sobre o DEPOIS apagado). Imprime a fração
# de pixels que mudou. O jogo andando (vento, grama, gente) muda entre duas fotos mesmo sem mudança nenhuma.
# uso: python3 scripts/fluido-ab.py PASTA prefixo lugar1 lugar2 ...   (lê PASTA/prefixo-lugar-antes.png e -depois.png)
import sys
import numpy as np
from PIL import Image, ImageDraw

LIMIAR = 24
pasta, prefixo, *lugares = sys.argv[1:]
for lugar in lugares:
    a = Image.open(f'{pasta}/{prefixo}-{lugar}-antes.png').convert('RGB')
    d = Image.open(f'{pasta}/{prefixo}-{lugar}-depois.png').convert('RGB')
    A = np.asarray(a).astype(np.int16)
    D = np.asarray(d).astype(np.int16)
    muda = (np.abs(A - D).max(axis=2) > LIMIAR)
    frac = muda.mean()
    mapa = (np.asarray(d).astype(np.float32) * 0.35).astype(np.uint8)
    mapa[muda] = [230, 40, 40]
    w, h = a.size
    tela = Image.new('RGB', (w * 2 + 8, h * 2 + 8), '#1d1a1a')
    tela.paste(a, (0, 0))
    tela.paste(d, (0, h + 8))
    tela.paste(Image.fromarray(mapa), (w + 8, h + 8))
    g = ImageDraw.Draw(tela)
    for (x, y, t) in [(10, h - 30, 'ANTES'), (10, 2 * h - 22, 'DEPOIS'), (w + 18, 2 * h - 22, f'mudou: {frac * 100:.2f}% dos pixels (> {LIMIAR})')]:
        g.rectangle([x - 6, y - 4, x + 8 * len(t), y + 16], fill='#1d1a1a')
        g.text((x, y), t, fill='#efe6d2')
    tela = tela.resize((tela.width // 2, tela.height // 2))
    tela.save(f'{pasta}/{prefixo}-{lugar}.jpg', quality=84)
    print(f'{lugar}: {frac * 100:.2f}% dos pixels mudaram')
