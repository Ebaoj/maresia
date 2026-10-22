// As folgas da testada de 1932 (21/10/2026): qual folga é rua transversal (e fica aberta) e as folgas
// entre duas cadeias da mesma face de quarteirão. Saiu de casario1932.js (passava de 400 linhas); quem
// usa é casario1932.js (VAOS) e src/mundo/frente1932.js (a casa geminada e o muro).

import dados from './mapa1932-lotes.json'
import { ll } from './fortaleza1932.js'
import { FRENTES, emLonLat } from './casarioPlanta1932.js'

const CADEIAS = dados.cadeias
const livre = (ponta) => (ponta === 'a' ? 'b' : 'a')

// A folga da testada e uma rua que cruza? A cadeia segue a mesma rua de um
// quarteirao para o outro, e a folga entre a ultima casa de um e a primeira do
// outro e a rua transversal: um muro ou uma casa ali fecha a rua (o defeito
// "parede cega atravessando a rua" que o Joabe viu em 03d7bb1). O sinal e o lote
// de esquina: na rua transversal os lotes dao a frente para dentro da folga
// (a normal deles aponta para o meio da folga). Lote vazio no meio do
// quarteirao nao tem ninguem olhando para ele. Tudo em metros de verdade.
const CELULA_FRENTES = 40
const frentesPorCelula = new Map()
FRENTES.forEach((f, i) => {
  const mx = (f.a[0] + f.b[0]) / 2
  const mz = (f.a[1] + f.b[1]) / 2
  const k = `${Math.floor(mx / CELULA_FRENTES)},${Math.floor(mz / CELULA_FRENTES)}`
  if (!frentesPorCelula.has(k)) frentesPorCelula.set(k, [])
  frentesPorCelula.get(k).push(i)
})
// a frente f olha para dentro da folga de a a b? (normal: a da folga, para a rua; prof: o fundo do lote)
export function frenteOlhaParaFolga(f, a, b, normal, prof, alcance = 0) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1])
  if (L < 0.5) return false
  const tx = (b[0] - a[0]) / L
  const tz = (b[1] - a[1]) / L
  const fundo = Math.max(Math.max(prof, 6) + 8, alcance)
  const mx = (f.a[0] + f.b[0]) / 2 - a[0]
  const mz = (f.a[1] + f.b[1]) / 2 - a[1]
  const s = mx * tx + mz * tz // ao longo da folga
  const q = -(mx * normal[0] + mz * normal[1]) // para dentro do quarteirao
  if (s < -3 || s > L + 3 || q < 0 || q > fundo) return false
  const virada = f.normal[0] * tx + f.normal[1] * tz
  if (Math.abs(virada) < 0.7) return false // a frente corre junto da folga, nao olha para ela
  return Math.sign(virada) === Math.sign(L / 2 - s)
}

// alcance: até onde (m, para dentro do quarteirão) procurar o lote da rua transversal
export function folgaCruzaRua(a, b, normal, prof, alcance = 0) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1])
  if (L < 0.5) return false
  const fundo = Math.max(Math.max(prof, 6) + 8, alcance)
  const i0 = Math.floor((Math.min(a[0], b[0]) - fundo) / CELULA_FRENTES)
  const i1 = Math.floor((Math.max(a[0], b[0]) + fundo) / CELULA_FRENTES)
  const j0 = Math.floor((Math.min(a[1], b[1]) - fundo) / CELULA_FRENTES)
  const j1 = Math.floor((Math.max(a[1], b[1]) + fundo) / CELULA_FRENTES)
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      for (const k of frentesPorCelula.get(`${i},${j}`) || []) {
        if (frenteOlhaParaFolga(FRENTES[k], a, b, normal, prof, alcance)) return true
      }
    }
  }
  return false
}

// As folgas ENTRE cadeias (21/10/2026, HIPÓTESE): a planta de 1932 só tem os lotes construídos, e a
// cadeia da rua se parte onde falta lote. Quando duas cadeias param e recomeçam na MESMA linha de
// fachada, viradas para o mesmo lado (a mesma face de quarteirão), o trecho entre elas era testada da
// mesma rua: as fotos do Centro de 1925 a 1936 mostram a rua de parede contínua, sem terreno aberto
// no meio do quarteirão. O trecho vira folga como as outras (casa geminada no Centro, muro com portão
// nos bairros), e a rua transversal no meio continua aberta (folgaCruzaRua).
const MAX_FOLGA_ENTRE = 120 // m: mais que isso já não é a mesma face de quarteirão
const DESVIO_ENTRE = 2 // m fora da linha da fachada
export function folgasEntreCadeias() {
  const pontas = CADEIAS.map((cadeia) => {
    const [k0, e0] = cadeia[0]
    const [k1, e1] = cadeia[cadeia.length - 1]
    const f0 = FRENTES[k0]
    const f1 = FRENTES[k1]
    const ini = f0[e0]
    const iniPara = f0[livre(e0)]
    const fim = f1[livre(e1)]
    const fimDe = f1[e1]
    const dir = (a, b) => { const c = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / c, (b[1] - a[1]) / c] }
    return { ini, fim, dirIni: dir(ini, iniPara), dirFim: dir(fimDe, fim), nIni: f0.normal, nFim: f1.normal, profIni: f0.prof, profFim: f1.prof, uso: f1.uso }
  })
  const C = 60
  const porCelula = new Map()
  pontas.forEach((p, i) => {
    const k = `${Math.floor(p.ini[0] / C)},${Math.floor(p.ini[1] / C)}`
    if (!porCelula.has(k)) porCelula.set(k, [])
    porCelula.get(k).push(i)
  })
  const saida = []
  pontas.forEach((a, ia) => {
    let melhor = null
    const ci = Math.floor(a.fim[0] / C)
    const cj = Math.floor(a.fim[1] / C)
    for (let dj = -2; dj <= 2; dj++) {
      for (let di = -2; di <= 2; di++) {
        for (const ib of porCelula.get(`${ci + di},${cj + dj}`) || []) {
          if (ib === ia) continue
          const b = pontas[ib]
          if (a.nFim[0] * b.nIni[0] + a.nFim[1] * b.nIni[1] < 0.98) continue // viradas para o mesmo lado
          if (a.dirFim[0] * b.dirIni[0] + a.dirFim[1] * b.dirIni[1] < 0.98) continue // e na mesma direção
          const dx = b.ini[0] - a.fim[0]
          const dz = b.ini[1] - a.fim[1]
          const ao = dx * a.dirFim[0] + dz * a.dirFim[1]
          const fora = Math.abs(dx * a.nFim[0] + dz * a.nFim[1])
          if (ao < 7 || ao > MAX_FOLGA_ENTRE || fora > DESVIO_ENTRE) continue
          if (!melhor || ao < melhor.ao) melhor = { ao, b }
        }
      }
    }
    if (!melhor) return
    const prof = Math.min(a.profFim, melhor.b.profIni)
    saida.push({
      a: ll(...emLonLat(a.fim[0], a.fim[1])),
      b: ll(...emLonLat(melhor.b.ini[0], melhor.b.ini[1])),
      normal: a.nFim,
      largura: melhor.ao,
      uso: a.uso,
      prof,
      hipotese: true,
      // entre cadeias a esquina costuma não ter lote: procura a rua transversal até 60 m para dentro
      rua: folgaCruzaRua(a.fim, melhor.b.ini, a.nFim, prof, 60),
    })
  })
  return saida
}

