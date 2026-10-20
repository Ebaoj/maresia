# Leva o úmero (osso de cima da pata da frente, ombro -> cotovelo) para a frente durante a ida da pata no andar.
# Na animação do Anything World o úmero quase não balança e só o antebraço mexe; multiplicar o balanço não resolve,
# então aqui o úmero GIRA em torno do ombro (eixo lateral do corpo) até ANGULO graus, com peso suave que vale 0
# enquanto a pata está atrás da posição média e 1 no ponto mais à frente. Patas de trás e recuo ficam iguais.
# Uso: Blender -b --python umero_frente.py -- ENTRADA.glb SAIDA.glb ANGULO
import bpy, sys, math
from mathutils import Matrix, Vector
a = sys.argv[sys.argv.index("--") + 1:]
ENT, SAI, ANGULO = a[0], a[1], math.radians(float(a[2]))
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
cena = bpy.context.scene; cena.render.fps = 30
bpy.ops.import_scene.gltf(filepath=ENT)
arm = [o for o in cena.objects if o.type == "ARMATURE"][0]
ac = arm.animation_data.action
ini, fim = int(ac.frame_range[0]), int(ac.frame_range[1])
W = arm.matrix_world; Wi = W.inverted()

# frente do gato no mundo: da pelve para o pescoço
frente = (W @ arm.pose.bones["neck1"].tail - W @ arm.pose.bones["pelvis"].head); frente.z = 0; frente.normalize()
lateral = frente.cross(Vector((0, 0, 1))).normalized()

pose = {}; adiante = {}
for f in range(ini, fim + 1):
    cena.frame_set(f)
    for lado in ("left", "right"):
        pb = arm.pose.bones[f"leg_front_{lado}_top0"]
        pose[(lado, f)] = pb.matrix.copy()
        adiante[(lado, f)] = (W @ arm.pose.bones[f"leg_front_{lado}_toe"].tail).dot(frente)
peso = {}
for lado in ("left", "right"):
    v = [adiante[(lado, f)] for f in range(ini, fim + 1)]; m = sum(v) / len(v); mx = max(v)
    for f in range(ini, fim + 1):
        t = max(0.0, (adiante[(lado, f)] - m) / (mx - m)) if mx > m else 0.0
        peso[(lado, f)] = t * t * (3 - 2 * t)   # suaviza a entrada e a saída

# sinal do giro que leva o cotovelo para a frente
def girar(m_arm, ang):
    cabeca = W @ m_arm.translation
    R = Matrix.Translation(cabeca) @ Matrix.Rotation(ang, 4, lateral) @ Matrix.Translation(-cabeca)
    return Wi @ R @ W @ m_arm
pb0 = arm.pose.bones["leg_front_left_top0"]; L = pb0.bone.length
teste = girar(pose[("left", ini)], 0.3)
cot = lambda m: (W @ (m @ Vector((0, L, 0)))).dot(frente)
sinal = 1 if cot(teste) > cot(pose[("left", ini)]) else -1

for f in range(ini, fim + 1):
    cena.frame_set(f)
    for lado in ("left", "right"):
        pb = arm.pose.bones[f"leg_front_{lado}_top0"]
        pb.rotation_mode = "QUATERNION"
        pb.matrix = girar(pose[(lado, f)], sinal * ANGULO * peso[(lado, f)])
        bpy.context.view_layer.update()
        pb.keyframe_insert("rotation_quaternion", frame=f)
        if f == ini: pb.keyframe_insert("location", frame=f)
bpy.ops.export_scene.gltf(filepath=SAI, export_format="GLB", export_animations=True, export_animation_mode="ACTIVE_ACTIONS")
print("exportado", SAI, "ângulo", a[2])
