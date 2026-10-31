// Rastreador de picos (24/10/2026): para cada quadro lento, o que aconteceu dentro dele.
// Fontes: as marcas do jogo (debug/marcas.js: sombra refeita, teleporte, Jolt, Rapier), os arquivos que terminaram
// de chegar (PerformanceObserver 'resource'), as tarefas longas ('longtask'), programas de shader novos e
// geometrias/texturas novas (renderer.info, só WebGL) e a queda do heap (sinal de coleta de lixo).

import { marcasEntre } from './marcas.js'

// Junta as pistas de um quadro (de, ate] numa lista legível. Pura: os testes chamam direto.
export function explicarQuadro({ de, ate, marcas = [], recursos = [], longas = [], antes = {}, depois = {} }) {
  const pistas = []
  for (const e of marcas) if (e.t > de && e.t <= ate) pistas.push(e.dados ? `${e.nome} ${JSON.stringify(e.dados)}` : e.nome)
  for (const r of recursos) if (r.fim > de && r.fim <= ate) pistas.push(`arquivo ${r.nome}`)
  for (const l of longas) if (l.ini < ate && l.ini + l.dur > de) pistas.push(`tarefa longa ${Math.round(l.dur)} ms`)
  const d = (k) => (depois[k] ?? 0) - (antes[k] ?? 0)
  if (d('programas') > 0) pistas.push(`shaders novos: ${d('programas')}`)
  if (d('geometrias') > 0) pistas.push(`geometrias novas: ${d('geometrias')}`)
  if (d('texturas') > 0) pistas.push(`texturas novas: ${d('texturas')}`)
  // Fase 2: o número de desenhos do quadro (renderer.info.render.calls): se o quadro foi caro por
  // causa de muitos desenhos, isto diz (a meta do plano é 100 desenhos no centro)
  if (depois.desenhos > 0) pistas.push(`desenhos: ${depois.desenhos}`)
  if (d('heapMB') < -8) pistas.push(`heap caiu ${Math.round(-d('heapMB'))} MB (coleta de lixo?)`)
  return pistas
}

export function criarRastreador(m) {
  const recursos = []
  const longas = []
  const obs = []
  const observar = (tipo, f) => {
    try {
      const o = new PerformanceObserver((l) => { for (const e of l.getEntries()) f(e) })
      o.observe({ type: tipo, buffered: false })
      obs.push(o)
    } catch { /* navegador sem esse tipo */ }
  }
  observar('resource', (e) => recursos.push({ nome: e.name.split('/').pop().slice(0, 60), fim: e.responseEnd || e.startTime + e.duration }))
  observar('longtask', (e) => longas.push({ ini: e.startTime, dur: e.duration }))
  const info = () => {
    const i = m.renderer?.info
    return {
      programas: i?.programs?.length ?? 0,
      geometrias: i?.memory?.geometries ?? 0,
      texturas: i?.memory?.textures ?? 0,
      // Fase 2: os desenhos do quadro (renderer.info.render.calls)
      desenhos: i?.render?.calls ?? 0,
      heapMB: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : 0,
    }
  }
  let antes = info()
  return {
    // chamar no fim de cada quadro; devolve o detalhe se ele passou do limite
    quadro(de, ate, limite) {
      const depois = info()
      let r = null
      if (ate - de > limite) {
        const p = m.jogador?.pos
        r = { t: Math.round(de), ms: +(ate - de).toFixed(1), pos: p ? [Math.round(p.x), Math.round(p.z)] : null,
          pistas: explicarQuadro({ de, ate, marcas: marcasEntre(de, ate), recursos, longas, antes, depois }) }
      }
      antes = depois
      // limpa o que ficou para trás
      while (recursos.length && recursos[0].fim < de - 1000) recursos.shift()
      while (longas.length && longas[0].ini + longas[0].dur < de - 1000) longas.shift()
      return r
    },
    parar() { for (const o of obs) o.disconnect() },
  }
}
