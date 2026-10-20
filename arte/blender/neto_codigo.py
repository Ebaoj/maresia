# Neto modelado por código (técnica B): volumes simples e malha limpa, medidas tiradas da folha em pose T.
# Corpo pelo modificador Skin (pontos + raios), cabeça própria com o rosto da folha projetado,
# cabelo em mechas, camisa e calça como cascas separadas. Cor chapada (listras na cor dos vértices).
# Uso: Blender -b --python neto_codigo.py -- pasta_saida [rosto.png]
# Coordenadas: metros, Z para cima, frente do personagem em -Y, esquerda dele em +X.
import bpy, bmesh, sys, math
from mathutils import Vector, noise

a = sys.argv[sys.argv.index("--") + 1:]
SAIDA = a[0]
ROSTO = a[1] if len(a) > 1 else None

COR = {  # tabela tirada da folha final (aproximada)
    "pele": "#9A5A35", "cabelo": "#16110F", "listra": "#A9473A", "creme": "#E9DFC8",
    "calca": "#E2D8C2", "boca": "#6E3426",
}
def lin(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return [((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c]

bpy.ops.wm.read_factory_settings(use_empty=True)
cena = bpy.context.scene

def ativo(ob):
    bpy.ops.object.select_all(action="DESELECT"); ob.select_set(True); bpy.context.view_layer.objects.active = ob

def aplicar(ob):
    ativo(ob)
    for m in list(ob.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)

def material(nome, hexcor=None, vertice=False, imagem=None):
    m = bpy.data.materials.new(nome); m.use_nodes = True
    nt = m.node_tree; bsdf = nt.nodes["Principled BSDF"]; bsdf.inputs["Roughness"].default_value = 1.0
    if vertice:
        cor = nt.nodes.new("ShaderNodeVertexColor"); cor.layer_name = "Cor"
        nt.links.new(cor.outputs["Color"], bsdf.inputs["Base Color"])
    elif imagem:
        tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = bpy.data.images.load(imagem)
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    else:
        bsdf.inputs["Base Color"].default_value = (*lin(hexcor), 1)
    return m

def esqueleto_skin(nome, pontos, arestas, raios):
    """Malha de arestas + modificador Skin (raio por ponto) + subdivisão = volume liso e limpo."""
    me = bpy.data.meshes.new(nome); me.from_pydata(pontos, arestas, []); ob = bpy.data.objects.new(nome, me)
    cena.collection.objects.link(ob); ativo(ob)
    sk = ob.modifiers.new("skin", "SKIN"); sk.use_smooth_shade = True
    for i, r in enumerate(raios): ob.data.skin_vertices[0].data[i].radius = r
    ob.data.skin_vertices[0].data[0].use_root = True
    sub = ob.modifiers.new("sub", "SUBSURF"); sub.levels = 2; sub.render_levels = 2
    aplicar(ob); bpy.ops.object.shade_smooth()
    return ob

# ---------------- corpo (base, sem roupa) ----------------
P, E, R = [], [], []
def ponto(co, raio, ligar=None):
    P.append(co); R.append(raio)
    if ligar is not None: E.append((ligar, len(P) - 1))
    return len(P) - 1
quadril = ponto((0, 0.0, 0.92), (0.13, 0.085))
cintura = ponto((0, 0.0, 1.03), (0.125, 0.078), quadril)
peito = ponto((0, -0.005, 1.17), (0.165, 0.095), cintura)
ombros = ponto((0, 0.0, 1.30), (0.16, 0.09), peito)
pesc = ponto((0, 0.01, 1.40), (0.055, 0.055), ombros)
nuca = ponto((0, 0.012, 1.47), (0.05, 0.05), pesc)
for s in (1, -1):  # braços em T
    o = ponto((s * 0.19, 0.0, 1.335), (0.055, 0.05), ombros)
    co = ponto((s * 0.47, 0.0, 1.345), (0.038, 0.036), o)
    pu = ponto((s * 0.69, 0.0, 1.345), (0.03, 0.026), co)
    mao = ponto((s * 0.80, 0.0, 1.343), (0.045, 0.018), pu)
    # pernas
    q = ponto((s * 0.085, 0.0, 0.88), (0.08, 0.08), quadril)
    jo = ponto((s * 0.09, -0.005, 0.50), (0.052, 0.055), q)
    tor = ponto((s * 0.09, 0.005, 0.085), (0.034, 0.036), jo)
    calc = ponto((s * 0.09, 0.03, 0.035), (0.038, 0.035), tor)
    dedo = ponto((s * 0.105, -0.15, 0.025), (0.045, 0.022), calc)
corpo = esqueleto_skin("corpo", P, E, R)
corpo.data.materials.append(material("pele", COR["pele"]))

# ---------------- cabeça ----------------
bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=32, radius=1, location=(0, 0, 0))
cab = bpy.context.active_object; cab.name = "cabeca"
bm = bmesh.new(); bm.from_mesh(cab.data)
for v in bm.verts:
    x, y, z = v.co
    # oval de cabeça: largura 0,15, profundidade 0,19, altura 0,23 (do queixo ao topo do crânio)
    lx, ly, lz = 0.074, 0.093, 0.112
    if z < 0:  # metade de baixo afina para o queixo e a mandíbula
        f = 1 - 0.32 * (-z) ** 1.6
        lx *= f; ly *= (1 - 0.18 * (-z))
    nx, ny, nz = x * lx, y * ly, z * lz
    if y < 0 and z < 0.3:  # rosto um pouco achatado na frente e maçãs altas
        ny *= 0.92
        if -0.1 < z < 0.25: nx *= 1.04
    v.co = Vector((nx, ny, nz))
bm.to_mesh(cab.data); bm.free()
cab.location = (0, -0.005, 1.548)
ativo(cab); bpy.ops.object.transform_apply(location=True); bpy.ops.object.shade_smooth()
# nariz: cunha larga
bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=0.02, location=(0, -0.082, 1.522))
nariz = bpy.context.active_object; nariz.scale = (1.15, 0.75, 1.1); bpy.ops.object.transform_apply(scale=True)
# orelhas
orelhas = []
for s in (1, -1):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=0.028, location=(s * 0.074, 0.0, 1.543))
    o = bpy.context.active_object; o.scale = (0.35, 0.7, 1.0); orelhas.append(o)
for o in [nariz] + orelhas: ativo(o); bpy.ops.object.transform_apply(scale=True); bpy.ops.object.shade_smooth()
ativo(cab)
for o in [nariz] + orelhas: o.select_set(True)
bpy.ops.object.join()
mat_pele_cab = material("pele_cabeca", COR["pele"])
cab.data.materials.append(mat_pele_cab)

# rosto desenhado: projeção frontal da folha da cabeça só nas faces viradas para a frente
if ROSTO:
    mat_rosto = material("rosto", imagem=ROSTO); cab.data.materials.append(mat_rosto)
    bm = bmesh.new(); bm.from_mesh(cab.data); uv = bm.loops.layers.uv.verify()
    # área do rosto na imagem (fração): x de 0,22 a 0,78 e z do queixo (0,68) ao alto da testa (0,30)
    X0, X1, ZQ, ZT = 0.235, 0.765, 0.705, 0.30
    zq, zt = 1.448, 1.613  # queixo e alto da testa no modelo
    for f in bm.faces:
        if f.normal.y < -0.25 and f.calc_center_median().z < zt:
            f.material_index = 1
        for l in f.loops:
            x, z = l.vert.co.x, l.vert.co.z
            u = X0 + (x + 0.075) / 0.15 * (X1 - X0)
            vv = 1 - (ZQ + (z - zq) / (zt - zq) * (ZT - ZQ))
            l[uv].uv = (u, vv)
    bm.to_mesh(cab.data); bm.free()

# ---------------- cabelo: casca por cima do crânio com mechas ----------------
bpy.ops.mesh.primitive_uv_sphere_add(segments=40, ring_count=24, radius=1, location=(0, 0, 0))
cab_cabelo = bpy.context.active_object; cab_cabelo.name = "cabelo"
bm = bmesh.new(); bm.from_mesh(cab_cabelo.data)
apagar = []
for v in bm.verts:
    x, y, z = v.co
    # só a calota: na frente para na testa, dos lados acima da orelha, atrás desce até a nuca
    limite = 0.25 if y < -0.2 else (0.05 if y < 0.3 else -0.45)
    if z < limite: apagar.append(v); continue
    ruido = noise.noise(Vector((x * 4, y * 4, z * 4))) * 0.12 + 0.08
    v.co = Vector((x * 0.083 * (1 + ruido), y * 0.104 * (1 + ruido), z * 0.123 * (1 + ruido * 0.6)))
bmesh.ops.delete(bm, geom=apagar, context="VERTS")
bm.to_mesh(cab_cabelo.data); bm.free()
cab_cabelo.location = (0, 0.0, 1.558)
ativo(cab_cabelo); bpy.ops.object.transform_apply(location=True)
sol = cab_cabelo.modifiers.new("esp", "SOLIDIFY"); sol.thickness = 0.012; sol.offset = 1
aplicar(cab_cabelo); bpy.ops.object.shade_flat()
cab_cabelo.data.materials.append(material("cabelo", COR["cabelo"]))

# ---------------- roupa: cascas a partir do corpo ----------------
def casca(nome, filtro, espessura, folga, mat):
    ativo(corpo); bpy.ops.object.duplicate(); ob = bpy.context.active_object; ob.name = nome
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not filtro(f.calc_center_median())], context="FACES")
    for v in bm.verts: v.co += v.normal * folga
    bm.to_mesh(ob.data); bm.free()
    s = ob.modifiers.new("esp", "SOLIDIFY"); s.thickness = espessura; s.offset = 1
    aplicar(ob); ob.data.materials.clear(); ob.data.materials.append(mat)
    return ob

# camisa: tronco e braço até o cotovelo (|x| < 0.40), do quadril (0.86) ao pescoço (1.40)
mat_camisa = material("camisa", vertice=True)
camisa = casca("camisa", lambda c: 0.86 < c.z < 1.395 and abs(c.x) < 0.40, 0.006, 0.012, mat_camisa)
# listras horizontais: faixas de 4,5 cm alternando tijolo e creme
cor_attr = camisa.data.color_attributes.new("Cor", "BYTE_COLOR", "CORNER")
for poly in camisa.data.polygons:
    z = sum(camisa.data.vertices[i].co.z for i in poly.vertices) / len(poly.vertices)
    c = COR["listra"] if int((1.40 - z) / 0.045) % 2 == 0 else COR["creme"]
    for li in poly.loop_indices: cor_attr.data[li].color = (*lin(c), 1)

# calça: do quadril até o meio da canela, larga (folga de 3 cm)
calca = casca("calca", lambda c: 0.27 < c.z < 0.97 and abs(c.x) < 0.2, 0.006, 0.03, material("calca", COR["calca"]))
# barra arregaçada: um anel grosso em cada perna
for s in (1, -1):
    bpy.ops.mesh.primitive_torus_add(major_radius=0.07, minor_radius=0.022, location=(s * 0.09, 0.0, 0.29))
    an = bpy.context.active_object; an.scale = (1, 1.1, 1); an.data.materials.append(calca.data.materials[0])
    ativo(an); bpy.ops.object.transform_apply(scale=True); bpy.ops.object.shade_smooth()

# ---------------- render de conferência ----------------
cena.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items] else "BLENDER_EEVEE"
cena.view_settings.view_transform = "Standard"
cena.render.use_freestyle = True; cena.render.line_thickness_mode = "ABSOLUTE"; cena.render.line_thickness = 1.6
cena.render.resolution_x, cena.render.resolution_y = 900, 1000
cena.world = bpy.data.worlds.new("w"); cena.world.use_nodes = True
cena.world.node_tree.nodes["Background"].inputs[0].default_value = (0.9, 0.87, 0.8, 1); cena.world.node_tree.nodes["Background"].inputs[1].default_value = 0.9
sol = bpy.data.objects.new("sol", bpy.data.lights.new("sol", "SUN")); sol.data.energy = 2.2; sol.rotation_euler = (math.radians(50), 0, math.radians(30)); cena.collection.objects.link(sol)
cd = bpy.data.cameras.new("c"); cd.type = "ORTHO"; cd.ortho_scale = 1.95
cam = bpy.data.objects.new("c", cd); cena.collection.objects.link(cam); cena.camera = cam
for nome, ang in (("frente", 0), ("tres-quartos", 35), ("perfil", 90), ("costas", 180)):
    r = math.radians(ang)
    cam.location = (3 * math.sin(r), -3 * math.cos(r), 0.86); cam.rotation_euler = (math.pi / 2, 0, r)
    cena.render.filepath = f"{SAIDA}/{nome}.png"; bpy.ops.render.render(write_still=True)
# close do rosto
cd.ortho_scale = 0.4
for nome, ang in (("rosto-frente", 0), ("rosto-34", 35), ("rosto-perfil", 90)):
    r = math.radians(ang)
    cam.location = (3 * math.sin(r), -3 * math.cos(r), 1.56); cam.rotation_euler = (math.pi / 2, 0, r)
    cena.render.filepath = f"{SAIDA}/{nome}.png"; bpy.ops.render.render(write_still=True)

bpy.ops.wm.save_as_mainfile(filepath=f"{SAIDA}/neto-codigo.blend")
bpy.ops.export_scene.gltf(filepath=f"{SAIDA}/neto-codigo.glb", export_format="GLB")
tri = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in cena.objects if o.type == "MESH")
print("PRONTO triângulos:", tri)
