# Modelo já com esqueleto do auto-rig do Tripo (spec mixamo, 65 ossos com dedos) -> personagem do jogo:
# limpa objetos soltos, escala para a altura, frente em -Y e braços em X, pose T reta com a clavícula
# levantada (acrômio na linha do trapézio), aplica como repouso e exporta .glb + vistas.
# Uso: Blender -b --python blender/tripo_pos_rig.py -- ENTRADA.glb SAIDA_PREFIXO
#   TRIPO_ALTURA (1.52)  TRIPO_NOME (neto)  TRIPO_CLAVICULA (18)
import bpy, sys, os, math
import numpy as np
from mathutils import Vector, Matrix

a = sys.argv[sys.argv.index("--") + 1:]
ENTRADA, SAIDA = a[0], a[1]
ALTURA = float(os.environ.get("TRIPO_ALTURA", "1.52")); NOME = os.environ.get("TRIPO_NOME", "neto")
CLAV = float(os.environ.get("TRIPO_CLAVICULA", "18"))
cena = bpy.context.scene
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=ENTRADA)
rig = next(o for o in cena.objects if o.type == "ARMATURE")
malhas = [o for o in cena.objects if o.type == "MESH" and o.parent == rig]
for o in list(cena.objects):   # o Tripo manda uma icosfera solta junto
    if o.type == "MESH" and o not in malhas: bpy.data.objects.remove(o, do_unlink=True)


def ativar(ob):
    for o in cena.objects: o.select_set(False)
    ob.select_set(True); bpy.context.view_layer.objects.active = ob


def aplicar_transformacao(local=False):
    """aplica a transformação do esqueleto e das malhas, cada um separado (com filho junto o Blender erra)"""
    bpy.context.view_layer.update()   # sem isto a malha não vê a rotação/escala nova do pai
    for o in malhas:
        mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
    for o in [rig] + malhas:
        ativar(o); bpy.ops.object.transform_apply(location=local, rotation=True, scale=True)
    for o in malhas:
        o.parent = rig; o.matrix_parent_inverse = rig.matrix_world.inverted()


def ossos():
    return {b.name.split(":")[-1]: rig.matrix_world @ b.head_local for b in rig.data.bones}


# orientação: braços em X, frente em -Y, esquerda do personagem em +X
rig.rotation_mode = "XYZ"   # o glTF importa em quaternion; girar por ângulo seria ignorado
aplicar_transformacao()
B = ossos()
if abs(B["LeftHand"].y - B["RightHand"].y) > abs(B["LeftHand"].x - B["RightHand"].x):
    rig.rotation_euler = (0, 0, -math.pi / 2); aplicar_transformacao(); B = ossos()   # frente +X -> -Y, esquerda +Y -> +X
if B["LeftToeBase"].y > B["LeftFoot"].y:   # dedo do pé apontando para +Y: está de costas
    rig.rotation_euler = (0, 0, math.pi); aplicar_transformacao(); B = ossos()
print("ORIENTACAO esquerda x", round(B["LeftHand"].x, 3), "pé->dedo y", round(B["LeftToeBase"].y - B["LeftFoot"].y, 3))
# escala e pés no chão
zs = np.concatenate([[(o.matrix_world @ v.co).z for v in o.data.vertices] for o in malhas])
k = ALTURA / (zs.max() - zs.min())
rig.scale = (k, k, k); aplicar_transformacao()
zs = np.concatenate([[(o.matrix_world @ v.co).z for v in o.data.vertices] for o in malhas])
rig.location.z -= zs.min()
aplicar_transformacao(local=True)
print("ESCALA", round(k, 3), "altura", ALTURA)

# pose T reta, clavícula levantada
ativar(rig); bpy.ops.object.mode_set(mode="POSE")
def pb_(n): return rig.pose.bones.get("mixamorig:" + n)
def alinhar(nome, alvo):
    pb = pb_(nome)
    if pb is None: return
    bpy.context.view_layer.update()
    mw = rig.matrix_world @ pb.matrix; atual = (mw.to_3x3() @ Vector((0, 1, 0))).normalized()
    q = atual.rotation_difference(Vector(alvo).normalized())
    pb.matrix = rig.matrix_world.inverted() @ (Matrix.Translation(mw.to_translation()) @ q.to_matrix().to_4x4() @ mw.to_3x3().to_4x4())
for lado, sx in (("Left", 1), ("Right", -1)):
    pb = pb_(f"{lado}Shoulder")
    if pb and CLAV:
        bpy.context.view_layer.update(); mw = rig.matrix_world @ pb.matrix
        pb.matrix = rig.matrix_world.inverted() @ (Matrix.Translation(mw.to_translation()) @ Matrix.Rotation(math.radians(-CLAV * sx), 4, "Y") @ mw.to_3x3().to_4x4())
for lado, sx in (("Left", 1), ("Right", -1)):
    for o_ in ("Arm", "ForeArm", "Hand"): alinhar(lado + o_, (sx, 0, 0))
    for dedo in ("Index", "Middle", "Ring", "Pinky"):
        for i in (1, 2, 3): alinhar(f"{lado}Hand{dedo}{i}", (sx, 0, 0))
    for i in (1, 2, 3): alinhar(f"{lado}HandThumb{i}", (sx * 0.7, -0.7, 0))
    alinhar(lado + "UpLeg", (0, 0, -1)); alinhar(lado + "Leg", (0, 0, -1))
bpy.context.view_layer.update(); bpy.ops.object.mode_set(mode="OBJECT")
for o in malhas:
    ativar(o); mod = next(m for m in o.modifiers if m.type == "ARMATURE")
    bpy.ops.object.modifier_copy(modifier=mod.name); bpy.ops.object.modifier_apply(modifier=mod.name)
ativar(rig); bpy.ops.object.mode_set(mode="POSE"); bpy.ops.pose.armature_apply(selected=False); bpy.ops.object.mode_set(mode="OBJECT")
rig.name = rig.data.name = f"{NOME}-esqueleto"
for i, o in enumerate(malhas): o.name = o.data.name = NOME if len(malhas) == 1 else f"{NOME}-{i}"
print("TPOSE aplicada;", len(rig.data.bones), "ossos")

bpy.ops.wm.save_as_mainfile(filepath=f"{SAIDA}.blend")
for o in cena.objects: o.select_set(o == rig or o in malhas)
bpy.ops.export_scene.gltf(filepath=f"{SAIDA}.glb", export_format="GLB", use_selection=True, export_image_format="JPEG")
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); cena.collection.objects.link(cam); cena.camera = cam
cam.data.type = "ORTHO"; cam.data.ortho_scale = ALTURA * 1.3
cena.world = cena.world or bpy.data.worlds.new("w"); cena.world.use_nodes = True
bg = cena.world.node_tree.nodes["Background"]; bg.inputs[0].default_value = (0.75, 0.74, 0.71, 1); bg.inputs[1].default_value = 1.3
cena.render.resolution_x, cena.render.resolution_y = 700, 800
for nome, ang in (("frente", 0), ("perfil", 90)):
    r = math.radians(ang); cam.location = (5 * math.sin(r), -5 * math.cos(r), ALTURA * 0.5); cam.rotation_euler = (math.pi / 2, 0, r)
    cena.render.filepath = f"{SAIDA}-{nome}.png"; bpy.ops.render.render(write_still=True)
print("PRONTO pos-rig")
