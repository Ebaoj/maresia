# Ajuste do rosto do MakeHuman comparando imagem com imagem.
# A cada tentativa: muda os pesos dos controles de rosto, desenha a malha base de frente (pele, boca e olhos em
# cores chapadas), mede as caixas de cada olho e da boca e o contorno do queixo, e compara com as mesmas medidas
# tiradas do desenho aprovado. O perfil continua medido na geometria. Busca por descida coordenada.
# Uso: Blender -b --python ajuste/ajustar_imagem.py -- macros.json saida.json
import bpy, bmesh, sys, json, math, os
import numpy as np

a = sys.argv[sys.argv.index("--") + 1:]
MACROS = json.load(open(a[0]))["macros"]
SAIDA = a[1]
TMP = os.path.join(os.path.dirname(os.path.abspath(SAIDA)), "_render.png")

from bl_ext.blender_org.mpfb.services.humanservice import HumanService
from bl_ext.blender_org.mpfb.services.targetservice import TargetService

# ---------- alvo (desenho aprovado, cabeça de frente 1024 px; E = olho a queixo = 222 px) ----------
E_PX, OLHO_Y, CX = 222.0, 450.0, 529.0
def n(x, y): return ((x - CX) / E_PX, (y - OLHO_Y) / E_PX)   # coordenada normalizada (x para a direita, y para baixo)
ALVO = {
    "olho_d": [*n(410, 433), *n(485, 463)],   # olho na esquerda da imagem = olho direito do personagem
    "olho_e": [*n(572, 433), *n(648, 463)],
    "boca":   [*n(472, 563), *n(578, 608)],
}
ALVO_LARG = {}
_al = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "alvo.json")))
ALVO_LARG = _al["frente"]["larguras"]; ALVO_PERFIL = _al["perfil"]; ALVO_NARIZ = _al["frente"]["nariz_largura"]

VARS = {
    "head-scale-horiz": ("head-scale-horiz-incr", "head-scale-horiz-decr"),
    "head-fat": ("head-fat-incr", "head-fat-decr"),
    "head-square": ("head-square", None), "head-round": ("head-round", None),
    "head-invertedtriangular": ("head-invertedtriangular", None),
    "cheek-bones": (["l-cheek-bones-incr", "r-cheek-bones-incr"], ["l-cheek-bones-decr", "r-cheek-bones-decr"]),
    "cheek-volume": (["l-cheek-volume-incr", "r-cheek-volume-incr"], ["l-cheek-volume-decr", "r-cheek-volume-decr"]),
    "eye-scale": (["l-eye-scale-incr", "r-eye-scale-incr"], ["l-eye-scale-decr", "r-eye-scale-decr"]),
    "eye-height1": (["l-eye-height1-incr", "r-eye-height1-incr"], ["l-eye-height1-decr", "r-eye-height1-decr"]),
    "eye-height2": (["l-eye-height2-incr", "r-eye-height2-incr"], ["l-eye-height2-decr", "r-eye-height2-decr"]),
    "eye-height3": (["l-eye-height3-incr", "r-eye-height3-incr"], ["l-eye-height3-decr", "r-eye-height3-decr"]),
    "eye-trans-inout": (["l-eye-trans-out", "r-eye-trans-out"], ["l-eye-trans-in", "r-eye-trans-in"]),
    "eye-trans-updown": (["l-eye-trans-up", "r-eye-trans-up"], ["l-eye-trans-down", "r-eye-trans-down"]),
    "eye-corner1": (["l-eye-corner1-up", "r-eye-corner1-up"], ["l-eye-corner1-down", "r-eye-corner1-down"]),
    "eye-corner2": (["l-eye-corner2-up", "r-eye-corner2-up"], ["l-eye-corner2-down", "r-eye-corner2-down"]),
    "nose-scale-horiz": ("nose-scale-horiz-incr", "nose-scale-horiz-decr"),
    "nose-flaring": ("nose-flaring-incr", "nose-flaring-decr"),
    "nose-point-width": ("nose-point-width-incr", "nose-point-width-decr"),
    "nose-scale-vert": ("nose-scale-vert-incr", "nose-scale-vert-decr"),
    "nose-scale-depth": ("nose-scale-depth-incr", "nose-scale-depth-decr"),
    "nose-trans-updown": ("nose-trans-up", "nose-trans-down"),
    "mouth-scale-horiz": ("mouth-scale-horiz-incr", "mouth-scale-horiz-decr"),
    "mouth-scale-vert": ("mouth-scale-vert-incr", "mouth-scale-vert-decr"),
    "mouth-trans-updown": ("mouth-trans-up", "mouth-trans-down"),
    "upperlip-volume": ("mouth-upperlip-volume-incr", "mouth-upperlip-volume-decr"),
    "lowerlip-volume": ("mouth-lowerlip-volume-incr", "mouth-lowerlip-volume-decr"),
    "upperlip-height": ("mouth-upperlip-height-incr", "mouth-upperlip-height-decr"),
    "lowerlip-height": ("mouth-lowerlip-height-incr", "mouth-lowerlip-height-decr"),
    "chin-width": ("chin-width-incr", "chin-width-decr"),
    "chin-height": ("chin-height-incr", "chin-height-decr"),
    "chin-prominent": ("chin-prominent-incr", "chin-prominent-decr"),
    "chin-prognathism": ("chin-prognathism-incr", "chin-prognathism-decr"),
    "forehead-fb": ("forehead-trans-forward", "forehead-trans-backward"),
}

for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
corpo = HumanService.create_human(macro_detail_dict=MACROS, scale=0.1)
me = corpo.data
chaves = {}
def carregar(nome):
    if nome not in chaves:
        chaves[nome] = TargetService.load_target(corpo, TargetService.target_full_path(nome), weight=0.0, name=nome)
    return chaves[nome]
VK = {}
for v, (pos, neg) in VARS.items():
    VK[v] = ([carregar(t) for t in (pos if isinstance(pos, list) else [pos])],
             [carregar(t) for t in (neg if isinstance(neg, list) else [neg])] if neg else [])

# grupos e cores: pele 0, boca 1, olho 2 (a esfera auxiliar do olho aparece pela abertura da pálpebra)
def grupo(nome):
    gi = corpo.vertex_groups[nome].index
    return {v.index for v in me.vertices if any(g.group == gi and g.weight > 0.5 for g in v.groups)}
corpo_g, labios, olhos = grupo("body"), grupo("lips"), grupo("helper-l-eye") | grupo("helper-r-eye")
vis = corpo.vertex_groups.new(name="visivel"); vis.add(list(corpo_g | olhos), 1.0, "REPLACE")
for m in corpo.modifiers:
    if m.type == "MASK": m.vertex_group = "visivel"
def mat(nome, rgb):
    m = bpy.data.materials.new(nome); m.diffuse_color = (*rgb, 1); return m
me.materials.clear()
for m in (mat("pele", (0.5, 0.25, 0.12)), mat("boca", (1, 0, 0)), mat("olho", (0, 0, 1))): me.materials.append(m)
for p in me.polygons:
    vs = set(p.vertices)
    p.material_index = 2 if vs <= olhos else (1 if vs <= labios else 0)

cena = bpy.context.scene
cena.render.engine = "BLENDER_WORKBENCH"
cena.display.shading.light = "FLAT"; cena.display.shading.color_type = "MATERIAL"
cena.view_settings.view_transform = "Standard"
cena.render.resolution_x = cena.render.resolution_y = 512
cena.world = bpy.data.worlds.new("w"); cena.world.color = (1, 1, 1)
cd = bpy.data.cameras.new("c"); cd.type = "ORTHO"
cam = bpy.data.objects.new("c", cd); cena.collection.objects.link(cam); cena.camera = cam

# índices para medir na geometria (perfil, nariz, queixo)
n_v = len(me.vertices)
idx_corpo = np.array(sorted(corpo_g)); idx_lab = np.array(sorted(labios))
idx_oe, idx_od = np.array(sorted(grupo("joint-l-eye"))), np.array(sorted(grupo("joint-r-eye")))

_basis = None
def _co(k):
    c = np.empty(n_v * 3); k.data.foreach_get("co", c); return c.reshape(n_v, 3)
def geometria():
    """Posições com todas as chaves de forma aplicadas (sem modificadores, que removem vértices)."""
    global _basis
    kb = me.shape_keys.key_blocks
    if _basis is None:
        _basis = _co(kb[0])
        for k in kb[1:]: _DELTA[k.name] = _co(k) - _basis
    P = _basis.copy()
    for k in kb[1:]:
        if k.value: P += k.value * _DELTA[k.name]
    return P
_DELTA = {}

def marcos(P):
    ze = (P[idx_oe][:, 2].mean() + P[idx_od][:, 2].mean()) / 2
    B = P[idx_corpo]; meio = B[np.abs(B[:, 0]) < 0.006]
    zl = P[idx_lab][:, 2].mean(); zq, ant = zl, None
    for z in np.arange(zl, zl - 0.12, -0.004):
        sl = meio[np.abs(meio[:, 2] - z) < 0.003]
        if not len(sl): continue
        fy = sl[:, 1].min()
        if ant is not None and fy - ant > 0.02: break
        zq, ant = z, fy
    return ze, zq, B

def medir():
    P = geometria(); ze, zq, B = marcos(P); E = ze - zq
    # câmera de frente: olho na linha y=450/1024 e E = 222/1024 da imagem, centro no meio dos olhos
    cx = (P[idx_oe][:, 0].mean() + P[idx_od][:, 0].mean()) / 2
    lado = E * 1024 / E_PX; cd.ortho_scale = lado
    cam.location = (cx - (CX - 512) / 1024 * lado, -3, ze - (512 - OLHO_Y) / 1024 * lado)
    cam.rotation_euler = (math.pi / 2, 0, 0)
    cena.render.filepath = TMP; bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(TMP, check_existing=False); px = np.empty(512 * 512 * 4, dtype=np.float32); img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    px = px.reshape(512, 512, 4)[::-1, :, :3]   # de cima para baixo
    r, g, b = px[..., 0], px[..., 1], px[..., 2]
    boca, olho = (r > 0.8) & (g < 0.2) & (b < 0.2), (b > 0.8) & (r < 0.2) & (g < 0.2)
    pele = (np.abs(px - 1).sum(-1) > 0.1)
    def caixa(mask):
        ys, xs = np.nonzero(mask)
        if not len(xs): return None
        return [*(lambda x, y: ((x * 2 - CX) / E_PX, (y * 2 - OLHO_Y) / E_PX))(xs.min(), ys.min()),
                *(lambda x, y: ((x * 2 - CX) / E_PX, (y * 2 - OLHO_Y) / E_PX))(xs.max(), ys.max())]
    meio_x = 256
    m = {"olho_d": caixa(olho & (np.arange(512)[None, :] < meio_x)), "olho_e": caixa(olho & (np.arange(512)[None, :] >= meio_x)),
         "boca": caixa(boca), "larg": {}, "perfil": {}}
    for h, alvo in ALVO_LARG.items():
        y = int((OLHO_Y + float(h) * E_PX) / 2); xs = np.nonzero(pele[y])[0]
        m["larg"][h] = (xs.max() - xs.min()) * 2 / 2 / E_PX if len(xs) else 0
    def frente_y(hh):
        fx = B[(np.abs(B[:, 2] - (ze - hh * E)) < 0.02 * E) & (np.abs(B[:, 0]) < 0.25 * E)]
        return fx[:, 1].min() if len(fx) else 0
    ref = frente_y(-0.18)
    for h in ALVO_PERFIL: m["perfil"][h] = (ref - frente_y(float(h))) / E
    zn = ze - 0.38 * E; fa = B[np.abs(B[:, 2] - zn) < 0.04 * E]
    m["nariz"] = np.ptp(fa[fa[:, 1] < fa[:, 1].min() + 0.22 * E][:, 0]) / E if len(fa) else 0
    return m

def erro(m):
    e = 0.0
    for k in ("olho_d", "olho_e", "boca"):
        if m[k] is None: e += 1.0; continue
        e += 4 * sum((x - y) ** 2 for x, y in zip(m[k], ALVO[k]))
    e += sum((m["larg"][h] - v) ** 2 for h, v in ALVO_LARG.items())
    e += 2 * sum((m["perfil"][h] - v) ** 2 for h, v in ALVO_PERFIL.items())
    e += 0.5 * (m["nariz"] - ALVO_NARIZ) ** 2
    return e

def aplicar(w):
    for v, (pos, neg) in VK.items():
        x = w[v]
        for k in pos: k.value = max(0.0, x)
        for k in neg: k.value = max(0.0, -x)

def custo(w):
    aplicar(w); return erro(medir()) + 0.006 * sum(x * x for x in w.values())

w = {v: 0.0 for v in VARS}
melhor = custo(w); print("ERRO inicial", round(melhor, 5), flush=True)
if os.environ.get("TESTE"):
    print("MEDIDAS", {k: medir()[k] for k in ("olho_d", "olho_e", "boca", "larg", "nariz")}); sys.exit(0)
for passo in (0.3, 0.15, 0.07):
    for rodada in range(3):
        mudou = False
        for v in VARS:
            for s in (passo, -passo):
                c = dict(w); c[v] = max(-0.8, min(0.8, w[v] + s))
                if c[v] < 0 and VARS[v][1] is None: continue
                e = custo(c)
                if e < melhor - 1e-7: melhor, w, mudou = e, c, True
        print(f"passo {passo} rodada {rodada} erro {melhor:.5f}", flush=True)
        if not mudou: break
aplicar(w); final = medir()
rosto = {}
for v, x in w.items():
    if abs(x) < 0.02: continue
    alvo = VARS[v][0] if x > 0 else VARS[v][1]
    for t in (alvo if isinstance(alvo, list) else [alvo]): rosto[t] = round(abs(x), 3)
json.dump({"rosto": rosto, "variaveis": {k: round(v, 3) for k, v in w.items()}, "erro": melhor,
           "caixas": {k: final[k] for k in ("olho_d", "olho_e", "boca")}, "alvo": ALVO}, open(SAIDA, "w"), indent=1, default=float)
print("CAIXAS", {k: [round(x, 2) for x in final[k]] for k in ("olho_d", "olho_e", "boca") if final[k]})
print("ALVO  ", {k: [round(x, 2) for x in v] for k, v in ALVO.items()})
print("PRONTO", SAIDA)
