# Olhos da expressão por TEXTURA: o olho é pintado na malha, então deformar a pálpebra arrasta a íris junto e o olho
# não estreita. Aqui a região dos olhos das imagens 2D (neutra e com a expressão, editadas pelo Codex) é projetada da
# câmera de frente na textura da cabeça, com a cor casada à pintura do Meshy e borda suave. Saem duas texturas
# (neutra e expressão) que o jogo mistura pela mesma porcentagem da shape key.
# Uso: Blender -b CABECA.blend --python blender/olhos_textura.py -- PONTOS.json NEUTRA.png EXPR.png FORMA SAIDA_PREFIXO
#   PONTOS.json: {"render": [[olho_esq], [olho_dir], ...], "imagem": [...]} (pixels do render de frente 1024 do
#   expressao_fluxo.py e da imagem 2D; os dois primeiros pontos são os centros dos olhos)
#   OLHOS_FLUXO_VOLTA (npy do fluxo expressão -> neutra entre as imagens 2D: desliza a pintura do Meshy em vez de trocar)
#   OLHOS_MODO=diferenca (soma só a mudança entre as imagens 2D à pintura do Meshy)  OLHOS_GANHO (1.0)
#   OLHOS_RES (4096)  OLHOS_RAIO (95, 62: semieixos da elipse em px do render)  OLHOS_BORDA (0.35)  OLHOS_FORMA_CHEIA (2.0)
import bpy, sys, os, math, json
import numpy as np

a = sys.argv[sys.argv.index("--") + 1:]
PONTOS, IMG_N, IMG_E, FORMA, SAIDA = a[0], a[1], a[2], a[3], a[4]
RES = int(os.environ.get("OLHOS_RES", "4096")); RX, RY = [float(x) for x in os.environ.get("OLHOS_RAIO", "95,62").split(",")]
BORDA = float(os.environ.get("OLHOS_BORDA", "0.35")); CHEIA = float(os.environ.get("OLHOS_FORMA_CHEIA", "2.0"))
cena = bpy.context.scene
cab = bpy.data.objects["cabeca"]; kb = cab.data.shape_keys.key_blocks
for k in kb: k.value = 0
Mw = np.array(cab.matrix_world)
B = np.array([v.co[:] for v in kb["Basis"].data]); P = (Mw @ np.c_[B, np.ones(len(B))].T).T[:, :3]
# mesma câmera de frente do expressao_fluxo.py (render 1024, ortográfica)
mn, mx = P.min(0), P.max(0); centro = (mn + mx) / 2; centro[2] = mn[2] + 0.55 * (mx[2] - mn[2])
ORTO = float(np.max(mx - mn)) * 0.75; R0 = 1024
x = ((P[:, 0] - centro[0]) / ORTO + 0.5) * R0; y = (0.5 - (P[:, 2] - centro[2]) / ORTO) * R0
pp = json.load(open(PONTOS)); pr = np.array(pp["render"], float); pi = np.array(pp["imagem"], float)
A = np.c_[pr, np.ones(len(pr))]; Maf, *_ = np.linalg.lstsq(A, pi, rcond=None)      # render -> imagem (afim)
uvimg = np.c_[x, y, np.ones(len(x))] @ Maf
imN = bpy.data.images.load(IMG_N); imE = bpy.data.images.load(IMG_E); W, H = imN.size
proj = np.c_[uvimg[:, 0] / W, 1 - uvimg[:, 1] / H]
# máscara dos olhos: elipses nos dois centros, borda suave, só o que olha para a frente
nrm = np.empty(len(B) * 3); cab.data.vertices.foreach_get("normal", nrm); N = (Mw[:3, :3] @ nrm.reshape(-1, 3).T).T
frente = np.clip((-N[:, 1] - 0.2) / 0.3, 0, 1)
m = np.zeros(len(B))
for cx, cy in pr[:2]:
    d = np.sqrt(((x - cx) / RX) ** 2 + ((y - cy) / RY) ** 2)
    m = np.maximum(m, np.clip((1 - d) / BORDA, 0, 1))
m *= frente
print(f"MASCARA {int((m > 0.5).sum())} vértices nos olhos")
me = cab.data
if "proj" in me.uv_layers: me.uv_layers.remove(me.uv_layers["proj"])
base_uv = me.uv_layers.active; base_nome = base_uv.name
lp = me.uv_layers.new(name="proj"); me.uv_layers.active = me.uv_layers[base_nome]
lv = np.empty(len(me.loops), dtype=np.int64); me.loops.foreach_get("vertex_index", lv)
lp.data.foreach_set("uv", proj[lv].ravel())
if "masc_olhos" in me.color_attributes: me.color_attributes.remove(me.color_attributes["masc_olhos"])
ca = me.color_attributes.new("masc_olhos", "FLOAT_COLOR", "POINT")
ca.data.foreach_set("color", np.c_[m, m, m, np.ones(len(m))].ravel())

# bake (Cycles, emissão) da projeção de cada imagem e da máscara para o espaço de UV da cabeça
cena.render.engine = "CYCLES"; cena.cycles.samples = 1; cena.cycles.device = "CPU"
b = cena.render.bake; b.margin = 8; b.use_selected_to_active = False
mat = cab.active_material; nt = mat.node_tree
out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL"); antigo = out.inputs[0].links[0].from_socket
em = nt.nodes.new("ShaderNodeEmission"); nt.links.new(em.outputs[0], out.inputs[0])
uvn = nt.nodes.new("ShaderNodeUVMap"); uvn.uv_map = "proj"
tx = nt.nodes.new("ShaderNodeTexImage"); tx.extension = "EXTEND"; nt.links.new(uvn.outputs[0], tx.inputs[0])
atr = nt.nodes.new("ShaderNodeAttribute"); atr.attribute_name = "masc_olhos"
alvo = nt.nodes.new("ShaderNodeTexImage")
for o in cena.objects: o.select_set(o == cab)
bpy.context.view_layer.objects.active = cab


def assar(fonte, nome):
    im = bpy.data.images.new(nome, RES, RES, float_buffer=True); alvo.image = im; nt.nodes.active = alvo
    if fonte == "mascara": nt.links.new(atr.outputs["Color"], em.inputs[0])
    elif fonte is not None: tx.image = fonte; nt.links.new(tx.outputs[0], em.inputs[0])
    bpy.ops.object.bake(type="EMIT")
    return np.array(im.pixels[:], dtype=np.float32).reshape(RES, RES, 4)


Cn = assar(imN, "proj_neutra"); Ce = assar(imE, "proj_expr"); Mv = assar("mascara", "mascara")[..., 0:1]
# máscara por texel (a de vértice sai em degraus): coordenada da projeção assada como cor, elipse na imagem 2D
nt.links.new(uvn.outputs[0], em.inputs[0]); Uv = assar(None, "coord")[..., :2]
ix, iy = Uv[..., 0] * W, (1 - Uv[..., 1]) * H
esc = np.sqrt(abs(np.linalg.det(Maf[:2, :2].T)))   # px do render -> px da imagem
Mk = np.zeros((RES, RES), np.float32)
for cx, cy in pi[:2]:
    d = np.sqrt(((ix - cx) / (RX * esc)) ** 2 + ((iy - cy) / (RY * esc)) ** 2)
    Mk = np.maximum(Mk, np.clip((1 - d) / BORDA, 0, 1))
Mk = (Mk * np.clip(Mv[..., 0] * 3, 0, 1))[..., None]   # a de vértice só corta o que não olha para a frente
Mk = Mk * Mk * (3 - 2 * Mk)                             # borda mais macia
nt.links.new(antigo, out.inputs[0])
img_base = next(n for n in nt.nodes if n.type == "TEX_IMAGE" and any(l.to_socket.name == "Base Color" for l in n.outputs[0].links)).image
basep = img_base.copy(); basep.scale(RES, RES); Bt = np.array(basep.pixels[:], dtype=np.float32).reshape(RES, RES, 4)
# casa a cor da imagem 2D com a pintura do Meshy dentro da máscara (média e desvio por canal; mesmo ajuste nas duas)
sel = Mk[..., 0] > 0.6
for c in range(3):
    mb, sb = Bt[..., c][sel].mean(), Bt[..., c][sel].std() + 1e-6; mn_, sn_ = Cn[..., c][sel].mean(), Cn[..., c][sel].std() + 1e-6
    g = float(np.clip(sb / sn_, 0.85, 1.1))   # ganho livre exagerava o vermelho (sombra laranja em volta do olho)
    for C in (Cn, Ce): C[..., c] = (C[..., c] - mn_) * g + mb
print(f"COR casada em {int(sel.sum())} texels")
if os.environ.get("OLHOS_MODO") == "diferenca":
    # soma à pintura do Meshy só a MUDANÇA entre as duas imagens 2D (expressão - neutra): tolera o olho do Meshy não
    # estar exatamente onde está o da imagem, e não traz a cor nem a sombra da imagem
    lum = np.array([0.2126, 0.7152, 0.0722], np.float32)
    dL = (Ce[..., :3] @ lum - Cn[..., :3] @ lum) * float(os.environ.get("OLHOS_GANHO", "1.0"))
    Lb = np.maximum(Bt[..., :3] @ lum, 0.02)
    fator = np.clip((Lb + dL) / Lb, 0.2, 3.0)[..., None]   # só claro/escuro, a cor continua a do Meshy
    Cn = Bt.copy(); Ce = Bt.copy(); Ce[..., :3] = Bt[..., :3] * fator   # a máscara entra na composição abaixo
    print("DIFERENCA aplicada")
FLUXO_VOLTA = os.environ.get("OLHOS_FLUXO_VOLTA")
if FLUXO_VOLTA:
    # modo deslizar: a pintura do próprio Meshy é movida pelo fluxo das imagens 2D (expressão -> neutra), sem trocar
    # cor; o neutro fica intacto. Mapa inverso imagem 2D -> texel, feito espalhando os texels e preenchendo buracos.
    fb = np.load(FLUXO_VOLTA)                                            # (H, W, 2) em px da imagem 2D
    regiao = (Mk[..., 0] > 0.001) | (Mv[..., 0] > 0.05)
    ty, tx_ = np.nonzero(regiao)
    gx = np.clip(np.round(ix[ty, tx_]).astype(int), 0, W - 1); gy = np.clip(np.round(iy[ty, tx_]).astype(int), 0, H - 1)
    inv = -np.ones((H, W), np.int64); inv[gy, gx] = ty * RES + tx_
    for _ in range(12):                                                  # preenche buracos pelo vizinho
        vazio = inv < 0
        if not vazio.any(): break
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            viz = np.roll(np.roll(inv, dy, 0), dx, 1); pega = vazio & (viz >= 0) & (inv < 0); inv[pega] = viz[pega]
    sel_t = Mk[..., 0] > 0.001; sy, sx = np.nonzero(sel_t)
    qx = np.clip(np.round(ix[sy, sx]).astype(int), 0, W - 1); qy = np.clip(np.round(iy[sy, sx]).astype(int), 0, H - 1)
    f = fb[qy, qx]; q2x = np.clip(np.round(qx + f[:, 0]).astype(int), 0, W - 1); q2y = np.clip(np.round(qy + f[:, 1]).astype(int), 0, H - 1)
    origem = inv[q2y, q2x]; ok = origem >= 0
    Wd = Bt.copy(); Wd[sy[ok], sx[ok]] = Bt.reshape(-1, 4)[origem[ok]]
    Cn = Bt.copy(); Ce = Wd
    print(f"DESLIZAR {int(ok.sum())} texels movidos de {len(ok)}")
for nome, C in (("neutra", Cn), ("expr", Ce)):
    T = Bt.copy(); T[..., :3] = Bt[..., :3] * (1 - Mk) + np.clip(C[..., :3], 0, 1) * Mk
    im = bpy.data.images.new(f"olhos_{nome}", RES, RES); im.pixels[:] = T.ravel()
    im.filepath_raw = f"{SAIDA}-textura-{nome}.png"; im.file_format = "PNG"; im.save()
    print("SALVA", im.filepath_raw)

# prévia no Blender: as duas texturas misturadas pela shape key (CHEIA = valor da forma que conta como expressão inteira)
tn = nt.nodes.new("ShaderNodeTexImage"); tn.image = bpy.data.images.load(f"{SAIDA}-textura-neutra.png")
te = nt.nodes.new("ShaderNodeTexImage"); te.image = bpy.data.images.load(f"{SAIDA}-textura-expr.png")
mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"
nt.links.new(tn.outputs[0], mix.inputs[6]); nt.links.new(te.outputs[0], mix.inputs[7])
bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"); nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
drv = mix.inputs[0].driver_add("default_value").driver; drv.type = "SCRIPTED"
var = drv.variables.new(); var.name = "v"; var.targets[0].id_type = "KEY"; var.targets[0].id = cab.data.shape_keys
var.targets[0].data_path = f'key_blocks["{FORMA}"].value'
drv.expression = f"min(max(v / {CHEIA}, 0), 1)"
for n in (em, uvn, tx, atr, alvo): nt.nodes.remove(n)
me.uv_layers.remove(me.uv_layers["proj"])
bpy.ops.wm.save_as_mainfile(filepath=f"{SAIDA}.blend")
print("PRONTO olhos")
