# Segunda etapa da roupa: pega o .blend gerado por neto_mpfb.py (já na pose de repouso e na escala final) e
#  1) simula o pano (Blender cloth) caindo no corpo, com o tecido um pouco "maior" que a casca para enrugar;
#  2) acrescenta gola em pé, botões na frente e barra dobrada da calça;
#  3) pinta a roupa na cor dos vértices: desbotado de sol, manchas de sal, sujeira, suor, costura e um remendo.
# Depois exporta o .glb (mesmos parâmetros do gerador) e renderiza as vistas.
# Uso: Blender -b ARQUIVO.blend --python blender/pano.py -- SAIDA_PREFIXO
import bpy, bmesh, sys, os, math
import numpy as np
from mathutils import Vector, noise
from mathutils.bvhtree import BVHTree

saida = sys.argv[sys.argv.index("--") + 1]
cena = bpy.context.scene
corpo = bpy.data.objects["Human"]
camisa, calca = bpy.data.objects.get("camisa"), bpy.data.objects.get("calca")
rig = next(o for o in cena.objects if o.type == "ARMATURE")
FRAMES = int(os.environ.get("PANO_FRAMES", "45"))
EXPANDE = float(os.environ.get("PANO_EXPANDE", "-0.06"))   # shrink negativo: o pano quer ser maior e enruga


def lin(h):
    h = h.lstrip("#"); return np.array([((int(h[i:i + 2], 16) / 255 + 0.055) / 1.055) ** 2.4 for i in (0, 2, 4)])


def mundo(ob):
    n = len(ob.data.vertices); c = np.empty(n * 3); ob.data.vertices.foreach_get("co", c)
    M = np.array(ob.matrix_world); return c.reshape(n, 3) @ M[:3, :3].T + M[:3, 3]


def ativar(ob):
    for o in cena.objects: o.select_set(False)
    ob.select_set(True); bpy.context.view_layer.objects.active = ob


def simular(ob, pin_fn, colisores):
    """Roda o pano em ob preso pelos vértices de pin_fn(posição no mundo) e aplica o resultado na malha."""
    sol = ob.modifiers.get("espessura")
    esp = sol.thickness if sol else 0.005
    if sol: ob.modifiers.remove(sol)
    P = mundo(ob)
    g = ob.vertex_groups.new(name="pano-pino")
    g.add([i for i in range(len(P)) if pin_fn(P[i])], 1.0, "REPLACE")
    for c in colisores:
        if not c.modifiers.get("Collision"):
            m = c.modifiers.new("Collision", "COLLISION")
        c.collision.thickness_outer = 0.004; c.collision.cloth_friction = 8
    pano = ob.modifiers.new("pano", "CLOTH"); s = pano.settings
    s.quality = 6; s.mass = 0.2; s.air_damping = 2
    s.tension_stiffness = s.compression_stiffness = 6; s.shear_stiffness = 4; s.bending_stiffness = 0.15
    s.shrink_min = EXPANDE; s.vertex_group_mass = "pano-pino"; s.pin_stiffness = 1
    pano.collision_settings.distance_min = 0.003; pano.collision_settings.use_self_collision = False
    pano.point_cache.frame_start, pano.point_cache.frame_end = 1, FRAMES
    for f in range(1, FRAMES + 1): cena.frame_set(f)
    ativar(ob)
    bpy.ops.object.modifier_apply(modifier="pano")
    ob.vertex_groups.remove(ob.vertex_groups["pano-pino"])
    novo = ob.modifiers.new("espessura", "SOLIDIFY"); novo.thickness = esp; novo.offset = 1
    cena.frame_set(1)
    print(f"PANO {ob.name}: {len(P)} pontos, {FRAMES} quadros")


def pesos_do_vizinho(bm, dl, origem_verts, novos):
    """Copia os pesos do vértice original mais perto (para peças novas seguirem o esqueleto)."""
    from mathutils.kdtree import KDTree
    kd = KDTree(len(origem_verts))
    for i, v in enumerate(origem_verts): kd.insert(v.co, i)
    kd.balance()
    for v in novos:
        _, i, _ = kd.find(v.co)
        v[dl].clear()
        for gi, w in origem_verts[i][dl].items(): v[dl][gi] = w


def gola_e_botoes(ob):
    """Gola em pé: a borda do pescoço sobe 1,5 cm. Botões: discos achatados na frente, da gola à barra."""
    bm = bmesh.new(); bm.from_mesh(ob.data); dl = bm.verts.layers.deform.verify()
    bm.verts.ensure_lookup_table(); bm.normal_update()
    zs = np.array([v.co.z for v in bm.verts]); z_top = zs.max()
    borda = [e for e in bm.edges if e.is_boundary and all(v.co.z > z_top - 0.04 for v in e.verts)]
    if borda:
        c = sum((v.co for e in borda for v in e.verts), Vector()) / (2 * len(borda))
        ext = bmesh.ops.extrude_edge_only(bm, edges=borda)
        nv = [g for g in ext["geom"] if isinstance(g, bmesh.types.BMVert)]
        for v in nv:
            r = Vector((v.co.x - c.x, v.co.y - c.y, 0))
            v.co += Vector((0, 0, 0.015)) + (r.normalized() * 0.002 if r.length > 1e-6 else Vector())
    # botões: linha do meio na frente (menor y), do peito à barra
    bm.verts.ensure_lookup_table()
    frente = [v for v in bm.verts if abs(v.co.x) < 0.01]
    if frente:
        zmin = min(v.co.z for v in frente); zmax = max(v.co.z for v in frente) - 0.03
        orig = list(bm.verts); novos = []
        for k in range(5):
            z = zmax - (zmax - zmin - 0.04) * k / 4
            perto = [v for v in frente if abs(v.co.z - z) < 0.012]
            if not perto: continue
            v0 = min(perto, key=lambda v: v.co.y)   # o mais à frente
            n = v0.normal.normalized() if v0.normal.length > 0 else Vector((0, -1, 0))
            if n.y > 0: n = -n
            res = bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=0.0055, radius2=0.0055, depth=0.002,
                                        matrix=__import__("mathutils").Matrix.Translation(v0.co + n * 0.004) @ n.to_track_quat("Z", "Y").to_matrix().to_4x4())
            for f in {f for v in res["verts"] for f in v.link_faces}: f.material_index = 1
            novos += res["verts"]
        pesos_do_vizinho(bm, dl, orig, novos)
    bm.to_mesh(ob.data); bm.free()
    mb = bpy.data.materials.new("botao"); mb.use_nodes = True
    mb.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*lin("#d2c4a8"), 1)
    ob.data.materials.append(mb)


def barra_dobrada(ob):
    """Calça arregaçada: a borda de baixo de cada perna vira um rolo de 3 cm por fora."""
    bm = bmesh.new(); bm.from_mesh(ob.data); dl = bm.verts.layers.deform.verify()
    zs = np.array([v.co.z for v in bm.verts]); z_bot = zs.min()
    borda = [e for e in bm.edges if e.is_boundary and all(v.co.z < z_bot + 0.03 for v in e.verts)]
    if not borda: bm.free(); return
    for lado in (1, -1):
        eb = [e for e in borda if e.verts[0].co.x * lado > 0]
        if not eb: continue
        c = sum((v.co for e in eb for v in e.verts), Vector()) / (2 * len(eb))
        sai = bmesh.ops.extrude_edge_only(bm, edges=eb)
        v1 = [g for g in sai["geom"] if isinstance(g, bmesh.types.BMVert)]
        for v in v1:
            r = Vector((v.co.x - c.x, v.co.y - c.y, 0)).normalized(); v.co += r * 0.006 - Vector((0, 0, 0.002))
        e1 = [g for g in sai["geom"] if isinstance(g, bmesh.types.BMEdge) and all(x in v1 for x in g.verts)]
        sobe = bmesh.ops.extrude_edge_only(bm, edges=e1)
        v2 = [g for g in sobe["geom"] if isinstance(g, bmesh.types.BMVert)]
        for v in v2:
            r = Vector((v.co.x - c.x, v.co.y - c.y, 0)).normalized()
            v.co += Vector((0, 0, 0.03 + noise.noise(v.co * 40) * 0.004)) + r * 0.001
    bm.to_mesh(ob.data); bm.free()


def pintar(ob, base, cfg):
    """Cor dos vértices: base + desbotado de sol por cima + manchas + sujeira embaixo + costura + remendo."""
    me = ob.data; P = mundo(ob)
    me.calc_normals_split() if hasattr(me, "calc_normals_split") else None
    N = np.array([(ob.matrix_world.to_3x3() @ v.normal).normalized() for v in me.vertices])
    z0, z1 = P[:, 2].min(), P[:, 2].max(); h = (P[:, 2] - z0) / max(z1 - z0, 1e-6)
    cor = np.tile(lin(base), (len(P), 1))
    claro, escuro = lin(cfg["claro"]), lin(cfg["escuro"])
    blot = np.array([noise.noise(Vector(p) * 9) for p in P])          # manchas grandes (tingido irregular)
    fino = np.array([noise.noise(Vector(p) * 45) for p in P])         # trama e respingos
    sal = np.array([noise.noise(Vector(p) * 22 + Vector((7, 3, 1))) for p in P])
    sol = np.clip(N[:, 2], 0, 1) * 0.35 + np.clip(-N[:, 1], 0, 1) * 0.1   # o que pega sol desbota
    t = np.clip(0.5 + 0.5 * blot, 0, 1) * 0.25 + sol + 0.06 * fino
    cor = cor * (1 - t[:, None]) + claro * t[:, None]
    marca_sal = np.clip((sal - 0.35) * 3, 0, 1) * cfg["sal"]                  # contorno claro de água do mar secando
    cor = cor * (1 - marca_sal[:, None]) + claro * marca_sal[:, None]
    sujo = np.clip((cfg["sujo_ate"] - h) / cfg["sujo_ate"], 0, 1) ** 1.5 * 0.45   # barra e joelho mais sujos
    sujo += np.clip(-N[:, 2], 0, 1) * 0.12                                   # embaixo (sombra de sujeira)
    cor = cor * (1 - sujo[:, None]) + escuro * sujo[:, None]
    if cfg.get("remendo") is not None:   # remendo retangular de pano mais claro, com borda escura de costura
        cx, cz, lx, lz = cfg["remendo"]
        dx, dz = np.abs(P[:, 0] - cx), np.abs(P[:, 2] - cz)
        dentro = (dx < lx) & (dz < lz) & (P[:, 1] > np.median(P[:, 1]))
        borda = dentro & ((dx > lx - 0.006) | (dz > lz - 0.006))
        cor[dentro] = cor[dentro] * 0.4 + lin(cfg["remendo_cor"]) * 0.6
        cor[borda] = cor[borda] * 0.55
    cor = np.clip(cor, 0, 1)
    if "Col" in me.color_attributes: me.color_attributes.remove(me.color_attributes["Col"])
    at = me.color_attributes.new("Col", "BYTE_COLOR", "CORNER")
    lv = np.empty(len(me.loops), dtype=np.int64); me.loops.foreach_get("vertex_index", lv)
    rgba = np.ones((len(me.loops), 4)); rgba[:, :3] = cor[lv]; at.data.foreach_set("color", rgba.ravel())
    mt = me.materials[0]; nt = mt.node_tree; bs = nt.nodes["Principled BSDF"]
    vc = nt.nodes.new("ShaderNodeVertexColor"); vc.layer_name = "Col"
    nt.links.new(vc.outputs["Color"], bs.inputs["Base Color"])
    print(f"PINTURA {ob.name}: {len(P)} pontos")


# ---- 1) pano: calça primeiro (colide com o corpo), depois a camisa (colide com corpo e calça)
if calca:
    zc = mundo(calca)[:, 2].max()
    simular(calca, lambda p: p[2] > zc - 0.035, [corpo])
if camisa:
    Pc = mundo(camisa); zt = Pc[:, 2].max()
    simular(camisa, lambda p: p[2] > zt - 0.05, [corpo] + ([calca] if calca else []))
for o in (corpo, calca):
    if o and o.modifiers.get("Collision"): o.modifiers.remove(o.modifiers["Collision"])

# ---- 2) peças
if camisa: gola_e_botoes(camisa)
if calca: barra_dobrada(calca)

# ---- 3) pintura
if camisa:
    Pc = mundo(camisa)
    cotovelo = Pc[np.argmax(Pc[:, 0])]   # ponta da manga esquerda: o remendo fica no antebraço/cotovelo
    pintar(camisa, os.environ.get("PANO_COR_CAMISA", "#6e4433"),
           {"claro": "#b58a6a", "escuro": "#3b2419", "sal": 0.35, "sujo_ate": 0.25,
            "remendo": (cotovelo[0] * 0.62, cotovelo[2], 0.03, 0.025), "remendo_cor": "#8a5e44"})
if calca:
    pintar(calca, "#d9ccb2", {"claro": "#efe6d2", "escuro": "#8a7a62", "sal": 0.25, "sujo_ate": 0.35, "remendo": None})

# ---- exporta e renderiza
bpy.ops.wm.save_as_mainfile(filepath=f"{saida}.blend")
bpy.ops.export_scene.gltf(filepath=f"{saida}.glb", export_format="GLB", export_apply=True)
cam = cena.camera
if cam:
    for nome, ang in (("frente", 0), ("perfil", 90)):
        r = math.radians(ang); cam.data.ortho_scale = 1.9
        cam.location = (5 * math.sin(r), -5 * math.cos(r), 0.86); cam.rotation_euler = (math.pi / 2, 0, r)
        for c in list(cam.constraints): cam.constraints.remove(c)
        cena.render.filepath = f"{saida}-corpo-{nome}.png"; bpy.ops.render.render(write_still=True)
print("PRONTO pano")
