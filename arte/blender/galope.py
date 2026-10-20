# Galope do gato gerado do zero, a partir das fases do galope de um gato real fotografado por Muybridge
# (Animal Locomotion, prancha 718, 1887; arte/entradas/referencias/muybridge). Fase 0 = suspensão esticada (quadro 18).
#   0,00        no ar, esticado: patas da frente bem à frente, de trás bem atrás, costas retas
#   0,12-0,42   pata da frente que lidera no chão (a outra pisa 0,06 depois): corpo baixo, cotovelo bem dobrado
#   0,50-0,70   no ar, recolhido: costas arqueadas, patas de trás jogadas para baixo da barriga, as da frente dobradas
#   0,70-0,95   patas de trás no chão (a outra pisa 0,05 depois), empurrando
# Todas as patas apoiadas andam para trás na mesma velocidade V (sem escorregar). Corpo BAIXO unidades mais baixo que
# em pé; coluna dobrando de +8 (esticada) a -32 graus (arqueada), 75% na lombar; escápula acompanhando a pata da frente;
# cabeça baixa e firme; rabo esticado para trás com onda atrasada.
# Uso: Blender -b --python galope.py -- RIG.glb SAIDA.glb [V] [BAIXO]
import bpy, sys, math
from mathutils import Matrix, Vector
from bpy_extras import anim_utils

a = sys.argv[sys.argv.index("--") + 1:]
ENT, SAI = a[0], a[1]
V = float(a[2]) if len(a) > 2 else 7.5
BAIXO = float(a[3]) if len(a) > 3 else 9.0     # gato real galopa rente ao chão (vídeo 'Running cat 2', 100-200 fps)
N = 12
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
cena = bpy.context.scene; cena.render.fps = 30
bpy.ops.import_scene.gltf(filepath=ENT)
arm = [o for o in cena.objects if o.type == "ARMATURE"][0]
ad = arm.animation_data
for tr in list(ad.nla_tracks): ad.nla_tracks.remove(tr)
ac = ad.action
cb = anim_utils.action_get_channelbag_for_slot(ac, ad.action_slot)
for c in list(cb.fcurves): cb.fcurves.remove(c)
W = arm.matrix_world; Wi = W.inverted(); PB = arm.pose.bones
frente = Vector((0, -1, 0)); cima = Vector((0, 0, 1)); lateral = frente.cross(cima).normalized()
def atualiza(): bpy.context.view_layer.update()
def cab(n): return W @ PB[n].head
def cau(n): return W @ PB[n].tail
def p2(v): return Vector((v.dot(frente), v.z))
def ang2(v): q = p2(v); return math.atan2(q.x, -q.y)
def girar(n, ang, eixo=None, piv=None):
    pb = PB[n]; p = cab(n) if piv is None else piv; e = lateral if eixo is None else eixo
    R = Matrix.Translation(p) @ Matrix.Rotation(ang, 4, e) @ Matrix.Translation(-p)
    pb.matrix = Wi @ R @ W @ pb.matrix; atualiza()
def alinha(n, direcao):   # gira o osso (em 3D, em volta da cabeça) para apontar na direção dada
    pb = PB[n]; p = cab(n); q = (cau(n) - cab(n)).normalized().rotation_difference(direcao.normalized())
    pb.matrix = Wi @ (Matrix.Translation(p) @ q.to_matrix().to_4x4() @ Matrix.Translation(-p)) @ W @ pb.matrix; atualiza()
def volta_ang(x): return (x + math.pi) % (2 * math.pi) - math.pi   # diferença de ângulo entre -180 e 180
def suave(t): t = min(1.0, max(0.0, t)); return t * t * (3 - 2 * t)
def incl(p, q): d = q - p; return math.atan2(d.z, d.dot(frente))
def curva(): me = cab("body"); return incl(me, cau("body_top1")) - incl(cab("pelvis"), me)
R = math.radians

def curva_hermite(chaves, s, t0=None, t1=None):
    """Curva suave por pontos (s, valor). t0/t1: derivada nas pontas (d valor / d s)."""
    ss = [k[0] for k in chaves]; vv = [k[1] for k in chaves]
    for i in range(len(ss) - 1):
        if ss[i] <= s <= ss[i + 1]: break
    def tang(j):
        if j == 0: return t0 if t0 is not None else (vv[1] - vv[0]) / (ss[1] - ss[0])
        if j == len(ss) - 1: return t1 if t1 is not None else (vv[-1] - vv[-2]) / (ss[-1] - ss[-2])
        return (vv[j + 1] - vv[j - 1]) / (ss[j + 1] - ss[j - 1])
    h = ss[i + 1] - ss[i]; t = (s - ss[i]) / h
    h00, h10, h01, h11 = 2*t**3 - 3*t**2 + 1, t**3 - 2*t**2 + t, -2*t**3 + 3*t**2, t**3 - t**2
    return h00 * vv[i] + h10 * h * tang(i) + h01 * vv[i + 1] + h11 * h * tang(i + 1)

# ---------- repouso: medidas ----------
for pb in PB: pb.rotation_mode = "QUATERNION"; pb.matrix_basis.identity()
atualiza()
REP = {n: cab(n).copy() for n in [b.name for b in PB]}
def lado(l): return f"leg_front_{l}_", f"leg_hind_{l}_"
F0, T0 = lado("left")
OMBRO_X = p2(REP[F0 + "top0"]).x; QUADRIL_X = p2(REP[T0 + "top1"]).x
ALM_F = p2(REP[F0 + "ankle"]); PUNHO_F = p2(REP[F0 + "bot0"]); LM = (ALM_F - PUNHO_F).length
PHI0 = math.atan2((ALM_F - PUNHO_F).x, -(ALM_F - PUNHO_F).y)
DEDO_F0 = ang2(W @ PB[F0 + "ankle"].bone.tail_local - REP[F0 + "ankle"])
MTP = p2(REP[T0 + "toe"]); JAR = p2(REP[T0 + "ankle"]); LT = (MTP - JAR).length
TH0 = math.atan2((MTP - JAR).x, -(MTP - JAR).y)
DEDO_T0 = ang2(W @ PB[T0 + "toe"].bone.tail_local - REP[T0 + "toe"])

# fases (pisa, sai) por pata; a segunda pata de cada par pisa um pouco depois
FASES = {("front", "left"): (0.12, 0.42), ("front", "right"): (0.18, 0.48),
         ("hind", "left"): (0.70, 0.95), ("hind", "right"): (0.75, 1.00)}
def fase_pata(phi, pisa, sai):
    t = (phi - pisa) % 1.0; ap = (sai - pisa) % 1.0
    return ("apoio", t / ap) if t <= ap + 1e-9 else ("balanco", (t - ap) / (1.0 - ap))
def em_s(phi_alvo, pisa, sai):   # em que ponto s do balanço cai uma fase do ciclo
    ap = (sai - pisa) % 1.0; return (((phi_alvo - pisa) % 1.0) - ap) / (1.0 - ap)

def pata_frente(l, phi):
    p = f"leg_front_{l}_"; pisa, sai = FASES[("front", l)]
    ap = (sai - pisa) % 1.0; n_ap = ap * N; n_bal = (1 - ap) * N; L = V * n_ap
    x_pisa = OMBRO_X + 10.0; x_sai = x_pisa - L
    def phi_m(u): return PHI0 + (R(-40) - PHI0) * suave((u - 0.5) / 0.5)
    def punho(xa, u): return Vector((xa, ALM_F.y)) - LM * Vector((math.sin(phi_m(u)), -math.cos(phi_m(u))))
    P_pisa, P_sai = punho(x_pisa, 0), punho(x_sai, 1)
    tipo, s = fase_pata(phi, pisa, sai)
    # escápula: para a frente quando a pata alcança (fase ~0,05), para trás quando sai
    girar(f"scapula_{l}", R(15) * math.cos(2 * math.pi * (phi - 0.05)))
    if tipo == "apoio":
        P = punho(x_pisa - L * s, s)
    else:
        # como no vídeo: depois de sair, a pata fica dobrada embaixo do peito até ~0,80 e só no fim do voo estica
        # bem para a frente, rente ao chão
        s_rec, s_seg, s_est = em_s(0.66, pisa, sai), em_s(0.80, pisa, sai), em_s(0.98, pisa, sai)
        kx = [(0, P_sai.x), (s_rec, OMBRO_X - 1), (s_seg, OMBRO_X + 2), (s_est, OMBRO_X + 28), (1, P_pisa.x)]
        kz = [(0, P_sai.y), (s_rec, ALM_F.y + 10), (s_seg, ALM_F.y + 10), (s_est, ALM_F.y + 7), (1, P_pisa.y)]
        P = Vector((curva_hermite(kx, s, -V * n_bal, -V * n_bal), curva_hermite(kz, s, 0, 0)))
    S = p2(cab(p + "top0")); l1 = (p2(cab(p + "top1")) - S).length; l2 = (p2(cab(p + "bot0")) - p2(cab(p + "top1"))).length
    v = P - S; d = v.length; corte = max(0.0, d - 0.995 * (l1 + l2))
    d = min(max(d, abs(l1 - l2) + 1e-3), 0.995 * (l1 + l2))
    a1 = math.acos(max(-1, min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))))
    girar(p + "top0", math.atan2(v.x, -v.y) - a1 - ang2(cab(p + "top1") - cab(p + "top0")))   # cotovelo para trás
    E = p2(cab(p + "top1")); girar(p + "top1", math.atan2((P - E).x, -(P - E).y) - ang2(cab(p + "bot0") - cab(p + "top1")))
    ante = ang2(cab(p + "bot0") - cab(p + "top1"))
    if tipo == "apoio":
        girar(p + "bot0", phi_m(s) - ang2(cab(p + "ankle") - cab(p + "bot0")))
        girar(p + "ankle", DEDO_F0 - ang2(cau(p + "ankle") - cab(p + "ankle")))
    else:
        # carpo: dobra a pata contra o antebraço na fase recolhida, estica para a frente no alcance
        c_sai = phi_m(1) - ANTE_SAI[l]; c_pisa = phi_m(0) - ANTE_PISA[l]
        rel = curva_hermite([(0, c_sai), (em_s(0.66, pisa, sai), R(-75)), (em_s(0.80, pisa, sai), R(-70)), (em_s(0.98, pisa, sai), R(-5)), (1, c_pisa)], s)
        girar(p + "bot0", ante + rel - ang2(cab(p + "ankle") - cab(p + "bot0")))
        girar(p + "ankle", ang2(cab(p + "ankle") - cab(p + "bot0")) + (DEDO_F0 - PHI0) - R(25) * math.sin(math.pi * s) - ang2(cau(p + "ankle") - cab(p + "ankle")))
    return corte, ante

def pata_tras(l, phi):
    p = f"leg_hind_{l}_"; pisa, sai = FASES[("hind", l)]
    ap = (sai - pisa) % 1.0; n_ap = ap * N; n_bal = (1 - ap) * N; L = V * n_ap
    x_pisa = QUADRIL_X + 9.0; x_sai = x_pisa - L
    def th_m(u): return TH0 + (R(-55) - TH0) * suave((u - 0.4) / 0.6)     # calcanhar sobe empurrando
    def jarrete(xm, u): return Vector((xm, MTP.y)) - LT * Vector((math.sin(th_m(u)), -math.cos(th_m(u))))
    J_pisa, J_sai = jarrete(x_pisa, 0), jarrete(x_sai, 1)
    tipo, s = fase_pata(phi, pisa, sai)
    if tipo == "apoio":
        J = jarrete(x_pisa - L * s, s)
    else:
        # depois de empurrar, a pata vai arrastada para trás subindo devagar (quadro 18), dobra alta sob o quadril e desce à frente
        s_est, s_meio, s_rec = em_s(0.12, pisa, sai), em_s(0.38, pisa, sai), em_s(0.62, pisa, sai)
        kx = [(0, J_sai.x), (s_est, J_sai.x - 10), (s_meio, QUADRIL_X - 8), (s_rec, J_pisa.x + 2), (1, J_pisa.x)]   # estica bem para trás
        kz = [(0, J_sai.y), (s_est, J_sai.y + 4), (s_meio, JAR.y + 8), (s_rec, J_pisa.y + 3), (1, J_pisa.y)]
        J = Vector((curva_hermite(kx, s, -V * n_bal, -V * n_bal), curva_hermite(kz, s, 0, 0)))
    H = p2(cab(p + "top1")); l1 = (p2(cab(p + "bot0")) - H).length; l2 = (p2(cab(p + "ankle")) - p2(cab(p + "bot0"))).length
    v = J - H; d = v.length; corte = max(0.0, d - 0.995 * (l1 + l2))
    d = min(max(d, abs(l1 - l2) + 1e-3), 0.995 * (l1 + l2))
    a1 = math.acos(max(-1, min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))))
    girar(p + "top1", math.atan2(v.x, -v.y) + a1 - ang2(cab(p + "bot0") - cab(p + "top1")))   # joelho para a frente
    K = p2(cab(p + "bot0")); girar(p + "bot0", math.atan2((J - K).x, -(J - K).y) - ang2(cab(p + "ankle") - cab(p + "bot0")))
    tib = ang2(cab(p + "ankle") - cab(p + "bot0"))
    if tipo == "apoio":
        girar(p + "ankle", th_m(s) - ang2(cab(p + "toe") - cab(p + "ankle")))
        girar(p + "toe", DEDO_T0 - ang2(cau(p + "toe") - cab(p + "toe")))
    else:
        # jarrete: estica para trás (metatarso na linha da tíbia) e dobra quando a pata vem para a frente
        r_sai = th_m(1) - TIB_SAI[l]; r_pisa = th_m(0) - TIB_PISA[l]
        rel = curva_hermite([(0, r_sai), (em_s(0.12, pisa, sai), R(10)), (em_s(0.38, pisa, sai), R(75)), (em_s(0.62, pisa, sai), R(45)), (1, r_pisa)], s)
        girar(p + "ankle", tib + rel - ang2(cab(p + "toe") - cab(p + "ankle")))
        girar(p + "toe", ang2(cab(p + "toe") - cab(p + "ankle")) + (DEDO_T0 - TH0) - ang2(cau(p + "toe") - cab(p + "toe")))
    return corte, tib

def corpo(phi):
    for pb in PB: pb.matrix_basis.identity()
    atualiza()
    m = PB["body"].matrix.copy()
    m.translation += Wi.to_3x3() @ Vector((0, 0, -BAIXO + 1.2 * math.cos(4 * math.pi * (phi - 0.05)))); PB["body"].matrix = m; atualiza()
    alvo = R(-13) - R(24) * math.cos(2 * math.pi * (phi - 0.55))           # +11 esticada (fase 0,05), -37 bola (0,55): mais que isso a pele amassa
    extra = alvo - curva()
    antes = curva(); girar("body_top0", 0.25 * extra, piv=cab("body")); girar("body_bot", -0.75 * extra, piv=cab("body"))
    if abs(curva() - alvo) > abs(antes - alvo):
        girar("body_top0", -0.5 * extra, piv=cab("body")); girar("body_bot", 1.5 * extra, piv=cab("body"))
    # cabeça baixa, esticada para a frente e nivelada
    girar("neck0", R(-28)); girar("head0", R(22))           # cabeça baixa, na linha das costas, pescoço esticado
    # rabo esticado para trás, quase reto, com onda que atrasa até a ponta
    girar("tail0", R(72)); girar("tail1", R(14))            # rabo reto para trás, na altura das costas
    # do tail2 em diante cada osso continua a direção do anterior em 3D (desfaz o gancho de lado da ponta), subindo 3 graus por osso (ponta levanta de leve, como na prancha)
    for i, n in enumerate([f"tail{k}" for k in range(1, 7)]):
        if i > 0:
            ant = f"tail{i}"; alinha(n, cau(ant) - cab(ant)); girar(n, R(-1.5))
        girar(n, R(4) * math.sin(2 * math.pi * (phi - 0.55) - 0.7 * (i + 1)))

# precisa do ângulo do antebraço/tíbia na entrada e na saída do apoio de cada pata: primeira passada só mede
ANTE_SAI, ANTE_PISA, TIB_SAI, TIB_PISA = {}, {}, {}, {}
for l in ("left", "right"):
    for chave, fn, d_sai, d_pisa in (("front", pata_frente, ANTE_SAI, ANTE_PISA), ("hind", pata_tras, TIB_SAI, TIB_PISA)):
        pisa, sai = FASES[(chave, l)]
        d_sai[l] = d_pisa[l] = 0.0
        for alvo_phi, d in ((sai, d_sai), (pisa, d_pisa)):
            corpo(alvo_phi % 1.0); _, ang_ = fn(l, alvo_phi % 1.0 if chave == "front" else alvo_phi % 1.0); d[l] = ang_
cortes = []
for f in range(N + 1):
    phi = (f % N) / N
    corpo(phi)
    for l in ("left", "right"):
        c1, _ = pata_frente(l, phi); c2, _ = pata_tras(l, phi)
        if c1 > 0.05: cortes.append(("frente", l, f, round(c1, 2)))
        if c2 > 0.05: cortes.append(("trás", l, f, round(c2, 2)))
    for pb in PB:
        for c in ("location", "rotation_quaternion", "scale"): pb.keyframe_insert(c, frame=1 + f)
print("não alcança:", cortes)
bpy.ops.export_scene.gltf(filepath=SAI, export_format="GLB", export_animations=True, export_animation_mode="ACTIVE_ACTIONS")
print(f"exportado {SAI}: V = {V} por quadro = {V * 30:.0f} unidades por segundo, {N} quadros por passada")
