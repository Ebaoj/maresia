# Close da cabeça de frente, 3/4 e perfil a partir do .blend gerado (segue a cabeça mesmo com as costas curvadas).
# Uso: Blender -b ARQUIVO.blend --python blender/close_cabeca.py -- SAIDA_PREFIXO
import bpy, sys, math
from mathutils import Vector

saida = sys.argv[sys.argv.index("--") + 1]
cena = bpy.context.scene
rig = next(o for o in cena.objects if o.type == "ARMATURE")
osso = next(b for b in rig.pose.bones if b.name.endswith("Head"))
centro = rig.matrix_world @ (osso.head + (osso.tail - osso.head) * 0.35) - Vector((0, 0, float(__import__("os").environ.get("CLOSE_DESCE", "0"))))

cam = cena.camera
if cam is None:
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); cena.collection.objects.link(cam); cena.camera = cam
cam.data.type = "ORTHO"; cam.data.ortho_scale = float(__import__("os").environ.get("CLOSE_ESCALA", "0.36"))
cena.render.resolution_x = cena.render.resolution_y = 700
alvo = bpy.data.objects.new("alvo", None); cena.collection.objects.link(alvo); alvo.location = centro
for c in list(cam.constraints): cam.constraints.remove(c)
t = cam.constraints.new("TRACK_TO"); t.target = alvo; t.track_axis = "TRACK_NEGATIVE_Z"; t.up_axis = "UP_Y"
for nome, ang in (("frente", 0), ("34", 40), ("perfil", 90)):
    a = math.radians(ang)
    cam.location = centro + Vector((math.sin(a) * 2, -math.cos(a) * 2, 0))   # frente do corpo em -Y
    cena.render.filepath = f"{saida}-{nome}.png"
    bpy.ops.render.render(write_still=True)
print("PRONTO close")
