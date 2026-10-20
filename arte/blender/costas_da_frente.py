# Costas de uma peça do Tripo pintadas a partir da frente (o Tripo inventa as costas e elas saem borradas).
# Espelha a peça frente<->costas, e a frente espelhada é transferida (bake) para as faces de trás da peça original.
# A malha não muda; só a textura. Serve para peça quase simétrica (camisa listrada, calça).
# Uso: Blender -b --python blender/costas_da_frente.py -- ENTRADA.glb SAIDA.glb
#   COSTAS_PROTEGE_GOLA (0.10: fração da altura, no alto e no meio, que fica como está; a frente tem botão)
#   COSTAS_RES (textura da peça)  COSTAS_DIST (0.04 da altura: alcance do raio)
import bpy, sys, os
import numpy as np

a = sys.argv[sys.argv.index("--") + 1:]
ENTRADA, SAIDA = a[0], a[1]
GOLA = float(os.environ.get("COSTAS_PROTEGE_GOLA", "0.10")); DIST = float(os.environ.get("COSTAS_DIST", "0.04"))
cena = bpy.context.scene
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=ENTRADA)
for o in list(cena.objects):
    if o.type != "MESH" or len(o.data.vertices) < 100: bpy.data.objects.remove(o, do_unlink=True)
peca = next(o for o in cena.objects if o.type == "MESH")
peca.parent = None


def ativar(*obs):
    for o in cena.objects: o.select_set(False)
    for o in obs: o.select_set(True)
    bpy.context.view_layer.objects.active = obs[-1]


ativar(peca); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
P = np.array([v.co for v in peca.data.vertices])
# eixo da frente: o Tripo põe a largura no maior eixo horizontal e a frente no outro (+X no glTF importado)
eixo = 0 if np.ptp(P[:, 1]) > np.ptp(P[:, 0]) else 1
lado = 1 - eixo
h = np.ptp(P[:, 2]); centro = (P[:, eixo].max() + P[:, eixo].min()) / 2
print("FRENTE no eixo", "XY"[eixo], "centro", round(centro, 4), "altura", round(h, 3))
img0 = next(i for i in bpy.data.images if i.size[0] > 256)
RES = int(os.environ.get("COSTAS_RES", img0.size[0]))

# fonte: cópia espelhada (a frente vai para trás); normais invertidas pelo espelho são corrigidas
fonte = peca.copy(); fonte.data = peca.data.copy(); cena.collection.objects.link(fonte)
co = P.copy(); co[:, eixo] = 2 * centro - co[:, eixo]
fonte.data.vertices.foreach_set("co", co.ravel()); fonte.data.update()
ativar(fonte); bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.flip_normals(); bpy.ops.object.mode_set(mode="OBJECT")

# alvo: só as faces de trás da peça original (a frente fica intocada), menos o meio da gola
alvo = peca.copy(); alvo.data = peca.data.copy(); cena.collection.objects.link(alvo)
ztop = P[:, 2].max(); wl = np.ptp(P[:, lado]); cl = (P[:, lado].max() + P[:, lado].min()) / 2
apagar = []
for f in alvo.data.polygons:
    c = np.array(f.center)
    frente = c[eixo] > centro
    gola = c[2] > ztop - GOLA * h and abs(c[lado] - cl) < 0.18 * wl
    if frente or gola: apagar.append(f.index)
import bmesh
bm = bmesh.new(); bm.from_mesh(alvo.data); bm.faces.ensure_lookup_table()
bmesh.ops.delete(bm, geom=[bm.faces[i] for i in apagar], context="FACES"); bm.to_mesh(alvo.data); bm.free()
print("COSTAS", len(alvo.data.polygons), "faces de", len(peca.data.polygons))

nova = bpy.data.images.new("costas", RES, RES, alpha=True); nova.generated_color = (0, 0, 0, 0)
mat_alvo = alvo.data.materials[0].copy(); alvo.data.materials[0] = mat_alvo
no = mat_alvo.node_tree.nodes.new("ShaderNodeTexImage"); no.image = nova
mat_alvo.node_tree.nodes.active = no
cena.render.engine = "CYCLES"; cena.cycles.samples = 1; cena.cycles.device = "CPU"
b = cena.render.bake
b.use_pass_direct = b.use_pass_indirect = False; b.use_pass_color = True
b.use_selected_to_active = True; b.cage_extrusion = DIST * h; b.max_ray_distance = 2 * DIST * h; b.margin = 6
ativar(fonte, alvo)
bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR"})

# junta: onde o bake escreveu, as costas novas; no resto, a textura original
A = np.array(img0.pixels[:]).reshape(img0.size[1], img0.size[0], 4)
B = np.array(nova.pixels[:]).reshape(RES, RES, 4)
if B.shape != A.shape:
    import math
    sy, sx = A.shape[0] / RES, A.shape[1] / RES
    B = B[(np.arange(A.shape[0]) / sy).astype(int)][:, (np.arange(A.shape[1]) / sx).astype(int)]
m = B[..., 3:4]
print("TEXELS refeitos", round(float((m > 0.5).mean()) * 100, 1), "%")
C = A.copy(); C[..., :3] = m * B[..., :3] + (1 - m) * A[..., :3]
img0.pixels[:] = C.ravel(); img0.update()

for o in (fonte, alvo): bpy.data.objects.remove(o, do_unlink=True)
ativar(peca)
bpy.ops.export_scene.gltf(filepath=SAIDA, export_format="GLB", use_selection=True, export_image_format="JPEG")
print("PRONTO costas")
