# Prepara um modelo pesado (Meshy) para o auto-rig: solda as costuras de UV, reduz a malha e encolhe a textura.
# Uso: Blender -b --python blender/preparar_rig.py -- ENTRADA.glb SAIDA.glb   PREP_FACES (50000)  PREP_TEX (2048)
import bpy, sys, os
a = sys.argv[sys.argv.index("--") + 1:]
FACES = int(os.environ.get("PREP_FACES", "50000")); TEX = int(os.environ.get("PREP_TEX", "2048"))
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=a[0])
ms = [o for o in bpy.context.scene.objects if o.type == "MESH"]
m = max(ms, key=lambda o: len(o.data.polygons))
for o in list(bpy.context.scene.objects):
    if o != m: bpy.data.objects.remove(o, do_unlink=True)
m.parent = None
for o in bpy.context.scene.objects: o.select_set(o == m)
bpy.context.view_layer.objects.active = m
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT"); bpy.ops.mesh.remove_doubles(threshold=1e-4)
bpy.ops.object.mode_set(mode="OBJECT")
antes = len(m.data.polygons)
md = m.modifiers.new("d", "DECIMATE"); md.ratio = min(1, FACES / antes); bpy.ops.object.modifier_apply(modifier="d")
for im in bpy.data.images:
    if im.size[0] > TEX: im.scale(TEX, TEX)
print(f"PREPARADO {antes} -> {len(m.data.polygons)} faces")
bpy.ops.export_scene.gltf(filepath=a[1], export_format="GLB", use_selection=True, export_image_format="JPEG")
