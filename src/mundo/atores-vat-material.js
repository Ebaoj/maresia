// Material dos atores instanciados (fase 2b, só WebGPU): o toon pintado de sempre, com a pose lida da textura de
// ossos (ossos-textura.js) em vez de um esqueleto por boneco. Cada cópia traz, por atributo de instância, as
// linhas da textura dos dois clipes (aAnimA = andar, aAnimB = parado, preenchidos por atores.js com
// quadroDoTempo). O shader busca as matrizes dos dois quadros vizinhos de cada clipe, interpola as POSIÇÕES já
// transformadas (não as matrizes) e mistura andar e parado pelo peso. Cada vértice tem um osso só (peso 1), então
// são 4 matrizes por vértice. A cor vem por instância (instanceColor multiplica o material branco).

import * as THREE from 'three'
import { toon } from '../materiais.js'
import { matrizInstancia } from '../render/arcane-tsl.js'

// Nomes dos atributos de instância (vec4 cada) que atores.js põe na geometria:
// aAnimA = (linhaA, linhaB, frac, peso) do andar; aAnimB = (linhaA, linhaB, frac, 0) do parado.
// O peso do parado é 1 - peso.
export const ATRIBUTOS = { animA: 'aAnimA', animB: 'aAnimB' }

// Linhas da textura para um tempo do clipe. clipe = { linha0, quadros, duracao } (de assarOssos). O quadro k é o
// tempo k / fps e o último não repete o primeiro: a volta é aqui, linhaB do último quadro é o primeiro.
export function quadroDoTempo(clipe, tempo) {
  const { linha0, quadros, duracao } = clipe
  const t = ((tempo % duracao) + duracao) % duracao
  const f = (t / duracao) * quadros
  // a divisão pode arredondar para `quadros` quando t é um fio abaixo da duração: fica no último quadro, frac ~ 1
  const k = Math.min(Math.floor(f), quadros - 1)
  return { linhaA: linha0 + k, linhaB: linha0 + ((k + 1) % quadros), frac: f - k }
}

// atributos: { animA, animB }, os THREE.InstancedBufferAttribute (Float32, itemSize 4) que atores.js põe na geometria
// como aAnimA/aAnimB. O nó lê esses mesmos objetos, então o que atores.js escreve chega ao desenho.
export function materialAtoresVat({ textura, nOssos, opacity = 0.85, atributos }) {
  if (!atributos?.animA || !atributos?.animB) throw new Error('materialAtoresVat: faltam atributos { animA, animB }')
  // a cor vem de instanceColor (multiplica); o resto é o toon pintado de sempre
  const material = toon('#ffffff', { semCache: true, opacity, blending: THREE.NoBlending })

  // as entradas do shader (textura e os dois atributos) criadas uma vez por material, na primeira montagem: o
  // módulo three/webgpu (W) só existe nesse ponto, e a conta abaixo é refeita em cada shader (principal e
  // sombra), cada um com a sua pilha de variáveis
  let entradas = null
  const entradasDe = (W) => {
    if (entradas) return entradas
    // instancedBufferAttribute regrava o usage do atributo como estático; atores.js o marca dinâmico (muda todo
    // quadro), então o nó dinâmico é o que preserva isso (o mesmo que matrizInstancia faz com a matriz)
    const no = (attr) => (attr.usage === W.DynamicDrawUsage ? W.instancedDynamicBufferAttribute : W.instancedBufferAttribute)(attr, 'vec4')
    entradas = { tex: W.texture(textura), a: no(atributos.animA), b: no(atributos.animB) }
    return entradas
  }

  // p: nó da posição de entrada (vec3). Devolve { posicao, normal } já animados, no espaço do boneco (a cópia
  // entra depois). normal só é montada se alguém ler (a sombra não precisa).
  const deslocamento = (W, p) => {
    const { vec4, mat3, mat4, ivec2, int, mix, normalize, attribute } = W
    const { tex, a, b } = entradasDe(W)
    // o osso do vértice, como o skinning() do three lê (three.webgpu.js:19473)
    const osso = int(attribute('skinIndex', 'uvec4').x)
    // mat4 com as 4 colunas do osso na linha dada: texel (osso * 4 + c, linha), a mesma forma do
    // getBoneTextureMatrices (three.webgpu.js:19267-19285): load(ivec2) em nível 0
    const matriz = (linha) => {
      const x = osso.mul(4)
      return mat4(
        tex.load(ivec2(x, linha)),
        tex.load(ivec2(x.add(1), linha)),
        tex.load(ivec2(x.add(2), linha)),
        tex.load(ivec2(x.add(3), linha)),
      ).toVar()
    }
    const mA1 = matriz(int(a.x))
    const mA2 = matriz(int(a.y))
    const mB1 = matriz(int(b.x))
    const mB2 = matriz(int(b.y))
    const p4 = vec4(p, 1.0)
    const pA = mix(mA1.mul(p4), mA2.mul(p4), a.z)
    const pB = mix(mB1.mul(p4), mB2.mul(p4), b.z)
    const posicao = mix(pB, pA, a.w).xyz
    return {
      posicao,
      get normal() {
        // mat3(m) do GLSL: as três primeiras colunas (o WGSL não converte mat4 em mat3 direto)
        const m3 = (m) => mat3(m.element(0).xyz, m.element(1).xyz, m.element(2).xyz)
        const n = W.vec3(W.normalLocal)
        const nA = mix(m3(mA1).mul(n), m3(mA2).mul(n), a.z)
        const nB = mix(m3(mB1).mul(n), m3(mB2).mul(n), b.z)
        return normalize(mix(nB, nA, a.w))
      },
    }
  }

  material.userData.tsl = {
    nome: 'atores-vat',
    // passe principal: o arcane-tsl.js atribui o retorno a positionLocal antes da cópia (instMat) e lê normalLocal
    // logo depois, então a normal animada tem de ser gravada aqui
    posicao({ W }) {
      const { posicao, normal } = deslocamento(W, W.positionLocal)
      W.normalLocal.assign(normal)
      return posicao
    },
    // passe de sombra: o três põe este nó em material.positionNode e o aplica por último no setupPosition da
    // sombra (three.webgpu.js:22339-22342), DEPOIS do instance() dele, e sobrescreve positionLocal. O instance()
    // fica inócuo, então o nó tem de devolver a posição FINAL da cópia: pose da textura e matriz da instância
    // (a mesma matrizInstancia do passe principal, do arcane-tsl.js). Parte da posição crua do atributo, porque
    // aqui positionLocal já veio com a instância aplicada.
    posicaoSombra({ W }) {
      const { Fn, vec4 } = W
      return Fn((_, builder) => matrizInstancia(W, builder.object).no
        .mul(vec4(deslocamento(W, W.positionGeometry).posicao, 1.0)).xyz)()
    },
  }
  return material
}
