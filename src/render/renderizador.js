// Renderizador do jogo: o WebGL de sempre ou, com cfg.desempenho.renderizador = 'webgpu' (motor F1 KAN-67,
// F2 KAN-68), o WebGPURenderer do three. No modo webgpu cada material do jogo ganha a versão em TSL:
// - pintar() (materiais.js) vira o MaterialPintado de arcane-tsl.js
// - luzFixa() vira o material do three com a mesma segunda saída de luz (gLuz)
// - código GLSL próprio (shader inteiro ou somado ao material) usa a versão em TSL que o próprio arquivo
//   declara em material.userData.tsl; sem ela, entra uma cor de reserva e vai para a lista "falta portar"
//   (window.__faltaPortar), que a suíte e a foto justa leem.

import * as THREE from 'three'
import { materialArcane, copiarPropriedades, matrizInstancia } from './arcane-tsl.js'
import { usarModulo, ref } from './gpu/comum.js'

let W = null // o módulo three/webgpu, no modo webgpu
let renderizador = null

export async function criarRenderizador(cfg, canvas) {
  if (cfg.desempenho.renderizador === 'webgpu') {
    // o three/webgpu do 0.170 é um pacote separado do three (outra cópia do núcleo); a cena continua
    // sendo do three, e o renderizador lê os objetos pelas marcas (isMesh, isTexture...)
    W = await import('three/webgpu')
    usarModulo(W)
    copiasComoAtributo(W)
    const renderer = new W.WebGPURenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
    // o WebGPU acha o material pelo nome do tipo (funciona com a outra cópia), mas a luz pela classe: sem
    // registrar as classes de luz do three, nenhuma luz da cena era achada e tudo saía preto
    for (const [no, classe] of [[W.DirectionalLightNode, THREE.DirectionalLight], [W.HemisphereLightNode, THREE.HemisphereLight],
      [W.AmbientLightNode, THREE.AmbientLight], [W.PointLightNode, THREE.PointLight], [W.SpotLightNode, THREE.SpotLight],
      [W.RectAreaLightNode, THREE.RectAreaLight], [W.LightProbeNode, THREE.LightProbe]]) renderer.library.addLight(no, classe)
    await renderer.init()
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    // erro de validação do WebGPU (shader que não monta, pipeline inválido) não para o jogo: vai para a
    // mesma lista que o WebGL usa para shader quebrado, e a suíte reprova
    window.__shadersQuebrados = []
    renderer.backend.device.addEventListener('uncapturederror', (e) => {
      const msg = (e.error?.message || String(e.error)).split('\n')[0]
      if (window.__shadersQuebrados.length < 50) window.__shadersQuebrados.push(msg)
      console.error('WebGPU:', msg)
    })
    renderizador = renderer
    return { renderer, webgpu: true }
  }
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap // borda nítida, combina com o toon
  renderer.shadowMap.autoUpdate = false
  return { renderer, webgpu: false }
}

export function modulo() { return W }

// O InstanceNode do three (passe de sombra e materiais que não são do pintar) guarda as matrizes das cópias numa
// lista em uniform até 1000 cópias, com um nome próprio por objeto no código do shader: nenhum programa é
// reaproveitado e o WebGPU compila um programa de vértice por objeto. Aqui ele usa sempre o atributo de vértice (o
// caminho dele acima de 1000), igual ao MaterialPintado (arcane-tsl.js, matrizInstancia).
function copiasComoAtributo(W) {
  const proto = W.InstanceNode.prototype
  if (proto.__copiasComoAtributo) return
  const setupOriginal = proto.setup
  proto.setup = function (builder) {
    if (this.instanceMatrixNode === null) {
      const { no, buf } = matrizInstancia(W, this.instanceMesh)
      this.instanceMatrixNode = no
      this.buffer = buf
    }
    return setupOriginal.call(this, builder)
  }
  proto.__copiasComoAtributo = true
}

// Cor de reserva para o que ainda não tem versão no WebGPU, pelo nome do objeto (só para a cena ficar legível)
function corReserva(o) {
  const n = (o.name || '').toLowerCase()
  if (n.includes('mar') || n.includes('rio')) return '#3aa8b5'
  if (n.includes('ceu') || n.includes('céu') || n.includes('nuvem')) return '#a9cbe6'
  if (n.includes('areia')) return '#d9c38f'
  return '#8a8a8a'
}

const trocas = new Map() // material original -> versão do WebGPU (a mesma para todo objeto que o usa)
const versoes = new Map() // material original -> versão dele quando foi convertido
const visto = new WeakMap() // objeto -> material que ele tinha na última passada
const falta = new Map()
const convertidos = new Set()

function converter(m, o) {
  if (m.isNodeMaterial) return m
  if (trocas.has(m)) return trocas.get(m)
  const nm = criarVersao(m, o)
  trocas.set(m, nm)
  versoes.set(m, m.version)
  return nm
}

function criarVersao(m, o) {
  const onde = o.name || o.type
  const tsl = m.userData.tsl
  let nm = m
  if (tsl?.material) {
    // shader inteiro do jogo (mar, céu...) com versão própria em TSL
    nm = tsl.material({ W, ref, original: m, objeto: o })
    convertidos.add(tsl.nome || m.type)
  } else if (m.isMeshToonMaterial && m.userData.luzMRT && !m.userData.luzFixa) {
    if (m.userData.extraGlsl && !tsl) anotar('código extra no pintar() sem TSL', onde)
    // código somado depois do pintar (roupa e pano do jogador) precisa da sua versão em tslEsqueleto
    const somado = m.onBeforeCompile !== m.userData.obcPintar
    if (somado && !(m.userData.tslEsqueleto?.length)) anotar('código somado depois do pintar() sem TSL', onde)
    nm = materialArcane(m)
    convertidos.add(m.customProgramCacheKey ? m.customProgramCacheKey() : onde)
  } else if (m.userData.luzFixa) {
    if (m.userData.extraGlsl && !tsl) anotar(`código extra no luzFixa() sem TSL (${m.type})`, onde)
    nm = renderizador.library.fromMaterial(m)
    if (nm && nm !== m) {
      const u = m.userData.luzFixa
      nm.mrtNode = W.mrt({ gLuz: W.vec4(ref(u.uLuzFixa), ref(u.uBrilhoFixo), 0.0, 1.0) })
      if (tsl?.fragmento) tsl.fragmento({ W, ref, original: m, material: nm })
      delete nm.onBeforeCompile // fromMaterial copia a função do WebGL, que aqui não roda
      convertidos.add('luz-fixa')
    } else nm = m
  } else if (m.isShaderMaterial || m.isRawShaderMaterial) {
    anotar(`shader próprio (${m.type})`, onde)
    nm = o.isPoints
      ? new THREE.PointsMaterial({ color: '#ffffff', size: 0.06, transparent: true, opacity: 0.5, depthWrite: false })
      : new THREE.MeshBasicMaterial({ color: corReserva(o), side: m.side, transparent: m.transparent, opacity: m.transparent ? 0.7 : 1 })
  } else if (m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) {
    anotar(`código injetado no material (${m.type}): sai no material padrão`, onde)
  }
  if (nm !== m && nm.isNodeMaterial && !tsl?.material) seguirOriginal(m, nm)
  if (nm !== m) sombraComoWebgl(m, nm)
  return nm
}

// A versão do WebGPU lê e grava as propriedades no material original, em vez de ficar com a cópia da hora da
// troca: o jogo muda o original durante o jogo (o facho do farol muda opacity todo quadro; o rosto troca o map dos
// olhos e da boca) e isso tem de chegar ao desenho, como no WebGL. Mudança que pede shader novo (needsUpdate) já
// volta pela checagem de versão em prepararCenaWebgpu.
const NAO_SEGUIR = new Set(['uuid', 'id', 'type', 'version', 'name', 'userData', 'onBeforeCompile', 'customProgramCacheKey', 'shadowSide'])
function seguirOriginal(m, nm) {
  for (const k of Object.keys(m)) {
    if (NAO_SEGUIR.has(k) || k.startsWith('is') || k.startsWith('_') || typeof m[k] === 'function') continue
    if (!(k in nm)) continue
    Object.defineProperty(nm, k, { configurable: true, enumerable: true, get: () => m[k], set: (v) => { m[k] = v } })
  }
}

// O passe de sombra do WebGPU não faz o que o do WebGL faz (WebGLShadowMap.getDepthMaterial): o WebGL desenha a
// sombra pelo lado de trás das faces (menos sombra falsa com o sol rasante do fim de tarde) e respeita o recorte
// das folhas (alphaTest com map ou alphaMap). Sem isso, a folha do coqueiro fazia sombra de retângulo inteiro.
const LADO_SOMBRA = { [THREE.FrontSide]: THREE.BackSide, [THREE.BackSide]: THREE.FrontSide, [THREE.DoubleSide]: THREE.DoubleSide }
function sombraComoWebgl(m, nm) {
  if (m.shadowSide === null || m.shadowSide === undefined) nm.shadowSide = LADO_SOMBRA[m.side]
  if (m.alphaTest > 0 && (m.map || m.alphaMap)) {
    const { Fn, texture, uv, float, vec4, Discard } = W
    nm.shadowNode = Fn(() => {
      let a = float(1)
      // a textura do momento (o rosto troca o map durante o jogo)
      if (m.map) a = a.mul(texture(m.map, uv()).onRenderUpdate(() => m.map).a)
      if (m.alphaMap) a = a.mul(texture(m.alphaMap, uv()).onRenderUpdate(() => m.alphaMap).g)
      Discard(a.lessThan(m.alphaTest))
      return vec4(0, 0, 0, 1)
    })()
  }
}

// Troca cada material pela versão do WebGPU. Roda antes de todo quadro: só olha objeto novo ou objeto que
// trocou de material (o corpo do jogador, blocos que nascem andando), para o material certo já sair no
// primeiro desenho (antes, a troca vinha 2 s depois e o shader era montado duas vezes).
export function prepararCenaWebgpu(cena) {
  let mudou = false
  // original marcado para recompilar (needsUpdate: roupa e pano somam código depois de criados): a versão do
  // WebGPU é montada de novo, lendo os ganchos atuais
  for (const [m, v] of versoes) {
    if (m.version === v) continue
    versoes.set(m, m.version)
    const nm = trocas.get(m)
    if (nm !== m) nm.needsUpdate = true
  }
  cena.traverse((o) => {
    if (o.isInstancedMesh && !visto.has(o)) { duasCopias(o); quantidadeFixa(o) }
    if (!o.material || visto.get(o) === o.material) return
    if (Array.isArray(o.material)) o.material = o.material.map((m) => converter(m, o))
    else o.material = converter(o.material, o)
    visto.set(o, o.material)
    mudou = true
  })
  if (mudou) {
    window.__faltaPortar = [...falta.entries()].map(([k, s]) => ({ peca: k, onde: [...s].slice(0, 12), quantos: s.size }))
    window.__convertidosTsl = [...convertidos]
  }
}

// O three monta um shader só para objetos com o mesmo material e o mesmo formato de geometria, e só separa por
// objeto quando count > 1 (RenderObject.getMaterialCacheKey, com um TODO dele). Num bloco com uma cópia só
// (instanciarEmBlocos deixa centenas assim), a matriz da cópia fica guardada no shader e ia junto: todos saíam no
// lugar de um deles, no desenho e na sombra (a casa de palha sumia da praia, KAN-68). Bloco criado com uma cópia
// ganha uma segunda, minúscula (escala 1e-6) no mesmo lugar, que não aparece: com duas, o three separa por objeto.
// Só bloco fixo (capacidade 1); os que mudam de quantidade (bolas, poeira) ficam como estão.
function duasCopias(o) {
  if (o.count !== 1 || o.instanceMatrix.count !== 1) return
  const mt = new THREE.Matrix4().fromArray(o.instanceMatrix.array)
  const a = new Float32Array(32)
  a.set(o.instanceMatrix.array.subarray(0, 16), 0)
  mt.multiply(new THREE.Matrix4().makeScale(1e-6, 1e-6, 1e-6)).toArray(a, 16)
  o.instanceMatrix = new THREE.InstancedBufferAttribute(a, 16)
  if (o.instanceColor) {
    const c = new Float32Array(6)
    c.set(o.instanceColor.array.subarray(0, 3), 0)
    c.set(o.instanceColor.array.subarray(0, 3), 3)
    o.instanceColor = new THREE.InstancedBufferAttribute(c, 3)
  }
  o.count = 2
  o.computeBoundingSphere()
}

// Bloco cuja quantidade de cópias muda durante o jogo (bolas, cocos, poeira: nascem com zero e têm capacidade
// maior). O three não remonta o shader quando count muda (a lista de matrizes ficava do tamanho do primeiro
// desenho e só a primeira bola aparecia), com count <= 1 não separa o objeto dos outros com o mesmo material
// (bolas e cocos trocavam matrizes) e com zero ainda desenha uma cópia. Aqui o renderizador vê sempre a capacidade
// inteira: o count que o jogo grava fica guardado, e as cópias além dele viram escala zero (não aparecem).
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0)
function quantidadeFixa(o) {
  const cap = o.instanceMatrix.count
  if (cap <= 1 || o.count >= cap) return
  let real = o.count
  for (let i = real; i < cap; i++) o.setMatrixAt(i, ZERO)
  o.instanceMatrix.needsUpdate = true
  Object.defineProperty(o, 'count', {
    configurable: true,
    get: () => cap,
    set: (n) => {
      for (let i = n; i < real; i++) o.setMatrixAt(i, ZERO)
      if (n < real) o.instanceMatrix.needsUpdate = true
      real = n
    },
  })
  o.userData.quantidadeReal = () => real
}

// KAN-70 T1: no WebGPU cada bloco de cópias monta o shader dele no quadro em que aparece pela primeira vez, e andando
// pela cidade o jogo caía para 1,5 FPS (g4dn). Como a comunidade do three resolve (fórum 86191: compileAsync não
// adiantou; desenhar tudo uma vez sim): um desenho com tudo visível e sem corte de tela antes do primeiro quadro de
// verdade, pelo mesmo caminho (MRT, sombra, filtro), para shaders, pipelines e envios saírem prontos. Depois tudo volta
// como estava; quem chama desenha o quadro normal logo em seguida, então o de aquecimento nunca aparece.
export function preaquecerWebgpu(cena, desenhar) {
  const mexidos = []
  cena.traverse((o) => {
    if (o.userData.nuncaDesenha) return // caixas de colisão da câmera: invisíveis sempre
    mexidos.push([o, o.visible, o.frustumCulled, o.geometry?.isInstancedBufferGeometry ? o.geometry.instanceCount : null])
    o.visible = true
    o.frustumCulled = false
    // grama: bloco com zero folhas no momento também precisa do shader pronto
    if (o.geometry?.isInstancedBufferGeometry && o.geometry.instanceCount === 0) o.geometry.instanceCount = 1
  })
  try {
    desenhar()
  } finally {
    for (const [o, visivel, corte, n] of mexidos) {
      o.visible = visivel
      o.frustumCulled = corte
      if (n !== null) o.geometry.instanceCount = n
    }
  }
}

function anotar(peca, onde) {
  if (!falta.has(peca)) falta.set(peca, new Set())
  falta.get(peca).add(onde)
}
