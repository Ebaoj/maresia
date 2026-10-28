// Troca de nível de detalhe sem "pop" (27/10/2026, docs/relatorio-visual.md 1.6 e 2.4; commit "LOD com pontilhado").
// Pega a volta de: (1) a árvore cheia trocar pela copa simples num quadro (agora, na faixa [D - w, D + w] as duas
// versões estão no desenho e o shader escolhe pelo pontilhado preso ao mundo, complementar: nenhum fragmento some
// nem fica duas vezes); (2) as células de muito longe trocarem de nível a cada passo da câmera na divisa (sem
// histerese); (3) a casa detalhada e a caixa sem o recorte complementar; (4) o ruído da faixa de luz sem filtro.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { registrarLod, atualizarLodArvores } from '../../src/mundo/lod-arvores.js'
import { MuitoLonge, LOD_COPIAS, HISTERESE, definirMuitoLonge } from '../../src/mundo/muito-longe.js'
import { glslRecorte, fracaoFaixa, sorteioCelula, distanciaBloco, faixasDissolver } from '../../src/render/dissolver.js'

describe('pontilhado preso ao mundo', () => {
  it('perto e longe são complementares: em cada fragmento exatamente uma das duas fica', () => {
    const faixa = [90, 8, 0.05]
    for (let k = 0; k < 400; k++) {
      const p = [4000 + k * 0.37, 3 + (k % 7) * 0.11, 2000 - k * 0.23]
      const a = fracaoFaixa(faixa, 80 + k * 0.05)
      const h = sorteioCelula(p, 0.05)
      const perto = h >= a, longe = h < a
      expect(perto !== longe).toBe(true)
    }
    // fora da faixa só uma versão: antes de D - w a de perto inteira, depois de D + w a de longe inteira
    expect(fracaoFaixa(faixa, 81)).toBe(0)
    expect(fracaoFaixa(faixa, 99)).toBe(1)
    // o GLSL descarta o lado oposto
    expect(glslRecorte(-1, 'copia')).toMatch(/if \(hD < aD\) discard/)
    expect(glslRecorte(1, 'copia')).toMatch(/if \(hD >= aD\) discard/)
    expect(glslRecorte(1, 'bloco')).toMatch(/floor\(vAncoraD\.xz \/ uDissolveFaixa\.w\)/)
  })

  it('a distância do modo bloco é a do retângulo do bloco (a mesma conta das casas)', () => {
    expect(distanciaBloco(96, [10, 0, 10], [50, 0, 50])).toBe(0)
    expect(distanciaBloco(96, [10, 0, 10], [196, 0, 50])).toBe(100)
  })

  it('árvores: na faixa a cópia está nas duas listas; fora dela, só numa; nenhuma some', () => {
    const cena = new THREE.Scene()
    const geo = new THREE.BoxGeometry(2, 6, 2)
    const xs = [20, 70, 84, 90, 96, 110, 160]
    const mk = () => {
      const im = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial(), xs.length)
      xs.forEach((x, i) => im.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 0, 0)))
      cena.add(im)
      return im
    }
    const perto = mk(), longe = mk()
    cena.updateMatrixWorld(true)
    registrarLod([perto], [longe])
    const cam = new THREE.PerspectiveCamera(50)
    cam.position.set(0, 0, 0)
    const cfg = { arvores: { lodBloco: 90, lodDissolve: 8, lodCopia: true }, mundo: { dissolveCelula: 0.05 } }
    atualizarLodArvores(cam, cfg)
    const lista = (m) => Array.from({ length: m.count }, (_, j) => { const t = new THREE.Matrix4(); m.getMatrixAt(j, t); return new THREE.Vector3().setFromMatrixPosition(t).x }).sort((a, b) => a - b)
    const lp = lista(perto), ll = lista(longe)
    // faixa [82, 98] mais a margem de 6 m da câmera que anda até refazer as listas
    expect(lp).toEqual([20, 70, 84, 90, 96])
    expect(ll).toEqual([84, 90, 96, 110, 160])
    for (const x of xs) expect(lp.includes(x) || ll.includes(x)).toBe(true)
    expect(faixasDissolver.arvores.value.x).toBe(90)
    expect(faixasDissolver.arvores.value.y).toBe(8)
  })
})

describe('células de muito longe com histerese', () => {
  const montar = (x0) => {
    definirMuitoLonge({ desempenho: { cortePx: 3, muitoLonge: true } })
    LOD_COPIAS.ligado = true
    const s = new THREE.Scene()
    const geo = new THREE.SphereGeometry(5, 64, 32) // peça de 10 m
    const mat = new THREE.MeshBasicMaterial()
    const ml = new MuitoLonge(s, { tam: 4000 })
    // duas cópias (célula de uma só não junta): a de teste e outra bem longe
    for (const x of [x0, 3000]) {
      const im = new THREE.InstancedMesh(geo, mat, 1)
      im.setMatrixAt(0, new THREE.Matrix4().makeTranslation(x, 0, 0))
      s.add(im)
      ml.adicionar({ x, z: 0, r: 5, longe: [im], todas: [im], distancia: (c) => Math.abs(c.position.x - x) - 5, retomar: () => { im.visible = true } })
    }
    ml.montar()
    const cam = new THREE.PerspectiveCamera(50)
    ml.atualizar(cam, 10)
    return { ml, cam, f: ml.lista.find((x) => x.familias.length).familias[0] }
  }
  const dCheia = (10 * 450 / Math.tan((50 * Math.PI) / 360)) / LOD_COPIAS.px

  it('a cópia na divisa não troca de nível a cada vaivém da câmera', () => {
    // a cópia começa 11 m além da divisa da cheia (d = distância do centro - 5)
    const { ml, cam, f } = montar(dCheia + 5 + 11)
    expect(f.cheia.count).toBe(0)
    // a câmera vai e volta 13 m (passa da divisa por 2 m): sem histerese a cópia trocava nas duas vezes
    for (let k = 0; k < 3; k++) {
      cam.position.x = 13
      ml.atualizar(cam, 10)
      expect(f.cheia.count).toBe(0)
      cam.position.x = 0
      ml.atualizar(cam, 10)
      expect(f.cheia.count).toBe(0)
    }
  })

  it('refaz as listas a cada 4 m andados (eram 12: as trocas de 12 m saíam juntas)', () => {
    const { ml, cam, f } = montar(dCheia / (1 + HISTERESE) + 5 + 2 + 25)
    cam.position.x = 25 // a 2 m da divisa de volta (com a histerese, ainda simples)
    ml.atualizar(cam, 10)
    expect(f.cheia.count).toBe(0)
    cam.position.x = 29.5 // 4,5 m depois: refaz e passa a divisa de volta
    ml.atualizar(cam, 10)
    expect(f.cheia.count).toBe(1)
  })
})

describe('casas e ruído da faixa de luz', () => {
  const ler = (a) => readFileSync(new URL(`../../src/${a}`, import.meta.url), 'utf8')
  it('a casa detalhada é a versão de perto e a caixa (só com a detalhada montada) a de longe, no modo bloco', () => {
    expect(ler('mundo/quarteirao.js')).toMatch(/marcarDissolver\(m, -1, faixasDissolver\.casas, 'bloco'\)/)
    expect(ler('mundo/cidade.js')).toMatch(/marcarDissolver\(materialPredio\(opcCas\), 1, faixasDissolver\.casas, 'bloco'\)/)
  })
  it('cada oitava da pincelada some antes de passar de meia volta por pixel, GLSL e TSL; a borda da faixa nunca mais fina que um pixel', () => {
    const glsl = ler('materiais.js'), tsl = ler('render/arcane-tsl.js')
    expect(glsl).toMatch(/oitavaAA\(vec2 q, vec2 fw\)/)
    expect(glsl).toMatch(/float suaveA = max\(uArcSuave, fwidth\(tA\)\)/)
    expect(tsl).toMatch(/const fw = fwidth\(uv\)/)
    expect(tsl).toMatch(/const suaveA = max\(suave, W\.fwidth\(tA\)\)/)
  })
})
