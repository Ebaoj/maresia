# Junta os vários materiais de cada malha (modelo em partes do Tripo) numa textura só por malha:
# cada material vira um retângulo do atlas, do tamanho proporcional à área que cobre no corpo,
# e as UVs das faces dele são levadas para esse retângulo. No fim, um material e um desenho por malha.
# Uso: Blender -b ARQUIVO.blend --python blender/atlas.py -- SAIDA_PREFIXO
import bpy, bmesh, sys, os, math
import numpy as np

saida = sys.argv[sys.argv.index("--") + 1]
LADO = {"corpo": 4096, "camisa": 2048, "calca": 2048}
MARGEM = 4


def imagem_do_material(m):
    if not m or not m.use_nodes: return None
    for n in m.node_tree.nodes:
        if n.type == "TEX_IMAGE" and n.image:
            for l in n.outputs["Color"].links:
                if l.to_socket.name == "Base Color": return n.image
    return next((n.image for n in m.node_tree.nodes if n.type == "TEX_IMAGE" and n.image), None)


def empacotar(tams, lado):
    """Prateleiras: retângulos quadrados (potência de 2) do maior para o menor."""
    ordem = sorted(range(len(tams)), key=lambda i: -tams[i]); pos = [None] * len(tams)
    x = y = alt = 0
    for i in ordem:
        t = tams[i]
        if x + t > lado: x, y, alt = 0, y + alt, 0
        if y + t > lado: return None
        pos[i] = (x, y); x += t; alt = max(alt, t)
    return pos


for ob in [o for o in bpy.context.scene.objects if o.type == "MESH" and len(o.data.materials) > 1]:
    peca = ob.name.split("-")[-1]; lado = LADO.get(peca, 2048)
    me = ob.data; mats = list(me.materials)
    # área 3D de cada material
    area = np.zeros(len(mats))
    for p in me.polygons: area[p.material_index] += p.area
    share = area / area.sum()
    escala = 1.0
    while True:   # tamanho de cada retângulo: proporcional à raiz da área, potência de 2, cabe no atlas
        tams = [int(2 ** max(6, min(11, round(math.log2(max(math.sqrt(s) * lado * escala, 64)))))) for s in share]
        pos = empacotar(tams, lado)
        if pos: break
        escala *= 0.85
    atlas = np.zeros((lado, lado, 4), dtype=np.float32); atlas[..., 3] = 1
    for i, m in enumerate(mats):
        im = imagem_do_material(m)
        t = tams[i]; x0, y0 = pos[i]
        if im is None:
            continue
        w, h = im.size
        px = np.empty(w * h * 4, dtype=np.float32); im.pixels.foreach_get(px); px = px.reshape(h, w, 4)
        # reamostra para t x t (vizinho mais próximo basta: o atlas já é menor que a origem)
        ys = (np.arange(t) * h / t).astype(int); xs = (np.arange(t) * w / t).astype(int)
        atlas[y0:y0 + t, x0:x0 + t] = px[ys][:, xs]
    # UVs: cada face vai para o retângulo do seu material (com margem para não sangrar)
    uv = me.uv_layers.active.data
    for p in me.polygons:
        t = tams[p.material_index]; x0, y0 = pos[p.material_index]
        for li in p.loop_indices:
            u, v = uv[li].uv
            u = min(max(u - math.floor(u) if u > 1 or u < 0 else u, 0), 1); v = min(max(v - math.floor(v) if v > 1 or v < 0 else v, 0), 1)
            uv[li].uv = ((x0 + MARGEM + u * (t - 2 * MARGEM)) / lado, (y0 + MARGEM + v * (t - 2 * MARGEM)) / lado)
    img = bpy.data.images.new(f"{ob.name}-atlas", lado, lado); img.pixels.foreach_set(atlas.ravel())
    img.filepath_raw = f"{saida}-{ob.name}.png"; img.file_format = "PNG"; img.save(); img.pack()
    mt = bpy.data.materials.new(ob.name); mt.use_nodes = True
    nt = mt.node_tree; bs = nt.nodes["Principled BSDF"]; bs.inputs["Roughness"].default_value = 1; bs.inputs["Metallic"].default_value = 0
    tx = nt.nodes.new("ShaderNodeTexImage"); tx.image = img; nt.links.new(tx.outputs["Color"], bs.inputs["Base Color"])
    for p in me.polygons: p.material_index = 0
    me.materials.clear(); me.materials.append(mt)
    print(f"ATLAS {ob.name}: {len(mats)} materiais -> 1 ({lado}px), retângulos {sorted(set(tams), reverse=True)}")

for o in bpy.context.scene.objects: o.select_set(o.type in ("MESH", "ARMATURE") and o.name not in ("cam",))
bpy.ops.export_scene.gltf(filepath=f"{saida}.glb", export_format="GLB", use_selection=True, export_image_format="JPEG")
bpy.ops.wm.save_as_mainfile(filepath=f"{saida}.blend")
print("PRONTO atlas")
