// KAN-74 (F4): sombra em duas camadas no WebGPU do jogo. Mesmo desenho do WebGL (cache-sombra.js): o mapa dos PARADOS
// fica em cache e só é refeito quando politica-sombra.js manda; todo quadro copia esse mapa para o mapa vivo e desenha
// por cima, sem limpar, só o que se mexe (jogador, gente, bicho, física e o que não foi registrado).
//
// No WebGPU quem faz a sombra é o ShadowNode do three, que roda uma vez por quadro (updateBefore → updateShadow →
// renderShadow). Aqui entra no lugar de renderShadow, só para a luz do sol, e as outras luzes seguem o caminho de sempre.
// A cópia usa copyTextureToTexture, que no WebGPU só aceita profundidade de 32 bits em ponto flutuante: o mapa de
// sombra do sol passa a ter DepthTexture de FloatType (depth32float, no lugar de depth24plus: mesma memória).
// Limite conhecido: a sombra de folha que balança no vento é de "parado" e não balança até o próximo refazer.
import { PoliticaCacheSombra } from './politica-sombra.js'
import { BIT_ESTATICO, estaticosRegistrados, assinaturaEstaticos } from './sombra-estatica.js'

const INSTALADO = Symbol.for('maresia.cacheSombraGpu.instalado')

export class CacheSombraGpu {
  constructor(renderer, cena, camera, sol, cfg, W) {
    this.r = renderer
    this.cena = cena
    this.camera = camera
    this.sol = sol
    this.cfg = cfg
    this.W = W
    this.politica = new PoliticaCacheSombra({ raio: cfg.mundo.cacheSombraRaio ?? 15 })
    this.alvoEstatico = null
    this.chave = null // tamanho do mapa + largura da janela do que está em cache
    this.assinatura = null
    this.refazer = null
    this.aplicado = false // os parados estão com castShadow desligado (o mapa em cache está valendo)
    this.stats = { refeitos: 0, quadros: 0, motivos: {}, msRefazer: 0, msQuadro: 0, parados: 0 }
    this._c = { x: 0, y: 0, z: 0 }
    this._d = { x: 0, y: 1, z: 0 }
    sol.userData.cacheSombraGpu = this
    this.instalar()
  }

  // Troca dois métodos do ShadowNode (uma vez por página). Só agem na luz que tem um CacheSombraGpu.
  instalar() {
    const { W } = this
    const SN = W.ShadowNode
    if (SN.prototype[INSTALADO]) return
    SN.prototype[INSTALADO] = true
    const montarAlvo = SN.prototype.setupRenderTarget
    SN.prototype.setupRenderTarget = function (shadow, builder) {
      const alvo = montarAlvo.call(this, shadow, builder)
      if (this.light && this.light.userData && this.light.userData.cacheSombraGpu) alvo.depthTexture.type = W.FloatType
      return alvo
    }
    const renderShadow = SN.prototype.renderShadow
    SN.prototype.renderShadow = function (frame) {
      const ud = this.light && this.light.userData
      const c = ud && ud.cacheSombraGpu
      if (c) return c.sombra(this, frame, renderShadow)
      // a luz do mapa de perto (sombra-perto.js) desenha tudo, parados inclusive
      const v = ud && ud.cacheSombraVizinho
      if (v) return v.comParados(() => renderShadow.call(this, frame))
      return renderShadow.call(this, frame)
    }
  }

  // Enquanto o cache vale, os parados ficam com castShadow desligado (o passe dinâmico do sol não os desenha). Outro
  // mapa que precise deles inteiros (o de perto) desenha dentro desta função.
  comParados(f) {
    const lista = this.aplicado ? estaticosRegistrados() : null
    // as malhas juntas de muito longe (mundo/muito-longe.js) ficam fora: estão a mais de 90 m, e a esfera de uma célula
    // de 768 m sempre cruzaria a janela de perto (seriam desenhadas inteiras todo quadro sem pôr sombra nela)
    if (lista) for (const o of lista) if (!o.userData.muitoLonge) o.castShadow = true
    try { return f() } finally { if (lista) for (const o of lista) o.castShadow = false }
  }

  get ligado() { return !!this.cfg.mundo.cacheSombra }

  // Mesma regra do WebGL: chamado por ceu.atualizar, devolve a pose congelada enquanto o cache vale.
  pose(centro, dir) {
    if (!this.ligado) return null
    this.politica.raio = this.cfg.mundo.cacheSombraRaio ?? 15
    const d = this.politica.decidir(centro, dir)
    if (d.refazer) this.refazer = d.motivo
    Object.assign(this._c, d.centro)
    Object.assign(this._d, d.dir)
    return { centro: this._c, dir: this._d }
  }

  invalidar(motivo) { this.politica.invalidar(motivo) }

  desligar() {
    if (!this.aplicado) return
    for (const o of estaticosRegistrados()) o.castShadow = true
    this.aplicado = false
    this.refazer = null
    this.politica.valido = false
  }

  sombra(no, frame, original) {
    const mapa = no.shadowMap
    // sem o mapa em profundidade de 32 bits (criado antes da instalação) a cópia não existe: caminho de sempre
    if (!this.ligado || !mapa || mapa.depthTexture.type !== this.W.FloatType) {
      this.desligar()
      return original.call(no, frame)
    }
    const t0 = performance.now()
    const shadow = no.shadow
    // tamanho novo (painel, "qualidade da sombra"): o mapa vivo só mudava de tamanho dentro do passe de sempre,
    // depois de o alvo em cache já ter sido refeito no tamanho velho; a cópia de 4096 para 2048 ficava inválida
    // em todo quadro (erro de validação do WebGPU, 21/10/2026). O mapa vivo muda antes, e o alvo acompanha.
    if (mapa.setSize && (mapa.width !== shadow.mapSize.width || mapa.height !== shadow.mapSize.height)) {
      mapa.setSize(shadow.mapSize.width, shadow.mapSize.height, mapa.depth)
    }
    const chave = shadow.mapSize.width * 4096 + shadow.camera.right
    const assinatura = assinaturaEstaticos()
    if (!this.refazer) {
      if (chave !== this.chave) this.refazer = 'tamanho'
      else if (assinatura !== this.assinatura) this.refazer = 'conjunto'
    }
    if (this.refazer) {
      const t1 = performance.now()
      this.stats.motivos[this.refazer] = (this.stats.motivos[this.refazer] || 0) + 1
      this.refazerEstaticos(no, frame, original, chave)
      this.assinatura = assinatura
      this.stats.refeitos++
      this.stats.msRefazer = performance.now() - t1
    }
    this.compor(no, frame, original)
    this.stats.quadros++
    this.stats.msQuadro = performance.now() - t0
  }

  garantirAlvo(w, h) {
    if (this.alvoEstatico && this.alvoEstatico.width === w && this.alvoEstatico.height === h) return
    if (this.alvoEstatico) { this.alvoEstatico.depthTexture.dispose(); this.alvoEstatico.dispose() }
    const { W } = this
    const dt = new W.DepthTexture(w, h)
    dt.type = W.FloatType
    dt.name = 'ShadowCacheDepth'
    const rt = new W.RenderTarget(w, h)
    rt.texture.name = 'ShadowCache'
    rt.depthTexture = dt
    this.alvoEstatico = rt
  }

  // Só os parados, no alvo em cache: o ShadowNode já pôs o material de sombra na cena e o mapa vivo como alvo; aqui o
  // alvo é trocado, a câmera da luz só enxerga a camada dos parados e o passe de sempre desenha (e limpa) o alvo em cache.
  refazerEstaticos(no, frame, original, chave) {
    const r = frame.renderer
    const mapa = no.shadowMap
    const shadow = no.shadow
    this.garantirAlvo(mapa.width, mapa.height)
    const lista = estaticosRegistrados()
    for (const o of lista) o.castShadow = true
    const mascara = shadow.camera.layers.mask
    shadow.camera.layers.mask = 1 << BIT_ESTATICO
    r.setRenderTarget(this.alvoEstatico)
    try { original.call(no, frame) } finally { shadow.camera.layers.mask = mascara; r.setRenderTarget(mapa) }
    for (const o of lista) o.castShadow = false
    this.stats.parados = lista.size
    this.aplicado = true
    this.chave = chave
    this.refazer = null
  }

  // Copia o mapa dos parados para o mapa vivo e desenha por cima, sem limpar, só o que se mexe.
  compor(no, frame, original) {
    const r = frame.renderer
    const mapa = no.shadowMap
    r.copyTextureToTexture(this.alvoEstatico.depthTexture, mapa.depthTexture)
    r.setRenderTarget(mapa)
    const autoLimpar = r.autoClear
    r.autoClear = false // limpar apagaria os parados que acabaram de ser copiados
    try { original.call(no, frame) } finally { r.autoClear = autoLimpar }
  }
}
