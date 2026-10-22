#!/usr/bin/env python3
"""Maresia - a conferencia visual: as casas do jogo sobre a planta oficial de 1932.

O script Node (scripts/diagnostico/conferencia-planta.mjs) mede tudo e escreve
um JSON com os numeros e a geometria; este script desenha tres colunas:

  1. O JOGO, no espaco do jogo (e o que o jogador ve);
  2. O JOGO, no espaco de verdade (lon/lat, com proporcao igual), sobre os
     lotes oficiais: aqui da para ver se a casa cabe no lote que a planta
     desenhou, sem a distorcao da escala atrapalhar;
  3. A PLANTA OFICIAL DE 1932 (o raster da camada 'Evolucao Urbana 1932') da
     mesma area.

  npx vite-node scripts/diagnostico/conferencia-planta.mjs
  python3 scripts/diagnostico/conferencia-desenha.py

As imagens saem em docs/capturas/cidade-1932/conferencia-<recorte>.png
"""

import json
import os

from PIL import Image, ImageDraw, ImageFont

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
JSON = os.environ.get("CONFERENCIA_JSON", "/tmp/conferencia-planta.json")
SAIDA = os.path.join(RAIZ, "docs", "capturas", "cidade-1932")
MALHA = os.path.join(RAIZ, "src", "mundo", "mapa1932-malha.png")
DADOS = os.path.join(RAIZ, "src", "mundo", "mapa1932-dados.json")

LADO = 1000          # o lado de cada painel, em pixels
FONTE_T = 24
FONTE_P = 17
METRO_LON = 101000.0  # metros por grau de longitude em Fortaleza
METRO_LAT = 110574.0  # metros por grau de latitude

# as cores das casas por tipo (o mesmo espirito da paleta do jogo)
CORES_TIPO = {
    "casario": (214, 176, 122),
    "simples": (231, 205, 160),
}
COR_LOTE = (90, 200, 255)
COR_TESTADA = (255, 120, 90)
COR_FUNDO = (22, 25, 22)
COR_TEXTO = (240, 238, 230)
COR_FORA = (255, 90, 40)


def fonte(tamanho):
    for caminho in (
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial.ttf",
    ):
        if os.path.exists(caminho):
            return ImageFont.truetype(caminho, tamanho)
    return ImageFont.load_default()


def painel_jogo(rec, lotes):
    """A primeira coluna: o jogo visto de cima, no espaco do jogo."""
    img = Image.new("RGB", (LADO, LADO), COR_FUNDO)
    d = ImageDraw.Draw(img, "RGBA")
    cx, cz = rec["centro"]
    raio = rec["raio"]
    esc = (LADO / 2) / raio  # pixels por unidade de jogo

    def para(x, z):
        return (LADO / 2 + (x - cx) * esc, LADO / 2 + (z - cz) * esc)

    # as testadas da planta (a rede viaria de 1932), embaixo das casas
    for t in rec["testadas"]:
        d.line([para(t[0], t[1]), para(t[2], t[3])], fill=COR_TESTADA + (200,), width=2)

    # os lotes oficiais
    for anel in lotes:
        pontos = [para(p[0], p[1]) for p in anel]
        if len(pontos) > 2:
            d.polygon(pontos, fill=(80, 110, 70, 60))

    # as casas do jogo
    for c in rec["casas"]:
        pontos = [para(p[0], p[1]) for p in c["pontos"]]
        cor = CORES_TIPO.get(c["tipo"], (190, 190, 190))
        d.polygon(pontos, fill=cor + (240,), outline=(70, 50, 30, 255), width=1)
        # a frente: no jogo a fachada fica no lado +normal, que sao os cantos
        # 2 e 3 (a ordem e fundo-esq, fundo-dir, frente-dir, frente-esq)
        frente = [pontos[2], pontos[3]]
        d.line(frente, fill=(255, 248, 220, 255), width=3)

    # os lotes por cima: e a leitura que importa (a casa dentro do lote?)
    for anel in lotes:
        pontos = [para(p[0], p[1]) for p in anel]
        if len(pontos) > 2:
            d.line(pontos + [pontos[0]], fill=COR_LOTE + (170,), width=1)

    d.rectangle([0, 0, LADO, 42], fill=(0, 0, 0, 170))
    d.text((12, 7), "1. O JOGO (espaco do jogo)", font=fonte(FONTE_T), fill=COR_TEXTO)
    d.text((12, LADO - 26), "azul: o lote oficial   laranja: a testada da planta",
           font=fonte(FONTE_P), fill=COR_TEXTO)
    return img


def painel_real(rec, lotes):
    """A segunda coluna: o jogo no espaco de verdade (lon/lat), sobre os lotes."""
    img = Image.new("RGB", (LADO, LADO), COR_FUNDO)
    d = ImageDraw.Draw(img, "RGBA")
    lon0, lon1 = rec["lonlat"]["lon_min"], rec["lonlat"]["lon_max"]
    lat0, lat1 = rec["lonlat"]["lat_min"], rec["lonlat"]["lat_max"]
    larg_m = (lon1 - lon0) * METRO_LON
    alt_m = (lat1 - lat0) * METRO_LAT
    esc = min(LADO / larg_m, LADO / alt_m)
    cx = (lon0 + lon1) / 2
    cy = (lat0 + lat1) / 2

    def para(lon, lat):
        return (LADO / 2 + (lon - cx) * METRO_LON * esc, LADO / 2 - (lat - cy) * METRO_LAT * esc)

    for anel in lotes:
        pontos = [para(p[0], p[1]) for p in anel]
        if len(pontos) > 2:
            d.polygon(pontos, fill=(80, 110, 70, 60))

    for c in rec["casas"]:
        pontos = [para(p[0], p[1]) for p in c["lonlat"]]
        cor = CORES_TIPO.get(c["tipo"], (190, 190, 190))
        d.polygon(pontos, fill=cor + (240,), outline=(70, 50, 30, 255), width=1)
        d.line([pontos[2], pontos[3]], fill=(255, 248, 220, 255), width=3)

    for anel in lotes:
        pontos = [para(p[0], p[1]) for p in anel]
        if len(pontos) > 2:
            d.line(pontos + [pontos[0]], fill=COR_LOTE + (190,), width=1)

    d.rectangle([0, 0, LADO, 42], fill=(0, 0, 0, 170))
    d.text((12, 7), "2. O JOGO no espaco de verdade", font=fonte(FONTE_T), fill=COR_TEXTO)
    d.text((12, LADO - 26), "as mesmas casas, sem a distorcao da escala",
           font=fonte(FONTE_P), fill=COR_TEXTO)
    return img


def painel_planta(rec, malha, janela):
    """A terceira coluna: a planta oficial (o raster), da mesma area."""
    j = janela
    lon_min = rec["lonlat"]["lon_min"]
    lon_max = rec["lonlat"]["lon_max"]
    lat_min = rec["lonlat"]["lat_min"]
    lat_max = rec["lonlat"]["lat_max"]
    px0 = (lon_min - j["lon_min"]) / (j["lon_max"] - j["lon_min"]) * j["pixels"][0]
    px1 = (lon_max - j["lon_min"]) / (j["lon_max"] - j["lon_min"]) * j["pixels"][0]
    py0 = (j["lat_max"] - lat_max) / (j["lat_max"] - j["lat_min"]) * j["pixels"][1]
    py1 = (j["lat_max"] - lat_min) / (j["lat_max"] - j["lat_min"]) * j["pixels"][1]
    caixa = (int(px0), int(py0), int(px1), int(py1))
    if caixa[2] <= caixa[0] or caixa[3] <= caixa[1]:
        return Image.new("RGB", (LADO, LADO), (40, 40, 40))
    pedaco = malha.crop(caixa)
    w, h = pedaco.size
    esc = min(LADO / w, LADO / h)
    novo = pedaco.resize((max(1, int(w * esc)), max(1, int(h * esc))), Image.LANCZOS)
    img = Image.new("RGB", (LADO, LADO), (60, 66, 76))
    img.paste(novo, ((LADO - novo.size[0]) // 2, (LADO - novo.size[1]) // 2))
    d = ImageDraw.Draw(img, "RGBA")
    d.rectangle([0, 0, LADO, 42], fill=(0, 0, 0, 170))
    d.text((12, 7), "3. A PLANTA OFICIAL DE 1932", font=fonte(FONTE_T), fill=COR_TEXTO)
    return img


def main():
    with open(JSON) as f:
        dados = json.load(f)
    with open(DADOS) as f:
        janela = json.load(f)["janela"]
    malha = Image.open(MALHA)
    os.makedirs(SAIDA, exist_ok=True)
    por_nome = {l["nome"]: l for l in dados["lotes"]}
    for rec in dados["recortes"]:
        aneis = por_nome.get(rec["nome"], {})
        aneisJogo = aneis.get("aneis", [])
        aneisLL = aneis.get("aneisLL", [])
        col1 = painel_jogo(rec, aneisJogo)
        col2 = painel_real(rec, aneisLL)
        col3 = painel_planta(rec, malha, janela)
        # a faixa dos numeros
        faixa = Image.new("RGB", (LADO * 3, 70), (14, 16, 13))
        df = ImageDraw.Draw(faixa)
        num = next(n for n in dados["numeros"] if n["nome"] == rec["nome"])
        textos = [
            f"{num['titulo']}  -  {num['casas']} casas  -  {num['metrosPorUn']} m/un no jogo",
            f"dentro do lote {num['pctCentroDentro']}% (os 4 cantos {num['pctCantosDentro']}%)  |  "
            f"fachada para a rua {num['pctFachadaParaRua']}%  |  parede cruzando a rua {num['pctParedeCruzaRua']}%",
            f"testada construida {num['testadaConstruida']}%  |  na grade de Herbster {num['pctNaGrade']}%  |  "
            f"estouro do lote: medio {num['estouroMedio']} m, p90 {num['estouroP90']} m",
        ]
        for i, t in enumerate(textos):
            df.text((14, 8 + i * 21), t, font=fonte(FONTE_P if i else FONTE_T), fill=COR_TEXTO)
        linha = Image.new("RGB", (LADO * 3, LADO + faixa.size[1]), (14, 16, 13))
        linha.paste(faixa, (0, 0))
        linha.paste(col1, (0, faixa.size[1]))
        linha.paste(col2, (LADO, faixa.size[1]))
        linha.paste(col3, (LADO * 2, faixa.size[1]))
        caminho = os.path.join(SAIDA, f"conferencia-{rec['nome']}.png")
        linha.save(caminho)
        print(f"  {caminho}")


if __name__ == "__main__":
    main()
