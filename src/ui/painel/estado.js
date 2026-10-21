// Lembra, por navegador, quais pastas do painel ficaram abertas. Não mexe no config salvo do jogo.
// Sem localStorage (aba privada, storage bloqueado) o painel segue funcionando, só não lembra.

const CHAVE = 'maresia.painel.pastas.v1'

// "Visual/Quadrinho/Traço de nanquim": o caminho de títulos a partir da raiz (a raiz é "")
export function caminhoPasta(pasta) {
  const titulos = []
  for (let p = pasta; p && p.parent; p = p.parent) titulos.unshift(p._title)
  return titulos.join('/')
}

export function lerPastas() {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE) || '{}')
    return salvo && typeof salvo === 'object' ? salvo : {}
  } catch { return {} }
}

export function gravarPastas(estado) {
  try { localStorage.setItem(CHAVE, JSON.stringify(estado)) } catch { /* sem storage: não lembra */ }
}

// pasta sem registro nasce fechada; a raiz (o painel inteiro) nasce aberta
export function aplicarPastas(gui, estado) {
  gui.open(estado[''] !== false)
  for (const f of gui.foldersRecursive()) f.open(estado[caminhoPasta(f)] === true)
}
