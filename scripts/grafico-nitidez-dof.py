# Gráfico da nitidez por quadro, antes e depois (saída de scripts/medir-nitidez-dof.py), um PNG por vídeo.
# Linhas: razão ligado/desligado da energia do gradiente (1 = tão nítido quanto sem o efeito), antes em vermelho e
# depois em azul, para o jogador, o chão a 0,5x, 2x e 4x a distância dele; embaixo, a distância da câmera.
# uso: python3 scripts/grafico-nitidez-dof.py ANTES/nitidez.json DEPOIS/nitidez.json SAIDA nome [nome...]
import json
import sys
from PIL import Image, ImageDraw

fa, fd, saida, *nomes = sys.argv[1:]
A, B = json.load(open(fa)), json.load(open(fd))
CAMPOS = [('jogador', 'jogador'), ('meio', 'chao a 0,5x'), ('dobro', 'chao a 2x'), ('quadruplo', 'chao a 4x')]
W, H, M = 960, 130, 54
for nome in nomes:
    qa, qd = A[nome]['quadros'], B[nome]['quadros']
    n = max(len(qa), len(qd))
    img = Image.new('RGB', (W, H * (len(CAMPOS) + 1) + 30), '#f4efe4')
    g = ImageDraw.Draw(img)
    g.text((M, 6), f'{nome}: nitidez ligado / desligado por quadro (vermelho = antes, azul = depois)', fill='#222')
    x = lambda i: M + (W - M - 10) * i / max(1, n - 1)
    for k, (campo, rot) in enumerate(CAMPOS + [('dist', 'camera (m)')]):
        y0 = 26 + k * H
        g.rectangle([M, y0, W - 10, y0 + H - 16], outline='#999')
        g.text((4, y0 + 2), rot[:12], fill='#222')
        if campo == 'dist':
            top = max(max(q['dist'] for q in qd), 1)
            y = lambda v: y0 + H - 16 - (H - 20) * v / top
            g.text((4, y0 + 16), f'0-{top:.0f}', fill='#666')
            g.line([(x(q['i']), y(q['dist'])) for q in qd], fill='#555', width=2)
            continue
        y = lambda v: y0 + H - 16 - (H - 20) * min(1.1, max(0, v)) / 1.1
        for ref in (1.0, 0.85):
            g.line([(M, y(ref)), (W - 10, y(ref))], fill='#bbb' if ref == 1 else '#e0b0a0')
        g.text((M - 26, y(1.0) - 6), '1,0', fill='#666')
        g.text((M - 26, y(0.85) - 6), '0,85', fill='#a66')
        for q, cor in ((qa, '#c0392b'), (qd, '#1f5fa8')):
            pts = [(x(l['i']), y(l[campo])) for l in q if campo in l]
            for a, b in zip(pts, pts[1:]):
                if b[0] - a[0] < 3 * (W - M) / max(1, n):  # não liga buraco (região fora da tela)
                    g.line([a, b], fill=cor, width=2)
    img.save(f'{saida}/{nome}-nitidez.png')
    print('ok', nome)
