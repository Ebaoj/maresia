# Compõe as provas do acabamento (docs/capturas/acabamento/): ANTES em cima, DEPOIS embaixo, o conceito ao lado.
# uso: python3 scripts/compor-acabamento.py PASTA_ANTES PASTA_DEPOIS SAIDA ROTULO_ANTES ROTULO_DEPOIS nome=conceito.png ...
#   (conceito '-' = sem conceito; o nome é o da foto de scripts/fotos-acabamento.mjs)
import sys
from PIL import Image, ImageDraw

antes, depois, saida, rot_a, rot_d, *pares = sys.argv[1:]
for par in pares:
    nome, conceito = par.split('=', 1)
    a = Image.open(f'{antes}/{nome}.png').convert('RGB')
    d = Image.open(f'{depois}/{nome}.png').convert('RGB')
    w, h = a.size
    tela = Image.new('RGB', (w * 2 + 8, h * 2 + 8), '#1d1a1a')
    tela.paste(a, (0, 0))
    tela.paste(d, (0, h + 8))
    g = ImageDraw.Draw(tela)
    if conceito != '-':
        C = Image.open(conceito).convert('RGB')
        C.thumbnail((w, h * 2 + 8))
        tela.paste(C, (w + 8, 0))
        g.text((w + 18, C.height + 12), 'conceito: ' + conceito.split('/conceitos/')[-1], fill='#efe6d2')
    for (x, y, t) in [(10, h - 30, rot_a), (10, 2 * h - 22, rot_d)]:
        g.rectangle([x - 6, y - 4, x + 7 * len(t), y + 16], fill='#1d1a1a')
        g.text((x, y), t, fill='#efe6d2')
    g.text((w + 18, h * 2 - 14), nome, fill='#efe6d2')
    tela = tela.resize((tela.width * 3 // 4, tela.height * 3 // 4))
    tela.save(f'{saida}/{nome}.jpg', quality=84)
    print('ok', nome)
