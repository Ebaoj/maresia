# Confere no GLB exportado o perfil do meio do rosto (x=0) entre a ponta do nariz e o queixo:
# deve ser uma curva só, sem degrau nem reentrância maior que 2 mm.
# Uso: Blender -b --python ajuste/conferir_boca.py -- arquivo.glb
import bpy, sys
import numpy as np
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=sys.argv[sys.argv.index("--") + 1])
ob = next(o for o in bpy.data.objects if o.type == "MESH" and o.name == "Human")
dep = bpy.context.evaluated_depsgraph_get(); oe = ob.evaluated_get(dep); me = oe.to_mesh()
P = np.array([tuple(oe.matrix_world @ v.co) for v in me.vertices]); oe.to_mesh_clear()
G = np.c_[P[:, 0], P[:, 2], -P[:, 1]]          # glTF: x, y para cima, z para a frente
meio = G[(np.abs(G[:, 0]) < 0.003) & (G[:, 1] > 1.40) & (G[:, 1] < 1.60) & (G[:, 2] > 0.08)]  # só a frente do rosto
ys = np.arange(1.42, 1.56, 0.001)
fr = []
for y in ys:
    s = meio[np.abs(meio[:, 1] - y) < 0.0012]
    fr.append(s[:, 2].max() if len(s) else np.nan)
fr = np.array(fr)
ok = ~np.isnan(fr); ys, fr = ys[ok], fr[ok]
i_nariz = np.argmax(np.where(ys > 1.50, fr, -9))                 # ponta do nariz
abaixo = (ys < 1.47)                                            # abaixo da boca (y da boca ~1,48)
i_queixo = np.argmax(np.where(abaixo & (ys > 1.425), fr, -9))    # queixo (mais à frente)
a, b = sorted((i_queixo, i_nariz))
seg_y, seg_z = ys[a:b + 1], fr[a:b + 1]
degrau = np.abs(np.diff(seg_z)).max()
# reentrância: quanto um ponto fica atrás do "casco" (a curva que liga os pontos mais à frente)
casco = np.maximum.accumulate(seg_z)                                  # de baixo para cima
casco2 = np.maximum.accumulate(seg_z[::-1])[::-1]
envelope = np.minimum(casco, casco2)
reent = (envelope - seg_z).max()
print(f"PERFIL nariz y={ys[i_nariz]:.3f} queixo y={ys[i_queixo]:.3f} pontos={len(seg_z)}")
print(f"PERFIL maior degrau entre fatias de 1 mm = {degrau*1000:.2f} mm; maior reentrância = {reent*1000:.2f} mm")
print("PERFIL", " ".join(f"{y:.3f}:{z*1000:.1f}" for y, z in zip(seg_y[::4], seg_z[::4])))
k = np.argmax(np.abs(np.diff(seg_z)))
print(f"PERFIL degrau maior entre y={seg_y[k]:.3f} e {seg_y[k+1]:.3f}")
cheio = [(y, z) for y, z in zip(ys, fr) if 1.44 <= y <= 1.52]
print("COMPLETO", " ".join(f"{y:.3f}:{z*1000:.1f}" for y, z in cheio[::2]))
