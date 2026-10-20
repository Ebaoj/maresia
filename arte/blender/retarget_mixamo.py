# Retarget de animação Mixamo (FBX, esqueleto mixamorig) para o personagem, por rotação de mundo, como no jogo.
# Uso dentro de outro script do Blender:
#   sys.path.insert(0, os.path.dirname(__file__)); from retarget_mixamo import preparar
#   aplicar, f0, f1 = preparar(cena, esqueleto_destino, "animacao.fbx");  aplicar(quadro, deslocamento=Vector())
import bpy
from mathutils import Matrix, Vector


def rot(m): return m.to_3x3().normalized()


def preparar(cena, dst, FBX):
    antes = set(cena.objects)
    bpy.ops.import_scene.fbx(filepath=FBX)
    src = next(o for o in cena.objects if o.type == "ARMATURE" and o not in antes)
    for o in cena.objects:   # esconde qualquer malha que veio com a animação
        if o not in antes and o.type == "MESH": o.hide_render = True
    acao = src.animation_data.action; f0, f1 = map(int, acao.frame_range)
    src_rest = {b.name: rot(src.matrix_world @ b.matrix_local) for b in src.data.bones}
    dst_rest = {b.name: b.matrix_local.copy() for b in dst.data.bones}            # espaço do esqueleto
    dst_rest_w = {b.name: rot(dst.matrix_world @ b.matrix_local) for b in dst.data.bones}
    ordem = []
    def visita(b):
        ordem.append(b.name)
        for c in b.children: visita(c)
    for b in dst.data.bones:
        if b.parent is None: visita(b)
    hips_src0 = (src.matrix_world @ src.data.bones["mixamorig:Hips"].head_local)
    alt_src = max((src.matrix_world @ b.head_local).z for b in src.data.bones) - min((src.matrix_world @ b.head_local).z for b in src.data.bones)
    alt_dst = max(b.head_local.z for b in dst.data.bones) - min(b.head_local.z for b in dst.data.bones)
    esc_mov = alt_dst / max(alt_src, 1e-6)
    Mi = dst.matrix_world.inverted().to_3x3()

    def aplicar(f, deslocamento=Vector()):
        """deslocamento: soma à raiz (em mundo), para emendar voltas de uma animação que anda"""
        cena.frame_set(f)
        cheio = {}
        for n in ordem:
            b = dst.data.bones[n]; pb = dst.pose.bones[n]
            spb = src.pose.bones.get(n)
            if spb is not None:
                D = rot(src.matrix_world @ spb.matrix) @ src_rest[n].inverted()
                R = Mi @ (D @ dst_rest_w[n])   # rotação de mundo do osso de destino, em espaço do esqueleto
            else:
                R = None
            if b.parent is None:
                pos = dst_rest[n].translation.copy()
                if spb is not None:
                    d = (src.matrix_world @ spb.matrix).translation - hips_src0
                    pos += Mi @ (d * esc_mov + deslocamento)
            else:
                local_rest = dst_rest[b.parent.name].inverted() @ dst_rest[n]
                pos = (cheio[b.parent.name] @ local_rest).translation
            if R is None:
                R = (cheio[b.parent.name] @ (dst_rest[b.parent.name].inverted() @ dst_rest[n])).to_3x3() if b.parent else dst_rest[n].to_3x3()
            cheio[n] = Matrix.Translation(pos) @ R.to_4x4()
            if b.parent is None:
                pb.matrix_basis = dst_rest[n].inverted() @ cheio[n]
            else:
                local_rest = dst_rest[b.parent.name].inverted() @ dst_rest[n]
                pb.matrix_basis = local_rest.inverted() @ (cheio[b.parent.name].inverted() @ cheio[n])
        bpy.context.view_layer.update()

    return aplicar, f0, f1
