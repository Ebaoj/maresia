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

// O chão de 1932: a rua de terra batida, o quintal de terra com mato ralo
// atrás das casas, e a areia só na praia e nas dunas (docs/mapa-1932.md).
// As cores da terra saem da paleta da direção de arte: a taipa da rua, a
// piúba do quintal; a poeira do meio da rua e o sulco da carroça são do
// mesmo barro, mais claro e mais socado.
export const CHAO = {
  areiaSeca: '#f6d9a0',
  areiaMolhada: '#d6ab72',
  duna: '#f8e3b4',
  rua: '#b8875e',        // terra batida: a rua de 1932 (a cor da taipa)
  poeira: '#c9a97a',     // o meio da rua, polvilhado pelas rodas
  rodeiro: '#96683c',    // o sulco da carroça: terra socada, mais escura
  quintal: '#a08968',    // terra de quintal (a piúba gasta)
  mato: '#8a8a5e',       // mato ralo do lote abandonado
  matoSeco: '#96905c',   // o mato do terreno vazio
  baseGrama: '#3d6e3a',
  gramaEscura: '#3f7f52',
  rocha: '#a3909a',
  lama: '#8e7a5c',
  terraRachada: '#c99f72', // o chão do Campo do Urubu na seca de 1932: terra clara, batida e rachada (conceito-sertão 3)
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

// Os marcos de 1932 (src/mundo/marcos1932/): as únicas fachadas com cor própria são as que o dossiê documenta
// (marcos-1932.md): o Majestic de tijolo (cartão colorizado de 1925, indício) e o Mercado de Ferro vermelho-escuro
// (memória de Otacílio de Azevedo). Os dois são desbotados e escuros, não acento: o acento continua no pano e na fruta.
// O resto sai da cal. Os valores-padrão do painel (cfg.marcos) são estes.
export const MARCOS = {
  excelsior: '#f2e2c0',
  majestic: '#a3563f',
  moderno: '#e4d3b0',
  mercado: '#6b2b27',
  chapa: '#7a4636',
  ferro: '#2b2724',
  bronze: '#4a4236',
  felinos: '#5a6450',
  general: '#73603f',
  balaustrada: '#ede5d3',
  pedra: '#d8cfbd',
  coluna: '#d4bc92',
  mosaicoClaro: '#c9b38c',
  mosaicoEscuro: '#45413b',
}
