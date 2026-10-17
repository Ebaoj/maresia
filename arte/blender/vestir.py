# Veste um corpo base (já com esqueleto e em pose T) com roupas geradas à parte (modelos soltos do Tripo):
#  - mede o corpo pelos ossos e pela malha (peito, quadril, pescoço) e escala/posiciona cada peça;
#  - camisa: inclina os braços do corpo no ângulo das mangas, encaixa, e no fim volta à pose T
#    desfazendo a deformação ponto a ponto (pele linear inversa);
#  - empurra para fora o que ficou dentro do corpo (ou da peça de baixo) e copia os pesos da pele mais perto.
# Uso: Blender -b BASE.blend --python blender/vestir.py -- SAIDA_PREFIXO calca=ARQ.glb camisa=ARQ.glb
#   VESTIR_GANCHO (0.02 abaixo do gancho do corpo)  VESTIR_PUXA_PERNA (0.5)  VESTIR_RAIO (0.02)
#   VESTIR_FOLGA (0.006)  VESTIR_FOLGA_PEITO (1.01, sobre a largura da barra)  VESTIR_FOLGA_QUADRIL (1.18)
import bpy, sys, os, math
import numpy as np
from mathutils import Vector, Matrix
from mathutils.kdtree import KDTree

a = sys.argv[sys.argv.index("--") + 1:]
SAIDA = a[0]; PECAS = [x.split("=", 1) for x in a[1:]]
FOLGA = float(os.environ.get("VESTIR_FOLGA", "0.006"))
RAIO = float(os.environ.get("VESTIR_RAIO", "0.02"))
GANCHO = float(os.environ.get("VESTIR_GANCHO", "0.02")); PUXA = float(os.environ.get("VESTIR_PUXA_PERNA", "0.5"))
F_PEITO = float(os.environ.get("VESTIR_FOLGA_PEITO", "1.01")); F_QUADRIL = float(os.environ.get("VESTIR_FOLGA_QUADRIL", "1.18"))
cena = bpy.context.scene
rig = next(o for o in cena.objects if o.type == "ARMATURE")
corpo = next(o for o in cena.objects if o.type == "MESH" and o.parent == rig)
NOME = corpo.name


def mundo(ob, avaliado=False):
    if avaliado:
        dg = bpy.context.evaluated_depsgraph_get(); oe = ob.evaluated_get(dg); m = oe.to_mesh()
        P = np.array([oe.matrix_world @ v.co for v in m.vertices]); N = np.array([(oe.matrix_world.to_3x3() @ v.normal).normalized() for v in m.vertices])
        oe.to_mesh_clear(); return P, N
    return np.array([ob.matrix_world @ v.co for v in ob.data.vertices])


def osso(n): return np.array(rig.matrix_world @ rig.data.bones["mixamorig:" + n].head_local)


Pc = mundo(corpo)
def meia_largura(z, faixa=0.015, xmax=None):
    s = Pc[np.abs(Pc[:, 2] - z) < faixa]
    if xmax is not None: s = s[np.abs(s[:, 0]) < xmax]
    return (s[:, 0].max() - s[:, 0].min()) / 2, s.mean(0)


def importar(arq, nome):
    antes = set(cena.objects)
    bpy.ops.import_scene.gltf(filepath=arq)
    novos = [o for o in cena.objects if o not in antes]
    m = next(o for o in novos if o.type == "MESH")
    for o in novos:
        if o != m: bpy.data.objects.remove(o, do_unlink=True)
    m.parent = None
    Q = mundo(m)
    if np.ptp(Q[:, 1]) > np.ptp(Q[:, 0]):   # Tripo: frente em +X e largura em Y -> frente -Y, largura X
        Q = np.stack([Q[:, 1], -Q[:, 0], Q[:, 2]], axis=1)
    m.matrix_world = Matrix.Identity(4)
    m.data.vertices.foreach_set("co", Q.ravel()); m.data.update()
    m.name = m.data.name = f"{NOME}-{nome}"
    return m


def soldados(ob):
    """id por posição (as costuras de textura duplicam vértices no mesmo lugar) e as arestas entre esses ids"""
    co = np.empty(len(ob.data.vertices) * 3); ob.data.vertices.foreach_get("co", co)
    chave = np.round(co.reshape(-1, 3) / 1e-5).astype(np.int64)
    _, uid = np.unique(chave, axis=0, return_inverse=True); uid = uid.ravel()
    e = np.empty(len(ob.data.edges) * 2, dtype=np.int64); ob.data.edges.foreach_get("vertices", e); e = uid[e.reshape(-1, 2)]
    return uid, e[e[:, 0] != e[:, 1]]


def pernas(ob, Q):
    """separa as pernas da calça pela malha, não pelo lado do centro: perna larga cruza o meio e o pedaço que
    cruzou seguiria a perna errada (rasga e vira saia). Desce um corte até a parte de baixo virar dois tubos."""
    uid, e = soldados(ob); nu = uid.max() + 1
    zu = np.zeros(nu); np.maximum.at(zu, uid, Q[:, 2]); xu = np.zeros(nu); np.add.at(xu, uid, Q[:, 0])
    xu /= np.bincount(uid, minlength=nu)
    viz = [[] for _ in range(nu)]
    for a_, b_ in e: viz[a_].append(b_); viz[b_].append(a_)
    for z in np.arange(Q[:, 2].max(), Q[:, 2].min(), -0.005):
        baixo = zu < z; comp = -np.ones(nu, dtype=int); grandes = []
        for i0 in np.nonzero(baixo)[0]:
            if comp[i0] >= 0: continue
            c_ = len(grandes); pilha = [i0]; comp[i0] = c_; membros = []
            while pilha:
                i = pilha.pop(); membros.append(i)
                for j in viz[i]:
                    if baixo[j] and comp[j] < 0: comp[j] = c_; pilha.append(j)
            grandes.append(membros)
        grandes = sorted(grandes, key=len, reverse=True)
        if len(grandes) >= 2 and len(grandes[1]) > 0.2 * baixo.sum():
            rot = np.zeros(nu, dtype=int)
            for membros in grandes[:2]: rot[membros] = 1 if xu[membros].mean() > 0 else -1
            # pecinhas soltas abaixo do corte (dobra da barra, avesso): ficam com a perna do lado
            solto = baixo & (rot == 0); rot[solto] = np.where(xu[solto] >= 0, 1, -1)
            print(f"GANCHO da calça em z {z:.3f}: pernas com {len(grandes[0])} e {len(grandes[1])} pontos")
            return rot[uid], z
    print("GANCHO não achado: pernas pelo lado do centro"); return np.zeros(len(Q), dtype=int), None


def apertar_pernas(Q, rot, folga=0.004):
    """o lado de dentro de cada perna não passa do meio: encolhe em x só a metade de dentro, faixa por faixa"""
    Q = Q.copy()
    for sx in (1, -1):
        m = rot == sx
        if not m.any(): continue
        zs = np.arange(Q[m, 2].min(), Q[m, 2].max() + 0.01, 0.01); ks = []; cs = []
        for z in zs:
            f = m & (np.abs(Q[:, 2] - z) < 0.015)
            if not f.any(): ks.append(1.0); cs.append(sx * 0.1); continue
            c = Q[f, 0].mean(); dentro = (sx * Q[f, 0]).min()
            ks.append(1.0 if dentro >= folga else max(0.2, (sx * c - folga) / (sx * c - dentro))); cs.append(c)
        k = np.interp(Q[m, 2], zs, ks); c = np.interp(Q[m, 2], zs, cs)
        x = Q[m, 0]; lado_dentro = sx * (x - c) < 0
        Q[m, 0] = np.where(lado_dentro, c + (x - c) * k, x)
        print(f"PERNA {'esq' if sx > 0 else 'dir'}: aperto mínimo {min(ks):.2f}")
    return Q


def pesos_e_colisao(ob, colisores, rot=None):
    """empurra para fora dos colisores (malha avaliada, na pose atual) e copia os pesos da pele mais perto;
    rot: lado de cada ponto (+1/-1, 0 = pelo lado do centro), para a perna não pegar peso da outra"""
    Q = mundo(ob)
    # a peça do Tripo tem duas paredes (fora e avesso) a milímetros: empurrar cada ponto por conta própria
    # cruza as paredes e o avesso aparece por cima. Cada ponto anda o maior empurrão da vizinhança (RAIO).
    for col in colisores:
        kq = KDTree(len(Q))
        for i, p in enumerate(Q): kq.insert(p, i)
        kq.balance()
        Pk, Nk = mundo(col, avaliado=True)
        kd = KDTree(len(Pk))
        for i, p in enumerate(Pk): kd.insert(p, i)
        kd.balance()
        D = np.zeros_like(Q)
        for i in range(len(Q)):
            _, j, _ = kd.find(Q[i]); d = (Q[i] - Pk[j]) @ Nk[j]
            if d < FOLGA: D[i] = Nk[j] * (FOLGA - d)
        mag = np.linalg.norm(D, axis=1); D2 = D.copy()
        for i in range(len(Q)):
            viz = [j for _, j, _ in kq.find_range(Q[i], RAIO)]
            j = viz[int(np.argmax(mag[viz]))]
            if mag[j] > mag[i]: D2[i] = D[j]
        Q = Q + D2
        print(f"COLISAO {ob.name} x {col.name}: {int((mag > 0).sum())} pontos empurrados, {int((np.linalg.norm(D2, axis=1) > 0).sum())} com a vizinhança")
    # pesos: média dos 4 pontos de pele mais perto (pose atual do corpo)
    Pk, _ = mundo(corpo, avaliado=True)
    lados = {}
    for sx in (1, -1):   # cada lado da roupa só copia peso do mesmo lado do corpo (a perna não pega peso da outra)
        idx = np.nonzero(Pk[:, 0] * sx > -0.02)[0]; k_ = KDTree(len(idx))
        for t_, i in enumerate(idx): k_.insert(Pk[i], t_)
        k_.balance(); lados[sx] = (k_, idx)
    nomes = {g.index: g.name for g in corpo.vertex_groups}
    pesos_corpo = [{nomes[g.group]: g.weight for g in v.groups} for v in corpo.data.vertices]
    W = []
    for i_, q in enumerate(Q):
        soma = {}; tot = 0
        r_ = rot[i_] if rot is not None and rot[i_] else (1 if q[0] >= 0 else -1)
        k_, idx = lados[r_]
        for _, t_, d in k_.find_n(q, 4):
            j = idx[t_]; f = 1 / (d + 0.003); tot += f
            for g, w in pesos_corpo[j].items(): soma[g] = soma.get(g, 0) + f * w
        s = sum(soma.values()) or 1
        W.append({g: w / s for g, w in soma.items() if w / s > 0.01})
    return Q, W


def suavizar_pesos(ob, W, vezes=int(os.environ.get("VESTIR_SUAVIZA", "8"))):
    """média dos pesos com os vizinhos na própria malha da roupa: tira saltos (ponta espetada, furo no movimento)"""
    ossos_ = sorted({g for w in W for g in w}); col = {g: i for i, g in enumerate(ossos_)}
    M = np.zeros((len(W), len(ossos_)))
    for i, w in enumerate(W):
        for g, x in w.items(): M[i, col[g]] = x
    # costuras de textura duplicam vértices no mesmo lugar: junta-os num ponto só (senão a costura rasga)
    co = np.empty(len(ob.data.vertices) * 3); ob.data.vertices.foreach_get("co", co)
    chave = np.round(co.reshape(-1, 3) / 1e-5).astype(np.int64)
    _, uid = np.unique(chave, axis=0, return_inverse=True); uid = uid.ravel(); nu = uid.max() + 1
    Mu = np.zeros((nu, M.shape[1])); np.add.at(Mu, uid, M); Mu /= np.bincount(uid, minlength=nu)[:, None]
    e = np.empty(len(ob.data.edges) * 2, dtype=np.int64); ob.data.edges.foreach_get("vertices", e); e = uid[e.reshape(-1, 2)]
    e = e[e[:, 0] != e[:, 1]]
    grau = np.bincount(e.ravel(), minlength=nu).astype(float)
    for _ in range(vezes):
        soma = np.zeros_like(Mu); np.add.at(soma, e[:, 0], Mu[e[:, 1]]); np.add.at(soma, e[:, 1], Mu[e[:, 0]])
        viz = np.where(grau[:, None] > 0, soma / np.maximum(grau, 1)[:, None], Mu)
        Mu = 0.5 * Mu + 0.5 * viz
    Mu /= Mu.sum(1, keepdims=True).clip(1e-9); M = Mu[uid]
    return [{ossos_[j]: float(M[i, j]) for j in np.nonzero(M[i] > 0.01)[0]} for i in range(len(W))]


def pesos_no_eixo(Q, W, rot, zg, joelho=0.05, transicao=0.08):
    """perna larga: o ponto de pele mais perto é ambíguo longe do corpo (atrás do joelho a barra dá laço).
    Na perna da calça o peso vem da altura ao longo da perna: coxa, transição no joelho, canela; a barra
    não segue o pé. Logo abaixo do gancho mistura com o peso copiado da pele (quadril)."""
    if zg is None: return W
    W = list(W)
    for i, (q, r) in enumerate(zip(Q, rot)):
        if not r: continue
        lado = "Left" if r > 0 else "Right"; zk = osso(lado + "Leg")[2]
        t = np.clip((zk + joelho - q[2]) / (2 * joelho), 0, 1)   # 0 coxa, 1 canela
        eixo = {f"mixamorig:{lado}UpLeg": 1 - t, f"mixamorig:{lado}Leg": t}
        f = np.clip((zg - q[2]) / transicao, 0, 1)   # 0 no gancho (pele), 1 abaixo (eixo)
        w = {g: x * (1 - f) for g, x in W[i].items()}
        for g, x in eixo.items(): w[g] = w.get(g, 0) + x * f
        s_ = sum(w.values()); W[i] = {g: x / s_ for g, x in w.items() if x / s_ > 0.01}
    return W


def parear_paredes(Q, W, raio=0.012):
    """fora e avesso a milímetros andam juntos: média dos pesos com tudo o que está a menos de RAIO"""
    kd = KDTree(len(Q))
    for i, p in enumerate(Q): kd.insert(p, i)
    kd.balance(); novo = []
    for i, q in enumerate(Q):
        soma = {}; viz = kd.find_range(q, raio)
        for _, j, _ in viz:
            for g, x in W[j].items(): soma[g] = soma.get(g, 0) + x / len(viz)
        s_ = sum(soma.values()); novo.append({g: x / s_ for g, x in soma.items() if x / s_ > 0.01})
    return novo


def desfazer_pose(Q, W):
    """pose -> repouso: v_rep = (soma w_b S_b)^-1 v_pose, S_b = pose_b @ repouso_b^-1 (espaço do esqueleto)"""
    S = {pb.name: np.array(pb.matrix @ rig.data.bones[pb.name].matrix_local.inverted()) for pb in rig.pose.bones}
    R = np.empty_like(Q)
    for i, (q, w) in enumerate(zip(Q, W)):
        M = sum((S[g] * x for g, x in w.items() if g in S), np.zeros((4, 4)))
        if abs(np.linalg.det(M[:3, :3])) < 1e-6: R[i] = q; continue
        R[i] = (np.linalg.inv(M) @ np.append(q, 1))[:3]
    return R


def prender(ob, Q, W):
    ob.data.vertices.foreach_set("co", Q.ravel()); ob.data.update()
    ob.vertex_groups.clear(); grupos = {}
    for i, w in enumerate(W):
        for g, x in w.items():
            if g not in grupos: grupos[g] = ob.vertex_groups.new(name=g)
            grupos[g].add([i], x, "REPLACE")
    ob.parent = rig; ob.matrix_parent_inverse = rig.matrix_world.inverted()
    md = ob.modifiers.new("Armature", "ARMATURE"); md.object = rig


feitas = {}
z_quadril = osso("Hips")[2]; z_pescoco = osso("Neck")[2]
for nome, arq in sorted(PECAS, key=lambda p: 0 if p[0] == "calca" else 1):   # calça primeiro: a camisa vai por cima
    ob = importar(arq, nome); Q = mundo(ob)
    if nome == "calca":
        # largura do quadril do corpo x largura da cintura/quadril da peça; o cós fica um pouco acima do quadril
        w_c, c_c = meia_largura(z_quadril - 0.03, 0.02, xmax=0.25)
        zt = Q[:, 2].max(); faixa = Q[np.abs(Q[:, 2] - (zt - 0.12 * np.ptp(Q[:, 2]))) < 0.02 * np.ptp(Q[:, 2])]
        w_p = (faixa[:, 0].max() - faixa[:, 0].min()) / 2
        s = w_c * F_QUADRIL / w_p
        Q = (Q - np.array([faixa[:, 0].mean(), faixa[:, 1].mean(), zt])) * s
        Q += np.array([c_c[0], c_c[1], z_quadril + 0.06])
        # gancho: o da calça sobe até logo abaixo do gancho do corpo (gancho baixo vira saia entre as pernas)
        ob.data.vertices.foreach_set("co", Q.ravel()); ob.data.update()
        _, zg = pernas(ob, Q); _, zg_c = pernas(corpo, Pc)
        if zg is not None and zg_c is not None and zg < zg_c - GANCHO:
            alvo = zg_c - GANCHO; zmin, ztop = Q[:, 2].min(), Q[:, 2].max(); z = Q[:, 2]
            Q[:, 2] = np.where(z <= zg, zmin + (z - zmin) * (alvo - zmin) / (zg - zmin), ztop - (ztop - z) * (ztop - alvo) / (ztop - zg))
            print(f"GANCHO sobe {zg:.3f} -> {alvo:.3f} (corpo {zg_c:.3f})")
        # pernas: centro de cada perna da calça na altura do joelho -> perto do joelho do corpo (PUXA da diferença)
        zj = osso("LeftLeg")[2]; xj = abs(osso("LeftLeg")[0])
        perna = Q[np.abs(Q[:, 2] - zj) < 0.03]
        if len(perna):
            xp = np.mean([perna[perna[:, 0] > 0][:, 0].mean(), -perna[perna[:, 0] < 0][:, 0].mean()])
            f_ = np.clip((z_quadril - Q[:, 2]) / max(z_quadril - zj, 1e-3), 0, 1)   # 0 no quadril, 1 do joelho para baixo
            Q[:, 0] += np.sign(Q[:, 0]) * (xj - xp) * f_ * PUXA
            print(f"PERNAS calça {xp:.3f} -> corpo {xj:.3f}")
        ob.data.vertices.foreach_set("co", Q.ravel()); ob.data.update()
        rot, zg = pernas(ob, Q); Q = apertar_pernas(Q, rot)
        ob.data.vertices.foreach_set("co", Q.ravel()); ob.data.update()
        Q, W = pesos_e_colisao(ob, [corpo], rot)
        W = pesos_no_eixo(Q, W, rot, zg); W = suavizar_pesos(ob, W); W = parear_paredes(Q, W)
        prender(ob, Q, W)
    else:
        # camisa: largura do peito; gola no pescoço; mangas no ângulo dos braços
        z_peito = osso("Spine2")[2]
        w_c, c_c = meia_largura(z_peito, 0.02, xmax=0.2)
        zt = Q[:, 2].max(); h = np.ptp(Q[:, 2])
        tronco = Q[np.abs(Q[:, 2] - (zt - 0.35 * h)) < 0.03 * h]
        # meia largura do tronco perto da barra: a única altura sem manga (a manga caída entra em qualquer faixa acima)
        barra = Q[np.abs(Q[:, 2] - (zt - 0.85 * h)) < 0.03 * h]; w_p = np.abs(barra[:, 0]).max()
        s = w_c * F_PEITO / w_p
        Q = (Q - np.array([0.0, tronco[:, 1].mean(), zt])) * s
        Q += np.array([c_c[0], c_c[1], z_pescoco + 0.035])
        # ângulo da manga (abaixo da horizontal), medido nos pontos de fora do tronco
        angs = []
        zq_t = Q[:, 2].max(); hq = np.ptp(Q[:, 2])
        for sx in (1, -1):   # reta do ombro da camisa até o centro da boca da manga
            lado_q = Q[Q[:, 0] * sx > 0]
            xmax = np.abs(lado_q[:, 0]).max()
            boca = lado_q[np.abs(lado_q[:, 0]) > xmax - 0.03]
            ombro = np.array([w_c * 1.12 * sx, zq_t - 0.08 * hq])
            dx, dz = abs(boca[:, 0].mean() - ombro[0]), ombro[1] - boca[:, 2].mean()
            angs.append(math.degrees(math.atan2(dz, dx))); print("  manga", "esq" if sx > 0 else "dir", round(angs[-1], 1))
        theta = float(np.mean(angs)) if angs else 0.0
        print(f"MANGA {theta:.1f} graus abaixo da horizontal")
        ob.data.vertices.foreach_set("co", Q.ravel()); ob.data.update()
        # inclina os braços do corpo no ângulo da manga (só o osso do braço; o resto segue)
        bpy.context.view_layer.objects.active = rig; bpy.ops.object.mode_set(mode="POSE")
        for lado, sx in (("Left", 1), ("Right", -1)):
            pb = rig.pose.bones["mixamorig:" + lado + "Arm"]; bpy.context.view_layer.update()
            mw = rig.matrix_world @ pb.matrix
            pb.matrix = rig.matrix_world.inverted() @ (Matrix.Translation(mw.to_translation()) @ Matrix.Rotation(math.radians(theta * sx), 4, "Y") @ mw.to_3x3().to_4x4())
        bpy.context.view_layer.update(); bpy.ops.object.mode_set(mode="OBJECT")
        Q, W = pesos_e_colisao(ob, [corpo] + ([feitas["calca"]] if "calca" in feitas else []))
        # tronco da camisa não segue o braço: só é manga o que está além do ombro, ao longo do osso do braço
        bpy.context.view_layer.update()
        braco_ossos = ("Arm", "ForeArm", "Hand")
        for lado in ("Left", "Right"):
            pb = rig.pose.bones["mixamorig:" + lado + "Arm"]
            h_ = np.array(rig.matrix_world @ pb.head); t_ = np.array(rig.matrix_world @ pb.tail)
            ax = (t_ - h_) / np.linalg.norm(t_ - h_)
            for i, q in enumerate(Q):
                tt = (q - h_) @ ax; perp = np.linalg.norm((q - h_) - tt * ax)
                eh_manga = tt > 0.02 and perp < 0.09
                if not eh_manga:
                    w = {g: x for g, x in W[i].items() if not any(g == f"mixamorig:{lado}{b_}" for b_ in braco_ossos)}
                    if w:
                        s_ = sum(w.values()); W[i] = {g: x / s_ for g, x in w.items()}
        W = suavizar_pesos(ob, W); W = parear_paredes(Q, W, 0.006)   # raio curto: a manga encosta no tronco na axila
        Q = desfazer_pose(Q, W)
        for pb in rig.pose.bones: pb.matrix_basis = Matrix.Identity(4)
        bpy.context.view_layer.update()
        prender(ob, Q, W)
    print(f"PECA {nome}: escala {s:.3f}, {len(ob.data.vertices)} pontos")
    feitas[nome] = ob

bpy.ops.wm.save_as_mainfile(filepath=f"{SAIDA}.blend")
for o in cena.objects: o.select_set(o == rig or (o.type == "MESH" and o.parent == rig))
bpy.ops.export_scene.gltf(filepath=f"{SAIDA}.glb", export_format="GLB", use_selection=True, export_image_format="JPEG")
print("PRONTO vestir")
