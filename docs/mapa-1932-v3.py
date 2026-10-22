#!/usr/bin/env python3
"""Maresia - mapa de Fortaleza em 1932 (v3).

Gera tres coisas a partir de uma unica fonte de verdade:

  docs/mapa-1932-v3.svg      desenho do mapa (planta de 1932)
  docs/mapa-1932-v3.png      o mesmo desenho rasterizado
  src/mundo/mapa1932-dados.json   dados do mapa para o motor ler

A base geografica e oficial: a camada "Evolucao Urbana 1932" da Prefeitura de
Fortaleza (10.519 lotes com uso por lote em 1932), em EPSG 31984 / lon-lat.
O script baixa o arquivo se ele nao estiver no cache e nunca grava o GeoJSON
no repositorio (9 MB; o projeto guarda so o que o jogo carrega).

O desenho e vetorial de verdade: cada lote e um poligono desenhado no lugar,
encolhido 2,2 m para que a malha de ruas apareca como vao. Por cima vao os
vetores do mapa: mar, areia, rios, lagoas, trilho, bondes, o Campo do Urubu e
os lugares com nome.

Marcas de confianca, em todo lugar:
  D  documentado (fonte citada em docs/mapa-1932.md)
  H  hipotese (aIBRADA em tracejado, com nota)

Uso:  python3 docs/mapa-1932-v3.py
"""

import json
import math
import os
import subprocess
import urllib.request

from PIL import Image, ImageDraw

# ---------------------------------------------------------------- base

GEOJSON_URL = "https://mapas.fortaleza.ce.gov.br/api/download/geojson/697"
CACHE = "/tmp/lotes1932.geojson"
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ancora local de projecao (equidistante, boa demais num raio de 10 km)
LON0, LAT0 = -38.5280, -3.7250
MX = 111320.0 * math.cos(math.radians(LAT0))
MZ = 110574.0


def para_m(lon, lat):
    """lon/lat -> metros locais. x cresce para leste, z cresce para o sul."""
    return ((lon - LON0) * MX, -(lat - LAT0) * MZ)


def para_ll(x, z):
    return (LON0 + x / MX, LAT0 - z / MZ)


def baixar_lotes():
    if os.path.exists(CACHE) and os.path.getsize(CACHE) > 1_000_000:
        return CACHE
    print("baixando a camada de lotes de 1932 ...")
    req = urllib.request.Request(GEOJSON_URL, headers={"User-Agent": "Maresia/1.0"})
    with urllib.request.urlopen(req, timeout=240) as r:
        dados = r.read()
    with open(CACHE, "wb") as f:
        f.write(dados)
    print(f"  {len(dados)/1e6:.1f} MB em {CACHE}")
    return CACHE


# ---------------------------------------------------------------- uso de 1932

USO_COR = {
    "Residencial": "#d8c9a8",
    "Comercial": "#e0ab4f",
    "Prestacao servicos": "#c7b189",
    "Institucional": "#a6bacb",
    "Saude": "#b9d1ba",
    "Transporte": "#8b8b86",
    "Hotelaria": "#d2a4bb",
    "Religioso": "#9c4340",
    "Instrucao": "#a5c39a",
    "Do lazer": "#c7b3d5",
    "Desportivo": "#b6c7d5",
    "Industrial": "#c0742a",
    "Fechado": "#bdbdb2",
    "Comunicacao": "#8e7ea7",
    "Sem": "#d8c9a8",
}

# ---------------------------------------------------------------- janela do desenho

# duas vistas: a geral (com o campo do Urubu) e o detalhe do centro (em escala)
VISTAS = {
    "geral": {
        "lon": (-38.5785, -38.4950), "lat": (-3.7600, -3.7035),
        "painel": 2750, "texto": 1.0, "margem": 260,
        "saida": "mapa-1932-v3",
    },
    "centro": {
        "lon": (-38.5520, -38.5020), "lat": (-3.7490, -3.7090),
        "painel": 0, "texto": 1.42, "margem": 160,
        "saida": "mapa-1932-v3-centro",
    },
}

LON_A, LON_B = VISTAS["geral"]["lon"]
LAT_A, LAT_B = VISTAS["geral"]["lat"]
MAP_X0, _ = para_m(LON_A, 0)
MAP_X1, _ = para_m(LON_B, 0)
_, MAP_Z0 = para_m(0, LAT_B)
_, MAP_Z1 = para_m(0, LAT_A)

MARGEM = 260
PAINEL = 2750
ESCALA_TEXTO = 1.0
LARG = (MAP_X1 - MAP_X0) + 2 * MARGEM + PAINEL
ALT = (MAP_Z1 - MAP_Z0) + 2 * MARGEM
# o mapa e desenhado com o zero na ancora (LON0/LAT0): o grupo o desloca
# para dentro da folha, e o painel fica fora do grupo.
OFF_X = MARGEM - MAP_X0
OFF_Y = MARGEM - MAP_Z0

PX_LARG = 2800
PX_ALT = round(PX_LARG * ALT / LARG)

# ---------------------------------------------------------------- lugares (lon, lat)
# D = documentado (fonte em docs/mapa-1932.md) | H = hipotese

LUGARES = [
    # chave, nome, lon, lat, papel, confianca, dx do rotulo, dy do rotulo, legenda?
    ("pracaFerreira", "Praça do Ferreira", -38.52758, -3.72746, "centro dos bondes", "D", -40, 300, True),
    ("passeioPublico", "Passeio Público", -38.52630, -3.72264, "", "D", 230, -170, False),
    ("fonte", "Forte", -38.52468, -3.72274, "", "D", 260, 40, False),
    ("se", "Sé", -38.52503, -3.72402, "", "D", -230, 120, False),
    ("santaCasa", "Santa Casa", -38.52756, -3.72222, "", "D", -330, -60, False),
    ("pracaLeoes", "Praça dos Leões", -38.52626, -3.72693, "", "D", -40, 190, False),
    ("theatro", "Theatro", -38.53171, -3.72779, "1911", "D", -190, -110, False),
    ("estacao", "Estação Central", -38.53020, -3.72195, "prédio de 1880", "D", -300, -150, True),
    ("pracaEstacao", "Praça Castro Carreira", -38.52996, -3.72222, "", "D", 230, 150, False),
    ("cemiterio", "Cemitério S. João Batista", -38.53864, -3.72013, "fim da linha do Mororó", "D", -90, -70, True),
    ("mercado", "Mercado Público", -38.52433, -3.72329, "", "D", 300, 250, False),
    ("parqueLiberdade", "Parque da Liberdade", -38.52584, -3.73146, "", "D", 150, 120, False),
    ("pracaMestres", "Praça dos Mártires", -38.52570, -3.72150, "", "H", 120, -260, False),
    ("ponteVelha", "Ponte Velha (Metálica)", -38.51996, -3.71657, "o porto velho", "D", 160, -120, True),
    ("ponteIngleses", "Ponte dos Ingleses", -38.51681, -3.71805, "", "D", 70, 110, False),
    ("pocoDraga", "Poço da Draga", -38.52097, -3.71945, "", "H", -180, -190, False),
    ("colégioMilitar", "Colégio Militar", -38.51771, -3.73008, "fim da linha do Outeiro", "D", 70, -70, True),
    # o meio do recinto que a Planta de 1931-1932 desenha (src/mundo/ferrovia1932.json, "patios"; antes H, -38.5646 -3.7156)
    ("oficinasUrubu", "Oficinas do Urubu (RVC)", -38.56886, -3.71483, "inauguradas em 4/out/1930", "D", 90, 120, True),
    ("vilaFerroviaria", "Vila Demósthenes Rockert", -38.56780, -3.71410, "vila operária", "H", -90, -70, True),
    # o meio do poligono do campo (CAMPO, depois de MOVER_CAMPO; antes -38.5700 -3.7176)
    ("campoUrubu", "Campo do Urubu", -38.56131, -3.71497, "", "H", 0, 0, False),
    ("estacaoOtavio", "Estação Otávio Bonfim", -38.54370, -3.73138, "campo do Matadouro", "D", -80, -60, True),
    ("lagoaPorangabussu", "Lagoa de Porangabussu", -38.55076, -3.74416, "", "D", 80, -40, False),
    ("barraCeara", "Barra do Ceará", -38.59000, -3.69600, "foz do Rio Ceará", "H", 80, 60, True),
    ("favela1932", "Favela", -38.52612, -3.72959, "", "D", 120, -120, False),
]


# no detalhe do centro cada marco ganha um angulo proprio, com linha de chamada
CENTRO_OFFSETS = {
    "pracaFerreira": (-360, 330), "passeioPublico": (-430, -700),
    "fonte": (430, -520), "se": (880, -300), "santaCasa": (-780, -60),
    "pracaLeoes": (-830, 140), "theatro": (-950, -60), "estacao": (-540, -430),
    "pracaEstacao": (-650, -190), "cemiterio": (-180, -150), "mercado": (920, 300),
    "parqueLiberdade": (-120, 780), "pracaMestres": (-140, -900),
    "ponteVelha": (300, -760), "ponteIngleses": (780, -560),
    "pocoDraga": (1120, -320), "colégioMilitar": (900, 560), "favela1932": (290, 520),
}

# ---------------------------------------------------------------- vetores

COSTA = [
    (-38.64, -3.682), (-38.612, -3.688), (-38.603, -3.6915), (-38.5995, -3.6945),
    (-38.597, -3.693), (-38.591, -3.6955), (-38.584, -3.6985), (-38.576, -3.7015),
    (-38.568, -3.7045), (-38.561, -3.7072), (-38.554, -3.7102), (-38.547, -3.7128),
    (-38.541, -3.715), (-38.536, -3.7165), (-38.531, -3.7182), (-38.5275, -3.7186),
    (-38.5262, -3.7172), (-38.5248, -3.718), (-38.521, -3.7178), (-38.517, -3.7176),
    (-38.512, -3.7188), (-38.506, -3.72), (-38.499, -3.7212), (-38.492, -3.7216),
    (-38.486, -3.7208), (-38.481, -3.7186), (-38.4775, -3.7158), (-38.4745, -3.7136),
    (-38.471, -3.714), (-38.466, -3.7168), (-38.459, -3.721), (-38.452, -3.726),
    (-38.444, -3.732), (-38.436, -3.739),
]

RIO_CEARA = [
    (-38.5975, -3.6935), (-38.6005, -3.7), (-38.596, -3.707), (-38.603, -3.714),
    (-38.5965, -3.722), (-38.6045, -3.731), (-38.598, -3.74), (-38.606, -3.75),
    (-38.6, -3.762), (-38.605, -3.772),
]

PAJEU = [
    (-38.512, -3.746), (-38.5165, -3.74), (-38.5185, -3.734), (-38.5215, -3.729),
    (-38.5235, -3.7245), (-38.5255, -3.7212), (-38.527, -3.7192),
]

LAGOAS = [
    ("Açude João Lopes", -38.5565, -3.7275, 24, 9),
]

# bondes: sempre partem da Praça do Ferreira (1913-1947, The Ceará Tramway Light & Power)
# distancias em metros, como no Almanach de 1918
BONDES = [
    ("Estação", 2450, [(-38.52758, -3.72746), (-38.52996, -3.72222)]),
    ("Via-Férrea", 930, [(-38.52758, -3.72746), (-38.52880, -3.72450),
                         (-38.52940, -3.72290), (-38.53020, -3.72195)]),
    ("Praia", 1530, [(-38.52758, -3.72746), (-38.52500, -3.72400),
                     (-38.52250, -3.72000), (-38.51996, -3.71657)]),
    ("Mororó", 1100, [(-38.52758, -3.72746), (-38.53150, -3.72400),
                      (-38.53600, -3.72150), (-38.53864, -3.72013)]),
    ("Matadouro", 4200, [(-38.52758, -3.72746), (-38.53300, -3.72950),
                         (-38.53800, -3.73080), (-38.54370, -3.73138)]),
    ("Alagadiço", 5440, [(-38.52758, -3.72746), (-38.53300, -3.73000),
                         (-38.54200, -3.73500), (-38.55650, -3.73700)]),
    ("Benfica", 2630, [(-38.52758, -3.72746), (-38.53000, -3.73500),
                       (-38.53400, -3.74200), (-38.53700, -3.74600)]),
    ("Outeiro", 2500, [(-38.52758, -3.72746), (-38.52300, -3.72900),
                       (-38.51900, -3.73000), (-38.51771, -3.73008)]),
    ("Fernandes Vieira", 1800, [(-38.52758, -3.72746), (-38.52100, -3.72750),
                                (-38.51600, -3.72730), (-38.51200, -3.72700)]),
]

TRILHOS = [
    ("Ferrovia do Baturité: Central → Arronches", "D",
     [(-38.53020, -3.72195), (-38.53450, -3.71900), (-38.54000, -3.71750),
      (-38.54700, -3.71600), (-38.55400, -3.71400), (-38.56200, -3.71100),
      (-38.57000, -3.70800)]),
    ("Ramal do Urubu: Central → Oficinas (Trem dos Operários)", "H",
     [(-38.53020, -3.72195), (-38.53600, -3.71900), (-38.54600, -3.71600),
      (-38.55600, -3.71560), (-38.56460, -3.71560)]),
    ("Ligação da EFB ao trapiche do Poço das Dragas", "H",
     [(-38.53020, -3.72195), (-38.52700, -3.72380), (-38.52500, -3.72600)]),
]

# Campo do Urubu: area de reconstrucao (a localizacao exata nao e sabida)
# CAMPO_V3 e o poligono do desenho v3. Ele caia em cima do recinto das Oficinas da RVC, que a Planta de
# 1931-1932 desenha (src/mundo/ferrovia1932.json, "patios"). Desde 22/10/2026 (docs/mapa-1932.md, v17) o mesmo
# poligono, com a mesma forma e o mesmo tamanho, e girado e levado para o lado das oficinas, entre a Linha Norte e
# o mar (o campo ficava "na praia nao muito proximo do mar", perto das oficinas, isolado da cidade pela linha):
# MOVER_CAMPO leva o meio do lado do portao (P4-P3) de "de" para "para" e gira tudo "giro_graus" (anti-horario,
# com o norte para cima). Tudo o que sai do poligono (as tarefas, os galpoes e as construcoes do desenho) vai junto.
CAMPO_V3 = [(-38.5745, -3.7205), (-38.5705, -3.7218), (-38.5660, -3.7200),
            (-38.5642, -3.7166), (-38.5672, -3.7142), (-38.5722, -3.7152),
            (-38.5752, -3.7178)]
MOVER_CAMPO = {"de": (-38.5657, -3.7154), "para": (-38.556355, -3.715663), "giro_graus": -39.28}


def mover_campo(lon, lat):
    """o ponto do desenho v3 no lugar do campo de 22/10/2026 (rigido: mesma forma, mesmo tamanho)"""
    (lon0, lat0), (lon1, lat1) = MOVER_CAMPO["de"], MOVER_CAMPO["para"]
    e, n = (lon - lon0) * MX, (lat - lat0) * MZ
    t = math.radians(MOVER_CAMPO["giro_graus"])
    e2, n2 = e * math.cos(t) - n * math.sin(t), e * math.sin(t) + n * math.cos(t)
    return (lon1 + e2 / MX, lat1 + n2 / MZ)


CAMPO = {
    "poligono": [mover_campo(*p) for p in CAMPO_V3],
    "tarefas": 20,
    "galpoes": 4,
}

BAIRROS = [
    ("Barra do Ceará", -38.5880, -3.7030, "D"), ("Urubu", -38.5752, -3.7088, "H"),
    ("Pirambu", -38.5640, -3.7120, "D"), ("Jacarecanga", -38.5480, -3.7215, "D"),
    ("Moura Brasil", -38.5380, -3.7190, "D"), ("Centro", -38.5300, -3.7330, "D"),
    ("Praia Formosa", -38.5345, -3.7225, "D"), ("Poço da Draga", -38.5235, -3.7145, "D"),
    ("Praia de Iracema", -38.5150, -3.7185, "D"), ("Prainha", -38.5165, -3.7285, "D"),
    ("Aldeota", -38.5050, -3.7350, "D"), ("Meireles", -38.4950, -3.7250, "D"),
    ("Mucuripe", -38.4780, -3.7180, "D"), ("Alagadiço", -38.5560, -3.7370, "D"),
    ("Otávio Bonfim", -38.5485, -3.7345, "D"), ("Benfica", -38.5370, -3.7420, "D"),
    ("Tauape", -38.5220, -3.7520, "D"),
]

# ---------------------------------------------------------------- desenho

class Desenho:
    def __init__(self):
        self.parts = []

    def add(self, s):
        self.parts.append(s)

    def svg(self):
        return "\n".join(self.parts)


def aplicar_vista(nome):
    """Ajusta as globais para a vista pedida (geral ou centro)."""
    global LON_A, LON_B, LAT_A, LAT_B, MAP_X0, MAP_X1, MAP_Z0, MAP_Z1
    global MARGEM, PAINEL, ESCALA_TEXTO, LARG, ALT, PX_LARG, PX_ALT
    global OFF_X, OFF_Y
    v = VISTAS[nome]
    LON_A, LON_B = v["lon"]
    LAT_A, LAT_B = v["lat"]
    MAP_X0, _ = para_m(LON_A, 0)
    MAP_X1, _ = para_m(LON_B, 0)
    _, MAP_Z0 = para_m(0, LAT_B)
    _, MAP_Z1 = para_m(0, LAT_A)
    MARGEM = v["margem"]
    PAINEL = v["painel"]
    ESCALA_TEXTO = v["texto"]
    LARG = (MAP_X1 - MAP_X0) + 2 * MARGEM + PAINEL
    ALT = (MAP_Z1 - MAP_Z0) + 2 * MARGEM
    OFF_X = MARGEM - MAP_X0
    OFF_Y = MARGEM - MAP_Z0
    PX_LARG = 2800 if nome == "geral" else 2200
    PX_ALT = round(PX_LARG * ALT / LARG)


def esc(s):
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def poligono(pontos):
    return " ".join(f"{x:.1f},{z:.1f}" for x, z in pontos)


def caminho(pontos, fechar=True):
    d = "M " + " L ".join(f"{x:.1f},{z:.1f}" for x, z in pontos)
    return d + (" Z" if fechar else "")


def texto(d, x, z, txt, tam=62, cor="#3b3226", ancora="middle", peso="normal",
          italico=False, familia="Georgia, 'Times New Roman', serif", halo="#f4ecd8"):
    tam = tam * ESCALA_TEXTO
    estilo = f'font-family="{familia}" font-size="{tam}" fill="{cor}"'
    if peso != "normal":
        estilo += f' font-weight="{peso}"'
    if italico:
        estilo += ' font-style="italic"'
    d.add(f'<text x="{x:.1f}" y="{z:.1f}" text-anchor="{ancora}" {estilo} '
          f'stroke="{halo}" stroke-width="{tam*0.16:.1f}" paint-order="stroke">{esc(txt)}</text>')


def desenhar_lotes(d, feats):
    """Cada lote vira um poligono encolhido: o vao entre eles e a rua."""
    n = 0
    for ft in feats:
        props = ft.get("properties") or {}
        uso = props.get("HISTORIC_1") or "Sem"
        hist = props.get("HISTORICO") or "Predial"
        cor = USO_COR.get(uso, USO_COR["Sem"])
        if hist == "Favela":
            cor = "#6b4a2e"
        g = ft.get("geometry")
        if not g:
            continue
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        for poly in polys:
            for ring in poly:
                pts = [para_m(lon, lat) for lon, lat in ring]
                if len(pts) < 3:
                    continue
                cx = sum(p[0] for p in pts) / len(pts)
                cz = sum(p[1] for p in pts) / len(pts)
                r = sum(math.hypot(p[0] - cx, p[1] - cz) for p in pts) / len(pts)
                k = max(0.55, 1 - 2.2 / max(r, 1e-6))
                shrunk = [(cx + (x - cx) * k, cz + (z - cz) * k) for x, z in pts]
                d.add(f'<path d="{caminho(shrunk)}" fill="{cor}" fill-rule="evenodd"/>')
                n += 1
    return n


def linha(pontos, cor="#4a3f30", esp=6, tracejado=None, opacidade=1.0):
    attrs = f'fill="none" stroke="{cor}" stroke-width="{esp}" stroke-linejoin="round" stroke-linecap="round"'
    if tracejado:
        attrs += f' stroke-dasharray="{tracejado}"'
    if opacidade != 1.0:
        attrs += f' opacity="{opacidade}"'
    return f'<path d="{caminho(pontos, fechar=False)}" {attrs}/>'


def borda_do_urubu():
    """Linha do Serumario: a borda norte do tecido construido de 1932."""
    caminho = baixar_lotes()
    feats = json.load(open(caminho))["features"]
    x0, x1 = -7800, 7600
    z0, z1 = -1800, 1500
    w, h = x1 - x0, z1 - z0
    img = Image.new("L", (w, h), 0)
    dr = ImageDraw.Draw(img)
    for ft in feats:
        g = ft.get("geometry")
        if not g:
            continue
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        for poly in polys:
            for ring in poly:
                pts = []
                for lon, lat in ring:
                    x, z = para_m(lon, lat)
                    pts.append((x - x0, z - z0))
                if len(pts) >= 3:
                    dr.polygon(pts, fill=255)
    px = img.load()
    linha_serum = []
    for x in range(x0 + 60, x1 - 60, 40):
        z_encontrado = None
        for z in range(0, 900):
            if px[x - x0, z]:
                z_encontrado = z0 + z
                break
        if z_encontrado is not None:
            linha_serum.append((x, z_encontrado))
    # suaviza: media de janela de 5
    suave = []
    for i in range(len(linha_serum)):
        trecho = linha_serum[max(0, i - 2): i + 3]
        suave.append((linha_serum[i][0], sum(p[1] for p in trecho) / len(trecho)))
    return suave


def montar(vista="geral"):
    aplicar_vista(vista)
    feats = json.load(open(baixar_lotes()))["features"]
    d = Desenho()
    d.add(f'<svg xmlns="http://www.w3.org/2000/svg" width="{PX_LARG}" height="{PX_ALT}" '
          f'viewBox="0 0 {LARG:.0f} {ALT:.0f}">')
    d.add('<defs>'
          '<pattern id="hachura" width="26" height="26" patternTransform="rotate(45)" '
          'patternUnits="userSpaceOnUse">'
          '<line x1="0" y1="0" x2="0" y2="26" stroke="#a8916a" stroke-width="7"/></pattern>'
          '<pattern id="malha" width="40" height="40" patternUnits="userSpaceOnUse">'
          '<path d="M40 0 L0 0 0 40" fill="none" stroke="#c2b18c" stroke-width="3"/></pattern>'
          '</defs>')
    d.add(f'<rect x="0" y="0" width="{LARG:.0f}" height="{ALT:.0f}" fill="#f4ecd8"/>')
    d.add(f'<rect x="0" y="0" width="{LARG:.0f}" height="{(MARGEM + 260) * ESCALA_TEXTO:.0f}" '
          f'fill="#f4ecd8" opacity="0.88"/>')


    # ---- mar e areia
    costa_m = [para_m(lon, lat) for lon, lat in COSTA]
    serum = borda_do_urubu()
    d.add(f'<g transform="translate({OFF_X:.0f},{OFF_Y:.0f})">')
    d.add(f'<rect x="{MAP_X0 - MARGEM:.0f}" y="{MAP_Z0 - MARGEM:.0f}" '
          f'width="{MAP_X1 - MAP_X0 + 2*MARGEM:.0f}" height="{MAP_Z1 - MAP_Z0 + 2*MARGEM:.0f}" '
          f'fill="#f4ecd8"/>')
    # a costa recortada na janela: sem isso o mar vaza como um triangulo
    XJ0, XJ1 = MAP_X0 - MARGEM, MAP_X1 + MARGEM
    ZJ0 = MAP_Z0 - MARGEM
    def recorta(pontos):
        saida = []
        for i in range(len(pontos) - 1):
            (x1, z1), (x2, z2) = pontos[i], pontos[i + 1]
            dentro = []
            for t in [k / 40 for k in range(41)]:
                x = x1 + (x2 - x1) * t
                z = z1 + (z2 - z1) * t
                if XJ0 - 1 <= x <= XJ1 + 1 and ZJ0 - 1 <= z <= MAP_Z1:
                    dentro.append((x, z))
            if len(dentro) > 1:
                saida.extend(dentro if not saida else dentro[1:])
        return saida
    costa_janela = recorta(costa_m)
    if len(costa_janela) > 1:
        mar = costa_janela + [(costa_janela[-1][0], ZJ0), (costa_janela[0][0], ZJ0)]
        d.add(f'<path d="{caminho(mar)}" fill="#b7cbd4"/>')
        for k in range(7):
            y = ZJ0 + 120 + k * 95
            d.add('<path d="M ' + f"{costa_janela[0][0]:.0f} {y:.0f} " +
                  " ".join(f"L {x:.0f} {y + 40*math.sin(i*0.6):.0f}"
                           for i, (x, _z) in enumerate(costa_janela)) +
                  '" fill="none" stroke="#9db6c2" stroke-width="7" opacity="0.55"/>')
    # areia: entre a linha do Serumario (borda dos lotes) e a costa
    if serum and len(costa_janela) > 1:
        faixa = []
        for x, z in serum:
            if not (XJ0 <= x <= XJ1):
                continue
            cx = min(costa_janela, key=lambda p: abs(p[0] - x))
            if z > cx[1] + 8:
                faixa.append((x, z))
        if len(faixa) > 4:
            frente = [(x, min(z, min(p[1] for p in costa_janela if abs(p[0] - x) < 260) - 6))
                      for x, z in faixa]
            poly = frente + list(reversed(faixa))
            d.add(f'<path d="{caminho(poly)}" fill="#eadcb4" opacity="0.95"/>')

    # ---- tecido construido
    n = desenhar_lotes(d, feats)
    print(f"  {n} poligonos de lote desenhados")

    # ---- rios e lagoas
    d.add(linha([para_m(a, b) for a, b in RIO_CEARA], cor="#8fb0c0", esp=26))
    d.add(linha([para_m(a, b) for a, b in PAJEU], cor="#8fb0c0", esp=12, tracejado="40 22"))
    for nome, lon, lat, rx, rz in LAGOAS:
        x, z = para_m(lon, lat)
        d.add(f'<ellipse cx="{x:.0f}" cy="{z:.0f}" rx="{rx}" ry="{rz}" fill="#a9c6d2" '
              f'stroke="#7fa3b4" stroke-width="5"/>')
        texto(d, x, z + rz + 55, nome, 46, "#3f5a63", italico=True)

    # ---- trilhos
    for nome, conf, pts in TRILHOS:
        d.add(linha([para_m(a, b) for a, b in pts], cor="#3a3128", esp=11,
                    tracejado=None if conf == "D" else "34 20"))
        d.add(linha([para_m(a, b) for a, b in pts], cor="#f4ecd8", esp=4,
                    tracejado="18 22"))
        if vista == "geral":
            mx, mz = para_m(*pts[0])
            texto(d, mx, mz - 60, nome, 44, "#3a3128", peso="bold")

    # ---- bondes
    for nome, dist, pts in BONDES:
        m = [para_m(a, b) for a, b in pts]
        d.add(linha(m, cor="#2f5d75", esp=9, tracejado="52 26"))
        if nome in ("Praia", "Alagadiço", "Outeiro", "Mororó", "Matadouro", "Estação"):
            texto(d, m[-1][0], m[-1][1] + 78, f"{nome} ({dist} m)", 42, "#2f5d75",
                  italico=True)

    # ---- Campo do Urubu
    pol = [para_m(a, b) for a, b in CAMPO["poligono"]]
    d.add(f'<path d="{caminho(pol)}" fill="url(#hachura)" fill-opacity="0.5" '
          f'stroke="#8c3b2f" stroke-width="12" stroke-dasharray="60 34"/>')
    # as 20 tarefas (cercadas com arame), os galpoes e as construcoes: os pontos de campo_lugares() (os mesmos do
    # jogo, ja no lugar de MOVER_CAMPO); os retangulos ficam alinhados ao papel (o desenho e esquematico)
    cx = sum(p[0] for p in pol) / len(pol)
    cz = sum(p[1] for p in pol) / len(pol)
    lug = campo_lugares()
    for t in lug["tarefas"]:
        px_, pz_ = para_m(t["lon"], t["lat"])
        d.add(f'<rect x="{px_-70:.0f}" y="{pz_-42:.0f}" width="140" height="84" '
              f'fill="none" stroke="#8c3b2f" stroke-width="6" stroke-dasharray="22 12"/>')
    # galpoes de folha de zinco
    for gp in lug["galpoes"]:
        gx, gz = para_m(gp["lon"], gp["lat"])
        d.add(f'<rect x="{gx:.0f}" y="{gz:.0f}" width="240" height="110" '
              f'fill="#b9b6ad" stroke="#6f6a5e" stroke-width="6"/>')
    # cozinha, posto medico e capela
    for c, (nome, cor) in zip(lug["construcoes"], (("cozinha", "#7c6a3f"), ("posto", "#7c6a3f"), ("capela", "#8c3b2f"))):
        ox, oz = para_m(c["lon"], c["lat"])
        d.add(f'<circle cx="{ox:.0f}" cy="{oz:.0f}" r="34" fill="{cor}" '
              f'stroke="#3b3226" stroke-width="5"/>')
        texto(d, ox, oz + 110, nome, 40, "#5c2a22", italico=True)
    texto(d, cx, cz - 640, "CAMPO DO URBU", 96, "#8c3b2f", peso="bold")
    texto(d, cx, cz - 520, "campo de concentração de retirantes - 1932 (reconstituição)", 50,
          "#8c3b2f", italico=True)
    texto(d, cx, cz - 450, "galpões de zinco, redes em estacas, 20 tarefas cercadas com arame",
          42, "#7a4a42", italico=True)

    # ---- lugares
    for chave, nome, lon, lat, papel, conf, dx, dy, sub in LUGARES:
        if vista == "centro" and chave in CENTRO_OFFSETS:
            dx, dy = CENTRO_OFFSETS[chave]
        x, z = para_m(lon, lat)
        if chave == "campoUrubu":
            continue
        if chave == "favela1932":
            d.add(f'<rect x="{x-95:.0f}" y="{z-70:.0f}" width="190" height="140" fill="#6b4a2e" '
                  f'stroke="#3b2a18" stroke-width="7"/>')
            texto(d, x + 110 * ESCALA_TEXTO, z - 120 * ESCALA_TEXTO, "FAVELA", 46, "#4a3220", peso="bold", ancora="start")
            continue
        cor = "#3b3226" if conf == "D" else "#7a5c3f"
        d.add(f'<circle cx="{x:.0f}" cy="{z:.0f}" r="26" fill="{cor}" stroke="#f4ecd8" stroke-width="9"/>')
        ancora = "end" if dx < 0 else "start"
        dx *= ESCALA_TEXTO * 0.42
        dy *= ESCALA_TEXTO * 0.42
        if dx or dy:
            d.add(linha([(x, z), (x + dx, z + dy)], cor="#8a7a60", esp=4 * ESCALA_TEXTO))
        texto(d, x + dx, z + dy, nome, 52, cor, ancora=ancora, peso="bold")
        if sub and papel:
            texto(d, x + dx, z + dy + 62 * ESCALA_TEXTO, papel, 40, "#6b5c46",
                  ancora=ancora, italico=True)

    # ---- bairros
    for nome, lon, lat, conf in BAIRROS:
        x, z = para_m(lon, lat)
        cor = "#3b3226" if conf == "D" else "#7a5c3f"
        texto(d, x, z, nome, 58, cor, peso="bold")
    d.add('</g>')

    # ---- titulo
    tx = MARGEM + 60
    tz = MARGEM + 120
    titulo = "FORTALEZA EM 1932" if vista == "geral" else "O CENTRO EM 1932"
    sub = ("reconstrucao para o mapa do jogo Maresia - a cidade, o porto e o campo do Urubu"
           if vista == "geral" else
           "detalhe do centro: os bondes, o Passeio Publico, a estacao e o forte")
    texto(d, tx, tz, titulo, 132, "#2f2a22", ancora="start", peso="bold")
    texto(d, tx, tz + 110, sub, 56, "#6b5c46", ancora="start", italico=True)
    texto(d, tx, tz + 185, "malha e uso dos lotes: camada oficial 'Evolucao Urbana 1932' da Prefeitura de Fortaleza (10.519 lotes)",
          44, "#8a7a60", ancora="start", italico=True)

    # ---- legenda (painel a direita, fora do grupo do mapa)
    if PAINEL:
        px0 = OFF_X + MAP_X1 + MARGEM
        pz0 = MARGEM
        d.add(f'<rect x="{px0:.0f}" y="{pz0:.0f}" width="{PAINEL - 200:.0f}" '
              f'height="2280" fill="#f8f2e2" stroke="#c9b78f" stroke-width="6"/>')
    if PAINEL:
        y = pz0 + 130
        texto(d, px0 + 70, y, "LEGENDA", 64, "#2f2a22", ancora="start", peso="bold")
        y += 90
        for uso, cor in USO_COR.items():
            if uso == "Sem":
                continue
            d.add(f'<rect x="{px0+70:.0f}" y="{y-38:.0f}" width="66" height="46" fill="{cor}" '
                  f'stroke="#8a7a60" stroke-width="4"/>')
            texto(d, px0 + 170, y, uso, 46, "#4a3f30", ancora="start")
            y += 64
        y += 20
        for rot, cor, esp, dash in (("malha de ruas e lotes de 1932", "#d8c9a8", 0, None),
                                    ("mar", "#b7cbd4", 0, None),
                                    ("areia da praia", "#eadcb4", 0, None),
                                    ("rio (Pajeu: tracejado = hipotese)", "#8fb0c0", 16, None),
                                    ("linha de bonde (Light, 1913-1947)", "#2f5d75", 11, "52 26"),
                                    ("linha de trem", "#3a3128", 11, None),
                                    ("limite do Campo do Urubu (reconstituicao)", "#8c3b2f", 11, "60 34")):
            if esp:
                d.add(linha([(px0 + 70, y - 14), (px0 + 150, y - 14)], cor=cor, esp=esp, tracejado=dash))
            else:
                d.add(f'<rect x="{px0+70:.0f}" y="{y-38:.0f}" width="80" height="44" fill="{cor}" '
                      f'stroke="#8a7a60" stroke-width="4"/>')
            texto(d, px0 + 180, y, rot, 44, "#4a3f30", ancora="start")
            y += 70
        y += 10
        texto(d, px0 + 70, y, "D  documentado   H  hipotese", 46, "#4a3f30", ancora="start", peso="bold")
        y += 74
        for linha_txt in (
            "O que ainda e hipotese: o limite exato do campo do Urubu, o curso do",
            "riacho Pajeu, o lugar do Poço da Draga em 1932 e a linha da costa no",
            "Mucuripe. Ver docs/mapa-1932.md.",
        ):
            texto(d, px0 + 70, y, linha_txt, 40, "#6b5c46", ancora="start", italico=True)
            y += 52

    # ---- escala e norte
    ex = MARGEM + 80
    ez = OFF_Y + MAP_Z1 + MARGEM - 90
    d.add(f'<rect x="{ex:.0f}" y="{ez:.0f}" width="1000" height="26" fill="#3b3226"/>')
    d.add(f'<rect x="{ex+500:.0f}" y="{ez:.0f}" width="500" height="26" fill="#f4ecd8" stroke="#3b3226" stroke-width="5"/>')
    texto(d, ex, ez - 34, "0", 40, "#3b3226", ancora="start")
    texto(d, ex + 500, ez - 34, "500 m", 40, "#3b3226")
    texto(d, ex + 1000, ez - 34, "1 km", 40, "#3b3226", ancora="end")

    nx = OFF_X + MAP_X1 - 120
    nz = OFF_Y + MAP_Z1 + MARGEM - 300
    d.add(f'<path d="M {nx:.0f} {nz-160:.0f} L {nx-55:.0f} {nz:.0f} L {nx:.0f} {nz-40:.0f} '
          f'L {nx+55:.0f} {nz:.0f} Z" fill="#3b3226"/>')
    texto(d, nx, nz + 80, "N", 60, "#3b3226", peso="bold")

    d.add('</svg>')
    return d.svg()


# ---------------------------------------------------------------- dados para o motor

def campo_lugares():
    """As 20 tarefas, os galpoes e as tres construcoes do campo (H).

    Mesma matematica do desenho: o desenho e o jogo leem os mesmos numeros.
    """
    # a conta e a do desenho v3, no poligono de la; cada ponto vai para o lugar novo por mover_campo
    pol = [para_m(a, b) for a, b in CAMPO_V3]
    cx = sum(p[0] for p in pol) / len(pol)
    cz = sum(p[1] for p in pol) / len(pol)

    def ll_novo(x, z):
        return mover_campo(*para_ll(x, z))
    tarefas = []
    for i in range(CAMPO["tarefas"]):
        a = i * 2 * math.pi / CAMPO["tarefas"]
        rr = 210 + 120 * (0.5 + 0.5 * math.sin(i * 1.7))
        x = cx + math.cos(a) * rr * 1.55
        z = cz + math.sin(a) * rr * 0.72
        tarefas.append({"lon": ll_novo(x, z)[0], "lat": ll_novo(x, z)[1],
                        "largura_m": 140, "profundidade_m": 84})
    galpoes = []
    for i in range(CAMPO["galpoes"]):
        x = cx - 560 + i * 300
        z = cz - 340
        galpoes.append({"lon": ll_novo(x, z)[0], "lat": ll_novo(x, z)[1],
                        "largura_m": 240, "profundidade_m": 110})
    construcoes = []
    for dx, dz, nome in ((-120, 150, "cozinha"), (120, 150, "posto medico"), (0, 260, "capela")):
        x, z = cx + dx, cz + dz
        construcoes.append({"nome": nome, "lon": ll_novo(x, z)[0], "lat": ll_novo(x, z)[1],
                            "raio_m": 34})
    return {"tarefas": tarefas, "galpoes": galpoes, "construcoes": construcoes}


def gerar_dados():
    """Escreve src/mundo/mapa1932-dados.json (o desenho v3 e o motor leem este arquivo)."""
    import json
    # a janela e a paleta sao o contrato com o motor: docs/mapa-1932-lotes.py leem
    # daqui e escrevem o raster da malha (src/mundo/mapa1932-malha.png)
    jlon = (-38.5720, -38.4840)
    jlat = (-3.7700, -3.7130)
    cel = 3.0
    x0, _ = para_m(jlon[0], 0)
    _, z0 = para_m(0, jlat[1])
    _, z1 = para_m(0, jlat[0])
    W = int((para_m(jlon[1], 0)[0] - x0) / cel)
    H = int((z1 - z0) / cel)

    dados = {
        "fonte": {
            "dados": "Prefeitura de Fortaleza - camada 'Evolucao Urbana 1932' (vw_EvolucaoUrbana1932)",
            "origem": GEOJSON_URL,
            "nota": "10.519 lotes com uso por lote em 1932 (HISTORIC_1) e Situacao (HISTORICO). "
                    "Base: plantas de Fortaleza de 1932, 1945 e 2010 (Prefeitura, 2023).",
            "malha": "src/mundo/mapa1932-malha.png (raster do uso por lote e das ruas) "
                     "e src/mundo/mapa1932-lotes.json (os lotes com a frente de rua); "
                     "ambos escritos por docs/mapa-1932-lotes.py",
            "coordenadas": "longitude/latitude WGS84; converter com ll() de src/mundo/fortaleza1932.js",
        },
        "janela": {"lon_min": jlon[0], "lon_max": jlon[1], "lat_min": jlat[0], "lat_max": jlat[1],
                   "celula_m": cel, "pixels": [W, H],
                   "origem_pixel": [x0, z0],
                   "nota": "o pixel (0,0) e o canto noroeste; x cresce para leste, z para o sul"},
        "paleta": USO_COR,
        "costa": [list(p) for p in COSTA],
        "rios": {"ceara": [list(p) for p in RIO_CEARA], "pajeu": [list(p) for p in PAJEU]},
        "lagos": [{"nome": n, "lon": a, "lat": b, "rx": rx, "rz": rz} for n, a, b, rx, rz in LAGOAS],
        "bondes": [{"nome": n, "distancia_m": d, "tracado": [list(p) for p in pts],
                    "esquematico": True,
                    "nota": "o traco e uma reta entre ancoras reais, nao a rota historica. "
                            "A distancia e a medida de 1918 (Almanach)."}
                   for n, d, pts in BONDES],
        "trilhos": [{"nome": n, "confianca": c, "tracado": [list(p) for p in pts]}
                    for n, c, pts in TRILHOS],
        "lugares": {chave: {"nome": nome, "lon": lon, "lat": lat, "papel": papel, "confianca": conf}
                    for chave, nome, lon, lat, papel, conf, _dx, _dy, _s in LUGARES},
        "bairros": [{"nome": n, "lon": a, "lat": b, "confianca": c} for n, a, b, c in BAIRROS],
        "campoUrubu": {
            "confianca": "H",
            "poligono": [list(p) for p in CAMPO["poligono"]],
            "tarefas": CAMPO["tarefas"],
            "galpoes": CAMPO["galpoes"],
            "construcoes": ["cozinha", "posto medico", "capela"],
            "lugares": campo_lugares(),
            "nota": "reconstituicao. O campo ficava na vizinhanca da Rede de Viacao Cearense, "
                    "no sentido do mar (Diario do Nordeste, apuracao de 2019). Galpoes de folha de "
                    "zinco, redes em estacas, cozinha; 20 tarefas de terra cercadas com arame.",
        },
        "favela1932": {"lon": -38.52612, "lat": -3.72959,
                      "nota": "unico lote da planta de 1932 com Situacao 'Favela'"},
    }
    caminho_json = os.path.join(RAIZ, "src", "mundo", "mapa1932-dados.json")
    with open(caminho_json, "w") as f:
        json.dump(dados, f, ensure_ascii=False, indent=1)
    print(f"  {caminho_json} ({os.path.getsize(caminho_json)/1024:.0f} KB)")
    print("  (o raster da malha e dos lotes e escrito por docs/mapa-1932-lotes.py)")


def main():
    chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    for vista in ("geral", "centro"):
        print(f"gerando a vista '{vista}' ...")
        svg = montar(vista)
        saida = VISTAS[vista]["saida"]
        caminho_svg = os.path.join(RAIZ, "docs", saida + ".svg")
        with open(caminho_svg, "w") as f:
            f.write(svg)
        print(f"  {caminho_svg} ({len(svg)/1024:.0f} KB)")
        if os.path.exists(chrome):
            png = os.path.join(RAIZ, "docs", saida + ".png")
            subprocess.run([chrome, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                            f"--window-size={PX_LARG},{PX_ALT}",
                            f"--screenshot={png}", f"file://{caminho_svg}"],
                           check=False, capture_output=True, timeout=180)
            if os.path.exists(png):
                print(f"  {png} ({os.path.getsize(png)/1024:.0f} KB)")
        else:
            print("  Chrome nao encontrado: o PNG nao foi gerado")
    print("gerando os dados para o motor ...")
    gerar_dados()


if __name__ == "__main__":
    main()
