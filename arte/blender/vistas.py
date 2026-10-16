# Renderiza frente e perfil ortográficos de um .glb para medir juntas. Uso:
# Blender -b --python vistas.py -- entrada.glb pasta_saida
import bpy, sys, math
args = sys.argv[sys.argv.index("--") + 1:]
entrada, saida = args[0], args[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=entrada)
cena = bpy.context.scene
cena.render.engine = "BLENDER_WORKBENCH"
cena.display.shading.light = "FLAT"
cena.display.shading.color_type = "TEXTURE"
cena.render.resolution_x = cena.render.resolution_y = 1000
cena.render.film_transparent = False
cena.world = bpy.data.worlds.new("w"); cena.world.color = (1, 1, 1)
cam_dados = bpy.data.cameras.new("cam"); cam_dados.type = "ORTHO"; cam_dados.ortho_scale = 1.1
cam = bpy.data.objects.new("cam", cam_dados); cena.collection.objects.link(cam); cena.camera = cam
for nome, pos, rot in (("frente", (0, -3, 0), (math.pi/2, 0, 0)), ("perfil", (3, 0, 0), (math.pi/2, 0, math.pi/2))):
    cam.location = pos; cam.rotation_euler = rot
    cena.render.filepath = f"{saida}/{nome}.png"
    bpy.ops.render.render(write_still=True)
