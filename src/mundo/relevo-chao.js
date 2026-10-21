// O relevo pintado do chão (21/10/2026, pedido do Joabe: "as texturas do chão estão bem ruins").
//
// O chão é uma malha de 2 m: plana de perto. Aqui cada tipo de chão ganha uma altura fina, calculada no
// fragmento, que vira normal (pelas derivadas de tela) e muda a luz que chega. A geometria não se move: é o desenho
// da luz e da sombra que dá o volume, como no chão dos quadros de conceito (docs/referencias/conceito-sertao).
//   - areia: ondulação do vento leste (cristas no sentido norte-sul, encosta suave a barlavento e curta a
//     sotavento), riscos de vento e morrotes; perto da água a areia molhada é lisa e mais escura
//   - terra (rua e quintal): torrões e pedrisco; na rua, o sulco da roda com a borda levantada
//   - paralelepípedo: cada pedra com o topo abaulado e uma pequena inclinação própria, a junta funda
//   - terra rachada (o Campo do Urubu na seca de 1932): placas com a rachadura funda e a beira levantada
//   - chão de grama: calombos baixos
// Cada oitava some quando o pixel fica do tamanho dela (sem chiado de longe) e tudo some além de
// cfg.chao.relevoLonge. As mesmas contas em GLSL (WebGL) e em TSL (WebGPU), com os mesmos nomes.
//
// O peso de cada tipo vem por vértice (aSolo = areia, terra, rachada, grama), montado em terreno.js.
// A saída é o gradiente da altura (para a normal) e uma máscara de cor (+ pedra clara, - fresta escura).

import * as THREE from 'three'
import { ref } from '../render/gpu/comum.js'
import { globais } from '../globais.js'
import { uCalamento } from './calamento.js'
import { uRodeiro } from './rodeiro.js'

export const uRelevo = {
  uRelevoA: { value: new THREE.Vector4(1, 1, 1, 1) }, // geral, areia, terra, paralelepípedo
  uRelevoB: { value: new THREE.Vector4(1, 70, 0.8, 0.34) }, // terra rachada, distância em que some, cor, onda da areia (m)
}

// Com o sol a pino a luz quase não muda numa inclinação pequena e o chão sai liso; o pintor exagera o relevo ao
// meio-dia (cfg.chao.relevoMeioDia, pela altura do sol, que ceu.js põe em globais.uSolDir)
export function sincronizarRelevo(cfg) {
  const c = cfg?.chao
  if (!c) return
  const y = globais.uSolDir.value.y
  const t = Math.min(1, Math.max(0, (y - 0.6) / 0.35))
  const ganho = 1 + (c.relevoMeioDia ?? 0.8) * t * t * (3 - 2 * t)
  uRelevo.uRelevoA.value.set((c.relevo ?? 1) * ganho, c.relevoAreia ?? 1, c.relevoTerra ?? 1, c.relevoPedra ?? 1)
  // (a cor da fresta usa a mesma força: o ganho do meio-dia sai dela, só a luz é exagerada)
  uRelevo.uRelevoB.value.set(c.relevoRacha ?? 1, c.relevoLonge ?? 70, (c.relevoCor ?? 0.8) / ganho, c.ondaAreia ?? 0.34)
}


// ------------------------------------------------------------------------------------------------- GLSL
export const GLSL_RELEVO_UNIFORM = 'uniform vec4 uRelevoA; uniform vec4 uRelevoB;'

// As funções. Precisam de uBloco (calamento.js) quando há paralelepípedo; quem não tem passa piso 0.
export const GLSL_RELEVO_FUNCOES = /* glsl */ `
float rlH(vec2 p) { p = fract(p * vec2(233.34, 851.73)); p += dot(p, p + 23.45); return fract(p.x * p.y); }
vec2 rlH2(vec2 p) { float a = rlH(p); return vec2(a, rlH(p + a * 17.0 + 3.7)); }
float rlN(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(rlH(i), rlH(i + vec2(1.0, 0.0)), u.x), mix(rlH(i + vec2(0.0, 1.0)), rlH(i + vec2(1.0, 1.0)), u.x), u.y);
}
// a oitava de comprimento lam some quando o pixel (fw, em metros) chega a ~1/2 dela
float rlBanda(float fw, float lam) { return 1.0 - smoothstep(0.2, 0.55, fw / lam); }

// areia: ondulação do vento leste, riscos de vento e morrotes
vec2 rlAreia(vec2 p, float molhada, float fw, float lam) {
  float torto = rlN(p * 0.35) * 1.6 + rlN(p * 1.1 + 7.0) * 0.35;
  // a frente da onda desliza de um trecho para outro (soma na fase; dividir a coordenada do mundo por um
  // comprimento variável fazia anéis a 700 m da origem)
  float s = fract((p.x + torto + p.y * 0.18) / lam + rlN(p * 0.03 + 13.0) * 3.0);
  float tri = s < 0.68 ? s / 0.68 : (1.0 - s) / 0.32;
  float crista = tri * tri * (3.0 - 2.0 * tri);
  float campo = smoothstep(0.25, 0.7, rlN(p * 0.09 + 3.0)) * (0.55 + 0.45 * rlN(p * 0.5 + 8.0));
  float seca = 1.0 - molhada;
  float bOnda = rlBanda(fw, lam);
  float ond = crista * 0.019 * campo * seca * bOnda;
  float riscos = (rlN(vec2(p.x * 0.25, p.y * 2.2) + 11.0) - 0.5) * 0.016 * seca * rlBanda(fw, 0.45);
  float morro = rlN(p * 0.18) * 0.3 + rlN(p * 0.6 + 5.0) * 0.06;
  return vec2(ond + riscos + morro * (1.0 - molhada * 0.7), (crista - 0.5) * 2.0 * campo * seca * bOnda);
}

// terra batida: torrões, a rua ondulada e o pedrisco (uma pedra por célula de 40 cm, nem toda célula tem)
vec2 rlTerra(vec2 p, float aspero, float fw) {
  float t1 = rlN(p * 2.6) - 0.5;
  float t2 = rlN(p * 7.0 + 3.0) - 0.5;
  float torrao = (t1 * 0.03 * rlBanda(fw, 0.38) + t2 * 0.012 * rlBanda(fw, 0.14)) * aspero;
  float ondas = (rlN(p * 0.5 + 9.0) - 0.5) * 0.03;
  vec2 c = p / 0.4;
  vec2 ic = floor(c);
  vec2 fc = fract(c) - 0.5;
  vec2 r = rlH2(ic);
  float tem = step(1.0 - 0.3 * aspero, r.x);
  vec2 o = (rlH2(ic + 5.3) - 0.5) * 0.4;
  float raio = 0.1 + 0.12 * r.y;
  float d = length(fc - o) / raio;
  float bP = rlBanda(fw, 0.1);
  float domo = sqrt(max(0.0, 1.0 - d * d)) * tem * bP;
  return vec2(torrao + ondas + domo * raio * 0.4 * 0.7, domo * 0.9 + (t1 * 0.35 + t2 * 0.4) * aspero * rlBanda(fw, 0.2));
}

// paralelepípedo (as mesmas fiadas do calamento.js): topo abaulado, inclinação própria, junta funda
vec2 rlPedra(vec2 p, float fw) {
  float lc = max(uBloco.x, 0.02);
  float ac = max(uBloco.y, 0.02);
  float jc = uBloco.z;
  float fiada = floor(p.y / ac);
  float alt = fract(fiada * 0.5) * 2.0;
  vec2 qc = vec2(p.x / lc + alt * uBloco.w, p.y / ac);
  vec2 iqc = floor(qc), fqc = fract(qc);
  float borda = min(min(fqc.x, 1.0 - fqc.x) * lc, min(fqc.y, 1.0 - fqc.y) * ac);
  float a = smoothstep(jc * 0.5, jc * 0.5 + 0.05, borda);
  float topo = 1.0 - (1.0 - a) * (1.0 - a);
  vec2 incl = rlH2(iqc + 1.7) - 0.5;
  float bP = rlBanda(fw, min(lc, ac));
  float h = (topo * 0.03 + dot(incl, fqc - 0.5) * 0.02 * topo) * bP;
  return vec2(h, (topo - 0.85) * 1.2 * bP);
}

// terra rachada: placas (células de Voronoi de ~55 cm), rachadura funda e a beira levantada
vec2 rlRacha(vec2 p0, float fw) {
  // as placas tortas (o Voronoi reto lia como ladrilho) e de tamanho variado
  vec2 p = p0 + (vec2(rlN(p0 * 0.8), rlN(p0 * 0.8 + 4.1)) - 0.5) * 0.35 + (vec2(rlN(p0 * 2.3 + 2.0), rlN(p0 * 2.3 + 6.0)) - 0.5) * 0.1;
  vec2 c = p / 0.55;
  vec2 ic = floor(c), fc = fract(c);
  float f1 = 8.0, f2 = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      float d = length(g + rlH2(ic + g) * 0.8 + 0.1 - fc);
      f2 = min(f2, max(f1, d));
      f1 = min(f1, d);
    }
  }
  float borda = (f2 - f1) * 0.55;
  float bR = rlBanda(fw, 0.12);
  // a largura da rachadura varia, e há trechos de terra só batida, sem rachar
  float larg = 0.006 + 0.016 * rlN(p0 * 1.5 + 9.0);
  float trecho = smoothstep(0.2, 0.55, rlN(p0 * 0.12 + 5.0));
  float racha = (1.0 - smoothstep(larg * 0.3, larg, borda)) * bR * trecho;
  float labio = smoothstep(larg, larg * 2.5, borda) * (1.0 - smoothstep(larg * 2.5, larg * 7.0, borda)) * bR * trecho;
  float placa = (0.5 - f1 * 0.5) * 0.012 * bR * trecho;
  float torrao = (rlN(p0 * 3.0 + 1.3) - 0.5) * 0.014 * rlBanda(fw, 0.3);
  return vec2(-racha * 0.03 + labio * 0.006 + placa + torrao, labio * 0.4 - racha * 1.2);
}

vec2 rlAltura(vec2 p, vec4 solo, float piso, float molhada, float aspero, float fw) {
  vec2 r = vec2(0.0);
  float wPedra = piso * uRelevoA.w;
  float wTerra = solo.y * (1.0 - piso) * uRelevoA.z;
  float wRacha = solo.z * uRelevoB.x;
  if (solo.x > 0.01) r += rlAreia(p, molhada, fw, uRelevoB.w) * solo.x * uRelevoA.y;
  if (wTerra > 0.01) r += rlTerra(p, aspero, fw) * wTerra;
  if (wPedra > 0.01) r += rlPedra(p, fw) * wPedra;
  if (wRacha > 0.01) r += rlRacha(p, fw) * wRacha;
  if (solo.w > 0.01) r.x += (rlN(p * 1.3 + 2.0) - 0.5) * 0.05 * solo.w;
  return r;
}

// o sulco da roda (rodeiro.js) com a borda levantada e o meio da rua abaulado, como altura da posição na rua
float rlSulco(float u, float n) {
  float t = abs(u - uRota.y);
  float l = max(uRota.z, 0.01);
  float sulco = 1.0 - smoothstep(l * 0.25, l, t);
  float borda = smoothstep(l * 0.8, l * 1.25, t) * (1.0 - smoothstep(l * 1.25, l * 2.3, t));
  float abaulado = 1.0 - smoothstep(0.0, 0.7, u);
  return uRota.x * (-sulco * 0.07 * (0.6 + 0.8 * n) + borda * 0.028) + abaulado * 0.05;
}
`

// O trecho que entra depois de #include <normal_fragment_begin>: troca a normal e escurece a fresta.
// Recebe as expressões do peso (vec4), do paralelepípedo, da posição na rua (-1 fora dela) e da areia molhada.
export function glslRelevo({ solo, piso = '0.0', rota = '-1.0', molhada = '0.0', base = 'normalize(vNMundo)' }) {
  return /* glsl */ `
  {
    vec2 pR = vPMundo.xz;
    vec2 dpxR = dFdx(pR), dpyR = dFdy(pR);
    float fwR = max(length(dpxR), length(dpyR));
    float uR = ${rota};
    float duxR = dFdx(uR), duyR = dFdy(uR);
    float forcaR = uRelevoA.x * (1.0 - smoothstep(uRelevoB.y * 0.6, uRelevoB.y, distance(cameraPosition, vPMundo)));
    // a altura é avaliada uma vez e o gradiente sai das derivadas de tela (três avaliações por diferença finita
    // custavam 4 a 10 ms por quadro no M1). A conta fica fora de condição, como pede a derivada; longe, o peso zerado
    // faz rlAltura pular tudo (o salto na borda é multiplicado pela força, que ali já é zero)
    bool pertoR = forcaR > 0.001;
    vec4 soloR = pertoR ? ${solo} : vec4(0.0);
    float pisoR = pertoR ? ${piso} : 0.0;
    float molR = ${molhada};
    float asperoR = uR < 0.0 ? 1.4 : 1.0;
    vec2 h0 = rlAltura(pR, soloR, pisoR, molR, asperoR, fwR);
    float hdxR = dFdx(h0.x), hdyR = dFdy(h0.x);
    if (pertoR) {
      float detR = dpxR.x * dpyR.y - dpxR.y * dpyR.x;
      vec2 gR = abs(detR) > 1e-10 ? vec2(hdxR * dpyR.y - hdyR * dpxR.y, hdyR * dpxR.x - hdxR * dpyR.x) / detR : vec2(0.0);
      // a posição na rua é linear no triângulo: o gradiente dela sai das derivadas de tela
      if (uR >= 0.0 && uR < 0.9 && pisoR < 0.5) {
        vec2 gU = abs(detR) > 1e-10 ? vec2(duxR * dpyR.y - duyR * dpxR.y, duyR * dpxR.x - duxR * dpyR.x) / detR : vec2(0.0);
        gU *= min(1.0, 1.0 / max(length(gU), 1e-4)); // meia rua de pelo menos 1 m (a borda da rua dá salto)
        float nS = rlN(pR * 0.3);
        float dS = (rlSulco(uR + 0.004, nS) - rlSulco(uR - 0.004, nS)) / 0.008;
        gR += dS * gU * soloR.y * uRelevoA.z;
      }
      gR *= forcaR;
      vec3 nR = normalize(${base} + vec3(-gR.x, 0.0, -gR.y));
      normal = normalize((viewMatrix * vec4(nR, 0.0)).xyz);
      diffuseColor.rgb *= 1.0 + clamp(h0.y, -1.0, 1.0) * uRelevoB.z * forcaR * 0.4;
    }
  }`
}

// -------------------------------------------------------------------------------------------------- TSL
let F = null
function funcoes(W) {
  if (F) return F
  const { Fn, vec2, vec4, float, fract, floor, dot, mix, smoothstep, step, length, sqrt, max, min, abs, If } = W
  const L = (name, type, inputs) => ({ name, type, inputs: inputs.map(([n, t]) => ({ name: n, type: t })) })
  const rlH = Fn(([p0]) => {
    const p = fract(p0.mul(vec2(233.34, 851.73))).toVar()
    p.addAssign(dot(p, p.add(23.45)))
    return fract(p.x.mul(p.y))
  }).setLayout(L('rlH', 'float', [['p', 'vec2']]))
  const rlH2 = Fn(([p]) => {
    const a = rlH(p)
    return vec2(a, rlH(p.add(a.mul(17.0)).add(3.7)))
  }).setLayout(L('rlH2', 'vec2', [['p', 'vec2']]))
  const rlN = Fn(([p]) => {
    const i = floor(p), f = fract(p)
    const u = f.mul(f).mul(float(3.0).sub(f.mul(2.0)))
    return mix(mix(rlH(i), rlH(i.add(vec2(1.0, 0.0))), u.x), mix(rlH(i.add(vec2(0.0, 1.0))), rlH(i.add(vec2(1.0, 1.0))), u.x), u.y)
  }).setLayout(L('rlN', 'float', [['p', 'vec2']]))
  const banda = (fw, lam) => float(1.0).sub(smoothstep(0.2, 0.55, fw.div(lam)))

  const rlAreia = Fn(([p, molhada, fw, lam]) => {
    const torto = rlN(p.mul(0.35)).mul(1.6).add(rlN(p.mul(1.1).add(7.0)).mul(0.35))
    // a frente da onda desliza de um trecho para outro (soma na fase)
    const s = fract(p.x.add(torto).add(p.y.mul(0.18)).div(lam).add(rlN(p.mul(0.03).add(13.0)).mul(3.0)))
    const tri = s.lessThan(0.68).select(s.div(0.68), float(1.0).sub(s).div(0.32))
    const crista = tri.mul(tri).mul(float(3.0).sub(tri.mul(2.0)))
    const campo = smoothstep(0.25, 0.7, rlN(p.mul(0.09).add(3.0))).mul(rlN(p.mul(0.5).add(8.0)).mul(0.45).add(0.55))
    const seca = float(1.0).sub(molhada)
    const bOnda = banda(fw, lam)
    const ond = crista.mul(0.019).mul(campo).mul(seca).mul(bOnda)
    const riscos = rlN(vec2(p.x.mul(0.25), p.y.mul(2.2)).add(11.0)).sub(0.5).mul(0.016).mul(seca).mul(banda(fw, 0.45))
    const morro = rlN(p.mul(0.18)).mul(0.3).add(rlN(p.mul(0.6).add(5.0)).mul(0.06))
    return vec2(ond.add(riscos).add(morro.mul(float(1.0).sub(molhada.mul(0.7)))), crista.sub(0.5).mul(2.0).mul(campo).mul(seca).mul(bOnda))
  }).setLayout(L('rlAreia', 'vec2', [['p', 'vec2'], ['molhada', 'float'], ['fw', 'float'], ['lam', 'float']]))

  const rlTerra = Fn(([p, aspero, fw]) => {
    const t1 = rlN(p.mul(2.6)).sub(0.5)
    const t2 = rlN(p.mul(7.0).add(3.0)).sub(0.5)
    const torrao = t1.mul(0.03).mul(banda(fw, 0.38)).add(t2.mul(0.012).mul(banda(fw, 0.14))).mul(aspero)
    const ondas = rlN(p.mul(0.5).add(9.0)).sub(0.5).mul(0.03)
    const c = p.div(0.4)
    const ic = floor(c)
    const fc = fract(c).sub(0.5)
    const r = rlH2(ic)
    const tem = step(float(1.0).sub(aspero.mul(0.3)), r.x)
    const o = rlH2(ic.add(5.3)).sub(0.5).mul(0.4)
    const raio = r.y.mul(0.12).add(0.1)
    const d = length(fc.sub(o)).div(raio)
    const bP = banda(fw, 0.1)
    const domo = sqrt(max(0.0, float(1.0).sub(d.mul(d)))).mul(tem).mul(bP)
    return vec2(torrao.add(ondas).add(domo.mul(raio).mul(0.4 * 0.7)), domo.mul(0.9).add(t1.mul(0.35).add(t2.mul(0.4)).mul(aspero).mul(banda(fw, 0.2))))
  }).setLayout(L('rlTerra', 'vec2', [['p', 'vec2'], ['aspero', 'float'], ['fw', 'float']]))

  const rlPedra = Fn(([p, fw, bloco]) => {
    const lc = max(bloco.x, 0.02)
    const ac = max(bloco.y, 0.02)
    const jc = bloco.z
    const fiada = floor(p.y.div(ac))
    const alt = fract(fiada.mul(0.5)).mul(2.0)
    const qc = vec2(p.x.div(lc).add(alt.mul(bloco.w)), p.y.div(ac))
    const iqc = floor(qc), fqc = fract(qc)
    const borda = min(min(fqc.x, float(1.0).sub(fqc.x)).mul(lc), min(fqc.y, float(1.0).sub(fqc.y)).mul(ac))
    const a = smoothstep(jc.mul(0.5), jc.mul(0.5).add(0.05), borda)
    const topo = float(1.0).sub(float(1.0).sub(a).mul(float(1.0).sub(a)))
    const incl = rlH2(iqc.add(1.7)).sub(0.5)
    const bP = banda(fw, min(lc, ac))
    const h = topo.mul(0.03).add(dot(incl, fqc.sub(0.5)).mul(0.02).mul(topo)).mul(bP)
    return vec2(h, topo.sub(0.85).mul(1.2).mul(bP))
  }).setLayout(L('rlPedra', 'vec2', [['p', 'vec2'], ['fw', 'float'], ['bloco', 'vec4']]))

  const rlRacha = Fn(([p0, fw]) => {
    // as placas tortas e de tamanho variado
    const p = p0.add(vec2(rlN(p0.mul(0.8)), rlN(p0.mul(0.8).add(4.1))).sub(0.5).mul(0.35))
      .add(vec2(rlN(p0.mul(2.3).add(2.0)), rlN(p0.mul(2.3).add(6.0))).sub(0.5).mul(0.1))
    const c = p.div(0.55)
    const ic = floor(c), fc = fract(c)
    const f1 = float(8.0).toVar(), f2 = float(8.0).toVar()
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        const g = vec2(i, j)
        const d = length(g.add(rlH2(ic.add(g)).mul(0.8)).add(0.1).sub(fc))
        f2.assign(min(f2, max(f1, d)))
        f1.assign(min(f1, d))
      }
    }
    const borda = f2.sub(f1).mul(0.55)
    const bR = banda(fw, 0.12)
    // a largura da rachadura varia, e há trechos de terra só batida, sem rachar
    const larg = rlN(p0.mul(1.5).add(9.0)).mul(0.016).add(0.006)
    const trecho = smoothstep(0.2, 0.55, rlN(p0.mul(0.12).add(5.0)))
    const racha = float(1.0).sub(smoothstep(larg.mul(0.3), larg, borda)).mul(bR).mul(trecho)
    const labio = smoothstep(larg, larg.mul(2.5), borda).mul(float(1.0).sub(smoothstep(larg.mul(2.5), larg.mul(7.0), borda))).mul(bR).mul(trecho)
    const placa = float(0.5).sub(f1.mul(0.5)).mul(0.012).mul(bR).mul(trecho)
    const torrao = rlN(p0.mul(3.0).add(1.3)).sub(0.5).mul(0.014).mul(banda(fw, 0.3))
    return vec2(racha.mul(-0.03).add(labio.mul(0.006)).add(placa).add(torrao), labio.mul(0.4).sub(racha.mul(1.2)))
  }).setLayout(L('rlRacha', 'vec2', [['p0', 'vec2'], ['fw', 'float']]))

  // a escala e os pesos vêm como argumento: função com assinatura declarada não enxerga uniform de fora no WGSL
  const rlAltura = Fn(([p, solo, piso, molhada, aspero, fw, A, B, bloco]) => {
    const r = vec2(0.0).toVar()
    const wPedra = piso.mul(A.w)
    const wTerra = solo.y.mul(float(1.0).sub(piso)).mul(A.z)
    const wRacha = solo.z.mul(B.x)
    If(solo.x.greaterThan(0.01), () => { r.addAssign(rlAreia(p, molhada, fw, B.w).mul(solo.x.mul(A.y))) })
    If(wTerra.greaterThan(0.01), () => { r.addAssign(rlTerra(p, aspero, fw).mul(wTerra)) })
    If(wPedra.greaterThan(0.01), () => { r.addAssign(rlPedra(p, fw, bloco).mul(wPedra)) })
    If(wRacha.greaterThan(0.01), () => { r.addAssign(rlRacha(p, fw).mul(wRacha)) })
    If(solo.w.greaterThan(0.01), () => { r.addAssign(vec2(rlN(p.mul(1.3).add(2.0)).sub(0.5).mul(0.05).mul(solo.w), 0.0)) })
    return r
  }).setLayout(L('rlAltura', 'vec2', [['p', 'vec2'], ['solo', 'vec4'], ['piso', 'float'], ['molhada', 'float'], ['aspero', 'float'], ['fw', 'float'], ['A', 'vec4'], ['B', 'vec4'], ['bloco', 'vec4']]))

  const rlSulco = Fn(([u, n, rota]) => {
    const t = abs(u.sub(rota.y))
    const l = max(rota.z, 0.01)
    const sulco = float(1.0).sub(smoothstep(l.mul(0.25), l, t))
    const borda = smoothstep(l.mul(0.8), l.mul(1.25), t).mul(float(1.0).sub(smoothstep(l.mul(1.25), l.mul(2.3), t)))
    const abaulado = float(1.0).sub(smoothstep(0.0, 0.7, u))
    return rota.x.mul(sulco.mul(-0.07).mul(n.mul(0.8).add(0.6)).add(borda.mul(0.028))).add(abaulado.mul(0.05))
  }).setLayout(L('rlSulco', 'float', [['u', 'float'], ['n', 'float'], ['rota', 'vec4']]))

  F = { rlAltura, rlSulco, rlN, vec4 }
  return F
}

// o ruído de valor do relevo (rlN do GLSL), para quem desenha junto (a linha da maré, areia.js)
export function ruidoRelevo(W) { return funcoes(W).rlN }

// Monta o relevo no TSL. Devolve { normal, corFator }: a normal em espaço de vista (para o modelo de luz do
// material pintado, arcane-tsl.js) e o fator que multiplica a cor. Os dois saem do mesmo nó (quem chama guarda
// e usa nos dois ganchos do material: cor e normal); as derivadas de tela ficam fora de condição (o WGSL recusa).
export function tslRelevo(W, { solo, piso = null, rota = null, molhada = null, nMundo }) {
  const { Fn, vec2, vec3, vec4, float, max, length, dFdx, dFdy, abs, min, normalize, smoothstep, distance, clamp,
    positionWorld, cameraPosition, cameraViewMatrix, If } = W
  const { rlAltura, rlSulco, rlN } = funcoes(W)
  const A = ref(uRelevo.uRelevoA), B = ref(uRelevo.uRelevoB)
  const bloco = ref(uCalamento.uBloco), rotaU = ref(uRodeiro.uRota)
  const saida = Fn(() => {
    const pR = positionWorld.xz.toVar()
    const dpxR = dFdx(pR).toVar(), dpyR = dFdy(pR).toVar()
    const fwR = max(length(dpxR), length(dpyR)).toVar()
    const uR = (rota || float(-1.0)).toVar()
    const duxR = dFdx(uR).toVar(), duyR = dFdy(uR).toVar()
    const forcaR = A.x.mul(float(1.0).sub(smoothstep(B.y.mul(0.6), B.y, distance(cameraPosition, positionWorld)))).toVar()
    const res = vec4(0.0, 0.0, 0.0, 0.0).toVar() // gradiente x, gradiente z, máscara de cor, força
    // uma avaliação só, gradiente pelas derivadas de tela, fora de condição (o WGSL recusa derivada dentro de If)
    const pertoR = forcaR.greaterThan(0.001)
    const soloR = pertoR.select(vec4(solo), vec4(0.0)).toVar()
    const pisoR = pertoR.select(piso || float(0.0), float(0.0)).toVar()
    const molR = molhada || float(0.0)
    const asperoR = uR.lessThan(0.0).select(float(1.4), float(1.0))
    const h0 = rlAltura(pR, soloR, pisoR, molR, asperoR, fwR, A, B, bloco).toVar()
    const hdxR = dFdx(h0.x).toVar(), hdyR = dFdy(h0.x).toVar()
    If(pertoR, () => {
      const detR = dpxR.x.mul(dpyR.y).sub(dpxR.y.mul(dpyR.x)).toVar()
      const gR0 = vec2(hdxR.mul(dpyR.y).sub(hdyR.mul(dpxR.y)), hdyR.mul(dpxR.x).sub(hdxR.mul(dpyR.x))).div(detR)
      const gR = abs(detR).greaterThan(1e-10).select(gR0, vec2(0.0)).toVar()
      If(uR.greaterThanEqual(0.0).and(uR.lessThan(0.9)).and(pisoR.lessThan(0.5)), () => {
        const gU0 = vec2(duxR.mul(dpyR.y).sub(duyR.mul(dpxR.y)), duyR.mul(dpxR.x).sub(duxR.mul(dpyR.x))).div(detR)
        const gU = abs(detR).greaterThan(1e-10).select(gU0, vec2(0.0)).toVar()
        gU.mulAssign(min(1.0, float(1.0).div(max(length(gU), 1e-4))))
        const nS = rlN(pR.mul(0.3))
        const dS = rlSulco(uR.add(0.004), nS, rotaU).sub(rlSulco(uR.sub(0.004), nS, rotaU)).div(0.008)
        gR.addAssign(gU.mul(dS).mul(soloR.y).mul(A.z))
      })
      res.assign(vec4(gR.mul(forcaR), h0.y, forcaR))
    })
    return res
  })().toVar('relevoChao')
  const nR = normalize(normalize(nMundo).add(vec3(saida.x.negate(), 0.0, saida.y.negate())))
  const normal = normalize(cameraViewMatrix.mul(vec4(nR, 0.0)).xyz)
  const corFator = float(1.0).add(clamp(saida.z, -1.0, 1.0).mul(B.z).mul(saida.w).mul(0.4))
  return { normal, corFator, forca: saida.w }
}
