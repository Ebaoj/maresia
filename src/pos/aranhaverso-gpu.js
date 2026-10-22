// O filtro de quadrinho no modo webgpu (motor F2, KAN-68): as mesmas passadas de aranhaverso.js, em TSL.
// Os valores vêm da própria classe Aranhaverso (atualizar()): os uniforms são os mesmos objetos, ligados por
// ref(), então o painel muda os dois renderizadores juntos. As contas seguem o GLSL linha a linha, com os
// mesmos nomes; o que muda é só a convenção do WebGPU:
// - textura com a linha 0 em cima: o shader trabalha na coordenada do WebGL (y para cima) e vira na amostra
// - profundidade de 0 a 1 (no WebGL, de -1 a 1 antes da projeção inversa)
// - coordenada do pixel com origem em cima (gl_FragCoord do WebGL tem origem embaixo)

import * as THREE from 'three'
import { Aranhaverso } from './aranhaverso.js'
import { ref, funcoes, modulo, amostraAlvo } from '../render/gpu/comum.js'
import { fragTensorGpu, fragKuwaharaGpu } from './pintura-gpu.js'
import { amostrasPintura } from './pintura.js'
import { aplicarFx2dTsl } from './fx2d.js'
import { ProfundidadeGpu } from './profundidade-gpu.js'

export class AranhaversoGpu {
  constructor(renderer, cena, camera, cfg, globais) {
    const W = modulo()
    this.W = W
    this.renderer = renderer
    this.cena = cena
    this.camera = camera
    this.cfg = cfg
    // a classe do WebGL guarda os uniforms e calcula todos os valores; os alvos e materiais dela não são usados
    this.base = new Aranhaverso(renderer, cena, camera, cfg, globais)
    const b = this.base

    const prof = new THREE.DepthTexture(1, 1)
    prof.type = THREE.FloatType
    const meia = { type: THREE.HalfFloatType, depthBuffer: false }
    this.rtCor = new W.RenderTarget(1, 1, { type: THREE.HalfFloatType, depthTexture: prof, count: 2 })
    this.rtCor.textures[0].name = 'output'
    this.rtCor.textures[1].name = 'gLuz'
    this.rtOclusao = new W.RenderTarget(1, 1, meia)
    this.rtBrilhoA = new W.RenderTarget(1, 1, meia)
    this.rtBrilhoB = new W.RenderTarget(1, 1, meia)
    // pincelada na tela (pintura.js): tensor em meia resolução e a cor pintada em resolução cheia
    this.rtTensor = new W.RenderTarget(1, 1, meia)
    this.rtPintura = new W.RenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false })
    this.corFundo = new THREE.Color(0, 0, 0)
    this.mrtCena = W.mrt({ output: W.output, gLuz: W.vec4(0, 0, 0, 1) })

    const amostra = (tex) => (q) => W.texture(tex, W.vec2(q.x, W.float(1).sub(q.y)))
    // amostra com nível fixo: pode ficar dentro de condição e de laço no WGSL (o alvo não tem mipmap)
    const amostraN = (tex) => (q) => W.texture(tex, W.vec2(q.x, W.float(1).sub(q.y))).level(0)
    // profundidade: lida texel a texel (textureLoad), como o filtro "mais próximo" do WebGL faz; textura de
    // profundidade não aceita amostra com nível no WGSL e a amostra comum não pode ficar dentro de condição
    this.uTamProf = W.uniform(new THREE.Vector2(1, 1))
    const amostraP = (tex) => (q) => {
      const t = W.floor(W.vec2(q.x, W.float(1).sub(q.y)).mul(this.uTamProf))
      return W.textureLoad(tex, W.ivec2(W.clamp(t, W.vec2(0), this.uTamProf.sub(1))))
    }
    const T = {
      cor: amostra(this.rtCor.textures[0]), corN: amostraN(this.rtCor.textures[0]),
      luz: amostra(this.rtCor.textures[1]),
      prof: amostraP(prof),
      oclusao: amostra(this.rtOclusao.texture), brilho: amostra(this.rtBrilhoA.texture),
    }
    const uvGL = W.vec2(W.uv().x, W.float(1).sub(W.uv().y)) // a vUv do WebGL

    this.matOclusao = this.material(fragOclusao(W, b.uOclusao, T, uvGL))
    this.matClaro = this.material(fragClaro(W, b.uClaro, T, uvGL))
    // desfoque em vaivém: quatro passadas com fonte e direção fixas (A->B horizontal, B->A vertical, duas vezes)
    this.uDirs = [0, 1, 2, 3].map(() => W.uniform(new THREE.Vector2()))
    this.matDesfoque = [0, 1, 2, 3].map((k) => this.material(fragDesfoque(W, amostra(k % 2 ? this.rtBrilhoB.texture : this.rtBrilhoA.texture), this.uDirs[k], uvGL)))
    // a tela lê a cor da cena ou a cor pintada: a textura troca pelo objeto { value } (refTex), sem remontar o shader
    this.fonteTela = { value: this.rtCor.textures[0] }
    const Ttela = { ...T, cor: (q) => amostraAlvo(this.fonteTela, q), corN: (q) => amostraAlvo(this.fonteTela, q).level(0) }
    this.matTela = this.material(fragTela(W, b.uTela, Ttela, uvGL))
    // a pincelada lê a cor da cena ou a já desfocada (profundidade de campo antes dela): troca pelo objeto { value }
    this.fontePintura = { value: this.rtCor.textures[0] }
    const fontePintura = (q) => amostraAlvo(this.fontePintura, q).level(0)
    this.matTensor = this.material(fragTensorGpu(W, b.uPintura.tensor, fontePintura, uvGL))
    // um material por grade de amostras (4, 5 ou 7), montado na primeira vez que o painel pede
    this.matsKuwahara = {}
    this.kuwahara = (n) => (this.matsKuwahara[n] ||= this.material(fragKuwaharaGpu(W, b.uPintura.kuwahara, n, fontePintura, amostraN(this.rtTensor.texture), uvGL)))
    // profundidade de campo (profundidade-gpu.js): os mesmos uniforms da base
    this.dof = new ProfundidadeGpu(W, b.uDof, (no) => this.material(no), T.prof, uvGL)
    this.quad = new W.QuadMesh()
  }

  material(no) {
    const m = new this.W.NodeMaterial()
    m.fragmentNode = no
    m.depthTest = false
    m.depthWrite = false
    return m
  }

  coletarExcecoes() {}

  focarEm(alvo) { this.base.focarEm(alvo) }

  tamanho(largura, altura, pixelRatio) {
    this.base.tamanho(largura, altura, pixelRatio)
    const w = Math.max(1, Math.floor(largura * pixelRatio))
    const h = Math.max(1, Math.floor(altura * pixelRatio))
    this.rtCor.setSize(w, h)
    this.uTamProf.value.set(w, h)
    this.rtOclusao.setSize(Math.ceil(w / 2), Math.ceil(h / 2))
    this.rtBrilhoA.setSize(Math.ceil(w / 4), Math.ceil(h / 4))
    this.rtBrilhoB.setSize(Math.ceil(w / 4), Math.ceil(h / 4))
    this.rtTensor.setSize(Math.ceil(w / 2), Math.ceil(h / 2))
    this.dof.tamanho(w, h)
    this.base.rtPinturaAlvo = this.rtPintura // o tamanho (cheio ou meio) sai em atualizar() da base
    this.base.meiaPintura = null
    const tb = this.base.tamBrilho
    for (let i = 0; i < 2; i++) {
      this.uDirs[i * 2].value.set(tb.x * (1 + i), 0)
      this.uDirs[i * 2 + 1].value.set(0, tb.y * (1 + i))
    }
  }

  passo(material, alvo) {
    this.quad.material = material
    this.renderer.setRenderTarget(alvo)
    this.quad.render(this.renderer)
  }

  render(tempo, velocidadeJogador) {
    this.base.atualizar(tempo, velocidadeJogador)
    this.desenhar()
  }

  // só desenha, sem avançar nada (o pré-aquecimento do WebGPU desenha uma vez a mais no primeiro quadro, KAN-70)
  desenhar() {
    const b = this.base
    const e = this.cfg.estilo
    const r = this.renderer
    const cam = this.camera

    // 1. cena: cor e luz recebida de uma vez (MRT); material sem segunda saída grava luz 0
    r.setRenderTarget(this.rtCor)
    r.setMRT(this.mrtCena)
    r.setClearColor(this.corFundo, 1)
    // sem r.clear() antes: com autoClear ligado o próprio render já limpa os dois anexos de cor e a profundidade
    // com esta mesma cor (gLuz em 0,0,0,1), e a limpeza à parte era um passe e um submit a mais por quadro (KAN-74)
    r.render(this.cena, cam)
    r.setMRT(null)

    // 3. oclusão
    if (e.oclusao > 0) {
      b.uOclusao.uProj.value.copy(cam.projectionMatrix)
      b.uOclusao.uProjInv.value.copy(cam.projectionMatrixInverse)
      b.uOclusao.uCamMundo.value.copy(cam.matrixWorld)
      b.uOclusao.uRaio.value = e.raioOclusao
      this.passo(this.matOclusao, this.rtOclusao)
    }

    // 4. brilho
    b.uClaro.uLimiar.value = e.limiarBrilho
    this.passo(this.matClaro, this.rtBrilhoA)
    for (let k = 0; k < 4; k++) this.passo(this.matDesfoque[k], k % 2 ? this.rtBrilhoA : this.rtBrilhoB)

    // 4b. profundidade de campo (profundidade-gpu.js), antes ou depois da pincelada (cfg.estilo.dofOrdem)
    let fonte = this.rtCor.textures[0]
    const dofAntes = e.dofOrdem !== 'depois'
    if (b.dofLigado && dofAntes) fonte = this.dof.desenhar(this, fonte)

    // 4c. pincelada na tela (pintura.js)
    if (b.pinturaLigada) {
      this.fontePintura.value = fonte
      this.passo(this.matTensor, this.rtTensor)
      this.passo(this.kuwahara(amostrasPintura(e)), this.rtPintura)
      fonte = this.rtPintura.texture
    }
    if (b.dofLigado && !dofAntes) fonte = this.dof.desenhar(this, fonte)
    this.fonteTela.value = fonte

    // 5. tela: o filtro já entrega a cor final em sRGB; o three não pode converter de novo
    const espaco = r.outputColorSpace
    const tom = r.toneMapping
    r.outputColorSpace = THREE.LinearSRGBColorSpace
    r.toneMapping = THREE.NoToneMapping
    this.passo(this.matTela, null)
    r.outputColorSpace = espaco
    r.toneMapping = tom
  }
}

// posição em espaço de vista a partir da profundidade (q na coordenada do WebGL)
function posVista(W, amostraProf, projInv, q) {
  const d = amostraProf(q).x
  const v = projInv.mul(W.vec4(q.mul(2.0).sub(1.0), d, 1.0))
  return v.xyz.div(v.w)
}

function fragOclusao(W, u, T, uvGL) {
  const { Fn, vec2, vec3, vec4, float, abs, normalize, cross, dot, cos, sin, floor, smoothstep, step, max, Loop, uniformArray } = W
  const { hash } = funcoes()
  const tProf = T.prof
  const uProj = ref(u.uProj), uProjInv = ref(u.uProjInv), uTexel = ref(u.uTexel), uCamMundo = ref(u.uCamMundo), uRaio = ref(u.uRaio)
  const uKernel = uniformArray(u.uKernel.value, 'vec3')
  return Fn(() => {
    const vUv = uvGL
    const d = tProf(vUv).x
    const p = posVista(W, tProf, uProjInv, vUv).toVar()
    // normal pela profundidade dos vizinhos (passo de 2 pixels da profundidade; de cada lado, o menor salto)
    const dx = vec2(uTexel.x.mul(2.0), 0.0)
    const dy = vec2(0.0, uTexel.y.mul(2.0))
    const pr = posVista(W, tProf, uProjInv, vUv.add(dx)).sub(p)
    const pl = p.sub(posVista(W, tProf, uProjInv, vUv.sub(dx)))
    const pu = posVista(W, tProf, uProjInv, vUv.add(dy)).sub(p)
    const pd = p.sub(posVista(W, tProf, uProjInv, vUv.sub(dy)))
    const ddx = abs(pr.z).lessThan(abs(pl.z)).select(pr, pl)
    const ddy = abs(pu.z).lessThan(abs(pd.z)).select(pu, pd)
    const n = normalize(cross(ddx, ddy)).toVar()
    // ruído preso ao mundo (não à tela): não escorrega quando a câmera mexe
    const pm = uCamMundo.mul(vec4(p, 1.0)).xyz
    const a = hash(floor(pm.xz.mul(24.0)).add(floor(pm.y.mul(24.0)).mul(17.0))).mul(6.2831)
    const rr = vec3(cos(a), sin(a), 0.0)
    const t = normalize(rr.sub(n.mul(dot(rr, n))))
    const b2 = cross(n, t)
    const raio = uRaio.mul(float(1.0).add(p.z.negate().mul(0.015))).toVar()
    const oc = float(0.0).toVar()
    Loop(12, ({ i }) => {
      const k = uKernel.element(i)
      // tbn * k = t*k.x + b*k.y + n*k.z; parte um pouco acima da superfície
      const s = p.add(n.mul(0.08).mul(raio)).add(t.mul(k.x).add(b2.mul(k.y)).add(n.mul(k.z)).mul(raio))
      const o = uProj.mul(vec4(s, 1.0))
      const suv = o.xy.div(o.w).mul(0.5).add(0.5)
      const zc = posVista(W, tProf, uProjInv, suv).z
      const alcance = smoothstep(0.0, 1.0, raio.div(max(abs(p.z.sub(zc)), 1e-3)))
      oc.addAssign(step(s.z.add(raio.mul(0.06)).add(p.z.negate().mul(0.012)), zc).mul(alcance))
    })
    const frontal = abs(dot(n, normalize(p.negate())))
    const ao = float(1.0).sub(oc.div(12.0).mul(smoothstep(0.12, 0.35, frontal)))
    return d.greaterThanEqual(0.99999).select(vec4(1.0), vec4(ao, ao, ao, 1.0))
  })()
}

function fragClaro(W, u, T, uvGL) {
  const { vec4, max, smoothstep } = W
  const uLimiar = ref(u.uLimiar)
  const c = T.cor(uvGL).rgb
  const l = max(c.r, max(c.g, c.b))
  return vec4(c.mul(smoothstep(uLimiar, uLimiar.add(0.6), l)), 1.0)
}

function fragDesfoque(W, fonte, uDir, vUv) {
  const s = fonte(vUv).rgb.mul(0.227)
    .add(fonte(vUv.add(uDir.mul(1.38))).rgb.mul(0.316))
    .add(fonte(vUv.sub(uDir.mul(1.38))).rgb.mul(0.316))
    .add(fonte(vUv.add(uDir.mul(3.23))).rgb.mul(0.07))
    .add(fonte(vUv.sub(uDir.mul(3.23))).rgb.mul(0.07))
  return W.vec4(s, 1.0)
}

function fragTela(W, u, T, uvGL) {
  const { Fn, If, Loop, vec2, vec3, vec4, float, int, abs, max, min, clamp, mix, step, smoothstep, pow, exp, sqrt,
    length, fract, floor, dot, cos, sin, fwidth, atan2, screenCoordinate } = W
  const { hash, ruido } = funcoes()
  const U = {}
  for (const k in u) if (!k.startsWith('t')) U[k] = ref(u[k])
  const LUM = vec3(0.299, 0.587, 0.114)

  const distancia = (q) => {
    const d = T.prof(q).x
    return U.uNear.mul(U.uFar).negate().div(U.uFar.sub(U.uNear).mul(d).sub(U.uFar))
  }
  // profundidade de campo: o traço e a quina clara somem onde o fundo já está desfocado (dofTraco do GLSL)
  const dofTraco = (d) => {
    const t = clamp(d.sub(U.uDofLongeIni).div(max(U.uDofLongeCheio.sub(U.uDofLongeIni), 1.0)), 0.0, 1.0)
    const um = float(1.0).sub(t)
    const r = clamp(float(1.0).sub(um.mul(um)).mul(U.uDofLonge), 0.0, 1.0).mul(U.uDofRaio)
    return U.uDofLiga.lessThan(0.5).select(float(1.0), float(1.0).sub(smoothstep(0.5, 1.5, r)))
  }
  const paraSRGB = (c0) => {
    const c = clamp(c0, 0.0, 1.0)
    return mix(c.mul(12.92), pow(c, vec3(1.0 / 2.4)).mul(1.055).sub(0.055), step(0.0031308, c))
  }
  // retícula de impressão: uma grade de pontos girada; o ponto cresce com a cobertura de tinta
  const pontoGrade = (p, ang, tam, cobertura) => {
    const c = Math.cos(ang), s = Math.sin(ang)
    // mat2(c, -s, s, c) * p (colunas): (c*x + s*y, -s*x + c*y)
    const g = vec2(p.x.mul(c).add(p.y.mul(s)), p.x.mul(-s).add(p.y.mul(c))).div(tam)
    const d = length(fract(g).sub(0.5))
    const r = sqrt(clamp(cobertura, 0.0, 1.0)).mul(0.7)
    const aa = clamp(fwidth(d), 0.01, 0.1)
    return float(1.0).sub(smoothstep(r.sub(aa), r.add(aa), d)).mul(step(0.002, cobertura))
  }
  const paraHSV = (c) => {
    const K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0)
    const p = mix(vec4(c.b, c.g, K.w, K.z), vec4(c.g, c.b, K.x, K.y), step(c.b, c.g))
    const q = mix(vec4(p.x, p.y, p.w, c.r), vec4(c.r, p.y, p.z, p.x), step(p.x, c.r))
    const d = q.x.sub(min(q.w, q.y))
    return vec3(abs(q.z.add(q.w.sub(q.y).div(d.mul(6.0).add(1e-10)))), d.div(q.x.add(1e-10)), q.x)
  }
  const distMatiz = (a, b) => { const d = abs(a.sub(b)); return min(d, float(1.0).sub(d)) }
  const corDescasada = (uv, nivel) => {
    const amostrar = nivel ? T.corN : T.cor
    const d = uv.sub(0.5)
    const off = d.mul(dot(d, d)).mul(U.uAberracao).mul(4.0)
    const reg = vec2(U.uDesalinho, U.uDesalinho.mul(-0.6)).mul(U.uPR).div(U.uRes)
    const uu = uv.add(reg)
    return vec3(amostrar(uu.add(off)).r, amostrar(uu).g, amostrar(uu.sub(off)).b)
  }

  return Fn(() => {
    const uv = uvGL
    // gl_FragCoord do WebGL: origem embaixo
    const frag = vec2(screenCoordinate.x, U.uRes.y.sub(screenCoordinate.y))
    const px = frag.div(U.uPR)
    const dc = distancia(uv)
    const ceu = step(U.uFar.mul(0.9), dc)

    // 1. cor, aberração e fundo desfocado
    const cor = corDescasada(uv, false).toVar()
    If(U.uDesfoque.greaterThan(0.0), () => {
      const k = smoothstep(U.uFoco, U.uFoco.mul(4.0), dc).mul(U.uDesfoque)
      If(k.greaterThan(0.02), () => {
        const passo = k.mul(4.0).mul(U.uPR).div(U.uRes)
        const soma = cor.toVar()
        Loop(8, ({ i }) => {
          const a = i.toFloat().mul(0.785398)
          soma.addAssign(corDescasada(uv.add(vec2(cos(a), sin(a)).mul(passo)), true))
        })
        cor.assign(soma.div(9.0))
      })
    })

    // 2. oclusão nos cantos (borrada com 5 amostras)
    const to = vec2(3.0).div(U.uRes)
    const ao = T.oclusao(uv).r.mul(0.4)
      .add(T.oclusao(uv.add(vec2(to.x, 0.0))).r.mul(0.15))
      .add(T.oclusao(uv.sub(vec2(to.x, 0.0))).r.mul(0.15))
      .add(T.oclusao(uv.add(vec2(0.0, to.y))).r.mul(0.15))
      .add(T.oclusao(uv.sub(vec2(0.0, to.y))).r.mul(0.15)).toVar()
    cor.mulAssign(mix(1.0, ao, U.uOclusao.mul(float(1.0).sub(ceu))))

    // 3. névoa em camadas: mais densa embaixo, perto do mar; maresia a partir de ~20 m
    If(ceu.lessThan(0.5), () => {
      const pv = posVista(W, T.prof, U.uProjInv, uv)
      const pm = U.uCamMundo.mul(vec4(pv, 1.0)).xyz
      const nev = float(1.0).sub(exp(length(pv).negate().mul(U.uNevoaDens))).mul(exp(max(pm.y, 0.0).negate().mul(U.uNevoaQueda)))
      cor.assign(mix(cor, U.uNevoaCor, clamp(nev, 0.0, 1.0)))
      const km = float(1.0).sub(exp(max(length(pv).sub(20.0), 0.0).negate().mul(U.uMaresia)))
      If(U.uArcane.greaterThan(0.5), () => {
        If(U.uArcLuzEstrutura.greaterThan(0.5), () => {
          // A distância se tinge com a cor do céu na hora (azul ao meio-dia, quente no fim
          // da tarde) em vez de virar cinza: era o cinza que lavava o fundo inteiro.
          const Lc = dot(cor, LUM)
          // (3b: menos clareamento e menos força; o véu bege da distância lavava a imagem inteira)
          // (item 6: o fundo clareia para a cor do ar, não só se tinge, e perde um pouco de croma)
          const alvoAr = U.uArCor.mul(mix(float(0.35).add(Lc.mul(0.8)), float(1.0), U.uArcArClareia))
          const comAr = mix(mix(cor, vec3(Lc), 0.3), alvoAr, 0.7)
          // pesa mais no fundo que no meio do caminho: o meio da cena não lava
          cor.assign(mix(cor, comAr, clamp(km.mul(km.mul(0.6).add(0.4)).mul(U.uArcArTinta).mul(1.4), 0.0, 1.0)))
        }).Else(() => {
          const Lc = dot(cor, LUM)
          cor.assign(mix(cor, vec3(Lc), km.mul(0.6)))
          cor.assign(mix(cor, U.uNevoaCor, km.mul(0.3)))
        })
      }).Else(() => {
        const Lc = dot(cor, LUM)
        cor.assign(mix(cor, vec3(Lc), km.mul(0.6)))
        cor.assign(mix(cor, U.uNevoaCor, km.mul(0.3)))
      })
    })

    // grade de pontos: acompanha o giro da câmera
    const pg = px.add(U.uDesloc)
    // mat2(0.7071, -0.7071, 0.7071, 0.7071) * pg (colunas): (0.7071*x + 0.7071*y, -0.7071*x + 0.7071*y)
    const grade = vec2(pg.x.mul(0.7071).add(pg.y.mul(0.7071)), pg.x.mul(-0.7071).add(pg.y.mul(0.7071))).div(U.uTamPonto)
    const dPonto = length(fract(grade).sub(0.5))
    const aa = clamp(fwidth(dPonto), 0.01, 0.08)

    // 4. brilho das luzes
    const bri = T.brilho(uv).rgb.mul(U.uBrilho).mul(float(1.0).sub(smoothstep(250.0, 450.0, dc))).toVar()
    If(U.uArcane.greaterThan(0.5), () => { bri.mulAssign(mix(0.12, 1.0, smoothstep(10.0, 60.0, dc))) })
    const bl = max(bri.r, max(bri.g, bri.b))
    const rB = sqrt(smoothstep(0.05, 0.6, bl)).mul(0.62)
    const pB = float(1.0).sub(smoothstep(rB.sub(aa), rB.add(aa), dPonto))
    cor.addAssign(bri.mul(mix(1.0, pB.mul(2.2), U.uBloomPontos)))

    cor.assign(paraSRGB(cor.mul(U.uExposicao)))
    If(U.uArcane.greaterThan(0.5), () => {
      const Lg = dot(cor, LUM)
      // (sertão: o céu não passa pela exposição baixa do mundo)
      const Ln = clamp(Lg.mul(mix(U.uArcExposicao, float(1.0), ceu)).sub(0.5).mul(U.uArcContraste).add(0.5), 0.0, 1.0).toVar()
      Ln.assign(mix(Ln, Ln.mul(Ln).mul(float(3.0).sub(Ln.mul(2.0))), 0.35))
      If(U.uArcLuzEstrutura.greaterThan(0.5), () => {
        // estrutura de valor: a curva em S separa sombra de luz (o valor não é só mais escuro)
        // (só no mundo: no céu a curva estourava o azul claro em branco)
        const LnE = clamp(mix(Ln, Ln.mul(Ln).mul(float(3.0).sub(Ln.mul(2.0))), 0.3).sub(0.42).mul(1.12).add(0.42), 0.0, 1.0)
        Ln.assign(mix(LnE, Ln, ceu))
      })
      // 3b: abre a faixa de valor (níveis): o preto desce, a cal ao sol chega perto do branco. Só no mundo
      Ln.assign(mix(clamp(Ln.sub(U.uArcPreto).div(max(U.uArcBranco.sub(U.uArcPreto), 0.05)), 0.0, 1.0), Ln, ceu))
      // metade do ganho de valor entra como cinza somado (multiplicar tudo aumentava o croma junto, 3b)
      cor.assign(mix(cor.mul(Ln.div(max(Lg, 1e-3))), cor.add(Ln.sub(Lg)), 0.5))
    })
    const L = dot(cor, LUM).toVar()

    // 5. sombra fria e luz quente
    If(U.uArcane.greaterThan(0.5), () => {
      If(U.uArcLuzEstrutura.greaterThan(0.5), () => {
        // A sombra esfria SEM mudar a cor do objeto: multiplicar pela cor da sombra puxava
        // o matiz (a areia virava azul). Aqui a sombra é uma cor fria misturada por cima, e
        // a luz é somada, nunca multiplicada.
        // (3b: o céu fica fora; a "sombra" azul e a luz somada o lavavam)
        const sombra = U.uTomSombra.mul(float(1.0).sub(smoothstep(0.05, 0.55, L))).mul(float(1.0).sub(ceu))
        cor.assign(mix(cor, U.uCorSombra.mul(float(0.9).add(L.mul(0.5))), sombra.mul(0.8)))
        cor.addAssign(U.uCorLuz.mul(U.uTomLuz).mul(smoothstep(0.55, 1.0, L)).mul(0.3).mul(float(1.0).sub(ceu)))
      }).Else(() => {
        cor.mulAssign(mix(vec3(1.0), U.uCorSombra.mul(1.6), U.uTomSombra.mul(float(1.0).sub(smoothstep(0.05, 0.55, L)))))
        cor.assign(mix(cor, cor.mul(U.uCorLuz).mul(1.2), U.uTomLuz.mul(smoothstep(0.55, 1.0, L))))
      })
    }).Else(() => {
      cor.mulAssign(mix(vec3(1.0), U.uCorSombra.mul(1.6), U.uTomSombra.mul(float(1.0).sub(smoothstep(0.05, 0.55, L)))))
      cor.assign(mix(cor, cor.mul(U.uCorLuz).mul(1.2), U.uTomLuz.mul(smoothstep(0.55, 1.0, L))))
    })
    L.assign(dot(cor, LUM))

    const tremorH = ruido(px.add(U.uDesloc).mul(0.05).add(U.uTempo.mul(2.0))).mul(0.6)
    // a luz recebida é lida fora das condições (amostra comum não pode ficar dentro de if no WGSL)
    const luzT = T.luz(uv)
    If(U.uArcane.greaterThan(0.5), () => {
      // visual Arcane: sem retícula nem hachura
    }).ElseIf(U.uModo.greaterThan(0.5), () => {
      const pertoR = float(1.0).sub(smoothstep(U.uDistReticula.mul(0.45), U.uDistReticula, dc))
      const lr = luzT.r
      const emis = luzT.g
      // 6. pontos na luz
      const forte = clamp(smoothstep(U.uLimLuzPontos.sub(0.15), U.uLimLuzPontos.add(0.3), lr).mul(float(1.0).sub(U.uNoite.mul(0.85))).add(emis.mul(0.6)), 0.0, 1.0)
        .mul(float(1.0).sub(ceu)).mul(pertoR)
      const rL = sqrt(forte).mul(0.45)
      const pL = float(1.0).sub(smoothstep(rL.sub(aa), rL.add(aa), dPonto))
      cor.assign(mix(cor, mix(cor, U.uCorPontoLuz, 0.75), pL.mul(U.uIntPontosLuz)))
      // 7. hachura na sombra
      const sombraL = float(1.0).sub(smoothstep(U.uLimHachuraLuz.sub(0.14), U.uLimHachuraLuz.add(0.04), lr))
      const sombraAO = smoothstep(0.08, 0.35, float(1.0).sub(ao).mul(U.uHachuraAO)).mul(float(1.0).sub(smoothstep(20.0, 45.0, dc)))
      const s = max(sombraL, sombraAO).mul(float(1.0).sub(ceu)).mul(pertoR)
      const funda = float(1.0).sub(smoothstep(U.uLimHachuraLuz.mul(0.12), U.uLimHachuraLuz.mul(0.28), lr)).mul(float(1.0).sub(ceu)).mul(pertoR)
      const larg = mix(0.05, 0.14, s)
      const h1 = abs(fract(pg.x.sub(pg.y).div(U.uEspHachura).add(tremorH)).sub(0.5))
      const aaH = clamp(fwidth(h1), 0.005, 0.08)
      const l1 = float(1.0).sub(smoothstep(larg.sub(aaH), larg.add(aaH), h1))
      const h2 = abs(fract(pg.x.add(pg.y).div(U.uEspHachura.mul(1.3)).add(tremorH)).sub(0.5))
      const l2 = float(1.0).sub(smoothstep(larg.sub(aaH), larg.add(aaH), h2))
      cor.assign(mix(cor, U.uCorTinta, l1.mul(s).mul(U.uHachura)))
      cor.assign(mix(cor, U.uCorTinta, l2.mul(funda).mul(U.uHachura).mul(U.uHachuraCruzada)))
    }).Else(() => {
      // modo antigo: retícula escurece a sombra, decidida pela luminância da cor final
      const sombra = float(1.0).sub(smoothstep(U.uLimRet.sub(0.18), U.uLimRet.add(0.04), L)).mul(float(1.0).sub(ceu.mul(0.85)))
      const raio = sqrt(sombra).mul(0.62)
      const ponto = float(1.0).sub(smoothstep(raio.sub(aa), raio.add(aa), dPonto))
      cor.assign(mix(cor, mix(cor.mul(0.5), U.uCorRet, U.uTintaRet), ponto.mul(sombra).mul(U.uIntRet)))
      const h = abs(fract(pg.x.sub(pg.y).div(U.uEspHachura).add(tremorH)).sub(0.5))
      const linhaH = float(1.0).sub(smoothstep(0.06, 0.14, h))
      const fundo = float(1.0).sub(smoothstep(U.uLimHachura.sub(0.08), U.uLimHachura, L)).mul(float(1.0).sub(ceu))
      cor.assign(mix(cor, U.uCorTinta, linhaH.mul(fundo).mul(U.uHachura)))
    })

    // 8. nanquim: mais grosso perto, fino longe, forte no personagem, leve no cenário
    const alfa = T.cor(uv).a
    const peso = alfa.lessThan(0.7).select(float(1.0), alfa.lessThan(0.95).select(float(0.8), float(0.45)))
    const escala = mix(1.0, 0.45, smoothstep(6.0, 90.0, dc)).mul(mix(1.0, 1.35, step(0.9, peso)))
    const tremor = vec2(ruido(px.div(23.0).add(U.uTempo.mul(5.3))), ruido(px.div(23.0).add(9.1).add(U.uTempo.mul(5.3))))
      .sub(0.5).mul(U.uTremor).mul(U.uPR).div(U.uRes)
    const uvE = floor(uv.add(tremor).mul(U.uRes)).add(0.5).div(U.uRes)
    const o = max(1.0, floor(U.uEspLinha.mul(escala).mul(U.uPR).add(0.5))).div(U.uRes)
    const d0 = distancia(uvE)
    const dl = distancia(uvE.sub(vec2(o.x, 0.0)))
    const dr = distancia(uvE.add(vec2(o.x, 0.0)))
    const dd = distancia(uvE.sub(vec2(0.0, o.y)))
    const du = distancia(uvE.add(vec2(0.0, o.y)))
    const lap = abs(dl.add(dr).sub(d0.mul(2.0))).add(abs(du.add(dd).sub(d0.mul(2.0))))
    const bordaP = smoothstep(U.uLimProf, U.uLimProf.mul(2.0), lap.div(max(d0, 0.001)))
    const w0 = float(1.0).div(d0), wl = float(1.0).div(dl), wr = float(1.0).div(dr), wd = float(1.0).div(dd), wu = float(1.0).div(du)
    const gx = abs(wr.sub(w0).sub(w0.sub(wl))).div(max(abs(wr.sub(wl)), w0.mul(0.02)))
    const gy = abs(wu.sub(w0).sub(w0.sub(wd))).div(max(abs(wu.sub(wd)), w0.mul(0.02)))
    const bordaN = smoothstep(U.uLimNormal, U.uLimNormal.add(0.4), max(gx, gy)).mul(0.8)
    const dmin = min(d0, min(min(dl, dr), min(du, dd)))
    const alcance = mix(U.uDistLinha, U.uDistLinha.mul(3.0), step(0.9, peso))
    const perto = float(1.0).sub(smoothstep(alcance.mul(0.5), alcance, dmin)).mul(dofTraco(d0))
    const forca = mix(U.uPesoCenario, 1.0, smoothstep(0.3, 1.0, peso))
    const borda = max(bordaP, bordaN).mul(perto).mul(forca)
    If(U.uArcane.greaterThan(0.5), () => {
      const tintaLocal = cor.mul(vec3(0.32, 0.3, 0.38))
      cor.assign(mix(cor, tintaLocal, bordaP.mul(perto).mul(forca).mul(U.uArcLinha)))
      // ARESTA CLARA (item 4): quina que se projeta para a câmera ganha a borda gasta e clara do reboco
      const convexo = smoothstep(0.002, 0.02, dl.add(dr).add(du).add(dd).mul(0.25).sub(d0).div(max(d0, 0.001)))
      const aresta = bordaN.mul(convexo).mul(float(1.0).sub(smoothstep(25.0, 45.0, d0))).mul(step(0.95, alfa)).mul(float(1.0).sub(ceu)).mul(dofTraco(d0))
      cor.assign(mix(cor, cor.mul(1.22).add(vec3(0.05, 0.045, 0.035)), clamp(aresta.mul(U.uArcAresta), 0.0, 1.0)))
    }).Else(() => {
      cor.assign(mix(cor, U.uCorTinta, borda.mul(U.uIntTinta)))
    })

    // 9. saturação, papel e grão
    const Lm = dot(cor, LUM)
    cor.assign(mix(vec3(Lm), cor, U.uSaturacao))

    // MEMÓRIA (1881): a cena vira página de jornal ilustrado, em cinco tintas sobre papel
    If(U.uMemoria.greaterThan(0.001), () => {
      const hsv = paraHSV(clamp(cor, 0.0, 1.0))
      const Lp = pow(dot(cor, LUM), 0.75)
      const k = smoothstep(0.22, 0.75, hsv.y).mul(smoothstep(0.05, 0.35, hsv.z)).mul(0.85)
      const wR = float(1.0).sub(smoothstep(0.02, 0.06, distMatiz(hsv.x, float(0.0))))
      const wY0 = float(1.0).sub(smoothstep(0.05, 0.16, distMatiz(hsv.x, float(0.11))))
      const wB0 = float(1.0).sub(smoothstep(0.1, 0.25, distMatiz(hsv.x, float(0.58))))
      const wG = float(1.0).sub(smoothstep(0.08, 0.2, distMatiz(hsv.x, float(0.33))))
      const wY = max(wY0, wG.mul(0.75))
      const wB = max(wB0, wG.mul(0.8))
      const tamM = U.uTamPonto.mul(1.5)
      const imp = vec3(U.uMemPapel).toVar()
      imp.mulAssign(mix(vec3(1.0), U.uMemOcre, pontoGrade(pg, 0.0, tamM, wY.mul(k).mul(0.55))))
      imp.mulAssign(mix(vec3(1.0), U.uMemUrucum, pontoGrade(pg.add(vec2(1.3, 0.7)), 0.26, tamM, wR.mul(k))))
      imp.mulAssign(mix(vec3(1.0), U.uMemAnil, pontoGrade(pg.add(vec2(0.4, 1.9)), 1.31, tamM, wB.mul(k))))
      const escuro = smoothstep(0.3, 0.95, float(1.0).sub(Lp))
      imp.mulAssign(mix(vec3(1.0), U.uMemTinta, pontoGrade(pg, 0.785, tamM.mul(0.85), escuro.mul(escuro).mul(0.95))))
      cor.assign(mix(cor, imp, U.uMemoria))
    })
    cor.mulAssign(float(1.0).sub(U.uPapel.mul(ruido(px.mul(0.35)).mul(0.6).add(ruido(px.mul(0.04)).mul(0.4)))))
    // tela de pintura (visual Arcane): trama de fios de algodão, irregular, presa à tela como a tela do quadro
    If(U.uTelaPintura.greaterThan(0.001), () => {
      const fioX = sin(px.x.mul(1.9).add(ruido(px.mul(vec2(0.03, 0.11))).mul(4.0)))
      const fioY = sin(px.y.mul(1.9).add(ruido(px.mul(vec2(0.11, 0.03)).add(7.0)).mul(4.0)))
      const trama = fioX.mul(fioY).mul(0.6).add(ruido(px.mul(0.5)).sub(0.5).mul(0.8))
      cor.mulAssign(float(1.0).add(trama.mul(U.uTelaPintura)))
    })
    cor.addAssign(hash(floor(px).add(fract(U.uTempo.mul(7.13)).mul(91.7))).sub(0.5).mul(U.uGrao))

    // 10. linhas de velocidade quando corre
    const dv = uv.sub(0.5).mul(vec2(U.uRes.x.div(U.uRes.y), 1.0))
    const rv = length(dv)
    If(U.uVelocidade.greaterThan(0.01), () => {
      const a = atan2(dv.y, dv.x)
      const raia = step(0.8, ruido(vec2(a.mul(38.0), U.uTempo.mul(9.0))))
      cor.assign(mix(cor, vec3(1.0), raia.mul(smoothstep(0.38, 0.75, rv)).mul(U.uVelocidade).mul(0.55)))
    })

    // 11. reflexo de lente: só com o sol à vista (profundidade em volta dele)
    If(U.uFlare.greaterThan(0.001).and(U.uSolTela.z.greaterThan(0.5)), () => {
      const sp = U.uSolTela.xy
      const vis = float(0.0).toVar()
      Loop({ start: int(-2), end: int(2), condition: '<=' }, ({ i }) => {
        Loop({ start: int(-2), end: int(2), condition: '<=', name: 'k' }, ({ k }) => {
          const q = sp.add(vec2(i.toFloat(), k.toFloat()).mul(0.007))
          const dentro = q.x.greaterThan(0.0).and(q.x.lessThan(1.0)).and(q.y.greaterThan(0.0)).and(q.y.lessThan(1.0))
          vis.addAssign(dentro.select(step(U.uFar.mul(0.9), distancia(q)), float(0.0)))
        })
      })
      vis.divAssign(25.0)
      If(vis.greaterThan(0.0), () => {
        const asp = U.uRes.x.div(U.uRes.y)
        const dc2 = vec2(0.5).sub(sp)
        const fl = vec3(0.0).toVar()
        for (let g = 0; g < 6; g++) {
          const fg = g
          const t = 0.35 + fg * 0.33 + fg * fg * 0.03
          const tam = 0.025 + 0.03 * frac(fg * 0.618 + 0.3) + (g === 3 ? 0.05 : 0.0)
          const tom = mix(vec3(0.55, 0.85, 1.0), vec3(1.0, 0.65, 0.35), frac(fg * 0.37))
          const r = length(uv.sub(sp.add(dc2.mul(t))).mul(vec2(asp, 1.0)))
          const disco = smoothstep(tam, tam * 0.55, r).mul(0.06 + 0.05 * frac(fg * 0.71))
          const aro = smoothstep(tam * 0.12, 0.0, abs(r.sub(tam))).mul(0.05)
          fl.addAssign(tom.mul(disco.add(aro)))
        }
        const rc = length(uv.sub(0.5).mul(vec2(asp, 1.0)))
        const anel = smoothstep(0.03, 0.0, abs(rc.sub(0.42))).mul(0.05)
        fl.addAssign(anel.mul(mix(vec3(1.0, 0.5, 0.3), vec3(0.4, 0.7, 1.0), smoothstep(0.39, 0.45, rc))))
        const dx = abs(uv.x.sub(sp.x)).mul(asp), dy = abs(uv.y.sub(sp.y))
        const faixa = exp(dy.mul(-160.0)).mul(exp(dx.mul(-1.8))).mul(0.45)
        const rs = length(uv.sub(sp).mul(vec2(asp, 1.0)))
        const brilhoS = exp(rs.mul(-7.0)).mul(0.3)
        fl.assign(U.uCorFlare.mul(faixa.add(brilhoS)).add(U.uCorFlare.mul(fl).mul(0.6)).add(fl))
        cor.addAssign(fl.mul(vis).mul(U.uFlare))
      })
    })

    // 12. GRADAÇÃO FINAL (visual Arcane): curva de contraste e saturação pela paleta "cal e sal".
    // A fachada nunca vira acento: o que é neutro perde cor, o que é saturado fica.
    If(U.uArcane.greaterThan(0.5), () => {
      If(U.uArcGradeCal.greaterThan(0.5), () => {
        const Lf = dot(cor, LUM)
        // a curva fica presa entre 0,7 e 1,25: sem limite, as sombras viravam preto chapado
        const curva = clamp(Lf.sub(0.5).mul(U.uArcGradeContraste).add(0.5), 0.3, 1.0)
        cor.mulAssign(mix(float(1.0), clamp(curva.div(max(Lf, 0.15)), 0.7, 1.25), U.uArcGradeCal.mul(float(1.0).sub(ceu))))
        const mx = max(cor.r, max(cor.g, cor.b))
        const mn = min(cor.r, min(cor.g, cor.b))
        const sat = mx.sub(mn).div(max(mx, 1e-3))
        const neutro = float(1.0).sub(smoothstep(0.04, 0.26, sat))
        // só no mundo: o céu claro também é pouco saturado, e puxado para o cal virava creme e branco
        cor.assign(mix(cor, mix(vec3(Lf), U.uCalCor, 0.4).mul(mx), neutro.mul(U.uArcCalNeutro).mul(U.uArcGradeCal).mul(float(1.0).sub(ceu))))
        cor.assign(mix(vec3(Lf), cor, U.uArcGradeSaturacao))
      })
    })

    // 2D por cima (item 7, fx2d.js), desligado por padrão
    If(U.uFx.greaterThan(0.001), () => {
      cor.assign(aplicarFx2dTsl(W, U, { ruido, pontoGrade }, cor, uv, pg, U.uRes.x.div(U.uRes.y), ceu))
    })
    // 13. vinheta
    cor.mulAssign(float(1.0).sub(U.uVinheta.mul(smoothstep(0.45, 1.05, rv))))
    return vec4(clamp(cor, 0.0, 1.0), 1.0)
  })()
}

// fract de constante (o laço dos fantasmas do reflexo é desenrolado em JavaScript, com os mesmos números)
function frac(x) { return x - Math.floor(x) }
