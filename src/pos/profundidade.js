// Profundidade de campo (22/10/2026, pedido do Joabe: "falta o desfoque da câmera"). Alvo: os conceitos aprovados
// (conceito-sertao/*.png e marcos-1932-pesquisa/conceitos/*.png) e o Arcane: o jogador nítido, o que está entre a
// câmera e ele (o cesto, o banco da frente) mole, e o fundo amolecendo aos poucos com a distância, sem virar mancha
// (marco a 100-300 m continua forma). Desfoque PINTADO, não fotográfico: nada de disco de lente (bokeh) nem ruído;
// é uma média em caixa que a pincelada (pintura.js) depois pinta por cima em manchas chapadas.
//
// Por que não o DepthOfFieldNode do three nem o BokehPass: os dois só existem num renderizador cada (o node no
// WebGPU, o pass no WebGL), dão desenhos diferentes (o node espalha discos de bokeh) e não sabem da cadeia do jogo
// (a pincelada, o peso do traço no alfa). Aqui as mesmas contas rodam nos dois: GLSL neste arquivo, TSL em
// profundidade-gpu.js, com os mesmos objetos de uniform (o painel muda os dois juntos).
//
// Passes, em meia resolução (um quarto dos pixels), lendo a cor e a profundidade que o filtro já tem:
//   1. prévia do fundo: cada texel junta os 4 pixels dele pesando pelo desfoque de cada um (o jogador, nítido, pesa
//      quase nada no texel que divide com o fundo) e guarda o desfoque no alfa
//   2-3. fundo borrado em cruz (horizontal, vertical): "espalhar por junção" (scatter-as-gather). Cada amostra só
//      entra se o raio DELA alcança o centro, e o raio vale o menor dos dois (o da amostra e o do centro): coisa
//      nítida (o jogador) não vaza para o fundo (sem halo em volta da silhueta) e o fundo mais longe não come a
//      borda do que está mais perto
//   4. prévia da frente: a cor do que está entre a câmera e o foco, multiplicada pela cobertura (pré-multiplicada)
//   5-6. dilatação da cobertura da frente (o raio de quem alcança cada lugar)
//   7-8. frente borrada em cruz com o raio dilatado: a borda do objeto da frente se espalha por cima do jogador,
//      como numa lente (o que está na frente cobre o que está atrás)
//   9. junção em resolução cheia: a cor nítida, o fundo borrado onde o raio passa de meio pixel e a frente por cima.
//      O alfa (peso do traço) sai o da imagem nítida.
// A posição na cadeia (antes ou depois da pincelada) é cfg.estilo.dofOrdem; decidida por A/B em
// docs/capturas/profundidade/ (ver docs/profundidade-de-campo.md).

export const AMOSTRAS = 8 // de cada lado do centro, nos borrões em cruz (17 por passe)

// ---------- as contas (as mesmas do shader; os testes usam direto) ----------

// p: saída de parametrosProfundidade. Desfoque de 0 (nítido) a 1 (raio máximo)
export function cocLonge(d, p) {
  const t = Math.min(1, Math.max(0, (d - p.longeIni) / Math.max(p.longeCheio - p.longeIni, 1)))
  return Math.min(1, Math.max(0, (1 - (1 - t) * (1 - t)) * p.longe))
}
export function cocPerto(d, p) {
  const t = Math.min(1, Math.max(0, (p.pertoIni - d) / Math.max(p.pertoIni * 0.5, 0.05)))
  return Math.min(1, Math.max(0, t * p.perto))
}

// Os números do shader a partir do cfg e do foco (m). altura = altura da imagem em pixels: o raio é dado em pixels
// de uma imagem de 720 de altura, para o desenho sair igual em qualquer resolução.
export function parametrosProfundidade(e, foco, altura) {
  const ab = Math.max(0, e.dofAbertura ?? 1)
  const raioCheio = Math.max(0, e.dofRaio ?? 8) * altura / 720
  const raioMeio = raioCheio / 2
  return {
    foco,
    longeIni: foco + Math.max(0, e.dofLongeInicio ?? 10),
    longeCheio: Math.max(foco + Math.max(0, e.dofLongeInicio ?? 10) + 1, e.dofLongeCheio ?? 900),
    longe: Math.max(0, e.dofLonge ?? 0.8) * ab,
    pertoIni: Math.max(0, foco - Math.max(0, e.dofPertoMargem ?? 1.5)),
    perto: Math.max(0, e.dofPerto ?? 0.8) * ab,
    raioCheio,
    raioMeio,
    // passo inteiro (amostra no centro do texel, sem mistura bilinear) que cobre o raio com AMOSTRAS de cada lado
    passo: Math.max(1, Math.ceil(raioMeio / AMOSTRAS)),
  }
}

// Distância do alvo no eixo da câmera (é o que a profundidade guarda, não a distância em linha reta)
export function distanciaDeVista(cam, frente, alvo) {
  return (alvo[0] - cam[0]) * frente[0] + (alvo[1] - cam[1]) * frente[1] + (alvo[2] - cam[2]) * frente[2]
}

// Foco suavizado: aproxima exponencialmente (não passa do alvo, não bombeia) e não depende do passo do quadro.
// tau = tempo (s) para andar 63% do caminho; 0 = vai direto.
export function focoSuave(atual, alvo, dt, tau) {
  if (!(dt > 0)) return atual
  if (!(tau > 0)) return alvo
  return atual + (alvo - atual) * (1 - Math.exp(-dt / tau))
}

// Um passo do autofoco: suaviza, mas nunca deixa o jogador sair da faixa nítida. A câmera pula para perto quando
// algo fica entre ela e o jogador (camera.js): com só a suavização, o jogador ficaria uns 0,3 s na zona da frente,
// borrado. atual = null (primeiro quadro) ou dt fora de 0 a 0,5 s (teleporte, pausa longa) vão direto ao alvo.
export function focoAcompanha(atual, alvo, dt, e) {
  if (atual === null || !(dt >= 0) || dt > 0.5) return alvo
  const f = focoSuave(atual, alvo, dt, e.dofFocoSuave ?? 0.35)
  const antes = Math.max(0, e.dofPertoMargem ?? 1.5) * 0.8 // o foco pode ficar até isso atrás do jogador
  const depois = Math.max(0, e.dofLongeInicio ?? 10) * 0.8 // e até isso na frente
  return Math.min(alvo + antes, Math.max(alvo - depois, f))
}

// ---------- uniforms (os mesmos objetos nos dois renderizadores) ----------

export function uniformsProfundidade(THREE) {
  const f = (v) => ({ value: v })
  const v2 = () => ({ value: new THREE.Vector2(1, 1) })
  return {
    uNear: f(0.3), uFar: f(6000), uFoco: f(6),
    uLongeIni: f(16), uLongeCheio: f(900), uLonge: f(0.8), uPertoIni: f(4.5), uPerto: f(0.8),
    uRaioCheio: f(8), uRaioMeio: f(4), uPasso: f(1),
    uTexelCheio: v2(), uTexelMeio: v2(),
    // direções dos borrões, em uv (passo * texel): uma por passe, fixas (o WebGPU monta um shader por material)
    uDirH: v2(), uDirV: v2(),
    uPertoLiga: f(1),
  }
}

// Estado do foco entre quadros (fica no objeto do filtro)
export function criarEstadoFoco() {
  return { foco: null, tempo: null, _a: [0, 0, 0], _b: [0, 0, 0], _c: [0, 0, 0] }
}

// Atualiza o foco (autofoco no jogador ou manual) e os uniforms; devolve se o efeito está ligado neste quadro.
// alvo: o ponto que a câmera segue (cam.alvo, a altura do peito do jogador); larg/alt: tamanho da imagem em pixels.
export function atualizarProfundidade(u, estado, e, camera, alvo, tempo, larg, alt) {
  const ligado = !!e.dof && (e.dofAbertura ?? 1) > 0
  let alvoFoco = e.dofFocoManual ?? 8
  if (e.dofAutoFoco !== false && alvo) {
    const c = estado._a, fr = estado._b, a = estado._c
    c[0] = camera.position.x; c[1] = camera.position.y; c[2] = camera.position.z
    const m = camera.matrixWorld.elements // a frente da câmera é -z do mundo dela
    fr[0] = -m[8]; fr[1] = -m[9]; fr[2] = -m[10]
    const n = Math.hypot(fr[0], fr[1], fr[2]) || 1
    fr[0] /= n; fr[1] /= n; fr[2] /= n
    a[0] = alvo.x; a[1] = alvo.y; a[2] = alvo.z
    alvoFoco = distanciaDeVista(c, fr, a)
  }
  alvoFoco = Math.max(camera.near + 0.1, alvoFoco + (e.dofFocoAjuste ?? 0))
  estado.foco = focoAcompanha(estado.foco, alvoFoco, estado.tempo === null ? 0 : tempo - estado.tempo, e)
  estado.tempo = tempo
  const p = parametrosProfundidade(e, estado.foco, alt)
  u.uNear.value = camera.near
  u.uFar.value = camera.far
  u.uFoco.value = p.foco
  u.uLongeIni.value = p.longeIni
  u.uLongeCheio.value = p.longeCheio
  u.uLonge.value = p.longe
  u.uPertoIni.value = p.pertoIni
  u.uPerto.value = p.perto
  u.uRaioCheio.value = p.raioCheio
  u.uRaioMeio.value = p.raioMeio
  u.uPasso.value = p.passo
  u.uTexelCheio.value.set(1 / larg, 1 / alt)
  const mw = Math.ceil(larg / 2), mh = Math.ceil(alt / 2)
  u.uTexelMeio.value.set(1 / mw, 1 / mh)
  u.uDirH.value.set(p.passo / mw, 0)
  u.uDirV.value.set(0, p.passo / mh)
  u.uPertoLiga.value = p.perto > 0.001 ? 1 : 0
  return ligado
}

// ---------- GLSL (WebGL) ----------

const vert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`

export const GLSL_COC = /* glsl */ `
uniform float uNear; uniform float uFar; uniform float uLongeIni; uniform float uLongeCheio; uniform float uLonge;
uniform float uPertoIni; uniform float uPerto;
float distDof(sampler2D prof, vec2 q) {
  float d = texture2D(prof, q).x;
  return -(uNear * uFar) / ((uFar - uNear) * d - uFar);
}
float cocLonge(float d) {
  float t = clamp((d - uLongeIni) / max(uLongeCheio - uLongeIni, 1.0), 0.0, 1.0);
  return clamp((1.0 - (1.0 - t) * (1.0 - t)) * uLonge, 0.0, 1.0);
}
float cocPerto(float d) {
  return clamp(clamp((uPertoIni - d) / max(uPertoIni * 0.5, 0.05), 0.0, 1.0) * uPerto, 0.0, 1.0);
}`

// 1 e 4: prévia (meia resolução). frente = true: a frente, pré-multiplicada; false: o fundo, com o desfoque no alfa
function fragPrevia(frente) {
  return /* glsl */ `
uniform sampler2D tCor; uniform sampler2D tProf; uniform vec2 uTexelCheio;
varying vec2 vUv;
${GLSL_COC}
void main() {
  vec3 soma = vec3(0.0); float somaW = 0.0; float mx = 0.0;
  for (int i = 0; i < 4; i++) {
    vec2 q = vUv + vec2(i == 0 || i == 2 ? -0.5 : 0.5, i < 2 ? -0.5 : 0.5) * uTexelCheio;
    float c = ${frente ? 'cocPerto' : 'cocLonge'}(distDof(tProf, q));
    float w = c + 1e-3;
    soma += texture2D(tCor, q).rgb * w; somaW += w; mx = max(mx, c);
  }
  vec3 cor = soma / somaW;
  gl_FragColor = ${frente ? 'vec4(cor * mx, mx)' : 'vec4(cor, mx)'};
}`
}

// 2-3: fundo em cruz. premult: a saída vai pré-multiplicada pelo desfoque (para a junção ignorar texel nítido)
function fragLonge(premult) {
  return /* glsl */ `
uniform sampler2D tFonte; uniform vec2 uDir; uniform float uRaioMeio; uniform float uPasso;
varying vec2 vUv;
void main() {
  vec4 c0 = texture2D(tFonte, vUv);
  float rc = c0.a * uRaioMeio;
  vec3 soma = vec3(0.0); float somaW = 0.0;
  for (int i = -${AMOSTRAS}; i <= ${AMOSTRAS}; i++) {
    float o = abs(float(i)) * uPasso;
    vec4 s = i == 0 ? c0 : texture2D(tFonte, vUv + uDir * float(i));
    float r = min(s.a * uRaioMeio, rc);
    float w = clamp(r - o + 1.0, 0.0, 1.0) / (2.0 * r + 1.0);
    soma += s.rgb * w; somaW += w;
  }
  vec3 cor = soma / max(somaW, 1e-6);
  gl_FragColor = ${premult ? 'vec4(cor * c0.a, c0.a)' : 'vec4(cor, c0.a)'};
}`
}

// 5-6: dilatação da cobertura da frente (no alfa): o maior raio que alcança este lugar
const fragDilata = /* glsl */ `
uniform sampler2D tFonte; uniform vec2 uDir; uniform float uRaioMeio; uniform float uPasso;
varying vec2 vUv;
void main() {
  float m = 0.0;
  for (int i = -${AMOSTRAS}; i <= ${AMOSTRAS}; i++) {
    float o = abs(float(i)) * uPasso;
    float s = texture2D(tFonte, vUv + uDir * float(i)).a;
    m = max(m, s * clamp(s * uRaioMeio - o + 1.0, 0.0, 1.0));
  }
  gl_FragColor = vec4(0.0, 0.0, 0.0, m);
}`

// 7-8: frente em cruz, caixa do raio dilatado, pré-multiplicada
const fragPerto = /* glsl */ `
uniform sampler2D tFonte; uniform sampler2D tDil; uniform vec2 uDir; uniform float uRaioMeio; uniform float uPasso;
varying vec2 vUv;
void main() {
  float rc = texture2D(tDil, vUv).a * uRaioMeio;
  vec4 soma = vec4(0.0); float somaW = 0.0;
  for (int i = -${AMOSTRAS}; i <= ${AMOSTRAS}; i++) {
    float w = clamp(rc - abs(float(i)) * uPasso + 1.0, 0.0, 1.0);
    soma += texture2D(tFonte, vUv + uDir * float(i)) * w; somaW += w;
  }
  gl_FragColor = soma / max(somaW, 1e-6);
}`

// 9: junção em resolução cheia
const fragJunta = /* glsl */ `
uniform sampler2D tCor; uniform sampler2D tProf; uniform sampler2D tLonge; uniform sampler2D tPerto;
uniform float uRaioCheio; uniform float uPertoLiga;
varying vec2 vUv;
${GLSL_COC}
void main() {
  vec4 base = texture2D(tCor, vUv);
  vec3 cor = base.rgb;
  float rL = cocLonge(distDof(tProf, vUv)) * uRaioCheio;
  vec4 L = texture2D(tLonge, vUv);
  // até meio pixel de raio fica a imagem nítida (a meia resolução sozinha já amoleceria)
  if (L.a > 1e-4) cor = mix(cor, L.rgb / L.a, smoothstep(0.5, 1.5, rL));
  if (uPertoLiga > 0.5) {
    vec4 P = texture2D(tPerto, vUv);
    if (P.a > 1e-4) cor = mix(cor, P.rgb / P.a, clamp(P.a * 2.0, 0.0, 1.0));
  }
  gl_FragColor = vec4(cor, base.a);
}`

// A cadeia no WebGL. desenhar(filtro, fonte, prof) usa filtro.passo (o medidor redireciona o último passe da tela
// por ele) e devolve a textura com a imagem desfocada, em resolução cheia.
export class ProfundidadeWebgl {
  constructor(THREE, u) {
    this.u = u
    const meia = { type: THREE.HalfFloatType, depthBuffer: false }
    const alvo = () => new THREE.WebGLRenderTarget(1, 1, meia)
    this.rt = { longeA: alvo(), longeB: alvo(), pertoA: alvo(), pertoB: alvo(), dilA: alvo(), dilB: alvo() }
    this.rtJunta = new THREE.WebGLRenderTarget(1, 1, meia)
    const fonte = { value: null }, prof = { value: null }
    this.fonte = fonte
    this.prof = prof
    const mat = (frag, extra) => new THREE.ShaderMaterial({
      uniforms: { ...u, ...extra }, vertexShader: vert, fragmentShader: frag, depthTest: false, depthWrite: false,
    })
    const r = this.rt
    this.matPreviaLonge = mat(fragPrevia(false), { tCor: fonte, tProf: prof })
    this.matPreviaPerto = mat(fragPrevia(true), { tCor: fonte, tProf: prof })
    this.matLongeH = mat(fragLonge(false), { tFonte: { value: r.longeA.texture }, uDir: u.uDirH })
    this.matLongeV = mat(fragLonge(true), { tFonte: { value: r.longeB.texture }, uDir: u.uDirV })
    this.matDilH = mat(fragDilata, { tFonte: { value: r.pertoA.texture }, uDir: u.uDirH })
    this.matDilV = mat(fragDilata, { tFonte: { value: r.dilA.texture }, uDir: u.uDirV })
    this.matPertoH = mat(fragPerto, { tFonte: { value: r.pertoA.texture }, tDil: { value: r.dilB.texture }, uDir: u.uDirH })
    this.matPertoV = mat(fragPerto, { tFonte: { value: r.pertoB.texture }, tDil: { value: r.dilB.texture }, uDir: u.uDirV })
    this.matJunta = mat(fragJunta, { tCor: fonte, tProf: prof, tLonge: { value: r.longeA.texture }, tPerto: { value: r.pertoA.texture } })
  }

  tamanho(w, h) {
    const mw = Math.ceil(w / 2), mh = Math.ceil(h / 2)
    for (const k in this.rt) this.rt[k].setSize(mw, mh)
    this.rtJunta.setSize(w, h)
  }

  desenhar(filtro, fonte, prof) {
    this.fonte.value = fonte
    this.prof.value = prof
    const r = this.rt
    filtro.passo(this.matPreviaLonge, r.longeA)
    filtro.passo(this.matLongeH, r.longeB)
    filtro.passo(this.matLongeV, r.longeA)
    if (this.u.uPertoLiga.value > 0.5) {
      filtro.passo(this.matPreviaPerto, r.pertoA)
      filtro.passo(this.matDilH, r.dilA)
      filtro.passo(this.matDilV, r.dilB)
      filtro.passo(this.matPertoH, r.pertoB)
      filtro.passo(this.matPertoV, r.pertoA)
    }
    filtro.passo(this.matJunta, this.rtJunta)
    return this.rtJunta.texture
  }
}
