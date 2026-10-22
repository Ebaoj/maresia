# Mede a cal caída da velha Sé nas fotos de scripts/fotos-acabamento.mjs: a fração dos pixels da fachada que estão
# descascados (o reboco grosso e a pedra por baixo são quentes, entre o laranja e o ocre; a caiação da Sé é verde-cinza,
# as cimalhas brancas, o céu azul). Mede também quanto disso fica no terço de cima do recorte (o alto das torres).
# uso: python3 scripts/medir-casca.py PASTA [PASTA ...]
import sys
import colorsys
from PIL import Image

# nome: (recorte x0, y0, x1, y1), áreas a tirar (HUD, o jogador)
REGIOES = {
    'se-vista': ((455, 0, 830, 400), [(590, 280, 700, 400)]),
    'se-torre': ((470, 40, 1280, 720), [(0, 600, 470, 720), (560, 0, 720, 40)]),
    'se-quina': ((570, 0, 1280, 650), [(560, 0, 720, 40)]),
}


def quente(r, g, b):
    h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    return 0.04 <= h <= 0.14 and s >= 0.16 and 0.25 <= v <= 0.97


def medir(caminho, regiao, fora):
    im = Image.open(caminho).convert('RGB')
    x0, y0, x1, y1 = regiao
    px = im.load()
    total = quentes = alto = 0
    corte = y0 + (y1 - y0) / 3
    for y in range(y0, y1, 2):
        for x in range(x0, x1, 2):
            if any(a <= x < c and b <= y < d for a, b, c, d in fora):
                continue
            total += 1
            if quente(*px[x, y]):
                quentes += 1
                if y < corte:
                    alto += 1
    return quentes / max(total, 1), alto / max(quentes, 1)


for pasta in sys.argv[1:]:
    for nome, (reg, fora) in REGIOES.items():
        try:
            f, a = medir(f'{pasta}/{nome}.png', reg, fora)
        except FileNotFoundError:
            continue
        print(f'{pasta:60s} {nome:10s} descascado {f * 100:5.1f}%  (no terço de cima: {a * 100:5.1f}% disso)')
