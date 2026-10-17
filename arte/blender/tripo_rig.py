# Modelo do Tripo (malha única texturizada, pose A, sem esqueleto) -> personagem do jogo:
#  1) limpa e reduz a malha, textura em 2k, escala para a altura certa, pés no chão, frente em -Y;
#  2) acha as juntas medindo a própria malha (fatias horizontais: tronco x braço, pernas, cabeça);
#  3) monta o esqueleto mixamo de 52 ossos com os eixos copiados do esqueleto do MPFB (mesma convenção
#     do neto e do avô MakeHuman, que o retarget do jogo já conhece) e pinta os pesos automaticamente;
#  4) põe em pose T reta (e curva as costas, se pedido), aplica como repouso e exporta .glb + vistas.
# Uso: Blender -b --python blender/tripo_rig.py -- ENTRADA.glb SAIDA_PREFIXO
#   TRIPO_ALTURA (1.50)  TRIPO_FACES (40000)  TRIPO_TEX (2048)  TRIPO_CURVA (0/1)
import bpy, bmesh, sys, os, math
import numpy as np
from mathutils import Vector, Matrix

a = sys.argv[sys.argv.index("--") + 1:]
ENTRADA, SAIDA = a[0], a[1]
ALTURA = float(os.environ.get("TRIPO_ALTURA", "1.50"))
FACES = int(os.environ.get("TRIPO_FACES", "40000"))
TEX = int(os.environ.get("TRIPO_TEX", "2048"))
CURVA = float(os.environ.get("TRIPO_CURVA", "0"))
cena = bpy.context.scene

for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=ENTRADA)
malha = next(o for o in cena.objects if o.type == "MESH")
malha.name = "avo"; malha.data.name = "avo"


def ativar(ob):
    for o in cena.objects: o.select_set(False)
    ob.select_set(True); bpy.context.view_layer.objects.active = ob


# ---- 1) limpeza, redução, escala, frente
ativar(malha)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bm = bmesh.new(); bm.from_mesh(malha.data)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)   # costuras de UV vinham soltas
ilhas = 0; vistos = set()
for v0 in bm.verts:   # pedaços soltos (partes do Tripo: roupa, cabelo...)
    if v0.index in vistos: continue
    ilhas += 1; pilha = [v0]; vistos.add(v0.index); tam = 0
    while pilha:
        v = pilha.pop(); tam += 1
        for e in v.link_edges:
            o = e.other_vert(v)
            if o.index not in vistos: vistos.add(o.index); pilha.append(o)
    if tam > 2000: print("PEDACO", ilhas, tam, "pontos")
print("PEDACOS", ilhas)
bm.to_mesh(malha.data); bm.free()
dec = malha.modifiers.new("reduz", "DECIMATE"); dec.ratio = min(1.0, FACES / len(malha.data.polygons))
bpy.ops.object.modifier_apply(modifier="reduz")
P = np.array([v.co[:] for v in malha.data.vertices])
k = ALTURA / (P[:, 2].max() - P[:, 2].min())
centro = np.array([(P[:, 0].max() + P[:, 0].min()) / 2, (P[:, 1].max() + P[:, 1].min()) / 2, P[:, 2].min()])
P = (P - centro) * k
# frente: para onde apontam os dedos dos pés (o pé passa muito mais da canela na frente que atrás)
pe = P[P[:, 2] < 0.03 * ALTURA]; canela = P[(P[:, 2] > 0.08 * ALTURA) & (P[:, 2] < 0.12 * ALTURA)]
cy = np.median(canela[:, 1])
if pe[:, 1].max() - cy > cy - pe[:, 1].min():
    P[:, 0] *= -1; P[:, 1] *= -1   # gira 180° em Z: frente para -Y
malha.data.vertices.foreach_set("co", P.ravel()); malha.data.update()
print(f"MALHA {len(malha.data.vertices)} pontos, {len(malha.data.polygons)} faces, escala {k:.3f}")
for im in bpy.data.images:
    if im.size[0] > TEX: im.scale(TEX, TEX)

# ---- 2) juntas medidas na malha
H = ALTURA


def fatia(z, faixa=0.008, lado=None):
    s = P[np.abs(P[:, 2] - z) < faixa]
    if lado is not None: s = s[s[:, 0] * lado > 0]
    return s


def segmentos_x(s, gap=0.015):
    """Pedaços contínuos de uma fatia ao longo de |x| (tronco, braço...)."""
    if not len(s): return []
    o = s[np.argsort(np.abs(s[:, 0]))]; ax = np.abs(o[:, 0])
    cortes = np.nonzero(np.diff(ax) > gap)[0]
    return np.split(o, cortes + 1)


# virilha: o ponto mais baixo do meio do corpo (entre as pernas não há malha)
meio = P[(np.abs(P[:, 0]) < 0.012) & (P[:, 2] > 0.15 * H)]
z_virilha = meio[:, 2].min()
# axila: a fatia mais alta em que o braço ainda está separado do tronco
# sobe do meio do braço até o braço encostar no tronco (acima disso, pescoço e ombro também dão dois pedaços)
z_axila = None; sep = False
for z in np.arange(z_virilha + 0.12, 0.85 * H, 0.004):
    dois = len(segmentos_x(fatia(z, lado=1))) >= 2
    if dois: sep = True; z_axila = z
    elif sep: break
J = {}
for lado, nome in ((1, "Left"),):
    # linha do braço: centro do pedaço de fora em cada fatia abaixo da axila
    linha = []
    for z in np.arange(z_axila, 0.15 * H, -0.006):
        seg = segmentos_x(fatia(z, lado=lado))
        if len(seg) >= 2: linha.append(seg[-1].mean(0))
    linha = np.array(linha)
    ponta = P[np.argmax(P[:, 0] * lado)]                      # ponta dos dedos (o mais afastado)
    # ombro: logo acima da axila, 3,5 cm para dentro da borda de fora do deltoide
    z_o = z_axila + 0.045 * H / 1.5
    s_o = fatia(z_o, 0.01, lado=lado)
    borda_o = np.abs(s_o[:, 0]).max()
    perto_o = s_o[np.abs(s_o[:, 0]) > borda_o - 0.07 * H / 1.5]
    ombro = np.array([lado * (borda_o - 0.035 * H / 1.5), perto_o[:, 1].mean(), z_o])
    print("OMBRO z_axila", round(float(z_axila), 3), "borda", round(float(borda_o), 3))
    comp = np.linalg.norm(ponta - ombro); mao = 0.20 * comp     # mão grande: ~1/5 do braço até a ponta
    punho = ombro + (ponta - ombro) * (1 - mao / comp)
    cotovelo = ombro + (punho - ombro) * 0.5
    # y de cotovelo e punho: centro da malha naquela altura do braço
    for nome_j, p_ in (("cot", cotovelo), ("pun", punho)):
        viz = P[np.linalg.norm(P - p_, axis=1) < 0.035]
        if len(viz): p_[1] = viz[:, 1].mean()
    J[nome + "Arm"], J[nome + "ForeArm"], J[nome + "Hand"], J[nome + "Ponta"] = ombro, cotovelo, punho, ponta
    # perna: quadril, joelho, tornozelo, bola do pé e ponta
    perna = P[(P[:, 0] * lado > 0.01) & (P[:, 0] * lado < 0.6 * abs(J[nome + "Hand"][0])) & (P[:, 2] < z_virilha)]   # sem as mãos, que descem até a coxa
    def centro_z(z):
        s = perna[np.abs(perna[:, 2] - z) < 0.01]; return s.mean(0) if len(s) else None
    quadril = centro_z(z_virilha - 0.02); quadril[2] = z_virilha + 0.055 * H / 1.5
    joelho = centro_z(0.285 * H); tornozelo = centro_z(0.055 * H)
    pe = perna[perna[:, 2] < 0.05 * H]; dedo = pe[np.argmin(pe[:, 1])]
    bola = tornozelo + (dedo - tornozelo) * 0.7; bola[2] = 0.02 * H; tornozelo[2] = 0.06 * H
    J[nome + "UpLeg"], J[nome + "Leg"], J[nome + "Foot"], J[nome + "ToeBase"], J[nome + "Toe_End"] = quadril, joelho, tornozelo, bola, np.array([dedo[0], dedo[1], 0.015 * H])
for k_ in [k_ for k_ in J if k_.startswith("Left")]:   # lado direito: espelho do esquerdo
    J["Right" + k_[4:]] = J[k_] * np.array([-1, 1, 1])
z_top = P[:, 2].max()
def centro_tronco(z):
    s = fatia(z, 0.012); s = s[np.abs(s[:, 0]) < 0.08]; return np.array([0.0, (s[:, 1].max() + s[:, 1].min()) / 2, z])
J["Hips"] = centro_tronco(z_virilha + 0.07 * H / 1.5)
z_pescoco = z_axila + 0.10 * H / 1.5
for i, nome in enumerate(("Spine", "Spine1", "Spine2")):
    J[nome] = centro_tronco(J["Hips"][2] + (z_pescoco - J["Hips"][2]) * (i + 1) / 4)
J["Neck"] = centro_tronco(z_pescoco)
J["Head"] = centro_tronco(z_top - 0.135 * H / 1.5)
J["HeadTop_End"] = np.array([0.0, J["Head"][1], z_top])
print("JUNTAS", {k_: [round(float(x), 3) for x in v] for k_, v in J.items()})

# ---- 3) esqueleto: hierarquia e eixos do mixamo do MPFB, posições medidas
from bl_ext.blender_org.mpfb.services.humanservice import HumanService
doador = HumanService.create_human(scale=0.1)
rig_d = HumanService.add_builtin_rig(doador, "mixamo", import_weights=False)
eixos = {b.name: (b.head_local.copy(), b.tail_local.copy(), (rig_d.matrix_world.to_3x3() @ b.z_axis).normalized(), b.parent.name if b.parent else None) for b in rig_d.data.bones}
arm = bpy.data.armatures.new("avo-esqueleto"); rig = bpy.data.objects.new("avo-esqueleto", arm)
cena.collection.objects.link(rig); ativar(rig); bpy.ops.object.mode_set(mode="EDIT")
V = lambda p: Vector((float(p[0]), float(p[1]), float(p[2])))
cabecas = {}
for lado, nome in ((1, "Left"), (-1, "Right")):
    cabecas[nome + "Shoulder"] = V(J["Neck"]) + Vector((lado * 0.025, 0.01, -0.03))
    for b in ("Arm", "ForeArm", "Hand", "UpLeg", "Leg", "Foot", "ToeBase", "Toe_End"): cabecas[nome + b] = V(J[nome + b])
    # dedos: leque na mão, do punho para a ponta; palma voltada para a perna (pose A)
    pun, pon = V(J[nome + "Hand"]), V(J[nome + "Ponta"]); eixo = (pon - pun).normalized(); L = (pon - pun).length
    frente = Vector((0, -1, 0))
    for j, (dedo, off) in enumerate((("Index", -0.012), ("Middle", -0.004), ("Ring", 0.004), ("Pinky", 0.012))):
        base = pun + eixo * L * 0.45 + frente * -off * 1.5
        for f in range(1, 5): cabecas[f"{nome}Hand{dedo}{f}"] = base + eixo * L * 0.55 * (f - 1) / 3
    pol = pun + eixo * L * 0.12 + frente * 0.02
    for f in range(1, 5): cabecas[f"{nome}HandThumb{f}"] = pol + (eixo * 0.6 + frente * 0.8).normalized() * L * 0.4 * (f - 1) / 3
for b in ("Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "HeadTop_End"): cabecas[b] = V(J[b])
filhos = {}
for n, (_, _, _, pai) in eixos.items():
    if pai: filhos.setdefault(pai, []).append(n)
faltam = [n for n in eixos if n.split(":")[-1] not in cabecas]
print("SEM POSICAO MEDIDA:", faltam)
for n, (h0, t0, z_ax, pai) in eixos.items():   # o que não foi medido fica no lugar do pai, deslocado como no doador
    curto = n.split(":")[-1]
    if curto not in cabecas and pai and pai.split(":")[-1] in cabecas:
        cabecas[curto] = cabecas[pai.split(":")[-1]] + (V(h0) - V(eixos[pai][0])) * (ALTURA / 1.68)
for n, (h0, t0, z_ax, pai) in eixos.items():
    curto = n.split(":")[-1]
    eb = arm.edit_bones.new(n)
    eb.head = cabecas.get(curto, V(h0))
    fs = [f for f in filhos.get(n, []) if f.split(":")[-1] in cabecas]
    if fs:   # a ponta do osso vai na cabeça do filho principal (mesma convenção do mixamo)
        pref = [f for f in fs if not any(s in f for s in ("Shoulder", "Thumb", "Index", "Ring", "Pinky", "UpLeg"))] or fs
        eb.tail = cabecas[pref[0].split(":")[-1]]
    else:
        d_ = (t0 - h0); eb.tail = eb.head + d_.normalized() * max(d_.length * 0.6, 0.015)
    if (eb.tail - eb.head).length < 1e-4: eb.tail = eb.head + Vector((0, 0, 0.01))
    eb.align_roll(z_ax)
for n, (_, _, _, pai) in eixos.items():
    if pai: arm.edit_bones[n].parent = arm.edit_bones[pai]
bpy.ops.object.mode_set(mode="OBJECT")
for o in [doador, rig_d] + list(doador.children):
    if o.name in bpy.data.objects: bpy.data.objects.remove(o, do_unlink=True)
print("ESQUELETO", len(arm.bones), "ossos")

# pesos automáticos (calor dos ossos); a ponta do topo da cabeça e as pontas não deformam
for b in arm.bones:
    if b.name.endswith(("HeadTop_End", "Toe_End")) or "4" == b.name[-1]: b.use_deform = False
for o in cena.objects: o.select_set(False)
malha.select_set(True); rig.select_set(True); bpy.context.view_layer.objects.active = rig
bpy.ops.object.parent_set(type="ARMATURE_AUTO")
sem = sum(1 for v in malha.data.vertices if not v.groups)
print("PESOS", len(malha.vertex_groups), "grupos;", sem, "pontos sem peso")

# ---- 4) pose T reta (+ costas curvadas), aplicada como repouso
ativar(rig); bpy.ops.object.mode_set(mode="POSE")
def alinhar(nome, alvo):
    pb = rig.pose.bones.get("mixamorig:" + nome)
    if pb is None: return
    bpy.context.view_layer.update()
    mw = rig.matrix_world @ pb.matrix; atual = (mw.to_3x3() @ Vector((0, 1, 0))).normalized()
    q = atual.rotation_difference(Vector(alvo).normalized())
    pb.matrix = rig.matrix_world.inverted() @ (Matrix.Translation(mw.to_translation()) @ q.to_matrix().to_4x4() @ mw.to_3x3().to_4x4())
def girar(nome, graus):
    pb = rig.pose.bones.get("mixamorig:" + nome)
    if pb is None: return
    bpy.context.view_layer.update(); mw = rig.matrix_world @ pb.matrix
    pb.matrix = rig.matrix_world.inverted() @ (Matrix.Translation(mw.to_translation()) @ Matrix.Rotation(math.radians(graus), 4, "X") @ mw.to_3x3().to_4x4())
if CURVA:
    dobra = (("Spine", 3), ("Spine1", 8), ("Spine2", 13), ("Neck", 5))
    for o_, g in dobra: girar(o_, g * CURVA)
    girar("Head", -sum(g for _, g in dobra) * CURVA + 4)
for lado, sx in (("Left", 1), ("Right", -1)):
    for o_ in ("Arm", "ForeArm", "Hand"): alinhar(lado + o_, (sx, 0, 0))
    for dedo in ("Index", "Middle", "Ring", "Pinky"):
        for i in (1, 2, 3): alinhar(f"{lado}Hand{dedo}{i}", (sx, 0, 0))
    for i in (1, 2, 3): alinhar(f"{lado}HandThumb{i}", (sx * 0.7, -0.7, 0))
bpy.context.view_layer.update(); bpy.ops.object.mode_set(mode="OBJECT")
# aplica: a malha guarda a deformação e o esqueleto toma a pose como repouso
ativar(malha)
mod = next(m for m in malha.modifiers if m.type == "ARMATURE")
bpy.ops.object.modifier_copy(modifier=mod.name)
bpy.ops.object.modifier_apply(modifier=mod.name)
ativar(rig); bpy.ops.object.mode_set(mode="POSE"); bpy.ops.pose.armature_apply(selected=False); bpy.ops.object.mode_set(mode="OBJECT")
print("TPOSE aplicada")

# ---- exporta e renderiza
bpy.ops.wm.save_as_mainfile(filepath=f"{SAIDA}.blend")
for o in cena.objects: o.select_set(o in (malha, rig))
bpy.ops.export_scene.gltf(filepath=f"{SAIDA}.glb", export_format="GLB", use_selection=True, export_apply=False,
                          export_image_format="JPEG")
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); cena.collection.objects.link(cam); cena.camera = cam
cam.data.type = "ORTHO"; cam.data.ortho_scale = ALTURA * 1.3
sol = bpy.data.objects.new("sol", bpy.data.lights.new("sol", "SUN")); cena.collection.objects.link(sol)
sol.rotation_euler = (math.radians(50), 0, math.radians(30)); sol.data.energy = 3
cena.world = cena.world or bpy.data.worlds.new("w"); cena.world.use_nodes = True
cena.world.node_tree.nodes["Background"].inputs[0].default_value = (0.75, 0.74, 0.71, 1)
cena.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items] else "BLENDER_EEVEE"
cena.render.resolution_x, cena.render.resolution_y = 700, 800
for nome, ang in (("frente", 0), ("perfil", 90)):
    r = math.radians(ang); cam.location = (5 * math.sin(r), -5 * math.cos(r), ALTURA * 0.5); cam.rotation_euler = (math.pi / 2, 0, r)
    cena.render.filepath = f"{SAIDA}-{nome}.png"; bpy.ops.render.render(write_still=True)
print("PRONTO tripo")
