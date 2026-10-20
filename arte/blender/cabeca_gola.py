# CABEÇA COM PESCOÇO INTEIRO, emenda na borda da gola (17/10, teste aprovado pelo Joabe depois de a emenda no meio do
# pescoço dar "duas peles" que nunca casavam). A cabeça detalhada (rosto e expressões intactos) fica com o pescoço
# todo; o corpo perde a pele do pescoço e do colo acima da camiseta; a emenda cai na borda da gola, onde a cor já
# muda de pele para tecido. Na frente a gola é cavada (até 8 cm abaixo da base do pescoço da cabeça): a base do
# pescoço da cabeça é esticada até lá e moldada na forma do colo do corpo original.
# Alinhamento da cabeça: o mesmo do cabeca_soldar.py (ASS_AJUSTE, ASS_ENCOLHE, ASS_ENCOLHE_EXTRA, ASS_DESCE, ASS_FRENTE).
# Uso: Blender -b CORPO_RIG.blend --python blender/cabeca_gola.py -- CABECA.blend SAIDA_PREFIXO
#   GOLA_DENTRO (0.004 m: o corte entra na camiseta, para não sobrar fio de pele do corpo)
#   GOLA_ESTICA (0.06 m: faixa da base do pescoço da cabeça que estica até a gola na frente)
#   GOLA_COSTURA (0.03 m: faixa da cabeça que acompanha a borda da gola)
import os
_src = open(os.path.join(os.path.dirname(__file__), "cabeca_soldar.py")).read()
exec(compile(_src[:_src.index("# ---- linha de corte curva")], "cabeca_soldar_alinhamento", "exec"))
_i = _src.index("def apagar(ob, mascara):"); exec(compile(_src[_i:_src.index("# cabeça: sai o que fica abaixo da linha")], "cabeca_soldar_cortes", "exec"))
from mathutils.bvhtree import BVHTree

DENTRO = float(os.environ.get("GOLA_DENTRO", "0.004")); ESTICA = float(os.environ.get("GOLA_ESTICA", "0.06"))
COST = float(os.environ.get("GOLA_COSTURA", "0.03"))
Pq = pts(cab); Pc = pts(corpo); Cc = cor_vertices(corpo)
anel = Pc[(np.abs(Pc[:, 2] - zn) < 0.01) & (np.abs(Pc[:, 0]) < 0.05)]
cx = float(Pq[:, 0].mean()); cy = float((anel[:, 1].min() + anel[:, 1].max()) / 2)
def th_(P): P = np.atleast_2d(P); return np.arctan2(P[:, 0] - cx, -(P[:, 1] - cy))   # 0 = frente (-Y)
def r_(P): P = np.atleast_2d(P); return np.hypot(P[:, 0] - cx, P[:, 1] - cy)
def por_angulo(th, val, nb=36, func=np.max):
    """valor por faixa de ângulo, faixas vazias preenchidas pelas vizinhas (circular)"""
    b = np.floor((th + np.pi) / (2 * np.pi) * nb).astype(int) % nb; v = np.full(nb, np.nan)
    for k in range(nb):
        if (b == k).sum() >= 2: v[k] = func(val[b == k])
    cen = -np.pi + (np.arange(nb) + 0.5) * 2 * np.pi / nb; ok = np.isfinite(v)
    return lambda t: np.interp(t, cen[ok], v[ok], period=2 * np.pi)

# ---- a gola: a pele exposta do corpo é a região de pele CONTÍNUA que sai do pescoço (busca pelas arestas, cor lida
# na textura em resolução cheia); a gola, por ângulo, é o ponto mais baixo dessa região. (17/10: medir pelo topo da
# camiseta pegava o tecido do peito e abria um decote em V que a camiseta não tem: a gola é redonda.)
def cor_cheia(ob):
    nt = ob.active_material.node_tree
    tex = next(n for n in nt.nodes if n.type == "TEX_IMAGE" and n.image and any(l.to_node.type in ("MIX", "BSDF_PRINCIPLED") for l in n.outputs[0].links))
    W, H = tex.image.size; px = np.array(tex.image.pixels[:]).reshape(H, W, 4)
    lv = np.empty(len(ob.data.loops), dtype=np.int64); ob.data.loops.foreach_get("vertex_index", lv)
    luv = np.empty(len(ob.data.loops) * 2); ob.data.uv_layers[0].data.foreach_get("uv", luv); luv = luv.reshape(-1, 2)
    cl = px[np.clip((luv[:, 1] * (H - 1)).astype(int), 0, H - 1), np.clip((luv[:, 0] * (W - 1)).astype(int), 0, W - 1), :3]
    cor = np.zeros((len(ob.data.vertices), 3)); n = np.zeros(len(ob.data.vertices)); np.add.at(cor, lv, cl); np.add.at(n, lv, 1)
    return cor / np.maximum(n, 1)[:, None]
Cf = cor_cheia(corpo); sat_f = (Cf.max(1) - Cf.min(1)) / np.maximum(Cf.max(1), 1e-3)
# "não camiseta": a nuca do corpo tem cabelo antigo pintado (escuro, não é pele) e também sai
camiseta_f = (Cf @ LUM > float(os.environ.get("GOLA_LUZ", "0.4"))) & (sat_f < float(os.environ.get("GOLA_SAT", "0.25")))
pele_f = ~camiseta_f
e_ = np.empty(len(corpo.data.edges) * 2, dtype=np.int64); corpo.data.edges.foreach_get("vertices", e_); e_ = e_.reshape(-1, 2)
viz = [[] for _ in range(len(Pc))]
for x, y in e_: viz[x].append(y); viz[y].append(x)
# o corpo do Meshy vem separado nas costuras de UV: gêmeos (mesma posição) também são vizinhos
_ch = {}
for i, p_ in enumerate(np.round(Pc / 1e-5).astype(np.int64)): _ch.setdefault(tuple(p_), []).append(i)
for g in _ch.values():
    for i in g[1:]: viz[g[0]].append(i); viz[i].append(g[0])
lim = (Pc[:, 2] > zn - 0.16) & (Pc[:, 2] < zn + 0.10) & (np.abs(Pc[:, 0] - cx) < 0.14)
sem = np.nonzero(lim & pele_f & (np.abs(Pc[:, 2] - (zn + 0.02)) < 0.01) & (r_(Pc) < 0.07))[0]
reg_p = np.zeros(len(Pc), bool); reg_p[sem] = True; fila = list(sem)
while fila:
    i = fila.pop()
    for j in viz[i]:
        if not reg_p[j] and lim[j] and pele_f[j]: reg_p[j] = True; fila.append(j)
Rp = Pc[reg_p]
print(f"PELE exposta do corpo: {int(reg_p.sum())} vértices, z de {Rp[:, 2].min():.3f}")
_zg = por_angulo(th_(Rp), Rp[:, 2], nb=24, func=lambda v: np.percentile(v, 3))
_rg = por_angulo(th_(Rp), r_(Rp), nb=24, func=lambda v: np.percentile(v, 97))
def zgola(P): return _zg(th_(P)) - DENTRO
def dgola(P): P = np.atleast_2d(P); return P[:, 2] - zgola(P)
def rg(t): return _rg(np.atleast_1d(t)) + 0.01
print("GOLA z por ângulo (frente, 45°, lado, 135°, nuca):", " ".join(f"{zgola(np.array([[cx + np.sin(a) * 0.05, cy - np.cos(a) * 0.05, 0]]))[0]:.3f}" for a in np.radians([0, 45, 90, 135, 180])))

# ---- cabeça: o pescoço do Meshy afina e termina arredondado (raio 1 cm na ponta, 4 cm só uns 4 cm acima): corta
# onde ele ainda tem a largura do pescoço (GOLA_BASE acima do ponto mais baixo), nunca abaixo da gola ----
BASE = float(os.environ.get("GOLA_BASE", "0.04")); FIL = int(os.environ.get("GOLA_FILEIRAS", "6"))
zb = por_angulo(th_(Pq), Pq[:, 2], func=np.min)
def dcab(P): P = np.atleast_2d(P); return P[:, 2] - np.maximum(zb(th_(P)) + BASE, zgola(P) + 0.002)
ref = corpo.copy(); ref.data = corpo.data.copy(); cena.collection.objects.link(ref)
bvh = BVHTree.FromObject(ref, bpy.context.evaluated_depsgraph_get())
n_ = corte_curvo(cab, dcab, True); ilhas_pequenas(cab)
print(f"CABEÇA cortada onde o pescoço tem largura: {n_} pontos novos, {len(cab.data.vertices)} vértices")

# ---- corpo: sai a pele exposta (a borda fica na borda da gola, onde a cor já muda) e a cabeça antiga acima dela ----
acima = (np.abs(Pc[:, 0] - cx) < 0.13) & (Pc[:, 2] > zgola(Pc) + 0.035) & (Pc[:, 2] > zn)
apagar(corpo, reg_p | acima); ilhas_pequenas(corpo, 0.002); n_c = int(reg_p.sum())
# solda os gêmeos das costuras de UV perto da borda, para a borda da gola sair numa peça só
bm0 = bmesh.new(); bm0.from_mesh(corpo.data); bm0.verts.ensure_lookup_table(); Mw0 = np.array(corpo.matrix_world)
P0 = np.array([(Mw0 @ np.array([*v.co, 1]))[:3] for v in bm0.verts])
bmesh.ops.remove_doubles(bm0, verts=[v for v in bm0.verts if r_(P0[v.index])[0] < 0.13 and zn - 0.17 < P0[v.index, 2] < zn + 0.1], dist=1e-5)
bm0.to_mesh(corpo.data); bm0.free(); corpo.data.update()
print(f"CORPO cortado na gola: pele exposta {n_c} vértices, cabeça antiga {int(acima.sum())} vértices, {len(corpo.data.vertices)} vértices")

# ---- alvo de cada ponto da borda da cabeça na borda da gola, pelo ângulo ----
Pq = pts(cab); Pc = pts(corpo)
bmq = bmesh.new(); bmq.from_mesh(cab.data); bmq.verts.ensure_lookup_table()
borda_q = np.array([v.index for v in bmq.verts if v.is_boundary and abs(dcab(Pq[v.index])[0]) < 0.01]); bmq.free()
bmc = bmesh.new(); bmc.from_mesh(corpo.data); bmc.verts.ensure_lookup_table()
segs = np.array([(e.verts[0].index, e.verts[1].index) for e in bmc.edges if e.is_boundary
                 and all(r_(Pc[v.index])[0] < 0.13 and zn - 0.17 < Pc[v.index, 2] < zn + 0.06 for v in e.verts)]); bmc.free()
SA, SB = Pc[segs[:, 0]], Pc[segs[:, 1]]
Pr = Pq[borda_q]; t_r = th_(Pr); dx_, dy_ = np.sin(t_r), -np.cos(t_r)
ax_, ay_ = SA[:, 0] - cx, SA[:, 1] - cy; ex_, ey_ = SB[:, 0] - SA[:, 0], SB[:, 1] - SA[:, 1]
den = dx_[:, None] * ey_[None] - dy_[:, None] * ex_[None]; den = np.where(np.abs(den) < 1e-12, 1e-12, den)
t_ray = (ax_[None] * ey_[None] - ay_[None] * ex_[None]) / den; u_s = (ax_[None] * dy_[:, None] - ay_[None] * dx_[:, None]) / den
ok = (t_ray > 0) & (u_s >= 0) & (u_s <= 1)
alvo = Pr.copy()
for k_ in range(len(Pr)):
    js = np.nonzero(ok[k_])[0]
    if len(js):
        Qs = SA[js] + u_s[k_, js, None] * (SB[js] - SA[js]); alvo[k_] = Qs[np.argmin(np.linalg.norm(Qs - Pr[k_], axis=1))]
    else:   # sem cruzamento pelo raio: o ponto mais perto da borda da gola
        v_ = SB - SA; t_ = np.clip(((Pr[k_] - SA) * v_).sum(1) / np.maximum((v_ * v_).sum(1), 1e-12), 0, 1)
        Qs = SA + t_[:, None] * v_; alvo[k_] = Qs[np.argmin(np.linalg.norm(Qs - Pr[k_], axis=1))]
dist_r = np.linalg.norm(alvo - Pr, axis=1)
print(f"FAIXA nova: {len(segs)} arestas na gola, {len(borda_q)} pontos na borda da cabeça ({int((~ok.any(1)).sum())} sem raio), altura mediana {np.median(dist_r) * 1000:.0f} mm, máx {dist_r.max() * 1000:.0f} mm")

# ---- faixa nova de pele: a borda da cabeça é puxada (extrusão) em GOLA_FILEIRAS fileiras até a gola; cada fileira
# é encaixada na superfície do corpo original (pescoço e colo, pelo raio vindo de fora); a pintura de cada coluna é a
# do ponto da borda de onde ela sai ----
bm = bmesh.new(); bm.from_mesh(cab.data); bm.verts.ensure_lookup_table(); bm.edges.ensure_lookup_table()
uvl = bm.loops.layers.uv.active; chaves = list(bm.verts.layers.shape.values())
pos_i = {int(i): j for j, i in enumerate(borda_q)}
# pintura da faixa: cada pedaço leva a cor de UM triângulo de pele da cabeça perto da borda (centro do triângulo no
# UV: média de UVs de ilhas diferentes dava listras escuras; na nuca a borda é cabelo)
nt_ = cab.active_material.node_tree
img_ = next(n for n in nt_.nodes if n.type == "TEX_IMAGE" and n.image and any(l.to_node.type in ("MIX", "BSDF_PRINCIPLED") for l in n.outputs[0].links)).image
Wi, Hi = img_.size; px_ = np.array(img_.pixels[:]).reshape(Hi, Wi, 4)[:, :, :3]
def cor_uv(uv): return px_[int(np.clip(uv[1], 0, 1) * (Hi - 1)), int(np.clip(uv[0], 0, 1) * (Wi - 1))]
cand_f, cand_uv = [], []
Mb = np.array(cab.matrix_world)
for fc in bm.faces:
    c = fc.calc_center_median(); P_ = np.array(c[:])
    if dcab(P_)[0] < 0.025:
        uv = sum((l[uvl].uv for l in fc.loops), Vector((0, 0))) / len(fc.loops); C = cor_uv(uv)
        sat = (C.max() - C.min()) / max(C.max(), 1e-3)
        if sat > 0.3 and C @ LUM > 0.1: cand_f.append(P_); cand_uv.append(uv.copy())
kf = KDTree(len(cand_f))
for j, P_ in enumerate(cand_f): kf.insert(P_, j)
kf.balance()
def uv_perto(P_): return cand_uv[kf.find(P_)[1]]
print(f"PINTURA da faixa: {len(cand_f)} triângulos de pele da cabeça como fonte")
coluna = {bm.verts[int(i)]: int(i) for i in borda_q}           # vértice da frente da extrusão -> ponto da borda
frente = [e for e in bm.edges if e.is_boundary and all(v in coluna for v in e.verts)]
uv_aresta = {e: uv_perto(np.array(((e.verts[0].co + e.verts[1].co) / 2)[:])) for e in frente}
def encaixa(p):
    t = np.arctan2(p[0] - cx, -(p[1] - cy)); dv = Vector((np.sin(t), -np.cos(t), 0))
    loc, _, _, d = bvh.ray_cast(Vector((cx, cy, p[2])) + dv * 0.2, -dv, 0.2)
    return np.array(loc) if loc is not None and abs((0.2 - d) - np.hypot(p[0] - cx, p[1] - cy)) < 0.05 else p
novas = 0
for k in range(1, FIL + 1):
    ret = bmesh.ops.extrude_edge_only(bm, edges=frente)
    nv = [g for g in ret["geom"] if isinstance(g, bmesh.types.BMVert)]
    ne = [g for g in ret["geom"] if isinstance(g, bmesh.types.BMEdge)]
    nf = [g for g in ret["geom"] if isinstance(g, bmesh.types.BMFace)]
    novo_col = {}
    for v in nv:
        velho = next(e.other_vert(v) for e in v.link_edges if e.other_vert(v) in coluna)
        i = coluna[velho]; novo_col[v] = i; j = pos_i[i]; f = k / FIL
        p = Pr[j] + (alvo[j] - Pr[j]) * f
        p = alvo[j] if k == FIL else encaixa(p) * min(1, 2 * f) + p * (1 - min(1, 2 * f))
        v.co = Vector(p)
        for ch in chaves: v[ch] = Vector(p)
    uv_nova = {}
    for fc in nf:
        velha = next((e for e in fc.edges if e in uv_aresta), None); uv = uv_aresta[velha] if velha else next(iter(uv_aresta.values()))
        for l in fc.loops: l[uvl].uv = uv
        for e in fc.edges:
            if all(v in novo_col for v in e.verts): uv_nova[e] = uv
    coluna = novo_col; frente = [e for e in ne if all(v in coluna for v in e.verts)]; uv_aresta = uv_nova; novas += len(nv)
bm.to_mesh(cab.data); bm.free(); cab.data.update()
print(f"FAIXA nova de pele: {FIL} fileiras, {novas} vértices")
if cab.data.has_custom_normals:
    for x in cena.objects: x.select_set(x == cab)
    bpy.context.view_layer.objects.active = cab; bpy.ops.mesh.customdata_custom_splitnormals_clear()
cab.data.polygons.foreach_set("use_smooth", np.ones(len(cab.data.polygons), bool)); cab.data.update()

# ---- pesos: perto da gola, os do corpo original mais perto (pescoço e colo andam com o tronco); subindo, o osso
# Head; no meio do pescoço, o Neck do corpo ----
nomes = {g.index: g.name for g in ref.vertex_groups}
Pref = pts(ref); kref = KDTree(len(Pref))
for i, p in enumerate(Pref): kref.insert(p, i)
kref.balance()
cab.vertex_groups.clear(); grupos = {}
def grupo(n):
    if n not in grupos: grupos[n] = cab.vertex_groups.new(name=n)
    return grupos[n]
Pq = pts(cab)
for i in range(len(Pq)):
    t_ = float(np.clip((Pq[i, 2] - (zh - 0.01)) / 0.03, 0, 1)); t_ = t_ * t_ * (3 - 2 * t_)   # acima do osso Head: só Head
    w = {}
    if t_ < 0.999:
        viz = kref.find_n(Pq[i], 6); soma = {}
        for _, j, _ in viz:
            for g in ref.data.vertices[j].groups: soma[nomes[g.group]] = soma.get(nomes[g.group], 0) + g.weight
        s_ = sum(soma.values()) or 1
        for n, x in soma.items(): w[n] = (1 - t_) * x / s_
    w["mixamorig:Head"] = w.get("mixamorig:Head", 0) + t_
    for n, x in w.items():
        if x > 0.005: grupo(n).add([i], x, "REPLACE")
print("PESOS da cabeça:", sorted(grupos))
bpy.data.objects.remove(ref, do_unlink=True)

# ---- junta: expressões entram no corpo pelo nome ----
cab.name = cab.data.name = "neto-cabeca"
if corpo.data.shape_keys is None: corpo.shape_key_add(name="Basis")
for k in kb:
    if k.name != "Basis" and k.name not in corpo.data.shape_keys.key_blocks: corpo.shape_key_add(name=k.name, from_mix=False)
for x in cena.objects: x.select_set(x in (corpo, cab))
bpy.context.view_layer.objects.active = corpo
cab.modifiers.clear(); cab.parent = None
bpy.ops.object.join()
for k in corpo.data.shape_keys.key_blocks: k.value = 0
corpo.active_shape_key_index = 0
bpy.ops.wm.save_as_mainfile(filepath=f"{SAIDA}.blend"); print("PRONTO gola")
