// A Coluna da Hora, no centro da Praça do Ferreira reformada (inaugurada em 31/12/1933).
//
//   FATO   art déco, projeto do engenheiro José Gonçalves da Justa [WP-Ferreira]
//   FATO   cerca de 13 m de altura, segundo Raimundo Girão [UECE-Coluna] (cfg.marcos.colunaAltura)
//   FATO   derrubada em 1967 ou 1969; a de hoje é réplica de 1991 [DN-Ferreira-30anos]
//   HIP    a forma pela réplica: base em degraus, pedestal com caneluras, fuste quadrado de quinas em aleta,
//          bloco do relógio de quatro faces e coroamento escalonado. O conceito aprovado saiu alto demais e com
//          cara de torre clássica; o Joabe aceitou corrigir no 3D (conceitos/README.md)
//   LICENÇA o relógio é de 1933: anacronismo aceito pelo Joabe (praça "depois da reforma"), registrado em
//          docs/direcao-de-arte.md. Com cfg.marcos.pracaReforma = false volta a praça de 1932 com o coreto.
//
// Os ponteiros andam com a hora do jogo (o único movimento da praça): ficam fora da malha juntada.

import * as THREE from 'three'
import { Obra } from './obra.js'

// as proporções valem para 13 m; a altura do cfg estica só o fuste (o resto mantém o tamanho de gente)
const BASE = 0.66 // três degraus
const PEDESTAL = 2.3
const RELOGIO = 1.9
const COROA = 1.35

export function criarColunaHora(cena, mats, origem, y, cfg) {
  const H = cfg.marcos.colunaAltura
  const fuste = Math.max(3, H - BASE - PEDESTAL - RELOGIO - COROA)
  const obra = new Obra('coluna-da-hora', origem, y)
  // degraus
  for (let i = 0; i < 3; i++) obra.caixa('pedra', 0, 0.11 + i * 0.22, 0, 4.2 - i * 0.6, 0.22, 4.2 - i * 0.6)
  // pedestal com caneluras verticais (o déco da réplica) e uma faixa de inscrição
  const yP = BASE
  obra.caixa('cal', 0, yP + PEDESTAL / 2, 0, 2.0, PEDESTAL, 2.0)
  obra.caixa('moldura', 0, yP + 0.12, 0, 2.2, 0.24, 2.2)
  obra.caixa('moldura', 0, yP + PEDESTAL - 0.1, 0, 2.16, 0.2, 2.16)
  for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    for (let k = -2; k <= 2; k++) {
      const a = k * 0.3
      obra.caixa('calVelha', nx ? nx * 1.005 : a, yP + 1.2, nz ? nz * 1.005 : a, nx ? 0.04 : 0.09, 1.4, nz ? 0.04 : 0.09)
    }
    obra.caixa('moldura', nx * 1.02, yP + 2.0, nz * 1.02, nx ? 0.05 : 1.5, 0.3, nz ? 0.05 : 1.5)
  }
  // fuste: quadrado, levemente mais fino em cima, com aletas nas quinas
  const yF = yP + PEDESTAL
  const fg = new THREE.BoxGeometry(1.3, fuste, 1.3)
  const pos = fg.attributes.position
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) > 0) { pos.setX(i, pos.getX(i) * 0.86); pos.setZ(i, pos.getZ(i) * 0.86) }
  fg.computeVertexNormals()
  obra.add('cal', fg.translate(0, yF + fuste / 2, 0))
  for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const ag = new THREE.BoxGeometry(0.16, fuste, 0.16)
    ag.translate(a * 0.62, yF + fuste / 2, b * 0.62)
    // a aleta acompanha o afinamento do fuste
    const q = ag.attributes.position
    for (let i = 0; i < q.count; i++) {
      const t = (q.getY(i) - yF) / fuste
      const k = 1 - 0.14 * t
      q.setX(i, a * 0.62 * k + (q.getX(i) - a * 0.62))
      q.setZ(i, b * 0.62 * k + (q.getZ(i) - b * 0.62))
    }
    ag.computeVertexNormals()
    obra.add('moldura', ag)
  }
  // frisos horizontais do fuste (três)
  for (const t of [0.33, 0.66]) {
    const w = 1.3 * (1 - 0.14 * t) + 0.12
    obra.caixa('moldura', 0, yF + fuste * t, 0, w, 0.12, w)
  }
  // o bloco do relógio, um pouco mais largo, com as quatro faces
  const yR = yF + fuste
  obra.caixa('moldura', 0, yR + 0.1, 0, 1.55, 0.2, 1.55)
  obra.caixa('cal', 0, yR + RELOGIO / 2, 0, 1.6, RELOGIO, 1.6)
  const faces = []
  for (let k = 0; k < 4; k++) {
    const ry = (k * Math.PI) / 2
    const n = [Math.sin(ry), Math.cos(ry)]
    const aro = new THREE.TorusGeometry(0.62, 0.06, 6, 24).rotateY(ry)
    obra.add('ferro', aro.translate(n[0] * 0.82, yR + RELOGIO / 2, n[1] * 0.82))
    const mostrador = new THREE.CircleGeometry(0.6, 24).rotateY(ry)
    obra.add('pedra', mostrador.translate(n[0] * 0.805, yR + RELOGIO / 2, n[1] * 0.805))
    // as doze marcas das horas
    for (let h = 0; h < 12; h++) {
      const a = (h / 12) * Math.PI * 2
      const r = 0.5
      const m = new THREE.BoxGeometry(0.04, h % 3 ? 0.07 : 0.13, 0.02).rotateZ(-a)
      m.translate(Math.sin(a) * r, Math.cos(a) * r, 0).rotateY(ry)
      obra.add('ferro', m.translate(n[0] * 0.815, yR + RELOGIO / 2, n[1] * 0.815))
    }
    faces.push({ ry, n })
  }
  // coroamento escalonado e o remate
  let yC = yR + RELOGIO
  for (const [w, h] of [[1.75, 0.18], [1.35, 0.42], [1.0, 0.35], [0.62, 0.3]]) {
    obra.caixa(w > 1.5 ? 'moldura' : 'cal', 0, yC + h / 2, 0, w, h, w)
    yC += h
  }
  obra.torno('ferro', 0, yC, 0, [[0, 0], [0.12, 0], [0.08, 0.1], [0.12, 0.22], [0.02, 0.6], [0, 0.65]], 8)
  obra.colisaoCaixa(0, 0, 2.1, 2.1)
  obra.deck(0, 0, 2.1, 2.1, 0.22)
  obra.deck(0, 0, 1.8, 1.8, 0.44)
  obra.montar(cena, mats, { solidos: ['cal'] })

  // os ponteiros: um grupo por face, girados pela hora do jogo
  const ponteiros = []
  const gH = new THREE.BoxGeometry(0.05, 0.32, 0.02).translate(0, 0.13, 0)
  const gM = new THREE.BoxGeometry(0.035, 0.48, 0.02).translate(0, 0.2, 0)
  for (const f of faces) {
    const [x, z] = obra.mundo(f.n[0] * 0.83, f.n[1] * 0.83)
    const g = new THREE.Group()
    g.position.set(x, y + yR + RELOGIO / 2, z)
    g.rotation.y = obra.giro + f.ry
    const h = new THREE.Mesh(gH, mats.ferro)
    const m = new THREE.Mesh(gM, mats.ferro)
    h.castShadow = m.castShadow = false
    g.add(h, m)
    g.name = 'coluna-da-hora-ponteiros'
    cena.add(g)
    ponteiros.push({ h, m })
  }
  return {
    obra,
    altura: yC + 0.65,
    atualizar() {
      const hora = cfg.tempo.hora
      for (const p of ponteiros) {
        p.h.rotation.z = -((hora % 12) / 12) * Math.PI * 2
        p.m.rotation.z = -((hora % 1) * Math.PI * 2)
      }
    },
  }
}
