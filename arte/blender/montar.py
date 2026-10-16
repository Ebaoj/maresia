# Monta o neto final: corpo em pose T + cabeça gerada à parte, escala de 1,68 m, polígonos reduzidos.
# Uso: Blender -b --python montar.py -- corpo.glb cabeca.glb saida_sem_extensao [tri_corpo tri_cabeca]
# Saídas: <saida>.glb (jogo), <saida>.fbx (Mixamo, textura embutida), <saida>.blend
import bpy, bmesh, sys
import numpy as np
from mathutils import Vector

a = sys.argv[sys.argv.index("--") + 1:]
CORPO, CABECA, SAIDA = a[0], a[1], a[2]
TRI_CORPO = int(a[3]) if len(a) > 3 else 10000
TRI_CABECA = int(a[4]) if len(a) > 4 else 4000
ALTURA = 1.68

bpy.ops.wm.read_factory_settings(use_empty=True)
def importar(caminho, nome):
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=caminho)
    ob = next(o for o in set(bpy.data.objects) - antes if o.type == "MESH")
    ob.name = nome
    bpy.ops.object.select_all(action="DESELECT"); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return ob

def vertices(ob):
    v = np.empty(len(ob.data.vertices) * 3); ob.data.vertices.foreach_get("co", v); return v.reshape(-1, 3)

def pescoco(v, z0, z1, raio):
    """Altura do pescoço: a fatia mais estreita (em X, perto do eixo) entre z0 e z1."""
    melhor = None
    for z in np.linspace(z0, z1, 60):
        s = v[(np.abs(v[:, 2] - z) < 0.004) & (np.abs(v[:, 0]) < raio)]
        if len(s) < 6: continue
        larg = s[:, 0].max() - s[:, 0].min()
        if melhor is None or larg < melhor[1]: melhor = (z, larg, s[:, 0].mean(), s[:, 1].mean())
    return melhor

def cortar(ob, z, manter_acima):
    bm = bmesh.new(); bm.from_mesh(ob.data)
    fora = [vv for vv in bm.verts if (vv.co.z < z) == manter_acima]
    bmesh.ops.delete(bm, geom=fora, context="VERTS"); bm.to_mesh(ob.data); bm.free()

corpo = importar(CORPO, "corpo")
cab = importar(CABECA, "cabeca")
vc, vh = vertices(corpo), vertices(cab)
topo_c, base_c = vc[:, 2].max(), vc[:, 2].min()
alt_c = topo_c - base_c
# pescoço do corpo: entre 78% e 90% da altura, perto do eixo (os braços em T ficam de fora pelo raio)
pc = pescoco(vc, base_c + 0.78 * alt_c, base_c + 0.90 * alt_c, 0.06)
# pescoço da cabeça: na metade de baixo do modelo da cabeça
topo_h, base_h = vh[:, 2].max(), vh[:, 2].min()
ph = pescoco(vh, base_h + 0.12 * (topo_h - base_h), base_h + 0.45 * (topo_h - base_h), 0.25)
print(f"PESCOCO corpo z={pc[0]:.3f} largura={pc[1]:.3f} | cabeca z={ph[0]:.3f} largura={ph[1]:.3f}")

# escala da cabeça: a cabeça nova ocupa a mesma altura (pescoço ao topo) que a cabeça original do corpo
esc = (topo_c - pc[0]) / (topo_h - ph[0])
cab.scale = (esc, esc, esc); bpy.ops.object.select_all(action="DESELECT"); cab.select_set(True)
bpy.context.view_layer.objects.active = cab; bpy.ops.object.transform_apply(scale=True)
vh = vertices(cab); ph2 = pescoco(vh, vh[:, 2].min() + 0.12 * np.ptp(vh[:, 2]), vh[:, 2].min() + 0.45 * np.ptp(vh[:, 2]), 0.25 * esc)
cab.location = Vector((pc[2] - ph2[2], pc[3] - ph2[3], pc[0] - ph2[0]))
bpy.ops.object.transform_apply(location=True)
print(f"CABECA escala={esc:.3f} largura do pescoço nova={ph2[1]*1:.3f} x corpo {pc[1]:.3f}")

# corta: corpo fica abaixo do pescoço; cabeça fica acima de um pouco abaixo do pescoço (sobreposição)
cortar(corpo, pc[0] + 0.004, manter_acima=False)
cortar(cab, pc[0] - 0.012, manter_acima=True)

# reduz polígonos
for ob, alvo in ((corpo, TRI_CORPO), (cab, TRI_CABECA)):
    tri = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    m = ob.modifiers.new("reduz", "DECIMATE"); m.ratio = min(1.0, alvo / tri)
    bpy.ops.object.select_all(action="DESELECT"); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier="reduz")
    print(f"REDUZ {ob.name}: {tri} -> {sum(len(p.vertices) - 2 for p in ob.data.polygons)} triângulos")

# junta, põe os pés no chão, centraliza e escala para 1,68 m
bpy.ops.object.select_all(action="DESELECT"); corpo.select_set(True); cab.select_set(True)
bpy.context.view_layer.objects.active = corpo; bpy.ops.object.join(); neto = corpo; neto.name = "neto"
v = vertices(neto); k = ALTURA / np.ptp(v[:, 2])
neto.location = Vector((-(v[:, 0].min() + v[:, 0].max()) / 2 * k, -(v[:, 1].min() + v[:, 1].max()) / 2 * k, -v[:, 2].min() * k))
neto.scale = (k, k, k); bpy.ops.object.transform_apply(location=True, scale=True)
v = vertices(neto)
print(f"FINAL altura={np.ptp(v[:, 2]):.3f} m envergadura={np.ptp(v[:, 0]):.3f} m triângulos={sum(len(p.vertices) - 2 for p in neto.data.polygons)}")

bpy.ops.export_scene.gltf(filepath=SAIDA + ".glb", export_format="GLB")
bpy.ops.export_scene.fbx(filepath=SAIDA + ".fbx", path_mode="COPY", embed_textures=True, apply_scale_options="FBX_SCALE_UNITS")
bpy.ops.wm.save_as_mainfile(filepath=SAIDA + ".blend")
print("EXPORTADO", SAIDA)
