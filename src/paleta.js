// Paleta da direção de arte (docs/direcao-de-arte.md, seção 3).
// 1932, "cal e sal": paredes caiadas e desbotadas; cor forte só em pano, fruta, peixe e mar.
// Fachada nunca é acento.

export const CAL = {
  cal: '#efe6d2',
  calVelha: '#d9cbb0',
  taipa: '#b8875e',
  ocre: '#c9963f',
  azul: '#4f7c9a',
  verde: '#5e8a6e',
  rosa: '#d49a8a',
  areia: '#e8d2a6',
  palha: '#c8a86a',
  piuba: '#a08968',
  mangue: '#8a5a3c',
  telha: '#b5603f',
}

// acentos: no máximo um forte por enquadramento perto da câmera
export const ACENTO = {
  urucum: '#c2412d',
  anil: '#2e4c9a',
  caju: '#e9b23a',
  coqueiro: '#4e8f3a',
}

// Fachadas: a maioria é cal (branca, creme, suja); uma parte tem caiação tingida, sempre desbotada.
export const FACHADAS = [
  '#efe6d2', '#f2ebdc', '#e9dfc8', '#efe6d2', '#e4d6bb', '#f4eee2', // cal
  '#e8c9b4', '#e7d3a3', '#cddbd6', '#d6dcc1', '#e2c2bd', '#d9cbb0', // caiação tingida e desbotada
]
// casas mais simples (taipa caiada, cal gasta)
export const CASAS_SIMPLES = ['#efe6d2', '#e4d6bb', '#d9cbb0', '#e9dfc8', '#dcc6a4', '#e8c9b4', '#cfc0a3', '#efe6d2']
// esquadrias (portas, janelas, barrado): cores de tinta a óleo desbotada
export const ESQUADRIAS = ['#4f7c9a', '#5e8a6e', '#8a5a3c', '#c9963f', '#6c8f9e', '#7a6a8e']
