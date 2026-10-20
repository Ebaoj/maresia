# Planta as patas de uma animação em ciclo (correr, por exemplo) para não escorregarem no jogo: no apoio, o ponto da
# pata que toca o chão anda para trás na MESMA velocidade constante V em todas as patas (a do corpo); no balanço, a pata
# segue o caminho original com a diferença das pontas distribuída aos poucos. Úmero/rádio (frente) e fêmur/tíbia
# (trás) por IK de dois ossos; carpo, metacarpo, metatarso e dedos mantêm a rotação original no mundo.
# Apoio de cada pata = quadros em que o ponto de contato está a menos de LIMIAR do chão (janela contínua no ciclo).
# V = média das velocidades de apoio das 4 patas no original (ou o valor passado).
# Opções do corpo (variáveis de ambiente), para o galope do gato real:
#   COLUNA=K  multiplica a dobra da coluna (arquear/esticar) em volta da média; gato galopando dobra ~49 graus por passada
#   CABECA=c  a cabeça fica com c do sobe e desce e do balanço originais (gato estabiliza a cabeça correndo); 1 = igual
#   RABO=r    o rabo acompanha a dobra extra da coluna, com atraso até a ponta (contrapeso), r por osso
# Uso: Blender -b --python plantar_patas.py -- ENTRADA.glb SAIDA.glb [V|auto] [LIMIAR]
import bpy, sys, math, os
from mathutils import Matrix, Vector
from bpy_extras import anim_utils

a = sys.argv[sys.argv.index("--") + 1:]
ENT, SAI = a[0], a[1]
V_ARG = a[2] if len(a) > 2 else "auto"
LIMIAR = float(a[3]) if len(a) > 3 else 2.2
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
cena = bpy.context.scene; cena.render.fps = 30
bpy.ops.import_scene.gltf(filepath=ENT)
arm = [o for o in cena.objects if o.type == "ARMATURE"][0]
ac = arm.animation_data.action
ini, fim = round(ac.frame_range[0]), round(ac.frame_range[1]); N = fim - ini
W = arm.matrix_world; Wi = W.inverted(); PB = arm.pose.bones
frente = Vector((0, -1, 0))
def atualiza(): bpy.context.view_layer.update()
def cab(n): return W @ PB[n].head
def cau(n): return W @ PB[n].tail
def rot_mundo(n):
    return (W @ PB[n].matrix).to_3x3().normalized() @ (W @ PB[n].bone.matrix_local).to_3x3().normalized().transposed()
def por_rot_mundo(n, Q):
    pb = PB[n]; h = cab(n)
    m = (Q @ (W @ pb.bone.matrix_local).to_3x3().normalized()).to_4x4(); m.translation = h
    pb.matrix = Wi @ m; atualiza()
def suave(t): t = min(1.0, max(0.0, t)); return t * t * (3 - 2 * t)
volta = lambda f: ini + (f - ini) % N

# (cima, baixo, osso cuja cabeça é a junta-alvo, osso cuja cabeça toca o chão, ossos de baixo com rotação mantida)
PERNAS = {}
for l in ("left", "right"):
    p = f"leg_front_{l}_"; PERNAS["F" + l[0].upper()] = (p + "top0", p + "top1", p + "bot0", p + "ankle", [p + "bot0", p + "ankle", p + "toe"])
    p = f"leg_hind_{l}_"; PERNAS["T" + l[0].upper()] = (p + "top1", p + "bot0", p + "ankle", p + "toe", [p + "ankle", p + "toe"])
COLUNA = float(os.environ.get("COLUNA", "1")); CABECA = float(os.environ.get("CABECA", "1")); RABO = float(os.environ.get("RABO", "0"))
lateral = frente.cross(Vector((0, 0, 1))).normalized()
RABOS = [f"tail{i}" for i in range(1, 7)]
CORPO = ["body_top0", "body_bot", "neck0", "neck1", "head0"] + RABOS
MEXE = sorted({n for c in PERNAS.values() for n in [c[0], c[1]] + c[4]} | set(CORPO))
def girar(n, ang, eixo=None, piv=None):
    pb = PB[n]; p = cab(n) if piv is None else piv; e = lateral if eixo is None else eixo
    R = Matrix.Translation(p) @ Matrix.Rotation(ang, 4, e) @ Matrix.Translation(-p)
    pb.matrix = Wi @ R @ W @ pb.matrix; atualiza()
def incl(p, q): d = q - p; return math.atan2(d.z, d.dot(frente))
def curva():   # dobra da coluna: inclinação da metade da frente menos a da metade de trás (negativo = arqueada)
    me = cab("body"); return incl(me, cau("body_top1")) - incl(cab("pelvis"), me)

# ---------- original ----------
orig = {}; info = {}
for f in range(ini, fim + 1):
    cena.frame_set(f)
    orig[f] = {n: (PB[n].location.copy(), PB[n].rotation_quaternion.copy(), PB[n].scale.copy()) for n in MEXE}
    info[f] = {k: {"pe": cab(c[3]), "junta": cab(c[2]), "meio": cab(c[1]), "q": {n: rot_mundo(n) for n in c[4]}} for k, c in PERNAS.items()}
    info[f]["curva"] = curva(); info[f]["nuca"] = cab("head0"); info[f]["q_cab"] = rot_mundo("head0"); info[f]["n1"] = cab("neck1")
cm = sum(info[f]["curva"] for f in range(ini, fim)) / N
nuca_m = sum((info[f]["nuca"] for f in range(ini, fim)), Vector()) / N
q_cab_m = None
apoio = {}; vel = {}
for k in PERNAS:
    z = [info[f][k]["pe"].z for f in range(ini, fim)]; chao = min(z)
    no_chao = [zz < chao + LIMIAR for zz in z]
    # maior janela contínua (cíclica) no chão
    melhor = (0, 0)
    for s in range(N):
        if no_chao[s] and not no_chao[s - 1]:
            L = 0
            while no_chao[(s + L) % N] and L < N: L += 1
            melhor = max(melhor, (L, s))
    L, s = melhor
    apoio[k] = (ini + s, L)          # primeiro quadro no chão, quadros no chão
    x0 = info[ini + s][k]["pe"].dot(frente); x1 = info[volta(ini + s + L - 1)][k]["pe"].dot(frente)
    vel[k] = (x0 - x1) / max(1, L - 1)
V = sum(vel.values()) / len(vel) if V_ARG == "auto" else float(V_ARG)
print("apoio (início, quadros):", apoio); print("velocidade de apoio original:", {k: round(v, 2) for k, v in vel.items()}, "-> V", round(V, 2))

# alvo do ponto de contato em cada quadro
def alvo_pe(k, f):
    s, L = apoio[k]; o = info[f][k]["pe"]
    x_ini = info[s][k]["pe"].dot(frente); x_fim = info[volta(s + L - 1)][k]["pe"].dot(frente)
    meio = (x_ini + x_fim) / 2; desl = V * (L - 1) / 2
    xn_ini, xn_fim = meio + desl, meio - desl              # nova entrada e saída do apoio
    t = (f - s) % N
    if t < L:
        x = xn_ini - V * t
    else:                                                     # balanço: original + correção que vai de uma ponta à outra
        sb = (t - (L - 1)) / (N - (L - 1))
        d0 = xn_fim - x_fim; d1 = xn_ini - x_ini
        x = o.dot(frente) + d0 + (d1 - d0) * suave(sb)
    return o + frente * (x - o.dot(frente))

# ---------- refaz ----------
cb = anim_utils.action_get_channelbag_for_slot(ac, arm.animation_data.action_slot)
for c in [c for c in cb.fcurves if any(f'"{n}"' in c.data_path for n in MEXE)]: cb.fcurves.remove(c)
cortes = []
for f in range(ini, fim + 1):
    cena.frame_set(f)
    for n in MEXE:
        pb = PB[n]; pb.rotation_mode = "QUATERNION"; pb.location, pb.rotation_quaternion, pb.scale = orig[f][n]
    atualiza()
    if COLUNA != 1:   # coluna: dobra extra repartida entre a metade da frente e a de trás, girando no osso "body"
        extra = (COLUNA - 1) * (info[f]["curva"] - cm)
        # as metades giram em sentidos opostos (girar as duas para o mesmo lado só inclinaria o gato inteiro)
        # a lombar (metade de trás) dobra muito mais que o tórax: 25% na frente, 75% atrás
        fr, tr = 0.25 * extra, 0.75 * extra
        antes = curva(); girar("body_top0", fr, piv=cab("body")); girar("body_bot", -tr, piv=cab("body"))
        if (curva() - antes) * extra < 0:          # sentido errado: desfaz e gira para o outro lado
            girar("body_top0", -2 * fr, piv=cab("body")); girar("body_bot", 2 * tr, piv=cab("body"))
    if RABO and COLUNA != 1:   # rabo segue a dobra extra com atraso (1,5 quadro por osso)
        for i, n in enumerate(RABOS):
            fa = volta(round(f - 1.5 * (i + 1)))
            girar(n, RABO * (COLUNA - 1) * (info[fa]["curva"] - cm))
    if CABECA != 1:   # cabeça firme: nuca e inclinação puxadas para a média; o pescoço (2 ossos) se ajusta por IK
        alvo_n = nuca_m + (info[f]["nuca"] - nuca_m) * CABECA
        R0 = cab("neck0"); l1, l2 = (cab("neck1") - R0).length, (cab("head0") - cab("neck1")).length
        v = alvo_n - R0; d = min(max(v.length, abs(l1 - l2) + 1e-4), (l1 + l2) * 0.999); u = v.normalized()
        a_ = (l1 * l1 - l2 * l2 + d * d) / (2 * d); h = math.sqrt(max(0, l1 * l1 - a_ * a_))
        w = (info[f]["n1"] - R0) - u * u.dot(info[f]["n1"] - R0); w = w.normalized() if w.length > 1e-6 else Vector((0, 0, 1))
        E = R0 + u * a_ + w * h
        for n, ponto in (("neck0", E), ("neck1", R0 + u * d)):
            atual = (cau(n) - cab(n)).normalized(); des = (ponto - cab(n)).normalized()
            por_rot_mundo(n, atual.rotation_difference(des).to_matrix() @ rot_mundo(n))
        qo = info[f]["q_cab"]; qm = info[ini]["q_cab"].to_quaternion().slerp(info[volta(ini + N // 2)]["q_cab"].to_quaternion(), 0.5)
        por_rot_mundo("head0", qm.slerp(qo.to_quaternion(), CABECA).to_matrix())
    for k, (cima_, baixo, junta, pe, dist) in PERNAS.items():
        o = info[f][k]
        alvo = alvo_pe(k, f) - (o["pe"] - o["junta"])        # junta-alvo mantendo a pose de baixo do original
        R = cab(cima_); l1, l2 = PB[cima_].length, PB[baixo].length
        v = alvo - R; d = v.length
        if d > 0.999 * (l1 + l2): cortes.append((k, f, round(d - 0.999 * (l1 + l2), 2)))
        d = min(max(d, abs(l1 - l2) + 1e-4), (l1 + l2) * 0.999); u = v.normalized()
        a_ = (l1 * l1 - l2 * l2 + d * d) / (2 * d); h = math.sqrt(max(0, l1 * l1 - a_ * a_))
        w = (o["meio"] - R) - u * u.dot(o["meio"] - R); w.normalize()
        E = R + u * a_ + w * h
        for n, ponto in ((cima_, E), (baixo, R + u * d)):
            atual = (cau(n) - cab(n)).normalized(); des = (ponto - cab(n)).normalized()
            por_rot_mundo(n, atual.rotation_difference(des).to_matrix() @ rot_mundo(n))
        for n in dist: por_rot_mundo(n, o["q"][n])
    for n in MEXE:
        for c in ("location", "rotation_quaternion", "scale"): PB[n].keyframe_insert(c, frame=f)
print("perna não alcança (pata, quadro, unidades):", cortes)
bpy.ops.export_scene.gltf(filepath=SAI, export_format="GLB", export_animations=True, export_animation_mode="ACTIVE_ACTIONS")
print("exportado", SAI, "V =", round(V, 3), "por quadro =", round(V * 30, 1), "unidades por segundo")
