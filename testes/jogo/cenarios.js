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

  // O mínimo de toda mudança: o jogo carregou sem shader quebrado (os erros de console o executor junta)
  async semErros() {
    const quebrados = (window.__shadersQuebrados || []).length
    return { ok: quebrados === 0, medidas: { shadersQuebrados: quebrados }, motivo: quebrados ? 'shader que não compilou' : '' }
  },
}
