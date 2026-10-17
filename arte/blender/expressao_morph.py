# Expressão como forma (shape key) a partir de uma segunda geração do Meshy da mesma cabeça:
# a cabeça neutra é reduzida a peso de jogo e "vestida" sobre a cabeça com a expressão (alinhamento rígido com
# escala + ponto mais perto na superfície), e o deslocamento vira shape key. Só a pele do rosto mexe
# (máscara pela cor da textura: cabelo escuro fica parado; pescoço abaixo do queixo também), e o deslocamento
# é suavizado na malha para não trazer o ruído da outra geração.
# Uso: Blender -b --python blender/expressao_morph.py -- NEUTRA.glb SAIDA_PREFIXO nome=EXPRESSAO.glb [nome2=...]
#   EXPR_FACES (60000 faces na neutra)  EXPR_SUAVIZA (12)  EXPR_MAX (0.06: deslocamento máximo, em unidades da cabeça)
#   EXPR_PELE (0.18: luminância mínima para contar como pele)  EXPR_QUEIXO (0.30: fração da altura abaixo da qual não mexe)
import bpy, sys, os, math
import numpy as np
from mathutils import Vector, Matrix
from mathutils.kdtree import KDTree
from mathutils.bvhtree import BVHTree

a = sys.argv[sys.argv.index("--") + 1:]
NEUTRA, SAIDA, EXPRS = a[0], a[1], [x.split("=", 1) for x in a[2:]]
FACES = int(os.environ.get("EXPR_FACES", "60000")); SUAV = int(os.environ.get("EXPR_SUAVIZA", "12"))
DMAX = float(os.environ.get("EXPR_MAX", "0.06")); PELE = float(os.environ.get("EXPR_PELE", "0.18"))
QUEIXO = float(os.environ.get("EXPR_QUEIXO", "0.30"))
cena = bpy.context.scene
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)


def importar(arq):
    antes = set(cena.objects); bpy.ops.import_scene.gltf(filepath=arq)
    novos = [o for o in cena.objects if o not in antes]
    m = max((o for o in novos if o.type == "MESH"), key=lambda o: len(o.data.polygons))
    for o in novos:
        if o != m: bpy.data.objects.remove(o, do_unlink=True)
    m.parent = None
    for o in cena.objects: o.select_set(o == m)
    bpy.context.view_layer.objects.active = m
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return m


def reduzir(ob, faces):
    # solda antes: o Meshy separa a malha nas costuras de UV, e reduzir sem soldar estilhaça essas costuras
    # (a expressão abre rachaduras ali). O UV fica nos loops, a solda não estraga a textura.
    bpy.context.view_layer.objects.active = ob; bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT"); bpy.ops.mesh.remove_doubles(threshold=1e-4); bpy.ops.object.mode_set(mode="OBJECT")
    r = min(1.0, faces / max(len(ob.data.polygons), 1))
    if r >= 1: return
    md = ob.modifiers.new("dec", "DECIMATE"); md.ratio = r
    bpy.context.view_layer.objects.active = ob; bpy.ops.object.modifier_apply(modifier=md.name)


def pontos(ob):
    co = np.empty(len(ob.data.vertices) * 3); ob.data.vertices.foreach_get("co", co); return co.reshape(-1, 3)


neutra = importar(NEUTRA); neutra.name = "cabeca"
reduzir(neutra, FACES)
P = pontos(neutra)
print(f"NEUTRA {len(neutra.data.polygons)} faces, {len(P)} vértices")

# máscara de pele: cor da textura em cada vértice (imagem reduzida para ler rápido)
img = neutra.active_material.node_tree.nodes.get("Image Texture").image
peq = img.copy(); peq.scale(1024, 1024)
px = np.array(peq.pixels[:]).reshape(1024, 1024, 4)
uv = np.zeros((len(P), 2)); cont = np.zeros(len(P))
uvl = neutra.data.uv_layers.active.data
for poly in neutra.data.polygons:
    for li in poly.loop_indices:
        v = neutra.data.loops[li].vertex_index; uv[v] += uvl[li].uv; cont[v] += 1
uv /= np.maximum(cont, 1)[:, None]
cor = px[np.clip((uv[:, 1] * 1023).astype(int), 0, 1023), np.clip((uv[:, 0] * 1023).astype(int), 0, 1023), :3]
lum = cor @ np.array([0.2126, 0.7152, 0.0722])
zmin, zmax = P[:, 2].min(), P[:, 2].max(); h = zmax - zmin
pele = np.clip((lum - PELE) / 0.06, 0, 1)
abaixo = np.clip((P[:, 2] - (zmin + QUEIXO * h)) / (0.06 * h), 0, 1)   # pescoço parado
mascara = pele * abaixo
print(f"MASCARA {int((mascara > 0.5).sum())} vértices de pele do rosto")

# vizinhança na malha neutra (para suavizar deslocamento e máscara)
e = np.empty(len(neutra.data.edges) * 2, dtype=np.int64); neutra.data.edges.foreach_get("vertices", e); e = e.reshape(-1, 2)
grau = np.bincount(e.ravel(), minlength=len(P)).astype(float)


def suavizar(X, vezes):
    for _ in range(vezes):
        s = np.zeros_like(X); np.add.at(s, e[:, 0], X[e[:, 1]]); np.add.at(s, e[:, 1], X[e[:, 0]])
        X = 0.5 * X + 0.5 * np.where(grau[:, None] > 0, s / np.maximum(grau, 1)[:, None], X)
    return X


mascara = suavizar(mascara[:, None], 4)[:, 0]


def kabsch(A, B):
    """B ~ s R A + t"""
    ca, cb = A.mean(0), B.mean(0); A0, B0 = A - ca, B - cb
    U, S, Vt = np.linalg.svd(A0.T @ B0); d = np.sign(np.linalg.det(Vt.T @ U.T))
    D = np.diag([1, 1, d]); R = Vt.T @ D @ U.T; s = (S * np.diag(D)).sum() / (A0 ** 2).sum()
    return s, R, cb - s * R @ ca


neutra.shape_key_add(name="Basis")
for nome, arq in EXPRS:
    alvo = importar(arq); reduzir(alvo, 400000)
    Q = pontos(alvo)
    # alinha a expressão à neutra pelo crânio e pelo rosto todo (ICP com escala, aparando os 40% piores pares)
    kd = KDTree(len(P))
    for i, p in enumerate(P): kd.insert(p, i)
    kd.balance()
    amostra = Q[np.random.default_rng(0).choice(len(Q), min(20000, len(Q)), replace=False)]
    T = np.eye(4)
    for it in range(25):
        pares = np.array([kd.find(q)[0][:] for q in amostra]); dist = np.linalg.norm(pares - amostra, axis=1)
        ok = dist < np.percentile(dist, 60)
        s, R, t = kabsch(amostra[ok], pares[ok])
        amostra = (s * (R @ amostra.T)).T + t
        M = np.eye(4); M[:3, :3] = s * R; M[:3, 3] = t; T = M @ T
    alvo.matrix_world = Matrix(T.tolist()) @ alvo.matrix_world
    bpy.context.view_layer.update()
    print(f"ALINHADO {nome}: erro mediano {np.median(dist[ok]):.4f}")
    # ponto mais perto na superfície da expressão
    dg = bpy.context.evaluated_depsgraph_get()
    bvh = BVHTree.FromObject(alvo, dg)   # em coordenadas locais do objeto
    Mi = alvo.matrix_world.inverted(); Mw = alvo.matrix_world
    D = np.zeros_like(P)
    for i, p in enumerate(P):
        loc, _, _, _ = bvh.find_nearest(Mi @ Vector(p))
        if loc is not None: D[i] = np.array(Mw @ loc) - p
    n = np.linalg.norm(D, axis=1); D[n > DMAX] *= (DMAX / n[n > DMAX])[:, None]
    D = suavizar(D * mascara[:, None], SUAV)
    print(f"FORMA {nome}: deslocamento médio {np.linalg.norm(D, axis=1)[mascara > 0.5].mean():.4f}, máximo {np.linalg.norm(D, axis=1).max():.4f}")
    sk = neutra.shape_key_add(name=nome); sk.data.foreach_set("co", (P + D).ravel())
    bpy.data.objects.remove(alvo, do_unlink=True)

bpy.ops.wm.save_as_mainfile(filepath=f"{SAIDA}.blend")
for o in cena.objects: o.select_set(o == neutra)
bpy.ops.export_scene.gltf(filepath=f"{SAIDA}.glb", export_format="GLB", use_selection=True, export_image_format="JPEG",
                          export_morph=True)
print("PRONTO expressao")
