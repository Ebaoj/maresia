// O metal das esculturas da Praça dos Leões (ferro fundido de Val d'Osne e o bronze do General): o toon pintado do
// jogo (as três faixas de luz do pintar()) com duas coisas a mais, para a forma ler mesmo num valor escuro:
//   - o brilho do metal: um realce recortado (duro, de tinta) onde a juba e os músculos viram para o sol
//   - a borda fria do céu: luz azulada nas bordas que olham para cima, separando a peça do fundo
// Os dois entram como brilho próprio (emissivo), igual no WebGL (GLSL antes do pintar) e no WebGPU (TSL em
// userData.tsl.emissivo): a segunda saída (gLuz) recebe o mesmo valor nos dois.
//   - a luz do céu no lado da sombra, para a peça de contraluz não virar silhueta
// Os números ficam em cfg.marcos (metalBrilho, metalDuro, metalRim, metalCeu, corRimCeu) e mudam ao vivo.
// Sem camuflagem (22/10/2026): no modelo esculpido o realce e a borda do céu leem a normal da forma grande
// (aNormalForma, normais-suaves.js), com expoente alto (metalPonta) e só onde a normal miúda concorda com ela
// (metalConcorda); a borda das faixas de luz leva pincelada própria, quase reta (metalPincel).

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
  pincel: { value: 0.06 },
  ponta: { value: 120 },
  concorda: { value: 0.9 }, // o realce só onde o relevo miúdo concorda com a forma (sem pingo no fundo da juba); 0 desliga // o expoente do realce: alto = um ponto pequeno no alto do volume, não uma placa clara // a pincelada da borda das faixas só no metal (materiais.js, pintar: userData.arcPincel)
}

export function sincronizarMetal(cfg) {
  const m = cfg.marcos
  uMetal.brilho.value = m.metalBrilho
  uMetal.duro.value = m.metalDuro
  uMetal.rim.value = m.metalRim
  uMetal.corRim.value.set(m.corRimCeu)
  uMetal.ceu.value = m.metalCeu
  uMetal.pincel.value = m.metalPincel
  uMetal.ponta.value = m.metalPonta
  uMetal.concorda.value = m.metalConcorda
}

const GLSL_METAL = /* glsl */ `
  {
    vec3 nM = normalize(vNFormaM); // a normal da forma grande (normais-suaves.js): um brilho por volume, não um por calombo
    vec3 vM = normalize(cameraPosition - vPMundo);
    vec3 lM = normalize(uSolDirA);
    float diaM = smoothstep(-0.02, 0.15, lM.y);
    float specM = pow(max(dot(nM, normalize(lM + vM)), 0.0), uMetalPonta);
    specM = smoothstep(0.45 - uMetalDuro, 0.45 + uMetalDuro, specM) * step(0.0, dot(nM, lM));
    // no fundo da juba e nos calombos a normal miúda vira para outro lado: ali o realce apagava em pingos soltos
    specM *= smoothstep(uMetalConcorda - 0.08, uMetalConcorda, dot(normalize(vNMundo), nM));
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
      const { normalize, positionWorld, cameraPosition, pow, max, dot, smoothstep, step, clamp, float, vec3 } = W
      // a normal da forma grande (normais-suaves.js): um brilho por volume, não um por calombo
      const nM = normalize(W.modelWorldMatrix.mul(W.vec4(W.attribute('aNormalForma', 'vec3'), 0.0)).xyz)
      const vM = normalize(cameraPosition.sub(positionWorld))
      const lM = normalize(ref(globais.uSolDir))
      const dia = smoothstep(-0.02, 0.15, lM.y)
      const duro = ref(uMetal.duro)
      const spec0 = pow(max(dot(nM, normalize(lM.add(vM))), 0.0), ref(uMetal.ponta))
      const concorda = ref(uMetal.concorda)
      const nMiudo = normalize(W.varyingProperty('vec3', 'vNMundo'))
      const spec = smoothstep(float(0.45).sub(duro), float(0.45).add(duro), spec0).mul(step(0.0, dot(nM, lM)))
        .mul(smoothstep(concorda.sub(0.08), concorda, dot(nMiudo, nM)))
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
  // DoubleSide: o modelo esculpido dizimado tem fendas (no leão, ~22 mil arestas sem vizinha mesmo soldando os
  // vértices iguais); de um só lado, cada fenda deixava passar o céu e a cal do fundo em pingos claros. Dos dois
  // lados, a fenda mostra o avesso do próprio ferro, com a mesma luz
  const m = new THREE.MeshToonMaterial({ color: hex, gradientMap: gradienteToon(), side: THREE.DoubleSide })
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uMetalBrilho = uMetal.brilho
    sh.uniforms.uMetalDuro = uMetal.duro
    sh.uniforms.uMetalRim = uMetal.rim
    sh.uniforms.uMetalCorRim = uMetal.corRim
    sh.uniforms.uMetalCeu = uMetal.ceu
    sh.uniforms.uMetalPonta = uMetal.ponta
    sh.uniforms.uMetalConcorda = uMetal.concorda
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aNormalForma; varying vec3 vNFormaM;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvNFormaM = normalize(mat3(modelMatrix) * aNormalForma);')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vNFormaM; uniform float uMetalBrilho; uniform float uMetalDuro; uniform float uMetalRim; uniform vec3 uMetalCorRim; uniform float uMetalCeu; uniform float uMetalPonta; uniform float uMetalConcorda;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + GLSL_METAL)
  }
  m.userData.tsl = tslMetal()
  // a borda das faixas de luz quase reta: com a pincelada do resto do jogo, o ferro curvo e cheio de calombos virava
  // camuflagem (manchas claras soltas a 5 m)
  m.userData.arcPincel = uMetal.pincel
  pintar(m, 'metal-pintado')
  return texturizar(m, { topo: 'pedra', lado: 'pedra', tam: 0.35, contraste: 0.5, massa: 0.4 })
}
