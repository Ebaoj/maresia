# Fecha os furos das cabeças de gato do Meshy (remalha automática deixa buracos em franja de pelo e beirada de orelha):
#  - pega a malha principal (a de mais faces; o importador às vezes traz um cubo a mais);
#  - junta vértices coincidentes (o UV mora no canto da face, então a costura de UV não se perde);
#  - apaga ciscos soltos (peças com menos de FECHAR_ILHA da maior) e as faces de arestas com mais de 2 faces;
#  - acerta o sentido das faces (as do avesso aparecem como furo com face de trás escondida);
#  - preenche buracos de até FECHAR_MAX arestas (contorno achado na mão, leque a partir de um vértice no centro;
#    o holes_fill do bmesh pulava furos e a triangulação por diagonal criava aresta não-manifold); a face nova recebe o UV dos vizinhos da borda quando a borda
#    está numa ilha só de UV, e cor chapada do vizinho quando a borda cruza costura (evita mancha esticada);
#  - mede antes e depois (buracos, maior buraco, arestas não-manifold, peças soltas, faces) com o mesmo critério;
#  - exporta modelo-fechado.glb ao lado do original (que não é tocado) e renderiza 4 ângulos com fundo magenta
#    só para a câmera e face de trás escondida: furo aparece rosa.
# Uso: Blender -b --python blender/fechar_furos.py -- [NOME ...]   (sem nome: as 6 cabeças)
#   FECHAR_BASE (arte/finais/gato-cabecas)  FECHAR_MAX (120; com 40 sobravam 1 ou 2 furos de 39 a 57 arestas por cabeça)  FECHAR_ILHA (0.01)  FECHAR_JUNTA (1e-6)
#   FECHAR_RES (480, lado de cada vista)  FECHAR_SO_MEDIR (0; com FECHAR_VER_ENTRADA=1 também renderiza a entrada)  FECHAR_ENTRADA (modelo.glb; use modelo-fechado.glb para remedir)
import bpy, bmesh, sys, os, math, json
from statistics import median
from mathutils import Vector

a = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
BASE = os.path.expanduser(os.environ.get("FECHAR_BASE", "~/Projetos/maresia/arte/finais/gato-cabecas"))
NOMES = a or ["cabeca-1-neutra", "cabeca-3-olhos-fechados", "cabeca-4-susto", "cabeca-5-miando", "cabeca-6-lambendo", "cabeca-7-chiando"]
MAXL = int(os.environ.get("FECHAR_MAX", "120"))
ILHA = float(os.environ.get("FECHAR_ILHA", "0.01"))
JUNTA = float(os.environ.get("FECHAR_JUNTA", "1e-6"))
RES = int(os.environ.get("FECHAR_RES", "480"))
SO_MEDIR = os.environ.get("FECHAR_SO_MEDIR", "0") == "1"
ENTRADA = os.environ.get("FECHAR_ENTRADA", "modelo.glb")


def ilhas(bm):
    """Peças ligadas por aresta (lista de listas de faces), maior primeiro."""
    vis, res = set(), []
    for f in bm.faces:
        if f in vis: continue
        pilha, comp = [f], []; vis.add(f)
        while pilha:
            x = pilha.pop(); comp.append(x)
            for e in x.edges:
                for y in e.link_faces:
                    if y not in vis: vis.add(y); pilha.append(y)
        res.append(comp)
    return sorted(res, key=len, reverse=True)


def lacos_borda(bm):
    """Buracos = componentes ligados de arestas de borda (aresta com uma face só)."""
    borda = [e for e in bm.edges if len(e.link_faces) == 1]
    por_v = {}
    for e in borda:
        for v in e.verts: por_v.setdefault(v, []).append(e)
    vis, res = set(), []
    for e in borda:
        if e in vis: continue
        pilha, n = [e], 0; vis.add(e)
        while pilha:
            x = pilha.pop(); n += 1
            for v in x.verts:
                for y in por_v[v]:
                    if y not in vis: vis.add(y); pilha.append(y)
        res.append(n)
    return sorted(res, reverse=True)


def invertidas(bm):
    """Arestas com duas faces que a percorrem no mesmo sentido: uma das faces está virada do avesso."""
    n = 0
    for e in bm.edges:
        if len(e.link_faces) == 2:
            fa, fb = e.link_faces
            la = next(l for l in fa.loops if l.edge == e); lb = next(l for l in fb.loops if l.edge == e)
            n += la.vert == lb.vert
    return n


def medir(me):
    """Mede numa cópia: junta coincidentes só para a topologia e conta."""
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=JUNTA)
    lac = lacos_borda(bm); il = ilhas(bm)
    m = {"faces": len(me.polygons), "buracos": len(lac), "maior_buraco": lac[0] if lac else 0,
         "buracos_ate_12": sum(1 for x in lac if x <= 12),
         "nao_manifold": sum(1 for e in bm.edges if len(e.link_faces) > 2),
         "vert_nao_manifold": sum(1 for v in bm.verts if not v.is_manifold),
         "pecas_soltas": len(il) - 1, "maior_cisco": len(il[1]) if len(il) > 1 else 0,
         "arestas_invertidas": invertidas(bm)}
    bm.free(); return m


def ciclos_borda(bm):
    """Contorno de cada buraco, em ordem e já no sentido da face que o fecha. Anda pela borda girando em volta
    de cada vértice pelas faces vizinhas, então dois furos que se tocam num vértice (gravata) saem separados."""
    usados = set()
    for e0 in [e for e in bm.edges if len(e.link_faces) == 1]:
        if e0 in usados: continue
        ciclo, e, ok = [], e0, True
        while True:
            usados.add(e)
            l = next(x for x in e.link_faces[0].loops if x.edge == e)  # a face vai l.vert -> seguinte; o furo, ao contrário
            ciclo.append(l.link_loop_next.vert); u = l.vert
            lp, passos = l.link_loop_prev, 0
            while len(lp.edge.link_faces) != 1:  # gira em volta de u até a próxima aresta de borda
                e2 = lp.edge
                if len(e2.link_faces) != 2 or passos > 200: ok = False; break
                f2 = e2.link_faces[0] if e2.link_faces[1] == lp.face else e2.link_faces[1]
                l2 = next(x for x in f2.loops if x.edge == e2)
                if l2.vert != u: ok = False; break  # orientação incoerente aqui: não arrisca
                lp, passos = l2.link_loop_prev, passos + 1
            if not ok: break
            e = lp.edge
            if e == e0: break
            if e in usados: ok = False; break
        if not ok: FALHAS["giro"] = FALHAS.get("giro", 0) + 1; continue
        yield from partir(ciclo)


def partir(ciclo):
    """Furo que encosta em si mesmo num vértice (8 deitado) vira dois ciclos simples."""
    visto = {}
    for i, v in enumerate(ciclo):
        if v in visto:
            j = visto[v]
            yield from partir(ciclo[j:i]); yield from partir(ciclo[:j] + ciclo[i:]); return
        visto[v] = i
    if len(ciclo) >= 3: yield ciclo


FALHAS = {}


def ciclos_simples(bm):
    """Contorno em que todo vértice tem exatamente 2 arestas de borda, andando pela borda (sem olhar o sentido)."""
    por_v = {}
    for e in bm.edges:
        if len(e.link_faces) == 1:
            for v in e.verts: por_v.setdefault(v, []).append(e)
    vis = set()
    for v0, es in por_v.items():
        if v0 in vis or len(es) != 2: continue
        ciclo, v, e, ok = [v0], v0, es[0], True
        vis.add(v0)
        while True:
            w = e.other_vert(v)
            if w == v0: break
            if len(por_v[w]) != 2 or w in vis: ok = False; break
            vis.add(w); ciclo.append(w)
            e = por_v[w][0] if por_v[w][1] == e else por_v[w][1]; v = w
        if ok and len(ciclo) >= 3: yield ciclo


def orientar(bm):
    """Acerta o sentido das faces mexendo no mínimo: junta as faces em retalhos que já concordam entre si,
    fixa o maior e vira cada retalho vizinho só se ele discorda mais do que concorda com os já fixados.
    (Espalhar a partir de uma face só cria um corte novo e comprido quando a malha não tem um "fora" único,
    como pálpebra fechada colada.) No fim, volume com sinal negativo = peça inteira do avesso. Devolve viradas."""
    def concorda(e):
        fa, fb = e.link_faces
        la = next(x for x in fa.loops if x.edge == e); lb = next(x for x in fb.loops if x.edge == e)
        return la.vert != lb.vert
    retalho, membros = {}, []
    for f in bm.faces:
        if f in retalho: continue
        k = len(membros); retalho[f] = k; pilha, comp = [f], []
        while pilha:
            x = pilha.pop(); comp.append(x)
            for e in x.edges:
                if len(e.link_faces) != 2 or not concorda(e): continue
                g = e.link_faces[0] if e.link_faces[1] == x else e.link_faces[1]
                if g not in retalho: retalho[g] = k; pilha.append(g)
        membros.append(comp)
    # contagem de arestas entre retalhos: (a, b) -> [concordam, discordam]
    viz = {}
    for e in bm.edges:
        if len(e.link_faces) != 2: continue
        a, b = retalho[e.link_faces[0]], retalho[e.link_faces[1]]
        if a == b: continue
        c = concorda(e)
        for x, y in ((a, b), (b, a)):
            viz.setdefault(x, {}).setdefault(y, [0, 0])[0 if c else 1] += 1
    estado = {}  # retalho -> virado?
    import heapq
    for k0 in sorted(range(len(membros)), key=lambda k: -len(membros[k])):
        if k0 in estado: continue
        estado[k0] = False; fila = [(-len(membros[k0]), k0)]
        abertos = set()
        def abrir(k):
            for y in viz.get(k, {}):
                if y not in estado and y not in abertos: abertos.add(y); heapq.heappush(fila, (-len(membros[y]), y))
        abrir(k0)
        while fila:
            _, k = heapq.heappop(fila)
            if k in estado: continue
            sim = nao = 0
            for y, (c, d) in viz.get(k, {}).items():
                if y in estado:
                    if estado[y]: c, d = d, c
                    sim += c; nao += d
            estado[k] = nao > sim; abrir(k)
    viradas = 0
    for k, v in estado.items():
        if v:
            for f in membros[k]: f.normal_flip()
            viradas += len(membros[k])
    for comp in ilhas(bm):
        if sum(f.calc_center_median().dot(f.normal) * f.calc_area() for f in comp) < 0:
            for f in comp: f.normal_flip()
            viradas += len(comp)
    return viradas


def densidade_uv(bm, uv):
    """Mediana de (comprimento no UV / comprimento em 3D) nas arestas das faces: escala do texel."""
    r = []
    for f in bm.faces:
        for l in f.loops:
            d3 = (l.link_loop_next.vert.co - l.vert.co).length
            if d3 > 1e-9: r.append((l.link_loop_next[uv].uv - l[uv].uv).length / d3)
    return median(r)


def consertar(ob):
    me = ob.data
    bm = bmesh.new(); bm.from_mesh(me)
    uv = bm.loops.layers.uv.active
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=JUNTA)
    bm.faces.ensure_lookup_table()
    R = densidade_uv(bm, uv)
    rel = {"apagadas_cisco": 0, "apagadas_nao_manifold": 0, "preenchidos": 0, "uv_continuo": 0, "uv_chapado": 0}

    def limpar_ciscos():
        il = ilhas(bm)
        lixo = [f for comp in il[1:] if len(comp) < ILHA * len(il[0]) for f in comp]
        if lixo: bmesh.ops.delete(bm, geom=lixo, context="FACES")
        soltos = [v for v in bm.verts if not v.link_faces]
        if soltos: bmesh.ops.delete(bm, geom=soltos, context="VERTS")
        rel["apagadas_cisco"] += len(lixo)

    limpar_ciscos()
    for _ in range(6):  # aresta com 3+ faces: apaga as faces dela (vira buraco pequeno, preenchido adiante)
        nm = [e for e in bm.edges if len(e.link_faces) > 2]
        if not nm: break
        fs = list({f for e in nm for f in e.link_faces})
        bmesh.ops.delete(bm, geom=fs, context="FACES"); rel["apagadas_nao_manifold"] += len(fs)
        limpar_ciscos()
    # face degenerada (área zero) atrapalha o preenchimento
    deg = [f for f in bm.faces if f.calc_area() < 1e-12]
    if deg: bmesh.ops.delete(bm, geom=deg, context="FACES")

    # face do avesso: com a malha só de um lado (ou no jogo, sombreada ao contrário) parece furo
    rel["viradas"] = orientar(bm)
    velhas = set(bm.faces)
    # holes_fill do bmesh pula laços simples (20, 13 arestas) quando dois pontos do contorno já se ligam pela malha:
    # fecha cada ciclo na mão
    novas = []
    for ciclo in list(ciclos_borda(bm)):
        if len(ciclo) > MAXL: continue
        try: novas.append(bm.faces.new(ciclo))
        except ValueError: pass  # face igual já existe
    # sobra de contorno onde o giro achou sentido incoerente: se ainda for um ciclo simples, fecha pela ordem da borda
    # (o sentido certo da face sai dos votos logo abaixo)
    for ciclo in list(ciclos_simples(bm)):
        if len(ciclo) > MAXL: continue
        try: novas.append(bm.faces.new(ciclo)); rel["fechados_pela_borda"] = rel.get("fechados_pela_borda", 0) + 1
        except ValueError: pass
    rel["preenchidos"] = len(novas); rel["falhas_contorno"] = dict(FALHAS); FALHAS.clear()
    for f in novas:
        # orientação: a aresta comum com a face vizinha tem de ser percorrida no sentido contrário
        votos = 0
        for l in f.loops:
            viz = [g for g in l.edge.link_faces if g in velhas]
            if not viz: continue
            lv = next(x for x in viz[0].loops if x.edge == l.edge)
            votos += 1 if lv.vert == l.vert else -1
        if votos > 0: f.normal_flip()
        # UV: para cada aresta da borda, a face vizinha dá o UV das duas pontas (par coerente)
        n = len(f.loops); uv_ini, uv_fim = [], []
        for l in f.loops:
            viz = [g for g in l.edge.link_faces if g in velhas]
            if viz:
                lv = {x.vert: x for x in viz[0].loops}
                uv_ini.append(lv[l.vert][uv].uv.copy()); uv_fim.append(lv[l.link_loop_next.vert][uv].uv.copy())
            else:
                uv_ini.append(None); uv_fim.append(None)
        # contínuo = no vértice, o UV que chega pela aresta anterior é o mesmo que sai pela seguinte
        continuo = all(uv_ini[i] is not None and uv_fim[i - 1] is not None and
                       (uv_ini[i] - uv_fim[i - 1]).length < 1e-4 for i in range(n))
        if not continuo: rel["uv_costura"] = rel.get("uv_costura", 0) + 1
        if continuo:
            # nenhuma aresta pode esticar demais no UV (costura disfarçada) e o polígono não pode virar no UV
            for i, l in enumerate(f.loops):
                d3 = (l.link_loop_next.vert.co - l.vert.co).length
                if (uv_fim[i] - uv_ini[i]).length > 4 * R * max(d3, 1e-9): continuo = False; rel["uv_esticado"] = rel.get("uv_esticado", 0) + 1; break
        if continuo:
            for i, l in enumerate(f.loops): l[uv].uv = uv_ini[i]
            rel["uv_continuo"] += 1
        else:
            # cor chapada: UV do meio da maior sequência coerente da borda (sem atravessar costura)
            seqs, atual = [], []
            for i in range(n):
                if uv_ini[i] is None: continue
                if atual and (uv_fim[i - 1] is None or (uv_ini[i] - uv_fim[i - 1]).length >= 1e-4): seqs.append(atual); atual = []
                atual.append(uv_ini[i])
            if atual: seqs.append(atual)
            maior = max(seqs, key=len) if seqs else [Vector((0.5, 0.5))]
            ref = maior[len(maior) // 2]
            for l in f.loops: l[uv].uv = ref
            rel["uv_chapado"] += 1
        f.smooth = True
        viz = [g for e in f.edges for g in e.link_faces if g in velhas]
        if viz: f.material_index = viz[0].material_index
    # leque a partir de um vértice no centro: triangular por diagonais cria aresta repetida quando dois pontos
    # do contorno já são ligados pela malha em volta (furo em fenda), e isso vira não-manifold
    centros = bmesh.ops.poke(bm, faces=[f for f in novas if len(f.verts) > 3])["verts"]
    for c in centros:
        outros = [l2[uv].uv for f in c.link_faces for l2 in f.loops if l2.vert != c]
        media = sum(outros, Vector((0, 0))) / len(outros)
        for f in c.link_faces:
            f.smooth = True
            for l2 in f.loops:
                if l2.vert == c: l2[uv].uv = media
    rel["viradas_fim"] = orientar(bm)  # de novo, agora com a malha fechada
    rel["sobra_furos"] = lacos_borda(bm)[:12]
    for f in bm.faces: f.smooth = True
    bm.to_mesh(me); bm.free()
    # normais próprias do glTF não cobrem as faces novas: volta para normal suave calculada
    for nome in ("custom_normal", "sharp_edge", "sharp_face"):
        if nome in me.attributes: me.attributes.remove(me.attributes[nome])
    me.update()
    return rel


def cena_conferencia(ob, saida):
    cena = bpy.context.scene
    cena.view_settings.view_transform = "Standard"  # magenta puro, sem o AgX desbotar
    cena.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items] else "BLENDER_EEVEE"
    for m in ob.data.materials:
        if m: m.use_backface_culling = True  # olhar pelo furo atravessa o lado de dentro: aparece o fundo
    cena.world = cena.world or bpy.data.worlds.new("w"); cena.world.use_nodes = True
    nt = cena.world.node_tree; nt.nodes.clear()
    luz = nt.nodes.new("ShaderNodeBackground"); luz.inputs[0].default_value = (0.75, 0.74, 0.71, 1)
    fundo = nt.nodes.new("ShaderNodeBackground"); fundo.inputs[0].default_value = (1, 0, 1, 1)
    lp = nt.nodes.new("ShaderNodeLightPath"); mix = nt.nodes.new("ShaderNodeMixShader"); sw = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(lp.outputs["Is Camera Ray"], mix.inputs[0]); nt.links.new(luz.outputs[0], mix.inputs[1])
    nt.links.new(fundo.outputs[0], mix.inputs[2]); nt.links.new(mix.outputs[0], sw.inputs["Surface"])
    sol = bpy.data.objects.new("sol", bpy.data.lights.new("sol", "SUN")); cena.collection.objects.link(sol)
    sol.rotation_euler = (math.radians(50), 0, math.radians(30)); sol.data.energy = 3
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); cena.collection.objects.link(cam); cena.camera = cam
    cs = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    centro = sum(cs, Vector()) / 8; tam = max((max(c[i] for c in cs) - min(c[i] for c in cs)) for i in range(3))
    cam.data.type = "ORTHO"; cam.data.ortho_scale = tam * 1.1; cam.data.clip_end = 100
    cena.render.resolution_x = cena.render.resolution_y = RES
    feitos = []
    for nome, ang in (("frente", 0), ("tres-quartos", 45), ("lado", 90), ("costas", 180)):
        r = math.radians(ang)
        cam.location = (centro.x + 10 * math.sin(r), centro.y - 10 * math.cos(r), centro.z); cam.rotation_euler = (math.pi / 2, 0, r)
        cena.render.filepath = f"{saida}-{nome}.png"; bpy.ops.render.render(write_still=True); feitos.append(cena.render.filepath)
    return feitos


tabela = {}
for nome in NOMES:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    pasta = os.path.join(BASE, nome)
    bpy.ops.import_scene.gltf(filepath=os.path.join(pasta, ENTRADA))
    malhas = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    ob = max(malhas, key=lambda o: len(o.data.polygons))
    for o in list(bpy.context.scene.objects):
        if o != ob and o.type in ("MESH", "EMPTY") and o not in ob.children_recursive and o != ob.parent:
            bpy.data.objects.remove(o)
    antes = medir(ob.data)
    print("ANTES", nome, json.dumps(antes))
    if SO_MEDIR:
        tabela[nome] = {"antes": antes}
        if os.environ.get("FECHAR_VER_ENTRADA") == "1":  # vistas do arquivo de entrada, sem conserto, para comparar
            cena_conferencia(ob, os.path.join(BASE, "_conferencia", nome + "-entrada"))
        continue
    rel = consertar(ob)
    depois = medir(ob.data)
    print("DEPOIS", nome, json.dumps(depois), json.dumps(rel))
    tabela[nome] = {"antes": antes, "depois": depois, "conserto": rel}
    for o in bpy.context.scene.objects: o.select_set(o == ob)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.export_scene.gltf(filepath=os.path.join(pasta, "modelo-fechado.glb"), export_format="GLB", use_selection=True,
                              export_apply=False, export_image_format="AUTO")
    tabela[nome]["vistas"] = cena_conferencia(ob, os.path.join(BASE, "_conferencia", nome))
    with open(os.path.join(pasta, "modelo-fechado-medidas.json"), "w") as fp: json.dump(tabela[nome], fp, indent=1)
print("TABELA", json.dumps(tabela))
print("PRONTO fechar_furos", len(tabela))
