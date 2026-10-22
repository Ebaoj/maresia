# Compõe a prova: ANTES em cima, DEPOIS embaixo, o conceito ao lado (docs/capturas/campo-urubu/).
# uso: python3 scripts/compor-antes-depois.py PASTA_ANTES PASTA_DEPOIS CONCEITO.png SAIDA nome1 nome2 ...
import sys
from PIL import Image, ImageDraw

antes, depois, conceito, saida, *nomes = sys.argv[1:]
C = Image.open(conceito).convert('RGB')
for nome in nomes:
    a = Image.open(f'{antes}/{nome}.png').convert('RGB')
    d = Image.open(f'{depois}/{nome}.png').convert('RGB')
    w, h = a.size
    c = C.resize((w, round(C.height * w / C.width)))
    tela = Image.new('RGB', (w * 2 + 8, h * 2 + 8), '#1d1a1a')
    tela.paste(a, (0, 0))
    tela.paste(d, (0, h + 8))
    tela.paste(c, (w + 8, 0))
    g = ImageDraw.Draw(tela)
    for (x, y, t) in [(10, h - 30, 'ANTES (53ff6f0)'), (10, 2 * h - 22, 'DEPOIS (campo-urubu)'), (w + 18, c.height - 30, 'conceito aprovado: 3-campo-urubu.png')]:
        g.rectangle([x - 6, y - 4, x + 8 * len(t), y + 16], fill='#1d1a1a')
        g.text((x, y), t, fill='#efe6d2')
    g.text((w + 18, c.height + 20), nome, fill='#efe6d2')
    tela = tela.resize((tela.width * 3 // 4, tela.height * 3 // 4))
    tela.save(f'{saida}/{nome}.jpg', quality=84)
    print('ok', nome)
