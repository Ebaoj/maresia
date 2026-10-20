# Conserta a pata da frente do gato do Anything World e refaz o andar dela pela biomecânica do gato.
#
# 1. Rig: a pata da frente DIREITA veio montada um osso abaixo da esquerda (o "ombro" dela está no cotovelo e o
#    "úmero" é na verdade o antebraço). Aqui os ossos dela viram o espelho exato dos da esquerda (plano x = 0) e os
#    pesos da malha nessa região são copiados do lado esquerdo espelhado.
# 2. Andar da pata esquerda (que tem o rig certo), como num gato de verdade:
#    - apoio: a pata fica plantada e o úmero gira para trás em torno do ombro; o cotovelo dobra para o lado certo
#      (no original o úmero quase não mexe e o cotovelo dobrava ao contrário no fim do apoio);
#    - toda a passada fica AVANCO unidades mais à frente (o gato pisa na frente do ombro, não embaixo dele),
#      sem mudar o comprimento do passo (a pata não escorrega);
#    - balanço: o carpo (pulso) dobra a pata para trás até DOBRA graus logo depois de sair do chão e estica de novo
#      antes de pisar; o punho sobe ALTURA a mais e os dedos se encolhem um pouco.
#    Úmero e antebraço saem de um IK de dois ossos no plano do corpo; a pata (osso bot0) mantém o ângulo original
#    no apoio, para não mudar o contato com o chão.
# 3. A pata direita recebe o movimento da esquerda espelhado, meio ciclo depois.
# Uso: Blender -b --python pata_frente_andar.py -- ENTRADA.glb SAIDA.glb AVANCO DOBRA ALTURA
import bpy, sys, math
from mathutils import Matrix, Vector, kdtree
from bpy_extras import anim_utils

a = sys.argv[sys.argv.index("--") + 1:]
ENT, SAI = a[0], a[1]
AVANCO, DOBRA, ALTURA = float(a[2]), math.radians(float(a[3])), float(a[4])
CURVA_DEDOS = 0.4 * DOBRA
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
cena = bpy.context.scene; cena.render.fps = 30
bpy.ops.import_scene.gltf(filepath=ENT)
arm = [o for o in cena.objects if o.type == "ARMATURE"][0]
malha = [o for o in cena.objects if o.type == "MESH"][0]
ac = arm.animation_data.action
ini, fim = round(ac.frame_range[0]), round(ac.frame_range[1])
N = fim - ini                      # quadros do ciclo (o último repete o primeiro)
W = arm.matrix_world; Wi = W.inverted()
NOMES = ["top0", "top1", "bot0", "ankle", "toe"]
ESQ = [f"leg_front_left_{n}" for n in NOMES]; DIR = [f"leg_front_right_{n}" for n in NOMES]
frente = (W @ arm.pose.bones["neck1"].tail - W @ arm.pose.bones["pelvis"].head); frente.z = 0; frente.normalize()
cima = Vector((0, 0, 1)); lateral = frente.cross(cima).normalized()   # girar +a em torno dele leva "baixo" para "frente"

def p2(v): return Vector((v.dot(frente), v.z))
def ang(v):                       # ângulo do segmento no plano do corpo: 0 = para baixo, positivo = ponta para a frente
    q = p2(v); return math.atan2(q.x, -q.y)
def girar(pb, da):                # gira o osso em torno da própria cabeça, no eixo lateral do mundo
    cab = W @ pb.matrix.translation
    R = Matrix.Translation(cab) @ Matrix.Rotation(da, 4, lateral) @ Matrix.Translation(-cab)
    pb.matrix = Wi @ R @ W @ pb.matrix
    bpy.context.view_layer.update()
def suave(t): t = min(1.0, max(0.0, t)); return t * t * (3 - 2 * t)

def curvas_da_acao():
    cb = anim_utils.action_get_channelbag_for_slot(ac, arm.animation_data.action_slot)
    return cb.fcurves
def chaves(pb, f):
    pb.keyframe_insert("rotation_quaternion", frame=f); pb.keyframe_insert("location", frame=f); pb.keyframe_insert("scale", frame=f)

# ---------- leitura do original (pata esquerda) ----------
orig = {}       # (osso, f) -> (loc, rot, esc) locais
punho = {}; pata_ang = {}
for f in range(ini, fim + 1):
    cena.frame_set(f)
    for n in ESQ:
        pb = arm.pose.bones[n]; orig[(n, f)] = (pb.location.copy(), pb.rotation_quaternion.copy(), pb.scale.copy())
    b = arm.pose.bones
    punho[f] = p2(W @ b[ESQ[2]].head)
    pata_ang[f] = ang(W @ b[ESQ[3]].head - W @ b[ESQ[2]].head)
# fases: a pata sai do chão quando o punho está mais para trás e pisa quando está mais à frente
xs = {f: punho[f].x - p2(W @ arm.pose.bones[ESQ[0]].head).x for f in range(ini, fim)}
sai = min(xs, key=xs.get) - 1; pisa = max(xs, key=xs.get) + 1
sai = ini + (sai - ini) % N; pisa = ini + (pisa - ini) % N
bal = (pisa - sai) % N
def fase_balanco(f):              # 0..1 durante o balanço, None no apoio
    t = (f - sai) % N
    return t / bal if t <= bal else None
print(f"ciclo {N} quadros, sai do chão {sai}, pisa {pisa}, balanço {bal} quadros")

# ---------- 2. novo andar da pata esquerda ----------
fc = curvas_da_acao()
for c in [c for c in fc if any(f'"{n}"' in c.data_path for n in ESQ + DIR)]: fc.remove(c)
alvo_rel = {}
for f in range(ini, fim + 1):
    cena.frame_set(f)
    for n in ESQ:
        pb = arm.pose.bones[n]; pb.rotation_mode = "QUATERNION"
        pb.location, pb.rotation_quaternion, pb.scale = orig[(n, f)]
    bpy.context.view_layer.update()
    b = [arm.pose.bones[n] for n in ESQ]
    s = fase_balanco(f)
    sobe = ALTURA * math.sin(math.pi * s) ** 1.5 if s is not None else 0.0
    S = p2(W @ b[0].head); E = p2(W @ b[1].head); Pu = p2(W @ b[2].head)
    l1, l2 = (E - S).length, (Pu - E).length
    T = punho[f] + Vector((AVANCO, sobe))
    v = T - S; d = min(max(v.length, abs(l1 - l2) + 1e-3), 0.995 * (l1 + l2))
    a_st = math.atan2(v.x, -v.y)
    a1 = math.acos(max(-1, min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))))
    th = a_st - a1                                      # cotovelo atrás da linha ombro-punho (o lado do gato)
    girar(b[0], th - ang(W @ b[1].head - W @ b[0].head))
    E2 = p2(W @ b[1].head); tf = math.atan2((T - E2).x, -(T - E2).y)
    girar(b[1], tf - ang(W @ b[2].head - W @ b[1].head))
    # carpo
    antebraco = ang(W @ b[2].head - W @ b[1].head)
    if s is None:
        alvo = pata_ang[f]                              # apoio: pata com o mesmo ângulo do original
    else:
        alvo = None                                     # preenchido na segunda passada (precisa dos dois extremos)
    alvo_rel[f] = (alvo, antebraco, s)
    if alvo is not None:
        girar(b[2], alvo - ang(W @ b[3].head - W @ b[2].head))
    for pb in b[:3]: chaves(pb, f)
# segunda passada: balanço do carpo, ligando o ângulo relativo de quando sai ao de quando pisa, menos a dobra
volta = lambda f: ini + (f - ini) % N
c_sai = pata_ang[volta(sai)] - alvo_rel[volta(sai)][1]
c_pisa = pata_ang[volta(pisa)] - alvo_rel[volta(pisa)][1]
for f in range(ini, fim + 1):
    alvo, antebraco, s = alvo_rel[f]
    cena.frame_set(f)
    b = [arm.pose.bones[n] for n in ESQ]
    # dedos (ankle, toe) não têm mais curva na ação: voltam ao original a cada quadro, senão o encolhido acumula
    for n in ESQ[3:]:
        pb = arm.pose.bones[n]; pb.location, pb.rotation_quaternion, pb.scale = orig[(n, f)]
    bpy.context.view_layer.update()
    if s is not None:
        dobra = DOBRA * (suave(s / 0.3) if s < 0.3 else 1 - suave((s - 0.3) / 0.55))
        rel = c_sai + (c_pisa - c_sai) * suave(s) - dobra
        girar(b[2], antebraco + rel - ang(W @ b[3].head - W @ b[2].head))
        girar(b[3], -CURVA_DEDOS * dobra / DOBRA if DOBRA else 0)
    for pb in b[2:]: chaves(pb, f)

# ---------- 1. conserto do rig da pata direita ----------
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="EDIT")
eb = arm.data.edit_bones
for ne, nd in zip(ESQ, DIR):
    e, d = eb[ne], eb[nd]
    d.head = Vector((-e.head.x, e.head.y, e.head.z)); d.tail = Vector((-e.tail.x, e.tail.y, e.tail.z)); d.roll = -e.roll
bpy.ops.object.mode_set(mode="OBJECT")
# pesos: cada vértice do lado direito perto da pata recebe os pesos do vértice espelhado do lado esquerdo
Mw = malha.matrix_world; vs = malha.data.vertices
arv = kdtree.KDTree(len(vs))
for v in vs: arv.insert(Mw @ v.co, v.index)
arv.balance()
grupos = {g.name: g.index for g in malha.vertex_groups}; nome_g = {i: n for n, i in grupos.items()}
troca = lambda n: n.replace("left", "@").replace("right", "left").replace("@", "right")
id_esq = {grupos[n] for n in ESQ}; id_dir = {grupos[n] for n in DIR}
pesos = [{g.group: g.weight for g in v.groups} for v in vs]
mudados = 0
for v in vs:
    p = Mw @ v.co
    if p.x >= -1e-4: continue
    _, j, _ = arv.find(Vector((-p.x, p.y, p.z)))
    pe = pesos[j]
    if not (any(pe.get(g, 0) > 1e-3 for g in id_esq) or any(pesos[v.index].get(g, 0) > 1e-3 for g in id_dir)): continue
    for g in list(pesos[v.index]): malha.vertex_groups[nome_g[g]].remove([v.index])
    for g, w in pe.items(): malha.vertex_groups[troca(nome_g[g])].add([v.index], w, "REPLACE")
    mudados += 1
print("vértices com pesos espelhados:", mudados)

# ---------- 3. pata direita = esquerda espelhada, meio ciclo depois ----------
Sx = Matrix.Diagonal((-1, 1, 1, 1))
rest = lambda n: W @ arm.data.bones[n].matrix_local
def mov(n): return (W @ arm.pose.bones[n].matrix) @ rest(n).inverted()
meio = N // 2
esq_mov = {}
for f in range(ini, fim):
    cena.frame_set(f)
    pais = [arm.pose.bones[ESQ[0]].parent.name] + ESQ[:-1]
    esq_mov[f] = [mov(p).inverted() @ mov(n) for p, n in zip(pais, ESQ)]
for f in range(ini, fim + 1):
    fo = ini + ((f - ini) + meio) % N
    cena.frame_set(f)
    pais = [arm.pose.bones[DIR[0]].parent.name] + DIR[:-1]
    for k, (p, n) in enumerate(zip(pais, DIR)):
        D = Sx @ esq_mov[fo][k] @ Sx
        pb = arm.pose.bones[n]; pb.rotation_mode = "QUATERNION"
        pb.matrix = Wi @ (mov(p) @ D @ rest(n))
        bpy.context.view_layer.update()
        chaves(pb, f)
bpy.ops.export_scene.gltf(filepath=SAI, export_format="GLB", export_animations=True, export_animation_mode="ACTIVE_ACTIONS")
print("exportado", SAI, "avanço", AVANCO, "dobra", a[3], "altura", ALTURA)
