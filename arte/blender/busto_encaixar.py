# BUSTO no corpo (17/10, estratégia aprovada pelo Joabe: a emenda nunca em pele visível, sempre sob a roupa).
# O busto do Meshy (cabeça, pescoço inteiro, clavículas, alto dos ombros) entra no corpo v4: toda a pele acima da
# camiseta passa a ser do busto; o corpo perde a pele do pescoço e a cabeça antiga; a parte do busto abaixo da gola
# fica por dentro da camiseta (depois a camiseta separada do vestir.py cobre a junção de verdade).
# Tamanho e posição: a cabeça do busto é alinhada (escala + posição) à cabeça que o Joabe já ajustou no neto-v4-sol.
# Uso: Blender -b CORPO_RIG.blend --python blender/busto_encaixar.py -- BUSTO.glb CABECA_AJUSTADA.blend SAIDA_PREFIXO
#   BUSTO_FACES (80000)  BUSTO_ABAIXO (0.05 m: quanto o busto desce por dentro da camiseta)
#   BUSTO_FOLGA (0.003 m: o busto fica essa distância por dentro da superfície do corpo, abaixo da gola)
#   GOLA_LUZ / GOLA_SAT (camiseta = clara e sem cor)
import bpy, sys, os, bmesh
import numpy as np
from mathutils import Vector, Matrix
from mathutils.kdtree import KDTree
from mathutils.bvhtree import BVHTree

a = sys.argv[sys.argv.index("--") + 1:]
GLB, AJUSTADA, SAIDA = a[0], a[1], a[2]
FACES = int(os.environ.get("BUSTO_FACES", "80000")); ABAIXO = float(os.environ.get("BUSTO_ABAIXO", "0.05"))
FOLGA = float(os.environ.get("BUSTO_FOLGA", "0.003"))
LUM = np.array([0.2126, 0.7152, 0.0722])
cena = bpy.context.scene
rig = next(o for o in cena.objects if o.type == "ARMATURE")
corpo = next(o for o in cena.objects if o.type == "MESH" and o.parent == rig)
def osso(n): return np.array(rig.matrix_world @ rig.data.bones["mixamorig:" + n].head_local)
def pts(o):
    co = np.empty(len(o.data.vertices) * 3); o.data.vertices.foreach_get("co", co)
    return (np.array(o.matrix_world) @ np.c_[co.reshape(-1, 3), np.ones(len(o.data.vertices))].T).T[:, :3]
zn, zh = osso("Neck")[2], osso("Head")[2]

# ---- busto: importa, solda as costuras de UV (o Meshy separa a malha nelas) e reduz ----
antes = set(cena.objects)
bpy.ops.import_scene.gltf(filepath=GLB)
bus = next(o for o in cena.objects if o not in antes and o.type == "MESH")
for o in cena.objects: o.select_set(o == bus)
bpy.context.view_layer.objects.active = bus
bus.parent = None; bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in list(cena.objects):
    if o not in antes and o != bus: bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT"); bpy.ops.mesh.remove_doubles(threshold=1e-5)
bpy.ops.object.mode_set(mode="OBJECT")
n0 = len(bus.data.polygons)
if n0 > FACES:
    m = bus.modifiers.new("reduz", "DECIMATE"); m.ratio = FACES / n0; bpy.ops.object.modifier_apply(modifier=m.name)
print(f"BUSTO: {n0} faces -> {len(bus.data.polygons)}")

# ---- alinhamento: escala + posição pela cabeça ajustada (parte de pele/cabelo da cabeça do neto-v4-sol) ----
with bpy.data.libraries.load(AJUSTADA, link=False) as (src, dst): dst.objects = ["neto"]
aj = dst.objects[0]
mi = np.empty(len(aj.data.polygons), dtype=np.int64); aj.data.polygons.foreach_get("material_index", mi)
vs = np.unique(np.concatenate([np.array(p.vertices) for p, k in zip(aj.data.polygons, mi) if k == 1]))
co = np.empty(len(aj.data.vertices) * 3); aj.data.vertices.foreach_get("co", co)
Haj = (np.array(aj.matrix_world) @ np.c_[co.reshape(-1, 3), np.ones(len(aj.data.vertices))].T).T[vs, :3]
bpy.data.objects.remove(aj, do_unlink=True)
Haj = Haj[Haj[:, 2] > zh - 0.02]           # só a cabeça (sem o resto de pescoço da cabeça antiga)
Pb = pts(bus)
# cabeça do busto: acima do ponto mais estreito do pescoço
zs = np.linspace(Pb[:, 2].min(), Pb[:, 2].max(), 80)
larg = [np.ptp(Pb[np.abs(Pb[:, 2] - z) < (zs[1] - zs[0]), 0]) if (np.abs(Pb[:, 2] - z) < (zs[1] - zs[0])).sum() > 10 else np.inf for z in zs]
meio = slice(10, 50); z_pesc = zs[meio][int(np.argmin(np.array(larg)[meio]))]
print(f"BUSTO: pescoço mais estreito em z {z_pesc:.3f} (largura {min(np.array(larg)[meio]):.3f})")
Hb = lambda P: P[P[:, 2] > z_pesc + 0.25 * (P[:, 2].max() - z_pesc)]
s = (Haj[:, 2].max() - Haj[:, 2].min()) / (Pb[:, 2].max() - (z_pesc + 0.25 * (Pb[:, 2].max() - z_pesc)))
T = np.eye(4); T[:3, :3] *= s
Q = (T @ np.c_[Pb, np.ones(len(Pb))].T).T[:, :3]; hq = Hb(Q)
T[:3, 3] = [Haj[:, 0].mean() - hq[:, 0].mean(), Haj[:, 1].mean() - hq[:, 1].mean(), Haj[:, 2].max() - hq[:, 2].max()]
kd = KDTree(len(Haj))
for i, p in enumerate(Haj): kd.insert(p, i)
kd.balance(); rng = np.random.default_rng(0)
for _ in range(40):
    Q = (T @ np.c_[Pb, np.ones(len(Pb))].T).T[:, :3]; hq = Hb(Q)
    am = hq[rng.choice(len(hq), min(8000, len(hq)), replace=False)]
    pr = np.array([kd.find(q)[0][:] for q in am]); d = np.linalg.norm(pr - am, axis=1); ok = d < np.percentile(d, 70)
    A_, B_ = am[ok], pr[ok]; ca, cb = A_.mean(0), B_.mean(0)
    ss = np.sum((A_ - ca) * (B_ - cb)) / ((A_ - ca) ** 2).sum(); t = cb - ss * ca
    M = np.eye(4); M[:3, :3] = ss * np.eye(3); M[:3, 3] = t; T = M @ T
bus.data.transform(Matrix(T.tolist())); bus.data.update()
Pb = pts(bus)
print(f"ALINHADO: escala {np.cbrt(np.linalg.det(T[:3, :3])):.4f}, erro mediano {np.median(d[ok]) * 1000:.1f} mm")

# ---- a gola do corpo: região de pele exposta contínua que sai do pescoço (cor em resolução cheia, gêmeos das
# costuras de UV ligados) ----
Pc = pts(corpo)
anel = Pc[(np.abs(Pc[:, 2] - zn) < 0.01) & (np.abs(Pc[:, 0]) < 0.05)]
cx = float(Haj[:, 0].mean()); cy = float((anel[:, 1].min() + anel[:, 1].max()) / 2)
def th_(P): P = np.atleast_2d(P); return np.arctan2(P[:, 0] - cx, -(P[:, 1] - cy))
def r_(P): P = np.atleast_2d(P); return np.hypot(P[:, 0] - cx, P[:, 1] - cy)
def por_angulo(th, val, nb=24, func=np.min):
    b = np.floor((th + np.pi) / (2 * np.pi) * nb).astype(int) % nb; v = np.full(nb, np.nan)
    for k in range(nb):
        if (b == k).sum() >= 2: v[k] = func(val[b == k])
    cen = -np.pi + (np.arange(nb) + 0.5) * 2 * np.pi / nb; okk = np.isfinite(v)
    return lambda t: np.interp(t, cen[okk], v[okk], period=2 * np.pi)
nt = corpo.active_material.node_tree
img = next(n for n in nt.nodes if n.type == "TEX_IMAGE" and n.image and any(l.to_node.type in ("MIX", "BSDF_PRINCIPLED") for l in n.outputs[0].links)).image
W, H = img.size; px = np.array(img.pixels[:]).reshape(H, W, 4)
lv = np.empty(len(corpo.data.loops), dtype=np.int64); corpo.data.loops.foreach_get("vertex_index", lv)
luv = np.empty(len(corpo.data.loops) * 2); corpo.data.uv_layers[0].data.foreach_get("uv", luv); luv = luv.reshape(-1, 2)
cl = px[np.clip((luv[:, 1] * (H - 1)).astype(int), 0, H - 1), np.clip((luv[:, 0] * (W - 1)).astype(int), 0, W - 1), :3]
Cf = np.zeros((len(Pc), 3)); nf = np.zeros(len(Pc)); np.add.at(Cf, lv, cl); np.add.at(nf, lv, 1); Cf /= np.maximum(nf, 1)[:, None]
sat = (Cf.max(1) - Cf.min(1)) / np.maximum(Cf.max(1), 1e-3)
camiseta = (Cf @ LUM > float(os.environ.get("GOLA_LUZ", "0.4"))) & (sat < float(os.environ.get("GOLA_SAT", "0.25")))
e_ = np.empty(len(corpo.data.edges) * 2, dtype=np.int64); corpo.data.edges.foreach_get("vertices", e_); e_ = e_.reshape(-1, 2)
viz = [[] for _ in range(len(Pc))]
for x, y in e_: viz[x].append(y); viz[y].append(x)
grupos_pos = {}
for i, p_ in enumerate(np.round(Pc / 1e-5).astype(np.int64)): grupos_pos.setdefault(tuple(p_), []).append(i)
for g in grupos_pos.values():
    for i in g[1:]: viz[g[0]].append(i); viz[i].append(g[0])
lim = (Pc[:, 2] > zn - 0.16) & (Pc[:, 2] < zn + 0.10) & (np.abs(Pc[:, 0] - cx) < 0.14)
sem = np.nonzero(lim & ~camiseta & (np.abs(Pc[:, 2] - (zn + 0.02)) < 0.01) & (r_(Pc) < 0.07))[0]
expo = np.zeros(len(Pc), bool); expo[sem] = True; fila = list(sem)
while fila:
    i = fila.pop()
    for j in viz[i]:
        if not expo[j] and lim[j] and not camiseta[j]: expo[j] = True; fila.append(j)
zgola = por_angulo(th_(Pc[expo]), Pc[expo, 2], func=lambda v: np.percentile(v, 3))
rgola = por_angulo(th_(Pc[expo]), r_(Pc[expo]), func=lambda v: np.percentile(v, 97))
print(f"GOLA: pele exposta {int(expo.sum())} vértices; z frente {zgola(np.array([0.0]))[0]:.3f}, lado {zgola(np.array([np.pi / 2]))[0]:.3f}, nuca {zgola(np.array([np.pi]))[0]:.3f}")

# ---- busto: fica só até ABAIXO da gola e perto do pescoço (os ombros do busto são mais estreitos/largos que os do
# corpo e ficariam para fora da camiseta) ----
Pb = pts(bus)
fora = (Pb[:, 2] < zgola(th_(Pb)) - ABAIXO) | ((Pb[:, 2] < zgola(th_(Pb)) + 0.01) & (r_(Pb) > rgola(th_(Pb)) + 0.035))
bm = bmesh.new(); bm.from_mesh(bus.data); bm.verts.ensure_lookup_table()
bmesh.ops.delete(bm, geom=[bm.verts[i] for i in np.nonzero(fora)[0]], context="VERTS"); bm.to_mesh(bus.data); bm.free(); bus.data.update()
print(f"BUSTO: {int(fora.sum())} vértices abaixo/fora da gola apagados")
# abaixo da gola o busto fica por dentro da superfície do corpo; na altura da gola, toma a largura do buraco (sem
# fresta); acima, volta à forma própria em 3 cm
ref = corpo.copy(); ref.data = corpo.data.copy(); cena.collection.objects.link(ref)
bvh = BVHTree.FromObject(ref, bpy.context.evaluated_depsgraph_get())
Pb = pts(bus); dg = Pb[:, 2] - zgola(th_(Pb)); novo = Pb.copy(); n_d = n_a = 0
for i in np.nonzero(dg < 0.03)[0]:
    t = np.arctan2(Pb[i, 0] - cx, -(Pb[i, 1] - cy)); dv = Vector((np.sin(t), -np.cos(t), 0))
    loc, _, _, dd = bvh.ray_cast(Vector((cx, cy, Pb[i, 2])) + dv * 0.25, -dv, 0.25)
    if loc is None: continue
    r_corpo = 0.25 - dd; r_b = r_(Pb[i])[0]; alvo = r_corpo - FOLGA
    if dg[i] < 0:
        # nos 2 cm logo abaixo da gola o busto encosta na superfície do corpo (nem para fora, nem fundo: fundo
        # deixava fresta no decote); mais abaixo, só não pode passar dela
        if r_b > alvo or dg[i] > -0.02: novo[i, :2] = [cx + np.sin(t) * alvo, cy - np.cos(t) * alvo]; n_d += 1
    else:
        w = 1 - dg[i] / 0.03; w = w * w * (3 - 2 * w); r_n = r_b + (alvo - r_b) * w
        novo[i, :2] = [cx + np.sin(t) * r_n, cy - np.cos(t) * r_n]; n_a += 1
bus.data.vertices.foreach_set("co", novo.ravel()); bus.data.update()
print(f"BUSTO: {n_d} vértices empurrados para dentro da camiseta, {n_a} no pescoço levados à largura da gola")

# ---- a regata do busto que aparece no decote vira pele: atributo "tom" (multiplica a textura) leva o creme à cor
# da pele do pescoço, só na regata acima de 3 cm abaixo da gola, sumindo para baixo ----
uvb = bus.data.uv_layers[0]; mb = bus.active_material.node_tree
imb = next(n for n in mb.nodes if n.type == "TEX_IMAGE" and n.image and any(l.to_node.type == "BSDF_PRINCIPLED" and l.to_socket.name == "Base Color" for l in n.outputs[0].links)).image
Wb, Hb_ = imb.size; pxb = np.array(imb.pixels[:]).reshape(Hb_, Wb, 4)[:, :, :3]
lvb = np.empty(len(bus.data.loops), dtype=np.int64); bus.data.loops.foreach_get("vertex_index", lvb)
luvb = np.empty(len(bus.data.loops) * 2); uvb.data.foreach_get("uv", luvb); luvb = luvb.reshape(-1, 2)
clb = pxb[np.clip((luvb[:, 1] * (Hb_ - 1)).astype(int), 0, Hb_ - 1), np.clip((luvb[:, 0] * (Wb - 1)).astype(int), 0, Wb - 1)]
Cb = np.zeros((len(bus.data.vertices), 3)); nb_ = np.zeros(len(bus.data.vertices)); np.add.at(Cb, lvb, clb); np.add.at(nb_, lvb, 1); Cb /= np.maximum(nb_, 1)[:, None]
Pb = pts(bus); dg = Pb[:, 2] - zgola(th_(Pb)); satb = (Cb.max(1) - Cb.min(1)) / np.maximum(Cb.max(1), 1e-3)
regata = (Cb @ LUM > 0.45) & (satb < 0.25)
pele_b = (satb > 0.35) & (Cb @ LUM > 0.12) & (dg > 0) & (dg < 0.04)
cor_pele = np.median(Cb[pele_b], 0)
w_r = np.clip((dg + 0.03) / 0.015, 0, 1) * regata
tom = 1 + (np.clip(cor_pele / np.maximum(Cb, 1e-3), 0, 1) - 1) * w_r[:, None]
ca_ = bus.data.color_attributes.new("tom", "FLOAT_COLOR", "POINT"); ca_.data.foreach_set("color", np.c_[tom, np.ones(len(tom))].ravel())
bsdf = next(n for n in mb.nodes if n.type == "BSDF_PRINCIPLED"); fonte = bsdf.inputs["Base Color"].links[0].from_socket
at = mb.nodes.new("ShaderNodeVertexColor"); at.layer_name = "tom"
mul = mb.nodes.new("ShaderNodeMix"); mul.data_type = "RGBA"; mul.blend_type = "MULTIPLY"; mul.inputs[0].default_value = 1
mb.links.new(fonte, mul.inputs[6]); mb.links.new(at.outputs["Color"], mul.inputs[7]); mb.links.new(mul.outputs[2], bsdf.inputs["Base Color"])
print(f"REGATA no decote levada à cor da pele: {int((w_r > 0.01).sum())} vértices (pele {np.round(cor_pele, 3)})")

# ---- corpo: sai a pele exposta (pescoço e colo) e a cabeça antiga ----
acima = (np.abs(Pc[:, 0] - cx) < 0.13) & (Pc[:, 2] > zgola(th_(Pc)) + 0.035) & (Pc[:, 2] > zn)
bmc = bmesh.new(); bmc.from_mesh(corpo.data); bmc.verts.ensure_lookup_table()
bmesh.ops.delete(bmc, geom=[bmc.verts[i] for i in np.nonzero(expo | acima)[0]], context="VERTS"); bmc.to_mesh(corpo.data); bmc.free(); corpo.data.update()
print(f"CORPO: {int(expo.sum())} vértices de pele exposta e {int(acima.sum())} da cabeça antiga apagados")

# ---- pesos: perto da gola, os do corpo original mais perto; acima do osso Head, só Head ----
nomes = {g.index: g.name for g in ref.vertex_groups}
Pref = pts(ref); kref = KDTree(len(Pref))
for i, p in enumerate(Pref): kref.insert(p, i)
kref.balance()
bus.vertex_groups.clear(); grupos = {}
def grupo(n):
    if n not in grupos: grupos[n] = bus.vertex_groups.new(name=n)
    return grupos[n]
Pb = pts(bus)
for i in range(len(Pb)):
    t_ = float(np.clip((Pb[i, 2] - (zh - 0.01)) / 0.03, 0, 1)); t_ = t_ * t_ * (3 - 2 * t_)
    w = {}
    if t_ < 0.999:
        soma = {}
        for _, j, _ in kref.find_n(Pb[i], 6):
            for g in ref.data.vertices[j].groups: soma[nomes[g.group]] = soma.get(nomes[g.group], 0) + g.weight
        s_ = sum(soma.values()) or 1
        for n, x in soma.items(): w[n] = (1 - t_) * x / s_
    w["mixamorig:Head"] = w.get("mixamorig:Head", 0) + t_
    for n, x in w.items():
        if x > 0.005: grupo(n).add([i], x, "REPLACE")
print("PESOS do busto:", sorted(grupos))
bpy.data.objects.remove(ref, do_unlink=True)

# ---- junta o busto ao corpo ----
bus.name = bus.data.name = "neto-busto"
bus.data.polygons.foreach_set("use_smooth", np.ones(len(bus.data.polygons), bool)); bus.data.update()
for x in cena.objects: x.select_set(x in (corpo, bus))
bpy.context.view_layer.objects.active = corpo
bpy.ops.object.join()
bpy.ops.wm.save_as_mainfile(filepath=f"{SAIDA}.blend"); print("PRONTO busto")
