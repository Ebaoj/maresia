#!/usr/bin/env python3
"""Maresia - a escala do mapa de 1932: o centro historico e o Campo do Urubu em 1:1.

Decisao do Joabe (21-22/10/2026): o centro historico inteiro em tamanho real (a
Praca do Ferreira, o Excelsior e os cinemas, a Praca dos Leoes, o Mercado de
Ferro na Praca Carolina, a Se, a Estacao Central e a Praca Castro Carreira, o
Passeio Publico, o Poco da Draga e a Ponte Metalica, e as quadras entre eles),
mais o Campo do Urubu em 1:1; compressao so onde ha pouca rua para entortar
(o vazio entre os dois e a periferia); a caminhada do campo ao centro curta.

Por que um campo de deslocamento, e nao curvas por eixo: a escala de antes era
separavel (o x do jogo saia so de u, o z so de v, no quadro da grade). Uma zona
1:1 separavel vira uma FAIXA que atravessa o mapa inteiro: a mesma rua ficava
ate 3 vezes mais larga dentro da faixa do que fora, e as casas eram espremidas
na borda dela (docs/mapa-1932.md, v16).

Aqui o mapa e um campo continuo: cada no de uma malha de 100 m (no quadro da
grade, metros de verdade) recebe a sua posicao no jogo. As zonas sao corpos
rigidos (a posicao e a de verdade mais uma translacao): dentro delas a escala e
1 por construcao. Fora, a posicao sai de uma otimizacao sem dobra (SLIM, Rabinovich
et al. 2017, energia de Dirichlet simetrica): cada triangulo da malha quer ter a
forma de verdade escalada por um alvo s (1 perto do centro, ~0,5 nos bairros,
~0,07 no vazio), com peso grande onde ha lote de 1932 e pequeno onde nao ha.
A energia vai ao infinito quando um triangulo achata, e o passo nunca deixa um
triangulo virar: o mapa nao dobra. O que nao cabe (um centro grande em 1:1
cercado de mapa comprimido nao fecha sem distorcao) vai para o vazio, onde nao
ha rua para entortar.

O que sai daqui:

  src/mundo/escala1932-malha.json   a malha (u0, v0, passo, nu, nv), a posicao de
                                    cada no no jogo (U ao longo da rua, V de
                                    travessia, em unidades de jogo, em
                                    centimetros) e as zonas 1:1

O jogo le a malha em src/mundo/quadroGrade1932.js e interpola com Catmull-Rom
(C1: a escala e continua, sem quina). A zona exata (1:1) e a caixa declarada;
os nos vao 1 passo alem dela, porque o Catmull-Rom so reproduz a reta quando os
4 nos de cada lado estao na zona.

Uso:  python3 docs/mapa-1932-escala.py            (uns 2 minutos)
"""

import json
import math
import os
import sys
import time

import numpy as np
import scipy.sparse as sp
import scipy.sparse.linalg as sla
from scipy.ndimage import gaussian_filter, map_coordinates

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOTES = os.path.join(RAIZ, "src", "mundo", "mapa1932-lotes.json")
SAIDA = os.environ.get("SAIDA") or os.path.join(RAIZ, "src", "mundo", "escala1932-malha.json")

# o quadro da grade (o mesmo de src/mundo/quadroGrade1932.js): origem na Praca do
# Ferreira, u ao longo da rua les-sudeste (azimute 107,81), v de travessia
PRACA_LON = -38.5275014
PRACA_LAT = -3.7274448
ANGULO_GRADE = 72.19
M_LON = 111320 * math.cos(PRACA_LAT * math.pi / 180)
M_LAT = 110574
PSI = (ANGULO_GRADE - 90) * math.pi / 180
CU, SU = math.cos(PSI), math.sin(PSI)


def grade_de(lon, lat):
    e = lon * M_LON - PRACA_LON * M_LON
    n = lat * M_LAT - PRACA_LAT * M_LAT
    return e * CU + n * SU, -e * SU + n * CU


# a malha: cobre a caixa do mapa (-38,612 a -38,44; -3,77 a -3,688) com folga
PASSO = 100.0
U0, U1 = -10500.0, 11000.0
V0, V1 = -7500.0, 7500.0

# As zonas em 1:1 (no quadro da grade, metros de verdade, exatas; cada zona e a uniao de caixas
# [u0, u1, v0, v1] e circulos [u, v, raio]):
# - o centro: o circulo de 1 km em volta da Praca do Ferreira e a grade de Herbster inteira do Centro (as
#   testadas a menos de 600 m da praca e a reta de 400 m de cada lado delas; a rua que passa pela praca, 900 m
#   de cada lado: testes/unidade/ruas-reais-retas.test.js), com o Theatro, a Estacao e a Praca Castro Carreira,
#   o Passeio, a Se, o Mercado de Ferro e a Praca dos Leoes dentro; e o porto: o Poco da Draga e a Ponte
#   Metalica ate a cabeca dela no mar (v 1650).
# - o Campo do Urubu: o poligono da cerca (mapa1932-dados.json) com a folga da cerca e a linha por fora do
#   portao; e, ao lado, o recinto das Oficinas da RVC (ferrovia1932.json, "patios") com a vila operaria. Desde
#   22/10/2026 (docs/mapa-1932.md, v17) o campo fica a leste das oficinas, entre a Linha Norte e o mar: antes a
#   caixa era [-5420, -4230, -910, 150], com o poligono em cima do recinto das oficinas.
ZONAS = [
    {"nome": "centro", "corpo": 1, "caixas": [[-1000, 1000, 0, 1650]], "circulos": [[0, 0, 1000]]},
    {"nome": "campoUrubu", "corpo": 2, "caixas": [[-4620, -3240, -260, 740], [-5100, -4350, -280, 120]], "circulos": []},
]

# o alvo de escala (unidades de jogo por metro de verdade)
PARAM = {
    "sigma_densidade": 150.0,  # m: o borrao da densidade de frente de lote
    "rho_cheio": 30.0,  # m de frente por hectare: a partir dai e cidade cheia
    "alvo_bairro": 0.5,  # a escala que a cidade quer longe do centro
    "rampa_centro": 1000.0,  # m: a distancia em que o alvo cai de 1 ao do bairro
    "alvo_vazio": 0.11,  # a escala que o vazio quer (o mar, o areal, a periferia sem lote): ~9 vezes
    "peso_vazio": 0.15,  # o vazio cede: a distorcao vai para onde nao ha rua
    "alvo_caminho": 0.05,  # o caminho do campo ao centro (o areal entre Jacarecanga e o campo): ~20 vezes
    "peso_caminho": 0.2,
    "raio_caminho": 700.0,  # m: a largura do caminho (uma capsula em volta do segmento, no vazio)
    "rampa_vazio": 400.0,  # m: perto de uma zona o vazio tambem desce devagar de 1 (sem degrau na borda do porto e do campo)
    "peso_cheio": 3.0,  # o peso de um triangulo de cidade cheia (o vazio cede para ela)
    "peso_giro": 0.0,  # na cidade, o quanto o triangulo e preso ao norte (J perto da identidade, sem girar)
    "iteracoes": 60,
}

# o caminho do campo ao centro: o areal entre a borda oeste de Jacarecanga e a borda leste do campo (u, v; o
# portao do campo fica no lado leste dele desde 22/10/2026, em (-3450, 260))
CAMINHO = [[-1900.0, 100.0], [-3240.0, 150.0]]


def densidade(us, vs):
    lotes = json.load(open(LOTES))
    rho = np.zeros((len(vs), len(us)))
    for f in lotes["fachadas"]:
        u, v = grade_de((f[1] + f[3]) / 2, (f[2] + f[4]) / 2)
        w = math.hypot((f[3] - f[1]) * M_LON, (f[4] - f[2]) * M_LAT)
        i = int(round((v - V0) / PASSO))
        j = int(round((u - U0) / PASSO))
        if 0 <= i < len(vs) and 0 <= j < len(us):
            rho[i, j] += w
    # m de frente por hectare (a celula de 100 m e um hectare)
    return gaussian_filter(rho, PARAM["sigma_densidade"] / PASSO) * (100.0 / PASSO) ** 2, lotes


def dist_zona(zona, x, y, folga=0.0):
    """a distancia (m) de cada ponto a zona (0 dentro); folga engorda a zona"""
    d = np.full(np.shape(x), np.inf)
    for (a, b, c, e) in zona["caixas"]:
        du = np.maximum(0, np.maximum(a - folga - x, x - b - folga))
        dv = np.maximum(0, np.maximum(c - folga - y, y - e - folga))
        d = np.minimum(d, np.hypot(du, dv))
    for (cu, cv, r) in zona["circulos"]:
        d = np.minimum(d, np.maximum(0, np.hypot(x - cu, y - cv) - r - folga))
    return d


def suave(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


def main():
    t0 = time.time()
    nu = int(round((U1 - U0) / PASSO)) + 1
    nv = int(round((V1 - V0) / PASSO)) + 1
    us = U0 + np.arange(nu) * PASSO
    vs = V0 + np.arange(nv) * PASSO
    UU, VV = np.meshgrid(us, vs)
    N = nu * nv
    X = UU.ravel()
    Y = VV.ravel()
    rho, lotes = densidade(us, vs)

    # os nos de cada zona: a caixa exata mais um passo (o Catmull-Rom precisa)
    corpo = np.zeros(N, int)
    # (o circulo engorda 1,5 passo: o no da diagonal da celula de borda tambem precisa estar dentro)
    for z in ZONAS:
        corpo[dist_zona(z, X, Y, folga=PASSO) <= 1e-6] = z["corpo"]
        if z["circulos"]:
            perto = (dist_zona({"caixas": [], "circulos": z["circulos"]}, X, Y, folga=1.5 * PASSO) <= 1e-6)
            corpo[perto] = z["corpo"]

    # os triangulos (dois por celula)
    ii, jj = np.meshgrid(np.arange(nv - 1), np.arange(nu - 1), indexing="ij")
    a = (ii * nu + jj).ravel()
    T = np.concatenate([np.stack([a, a + 1, a + nu + 1], 1), np.stack([a, a + nu + 1, a + nu], 1)])
    nt = len(T)
    cx = X[T].mean(1)
    cy = Y[T].mean(1)
    rho_t = map_coordinates(rho, [(cy - V0) / PASSO, (cx - U0) / PASSO], order=1)
    cheio = np.clip(rho_t / PARAM["rho_cheio"], 0, 1)
    d_centro = dist_zona(ZONAS[0], cx, cy)
    alvo_cidade = 1 - (1 - PARAM["alvo_bairro"]) * suave(d_centro / PARAM["rampa_centro"])
    # o caminho: a distancia ao segmento, em metros de verdade
    (ax, ay), (bx, by) = CAMINHO
    t_seg = np.clip(((cx - ax) * (bx - ax) + (cy - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2), 0, 1)
    d_cam = np.hypot(cx - ax - t_seg * (bx - ax), cy - ay - t_seg * (by - ay))
    caminho = 1 - suave(d_cam / PARAM["raio_caminho"])
    alvo_vazio = PARAM["alvo_vazio"] * (1 - caminho) + PARAM["alvo_caminho"] * caminho
    peso_vazio = PARAM["peso_vazio"] * (1 - caminho) + PARAM["peso_caminho"] * caminho
    d_zonas = np.minimum.reduce([dist_zona(z, cx, cy) for z in ZONAS])
    alvo_vazio = np.maximum(alvo_vazio, 1 - (1 - alvo_vazio) * suave(d_zonas / PARAM["rampa_vazio"]))
    alvo = alvo_cidade * cheio + alvo_vazio * (1 - cheio)
    peso = peso_vazio + PARAM["peso_cheio"] * cheio
    na_zona = np.maximum.reduce([corpo[T[:, 0]], corpo[T[:, 1]], corpo[T[:, 2]]]) > 0
    alvo[na_zona] = 1
    peso[na_zona] = 1

    # o triangulo de referencia: o de verdade escalado pelo alvo. O V do jogo cresce
    # para o sul (o v da grade, para o norte): a otimizacao e feita em W = -V,
    # que preserva a orientacao
    p0 = np.stack([X[T[:, 0]], Y[T[:, 0]]], 1)
    e1 = (np.stack([X[T[:, 1]], Y[T[:, 1]]], 1) - p0) * alvo[:, None]
    e2 = (np.stack([X[T[:, 2]], Y[T[:, 2]]], 1) - p0) * alvo[:, None]
    ref = np.stack([e1, e2], 2)
    ref_inv = np.linalg.inv(ref)
    area = 0.5 * np.abs(np.linalg.det(ref))
    G = np.einsum("tij,jk->tik", np.transpose(ref_inv, (0, 2, 1)), np.array([[-1.0, 1, 0], [-1.0, 0, 1]]))

    # as incognitas: os nos livres (U e W) e a translacao do campo; o centro fica parado
    livres = np.where(corpo == 0)[0]
    nl = len(livres)
    col = -np.ones(N, int)
    col[livres] = np.arange(nl)
    ny = 2 * nl + 2
    Pr, Pc, Pv = [], [], []
    cvec = np.zeros(2 * N)
    for comp, base in ((0, X), (1, Y)):
        off = comp * N
        m = corpo == 0
        Pr += list(off + np.where(m)[0]); Pc += list(comp * nl + col[m]); Pv += [1.0] * int(m.sum())
        m = corpo == 2
        Pr += list(off + np.where(m)[0]); Pc += [2 * nl + comp] * int(m.sum()); Pv += [1.0] * int(m.sum())
        m = corpo > 0
        cvec[off + np.where(m)[0]] = base[m]
    Pm = sp.csr_matrix((Pv, (Pr, Pc)), shape=(2 * N, ny))
    r, c, v = [], [], []
    for comp in (0, 1):
        for dd in (0, 1):
            row = np.arange(nt) * 4 + comp * 2 + dd
            for q in range(3):
                r.append(row); c.append(comp * N + T[:, q]); v.append(G[:, dd, q])
    Jop = sp.csr_matrix((np.concatenate(v), (np.concatenate(r), np.concatenate(c))), shape=(4 * nt, 2 * N))
    JP = (Jop @ Pm).tocsr()
    Jc = Jop @ cvec

    def jac(y):
        return (JP @ y + Jc).reshape(nt, 2, 2)

    # o giro preso: na cidade, alem da forma do alvo, o triangulo nao gira (a rua mantem o rumo de verdade)
    giro = PARAM["peso_giro"] * cheio
    giro[na_zona] = 0

    def energia(J):
        if (np.linalg.det(J) <= 0).any():
            return np.inf
        inv = np.linalg.inv(J)
        sd = (peso * area * ((J ** 2).sum((1, 2)) + (inv ** 2).sum((1, 2)))).sum()
        return float(sd + (giro * area * ((J - np.eye(2)) ** 2).sum((1, 2))).sum())

    # comeca da identidade (1:1 em toda parte: nenhum triangulo virado)
    y = np.zeros(ny)
    y[:nl] = X[livres]
    y[nl:2 * nl] = Y[livres]
    raiz_pa = np.sqrt(area * peso)
    for it in range(PARAM["iteracoes"]):
        J = jac(y)
        E = energia(J)
        Uu, S, Vt = np.linalg.svd(J)
        sinal = np.where(np.linalg.det(Uu @ Vt) < 0, -1.0, 1.0)
        Uu[:, :, 1] *= sinal[:, None]
        S[:, 1] *= sinal
        Rt = Uu @ Vt
        perto = np.abs(S - 1) < 1e-8
        w = np.sqrt(np.where(perto, 4.0, (S - S ** -3) / np.where(perto, 1, S - 1)))
        W = Uu @ (w[:, :, None] * np.transpose(Uu, (0, 2, 1)))
        rr, cc, vv = [], [], []
        for a_ in (0, 1):
            for b_ in (0, 1):
                for c_ in (0, 1):
                    rr.append(np.arange(nt) * 4 + a_ * 2 + b_)
                    cc.append(np.arange(nt) * 4 + c_ * 2 + b_)
                    vv.append(raiz_pa * W[:, a_, c_])
        Wm = sp.csr_matrix((np.concatenate(vv), (np.concatenate(rr), np.concatenate(cc))), shape=(4 * nt, 4 * nt))
        A = Wm @ JP
        b = (raiz_pa[:, None] * np.einsum("tac,tcb->tab", W, Rt).reshape(nt, 4)).ravel() - Wm @ Jc
        if PARAM["peso_giro"] > 0:
            rg = np.repeat(np.sqrt(giro * area), 4)
            Gm = sp.diags(rg)
            A = sp.vstack([A, Gm @ JP]).tocsr()
            b = np.concatenate([b, rg * (np.tile(np.eye(2).ravel(), nt) - Jc)])
        novo = sla.spsolve((A.T @ A).tocsc() + sp.identity(ny) * 1e-9, A.T @ b)
        dy = novo - y
        # o maior passo sem virar triangulo: det(J0 + t dJ) = 0
        dJ = (JP @ dy).reshape(nt, 2, 2)
        qa = np.linalg.det(dJ)
        qc = np.linalg.det(J)
        qb = J[:, 0, 0] * dJ[:, 1, 1] + dJ[:, 0, 0] * J[:, 1, 1] - J[:, 0, 1] * dJ[:, 1, 0] - dJ[:, 0, 1] * J[:, 1, 0]
        tmax = 1.0
        with np.errstate(all="ignore"):
            disc = qb * qb - 4 * qa * qc
            quad = np.abs(qa) > 1e-14
            for raiz in ((-qb - np.sqrt(np.maximum(disc, 0))) / (2 * qa), (-qb + np.sqrt(np.maximum(disc, 0))) / (2 * qa)):
                ok = quad & (disc >= 0) & (raiz > 0)
                if ok.any():
                    tmax = min(tmax, 0.9 * float(raiz[ok].min()))
            lin = ~quad & (qb < 0)
            if lin.any():
                tmax = min(tmax, 0.9 * float((-qc[lin] / qb[lin]).min()))
        t = tmax
        while energia(jac(y + t * dy)) > E and t > 1e-7:
            t *= 0.5
        y = y + t * dy
        if it % 10 == 0 or it == PARAM["iteracoes"] - 1:
            print(f"  iteracao {it:3d}  energia {E:.6g}  passo {t:.3f}  ({time.time() - t0:.0f} s)", flush=True)

    x = Pm @ y + cvec
    Ug = x[:N].reshape(nv, nu)
    Vg = -x[N:].reshape(nv, nu)
    J = jac(y)
    S = np.linalg.svd(J, compute_uv=False)
    print(f"menor determinante (relativo ao alvo): {np.linalg.det(J).min():.4f}")

    # a anisotropia nas fachadas de 1932 fora das zonas
    fu = np.array([grade_de((f[1] + f[3]) / 2, (f[2] + f[4]) / 2)[0] for f in lotes["fachadas"]])
    fv = np.array([grade_de((f[1] + f[3]) / 2, (f[2] + f[4]) / 2)[1] for f in lotes["fachadas"]])
    j = np.clip(((fu - U0) / PASSO).astype(int), 0, nu - 2)
    i = np.clip(((fv - V0) / PASSO).astype(int), 0, nv - 2)
    ru = (fu - U0) / PASSO - j
    rv = (fv - V0) / PASSO - i
    tri = (i * (nu - 1) + j) + np.where(rv > ru, (nv - 1) * (nu - 1), 0)
    an = S[:, 0] / S[:, 1]
    fora = ~na_zona[tri]
    pct = np.percentile(an[tri][fora], [50, 90, 95, 99, 100])
    print("anisotropia nas fachadas fora das zonas: p50 %.3f p90 %.3f p95 %.3f p99 %.3f max %.3f" % tuple(pct))

    saida = {
        "fonte": "docs/mapa-1932-escala.py (nao editar a mao: rodar o script)",
        "quadro": {"praca_lon": PRACA_LON, "praca_lat": PRACA_LAT, "angulo_grade": ANGULO_GRADE},
        "u0": U0, "v0": V0, "passo": PASSO, "nu": nu, "nv": nv,
        "zonas": ZONAS,
        "parametros": PARAM,
        "caminho": CAMINHO,
        "anisotropia_fachadas": {k: round(float(p), 4) for k, p in zip(["p50", "p90", "p95", "p99", "max"], pct)},
        # posicao de cada no no jogo, linha a linha (v crescente, u crescente), em centimetros
        "U": [int(round(q * 100)) for q in Ug.ravel()],
        "V": [int(round(q * 100)) for q in Vg.ravel()],
    }
    with open(SAIDA, "w") as fh:
        json.dump(saida, fh, separators=(",", ":"))
    print(f"escrito {SAIDA} ({os.path.getsize(SAIDA) / 1e6:.2f} MB) em {time.time() - t0:.0f} s")


if __name__ == "__main__":
    for arg in sys.argv[1:]:
        k, val = arg.split("=")
        PARAM[k] = type(PARAM[k])(val)
    main()
