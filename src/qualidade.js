// Perfis de qualidade (24/10/2026): um preset de números para o jogo inteiro, para abrir o jogo mais leve
// numa máquina fraca sem mexer em ajuste por ajuste.
//
// O perfil escolhe a resolução do desenho, a resolução mínima (da resolução dinâmica), o tamanho do mapa de
// sombra, a sombra de perto (nítida), a profundidade de campo, a estabilização no tempo e a grama.
//
// ?qualidade=alto|medio|baixo na URL escolhe o perfil só nesta abertura, por cima do que está salvo no painel
// (como o ?leve). ?qualidade=auto detecta pelo navegador. Sem ?qualidade= na URL, nada muda: vale o salvo.
//
// O módulo não importa o config.js (senão os dois se chamariam): ele só mexe no cfg que recebe.

export const NIVEIS = ['baixo', 'medio', 'alto']

// Cada perfil mexe só nas chaves que ele controla; o resto (o que a pessoa ajustou no painel) fica como está.
export const PERFIS = {
  baixo: {
    'desempenho.resolucao': 0.75,
    'desempenho.resolucaoMin': 0.75, // 27/10/2026: era 0,5 (borrado demais na Retina); abaixo de 0,75 só o governador em emergência
    'desempenho.tetoRetina': 0.75,
    'mundo.resolucaoSombra': 1024,
    'mundo.sombraPerto': false,
    'estilo.dof': false,
    'estilo.estabilizar': 0,
    'grama.quantidade': 25000,
  },
  medio: {
    'desempenho.resolucao': 1.0,
    'desempenho.tetoRetina': 1.0,
    'mundo.sombraPerto': true,
    'estilo.dof': true,
    'estilo.estabilizar': 0.85,
    'mundo.resolucaoSombra': 2048,
    'mundo.sombraPertoResolucao': 1024,
    'grama.quantidade': 200000,
  },
  alto: {
    'desempenho.resolucao': 1.25,
    'desempenho.tetoRetina': 1.25,
    'mundo.sombraPerto': true,
    'estilo.dof': true,
    'estilo.estabilizar': 0.85,
    'mundo.resolucaoSombra': 4096,
    'mundo.sombraPertoResolucao': 2048,
    'grama.quantidade': 200000,
  },
}

// Aplica um perfil no cfg. Devolve false quando o nível não é conhecido (nada muda).
export function aplicarQualidade(cfg, nivel, so = null) {
  const perfil = so || PERFIS[nivel]
  if (!perfil || !cfg) return false
  for (const caminho in perfil) {
    const partes = caminho.split('.')
    const ultima = partes.pop()
    const dono = partes.reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), cfg)
    if (dono && ultima in dono) dono[ultima] = perfil[caminho]
  }
  return true
}

// As chaves que podem mudar com o jogo rodando (24/10/2026, governador.js): a resolução, a sombra de perto e a
// profundidade de campo. O mapa de sombra de longe e a grama só mudam ao recarregar, então ficam de fora.
export const CHAVES_VIVAS = ['desempenho.resolucao', 'desempenho.resolucaoMin', 'desempenho.tetoRetina', 'mundo.sombraPerto',
  'mundo.sombraPertoResolucao', 'estilo.dof', 'estilo.estabilizar']

export function aplicarNivelVivo(cfg, nivel) {
  const perfil = PERFIS[nivel]
  if (!perfil || !cfg) return false
  const vivo = {}
  for (const k of CHAVES_VIVAS) if (k in perfil) vivo[k] = perfil[k]
  return aplicarQualidade(cfg, nivel, vivo)
}

// Teto do pixel ratio (24/10/2026): numa tela Retina (dpr > 1,5) o desenho não passa de cfg.desempenho.tetoRetina,
// mesmo que a resolução do painel peça mais. Num monitor comum vale o dpr.
export function tetoPixel(cfg, dpr = globalThis.devicePixelRatio || 1) {
  const teto = dpr > 1.5 ? (cfg.desempenho.tetoRetina ?? 1) : Infinity
  return Math.min(dpr, teto)
}

// Lê ?qualidade= na URL e aplica o perfil (auto = detectar). Vale só nesta abertura: não salva no painel.
export function aplicarQualidadeDaUrl(cfg, busca) {
  const p = new URLSearchParams(busca || '')
  if (!p.has('qualidade')) return false
  const bruto = (p.get('qualidade') || '').trim().toLowerCase()
  const nivel = bruto === 'auto' ? detectarQualidade() : bruto
  const ok = aplicarQualidade(cfg, nivel)
  if (ok && cfg.desempenho) {
    cfg.desempenho.qualidadeEscolhida = nivel
    // ?qualidade=auto deixa o governador trabalhar; um nível explícito o desliga
    cfg.desempenho.qualidadeFixa = bruto !== 'auto'
  }
  return ok
}

// A placa de vídeo, quando o navegador deixa saber (o nome vem do WebGL; fora do navegador, nada).
function stringDaPlaca() {
  try {
    const doc = globalThis.document
    if (!doc?.createElement) return ''
    const canvas = doc.createElement('canvas')
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
    if (!gl) return ''
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    const nome = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
    return String(nome || '')
  } catch { return '' }
}

// Perfil sugerido pelo navegador: núcleos, memória, densidade de pixels e a placa de vídeo.
// Regra simples, sem tabular: a placa de software (swiftshader, llvmpipe) sempre cai para baixo.
export function detectarQualidade() {
  const nav = globalThis.navigator || {}
  const nucleos = Number(nav.hardwareConcurrency) || 0
  const memoria = Number(nav.deviceMemory) || 0
  const dpr = Number(globalThis.devicePixelRatio) || 1
  const placa = stringDaPlaca()
  let pontos = 0
  if (nucleos >= 8) pontos += 2
  else if (nucleos >= 4) pontos += 1
  if (memoria >= 8) pontos += 2
  else if (memoria >= 4) pontos += 1
  if (dpr > 1.5) pontos -= 1 // tela retina: o dobro de pixels para desenhar
  if (/apple|radeon|geforce|rtx|arc|m[123]/.test(placa)) pontos += 1
  if (/swiftshader|llvmpipe|software|basic render/.test(placa)) pontos -= 3
  if (pontos >= 4) return 'alto'
  if (pontos >= 2) return 'medio'
  return 'baixo'
}
