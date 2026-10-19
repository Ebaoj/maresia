// KAN-73: o gerador da cidade de estresse (sem navegador: a bancada e o script que prepara a geometria usam o mesmo)
import { criarAleatorio } from '../utils.js'

export const X0 = -5000, X1 = 5000, Z1 = 4000
export const QUARTEIRAO = 100, RUA = 12
export const CORES = ['#efe6d2', '#f2ebdc', '#f4eee2', '#e9dfc8', '#e8c9a0', '#cfe0d8', '#e7b9a4', '#d9b8c4', '#c9d6c2', '#e3d3a8']

// densidade por região (0 a 1): centro de 1932 cheio, Jacarecanga e Praia de Iracema médios, oeste ralo
// altura do chão para o teste de terreno (T5): dunas só no oeste ralo e no fundo da cidade, centro plano
export function altura(x, z) {
  const dunas = Math.min(1, Math.max(0, (-x - 1500) / 2000) + Math.max(0, (z - 3000) / 800))
  return dunas * (4 * Math.sin(x * 0.004) + 3 * Math.sin(z * 0.006 + 1) + 1.5 * Math.sin((x + z) * 0.011) + 8.5)
}

// Malha única do relevo: a vg corta por clusters, sem uma chamada de desenho por pedaço do chão.
// A bancada e scripts/preparar-geometria.mjs usam a mesma forma e a mesma grade.
export const LADO_TERRENO = 1000
// O relevo mais curto tem ~570 m de comprimento de onda. Passo de 15,625 m representa essa forma
// com ~36 amostras por onda, sem os quatro vezes mais triângulos da grade de 128 segmentos.
export const SEG_TERRENO = 64
export function geometriaTerreno(THREE) {
  const largura = X1 - X0 + 2 * LADO_TERRENO, profundidade = Z1 + LADO_TERRENO
  const geo = new THREE.PlaneGeometry(largura, profundidade, largura / LADO_TERRENO * SEG_TERRENO, profundidade / LADO_TERRENO * SEG_TERRENO)
    .rotateX(-Math.PI / 2).translate((X0 + X1) / 2, 0, profundidade / 2)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) pos.setY(i, altura(pos.getX(i), pos.getZ(i)))
  geo.computeVertexNormals()
  return geo
}

export function densidade(x, z) {
  const centro = Math.exp(-(((x - 2600) / 1500) ** 2)) // centro antigo
  const iracema = 0.55 * Math.exp(-(((x - 4300) / 600) ** 2))
  const jacarecanga = 0.6 * Math.exp(-(((x - 600) / 1200) ** 2))
  const oeste = 0.18
  return Math.min(1, Math.max(oeste, centro, iracema, jacarecanga)) * (z < 2600 ? 1 : 0.5)
}

export function gerarCidade({ N_CASAS, N_ARVORES, N_COQUEIROS, FRAC_SIMPLES = null }) {
  const rnd = criarAleatorio(1604)
  const lotes = []
  // quarteirões em grade; cada um com casas nos quatro lados, fachada para a rua
  const cand = []
  for (let x = X0; x < X1; x += QUARTEIRAO + RUA) for (let z = 80; z < Z1; z += QUARTEIRAO + RUA) cand.push([x, z])
  // peso por densidade, até chegar no número de casas pedido
  const ordem = cand.map(([x, z]) => ({ x, z, p: densidade(x + QUARTEIRAO / 2, z + QUARTEIRAO / 2) * rnd.proximo() })).sort((a, b) => b.p - a.p)
  const postes = []
  const bancos = []
  for (const qd of ordem) {
    if (lotes.length >= N_CASAS) break
    // postes de madeira na beira da rua norte e oeste do quarteirão, um a cada ~30 m; dois bancos na calçada
    for (let t = 15; t < QUARTEIRAO; t += 30) { postes.push([qd.x + t, qd.z - 3.5]); postes.push([qd.x - 3.5, qd.z + t]) }
    bancos.push([qd.x + 30, qd.z - 2, 0], [qd.x + 70, qd.z + QUARTEIRAO + 2, Math.PI])
    const simples = FRAC_SIMPLES === null ? densidade(qd.x, qd.z) < 0.3 : rnd.proximo() < FRAC_SIMPLES
    // norte e sul ocupam o quarteirão de ponta a ponta; leste e oeste ficam entre eles (sem invadir as esquinas)
    const lados = [
      { frente: [0, -1], de: 6, ate: QUARTEIRAO - 6, ao: (t) => [qd.x + t, qd.z + 5] },
      { frente: [0, 1], de: 6, ate: QUARTEIRAO - 6, ao: (t) => [qd.x + t, qd.z + QUARTEIRAO - 5] },
      { frente: [-1, 0], de: 12, ate: QUARTEIRAO - 12, ao: (t) => [qd.x + 5, qd.z + t] },
      { frente: [1, 0], de: 12, ate: QUARTEIRAO - 12, ao: (t) => [qd.x + QUARTEIRAO - 5, qd.z + t] },
    ]
    for (const lado of lados) {
      let t = lado.de
      const deLado = lado.frente[0] !== 0 // fachada para x: a largura do lote corre em z (casa() usa it.d como fachada)
      while (t < lado.ate && lotes.length < N_CASAS) {
        const w = rnd.entre(6, 10)
        if (t + w > lado.ate) break
        if (rnd.proximo() < densidade(qd.x, qd.z) + 0.25) {
          const [x, z] = lado.ao(t + w / 2)
          const largura = deLado ? { w: 10, d: w } : { w, d: 10 }
          lotes.push({ it: { x, z, ...largura, frente: lado.frente, rot: 0, cor: rnd.escolha(CORES), chao: altura(x, z), y: altura(x, z), h: simples ? rnd.entre(2.9, 3.6) : 5 }, simples })
        }
        t += w
      }
    }
  }
  // árvores: mais onde é ralo e nos quintais; coqueiros na faixa da praia e espalhados
  const arvores = []
  for (let i = 0; i < N_ARVORES; i++) {
    const x = rnd.entre(X0, X1)
    const z = rnd.entre(30, Z1)
    if (rnd.proximo() < densidade(x, z) * 0.6) { i--; continue }
    arvores.push([x, z, rnd.entre(0.85, 1.2), rnd.proximo()])
  }
  const coqueiros = []
  for (let i = 0; i < N_COQUEIROS; i++) {
    const praia = rnd.chance(0.7)
    coqueiros.push([rnd.entre(X0, X1), praia ? rnd.entre(5, 70) : rnd.entre(70, Z1), rnd.entre(0.85, 1.2)])
  }
  return { lotes, arvores, coqueiros, postes, bancos }
}

