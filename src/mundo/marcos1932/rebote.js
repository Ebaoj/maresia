// Fachada clara com luz rebatida: a sombra de uma parede caiada ou creme recebe a luz quente que o chão de pedra e
// as outras paredes devolvem (docs/direcao-de-arte.md, lacuna 4: "sombra clara com luz rebatida da areia e da cal").
// A sombra fria do pintar() sozinha deixava o lado de sombra do Excelsior cinza-violeta.
//
// Entra como brilho próprio só no lado que o sol não alcança, mais forte embaixo (perto do chão que rebate),
// igual no WebGL (GLSL antes do pintar) e no WebGPU (TSL em userData.tsl.emissivo). A força e a cor ficam em
// cfg.marcos (rebote, corRebote) e mudam ao vivo.

import * as THREE from 'three'
import { pintar, gradienteToon, texturizar } from '../../materiais.js'
import { globais } from '../../globais.js'
import { ref } from '../../render/gpu/comum.js'

export const uRebote = { forca: { value: 0.35 }, cor: { value: new THREE.Color('#ffc98a') } }

export function sincronizarRebote(cfg) {
  uRebote.forca.value = cfg.marcos.rebote
  uRebote.cor.value.set(cfg.marcos.corRebote)
}

const GLSL = /* glsl */ `
  {
    vec3 nR = normalize(vNMundo);
    vec3 lR = normalize(uSolDirA);
    float diaR = smoothstep(-0.02, 0.15, lR.y);
    float sombraR = 1.0 - smoothstep(-0.1, 0.35, dot(nR, lR));
    float baixoR = 0.55 + 0.45 * (1.0 - smoothstep(0.0, 18.0, vPMundo.y - uReboteChao));
    totalEmissiveRadiance += uReboteCor * diffuseColor.rgb * sombraR * baixoR * uReboteForca * diaR * (1.0 - max(nR.y, 0.0));
  }
`

function tsl(chao) {
  return {
    nome: 'fachada-rebote',
    emissivo({ W }, emissivo) {
      const { normalize, smoothstep, dot, float, max, varyingProperty, positionWorld } = W
      const n = normalize(varyingProperty('vec3', 'vNMundo'))
      const l = normalize(ref(globais.uSolDir))
      const dia = smoothstep(-0.02, 0.15, l.y)
      const sombra = float(1.0).sub(smoothstep(-0.1, 0.35, dot(n, l)))
      const baixo = float(1.0).sub(smoothstep(0.0, 18.0, positionWorld.y.sub(chao))).mul(0.45).add(0.55)
      const k = sombra.mul(baixo).mul(ref(uRebote.forca)).mul(dia).mul(float(1.0).sub(max(n.y, 0.0)))
      return emissivo.add(ref(uRebote.cor).mul(W.diffuseColor.rgb).mul(k))
    },
  }
}

// chao: a altura do chão da obra (o rebote é mais forte perto dele)
export function materialRebote(hex, { tex = 'cal', tam = 2.5, contraste = 2.0, chao = 0 } = {}) {
  const m = new THREE.MeshToonMaterial({ color: hex, gradientMap: gradienteToon() })
  const uChao = { value: chao }
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uReboteForca = uRebote.forca
    sh.uniforms.uReboteCor = uRebote.cor
    sh.uniforms.uReboteChao = uChao
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uReboteForca; uniform vec3 uReboteCor; uniform float uReboteChao;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + GLSL)
  }
  m.userData.tsl = tsl(chao)
  pintar(m, 'fachada-rebote')
  return texturizar(m, { topo: tex, lado: tex, tam, contraste })
}
