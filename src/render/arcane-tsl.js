// Visual Arcane em TSL, para o modo webgpu (motor F1 KAN-67, F2 KAN-68): o mesmo pintar() de materiais.js, que
// no WebGL entra como código GLSL injetado (onBeforeCompile) e no WebGPU não roda.
// - cor: a cor de sempre (mapa, cor por vértice, cor por cópia), o código extra do material (fachada, janela...)
//   e por cima a textura pintada em três eixos, as manchas grandes ("massa") e o tom da pincelada
// - luz: a luz recebida (direta + ambiente + lampiões) vira três faixas (sombra fria, meio-tom, luz com a cor
//   do sol), com a borda recortada pela pincelada e a luz de recorte nas bordas contra o sol
// - segunda saída (gLuz): quanta luz chega e quanto o material brilha, que o filtro de quadrinho lê
// As contas seguem o GLSL linha a linha; os nomes são os mesmos para comparar.
// Os uniforms são os mesmos objetos do WebGL (ref): o painel muda os dois juntos.

import { globais } from '../globais.js'
import { ref, funcoes, modulo } from './gpu/comum.js'

let T = null // funções do shader, montadas uma vez
let Classe = null

function montar(W) {
  const { Fn, vec2, vec3, pow, abs } = W
  const { ruido } = funcoes()
  const traco = Fn(([uv]) => ruido(uv.mul(vec2(0.6, 2.8))).mul(0.55)
    .add(ruido(uv.mul(vec2(1.7, 7.0)).add(3.1)).mul(0.3))
    .add(ruido(uv.mul(vec2(5.0, 18.0)).add(7.7)).mul(0.15)))
    .setLayout({ name: 'aTraco', type: 'float', inputs: [{ name: 'uv', type: 'vec2' }] })
  // a escala vem como argumento: função com assinatura declarada não enxerga uniform de fora no WGSL
  const pinceladaFn = Fn(([p0, n, escala]) => {
    const w = pow(abs(n), vec3(4.0)).toVar()
    w.divAssign(w.x.add(w.y).add(w.z).add(1e-4))
    const p = p0.mul(escala)
    // mat2(0.87, -0.5, 0.5, 0.87) * p.xz do GLSL (matriz por colunas)
    const giro = vec2(p.x.mul(0.87).add(p.z.mul(0.5)), p.x.mul(-0.5).add(p.z.mul(0.87)))
    return traco(p.zy).mul(w.x).add(traco(giro).mul(w.y)).add(traco(p.xy).mul(w.z))
  }).setLayout({ name: 'aPincelada', type: 'float', inputs: [{ name: 'p', type: 'vec3' }, { name: 'n', type: 'vec3' }, { name: 'escala', type: 'float' }] })
  const pincelada = (p, n) => pinceladaFn(p, n, ref(globais.uPincelEscala))
  T = { ruido, pincelada }
}

// fator da textura pintada e da pincelada sobre a cor (o bloco do normal_fragment_begin)
function fatorPintado(W, tp, nMundo) {
  const { vec2, vec3, texture, positionWorld, attribute, mix, pow, abs, dot, max, step, float, normalize } = W
  const n = normalize(nMundo)
  const pW = positionWorld
  let fator = vec3(1.0)
  if (tp) {
    const wT = pow(abs(n), vec3(4.0)).toVar()
    wT.divAssign(wT.x.add(wT.y).add(wT.z).add(1e-4))
    const tri = (topo, lado, p) => texture(lado, p.zy).rgb.mul(wT.x).add(texture(topo, p.xz).rgb.mul(wT.y)).add(texture(lado, p.xy).rgb.mul(wT.z))
    let det = tri(tp.topo, tp.lado, pW.div(tp.tam))
    if (tp.alt) det = mix(det, tri(tp.alt, tp.alt, pW.div(tp.tamAlt)), step(0.5, attribute('aTexAlt', 'float')))
    // massa: a mesma textura 9 vezes maior e girada (vec2 * mat2(0.8, -0.6, 0.6, 0.8) do GLSL)
    const pM = pW.div(tp.tam * 9.0)
    const g = (v) => vec2(v.x.mul(0.8).sub(v.y.mul(0.6)), v.x.mul(0.6).add(v.y.mul(0.8)))
    const macT = texture(tp.lado, g(pM.zy)).rgb.mul(wT.x).add(texture(tp.topo, g(pM.xz)).rgb.mul(wT.y)).add(texture(tp.lado, g(pM.xy)).rgb.mul(wT.z))
    const macL = dot(macT.mul(2.0), vec3(0.333))
    const detN = float(1.0).add(det.mul(2.0).sub(1.0).mul(tp.contraste)).mul(float(1.0).add(macL.sub(1.0).mul(tp.massa)))
    fator = mix(vec3(1.0), max(detN, vec3(0.0)), ref(globais.uTexForca).mul(ref(globais.uArcane)))
  }
  const uPincel = ref(globais.uPincel)
  const bp = T.pincelada(pW, n)
  const tom = T.ruido(pW.xz.mul(0.02).add(pW.y.mul(0.013)))
  return { fator: fator.mul(float(1.0).add(bp.sub(0.5).mul(uPincel))), tom, uPincel }
}

function criarClasse(W) {
  const { vec2, vec3, vec4, mat3, dot, max, min, clamp, mix, smoothstep, pow, abs, normalize, float, texture, step,
    positionWorld, positionLocal, normalLocal, normalView, faceDirection, cameraPosition, diffuseColor, BRDF_Lambert, property, mrt,
    modelWorldMatrix, varyingProperty } = W
  const LUM = vec3(0.299, 0.587, 0.114)
  const ModeloToon = new W.MeshToonNodeMaterial().setupLightingModel().constructor // não exportado no 0.170

  class ModeloArcane extends ModeloToon {
    constructor(material) { super(); this.material = material }

    // luz direta igual ao RE_Direct_Toon do GLSL: normal da geometria em espaço de vista (o do three 0.170 usa
    // a normal do objeto contra a direção da luz em espaço de vista, e a luz girava com a câmera)
    direct({ lightDirection, lightColor, reflectedLight }) {
      const m = this.material
      // normal própria do material (areia fina: pela altura no fragmento), senão a da geometria
      const n = this.material.normalLuz || (m.side === 2 ? normalView.mul(faceDirection) : normalView) // 2 = DoubleSide
      const coord = vec2(dot(n, lightDirection).mul(0.5).add(0.5), 0.0)
      let grad
      if (m.gradientMap) grad = vec3(texture(m.gradientMap, coord).r)
      else {
        const fw = W.fwidth(coord).mul(0.5)
        grad = mix(vec3(0.7), vec3(1.0), smoothstep(float(0.7).sub(fw.x), float(0.7).add(fw.x), coord.x))
      }
      reflectedLight.directDiffuse.addAssign(grad.mul(lightColor).mul(BRDF_Lambert({ diffuseColor: diffuseColor.rgb })))
    }

    indirect(ctx, stack, builder) {
      super.indirect(ctx, stack, builder)
      const { directDiffuse, indirectDiffuse } = ctx.reflectedLight
      // lampiões a gás (cenografia.js): poça de luz quente em volta, no chão e nas paredes, à noite
      // (máscara em vez de if: a amostra de textura não pode ficar dentro de condição no WGSL)
      const uvL = positionWorld.xz.sub(ref(globais.uLampMin)).div(ref(globais.uLampTam))
      const dentro = step(0.0, uvL.x).mul(step(uvL.x, 1.0)).mul(step(0.0, uvL.y)).mul(step(uvL.y, 1.0))
      const lamp = texture(globais.tLampioes.value, uvL)
      const dyL = positionWorld.y.sub(lamp.g)
      const faixaL = float(1.0).sub(smoothstep(0.3, 2.5, dyL)).mul(float(1.0).sub(smoothstep(4.5, 7.0, dyL.negate())))
      const uNoite = ref(globais.uNoite)
      directDiffuse.addAssign(diffuseColor.rgb.mul(ref(globais.uCorLamp)).mul(min(lamp.r, 0.8)).mul(faixaL).mul(uNoite).mul(1.5)
        .mul(dentro).mul(step(0.01, uNoite)))

      // segunda saída: quanta luz chega aqui, sem a cor do material (0 = breu, 1 = sol cheio)
      const albL = max(BRDF_Lambert({ diffuseColor: diffuseColor.rgb }), vec3(1e-3))
      const irrL = directDiffuse.add(indirectDiffuse).div(albL)
      const lumA = dot(irrL, LUM).div(max(ref(globais.uLuzRef), 0.05))
      this.material.gLuz.assign(vec4(lumA, dot(this.material.emissivoTotal, LUM), 0.0, 1.0))

      // PINTOR DE LUZ (visual Arcane): três faixas pintadas, borda recortada pela pincelada presa ao mundo
      const pesoIrr = max(dot(irrL, LUM), 1e-3)
      const tomA = clamp(irrL.div(pesoIrr), 0.0, 2.0)
      const nA = normalize(this.material.nMundo)
      const pinA = T.pincelada(positionWorld.mul(3.1), nA).sub(0.5)
      const tA = lumA.add(pinA.mul(ref(globais.uArcPincel)))
      const lim = ref(globais.uArcLim)
      const suave = ref(globais.uArcSuave)
      const niveis = ref(globais.uArcNiveis)
      const corSombra = ref(globais.uArcCorSombra)
      const sombraA = float(1.0).sub(smoothstep(lim.x.sub(suave), lim.x.add(suave), tA))
      const luzA = smoothstep(lim.y.sub(suave), lim.y.add(suave), tA)
      const cLuz = mix(vec3(1.0), tomA, 0.65).mul(niveis.z)
      const cMeio = mix(vec3(1.0), tomA, 0.35).mul(niveis.y)
      const friaA = corSombra.div(max(dot(corSombra, LUM), 1e-3))
      const cSomb = mix(vec3(1.0), friaA, 0.5).mul(niveis.x).mul(mix(vec3(1.0), tomA, 0.15))
      const vA = normalize(cameraPosition.sub(positionWorld))
      const bordaA = pow(float(1.0).sub(clamp(abs(dot(nA, vA)), 0.0, 1.0)), 3.0)
      const sol = normalize(ref(globais.uSolDir))
      const paraSol = smoothstep(-0.05, 0.5, dot(nA, sol))
      const contraLuz = smoothstep(-0.4, 0.6, dot(vA.negate(), sol))
      const faixa = mix(mix(cMeio, cLuz, luzA), cSomb, sombraA)
        .add(mix(vec3(1.0), tomA, 0.8).mul(bordaA).mul(paraSol).mul(contraLuz).mul(ref(globais.uArcRim)).mul(1.4))
      const arc = ref(globais.uArcane).greaterThan(0.5)
      directDiffuse.assign(arc.select(BRDF_Lambert({ diffuseColor: diffuseColor.rgb }).mul(faixa).mul(ref(globais.uLuzRef)), directDiffuse))
      indirectDiffuse.assign(arc.select(vec3(0.0), indirectDiffuse))
    }
  }

  return class MaterialPintado extends W.MeshToonNodeMaterial {
    constructor(original) {
      super()
      this.original = original
      this.gLuz = property('vec4', 'gLuz')
      this.mrtNode = mrt({ gLuz: this.gLuz })
      // normal no mundo como o vNMundo do GLSL: mat3(modelMatrix) * mat3(instanceMatrix) * normal, sem a
      // inversa transposta que o three usa (muda os pesos da textura em três eixos sob escala desigual)
      this.nMundo = varyingProperty('vec3', 'vNMundo')
    }

    // A etapa de vértice na ordem do GLSL do three: código extra do material sobre a posição crua
    // (begin_vertex), depois morph e esqueleto, depois o código que roda sobre o corpo já animado, e só então a
    // cópia é posta no mundo (instanceMatrix). O three/webgpu aplica positionNode depois da cópia.
    setupPosition(builder) {
      const { object } = builder
      const geometry = object.geometry
      const extra = this.original.userData.tsl
      builder.addStack()
      const inst = object.instanceMatrix?.isInstancedBufferAttribute ? matrizInstancia(W, object) : null
      const instMat = inst?.no || null
      const ctx = { W, builder, material: this.original, objeto: object, instancia: instMat }
      if (extra?.posicao) positionLocal.assign(extra.posicao(ctx))
      if (geometry.morphAttributes.position || geometry.morphAttributes.normal || geometry.morphAttributes.color) W.morphReference(object).append()
      if (object.isSkinnedMesh === true) W.skinningReference(object).append()
      for (const f of this.original.userData.tslEsqueleto || []) positionLocal.assign(f(ctx, positionLocal))
      const nObjeto = vec3(normalLocal).toVar()
      // mat3(m) do GLSL: as três primeiras colunas (o WGSL não converte mat4 em mat3 direto)
      const m3 = (m) => mat3(m.element(0).xyz, m.element(1).xyz, m.element(2).xyz)
      const nInst = instMat ? m3(instMat).mul(nObjeto) : nObjeto
      this.nMundo.assign(normalize(m3(modelWorldMatrix).mul(nInst)))
      if (instMat) {
        const no = new W.InstanceNode(object)
        no.instanceMatrixNode = instMat
        if (inst.buf) no.buffer = inst.buf // o InstanceNode reenvia as matrizes quando a versão muda
        W.nodeObject(no).append()
      }
      const mvp = W.modelViewProjection()
      builder.context.vertex = builder.removeStack()
      builder.context.mvp = mvp
      return mvp
    }

    // a cor de sempre (já com cor por vértice e por cópia), depois o código extra do material, depois a pintura
    setupDiffuseColor(builder) {
      super.setupDiffuseColor(builder)
      const ctx = { W, builder, material: this.original }
      const extra = this.original.userData.tsl
      let rgb = diffuseColor.rgb
      if (extra?.cor) rgb = extra.cor(ctx, rgb)
      const { fator, tom, uPincel } = fatorPintado(W, this.original.userData.texPintada, this.nMundo)
      rgb = rgb.mul(fator)
      rgb = mix(rgb, rgb.mul(vec3(1.07, 0.96, 1.05)), tom.sub(0.5).mul(uPincel).mul(1.6))
      diffuseColor.assign(vec4(rgb, diffuseColor.a))
    }

    setupLightingModel() { return new ModeloArcane(this) }

    setup(builder) {
      const extra = this.original.userData.tsl
      // brilho próprio (janelas acesas...): entra na cor e na segunda saída
      const ctx = { W, builder, material: this.original }
      this.emissivoTotal = extra?.emissivo ? extra.emissivo(ctx, W.materialEmissive) : W.materialEmissive
      this.emissiveNode = this.emissivoTotal
      this.normalLuz = extra?.normal ? extra.normal(ctx) : null
      return super.setup(builder)
    }
  }
}

// a matriz de cada cópia, como o InstanceNode do three monta (buffer até 1000 cópias, atributo acima). A lista tem
// o tamanho da capacidade, não da quantidade no primeiro desenho: o shader não é remontado quando count muda, e
// bolas, cocos e poeira nascem com zero (só a primeira saía no lugar). Bloco com uma cópia só e bloco que muda de
// quantidade têm shader próprio (render/renderizador.js), então a lista guardada aqui é a do objeto certo.
function matrizInstancia(W, object) {
  const attr = object.instanceMatrix
  if (attr.count <= 1000) return { no: W.buffer(attr.array, 'mat4', attr.count).element(W.instanceIndex) }
  const buf = new W.InstancedInterleavedBuffer(attr.array, 16, 1)
  const fn = attr.usage === W.DynamicDrawUsage ? W.instancedDynamicBufferAttribute : W.instancedBufferAttribute
  return { no: W.mat4(fn(buf, 'vec4', 16, 0), fn(buf, 'vec4', 16, 4), fn(buf, 'vec4', 16, 8), fn(buf, 'vec4', 16, 12)), buf }
}

// Material do WebGPU equivalente a um material que passou por pintar() (MeshToonMaterial do three)
export function materialArcane(m) {
  const W = modulo()
  if (!T) montar(W)
  if (!Classe) Classe = criarClasse(W)
  const nm = new Classe(m)
  copiarPropriedades(m, nm)
  return nm
}

// Como o three faz ao trocar um material comum pelo do WebGPU (NodeLibrary.fromMaterial): copia tudo. Cor,
// brilho e mapas ficam os mesmos objetos: quem muda o original a cada quadro (nuvens) muda os dois.
const NAO_COPIAR = new Set(['uuid', 'id', 'type', 'version', '_listeners', 'onBeforeCompile', 'customProgramCacheKey', 'original', 'gLuz', 'mrtNode'])
export function copiarPropriedades(m, nm) {
  for (const k in m) {
    if (NAO_COPIAR.has(k) || k.startsWith('is')) continue
    if (typeof m[k] === 'function') continue
    nm[k] = m[k]
  }
}
