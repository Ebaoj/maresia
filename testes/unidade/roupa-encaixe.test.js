// Encaixe da roupa na pele: o molde da camisa foi gerado sobre um corpo um pouco diferente do que
// está no jogo, e parte da malha nasce dentro da pele. O pano do Jolt tem um limite de distância
// (a folga): se esse limite não alcança a profundidade em que o pedaço nasce dentro, o solver puxa
// o pano de volta para dentro do corpo e a roupa atravessa a pele.
// Este teste é o que segura essa correção: sem a profundidade somada ao limite, ele falha.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import * as T from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { criarMedidorDeProfundidade, limiteDoPonto, limitesDoPano, montarProxy, regrasCamisa, TAMANHO_CELULA } from '../../src/jogador/roupa.js'
import { PADRAO } from '../../src/config.js'

const MODELO = new URL('../../arte/finais/neto-v5-jolt.glb', import.meta.url)
const temModelo = existsSync(fileURLToPath(MODELO))

// carrega o modelo sem as texturas: é o mesmo truque da medição, e é 20x mais rápido
async function carregarModelo () {
  const bytes = await fs.readFile(MODELO)
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
    camisa: pecas.find(p => /camisa/i.test(p.nome))?.malha,
    calca: pecas.find(p => /calca/i.test(p.nome))?.malha,
  }
}

describe.skipIf(!temModelo)('encaixe da roupa na pele', () => {
  it('a camisa nasce dentro da pele em menos de 10 cm (guarda do modelo)', async () => {
    const { corpo, camisa } = await carregarModelo()
    const medir = criarMedidorDeProfundidade(corpo)
    const profundidades = medir(camisa.geometry)
    const pior = Math.max(...profundidades)
    // o modelo atual nasce 8 cm dentro no tronco. Se for refeito e piorar, este teste avisa.
    expect(pior).toBeLessThan(0.10)
  })

  it('o limite de distância do pano alcança a profundidade em que o pedaço nasce dentro', async () => {
    const { corpo, camisa } = await carregarModelo()
    const medir = criarMedidorDeProfundidade(corpo)
    const profundidades = medir(camisa.geometry)
    // a mesma conta que o Jolt usa: as células do pano, a regra de folga e os limites
    const proxy = montarProxy(camisa.geometry, TAMANHO_CELULA, camisa.geometry, profundidades)
    const folga = regrasCamisa(proxy.pontos, { fisica: PADRAO.personagem })
    const limites = limitesDoPano(proxy.pontos, folga, proxy.dentro)
    // para cada pedaço que nasce dentro, o limite tem de cobrir a profundidade mais a folga:
    // só assim o pano chega lá fora em vez de ser puxado de volta para dentro do corpo
    const dentro = proxy.pontos.map((p, i) => i).filter(i => proxy.dentro[i] > 0)
    expect(dentro.length).toBeGreaterThan(0) // o modelo realmente nasce dentro; se não, o problema mudou
    for (const i of dentro) {
      expect(limites[i]).toBeGreaterThanOrEqual(proxy.dentro[i] + folga(proxy.pontos[i]))
    }
  })
})
