# Expressão como shape key guiada pela PINTURA: o "ponto mais perto" só vê movimento para fora da pele; o canto da
# boca que sobe pela bochecha num sorriso desliza pela superfície e some. Aqui as duas cabeças (neutra reduzida e a
# geração do Meshy com a expressão, já alinhada) são renderizadas só com a cor da textura, de 3 ângulos, junto com
# um mapa de posição 3D por pixel; o fluxo óptico entre as imagens (OpenCV, fora do Blender) diz para onde foi cada
# pedaço do desenho, e isso volta para os vértices. Costuras de UV soldadas por posição (sem rachar).
# Passos:
#   1) Blender -b CABECA.blend --python blender/expressao_fluxo.py -- render EXPRESSAO.glb PASTA
#   2) PYTHON_COM_CV2 blender/fluxo_cv.py PASTA
#   3) Blender -b CABECA.blend --python blender/expressao_fluxo.py -- aplicar NOME PASTA SAIDA_PREFIXO
#   2 alternativo (fluxo das imagens 2D do Codex): PYTHON_COM_CV2 blender/fluxo_2d.py PASTA 0=NEUTRA.png,EXPR.png 90=...
#     e no passo 3 FLUXO_FONTE=neutra
#   FLUXO_RES (1024)  FLUXO_ANGULOS ("0,-35,35")  EXPR_SUAVIZA (4)  EXPR_PELE (0.18)  EXPR_QUEIXO (0.20)  EXPR_DILATA (3)  EXPR_MAX (0.06)
import bpy, sys, os, math, json
import numpy as np
from mathutils import Vector, Matrix
from mathutils.kdtree import KDTree

a = sys.argv[sys.argv.index("--") + 1:]
MODO = a[0]
RES = int(os.environ.get("FLUXO_RES", "1024")); ANGS = [float(x) for x in os.environ.get("FLUXO_ANGULOS", "0,-35,35").split(",")]
cena = bpy.context.scene
cab = bpy.data.objects["cabeca"]
for k in (cab.data.shape_keys.key_blocks if cab.data.shape_keys else []): k.value = 0


def pontos(ob):
    co = np.empty(len(ob.data.vertices) * 3); ob.data.vertices.foreach_get("co", co)
    return (np.array(ob.matrix_world) @ np.c_[co.reshape(-1, 3), np.ones(len(ob.data.vertices))].T).T[:, :3]


P = pontos(cab)
mn, mx = P.min(0), P.max(0); centro = (mn + mx) / 2; centro[2] = mn[2] + 0.55 * (mx[2] - mn[2])
ORTO = float(np.max(mx - mn)) * 0.75   # enquadra o rosto inteiro
DIST = float(np.max(mx - mn)) * 3


def camera(ang):
    r = math.radians(ang)
    loc = Vector((centro[0] + DIST * math.sin(r), centro[1] - DIST * math.cos(r), centro[2]))
    rot = (math.pi / 2, 0, r)
    return loc, rot


def eixos(ang):
    r = math.radians(ang)
    direita = np.array([math.cos(r), math.sin(r), 0.0]); cima = np.array([0, 0, 1.0])
    frente = np.array([-math.sin(r), math.cos(r), 0.0])   # da câmera para a cabeça
    return direita, cima, frente


def pixel(Q, ang):
    """coordenada de pixel (x, y) de pontos de mundo na câmera ortográfica do ângulo"""
    direita, cima, _ = eixos(ang)
    loc, _ = camera(ang); L = np.array(loc)
    x = ((Q - L) @ direita / ORTO + 0.5) * RES
    y = (0.5 - (Q - L) @ cima / ORTO) * RES
    return x, y


if MODO == "render":
    EXPR, PASTA = a[1], a[2]
    os.makedirs(PASTA, exist_ok=True)
    antes = set(cena.objects); bpy.ops.import_scene.gltf(filepath=EXPR)
    novos = [o for o in cena.objects if o not in antes]
    alvo = max((o for o in novos if o.type == "MESH"), key=lambda o: len(o.data.polygons))
    for o in novos:
        if o != alvo: bpy.data.objects.remove(o, do_unlink=True)
    alvo.parent = None
    for o in cena.objects: o.select_set(o == alvo)
    bpy.context.view_layer.objects.active = alvo; bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    # alinhamento rígido com escala (ICP aparado) da expressão sobre a neutra
    Q = pontos(alvo); kd = KDTree(len(P))
    for i, p in enumerate(P): kd.insert(p, i)
    kd.balance()
    am = Q[np.random.default_rng(0).choice(len(Q), min(20000, len(Q)), replace=False)]; T = np.eye(4)
    for _ in range(25):
        pr = np.array([kd.find(q)[0][:] for q in am]); d = np.linalg.norm(pr - am, axis=1); ok = d < np.percentile(d, 60)
        A_, B_ = am[ok], pr[ok]; ca, cb = A_.mean(0), B_.mean(0); U, S, Vt = np.linalg.svd((A_ - ca).T @ (B_ - cb))
        D = np.diag([1, 1, np.sign(np.linalg.det(Vt.T @ U.T))]); R = Vt.T @ D @ U.T; s = (S * np.diag(D)).sum() / ((A_ - ca) ** 2).sum()
        t = cb - s * R @ ca; am = (s * (R @ am.T)).T + t; M = np.eye(4); M[:3, :3] = s * R; M[:3, 3] = t; T = M @ T
    alvo.matrix_world = Matrix(T.tolist()) @ alvo.matrix_world
    print(f"ALINHADO erro mediano {np.median(d[ok]):.4f}")
    # materiais: cor pura (emissão da textura) e posição de mundo
    def mat_cor(ob):
        m = ob.active_material; nt = m.node_tree
        tex = next(n for n in nt.nodes if n.type == "TEX_IMAGE" and any(l.to_socket.name == "Base Color" for l in n.outputs[0].links))
        em = nt.nodes.new("ShaderNodeEmission"); nt.links.new(tex.outputs[0], em.inputs[0])
        out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL"); nt.links.new(em.outputs[0], out.inputs[0])
    def mat_pos(ob):
        m = bpy.data.materials.new("pos"); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
        g = nt.nodes.new("ShaderNodeNewGeometry"); em = nt.nodes.new("ShaderNodeEmission"); out = nt.nodes.new("ShaderNodeOutputMaterial")
        nt.links.new(g.outputs["Position"], em.inputs[0]); nt.links.new(em.outputs[0], out.inputs[0])
        ob.data.materials.clear(); ob.data.materials.append(m)
    cam = bpy.data.objects.new("cf", bpy.data.cameras.new("cf")); cena.collection.objects.link(cam); cena.camera = cam
    cam.data.type = "ORTHO"; cam.data.ortho_scale = ORTO; cam.data.clip_end = DIST * 4
    cena.render.engine = "CYCLES"; cena.cycles.samples = 4; cena.cycles.use_denoising = False
    cena.render.resolution_x = cena.render.resolution_y = RES; cena.render.film_transparent = True
    cena.world = bpy.data.worlds.new("w"); cena.world.use_nodes = True; cena.world.node_tree.nodes["Background"].inputs[1].default_value = 0
    cena.view_settings.view_transform = "Standard"
    cena.render.filter_size = 0.01   # sem borrar posição entre pixels
    for ob, nome in ((cab, "neutra"), (alvo, "expr")):
        for o in cena.objects:
            if o.type == "MESH": o.hide_render = o != ob
        for tipo in ("cor", "pos"):
            if tipo == "cor":
                mats = [s.material for s in ob.material_slots]; mat_cor(ob)
                cena.render.image_settings.file_format = "PNG"; cena.render.image_settings.color_depth = "8"
            else:
                mat_pos(ob); cena.render.image_settings.file_format = "OPEN_EXR"; cena.render.image_settings.color_depth = "32"
            for ang in ANGS:
                cam.location, cam.rotation_euler = camera(ang)
                cena.render.filepath = os.path.join(PASTA, f"{nome}-{tipo}-{int(ang)}"); bpy.ops.render.render(write_still=True)
    json.dump({"angulos": ANGS, "res": RES}, open(os.path.join(PASTA, "vistas.json"), "w"))
    print("PRONTO render")

else:   # aplicar
    NOME, PASTA, SAIDA = a[1], a[2], a[3]
    SOLDA = float(os.environ.get("EXPR_SOLDA", "3e-4"))   # costuras: vértices a menos que isto viram um só
    SUAV = int(os.environ.get("EXPR_SUAVIZA", "4")); PELE = float(os.environ.get("EXPR_PELE", "0.18"))
    QUEIXO = float(os.environ.get("EXPR_QUEIXO", "0.20")); DMAX = float(os.environ.get("EXPR_MAX", "0.06"))

    def ler_exr(arq):
        im = bpy.data.images.load(arq); A = np.array(im.pixels[:], dtype=np.float32).reshape(im.size[1], im.size[0], 4)[::-1]
        bpy.data.images.remove(im); return A

    # soldar costuras: um id por posição
    chave = np.round(P / SOLDA).astype(np.int64); _, uid = np.unique(chave, axis=0, return_inverse=True); uid = uid.ravel(); nu = uid.max() + 1
    Pu = np.zeros((nu, 3)); np.add.at(Pu, uid, P); Pu /= np.bincount(uid, minlength=nu)[:, None]
    # normais por id soldado
    nrm = np.empty(len(cab.data.vertices) * 3); cab.data.vertices.foreach_get("normal", nrm); nrm = nrm.reshape(-1, 3)
    Nu = np.zeros((nu, 3)); np.add.at(Nu, uid, nrm); Nu /= np.maximum(np.linalg.norm(Nu, axis=1), 1e-9)[:, None]
    soma = np.zeros((nu, 3)); peso = np.zeros(nu)
    for ang in ANGS:
        fluxo = np.load(os.path.join(PASTA, f"fluxo-{int(ang)}.npy"))           # (H, W, 2), neutra -> expressão, em pixels
        pos_n = ler_exr(os.path.join(PASTA, f"neutra-pos-{int(ang)}.exr"))
        # FLUXO_FONTE=neutra: o fluxo veio das imagens 2D e a pele desliza sobre a própria cabeça neutra
        pos_e = pos_n if os.environ.get("FLUXO_FONTE") == "neutra" else ler_exr(os.path.join(PASTA, f"expr-pos-{int(ang)}.exr"))
        x, y = pixel(Pu, ang); xi = np.clip(np.round(x).astype(int), 0, RES - 1); yi = np.clip(np.round(y).astype(int), 0, RES - 1)
        vis = np.linalg.norm(pos_n[yi, xi, :3] - Pu, axis=1) < 0.01 * ORTO               # o vértice é o que a câmera vê ali
        _, _, frente = eixos(ang); fac = np.clip(-(Nu @ frente), 0, 1) ** 2              # de frente para a câmera pesa mais
        f = fluxo[yi, xi]; xt = np.clip(np.round(x + f[:, 0]).astype(int), 0, RES - 1); yt = np.clip(np.round(y + f[:, 1]).astype(int), 0, RES - 1)
        alvo = pos_e[yt, xt]; tem = alvo[:, 3] > 0.5                                       # pixel coberto pela expressão
        if os.environ.get("FLUXO_FONTE") == "neutra":
            # fluxo 2D: o movimento no plano da imagem vem direto do fluxo; a profundidade só acompanha a superfície
            # quando muda pouco (se o pixel de destino cai numa mecha de cabelo na frente, a profundidade fica)
            direita, cima, _ = eixos(ang); px_m = ORTO / RES
            plano = direita[None] * (f[:, 0:1] * px_m) - cima[None] * (f[:, 1:2] * px_m)
            dz = (alvo[:, :3] - Pu) @ frente; dz = np.where(np.abs(dz) < 0.01 * ORTO, dz, 0)
            mov = plano + frente[None] * dz[:, None]
        else:
            mov = alvo[:, :3] - Pu
        w = fac * vis * tem
        soma += mov * w[:, None]; peso += w
        print(f"VISTA {int(ang)}: {int((w > 0.1).sum())} vértices")
    D = np.where(peso[:, None] > 1e-3, soma / np.maximum(peso, 1e-3)[:, None], 0)
    n = np.linalg.norm(D, axis=1); D[n > DMAX] *= (DMAX / n[n > DMAX])[:, None]
    # máscara: pele do rosto (cor clara) acima do queixo, e só onde alguma vista viu
    img = cab.active_material.node_tree.nodes.get("Image Texture").image
    peq = img.copy(); peq.scale(1024, 1024); px = np.array(peq.pixels[:]).reshape(1024, 1024, 4)
    uv = np.zeros((len(P), 2)); cont = np.zeros(len(P)); uvl = cab.data.uv_layers.active.data
    for poly in cab.data.polygons:
        for li in poly.loop_indices:
            v = cab.data.loops[li].vertex_index; uv[v] += uvl[li].uv; cont[v] += 1
    uv /= np.maximum(cont, 1)[:, None]
    cor = px[np.clip((uv[:, 1] * 1023).astype(int), 0, 1023), np.clip((uv[:, 0] * 1023).astype(int), 0, 1023), :3]
    pele_v = np.clip((cor @ np.array([0.2126, 0.7152, 0.0722]) - PELE) / 0.06, 0, 1)
    pele = np.zeros(nu); np.maximum.at(pele, uid, pele_v)
    zmin, zmax = Pu[:, 2].min(), Pu[:, 2].max()
    masc = pele * np.clip((Pu[:, 2] - (zmin + QUEIXO * (zmax - zmin))) / (0.06 * (zmax - zmin)), 0, 1) * np.clip(peso / 0.3, 0, 1)
    # vizinhança soldada e suavização
    e = np.empty(len(cab.data.edges) * 2, dtype=np.int64); cab.data.edges.foreach_get("vertices", e); e = uid[e.reshape(-1, 2)]; e = e[e[:, 0] != e[:, 1]]
    grau = np.bincount(e.ravel(), minlength=nu).astype(float)
    def suav(X, k):
        for _ in range(k):
            s = np.zeros_like(X); np.add.at(s, e[:, 0], X[e[:, 1]]); np.add.at(s, e[:, 1], X[e[:, 0]])
            X = 0.5 * X + 0.5 * np.where(grau[:, None] > 0, s / np.maximum(grau, 1)[:, None], X)
        return X
    for _ in range(int(os.environ.get("EXPR_DILATA", "3"))):   # vinco escuro (canto da boca, narina) conta como pele
        viz = np.zeros(nu); np.maximum.at(viz, e[:, 0], masc[e[:, 1]]); np.maximum.at(viz, e[:, 1], masc[e[:, 0]]); masc = np.maximum(masc, viz)
    masc = suav(masc[:, None], 2)[:, 0]
    for vd in [int(x) for x in os.environ.get("EXPR_DEPURA", "").split(",") if x]:
        u = uid[vd]; print(f"DEPURA v{vd}: pele {pele[u]:.2f} peso {peso[u]:.2f} masc {masc[u]:.2f} D {np.round(D[u] * 1000, 1)}")
    D = suav(D * masc[:, None], SUAV)
    print(f"FORMA {NOME}: médio {np.linalg.norm(D, axis=1)[masc > 0.5].mean():.4f}, máximo {np.linalg.norm(D, axis=1).max():.4f}")
    if not cab.data.shape_keys: cab.shape_key_add(name="Basis")
    if NOME in cab.data.shape_keys.key_blocks: cab.shape_key_remove(cab.data.shape_keys.key_blocks[NOME])
    Mi = np.array(cab.matrix_world.inverted())
    novo = (Mi @ np.c_[P + D[uid], np.ones(len(P))].T).T[:, :3]
    sk = cab.shape_key_add(name=NOME); sk.data.foreach_set("co", novo.ravel())
    bpy.ops.wm.save_as_mainfile(filepath=f"{SAIDA}.blend")
    for o in cena.objects: o.select_set(o == cab)
    bpy.ops.export_scene.gltf(filepath=f"{SAIDA}.glb", export_format="GLB", use_selection=True, export_image_format="JPEG", export_morph=True)
    print("PRONTO aplicar")
