# Neto gerado com o MPFB 2 (MakeHuman para Blender): humano paramétrico com esqueleto do Mixamo.
# Uso: Blender -b --python neto_mpfb.py -- pasta_saida variante [rosto_desenhado.png]
#   variante "ativos": olhos, sobrancelha, cílios, cabelo e pele do pacote do MakeHuman (CC0)
#   variante "projetado": cabelo do pacote + rosto desenhado projetado de frente sobre a cabeça
import bpy, bmesh, sys, math, os
import numpy as np
from mathutils import Vector

a = sys.argv[sys.argv.index("--") + 1:]
SAIDA, VARIANTE = a[0], a[1]
DESENHO = os.path.abspath(a[2]) if len(a) > 2 else None
PARAMS = a[3] if len(a) > 3 else None  # JSON {"macros": {...}, "rosto": {...}} vindo do painel
os.makedirs(SAIDA, exist_ok=True)

from bl_ext.blender_org.mpfb.services.humanservice import HumanService
from bl_ext.blender_org.mpfb.services.targetservice import TargetService
DADOS = os.path.expanduser("~/Library/Application Support/Blender/5.2/extensions/.user/blender_org/mpfb/data")

ALTURA = float(os.environ.get("NETO_ALTURA", "1.68"))
def _hex_lin(h):
    return tuple([((int(h[i:i + 2], 16) / 255 + 0.055) / 1.055) ** 2.4 for i in (1, 3, 5)] + [1])
COR_CABELO = _hex_lin(os.environ.get("NETO_COR_CABELO", "#030202"))
COR_PELOS = _hex_lin(os.environ.get("NETO_COR_PELOS", "#020201"))
# cor da pele amostrada no desenho (bochechas ~ #B06E46), em linear
PELE_DESENHO = tuple([((c / 255 + 0.055) / 1.055) ** 2.4 for c in (138, 84, 52)] + [1])  # bronze queimado de sol
# idade no MakeHuman: 0,1875 = 11 anos, 0,5 = 25 anos  ->  15 anos ~ 0,277
MACROS = {
    "gender": 1.0, "age": 0.277, "muscle": 0.6, "weight": 0.34, "proportions": 0.65,
    "height": 0.5, "cupsize": 0.5, "firmness": 0.5,
    "race": {"asian": 0.45, "african": 0.32, "caucasian": 0.23},
}
# rosto de caboclo do litoral (pesos fortes): maçãs altas, nariz largo, olhos amendoados, lábios cheios, queixo firme
ROSTO = {
    "head-square": 0.55, "head-scale-horiz-incr": 0.25, "head-age-incr": 0.35,
    "l-cheek-bones-incr": 1.0, "r-cheek-bones-incr": 1.0, "l-cheek-trans-up": 0.5, "r-cheek-trans-up": 0.5,
    "l-cheek-volume-decr": 0.4, "r-cheek-volume-decr": 0.4,
    "nose-flaring-incr": 0.8, "nose-width1-incr": 0.7, "nose-width2-incr": 0.7, "nose-width3-incr": 0.5,
    "nose-point-width-incr": 0.7, "nose-scale-vert-decr": 0.3, "nose-hump-decr": 0.4, "nose-volume-incr": 0.3,
    "l-eye-height2-decr": 0.7, "r-eye-height2-decr": 0.7, "l-eye-epicanthus-in": 0.6, "r-eye-epicanthus-in": 0.6,
    "l-eye-corner1-up": 0.3, "r-eye-corner1-up": 0.3, "l-eye-scale-decr": 0.3, "r-eye-scale-decr": 0.3,
    "mouth-lowerlip-volume-incr": 0.7, "mouth-upperlip-volume-incr": 0.6, "mouth-scale-horiz-incr": 0.25,
    "chin-width-incr": 0.5, "chin-bones-incr": 0.6, "chin-prominent-incr": 0.3,
    "eyebrows-trans-down": 0.35, "forehead-scale-vert-decr": 0.3,
}

if PARAMS:
    import json
    _p = json.load(open(PARAMS))
    MACROS = _p["macros"]; ROSTO = _p["rosto"]
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
corpo = HumanService.create_human(macro_detail_dict=MACROS, scale=0.1)
for nome, peso in ROSTO.items():
    if peso <= 0.001: continue
    TargetService.load_target(corpo, TargetService.target_full_path(nome), weight=peso, name=nome)
def _grupo_idx(nome):
    gi = corpo.vertex_groups[nome].index
    return np.array([v.index for v in corpo.data.vertices if any(g.group == gi and g.weight > 0.5 for g in v.groups)])
def _mistura():
    kb = corpo.data.shape_keys.key_blocks; n = len(corpo.data.vertices)
    def co(k):
        c = np.empty(n * 3); k.data.foreach_get("co", c); return c.reshape(n, 3)
    b = co(kb[0]); P = b.copy()
    for k in kb[1:]:
        if k.value: P += k.value * (co(k) - b)
    return b, P
OLHOS_K = float(os.environ.get("NETO_OLHOS", "0"))
if OLHOS_K:
    # "lupa" suave em volta de cada olho: abre pálpebras e aumenta o globo, mantendo a profundidade
    b, P = _mistura(); novo = P.copy()
    for g in ("joint-l-eye", "joint-r-eye"):
        c = P[_grupo_idx(g)].mean(0); R = 0.032
        d = np.linalg.norm((P - c) * np.array([1, 0.6, 1]), axis=1)
        f = np.clip(1 - (d / R) ** 2, 0, 1) ** 2
        novo[:, 0] += (P[:, 0] - c[0]) * OLHOS_K * f
        novo[:, 2] += (P[:, 2] - c[2]) * OLHOS_K * f * 0.8
    ch = corpo.shape_key_add(name="olhos_maiores", from_mix=False)
    ch.data.foreach_set("co", (b + (novo - P)).ravel()); ch.value = 1.0
SEM_ROSTO = bool(os.environ.get("NETO_SEM_ROSTO"))
if SEM_ROSTO:
    # rosto liso para o desenho 2D: órbitas rasas e boca contínua (suavização local em volta de olhos e boca)
    b, P = _mistura(); novo = P.copy()
    me_ = corpo.data
    viz = [[] for _ in me_.vertices]
    for e in me_.edges:
        i, j = e.vertices; viz[i].append(j); viz[j].append(i)
    centros = [P[_grupo_idx(g)].mean(0) for g in ("joint-l-eye", "joint-r-eye")]
    boca = P[_grupo_idx("lips")]; cb = boca.mean(0)
    corpo_s = set(_grupo_idx("body").tolist())
    peso = np.zeros(len(P))
    for c in centros:
        d = np.linalg.norm(P - c, axis=1); peso = np.maximum(peso, np.clip(1 - d / 0.03, 0, 1))
    peso[[i for i in range(len(P)) if i not in corpo_s]] = 0
    # boca lisa: pele contínua da base do nariz ao queixo. Entre as duas fatias, uma superfície Hermite
    # (valor e inclinação do perfil original nas bordas) substitui os lábios; o interior da boca vai para trás dela.
    bi = np.array(sorted(corpo_s)); B = P[bi]
    frente_lim = cb[1] + 0.03
    def frente_y(z, x=0.0, tx=0.0025, tz=0.0016):
        sel = B[(np.abs(B[:, 0] - x) < tx) & (np.abs(B[:, 2] - z) < tz) & (B[:, 1] < frente_lim)]
        return sel[:, 1].min() if len(sel) else None
    zs = np.arange(cb[2] - 0.05, cb[2] + 0.05, 0.001)
    perfil = {round(z, 4): frente_y(z) for z in zs}
    validos = [(z, y) for z, y in perfil.items() if y is not None]
    acima = [(z, y) for z, y in validos if cb[2] + 0.006 < z < cb[2] + 0.045]
    z_nariz = min(acima, key=lambda t: t[1])[0]                                   # ponta do nariz
    entre = [(z, y) for z, y in validos if cb[2] + 0.004 < z < z_nariz]
    z_sub = max(entre, key=lambda t: t[1])[0]                                     # base do nariz (mais funda)
    abaixo = [(z, y) for z, y in validos if cb[2] - 0.045 < z < cb[2] - 0.012]
    z_pog = min(abaixo, key=lambda t: t[1])[0]                                    # queixo (mais à frente)
    z_top, z_bot = z_sub + 0.55 * (z_nariz - z_sub), z_pog   # começa logo abaixo da ponta do nariz: sem o vinco nariz-lábio
    h = z_top - z_bot; W = 0.031
    def borda(z, x, lado):
        y0 = frente_y(z, x); y1 = frente_y(z + (0.003 if lado > 0 else -0.003), x)
        if y0 is None or y1 is None: return None, None
        return y0, (y1 - y0) / (0.003 if lado > 0 else -0.003)               # valor e dy/dz
    xs_g = np.arange(-W, W + 1e-9, 0.002)
    tab = []
    for xg in xs_g:
        yt, st = borda(z_top, xg, +1); yb, sb = borda(z_bot, xg, -1)
        tab.append((xg, yt, st, yb, sb))
    tab = [t for t in tab if None not in t]
    def alvo(x, z):
        k = min(range(len(tab)), key=lambda j: abs(tab[j][0] - x)); _, yt, st, yb, sb = tab[k]
        u = (z_top - z) / h; u2, u3 = u * u, u * u * u
        T0, T1 = 0.0, 0.0   # sem herdar inclinação: transição monótona do nariz ao queixo (não ondula)
        return (2*u3 - 3*u2 + 1) * yt + (u3 - 2*u2 + u) * T0 + (-2*u3 + 3*u2) * yb + (u3 - u2) * T1
    mexidos = 0
    for i in bi:
        x, y, z = novo[i]
        if not (z_bot < z < z_top and abs(x) < W and y < cb[1] + 0.05): continue
        yt_ = alvo(x, z)
        wx = 1.0 if abs(x) < 0.8 * W else max(0.0, 1 - (abs(x) - 0.8 * W) / (0.2 * W)); wx = wx * wx * (3 - 2 * wx)
        u_ = (z_top - z) / h   # emendas suaves: perto do nariz (u=0) e do queixo (u=1) a pele original volta aos poucos
        wz = min(1.0, u_ / 0.2, (1 - u_) / 0.12); wz = max(0.0, wz); wz = wz * wz * (3 - 2 * wz)
        wx = wx * wz
        if y > yt_ + 0.004:   # interior da boca: logo atrás da pele nova
            novo[i, 1] = yt_ + 0.0012
        else:
            novo[i, 1] = y + wx * (yt_ - y)
        mexidos += 1
    print(f"BOCA z_nariz={z_nariz:.4f} z_sub={z_sub:.4f} z_pog={z_pog:.4f} vertices={mexidos}")
    ativos = np.nonzero(peso > 0)[0]
    for _ in range(25):
        media = novo.copy()
        for i in ativos:
            if viz[i]: media[i] = novo[viz[i]].mean(0)
        novo[ativos] += (media[ativos] - novo[ativos]) * (0.6 * peso[ativos])[:, None]
    ch = corpo.shape_key_add(name="rosto_liso", from_mix=False)
    ch.data.foreach_set("co", (b + (novo - P)).ravel()); ch.value = 1.0
rig = HumanService.add_builtin_rig(corpo, "mixamo", import_weights=True)

def ativo(nome, tipo):
    caminho = os.path.join(DADOS, nome)
    return HumanService.add_mhclo_asset(caminho, corpo, asset_type=tipo, subdiv_levels=0)

olhos = ativo("eyes/low-poly/low-poly.mhclo", "Eyes")
BARBA_MH = None; BARBAS_MH = []
for _c in filter(None, os.environ.get("NETO_BARBA_MH", "").split(",")):   # barba pronta da comunidade (.mhclo; vira roupa)
    BARBA_MH = HumanService.add_mhclo_asset(_c, corpo, asset_type="Clothes", subdiv_levels=0)
    BARBA_MH.name = "barba"; BARBAS_MH.append(BARBA_MH)
    _cor = _hex_lin(os.environ.get("NETO_COR_BARBA", "#d8d3ca"))
    for _m in BARBA_MH.data.materials:   # fios brancos: a textura escura vira só variação; o alfa da textura fica
        if not _m or not _m.use_nodes: continue
        _nt = _m.node_tree; _bs = next((n for n in _nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
        _tx = next((n for n in _nt.nodes if n.type == "TEX_IMAGE"), None)
        if _bs is None: continue
        _mix = _nt.nodes.new("ShaderNodeMix"); _mix.data_type = "RGBA"; _mix.inputs["Factor"].default_value = 0.25
        _mix.inputs["A"].default_value = _cor
        if _tx: _nt.links.new(_tx.outputs["Color"], _mix.inputs["B"])
        _nt.links.new(_mix.outputs["Result"], _bs.inputs["Base Color"])
        _m.name = "barba"
    print("BARBA_MH", _c, len(BARBA_MH.data.vertices), "pontos", [m.name for m in BARBA_MH.data.materials])
CABELO = os.environ.get("NETO_CABELO", "short04")
def cabelo_proprio():
    """Mechas grossas e desgrenhadas sobre uma touca escura, presas ao osso da cabeça."""
    import random
    rnd = random.Random(int(os.environ.get("NETO_SEMENTE", "7")))
    b, P = _mistura()
    corpo_i = _grupo_idx("body"); orelhas = set(_grupo_idx("ears").tolist())
    ze = P[_grupo_idx("joint-l-eye")][:, 2].mean()
    cab = (P[_grupo_idx("joint-head")].mean(0) + P[_grupo_idx("joint-head-2")].mean(0)) / 2  # centro do crânio
    E = 0.105
    me_c = corpo.data
    # couro cabeludo: acima da linha do cabelo (testa alta na frente, acima da orelha dos lados, nuca atrás)
    def no_couro(v):
        x, y, z = v
        if z < ze - 0.75 * E: return False
        frente = y < cab[1] - 0.02
        if frente: return z > (ze + 0.42 * E if abs(x) < 0.05 else ze + 0.25 * E)  # testa alta no meio, mais baixa nas têmporas
        if y > cab[1] + 0.03: return z > ze - (0.30 * E if abs(x) < 0.045 else 0.05 * E)  # nuca, sem rabo de cavalo
        return z > ze + 0.2 * E  # lados: acima da orelha
    sel = set(i for i in corpo_i.tolist() if i not in orelhas and no_couro(P[i]))
    # normais aproximadas: do centro da cabeça para fora
    def normal(v):
        d = v - cab; return d / np.linalg.norm(d)
    verts, faces = [], []
    # touca: faces do couro cabeludo empurradas 3 mm para fora
    mapa = {}
    for poly in me_c.polygons:
        if all(i in sel for i in poly.vertices):
            idx = []
            for i in poly.vertices:
                if i not in mapa:
                    mapa[i] = len(verts); verts.append(tuple(P[i] + normal(P[i]) * 0.003))
                idx.append(mapa[i])
            faces.append(idx)
    # mechas: prismas afilados de 3 lados, curvados para baixo
    pontos = [P[i] for i in sel]
    for _ in range(int(os.environ.get("NETO_MECHAS", "420"))):
        r0 = pontos[rnd.randrange(len(pontos))]; nrm = normal(r0)
        frente = r0[1] < cab[1] - 0.02 and r0[2] > ze + 0.2 * E
        topo = r0[2] > ze + 0.95 * E
        para_baixo = np.array([0, 0, -1.0])
        if frente:      # franja: cai sobre a testa e para na sobrancelha
            dirc = nrm * 0.25 + para_baixo * 0.8 + np.array([0, -0.2, 0])
        elif topo:      # topo: deitado sobre a cabeça, para trás e para os lados, com volume
            dirc = nrm * 0.45 + np.array([np.sign(r0[0] - cab[0]) * 0.3, 0.45, -0.1])
        else:           # lados e nuca: para baixo e para trás, rente à cabeça, sem cobrir a orelha
            dirc = nrm * 0.3 + para_baixo * 0.5 + np.array([0, 0.45, 0])
        dirc += np.array([rnd.uniform(-0.25, 0.25), rnd.uniform(-0.15, 0.15), rnd.uniform(-0.1, 0.15)])
        dirc /= np.linalg.norm(dirc)
        L = rnd.uniform(0.022, 0.042)
        if frente:  # a ponta não passa da sobrancelha
            L = min(L, max(0.008, (r0[2] - (ze + 0.16 * E)) / max(0.3, -dirc[2])))
        larg = rnd.uniform(0.015, 0.026)
        lado = np.cross(dirc, nrm); lado = lado / (np.linalg.norm(lado) + 1e-9)
        raiz = r0 + nrm * 0.002
        meio = raiz + dirc * L * 0.55 + nrm * 0.006
        ponta = raiz + dirc * L + para_baixo * L * 0.15
        base_i = len(verts)
        for c_, w_ in ((raiz, larg), (meio, larg * 0.6)):
            verts.append(tuple(c_ + lado * w_ / 2)); verts.append(tuple(c_ - lado * w_ / 2)); verts.append(tuple(c_ + nrm * w_ * 0.3))
        verts.append(tuple(ponta))
        a0, a1, a2, m0, m1, m2, t = range(base_i, base_i + 7)
        faces += [(a0, a1, m1, m0), (a1, a2, m2, m1), (a2, a0, m0, m2), (m0, m1, t), (m1, m2, t), (m2, m0, t)]
    me_h = bpy.data.meshes.new("cabelo"); me_h.from_pydata(verts, [], faces); me_h.update()
    ob = bpy.data.objects.new("cabelo", me_h); bpy.context.scene.collection.objects.link(ob)
    ob.parent = corpo.parent if corpo.parent else None
    ob.matrix_world = corpo.matrix_world.copy()
    vg = ob.vertex_groups.new(name="mixamorig:Head"); vg.add(list(range(len(verts))), 1.0, "REPLACE")
    if corpo.parent:
        mod = ob.modifiers.new("esqueleto", "ARMATURE"); mod.object = corpo.parent
    return ob
if CABELO == "proprio":
    cabelo = cabelo_proprio()
else:
    cabelo = ativo(f"hair/{CABELO}/{CABELO}.mhclo", "Hair")
for no in ([] if SEM_ROSTO else (olhos.active_material.node_tree.nodes if olhos.active_material and olhos.active_material.use_nodes else [])):
    if no.type == "TEX_IMAGE" and no.image and "eye" in no.image.name.lower():  # íris castanho-escura no lugar da vermelha
        no.image = bpy.data.images.load(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "entradas", "3d", "olho-castanho-escuro.png"))
        nt_o = olhos.active_material.node_tree  # liga a textura direto na cor (o nó de mistura avermelhava a íris)
        nt_o.links.new(no.outputs["Color"], nt_o.nodes["Principled BSDF"].inputs["Base Color"])
cabelo.data.materials.clear()
m_cab = bpy.data.materials.new("cabelo"); m_cab.use_nodes = True
m_cab.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = COR_CABELO
m_cab.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 1
cabelo.data.materials.append(m_cab)
if VARIANTE in ("ativos", "limpo"):
    SOB = os.environ.get("NETO_SOBRANCELHA", "eyebrow009")
    sob = None if SEM_ROSTO else ativo(f"eyebrows/{SOB}/{SOB}.mhclo", "Eyebrows")
    GROSSURA = float(os.environ.get("NETO_SOB_GROSSURA", "1.6"))
    if sob is not None and GROSSURA != 1.0:  # engrossa cada sobrancelha em volta do próprio centro e desce um pouco
        n_s = len(sob.data.vertices); c_s = np.empty(n_s * 3); sob.data.vertices.foreach_get("co", c_s); c_s = c_s.reshape(n_s, 3)
        for lado in (c_s[:, 0] > 0, c_s[:, 0] <= 0):
            cz = c_s[lado, 2].mean(); c_s[lado, 2] = cz + (c_s[lado, 2] - cz) * GROSSURA - 0.0015
        sob.data.vertices.foreach_set("co", c_s.ravel()); sob.data.update()
    if not SEM_ROSTO: ativo("eyelashes/eyelashes01/eyelashes01.mhclo", "Eyelashes")
    for ob in bpy.data.objects:  # sobrancelha e cílio: cor chapada escura (a textura do pacote é clara demais)
        if ob.type == "MESH" and ("eyebrow" in ob.name.lower() or "eyelash" in ob.name.lower()):
            mm = bpy.data.materials.new("pelos"); mm.use_nodes = True
            mm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = COR_PELOS
            mm.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 1
            ob.data.materials.clear(); ob.data.materials.append(mm)
    if VARIANTE == "ativos":
        HumanService.set_character_skin(os.path.join(DADOS, "skins/young_african_male/young_african_male.mhmat"), corpo, skin_type="MAKESKIN")
    else:  # "limpo": pele em cor chapada bronze (a textura de pele adulta envelhecia o rosto)
        m_pele = bpy.data.materials.new("pele"); m_pele.use_nodes = True
        bs = m_pele.node_tree.nodes["Principled BSDF"]; bs.inputs["Base Color"].default_value = PELE_DESENHO; bs.inputs["Roughness"].default_value = 0.9
        corpo.data.materials.clear(); corpo.data.materials.append(m_pele)
        m_lab = bpy.data.materials.new("labios"); m_lab.use_nodes = True
        bl = m_lab.node_tree.nodes["Principled BSDF"]; bl.inputs["Roughness"].default_value = 0.8
        bl.inputs["Base Color"].default_value = tuple([((c / 255 + 0.055) / 1.055) ** 2.4 for c in (128, 74, 58)] + [1])
        corpo.data.materials.append(m_lab)
        gi = corpo.vertex_groups["lips"].index
        nos_labios = {v.index for v in corpo.data.vertices if any(g.group == gi and g.weight > 0.5 for g in v.groups)}
        for poly in corpo.data.polygons:
            if all(vi in nos_labios for vi in poly.vertices) and not SEM_ROSTO: poly.material_index = 1
        if SEM_ROSTO:  # tampão das órbitas: a esfera do olho fica, na cor da pele
            olhos.name = "tampao-olhos"; olhos.data.materials.clear(); olhos.data.materials.append(m_pele)

CAMISA = os.environ.get("NETO_CAMISA", "listrada")
def roupa():
    """Camisa de malha listrada e calça clara arregaçada, feitas da própria malha do corpo (seguem o esqueleto)."""
    b, P = _mistura()
    J = lambda g: P[_grupo_idx(g)].mean(0)
    Zp, Zn = J("joint-pelvis")[2], J("joint-neck")[2]
    corpo_set = set(_grupo_idx("body").tolist())
    def dist_seg(v, a, c):
        ab = c - a; t = np.clip(np.dot(v - a, ab) / np.dot(ab, ab), 0, 1); return np.linalg.norm(v - (a + t * ab)), t
    braco = {}
    for l in ("l", "r"):
        braco[l] = (J(f"joint-{l}-shoulder"), J(f"joint-{l}-elbow"), J(f"joint-{l}-hand"))
    joelho = (J("joint-l-knee")[2] + J("joint-r-knee")[2]) / 2
    tornozelo = (J("joint-l-ankle")[2] + J("joint-r-ankle")[2]) / 2
    barra = tornozelo + (joelho - tornozelo) * 0.45   # meio da canela
    # braço pelo peso do esqueleto, não pela distância: em pose A a mão encosta na coxa e a distância cortava a calça
    def _peso(chaves):
        gis = [g.index for g in corpo.vertex_groups if any(g.name.endswith(c) for c in chaves)]
        w = np.zeros(len(corpo.data.vertices))
        for v in corpo.data.vertices:
            w[v.index] = sum(g.weight for g in v.groups if g.group in gis)
        return w
    w_ante = _peso(("ForeArm",) + tuple(f"Hand{d}" for d in ("", "Thumb1", "Thumb2", "Thumb3", "Thumb4")) + tuple(
        f"Hand{d}{k}" for d in ("Index", "Middle", "Ring", "Pinky") for k in range(1, 5)))
    w_braco = _peso(("LeftArm", "RightArm"))
    def regiao(i, peca):
        v = P[i]; l = "l" if v[0] > 0 else "r"; S, El, H = braco[l]
        if peca == "camisa":
            if w_ante[i] > 0.5:   # manga comprida arregaçada até o meio do antebraço
                return CAMISA == "escura" and dist_seg(v, El, H)[1] < 0.5
            if w_braco[i] > 0.5: return True                              # manga até o cotovelo
            return abs(v[0]) < abs(S[0]) * 1.05 and Zp - 0.095 < v[2] < Zn + 0.01
        # calça
        if w_ante[i] > 0.3 or w_braco[i] > 0.3: return False
        return barra - 0.03 < v[2] < Zp + (0.02 if CAMISA == "escura" else 0.07)
    pecas = {}
    cor_camisa = _hex_lin("#5c3d2e")[:3] if CAMISA == "escura" else None   # tinta de mangue escura e gasta
    folga_camisa = 0.016 if CAMISA == "escura" else 0.026
    folga_calca = 0.010 if CAMISA == "escura" else 0.019
    for peca, folga, cor in (("camisa", folga_camisa, cor_camisa), ("calca", folga_calca, (0.80, 0.74, 0.62))):
        me2 = corpo.data.copy(); ob = corpo.copy(); ob.data = me2; ob.name = peca
        bpy.context.scene.collection.objects.link(ob)
        ob.shape_key_clear(); me2.vertices.foreach_set("co", P.ravel())
        for m in list(ob.modifiers):
            if m.type == "MASK": ob.modifiers.remove(m)
        bm = bmesh.new(); bm.from_mesh(me2); bm.verts.ensure_lookup_table()
        fora = [v for v in bm.verts if v.index not in corpo_set or not regiao(v.index, peca)]
        bmesh.ops.delete(bm, geom=fora, context="VERTS")
        def cortar(z, manter_acima):   # corte reto por plano: barra e gola sem serrilha
            g = bm.verts[:] + bm.edges[:] + bm.faces[:]
            bmesh.ops.bisect_plane(bm, geom=g, dist=1e-6, plane_co=(0, 0, z), plane_no=(0, 0, 1 if manter_acima else -1), clear_inner=True)
        if peca == "calca": cortar(barra, True)
        else: cortar(Zp - 0.075, True); cortar(Zn - 0.005, False)
        bmesh.ops.smooth_vert(bm, verts=[v for v in bm.verts if v.is_boundary and Zp - 0.07 < v.co.z < Zn - 0.01 and not (peca == "calca" and v.co.z < barra + 0.005)],
                              factor=0.7, use_axis_x=True, use_axis_y=True, use_axis_z=True)  # borda sem serrilha (menos nos cortes retos)
        if peca == "camisa":  # malha mais fina para as listras não serrilharem
            bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=2, use_grid_fill=True)
        bm.normal_update()
        for v in bm.verts:
            extra = 0.0
            if peca == "camisa" and v.co.z < Zp - 0.02: extra = (Zp - 0.02 - v.co.z) * 0.25      # barra solta
            if peca == "calca" and v.co.z < barra + 0.035: extra = 0.012 if CAMISA != "escura" else 0.004   # barra dobrada
            v.co += v.normal * (folga + extra)
        bm.to_mesh(me2); bm.free()
        sol = ob.modifiers.new("espessura", "SOLIDIFY"); sol.thickness = 0.005; sol.offset = 1
        me2.materials.clear()
        mt = bpy.data.materials.new(peca); mt.use_nodes = True
        bs = mt.node_tree.nodes["Principled BSDF"]; bs.inputs["Roughness"].default_value = 1
        if cor: bs.inputs["Base Color"].default_value = (*cor, 1)
        else:   # listras horizontais na cor dos vértices
            attr = me2.color_attributes.new("Col", "BYTE_COLOR", "CORNER")
            tijolo = [((c / 255 + 0.055) / 1.055) ** 2.4 for c in (166, 82, 64)]
            creme = [((c / 255 + 0.055) / 1.055) ** 2.4 for c in (232, 222, 198)]
            for poly in me2.polygons:
                z = sum(me2.vertices[i].co.z for i in poly.vertices) / len(poly.vertices)
                c = tijolo if int((Zn - z) / 0.039) % 2 == 0 else creme
                for li in poly.loop_indices: attr.data[li].color = (*c, 1)
            vc = mt.node_tree.nodes.new("ShaderNodeVertexColor"); vc.layer_name = "Col"
            mt.node_tree.links.new(vc.outputs["Color"], bs.inputs["Base Color"])
        me2.materials.append(mt)
        pecas[peca] = ob
    return pecas
if os.environ.get("NETO_ROUPA"):
    ROUPAS = roupa()

def barba_pintada(P, na_barba):
    """Barba curta pintada na pele (cor dos vértices), sem casca: borda que se desfaz em fios soltos e
    fios brancos e grisalhos misturados. Sem geometria nova, o nanquim do jogo não contorna como máscara."""
    me = corpo.data; n = len(me.vertices)
    w = np.array([1.0 if na_barba(i) else 0.0 for i in range(n)])
    ar = np.empty(len(me.edges) * 2, dtype=np.int64); me.edges.foreach_get("vertices", ar); ar = ar.reshape(-1, 2)
    grau = np.bincount(ar.ravel(), minlength=n).astype(float) + 1
    def borrar(x, vezes):
        for _ in range(vezes):
            s = x.copy(); np.add.at(s, ar[:, 0], x[ar[:, 1]]); np.add.at(s, ar[:, 1], x[ar[:, 0]]); x = s / grau
        return x
    rng = np.random.default_rng(1932)
    X = P * 60   # ruído de baixa frequência (tufos) para quebrar a borda
    tufo = (np.sin(X[:, 0] * 1.7 + X[:, 2] * 2.3) + np.sin(X[:, 2] * 3.1 - X[:, 1] * 1.3) + np.sin(X[:, 0] * 4.3 + X[:, 1] * 2.9)) / 6 + 0.5
    soft = borrar(w, 3)
    a = np.clip((soft - 0.5 + 0.45 * (tufo - 0.5) + 0.25 * (rng.random(n) - 0.5)) * 3.2 + 0.5, 0, 1)
    a = np.where(soft > 0.97, np.maximum(a, 0.85), a)   # miolo sempre cheio
    claro, escuro = np.array(_hex_lin(os.environ.get("NETO_COR_BARBA", "#d3cdc3"))[:3]), np.array(_hex_lin("#857d72")[:3])
    fio = 0.5 * rng.random(n) ** 6   # maioria branca, alguns fios grisalhos
    cor_barba = claro[None] * (1 - fio[:, None]) + escuro[None] * fio[:, None]
    pele = np.array(PELE_DESENHO[:3])
    cor = pele[None] * (1 - a[:, None]) + cor_barba * a[:, None]
    print(f"BARBA pintada: {int(w.sum())} vértices no miolo, {int((a > 0.05).sum())} com cor")
    attr = me.color_attributes.new("Col", "BYTE_COLOR", "CORNER")
    lv = np.empty(len(me.loops), dtype=np.int64); me.loops.foreach_get("vertex_index", lv)
    rgba = np.ones((len(me.loops), 4)); rgba[:, :3] = cor[lv]
    attr.data.foreach_set("color", rgba.ravel())
    mt = bpy.data.materials.new("pele"); mt.use_nodes = True
    bs = mt.node_tree.nodes["Principled BSDF"]; bs.inputs["Roughness"].default_value = 0.9
    vc = mt.node_tree.nodes.new("ShaderNodeVertexColor"); vc.layer_name = "Col"
    mt.node_tree.links.new(vc.outputs["Color"], bs.inputs["Base Color"])
    antigo = me.materials[0]; antigo.name = "pele-lisa"   # continua nas órbitas tampadas
    me.materials[0] = mt
    return None

CHEIA = bool(os.environ.get("NETO_BARBA_CHEIA"))   # barba bem fechada: bochecha toda, até o peito
def barba():
    b, P = _mistura()
    J = lambda g: P[_grupo_idx(g)].mean(0)
    zl = P[_grupo_idx("lips")][:, 2].mean(); ze = J("joint-l-eye")[2]; zn = J("joint-neck")[2]; cb_y = P[_grupo_idx("lips")][:, 1].mean() + 0.03
    orelha_y = P[_grupo_idx("ears")][:, 1].mean()
    corpo_set = set(_grupo_idx("body").tolist()); lab = set(_grupo_idx("lips").tolist())
    L = P[_grupo_idx("lips")]; zt = L[np.abs(L[:, 0]) < 0.012][:, 2].max()   # topo do lábio de cima, no meio
    def na_barba(i):
        x, y, z = P[i]
        if i not in corpo_set or (i in lab and z < zl + 0.007) or y > orelha_y - 0.012 or z < zl - 0.045: return False
        if abs(x) < 0.026 and abs(z - zl) < 0.007: return False                       # deixa a boca livre
        if zl + 0.007 < z < zt + 0.012 and abs(x) < 0.042 and y < cb_y - 0.01: return True   # bigode largo, cobre o filtro e a beira do lábio
        if 0.022 < abs(x) < 0.045 and zl - 0.006 < z < zt + 0.014: return True         # cantos da boca (liga bigode e queixo)
        if abs(x) > 0.04 and z < zl + (0.045 if CHEIA else 0.03) + (abs(x) - 0.04) * 0.6: return True       # bochecha subindo até a costeleta
        return z < zl - 0.003                                                          # queixo e mandíbula
    MODO = os.environ.get("NETO_BARBA")
    if MODO == "pintada":
        return barba_pintada(P, na_barba)
    if MODO == "fechada":   # barba cheia: desce para baixo do queixo, na frente do pescoço
        _base = na_barba
        def na_barba(i):
            x, y, z = P[i]
            if i in corpo_set and zl - 0.075 < z <= zl - 0.045 and y < cb_y + 0.035 and abs(x) < (0.075 if CHEIA else 0.06): return True
            return _base(i)
        barba_pintada(P, na_barba)   # pele por baixo pintada: a borda da massa se desfaz nela
    me2 = corpo.data.copy(); ob = corpo.copy(); ob.data = me2; ob.name = "barba"
    bpy.context.scene.collection.objects.link(ob)
    ob.shape_key_clear(); me2.vertices.foreach_set("co", P.ravel())
    for m in list(ob.modifiers):
        if m.type == "MASK": ob.modifiers.remove(m)
    bm = bmesh.new(); bm.from_mesh(me2); bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not na_barba(v.index)], context="VERTS")
    if MODO == "fechada":
        bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=1, use_grid_fill=True, smooth=0.5)
    bm.normal_update()
    for _ in range(6): bmesh.ops.smooth_vert(bm, verts=[v for v in bm.verts if v.is_boundary], factor=0.8, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bm.normal_update()
    # volume: rente à pele na borda e cheia por dentro (anéis contados a partir da borda)
    anel = {v: 0 for v in bm.verts if v.is_boundary}; fila = list(anel)
    while fila:
        v = fila.pop(0)
        for e in v.link_edges:
            o = e.other_vert(v)
            if o not in anel: anel[o] = anel[v] + 1; fila.append(o)
    normais = {v: v.normal.copy() for v in bm.verts}
    antes = {v: v.co.copy() for v in bm.verts}
    if MODO == "fechada":
        R = 5
        Q = float(os.environ.get("NETO_BARBA_QUEIXO", "1.0"))   # quanto a massa projeta o queixo
        for v in bm.verts:
            x, y, z = v.co
            r = min(anel.get(v, R), R) / R; r = r * r * (3 - 2 * r)
            if z > zl - 0.004 and anel.get(v, R) > 0: r = max(r, 0.7)   # bigode é faixa estreita: não deixa a borda achatar
            t = (0.006 if z > zl - 0.004 else 0.004) + 0.007 * min(max((zl - z) / 0.04, 0), 1)                 # bochecha fina, mandíbula mais cheia
            f = math.exp(-(x / 0.055) ** 2) * min(max((zl - 0.008 - z) / 0.03, 0), 1)   # massa do queixo
            v.co += float(r) * (normais[v] * float(t) + float(Q * f) * Vector((0, -0.011, -0.022)))
        for _ in range(8): bmesh.ops.smooth_vert(bm, verts=[v for v in bm.verts if not v.is_boundary], factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
        if BARBAS_MH:   # fios prontos por cima: cada ponto anda junto com o pedaço da massa mais perto
            from mathutils.kdtree import KDTree
            vs = list(bm.verts); kd = KDTree(len(vs))
            for k_, v in enumerate(vs): kd.insert(antes[v], k_)
            kd.balance()
            for ob_ in BARBAS_MH:
                for v in ob_.data.vertices:
                    viz_ = kd.find_n(v.co, 6)
                    pesos_ = [1 / (d + 0.002) for _, _, d in viz_]
                    v.co += sum(((vs[i].co - antes[vs[i]]) * w_ for (_, i, _), w_ in zip(viz_, pesos_)), Vector()) / sum(pesos_)
                ob_.data.update()
    else:
        VOL = float(os.environ.get("NETO_BARBA_VOLUME", "0.007"))
        for v in bm.verts: v.co += normais[v] * (0.0006 + VOL * min(anel.get(v, 4), 4) / 4)
        for _ in range(4): bmesh.ops.smooth_vert(bm, verts=[v for v in bm.verts if not v.is_boundary], factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bm.to_mesh(me2); bm.free()
    ob.modifiers.new("espessura", "SOLIDIFY").thickness = 0.0012
    me2.materials.clear(); mt = bpy.data.materials.new("barba"); mt.use_nodes = True
    bs = mt.node_tree.nodes["Principled BSDF"]; bs.inputs["Roughness"].default_value = 1
    claro = np.array(_hex_lin(os.environ.get("NETO_COR_BARBA", "#d8d3ca"))[:3])
    if MODO == "fechada":   # fios: listras finas que descem, brancas e grisalhas
        escuro = np.array(_hex_lin("#8a8277")[:3]); rng = np.random.default_rng(1881)
        attr = me2.color_attributes.new("Col", "BYTE_COLOR", "CORNER")
        V = np.empty(len(me2.vertices) * 3); me2.vertices.foreach_get("co", V); V = V.reshape(-1, 3)
        onda = np.sin(V[:, 0] * 700 + np.sin(V[:, 2] * 180) * 2.5) * 0.5 + 0.5
        k = np.clip(0.45 * onda ** 6 + 0.3 * rng.random(len(V)) ** 6, 0, 0.6)
        cor = claro[None] * (1 - k[:, None]) + escuro[None] * k[:, None]
        lv = np.empty(len(me2.loops), dtype=np.int64); me2.loops.foreach_get("vertex_index", lv)
        rgba = np.ones((len(me2.loops), 4)); rgba[:, :3] = cor[lv]; attr.data.foreach_set("color", rgba.ravel())
        vc = mt.node_tree.nodes.new("ShaderNodeVertexColor"); vc.layer_name = "Col"
        mt.node_tree.links.new(vc.outputs["Color"], bs.inputs["Base Color"])
    else:
        bs.inputs["Base Color"].default_value = (*claro, 1)
    me2.materials.append(mt)
    if os.environ.get("NETO_BARBA_FIOS"):
        barba_fios(ob, zl, zt, cb_y, int(os.environ["NETO_BARBA_FIOS"]))
    return ob

def barba_fios(nucleo, zl, zt, cb_y, N):
    """Mechas (fitas afinando na ponta) nascendo da massa da barba: bigode que cai sobre a boca, bochecha curta,
    queixo comprido até o peito, frisadas. Cada mecha segue o osso da pele de onde nasce."""
    from mathutils.kdtree import KDTree
    rng = np.random.default_rng(1932)
    me = nucleo.data; me.calc_loop_triangles()
    tris = list(me.loop_triangles); areas = np.array([t.area for t in tris]); areas /= areas.sum()
    kd = KDTree(len(me.vertices))
    for v in me.vertices: kd.insert(v.co, v.index)
    kd.balance()
    nomes = {g.index: g.name for g in nucleo.vertex_groups}
    verts, faces, cores, pesos, mechas = [], [], [], [], []
    raiz_c, ponta_c = np.array(_hex_lin("#9f978b")[:3]), np.array(_hex_lin(os.environ.get("NETO_COR_BARBA", "#e8e3da"))[:3])
    LONGO = float(os.environ.get("NETO_BARBA_COMPRIMENTO", "1.0"))
    LADOS = float(os.environ.get("NETO_BARBA_LADOS", "0"))   # quanto as laterais abrem (volume)
    ESPETO = float(os.environ.get("NETO_BARBA_ESPETO", "0.22"))   # desvio aleatório por passo (fios espetados)
    GRAV = float(os.environ.get("NETO_BARBA_GRAVIDADE", "0.18"))   # quanto cada passo cai
    def no_bigode(t):
        c = t.center
        return c.z > zl - 0.004 and abs(c.x) < 0.05 and c.y < cb_y - 0.005
    tb = [i for i, t in enumerate(tris) if no_bigode(t)]
    NB = int(os.environ.get("NETO_BIGODE_FIOS", "0"))
    escolha = list(rng.choice(len(tris), size=N, p=areas))
    if tb and NB:
        ab = np.array([tris[i].area for i in tb]); escolha += list(rng.choice(tb, size=NB, p=ab / ab.sum()))
    for k in escolha:
        t = tris[k]; a, b_ = rng.random(2)
        if a + b_ > 1: a, b_ = 1 - a, 1 - b_
        A, B_, C = (me.vertices[i].co for i in t.vertices)
        p = A + (B_ - A) * a + (C - A) * b_; n = t.normal.copy()
        x, y, z = p
        bigode = z > zl - 0.004 and abs(x) < 0.05 and y < cb_y - 0.005
        curva = Vector()
        if bigode and NB:   # bigode de morsa: sai do meio do lábio para os lados e para baixo, por cima da boca
            lado_x = math.copysign(1, x) if abs(x) > 0.003 else rng.choice((-1, 1))
            L = rng.uniform(0.03, 0.042) * (1 + abs(x) * 6)
            d = Vector((lado_x * 0.5, -0.5, -1)).normalized(); curva = Vector((lado_x * 0.06, 0, 0))
        elif bigode:
            L = rng.uniform(0.022, 0.034); d = (n * 0.35 + Vector((0, -0.15, -1))).normalized()
        elif abs(x) > 0.045 and z > zl - 0.02:
            L = rng.uniform(0.025, 0.042); d = (n * 0.7 + Vector((0, 0, -0.7))).normalized()
        else:
            cf = math.exp(-(x / 0.05) ** 2) * min(max((zl - z) / 0.03, 0), 1)
            L = (0.04 + 0.09 * cf) * LONGO * rng.uniform(0.75, 1.25); d = (n * 0.5 + Vector((0, -0.25, -1))).normalized()
        if not bigode and LADOS:   # volume nas laterais: bochecha e mandíbula abrem para fora
            lat = min(max((abs(x) - 0.02) / 0.04, 0), 1) * math.copysign(1, x)
            d = (d + Vector((lat * LADOS * 0.6, 0, 0))).normalized(); curva = Vector((lat * LADOS * 0.05, 0, 0))
        S = 8; passo = L / S; w0 = rng.uniform(0.004, 0.007) if (bigode and NB) else rng.uniform(0.0025, 0.0055)
        esp = ESPETO * (0.4 if (bigode and NB) else 1)
        lado = d.cross(n)
        if lado.length < 1e-6: lado = Vector((1, 0, 0))
        lado.normalize()
        fase, amp = rng.uniform(0, 6.28), rng.uniform(0.001, 0.0035)   # frisado
        tint = rng.uniform(-0.04, 0.04)
        q = p.copy() - n * 0.001; pts = []
        for s in range(S + 1):
            pts.append(q.copy())
            if s < S:
                d = (d + curva + Vector((0, 0, -GRAV)) + Vector(rng.normal(0, esp, 3))).normalized()
                q = q + d * passo
        _, vi, _ = kd.find(p)
        gs = [(nomes[g.group], g.weight) for g in me.vertices[vi].groups if g.weight > 0.01]
        mechas.append((pts, lado, w0, fase, amp, tint, gs))
    # corte reto: tira CORTE da ponta mais baixa e apara todas as mechas nesse plano (ponta cega, sem afinar)
    CORTE = float(os.environ.get("NETO_BARBA_CORTE", "0"))
    z_corte = float(np.percentile([mc[0][-1].z for mc in mechas], 3)) + CORTE if CORTE else -1e9   # a partir de onde a barba termina (sem os fios soltos)
    rc = np.random.default_rng(7)
    for pts, lado, w0, fase, amp, tint, gs in mechas:
        S = len(pts) - 1; cortada = False
        # corte natural: ponta arredondada (laterais mais curtas que o meio) e cada mecha com sua altura
        zc = z_corte + 0.025 * min((pts[0].x / 0.07) ** 2, 1.5) + rc.normal(0, 0.007)
        for s in range(1, S + 1):
            if pts[s].z < zc:
                a_, b2 = pts[s - 1], pts[s]; f_ = (a_.z - zc) / max(a_.z - b2.z, 1e-9)
                pts = pts[:s] + [a_ + (b2 - a_) * f_]; cortada = True
                break
        if len(pts) < 2: continue
        base = len(verts); n_ = len(pts) - 1
        for s, q in enumerate(pts):
            u = s / S   # posição no fio inteiro: a cor e a largura não mudam com o corte
            w = w0 * (1 - u) ** 0.8 + 0.0004
            if cortada and s == n_: w *= 0.35   # ponta aparada também afina um pouco
            onda = lado * (math.sin(fase + u * 9) * amp)
            verts += [tuple(q + onda - lado * w / 2), tuple(q + onda + lado * w / 2)]
            c = raiz_c * (1 - u ** 0.6) + ponta_c * u ** 0.6 + tint
            cores += [c, c]
            if s < n_: faces.append((base + 2 * s, base + 2 * s + 1, base + 2 * s + 3, base + 2 * s + 2))
        pesos += [gs] * (2 * len(pts))
    m = bpy.data.meshes.new("barba-fios"); m.from_pydata(verts, [], faces); m.update()
    ob = nucleo.copy(); ob.data = m; ob.name = "barba-fios"
    bpy.context.scene.collection.objects.link(ob)
    for md in list(ob.modifiers):
        if md.type != "ARMATURE": ob.modifiers.remove(md)
    ob.vertex_groups.clear()
    grupos = {}
    for i, gs in enumerate(pesos):
        for nome, w in gs:
            if nome not in grupos: grupos[nome] = ob.vertex_groups.new(name=nome)
            grupos[nome].add([i], w, "REPLACE")
    attr = m.color_attributes.new("Col", "BYTE_COLOR", "CORNER")
    lv = np.empty(len(m.loops), dtype=np.int64); m.loops.foreach_get("vertex_index", lv)
    C_ = np.clip(np.array(cores), 0, 1); rgba = np.ones((len(m.loops), 4)); rgba[:, :3] = C_[lv]
    attr.data.foreach_set("color", rgba.ravel())
    mt = bpy.data.materials.new("barba-fios"); mt.use_nodes = True; mt.use_backface_culling = False
    bs = mt.node_tree.nodes["Principled BSDF"]; bs.inputs["Roughness"].default_value = 1
    vc = mt.node_tree.nodes.new("ShaderNodeVertexColor"); vc.layer_name = "Col"
    mt.node_tree.links.new(vc.outputs["Color"], bs.inputs["Base Color"])
    m.materials.append(mt)
    print(f"BARBA fios: {N} mechas + {NB if tb else 0} no bigode ({len(tb)} triângulos), {len(verts)} pontos, {len(faces)} faces")
    return ob
if os.environ.get("NETO_BARBA"):
    BARBA = barba()

if os.environ.get("NETO_TPOSE"):
    # pose T reta: braço, antebraço, mão e dedos num eixo X horizontal; pernas retas; pés para a frente.
    from bl_ext.blender_org.mpfb.services.rigservice import RigService
    from mathutils import Vector as V, Matrix
    bpy.context.view_layer.objects.active = rig; bpy.ops.object.mode_set(mode="POSE")
    def alinhar(nome, alvo):
        pb = rig.pose.bones.get("mixamorig:" + nome)
        if pb is None: return
        bpy.context.view_layer.update()
        mw = rig.matrix_world @ pb.matrix
        atual = (mw.to_3x3() @ V((0, 1, 0))).normalized()   # eixo do osso (Y local)
        q = atual.rotation_difference(V(alvo).normalized())
        nova = Matrix.Translation(mw.to_translation()) @ q.to_matrix().to_4x4() @ mw.to_3x3().to_4x4()
        pb.matrix = rig.matrix_world.inverted() @ nova
    CURVA = float(os.environ.get("NETO_CURVA", "0"))   # 1 = postura curvada do avô
    def girar(nome, graus):
        pb = rig.pose.bones.get("mixamorig:" + nome)
        if pb is None: return
        bpy.context.view_layer.update()
        mw = rig.matrix_world @ pb.matrix
        q = Matrix.Rotation(math.radians(graus), 4, "X")
        pb.matrix = rig.matrix_world.inverted() @ (Matrix.Translation(mw.to_translation()) @ q @ mw.to_3x3().to_4x4())
    if CURVA:
        # coluna em C: cada vértebra dobra um pouco para a frente; pescoço avança; cabeça levanta para olhar adiante
        dobra = (("Spine", 3), ("Spine1", 8), ("Spine2", 13), ("Neck", 5))   # pescoço quase reto: senão a cabeça afunda nos ombros
        for osso, g in dobra: girar(osso, g * CURVA)
        girar("Head", -sum(g for _, g in dobra) * CURVA + 4)   # cabeça volta a olhar adiante (só um pouco baixa)
    OMBRO = float(os.environ.get("NETO_OMBRO_CAI", "0"))   # graus: clavícula caída (ombro de velho, trapézio baixo)
    for lado, sx in (("Left", 1), ("Right", -1)):
        if OMBRO:
            pb = rig.pose.bones.get(f"mixamorig:{lado}Shoulder"); bpy.context.view_layer.update()
            mw = rig.matrix_world @ pb.matrix
            q = Matrix.Rotation(math.radians(OMBRO * sx), 4, "Y")
            pb.matrix = rig.matrix_world.inverted() @ (Matrix.Translation(mw.to_translation()) @ q @ mw.to_3x3().to_4x4())
    for lado, sx in (("Left", 1), ("Right", -1)):
        for osso in ("Shoulder", "Arm", "ForeArm", "Hand"):
            if osso == "Shoulder": continue
            alinhar(lado + osso, (sx, 0, 0))
        for dedo in ("Index", "Middle", "Ring", "Pinky"):
            for i in (1, 2, 3): alinhar(f"{lado}Hand{dedo}{i}", (sx, 0, 0))
        for i in (1, 2, 3): alinhar(f"{lado}HandThumb{i}", (sx * 0.7, -0.7, 0))
        jo = math.radians(9 * CURVA)   # joelhos levemente dobrados no avô
        alinhar(lado + "UpLeg", (0, -math.sin(jo), -math.cos(jo))); alinhar(lado + "Leg", (0, math.sin(jo), -math.cos(jo)))
        pe = rig.pose.bones.get(f"mixamorig:{lado}Foot")
        if pe:  # mantém a inclinação do pé, tira o giro para fora
            bpy.context.view_layer.update()
            d = ((rig.matrix_world @ pe.matrix).to_3x3() @ V((0, 1, 0)))
            alinhar(lado + "Foot", (0, d.y if d.y < 0 else -0.5, d.z))
        alinhar(lado + "ToeBase", (0, -1, 0))
    bpy.context.view_layer.update()
    bpy.ops.object.mode_set(mode="OBJECT")
    RigService.apply_pose_as_rest_pose(rig)
    # osso do topo da cabeça (sem peso), para o jogo saber a altura da cabeça
    if os.environ.get("NETO_TOPO") and "mixamorig:HeadTop_End" not in rig.data.bones:
        n_ = len(corpo.data.vertices); c_ = np.empty(n_ * 3); corpo.data.vertices.foreach_get("co", c_)  # chaves já aplicadas
        topo = c_.reshape(n_, 3)[_grupo_idx("body")][:, 2].max()
        bpy.context.view_layer.objects.active = rig; bpy.ops.object.mode_set(mode="EDIT")
        cab = rig.data.edit_bones["mixamorig:Head"]
        fim = rig.data.edit_bones.new("mixamorig:HeadTop_End"); fim.parent = cab
        fim.head = cab.tail.copy(); fim.tail = V((cab.tail.x, cab.tail.y, topo + 0.02)) if topo > cab.tail.z else cab.tail + V((0, 0, 0.03))
        if (fim.tail - fim.head).length < 0.01: fim.tail = fim.head + V((0, 0, 0.03))
        fim.use_deform = False
        bpy.ops.object.mode_set(mode="OBJECT")
    print("TPOSE aplicada")
    TRAP = os.environ.get("NETO_TRAPEZIO")   # graus da inclinação pescoço -> ombro vista de frente (ex.: 18)
    if TRAP:
        # Levantar o braço da pose A para a T sobe a pele do alto do ombro e o trapézio vira um morro até o
        # queixo. Mede o contorno de frente e rebaixa o que passa de uma reta inclinada, comprimindo para baixo.
        bpy.context.view_layer.update()
        Bw = {b.name.split(":")[-1]: rig.matrix_world @ b.head_local for b in rig.data.bones}
        xs = abs(Bw["LeftArm"].x); z_baixo, z_cima = Bw["Spine2"].z, Bw["Head"].z
        def pesos_cabeca(ob):
            g = ob.vertex_groups.get("mixamorig:Head")
            w = np.zeros(len(ob.data.vertices))
            if g is None: return w
            for v in ob.data.vertices:
                for e in v.groups:
                    if e.group == g.index: w[v.index] = e.weight
            return w
        def mundo(ob):
            n_ = len(ob.data.vertices); c_ = np.empty(n_ * 3); ob.data.vertices.foreach_get("co", c_)
            M = np.array(ob.matrix_world); c_ = c_.reshape(n_, 3)
            return c_ @ M[:3, :3].T + M[:3, 3]
        Pc = mundo(corpo); wc = pesos_cabeca(corpo)
        sel = np.zeros(len(Pc), bool); sel[_grupo_idx("body")] = True
        sel &= (wc < 0.2) & (Pc[:, 2] > z_baixo) & (Pc[:, 2] < z_cima)
        Q = Pc[sel]; ax = np.abs(Q[:, 0])
        xb = np.linspace(0.3 * xs, 1.25 * xs, 24); zt = np.array([Q[np.abs(ax - x) < 0.03 * xs][:, 2].max() for x in xb])
        x_ref = 1.2 * xs; z_ref = np.interp(x_ref, xb, zt)
        alvo_z = z_ref + (x_ref - xb) * math.tan(math.radians(float(TRAP)))
        exc = np.maximum(zt - alvo_z, 0)
        print("TRAPEZIO excesso (cm, escala do modelo):", [round(e * 100, 1) for e in exc])
        for ob in [o for o in bpy.context.scene.objects if o.type == "MESH" and any(m.type == "ARMATURE" for m in o.modifiers)]:
            if ob.data.shape_keys: print("TRAPEZIO pulou (chaves):", ob.name); continue
            P_ = mundo(ob); w_ = pesos_cabeca(ob); a_ = np.abs(P_[:, 0])
            fx = np.clip((a_ - 0.33 * xs) / (0.12 * xs), 0, 1); fx = fx * fx * (3 - 2 * fx)
            e_ = np.interp(a_, xb, exc) * fx * np.clip(1 - w_ / 0.2, 0, 1)
            top = np.interp(a_, xb, zt); base = np.interp(a_, xb, alvo_z) - 0.4 * xs
            wz = np.clip((P_[:, 2] - base) / np.maximum(top - base, 1e-6), 0, 1)
            wz[P_[:, 2] > top + 0.02 * xs] = 0
            P_[:, 2] -= e_ * wz
            Mi = np.array(ob.matrix_world.inverted()); L_ = P_ @ Mi[:3, :3].T + Mi[:3, 3]
            ob.data.vertices.foreach_set("co", L_.ravel()); ob.data.update()
            print("TRAPEZIO", ob.name, "mexeu", int(((e_ * wz) > 1e-4).sum()), "pontos, máx", round(float((e_ * wz).max()) * 100, 1), "cm")

if SEM_ROSTO:
    # recorta lábios e interior da boca e tampa com pele nova encostada na superfície lisa (sem linha de junção)
    bm_ = bmesh.new(); bm_.from_mesh(corpo.data)
    dl = bm_.verts.layers.deform.verify()
    gi_body = corpo.vertex_groups["body"].index
    def na_caixa(co):
        return abs(co.x) < W * 0.72 and z_bot + 0.18 * h < co.z < z_top - 0.3 * h and co.y < cb[1] + 0.06
    faces_fora = [f for f in bm_.faces if all(na_caixa(v.co) and gi_body in v[dl] for v in f.verts)]
    bmesh.ops.delete(bm_, geom=faces_fora, context="FACES")
    borda = [e for e in bm_.edges if len(e.link_faces) == 1 and all(abs(v.co.x) < W and z_bot - 0.01 < v.co.z < z_top + 0.01 and v.co.y < cb[1] + 0.06 for v in e.verts)]
    for v in bm_.verts: v.tag = True   # marca os pontos que já existiam
    res = bmesh.ops.holes_fill(bm_, edges=borda, sides=0)
    novas = res["faces"]
    if not novas:  # holes_fill não fecha laço aberto: cria a face direto pelas arestas de borda
        novas = bmesh.ops.contextual_create(bm_, geom=borda)["faces"]
    print(f"BORDA arestas={len(borda)} faces_novas={len(novas)} lados={[len(f.verts) for f in novas]}")
    originais = {tuple(round(c, 6) for c in v.co) for v in bm_.verts}
    frente = min(novas, key=lambda f: sum(v.co.y for v in f.verts) / len(f.verts))   # o laço da frente (lábios)
    tri = bmesh.ops.triangulate(bm_, faces=[frente])["faces"]
    arestas = list({e for f in tri for e in f.edges})
    bmesh.ops.subdivide_edges(bm_, edges=arestas, cuts=2, use_grid_fill=True)
    novos = [v for v in bm_.verts if tuple(round(c, 6) for c in v.co) not in originais]
    ref = [v for v in bm_.verts if tuple(round(c, 6) for c in v.co) in originais and not na_caixa(v.co) and abs(v.co.x) < W + 0.01 and z_bot - 0.015 < v.co.z < z_top + 0.015 and v.co.y < cb[1] + 0.03]
    # distribui os pontos novos e encosta na superfície lisa
    for _ in range(30):
        for v in novos:
            viz_ = [e.other_vert(v) for e in v.link_edges]
            if viz_: v.co.x, v.co.z = sum(u.co.x for u in viz_) / len(viz_), sum(u.co.z for u in viz_) / len(viz_)
    for v in novos:
        v.co.y = alvo(v.co.x, min(max(v.co.z, z_bot), z_top))
        perto = min(ref, key=lambda u: (u.co - v.co).length_squared)
        v[dl].clear()
        for g_, w_ in perto[dl].items(): v[dl][g_] = w_
        v[dl][gi_body] = 1.0
    bm_.normal_update()
    bm_.to_mesh(corpo.data); bm_.free(); corpo.data.update()
    print(f"BOCA recortada: {len(faces_fora)} faces fora, {len(novos)} pontos novos de pele")

# ---- escala para 1,68 m (pés no chão) ----
bpy.context.view_layer.update()
dep = bpy.context.evaluated_depsgraph_get()
ev = corpo.evaluated_get(dep).to_mesh()
zs = np.array([(corpo.matrix_world @ v.co).z for v in ev.vertices]); corpo.evaluated_get(dep).to_mesh_clear()
k = ALTURA / (zs.max() - zs.min())
rig.scale = (k, k, k)
bpy.context.view_layer.update()

_GRUPOS = {}
def ponto_grupo(grupo):
    """Centro (mundo) de um grupo de vértices do corpo, já com escala e alvos aplicados."""
    mascaras = [m for m in corpo.modifiers if m.type == "MASK"]
    for m in mascaras: m.show_viewport = False   # os marcos ficam nos vértices auxiliares que a máscara esconde
    bpy.context.view_layer.update()
    dep = bpy.context.evaluated_depsgraph_get(); oe = corpo.evaluated_get(dep)
    idx = corpo.vertex_groups[grupo].index
    me = oe.to_mesh()
    if grupo not in _GRUPOS:  # índices do grupo calculados uma vez só
        _GRUPOS[grupo] = [v.index for v in corpo.data.vertices if any(g.group == idx and g.weight > 0.5 for g in v.groups)]
    pts = [oe.matrix_world @ me.vertices[i].co for i in _GRUPOS[grupo]]
    oe.to_mesh_clear()
    for m in mascaras: m.show_viewport = True
    bpy.context.view_layer.update()
    return sum(pts, Vector()) / len(pts)

def material_chapado(nome, rgb):
    m = bpy.data.materials.new(nome); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]; b.inputs["Base Color"].default_value = (*rgb, 1); b.inputs["Roughness"].default_value = 1
    return m

if VARIANTE == "projetado" and DESENHO:
    recorte = DESENHO  # já recortado com alfa (entradas/3d/rosto-recorte.png)
    # marcos: desenho (px) x modelo (mundo)
    OE, OD, BOCA = (450, 450), (608, 450), (528, 585)
    pe, pd, pb = ponto_grupo("joint-r-eye"), ponto_grupo("joint-l-eye"), ponto_grupo("joint-mouth")
    x0, ze = (pe.x + pd.x) / 2, (pe.z + pd.z) / 2
    sx = (OD[0] - OE[0]) / abs(pd.x - pe.x)          # px por metro na horizontal
    # queixo no 3D: ponto mais à frente perto do eixo, abaixo da boca (o marco de boca fica dentro da boca)
    for m_ in corpo.modifiers:
        if m_.type == "MASK": m_.show_viewport = False
    bpy.context.view_layer.update()
    dep = bpy.context.evaluated_depsgraph_get(); oe = corpo.evaluated_get(dep); me = oe.to_mesh()
    cand = [oe.matrix_world @ v.co for v in me.vertices]
    oe.to_mesh_clear()
    cand = [c for c in cand if abs(c.x) < 0.012 and pb.z - 0.075 < c.z < pb.z - 0.02]
    queixo = min(cand, key=lambda c: c.y)
    QUEIXO_PX = 655
    sz = (QUEIXO_PX - OE[1]) / (ze - queixo.z)       # px por metro na vertical, olhos ao queixo
    print(f"QUEIXO z={queixo.z:.3f} y={queixo.y:.3f}")
    cx_px, ce_px = (OE[0] + OD[0]) / 2, OE[1]
    print(f"MARCOS olhos {pe.x:.3f},{pd.x:.3f} z={ze:.3f} boca z={pb.z:.3f} escala {sx:.0f}x{sz:.0f} px/m")
    img = bpy.data.images.load(recorte); W, H = img.size
    m = bpy.data.materials.new("pele_rosto"); m.use_nodes = True; nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]; bsdf.inputs["Roughness"].default_value = 1
    uvn = nt.nodes.new("ShaderNodeUVMap"); uvn.uv_map = "rosto"
    tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = img; tex.extension = "CLIP"
    pele = nt.nodes.new("ShaderNodeRGB"); pele.outputs[0].default_value = PELE_DESENHO
    geo = nt.nodes.new("ShaderNodeNewGeometry"); sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    frente = nt.nodes.new("ShaderNodeMapRange"); frente.inputs["From Min"].default_value = -0.2; frente.inputs["From Max"].default_value = -0.6
    mult = nt.nodes.new("ShaderNodeMath"); mult.operation = "MULTIPLY"
    mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"
    nt.links.new(uvn.outputs["UV"], tex.inputs["Vector"]); nt.links.new(geo.outputs["Normal"], sep.inputs[0])
    nt.links.new(sep.outputs["Y"], frente.inputs["Value"]); nt.links.new(frente.outputs["Result"], mult.inputs[0])
    nt.links.new(tex.outputs["Alpha"], mult.inputs[1]); nt.links.new(mult.outputs[0], mix.inputs["Factor"])
    nt.links.new(pele.outputs[0], mix.inputs["A"]); nt.links.new(tex.outputs["Color"], mix.inputs["B"])
    nt.links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
    for m_ in corpo.modifiers:
        if m_.type == "MASK": m_.show_viewport = False
    bpy.context.view_layer.update()
    for ob in (corpo, olhos):
        uv = ob.data.uv_layers.new(name="rosto")
        dep = bpy.context.evaluated_depsgraph_get(); oe = ob.evaluated_get(dep); me = oe.to_mesh()
        pos = [oe.matrix_world @ v.co for v in me.vertices]  # posição já deformada (alvos, idade, escala)
        oe.to_mesh_clear()
        for poly in ob.data.polygons:
            for li in poly.loop_indices:
                vi = ob.data.loops[li].vertex_index
                w = pos[vi]
                u = (cx_px + (w.x - x0) * sx) / W
                v = 1 - (ce_px + (ze - w.z) * sz) / H
                uv.data[li].uv = (u, v)
        ob.data.materials.clear(); ob.data.materials.append(m)
    for m_ in corpo.modifiers:
        if m_.type == "MASK": m_.show_viewport = True
    cabelo.data.materials.clear(); cabelo.data.materials.append(material_chapado("cabelo", (0.012, 0.009, 0.008)))
    # o corpo inteiro usa o mesmo material: fora do rosto, a cor da pele

# ---- render de conferência ----
cena = bpy.context.scene
cena.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items] else "BLENDER_EEVEE"
cena.view_settings.view_transform = "Standard"
cena.render.resolution_x, cena.render.resolution_y = 600, 600
try:
    cena.eevee.taa_render_samples = 4
except Exception: pass
cena.world = bpy.data.worlds.new("w"); cena.world.use_nodes = True
cena.world.node_tree.nodes["Background"].inputs[0].default_value = (0.9, 0.87, 0.8, 1)
cena.world.node_tree.nodes["Background"].inputs[1].default_value = 0.8
sol = bpy.data.objects.new("sol", bpy.data.lights.new("sol", "SUN")); sol.data.energy = 2.5; sol.rotation_euler = (math.radians(55), 0, math.radians(25)); cena.collection.objects.link(sol)
cd = bpy.data.cameras.new("c"); cd.type = "ORTHO"
cam = bpy.data.objects.new("c", cd); cena.collection.objects.link(cam); cena.camera = cam
if os.environ.get("NETO_ESTILO") == "quadrinho":
    # sombra em degraus (toon) e contorno de nanquim, como no jogo
    cena.render.use_freestyle = True; cena.render.line_thickness_mode = "ABSOLUTE"; cena.render.line_thickness = 2.2
    ls = cena.view_layers[0].freestyle_settings.linesets[0] if cena.view_layers[0].freestyle_settings.linesets else cena.view_layers[0].freestyle_settings.linesets.new("tinta")
    ls.select_by_visibility = True; ls.select_silhouette = True; ls.select_border = True; ls.select_crease = True
    ls.linestyle.color = (0.08, 0.05, 0.04)
    sol.data.energy = 4.0; sol.rotation_euler = (math.radians(40), 0, math.radians(-30))
    for mm in bpy.data.materials:
        if not mm.use_nodes or mm.name.startswith("cabelo"): continue
        nt = mm.node_tree; bs = nt.nodes.get("Principled BSDF")
        if bs is None: continue
        base = bs.inputs["Base Color"]
        cor = base.links[0].from_socket if base.links else None
        rgb = tuple(base.default_value)
        dif = nt.nodes.new("ShaderNodeBsdfDiffuse"); s2r = nt.nodes.new("ShaderNodeShaderToRGB")
        rampa = nt.nodes.new("ShaderNodeValToRGB"); rampa.color_ramp.interpolation = "CONSTANT"
        rampa.color_ramp.elements[0].position = 0.0; rampa.color_ramp.elements[0].color = (0.55, 0.5, 0.6, 1)
        rampa.color_ramp.elements[1].position = 0.35; rampa.color_ramp.elements[1].color = (1, 1, 1, 1)
        mult = nt.nodes.new("ShaderNodeMix"); mult.data_type = "RGBA"; mult.blend_type = "MULTIPLY"; mult.inputs["Factor"].default_value = 1
        emis = nt.nodes.new("ShaderNodeEmission"); out = nt.nodes["Material Output"]
        nt.links.new(dif.outputs[0], s2r.inputs[0]); nt.links.new(s2r.outputs["Color"], rampa.inputs["Fac"])
        if cor: nt.links.new(cor, mult.inputs["A"])
        else: mult.inputs["A"].default_value = rgb
        nt.links.new(rampa.outputs["Color"], mult.inputs["B"]); nt.links.new(mult.outputs["Result"], emis.inputs["Color"])
        nt.links.new(emis.outputs[0], out.inputs["Surface"])
olho_z = (ponto_grupo("joint-l-eye").z + ponto_grupo("joint-r-eye").z) / 2
for nome, ang, esc, z in (("corpo-frente", 0, 1.9, 0.86), ("corpo-perfil", 90, 1.9, 0.86),
                          ("rosto-frente", 0, 0.34, olho_z - 0.04), ("rosto-34", 35, 0.34, olho_z - 0.04), ("rosto-perfil", 90, 0.34, olho_z - 0.04)):
    r = math.radians(ang); cd.ortho_scale = esc
    cam.location = (5 * math.sin(r), -5 * math.cos(r), z); cam.rotation_euler = (math.pi / 2, 0, r)
    cena.render.filepath = f"{SAIDA}/{VARIANTE}-{nome}.png"; bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=f"{SAIDA}/neto-mpfb-{VARIANTE}.blend")
bpy.ops.export_scene.gltf(filepath=f"{SAIDA}/neto-mpfb-{VARIANTE}.glb", export_format="GLB", export_apply=True)  # aplica a máscara que esconde os auxiliares
if SEM_ROSTO:
    def gltf(v): return [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
    def frente_de(c, raio=0.005):  # ponto da pele bem à frente do centro
        dep = bpy.context.evaluated_depsgraph_get(); oe = corpo.evaluated_get(dep); m_ = oe.to_mesh()
        pts = [oe.matrix_world @ v.co for v in m_.vertices]; oe.to_mesh_clear()
        perto = [q for q in pts if abs(q.x - c.x) < raio and abs(q.z - c.z) < raio and q.y < c.y]
        return min(perto, key=lambda q: q.y) if perto else c
    anc = {}
    for nome, g in (("olho_esquerdo", "joint-l-eye"), ("olho_direito", "joint-r-eye"), ("boca", "lips")):
        c = ponto_grupo(g); f = frente_de(c)
        anc[nome] = {"centro": gltf(c), "superficie": gltf(f)}
    import json as _j
    _j.dump(anc, open(f"{SAIDA}/ancoras.json", "w"), indent=1); print("ANCORAS", _j.dumps(anc))
print("PRONTO", VARIANTE, "escala", round(k, 3))
