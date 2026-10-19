# KAN-70: quanto cada parte da cena custa no quadro do WebGPU (ou WebGL), por mínimos quadrados.
# 12 fatores liga/desliga num desenho de Hadamard de 32 linhas (colunas ortogonais: o ajuste de mínimos
# quadrados vira a diferença de médias de cada coluna), repetido 2 vezes em ordem embaralhada. Cada linha: 1 s
# para assentar e 3 s medindo o intervalo entre quadros (requestAnimationFrame) e o tempo do desenho (pos.render).
# Uso na g4dn (precisa de comparar_blocos.py em /tmp, de onde vêm modo() e js()):
#   scp medir_fatores.py comparar_blocos.py ubuntu@IP:/tmp/ && ssh ... python3 /tmp/medir_fatores.py webgpu
import json, sys, random, time
exec(open('/tmp/comparar_blocos.py').read().split('ESCONDER =')[0].split('saida = ')[0])
R = sys.argv[1] if len(sys.argv) > 1 else "webgpu"
FATORES = ["arvores", "casasLonge", "casas1932", "rua", "terreno", "grama", "gente", "sombra", "mar", "toqueAreia", "oclusao", "fisica"]
PREPARO = """(() => {
  const m = maresia, cena = m.cena
  const nomes = (lista) => { const s = new Set(lista); const out = []; cena.traverse(o => { if (s.has(o.name)) out.push(o) }); return out }
  const pele = []; cena.traverse(o => { if (o.isSkinnedMesh) pele.push(o) })
  const vis = (lista) => (on) => lista.forEach(o => { o.visible = on })
  const grupos = {
    arvores: nomes(['cajueiro','carnauba','mangue','murici','guajiru','oiti','buganvilias','vasos','coqueiros','copas']),
    casasLonge: nomes(['casario-longe','favela-longe']),
    casas1932: nomes(['casas-1932','casas-de-palha','cercas']),
    rua: [...nomes(['postes','fios','bancos','lixeiras','carrinhos','cocos','roupas','lampioes','lampioes-vidro','cadeiras'])].concat((() => { const a = []; cena.traverse(o => { if (o.name && o.name.startsWith('fatia-')) a.push(o) }); return a })()),
    terreno: nomes(['terreno']),
    grama: nomes(['grama']),
    gente: nomes(['pessoas']).concat(pele),
    mar: nomes(['mar']),
  }
  const sombra = []; cena.traverse(o => { if (o.castShadow) sombra.push(o) })
  const toqueAt = m.toque.atualizar, areiaAt = m.areia.atualizar, fisAt = m.fisica.atualizar
  const oclusao = m.cfg.estilo.oclusao
  const f = {}
  for (const k in grupos) f[k] = vis(grupos[k])
  f.sombra = (on) => sombra.forEach(o => { o.castShadow = on })
  f.toqueAreia = (on) => { m.toque.atualizar = on ? toqueAt : () => {}; m.areia.atualizar = on ? areiaAt : () => {} }
  f.oclusao = (on) => { m.cfg.estilo.oclusao = on ? (oclusao || 0.3) : 0 }
  f.fisica = (on) => { m.fisica.atualizar = on ? fisAt : () => {} }
  window.__fat = f
  // o laço do jogo chama o passo por dentro (não por maresia.passo); o desenho passa por pos.render
  const render = m.pos.render
  window.__tp = []
  m.pos.render = function (...a) { const t = performance.now(); try { return render.apply(this, a) } finally { window.__tp.push(performance.now() - t) } }
  return Object.fromEntries(Object.entries(grupos).map(([k, v]) => [k, v.length]).concat([['sombra', sombra.length]]))
})()"""
MEDIR = """(async (lin) => {
  for (const k in lin) window.__fat[k](lin[k] === 1)
  await new Promise(r => setTimeout(r, 1000))
  window.__tp.length = 0
  const ts = []; let vivo = true, ant = performance.now()
  const f = (t) => { if (!vivo) return; ts.push(t - ant); ant = t; requestAnimationFrame(f) }
  requestAnimationFrame((t) => { ant = t; requestAnimationFrame(f) })
  await new Promise(r => setTimeout(r, 3000)); vivo = false
  ts.sort((a, b) => a - b); const tp = [...window.__tp].sort((a, b) => a - b)
  return { msQuadro: ts.reduce((s, x) => s + x, 0) / Math.max(1, ts.length), mediana: ts[ts.length >> 1], msDesenho: tp[tp.length >> 1] || 0 }
})(%s)"""
def hadamard(n):
    H = [[1]]
    while len(H) < n:
        H = [r + r for r in H] + [r + [-x for x in r] for r in H]
    return H
H = hadamard(32)
linhas = [[1 if H[i][j + 1] > 0 else 0 for j in range(len(FATORES))] for i in range(32)]
modo(R)
time.sleep(3)
contagem = js(PREPARO)
print("objetos por fator", json.dumps(contagem), flush=True)
random.seed(70)
ordem = [(rep, i) for rep in range(2) for i in range(32)]
random.shuffle(ordem)
res = []
for rep, i in ordem:
    lin = dict(zip(FATORES, linhas[i]))
    y = js(MEDIR % json.dumps(lin))
    res.append((linhas[i], y))
    print(rep, i, json.dumps(y), flush=True)
js("(() => { for (const k in window.__fat) window.__fat[k](true) })()")
for medida in ("msQuadro", "msDesenho"):
    ys = [y[medida] for _, y in res]
    base = sum(ys) / len(ys)
    efeitos = {}
    for j, nome in enumerate(FATORES):
        on = [y[medida] for x, y in res if x[j] == 1]
        off = [y[medida] for x, y in res if x[j] == 0]
        efeitos[nome] = sum(on) / len(on) - sum(off) / len(off)
    # intercepto = tudo desligado
    b0 = base - sum(e / 2 for e in efeitos.values())
    pred = [b0 + sum(efeitos[f] * x[j] for j, f in enumerate(FATORES)) for x, _ in res]
    resid = [y - p for y, p in zip(ys, pred)]
    rmse = (sum(r * r for r in resid) / len(resid)) ** 0.5
    sst = sum((y - base) ** 2 for y in ys)
    r2 = 1 - sum(r * r for r in resid) / sst if sst else 0
    print(f"\n== {R} {medida}: base (tudo desligado) {b0:.2f} ms, tudo ligado {b0 + sum(efeitos.values()):.2f} ms, R2 {r2:.2f}, erro {rmse:.2f} ms", flush=True)
    for nome_f, e in sorted(efeitos.items(), key=lambda kv: -kv[1]):
        k = contagem.get(nome_f)
        print(f"  {nome_f:12s} {e:7.2f} ms" + (f"   ({k} objetos, {1000 * e / k:.0f} us cada)" if k else ""), flush=True)
modo("webgl")
