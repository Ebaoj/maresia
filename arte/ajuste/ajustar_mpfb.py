# Ajuste automático do rosto do MakeHuman (MPFB) às medidas do desenho aprovado (ajuste/alvo.json).
# Mede no boneco as mesmas coisas que medir_desenho.py mede no desenho e procura, por descida coordenada,
# os pesos dos controles de rosto que minimizam a diferença. Grava ajuste/rosto-ajustado.json.
# Uso: Blender -b --python ajuste/ajustar_mpfb.py -- ajuste/alvo.json ajuste/rosto-ajustado.json [macros.json]
import bpy, sys, json, os
import numpy as np

a = sys.argv[sys.argv.index("--") + 1:]
ALVO, SAIDA = json.load(open(a[0])), a[1]
MACROS = json.load(open(a[2]))["macros"] if len(a) > 2 else None

from bl_ext.blender_org.mpfb.services.humanservice import HumanService
from bl_ext.blender_org.mpfb.services.targetservice import TargetService

# variáveis com sinal: positivo = alvo da 1ª coluna, negativo = da 2ª
VARS = {
    "head-scale-horiz": ("head-scale-horiz-incr", "head-scale-horiz-decr"),
    "head-fat": ("head-fat-incr", "head-fat-decr"),
    "head-oval": ("head-oval", None), "head-square": ("head-square", None),
    "head-triangular": ("head-triangular", None), "head-invertedtriangular": ("head-invertedtriangular", None),
    "cheek-bones": (["l-cheek-bones-incr", "r-cheek-bones-incr"], ["l-cheek-bones-decr", "r-cheek-bones-decr"]),
    "cheek-volume": (["l-cheek-volume-incr", "r-cheek-volume-incr"], ["l-cheek-volume-decr", "r-cheek-volume-decr"]),
    "eye-trans-inout": (["l-eye-trans-out", "r-eye-trans-out"], ["l-eye-trans-in", "r-eye-trans-in"]),
    "nose-scale-horiz": ("nose-scale-horiz-incr", "nose-scale-horiz-decr"),
    "nose-flaring": ("nose-flaring-incr", "nose-flaring-decr"),
    "nose-scale-depth": ("nose-scale-depth-incr", "nose-scale-depth-decr"),
    "nose-scale-vert": ("nose-scale-vert-incr", "nose-scale-vert-decr"),
    "nose-trans-updown": ("nose-trans-up", "nose-trans-down"),
    "nose-point": ("nose-point-up", "nose-point-down"),
    "mouth-scale-horiz": ("mouth-scale-horiz-incr", "mouth-scale-horiz-decr"),
    "mouth-trans-updown": ("mouth-trans-up", "mouth-trans-down"),
    "upperlip": ("mouth-upperlip-volume-incr", "mouth-upperlip-volume-decr"),
    "lowerlip": ("mouth-lowerlip-volume-incr", "mouth-lowerlip-volume-decr"),
    "chin-width": ("chin-width-incr", "chin-width-decr"),
    "chin-height": ("chin-height-incr", "chin-height-decr"),
    "chin-prominent": ("chin-prominent-incr", "chin-prominent-decr"),
    "chin-prognathism": ("chin-prognathism-incr", "chin-prognathism-decr"),
    "forehead-fb": ("forehead-trans-forward", "forehead-trans-backward"),
}

for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
corpo = HumanService.create_human(macro_detail_dict=MACROS, scale=0.1) if MACROS else HumanService.create_human(scale=0.1)
me = corpo.data
n = len(me.vertices)
def coords(chave):
    c = np.empty(n * 3); chave.data.foreach_get("co", c); return c.reshape(n, 3)
basis = coords(me.shape_keys.key_blocks[0])
atual = basis.copy()
for k in me.shape_keys.key_blocks[1:]:
    if k.value: atual += k.value * (coords(k) - basis)

deltas = {}
def carregar(nome):
    if nome in deltas: return deltas[nome]
    k = TargetService.load_target(corpo, TargetService.target_full_path(nome), weight=0.0, name=nome)
    deltas[nome] = coords(k) - basis
    return deltas[nome]
def delta_var(par, sinal):
    alvo = par[0] if sinal > 0 else par[1]
    if alvo is None: return None
    return sum(carregar(t) for t in (alvo if isinstance(alvo, list) else [alvo]))
D = {v: (delta_var(p, 1), delta_var(p, -1)) for v, p in VARS.items()}

# vértices do corpo (sem auxiliares), grupos úteis
def grupo(nome):
    gi = corpo.vertex_groups[nome].index
    return np.array([v.index for v in me.vertices if any(g.group == gi and g.weight > 0.5 for g in v.groups)])
corpo_idx = grupo("body"); olho_e, olho_d = grupo("joint-l-eye"), grupo("joint-r-eye"); labios = grupo("lips")

def medir(P):
    pe, pd = P[olho_e].mean(0), P[olho_d].mean(0)
    ze = (pe[2] + pd[2]) / 2
    B = P[corpo_idx]
    meio = B[np.abs(B[:, 0]) < 0.006]
    # queixo: descendo pela linha média a partir da boca, o último ponto antes de a frente "pular" para trás (pescoço)
    zl = P[labios][:, 2].mean()
    zq, ant = zl, None
    for z in np.arange(zl, zl - 0.12, -0.004):
        sl = meio[np.abs(meio[:, 2] - z) < 0.003]
        if not len(sl): continue
        fy = sl[:, 1].min()
        if ant is not None and fy - ant > 0.02: break
        zq, ant = z, fy
    E = ze - zq
    m = {"interocular": abs(pe[0] - pd[0]) / E, "boca_largura": np.ptp(P[labios][:, 0]) / E, "larguras": {}, "perfil": {}}
    # nariz: largura na altura das narinas, só os vértices bem à frente
    zn = ze - 0.38 * E
    faixa = B[np.abs(B[:, 2] - zn) < 0.04 * E]
    ymin = faixa[:, 1].min()
    m["nariz_largura"] = np.ptp(faixa[faixa[:, 1] < ymin + 0.22 * E][:, 0]) / E
    for h in (0.70, 0.80, 0.90, 0.97):
        fx = B[np.abs(B[:, 2] - (ze - h * E)) < 0.02 * E]
        m["larguras"][f"{h:.2f}"] = np.abs(fx[:, 0]).max() / E if len(fx) else 0
    def frente_y(h):
        fx = B[(np.abs(B[:, 2] - (ze - h * E)) < 0.02 * E) & (np.abs(B[:, 0]) < 0.25 * E)]
        return fx[:, 1].min() if len(fx) else 0
    ref = frente_y(-0.18)
    for h in np.arange(0.0, 1.01, 0.05):
        m["perfil"][f"{h:.2f}"] = (ref - frente_y(h)) / E  # positivo = mais à frente
    return m

def erro(m):
    t = ALVO
    e = 3 * (m["interocular"] - t["frente"]["interocular"]) ** 2
    e += 3 * (m["nariz_largura"] - t["frente"]["nariz_largura"]) ** 2
    e += 3 * (m["boca_largura"] - t["frente"]["boca_largura"]) ** 2
    e += sum((m["larguras"][k] - v) ** 2 for k, v in t["frente"]["larguras"].items())
    e += 2 * sum((m["perfil"][k] - v) ** 2 for k, v in t["perfil"].items())
    return e

def montar(w):
    P = atual.copy()
    for v, x in w.items():
        if abs(x) < 1e-4: continue
        d = D[v][0] if x > 0 else D[v][1]
        if d is not None: P += abs(x) * d
    return P

def custo(w):
    return erro(medir(montar(w))) + 0.01 * sum(x * x for x in w.values())  # pesos pequenos são preferidos

w = {v: 0.0 for v in VARS}
melhor = custo(w); print("ERRO inicial", round(melhor, 5))
for passo in (0.4, 0.2, 0.1, 0.05):
    for rodada in range(3):
        mudou = False
        for v in VARS:
            for s in (passo, -passo):
                c = dict(w); c[v] = max(-0.7, min(0.7, w[v] + s))
                if c[v] < 0 and VARS[v][1] is None: continue
                e = custo(c)
                if e < melhor - 1e-7:
                    melhor, w, mudou = e, c, True
        print(f"passo {passo} rodada {rodada} erro {melhor:.5f}")
        if not mudou: break

final = medir(montar(w))
# grava como pesos de alvos (o neto_mpfb.py carrega "nome do alvo": peso)
rosto = {}
for v, x in w.items():
    if abs(x) < 0.02: continue
    alvo = VARS[v][0] if x > 0 else VARS[v][1]
    for t in (alvo if isinstance(alvo, list) else [alvo]):
        rosto[t] = round(abs(x), 3)
json.dump({"rosto": rosto, "variaveis": {k: round(v, 3) for k, v in w.items()}, "erro": melhor,
           "medidas": {k: (v if not isinstance(v, np.floating) else float(v)) for k, v in final.items()}},
          open(SAIDA, "w"), indent=1, default=float)
print("COMPARA interocular", round(final["interocular"], 3), "x", round(ALVO["frente"]["interocular"], 3),
      "| nariz", round(final["nariz_largura"], 3), "x", round(ALVO["frente"]["nariz_largura"], 3),
      "| boca", round(final["boca_largura"], 3), "x", round(ALVO["frente"]["boca_largura"], 3))
print("PERFIL boneco", [round(final["perfil"][k], 2) for k in sorted(final["perfil"])])
print("PERFIL alvo  ", [round(ALVO["perfil"][k], 2) for k in sorted(ALVO["perfil"])])
print("PRONTO", SAIDA)
