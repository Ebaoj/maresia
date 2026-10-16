"""Silhuetas simples desenhadas por código para servir de imagem de partida (imagem-para-imagem).

O modelo de imagem não faz postura fora do padrão só pelo texto (ex.: costas curvas do avô).
Aqui a postura vem do desenho; o estilo vem do prompt. Uso: .venv/bin/python silhuetas.py
"""

from PIL import Image, ImageDraw, ImageFilter

PAPEL = "#F4EBD8"
PELE = "#AE6940"  # amostrada da folha do neto (neto-v5/neto-ref70-2)
CAMISA_AVO = "#E3D6B8"
CALCA = "#8A5A3C"
PALHA = "#D4B373"
BARBA = "#F2F0EA"
TINTA = "#2B211C"


def membro(d, pontos, largura, cor):
    d.line(pontos, fill=cor, width=largura, joint="curve")
    for x, y in pontos:
        r = largura // 2
        d.ellipse([x - r, y - r, x + r, y + r], fill=cor)


def chapeu(d, cx, cy, aba=150, alto=70):
    d.ellipse([cx - aba, cy - 22, cx + aba, cy + 22], fill=PALHA, outline=TINTA, width=3)
    d.polygon([(cx - 70, cy - 5), (cx, cy - alto), (cx + 70, cy - 5)], fill=PALHA, outline=TINTA)


def avo_lado(d, x, chao, escala=1.0):
    """Perfil virado para a esquerda: coluna em C, cabeça à frente, joelhos dobrados."""
    s = lambda dx, dy: (x + dx * escala, chao - dy * escala)
    # pernas levemente dobradas
    membro(d, [s(10, 340), s(-15, 175), s(5, 20)], int(58 * escala), CALCA)
    membro(d, [s(5, 20), s(5, 0)], int(40 * escala), PELE)
    d.ellipse([*s(-45, 14), *s(25, -6)], fill=PELE)  # pé grande
    # tronco em C: quadril -> lombar -> corcunda atrás -> ombro à frente
    tronco = [s(10, 340), s(40, 430), s(70, 515), s(55, 585), s(10, 615), s(-20, 612)]
    membro(d, tronco, int(105 * escala), CAMISA_AVO)
    # pescoço e cabeça projetados à frente e abaixo da linha do ombro
    membro(d, [s(-20, 608), s(-60, 605)], int(42 * escala), PELE)
    hx, hy = s(-92, 615)
    r = 46 * escala
    d.ellipse([hx - r, hy - r, hx + r, hy + r], fill=PELE)
    d.polygon([(hx - r * 0.9, hy + r * 0.1), (hx - r * 0.2, hy + r * 1.25), (hx + r * 0.3, hy + r * 0.5)], fill=BARBA)
    chapeu(d, hx + 5, hy - r * 0.55, aba=int(120 * escala), alto=int(60 * escala))
    # braço pendendo à frente do corpo, mão grande
    membro(d, [s(0, 585), s(-45, 475), s(-70, 370)], int(34 * escala), PELE)
    d.ellipse([*s(-100, 390), *s(-40, 330)], fill=PELE)
    d.line([s(-30, 520), s(-10, 585)], fill=CAMISA_AVO, width=int(40 * escala))  # manga dobrada


def avo_frente(d, x, chao, escala=1.0, costas=False):
    s = lambda dx, dy: (x + dx * escala, chao - dy * escala)
    for lado in (-1, 1):
        membro(d, [s(lado * 35, 340), s(lado * 45, 175), s(lado * 40, 20)], int(56 * escala), CALCA)
        membro(d, [s(lado * 40, 20), s(lado * 40, 0)], int(38 * escala), PELE)
        d.ellipse([*s(lado * 40 - 32, 14), *s(lado * 40 + 32, -6)], fill=PELE)
    # tronco: ombros caídos e arredondados
    d.rounded_rectangle([*s(-85, 585), *s(85, 330)], radius=int(55 * escala), fill=CAMISA_AVO)
    if costas:
        d.ellipse([*s(-80, 640), *s(80, 520)], fill=CAMISA_AVO)  # corcunda vista de trás
    else:
        d.polygon([s(-22, 585), s(22, 585), s(0, 470)], fill=PELE)  # camisa aberta no peito
    for lado in (-1, 1):
        membro(d, [s(lado * 80, 560), s(lado * 95, 450), s(lado * 85, 360)], int(34 * escala), PELE)
        d.ellipse([*s(lado * 85 - 30, 375), *s(lado * 85 + 30, 315)], fill=PELE)
    # cabeça baixa entre os ombros (o pescoço some na frente)
    hx, hy = s(0, 625 if not costas else 600)
    r = 46 * escala
    d.ellipse([hx - r, hy - r, hx + r, hy + r], fill=PELE)
    if not costas:
        d.polygon([(hx - r * 0.8, hy + r * 0.2), (hx, hy + r * 1.3), (hx + r * 0.8, hy + r * 0.2)], fill=BARBA)
    chapeu(d, hx, hy - r * 0.6, aba=int(120 * escala), alto=int(60 * escala))


def folha_avo(caminho, chao=950, escala=1.05):
    im = Image.new("RGB", (1536, 1024), PAPEL)
    d = ImageDraw.Draw(im)
    avo_frente(d, 300, chao, escala)
    avo_lado(d, 790, chao, escala)
    avo_frente(d, 1240, chao, escala, costas=True)
    im.filter(ImageFilter.GaussianBlur(1.5)).save(caminho)


if __name__ == "__main__":
    folha_avo("entradas/silhueta-avo.png")
    print("entradas/silhueta-avo.png")
