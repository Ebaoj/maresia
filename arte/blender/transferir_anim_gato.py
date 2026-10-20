# Transfere animações do Sphynx Cat (Animal Animator, CC BY) para o gato do jogo (esqueleto quadrúpede do Tripo v2.5).
# Copia a variação de rotação de cada osso no espaço do mundo (independe dos eixos locais) e a altura/deslocamento
# do quadril em escala. Uso: Blender -b --python transferir_anim_gato.py -- ORIGEM.glb ALVO.glb SAIDA.glb Acao1,Acao2... [AMOSTRAS]
# AMOSTRAS por quadro de 24 fps (padrão 4): mais amostras guardam o movimento entre os quadros; exporta a 24*AMOSTRAS fps.
import bpy, sys
from mathutils import Matrix, Vector
a = sys.argv[sys.argv.index("--") + 1:]
ORIG, ALVO, SAIDA, ACOES = a[0], a[1], a[2], a[3].split(",")
AMOSTRAS = int(a[4]) if len(a) > 4 else 4
# ações cíclicas em que a pata traseira esquerda recebe a direita espelhada e meio ciclo defasada
# (o Cat_Walk original tem a pisada esquerda bem mais dura: coxa 8,6 contra 5,0 graus/quadro)
SIMETRIZAR = set(a[5].split(",")) if len(a) > 5 and a[5] else {"Cat_Walk"}
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
cena = bpy.context.scene

def importar(arq):
    antes = set(bpy.data.objects); acoes_antes = set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=arq)
    novos = [o for o in bpy.data.objects if o not in antes]
    return novos, [x for x in bpy.data.actions if x not in acoes_antes]

obs_o, acoes_o = importar(ORIG)
arm_o = [o for o in obs_o if o.type == "ARMATURE"][0]
obs_a, acoes_a = importar(ALVO)
arm_a = [o for o in obs_a if o.type == "ARMATURE"][0]
for x in acoes_a: bpy.data.actions.remove(x)
if arm_a.animation_data: arm_a.animation_data.action = None

def osso(arm, prefixo):
    return next(b for b in arm.data.bones if b.name == prefixo or b.name.startswith(prefixo + "_"))

# O Tripo divide a perna em pedaços diferentes da anatomia: na de trás, Limb_2 e Limb_3 são as duas metades do
# metatarso (pé), e não pé + dedos; na da frente, Limb_2 começa no meio do antebraço. Por isso esses seguem o osso de cima.
MAPA = [("tripo::Root", "hips"), ("tripo::Spine_0", "spine_02"), ("tripo::Spine_1", "chest"),
        ("tripo::Head_0", "neck_02"), ("tripo::Head_1", "head"),
        ("bone_5", "scapula.L"), ("tripo::0_Left_Limb_0", "upperarm.L"), ("tripo::0_Left_Limb_1", "forearm.L"), ("tripo::0_Left_Limb_2", "forearm.L"),
        ("bone_9", "scapula.R"), ("tripo::0_Right_Limb_0", "upperarm.R"), ("tripo::0_Right_Limb_1", "forearm.R"), ("tripo::0_Right_Limb_2", "forearm.R"),
        ("tripo::1_Left_Limb_0", "thigh.L"), ("tripo::1_Left_Limb_1", "shin.L"), ("tripo::1_Left_Limb_2", "foot.L"), ("tripo::1_Left_Limb_3", "foot.L"),
        ("tripo::1_Right_Limb_0", "thigh.R"), ("tripo::1_Right_Limb_1", "shin.R"), ("tripo::1_Right_Limb_2", "foot.R"), ("tripo::1_Right_Limb_3", "foot.R")]
for i, s in zip(range(7), ["tail_01", "tail_02", "tail_04", "tail_05", "tail_06", "tail_08", "tail_09"]):
    MAPA.append((f"tripo::Tail_{i}", s))
MAPA = [(t, osso(arm_o, s).name) for t, s in MAPA if t in arm_a.data.bones]

# escala de translação: altura do quadril (alvo / origem)
alt_o = (arm_o.matrix_world @ osso(arm_o, "hips").head_local).z - min((arm_o.matrix_world @ b.tail_local).z for b in arm_o.data.bones)
alt_a = (arm_a.matrix_world @ arm_a.data.bones["tripo::Root"].tail_local).z - min((arm_a.matrix_world @ b.tail_local).z for b in arm_a.data.bones)
K = alt_a / alt_o
print("escala", round(K, 3), "ossos ligados", len(MAPA))

Wo3, Wa = arm_o.matrix_world.to_3x3(), arm_a.matrix_world
Wa3i = Wa.to_3x3().inverted()
quadril_o = osso(arm_o, "hips").name
nova_por_acao = []
for nome in ACOES:
    ac = bpy.data.actions[nome]
    arm_o.animation_data.action = ac
    ini, fim = int(ac.frame_range[0]), ac.frame_range[1]   # fim fracionário (ex.: 19,2): o ciclo fecha certo
    nova = bpy.data.actions.new("gato_" + nome.replace("Cat_", "").lower())
    arm_a.animation_data_create(); arm_a.animation_data.action = nova
    cena.frame_set(ini)
    loc0 = (arm_o.matrix_world @ arm_o.pose.bones[quadril_o].matrix).translation.copy()
    for passo in range(round((fim - ini) * AMOSTRAS) + 1):
        f = ini + passo / AMOSTRAS
        cena.frame_set(int(f), subframe=f - int(f))
        for t, s in MAPA:   # pais antes dos filhos (ordem do MAPA)
            ps, bs = arm_o.pose.bones[s], arm_o.data.bones[s]
            D = (Wo3 @ ps.matrix.to_3x3()) @ (Wo3 @ bs.matrix_local.to_3x3()).inverted()
            bt, pt = arm_a.data.bones[t], arm_a.pose.bones[t]
            rot = Wa3i @ (D @ (Wa.to_3x3() @ bt.matrix_local.to_3x3()))
            m = rot.to_4x4(); m.translation = pt.matrix.translation
            if t == "tripo::Root":
                # o Root do Tripo nasce abaixo do chão e termina no quadril: o giro tem que ser em torno do quadril
                # (a cauda do osso), senão o balanço do quadril levanta uma perna e afunda a outra
                d = (arm_o.matrix_world @ ps.matrix).translation - loc0
                cauda = bt.tail_local + Wa3i @ (d * K)
                m.translation = cauda - rot @ Vector((0, bt.length, 0))
            pt.rotation_mode = "QUATERNION"; pt.matrix = m
            bpy.context.view_layer.update()
            pt.keyframe_insert("rotation_quaternion", frame=passo)
            if t == "tripo::Root": pt.keyframe_insert("location", frame=passo)
    if nome in SIMETRIZAR:
        n = round((fim - ini) * AMOSTRAS); meio = n // 2
        M3 = Matrix.Scale(-1, 3, (1, 0, 0))
        pares = [(f"tripo::1_Right_Limb_{i}", f"tripo::1_Left_Limb_{i}") for i in range(4)]
        deltas = {}
        for passo in range(n + 1):
            cena.frame_set((passo + meio) % n)
            deltas[passo] = [M3 @ (Wa.to_3x3() @ arm_a.pose.bones[o].matrix.to_3x3()) @ (Wa.to_3x3() @ arm_a.data.bones[o].matrix_local.to_3x3()).inverted() @ M3 for o, _ in pares]
        for passo in range(n + 1):
            cena.frame_set(passo)
            for k, (_, d) in enumerate(pares):
                bt, pt = arm_a.data.bones[d], arm_a.pose.bones[d]
                rot = Wa3i @ (deltas[passo][k] @ (Wa.to_3x3() @ bt.matrix_local.to_3x3()))
                m = rot.to_4x4(); m.translation = pt.matrix.translation
                pt.matrix = m; bpy.context.view_layer.update()
                pt.keyframe_insert("rotation_quaternion", frame=passo)
        print("simetrizado", nome)
    nova.use_fake_user = True
    nova_por_acao.append(nova)
    print("feito", nova.name, round((fim - ini) * AMOSTRAS) + 1, "quadros a", 24 * AMOSTRAS, "fps")

cena.render.fps = 24 * AMOSTRAS
# exporta só o gato: cada ação vira uma faixa NLA para o glTF levar todas
for o in obs_o: bpy.data.objects.remove(o, do_unlink=True)
arm_a.animation_data.action = None
for n in nova_por_acao:
    tr = arm_a.animation_data.nla_tracks.new(); tr.name = n.name; tr.strips.new(n.name, 0, n)
bpy.ops.export_scene.gltf(filepath=SAIDA, export_format="GLB", export_animations=True, export_animation_mode="NLA_TRACKS")
print("exportado", SAIDA)
