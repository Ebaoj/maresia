# Suaviza os pesos da pele do gato (os do Anything World amassam e esticam nas poses fortes): espalha a transição
# entre um osso e outro pela malha (média com os vizinhos, LAMBDA por passada, PASSADAS vezes) e renormaliza.
# Mantém os ossos que já influenciam cada região (não cria influência nova longe do osso: só mistura com vizinhos).
# Pode ser usado sozinho (glb -> glb) ou importado (suavizar(malha, passadas, lam)).
# Uso: Blender -b --python suaviza_pesos.py -- ENTRADA.glb SAIDA.glb [PASSADAS] [LAMBDA] [FPS]
import bpy, sys

def suavizar(m, passadas=10, lam=0.5, limite=1e-3):
    me = m.data; nv = len(me.vertices)
    viz = [[] for _ in range(nv)]
    for e in me.edges:
        i, j = e.vertices; viz[i].append(j); viz[j].append(i)
    gi = {g.index: g.name for g in m.vertex_groups}
    w = [{g.group: g.weight for g in v.groups if g.weight > limite} for v in me.vertices]
    for _ in range(passadas):
        novo = []
        for i in range(nv):
            if not viz[i]: novo.append(w[i]); continue
            soma = {}
            for j in viz[i]:
                for g, x in w[j].items(): soma[g] = soma.get(g, 0.0) + x
            k = 1.0 / len(viz[i]); d = {}
            for g in set(w[i]) | set(soma):
                d[g] = (1 - lam) * w[i].get(g, 0.0) + lam * soma.get(g, 0.0) * k
            t = sum(d.values()) or 1.0
            novo.append({g: x / t for g, x in d.items() if x / t > limite})
        w = novo
    for g in m.vertex_groups: g.remove(list(range(nv)))
    for i, d in enumerate(w):
        t = sum(d.values()) or 1.0
        for g, x in d.items(): m.vertex_groups[gi[g]].add([i], x / t, "REPLACE")
    return nv

if __name__ == "__main__" and "--" in sys.argv:
    a = sys.argv[sys.argv.index("--") + 1:]
    ENT, SAI = a[0], a[1]
    PAS = int(a[2]) if len(a) > 2 else 10; LAM = float(a[3]) if len(a) > 3 else 0.5
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    cena = bpy.context.scene; cena.render.fps = int(a[4]) if len(a) > 4 else 30
    bpy.ops.import_scene.gltf(filepath=ENT)
    m = [o for o in cena.objects if o.type == "MESH"][0]
    n = suavizar(m, PAS, LAM)
    print(f"SUAVIZADO {n} vértices, {PAS} passadas, lambda {LAM}")
    bpy.ops.export_scene.gltf(filepath=SAI, export_format="GLB", export_animations=True, export_animation_mode="ACTIVE_ACTIONS")
