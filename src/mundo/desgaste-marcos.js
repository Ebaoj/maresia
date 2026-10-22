// Cal caída dos marcos de 1932 (a velha Sé, a Estação): a regra do reboco caído das casas (desgaste.js, passo 5)
// medida em metros e presa à forma do prédio, não ao tamanho da parede.
//
// Nas casas a chance de uma placa cair é a mesma em qualquer altura acima de 4,5 m: numa parede de 3 m não aparece,
// mas na fachada de 22 x 30 m da Sé e nas quinas das torres virava tijolo à mostra por toda parte (22/10/2026).
// O conceito (marcos-1932-pesquisa/conceitos/se-velha.png) mostra a caiação gasta com poucas placas, quase todas
// embaixo e nas quinas. Aqui:
//   - o tamanho da placa é cfg.mundo.marcosNorte.cascaTam (m), na coordenada ao longo da própria parede (a posição
//     local da peça), não em x + z do mundo (que na parede a 45 graus vira listra)
//   - a chance é cheia até cascaBaixa (m) acima do chão do marco e some até cascaAlta; nas quinas verticais de cada
//     peça (faixa de cascaQuina m) é um pouco maior e só some em cascaQuinaAlta: a área descascada não cresce com a
//     altura da parede, e o alto das torres fica caiado
//   - a placa tem duas camadas: perdida a cal, aparece o reboco grosso (cal velha, como no conceito); o tijolo e a
//     pedra só no miolo das maiores (cascaFundo)
// As casas não passam por aqui: o código entra só no material dos marcos (define CASCA_MARCO no GLSL; no TSL, o
// objeto `marco` de envelhecerTsl), e o programa das casas fica o mesmo.
//
// A quina vem da geometria: obra1932.js grava em cada vértice do reboco a caixa da peça (aCaixa = x0, z0, x1, z1 no
// referencial do marco); o fragmento mede a distância até a borda vertical da face em que está.

import * as THREE from 'three'
import { CAL } from '../paleta.js'
import { ref } from '../render/gpu/comum.js'

// os mesmos objetos nos dois renderizadores; marcos-norte.js copia do cfg a cada quadro
export const uCasca = {
  tam: { value: 1.1 },
  lim: { value: 0.69 },
  baixa: { value: 2.2 },
  alta: { value: 6 },
  quina: { value: 0.7 },
  quinaAlta: { value: 10 },
  fundo: { value: 0.07 },
  ocre: { value: new THREE.Color(CAL.calVelha) },
}

export function sincronizarCasca(c) {
  uCasca.tam.value = c.cascaTam
  uCasca.lim.value = c.cascaLim
  uCasca.baixa.value = c.cascaBaixa
  uCasca.alta.value = Math.max(c.cascaAlta, c.cascaBaixa + 0.01)
  uCasca.quina.value = c.cascaQuina
  uCasca.quinaAlta.value = Math.max(c.cascaQuinaAlta, c.cascaBaixa + 0.01)
  uCasca.fundo.value = c.cascaFundo
}

// ---- GLSL: vai depois de ruidoQ e antes de GLSL_DESGASTE (lê vNormalQ, vLocalQ, vCaixaQ do material) ----
export const GLSL_CASCA_MARCO = /* glsl */ `
#define CASCA_MARCO
uniform float uCascaTam; uniform float uCascaLim; uniform float uCascaBaixa; uniform float uCascaAlta;
uniform float uCascaQuina; uniform float uCascaQuinaAlta; uniform float uCascaFundo; uniform vec3 uCascaOcre;
// a coordenada ao longo da parede e a distância (m) até a quina vertical mais perto da face
float cascaUM() { return abs(vNormalQ.z) >= abs(vNormalQ.x) ? vLocalQ.x : vLocalQ.z; }
float cascaQuinaM() {
  bool frente = abs(vNormalQ.z) >= abs(vNormalQ.x);
  float a = frente ? vLocalQ.x : vLocalQ.z;
  float a0 = frente ? vCaixaQ.x : vCaixaQ.y;
  float a1 = frente ? vCaixaQ.z : vCaixaQ.w;
  return max(0.0, min(a - a0, a1 - a));
}
float ruidoCascaM(float u, float h) {
  vec2 p = vec2(u, h * 1.15) / max(uCascaTam, 0.05);
  return ruidoQ(p + 31.0) * 0.78 + ruidoQ(p * 2.7 + 41.0) * 0.22;
}
float limCascaM(float h, float dq) {
  float quina = 1.0 - smoothstep(0.1, max(uCascaQuina, 0.11), dq);
  float sobe = mix(smoothstep(uCascaBaixa, uCascaAlta, h), smoothstep(uCascaBaixa, uCascaQuinaAlta, h), quina);
  return uCascaLim - 0.06 * quina + (1.1 - uCascaLim) * sobe;
}
`

// os uniforms do GLSL acima, num shader do three
export function ligarCascaGlsl(sh) {
  const u = uCasca
  Object.assign(sh.uniforms, {
    uCascaTam: u.tam, uCascaLim: u.lim, uCascaBaixa: u.baixa, uCascaAlta: u.alta,
    uCascaQuina: u.quina, uCascaQuinaAlta: u.quinaAlta, uCascaFundo: u.fundo, uCascaOcre: u.ocre,
  })
}

// ---- TSL: as mesmas contas. v = { normal, local, caixa } (varyings do material); devolve o objeto `marco` de
// envelhecerTsl: { uM, ruido(h), lim(h), fundo, ocre } ----
export function cascaMarcoTsl(W, ruidoQ, v, hq) {
  const { vec2, float, abs, max, min, mix, smoothstep, select } = W
  const frente = abs(v.normal.z).greaterThanEqual(abs(v.normal.x))
  const uM = select(frente, v.local.x, v.local.z)
  const a0 = select(frente, v.caixa.x, v.caixa.y)
  const a1 = select(frente, v.caixa.z, v.caixa.w)
  const dq = max(float(0.0), min(uM.sub(a0), a1.sub(uM)))
  const tam = max(ref(uCasca.tam), 0.05)
  const ruido = (h) => {
    const p = vec2(uM, h.mul(1.15)).div(tam)
    return ruidoQ(p.add(31.0)).mul(0.78).add(ruidoQ(p.mul(2.7).add(41.0)).mul(0.22))
  }
  const quina = float(1.0).sub(smoothstep(0.1, max(ref(uCasca.quina), 0.11), dq))
  const baixa = ref(uCasca.baixa)
  const sobe = mix(smoothstep(baixa, ref(uCasca.alta), hq), smoothstep(baixa, ref(uCasca.quinaAlta), hq), quina)
  const limB = ref(uCasca.lim)
  const lim = limB.sub(quina.mul(0.06)).add(float(1.1).sub(limB).mul(sobe))
  return { uM, ruido, lim, fundo: ref(uCasca.fundo), ocre: ref(uCasca.ocre) }
}
