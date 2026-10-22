// A via férrea de 1932 (Rede de Viação Cearense): as linhas no traçado de verdade, da Planta da cidade de 1931-1932.
//
// Até 22/10/2026 o jogo desenhava só dois trilhos de 200 m saindo da Estação para oeste (estacao.js), em reta,
// por cima das casas, e a linha do Campo do Urubu (urubu-linha.js) solta no campo; o dado (mapa1932-dados.json,
// "trilhos") era um esquema de retas, com o ramal do porto atravessando o Centro em diagonal. O Joabe: "a linha do
// trem não faz sentido: começa no meio das casas e passa por dentro de outras".
//
// Agora o traçado é o da planta oficial de 1931-1932 (src/mundo/ferrovia1932.json, lido no scan georreferenciado
// contra a camada dos lotes de 1932, com a Estação e a Ponte Metálica ancoradas no OSM; erro de 20 a 30 m no
// centro, ~50 m na costa): o tronco sai do pátio atrás da Estação para oeste por Moura Brasil; em Jacarecanga
// ele se parte na Linha Sul (Baturité, por Otávio Bonfim) e na Linha Norte (para as Oficinas do Urubu e Sobral);
// o ramal do porto corre pela Praia Formosa, ao sul do Poço da Draga, até a raiz da Ponte Metálica.
//
// Este arquivo é o dado no jogo (as linhas em coordenada de jogo, a pergunta "aqui é leito da linha?" para o
// casario não construir em cima) e o desenho (lastro, dormentes, trilhos e os postes de telégrafo).
// O que fica de fora: o trecho dentro da Estação (a gare de estacao.js tem os trilhos dela), o que cai no mar (a
// Ponte Metálica não está modelada) e o que entra na cerca do Campo do Urubu. Até 22/10/2026 o campo cobria o
// recinto das Oficinas da RVC e o ramal e o desvio delas não eram desenhados; desde então (docs/mapa-1932.md, v17)
// o campo fica a leste do recinto, e nenhuma linha da planta entra na cerca.

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import dados from './ferrovia1932.json'
import { ll } from './fortaleza1932.js'
import { colorir } from './cenografia.js'
import { toonVertice } from '../materiais.js'
import { congelar } from './congelar.js'
import { registrarEstatico } from '../render/sombra-estatica.js'
import { instanciarEmBlocos, TAM_LOD } from './blocos.js'
import { marcoSob } from './lotes-marcos.js'
import { dentroDoCampo } from './mapa1932.js'

const M_LON = 111320 * Math.cos((-3.72 * Math.PI) / 180)
const M_LAT = 110574

// a bitola métrica da RVC e o leito: o lastro tem 2,6 m; o casario fica a 3,5 m do eixo
export const BITOLA = 1.0
export const MEIA_FAIXA = 3.5
const PASSO_M = 3 // um ponto a cada 3 m de linha

// a linha adensada em lon/lat (reta entre os pontos da planta) e levada para o jogo
function adensar(tracado) {
  const out = []
  for (let i = 0; i < tracado.length - 1; i++) {
    const [a, b] = [tracado[i], tracado[i + 1]]
    const m = Math.hypot((b[0] - a[0]) * M_LON, (b[1] - a[1]) * M_LAT)
    const n = Math.max(1, Math.ceil(m / PASSO_M))
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n])
  }
  out.push(tracado[tracado.length - 1])
  return out.map(([lon, lat]) => ll(lon, lat))
}

// as linhas de verdade, inteiras, em coordenada de jogo (o leito: o casario não ocupa)
export const LINHAS_FERREAS = dados.linhas.map((l) => ({ id: l.id, nome: l.nome, confianca: l.confianca, pontos: adensar(l.tracado) }))

// ---------- "aqui é leito da linha?" ----------
const CEL = 32
const GRADE = new Map()
for (const l of LINHAS_FERREAS) {
  for (let i = 0; i < l.pontos.length - 1; i++) {
    const [ax, az] = l.pontos[i]
    const [bx, bz] = l.pontos[i + 1]
    const seg = [ax, az, bx, bz]
    const i0 = Math.floor((Math.min(ax, bx) - 12) / CEL)
    const i1 = Math.floor((Math.max(ax, bx) + 12) / CEL)
    const j0 = Math.floor((Math.min(az, bz) - 12) / CEL)
    const j1 = Math.floor((Math.max(az, bz) + 12) / CEL)
    for (let ii = i0; ii <= i1; ii++) {
      for (let jj = j0; jj <= j1; jj++) {
        const k = `${ii},${jj}`
        if (!GRADE.has(k)) GRADE.set(k, [])
        GRADE.get(k).push(seg)
      }
    }
  }
}

function distSeg(x, z, [ax, az, bx, bz]) {
  const vx = bx - ax
  const vz = bz - az
  const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz || 1)))
  return Math.hypot(x - ax - vx * t, z - az - vz * t)
}

// a distância do ponto ao eixo da linha mais perto (Infinity se não há linha a 12 un)
export function distFerrovia(x, z) {
  const lista = GRADE.get(`${Math.floor(x / CEL)},${Math.floor(z / CEL)}`)
  if (!lista) return Infinity
  let d = Infinity
  for (const s of lista) d = Math.min(d, distSeg(x, z, s))
  return d
}

// a casa (centro, largura, fundo, giro) encosta no leito da linha? O retângulo é amostrado a cada metro
export function casaNaFerrovia(x, z, w, d, rot) {
  const raio = Math.hypot(w, d) / 2
  if (distFerrovia(x, z) > raio + MEIA_FAIXA + 1) return false
  const c = Math.cos(rot)
  const s = Math.sin(rot)
  const nw = Math.max(1, Math.ceil(w))
  const nd = Math.max(1, Math.ceil(d))
  for (let i = 0; i <= nw; i++) {
    for (let j = 0; j <= nd; j++) {
      const lx = (i / nw - 0.5) * w
      const lz = (j / nd - 0.5) * d
      if (distFerrovia(x + lx * c + lz * s, z - lx * s + lz * c) < MEIA_FAIXA) return true
    }
  }
  return false
}

// ---------- o desenho ----------
const DORMENTE = '#5e4c3c'
const TRILHO = '#4f4a45'
const LASTRO = '#8f8679'
const POSTE = '#6b5a48'

// o trecho que vira trilho: fora da Estação (a gare tem os dela), fora do mar e fora da cerca do campo
export function desenhavel(x, z, alturaTerreno) {
  if (marcoSob(x, z, 0) === 'estacao') return false
  if (dentroDoCampo(x, z)) return false
  return alturaTerreno(x, z) > 0.25
}

// as peças paradas (lastro e trilho) numa malha por bloco de 96 m; os dormentes e os postes em cópias
export function criarFerrovia(cena, alturaTerreno, ocupacao) {
  const pecas = []
  const dormentes = []
  const postes = []
  const um = new THREE.Vector3(1, 1, 1)
  const q = new THREE.Quaternion()
  const Y = new THREE.Vector3(0, 1, 0)
  const conta = { linhas: 0, metros: 0, dormentes: 0, postes: 0 }
  const TELEGRAFO = new Set(['tronco', 'norte', 'sul'])
  for (const l of LINHAS_FERREAS) {
    let andado = 0
    let ultimoPoste = -Infinity
    let desenhou = false
    for (let i = 0; i < l.pontos.length - 1; i++) {
      const [ax, az] = l.pontos[i]
      const [bx, bz] = l.pontos[i + 1]
      const comp = Math.hypot(bx - ax, bz - az)
      if (comp < 1e-3) continue
      const mx = (ax + bx) / 2
      const mz = (az + bz) / 2
      andado += comp
      if (!desenhavel(mx, mz, alturaTerreno)) continue
      desenhou = true
      conta.metros += comp
      const dx = (bx - ax) / comp
      const dz = (bz - az) / comp
      const nx = -dz
      const nz = dx
      const yaw = Math.atan2(dx, dz)
      const ya = alturaTerreno(ax, az)
      const yb = alturaTerreno(bx, bz)
      // o lastro: uma faixa de pedra britada, um pouco acima do chão
      const g = new THREE.BoxGeometry(2.6, 0.22, comp + 0.08)
      g.rotateX(-Math.atan2(yb - ya, comp))
      g.rotateY(yaw)
      g.translate(mx, (ya + yb) / 2 + 0.03, mz)
      pecas.push({ geo: colorir(g, LASTRO), x: mx, z: mz })
      for (const off of [-BITOLA / 2, BITOLA / 2]) {
        const r = new THREE.BoxGeometry(0.07, 0.11, comp + 0.02)
        r.rotateX(-Math.atan2(yb - ya, comp))
        r.rotateY(yaw)
        r.translate(mx + nx * off, (ya + yb) / 2 + 0.3, mz + nz * off)
        pecas.push({ geo: colorir(r, TRILHO), x: mx, z: mz })
      }
      // os dormentes a cada 0,65 m
      for (let s = 0.3; s < comp; s += 0.65) {
        const x = ax + dx * s
        const z = az + dz * s
        dormentes.push(new THREE.Matrix4().compose(new THREE.Vector3(x, alturaTerreno(x, z) + 0.17, z), q.setFromAxisAngle(Y, yaw).clone(), um))
        conta.dormentes++
      }
      // o leito fica marcado: nenhuma árvore, poste de rua, banco ou gente de rua nasce em cima
      ocupacao?.marcar(mx, mz, MEIA_FAIXA, comp / 2 + 0.5, yaw)
      // o poste de telégrafo a cada 50 m, a 4 m do eixo, do lado norte da linha (nas linhas de tráfego)
      if (TELEGRAFO.has(l.id) && andado - ultimoPoste >= 50) {
        const lado = nz < 0 ? 1 : -1
        const px = mx + nx * 4 * lado
        const pz = mz + nz * 4 * lado
        if (alturaTerreno(px, pz) > 0.25) {
          postes.push(new THREE.Matrix4().compose(new THREE.Vector3(px, alturaTerreno(px, pz) - 0.3, pz), q.setFromAxisAngle(Y, yaw).clone(), um))
          ocupacao?.marcar(px, pz, 0.3, 0.3)
          ultimoPoste = andado
          conta.postes++
        }
      }
    }
    if (desenhou) conta.linhas++
  }
  const mat = toonVertice()
  const grupos = new Map()
  for (const p of pecas) {
    const k = `${Math.floor(p.x / TAM_LOD)},${Math.floor(p.z / TAM_LOD)}`
    if (!grupos.has(k)) grupos.set(k, [])
    grupos.get(k).push(p.geo)
  }
  for (const geos of grupos.values()) {
    const m = new THREE.Mesh(mergeGeometries(geos), mat)
    m.geometry.computeBoundingSphere()
    m.castShadow = true
    m.receiveShadow = true
    m.name = 'ferrovia-linha'
    registrarEstatico(m)
    cena.add(congelar(m))
  }
  const geoDormente = colorir(new THREE.BoxGeometry(1.9, 0.12, 0.2), DORMENTE)
  instanciarEmBlocos(cena, geoDormente, mat, dormentes, null, { nome: 'ferrovia-dormentes', sombra: false })
  const geoPoste = mergeGeometries([
    colorir(new THREE.CylinderGeometry(0.09, 0.12, 6.5, 6).translate(0, 3.25, 0), POSTE),
    colorir(new THREE.BoxGeometry(1.2, 0.1, 0.1).translate(0, 6.2, 0), '#5e4c3c'),
  ])
  instanciarEmBlocos(cena, geoPoste, mat, postes, null, { nome: 'ferrovia-telegrafo' })
  conta.metros = Math.round(conta.metros)
  return conta
}
