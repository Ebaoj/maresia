// Profundidade de campo no modo webgpu: as mesmas passadas de profundidade.js, em TSL, com os mesmos objetos de
// uniform (ref), então o painel muda os dois renderizadores juntos. Convenção do porte (aranhaverso-gpu.js): as
// contas usam a coordenada do WebGL (y para cima) e viram só na hora de ler um alvo; a profundidade é lida texel a
// texel (textureLoad), como o filtro "mais próximo" do WebGL.

import * as THREE from 'three'
import { ref, amostraAlvo } from '../render/gpu/comum.js'
import { AMOSTRAS } from './profundidade.js'

export class ProfundidadeGpu {
  // W: three/webgpu + tsl; u: uniformsProfundidade(); material(no): NodeMaterial de tela cheia;
  // prof(q): vec4 da profundidade em q (coordenada do WebGL); uvGL: a vUv do WebGL
  constructor(W, u, material, prof, uvGL) {
    this.W = W
    this.u = u
    const meia = { type: THREE.HalfFloatType, depthBuffer: false }
    const alvo = () => new W.RenderTarget(1, 1, meia)
    this.rt = { longeA: alvo(), longeB: alvo(), pertoA: alvo(), pertoB: alvo(), dilA: alvo(), dilB: alvo() }
    this.rtJunta = new W.RenderTarget(1, 1, meia)
    // a fonte troca (cor da cena ou cor pintada) pelo objeto { value }, sem remontar o shader
    this.fonte = { value: null }
    const fonte = (q) => amostraAlvo(this.fonte, q).level(0)
    const de = (tex) => (q) => W.texture(tex, W.vec2(q.x, W.float(1).sub(q.y))).level(0)
    const U = {}
    for (const k in u) U[k] = ref(u[k])
    const C = contas(W, U, prof)
    const r = this.rt
    this.matPreviaLonge = material(previa(W, U, C, fonte, uvGL, false))
    this.matPreviaPerto = material(previaPerto(W, U, C, fonte, uvGL))
    this.matLongeH = material(longe(W, U, de(r.longeA.texture), U.uDirH, uvGL, false))
    this.matLongeV = material(longe(W, U, de(r.longeB.texture), U.uDirV, uvGL, true))
    // a frente em um quarto da resolução: raio, passo e direções do quarto
    const Q = { ...U, uRaioMeio: U.uRaioQuarto, uPasso: U.uPassoQuarto }
    this.matDilH = material(dilata(W, Q, de(r.pertoA.texture), U.uDirHQ, uvGL))
    this.matDilV = material(dilata(W, Q, de(r.dilA.texture), U.uDirVQ, uvGL))
    this.matPertoH = material(perto(W, Q, de(r.pertoA.texture), de(r.dilB.texture), U.uDirHQ, uvGL))
    this.matPertoV = material(perto(W, Q, de(r.pertoB.texture), de(r.dilB.texture), U.uDirVQ, uvGL))
    this.matJunta = material(junta(W, U, C, fonte, de(r.longeA.texture), de(r.pertoA.texture), uvGL))
  }

  tamanho(w, h) {
    const mw = Math.ceil(w / 2), mh = Math.ceil(h / 2), qw = Math.ceil(w / 4), qh = Math.ceil(h / 4)
    for (const k in this.rt) this.rt[k].setSize(k.startsWith('longe') ? mw : qw, k.startsWith('longe') ? mh : qh)
    this.rtJunta.setSize(w, h)
  }

  // filtro.passo(material, alvo): o mesmo do resto do filtro (o medidor passa por ele)
  desenhar(filtro, fonte) {
    this.fonte.value = fonte
    const r = this.rt
    filtro.passo(this.matPreviaLonge, r.longeA)
    filtro.passo(this.matLongeH, r.longeB)
    filtro.passo(this.matLongeV, r.longeA)
    if (this.u.uPertoLiga.value > 0.5) {
      filtro.passo(this.matPreviaPerto, r.pertoA)
      filtro.passo(this.matDilH, r.dilA)
      filtro.passo(this.matDilV, r.dilB)
      filtro.passo(this.matPertoH, r.pertoB)
      filtro.passo(this.matPertoV, r.pertoA)
    }
    filtro.passo(this.matJunta, this.rtJunta)
    return this.rtJunta.texture
  }
}

// distância e desfoque, como GLSL_COC
function contas(W, U, prof) {
  const { float, clamp, max } = W
  const distDof = (q) => U.uNear.mul(U.uFar).negate().div(U.uFar.sub(U.uNear).mul(prof(q).x).sub(U.uFar))
  const cocLonge = (d) => {
    const t = clamp(d.sub(U.uLongeIni).div(max(U.uLongeCheio.sub(U.uLongeIni), 1.0)), 0.0, 1.0)
    const um = float(1.0).sub(t)
    return clamp(float(1.0).sub(um.mul(um)).mul(U.uLonge), 0.0, 1.0)
  }
  const cocPerto = (d) => clamp(clamp(U.uPertoIni.sub(d).div(max(U.uPertoIni.mul(0.5), 0.05)), 0.0, 1.0).mul(U.uPerto), 0.0, 1.0)
  return { distDof, cocLonge, cocPerto }
}

function previa(W, U, C, fonte, uvGL, frente) {
  const { Fn, vec2, vec3, vec4, float, max } = W
  return Fn(() => {
    const soma = vec3(0.0).toVar()
    const somaW = float(0.0).toVar()
    const mx = float(0.0).toVar()
    for (const [ox, oy] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
      const q = uvGL.add(vec2(ox, oy).mul(U.uTexelCheio))
      const c = (frente ? C.cocPerto : C.cocLonge)(C.distDof(q)).toVar()
      const w = c.add(1e-3)
      soma.addAssign(fonte(q).rgb.mul(w))
      somaW.addAssign(w)
      mx.assign(max(mx, c))
    }
    const cor = soma.div(somaW)
    return frente ? vec4(cor.mul(mx), mx) : vec4(cor, mx)
  })()
}

// prévia da frente em um quarto (fragPreviaPerto): a cor do bloco 2x2 por média bilinear, o desfoque de um pixel dele
function previaPerto(W, U, C, fonte, uvGL) {
  const { Fn, vec2, vec3, vec4, float, max } = W
  return Fn(() => {
    const soma = vec3(0.0).toVar()
    const somaW = float(0.0).toVar()
    const mx = float(0.0).toVar()
    for (const [ox, oy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const q = uvGL.add(vec2(ox, oy).mul(U.uTexelCheio))
      const c = C.cocPerto(C.distDof(q.sub(U.uTexelCheio.mul(0.5)))).toVar()
      const w = c.add(1e-3)
      soma.addAssign(fonte(q).rgb.mul(w))
      somaW.addAssign(w)
      mx.assign(max(mx, c))
    }
    return vec4(soma.div(somaW).mul(mx), mx)
  })()
}

function longe(W, U, amostra, dir, uvGL, premult) {
  const { Fn, vec3, vec4, float, clamp, min, max } = W
  return Fn(() => {
    const c0 = amostra(uvGL).toVar()
    const rc = c0.a.mul(U.uRaioMeio).toVar()
    const soma = vec3(0.0).toVar()
    const somaW = float(0.0).toVar()
    for (let i = -AMOSTRAS; i <= AMOSTRAS; i++) {
      const s = i === 0 ? c0 : amostra(uvGL.add(dir.mul(i))).toVar()
      const r = min(s.a.mul(U.uRaioMeio), rc)
      const w = clamp(r.sub(U.uPasso.mul(Math.abs(i))).add(1.0), 0.0, 1.0).div(r.mul(2.0).add(1.0)).toVar()
      soma.addAssign(s.rgb.mul(w))
      somaW.addAssign(w)
    }
    const cor = soma.div(max(somaW, 1e-6))
    return premult ? vec4(cor.mul(c0.a), c0.a) : vec4(cor, c0.a)
  })()
}

function dilata(W, U, amostra, dir, uvGL) {
  const { Fn, vec4, float, clamp, max } = W
  return Fn(() => {
    const m = float(0.0).toVar()
    for (let i = -AMOSTRAS; i <= AMOSTRAS; i++) {
      const s = amostra(uvGL.add(dir.mul(i))).a.toVar()
      m.assign(max(m, s.mul(clamp(s.mul(U.uRaioMeio).sub(U.uPasso.mul(Math.abs(i))).add(1.0), 0.0, 1.0))))
    }
    return vec4(0.0, 0.0, 0.0, m)
  })()
}

function perto(W, U, amostra, dil, dir, uvGL) {
  const { Fn, vec4, float, clamp, max } = W
  return Fn(() => {
    const rc = dil(uvGL).a.mul(U.uRaioMeio).toVar()
    const soma = vec4(0.0).toVar()
    const somaW = float(0.0).toVar()
    for (let i = -AMOSTRAS; i <= AMOSTRAS; i++) {
      const w = clamp(rc.sub(U.uPasso.mul(Math.abs(i))).add(1.0), 0.0, 1.0).toVar()
      soma.addAssign(amostra(uvGL.add(dir.mul(i))).mul(w))
      somaW.addAssign(w)
    }
    return soma.div(max(somaW, 1e-6))
  })()
}

function junta(W, U, C, fonte, tLonge, tPerto, uvGL) {
  const { Fn, vec4, clamp, max, mix, smoothstep, step } = W
  return Fn(() => {
    const base = fonte(uvGL).toVar()
    const rL = C.cocLonge(C.distDof(uvGL)).mul(U.uRaioCheio)
    const L = tLonge(uvGL).toVar()
    // até meio pixel de raio fica a imagem nítida; texel sem desfoque (L.a = 0) não conta
    const cor = mix(base.rgb, L.rgb.div(max(L.a, 1e-4)), smoothstep(0.5, 1.5, rL).mul(step(1e-4, L.a))).toVar()
    const P = tPerto(uvGL).toVar()
    const aP = clamp(P.a.mul(2.0), 0.0, 1.0).mul(step(1e-4, P.a)).mul(U.uPertoLiga)
    return vec4(mix(cor, P.rgb.div(max(P.a, 1e-4)), aP), base.a)
  })()
}
