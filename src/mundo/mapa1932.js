// Os dados do mapa de 1932 em coordenadas do jogo.
//
// A fonte é src/mundo/mapa1932-dados.json, gerado por docs/mapa-1932-v3.py a partir da
// camada oficial "Evolucao Urbana 1932" da Prefeitura de Fortaleza (10.519 lotes com uso
// por lote). Este arquivo só lê e converte: a geometria bruta (longitude/latitude) vira
// coordenada de jogo, com a mesma compressão usada pelo resto do mapa.
//
// Nada aqui é fixo no código: quem quiser desenhar uma linha de bonde, o trilho ou o
// Campo do Urubu lê deste arquivo, e os números vêm com a marca de confiança (D = com
// fonte, H = hipótese) que está no documento docs/mapa-1932.md.

import dados from './mapa1932-dados.json'
import { ll, LON_POR_X, LAT_POR_Z } from './fortaleza1932.js'

export const FONTE = dados.fonte
export const JANELA = dados.janela
export const PALETA = dados.paleta

// lon/lat -> coordenada de jogo
function traco(coords) {
  return coords.map(([lon, lat]) => ll(lon, lat))
}

// as dez linhas da Light (1913-1947): todas saem da Praça do Ferreira.
// O traço é esquemático: uma reta entre âncoras reais, não a rota histórica. A distância
// é a medida de 1918 (Almanach), e vale mais que o traço para saber o tamanho da linha.
// Quando existir o grafo de ruas, o traço passa a seguir as ruas de verdade.
export const BONDES = dados.bondes.map((b) => ({
  nome: b.nome,
  distancia: b.distancia_m,
  esquematico: b.esquematico !== false,
  traco: traco(b.tracado),
}))

// ferrovia: a linha do Baturité, o ramal do Urubu e a ligação ao trapiche do porto
export const TRILHOS = dados.trilhos.map((t) => ({
  nome: t.nome,
  confianca: t.confianca,
  traco: traco(t.tracado),
}))

// o Campo do Urubu (H): 20 tarefas cercadas com arame, os galpões de zinco e as três
// construções (cozinha, posto, capela). As posições são as mesmas do desenho v3.
export const CAMPO_URUBU = {
  confianca: dados.campoUrubu.confianca,
  poligono: traco(dados.campoUrubu.poligono),
  tarefas: dados.campoUrubu.lugares.tarefas.map((t) => ({
    ponto: ll(t.lon, t.lat), largura: t.largura_m, profundidade: t.profundidade_m,
  })),
  galpoes: dados.campoUrubu.lugares.galpoes.map((g) => ({
    ponto: ll(g.lon, g.lat), largura: g.largura_m, profundidade: g.profundidade_m,
  })),
  construcoes: dados.campoUrubu.lugares.construcoes.map((c) => ({
    nome: c.nome, ponto: ll(c.lon, c.lat), raio: c.raio_m,
  })),
}

export const LUGARES = Object.fromEntries(
  Object.entries(dados.lugares).map(([chave, l]) => [
    chave, { nome: l.nome, papel: l.papel, confianca: l.confianca, ponto: ll(l.lon, l.lat) },
  ]),
)

export const BAIRROS = dados.bairros.map((b) => ({
  nome: b.nome, confianca: b.confianca, ponto: ll(b.lon, b.lat),
}))

// o único lote da planta de 1932 classificado como favela, a 240 m da Praça do Ferreira
export const FAVELA_1932 = { ponto: ll(dados.favela1932.lon, dados.favela1932.lat) }

// comprimento de uma polilinha, em metros de jogo
export function comprimento(pontos) {
  let total = 0
  for (let i = 0; i < pontos.length - 1; i++) {
    total += Math.hypot(pontos[i + 1][0] - pontos[i][0], pontos[i + 1][1] - pontos[i][1])
  }
  return total
}

// o ponto está dentro do Campo do Urubu?
export function dentroDoCampo(x, z) {
  const p = CAMPO_URUBU.poligono
  let dentro = false
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, zi] = p[i]
    const [xj, zj] = p[j]
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) dentro = !dentro
  }
  return dentro
}

// ll() é uma compressão com sentido (x cresce para leste, z cresce para o sul), então
// dá para inverter: é o que liga um ponto do jogo ao pixel do raster do uso dos lotes.
// A longitude cresce com x; a latitude cresce com -z.
export function llInverso(x, z) {
  return [LON_POR_X(x), LAT_POR_Z(z)]
}

// ponto do jogo -> pixel do raster src/mundo/mapa1932-malha.png (origem no canto noroeste)
export function pontoParaPixel(x, z) {
  const [lon, lat] = llInverso(x, z)
  const px = ((lon - JANELA.lon_min) / (JANELA.lon_max - JANELA.lon_min)) * JANELA.pixels[0]
  const py = ((JANELA.lat_max - lat) / (JANELA.lat_max - JANELA.lat_min)) * JANELA.pixels[1]
  return [px, py]
}
