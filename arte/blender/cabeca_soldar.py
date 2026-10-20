# SOLDA da cabeça detalhada no pescoço do corpo (sucessor do cabeca_assentar.py, 17/10). Em vez de planos (corte
# reto, peças separadas, sempre uma linha), a cabeça é cortada por uma linha CURVA que segue a anatomia (embaixo do
# queixo, ângulo da mandíbula sob as orelhas, linha do cabelo na nuca), o corpo perde tudo acima da mesma linha um
# pouco abaixo, e as duas bordas são LIGADAS por uma faixa de triângulos (bridge) numa malha só, depois alisada.
# Expressões: as shape keys da cabeça entram no corpo pelo nome. Pescoço e nuca vêm do corpo.
# Uso: Blender -b CORPO_RIG.blend --python blender/cabeca_soldar.py -- CABECA.blend SAIDA_PREFIXO
#   SOL_FOLGA (0 m)  SOL_COSTURA (0.02 m de faixa)  SOL_ALISA (2)  ASS_ENCOLHE (1, número ou auto)  e os ASS_* do cabeca_assentar.py
# (cabeçalho herdado:) Cabeça detalhada SEM pescoço assentada no pescoço do corpo (recomendação do Joabe, 17/10): a cabeça é cortada por um
# corte em dois planos (queixo -> ângulo da mandíbula -> fim do cabelo na nuca): nuca e pescoço vêm do corpo, o corpo perde tudo acima do mesmo plano um pouco
# mais baixo, e a borda do pescoço do corpo encosta na borda da cabeça. Corte por plano (bisect), não por vértice:
# borda reta, sem zigue-zague. Tom da pele da cabeça levado ao do pescoço perto da borda (cor de vértice).
# Uso: Blender -b CORPO_RIG.blend --python blender/cabeca_assentar.py -- CABECA.blend SAIDA_PREFIXO
#   ASS_AJUSTE ("escala,z_dos_olhos,subida", medido contra a cabeça original)  ASS_QUEIXO (0.006 m abaixo do queixo)
#   ASS_ESPALHA (0.025 m)  ASS_MANDIBULA (0.01 m acima do osso Head)  ASS_NUCA (-0.01 m)  ASS_Y_MEIO  ASS_FOLGA (0.002 m)
import bpy, sys, os, bmesh
import numpy as np
from mathutils import Vector, Matrix
from mathutils.kdtree import KDTree

a = sys.argv[sys.argv.index("--") + 1:]
CAB, SAIDA = a[0], a[1]
QUEIXO = float(os.environ.get("ASS_QUEIXO", "0.006")); FOLGA = float(os.environ.get("ASS_FOLGA", "0.002"))
cena = bpy.context.scene
rig = next(o for o in cena.objects if o.type == "ARMATURE")
corpo = next(o for o in cena.objects if o.type == "MESH" and o.parent == rig)
def osso(n): return np.array(rig.matrix_world @ rig.data.bones["mixamorig:" + n].head_local)
def pts(o, co=None):
    if co is None: co = np.empty(len(o.data.vertices) * 3); o.data.vertices.foreach_get("co", co)
    return (np.array(o.matrix_world) @ np.c_[np.asarray(co).reshape(-1, 3), np.ones(len(o.data.vertices))].T).T[:, :3]
LUM = np.array([0.2126, 0.7152, 0.0722])
def cor_vertices(ob):
    nt = ob.active_material.node_tree
    tex = next(n for n in nt.nodes if n.type == "TEX_IMAGE" and n.image and any(l.to_node.type in ("MIX", "BSDF_PRINCIPLED") for l in n.outputs[0].links))
    img = tex.image; _ = img.pixels[0]
    im = img.copy(); im.scale(512, 512); px = np.array(im.pixels[:]).reshape(512, 512, 4); bpy.data.images.remove(im)
    # cor lida em cada canto (loop) e só depois média por vértice: num vértice soldado na costura de UV a média das
    # UVs caía noutra ilha (camiseta) e o pescoço era lido como branco
    cor = np.zeros((len(ob.data.vertices), 3)); cont = np.zeros(len(ob.data.vertices))
    lv = np.empty(len(ob.data.loops), dtype=np.int64); ob.data.loops.foreach_get("vertex_index", lv)
    luv = np.empty(len(ob.data.loops) * 2); ob.data.uv_layers[0].data.foreach_get("uv", luv); luv = luv.reshape(-1, 2)
    cl = px[np.clip((luv[:, 1] * 511).astype(int), 0, 511), np.clip((luv[:, 0] * 511).astype(int), 0, 511), :3]
    np.add.at(cor, lv, cl); np.add.at(cont, lv, 1); return cor / np.maximum(cont, 1)[:, None]
def pele_de(C): return (C @ LUM > 0.16) & (C[:, 0] - C[:, 2] > 0.06)

zn, zh, zt = osso("Neck")[2], osso("Head")[2], osso("HeadTop_End")[2]
Pc = pts(corpo); regiao = (Pc[:, 2] > zn - 0.02) & (np.abs(Pc[:, 0]) < 0.16)
# ---- cabeça detalhada: só escala e posição (faixa queixo-olhos) + ajuste medido ----
with bpy.data.libraries.load(CAB, link=False) as (src, dst): dst.objects = ["cabeca"]
cab = dst.objects[0]; cena.collection.objects.link(cab); cab.parent = None
kb = cab.data.shape_keys.key_blocks
for k in kb: k.value = 0
Q = pts(cab, np.array([v.co[:] for v in kb["Basis"].data]).ravel())
zalinha = zn + 0.55 * (zh - zn); zfaixa = zh + 0.5 * (zt - zh)
alvo = Pc[regiao & (Pc[:, 2] > zalinha) & (Pc[:, 2] < zfaixa)]
s0 = (zt - zalinha) / (Q[:, 2].max() - np.percentile(Q[:, 2], 25))
T = np.eye(4); T[:3, :3] *= s0; Q0 = Q * s0
T[:3, 3] = [alvo[:, 0].mean() - Q0[:, 0].mean(), alvo[:, 1].mean() - Q0[:, 1].mean(), zt - Q0[:, 2].max()]
Qa = (T @ np.c_[Q, np.ones(len(Q))].T).T[:, :3]
kd = KDTree(len(alvo))
for i, p in enumerate(alvo): kd.insert(p, i)
kd.balance(); rng = np.random.default_rng(0)
for _ in range(40):
    sel = Qa[(Qa[:, 2] > zalinha) & (Qa[:, 2] < zfaixa)]; am = sel[rng.choice(len(sel), min(8000, len(sel)), replace=False)]
    pr = np.array([kd.find(q)[0][:] for q in am]); d = np.linalg.norm(pr - am, axis=1); ok = d < np.percentile(d, 70)
    A_, B_ = am[ok], pr[ok]; ca, cb = A_.mean(0), B_.mean(0)
    s = np.sum((A_ - ca) * (B_ - cb)) / ((A_ - ca) ** 2).sum(); t = cb - s * ca
    M = np.eye(4); M[:3, :3] = s * np.eye(3); M[:3, 3] = t; T = M @ T; Qa = (T @ np.c_[Q, np.ones(len(Q))].T).T[:, :3]
if os.environ.get("ASS_AJUSTE"):
    ea, pz, dz = [float(x) for x in os.environ["ASS_AJUSTE"].split(",")]
    Adj = np.eye(4); Adj[:3, :3] *= ea; Adj[:3, 3] = np.array([Qa[:, 0].mean(), Qa[:, 1].mean(), pz]) * (1 - ea) + [0, 0, dz]; T = Adj @ T
# ASS_ENCOLHE: número (0.95 = 5% menor) ou "auto" (17/10, pedido do Joabe): a cabeça encolhe até o pescoço que veio
# com ela (logo abaixo do queixo) ter a largura do pescoço do corpo na mesma altura. Sempre em torno do assento (osso Head).
ENC = os.environ.get("ASS_ENCOLHE", "1")
def escala_em_volta(T, f):
    Qx = (T @ np.c_[Q, np.ones(len(Q))].T).T[:, :3]
    Adj = np.eye(4); Adj[:3, :3] *= f; Adj[:3, 3] = np.array([Qx[:, 0].mean(), Qx[:, 1].mean(), zh]) * (1 - f); return Adj @ T
if ENC == "auto":
    # faixa de pescoço "puro" do corpo: acima da gola e abaixo da mandíbula antiga (medida 17/10: 7,6-8,0 cm de largura)
    zs = np.arange(zn + 0.035, zh - 0.015, 0.006)
    def largura(P, z): s_ = (np.abs(P[:, 2] - z) < 0.003) & (np.abs(P[:, 0]) < 0.12); return np.percentile(P[s_, 0], 98) - np.percentile(P[s_, 0], 2) if s_.sum() > 8 else np.nan
    wc = np.nanmedian([largura(Pc, z) for z in zs])
    for it in range(6):
        Qx = (T @ np.c_[Q, np.ones(len(Q))].T).T[:, :3]; wq = np.nanmedian([largura(Qx, z) for z in zs]); r = wc / wq
        print(f"PESCOÇO: cabeça {wq * 100:.2f} cm, corpo {wc * 100:.2f} cm (z {zs[0]:.3f}-{zs[-1]:.3f}) -> x{r:.3f}")
        if not np.isfinite(r) or abs(r - 1) < 0.003: break
        T = escala_em_volta(T, r)
elif float(ENC) != 1: T = escala_em_volta(T, float(ENC))
EXTRA = float(os.environ.get("ASS_ENCOLHE_EXTRA", "1"))   # 17/10: depois do auto, "reduz a cabeça em 5%" -> 0.95
if EXTRA != 1: T = escala_em_volta(T, EXTRA)
DESCE = float(os.environ.get("ASS_DESCE", "0"))   # 17/10: "desce a cabeça uns 5 cm" -> 0.05; a linha de corte desce junto
FRENTE = float(os.environ.get("ASS_FRENTE", "0"))   # 17/10: "avança a cabeça um pouquinho pra frente" (frente é -Y)
if DESCE or FRENTE: Adj = np.eye(4); Adj[2, 3] = -DESCE; Adj[1, 3] = -FRENTE; T = Adj @ T
Mfinal = T @ np.array(cab.matrix_world)
for k in kb:
    X = np.array([v.co[:] for v in k.data]); k.data.foreach_set("co", ((Mfinal @ np.c_[X, np.ones(len(X))].T).T[:, :3]).ravel())
cab.matrix_world = Matrix.Identity(4)
cab.data.vertices.foreach_set("co", np.array([v.co[:] for v in kb["Basis"].data]).ravel()); cab.data.update()
Pq = pts(cab)
print(f"ALINHADA escala {np.cbrt(abs(np.linalg.det(T[:3, :3]))):.4f}")

# ---- linha de corte curva em volta do pescoço: z(θ) = a + b cosθ + c cos2θ passando pelo queixo (θ=0, frente),
# pelo ângulo da mandíbula (θ=±90°, sob as orelhas) e pela linha do cabelo na nuca (θ=180°) ----
anel = Pc[(np.abs(Pc[:, 2] - zn) < 0.01) & (np.abs(Pc[:, 0]) < 0.05)]
y_frente, y_tras = anel[:, 1].min(), anel[:, 1].max()
pele_q = pele_de(cor_vertices(cab)); cx = Pq[:, 0].mean(); cy = (y_frente + y_tras) / 2
meio = (np.abs(Pq[:, 0] - cx) < 0.03) & pele_q & (Pq[:, 1] < y_frente - 0.005) & (Pq[:, 2] < zh + 0.02)
f_ = float(Pq[meio, 2].min()) - QUEIXO
s_ = zh - DESCE + float(os.environ.get("ASS_MANDIBULA", "0.01")); k_ = zh - DESCE + float(os.environ.get("ASS_NUCA", "-0.01"))
b_ = (f_ - k_) / 2; a_ = ((f_ + k_) / 2 + s_) / 2; c_ = ((f_ + k_) / 2 - s_) / 2
def zcorte(P):
    P = np.atleast_2d(P); th = np.arctan2(P[:, 0] - cx, -(P[:, 1] - cy))   # θ=0 na frente (-Y)
    return a_ + b_ * np.cos(th) + c_ * np.cos(2 * th)
def dcorte(P): P = np.atleast_2d(P); return P[:, 2] - zcorte(P)
y_meio = cy
print(f"CURVA queixo z {f_:.3f}, mandíbula z {s_:.3f}, nuca z {k_:.3f}")
import bmesh
def apagar(ob, mascara):
    bm = bmesh.new(); bm.from_mesh(ob.data); bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.verts[i] for i in np.nonzero(mascara)[0]], context="VERTS"); bm.to_mesh(ob.data); bm.free(); ob.data.update()
def ilhas_pequenas(ob, frac=0.01):
    bm = bmesh.new(); bm.from_mesh(ob.data); bm.verts.ensure_lookup_table(); vistos = set(); ilhas = []
    for v0 in bm.verts:
        if v0.index in vistos: continue
        pilha = [v0]; ilha = []; vistos.add(v0.index)
        while pilha:
            v = pilha.pop(); ilha.append(v)
            for e in v.link_edges:
                o = e.other_vert(v)
                if o.index not in vistos: vistos.add(o.index); pilha.append(o)
        ilhas.append(ilha)
    maior = max(len(i) for i in ilhas); soltos = [v for i in ilhas if len(i) < frac * maior for v in i]
    bmesh.ops.delete(bm, geom=soltos, context="VERTS"); bm.to_mesh(ob.data); bm.free(); ob.data.update(); return len(soltos)
def corte_curvo(ob, dist, manter_positivo=True, so=None):
    """corte limpo por uma superfície curva (como o bisect por plano, mas com d(P) qualquer): divide cada aresta
    onde d troca de sinal, liga os pontos novos dentro de cada face e apaga o lado de fora. Interpola UV, cor e
    shape keys. so(P) limita a região."""
    bm = bmesh.new(); bm.from_mesh(ob.data); bm.verts.ensure_lookup_table(); Mw = np.array(ob.matrix_world)
    def d_(v): return float(dist((Mw @ np.array([*v.co, 1]))[:3])[0])
    def dentro(v): return so is None or so((Mw @ np.array([*v.co, 1]))[:3])
    dv = {v: d_(v) for v in bm.verts}; novos = set()
    for e in list(bm.edges):
        a, b = e.verts; da, db = dv[a], dv[b]
        if da * db < 0 and (dentro(a) or dentro(b)):
            t = da / (da - db); ne, nv = bmesh.utils.edge_split(e, a, t); dv[nv] = 0.0; novos.add(nv)
    for f in list(bm.faces):
        vn = [v for v in f.verts if v in novos]
        if len(vn) == 2 and not any(e for e in vn[0].link_edges if e.other_vert(vn[0]) is vn[1]):
            bmesh.ops.connect_verts(bm, verts=vn)
    fora = [v for v in bm.verts if dentro(v) and (dv.get(v, d_(v)) < -1e-7 if manter_positivo else dv.get(v, d_(v)) > 1e-7)]
    bmesh.ops.delete(bm, geom=fora, context="VERTS"); bm.to_mesh(ob.data); bm.free(); ob.data.update()
    return len(novos)
# cabeça: sai o que fica abaixo da linha; atrás, pontas de cabelo até 1,2 cm abaixo ficam caindo sobre a nuca
# frente e lados: corte curvo limpo; atrás (sob o cabelo): só a pele sai, o cabelo fica
# 17/10: o corte é limpo na volta toda (antes, atrás, saía só a pele e o cabelo ficava solto: borda em zigue-zague
# que não dava para soldar); na nuca a troca cabelo -> pele cai na linha do cabelo, onde a cor já muda
n_f = corte_curvo(cab, dcorte, True)
print(f"CORTE limpo na cabeça: {n_f} pontos novos na linha")
n_s = ilhas_pequenas(cab); Pq = pts(cab)
print(f"CABECA cortada na curva: {len(cab.data.vertices)} vértices ({n_s} soltos apagados)")
# a faixa de pescoço que sobra na cabeça (entre a mandíbula e o plano, sobretudo nas laterais) é mais larga que o
# pescoço do corpo e fazia degrau, como um colarinho: ela assume a forma do pescoço ORIGINAL do corpo, sumindo para
# cima; o queixo (normal para baixo) fica de fora. Mesma deformação em todas as shape keys.
from mathutils.bvhtree import BVHTree
ref = corpo.copy(); ref.data = corpo.data.copy(); cena.collection.objects.link(ref)
bvh_ref = BVHTree.FromObject(ref, bpy.context.evaluated_depsgraph_get())
Pq = pts(cab); nq = np.empty(len(cab.data.vertices) * 3); cab.data.vertices.foreach_get("normal", nq); nq = nq.reshape(-1, 3)
dq0 = dcorte(Pq); BANDA = float(os.environ.get("ASS_BANDA", "0.035"))
wb = np.clip(1 - dq0 / BANDA, 0, 1); wb = wb * wb * (3 - 2 * wb) * np.clip((nq[:, 2] + 0.45) / 0.25, 0, 1)
desl_b = np.zeros_like(Pq); nb = 0
for i in np.nonzero(wb > 0.01)[0]:
    loc, _, _, dist = bvh_ref.find_nearest(Vector(Pq[i]))
    if loc is not None and dist < 0.03: desl_b[i] = (np.array(loc) - Pq[i]) * wb[i]; nb += 1
for k in cab.data.shape_keys.key_blocks:
    X = np.array([v.co[:] for v in k.data]) + desl_b; k.data.foreach_set("co", X.ravel())
cab.data.vertices.foreach_set("co", np.array([v.co[:] for v in cab.data.shape_keys.key_blocks["Basis"].data]).ravel()); cab.data.update()
bpy.data.objects.remove(ref, do_unlink=True)
print(f"BANDA do pescoço da cabeça: {nb} vértices levados à forma do pescoço do corpo")
# corpo: sai tudo acima da linha menos a folga, só na região da cabeça (não toca ombro nem braço)
GAP = float(os.environ.get("SOL_FOLGA", "0")); FOLGA = GAP
# 17/10: atrás (mais de SOL_SOBE_ANG da frente) o corpo é cortado SOL_SOBE mais alto: o pescoço sobe por baixo do
# cabelo e fecha a fresta que fica quando a tira de pele da cabeça sob o cabelo é apagada (SOL_TIRA_APAGA)
SOBE = float(os.environ.get("SOL_SOBE", "0")); SOBE_ANG = np.radians(float(os.environ.get("SOL_SOBE_ANG", "100")))
def dcorte_c(P):
    P_ = np.atleast_2d(P); d = dcorte(P_) + GAP
    if SOBE > 0:
        th = np.abs(np.arctan2(P_[:, 0] - cx, -(P_[:, 1] - cy))); w = np.clip((th - SOBE_ANG + np.radians(25)) / np.radians(25), 0, 1)
        d = d - SOBE * w * w * (3 - 2 * w)
    return d
Pc = pts(corpo); reg = (np.abs(Pc[:, 0]) < 0.16) & (Pc[:, 2] > zn - 0.03)
# o corpo do Meshy vem separado nas costuras de UV (17/10: 18,6 mil dos 35 mil vértices tinham gêmeo): cortado assim,
# a borda do pescoço saía em dezenas de pedaços e lascas. Solda os gêmeos só numa faixa em volta do corte (soldar a
# região toda bagunçava as normais e manchava camiseta e pescoço de claro).
print("CORPO normais próprias:", corpo.data.has_custom_normals)
bm0 = bmesh.new(); bm0.from_mesh(corpo.data); bm0.verts.ensure_lookup_table(); Mw0 = np.array(corpo.matrix_world)
antes_n = len(bm0.verts)
def _d0(v): return float(dcorte_c((Mw0 @ np.array([*v.co, 1]))[:3])[0])
bmesh.ops.remove_doubles(bm0, verts=[v for v in bm0.verts if abs(_d0(v)) < float(os.environ.get("SOL_SOLDA_FAIXA", "0.015"))], dist=1e-5)
bm0.to_mesh(corpo.data); bm0.free(); corpo.data.update()
print(f"CORPO soldado nas costuras: {antes_n - len(corpo.data.vertices)} gêmeos fundidos")
n_c = corte_curvo(corpo, lambda P: dcorte_c(P), False, so=lambda P: abs(P[0]) < 0.16 and P[2] > zn - 0.03)
ilhas_pequenas(corpo, 0.002); print(f"CORTE limpo no corpo: {n_c} pontos novos na linha")
# 17/10: sobravam lascas soltas da orelha e do cabelo antigos do corpo abaixo da linha, perto da orelha nova: sai
# toda peça solta do corpo que fica inteira na região da cabeça (acima da base do pescoço)
Pc_r = pts(corpo); anel_r = (np.abs(dcorte_c(Pc_r)) < 0.004) & (np.abs(Pc_r[:, 0]) < 0.16) & (Pc_r[:, 2] > zn - 0.03)
R_PESC = float(np.percentile(np.hypot(Pc_r[anel_r, 0] - cx, Pc_r[anel_r, 1] - cy), 90)) + 0.008
bmx = bmesh.new(); bmx.from_mesh(corpo.data); bmx.verts.ensure_lookup_table(); Mx = corpo.matrix_world; vist = set(); fora_ = []
for v0 in bmx.verts:
    if v0 in vist: continue
    pilha = [v0]; comp = []; vist.add(v0)
    while pilha:
        v = pilha.pop(); comp.append(v)
        for e in v.link_edges:
            o = e.other_vert(v)
            if o not in vist: vist.add(o); pilha.append(o)
    if len(comp) >= 3000: continue
    Pk = np.array([(Mx @ v.co)[:] for v in comp]); rk = np.hypot(Pk[:, 0] - cx, Pk[:, 1] - cy)
    # o corpo é retalhado nas costuras de UV (o pescoço também é "peça solta"): só sai a peça inteira FORA do
    # pescoço (mais longe do eixo que a borda do pescoço) e na altura da cabeça, que é onde ficam as lascas da orelha
    if Pk[:, 2].min() > zn and rk.min() > R_PESC: fora_ += comp
# lascas presas ao pescoço (casca do cabelo antigo cortada, perto do ângulo da mandíbula): vértice logo abaixo do
# corte e mais de 4 mm para fora do raio da borda naquele ângulo
th_a = np.arctan2(Pc_r[anel_r, 0] - cx, -(Pc_r[anel_r, 1] - cy)); r_a = np.hypot(Pc_r[anel_r, 0] - cx, Pc_r[anel_r, 1] - cy)
bins = np.linspace(-np.pi, np.pi, 37); r_bin = np.array([np.median(r_a[(th_a >= bins[i]) & (th_a < bins[i + 1])]) if ((th_a >= bins[i]) & (th_a < bins[i + 1])).sum() else np.nan for i in range(36)])
ok_b = np.isfinite(r_bin); cen = (bins[:-1] + bins[1:]) / 2
def r_borda(th): return np.interp(th, cen[ok_b], r_bin[ok_b], period=2 * np.pi)
LASCA = float(os.environ.get("SOL_LASCA", "0.004")); n_l = 0
fora_set = set(fora_)
for v in bmx.verts:
    if v in fora_set: continue
    p_ = Mx @ v.co; d_ = float(dcorte_c(np.array(p_[:]))[0])
    if -0.015 < d_ <= 0.001 and abs(p_.x) < 0.16:
        th_v = np.arctan2(p_.x - cx, -(p_.y - cy)); r_v = np.hypot(p_.x - cx, p_.y - cy)
        if r_v > r_borda(th_v) + LASCA: fora_.append(v); n_l += 1
print(f"LASCAS presas: {n_l} vértices mais de {LASCA * 1000:.0f} mm para fora da borda")
bmesh.ops.delete(bmx, geom=fora_, context="VERTS"); bmx.to_mesh(corpo.data); bmx.free(); corpo.data.update()
print(f"LASCAS do corpo fora do pescoço (raio > {R_PESC * 100:.1f} cm) apagadas: {len(fora_)} vértices")
print(f"CORPO cortado: {len(corpo.data.vertices)} vértices")
# ---- o cabelo ORIGINAL do corpo que descia pela nuca, abaixo do corte, vira nuca: as pontas são alisadas e os
# triângulos ganham a cor da pele da nuca na textura do corpo (o corpo não tem pele sob o cabelo: apagar abria buraco)
Pc = pts(corpo); Cc0 = cor_vertices(corpo); dcn = dcorte(Pc)
nuca_reg = (Pc[:, 1] > y_meio - 0.02) & (Pc[:, 2] > zn - 0.03) & (np.abs(Pc[:, 0]) < 0.12) & (dcn < 0)
camiseta = (Cc0 @ LUM > 0.45) & (Cc0.max(1) - Cc0.min(1) < 0.15)   # claro e sem cor: tecido, fica de fora
nuca_reg &= ~camiseta
escuro = nuca_reg & (Cc0 @ LUM < float(os.environ.get("ASS_ESCURO", "0")))   # 17/10: desligado por padrão (a pintura deixava manchas claras e furo na gola; com o corte mais baixo o cabelo do corpo já sai)
if escuro.any():
    e_ = np.empty(len(corpo.data.edges) * 2, dtype=np.int64); corpo.data.edges.foreach_get("vertices", e_); e_ = e_.reshape(-1, 2)
    co = np.array([v.co[:] for v in corpo.data.vertices]); mexe = escuro.copy()
    for _ in range(3):   # um pouco de folga em volta
        viz = np.zeros(len(co), bool); viz[e_[:, 1][mexe[e_[:, 0]]]] = True; viz[e_[:, 0][mexe[e_[:, 1]]]] = True; mexe |= viz & nuca_reg
    grau = np.bincount(e_.ravel(), minlength=len(co)).astype(float)
    for _ in range(40):   # alisa só os pontos de cabelo; o resto segura a forma
        sm = np.zeros_like(co); np.add.at(sm, e_[:, 0], co[e_[:, 1]]); np.add.at(sm, e_[:, 1], co[e_[:, 0]])
        co[mexe] = (0.5 * co + 0.5 * sm / np.maximum(grau, 1)[:, None])[mexe]
    corpo.data.vertices.foreach_set("co", co.ravel()); corpo.data.update()
    # cor: pinta os triângulos desses pontos na textura do corpo com a pele da nuca ao redor
    pele_nuca = nuca_reg & ~mexe & pele_de(Cc0)
    cor_pele = np.median(Cc0[pele_nuca], 0) if pele_nuca.sum() > 10 else np.median(Cc0[pele_de(Cc0)], 0)
    nt0 = corpo.data.materials[0].node_tree
    tex0 = next(n for n in nt0.nodes if n.type == "TEX_IMAGE" and n.image and n.image.size[0] > 64 and any(l.to_node.type in ("MIX", "BSDF_PRINCIPLED") for l in n.outputs[0].links))
    img0 = tex0.image; W0, H0 = img0.size; px0 = np.array(img0.pixels[:], dtype=np.float32).reshape(H0, W0, 4)
    luv = np.empty(len(corpo.data.loops) * 2); corpo.data.uv_layers[0].data.foreach_get("uv", luv); luv = luv.reshape(-1, 2)
    pintados = 0
    for poly in corpo.data.polygons:
        if not mexe[list(poly.vertices)].all(): continue
        uvs = luv[list(poly.loop_indices)] * [W0, H0]
        for k_ in range(1, len(uvs) - 1):   # triângulo a triângulo, exato (o retângulo vazava para a gola)
            t3 = uvs[[0, k_, k_ + 1]]; x0, y0 = np.floor(t3.min(0)).astype(int) - 1; x1, y1 = np.ceil(t3.max(0)).astype(int) + 2
            x0, y0 = max(x0, 0), max(y0, 0); x1, y1 = min(x1, W0), min(y1, H0)
            if x1 <= x0 or y1 <= y0: continue
            gy, gx = np.mgrid[y0:y1, x0:x1] + 0.5
            (ax, ay), (bx, by), (cx_, cy_) = t3; den = (by - cy_) * (ax - cx_) + (cx_ - bx) * (ay - cy_)
            if abs(den) < 1e-9: continue
            l1 = ((by - cy_) * (gx - cx_) + (cx_ - bx) * (gy - cy_)) / den; l2 = ((cy_ - ay) * (gx - cx_) + (ax - cx_) * (gy - cy_)) / den
            dentro_t = (l1 >= -0.05) & (l2 >= -0.05) & (1 - l1 - l2 >= -0.05)
            bloco = px0[y0:y1, x0:x1, :3]; bloco[dentro_t] = cor_pele
        pintados += 1
    img0.pixels[:] = px0.ravel(); img0.update(); img0.pack()
    print(f"NUCA: {int(escuro.sum())} pontos de cabelo do corpo alisados e {pintados} faces pintadas de pele")
Pq = pts(cab); Pc = pts(corpo)
bmc = bmesh.new(); bmc.from_mesh(corpo.data); bmc.verts.ensure_lookup_table(); dc_ = dcorte(Pc); dc_c = dcorte_c(Pc)
Cc_b = cor_vertices(corpo); cam_b = (Cc_b @ LUM > 0.45) & (Cc_b.max(1) - Cc_b.min(1) < 0.15)
borda_c = [v.index for v in bmc.verts if v.is_boundary and abs(Pc[v.index, 0]) < 0.16 and Pc[v.index, 2] > zn - 0.03 and abs(dc_c[v.index]) < 0.012 and not cam_b[v.index]]; bmc.free()
pf = np.array([0, y_frente, f_]); normal = np.array([0, 0, 1.0])
# ---- 17/10: a pintura do corpo logo abaixo do corte era a do queixo antigo (mais clara, quebrando em triângulos):
# numa faixa de SOL_FAIXA_COR abaixo da linha, a textura vai em degradê para a cor do pescoço medida mais abaixo
FX = float(os.environ.get("SOL_FAIXA_COR", "0.03"))
if FX > 0:
    Pc = pts(corpo); Cc0 = cor_vertices(corpo); dcf = dcorte(Pc)
    sat0 = (Cc0.max(1) - Cc0.min(1)) / np.maximum(Cc0.max(1), 1e-3)
    ref_ = (dcf < -FX) & (dcf > -FX - 0.03) & (np.abs(Pc[:, 0]) < 0.08) & pele_de(Cc0) & (sat0 > 0.3)
    alvo_cor = np.median(Cc0[ref_], 0)
    wv = np.clip(1 + dcf / FX, 0, 1) * (np.abs(Pc[:, 0]) < 0.16) * (Pc[:, 2] > zn - 0.05); wv = wv * wv * (3 - 2 * wv)
    nt0 = corpo.data.materials[0].node_tree
    tex0 = next(n for n in nt0.nodes if n.type == "TEX_IMAGE" and n.image and n.image.size[0] > 64 and any(l.to_node.type in ("MIX", "BSDF_PRINCIPLED") for l in n.outputs[0].links))
    img0 = tex0.image; W0, H0 = img0.size; px0 = np.array(img0.pixels[:], dtype=np.float32).reshape(H0, W0, 4)
    luv = np.empty(len(corpo.data.loops) * 2); corpo.data.uv_layers[0].data.foreach_get("uv", luv); luv = luv.reshape(-1, 2)
    lvx = np.empty(len(corpo.data.loops), dtype=np.int64); corpo.data.loops.foreach_get("vertex_index", lvx)
    nf_ = 0
    for poly in corpo.data.polygons:
        li_ = list(poly.loop_indices); wf = wv[lvx[li_]]
        if wf.max() <= 0: continue
        uvs = luv[li_] * [W0, H0]
        for k_ in range(1, len(uvs) - 1):
            ids = [0, k_, k_ + 1]; t3 = uvs[ids]; w3 = wf[ids]
            x0, y0 = np.floor(t3.min(0)).astype(int) - 1; x1, y1 = np.ceil(t3.max(0)).astype(int) + 2
            x0, y0 = max(x0, 0), max(y0, 0); x1, y1 = min(x1, W0), min(y1, H0)
            if x1 <= x0 or y1 <= y0: continue
            gy, gx = np.mgrid[y0:y1, x0:x1] + 0.5
            (ax, ay), (bx, by), (cx_, cy_) = t3; den = (by - cy_) * (ax - cx_) + (cx_ - bx) * (ay - cy_)
            if abs(den) < 1e-9: continue
            l1 = ((by - cy_) * (gx - cx_) + (cx_ - bx) * (gy - cy_)) / den; l2 = ((cy_ - ay) * (gx - cx_) + (ax - cx_) * (gy - cy_)) / den; l3 = 1 - l1 - l2
            dentro_t = (l1 >= -0.08) & (l2 >= -0.08) & (l3 >= -0.08)
            wpx = np.clip(l1 * w3[0] + l2 * w3[1] + l3 * w3[2], 0, 1)[dentro_t]
            bloco = px0[y0:y1, x0:x1, :3]; sub = bloco[dentro_t]
            sub[:] = sub * (1 - wpx[:, None]) + alvo_cor[None, :] * wpx[:, None]; bloco[dentro_t] = sub
        nf_ += 1
    img0.pixels[:] = px0.ravel(); img0.update(); img0.pack()
    print(f"FAIXA de cor: {nf_} faces do corpo em degradê para {np.round(alvo_cor, 3)} ({int(ref_.sum())} amostras)")
# ---- 17/10 "ajusta o tom de pele do corpo pra ficar igual o da cabeça": toda a pele da textura do corpo (braços,
# mãos, pescoço) é multiplicada pela razão cabeça/corpo; a máscara é suave (pele = alaranjado e não escuro), então
# camiseta branca e cabelo ficam como estão ----
if os.environ.get("SOL_PELE_CORPO", "1") == "1":
    Cc_t = cor_vertices(corpo); Cq_t = cor_vertices(cab); Pq_t = pts(cab)
    # pele = saturada; a camiseta é quente mas quase sem saturação e entrava como pele (1ª tentativa tingiu a camiseta)
    def satur(C): return (C.max(-1) - C.min(-1)) / np.maximum(C.max(-1), 1e-3)
    def pele_s(C): return pele_de(C) & (satur(C) > 0.3)
    rosto = pele_s(Cq_t) & (Pq_t[:, 1] < cy) & (dcorte(Pq_t) > 0.02)   # rosto na frente, longe da borda
    r_pele = np.clip(np.median(Cq_t[rosto], 0) / np.maximum(np.median(Cc_t[pele_s(Cc_t)], 0), 1e-3), 0.6, 1.6)
    vistas = set()
    for mat in corpo.data.materials:
        for n in mat.node_tree.nodes:
            if n.type != "TEX_IMAGE" or not n.image or n.image.name in vistas or n.image.size[0] <= 64: continue
            if not any(l.to_node.type in ("MIX", "BSDF_PRINCIPLED") for l in n.outputs[0].links): continue
            im_ = n.image; vistas.add(im_.name); W_, H_ = im_.size
            px_ = np.array(im_.pixels[:], dtype=np.float32).reshape(H_, W_, 4); rgb = px_[..., :3]
            lum_ = rgb @ LUM.astype(np.float32); calor = rgb[..., 0] - rgb[..., 2]
            sat_ = (rgb.max(-1) - rgb.min(-1)) / np.maximum(rgb.max(-1), 1e-3)
            w_ = np.clip((sat_ - 0.2) / 0.1, 0, 1) * np.clip((lum_ - 0.10) / 0.06, 0, 1); w_ = w_ * w_ * (3 - 2 * w_)
            rgb *= 1 + (r_pele[None, None, :].astype(np.float32) - 1) * w_[..., None]
            px_[..., :3] = np.clip(rgb, 0, 1); im_.pixels[:] = px_.ravel(); im_.update(); im_.pack()
    print(f"PELE do corpo levada à da cabeça: razão {np.round(r_pele, 3)} ({len(vistas)} textura)")
# ---- tom: a pele da cabeça perto da borda vai ao tom do pescoço ----
Cc = cor_vertices(corpo); Cq = cor_vertices(cab); Pq = pts(cab); Pc = pts(corpo)
dc = dcorte(Pc); dq = dcorte(Pq)
AM = float(os.environ.get("ASS_AMOSTRA", "0.008")); fc = (dc > -AM) & (dc < 0) & (np.abs(Pc[:, 0]) < 0.07) & pele_de(Cc)
fq = (dq < AM) & pele_de(Cq)
razao = np.clip(np.median(Cc[fc], 0) / np.maximum(np.median(Cq[fq], 0), 1e-3), 0.7, 1.4) if fc.sum() > 20 and fq.sum() > 20 else np.ones(3)
# meio caminho de cada lado: a cabeça vai para o tom do pescoço e o pescoço para o da cabeça (linha de tom sumia só
# corrigindo um lado quando os dois eram diferentes)
meio_r = np.sqrt(razao)
# 17/10 "ajusta o pescoço até ficar igual ao rosto": o rosto não muda; o pescoço inteiro (até a gola, sumindo nos
# ombros) vai ao tom da pele da cabeça perto da emenda (mandíbula e queixo), medida em faixa larga dos dois lados
if os.environ.get("SOL_TOM_MODO", "pescoco") == "pescoco":
    sat_c = (Cc.max(1) - Cc.min(1)) / np.maximum(Cc.max(1), 1e-3); sat_q = (Cq.max(1) - Cq.min(1)) / np.maximum(Cq.max(1), 1e-3)
    fc2 = (dc < 0) & (dc > -0.05) & (np.abs(Pc[:, 0]) < 0.08) & pele_de(Cc) & (sat_c > 0.3)
    fq2 = (dq > 0) & (dq < 0.03) & pele_de(Cq) & (sat_q > 0.3)
    razao_p = np.clip(np.median(Cq[fq2], 0) / np.maximum(np.median(Cc[fc2], 0), 1e-3), 0.6, 1.6)
    print(f"PESCOÇO ao tom do rosto: razão {np.round(razao_p, 3)} (amostras pescoço {int(fc2.sum())}, rosto {int(fq2.sum())})")
    if os.environ.get("SOL_TOM_GANHO"):   # correção medida no render (a sombra do queixo escurece o pescoço além da textura)
        razao_p = razao_p * np.array([float(x) for x in os.environ["SOL_TOM_GANHO"].split(",")]); print("PESCOÇO ganho extra ->", np.round(razao_p, 3))
    meio_r = np.ones(3)   # cabeça fica como está
    alt = np.clip((Pc[:, 2] - (zn - 0.05)) / 0.04, 0, 1); alt = alt * alt * (3 - 2 * alt)
    tom_c_p = 1 + (razao_p[None, :] - 1) * (alt * (np.abs(Pc[:, 0]) < 0.16))[:, None]
g = np.clip(1 - dq / float(os.environ.get("ASS_TOM", "0.05")), 0, 1)[:, None]; g = g * g * (3 - 2 * g)
tom = 1 + (meio_r[None, :] - 1) * g
if os.environ.get("SOL_TOM_MODO", "pescoco") == "pescoco":
    # 17/10: a pele da cabeça logo acima da emenda era mais clara que o pescoço (faixa clara sob a mandíbula): por
    # vértice (sem marcar costura de UV), só na pele, a cabeça vai à cor que o pescoço mostra na emenda
    sat_q2 = (Cq.max(1) - Cq.min(1)) / np.maximum(Cq.max(1), 1e-3)
    pelew_q = np.clip((sat_q2 - 0.2) / 0.1, 0, 1) * np.clip((Cq @ LUM - 0.10) / 0.06, 0, 1)
    fcb = (dc < 0) & (dc > -0.02) & (np.abs(Pc[:, 0]) < 0.08) & pele_de(Cc) & (sat_c > 0.3)
    fqb = (dq > 0) & (dq < 0.015) & (pelew_q > 0.5)
    # a medida pela textura da cabeça falha (lê outra imagem); o ganho vem medido no render: SOL_TOM_CAB_GANHO "r,g,b"
    rq = np.array([float(x) for x in os.environ.get("SOL_TOM_CAB_GANHO", "1,1,1").split(",")])
    TQ = float(os.environ.get("SOL_TOM_CAB", "0.03"))
    gq = np.clip(1 - dq / TQ, 0, 1); gq = (gq * gq * (3 - 2 * gq)) * pelew_q
    tom = 1 + (rq[None, :] - 1) * gq[:, None]
    print(f"CABEÇA perto da emenda ao tom do pescoço: razão {np.round(rq, 3)} ({int(fcb.sum())}/{int(fqb.sum())} amostras)")
gc = np.clip(1 + dc / float(os.environ.get("ASS_TOM", "0.05")), 0, 1)[:, None] * (np.abs(Pc[:, 0]) < 0.16)[:, None]; gc = gc * gc * (3 - 2 * gc)
tom_c = 1 + (1 / meio_r[None, :] - 1) * gc
if os.environ.get("SOL_TOM_MODO", "pescoco") == "pescoco": tom_c = tom_c_p
if "tom" in corpo.data.color_attributes: corpo.data.color_attributes.remove(corpo.data.color_attributes["tom"])
cc_ = corpo.data.color_attributes.new("tom", "FLOAT_COLOR", "POINT"); cc_.data.foreach_set("color", np.c_[tom_c, np.ones(len(tom_c))].ravel())
for mat in corpo.data.materials:
    ntc = mat.node_tree; bc = next(n for n in ntc.nodes if n.type == "BSDF_PRINCIPLED")
    fc_ = bc.inputs["Base Color"].links[0].from_socket
    atc = ntc.nodes.new("ShaderNodeVertexColor"); atc.layer_name = "tom"
    mc_ = ntc.nodes.new("ShaderNodeMix"); mc_.data_type = "RGBA"; mc_.blend_type = "MULTIPLY"; mc_.inputs[0].default_value = 1
    ntc.links.new(fc_, mc_.inputs[6]); ntc.links.new(atc.outputs["Color"], mc_.inputs[7]); ntc.links.new(mc_.outputs[2], bc.inputs["Base Color"])
ca_ = cab.data.color_attributes.new("tom", "FLOAT_COLOR", "POINT"); ca_.data.foreach_set("color", np.c_[tom, np.ones(len(tom))].ravel())
nt = cab.active_material.node_tree; bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
fonte = bsdf.inputs["Base Color"].links[0].from_socket
at = nt.nodes.new("ShaderNodeVertexColor"); at.layer_name = "tom"
mul = nt.nodes.new("ShaderNodeMix"); mul.data_type = "RGBA"; mul.blend_type = "MULTIPLY"; mul.inputs[0].default_value = 1
nt.links.new(fonte, mul.inputs[6]); nt.links.new(at.outputs["Color"], mul.inputs[7]); nt.links.new(mul.outputs[2], bsdf.inputs["Base Color"])
# 17/10: o resto do pescoço da própria cabeça (entre a mandíbula e o corte) tem pintura mais clara que quebra em
# triângulos: na pele da cabeça perto da borda, a textura vai em degradê para a cor que o pescoço do corpo mostra
# na emenda (cor da faixa x ganho do tom). Cabelo fica fora. Pinta todas as texturas de cor (as duas dos olhos).
FXQ = float(os.environ.get("SOL_FAIXA_CAB", "0"))   # 17/10: pintar a cabeça clareou e marcou as costuras de UV; desligado
if FXQ > 0 and FX > 0:
    alvo_q = alvo_cor * (razao_p if os.environ.get("SOL_TOM_MODO", "pescoco") == "pescoco" else np.ones(3))
    Cq2 = cor_vertices(cab); sat2 = (Cq2.max(1) - Cq2.min(1)) / np.maximum(Cq2.max(1), 1e-3)
    pelew = np.clip((sat2 - 0.2) / 0.1, 0, 1) * np.clip((Cq2 @ LUM - 0.10) / 0.06, 0, 1)
    wq_ = np.clip(1 - dcorte(pts(cab)) / FXQ, 0, 1); wq_ = wq_ * wq_ * (3 - 2 * wq_) * pelew
    lux = np.empty(len(cab.data.loops) * 2); cab.data.uv_layers[0].data.foreach_get("uv", lux); lux = lux.reshape(-1, 2)
    lvq = np.empty(len(cab.data.loops), dtype=np.int64); cab.data.loops.foreach_get("vertex_index", lvq)
    imgs = {n.image.name: n.image for n in cab.active_material.node_tree.nodes if n.type == "TEX_IMAGE" and n.image and n.image.size[0] > 64 and n.image.colorspace_settings.name == "sRGB"}
    for im_ in imgs.values():
        W1, H1 = im_.size; p1 = np.array(im_.pixels[:], dtype=np.float32).reshape(H1, W1, 4)
        for poly in cab.data.polygons:
            li_ = list(poly.loop_indices); wf = wq_[lvq[li_]]
            if wf.max() <= 0: continue
            uvs = lux[li_] * [W1, H1]
            for k_ in range(1, len(uvs) - 1):
                ids = [0, k_, k_ + 1]; t3 = uvs[ids]; w3 = wf[ids]
                x0, y0 = np.floor(t3.min(0)).astype(int) - 1; x1, y1 = np.ceil(t3.max(0)).astype(int) + 2
                x0, y0 = max(x0, 0), max(y0, 0); x1, y1 = min(x1, W1), min(y1, H1)
                if x1 <= x0 or y1 <= y0: continue
                gy, gx = np.mgrid[y0:y1, x0:x1] + 0.5
                (ax, ay), (bx, by), (cx_, cy_) = t3; den = (by - cy_) * (ax - cx_) + (cx_ - bx) * (ay - cy_)
                if abs(den) < 1e-9: continue
                l1 = ((by - cy_) * (gx - cx_) + (cx_ - bx) * (gy - cy_)) / den; l2 = ((cy_ - ay) * (gx - cx_) + (ax - cx_) * (gy - cy_)) / den; l3 = 1 - l1 - l2
                dentro_t = (l1 >= -0.08) & (l2 >= -0.08) & (l3 >= -0.08)
                wpx = np.clip(l1 * w3[0] + l2 * w3[1] + l3 * w3[2], 0, 1)[dentro_t]
                bloco = p1[y0:y1, x0:x1, :3]; sub = bloco[dentro_t]
                sub[:] = sub * (1 - wpx[:, None]) + alvo_q[None, :].astype(np.float32) * wpx[:, None]; bloco[dentro_t] = sub
        im_.pixels[:] = p1.ravel(); im_.update(); im_.pack()
    print(f"FAIXA da cabeça: {int((wq_ > 0).sum())} vértices de pele em degradê para {np.round(alvo_q, 3)} em {len(imgs)} texturas")
print(f"TOM razão {np.round(razao, 3)} (amostras corpo {int(fc.sum())}, cabeça {int(fq.sum())})")
# ---- pesos: a borda da cabeça copia os pesos da borda do pescoço mais perto (as duas andam juntas quando ele vira
# a cabeça) e, subindo, passa para o osso Head ----
nomes = {g.index: g.name for g in corpo.vertex_groups}
Pc = pts(corpo); kb2 = KDTree(len(borda_c))
for j, i in enumerate(borda_c): kb2.insert(Pc[i], j)
kb2.balance()
pesos_borda = [{nomes[g.group]: g.weight for g in corpo.data.vertices[i].groups} for i in borda_c]
cab.vertex_groups.clear(); grupos = {}
def grupo(n):
    if n not in grupos: grupos[n] = cab.vertex_groups.new(name=n)
    return grupos[n]
for i, d_ in enumerate(dq):
    t_ = float(np.clip(d_ / 0.04, 0, 1)); t_ = t_ * t_ * (3 - 2 * t_)
    w = {}
    if t_ < 0.999:
        _, j, _ = kb2.find(Pq[i]); pb = pesos_borda[j]; sb = sum(pb.values()) or 1
        for n, x in pb.items(): w[n] = w.get(n, 0) + (1 - t_) * x / sb
    w["mixamorig:Head"] = w.get("mixamorig:Head", 0) + t_
    for n, x in w.items():
        if x > 0.005: grupo(n).add([i], x, "REPLACE")
print("PESOS da cabeça:", sorted(grupos))
pele_q_corte = pele_de(cor_vertices(cab))
cab.name = cab.data.name = "neto-cabeca"
if os.environ.get("SOL_SEM_PONTE"):   # depuração: salva antes de juntar
    cab.parent = rig; cab.matrix_parent_inverse = rig.matrix_world.inverted(); cab.modifiers.new("Armature", "ARMATURE").object = rig
    bpy.ops.wm.save_as_mainfile(filepath=f"{SAIDA}.blend"); print("PRONTO sem ponte"); raise SystemExit
# ---- costura (17/10; a ponte do Blender com bordas de tamanhos diferentes fazia dentes): as duas bordas estão na
# mesma curva. 1) cada ponto da borda da cabeça vai para o ponto mais perto da borda do corpo, e o deslocamento se
# espalha pela faixa da cabeça (sem quina); 2) junta; 3) cada borda é dividida nos pontos da outra; 4) os pares são
# fundidos: uma malha só, sem fresta nem dente. As expressões entram no corpo pelo nome.
COST = float(os.environ.get("SOL_COSTURA", "0.03"))
Pq = pts(cab); dqf = dcorte(Pq); Pc = pts(corpo)
bmq = bmesh.new(); bmq.from_mesh(cab.data); bmq.verts.ensure_lookup_table()
borda_cab = [v.index for v in bmq.verts if v.is_boundary and abs(dqf[v.index]) < 0.01]; bmq.free()
bset = set(borda_c); bmc = bmesh.new(); bmc.from_mesh(corpo.data); bmc.verts.ensure_lookup_table()
segs = np.array([(e.verts[0].index, e.verts[1].index) for e in bmc.edges if e.is_boundary and e.verts[0].index in bset and e.verts[1].index in bset]); bmc.free()
SA, SB = Pc[segs[:, 0]], Pc[segs[:, 1]]
def no_corpo(P):
    v = SB - SA; t = np.clip(np.einsum("nmk,mk->nm", P[:, None, :] - SA[None], v) / np.maximum((v * v).sum(1), 1e-12)[None], 0, 1)
    Q_ = SA[None] + t[..., None] * v[None]; d = np.linalg.norm(Q_ - P[:, None, :], axis=2); j = d.argmin(1)
    return Q_[np.arange(len(P)), j], d[np.arange(len(P)), j]
# 17/10 ("parte da cabeça é maior que o pescoço e fica sobrando"): o ponto mais perto deixava de fora a borda que
# estava a mais de 2 cm (aba sobrando) e amontoava pontos. Agora é por ângulo em volta do eixo do pescoço: cada
# ponto da borda da cabeça vai para onde o raio naquele ângulo cruza a borda do corpo. Todos vão; nenhum fica solto.
Pr = Pq[borda_cab]; th_r = np.arctan2(Pr[:, 0] - cx, -(Pr[:, 1] - cy))
dx_, dy_ = np.sin(th_r), -np.cos(th_r)                       # direção do raio no plano
ax_, ay_ = SA[:, 0] - cx, SA[:, 1] - cy; ex_, ey_ = SB[:, 0] - SA[:, 0], SB[:, 1] - SA[:, 1]
den_ = dx_[:, None] * ey_[None] - dy_[:, None] * ex_[None]
t_ray = (ax_[None] * ey_[None] - ay_[None] * ex_[None]) / np.where(np.abs(den_) < 1e-12, 1e-12, den_)
u_seg = (ax_[None] * dy_[:, None] - ay_[None] * dx_[:, None]) / np.where(np.abs(den_) < 1e-12, 1e-12, den_)
ok_ = (t_ray > 0) & (u_seg >= 0) & (u_seg <= 1) & (np.abs(den_) > 1e-12)
alvo_r = np.empty_like(Pr); achou = ok_.any(1)
for k_ in range(len(Pr)):
    if achou[k_]:
        js = np.nonzero(ok_[k_])[0]; Qs = SA[js] + u_seg[k_, js, None] * (SB[js] - SA[js])
        alvo_r[k_] = Qs[np.argmin(np.linalg.norm(Qs - Pr[k_], axis=1))]
    else: alvo_r[k_] = no_corpo(Pr[k_:k_ + 1])[0][0]
d_r = np.linalg.norm(alvo_r - Pr, axis=1); ok_r = np.ones(len(Pr), bool)
borda_cab = np.array(borda_cab); delta_r = alvo_r - Pq[borda_cab]
print(f"COSTURA: borda do corpo {len(segs)} arestas, borda da cabeça {len(borda_cab)} pontos ({int((~achou).sum())} sem raio), distância mediana {np.median(d_r) * 1000:.1f} mm, máx {d_r.max() * 1000:.1f} mm")
kr = KDTree(len(borda_cab))
for j, i in enumerate(borda_cab): kr.insert(Pq[i], j)
kr.balance(); desl = np.zeros_like(Pq)
for i in np.nonzero(dqf < COST)[0]:
    _, j, dd_ = kr.find(Pq[i]); w = float(np.clip(1 - dd_ / COST, 0, 1)); desl[i] = delta_r[j] * w * w * (3 - 2 * w)
desl[borda_cab] = delta_r
Minv = np.array(cab.matrix_world.inverted())[:3, :3]; desl_l = desl @ Minv.T
for k in cab.data.shape_keys.key_blocks:
    X = np.array([v.co[:] for v in k.data]) + desl_l; k.data.foreach_set("co", X.ravel())
cab.data.vertices.foreach_set("co", np.array([v.co[:] for v in cab.data.shape_keys.key_blocks["Basis"].data]).ravel()); cab.data.update()
# 17/10: a faixa da cabeça que foi puxada para o pescoço guardava as normais antigas (facetas de sombra sob a
# mandíbula): alisa a faixa (borda presa) em todas as shape keys pela mesma diferença e recalcula as normais
ALQ = int(os.environ.get("SOL_ALISA_CAB", "8"))
if ALQ:
    e_q = np.empty(len(cab.data.edges) * 2, dtype=np.int64); cab.data.edges.foreach_get("vertices", e_q); e_q = e_q.reshape(-1, 2)
    Pq_b = pts(cab); dist_b = np.full(len(Pq_b), 1.0)
    for i in np.nonzero(dcorte(Pq_b) < COST)[0]: dist_b[i] = kr.find(Pq_b[i])[2]
    wsm = np.clip(1 - dist_b / 0.02, 0, 1); wsm[borda_cab] = 0
    base = np.array([v.co[:] for v in cab.data.shape_keys.key_blocks["Basis"].data]); co = base.copy()
    grau = np.bincount(e_q.ravel(), minlength=len(co)).astype(float)
    for _ in range(ALQ):
        sm = np.zeros_like(co); np.add.at(sm, e_q[:, 0], co[e_q[:, 1]]); np.add.at(sm, e_q[:, 1], co[e_q[:, 0]])
        co = co + (sm / np.maximum(grau, 1)[:, None] - co) * (0.5 * wsm)[:, None]
    dd_ = co - base
    for k in cab.data.shape_keys.key_blocks:
        X = np.array([v.co[:] for v in k.data]) + dd_; k.data.foreach_set("co", X.ravel())
    cab.data.vertices.foreach_set("co", co.ravel()); cab.data.update()
# 17/10 (lasca bege sob o cabelo, atrás da orelha, ao virar a cabeça): logo acima da borda, a pele da cabeça ficava
# mais larga que o pescoço. Acima da borda até SOL_APERTA (1,5 cm), o que passa do raio da borda naquele ângulo é
# puxado para dentro: na borda fica no raio do pescoço, e o excesso volta aos poucos (quadrático) até o topo da faixa.
# Só dos lados para trás (mais de 70° da frente): na frente, acima da borda, está a mandíbula
APT = float(os.environ.get("SOL_APERTA", "0.015"))
if APT > 0:
    Pa = pts(cab); da = dcorte(Pa); Rb = Pa[borda_cab]
    th_b = np.arctan2(Rb[:, 0] - cx, -(Rb[:, 1] - cy)); r_b = np.hypot(Rb[:, 0] - cx, Rb[:, 1] - cy); o_ = np.argsort(th_b)
    cand = np.nonzero((da > 0) & (da < APT))[0]
    th_c = np.arctan2(Pa[cand, 0] - cx, -(Pa[cand, 1] - cy)); r_c = np.hypot(Pa[cand, 0] - cx, Pa[cand, 1] - cy)
    r_lim = np.interp(th_c, th_b[o_], r_b[o_], period=2 * np.pi)
    exc = r_c - r_lim; m_ = (exc > 0.001) & (np.abs(th_c) > np.radians(float(os.environ.get("SOL_APERTA_ANG", "70")))); cand, th_c, r_c, exc, r_lim = cand[m_], th_c[m_], r_c[m_], exc[m_], r_lim[m_]
    r_novo = r_lim + exc * (da[cand] / APT) ** 2
    da_ = np.zeros_like(Pa); fator = (r_novo - r_c)
    da_[cand, 0] = fator * np.sin(th_c); da_[cand, 1] = -fator * np.cos(th_c)
    da_l = da_ @ np.array(cab.matrix_world.inverted())[:3, :3].T
    for k in cab.data.shape_keys.key_blocks:
        X = np.array([v.co[:] for v in k.data]) + da_l; k.data.foreach_set("co", X.ravel())
    cab.data.vertices.foreach_set("co", np.array([v.co[:] for v in cab.data.shape_keys.key_blocks["Basis"].data]).ravel()); cab.data.update()
    print(f"APERTO: {len(cand)} vértices da cabeça acima da borda puxados para o raio do pescoço (máx {exc.max() * 1000 if len(exc) else 0:.1f} mm)")
# 17/10 ("lascas beges na cabeça, deixar só o cabelo preto"): entre a ponta do cabelo e a borda, atrás e dos lados,
# sobrava uma tira de pele da cabeça mais clara que o pescoço. A pele da cabeça encostada no cabelo (até SOL_TIRA_R)
# e perto da borda ganha a cor do cabelo pelo atributo "tom" (multiplica a textura; sem pintar a textura, que
# marcava as costuras de UV). Só de SOL_TIRA_ANG (85°) da frente para trás: na frente fica o rosto.
# 17/10 "a transição das duas peles não está suave, fazer elas coincidirem": a cor de cada lado da emenda é medida
# por ângulo (faixas de 20°, textura x atributo "tom") e a pele da cabeça perto da borda vai à cor do pescoço do
# corpo naquele ângulo, sumindo até SOL_CASA acima da borda. O cabelo fica de fora (peso pela cor de pele).
CASA = float(os.environ.get("SOL_CASA", "0"))   # 17/10: a medida pela textura erra (pede 1,5x mais claro); desligado
if CASA > 0:
    Pa = pts(cab); tq_ = np.array([c.color[:3] for c in cab.data.color_attributes["tom"].data]); Ca = cor_vertices(cab) * tq_
    Pb = pts(corpo); tb_ = np.array([c.color[:3] for c in corpo.data.color_attributes["tom"].data]); Cb = cor_vertices(corpo) * tb_
    da_c = dcorte(Pa); db_c = dcorte_c(Pb) if "dcorte_c" in globals() else dcorte(Pb)
    def th_(P): return np.arctan2(P[:, 0] - cx, -(P[:, 1] - cy))
    sat_a = (Ca.max(1) - Ca.min(1)) / np.maximum(Ca.max(1), 1e-3); sat_b = (Cb.max(1) - Cb.min(1)) / np.maximum(Cb.max(1), 1e-3)
    pw_a = np.clip((sat_a - 0.2) / 0.1, 0, 1) * np.clip((Ca @ LUM - 0.06) / 0.06, 0, 1)
    anel_a = (da_c > 0) & (da_c < 0.012) & (pw_a > 0.5)
    anel_b = (db_c < 0) & (db_c > -0.012) & (np.abs(Pb[:, 0]) < 0.16) & (Pb[:, 2] > zn - 0.03) & pele_de(Cb) & (sat_b > 0.3)
    NB = 18; ba = np.floor((th_(Pa) + np.pi) / (2 * np.pi) * NB).astype(int) % NB; bb = np.floor((th_(Pb) + np.pi) / (2 * np.pi) * NB).astype(int) % NB
    raz = np.full((NB, 3), np.nan)
    for k_ in range(NB):
        ma, mb = anel_a & (ba == k_), anel_b & (bb == k_)
        if ma.sum() >= 3 and mb.sum() >= 3: raz[k_] = np.clip(np.median(Cb[mb], 0) / np.maximum(np.median(Ca[ma], 0), 1e-3), 0.5, 1.5)
    okk = np.isfinite(raz[:, 0]); cen_ = -np.pi + (np.arange(NB) + 0.5) * 2 * np.pi / NB
    print("CASA razão corpo/cabeça por ângulo:", " ".join(f"{np.degrees(c):.0f}°:{r[0]:.2f}/{r[1]:.2f}/{r[2]:.2f}" for c, r, o in zip(cen_, raz, okk) if o))
    if okk.sum() >= 3:
        thv = th_(Pa); rv = np.stack([np.interp(thv, cen_[okk], raz[okk, c], period=2 * np.pi) for c in range(3)], 1)
        g_ = np.clip(1 - np.maximum(da_c, 0) / CASA, 0, 1); g_ = g_ * g_ * (3 - 2 * g_) * pw_a * (da_c > -0.002)
        tq_ = tq_ * (1 + (rv - 1) * g_[:, None])
        cab.data.color_attributes["tom"].data.foreach_set("color", np.c_[tq_, np.ones(len(tq_))].ravel())
        print(f"CASA: {int((g_ > 0.01).sum())} vértices da pele da cabeça levados à cor do pescoço")
TAP = float(os.environ.get("SOL_TIRA_APAGA", "0"))   # 17/10 "não é mais fácil remover essas lascas?": apaga a pele
# da cabeça entre a ponta do cabelo e a borda (atrás e dos lados, a mais de SOL_TIRA_ANG da frente, até TAP acima da borda)
if TAP > 0:
    Pt = pts(cab); Ct = cor_vertices(cab); th_t = np.arctan2(Pt[:, 0] - cx, -(Pt[:, 1] - cy)); dt_ = dcorte(Pt)
    tira = pele_de(Ct) & (np.abs(th_t) > np.radians(float(os.environ.get("SOL_TIRA_ANG", "100")))) & (dt_ < TAP)
    bmt = bmesh.new(); bmt.from_mesh(cab.data); bmt.faces.ensure_lookup_table()
    fz = [f for f in bmt.faces if all(tira[v.index] for v in f.verts)]
    bmesh.ops.delete(bmt, geom=fz, context="FACES"); bmt.to_mesh(cab.data); bmt.free(); cab.data.update()
    print(f"TIRA de pele sob o cabelo apagada: {len(fz)} faces")
TIRA_R = float(os.environ.get("SOL_TIRA_R", "0"))   # 17/10: pintar de escuro virou mancha; desligado (ver SOL_TIRA_APAGA)
if TIRA_R > 0:
    Pt = pts(cab); Ct = cor_vertices(cab); pele_t = pele_de(Ct); cab_t = ~pele_t & (Ct @ LUM < 0.12)
    th_t = np.arctan2(Pt[:, 0] - cx, -(Pt[:, 1] - cy)); dt_ = dcorte(Pt)
    kc = KDTree(int(cab_t.sum()))
    for j, i in enumerate(np.nonzero(cab_t)[0]): kc.insert(Pt[i], j)
    kc.balance(); cor_cab = np.median(Ct[cab_t & (dt_ < 0.04) & (np.abs(th_t) > np.radians(90))], 0)
    ang_t = float(os.environ.get("SOL_TIRA_ANG", "85")); tom_q = np.array([c.color[:3] for c in cab.data.color_attributes["tom"].data])
    n_t = 0
    for i in np.nonzero(pele_t & (np.abs(th_t) > np.radians(ang_t)) & (dt_ < 0.025))[0]:
        dd_t = kc.find(Pt[i])[2]
        if dd_t < TIRA_R:
            w = 1.0 if dd_t < TIRA_R * float(os.environ.get("SOL_TIRA_CHEIA", "0.8")) else (TIRA_R - dd_t) / (TIRA_R * (1 - float(os.environ.get("SOL_TIRA_CHEIA", "0.8"))))   # quase toda cheia, só a beira em degradê
            alvo = np.clip(cor_cab / np.maximum(Ct[i], 1e-3), 0.05, 1)
            tom_q[i] = tom_q[i] * (1 - w) + alvo * w; n_t += 1
    cab.data.color_attributes["tom"].data.foreach_set("color", np.c_[tom_q, np.ones(len(tom_q))].ravel())
    print(f"TIRA de pele junto ao cabelo escurecida: {n_t} vértices (cor do cabelo {np.round(cor_cab, 3)})")
if cab.data.has_custom_normals and os.environ.get("SOL_NORMAIS_CAB", "1") == "1":
    for x in cena.objects: x.select_set(x == cab)
    bpy.context.view_layer.objects.active = cab; bpy.ops.mesh.customdata_custom_splitnormals_clear()
    cab.data.polygons.foreach_set("use_smooth", np.ones(len(cab.data.polygons), bool)); cab.data.update()
    print("CABEÇA: normais próprias recalculadas")
if corpo.data.shape_keys is None: corpo.shape_key_add(name="Basis")
for k in cab.data.shape_keys.key_blocks:
    if k.name != "Basis" and k.name not in corpo.data.shape_keys.key_blocks: corpo.shape_key_add(name=k.name, from_mix=False)
nc = len(corpo.data.vertices)
for x in cena.objects: x.select_set(x in (corpo, cab))
bpy.context.view_layer.objects.active = corpo
cab.modifiers.clear(); cab.parent = None
bpy.ops.object.join()
for k in corpo.data.shape_keys.key_blocks: k.value = 0   # a junção deixava as expressões ligadas (rosto sorrindo)
corpo.active_shape_key_index = 0
# 17/10: no movimento ainda apareciam lasquinhas bege sob o cabelo, atrás da orelha (casca do cabelo antigo na
# borda de trás, até 1,4 cm para fora). Feito no modelo já montado (antes da junção sobrava uma na nuca): perfil do
# pescoço do corpo por ângulo (15°) e altura (4 mm); sai o vértice mais de SOL_SALTO (5 mm) para fora do perfil
# típico (percentil 40) da sua célula. 3 mm já abria buraco no pescoço.
SALTO = float(os.environ.get("SOL_SALTO", "0.005"))
Pj = pts(corpo); zc_cab = float(Pj[nc:, 2].min())
pesc_i = np.nonzero((np.arange(len(Pj)) < nc) & (Pj[:, 2] > zc_cab - float(os.environ.get("SOL_SALTO_DESCE", "0.002"))) & (np.abs(Pj[:, 0]) < 0.075))[0]
cx_s = float(Pj[nc:, 0].mean()); faixa_cy = (np.arange(len(Pj)) < nc) & (np.abs(Pj[:, 2] - zc_cab + 0.006) < 0.006) & (np.abs(Pj[:, 0]) < 0.075); cy_s = float(np.median(Pj[faixa_cy, 1]))
r_s = np.hypot(Pj[pesc_i, 0] - cx_s, Pj[pesc_i, 1] - cy_s); th_s = np.arctan2(Pj[pesc_i, 0] - cx_s, -(Pj[pesc_i, 1] - cy_s))
cel = np.floor((th_s + np.pi) / (2 * np.pi) * 24).astype(int) * 1000 + np.floor((Pj[pesc_i, 2] - zc_cab) / 0.004).astype(int)
perfil = {c: np.percentile(r_s[cel == c], 40) for c in np.unique(cel)}
salta = pesc_i[r_s - np.array([perfil[c] for c in cel]) > SALTO]
bms = bmesh.new(); bms.from_mesh(corpo.data); bms.verts.ensure_lookup_table()
bmesh.ops.delete(bms, geom=[bms.verts[int(i)] for i in salta], context="VERTS"); bms.to_mesh(corpo.data); bms.free(); corpo.data.update()
nc -= len(salta)
print(f"SALTOS do perfil do pescoço: {len(salta)} vértices mais de {SALTO * 1000:.0f} mm para fora")
FUNDIR = os.environ.get("SOL_FUNDIR", "0") == "1"   # 17/10: fundir os pontos fazia dentes (pares errados); a borda da
# cabeça já fica exatamente sobre a do corpo (por ângulo), então por padrão as duas só se encostam
if not FUNDIR:
    bpy.ops.wm.save_as_mainfile(filepath=f"{SAIDA}.blend"); print("COSTURA: bordas encostadas, sem fundir"); print("PRONTO soldar"); raise SystemExit
me = corpo.data; bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
Hv = [bm.verts[nc + int(i)] for i in borda_cab]; Bv = [bm.verts[i] for i in borda_c]
Hs, Bs = set(Hv), set(Bv)
def arestas(S): return [e for v in S for e in v.link_edges if e.is_boundary and e.other_vert(v) in S]
def projeta(p, ed):
    a_, b_ = ed.verts[0].co, ed.verts[1].co; v = b_ - a_; t = max(0.0, min(1.0, (p - a_).dot(v) / max(v.dot(v), 1e-12)))
    return t, (a_ + v * t - p).length
JUNTA = 4e-4; par = {}
def costura(origem, destino_S, destino_lista, pares_inv):
    eb = list({e for e in arestas(destino_S)})
    for p in origem:
        if p in pares_inv: continue
        melhor = min(eb, key=lambda e: projeta(p.co, e)[1]); t, d = projeta(p.co, melhor)
        if d > 0.003: continue
        a_, b_ = melhor.verts; L = (b_.co - a_.co).length
        if t * L < JUNTA: alvo_v = a_
        elif (1 - t) * L < JUNTA: alvo_v = b_
        else:
            ne, alvo_v = bmesh.utils.edge_split(melhor, a_, t); destino_S.add(alvo_v); destino_lista.append(alvo_v)
            eb.remove(melhor); eb += [e for e in alvo_v.link_edges if e.is_boundary]
        alvo_v.co = p.co.copy(); pares_inv[p] = alvo_v
# cabeça -> corpo: a borda do corpo ganha um ponto em cada ponto da borda da cabeça; depois o contrário
cab_para_corpo = {}; costura(Hv, Bs, Bv, cab_para_corpo)
corpo_para_cab = {b: h for h, b in cab_para_corpo.items()}; costura([b for b in list(Bv) if b not in corpo_para_cab], Hs, Hv, corpo_para_cab)
alvo = {}
for h, b in cab_para_corpo.items(): alvo[h] = b
for b, h in corpo_para_cab.items():
    if h not in alvo and h is not b: alvo[h] = b
alvo = {h: b for h, b in alvo.items() if h is not b and h.is_valid and b.is_valid}
for h, b in alvo.items(): h.co = b.co.copy()
bmesh.ops.weld_verts(bm, targetmap=alvo)
bm.verts.ensure_lookup_table()
# alisa só a costura e o anel em volta (a quina entre as duas formas), na base; as expressões seguem por diferença
sol = {v for v in bm.verts if v.is_valid and v in Bs and not v.is_boundary}
anel = set(sol)
for v in sol:
    for e in v.link_edges: anel.add(e.other_vert(v))
for _ in range(int(os.environ.get("SOL_ALISA", "2"))): bmesh.ops.smooth_vert(bm, verts=list(anel), factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
abertos = sum(1 for v in Bs if v.is_valid and v.is_boundary)
bm.to_mesh(me); bm.free(); me.update()
print(f"COSTURA: {len(alvo)} pontos fundidos, {len(sol)} pontos da borda do corpo já costurados, {abertos} ainda abertos")
bpy.ops.wm.save_as_mainfile(filepath=f"{SAIDA}.blend")
print("PRONTO soldar")
