import * as THREE from 'three'
import { globais } from './globais.js'
import { ref } from './render/gpu/comum.js'

// Toon: a luz vira poucas faixas em vez de degradê contínuo, como pintura de animação.
let _gradiente = null
// degraus do toon: 2 = luz e sombra chapadas (Messenger); 5 = o antigo. Definido uma vez no início.
const PASSOS = { 2: [0.5, 1.0], 3: [0.45, 0.75, 1.0], 5: [0.42, 0.58, 0.74, 0.9, 1.0] }
// liso: luz quase contínua; quem faz as faixas é o pintor de luz (visual Arcane), não o toon
PASSOS.liso = Array.from({ length: 32 }, (_, i) => 0.03 + (0.97 * (i + 1)) / 32)
let _tons = 5
export function definirTonsLuz(n) { _tons = PASSOS[n] ? n : 5 }

export function gradienteToon() {
  if (_gradiente) return _gradiente
  const passos = PASSOS[_tons]
  const dados = new Uint8Array(passos.map((v) => Math.round(v * 255)))
  const tex = new THREE.DataTexture(dados, passos.length, 1, THREE.RedFormat)
  tex.minFilter = THREE.NearestFilter
  tex.magFilter = THREE.NearestFilter
  tex.generateMipmaps = false
  tex.needsUpdate = true
  _gradiente = tex
  return tex
}

// Pincelada: ruído esticado em direção de pincel, projetado no mundo pelos três eixos
// (triplanar). Nenhuma superfície fica com cor chapada.
// A cena é desenhada em duas imagens de uma vez (MRT): cor e luz recebida.
export const SAIDA_LUZ = '\nlayout(location = 1) out highp vec4 gLuz;\n'

const GLSL_PINCEL = /* glsl */ `
varying vec3 vPMundo; varying vec3 vNMundo;
uniform float uPincel; uniform float uPincelEscala;
float hP(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vP(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hP(i), hP(i + vec2(1, 0)), u.x), mix(hP(i + vec2(0, 1)), hP(i + vec2(1, 1)), u.x), u.y);
}
float traco(vec2 uv) {
  return 0.55 * vP(uv * vec2(0.6, 2.8)) + 0.3 * vP(uv * vec2(1.7, 7.0) + 3.1) + 0.15 * vP(uv * vec2(5.0, 18.0) + 7.7);
}
float pincelada(vec3 p, vec3 n) {
  vec3 w = pow(abs(n), vec3(4.0));
  w /= (w.x + w.y + w.z + 1e-4);
  p *= uPincelEscala;
  return traco(p.zy) * w.x + traco(mat2(0.87, -0.5, 0.5, 0.87) * p.xz) * w.y + traco(p.xy) * w.z;
}`

export function pintar(mat, chave) {
  const anterior = mat.onBeforeCompile
  mat.onBeforeCompile = (sh, r) => {
    anterior.call(mat, sh, r)
    sh.uniforms.uPincel = globais.uPincel
    sh.uniforms.uPincelEscala = globais.uPincelEscala
    sh.uniforms.uLuzRef = globais.uLuzRef
    sh.uniforms.tLampioes = globais.tLampioes
    sh.uniforms.uLampMin = globais.uLampMin
    sh.uniforms.uLampTam = globais.uLampTam
    sh.uniforms.uCorLamp = globais.uCorLamp
    sh.uniforms.uNoiteL = globais.uNoite
    for (const k of ['uArcane', 'uArcLim', 'uArcSuave', 'uArcPincel', 'uArcCorSombra', 'uArcNiveis', 'uArcRim']) sh.uniforms[k] = globais[k]
    sh.uniforms.uSolDirA = globais.uSolDir
    const tp = mat.userData.texPintada
    if (tp) {
      sh.defines = { ...(sh.defines || {}), TEX_PINTADA: '' }
      sh.uniforms.tTexTopo = { value: tp.topo }
      sh.uniforms.tTexLado = { value: tp.lado }
      sh.uniforms.uTexTam = { value: tp.tam }
      sh.uniforms.uTexContraste = { value: tp.contraste }
      sh.uniforms.uTexMassa = { value: tp.massa }
      if (tp.alt) {
        sh.defines.TEX_PINTADA_ALT = ''
        sh.uniforms.tTexAlt = { value: tp.alt }
        sh.uniforms.uTexTamAlt = { value: tp.tamAlt }
      }
      sh.uniforms.uTexForca = globais.uTexForca
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tTexTopo; uniform sampler2D tTexLado; uniform float uTexTam; uniform float uTexForca; uniform float uTexContraste; uniform float uTexMassa;\n#ifdef TEX_PINTADA_ALT\nuniform sampler2D tTexAlt; uniform float uTexTamAlt; varying float vTexAlt;\n#endif')
    }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPMundo; varying vec3 vNMundo;\n#ifdef TEX_PINTADA_ALT\nattribute float aTexAlt; varying float vTexAlt;\n#endif')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 pmP = vec4(transformed, 1.0);
        vec3 nP = objectNormal;
        #ifdef USE_INSTANCING
          pmP = instanceMatrix * pmP;
          nP = mat3(instanceMatrix) * nP;
        #endif
        vPMundo = (modelMatrix * pmP).xyz;
        vNMundo = normalize(mat3(modelMatrix) * nP);
        #ifdef TEX_PINTADA_ALT
          vTexAlt = aTexAlt;
        #endif`
      )
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL_PINCEL + SAIDA_LUZ + 'uniform float uLuzRef;\nuniform float uArcane; uniform vec2 uArcLim; uniform float uArcSuave; uniform float uArcPincel; uniform vec3 uArcCorSombra; uniform vec3 uArcNiveis; uniform float uArcRim; uniform vec3 uSolDirA;\nuniform sampler2D tLampioes; uniform vec2 uLampMin; uniform vec2 uLampTam; uniform vec3 uCorLamp; uniform float uNoiteL;\n')
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        // lampiões a gás (cenografia.js): poça de luz quente em volta, no chão e nas paredes, à noite
        if (uNoiteL > 0.01) {
          vec2 uvL = (vPMundo.xz - uLampMin) / uLampTam;
          if (uvL.x > 0.0 && uvL.x < 1.0 && uvL.y > 0.0 && uvL.y < 1.0) {
            vec4 lamp = texture2D(tLampioes, uvL);
            float dy = vPMundo.y - lamp.g;
            float faixa = (1.0 - smoothstep(0.3, 2.5, dy)) * (1.0 - smoothstep(4.5, 7.0, -dy));
            reflectedLight.directDiffuse += material.diffuseColor * uCorLamp * min(lamp.r, 0.8) * faixa * uNoiteL * 1.5;
          }
        }
        {
          // segunda saída: quanta luz chega aqui, sem a cor do material (0 = breu, 1 = sol cheio)
          vec3 albL = max(material.diffuseColor * RECIPROCAL_PI, vec3(1e-3));
          vec3 irrL = (reflectedLight.directDiffuse + reflectedLight.indirectDiffuse) / albL;
          gLuz = vec4(dot(irrL, vec3(0.299, 0.587, 0.114)) / max(uLuzRef, 0.05), dot(totalEmissiveRadiance, vec3(0.299, 0.587, 0.114)), 0.0, 1.0);
          // PINTOR DE LUZ (visual Arcane): a luz que chega vira três faixas pintadas (sombra fria, meio-tom,
          // luz com a cor do sol ou do lampião). A borda entre elas é recortada pela pincelada presa ao mundo,
          // então anda com o objeto (filtro de tela faria "porta de box"). O resto do volume vem da cor do
          // material, como na pintura.
          if (uArcane > 0.5) {
            float lumA = gLuz.r;
            float pesoIrr = max(dot(irrL, vec3(0.299, 0.587, 0.114)), 1e-3);
            vec3 tomA = clamp(irrL / pesoIrr, 0.0, 2.0); // cor da luz (pôr do sol, lampião), sem a força
            float pinA = pincelada(vPMundo * 3.1, normalize(vNMundo)) - 0.5;
            float tA = lumA + pinA * uArcPincel;
            float sombraA = 1.0 - smoothstep(uArcLim.x - uArcSuave, uArcLim.x + uArcSuave, tA);
            float luzA = smoothstep(uArcLim.y - uArcSuave, uArcLim.y + uArcSuave, tA);
            vec3 cLuz = mix(vec3(1.0), tomA, 0.65) * uArcNiveis.z;
            vec3 cMeio = mix(vec3(1.0), tomA, 0.35) * uArcNiveis.y;
            // a sombra esfria a cor do objeto sem trocá-la: só o matiz da cor fria entra, pela metade
            // (com a cor inteira, o vermelho da camisa virava azul-marinho)
            vec3 friaA = uArcCorSombra / max(dot(uArcCorSombra, vec3(0.299, 0.587, 0.114)), 1e-3);
            vec3 cSomb = mix(vec3(1.0), friaA, 0.5) * uArcNiveis.x * mix(vec3(1.0), tomA, 0.15);
            vec3 faixa = mix(mix(cMeio, cLuz, luzA), cSomb, sombraA);
            // luz de recorte: borda quente onde a superfície olha para o sol e o sol está atrás, contra a
            // câmera (o contorno de luz que separa a figura do fundo)
            vec3 nA = normalize(vNMundo);
            vec3 vA = normalize(cameraPosition - vPMundo);
            float bordaA = pow(1.0 - clamp(abs(dot(nA, vA)), 0.0, 1.0), 3.0);
            float paraSol = smoothstep(-0.05, 0.5, dot(nA, normalize(uSolDirA)));
            float contraLuz = smoothstep(-0.4, 0.6, dot(-vA, normalize(uSolDirA)));
            faixa += mix(vec3(1.0), tomA, 0.8) * bordaA * paraSol * contraLuz * uArcRim * 1.4;
            reflectedLight.directDiffuse = material.diffuseColor * RECIPROCAL_PI * faixa * uLuzRef;
            reflectedLight.indirectDiffuse = vec3(0.0);
          }
        }`
      )
      .replace(
        '#include <normal_fragment_begin>',
        `
        #ifdef TEX_PINTADA
        {
          // textura pintada (visual Arcane): detalhe projetado no mundo pelos três eixos, que multiplica a
          // cor do material (média 1: mantém a paleta, acrescenta pincelada, desgaste e sujeira)
          vec3 nT = normalize(vNMundo);
          vec3 wT = pow(abs(nT), vec3(4.0));
          wT /= (wT.x + wT.y + wT.z + 1e-4);
          vec3 pT = vPMundo / uTexTam;
          vec3 detT = texture2D(tTexLado, pT.zy).rgb * wT.x + texture2D(tTexTopo, pT.xz).rgb * wT.y + texture2D(tTexLado, pT.xy).rgb * wT.z;
          #ifdef TEX_PINTADA_ALT
            // parte marcada na geometria (aTexAlt = 1, ex.: a vela da jangada) usa a textura alternativa
            vec3 pA = vPMundo / uTexTamAlt;
            vec3 detA = texture2D(tTexAlt, pA.zy).rgb * wT.x + texture2D(tTexAlt, pA.xz).rgb * wT.y + texture2D(tTexAlt, pA.xy).rgb * wT.z;
            detT = mix(detT, detA, step(0.5, vTexAlt));
          #endif
          // massa: a mesma textura 9 vezes maior e girada dá manchas grandes de valor (como numa pintura de
          // cenário) e esconde a repetição
          vec3 pM = vPMundo / (uTexTam * 9.0);
          vec3 macT = texture2D(tTexLado, pM.zy * mat2(0.8, -0.6, 0.6, 0.8)).rgb * wT.x + texture2D(tTexTopo, pM.xz * mat2(0.8, -0.6, 0.6, 0.8)).rgb * wT.y + texture2D(tTexLado, pM.xy * mat2(0.8, -0.6, 0.6, 0.8)).rgb * wT.z;
          float macL = dot(macT * 2.0, vec3(0.333));
          vec3 detN = 1.0 + (detT * 2.0 - 1.0) * uTexContraste;
          detN *= 1.0 + (macL - 1.0) * uTexMassa;
          diffuseColor.rgb *= mix(vec3(1.0), max(detN, vec3(0.0)), uTexForca * uArcane);
        }
        #endif
        {
          float bp = pincelada(vPMundo, normalize(vNMundo));
          diffuseColor.rgb *= 1.0 + (bp - 0.5) * uPincel;
          float tom = vP(vPMundo.xz * 0.02 + vPMundo.y * 0.013);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.07, 0.96, 1.05), (tom - 0.5) * uPincel * 1.6);
        }
        #include <normal_fragment_begin>`
      )
  }
  mat.customProgramCacheKey = () => chave
  mat.userData.luzMRT = true
  // código GLSL próprio somado antes do pintar (fachada, vento...): no WebGPU precisa da versão em TSL
  // (mat.userData.tsl), senão vai para a lista "falta portar" (render/renderizador.js)
  mat.userData.extraGlsl = anterior !== THREE.Material.prototype.onBeforeCompile
  mat.userData.obcPintar = mat.onBeforeCompile // quem trocar depois (roupa, pano) soma código ao pintar
  return mat
}

// Texturas pintadas do mundo (visual Arcane): geradas no ComfyUI, tornadas contínuas por
// arte/texturas/costurar.py e normalizadas para média 0,5 em cada canal (no shader viram média 1 e
// multiplicam a cor do material). Ficam em public/texturas/<nome>.jpg.
const _texturas = new Map()
export function texturaPintada(nome) {
  if (!_texturas.has(nome)) {
    const t = new THREE.TextureLoader().load(`/texturas/${nome}.jpg`)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.colorSpace = THREE.NoColorSpace // valores crus: é detalhe, não cor
    t.anisotropy = 4
    _texturas.set(nome, t)
  }
  return _texturas.get(nome)
}

// Liga a textura pintada num material que passa por pintar(): "topo" no que olha para cima (chão,
// telhado), "lado" nas paredes; tam = quantos metros cobre uma repetição. Chamar antes do primeiro desenho.
// contraste: quanto o detalhe da textura marca (1 = como pintada); massa: manchas grandes de valor
// alt: textura para a parte da geometria marcada com o atributo aTexAlt = 1 (ex.: a vela, no material da
// jangada inteira); tamAlt: metros por repetição dela
export function texturizar(mat, { topo, lado = topo, tam = 2, contraste = 1, massa = 0.5, alt = null, tamAlt = tam }) {
  mat.userData.texPintada = { topo: texturaPintada(topo), lado: texturaPintada(lado), tam, contraste, massa, alt: alt ? texturaPintada(alt) : null, tamAlt }
  const chave = mat.customProgramCacheKey?.() || ''
  mat.customProgramCacheKey = () => `${chave}|tex:${topo}:${lado}:${alt}`
  mat.needsUpdate = true
  return mat
}

// Materiais que não recebem luz (céu, lâmpada, serra ao fundo) gravam um valor fixo na saída de luz.
// "brilho" pode ser um uniform compartilhado (ex.: acende à noite).
export function luzFixa(mat, luz = 1, brilho = { value: 0 }) {
  const anterior = mat.onBeforeCompile
  const u = { uLuzFixa: { value: luz }, uBrilhoFixo: brilho }
  mat.onBeforeCompile = (sh, r) => {
    anterior.call(mat, sh, r)
    Object.assign(sh.uniforms, u)
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + SAIDA_LUZ + '\nuniform float uLuzFixa; uniform float uBrilhoFixo;')
      .replace('#include <opaque_fragment>', 'gLuz = vec4(uLuzFixa, uBrilhoFixo, 0.0, 1.0);\n#include <opaque_fragment>')
  }
  mat.customProgramCacheKey = () => 'luz-fixa'
  mat.userData.luzMRT = true
  mat.userData.luzFixa = u // o WebGPU escreve a mesma saída de luz com estes valores
  mat.userData.extraGlsl = anterior !== THREE.Material.prototype.onBeforeCompile
  return mat
}

const cache = new Map()
export function toon(cor, extra = {}) {
  const chave = cor + JSON.stringify(extra)
  if (!extra.semCache && cache.has(chave)) return cache.get(chave)
  const { semCache, ...resto } = extra
  const mat = pintar(new THREE.MeshToonMaterial({ color: cor, gradientMap: gradienteToon(), ...resto }), 'toon-pintado')
  if (!semCache) cache.set(chave, mat)
  return mat
}

export function toonVertice(extra = {}) {
  return pintar(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradienteToon(), ...extra }), 'toon-pintado')
}

// Prédio com fachada desenhada no shader: janela com moldura e peitoril, veneziana,
// térreo de loja, platibanda, base suja. Nada disso é geometria.
// À noite parte das janelas e das lojas acende (sorteio fixo por janela).
export function materialPredio({
  celula = [2.6, 3.0],
  margem = [0.25, 0.25],
  terreo = 0,
  vidro = '#24345e',
  telhado = '#9a8f88',
  faixa = '#ffffff',
  faixaAltura = 0.0,
  luz = '#ffcf70',
  chanceAcesa = 0.5,
  moldura = '#f4efe6',
  venezianas = 0,
  veneziana1 = '#2f7d5b',
  veneziana2 = '#2f5f9d',
  loja = 0,
  interior = '#2a2238',
  cornija = 0,
  torto = 0,
  // direção de arte de 1932 (docs/direcao-de-arte.md): janela de madeira em vez de vidro,
  // barrado colorido na base, salitre da maresia e cal descascada mostrando a taipa
  madeira = 0, // 0 = vidro; 1 = toda janela é folha de madeira (fechada, entreaberta ou aberta)
  veneziana3 = '#8a5a3c',
  barra = 0, // fração dos prédios com barrado
  desgaste = 0,
  taipa = '#b8875e',
} = {}) {
  const mat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: gradienteToon() })
  const u = {
    uCelula: { value: new THREE.Vector2(...celula) },
    uMargem: { value: new THREE.Vector2(...margem) },
    uTerreo: { value: terreo },
    uVidro: { value: new THREE.Color(vidro) },
    uTelhado: { value: new THREE.Color(telhado) },
    uFaixa: { value: new THREE.Color(faixa) },
    uFaixaAltura: { value: faixaAltura },
    uLuz: { value: new THREE.Color(luz) },
    uChance: { value: chanceAcesa },
    uMoldura: { value: new THREE.Color(moldura) },
    uVenezianas: { value: venezianas },
    uVen1: { value: new THREE.Color(veneziana1) },
    uVen2: { value: new THREE.Color(veneziana2) },
    uLoja: { value: loja },
    uInterior: { value: new THREE.Color(interior) },
    uCornija: { value: cornija },
    uTorto: { value: torto },
    uMadeira: { value: madeira },
    uVen3: { value: new THREE.Color(veneziana3) },
    uBarra: { value: barra },
    uDesgaste: { value: desgaste },
    uTaipa: { value: new THREE.Color(taipa) },
    uNoite: globais.uNoite,
  }
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u)
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vLocal; varying vec3 vNormLocal; varying vec3 vEscala; varying float vInst;
        uniform float uTorto;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vLocal = position; vNormLocal = normal;
        #ifdef USE_INSTANCING
          vEscala = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
          vInst = float(gl_InstanceID);
        #else
          vEscala = vec3(1.0); vInst = 0.0;
        #endif
        // parede levemente torta e barriguda, como feita à mão
        float incl = (fract(sin(vInst * 12.9898) * 43758.5453) - 0.5) * 2.0;
        transformed.x += incl * uTorto * transformed.y * (vEscala.y / max(vEscala.x, 0.1)) * 0.02;
        transformed.xz *= 1.0 + uTorto * 0.025 * sin(transformed.y * 3.1416);`
      )
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vLocal; varying vec3 vNormLocal; varying vec3 vEscala; varying float vInst;
        uniform vec2 uCelula; uniform vec2 uMargem; uniform float uTerreo;
        uniform vec3 uVidro; uniform vec3 uTelhado; uniform vec3 uFaixa; uniform float uFaixaAltura;
        uniform vec3 uLuz; uniform float uChance; uniform float uNoite;
        uniform vec3 uMoldura; uniform float uVenezianas; uniform vec3 uVen1; uniform vec3 uVen2;
        uniform float uLoja; uniform vec3 uInterior; uniform float uCornija;
        uniform float uMadeira; uniform vec3 uVen3; uniform float uBarra; uniform float uDesgaste; uniform vec3 uTaipa;
        float hashJanela(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
        float ruidoParede(vec2 p, float semente) {
          vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          float a = hashJanela(vec3(i, semente)), b = hashJanela(vec3(i + vec2(1.0, 0.0), semente));
          float c = hashJanela(vec3(i + vec2(0.0, 1.0), semente)), d = hashJanela(vec3(i + vec2(1.0, 1.0), semente));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float janelaLuz = 0.0;
        if (vNormLocal.y > 0.5) {
          diffuseColor.rgb = uTelhado;
        } else if (vNormLocal.y > -0.5) {
          bool ladoX = abs(vNormLocal.x) > 0.5;
          float largura = ladoX ? vEscala.z : vEscala.x;
          float u = (ladoX ? vLocal.z : vLocal.x) * largura + largura * 0.5;
          float v = vLocal.y * vEscala.y;
          float lado = ladoX ? sign(vNormLocal.x) : 2.0 * sign(vNormLocal.z);
          float inicio = max(uTerreo, uLoja);
          float colunas = max(1.0, floor(largura / uCelula.x));
          float util = max(0.5, vEscala.y - inicio - 0.7);
          float andares = max(1.0, floor(util / uCelula.y));
          vec2 g = vec2(u / (largura / colunas), (v - inicio) / (util / andares));
          vec2 f = fract(g);
          vec2 id = floor(g);
          float valido = step(0.0, g.y) * step(g.y, andares) * step(0.0, g.x) * step(g.x, colunas);
          float mx = uMargem.x;
          float my = uMargem.y;
          float topo = 1.0 - my * 0.6;
          float dentro = step(mx, f.x) * step(f.x, 1.0 - mx) * step(my, f.y) * step(f.y, topo);
          float mold = step(mx - 0.06, f.x) * step(f.x, 1.0 - mx + 0.06) * step(my - 0.05, f.y) * step(f.y, topo + 0.05);
          float peitoril = step(mx - 0.1, f.x) * step(f.x, 1.0 - mx + 0.1) * step(my - 0.1, f.y) * step(f.y, my - 0.04);
          float sombraPeitoril = step(mx - 0.1, f.x) * step(f.x, 1.0 - mx + 0.1) * step(my - 0.18, f.y) * step(f.y, my - 0.1);
          float faixa = step(f.y, uFaixaAltura) * valido;
          diffuseColor.rgb = mix(diffuseColor.rgb, uFaixa, faixa);
          diffuseColor.rgb *= 1.0 - 0.18 * sombraPeitoril * valido;
          diffuseColor.rgb = mix(diffuseColor.rgb, uMoldura, max(mold, peitoril) * valido);
          float j = dentro * valido;
          float sorteio = hashJanela(vec3(id, vInst * 1.37 + lado));
          float sorteio2 = hashJanela(vec3(id, vInst * 2.11 + lado + 5.0));
          vec3 vidro = uVidro;
          // cortina colorida em algumas janelas
          if (sorteio2 > 0.75 && f.y > mix(my, topo, 0.55)) vidro = mix(uVidro, vec3(0.9, 0.55, 0.35), 0.6);
          diffuseColor.rgb = mix(diffuseColor.rgb, vidro, j);
          janelaLuz = j * step(1.0 - uChance, sorteio);
          // 1932: folhas de madeira pintadas; fechadas, entreabertas ou abertas para a penumbra
          if (j > 0.5 && uMadeira > 0.5) {
            float qual = fract(vInst * 0.618 + lado * 0.13);
            vec3 cf = qual < 0.34 ? uVen1 : (qual < 0.67 ? uVen2 : uVen3);
            float xf = (f.x - mx) / (1.0 - 2.0 * mx);
            float yf = (f.y - my) / (topo - my);
            // duas folhas com almofadas (quadros) e a junta no meio
            float almofada = step(0.12, fract(xf * 2.0)) * step(fract(xf * 2.0), 0.88) * step(0.1, yf) * step(yf, 0.46)
                           + step(0.12, fract(xf * 2.0)) * step(fract(xf * 2.0), 0.88) * step(0.54, yf) * step(yf, 0.9);
            vec3 folha = cf * mix(1.0, 0.86, almofada);
            folha *= 1.0 - 0.35 * step(abs(xf - 0.5), 0.015);
            // tinta gasta: manchas mais claras
            folha = mix(folha, folha * 1.18 + 0.04, step(0.68, ruidoParede(vec2(xf * 6.0, yf * 9.0), vInst + id.x * 3.1)) * 0.6);
            float estado = sorteio2; // < 0.55 fechada, < 0.85 entreaberta, resto aberta
            float abre = estado < 0.55 ? 0.0 : (estado < 0.85 ? 0.12 + 0.12 * fract(sorteio2 * 13.0) : 0.5);
            float vao = step(abs(xf - 0.5), abre);
            vec3 penumbra = uVidro * mix(0.8, 1.15, yf);
            diffuseColor.rgb = mix(folha, penumbra, vao);
            janelaLuz *= mix(0.15, 1.0, vao);
          } else if (j > 0.5 && sorteio2 < uVenezianas) {
          // veneziana de madeira, às vezes entreaberta
            vec3 cv = mix(uVen1, uVen2, step(0.5, fract(vInst * 0.618)));
            float ripa = step(0.45, fract(f.y * 16.0));
            diffuseColor.rgb = cv * mix(0.78, 1.0, ripa);
            float fresta = 0.04 + 0.14 * fract(sorteio2 * 7.0);
            if (abs(f.x - 0.5) < fresta) diffuseColor.rgb = uVidro;
            janelaLuz *= 0.35;
          }
          // térreo de loja: portas largas, interior escuro, verga clara
          if (uLoja > 0.0 && v < uLoja) {
            float colL = max(1.0, floor(largura / 3.6));
            float gx = u / (largura / colL);
            float fx = fract(gx);
            float abertura = step(0.1, fx) * step(fx, 0.9) * step(v, uLoja - 0.9);
            float verga = step(0.06, fx) * step(fx, 0.94) * step(uLoja - 0.9, v) * step(v, uLoja - 0.6);
            vec3 vaoLoja = uInterior;
            if (uMadeira > 0.5) {
              // 1932: duas folhas de porta de madeira; parte das lojas aberta para o interior quente
              float sorteioL = hashJanela(vec3(floor(gx), vInst, 4.0 + lado));
              float qualL = fract(vInst * 0.618 + floor(gx) * 0.31);
              vec3 cp = qualL < 0.34 ? uVen1 : (qualL < 0.67 ? uVen2 : uVen3);
              float xl = (fx - 0.1) / 0.8;
              float tabua = step(0.5, fract(xl * 7.0));
              vec3 porta = cp * mix(0.9, 1.0, tabua);
              porta *= 1.0 - 0.35 * step(abs(xl - 0.5), 0.012);
              float abertaL = sorteioL < 0.6 ? 0.36 : (sorteioL < 0.8 ? 0.12 : 0.0);
              vaoLoja = mix(porta, uInterior * mix(1.5, 1.0, smoothstep(0.0, uLoja - 0.9, v)), step(abs(xl - 0.5), abertaL));
            }
            diffuseColor.rgb = mix(diffuseColor.rgb, vaoLoja, abertura);
            diffuseColor.rgb = mix(diffuseColor.rgb, uMoldura, verga);
            janelaLuz = max(janelaLuz, abertura * step(0.35, hashJanela(vec3(floor(gx), vInst, 9.0 + lado))));
          }
          // platibanda clara no topo
          diffuseColor.rgb = mix(diffuseColor.rgb, uFaixa, step(vEscala.y - 0.5, v) * uCornija);
          // barrado: faixa pintada na base em parte dos prédios
          float temBarra = step(hashJanela(vec3(vInst, 3.3, 1.7)), uBarra);
          float qualB = fract(vInst * 0.618);
          vec3 corBarra = (qualB < 0.34 ? uVen1 : (qualB < 0.67 ? uVen2 : uVen3)) * 0.92;
          float alturaBarra = 0.85 + 0.25 * hashJanela(vec3(vInst, 7.0, 2.0));
          float naBarra = temBarra * step(v, alturaBarra) * step(uLoja, 0.01);
          diffuseColor.rgb = mix(diffuseColor.rgb, corBarra, naBarra);
          diffuseColor.rgb *= 1.0 - 0.25 * temBarra * step(alturaBarra, v) * step(v, alturaBarra + 0.06) * step(uLoja, 0.01);
          if (uDesgaste > 0.0) {
            float semente = vInst * 0.37 + lado;
            // salitre: mancha esverdeada e escura subindo da base, com borda irregular
            float alturaSal = 0.35 + 1.1 * ruidoParede(vec2(u * 0.45, 0.0), semente) * uDesgaste;
            float sal = 1.0 - smoothstep(alturaSal * 0.55, alturaSal, v);
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.74, 0.76, 0.68), sal * 0.85);
            // cal descascada: a taipa aparece em placas, mais embaixo do que em cima
            float n = ruidoParede(vec2(u * 0.35, v * 0.5), semente + 11.0) * 0.75 + ruidoParede(vec2(u * 2.2, v * 2.6), semente + 23.0) * 0.25;
            float limiar = mix(0.9, 0.76, uDesgaste) + 0.16 * smoothstep(0.3, 3.0, v);
            float casca = smoothstep(limiar, limiar + 0.02, n) * (1.0 - j) * (1.0 - naBarra);
            float bordaCasca = smoothstep(limiar - 0.03, limiar, n) * (1.0 - casca) * (1.0 - j);
            diffuseColor.rgb = mix(diffuseColor.rgb, uTaipa, casca);
            diffuseColor.rgb *= 1.0 - 0.12 * bordaCasca;
            // escorrido abaixo dos peitoris
            float escorre = step(mx, f.x) * step(f.x, 1.0 - mx) * step(f.y, my - 0.1) * step(my - 0.55, f.y) * valido;
            diffuseColor.rgb *= 1.0 - 0.1 * escorre * ruidoParede(vec2(f.x * 14.0, id.x + id.y * 7.0), semente) * uDesgaste;
          }
          // base mais escura (sujeira e oclusão)
          diffuseColor.rgb *= mix(0.78, 1.0, smoothstep(0.0, 3.5, v));
        }`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += uLuz * janelaLuz * uNoite * 1.6;`
      )
  }
  mat.userData.uniformes = u // para depurar e medir pelo console
  mat.userData.tsl = predioTsl(u)
  // reboco e telha pintados também na versão de longe do casario (visual Arcane); a chave de cache vem
  // de pintar e ganha a textura, mas cada lote mantém os próprios uniforms
  return texturizar(pintar(mat, 'predio-pintado'), { topo: 'telha', lado: 'cal', tam: 2.5, contraste: 2.5 })
}

// A fachada do prédio em TSL, para o modo webgpu (motor F2, KAN-68): as mesmas contas do GLSL acima
function predioTsl(u) {
  let V = null
  const vars = (W) => V || (V = {
    local: W.varyingProperty('vec3', 'vLocal'), normLocal: W.varyingProperty('vec3', 'vNormLocal'),
    escala: W.varyingProperty('vec3', 'vEscala'), inst: W.varyingProperty('float', 'vInst'),
    janela: W.property('float', 'janelaLuz'),
  })
  return {
    nome: 'predio',
    posicao({ W, instancia }) {
      const { vec3, float, fract, sin, length, max, positionLocal, attribute, instanceIndex } = W
      const v = vars(W)
      const p = positionLocal
      v.local.assign(p)
      v.normLocal.assign(attribute('normal', 'vec3'))
      const esc = instancia ? vec3(length(instancia.element(0).xyz), length(instancia.element(1).xyz), length(instancia.element(2).xyz)) : vec3(1.0)
      const inst = instancia ? instanceIndex.toFloat() : float(0.0)
      v.escala.assign(esc)
      v.inst.assign(inst)
      // parede levemente torta e barriguda, como feita à mão
      const torto = ref(u.uTorto)
      const incl = fract(sin(inst.mul(12.9898)).mul(43758.5453)).sub(0.5).mul(2.0)
      const x1 = p.x.add(incl.mul(torto).mul(p.y).mul(esc.y.div(max(esc.x, 0.1))).mul(0.02))
      const k = float(1.0).add(torto.mul(0.025).mul(sin(p.y.mul(3.1416))))
      return vec3(x1.mul(k), p.y, p.z.mul(k))
    },
    cor({ W }, rgb0) {
      const { Fn, If, vec2, vec3, float, abs, floor, fract, sin, dot, mix, max, step, sign, smoothstep } = W
      const v = vars(W)
      const U = {}
      for (const k in u) U[k] = ref(u[k])
      const hashJanela = (p) => fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))).mul(43758.5453))
      const ruidoParede = (p, semente) => {
        const i = floor(p)
        const f0 = fract(p)
        const f = f0.mul(f0).mul(float(3.0).sub(f0.mul(2.0)))
        const a = hashJanela(vec3(i, semente)), b = hashJanela(vec3(i.add(vec2(1.0, 0.0)), semente))
        const c = hashJanela(vec3(i.add(vec2(0.0, 1.0)), semente)), d = hashJanela(vec3(i.add(vec2(1.0, 1.0)), semente))
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y)
      }
      const tres = (q, a, b, c) => q.lessThan(0.34).select(a, q.lessThan(0.67).select(b, c))
      return Fn(() => {
        const rgb = vec3(rgb0).toVar()
        v.janela.assign(0.0)
        const nl = v.normLocal, vl = v.local, esc = v.escala, vInst = v.inst
        If(nl.y.greaterThan(0.5), () => {
          rgb.assign(U.uTelhado)
        }).ElseIf(nl.y.greaterThan(-0.5), () => {
          const ladoX = abs(nl.x).greaterThan(0.5)
          const largura = ladoX.select(esc.z, esc.x)
          const uu = ladoX.select(vl.z, vl.x).mul(largura).add(largura.mul(0.5))
          const vv = vl.y.mul(esc.y)
          const lado = ladoX.select(sign(nl.x), sign(nl.z).mul(2.0))
          const inicio = max(U.uTerreo, U.uLoja)
          const colunas = max(1.0, floor(largura.div(U.uCelula.x)))
          const util = max(0.5, esc.y.sub(inicio).sub(0.7))
          const andares = max(1.0, floor(util.div(U.uCelula.y)))
          const g = vec2(uu.div(largura.div(colunas)), vv.sub(inicio).div(util.div(andares)))
          const f = fract(g)
          const id = floor(g)
          const valido = step(0.0, g.y).mul(step(g.y, andares)).mul(step(0.0, g.x)).mul(step(g.x, colunas))
          const mx = U.uMargem.x, my = U.uMargem.y
          const topo = float(1.0).sub(my.mul(0.6))
          const dentro = step(mx, f.x).mul(step(f.x, float(1.0).sub(mx))).mul(step(my, f.y)).mul(step(f.y, topo))
          const mold = step(mx.sub(0.06), f.x).mul(step(f.x, float(1.0).sub(mx).add(0.06))).mul(step(my.sub(0.05), f.y)).mul(step(f.y, topo.add(0.05)))
          const peitoril = step(mx.sub(0.1), f.x).mul(step(f.x, float(1.0).sub(mx).add(0.1))).mul(step(my.sub(0.1), f.y)).mul(step(f.y, my.sub(0.04)))
          const sombraPeitoril = step(mx.sub(0.1), f.x).mul(step(f.x, float(1.0).sub(mx).add(0.1))).mul(step(my.sub(0.18), f.y)).mul(step(f.y, my.sub(0.1)))
          const faixa = step(f.y, U.uFaixaAltura).mul(valido)
          rgb.assign(mix(rgb, U.uFaixa, faixa))
          rgb.mulAssign(float(1.0).sub(sombraPeitoril.mul(valido).mul(0.18)))
          rgb.assign(mix(rgb, U.uMoldura, max(mold, peitoril).mul(valido)))
          const j = dentro.mul(valido)
          const sorteio = hashJanela(vec3(id, vInst.mul(1.37).add(lado)))
          const sorteio2 = hashJanela(vec3(id, vInst.mul(2.11).add(lado).add(5.0)))
          const cortina = sorteio2.greaterThan(0.75).and(f.y.greaterThan(mix(my, topo, 0.55)))
          const vidro = cortina.select(mix(U.uVidro, vec3(0.9, 0.55, 0.35), 0.6), U.uVidro)
          rgb.assign(mix(rgb, vidro, j))
          v.janela.assign(j.mul(step(float(1.0).sub(U.uChance), sorteio)))
          If(j.greaterThan(0.5).and(U.uMadeira.greaterThan(0.5)), () => {
            // 1932: folhas de madeira pintadas; fechadas, entreabertas ou abertas para a penumbra
            const qual = fract(vInst.mul(0.618).add(lado.mul(0.13)))
            const cf = tres(qual, U.uVen1, U.uVen2, U.uVen3)
            const xf = f.x.sub(mx).div(float(1.0).sub(mx.mul(2.0)))
            const yf = f.y.sub(my).div(topo.sub(my))
            const fx2 = fract(xf.mul(2.0))
            const almofada = step(0.12, fx2).mul(step(fx2, 0.88)).mul(step(0.1, yf)).mul(step(yf, 0.46))
              .add(step(0.12, fx2).mul(step(fx2, 0.88)).mul(step(0.54, yf)).mul(step(yf, 0.9)))
            const folha0 = cf.mul(mix(1.0, 0.86, almofada))
            const folha1 = folha0.mul(float(1.0).sub(step(abs(xf.sub(0.5)), 0.015).mul(0.35)))
            const folha = mix(folha1, folha1.mul(1.18).add(0.04), step(0.68, ruidoParede(vec2(xf.mul(6.0), yf.mul(9.0)), vInst.add(id.x.mul(3.1)))).mul(0.6))
            const abre = sorteio2.lessThan(0.55).select(float(0.0), sorteio2.lessThan(0.85).select(fract(sorteio2.mul(13.0)).mul(0.12).add(0.12), float(0.5)))
            const vao = step(abs(xf.sub(0.5)), abre)
            const penumbra = U.uVidro.mul(mix(0.8, 1.15, yf))
            rgb.assign(mix(folha, penumbra, vao))
            v.janela.mulAssign(mix(0.15, 1.0, vao))
          }).ElseIf(j.greaterThan(0.5).and(sorteio2.lessThan(U.uVenezianas)), () => {
            // veneziana de madeira, às vezes entreaberta
            const cv = mix(U.uVen1, U.uVen2, step(0.5, fract(vInst.mul(0.618))))
            const ripa = step(0.45, fract(f.y.mul(16.0)))
            const fresta = fract(sorteio2.mul(7.0)).mul(0.14).add(0.04)
            rgb.assign(abs(f.x.sub(0.5)).lessThan(fresta).select(U.uVidro, cv.mul(mix(0.78, 1.0, ripa))))
            v.janela.mulAssign(0.35)
          })
          // térreo de loja: portas largas, interior escuro, verga clara
          If(U.uLoja.greaterThan(0.0).and(vv.lessThan(U.uLoja)), () => {
            const colL = max(1.0, floor(largura.div(3.6)))
            const gx = uu.div(largura.div(colL))
            const fx = fract(gx)
            const abertura = step(0.1, fx).mul(step(fx, 0.9)).mul(step(vv, U.uLoja.sub(0.9)))
            const verga = step(0.06, fx).mul(step(fx, 0.94)).mul(step(U.uLoja.sub(0.9), vv)).mul(step(vv, U.uLoja.sub(0.6)))
            const vaoLoja = vec3(U.uInterior).toVar()
            If(U.uMadeira.greaterThan(0.5), () => {
              const sorteioL = hashJanela(vec3(floor(gx), vInst, lado.add(4.0)))
              const qualL = fract(vInst.mul(0.618).add(floor(gx).mul(0.31)))
              const cp = tres(qualL, U.uVen1, U.uVen2, U.uVen3)
              const xl = fx.sub(0.1).div(0.8)
              const tabua = step(0.5, fract(xl.mul(7.0)))
              const porta = cp.mul(mix(0.9, 1.0, tabua)).mul(float(1.0).sub(step(abs(xl.sub(0.5)), 0.012).mul(0.35)))
              const abertaL = sorteioL.lessThan(0.6).select(float(0.36), sorteioL.lessThan(0.8).select(float(0.12), float(0.0)))
              vaoLoja.assign(mix(porta, U.uInterior.mul(mix(1.5, 1.0, smoothstep(0.0, U.uLoja.sub(0.9), vv))), step(abs(xl.sub(0.5)), abertaL)))
            })
            rgb.assign(mix(rgb, vaoLoja, abertura))
            rgb.assign(mix(rgb, U.uMoldura, verga))
            v.janela.assign(max(v.janela, abertura.mul(step(0.35, hashJanela(vec3(floor(gx), vInst, lado.add(9.0)))))))
          })
          // platibanda clara no topo
          rgb.assign(mix(rgb, U.uFaixa, step(esc.y.sub(0.5), vv).mul(U.uCornija)))
          // barrado: faixa pintada na base em parte dos prédios
          const temBarra = step(hashJanela(vec3(vInst, 3.3, 1.7)), U.uBarra)
          const qualB = fract(vInst.mul(0.618))
          const corBarra = tres(qualB, U.uVen1, U.uVen2, U.uVen3).mul(0.92)
          const alturaBarra = hashJanela(vec3(vInst, 7.0, 2.0)).mul(0.25).add(0.85)
          const naBarra = temBarra.mul(step(vv, alturaBarra)).mul(step(U.uLoja, 0.01))
          rgb.assign(mix(rgb, corBarra, naBarra))
          rgb.mulAssign(float(1.0).sub(temBarra.mul(step(alturaBarra, vv)).mul(step(vv, alturaBarra.add(0.06))).mul(step(U.uLoja, 0.01)).mul(0.25)))
          If(U.uDesgaste.greaterThan(0.0), () => {
            const semente = vInst.mul(0.37).add(lado)
            // salitre: mancha esverdeada e escura subindo da base
            const alturaSal = ruidoParede(vec2(uu.mul(0.45), 0.0), semente).mul(U.uDesgaste).mul(1.1).add(0.35)
            const sal = float(1.0).sub(smoothstep(alturaSal.mul(0.55), alturaSal, vv))
            rgb.assign(mix(rgb, rgb.mul(vec3(0.74, 0.76, 0.68)), sal.mul(0.85)))
            // cal descascada: a taipa aparece em placas
            const n = ruidoParede(vec2(uu.mul(0.35), vv.mul(0.5)), semente.add(11.0)).mul(0.75).add(ruidoParede(vec2(uu.mul(2.2), vv.mul(2.6)), semente.add(23.0)).mul(0.25))
            const limiar = mix(0.9, 0.76, U.uDesgaste).add(smoothstep(0.3, 3.0, vv).mul(0.16))
            const casca = smoothstep(limiar, limiar.add(0.02), n).mul(float(1.0).sub(j)).mul(float(1.0).sub(naBarra))
            const bordaCasca = smoothstep(limiar.sub(0.03), limiar, n).mul(float(1.0).sub(casca)).mul(float(1.0).sub(j))
            rgb.assign(mix(rgb, U.uTaipa, casca))
            rgb.mulAssign(float(1.0).sub(bordaCasca.mul(0.12)))
            // escorrido abaixo dos peitoris
            const escorre = step(mx, f.x).mul(step(f.x, float(1.0).sub(mx))).mul(step(f.y, my.sub(0.1))).mul(step(my.sub(0.55), f.y)).mul(valido)
            rgb.mulAssign(float(1.0).sub(escorre.mul(ruidoParede(vec2(f.x.mul(14.0), id.x.add(id.y.mul(7.0))), semente)).mul(U.uDesgaste).mul(0.1)))
          })
          // base mais escura (sujeira e oclusão)
          rgb.mulAssign(mix(0.78, 1.0, smoothstep(0.0, 3.5, vv)))
        })
        return rgb
      })()
    },
    emissivo({ W }, emissivo) {
      return emissivo.add(ref(u.uLuz).mul(vars(W).janela).mul(ref(u.uNoite)).mul(1.6))
    },
  }
}

// Textura feita em código, num canvas, sem baixar imagem nenhuma.
export function texturaCanvas(largura, altura, desenhar, { repetir = true, cor = true } = {}) {
  const c = document.createElement('canvas')
  c.width = largura
  c.height = altura
  const ctx = c.getContext('2d')
  desenhar(ctx, largura, altura)
  const tex = new THREE.CanvasTexture(c)
  if (cor) tex.colorSpace = THREE.SRGBColorSpace
  if (repetir) tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 8
  return tex
}
