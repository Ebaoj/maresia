// Mapa da cidade (tecla M), desenhado como a planta de 1931-1932: papel creme, tinta sépia, mar
// em hachura, quadras da grade de Herbster, vilas de palha, lugares e bairros com nome.
// O desenho do fundo é feito uma vez; a cada quadro só a seta do jogador anda.

import { LIMITES, larguraPraia } from '../mundo/mapa.js'
import { criarAleatorio } from '../utils.js'
import { costaJogo, rioJogo, pajeuJogo, lagoasJogo, lugaresJogo, bairrosJogo, trechosJogo } from '../mundo/fortaleza1932.js'

const ESCALA = 0.62 // px por metro
const MARGEM = 46
const NOMES_LUGARES = {
  pracaFerreira: 'Praça do Ferreira', passeioPublico: 'Passeio Público', forte: 'Forte', se: 'Sé',
  santaCasa: 'Santa Casa', pracaLeoes: 'Praça dos Leões', mercado: 'Mercado Público',
  theatro: 'Theatro José de Alencar', estacao: 'Estação Central', pracaEstacao: 'Praça Castro Carreira',
  cemiterio: 'Cemitério S. João Batista',
  pocoDraga: 'Poço da Draga', ponteVelha: 'Ponte Velha', ponteIngleses: 'Ponte dos Ingleses',
  vilaMorena: 'Vila Morena', seminario: 'Seminário da Prainha', farol: 'Farol do Mucuripe',
  oficinasUrubu: 'Oficinas do Urubu', vilaFerroviaria: 'Vila Ferroviária', campoUrubu: 'Campo do Urubu',
  campoOtavioBonfim: 'Campo de Otávio Bonfim', estacaoOtavio: 'Estação Otávio Bonfim',
  pracaMestres: 'Praça dos Mestres', parqueLiberdade: 'Parque da Liberdade', 'colégioMilitar': 'Colégio Militar',
  favela1932: 'Favela de 1932', barraCeara: 'Barra do Ceará',
}
const TINTA = '#3b2a22'
const PAPEL = '#efe6d2'

export function criarMapa({ quadras, grade, casasPalha }) {
  const el = document.getElementById('mapa')
  const tela = el.querySelector('canvas')
  const W = Math.round((LIMITES.x1 - LIMITES.x0) * ESCALA + MARGEM * 2)
  const H = Math.round((LIMITES.z1 - LIMITES.z0) * ESCALA + MARGEM * 2)
  tela.width = W
  tela.height = H
  const fundo = document.createElement('canvas')
  fundo.width = W
  fundo.height = H
  const px = (x) => MARGEM + (x - LIMITES.x0) * ESCALA
  const pz = (z) => MARGEM + (z - LIMITES.z0) * ESCALA
  let desenhado = false

  function desenharFundo() {
    const c = fundo.getContext('2d')
    // papel com manchas leves
    c.fillStyle = PAPEL
    c.fillRect(0, 0, W, H)
    const rnd = criarAleatorio(1932)
    for (let i = 0; i < 1400; i++) {
      c.fillStyle = `rgba(120, 90, 60, ${rnd.proximo() * 0.035})`
      c.beginPath()
      c.arc(rnd.proximo() * W, rnd.proximo() * H, 2 + rnd.proximo() * 30, 0, Math.PI * 2)
      c.fill()
    }
    // mar: azul desbotado com linhas de onda paralelas à costa
    const costa = costaJogo.filter(([x]) => x >= LIMITES.x0 - 40 && x <= LIMITES.x1 + 40)
    c.beginPath()
    c.moveTo(px(costa[0][0]), 0)
    for (const [x, z] of costa) c.lineTo(px(x), pz(z))
    c.lineTo(px(costa[costa.length - 1][0]), 0)
    c.closePath()
    c.fillStyle = 'rgba(111, 160, 170, 0.35)'
    c.fill()
    c.save()
    c.clip()
    c.strokeStyle = 'rgba(31, 95, 122, 0.28)'
    c.lineWidth = 1
    for (let k = 1; k < 26; k++) {
      c.beginPath()
      costa.forEach(([x, z], i) => {
        const y = pz(z) - k * 11 + Math.sin(i * 0.4 + k) * 1.5
        if (i === 0) c.moveTo(px(x), y)
        else c.lineTo(px(x), y)
      })
      c.stroke()
    }
    c.restore()
    // faixa de areia
    c.beginPath()
    costa.forEach(([x, z], i) => (i === 0 ? c.moveTo(px(x), pz(z)) : c.lineTo(px(x), pz(z))))
    for (let i = costa.length - 1; i >= 0; i--) c.lineTo(px(costa[i][0]), pz(costa[i][1] + larguraPraia(costa[i][0])))
    c.closePath()
    c.fillStyle = 'rgba(232, 210, 166, 0.85)'
    c.fill()
    // linha da costa
    c.beginPath()
    costa.forEach(([x, z], i) => (i === 0 ? c.moveTo(px(x), pz(z)) : c.lineTo(px(x), pz(z))))
    c.strokeStyle = '#1f5f7a'
    c.lineWidth = 2
    c.stroke()
    // rio Ceará e Pajeú
    const linha = (pts, cor, larg) => {
      c.beginPath()
      pts.forEach(([x, z], i) => (i === 0 ? c.moveTo(px(x), pz(z)) : c.lineTo(px(x), pz(z))))
      c.strokeStyle = cor
      c.lineWidth = larg
      c.lineCap = 'round'
      c.lineJoin = 'round'
      c.stroke()
    }
    linha(rioJogo, 'rgba(63, 143, 174, 0.75)', 28 * ESCALA)
    linha(rioJogo, '#1f5f7a', 1)
    linha(pajeuJogo, 'rgba(63, 143, 174, 0.9)', 3)
    // lagoas
    for (const l of lagoasJogo) {
      c.beginPath()
      c.ellipse(px(l.x), pz(l.z), l.rx * ESCALA, l.rz * ESCALA, 0, 0, Math.PI * 2)
      c.fillStyle = 'rgba(111, 174, 192, 0.8)'
      c.fill()
      c.strokeStyle = '#1f5f7a'
      c.lineWidth = 1
      c.stroke()
    }
    // quadras da grade (girar como no jogo)
    const ang = Math.atan2(grade.ex[1], grade.ex[0])
    for (const q of quadras) {
      c.save()
      c.translate(px(q.cx), pz(q.cz))
      c.rotate(ang)
      const w = grade.w * ESCALA
      const d = grade.d * ESCALA
      if (q.reservada) {
        c.strokeStyle = TINTA
        c.setLineDash([3, 2])
        c.lineWidth = 1
        c.strokeRect(-w / 2, -d / 2, w, d)
        c.setLineDash([])
      } else {
        c.fillStyle = 'rgba(181, 96, 63, 0.55)'
        c.fillRect(-w / 2, -d / 2, w, d)
        c.strokeStyle = 'rgba(59, 42, 34, 0.55)'
        c.lineWidth = 0.7
        c.strokeRect(-w / 2, -d / 2, w, d)
      }
      c.restore()
    }
    // casas de palha das vilas
    c.fillStyle = 'rgba(160, 120, 70, 0.85)'
    for (const k of casasPalha) {
      c.save()
      c.translate(px(k.x), pz(k.z))
      c.rotate(-k.rot)
      c.fillRect((-k.w / 2) * ESCALA, (-k.d / 2) * ESCALA, k.w * ESCALA, k.d * ESCALA)
      c.restore()
    }
    // nomes dos bairros
    c.fillStyle = 'rgba(59, 42, 34, 0.75)'
    c.font = 'italic 13px Georgia, serif'
    c.textAlign = 'center'
    for (const [nome, x, z] of bairrosJogo) {
      if (x < LIMITES.x0 || x > LIMITES.x1) continue
      c.fillText(nome.toUpperCase().split('').join(' '), px(x), pz(z))
    }
    // vilas de jangadeiros
    c.font = '11px Georgia, serif'
    c.fillStyle = 'rgba(122, 80, 40, 0.9)'
    for (const [k, nome] of [['pirambu', 'vila de jangadeiros'], ['praiaIracema', 'Praia de Iracema'], ['mucuripe', 'vila de jangadeiros']]) {
      const [a, b] = trechosJogo[k]
      const x = (a + b) / 2
      const z = costa.reduce((m, p) => (Math.abs(p[0] - x) < Math.abs(m[0] - x) ? p : m))[1]
      c.fillText(nome, px(x), pz(z) - 6)
    }
    // lugares
    c.textAlign = 'left'
    c.font = '11px Georgia, serif'
    for (const [k, [x, z]] of Object.entries(lugaresJogo)) {
      if (x < LIMITES.x0 || x > LIMITES.x1) continue
      c.fillStyle = TINTA
      c.beginPath()
      c.arc(px(x), pz(z), 2.6, 0, Math.PI * 2)
      c.fill()
      c.fillText(NOMES_LUGARES[k] || k, px(x) + 5, pz(z) - 3)
    }
    // cartela, rosa dos ventos e escala
    c.fillStyle = 'rgba(239, 230, 210, 0.92)'
    c.fillRect(W - 300, H - 118, 270, 92)
    c.strokeStyle = TINTA
    c.lineWidth = 1.5
    c.strokeRect(W - 300, H - 118, 270, 92)
    c.strokeRect(W - 296, H - 114, 262, 84)
    c.fillStyle = TINTA
    c.textAlign = 'center'
    c.font = 'bold 22px Georgia, serif'
    c.fillText('FORTALEZA', W - 165, H - 82)
    c.font = 'italic 14px Georgia, serif'
    c.fillText('planta da cidade · 1932', W - 165, H - 60)
    c.font = '11px Georgia, serif'
    c.fillText('M fecha', W - 165, H - 40)
    const rx = W - 70
    const ry = 110
    c.beginPath()
    c.moveTo(rx, ry - 34); c.lineTo(rx + 8, ry); c.lineTo(rx, ry + 34); c.lineTo(rx - 8, ry); c.closePath()
    c.fillStyle = 'rgba(59, 42, 34, 0.15)'
    c.fill()
    c.stroke()
    c.beginPath()
    c.moveTo(rx, ry - 34); c.lineTo(rx + 8, ry); c.lineTo(rx - 8, ry); c.closePath()
    c.fillStyle = TINTA
    c.fill()
    c.font = 'bold 14px Georgia, serif'
    c.fillText('N', rx, ry - 40)
    const e0 = MARGEM
    const e1 = MARGEM + 200 * ESCALA
    c.beginPath()
    c.moveTo(e0, H - 30); c.lineTo(e1, H - 30)
    c.lineWidth = 3
    c.stroke()
    c.font = '11px Georgia, serif'
    c.textAlign = 'left'
    c.fillText('200 m', e0, H - 14)
    // moldura
    c.lineWidth = 2
    c.strokeRect(8, 8, W - 16, H - 16)
    desenhado = true
  }

  let aberto = false
  return {
    alternar() {
      aberto = !aberto
      if (aberto && !desenhado) desenharFundo()
      el.classList.toggle('aberto', aberto)
    },
    atualizar(jogador) {
      if (!aberto) return
      const c = tela.getContext('2d')
      c.drawImage(fundo, 0, 0)
      const x = px(jogador.pos.x)
      const z = pz(jogador.pos.z)
      const yaw = jogador.yawVisual ?? 0
      // seta vermelha apontando para onde o personagem olha
      c.save()
      c.translate(x, z)
      c.rotate(Math.atan2(Math.cos(yaw), Math.sin(yaw))) // frente do personagem no mundo: (sen yaw, cos yaw)
      c.beginPath()
      c.moveTo(14, 0); c.lineTo(-8, 8); c.lineTo(-4, 0); c.lineTo(-8, -8); c.closePath()
      c.fillStyle = '#c2412d'
      c.fill()
      c.strokeStyle = PAPEL
      c.lineWidth = 2
      c.stroke()
      c.restore()
      c.beginPath()
      c.arc(x, z, 22, 0, Math.PI * 2)
      c.strokeStyle = 'rgba(194, 65, 45, 0.6)'
      c.lineWidth = 1.5
      c.stroke()
    },
  }
}
