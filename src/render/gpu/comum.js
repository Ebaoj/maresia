// Peças comuns do modo webgpu (motor F2, KAN-68).
// - ref(): liga um uniform do WebGL ({ value }) a um nó do TSL que lê o mesmo objeto a cada quadro. Assim os
//   dois renderizadores usam os mesmos valores: o que o painel ou o jogo muda vale nos dois, sem cópia.
// - ruídos que vários shaders repetem (hash e ruído de valor), escritos uma vez como função do shader.

let W = null
export function usarModulo(modulo) { W = modulo }
export function modulo() { return W }

function tipoDe(v) {
  if (typeof v === 'number') return 'float'
  if (v.isColor) return 'color'
  if (v.isVector2) return 'vec2'
  if (v.isVector3) return 'vec3'
  if (v.isVector4) return 'vec4'
  if (v.isMatrix3) return 'mat3'
  if (v.isMatrix4) return 'mat4'
  throw new Error('ref: tipo de uniform sem nó: ' + v)
}

const refs = new WeakMap()
// mesmo objeto, mesmo nó (o three monta um uniform só). Grupo de desenho (renderGroup): o valor é lido uma vez
// por desenho e fica num bloco de uniforms compartilhado por todos os objetos. O reference() que havia aqui caía
// no grupo do objeto: o three relia e regravava cada valor em cada objeto, uns 8 mil por quadro (KAN-70 T5,
// cenário uniformsGlobaisUmaVez)
export function ref(obj) {
  if (!refs.has(obj)) refs.set(obj, W.uniform(obj.value, tipoDe(obj.value)).setGroup(W.renderGroup).onRenderUpdate(() => obj.value))
  return refs.get(obj)
}

// amostra de uma textura guardada num uniform do WebGL ({ value }) que pode trocar de objeto a cada quadro
// (vaivém de alvos): o nó acompanha obj.value. O valor do nó lê obj.value na hora (o three compara a textura do
// nó com a da ligação em todo desenho). Até o three 0.170 era um onRenderUpdate, mas no 0.186 o TextureNode zera
// o updateType ao montar o shader e a troca parava: o passe lia a imagem em que escrevia (KAN-70 T5, cenário
// alvosSemLerOQueEscreve)
export function refTex(obj, uv) {
  const no = W.texture(obj.value, uv)
  Object.defineProperty(no, 'value', { configurable: true, get: () => obj.value, set() {} })
  return no
}

// Alvos de desenho (render targets): no WebGPU a linha 0 da imagem fica em cima, no WebGL embaixo. Os shaders
// portados trabalham na coordenada do WebGL (y para cima) e viram só na hora de ler um alvo. Textura carregada
// de imagem ou de dados (DataTexture) não vira: o three já guarda igual nos dois.
export function amostraAlvo(obj, q) {
  return refTex(obj, W.vec2(q.x, W.float(1).sub(q.y)))
}

// a vUv do WebGL num passe de tela cheia (QuadMesh do WebGPU tem v para baixo)
export function uvTela() {
  return W.vec2(W.uv().x, W.float(1).sub(W.uv().y))
}

// alvo de desenho do renderizador em uso
export function criarAlvo(THREE, w, h, opc) {
  return W ? new W.RenderTarget(w, h, opc) : new THREE.WebGLRenderTarget(w, h, opc)
}

// Passe de tela cheia que roda nos dois renderizadores: o material GLSL de sempre ou o nó TSL equivalente
export function criarPasse(THREE, { uniforms, vertexShader, fragmentShader, tsl }) {
  if (W) {
    const m = new W.NodeMaterial()
    m.fragmentNode = tsl()
    m.depthTest = false
    m.depthWrite = false
    const quad = new W.QuadMesh(m)
    return { desenhar(renderer, alvo) { renderer.setRenderTarget(alvo); quad.render(renderer) } }
  }
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, depthTest: false, depthWrite: false }))
  quad.frustumCulled = false
  const cena = new THREE.Scene()
  cena.add(quad)
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  return { desenhar(renderer, alvo) { renderer.setRenderTarget(alvo); renderer.render(cena, cam) } }
}

let F = null
// funções do shader com assinatura declarada (setLayout): viram uma função só no código gerado, em vez de
// serem copiadas por inteiro a cada uso (sem isso cada pincelada virava ~36 cópias do hash)
export function funcoes() {
  if (F) return F
  const { Fn, vec2, float, fract, floor, dot, mix } = W
  const hash = Fn(([p0]) => {
    const p = fract(p0.mul(vec2(123.34, 456.21))).toVar()
    p.addAssign(dot(p, p.add(45.32)))
    return fract(p.x.mul(p.y))
  }).setLayout({ name: 'mHash', type: 'float', inputs: [{ name: 'p', type: 'vec2' }] })
  const ruido = Fn(([p]) => {
    const i = floor(p)
    const f = fract(p)
    const u = f.mul(f).mul(float(3).sub(f.mul(2)))
    return mix(mix(hash(i), hash(i.add(vec2(1, 0))), u.x), mix(hash(i.add(vec2(0, 1))), hash(i.add(vec2(1, 1))), u.x), u.y)
  }).setLayout({ name: 'mRuido', type: 'float', inputs: [{ name: 'p', type: 'vec2' }] })
  F = { hash, ruido }
  return F
}

export const LUM = [0.299, 0.587, 0.114]
