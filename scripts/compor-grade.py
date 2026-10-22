# Compõe as provas da gradação final (docs/capturas/grade-final/): ANTES em cima, DEPOIS embaixo e, ao lado, o
# histograma da luminância (Rec. 601, a mesma do shader) das duas fotos. A curva antiga chapava L de 0,24 a 0,33
# em 0,3: no histograma do antes isso é um pico estreito perto de 0,3 (77/255); no depois ele some.
# Também mede o pico: a maior barra entre 0,26 e 0,34 dividida pela média das vizinhas (1 = sem pico), e grava
# tudo em medidas.json. O pico perto de 0,1 é o letreiro da tela (não passa pela gradação: igual nos dois).
# uso: python3 scripts/compor-grade.py PASTA_ANTES PASTA_DEPOIS SAIDA nome nome ...
import sys, json
import numpy as np
from PIL import Image, ImageDraw, ImageFont

antes, depois, saida, *nomes = sys.argv[1:]
LUM = np.array([0.299, 0.587, 0.114])
try:
    FONTE = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 15)  # a fonte padrão do PIL não tem acento
except OSError:
    FONTE = ImageFont.load_default()


def luminancia(img):
    a = np.asarray(img, dtype=np.float64) / 255.0
    return a @ LUM


def histograma(L):
    h, _ = np.histogram(L, bins=256, range=(0, 1))
    return h / L.size


def pico(h):
    # o pico estreito: cada barra entre 0,26 e 0,34 dividida pela média das vizinhas a 3 a 6 barras de distância
    # (conteúdo de verdade sobe devagar e dá ~1; a faixa chapada vira uma barra só, muito acima das vizinhas)
    melhor, onde = 0.0, 0
    for i in range(int(0.26 * 255), int(0.34 * 255) + 1):
        viz = np.concatenate([h[i - 6:i - 2], h[i + 3:i + 7]]).mean()
        r = h[i] / max(viz, 1e-9)
        if r > melhor:
            melhor, onde = r, i
    return float(melhor), float(onde / 255)


def desenhar(ha, hd, w, h):
    tela = Image.new('RGB', (w, h), '#1d1a1a')
    g = ImageDraw.Draw(tela)
    m = 40
    x0, x1, y0, y1 = m, w - 14, 30, h - 40
    ate = 0.7  # o eixo vai de 0 a 0,7: é onde a sombra média mora
    n = int(ate * 255)
    topo = max(ha[:n].max(), hd[:n].max()) * 1.05
    # a faixa que a curva antiga chapava
    for (a, b, cor) in [(0.24, 0.33, '#3a3030')]:
        g.rectangle([x0 + (x1 - x0) * a / ate, y0, x0 + (x1 - x0) * b / ate, y1], fill=cor)
    for v in [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]:
        x = x0 + (x1 - x0) * v / ate
        g.line([x, y1, x, y1 + 5], fill='#9a8f80')
        g.text((x - 8, y1 + 8), f'{v:.1f}', fill='#9a8f80', font=FONTE)
    for hist, cor in [(ha, '#e0805a'), (hd, '#7fc0d8')]:
        pts = [(x0 + (x1 - x0) * (i + 0.5) / n, y1 - (y1 - y0) * hist[i] / topo) for i in range(n)]
        g.line(pts, fill=cor, width=2)
    g.text((x0, 8), 'luminância da foto inteira (0 a 0,7)', fill='#efe6d2', font=FONTE)
    g.text((x0, y1 + 22), 'laranja = antes, azul = depois; faixa escura = 0,24 a 0,33; o pico em 0,1 é o letreiro da tela', fill='#efe6d2', font=FONTE)
    return tela


medidas = {}
for nome in nomes:
    a = Image.open(f'{antes}/{nome}.png').convert('RGB')
    d = Image.open(f'{depois}/{nome}.png').convert('RGB')
    w, h = a.size
    ha, hd = histograma(luminancia(a)), histograma(luminancia(d))
    pa, pd = pico(ha), pico(hd)
    medidas[nome] = {'pico_antes': round(pa[0], 2), 'em_antes': round(pa[1], 3), 'pico_depois': round(pd[0], 2), 'em_depois': round(pd[1], 3)}
    tela = Image.new('RGB', (w * 2 + 8, h * 2 + 8), '#1d1a1a')
    tela.paste(a, (0, 0))
    tela.paste(d, (0, h + 8))
    tela.paste(desenhar(ha, hd, w, h), (w + 8, 0))
    g = ImageDraw.Draw(tela)
    txt = [f'pico estreito perto de 0,3 (barra / vizinhas, 1 = sem pico):', f'antes  {pa[0]:.2f}  em {pa[1]:.3f}', f'depois {pd[0]:.2f}  em {pd[1]:.3f}']
    for i, t in enumerate(txt):
        g.text((w + 30, h + 40 + 22 * i), t, fill='#efe6d2', font=FONTE)
    for (x, y, t) in [(10, h - 30, 'ANTES (integracao, f06918b)'), (10, 2 * h - 22, 'DEPOIS (grade-final)')]:
        g.rectangle([x - 6, y - 4, x + g.textlength(t, font=FONTE) + 6, y + 18], fill='#1d1a1a')
        g.text((x, y), t, fill='#efe6d2', font=FONTE)
    g.text((w + 30, h * 2 - 14), nome, fill='#efe6d2', font=FONTE)
    tela = tela.resize((tela.width * 3 // 4, tela.height * 3 // 4))
    tela.save(f'{saida}/{nome}.jpg', quality=84)
    print(nome, medidas[nome])
json.dump(medidas, open(f'{saida}/medidas.json', 'w'), indent=1, ensure_ascii=False)


# a curva de tom em si, antes e depois (as mesmas contas de gradacao-final.js, k = 1,15, emenda de 0,12 a 0,45)
def ss(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


k = 1.15
L = np.linspace(0.001, 0.7, 1400)
antiga = L * np.clip(np.clip((L - 0.5) * k + 0.5, 0.3, 1) / np.maximum(L, 0.15), 0.7, 1.25)
alta = np.clip((L - 0.5) * k + 0.5, 0, 1)
nova = L * np.clip((1.25 * L * (1 - ss(0.12, 0.45, L)) + alta * ss(0.12, 0.45, L)) / np.maximum(L, 1e-3), 0.7, 1.25)
W, H, m = 900, 700, 60
im = Image.new('RGB', (W, H), '#1d1a1a')
g = ImageDraw.Draw(im)
X = lambda v: m + (W - 2 * m) * v / 0.7
Y = lambda v: H - m - (H - 2 * m) * v / 0.7
g.rectangle([X(0.24), Y(0.7), X(0.33), Y(0)], fill='#3a3030')
for v in np.arange(0, 0.71, 0.1):
    g.text((X(v) - 8, Y(0) + 8), f'{v:.1f}', fill='#9a8f80', font=FONTE)
    g.text((m - 34, Y(v) - 8), f'{v:.1f}', fill='#9a8f80', font=FONTE)
g.line([(X(0), Y(0)), (X(0.7), Y(0.7))], fill='#555')
g.line(list(zip(X(L), Y(antiga))), fill='#e0805a', width=3)
g.line(list(zip(X(L), Y(nova))), fill='#7fc0d8', width=3)
g.text((m, 12), 'curva de tom da gradação final (luminância de entrada -> de saída, k = 1,15)', fill='#efe6d2', font=FONTE)
g.text((m, 32), 'laranja = antes (piso de 0,3: plana de 0,24 a 0,33); azul = depois (emenda suave de 0,12 a 0,45)', fill='#efe6d2', font=FONTE)
im.save(f'{saida}/curva.png')
