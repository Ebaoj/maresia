// Encaixe da roupa na pele e confiança na medição de profundidade.
//
// O que este teste segura: o pano do Jolt tem um limite de distância (a folga) a partir do lugar
// onde nasce. Se um pedaço nasce dentro da pele, o limite tem de alcançar a profundidade, senão o
// solver puxa o pano de volta para dentro do corpo e a roupa atravessa a pele.
//
// A medição de dentro/fora NÃO pode sair da normal da face: o winding do corpo é misto (parte das
// faces aponta para dentro) e o sinal pela normal mentia. No corpo do neto v5, o método antigo
// dizia que a camisa nascia fora da pele (zero ponto dentro) e o pano de trás nascia de fato uns
// 1,8 cm dentro; no corpo que o jogo carrega (neto-vestido) os dois métodos concordam.
//
// Contratos:
//   1. no modelo do jogo, a roupa nasce sobre a pele (não enterrada);
//   2. no corpo do neto v5, a medição acha a parede de trás da camisa dentro da pele (o método
//      antigo via zero aqui, e é o que este teste segura);
//   3. um ponto fora do corpo é medido como fora;
//   4. o limite de distância do pano cobre a profundidade, mais a folga.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import * as T from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { criarMedidorDeProfundidade, limiteDoPonto, limitesDoPano, montarProxy, regrasCamisa, TAMANHO_CELULA } from '../../src/jogador/roupa.js'
import { PADRAO } from '../../src/config.js'

const MODELO_JOGO = new URL('../../arte/finais/neto-vestido.glb', import.meta.url)
const MODELO_V5 = new URL('../../arte/finais/neto-v5-jolt.glb', import.meta.url)
const temJogo = existsSync(fileURLToPath(MODELO_JOGO))
const temV5 = existsSync(fileURLToPath(MODELO_V5))

// carrega o modelo sem as texturas: é o mesmo truque da medição, e é 20x mais rápido
async function carregarModelo (url) {
  const bytes = await fs.readFile(url)
  const jl = bytes.readUInt32LE(12)
  const j = JSON.parse(bytes.subarray(20, 20 + jl).toString())
  delete j.images; delete j.textures; delete j.samplers
  j.materials = j.materials?.map(m => ({ name: m.name }))
  delete j.extensionsUsed; delete j.extensionsRequired
  const raw = Buffer.from(JSON.stringify(j)); const pad = (4 - raw.length % 4) % 4
  const json = Buffer.concat([raw, Buffer.alloc(pad, 32)]); const bin = bytes.subarray(20 + jl)
  const rebuilt = Buffer.alloc(20 + json.length + bin.length)
  bytes.copy(rebuilt, 0, 0, 12); rebuilt.writeUInt32LE(rebuilt.length, 8); rebuilt.writeUInt32LE(json.length, 12)
  rebuilt.writeUInt32LE(0x4e4f534a, 16); json.copy(rebuilt, 20); bin.copy(rebuilt, 20 + json.length)
  const { scene } = await new GLTFLoader().parseAsync(rebuilt.buffer.slice(rebuilt.byteOffset, rebuilt.byteOffset + rebuilt.byteLength), '')
  const pecas = []
  scene.traverse(o => { if (o.isMesh) pecas.push({ nome: o.name || '', malha: o }) })
  return {
    corpo: pecas.find(p => /camisa|calca/i.test(p.nome) === false)?.malha,
    camisas: pecas.filter(p => /camisa/i.test(p.nome)).map(p => p.malha),
    calca: pecas.find(p => /calca/i.test(p.nome))?.malha,
  }
}

describe.skipIf(!temJogo)('encaixe da roupa na pele', () => {
  it('no modelo do jogo a roupa nasce sobre a pele, não enterrada nela', async () => {
    const { corpo, camisas } = await carregarModelo(MODELO_JOGO)
    const medir = criarMedidorDeProfundidade(corpo)
    let pior = 0
    for (const camisa of camisas) for (const d of medir(camisa.geometry)) pior = Math.max(pior, d)
    // no modelo que o jogo carrega o pano nasce a 0,1 mm da pele; 2 cm é a margem de guarda
    expect(pior).toBeLessThan(0.02)
  })

  it('um ponto fora do corpo é medido como fora', async () => {
    const { corpo } = await carregarModelo(MODELO_JOGO)
    const medir = criarMedidorDeProfundidade(corpo)
    const fora = medir({ attributes: { position: new T.Float32BufferAttribute([0, 3, 0], 3) } })
    expect(fora[0]).toBe(0)
  })

  it('o limite de distância do pano alcança a profundidade em que o pedaço nasce dentro', async () => {
    const { corpo, camisas } = await carregarModelo(MODELO_JOGO)
    const medir = criarMedidorDeProfundidade(corpo)
    const camisa = camisas[0]
    const profundidades = medir(camisa.geometry)
    // a mesma conta que o Jolt usa: as células do pano, a regra de folga e os limites
    const proxy = montarProxy(camisa.geometry, TAMANHO_CELULA, camisa.geometry, profundidades)
    const folga = regrasCamisa(proxy.pontos, { fisica: PADRAO.personagem })
    const limites = limitesDoPano(proxy.pontos, folga, proxy.dentro)
    // para cada pedaço que nasce dentro, o limite tem de cobrir a profundidade mais a folga:
    // só assim o pano chega lá fora em vez de ser puxado de volta para dentro do corpo
    for (let i = 0; i < proxy.dentro.length; i++) {
      if (proxy.dentro[i] > 0) expect(limites[i]).toBeGreaterThanOrEqual(proxy.dentro[i] + folga(proxy.pontos[i]))
    }
    // e o limite nunca é menor que a folga: o pano tem de poder chegar lá fora
    for (let i = 0; i < limites.length; i++) expect(limites[i]).toBeGreaterThanOrEqual(limiteDoPonto(folga(proxy.pontos[i]), 0))
  })
})

describe.skipIf(!temV5)('encaixe no corpo do neto v5 (a camisa de trás nasce dentro da pele)', () => {
  it('a medição acha a parede de trás da camisa dentro da pele', async () => {
    const { corpo, camisas } = await carregarModelo(MODELO_V5)
    const medir = criarMedidorDeProfundidade(corpo)
    let dentro = 0, pior = 0
    for (const camisa of camisas) {
      const pos = camisa.geometry.attributes.position
      const profundidades = medir(camisa.geometry)
      for (let i = 0; i < pos.count; i++) {
        // o tronco: onde a parede de trás da camisa afunda na pele
        const y = pos.getY(i), x = pos.getX(i)
        if (y < 0.90 || y > 1.20 || Math.abs(x) > 0.16) continue
        if (profundidades[i] > 0) { dentro++; pior = Math.max(pior, profundidades[i]) }
      }
    }
    // o método antigo (sinal pela normal da face, winding misto) via zero aqui
    expect(dentro).toBeGreaterThan(20)
    // e a profundidade é de centímetros, não de metros: 8 cm era o que o sinal mentia
    expect(pior).toBeGreaterThan(0.005)
    expect(pior).toBeLessThan(0.08)
  })
})
