# Troca as mãos de um corpo com esqueleto (pose T, mixamorig, braços em X) por uma mão detalhada separada (Meshy,
# gerada em pé: dedos para +Z, dorso para -Y, mão DIREITA com polegar em -X). A mão é girada para cada lado (espelhada
# para a esquerda), alinhada sobre a mão do corpo (ICP com escala), as duas são cortadas no punho com uma pequena
# sobreposição, a borda da mão encosta no antebraço, e os pesos saem da distância a cada osso do antebraço, da mão
# e dos dedos daquele lado (o calor do Blender não convergia). Cada mão fica como objeto próprio.
# Uso: Blender -b CORPO.blend --python blender/trocar_maos.py -- MAO.glb SAIDA_PREFIXO
#   MAO_MACIEZ (0.004 m)  MAO_FACES (12000)  MAO_CORTE (0.012 m além do osso Hand, para o lado dos dedos)  MAO_SOBRA (0.01)  MAO_FAIXA (0.02)
import bpy, sys, os
import numpy as np
from mathutils import Vector, Matrix
from mathutils.kdtree import KDTree
from mathutils.bvhtree import BVHTree

a = sys.argv[sys.argv.index("--") + 1:]
MAO, SAIDA = a[0], a[1]
FACES = int(os.environ.get("MAO_FACES", "12000")); CORTE = float(os.environ.get("MAO_CORTE", "0.012"))
SOBRA = float(os.environ.get("MAO_SOBRA", "0.01")); FAIXA = float(os.environ.get("MAO_FAIXA", "0.02"))
cena = bpy.context.scene
rig = bpy.data.objects["neto-esqueleto"]; corpo = bpy.data.objects["neto"]
def osso(n): return np.array(rig.matrix_world @ rig.data.bones["mixamorig:" + n].head_local)
def pts(o):
    co = np.empty(len(o.data.vertices) * 3); o.data.vertices.foreach_get("co", co)
    return (np.array(o.matrix_world) @ np.c_[co.reshape(-1, 3), np.ones(len(o.data.vertices))].T).T[:, :3]
def ativar(o):
    for x in cena.objects: x.select_set(x == o)
    bpy.context.view_layer.objects.active = o
def apagar(ob, mascara):
    import bmesh
    bm = bmesh.new(); bm.from_mesh(ob.data); bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.verts[i] for i in np.nonzero(mascara)[0]], context="VERTS"); bm.to_mesh(ob.data); bm.free(); ob.data.update()

# mão detalhada: solda e reduz uma vez
antes = set(cena.objects); bpy.ops.import_scene.gltf(filepath=MAO)
nov = [o for o in cena.objects if o not in antes]; base = max((o for o in nov if o.type == "MESH"), key=lambda o: len(o.data.polygons))
for o in nov:
    if o != base: bpy.data.objects.remove(o, do_unlink=True)
base.parent = None; ativar(base); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT"); bpy.ops.mesh.remove_doubles(threshold=1e-4)
bpy.ops.object.mode_set(mode="OBJECT")
md = base.modifiers.new("d", "DECIMATE"); md.ratio = min(1, FACES / len(base.data.polygons)); bpy.ops.object.modifier_apply(modifier="d")
Pm = pts(base); print(f"MAO base {len(base.data.polygons)} faces")

for lado, sx in (("Left", 1), ("Right", -1)):
    mao = base.copy(); mao.data = base.data.copy(); cena.collection.objects.link(mao)
    # dedos (+Z da mão) -> ao longo do braço (sx*X); dorso (-Y) -> cima (+Z); polegar (-X) -> frente (-Y)
    R = np.array([[0, 0, sx], [1, 0, 0], [0, -1, 0]], float)
    Pc = pts(corpo); wx = osso(lado + "Hand")[0]
    alvo = Pc[(Pc[:, 0] * sx > abs(wx) - 0.01) & (np.abs(Pc[:, 2] - osso(lado + "Hand")[2]) < 0.08)]
    Q = Pm @ R.T
    s0 = np.ptp(alvo[:, 1]) / np.ptp(Q[:, 1])
    Q = Q * s0; ponta = Q[np.argmax(Q[:, 0] * sx)]; t0 = alvo[np.argmax(alvo[:, 0] * sx)] - ponta
    T = np.eye(4); T[:3, :3] = R * s0; T[:3, 3] = t0
    Qa = (T @ np.c_[Pm, np.ones(len(Pm))].T).T[:, :3]
    kd = KDTree(len(alvo))
    for i, p in enumerate(alvo): kd.insert(p, i)
    kd.balance(); rng = np.random.default_rng(0)
    for _ in range(40):
        sel = Qa[Qa[:, 0] * sx > abs(wx) - 0.005]; am = sel[rng.choice(len(sel), min(6000, len(sel)), replace=False)]
        pr = np.array([kd.find(q)[0][:] for q in am]); d = np.linalg.norm(pr - am, axis=1); ok = d < np.percentile(d, 70)
        A_, B_ = am[ok], pr[ok]; ca, cb = A_.mean(0), B_.mean(0); U, S, Vt = np.linalg.svd((A_ - ca).T @ (B_ - cb))
        D = np.diag([1, 1, np.sign(np.linalg.det(Vt.T @ U.T))]); Rr = Vt.T @ D @ U.T; s = (S * np.diag(D)).sum() / ((A_ - ca) ** 2).sum()
        t = cb - s * Rr @ ca; M = np.eye(4); M[:3, :3] = s * Rr; M[:3, 3] = t; T = M @ T
        Qa = (T @ np.c_[Pm, np.ones(len(Pm))].T).T[:, :3]
    print(f"ALINHADA {lado}: erro mediano {np.median(d[ok]) * 1000:.1f} mm")
    mao.data.vertices.foreach_set("co", Qa.ravel()); mao.matrix_world = Matrix.Identity(4); mao.data.update()
    if np.linalg.det(R) < 0:   # espelhada: normais para dentro
        ativar(mao); bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT"); bpy.ops.mesh.flip_normals(); bpy.ops.object.mode_set(mode="OBJECT")
    # cortes no punho
    xc = abs(wx) + CORTE
    Pc = pts(corpo); apagar(corpo, (Pc[:, 0] * sx > xc) & (np.abs(Pc[:, 2] - osso(lado + "Hand")[2]) < 0.1))
    Pq = pts(mao); apagar(mao, Pq[:, 0] * sx < xc - SOBRA)
    # emenda: a borda da mão encosta na superfície do antebraço
    Pq = pts(mao); bvh = BVHTree.FromObject(corpo, bpy.context.evaluated_depsgraph_get())
    w = np.clip(1 - (Pq[:, 0] * sx - (xc - SOBRA)) / FAIXA, 0, 1); n = 0
    for i in np.nonzero(w > 0)[0]:
        loc, _, _, dist = bvh.find_nearest(Vector(Pq[i]))
        if loc is not None and dist < 0.03: Pq[i] += (np.array(loc) - Pq[i]) * w[i]; n += 1
    mao.data.vertices.foreach_set("co", Pq.ravel()); mao.data.update()
    print(f"EMENDA {lado}: {n} vértices")
    # pesos pela distância ao segmento de cada osso (o calor do Blender não converge nesta malha): antebraço, mão e
    # cada falange deste lado; a falange mais perto domina e há mistura suave perto das juntas
    segs = []
    for b in rig.data.bones:
        nome = b.name.split(":")[-1]
        if nome.startswith(lado + "Hand") or nome == lado + "ForeArm":
            if nome[-1] == "4": continue   # ponta, não deforma
            segs.append((b.name, np.array(rig.matrix_world @ b.head_local), np.array(rig.matrix_world @ b.tail_local)))
    Pq = pts(mao); Dm = np.zeros((len(Pq), len(segs)))
    for k, (_, h, t) in enumerate(segs):
        v = t - h; tt = np.clip(((Pq - h) @ v) / (v @ v), 0, 1); Dm[:, k] = np.linalg.norm(Pq - (h + tt[:, None] * v), axis=1)
    W = np.exp(-(Dm - Dm.min(1, keepdims=True)) / float(os.environ.get("MAO_MACIEZ", "0.004")))
    W[W < 0.02] = 0; W /= W.sum(1, keepdims=True)
    mao.vertex_groups.clear()
    for k, (nome, _, _) in enumerate(segs):
        g = mao.vertex_groups.new(name=nome)
        for i in np.nonzero(W[:, k] > 0)[0]: g.add([int(i)], float(W[i, k]), "REPLACE")
    mao.parent = rig; mao.matrix_parent_inverse = rig.matrix_world.inverted()
    mdm = mao.modifiers.new("Armature", "ARMATURE"); mdm.object = rig
    print(f"PESOS {lado}: {len(segs)} ossos")
    mao.name = mao.data.name = "neto-mao-" + ("esq" if sx > 0 else "dir")
bpy.data.objects.remove(base, do_unlink=True)
bpy.ops.wm.save_as_mainfile(filepath=f"{SAIDA}.blend")
print("PRONTO maos")
