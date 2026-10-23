# Prova da gente (docs/capturas/gente/): ANTES em cima, DEPOIS embaixo, o conceito ao lado, para cada cena e distância.
# uso: python3 scripts/compor-gente.py PASTA_ANTES PASTA_DEPOIS SAIDA ROTULO_ANTES ROTULO_DEPOIS
import sys, os
from PIL import Image, ImageDraw

antes, depois, saida, rot_a, rot_d = sys.argv[1:6]
C1 = os.path.expanduser('~/Projetos/marcos-1932-pesquisa/conceitos/')
C2 = os.path.expanduser('~/Projetos/maresia-chao/docs/referencias/conceito-sertao/')
CONCEITO = {
    'praca': C1 + 'praca-ferreira.png', 'mercado': C1 + 'mercado-ferro.png', 'estacao': C1 + 'estacao-central.png',
    'cozinha': C2 + '3-campo-urubu.png', 'galpao': C2 + '3-campo-urubu.png',
}
os.makedirs(saida, exist_ok=True)
for arq in sorted(os.listdir(depois)):
    if not arq.endswith('.png'): continue
    nome = arq[:-4]
    pa = os.path.join(antes, arq)
    if not os.path.exists(pa): pa = os.path.join(antes, nome + '.jpg')
    if not os.path.exists(pa): continue
    a = Image.open(pa).convert('RGB')
    d = Image.open(os.path.join(depois, arq)).convert('RGB')
    w, h = d.size
    a = a.resize((w, h))
    C = Image.open(CONCEITO[nome.split('-')[0]]).convert('RGB')
    c = C.resize((w, round(C.height * w / C.width)))
    tela = Image.new('RGB', (w * 2 + 8, h * 2 + 8), '#1d1a1a')
    tela.paste(a, (0, 0))
    tela.paste(d, (0, h + 8))
    tela.paste(c, (w + 8, 0))
    g = ImageDraw.Draw(tela)
    for (x, y, t) in [(10, h - 30, 'ANTES ' + rot_a), (10, 2 * h - 22, 'DEPOIS ' + rot_d), (w + 18, c.height - 30, 'conceito: ' + os.path.basename(CONCEITO[nome.split('-')[0]]))]:
        g.rectangle([x - 6, y - 4, x + 8 * len(t), y + 16], fill='#1d1a1a')
        g.text((x, y), t, fill='#efe6d2')
    g.text((w + 18, c.height + 20), nome.replace('-', ' a '), fill='#efe6d2')
    # o pedaço do meio ampliado (onde está a pessoa da distância), antes e depois lado a lado
    cw, ch = w // 3, h // 3
    caixa = (w // 2 - cw // 2, h // 2 - ch // 2 - h // 10, w // 2 + cw // 2, h // 2 + ch // 2 - h // 10)
    za = a.crop(caixa).resize((w // 2 - 4, round((w // 2 - 4) * ch / cw)))
    zd = d.crop(caixa).resize((w // 2 - 4, round((w // 2 - 4) * ch / cw)))
    y0 = c.height + 50
    if y0 + za.height <= tela.height:
        tela.paste(za, (w + 8, y0))
        tela.paste(zd, (w + 8 + w // 2 + 4, y0))
        g.text((w + 18, y0 + 6), 'meio ampliado: antes | depois', fill='#efe6d2')
    tela = tela.resize((tela.width * 3 // 4, tela.height * 3 // 4))
    tela.save(os.path.join(saida, nome + '.jpg'), quality=84)
    print('ok', nome)
