// O shader do céu (GLSL e TSL), separado de ceu.js (luz-arcane, item 5): ceu.js cuida da paleta, do sol e das
// luzes; aqui mora a pintura do céu. No visual Arcane (alvo docs/referencias/forte-1932-joabe):
// - degradê de três paradas (horizonte claro, meio azul esverdeado, alto petróleo);
// - pinceladas: largas na horizontal e riscos diagonais claros, como o pincel seco da referência, e grão;
// - nuvens em massas: bancos de cúmulos rente ao horizonte, topo claro do lado do sol e barriga azulada.
// As contas do GLSL e do TSL são as mesmas, com os mesmos nomes.

import * as THREE from 'three'
import { SAIDA_LUZ } from '../materiais.js'

export const vertCeu = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`

export const fragCeu = /* glsl */ `
uniform vec3 uTopo; uniform vec3 uHor; uniform vec3 uMeio; uniform vec3 uSolDir; uniform vec3 uSolCor;
uniform float uNoite; uniform float uTempo; uniform float uArcane; uniform float uArcCeu; uniform float uArcPintado; uniform float uArcCeuPincel; uniform float uCeuRampa; uniform float uAzul; uniform vec2 uCumulos;
varying vec3 vDir;
${SAIDA_LUZ}
float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float h2(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1, 0)), u.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), u.x), u.y);
}
// CÚMULOS DO ALÍSIO (meio-dia de agosto, revisão do orquestrador 21/10/2026): o banco e as massas viravam uma
// mancha branca chata e borrada sobre o mar. Nos quadros de conceito o cúmulo é pequeno, redondo, separado, de borda
// nítida, topo claro e base reta azul-acinzentada. Aqui: uma faixa de células em volta do horizonte (az); cada célula
// pode ter uma nuvem de quatro bolhas sobre uma base reta. Devolve (cobertura, luz da bolha, altura relativa, base).
vec4 cumulo(float az, float el) {
  float N = 46.0;
  float tau = 6.2831853;
  float cel = mod(az, tau) / tau * N;
  float ic = floor(cel);
  float melhor = 1e3; float luzM = 0.0; float altM = 0.0; float baseM = 0.0;
  for (int k = -1; k <= 1; k++) {
    float c = ic + float(k);
    float ch = mod(c, N);
    float tem = step(h2(vec2(ch, 3.1)), uCumulos.x);
    float larg = (0.35 + 0.5 * h2(vec2(ch, 7.7))) / N * tau * uCumulos.y;
    float cx = (c + 0.5 + (h2(vec2(ch, 11.3)) - 0.5) * 0.4) / N * tau;
    float base = 0.025 + 0.07 * h2(vec2(ch, 5.9));
    float azL = mod(az, tau);
    for (int i = 0; i < 4; i++) {
      float fi = float(i) / 3.0 - 0.5;
      float bx = cx + fi * larg * 0.8 + (h2(vec2(ch, 13.0 + float(i))) - 0.5) * larg * 0.15;
      float br = larg * (0.2 + 0.16 * h2(vec2(ch, 17.0 + float(i)))) * (1.0 - abs(fi) * 0.7);
      vec2 dd = vec2(azL - bx, el - (base + br * 0.4));
      float dist = max(length(dd) - br, base - el);
      dist = mix(1e3, dist, tem);
      if (dist < melhor) { melhor = dist; luzM = dd.y / max(br, 1e-4); altM = clamp((el - base) / max(br * 1.4, 1e-4), 0.0, 1.0); baseM = base; }
    }
  }
  return vec4(1.0 - smoothstep(-0.0012, 0.0012, melhor), luzM, altM, baseM);
}

void main() {
  vec3 d = normalize(vDir);
  float y = max(d.y, 0.0);
  vec3 cor = mix(uHor, uTopo, pow(y, 0.55));
  if (uArcane > 0.5) {
    // CÉU PINTADO (visual Arcane): o degradê vira pinceladas longas e horizontais, como num fundo
    // pintado; um brilho largo e quente em volta do sol; nuvens de pincel baixas, com o lado do sol
    // quente e a barriga fria. Azimute e altura como "tela", deriva lenta com o tempo.
    float az = atan(d.z, d.x) + uTempo * 0.002;
    // pinceladas largas (poucas por tela) e outras finas por cima, como pincel chato e pincel de detalhe
    float yP = pow(y, 0.6);
    float largo = vn(vec2(az * 1.1, yP * 9.0));
    float fino = vn(vec2(az * 4.5, yP * 38.0) + 5.0);
    float traco = 0.7 * largo + 0.3 * fino;
    // GRADIENTE: o azul desce mais perto do horizonte (expoente 0,42; o de antes era 0,55) e só uma
    // faixa fina rente ao chão fica quente. Com 1,05 (primeira tentativa) o céu de câmera baixa
    // ficava quase todo cor de horizonte e o meio-dia virava branco.
    float expoente = mix(0.55, 0.42, uArcPintado);
    // (3b: no céu pintado a curva chega ao alto aos ~27 graus, como na referência; antes só no zênite)
    // (sertão, 21/10: o azul fundo só no alto; uCeuRampa = altura em que ele chega, cfg.estilo.arcCeuRampa)
    float tBase = mix(pow(y, expoente), pow(smoothstep(0.0, uCeuRampa, y), 0.6 + uCeuRampa * 0.6), uArcPintado);
    float t = clamp(tBase + (traco - 0.5) * mix(0.42, 0.16, uArcPintado) * uArcCeu, 0.0, 1.0);
    // três paradas (3b): horizonte, meio claro e alto. Duas paradas misturavam o pêssego do horizonte com o
    // petróleo do alto e davam um cinza barrento no meio; o céu da referência passa por um azul claro
    cor = mix(mix(uHor, uMeio, clamp(t * 2.0, 0.0, 1.0)), uTopo, clamp(t * 2.0 - 1.0, 0.0, 1.0));
    // uma faixa quente rente ao horizonte: o maresia de Fortaleza
    float baixo = (1.0 - smoothstep(0.0, 0.08, y)) * uArcPintado;
    // (meio-dia de agosto, uAzul: o céu limpo da estação seca não tem essa faixa)
    cor = mix(cor, mix(uHor, uSolCor, 0.3), baixo * 0.45 * (1.0 - uNoite) * (1.0 - uAzul));
    // cada pincelada puxa um pouco para o quente ou para o frio (a tinta não é uniforme)
    float tempT = (vn(vec2(az * 0.8, yP * 6.0) + 21.0) - 0.5) * 0.16 * uArcCeu;
    cor *= vec3(1.0 + tempT, 1.0, 1.0 - tempT);
    // RISCOS DE PINCEL SECO (item 5): pinceladas diagonais longas, umas mais claras, outras mais escuras, e um
    // grão fino preso ao céu (anda com o céu quando a câmera gira, como tinta na tela)
    float diagU = az * 2.2 + yP * 7.0;
    float diagV = yP * 7.0 - az * 2.2;
    float risco = vn(vec2(diagU * 0.7, diagV * 11.0) + 51.0);
    float riscoClaro = smoothstep(0.72, 0.86, vn(vec2(diagU * 1.3, diagV * 26.0) + 61.0));
    // (meio-dia de agosto: o céu limpo tem bem menos risco de pincel)
    float limpo = 1.0 - 0.65 * uAzul;
    cor *= 1.0 + (risco - 0.5) * 0.14 * uArcCeuPincel * limpo;
    cor = mix(cor, mix(uMeio, vec3(1.0), 0.3), riscoClaro * 0.16 * uArcCeuPincel * (1.0 - uNoite) * smoothstep(0.05, 0.3, y) * limpo);
    cor *= 1.0 + (hash(floor(d * 700.0)) - 0.5) * 0.06 * uArcCeuPincel;
    float sA = dot(d, normalize(uSolDir));
    // o quente em volta do sol: no céu pintado só perto dele (60 graus de laranja sujavam o céu todo)
    float lavaSol = mix(smoothstep(0.55, 1.0, sA) * 0.38, smoothstep(0.78, 1.0, sA) * 0.28, uArcPintado);
    cor = mix(cor, uSolCor * 1.05, lavaSol * (1.0 - uNoite) * uArcCeu * (1.0 - 0.6 * uAzul));
    // NUVENS EM MASSAS: manchas grandes de borda pintada. O ruído fino de antes lia como
    // granulado no céu, não como nuvem.
    float faixaN = smoothstep(0.02, 0.12, y) * (1.0 - smoothstep(0.32, 0.55, y));
    float massa = vn(vec2(az * 0.62, y * 3.4) + 7.0);
    float detalhe = vn(vec2(az * 2.6, y * 13.0) + 17.0);
    float massaV = massa * 0.78 + detalhe * 0.22;
    float bordaPintada = (detalhe - 0.5) * 0.2;
    // (3b: limiar 0,7 e só até ~15 graus: com 0,44 metade do céu baixo virava um lençol bege; sem nuvem o
    // gradiente já é o petróleo da referência)
    float nuvem = smoothstep(0.7, 0.8, massaV + bordaPintada) * faixaN * (1.0 - smoothstep(0.12, 0.26, y)) * uArcCeu * uArcPintado;
    // a nuvem fina de antes fica por baixo, na força da antiga, enquanto o novo não entra
    float nN = 0.65 * vn(vec2(az * 1.6, y * 9.0) + 11.0) + 0.35 * vn(vec2(az * 5.0, y * 30.0) + 3.0);
    float nuvemFina = smoothstep(0.58, 0.7, nN) * faixaN * uArcCeu * (1.0 - uArcPintado);
    nuvem = max(nuvem, nuvemFina);
    float ladoSol = 0.5 + 0.5 * dot(normalize(vec2(d.x, d.z)), normalize(vec2(uSolDir.x, uSolDir.z)));
    float topoN = smoothstep(0.5, 0.8, massaV); // a parte de cima pega mais luz
    // nuvem pintada: luz branca-creme do sol, sombra azul acinzentada do céu (não mais pêssego com pêssego)
    vec3 corNuvemLuz = mix(mix(uHor, uSolCor, 0.55) * 1.12, mix(vec3(1.0, 0.96, 0.88), uSolCor, 0.3) * 1.05, uArcPintado);
    vec3 corNuvemSombra = mix(mix(uTopo, uHor, 0.55) * 0.92, mix(uMeio, uTopo, 0.35) * 0.95, uArcPintado);
    vec3 corNuvem = mix(corNuvemSombra, corNuvemLuz, clamp(ladoSol * 0.6 + topoN * 0.5, 0.0, 1.0));
    // (meio-dia de agosto: as massas saem, entram os cúmulos redondos logo abaixo)
    cor = mix(cor, mix(corNuvem, uTopo * 0.6, uNoite * 0.7), nuvem * 0.85 * (1.0 - uAzul));
    // BANCO DE CÚMULOS no horizonte (item 5): massas que sobem de uma base reta, em grupos; topo claro e quente
    // do lado do sol, barriga azul acinzentada, borda recortada pelo pincel
    float grupo = smoothstep(0.5, 0.7, vn(vec2(az * 0.9, 3.0)));
    // silhueta em calombos: uma onda larga, calombos médios e pequenos (o cúmulo cresce em bolhas)
    float altB = 0.035 + 0.11 * pow(vn(vec2(az * 3.1, 7.0)), 1.6) * grupo + 0.045 * vn(vec2(az * 9.0, 9.0)) * grupo + 0.022 * vn(vec2(az * 24.0, 4.0)) * grupo;
    float bordaB = (vn(vec2(az * 14.0, y * 60.0) + 71.0) - 0.5) * 0.02;
    float banco = (1.0 - smoothstep(altB - 0.006, altB + 0.006, y + bordaB)) * smoothstep(0.008, 0.03, y) * step(0.045, altB);
    float alturaRel = clamp((y - 0.01) / max(altB - 0.01, 0.01), 0.0, 1.0);
    float caroco = vn(vec2(az * 9.0, y * 45.0) + 81.0);
    float luzB = clamp(alturaRel * 0.8 + (caroco - 0.5) * 0.7 + (ladoSol - 0.5) * 0.6, 0.0, 1.0);
    vec3 corBanco = mix(mix(uMeio, uTopo, 0.3) * 0.92, mix(vec3(1.0, 0.95, 0.85), uSolCor, 0.35) * 1.08, smoothstep(0.35, 0.65, luzB));
    cor = mix(cor, mix(corBanco, uTopo * 0.75, uNoite * 0.9), banco * uArcCeuPincel * uArcCeu * (1.0 - uAzul));
    // CÚMULOS DO ALÍSIO: topo claro do lado do sol, base reta azul-acinzentada, os do fundo (base baixa) mais lavados
    if (uAzul > 0.001) {
      vec4 cu = cumulo(az, y);
      float luzC = smoothstep(0.05, 0.85, cu.y * 0.55 + cu.z * 0.5 + (ladoSol - 0.5) * 0.35);
      vec3 sombraC = mix(vec3(0.6, 0.66, 0.77), uMeio, 0.35);
      vec3 claroC = mix(vec3(1.0, 0.985, 0.95), uSolCor, 0.12);
      vec3 corC = mix(sombraC, claroC, luzC);
      corC = mix(corC, sombraC * 0.92, (1.0 - smoothstep(0.0, 0.12, cu.z)) * 0.5); // a barriga reta, mais escura
      corC = mix(corC, uHor, (1.0 - smoothstep(0.03, 0.09, cu.w)) * 0.3);
      cor = mix(cor, corC, cu.x * uAzul * uArcCeu);
    }
    // O SOL PINTADO: o disco é pequeno e duro, o halo é a tinta quente em volta dele.
    float haloPintado = smoothstep(0.85, 0.999, sA) * 0.42 * (1.0 - uNoite) * uArcCeu * uArcPintado;
    cor = mix(cor, uSolCor * 1.2, haloPintado);
  } else {
    // faixas de cor chapadas, como céu pintado
    float faixas = floor(pow(y, 0.55) * 7.0) / 7.0;
    cor = mix(cor, mix(uHor, uTopo, faixas), 0.35);
  }
  // sol
  float s = dot(d, normalize(uSolDir));
  float disco = smoothstep(0.9975, 0.9985, s);
  float halo = smoothstep(0.96, 0.999, s) * 0.35;
  cor += (uSolCor * 1.6) * disco * (1.0 - uNoite) + uSolCor * halo * (1.0 - uNoite);
  // lua (do lado oposto) e estrelas
  float l = dot(d, normalize(-uSolDir + vec3(0.0, 0.0, -0.3)));
  cor += vec3(0.95, 0.92, 1.0) * smoothstep(0.9985, 0.9992, l) * uNoite;
  vec3 g = floor(d * 220.0);
  float estrela = step(0.9965, hash(g)) * smoothstep(0.05, 0.3, d.y);
  float pisca = 0.6 + 0.4 * sin(uTempo * 3.0 + hash(g + 3.0) * 30.0);
  cor += vec3(1.0, 0.95, 0.85) * estrela * pisca * uNoite;
  // abaixo do horizonte: cor do horizonte (o mar cobre)
  if (d.y < 0.0) cor = uHor;
  gl_FragColor = vec4(cor, 1.0);
  gLuz = vec4(1.0, 0.0, 0.0, 1.0);
}`

// O céu em TSL, para o modo webgpu (motor F2, KAN-68): as mesmas contas de vertCeu e fragCeu
export function ceuTsl({ W, ref }, u) {
  const { Fn, vec2, vec3, vec4, float, max, pow, mix, clamp, dot, normalize, smoothstep, sin, floor, fract, step, atan2,
    positionLocal, cameraProjectionMatrix, modelViewMatrix, varying } = W
  const U = {}
  for (const k in u) U[k] = ref(u[k])
  const hash = (p) => fract(sin(dot(p, vec3(127.1, 311.7, 74.7))).mul(43758.5453))
  const h2 = Fn(([p0]) => {
    const p = fract(p0.mul(vec2(123.34, 456.21))).toVar()
    p.addAssign(dot(p, p.add(45.32)))
    return fract(p.x.mul(p.y))
  }).setLayout({ name: 'ceuH2', type: 'float', inputs: [{ name: 'p', type: 'vec2' }] })
  const vn = Fn(([p]) => {
    const i = floor(p), f = fract(p)
    const uu = f.mul(f).mul(float(3.0).sub(f.mul(2.0)))
    return mix(mix(h2(i), h2(i.add(vec2(1, 0))), uu.x), mix(h2(i.add(vec2(0, 1))), h2(i.add(vec2(1, 1))), uu.x), uu.y)
  }).setLayout({ name: 'ceuVn', type: 'float', inputs: [{ name: 'p', type: 'vec2' }] })
  // CÚMULOS DO ALÍSIO: as mesmas contas de cumulo() do GLSL (laços desenrolados aqui)
  const cumulo = (az, el) => {
    const N = 46.0, tau = 6.2831853
    const modP = (x, y) => x.sub(floor(x.div(y)).mul(y)) // o mod do GLSL (o % do WGSL dá negativo para x negativo)
    const azL = modP(az, tau)
    const ic = floor(azL.div(tau).mul(N))
    const melhor = float(1e3).toVar(), luzM = float(0.0).toVar(), altM = float(0.0).toVar(), baseM = float(0.0).toVar()
    for (let k = -1; k <= 1; k++) {
      const c = ic.add(k)
      const ch = modP(c, N)
      const tem = step(h2(vec2(ch, 3.1)), U.uCumulos.x)
      const larg = h2(vec2(ch, 7.7)).mul(0.5).add(0.35).div(N).mul(tau).mul(U.uCumulos.y)
      const cx = c.add(0.5).add(h2(vec2(ch, 11.3)).sub(0.5).mul(0.4)).div(N).mul(tau)
      const base = h2(vec2(ch, 5.9)).mul(0.07).add(0.025)
      for (let i = 0; i < 4; i++) {
        const fi = i / 3.0 - 0.5
        const bx = cx.add(larg.mul(fi * 0.8)).add(h2(vec2(ch, 13.0 + i)).sub(0.5).mul(larg).mul(0.15))
        const br = larg.mul(h2(vec2(ch, 17.0 + i)).mul(0.16).add(0.2)).mul(1.0 - Math.abs(fi) * 0.7)
        const dd = vec2(azL.sub(bx), el.sub(base.add(br.mul(0.4))))
        const dist = mix(float(1e3), max(W.length(dd).sub(br), base.sub(el)), tem)
        W.If(dist.lessThan(melhor), () => {
          melhor.assign(dist)
          luzM.assign(dd.y.div(max(br, 1e-4)))
          altM.assign(clamp(el.sub(base).div(max(br.mul(1.4), 1e-4)), 0.0, 1.0))
          baseM.assign(base)
        })
      }
    }
    return vec4(float(1.0).sub(smoothstep(-0.0012, 0.0012, melhor)), luzM, altM, baseM)
  }
  const vDir = varying(normalize(positionLocal))
  const m = new W.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, fog: false })
  // gl_Position = p.xyww: o céu fica no fundo da profundidade
  m.vertexNode = Fn(() => {
    const p = cameraProjectionMatrix.mul(modelViewMatrix).mul(vec4(positionLocal, 1.0))
    return vec4(p.x, p.y, p.w, p.w)
  })()
  m.colorNode = Fn(() => {
    const d = normalize(vDir)
    const y = max(d.y, 0.0)
    const cor = mix(U.uHor, U.uTopo, pow(y, 0.55)).toVar()
    W.If(U.uArcane.greaterThan(0.5), () => {
      // CÉU PINTADO (visual Arcane)
      const az = atan2(d.z, d.x).add(U.uTempo.mul(0.002))
      const yP = pow(y, 0.6)
      const largo = vn(vec2(az.mul(1.1), yP.mul(9.0)))
      const fino = vn(vec2(az.mul(4.5), yP.mul(38.0)).add(5.0))
      const traco = largo.mul(0.7).add(fino.mul(0.3))
      // GRADIENTE: o azul desce mais perto do horizonte; só uma faixa fina rente ao chão fica quente
      const expoente = mix(float(0.55), float(0.42), U.uArcPintado)
      // (sertão: o azul fundo só no alto; uCeuRampa = altura em que ele chega)
      const tBase = mix(pow(y, expoente), pow(smoothstep(0.0, U.uCeuRampa, y), U.uCeuRampa.mul(0.6).add(0.6)), U.uArcPintado)
      const t = clamp(tBase.add(traco.sub(0.5).mul(mix(float(0.42), float(0.16), U.uArcPintado)).mul(U.uArcCeu)), 0.0, 1.0)
      // três paradas (3b): horizonte, meio claro e alto (duas davam cinza barrento no meio)
      cor.assign(mix(mix(U.uHor, U.uMeio, clamp(t.mul(2.0), 0.0, 1.0)), U.uTopo, clamp(t.mul(2.0).sub(1.0), 0.0, 1.0)))
      // uma faixa quente rente ao horizonte: o maresia de Fortaleza
      const baixo = smoothstep(0.0, 0.08, y).oneMinus().mul(U.uArcPintado)
      // (meio-dia de agosto, uAzul: o céu limpo da estação seca não tem essa faixa)
      cor.assign(mix(cor, mix(U.uHor, U.uSolCor, 0.3), baixo.mul(0.45).mul(float(1.0).sub(U.uNoite)).mul(float(1.0).sub(U.uAzul))))
      const tempT = vn(vec2(az.mul(0.8), yP.mul(6.0)).add(21.0)).sub(0.5).mul(0.16).mul(U.uArcCeu)
      cor.mulAssign(vec3(float(1.0).add(tempT), 1.0, float(1.0).sub(tempT)))
      // RISCOS DE PINCEL SECO (item 5): pinceladas diagonais longas e grão fino preso ao céu
      const diagU = az.mul(2.2).add(yP.mul(7.0))
      const diagV = yP.mul(7.0).sub(az.mul(2.2))
      const risco = vn(vec2(diagU.mul(0.7), diagV.mul(11.0)).add(51.0))
      const riscoClaro = smoothstep(0.72, 0.86, vn(vec2(diagU.mul(1.3), diagV.mul(26.0)).add(61.0)))
      // (meio-dia de agosto: o céu limpo tem bem menos risco de pincel)
      const limpo = float(1.0).sub(U.uAzul.mul(0.65))
      cor.mulAssign(float(1.0).add(risco.sub(0.5).mul(0.14).mul(U.uArcCeuPincel).mul(limpo)))
      cor.assign(mix(cor, mix(U.uMeio, vec3(1.0), 0.3), riscoClaro.mul(0.16).mul(U.uArcCeuPincel).mul(float(1.0).sub(U.uNoite)).mul(smoothstep(0.05, 0.3, y)).mul(limpo)))
      cor.mulAssign(float(1.0).add(hash(floor(d.mul(700.0))).sub(0.5).mul(0.06).mul(U.uArcCeuPincel)))
      const sA = dot(d, normalize(U.uSolDir))
      // o quente em volta do sol: no céu pintado só perto dele
      const lavaSol = mix(smoothstep(0.55, 1.0, sA).mul(0.38), smoothstep(0.78, 1.0, sA).mul(0.28), U.uArcPintado)
      cor.assign(mix(cor, U.uSolCor.mul(1.05), lavaSol.mul(float(1.0).sub(U.uNoite)).mul(U.uArcCeu).mul(float(1.0).sub(U.uAzul.mul(0.6)))))
      // NUVENS EM MASSAS: manchas grandes de borda pintada (o ruído fino lia como granulado)
      const faixaN = smoothstep(0.02, 0.12, y).mul(float(1.0).sub(smoothstep(0.32, 0.55, y)))
      const massa = vn(vec2(az.mul(0.62), y.mul(3.4)).add(7.0))
      const detalhe = vn(vec2(az.mul(2.6), y.mul(13.0)).add(17.0))
      const massaV = massa.mul(0.78).add(detalhe.mul(0.22))
      const bordaPintada = detalhe.sub(0.5).mul(0.2)
      const nuvem = smoothstep(0.7, 0.8, massaV.add(bordaPintada)).mul(faixaN).mul(float(1.0).sub(smoothstep(0.12, 0.26, y))).mul(U.uArcCeu).mul(U.uArcPintado)
      // a nuvem fina de antes fica por baixo, na força da antiga, enquanto o novo não entra
      const nN = vn(vec2(az.mul(1.6), y.mul(9.0)).add(11.0)).mul(0.65).add(vn(vec2(az.mul(5.0), y.mul(30.0)).add(3.0)).mul(0.35))
      const nuvemFina = smoothstep(0.58, 0.7, nN).mul(faixaN).mul(U.uArcCeu).mul(float(1.0).sub(U.uArcPintado))
      const nuvemFinal = nuvem.max(nuvemFina)
      const ladoSol = dot(normalize(vec2(d.x, d.z)), normalize(vec2(U.uSolDir.x, U.uSolDir.z))).mul(0.5).add(0.5)
      const topoN = smoothstep(0.5, 0.8, massaV)
      // nuvem pintada: luz branca-creme do sol, sombra azul acinzentada do céu
      const corNuvemLuz = mix(mix(U.uHor, U.uSolCor, 0.55).mul(1.12), mix(vec3(1.0, 0.96, 0.88), U.uSolCor, 0.3).mul(1.05), U.uArcPintado)
      const corNuvemSombra = mix(mix(U.uTopo, U.uHor, 0.55).mul(0.92), mix(U.uMeio, U.uTopo, 0.35).mul(0.95), U.uArcPintado)
      const corNuvem = mix(corNuvemSombra, corNuvemLuz, clamp(ladoSol.mul(0.6).add(topoN.mul(0.5)), 0.0, 1.0))
      // (meio-dia de agosto: as massas saem, entram os cúmulos redondos logo abaixo)
      cor.assign(mix(cor, mix(corNuvem, U.uTopo.mul(0.6), U.uNoite.mul(0.7)), nuvemFinal.mul(0.85).mul(float(1.0).sub(U.uAzul))))
      // BANCO DE CÚMULOS no horizonte (item 5)
      const grupo = smoothstep(0.5, 0.7, vn(vec2(az.mul(0.9), 3.0)))
      // silhueta em calombos: onda larga, calombos médios e pequenos
      const altB = float(0.035).add(pow(vn(vec2(az.mul(3.1), 7.0)), 1.6).mul(0.11).mul(grupo)).add(vn(vec2(az.mul(9.0), 9.0)).mul(0.045).mul(grupo)).add(vn(vec2(az.mul(24.0), 4.0)).mul(0.022).mul(grupo))
      const bordaB = vn(vec2(az.mul(14.0), y.mul(60.0)).add(71.0)).sub(0.5).mul(0.02)
      const banco = float(1.0).sub(smoothstep(altB.sub(0.006), altB.add(0.006), y.add(bordaB))).mul(smoothstep(0.008, 0.03, y)).mul(step(0.045, altB))
      const alturaRel = clamp(y.sub(0.01).div(max(altB.sub(0.01), 0.01)), 0.0, 1.0)
      const caroco = vn(vec2(az.mul(9.0), y.mul(45.0)).add(81.0))
      const luzB = clamp(alturaRel.mul(0.8).add(caroco.sub(0.5).mul(0.7)).add(ladoSol.sub(0.5).mul(0.6)), 0.0, 1.0)
      const corBanco = mix(mix(U.uMeio, U.uTopo, 0.3).mul(0.92), mix(vec3(1.0, 0.95, 0.85), U.uSolCor, 0.35).mul(1.08), smoothstep(0.35, 0.65, luzB))
      cor.assign(mix(cor, mix(corBanco, U.uTopo.mul(0.75), U.uNoite.mul(0.9)), banco.mul(U.uArcCeuPincel).mul(U.uArcCeu).mul(float(1.0).sub(U.uAzul))))
      // CÚMULOS DO ALÍSIO: topo claro do lado do sol, base reta azul-acinzentada, os do fundo mais lavados
      W.If(U.uAzul.greaterThan(0.001), () => {
        const cu = cumulo(az, y)
        const luzC = smoothstep(0.05, 0.85, cu.y.mul(0.55).add(cu.z.mul(0.5)).add(ladoSol.sub(0.5).mul(0.35)))
        const sombraC = mix(vec3(0.6, 0.66, 0.77), U.uMeio, 0.35)
        const claroC = mix(vec3(1.0, 0.985, 0.95), U.uSolCor, 0.12)
        const corC = mix(sombraC, claroC, luzC).toVar()
        corC.assign(mix(corC, sombraC.mul(0.92), float(1.0).sub(smoothstep(0.0, 0.12, cu.z)).mul(0.5)))
        corC.assign(mix(corC, U.uHor, float(1.0).sub(smoothstep(0.03, 0.09, cu.w)).mul(0.3)))
        cor.assign(mix(cor, corC, cu.x.mul(U.uAzul).mul(U.uArcCeu)))
      })
      // O SOL PINTADO: o disco é pequeno e duro, o halo é a tinta quente em volta dele
      const haloPintado = smoothstep(0.85, 0.999, sA).mul(0.42).mul(float(1.0).sub(U.uNoite)).mul(U.uArcCeu).mul(U.uArcPintado)
      cor.assign(mix(cor, U.uSolCor.mul(1.2), haloPintado))
    }).Else(() => {
      const faixas = floor(pow(y, 0.55).mul(7.0)).div(7.0)
      cor.assign(mix(cor, mix(U.uHor, U.uTopo, faixas), 0.35))
    })
    // sol
    const s = dot(d, normalize(U.uSolDir))
    const disco = smoothstep(0.9975, 0.9985, s)
    const halo = smoothstep(0.96, 0.999, s).mul(0.35)
    const dia = float(1.0).sub(U.uNoite)
    cor.addAssign(U.uSolCor.mul(1.6).mul(disco).mul(dia).add(U.uSolCor.mul(halo).mul(dia)))
    // lua (do lado oposto) e estrelas
    const l = dot(d, normalize(U.uSolDir.negate().add(vec3(0.0, 0.0, -0.3))))
    cor.addAssign(vec3(0.95, 0.92, 1.0).mul(smoothstep(0.9985, 0.9992, l)).mul(U.uNoite))
    const g = floor(d.mul(220.0))
    const estrela = step(0.9965, hash(g)).mul(smoothstep(0.05, 0.3, d.y))
    const pisca = sin(U.uTempo.mul(3.0).add(hash(g.add(3.0)).mul(30.0))).mul(0.4).add(0.6)
    cor.addAssign(vec3(1.0, 0.95, 0.85).mul(estrela).mul(pisca).mul(U.uNoite))
    // abaixo do horizonte: cor do horizonte (o mar cobre)
    return d.y.lessThan(0.0).select(U.uHor, cor)
  })()
  m.mrtNode = W.mrt({ gLuz: vec4(1.0, 0.0, 0.0, 1.0) })
  return m
}
