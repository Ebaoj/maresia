// Busca do painel: mostra só os controles cujo nome (com o caminho das pastas) tem todas as palavras digitadas,
// sem diferença de maiúscula e acento. As pastas com algum achado abrem; as outras somem.
// A decisão é uma função pura sobre a árvore do lil-gui (_title, _name, controllers, folders), para o teste no Node.

import { normalizar } from './comum.js'

// devolve um Map de pasta ou controle -> visível; termo vazio devolve null (painel inteiro, como estava)
export function decidirBusca(pastas, termo) {
  const palavras = normalizar(termo).split(/\s+/).filter(Boolean)
  if (!palavras.length) return null
  const visivel = new Map()
  const visitar = (pasta, caminho) => {
    const aqui = `${caminho} ${normalizar(pasta._title)}`
    let algum = false
    for (const c of pasta.controllers) {
      const texto = `${aqui} ${normalizar(c._name)}`
      const v = palavras.every((p) => texto.includes(p))
      visivel.set(c, v)
      if (v) algum = true
    }
    for (const f of pasta.folders) if (visitar(f, aqui)) algum = true
    visivel.set(pasta, algum)
    return algum
  }
  for (const p of pastas) visitar(p, '')
  return visivel
}

// quantos controles a busca achou
export function contarAchados(visivel) {
  let n = 0
  for (const [k, v] of visivel) if (v && !k.folders) n++
  return n
}
