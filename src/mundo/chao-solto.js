// Chão solto (21/10/2026): pedrisco, conchas, torrões e touceiras secas em 3D, só perto da câmera.
//
// O relevo pintado (relevo-chao.js) dá a forma do chão; isto põe por cima o que tem volume de verdade e projeta
// silhueta contra a luz baixa: o pedrisco da rua de terra (quadro 1 do conceito-sertão), as conchas e o cascalho da
// praia, os torrões e as touceiras de capim seco do Campo do Urubu e do mato (quadro 3).
//
// Tudo é sorteado uma vez, com semente, sobre a grade do terreno (o peso de cada tipo de chão de terreno.js) e vai em
// blocos de cópias de 64 m. Só os blocos a menos de cfg.chao.soltoRaio da câmera ficam visíveis: de longe a peça tem
// poucos pixels e quem desenha o chão é o relevo. Não projeta sombra (peça de 3 a 40 cm é menor que o pixel do mapa de
// sombra) e não tem colisão.
//
// Desde 22/10/2026 (docs/desempenho-22-10.md) o bloco só existe como objeto perto da câmera: as cópias ficam guardadas
// por célula de 64 m, a malha do bloco nasce quando a câmera chega a menos de raio + 64 m da célula e só fica na cena
// enquanto está nessa faixa. Antes eram 5.854 blocos na cena (434 mil pedras) para mostrar uns 10: cada objeto da cena
// custava CPU por quadro mesmo escondido (o laço da visibilidade, a matriz do mundo e a travessia do desenho). A regra
// de quem aparece é a mesma de antes (a esfera do bloco a menos do raio), então a imagem não muda.

import * as THREE from 'three'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { toon } from '../materiais.js'
import { instanciarEmBlocos } from './blocos.js'
import { LIMITES, distCosta, larguraPraia } from './mapa.js'
import { alturaTerreno, amostraSolo } from './terreno.js'
import { criarAleatorio } from '../utils.js'
import { CAL, CHAO } from '../paleta.js'

const TAM_BLOCO = 64

// pedra: icosaedro arredondado, achatado depois por cópia
function geometriaPedra() {
  const g = mergeVertices(new THREE.IcosahedronGeometry(1, 1).deleteAttribute('normal').deleteAttribute('uv'))
  // calombos: cada vértice um pouco para dentro ou para fora (com semente), a pedra não sai bola
  const rnd = criarAleatorio(1932)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const k = 0.82 + rnd.proximo() * 0.3
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k)
  }
  g.computeVertexNormals()
  return g
}

// touceira: folhas finas que saem de um tufo, abertas para fora, a ponta mais clara (cor por vértice)
function geometriaTouceira() {
  const rnd = criarAleatorio(77)
  const partes = []
  const base = new THREE.Color(CHAO.matoSeco).multiplyScalar(0.6)
  const ponta = new THREE.Color(CAL.palha)
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rnd.entre(-0.3, 0.3)
    const alt = rnd.entre(0.6, 1.0)
    const larg = rnd.entre(0.025, 0.045)
    const abre = rnd.entre(0.25, 0.6)
    const g = new THREE.BufferGeometry()
    // folha: triângulo da base até a ponta, inclinado para fora
    const v = new Float32Array([-larg, 0, 0, larg, 0, 0, 0, alt, abre * alt])
    g.setAttribute('position', new THREE.BufferAttribute(v, 3))
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array([base.r, base.g, base.b, base.r, base.g, base.b, ponta.r, ponta.g, ponta.b]), 3))
    g.rotateY(a)
    g.computeVertexNormals()
    partes.push(g)
  }
  const g = mergeGeometries(partes)
  // normal para cima (a folha fina iluminada pelos dois lados, como a grama de grama.js)
  const n = g.attributes.normal
  const v = new THREE.Vector3()
  for (let i = 0; i < n.count; i++) {
    v.set(n.getX(i) * 0.3, 1, n.getZ(i) * 0.3).normalize()
    n.setXYZ(i, v.x, v.y, v.z)
  }
  return g
}

// Sorteia as peças sobre a grade do terreno. Devolve as matrizes e as cores de cada tipo.
export function sortearChaoSolto(cfg) {
  const rnd = criarAleatorio(1881)
  const { x0, x1, z0, z1, passo } = LIMITES
  const pedras = []
  const coresPedra = []
  const tufos = []
  const coresTufo = []
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  const pos = new THREE.Vector3()
  const esc = new THREE.Vector3()
  const am = { solo: [0, 0, 0, 0], piso: 0, rota: -1 }
  const dens = cfg.chao.soltoDensidade ?? 1
  const cPedra = [CAL.calVelha, CAL.piuba, CHAO.rocha, CAL.taipa, CHAO.poeira]
  const cConcha = [CAL.cal, '#f4ead8', CAL.calVelha, CAL.rosa]
  const cTorrao = [CHAO.terraRachada, CHAO.rodeiro, CAL.taipa]
  const cTufo = [CHAO.matoSeco, '#a7a47a', '#8f9470', CAL.palha]
  const pedra = (x, z, r, cor, afunda) => {
    const y = alturaTerreno(x, z)
    if (y < 0.08) return
    e.set(rnd.entre(-0.3, 0.3), rnd.entre(0, Math.PI * 2), rnd.entre(-0.3, 0.3))
    q.setFromEuler(e)
    esc.set(r * rnd.entre(0.8, 1.3), r * rnd.entre(0.4, 0.65), r * rnd.entre(0.7, 1.1))
    pos.set(x, y + esc.y * (1 - afunda), z)
    pedras.push(m.compose(pos, q, esc).clone())
    coresPedra.push(cor)
  }
  for (let z = z0; z < z1; z += passo) {
    for (let x = x0; x < x1; x += passo) {
      amostraSolo(x, z, am)
      const [areia, terra, racha, grama] = am.solo
      if (grama > 0.35) continue
      // quantas peças nesta célula de 3 m (média), por tipo
      const s = distCosta(x, z)
      const praia = s > -2 && s < larguraPraia(x)
      const nConcha = praia ? areia * 1.6 : areia * 0.25
      // terra 1 = rua ou quintal, 0,6 = mato seco (solo-chao.js)
      const mato = am.rota < 0 && terra > 0.3 && terra < 0.75 ? terra : 0
      const quintal = am.rota < 0 && terra >= 0.75 ? terra : 0
      const rua = am.rota >= 0 ? terra * (1 - am.piso) : 0
      // na rua mais pedra (o quadro 1 do conceito-sertão), e as maiores na beira, onde a roda não passa
      const beira = am.rota >= 0 ? Math.min(1, Math.max(0, (am.rota - 0.45) / 0.4)) : 0
      const nPedra = rua * (1.4 + 3.5 * beira) + quintal * 0.35 + mato * 0.08 + am.piso * 0.1
      const nTorrao = racha * 1.2 + quintal * 0.12
      const nTufo = racha * 0.35 + mato * 0.25
      const sortear = (n) => { let k = Math.floor(n * dens); if (rnd.proximo() < n * dens - k) k++; return k }
      for (let i = sortear(nConcha); i > 0; i--) {
        const r = rnd.entre(0.012, 0.035)
        pedra(x + rnd.entre(0, passo), z + rnd.entre(0, passo), r, rnd.escolha(cConcha), 0.35)
      }
      for (let i = sortear(nPedra); i > 0; i--) {
        const r = rnd.chance(0.15 + 0.4 * beira) ? rnd.entre(0.05, 0.13) : rnd.entre(0.02, 0.05)
        pedra(x + rnd.entre(0, passo), z + rnd.entre(0, passo), r, rnd.escolha(cPedra), 0.4)
      }
      for (let i = sortear(nTorrao); i > 0; i--) {
        pedra(x + rnd.entre(0, passo), z + rnd.entre(0, passo), rnd.entre(0.04, 0.12), rnd.escolha(cTorrao), 0.5)
      }
      for (let i = sortear(nTufo); i > 0; i--) {
        const tx = x + rnd.entre(0, passo)
        const tz = z + rnd.entre(0, passo)
        const y = alturaTerreno(tx, tz)
        if (y < 0.3) continue
        const h = rnd.entre(0.22, 0.5)
        e.set(rnd.entre(-0.12, 0.12), rnd.entre(0, Math.PI * 2), rnd.entre(-0.12, 0.12))
        q.setFromEuler(e)
        esc.set(h * rnd.entre(0.8, 1.3), h, h * rnd.entre(0.8, 1.3))
        pos.set(tx, y - 0.02, tz)
        tufos.push(m.compose(pos, q, esc).clone())
        coresTufo.push(rnd.escolha(cTufo))
      }
    }
  }
  return { pedras, coresPedra, tufos, coresTufo }
}

// as cópias de cada tipo, separadas na célula de 64 m em que caem (a mesma grade dos blocos de antes)
export function separarPorCelula(matrizes, cores, tam = TAM_BLOCO, celulas = new Map(), tipo = 0) {
  const p = new THREE.Vector3()
  for (let i = 0; i < matrizes.length; i++) {
    p.setFromMatrixPosition(matrizes[i])
    const ci = Math.floor(p.x / tam)
    const cj = Math.floor(p.z / tam)
    const k = `${ci},${cj}`
    let c = celulas.get(k)
    if (!c) { c = { ci, cj, tipos: [], malhas: null, naCena: false }; celulas.set(k, c) }
    const t = (c.tipos[tipo] ||= { matrizes: [], cores: [] })
    t.matrizes.push(matrizes[i])
    t.cores.push(cores[i])
  }
  return celulas
}

// as chaves das células que encostam no quadrado de lado 2 * alcance em volta de (x, z)
export function celulasEmVolta(x, z, alcance, tam = TAM_BLOCO) {
  const lista = []
  for (let cj = Math.floor((z - alcance) / tam); cj <= Math.floor((z + alcance) / tam); cj++) {
    for (let ci = Math.floor((x - alcance) / tam); ci <= Math.floor((x + alcance) / tam); ci++) lista.push(`${ci},${cj}`)
  }
  return lista
}

// sorteio: as peças já sorteadas (os testes passam as deles; o jogo sorteia sobre o terreno)
export function criarChaoSolto(cena, cfg, sorteio = null) {
  const t0 = performance.now()
  const { pedras, coresPedra, tufos, coresTufo } = sorteio || sortearChaoSolto(cfg)
  const matPedra = toon('#ffffff', { semCache: true })
  const matTufo = toon('#ffffff', { semCache: true, vertexColors: true, side: THREE.DoubleSide })
  const geoPedra = geometriaPedra()
  const geoTufo = geometriaTouceira()
  const celulas = separarPorCelula(pedras, coresPedra)
  separarPorCelula(tufos, coresTufo, TAM_BLOCO, celulas, 1)
  // a malha da célula, na hora em que a câmera chega (os mesmos blocos que instanciarEmBlocos fazia: tam fixo de 64 m,
  // sem junção, uma malha por tipo); fora da cena até a primeira vez que aparece
  const deposito = new THREE.Group()
  const montar = (c) => {
    c.malhas = []
    const [p, t] = c.tipos
    if (p) c.malhas.push(...instanciarEmBlocos(deposito, geoPedra, matPedra, p.matrizes, p.cores, { tam: TAM_BLOCO, nome: 'chao-solto-pedras', sombra: false, peso: 0.4 }))
    if (t) c.malhas.push(...instanciarEmBlocos(deposito, geoTufo, matTufo, t.matrizes, t.cores, { tam: TAM_BLOCO, nome: 'chao-solto-touceiras', sombra: false, peso: 0.5 }))
    for (const b of c.malhas) {
      b.visible = false
      // a esfera no mundo (a malha fica na origem, sem pai que se mexa): a mesma conta que o laço fazia todo quadro
      b.userData.centro = b.boundingSphere.center.clone()
      b.userData.raio = b.boundingSphere.radius
    }
    deposito.remove(...c.malhas)
  }
  // o pré-aquecimento do WebGPU (renderizador.js) monta o shader de quem está na cena: um bloco de cada tipo fica
  // sempre nela (escondido quando longe), para a primeira pedra não montar shader no meio do jogo
  const fixos = []
  for (const tipo of [0, 1]) {
    const c = [...celulas.values()].find((x) => x.tipos[tipo] && x.tipos[1 - tipo])
    if (c && !c.malhas) { montar(c); c.fixa = true; c.naCena = true; cena.add(...c.malhas); fixos.push(c) }
  }
  const naCena = new Set(fixos)
  window.__tChaoSolto = { ms: Math.round(performance.now() - t0), pedras: pedras.length, touceiras: tufos.length, celulas: celulas.size }
  const cp = new THREE.Vector3()
  const c2 = new THREE.Vector3()
  return {
    celulas,
    naCena,
    geometrias: [geoPedra, geoTufo],
    atualizar(camera) {
      const raio = (cfg.chao.solto ?? true) ? cfg.chao.soltoRaio ?? 40 : -1e9
      cp.copy(camera.position)
      if (cfg.desempenho?.chaoSoltoPerto === false) {
        // como era até 22/10/2026, para medir (painel, Desempenho): todas as células na cena e o laço em todas
        for (const c of celulas.values()) {
          if (!c.malhas) montar(c)
          if (!c.naCena) { c.naCena = true; cena.add(...c.malhas); naCena.add(c) }
          for (const b of c.malhas) b.visible = c2.copy(b.boundingSphere.center).applyMatrix4(b.matrixWorld).distanceTo(cp) - b.userData.raio < raio
        }
        return
      }
      // as células na faixa (raio + uma célula): montadas e na cena; quem saiu da faixa sai da cena
      const perto = new Set()
      if (raio > 0) {
        for (const k of celulasEmVolta(cp.x, cp.z, raio + TAM_BLOCO)) {
          const c = celulas.get(k)
          if (!c) continue
          perto.add(c)
          if (!c.malhas) montar(c)
          if (!c.naCena) { c.naCena = true; cena.add(...c.malhas); naCena.add(c) }
        }
      }
      for (const c of naCena) {
        if (!perto.has(c) && !c.fixa) { c.naCena = false; cena.remove(...c.malhas); naCena.delete(c); continue }
        for (const b of c.malhas) b.visible = b.userData.centro.distanceTo(cp) - b.userData.raio < raio
      }
    },
  }
}
