// Pincelada na tela (visual Arcane, item 2 do luz-arcane): filtro de Kuwahara anisotrópico com pesos
// polinomiais (Kyprianidis et al. 2009/2010; a forma dos pesos é a do Acerola e do texto do Maxime Heckel em
// docs/pesquisa-arcane.md). Cada pixel olha uma elipse em volta, dividida em 8 setores, e fica com a média dos
// setores de menor variância: a superfície vira manchas de tinta, e a borda forte (janela, quina) se mantém.
//
// Passes, antes da tela (aranhaverso.js), sobre a cor da cena:
//   1. tensor de estrutura em meia resolução: a direção da borda em cada lugar (a pincelada segue a forma)
//   1b. o tensor borrado (gaussiana separável de 5 amostras, sigma de 1 texel da meia = 2 px da cena), como no método
//       original: sem isso a direção do traço mudava de um pixel para o outro e de um quadro para o outro em área com
//       textura (a pincelada "fervia" andando; docs/relatorio-visual.md 2.3b)
//   2. Kuwahara em resolução cheia, que a tela lê no lugar da cor crua
// Desde 27/10/2026 (visual/correcoes): raio em pixels CSS (x pixel ratio), anisotropia só onde há gradiente (no liso
// os dois autovalores são quase zero e qualquer ruído esticava a elipse em direção aleatória), e a borda forte é
// PINTADA com raio menor em vez de devolver a imagem crua (a moldura crua e serrilhada de 2-4 px em toda quina sumiu).
// Fica antes da tela de propósito: névoa, gradação, papel, tela de pintura e grão entram por cima, então o grão
// não é apagado pelo filtro e a cor final continua passando pela mesma gradação. O traço (profundidade) não muda.
//
// Custo: o número de amostras é fixo (grade N x N no disco unitário, esticada para a elipse), então o raio não
// muda o custo; N muda (4 = 12 amostras, 5 = 21, 7 = 37). Medido com maresia.medir (scripts/medir-luz.mjs).

// grade de amostras no disco unitário: [vx, vy], centro incluído. A grade N x N entra até meio passo além do disco
// (sem os cantos) e é encolhida para caber nele: 4 = 12 amostras, 5 = 21, 7 = 37. Até 27/10/2026 o corte era
// |v| <= 1 exato e a grade 4 dava só 4 amostras (a 5, 13; a 7, 29): menos de uma por setor no padrão do jogo.
export function amostrasDisco(n) {
  const lista = []
  const h = (n - 1) / 2
  const lim = 1 + 0.5 / h
  let rMax = 0
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const vx = (i - h) / h, vy = (j - h) / h
      const r = Math.hypot(vx, vy)
      if (r <= lim + 1e-6) { lista.push([vx, vy]); rMax = Math.max(rMax, r) }
    }
  }
  return lista.map(([vx, vy]) => [vx / rMax, vy / rMax])
}

// pesos dos 8 setores de uma amostra (constantes: a grade é fixa, então as contas saem já prontas no código)
const ZETA = 0.6
const CRUZA = 0.58 // ângulo em que o setor zera (radianos)
const ETA = (ZETA + Math.cos(CRUZA)) / (Math.sin(CRUZA) ** 2)
export function pesosSetores(vx, vy) {
  const w = new Array(8)
  const quad = (x, y, k0) => {
    const vxx = ZETA - ETA * x * x, vyy = ZETA - ETA * y * y
    w[k0] = Math.max(0, y + vxx) ** 2
    w[k0 + 2] = Math.max(0, -x + vyy) ** 2
    w[k0 + 4] = Math.max(0, -y + vxx) ** 2
    w[k0 + 6] = Math.max(0, x + vyy) ** 2
  }
  quad(vx, vy, 0)
  quad(Math.SQRT1_2 * (vx - vy), Math.SQRT1_2 * (vx + vy), 1)
  const soma = w.reduce((a, b) => a + b, 0) || 1
  const g = Math.exp(-3.125 * (vx * vx + vy * vy) * 0.25) / soma
  return w.map((x) => x * g)
}

const num = (x) => (Number.isInteger(x) ? x.toFixed(1) : x.toPrecision(6))

export const fragTensor = /* glsl */ `
uniform sampler2D tCor; uniform vec2 uTexel;
varying vec2 vUv;
float lumP(vec2 q) { return dot(sqrt(clamp(texture2D(tCor, q).rgb, 0.0, 4.0)), vec3(0.299, 0.587, 0.114)); }
void main() {
  // Sobel com passo de 1,5 pixel da cena: a amostra bilinear já faz a média de vizinhos (suaviza o tensor)
  vec2 d = uTexel * 1.5;
  float tl = lumP(vUv + vec2(-d.x, d.y)), t = lumP(vUv + vec2(0.0, d.y)), tr = lumP(vUv + d);
  float l = lumP(vUv - vec2(d.x, 0.0)), r = lumP(vUv + vec2(d.x, 0.0));
  float bl = lumP(vUv - d), b = lumP(vUv - vec2(0.0, d.y)), br = lumP(vUv + vec2(d.x, -d.y));
  float gx = (tr + 2.0 * r + br - tl - 2.0 * l - bl) * 0.25;
  float gy = (tl + 2.0 * t + tr - bl - 2.0 * b - br) * 0.25;
  gl_FragColor = vec4(gx * gx, gx * gy, gy * gy, 1.0);
}`

// o tensor borrado: gaussiana de 5 amostras (sigma 1 texel) numa direção (uDir = texel da meia resolução)
export const PESOS_TENSOR = [0.4026, 0.2442, 0.0545]
export const fragDesfoqueTensor = /* glsl */ `
uniform sampler2D tFonte; uniform vec2 uDir;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(tFonte, vUv) * ${PESOS_TENSOR[0]};
  c += (texture2D(tFonte, vUv + uDir) + texture2D(tFonte, vUv - uDir)) * ${PESOS_TENSOR[1]};
  c += (texture2D(tFonte, vUv + 2.0 * uDir) + texture2D(tFonte, vUv - 2.0 * uDir)) * ${PESOS_TENSOR[2]};
  gl_FragColor = c;
}`

// o Kuwahara, desenrolado: cada amostra da grade vira código com os pesos já calculados
export function fragKuwahara(n) {
  const linhas = []
  for (const [vx, vy] of amostrasDisco(n)) {
    const w = pesosSetores(vx, vy)
    linhas.push(`  c = sqrt(clamp(texture2D(tCor, vUv + (M * vec2(${num(vx)}, ${num(vy)})) * uTexel).rgb, 0.0, 4.0));`)
    w.forEach((p, k) => { if (p > 1e-6) linhas.push(`  m[${k}] += vec4(c * ${num(p)}, ${num(p)}); s[${k}] += c * c * ${num(p)};`) })
  }
  return /* glsl */ `
uniform sampler2D tCor; uniform sampler2D tTensor; uniform vec2 uTexel;
uniform float uRaio; uniform float uForca; uniform float uAniso; uniform float uNitidez; uniform float uBorda;
uniform float uAnisoLim; uniform float uBordaRaio;
varying vec2 vUv;
void main() {
  vec4 orig = texture2D(tCor, vUv);
  // personagem (alfa ~0,5) e gente (~0,85) com raio menor: o rosto desenhado não pode virar mancha
  float peso = orig.a < 0.7 ? 0.3 : (orig.a < 0.95 ? 0.6 : 1.0);
  vec3 t = texture2D(tTensor, vUv).xyz;
  float raiz = sqrt(max((t.x - t.z) * (t.x - t.z) + 4.0 * t.y * t.y, 0.0));
  float l1 = 0.5 * (t.x + t.z + raiz), l2 = 0.5 * (t.x + t.z - raiz);
  // borda forte (gradiente do tensor): pintada com raio menor, não devolvida crua
  float borda = smoothstep(0.04, 0.14, sqrt(max(l1, 0.0)));
  float raio = uRaio * peso * mix(1.0, uBordaRaio, borda * uBorda);
  vec2 dir = vec2(l1 - t.x, -t.y);
  dir = dot(dir, dir) > 1e-12 ? normalize(dir) : vec2(0.0, 1.0);
  float A = l1 + l2 > 1e-8 ? (l1 - l2) / (l1 + l2) : 0.0;
  // anisotropia só com gradiente: no liso a elipse fica redonda
  A *= smoothstep(uAnisoLim * uAnisoLim * 0.1, uAnisoLim * uAnisoLim, l1 + l2);
  float a = raio * clamp((uAniso + A) / uAniso, 0.1, 2.0);
  float b = raio * clamp(uAniso / (uAniso + A), 0.1, 2.0);
  // do disco unitário para pixels: gira para a direção da borda e estica (a pincelada corre ao longo dela)
  mat2 M = mat2(dir.x * a, dir.y * a, -dir.y * b, dir.x * b);
  vec4 m[8]; vec3 s[8];
  for (int k = 0; k < 8; k++) { m[k] = vec4(0.0); s[k] = vec3(0.0); }
  vec3 c;
${linhas.join('\n')}
  vec3 soma = vec3(0.0); float somaW = 0.0;
  for (int k = 0; k < 8; k++) {
    vec3 media = m[k].rgb / max(m[k].w, 1e-6);
    vec3 v = abs(s[k] / max(m[k].w, 1e-6) - media * media);
    float w = 1.0 / (1.0 + pow(1000.0 * (v.r + v.g + v.b) + 1e-8, 0.5 * uNitidez));
    soma += media * w; somaW += w;
  }
  vec3 res = soma / max(somaW, 1e-6);
  // borda nítida (direção do Joabe, 21/10: objeto nítido como no Arcane) pelo raio menor acima, não pela imagem crua
  gl_FragColor = vec4(mix(orig.rgb, res * res, uForca), orig.a);
}`
}

// grade pedida no painel: 4 (12 amostras, a mais barata), 5 (21, o padrão desde 27/10/2026) ou 7 (37)
export function amostrasPintura(e) {
  const n = Number(e.arcPinturaAmostras)
  return n === 4 || n === 7 ? n : 5
}

// os uniforms dos dois passes (os mesmos objetos servem ao WebGPU, por ref())
export function uniformsPintura(THREE) {
  return {
    tensor: { tCor: { value: null }, uTexel: { value: new THREE.Vector2(1, 1) } },
    // o borrão do tensor: uma direção por passe (horizontal da meia para a auxiliar, vertical de volta)
    desfoqueH: { tFonte: { value: null }, uDir: { value: new THREE.Vector2(1, 0) } },
    desfoqueV: { tFonte: { value: null }, uDir: { value: new THREE.Vector2(0, 1) } },
    kuwahara: {
      tCor: { value: null }, tTensor: { value: null }, uTexel: { value: new THREE.Vector2(1, 1) },
      uRaio: { value: 3 }, uForca: { value: 1 }, uAniso: { value: 1 }, uNitidez: { value: 8 }, uBorda: { value: 1 },
      uAnisoLim: { value: 0.04 }, uBordaRaio: { value: 0.35 },
    },
  }
}

// liga ou não o filtro neste quadro, e copia os números do cfg. pixelRatio: o raio do painel é em pixels CSS (a
// pincelada fica do mesmo tamanho na tela com o Retina, o perfil e o governador)
export function atualizarPintura(u, e, arc, pixelRatio = 1) {
  const ligado = arc && (e.arcPintura ?? 0) > 0.001 && (e.memoria ?? 0) < 0.999
  u.kuwahara.uRaio.value = (e.arcPinturaRaio ?? 2.5) * pixelRatio
  u.kuwahara.uAnisoLim.value = e.arcPinturaAnisoLimiar ?? 0.04
  u.kuwahara.uBordaRaio.value = e.arcPinturaBordaRaio ?? 0.35
  u.kuwahara.uForca.value = Math.min(1, e.arcPintura ?? 0)
  u.kuwahara.uAniso.value = Math.max(0.05, e.arcPinturaAniso ?? 1)
  u.kuwahara.uNitidez.value = e.arcPinturaNitidez ?? 8
  u.kuwahara.uBorda.value = e.arcPinturaBorda ?? 1
  return ligado
}
