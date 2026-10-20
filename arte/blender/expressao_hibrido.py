# Expressão híbrida: o movimento vem da forma feita pelas imagens 2D (expressao_fluxo.py, mantém o rosto) e o VOLUME
# vem da geração do Meshy com a mesma expressão (a curva dos lábios, a bochecha que estufa). Da geração do Meshy só se
# usa o deslocamento na direção da normal, e só onde a forma 2D já mexe; orelha, olho e cabelo da outra geração
# (que mudam de uma geração para outra) ficam de fora.
# Uso: Blender -b CABECA_COM_FORMA.blend --python blender/expressao_hibrido.py -- FORMA EXPRESSAO.glb SAIDA_PREFIXO [NOVA_FORMA]
#   HIB_MAX (0.012: volume máximo, em unidades da cabeça)  HIB_LIMIAR (0.004: deslocamento 2D que conta como "mexe")
#   HIB_DILATA (3 anéis)  HIB_SUAVIZA (3)  HIB_FUNDO (25: suavização que define o "formato" a tirar; 0 = não tira)
import bpy, sys, os
import numpy as np
from mathutils import Vector, Matrix
from mathutils.kdtree import KDTree
from mathutils.bvhtree import BVHTree

a = sys.argv[sys.argv.index("--") + 1:]
FORMA, EXPR, SAIDA = a[0], a[1], a[2]; NOVA = a[3] if len(a) > 3 else FORMA + "_hibrido"
HMAX = float(os.environ.get("HIB_MAX", "0.012")); LIM = float(os.environ.get("HIB_LIMIAR", "0.004"))
DIL = int(os.environ.get("HIB_DILATA", "3")); SUAV = int(os.environ.get("HIB_SUAVIZA", "3"))
cena = bpy.context.scene
cab = bpy.data.objects["cabeca"]; kb = cab.data.shape_keys.key_blocks
for k in kb: k.value = 0
B = np.array([v.co[:] for v in kb["Basis"].data]); S2 = np.array([v.co[:] for v in kb[FORMA].data]); D2 = S2 - B
Mw = np.array(cab.matrix_world)
def mundo(X): return (Mw @ np.c_[X, np.ones(len(X))].T).T[:, :3]
P = mundo(B); P2 = mundo(S2)

# soldar costuras e vizinhança
chave = np.round(P / 3e-4).astype(np.int64); _, uid = np.unique(chave, axis=0, return_inverse=True); uid = uid.ravel(); nu = uid.max() + 1
e = np.empty(len(cab.data.edges) * 2, dtype=np.int64); cab.data.edges.foreach_get("vertices", e); e = uid[e.reshape(-1, 2)]; e = e[e[:, 0] != e[:, 1]]
grau = np.bincount(e.ravel(), minlength=nu).astype(float)
def suav(X, k):
    for _ in range(k):
        s = np.zeros_like(X); np.add.at(s, e[:, 0], X[e[:, 1]]); np.add.at(s, e[:, 1], X[e[:, 0]])
        X = 0.5 * X + 0.5 * np.where(grau[:, None] > 0, s / np.maximum(grau, 1)[:, None], X)
    return X
def por_id(X):
    U = np.zeros((nu,) + X.shape[1:]); np.add.at(U, uid, X); return U / np.bincount(uid, minlength=nu).reshape((-1,) + (1,) * (X.ndim - 1))

Pu, P2u = por_id(P), por_id(P2)
mov = np.linalg.norm(P2u - Pu, axis=1)
reg = np.clip(mov / LIM, 0, 1)
for _ in range(DIL):
    viz = np.zeros(nu); np.maximum.at(viz, e[:, 0], reg[e[:, 1]]); np.maximum.at(viz, e[:, 1], reg[e[:, 0]]); reg = np.maximum(reg, viz)
reg = suav(reg[:, None], 2)[:, 0]
print(f"REGIAO {int((reg > 0.5).sum())} pontos onde a forma 2D mexe")

# normais da cabeça já com a forma 2D (aproximação: normais da base)
nrm = np.empty(len(cab.data.vertices) * 3); cab.data.vertices.foreach_get("normal", nrm)
N = (Mw[:3, :3] @ nrm.reshape(-1, 3).T).T; Nu = por_id(N); Nu /= np.maximum(np.linalg.norm(Nu, axis=1), 1e-9)[:, None]

# geração do Meshy com a expressão, alinhada à neutra (ICP rígido com escala, aparado)
antes = set(cena.objects); bpy.ops.import_scene.gltf(filepath=EXPR)
nov = [o for o in cena.objects if o not in antes]; alvo = max((o for o in nov if o.type == "MESH"), key=lambda o: len(o.data.polygons))
for o in nov:
    if o != alvo: bpy.data.objects.remove(o, do_unlink=True)
alvo.parent = None
for o in cena.objects: o.select_set(o == alvo)
bpy.context.view_layer.objects.active = alvo; bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
md = alvo.modifiers.new("d", "DECIMATE"); md.ratio = min(1, 400000 / len(alvo.data.polygons)); bpy.ops.object.modifier_apply(modifier="d")
co = np.empty(len(alvo.data.vertices) * 3); alvo.data.vertices.foreach_get("co", co); Q = co.reshape(-1, 3)
# alinha pela região que NÃO mexe na expressão perto do rosto (nariz, testa), para cancelar o deslocamento local
kd = KDTree(len(Pu))
for i, p in enumerate(Pu): kd.insert(p, i)
kd.balance()
am = Q[np.random.default_rng(0).choice(len(Q), min(20000, len(Q)), replace=False)]; T = np.eye(4)
for _ in range(25):
    pr = np.array([kd.find(q)[0][:] for q in am]); d = np.linalg.norm(pr - am, axis=1); ok = d < np.percentile(d, 60)
    A_, B_ = am[ok], pr[ok]; ca, cb = A_.mean(0), B_.mean(0); U, Sv, Vt = np.linalg.svd((A_ - ca).T @ (B_ - cb))
    Dg = np.diag([1, 1, np.sign(np.linalg.det(Vt.T @ U.T))]); R = Vt.T @ Dg @ U.T; s = (Sv * np.diag(Dg)).sum() / ((A_ - ca) ** 2).sum()
    t = cb - s * R @ ca; am = (s * (R @ am.T)).T + t; M = np.eye(4); M[:3, :3] = s * R; M[:3, 3] = t; T = M @ T
Q = (T @ np.c_[Q, np.ones(len(Q))].T).T[:, :3]
alvo.data.vertices.foreach_set("co", Q.ravel()); alvo.data.update()
bvh = BVHTree.FromObject(alvo, bpy.context.evaluated_depsgraph_get())

# volume: deslocamento ao longo da normal entre a cabeça com a forma 2D e a geração do Meshy
dn = np.zeros(nu)
for i in np.nonzero(reg > 0.02)[0]:
    loc, _, _, dist = bvh.find_nearest(Vector(P2u[i]))
    if loc is not None and dist < 3 * HMAX: dn[i] = (np.array(loc) - P2u[i]) @ Nu[i]
dn = np.clip(dn, -HMAX, HMAX)
# só o volume local: tira a parte de baixa frequência (diferença de formato do rosto entre gerações)
FUNDO = int(os.environ.get("HIB_FUNDO", "25")); fundo = suav(dn[:, None] * reg[:, None], FUNDO)[:, 0] if FUNDO else 0 * dn
vol = suav(((dn - fundo) * reg)[:, None], SUAV)[:, 0]
print(f"VOLUME médio {np.abs(vol[reg > 0.5]).mean():.4f}, máximo {np.abs(vol).max():.4f}")
Dh = (P2u - Pu) + Nu * vol[:, None]
novo = (np.linalg.inv(Mw) @ np.c_[P + Dh[uid], np.ones(len(P))].T).T[:, :3]
if NOVA in kb: cab.shape_key_remove(kb[NOVA])
sk = cab.shape_key_add(name=NOVA); sk.data.foreach_set("co", novo.ravel())
bpy.data.objects.remove(alvo, do_unlink=True)
bpy.ops.wm.save_as_mainfile(filepath=f"{SAIDA}.blend")
for o in cena.objects: o.select_set(o == cab)
bpy.ops.export_scene.gltf(filepath=f"{SAIDA}.glb", export_format="GLB", use_selection=True, export_image_format="JPEG", export_morph=True)
print("PRONTO hibrido")
