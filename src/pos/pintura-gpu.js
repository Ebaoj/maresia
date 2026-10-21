// A pincelada na tela (pintura.js) no modo webgpu, em TSL: as mesmas contas, a mesma grade de amostras e os
// mesmos pesos, desenrolados em JavaScript. Os uniforms são os do WebGL (ref), então o painel muda os dois.

import { ref } from '../render/gpu/comum.js'
import { amostrasDisco, pesosSetores } from './pintura.js'

const LUMV = [0.299, 0.587, 0.114]

// amostra: (q) => nó vec4 da cor da cena, na coordenada do WebGL (y para cima)
export function fragTensorGpu(W, u, amostra, uvGL) {
  const { vec2, vec3, vec4, sqrt, clamp, dot } = W
  const uTexel = ref(u.uTexel)
  const lum = (q) => dot(sqrt(clamp(amostra(q).rgb, 0.0, 4.0)), vec3(...LUMV))
  const d = uTexel.mul(1.5)
  const q = (x, y) => lum(uvGL.add(vec2(d.x.mul(x), d.y.mul(y))))
  const tl = q(-1, 1), t = q(0, 1), tr = q(1, 1), l = q(-1, 0), r = q(1, 0), bl = q(-1, -1), b = q(0, -1), br = q(1, -1)
  const gx = tr.add(r.mul(2.0)).add(br).sub(tl).sub(l.mul(2.0)).sub(bl).mul(0.25)
  const gy = tl.add(t.mul(2.0)).add(tr).sub(bl).sub(b.mul(2.0)).sub(br).mul(0.25)
  return vec4(gx.mul(gx), gx.mul(gy), gy.mul(gy), 1.0)
}

// amostra e amostraTensor: (q) => vec4, como acima
export function fragKuwaharaGpu(W, u, n, amostra, amostraTensor, uvGL) {
  const { Fn, vec2, vec3, vec4, float, sqrt, clamp, max, abs, pow, mix, normalize, dot } = W
  const U = {}
  for (const k of ['uTexel', 'uRaio', 'uForca', 'uAniso', 'uNitidez']) U[k] = ref(u[k])
  return Fn(() => {
    const orig = amostra(uvGL)
    const peso = orig.a.lessThan(0.7).select(float(0.3), orig.a.lessThan(0.95).select(float(0.6), float(1.0)))
    const raio = U.uRaio.mul(peso)
    const t = amostraTensor(uvGL).xyz
    const raiz = sqrt(max(t.x.sub(t.z).mul(t.x.sub(t.z)).add(t.y.mul(t.y).mul(4.0)), 0.0))
    const l1 = t.x.add(t.z).add(raiz).mul(0.5), l2 = t.x.add(t.z).sub(raiz).mul(0.5)
    const dir0 = vec2(l1.sub(t.x), t.y.negate())
    const dir = dot(dir0, dir0).greaterThan(1e-12).select(normalize(dir0), vec2(0.0, 1.0))
    const A = l1.add(l2).greaterThan(1e-8).select(l1.sub(l2).div(l1.add(l2)), float(0.0))
    const a = raio.mul(clamp(U.uAniso.add(A).div(U.uAniso), 0.1, 2.0))
    const b = raio.mul(clamp(U.uAniso.div(U.uAniso.add(A)), 0.1, 2.0))
    // M * v do GLSL (colunas (dir*a) e (perp*b)): v.x ao longo da borda, v.y através dela
    const ex = dir.mul(a), ey = vec2(dir.y.negate(), dir.x).mul(b)
    const m = [], s = []
    for (let k = 0; k < 8; k++) { m.push(vec4(0.0).toVar()); s.push(vec3(0.0).toVar()) }
    for (const [vx, vy] of amostrasDisco(n)) {
      const w = pesosSetores(vx, vy)
      const off = ex.mul(vx).add(ey.mul(vy)).mul(U.uTexel)
      const c = sqrt(clamp(amostra(uvGL.add(off)).rgb, 0.0, 4.0)).toVar()
      const cc = c.mul(c)
      w.forEach((p, k) => {
        if (p <= 1e-6) return
        m[k].addAssign(vec4(c.mul(p), p))
        s[k].addAssign(cc.mul(p))
      })
    }
    const soma = vec3(0.0).toVar()
    const somaW = float(0.0).toVar()
    for (let k = 0; k < 8; k++) {
      const media = m[k].rgb.div(max(m[k].w, 1e-6))
      const v = abs(s[k].div(max(m[k].w, 1e-6)).sub(media.mul(media)))
      const w = float(1.0).div(float(1.0).add(pow(v.r.add(v.g).add(v.b).mul(1000.0).add(1e-8), U.uNitidez.mul(0.5))))
      soma.addAssign(media.mul(w))
      somaW.addAssign(w)
    }
    const res = soma.div(max(somaW, 1e-6))
    return vec4(mix(orig.rgb, res.mul(res), U.uForca), orig.a)
  })()
}
