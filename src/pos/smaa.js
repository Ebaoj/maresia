// Antisserrilhado SMAA 1x (27/10/2026, visual/correcoes; docs/relatorio-visual.md 2.2). A cena não tinha nenhum: a
// estabilização no tempo (sem tremor de subpixel) segura o que vai e volta, mas não a escada parada das quinas, beirais,
// fios e silhuetas. Fica depois da estabilização e antes do desfoque e da pincelada (que passam a pintar uma imagem já
// sem escada), e antes do grão e do papel (que ele borraria).
//
// O SMAA do three (SMAAPass) supõe a cor já em gama e mistura o alfa. Aqui a cor é linear (HDR em meio float) e o
// alfa guarda o peso do traço (0,5 jogador, 0,85 gente, 1 cenário). Então: as texturas de área e de busca e o passe
// de pesos são os do three; a detecção de borda e a mistura são daqui, as duas em raiz quadrada da cor (perto do que o
// olho vê; em linear a borda escura passava abaixo do limiar) e com o alfa do próprio pixel, sem mistura.
// O caminho WebGPU (smaa-gpu.js) faz a mesma conta com o SMAANode do three. cfg.estilo.smaa liga e desliga.

import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js'
import { SMAAEdgesShader, SMAABlendShader } from 'three/addons/shaders/SMAAShader.js'

// limiar da borda na raiz da cor (o 0,1 do SMAA, que é sobre a cor em gama)
export const LIMIAR_SMAA = 0.1

const fragBorda = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uLimiar;
varying vec2 vUv;
varying vec4 vOffset[3];
vec3 enc(vec2 q) { return sqrt(max(texture2D(tDiffuse, q).rgb, 0.0)); }
float dmax(vec3 a, vec3 b) { vec3 t = abs(a - b); return max(max(t.r, t.g), t.b); }
void main() {
  vec3 C = enc(vUv);
  vec4 delta;
  delta.x = dmax(C, enc(vOffset[0].xy));
  delta.y = dmax(C, enc(vOffset[0].zw));
  vec2 bordas = step(vec2(uLimiar), delta.xy);
  if (dot(bordas, vec2(1.0)) == 0.0) { gl_FragColor = vec4(0.0); return; }
  delta.z = dmax(C, enc(vOffset[1].xy));
  delta.w = dmax(C, enc(vOffset[1].zw));
  float maxDelta = max(max(max(delta.x, delta.y), delta.z), delta.w);
  delta.z = dmax(C, enc(vOffset[2].xy));
  delta.w = dmax(C, enc(vOffset[2].zw));
  maxDelta = max(max(maxDelta, delta.z), delta.w);
  // adaptação ao contraste local (SMAA_LOCAL_CONTRAST_ADAPTATION_FACTOR 2): a borda fraca ao lado de uma forte sai
  bordas *= step(0.5 * maxDelta, delta.xy);
  gl_FragColor = vec4(bordas, 0.0, 0.0);
}`

const fragMistura = /* glsl */ `
uniform sampler2D tDiffuse;
uniform sampler2D tColor;
uniform vec2 resolution;
varying vec2 vUv;
varying vec4 vOffset[2];
void main() {
  vec4 C = texture2D(tColor, vUv);
  vec4 a;
  a.xz = texture2D(tDiffuse, vUv).xz;
  a.y = texture2D(tDiffuse, vOffset[1].zw).g;
  a.w = texture2D(tDiffuse, vOffset[1].xy).a;
  if (dot(a, vec4(1.0)) < 1e-5) { gl_FragColor = C; return; }
  vec2 d;
  d.x = a.a > a.b ? a.a : -a.b;
  d.y = a.g > a.r ? -a.g : a.r;
  if (abs(d.x) > abs(d.y)) d.y = 0.0; else d.x = 0.0;
  vec3 Cop = texture2D(tColor, vUv + sign(d) * resolution).rgb;
  float s = max(abs(d.x), abs(d.y));
  vec3 m = mix(sqrt(max(C.rgb, 0.0)), sqrt(max(Cop, 0.0)), s);
  // o alfa (peso do traço) é o do próprio pixel: a média faria a borda do jogador virar "gente"
  gl_FragColor = vec4(m * m, C.a);
}`

export class SmaaWebgl {
  constructor(THREE) {
    // do three: as texturas de área e de busca, o passe de pesos e os alvos de borda e de pesos
    this.smaa = new SMAAPass()
    const opc = { type: THREE.HalfFloatType, depthBuffer: false }
    this.rt = new THREE.WebGLRenderTarget(1, 1, opc)
    this.uBorda = { tDiffuse: { value: null }, resolution: { value: new THREE.Vector2(1, 1) }, uLimiar: { value: LIMIAR_SMAA } }
    this.uMistura = { tDiffuse: { value: this.smaa._weightsRT.texture }, tColor: { value: null }, resolution: this.uBorda.resolution }
    const sem = { depthTest: false, depthWrite: false }
    this.matBorda = new THREE.ShaderMaterial({ uniforms: this.uBorda, vertexShader: SMAAEdgesShader.vertexShader, fragmentShader: fragBorda, ...sem })
    this.matMistura = new THREE.ShaderMaterial({ uniforms: this.uMistura, vertexShader: SMAABlendShader.vertexShader, fragmentShader: fragMistura, ...sem })
    this.smaa._materialWeights.depthTest = false
    this.smaa._materialWeights.depthWrite = false
  }

  tamanho(w, h) {
    this.smaa.setSize(w, h)
    this.rt.setSize(w, h)
    this.uBorda.resolution.value.set(1 / w, 1 / h)
  }

  // filtro.passo(material, alvo): o quad de tela cheia de quem chama
  desenhar(filtro, fonte) {
    this.uBorda.tDiffuse.value = fonte
    filtro.passo(this.matBorda, this.smaa._edgesRT)
    filtro.passo(this.smaa._materialWeights, this.smaa._weightsRT)
    this.uMistura.tColor.value = fonte
    filtro.passo(this.matMistura, this.rt)
    return this.rt.texture
  }
}
