# Troca a malha do gato por outra (ex.: a remalhada em quads pelo Meshy) no mesmo esqueleto e na mesma animação.
# A malha nova é alinhada à antiga pela caixa (escala uniforme + centro). Pesos:
#   copia: copiados da pele antiga (orelhas, crânio, escápula e pata direita já ajustados), pela face mais próxima;
#   calor: pesos automáticos do Blender numa cópia com as costuras soldadas (pele_calor.py).
# Uso: Blender -b --python troca_malha.py -- ANIMACAO.glb MALHA_NOVA.glb SAIDA.glb [copia|calor] [FPS] [TEXTURA_MAX]
import bpy, sys, os
from mathutils import Vector, Matrix
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

a = sys.argv[sys.argv.index("--") + 1:]
ANIM, NOVA, SAI = a[0], a[1], a[2]
MODO = a[3] if len(a) > 3 else "copia"
cena = bpy.context.scene; cena.render.fps = int(a[4]) if len(a) > 4 else 30
TEX = int(a[5]) if len(a) > 5 else 2048
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=ANIM)
arm = [o for o in cena.objects if o.type == "ARMATURE"][0]
velhas = [o for o in cena.objects if o.type == "MESH"]
m0 = max(velhas, key=lambda o: len(o.data.vertices))
antes = set(cena.objects)
bpy.ops.import_scene.gltf(filepath=NOVA)
m1 = max([o for o in cena.objects if o not in antes and o.type == "MESH"], key=lambda o: len(o.data.vertices))
for o in [o for o in cena.objects if o not in antes and o is not m1]: bpy.data.objects.remove(o, do_unlink=True)
arm.data.pose_position = "REST"; bpy.context.view_layer.update()

def caixa(o):
    dg = bpy.context.evaluated_depsgraph_get(); me = o.evaluated_get(dg).to_mesh()
    P = [o.matrix_world @ v.co for v in me.vertices]
    lo = Vector([min(p[i] for p in P) for i in range(3)]); hi = Vector([max(p[i] for p in P) for i in range(3)])
    o.evaluated_get(dg).to_mesh_clear(); return lo, hi
lo0, hi0 = caixa(m0); lo1, hi1 = caixa(m1)
s = sum((hi0[i] - lo0[i]) / (hi1[i] - lo1[i]) for i in range(3)) / 3
c0, c1 = (lo0 + hi0) / 2, (lo1 + hi1) / 2
T = Matrix.Translation(c0) @ Matrix.Diagonal((s, s, s, 1)) @ Matrix.Translation(-c1)
m1.data.transform(T @ m1.matrix_world); m1.matrix_world = Matrix.Identity(4)
m1.data.transform(m0.matrix_world.inverted()); m1.matrix_world = m0.matrix_world.copy()
print(f"alinhada: escala {s:.3f}")

if MODO == "copia":
    for g in m0.vertex_groups: m1.vertex_groups.new(name=g.name)
    mod = m1.modifiers.new("DT", "DATA_TRANSFER"); mod.object = m0
    mod.use_vert_data = True; mod.data_types_verts = {"VGROUP_WEIGHTS"}; mod.vert_mapping = "POLYINTERP_NEAREST"
    mod.layers_vgroup_select_src = "ALL"; mod.layers_vgroup_select_dst = "NAME"
    bpy.ops.object.select_all(action="DESELECT"); m1.select_set(True); bpy.context.view_layer.objects.active = m1
    bpy.ops.object.modifier_apply(modifier="DT")
else:
    from pele_calor import pele_calor
    print("vértices sem peso:", pele_calor(arm, m1))
    arm.data.pose_position = "REST"
# liga ao esqueleto e tira a malha antiga
for mod in list(m1.modifiers): m1.modifiers.remove(mod)
mw = m1.matrix_world.copy(); m1.parent = arm; m1.matrix_world = mw
am = m1.modifiers.new("Armature", "ARMATURE"); am.object = arm
for o in velhas: bpy.data.objects.remove(o, do_unlink=True)
# texturas no máximo TEX px (a remalha vem com 4K)
for img in bpy.data.images:
    if img.size[0] > TEX: img.scale(TEX, int(img.size[1] * TEX / img.size[0]))
arm.data.pose_position = "POSE"
semp = sum(1 for v in m1.data.vertices if not v.groups)
print(f"TROCA {MODO}: {len(m1.data.vertices)} vértices, {len(m1.vertex_groups)} grupos, {semp} sem peso")
bpy.ops.export_scene.gltf(filepath=SAI, export_format="GLB", export_animations=True, export_animation_mode="ACTIVE_ACTIONS")
