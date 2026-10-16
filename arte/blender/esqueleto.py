# Limpa a malha do TRELLIS, cria o esqueleto com os nomes do aplicarPose() e testa poses.
# Uso: Blender -b --python esqueleto.py -- entrada.glb pasta_saida
# Coordenadas do Blender (Z para cima, frente do boneco em -Y, esquerda dele em +X), modelo com 1,0 de altura.
import bpy, bmesh, sys, math
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:]
entrada, saida = args[0], args[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=entrada)
malha = next(o for o in bpy.context.scene.objects if o.type == "MESH")
bpy.context.view_layer.objects.active = malha
malha.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# 1. limpeza: solda vértices duplicados, tira a placa de chão e os pedaços pequenos
bm = bmesh.new(); bm.from_mesh(malha.data)
antes = len(bm.faces)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
pes = [((-0.14, -0.02), (-0.14, 0.08)), ((0.02, 0.14), (-0.14, 0.08))]  # (x, y) de cada pé
def no_pe(v):
    return any(x0 <= v.co.x <= x1 and y0 <= v.co.y <= y1 for (x0, x1), (y0, y1) in pes)
placa = [v for v in bm.verts if v.co.z < -0.488 and not no_pe(v)]
bmesh.ops.delete(bm, geom=placa, context="VERTS")
# pedaços soltos
bm.faces.ensure_lookup_table()
visitado, pecas = set(), []
for f in bm.faces:
    if f.index in visitado: continue
    pilha, peca = [f], []
    visitado.add(f.index)
    while pilha:
        g = pilha.pop(); peca.append(g)
        for e in g.edges:
            for h in e.link_faces:
                if h.index not in visitado:
                    visitado.add(h.index); pilha.append(h)
    pecas.append(peca)
pequenas = [f for p in pecas if len(p) < 50 for f in p]
bmesh.ops.delete(bm, geom=pequenas, context="FACES")
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
depois = len(bm.faces)
bm.to_mesh(malha.data); bm.free()
print(f"LIMPEZA: {antes} -> {depois} faces; peças {len(pecas)} -> {len([p for p in pecas if len(p) >= 50])}; placa {len(placa)} vértices")

# 2. esqueleto (cabeça e cauda de cada osso; E = esquerda do personagem = +X)
J = {
    "quadril":    ((0, 0.00, -0.02), (0, 0.00, 0.03), None),
    "tronco":     ((0, 0.00, 0.03), (0, 0.00, 0.27), "quadril"),
    "cabeca":     ((0, -0.01, 0.27), (0, -0.01, 0.42), "tronco"),
}
for lado, s in (("E", 1), ("D", -1)):
    J[f"ombro_{lado}"] = ((s * 0.095, 0.01, 0.21), (s * 0.13, 0.01, 0.04), "tronco")
    J[f"cotovelo_{lado}"] = ((s * 0.13, 0.01, 0.04), (s * 0.14, 0.00, -0.10), f"ombro_{lado}")
    J[f"mao_{lado}"] = ((s * 0.14, 0.00, -0.10), (s * 0.14, 0.00, -0.17), f"cotovelo_{lado}")
    J[f"coxa_{lado}"] = ((s * 0.055, 0.00, -0.03), (s * 0.06, 0.00, -0.24), "quadril")
    J[f"joelho_{lado}"] = ((s * 0.06, 0.00, -0.24), (s * 0.065, 0.01, -0.455), f"coxa_{lado}")
    J[f"pe_{lado}"] = ((s * 0.065, 0.01, -0.455), (s * 0.075, -0.09, -0.49), f"joelho_{lado}")

arm_dados = bpy.data.armatures.new("esqueleto")
arm = bpy.data.objects.new("esqueleto", arm_dados)
bpy.context.scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="EDIT")
for nome, (cab, cau, pai) in J.items():
    b = arm_dados.edit_bones.new(nome)
    b.head, b.tail = Vector(cab), Vector(cau)
    if pai:
        b.parent = arm_dados.edit_bones[pai]
        b.use_connect = False
bpy.ops.object.mode_set(mode="OBJECT")

# 3. pesos automáticos
bpy.ops.object.select_all(action="DESELECT")
malha.select_set(True); arm.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.parent_set(type="ARMATURE_AUTO")
# vértices sem peso (o caderno solto à frente da mão): vão inteiros para o antebraço direito
soltos = [v.index for v in malha.data.vertices if not v.groups]
if soltos:
    malha.vertex_groups["cotovelo_D"].add(soltos, 1.0, "REPLACE")
print(f"PESOS: {len(soltos)} vértices sem peso foram para cotovelo_D")
sem_peso = sum(1 for v in malha.data.vertices if not v.groups)
print(f"PESOS: grupos={len(malha.vertex_groups)}, vértices sem peso={sem_peso} de {len(malha.data.vertices)}")

# 4. render de poses
cena = bpy.context.scene
cena.render.engine = "BLENDER_WORKBENCH"
cena.display.shading.light = "STUDIO"
cena.display.shading.color_type = "TEXTURE"
cena.render.resolution_x = cena.render.resolution_y = 700
cena.world = bpy.data.worlds.new("w"); cena.world.color = (1, 1, 1)
cam_d = bpy.data.cameras.new("cam"); cam_d.type = "ORTHO"; cam_d.ortho_scale = 1.15
cam = bpy.data.objects.new("cam", cam_d); cena.collection.objects.link(cam); cena.camera = cam

def pose(rot):
    for pb in arm.pose.bones:
        pb.rotation_mode = "XYZ"
        pb.rotation_euler = rot.get(pb.name, (0, 0, 0))

poses = {
    "repouso": {},
    "andar": {"coxa_E": (-0.5, 0, 0), "joelho_E": (0.6, 0, 0), "coxa_D": (0.4, 0, 0),
              "ombro_E": (0.4, 0, 0), "ombro_D": (-0.5, 0, 0), "cotovelo_D": (-0.5, 0, 0)},
    "corcunda": {"tronco": (0.45, 0, 0), "cabeca": (-0.35, 0, 0), "coxa_E": (-0.15, 0, 0), "coxa_D": (-0.15, 0, 0),
                 "joelho_E": (0.25, 0, 0), "joelho_D": (0.25, 0, 0), "ombro_E": (-0.2, 0, 0), "ombro_D": (-0.2, 0, 0)},
    "bracos": {"ombro_E": (0, 0, 1.2), "ombro_D": (0, 0, -1.2)},
}
for nome, rot in poses.items():
    pose(rot)
    for vista, loc, ang in (("frente", (0, -3, 0), (math.pi / 2, 0, 0)), ("perfil", (3, 0, 0), (math.pi / 2, 0, math.pi / 2))):
        cam.location, cam.rotation_euler = loc, ang
        cena.render.filepath = f"{saida}/pose-{nome}-{vista}.png"
        bpy.ops.render.render(write_still=True)
pose({})

# 5. exporta glTF com esqueleto e pesos (sem animação)
bpy.ops.export_scene.gltf(filepath=f"{saida}/neto-esqueleto.glb", export_format="GLB", export_animations=False, export_skins=True)
bpy.ops.wm.save_as_mainfile(filepath=f"{saida}/neto-esqueleto.blend")
print("EXPORTADO")
