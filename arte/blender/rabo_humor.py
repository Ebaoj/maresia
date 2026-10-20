# Clipes de humor do gato que só mexem no rabo (tail0..tail6) ou só nas orelhas: o jogo toca um deles por cima de
# qualquer animação do corpo (andar, parado, correr), e ele manda só nesses ossos.
# Linguagem do rabo do gato real:
#   contente      em pé, ponta balançando devagar          curioso   em pé com a ponta em gancho (ponto de interrogação)
#   atento        para trás na horizontal, ponta tremendo    irritado  meia altura, ponta chicoteando
#   bravo         rabo inteiro chicoteando rápido            medo      baixo, enfiado entre as pernas, tremendo
#   relaxado      baixo para trás com a ponta subindo (J)    arrepiado arco de U invertido e grosso (escala dos ossos)
# Orelhas: atenta (para a frente), neutra (com tremidinha), de lado (irritado), achatada (medo/bravo).
# Ângulos em graus: "frente" dobra o osso para o lado da cabeça (negativo = para trás); "lado" dobra para o lado.
# Uso: Blender -b --python rabo_humor.py -- RIG.glb SAIDA.glb
import bpy, sys, math
from mathutils import Matrix, Vector

a = sys.argv[sys.argv.index("--") + 1:]
ENT, SAI = a[0], a[1]
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
cena = bpy.context.scene; cena.render.fps = 30
bpy.ops.import_scene.gltf(filepath=ENT)
arm = [o for o in cena.objects if o.type == "ARMATURE"][0]
arm.animation_data_create()
for tr in list(arm.animation_data.nla_tracks): arm.animation_data.nla_tracks.remove(tr)
arm.animation_data.action = None
for x in list(bpy.data.actions): bpy.data.actions.remove(x)
W = arm.matrix_world; Wi = W.inverted(); PB = arm.pose.bones
RABO = [f"tail{i}" for i in range(7)]
ORELHA = {"left": ["ear_left_0", "ear_left_1"], "right": ["ear_right_0", "ear_right_1"]}
frente = (W @ PB["neck1"].head - W @ PB["pelvis"].head); frente.z = 0; frente.normalize()
cima = Vector((0, 0, 1)); lateral = frente.cross(cima).normalized()   # girar +a em lateral leva "cima" para "trás"
def atualiza(): bpy.context.view_layer.update()
def girar(n, ang, eixo, piv=None):
    pb = PB[n]; p = W @ pb.head if piv is None else piv
    R = Matrix.Translation(p) @ Matrix.Rotation(ang, 4, eixo) @ Matrix.Translation(-p)
    pb.matrix = Wi @ R @ W @ pb.matrix; atualiza()
def dirr(n): return (W @ PB[n].tail - W @ PB[n].head).normalized()
def zera(nomes):
    for n in nomes:
        pb = PB[n]; pb.rotation_mode = "QUATERNION"; pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); pb.scale = (1, 1, 1)
    atualiza()
def dobra_rabo(i, frente_g, lado_g):
    n = RABO[i]
    if frente_g: girar(n, -math.radians(frente_g), lateral)
    if lado_g:
        eixo = lateral.cross(dirr(n)).normalized()   # perpendicular ao osso, no plano do corpo: dobra para o lado
        girar(n, math.radians(lado_g), eixo)
onda = lambda t, T, i, atraso=0.8: math.sin(2 * math.pi * t / T - atraso * i)
def janela(k, n): return math.sin(math.pi * k / n) ** 2 if 0 <= k < n else 0.0   # entra e sai suave

# cada humor: (quadros, função(t) -> lista de (frente, lado) por osso, escala da grossura). As dobras ficam espalhadas
# por vários ossos (curva, não quina); depois a cadeia passa pela mola em cascata (mola_em_cascata), que dá o atraso e a folga.
def contente(t):
    b = 3 * math.sin(2 * math.pi * t / 90)
    return [(0, 0), (0, 2 * onda(t, 90, 1)), (0, 3 * onda(t, 90, 2)), (0, 4 * onda(t, 90, 3)), (2, 5 * onda(t, 90, 4)), (4 + b, 6 * onda(t, 90, 5)), (8 + b, 7 * onda(t, 90, 6))]
def curioso(t):
    b = 3 * math.sin(2 * math.pi * t / 45)
    return [(0, 0), (1, 1.5 * onda(t, 90, 1)), (2, 2 * onda(t, 90, 2)), (6, 2.5 * onda(t, 90, 3)), (14 + 0.5 * b, 3 * onda(t, 90, 4)), (22 + b, 0), (28 + b, 0)]
def atento(t):
    # ponta dá duas sacudidas macias e descansa (ciclo de 60 quadros)
    tremor = 10 * math.sin(2 * math.pi * t / 10) * janela(t % 60, 20)
    return [(-30, 0), (-40, 0), (5, 0), (8, 0), (8, 0), (6, 0.4 * tremor), (4, tremor)]
def irritado(t):
    return [(-20, 0), (-25, 0), (0, 2 * onda(t, 30, 2)), (0, 5 * onda(t, 30, 3)), (0, 9 * onda(t, 30, 4)), (0, 13 * onda(t, 30, 5)), (0, 16 * onda(t, 30, 6))]
def bravo(t):   # chicote do rabo inteiro: soma das dobras ~65 graus para cada lado
    return [(-30, 6 * onda(t, 28, 0)), (-35, 10 * onda(t, 28, 1)), (0, 9 * onda(t, 28, 2)), (0, 9 * onda(t, 28, 3)),
            (0, 9 * onda(t, 28, 4)), (0, 10 * onda(t, 28, 5)), (0, 10 * onda(t, 28, 6))]
def medo(t):
    tr = 1.0 * math.sin(2 * math.pi * t / 6)
    # sai do quadril já para baixo (dobra no tail0) e a ponta vem para a frente, entre as pernas de trás
    return [(-150, 0), (-25, tr), (-5, tr), (-10, 0), (-12, 0), (-10, 0), (-8, 0)]
def relaxado(t):
    return [(-35, 0), (-45, 3 * onda(t, 90, 1)), (5, 4 * onda(t, 90, 2)), (12, 5 * onda(t, 90, 3)), (14, 6 * onda(t, 90, 4)), (12, 7 * onda(t, 90, 5)), (8, 8 * onda(t, 90, 6))]
def arrepiado(t):
    tr = 1.0 * math.sin(2 * math.pi * t / 5)
    return [(0, 0), (-8, tr), (-15, 0), (-30, 0), (-35, 0), (-38, 0), (-32, 0)]
HUMORES = {"rabo_contente": (90, contente, 1.0), "rabo_curioso": (90, curioso, 1.0), "rabo_atento": (60, atento, 1.0),
           "rabo_irritado": (60, irritado, 1.0), "rabo_bravo": (56, bravo, 1.0), "rabo_medo": (60, medo, 1.0),
           "rabo_relaxado": (90, relaxado, 1.0), "rabo_arrepiado": (40, arrepiado, 1.5)}

def mola_em_cascata(fn, T):
    """Cada osso segue o alvo como mola amortecida, com mais atraso e mais folga perto da ponta (follow-through).
    Simula 6 voltas e devolve a última (laço sem emenda)."""
    n = len(fn(0)); cru = [fn(t) for t in range(T)]
    saida = [[None] * n for _ in range(T)]
    for i in range(n):
        atraso = 1.5 * i; w = 2 * math.pi / (8 + 3 * i); zeta = 0.6
        for canal in (0, 1):
            alvo = lambda tt: cru[int(round(tt - atraso)) % T][i][canal]
            x = alvo(0); v = 0.0; sub = 8
            for volta in range(6):
                for t in range(T):
                    for _ in range(sub):
                        a_ = w * w * (alvo(t) - x) - 2 * zeta * w * v
                        v += a_ / sub; x += v / sub
                    if volta == 5:
                        if saida[t][i] is None: saida[t][i] = [0.0, 0.0]
                        saida[t][i][canal] = x
    aspereza = lambda serie: max(abs(serie[(t + 1) % T] - 2 * serie[t] + serie[t - 1]) for t in range(T))
    print(f"   tranco da ponta (lado): cru {aspereza([c[-1][1] for c in cru]):.2f} -> mola {aspereza([c[-1][1] for c in saida]):.2f} graus/quadro²")
    return lambda t: saida[t % T]

# orelhas: (quadros, função(t, lado) -> (para trás, para fora girando, abrir para o lado) por osso [base, ponta])
def or_atenta(t, s): return [(-10, 0, 0), (-5, 0, 0)]
def or_neutra(t, s):
    k = (t + (0 if s > 0 else 37)) % 75; tw = 12 * math.sin(math.pi * k / 6) if k < 6 else 0   # tremidinha de vez em quando
    return [(tw, 0, 0), (0.5 * tw, 0, 0)]
def or_lado(t, s): return [(15, 40, 30), (5, 10, 0)]
def or_achatada(t, s): return [(65, 30, 10), (20, 5, 0)]
ORELHAS = {"orelha_atenta": (30, or_atenta), "orelha_neutra": (75, or_neutra), "orelha_lado": (30, or_lado), "orelha_achatada": (30, or_achatada)}

clipes = []
def novo_clipe(nome, quadros, por_quadro, ossos):
    # calcula todas as poses sem animação ligada (senão cada atualização reaplica as chaves) e só depois grava
    arm.animation_data.action = None; poses = []
    for f in range(quadros + 1):              # o último quadro repete o primeiro (laço)
        zera(ossos); por_quadro(f % quadros)
        poses.append({n: (PB[n].location.copy(), PB[n].rotation_quaternion.copy(), PB[n].scale.copy()) for n in ossos})
    ac = bpy.data.actions.new(nome); arm.animation_data.action = ac
    for f, pose in enumerate(poses):
        for n, (l, r, e) in pose.items():
            PB[n].location, PB[n].rotation_quaternion, PB[n].scale = l, r, e
            for c in ("location", "rotation_quaternion", "scale"): PB[n].keyframe_insert(c, frame=1 + f)
    ac.use_fake_user = True; clipes.append(ac); arm.animation_data.action = None
    print("clipe", nome, quadros, "quadros")
for nome, (q, fn, grosso) in HUMORES.items():
    print(nome); fn = mola_em_cascata(fn, q)
    def pq(t, fn=fn, grosso=grosso):
        for i, (fr, la) in enumerate(fn(t)): dobra_rabo(i, fr, la)
        if grosso != 1.0:   # só no tail1: os de baixo herdam (escala em cada um multiplicaria)
            PB["tail1"].scale = (grosso, 1.0, grosso)                  # Y é o comprimento do osso: engrossa sem esticar
    novo_clipe(nome, q, pq, RABO)
for nome, (q, fn) in ORELHAS.items():
    def pq(t, fn=fn):
        for lado, s in (("left", 1), ("right", -1)):
            for i, (tras, fora, abre) in enumerate(fn(t, s)):
                n = ORELHA[lado][i]
                if tras: girar(n, math.radians(tras), lateral)
                if fora: girar(n, math.radians(fora) * -s, frente)     # inclina a orelha para fora (avião)
                if abre: girar(n, math.radians(abre) * s, cima)        # vira a concha para o lado
    novo_clipe(nome, q, pq, ORELHA["left"] + ORELHA["right"])
zera(RABO + ORELHA["left"] + ORELHA["right"])
for ac in clipes:
    tr = arm.animation_data.nla_tracks.new(); tr.name = ac.name; st = tr.strips.new(ac.name, 1, ac)
bpy.ops.export_scene.gltf(filepath=SAI, export_format="GLB", export_animations=True, export_animation_mode="NLA_TRACKS",
                          export_force_sampling=False)
print("exportado", SAI, len(clipes), "clipes")
