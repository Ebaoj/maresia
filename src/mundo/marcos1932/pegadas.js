// Onde ficam os marcos do centro de 1932 e o chão que cada um ocupa (a "pegada"): um dado só, lido pelas
// obras (que se montam aqui) e pela cidade (que não põe casa em cima: cidade.js pergunta dentroDeMarco).
//
// Convenção do mapa (src/mundo/escala1932.js): a posição vem da longitude e latitude reais, passadas pela
// compressão; o prédio tem o tamanho real. Os quatro lugares daqui ficam no miolo descomprimido da Praça do
// Ferreira ou na beira dele (de 0,97 a 1,01 unidade por metro), então metro e unidade quase coincidem.
//
// Cada pegada é um retângulo na grade de Herbster (u = rua leste-sudeste, v = rua sul-sudoeste), com as
// meias medidas hu e hv em metros. A âncora é um lon/lat do dossiê ou o centro da Praça do Ferreira.
//
// Fontes: ~/Projetos/marcos-1932-pesquisa/marcos-1932.md e detalhe-4-marcos.md (FATO e HIPÓTESE estão lá).

import { ll } from '../fortaleza1932.js'
import { CENTRO as CENTRO_PRACA } from '../praca1932.js'
import { naGrade, paraGrade, EX, EZ } from './grade.js'

// A linha das fachadas do lado oeste da praça (Rua Major Facundo), em u a partir do centro da praça. O
// contorno da praça (praca1932.json) tem a borda oeste em u ≈ -22 a -33; a rua tem uns 8 a 10 m.
export const OESTE_PRACA = -40

const ANCORAS = {
  praca: CENTRO_PRACA,
  // Praça dos Leões: centro do polígono OSM (detalhe-4-marcos.md, seção 2), 79 x 73 m
  leoes: ll(-38.52633, -3.72694),
  // Praça Carolina (hoje Waldemar Falcão), onde o Mercado de Ferro ficou até 1937 (marcos-1932.md, seção 5)
  carolina: ll(-38.5264, -3.7259),
}

// u, v: o centro da pegada a partir da âncora; hu, hv: meias medidas (m)
export const PEGADAS = [
  // Hotel Excelsior: 49 x 16 m (OSM), fachada longa ao sul, curta a leste. O centro OSM (lat -3.72690,
  // lon -38.52792) cai a 4 m do contorno da praça de 1932; a obra recua 6 m para oeste para a Major Facundo
  // caber entre os dois (o polígono OSM é hipótese forte, o contorno da praça é a planta de 1932)
  { chave: 'excelsior', ancora: 'praca', u: OESTE_PRACA - 24.5, v: -44, hu: 24.5, hv: 8 },
  // Cine Moderno: Rua Major Facundo, 594 (FATO); fachada para a praça. Largura e fundo: HIPÓTESE (16 x 28 m)
  { chave: 'moderno', ancora: 'praca', u: OESTE_PRACA - 14, v: 12, hu: 14, hv: 8 },
  // Majestic Palace: quatro andares (FATO). O lado da praça não tem fonte; os postais de 1925 o mostram do
  // outro lado da praça, atrás do coreto, visto do Palacete Ceará (esquina nordeste): HIPÓTESE, o canto
  // sudoeste, de frente para a praça pela Major Facundo. 36 x 30 m
  { chave: 'majestic', ancora: 'praca', u: OESTE_PRACA - 15, v: 48, hu: 15, hv: 18 },
  // Praça dos Leões: a plataforma (79 x 73 m), mais a escadaria que avança sobre a Sena Madureira
  { chave: 'leoes', ancora: 'leoes', u: 0, v: 0, hu: 39.5, hv: 36.5 },
  { chave: 'leoesEscada', ancora: 'leoes', u: 45, v: 5, hu: 6.5, hv: 9 },
  // a escada de oeste, para a General Bezerril: no jogo o chão em volta é plano (o terreno não desce para a Sena
  // Madureira), então a plataforma precisa de acesso também do lado alto. DESVIO registrado em leoes.js
  { chave: 'leoesOeste', ancora: 'leoes', u: -46, v: 0, hu: 6.5, hv: 4.5 },
  // Igreja do Rosário (OSM 30 x 13 m) e Palácio da Luz (OSM 48 x 26 m), no lado sul da praça
  { chave: 'rosario', ancora: 'leoes', u: -6, v: 52, hu: 6.5, hv: 15 },
  { chave: 'palacioLuz', ancora: 'leoes', u: 26.5, v: 61, hu: 13, hv: 24 },
  // Mercado de Ferro: corpo de 72 x 24 m (HIPÓTESE: as duas metades de 40 x 22 m dos Pinhões e da
  // Aerolândia juntas, menos as emendas) e a feira em volta, dentro da Praça Carolina (110 x 75 m)
  { chave: 'mercado', ancora: 'carolina', u: 0, v: 0, hu: 50, hv: 30 },
].map((p) => {
  const [x, z] = naGrade(ANCORAS[p.ancora], p.u, p.v)
  return { ...p, x, z }
})

export const PEGADA = Object.fromEntries(PEGADAS.map((p) => [p.chave, p]))

// o ponto (x, z) de jogo cai dentro de alguma pegada (com folga em metros)?
export function dentroDeMarco(x, z, folga = 0) {
  for (const p of PEGADAS) {
    const [u, v] = paraGrade([p.x, p.z], x, z)
    if (Math.abs(u) <= p.hu + folga && Math.abs(v) <= p.hv + folga) return p.chave
  }
  return null
}

// a casa (retângulo girado de centro x, z, largura w, fundo d, giro rot, na convenção de cidade.js) encosta
// em algum marco? Teste exato de retângulos girados (eixos separadores), com folga em metros.
export function casaNoMarco(x, z, w, d, rot, folga = 0.5) {
  const ca = Math.cos(rot)
  const sa = Math.sin(rot)
  const ax = [ca, -sa]
  const az = [sa, ca]
  for (const p of PEGADAS) {
    const bx = EX
    const bz = EZ
    const dx = p.x - x
    const dz = p.z - z
    let separa = false
    for (const [ex, ez] of [ax, az, bx, bz]) {
      const proj = Math.abs(dx * ex + dz * ez)
      const ra = (w / 2) * Math.abs(ax[0] * ex + ax[1] * ez) + (d / 2) * Math.abs(az[0] * ex + az[1] * ez)
      const rb = (p.hu + folga) * Math.abs(bx[0] * ex + bx[1] * ez) + (p.hv + folga) * Math.abs(bz[0] * ex + bz[1] * ez)
      if (proj > ra + rb) { separa = true; break }
    }
    if (!separa) return p.chave
  }
  return null
}
