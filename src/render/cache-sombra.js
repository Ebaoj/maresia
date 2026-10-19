// KAN-74 (F4): sombra em duas camadas no WebGL.
//
// Antes, todo quadro refazia o mapa de sombra com todos os objetos (o three limpa o mapa e redesenha tudo). Agora:
//   - os PARADOS (registrados em sombra-estatica.js) são desenhados num mapa de profundidade só deles, em cache;
//     ele só é refeito quando a política (politica-sombra.js) manda: sol mudou, jogador longe do centro da
//     janela, conjunto de parados mudou, tamanho do mapa mudou;
//   - todo quadro: copia o mapa em cache para o mapa vivo (um passe de tela cheia que escreve gl_FragDepth, 1
//     chamada de desenho) e desenha por cima, SEM limpar, só o que se mexe (jogador, gente, bicho, física e tudo
//     que não foi registrado). O resultado é o mesmo de desenhar tudo junto: a profundidade guarda o mais perto.
//
// Entra no lugar do shadowMap.render do three (chamado por dentro de renderer.render, depois de as matrizes
// estarem em dia e das listas montadas). Com cfg.mundo.cacheSombra desligado, tudo volta ao caminho de antes.
// Limite conhecido: a sombra de folha que balança no vento é de parado e não balança até o próximo refazer.
import * as THREE from 'three'
import { PoliticaCacheSombra } from './politica-sombra.js'
import { BIT_ESTATICO, estaticosRegistrados, assinaturaEstaticos } from './sombra-estatica.js'

const VERTICE = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`
const FRAGMENTO = /* glsl */ `
uniform highp sampler2D tProf;
varying vec2 vUv;
void main() { gl_FragColor = vec4(1.0); gl_FragDepth = texture2D(tProf, vUv).r; }`

export class CacheSombra {
  constructor(renderer, cena, camera, sol, cfg) {
    this.r = renderer
    this.cena = cena
    this.camera = camera
    this.sol = sol
    this.cfg = cfg
    this.politica = new PoliticaCacheSombra({ raio: cfg.mundo.cacheSombraRaio ?? 15 })
    this.alvoEstatico = null
    this.chave = null // tamanho do mapa + largura da janela do que está em cache
    this.assinatura = null
    this.refazer = null
    this.aplicado = false // os parados estão com castShadow desligado (o mapa em cache está valendo)
    // motivos: quantas vezes cada um refez o mapa; chamadas*: desenhos do último passe dos parados e do dinâmico
    this.stats = { refeitos: 0, quadros: 0, motivos: {}, msRefazer: 0, msQuadro: 0, parados: 0, chamadasEstatico: 0, chamadasDinamico: 0 }
    this._c = new THREE.Vector3()
    this._d = new THREE.Vector3()
    const mat = new THREE.ShaderMaterial({
      uniforms: { tProf: { value: null } }, vertexShader: VERTICE, fragmentShader: FRAGMENTO,
      depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth, colorWrite: false, blending: THREE.NoBlending, side: THREE.DoubleSide,
    })
    this.copia = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat)
    this.copia.frustumCulled = false
    this.camCopia = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    this.cenaCopia = new THREE.Scene()
    this.cenaCopia.add(this.copia)
    // o three chama shadowMap.render sozinho dentro de render(); esta função toma o lugar dele
    const original = renderer.shadowMap.render
    this.original = original
    renderer.shadowMap.render = (luzes, c, cam) => this.sombra(luzes, c, cam)
  }

  get ligado() { return !!this.cfg.mundo.cacheSombra }

  // Chamado por ceu.atualizar a cada quadro com o centro já alinhado ao texel e a direção da luz. Devolve a pose a
  // usar (a congelada, se o cache vale) ou null (desligado: ceu.js usa a pose de sempre).
  pose(centro, dir) {
    if (!this.ligado) return null
    this.politica.raio = this.cfg.mundo.cacheSombraRaio ?? 15
    const d = this.politica.decidir(centro, dir)
    if (d.refazer) this.refazer = d.motivo
    return { centro: this._c.set(d.centro.x, d.centro.y, d.centro.z), dir: this._d.set(d.dir.x, d.dir.y, d.dir.z) }
  }

  invalidar(motivo) { this.politica.invalidar(motivo) }

  // Devolve o mundo ao estado de antes do cache (parados voltam a projetar sombra por conta própria).
  desligar() {
    if (!this.aplicado) return
    for (const o of estaticosRegistrados()) o.castShadow = true
    this.aplicado = false
    this.refazer = null
    this.politica.valido = false
  }

  sombra(luzes, c, cam) {
    const r = this.r
    const sol = this.sol
    // O three chama isto em todo render(), também nas passadas do pós (sem luz nenhuma): ali não há sombra a fazer e
    // o cache continua valendo. (Tratar isso como "cache incompatível" refazia o mapa em todo quadro.)
    if (luzes.length === 0) return
    // com o cache desligado, outra luz projetando sombra ou sem o sol na lista, o cache não sabe compor: caminho de sempre
    if (!this.ligado || luzes.length !== 1 || luzes[0] !== sol || r.shadowMap.enabled === false) {
      this.desligar()
      return this.original.call(r.shadowMap, luzes, c, cam)
    }
    // mesma regra do three: sem autoUpdate, só refaz quando alguém pediu (o pós pede uma vez por quadro)
    if (r.shadowMap.autoUpdate === false && r.shadowMap.needsUpdate === false) return
    const t0 = performance.now()
    const chave = sol.shadow.mapSize.x * 4096 + sol.shadow.camera.right
    const assinatura = assinaturaEstaticos()
    if (!this.refazer) {
      if (chave !== this.chave) this.refazer = 'tamanho'
      else if (assinatura !== this.assinatura) this.refazer = 'conjunto'
    }
    if (this.refazer) {
      const t1 = performance.now()
      this.stats.motivos[this.refazer] = (this.stats.motivos[this.refazer] || 0) + 1
      this.refazerEstaticos(luzes, c, cam, chave)
      this.assinatura = assinatura
      this.stats.refeitos++
      this.stats.msRefazer = performance.now() - t1
    }
    this.compor(luzes, c, cam)
    this.stats.quadros++
    this.stats.msQuadro = performance.now() - t0
  }

  garantirAlvo(tam) {
    if (this.alvoEstatico && this.alvoEstatico.width === tam) return
    if (this.alvoEstatico) { this.alvoEstatico.depthTexture.dispose(); this.alvoEstatico.dispose() }
    const rt = new THREE.WebGLRenderTarget(tam, tam)
    const dt = new THREE.DepthTexture(tam, tam, THREE.UnsignedIntType)
    dt.format = THREE.DepthFormat
    dt.compareFunction = null // aqui a profundidade é lida de volta (copia), não comparada como no mapa vivo
    dt.minFilter = dt.magFilter = THREE.NearestFilter
    rt.depthTexture = dt
    this.alvoEstatico = rt
  }

  // Só os parados, no mapa em cache (o three escolhe os objetos pela camada da câmera: aqui só a camada dos parados).
  refazerEstaticos(luzes, c, cam, chave) {
    const r = this.r
    const sol = this.sol
    this.garantirAlvo(sol.shadow.mapSize.x)
    const lista = estaticosRegistrados()
    for (const o of lista) o.castShadow = true
    const vivo = sol.shadow.map
    const mascara = cam.layers.mask
    cam.layers.mask = 1 << BIT_ESTATICO
    sol.shadow.map = this.alvoEstatico
    r.shadowMap.needsUpdate = true
    sol.shadow.needsUpdate = true
    const chamadas = r.info.render.calls
    try { this.original.call(r.shadowMap, luzes, c, cam) } finally { sol.shadow.map = vivo; cam.layers.mask = mascara }
    this.stats.chamadasEstatico = r.info.render.calls - chamadas
    this.stats.parados = lista.size
    for (const o of lista) o.castShadow = false
    this.aplicado = true
    this.chave = chave
    this.refazer = null
  }

  // Desenha só o que se mexe (parados com castShadow desligado, não registrados ligados), sem limpar o mapa.
  passeDinamico(luzes, c, cam, semLimpar) {
    const r = this.r
    const limpar = r.clear
    if (semLimpar) r.clear = () => {}
    r.shadowMap.needsUpdate = true
    this.sol.shadow.needsUpdate = true
    const chamadas = r.info.render.calls
    try { this.original.call(r.shadowMap, luzes, c, cam) } finally { r.clear = limpar }
    if (semLimpar) this.stats.chamadasDinamico = r.info.render.calls - chamadas
  }

  compor(luzes, c, cam) {
    const r = this.r
    const sol = this.sol
    if (!sol.shadow.map) this.passeDinamico(luzes, c, cam, false) // primeira vez: o three cria o mapa vivo
    const alvoAntes = r.getRenderTarget()
    const autoLimpar = r.autoClear
    const autoReiniciar = r.info.autoReset
    r.autoClear = false // o passe de cópia só escreve profundidade, por cima de tudo
    r.info.autoReset = false // e não zera as contagens do quadro que está em andamento
    this.copia.material.uniforms.tProf.value = this.alvoEstatico.depthTexture
    r.setRenderTarget(sol.shadow.map)
    // render() aninhado (o three aguenta: é o que o refletor faz): é ele que sobe a geometria do quadrado para a GPU.
    // renderBufferDirect direto não sobe, e a cópia não desenhava nada (achado no navegador, KAN-74).
    r.render(this.cenaCopia, this.camCopia)
    r.autoClear = autoLimpar
    r.info.autoReset = autoReiniciar
    r.setRenderTarget(alvoAntes)
    this.passeDinamico(luzes, c, cam, true)
  }
}
