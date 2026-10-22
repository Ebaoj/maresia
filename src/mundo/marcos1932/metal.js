// O metal das esculturas da Praça dos Leões (ferro fundido de Val d'Osne e o bronze do General): o toon pintado do
// jogo (as três faixas de luz do pintar()), com o que falta para um valor escuro ler como forma esculpida:
//   - as faixas com os próprios níveis (metalNivel*): com a sombra do jogo, o ferro sem sol virava breu sem volume
//   - a luz do sol pela forma grande (metalFormaLuz): a normal da luz puxada para a aNormalForma (normais-suaves.js)
//   - a cavidade (metalCavidade) e o gasto (metalGasto): a curvatura de cada vértice, calculada uma vez quando o
//     modelo carrega (aCurva), escurece o fundo das dobras e clareia as cristas, como a pátina no bronze
//   - depois das faixas, a luz própria do metal: o realce recortado onde a forma vira para o sol, mais nas cristas
//     (só onde o sol chega de fato, pela luz recebida: na sombra de uma árvore não acende), a borda fria do céu nas
//     faces de cima e, no lado da sombra, o céu frio no que olha para cima e o chão quente no que olha para baixo
// Igual no WebGL (GLSL antes do pintar; a luz própria entra antes do aomap_fragment, depois das faixas) e no WebGPU
// (TSL em userData.tsl: normal, cor e luz, lidos por render/arcane-tsl.js). A segunda saída (gLuz) continua a do
// pintar nos dois: a luz própria do metal não soma nela.
// Os números ficam em cfg.marcos (metal*, corRimCeu, corRealce) e mudam ao vivo, menos a forma (metalSuave,
// metalBrilhoForma), que sai uma vez quando o modelo carrega.
// Sem camuflagem (22/10/2026): o realce e a borda do céu leem a normal da forma grande, com expoente alto
// (metalPonta) e só onde a normal miúda concorda com ela (metalConcorda); a borda das faixas leva pincelada própria,
// quase reta (metalPincel).

import * as THREE from 'three'
import { pintar, gradienteToon, texturizar } from '../../materiais.js'
import { globais } from '../../globais.js'
import { ref } from '../../render/gpu/comum.js'

// os uniforms são os mesmos objetos nos dois renderizadores (ref liga o TSL a eles)
export const uMetal = {
  brilho: { value: 1.2 },
  duro: { value: 0.04 },
  rim: { value: 0.45 },
  corRim: { value: new THREE.Color('#9cc0e0') },
  corRealce: { value: new THREE.Color('#e8d2a6') },
  corPatina: { value: new THREE.Color('#5e8a6e') }, // o matiz da pátina guardada no fundo das dobras (só o matiz, pela metade)
  ceu: { value: 0.7 },
  pincel: { value: 0.06 }, // a pincelada da borda das faixas só no metal (materiais.js, pintar: userData.arcPincel)
  ponta: { value: 25 }, // o expoente do realce: alto = um ponto pequeno no alto do volume, não uma placa clara
  concorda: { value: 0.9 }, // o realce só onde o relevo miúdo concorda com a forma (sem pingo no fundo da juba); 0 desliga
  chao: { value: 0.5 }, // a luz quente que o chão devolve nas faces de baixo, no lado da sombra (a cor do rebote dos marcos)
  corChao: { value: new THREE.Color('#ffc98a') },
  modela: { value: 0.55 }, // o volume dentro da faixa de luz: clareia o plano virado para o sol e escurece o que vira de lado (forma grande)
  crista: { value: 1.0 }, // quanto o realce prefere as cristas (curvatura convexa): 0 = em toda a forma virada para o sol
  formaLuz: { value: 0.6 }, // quanto a luz do sol lê a normal da forma grande (aNormalForma) em vez da do relevo
  niveis: { value: new THREE.Vector3(0.55, 1.2, 1.45) }, // força da sombra, do meio-tom e da luz só no metal (pintar: userData.arcNiveis)
  cavidade: { value: 0.45 }, // quanto o fundo das dobras escurece (aCurva > 0)
  gasto: { value: 0.35 }, // quanto as cristas clareiam (aCurva < 0)
  curva: { value: new THREE.Vector4(0.02, 0.1, 0.06, 0.14) }, // onde a cavidade começa e satura; idem a crista (frações do raio)
}

export function sincronizarMetal(cfg) {
  const m = cfg.marcos
  uMetal.brilho.value = m.metalBrilho
  uMetal.duro.value = m.metalDuro
  uMetal.rim.value = m.metalRim
  uMetal.corRim.value.set(m.corRimCeu)
  uMetal.corRealce.value.set(m.corRealce)
  uMetal.corPatina.value.set(m.corPatina)
  uMetal.ceu.value = m.metalCeu
  uMetal.pincel.value = m.metalPincel
  uMetal.ponta.value = m.metalPonta
  uMetal.concorda.value = m.metalConcorda
  uMetal.crista.value = m.metalCrista
  uMetal.modela.value = m.metalModela
  uMetal.chao.value = m.metalChao
  uMetal.corChao.value.set(m.corRebote)
  uMetal.formaLuz.value = m.metalFormaLuz
  uMetal.niveis.value.set(m.metalNivelSombra, m.metalNivelMeio, m.metalNivelLuz)
  uMetal.cavidade.value = m.metalCavidade
  uMetal.gasto.value = m.metalGasto
  uMetal.curva.value.set(m.metalCavIni, m.metalCavFim, m.metalCristaIni, m.metalCristaFim)
}

const DECL_METAL = 'varying vec3 vNFormaM; varying float vCurvaM; vec3 nLuzMetal;\n' +
  ['Brilho', 'Duro', 'Rim', 'Ceu', 'Ponta', 'Concorda', 'Crista', 'Modela', 'Chao', 'FormaLuz', 'Cavidade', 'Gasto'].map((k) => `uniform float uMetal${k};`).join(' ') +
  ' uniform vec3 uMetalCorRim; uniform vec3 uMetalCorRealce; uniform vec3 uMetalCorPatina; uniform vec3 uMetalCorChao; uniform vec4 uMetalCurva;'

// a cor: o fundo das dobras escurece e a crista clareia (antes das faixas: a luz recebida, gLuz, não muda)
const GLSL_COR = /* glsl */ `
  {
    float cavC = smoothstep(uMetalCurva.x, uMetalCurva.y, vCurvaM);
    float criC = smoothstep(uMetalCurva.z, uMetalCurva.w, -vCurvaM);
    vec3 patC = uMetalCorPatina / max(dot(uMetalCorPatina, vec3(0.299, 0.587, 0.114)), 1e-3);
    diffuseColor.rgb *= (1.0 - uMetalCavidade * cavC) * mix(vec3(1.0), patC, 0.5 * cavC) * (1.0 + uMetalGasto * criC);
  }
`

// a luz do sol pela forma: o mesmo RE_Direct do toon, com a normal puxada para a da forma grande (nLuzMetal, escrita
// no main depois do normal_fragment_maps). A luz do céu (hemisfério) continua na normal da geometria, como no WebGPU,
// onde a normal própria do material (userData.tsl.normal) só entra na luz direta (arcane-tsl.js, direct)
const GLSL_LUZ_FORMA = /* glsl */ `
void RE_Direct_Metal(const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight) {
  vec3 irradiance = getGradientIrradiance(nLuzMetal, directLight.direction) * directLight.color;
  reflectedLight.directDiffuse += irradiance * BRDF_Lambert(material.diffuseColor);
}
#undef RE_Direct
#define RE_Direct RE_Direct_Metal
`

// a luz própria do metal, depois das faixas do pintar (gLuz.r já tem a luz recebida, com a sombra projetada)
const GLSL_LUZ = /* glsl */ `
  {
    vec3 nM = normalize(vNFormaM); // a normal da forma grande (normais-suaves.js): um brilho por volume, não um por calombo
    vec3 vM = normalize(cameraPosition - vPMundo);
    vec3 lM = normalize(uSolDirA);
    float diaM = smoothstep(-0.02, 0.15, lM.y);
    // onde o sol chega de fato: acima da faixa de sombra do pintor (na sombra da árvore ou do próprio corpo, não). A face
    // vertical ao sol da manhã fica no meio-tom (luz recebida ~0,5), não na faixa de luz: o limite é o da sombra
    float solM = smoothstep(uArcLim.x, uArcLim.x + 0.12, gLuz.r);
    float abertoM = 1.0 - uMetalCavidade * smoothstep(uMetalCurva.x, uMetalCurva.y, vCurvaM); // o fundo da dobra não vê o céu
    float criM = smoothstep(uMetalCurva.z, uMetalCurva.w, -vCurvaM);
    float specM = pow(max(dot(nM, normalize(lM + vM)), 0.0), uMetalPonta);
    specM = smoothstep(0.45 - uMetalDuro, 0.45 + uMetalDuro, specM) * step(0.0, dot(nM, lM));
    // no fundo da juba e nos calombos a normal miúda vira para outro lado: ali o realce apagava em pingos soltos
    specM *= smoothstep(uMetalConcorda - 0.08, uMetalConcorda, dot(normalize(vNMundo), nM));
    // o realce segue a forma: mais na crista do músculo e da escama, menos no plano largo (a placa clara do tigre)
    specM *= solM * abertoM * mix(1.0, criM, uMetalCrista);
    float fresM = pow(1.0 - clamp(dot(nM, vM), 0.0, 1.0), 3.0) * smoothstep(-0.2, 0.7, nM.y) * abertoM;
    // no lado da sombra (o ferro escuro virava silhueta): o céu frio no que olha para cima, o chão quente no que olha
    // para baixo; a passagem entre os dois desenha o volume da forma grande
    float ceuM = smoothstep(-0.6, 0.9, nM.y) * (1.0 - solM) * abertoM;
    float chaoM = (1.0 - smoothstep(-0.8, 0.1, nM.y)) * (1.0 - solM) * abertoM;
    // o volume dentro da luz: a faixa de luz do pintor é chapada; aqui o plano que encara o sol sobe e o que vira de
    // lado desce, pela forma grande (o músculo lê como volume, não como recorte)
    float modM = (smoothstep(0.0, 0.9, dot(nM, lM)) * 2.0 - 1.0) * uMetalModela * solM;
    reflectedLight.directDiffuse += (uMetalCorRealce * specM * uMetalBrilho + uMetalCorRim * fresM * uMetalRim
      + diffuseColor.rgb * RECIPROCAL_PI * uLuzRef * (uMetalCorRim * ceuM * uMetalCeu + uMetalCorChao * chaoM * uMetalChao + modM)) * diaM;
  }
`

function tslMetal() {
  const curva = (W) => {
    const c = W.attribute('aCurva', 'float')
    const u = ref(uMetal.curva)
    return { cav: W.smoothstep(u.x, u.y, c), cri: W.smoothstep(u.z, u.w, c.negate()) }
  }
  const nForma = (W) => W.normalize(W.modelWorldMatrix.mul(W.vec4(W.attribute('aNormalForma', 'vec3'), 0.0)).xyz)
  return {
    nome: 'metal-pintado',
    // a normal da luz do sol (vista): a do relevo puxada para a da forma grande; dos dois lados (DoubleSide)
    normal({ W }) {
      const { normalize, mix, normalView, faceDirection, vec4 } = W
      const nFormaVista = normalize(W.cameraViewMatrix.mul(vec4(nForma(W), 0.0)).xyz)
      return normalize(mix(normalView, nFormaVista, ref(uMetal.formaLuz))).mul(faceDirection)
    },
    cor({ W }, rgb) {
      const { cav, cri } = curva(W)
      const pat = ref(uMetal.corPatina)
      const patN = pat.div(W.max(W.dot(pat, W.vec3(0.299, 0.587, 0.114)), 1e-3))
      return rgb.mul(W.float(1.0).sub(ref(uMetal.cavidade).mul(cav))).mul(W.mix(W.vec3(1.0), patN, cav.mul(0.5)))
        .mul(W.float(1.0).add(ref(uMetal.gasto).mul(cri)))
    },
    luz({ W, lumA, albedo }) {
      const { normalize, positionWorld, cameraPosition, pow, max, dot, smoothstep, step, clamp, float, mix } = W
      const nM = nForma(W)
      const vM = normalize(cameraPosition.sub(positionWorld))
      const lM = normalize(ref(globais.uSolDir))
      const dia = smoothstep(-0.02, 0.15, lM.y)
      const limS = ref(globais.uArcLim).x
      const sol = smoothstep(limS, limS.add(0.12), lumA)
      const { cav, cri } = curva(W)
      const aberto = float(1.0).sub(ref(uMetal.cavidade).mul(cav))
      const duro = ref(uMetal.duro)
      const spec0 = pow(max(dot(nM, normalize(lM.add(vM))), 0.0), ref(uMetal.ponta))
      const concorda = ref(uMetal.concorda)
      const nMiudo = normalize(W.varyingProperty('vec3', 'vNMundo'))
      const spec = smoothstep(float(0.45).sub(duro), float(0.45).add(duro), spec0).mul(step(0.0, dot(nM, lM)))
        .mul(smoothstep(concorda.sub(0.08), concorda, dot(nMiudo, nM)))
        .mul(sol).mul(aberto).mul(mix(float(1.0), cri, ref(uMetal.crista)))
      const fres = pow(float(1.0).sub(clamp(dot(nM, vM), 0.0, 1.0)), 3.0).mul(smoothstep(-0.2, 0.7, nM.y)).mul(aberto)
      const ceu = smoothstep(-0.6, 0.9, nM.y).mul(float(1.0).sub(sol)).mul(aberto)
      const chao = float(1.0).sub(smoothstep(-0.8, 0.1, nM.y)).mul(float(1.0).sub(sol)).mul(aberto)
      const mod = smoothstep(0.0, 0.9, dot(nM, lM)).mul(2.0).sub(1.0).mul(ref(uMetal.modela)).mul(sol)
      const luz = ref(uMetal.corRealce).mul(spec).mul(ref(uMetal.brilho)).add(ref(uMetal.corRim).mul(fres).mul(ref(uMetal.rim)))
        .add(albedo.mul(ref(globais.uLuzRef)).mul(ref(uMetal.corRim).mul(ceu).mul(ref(uMetal.ceu)).add(ref(uMetal.corChao).mul(chao).mul(ref(uMetal.chao))).add(mod)))
      return { luz: luz.mul(dia), gLuz: float(0.0) }
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
    const nomes = { Brilho: 'brilho', Duro: 'duro', Rim: 'rim', Ceu: 'ceu', Ponta: 'ponta', Concorda: 'concorda', Crista: 'crista', Modela: 'modela', Chao: 'chao', CorChao: 'corChao',
      FormaLuz: 'formaLuz', Cavidade: 'cavidade', Gasto: 'gasto', CorRim: 'corRim', CorRealce: 'corRealce', CorPatina: 'corPatina', Curva: 'curva' }
    for (const [k, v] of Object.entries(nomes)) sh.uniforms['uMetal' + k] = uMetal[v]
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aNormalForma; attribute float aCurva; varying vec3 vNFormaM; varying float vCurvaM;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvNFormaM = normalize(mat3(modelMatrix) * aNormalForma);\nvCurvaM = aCurva;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + DECL_METAL)
      .replace('#include <lights_toon_pars_fragment>', '#include <lights_toon_pars_fragment>\n' + GLSL_LUZ_FORMA)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnLuzMetal = normalize(mix(normal, normalize((viewMatrix * vec4(vNFormaM, 0.0)).xyz) * faceDirection, uMetalFormaLuz));')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + GLSL_COR)
      .replace('#include <aomap_fragment>', GLSL_LUZ + '\n#include <aomap_fragment>')
  }
  m.userData.tsl = tslMetal()
  // a borda das faixas de luz quase reta: com a pincelada do resto do jogo, o ferro curvo e cheio de calombos virava
  // camuflagem (manchas claras soltas a 5 m)
  m.userData.arcPincel = uMetal.pincel
  // as três faixas com os próprios níveis: o ferro é escuro de cor, e com a sombra do jogo (0,34) o lado sem sol virava
  // uma massa preta sem volume; aqui a sombra e o meio-tom sobem e a forma lê nos três valores
  m.userData.arcNiveis = uMetal.niveis
  pintar(m, 'metal-pintado')
  return texturizar(m, { topo: 'pedra', lado: 'pedra', tam: 0.35, contraste: 0.5, massa: 0.4 })
}
