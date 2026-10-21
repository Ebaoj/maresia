// Máscara só da SOMBRA da copa do coqueiro (21/10/2026). A folha que se vê usa a máscara de sempre (46 folíolos
// iguais de cada lado); a sombra sai desta, que imita a sombra de um coqueiro de verdade:
//   - folíolos que se juntam em tufos irregulares (2 a 5 por tufo), com vãos de tamanho e espaçamento variados:
//     nenhuma frequência constante de listra (a versão de affa542, 14 folíolos iguais, virava no chão um
//     "espirógrafo" de arcos listrados, visto no Poço da Draga ao meio-dia);
//   - a folha afina na ponta e perto da base, a nervura entorta e afina;
//   - folha quebrada ou escondida em parte (um trecho de um lado sem folíolos, ponta mais curta);
//   - em parte das variantes, uma segunda folha passa por baixo, de viés: perto do tronco as folhas se sobrepõem
//     e viram massa escura, e a copa parece ter 15 a 25 folhas em vez das 10 da malha.
// São VARIANTES lado a lado numa textura só; cada folha da malha usa uma (atributo uv1, sorteado com semente em
// geometriaCopa). Tudo com semente: a cidade sai sempre igual.
import { criarAleatorio } from '../utils.js'

export const VARIANTES_SOMBRA = 8
const LARG = 128 // pixels de uma variante (a folha tem 1,5 m de largura máxima: ~1,2 cm por pixel)
const ALT = 512

// Os folíolos de uma folha, em coordenadas da variante (0..1 na largura, 0..1 no comprimento). Puro (sem canvas).
// eixo: { x0, y0, x1, y1 } da nervura; escala: largura máxima relativa.
export function foliolos(rnd, { eixo, escala = 1, comprimento = 1, quebra = null, densidade = 1 } = {}) {
  const lista = []
  const tFim = comprimento
  let t = 0.03 + rnd.proximo() * 0.03
  while (t < tFim - 0.02) {
    // tufo: 3 a 6 folíolos colados (convergem na ponta e viram uma cunha cheia), depois um vão de tamanho sorteado
    const n = 3 + Math.floor(rnd.proximo() * 4)
    const passoDentro = 0.01 + rnd.proximo() * 0.006
    const tTufo = t
    const desvioTufo = (rnd.proximo() - 0.5) * 0.05
    for (let j = 0; j < n && t < tFim - 0.02; j++) {
      for (const lado of [-1, 1]) {
        if (rnd.proximo() < 0.05 / densidade) continue // um folíolo que falta
        if (quebra && quebra.lado === lado && t > quebra.de && t < quebra.ate) continue // trecho escondido
        // envelope: a folha afina na base e na ponta
        const s = Math.max(0, Math.min(1, t / tFim))
        const env = Math.pow(Math.sin(Math.PI * Math.min(1, s * 0.95 + 0.06)), 0.75) * (1 - 0.25 * s)
        lista.push({
          t,
          lado,
          comp: 0.48 * escala * env * (0.8 + rnd.proximo() * 0.3), // fração da largura
          queda: 0.07 + rnd.proximo() * 0.06 + desvioTufo + (tTufo - t) * 0.9, // o tufo converge na ponta
          grossura: 8.5 + rnd.proximo() * 4.5, // pixels na base (fino some no mapa de longe com o sol baixo)
        })
      }
      t += passoDentro
    }
    t += 0.012 + rnd.proximo() * 0.045 // vão entre tufos: de 6 a 29 pixels, sorteado
  }
  return lista.map((f) => ({ ...f, eixo }))
}

// Ponto da nervura em t (0 = base, junto do tronco; 1 = ponta), em pixels da variante. A textura do canvas sobe
// virada (flipY): a linha de baixo do canvas é v = 0, a base da folha na malha.
function naNervura(eixo, t, W, H) {
  const curva = Math.sin(t * Math.PI) * (eixo.curva || 0)
  return [(eixo.x0 + (eixo.x1 - eixo.x0) * t + curva) * W, (1 - (eixo.y0 + (eixo.y1 - eixo.y0) * t)) * H]
}

function desenharFolha(ctx, W, H, eixo, lista, comprimento) {
  // nervura que afina
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * comprimento
    const b = ((i + 1) / 12) * comprimento
    const [xa, ya] = naNervura(eixo, a, W, H)
    const [xb, yb] = naNervura(eixo, b, W, H)
    ctx.lineWidth = 9 * (1 - a / comprimento) + 2
    ctx.beginPath(); ctx.moveTo(xa, ya); ctx.lineTo(xb, yb); ctx.stroke()
  }
  // folíolo: forma cheia que afina da base à ponta, curvada para a ponta da folha
  for (const f of lista) {
    const [bx, by] = naNervura(eixo, f.t, W, H)
    const dx = f.lado * f.comp * W
    const dy = -f.queda * H // para a ponta da folha (para cima no canvas)
    const tx = bx + dx, ty = by + dy
    const cx = bx + dx * 0.5, cy = by + dy * 0.3
    const g = f.grossura / 2
    ctx.beginPath()
    ctx.moveTo(bx, by - g)
    ctx.quadraticCurveTo(cx, cy - g, tx, ty)
    ctx.quadraticCurveTo(cx, cy + g, bx, by + g)
    ctx.closePath()
    ctx.fill()
  }
}

// Desenha as variantes lado a lado (largura total LARG × VARIANTES_SOMBRA). semente: a da cidade.
export function desenharMascaraSombra(ctx, semente = 1932) {
  const W = LARG, H = ALT
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, W * VARIANTES_SOMBRA, H)
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = '#fff'
  ctx.lineCap = 'round'
  const rnd = criarAleatorio(semente)
  const info = []
  for (let v = 0; v < VARIANTES_SOMBRA; v++) {
    ctx.save()
    ctx.translate(v * W, 0)
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip()
    const comprimento = 0.82 + rnd.proximo() * 0.18 // folha velha quebrada na ponta, às vezes
    const eixo = { x0: 0.5, y0: 0, x1: 0.5 + (rnd.proximo() - 0.5) * 0.12, y1: 1, curva: (rnd.proximo() - 0.5) * 0.1 }
    const quebra = rnd.proximo() < 0.45 ? { lado: rnd.proximo() < 0.5 ? -1 : 1, de: 0.2 + rnd.proximo() * 0.4, ate: 0 } : null
    if (quebra) quebra.ate = quebra.de + 0.12 + rnd.proximo() * 0.2
    const lista = foliolos(rnd, { eixo, comprimento, quebra })
    desenharFolha(ctx, W, H, eixo, lista, comprimento)
    // segunda folha por baixo, de viés, só na metade de perto do tronco (onde as folhas se amontoam)
    let segunda = false
    if (rnd.proximo() < 0.6) {
      segunda = true
      const lado = rnd.proximo() < 0.5 ? -1 : 1
      const e2 = { x0: 0.5 + lado * 0.08, y0: 0, x1: 0.5 + lado * (0.35 + rnd.proximo() * 0.15), y1: 0.75, curva: lado * 0.05 }
      const c2 = 0.45 + rnd.proximo() * 0.35
      desenharFolha(ctx, W, H, e2, foliolos(rnd, { eixo: e2, comprimento: c2, escala: 0.7, densidade: 0.8 }), c2)
    }
    ctx.restore()
    info.push({ foliolos: lista.length, comprimento: +comprimento.toFixed(2), quebra: !!quebra, segunda })
  }
  return info
}

export const tamanhoMascaraSombra = () => ({ largura: LARG * VARIANTES_SOMBRA, altura: ALT })
