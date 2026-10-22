// A noite no Campo do Urubu: escura, umas poucas fogueiras e lamparinas, nada de luz de festa.
//
// FATO: em 1932 não havia luz elétrica nem na rua do Centro (a Praça do Ferreira só em dez/1934: dossiê,
// "o que NÃO existia"); no campo, fogo e querosene. A cantoria e o repente à noite (docs/direcao-de-arte.md,
// seção 6, com fonte). HIPÓTESE: quantas fogueiras, onde, e as lamparinas (a do portão, a da mesa do registro,
// a do posto, duas penduradas em galpão).
//
// As luzes entram no mapa de luz da cenografia (registrarLampiao: poça quente no chão, só de noite), as chamas
// são cones acesos (luzFixa, escrevem gLuz). As redes de noite: quase todas com alguém (cfg.redesOcupadasNoite).

import * as THREE from 'three'
import { luzFixa } from '../materiais.js'
import { globais } from '../globais.js'
import { instanciarEmBlocos } from './blocos.js'
import { alturaTerreno } from './terreno.js'
import { registrarLampiao } from './cenografia.js'
import { FOGAREIROS } from './fatia-objetos.js'
import { geometriaChama, geometriaVidroLampiao } from './urubu-pecas.js'
import { vagasDaNoite } from './urubu-gente.js'

let _chama = null
let _brasa = null
let _vidro = null
// a chama do dia (a cozinha cozinhando) e a da noite (fogueira, lamparina): cor própria, sem receber luz
const matChama = () => (_chama ||= luzFixa(new THREE.MeshBasicMaterial({ vertexColors: true }), 1, { value: 0.6 }))
const matBrasa = () => (_brasa ||= luzFixa(new THREE.MeshBasicMaterial({ vertexColors: true }), 1, globais.uNoite))
const matVidro = () => (_vidro ||= luzFixa(new THREE.MeshBasicMaterial({ color: '#ffc66a' }), 1, globais.uNoite))

// devolve { dia: malhas que só aparecem de dia, noite: malhas que só aparecem de noite }
// matriz: (x, y, z, yaw, escala) -> Matrix4; montarGente: o mesmo de urubu1932.js (figura nas vagas)
export function criarNoiteDoCampo (cena, planta, cfg, { matriz, montarGente, modelos, mat, matPano }) {
  const q = planta.quadro
  const dia = []
  const noite = []
  // a cozinha cozinha de dia: chama nos três fogões e a fumaça (as partículas saem dos FOGAREIROS, main.js)
  const chamasDia = []
  for (const f of planta.cozinha.fogos) {
    const y = alturaTerreno(f.x, f.z)
    chamasDia.push(matriz(f.x, y + 0.04, f.z, 0, 0.9))
    FOGAREIROS.push(new THREE.Vector3(f.x, y + 1.1, f.z))
  }
  dia.push(...instanciarEmBlocos(cena, geometriaChama(), matChama(), chamasDia, null, { nome: 'urubu-chamas-dia', sombra: false }))

  // as fogueiras da noite: chama, poça de luz no chão e a gente em volta
  const chamasNoite = []
  for (const f of planta.fogueiras) {
    const y = alturaTerreno(f.x, f.z)
    chamasNoite.push(matriz(f.x, y + 0.08, f.z, f.u, 1.2))
    registrarLampiao(f.x, y + 0.6, f.z)
  }
  // a brasa da cozinha: o fogo abafado do meio, para o café da madrugada
  const meio = planta.cozinha.fogos[1]
  if (meio) {
    chamasNoite.push(matriz(meio.x, alturaTerreno(meio.x, meio.z) + 0.02, meio.z, 0, 0.45))
    registrarLampiao(meio.x, alturaTerreno(meio.x, meio.z) + 0.4, meio.z)
  }
  noite.push(...instanciarEmBlocos(cena, geometriaChama(), matBrasa(), chamasNoite, null, { nome: 'urubu-chamas-noite', sombra: false }))

  // as lamparinas: a do portão (no mourão), a da mesa do registro, a da porta do posto, duas penduradas em galpão
  const vidros = []
  const lamparina = (x, y, z) => { vidros.push(matriz(x, y, z)); registrarLampiao(x, y, z) }
  {
    const [x, z] = q.mundo(-planta.portao.largura / 2, 0)
    lamparina(x, alturaTerreno(x, z) + 2.55, z)
    const m = planta.registro
    const [lx, lz] = q.mundo(m.u - 0.2, m.w - 0.5)
    lamparina(lx, alturaTerreno(lx, lz) + 0.97, lz)
    const p = planta.posto
    const [px, pz] = q.mundo(p.u + 1.1, p.w + p.p / 2 + 0.25)
    lamparina(px, alturaTerreno(px, pz) + 2.2, pz)
    for (const g of [planta.galpoes[8], planta.galpoes[planta.galpoes.length - 6]].filter(Boolean)) {
      const [gx, gz] = q.mundo(g.u + 2, g.w - 2)
      lamparina(gx, (g.y ?? alturaTerreno(gx, gz)) + 1.85, gz)
    }
  }
  noite.push(...instanciarEmBlocos(cena, geometriaVidroLampiao(), matVidro(), vidros, null, { nome: 'urubu-lamparinas', sombra: false }))

  // a gente em volta das fogueiras
  noite.push(...montarGente(cena, mat, matPano, modelos, vagasDaNoite(planta, cfg.genteNoite), 'urubu-noite'))
  return { dia, noite }
}
