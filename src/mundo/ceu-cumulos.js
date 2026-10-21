// Cúmulos do alísio pintados no céu do meio-dia (GLSL e TSL, mesmas contas e nomes), tirados de ceu-pintado.js.
//
// Revisão do orquestrador (21/10/2026, segunda rodada): os de 3bf1a60 pareciam adesivos, todos do mesmo tamanho e
// forma, numa fileira só na mesma altura, brancos chapados de contorno duro. Nos quadros de conceito 1 e 3 os cúmulos
// variam muito de tamanho, juntam-se em grupos com vãos, ficam em alturas e distâncias diferentes, os do fundo menores
// e lavados; base reta, topo irregular, luz e sombra pintadas e macias.
//   - duas camadas: a do fundo (células estreitas, base rente ao horizonte, pequena e lavada para a cor do horizonte)
//     e a da frente (células largas, base mais alta, nuvens maiores)
//   - grupos: um ruído largo no azimute decide onde há nuvem e onde há vão
//   - cada nuvem: largura sorteada de 0,3 a 1,5 célula, cinco bolhas em posições e alturas sorteadas sobre a base reta
//     (o topo sai irregular), borda macia proporcional ao tamanho
//   - luz: a bolha mais perto dá o lado claro (em cima e do lado do sol), a barriga é azul-acinzentada, e um ruído
//     fino de pincel mancha a passagem
// Precisa de h2 e vn (ceu-pintado.js) e dos uniforms uCumulos, uMeio, uSolCor e uHor.

const TAU = 6.2831853

export const GLSL_CUMULOS = /* glsl */ `
vec4 cumuloCamada(float azL, float el, float N, float sem, float b0, float b1, float tam, float lado) {
  float ic = floor(azL / ${TAU} * N);
  float melhor = 1e3; float luzM = 0.0; float altM = 0.0; float suaveM = 1e-3;
  for (int k = -1; k <= 1; k++) {
    float c = ic + float(k);
    float ch = mod(c, N) + sem * 101.0;
    float grupo = smoothstep(0.32, 0.68, vn(vec2(c / N * 7.0 + sem * 3.0, sem)));
    float tem = step(h2(vec2(ch, 3.1)), uCumulos.x * grupo * 1.5);
    float s1 = h2(vec2(ch, 7.7));
    float larg = (0.3 + 1.2 * s1 * s1) / N * ${TAU} * tam * uCumulos.y;
    float cx = (c + 0.5 + (h2(vec2(ch, 11.3)) - 0.5) * 0.5) / N * ${TAU};
    float base = mix(b0, b1, h2(vec2(ch, 5.9)));
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      float fx = h2(vec2(ch, 13.0 + fi)) - 0.5;
      float br = larg * (0.13 + 0.2 * h2(vec2(ch, 17.0 + fi))) * (1.0 - abs(fx) * 0.9);
      vec2 dd = vec2((azL - (cx + fx * larg * 0.85)) * 0.85, el - (base + br * (0.1 + 0.9 * h2(vec2(ch, 23.0 + fi)))));
      float dist = mix(1e3, max(length(dd) - br, base - el), tem);
      if (dist < melhor) {
        melhor = dist;
        luzM = dd.y / max(br, 1e-5) * 0.6 + dd.x / max(br, 1e-5) * lado * 0.4;
        altM = clamp((el - base) / max(larg * 0.45, 1e-5), 0.0, 1.0);
        suaveM = max(larg * 0.022, 4e-4);
      }
    }
  }
  return vec4(1.0 - smoothstep(-suaveM, suaveM, melhor), luzM, altM, 0.0);
}
vec3 corCumulo(vec4 cu, float az, float el, float nevoa) {
  float pincel = vn(vec2(az * 90.0, el * 120.0)) - 0.5;
  float luzC = smoothstep(-0.1, 0.9, cu.y * 0.5 + cu.z * 0.6 + pincel * 0.25);
  vec3 sombraC = mix(vec3(0.55, 0.62, 0.75), uMeio, 0.3);
  vec3 claroC = mix(vec3(1.0, 0.985, 0.95), uSolCor, 0.12);
  vec3 c = mix(sombraC, claroC, luzC);
  c = mix(c, sombraC * 0.93, (1.0 - smoothstep(0.0, 0.15, cu.z)) * 0.45);
  return mix(c, uHor, nevoa);
}
`

// O trecho que pinta as duas camadas sobre "cor" (no main do céu, dentro do visual Arcane)
export const GLSL_CUMULOS_PINTAR = /* glsl */ `
    if (uAzul > 0.001) {
      float azC = mod(az, ${TAU});
      float ladoC = sin(atan(uSolDir.z, uSolDir.x) - az);
      vec4 cuLonge = cumuloCamada(azC, y, 64.0, 0.0, 0.012, 0.04, 0.75, ladoC);
      cor = mix(cor, corCumulo(cuLonge, az, y, 0.35), cuLonge.x * uAzul * uArcCeu * 0.9);
      vec4 cuPerto = cumuloCamada(azC, y, 20.0, 5.0, 0.03, 0.14, 1.25, ladoC);
      cor = mix(cor, corCumulo(cuPerto, az, y, 0.05), cuPerto.x * uAzul * uArcCeu);
    }`

// O mesmo em TSL: os laços desenrolados aqui. U = uniforms em nó; h2 e vn as funções do céu.
export function tslCumulos(W, U, h2, vn) {
  const { vec2, vec3, vec4, float, floor, mix, max, abs, clamp, smoothstep, step, length, sin, atan2 } = W
  const modP = (x, y) => x.sub(floor(x.div(y)).mul(y)) // o mod do GLSL (o % do WGSL dá negativo para x negativo)
  const camada = (azL, el, N, sem, b0, b1, tam, lado) => {
    const ic = floor(azL.div(TAU).mul(N))
    const melhor = float(1e3).toVar(), luzM = float(0.0).toVar(), altM = float(0.0).toVar(), suaveM = float(1e-3).toVar()
    for (let k = -1; k <= 1; k++) {
      const c = ic.add(k)
      const ch = modP(c, N).add(sem * 101.0)
      const grupo = smoothstep(0.32, 0.68, vn(vec2(c.div(N).mul(7.0).add(sem * 3.0), sem)))
      const tem = step(h2(vec2(ch, 3.1)), U.uCumulos.x.mul(grupo).mul(1.5))
      const s1 = h2(vec2(ch, 7.7))
      const larg = s1.mul(s1).mul(1.2).add(0.3).div(N).mul(TAU * tam).mul(U.uCumulos.y)
      const cx = c.add(0.5).add(h2(vec2(ch, 11.3)).sub(0.5).mul(0.5)).div(N).mul(TAU)
      const base = mix(float(b0), float(b1), h2(vec2(ch, 5.9)))
      for (let i = 0; i < 5; i++) {
        const fx = h2(vec2(ch, 13.0 + i)).sub(0.5)
        const br = larg.mul(h2(vec2(ch, 17.0 + i)).mul(0.2).add(0.13)).mul(float(1.0).sub(abs(fx).mul(0.9)))
        const dd = vec2(azL.sub(cx.add(fx.mul(larg).mul(0.85))).mul(0.85), el.sub(base.add(br.mul(h2(vec2(ch, 23.0 + i)).mul(0.9).add(0.1)))))
        const dist = mix(float(1e3), max(length(dd).sub(br), base.sub(el)), tem)
        W.If(dist.lessThan(melhor), () => {
          melhor.assign(dist)
          luzM.assign(dd.y.div(max(br, 1e-5)).mul(0.6).add(dd.x.div(max(br, 1e-5)).mul(lado).mul(0.4)))
          altM.assign(clamp(el.sub(base).div(max(larg.mul(0.45), 1e-5)), 0.0, 1.0))
          suaveM.assign(max(larg.mul(0.022), 4e-4))
        })
      }
    }
    return vec4(float(1.0).sub(smoothstep(suaveM.negate(), suaveM, melhor)), luzM, altM, 0.0)
  }
  const corCumulo = (cu, az, el, nevoa) => {
    const pincel = vn(vec2(az.mul(90.0), el.mul(120.0))).sub(0.5)
    const luzC = smoothstep(-0.1, 0.9, cu.y.mul(0.5).add(cu.z.mul(0.6)).add(pincel.mul(0.25)))
    const sombraC = mix(vec3(0.55, 0.62, 0.75), U.uMeio, 0.3)
    const claroC = mix(vec3(1.0, 0.985, 0.95), U.uSolCor, 0.12)
    const c = mix(sombraC, claroC, luzC).toVar()
    c.assign(mix(c, sombraC.mul(0.93), float(1.0).sub(smoothstep(0.0, 0.15, cu.z)).mul(0.45)))
    return mix(c, U.uHor, nevoa)
  }
  // pinta sobre o nó "cor" (vec3 em variável)
  return (cor, az, y) => {
    W.If(U.uAzul.greaterThan(0.001), () => {
      const azC = modP(az, TAU)
      const ladoC = sin(atan2(U.uSolDir.z, U.uSolDir.x).sub(az))
      const cuLonge = camada(azC, y, 64.0, 0.0, 0.012, 0.04, 0.75, ladoC)
      cor.assign(mix(cor, corCumulo(cuLonge, az, y, 0.35), cuLonge.x.mul(U.uAzul).mul(U.uArcCeu).mul(0.9)))
      const cuPerto = camada(azC, y, 20.0, 5.0, 0.03, 0.14, 1.25, ladoC)
      cor.assign(mix(cor, corCumulo(cuPerto, az, y, 0.05), cuPerto.x.mul(U.uAzul).mul(U.uArcCeu)))
    })
  }
}
