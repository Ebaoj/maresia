// O que as seções do painel usam em comum: a marca de "vale depois de recarregar" e o texto sem acento da busca.

// Controle cujo efeito só aparece depois de recarregar a página: o nome termina nesta marca
export const RECARREGA = '⟳'
export const rec = (nome) => `${nome} ${RECARREGA}`
export const LEGENDA = `${RECARREGA} = vale depois de recarregar a página`

// "Névoa" e "nevoa" são a mesma coisa para a busca
export function normalizar(texto) {
  return String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}
