# Vídeo de vitrine do personagem: animação do jogo em ciclo, câmera dando a volta, sol e céu, chão de areia que
# corre por baixo na velocidade do pé apoiado (a animação do Mixamo é no lugar). Quadros PNG; o MP4 sai com ffmpeg.
# Uso: Blender -b PERSONAGEM.blend --python blender/video_personagem.py -- ANIMACAO.fbx PASTA_QUADROS
#   VIDEO_RES (3840x2160)  VIDEO_SEG (8)  VIDEO_VOLTA (360 graus)  VIDEO_AMOSTRAS (64)  VIDEO_SO (quadros "1,120")
#   VIDEO_ALVO_Z (0.74)  VIDEO_CAM_Z (0.95)  VIDEO_DIST (5.2 m)  VIDEO_EXPOSICAO (-1.2)  VIDEO_LENTE (50 mm)
import bpy, sys, os, math
import numpy as np
from mathutils import Vector

a = sys.argv[sys.argv.index("--") + 1:]
FBX, PASTA = a[0], a[1]
RX, RY = map(int, os.environ.get("VIDEO_RES", "3840x2160").split("x"))
SEG = float(os.environ.get("VIDEO_SEG", "8")); VOLTA = float(os.environ.get("VIDEO_VOLTA", "360"))
DIST = float(os.environ.get("VIDEO_DIST", "5.2")); LENTE = float(os.environ.get("VIDEO_LENTE", "50"))
ALVO_Z = float(os.environ.get("VIDEO_ALVO_Z", "0.74")); CAM_Z = float(os.environ.get("VIDEO_CAM_Z", "0.95"))
cena = bpy.context.scene
dst = next(o for o in cena.objects if o.type == "ARMATURE")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from retarget_mixamo import preparar
aplicar, f0, f1 = preparar(cena, dst, FBX)
FPS = cena.render.fps; L = f1 - f0   # o último quadro do ciclo repete o primeiro
N = int(SEG * FPS)


def osso(n): return dst.matrix_world @ dst.pose.bones["mixamorig:" + n].head


# velocidade do chão: o pé mais baixo de cada quadro fica parado no chão, então o chão anda com ele
pes = []
for f in range(f0, f1 + 1):
    aplicar(f); pes.append([tuple(osso("LeftToeBase")), tuple(osso("RightToeBase"))])
pes = np.array(pes)   # (quadros, 2 pés, xyz)
vel = []
for i in range(len(pes) - 1):
    p = int(np.argmin(pes[i, :, 2]))
    if pes[i, p, 2] < pes[:, :, 2].min() + 0.03: vel.append(pes[i + 1, p, 1] - pes[i, p, 1])
v_chao = float(np.median(vel)) if vel else 0.0   # metros por quadro em y (o pé de apoio vai para trás: +y)
print(f"CHAO {v_chao * FPS:.2f} m/s, ciclo {L} quadros, video {N} quadros {RX}x{RY}")

# chão de areia
bpy.ops.mesh.primitive_plane_add(size=400); chao = bpy.context.object; chao.name = "chao"
m = bpy.data.materials.new("areia"); m.use_nodes = True; nt = m.node_tree; bsdf = nt.nodes["Principled BSDF"]
tc = nt.nodes.new("ShaderNodeTexCoord"); ru = nt.nodes.new("ShaderNodeTexNoise"); ru.inputs["Scale"].default_value = 3.0
ru.inputs["Detail"].default_value = 8; rampa = nt.nodes.new("ShaderNodeValToRGB")
rampa.color_ramp.elements[0].color = (0.40, 0.25, 0.11, 1); rampa.color_ramp.elements[1].color = (0.58, 0.40, 0.18, 1)
fino = nt.nodes.new("ShaderNodeTexNoise"); fino.inputs["Scale"].default_value = 220; bump = nt.nodes.new("ShaderNodeBump")
bump.inputs["Strength"].default_value = 0.25
nt.links.new(tc.outputs["Object"], ru.inputs["Vector"]); nt.links.new(ru.outputs["Fac"], rampa.inputs["Fac"])
nt.links.new(rampa.outputs["Color"], bsdf.inputs["Base Color"]); nt.links.new(tc.outputs["Object"], fino.inputs["Vector"])
nt.links.new(fino.outputs["Fac"], bump.inputs["Height"]); nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
bsdf.inputs["Roughness"].default_value = 0.95
bsdf.inputs["Specular IOR Level"].default_value = 0.05   # de raspão o reflexo do céu deixava a areia cinza
chao.data.materials.append(m)

# sol de fim de tarde e céu
for o in [o for o in cena.objects if o.type == "LIGHT"]: bpy.data.objects.remove(o, do_unlink=True)
sol = bpy.data.objects.new("sol", bpy.data.lights.new("sol", "SUN")); cena.collection.objects.link(sol)
sol.rotation_euler = (math.radians(58), 0, math.radians(-35)); sol.data.energy = 3.0; sol.data.angle = math.radians(1.5)
sol.data.color = (1.0, 0.93, 0.82)
cena.world = bpy.data.worlds.new("ceu"); cena.world.use_nodes = True; wn = cena.world.node_tree
ceu = wn.nodes.new("ShaderNodeTexSky"); bg = wn.nodes["Background"]; bg.inputs["Strength"].default_value = 0.35
try: ceu.sun_elevation = math.radians(32); ceu.sun_rotation = math.radians(-35 + 180)
except AttributeError: pass
wn.links.new(ceu.outputs["Color"], bg.inputs["Color"])

# câmera
cam = bpy.data.objects.new("camvideo", bpy.data.cameras.new("camvideo")); cena.collection.objects.link(cam); cena.camera = cam
cam.data.lens = LENTE; cam.data.clip_end = 300
cena.render.engine = "BLENDER_EEVEE"
ee = cena.eevee
for nome, valor in (("taa_render_samples", int(os.environ.get("VIDEO_AMOSTRAS", "64"))), ("use_raytracing", True),
                    ("use_shadows", True), ("shadow_ray_count", 2), ("shadow_step_count", 8), ("use_gtao", True)):
    if hasattr(ee, nome): setattr(ee, nome, valor)
cena.view_settings.view_transform = "AgX"; cena.view_settings.exposure = float(os.environ.get("VIDEO_EXPOSICAO", "-1.2"))
try: cena.view_settings.look = "AgX - Medium High Contrast"
except TypeError: pass
cena.render.resolution_x, cena.render.resolution_y = RX, RY; cena.render.resolution_percentage = 100
cena.render.image_settings.file_format = "PNG"; cena.render.film_transparent = False
os.makedirs(PASTA, exist_ok=True)
so = [int(x) for x in os.environ["VIDEO_SO"].split(",")] if os.environ.get("VIDEO_SO") else range(N)
for i in so:
    aplicar(f0 + i % L)
    chao.location.y = v_chao * i   # o mundo passa por baixo
    alvo = Vector((0, 0, ALVO_Z))
    ang = math.radians(-30 + VOLTA * i / N)
    cam.location = (DIST * math.sin(ang), -DIST * math.cos(ang), CAM_Z)
    cam.rotation_euler = (alvo - cam.location).to_track_quat("-Z", "Y").to_euler()
    cena.render.filepath = os.path.join(PASTA, f"q{i:04d}.png"); bpy.ops.render.render(write_still=True)
print("PRONTO video", len(list(so)), "quadros")
