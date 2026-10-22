# Nitidez por quadro dos pares ligado/desligado da profundidade de campo (scripts/fotos-profundidade.mjs, "pares").
# Para cada quadro: energia do gradiente (média de gx² + gy² da luminância, Sobel) na caixa do jogador e em manchas do
# chão a 0,5x, 2x e 4x a distância do jogador, ligado dividido por desligado. 1 = tão nítido quanto sem o efeito;
# abaixo de ~0,85 o olho já vê mole. O mesmo quadro nas duas versões (o jogo não anda entre elas), então a razão mede
# só o efeito.
# uso: python3 scripts/medir-nitidez-dof.py PASTA_JSON PASTA_VIDEO nome [nome...]  (imprime e grava PASTA_JSON/nitidez.json)
import json
import sys
import numpy as np
from PIL import Image

pasta_json, pasta_video, *nomes = sys.argv[1:]


def energia(img, caixa):
    x0, y0, x1, y1 = [int(round(v)) for v in caixa]
    h, w = img.shape
    x0, x1 = max(1, x0), min(w - 1, x1)
    y0, y1 = max(1, y0), min(h - 1, y1)
    if x1 - x0 < 6 or y1 - y0 < 6:
        return None
    r = img[y0 - 1:y1 + 1, x0 - 1:x1 + 1]
    gx = (r[1:-1, 2:] - r[1:-1, :-2]) * 2 + (r[:-2, 2:] - r[:-2, :-2]) + (r[2:, 2:] - r[2:, :-2])
    gy = (r[2:, 1:-1] - r[:-2, 1:-1]) * 2 + (r[2:, :-2] - r[:-2, :-2]) + (r[2:, 2:] - r[:-2, 2:])
    return float((gx * gx + gy * gy).mean())


def carregar(p):
    return np.asarray(Image.open(p).convert('L'), dtype=np.float32)


saida = {}
for nome in nomes:
    dados = json.load(open(f'{pasta_json}/{nome}.json'))
    linhas = []
    for q in dados['quadros']:
        i = q['i']
        on = carregar(f'{pasta_video}/{nome}-on/q{i:04d}.jpg')
        off = carregar(f'{pasta_video}/{nome}-off/q{i:04d}.jpg')
        H, W = on.shape
        sx, sy = W / q['w'], H / q['h']
        jx0, jy0, jx1, jy1 = q['jogador']
        reg = {'jogador': [jx0 * sx, jy0 * sy, jx1 * sx, jy1 * sy]}
        # mancha do chão: 8% da largura por 5% da altura em volta do ponto (só se estiver na frente da câmera e na tela)
        for k, c in q['chao'].items():
            if c['z'] < 1 and 0 < c['x'] < q['w'] and 0 < c['y'] < q['h']:
                cx, cy = c['x'] * sx, c['y'] * sy
                reg[k] = [cx - W * 0.04, cy - H * 0.025, cx + W * 0.04, cy + H * 0.025]
        linha = {'i': i, 'foco': round(q['foco'], 2), 'focoDof': round(q['focoDof'] or 0, 2), 'dist': round(q['dist'], 2)}
        for k, caixa in reg.items():
            a, b = energia(on, caixa), energia(off, caixa)
            if a is not None and b and b > 20:
                linha[k] = round(a / b, 3)
        linhas.append(linha)
    resumo = {}
    for k in ['jogador', 'meio', 'dobro', 'quadruplo']:
        v = np.array([l[k] for l in linhas if k in l])
        if len(v):
            resumo[k] = {'quadros': int(len(v)), 'min': round(float(v.min()), 3), 'p10': round(float(np.percentile(v, 10)), 3),
                         'media': round(float(v.mean()), 3), 'abaixo_085': int((v < 0.85).sum())}
    saida[nome] = {'resumo': resumo, 'quadros': linhas}
    print(nome, json.dumps(resumo, ensure_ascii=False))
json.dump(saida, open(f'{pasta_json}/nitidez.json', 'w'), ensure_ascii=False, indent=0)
