# Cabeça detalhada SEM pescoço assentada no pescoço do corpo (recomendação do Joabe, 17/10): a cabeça é cortada por um
# corte em dois planos (queixo -> ângulo da mandíbula -> fim do cabelo na nuca): nuca e pescoço vêm do corpo, o corpo perde tudo acima do mesmo plano um pouco
# mais baixo, e a borda do pescoço do corpo encosta na borda da cabeça. Corte por plano (bisect), não por vértice:
# borda reta, sem zigue-zague. Tom da pele da cabeça levado ao do pescoço perto da borda (cor de vértice).
# Uso: Blender -b CORPO_RIG.blend --python blender/cabeca_assentar.py -- CABECA.blend SAIDA_PREFIXO
#   ASS_AJUSTE ("escala,z_dos_olhos,subida", medido contra a cabeça original)  ASS_QUEIXO (0.006 m abaixo do queixo)
#   ASS_ESPALHA (0.025 m)  ASS_MANDIBULA (0.01 m acima do osso Head)  ASS_NUCA (-0.01 m)  ASS_Y_MEIO  ASS_FOLGA (0.002 m)
import bpy, sys, os, bmesh
import numpy as np
from mathutils import Vector, Matrix
from mathutils.kdtree import KDTree

a = sys.argv[sys.argv.index("--") + 1:]
CAB, SAIDA = a[0], a[1]
QUEIXO = float(os.environ.get("ASS_QUEIXO", "0.006")); FOLGA = float(os.environ.get("ASS_FOLGA", "0.002"))
cena = bpy.context.scene
rig = next(o for o in cena.objects if o.type == "ARMATURE")
corpo = next(o for o in cena.objects if o.type == "MESH" and o.parent == rig)
def osso(n): return np.array(rig.matrix_world @ rig.data.bones["mixamorig:" + n].head_local)
def pts(o, co=None):
    if co is None: co = np.empty(len(o.data.vertices) * 3); o.data.vertices.foreach_get("co", co)
    return (np.array(o.matrix_world) @ np.c_[np.asarray(co).reshape(-1, 3), np.ones(len(o.data.vertices))].T).T[:, :3]
LUM = np.array([0.2126, 0.7152, 0.0722])
def cor_vertices(ob):
    nt = ob.active_material.node_tree
    tex = next(n for n in nt.nodes if n.type == "TEX_IMAGE" and n.image and any(l.to_node.type in ("MIX", "BSDF_PRINCIPLED") for l in n.outputs[0].links))
    img = tex.image; _ = img.pixels[0]
    im = img.copy(); im.scale(512, 512); px = np.array(im.pixels[:]).reshape(512, 512, 4); bpy.data.images.remove(im)
    uv = np.zeros((len(ob.data.vertices), 2)); cont = np.zeros(len(ob.data.vertices))
    lv = np.empty(len(ob.data.loops), dtype=np.int64); ob.data.loops.foreach_get("vertex_index", lv)
    luv = np.empty(len(ob.data.loops) * 2); ob.data.uv_layers[0].data.foreach_get("uv", luv); luv = luv.reshape(-1, 2)
    np.add.at(uv, lv, luv); np.add.at(cont, lv, 1); uv /= np.maximum(cont, 1)[:, None]
    return px[np.clip((uv[:, 1] * 511).astype(int), 0, 511), np.clip((uv[:, 0] * 511).astype(int), 0, 511), :3]
def pele_de(C): return (C @ LUM > 0.16) & (C[:, 0] - C[:, 2] > 0.06)

zn, zh, zt = osso("Neck")[2], osso("Head")[2], osso("HeadTop_End")[2]
Pc = pts(corpo); regiao = (Pc[:, 2] > zn - 0.02) & (np.abs(Pc[:, 0]) < 0.16)
# ---- cabeça detalhada: só escala e posição (faixa queixo-olhos) + ajuste medido ----
with bpy.data.libraries.load(CAB, link=False) as (src, dst): dst.objects = ["cabeca"]
cab = dst.objects[0]; cena.collection.objects.link(cab); cab.parent = None
kb = cab.data.shape_keys.key_blocks
for k in kb: k.value = 0
Q = pts(cab, np.array([v.co[:] for v in kb["Basis"].data]).ravel())
zalinha = zn + 0.55 * (zh - zn); zfaixa = zh + 0.5 * (zt - zh)
alvo = Pc[regiao & (Pc[:, 2] > zalinha) & (Pc[:, 2] < zfaixa)]
s0 = (zt - zalinha) / (Q[:, 2].max() - np.percentile(Q[:, 2], 25))
T = np.eye(4); T[:3, :3] *= s0; Q0 = Q * s0
T[:3, 3] = [alvo[:, 0].mean() - Q0[:, 0].mean(), alvo[:, 1].mean() - Q0[:, 1].mean(), zt - Q0[:, 2].max()]
Qa = (T @ np.c_[Q, np.ones(len(Q))].T).T[:, :3]
kd = KDTree(len(alvo))
for i, p in enumerate(alvo): kd.insert(p, i)
kd.balance(); rng = np.random.default_rng(0)
for _ in range(40):
    sel = Qa[(Qa[:, 2] > zalinha) & (Qa[:, 2] < zfaixa)]; am = sel[rng.choice(len(sel), min(8000, len(sel)), replace=False)]
    pr = np.array([kd.find(q)[0][:] for q in am]); d = np.linalg.norm(pr - am, axis=1); ok = d < np.percentile(d, 70)
    A_, B_ = am[ok], pr[ok]; ca, cb = A_.mean(0), B_.mean(0)
    s = np.sum((A_ - ca) * (B_ - cb)) / ((A_ - ca) ** 2).sum(); t = cb - s * ca
    M = np.eye(4); M[:3, :3] = s * np.eye(3); M[:3, 3] = t; T = M @ T; Qa = (T @ np.c_[Q, np.ones(len(Q))].T).T[:, :3]
if os.environ.get("ASS_AJUSTE"):
    ea, pz, dz = [float(x) for x in os.environ["ASS_AJUSTE"].split(",")]
    Adj = np.eye(4); Adj[:3, :3] *= ea; Adj[:3, 3] = np.array([Qa[:, 0].mean(), Qa[:, 1].mean(), pz]) * (1 - ea) + [0, 0, dz]; T = Adj @ T
Mfinal = T @ np.array(cab.matrix_world)
for k in kb:
    X = np.array([v.co[:] for v in k.data]); k.data.foreach_set("co", ((Mfinal @ np.c_[X, np.ones(len(X))].T).T[:, :3]).ravel())
cab.matrix_world = Matrix.Identity(4)
cab.data.vertices.foreach_set("co", np.array([v.co[:] for v in kb["Basis"].data]).ravel()); cab.data.update()
Pq = pts(cab)
print(f"ALINHADA escala {np.cbrt(abs(np.linalg.det(T[:3, :3]))):.4f}")

# ---- corte em dois planos que se encontram sob as orelhas: frente (queixo -> ângulo da mandíbula) e trás (ângulo
# da mandíbula -> fim do cabelo na nuca). Nuca e pescoço vêm do corpo; da cabeça só rosto, orelhas e cabelo. ----
anel = Pc[(np.abs(Pc[:, 2] - zn) < 0.01) & (np.abs(Pc[:, 0]) < 0.05)]
y_frente, y_tras = anel[:, 1].min(), anel[:, 1].max()
pele_q = pele_de(cor_vertices(cab)); cx = Pq[:, 0].mean()
meio = (np.abs(Pq[:, 0] - cx) < 0.03) & pele_q & (Pq[:, 1] < y_frente - 0.005) & (Pq[:, 2] < zh + 0.02)
z_queixo = float(Pq[meio, 2].min()) - QUEIXO
# alturas pelo esqueleto (detectar orelha e fim do cabelo pela cor falhava): ângulo da mandíbula um pouco acima do
# osso Head, fim do cabelo atrás um pouco abaixo dele
y_meio = float(os.environ.get("ASS_Y_MEIO", str((y_frente + y_tras) / 2)))
z_mand = zh + float(os.environ.get("ASS_MANDIBULA", "0.01"))
z_nuca = zh + float(os.environ.get("ASS_NUCA", "-0.01"))
A_ = np.array([0, y_frente - 0.03, z_queixo]); B_ = np.array([0, y_meio, z_mand]); C_ = np.array([0, y_tras + 0.03, z_nuca])
def normal_de(p1, p2):
    d_ = p2 - p1; n_ = np.array([0, -d_[2], d_[1]]); n_ /= np.linalg.norm(n_); return n_ if n_[2] > 0 else -n_
n1, n2 = normal_de(A_, B_), normal_de(B_, C_)
def dcorte(P):
    """distância com sinal ao corte (positivo = acima, lado da cabeça); frente usa o plano 1, trás o plano 2"""
    P = np.atleast_2d(P); return np.where(P[:, 1] < y_meio, (P - A_) @ n1, (P - B_) @ n2)
pf, normal, pt_ = A_, n1, C_   # compatibilidade com o resto
print(f"CORTE queixo z {z_queixo:.3f} -> mandíbula z {z_mand:.3f} (y {y_meio:.3f}) -> nuca z {z_nuca:.3f}")
def bisect2(ob, folga, so=None, manter_acima=True):
    bm = bmesh.new(); bm.from_mesh(ob.data); bm.verts.ensure_lookup_table(); Mw = ob.matrix_world
    for frente, pc, nn in ((True, A_, n1), (False, B_, n2)):
        vs = [v for v in bm.verts if ((Mw @ v.co).y < y_meio) == frente and (so is None or so(Mw @ v.co))]
        es = list({e for v in vs for e in v.link_edges}); fs = list({f for v in vs for f in v.link_faces})
        bmesh.ops.bisect_plane(bm, geom=vs + es + fs, plane_co=Vector(pc - nn * folga), plane_no=Vector(nn),
                               clear_inner=manter_acima, clear_outer=not manter_acima)
        bm.verts.ensure_lookup_table()
    bm.to_mesh(ob.data); bm.free(); ob.data.update()
# atrás, só a PELE abaixo do corte sai: o cabelo fica inteiro e cai por cima da nuca do corpo (cortar o cabelo pelo
# plano deixava as pontas retas e lascas soltas); a borda da pele ali fica escondida sob o cabelo
dqt = dcorte(Pq)
sai = (Pq[:, 1] >= y_meio) & (dqt < 0) & (pele_q | (dqt < -float(os.environ.get("ASS_PONTAS", "0.012"))))   # pontas até 1,2 cm abaixo ficam
bm_ = bmesh.new(); bm_.from_mesh(cab.data); bm_.verts.ensure_lookup_table()
bmesh.ops.delete(bm_, geom=[bm_.verts[i] for i in np.nonzero(sai)[0]], context="VERTS"); bm_.to_mesh(cab.data); bm_.free(); cab.data.update()
# pedaços soltos (cabelo que ficou ilhado embaixo) saem
bm_ = bmesh.new(); bm_.from_mesh(cab.data); bm_.verts.ensure_lookup_table()
vistos = set(); ilhas = []
for v0 in bm_.verts:
    if v0.index in vistos: continue
    pilha = [v0]; ilha = []; vistos.add(v0.index)
    while pilha:
        v = pilha.pop(); ilha.append(v)
        for e in v.link_edges:
            o = e.other_vert(v)
            if o.index not in vistos: vistos.add(o.index); pilha.append(o)
    ilhas.append(ilha)
maior = max(len(i) for i in ilhas); soltos = [v for i in ilhas if len(i) < 0.01 * maior for v in i]
bmesh.ops.delete(bm_, geom=soltos, context="VERTS"); bm_.to_mesh(cab.data); bm_.free(); cab.data.update()
print(f"SOLTOS apagados: {len(soltos)} vértices")
bm_ = bmesh.new(); bm_.from_mesh(cab.data); bm_.verts.ensure_lookup_table(); Mw_ = cab.matrix_world
vs = [v for v in bm_.verts if (Mw_ @ v.co).y < y_meio]
es = list({e for v in vs for e in v.link_edges}); fs = list({f for v in vs for f in v.link_faces})
bmesh.ops.bisect_plane(bm_, geom=vs + es + fs, plane_co=Vector(A_), plane_no=Vector(n1), clear_inner=True)
bm_.to_mesh(cab.data); bm_.free(); cab.data.update()
print(f"CABECA sem pescoço nem nuca: {len(cab.data.vertices)} vértices ({int(sai.sum())} de pele da nuca apagados)")
# a faixa de pescoço que sobra na cabeça (entre a mandíbula e o plano, sobretudo nas laterais) é mais larga que o
# pescoço do corpo e fazia degrau, como um colarinho: ela assume a forma do pescoço ORIGINAL do corpo, sumindo para
# cima; o queixo (normal para baixo) fica de fora. Mesma deformação em todas as shape keys.
from mathutils.bvhtree import BVHTree
ref = corpo.copy(); ref.data = corpo.data.copy(); cena.collection.objects.link(ref)
bvh_ref = BVHTree.FromObject(ref, bpy.context.evaluated_depsgraph_get())
Pq = pts(cab); nq = np.empty(len(cab.data.vertices) * 3); cab.data.vertices.foreach_get("normal", nq); nq = nq.reshape(-1, 3)
dq0 = dcorte(Pq); BANDA = float(os.environ.get("ASS_BANDA", "0.035"))
wb = np.clip(1 - dq0 / BANDA, 0, 1); wb = wb * wb * (3 - 2 * wb) * np.clip((nq[:, 2] + 0.45) / 0.25, 0, 1)
desl_b = np.zeros_like(Pq); nb = 0
for i in np.nonzero(wb > 0.01)[0]:
    loc, _, _, dist = bvh_ref.find_nearest(Vector(Pq[i]))
    if loc is not None and dist < 0.03: desl_b[i] = (np.array(loc) - Pq[i]) * wb[i]; nb += 1
for k in cab.data.shape_keys.key_blocks:
    X = np.array([v.co[:] for v in k.data]) + desl_b; k.data.foreach_set("co", X.ravel())
cab.data.vertices.foreach_set("co", np.array([v.co[:] for v in cab.data.shape_keys.key_blocks["Basis"].data]).ravel()); cab.data.update()
bpy.data.objects.remove(ref, do_unlink=True)
print(f"BANDA do pescoço da cabeça: {nb} vértices levados à forma do pescoço do corpo")
# corpo: só a cabeça/pescoço alto (os planos são infinitos: não cortar braço nem ombro)
bisect2(corpo, FOLGA, so=lambda p: abs(p.x) < 0.16 and p.z > zn - 0.03, manter_acima=False)
# ---- o cabelo ORIGINAL do corpo que descia pela nuca, abaixo do corte, vira nuca: as pontas são alisadas e os
# triângulos ganham a cor da pele da nuca na textura do corpo (o corpo não tem pele sob o cabelo: apagar abria buraco)
Pc = pts(corpo); Cc0 = cor_vertices(corpo); dcn = dcorte(Pc)
nuca_reg = (Pc[:, 1] > y_meio - 0.02) & (Pc[:, 2] > zn - 0.03) & (np.abs(Pc[:, 0]) < 0.12) & (dcn < 0)
camiseta = (Cc0 @ LUM > 0.45) & (Cc0.max(1) - Cc0.min(1) < 0.15)   # claro e sem cor: tecido, fica de fora
nuca_reg &= ~camiseta
escuro = nuca_reg & (Cc0 @ LUM < float(os.environ.get("ASS_ESCURO", "0.12")))
if escuro.any():
    e_ = np.empty(len(corpo.data.edges) * 2, dtype=np.int64); corpo.data.edges.foreach_get("vertices", e_); e_ = e_.reshape(-1, 2)
    co = np.array([v.co[:] for v in corpo.data.vertices]); mexe = escuro.copy()
    for _ in range(3):   # um pouco de folga em volta
        viz = np.zeros(len(co), bool); viz[e_[:, 1][mexe[e_[:, 0]]]] = True; viz[e_[:, 0][mexe[e_[:, 1]]]] = True; mexe |= viz & nuca_reg
    grau = np.bincount(e_.ravel(), minlength=len(co)).astype(float)
    for _ in range(40):   # alisa só os pontos de cabelo; o resto segura a forma
        sm = np.zeros_like(co); np.add.at(sm, e_[:, 0], co[e_[:, 1]]); np.add.at(sm, e_[:, 1], co[e_[:, 0]])
        co[mexe] = (0.5 * co + 0.5 * sm / np.maximum(grau, 1)[:, None])[mexe]
    corpo.data.vertices.foreach_set("co", co.ravel()); corpo.data.update()
    # cor: pinta os triângulos desses pontos na textura do corpo com a pele da nuca ao redor
    pele_nuca = nuca_reg & ~mexe & pele_de(Cc0)
    cor_pele = np.median(Cc0[pele_nuca], 0) if pele_nuca.sum() > 10 else np.median(Cc0[pele_de(Cc0)], 0)
    nt0 = corpo.data.materials[0].node_tree
    tex0 = next(n for n in nt0.nodes if n.type == "TEX_IMAGE" and n.image and n.image.size[0] > 64 and any(l.to_node.type in ("MIX", "BSDF_PRINCIPLED") for l in n.outputs[0].links))
    img0 = tex0.image; W0, H0 = img0.size; px0 = np.array(img0.pixels[:], dtype=np.float32).reshape(H0, W0, 4)
    luv = np.empty(len(corpo.data.loops) * 2); corpo.data.uv_layers[0].data.foreach_get("uv", luv); luv = luv.reshape(-1, 2)
    pintados = 0
    for poly in corpo.data.polygons:
        if not mexe[list(poly.vertices)].all(): continue
        uvs = luv[list(poly.loop_indices)] * [W0, H0]
        for k_ in range(1, len(uvs) - 1):   # triângulo a triângulo, exato (o retângulo vazava para a gola)
            t3 = uvs[[0, k_, k_ + 1]]; x0, y0 = np.floor(t3.min(0)).astype(int) - 1; x1, y1 = np.ceil(t3.max(0)).astype(int) + 2
            x0, y0 = max(x0, 0), max(y0, 0); x1, y1 = min(x1, W0), min(y1, H0)
            if x1 <= x0 or y1 <= y0: continue
            gy, gx = np.mgrid[y0:y1, x0:x1] + 0.5
            (ax, ay), (bx, by), (cx_, cy_) = t3; den = (by - cy_) * (ax - cx_) + (cx_ - bx) * (ay - cy_)
            if abs(den) < 1e-9: continue
            l1 = ((by - cy_) * (gx - cx_) + (cx_ - bx) * (gy - cy_)) / den; l2 = ((cy_ - ay) * (gx - cx_) + (ax - cx_) * (gy - cy_)) / den
            dentro_t = (l1 >= -0.05) & (l2 >= -0.05) & (1 - l1 - l2 >= -0.05)
            bloco = px0[y0:y1, x0:x1, :3]; bloco[dentro_t] = cor_pele
        pintados += 1
    img0.pixels[:] = px0.ravel(); img0.update(); img0.pack()
    print(f"NUCA: {int(escuro.sum())} pontos de cabelo do corpo alisados e {pintados} faces pintadas de pele")
# ---- borda do pescoço do corpo encosta na borda da cabeça ----
bmc = bmesh.new(); bmc.from_mesh(corpo.data); bmc.verts.ensure_lookup_table()
Mwc = np.array(corpo.matrix_world)
def no_plano(co, folga): return abs(float(dcorte((Mwc @ np.array([*co, 1]))[:3])[0]) + folga) < 0.0015
# só a borda que o corte criou (em cima do plano): a gola da camiseta também é borda aberta e era puxada até a cabeça
borda_c = [v.index for v in bmc.verts if v.is_boundary and abs(v.co.x) < 0.16 and v.co.z > zn - 0.03 and no_plano(v.co, FOLGA)]; bmc.free()
bmq = bmesh.new(); bmq.from_mesh(cab.data); bmq.verts.ensure_lookup_table()
Pq = pts(cab); dqb = dcorte(Pq); borda_q = [v.index for v in bmq.verts if v.is_boundary and abs(dqb[v.index]) < 0.003]; bmq.free()
kq = KDTree(len(borda_q))
for j, i in enumerate(borda_q): kq.insert(Pq[i], j)
kq.balance()
Pc = pts(corpo); mov = 0; dl = {}
eixo = np.array([Pq[:, 0].mean(), 0, 0])
for i in borda_c:
    co, j, dist = kq.find(Pc[i])
    if dist < 0.03:
        nn_ = n1 if co[1] < y_meio else n2
        alvo_b = np.array(co) + nn_ * 0.0015                            # entra 1,5 mm por dentro da cabeça (sem fresta)
        rad = alvo_b - np.array([eixo[0], pf[1] + (pt_[1] - pf[1]) * 0.5, alvo_b[2]]); rad[2] = 0
        alvo_b -= rad / max(np.linalg.norm(rad), 1e-6) * 0.0008         # e um fio para o lado de dentro do pescoço
        dl[i] = alvo_b - Pc[i]; mov += 1
# o movimento da borda se espalha 2,5 cm pescoço abaixo (só a borda subindo esticava triângulos em riscos)
if dl:
    ib = np.array(list(dl.keys())); Db = np.array(list(dl.values())); kbb = KDTree(len(ib))
    for j, i in enumerate(ib): kbb.insert(Pc[i], j)
    kbb.balance(); ESP = float(os.environ.get("ASS_ESPALHA", "0.025"))
    dc0 = dcorte(Pc); pele_corpo = pele_de(cor_vertices(corpo))
    for i in np.nonzero((dc0 > -ESP - 0.01) & (np.abs(Pc[:, 0]) < 0.16) & (Pc[:, 2] > zn - 0.05) & pele_corpo)[0]:
        if i in dl: continue
        co, j, dist = kbb.find(Pc[i])
        f = max(0.0, 1 - dist / ESP); f = f * f * (3 - 2 * f)
        if f > 0: Pc[i] = Pc[i] + Db[j] * f
    for i, d_ in dl.items(): Pc[i] = Pc[i] + d_
corpo.data.vertices.foreach_set("co", ((np.linalg.inv(np.array(corpo.matrix_world)) @ np.c_[Pc, np.ones(len(Pc))].T).T[:, :3]).ravel()); corpo.data.update()
print(f"BORDA: {len(borda_c)} vértices do pescoço, {mov} encostados na cabeça ({len(borda_q)} na borda dela)")
# ---- tom: a pele da cabeça perto da borda vai ao tom do pescoço ----
Cc = cor_vertices(corpo); Cq = cor_vertices(cab); Pq = pts(cab); Pc = pts(corpo)
dc = dcorte(Pc); dq = dcorte(Pq)
AM = float(os.environ.get("ASS_AMOSTRA", "0.008")); fc = (dc > -AM) & (dc < 0) & (np.abs(Pc[:, 0]) < 0.07) & pele_de(Cc)
fq = (dq < AM) & pele_de(Cq)
razao = np.clip(np.median(Cc[fc], 0) / np.maximum(np.median(Cq[fq], 0), 1e-3), 0.7, 1.4) if fc.sum() > 20 and fq.sum() > 20 else np.ones(3)
# meio caminho de cada lado: a cabeça vai para o tom do pescoço e o pescoço para o da cabeça (linha de tom sumia só
# corrigindo um lado quando os dois eram diferentes)
meio_r = np.sqrt(razao)
g = np.clip(1 - dq / float(os.environ.get("ASS_TOM", "0.05")), 0, 1)[:, None]; g = g * g * (3 - 2 * g)
tom = 1 + (meio_r[None, :] - 1) * g
gc = np.clip(1 + dc / float(os.environ.get("ASS_TOM", "0.05")), 0, 1)[:, None] * (np.abs(Pc[:, 0]) < 0.16)[:, None]; gc = gc * gc * (3 - 2 * gc)
tom_c = 1 + (1 / meio_r[None, :] - 1) * gc
if "tom" in corpo.data.color_attributes: corpo.data.color_attributes.remove(corpo.data.color_attributes["tom"])
cc_ = corpo.data.color_attributes.new("tom", "FLOAT_COLOR", "POINT"); cc_.data.foreach_set("color", np.c_[tom_c, np.ones(len(tom_c))].ravel())
for mat in corpo.data.materials:
    ntc = mat.node_tree; bc = next(n for n in ntc.nodes if n.type == "BSDF_PRINCIPLED")
    fc_ = bc.inputs["Base Color"].links[0].from_socket
    atc = ntc.nodes.new("ShaderNodeVertexColor"); atc.layer_name = "tom"
    mc_ = ntc.nodes.new("ShaderNodeMix"); mc_.data_type = "RGBA"; mc_.blend_type = "MULTIPLY"; mc_.inputs[0].default_value = 1
    ntc.links.new(fc_, mc_.inputs[6]); ntc.links.new(atc.outputs["Color"], mc_.inputs[7]); ntc.links.new(mc_.outputs[2], bc.inputs["Base Color"])
ca_ = cab.data.color_attributes.new("tom", "FLOAT_COLOR", "POINT"); ca_.data.foreach_set("color", np.c_[tom, np.ones(len(tom))].ravel())
nt = cab.active_material.node_tree; bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
fonte = bsdf.inputs["Base Color"].links[0].from_socket
at = nt.nodes.new("ShaderNodeVertexColor"); at.layer_name = "tom"
mul = nt.nodes.new("ShaderNodeMix"); mul.data_type = "RGBA"; mul.blend_type = "MULTIPLY"; mul.inputs[0].default_value = 1
nt.links.new(fonte, mul.inputs[6]); nt.links.new(at.outputs["Color"], mul.inputs[7]); nt.links.new(mul.outputs[2], bsdf.inputs["Base Color"])
# normais contínuas na emenda: os dois lados levam a normal para a média dos dois na borda (a luz quebrava ali)
def normais(ob):
    n = np.empty(len(ob.data.vertices) * 3); ob.data.vertices.foreach_get("normal", n)
    return (np.array(ob.matrix_world)[:3, :3] @ n.reshape(-1, 3).T).T
Nq, Nc = normais(cab), normais(corpo)
FN = float(os.environ.get("ASS_NORMAL", "0.012"))
kq2 = KDTree(len(Pq))
for i, p in enumerate(Pq): kq2.insert(p, i)
kq2.balance(); kc2 = KDTree(len(Pc))
for i, p in enumerate(Pc): kc2.insert(p, i)
kc2.balance()
def suavizar_normais(ob, P, N, d_plano, kd_outro, N_outro, sinal):
    novo = N.copy(); n_mud = 0
    for i in np.nonzero((sinal * d_plano < FN) & (sinal * d_plano > -0.002) & (np.abs(P[:, 0]) < 0.16))[0]:
        _, j, dist = kd_outro.find(P[i])
        if dist > 0.03: continue
        meio_n = N[i] + N_outro[j]; meio_n /= max(np.linalg.norm(meio_n), 1e-6)
        t_ = float(np.clip(sinal * d_plano[i] / FN, 0, 1))
        v = meio_n * (1 - t_) + N[i] * t_; novo[i] = v / max(np.linalg.norm(v), 1e-6); n_mud += 1
    Mi3 = np.linalg.inv(np.array(ob.matrix_world)[:3, :3])
    ob.data.normals_split_custom_set_from_vertices([tuple(x) for x in (Mi3 @ novo.T).T])
    return n_mud
mq = suavizar_normais(cab, Pq, Nq, dq, kc2, Nc, 1); mc = suavizar_normais(corpo, Pc, Nc, dc, kq2, Nq, -1)
print(f"NORMAIS suavizadas: cabeça {mq}, pescoço {mc}")
print(f"TOM razão {np.round(razao, 3)} (amostras corpo {int(fc.sum())}, cabeça {int(fq.sum())})")
# ---- pesos: a borda da cabeça copia os pesos da borda do pescoço mais perto (as duas andam juntas quando ele vira
# a cabeça) e, subindo, passa para o osso Head ----
nomes = {g.index: g.name for g in corpo.vertex_groups}
Pc = pts(corpo); kb2 = KDTree(len(borda_c))
for j, i in enumerate(borda_c): kb2.insert(Pc[i], j)
kb2.balance()
pesos_borda = [{nomes[g.group]: g.weight for g in corpo.data.vertices[i].groups} for i in borda_c]
cab.vertex_groups.clear(); grupos = {}
def grupo(n):
    if n not in grupos: grupos[n] = cab.vertex_groups.new(name=n)
    return grupos[n]
for i, d_ in enumerate(dq):
    t_ = float(np.clip(d_ / 0.04, 0, 1)); t_ = t_ * t_ * (3 - 2 * t_)
    w = {}
    if t_ < 0.999:
        _, j, _ = kb2.find(Pq[i]); pb = pesos_borda[j]; sb = sum(pb.values()) or 1
        for n, x in pb.items(): w[n] = w.get(n, 0) + (1 - t_) * x / sb
    w["mixamorig:Head"] = w.get("mixamorig:Head", 0) + t_
    for n, x in w.items():
        if x > 0.005: grupo(n).add([i], x, "REPLACE")
print("PESOS da cabeça:", sorted(grupos))
cab.name = cab.data.name = "neto-cabeca"
cab.parent = rig; cab.matrix_parent_inverse = rig.matrix_world.inverted()
cab.modifiers.new("Armature", "ARMATURE").object = rig
bpy.ops.wm.save_as_mainfile(filepath=f"{SAIDA}.blend")
print("PRONTO assentar")
