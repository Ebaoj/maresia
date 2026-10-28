// Governador de qualidade em tempo real (24/10/2026; refeito em 27/10/2026, perf-governador; régua de custo em
// 27/10/2026, visual/correcoes). Lógica pura (sem three, sem relógio: recebe o custo e o intervalo de cada quadro),
// para testar em segundos.
//
// A régua é o CUSTO do quadro (o trabalho da CPU no passo() e, quando houver, o tempo da placa: render/custo-quadro.js),
// não o intervalo do requestAnimationFrame. O intervalo anda preso ao vsync: a 60 Hz nunca fica abaixo de 16,7 ms, e
// a condição de subir (p50 < 0,85 x orçamento) nunca era verdadeira: cada degrau que descia ficava até recarregar a
// página (docs/relatorio-visual.md, 1.1). O intervalo só serve de relógio (janela, esperas) e para notar a pausa.
//   - a RESOLUÇÃO é a última coisa a cair. Antes dela só o que o olho quase não vê: sombra de perto mais leve,
//     distância de desenho, LOD, sombra de perto. A pincelada em meia, o desfoque e a estabilização NÃO estão mais na
//     escada: trocavam o caráter da imagem num quadro (e sem a estabilização o pisca de linha fina voltava);
//   - desce só com o p95 caro SUSTENTADO (janela de ~2 s, julgada a cada 250 ms, por `sustentarMs` seguidos). Quadro
//     acima de 100 ms (travada, troca de aba) não entra na janela: pico não derruba nada;
//   - degrau de resolução só desce quando o p50 também não tem folga (p50 > orçamento x semFolgaP50); piso de pixel
//     ratio 0,75; abaixo disso (0,65 e 0,5) só em emergência: p50 > orçamento x emergenciaP50 por
//     `sustentarEmergenciaMs`;
//   - sobe pela MESMA régua, com histerese: o custo previsto no degrau de cima (o de agora mais o ganho que a descida
//     deu, medido quando a janela encheu depois dela e esquecido aos poucos, GANHO_ESQUECER_MS) tem de caber em orçamento x subirP95 (p95) e x subirP50 (p50)
//     por `esperaSubirMs`; se descer menos de 20 s depois de subir, a espera dobra (até `esperaMaxMs`); descida mais
//     tarde é cena nova, e a espera volta à de base.
// Quem chama aplica: ajustes() devolve as chaves do cfg do degrau atual (por cima dos valores de base, guardados por
// quem chama) e capPixel() o teto de pixel ratio do degrau. Os números (distâncias, corte) vão até o valor novo em
// TRANSICAO_S (Transicao, abaixo), não num quadro. Com ?qualidade=alto|medio|baixo na URL ele não roda.

const DT_PICO_MS = 100 // travada ou troca de aba: fora da janela (não é custo sustentado de desenho)
const DT_PAUSA_MS = 250 // pausa / troca de aba: zera a janela
const JANELA_MS = 2000
const PASSO_JULGAR_MS = 250
const CAP = 512
const SUBIDA_FALHOU_MS = 20000 // descer até 20 s depois de subir: a subida não se sustentou
const GANHO_ESQUECER_MS = 30000 // o ganho medido de uma descida vale menos com o tempo (a cena muda andando)

// A escada, do melhor para o pior. Cada degrau soma às chaves dos anteriores. `pixel`: teto de pixel ratio do degrau
// (só nos degraus de resolução). `emergencia`: só com o quadro realmente estourado.
export const DEGRAUS = [
  { nome: 'cheio', chaves: {} },
  { nome: 'sombra-perto-leve', chaves: { 'mundo.sombraPertoResolucao': 512 } },
  { nome: 'distancia', chaves: { 'desempenho.cortePx': 6, 'pessoas.ate': 260, 'marcos.distDetalhe': 110 } },
  { nome: 'lod', chaves: { 'arvores.lodPerto': 40, 'arvores.lodLonge': 55, 'arvores.lodBloco': 60, 'mundo.palhaPerto': 150 } },
  { nome: 'sem-sombra-perto', chaves: { 'mundo.sombraPerto': false } },
  { nome: 'pixel-0.9', pixel: 0.9, chaves: {} },
  { nome: 'pixel-0.8', pixel: 0.8, chaves: {} },
  { nome: 'pixel-0.75', pixel: 0.75, chaves: {} },
  { nome: 'pixel-0.65', pixel: 0.65, emergencia: true, chaves: {} },
  { nome: 'pixel-0.5', pixel: 0.5, emergencia: true, chaves: {} },
]

export class GovernadorQualidade {
  constructor({ orcamentoMs = 16.7, descerP95 = 1.3, semFolgaP50 = 0.95, emergenciaP50 = 1.5, subirP95 = 1.0,
    subirP50 = 0.8, sustentarMs = 3000, sustentarEmergenciaMs = 5000, esperaSubirMs = 8000, esperaMaxMs = 60000,
    resfriarMs = 3000, degrau = 0, degraus = DEGRAUS } = {}) {
    Object.assign(this, { orcamentoMs, descerP95, semFolgaP50, emergenciaP50, subirP95, subirP50, sustentarMs,
      sustentarEmergenciaMs, esperaSubirMs, esperaMaxMs, resfriarMs, degraus })
    this.degrau = Math.max(0, Math.min(degraus.length - 1, degrau | 0))
    this.tempos = new Float32Array(CAP) // custo de cada quadro (ms)
    this.intervalos = new Float32Array(CAP) // intervalo de cada quadro (ms): o relógio da janela
    this.ganho = new Float32Array(degraus.length) // p95 que a descida até o degrau k poupou (medido)
    this.medirGanho = null // { degrau, p95Antes }: a descida a medir quando a janela encher
    this.ordenados = new Float32Array(CAP)
    this.esperaAtual = esperaSubirMs
    this.ultimaFoiSubida = false
    this.msDesdeSubida = 0
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

  // p50 e p95 do custo dos quadros dos últimos JANELA_MS de relógio (sem os picos)
  percentis() {
    let soma = 0, m = 0
    for (let k = 1; k <= this.n && soma < JANELA_MS; k++) {
      const j = (this.i - k + CAP) % CAP
      this.ordenados[m++] = this.tempos[j]
      soma += this.intervalos[j]
    }
    const o = this.ordenados.subarray(0, m).sort()
    return { p50: o[Math.floor(0.5 * (m - 1))], p95: o[Math.floor(0.95 * (m - 1))], cheia: soma >= JANELA_MS * 0.9 }
  }

  trocar(para, motivo, p) {
    const de = this.degrau
    this.degrau = para
    this.trocas.push({ de: this.degraus[de].nome, para: this.degraus[para].nome, motivo, p50: +p.p50.toFixed(1), p95: +p.p95.toFixed(1) })
    if (this.trocas.length > 50) this.trocas.shift()
    this.medirGanho = para > de ? { degrau: para, p95Antes: p.p95 } : null
    this.zerar()
    this.msResfriar = this.resfriarMs
    return para
  }

  // custoMs: o trabalho do quadro (CPU e placa); intervaloMs: o tempo de relógio entre este quadro e o anterior (o
  // intervalo do rAF; sem ele, o próprio custo). Devolve o NOVO degrau quando decidir trocar; senão null.
  quadro(custoMs, intervaloMs = custoMs) {
    if (!(custoMs > 0) || !(intervaloMs > 0)) return null
    if (intervaloMs > DT_PAUSA_MS) { this.zerar(); return null }
    if (this.msResfriar > 0) { this.msResfriar -= intervaloMs; return null }
    if (custoMs <= DT_PICO_MS) {
      this.tempos[this.i] = custoMs
      this.intervalos[this.i] = intervaloMs
      this.i = (this.i + 1) % CAP
      if (this.n < CAP) this.n++
    }
    this.msJulgar += intervaloMs
    this.msDesdeSubida += intervaloMs
    const esquecer = Math.exp(-intervaloMs / GANHO_ESQUECER_MS)
    for (let k = 0; k < this.ganho.length; k++) this.ganho[k] *= esquecer
    if (this.msJulgar < PASSO_JULGAR_MS) return null
    const passo = this.msJulgar
    this.msJulgar = 0
    const p = this.percentis()
    if (!p.cheia) return null
    this.ultimo = p
    // a primeira janela cheia depois de uma descida: quanto ela poupou (o que a subida vai devolver)
    if (this.medirGanho) {
      this.ganho[this.medirGanho.degrau] = Math.max(0, this.medirGanho.p95Antes - p.p95)
      this.medirGanho = null
    }
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
        // a subida que não se sustentou (desceu de novo pouco depois) dobra a espera; descida muito depois de uma
        // subida é a cena que mudou: a espera volta à de base
        if (this.ultimaFoiSubida && this.msDesdeSubida < SUBIDA_FALHOU_MS) this.esperaAtual = Math.min(this.esperaMaxMs, this.esperaAtual * 2)
        else this.esperaAtual = this.esperaSubirMs
        this.ultimaFoiSubida = false
        return this.trocar(this.degrau + 1, prox.emergencia ? 'emergencia' : 'caro', p)
      }
      this.msFolga = 0
      return null
    }

    // subir: pela mesma régua, o custo previsto no degrau de cima (o de agora + o ganho medido da descida) com folga
    // sustentada; a distância entre descerP95 e subirP95 é a histerese
    const g = this.degrau > 0 ? this.ganho[this.degrau] : 0
    if (this.degrau > 0 && p.p95 + g < B * this.subirP95 && p.p50 + g < B * this.subirP50) {
      this.msFolga += passo
      if (this.msFolga >= this.esperaAtual) {
        this.ultimaFoiSubida = true
        this.msDesdeSubida = 0
        return this.trocar(this.degrau - 1, 'folga', p)
      }
    } else {
      this.msFolga = 0
    }
    return null
  }

  estado() {
    return { degrau: this.degrau, nome: this.nome, regua: 'custo', p50: +(this.ultimo.p50 || 0).toFixed(1), p95: +(this.ultimo.p95 || 0).toFixed(1), trocas: this.trocas.slice(-8) }
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
// partida de cada chave (preenchido na primeira chamada). Com `transicao`, as chaves de número contínuo (distâncias,
// corte em px) vão até o valor novo em TRANSICAO_S; as outras (liga/desliga, tamanho de textura) trocam na hora.
export function aplicarDegrau(cfg, gov, base, transicao = null) {
  for (const d of gov.degraus) for (const k in d.chaves) if (!(k in base)) base[k] = lerChave(cfg, k)
  const aj = gov.ajustes()
  const alvo = {}
  for (const k in base) alvo[k] = k in aj ? aj[k] : base[k]
  // a sombra de perto leve é a metade da de base (nunca acima dela)
  if ('mundo.sombraPertoResolucao' in aj) alvo['mundo.sombraPertoResolucao'] = Math.min(base['mundo.sombraPertoResolucao'] ?? 1024, Math.max(512, (base['mundo.sombraPertoResolucao'] ?? 1024) / 2))
  for (const k in alvo) {
    if (transicao && !DISCRETAS.has(k) && typeof alvo[k] === 'number' && typeof lerChave(cfg, k) === 'number') transicao.mirar(cfg, k, alvo[k])
    else { transicao?.soltar(k); escreverChave(cfg, k, alvo[k]) }
  }
}

// Transição dos números da escada (27/10/2026, visual/correcoes): em vez de trocar num quadro, o valor vai do atual ao
// novo em TRANSICAO_S, em TRANSICAO_PASSOS degraus iguais (não a cada quadro: muda distância de corte e LOD, que
// refazem listas de cópias quando o número muda; 5 refazeres em 0,5 s em vez de 30).
export const TRANSICAO_S = 0.5
const TRANSICAO_PASSOS = 5
const DISCRETAS = new Set(['mundo.sombraPertoResolucao']) // tamanho de textura: não tem meio-termo
export class Transicao {
  constructor(segundos = TRANSICAO_S, passos = TRANSICAO_PASSOS) {
    this.segundos = segundos
    this.passos = passos
    this.vivas = new Map() // chave -> { de, para, t }
  }
  mirar(cfg, k, para) {
    const atual = lerChave(cfg, k)
    if (atual === para) { this.vivas.delete(k); return }
    this.vivas.set(k, { de: atual, para, t: 0 })
  }
  soltar(k) { this.vivas.delete(k) }
  get ativa() { return this.vivas.size > 0 }
  // dtS: segundos de relógio desde a última chamada
  avancar(cfg, dtS) {
    for (const [k, v] of this.vivas) {
      v.t = Math.min(this.segundos, v.t + dtS)
      const f = Math.floor((v.t / this.segundos) * this.passos + 1e-9) / this.passos
      escreverChave(cfg, k, f >= 1 ? v.para : v.de + (v.para - v.de) * f)
      if (f >= 1) this.vivas.delete(k)
    }
  }
}
