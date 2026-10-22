// O quadro da grade de Herbster: o referencial em que a compressão do mapa de
// 1932 acontece.
//
// Por que este arquivo: a compressão de sempre é separável em longitude e
// latitude (o x do jogo sai só da longitude, o z só da latitude). Uma escala
// separável, e diferente em cada eixo, mantém reta apenas a linha paralela a
// um dos eixos: a grade de Herbster corre a 72,5 graus, e por isso as ruas
// viravam um leque no jogo (a rua torcia 0,4 grau na praça e 52 graus no
// oeste). Medido em docs/mapa-1932.md.
//
// Aqui a compressão é separável no quadro da grade: u ao longo da rua, v de
// travessia. Uma rua (v constante) continua reta em qualquer ponto do mapa, e
// a Praça do Ferreira continua em 1:1 no miolo.
//
// O ponto (0, 0) do quadro é a Praça do Ferreira. As medidas saem em metros de
// verdade; a compressão (unidades de jogo) entra depois.
//
// A fachada do sistema - ll(), llInverso(), os limites do mundo - está em
// src/mundo/escala1932.js.

import { pchip } from './pchip1932.js'
import dadosMapa from './mapa1932-dados.json'

// A grade de Herbster: as ruas do Centro correm a 107,8 graus de azimute
// (lés-sudeste) e a 17,8 (nor-nordeste). O número sai da planta oficial: a
// média das testadas a menos de 600 m da Praça do Ferreira, ponderada pelo
// comprimento, com as duas famílias dobradas em 90 graus (19,7 km de testada;
// testes/unidade/ruas-reais-retas.test.js confere). O ângulo guardado é o
// complemento, 90 - 17,81 = 72,19 graus, na convenção de sempre do código
// (rotation.y = -(90 - ANGULO_GRADE) leva o x local para a rua lés-sudeste).
// Era 72,5: o valor redondo do traçado de Silva Paulet, 0,3 grau fora da planta.
export const ANGULO_GRADE = (72.19 * Math.PI) / 180

// metros por grau (a projeção plana local serve)
export const METRO_POR_GRAU_LAT = 110574
export const METRO_POR_GRAU_LON = (lat) => 111320 * Math.cos((lat * Math.PI) / 180)

const PRACA_LON = -38.5275014
const PRACA_LAT = -3.7274448
const M_LON = 111320 * Math.cos((PRACA_LAT * Math.PI) / 180)
const M_LAT = METRO_POR_GRAU_LAT

// o eixo u corre ao longo da rua da grade (azimute 90 + 17,8: lés-sudeste); o
// v, de travessia (nor-nordeste). O sinal importa: com PSI = 90 - ANGULO_GRADE
// (06f9525) o eixo u apontava para lés-nordeste, o espelho da rua de verdade, e
// a compressão endireitava retas que a cidade não tem
const PSI = ANGULO_GRADE - Math.PI / 2
export const CU = Math.cos(PSI)
export const SU = Math.sin(PSI)

const E0 = PRACA_LON * M_LON
const N0 = PRACA_LAT * M_LAT

// (lon, lat) -> (u, v) em metros de verdade, relativos à praça
export function gradeDe(lon, lat) {
  const e = lon * M_LON - E0
  const n = lat * M_LAT - N0
  return [e * CU + n * SU, -e * SU + n * CU]
}

// (u, v) -> (lon, lat)
export function geoDe(u, v) {
  const e = u * CU - v * SU + E0
  const n = u * SU + v * CU + N0
  return [e / M_LON, n / M_LAT]
}

// ---------- a compressão base ----------
// Os nós da compressão de sempre (docs/mapa-1932-gerar.py): a longitude vira
// x do jogo e a latitude vira z do jogo. A curva é a mesma, lida no quadro da
// grade: a longitude de cada nó vira a posição dele sobre o eixo u (medida na
// latitude da praça) e a latitude vira a posição sobre o eixo v (medida na
// longitude da praça).
const NOS_X = [
  [-38.612, 0], [-38.548, 700], [-38.535, 1000], [-38.512, 1760],
  [-38.495, 1960], [-38.4745, 2180], [-38.452, 2440], [-38.44, 2560],
]
const NOS_Y = [
  [-3.77, 1420], [-3.752, 1220], [-3.736, 1000], [-3.716, 340], [-3.705, 150], [-3.688, 0],
]

const nosU = NOS_X
  .map(([lon]) => gradeDe(lon, PRACA_LAT)[0])
  .map((u, i) => [u, NOS_X[i][1]])
  .sort((a, b) => a[0] - b[0])
const nosV = NOS_Y
  .map(([lat]) => gradeDe(PRACA_LON, lat)[1])
  .map((v, i) => [v, NOS_Y[i][1]])
  .sort((a, b) => a[0] - b[0])

const baseU = pchip(nosU.map(([u]) => u), nosU.map(([, v]) => v))
const baseV = pchip(nosV.map(([v]) => v), nosV.map(([, v]) => v))

// o mapa inteiro, projetado no quadro da grade
export const CANTOS = [
  [-38.612, -3.77], [-38.44, -3.77], [-38.44, -3.688], [-38.612, -3.688],
]
const dominio = (() => {
  let u0 = Infinity
  let u1 = -Infinity
  let v0 = Infinity
  let v1 = -Infinity
  for (const [lon, lat] of CANTOS) {
    const [u, v] = gradeDe(lon, lat)
    u0 = Math.min(u0, u)
    u1 = Math.max(u1, u)
    v0 = Math.min(v0, v)
    v1 = Math.max(v1, v)
  }
  return { u: [u0, u1], v: [v0, v1] }
})()

// ---------- as zonas em 1:1: a praça e o Campo do Urubu ----------
// O miolo da praça fica em tamanho real (decisão do Joabe, 21/10/2026) e o
// resto do mapa segue comprimido. A descompressão é local e suave: um peso
// que vale 1 no miolo e vai a 0 na compressão de sempre, com a tangente zero
// nas duas pontas da rampa (a transição não dá um pulo). Onde o peso é 1 o
// fator de esticar é o inverso exato da escala da base naquele ponto (1 metro
// vira 1 unidade); na rampa ele cai para 1. Como o fator multiplica a derivada
// da compressão, a transformação continua estritamente crescente: nenhuma
// dobra, nenhum vinco.
//
// As rampas são faixas ao longo de u e de v (a praça vira um retângulo girado
// com a grade). O miolo precisa caber inteiro: a mancha da praça tem 117 m de u
// e 160 m de v, e o miolo tem 200 m x 244 m.
const NUCLEO_U = 0.0009 * M_LON
const RAMPA_U = 0.004 * M_LON
const NUCLEO_V = 0.0011 * M_LAT
const RAMPA_V = 0.0038 * M_LAT

// O Campo do Urubu em 1:1 (decisão do Joabe, 21/10/2026): o campo virou o
// coração da história do jogo (docs/conceito.md), então ele também fica em
// tamanho real, nos dois eixos, sem torcer. A zona é a caixa do polígono do
// campo no quadro da grade (src/mundo/mapa1932-dados.json), com uma folga; a
// rampa de volta para a compressão de sempre é longa porque lá a compressão é
// de ~10 vezes ao longo da rua.
// A faixa de v do campo (de -0,8 km a +0,1 km) cruza a da praça: o campo fica
// sobre a reta da rua lés-sudeste que passa pela praça. Ao norte, a borda do
// campo cai dentro do miolo da praça e a rampa de lá é a da praça (a do campo
// não chega ao norte, para não mexer na Estação, na Sé e no Passeio).
const FOLGA_CAMPO = 40
const RAMPA_CAMPO = 600

// o peso da descompressão: 1 no miolo, 0 fora da rampa, suave nas pontas
function perfil(u, nucleo, rampa) {
  const a = Math.abs(u)
  if (a <= nucleo) return 1
  if (a >= rampa) return 0
  const t = (a - nucleo) / (rampa - nucleo)
  return 0.5 * (1 + Math.cos(Math.PI * t))
}

// o mesmo, para uma faixa [a, b] com uma rampa de cada lado (0 = sem rampa)
function perfilFaixa(t, a, b, rampaAntes, rampaDepois) {
  if (t >= a && t <= b) return 1
  const d = t < a ? a - t : t - b
  const r = t < a ? rampaAntes : rampaDepois
  if (r <= 0 || d >= r) return 0
  return 0.5 * (1 + Math.cos((Math.PI * d) / r))
}

function derivadaBase(f, u) {
  const dh = 1e-4
  return (f(u + dh) - f(u - dh)) / (2 * dh)
}

// o fator 1:1 no centro da praça: a escala da base ali é o inverso do que a praça quer
export const K_U = 1 / Math.abs(derivadaBase(baseU, 0))
export const K_V = 1 / Math.abs(derivadaBase(baseV, 0))

// a caixa do campo no quadro da grade (metros de verdade, relativos à praça)
export const CAIXA_CAMPO = (() => {
  const pts = dadosMapa.campoUrubu.poligono.map(([lon, lat]) => gradeDe(lon, lat))
  return {
    u: [Math.min(...pts.map((p) => p[0])) - FOLGA_CAMPO, Math.max(...pts.map((p) => p[0])) + FOLGA_CAMPO],
    v: [Math.min(...pts.map((p) => p[1])) - FOLGA_CAMPO, Math.max(...pts.map((p) => p[1])) + FOLGA_CAMPO],
  }
})()

// o peso de 1:1 em cada eixo (o maior entre a praça e o campo)
function pesoU(u) {
  return Math.max(perfil(u, NUCLEO_U, RAMPA_U), perfilFaixa(u, CAIXA_CAMPO.u[0], CAIXA_CAMPO.u[1], RAMPA_CAMPO, RAMPA_CAMPO))
}
function pesoV(v) {
  // o v cresce para o norte: a rampa do campo só vai para o sul (antes de v0)
  const norte = CAIXA_CAMPO.v[1] < NUCLEO_V ? 0 : RAMPA_CAMPO
  return Math.max(perfil(v, NUCLEO_V, RAMPA_V), perfilFaixa(v, CAIXA_CAMPO.v[0], CAIXA_CAMPO.v[1], RAMPA_CAMPO, norte))
}

// o fator de esticar num ponto do eixo: 1 fora das zonas, o inverso da escala da base dentro
function estica(base, peso, t) {
  const w = peso(t)
  if (w <= 0) return 1
  return 1 + (1 / Math.abs(derivadaBase(base, t)) - 1) * w
}
const esticaU = (u) => estica(baseU, pesoU, u)
const esticaV = (v) => estica(baseV, pesoV, v)

// a compressão nova: X(u) = f(a) + ∫ f'(t)·s(t) dt, com s o fator de esticar.
// A integral sai de f'(t) numérica (o pchip é C1, então a derivada central acerta).
function descomprimir(base, dom, esticaS) {
  const passos = 16000
  const h = (dom[1] - dom[0]) / passos
  const dh = 1e-6
  const derivada = (u) => (base(u + dh) - base(u - dh)) / (2 * dh)
  const xs = new Float64Array(passos + 1)
  const ys = new Float64Array(passos + 1)
  let acc = base(dom[0])
  xs[0] = dom[0]
  ys[0] = acc
  for (let i = 1; i <= passos; i++) {
    const meio = dom[0] + (i - 0.5) * h
    acc += derivada(meio) * esticaS(meio) * h
    xs[i] = dom[0] + i * h
    ys[i] = acc
  }
  // o pchip exige os nos em ordem crescente
  if (dom[1] < dom[0]) {
    xs.reverse()
    ys.reverse()
  }
  return { f: pchip(xs, ys), fim: acc }
}

const descU = descomprimir(baseU, dominio.u, esticaU)
const descV = descomprimir(baseV, dominio.v, esticaV)

// ---------- o jogo ----------
// (lon, lat) -> (x, z) do jogo, sem a deslocação do mundo
export function gradeJogo(lon, lat) {
  const [u, v] = gradeDe(lon, lat)
  const U = descU.f(u)
  const V = descV.f(v)
  // o quadro da grade volta para leste/norte: o u (ao longo da rua) vira o
  // eixo do x do jogo e o v (de travessia) o do z (que cresce para o sul)
  return [U * CU + V * SU, -U * SU + V * CU]
}

// ---------- a volta ----------
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

const U0 = descU.f(dominio.u[0])
const U1 = descU.f(dominio.u[1])
const V0 = descV.f(dominio.v[0]) // o v cresce para o norte e o V diminui: V0 > V1
const V1 = descV.f(dominio.v[1])
const invU = tabelaInversa(descU.f, dominio.u, [U0, U1], 0.5)
const invV = tabelaInversa(descV.f, [dominio.v[1], dominio.v[0]], [V1, V0], 0.5)

// (x, z) do jogo (sem a deslocação do mundo) -> (lon, lat)
export function jogoGrade(x, z) {
  const U = x * CU - z * SU
  const V = x * SU + z * CU
  return geoDe(invU(U), invV(V))
}

// ---------- a escala local ----------
// A escala da compressão (unidades de jogo por metro), por eixo do quadro da
// grade. O eixo v é decrescente: um metro para o norte vale -dv do jogo.
export function escalaGrade(lon, lat) {
  const [u, v] = gradeDe(lon, lat)
  const du = derivadaBase(baseU, u) * esticaU(u)
  const dv = derivadaBase(baseV, v) * esticaV(v)
  return { u: du, v: dv }
}

// a escala da compressão de sempre (sem a descompressão da praça)
export function escalaBaseGrade(lon, lat) {
  const [u, v] = gradeDe(lon, lat)
  return { u: derivadaBase(baseU, u), v: derivadaBase(baseV, v) }
}

// o quanto a praça estica a escala em um ponto (1 = fora da região
// descomprimida, o valor máximo é o próprio fator da praça)
export function esticamentoGrade(lon, lat) {
  const [u, v] = gradeDe(lon, lat)
  const su = esticaU(u)
  const sv = esticaV(v)
  return Math.sqrt(su * sv)
}

// ---------- os limites do mapa no jogo ----------
// A caixa do mapa em coordenadas de jogo (sem a deslocação do mundo).
export const CAIXA = (() => {
  const pontos = CANTOS.map(([lon, lat]) => gradeJogo(lon, lat))
  const xs = pontos.map((p) => p[0])
  const zs = pontos.map((p) => p[1])
  return {
    x0: Math.min(...xs),
    x1: Math.max(...xs),
    z0: Math.min(...zs),
    z1: Math.max(...zs),
  }
})()

// o norte de verdade no jogo: a direção em que a latitude sobe (para a rosa dos
// ventos do minimapa e para o mundo se orientar)
export function norteJogo() {
  const a = gradeJogo(PRACA_LON, PRACA_LAT)
  const b = gradeJogo(PRACA_LON, PRACA_LAT + 0.001)
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const c = Math.hypot(dx, dz) || 1
  return [dx / c, dz / c]
}
