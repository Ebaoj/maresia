// A escala do mapa de 1932: a compressao suave da longitude/latitude para o
// jogo, com a Praca do Ferreira em tamanho real (1:1) e o resto do mapa
// comprimido como sempre.
//
// Este arquivo e o sistema: a interpolacao, a compressao base, a
// descompressao local da praca, as inversas e as consultas de escala local.
// Os DADOS do mapa (costa, lagoas, lugares, bairros) estao em
// src/mundo/fortaleza1932.js, que reexporta daqui o que o resto do motor usa.

// interpolação cúbica monótona (sem ondas nem quinas entre os pontos)
function pchip(xs, ys) {
  const n = xs.length
  const h = []
  const d = []
  for (let i = 0; i < n - 1; i++) {
    h.push(xs[i + 1] - xs[i])
    d.push((ys[i + 1] - ys[i]) / h[i])
  }
  const m = new Array(n).fill(0)
  m[0] = d[0]
  m[n - 1] = d[n - 2]
  for (let i = 1; i < n - 1; i++) {
    m[i] = d[i - 1] * d[i] <= 0 ? 0 : (3 * (h[i - 1] + h[i])) / ((2 * h[i] + h[i - 1]) / d[i - 1] + (h[i] + 2 * h[i - 1]) / d[i])
  }
  return (x) => {
    if (x <= xs[0]) return ys[0] + m[0] * (x - xs[0])
    if (x >= xs[n - 1]) return ys[n - 1] + m[n - 1] * (x - xs[n - 1])
    // busca binaria do trecho: com muitos nos (a descompressao da praca usa
    // milhares), a varredura linear ficaria lenta demais.
    // O fim da busca e o ultimo no (n-1), nao o penultimo: assim o trecho
    // [xs[n-2], xs[n-1]] ainda e encontrado (com hi = n-2 o invariante
    // xs[hi] > x quebrava e o ultimo trecho saia com t > 1, com a
    // interpolacao estourada).
    let lo = 0
    let hi = n - 1
    while (hi - lo > 1) {
      const meio = (lo + hi) >> 1
      if (xs[meio] <= x) lo = meio
      else hi = meio
    }
    const i = lo
    const t = (x - xs[i]) / h[i]
    const t2 = t * t
    const t3 = t2 * t
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1]
  }
}

// compressão: longitude -> x e latitude -> z (mesmos nós do desenho docs/mapa-1932-gerar.py)
const fxBase = pchip([-38.612, -38.548, -38.535, -38.512, -38.495, -38.4745, -38.452, -38.44], [0, 700, 1000, 1760, 1960, 2180, 2440, 2560])
const fyBase = pchip([-3.77, -3.752, -3.736, -3.716, -3.705, -3.688], [1420, 1220, 1000, 340, 150, 0])

// ---------- a Praca do Ferreira em tamanho real ----------
//
// Decisao do Joabe (21/10/2026): a praca fica em tamanho real (1:1) e o resto do
// mapa segue comprimido como sempre. A compressao do centro e de ~2,9 vezes em
// cada eixo (a praca dava 888 un2 para as 7.376 m2 reais), entao a
// descompressao vale o inverso da escala no centro da praca.
//
// A descompressao e local e suave: um perfil que vale o fator inteiro no miolo
// da praca e vai a 1 na compressao de sempre, com a tangente zero nas duas
// pontas da rampa (a transicao nao da um pulo). Como o perfil multiplica a
// derivada da compressao, a transformacao continua estritamente crescente:
// nenhuma dobra, nenhum vinco, e a reta da praca e da faixa em volta nao e
// mudada de lugar.
//
// A integracao comeca no oeste (para o x) e no norte (para o z): o que esta fora
// da regiao descomprimida nao se move, e o Campo do Urubu (a oeste e ao norte da
// praca) fica exatamente onde estava.
const PRACA_LON = -38.5275014 // centroide da mancha publica (src/mundo/praca1932.json)
const PRACA_LAT = -3.7274448
const NUCLEO_LON = 0.0009 // o miolo em 1:1 (a praca tem 0,0007 x 0,0013 de grau)
const NUCLEO_LAT = 0.0011
const RAMPA_LON = 0.004 // onde a compressao volta a ser a de sempre (cerca de 440 m)
const RAMPA_LAT = 0.0038

// metros por grau (a praca e pequena: a projecao plana local serve)
const METRO_POR_GRAU_LAT = 110574
const METRO_POR_GRAU_LON = (lat) => 111320 * Math.cos((lat * Math.PI) / 180)

// a escala da compressao no centro da praca (unidades de jogo por metro): e o
// inverso do fator de descompressao, entao o miolo fica em 1:1 por construção
function escalaBase(f, u0, metroPorGrau) {
  const dh = 1e-6
  return Math.abs((f(u0 + dh) - f(u0 - dh)) / (2 * dh)) / metroPorGrau
}
// o fator da praca (a media entre os dois eixos): e o quanto a praca cresceu
// em relacao ao mundo comprimido, e o quanto as pecas desenhadas a mao nela
// precisam crescer para manter a mesma composicao
export const K_PRACA_X = 1 / escalaBase(fxBase, PRACA_LON, METRO_POR_GRAU_LON(PRACA_LAT))
export const K_PRACA_Z = 1 / escalaBase(fyBase, PRACA_LAT, METRO_POR_GRAU_LAT)
export const FATOR_PRACA = Math.sqrt(K_PRACA_X * K_PRACA_Z)

// o perfil da descompressao: 1 no nucleo, 0 fora da rampa, suave nas pontas
function perfil(u, nucleo, rampa) {
  const a = Math.abs(u)
  if (a <= nucleo) return 1
  if (a >= rampa) return 0
  const t = (a - nucleo) / (rampa - nucleo)
  return 0.5 * (1 + Math.cos(Math.PI * t))
}

// a compressao nova: X(u) = f(a) + ∫ f'(t)·s(t) dt, com s o fator de esticar
// (1 fora da praca, K no miolo). A integral sai de f'(t) numerica (o pchip e C1,
// entao a derivada central acerta).
function descomprimir(f, a, b, perfilS, k) {
  const passos = 8000
  const h = (b - a) / passos
  const dh = 1e-6
  const derivada = (u) => (f(u + dh) - f(u - dh)) / (2 * dh)
  const xs = new Float64Array(passos + 1)
  const ys = new Float64Array(passos + 1)
  let acc = f(a)
  xs[0] = a
  ys[0] = acc
  for (let i = 1; i <= passos; i++) {
    const meio = a + (i - 0.5) * h
    acc += derivada(meio) * (1 + (k - 1) * perfilS(meio)) * h
    xs[i] = a + i * h
    ys[i] = acc
  }
  // o pchip exige os nos em ordem crescente: quando a integracao vai do norte
  // para o sul (para o z), a lista sai ao contrario e e invertida aqui
  if (b < a) {
    xs.reverse()
    ys.reverse()
  }
  return { f: pchip(xs, ys), fim: acc }
}

// o x integra do oeste para leste; o z, do norte para o sul
const fxDesc = descomprimir(fxBase, -38.612, -38.44, (u) => perfil(u - PRACA_LON, NUCLEO_LON, RAMPA_LON), K_PRACA_X)
const fyDesc = descomprimir(fyBase, -3.688, -3.77, (u) => perfil(u - PRACA_LAT, NUCLEO_LAT, RAMPA_LAT), K_PRACA_Z)
// o quanto o mapa ganhou para o leste e para o sul
const EXTRA_X = fxDesc.fim - fxBase(-38.44)
const EXTRA_Z = fyDesc.fim - fyBase(-3.77)

export const DESLOC = { x: 1220, z: 420 }
export function ll(lon, lat) {
  return [fxDesc.f(lon) - DESLOC.x, fyDesc.f(lat) - DESLOC.z]
}

// A inversa das compressões: do ponto do jogo de volta para lon/lat. Serve para
// ler o raster do uso dos lotes (src/mundo/mapa1932-malha.png) e para conferir
// que uma marca do mapa caiu onde devia.
// As tabelas são montadas uma vez, com busca binaria dentro da pchip; depois de
// montadas a consulta é direta (índice + interpolação), porque o terreno pergunta
// isso umas centenas de milhares de vezes.
function tabelaInversa(f, dominio, faixa, passo) {
  const n = Math.ceil((faixa[1] - faixa[0]) / passo) + 1
  const tabela = new Float64Array(n)
  const crescente = f(dominio[1]) > f(dominio[0])
  for (let i = 0; i < n; i++) {
    const alvo = faixa[0] + i * passo
    let a = dominio[0]
    let b = dominio[1]
    for (let k = 0; k < 40; k++) {
      const m = (a + b) / 2
      if (crescente ? f(m) < alvo : f(m) > alvo) a = m
      else b = m
    }
    tabela[i] = (a + b) / 2
  }
  return (v) => {
    const t = (v - faixa[0]) / passo
    if (t <= 0) return tabela[0]
    if (t >= n - 1) return tabela[n - 1]
    const i = t | 0
    const r = t - i
    return tabela[i] * (1 - r) + tabela[i + 1] * r
  }
}

// x do jogo -> longitude; z do jogo -> latitude (fy é decrescente: a latitude
// cresce para o norte e o z do jogo cresce para o sul)
const LON_POR_X_BRUTO = tabelaInversa(fxDesc.f, [-38.612, -38.44], [0, 2560 + EXTRA_X], 0.5)
const LAT_POR_Z_BRUTO = tabelaInversa(fyDesc.f, [-3.688, -3.77], [0, 1420 + EXTRA_Z], 0.5)
export const LON_POR_X = (x) => LON_POR_X_BRUTO(x + DESLOC.x)
export const LAT_POR_Z = (z) => LAT_POR_Z_BRUTO(z + DESLOC.z)

// O quanto a praca descomprimiu a escala em um ponto (1 = fora da regiao
// descomprimida, o valor maximo e o proprio fator da praca). Serve para o que
// foi medido no mundo comprimido acompanhar a escala nova: o raio reservado de
// um lugar, o passo de um poste de rua.
export function esticamento(lon, lat) {
  const sx = 1 + (K_PRACA_X - 1) * perfil(lon - PRACA_LON, NUCLEO_LON, RAMPA_LON)
  const sz = 1 + (K_PRACA_Z - 1) * perfil(lat - PRACA_LAT, NUCLEO_LAT, RAMPA_LAT)
  return Math.sqrt(sx * sz)
}

// o mesmo, em coordenada de jogo
export function esticamentoJogo(x, z) {
  return esticamento(LON_POR_X(x), LAT_POR_Z(z))
}

// quantos metros de verdade vale uma unidade de jogo em um ponto: 1 no centro
// descomprimido (a praca esta em 1:1), ~0,125 na ponta do mapa, onde a
// compressao e de 8 vezes
export function metrosPorUn(x, z) {
  const e = escalaJogo(x, z)
  return Math.sqrt(e.x * e.z)
}

// a escala da compressao (unidades de jogo por metro), por eixo, em coordenada de jogo
export function escalaJogo(x, z) {
  const lon = LON_POR_X(x)
  const lat = LAT_POR_Z(z)
  return {
    x: escalaBase(fxBase, lon, METRO_POR_GRAU_LON(lat)) * (1 + (K_PRACA_X - 1) * perfil(lon - PRACA_LON, NUCLEO_LON, RAMPA_LON)),
    z: escalaBase(fyBase, lat, METRO_POR_GRAU_LAT) * (1 + (K_PRACA_Z - 1) * perfil(lat - PRACA_LAT, NUCLEO_LAT, RAMPA_LAT)),
  }
}

// a escala da compressao de sempre (sem a descompressao da praca), por eixo
export function escalaBaseJogo(x, z) {
  const lon = LON_POR_X(x)
  const lat = LAT_POR_Z(z)
  return {
    x: escalaBase(fxBase, lon, METRO_POR_GRAU_LON(lat)),
    z: escalaBase(fyBase, lat, METRO_POR_GRAU_LAT),
  }
}

// o quanto a escala esticou na direcao de um vao: perto da praca o x e o z
// escalam diferente, entao um vao na diagonal estica no meio do caminho
export function esticamentoNoVao(dx, dz, x, z) {
  const e = escalaJogo(x, z)
  const b = escalaBaseJogo(x, z)
  const comp = Math.hypot(dx, dz) || 1
  const ux = dx / comp
  const uz = dz / comp
  const novo = 1 / Math.hypot(ux / e.x, uz / e.z)
  const velho = 1 / Math.hypot(ux / b.x, uz / b.z)
  return novo / velho
}

// os limites do mundo em coordenadas de jogo: a compressão vai de -38,612 a
// -38,44 de longitude e de -3,77 a -3,688 de latitude (a grade do terreno, 3 m).
// Com a descompressao da praca, o mapa ganhou para o leste e para o sul; o oeste e
// o norte (e com eles o Campo do Urubu) ficaram onde estavam. O corte do mundo
// no leste (que era na longitude -38,452) continua no mesmo lugar do mapa.
export const LIMITES = { x0: -1221, x1: 1221 + EXTRA_X, z0: -462, z1: 1002 + EXTRA_Z, passo: 3 }
// o que o resto do motor usa deste sistema
export { pchip, METRO_POR_GRAU_LAT, METRO_POR_GRAU_LON }
