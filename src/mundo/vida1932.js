// A vida de rua de 1932 nos espaços abertos (o vazio da cidade, docs/mapa-1932.md, v10): carroças,
// jumentos, sacos, fardos e caixotes na feira do Mercado de Ferro e na praça da Estação Central (a
// estação despachava algodão); potes de barro nas portas e varais nos quintais dos bairros; bancos nos
// largos; o poste e o fio aéreo do bonde da Light sobre o trilho. As peças estão em pecas-vida1932.js.
//
// Tudo parado (bicho e gente se movem por rotoscopia; um jumento parado é o que se vê numa feira).
// Os lugares saem dos dados que o mundo já tem: o chão exato dos marcos (pegadas.js, lotes-marcos.js),
// as ruas da planta (casario1932.js, RUAS), as casas simples (cidade.js) e a rota dos bondes
// (bondes.js). Quantidades e posições exatas: HIPÓTESE (nenhuma foto diz onde ficava cada carroça).

import * as THREE from 'three'
import { instanciarEmBlocos } from './blocos.js'
import { toonVertice } from '../materiais.js'
import { ocupacao } from './ocupacao.js'
import { alturaChao, adicionarCirculo } from './colisao.js'
import { criarAleatorio } from '../utils.js'
import { PEGADA, dentroDeMarco } from './marcos1932/pegadas.js'
import { naGrade, ROT as ROT_GRADE } from './marcos1932/grade.js'
import { PEGADAS as LOTES, marcoSob } from './lotes-marcos.js'
import { dentroDaPraca } from './praca1932.js'
import { RUAS, comprimentoRua, pontoNaRua } from './casario1932.js'
import { distRealDaPraca } from './chao1932.js'
import { rotasDosBondes } from './bondes.js'
import { noCorredor } from './frente1932.js'
import { geometriaBanco } from './rua.js'
import { ACENTO, CAL } from '../paleta.js'
import {
  geometriaCarroca, geometriaCargaSacos, geometriaJumento, geometriaSaco, geometriaFardo, geometriaCaixote,
  geometriaPote, geometriaVaral, geometriaPosteBonde, ALTURA_FIO_BONDE,
} from './pecas-vida1932.js'

const Y = new THREE.Vector3(0, 1, 0)
const UM = new THREE.Vector3(1, 1, 1)

function matriz(x, z, yaw, y = null) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y ?? alturaChao(x, z) + 0.01, z), new THREE.Quaternion().setFromAxisAngle(Y, yaw), UM)
}

// o ponto está livre para uma peça de raio r? (nem casa, nem marco, nem dentro da Praça do Ferreira)
function livre(x, z, r) {
  if (!ocupacao.livre(x, z, r, r)) return false
  if (dentroDaPraca(x, z) || dentroDeMarco(x, z, 0.5) || marcoSob(x, z, r)) return false
  if (noCorredor(x, z, r)) return false // nada na frente de um ponto de vista do Ir para
  return true
}

function ocupar(x, z, r, solido) {
  ocupacao.marcar(x, z, r, r)
  if (solido) adicionarCirculo(x, z, r)
}

// um ponto do referencial local de um marco do norte (lotes-marcos.js) no mundo
function doLote(p, lx, lz) {
  const c = Math.cos(p.rot)
  const s = Math.sin(p.rot)
  return [p.x + lx * c + lz * s, p.z - lx * s + lz * c]
}

export function criarVida1932(cena, cfg, predios) {
  const c = cfg.vida
  const vazio = { pecas: 0 }
  if (!c?.ligada) return vazio
  const rnd = criarAleatorio(1932 + 7)
  const L = {
    carroca: [], carga: [], jumento: [], jumentoSolto: [], saco: [], fardo: [], caixote: [], pote: [], banco: [],
    varal: [], poste: [],
  }
  const conta = { carrocas: 0, jumentos: 0, pilhas: 0, potes: 0, varais: 0, bancos: 0, postes: 0 }

  // uma carroça parada, às vezes com o jumento atrelado e a carga
  const carroca = (x, z, yaw, comCarga) => {
    if (!livre(x, z, 1.8)) return false
    L.carroca.push(matriz(x, z, yaw))
    if (comCarga) L.carga.push(matriz(x, z, yaw))
    ocupar(x, z, 1.6, true)
    conta.carrocas++
    // o jumento entre os varais, na frente
    if (rnd.chance(0.6)) {
      const jx = x + Math.sin(yaw) * 2.9
      const jz = z + Math.cos(yaw) * 2.9
      if (livre(jx, jz, 0.9)) { L.jumento.push(matriz(jx, jz, yaw)); ocupar(jx, jz, 0.8, true); conta.jumentos++ }
    }
    return true
  }
  // uma pilha de carga (sacos, fardos ou caixotes) em volta de um ponto
  const pilha = (x, z, tipo, n) => {
    if (!livre(x, z, 1.4)) return false
    for (let i = 0; i < n; i++) {
      const a = rnd.entre(0, Math.PI * 2)
      const r = rnd.entre(0, 1.1)
      const px = x + Math.cos(a) * r
      const pz = z + Math.sin(a) * r
      const sobe = tipo === 'fardo' && i >= 3 ? 0.55 : 0
      L[tipo].push(matriz(px, pz, rnd.entre(-0.4, 0.4) + (tipo === 'fardo' ? ROT_GRADE : 0), alturaChao(px, pz) + 0.01 + sobe))
    }
    ocupar(x, z, 1.3, true)
    conta.pilhas++
    return true
  }
  const banco = (x, z, yaw) => {
    if (!livre(x, z, 1.1)) return
    L.banco.push(matriz(x, z, yaw))
    ocupar(x, z, 1, true)
    conta.bancos++
  }

  // 1. a feira do Mercado de Ferro, na Praça Carolina: carroças e jumentos na borda da feira, carga no chão
  const m = PEGADA.mercado
  if (m) {
    for (let i = 0, tent = 0; i < c.feiraCarrocas && tent < 60; tent++) {
      const lado = rnd.escolha([[1, 0], [-1, 0], [0, 1], [0, -1]])
      const u = lado[0] ? lado[0] * (m.hu + rnd.entre(3, 9)) : rnd.entre(-m.hu, m.hu)
      const v = lado[1] ? lado[1] * (m.hv + rnd.entre(3, 8)) : rnd.entre(-m.hv, m.hv)
      const [x, z] = naGrade([m.x, m.z], u, v)
      if (carroca(x, z, ROT_GRADE + (lado[0] ? 0 : Math.PI / 2) + rnd.entre(-0.3, 0.3) + (rnd.chance(0.5) ? Math.PI : 0), rnd.chance(0.7))) i++
    }
    for (let i = 0, tent = 0; i < c.feiraPilhas && tent < 80; tent++) {
      const u = rnd.entre(-m.hu - 8, m.hu + 8)
      const v = rnd.chance(0.5) ? rnd.entre(m.hv + 1.5, m.hv + 7) * (rnd.chance(0.5) ? 1 : -1) : rnd.entre(-m.hv, m.hv)
      const [x, z] = naGrade([m.x, m.z], Math.abs(u) < m.hu && Math.abs(v) < m.hv ? (m.hu + 3) * Math.sign(u || 1) : u, v)
      if (pilha(x, z, rnd.escolha(['saco', 'caixote', 'caixote']), 2 + Math.floor(rnd.entre(0, 4)))) i++
    }
    // um jumento de carga solto, com os caçuás
    for (let i = 0, tent = 0; i < 2 && tent < 30; tent++) {
      const [x, z] = naGrade([m.x, m.z], rnd.entre(-m.hu, m.hu), (m.hv + rnd.entre(4, 9)) * (rnd.chance(0.5) ? 1 : -1))
      if (livre(x, z, 0.9)) { L.jumentoSolto.push(matriz(x, z, rnd.entre(0, Math.PI * 2))); ocupar(x, z, 0.8, true); conta.jumentos++; i++ }
    }
  }

  // 2. a praça da Estação Central: fardos de algodão e carroças na frente do prédio e nas pontas
  const e = LOTES.estacao
  if (e) {
    for (let i = 0, tent = 0; i < c.estacaoCarrocas && tent < 60; tent++) {
      const [x, z] = doLote(e, rnd.entre(-60, 60), rnd.entre(e.z1 + 3, e.z1 + 18))
      if (carroca(x, z, e.rot + (rnd.chance(0.5) ? 0 : Math.PI) + rnd.entre(-0.4, 0.4), rnd.chance(0.5))) i++
    }
    for (let i = 0, tent = 0; i < c.estacaoPilhas && tent < 80; tent++) {
      const ponta = rnd.chance(0.5)
      const [x, z] = ponta
        ? doLote(e, (e.x1 + rnd.entre(2, 10)) * (rnd.chance(0.5) ? 1 : -1), rnd.entre(-10, 25))
        : doLote(e, rnd.entre(-55, 55), rnd.entre(e.z1 + 2, e.z1 + 10))
      if (pilha(x, z, rnd.chance(0.7) ? 'fardo' : 'saco', 3 + Math.floor(rnd.entre(0, 4)))) i++
    }
    for (const lx of [-30, 30]) {
      const [x, z] = doLote(e, lx, e.z1 + 4)
      banco(x, z, e.rot)
    }
  }
  // 3. o largo da Sé: bancos de frente para a fachada
  const se = LOTES.se
  if (se) for (const lx of [-12, 0, 12]) { const [x, z] = doLote(se, lx, se.z1 + 4); banco(x, z, se.rot + Math.PI) }

  // 4. as ruas do Centro: pote de barro na porta, caixote e saco na porta do comércio, carroça parada
  const raio = c.raioCentro
  for (const rua of RUAS) {
    const comp = comprimentoRua(rua)
    for (let d = rnd.entre(0, c.passoRua); d < comp; d += c.passoRua * rnd.entre(0.6, 1.4)) {
      const [x, z, nx, nz] = pontoNaRua(rua, d)
      if (distRealDaPraca(x, z) > raio) break
      const px = x + nx * 0.9
      const pz = z + nz * 0.9
      const sorte = rnd.entre(0, 1)
      if (sorte < 0.45) {
        if (livre(px, pz, 0.35)) { L.pote.push(matriz(px, pz, rnd.entre(0, 6))); ocupar(px, pz, 0.3, false); conta.potes++ }
      } else if (sorte < 0.8) {
        pilha(x + nx * 1.6, z + nz * 1.6, rnd.chance(0.5) ? 'caixote' : 'saco', 1 + Math.floor(rnd.entre(0, 3)))
      } else {
        // a carroça encostada, paralela à testada
        // o +z da carroça (os varais) ao longo da rua: t = (nz, -nx)
        carroca(x + nx * 3.2, z + nz * 3.2, Math.atan2(nz, -nx) + (rnd.chance(0.5) ? Math.PI : 0), rnd.chance(0.5))
      }
    }
  }

  // 5. os bairros: pote na porta e varal no quintal das casas simples
  const cores = [ACENTO.anil, ACENTO.urucum, CAL.cal, ACENTO.caju, CAL.rosa, CAL.azul]
  const varais = cores.map((cor, i) => ({ geo: geometriaVaral([cor, cores[(i + 2) % cores.length], CAL.cal]), lista: [] }))
  for (const p of predios) {
    if (p.tipo !== 'favela') continue
    const dist = distRealDaPraca(p.x, p.z)
    if (dist < raio * 0.6 || dist > c.raioBairros) continue
    // a frente da casa olha para +z local (frente [0, 1]); o quintal é atrás
    const fx = Math.sin(p.rot)
    const fz = Math.cos(p.rot)
    if (rnd.chance(c.potesBairro)) {
      const px = p.x + fx * (p.d / 2 + 0.6) + Math.cos(p.rot) * (p.w * 0.3)
      const pz = p.z + fz * (p.d / 2 + 0.6) - Math.sin(p.rot) * (p.w * 0.3)
      if (livre(px, pz, 0.35)) { L.pote.push(matriz(px, pz, rnd.entre(0, 6))); ocupar(px, pz, 0.3, false); conta.potes++ }
    }
    if (rnd.chance(c.varais)) {
      const vx = p.x - fx * (p.d / 2 + 2.4)
      const vz = p.z - fz * (p.d / 2 + 2.4)
      if (livre(vx, vz, 1.8)) {
        rnd.escolha(varais).lista.push(matriz(vx, vz, p.rot + rnd.entre(-0.3, 0.3)))
        ocupar(vx, vz, 1.7, false)
        conta.varais++
      }
    }
  }

  // 6. o fio aéreo do bonde sobre o trilho, com o poste de madeira na beira da rua
  const fios = []
  const postes = []
  if (c.bonde) {
    const feitos = new Set()
    const { linhas } = rotasDosBondes()
    for (const pontos of linhas) {
      let ultimo = null
      for (let i = 0; i < pontos.length - 1; i++) {
        const [ax, az] = pontos[i]
        const [bx, bz] = pontos[i + 1]
        if (distRealDaPraca(ax, az) > c.raioBonde) { ultimo = null; continue }
        // o fio: um trecho por segmento do trilho, a 6 m (sem repetir o trecho de duas linhas juntas)
        const chave = `${Math.round(ax / 4)},${Math.round(az / 4)}`
        if (!feitos.has(chave)) { feitos.add(chave); fios.push([ax, az, bx, bz]) }
        // o poste, a cada passoPoste m de trilho, no lado da rua que estiver livre
        const seg = Math.hypot(bx - ax, bz - az)
        if (seg < 0.1) continue
        if (ultimo && Math.hypot(ax - ultimo[0], az - ultimo[1]) < c.passoPoste) continue
        const nx = -(bz - az) / seg
        const nz = (bx - ax) / seg
        for (const lado of [1, -1]) {
          const braco = 4.2
          const px = ax + nx * braco * lado
          const pz = az + nz * braco * lado
          const k = `${Math.round(px / 12)},${Math.round(pz / 12)}`
          if (feitos.has('p' + k) || !livre(px, pz, 0.3)) continue
          feitos.add('p' + k)
          // o braço aponta para o trilho
          // o x local do poste (o braço) vai para (cos yaw, -sen yaw): para o trilho, (-n * lado)
          const yaw = Math.atan2(nz * lado, -nx * lado)
          postes.push(new THREE.Matrix4().compose(new THREE.Vector3(px, alturaChao(px, pz) - 0.1, pz), new THREE.Quaternion().setFromAxisAngle(Y, yaw), UM))
          ocupar(px, pz, 0.3, true)
          conta.postes++
          ultimo = [ax, az]
          break
        }
      }
    }
  }

  // montar: uma lista de cópias por peça, em blocos
  const mat = toonVertice()
  const montar = (geo, lista, nome) => { if (lista.length) instanciarEmBlocos(cena, geo, mat, lista, null, { nome }) }
  montar(geometriaCarroca(), L.carroca, 'vida-carrocas')
  montar(geometriaCargaSacos(), L.carga, 'vida-carga')
  montar(geometriaJumento(false), L.jumento, 'vida-jumentos')
  montar(geometriaJumento(true), L.jumentoSolto, 'vida-jumentos')
  montar(geometriaSaco(), L.saco, 'vida-sacos')
  montar(geometriaFardo(), L.fardo, 'vida-fardos')
  montar(geometriaCaixote(), L.caixote, 'vida-caixotes')
  montar(geometriaPote(), L.pote, 'vida-potes')
  montar(geometriaBanco(), L.banco, 'vida-bancos')
  for (const v of varais) montar(v.geo, v.lista, 'vida-varais')
  montar(geometriaPosteBonde(4.2), postes, 'vida-postes-bonde')
  if (fios.length) {
    // o fio: uma malha só de caixas finas, a 6 m, com uma barriga pequena no meio de cada trecho
    const caixa = new THREE.BoxGeometry(1, 0.03, 0.03)
    const tmp = new THREE.Matrix4()
    const pos = []
    const idx = []
    for (const [ax, az, bx, bz] of fios) {
      const ya = alturaChao(ax, az) + ALTURA_FIO_BONDE
      const yb = alturaChao(bx, bz) + ALTURA_FIO_BONDE
      const comp = Math.hypot(bx - ax, bz - az)
      tmp.compose(new THREE.Vector3((ax + bx) / 2, (ya + yb) / 2 - 0.04, (az + bz) / 2), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(bx - ax, yb - ya, bz - az).normalize()), new THREE.Vector3(comp, 1, 1))
      const g = caixa.clone().applyMatrix4(tmp)
      const base = pos.length / 3
      pos.push(...g.attributes.position.array)
      for (const i of g.index.array) idx.push(base + i)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setIndex(idx)
    geo.computeVertexNormals()
    const cor = new Float32Array(pos.length).fill(0.14)
    geo.setAttribute('color', new THREE.BufferAttribute(cor, 3))
    const malha = new THREE.Mesh(geo, mat)
    malha.name = 'vida-fio-bonde'
    malha.userData.peso = 0.5
    cena.add(malha)
  }
  return { ...conta, fios: fios.length }
}
