# Andar do gato pela anatomia e pela locomoção do gato real, sobre o rig de rig_anatomico.py (walk-rig.glb).
# (motivos e medidas em finais/gato-anythingworld/analise/anatomia.md)
#  - Todas as patas apoiadas andam para trás na MESMA velocidade constante V (a do corpo no jogo): a pata não escorrega.
#    V = velocidade média das patas de trás no apoio do original (o caminho delas foi aprovado).
#  - Pata da frente: a almofada (articulação metacarpofalangeana) fica plantada; a escápula gira +-ESCAPULA graus
#    (para a frente ao pisar, para trás ao sair); úmero e rádio por IK com o cotovelo para trás; no fim do apoio o
#    calcanhar levanta (metacarpo gira sobre a almofada); no balanço o carpo dobra DOBRA graus e os dedos se encolhem.
#  - Pata de trás: mesmo caminho do original, mas com velocidade constante no apoio (o original acelera e freia).
#  - Corpo sobe e desce duas vezes por passo (SOBE), ombros e quadril rolam para o lado da pata apoiada (ROLA graus).
#  - Rabo: onda que vai da base para a ponta, com atraso e amplitude crescente.  Orelhas: balanço leve.
#  - Pata da frente direita = esquerda espelhada, meio ciclo depois.
# Uso: Blender -b --python andar_anatomico.py -- ENTRADA.glb SAIDA.glb [ESCAPULA DOBRA SOBE ROLA RABO]
import bpy, sys, math
from mathutils import Matrix, Vector
from bpy_extras import anim_utils

a = sys.argv[sys.argv.index("--") + 1:]
ENT, SAI = a[0], a[1]
num = [float(x) for x in a[2:]] + [None] * 5
ESCAPULA = math.radians(num[0] if num[0] is not None else 12)
DOBRA = math.radians(num[1] if num[1] is not None else 70)
SOBE = num[2] if num[2] is not None else 0.6
ROLA = math.radians(num[3] if num[3] is not None else 1.5)
RABO = math.radians(num[4] if num[4] is not None else 6)
PASSO_TRAS = 0.8          # passada de trás encurtada para casar com o alcance da perna da frente desta malha
ALTURA_BAL = 3.0          # quanto o punho sobe a mais no balanço
AVANCO = 0.5              # passada centrada no repouso da pata (a perna desta malha não alcança mais à frente)
CALCANHAR = math.radians(-40)   # ângulo do metacarpo quando a pata sai do chão (aponta para trás)

for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
cena = bpy.context.scene; cena.render.fps = 30
bpy.ops.import_scene.gltf(filepath=ENT)
arm = [o for o in cena.objects if o.type == "ARMATURE"][0]
ac = arm.animation_data.action
ini, fim = round(ac.frame_range[0]), round(ac.frame_range[1]); N = fim - ini
W = arm.matrix_world; Wi = W.inverted()
PB = arm.pose.bones
FE = [f"leg_front_left_{n}" for n in ("top0", "top1", "bot0", "ankle", "toe")]
FD = [f"leg_front_right_{n}" for n in ("top0", "top1", "bot0", "ankle", "toe")]
TRAS = {l: [f"leg_hind_{l}_{n}" for n in ("top0", "top1", "bot0", "ankle", "toe")] for l in ("left", "right")}
RABOS = [f"tail{i}" for i in range(1, 7)]
ORELHAS = ["ear_left_0", "ear_left_1", "ear_right_0", "ear_right_1"]
MEXE = ["body", "body_top1", "body_bot", "scapula_left", "scapula_right"] + FE + FD + TRAS["left"][1:] + TRAS["right"][1:] + RABOS + ORELHAS
frente = (W @ PB["neck1"].head - W @ PB["pelvis"].head); frente.z = 0; frente.normalize()
cima = Vector((0, 0, 1)); lateral = frente.cross(cima).normalized()
volta = lambda f: ini + (f - ini) % N
def suave(t): t = min(1.0, max(0.0, t)); return t * t * (3 - 2 * t)
def p2(v): return Vector((v.dot(frente), v.z))
def ang2(v): q = p2(v); return math.atan2(q.x, -q.y)          # 0 = para baixo, + = ponta para a frente
def cab(n): return W @ PB[n].head
def cau(n): return W @ PB[n].tail
def atualiza(): bpy.context.view_layer.update()
def girar(n, angulo, eixo, piv=None):
    pb = PB[n]; p = cab(n) if piv is None else piv
    R = Matrix.Translation(p) @ Matrix.Rotation(angulo, 4, eixo) @ Matrix.Translation(-p)
    pb.matrix = Wi @ R @ W @ pb.matrix; atualiza()
def rot_mundo(n):        # rotação do osso no mundo em relação ao repouso
    return (W @ PB[n].matrix).to_3x3().normalized() @ (W @ PB[n].bone.matrix_local).to_3x3().normalized().transposed()
def por_rot_mundo(n, Q):
    pb = PB[n]; h = cab(n)
    m = (Q @ (W @ pb.bone.matrix_local).to_3x3().normalized()).to_4x4(); m.translation = h
    pb.matrix = Wi @ m; atualiza()

# ---------- leitura do original ----------
orig = {}; info = {}
for f in range(ini, fim + 1):
    cena.frame_set(f)
    orig[f] = {n: (PB[n].location.copy(), PB[n].rotation_quaternion.copy(), PB[n].scale.copy()) for n in MEXE}
    d = {}
    for l, c in TRAS.items():
        d[l] = {"mtp": cab(c[4]), "jarrete": cab(c[3]), "joelho": cab(c[2]), "q_mt": rot_mundo(c[3]), "q_dedo": rot_mundo(c[4])}
    d["fe_punho"] = cab(FE[2])
    info[f] = d
# fases das patas de trás: apoio = almofada perto do chão
# apoio = do ponto mais à frente ao mais atrás da almofada (no apoio ela só vai para trás)
fase_t = {}
for l in TRAS:
    x = {f: p2(info[f][l]["mtp"]).x for f in range(ini, fim)}
    fase_t[l] = (max(x, key=x.get), min(x, key=x.get))
def apoio_u(f, pisa, sai):        # 0..1 no apoio, None no balanço
    t = (f - pisa) % N; n_ap = (sai - pisa) % N
    return t / n_ap if t <= n_ap else None
def balanco_s(f, pisa, sai):
    t = (f - sai) % N; n_bal = (pisa - sai) % N
    return t / n_bal if t <= n_bal else None
# velocidade do corpo: média das patas de trás no apoio
vs = []
for l, (pisa, sai) in fase_t.items():
    n_ap = (sai - pisa) % N
    vs.append((p2(info[pisa][l]["mtp"]).x - p2(info[volta(sai)][l]["mtp"]).x) / n_ap)
V = PASSO_TRAS * sum(vs) / len(vs)
# fases da frente esquerda: do original (sai quando o punho está mais atrás, pisa quando está mais à frente)
xs = {f: p2(info[f]["fe_punho"]).x for f in range(ini, fim)}
sai_f = volta(min(xs, key=xs.get) - 1); pisa_f = volta(max(xs, key=xs.get) + 1)
n_ap_f = (sai_f - pisa_f) % N
print(f"V = {V:.3f} por quadro (patas de trás {vs}); trás: {fase_t}; frente esq.: pisa {pisa_f} sai {sai_f} ({n_ap_f} quadros de apoio)")

# repouso da pata da frente: almofada (cabeça do osso ankle), metacarpo, chão
rest_W = lambda n: W @ PB[n].bone.head_local
alm0 = p2(rest_W(FE[3])); punho0 = p2(rest_W(FE[2]))
LM = (alm0 - punho0).length
PHI0 = math.atan2((alm0 - punho0).x, -(alm0 - punho0).y)
DEDO0 = ang2(W @ PB[FE[3]].bone.tail_local - rest_W(FE[3]))
L_AP = V * n_ap_f
X_PISA = alm0.x + AVANCO + L_AP / 2; X_SAI = X_PISA - L_AP
def alvo_alm(u): return Vector((X_PISA - L_AP * u, alm0.y))
def phi_apoio(u): return PHI0 + (CALCANHAR - PHI0) * suave((u - 0.55) / 0.45)
def punho_de(alm, phi): return alm - LM * Vector((math.sin(phi), -math.cos(phi)))
P_PISA = punho_de(alvo_alm(0), phi_apoio(0)); P_SAI = punho_de(alvo_alm(1), phi_apoio(1))
print(f"frente: passada no apoio {L_AP:.1f}, almofada de {X_PISA:.1f} a {X_SAI:.1f} (repouso {alm0.x:.1f})")

# ---------- apaga as curvas e refaz quadro a quadro ----------
cb = anim_utils.action_get_channelbag_for_slot(ac, arm.animation_data.action_slot)
for c in [c for c in cb.fcurves if any(f'"{n}"' in c.data_path for n in MEXE)]: cb.fcurves.remove(c)
def chaves(n, f):
    pb = PB[n]
    for c in ("location", "rotation_quaternion", "scale"): pb.keyframe_insert(c, frame=f)
corte = 0; falta = []; antebraco = {}; guard = {}
for f in range(ini, fim + 1):
    cena.frame_set(f)
    for n in MEXE:
        pb = PB[n]; pb.rotation_mode = "QUATERNION"; pb.location, pb.rotation_quaternion, pb.scale = orig[f][n]
    atualiza()
    ph = 2 * math.pi * (f - pisa_f) / N
    # corpo: sobe e desce 2x por passo (mais alto no meio do apoio de cada pata da frente), ombros e quadril rolam
    m = PB["body"].matrix.copy(); m.translation += Wi.to_3x3() @ Vector((0, 0, SOBE * math.cos(2 * (ph - math.pi * n_ap_f / N)))); PB["body"].matrix = m; atualiza()
    girar("body_top1", ROLA * math.sin(ph), frente)
    pisa_te = fase_t["left"][0]
    girar("body_bot", ROLA * math.sin(2 * math.pi * (f - pisa_te) / N), frente)
    # rabo: onda da base para a ponta (atraso de 0,6 rad por osso, amplitude crescendo até RABO na ponta)
    fase_rabo = 2 * math.pi * (f - pisa_te) / N
    for i, n in enumerate(RABOS):
        amp = RABO * (0.35 + 0.65 * i / (len(RABOS) - 1))
        girar(n, amp * math.sin(fase_rabo - 0.6 * (i + 1)), cima)
        girar(n, 0.3 * amp * math.sin(2 * fase_rabo - 0.6 * (i + 1)), lateral)
    # orelhas: balanço leve atrasado em relação ao sobe e desce da cabeça
    for lado in ("left", "right"):
        girar(f"ear_{lado}_0", math.radians(2.0) * math.sin(2 * ph - 1.2), lateral)
        girar(f"ear_{lado}_1", math.radians(3.0) * math.sin(2 * ph - 1.8), lateral)
    # patas de trás: almofada com velocidade constante no apoio; jarrete por IK; metatarso e dedos com a rotação original
    for l, c in TRAS.items():
        pisa, sai = fase_t[l]; u = apoio_u(f, pisa, sai); o = info[f][l]
        meio = (p2(info[pisa][l]["mtp"]).x + p2(info[volta(sai)][l]["mtp"]).x) / 2; n_ap = (sai - pisa) % N
        x_pisa = meio + V * n_ap / 2
        if u is not None:
            alvo_x = x_pisa - V * n_ap * u
        else:
            s = balanco_s(f, pisa, sai)
            d0 = (x_pisa - V * n_ap) - p2(info[volta(sai)][l]["mtp"]).x; d1 = x_pisa - p2(info[pisa][l]["mtp"]).x
            alvo_x = p2(o["mtp"]).x + d0 + (d1 - d0) * suave(s)
        mtp = o["mtp"] + frente * (alvo_x - p2(o["mtp"]).x)
        jar = mtp - (o["mtp"] - o["jarrete"])
        R = cab(c[1]); l1, l2 = PB[c[1]].length, PB[c[2]].length
        v = jar - R; dd = min(max(v.length, abs(l1 - l2) + 1e-4), (l1 + l2) * 0.9999); uu = v.normalized()
        a_ = (l1 * l1 - l2 * l2 + dd * dd) / (2 * dd); h = math.sqrt(max(0, l1 * l1 - a_ * a_))
        w = (o["joelho"] - R) - uu * uu.dot(o["joelho"] - R); w.normalize()
        E = R + uu * a_ + w * h
        for n, alvo in ((c[1], E), (c[2], R + uu * dd)):
            atual = (cau(n) - cab(n)).normalized(); des = (alvo - cab(n)).normalized()
            por_rot_mundo(n, atual.rotation_difference(des).to_matrix() @ rot_mundo(n))
        por_rot_mundo(c[3], o["q_mt"]); por_rot_mundo(c[4], o["q_dedo"])
    # pata da frente esquerda
    u = apoio_u(f, pisa_f, sai_f); s = balanco_s(f, pisa_f, sai_f)
    if u is not None:
        th = ESCAPULA * math.cos(math.pi * u); P = punho_de(alvo_alm(u), phi_apoio(u))
    else:
        th = -ESCAPULA * math.cos(math.pi * s)
        # para a frente por Hermite: sai e chega andando para trás na velocidade do chão (não desliza ao pisar)
        m = -V * (N - n_ap_f); h00, h10, h01, h11 = 2*s**3 - 3*s**2 + 1, s**3 - 2*s**2 + s, -2*s**3 + 3*s**2, s**3 - s**2
        P = Vector((h00 * P_SAI.x + h10 * m + h01 * P_PISA.x + h11 * m, P_SAI.y + (P_PISA.y - P_SAI.y) * suave(s) + ALTURA_BAL * math.sin(math.pi * s) ** 1.2))
    girar("scapula_left", th, lateral)
    S = p2(cab(FE[0])); l1 = (p2(cab(FE[1])) - S).length; l2 = (p2(cab(FE[2])) - p2(cab(FE[1]))).length
    v = P - S; dd = v.length
    if dd > 0.995 * (l1 + l2): corte += 1; falta.append((f, round(dd - 0.995 * (l1 + l2), 2), "apoio" if u is not None else "balanço"))
    dd = min(max(dd, abs(l1 - l2) + 1e-3), 0.995 * (l1 + l2))
    a1 = math.acos(max(-1, min(1, (l1 * l1 + dd * dd - l2 * l2) / (2 * l1 * dd))))
    th_h = math.atan2(v.x, -v.y) - a1                      # cotovelo para trás
    girar(FE[0], th_h - ang2(cab(FE[1]) - cab(FE[0])), lateral)
    E2 = p2(cab(FE[1])); tf = math.atan2((P - E2).x, -(P - E2).y)
    girar(FE[1], tf - ang2(cab(FE[2]) - cab(FE[1])), lateral)
    antebraco[f] = ang2(cab(FE[2]) - cab(FE[1]))
    if u is not None:   # apoio: metacarpo no ângulo do apoio, dedos deitados no chão
        girar(FE[2], phi_apoio(u) - ang2(cab(FE[3]) - cab(FE[2])), lateral)
        girar(FE[3], DEDO0 - ang2(cau(FE[3]) - cab(FE[3])), lateral)
    for n in MEXE:
        if n not in FD: chaves(n, f)     # FE[2:] do balanço é refeito na passada seguinte; o do apoio fica gravado aqui
# balanço do carpo (precisa do antebraço de quando sai e de quando pisa)
c_sai = phi_apoio(1) - antebraco[sai_f]; c_pisa = phi_apoio(0) - antebraco[pisa_f]
dedo_sai = DEDO0 - phi_apoio(1); dedo_pisa = DEDO0 - phi_apoio(0)
for f in range(ini, fim + 1):
    cena.frame_set(f); s = balanco_s(f, pisa_f, sai_f); u = apoio_u(f, pisa_f, sai_f)
    if u is None:
        for n in FE[2:]:
            pb = PB[n]; pb.location, pb.rotation_quaternion, pb.scale = orig[f][n]
        atualiza()
        dobra = DOBRA * (suave(s / 0.3) if s < 0.3 else 1 - suave((s - 0.3) / 0.55))
        rel = c_sai + (c_pisa - c_sai) * suave(s) - dobra
        girar(FE[2], antebraco[f] + rel - ang2(cab(FE[3]) - cab(FE[2])), lateral)
        meta = ang2(cab(FE[3]) - cab(FE[2]))
        rel_d = dedo_sai + (dedo_pisa - dedo_sai) * suave(s) - 0.4 * dobra
        girar(FE[3], meta + rel_d - ang2(cau(FE[3]) - cab(FE[3])), lateral)
    for n in FE[2:]: chaves(n, f)
    guard[f] = {n: rot_mundo(n) for n in ["body_top1", "scapula_left"] + FE}
# pata da frente direita = esquerda espelhada (relativa ao tronco), meio ciclo depois
Sx = Matrix.Diagonal((-1, 1, 1))   # espelho em x do mundo
cadeia_e = ["scapula_left"] + FE; cadeia_d = ["scapula_right"] + FD
for f in range(ini, fim + 1):
    cena.frame_set(f); fo = volta(f + N // 2); q_pai = rot_mundo("body_top1"); anterior_e = "body_top1"
    for ne, nd in zip(cadeia_e, cadeia_d):
        rel = guard[fo][anterior_e].transposed() @ guard[fo][ne]
        q = q_pai @ (Sx @ rel @ Sx); por_rot_mundo(nd, q); chaves(nd, f)
        q_pai = q; anterior_e = ne
bpy.ops.export_scene.gltf(filepath=SAI, export_format="GLB", export_animations=True, export_animation_mode="ACTIVE_ACTIONS")
print("falta de alcance (quadro, unidades, fase):", falta)
print(f"exportado {SAI}: quadros em que a pata da frente não alcança o alvo: {corte} de {N + 1}")
