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

ALTURA = 1.68
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
    d = np.linalg.norm((P - cb) * np.array([0.7, 1, 1.4]), axis=1); peso = np.maximum(peso, np.clip(1 - d / 0.035, 0, 1))
    peso[[i for i in range(len(P)) if i not in corpo_s]] = 0
    # fecha a fresta da boca: o que estiver atrás da superfície dos lábios vem para a frente dela
    lab_i = _grupo_idx("lips"); L = P[lab_i]; lx0, lx1 = L[:, 0].min(), L[:, 0].max(); lz0, lz1 = L[:, 2].min(), L[:, 2].max()
    for i in corpo_s:
        x, y, z = novo[i]
        if lx0 - 0.002 < x < lx1 + 0.002 and lz0 - 0.002 < z < lz1 + 0.002:
            perto = L[np.abs(L[:, 0] - x) < 0.004]
            if len(perto):
                fy = perto[:, 1].min()
                if y > fy + 0.002 and y < fy + 0.04: novo[i, 1] = fy + 0.0015
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
m_cab.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.012, 0.009, 0.008, 1)
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
            mm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.01, 0.008, 0.007, 1)
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
    def regiao(i, peca):
        v = P[i]; l = "l" if v[0] > 0 else "r"; S, El, H = braco[l]
        d1, t1 = dist_seg(v, S, El); d2, _ = dist_seg(v, El, H)
        no_antebraco = d2 < 0.05 and not (d1 < 0.06 and t1 < 0.92)
        if peca == "camisa":
            if no_antebraco: return False
            if d1 < 0.065 and t1 < 0.92: return True                      # manga até o cotovelo
            return abs(v[0]) < abs(S[0]) * 1.05 and Zp - 0.075 < v[2] < Zn - 0.005
        # calça
        if no_antebraco or d1 < 0.065 or (abs(v[0]) > 0.2): return False
        return barra < v[2] < Zp + 0.07
    pecas = {}
    for peca, folga, cor in (("camisa", 0.026, None), ("calca", 0.019, (0.80, 0.74, 0.62))):
        me2 = corpo.data.copy(); ob = corpo.copy(); ob.data = me2; ob.name = peca
        bpy.context.scene.collection.objects.link(ob)
        ob.shape_key_clear(); me2.vertices.foreach_set("co", P.ravel())
        for m in list(ob.modifiers):
            if m.type == "MASK": ob.modifiers.remove(m)
        bm = bmesh.new(); bm.from_mesh(me2); bm.verts.ensure_lookup_table()
        fora = [v for v in bm.verts if v.index not in corpo_set or not regiao(v.index, peca)]
        bmesh.ops.delete(bm, geom=fora, context="VERTS")
        if peca == "camisa":  # malha mais fina para as listras não serrilharem
            bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=2, use_grid_fill=True)
        bm.normal_update()
        for v in bm.verts:
            extra = 0.0
            if peca == "camisa" and v.co.z < Zp - 0.02: extra = (Zp - 0.02 - v.co.z) * 0.25      # barra solta
            if peca == "calca" and v.co.z < barra + 0.035: extra = 0.012                        # barra dobrada
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
    for lado, sx in (("Left", 1), ("Right", -1)):
        for osso in ("Shoulder", "Arm", "ForeArm", "Hand"):
            if osso == "Shoulder": continue
            alinhar(lado + osso, (sx, 0, 0))
        for dedo in ("Index", "Middle", "Ring", "Pinky"):
            for i in (1, 2, 3): alinhar(f"{lado}Hand{dedo}{i}", (sx, 0, 0))
        for i in (1, 2, 3): alinhar(f"{lado}HandThumb{i}", (sx * 0.7, -0.7, 0))
        alinhar(lado + "UpLeg", (0, 0, -1)); alinhar(lado + "Leg", (0, 0, -1))
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
    for nome, g in (("olho_esquerdo", "joint-l-eye"), ("olho_direito", "joint-r-eye"), ("boca", "joint-mouth")):
        c = ponto_grupo(g); f = frente_de(c)
        anc[nome] = {"centro": gltf(c), "superficie": gltf(f)}
    import json as _j
    _j.dump(anc, open(f"{SAIDA}/ancoras.json", "w"), indent=1); print("ANCORAS", _j.dumps(anc))
print("PRONTO", VARIANTE, "escala", round(k, 3))
