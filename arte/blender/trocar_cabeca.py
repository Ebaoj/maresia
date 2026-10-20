# Troca a cabeça de um corpo já com esqueleto (pose T, rig mixamorig) por uma cabeça detalhada separada que tem
# shape keys de expressão (expressao_*.py): a cabeça do corpo é cortada no pescoço, a detalhada é alinhada sobre
# ela (ICP rígido com escala), cortada um pouco abaixo do corte do corpo, e a borda é encostada no pescoço do corpo
# numa faixa suave (o mesmo deslocamento em todas as shape keys, para as expressões continuarem valendo).
# Pesos da cabeça: só Neck e Head, misturados pela altura. A cabeça fica como objeto próprio.
# Uso: Blender -b CORPO_RIG.blend --python blender/trocar_cabeca.py -- CABECA.blend SAIDA_PREFIXO
#   CAB_CORTE (0.55: fração Neck->Head onde o corpo é cortado; negativo desce para perto da gola)  CAB_SOBRA (0.012 m de cabeça abaixo do corte)
#   CAB_AJUSTE ("escala,z_dos_olhos,subida": ajuste medido na imagem contra a cabeça original)
#   CAB_TOM_FAIXA (0.09 m: altura em que a cor da cabeça vai do tom do pescoço ao dela)
#   CAB_ESTICA (m abaixo do osso Neck até onde o pescoço da cabeça é esticado)  CAB_FAIXA (0.03 m: faixa da emenda)  CAB_SOBREPOE (0.004 m: quanto a cabeça cobre o pescoço do corpo)
import bpy, sys, os
import numpy as np
from mathutils import Vector, Matrix
from mathutils.kdtree import KDTree
from mathutils.bvhtree import BVHTree

a = sys.argv[sys.argv.index("--") + 1:]
CAB, SAIDA = a[0], a[1]
CORTE = float(os.environ["CAB_CORTE"]) if os.environ.get("CAB_CORTE", "0.55") != "auto" else 0.55; SOBRA = float(os.environ.get("CAB_SOBRA", "0.012"))
FAIXA = float(os.environ.get("CAB_FAIXA", "0.03"))
cena = bpy.context.scene
rig = next(o for o in cena.objects if o.type == "ARMATURE")
corpo = next(o for o in cena.objects if o.type == "MESH" and o.parent == rig)
def osso(n): return np.array(rig.matrix_world @ rig.data.bones["mixamorig:" + n].head_local)
zn, zh = osso("Neck")[2], osso("Head")[2]; zcorte = zn + CORTE * (zh - zn)
zalinha = zn + 0.55 * (zh - zn)   # o alinhamento usa só a cabeça (acima disto), qualquer que seja o corte
def pts(o):
    co = np.empty(len(o.data.vertices) * 3); o.data.vertices.foreach_get("co", co)
    return (np.array(o.matrix_world) @ np.c_[co.reshape(-1, 3), np.ones(len(o.data.vertices))].T).T[:, :3]

def lum_vertices(ob):
    """luminância da cor da textura em cada vértice (cabelo é escuro, pele é clara)"""
    m = ob.active_material; nt = m.node_tree
    tex = next(n for n in nt.nodes if n.type == "TEX_IMAGE" and n.image and any(l.to_socket.name in ("Base Color", "A", "B") or l.to_node.type in ("MIX", "BSDF_PRINCIPLED") for l in n.outputs[0].links))
    im = tex.image.copy(); im.scale(512, 512); px = np.array(im.pixels[:]).reshape(512, 512, 4); bpy.data.images.remove(im)
    uv = np.zeros((len(ob.data.vertices), 2)); cont = np.zeros(len(ob.data.vertices)); uvl = ob.data.uv_layers[0].data
    lv = np.empty(len(ob.data.loops), dtype=np.int64); ob.data.loops.foreach_get("vertex_index", lv)
    luv = np.empty(len(ob.data.loops) * 2); uvl.foreach_get("uv", luv); luv = luv.reshape(-1, 2)
    np.add.at(uv, lv, luv); np.add.at(cont, lv, 1); uv /= np.maximum(cont, 1)[:, None]
    c = px[np.clip((uv[:, 1] * 511).astype(int), 0, 511), np.clip((uv[:, 0] * 511).astype(int), 0, 511), :3]
    return c @ np.array([0.2126, 0.7152, 0.0722])

PELE = float(os.environ.get("CAB_PELE", "0.16"))
Pc = pts(corpo)
regiao_cab = (Pc[:, 2] > min(zn, zn + CORTE * (zh - zn)) - 0.03) & (np.abs(Pc[:, 0]) < 0.16) & (np.abs(Pc[:, 0]) < 0.075 + np.clip(Pc[:, 2] - zn, 0, 1) * 2)
# alinha só pela PELE (rosto, orelhas, nuca): o cabelo da cabeça detalhada é mais volumoso e, alinhando por ele,
# o rosto ficava maior que o do corpo
pele_c = lum_vertices(corpo) > PELE
# alinha pela faixa do queixo à altura dos olhos (rosto, maxilar, orelhas, nuca): é o que as duas cabeças têm igual.
# A cabeça inteira puxava pelo volume do cabelo (rosto grande demais); só a pele puxava pelo pescoço (pequeno demais).
zt_osso = osso("HeadTop_End")[2]; zfaixa = zh + float(os.environ.get("CAB_FAIXA_OLHOS", "0.5")) * (zt_osso - zh)
alvo_cab = Pc[regiao_cab & (Pc[:, 2] > zalinha) & (Pc[:, 2] < zfaixa)]
# traz a cabeça detalhada
with bpy.data.libraries.load(CAB, link=False) as (src, dst): dst.objects = ["cabeca"]
cab = dst.objects[0]; cena.collection.objects.link(cab)
cab.parent = None
kb = cab.data.shape_keys.key_blocks
for k in kb: k.value = 0
Bloc = np.array([v.co[:] for v in kb["Basis"].data])
Mw = np.array(cab.matrix_world); Q = (Mw @ np.c_[Bloc, np.ones(len(Bloc))].T).T[:, :3]
pele_q = lum_vertices(cab) > PELE
# palpite inicial: topo do cabelo e largura da cabeça
def largura(X, z0, z1):
    s = X[(X[:, 2] > z0) & (X[:, 2] < z1)]; return np.ptp(s[:, 0])
ztc, zbc = alvo_cab[:, 2].max(), zalinha
# palpite: a mesma fração da altura da cabeça detalhada (do topo para baixo) que a faixa ocupa no corpo
hb = zt_osso - zalinha; hq = Q[:, 2].max() - np.percentile(Q[:, 2], 25)
s0 = hb / hq
T = np.eye(4); T[:3, :3] *= s0
Q0 = Q * s0; T[:3, 3] = [alvo_cab[:, 0].mean() - Q0[:, 0].mean(), alvo_cab[:, 1].mean() - Q0[:, 1].mean(), zt_osso - Q0[:, 2].max()]
Qa = (T @ np.c_[Q, np.ones(len(Q))].T).T[:, :3]
# ICP com escala, só com a parte de cima da cabeça detalhada (o pescoço dela é mais longo que o do corpo)
kd = KDTree(len(alvo_cab))
for i, p in enumerate(alvo_cab): kd.insert(p, i)
kd.balance()
rng = np.random.default_rng(0)
for _ in range(40):
    sel = Qa[(Qa[:, 2] > zalinha) & (Qa[:, 2] < zfaixa)]; am = sel[rng.choice(len(sel), min(8000, len(sel)), replace=False)]
    pr = np.array([kd.find(q)[0][:] for q in am]); d = np.linalg.norm(pr - am, axis=1); ok = d < np.percentile(d, 70)
    A_, B_ = am[ok], pr[ok]; ca, cb = A_.mean(0), B_.mean(0); U, S, Vt = np.linalg.svd((A_ - ca).T @ (B_ - cb))
    D = np.diag([1, 1, np.sign(np.linalg.det(Vt.T @ U.T))]); R = Vt.T @ D @ U.T; s = (S * np.diag(D)).sum() / ((A_ - ca) ** 2).sum()
    t = cb - s * R @ ca; M = np.eye(4); M[:3, :3] = s * R; M[:3, 3] = t; T = M @ T
    Qa = (T @ np.c_[Q, np.ones(len(Q))].T).T[:, :3]
# ajuste fino medido na imagem contra a cabeça original do corpo: "escala,pz,dz" = escala em volta do ponto de altura
# pz (os olhos) e subida dz em metros
if os.environ.get("CAB_AJUSTE"):
    ea, pz, dz = [float(x) for x in os.environ["CAB_AJUSTE"].split(",")]
    cx, cy = Qa[:, 0].mean(), Qa[:, 1].mean()
    Adj = np.eye(4); Adj[:3, :3] *= ea; Adj[:3, 3] = np.array([cx, cy, pz]) * (1 - ea) + np.array([0, 0, dz]); T = Adj @ T
    Qa = (T @ np.c_[Q, np.ones(len(Q))].T).T[:, :3]
    print(f"AJUSTE escala {ea} em volta de z {pz}, subida {dz * 1000:.0f} mm")
print(f"ALINHADA erro mediano {np.median(d[ok]) * 1000:.1f} mm, escala total {np.cbrt(abs(np.linalg.det(T[:3, :3]))):.4f}")
# aplica a transformação na cabeça (todas as shape keys)
Mfinal = T @ Mw
for k in kb:
    X = np.array([v.co[:] for v in k.data]); X = (Mfinal @ np.c_[X, np.ones(len(X))].T).T[:, :3]
    k.data.foreach_set("co", X.ravel())
cab.matrix_world = Matrix.Identity(4)
cab.data.vertices.foreach_set("co", np.array([v.co[:] for v in kb["Basis"].data]).ravel()); cab.data.update()

# estica o pescoço da cabeça para baixo até a base do pescoço do corpo (se o ajuste subiu a cabeça, o pescoço dela
# deixou de alcançar o do corpo e abria um vão); mesma deformação em todas as shape keys
if os.environ.get("CAB_ESTICA"):
    Pq0 = pts(cab); zb = float(Pq0[:, 2].min()); zalvo = zn - float(os.environ["CAB_ESTICA"]); ztopo = zb + 0.05
    if zalvo < zb:
        for k in cab.data.shape_keys.key_blocks:
            X = np.array([v.co[:] for v in k.data]); z = X[:, 2]
            X[:, 2] = np.where(z < ztopo, zalvo + (z - zb) * (ztopo - zalvo) / (ztopo - zb), z); k.data.foreach_set("co", X.ravel())
        cab.data.vertices.foreach_set("co", np.array([v.co[:] for v in cab.data.shape_keys.key_blocks["Basis"].data]).ravel()); cab.data.update()
        print(f"ESTICA pescoço da cabeça de z {zb:.3f} até {zalvo:.3f}")
# corte automático: onde a cabeça já posicionada termina (o ajuste pode subir a cabeça e o pescoço dela não alcançar
# mais o corte fixo; sobrava um talo do pescoço do corpo)
if os.environ.get("CAB_CORTE") == "auto":
    Pq0 = pts(cab); zcorte = float(Pq0[:, 2].min()) + SOBRA + 0.004
    regiao_cab = (Pc[:, 2] > zcorte - 0.03) & (np.abs(Pc[:, 0]) < 0.12)
    print(f"CORTE automático em z {zcorte:.3f} (fim do pescoço da cabeça)")
# cópia do corpo antes do corte: a emenda encosta a cabeça no pescoço e na garganta ORIGINAIS (o que sobra do corpo
# depois do corte acaba na borda, e pontos altos da faixa eram puxados para ela)
ref = corpo.copy(); ref.data = corpo.data.copy(); cena.collection.objects.link(ref)
# corta o corpo no pescoço e a cabeça um pouco abaixo
def apagar(ob, mascara):
    import bmesh
    bm = bmesh.new(); bm.from_mesh(ob.data); bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.verts[i] for i in np.nonzero(mascara)[0]], context="VERTS"); bm.to_mesh(ob.data); bm.free(); ob.data.update()
# do corpo sai tudo acima do corte e também o que estiver dentro da cabeça nova ou rente a ela (queixo e lábios da
# cabeça antiga atravessavam o rosto novo)
cab.data.update(); bvh_c = BVHTree.FromObject(cab, bpy.context.evaluated_depsgraph_get())
dentro = np.zeros(len(Pc), bool)
for i in np.nonzero(regiao_cab | (Pc[:, 2] > zn - 0.02))[0]:
    loc, nrm, _, dist = bvh_c.find_nearest(Vector(Pc[i]))
    if loc is not None and (dist < 0.008 or (Vector(Pc[i]) - loc).dot(nrm) < 0): dentro[i] = True
# o queixo antigo pende para a frente abaixo do corte; o pescoço do corpo fica dentro do pescoço da cabeça nova e
# não pode sair (abria buraco na gola). Só sai o que está dentro da cabeça nova E na frente do pescoço.
anel = Pc[(np.abs(Pc[:, 2] - zn) < 0.01) & (np.abs(Pc[:, 0]) < 0.05)]
y_frente = anel[:, 1].min() if len(anel) else -1
queixo = dentro & (Pc[:, 1] < y_frente - 0.004) & (Pc[:, 2] > zcorte - 0.06) & (np.abs(Pc[:, 0]) < 0.09)
# o corpo sai até logo abaixo da borda da cabeça (sobreposição pequena: duas texturas na mesma superfície manchavam)
z_corpo = zcorte - SOBRA + float(os.environ.get("CAB_SOBREPOE", "0.004"))
apagar(corpo, (regiao_cab & (Pc[:, 2] > z_corpo)) | queixo)
print(f"QUEIXO antigo: {int(queixo.sum())} pontos (frente do pescoço em y {y_frente:.3f})")
print(f"DENTRO {int(dentro.sum())} pontos do corpo dentro ou rentes à cabeça nova")
Pq = pts(cab)
# shape keys: bmesh.delete preserva as camadas de shape key
apagar(cab, Pq[:, 2] < zcorte - SOBRA)
print(f"CORTE corpo em z {zcorte:.3f}; cabeça com {len(cab.data.vertices)} vértices")
# emenda: a parte de baixo da cabeça encosta na superfície do pescoço do corpo (faixa suave)
Pq = pts(cab); dg = bpy.context.evaluated_depsgraph_get()
bvh = BVHTree.FromObject(ref, dg); Mi = ref.matrix_world.inverted(); Mc = ref.matrix_world
zb = float(Pq[:, 2].min())
w = np.clip(1 - (Pq[:, 2] - zb) / FAIXA, 0, 1); w = w * w * (3 - 2 * w)
# protege só o queixo: na frente do pescoço, acima da linha mais baixa do queixo, não puxa (a garganta abaixo, sim)
frente_q = Pq[:, 1] < y_frente - 0.003
meio = frente_q & (np.abs(Pq[:, 0] - Pq[:, 0].mean()) < 0.03)
z_queixo = float(Pq[meio, 2].min()) if meio.any() else zb
w *= np.where(frente_q, np.clip((z_queixo - Pq[:, 2]) / 0.012 + 0.2, 0, 1), 1)
print(f"QUEIXO da cabeça em z {z_queixo:.3f}")
desl = np.zeros_like(Pq)
for i in np.nonzero(w > 0)[0]:
    loc, _, _, dist = bvh.find_nearest(Mi @ Vector(Pq[i]))
    if loc is not None and dist < 0.04: desl[i] = (np.array(Mc @ loc) - Pq[i]) * w[i]
for k in cab.data.shape_keys.key_blocks:
    X = np.array([v.co[:] for v in k.data]) + desl; k.data.foreach_set("co", X.ravel())
cab.data.vertices.foreach_set("co", np.array([v.co[:] for v in cab.data.shape_keys.key_blocks["Basis"].data]).ravel()); cab.data.update()
print(f"EMENDA {int((w > 0).sum())} vértices encostados, desloc. médio {np.linalg.norm(desl[w > 0], axis=1).mean() * 1000:.1f} mm")
# tom da pele: perto da emenda a pintura da cabeça é levada à cor do pescoço do corpo, sumindo para cima (cor de
# vértice que multiplica a textura no material; o glTF leva como COLOR_0)
def cor_vertices(ob):
    m = ob.active_material; nt = m.node_tree
    tex = next(n for n in nt.nodes if n.type == "TEX_IMAGE" and n.image and any(l.to_node.type in ("MIX", "BSDF_PRINCIPLED") for l in n.outputs[0].links))
    im = tex.image.copy(); im.scale(512, 512); px = np.array(im.pixels[:]).reshape(512, 512, 4); bpy.data.images.remove(im)
    uv = np.zeros((len(ob.data.vertices), 2)); cont = np.zeros(len(ob.data.vertices))
    lv = np.empty(len(ob.data.loops), dtype=np.int64); ob.data.loops.foreach_get("vertex_index", lv)
    luv = np.empty(len(ob.data.loops) * 2); ob.data.uv_layers[0].data.foreach_get("uv", luv); luv = luv.reshape(-1, 2)
    np.add.at(uv, lv, luv); np.add.at(cont, lv, 1); uv /= np.maximum(cont, 1)[:, None]
    return px[np.clip((uv[:, 1] * 511).astype(int), 0, 511), np.clip((uv[:, 0] * 511).astype(int), 0, 511), :3]
Pq = pts(cab); zb = float(Pq[:, 2].min()); Cq = cor_vertices(cab)
Pc3 = pts(corpo); Cc = cor_vertices(corpo)
def e_pele(C): return (C @ [0.2126, 0.7152, 0.0722] > PELE) & (C[:, 0] - C[:, 2] > 0.08)   # clara e alaranjada (não a camiseta)
fc = (Pc3[:, 2] > zb - 0.03) & (Pc3[:, 2] < zb + 0.01) & (np.abs(Pc3[:, 0]) < 0.07) & e_pele(Cc)
fq = (Pq[:, 2] < zb + 0.03) & e_pele(Cq)
razao = np.clip(np.median(Cc[fc], 0) / np.maximum(np.median(Cq[fq], 0), 1e-3), 0.7, 1.4) if fc.sum() > 20 and fq.sum() > 20 else np.ones(3)
print(f"TOM amostras: corpo {int(fc.sum())}, cabeça {int(fq.sum())}")
TOM = float(os.environ.get("CAB_TOM_FAIXA", "0.09"))
g = np.clip(1 - (Pq[:, 2] - zb) / TOM, 0, 1)[:, None]; g = g * g * (3 - 2 * g)
tom = 1 + (razao[None, :] - 1) * g
if "tom" in cab.data.color_attributes: cab.data.color_attributes.remove(cab.data.color_attributes["tom"])
ca = cab.data.color_attributes.new("tom", "FLOAT_COLOR", "POINT"); ca.data.foreach_set("color", np.c_[tom, np.ones(len(tom))].ravel())
nt = cab.active_material.node_tree; bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
fonte = bsdf.inputs["Base Color"].links[0].from_socket
at = nt.nodes.new("ShaderNodeVertexColor"); at.layer_name = "tom"
mul = nt.nodes.new("ShaderNodeMix"); mul.data_type = "RGBA"; mul.blend_type = "MULTIPLY"; mul.inputs[0].default_value = 1
nt.links.new(fonte, mul.inputs[6]); nt.links.new(at.outputs["Color"], mul.inputs[7]); nt.links.new(mul.outputs[2], bsdf.inputs["Base Color"])
print(f"TOM corrigido perto da emenda: razão {np.round(razao, 3)}")
bpy.data.objects.remove(ref, do_unlink=True)
# pesos: só pescoço e cabeça, pela altura (pegar da pele mais perto puxava a orelha pelo osso do ombro)
zh2 = zh + 0.04
cab.vertex_groups.clear()
gN = cab.vertex_groups.new(name="mixamorig:Neck"); gH = cab.vertex_groups.new(name="mixamorig:Head")
for i, p in enumerate(pts(cab)):
    t = float(np.clip((p[2] - zn) / max(zh2 - zn, 1e-3), 0, 1)); t = t * t * (3 - 2 * t)
    if t < 0.999: gN.add([i], 1 - t, "REPLACE")
    if t > 0.001: gH.add([i], t, "REPLACE")
grupos = {"mixamorig:Neck": gN, "mixamorig:Head": gH}
cab.name = cab.data.name = "neto-cabeca"
cab.parent = rig; cab.matrix_parent_inverse = rig.matrix_world.inverted()
md = cab.modifiers.new("Armature", "ARMATURE"); md.object = rig
print("GRUPOS", sorted(grupos)[:8], "...")
bpy.ops.wm.save_as_mainfile(filepath=f"{SAIDA}.blend")
print("PRONTO cabeca")
