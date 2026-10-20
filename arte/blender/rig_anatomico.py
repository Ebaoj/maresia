# Corrige o esqueleto do gato do Anything World pela anatomia do gato real e converte a animação do arquivo.
# (medidas e motivos em finais/gato-anythingworld/analise/anatomia.md)
#  - cabeça gira na nuca (articulação atlanto-occipital), não no topo do crânio; pescoço volta para o meio (x = 0);
#  - escápula nova em cada lado (pivô no meio, ponta na junta do ombro), com pesos tirados do tronco;
#  - ponta do ombro um pouco à frente (úmero inclinado) e joelho de trás à frente (fêmur inclinado para a frente);
#  - dedos de trás dobram na almofada (articulação metatarsofalangeana), não no calcanhar da pata;
#  - orelhas com 2 ossos cada (base e ponta) presos na cabeça; rabo começando onde sai do quadril, pelo meio dele; o crânio e as orelhas deixam de seguir o pescoço;
#  - pata da frente direita = espelho da esquerda (ossos e pesos); o movimento dela é o da esquerda espelhado,
#    DEFASAGEM quadros depois (meio ciclo no andar e no correr, 0 nos pulos e no parado).
# A animação é convertida mantendo a rotação de cada osso no mundo (só muda onde fica o pivô).
# Uso: Blender -b --python rig_anatomico.py -- ENTRADA.glb SAIDA.glb DEFASAGEM
import bpy, sys, math
from mathutils import Matrix, Vector, kdtree
from bpy_extras import anim_utils

a = sys.argv[sys.argv.index("--") + 1:]
ENT, SAI, DEFAS = a[0], a[1], a[2]
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
cena = bpy.context.scene; cena.render.fps = 30
bpy.ops.import_scene.gltf(filepath=ENT)
arm = [o for o in cena.objects if o.type == "ARMATURE"][0]
malha = [o for o in cena.objects if o.type == "MESH"][0]
ac = arm.animation_data.action
ini, fim = round(ac.frame_range[0]), round(ac.frame_range[1]); N = max(1, fim - ini)
DEFAS = N // 2 if DEFAS == "meio" else int(DEFAS)
W = arm.matrix_world
assert abs(W.to_3x3().determinant() - 1) < 1e-3
A2W = lambda v: W @ Vector(v)            # coordenadas do mundo (z para cima, frente = -y) <-> armadura
W2A = lambda v: W.inverted() @ Vector(v)
NOMES = ["top0", "top1", "bot0", "ankle", "toe"]
ESQ = [f"leg_front_left_{n}" for n in NOMES]; DIR = [f"leg_front_right_{n}" for n in NOMES]

# ---------- 1. amostra a animação original (por quadro inteiro) ----------
ossos0 = [b.name for b in arm.data.bones]
rest0 = {b.name: b.matrix_local.copy() for b in arm.data.bones}
L0_orig = {b.name: b.length for b in arm.data.bones}
orig = {}
for f in range(ini, fim + 1):
    cena.frame_set(f)
    orig[f] = {pb.name: (pb.matrix.copy(), pb.location.copy(), pb.scale.copy()) for pb in arm.pose.bones}

# ---------- 2. esqueleto novo (modo edição, coordenadas do mundo) ----------
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="EDIT")
eb = arm.data.edit_bones
def mundo(e): return A2W(e.head), A2W(e.tail)
def por(e, cab=None, cau=None):
    if cab is not None: e.head = W2A(cab)
    if cau is not None: e.tail = W2A(cau)
NUCA = Vector((0.0, -20.0, 44.5))         # atrás e abaixo das orelhas (crânio vai de y -35 a -20; topo z 52)
z0 = min(A2W(v.co).z for v in malha.data.vertices)   # chão, para converter as alturas medidas acima do chão
NUCA.z += z0
h0 = eb["head0"]; _, cauda_h = mundo(h0)
# pescoço: neck0 na base (meio do corpo), neck1 no meio do caminho até a nuca
n0h = A2W(eb["neck0"].head); n0h.x = 0.0
n1h = n0h.lerp(NUCA, 0.5) + Vector((0, 0, -1.2))   # coluna cervical curva (folga para o IK do pescoço)
eb["body_top1"].tail = W2A(n0h)
por(eb["neck0"], cab=n0h, cau=n1h); por(eb["neck1"], cab=n1h, cau=NUCA); por(h0, cab=NUCA, cau=cauda_h)
# ombro um pouco à frente e escápula
for lado, s in (("left", 1), ("right", -1)):
    t0 = eb[f"leg_front_{lado}_top0"]
    ombro = A2W(eb["leg_front_left_top0"].head); ombro.x *= s       # o lado direito ainda está errado: usa o esquerdo
    ombro += Vector((-0.15 * s, -1.7, 0.3))
    if lado == "left": por(t0, cab=ombro)
    topo = Vector((4.0 * s, -15.0, 42.5 + z0))       # borda de cima da escápula, um pouco acima do dorso; ~36 graus da vertical
    piv = topo.lerp(ombro, 0.5)                      # gira pelo meio: a borda de cima vai para trás quando o ombro vai para a frente
    e = eb.new(f"scapula_{lado}"); e.head = W2A(piv); e.tail = W2A(ombro); e.roll = 0
    e.parent = eb["body_top1"]
    if lado == "left": t0.parent = e; t0.use_connect = False
# joelho de trás à frente e dedos de trás na almofada
for lado, s in (("left", 1), ("right", -1)):
    p = f"leg_hind_{lado}_"
    joelho = A2W(eb[p + "top1"].tail) + Vector((0, -1.7, 0.6))
    eb[p + "top1"].tail = W2A(joelho); eb[p + "bot0"].head = W2A(joelho)
    alm = A2W(eb[p + "toe"].head) + Vector((0, -2.5, 0.1))
    eb[p + "ankle"].tail = W2A(alm); eb[p + "toe"].head = W2A(alm); eb[p + "toe"].tail = W2A(alm + Vector((0, -2.6, -0.3)))
# orelhas: base e ponta medidas na malha (ponta em x ±7,9, y -24,4, 57 acima do chão... z do mundo = altura + z0)
for lado, s in (("left", 1), ("right", -1)):
    base = Vector((5.0 * s, -23.4, 51.6 + z0)); meio = Vector((6.6 * s, -24.0, 54.3 + z0)); ponta = Vector((7.95 * s, -24.4, 57.0 + z0))
    e0 = eb.new(f"ear_{lado}_0"); e0.head = W2A(base); e0.tail = W2A(meio); e0.parent = h0
    e1 = eb.new(f"ear_{lado}_1"); e1.head = W2A(meio); e1.tail = W2A(ponta); e1.parent = e0; e1.use_connect = True
# rabo: começa onde ele sai da traseira do quadril (o original começava no alto do quadril, na frente do rabo, e o
# rabo baixado fazia um "toco" antes de descer); a cadeia passa pelo meio da grossura do rabo
base_rabo = Vector((0.0, 26.6, 39.3 + z0))   # meio da grossura do rabo, onde ele encontra o quadril
eb["tail0"].head = W2A(base_rabo)
if eb["tail0"].parent and eb["tail0"].use_connect: eb["tail0"].parent.tail = W2A(base_rabo)
for i in range(1, 7):
    e = eb[f"tail{i}"]; h = A2W(e.head); h.y += 1.0; h.x = 0.0 if i < 6 else h.x
    e.head = W2A(h)
    if i == 1: eb["tail0"].tail = W2A(h)
t6 = eb["tail6"]; tt = A2W(t6.tail); tt.y += 1.0; t6.tail = W2A(tt)
# pata da frente direita = espelho da esquerda (inclui a escápula)
for ne, nd in zip(ESQ + ["scapula_left"], DIR + ["scapula_right"]):
    e, d = eb[ne], eb[nd]
    d.head = Vector((-e.head.x, e.head.y, e.head.z)); d.tail = Vector((-e.tail.x, e.tail.y, e.tail.z)); d.roll = -e.roll
eb[DIR[0]].parent = eb["scapula_right"]; eb[DIR[0]].use_connect = False
bpy.ops.object.mode_set(mode="OBJECT")
rest1 = {b.name: b.matrix_local.copy() for b in arm.data.bones}
print("ossos novos:", [n for n in rest1 if n not in rest0])

# ---------- 3. pesos ----------
Mw = malha.matrix_world; vs = malha.data.vertices
for n in ("scapula_left", "scapula_right", "ear_left_0", "ear_left_1", "ear_right_0", "ear_right_1"):
    if n not in malha.vertex_groups: malha.vertex_groups.new(name=n)
G = {g.name: g.index for g in malha.vertex_groups}; GN = {i: n for n, i in G.items()}
pesos = [{g.group: g.weight for g in v.groups} for v in vs]
def suave(t): t = min(1.0, max(0.0, t)); return t * t * (3 - 2 * t)
def dist_seg(p, a_, b_):
    ab = b_ - a_; t = max(0.0, min(1.0, (p - a_).dot(ab) / ab.length_squared)); return (p - (a_ + ab * t)).length
pos = [Mw @ v.co for v in vs]
tronco = {G[n] for n in ("body_top1", "body_top0", "body", "neck0")}
cab0 = A2W(arm.data.bones["scapula_left"].head_local); cau0 = A2W(arm.data.bones["scapula_left"].tail_local)
topo_esc = cab0 + (cab0 - cau0)
mud = {"escápula": 0, "orelha": 0, "crânio": 0}
for i, p in enumerate(pos):
    w = pesos[i]
    h = p.z - z0
    # escápula esquerda (a direita vem do espelho, abaixo)
    if p.x > 1.0 and h > 24:
        k = 1 - suave((dist_seg(p, topo_esc, cau0) - 2.5) / 4.5)
        tr = sum(w.get(g, 0) for g in tronco)
        if k > 0 and tr > 0:
            for g in tronco:
                if g in w: w[g] *= (1 - k)
            w[G["scapula_left"]] = w.get(G["scapula_left"], 0) + k * tr; mud["escápula"] += 1
    # orelhas
    if -27.0 < p.y < -18.5 and abs(p.x) > 2.5 and h > 50.3:
        lado = "left" if p.x > 0 else "right"
        tot = suave((h - 50.3) / 2.2); pt = suave((h - 53.5) / 2.0)
        w.clear(); w[G["head0"]] = 1 - tot; w[G[f"ear_{lado}_0"]] = tot * (1 - pt); w[G[f"ear_{lado}_1"]] = tot * pt
        mud["orelha"] += 1
    # crânio (na frente da nuca e acima da mandíbula) gira com a cabeça, não com o pescoço
    elif p.y < -20.5 and h > 44 and G["neck1"] in w:
        k = suave((-p.y - 20.5) / 2.0); n1 = w[G["neck1"]]
        w[G["neck1"]] = n1 * (1 - k); w[G["head0"]] = w.get(G["head0"], 0) + n1 * k; mud["crânio"] += 1
# espelho da região da pata da frente direita
arv = kdtree.KDTree(len(vs))
for i, p in enumerate(pos): arv.insert(p, i)
arv.balance()
troca = lambda n: n.replace("left", "@").replace("right", "left").replace("@", "right")
id_esq = {G[n] for n in ESQ + ["scapula_left"]}; id_dir = {G[n] for n in DIR + ["scapula_right"]}
espelhados = 0; novos = {}
for i, p in enumerate(pos):
    if p.x >= -1e-4: continue
    _, j, _ = arv.find(Vector((-p.x, p.y, p.z)))
    if any(pesos[j].get(g, 0) > 1e-3 for g in id_esq) or any(pesos[i].get(g, 0) > 1e-3 for g in id_dir):
        novos[i] = {G[troca(GN[g])]: wt for g, wt in pesos[j].items()}; espelhados += 1
for i, w in novos.items(): pesos[i] = w
for g in malha.vertex_groups: g.remove(list(range(len(vs))))
for i, w in enumerate(pesos):
    s = sum(w.values())
    for g, wt in w.items():
        if wt > 1e-4: malha.vertex_groups[GN[g]].add([i], wt / s, "REPLACE")
print("pesos:", mud, "espelhados", espelhados)

# ---------- 4. animação no esqueleto novo ----------
# Cada osso mantém a rotação que tinha no mundo. Onde o pivô mudou, um IK de dois ossos devolve o ponto que importa
# para onde estava: pescoço (neck0, neck1) leva a nuca ao lugar em que a cabeça original a punha; úmero e rádio levam
# o punho ao ponto original; fêmur e tíbia levam o jarrete ao ponto original. A pata direita da frente vem depois,
# espelhando a esquerda já convertida.
cb = anim_utils.action_get_channelbag_for_slot(ac, arm.animation_data.action_slot)
for c in list(cb.fcurves): cb.fcurves.remove(c)
ordem = sorted(arm.data.bones, key=lambda b: len(b.parent_recursive))
rot3 = lambda m: m.to_3x3().normalized()
Sx = Matrix.Diagonal((-1, 1, 1))      # espelho em x (no espaço da armadura x é o x do mundo)
def volta(f): return ini + (f - ini) % N
def Q(f, n): return rot3(orig[f][n][0]) @ rot3(rest0[n]).transposed()
CADEIAS = {}   # osso de cima -> (osso de baixo, função alvo(f), dica(f))
def ponto_velho(f, n, t):     # ponto t (0 cabeça, 1 cauda) do osso n no quadro f, na pose original
    m = orig[f][n][0]; return m @ Vector((0, t * L0[n], 0))
L0 = {}
L1 = {b.name: b.length for b in arm.data.bones}
for n in ossos0: L0[n] = L0_orig[n]
nuca_rest = rest1["head0"].translation
CADEIAS["neck0"] = ("neck1", lambda f: (orig[f]["head0"][0] @ rest0["head0"].inverted()) @ nuca_rest, lambda f: orig[f]["neck1"][0].translation)
CADEIAS["leg_front_left_top0"] = ("leg_front_left_top1", lambda f: ponto_velho(f, "leg_front_left_bot0", 0), lambda f: ponto_velho(f, "leg_front_left_top1", 0))
for lado in ("left", "right"):
    p = f"leg_hind_{lado}_"
    CADEIAS[p + "top1"] = (p + "bot0", (lambda pp: lambda f: ponto_velho(f, pp + "ankle", 0))(p), (lambda pp: lambda f: ponto_velho(f, pp + "bot0", 0))(p))
BAIXO = {v[0]: k for k, v in CADEIAS.items()}

def ik2(R, T, l1, l2, dica):
    v = T - R; d = min(max(v.length, abs(l1 - l2) + 1e-4), (l1 + l2) * 0.9999); u = v.normalized()
    a_ = (l1 * l1 - l2 * l2 + d * d) / (2 * d); h = math.sqrt(max(0.0, l1 * l1 - a_ * a_))
    w = (dica - R) - u * u.dot(dica - R)
    w = w.normalized() if w.length > 1e-6 else u.orthogonal().normalized()
    E = R + u * a_ + w * h
    return E, R + u * d
def apontar(q, rest_m, dirdes):   # gira q o mínimo para o eixo Y do osso apontar para dirdes
    atual = (q @ rot3(rest_m)).col[1]
    return atual.rotation_difference(dirdes).to_matrix() @ q

guard = {}
for f in range(ini, fim + 1):
    M = {}; qn = {}; pend = {}
    for b in ordem:
        n = b.name; pb = arm.pose.bones[n]; pb.rotation_mode = "QUATERNION"
        Pm = (M[b.parent.name] @ (rest1[b.parent.name].inverted() @ rest1[n])) if b.parent else rest1[n].copy()
        loc = orig[f][n][1] if n in orig[f] and n not in DIR else Vector()
        esc = orig[f][n][2] if n in orig[f] else Vector((1, 1, 1))
        cabeca = (Pm @ Matrix.Translation(loc)).translation
        if n in orig[f] and n not in DIR: q = Q(f, n)
        else: q = qn[b.parent.name] if b.parent else Matrix.Identity(3)
        if n in CADEIAS:
            baixo, alvo, dica = CADEIAS[n]
            E, T = ik2(cabeca, alvo(f), L1[n], L1[baixo], dica(f))
            q = apontar(q, rest1[n], (E - cabeca).normalized()); pend[baixo] = T
        elif n in BAIXO:
            q = apontar(q, rest1[n], (pend[n] - cabeca).normalized())
        desejada = q @ rot3(rest1[n])
        rb = rot3(Pm).transposed() @ desejada
        pb.location, pb.rotation_quaternion, pb.scale = loc, rb.to_quaternion(), esc
        M[n] = Pm @ Matrix.Translation(loc) @ rb.to_4x4() @ Matrix.Diagonal((*esc, 1))
        qn[n] = rot3(M[n]) @ rot3(rest1[n]).transposed()
        if n not in DIR:
            for c in ("location", "rotation_quaternion", "scale"): pb.keyframe_insert(c, frame=f)
    guard[f] = qn
# pata direita da frente: esquerda convertida espelhada, relativa ao pai, DEFAS quadros depois
for f in range(ini, fim + 1):
    fo = volta(f + DEFAS); qd = {}
    for k, n in enumerate(DIR):
        pai_e = "body_top1" if k == 0 else ESQ[k - 1]
        rel = guard[fo][pai_e].transposed() @ guard[fo][ESQ[k]]
        pai_q = guard[f]["body_top1"] if k == 0 else qd[DIR[k - 1]]
        qd[n] = pai_q @ (Sx @ rel @ Sx)
        pai = arm.data.bones[n].parent.name
        q_pai = qd[pai] if pai in qd else guard[f][pai]
        rb = (q_pai @ rot3(rest1[n])).transposed() @ (qd[n] @ rot3(rest1[n]))
        pb = arm.pose.bones[n]; pb.rotation_mode = "QUATERNION"
        pb.location, pb.rotation_quaternion, pb.scale = Vector(), rb.to_quaternion(), Vector((1, 1, 1))
        for c in ("location", "rotation_quaternion", "scale"): pb.keyframe_insert(c, frame=f)
bpy.ops.export_scene.gltf(filepath=SAI, export_format="GLB", export_animations=True, export_animation_mode="ACTIVE_ACTIONS")
print("exportado", SAI, "defasagem", DEFAS, "quadros", ini, fim)
