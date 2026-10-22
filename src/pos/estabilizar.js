// Estabilização no tempo (pisca, 22/10/2026, docs/pisca-22-10.md): andando ou girando a câmera, o que é mais fino
// que um pixel (grade de sacada, quina de cornija, friso, junta do calçamento, a borda das faixas de luz) aparece num
// quadro e some no seguinte. Sem antisserrilhado nenhum na cadeia, isso piscava na tela.
//
// O passe junta a cor da cena com a do quadro anterior, trazida para o mesmo ponto do mundo pela profundidade e pelas
// duas câmeras (a deste quadro e a do anterior), como o antisserrilhado temporal (TAA), mas sem o tremor sub-pixel da
// câmera: com tremor, a profundidade de cada quadro sairia deslocada e o que a cadeia tira dela (a quina clara, a
// oclusão, o desfoque) passaria a tremer. A cor de antes é limitada à faixa das cores vizinhas deste quadro (média e
// desvio em YCoCg, "variance clipping"): o que se move de verdade (a folha, a água) não deixa rastro, e o que só
// piscava (vai e volta) fica com a média. O jogador e a gente (alfa do peso do traço abaixo de 0,95) ficam fora: eles
// andam sozinhos, a conta pela câmera não sabe onde estavam, e a mistura os borrava. A cor de antes é lida em Catmull-Rom (5 amostras bilineares) para não
// amolecer a imagem andando.
//
// Fica logo depois da cena, antes da profundidade de campo e da pincelada: elas leem a cor já estável. O alfa (peso
// do traço) sai o deste quadro. Parado, a cor de antes é igual à de agora e nada muda. Sem quadro anterior válido
// (primeiro quadro, tela redimensionada, teletransporte) sai a cor deste quadro.
//
// GLSL aqui; o mesmo em TSL em estabilizar-gpu.js, com os mesmos objetos de uniform (o painel muda os dois).

const vert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`

// pesos do Catmull-Rom em 5 amostras (Jimenez 2016, "Filmic SMAA", o canto de 4 amostras descartado)
export const GLSL_ESTABILIZAR = /* glsl */ `
uniform sampler2D tCor; uniform sampler2D tHist; uniform sampler2D tProf;
uniform mat4 uProjInv; uniform mat4 uCamMundo; uniform mat4 uVPAnterior;
uniform vec2 uTexel; uniform float uPeso; uniform float uGama; uniform float uValido;
varying vec2 vUv;
vec3 paraYCoCg(vec3 c) { return vec3(dot(c, vec3(0.25, 0.5, 0.25)), dot(c, vec3(0.5, 0.0, -0.5)), dot(c, vec3(-0.25, 0.5, -0.25))); }
vec3 deYCoCg(vec3 c) { return vec3(c.x + c.y - c.z, c.x + c.z, c.x - c.y - c.z); }
vec3 historia(vec2 q) {
  vec2 pos = q / uTexel;
  vec2 c = floor(pos - 0.5) + 0.5;
  vec2 f = pos - c;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  vec2 w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2;
  vec2 t12 = (c + w2 / w12) * uTexel;
  vec2 t0 = (c - 1.0) * uTexel;
  vec2 t3 = (c + 2.0) * uTexel;
  vec3 s = texture2D(tHist, vec2(t12.x, t0.y)).rgb * (w12.x * w0.y)
    + texture2D(tHist, vec2(t0.x, t12.y)).rgb * (w0.x * w12.y)
    + texture2D(tHist, t12).rgb * (w12.x * w12.y)
    + texture2D(tHist, vec2(t3.x, t12.y)).rgb * (w3.x * w12.y)
    + texture2D(tHist, vec2(t12.x, t3.y)).rgb * (w12.x * w3.y);
  float wt = w12.x * w0.y + w0.x * w12.y + w12.x * w12.y + w3.x * w12.y + w12.x * w3.y;
  return max(s / wt, vec3(0.0));
}
void main() {
  vec4 c = texture2D(tCor, vUv);
  // vizinhança em cruz (o pixel e os 4 do lado): metade das leituras de um 3 x 3, quase o mesmo resultado
  vec3 m1 = paraYCoCg(c.rgb), m2 = m1 * m1;
  float aMin = c.a;
  for (int k = 0; k < 4; k++) {
    vec2 o = k == 0 ? vec2(1.0, 0.0) : (k == 1 ? vec2(-1.0, 0.0) : (k == 2 ? vec2(0.0, 1.0) : vec2(0.0, -1.0)));
    vec4 v4 = texture2D(tCor, vUv + o * uTexel);
    vec3 s = paraYCoCg(v4.rgb);
    m1 += s; m2 += s * s;
    aMin = min(aMin, v4.a);
  }
  // personagem (alfa 0,5) e gente (0,85) se mexem sozinhos: a conta da câmera não acha onde eles estavam, e a cor de
  // antes os borrava; neles e na borda deles fica só a cor deste quadro
  float parado = step(0.95, aMin);
  m1 /= 5.0;
  vec3 sig = sqrt(max(m2 / 5.0 - m1 * m1, 0.0));
  // o ponto do mundo deste pixel, na tela do quadro anterior
  float d = texture2D(tProf, vUv).x;
  vec4 v = uProjInv * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vec4 pa = uVPAnterior * (uCamMundo * vec4(v.xyz / v.w, 1.0));
  vec2 qa = pa.xy / pa.w * 0.5 + 0.5;
  float vale = step(0.0, qa.x) * step(qa.x, 1.0) * step(0.0, qa.y) * step(qa.y, 1.0) * step(0.0, pa.w) * uValido;
  vec3 h = paraYCoCg(historia(qa));
  vec3 centro = m1, meia = sig * uGama + 1e-5;
  vec3 u = (h - centro) / meia;
  float mx = max(abs(u.x), max(abs(u.y), abs(u.z)));
  if (mx > 1.0) h = centro + (h - centro) / mx;
  gl_FragColor = vec4(mix(c.rgb, deYCoCg(h), uPeso * vale * parado), c.a);
}`

export function uniformsEstabilizar(THREE) {
  return {
    tCor: { value: null }, tHist: { value: null }, tProf: { value: null },
    uProjInv: { value: new THREE.Matrix4() }, uCamMundo: { value: new THREE.Matrix4() }, uVPAnterior: { value: new THREE.Matrix4() },
    uTexel: { value: new THREE.Vector2(1, 1) }, uPeso: { value: 0.85 }, uGama: { value: 1.25 }, uValido: { value: 0 },
  }
}

// Estado da câmera entre quadros: a matriz de vista e projeção do quadro anterior e se ela vale para este.
// Teletransporte (a câmera andou mais que `salto` metros num quadro) ou tamanho novo: a cor de antes não serve.
export function criarEstadoEstabilizar() {
  return { vp: null, pos: null, tam: '', quadros: 0 }
}

// Chamado uma vez por quadro, antes do passe: copia os valores do cfg e da câmera nos uniforms. Devolve se o passe
// roda neste quadro. `THREE` só para as matrizes temporárias.
export function atualizarEstabilizar(u, estado, e, cam, w, h, THREE, salto = 3) {
  const peso = Math.min(0.97, Math.max(0, e.estabilizar ?? 0))
  if (peso <= 0.001) { estado.vp = null; return false }
  u.uPeso.value = peso
  u.uGama.value = Math.max(0.25, e.estabilizarGama ?? 1.25)
  u.uTexel.value.set(1 / w, 1 / h)
  // a câmera deste quadro: o three só refaz a matriz de mundo dela dentro do render(), depois daqui; sem isto a cor
  // de antes vinha deslocada um quadro inteiro de movimento e a imagem amolecia andando
  cam.updateMatrixWorld()
  u.uProjInv.value.copy(cam.projectionMatrixInverse)
  u.uCamMundo.value.copy(cam.matrixWorld)
  const tam = w + 'x' + h
  const pos = cam.getWorldPosition(new THREE.Vector3())
  const valido = estado.vp !== null && estado.tam === tam && estado.pos.distanceTo(pos) < salto
  u.uValido.value = valido ? 1 : 0
  if (estado.vp) u.uVPAnterior.value.copy(estado.vp)
  const vista = (estado.vista ||= new THREE.Matrix4()).copy(cam.matrixWorld).invert()
  estado.vp = (estado.vp || new THREE.Matrix4()).multiplyMatrices(cam.projectionMatrix, vista)
  estado.pos = pos
  estado.tam = tam
  estado.quadros++
  return true
}

// Os passes do WebGL: dois alvos em vaivém (o que se escreve agora e o do quadro anterior)
export class EstabilizarWebgl {
  constructor(THREE, u) {
    this.u = u
    const opc = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }
    this.rt = [new THREE.WebGLRenderTarget(1, 1, opc), new THREE.WebGLRenderTarget(1, 1, opc)]
    this.atual = 0
    this.mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: vert, fragmentShader: GLSL_ESTABILIZAR, depthTest: false, depthWrite: false })
  }

  tamanho(w, h) { for (const r of this.rt) r.setSize(w, h) }

  desenhar(filtro, fonte, prof) {
    const alvo = this.rt[this.atual]
    this.u.tCor.value = fonte
    this.u.tProf.value = prof
    this.u.tHist.value = this.rt[1 - this.atual].texture
    filtro.passo(this.mat, alvo)
    this.atual = 1 - this.atual
    return alvo.texture
  }
}
