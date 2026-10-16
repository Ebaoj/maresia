# Close da cabeça (frente, 3/4, perfil), com textura e só a forma. Uso: Blender -b --python close.py -- entrada.glb saida.png
import bpy, sys, math
a = sys.argv[sys.argv.index("--") + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=a[0])
c = bpy.context.scene; c.render.engine = "BLENDER_WORKBENCH"; c.display.shading.light = "STUDIO"
c.render.resolution_x = c.render.resolution_y = 500
c.world = bpy.data.worlds.new("w"); c.world.color = (1, 1, 1)
cd = bpy.data.cameras.new("c"); cd.type = "ORTHO"; cd.ortho_scale = 0.3
cam = bpy.data.objects.new("c", cd); c.collection.objects.link(cam); c.camera = cam
i = 0
for cor in ("TEXTURE", "SINGLE"):
    c.display.shading.color_type = cor
    for ang in (0, 45, 90):
        r = math.radians(ang)
        cam.location = (3 * math.sin(r), -3 * math.cos(r), 0.33); cam.rotation_euler = (math.pi / 2, 0, r)
        c.render.filepath = f"/tmp/close_{i}.png"; bpy.ops.render.render(write_still=True); i += 1
