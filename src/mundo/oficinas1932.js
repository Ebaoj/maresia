// As Oficinas da Rede de Viação Cearense no Urubu (1932): o recinto e os prédios que a Planta de 1931-1932 desenha.
//
// FATO: as oficinas da RVC no Urubu foram inauguradas em 4/out/1930 (docs/mapa-1932-v3.py, lugar "oficinasUrubu");
// o Campo do Urubu ficava perto delas (dossiê ~/Projetos/marcos-1932-pesquisa/marcos-1932.md, seção 23). A Planta de
// 1931-1932 (scan do Commons, CC0) desenha o recinto (src/mundo/ferrovia1932.json, "patios": oficinas_urubu) com o
// letreiro "Officinas da Rêde de Viação Cearense", o desvio de serviço ao longo dele e sete prédios: dois galpões
// grandes lado a lado, um terceiro mais estreito a leste, duas casas pequenas ao norte e duas ao sul do desvio.
// D (lido na planta): quantos prédios, onde ficam e o rumo do eixo. Cada um foi lido no scan (o retângulo em pixels)
// e levado para lon/lat por uma afim local casada com os cantos do recinto e a ponta do desvio (5,6 m por pixel,
// resíduo de 13 a 21 m). Os galpões A e B foram puxados 30 e 44 m para o norte, ao longo do eixo, para não cair no
// leito do desvio (o traço do desvio e o da afim têm, cada um, ~20 m de erro; na planta as cabeceiras ficam
// junto do desvio, sem cruzá-lo); a casa D, 20 m para o norte, para não encostar no galpão B.
// H (sem foto nem planta do prédio): a forma. Galpão de oficina ferroviária dos anos 1920-30: alvenaria caiada,
// telhado de duas águas com lanternim na cumeeira, portões altos na cabeceira que dá para o desvio, janelas altas
// nas paredes compridas. As medidas são as do retângulo da planta, um pouco menores que o traço (o traço é grosso).
//
// Desde 22/10/2026 (docs/mapa-1932.md, v17) o Campo do Urubu fica a leste do recinto, e o recinto, que até então
// ficava por baixo do polígono do campo, ganhou os prédios. Tudo é parado: uma malha só, com sombra em cache.

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import dados from './ferrovia1932.json'
import { ll } from './fortaleza1932.js'
import { colorir } from './cenografia.js'
import { toonVertice } from '../materiais.js'
import { congelar } from './congelar.js'
import { registrarEstatico } from '../render/sombra-estatica.js'
import { adicionarCaixa } from './colisao.js'
import { CAL } from '../paleta.js'
import { PADRAO } from '../config.js'

// [nome, tipo, lon, lat, comprimento (m), largura (m), rumo do eixo comprido (graus do norte, para leste)]
export const PREDIOS_OFICINAS = [
  ['A', 'oficina', -38.568931, -3.714347, 112, 39, 20.8],
  ['B', 'oficina', -38.568262, -3.714606, 115, 39, 18.8],
  ['C', 'oficina', -38.567309, -3.715311, 73, 25, 32.7],
  ['D', 'casa', -38.567928, -3.713967, 34, 28, 20.8],
  ['E', 'casa', -38.567046, -3.714619, 31, 25, 20.8],
  ['F', 'armazem', -38.569702, -3.715505, 39, 34, 20.8],
  ['G', 'armazem', -38.568933, -3.715959, 39, 34, 20.8],
]

// o recinto, em coordenada de jogo
export const RECINTO_OFICINAS = dados.patios.find((p) => p.id === 'oficinas_urubu').poligono.map(([lon, lat]) => ll(lon, lat))

export function dentroDasOficinas(x, z) {
  const p = RECINTO_OFICINAS
  let dentro = false
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, zi] = p[i]
    const [xj, zj] = p[j]
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) dentro = !dentro
  }
  return dentro
}

// o prédio no jogo: centro, giro (rotation.y: o x local corre ao longo do eixo comprido) e medidas.
// O recinto fica na zona 1:1 do campo (docs/mapa-1932-escala.py), sem giro: o norte de verdade é o -z do jogo
export function prediosNoJogo() {
  return PREDIOS_OFICINAS.map(([nome, tipo, lon, lat, comp, larg, rumo]) => {
    const [x, z] = ll(lon, lat)
    return { nome, tipo, x, z, comp, larg, rot: Math.PI / 2 - (rumo * Math.PI) / 180 }
  })
}

const PAREDE = CAL.calVelha
const RODAPE = '#a8957a'
const VAO = '#3b342d'
const TELHA = CAL.telha
const ZINCO = '#b9b4a8'
const MADEIRA = '#6e5a44'
const caixa = (l, a, p, x, y, z, cor) => colorir(new THREE.BoxGeometry(l, a, p).translate(x, y, z), cor)

// telhado de duas águas ao longo de x: as duas folhas e as empenas (o oitão) nas cabeceiras
function duasAguas(comp, larg, beiral, cumeeira, cor, corEmpena) {
  const partes = []
  const sobe = cumeeira - beiral
  const meia = larg / 2 + 0.6
  const inc = Math.atan2(sobe, larg / 2)
  const folha = Math.hypot(meia, sobe * (meia / (larg / 2)))
  for (const lado of [-1, 1]) {
    const g = new THREE.BoxGeometry(comp + 1.2, 0.18, folha)
    g.rotateX(lado * inc)
    g.translate(0, beiral + sobe / 2 + 0.1, (lado * larg) / 4)
    partes.push(colorir(g, cor))
  }
  // o oitão: um triângulo de alvenaria em cada cabeceira
  const tri = new THREE.BufferGeometry()
  const v = []
  for (const s of [-1, 1]) {
    const x = (s * comp) / 2
    v.push(x, beiral, -larg / 2, x, beiral, larg / 2, x, cumeeira, 0)
    v.push(x, beiral, larg / 2, x, beiral, -larg / 2, x, cumeeira, 0)
  }
  tri.setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
  tri.computeVertexNormals()
  partes.push(colorir(tri, corEmpena))
  return partes
}

// galpão de oficina: paredes de alvenaria, janelas altas, portões na cabeceira sul (a que dá para o desvio)
function geometriaOficina(comp, larg, alt) {
  const partes = []
  const cume = alt + larg * 0.22
  partes.push(caixa(comp, alt, larg, 0, alt / 2, 0, PAREDE))
  partes.push(caixa(comp + 0.1, 0.9, larg + 0.1, 0, 0.45, 0, RODAPE))
  // janelas altas nas paredes compridas, a cada 6 m
  for (let x = -comp / 2 + 5; x <= comp / 2 - 5; x += 6) {
    for (const s of [-1, 1]) partes.push(caixa(2.4, alt * 0.42, 0.12, x, alt * 0.58, s * (larg / 2 + 0.04), VAO))
  }
  // portões altos nas duas cabeceiras: a do desvio (−x, o sul) tem três, a outra um
  const portoes = Math.max(1, Math.round(larg / 13))
  for (let k = 0; k < portoes; k++) {
    const z = (k - (portoes - 1) / 2) * (larg / portoes)
    partes.push(caixa(0.14, alt * 0.8, Math.min(6, larg / portoes - 2), -comp / 2 - 0.04, alt * 0.4, z, VAO))
  }
  partes.push(caixa(0.14, alt * 0.7, 5, comp / 2 + 0.04, alt * 0.35, 0, VAO))
  partes.push(...duasAguas(comp, larg, alt, cume, TELHA, PAREDE))
  // o lanternim: o telhadinho de cima da cumeeira, com a fresta de ventilação
  const lw = Math.min(6, larg * 0.22)
  partes.push(caixa(comp * 0.86, 1.1, lw, 0, cume + 0.35, 0, VAO))
  partes.push(...duasAguas(comp * 0.88, lw, cume + 0.9, cume + 1.6, TELHA, PAREDE))
  return mergeGeometries(partes)
}

// casa da administração ou do almoxarifado: alvenaria caiada, quatro águas de telha (o topo em duas águas curtas)
function geometriaCasa(comp, larg, alt) {
  const partes = []
  partes.push(caixa(comp, alt, larg, 0, alt / 2, 0, CAL.cal))
  partes.push(caixa(comp + 0.1, 0.7, larg + 0.1, 0, 0.35, 0, RODAPE))
  for (let x = -comp / 2 + 3; x <= comp / 2 - 3; x += 4) {
    for (const s of [-1, 1]) partes.push(caixa(1.2, 2.0, 0.12, x, alt * 0.55, s * (larg / 2 + 0.04), VAO))
  }
  partes.push(caixa(0.14, 3, 2, -comp / 2 - 0.04, 1.5, 0, MADEIRA))
  partes.push(...duasAguas(comp, larg, alt, alt + larg * 0.25, TELHA, CAL.cal))
  return mergeGeometries(partes)
}

// armazém: paredes mais baixas, telhado de zinco
function geometriaArmazem(comp, larg, alt) {
  const partes = []
  partes.push(caixa(comp, alt, larg, 0, alt / 2, 0, PAREDE))
  partes.push(caixa(comp + 0.1, 0.8, larg + 0.1, 0, 0.4, 0, RODAPE))
  for (const s of [-1, 1]) partes.push(caixa(0.14, alt * 0.75, 4.5, (s * comp) / 2 + s * 0.04, alt * 0.375, 0, MADEIRA))
  partes.push(...duasAguas(comp, larg, alt, alt + larg * 0.18, ZINCO, PAREDE))
  return mergeGeometries(partes)
}

// opcoes: cfg.mundo.oficinas (o painel mexe; vale ao recarregar)
export function criarOficinas1932(cena, alturaTerreno, opcoes = PADRAO.mundo.oficinas) {
  const o = { ...PADRAO.mundo.oficinas, ...opcoes }
  if (!o.ligadas) return { predios: 0 }
  const geos = []
  for (const p of prediosNoJogo()) {
    const alt = p.tipo === 'oficina' ? o.alturaGalpao : p.tipo === 'casa' ? o.alturaCasa : o.alturaArmazem
    const g = p.tipo === 'oficina' ? geometriaOficina(p.comp, p.larg, alt) : p.tipo === 'casa' ? geometriaCasa(p.comp, p.larg, alt) : geometriaArmazem(p.comp, p.larg, alt)
    // o pé no ponto mais baixo dos cantos (a parede entra no chão onde ele sobe)
    const c = Math.cos(p.rot)
    const s = Math.sin(p.rot)
    let y = Infinity
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]]) {
      const lx = (a * p.comp) / 2
      const lz = (b * p.larg) / 2
      y = Math.min(y, alturaTerreno(p.x + lx * c + lz * s, p.z - lx * s + lz * c))
    }
    g.rotateY(p.rot)
    g.translate(p.x, y - 0.3, p.z)
    geos.push(g)
    adicionarCaixa(p.x, p.z, p.comp / 2, p.larg / 2, p.rot)
  }
  const m = new THREE.Mesh(mergeGeometries(geos), toonVertice())
  m.geometry.computeBoundingSphere()
  m.castShadow = true
  m.receiveShadow = true
  m.name = 'oficinas-rvc'
  registrarEstatico(m)
  cena.add(congelar(m))
  return { predios: geos.length }
}
