// Normais da forma para as esculturas esculpidas (os GLB da Praça dos Leões, esculturas.js).
//
// O modelo dizimado (24 mil triângulos, aresta de 2 a 3 cm) tem a normal de um vértice para o vizinho virando em média
// 16 a 22 graus: é o relevo miúdo da escultura e o serrilhado da dizimação, com costuras soltas. No toon pintado isso
// vira camuflagem: cada calombo cai de um lado da faixa de luz e o realce do metal (metal.js) acende em pingos
// espalhados (visto a 5 m em 22/10/2026). A escultura de ferro pintado precisa ler pela forma grande: aqui a normal de
// cada vértice vira a média das normais dos vértices num raio em metros (peso gaussiano), contando só os que olham
// para o mesmo lado (o outro lado de uma perna ou da cauda, a 4 cm, não entra: senão a normal se anulava). A
// silhueta não muda: só a normal, e a posição fica a mesma.
//
// Duas normais: a `normal` (luz e faixas do toon), alisada no raio, e a `aNormalForma` (o realce e a borda do céu do
// metal), alisada mais vezes sobre a mesma vizinhança: a forma do músculo, não a do calombo, decide onde o brilho cai.
//
// raio: metros (cfg.marcos.metalSuave); 0 deixa como veio. Roda uma vez, quando o modelo carrega: a vizinhança
// (quem está a menos de um raio de quem) sai uma vez e cada passada é só uma soma sobre ela.

// a vizinhança de cada vértice no raio, numa lista corrida: viz[ini[i] .. ini[i + 1]) com o peso da distância
export function vizinhanca(pos, raio) {
  const n = pos.length / 3
  const cel = raio
  // chave numérica da célula: duas células na mesma chave só somam pontos a conferir (a distância decide), mas a mesma
  // lista não pode ser lida duas vezes (contaria o vizinho em dobro)
  const chave = (cx, cy, cz) => ((cx * 73856093) ^ (cy * 19349663) ^ (cz * 83492791)) | 0
  const grade = new Map()
  for (let i = 0; i < n; i++) {
    const k = chave(Math.floor(pos[i * 3] / cel), Math.floor(pos[i * 3 + 1] / cel), Math.floor(pos[i * 3 + 2] / cel))
    let l = grade.get(k)
    if (!l) grade.set(k, (l = []))
    l.push(i)
  }
  const s2 = (raio / 2) * (raio / 2) * 2 // gaussiana com desvio de meio raio
  const r2 = raio * raio
  const ini = new Int32Array(n + 1)
  const viz = []
  const peso = []
  const vistas = new Set()
  for (let i = 0; i < n; i++) {
    ini[i] = viz.length
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2]
    const cx = Math.floor(x / cel), cy = Math.floor(y / cel), cz = Math.floor(z / cel)
    vistas.clear()
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      const k = chave(cx + a, cy + b, cz + c)
      if (vistas.has(k)) continue
      vistas.add(k)
      const l = grade.get(k)
      if (!l) continue
      for (const j of l) {
        const dx = pos[j * 3] - x, dy = pos[j * 3 + 1] - y, dz = pos[j * 3 + 2] - z
        const d2 = dx * dx + dy * dy + dz * dz
        if (d2 > r2) continue
        viz.push(j)
        peso.push(Math.exp(-d2 / s2))
      }
    }
  }
  ini[n] = viz.length
  return { ini, viz: Int32Array.from(viz), peso: Float32Array.from(peso) }
}

// passadas de média sobre a vizinhança, só com quem olha para o mesmo lado (peso pelo cosseno)
export function alisar(nor0, { ini, viz, peso }, passadas) {
  let nor = Float32Array.from(nor0)
  const n = ini.length - 1
  for (let p = 0; p < passadas; p++) {
    const nova = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const nx = nor[i * 3], ny = nor[i * 3 + 1], nz = nor[i * 3 + 2]
      let sx = 0, sy = 0, sz = 0
      for (let q = ini[i]; q < ini[i + 1]; q++) {
        const j = viz[q]
        const mx = nor[j * 3], my = nor[j * 3 + 1], mz = nor[j * 3 + 2]
        const lado = mx * nx + my * ny + mz * nz
        if (lado <= 0) continue
        const w = peso[q] * lado
        sx += mx * w; sy += my * w; sz += mz * w
      }
      const len = Math.hypot(sx, sy, sz)
      if (len > 0) { nova[i * 3] = sx / len; nova[i * 3 + 1] = sy / len; nova[i * 3 + 2] = sz / len } else { nova[i * 3] = nx; nova[i * 3 + 1] = ny; nova[i * 3 + 2] = nz }
    }
    nor = nova
  }
  return nor
}

// alisa a `normal` (passadas) e grava a `aNormalForma` (mais passadasForma por cima); raio 0: as duas como vieram
export function suavizarNormais(geo, raio, passadas = 2, passadasForma = 0) {
  const n0 = geo.attributes.normal.array
  if (!(raio > 0)) {
    if (passadasForma) geo.setAttribute('aNormalForma', new geo.attributes.normal.constructor(Float32Array.from(n0), 3))
    return geo
  }
  const v = vizinhanca(geo.attributes.position.array, raio)
  const n1 = alisar(n0, v, passadas)
  geo.attributes.normal.array.set(n1)
  geo.attributes.normal.needsUpdate = true
  if (passadasForma) geo.setAttribute('aNormalForma', new geo.attributes.normal.constructor(alisar(n1, v, passadasForma), 3))
  return geo
}

// o quanto a normal vira, em média, de um vértice para os vizinhos de triângulo (graus): a medida do "calombo"
export function anguloEntreVizinhos(geo, nome = 'normal') {
  const nn = geo.attributes[nome].array
  const idx = geo.index ? geo.index.array : null
  const t = idx ? idx.length : geo.attributes.position.count
  const v = (i) => (idx ? idx[i] : i)
  let ang = 0, cnt = 0
  for (let i = 0; i < t; i += 3) {
    for (const [u, w] of [[v(i), v(i + 1)], [v(i + 1), v(i + 2)], [v(i), v(i + 2)]]) {
      const d = nn[u * 3] * nn[w * 3] + nn[u * 3 + 1] * nn[w * 3 + 1] + nn[u * 3 + 2] * nn[w * 3 + 2]
      ang += Math.acos(Math.max(-1, Math.min(1, d)))
      cnt++
    }
  }
  return (ang / Math.max(cnt, 1)) * (180 / Math.PI)
}
