# MONTAGEM do neto v5 por peças (17/10, aprovado pelo Joabe): busto, tronco, braço e perna gerados à parte no Meshy
# (cada um com mais detalhe que um corpo inteiro), montados no esqueleto do v4 (pose T, Mixamo). Braço e perna são
# gerados uma vez e espelhados. Toda emenda fica sob a roupa (gola, ombro, cintura, coxa). Pesos copiados do corpo v4.
# Uso: Blender -b neto-v4-rig.blend --python blender/montar_v5.py -- BUSTO.glb TRONCO.glb BRACO.glb PERNA.glb CABECA_AJUSTADA.blend SAIDA
#   V5_FACES_BUSTO (60000) V5_FACES_TRONCO (25000) V5_FACES_BRACO (25000) V5_FACES_PERNA (20000)  BUSTO_ABAIXO (0.05 m sob a gola)
import bpy, sys, os, bmesh, math
import numpy as np
from mathutils import Vector, Matrix
from mathutils.kdtree import KDTree
from mathutils.bvhtree import BVHTree

a = sys.argv[sys.argv.index("--") + 1:]
G_BUSTO, G_TRONCO, G_BRACO, G_PERNA, AJUSTADA, SAIDA = a[:6]
LUM = np.array([0.2126, 0.7152, 0.0722])
cena = bpy.context.scene
rig = next(o for o in cena.objects if o.type == "ARMATURE")
v4 = next(o for o in cena.objects if o.type == "MESH" and o.parent == rig)
def osso(n, ponta=False):
    b = rig.data.bones["mixamorig:" + n]; return np.array(rig.matrix_world @ (b.tail_local if ponta else b.head_local))
def pts(o):
    co = np.empty(len(o.data.vertices) * 3); o.data.vertices.foreach_get("co", co)
    return (np.array(o.matrix_world) @ np.c_[co.reshape(-1, 3), np.ones(len(o.data.vertices))].T).T[:, :3]
def por(o, P):
    """grava posições de mundo P na malha (objeto com matriz identidade)"""
    o.data.vertices.foreach_set("co", np.asarray(P, float).ravel()); o.data.update()
def importar(glb, faces=None):
    antes = set(cena.objects); bpy.ops.import_scene.gltf(filepath=glb)
    ob = next(o for o in cena.objects if o not in antes and o.type == "MESH")
    for o in list(cena.objects):
        if o not in antes and o != ob: bpy.data.objects.remove(o, do_unlink=True)
    for o in cena.objects: o.select_set(o == ob)
    bpy.context.view_layer.objects.active = ob; ob.parent = None
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT"); bpy.ops.mesh.remove_doubles(threshold=1e-5)
    bpy.ops.object.mode_set(mode="OBJECT")
    n0 = len(ob.data.polygons)
    if faces and n0 > faces:
        m = ob.modifiers.new("reduz", "DECIMATE"); m.ratio = faces / n0; bpy.ops.object.modifier_apply(modifier=m.name)
    print(f"PEÇA {os.path.basename(os.path.dirname(glb))}: {n0} -> {len(ob.data.polygons)} faces")
    return ob
def rot(eixo, graus):
    return np.array(Matrix.Rotation(math.radians(graus), 3, eixo))
def espelhar(ob, x0):
    """cópia espelhada em x = x0 (faces invertidas para a normal continuar para fora)"""
    e = ob.copy(); e.data = ob.data.copy(); cena.collection.objects.link(e)
    P = pts(e); P[:, 0] = 2 * x0 - P[:, 0]; por(e, P)
    bm = bmesh.new(); bm.from_mesh(e.data); bmesh.ops.reverse_faces(bm, faces=bm.faces[:]); bm.to_mesh(e.data); bm.free(); e.data.update()
    return e
def largura_xy(P, z, faixa):
    m = np.abs(P[:, 2] - z) < faixa
    return (np.ptp(P[m, 0]) + np.ptp(P[m, 1])) / 2 if m.sum() > 8 else np.inf

# ---- corpo v4 como guia: cópia para pesos e para medir regiões (osso dominante de cada vértice) ----
ref = v4.copy(); ref.data = v4.data.copy(); cena.collection.objects.link(ref)
Pref = pts(ref); nomes = {g.index: g.name.replace("mixamorig:", "") for g in ref.vertex_groups}
dom = np.array([nomes[max(v.groups, key=lambda g: g.weight).group] if len(v.groups) else "" for v in ref.data.vertices])
def regiao(f): return np.array([f(n) for n in dom])
x0 = float(osso("Hips")[0])

# ---- BUSTO: alinhado pela cabeça à cabeça que o Joabe ajustou (mesmo método do busto_encaixar.py) ----
bus = importar(G_BUSTO, int(os.environ.get("V5_FACES_BUSTO", "60000")))
with bpy.data.libraries.load(AJUSTADA, link=False) as (src, dst): dst.objects = ["neto"]
aj = dst.objects[0]
mi = np.empty(len(aj.data.polygons), dtype=np.int64); aj.data.polygons.foreach_get("material_index", mi)
vs = np.unique(np.concatenate([np.array(p.vertices) for p, k in zip(aj.data.polygons, mi) if k == 1]))
Haj = pts(aj)[vs]; bpy.data.objects.remove(aj, do_unlink=True)
zh = osso("Head")[2]; Haj = Haj[Haj[:, 2] > zh - 0.02]
def icp_escala(P, alvo, sel, T, it=40):
    kd = KDTree(len(alvo))
    for i, p in enumerate(alvo): kd.insert(p, i)
    kd.balance(); rng = np.random.default_rng(0)
    for _ in range(it):
        Q = (T @ np.c_[P, np.ones(len(P))].T).T[:, :3]; q = sel(Q)
        am = q[rng.choice(len(q), min(8000, len(q)), replace=False)]
        pr = np.array([kd.find(x)[0][:] for x in am]); d = np.linalg.norm(pr - am, axis=1); ok = d < np.percentile(d, 70)
        A_, B_ = am[ok], pr[ok]; ca, cb = A_.mean(0), B_.mean(0)
        s = np.sum((A_ - ca) * (B_ - cb)) / ((A_ - ca) ** 2).sum(); t = cb - s * ca
        M = np.eye(4); M[:3, :3] *= s; M[:3, 3] = t; T = M @ T
    return T, float(np.median(d[ok]))
Pb = pts(bus)
zs = np.linspace(Pb[:, 2].min(), Pb[:, 2].max(), 80); lz = [largura_xy(Pb, z, zs[1] - zs[0]) for z in zs]
z_pesc = zs[10:50][int(np.argmin(lz[10:50]))]
cab_b = lambda P: P[P[:, 2] > z_pesc + 0.25 * (P[:, 2].max() - z_pesc)]
s0 = np.ptp(Haj[:, 2]) / np.ptp(cab_b(Pb)[:, 2]); T = np.eye(4); T[:3, :3] *= s0
q = cab_b((T @ np.c_[Pb, np.ones(len(Pb))].T).T[:, :3])
T[:3, 3] = [Haj[:, 0].mean() - q[:, 0].mean(), Haj[:, 1].mean() - q[:, 1].mean(), Haj[:, 2].max() - q[:, 2].max()]
T, err = icp_escala(Pb, Haj, cab_b, T)
por(bus, (T @ np.c_[Pb, np.ones(len(Pb))].T).T[:, :3])
print(f"BUSTO alinhado: escala {np.cbrt(np.linalg.det(T[:3, :3])):.4f}, erro {err * 1000:.1f} mm")

# ---- TRONCO: escala + posição pelo tronco do v4 (região dos ossos do quadril e da coluna, acima do meio da coxa) ----
tro = importar(G_TRONCO, int(os.environ.get("V5_FACES_TRONCO", "25000")))
alvo_t = Pref[regiao(lambda n: n in ("Hips", "Spine", "Spine1", "Spine2", "LeftShoulder", "RightShoulder", "LeftUpLeg", "RightUpLeg"))]
alvo_t = alvo_t[(alvo_t[:, 2] > osso("LeftUpLeg")[2] - 0.12) & (alvo_t[:, 2] < osso("Neck")[2] + 0.01)]
Pt = pts(tro); s0 = np.ptp(alvo_t[:, 2]) / np.ptp(Pt[:, 2]); T = np.eye(4); T[:3, :3] *= s0
q = (T @ np.c_[Pt, np.ones(len(Pt))].T).T[:, :3]; T[:3, 3] = alvo_t.mean(0) - q.mean(0)
T, err = icp_escala(Pt, alvo_t, lambda Q: Q, T)
Pt = (T @ np.c_[Pt, np.ones(len(Pt))].T).T[:, :3]
Pt[:, 0] += x0 - (np.percentile(Pt[:, 0], 2) + np.percentile(Pt[:, 0], 98)) / 2   # 17/10: centrado no quadril (o ICP puxava 2 cm para um lado)
por(tro, Pt)
print(f"TRONCO alinhado: escala {np.cbrt(np.linalg.det(T[:3, :3])):.4f}, erro {err * 1000:.1f} mm")

# ---- BRAÇO: o Meshy entregou um braço DIREITO girado 180° (costas da mão para -Y, polegar para +X), pendurado.
# 1) gira 180° em z: braço direito em posição anatômica (palma para frente); 2) torce só o antebraço 90° (palma
# vira para dentro: na pose T fica para baixo) do cotovelo ao pulso; 3) deita na horizontal (-X) e encaixa ombro e
# pulso nos ossos RightArm e RightHand ----
bra = importar(G_BRACO, int(os.environ.get("V5_FACES_BRACO", "25000")))
P = pts(bra) @ rot("Z", 180).T
ztop, zbot = P[:, 2].max(), P[:, 2].min(); L = ztop - zbot
zz = np.linspace(zbot + 0.30 * L, zbot + 0.45 * L, 40); z_pulso = zz[int(np.argmin([largura_xy(P, z, L / 120) for z in zz]))]
topo = P[P[:, 2] > ztop - 0.12 * L]; cap = (np.ptp(topo[:, 0]) + np.ptp(topo[:, 1])) / 4
S_p = np.r_[topo[:, :2].mean(0), ztop - cap]
f_cot = np.linalg.norm(osso("RightForeArm") - osso("RightArm")) / np.linalg.norm(osso("RightHand") - osso("RightArm"))
z_cot = S_p[2] - f_cot * (S_p[2] - z_pulso)
W_p = np.r_[P[np.abs(P[:, 2] - z_pulso) < L / 100][:, :2].mean(0), z_pulso]
# torção: ângulo 0 no cotovelo, 90° no pulso e na mão, em volta do eixo do antebraço
eixo_xy = lambda z: P[np.abs(P[:, 2] - z) < L / 60][:, :2].mean(0)
c_cot, c_pul = eixo_xy(z_cot), W_p[:2]
u = np.clip((z_cot - P[:, 2]) / (z_cot - z_pulso), 0, 1); u = u * u * (3 - 2 * u)
ang = np.radians(float(os.environ.get("V5_TORCE", "90"))) * u
cxy = c_cot[None] + (c_pul - c_cot)[None] * np.clip((z_cot - P[:, 2]) / (z_cot - z_pulso), 0, 1)[:, None]
d = P[:, :2] - cxy; P[:, 0] = cxy[:, 0] + d[:, 0] * np.cos(ang) - d[:, 1] * np.sin(ang); P[:, 1] = cxy[:, 1] + d[:, 0] * np.sin(ang) + d[:, 1] * np.cos(ang)
# deita: de -Z para a direção ombro -> pulso do esqueleto, escala pelo comprimento e põe o ombro no osso
S_t, W_t = osso("RightArm"), osso("RightHand")
dir_p = (W_p - S_p) / np.linalg.norm(W_p - S_p); dir_t = (W_t - S_t) / np.linalg.norm(W_t - S_t)
R = np.array(Vector(dir_p).rotation_difference(Vector(dir_t)).to_matrix())
s = np.linalg.norm(W_t - S_t) / np.linalg.norm(W_p - S_p)
P = (P - S_p) @ R.T * s + S_t
# 17/10 "braços muito grandes pro resto": a grossura do braço (em volta do eixo, sem mudar o comprimento) e a mão
# (a partir do pulso) se ajustam à parte. V5_BRACO_GROSSURA (0.8) V5_MAO (0.88)
GR, MAO = float(os.environ.get("V5_BRACO_GROSSURA", "0.8")), float(os.environ.get("V5_MAO", "0.88"))
t_ = (P - S_t) @ dir_t; L_ = np.linalg.norm(W_t - S_t)
base = S_t[None] + np.clip(t_, 0, L_)[:, None] * dir_t[None]
radial = (P - S_t) - t_[:, None] * dir_t[None]
P = np.where((t_ <= L_)[:, None], S_t[None] + t_[:, None] * dir_t[None] + radial * GR, P)
mao = t_ > L_
# mão: comprimento x MAO a partir do pulso; a largura sai da grossura do antebraço no pulso e chega a MAO em 3 cm
k_ = np.clip((t_[mao] - L_) / 0.03, 0, 1); k_ = k_ * k_ * (3 - 2 * k_); esc_r = GR + (MAO - GR) * k_
P[mao] = W_t[None] + ((t_[mao] - L_) * MAO)[:, None] * dir_t[None] + radial[mao] * esc_r[:, None]
por(bra, P); print(f"BRAÇO direito: escala {s:.4f}, pulso a {(z_pulso - zbot) / L:.2f} do comprimento, cotovelo a {f_cot:.2f}")
bra_e = espelhar(bra, x0)

# ---- PERNA: o pé do Meshy aponta para -X; gira 90° em z (pé para frente), encaixa tornozelo e joelho nos ossos;
# lado decidido pelo dedão (o dedo mais à frente fica do lado de dentro) ----
per = importar(G_PERNA, int(os.environ.get("V5_FACES_PERNA", "20000")))
P = pts(per) @ rot("Z", 90).T
zbot, ztop = P[:, 2].min(), P[:, 2].max(); L = ztop - zbot
zz = np.linspace(zbot + 0.07 * L, zbot + 0.25 * L, 40); z_tor = zz[int(np.argmin([largura_xy(P, z, L / 120) for z in zz]))]
canela = P[(P[:, 2] > z_tor) & (P[:, 2] < z_tor + 0.2 * L)]; eixo = canela[:, :2].mean(0)
pe = P[P[:, 2] < z_tor]; ponta = pe[np.argmin(pe[:, 1])]
lado = "Left" if ponta[0] < eixo[0] else "Right"     # dedão para -x = lado de dentro de uma perna esquerda (que fica em +x)
# joelho: a patela é o ponto mais à frente (-y) entre 45% e 70% da altura
mz = (P[:, 2] > zbot + 0.45 * L) & (P[:, 2] < zbot + 0.70 * L); z_joe = P[mz][np.argmin(P[mz][:, 1]), 2]
A_p = np.r_[eixo, z_tor]; K_p = np.r_[P[np.abs(P[:, 2] - z_joe) < L / 60][:, :2].mean(0), z_joe]
A_t, K_t = osso(lado + "Foot"), osso(lado + "Leg")
s = np.linalg.norm(K_t - A_t) / np.linalg.norm(K_p - A_p)
dir_p = (K_p - A_p) / np.linalg.norm(K_p - A_p); dir_t = (K_t - A_t) / np.linalg.norm(K_t - A_t)
R = np.array(Vector(dir_p).rotation_difference(Vector(dir_t)).to_matrix())
P = (P - A_p) @ R.T * s + A_t
# pé na direção do pé do esqueleto (ligeiramente para fora)
pd = osso(lado + "Toe_End") - osso(lado + "Foot"); a_alvo = math.atan2(pd[0], -pd[1])
pe_m = P[:, 2] < A_t[2]; ponta = P[pe_m][np.argmin(P[pe_m][:, 1])]; a_agora = math.atan2(ponta[0] - A_t[0], -(ponta[1] - A_t[1]))
Rz = rot("Z", math.degrees(a_alvo - a_agora)); P = (P - A_t) @ Rz.T + A_t   # 18/10: o sinal estava trocado (pé girava para dentro e os dedões se tocavam)
# 17/10 "pernas grossas demais": afina a perna em volta do eixo (quadril -> tornozelo), sem mudar o comprimento;
# o pé fica como está, com transição de 4 cm acima do tornozelo. V5_PERNA_GROSSURA (0.85)
GP_ = float(os.environ.get("V5_PERNA_GROSSURA", "0.85"))
H_t = osso(lado + "UpLeg"); eixo_d = (A_t - H_t) / np.linalg.norm(A_t - H_t)
t_ = (P - H_t) @ eixo_d; L_ = np.linalg.norm(A_t - H_t)
perp_ = (P - H_t) - t_[:, None] * eixo_d[None]
k_ = np.clip((L_ - t_) / 0.04, 0, 1); k_ = k_ * k_ * (3 - 2 * k_); esc_ = 1 + (GP_ - 1) * k_
P = H_t[None] + t_[:, None] * eixo_d[None] + perp_ * esc_[:, None]
# o pé encosta no chão do v4
P[:, 2] += Pref[:, 2].min() - P[:, 2].min()
por(per, P); print(f"PERNA {lado}: escala {s:.4f}, tornozelo a {(z_tor - zbot) / L:.2f}, joelho a {(z_joe - zbot) / L:.2f}, pé girado {math.degrees(a_alvo - a_agora):.1f}°")
per_o = espelhar(per, x0); oposto = "Right" if lado == "Left" else "Left"

# ---- junções (todas sob a roupa): cor de cada vértice lida na textura em resolução cheia ----
def cor_cheia(ob):
    nt = ob.active_material.node_tree
    img = next(n for n in nt.nodes if n.type == "TEX_IMAGE" and n.image and any(l.to_node.type == "BSDF_PRINCIPLED" and l.to_socket.name == "Base Color" for l in n.outputs[0].links)).image
    W, H = img.size; px = np.array(img.pixels[:]).reshape(H, W, 4)[:, :, :3]
    lv = np.empty(len(ob.data.loops), dtype=np.int64); ob.data.loops.foreach_get("vertex_index", lv)
    uv = np.empty(len(ob.data.loops) * 2); ob.data.uv_layers[0].data.foreach_get("uv", uv); uv = uv.reshape(-1, 2)
    cl = px[np.clip((uv[:, 1] * (H - 1)).astype(int), 0, H - 1), np.clip((uv[:, 0] * (W - 1)).astype(int), 0, W - 1)]
    C = np.zeros((len(ob.data.vertices), 3)); n = np.zeros(len(ob.data.vertices)); np.add.at(C, lv, cl); np.add.at(n, lv, 1)
    return C / np.maximum(n, 1)[:, None]
def tecido(C): sat = (C.max(1) - C.min(1)) / np.maximum(C.max(1), 1e-3); return (C @ LUM > 0.4) & (sat < 0.25)
def inundar(ob, semente, pode):
    e_ = np.empty(len(ob.data.edges) * 2, dtype=np.int64); ob.data.edges.foreach_get("vertices", e_); e_ = e_.reshape(-1, 2)
    viz = [[] for _ in range(len(ob.data.vertices))]
    for x, y in e_: viz[x].append(y); viz[y].append(x)
    sel = np.zeros(len(viz), bool); sel[semente] = True; fila = list(np.nonzero(sel)[0])
    while fila:
        i = fila.pop()
        for j in viz[i]:
            if not sel[j] and pode[j]: sel[j] = True; fila.append(j)
    return sel
def apagar(ob, mask):
    bm = bmesh.new(); bm.from_mesh(ob.data); bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.verts[i] for i in np.nonzero(mask)[0]], context="VERTS"); bm.to_mesh(ob.data); bm.free(); ob.data.update()
def para_dentro(ob, alvo, mask, folga=0.003, centro=None):
    """empurra os vértices de mask para dentro da superfície de alvo (raio horizontal a partir do eixo do corpo)"""
    bvh = BVHTree.FromObject(alvo, bpy.context.evaluated_depsgraph_get()); P = pts(ob); n = 0
    cxy = np.array(centro) if centro is not None else np.array([x0, osso("Spine2")[1]])
    for i in np.nonzero(mask)[0]:
        dv = Vector((P[i, 0] - cxy[0], P[i, 1] - cxy[1], 0));
        if dv.length < 1e-6: continue
        dv.normalize(); org = Vector((cxy[0], cxy[1], P[i, 2])) + dv * 0.4
        loc, _, _, d = bvh.ray_cast(org, -dv, 0.4)
        if loc is None: continue
        r_sup = 0.4 - d; r = math.hypot(P[i, 0] - cxy[0], P[i, 1] - cxy[1])
        if r > r_sup - folga: k = (r_sup - folga) / r; P[i, 0] = cxy[0] + (P[i, 0] - cxy[0]) * k; P[i, 1] = cxy[1] + (P[i, 1] - cxy[1]) * k; n += 1
    por(ob, P); return n
zn = osso("Neck")[2]
# 1) tronco: a pele acima da regata (pescoço e colo) sai; quem mostra pele ali é o busto
Ct = cor_cheia(tro); Pt = pts(tro); tec_t = tecido(Ct)
sem = (Pt[:, 2] > Pt[:, 2].max() - 0.01) & ~tec_t
pesc_t = inundar(tro, sem, ~tec_t & (Pt[:, 2] > osso("Spine2")[2]))
# 2) tronco: a pele abaixo do short (tocos de coxa) sai; quem mostra pele ali é a perna
sem = (Pt[:, 2] < Pt[:, 2].min() + 0.01) & ~tec_t
coxa_t = inundar(tro, sem, ~tec_t & (Pt[:, 2] < osso("Hips")[2]))
z_barra = float(Pt[tec_t & (Pt[:, 2] < osso("Hips")[2])][:, 2].min())   # barra do short
# 2b) tronco: os tocos de ombro (pele e a tampa do corte) saem; quem fica ali é o ombro do braço
ombro_t = np.zeros(len(Pt), bool)
for sx in (-1, 1):
    ext = sx * (Pt[:, 0] - x0); sem = (ext > ext.max() - 0.01) & ~tec_t
    ombro_t |= inundar(tro, sem, ~tec_t & (ext > 0.06))
apagar(tro, pesc_t | coxa_t | ombro_t); print(f"TRONCO: {int(pesc_t.sum())} vértices de pescoço, {int(ombro_t.sum())} de ombro e {int(coxa_t.sum())} de coxa apagados; barra do short z {z_barra:.3f}")
# 3) busto: só pele e um pouco abaixo da borda da regata do tronco, por dentro do tronco
Pt = pts(tro); Ct = cor_cheia(tro); tec_t = tecido(Ct)
z_gola = float(np.percentile(Pt[tec_t & (Pt[:, 2] > osso("Spine2")[2])][:, 2], 99))
Pb = pts(bus); Cb = cor_cheia(bus)
fora = Pb[:, 2] < z_gola - float(os.environ.get("BUSTO_ABAIXO", "0.06"))
tec_b = tecido(Cb)   # a regata do busto fica, mas toda por dentro da do tronco (apagar abria fresta em volta do pescoço)
apagar(bus, fora); Pb = pts(bus)
tec_b = tecido(cor_cheia(bus)); n_b = para_dentro(bus, tro, (Pb[:, 2] < z_gola + 0.005) | (tec_b & (Pb[:, 2] < osso("Neck")[2])))
print(f"BUSTO: {int(fora.sum())} vértices abaixo da regata apagados, {n_b} empurrados para dentro do tronco (topo da regata z {z_gola:.3f})")
# 4) pernas: o topo entra por dentro do short (até 6 cm acima da barra) e o resto acima sai
# 18/10 "pernas um pouco mais pra frente pra igualar com o tronco": cada perna inclina a partir do tornozelo (o pé
# fica no osso) até o centro da coxa na barra do short ficar no centro da boca do short (medido em y)
Pt_ = pts(tro); tec_ = tecido(cor_cheia(tro))
for p_, l_ in ((per, lado), (per_o, oposto)):
    sx_ = 1 if l_ == "Left" else -1
    boca = Pt_[tec_ & (np.abs(Pt_[:, 2] - z_barra) < 0.015) & ((Pt_[:, 0] - x0) * sx_ > 0.02)]
    P = pts(p_); coxa = P[(np.abs(P[:, 2] - z_barra) < 0.015)]
    if len(boca) > 10 and len(coxa) > 10:
        dy = (np.percentile(boca[:, 1], 5) + np.percentile(boca[:, 1], 95)) / 2 - (np.percentile(coxa[:, 1], 5) + np.percentile(coxa[:, 1], 95)) / 2
        A_ = osso(l_ + "Foot"); ang = math.atan2(dy, z_barra - A_[2])
        R_ = rot("X", -math.degrees(ang))   # gira em x: o alto vai para y + dy
        P = (P - A_) @ R_.T + A_; por(p_, P)
        print(f"PERNA {l_}: inclinada {math.degrees(ang):+.1f}° (coxa {dy * 100:+.1f} cm em y para o centro do short)")
for p_, l_ in ((per, lado), (per_o, oposto)):
    P = pts(p_); apagar(p_, P[:, 2] > z_barra + 0.06); P = pts(p_)
    n_p = para_dentro(p_, tro, P[:, 2] > z_barra - 0.005, folga=0.004, centro=osso(l_ + "UpLeg")[:2])
    print(f"PERNA {p_.name}: topo cortado a 6 cm acima da barra, {n_p} vértices para dentro do short")

# 5) braços: o alto do ombro do braço que passa para dentro do tronco (atrás da junta do ombro) sai, e o que sobra
# perto do ombro fica por dentro do tronco
for b_, l_ in ((bra, "Right"), (bra_e, "Left")):
    S_ = osso(l_ + "Arm"); d_ = osso(l_ + "Hand") - S_; d_ /= np.linalg.norm(d_)
    P = pts(b_); t_ = (P - S_) @ d_
    apagar(b_, t_ < -0.035); P = pts(b_); t_ = (P - S_) @ d_
    n_o = para_dentro(b_, tro, (t_ < 0.02) & (P[:, 2] > S_[2]), folga=0.002)
    print(f"BRAÇO {l_}: ombro aparado, {n_o} vértices para dentro do tronco")
# 6) tom: braços, pernas e tronco vão à cor da pele do pescoço do busto (multiplica a textura pelo atributo "tom")
def pele_mediana(ob, mask=None):
    C = cor_cheia(ob); sat = (C.max(1) - C.min(1)) / np.maximum(C.max(1), 1e-3); m = (sat > 0.35) & (C @ LUM > 0.08)
    if mask is not None: m &= mask
    return np.median(C[m], 0)
Pb = pts(bus); ref_cor = pele_mediana(bus, (Pb[:, 2] < osso("Head")[2] - 0.02) & (Pb[:, 2] > z_gola))
def tingir(ob, fator):
    at = ob.data.color_attributes.new("tom", "FLOAT_COLOR", "POINT"); at.data.foreach_set("color", np.tile(np.r_[fator, 1.0], len(ob.data.vertices)))
    for mat in ob.data.materials:
        nt = mat.node_tree; bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"); fonte = bsdf.inputs["Base Color"].links[0].from_socket
        vc = nt.nodes.new("ShaderNodeVertexColor"); vc.layer_name = "tom"
        mx = nt.nodes.new("ShaderNodeMix"); mx.data_type = "RGBA"; mx.blend_type = "MULTIPLY"; mx.inputs[0].default_value = 1
        nt.links.new(fonte, mx.inputs[6]); nt.links.new(vc.outputs["Color"], mx.inputs[7]); nt.links.new(mx.outputs[2], bsdf.inputs["Base Color"])
for ob in (bra, per):
    f_ = np.clip(ref_cor / np.maximum(pele_mediana(ob), 1e-3), 0.6, 1.4)
    tingir(ob, f_); print(f"TOM {ob.name}: x{np.round(f_, 3)}")
# 18/10: tronco e busto por vértice: a regata perto do pescoço vira cor de pele (aparecia branca acima da gola da
# camisa) e o short vira a cor da calça (aparecia branco pelos furos da calça); o resto fica como está
def tingir_por_vertice(ob, F):
    tingir(ob, np.ones(3)); ob.data.color_attributes["tom"].data.foreach_set("color", np.c_[F, np.ones(len(F))].ravel())
COR_CALCA = np.array([float(x) for x in os.environ.get("V5_COR_CALCA", "0.55,0.46,0.34").split(",")])
for ob in (tro, bus):
    C = cor_cheia(ob); P = pts(ob); tec = tecido(C); F = np.ones((len(P), 3))
    gola = tec & (P[:, 2] > osso("Spine2")[2] + 0.04)
    F[gola] = np.clip(ref_cor / np.maximum(C[gola], 1e-3), 0.05, 1.5)
    short = tec & (P[:, 2] < osso("Hips")[2] + 0.06)
    F[short] = np.clip(COR_CALCA / np.maximum(C[short], 1e-3), 0.05, 1.5)
    tingir_por_vertice(ob, F); print(f"TOM {ob.name}: regata da gola {int(gola.sum())} e short {int(short.sum())} vértices recoloridos")
for ob, orig in ((bra_e, bra), (per_o, per)):
    ob.data.materials.clear()
    for m_ in orig.data.materials: ob.data.materials.append(m_)
    at = ob.data.color_attributes.new("tom", "FLOAT_COLOR", "POINT"); at.data.foreach_set("color", np.array(orig.data.color_attributes["tom"].data[0].color[:] * len(ob.data.vertices)))

# ---- pesos: de cada peça, só da região correspondente do v4 (6 vizinhos mais perto) ----
def membro(lado_, partes): return regiao(lambda n: n.startswith(lado_) and any(p in n for p in partes))
regs = {
    "busto": regiao(lambda n: n in ("Head", "Neck", "Spine2", "LeftShoulder", "RightShoulder") or n.startswith("HeadTop")),
    "tronco": regiao(lambda n: n in ("Hips", "Spine", "Spine1", "Spine2", "Neck", "LeftShoulder", "RightShoulder", "LeftUpLeg", "RightUpLeg", "LeftArm", "RightArm")),
}
def pesar(ob, mask, head_acima=None):
    idx = np.nonzero(mask)[0]; kd = KDTree(len(idx))
    for j, i in enumerate(idx): kd.insert(Pref[i], j)
    kd.balance(); ob.vertex_groups.clear(); gr = {}
    def g(n):
        if n not in gr: gr[n] = ob.vertex_groups.new(name=n)
        return gr[n]
    P = pts(ob); nomes_c = {x.index: x.name for x in ref.vertex_groups}
    for i in range(len(P)):
        t_ = 0.0
        if head_acima is not None: t_ = float(np.clip((P[i, 2] - head_acima) / 0.03, 0, 1)); t_ = t_ * t_ * (3 - 2 * t_)
        w = {}
        if t_ < 0.999:
            soma = {}
            for _, j, _ in kd.find_n(P[i], 6):
                for gg in ref.data.vertices[idx[j]].groups: soma[nomes_c[gg.group]] = soma.get(nomes_c[gg.group], 0) + gg.weight
            s_ = sum(soma.values()) or 1
            for n, x in soma.items(): w[n] = (1 - t_) * x / s_
        if t_ > 0: w["mixamorig:Head"] = w.get("mixamorig:Head", 0) + t_
        for n, x in w.items():
            if x > 0.005: g(n).add([i], x, "REPLACE")
    print(f"PESOS {ob.name}: {len(gr)} ossos")
pesar(bus, regs["busto"], zh - 0.01); pesar(tro, regs["tronco"])
pesar(bra, membro("Right", ("Arm", "Hand", "Shoulder"))); pesar(bra_e, membro("Left", ("Arm", "Hand", "Shoulder")))
pesar(per, membro(lado, ("UpLeg", "Leg", "Foot", "Toe"))); pesar(per_o, membro(oposto, ("UpLeg", "Leg", "Foot", "Toe")))

# ---- junta tudo no lugar do corpo v4 ----
mod = next(m for m in v4.modifiers if m.type == "ARMATURE")
nome = v4.name
pecas = [bus, tro, bra, bra_e, per, per_o]
for p_, n_ in zip(pecas, ("busto", "tronco", "braco-d", "braco-e", "perna-" + lado.lower(), "perna-" + oposto.lower())): p_.name = "v5-" + n_
bpy.data.objects.remove(ref, do_unlink=True); bpy.data.objects.remove(v4, do_unlink=True)
for x in cena.objects: x.select_set(x in pecas)
bpy.context.view_layer.objects.active = tro; bpy.ops.object.join()
corpo = tro; corpo.name = corpo.data.name = nome
corpo.data.polygons.foreach_set("use_smooth", np.ones(len(corpo.data.polygons), bool)); corpo.data.update()
corpo.parent = rig; corpo.matrix_parent_inverse = rig.matrix_world.inverted()
m = corpo.modifiers.new("Armature", "ARMATURE"); m.object = rig
bpy.ops.wm.save_as_mainfile(filepath=f"{SAIDA}.blend"); print("PRONTO v5", len(corpo.data.vertices), "vértices")
