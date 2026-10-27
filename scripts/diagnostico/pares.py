#!/usr/bin/env python3
"""Diferença entre quadros consecutivos (diagnóstico do pisca, 27/10/2026).

uso: python3 -I scripts/diagnostico/pares.py PASTA [PASTA ...] --json saida.json [--limiar 24]
Por par (t, t+1): média de |diferença| em luma (0-255), % de pixels com |dif| > limiar, máximo; e a imagem
da diferença ampliada (x4) do par com a maior média em PASTA_dif_pior.png se --difs DIR.
"""
import sys, os, json, glob
import numpy as np
from PIL import Image


def luma(c):
    a = np.asarray(Image.open(c).convert('RGB'), dtype=np.float32)
    return a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114


def main():
    args = sys.argv[1:]
    saida, limiar, difs, pastas = None, 24.0, None, []
    i = 0
    while i < len(args):
        if args[i] == '--json': saida = args[i + 1]; i += 2
        elif args[i] == '--limiar': limiar = float(args[i + 1]); i += 2
        elif args[i] == '--difs': difs = args[i + 1]; i += 2
        else: pastas.append(args[i]); i += 1
    res = {}
    for p in pastas:
        arqs = sorted(glob.glob(os.path.join(p, 'q*.png')))
        ys = [luma(a) for a in arqs]
        pares, pior, piord = [], -1, None
        for t in range(len(ys) - 1):
            if ys[t].shape != ys[t + 1].shape:
                pares.append({'par': f'{t}-{t+1}', 'erro': f'tamanhos {ys[t].shape} {ys[t+1].shape}'}); continue
            d = np.abs(ys[t + 1] - ys[t])
            r = {'par': f'{t}-{t+1}', 'media_abs': round(float(d.mean()), 4), 'pct_acima_limiar': round(float((d > limiar).mean() * 100), 4),
                 'pct_acima_8': round(float((d > 8).mean() * 100), 4), 'max': round(float(d.max()), 1), 'identicos': bool(d.max() == 0)}
            pares.append(r)
            if r['media_abs'] > pior: pior, piord = r['media_abs'], d
        nome = os.path.basename(p.rstrip('/'))
        ok = [r for r in pares if 'media_abs' in r]
        res[nome] = {'quadros': len(ys), 'limiar': limiar,
                     'media_abs_media': round(float(np.mean([r['media_abs'] for r in ok])), 4) if ok else None,
                     'pct_acima_limiar_media': round(float(np.mean([r['pct_acima_limiar'] for r in ok])), 4) if ok else None,
                     'pares_identicos': sum(r['identicos'] for r in ok), 'pares': pares}
        print(f"{nome:14s} media|dif| {res[nome]['media_abs_media']}  %>{limiar:g} {res[nome]['pct_acima_limiar_media']}  identicos {res[nome]['pares_identicos']}/{len(ok)}")
        for r in pares: print('   ', r)
        if difs and piord is not None:
            os.makedirs(difs, exist_ok=True)
            Image.fromarray(np.clip(piord * 4, 0, 255).astype(np.uint8)).save(os.path.join(difs, nome + '-dif-pior-x4.png'))
    if saida:
        with open(saida, 'w') as f: json.dump(res, f, indent=1)


if __name__ == '__main__':
    main()
