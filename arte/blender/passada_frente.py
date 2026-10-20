# Aumenta a passada das patas da frente numa animação de andar do gato (esqueleto do Anything World):
# em cada quadro, pega a rotação de cada osso escolhido, mede quanto ela se afasta da rotação média do ciclo e
# multiplica esse afastamento por FATOR (1,0 = original; 1,4 = 40% mais amplo). As patas de trás não mudam.
# SO_FRENTE=1: só aumenta enquanto a pata está à frente da posição média (o alcance antes de pisar); o recuo fica igual.
# Uso: Blender -b --python passada_frente.py -- ENTRADA.glb SAIDA.glb FATOR [ossos separados por vírgula]
import bpy, sys, os
from mathutils import Quaternion
a = sys.argv[sys.argv.index("--") + 1:]
ENT, SAI, FATOR = a[0], a[1], float(a[2])
OSSOS = a[3].split(",") if len(a) > 3 else ["leg_front_left_top0", "leg_front_left_top1", "leg_front_right_top0", "leg_front_right_top1"]
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
cena = bpy.context.scene
cena.render.fps = 30
bpy.ops.import_scene.gltf(filepath=ENT)
arm = [o for o in cena.objects if o.type == "ARMATURE"][0]
ac = arm.animation_data.action
SO_FRENTE = os.environ.get("SO_FRENTE") == "1"
ini, fim = int(ac.frame_range[0]), int(ac.frame_range[1])

amostras = {}; pata_y = {}
for f in range(ini, fim + 1):
    cena.frame_set(f)
    amostras[f] = {n: arm.pose.bones[n].rotation_quaternion.copy() for n in OSSOS}
    for lado in ("left", "right"):   # quanto a pata está à frente (frente = -Y)
        pata_y[(lado, f)] = -(arm.matrix_world @ arm.pose.bones[f"leg_front_{lado}_toe"].tail).y
peso = {}
for lado in ("left", "right"):
    ys = [pata_y[(lado, f)] for f in range(ini, fim + 1)]; m = sum(ys) / len(ys); mx = max(ys)
    for f in range(ini, fim + 1):
        peso[(lado, f)] = max(0.0, (pata_y[(lado, f)] - m) / (mx - m)) if mx > m else 0.0
for n in OSSOS:
    ref = amostras[ini][n]; soma = Quaternion((0, 0, 0, 0))
    for f in range(ini, fim):          # o último quadro repete o primeiro
        q = amostras[f][n].copy()
        if q.dot(ref) < 0: q.negate()
        soma = Quaternion([soma[i] + q[i] for i in range(4)])
    media = soma.normalized()
    for f in range(ini, fim + 1):
        q = amostras[f][n].copy()
        if q.dot(media) < 0: q.negate()
        desvio = media.inverted() @ q
        eixo, ang = desvio.to_axis_angle()
        lado = "left" if "_left_" in n else "right"
        k = (1 + (FATOR - 1) * peso[(lado, f)]) if SO_FRENTE else FATOR
        novo = media @ Quaternion(eixo, ang * k)
        pb = arm.pose.bones[n]; pb.rotation_mode = "QUATERNION"; pb.rotation_quaternion = novo
        pb.keyframe_insert("rotation_quaternion", frame=f)
    print("osso", n, "ok")
bpy.ops.export_scene.gltf(filepath=SAI, export_format="GLB", export_animations=True, export_animation_mode="ACTIVE_ACTIONS")
print("exportado", SAI, "fator", FATOR)
