# Confere o personagem EM MOVIMENTO: aplica uma animação do Mixamo do jogo (mesmo esqueleto mixamorig)
# por rotação de mundo, como o retarget do jogo, e renderiza vários quadros de vários ângulos.
# Emenda entre peças, ombro, axila e barra só aparecem assim; parado e de frente escondem tudo.
# Uso: Blender -b PERSONAGEM.blend --python blender/conferir_mov.py -- ANIMACAO.fbx SAIDA_PREFIXO
#   CONF_QUADROS (8)  CONF_ANGULOS ("0,45,90,180")  CONF_ESCALA (1.9)  CONF_ALTURA_CAM (0.86)
import bpy, sys, os, math
from mathutils import Matrix, Vector

a = sys.argv[sys.argv.index("--") + 1:]
FBX, SAIDA = a[0], a[1]
NQ = int(os.environ.get("CONF_QUADROS", "8"))
ANGULOS = [float(x) for x in os.environ.get("CONF_ANGULOS", "0,45,90,180").split(",")]
ESC = float(os.environ.get("CONF_ESCALA", "1.9")); ZC = float(os.environ.get("CONF_ALTURA_CAM", "0.86"))
cena = bpy.context.scene
dst = next(o for o in cena.objects if o.type == "ARMATURE")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from retarget_mixamo import preparar
aplicar, f0, f1 = preparar(cena, dst, FBX)
if not any(o.type == "LIGHT" for o in cena.objects):
    sol = bpy.data.objects.new("sol", bpy.data.lights.new("sol", "SUN")); cena.collection.objects.link(sol)
    sol.rotation_euler = (math.radians(50), 0, math.radians(30)); sol.data.energy = 3
cena.world = cena.world or bpy.data.worlds.new("w"); cena.world.use_nodes = True
# fundo (só para a câmera) separado da luz do ambiente: magenta no fundo denuncia fresta sem tingir o boneco
nt = cena.world.node_tree; nt.nodes.clear()
luz = nt.nodes.new("ShaderNodeBackground"); luz.inputs[0].default_value = (0.75, 0.74, 0.71, 1)
fundo = nt.nodes.new("ShaderNodeBackground"); fundo.inputs[0].default_value = tuple(float(x) for x in os.environ.get("CONF_FUNDO", "0.75,0.74,0.71").split(",")) + (1,)
lp = nt.nodes.new("ShaderNodeLightPath"); mix = nt.nodes.new("ShaderNodeMixShader"); saida_w = nt.nodes.new("ShaderNodeOutputWorld")
nt.links.new(lp.outputs["Is Camera Ray"], mix.inputs[0]); nt.links.new(luz.outputs[0], mix.inputs[1]); nt.links.new(fundo.outputs[0], mix.inputs[2])
nt.links.new(mix.outputs[0], saida_w.inputs["Surface"])
cam = cena.camera or bpy.data.objects.new("camconf", bpy.data.cameras.new("camconf"))
if cam.name not in cena.objects: cena.collection.objects.link(cam)
cena.camera = cam; cam.data.type = "ORTHO"; cam.data.ortho_scale = ESC
for c in list(cam.constraints): cam.constraints.remove(c)
cena.render.resolution_x, cena.render.resolution_y = int(os.environ.get("CONF_RES", "420")), int(int(os.environ.get("CONF_RES", "420")) * 1.24)
quadros = [f0 + round(i * (f1 - f0) / max(NQ, 1)) for i in range(NQ)]
for f in quadros:
    aplicar(f)
    hips = dst.matrix_world @ dst.pose.bones["mixamorig:Hips"].head
    for ang in ANGULOS:
        r = math.radians(ang)
        cam.location = (hips.x + 5 * math.sin(r), hips.y - 5 * math.cos(r), ZC); cam.rotation_euler = (math.pi / 2, 0, r)
        cena.render.filepath = f"{SAIDA}-a{int(ang):03d}-f{f:03d}.png"; bpy.ops.render.render(write_still=True)
print("PRONTO conferencia", len(quadros), "quadros x", len(ANGULOS), "angulos")
