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
import { instalarFaixasUnicas } from './gpu/faixas-uniform.js'
import { instalarFiltroWebgl } from './filtro-sombra.js'
import { instalarMisturaWebgl } from './sombra-perto.js'
import { geracaoTexturas } from '../globais.js'

let W = null // o módulo three/webgpu, no modo webgpu
let renderizador = null

export async function criarRenderizador(cfg, canvas) {
  if (cfg.desempenho.renderizador === 'webgpu') {
    // o three/webgpu do 0.170 é um pacote separado do three (outra cópia do núcleo); a cena continua
    // sendo do three, e o renderizador lê os objetos pelas marcas (isMesh, isTexture...)
    // desde a r171 as funções do TSL (Fn, vec3, uniform...) vêm de three/tsl e não mais de three/webgpu: o resto do
    // porte usa as duas pelo mesmo objeto W
    const [webgpu, tsl] = await Promise.all([import('three/webgpu'), import('three/tsl')])
    W = { ...tsl, ...webgpu }
    // atan2(y, x) saiu do TSL: o atan de dois argumentos faz o mesmo
    if (!W.atan2) W.atan2 = (y, x) => W.atan(y, x)
    usarModulo(W)
    const renderer = new W.WebGPURenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
    // o WebGPU acha o material pelo nome do tipo (funciona com a outra cópia), mas a luz pela classe: sem
    // registrar as classes de luz do three, nenhuma luz da cena era achada e tudo saía preto
    for (const [no, classe] of [[W.DirectionalLightNode, THREE.DirectionalLight], [W.HemisphereLightNode, THREE.HemisphereLight],
      [W.AmbientLightNode, THREE.AmbientLight], [W.PointLightNode, THREE.PointLight], [W.SpotLightNode, THREE.SpotLight],
      [W.RectAreaLightNode, THREE.RectAreaLight], [W.LightProbeNode, THREE.LightProbe]]) renderer.library.addLight(no, classe)
    await renderer.init()
    // Matrizes das cópias sempre como atributo de vértice: com elas numa lista em uniform (o que o three faz quando
    // cabem no limite de 64 KB), cada objeto ganhava um nome de lista próprio no código do shader, nenhum programa
    // era reaproveitado e o WebGPU compilava um programa de vértice por bloco de cópias (533 de 570 no three
    // 0.186, KAN-70). O limite só decide isso, os ossos do esqueleto (que passam a vir de uma textura, como no
    // WebGL) e um nó que o jogo não usa (RangeNode).
    renderer.backend.capabilities.getUniformBufferLimit = () => 0
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    prepararObjetoAoDesenhar(renderer)
    instalarFaixasUnicas(renderer)
    estaticosSemRefreshTotal(renderer)
    // erro de validação do WebGPU (shader que não monta, pipeline inválido) não para o jogo: vai para a
    // mesma lista que o WebGL usa para shader quebrado, e a suíte reprova
    window.__shadersQuebrados = []
    window.__estatisticasObservador = estatisticasObservador // contadores do remendo do observador (para conferir no console)
    renderer.backend.device.addEventListener('uncapturederror', (e) => {
      const msg = (e.error?.message || String(e.error)).split('\n')[0]
      if (window.__shadersQuebrados.length < 50) window.__shadersQuebrados.push(msg)
      console.error('WebGPU:', msg)
    })
    renderizador = renderer
    return { renderer, webgpu: true }
  }
  // sombra (21/10/2026): borda presa ao mapa em vez do ruído de tela do three, e a mistura dos mapas de longe e
  // de perto (render/filtro-sombra.js, render/sombra-perto.js); antes do primeiro material compilar
  if (!instalarFiltroWebgl()) console.warn('filtro da sombra: o trecho do three mudou, segue o PCF do three')
  if (!instalarMisturaWebgl()) console.warn('sombra de perto: o trecho do three mudou, só o mapa de longe vale')
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap // suave desde o three 0.182
  renderer.shadowMap.autoUpdate = false
  return { renderer, webgpu: false }
}

export function modulo() { return W }

// Gancho em renderer.renderObject, que o three chama para cada objeto de cada passe (cor, sombra...). Faz duas coisas:
// 1. Converte o objeto no primeiro desenho (KAN-70). Antes, prepararCenaWebgpu percorria a cena inteira em todo
//    quadro (1.984 objetos, 0,5 ms na T4) só para achar objeto novo ou com material trocado. Agora o objeto novo é
//    convertido aqui, antes de o three montar o RenderObject. O material do argumento vem da lista de desenho, montada
//    antes da troca: passa-se ao three o convertido, senão ele compilaria um shader para o material do WebGL
//    (materialParaDesenho). Mesmo depois de convertido, a lista do quadro em curso ainda pode trazer o material velho.
// 2. A sombra de todos os objetos sai de um material só (o da sombra da luz), e o three copia nele o alphaTest de cada
//    objeto antes de desenhar. O alphaTest do three sobe a versão do material quando liga ou desliga; com folha (com
//    alphaTest) e parede (sem) alternando na lista, cada objeto achava o material mudado e recalculava a chave inteira:
//    uns 160 por quadro, 3 ms na g4dn (KAN-70 T5, cenário sombraSemRecalcularChave). Nesse material o alphaTest passa
//    a não mexer na versão: a chave de cada objeto já guarda se ele tem alphaTest (montada na primeira vez com o valor
//    dele), então o shader certo continua. Limite: material que liga ou desliga o alphaTest em jogo não teria a
//    sombra refeita.
function prepararObjetoAoDesenhar(renderer) {
  const original = renderer.renderObject
  renderer.renderObject = function (object, scene, camera, geometry, material, ...resto) {
    const sobre = scene.overrideMaterial
    if (sobre && sobre.isShadowPassMaterial && !Object.prototype.hasOwnProperty.call(sobre, 'alphaTest')) {
      Object.defineProperty(sobre, 'alphaTest', {
        configurable: true,
        get() { return this._alphaTest },
        set(v) { this._alphaTest = v },
      })
    }
    if (object.material) {
      const antes = object.material
      converterObjeto(object)
      // material já em nó (a sombra, por exemplo) segue como veio; o do WebGL vira o convertido
      if (material && !material.isNodeMaterial) material = materialParaDesenho(object, material, antes)
    }
    return original.call(this, object, scene, camera, geometry, material, ...resto)
  }
}

// Parados sem refresh total (KAN-70, briefing 5). No three 0.186 o NodeMaterialObserver.needsRefresh
// (three.webgpu.js:933-971) devolve RenderObjectRefreshType.FULL sempre que o material tem alguma propriedade *Node
// (this.hasNode, containsNode nas linhas 330-346), e todos os materiais do jogo têm (colorNode, mrtNode, shadowNode).
// FULL é nodes.updateBefore + geometries.updateForRender + nodes.updateForRender + bindings.updateForRender (comparar e
// regravar o grupo de uniforms do objeto): uns 12-25 us por objeto em todo quadro, para ~250 que nunca se mexem (T4). O
// caminho do three para quem é static (NONE/SHARED, linha 955) nunca era alcançado: o teste de hasNode vem antes.
// No 0.186 a modelViewMatrix sai do shader (cameraViewMatrix.mul(modelWorldMatrix)), então o grupo de objeto de um
// parado só tem modelWorldMatrix, normalMatrix e referências ao material: constante enquanto a matriz e o material
// não mudam. Aqui, o objeto marcado static (congelar.js) com material de nós cai na comparação por valor do próprio
// three, equals() (linhas 489-851): matriz de mundo, versão do material (as propriedades de refreshUniforms, linhas
// 9-81, inclusive a versão das texturas dele), tamanho do alvo, versão de geometria (atributos, índice, drawRange),
// versão da instanceMatrix/instanceColor, luzes (mapa e tamanho do mapa de sombra, getLights nas linhas 902-924) e
// ambiente. Nada mudou: NONE (ou SHARED, no primeiro objeto de cada material em cada passe, que roda o updateBefore e
// atualiza os uniforms compartilhados: sol, paleta, sombra). Mudou: FULL, como antes. O que o equals() não vê é o que
// elegivel() recusa: o objeto cai no needsRefresh original.
// Bloco de cópias (InstancedMesh) tem shader e observador próprios (a chave do RenderObject leva o uuid do objeto,
// three.webgpu.js:31301-31304), então ele é sempre o primeiro do observador dele e devolve SHARED todo quadro: roda o
// updateBefore, o updateForRender e os uniforms compartilhados (que são uma cópia por shader), e economiza a
// geometries.updateForRender e o grupo de uniforms do objeto (comparar e regravar). NONE fica para quem divide shader.
// Limites: textura amostrada por nó que não seja propriedade do material (tLampioes, texturas do terreno) não é
// observada; se alguma for regravada em jogo (needsUpdate), a subida só acontece quando um objeto não parado do mesmo
// shader passar por FULL. As do jogo para parados são montadas uma vez antes do primeiro desenho.
const INSTALADO_OBSERVADOR = Symbol.for('maresia.observadorEstaticos.instalado')
const estatisticas = { none: 0, shared: 0, full: 0, original: 0, erros: 0 }
const recusas = {} // motivo -> quantos nodeBuilderState (shaders) ficaram de fora
let estadosElegiveis = 0
const conhecidosDoThree = new Set() // nós únicos do three, comparados por identidade (preenchido em estaticosSemRefreshTotal)

// Contadores por tipo devolvido (original = caiu no needsRefresh do three), quantos shaders foram aceitos e por que os
// outros foram recusados ("Classe:updateType"). zerar = true começa a contar de novo (os de shaders não zeram).
// No dev: window.__estatisticasObservador() ou (await import('/src/render/renderizador.js')).estatisticasObservador().
export function estatisticasObservador(zerar = false) {
  const r = { ...estatisticas, estadosElegiveis, recusas: { ...recusas } }
  if (zerar) for (const k in estatisticas) estatisticas[k] = 0
  return r
}

// A decisão, pura (o teste usa direto). Cada campo é um valor ou uma função sem argumentos, avaliada só quando a
// decisão chega nele, na ordem do needsRefresh original (firstInitialization registra o objeto: roda uma vez e só se
// o objeto é parado, como no original):
//   não estático (ou material sem nós)  -> original      parado com animação (skinning)      -> original
//   instâncias dinâmicas                -> original      primeira vez do objeto              -> original
//   passe com velocity                  -> original      nó que o equals() não cobre         -> original
//   parado, elegível, igual, renderId igual -> none      parado, elegível, igual, renderId novo -> shared
//   parado, elegível, algo mudou        -> full
//   parado, elegível, igual, textura carregada depois do último full -> full
// renderIdMudou vem antes de iguais, que roda sempre (equals também sincroniza o cache de estado).
export function decidirRefresh(c) {
  if (!avaliar(c.estatico) || avaliar(c.animacao) || avaliar(c.instanciaDinamica) || avaliar(c.primeira) ||
    avaliar(c.velocidade) || !avaliar(c.elegivel)) return 'original'
  const novo = avaliar(c.renderIdMudou)
  if (avaliar(c.iguais) === false) return 'full'
  // textura que o equals() não vê (a pintada do terreno, amostrada por nó) carregou depois do último refresh total:
  // o grupo de ligação ainda aponta para a provisória, preta (o chão preto perto do Forte, 21/10/2026)
  if (avaliar(c.texturasNovas)) return 'full'
  return novo ? 'shared' : 'none'
}
function avaliar(v) { return typeof v === 'function' ? v() : v }

// Classe do nó pelo type estático do three (sobrevive à minificação do build; constructor.name sai como "_EventNode")
function tipoDoNo(no) { return no.type || (no.constructor && no.constructor.name) || 'No' }
function raizDaPropriedade(no) { return no.properties ? no.properties[0] : String(no.property).split('.')[0] }

// O nó atualiza algo por objeto (ou por passe) que o equals() cobre, ou que vai para o grupo compartilhado (renderGroup,
// frameGroup), que o primeiro objeto de cada material em cada passe já atualiza? lista: 'update' | 'before'.
function aceitaNo(no, lista, { material, objeto, conhecidos, propriedades }) {
  if (conhecidos.has(no)) return true // modelNormalMatrix e modelWorldMatrixInverse: só dependem da matriz de mundo
  if (no.isTextureNode === true) return false // troca de textura por objeto (matriz da textura, alvo...): o equals não vê
  // luzes e sombras: cobertas por getLights/equals (mapa e tamanho do mapa de sombra); os uniforms delas são do renderGroup
  if (no.isAnalyticLightNode === true || no.isShadowBaseNode === true || no.isShadowNode === true || tipoDoNo(no) === 'LightsNode') return true
  const tipo = tipoDoNo(no)
  // o OnBeforeObjectUpdate de matrizInstancia (arcane-tsl.js) só alinha a versão do buffer de cópias com a da
  // instanceMatrix/instanceColor, e a versão dessas o equals() confere: mudou, FULL, e o updateBefore roda.
  if (tipo === 'EventNode') {
    return lista === 'before' && no.eventType === 'beforeObject' && objeto.isInstancedMesh === true
  }
  if (lista !== 'update') return false
  switch (tipo) {
    case 'UniformGroupNode': // o grupo de objeto marca needsUpdate; o grupo render sobe a versão uma vez por passe
    case 'ScreenNode': // tamanho e viewport vão para o renderGroup; o tamanho do alvo o equals confere
    case 'InspectorNode': // só avisa o inspetor do renderer (frame)
      return true
    case 'ModelNode': // modelWorldMatrix, posição, escala e direção saem da matriz de mundo; viewPosition depende da câmera
      return no.scope !== 'viewPosition'
    case 'Object3DNode':
      return no.scope !== 'viewPosition' && no.object3d === objeto
    case 'MaterialReferenceNode': // o grupo é o de objeto: vale se a propriedade é uma das que o equals() compara
      return (no.material == null || no.material === material) && propriedades.includes(raizDaPropriedade(no))
    case 'ReferenceNode': // sombra, neblina...: renderGroup; ou propriedade do próprio material
      return (no.group != null && no.group.shared === true) || (no.object === material && propriedades.includes(raizDaPropriedade(no)))
    default: // uniform()/uniformArray() com atualização por passe ou por quadro: só no grupo compartilhado
      return no.isUniformNode === true && no.groupNode != null && no.groupNode.shared === true
  }
}

// Motivo da recusa ("Classe:updateType", com " (antes)" para o updateBefore) ou null se o nó pode ficar de fora do FULL
function recusaDoNo(no, lista, ctx) {
  const ut = lista === 'before' ? no.updateBeforeType : no.updateType
  if (ut === undefined || ut === null || ut === 'none') return null
  return aceitaNo(no, lista, ctx) ? null : tipoDoNo(no) + ':' + ut + (lista === 'before' ? ' (antes)' : '')
}

function avaliarEstado(estado, renderObject, opc) {
  const ctx = {
    material: renderObject.material,
    objeto: renderObject.object,
    conhecidos: opc.conhecidos || conhecidosDoThree,
    propriedades: opc.propriedades || (estado.observer && estado.observer.refreshUniforms) || [],
  }
  for (const no of estado.updateNodes || []) { const m = recusaDoNo(no, 'update', ctx); if (m) return m }
  for (const no of estado.updateBeforeNodes || []) { const m = recusaDoNo(no, 'before', ctx); if (m) return m }
  // o updateAfter do three só roda fora do NONE; nenhum nó do jogo usa (o do three é só para velocity)
  for (const no of estado.updateAfterNodes || []) {
    if (no.updateAfterType && no.updateAfterType !== 'none') return tipoDoNo(no) + ':' + no.updateAfterType + ' (depois)'
  }
  return true
}

const geracaoVista = new WeakMap() // renderObject -> geracaoTexturas.valor no último refresh total
const veredictos = new WeakMap() // nodeBuilderState -> true | motivo da recusa
// O grupo de uniforms de objeto só pode ficar sem regravação se todo nó com atualização por objeto for do tipo que o
// equals() cobre (aceitaNo). Vale para o shader (nodeBuilderState) inteiro, então é calculado uma vez por shader.
// opc: { conhecidos, propriedades } só para o teste; no jogo vêm do three (estado.observer.refreshUniforms).
export function elegivel(renderObject, opc = {}) {
  const estado = renderObject.getNodeBuilderState()
  let v = veredictos.get(estado)
  if (v === undefined) {
    v = avaliarEstado(estado, renderObject, opc)
    veredictos.set(estado, v)
    if (v === true) estadosElegiveis++
    else recusas[v] = (recusas[v] || 0) + 1
  }
  return v === true
}

// Uma pergunta reaproveitada por chamada (needsRefresh roda milhares de vezes por quadro: nada de alocar). Os campos são
// as condições do needsRefresh original, mais as duas coisas do ramo novo.
const pergunta = {
  obs: null, ro: null, nf: null,
  estatico: () => pergunta.obs.hasNode === true && pergunta.ro.object.static === true,
  animacao: () => pergunta.obs.hasAnimation,
  instanciaDinamica: () => pergunta.obs.hasDynamicInstancing(pergunta.ro.object),
  primeira: () => pergunta.obs.firstInitialization(pergunta.ro),
  velocidade: () => pergunta.obs.needsVelocity(pergunta.nf.renderer),
  elegivel: () => elegivel(pergunta.ro),
  renderIdMudou: () => {
    const { obs, nf } = pergunta
    if (obs.renderId === nf.renderId) return false
    obs.renderId = nf.renderId // o original faz o mesmo antes de chamar equals
    return true
  },
  // geração das texturas carregadas (materiais.js, texturaPintada) vista no último refresh total deste objeto
  texturasNovas: () => {
    const ro = pergunta.ro
    return geracaoVista.get(ro) !== geracaoTexturas.valor // quem devolve FULL grava a geração (remendarObservador)
  },
  iguais: () => {
    const { obs, ro, nf } = pergunta
    try {
      return obs.equals(ro, obs.getLights(ro.lightsNode, nf.renderId), nf.renderId)
    } catch (e) { // estado do observador que não bate com o objeto (luz que ganhou ou perdeu sombra): volta ao FULL de sempre
      if (estatisticas.erros++ === 0) console.warn('Observador de parados: equals() falhou, o objeto segue em refresh total.', e)
      return false
    }
  },
}

// Troca needsRefresh no protótipo do observador (uma vez por página, como cache-sombra-gpu.js faz com o ShadowNode).
// Devolve false se já estava instalado. T = RenderObjectRefreshType.
export function remendarObservador(Observador, T) {
  const proto = Observador.prototype
  if (proto[INSTALADO_OBSERVADOR]) return false
  proto[INSTALADO_OBSERVADOR] = true
  const original = proto.needsRefresh
  const tipos = { none: T.NONE, shared: T.SHARED, full: T.FULL }
  proto.needsRefresh = function (renderObject, nodeFrame) {
    pergunta.obs = this
    pergunta.ro = renderObject
    pergunta.nf = nodeFrame
    const decisao = decidirRefresh(pergunta)
    pergunta.obs = pergunta.ro = pergunta.nf = null
    estatisticas[decisao]++
    const tipo = decisao === 'original' ? original.call(this, renderObject, nodeFrame) : tipos[decisao]
    if (tipo === tipos.full) geracaoVista.set(renderObject, geracaoTexturas.valor)
    return tipo
  }
  return true
}

// O NodeMaterialObserver é exportado por three/webgpu (three.webgpu.js:92007), então o remendo vai direto no protótipo
// dele (sem precisar pegar o protótipo pelo primeiro monitor). Os valores de RenderObjectRefreshType (three.core.js:1724,
// NONE 0, SHARED 1, FULL 2) também; o reserva é só para o caso de a exportação sumir numa versão futura.
function estaticosSemRefreshTotal(renderer) { // o remendo é no protótipo: vale para qualquer renderer
  if (!W.NodeMaterialObserver) {
    console.warn('NodeMaterialObserver não exportado por three/webgpu: parados seguem em refresh total.')
    return
  }
  for (const nome of ['modelNormalMatrix', 'modelWorldMatrixInverse']) if (W[nome]) conhecidosDoThree.add(W[nome])
  remendarObservador(W.NodeMaterialObserver, W.RenderObjectRefreshType || { NONE: 0, SHARED: 1, FULL: 2 })
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
const cenasPercorridas = new WeakSet() // cenas que já tiveram a travessia completa de prepararCenaWebgpu
let relatorioPendente = false // objeto convertido desde a última vez que __faltaPortar/__convertidosTsl foram montados

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
  // O passe de sombra do three não roda o setupPosition do material pintado: _getShadowNodes só copia o
  // material.positionNode para o material da sombra. O pintado ignora positionNode no passe principal (o
  // setupPosition dele é próprio e só lê em malha virtual), então não há aplicação dupla.
  if (tsl?.posicaoSombra && nm.isNodeMaterial) nm.positionNode = tsl.posicaoSombra({ W, ref, original: m })
  return nm
}

// A versão do WebGPU fica com os valores do material original, copiados na troca, e sincronizarSeguidos() repassa
// a cada quadro o que o jogo muda depois (o facho do farol muda opacity todo quadro; o rosto troca o map dos olhos e
// da boca) para chegar ao desenho, como no WebGL. Antes cada propriedade era um getter/setter apontando para o
// original: o renderer lê propriedades de material milhares de vezes por quadro (MaterialReferenceNode, chave de
// pipeline) e cada leitura virava uma chamada de closure (~2% do tempo do thread, KAN-70). Mudança que pede shader
// novo (needsUpdate) já volta pela checagem de versão em prepararCenaWebgpu.
const NAO_SEGUIR = new Set(['uuid', 'id', 'type', 'version', 'name', 'userData', 'onBeforeCompile', 'customProgramCacheKey', 'shadowSide'])
// O que o jogo escreve num material depois de criado, sem needsUpdate (levantado no código em KAN-70): opacity
// (facho do farol em marcos.js, atores em atores.js), map (olhos e boca em rosto.js). A cor e a emissão dos
// vidros, lanternas, janelas acesas, horizonte e nuvens mudam no próprio objeto Color (color.copy, emissive.copy),
// que as duas versões compartilham; aqui só vale troca de objeto. As outras ficam por garantia. Quem passar a
// escrever outra propriedade de material em jogo precisa entrar nesta lista.
export const DINAMICAS = ['color', 'opacity', 'transparent', 'visible', 'map', 'alphaMap', 'emissive', 'emissiveIntensity', 'side',
  'depthWrite', 'depthTest', 'alphaTest', 'blending', 'gradientMap']
const DINAMICAS_SET = new Set(DINAMICAS)
export const seguidos = [] // [original, versão do WebGPU, chaves dinâmicas que as duas têm]
export function seguirOriginal(m, nm) {
  const chaves = []
  for (const k of Object.keys(m)) {
    if (NAO_SEGUIR.has(k) || k.startsWith('is') || k.startsWith('_') || typeof m[k] === 'function') continue
    if (!(k in nm)) continue
    nm[k] = m[k] // Color, Vector e textura vão por referência: mudança no próprio objeto chega sozinha
    if (DINAMICAS_SET.has(k)) chaves.push(k)
  }
  seguidos.push([m, nm, chaves])
}

// Repassa à versão do WebGPU o que mudou no original. Só atribui quando o valor difere: assim os setters do three
// (alphaTest, transparent) sobem a versão do material nas mesmas ocasiões em que subiriam no original.
export function sincronizarSeguidos(lista = seguidos) {
  for (let i = 0; i < lista.length; i++) {
    const [m, nm, chaves] = lista[i]
    for (let j = 0; j < chaves.length; j++) {
      const k = chaves[j]
      if (nm[k] !== m[k]) nm[k] = m[k]
    }
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
      // a copa do coqueiro tem uma máscara só da sombra (mundo/vegetacao.js, cfg.mundo.sombraCopaCheia)
      if (m.alphaMap) a = a.mul(texture(m.userData.alphaMapSombra || m.alphaMap, uv()).onRenderUpdate(() => m.userData.alphaMapSombra || m.alphaMap).g)
      Discard(a.lessThan(m.alphaTest))
      return vec4(0, 0, 0, 1)
    })()
  }
}

// Converte o objeto para a versão do WebGPU, se ele é novo ou trocou de material (o corpo do jogador, blocos que
// nascem andando). Devolve se converteu. Chamada pelo gancho em prepararObjetoAoDesenhar, no primeiro desenho do
// objeto, e pela travessia inicial de prepararCenaWebgpu.
export function converterObjeto(o, converte = converter) {
  if (o.isInstancedMesh && !visto.has(o)) { duasCopias(o); quantidadeFixa(o) }
  if (!o.material || visto.get(o) === o.material) return false
  if (Array.isArray(o.material)) o.material = o.material.map((m) => converte(m, o))
  else o.material = converte(o.material, o)
  visto.set(o, o.material)
  relatorioPendente = true
  return true
}

// O material que o three recebe em renderObject vem da lista de desenho, montada antes da troca (antes é o
// object.material de quando o gancho foi chamado). Passar o velho faria o three achar o RenderObject e compilar o
// pipeline do material do WebGL (o bug que a conversão antecipada evitava). Devolve o convertido do mesmo material:
// no array, o de mesmo índice; senão o único; e, se o objeto já estava convertido (outro passe do mesmo quadro
// converteu antes, com a lista já montada), a versão guardada em trocas.
export function materialParaDesenho(object, materialArg, antes, convertidoDe = (m) => trocas.get(m)) {
  const depois = object.material
  if (Array.isArray(antes) && Array.isArray(depois)) {
    const i = antes.indexOf(materialArg)
    if (i >= 0) return depois[i]
  } else if (materialArg === antes) return depois
  return convertidoDe(materialArg) ?? materialArg
}

// Prepara os materiais para o WebGPU. Roda antes de todo quadro (main.js), mas já não percorre a cena: o objeto
// novo ou com material trocado é convertido pelo gancho em renderObject, no primeiro desenho, e o material certo já
// sai nele (antes, a troca vinha 2 s depois e o shader era montado duas vezes). Por quadro, só:
// - o laço de versões: original marcado para recompilar (needsUpdate: roupa e pano somam código depois de criados)
//   tem a versão do WebGPU montada de novo, lendo os ganchos atuais;
// - sincronizarSeguidos(): repassa o que o jogo muda em material sem needsUpdate;
// - o relatório (__faltaPortar/__convertidosTsl), se o gancho converteu algo.
// A travessia completa fica para a primeira chamada de cada cena: main.js chama uma vez antes de prepararMotorPlaca, e
// o compileAsync da vg precisa ver os materiais já convertidos.
export function prepararCenaWebgpu(cena) {
  for (const [m, v] of versoes) {
    if (m.version === v) continue
    versoes.set(m, m.version)
    const nm = trocas.get(m)
    if (nm !== m) nm.needsUpdate = true
  }
  sincronizarSeguidos()
  if (!cenasPercorridas.has(cena)) {
    cenasPercorridas.add(cena)
    cena.traverse((o) => { converterObjeto(o) })
  }
  if (relatorioPendente) {
    relatorioPendente = false
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
