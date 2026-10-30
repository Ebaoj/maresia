// KAN-70, briefing 5: parados sem refresh total no WebGPU (estaticosSemRefreshTotal em renderizador.js e o.static em
// congelar.js). Sem GPU: a tabela de decisão pura, listas de nós falsas e, para o que depende do three de verdade, os
// nós e o NodeMaterialObserver reais do three/webgpu (o remendo entra numa subclasse, não no protótipo do three).
//
// Bugs que estes testes pegam:
//  - parado que mudou (matriz, cor do material, cópias novas) devolver NONE e ficar com o uniform velho na tela;
//  - objeto que se mexe, tem esqueleto ou cópias dinâmicas deixar de cair no needsRefresh original;
//  - firstInitialization rodar duas vezes, ou em objeto que não é parado (o original não registra esses);
//  - o primeiro objeto de cada material em cada passe não devolver SHARED (o sol e a sombra não atualizariam);
//  - nó que o equals() não cobre (textura por objeto, uniform solto no grupo de objeto, posição na vista) ser aceito;
//  - nó que o equals() cobre ser recusado e a otimização não pegar em ninguém;
//  - o three mudar a exportação do observador ou os valores NONE/SHARED/FULL sem o jogo perceber;
//  - o remendo ser instalado duas vezes, ou congelar() esquecer de marcar static.
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import * as WG from 'three/webgpu'
import * as TSL from 'three/tsl'
import { decidirRefresh, elegivel, estatisticasObservador, remendarObservador } from '../../src/render/renderizador.js'
import { alternarCongelamento, congelar } from '../../src/mundo/congelar.js'

const W = { ...TSL, ...WG }
const T = { NONE: 0, SHARED: 1, FULL: 2 }

const base = { estatico: true, animacao: false, instanciaDinamica: false, primeira: false, velocidade: false, elegivel: true, renderIdMudou: false, iguais: true }
const decide = (campos) => decidirRefresh({ ...base, ...campos })

describe('tabela de decisão', () => {
  // Bug: chão preto perto do Forte (497, 133) e na Praia de Iracema, só no WebGPU (corrigido no commit do chão, 21/10/2026).
  // O pedaço do terreno desenhado nos primeiros quadros, antes de a textura pintada (areia.jpg) chegar, ficava com a
  // textura provisória (preta) no grupo de ligação: parado e igual, caía no NONE e nunca mais refazia. A textura
  // pintada multiplica a cor, e preto vezes tudo dá preto. Textura nova carregada depois do último refresh total pede FULL.
  it('parado igual, mas com textura carregada depois do último refresh total -> full', () => {
    expect(decide({ texturasNovas: true })).toBe('full')
    expect(decide({ texturasNovas: true, renderIdMudou: true })).toBe('full')
    expect(decide({ texturasNovas: false })).toBe('none')
  })
  it('não estático -> original', () => {
    expect(decide({ estatico: false })).toBe('original')
  })
  it('estático com animação -> original', () => {
    expect(decide({ animacao: true })).toBe('original')
  })
  it('estático com cópias dinâmicas -> original', () => {
    expect(decide({ instanciaDinamica: true })).toBe('original')
  })
  it('primeira vez do objeto -> original', () => {
    expect(decide({ primeira: true })).toBe('original')
  })
  it('passe com velocity -> original', () => {
    expect(decide({ velocidade: true })).toBe('original')
  })
  it('estático não elegível -> original', () => {
    expect(decide({ elegivel: false })).toBe('original')
  })
  it('estático, elegível, renderId igual, iguais -> none', () => {
    expect(decide({})).toBe('none')
  })
  it('renderId mudou e iguais -> shared', () => {
    expect(decide({ renderIdMudou: true })).toBe('shared')
  })
  it('não iguais -> full, com o renderId igual ou novo', () => {
    expect(decide({ iguais: false })).toBe('full')
    expect(decide({ iguais: false, renderIdMudou: true })).toBe('full')
  })

  it('só avalia o que a decisão precisa, na ordem do needsRefresh original', () => {
    const ordem = []
    const f = (nome, valor) => () => { ordem.push(nome); return valor }
    // não estático: nada além de estatico (firstInitialization não roda: o original com hasNode também não rodava)
    decidirRefresh({ ...base, estatico: f('estatico', false), animacao: f('animacao', false), primeira: f('primeira', true), iguais: f('iguais', true) })
    expect(ordem).toEqual(['estatico'])
    // parado que chega ao fim: firstInitialization uma vez, renderId antes de equals, equals sempre
    ordem.length = 0
    const r = decidirRefresh({
      estatico: f('estatico', true), animacao: f('animacao', false), instanciaDinamica: f('instanciaDinamica', false),
      primeira: f('primeira', false), velocidade: f('velocidade', false), elegivel: f('elegivel', true),
      renderIdMudou: f('renderIdMudou', true), iguais: f('iguais', true),
    })
    expect(r).toBe('shared')
    expect(ordem).toEqual(['estatico', 'animacao', 'instanciaDinamica', 'primeira', 'velocidade', 'elegivel', 'renderIdMudou', 'iguais'])
  })
})

// --- elegivel com listas falsas -------------------------------------------------------------------------------

const material = { color: {}, isNodeMaterial: true }
const PROPS = ['color', 'opacity', 'map', 'emissive']
const grupoCompartilhado = { shared: true }
const grupoObjeto = { shared: false }
const no = (type, updateType, extra = {}) => ({ type, updateType, ...extra })
let contador = 0
function objetoCom({ update = [], antes = [], depois = [], instanciado = false, observer = { refreshUniforms: PROPS } } = {}) {
  // cada chamada cria um nodeBuilderState novo (o veredito é guardado por ele)
  contador++
  const estado = { updateNodes: update, updateBeforeNodes: antes, updateAfterNodes: depois, observer, id: contador }
  return { material, object: { isInstancedMesh: instanciado }, getNodeBuilderState: () => estado }
}

describe('elegivel (nós falsos)', () => {
  it('uniform de grupo compartilhado passa, em render ou frame', () => {
    const a = no('UniformNode', 'render', { isUniformNode: true, groupNode: grupoCompartilhado })
    const b = no('UniformNode', 'frame', { isUniformNode: true, groupNode: grupoCompartilhado })
    const c = no('UniformArrayNode', 'render', { isUniformNode: true, groupNode: grupoCompartilhado })
    expect(elegivel(objetoCom({ update: [a, b, c] }))).toBe(true)
  })

  it('uniform solto no grupo de objeto, em render ou frame, reprova (o valor ficaria velho)', () => {
    for (const ut of ['render', 'frame', 'object']) {
      const solto = no('UniformNode', ut, { isUniformNode: true, groupNode: grupoObjeto })
      expect(elegivel(objetoCom({ update: [solto] }))).toBe(false)
    }
  })

  it('TextureNode com atualização por objeto reprova', () => {
    const t = no('TextureNode', 'object', { isTextureNode: true, isUniformNode: true, groupNode: grupoCompartilhado })
    expect(elegivel(objetoCom({ update: [t] }))).toBe(false)
  })

  it('ModelNode, grupo de objeto, referências ao material e luzes passam', () => {
    const nos = [
      no('ModelNode', 'object', { scope: 'worldMatrix' }),
      no('UniformGroupNode', 'object', { isUniformGroup: true }),
      no('MaterialReferenceNode', 'object', { isMaterialReferenceNode: true, property: 'color', material: null }),
      no('MaterialReferenceNode', 'object', { isMaterialReferenceNode: true, property: 'opacity', material }),
      no('ReferenceNode', 'object', { property: 'intensity', object: {}, group: grupoCompartilhado }),
      no('ReferenceNode', 'object', { property: 'map', object: material, group: null }),
      no('DirectionalLightNode', 'frame', { isAnalyticLightNode: true }),
      no('HemisphereLightNode', 'frame', { isAnalyticLightNode: true }),
      no('InspectorNode', 'frame', { isInspectorNode: true }),
      no('ScreenNode', 'render'),
    ]
    expect(elegivel(objetoCom({ update: nos, antes: [no('ShadowNode', 'none', { isShadowNode: true, updateBeforeType: 'render' })] }))).toBe(true)
  })

  it('ShadowNode no updateBefore (por passe) passa', () => {
    const sombra = { type: 'ShadowNode', isShadowNode: true, updateType: 'none', updateBeforeType: 'render' }
    expect(elegivel(objetoCom({ antes: [sombra] }))).toBe(true)
  })

  it('referência que o equals() não vê reprova', () => {
    const doObjeto = no('ReferenceNode', 'object', { property: 'bindMatrix', object: null, group: null })
    expect(elegivel(objetoCom({ update: [doObjeto] }))).toBe(false)
    const deLuzSemGrupo = no('ReferenceNode', 'object', { property: 'bias', object: { bias: 0 }, group: null })
    expect(elegivel(objetoCom({ update: [deLuzSemGrupo] }))).toBe(false)
    const propriedadeFora = no('MaterialReferenceNode', 'object', { isMaterialReferenceNode: true, property: 'userData', material: null })
    expect(elegivel(objetoCom({ update: [propriedadeFora] }))).toBe(false)
    const outroMaterial = no('MaterialReferenceNode', 'object', { isMaterialReferenceNode: true, property: 'color', material: {} })
    expect(elegivel(objetoCom({ update: [outroMaterial] }))).toBe(false)
  })

  it('posição na vista depende da câmera e reprova; as outras escalas de ModelNode passam', () => {
    expect(elegivel(objetoCom({ update: [no('ModelNode', 'object', { scope: 'viewPosition' })] }))).toBe(false)
    for (const scope of ['position', 'scale', 'direction', 'radius']) {
      expect(elegivel(objetoCom({ update: [no('ModelNode', 'object', { scope })] }))).toBe(true)
    }
  })

  it('evento por objeto reprova; o de antes do desenho (cópias) só passa em objeto com cópias', () => {
    const porObjeto = no('EventNode', 'object', { eventType: 'object' })
    expect(elegivel(objetoCom({ update: [porObjeto] }))).toBe(false)
    const copias = { type: 'EventNode', updateType: 'none', updateBeforeType: 'object', eventType: 'beforeObject' }
    expect(elegivel(objetoCom({ antes: [copias], instanciado: true }))).toBe(true)
    expect(elegivel(objetoCom({ antes: [copias], instanciado: false }))).toBe(false)
    const depoisDoDesenho = { type: 'EventNode', updateType: 'none', updateAfterType: 'object', eventType: 'afterObject' }
    expect(elegivel(objetoCom({ depois: [depoisDoDesenho], instanciado: true }))).toBe(false)
  })

  it('classe que não reconhece reprova, em qualquer lista', () => {
    expect(elegivel(objetoCom({ update: [no('UserDataNode', 'object')] }))).toBe(false)
    expect(elegivel(objetoCom({ antes: [{ type: 'ViewportTextureNode', isTextureNode: true, updateBeforeType: 'render', updateType: 'none' }] }))).toBe(false)
  })

  it('nó sem atualização não pesa, e o nó único do three passa por identidade', () => {
    const quieto = no('UniformNode', 'none', { isUniformNode: true, groupNode: grupoObjeto })
    expect(elegivel(objetoCom({ update: [quieto] }))).toBe(true)
    const normal = no('UniformNode', 'object', { isUniformNode: true, groupNode: grupoObjeto })
    expect(elegivel(objetoCom({ update: [normal] }))).toBe(false)
    expect(elegivel(objetoCom({ update: [normal] }), { conhecidos: new Set([normal]) })).toBe(true)
  })

  it('calcula uma vez por shader (nodeBuilderState)', () => {
    let leituras = 0
    const lista = [no('UniformNode', 'render', { isUniformNode: true, groupNode: grupoCompartilhado })]
    const estado = { get updateNodes() { leituras++; return lista }, updateBeforeNodes: [], updateAfterNodes: [], observer: { refreshUniforms: PROPS } }
    const ro = { material, object: {}, getNodeBuilderState: () => estado }
    expect(elegivel(ro)).toBe(true)
    expect(elegivel(ro)).toBe(true)
    expect(elegivel(ro)).toBe(true)
    expect(leituras).toBe(1)
  })

  it('a recusa fica nas estatísticas com a classe e o tipo de atualização', () => {
    const antes = estatisticasObservador().recusas['TextureNode:object'] || 0
    elegivel(objetoCom({ update: [no('TextureNode', 'object', { isTextureNode: true })] }))
    expect(estatisticasObservador().recusas['TextureNode:object']).toBe(antes + 1)
  })
})

// --- os nós de verdade do three ---------------------------------------------------------------------------------

describe('elegivel (nós do three 0.186)', () => {
  const conhecidos = new Set([W.modelNormalMatrix, W.modelWorldMatrixInverse])
  const alvo = { object: { isInstancedMesh: false }, material }
  const checar = (nos, esperado, antes = []) => {
    const ro = { ...alvo, getNodeBuilderState: () => ({ updateNodes: nos, updateBeforeNodes: antes, updateAfterNodes: [], observer: { refreshUniforms: PROPS } }) }
    expect(elegivel(ro, { conhecidos })).toBe(esperado)
  }

  it('o three tem o que o jogo usa: type por classe, flags e valores', () => {
    expect(W.ModelNode.type).toBe('ModelNode')
    expect(W.UniformGroupNode.type).toBe('UniformGroupNode')
    expect(W.EventNode.type).toBe('EventNode')
    expect(W.ReferenceNode.type).toBe('ReferenceNode')
    expect(W.MaterialReferenceNode.type).toBe('MaterialReferenceNode')
    expect(W.ScreenNode.type).toBe('ScreenNode')
    expect(W.InspectorNode.type).toBe('InspectorNode')
    expect(W.objectGroup.updateType).toBe('object')
    expect(W.renderGroup.shared).toBe(true)
    expect(W.objectGroup.shared).toBe(false)
  })

  it('uniform do jogo (ref: renderGroup + render) passa; uniform() solto, não', () => {
    const doJogo = W.uniform(1).setGroup(W.renderGroup).onRenderUpdate(() => 2)
    checar([doJogo], true)
    const solto = W.uniform(1).onRenderUpdate(() => 2) // cai no objectGroup
    checar([solto], false)
    checar([W.uniform(1).onObjectUpdate(() => 3)], false)
  })

  it('modelWorldMatrix, a matriz de normais e o grupo de objeto passam; posição na vista não', () => {
    checar([W.modelWorldMatrix, W.modelNormalMatrix, W.objectGroup, W.renderGroup], true)
    checar([W.modelViewPosition], false)
  })

  it('referências: a do material e a de sombra (renderGroup) passam; a do objeto não', () => {
    checar([W.materialReference('color', 'color'), W.materialReference('opacity', 'float')], true)
    checar([W.materialReference('userData', 'float')], false)
    checar([W.reference('intensity', 'float', { intensity: 1 }).setGroup(W.renderGroup)], true)
    checar([W.reference('bindMatrix', 'mat4')], false)
  })

  it('TextureNode com atualização por objeto, ou evento por objeto, não passam', () => {
    const textura = W.texture(new THREE.Texture())
    textura.updateType = 'object'
    checar([textura], false)
    checar([new W.EventNode('object', () => {})], false)
    checar([], false, [new W.EventNode('beforeObject', () => {})]) // objeto sem cópias: o evento de cópias não é o dele
  })
})

// --- o observador de verdade com o remendo ---------------------------------------------------------------------

function cenarioReal() {
  class Observador extends W.NodeMaterialObserver {}
  const mat = new THREE.MeshBasicMaterial()
  mat.colorNode = { isNode: true } // containsNode: qualquer propriedade *Node vale
  const objeto = new THREE.Mesh(new THREE.BufferGeometry(), mat)
  objeto.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3))
  objeto.static = true
  objeto.updateMatrixWorld(true)
  const observer = new Observador({ material: mat, object: objeto, context: {} })
  observer.refreshUniforms = [...observer.refreshUniforms]
  const luzes = { getBuiltinLights: () => [] }
  const estado = { updateNodes: [W.modelWorldMatrix, W.objectGroup], updateBeforeNodes: [], updateAfterNodes: [], observer }
  const ro = {
    object: objeto, material: mat, geometry: objeto.geometry, lightsNode: luzes, bundle: null,
    context: { width: 100, height: 100 }, scene: { environment: null, environmentIntensity: 1, environmentRotation: new THREE.Euler() },
    getNodeBuilderState: () => estado,
    // r187: o observador confere se os buffers foram descartados (attributes.disposeVersion, has)
    _geometries: { attributes: { disposeVersion: 0, has: () => true } }, getVertexBuffers: () => [], getIndex: () => null,
  }
  // r187: o observador lê o alvo de saída do renderer (getRenderTarget, getOutputRenderTarget, getCanvasTarget)
  const canvasAlvo = {}
  const renderer = { getMRT: () => null, getRenderTarget: () => null, getOutputRenderTarget: () => null, getCanvasTarget: () => canvasAlvo }
  ro.renderer = renderer
  const frame = (renderId) => ({ renderId, renderer })
  return { Observador, observer, objeto, mat, ro, frame, estado }
}

describe('NodeMaterialObserver real com o remendo', () => {
  it('o three exporta o observador e os tipos de refresh que o remendo usa', () => {
    expect(typeof WG.NodeMaterialObserver).toBe('function')
    expect(WG.RenderObjectRefreshType).toEqual(T)
    for (const m of ['needsRefresh', 'equals', 'getLights', 'firstInitialization', 'hasDynamicInstancing', 'needsVelocity']) {
      expect(typeof WG.NodeMaterialObserver.prototype[m]).toBe('function')
    }
    expect(new THREE.Object3D().static).toBe(false)
  })

  it('sem o remendo o three devolve FULL sempre (o que o remendo existe para tirar)', () => {
    const { observer, ro, frame } = cenarioReal()
    expect(observer.hasNode).toBe(true)
    expect(observer.needsRefresh(ro, frame(1))).toBe(T.FULL)
    expect(observer.needsRefresh(ro, frame(1))).toBe(T.FULL)
  })

  it('parado: primeira vez FULL, depois SHARED no primeiro de cada passe e NONE no resto', () => {
    const { Observador, observer, ro, frame } = cenarioReal()
    expect(remendarObservador(Observador, T)).toBe(true)
    estatisticasObservador(true)
    expect(observer.needsRefresh(ro, frame(1))).toBe(T.FULL) // primeira vez
    expect(observer.needsRefresh(ro, frame(1))).toBe(T.SHARED) // renderId novo para o observador
    expect(observer.needsRefresh(ro, frame(1))).toBe(T.NONE)
    expect(observer.needsRefresh(ro, frame(1))).toBe(T.NONE)
    expect(observer.needsRefresh(ro, frame(2))).toBe(T.SHARED) // outro passe
    expect(observer.needsRefresh(ro, frame(2))).toBe(T.NONE)
    expect(estatisticasObservador()).toMatchObject({ original: 1, shared: 2, none: 3, full: 0, erros: 0 })
  })

  it('o que muda aparece: matriz de mundo, cor e opacidade do material, cópias novas, geometria', () => {
    const { Observador, observer, ro, frame, objeto, mat } = cenarioReal()
    remendarObservador(Observador, T)
    let id = 1
    const assentar = () => { id++; observer.needsRefresh(ro, frame(id)); expect(observer.needsRefresh(ro, frame(id))).toBe(T.NONE) }
    observer.needsRefresh(ro, frame(id)) // primeira vez
    assentar()

    objeto.position.x = 3 // mexeu na matriz de mundo
    objeto.updateMatrixWorld(true)
    id++
    expect(observer.needsRefresh(ro, frame(id))).toBe(T.FULL)
    assentar()

    mat.color.set('#ff0000') // janela acesa, lanterna...
    id++
    expect(observer.needsRefresh(ro, frame(id))).toBe(T.FULL)
    assentar()

    mat.opacity = 0.5 // facho do farol
    id++
    expect(observer.needsRefresh(ro, frame(id))).toBe(T.FULL)
    assentar()

    objeto.geometry.attributes.position.needsUpdate = true // versão do atributo
    id++
    expect(observer.needsRefresh(ro, frame(id))).toBe(T.FULL)
    assentar()
  })

  it('bloco de cópias: instanceMatrix nova sobe a versão e vira FULL (bolas e cocos congelados)', () => {
    const { Observador, observer, ro, frame, mat, estado } = cenarioReal()
    remendarObservador(Observador, T)
    const bloco = new THREE.InstancedMesh(ro.geometry, mat, 4)
    bloco.static = true
    bloco.updateMatrixWorld(true)
    const estadoBloco = { ...estado, updateBeforeNodes: [new W.EventNode('beforeObject', () => {})] }
    const roBloco = { ...ro, object: bloco, getNodeBuilderState: () => estadoBloco }
    observer.needsRefresh(roBloco, frame(1))
    observer.needsRefresh(roBloco, frame(2))
    expect(observer.needsRefresh(roBloco, frame(2))).toBe(T.NONE)
    bloco.setMatrixAt(0, new THREE.Matrix4().makeTranslation(1, 0, 0))
    bloco.instanceMatrix.needsUpdate = true
    expect(observer.needsRefresh(roBloco, frame(3))).toBe(T.FULL)
    expect(observer.needsRefresh(roBloco, frame(3))).toBe(T.NONE)
  })

  it('o que o remendo não decide cai no original: não parado, esqueleto, cópias dinâmicas, nó que o equals não vê', () => {
    const { Observador, observer, ro, frame, objeto, estado } = cenarioReal()
    remendarObservador(Observador, T)
    estatisticasObservador(true)
    observer.needsRefresh(ro, frame(1))
    observer.needsRefresh(ro, frame(2))
    expect(observer.needsRefresh(ro, frame(2))).toBe(T.NONE)

    objeto.static = false // voltou a se mexer (alternarCongelamento(false))
    expect(observer.needsRefresh(ro, frame(2))).toBe(T.FULL)
    objeto.static = true
    expect(observer.needsRefresh(ro, frame(2))).toBe(T.NONE)

    observer.hasAnimation = true
    expect(observer.needsRefresh(ro, frame(2))).toBe(T.FULL)
    observer.hasAnimation = false

    // outro shader (o veredito é guardado por shader), com textura atualizada por objeto
    const estadoOutro = { ...estado, updateNodes: [W.texture(new THREE.Texture()).onObjectUpdate(() => null)] }
    const roOutro = { ...ro, getNodeBuilderState: () => estadoOutro }
    observer.needsRefresh(roOutro, frame(2)) // primeira vez do roOutro
    expect(observer.needsRefresh(roOutro, frame(2))).toBe(T.FULL) // textura por objeto: original
    expect(estatisticasObservador().original).toBe(5)
  })

  it('equals que falha (estado do observador fora do objeto) volta ao FULL de sempre', () => {
    const { Observador, observer, ro, frame } = cenarioReal()
    remendarObservador(Observador, T)
    observer.needsRefresh(ro, frame(1))
    const equals = observer.equals
    observer.equals = () => { throw new Error('luz nova') }
    const antes = estatisticasObservador().erros
    const aviso = console.warn
    console.warn = () => {}
    try { expect(observer.needsRefresh(ro, frame(2))).toBe(T.FULL) } finally { console.warn = aviso }
    expect(estatisticasObservador().erros).toBe(antes + 1)
    observer.equals = equals
  })

  it('instalar duas vezes não embrulha duas vezes', () => {
    class Falso { needsRefresh() { return T.FULL } }
    expect(remendarObservador(Falso, T)).toBe(true)
    const embrulhado = Falso.prototype.needsRefresh
    expect(remendarObservador(Falso, T)).toBe(false)
    expect(Falso.prototype.needsRefresh).toBe(embrulhado)
  })
})

describe('congelar marca static', () => {
  it('congelar() liga static e alternarCongelamento() acompanha', () => {
    const o = new THREE.Object3D()
    expect(o.static).toBe(false)
    expect(congelar(o)).toBe(o)
    expect(o.static).toBe(true)
    expect(o.matrixAutoUpdate).toBe(false)
    alternarCongelamento(false)
    expect(o.static).toBe(false)
    expect(o.matrixAutoUpdate).toBe(true)
    alternarCongelamento(true)
    expect(o.static).toBe(true)
    expect(o.matrixAutoUpdate).toBe(false)
  })
})
