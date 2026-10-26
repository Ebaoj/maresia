export const sinalGpu = { ms: null, instante: 0 }

// R1 (robustez no M1, 19/10/2026): resolução de desenho guiada pelo tempo de quadro. Lógica pura (sem three, sem
// relógio: recebe o dt de cada quadro), para testar em segundos.
//
// Sob carga de outros apps a GPU fica disputada e cada quadro que perde o vsync vira 33 ou 50 ms; os passes de tela
// cheia custam em proporção aos pixels, então a resolução é a alavanca que se adapta. Desce quando a MAIORIA dos
// quadros recentes estoura o orçamento (percentil 75 da janela, não um pico isolado) e sobe devagar quando sobra.
// Mudar a escala realoca as texturas do pós (RenderTarget.setSize), por isso as descidas têm intervalo mínimo.
//
// Uso: a cada quadro `const nova = dinamica.quadro(dtMs)`; se vier número, a escala mudou (também em `dinamica.escala`)
// e quem chama refaz o tamanho do desenho. `redefinir(alvo)` quando o usuário mexe na resolução do painel.

const DESCE_FATOR = 1.1 // p75 acima de orçamento x 1,1: a maioria dos quadros estoura
const SOBE_FATOR = 0.75 // p75 abaixo de orçamento x 0,75: sobra folga
const PASSO_DESCE = 0.1
const PASSO_SOBE = 0.05
const INTERVALO_DESCIDA_MS = 500 // no máximo uma descida a cada 0,5 s de quadros acumulados
const FOLGA_PARA_SUBIR_MS = 2000 // folga contínua antes de subir
const ESPERA_APOS_SUBIR_MS = 1000 // depois de subir, não desce por 1 s (evita oscilar)
const DT_MAXIMO_MS = 250 // acima disso é troca de aba ou pausa, não custo de desenho
// Guarda de eficácia (fluido, 22/10/2026; opção eficacia: true): o quadro preso no processador (ou no vértice, que
// não muda com a resolução) não melhora com menos pixels, e a regra pura levava a escala até o piso à toa. Depois de
// cada descida, com a janela de novo cheia, o p75 precisa ter caído GANHO_MINIMO; senão a escala volta ao que era e
// fica BLOQUEIO_MS sem descer.
const GANHO_MINIMO = 0.04
const BLOQUEIO_MS = 10000

const arredondar = (v) => Math.round(v * 1000) / 1000 // 0,05 em ponto flutuante acumula erro

export class ResolucaoDinamica {
  constructor({ alvo = 1.25, minimo = 0.6, orcamentoMs = 16.7, janela = 30, eficacia = false } = {}) {
    this.eficacia = eficacia
    this.alvo = alvo
    this.minimo = minimo
    this.orcamentoMs = orcamentoMs
    this.janela = Math.max(2, Math.floor(janela))
    // janela circular de tempos de quadro e cópia ordenada para o percentil (preparadas uma vez: sem alocar por quadro)
    this.tempos = new Float64Array(this.janela)
    this.ordenados = new Float64Array(this.janela)
    this.redefinir(alvo)
  }

  // Volta para o alvo e esquece o histórico (o usuário mexeu na resolução, ou a chave acabou de ser ligada).
  redefinir(alvo = this.alvo) {
    this.alvo = alvo
    this.escala = alvo
    this.n = 0
    this.i = 0
    this.msDesdeDescida = Infinity
    this.msFolga = 0
    this.msEspera = 0
    this.conferir = null // { p75, escala, quadros }: a descida que ainda precisa provar que ajudou
    this.msBloqueio = 0
    this.revertidas = 0
  }

  // Menor escala permitida; se o usuário pediu um alvo abaixo do mínimo, vale o alvo.
  get piso() {
    return Math.min(this.minimo, this.alvo)
  }

  // Percentil 75 da janela cheia (posto mais próximo).
  p75() {
    this.ordenados.set(this.tempos)
    this.ordenados.sort()
    return this.ordenados[Math.ceil(0.75 * this.janela) - 1]
  }

  // dtMs: tempo do quadro em ms. Devolve a NOVA escala quando decidir mudar; senão null.
  quadro(dtMs) {
    // Amostra assíncrona recente evita os degraus de vsync; sem extensão, vale o intervalo.
    if (sinalGpu.ms > 0 && performance.now() - sinalGpu.instante < 250) dtMs = sinalGpu.ms
    if (!(dtMs > 0)) return null
    if (dtMs > DT_MAXIMO_MS) {
      // troca de aba, pausa: o histórico não vale mais
      this.n = 0
      this.i = 0
      this.msFolga = 0
      return null
    }

    this.tempos[this.i] = dtMs
    this.i = (this.i + 1) % this.janela
    if (this.n < this.janela) this.n++
    this.msDesdeDescida += dtMs
    this.msEspera = Math.max(0, this.msEspera - dtMs)
    this.msBloqueio = Math.max(0, this.msBloqueio - dtMs)
    if (this.conferir) this.conferir.quadros++

    // o mínimo foi subido no painel por cima da escala atual
    if (this.escala < this.piso) {
      this.escala = this.piso
      return this.escala
    }

    if (this.n < this.janela) return null // julga só com a janela cheia
    const p75 = this.p75()

    // a última descida ajudou? (só com a janela inteira de quadros depois dela)
    if (this.conferir && this.conferir.quadros >= this.janela) {
      const c = this.conferir
      this.conferir = null
      if (p75 > c.p75 * (1 - GANHO_MINIMO)) {
        this.escala = c.escala
        this.msBloqueio = BLOQUEIO_MS
        this.revertidas++
        return this.escala
      }
    }

    if (p75 > this.orcamentoMs * DESCE_FATOR) {
      this.msFolga = 0
      if (this.escala > this.piso && this.msEspera <= 0 && this.msDesdeDescida >= INTERVALO_DESCIDA_MS && this.msBloqueio <= 0 && !this.conferir) {
        if (this.eficacia) this.conferir = { p75, escala: this.escala, quadros: 0 }
        this.escala = arredondar(Math.max(this.piso, this.escala - PASSO_DESCE))
        this.msDesdeDescida = 0
        return this.escala
      }
      return null
    }

    if (p75 < this.orcamentoMs * SOBE_FATOR && this.escala < this.alvo) {
      this.msFolga += dtMs
      if (this.msFolga >= FOLGA_PARA_SUBIR_MS) {
        this.escala = arredondar(Math.min(this.alvo, this.escala + PASSO_SOBE))
        this.msFolga = 0
        this.msEspera = ESPERA_APOS_SUBIR_MS
        return this.escala
      }
    } else {
      this.msFolga = 0
    }
    return null
  }
}
