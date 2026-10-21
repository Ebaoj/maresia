// Reboco envelhecido (luz-arcane, item 4; alvo docs/referencias/forte-1932-joabe): o desgaste que se lê de
// 10 a 20 m, não ruído miúdo. Tudo em código, preso ao mundo (anda com a parede, sem "porta de box"):
//   1. manchas grandes de caiação (1 a 3 m) e placas de cal velha de borda nítida (dois tons, como pintado)
//   2. escorridos verticais de chuva e de sal
//   3. umidade e salitre subindo da calçada, com a linha da maré marcada
//   4. sujeira mais escura rente ao chão
//   5. placas de reboco caídas mostrando a pedra e a taipa (fiadas irregulares, junta escura), com a
//      borda do reboco grosso clara em cima e sombra embaixo
// As arestas claras (quina gasta) moram na tela (aranhaverso.js, "aresta clara"): a parede não sabe onde
// fica a própria quina, a profundidade sabe.
//
// Entradas: hq = altura acima do chão da casa (m), uq = coordenada ao longo da parede (x + z do mundo),
// desg = desgaste do material (0,4 casario, 0,85 morro), k = cfg.estilo.arcDesgaste (0 = como antes).
// As duas versões (GLSL e TSL) seguem as mesmas contas, com os mesmos nomes.

export const GLSL_DESGASTE = /* glsl */ `
vec3 envelhecer(vec3 rgb, float hq, float uq, float desg, float k, vec3 taipa, out float casca) {
  casca = 0.0;
  if (k <= 0.001) return rgb;
  // 1. manchas grandes de caiação (duas escalas), puxando para a cal velha, mais fria e cinzenta
  float m = ruidoQ(vec2(uq * 0.32, hq * 0.42) + 3.7) * 0.65 + ruidoQ(vec2(uq * 0.9, hq * 1.1) + 9.1) * 0.35;
  rgb *= mix(1.0, mix(0.84, 1.05, m), k);
  rgb = mix(rgb, rgb * vec3(0.9, 0.88, 0.83), (1.0 - m) * 0.55 * k);
  // placas de cal velha com borda pintada (dois tons, borda nítida): é o que o forte da referência mostra
  float placa = ruidoQ(vec2(uq * 0.5, hq * 0.62) + 13.0) * 0.75 + ruidoQ(vec2(uq * 2.4, hq * 2.8) + 17.0) * 0.25;
  rgb = mix(rgb, rgb * vec3(0.82, 0.79, 0.72), smoothstep(0.6, 0.625, placa) * 0.85 * k);
  // 2. escorridos: listras verticais estreitas, que somem e voltam ao longo da altura
  float lista = ruidoQ(vec2(uq * 2.1, hq * 0.12) + 21.0);
  float corre = smoothstep(0.6, 0.86, lista) * (0.4 + 0.6 * ruidoQ(vec2(uq * 0.5, hq * 0.7) + 5.0));
  rgb *= 1.0 - 0.2 * corre * k; // contido (conceito-sertão: poucas manchas grandes, não ruído)
  // 3. umidade e salitre: mancha verde-acinzentada subindo da calçada, topo irregular, linha da maré
  float alt = 0.8 + 1.2 * ruidoQ(vec2(uq * 0.55, 0.5)) + 0.25 * ruidoQ(vec2(uq * 3.0, 1.5));
  float umido = 1.0 - smoothstep(alt * 0.7, alt, hq);
  rgb = mix(rgb, rgb * vec3(0.5, 0.55, 0.48), umido * 0.85 * k);
  float mare = smoothstep(alt * 0.82, alt, hq) * (1.0 - smoothstep(alt, alt * 1.1, hq));
  rgb *= 1.0 - 0.2 * mare * k;
  // 4. sujeira rente ao chão
  rgb *= mix(1.0, mix(0.68, 1.0, smoothstep(0.0, 2.4, hq)), k);
  // 5. reboco caído: placas grandes, mais perto do chão e mais nas casas gastas
  float n = ruidoQ(vec2(uq * 0.22, hq * 0.3) + 31.0) * 0.72 + ruidoQ(vec2(uq * 1.4, hq * 1.6) + 41.0) * 0.28;
  float lim = mix(0.68, 0.6, desg) + 0.1 * smoothstep(0.6, 4.5, hq);
  casca = smoothstep(lim, lim + 0.012, n) * k;
  // pedra e taipa por baixo: fiadas irregulares, cada pedra com o seu tom, junta escura
  float fila = floor(hq * 3.1);
  float xs = uq * 2.3 + fila * 0.53 + ruidoQ(vec2(fila, 2.0)) * 0.8;
  float id = floor(xs);
  float tom = ruidoQ(vec2(id * 1.7, fila * 3.1) + 0.5);
  float junta = max(smoothstep(0.88, 0.97, fract(xs)), smoothstep(0.84, 0.95, fract(hq * 3.1)));
  vec3 pedra = mix(taipa, vec3(0.6, 0.55, 0.47), 0.4 + 0.4 * tom) * (1.0 - 0.3 * junta);
  float aro = smoothstep(lim - 0.04, lim - 0.004, n) * (1.0 - smoothstep(lim, lim + 0.012, n)) * k;
  float nb = ruidoQ(vec2(uq * 0.22, (hq + 0.08) * 0.3) + 31.0) * 0.72 + ruidoQ(vec2(uq * 1.4, (hq + 0.08) * 1.6) + 41.0) * 0.28;
  float sombraAro = casca * (1.0 - smoothstep(lim, lim + 0.012, nb));
  rgb = mix(rgb, pedra, casca);
  rgb = mix(rgb, rgb * 1.12 + 0.035, aro);
  rgb *= 1.0 - 0.45 * sombraAro;
  return rgb;
}`

// A mesma conta em TSL. ruidoQ: (vec2) => float, o mesmo ruído do material; devolve { rgb, casca }
export function envelhecerTsl(W, ruidoQ, rgb0, hq, uq, desg, k, taipa) {
  const { vec2, vec3, float, mix, smoothstep, floor, fract, max } = W
  const um = float(1.0)
  let rgb = vec3(rgb0)
  const m = ruidoQ(vec2(uq.mul(0.32), hq.mul(0.42)).add(3.7)).mul(0.65).add(ruidoQ(vec2(uq.mul(0.9), hq.mul(1.1)).add(9.1)).mul(0.35))
  rgb = rgb.mul(mix(um, mix(0.84, 1.05, m), k))
  rgb = mix(rgb, rgb.mul(vec3(0.9, 0.88, 0.83)), um.sub(m).mul(0.55).mul(k))
  const placa = ruidoQ(vec2(uq.mul(0.5), hq.mul(0.62)).add(13.0)).mul(0.75).add(ruidoQ(vec2(uq.mul(2.4), hq.mul(2.8)).add(17.0)).mul(0.25))
  rgb = mix(rgb, rgb.mul(vec3(0.82, 0.79, 0.72)), smoothstep(0.6, 0.625, placa).mul(0.85).mul(k))
  const lista = ruidoQ(vec2(uq.mul(2.1), hq.mul(0.12)).add(21.0))
  const corre = smoothstep(0.6, 0.86, lista).mul(ruidoQ(vec2(uq.mul(0.5), hq.mul(0.7)).add(5.0)).mul(0.6).add(0.4))
  rgb = rgb.mul(um.sub(corre.mul(0.2).mul(k)))
  const alt = ruidoQ(vec2(uq.mul(0.55), 0.5)).mul(1.2).add(0.8).add(ruidoQ(vec2(uq.mul(3.0), 1.5)).mul(0.25))
  const umido = um.sub(smoothstep(alt.mul(0.7), alt, hq))
  rgb = mix(rgb, rgb.mul(vec3(0.5, 0.55, 0.48)), umido.mul(0.85).mul(k))
  const mare = smoothstep(alt.mul(0.82), alt, hq).mul(um.sub(smoothstep(alt, alt.mul(1.1), hq)))
  rgb = rgb.mul(um.sub(mare.mul(0.2).mul(k)))
  rgb = rgb.mul(mix(um, mix(0.68, 1.0, smoothstep(0.0, 2.4, hq)), k))
  const n = ruidoQ(vec2(uq.mul(0.22), hq.mul(0.3)).add(31.0)).mul(0.72).add(ruidoQ(vec2(uq.mul(1.4), hq.mul(1.6)).add(41.0)).mul(0.28))
  const lim = mix(float(0.68), float(0.6), desg).add(smoothstep(0.6, 4.5, hq).mul(0.1))
  const casca = smoothstep(lim, lim.add(0.012), n).mul(k)
  const fila = floor(hq.mul(3.1))
  const xs = uq.mul(2.3).add(fila.mul(0.53)).add(ruidoQ(vec2(fila, 2.0)).mul(0.8))
  const id = floor(xs)
  const tom = ruidoQ(vec2(id.mul(1.7), fila.mul(3.1)).add(0.5))
  const junta = max(smoothstep(0.88, 0.97, fract(xs)), smoothstep(0.84, 0.95, fract(hq.mul(3.1))))
  const pedra = mix(vec3(taipa), vec3(0.6, 0.55, 0.47), tom.mul(0.4).add(0.4)).mul(um.sub(junta.mul(0.3)))
  const aro = smoothstep(lim.sub(0.04), lim.sub(0.004), n).mul(um.sub(smoothstep(lim, lim.add(0.012), n))).mul(k)
  const hb = hq.add(0.08)
  const nb = ruidoQ(vec2(uq.mul(0.22), hb.mul(0.3)).add(31.0)).mul(0.72).add(ruidoQ(vec2(uq.mul(1.4), hb.mul(1.6)).add(41.0)).mul(0.28))
  const sombraAro = casca.mul(um.sub(smoothstep(lim, lim.add(0.012), nb)))
  rgb = mix(rgb, pedra, casca)
  rgb = mix(rgb, rgb.mul(1.12).add(0.035), aro)
  rgb = rgb.mul(um.sub(sombraAro.mul(0.45)))
  return { rgb, casca }
}
