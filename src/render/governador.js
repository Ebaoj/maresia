// Governador de qualidade em tempo real (24/10/2026; refeito em 27/10/2026, perf-governador). Lógica pura (sem three,
// sem relógio: recebe o dt de cada quadro), para testar em segundos.
//
// Por que refeito: no M1 do Joabe (Retina, 72-78 FPS, p50 ~13 ms, p95 15-20 ms) o governador antigo trocava o PERFIL
// inteiro e, junto com a resolução dinâmica (que descia sozinha pelo p75), o pixel ratio ia a 0,5: o jogo ficava
// borrado com folga sobrando. Agora:
//   - a RESOLUÇÃO é a última coisa a cair. Antes dela, uma escada de degraus: sombra de perto mais leve, pincelada em
//     meia resolução, profundidade de campo, distância de desenho, LOD, sombra de perto, estabilização;
//   - desce só com o p95 caro SUSTENTADO (janela de ~2 s, julgada a cada 250 ms, por `sustentarMs` seguidos). Quadro
//     acima de 100 ms (travada, troca de aba) não entra na janela: pico não derruba nada;
//   - degrau de resolução só desce quando o p50 também não tem folga (p50 > orçamento x semFolgaP50): com p50 de 13 ms
//     num orçamento de 16,7 ms a resolução não mexe;
//   - piso de pixel ratio 0,75; abaixo disso (0,65 e 0,5) só em emergência: p50 > orçamento x emergenciaP50 por
//     `sustentarEmergenciaMs`;
//   - sobe (degrau a degrau, a resolução primeiro) com p95 < orçamento x subirP95 e p50 < orçamento x subirP50 por
//     `esperaSubirMs`; se descer logo depois de subir, a espera dobra (até `esperaMaxMs`): histerese sem oscilar.
// Quem chama aplica: ajustes() devolve as chaves do cfg do degrau atual (por cima dos valores de base, guardados por
// quem chama) e capPixel() o teto de pixel ratio do degrau. Com ?qualidade=alto|medio|baixo na URL ele não roda.

const DT_PICO_MS = 100 // travada ou troca de aba: fora da janela (não é custo sustentado de desenho)
const DT_PAUSA_MS = 250 // pausa / troca de aba: zera a janela
const JANELA_MS = 2000
const PASSO_JULGAR_MS = 250
const CAP = 512

// A escada, do melhor para o pior. Cada degrau soma às chaves dos anteriores. `pixel`: teto de pixel ratio do degrau
// (só nos degraus de resolução). `emergencia`: só com o quadro realmente estourado.
export const DEGRAUS = [
  { nome: 'cheio', chaves: {} },
  { nome: 'sombra-perto-leve', chaves: { 'mundo.sombraPertoResolucao': 512 } },
  { nome: 'pincelada-meia', chaves: { 'estilo.arcPinturaMeia': true } },
  { nome: 'sem-dof', chaves: { 'estilo.dof': false } },
  { nome: 'distancia', chaves: { 'desempenho.cortePx': 6, 'pessoas.ate': 260, 'marcos.distDetalhe': 110 } },
  { nome: 'lod', chaves: { 'arvores.lodPerto': 40, 'arvores.lodLonge': 55, 'arvores.lodBloco': 60, 'mundo.palhaPerto': 150 } },
  { nome: 'sem-sombra-perto', chaves: { 'mundo.sombraPerto': false } },
  { nome: 'sem-estabilizar', chaves: { 'estilo.estabilizar': 0 } },
  { nome: 'pixel-0.9', pixel: 0.9, chaves: {} },
  { nome: 'pixel-0.8', pixel: 0.8, chaves: {} },
  { nome: 'pixel-0.75', pixel: 0.75, chaves: {} },
  { nome: 'pixel-0.65', pixel: 0.65, emergencia: true, chaves: {} },
  { nome: 'pixel-0.5', pixel: 0.5, emergencia: true, chaves: {} },
]

export class GovernadorQualidade {
  constructor({ orcamentoMs = 16.7, descerP95 = 1.3, semFolgaP50 = 0.95, emergenciaP50 = 1.5, subirP95 = 1.15,
    subirP50 = 0.85, sustentarMs = 3000, sustentarEmergenciaMs = 5000, esperaSubirMs = 8000, esperaMaxMs = 60000,
    resfriarMs = 3000, degrau = 0, degraus = DEGRAUS } = {}) {
    Object.assign(this, { orcamentoMs, descerP95, semFolgaP50, emergenciaP50, subirP95, subirP50, sustentarMs,
      sustentarEmergenciaMs, esperaSubirMs, esperaMaxMs, resfriarMs, degraus })
    this.degrau = Math.max(0, Math.min(degraus.length - 1, degrau | 0))
    this.tempos = new Float32Array(CAP)
    this.ordenados = new Float32Array(CAP)
    this.esperaAtual = esperaSubirMs
    this.ultimaFoiSubida = false
    this.trocas = [] // { de, para, motivo, p50, p95 }
    this.ultimo = { p50: 0, p95: 0 }
    this.zerar()
    this.msResfriar = 0
  }

  get nome() { return this.degraus[this.degrau].nome }

  zerar() {
    this.n = 0
    this.i = 0
    this.msJulgar = 0
    this.msCaro = 0
    this.msEmergencia = 0
    this.msFolga = 0
  }

  // as chaves de cfg somadas até o degrau atual
  ajustes(degrau = this.degrau) {
    const r = {}
    for (let k = 1; k <= degrau; k++) Object.assign(r, this.degraus[k].chaves)
    return r
  }

  // teto de pixel ratio do degrau atual (Infinity: sem teto)
  capPixel(degrau = this.degrau) {
    let cap = Infinity
    for (let k = 1; k <= degrau; k++) if (this.degraus[k].pixel) cap = Math.min(cap, this.degraus[k].pixel)
    return cap
  }

  // p50 e p95 dos quadros dos últimos JANELA_MS (sem os picos)
  percentis() {
    let soma = 0, m = 0
    for (let k = 1; k <= this.n && soma < JANELA_MS; k++) {
      const v = this.tempos[(this.i - k + CAP) % CAP]
      this.ordenados[m++] = v
      soma += v
    }
    const o = this.ordenados.subarray(0, m).sort()
    return { p50: o[Math.floor(0.5 * (m - 1))], p95: o[Math.floor(0.95 * (m - 1))], cheia: soma >= JANELA_MS * 0.9 }
  }

  trocar(para, motivo, p) {
    const de = this.degrau
    this.degrau = para
    this.trocas.push({ de: this.degraus[de].nome, para: this.degraus[para].nome, motivo, p50: +p.p50.toFixed(1), p95: +p.p95.toFixed(1) })
    if (this.trocas.length > 50) this.trocas.shift()
    this.zerar()
    this.msResfriar = this.resfriarMs
    return para
  }

  // dtMs: tempo do quadro. Devolve o NOVO degrau quando decidir trocar; senão null.
  quadro(dtMs) {
    if (!(dtMs > 0)) return null
    if (dtMs > DT_PAUSA_MS) { this.zerar(); return null }
    if (this.msResfriar > 0) { this.msResfriar -= dtMs; return null }
    if (dtMs <= DT_PICO_MS) {
      this.tempos[this.i] = dtMs
      this.i = (this.i + 1) % CAP
      if (this.n < CAP) this.n++
    }
    this.msJulgar += dtMs
    if (this.msJulgar < PASSO_JULGAR_MS) return null
    const passo = this.msJulgar
    this.msJulgar = 0
    const p = this.percentis()
    if (!p.cheia) return null
    this.ultimo = p
    const B = this.orcamentoMs
    const prox = this.degraus[this.degrau + 1]

    // descer: p95 caro sustentado; degrau de resolução pede também p50 sem folga; emergência pede p50 estourado
    const caro = p.p95 > B * this.descerP95
    const semFolga = p.p50 > B * this.semFolgaP50
    const estourado = p.p50 > B * this.emergenciaP50
    this.msCaro = caro ? this.msCaro + passo : 0
    this.msEmergencia = estourado ? this.msEmergencia + passo : 0
    if (prox && caro) {
      const pode = prox.emergencia ? this.msEmergencia >= this.sustentarEmergenciaMs
        : prox.pixel ? (semFolga && this.msCaro >= this.sustentarMs)
          : this.msCaro >= this.sustentarMs
      if (pode) {
        if (this.ultimaFoiSubida) this.esperaAtual = Math.min(this.esperaMaxMs, this.esperaAtual * 2)
        this.ultimaFoiSubida = false
        return this.trocar(this.degrau + 1, prox.emergencia ? 'emergencia' : 'caro', p)
      }
      this.msFolga = 0
      return null
    }

    // subir: folga sustentada (p95 e p50)
    if (this.degrau > 0 && p.p95 < B * this.subirP95 && p.p50 < B * this.subirP50) {
      this.msFolga += passo
      if (this.msFolga >= this.esperaAtual) {
        this.ultimaFoiSubida = true
        return this.trocar(this.degrau - 1, 'folga', p)
      }
    } else {
      this.msFolga = 0
    }
    return null
  }

  estado() {
    return { degrau: this.degrau, nome: this.nome, p50: +(this.ultimo.p50 || 0).toFixed(1), p95: +(this.ultimo.p95 || 0).toFixed(1), trocas: this.trocas.slice(-8) }
  }
}

// Lê e escreve chaves "grupo.chave" num cfg (para guardar a base e aplicar o degrau)
export function lerChave(cfg, caminho) {
  return caminho.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), cfg)
}
export function escreverChave(cfg, caminho, valor) {
  const partes = caminho.split('.')
  const ultima = partes.pop()
  const dono = partes.reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), cfg)
  if (dono && ultima in dono) dono[ultima] = valor
}

// Aplica o degrau: volta à base cada chave que a escada mexe e põe por cima as do degrau. `base` guarda o valor de
// partida de cada chave (preenchido na primeira chamada).
export function aplicarDegrau(cfg, gov, base) {
  for (const d of gov.degraus) for (const k in d.chaves) if (!(k in base)) base[k] = lerChave(cfg, k)
  const aj = gov.ajustes()
  for (const k in base) escreverChave(cfg, k, k in aj ? aj[k] : base[k])
  // a sombra de perto leve é a metade da de base (nunca acima dela)
  if ('mundo.sombraPertoResolucao' in aj) escreverChave(cfg, 'mundo.sombraPertoResolucao', Math.min(base['mundo.sombraPertoResolucao'] ?? 1024, Math.max(512, (base['mundo.sombraPertoResolucao'] ?? 1024) / 2)))
}
