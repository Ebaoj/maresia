// Visual Arcane em TSL, para o modo webgpu (motor F1, KAN-67): o mesmo núcleo do pintar() de materiais.js,
// que no WebGL entra como código GLSL injetado (onBeforeCompile) e no WebGPU não roda.
// - cor: textura pintada em três eixos (topo, lado, alternativa), manchas grandes ("massa") e o tom da
//   pincelada presa ao mundo
// - luz: a luz recebida (direta + ambiente) vira três faixas (sombra fria, meio-tom, luz com a cor do sol),
//   com a borda recortada pela pincelada e a luz de recorte nas bordas contra o sol
// Fica de fora nesta fase: lampiões à noite e a segunda saída de luz (gLuz), que só o pós usa.
// As contas seguem o GLSL linha a linha; os nomes são os mesmos para comparar.

import { globais } from '../globais.js'

let U = null // uniforms do TSL, copiados de globais a cada quadro
let T = null // funções TSL montadas uma vez
let ModeloToon = null

function montar(W) {
  const { Fn, float, vec2, vec3, uniform, fract, floor, dot, mix, pow, abs } = W
  U = {
    pincel: uniform(0), pincelEscala: uniform(1), luzRef: uniform(3), texForca: uniform(0.8), arcane: uniform(1),
    arcLim: uniform(globais.uArcLim.value.clone()), arcSuave: uniform(0.05), arcPincel: uniform(0.35),
    arcCorSombra: uniform(globais.uArcCorSombra.value.clone()), arcNiveis: uniform(globais.uArcNiveis.value.clone()),
    arcRim: uniform(0.6), solDir: uniform(globais.uSolDir.value.clone()),
  }
  const hP = Fn(([p0]) => {
    const p = fract(p0.mul(vec2(123.34, 456.21))).toVar()
    p.addAssign(dot(p, p.add(45.32)))
    return fract(p.x.mul(p.y))
  })
  const vP = Fn(([p]) => {
    const i = floor(p)
    const f = fract(p)
    const u = f.mul(f).mul(float(3).sub(f.mul(2)))
    return mix(mix(hP(i), hP(i.add(vec2(1, 0))), u.x), mix(hP(i.add(vec2(0, 1))), hP(i.add(vec2(1, 1))), u.x), u.y)
  })
  const traco = Fn(([uv]) => vP(uv.mul(vec2(0.6, 2.8))).mul(0.55)
    .add(vP(uv.mul(vec2(1.7, 7.0)).add(3.1)).mul(0.3))
    .add(vP(uv.mul(vec2(5.0, 18.0)).add(7.7)).mul(0.15)))
  const pincelada = Fn(([p0, n]) => {
    const w = pow(abs(n), vec3(4.0)).toVar()
    w.divAssign(w.x.add(w.y).add(w.z).add(1e-4))
    const p = p0.mul(U.pincelEscala)
    // mat2(0.87, -0.5, 0.5, 0.87) * p.xz do GLSL (matriz por colunas)
    const giro = vec2(p.x.mul(0.87).add(p.z.mul(0.5)), p.x.mul(-0.5).add(p.z.mul(0.87)))
    return traco(p.zy).mul(w.x).add(traco(giro).mul(w.y)).add(traco(p.xy).mul(w.z))
  })
  T = { vP, pincelada }
  // o ToonLightingModel não é exportado no 0.170: sai de um material toon do próprio WebGPU
  ModeloToon = new W.MeshToonNodeMaterial().setupLightingModel().constructor
}

export function atualizarUniformsArcane() {
  if (!U) return
  U.pincel.value = globais.uPincel.value
  U.pincelEscala.value = globais.uPincelEscala.value
  U.luzRef.value = globais.uLuzRef.value
  U.texForca.value = globais.uTexForca.value
  U.arcane.value = globais.uArcane.value
  U.arcLim.value.copy(globais.uArcLim.value)
  U.arcSuave.value = globais.uArcSuave.value
  U.arcPincel.value = globais.uArcPincel.value
  U.arcCorSombra.value.copy(globais.uArcCorSombra.value)
  U.arcNiveis.value.copy(globais.uArcNiveis.value)
  U.arcRim.value = globais.uArcRim.value
  U.solDir.value.copy(globais.uSolDir.value)
}

// cor do material: textura pintada (se houver) e pincelada, multiplicando a cor de sempre (mapa, cor por
// vértice e cor por cópia continuam por conta do three)
// (dentro de uma Fn: variável do TSL, como toVar, só existe dentro de uma função montada pelo construtor)
function corPintada(W, tp) {
  return W.Fn(() => corPintadaCorpo(W, tp))()
}

function corPintadaCorpo(W, tp) {
  const { vec3, vec4, texture, positionWorld, normalWorld, attribute, mix, pow, abs, dot, max, step, float, normalize } = W
  const n = normalize(normalWorld)
  const pW = positionWorld
  let fator = vec3(1.0)
  if (tp) {
    const wT = pow(abs(n), vec3(4.0)).toVar()
    wT.divAssign(wT.x.add(wT.y).add(wT.z).add(1e-4))
    const tri = (topo, lado, p) => texture(lado, p.zy).rgb.mul(wT.x).add(texture(topo, p.xz).rgb.mul(wT.y)).add(texture(lado, p.xy).rgb.mul(wT.z))
    const pT = pW.div(tp.tam)
    let det = tri(tp.topo, tp.lado, pT)
    if (tp.alt) det = mix(det, tri(tp.alt, tp.alt, pW.div(tp.tamAlt)), step(0.5, attribute('aTexAlt', 'float')))
    // massa: a mesma textura 9 vezes maior e girada (vec2 * mat2(0.8, -0.6, 0.6, 0.8) do GLSL)
    const pM = pW.div(tp.tam * 9.0)
    const g = (v) => W.vec2(v.x.mul(0.8).sub(v.y.mul(0.6)), v.x.mul(0.6).add(v.y.mul(0.8)))
    const macT = texture(tp.lado, g(pM.zy)).rgb.mul(wT.x).add(texture(tp.topo, g(pM.xz)).rgb.mul(wT.y)).add(texture(tp.lado, g(pM.xy)).rgb.mul(wT.z))
    const macL = dot(macT.mul(2.0), vec3(0.333))
    const detN = float(1.0).add(det.mul(2.0).sub(1.0).mul(tp.contraste)).mul(float(1.0).add(macL.sub(1.0).mul(tp.massa)))
    fator = mix(vec3(1.0), max(detN, vec3(0.0)), U.texForca.mul(U.arcane))
  }
  const bp = T.pincelada(pW, n)
  const tom = T.vP(pW.xz.mul(0.02).add(pW.y.mul(0.013)))
  const tomCor = mix(vec3(1.0), vec3(1.07, 0.96, 1.05), tom.sub(0.5).mul(U.pincel).mul(1.6))
  fator = fator.mul(float(1.0).add(bp.sub(0.5).mul(U.pincel))).mul(tomCor)
  return vec4(W.materialColor.rgb.mul(fator), W.materialColor.a)
}

function modeloArcane(W) {
  const { vec3, dot, max, clamp, mix, smoothstep, pow, abs, normalize, float, positionWorld, normalWorld, cameraPosition, diffuseColor, BRDF_Lambert } = W
  const LUM = vec3(0.299, 0.587, 0.114)
  return class ModeloArcane extends ModeloToon {
    indirect(ctx, stack, builder) {
      super.indirect(ctx, stack, builder)
      const { directDiffuse, indirectDiffuse } = ctx.reflectedLight
      const alb = max(BRDF_Lambert({ diffuseColor: diffuseColor.rgb }), vec3(1e-3))
      const irrL = directDiffuse.add(indirectDiffuse).div(alb)
      const lumA = dot(irrL, LUM).div(max(U.luzRef, 0.05))
      const pesoIrr = max(dot(irrL, LUM), 1e-3)
      const tomA = clamp(irrL.div(pesoIrr), 0.0, 2.0)
      const nA = normalize(normalWorld)
      const pinA = T.pincelada(positionWorld.mul(3.1), nA).sub(0.5)
      const tA = lumA.add(pinA.mul(U.arcPincel))
      const sombraA = float(1.0).sub(smoothstep(U.arcLim.x.sub(U.arcSuave), U.arcLim.x.add(U.arcSuave), tA))
      const luzA = smoothstep(U.arcLim.y.sub(U.arcSuave), U.arcLim.y.add(U.arcSuave), tA)
      const cLuz = mix(vec3(1.0), tomA, 0.65).mul(U.arcNiveis.z)
      const cMeio = mix(vec3(1.0), tomA, 0.35).mul(U.arcNiveis.y)
      const friaA = U.arcCorSombra.div(max(dot(U.arcCorSombra, LUM), 1e-3))
      const cSomb = mix(vec3(1.0), friaA, 0.5).mul(U.arcNiveis.x).mul(mix(vec3(1.0), tomA, 0.15))
      const vA = normalize(cameraPosition.sub(positionWorld))
      const bordaA = pow(float(1.0).sub(clamp(abs(dot(nA, vA)), 0.0, 1.0)), 3.0)
      const sol = normalize(U.solDir)
      const paraSol = smoothstep(-0.05, 0.5, dot(nA, sol))
      const contraLuz = smoothstep(-0.4, 0.6, dot(vA.negate(), sol))
      const faixa = mix(mix(cMeio, cLuz, luzA), cSomb, sombraA)
        .add(mix(vec3(1.0), tomA, 0.8).mul(bordaA).mul(paraSol).mul(contraLuz).mul(U.arcRim).mul(1.4))
      const arc = U.arcane.greaterThan(0.5)
      directDiffuse.assign(arc.select(BRDF_Lambert({ diffuseColor: diffuseColor.rgb }).mul(faixa).mul(U.luzRef), directDiffuse))
      indirectDiffuse.assign(arc.select(vec3(0.0), indirectDiffuse))
    }
  }
}

let ModeloArcane = null

// Material do WebGPU equivalente a um material que passou por pintar() (MeshToonMaterial do three)
export function materialArcane(W, m) {
  if (!U) montar(W)
  if (!ModeloArcane) ModeloArcane = modeloArcane(W)
  const nm = new W.MeshToonNodeMaterial()
  nm.setValues({
    color: m.color, map: m.map, gradientMap: m.gradientMap, vertexColors: m.vertexColors, side: m.side,
    transparent: m.transparent, opacity: m.opacity, alphaTest: m.alphaTest, alphaMap: m.alphaMap,
    depthWrite: m.depthWrite, depthTest: m.depthTest, blending: m.blending, fog: m.fog,
  })
  nm.colorNode = corPintada(W, m.userData.texPintada)
  nm.setupLightingModel = () => new ModeloArcane()
  nm.name = m.name
  return nm
}
