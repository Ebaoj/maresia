// Governador de qualidade em tempo real (24/10/2026). Lógica pura (sem three, sem relógio: recebe o dt de cada
// quadro), para testar em segundos.
//
// A resolução dinâmica (resolucao-dinamica.js) mexe só na escala, em passos pequenos e com piso. Na tela Retina
// do M1 isso não bastava: o jogo travava o tempo todo mesmo no piso. O governador olha mais longe (o p90 de alguns
// segundos) e troca o PERFIL inteiro (alto, medio, baixo) quando o quadro fica caro por muito tempo:
//   - desce um nível quando o p90 passa de orçamento x descerAcima por pelo menos `sustentarMs` seguidos;
//   - sobe um nível quando o p90 fica abaixo de orçamento x subirAbaixo por `esperaSubirMs` seguidos;
//   - depois de qualquer troca, espera `resfriarMs` com a janela zerada (o quadro da troca e a realocação não contam);
//   - anti-oscilação: se descer logo depois de ter subido, a espera para subir de novo dobra (até `esperaMaxMs`).
// Quem chama aplica o nível (qualidade.js: aplicarNivelVivo). Com ?qualidade=alto|medio|baixo na URL ele não roda.

import { NIVEIS } from '../qualidade.js'

const DT_MAXIMO_MS = 250 // troca de aba, pausa: não é custo de desenho

export class GovernadorQualidade {
  constructor({ nivel = 'medio', orcamentoMs = 16.7, janela = 60, descerAcima = 1.3, subirAbaixo = 0.7,
    sustentarMs = 2500, esperaSubirMs = 10000, esperaMaxMs = 60000, resfriarMs = 4000, minimo = 'baixo', maximo = 'alto' } = {}) {
    this.nivel = NIVEIS.includes(nivel) ? nivel : 'medio'
    Object.assign(this, { orcamentoMs, descerAcima, subirAbaixo, sustentarMs, esperaSubirMs, esperaMaxMs, resfriarMs })
    this.iMin = NIVEIS.indexOf(minimo)
    this.iMax = NIVEIS.indexOf(maximo)
    this.janela = Math.max(10, janela | 0)
    this.tempos = new Float64Array(this.janela)
    this.ordenados = new Float64Array(this.janela)
    this.esperaAtual = esperaSubirMs
    this.ultimaFoiSubida = false
    this.trocas = [] // { de, para, motivo, p90 }
    this.zerar()
    this.msResfriar = 0
  }

  zerar() {
    this.n = 0
    this.i = 0
    this.msCaro = 0
    this.msFolga = 0
  }

  p90() {
    this.ordenados.set(this.tempos)
    this.ordenados.sort()
    return this.ordenados[Math.ceil(0.9 * this.janela) - 1]
  }

  trocar(para, motivo, p90) {
    const de = this.nivel
    this.nivel = para
    this.trocas.push({ de, para, motivo, p90: +p90.toFixed(1) })
    this.zerar()
    this.msResfriar = this.resfriarMs
    return para
  }

  // dtMs: tempo do quadro. Devolve o NOVO nível quando decidir trocar; senão null.
  quadro(dtMs) {
    if (!(dtMs > 0)) return null
    if (dtMs > DT_MAXIMO_MS) { this.zerar(); return null }
    if (this.msResfriar > 0) { this.msResfriar -= dtMs; return null }
    this.tempos[this.i] = dtMs
    this.i = (this.i + 1) % this.janela
    if (this.n < this.janela) { this.n++; return null }
    const p90 = this.p90()
    const iNivel = NIVEIS.indexOf(this.nivel)
    if (p90 > this.orcamentoMs * this.descerAcima) {
      this.msFolga = 0
      this.msCaro += dtMs
      if (this.msCaro >= this.sustentarMs && iNivel > this.iMin) {
        // desceu logo depois de subir: a subida não se sustentou, espera mais para tentar de novo
        if (this.ultimaFoiSubida) this.esperaAtual = Math.min(this.esperaMaxMs, this.esperaAtual * 2)
        this.ultimaFoiSubida = false
        return this.trocar(NIVEIS[iNivel - 1], 'caro', p90)
      }
      return null
    }
    this.msCaro = 0
    if (p90 < this.orcamentoMs * this.subirAbaixo && iNivel < this.iMax) {
      this.msFolga += dtMs
      if (this.msFolga >= this.esperaAtual) {
        this.ultimaFoiSubida = true
        return this.trocar(NIVEIS[iNivel + 1], 'folga', p90)
      }
    } else {
      this.msFolga = 0
    }
    return null
  }
}
