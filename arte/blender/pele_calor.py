# Refaz os pesos da pele do gato com os pesos automáticos do Blender (bone heat), sem abrir as costuras.
# O glTF do Meshy vem cortado em ~165 pedaços nas costuras da textura (vértices duplicados); calcular os pesos direto
# nele dá um peso diferente para cada lado da costura e ela abre (manchas escuras). Aqui: uma cópia com as costuras
# soldadas recebe os pesos automáticos, e cada vértice original copia o peso do ponto da cópia onde ele está.
# Uso: Blender -b --python pele_calor.py -- ENTRADA.glb SAIDA.glb [FPS]
import bpy, bmesh, sys
from mathutils import kdtree

def pele_calor(arm, m):
    cena = bpy.context.scene
    arm.data.pose_position = "REST"; bpy.context.view_layer.update()
    copia = m.copy(); copia.data = m.data.copy(); cena.collection.objects.link(copia)
    for mod in list(copia.modifiers): copia.modifiers.remove(mod)
    copia.vertex_groups.clear(); mw = copia.matrix_world.copy(); copia.parent = None; copia.matrix_world = mw
    bm = bmesh.new(); bm.from_mesh(copia.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4); bm.to_mesh(copia.data); bm.free()
    bpy.ops.object.select_all(action="DESELECT"); copia.select_set(True); arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    # passa para o original pelo ponto exato
    arv = kdtree.KDTree(len(copia.data.vertices))
    for v in copia.data.vertices: arv.insert(copia.matrix_world @ v.co, v.index)
    arv.balance()
    nomes = {g.index: g.name for g in copia.vertex_groups}
    for g in m.vertex_groups: g.remove(list(range(len(m.data.vertices))))
    for nome in nomes.values():
        if nome not in m.vertex_groups: m.vertex_groups.new(name=nome)
    vazios = 0
    for v in m.data.vertices:
        _, j, _ = arv.find(m.matrix_world @ v.co)
        gs = copia.data.vertices[j].groups
        if not gs: vazios += 1
        for g in gs:
            if g.weight > 1e-4: m.vertex_groups[nomes[g.group]].add([v.index], g.weight, "REPLACE")
    bpy.data.objects.remove(copia, do_unlink=True)
    arm.data.pose_position = "POSE"
    return vazios

if __name__ == "__main__" and "--" in sys.argv:
    a = sys.argv[sys.argv.index("--") + 1:]
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    cena = bpy.context.scene; cena.render.fps = int(a[2]) if len(a) > 2 else 30
    bpy.ops.import_scene.gltf(filepath=a[0])
    arm = [o for o in cena.objects if o.type == "ARMATURE"][0]; m = [o for o in cena.objects if o.type == "MESH"][0]
    print("PELE vértices sem peso:", pele_calor(arm, m))
    bpy.ops.export_scene.gltf(filepath=a[1], export_format="GLB", export_animations=True, export_animation_mode="ACTIVE_ACTIONS")
