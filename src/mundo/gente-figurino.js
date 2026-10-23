// O figurino da gente de 1932 (docs/figurino.md) em fichas: cada ficha diz o corpo, a roupa, o chapéu, os pés, a
// carga e as cores de cada papel. A mesma ficha veste a figura parada (figuraGeo: uma malha com cor por vértice, de
// perto e de longe) e o ator animado (atores.js: as mesmas peças presas aos ossos, a cor por cópia).
//
// Os sorteios das cores das fichas da cidade saem do rnd da cidade na MESMA ordem e na mesma quantidade da figura
// antiga (pele, roupa, baixo, chance de chapéu, cor do chapéu, cabelo): o resto da cidade (quem fica onde) continua
// sorteado igual. O que é novo (o feitio do chapéu, a carga, as fichas a mais) vem de um sorteio à parte.

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { vestir, juntasDePe, juntasSentado, juntasCrianca, CABECA_CRIANCA } from './gente-corpo.js'
import { GENTE } from '../paleta.js'
import { criarAleatorio } from '../utils.js'

// as listas da figura antiga (pessoas.js até 22/10/2026), com o mesmo tamanho: o sorteio cai no mesmo índice
const PELES = GENTE.peles
const ROUPAS = ['#efe9dc', '#efe9dc', '#e4dccb', '#d9cbb0', '#8a5a3c', '#a5764f', '#9aa0a3', '#6f7f8f', '#c9b48a', '#efe9dc']
const BAIXO = ['#efe9dc', '#d9cbb0', '#6b5a4a', '#8a5a3c', '#5a5a5e', '#9aa0a3']
const VESTIDOS = ['#efe9dc', '#e2d3bd', '#c9b6c0', '#b9c4c9', '#d8c48f', '#a9b49a']
const CHAPEUS = ['#d9bf86', '#d9bf86', '#c8a86a', '#e9dcc0', '#3b3330']
const CABELO = GENTE.cabelo

// a figura antiga sorteava assim; devolve as cores na mesma ordem de sorteio
export function sorteioAntigo(r, mulher, P = {}) {
  const pele = r.escolha(P.peles || PELES)
  const roupa = mulher ? r.escolha(P.vestidos || VESTIDOS) : r.escolha(P.roupas || ROUPAS)
  const baixo = mulher ? roupa : r.escolha(P.baixos || BAIXO)
  let chapeu = null
  if (!mulher || r.chance(0.35)) chapeu = r.escolha(P.chapeus || CHAPEUS)
  const cabelo = r.escolha(CABELO)
  return { pele, roupa, baixo, chapeu, cabelo }
}

const ESCURO = (c) => new THREE.Color(c).getHSL({ h: 0, s: 0, l: 0 }).l < 0.3

// ---------------------------------------------------------------------------------------------------------------
// as fichas da cidade: 12 de pé e 6 sentadas no lugar das 18 figuras antigas (mesmos sorteios), mais as novas

export function fichasDaCidade(rnd) {
  const r2 = criarAleatorio(80812)
  const antigosPe = []
  for (let i = 0; i < 12; i++) antigosPe.push(sorteioAntigo(rnd, i % 3 === 0))
  const antigosSentados = []
  for (let i = 0; i < 6; i++) antigosSentados.push(sorteioAntigo(rnd, i % 3 === 0))
  const linho = () => r2.escolha(GENTE.linho)
  const palha = () => r2.escolha(GENTE.palha)
  const homem = (a, extra) => ({ corpo: 'homem', cores: { pele: a.pele, camisa: a.roupa, listra: linho(), calca: a.baixo, chapeu: a.chapeu || palha(), cabelo: a.cabelo }, ...extra })
  const mulher = (a, extra) => ({ corpo: 'mulher', cores: { pele: a.pele, camisa: a.roupa, listra: r2.escolha(GENTE.vestidos), calca: a.roupa, chapeu: a.chapeu || palha(), cabelo: a.cabelo }, ...extra })
  // o chapéu escuro sorteado vira feltro; o claro, palheta (as duas da foto de 1930)
  const chapeuDe = (a, claro = 'palheta') => (a.chapeu && ESCURO(a.chapeu) ? 'feltro' : claro)
  const A = antigosPe
  const pe = [
    mulher(A[0], { roupa: 'vestido', chapeu: 'touca', cabelo: 'coque' }),
    homem(A[1], { roupa: 'terno', chapeu: chapeuDe(A[1]) }),
    homem(A[2], { roupa: 'terno', chapeu: chapeuDe(A[2]) }),
    mulher(A[3], { roupa: 'vestido', sombrinha: true, cabelo: 'coque' }),
    homem(A[4], { roupa: 'camisa', manga: 'curta', chapeu: chapeuDe(A[4]) }),
    homem(A[5], { roupa: 'camisaFora', chapeu: 'palha', pes: 'descalco', arregacada: true, calcaLarga: true, manga: 'arregacada' }),
    mulher(A[6], { roupa: 'vestido', cabelo: 'solto' }),
    homem(A[7], { roupa: 'terno', chapeu: chapeuDe(A[7], 'feltro') }),
    homem(A[8], { roupa: 'camisaFora', carga: 'fardo', chapeu: null, calcaLarga: true, cores: { ...homem(A[8]).cores, listra: '#d9cbb0' } }),
    // a pobre da cidade já instalada: blusa e saia de chita, lenço (docs/figurino.md, seção 3)
    mulher(A[9], { roupa: 'saia', chapeu: 'lenco', cores: { pele: A[9].pele, camisa: '#efe9dc', listra: r2.escolha(GENTE.chitas), calca: r2.escolha(GENTE.chitas), chapeu: '#efe9dc', cabelo: A[9].cabelo } }),
    homem(A[10], { roupa: 'terno', chapeu: chapeuDe(A[10]) }),
    homem(A[11], { roupa: 'camisa', chapeu: 'palha', calcaLarga: true }),
  ]
  // fichas novas (sorteio à parte): a moça de sombrinha, a vendedora com o cesto de fruta, a empregada de lenço
  // branco, o menino e a menina (só nos grupos parados: não andam nem viram ator)
  const p2 = () => r2.escolha(PELES)
  const c2 = () => r2.escolha(CABELO)
  pe.push({ corpo: 'mulher', roupa: 'vestido', sombrinha: true, chapeu: 'touca', cabelo: 'coque', cores: { pele: p2(), camisa: r2.escolha(GENTE.vestidos), listra: '#efe9dc', calca: '#efe9dc', chapeu: '#e9dcc0', cabelo: c2() } })
  pe.push({ corpo: 'mulher', roupa: 'saia', carga: 'cesto', chapeu: null, cabelo: 'coque', pes: 'descalco', cores: { pele: r2.escolha(PELES.slice(2)), camisa: '#efe9dc', listra: r2.escolha(GENTE.fruta), calca: r2.escolha(GENTE.chitas), chapeu: '#c8a86a', cabelo: c2() } })
  pe.push({ corpo: 'mulher', roupa: 'vestidoLongo', chapeu: 'lenco', cabelo: 'coque', cores: { pele: r2.escolha(PELES.slice(3)), camisa: '#efe9dc', listra: '#f2ede2', calca: '#efe9dc', chapeu: '#efe9dc', cabelo: c2() } })
  pe.push({ corpo: 'homem', roupa: 'terno', chapeu: 'palheta', cores: { pele: p2(), camisa: '#efe9dc', listra: '#f4f0e6', calca: '#efe9dc', chapeu: '#d9bf86', cabelo: c2() } })
  pe.push({ corpo: 'menino', roupa: 'calcao', chapeu: null, pes: 'descalco', manga: 'curta', crianca: true, cores: { pele: p2(), camisa: linho(), listra: linho(), calca: r2.escolha(GENTE.couro), chapeu: palha(), cabelo: c2() } })
  pe.push({ corpo: 'menina', roupa: 'vestido', chapeu: null, pes: 'descalco', cabelo: 'coque', crianca: true, cores: { pele: p2(), camisa: r2.escolha(GENTE.vestidos), listra: '#efe9dc', calca: '#efe9dc', chapeu: palha(), cabelo: c2() } })

  // sentadas na areia: jangadeiros (algodãozinho cor de couro, calça arregaçada, palha, descalços) e mulheres
  const S = antigosSentados
  const jangadeiro = (a) => homem(a, { roupa: 'camisaFora', chapeu: 'palha', pes: 'descalco', arregacada: true, manga: 'arregacada', cores: { ...homem(a).cores, camisa: ESCURO(a.roupa) ? a.roupa : r2.escolha(GENTE.couro) } })
  const sentadas = [
    mulher(S[0], { roupa: 'vestido', cabelo: 'coque', pes: 'descalco' }),
    jangadeiro(S[1]),
    jangadeiro(S[2]),
    mulher(S[3], { roupa: 'saia', chapeu: 'lenco', pes: 'descalco', cores: { ...mulher(S[3]).cores, camisa: '#efe9dc', calca: r2.escolha(GENTE.chitas), listra: '#e9dfcc' } }),
    homem(S[4], { roupa: 'camisa', chapeu: chapeuDe(S[4]) }),
    jangadeiro(S[5]),
  ]
  return { pe, sentadas }
}

// ---------------------------------------------------------------------------------------------------------------
// a figura parada: as peças da ficha numa malha só, com a cor do papel em cada vértice. A roupa do campo junta pó
// na barra (poeira 0 a 1); o remendo bem feito no joelho (docs/direcao-de-arte.md: trabalho e reparo, não ruína).

const _c = new THREE.Color()
export function figuraGeo(fig, { sentado = false, detalhe = 'perto' } = {}) {
  let j = sentado ? juntasSentado() : juntasDePe()
  const crianca = fig.corpo === 'menino' || fig.corpo === 'menina'
  if (crianca) j = juntasCrianca(j)
  const partes = []
  vestir(fig, j, { detalhe, cabeca: crianca ? CABECA_CRIANCA : 1 }, (geo, papel) => partes.push([geo, papel]))
  if (fig.remendo && detalhe !== 'longe' && !sentado) {
    const K = j.LeftLeg
    partes.push([new THREE.BoxGeometry(0.085, 0.1, 0.012).translate(K.x, K.y + 0.02, K.z + 0.066), 'remendo'])
  }
  const geos = []
  const poeira = fig.poeira || 0
  for (const [geo, papel] of partes) {
    const g = geo.index ? geo : geo.setIndex([...Array(geo.attributes.position.count).keys()]) // com índice: o vértice da junta é um só (o M1 é limitado pelo vértice)
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k)
    if (!g.attributes.normal) g.computeVertexNormals()
    const base = papel === 'remendo' ? fig.cores.remendo || '#b0a48c' : fig.cores[papel]
    const n = g.attributes.position.count
    const cor = new Float32Array(n * 3)
    const pano = papel === 'camisa' || papel === 'calca' || papel === 'listra'
    for (let i = 0; i < n; i++) {
      _c.set(base)
      if (poeira && pano) {
        const y = g.attributes.position.getY(i)
        const k = 1 - poeira * 0.16 * Math.max(0, 1 - y / 0.7)
        _c.multiplyScalar(k)
      }
      cor[i * 3] = _c.r; cor[i * 3 + 1] = _c.g; cor[i * 3 + 2] = _c.b
    }
    g.setAttribute('color', new THREE.BufferAttribute(cor, 3))
    geos.push(g)
  }
  const m = mergeGeometries(geos)
  m.computeBoundingSphere()
  return m
}

// as duas versões de uma ficha: perto (o detalhe do ator e da fila da cozinha) e média (a gente parada)
export function figuraLod(fig, opcoes = {}) {
  const g = (detalhe) => figuraGeo(fig, { ...opcoes, detalhe })
  return { perto: g('perto'), medio: g('medio'), fig, sentado: !!opcoes.sentado }
}
