#!/usr/bin/env python3
"""Maresia - a anatomia da cidade de 1932: os lotes com a frente de rua.

O desenho v3 (docs/mapa-1932-v3.py) mostra a cidade; este script abre a mesma
fonte oficial - a camada "Evolucao Urbana 1932" da Prefeitura de Fortaleza,
10.519 lotes com uso por lote - e descobre, para cada lote, a lado que da para
a rua. Sem isso o jogo so tem uma grade inventada; com isso cada casa do jogo
nasce no lugar e na largura que o lote tinha em 1932.

O que sai daqui:

  src/mundo/mapa1932-lotes.json   os 10.519 lotes: uso, a frente de rua (inicio,
                                 fim) e o fundo do lote, tudo em lon/lat
  src/mundo/mapa1932-malha.png    raster com tres classes: lote (pela cor do
                                 uso), rua e terreo vazio

A janela e a paleta vem de src/mundo/mapa1932-dados.json, escrito pelo
desenho v3 - este script nao repete nenhum numero, so consume.

Uso:  python3 docs/mapa-1932-lotes.py
"""

import json
import math
import os

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

GEOJSON_URL = "https://mapas.fortaleza.ce.gov.br/api/download/geojson/697"
CACHE = "/tmp/lotes1932.geojson"
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DADOS = os.path.join(RAIZ, "src", "mundo", "mapa1932-dados.json")

# a mascara da cidade: 1 m por pixel, so para saber onde ainda ha lote
CEL_ID = 1.0
# quanto o primeiro ponto de cada aresta e do ultimo sao amostrados (2 m)
PASSO = 2.0
# distancia da aresta para testar se o lado de fora esta livre
FOLGA = 2.5
# raio (em px da grade de 3 m) do fechamento morfologico que fecha as ruas
FECHO = 12
# distancia maxima (em metros) entre duas pontas que podem ser a mesma esquina
LIGACAO_M = 45.0
# as duas frentes precisam olhar quase para a mesma direcao (16 graus)
COS_LIGACAO = 0.96
# e a frente vizinha precisa continuar a linha da primeira (metros de desvio)
DESVIO_LIGACAO = 8.0

# a rua no raster: cor propria, longe de todas as cores de uso
COR_RUA = "#4a5560"


def baixar_lotes():
    if os.path.exists(CACHE) and os.path.getsize(CACHE) > 1_000_000:
        return CACHE
    print("baixando a camada de lotes de 1932 ...")
    import urllib.request
    req = urllib.request.Request(GEOJSON_URL, headers={"User-Agent": "Maresia/1.0"})
    with urllib.request.urlopen(req, timeout=240) as r:
        dados = r.read()
    with open(CACHE, "wb") as f:
        f.write(dados)
    print(f"  {len(dados)/1e6:.1f} MB em {CACHE}")
    return CACHE


# ---------------------------------------------------------------- geometria

class Mascara:
    """A cidade inteira desenhada: 1 onde ha lote, 0 onde ha rua ou campo.

    E so para perguntar "a 2,5 m para fora desta aresta ainda ha lote?" - e por
    isso que o pixel e de 1 m: a resposta precisa caber na largura de uma rua.
    """

    def __init__(self, x0, z0, x1, z1, cel):
        self.cel = cel
        self.x0 = x0
        self.z0 = z0
        self.w = int(math.ceil((x1 - x0) / cel))
        self.h = int(math.ceil((z1 - z0) / cel))
        self.img = Image.new("1", (self.w, self.h), 0)
        self.px = self.img.load()

    def desenhar(self, pontos):
        p = [((x - self.x0) / self.cel, (z - self.z0) / self.cel) for x, z in pontos]
        ImageDraw.Draw(self.img).polygon(p, fill=1)

    def em(self, x, z):
        px = int((x - self.x0) / self.cel)
        py = int((z - self.z0) / self.cel)
        if px < 0 or py < 0 or px >= self.w or py >= self.h:
            return 0
        return 1 if self.px[px, py] else 0


def area_e_centro(pontos):
    """Area (m2) e centroide de um anel em metros locais (x leste, z sul)."""
    a = 0.0
    cx = 0.0
    cz = 0.0
    n = len(pontos)
    for i in range(n):
        x1, z1 = pontos[i]
        x2, z2 = pontos[(i + 1) % n]
        cr = x1 * z2 - x2 * z1
        a += cr
        cx += (x1 + x2) * cr
        cz += (z1 + z2) * cr
    a *= 0.5
    if abs(a) < 1e-9:
        xs = [p[0] for p in pontos]
        zs = [p[1] for p in pontos]
        return 0.0, (sum(xs) / n, sum(zs) / n)
    return abs(a), (cx / (6 * a), cz / (6 * a))


def frente_do_lote(mascara, pontos, centro):
    """A(s) aresta(s) do lote que dao para a rua.

    Devolve uma lista de trechos: [(inicio, fim, normal)] em metros locais.
    A normal aponta para fora do lote (para a rua).

    O teste e simples e exato: a 2,5 m para fora da aresta, ainda ha cidade? Se
    ainda ha, a aresta e parede de fundo (o vizinho e colado); se nao ha, a aresta
    da para a rua. A normal vem do centroide, e nao da orientacao do anel, para
    funcionar tanto em lote convexo quanto em lote torto.
    """
    trechos = []
    n = len(pontos)
    for i in range(n):
        ax, az = pontos[i]
        bx, bz = pontos[(i + 1) % n]
        dx, dz = bx - ax, bz - az
        comp = math.hypot(dx, dz)
        if comp < 0.4:
            continue
        ux, uz = dx / comp, dz / comp
        # as duas normais: a que aponta para longe do centroide e a oposta
        mx, mz = (ax + bx) / 2, (az + bz) / 2
        nx, nz = -uz, ux
        if (mx - centro[0]) * nx + (mz - centro[1]) * nz < 0:
            nx, nz = -nx, -nz
        passos = max(1, int(comp / PASSO))
        amostras = []
        for k in range(passos + 1):
            t = k / passos
            px, pz = ax + dx * t, az + dz * t
            livre = not mascara.em(px + nx * FOLGA, pz + nz * FOLGA)
            if livre:
                amostras.append((px, pz, (nx, nz), k == 0, k == passos, i))
            else:
                if len(amostras) >= 2:
                    trechos.append(amostras)
                amostras = []
        if len(amostras) >= 2:
            trechos.append(amostras)
    # estica o trecho ate os cantos do lote: e o que faz a frente de um lote tocar
    # a frente do vizinho (e a rua virar uma linha so)
    esticados = []
    for t in trechos:
        ini = t[0]
        fim = t[-1]
        e = ini[5]
        if ini[3]:
            ini = (pontos[e][0], pontos[e][1], ini[2], True, ini[4], e)
        if fim[4]:
            e = fim[5]
            f = pontos[(e + 1) % n]
            fim = (f[0], f[1], fim[2], fim[3], True, e)
        esticados.append([ini] + t[1:-1] + [fim])
    # junta trechos de arestas vizinhas (lote de esquina)
    saida = []
    for t in esticados:
        if saida:
            ant = saida[-1]
            f = ant[-1]
            ini = t[0]
            mesma = (f[2][0] * ini[2][0] + f[2][1] * ini[2][1]) > 0.6
            perto = math.hypot(f[0] - ini[0], f[1] - ini[1]) < PASSO * 2.5
            if mesma and perto:
                ant.extend(t)
                continue
        saida.append(t)
    return saida


def ligar_cadeias(fachadas):
    """Junta as fachadas que se encontram na mesma rua.

    Duas fachadas sao da mesma rua quando as frentes olham para a mesma direcao
    (as normais quase iguais: as duas esquinas de uma quadra tem normais
    diferentes e nao se ligam), a ponta de uma chega perto da outra e a frente
    da outra continua a linha da primeira (o desvio e pequeno).

    A planta oficial nao desenha a parede dos fundos: a frente de um lote
    termina a alguns metros da do vizinho, e as vezes a um trecho inteiro sem
    construcao. Por isso a folga aceita e grande (LIGACAO_M): o que une a rua e
    a direcao, nao o encosto.

    Cada ponta se liga a uma ponta so (a mais perto), e a ligacao e de dois
    lados: a rua e um caminho, nao uma arvore.
    """
    from scipy.spatial import cKDTree

    pontos = []
    dono = []
    for i, f in enumerate(fachadas):
        for p in ("a", "b"):
            pontos.append(f[p])
            dono.append((i, p))
    arvore = cKDTree(np.array(pontos))

    pares = []
    for k, (i, p) in enumerate(dono):
        f = fachadas[i]
        px, pz = pontos[k]
        ax, az = f["a"]
        bx, bz = f["b"]
        ux, uz = bx - ax, bz - az
        comp = math.hypot(ux, uz) or 1.0
        ux /= comp
        uz /= comp
        for kk in arvore.query_ball_point([px, pz], LIGACAO_M):
            if kk == k:
                continue
            j, q = dono[kk]
            if j == i:
                continue
            g = fachadas[j]
            n1 = f["normal"]
            n2 = g["normal"]
            if n1[0] * n2[0] + n1[1] * n2[1] < COS_LIGACAO:
                continue
            # o ponto da frente vizinha mais proximo do meu ponto
            ga, gb = g["a"], g["b"]
            vx, vz = gb[0] - ga[0], gb[1] - ga[1]
            wx, wz = ga[0] - px, ga[1] - pz
            t = max(0.0, min(1.0, (wx * vx + wz * vz) / (vx * vx + vz * vz or 1.0)))
            qx, qy = ga[0] + t * vx, ga[1] + t * vz
            # o desvio: a frente vizinha continua a linha da minha?
            desvio = abs((qx - ax) * n1[0] + (qy - az) * n1[1])
            if desvio > DESVIO_LIGACAO:
                continue
            pares.append((math.hypot(qx - px, qy - pz), i, p, j, q))

    # a ligacao mais curta primeiro; cada ponta se usa uma vez so
    pares.sort(key=lambda t: t[0])
    lig = {}
    for _d, i, p, j, q in pares:
        if (i, p) in lig or (j, q) in lig:
            continue
        lig[(i, p)] = (j, q)
        lig[(j, q)] = (i, p)
    print(f"  ligacoes: {len(lig) // 2} pares de pontas")

    # caminha a cadeia: cada ponta sabe para onde vai
    cadeias = []
    vistas = set()
    for i in range(len(fachadas)):
        if i in vistas:
            continue
        par_a = lig.get((i, "a"))
        par_b = lig.get((i, "b"))
        if par_a is None and par_b is None:
            vistas.add(i)
            cadeias.append([[i, "a"]])
            continue
        saida = "a" if par_a else "b"
        entrada = "b" if saida == "a" else "a"
        cadeia = [[i, entrada]]
        vistas.add(i)
        while True:
            j, q = lig[(i, saida)]
            if j in vistas:
                break
            cadeia.append([j, q])   # q e a ponta de j que se liga a i
            vistas.add(j)
            saida = "b" if q == "a" else "a"
            if (j, saida) not in lig:
                break
            i = j
        cadeias.append(cadeia)
    return cadeias


def profundidade_em(pontos, p0, p1, normal, t):
    """A profundidade do lote no ponto t da frente (0 = comeco, 1 = fim).

    O raio caminha na direcao oposta a normal (para dentro do lote) e para na
    ultima parede do anel: e o fundo do lote. A medida importa em varios
    pontos: o fundo do lote nao e paralelo a frente (o lote e trapezoidal),
    e a casa, que e um retangulo, precisa caber na parte mais rasa.
    """
    larg = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
    ux = (p1[0] - p0[0]) / larg
    uz = (p1[1] - p0[1]) / larg
    mx = p0[0] + ux * larg * t
    mz = p0[1] + uz * larg * t
    return _raio_ate_a_parede(pontos, mx, mz, -normal[0], -normal[1])


def profundidade_raio(pontos, p0, p1, normal):
    """A profundidade do lote: o raio da frente para dentro, ate a ultima parede.

    A profundidade e a menor das tres medidas - nas pontas da frente e no meio -
    porque a casa e um retangulo: se o fundo do lote e mais raso num canto, e
    esse canto que manda. Medir so pelo vertice mais fundo dava um lote torto (em
    L, ou de fundo largo) como se fosse fundo reto, e a casa invadia o vizinho:
    era o que deixava buracos na testada das ruas.
    """
    medidas = [profundidade_em(pontos, p0, p1, normal, t) for t in (0.12, 0.5, 0.88)]
    return min(medidas)


def _raio_ate_a_parede(pontos, mx, mz, dx, dz):
    """O maior passo do raio (mx, mz) + t*(dx, dz) que ainda fica dentro do anel."""
    n = len(pontos)
    melhor = 0.0
    for i in range(n):
        ax, az = pontos[i]
        bx, bz = pontos[(i + 1) % n]
        ex, ez = bx - ax, bz - az
        den = dx * ez - dz * ex
        if abs(den) < 1e-9:
            continue
        px = ax - mx
        pz = az - mz
        t = (px * ez - pz * ex) / den
        s = (px * dz - pz * dx) / den
        if t > melhor and -1e-9 <= s <= 1 + 1e-9:
            melhor = t
    return min(60.0, melhor)


def main():
    dados = json.load(open(DADOS))
    janela = dados["janela"]
    paleta = dados["paleta"]
    lon_a, lon_b = janela["lon_min"], janela["lon_max"]
    lat_a, lat_b = janela["lat_min"], janela["lat_max"]
    cel = janela["celula_m"]
    W = janela["pixels"][0]
    H = janela["pixels"][1]

    # ancora local de projecao (a mesma do desenho v3)
    LON0, LAT0 = -38.5280, -3.7250
    MX = 111320.0 * math.cos(math.radians(LAT0))
    MZ = 110574.0

    def para_m(lon, lat):
        return ((lon - LON0) * MX, -(lat - LAT0) * MZ)

    def para_ll(x, z):
        return (LON0 + x / MX, LAT0 - z / MZ)

    x0, _ = para_m(lon_a, 0)
    _, z0 = para_m(0, lat_b)
    x1, _ = para_m(lon_b, 0)
    _, z1 = para_m(0, lat_a)

    feats = json.load(open(baixar_lotes()))["features"]
    print(f"{len(feats)} lotes na camada oficial")

    # ---- a mascara da cidade: o desenho de todos os lotes juntos
    xs = []
    zs = []
    aneis = []
    for i, ft in enumerate(feats):
        g = ft["geometry"]
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        pontos = [para_m(lo, la) for lo, la in polys[0][0]]
        if pontos[0] == pontos[-1]:
            pontos = pontos[:-1]
        if len(pontos) < 3:
            continue
        aneis.append((i, pontos))
        xs.extend(p[0] for p in pontos)
        zs.extend(p[1] for p in pontos)
    margem = 60.0
    mascara = Mascara(min(xs) - margem, min(zs) - margem, max(xs) + margem, max(zs) + margem, CEL_ID)
    for _i, pontos in aneis:
        mascara.desenhar(pontos)
    print(f"  mascara da cidade: {mascara.w} x {mascara.h} px de {CEL_ID} m")

    # ---- frente de rua de cada lote
    usos = sorted({(f["properties"].get("HISTORIC_1") or "Sem") for f in feats})
    codigo_uso = {u: i + 1 for i, u in enumerate(usos)}
    favela = {i for i, f in enumerate(feats) if (f["properties"].get("HISTORICO") == "Favela")}

    saida = []
    geom = []
    sem_frente = 0
    larguras = []
    profun = []
    n_casas = 0
    for i, pontos in aneis:
        ft = feats[i]
        uso = ft["properties"].get("HISTORIC_1") or "Sem"
        cod = codigo_uso[uso]
        if i in favela:
            cod = 99  # a unica favela da planta
        _area, centro = area_e_centro(pontos)
        trechos = frente_do_lote(mascara, pontos, centro)
        if not trechos:
            sem_frente += 1
            continue
        # o trecho mais longo e a frente principal
        trecho = max(trechos, key=lambda t: math.hypot(t[-1][0] - t[0][0], t[-1][1] - t[0][1]))
        p0 = (trecho[0][0], trecho[0][1])
        p1 = (trecho[-1][0], trecho[-1][1])
        normal = trecho[0][2]
        # profundidade: o raio do meio da frente para dentro do lote, ate a ultima
        # parede que ele encontra. Medir pelo vertice mais fundo dava um lote torto
        # (em L, ou de fundo largo) como se fosse fundo reto, e a casa invadia o
        # vizinho: era o que deixava buracos na testada das ruas.
        mx, mz = (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2
        larg = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
        if larg < 0.5:
            sem_frente += 1
            continue
        prof = profundidade_raio(pontos, p0, p1, normal)
        if larg < 0.5:
            sem_frente += 1
            continue
        if prof < 3.0:
            prof = max(4.0, larg * 0.8)
        bx, bz = mx - normal[0] * prof, mz - normal[1] * prof
        larguras.append(larg)
        profun.append(prof)

        # a planta de 1932 ja traz o lote como a pegada do predio: uma fachada por
        # lote. So quando a frente e comprida demais para ser uma casa (um quarteirao
        # comercial inteiro) ela e partida em pedacos.
        maximo = 60.0
        partes = max(1, int(math.ceil(larg / maximo)))
        ux, uz = (p1[0] - p0[0]) / larg, (p1[1] - p0[1]) / larg
        for k in range(partes):
            a = (p0[0] + ux * larg * k / partes, p0[1] + uz * larg * k / partes)
            b = (p0[0] + ux * larg * (k + 1) / partes, p0[1] + uz * larg * (k + 1) / partes)
            # o fundo da cada pedaco e o fundo do lote, deslocado para o meio do pedaco
            am = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
            fundo = (bx + (am[0] - mx), bz + (am[1] - mz))
            # a profundidade do lote na frente deste pedaco, em tres pontos: a
            # casa e um retangulo e precisa caber no lote inteiro, nao so no
            # meio da frente (o fundo do lote e trapezoidal)
            ta = (k / partes)
            tb = ((k + 1) / partes)
            prof_a = profundidade_em(pontos, p0, p1, normal, ta + (tb - ta) * 0.08)
            prof_m = profundidade_em(pontos, p0, p1, normal, (ta + tb) / 2)
            prof_b = profundidade_em(pontos, p0, p1, normal, tb - (tb - ta) * 0.08)
            saida.append([
                cod,
                *para_ll(a[0], a[1]), *para_ll(b[0], b[1]), *para_ll(fundo[0], fundo[1]),
                round(prof_a, 2), round(prof_m, 2), round(prof_b, 2),
            ])
            geom.append({"a": a, "b": b, "normal": normal})
            n_casas += 1

    cadeias = ligar_cadeias(geom)
    maior = max((len(c) for c in cadeias), default=0)
    print(f"  {len(cadeias)} ruas (a maior tem {maior} lotes)")

    larguras.sort()
    profun.sort()
    def pct(v, p):
        return round(v[int(len(v) * p)], 1)
    print(f"  {len(saida)} fachadas em {len(larguras)} lotes ({sem_frente} lotes sem frente)")
    print(f"  largura da frente: p10 {pct(larguras,.1)} m  mediana {pct(larguras,.5)} m  p90 {pct(larguras,.9)} m")
    print(f"  profundidade do lote: p10 {pct(profun,.1)} m  mediana {pct(profun,.5)} m  p90 {pct(profun,.9)} m")

    # ---- raster: uso por lote + as ruas
    img = Image.new("RGB", (W, H), (244, 236, 216))
    dr = ImageDraw.Draw(img)
    cores = {k: tuple(int(v[i:i + 2], 16) for i in (1, 3, 5)) for k, v in paleta.items()}
    for ft in feats:
        props = ft.get("properties") or {}
        uso = props.get("HISTORIC_1") or "Sem"
        cor = cores.get(uso, cores["Sem"])
        if props.get("HISTORICO") == "Favela":
            cor = (107, 74, 46)
        g = ft.get("geometry")
        if not g:
            continue
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        for poly in polys:
            for ring in poly:
                pts = [((para_m(lo, la)[0] - x0) / cel, (para_m(lo, la)[1] - z0) / cel)
                       for lo, la in ring]
                if len(pts) >= 3:
                    dr.polygon(pts, fill=cor)
    arr = np.array(img)
    fundo = np.all(arr == np.array([244, 236, 216]), axis=-1)
    lote = ~fundo

    # as ruas: o buraco entre os lotes, fechado morfologicamente e depois aberto
    fechado = ndimage.binary_closing(lote, structure=np.ones((2 * FECHO + 1, 2 * FECHO + 1)))
    envelope = ndimage.binary_fill_holes(fechado)
    rua = envelope & ~lote
    # as ruas que sao para o mar ou para o campo: perto de um lote e dentro do tecido
    dist = ndimage.distance_transform_edt(~lote)
    rua = rua | (~lote & (dist <= 4))
    arr[rua] = (74, 85, 96)
    Image.fromarray(arr).save(os.path.join(RAIZ, "src", "mundo", "mapa1932-malha.png"),
                               format="PNG", optimize=True)
    print(f"  raster: {W} x {H} px, {lote.sum()} px de lote, {rua.sum()} px de rua")

    # ---- dados para o motor
    saida_json = {
        "fonte": {
            "dados": "Prefeitura de Fortaleza - camada 'Evolucao Urbana 1932' (vw_EvolucaoUrbana1932)",
            "origem": GEOJSON_URL,
            "nota": "as fachadas de rua de 1932: para cada lote, a aresta que dava para a rua "
                    "(inicio e fim) e o fundo do lote, em longitude/latitude. Uso: o numero em "
                    "'usos' (1 = o primeiro da lista); 99 = a favela.",
        },
        "janela": janela,
        "usos": usos,
        "cor_rua": COR_RUA,
        "fachadas": saida,
        "cadeias": cadeias,
    }
    caminho = os.path.join(RAIZ, "src", "mundo", "mapa1932-lotes.json")
    with open(caminho, "w") as f:
        json.dump(saida_json, f, ensure_ascii=False, separators=(",", ":"))
    print(f"  {caminho} ({os.path.getsize(caminho)/1024:.0f} KB)")


if __name__ == "__main__":
    main()
