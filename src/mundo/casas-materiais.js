// Os materiais das casas de 1932 (reboco, peças, telhas e o interior aceso).
//
// Ficam num arquivo só porque são o programa do shader da casa: o reboco calcula o salitre e a
// cal caída pela luz recebida (src/materiais.js), a telha canal pinta a capa clara e o canal
// escuro pela normal da água. O mesmo código roda no GLSL (WebGL) e no TSL (WebGPU).

import * as THREE from 'three'
import { pintar, gradienteToon, texturizar } from '../materiais.js'
import { globais } from '../globais.js'
import { CAL } from '../paleta.js'
import { GLSL_DESGASTE, envelhecerTsl } from './desgaste.js'
import { GLSL_CASCA_MARCO, ligarCascaGlsl, cascaMarcoTsl } from './desgaste-marcos.js'
import { ref } from '../render/gpu/comum.js'

// Material de reboco: cor por vértice, pincelada (pintar) e desgaste preso ao mundo:
// salitre subindo da base e cal descascada mostrando a taipa.
// marco = true: o reboco dos marcos de 1932, com a cal caída em metros e presa à forma (desgaste-marcos.js); a
// geometria traz aCaixa. As casas ficam com o programa de sempre.
function materialReboco(desgaste, marco = false) {
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradienteToon() })
  const chave = marco ? 'reboco-marcos' : 'reboco-casas'
  mat.onBeforeCompile = (sh) => {
    if (marco) ligarCascaGlsl(sh)
    sh.uniforms.uDesgQ = { value: desgaste }
    sh.uniforms.uTaipa = { value: new THREE.Color(CAL.taipa) }
    sh.uniforms.uArcDesgaste = globais.uArcDesgaste
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aChao; varying float vChaoQ; varying vec3 vMundoQ; varying vec3 vNormalQ;' + (marco ? '\nattribute vec4 aCaixa; varying vec3 vLocalQ; varying vec4 vCaixaQ;' : ''))
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_BATCHING
          // Fase 2: no lote das casas (BatchedMesh) a matriz da instância é a do lote
          vMundoQ = (modelMatrix * batchingMatrix * vec4(transformed, 1.0)).xyz;
          vNormalQ = normalize(mat3(batchingMatrix) * normal);
        #else
          vMundoQ = (modelMatrix * vec4(transformed, 1.0)).xyz;
          vNormalQ = normal;
        #endif
        vChaoQ = aChao;` + (marco ? '\nvLocalQ = transformed; vCaixaQ = aCaixa;' : ''))
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vChaoQ; varying vec3 vMundoQ; varying vec3 vNormalQ; uniform float uDesgQ; uniform vec3 uTaipa; uniform float uArcDesgaste;
        float hashQ(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
        float ruidoQ(vec2 p) {
          vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hashQ(vec3(i, 1.0)), hashQ(vec3(i + vec2(1, 0), 1.0)), f.x), mix(hashQ(vec3(i + vec2(0, 1), 1.0)), hashQ(vec3(i + vec2(1, 1), 1.0)), f.x), f.y);
        }
        ${marco ? 'varying vec3 vLocalQ; varying vec4 vCaixaQ;' + GLSL_CASCA_MARCO : ''}
        ${GLSL_DESGASTE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        if (abs(vNormalQ.y) < 0.5) {
          float hq = vMundoQ.y - vChaoQ;
          float uq = vMundoQ.x + vMundoQ.z;
          // pinceladas de caiação: faixas largas da broxa, em várias direções por demão
          float broxa = ruidoQ(vec2(uq * 0.9 + hq * 0.35, hq * 5.5)) * 0.6 + ruidoQ(vec2(uq * 4.0, hq * 1.2 - uq * 0.6)) * 0.4;
          diffuseColor.rgb *= 0.95 + 0.1 * broxa;
          // degradê de pintura: mais clara e quente em cima, mais fria e escura embaixo
          diffuseColor.rgb *= mix(vec3(0.9, 0.9, 0.95), vec3(1.04, 1.02, 0.97), smoothstep(0.0, 7.0, hq));
          // salitre: mancha esverdeada subindo da calçada, borda irregular
          float alt = 0.6 + 0.9 * ruidoQ(vec2(uq * 0.5, 0.0));
          diffuseColor.rgb *= mix(vec3(0.76, 0.78, 0.7), vec3(1.0), smoothstep(alt * 0.5, alt, hq));
          // cal descascada: placas de taipa, mais embaixo
          float n = ruidoQ(vec2(uq * 0.22, hq * 0.3)) * 0.65 + ruidoQ(vec2(uq * 1.6, hq * 1.9)) * 0.35;
          float lim = mix(0.84, 0.7, uDesgQ) + 0.2 * smoothstep(0.3, 3.5, hq);
          // (a casca miúda de antes dá lugar à grande de desgaste.js quando arcDesgaste sobe)
          float casca = smoothstep(lim, lim + 0.015, n) * (1.0 - uArcDesgaste);
          // dentro: taipa com fiadas de tijolo e manchas; borda: o reboco grosso, claro em cima e com sombra embaixo
          float fiada = smoothstep(0.82, 0.9, fract(hq * 6.5)) * 0.25;
          vec3 miolo = uTaipa * (0.88 + 0.2 * ruidoQ(vec2(uq * 5.0, hq * 5.0))) * (1.0 - fiada);
          float aro = smoothstep(lim - 0.035, lim - 0.005, n) * (1.0 - casca);
          float ny = ruidoQ(vec2(uq * 0.22, (hq + 0.06) * 0.3)) * 0.65 + ruidoQ(vec2(uq * 1.6, (hq + 0.06) * 1.9)) * 0.35;
          float sombraAro = casca * (1.0 - smoothstep(lim, lim + 0.015, ny));
          diffuseColor.rgb = mix(diffuseColor.rgb, miolo, casca);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.08 + 0.03, aro);
          diffuseColor.rgb *= 1.0 - 0.35 * sombraAro;
          // escorrido vertical de chuva
          diffuseColor.rgb *= 1.0 - 0.07 * smoothstep(0.6, 0.9, ruidoQ(vec2(uq * 3.0, hq * 0.25)));
          // reboco envelhecido que se lê de longe (desgaste.js)
          float cascaE;
          diffuseColor.rgb = envelhecer(diffuseColor.rgb, hq, uq, uDesgQ, uArcDesgaste, uTaipa, cascaE);
        }`)
  }
  mat.customProgramCacheKey = () => chave
  mat.userData.tsl = rebocoTsl(desgaste, marco)
  return texturizar(pintar(mat, chave), { topo: 'cal', lado: 'cal', tam: 2.5, contraste: 2.5 }) // reboco caiado pintado (visual Arcane)
}

// Reboco e telhas em TSL, para o modo webgpu (motor F2, KAN-68): as mesmas contas, com a posição no mundo
// tirada como no GLSL (modelMatrix * posição crua, sem a matriz da cópia)
function rebocoTsl(desgaste, marco = false) {
  let V = null
  const vars = (W) => V || (V = { mundo: W.varyingProperty('vec3', 'vMundoQ'), normal: W.varyingProperty('vec3', 'vNormalQ'), chao: W.varyingProperty('float', 'vChaoQ'),
    ...(marco ? { local: W.varyingProperty('vec3', 'vLocalQ'), caixa: W.varyingProperty('vec4', 'vCaixaQ') } : {}) })
  const uTaipa = { value: new THREE.Color(CAL.taipa) }
  return {
    nome: 'reboco',
    posicao({ W }) {
      const v = vars(W)
      v.mundo.assign(W.modelWorldMatrix.mul(W.vec4(W.positionLocal, 1.0)).xyz)
      v.normal.assign(W.attribute('normal', 'vec3'))
      v.chao.assign(W.attribute('aChao', 'float'))
      if (marco) { v.local.assign(W.positionLocal); v.caixa.assign(W.attribute('aCaixa', 'vec4')) }
      return W.positionLocal
    },
    // peças do kit na three-virtual-geometry (KAN-73): posição e normal já no mundo; o chão da casa ainda não vai
    // com a peça (a vg não leva atributo próprio por cópia): salitre e degradê contam a partir de y = 0 (no jogo, a
    // altura do terreno sob a casa; M5)
    posicaoVg({ W, mundo, normalMundo }) {
      const v = vars(W)
      v.mundo.assign(mundo)
      v.normal.assign(normalMundo)
      v.chao.assign(W.float(0))
    },
    cor({ W }, rgb0) {
      const { Fn, vec2, vec3, float, abs, floor, fract, sin, dot, mix, smoothstep, If } = W
      const v = vars(W)
      const hashQ = (p) => fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))).mul(43758.5453))
      const ruidoQ = (p) => {
        const i = floor(p)
        const f0 = fract(p)
        const f = f0.mul(f0).mul(float(3.0).sub(f0.mul(2.0)))
        return mix(mix(hashQ(vec3(i, 1.0)), hashQ(vec3(i.add(vec2(1, 0)), 1.0)), f.x), mix(hashQ(vec3(i.add(vec2(0, 1)), 1.0)), hashQ(vec3(i.add(vec2(1, 1)), 1.0)), f.x), f.y)
      }
      const taipa = ref(uTaipa)
      return Fn(() => {
        const rgb = vec3(rgb0).toVar()
        If(abs(v.normal.y).lessThan(0.5), () => {
          const hq = v.mundo.y.sub(v.chao)
          const uq = v.mundo.x.add(v.mundo.z)
          // pinceladas de caiação: faixas largas da broxa
          const broxa = ruidoQ(vec2(uq.mul(0.9).add(hq.mul(0.35)), hq.mul(5.5))).mul(0.6).add(ruidoQ(vec2(uq.mul(4.0), hq.mul(1.2).sub(uq.mul(0.6)))).mul(0.4))
          rgb.mulAssign(broxa.mul(0.1).add(0.95))
          rgb.mulAssign(mix(vec3(0.9, 0.9, 0.95), vec3(1.04, 1.02, 0.97), smoothstep(0.0, 7.0, hq)))
          // salitre
          const alt = ruidoQ(vec2(uq.mul(0.5), 0.0)).mul(0.9).add(0.6)
          rgb.mulAssign(mix(vec3(0.76, 0.78, 0.7), vec3(1.0), smoothstep(alt.mul(0.5), alt, hq)))
          // cal descascada
          const n = ruidoQ(vec2(uq.mul(0.22), hq.mul(0.3))).mul(0.65).add(ruidoQ(vec2(uq.mul(1.6), hq.mul(1.9))).mul(0.35))
          const lim = float(mix(0.84, 0.7, desgaste)).add(smoothstep(0.3, 3.5, hq).mul(0.2))
          const casca = smoothstep(lim, lim.add(0.015), n).mul(float(1.0).sub(ref(globais.uArcDesgaste)))
          const fiada = smoothstep(0.82, 0.9, fract(hq.mul(6.5))).mul(0.25)
          const miolo = taipa.mul(ruidoQ(vec2(uq.mul(5.0), hq.mul(5.0))).mul(0.2).add(0.88)).mul(float(1.0).sub(fiada))
          const aro = smoothstep(lim.sub(0.035), lim.sub(0.005), n).mul(float(1.0).sub(casca))
          const hy = hq.add(0.06)
          const ny = ruidoQ(vec2(uq.mul(0.22), hy.mul(0.3))).mul(0.65).add(ruidoQ(vec2(uq.mul(1.6), hy.mul(1.9))).mul(0.35))
          const sombraAro = casca.mul(float(1.0).sub(smoothstep(lim, lim.add(0.015), ny)))
          rgb.assign(mix(rgb, miolo, casca))
          rgb.assign(mix(rgb, rgb.mul(1.08).add(0.03), aro))
          rgb.mulAssign(float(1.0).sub(sombraAro.mul(0.35)))
          // escorrido vertical de chuva
          rgb.mulAssign(float(1.0).sub(ruidoQ(vec2(uq.mul(3.0), hq.mul(0.25))).mul(0.07)))
          // reboco envelhecido que se lê de longe (desgaste.js)
          const cascaM = marco ? cascaMarcoTsl(W, ruidoQ, v, hq) : null
          rgb.assign(envelhecerTsl(W, ruidoQ, rgb, hq, uq, float(desgaste), ref(globais.uArcDesgaste), taipa, cascaM, cascaM ? W.materialColor : null).rgb)
        })
        return rgb
      })()
    },
  }
}

function telhasTsl() {
  let V = null
  const vars = (W) => V || (V = { mundo: W.varyingProperty('vec3', 'vMundoT'), norm: W.varyingProperty('vec3', 'vNormT') })
  return {
    nome: 'telhas',
    posicao({ W }) {
      const { mat3, normalize, modelWorldMatrix, attribute, vec4, positionLocal } = W
      const v = vars(W)
      const m = modelWorldMatrix
      v.mundo.assign(m.mul(vec4(positionLocal, 1.0)).xyz)
      v.norm.assign(normalize(mat3(m.element(0).xyz, m.element(1).xyz, m.element(2).xyz).mul(attribute('normal', 'vec3'))))
      return positionLocal
    },
    posicaoVg({ W, mundo, normalMundo }) {
      const v = vars(W)
      v.mundo.assign(mundo)
      v.norm.assign(normalMundo)
    },
    cor({ W }, rgb) {
      const { vec2, vec3, float, floor, fract, sin, dot, normalize, mix, smoothstep, step } = W
      const hashT = (p) => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453))
      const v = vars(W)
      const norm = v.norm
      const desce = normalize(norm.xz.add(vec2(1e-4)))
      const lado = vec2(desce.y.negate(), desce.x)
      const u = dot(v.mundo.xz, lado).div(0.23)
      const vv = dot(v.mundo.xz, desce).div(0.42).add(v.mundo.y.mul(0.6))
      const coluna = floor(u)
      const capa = coluna.sub(floor(coluna.div(2.0)).mul(2.0)) // mod do GLSL
      const fu = fract(u)
      const curva = sin(fu.mul(3.14159))
      const tom = hashT(vec2(coluna, floor(vv.add(capa.mul(0.5))))).mul(0.2).add(0.9)
      const t0 = rgb.mul(tom)
      const t1 = t0.mul(mix(curva.mul(0.18).add(0.7), curva.mul(0.22).add(0.9), capa))
      const t2 = t1.mul(float(1.0).sub(smoothstep(0.82, 0.98, fract(vv.add(capa.mul(0.5)))).mul(0.28)))
      const limo = hashT(floor(v.mundo.xz.mul(0.7))).mul(smoothstep(0.4, 0.0, norm.y.sub(0.75)))
      const t = mix(t2, t2.mul(vec3(0.72, 0.74, 0.62)), limo.mul(0.35))
      return mix(rgb, t, step(0.35, norm.y))
    },
  }
}

// casario: itens do Lote 'casario'; morro: itens do Lote 'favela' (variante simples)
// Telha canal: colunas de capa (clara, abaulada) e canal (escuro), fiadas a cada ~40 cm, cada telha
// com seu tom, sujeira e limo mais embaixo. Direção tirada da própria inclinação de cada água.
function materialTelhas() {
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradienteToon(), side: THREE.DoubleSide })
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMundoT; varying vec3 vNormT;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMundoT = (modelMatrix * vec4(transformed, 1.0)).xyz; vNormT = normalize(mat3(modelMatrix) * normal);')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vMundoT; varying vec3 vNormT;
        float hashT(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 desce = normalize(vNormT.xz + vec2(1e-4));
        vec2 lado = vec2(-desce.y, desce.x);
        float u = dot(vMundoT.xz, lado) / 0.23;
        float v = dot(vMundoT.xz, desce) / 0.42 + vMundoT.y * 0.6;
        float coluna = floor(u);
        float capa = mod(coluna, 2.0);
        float fu = fract(u);
        float curva = sin(fu * 3.14159);
        float tom = 0.9 + 0.2 * hashT(vec2(coluna, floor(v + capa * 0.5)));
        vec3 t = diffuseColor.rgb * tom;
        t *= mix(0.7 + 0.18 * curva, 0.9 + 0.22 * curva, capa); // canal escuro, capa clara e abaulada
        t *= 1.0 - 0.28 * smoothstep(0.82, 0.98, fract(v + capa * 0.5)); // sombra da telha de cima
        float limo = hashT(floor(vMundoT.xz * 0.7)) * smoothstep(0.4, 0.0, vNormT.y - 0.75);
        t = mix(t, t * vec3(0.72, 0.74, 0.62), limo * 0.35);
        diffuseColor.rgb = mix(diffuseColor.rgb, t, step(0.35, vNormT.y));`)
  }
  mat.customProgramCacheKey = () => 'telhas-1932'
  mat.userData.tsl = telhasTsl()
  return texturizar(pintar(mat, 'telhas-1932'), { topo: 'telha', lado: 'telha', tam: 1.5 }) // telha canal pintada (visual Arcane)
}

// o reboco dos marcos de 1932 (obra1932.js): o das casas com a cal caída medida em metros (desgaste-marcos.js)
export function materialRebocoMarco(desgaste) { return materialReboco(desgaste, true) }

// os materiais das casas (o kit de 1932 usa os mesmos, KAN-73)
export function materiaisDasCasas() {
  return {
    reboco: materialReboco(0.4),
    rebocoMorro: materialReboco(0.85),
    pecas: texturizar(pintar(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradienteToon() }), 'toon-pintado'), { topo: 'madeira', lado: 'madeira', tam: 1 }), // portas, janelas, beirais
    telhas: materialTelhas(),
  }
}
