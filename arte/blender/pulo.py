# Pulo do gato para cima de um objeto (subir) e de cima para baixo (descer), pelas fases de gatos reais em câmera lenta
# ("Amazing Slow Motion Leaping Cat" para o subir; Slow Mo Guys, gato descendo da árvore, para o descer; mais os vídeos
# da poltrona e do piano em arte/entradas/referencias/gato-pulo).
# SUBIR: senta para trás mirando o alto (quadril quase no chão, nariz para cima) -> empina quase vertical, patas da
#        frente no peito, as de trás esticam como foguete -> sobe quase reto -> no alto estica as da frente por cima da
#        borda -> pousa as da frente lá dentro, o corpo gira para a horizontal, as de trás sobem encolhidas e pousam logo
#        depois da borda (corpo juntinho) -> passo à frente.
# DESCER: inclina de cabeça para baixo levando as patas da frente o mais baixo possível -> solta e cai quase vertical,
#        de cabeça para baixo -> toca com as da frente -> a traseira gira por cima delas -> as de trás pousam perto das da
#        frente, encolhido -> passo à frente.
# A pose do corpo é dada pela posição do OMBRO e do QUADRIL (frente, altura acima do chão de partida) em cada chave; no
# ar, o meio do corpo segue a balística (gravidade real). Patas por IK, com contato fixo no mundo. O deslocamento fica
# no próprio clipe (osso root).
# Uso: Blender -b --python pulo.py -- RIG.glb SAIDA_SUBIR.glb SAIDA_DESCER.glb [ALTURA]
import bpy, sys, math
from mathutils import Matrix, Vector
from bpy_extras import anim_utils

a = sys.argv[sys.argv.index("--") + 1:]
ENT, SAI_SOBE, SAI_DESCE = a[0], a[1], a[2]
H = float(a[3]) if len(a) > 3 else 50.0
G = 1.81          # gravidade em unidades do modelo por quadro² (9,81 m/s², gato de 25 cm = 41,5 unidades, 30 fps)
R = math.radians

def carrega():
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    for x in list(bpy.data.actions): bpy.data.actions.remove(x)
    cena = bpy.context.scene; cena.render.fps = 30
    bpy.ops.import_scene.gltf(filepath=ENT)
    arm = [o for o in cena.objects if o.type == "ARMATURE"][0]
    ad = arm.animation_data
    for tr in list(ad.nla_tracks): ad.nla_tracks.remove(tr)
    cb = anim_utils.action_get_channelbag_for_slot(ad.action, ad.action_slot)
    for c in list(cb.fcurves): cb.fcurves.remove(c)
    return arm

def suave(t): return t * t * (3 - 2 * t)

def gerar(arm, chaves, pernas, saida, nome, voo):
    W = arm.matrix_world; Wi = W.inverted(); PB = arm.pose.bones
    frente = Vector((0, -1, 0)); cima = Vector((0, 0, 1)); lateral = frente.cross(cima).normalized()
    def atualiza(): bpy.context.view_layer.update()
    def cab(n): return W @ PB[n].head
    def cau(n): return W @ PB[n].tail
    def p2(v): return Vector((v.dot(frente), v.z))
    def ang2(v): q = p2(v); return math.atan2(q.x, -q.y)
    def girar(n, ang, eixo=None, piv=None):
        pb = PB[n]; p = cab(n) if piv is None else piv; e = lateral if eixo is None else eixo
        Rm = Matrix.Translation(p) @ Matrix.Rotation(ang, 4, e) @ Matrix.Translation(-p)
        pb.matrix = Wi @ Rm @ W @ pb.matrix; atualiza()
    def mover(n, d):
        m = PB[n].matrix.copy(); m.translation += Wi.to_3x3() @ d; PB[n].matrix = m; atualiza()
    def incl(p, q): d = q - p; return math.atan2(d.z, d.dot(frente))
    def curva(): me = cab("body"); return incl(me, cau("body_top1")) - incl(cab("pelvis"), me)
    for pb in PB: pb.rotation_mode = "QUATERNION"; pb.matrix_basis.identity()
    atualiza()
    REP = {pb.name: cab(pb.name).copy() for pb in PB}
    Z0 = min(REP[n].z for n in ("leg_front_left_ankle", "leg_hind_left_toe")) - 1.8   # chão de partida (mundo)
    F0, T0 = "leg_front_left_", "leg_hind_left_"
    ALM = p2(REP[F0 + "ankle"]); PUN = p2(REP[F0 + "bot0"]); LM = (ALM - PUN).length
    PHI0 = math.atan2((ALM - PUN).x, -(ALM - PUN).y)
    MTP = p2(REP[T0 + "toe"]); JAR = p2(REP[T0 + "ankle"]); LT = (MTP - JAR).length
    TH0 = math.atan2((MTP - JAR).x, -(MTP - JAR).y)
    DEDO_F = ang2(W @ PB[F0 + "ankle"].bone.tail_local - REP[F0 + "ankle"]); DEDO_T = ang2(W @ PB[T0 + "toe"].bone.tail_local - REP[T0 + "toe"])
    OM0 = p2(REP[F0 + "top0"]); QU0 = p2(REP[T0 + "top1"])
    M0 = (OM0 + QU0) / 2; ANG0 = math.atan2((OM0 - QU0).y, (OM0 - QU0).x)
    hz = lambda z: z + Z0                                                   # altura acima do chão -> z do mundo

    def interp(k, f):
        pts = [(q, c[k]) for q, c in chaves if k in c]
        if not pts: return None
        if f <= pts[0][0]: return pts[0][1]
        if f >= pts[-1][0]: return pts[-1][1]
        for i in range(len(pts) - 1):
            if pts[i][0] <= f <= pts[i + 1][0]:
                (f0, v0), (f1, v1) = pts[i], pts[i + 1]
                t = (f - f0) / (f1 - f0); modo = dict(chaves)[f1].get("mov")
                s = t * t if modo == "acel" else (1 - (1 - t) ** 2 if modo == "freia" else suave(t))
                if isinstance(v0, tuple): return tuple(x0 + (x1 - x0) * s for x0, x1 in zip(v0, v1))
                return v0 + (v1 - v0) * s

    def meio_e_angulo(f):
        om, qu = Vector(interp("om", f)), Vector(interp("qu", f))
        m = (om + qu) / 2; ang = math.atan2((om - qu).y, (om - qu).x)
        if voo[0] <= f <= voo[1]:   # no ar: o meio do corpo segue a balística
            f0, f1 = voo; T = f1 - f0; t = f - f0
            o0, q0 = Vector(interp("om", f0)), Vector(interp("qu", f0)); o1, q1 = Vector(interp("om", f1)), Vector(interp("qu", f1))
            m0, m1 = (o0 + q0) / 2, (o1 + q1) / 2
            vz0 = (m1.y - m0.y) / T + 0.5 * G * T
            m = Vector((m0.x + (m1.x - m0.x) * t / T, m0.y + vz0 * t - 0.5 * G * t * t))
        return m, ang

    def pose_corpo(f):
        for pb in PB: pb.matrix_basis.identity()
        atualiza()
        m, ang = meio_e_angulo(f)
        alvo_m = Vector((m.x, hz(m.y)))
        mover("root", frente * (alvo_m.x - M0.x) + cima * (alvo_m.y - M0.y))
        piv = frente * alvo_m.x + cima * alvo_m.y
        girar("body", ang - ANG0, piv=piv)
        alvo = R(interp("curva", f)); ex = alvo - curva(); antes = curva()
        girar("body_top0", 0.3 * ex, piv=cab("body")); girar("body_bot", -0.7 * ex, piv=cab("body"))
        if abs(curva() - alvo) > abs(antes - alvo):
            girar("body_top0", -0.6 * ex, piv=cab("body")); girar("body_bot", 1.4 * ex, piv=cab("body"))
        # cabeça: ângulo no mundo (graus, + olha para cima), compensando a inclinação do corpo
        olha = R(interp("cabeca", f)) - (ang - ANG0)
        girar("neck0", 0.5 * olha); girar("head0", 0.5 * olha)
        rb = interp("rabo", f); girar("tail0", R(rb * 0.6)); girar("tail1", R(rb * 0.4))
        for i in range(2, 7): girar(f"tail{i}", R(interp("rabo_curva", f)))
        reb = interp("rebola", f)
        if reb: girar("body_bot", R(reb) * math.sin(2 * math.pi * f / 8), eixo=cima)

    def junta_de(perna):
        lado = "left" if perna[1] == "E" else "right"
        return p2(cab(f"leg_front_{lado}_top0" if perna[0] == "F" else f"leg_hind_{lado}_top1"))

    def alvo_perna(perna, f):
        ks = pernas[perna]
        _, ang = meio_e_angulo(f); dl = ang - ANG0                  # quanto o corpo está girado (+ = nariz para cima)
        def avalia(k):
            tipo, x, z, a_ = k[1], k[2], k[3], R(k[4])
            if tipo == "mundo": return Vector((x, hz(z))), a_
            if tipo == "corpo":                              # relativo à cintura E à orientação do corpo (gira junto)
                c, sn = math.cos(dl), math.sin(dl)
                return junta_de(perna) + Vector((x * c - z * sn, x * sn + z * c)), a_ + dl
            return junta_de(perna) + Vector((x, z)), a_      # "junta": relativo à junta da cintura, eixos do mundo
        if f <= ks[0][0]: k0 = k1 = ks[0]; s = 0
        elif f >= ks[-1][0]: k0 = k1 = ks[-1]; s = 0
        else:
            for i in range(len(ks) - 1):
                if ks[i][0] <= f <= ks[i + 1][0]: k0, k1 = ks[i], ks[i + 1]; break
            s = suave((f - k0[0]) / max(1e-6, k1[0] - k0[0]))
        (p0, a0), (p1, a1) = avalia(k0), avalia(k1)
        return p0.lerp(p1, s), a0 + (a1 - a0) * s

    def ik2(cima_, baixo, filho, alvo, joelho_frente):
        S = p2(cab(cima_)); l1 = (p2(cab(baixo)) - S).length; l2 = (p2(cab(filho)) - p2(cab(baixo))).length
        v = alvo - S; d = min(max(v.length, abs(l1 - l2) + 1e-3), 0.995 * (l1 + l2)); falta = max(0, v.length - d)
        a1 = math.acos(max(-1, min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))))
        girar(cima_, math.atan2(v.x, -v.y) + (a1 if joelho_frente else -a1) - ang2(cab(baixo) - cab(cima_)))
        E = p2(cab(baixo)); girar(baixo, math.atan2((alvo - E).x, -(alvo - E).y) - ang2(cab(filho) - cab(baixo)))
        return falta

    def perna_frente(lado, f):
        p = f"leg_front_{lado}_"; P, phi = alvo_perna("F" + ("E" if lado == "left" else "D"), f)
        falta = ik2(p + "top0", p + "top1", p + "bot0", P - LM * Vector((math.sin(phi), -math.cos(phi))), False)
        girar(p + "bot0", phi - ang2(cab(p + "ankle") - cab(p + "bot0")))
        girar(p + "ankle", ang2(cab(p + "ankle") - cab(p + "bot0")) + (DEDO_F - PHI0) - ang2(cau(p + "ankle") - cab(p + "ankle")))
        return falta

    def perna_tras(lado, f):
        p = f"leg_hind_{lado}_"; M, th = alvo_perna("T" + ("E" if lado == "left" else "D"), f)
        falta = ik2(p + "top1", p + "bot0", p + "ankle", M - LT * Vector((math.sin(th), -math.cos(th))), True)
        girar(p + "ankle", th - ang2(cab(p + "toe") - cab(p + "ankle")))
        girar(p + "toe", ang2(cab(p + "toe") - cab(p + "ankle")) + (DEDO_T - TH0) - ang2(cau(p + "toe") - cab(p + "toe")))
        return falta

    fim = chaves[-1][0]; faltas = []
    for f in range(fim + 1):
        pose_corpo(f)
        for lado in ("left", "right"):
            for k, fn in (("F", perna_frente), ("T", perna_tras)):
                fa = fn(lado, f)
                if fa > 0.5: faltas.append((k + lado[0], f, round(fa, 1)))
        for pb in PB:
            for c in ("location", "rotation_quaternion", "scale"): pb.keyframe_insert(c, frame=1 + f)
    arm.animation_data.action.name = nome
    print(nome, "quadros", fim + 1, "voo", voo, "perna não alcança (pata, quadro, unidades):", faltas)
    bpy.ops.export_scene.gltf(filepath=saida, export_format="GLB", export_animations=True, export_animation_mode="ACTIVE_ACTIONS")

# ---------------- medidas do repouso ----------------
arm = carrega()
W = arm.matrix_world; PB = arm.pose.bones
for pb in PB: pb.matrix_basis.identity()
bpy.context.view_layer.update()
fw = lambda n: -(W @ PB[n].head).y
Z0 = min((W @ PB[n].head).z for n in ("leg_front_left_ankle", "leg_hind_left_toe")) - 1.8
hh = lambda n: (W @ PB[n].head).z - Z0
AF, AT = fw("leg_front_left_ankle"), fw("leg_hind_left_toe")              # almofadas (frente)
CF, CT = hh("leg_front_left_ankle"), hh("leg_hind_left_toe")              # altura das almofadas em pé
OM = (fw("leg_front_left_top0"), hh("leg_front_left_top0")); QU = (fw("leg_hind_left_top1"), hh("leg_hind_left_top1"))
TH0 = math.degrees(math.atan2(AT - fw("leg_hind_left_ankle"), -(CT - hh("leg_hind_left_ankle"))))
PHI0 = math.degrees(math.atan2(AF - fw("leg_front_left_bot0"), -(CF - hh("leg_front_left_bot0"))))
print(f"repouso: ombro {OM}, quadril {QU}, almofada frente {AF:.1f} trás {AT:.1f}")
dOF = OM[0] - AF; dQT = QU[0] - AT                                         # ombro à frente da pata, quadril à frente da pata
mundo = lambda x, z, ang: ("mundo", x, z, ang)
junta = lambda x, z, ang: ("junta", x, z, ang)
corpo = lambda x, z, ang: ("corpo", x, z, ang)

# ---------------- SUBIR ----------------
BORDA = AF + 10.0                         # a borda fica 10 à frente da pata da frente
XF_TOCA = BORDA + 30.0; XT_TOCA = BORDA + 4.0        # pousam: frente lá dentro, de trás logo depois da borda
XF_FIM = XT_TOCA + (AF - AT)                         # depois de um passo, de pé em cima
F_SOLTA = 19
om_t, qu_t = (OM[0] - 15, 62.0), (QU[0] + 12, 28.0)                      # empinado, pernas de trás esticadas
om_p, qu_p = (XF_TOCA - 6, H + 26.0), (XF_TOCA - 40, H + 12.0)            # patas da frente pousam lá dentro
m0 = ((om_t[0] + qu_t[0]) / 2, (om_t[1] + qu_t[1]) / 2); m1 = ((om_p[0] + qu_p[0]) / 2, (om_p[1] + qu_p[1]) / 2)
T_VOO = max(6, round(math.sqrt(max(1.0, m1[1] - m0[1]) / (0.2 * G))))    # ponto mais alto a ~70% do voo
F_TOCA = F_SOLTA + T_VOO; F_TRAS = F_TOCA + 5; F_PASSO = F_TRAS + 6; F_FIM = F_PASSO + 7
print("subir: voo", T_VOO, "quadros; solta", F_SOLTA, "frente toca", F_TOCA, "trás toca", F_TRAS)
sobe = [
    (0,  dict(om=OM, qu=QU, curva=0, cabeca=0, rabo=20, rabo_curva=-3, rebola=0)),
    (10, dict(om=(OM[0] - 3, 33.0), qu=(QU[0] + 3, 18.0), curva=0, cabeca=30, rabo=45, rabo_curva=2, rebola=2)),    # senta mirando o alto
    (16, dict(om=(OM[0] - 6, 34.0), qu=(QU[0] + 5, 14.0), curva=-6, cabeca=35, rabo=50, rabo_curva=3, rebola=2)),   # mais fundo
    (F_SOLTA, dict(om=om_t, qu=qu_t, mov="acel", curva=6, cabeca=40, rabo=70, rabo_curva=2, rebola=0)),             # empina: impulso
    (F_SOLTA + T_VOO // 2, dict(curva=8, cabeca=20, rabo=80, rabo_curva=0)),
    (F_TOCA, dict(om=om_p, qu=qu_p, curva=-10, cabeca=0, rabo=85, rabo_curva=-3)),                                  # frente pousa
    (F_TRAS, dict(om=(XT_TOCA + 28, H + 30.0), qu=(XT_TOCA + 2, H + 24.0), mov="freia", curva=-30, cabeca=0, rabo=60, rabo_curva=-2)),  # juntinho
    (F_PASSO, dict(om=(XT_TOCA + 36, H + 33.0), qu=(XT_TOCA + dQT, H + 28.0), curva=-12, cabeca=0, rabo=35, rabo_curva=-3)),
    (F_FIM, dict(om=(XF_FIM + dOF, H + OM[1]), qu=(XT_TOCA + dQT, H + QU[1]), curva=0, cabeca=0, rabo=20, rabo_curva=-3, rebola=0)),
]
sobe_pernas = {}
for lado, d in (("E", 0), ("D", 1)):
    sobe_pernas["F" + lado] = [
        (0, *mundo(AF, CF, PHI0)), (16 + d, *mundo(AF, CF, PHI0)),
        (F_SOLTA, *junta(6, -12, -100)),                                     # patas no peito
        (F_TOCA - 3, *junta(16, 2, 30)),                                     # estica por cima da borda
        (F_TOCA + d, *mundo(XF_TOCA, H + CF, PHI0)), (F_TRAS + 2, *mundo(XF_TOCA, H + CF, PHI0)),
        (F_PASSO, *junta(8, -22, -20)),                                      # passo à frente
        (F_FIM - 2 + d, *mundo(XF_FIM, H + CF, PHI0)), (F_FIM, *mundo(XF_FIM, H + CF, PHI0))]
    sobe_pernas["T" + lado] = [
        (0, *mundo(AT, CT, TH0)), (F_SOLTA + d, *mundo(AT, CT, TH0 - 50)),   # empurra até soltar, calcanhar sobe
        (F_SOLTA + 3, *junta(-2, -32, -10)),                                 # esticadas para baixo (foguete)
        (F_TOCA, *junta(8, -14, 60)),                                        # encolhem subindo
        (F_TRAS + d, *mundo(XT_TOCA, H + CT, TH0)), (F_FIM, *mundo(XT_TOCA, H + CT, TH0))]
gerar(arm, sobe, sobe_pernas, SAI_SOBE, "pulo_subir", (F_SOLTA, F_TOCA))

# ---------------- DESCER (simulação física) ----------------
# O gato não se joga: ele TOMBA sobre a borda (gira em volta do quadril, cada vez mais rápido, pela gravidade), solta e
# CAI com a velocidade que tinha (balística no centro do corpo, giro constante no ar), toca com a frente esticada para
# baixo, os cotovelos amortecem e a traseira continua caindo sob a gravidade, presa ao ombro pela coluna, até as patas
# de trás tocarem perto da parede; encolhe (mola amortecida) e sai andando.
arm = carrega()
BORDA_D = AF + 3.0
CHAO = -H                                              # altura do chão de baixo
L0 = math.hypot(OM[0] - QU[0], OM[1] - QU[1])          # distância ombro-quadril em pé
Lc = lambda curva: L0 * (1 - 0.006 * max(0.0, -curva))  # coluna arqueada encurta
PERNA_F = 28.0                                          # ombro -> almofada, perna da frente esticada para baixo
F_TOMBA, F_SOLTA_D = 14, 24
TH0R = math.radians
quadros = []                                            # (om, qu, curva, cabeca, rabo, rabo_curva)
# fase 0: aproxima da borda: as patas de trás andam até perto da beirada (dois passos), o quadril abaixa e a frente
# estica por cima da borda; o pivô do tombo fica na beirada (com o pivô longe, os ombros girariam para dentro do degrau)
XT_BORDA = BORDA_D - 8.0
piv = (XT_BORDA + 6.0, 24.0)
th_ini = math.radians(-12)
om_ini = (piv[0] + L0 * math.cos(th_ini), piv[1] + L0 * math.sin(th_ini))
for f in range(0, F_TOMBA + 1):
    t = suave(f / F_TOMBA)
    o = (OM[0] + (om_ini[0] - OM[0]) * t, OM[1] + (om_ini[1] - OM[1]) * t)
    q_ = (QU[0] + (piv[0] - QU[0]) * t, QU[1] + (piv[1] - QU[1]) * t)
    quadros.append((o, q_, -6 * t, -30 * t, 20 + 20 * t, -3))
# fase 1: tomba (aceleração angular constante, em volta do quadril na beirada)
th0 = th_ini
TR = F_SOLTA_D - F_TOMBA; ANG_R = math.radians(-45) - th0; alfa = 2 * ANG_R / (TR * TR); w_r = alfa * TR
for k in range(1, TR + 1):
    th = th0 + 0.5 * alfa * k * k
    om = (piv[0] + L0 * math.cos(th), piv[1] + L0 * math.sin(th))
    quadros.append((om, piv, -6, -30, 40 + 5 * k / TR, -2))
# fase 2: solta e cai (balística no centro do corpo, giro constante)
th_r = th0 + ANG_R
cm = ((quadros[-1][0][0] + piv[0]) / 2, (quadros[-1][0][1] + piv[1]) / 2)
r = (cm[0] - piv[0], cm[1] - piv[1]); v = (-w_r * r[1], w_r * r[0])     # velocidade do giro em volta do quadril
t = 0; F_TOCA_D = None
while True:
    t += 1
    th = th_r + w_r * t; c = (cm[0] + v[0] * t, cm[1] + v[1] * t - 0.5 * G * t * t)
    om = (c[0] + L0 / 2 * math.cos(th), c[1] + L0 / 2 * math.sin(th)); qu = (c[0] - L0 / 2 * math.cos(th), c[1] - L0 / 2 * math.sin(th))
    if om[1] - PERNA_F <= CHAO + CF or t > 20:
        F_TOCA_D = F_SOLTA_D + t
        quadros.append((om, qu, 2, -25, 30, -2)); break
    quadros.append((om, qu, 0, -28, 35, -2))
XF_C = quadros[-1][0][0] + 1.0
vq = ((qu[0] - quadros[-2][1][0]), (qu[1] - quadros[-2][1][1]))         # velocidade do quadril ao tocar
# fase 3: frente presa no chão; ombro amortece; quadril cai sob a gravidade preso ao ombro pela coluna
om_z0 = quadros[-1][0][1]; q = qu; k = 0; F_TRAS_D = None
while True:
    k += 1
    curva = -28 * min(1.0, k / 7)
    oz = om_z0 + (CHAO + 21 - om_z0) * (1 - (1 - min(1.0, k / 5)) ** 2)
    om = (XF_C - 1, oz)
    q = (q[0] + vq[0], q[1] + vq[1]); vq = (vq[0] * 0.92, vq[1] - G)   # balística (atrito leve no x)
    dx, dz = q[0] - om[0], q[1] - om[1]; d = math.hypot(dx, dz) or 1.0; L = Lc(curva)
    q = (om[0] + dx / d * L, om[1] + dz / d * L)                      # coluna mantém o comprimento
    q = (max(q[0], BORDA_D + 8), q[1])                                 # não entra na parede
    if q[1] <= CHAO + 24 or k > 20:
        F_TRAS_D = F_TOCA_D + k; quadros.append((om, (q[0], CHAO + 24), curva, -8, 5, -6)); break
    quadros.append((om, q, curva, -15 + 7 * min(1, k / 6), 5, -6))
XT_C = max(BORDA_D + 4, quadros[-1][1][0] - 6)
# fase 4: encolhe (mola amortecida) e fase 5: sai andando
F_ENCOLHE = F_TRAS_D + 6; F_PASSO_D = F_ENCOLHE + 8; F_FIM_D = F_PASSO_D + 9
XF_FIMD = XT_C + (AF - AT)
desce = [(f, dict(om=o, qu=qq, curva=cv, cabeca=cb, rabo=rb, rabo_curva=rc)) for f, (o, qq, cv, cb, rb, rc) in enumerate(quadros)]
desce += [(F_ENCOLHE, dict(om=(XF_C + 2, CHAO + 24.0), qu=(XT_C + 8, CHAO + 21.0), mov="freia", curva=-22, cabeca=0, rabo=10, rabo_curva=-5)),
          (F_PASSO_D, dict(om=(XF_C + 10, CHAO + 30.0), qu=(XT_C + dQT, CHAO + 26.0), curva=-10, cabeca=0, rabo=20, rabo_curva=-3)),
          (F_FIM_D, dict(om=(XF_FIMD + dOF, CHAO + OM[1]), qu=(XT_C + dQT, CHAO + QU[1]), curva=0, cabeca=0, rabo=20, rabo_curva=-3))]
print(f"descer: tomba {F_TOMBA}-{F_SOLTA_D}, giro ao soltar {math.degrees(w_r):.1f} graus/quadro, velocidade ao soltar ({v[0]:.2f}, {v[1]:.2f})/quadro, "
      f"frente toca {F_TOCA_D} em x={XF_C:.1f} ({XF_C - BORDA_D:.1f} da parede), trás toca {F_TRAS_D} em x={XT_C:.1f}")
desce_pernas = {}
for lado, d in (("E", 0), ("D", 1)):
    desce_pernas["F" + lado] = [
        (0, *mundo(AF, CF, PHI0)), (2 + d, *mundo(AF, CF, PHI0)),
        (8, *junta(1, -PERNA_F + 4, PHI0 + 10)),                               # patas saem da borda e esticam para baixo
        (F_TOCA_D - 1, *junta(1, -PERNA_F, PHI0 + 5)),
        (F_TOCA_D + d, *mundo(XF_C, CHAO + CF, PHI0)), (F_ENCOLHE + 2, *mundo(XF_C, CHAO + CF, PHI0)),   # tocam retas
        (F_PASSO_D, *junta(8, -22, -15)),
        (F_FIM_D - 2 + d, *mundo(XF_FIMD, CHAO + CF, PHI0)), (F_FIM_D, *mundo(XF_FIMD, CHAO + CF, PHI0))]
    passo = (AT + XT_BORDA) / 2
    desce_pernas["T" + lado] = [
        (0, *mundo(AT, CT, TH0)), (2 + 2 * d, *mundo(AT, CT, TH0)),                   # dois passos até a beirada
        (4 + 2 * d, *mundo((AT + passo) / 2, CT + 5, TH0 + 20)), (6 + 2 * d, *mundo(passo, CT, TH0)),
        (8 + 2 * d, *mundo((passo + XT_BORDA) / 2, CT + 5, TH0 + 20)), (10 + 2 * d, *mundo(XT_BORDA, CT, TH0)),
        (F_SOLTA_D + d, *mundo(XT_BORDA, CT, TH0 - 35)),                             # seguram enquanto tomba
        (F_SOLTA_D + 3, *junta(0, -26, 0)),                                           # soltas, penduradas pela gravidade
        (F_TRAS_D - 1, *junta(0, -26, 0)),
        (F_TRAS_D + d, *mundo(XT_C, CHAO + CT, TH0)), (F_FIM_D, *mundo(XT_C, CHAO + CT, TH0))]
gerar(arm, desce, desce_pernas, SAI_DESCE, "pulo_descer", (-1, -2))
print(f"subir: anda {XT_TOCA - AT:.1f} e sobe {H}; descer: anda {XT_C - AT:.1f} e desce {H}")
