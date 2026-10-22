// As árvores dos quintais de 1932: mangueira, cajueiro e coqueiro atrás das
// casas.
//
// A planta oficial mostra o LOTE (a propriedade inteira) e a casa ocupa a
// frente dele. O quintal é o espaço que sobra entre a parede dos fundos da
// casa e o vizinho de trás: no jogo esse espaço é o interior da quadra (a
// faixa entre uma fileira de casas e a fileira de trás). É ali que a árvore
// fica, plantada com semente (a mesma semente dá sempre a mesma cidade).
//
// A árvore é medida em metros de verdade, como a casa: a posição sai da planta
// (o fundo do lote, em metros), vira lon/lat e só então vai para o jogo. O
// porte também acompanha a escala local, para a árvore ter o tamanho do
// quintal que ela sombreia.
//
// São poucas, de propósito: cada mangueira é uma copa de milhares de
// triângulos, e o jogo pesa na tela.

import * as THREE from 'three'
import { FACHADAS } from './casario1932.js'
import { FRENTES, emLonLat } from './casarioPlanta1932.js'
import { ll, metrosPorUn, LUGARES_RESERVADOS, lugaresJogo } from './fortaleza1932.js'
import { alturaTerreno, inclinacao } from './terreno.js'
import { distCosta, larguraPraia } from './mapa.js'
import { toonVertice } from '../materiais.js'
import { adicionarCirculo } from './colisao.js'
import { ocupacao } from './ocupacao.js'
import { criarAleatorio } from '../utils.js'
import { instanciarEmBlocos } from './blocos.js'
import { cajueiro, mangueira } from './especies-quintal.js'

// onde o coqueiro faz sentido: a palmeira é da praia
// (docs/referencias-fotos-1932.md); os outros são da cidade
const COQUEIRO_PERTO_DA_PRAIA = 160
// o lote tem que ter fundura para ter quintal (m)
const FUNDO_MINIMO = 6

// o raio que a copa ocupa no chão, e o do tronco (para a colisão)
const TRONCO = { mangueira: 0.5, cajueiro: 0.45, coqueiro: 0.28 }

// Onde a árvore pode nascer: a lista de candidatos, com semente. Separada do
// plantio para poder ser conferida sem abrir a cena (testes/unidade).
export function candidatosDoQuintal(cfg, semente = 1932) {
  const rnd = criarAleatorio(semente)
  const cfgQ = cfg.casario.quintal
  const lista = []
  for (const f of FRENTES) {
    if (!rnd.chance(cfgQ.densidade)) continue
    if (f.prof < FUNDO_MINIMO) continue // lote raso demais: não há quintal
    // o fundo do lote, em metros: o meio da frente mais a profundidade do lote
    // para dentro (a normal do lote aponta para a rua)
    const mx = (f.a[0] + f.b[0]) / 2
    const mz = (f.a[1] + f.b[1]) / 2
    const dentro = f.prof + cfgQ.folga // a árvore fica logo atrás da casa
    const lateral = rnd.entre(-0.3, 0.3) * f.larg
    const ux = f.b[0] - f.a[0]
    const uz = f.b[1] - f.a[1]
    const comp = Math.hypot(ux, uz) || 1
    const rx = mx + f.normal[0] * dentro + (ux / comp) * lateral
    const rz = mz + f.normal[1] * dentro + (uz / comp) * lateral
    const [lon, lat] = emLonLat(rx, rz)
    // o coqueiro é da praia; a mangueira é das sombras fundas do quintal
    const [jx, jz] = ll(lon, lat)
    const pertoDoMar = distCosta(jx, jz) < COQUEIRO_PERTO_DA_PRAIA
    let esp = 'cajueiro'
    if (pertoDoMar && rnd.chance(0.45)) esp = 'coqueiro'
    else if (f.prof > 16 && rnd.chance(0.5)) esp = 'mangueira'
    const escalaReal = esp === 'coqueiro' ? rnd.entre(0.8, 1.05) : esp === 'mangueira' ? rnd.entre(0.9, 1.15) : rnd.entre(0.85, 1.1)
    lista.push({ esp, lon, lat, prof: f.prof, profUsado: dentro, escalaReal })
  }
  return lista
}

// A grade das casas: para saber onde há espaço livre atrás delas. Célula de
// 4 m: só interessa saber se o ponto está dentro de alguma casa.
const CEL = 4
function gradeDasCasas() {
  const grade = new Map()
  for (const f of FACHADAS) {
    const r = Math.hypot(f.w, f.d) / 2 + 1
    const c = Math.cos(f.rot), s = Math.sin(f.rot)
    const i0 = Math.floor((f.x - r) / CEL), i1 = Math.floor((f.x + r) / CEL)
    const j0 = Math.floor((f.z - r) / CEL), j1 = Math.floor((f.z + r) / CEL)
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const dx = (i + 0.5) * CEL - f.x, dz = (j + 0.5) * CEL - f.z
        const lx = dx * c - dz * s, lz = dx * s + dz * c
        if (Math.abs(lx) <= f.w / 2 && Math.abs(lz) <= f.d / 2) grade.set(i * 100003 + j, true)
      }
    }
  }
  return grade
}

export function criarQuintal1932(cena, cfg, pecas) {
  const rnd = criarAleatorio(1932)
  const cfgQ = cfg.casario.quintal
  // a árvore de cada espécie: poucas variantes, com semente própria. A folhagem
  // do quintal sai com menos faces (elas ficam atrás das casas, longe de quem
  // olha, e a conta de triângulos da tela importa).
  const rndE = criarAleatorio(1933)
  const variantes = (fn, n) => Array.from({ length: n }, () => ({ geo: fn(rndE), mats: [] }))
  const ESP = {
    mangueira: variantes((r) => mangueira(r, { barato: true }), 3),
    cajueiro: variantes((r) => cajueiro(r, { barato: true }), 3),
    coqueiro: [],
  }
  const grade = gradeDasCasas()
  const livre = (x, z) => !grade.has(Math.floor(x / CEL) * 100003 + Math.floor(z / CEL))

  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const Y = new THREE.Vector3(0, 1, 0)

  // o plantio de uma árvore: a posição vem da planta (metros), vira jogo e só
  // entra se o chão estiver livre
  const plantar = (cand) => {
    const [x, z] = ll(cand.lon, cand.lat)
    const raio = TRONCO[cand.esp] * cand.escalaReal + 0.8
    if (!livre(x, z)) return false
    if (!ocupacao.livre(x, z, raio, raio)) return false
    const h = alturaTerreno(x, z)
    if (h < 0.6) return false // água
    if (inclinacao(x, z) > 0.6) return false
    const sc = distCosta(x, z)
    if (sc < larguraPraia(x) + 1) return false // ainda é praia
    // perto de um lugar reservado (o campo do Urubu, o cemiterio) não se planta
    for (const [chave, raio2] of LUGARES_RESERVADOS) {
      const l = lugaresJogo[chave]
      if (!l) continue
      if (Math.hypot(l[0] - x, l[1] - z) < raio2) return false
    }
    ocupacao.marcar(x, z, raio, raio)
    // o porte: a árvore é medida em metros de verdade, e a escala local diz
    // quantas unidades de jogo vale um metro ali
    const esc = (cand.escalaReal / metrosPorUn(x, z)) * rnd.entre(0.9, 1.1)
    q.setFromAxisAngle(Y, rnd.entre(0, Math.PI * 2))
    const mm = new THREE.Matrix4().compose(new THREE.Vector3(x, h - 0.1, z), q, new THREE.Vector3(esc, esc, esc))
    if (cand.esp === 'coqueiro') ESP.coqueiro.push(mm)
    else rnd.escolha(ESP[cand.esp]).mats.push(mm)
    adicionarCirculo(x, z, TRONCO[cand.esp] * esc)
    return true
  }

  let plantadas = 0
  for (const cand of candidatosDoQuintal(cfg)) {
    if (plantar(cand)) plantadas++
  }

  const mat = toonVertice()
  const blocos = []
  const guardar = (r) => { if (Array.isArray(r)) blocos.push(...r) }
  for (const esp of ['mangueira', 'cajueiro']) {
    for (const v of ESP[esp]) {
      if (!v.mats.length) continue
      guardar(instanciarEmBlocos(cena, v.geo, mat, v.mats, null, { nome: `quintal-${esp}`, placa: true }))
    }
  }
  // o coqueiro: a mesma geometria e o mesmo material dos coqueiros das vilas
  // (as folhas balançam com o vento)
  if (ESP.coqueiro.length && pecas) {
    guardar(instanciarEmBlocos(cena, pecas.geoTronco, pecas.matTronco, ESP.coqueiro, null, { nome: 'quintal-coqueiro', placa: true }))
    guardar(instanciarEmBlocos(cena, pecas.geoCopa, pecas.matCopa, ESP.coqueiro, null, { nome: 'quintal-copa', semNormal: true, placa: true }))
  }
  // Longe, o quintal some (21/10/2026, orçamento da cidade cheia): a árvore fica atrás da casa, e além
  // de cfg.casario.quintal.ate (m) a copa já não aparece por cima do telhado; o bloco inteiro de 96 m
  // sai do desenho e da sombra. Na vista mais cheia (a Coluna da Hora) os quintais custavam ~2,5 ms.
  const esferas = blocos.map((m) => { m.updateMatrixWorld(true); return m.boundingSphere ? m.boundingSphere.clone().applyMatrix4(m.matrixWorld) : null })
  let ultimo = 0
  return {
    plantadas,
    atualizar(camera) {
      const agora = performance.now()
      if (!camera || agora - ultimo < 400) return
      ultimo = agora
      const ate = cfg.casario.quintal.ate
      for (let i = 0; i < blocos.length; i++) {
        const s = esferas[i]
        if (!s) continue
        const d = Math.max(0, Math.hypot(camera.position.x - s.center.x, camera.position.z - s.center.z) - s.radius)
        const ver = d < ate
        if (blocos[i].visible !== ver) blocos[i].visible = ver
      }
    },
  }
}
