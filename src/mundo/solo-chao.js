// A cor e o tipo do chão em cada ponto do mapa (tirado de terreno.js, 21/10/2026, quando o arquivo passou de 400
// linhas): a cor pintada por vértice (corChao), o peso de cada tipo de chão para o relevo pintado (soloChao) e o
// paralelepípedo do Centro (calcamento).

import * as THREE from 'three'
import { distCosta, larguraPraia, fbm, smooth, FIM_AVENIDA, rioX, RIO_MEIA_LARGURA, pesoCidade1932 } from './mapa.js'
import { lagoasJogo } from './fortaleza1932.js'
import { CHAO_RUA, CHAO_QUINTAL, maskCentro1932, tipoChao1932 } from './chao1932.js'
import { pesoCampoUrubu } from './mapa1932.js'
import { CHAO } from '../paleta.js'

const C = (hex) => new THREE.Color(hex)
const PALETA = {
  fundoMar: C('#c9a46e'),
  grama: C('#7aa85a'),
  mata: C('#1d7a4c'),
  pedra: C('#d3b08e'),
  pedra2: C('#b98f78'),
  serra: C('#3f9a62'),
}
// as cores do chão mesmo estão na paleta (src/paleta.js): a terra da rua, a
// terra do quintal, o mato, a areia da praia e da duna

// O calçamento de 1932: paralelepípedo só nas ruas do Centro. O Centro é a
// distância real até a Praça do Ferreira (a cidade do fim do século XIX era
// estreita e tinha pedra batida no miolo, terra batida nos bairros).
export function calcamento(x, z, cfg) {
  if (tipoChao1932(x, z) !== CHAO_RUA) return 0
  return maskCentro1932(x, z, cfg.chao.centroRaio, cfg.chao.centroBorda)
}

export function corChao(x, z, h, incl, dens, alvo, cfg) {
  const s = distCosta(x, z)
  const bw = larguraPraia(x)
  const variacao = fbm(x * 0.09, z * 0.09, 2, 71)
  if (s < 0) {
    alvo.copy(PALETA.fundoMar)
  } else if (s < bw) {
    alvo.copy(C(CHAO.areiaMolhada)).lerp(C(CHAO.areiaSeca), smooth(0, 7, s))
  } else {
    // O chão de 1932: a rua é terra batida, o quintal atrás das casas é
    // terra com mato ralo, e o que sobrou fora da cidade é mato seco.
    // A areia fica só na praia e nas dunas.
    const tipo = tipoChao1932(x, z)
    if (tipo === CHAO_RUA) {
      alvo.copy(C(CHAO.rua))
    } else if (tipo === CHAO_QUINTAL) {
      alvo.copy(C(CHAO.quintal))
      // mato ralo: o quintal abandonado tem manchas de mato
      const mato = smooth(0.05, 0.5, fbm(x * 0.3, z * 0.3, 2, 23) + 0.5)
      alvo.lerp(C(CHAO.mato), mato * cfg.chao.mato)
    } else {
      alvo.copy(C(CHAO.matoSeco))
    }
    // rua da praia: areia batida, mais clara
    alvo.lerp(C(CHAO.areiaSeca), 1 - smooth(bw + FIM_AVENIDA, bw + FIM_AVENIDA + 4, s))
    // dunas: areia branca, mais clara quanto mais alta
    alvo.lerp(C(CHAO.duna), smooth(7, 12, h) * (1 - smooth(0.05, 0.3, pesoCidade1932(x, z))))
    // Campo do Urubu na seca de 1932: terra batida, clara e rachada (o relevo das placas vem de relevo-chao.js)
    alvo.lerp(C(CHAO.terraRachada), pesoCampoUrubu(x, z) * smooth(bw + FIM_AVENIDA, bw + FIM_AVENIDA + 4, s))
    // onde tem grama, o chão fica verde
    alvo.lerp(C(CHAO.baseGrama).lerp(C(CHAO.gramaEscura), smooth(-0.3, 0.3, variacao) * 0.4), smooth(0.05, 0.45, dens))
  }
  // margens do rio e das lagoas: lama de mangue e de várzea
  const dr = Math.abs(x - rioX(z))
  if (s > 0) alvo.lerp(C(CHAO.lama), 1 - smooth(RIO_MEIA_LARGURA * 0.9, RIO_MEIA_LARGURA * 1.8, dr))
  for (const l of lagoasJogo) {
    const q = Math.hypot((x - l.x) / l.rx, (z - l.z) / l.rz)
    if (q < 1.6) alvo.lerp(C(CHAO.lama), 1 - smooth(0.9, 1.5, q))
  }
  // encosta íngreme
  alvo.lerp(C(CHAO.rocha), smooth(0.85, 1.3, incl) * 0.5)
  // manchas de pintura
  alvo.multiplyScalar(1 + variacao * 0.12)
  return alvo
}

// O peso de cada tipo de chão para o relevo pintado (relevo-chao.js): areia, terra, terra rachada, grama.
// O paralelepípedo vem à parte (aPiso), e a posição na rua (aRota) dá o sulco da roda.
export function soloChao(x, z, h, dens, alvo) {
  const s = distCosta(x, z)
  const bw = larguraPraia(x)
  let areia = 1
  let terra = 0
  let racha = 0
  if (s >= bw) {
    const tipo = tipoChao1932(x, z)
    areia = Math.max(1 - smooth(bw + FIM_AVENIDA, bw + FIM_AVENIDA + 4, s), smooth(7, 12, h) * (1 - smooth(0.05, 0.3, pesoCidade1932(x, z))))
    terra = (tipo === CHAO_RUA || tipo === CHAO_QUINTAL ? 1 : 0.6) * (1 - areia)
    racha = pesoCampoUrubu(x, z) * (1 - areia)
    terra *= 1 - racha
    // lama de mangue e de várzea: lisa
    const dr = Math.abs(x - rioX(z))
    terra *= smooth(RIO_MEIA_LARGURA * 0.9, RIO_MEIA_LARGURA * 1.8, dr)
  }
  const grama = smooth(0.05, 0.45, dens)
  alvo[0] = areia * (1 - grama)
  alvo[1] = terra * (1 - grama)
  alvo[2] = racha * (1 - grama)
  alvo[3] = grama
  return alvo
}
