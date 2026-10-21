// O metal das esculturas da Praça dos Leões (ferro fundido de Val d'Osne e o bronze do General): o toon pintado do
// jogo (as três faixas de luz do pintar()) com duas coisas a mais, para a forma ler mesmo num valor escuro:
//   - o brilho do metal: um realce recortado (duro, de tinta) onde a juba e os músculos viram para o sol
//   - a borda fria do céu: luz azulada nas bordas que olham para cima, separando a peça do fundo
// Os dois entram como brilho próprio (emissivo), igual no WebGL (GLSL antes do pintar) e no WebGPU (TSL em
// userData.tsl.emissivo): a segunda saída (gLuz) recebe o mesmo valor nos dois.
//   - a luz do céu no lado da sombra, para a peça de contraluz não virar silhueta
// Os números ficam em cfg.marcos (metalBrilho, metalDuro, metalRim, metalCeu, corRimCeu) e mudam ao vivo.

import * as THREE from 'three'
import { pintar, gradienteToon, texturizar } from '../../materiais.js'
import { globais } from '../../globais.js'
import { ref } from '../../render/gpu/comum.js'

// os uniforms são os mesmos objetos nos dois renderizadores (ref liga o TSL a eles)
export const uMetal = {
  brilho: { value: 0.45 },
  duro: { value: 0.08 },
  rim: { value: 0.35 },
  corRim: { value: new THREE.Color('#9cc0e0') },
  ceu: { value: 0.35 },
}

export function sincronizarMetal(cfg) {
  const m = cfg.marcos
  uMetal.brilho.value = m.metalBrilho
  uMetal.duro.value = m.metalDuro
  uMetal.rim.value = m.metalRim
  uMetal.corRim.value.set(m.corRimCeu)
  uMetal.ceu.value = m.metalCeu
}

const GLSL_METAL = /* glsl */ `
  {
    vec3 nM = normalize(vNMundo);
    vec3 vM = normalize(cameraPosition - vPMundo);
    vec3 lM = normalize(uSolDirA);
    float diaM = smoothstep(-0.02, 0.15, lM.y);
    float specM = pow(max(dot(nM, normalize(lM + vM)), 0.0), 40.0);
    specM = smoothstep(0.45 - uMetalDuro, 0.45 + uMetalDuro, specM) * step(0.0, dot(nM, lM));
    float fresM = pow(1.0 - clamp(dot(nM, vM), 0.0, 1.0), 3.0) * smoothstep(-0.2, 0.7, nM.y);
    // a luz do céu no lado da sombra (o ferro escuro de contraluz virava silhueta): só onde o sol não chega
    float ceuM = (0.5 + 0.5 * nM.y) * (1.0 - smoothstep(-0.1, 0.35, dot(nM, lM)));
    totalEmissiveRadiance += (vec3(1.0, 0.94, 0.82) * specM * uMetalBrilho + uMetalCorRim * fresM * uMetalRim
      + uMetalCorRim * diffuseColor.rgb * ceuM * uMetalCeu) * diaM;
  }
`

function tslMetal() {
  return {
    nome: 'metal-pintado',
    emissivo({ W }, emissivo) {
      const { normalize, positionWorld, cameraPosition, pow, max, dot, smoothstep, step, clamp, float, vec3, varyingProperty } = W
      const nM = normalize(varyingProperty('vec3', 'vNMundo'))
      const vM = normalize(cameraPosition.sub(positionWorld))
      const lM = normalize(ref(globais.uSolDir))
      const dia = smoothstep(-0.02, 0.15, lM.y)
      const duro = ref(uMetal.duro)
      const spec0 = pow(max(dot(nM, normalize(lM.add(vM))), 0.0), 40.0)
      const spec = smoothstep(float(0.45).sub(duro), float(0.45).add(duro), spec0).mul(step(0.0, dot(nM, lM)))
      const fres = pow(float(1.0).sub(clamp(dot(nM, vM), 0.0, 1.0)), 3.0).mul(smoothstep(-0.2, 0.7, nM.y))
      const ceu = nM.y.mul(0.5).add(0.5).mul(float(1.0).sub(smoothstep(-0.1, 0.35, dot(nM, lM))))
      const luz = vec3(1.0, 0.94, 0.82).mul(spec).mul(ref(uMetal.brilho)).add(ref(uMetal.corRim).mul(fres).mul(ref(uMetal.rim)))
        .add(ref(uMetal.corRim).mul(W.diffuseColor.rgb).mul(ceu).mul(ref(uMetal.ceu)))
      return emissivo.add(luz.mul(dia))
    },
  }
}

// o material: cor do cfg (ao vivo, pelo atualizar de materiais.js), faixas do toon, textura pintada leve
export function materialMetal(hex) {
  const m = new THREE.MeshToonMaterial({ color: hex, gradientMap: gradienteToon() })
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uMetalBrilho = uMetal.brilho
    sh.uniforms.uMetalDuro = uMetal.duro
    sh.uniforms.uMetalRim = uMetal.rim
    sh.uniforms.uMetalCorRim = uMetal.corRim
    sh.uniforms.uMetalCeu = uMetal.ceu
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uMetalBrilho; uniform float uMetalDuro; uniform float uMetalRim; uniform vec3 uMetalCorRim; uniform float uMetalCeu;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + GLSL_METAL)
  }
  m.userData.tsl = tslMetal()
  pintar(m, 'metal-pintado')
  return texturizar(m, { topo: 'pedra', lado: 'pedra', tam: 0.35, contraste: 0.5, massa: 0.4 })
}
