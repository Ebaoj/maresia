# Troca a textura pintada do TRELLIS por cor chapada por região (paleta da folha aprovada).
# Cada face pega a cor da textura no centro, é classificada na cor mais próxima da paleta
# (peso menor para a luminosidade, porque a textura tem sombra pintada) e depois passa por um
# filtro de maioria entre vizinhas para tirar manchas. Também alisa uma caixa (ex.: o queixo).
# Uso: Blender -b --python chapado.py -- entrada.glb saida.glb [x0,x1,y0,y1,z0,z1 para alisar]
import bpy, bmesh, sys, colorsys
import numpy as np

a = sys.argv[sys.argv.index("--") + 1:]
entrada, saida = a[0], a[1]
caixa = [float(v) for v in a[2].split(",")] if len(a) > 2 else None

PALETA = {  # nome: hex (tabela medida na folha final, 16/10/2026)
    "pele": "#B26E41", "camisa": "#C38D7E", "calca": "#7E4A3A", "anil": "#324F58",
    "palha": "#D8C08E", "cordao": "#B8A058", "cabelo": "#1E1714", "olho": "#F2EEE4",
}
def rgb(h): return np.array([int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)])
def lab(c):  # aproximação de Lab via sRGB linear -> XYZ
    c = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = c @ M.T / np.array([0.9505, 1.0, 1.089])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)
nomes = list(PALETA); pal = np.array([rgb(PALETA[n]) for n in nomes]); pal_lab = lab(pal)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=entrada)
ob = next(o for o in bpy.context.scene.objects if o.type == "MESH")
me = ob.data
img = next(n.image for n in ob.active_material.node_tree.nodes if n.type == "TEX_IMAGE")
W, H = img.size
px = np.empty(W * H * 4, dtype=np.float32); img.pixels.foreach_get(px); px = px.reshape(H, W, 4)[..., :3]
# a textura é sRGB: pixels do Blender já vêm em espaço de cor da imagem (sRGB) para imagens 8 bits

bm = bmesh.new(); bm.from_mesh(me)
uv = bm.loops.layers.uv.active
bm.faces.ensure_lookup_table()
cores = np.zeros((len(bm.faces), 3))
for f in bm.faces:
    u = np.mean([l[uv].uv for l in f.loops], axis=0)
    x, y = int(np.clip(u[0], 0, 1) * (W - 1)), int(np.clip(u[1], 0, 1) * (H - 1))
    cores[f.index] = px[y, x]
L = lab(cores)
d = (L[:, None, 0] - pal_lab[None, :, 0]) ** 2 * 0.35 + ((L[:, None, 1:] - pal_lab[None, :, 1:]) ** 2).sum(-1)
rot = d.argmin(1)
# filtro de maioria (3 passadas) entre faces vizinhas
viz = [[g.index for e in f.edges for g in e.link_faces if g.index != f.index] for f in bm.faces]
for _ in range(3):
    novo = rot.copy()
    for i, vs in enumerate(viz):
        if vs:
            cont = np.bincount(rot[vs + [i]], minlength=len(nomes))
            novo[i] = cont.argmax()
    rot = novo
print("REGIOES:", {n: int((rot == k).sum()) for k, n in enumerate(nomes)})

# alisa a caixa (vértices dentro dela), mantendo a borda
if caixa:
    x0, x1, y0, y1, z0, z1 = caixa
    dentro = [v for v in bm.verts if x0 <= v.co.x <= x1 and y0 <= v.co.y <= y1 and z0 <= v.co.z <= z1]
    for _ in range(12):
        bmesh.ops.smooth_vert(bm, verts=dentro, factor=0.6, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    print("ALISADOS:", len(dentro))
bm.to_mesh(me); bm.free()

# um material chapado por região (sem textura)
me.materials.clear()
for n in nomes:
    m = bpy.data.materials.new(n); m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*[((c + 0.055) / 1.055) ** 2.4 if c > 0.04045 else c / 12.92 for c in rgb(PALETA[n])], 1)
    bsdf.inputs["Roughness"].default_value = 1.0
    me.materials.append(m)
for p in me.polygons: p.material_index = int(rot[p.index])
bpy.ops.export_scene.gltf(filepath=saida, export_format="GLB")
print("EXPORTADO", saida)
