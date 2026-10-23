// Medições do trabalho "fluido" (22/10/2026, docs/fluido-22-10.md), carregadas DENTRO da página pelo
// scripts/fluido.mjs (import('/scripts/fluido-pagina.js'), o Vite serve a pasta). Só leitura do jogo: nada aqui
// muda o código do jogo, só o cfg (desfeito no fim) e ganchos de contagem.
//
// - lugares(): os 4 lugares da meta (Coluna da Hora, Praça dos Leões, rua do Centro, Campo do Urubu)
// - perfil(): custo de GPU de cada passe (cronômetro do WebGPU, timestamp-query), por lugar
// - medir(): maresia.medir com variantes como remendos do cfg, alternadas
// - andar(): o laço real do jogo andando por uma rota; tempos de quadro, percentis e tropeços (> 50 ms)

const m = () => window.maresia

// remendo do cfg: { 'estilo.estabilizar': 0 }; devolve a função que desfaz
export function remendar(patch = {}) {
  const cfg = m().cfg
  const antes = []
  for (const [k, v] of Object.entries(patch)) {
    const p = k.split('.')
    let o = cfg
    while (p.length > 1) o = o[p.shift()]
    antes.push([o, p[0], o[p[0]]])
    o[p[0]] = v
  }
  return () => { for (const [o, k, v] of antes.reverse()) o[k] = v }
}

export async function lugares() {
  const { VISTAS } = await import('/src/mundo/marcos1932/vistas.js')
  const { VISTAS_URUBU } = await import('/src/mundo/urubu-lugares.js')
  const fort = await import('/src/mundo/fortaleza1932.js')
  void fort
  // a rua do Centro: a rua da grade (sentido v, o da Major Facundo) com o trecho de rua mais longo ao norte da praça,
  // a 220 m da praça olhando para ela: a fileira de casas dos dois lados e o centro ao fundo
  const rua = await (async () => {
    if (window.__ruaFluido) return window.__ruaFluido
    const { tipoChao1932, CHAO_RUA } = await import('/src/mundo/chao1932.js')
    const { naGrade } = await import('/src/mundo/marcos1932/grade.js')
    const { CENTRO } = await import('/src/mundo/praca1932.js')
    let melhor = [0, -1]
    for (let u = -160; u <= 160; u += 1) {
      let n = 0
      for (let v = -320; v <= -120; v += 2) { const [x, z] = naGrade(CENTRO, u, v); if (tipoChao1932(x, z) === CHAO_RUA) n++ }
      if (n > melhor[1]) melhor = [u, n]
    }
    const [x, z] = naGrade(CENTRO, melhor[0], -220)
    const [tx, tz] = naGrade(CENTRO, melhor[0], -100)
    window.__ruaFluido = { x, z, yaw: Math.atan2(-(tx - x), -(tz - z)), hora: 16.5, pitch: 0.1, u: melhor[0], cobertura: melhor[1] / 101 }
    return window.__ruaFluido
  })()
  return {
    coluna: { ...VISTAS.colunaHora, pitch: 0.1 },
    leoes: { ...VISTAS.leoes, pitch: 0.1 },
    rua,
    campo: { ...VISTAS_URUBU.urubuCozinha, hora: 9.5 },
    // só para as fotos: a Coluna vista do alto (câmera a 45 m, com cfg camera.distancia), onde o longe aparece
    colunaAlto: { ...VISTAS.colunaHora, pitch: 0.45 },
  }
}

export async function ir(nome, { passos = 40, distancia = null } = {}) {
  const L = await lugares()
  const v = L[nome]
  const g = m()
  g.cfg.fatia.travar = false
  g.irPara(v.x, v.z, v.yaw, v.hora)
  if (v.pitch != null) g.cam.pitch = v.pitch
  if (distancia != null) g.cfg.camera.distancia = distancia
  for (let i = 0; i < passos; i++) passoQuadro()
  return v
}

// um passo com o quadro do WebGPU andando (como o medidor): a sombra e o que é "por quadro" entram
export function passoQuadro(dt = 1 / 60, desenhar = true) {
  const g = m()
  if (g.webgpu) g.renderer._nodes.nodeFrame.update()
  g.passo(dt, desenhar)
}

// ---------------------------------------------------------------- perfil de GPU por passe
let ganchos = null
function instalarGanchos() {
  if (ganchos) return ganchos
  const g = m()
  const be = g.renderer.backend
  if (!be.device || !be.device.features.has('timestamp-query')) return null
  be.trackTimestamp = true
  const rotulos = new Map()
  const nomes = new Map()
  const pos = g.pos
  const nomear = (mat, nome) => { if (mat && mat.isMaterial) nomes.set(mat, nome) }
  const varrer = () => {
    nomear(pos.matOclusao, 'oclusao (1/2)')
    nomear(pos.matClaro, 'brilho: limiar (1/4)')
    ;(pos.matDesfoque || []).forEach((mt) => nomear(mt, 'brilho: desfoque x4 (1/4)'))
    nomear(pos.matTensor, 'pincel: tensor (1/2)')
    for (const mt of Object.values(pos.matsKuwahara || {})) nomear(mt, 'pincel: kuwahara')
    nomear(pos.matTela, 'tela: quadrinho final')
    if (pos.estab) for (const v of Object.values(pos.estab)) nomear(v, 'estabilizar')
    if (pos.dof) for (const v of Object.values(pos.dof)) nomear(v, 'profundidade de campo')
  }
  let atual = null
  const passo = pos.passo
  pos.passo = function (material, alvo) {
    if (!nomes.has(material)) varrer()
    atual = nomes.get(material) || 'pós (outro)'
    try { return passo.call(this, material, alvo) } finally { atual = null }
  }
  let ctx = null
  const begin = be.beginRender
  be.beginRender = function (rc) { ctx = rc; return begin.call(this, rc) }
  const init = be.initTimestampQuery
  const sol = g.cacheSombra.sol
  const perto = g.sombraPerto.luz
  be.initTimestampQuery = function (type, uid, desc) {
    init.call(this, type, uid, desc)
    let r = atual
    if (!r && ctx) {
      const rt = ctx.renderTarget
      if (rt && rt === pos.rtCor) r = 'cena (MRT cor + luz)'
      else if (ctx.camera === sol.shadow.camera) r = rt && rt === g.cacheSombra.alvoEstatico ? 'sombra sol: refazer parados' : 'sombra sol: dinâmicos'
      else if (ctx.camera === perto.shadow.camera) r = 'sombra perto'
      else r = `outro ${rt ? (rt.texture?.name || '') + ' ' + ctx.width + 'x' + ctx.height : 'tela'}`
    }
    rotulos.set(uid, r || 'sem rótulo')
  }
  ganchos = { be, rotulos, pool: () => be.timestampQueryPool.render }
  return ganchos
}

export async function perfil({ lugar, quadros = 30, largura = 1600, altura = 900, resolucao = 1.25, patch = {} } = {}) {
  const g = m()
  const h = instalarGanchos()
  if (!h) return { erro: 'sem timestamp-query' }
  g.controle.pausado = true
  g.cfg.tempo.pausado = true
  g.renderer.setPixelRatio(resolucao)
  g.renderer.setSize(largura, altura, false)
  g.cam.camera.aspect = largura / altura
  g.cam.camera.updateProjectionMatrix()
  g.pos.tamanho(largura, altura, resolucao)
  const desfaz = remendar(patch)
  try {
    if (lugar) await ir(lugar)
    const soma = {}
    const n = {}
    const totais = []
    for (let q = 0; q < quadros + 5; q++) {
      h.rotulos.clear()
      passoQuadro()
      await g.renderer.resolveTimestampsAsync('render')
      if (q < 5) continue // aquece
      let total = 0
      const pool = h.pool()
      const porQuadro = {}
      for (const [uid, dur] of pool.timestamps) {
        const r = h.rotulos.get(uid) || 'sem rótulo'
        porQuadro[r] = (porQuadro[r] || 0) + dur
        total += dur
      }
      for (const [r, v] of Object.entries(porQuadro)) { (soma[r] ||= []).push(v); n[r] = (n[r] || 0) + 1 }
      totais.push(total)
    }
    const med = (v) => { const s = [...v].sort((a, b) => a - b); return +s[s.length >> 1].toFixed(3) }
    const passes = Object.fromEntries(Object.entries(soma).map(([r, v]) => [r, { ms: med(v), quadros: n[r] }]).sort((a, b) => b[1].ms - a[1].ms))
    const info = g.renderer.info.render
    return { pixels: `${Math.round(largura * resolucao)}x${Math.round(altura * resolucao)}`, gpuTotal: med(totais), passes, chamadas: info.drawCalls ?? info.calls, triangulos: info.triangles }
  } finally {
    desfaz()
    dispatchEvent(new Event('resize'))
    g.controle.pausado = false
  }
}

// variante: remendo do cfg ({ 'estilo.dof': false }) ou { patch, esconder: 'regex de nome' } (some das câmeras pela
// máscara de camadas, que os sistemas não mexem; a máscara volta no fim)
export function aplicarVariante(v = {}) {
  const patch = v.patch || v.esconder ? (v.patch || {}) : v
  const desfaz = remendar(patch)
  const guardadas = []
  if (v.esconder) {
    const re = new RegExp(v.esconder)
    m().cena.traverse((o) => { if ((o.isMesh || o.isInstancedMesh) && re.test(o.name || '')) { guardadas.push([o, o.layers.mask]); o.layers.mask = 0 } })
  }
  return () => { for (const [o, k] of guardadas) o.layers.mask = k; desfaz() }
}

// ---------------------------------------------------------------- maresia.medir com remendos
export async function medir({ lugares: nomes = ['coluna', 'leoes', 'rua', 'campo'], variantes = { base: {} }, repeticoes = 5, quadros = 20, largura = 1600, altura = 900, resolucao = 1.25 } = {}) {
  const g = m()
  for (let i = 0; i < 100 && !g.medir; i++) await new Promise((r) => setTimeout(r, 200))
  const L = await lugares()
  const lista = nomes.map((n) => [L[n].x, L[n].z, L[n].yaw, L[n].hora])
  const pitch = Object.fromEntries(nomes.map((n) => [`${Math.round(L[n].x)},${Math.round(L[n].z)}`, n]))
  const vs = Object.fromEntries(Object.entries(variantes).map(([k, p]) => [k, () => aplicarVariante(p)]))
  g.cfg.fatia.travar = false
  const r = await g.medir({ lugares: lista, variantes: vs, repeticoes, quadros, largura, altura, resolucao })
  const res = {}
  for (const [k, v] of Object.entries(r.res)) res[pitch[k] || k] = v
  return { pixels: r.pixels, res }
}

// ---------------------------------------------------------------- o laço real, andando
// rota: [[nome do lugar ou {x,z}, segundos], ...]: vai (teleporte) ao primeiro ponto e anda com W (correndo) para a
// frente, girando a câmera devagar se pedido; registra o intervalo entre quadros do navegador
export async function andar({ trechos = [{ lugar: 'coluna', segundos: 12 }], correr = true, giro = 0.25, horaPausada = false } = {}) {
  const g = m()
  const L = await lugares()
  g.controle.pausado = false
  g.cfg.fatia.travar = false
  const pausadoAntes = g.cfg.tempo.pausado
  g.cfg.tempo.pausado = horaPausada
  // contadores de montagem de programa (shader novo no meio do jogo = tropeço)
  const be = g.renderer.backend
  let pipelines = 0
  const cria = be.createRenderPipeline
  if (cria && !be.__contaPipeline) {
    be.__contaPipeline = true
    be.createRenderPipeline = function (...a) { window.__pipelinesNovos = (window.__pipelinesNovos || 0) + 1; return cria.apply(this, a) }
  }
  const resultado = []
  for (const t of trechos) {
    const v = typeof t.lugar === 'string' ? L[t.lugar] : t.lugar
    g.irPara(v.x, v.z, t.yaw ?? v.yaw, t.hora ?? v.hora)
    if (v.pitch != null) g.cam.pitch = v.pitch
    // assenta 1 s parado (o teleporte não conta como andar)
    await new Promise((r) => setTimeout(r, 1000))
    const tempos = []
    const tropecos = []
    const p0 = window.__pipelinesNovos || 0
    let ultimo = performance.now()
    const fim = ultimo + t.segundos * 1000
    g.teclas.frente = true
    g.teclas.correr = correr
    await new Promise((resolve) => {
      const quadro = () => {
        const agora = performance.now()
        const dt = agora - ultimo
        ultimo = agora
        tempos.push(dt)
        if (dt > 50) tropecos.push({ t: +((agora - (fim - t.segundos * 1000)) / 1000).toFixed(2), ms: +dt.toFixed(1), pipelines: (window.__pipelinesNovos || 0) - p0 })
        g.cam.yaw += (t.giro ?? giro) * dt / 1000
        if (agora < fim) requestAnimationFrame(quadro)
        else resolve()
      }
      requestAnimationFrame(quadro)
    })
    g.teclas.frente = false
    g.teclas.correr = false
    tempos.shift()
    const s = [...tempos].sort((a, b) => a - b)
    const pct = (p) => +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(1)
    const media = tempos.reduce((a, b) => a + b, 0) / tempos.length
    resultado.push({
      trecho: typeof t.lugar === 'string' ? t.lugar : 'ponto', quadros: tempos.length, fps: +(1000 / media).toFixed(1),
      p50: pct(0.5), p90: pct(0.9), p99: pct(0.99), max: +s[s.length - 1].toFixed(1),
      acima33: tempos.filter((x) => x > 33.4).length, acima50: tropecos.length,
      pipelinesNovos: (window.__pipelinesNovos || 0) - p0, tropecos: tropecos.slice(0, 20),
      escala: g.cfg.desempenho.resolucaoDinamica ? g.resolucaoDinamica.escala : g.cfg.desempenho.resolucao,
    })
  }
  g.cfg.tempo.pausado = pausadoAntes
  return resultado
}

// chamadas e triângulos de UM quadro (o three só zera a contagem no laço dele, que o jogo não usa)
export function contagens() {
  const g = m()
  g.renderer.info.reset()
  passoQuadro()
  const info = g.renderer.info.render
  return { chamadas: info.drawCalls, triangulos: info.triangles }
}

// nome de cada material do pós (para o perfil)
function nomesPos() {
  const pos = m().pos
  const nomes = new Map()
  const nomear = (mat, nome) => { if (mat && mat.isMaterial) nomes.set(mat, nome) }
  nomear(pos.matOclusao, 'oclusao (1/2)')
  nomear(pos.matClaro, 'brilho: limiar (1/4)')
  ;(pos.matDesfoque || []).forEach((mt) => nomear(mt, 'brilho: desfoque x4 (1/4)'))
  nomear(pos.matTensor, 'pincel: tensor (1/2)')
  for (const mt of Object.values(pos.matsKuwahara || {})) nomear(mt, 'pincel: kuwahara')
  nomear(pos.matTela, 'tela: quadrinho final')
  if (pos.estab) for (const v of Object.values(pos.estab)) nomear(v, 'estabilizar')
  if (pos.dof) for (const v of Object.values(pos.dof)) nomear(v, 'profundidade de campo')
  return nomes
}

// Custo de cada passe por vazão (o mesmo princípio do medidor): depois de um quadro normal, cada passe do pós é
// repetido K vezes seguidas, com as mesmas entradas, e uma leitura de 1 pixel no fim espera a placa; o custo é
// (tempo - tempo da leitura sozinha) / K. Os passes não dependem uns dos outros na repetição, então a placa os
// enfileira sem esperar: é o custo de placa do passe. O cronômetro do WebGPU (timestamp-query) no M1 dá números sem
// sentido por passe (soma de 200+ ms num quadro de 30 ms: a placa de ladrilhos sobrepõe os passes).
// A cena é medida igual (o passe principal sem a sombra, que só é refeita uma vez por quadro do three); a sombra e
// o resto do quadro saem da diferença para o quadro inteiro.
export async function custoPasses({ lugar, K = 30, largura = 1600, altura = 900, resolucao = 1.25, patch = {} } = {}) {
  const g = m()
  const r = g.renderer
  const pos = g.pos
  g.controle.pausado = true
  g.cfg.tempo.pausado = true
  r.setPixelRatio(resolucao)
  r.setSize(largura, altura, false)
  g.cam.camera.aspect = largura / altura
  g.cam.camera.updateProjectionMatrix()
  pos.tamanho(largura, altura, resolucao)
  const desfaz = remendar(patch)
  const Alvo = g.gpu ? g.gpu.W.RenderTarget : null
  const tela = new Alvo(Math.round(largura * resolucao), Math.round(altura * resolucao))
  const passoOrig = pos.passo
  const ler = () => r.readRenderTargetPixelsAsync(tela, 0, 0, 1, 1)
  try {
    if (lugar) await ir(lugar)
    // um quadro gravando a sequência do pós
    const seq = []
    pos.passo = function (material, alvo) { seq.push([material, alvo ?? tela]); return passoOrig.call(this, material, alvo ?? tela) }
    passoQuadro()
    pos.passo = function (material, alvo) { return passoOrig.call(this, material, alvo ?? tela) }
    const nomes = nomesPos()
    const cronometrar = async (f, k = K) => {
      await ler()
      const t0 = performance.now()
      let cpu = 0
      for (let i = 0; i < k; i++) { const a = performance.now(); f(); cpu += performance.now() - a }
      await ler()
      return { t: performance.now() - t0, cpu }
    }
    const leitura = []
    for (let i = 0; i < 5; i++) leitura.push((await cronometrar(() => {}, 0)).t)
    leitura.sort((a, b) => a - b)
    const lt = leitura[2]
    const rep = async (f) => {
      const v = []
      for (let i = 0; i < 3; i++) { const c = await cronometrar(f); v.push({ ms: (c.t - lt) / K, cpu: c.cpu / K }) }
      v.sort((a, b) => a.ms - b.ms)
      return v[1]
    }
    const res = {}
    const soma = (nome, c) => { const o = (res[nome] ||= { ms: 0, cpu: 0, passes: 0 }); o.ms += c.ms; o.cpu += c.cpu; o.passes++ }
    // a cena (MRT), sem a sombra
    soma('cena (MRT cor + luz)', await rep(() => { r.setRenderTarget(pos.rtCor); r.setMRT(pos.mrtCena); r.render(g.cena, g.cam.camera); r.setMRT(null) }))
    for (const [mat, alvo] of seq) soma(nomes.get(mat) || 'pós (outro)', await rep(() => passoOrig.call(pos, mat, alvo)))
    // o quadro inteiro (com a sombra), como o medidor
    const quadro = await rep(passoQuadro)
    for (const o of Object.values(res)) { o.ms = +o.ms.toFixed(2); o.cpu = +o.cpu.toFixed(2) }
    const somaPasses = Object.values(res).reduce((a, o) => a + o.ms, 0)
    const c = contagens()
    return { pixels: `${tela.width}x${tela.height}`, quadro: { ms: +quadro.ms.toFixed(2), cpu: +quadro.cpu.toFixed(2) }, somaPasses: +somaPasses.toFixed(2), passes: res, ...c, leituraMs: +lt.toFixed(2) }
  } finally {
    pos.passo = passoOrig
    tela.dispose()
    desfaz()
    dispatchEvent(new Event('resize'))
    g.controle.pausado = false
  }
}

// Triângulos e chamadas de um quadro por objeto (nome do objeto ou do primeiro pai com nome), separados em passe
// principal e sombra. Só conta: o three soma em info.update(objeto, contagem, cópias) a cada desenho.
export async function triangulos({ lugar, top = 40 } = {}) {
  const g = m()
  g.controle.pausado = true
  g.cfg.tempo.pausado = true
  try {
    if (lugar) await ir(lugar)
    const info = g.renderer.info
    const be = g.renderer.backend
    // a sombra é desenhada DENTRO do passe principal (aninhada): pilha de contextos
    const pilha = []
    const begin = be.beginRender
    const finish = be.finishRender
    be.beginRender = function (rc) { pilha.push(rc); return begin.call(this, rc) }
    be.finishRender = function (rc) { try { return finish.call(this, rc) } finally { pilha.pop() } }
    const sol = g.cacheSombra.sol, perto = g.sombraPerto.luz
    const camPos = g.cam.camera.getWorldPosition(new (g.cam.camera.position.constructor)())
    const upd = info.update
    const por = new Map()
    const nome = (o) => {
      let p = o
      let caminho = []
      while (p && caminho.length < 3) { if (p.name) caminho.push(p.name); p = p.parent }
      return (caminho.reverse().join(' / ') || o.type) + (o.isInstancedMesh ? ' [inst]' : '')
    }
    info.update = function (o, count, inst) {
      const ctx = pilha[pilha.length - 1]
      const passe = !ctx ? 'outro' : ctx.renderTarget === g.pos.rtCor ? 'cena' : ctx.camera === sol.shadow.camera ? 'sombraSol' : ctx.camera === perto.shadow.camera ? 'sombraPerto' : 'outro'
      const k = passe + ' | ' + nome(o)
      let e = por.get(k)
      if (!e) {
        let d = -1
        if (o.geometry) { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); const c = o.geometry.boundingSphere.center.clone().applyMatrix4(o.matrixWorld); d = Math.round(c.distanceTo(camPos)) }
        e = { tri: 0, chamadas: 0, dist: d }
      }
      e.tri += o.isMesh ? inst * count / 3 : 0
      e.chamadas++
      por.set(k, e)
      return upd.call(this, o, count, inst)
    }
    info.reset()
    passoQuadro()
    info.update = upd
    be.beginRender = begin
    be.finishRender = finish
    const lista = [...por.entries()].sort((a, b) => b[1].tri - a[1].tri)
    const tot = {}
    for (const [k, v] of lista) { const p = k.split(' | ')[0]; const t = (tot[p] ||= { tri: 0, chamadas: 0 }); t.tri += v.tri; t.chamadas += v.chamadas }
    return { total: tot, top: lista.slice(0, top).map(([k, v]) => [k, Math.round(v.tri), v.chamadas, v.dist]) }
  } finally {
    g.controle.pausado = false
  }
}

// As malhas de longe à vista (muito longe e mascaradas): triângulos por cópia, cópias, tamanho da peça e a distância
// das cópias até a câmera (para escolher um alcance por tamanho)
export async function familiasLonge({ lugar = 'coluna' } = {}) {
  const g = m()
  g.controle.pausado = true
  try {
    await ir(lugar)
    const cam = g.cam.camera.position
    const V = cam.constructor
    const p = new V(), s = new V(), q = new (g.cam.camera.quaternion.constructor)()
    const M = new (g.cam.camera.matrixWorld.constructor)()
    const out = {}
    g.cena.traverse((o) => {
      if (!o.isMesh || !o.visible || !/-muito-longe$|-mascarado$|^urubu-obra$/.test(o.name)) return
      let vis = true
      for (let n = o; n; n = n.parent) if (!n.visible) vis = false
      if (!vis) return
      const geo = o.geometry
      const tri = (geo.index ? geo.index.count : geo.attributes.position.count) / 3
      if (!geo.boundingBox) geo.computeBoundingBox()
      const b = geo.boundingBox
      const dims = [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z].sort((a, c) => c - a)
      const n = o.isInstancedMesh ? o.count : 1
      const dist = []
      let escala = 1
      if (o.isInstancedMesh) {
        for (let i = 0; i < n; i++) {
          o.getMatrixAt(i, M)
          M.premultiply(o.matrixWorld)
          M.decompose(p, q, s)
          if (i === 0) escala = Math.max(s.x, s.y, s.z)
          dist.push(Math.hypot(p.x - cam.x, p.z - cam.z))
        }
      } else {
        if (!geo.boundingSphere) geo.computeBoundingSphere()
        dist.push(Math.max(0, geo.boundingSphere.center.clone().applyMatrix4(o.matrixWorld).distanceTo(cam) - geo.boundingSphere.radius))
      }
      dist.sort((a, c) => a - c)
      const e = (out[o.name] ||= { malhas: 0, tri: 0, triPorCopia: Math.round(tri), copias: 0, dims: dims.map((x) => +(x * escala).toFixed(2)), dist: [] })
      e.malhas++
      e.tri += tri * n
      e.copias += n
      e.dist.push(...dist)
    })
    for (const e of Object.values(out)) {
      e.dist.sort((a, c) => a - c)
      const d = e.dist
      e.distMin = Math.round(d[0]); e.distMed = Math.round(d[d.length >> 1]); e.distP10 = Math.round(d[Math.floor(d.length * 0.1)])
      e.acima600 = d.filter((x) => x > 600).length
      delete e.dist
      e.tri = Math.round(e.tri)
    }
    return Object.fromEntries(Object.entries(out).sort((a, c) => c[1].tri - a[1].tri))
  } finally { g.controle.pausado = false }
}

// As cópias que o WebGPU desenha à toa: quantidadeFixa (render/renderizador.js) faz o three ver sempre a capacidade
// inteira e zera a escala das cópias além do count do jogo; a escala zero não aparece, mas o vértice roda
export async function copiasZeradas({ lugar = 'coluna' } = {}) {
  const g = m()
  g.controle.pausado = true
  try {
    await ir(lugar)
    const out = {}
    g.cena.traverse((o) => {
      if (!o.isInstancedMesh || !o.userData.quantidadeReal) return
      let vis = true
      for (let n = o; n; n = n.parent) if (!n.visible) vis = false
      const geo = o.geometry
      const tri = (geo.index ? geo.index.count : geo.attributes.position.count) / 3
      const cap = o.instanceMatrix.count
      const real = o.userData.quantidadeReal()
      const e = (out[o.name] ||= { malhas: 0, visiveis: 0, cap: 0, real: 0, triAToa: 0, triPorCopia: Math.round(tri) })
      e.malhas++
      e.cap += cap
      e.real += real
      if (vis && o.layers.mask & 1) { e.visiveis++; e.triAToa += (cap - real) * tri }
    })
    return Object.fromEntries(Object.entries(out).filter(([, e]) => e.cap > e.real).sort((a, b) => b[1].triAToa - a[1].triAToa))
  } finally { g.controle.pausado = false }
}
