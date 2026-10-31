// Cenários do jogo rodando, para os testes de regressão no navegador (infra/modal-jogo/testar_jogo.py).
// Cada cenário recebe window.maresia, mexe no jogo como um jogador e devolve { ok, medidas, motivo }.
// Rodam em tempo real (requestAnimationFrame), então as tolerâncias têm folga para quadros de duração variável.

const esperar = (ms) => new Promise((r) => setTimeout(r, ms))
const embrulhar = (a) => Math.atan2(Math.sin(a), Math.cos(a))
const soltarTudo = (t) => { for (const k in t) t[k] = false }

// grava f() a cada quadro de tela até parar() ser chamado
function gravar(f) {
  const amostras = []
  let vivo = true
  const passo = () => {
    if (!vivo) return
    amostras.push(f())
    requestAnimationFrame(passo)
  }
  requestAnimationFrame(passo)
  return { amostras, parar: () => { vivo = false } }
}

// osso do corpo visível do jogador: procura no corpo dele e, se não achar (versões antigas guardavam o
// corpo em outro lugar), o osso com esse nome mais perto do jogador na cena
function osso(m, fim) {
  let achado = null
  m.jogador.p.raiz.traverse((o) => { if (!achado && o.isBone && o.name.endsWith(fim)) achado = o })
  if (achado) return achado
  let melhor = Infinity
  const p = m.jogador.pos.clone()
  m.cena.traverse((o) => {
    if (!o.isBone || !o.name.endsWith(fim)) return
    const d = o.getWorldPosition(p.clone()).distanceTo(m.jogador.pos)
    if (d < melhor) { melhor = d; achado = o }
  })
  return melhor < 2 ? achado : null
}

// para onde o corpo aponta (radianos), pela linha entre as coxas: horizontal em qualquer modelo
function frenteDoCorpo(m) {
  const e = osso(m, 'LeftUpLeg')
  const d = osso(m, 'RightUpLeg')
  if (!e || !d) return null
  const a = e.getWorldPosition(m.jogador.pos.clone())
  const b = d.getWorldPosition(m.jogador.pos.clone())
  // [instante em ms, ângulo]
  return () => {
    e.getWorldPosition(a)
    d.getWorldPosition(b)
    return [performance.now(), Math.atan2(a.z - b.z, -(a.x - b.x))]
  }
}

// ângulo suavizado (0,5 s) a partir das amostras [instante, ângulo]
function suavizado(amostras) {
  const tempos = amostras.map((x) => x[0])
  return mediaTempo(tempos, desembrulhar(amostras.map((x) => x[1])), 500)
}

// ângulo contínuo (sem o salto de -π para π) e média móvel de n quadros
function desembrulhar(lista) {
  const r = [lista[0]]
  for (let i = 1; i < lista.length; i++) r.push(r[i - 1] + embrulhar(lista[i] - lista[i - 1]))
  return r
}
// média dos últimos `ms` milissegundos (por tempo, não por quadros: o FPS do servidor varia de 35 a 75 e
// uma média de 30 quadros virava até 0,8 s de atraso, o que reprovava a meia-volta sem o jogo ter mudado)
function mediaTempo(tempos, lista, ms) {
  let a = 0
  let soma = 0
  return lista.map((v, i) => {
    soma += v
    while (tempos[i] - tempos[a] > ms) soma -= lista[a++]
    return soma / (i - a + 1)
  })
}

// frente 1,5 s (referência de direção), depois alterna frente/trás a cada `intervalo` ms, 8 vezes, e segura a
// última 1,5 s. Mede quanto o corpo gira depois da última tecla além do que precisava para ficar de frente
// para ela (o "excesso"): o bug dava uma meia-volta inteira a mais.
async function meiaVoltaRapida(m, intervalo) {
  const t = m.teclas
  soltarTudo(t)
  await esperar(1000)
  const frente = frenteDoCorpo(m)
  if (!frente) return { erro: 'sem os ossos das coxas' }
  const g = gravar(frente)
  t.frente = true
  await esperar(1500)
  const iRef = g.amostras.length
  let tecla = 'frente'
  for (let k = 0; k < 8; k++) {
    tecla = tecla === 'frente' ? 'tras' : 'frente'
    t.frente = tecla === 'frente'
    t.tras = tecla === 'tras'
    await esperar(intervalo)
  }
  const iUltima = g.amostras.length
  await esperar(1500)
  soltarTudo(t)
  g.parar()
  await esperar(800)
  const y = suavizado(g.amostras)
  const esperado = y[iRef - 1] + (tecla === 'tras' ? Math.PI : 0)
  const necessario = Math.abs(embrulhar(esperado - y[iUltima - 1]))
  let giro = 0
  for (let i = iUltima + 1; i < y.length; i++) giro += Math.abs(y[i] - y[i - 1])
  return { intervalo, necessario: +necessario.toFixed(2), giro: +giro.toFixed(2), excesso: +(giro - necessario).toFixed(2),
           erroFinal: +Math.abs(embrulhar(y[y.length - 1] - esperado)).toFixed(2) }
}

// A luz dos materiais pintados segue a hora do jogo: à noite a luz direta quase some e não sobra sombra para medir
// (na suíte o jogo roda no relógio de verdade). Meio-dia fixo durante o teste, e a hora volta no fim.
// espera o próximo quadro do navegador (o WebGPU do three conta quadros por ele); sem requestAnimationFrame (aba
// escondida) segue depois de 250 ms, e o que depende do quadro novo falha
function proximoQuadro() {
  return new Promise((res) => { const t = setTimeout(res, 250); requestAnimationFrame(() => { clearTimeout(t); res() }) })
}

async function comLuzDoDia(m, f) {
  const antes = { hora: m.cfg.tempo.hora, pausado: m.cfg.tempo.pausado }
  m.cfg.tempo.hora = 12
  m.cfg.tempo.pausado = true
  for (let i = 0; i < 3; i++) m.passo(1 / 60, true)
  try {
    return await f()
  } finally {
    Object.assign(m.cfg.tempo, antes)
  }
}

// O lugar de referência dos cenários que medem o corpo do jogador: a fatia
// vertical da Praia do Peixe. A âncora é lon/lat, e não um x do jogo: o
// cenário usava o x fixo (340, 20), que era o x da fatia antes do mapa mudar de
// escala (a compressão no quadro da grade, 06f9525). Com o mapa novo, esse x
// saiu do mundo jogável, a física jogava o jogador para a borda (longe dos
// bancos) e o cenário sentarLevantar reprovava com "não chegou a sentar" —
// a mesma falha que a fatia teve e que foi corrigida em 715963c.
let pontoDeReferencia = null
async function referencia() {
  if (!pontoDeReferencia) {
    const { FATIA_LON, FATIA_LAT } = await import('/src/mundo/fatia.js')
    const { ll } = await import('/src/mundo/fortaleza1932.js')
    pontoDeReferencia = ll(FATIA_LON, FATIA_LAT)
  }
  return pontoDeReferencia
}

export const cenarios = {
  // Regressão d25888b (16/10/2026): frente e trás seguidos emendavam meia-volta em meia-volta, e o corpo
  // ficava girando de um lado para o outro. Cada troca tem de dar uma meia-volta só e assentar.
  async meiaVolta(m) {
    const t = m.teclas
    soltarTudo(t)
    await esperar(1500)
    const frente = frenteDoCorpo(m)
    if (!frente) return { ok: false, motivo: 'sem os ossos das coxas no corpo do jogador' }
    const g = gravar(frente)
    const segmentos = []
    for (const tecla of ['frente', 'tras', 'frente', 'tras', 'frente']) {
      t.frente = tecla === 'frente'
      t.tras = tecla === 'tras'
      const ini = g.amostras.length
      // 2 s: a virada leva ~1,1 s e a média de 0,5 s atrasa o sinal (1,4 s reprovava quando o FPS caía)
      await esperar(2000)
      segmentos.push([ini, g.amostras.length])
    }
    soltarTudo(t)
    g.parar()
    // média de 0,5 s: tira o balanço do quadril ao andar e deixa o giro do corpo
    const y = suavizado(g.amostras)
    const medidas = segmentos.map(([a, b]) => {
      let giro = 0
      for (let i = a + 1; i < b; i++) giro += Math.abs(y[i] - y[i - 1])
      // último 0,3 s do trecho
      const tFim = g.amostras[b - 1][0]
      let c = b - 1
      while (c > a && tFim - g.amostras[c - 1][0] <= 300) c--
      const fim = y.slice(c, b)
      // quantos quadros até chegar a 0,4 rad do lado oposto ao de antes da tecla
      const alvo = y[a] + Math.PI * Math.sign(y[b - 1] - y[a] || 1)
      let chegou = -1
      for (let i = a; i < b; i++) if (Math.abs(y[i] - alvo) < 0.4) { chegou = i - a; break }
      return { giro: +giro.toFixed(2), virou: +Math.abs(embrulhar(y[b - 1] - y[a])).toFixed(2),
               assentado: +(Math.max(...fim) - Math.min(...fim)).toFixed(3), quadrosAteVirar: chegou, quadros: b - a }
    })
    // da 2ª troca em diante: uma meia-volta só (π, com folga), terminando virado para o outro lado e
    // sem continuar girando no fim
    const ruins = medidas.slice(1).filter((s) => s.giro > Math.PI + 1.0 || s.virou < Math.PI - 0.6 || s.assentado > 0.25)
    return { ok: ruins.length === 0, medidas, motivo: ruins.length ? 'meia-volta emendada ou sem assentar' : '' }
  },

  // Regressão ae19815 e 0ac1e6b (16 e 17/10/2026): sentar e levantar teletransportavam o corpo, e ao
  // levantar ele pulava de lado. O quadril tem de andar sem salto entre um quadro e outro.
  async sentarLevantar(m) {
    const j = m.jogador
    const bancos = m.lugares && m.lugares.bancos
    if (!bancos || !bancos.length) return { ok: false, motivo: 'sem bancos em maresia.lugares' }
    let banco = bancos[0]
    let melhor = Infinity
    for (const b of bancos) {
      const d = Math.hypot(b.x - j.pos.x, b.z - j.pos.z)
      if (d < melhor) { melhor = d; banco = b }
    }
    soltarTudo(m.teclas)
    // 1,2 m à frente do banco, de onde ele anda até lá antes de sentar
    m.irPara(banco.x + Math.sin(banco.yaw) * 1.2, banco.z + Math.cos(banco.yaw) * 1.2)
    await esperar(2000)
    const quadril = osso(m, 'Hips')
    if (!quadril) return { ok: false, motivo: 'sem osso do quadril no corpo do jogador' }
    const p = quadril.getWorldPosition(quadril.position.clone())
    const g = gravar(() => {
      quadril.getWorldPosition(p)
      return [p.x, p.y, p.z, !!j.sentado]
    })
    j.sentar(banco)
    await esperar(4000)
    const sentou = !!j.sentado
    j.levantar()
    await esperar(3000)
    g.parar()
    let pior = 0
    let onde = -1
    for (let i = 1; i < g.amostras.length; i++) {
      const [x0, y0, z0] = g.amostras[i - 1]
      const [x1, y1, z1] = g.amostras[i]
      const d = Math.hypot(x1 - x0, y1 - y0, z1 - z0)
      if (d > pior) { pior = d; onde = i }
    }
    // andar a 1,5 m/s em poses de 1/24 s dá ~6 cm por pose; teleporte e salto de lado passavam de 30 cm
    const ok = sentou && pior < 0.15
    return { ok, medidas: { sentou, maiorSaltoQuadril: +pior.toFixed(3), quadro: onde, quadros: g.amostras.length },
             motivo: ok ? '' : (!sentou ? 'não chegou a sentar' : 'quadril saltou entre um quadro e outro') }
  },

  // Regressão 523bec7 (16/10/2026): parado, a animação do Mixamo deixava os pés patinando ~10 cm no chão
  // (fisicamente impossível). Parado, cada pé tem de ficar cravado no mesmo lugar.
  async pesParados(m) {
    soltarTudo(m.teclas)
    await esperar(2500)
    const e = osso(m, 'LeftFoot')
    const d = osso(m, 'RightFoot')
    if (!e || !d) return { ok: false, motivo: 'sem os ossos dos pés' }
    const a = m.jogador.pos.clone()
    const g = gravar(() => {
      e.getWorldPosition(a)
      const b = d.getWorldPosition(m.jogador.pos.clone())
      return [a.x, a.z, b.x, b.z]
    })
    await esperar(5000)
    g.parar()
    const desliza = (ix, iz) => {
      const xs = g.amostras.map((s) => s[ix])
      const zs = g.amostras.map((s) => s[iz])
      return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs))
    }
    const esq = desliza(0, 1)
    const dir = desliza(2, 3)
    const pior = Math.max(esq, dir)
    return { ok: pior < 0.03, medidas: { esquerdo: +esq.toFixed(3), direito: +dir.toFixed(3), quadros: g.amostras.length },
             motivo: pior < 0.03 ? '' : 'pé patinando parado' }
  },

  // Regressão d25888b (16/10/2026), o caso real: frente e trás alternados rápido, antes da volta anterior
  // acabar. O código antigo emendava uma meia-volta inteira a mais depois da última tecla (excesso de 2,2 a
  // 3,4 rad contra 0,5 a 1 no corrigido, medido na L4 em 17/10/2026).
  async meiaVoltaRapida(m) {
    const medidas = []
    for (const intervalo of [300, 700]) medidas.push(await meiaVoltaRapida(m, intervalo))
    if (medidas.some((x) => x.erro)) return { ok: false, motivo: medidas.find((x) => x.erro).erro }
    const ruins = medidas.filter((x) => x.excesso > 1.3 || x.erroFinal > 0.5)
    return { ok: ruins.length === 0, medidas, motivo: ruins.length ? 'meia-volta a mais depois da última tecla' : '' }
  },

// Regressão (17/10/2026, vídeo IMG_3554 do Joabe): parado, S rápido começa a meia-volta; soltar antes do
// fim e apertar S de novo (mesmo pedido) deixava a trava do giro presa. Ele andava a 30% da velocidade
// com a pose congelada no fim da volta ("anda parado sem animação") e ia afundando.
  async meiaVoltaInterrompida(m) {
    const t = m.teclas
    const j = m.jogador
    soltarTudo(t)
    const [px, pz] = await referencia()
    m.irPara(px, pz, 0)
    await esperar(2000)
    t.tras = true
    await esperar(350)
    t.tras = false
    await esperar(1200)
    t.tras = true
    await esperar(2500)
    const q = osso(m, 'Hips')
    if (!q) { soltarTudo(t); return { ok: false, motivo: 'sem osso do quadril' } }
    const antes = q.quaternion.clone()
    const girando = !!j.animador.girando
    const vel = j.velHoriz
    await esperar(500)
    const poseMudou = 1 - Math.abs(antes.dot(q.quaternion))
    soltarTudo(t)
    const medidas = { girando, vel: +vel.toFixed(2), poseMudou: +poseMudou.toFixed(5) }
    const ok = !girando && vel > 1.0 && poseMudou > 1e-5
    return { ok, medidas, motivo: ok ? '' : 'meia-volta interrompida deixou o giro preso' }
  },

  // Regressão (17/10/2026): com a pose congelada (clipe parado, por qualquer motivo), o mixer do three não
  // reescreve os ossos (só escreve o que mudou) e as correções de postura (pé no chão, joelho reto, pé
  // ancorado) se somavam quadro a quadro sobre elas mesmas: o corpo afundava. Congela o tempo do mixer por
  // 3 s, parado e andando, e mede quanto o quadril sai do lugar em relação ao jogador.
  async poseCongelada(m) {
    const j = m.jogador
    const an = j.animador
    soltarTudo(m.teclas)
    const [px, pz] = await referencia()
    m.irPara(px, pz, 0)
    await esperar(2000)
    const q = osso(m, 'Hips')
    if (!q) return { ok: false, motivo: 'sem osso do quadril' }
    const alt = () => q.getWorldPosition(j.pos.clone()).y - j.pos.y
    const medidas = []
    for (const [nome, teclas] of [['parado', {}], ['andando', { frente: true }]]) {
      Object.assign(m.teclas, teclas)
      await esperar(1200)
      const escala = an.mixer.timeScale
      an.mixer.timeScale = 0
      let min = Infinity, max = -Infinity
      const g = gravar(() => { const h = alt(); min = Math.min(min, h); max = Math.max(max, h); return h })
      await esperar(3000)
      g.parar()
      an.mixer.timeScale = escala
      soltarTudo(m.teclas)
      medidas.push({ nome, deriva: +(max - min).toFixed(3), quadros: g.amostras.length })
      await esperar(800)
    }
    const ok = medidas.every((x) => x.deriva < 0.03)
    return { ok, medidas, motivo: ok ? '' : 'com a pose congelada, a postura acumula e o corpo afunda' }
  },

  // Regressão KAN-68 (17/10/2026): no WebGPU, blocos de cópias com uma cópia só (instanciarEmBlocos deixa
  // vários assim) com o mesmo material saíam todos no lugar de um deles, até com formas diferentes. O three monta o shader uma
  // vez para eles (só separa por objeto com count > 1) e a matriz das cópias ia junto. Na foto justa, a casa
  // de palha grande sumia da praia. Desenha três desses lado a lado e confere que os três aparecem (o primeiro
  // objeto de um material ganha chave própria, porque montar o shader muda o material; do segundo em diante dividem).
  async copiasUnicas(m) {
    const THREE = await import('three')
    const { pintar } = await import('/src/materiais.js')
    const r = m.renderer
    // o módulo do WebGPU e a troca de materiais vêm do jogo (importar de novo aqui pode dar outra instância)
    const W = m.gpu?.W || null
    if (m.webgpu && !W) return { ok: false, motivo: 'modo webgpu sem maresia.gpu (módulo e troca de materiais do jogo)' }
    const cena = new THREE.Scene()
    cena.add(new THREE.AmbientLight('#ffffff', 3))
    const geo = new THREE.BoxGeometry(1.5, 1.5, 1.5)
    const mat = pintar(new THREE.MeshToonMaterial({ color: '#ff2020' }), 'teste-copias-unicas')
    for (const x of [-3, 0, 3]) {
      const im = new THREE.InstancedMesh(geo, mat, 1)
      im.setMatrixAt(0, new THREE.Matrix4().makeTranslation(x, 0, 0))
      cena.add(im)
    }
    const cam = new THREE.OrthographicCamera(-4, 4, 2, -2, 0.1, 20)
    cam.position.set(0, 0, 10)
    cam.updateMatrixWorld()
    const L = 64, A = 32
    const rt = W ? new W.RenderTarget(L, A, { count: 2 }) : new THREE.WebGLRenderTarget(L, A)
    if (W) { rt.textures[0].name = 'output'; rt.textures[1].name = 'gLuz'; m.gpu.preparar(cena) }
    const cor = r.getClearColor(new THREE.Color()), alfa = r.getClearAlpha()
    r.setRenderTarget(rt)
    if (W) r.setMRT(W.mrt({ output: W.output, gLuz: W.vec4(0, 0, 0, 1) }))
    r.setClearColor(0x000000, 1)
    r.clear()
    r.render(cena, cam)
    let px
    if (W) { r.setMRT(null); px = await r.readRenderTargetPixelsAsync(rt, 0, 0, L, A) } else {
      px = new Uint8Array(L * A * 4)
      r.readRenderTargetPixels(rt, 0, 0, L, A, px)
    }
    r.setRenderTarget(null)
    r.setClearColor(cor, alfa)
    rt.dispose()
    // vermelho no meio de cada caixa (x = -3, 0 e 3 viram as colunas 8, 32 e 56; a linha do meio é a 16)
    const vermelho = (c) => px[(16 * L + c) * 4]
    const medidas = { esquerda: vermelho(8), meio: vermelho(32), direita: vermelho(56) }
    const ok = medidas.esquerda > 20 && medidas.meio > 20 && medidas.direita > 20
    return { ok, medidas, motivo: ok ? '' : 'cópia única saiu no lugar de outra (falta caixa desenhada)' }
  },

  // Regressão KAN-68 (17/10/2026): no passe de sombra o WebGPU troca o material de cada objeto por um genérico,
  // e (1) blocos com uma cópia só projetavam sombra todos no lugar de um deles e (2) folha com recorte
  // (alphaTest, como as dos coqueiros) projetava o retângulo inteiro. O WebGL faz certo nos dois. Cena pequena
  // vista de cima: três caixas de uma cópia com o sol de lado (sombra 1 m ao lado de cada uma) e uma folha toda
  // transparente, que não pode fazer sombra. (3) Bloco que nasce vazio e cresce depois (bolas, cocos) também
  // tem de fazer a sombra de cada cópia. (4) Face de um lado só virada para o sol não faz sombra (como no WebGL).
  async sombrasCopias(m) {
    return comLuzDoDia(m, async () => {
      const THREE = await import('three')
      const { pintar } = await import('/src/materiais.js')
      const r = m.renderer
      const W = m.gpu?.W || null
      if (m.webgpu && !W) return { ok: false, motivo: 'modo webgpu sem maresia.gpu (módulo e troca de materiais do jogo)' }
      const cena = new THREE.Scene()
      cena.add(new THREE.AmbientLight('#ffffff', 1))
      const sol = new THREE.DirectionalLight('#ffffff', 2.5)
      sol.position.set(4, 8, 0)
      sol.castShadow = true
      sol.shadow.mapSize.set(512, 512)
      Object.assign(sol.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 0.5, far: 20 })
      sol.shadow.camera.updateProjectionMatrix()
      cena.add(sol, sol.target)
      const chao = new THREE.Mesh(new THREE.PlaneGeometry(10, 6).rotateX(-Math.PI / 2), pintar(new THREE.MeshToonMaterial({ color: '#ffffff' }), 'teste-sombra-chao'))
      chao.receiveShadow = true
      cena.add(chao)
      const geo = new THREE.BoxGeometry(0.8, 0.8, 0.8)
      const mat = pintar(new THREE.MeshToonMaterial({ color: '#ff2020' }), 'teste-sombra-caixa')
      for (const x of [-2, 1, 4]) {
        const im = new THREE.InstancedMesh(geo, mat, 1)
        im.setMatrixAt(0, new THREE.Matrix4().makeTranslation(x, 2, -1))
        im.castShadow = true
        cena.add(im)
      }
      // folha toda transparente (alphaMap zerado): o recorte tem de valer na sombra também
      const zero = new THREE.DataTexture(new Uint8Array(4 * 4 * 4), 4, 4)
      zero.needsUpdate = true
      const folha = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4).rotateX(-Math.PI / 2),
        pintar(new THREE.MeshToonMaterial({ color: '#20ff20', alphaMap: zero, alphaTest: 0.5, side: THREE.DoubleSide }), 'teste-sombra-folha'))
      folha.position.set(1, 2, 1)
      folha.castShadow = true
      cena.add(folha)
      // tampa de um lado só virada para o sol: o WebGL desenha a sombra pelo lado de trás das faces, então ela não
      // faz sombra no chão; o WebGPU tem de dar o mesmo (shadowSide invertido)
      const tampa = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8).rotateX(-Math.PI / 2), mat)
      tampa.position.set(3, 2, 0)
      tampa.castShadow = true
      cena.add(tampa)
      // bloco que nasce vazio e ganha duas caixas depois do primeiro desenho (como bolas e cocos)
      const crescem = new THREE.InstancedMesh(geo, mat, 8)
      crescem.count = 0
      crescem.castShadow = true
      crescem.frustumCulled = false
      cena.add(crescem)
      const cam = new THREE.OrthographicCamera(-4, 4, 2, -2, 0.1, 30)
      cam.position.set(0, 10, 0)
      cam.up.set(0, 0, -1)
      cam.lookAt(0, 0, 0)
      cam.updateMatrixWorld()
      const L = 64, A = 32
      const rt = W ? new W.RenderTarget(L, A, { count: 2 }) : new THREE.WebGLRenderTarget(L, A)
      if (W) { rt.textures[0].name = 'output'; rt.textures[1].name = 'gLuz'; m.gpu.preparar(cena) } else r.shadowMap.needsUpdate = true
      const cor = r.getClearColor(new THREE.Color()), alfa = r.getClearAlpha()
      r.setRenderTarget(rt)
      if (W) r.setMRT(W.mrt({ output: W.output, gLuz: W.vec4(0, 0, 0, 1) }))
      r.setClearColor(0x000000, 1)
      // o primeiro desenho com o bloco vazio; mais dois depois (no WebGPU o mapa de sombra só existe depois do
      // primeiro desenho). Um quadro do navegador entre os desenhos, como no jogo: desde o three 0.186 o WebGPU
      // desenha o mapa de sombra uma vez por quadro (ShadowNode, por câmera e quadro), e três desenhos no mesmo
      // quadro reaproveitavam o mapa do primeiro, ainda sem as cópias que nasceram (KAN-70 T5)
      const pausado = m.controle.pausado
      m.controle.pausado = true // o laço do jogo não desenha entre os quadros do teste
      for (let i = 0; i < 3; i++) {
        if (W) {
          await proximoQuadro()
          r.setRenderTarget(rt)
          r.setMRT(W.mrt({ output: W.output, gLuz: W.vec4(0, 0, 0, 1) }))
          r.setClearColor(0x000000, 1)
        }
        if (i === 1) {
          crescem.setMatrixAt(0, new THREE.Matrix4().makeTranslation(-2, 2, 1))
          crescem.setMatrixAt(1, new THREE.Matrix4().makeTranslation(3.5, 2, 1))
          crescem.count = 2
          crescem.instanceMatrix.needsUpdate = true
          if (W) m.gpu.preparar(cena); else r.shadowMap.needsUpdate = true
        }
        r.clear()
        r.render(cena, cam)
      }
      m.controle.pausado = pausado
      let px
      if (W) { r.setMRT(null); px = await r.readRenderTargetPixelsAsync(rt, 0, 0, L, A) } else {
        px = new Uint8Array(L * A * 4)
        r.readRenderTargetPixels(rt, 0, 0, L, A, px)
      }
      r.setRenderTarget(null)
      r.setClearColor(cor, alfa)
      rt.dispose()
      sol.shadow.dispose()
      // ponto do chão (x, z) -> pixel; no WebGPU a linha 0 fica em cima, no WebGL embaixo
      const brilho = (x, z) => {
        const c = Math.round((x + 4) / 8 * L), yN = -z / 2
        const l = Math.min(A - 1, Math.round(W ? (1 - yN) / 2 * A : (yN + 1) / 2 * A))
        const i = (l * L + c) * 4
        return px[i] + px[i + 1] + px[i + 2]
      }
      const aceso = brilho(-1, 0)
      const medidas = { aceso, sombras: [-3, 0, 3].map((x) => brilho(x, -1)), soboFolha: brilho(0, 1), crescem: [-3, 2.5].map((x) => brilho(x, 1)), soboTampa: brilho(2, 0) }
      const ok = aceso > 60 && [...medidas.sombras, ...medidas.crescem].every((b) => b < aceso * 0.8) && medidas.soboFolha > aceso * 0.9 && medidas.soboTampa > aceso * 0.9
      return { ok, medidas, motivo: ok ? '' : 'sombra de cópia fora do lugar, folha recortada ou face de um lado só fazendo sombra' }
    })
  },

  // Regressão KAN-68 (17/10/2026): bolas, cocos e poeira mudam de quantidade de cópias durante o jogo (nascem
  // com zero). No WebGPU a lista de matrizes ficava do tamanho do primeiro desenho e o shader não é remontado
  // quando a quantidade muda; e dois blocos que começam com zero e dividem material (bolas e cocos) dividiam
  // também as matrizes. Desenha dois blocos assim com zero cópias, depois põe três cópias em cada um e confere
  // as seis caixas.
  async copiasQueCrescem(m) {
    const THREE = await import('three')
    const { pintar } = await import('/src/materiais.js')
    const r = m.renderer
    const W = m.gpu?.W || null
    if (m.webgpu && !W) return { ok: false, motivo: 'modo webgpu sem maresia.gpu (módulo e troca de materiais do jogo)' }
    const cena = new THREE.Scene()
    cena.add(new THREE.AmbientLight('#ffffff', 3))
    const mat = pintar(new THREE.MeshToonMaterial({ color: '#ff2020' }), 'teste-copias-crescem')
    const blocos = [0.9, -0.9].map(() => {
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, 8)
      im.count = 0
      im.frustumCulled = false
      cena.add(im)
      return im
    })
    const cam = new THREE.OrthographicCamera(-4, 4, 2, -2, 0.1, 20)
    cam.position.set(0, 0, 10)
    cam.updateMatrixWorld()
    const L = 64, A = 32
    const rt = W ? new W.RenderTarget(L, A, { count: 2 }) : new THREE.WebGLRenderTarget(L, A)
    if (W) { rt.textures[0].name = 'output'; rt.textures[1].name = 'gLuz' }
    const cor = r.getClearColor(new THREE.Color()), alfa = r.getClearAlpha()
    const desenhar = () => {
      if (W) m.gpu.preparar(cena)
      r.setRenderTarget(rt)
      if (W) r.setMRT(W.mrt({ output: W.output, gLuz: W.vec4(0, 0, 0, 1) }))
      r.setClearColor(0x000000, 1)
      r.clear()
      r.render(cena, cam)
      if (W) r.setMRT(null)
    }
    desenhar()
    // três cópias em cada bloco: em cima x = -3, 0, 3; embaixo x = -2, 1, 3.5 (y = 0,9 e -0,9)
    const xs = [[-3, 0, 3], [-2, 1, 3.5]]
    blocos.forEach((im, b) => {
      xs[b].forEach((x, i) => im.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, b ? -0.9 : 0.9, 0)))
      im.count = 3
      im.instanceMatrix.needsUpdate = true
    })
    desenhar()
    let px
    if (W) px = await r.readRenderTargetPixelsAsync(rt, 0, 0, L, A)
    else { px = new Uint8Array(L * A * 4); r.readRenderTargetPixels(rt, 0, 0, L, A, px) }
    r.setRenderTarget(null)
    r.setClearColor(cor, alfa)
    rt.dispose()
    // ponto (x, y) da cena -> pixel; no WebGPU a linha 0 fica em cima, no WebGL embaixo
    const vermelho = (x, y) => {
      const c = Math.round((x + 4) / 8 * L), yN = y / 2
      const l = Math.min(A - 1, Math.round(W ? (1 - yN) / 2 * A : (yN + 1) / 2 * A))
      return px[(l * L + c) * 4]
    }
    const medidas = { cima: xs[0].map((x) => vermelho(x, 0.9)), baixo: xs[1].map((x) => vermelho(x, -0.9)) }
    const ok = [...medidas.cima, ...medidas.baixo].every((v) => v > 20)
    return { ok, medidas, motivo: ok ? '' : 'cópia que nasceu depois do primeiro desenho saiu fora do lugar' }
  },

  // Regressão KAN-68 (17/10/2026): no WebGPU a atualização do toque e da areia ficou desligada desde a fase 1
  // (main.js), mesmo depois de os passes estarem portados: sem pegada, sem rastro, e a malha fina da areia não
  // acompanhava o jogador. Marca a areia ao lado do jogador, avança uns quadros e confere que o buffer da areia
  // mudou.
  async pegadasNaAreia(m) {
    const THREE = await import('three')
    let alvo = null
    m.cena.traverse((o) => { if (!alvo && o.name && o.name.startsWith('fatia-peixe')) alvo = o })
    if (!alvo) return { ok: false, motivo: 'não achei a barraca de peixe (lugar de areia)' }
    alvo.updateWorldMatrix(true, false)
    const p = new THREE.Vector3()
    if (alvo.isInstancedMesh) { const mi = new THREE.Matrix4(); alvo.getMatrixAt(0, mi); p.setFromMatrixPosition(alvo.matrixWorld.clone().multiply(mi)) } else p.setFromMatrixPosition(alvo.matrixWorld)
    m.irPara(p.x - 1.1, p.z + 2.6)
    const ler = async () => {
      const rt = m.areia._buffer()
      const L = rt.width, A = rt.height
      if (m.webgpu) return m.renderer.readRenderTargetPixelsAsync(rt, 0, 0, L, A)
      const b = new Uint16Array(L * A * 4)
      m.renderer.readRenderTargetPixels(rt, 0, 0, L, A, b)
      return b
    }
    for (let i = 0; i < 10; i++) m.passo(1 / 60, true)
    const antes = await ler()
    const j = m.jogador.pos
    m.areia.marcar(j.x + 1, j.z, 0.5, 0.2)
    for (let i = 0; i < 6; i++) m.passo(1 / 60, true)
    const depois = await ler()
    // a marca tem de aparecer no lugar dela: o buffer cobre AREA m em volta do jogador (u ao longo de x, v ao longo
    // de z); a marca fica 1 m a leste, na linha do meio (que é a mesma com a imagem virada ou não)
    const rt = m.areia._buffer()
    const L = rt.width, AREA = 24
    const cx = Math.round((1 / AREA + 0.5) * L), cy = Math.round(0.5 * L), raio = Math.max(2, Math.round(0.5 / AREA * L))
    let mudou = 0, naMarca = 0
    for (let y = 0; y < L; y++) {
      for (let x = 0; x < L; x++) {
        const i = (y * L + x) * 4
        if (antes[i] === depois[i]) continue
        mudou++
        if (Math.abs(x - cx) <= raio && Math.abs(y - cy) <= raio) naMarca++
      }
    }
    const ok = naMarca >= 3
    return { ok, medidas: { texelsQueMudaram: mudou, naMarca }, motivo: ok ? '' : 'a marca não chegou ao buffer da areia no lugar dela (toque e areia não atualizam)' }
  },

  // Regressão KAN-68 (17/10/2026, revisão de contexto limpo): no WebGPU a versão do material copiava opacidade e
  // textura uma vez só, na troca. O que o jogo muda depois no material original não chegava ao desenho: o facho do
  // farol (marcos.js muda opacity todo quadro) ficava apagado e a expressão do rosto (rosto.js troca o map dos
  // olhos e da boca) congelava. Um plano luzFixa: opacidade 0 e textura vermelha no primeiro desenho; depois
  // opacidade 1 e textura verde. O segundo desenho tem de sair verde.
  async propriedadeEmJogo(m) {
    const THREE = await import('three')
    const { luzFixa } = await import('/src/materiais.js')
    const r = m.renderer
    const W = m.gpu?.W || null
    if (m.webgpu && !W) return { ok: false, motivo: 'modo webgpu sem maresia.gpu (módulo e troca de materiais do jogo)' }
    // 64x64: linha de 256 bytes, o alinhamento que o WebGPU pede para enviar textura (2x2 dava erro de envio)
    const tex = (cor) => {
      const d = new Uint8Array(64 * 64 * 4)
      for (let i = 0; i < d.length; i += 4) d.set([...cor, 255], i)
      const t = new THREE.DataTexture(d, 64, 64)
      t.needsUpdate = true
      return t
    }
    const vermelha = tex([255, 0, 0]), verde = tex([0, 255, 0])
    const mat = luzFixa(new THREE.MeshBasicMaterial({ map: vermelha, transparent: true, opacity: 0, depthWrite: false }), 0)
    const cena = new THREE.Scene()
    cena.add(new THREE.Mesh(new THREE.PlaneGeometry(4, 4), mat))
    const cam = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 20)
    cam.position.set(0, 0, 10)
    cam.updateMatrixWorld()
    const L = 64, A = 64 // 64 de largura: a leitura de volta do WebGPU no three 0.170 não alinha linha menor
    const rt = W ? new W.RenderTarget(L, A, { count: 2 }) : new THREE.WebGLRenderTarget(L, A)
    if (W) { rt.textures[0].name = 'output'; rt.textures[1].name = 'gLuz' }
    const cor = r.getClearColor(new THREE.Color()), alfa = r.getClearAlpha()
    const desenhar = () => {
      if (W) m.gpu.preparar(cena)
      r.setRenderTarget(rt)
      if (W) r.setMRT(W.mrt({ output: W.output, gLuz: W.vec4(0, 0, 0, 1) }))
      r.setClearColor(0x000000, 1)
      r.clear()
      r.render(cena, cam)
      if (W) r.setMRT(null)
    }
    desenhar()
    mat.opacity = 1
    mat.map = verde
    desenhar()
    let px
    if (W) px = await r.readRenderTargetPixelsAsync(rt, 0, 0, L, A)
    else { px = new Uint8Array(L * A * 4); r.readRenderTargetPixels(rt, 0, 0, L, A, px) }
    r.setRenderTarget(null)
    r.setClearColor(cor, alfa)
    rt.dispose()
    const i = (32 * L + 32) * 4
    const medidas = { r: px[i], g: px[i + 1], b: px[i + 2] }
    const ok = medidas.g > 150 && medidas.r < 80
    return { ok, medidas, motivo: ok ? '' : 'mudança de opacidade ou de textura no material original não chegou ao desenho' }
  },

  // Regressão KAN-68 (17/10/2026, rodada na g4dn da AWS): com as matrizes das cópias numa lista em uniform, cada
  // objeto ganhava um nome de lista próprio no código do shader e o WebGPU compilava um programa de vértice por objeto
  // (638 no jogo; na NVIDIA do Linux a compilação levava minutos e o Chrome derrubava a placa). Dez blocos com o
  // mesmo material e a mesma forma têm de reaproveitar o programa.
  async programasReaproveitados(m) {
    const THREE = await import('three')
    const { pintar } = await import('/src/materiais.js')
    const r = m.renderer
    const W = m.gpu?.W || null
    if (m.webgpu && !W) return { ok: false, motivo: 'modo webgpu sem maresia.gpu (módulo e troca de materiais do jogo)' }
    const cena = new THREE.Scene()
    cena.add(new THREE.AmbientLight('#ffffff', 2))
    const geo = new THREE.BoxGeometry(0.3, 0.3, 0.3)
    const mat = pintar(new THREE.MeshToonMaterial({ color: '#2080ff' }), 'teste-programas')
    for (let b = 0; b < 10; b++) {
      const im = new THREE.InstancedMesh(geo, mat, 3)
      for (let i = 0; i < 3; i++) im.setMatrixAt(i, new THREE.Matrix4().makeTranslation(-3.5 + b * 0.7, -1 + i, 0))
      cena.add(im)
    }
    const cam = new THREE.OrthographicCamera(-4, 4, 2, -2, 0.1, 20)
    cam.position.set(0, 0, 10)
    cam.updateMatrixWorld()
    const contar = () => (W ? r._pipelines.programs.vertex.size : r.info.programs.length)
    const rt = W ? new W.RenderTarget(64, 32, { count: 2 }) : new THREE.WebGLRenderTarget(64, 32)
    if (W) { rt.textures[0].name = 'output'; rt.textures[1].name = 'gLuz'; m.gpu.preparar(cena) }
    const antes = contar()
    r.setRenderTarget(rt)
    if (W) r.setMRT(W.mrt({ output: W.output, gLuz: W.vec4(0, 0, 0, 1) }))
    r.render(cena, cam)
    if (W) r.setMRT(null)
    r.setRenderTarget(null)
    rt.dispose()
    const novos = contar() - antes
    const ok = novos <= 2
    return { ok, medidas: { programasNovos: novos, blocos: 10 }, motivo: ok ? '' : 'cada bloco de cópias compilou um programa de vértice próprio' }
  },

  // KAN-70 T3 (17/10/2026): no three 0.186 o PCFSoftShadowMap deixou de existir (o renderizador volta o tipo para
  // PCFShadowMap dentro do render) e o filtro, que troca o tipo de sombra no visual Arcane, achava a troca nova a
  // cada quadro e marcava todos os materiais para recompilar: 59 shaders montados por quadro, 0,8 FPS na g4dn no
  // WebGPU. Desenha quadros parados e confere que nenhum material mudou de versão.
  async semRecompilarParado(m) {
    const visual = m.cfg.estilo.visual
    m.cfg.estilo.visual = 'arcane'
    const pausado = m.controle.pausado
    m.controle.pausado = true
    const versoes = () => {
      let soma = 0
      const vistos = new Set()
      m.cena.traverse((o) => { if (o.material) for (const mt of [].concat(o.material)) if (!vistos.has(mt)) { vistos.add(mt); soma += mt.version } })
      return soma
    }
    for (let i = 0; i < 3; i++) m.passo(1 / 60) // a troca de visual pode recompilar uma vez
    const antes = versoes()
    for (let i = 0; i < 4; i++) m.passo(1 / 60)
    const mudou = versoes() - antes
    m.cfg.estilo.visual = visual
    m.controle.pausado = pausado
    const ok = mudou === 0
    return { ok, medidas: { versoesNovas: mudou }, motivo: ok ? '' : 'materiais marcados para recompilar em quadro parado' }
  },

  // KAN-70 T5 (17/10/2026): no WebGPU os uniforms globais do jogo ({ value } do WebGL, ligados por ref() em
  // render/gpu/comum.js) viravam nós por objeto: o three reescrevia cada um em cada objeto, cerca de 7 mil por
  // quadro, e o quadro custava 4 vezes o do WebGL por objeto. Conta as atualizações desses nós num quadro.
  async uniformsGlobaisUmaVez(m) {
    if (!m.webgpu) return { ok: true, medidas: { pulado: 'só no WebGPU' } }
    const F = m.renderer._nodes.nodeFrame
    const orig = F.updateNode
    let porObjeto = 0
    F.updateNode = function (no) {
      if (no.constructor.name === 'ReferenceNode' && no.property === 'value' && no.updateType === 'object' && !no.object?.isMaterial) porObjeto++
      return orig.call(this, no)
    }
    const pausado = m.controle.pausado
    m.controle.pausado = true
    try { m.passo(1 / 60) } finally { F.updateNode = orig; m.controle.pausado = pausado }
    const ok = porObjeto < 100
    return { ok, medidas: { atualizacoesPorObjeto: porObjeto }, motivo: ok ? '' : 'uniforms globais atualizados objeto a objeto' }
  },

  // KAN-70 T5 (17/10/2026): no WebGPU o three desenha a sombra de todos os objetos com um material só e copia nele o
  // alphaTest de cada objeto. Ligar e desligar o alphaTest (folha de coqueiro com, parede sem) sobe a versão do
  // material; o objeto seguinte vê a versão nova e recalcula a chave inteira do material: uns 160 por quadro, 3 ms na
  // g4dn. Conta esses recálculos em 1,5 s de jogo rodando.
  async sombraSemRecalcularChave(m) {
    if (!m.webgpu) return { ok: true, medidas: { pulado: 'só no WebGPU' } }
    const r = m.renderer
    let proto = null
    const get = r._objects.get
    r._objects.get = function (...a) { const ro = get.apply(this, a); proto = Object.getPrototypeOf(ro); return ro }
    await new Promise((res) => setTimeout(res, 300))
    r._objects.get = get
    if (!proto) return { ok: false, motivo: 'o jogo não desenhou (sem requestAnimationFrame)' }
    // quadros de verdade: a sombra é um nó por quadro do three, só roda quando o quadro do navegador avança
    let recalculos = 0, quadros = 0, vivo = true
    const chave = proto.getCacheKey
    proto.getCacheKey = function () { recalculos++; return chave.call(this) }
    const contar = () => { if (!vivo) return; quadros++; requestAnimationFrame(contar) }
    requestAnimationFrame(contar)
    try { await new Promise((res) => setTimeout(res, 1500)) } finally { vivo = false; proto.getCacheKey = chave }
    if (quadros < 5) return { ok: false, medidas: { quadros }, motivo: 'poucos quadros para medir' }
    const porQuadro = recalculos / quadros
    const ok = porQuadro < 20
    return { ok, medidas: { recalculosPorQuadro: +porQuadro.toFixed(1), quadros }, motivo: ok ? '' : 'chave do material recalculada objeto a objeto no passe de sombra' }
  },

  // KAN-70 T5 (17/10/2026): no three 0.186 o TextureNode zera o updateType na montagem do shader, e o
  // onRenderUpdate de refTex() (render/gpu/comum.js) deixou de rodar: o passe de toque e o de afundar a areia, que
  // trocam a imagem lida a cada quadro (vaivém de alvos), ficavam lendo a imagem em que estavam escrevendo. O WebGPU
  // recusa o quadro inteiro ("writable usage and another usage in the same synchronization scope"). Roda quadros e
  // pega os erros de validação do WebGPU.
  async alvosSemLerOQueEscreve(m) {
    if (!m.webgpu) return { ok: true, medidas: { pulado: 'só no WebGPU' } }
    const dev = m.renderer.backend.device
    const pausado = m.controle.pausado
    m.controle.pausado = true
    const erros = []
    try {
      for (let i = 0; i < 4; i++) {
        dev.pushErrorScope('validation')
        m.passo(1 / 60)
        const e = await dev.popErrorScope()
        if (e) erros.push(e.message.split('\n')[0].slice(0, 160))
      }
    } finally { m.controle.pausado = pausado }
    const ok = erros.length === 0
    return { ok, medidas: { erros: erros.slice(0, 3) }, motivo: ok ? '' : 'passe lendo a imagem em que escreve (erro de validação do WebGPU)' }
  },

  // KAN-70 T1 (17/10/2026): no WebGPU, cada bloco de cópias monta o shader dele no quadro em que aparece pela
  // primeira vez; andando pela cidade o jogo caía para 1,5 FPS na g4dn. Viaja pelos bancos da orla, olha para os
  // quatro lados em cada um e mede os quadros seguintes: nenhum pode passar de 150 ms. Chegar de teletransporte é
  // mais duro que andar (as casas perto montam de uma vez): no Mac o WebGL chega a 100 ms e o WebGPU sem
  // pré-aquecimento a 5,6 s.
  async semTravaAoChegar(m) {
    const bancos = (m.lugares?.bancos || []).filter((_, i) => i % 2 === 0)
    if (bancos.length < 4) return { ok: false, motivo: 'sem lugares (bancos) para viajar' }
    const antes = { pausado: m.controle.pausado }
    m.controle.pausado = true
    const tempos = []
    try {
      for (const b of bancos) {
        for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
          m.irPara(b.x, b.z, yaw)
          for (let i = 0; i < 4; i++) {
            const t0 = performance.now()
            m.passo(1 / 60, true)
            tempos.push(performance.now() - t0)
          }
        }
      }
    } finally {
      m.controle.pausado = antes.pausado
    }
    const ordenados = [...tempos].sort((a, b) => a - b)
    const medidas = {
      quadros: tempos.length,
      maiorMs: Math.round(ordenados[ordenados.length - 1]),
      p95Ms: Math.round(ordenados[Math.floor(ordenados.length * 0.95)]),
      medianaMs: Math.round(ordenados[Math.floor(ordenados.length / 2)]),
      acimaDe100: tempos.filter((t) => t > 100).length,
    }
    const ok = medidas.maiorMs <= 150
    return { ok, medidas, motivo: ok ? '' : 'quadro acima de 150 ms ao chegar num lugar novo (shader montado na hora)' }
  },

  // O campo do Urubu não pode ser coberto pela cidade: a planta oficial classifica a área como
  // terreo vazio, e o casario não pode construir em cima do campo (docs/mapa-1932.md).
  async campoDoUrubuVazio(m) {
    const mod = m.ocupacao1932
    if (!mod || !mod.ocupacao1932) return { ok: false, motivo: 'a ocupacao de 1932 nao carregou' }
    const mapa = await import('/src/mundo/mapa1932.js')
    const pontos = []
    for (const t of mapa.CAMPO_URUBU.tarefas) pontos.push(t.ponto)
    for (const g of mapa.CAMPO_URUBU.galpoes) pontos.push(g.ponto)
    for (const c of mapa.CAMPO_URUBU.construcoes) pontos.push(c.ponto)
    const comLote = pontos.filter(([x, z]) => mod.ocupacao1932(x, z) !== mod.OCUPA_VAZIO).length
    return {
      ok: comLote === 0,
      medidas: { pontos: pontos.length, comLote },
      motivo: comLote ? 'a cidade construiu em cima do campo do Urubu' : '',
    }
  },

  // O mínimo de toda mudança: o jogo carregou sem shader quebrado (os erros de console o executor junta)
  async semErros() {
    const quebrados = (window.__shadersQuebrados || []).length
    return { ok: quebrados === 0, medidas: { shadersQuebrados: quebrados }, motivo: quebrados ? 'shader que não compilou' : '' }
  },
}
