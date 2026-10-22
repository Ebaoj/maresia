// Estabilização no tempo no modo webgpu: o mesmo passe de estabilizar.js, em TSL, com os mesmos objetos de uniform
// (ref). Convenção do porte (aranhaverso-gpu.js): as contas na coordenada do WebGL (y para cima), virando só na hora
// de ler um alvo; profundidade de 0 a 1 e lida texel a texel.

import * as THREE from 'three'
import { ref, amostraAlvo } from '../render/gpu/comum.js'

export class EstabilizarGpu {
  // W: three/webgpu + tsl; u: uniformsEstabilizar(); material(no): NodeMaterial de tela cheia;
  // prof(q): vec4 da profundidade em q (coordenada do WebGL); uvGL: a vUv do WebGL
  constructor(W, u, material, prof, uvGL) {
    this.u = u
    const opc = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }
    this.rt = [new W.RenderTarget(1, 1, opc), new W.RenderTarget(1, 1, opc)]
    this.atual = 0
    this.fonte = { value: null }
    this.hist = { value: null }
    this.mat = material(fragEstabilizar(W, u, (q) => amostraAlvo(this.fonte, q), (q) => amostraAlvo(this.hist, q), prof, uvGL))
  }

  tamanho(w, h) { for (const r of this.rt) r.setSize(w, h) }

  desenhar(filtro, fonte) {
    const alvo = this.rt[this.atual]
    this.fonte.value = fonte
    this.hist.value = this.rt[1 - this.atual].texture
    filtro.passo(this.mat, alvo)
    this.atual = 1 - this.atual
    return alvo.texture
  }
}

function fragEstabilizar(W, u, cor, hist, prof, uvGL) {
  const { Fn, vec2, vec3, vec4, float, floor, max, min, abs, sqrt, step, dot, mix } = W
  const uProjInv = ref(u.uProjInv), uCamMundo = ref(u.uCamMundo), uVPAnterior = ref(u.uVPAnterior)
  const uTexel = ref(u.uTexel), uPeso = ref(u.uPeso), uGama = ref(u.uGama), uValido = ref(u.uValido)
  const paraYCoCg = (c) => vec3(dot(c, vec3(0.25, 0.5, 0.25)), dot(c, vec3(0.5, 0.0, -0.5)), dot(c, vec3(-0.25, 0.5, -0.25)))
  const deYCoCg = (c) => vec3(c.x.add(c.y).sub(c.z), c.x.add(c.z), c.x.sub(c.y).sub(c.z))
  // a cor do quadro anterior em Catmull-Rom, 5 amostras bilineares (a mesma conta de GLSL_ESTABILIZAR)
  const historia = (q) => {
    const pos = q.div(uTexel)
    const c = floor(pos.sub(0.5)).add(0.5)
    const f = pos.sub(c)
    const w0 = f.mul(f.mul(f.mul(-0.5).add(1.0)).add(-0.5))
    const w1 = f.mul(f).mul(f.mul(1.5).add(-2.5)).add(1.0)
    const w2 = f.mul(f.mul(f.mul(-1.5).add(2.0)).add(0.5))
    const w3 = f.mul(f).mul(f.mul(0.5).add(-0.5))
    const w12 = w1.add(w2)
    const t12 = c.add(w2.div(w12)).mul(uTexel)
    const t0 = c.sub(1.0).mul(uTexel)
    const t3 = c.add(2.0).mul(uTexel)
    const s = hist(vec2(t12.x, t0.y)).rgb.mul(w12.x.mul(w0.y))
      .add(hist(vec2(t0.x, t12.y)).rgb.mul(w0.x.mul(w12.y)))
      .add(hist(t12).rgb.mul(w12.x.mul(w12.y)))
      .add(hist(vec2(t3.x, t12.y)).rgb.mul(w3.x.mul(w12.y)))
      .add(hist(vec2(t12.x, t3.y)).rgb.mul(w12.x.mul(w3.y)))
    const wt = w12.x.mul(w0.y).add(w0.x.mul(w12.y)).add(w12.x.mul(w12.y)).add(w3.x.mul(w12.y)).add(w12.x.mul(w3.y))
    return max(s.div(wt), vec3(0.0))
  }
  return Fn(() => {
    const c = cor(uvGL).toVar()
    // vizinhança em cruz (o pixel e os 4 do lado), como no GLSL
    const s0 = paraYCoCg(c.rgb).toVar()
    const m1 = vec3(s0).toVar()
    const m2 = s0.mul(s0).toVar()
    const aMin = float(c.a).toVar()
    for (const [i, j] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const v4 = cor(uvGL.add(vec2(i, j).mul(uTexel))).toVar()
      const s = paraYCoCg(v4.rgb).toVar()
      m1.addAssign(s)
      m2.addAssign(s.mul(s))
      aMin.assign(min(aMin, v4.a))
    }
    // personagem e gente (alfa abaixo de 0,95) andam sozinhos: neles e na borda deles, só a cor deste quadro
    const parado = step(0.95, aMin)
    m1.divAssign(5.0)
    const sig = sqrt(max(m2.div(5.0).sub(m1.mul(m1)), vec3(0.0)))
    // o ponto do mundo deste pixel, na tela do quadro anterior (profundidade de 0 a 1 no WebGPU)
    const d = prof(uvGL).x
    const v = uProjInv.mul(vec4(uvGL.mul(2.0).sub(1.0), d, 1.0))
    const pa = uVPAnterior.mul(uCamMundo.mul(vec4(v.xyz.div(v.w), 1.0))).toVar()
    const qa = pa.xy.div(pa.w).mul(0.5).add(0.5).toVar()
    const vale = step(0.0, qa.x).mul(step(qa.x, 1.0)).mul(step(0.0, qa.y)).mul(step(qa.y, 1.0)).mul(step(0.0, pa.w)).mul(uValido)
    const h = paraYCoCg(historia(qa)).toVar()
    const meia = sig.mul(uGama).add(1e-5)
    const un = h.sub(m1).div(meia)
    const mx = max(abs(un.x), max(abs(un.y), abs(un.z)))
    const hc = mx.greaterThan(1.0).select(m1.add(h.sub(m1).div(mx)), h)
    return vec4(mix(c.rgb, deYCoCg(hc), uPeso.mul(vale).mul(parado)), c.a)
  })()
}
