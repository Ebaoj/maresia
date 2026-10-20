# Transfere animações do Leopard Hybrid_A1 (Animated3D, Fab, licença Individual) para o gato do jogo
# (esqueleto quadrúpede do Tripo v2.5). Mesmo princípio do transferir_anim_gato.py (variação de rotação de cada osso
# no espaço do mundo), com uma diferença: a pose de descanso do leopardo (bip01 do 3ds Max) está no meio de um passo,
# então a referência não é o descanso e sim a postura média dele andando, que bate com o gato em pé.
# Uso (abrindo o .blend do leopardo):
#   Blender -b --disable-autoexec Leopard_Hybrid_A1.blend --python transferir_anim_leopardo.py -- ALVO.glb SAIDA.glb Walk,Run,Jump
import bpy, sys
from mathutils import Vector
a = sys.argv[sys.argv.index("--") + 1:]
ALVO, SAIDA, ACOES = a[0], a[1], a[2].split(",")
IK_ACOES = set(a[3].split(",")) if len(a) > 3 and a[3] else {"Walk"}   # ações em que as patas são plantadas por IK
cena = bpy.context.scene
FPS = cena.render.fps   # 60 no arquivo do leopardo

arm_o = bpy.data.objects["Armature"]
obs_o = [o for o in bpy.data.objects]
antes = set(bpy.data.objects); acoes_antes = set(bpy.data.actions)
bpy.ops.import_scene.gltf(filepath=ALVO)
obs_a = [o for o in bpy.data.objects if o not in antes]
arm_a = [o for o in obs_a if o.type == "ARMATURE"][0]
for x in [x for x in bpy.data.actions if x not in acoes_antes]: bpy.data.actions.remove(x)
if arm_a.animation_data: arm_a.animation_data.action = None

# O Tripo divide a perna diferente da anatomia: atrás, Limb_2 e Limb_3 são o metatarso (horselink no biped);
# na frente, Limb_2 começa no meio do antebraço. Esses seguem o osso de cima.
MAPA = [("tripo::Root", "bip01_pelvis"), ("tripo::Spine_0", "bip01_spine1"), ("tripo::Spine_1", "bip01_spine2"),
        ("tripo::Head_0", "bip01_neck1"), ("tripo::Head_1", "bip01_head"),
        ("bone_5", "bip01_l_clavicle"), ("tripo::0_Left_Limb_0", "bip01_l_upperarm"), ("tripo::0_Left_Limb_1", "bip01_l_forearm"), ("tripo::0_Left_Limb_2", "bip01_l_forearm"),
        ("bone_9", "bip01_r_clavicle"), ("tripo::0_Right_Limb_0", "bip01_r_upperarm"), ("tripo::0_Right_Limb_1", "bip01_r_forearm"), ("tripo::0_Right_Limb_2", "bip01_r_forearm"),
        ("tripo::1_Left_Limb_0", "bip01_l_thigh"), ("tripo::1_Left_Limb_1", "bip01_l_calf"), ("tripo::1_Left_Limb_2", "bip01_l_horselink"), ("tripo::1_Left_Limb_3", "bip01_l_horselink"),
        ("tripo::1_Right_Limb_0", "bip01_r_thigh"), ("tripo::1_Right_Limb_1", "bip01_r_calf"), ("tripo::1_Right_Limb_2", "bip01_r_horselink"), ("tripo::1_Right_Limb_3", "bip01_r_horselink")]
for i, s in enumerate(["bone016", "bone016", "bone017", "bone017", "bone018", "bone018", "bone019"]):
    MAPA.append((f"tripo::Tail_{i}", s))
MAPA = [(t, s) for t, s in MAPA if t in arm_a.data.bones and s in arm_o.pose.bones]
print("ossos ligados", len(MAPA))

Wo3, Wa = arm_o.matrix_world.to_3x3(), arm_a.matrix_world
Wa3, Wa3i = Wa.to_3x3(), Wa.to_3x3().inverted()

# pose de referência do leopardo (parado em pé) e altura do quadril para escalar o deslocamento
# Referência = postura MÉDIA de cada osso ao longo da caminhada (o primeiro quadro do Idle1 tem a coluna arqueada,
# farejando, e empinava o gato uns 30 graus). A média do passo é a postura neutra em pé, que é o repouso do nosso gato.
from mathutils import Quaternion
ac_ref = bpy.data.actions["Armature|Walk"]; arm_o.animation_data.action = ac_ref
soma = {s: [0.0, 0.0, 0.0, 0.0] for _, s in MAPA}; prim = {}
r0, r1 = int(ac_ref.frame_range[0]), int(ac_ref.frame_range[1])
alturas = []
for f in range(r0, r1):
    cena.frame_set(f)
    for _, s in MAPA:
        q = (Wo3 @ arm_o.pose.bones[s].matrix.to_3x3()).normalized().to_quaternion()
        if s in prim and prim[s].dot(q) < 0: q.negate()
        prim.setdefault(s, q.copy())
        for i in range(4): soma[s][i] += q[i]
    alturas.append((arm_o.matrix_world @ arm_o.pose.bones["bip01_pelvis"].matrix).translation.z)
escala_o = Wo3.to_scale()
ref = {s: (Quaternion(v).normalized().to_matrix() @ __import__("mathutils").Matrix.Diagonal(escala_o)) for s, v in soma.items()}
cena.frame_set(r0)
pelve_ref = (arm_o.matrix_world @ arm_o.pose.bones["bip01_pelvis"].matrix).translation.copy()
pelve_ref.z = sum(alturas) / len(alturas)
chao_o = min((arm_o.matrix_world @ arm_o.pose.bones[n].tail).z for n in ("bip01_l_foot", "bip01_r_foot", "bip01_l_hand", "bip01_r_hand"))
alt_o = pelve_ref.z - chao_o
alt_a = (Wa @ arm_a.data.bones["tripo::Root"].tail_local).z - min((Wa @ b.tail_local).z for b in arm_a.data.bones)
K = alt_a / alt_o
print("escala", round(K, 4))

# ---- patas plantadas: cada pata do gato segue o caminho da pata do leopardo (em volta da posição média, na escala da
# perna), e a perna alcança esse ponto por IK; sem isso a pata escorrega, afunda ou flutua, porque as pernas têm outro tamanho
PERNAS = [  # (osso da ponta no gato, tamanho da cadeia, osso da ponta no leopardo, osso do ombro/quadril no leopardo)
    ("tripo::0_Left_Limb_2", 3, "bip01_l_hand", "bip01_l_upperarm"), ("tripo::0_Right_Limb_2", 3, "bip01_r_hand", "bip01_r_upperarm"),
    ("tripo::1_Left_Limb_3", 4, "bip01_l_foot", "bip01_l_thigh"), ("tripo::1_Right_Limb_3", 4, "bip01_r_foot", "bip01_r_thigh")]

def plantar_patas(ac, nova, ini, fim):
    Wo = arm_o.matrix_world
    arm_o.animation_data.action = ac
    chao_a = min((Wa @ arm_a.data.bones[p].tail_local).z for p, *_ in PERNAS)
    trilhas = {}
    for ponta, n, pf, raiz in PERNAS:
        pts = []
        for f in range(ini, fim + 1):
            cena.frame_set(f); pts.append((Wo @ arm_o.pose.bones[pf].tail).copy())
        cena.frame_set(ini)
        alt_o = (Wo @ arm_o.pose.bones[raiz].head).z - min(q.z for q in pts)
        # altura do ombro/quadril do gato acima do chão, no repouso
        b = arm_a.data.bones[ponta]
        for _ in range(n - 1): b = b.parent
        alt_a_perna = (Wa @ b.head_local).z - chao_a
        k = alt_a_perna / alt_o
        media = sum(pts, Vector()) / len(pts); chao_o = min(q.z for q in pts)
        repouso = Wa @ arm_a.data.bones[ponta].tail_local
        trilhas[ponta] = [Vector((repouso.x + (q.x - media.x) * k, repouso.y + (q.y - media.y) * k, chao_a + (q.z - chao_o) * k)) for q in pts]
        print("  perna", ponta.split("::")[-1], "escala %.3f" % k)
    # alvos animados + IK
    arm_a.animation_data.action = nova
    alvos = {}
    for ponta, n, *_ in PERNAS:
        e = bpy.data.objects.new("alvo_" + ponta, None); cena.collection.objects.link(e)
        for i, v in enumerate(trilhas[ponta]):
            e.location = v; e.keyframe_insert("location", frame=i)
        c = arm_a.pose.bones[ponta].constraints.new("IK"); c.target = e; c.chain_count = n; c.use_tail = True
        alvos[ponta] = e
    bpy.context.view_layer.objects.active = arm_a
    for o in bpy.context.selected_objects: o.select_set(False)
    arm_a.select_set(True)
    bpy.ops.object.mode_set(mode="POSE")
    def sel(pb, v):   # Blender 5 moveu a seleção do Bone para o PoseBone
        if hasattr(pb, "select"): pb.select = v
        else: pb.bone.select = v
    for pb in arm_a.pose.bones: sel(pb, False)
    for ponta, n, *_ in PERNAS:
        b = arm_a.pose.bones[ponta]
        for _ in range(n): sel(b, True); b = b.parent
    bpy.ops.nla.bake(frame_start=0, frame_end=fim - ini, only_selected=True, visual_keying=True,
                     clear_constraints=True, use_current_action=True, bake_types={"POSE"})
    bpy.ops.object.mode_set(mode="OBJECT")
    for e in alvos.values(): bpy.data.objects.remove(e, do_unlink=True)
    print("  patas plantadas por IK")

novas = []
for nome in ACOES:
    ac = bpy.data.actions["Armature|" + nome]
    arm_o.animation_data.action = ac
    ini, fim = int(ac.frame_range[0]), int(ac.frame_range[1])
    nova = bpy.data.actions.new("gato_" + nome.lower())
    arm_a.animation_data_create(); arm_a.animation_data.action = nova
    cena.frame_set(ini)
    pelve0 = (arm_o.matrix_world @ arm_o.pose.bones["bip01_pelvis"].matrix).translation.copy()
    for f in range(ini, fim + 1):
        cena.frame_set(f)
        for t, s in MAPA:   # pais antes dos filhos (ordem do MAPA)
            D = (Wo3 @ arm_o.pose.bones[s].matrix.to_3x3()) @ ref[s].inverted()
            bt, pt = arm_a.data.bones[t], arm_a.pose.bones[t]
            rot = Wa3i @ (D @ (Wa3 @ bt.matrix_local.to_3x3()))
            m = rot.to_4x4(); m.translation = pt.matrix.translation
            if t == "tripo::Root":   # gira em torno do quadril (cauda do Root), que anda com a pelve em escala
                d = (arm_o.matrix_world @ arm_o.pose.bones["bip01_pelvis"].matrix).translation - pelve0
                d.z += pelve0.z - pelve_ref.z          # altura relativa à pose em pé
                cauda = bt.tail_local + Wa3i @ (d * K)
                m.translation = cauda - rot @ Vector((0, bt.length, 0))
            pt.rotation_mode = "QUATERNION"; pt.matrix = m
            bpy.context.view_layer.update()
            pt.keyframe_insert("rotation_quaternion", frame=f - ini)
            if t == "tripo::Root": pt.keyframe_insert("location", frame=f - ini)
    if nome in IK_ACOES:
        plantar_patas(ac, nova, ini, fim)
    nova.use_fake_user = True; novas.append(nova)
    print("feito", nova.name, fim - ini + 1, "quadros a", FPS, "fps")

for o in obs_o: bpy.data.objects.remove(o, do_unlink=True)
arm_a.animation_data.action = None
for n in novas:
    tr = arm_a.animation_data.nla_tracks.new(); tr.name = n.name; tr.strips.new(n.name, 0, n)
bpy.ops.export_scene.gltf(filepath=SAIDA, export_format="GLB", export_animations=True, export_animation_mode="NLA_TRACKS")
print("exportado", SAIDA)
