#!/usr/bin/env python3
"""Mapa de cintilação (pisca, 22/10/2026, docs/pisca-22-10.md).

Um pixel "pisca" no quadro t quando muda muito de t-1 para t, muda muito de t para t+1, e t-1 e t+1 ficam
parecidos (mudou e voltou). Movimento de verdade não volta, então o giro e o andar não contam como pisca;
só o que vai e volta de um quadro para o outro.

uso: python3 -I scripts/pisca-mapa.py PASTA_DE_QUADROS [PASTA ...] [--limiar 24] [--mapa saida.png] [--json saida.json] [--largura 1280]
Imprime por pasta: fração média de pixels que piscam por quadro (em %), a mesma só nas bordas (gradiente alto
no quadro) e fora delas, e o pior quadro. --mapa grava o mapa somado (branco = piscou em algum quadro).
"""
import sys, os, json, glob
import numpy as np
from PIL import Image


def luma(caminho, largura=None):
    im = Image.open(caminho).convert('RGB')
    # supersample (pasta com quadros maiores que a referência): reduz por média de caixa para a mesma largura
    if largura and im.width > largura:
        k = im.width // largura
        a = np.asarray(im, dtype=np.float32)
        h, w = (a.shape[0] // k) * k, (a.shape[1] // k) * k
        a = a[:h, :w].reshape(h // k, k, w // k, k, 3).mean(axis=(1, 3))
    else:
        a = np.asarray(im, dtype=np.float32)
    return a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114


def bordas(y):
    gx = np.abs(np.diff(y, axis=1, prepend=y[:, :1]))
    gy = np.abs(np.diff(y, axis=0, prepend=y[:1, :]))
    return np.maximum(gx, gy) > 18


def analisar(pasta, limiar=24.0, largura=None):
    arquivos = sorted(glob.glob(os.path.join(pasta, 'q*.png')) + glob.glob(os.path.join(pasta, 'q*.jpg')))
    if len(arquivos) < 3:
        return None
    ys = [luma(a, largura) for a in arquivos]
    soma = np.zeros_like(ys[0])
    fr, fr_b, fr_f = [], [], []
    for t in range(1, len(ys) - 1):
        a, b, c = ys[t - 1], ys[t], ys[t + 1]
        pisca = (np.abs(b - a) > limiar) & (np.abs(b - c) > limiar) & (np.abs(a - c) < limiar * 0.5)
        borda = bordas(b)
        soma += pisca
        fr.append(pisca.mean() * 100)
        fr_b.append(pisca[borda].mean() * 100 if borda.any() else 0)
        fr_f.append(pisca[~borda].mean() * 100)
    return {
        'quadros': len(ys),
        'pisca_pct': round(float(np.mean(fr)), 4),
        'pisca_borda_pct': round(float(np.mean(fr_b)), 4),
        'pisca_liso_pct': round(float(np.mean(fr_f)), 4),
        'pior_quadro_pct': round(float(np.max(fr)), 4),
        'quadros_com_pisca_acima_0_05pct': int(np.sum(np.array(fr) > 0.05)),
        '_soma': soma,
    }


def main():
    args = sys.argv[1:]
    limiar, mapa, saida, largura = 24.0, None, None, None
    pastas = []
    i = 0
    while i < len(args):
        if args[i] == '--limiar': limiar = float(args[i + 1]); i += 2
        elif args[i] == '--mapa': mapa = args[i + 1]; i += 2
        elif args[i] == '--json': saida = args[i + 1]; i += 2
        elif args[i] == '--largura': largura = int(args[i + 1]); i += 2
        else: pastas.append(args[i]); i += 1
    res = {}
    for p in pastas:
        r = analisar(p, limiar, largura)
        if r is None:
            print(p, 'poucos quadros'); continue
        soma = r.pop('_soma')
        res[os.path.basename(p.rstrip('/'))] = r
        print(f"{os.path.basename(p.rstrip('/')):40s} pisca {r['pisca_pct']:7.3f}%  borda {r['pisca_borda_pct']:7.3f}%  liso {r['pisca_liso_pct']:7.3f}%  pior {r['pior_quadro_pct']:7.3f}%  quadros>0,05% {r['quadros_com_pisca_acima_0_05pct']}/{r['quadros'] - 2}")
        if mapa:
            alvo = mapa if len(pastas) == 1 else os.path.join(mapa, os.path.basename(p.rstrip('/')) + '.png')
            os.makedirs(os.path.dirname(alvo) or '.', exist_ok=True)
            Image.fromarray(((soma > 0) * 255).astype(np.uint8)).save(alvo)
    if saida:
        with open(saida, 'w') as f: json.dump(res, f, indent=1)


if __name__ == '__main__':
    main()
