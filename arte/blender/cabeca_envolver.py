# Cabeça detalhada sem emenda: em vez de cortar e colar (a emenda aparecia: tom, degrau, zigue-zague), a cabeça do
# PRÓPRIO corpo (já com esqueleto) é levada à forma da cabeça detalhada (cada vértice desliza até a superfície dela,
# com transição suave no pescoço), recebe a pintura dela numa textura nova só da cabeça (misturada à do corpo no
# pescoço) e herda as shape keys de expressão por Surface Deform. O cabelo da detalhada fica como peça própria.
# Uso: Blender -b CORPO_RIG.blend --python blender/cabeca_envolver.py -- CABECA.blend SAIDA_PREFIXO
#   ENV_AJUSTE ("escala,z_dos_olhos,subida", medido contra a cabeça original)  ENV_TEX (4096)
#   ENV_FUNDO_CABELO (0.015 m: quanto afunda o que fica sob o cabelo)
#   ENV_Z0 / ENV_Z1 (fração Neck->Head onde a transição começa e termina: 0.0 / 0.6)  ENV_PELE (0.16)
import bpy, sys, os
import numpy as np
from mathutils import Vector, Matrix
from mathutils.kdtree import KDTree
from mathutils.bvhtree import BVHTree

a = sys.argv[sys.argv.index("--") + 1:]
CAB, SAIDA = a[0], a[1]
TEX = int(os.environ.get("ENV_TEX", "4096")); PELE = float(os.environ.get("ENV_PELE", "0.16"))
F0, F1 = float(os.environ.get("ENV_Z0", "0.0")), float(os.environ.get("ENV_Z1", "0.6"))
cena = bpy.context.scene
rig = next(o for o in cena.objects if o.type == "ARMATURE")
corpo = next(o for o in cena.objects if o.type == "MESH" and o.parent == rig)
def osso(n): return np.array(rig.matrix_world @ rig.data.bones["mixamorig:" + n].head_local)
def pts(o, co=None):
    if co is None: co = np.empty(len(o.data.vertices) * 3); o.data.vertices.foreach_get("co", co)
    return (np.array(o.matrix_world) @ np.c_[np.asarray(co).reshape(-1, 3), np.ones(len(o.data.vertices))].T).T[:, :3]
def ativar(*obs):
    for x in cena.objects: x.select_set(x in obs)
    bpy.context.view_layer.objects.active = obs[-1]
def cor_vertices(ob, img=None):
    nt = ob.active_material.node_tree
    if img is None:
        tex = next(n for n in nt.nodes if n.type == "TEX_IMAGE" and n.image and any(l.to_node.type in ("MIX", "BSDF_PRINCIPLED") for l in n.outputs[0].links))
        img = tex.image
    _ = img.pixels[0]   # força carregar a imagem (empacotada no .blend, vinha vazia e tudo virava "cabelo")
    im = img.copy(); im.scale(512, 512); px = np.array(im.pixels[:]).reshape(512, 512, 4); bpy.data.images.remove(im)
    uv = np.zeros((len(ob.data.vertices), 2)); cont = np.zeros(len(ob.data.vertices))
    lv = np.empty(len(ob.data.loops), dtype=np.int64); ob.data.loops.foreach_get("vertex_index", lv)
    luv = np.empty(len(ob.data.loops) * 2); ob.data.uv_layers[0].data.foreach_get("uv", luv); luv = luv.reshape(-1, 2)
    np.add.at(uv, lv, luv); np.add.at(cont, lv, 1); uv /= np.maximum(cont, 1)[:, None]
    return px[np.clip((uv[:, 1] * 511).astype(int), 0, 511), np.clip((uv[:, 0] * 511).astype(int), 0, 511), :3]
LUM = np.array([0.2126, 0.7152, 0.0722])

zn, zh, zt = osso("Neck")[2], osso("Head")[2], osso("HeadTop_End")[2]
Pc = pts(corpo)
regiao = (Pc[:, 2] > zn - 0.02) & (np.abs(Pc[:, 0]) < 0.16)

# ---- cabeça detalhada alinhada à do corpo (faixa queixo-olhos) + ajuste medido ----
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
    A_, B_ = am[ok], pr[ok]; ca, cb = A_.mean(0), B_.mean(0); U, S, Vt = np.linalg.svd((A_ - ca).T @ (B_ - cb))
    # só escala e posição: as duas cabeças vêm retas de frente; deixar girar inclinava a cabeça para baixo
    s = np.sum((A_ - ca) * (B_ - cb)) / ((A_ - ca) ** 2).sum()
    t = cb - s * ca; M = np.eye(4); M[:3, :3] = s * np.eye(3); M[:3, 3] = t; T = M @ T
    Qa = (T @ np.c_[Q, np.ones(len(Q))].T).T[:, :3]
if os.environ.get("ENV_AJUSTE"):
    ea, pz, dz = [float(x) for x in os.environ["ENV_AJUSTE"].split(",")]
    Adj = np.eye(4); Adj[:3, :3] *= ea; Adj[:3, 3] = np.array([Qa[:, 0].mean(), Qa[:, 1].mean(), pz]) * (1 - ea) + [0, 0, dz]; T = Adj @ T
Mfinal = T @ np.array(cab.matrix_world)
for k in kb:
    X = np.array([v.co[:] for v in k.data]); k.data.foreach_set("co", ((Mfinal @ np.c_[X, np.ones(len(X))].T).T[:, :3]).ravel())
cab.matrix_world = Matrix.Identity(4)
cab.data.vertices.foreach_set("co", np.array([v.co[:] for v in kb["Basis"].data]).ravel()); cab.data.update()
print(f"ALINHADA escala {np.cbrt(abs(np.linalg.det(T[:3, :3]))):.4f}")

# ---- máscaras: pele e cabelo nas duas cabeças ----
def pele_de(C): return (C @ LUM > PELE) & (C[:, 0] - C[:, 2] > 0.06)
Cq = cor_vertices(cab); cabelo_q = ~pele_de(Cq)
print("COR mediana cabeça", np.round(np.median(Cq, 0), 3), "lum p10/p50/p90", np.round(np.percentile(Cq @ LUM, [10, 50, 90]), 3))
Cc = cor_vertices(corpo); cabelo_c = regiao & ~pele_de(Cc) & (Pc[:, 2] > zalinha)

# ---- cabelo da detalhada como peça própria (osso Head) ----
cabelo = cab.copy(); cabelo.data = cab.data.copy(); cena.collection.objects.link(cabelo)
ativar(cabelo); cabelo.shape_key_clear()
import bmesh
bm = bmesh.new(); bm.from_mesh(cabelo.data); bm.verts.ensure_lookup_table()
bmesh.ops.delete(bm, geom=[bm.verts[i] for i in np.nonzero(~cabelo_q)[0]], context="VERTS"); bm.to_mesh(cabelo.data); bm.free()
cabelo.data.update(); cabelo.name = cabelo.data.name = "neto-cabelo"
print(f"CABELO {len(cabelo.data.vertices)} vértices")

# ---- forma: a cabeça do corpo desliza até a superfície da detalhada ----
uid_k = np.round(Pc / 3e-4).astype(np.int64); _, uid = np.unique(uid_k, axis=0, return_inverse=True); uid = uid.ravel(); nu = uid.max() + 1
e = np.empty(len(corpo.data.edges) * 2, dtype=np.int64); corpo.data.edges.foreach_get("vertices", e); e = uid[e.reshape(-1, 2)]; e = e[e[:, 0] != e[:, 1]]
grau = np.bincount(e.ravel(), minlength=nu).astype(float)
def suav(X, k):
    for _ in range(k):
        s_ = np.zeros_like(X); np.add.at(s_, e[:, 0], X[e[:, 1]]); np.add.at(s_, e[:, 1], X[e[:, 0]])
        X = 0.5 * X + 0.5 * np.where(grau[:, None] > 0, s_ / np.maximum(grau, 1)[:, None], X)
    return X
z0, z1 = zn + F0 * (zh - zn), zn + F1 * (zh - zn)
h = np.clip((Pc[:, 2] - z0) / (z1 - z0), 0, 1) * regiao; h = h * h * (3 - 2 * h)
bvh = BVHTree.FromObject(cab, bpy.context.evaluated_depsgraph_get())
face_cabelo = np.array([cabelo_q[list(p.vertices)].mean() > 0.5 for p in cab.data.polygons])
FUNDO = float(os.environ.get("ENV_FUNDO_CABELO", "0.015"))
desl = np.zeros_like(Pc); sob = np.zeros(len(Pc), bool)
for i in np.nonzero(h > 0)[0]:
    loc, nrm, fi, dist = bvh.find_nearest(Vector(Pc[i]))
    if loc is None: continue
    # o que cai em cabelo afunda e fica escondido sob o cabelo novo (as mechas do cabelo antigo saíam em lascas)
    sob[i] = bool(face_cabelo[fi])
    alvo_p = np.array(loc) - (np.array(nrm) * FUNDO if sob[i] else 0)
    desl[i] = (alvo_p - Pc[i]) * h[i]
print(f"SOB o cabelo: {int(sob.sum())} pontos afundados {FUNDO * 1000:.0f} mm")
du = np.zeros((nu, 3)); np.add.at(du, uid, desl); du /= np.bincount(uid, minlength=nu)[:, None]
du = suav(du, 2); Pnovo = Pc + du[uid]
Mi = np.linalg.inv(np.array(corpo.matrix_world))
corpo.data.vertices.foreach_set("co", ((Mi @ np.c_[Pnovo, np.ones(len(Pnovo))].T).T[:, :3]).ravel()); corpo.data.update()
print(f"FORMA {int((h > 0).sum())} vértices levados, desloc. médio {np.linalg.norm(du[uid][h > 0.5], axis=1).mean() * 1000:.1f} mm")

# ---- expressões: cada vértice do corpo guarda o triângulo da detalhada onde caiu (coordenada baricêntrica) e segue
# esse ponto quando a shape key deforma o triângulo (o Surface Deform do Blender não conseguia ligar nesta malha) ----
from mathutils.geometry import barycentric_transform
cab.data.calc_loop_triangles()
tris = np.array([t.vertices[:] for t in cab.data.loop_triangles]); tri_poly = np.array([t.polygon_index for t in cab.data.loop_triangles])
Bq = np.array([v.co[:] for v in kb["Basis"].data])
bvh_t = BVHTree.FromPolygons(Bq.tolist(), tris.tolist())
Pn = pts(corpo); sel = np.nonzero(h > 0)[0]; amarra = []
for i in sel:
    loc, _, ti, _ = bvh_t.find_nearest(Vector(Pn[i]))
    if loc is None: continue
    a_, b_, c_ = (Vector(Bq[v]) for v in tris[ti])
    amarra.append((i, ti, barycentric_transform(loc, a_, b_, c_, Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1)))))
if corpo.data.shape_keys is None: corpo.shape_key_add(name="Basis")
co0 = np.array([v.co[:] for v in corpo.data.vertices]); Mi3 = np.linalg.inv(np.array(corpo.matrix_world))[:3, :3]
for k in kb:
    if k.name == "Basis": continue
    Kq = np.array([v.co[:] for v in k.data]); dk = np.zeros_like(co0)
    for i, ti, bc in amarra:
        va, vb, vc = tris[ti]
        dk[i] = ((Kq[va] - Bq[va]) * bc.x + (Kq[vb] - Bq[vb]) * bc.y + (Kq[vc] - Bq[vc]) * bc.z) * h[i]
    sk = corpo.shape_key_add(name=k.name, from_mix=False); sk.data.foreach_set("co", (co0 + dk @ Mi3.T).ravel())
    print(f"EXPRESSAO {k.name}: desloc. máximo {np.linalg.norm(dk, axis=1).max() * 1000:.1f} mm")

# ---- pintura: textura nova só da cabeça (UV própria), da detalhada, misturada à do corpo no pescoço ----
me = corpo.data
faces_cab = np.array([h[list(p.vertices)].max() > 0.001 for p in me.polygons])
mat_corpo = corpo.active_material
mat_cab = mat_corpo.copy(); mat_cab.name = "neto-cabeca"; corpo.data.materials.append(mat_cab); slot = len(corpo.data.materials) - 1
for p, f in zip(me.polygons, faces_cab):
    if f: p.material_index = slot
uv_cab = me.uv_layers.new(name="uv_cabeca"); me.uv_layers.active = uv_cab
ativar(corpo); bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="DESELECT"); bpy.ops.object.mode_set(mode="OBJECT")
for p, f in zip(me.polygons, faces_cab): p.select = bool(f)
bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.004); bpy.ops.object.mode_set(mode="OBJECT")
me.uv_layers.active = me.uv_layers[0]
# h por vértice como cor, para a mistura
if "mistura" in me.color_attributes: me.color_attributes.remove(me.color_attributes["mistura"])
hm = np.clip((Pc[:, 2] - (z0 + 0.35 * (z1 - z0))) / (0.65 * (z1 - z0)), 0, 1) * regiao; hm = hm * hm * (3 - 2 * hm)
cm = me.color_attributes.new("mistura", "FLOAT_COLOR", "POINT"); cm.data.foreach_set("color", np.c_[hm, hm, hm, np.ones(len(hm))].ravel())
cena.render.engine = "CYCLES"; cena.cycles.samples = 1; cena.cycles.device = "CPU"; bk = cena.render.bake; bk.margin = 8
ntc = mat_cab.node_tree; out = next(n for n in ntc.nodes if n.type == "OUTPUT_MATERIAL"); antigo = out.inputs[0].links[0].from_socket
em = ntc.nodes.new("ShaderNodeEmission"); ntc.links.new(em.outputs[0], out.inputs[0])
alvo_img = ntc.nodes.new("ShaderNodeTexImage"); uvn = ntc.nodes.new("ShaderNodeUVMap"); uvn.uv_map = "uv_cabeca"
ntc.links.new(uvn.outputs[0], alvo_img.inputs[0])
def assar(nome, modo, valor_expr=0.0):
    im = bpy.data.images.new(nome, TEX, TEX); alvo_img.image = im; ntc.nodes.active = alvo_img
    if modo == "corpo":   # pintura original do corpo (UVMap) para a mesma UV da cabeça
        tb = next(n for n in ntc.nodes if n.type == "TEX_IMAGE" and n is not alvo_img and n.image and n.image.size[0] > 0 and any(l.to_node.type == "BSDF_PRINCIPLED" for l in n.outputs[0].links))
        ntc.links.new(tb.outputs[0], em.inputs[0]); bk.use_selected_to_active = False; ativar(corpo)
    elif modo == "mistura":
        at = ntc.nodes.new("ShaderNodeVertexColor"); at.layer_name = "mistura"; ntc.links.new(at.outputs[0], em.inputs[0])
        bk.use_selected_to_active = False; ativar(corpo)
    else:                 # pintura da cabeça detalhada, de fora para dentro (forma neutra; só a textura muda)
        for x in kb: x.value = 0
        nt2 = cab.active_material.node_tree; o2 = next(n for n in nt2.nodes if n.type == "OUTPUT_MATERIAL")
        chave = "expr" if valor_expr > 0 else "neutra"
        tx = next((n for n in nt2.nodes if n.type == "TEX_IMAGE" and n.image and chave in n.image.name), None)
        if tx is None:
            bs = next(n for n in nt2.nodes if n.type == "BSDF_PRINCIPLED"); fonte = bs.inputs["Base Color"].links[0].from_socket
        else: fonte = tx.outputs[0]
        em2 = nt2.nodes.get("emissao_bake") or nt2.nodes.new("ShaderNodeEmission"); em2.name = "emissao_bake"
        nt2.links.new(fonte, em2.inputs[0]); nt2.links.new(em2.outputs[0], o2.inputs[0])
        bk.use_selected_to_active = True; bk.cage_extrusion = 0.02; bk.max_ray_distance = 0.04; ativar(cab, corpo)
    bpy.ops.object.bake(type="EMIT")
    return np.array(im.pixels[:], dtype=np.float32).reshape(TEX, TEX, 4)
# o bake grava na UV ATIVA do objeto, e cada material grava no seu nó de imagem ativo: o material do corpo ganha um
# alvo descartável para não gravar por cima da textura do corpo
me.uv_layers.active = me.uv_layers["uv_cabeca"]
ntb = mat_corpo.node_tree; lixo = ntb.nodes.new("ShaderNodeTexImage"); lixo.image = bpy.data.images.new("lixo", 64, 64); ntb.nodes.active = lixo
Bc = assar("cab_corpo", "corpo"); Mx = assar("cab_mistura", "mistura")[..., :1]
Dn = assar("cab_det_neutra", "detalhe", 0.0)
expr_nomes = [k.name for k in kb if k.name != "Basis"]
De = assar("cab_det_expr", "detalhe", 1.0) if expr_nomes else Dn
ntc.links.new(antigo, out.inputs[0]); ntb.nodes.remove(lixo); me.uv_layers.active = me.uv_layers[0]
for nome, Dt in (("neutra", Dn), ("expr", De)):
    Tt = Bc.copy(); Tt[..., :3] = Bc[..., :3] * (1 - Mx) + Dt[..., :3] * Mx
    im = bpy.data.images.new(f"neto-cabeca-{nome}", TEX, TEX); im.pixels[:] = Tt.ravel()
    im.filepath_raw = f"{SAIDA}-cabeca-{nome}.png"; im.file_format = "PNG"; im.save()
# material da cabeça: as duas pinturas misturadas pela expressão (mesma regra do olhos_textura.py)
bs = next(n for n in ntc.nodes if n.type == "BSDF_PRINCIPLED")
tn = ntc.nodes.new("ShaderNodeTexImage"); tn.image = bpy.data.images.load(f"{SAIDA}-cabeca-neutra.png")
te = ntc.nodes.new("ShaderNodeTexImage"); te.image = bpy.data.images.load(f"{SAIDA}-cabeca-expr.png")
for t_ in (tn, te): ntc.links.new(uvn.outputs[0], t_.inputs[0])
mix = ntc.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"; ntc.links.new(tn.outputs[0], mix.inputs[6]); ntc.links.new(te.outputs[0], mix.inputs[7])
ntc.links.new(mix.outputs[2], bs.inputs["Base Color"])
if expr_nomes:
    dv = mix.inputs[0].driver_add("default_value").driver; dv.type = "SCRIPTED"
    var = dv.variables.new(); var.name = "v"; var.targets[0].id_type = "KEY"; var.targets[0].id = corpo.data.shape_keys
    var.targets[0].data_path = f'key_blocks["{expr_nomes[-1]}"].value'; dv.expression = "min(max(v / 2.0, 0), 1)"
for n in (em, alvo_img): ntc.nodes.remove(n)
# cabelo no esqueleto (osso Head) e limpa a detalhada
cabelo.parent = rig; cabelo.matrix_parent_inverse = rig.matrix_world.inverted()
g = cabelo.vertex_groups.new(name="mixamorig:Head"); g.add(list(range(len(cabelo.data.vertices))), 1.0, "REPLACE")
mc = cabelo.modifiers.new("Armature", "ARMATURE"); mc.object = rig
bpy.data.objects.remove(cab, do_unlink=True)
bpy.ops.wm.save_as_mainfile(filepath=f"{SAIDA}.blend")
print("PRONTO envolver")
