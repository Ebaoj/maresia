# Aterrissagem do pulo de cima para baixo COPIADA do gato real, quadro a quadro (rotoscopia).
# As juntas foram marcadas à mão nos quadros do vídeo (Slow Mo Guys, gato descendo da árvore, close da aterrissagem;
# arquivo de marcas em JSON, pixels do quadro, chão em y = "chao"). Cada ponto vira um alvo no plano do lado do gato
# (frente, altura acima do chão), na escala K pixels por unidade do modelo, e o esqueleto é posto em cima:
#   tronco: resolve deslocamento, inclinação, curva lombar, curva torácica e escápula para o ombro cair no ombro do
#           vídeo, a coluna apontar para o quadril do vídeo e a corcunda (meio das costas acima da corda) ser a mesma;
#           o comprimento da coluna é o do modelo (no vídeo o gato encolhido fica de viés e parece mais curto);
#   patas: IK de duas juntas até o punho/jarrete, metacarpo e metatarso no ângulo do vídeo; pata no chão fica parada;
#   cabeça: pescoço por IK até a cabeça do vídeo, crânio no ângulo orelha -> nariz; rabo pela direção dos 3 pontos.
# O tempo do vídeo é dividido por LENTO (câmera lenta do vídeo) para virar tempo real.
# Depois do agachamento (T_FIM) levanta até a pose de pé normal em LEVANTA segundos.
# Uso: Blender -b --python roto_pulo.py -- RIG.glb MARCAS.json SAIDA.glb [K=4.5] [LENTO=28] [FPS=60] [T_FIM=57.5] [LEVANTA=0.45] [MARCAS_TRONCO.json] [KT=4]
# Antes do vídeo: sai da caixa (anda até a borda, tomba sobre as patas de trás, cai em queda livre); a altura da caixa
# vem da física do primeiro quadro copiado e vai para SAIDA.caixa.json.
import bpy, sys, math, json
from mathutils import Vector, Matrix
from bpy_extras import anim_utils

a = sys.argv[sys.argv.index("--") + 1:]
ENT, MARCAS, SAI = a[0], a[1], a[2]
K = float(a[3]) if len(a) > 3 else 4.5
LENTO = float(a[4]) if len(a) > 4 else 28.0
FPS = int(a[5]) if len(a) > 5 else 60

for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
for x in list(bpy.data.actions): bpy.data.actions.remove(x)
cena = bpy.context.scene; cena.render.fps = FPS
bpy.ops.import_scene.gltf(filepath=ENT)
arm = [o for o in cena.objects if o.type == "ARMATURE"][0]
ad = arm.animation_data
for tr in list(ad.nla_tracks): ad.nla_tracks.remove(tr)
cb = anim_utils.action_get_channelbag_for_slot(ad.action, ad.action_slot)
for c in list(cb.fcurves): cb.fcurves.remove(c)
W = arm.matrix_world; Wi = W.inverted(); PB = arm.pose.bones
frente = Vector((0, -1, 0)); cima = Vector((0, 0, 1)); lateral = frente.cross(cima).normalized()
def atualiza(): bpy.context.view_layer.update()
def cab(n): return W @ PB[n].head
def cau(n): return W @ PB[n].tail
for pb in PB: pb.rotation_mode = "QUATERNION"; pb.matrix_basis.identity()
atualiza()
Z0 = min(cab(n).z for n in ("leg_front_left_ankle", "leg_hind_left_toe")) - 1.8     # chão (mundo)
def p2(v): return Vector((v.dot(frente), v.z - Z0))                                    # (frente, altura acima do chão)
def ang2(v): q = Vector((v.dot(frente), v.z)) if len(v) == 3 else v; return math.atan2(q.x, -q.y)   # 0 = para baixo, + = gira para a frente
def girar(n, ang, piv=None):
    pb = PB[n]; p = cab(n) if piv is None else piv
    Rm = Matrix.Translation(p) @ Matrix.Rotation(ang, 4, lateral) @ Matrix.Translation(-p)
    pb.matrix = Wi @ Rm @ W @ pb.matrix; atualiza()
def mover(n, d2):
    m = PB[n].matrix.copy(); m.translation += Wi.to_3x3() @ (frente * d2.x + cima * d2.y); PB[n].matrix = m; atualiza()
def rot(p, piv, ang):
    d = p - piv; c, s = math.cos(ang), math.sin(ang); return piv + Vector((d.x * c - d.y * s, d.x * s + d.y * c))

# ---------------- medidas do repouso ----------------
F0, T0n = "leg_front_left_", "leg_hind_left_"
R = {n: p2(cab(n)) for n in ("body", "body_bot", "body_top0", "body_top1", "scapula_left", F0 + "top0", T0n + "top1", "neck0", "head0", "ear_left_0")}
PB0, B0, TT0, TT1, SC = R["body"], R["body_bot"], R["body_top0"], R["body_top1"], R["scapula_left"]
OMr, Hr = R[F0 + "top0"], R[T0n + "top1"]
LQ = (OMr - Hr).length
ALT_ALM = p2(cab(F0 + "ankle")).y; ALT_MTP = p2(cab(T0n + "toe")).y                    # almofada / MTP acima do chão
LM = (p2(cab(F0 + "ankle")) - p2(cab(F0 + "bot0"))).length
LT = (p2(cab(T0n + "toe")) - p2(cab(T0n + "ankle"))).length
PHI0 = ang2(cab(F0 + "ankle") - cab(F0 + "bot0")); TH0 = ang2(cab(T0n + "toe") - cab(T0n + "ankle"))
DEDO_F = ang2(cau(F0 + "ankle") - cab(F0 + "ankle")); DEDO_T = ang2(cau(T0n + "toe") - cab(T0n + "toe"))
Er, Hh_r, Ht_r = R["ear_left_0"], R["head0"], p2(cau("head0"))
def normal(u): return Vector((u.y, -u.x)).normalized()          # perpendicular, lado de cima quando u aponta para trás
def sagitta(om, h, d): return (d - om).dot(normal(h - om))
SAG_R = sagitta(OMr, Hr, TT0)

# ---------------- marcas do vídeo -> plano do gato ----------------
M = json.load(open(MARCAS)); CHAO = M["chao"]
ts = sorted(M["quadros"], key=float); X0 = M.get("x0", 220)
def w(p): return Vector(((p[0] - X0) / K, (CHAO - p[1]) / K))
Q = []
for t in ts:
    d = {k: w(v) for k, v in M["quadros"][t].items() if isinstance(v, list)}
    if "Q" not in d:                                   # quadril fora do quadro: segue o eixo do corpo até o comprimento do modelo
        e = M["quadros"][t]["eixo"]; d["Q"] = d["OM"] + Vector((-e, 1)).normalized() * LQ
    Q.append([float(t), d])
# a marca OM é a frente do peito (o que se vê); a junta do ombro fica mais para cima (lado das costas) e para trás
OM_DORSO, OM_TRAS = 4.0, 1.0
for t, d in Q:
    u = (d["OM"] - d["Q"]).normalized(); n = Vector((-u.y, u.x))
    d["OM"] = d["OM"] + n * OM_DORSO - u * OM_TRAS
def quadro_corpo(d):
    u = (d["OM"] - d["Q"]).normalized(); return d["Q"], u, Vector((-u.y, u.x))
def rel(d, p): o, u, n = quadro_corpo(d); return Vector(((p - o).dot(u), (p - o).dot(n)))
def absol(d, r): o, u, n = quadro_corpo(d); return o + u * r.x + n * r.y
# sem a pata de trás / rabo no quadro: mesma pose em relação ao corpo do primeiro quadro em que aparecem;
# buraco no meio: interpola entre os vizinhos
for grupo in (("TJ", "TP"), ("R0", "R1", "R2")):
    com = [i for i, (_, d) in enumerate(Q) if all(k in d for k in grupo)]
    for i, (t, d) in enumerate(Q):
        if all(k in d for k in grupo): continue
        antes = [j for j in com if j < i]; depois = [j for j in com if j > i]
        for k in grupo:
            if k in d: continue
            if antes and depois:
                j0, j1 = antes[-1], depois[0]; s = (t - Q[j0][0]) / (Q[j1][0] - Q[j0][0])
                d[k] = Q[j0][1][k].lerp(Q[j1][1][k], s)
            else:
                j = depois[0] if depois else antes[-1]; d[k] = absol(d, rel(Q[j][1], Q[j][1][k]))
# corcunda: quanto o meio das costas está acima da corda ombro-quadril, normalizado pelo comprimento visto
sag = {}
for t, d in Q:
    if "Md" in d: sag[t] = sagitta(d["OM"], d["Q"], d["Md"]) * LQ / (d["Q"] - d["OM"]).length
ref = [v for t, v in sag.items() if t <= 53.9]                      # na parada de mão a coluna está reta
SAG_V0 = sum(ref) / len(ref)
for t, d in Q: d["sag"] = SAG_R + (sag[t] - SAG_V0 if t in sag else 0.0)

# ---------------- tempo: Hermite entre as marcas ----------------
T0v = Q[0][0]; N = round((Q[-1][0] - T0v) / LENTO * FPS)
def amostra(k, tv):
    xs = [t for t, _ in Q]; vs = [d[k] for _, d in Q]
    if tv <= xs[0]: return vs[0]
    if tv >= xs[-1]: return vs[-1]
    i = max(j for j in range(len(xs) - 1) if xs[j] <= tv)
    def tang(j):
        j0, j1 = max(0, j - 1), min(len(xs) - 1, j + 1); return (vs[j1] - vs[j0]) / (xs[j1] - xs[j0])
    h = xs[i + 1] - xs[i]; s = (tv - xs[i]) / h
    m0, m1 = tang(i) * h, tang(i + 1) * h
    parado = (vs[i] - vs[i + 1]).length < 1e-6 if isinstance(vs[i], Vector) else abs(vs[i] - vs[i + 1]) < 1e-9
    if parado: return vs[i]                                       # pata no chão não escorrega entre duas marcas iguais
    h00, h10, h01, h11 = 2*s**3 - 3*s**2 + 1, s**3 - 2*s**2 + s, -2*s**3 + 3*s**2, s**3 - s**2
    return vs[i] * h00 + m0 * h10 + vs[i + 1] * h01 + m1 * h11

# ---------------- tronco: mínimos quadrados (Levenberg-Marquardt, jacobiano numérico) ----------------
def fk(x):
    tx, ty, aa, b, c, s = x; t = Vector((tx, ty))
    om = rot(rot(rot(rot(OMr, SC, s), TT1, c), TT0, c), PB0, aa) + t
    h = rot(rot(Hr, B0, b), PB0, aa) + t
    d = rot(TT0, PB0, aa) + t
    return om, h, d
def resid(x, alvo):
    om, h, d = fk(x); omt, qt, sg = alvo
    r = [om.x - omt.x, om.y - omt.y]
    va, vt = h - om, qt - om
    dang = math.atan2(va.x * vt.y - va.y * vt.x, va.dot(vt)); r.append(dang * LQ)
    r.append((va.length - vt.length) * 0.15)
    r.append((sagitta(om, h, d) - sg) * 0.8)
    r += [x[5] * 10.0, (x[3] + 3 * x[4]) * 6.0]
    for v, lim in ((x[4], math.radians(28)), (x[3], math.radians(55)), (x[5], math.radians(30))):
        r.append(max(0.0, abs(v) - lim) * 40.0)
    return r
def resolve(x, alvo):
    lam = 1e-2
    for _ in range(40):
        r0 = resid(x, alvo); e0 = sum(v * v for v in r0)
        J = []
        for j in range(6):
            xp = list(x); xp[j] += 1e-4; J.append([(a_ - b_) / 1e-4 for a_, b_ in zip(resid(xp, alvo), r0)])
        A = [[sum(J[i][k] * J[j][k] for k in range(len(r0))) + (lam if i == j else 0) for j in range(6)] for i in range(6)]
        g = [-sum(J[i][k] * r0[k] for k in range(len(r0))) for i in range(6)]
        dx = gauss(A, g); xn = [xi + di for xi, di in zip(x, dx)]
        if sum(v * v for v in resid(xn, alvo)) < e0: x = xn; lam *= 0.3
        else: lam *= 10
        if max(abs(v) for v in dx) < 1e-6: break
    return x
def gauss(A, b):
    n = len(b); M_ = [row[:] + [b[i]] for i, row in enumerate(A)]
    for i in range(n):
        p = max(range(i, n), key=lambda r: abs(M_[r][i])); M_[i], M_[p] = M_[p], M_[i]
        for r in range(n):
            if r != i:
                f = M_[r][i] / M_[i][i]
                for c in range(i, n + 1): M_[r][c] -= f * M_[i][c]
    return [M_[i][n] / M_[i][i] for i in range(n)]

def ik2(cima_, baixo, filho, alvo, dobra_ccw):
    S = p2(cab(cima_)); l1 = (p2(cab(baixo)) - S).length; l2 = (p2(cab(filho)) - p2(cab(baixo))).length
    v = alvo - S; d = min(max(v.length, abs(l1 - l2) + 1e-3), 0.995 * (l1 + l2))
    a1 = math.acos(max(-1, min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))))
    girar(cima_, math.atan2(v.x, -v.y) + (a1 if dobra_ccw else -a1) - ang2(cab(baixo) - cab(cima_)))
    E = p2(cab(baixo)); girar(baixo, math.atan2((alvo - E).x, -(alvo - E).y) - ang2(cab(filho) - cab(baixo)))
    return max(0.0, v.length - d)

def perna_frente(lado, P, phi):
    p = f"leg_front_{lado}_"
    falta = ik2(p + "top0", p + "top1", p + "bot0", P - LM * Vector((math.sin(phi), -math.cos(phi))), False)
    girar(p + "bot0", phi - ang2(cab(p + "ankle") - cab(p + "bot0")))
    girar(p + "ankle", phi + (DEDO_F - PHI0) - ang2(cau(p + "ankle") - cab(p + "ankle")))
    return falta
def perna_tras(lado, Mt, th):
    p = f"leg_hind_{lado}_"
    falta = ik2(p + "top1", p + "bot0", p + "ankle", Mt - LT * Vector((math.sin(th), -math.cos(th))), True)
    girar(p + "ankle", th - ang2(cab(p + "toe") - cab(p + "ankle")))
    girar(p + "toe", th + (DEDO_T - TH0) - ang2(cau(p + "toe") - cab(p + "toe")))
    return falta

# ---------------- quadro a quadro ----------------
# Cada quadro vira um "estado" (tronco, cabeça, patas, rabo); os do vídeo vêm das marcas e, depois do agachamento
# (T_FIM), o gato levanta até a pose de pé normal: as de trás ficam onde pousaram, as da frente dão um passo até a
# distância de pé, coluna, cabeça e rabo voltam ao repouso.
def aplica(e, f, grava=True):
    x = e["x"]
    for pb in PB: pb.matrix_basis.identity()
    atualiza()
    mover("root", Vector((x[0], x[1])))
    girar("body", x[2]); girar("body_bot", x[3]); girar("body_top0", x[4]); girar("body_top1", x[4])
    girar("scapula_left", x[5]); girar("scapula_right", x[5])
    faltas.append(("pescoço", f, round(ik2("neck0", "neck1", "head0", e["cab"], False), 1)))
    if "rel_pesc" in e:                                              # cabeça relativa ao pescoço (trecho feito à mão)
        alvo_h = ang2(cau("neck1") - cab("neck1")) + DIF_PESC + e["rel_pesc"]
    else: alvo_h = ang2(Ht_r - Hh_r) + e["rh"]
    girar("head0", alvo_h - ang2(cau("head0") - cab("head0")))
    for lado, P in (("right", e["FP"]), ("left", e["FP2"])):          # lado direito é o de perto da câmera
        fa = perna_frente(lado, P, e["phi"])
        if fa > 0.5: faltas.append(("F" + lado[0], f, round(fa, 1)))
    for lado, Mt in (("right", e["Mt"]), ("left", e.get("Mt2", e["Mt"] + Vector((1.5, 0))))):
        fa = perna_tras(lado, Mt, e["th"])
        if fa > 0.5: faltas.append(("T" + lado[0], f, round(fa, 1)))
    for i in range(7):
        n = f"tail{i}"
        if n in PB: girar(n, e["d01"] + (e["d12"] - e["d01"]) * i / 6 - ang2(cau(n) - cab(n)))
    if grava:
        for pb in PB:
            for c in ("location", "rotation_quaternion", "scale"): pb.keyframe_insert(c, frame=1 + f)

T_FIM = float(a[6]) if len(a) > 6 else 57.5          # até aqui copia o vídeo; depois levanta
N = round((min(T_FIM, Q[-1][0]) - T0v) / LENTO * FPS)
x = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0]; plant_off = {}; faltas = []; roto = []
for f in range(N + 1):
    tv = T0v + f / FPS * LENTO
    G = {k: amostra(k, tv) for k in ("N", "E", "OM", "FW", "FP", "FP2", "Q", "TJ", "TP", "R0", "R1", "R2", "sag")}
    x = resolve(x, (G["OM"], G["Q"], G["sag"])); _, h_, _ = fk(x)
    rh = ang2(G["N"] - G["E"]) - ang2(Ht_r - Er)
    # a pata de trás vem com a diferença entre o quadril do modelo e o do vídeo; parada no chão enquanto apoiada
    off = h_ - G["Q"]
    if G["TP"].y < 0.8: off = plant_off.setdefault("T", off)
    else: plant_off.pop("T", None)
    TP = G["TP"] + off; TJ = G["TJ"] + off
    d01 = ang2(G["R1"] - G["R0"]); d12 = ang2(G["R2"] - G["R1"])
    roto.append({"x": list(x), "rh": rh, "cab": G["E"] + rot(Hh_r - Er, Vector((0, 0)), rh), "phi": ang2(G["FP"] - G["FW"]),
         "FP": Vector((G["FP"].x, max(ALT_ALM, G["FP"].y + ALT_ALM))), "FP2": Vector((G["FP2"].x, max(ALT_ALM, G["FP2"].y + ALT_ALM))),
         "th": ang2(TP - TJ), "Mt": Vector((TP.x, max(ALT_MTP, TP.y + ALT_MTP))),
         "d01": d01, "d12": d01 + (d12 - d01 + math.pi) % (2 * math.pi) - math.pi})

# ---------------- saída da caixa (antes do trecho do vídeo) ----------------
# O vídeo começa com o gato já caindo. Para trás no tempo, o corpo é um sólido em queda livre: o centro segue a
# parábola da gravidade e o giro é constante, com a velocidade e o giro medidos nos primeiros quadros copiados.
# Volta até a velocidade vertical ser zero: é o instante em que solta as patas de trás da borda. A altura da caixa
# sai daí (não é escolhida). Antes de soltar, o pendurar e soltar é copiado do mesmo vídeo (o gato no tronco).
G60 = 1.81 * (30.0 / FPS) ** 2                                   # gravidade por quadro² neste fps
V0 = Vector((0, 0))
def piv(e): return PB0 + Vector((e["x"][0], e["x"][1]))
def rigido(e, d, da, centro=None):
    c0 = piv(e) if centro is None else centro
    tr = lambda p: c0 + rot(p - c0, V0, da) + d
    n = dict(e); pv = tr(piv(e)) - PB0
    n["x"] = [pv.x, pv.y, e["x"][2] + da] + list(e["x"][3:])
    for c in ("cab", "FP", "FP2", "Mt", "Mt2"):
        if c in e: n[c] = tr(e[c])
    for c in ("rh", "phi", "th", "d01", "d12"): n[c] = e[c] + da
    return n
def rel_e(e, p): return rot(p - piv(e), V0, -e["x"][2])
def abs_e(e, r): return piv(e) + rot(r, V0, e["x"][2])
def suave(t): t = min(1.0, max(0.0, t)); return t * t * (3 - 2 * t)
def mistura(e0, e1, s):
    n = {"x": [v0 + (v1 - v0) * s for v0, v1 in zip(e0["x"], e1["x"])]}
    for c in ("rh", "phi", "th", "d01", "d12"): n[c] = e0[c] + (e1[c] - e0[c]) * s
    n["cab"] = abs_e(n, rel_e(e0, e0["cab"]).lerp(rel_e(e1, e1["cab"]), s))
    return n
NV = 4
vel = (piv(roto[NV]) - piv(roto[0])) / NV; om = (roto[NV]["x"][2] - roto[0]["x"][2]) / NV
TV = max(4, round(-vel.y / G60))
def voo(t): return vel * t + Vector((0, -0.5 * G60 * t * t))     # t <= 0: antes do primeiro quadro copiado
solta = rigido(roto[0], voo(-TV), om * -TV)                       # onde e como o corpo está ao soltar a borda
malha = max([o for o in cena.objects if o.type == "MESH"], key=lambda o: len(o.data.vertices))

# --- antes de soltar: COPIADO do mesmo vídeo, plano aberto: o gato pendurado de cabeça para baixo no tronco (a
# parede da caixa faz o papel do tronco) até soltar. Mesmo método da aterrissagem; as patas de trás, fora do quadro
# no começo, ficam plantadas na beira do tampo até aparecerem soltando.
MT = json.load(open(a[8] if len(a) > 8 else MARCAS.replace("marcas-slowmo-queda", "marcas-slowmo-tronco")))
KT = float(a[9]) if len(a) > 9 else 4.0
XW = MT["parede"]; Y_TOPO = 12.0                                  # tampo = onde as patas de trás estão ao soltar
def wt(p): return Vector(((p[0] - XW) / KT, (Y_TOPO - p[1]) / KT))  # local: parede em x = 0, tampo em y = 0
QT = []
for t in sorted(MT["quadros"], key=float):
    d = {k: wt(v) for k, v in MT["quadros"][t].items()}
    if "Q" not in d: d["Q"] = d["OM"] + Vector((-1.0, LQ))         # quadril fora do quadro: coluna na vertical
    QT.append([float(t), d])
for grupo in (("TP",), ("R0", "R1", "R2"), ("FP",)):
    com = [i_ for i_, (_, d) in enumerate(QT) if all(k in d for k in grupo)]
    for i_, (t, d) in enumerate(QT):
        for k in grupo:
            if k in d: continue
            if k == "TP": d[k] = Vector((-2.5, 0.0)); continue      # ainda na beira do tampo
            if k == "FP": d[k] = d["FP2"]; continue
            j_ = com[0]; d[k] = absol(d, rel(QT[j_][1], QT[j_][1][k]))
T0t = QT[0][0]; T1t = QT[-1][0]
def amostra_t(k, tv):
    xs_ = [t for t, _ in QT]; vs = [d[k] for _, d in QT]
    if tv <= xs_[0]: return vs[0]
    if tv >= xs_[-1]: return vs[-1]
    i_ = max(j_ for j_ in range(len(xs_) - 1) if xs_[j_] <= tv); h = xs_[i_ + 1] - xs_[i_]; u = (tv - xs_[i_]) / h
    if (vs[i_] - vs[i_ + 1]).length < 1e-6: return vs[i_]
    def tg(j_):
        a_, b_ = max(0, j_ - 1), min(len(xs_) - 1, j_ + 1); return (vs[b_] - vs[a_]) / (xs_[b_] - xs_[a_])
    return vs[i_] * (2*u**3 - 3*u**2 + 1) + tg(i_) * h * (u**3 - 2*u**2 + u) + vs[i_ + 1] * (-2*u**3 + 3*u**2) + tg(i_ + 1) * h * (u**3 - u**2)
NTR = round((T1t - T0t) / LENTO * FPS)
for pb in PB: pb.matrix_basis.identity()
atualiza()
pT = "leg_hind_right_"
L_COXA = sum((p2(cab(pT + b)) - p2(cab(pT + a_))).length for a_, b in (("top1", "bot0"), ("bot0", "ankle"))) * 0.97
L_TRAS = L_COXA + LT
NG = max(1, round((Q[0][0] - T1t) / LENTO * FPS))
alvo = rigido(roto[0], voo(-NG), om * -NG)
def construir_tronco(recuo):
    """recuo: quanto a parede (e a beira onde as patas de trás apoiam) fica atrás da superfície do tronco no vídeo."""
    xs = [0.0, 0.0, -math.pi / 2, 0.0, 0.0, 0.0]; local = []
    for k in range(NTR + 1):
        tv = T0t + k / FPS * LENTO
        G = {c: amostra_t(c, tv) for c in ("N", "E", "OM", "FP", "FP2", "Q", "TP", "R0", "R1", "R2")}
        xs = resolve(xs, (G["OM"], G["Q"], SAG_R)); _, h_, _ = fk(xs)
        rh = ang2(G["N"] - G["E"]) - ang2(Ht_r - Er)
        if G["TP"].y >= -0.5:                                       # na beira do tampo enquanto a perna alcança
            TP = Vector((G["TP"].x - recuo, ALT_MTP)); th = TH0
            jar = TP - LT * Vector((math.sin(th), -math.cos(th)))
            if (jar - h_).length > L_COXA:                          # perna esticando: metatarso alinha com a perna
                th = ang2(TP - h_)
            if (TP - h_).length > L_TRAS:                           # não alcança mais: escorrega da beira, pendurada
                TP = h_ + (TP - h_).normalized() * L_TRAS; th = ang2(TP - h_)
        else:
            TP = G["TP"] + Vector((0, ALT_MTP))
            if (TP - h_).length > L_TRAS: TP = h_ + (TP - h_).normalized() * L_TRAS
            th = ang2(TP - h_)
        d01 = ang2(G["R1"] - G["R0"]); d12 = ang2(G["R2"] - G["R1"])
        e = {"x": list(xs), "rh": rh, "cab": G["E"] + rot(Hh_r - Er, V0, rh), "phi": ang2(G["FP"] - G["OM"]),
             "FP": Vector((max(1.6 - recuo, G["FP"].x), G["FP"].y)), "FP2": Vector((max(1.6 - recuo, G["FP2"].x), G["FP2"].y)),
             "Mt": TP, "Mt2": TP + Vector((1.5, 0)), "th": th,
             "d01": d01, "d12": d01 + (d12 - d01 + math.pi) % (2 * math.pi) - math.pi}
        local.append(e)
    # do último quadro do tronco (47,4 s) ao primeiro da aterrissagem (49,2 s): o vídeo corta de câmera; queda livre
    D = piv(alvo) - piv(local[-1])
    pre = [rigido(e, D, 0.0) for e in local]
    fin = pre[-1]; r0 = rel_e(fin, fin["Mt"]); r1 = rel_e(roto[0], roto[0]["Mt"])
    f0 = (rel_e(fin, fin["FP"]), rel_e(fin, fin["FP2"])); f1 = (rel_e(roto[0], roto[0]["FP"]), rel_e(roto[0], roto[0]["FP2"]))
    for k in range(1, NG):
        t = k - NG; tgt = rigido(roto[0], voo(t), om * t); s_ = suave(k / NG)
        e = mistura(fin, tgt, s_); e["x"][0], e["x"][1] = tgt["x"][0], tgt["x"][1]
        e["Mt"] = abs_e(e, r0.lerp(r1, s_)); e["Mt2"] = e["Mt"] + Vector((1.5, 0)); e["th"] = fin["th"] + (roto[0]["th"] - fin["th"]) * s_
        e["FP"] = abs_e(e, f0[0].lerp(f1[0], s_)); e["FP2"] = abs_e(e, f0[1].lerp(f1[1], s_)); e["phi"] = fin["phi"] + (roto[0]["phi"] - fin["phi"]) * s_
        pre.append(e)
    return pre, D.x - recuo, D.y
pre, BORDA, ALT = construir_tronco(0.0)
vq = (piv(pre[-1]) - piv(pre[-4])) / 3
print(f"velocidade no fim do tronco {vq.y * FPS:.0f} u/s; no 1º quadro da aterrissagem {vel.y * FPS:.0f} u/s")
def mais_atras(estados):
    m = 1e9
    for e in estados:
        aplica(e, 0, grava=False); dg = bpy.context.evaluated_depsgraph_get(); me = malha.evaluated_get(dg).to_mesh()
        for v in me.vertices:
            q = p2(malha.matrix_world @ v.co)
            if q.y < ALT - 1.5: m = min(m, q.x)
        malha.evaluated_get(dg).to_mesh_clear()
    return m
recuo = 0.0
for volta in range(3):                                            # a parede fica encostada no gato, sem entrar nele
    pre, BORDA, ALT = construir_tronco(recuo); m = mais_atras(pre[::2] + roto[:6])
    print(f"recuo {recuo:.1f}: parede em {BORDA:.1f}, gato mais recuado em {m:.1f}")
    if m >= BORDA - 0.3: break
    recuo += BORDA - m + 0.5
# ---------------- de pé em cima até a ponta (sem vídeo: ancorado no 1º quadro copiado do tronco) ----------------
# O trecho termina EXATAMENTE em E0 (1º quadro do tronco), com a velocidade que o tronco tem ali. Três fases:
#   1) de pé -> o ombro avança até passar da borda; 2) o ombro desce rente à parede até E0, o quadril vem atrás por
#   cima do tampo (as de trás andam até a beirada) e o corpo passa por cima da quina sem entrar na caixa.
# Limites (a pele deforma fora deles): a perna da frente fica entre 93% e 112% da distância ombro-almofada de pé
# (cotovelo perto do de pé); medido: deixando encolher, o cotovelo dobrava 80-130° e a pele rasgava; cabeça e rabo
# giram RELATIVOS ao corpo (de pé -> E0), senão o giro do corpo soma e a cabeça dobra demais;
# a de trás fica perto da pose de pé até a fase 2; a cabeça só vai do ângulo de pé ao de E0, sem passar.
E0 = pre[0]; OM_E, Q_E, _ = fk(E0["x"])
for pb in PB: pb.matrix_basis.identity()
atualiza()
DIF_PESC = ang2(cau("head0") - cab("head0")) - ang2(cau("neck1") - cab("neck1"))
aplica(E0, 0, grava=False)
REL_PESC_E = ang2(cau("head0") - cab("head0")) - ang2(cau("neck1") - cab("neck1")) - DIF_PESC
REL_PESC_E = (REL_PESC_E + math.pi) % (2 * math.pi) - math.pi
for pb in PB: pb.matrix_basis.identity()
atualiza()
EPr = {n: p2(cab(n)) for n in ("leg_front_right_ankle", "leg_front_left_ankle", "leg_hind_right_toe", "leg_hind_left_toe")}
RABO_S = (ang2(cau("tail1") - cab("tail0")), ang2(cau("tail6") - cab("tail3")))
L_FRENTE = sum((p2(cab("leg_front_right_" + b)) - p2(cab("leg_front_right_" + a_))).length
               for a_, b in (("top0", "top1"), ("top1", "bot0"), ("bot0", "ankle")))
txs = BORDA - 1.5 - EPr["leg_front_right_ankle"].x                 # de pé com a pata da frente na beirada
OM_S, Q_S = OMr + Vector((txs, ALT)), Hr + Vector((txs, ALT))
ang = lambda v: math.atan2(v.y, v.x)
# ombro: anda até passar da borda e desce rente à parede até o de E0. Quadril: o mais perto possível da altura de pé
# (pernas de trás de pé), escolhido no círculo de raio = coluna em volta do ombro, com a condição de o corpo (raio
# R_CORPO em volta da linha ombro-quadril) passar POR CIMA da quina da caixa e o quadril ficar sobre o tampo.
R_CORPO = float(a[11]) if len(a) > 11 else 9.0
QUINA = Vector((BORDA, ALT))
PATA_BEIRA = E0["Mt"].copy()                                          # onde as de trás ficam na beirada (E0)
D_QP_MIN = min((Q_S - (EPr["leg_hind_right_toe"] + Vector((txs, ALT)))).length * 0.85, (Q_E - PATA_BEIRA).length) - 0.5
# O QUADRIL guia: (A) anda na altura de pé até ficar sobre a beirada; (B) gira em volta das patas de trás paradas na
# beirada até o quadril de E0. O ombro fica a um comprimento de coluna à frente, inclinando do ângulo de pé ao de E0,
# mas nunca mais baixo do que deixa o corpo (raio R_CORPO) passar por cima da quina.
ang = lambda v: math.atan2(v.y, v.x)
A_S = ang(OM_S - Q_S); A_E = ang(OM_E - Q_E)
H1 = Vector((BORDA - 3.0, Q_S.y))                                    # quadril sobre a beirada, na altura de pé
TH1 = ang(H1 - PATA_BEIRA); THE = ang(Q_E - PATA_BEIRA); THE = TH1 + (THE - TH1 + math.pi) % (2 * math.pi) - math.pi
R1 = (H1 - PATA_BEIRA).length; RE = (Q_E - PATA_BEIRA).length
A1 = max(A_E, math.radians(-50))
SA = (H1 - Q_S).length / ((H1 - Q_S).length + abs(THE - TH1) * (R1 + RE) / 2)
def livre(q, a_):
    om = q + Vector((math.cos(a_), math.sin(a_))) * LQ
    if om.y < ALT + R_CORPO and q.x < QUINA.x:
        d = (om - q).normalized(); n = Vector((d.y, -d.x))
        if (QUINA - q).dot(n) < R_CORPO: return None
    return om
def caminho(s):
    """s de 0 (de pé) a 1 (E0): ombro e quadril."""
    if s >= 0.999: return OM_E.copy(), Q_E.copy()
    if s <= SA:                                                      # parâmetro pelo comprimento do caminho: sem parada na troca de fase
        v = s / SA; q = Q_S.lerp(H1, v); a_ = A_S + (A1 - A_S) * v
    else:
        v = (s - SA) / (1 - SA); w = v
        th = TH1 + (THE - TH1) * w; r_ = R1 + (RE - R1) * w
        q = PATA_BEIRA + Vector((math.cos(th), math.sin(th))) * r_; a_ = A1 + (A_E - A1) * w
    while a_ < math.radians(60):
        om = livre(q, a_)
        if om is not None: return om, q
        a_ += math.radians(0.5)
    print(f"SEM OMBRO VÁLIDO em s={s:.2f}"); return q + Vector((math.cos(a_), math.sin(a_))) * LQ, q
# velocidade de chegada = a do tronco no 1º quadro (ombro por quadro); tempo do trecho sai dela
OM_1, _, _ = fk(pre[1]["x"]); v_t = (OM_1 - OM_E).length
dds = (caminho(1.0)[0] - caminho(0.98)[0]).length / 0.02
NB = round(min(2.4 * FPS, max(1.5 * FPS, 1.6 * dds / max(v_t, 1e-3))))
m_fim = v_t * NB / dds                                               # s'(1) para casar a velocidade
def tempo(t): return (m_fim - 2) * t ** 3 + (3 - m_fim) * t ** 2       # s(0)=0, s'(0)=0, s(1)=1, s'(1)=m_fim
print(f"de pé até a ponta: {NB} quadros ({NB / FPS:.2f} s); velocidade de chegada {v_t * FPS:.0f} u/s (s'={m_fim:.2f})")
# patas: paradas onde pisaram; passo só quando a perna sai da faixa (55% a 90%); no fim, vão para as de E0
DUR = round(0.13 * FPS)
D_FRENTE = (EPr["leg_front_right_ankle"] - p2(cab("leg_front_right_top0"))).length   # ombro -> almofada de pé
D_TRAS = Q_S.x - (EPr["leg_hind_right_toe"].x + txs)               # de pé, a pata de trás fica esse tanto atrás do quadril
pf = {"FP": EPr["leg_front_right_ankle"] + Vector((txs, ALT)), "FP2": EPr["leg_front_left_ankle"] + Vector((txs, ALT)),
      "Mt": EPr["leg_hind_right_toe"] + Vector((txs, ALT)), "Mt2": EPr["leg_hind_left_toe"] + Vector((txs, ALT))}
fim_p = {c: E0[c].copy() for c in pf}
passo = {c: None for c in pf}; ultimo = {c: -99 for c in pf}; antes = []
ombro_de = {"FP": "leg_front_right_top0", "FP2": "leg_front_left_top0"}
xs = list(pre[0]["x"]); xs[:] = [0.0] * 6
for k in range(NB):
    t = k / NB; sv = tempo(t); om, q = caminho(sv)
    xs = resolve(xs, (om, q, SAG_R)); om_, q_, _ = fk(xs)
    falta_fim = NB - k
    def precisa(c):
        P = pf[c]
        return (P - om_).length / D_FRENTE if c in ("FP", "FP2") else (q_.x - P.x)
    for c in sorted(pf, key=lambda c: -precisa(c) if c in ("Mt", "Mt2") else -abs(precisa(c) - 1.0)):
        if passo[c] or k - ultimo[c] < 3: continue
        par = "FP2" if c == "FP" else "FP" if c in ("FP", "FP2") else ("Mt2" if c == "Mt" else "Mt")
        P = pf[c]
        ordem_fim = {"Mt": 2, "Mt2": 1, "FP": 2, "FP2": 1}[c]           # último passo: exatamente a pata de E0
        hora_fim = (sv >= {"Mt": 0.38, "Mt2": 0.46}[c]) if c in ("Mt", "Mt2") else falta_fim <= ordem_fim * (DUR + 2)
        if hora_fim:   # as de trás chegam à beirada ANTES de o quadril passar por cima dela
            if (fim_p[c] - P).length > 0.5: passo[c] = (k, P.copy(), fim_p[c], max(1, min(DUR, NB - 1 - k))); ultimo[c] = k
            continue
        if passo[par]: continue
        if c in ("FP", "FP2"):
            d_ = (P - om_).length
            if d_ > min(1.12 * D_FRENTE, 0.97 * L_FRENTE) or d_ < 0.93 * D_FRENTE:
                if om_.y < ALT + 0.62 * L_FRENTE or P.x > BORDA:      # ombro baixo/à frente: pata vai para a parede
                    dx_ = (BORDA + 1.6) - om_.x; alc = 1.03 * D_FRENTE
                    alvo = Vector((BORDA + 1.6, om_.y - math.sqrt(max(4.0, alc * alc - dx_ * dx_))))
                    alvo.y = min(alvo.y, ALT - 3.0)
                else:
                    alvo = Vector((min(BORDA - 1.0, om_.x + 3.0), ALT + ALT_ALM))
                if (alvo - P).length > 2.0: passo[c] = (k, P.copy(), alvo, DUR); ultimo[c] = k
        else:
            if q_.x - P.x > D_TRAS + 5.0 or (P - q_).length > 0.9 * L_TRAS:   # pata ficou para trás do quadril
                alvo = Vector((min(fim_p[c].x, q_.x - D_TRAS + 6.0), ALT + ALT_MTP))
                if (alvo - P).length > 2.0: passo[c] = (k, P.copy(), alvo, DUR); ultimo[c] = k
    cur = {}
    for c in pf:
        if passo[c]:
            k0, p0, p1, dur = passo[c]; w_ = min(1.0, (k - k0) / max(1, dur))
            pos = p0.lerp(p1, suave(w_))
            if p0.y > ALT - 1 and p1.y > ALT - 1: pos.y += (2.0 if c in ("Mt", "Mt2") else 3.0) * math.sin(math.pi * w_)   # no tampo: levanta a pata
            else: pos.x += 2.5 * math.sin(math.pi * w_)                                    # na parede: afasta da parede
            if w_ >= 1.0: passo[c] = None; pf[c] = p1.copy()
            cur[c] = pos
        else: cur[c] = pf[c]
    na_parede = sum(1 for c in ("FP", "FP2") if cur[c].y < ALT - 1) / 2
    ss = suave(sv)
    sh = suave((sv - 0.6) / 0.4); rel_cab = (E0["rh"] - E0["x"][2]) * sh   # cabeça e rabo só vão para os de E0 no fim
    sr = suave((sv - 0.5) / 0.5)
    rel_r = RABO_S[0] + (E0["d01"] - E0["x"][2] - RABO_S[0]) * sr
    rel_r2 = RABO_S[1] + (E0["d12"] - E0["x"][2] - RABO_S[1]) * sr
    e = {"x": list(xs), "rh": xs[2] + rel_cab,
         "phi": PHI0 + (E0["phi"] - PHI0) * na_parede, "th": TH0 + (E0["th"] - TH0) * suave(max(0.0, (sv - 0.6) / 0.4)),
         "FP": cur["FP"], "FP2": cur["FP2"], "Mt": cur["Mt"], "Mt2": cur["Mt2"],
         "d01": xs[2] + rel_r, "d12": xs[2] + rel_r2}
    e["cab"] = abs_e(e, rel_e({"x": [0, 0, 0, 0, 0, 0]}, Hh_r).lerp(rel_e(E0, E0["cab"]), sh))
    e["rel_pesc"] = REL_PESC_E * sh
    antes.append(e)
print(f"DE PÉ ATÉ A PONTA: {len(antes)} quadros ({len(antes) / FPS:.2f} s), termina no 1º quadro copiado do tronco")
pre = antes + pre
print(f"CAIXA: altura {ALT:.1f} unidades ({ALT * 25 / 41.5:.0f} cm), borda em {BORDA:.1f}; tronco {NTR} quadros, corte {NG} quadros")
json.dump({"altura": ALT, "borda": BORDA}, open(SAI + ".caixa.json", "w"))
faltas.clear()
NP = len(pre)
for k, e in enumerate(pre): aplica(e, k)
for f, e in enumerate(roto): aplica(e, NP + f)
N = NP + N; e = roto[-1]
# ---------------- levanta até a pose de pé ----------------
NL = round(float(a[7]) * FPS) if len(a) > 7 else round(0.45 * FPS)
e0 = e
for pb in PB: pb.matrix_basis.identity()
atualiza()
ALM_R, ALM2_R = p2(cab("leg_front_right_ankle")), p2(cab("leg_front_left_ankle")); MTP_R = p2(cab("leg_hind_right_toe"))
tx = e0["Mt"].x - MTP_R.x                                  # as de trás não saem do lugar
fim = {"x": [tx, 0.0, 0.0, 0.0, 0.0, 0.0], "rh": 0.0, "cab": Hh_r + Vector((tx, 0)), "phi": PHI0, "th": TH0,
       "FP": ALM_R + Vector((tx, 0)), "FP2": ALM2_R + Vector((tx, 0)), "Mt": Vector((e0["Mt"].x, ALT_MTP)),
       "d01": e0["d01"], "d12": e0["d12"]}
for k in range(1, NL + 1):
    s = suave(k / NL); e = {}
    for c in ("rh", "phi", "th", "d01", "d12"): e[c] = e0[c] + (fim[c] - e0[c]) * s
    e["x"] = [v0 + (v1 - v0) * s for v0, v1 in zip(e0["x"], fim["x"])]
    e["cab"] = e0["cab"].lerp(fim["cab"], s); e["Mt"] = fim["Mt"]
    for c, atraso in (("FP", 0.15), ("FP2", 0.35)):          # passo da frente: uma pata depois da outra, com arco
        u = min(1.0, max(0.0, (k / NL - atraso) / 0.5)); su = suave(u)
        P = e0[c].lerp(fim[c], su); P.y += 5.0 * math.sin(math.pi * u); e[c] = P
    aplica(e, N + k)
ad.action.name = "pulo_descer_roto"
print(f"ROTO: {NP} saindo da caixa + {N - NP + 1} copiados + {NL} levantando a {FPS} fps ({(N + NL) / FPS:.2f} s reais; vídeo {T0v}-{T_FIM} s / {LENTO})")
print("não alcança:", [x_ for x_ in faltas if x_[2] > 0.5])
bpy.ops.export_scene.gltf(filepath=SAI, export_format="GLB", export_animations=True, export_animation_mode="ACTIVE_ACTIONS")
