# Compõe as provas da profundidade de campo (docs/capturas/profundidade/): DESLIGADA em cima, LIGADA embaixo,
# o conceito aprovado ao lado (ou nada, sem conceito). As fotos vêm de scripts/fotos-profundidade.mjs.
# uso: python3 scripts/compor-profundidade.py PASTA_FOTOS SAIDA nome:conceito.png[:rotulo] ...
#      (conceito "-" = sem conceito ao lado)
import sys
from PIL import Image, ImageDraw

fotos, saida, *itens = sys.argv[1:]
for item in itens:
    partes = item.split(':')
    nome, conceito = partes[0], partes[1]
    rotulo = partes[2] if len(partes) > 2 else nome
    a = Image.open(f'{fotos}/{nome}-off.png').convert('RGB')
    d = Image.open(f'{fotos}/{nome}-on.png').convert('RGB')
    w, h = a.size
    com = conceito != '-'
    tela = Image.new('RGB', ((w * 2 + 8) if com else w, h * 2 + 8), '#1d1a1a')
    tela.paste(a, (0, 0))
    tela.paste(d, (0, h + 8))
    marcas = [(10, h - 30, 'DESLIGADA (dof: false)'), (10, 2 * h - 22, 'LIGADA (padrão: antes da pincelada)')]
    if com:
        C = Image.open(conceito).convert('RGB')
        c = C.resize((w, round(C.height * w / C.width)))
        tela.paste(c, (w + 8, 0))
        marcas.append((w + 18, c.height - 30, 'conceito: ' + conceito.split('/')[-1]))
    g = ImageDraw.Draw(tela)
    for (x, y, t) in marcas:
        g.rectangle([x - 6, y - 4, x + 7 * len(t), y + 16], fill='#1d1a1a')
        g.text((x, y), t, fill='#efe6d2')
    if com:
        g.text((w + 18, h + 20), rotulo, fill='#efe6d2')
    tela = tela.resize((tela.width * 3 // 4, tela.height * 3 // 4))
    tela.save(f'{saida}/{nome}.jpg', quality=86)
    print('ok', nome)
