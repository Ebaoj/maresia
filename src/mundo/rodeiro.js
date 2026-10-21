// O rodeiro da carroça: as marcas das rodas na rua de terra batida.
//
// Em 1932 a rua da cidade era de terra. O que mais se via nela era o sulco
// das rodas das carroças (duas marcas fundas, mais ou menos no meio da rua)
// e a poeira que o vento levava. O chão do terreno é uma malha grande; o
// rodeiro é desenhado no shader, na mesma conta que o paralelepípedo.
//
//   uRota = (força, posição, largura, desgaste)
//     força:    o quanto o sulco aparece (0 = rua lisa)
//     posição: onde o sulco fica na rua (0 = meio da rua, 0.5 = borda)
//     largura: a largura do sulco (fração da meia-largura da rua)
//     desgaste: o quanto o meio da rua está polvilhado pelas rodas
//
// O terreno passa a posição do ponto na rua (vRota): 0 no meio da rua, 1 na
// borda, -1 fora da rua (no quintal, no mato, na praia). Como a posição é
// normalizada, o rodeiro sai do mesmo jeito na rua larga e na rua estreita,
// e na parte do mapa que está comprimida tanto quanto na que está em 1:1.

import * as THREE from 'three'
import { ref } from '../render/gpu/comum.js'
import { CHAO } from '../paleta.js'

export const uRodeiro = {
  uRota: { value: new THREE.Vector4(1, 0.16, 0.09, 0.7) },
}

// leva o que está no config para o uniform (o painel mexe no config ao vivo)
export function sincronizarRodeiro(cfg) {
  const c = cfg?.chao
  if (!c) return
  uRodeiro.uRota.value.set(c.rodeiroForca, c.rodeiroPos, c.rodeiroLarg, c.desgaste)
}

// a cor vira literal no shader: sai da paleta (src/paleta.js), não do chute
function corLiteral(hex) {
  const c = new THREE.Color(hex)
  return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`
}
const COR_PO = corLiteral(CHAO.poeira)
const COR_RO = corLiteral(CHAO.rodeiro)
const COR_PO_V = new THREE.Color(CHAO.poeira)
const COR_RO_V = new THREE.Color(CHAO.rodeiro)

export const GLSL_RODEIRO_UNIFORM = 'uniform vec4 uRota;'

export const GLSL_RODEIRO = `
  {
    float u = vRota;
    if (u >= 0.0 && vPiso < 0.01) {
      // o meio da rua polvilhado pelas rodas
      float poeira = uRota.w * (1.0 - smoothstep(0.0, 0.55, u));
      // o sulco da carroça: uma marca de cada lado do meio
      float sulco = uRota.x * (1.0 - smoothstep(uRota.z * 0.5, uRota.z, abs(u - uRota.y)));
      diffuseColor.rgb = mix(diffuseColor.rgb, ${COR_PO}, poeira * 0.5);
      diffuseColor.rgb = mix(diffuseColor.rgb, ${COR_RO}, sulco * 0.5); // (0,75 antes: com a posição na rua contínua o sulco passou a aparecer e escurecia demais)
    }
  }`

// O mesmo trecho em TSL, para o modo webgpu (motor F2, KAN-68).
export function tslRodeiro(W, rgb, vRota, vPiso) {
  const { Fn, float, abs, smoothstep, mix, If, vec3 } = W
  const b = ref(uRodeiro.uRota)
  const corPo = vec3(COR_PO_V.r, COR_PO_V.g, COR_PO_V.b)
  const corRo = vec3(COR_RO_V.r, COR_RO_V.g, COR_RO_V.b)
  return Fn(() => {
    If(vRota.greaterThanEqual(float(0)).and(vPiso.lessThan(float(0.01))), () => {
      const u = vRota
      const poeira = b.w.mul(float(1).sub(smoothstep(float(0), float(0.55), u))).mul(0.5)
      const sulco = b.x.mul(float(1).sub(smoothstep(b.z.mul(0.5), b.z, abs(u.sub(b.y))))).mul(0.5)
      rgb.assign(mix(rgb, corPo, poeira))
      rgb.assign(mix(rgb, corRo, sulco))
    })
    return rgb
  })()
}
