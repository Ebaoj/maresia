# VESTE uma camisa gerada JÁ EM POSE T (mangas na horizontal) num corpo em pose T (18/10, neto v5). Mais simples que
# o vestir.py (que abaixa os braços até a manga caída, encaixa e desfaz a pose: com a camisa nova isso só estragava):
#  1) tamanho pelos ossos: manga até o cotovelo, gola na base do pescoço, barra cobrindo o cós da calça;
#  2) cada manga é centrada no eixo do osso do braço, com folga em volta do braço;
#  3) o tronco é empurrado para fora do corpo (casca externa) por um deslocamento SUAVE (média na vizinhança: as
#     duas paredes do tecido andam juntas, sem rasgar);
#  4) pesos: manga = ossos do braço; tronco = pele mais perto do corpo (sem os ossos do braço).
# Uso: Blender -b CORPO_VESTIDO_OU_NU.blend --python blender/vestir_camisa_t.py -- CAMISA.glb SAIDA
#   CT_FOLGA (0.008 m)  CT_BARRA (0.05 m abaixo do osso Hips)  CT_GOLA (0.02 m acima do osso Neck)  CT_COTOVELO (0.0 m além)
import bpy, sys, os, math
import numpy as np
from mathutils import Vector
from mathutils.kdtree import KDTree
from mathutils.bvhtree import BVHTree

a = sys.argv[sys.argv.index("--") + 1:]; GLB, SAIDA = a[0], a[1]
FOLGA = float(os.environ.get("CT_FOLGA", "0.008"))
cena = bpy.context.scene
rig = next(o for o in cena.objects if o.type == "ARMATURE")
corpo = next(o for o in cena.objects if o.type == "MESH" and o.parent == rig and "-" not in o.name)
def osso(n): return np.array(rig.matrix_world @ rig.data.bones["mixamorig:" + n].head_local)
def pts(o):
    co = np.empty(len(o.data.vertices) * 3); o.data.vertices.foreach_get("co", co)
    return (np.array(o.matrix_world) @ np.c_[co.reshape(-1, 3), np.ones(len(o.data.vertices))].T).T[:, :3]
for o in [o for o in cena.objects if o.type == "MESH" and o.name.endswith("-camisa")]: bpy.data.objects.remove(o, do_unlink=True)

# ---- casca externa do corpo (uma superfície só, sem as camadas de dentro) ----
casca = corpo.copy(); casca.data = corpo.data.copy(); cena.collection.objects.link(casca); casca.modifiers.clear(); casca.parent = None
casca.matrix_world = corpo.matrix_world.copy()
for o in cena.objects: o.select_set(o == casca)
bpy.context.view_layer.objects.active = casca
rm = casca.modifiers.new("v", "REMESH"); rm.mode = "VOXEL"; rm.voxel_size = 0.006; bpy.ops.object.modifier_apply(modifier=rm.name)
bvh = BVHTree.FromObject(casca, bpy.context.evaluated_depsgraph_get())

# ---- camisa ----
antes = set(cena.objects); bpy.ops.import_scene.gltf(filepath=GLB)
cam = next(o for o in cena.objects if o not in antes and o.type == "MESH")
for o in list(cena.objects):
    if o not in antes and o != cam: bpy.data.objects.remove(o, do_unlink=True)
for o in cena.objects: o.select_set(o == cam)
bpy.context.view_layer.objects.active = cam; cam.parent = None
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
# 0) a camisa do Meshy tem parede dupla (fora e avesso a milímetros): depois de reduzida, as duas se cruzam e o
# tecido fica "esfarelado". Sai o avesso: faces cuja normal aponta para o eixo do corpo (tronco: eixo vertical;
# mangas: eixo horizontal de cada manga)
import bmesh
Q = pts(cam); cxq0 = (Q[:, 0].max() + Q[:, 0].min()) / 2; cyq0 = Q[:, 1].mean()
meia = (Q[:, 0].max() - Q[:, 0].min()) / 2
alt_m = Q[np.abs(Q[:, 0] - cxq0) > 0.8 * meia]; zm0 = alt_m[:, 2].mean()   # altura do eixo das mangas (pontas)
bm = bmesh.new(); bm.from_mesh(cam.data); bm.faces.ensure_lookup_table(); fora = []
lim_t = float(os.environ.get("CT_TRONCO_FRAC", "0.42")) * meia
for f in bm.faces:
    c = f.calc_center_median(); n = f.normal
    if abs(c.x - cxq0) < lim_t: r = Vector((c.x - cxq0, c.y - cyq0, 0))
    else: r = Vector((0, c.y - cyq0, c.z - zm0))
    if r.length > 1e-6 and n.dot(r.normalized()) < -0.2: fora.append(f)
bmesh.ops.delete(bm, geom=fora, context="FACES"); bm.to_mesh(cam.data); bm.free(); cam.data.update()
print(f"AVESSO apagado: {len(fora)} faces")
Q = pts(cam)
x0 = float(osso("Hips")[0])
xo, xc = abs(osso("LeftArm")[0] - x0), abs(osso("LeftForeArm")[0] - x0) + float(os.environ.get("CT_COTOVELO", "0.0"))
z_gola = osso("Neck")[2] + float(os.environ.get("CT_GOLA", "0.02")); z_barra = osso("Hips")[2] - float(os.environ.get("CT_BARRA", "0.05"))
z_braco = (osso("LeftArm")[2] + osso("RightArm")[2]) / 2; y_braco = (osso("LeftArm")[1] + osso("RightArm")[1]) / 2
# 1) escala: x pela ponta da manga no cotovelo; z pela gola e barra; y igual a x (depois o fundo se ajusta ao corpo)
cxq = (Q[:, 0].max() + Q[:, 0].min()) / 2; sx = xc / ((Q[:, 0].max() - Q[:, 0].min()) / 2)
sz = (z_gola - z_barra) / np.ptp(Q[:, 2])
Q = np.c_[(Q[:, 0] - cxq) * sx + x0, (Q[:, 1] - Q[:, 1].mean()) * sx, (Q[:, 2] - Q[:, 2].min()) * sz + z_barra]
Pc = pts(corpo); peito = Pc[(np.abs(Pc[:, 2] - osso("Spine2")[2]) < 0.03) & (np.abs(Pc[:, 0] - x0) < xo)]
Q[:, 1] += (np.percentile(peito[:, 1], 2) + np.percentile(peito[:, 1], 98)) / 2
print(f"CAMISA: escala x {sx:.3f} z {sz:.3f}; gola {z_gola:.3f}, barra {z_barra:.3f}, manga até x ±{xc:.3f}")
# 2) mangas: cada fatia (em x) além do ombro é centrada no eixo do braço, com folga em volta do braço
# mangas: centro e alargamento medidos em fatias de 1 cm ao longo do braço, SUAVIZADOS e interpolados por ponto
# (fatia por fatia dava borda serrilhada); além do ombro inteiro, com transição de 4 cm no ombro
d_ = np.abs(Q[:, 0] - x0); manga = d_ > xo
for sx_ in (1, -1):
    lado_m = manga & (np.sign(Q[:, 0] - x0) == sx_)
    xs = np.arange(xo, xc + 0.04, 0.01); cys, czs, ks = [], [], []
    for xx in xs:
        f = lado_m & (np.abs(d_ - xx) < 0.008)
        if f.sum() < 6: cys.append(np.nan); czs.append(np.nan); ks.append(np.nan); continue
        cy, cz = Q[f, 1].mean(), Q[f, 2].mean(); r_m = np.hypot(Q[f, 1] - cy, Q[f, 2] - cz)
        fb = (np.abs(sx_ * (Pc[:, 0] - x0) - xx) < 0.006) & (np.abs(Pc[:, 2] - z_braco) < 0.07) & (np.abs(Pc[:, 1] - y_braco) < 0.07)
        r_b = np.percentile(np.hypot(Pc[fb, 1] - y_braco, Pc[fb, 2] - z_braco), 95) if fb.sum() > 6 else 0.035
        cys.append(cy); czs.append(cz); ks.append(float(np.clip((r_b + FOLGA) / max(np.median(r_m), 1e-3), 1.0, 1.6)))
    def sv(v):
        v = np.array(v, float); ok = np.isfinite(v)
        if ok.sum() < 2: return np.full(len(v), np.nanmean(v) if ok.any() else 0.0)
        v = np.interp(np.arange(len(v)), np.nonzero(ok)[0], v[ok]); return np.convolve(np.r_[v[:2], v, v[-2:]], np.ones(5) / 5, "valid")
    cys, czs, ks = sv(cys), sv(czs), sv(ks)
    i_ = np.nonzero(lado_m)[0]; dd = d_[i_]
    cy = np.interp(dd, xs, cys); cz = np.interp(dd, xs, czs); k = np.interp(dd, xs, ks)
    w = np.clip((dd - xo) / 0.04, 0, 1); w = w * w * (3 - 2 * w)
    ny = y_braco + (Q[i_, 1] - cy) * k; nz = z_braco + (Q[i_, 2] - cz) * k
    Q[i_, 1] = Q[i_, 1] * (1 - w) + ny * w; Q[i_, 2] = Q[i_, 2] * (1 - w) + nz * w
cam.data.vertices.foreach_set("co", Q.ravel()); cam.data.update()
if os.environ.get("CT_PARA") == "2":
    bpy.data.objects.remove(casca, do_unlink=True); bpy.ops.wm.save_as_mainfile(filepath=f"{SAIDA}.blend"); print("PARADO no passo 2"); raise SystemExit
# 3) tronco: encaixe de envelope (sem colisão ponto a ponto, que rasgava): em cada faixa de altura a camisa é
# alargada em x e em y até envolver o corpo com folga (nunca apertada); transição suave entre faixas
tron = np.abs(Q[:, 0] - x0) < xo + 0.03
zs = np.arange(z_barra, z_gola + 0.01, 0.01); kx_, ky_, cy_ = [], [], []
for z_ in zs:
    fb = (np.abs(Pc[:, 2] - z_) < 0.008) & (np.abs(Pc[:, 0] - x0) < xo - 0.01)
    fq = tron & (np.abs(Q[:, 2] - z_) < 0.008) & (np.abs(Q[:, 0] - x0) < xo - 0.01)
    if fb.sum() < 8 or fq.sum() < 8: kx_.append(np.nan); ky_.append(np.nan); cy_.append(np.nan); continue
    bx = np.percentile(np.abs(Pc[fb, 0] - x0), 98); qx = np.percentile(np.abs(Q[fq, 0] - x0), 95)
    by0, by1 = np.percentile(Pc[fb, 1], [1, 99]); qy0, qy1 = np.percentile(Q[fq, 1], [3, 97])
    if z_ > z_gola - 0.035: kx_.append(np.nan); ky_.append(np.nan); cy_.append(np.nan); continue   # gola: só segue a faixa de baixo
    kx_.append(float(np.clip((bx + FOLGA) / max(qx, 1e-3), 1.0, 1.6))); ky_.append(float(np.clip((by1 - by0 + 2 * FOLGA) / max(qy1 - qy0, 1e-3), 1.0, 2.0)))
    cy_.append(((by0 + by1) / 2) - ((qy0 + qy1) / 2))
def suave(v):
    v = np.array(v, float); ok = np.isfinite(v); v = np.interp(np.arange(len(v)), np.nonzero(ok)[0], v[ok])
    return np.convolve(np.r_[v[:2], v, v[-2:]], np.ones(5) / 5, "valid")
kx_, ky_, cy_ = suave(kx_), suave(ky_), suave(cy_)
kx = np.interp(Q[:, 2], zs, kx_); ky = np.interp(Q[:, 2], zs, ky_); dy = np.interp(Q[:, 2], zs, cy_)
cyq = np.interp(Q[:, 2], zs, [np.mean(Q[(np.abs(Q[:, 2] - z_) < 0.008) & tron, 1]) if ((np.abs(Q[:, 2] - z_) < 0.008) & tron).any() else 0 for z_ in zs])
w_t = np.clip((xo + 0.03 - np.abs(Q[:, 0] - x0)) / 0.04, 0, 1)   # 1 no tronco, 0 na manga
Q[:, 0] = x0 + (Q[:, 0] - x0) * (1 + (kx - 1) * w_t)
Q[:, 1] = Q[:, 1] + ((cyq + dy) + (Q[:, 1] - cyq) * ky - Q[:, 1]) * w_t
print(f"ENVELOPE do tronco: alargado até x{np.nanmax(kx_):.2f} na largura e x{np.nanmax(ky_):.2f} na profundidade")
# 4) ombros: em cada fatia (em x) entre o pescoço e o fim do ombro, o topo da camisa fica acima do topo do corpo
# (com folga); o levantamento some para baixo em 6 cm
n_om = 0
for sx_ in (1, -1):
    for xx in np.arange(0.035, xo + 0.06, 0.01):
        fb = (np.abs(sx_ * (Pc[:, 0] - x0) - xx) < 0.006) & (Pc[:, 2] > z_braco - 0.06) & (Pc[:, 2] < z_gola + 0.01)
        fq = (np.abs(sx_ * (Q[:, 0] - x0) - xx) < 0.006) & (Q[:, 2] > z_braco - 0.08)
        if fb.sum() < 6 or fq.sum() < 6: continue
        for y0_, y1_ in ((-1, 0), (0, 1)):   # frente e costas separadas (o ombro é mais alto atrás)
            cyb = np.median(Pc[fb, 1]); fbb = fb & ((Pc[:, 1] - cyb) * (1 if y1_ else -1) >= 0); fqq = fq & ((Q[:, 1] - cyb) * (1 if y1_ else -1) >= 0)
            if fbb.sum() < 4 or fqq.sum() < 4: continue
            falta = Pc[fbb, 2].max() + float(os.environ.get("CT_FOLGA_OMBRO", "0.003")) - Q[fqq, 2].max()
            # 18/10: também abaixa o pano que sobra acima do ombro (alavanca alta = prateleira quando o braço desce);
            # perto da gola (x < 6 cm) não abaixa
            if falta < 0 and xx < 0.06: continue
            falta = max(falta, -float(os.environ.get("CT_OMBRO_BAIXA", "0.06")))
            if abs(falta) < 1e-4: continue
            sel = (np.abs(sx_ * (Q[:, 0] - x0) - xx) < 0.006) & ((Q[:, 1] - cyb) * (1 if y1_ else -1) >= 0)
            topo = Q[fqq, 2].max(); t = np.clip(1 - (topo - Q[sel, 2]) / (0.06 if falta > 0 else 0.10), 0, 1)
            Q[np.nonzero(sel)[0], 2] += falta * t; n_om += int((t > 0).sum())
print(f"OMBROS: {n_om} pontos ajustados à altura do ombro do corpo")
cam.data.vertices.foreach_set("co", Q.ravel()); cam.data.update()

# ---- pesos: manga pelos ossos do braço; tronco pela pele mais perto (sem ossos do braço) ----
nomes = {g.index: g.name for g in corpo.vertex_groups}
braco_ = ("Arm", "ForeArm", "Hand")
sem_braco = [i for i, v in enumerate(corpo.data.vertices) if v.groups and not any(any(b in nomes[g.group] for b in braco_) and g.weight > 0.3 for g in v.groups)]
kc = KDTree(len(sem_braco))
for t, i in enumerate(sem_braco): kc.insert(Pc[i], t)
kc.balance()
# 18/10: no ombro a camisa copia a pele do ombro COM o braço (a pele do corpo mistura tronco e braço ali): só com o
# tronco, o ombro da camisa ficava parado quando o braço descia e virava ombreira pontuda
com_peso = [i for i, v in enumerate(corpo.data.vertices) if v.groups]
ka = KDTree(len(com_peso))
for t, i in enumerate(com_peso): ka.insert(Pc[i], t)
ka.balance(); cam.vertex_groups.clear(); grupos = {}
def g_(n):
    if n not in grupos: grupos[n] = cam.vertex_groups.new(name=n)
    return grupos[n]
for i, q in enumerate(Q):
    d_ = abs(q[0] - x0); lado = "Left" if q[0] > x0 else "Right"
    wb = float(np.clip((d_ - (xo - 0.02)) / 0.05, 0, 1))   # 0 no tronco, 1 na manga
    if q[2] > z_braco - 0.03:   # 18/10: no alto do ombro o pano segue o braço desde 5 cm antes da junta (senão vira prateleira)
        wb = max(wb, float(np.clip((d_ - (xo - float(os.environ.get("CT_OMBRO_INICIO", "0.06")))) / 0.07, 0, 1)))
        # o alto do ombro gira só uma parte do braço (alavanca menor): cheio só a partir de 4 cm além da junta
        wb = min(wb, float(os.environ.get("CT_OMBRO_MAX", "0.5")) + float(np.clip((d_ - (xo + 0.04)) / 0.04, 0, 1)) * (1 - float(os.environ.get("CT_OMBRO_MAX", "0.5"))))
    wb = wb * wb * (3 - 2 * wb)
    w = {}
    if wb < 0.999:
        soma = {}
        ombro = d_ > xo - float(os.environ.get("CT_OMBRO_ZONA", "0.07")) and q[2] > z_braco - 0.06
        for _, t, dd in (ka.find_n(q, 6) if ombro else kc.find_n(q, 6)):
            vi = com_peso[t] if ombro else sem_braco[t]
            for gg in corpo.data.vertices[vi].groups: soma[nomes[gg.group]] = soma.get(nomes[gg.group], 0) + gg.weight
        s_ = sum(soma.values()) or 1
        for n, x in soma.items(): w[n] = (1 - wb) * x / s_
    if wb > 0:
        tf = float(np.clip((d_ - (xc - 0.04)) / 0.06, 0, 1))   # antebraço só perto do cotovelo
        w[f"mixamorig:{lado}Arm"] = w.get(f"mixamorig:{lado}Arm", 0) + wb * (1 - tf)
        if tf > 0: w[f"mixamorig:{lado}ForeArm"] = w.get(f"mixamorig:{lado}ForeArm", 0) + wb * tf
    for n, x in w.items():
        if x > 0.01: g_(n).add([i], x, "REPLACE")
cam.name = cam.data.name = corpo.name + "-camisa"
cam.parent = rig; cam.matrix_parent_inverse = rig.matrix_world.inverted()
md = cam.modifiers.new("Armature", "ARMATURE"); md.object = rig
bpy.data.objects.remove(casca, do_unlink=True)
bpy.ops.wm.save_as_mainfile(filepath=f"{SAIDA}.blend")
for o in cena.objects: o.select_set(o == rig or (o.type == "MESH" and o.parent == rig))
bpy.ops.export_scene.gltf(filepath=f"{SAIDA}.glb", export_format="GLB", use_selection=True, export_image_format="JPEG")
print("PRONTO camisa T")
