# Reduz um GLB do Meshy (solda as costuras de UV antes, para não rachar) e exporta outro GLB com as texturas.
# Uso: Blender -b --python blender/reduzir_glb.py -- ENTRADA.glb SAIDA.glb FACES
import bpy, sys
a = sys.argv[sys.argv.index("--") + 1:]; ENT, SAI, FACES = a[0], a[1], int(a[2])
bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=ENT)
for ob in [o for o in bpy.context.scene.objects if o.type == "MESH"]:
    for o in bpy.context.scene.objects: o.select_set(o == ob)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT"); bpy.ops.mesh.remove_doubles(threshold=1e-5); bpy.ops.object.mode_set(mode="OBJECT")
    n0 = len(ob.data.polygons)
    if n0 > FACES:
        m = ob.modifiers.new("reduz", "DECIMATE"); m.ratio = FACES / n0; bpy.ops.object.modifier_apply(modifier=m.name)
    print(f"REDUZIDO {ob.name}: {n0} -> {len(ob.data.polygons)} faces")
bpy.ops.export_scene.gltf(filepath=SAI, export_format="GLB")
