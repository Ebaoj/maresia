# Deixa qualquer animação do gato mais mole ("gato é quase líquido"): reamostra com mais quadros (MULT vezes, 60 fps
# por padrão) e passa coluna, pescoço, cabeça, escápulas, rabo e orelhas por molas amortecidas no espaço do mundo:
# cada osso tenta manter a direção que tinha (inércia) quando o de cima mexe, e é puxado para a pose da animação por
# uma mola. Mais firme perto da base, mais solto nas pontas: atrasa, passa um pouco do ponto e assenta (follow-through).
# As patas continuam plantadas: depois das molas, cada perna volta por IK ao ponto (punho/jarrete) do original, e
# metacarpo, metatarso e dedos mantêm a rotação original no mundo.
# Uso: Blender -b --python mola_geral.py -- ENTRADA.glb SAIDA.glb [laco|unico] [MULT] [FORCA]
#   laco: animação em ciclo (simula voltas antes de gravar, para a emenda ficar sem tranco); FORCA < 1 = molas mais firmes
import bpy, sys, math
from mathutils import Matrix, Vector, Quaternion
from bpy_extras import anim_utils

a = sys.argv[sys.argv.index("--") + 1:]
ENT, SAI = a[0], a[1]
LACO = (a[2] if len(a) > 2 else "laco") == "laco"
MULT = int(a[3]) if len(a) > 3 else 2
FORCA = float(a[4]) if len(a) > 4 else 1.0
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
cena = bpy.context.scene; cena.render.fps = 30
bpy.ops.import_scene.gltf(filepath=ENT)
arm = [o for o in cena.objects if o.type == "ARMATURE"][0]
ad = arm.animation_data
for tr in list(ad.nla_tracks): ad.nla_tracks.remove(tr)
ac = ad.action
ini, fim = round(ac.frame_range[0]), round(ac.frame_range[1])
W = arm.matrix_world; Wi = W.inverted(); PB = arm.pose.bones
def atualiza(): bpy.context.view_layer.update()
rot3 = lambda m: m.to_3x3().normalized()

# (osso, frequência em Hz, amortecimento): mais firme na base, mais solto nas pontas
MOLAS = [("body_top0", 7.0, 0.75), ("body_top1", 6.5, 0.7), ("body_bot", 7.0, 0.75), ("pelvis", 6.0, 0.65),
         ("scapula_left", 14.0, 0.9), ("scapula_right", 14.0, 0.9),   # firmes: mola solta na escápula amassa a pele do ombro
         ("neck0", 6.0, 0.6), ("neck1", 5.0, 0.55), ("head0", 4.5, 0.55)]
MOLAS += [(f"tail{i}", f, 0.42) for i, f in enumerate((6.0, 5.0, 4.2, 3.6, 3.1, 2.7, 2.4))]
MOLAS += [("ear_left_0", 6.0, 0.4), ("ear_left_1", 5.0, 0.35), ("ear_right_0", 6.0, 0.4), ("ear_right_1", 5.0, 0.35)]
MOLAS = [(n, f / max(0.2, FORCA) ** 0.5, z) for n, f, z in MOLAS if n in PB]
ordem = [b.name for b in sorted(arm.data.bones, key=lambda b: len(b.parent_recursive))]
mola_de = {n: (2 * math.pi * f / (30 * MULT), z) for n, f, z in MOLAS}
PERNAS = []
for l in ("left", "right"):
    p = f"leg_front_{l}_"; PERNAS.append((p + "top0", p + "top1", p + "bot0", [p + "bot0", p + "ankle", p + "toe"], False))
    p = f"leg_hind_{l}_"; PERNAS.append((p + "top1", p + "bot0", p + "ankle", [p + "ankle", p + "toe"], True))

# ---------- amostra o original com MULT vezes mais quadros ----------
N = (fim - ini) * MULT
amostras = []
for i in range(N + 1):
    t = ini + i / MULT; f = math.floor(t); sub = t - f
    cena.frame_set(f, subframe=sub)
    d = {"loc": {pb.name: pb.location.copy() for pb in PB}, "rot": {pb.name: pb.rotation_quaternion.copy() for pb in PB},
         "esc": {pb.name: pb.scale.copy() for pb in PB}}
    d["alvo"] = {c[0]: (W @ PB[c[2]].head).copy() for c in PERNAS}
    d["dica"] = {c[0]: (W @ PB[c[1]].head).copy() for c in PERNAS}
    d["qd"] = {n: rot3(W @ PB[n].matrix) for c in PERNAS for n in c[3]}
    amostras.append(d)
print(f"{ENT}: {fim - ini} quadros -> {N} amostras a {30 * MULT} fps; laço: {LACO}")

cb = anim_utils.action_get_channelbag_for_slot(ac, ad.action_slot)
for c in list(cb.fcurves): cb.fcurves.remove(c)
cena.render.fps = 30 * MULT

def por_original(d):
    for pb in PB:
        pb.rotation_mode = "QUATERNION"; pb.location, pb.rotation_quaternion, pb.scale = d["loc"][pb.name], d["rot"][pb.name], d["esc"][pb.name]
    atualiza()

estado = {}; vel = {}
def passo_molas(d, primeiro):
    """Aplica as molas na amostra d (pose original já posta). Estado = rotação de cada osso no espaço da armadura."""
    for n in ordem:
        if n not in mola_de: continue
        pb = PB[n]; b = pb.bone
        Mp = PB[b.parent.name].matrix if b.parent else Matrix.Identity(4)
        off = rot3(b.parent.matrix_local).transposed() @ rot3(b.matrix_local) if b.parent else rot3(b.matrix_local)
        alvo = (rot3(Mp) @ off @ d["rot"][n].to_matrix()).to_quaternion()
        if primeiro or n not in estado:
            estado[n] = alvo.copy(); vel[n] = Vector()
        w, z = mola_de[n]; q = estado[n]; v = vel[n]
        for _ in range(4):                                      # 4 subpassos por amostra (estável)
            e = alvo @ q.inverted()
            if e.w < 0: e.negate()
            eixo, ang = e.to_axis_angle(); err = eixo * ang if ang > 1e-9 else Vector()
            v = v + (err * (w * w) - v * (2 * z * w)) * 0.25
            dq = Quaternion(v.normalized(), v.length * 0.25) if v.length > 1e-12 else Quaternion()
            q = (dq @ q).normalized()
        estado[n], vel[n] = q, v
        base = rot3(Mp) @ off
        pb.rotation_quaternion = (base.transposed() @ q.to_matrix()).to_quaternion()
        atualiza()

def ik_pernas(d):
    for cima, baixo, junta, dist, joelho_frente in PERNAS:
        R0 = W @ PB[cima].head; alvo = d["alvo"][cima]; dica = d["dica"][cima]
        l1 = (W @ PB[baixo].head - R0).length; l2 = (W @ PB[junta].head - W @ PB[baixo].head).length
        v = alvo - R0; dd = min(max(v.length, abs(l1 - l2) + 1e-4), (l1 + l2) * 0.9999); u = v.normalized()
        a_ = (l1 * l1 - l2 * l2 + dd * dd) / (2 * dd); h = math.sqrt(max(0.0, l1 * l1 - a_ * a_))
        wv = (dica - R0) - u * u.dot(dica - R0); wv = wv.normalized() if wv.length > 1e-6 else u.orthogonal().normalized()
        E = R0 + u * a_ + wv * h
        for n, ponto in ((cima, E), (baixo, R0 + u * dd)):
            pb = PB[n]; hd = W @ pb.head; atual = (W @ pb.tail - hd).normalized(); des = (ponto - hd).normalized()
            Q = atual.rotation_difference(des).to_matrix() @ rot3(W @ pb.matrix)
            m = Q.to_4x4(); m.translation = hd; pb.matrix = Wi @ m; atualiza()
        for n in dist:
            pb = PB[n]; hd = W @ pb.head; m = d["qd"][n].to_4x4(); m.translation = hd; pb.matrix = Wi @ m; atualiza()

# laço: aquece as molas rodando o ciclo antes de gravar
if LACO:
    for volta in range(3):
        for i in range(N):
            por_original(amostras[i]); passo_molas(amostras[i], volta == 0 and i == 0)
for i in range(N + 1):
    d = amostras[i if not (LACO and i == N) else N]
    por_original(d); passo_molas(d, (not LACO) and i == 0)
    ik_pernas(d)
    for pb in PB:
        for c in ("location", "rotation_quaternion", "scale"): pb.keyframe_insert(c, frame=1 + i)
bpy.ops.export_scene.gltf(filepath=SAI, export_format="GLB", export_animations=True, export_animation_mode="ACTIVE_ACTIONS")
print("exportado", SAI)
