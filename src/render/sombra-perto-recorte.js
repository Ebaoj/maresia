// Recorte da sombra de perto por cópia (fluido, 22/10/2026, docs/fluido-22-10.md).
//
// O mapa de perto (sombra-perto.js) é uma janela de 48 m refeita todo quadro, com os parados inteiros (o cache do sol
// não serve para ele). O three escolhe quem entra pela esfera do OBJETO: um bloco de cópias de 192 a 768 m (árvores,
// casas, buganvílias) que encosta na janela entra com todas as cópias. Na Coluna da Hora eram 2,1 milhões de
// triângulos por quadro só no mapa de perto, quase tudo cópia a centenas de metros da janela.
//
// Aqui, durante o passe de perto, o bloco grande sai e as cópias dele cuja esfera cruza o volume da câmera de sombra
// de perto (o mesmo teste que o three faz por objeto, feito por cópia) entram numa malha reduzida da FAMÍLIA (mesma
// geometria, mesmo material, mesmo pai): uma malha por família, não por bloco, para o three montar o shader dela uma
// vez só (no primeiro quadro, o de aquecimento) e não no meio do passeio. A escolha é refeita só quando a câmera de
// sombra anda ou vira mais que a folga (as esferas são testadas aumentadas dela) ou quando muda o conjunto de blocos
// grandes à vista (LOD).
// Desliga ao vivo: cfg.mundo.sombraPertoRecorte = false (o mapa de perto volta a receber os blocos inteiros).
import * as THREE from 'three'

const RAIO_GRANDE = 60 // bloco com esfera maior que isso (m) passa a entrar por cópia (a célula de 64 m do chão solto, que nasce
// andando, tem ~45 m e fica de fora: família nova no meio do passeio montaria shader)
const FOLGA = 3 // m: as esferas das cópias são testadas aumentadas disto
// a escolha vale enquanto a câmera de sombra andar menos que ANDA e a luz virar menos que VIRA (0,003 rad x 410 m de
// fundo = 1,2 m): somados, menos que a FOLGA, então nada que deveria entrar fica de fora
const ANDA = 1.5
const VIRA = 0.003
const _s = new THREE.Sphere()
const _p = new THREE.Vector3()
const _d = new THREE.Vector3()

export class RecortePerto {
  constructor() {
    this.blocos = new WeakMap() // bloco -> { familia, cx, cy, cz, r, n } (null = pequeno, entra inteiro)
    this.familias = new Map() // chave -> { proxy, cap }
    this.ancora = new THREE.Vector3(Infinity, 0, 0)
    this.dirAncora = new THREE.Vector3()
    this.chave = null
    this.conjunto = 0
    this.aquecido = false
    this.stats = { grandes: 0, familias: 0, copias: 0, refeitos: 0 }
  }

  // o bloco entra por cópia? (prepara os dados dele na primeira vez)
  grande(o) {
    let d = this.blocos.get(o)
    if (d !== undefined) return d !== null
    d = null
    if (o.isInstancedMesh && o.instanceMatrix.count > 1) {
      const s = o.boundingSphere || (o.computeBoundingSphere(), o.boundingSphere)
      if (s.radius > RAIO_GRANDE) {
        const g = o.geometry
        if (!g.boundingSphere) g.computeBoundingSphere()
        const n = o.instanceMatrix.count
        const cx = new Float32Array(n), cy = new Float32Array(n), cz = new Float32Array(n), r = new Float32Array(n)
        const m = new THREE.Matrix4()
        o.updateWorldMatrix(true, false)
        for (let i = 0; i < n; i++) {
          o.getMatrixAt(i, m)
          m.premultiply(o.matrixWorld)
          _s.copy(g.boundingSphere).applyMatrix4(m)
          cx[i] = _s.center.x; cy[i] = _s.center.y; cz[i] = _s.center.z; r[i] = _s.radius
        }
        const chave = g.uuid + ':' + (Array.isArray(o.material) ? o.material.map((x) => x.uuid).join(',') : o.material.uuid) + ':' + (o.parent?.uuid ?? '') + ':' + o.matrixWorld.elements.join(',')
        let f = this.familias.get(chave)
        if (!f) { f = { chave, dono: o, cap: 0, proxy: null, blocos: [] }; this.familias.set(chave, f); this.stats.familias++ }
        f.cap += n
        f.blocos.push(o)
        if (f.proxy) { f.proxy.removeFromParent(); f.proxy.dispose(); f.proxy = null } // capacidade nova: refeita no uso
        d = { familia: f, cx, cy, cz, r, n }
        this.stats.grandes++
      }
    }
    this.blocos.set(o, d)
    return d !== null
  }

  proxyDe(f) {
    if (f.proxy) return f.proxy
    const o = f.dono
    const proxy = new THREE.InstancedMesh(o.geometry, o.material, f.cap)
    if (o.instanceColor) proxy.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(f.cap * 3), 3)
    proxy.name = o.name + '-perto'
    proxy.matrixAutoUpdate = false
    proxy.matrixWorldAutoUpdate = false
    proxy.matrix.copy(o.matrix)
    proxy.matrixWorld.copy(o.matrixWorld)
    proxy.frustumCulled = false
    proxy.castShadow = true
    proxy.receiveShadow = false
    proxy.visible = false
    proxy.count = 0
    proxy.userData.contagemViva = true // o WebGPU não troca o resto por escala zero (renderizador.js)
    if (o.parent) o.parent.add(proxy)
    f.proxy = proxy
    return proxy
  }

  // grandes: os blocos grandes à vista neste quadro; shadow: a LightShadow da luz de perto (matrizes já do quadro).
  // Devolve as malhas reduzidas com cópias (o chamador as mostra só durante o passe de perto).
  // todos: todos os parados (no primeiro quadro, para as famílias nascerem com a capacidade inteira)
  preparar(grandes, shadow, todos = null) {
    const c = shadow.camera
    _p.setFromMatrixPosition(c.matrixWorld)
    c.getWorldDirection(_d)
    let h = grandes.length
    for (const o of grandes) h = (Math.imul(h, 31) + o.id) | 0
    const chave = c.right * 1000 + c.far
    const out = []
    if (!this.aquecido) {
      // primeiro quadro (o de aquecimento do WebGPU): toda família desenha uma cópia de escala zero, para o shader
      // dela sair pronto agora e não no meio do passeio
      this.aquecido = true
      if (todos) for (const o of todos) if (!o.userData.muitoLonge) this.grande(o)
      for (const f of this.familias.values()) { const p = this.proxyDe(f); p.setMatrixAt(0, new THREE.Matrix4().makeScale(0, 0, 0)); p.count = 1; p.instanceMatrix.needsUpdate = true; out.push(p) }
      this.ancora.set(Infinity, 0, 0)
      return out
    }
    if (_p.distanceTo(this.ancora) > ANDA || _d.angleTo(this.dirAncora) > VIRA || chave !== this.chave || h !== this.conjunto) {
      this.ancora.copy(_p)
      this.dirAncora.copy(_d)
      this.chave = chave
      this.conjunto = h
      this.stats.refeitos++
      this.refazer(grandes, shadow.getFrustum())
    }
    for (const f of this.familias.values()) if (f.proxy && f.proxy.count > 0) out.push(f.proxy)
    return out
  }

  refazer(grandes, fr) {
    for (const f of this.familias.values()) { f.k = 0 }
    let total = 0
    for (const o of grandes) {
      const d = this.blocos.get(o)
      _s.copy(o.boundingSphere).applyMatrix4(o.matrixWorld)
      _s.radius += FOLGA
      if (!fr.intersectsSphere(_s)) continue
      const f = d.familia
      const p = this.proxyDe(f)
      const a = o.instanceMatrix.array
      const pa = p.instanceMatrix.array
      const ca = o.instanceColor ? o.instanceColor.array : null
      const pc = p.instanceColor ? p.instanceColor.array : null
      // as cópias de verdade do bloco (count), não a capacidade
      const n = Math.min(d.n, o.count)
      for (let i = 0; i < n; i++) {
        _s.center.set(d.cx[i], d.cy[i], d.cz[i])
        _s.radius = d.r[i] + FOLGA
        if (!fr.intersectsSphere(_s)) continue
        const k = f.k++
        for (let j = 0; j < 16; j++) pa[k * 16 + j] = a[i * 16 + j]
        if (pc && ca) { pc[k * 3] = ca[i * 3]; pc[k * 3 + 1] = ca[i * 3 + 1]; pc[k * 3 + 2] = ca[i * 3 + 2] }
      }
    }
    for (const f of this.familias.values()) {
      if (!f.proxy) continue
      if (f.proxy.count !== f.k || f.k > 0) {
        f.proxy.count = f.k
        f.proxy.instanceMatrix.needsUpdate = true
        if (f.proxy.instanceColor) f.proxy.instanceColor.needsUpdate = true
      }
      total += f.k
    }
    this.stats.copias = total
  }
}
