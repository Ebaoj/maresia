// A Coluna da Hora, no centro da Praça do Ferreira reformada (inaugurada em 31/12/1933).
//
//   FATO   art déco, projeto do engenheiro José Gonçalves da Justa [WP-Ferreira]
//   FATO   cerca de 13 m de altura, segundo Raimundo Girão [UECE-Coluna] (cfg.marcos.colunaAltura)
//   FATO   derrubada em 1967 ou 1969; a de hoje é réplica de 1991 [DN-Ferreira-30anos]
//   HIP    a forma pela réplica e pela linguagem déco: base em quatro degraus; pedestal de planta em cruz (quinas
//          recuadas) com caneluras fundas; fuste em três estágios que recuam, cada um com dois canais verticais
//          por face e frisos escalonados entre eles; mísulas em degraus abrindo sob o bloco do relógio; quatro
//          mostradores escuros com ponteiros e marcas claras (para lerem de longe na praça); coroa escalonada e
//          remate. Pedra de cor quente (cfg.marcos.corColuna), não o branco de caixa da primeira versão.
//          O conceito aprovado saiu alto demais e com cara de torre clássica; o Joabe aceitou corrigir no 3D
//   LICENÇA o relógio é de 1933: anacronismo aceito pelo Joabe (praça "depois da reforma"), registrado em
//          docs/direcao-de-arte.md. Com cfg.marcos.pracaReforma = false volta a praça de 1932 com o coreto.
//
// Os ponteiros andam com a hora do jogo (o único movimento da praça): ficam fora da malha juntada.

import * as THREE from 'three'
import { Obra } from './obra.js'

// as medidas valem para 13 m; a altura do cfg estica só o fuste (o resto mantém o tamanho de gente)
const BASE = 0.8 // quatro degraus
const PEDESTAL = 2.4
const MISULAS = 0.7
const RELOGIO = 1.9
const COROA = 1.5

// um bloco de planta em cruz: o quadrado inteiro com as quatro quinas recuadas
function cruz(obra, chave, y, h, lado, recuo) {
  obra.caixa(chave, 0, y + h / 2, 0, lado - recuo * 2, h, lado)
  obra.caixa(chave, 0, y + h / 2, 0, lado, h, lado - recuo * 2)
}

// os canais verticais recuados de um estágio: n por face, escuros (a sombra do déco). meia: a distância da face ao
// eixo; vao: a meia largura da face reta (a cruz recua nas quinas)
function canais(obra, y, h, meia, vao, n, larg = 0.12) {
  for (let f = 0; f < 4; f++) {
    const ry = (f * Math.PI) / 2
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n - 0.5
      const g = new THREE.BoxGeometry(larg, h, 0.05).translate(t * vao * 1.7, y + h / 2, meia + 0.004).rotateY(ry)
      obra.add('colunaSombra', g)
    }
  }
}

export function criarColunaHora(cena, mats, origem, y, cfg) {
  const H = cfg.marcos.colunaAltura
  const fuste = Math.max(3, H - BASE - PEDESTAL - MISULAS - RELOGIO - COROA)
  const obra = new Obra('coluna-da-hora', origem, y)
  // quatro degraus
  for (let i = 0; i < 4; i++) obra.caixa('pedra', 0, 0.1 + i * 0.2, 0, 4.6 - i * 0.55, 0.2, 4.6 - i * 0.55)
  // o pedestal em cruz, com rodapé e cimalha escalonados e as caneluras fundas
  const yP = BASE
  cruz(obra, 'coluna', yP, PEDESTAL, 2.3, 0.28)
  cruz(obra, 'colunaSombra', yP, 0.3, 2.45, 0.28)
  cruz(obra, 'coluna', yP + PEDESTAL - 0.22, 0.22, 2.5, 0.3)
  cruz(obra, 'coluna', yP + PEDESTAL - 0.02, 0.18, 2.2, 0.26)
  canais(obra, yP + 0.45, PEDESTAL - 0.85, 1.15, 1.15 - 0.28, 5, 0.09)
  // a placa da inauguração numa das faces (a da praça)
  obra.caixa('colunaSombra', 0, yP + 1.15, 1.16, 0.9, 0.45, 0.03)
  // o fuste em três estágios que recuam
  let yF = yP + PEDESTAL + 0.16
  const estagios = [[1.5, 0.42], [1.32, 0.33], [1.16, 0.25]]
  for (const [k, [lado, frac]] of estagios.entries()) {
    const h = fuste * frac
    cruz(obra, 'coluna', yF, h, lado, 0.12)
    canais(obra, yF + 0.25, h - 0.5, lado / 2, lado / 2 - 0.12, 2, 0.14)
    // o friso escalonado em cima de cada estágio (dois degraus)
    cruz(obra, 'coluna', yF + h - 0.18, 0.18, lado + 0.14, 0.12)
    if (k < estagios.length - 1) cruz(obra, 'colunaSombra', yF + h, 0.06, lado + 0.02, 0.12)
    yF += h
  }
  // as mísulas em degraus abrindo sob o relógio
  let yM = yF
  for (const lado of [1.3, 1.48, 1.66, 1.84]) {
    cruz(obra, 'coluna', yM, MISULAS / 4, lado, 0.1)
    yM += MISULAS / 4
  }
  // o bloco do relógio com os quatro mostradores escuros, marcas e aro claros
  const yR = yM
  cruz(obra, 'coluna', yR, RELOGIO, 1.84, 0.14)
  const faces = []
  for (let k = 0; k < 4; k++) {
    const ry = (k * Math.PI) / 2
    const n = [Math.sin(ry), Math.cos(ry)]
    const c = yR + RELOGIO / 2
    obra.add('relogioMarca', new THREE.TorusGeometry(0.66, 0.07, 6, 24).rotateY(ry).translate(n[0] * 0.94, c, n[1] * 0.94))
    obra.add('relogioMostrador', new THREE.CircleGeometry(0.64, 24).rotateY(ry).translate(n[0] * 0.93, c, n[1] * 0.93))
    for (let h = 0; h < 12; h++) {
      const a = (h / 12) * Math.PI * 2
      const m = new THREE.BoxGeometry(0.05, h % 3 ? 0.08 : 0.15, 0.02).rotateZ(-a)
      m.translate(Math.sin(a) * 0.52, Math.cos(a) * 0.52, 0).rotateY(ry)
      obra.add('relogioMarca', m.translate(n[0] * 0.94, c, n[1] * 0.94))
    }
    faces.push({ ry, n })
  }
  // a coroa escalonada e o remate
  let yC = yR + RELOGIO
  for (const [lado, h, chave] of [[2.0, 0.16, 'coluna'], [1.7, 0.3, 'coluna'], [1.4, 0.35, 'coluna'], [1.1, 0.3, 'colunaSombra'], [0.8, 0.25, 'coluna']]) {
    cruz(obra, chave, yC, h, lado, 0.1)
    yC += h
  }
  obra.torno('ferro', 0, yC, 0, [[0, 0], [0.14, 0], [0.09, 0.12], [0.14, 0.26], [0.02, 0.62], [0, 0.66]], 8)
  obra.colisaoCaixa(0, 0, 2.3, 2.3)
  for (let i = 0; i < 4; i++) obra.deck(0, 0, 2.3 - i * 0.275, 2.3 - i * 0.275, 0.2 + i * 0.2)
  obra.montar(cena, mats, { solidos: ['coluna'] })

  // os ponteiros (claros sobre o mostrador escuro): um grupo por face, girados pela hora do jogo
  const ponteiros = []
  const gH = new THREE.BoxGeometry(0.07, 0.34, 0.025).translate(0, 0.13, 0)
  const gM = new THREE.BoxGeometry(0.045, 0.5, 0.025).translate(0, 0.21, 0)
  for (const f of faces) {
    const [x, z] = obra.mundo(f.n[0] * 0.96, f.n[1] * 0.96)
    const g = new THREE.Group()
    g.position.set(x, y + yR + RELOGIO / 2, z)
    g.rotation.y = obra.giro + f.ry
    const h = new THREE.Mesh(gH, mats.relogioMarca)
    const m = new THREE.Mesh(gM, mats.relogioMarca)
    h.castShadow = m.castShadow = false
    g.add(h, m)
    g.name = 'coluna-da-hora-ponteiros'
    cena.add(g)
    ponteiros.push({ h, m })
  }
  return {
    obra,
    altura: yC + 0.66,
    atualizar() {
      const hora = cfg.tempo.hora
      for (const p of ponteiros) {
        p.h.rotation.z = -((hora % 12) / 12) * Math.PI * 2
        p.m.rotation.z = -((hora % 1) * Math.PI * 2)
      }
    },
  }
}
