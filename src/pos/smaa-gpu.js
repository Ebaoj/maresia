// SMAA 1x no modo webgpu (27/10/2026; a conta e o porquê em smaa.js). Usa o SMAANode do three (borda, pesos e mistura)
// entre dois passes daqui: o primeiro escreve a raiz quadrada da cor (o SMAANode supõe cor perto do que o olho vê e
// mistura em linha reta), o último volta ao quadrado e põe o alfa do próprio pixel (peso do traço, sem mistura).
// O SMAANode é carregado na primeira vez (import dinâmico: o modo WebGL não baixa nada disto); até chegar, o passe
// devolve a cor de entrada.

import * as THREE from 'three'
import { amostraAlvo } from '../render/gpu/comum.js'

export class SmaaGpu {
  // W: three/webgpu + tsl; material(no): NodeMaterial de tela cheia; uvGL: a vUv do WebGL
  constructor(W, material, uvGL) {
    this.W = W
    this.material = material
    this.uvGL = uvGL
    const opc = { type: THREE.HalfFloatType, depthBuffer: false }
    this.rtRaiz = new W.RenderTarget(1, 1, opc)
    this.rt = new W.RenderTarget(1, 1, opc)
    this.fonte = { value: null }
    const { Fn, vec4, sqrt, max } = W
    this.matRaiz = material(Fn(() => {
      const c = amostraAlvo(this.fonte, uvGL).level(0)
      return vec4(sqrt(max(c.rgb, 0.0)), c.a)
    })())
    this.matVolta = null
    import('three/addons/tsl/display/SMAANode.js').then(({ default: SMAANode }) => {
      const no = W.nodeObject(new SMAANode(W.texture(this.rtRaiz.texture)))
      this.matVolta = material(Fn(() => {
        const s = no.toVar() // a cor misturada (na raiz), no mesmo pixel
        const c = amostraAlvo(this.fonte, uvGL).level(0)
        return vec4(s.rgb.mul(s.rgb), c.a)
      })())
    }).catch((e) => console.error('SMAA (WebGPU):', e))
  }

  tamanho(w, h) {
    this.rtRaiz.setSize(w, h)
    this.rt.setSize(w, h)
  }

  desenhar(filtro, fonte) {
    if (!this.matVolta) return fonte
    this.fonte.value = fonte
    filtro.passo(this.matRaiz, this.rtRaiz)
    filtro.passo(this.matVolta, this.rt)
    return this.rt.texture
  }
}
