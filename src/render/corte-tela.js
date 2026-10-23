// Corte por tamanho na tela (fluido, 22/10/2026, docs/fluido-22-10.md).
//
// Com o mapa de 1932 inteiro, a vista da Coluna da Hora desenhava ~9 milhões de triângulos no passe principal, e a
// maior parte era miúdo de longe: 4.900 lampiões de coluna (264 triângulos cada) a 0,4-3 km, 5.900 vasos, 1.900
// buganvílias, dormentes, travessas do bonde, e o Campo do Urubu inteiro a 2 km (716 mil triângulos). A 1 km um
// lampião de 3,4 m tem 3 px de altura e menos de meio pixel de largura, debaixo do desfoque do fundo e do ar.
//
// Aqui cada objeto registrado diz o tamanho da peça que ele desenha (a maior medida de UMA cópia, ou da peça de uma
// malha junta). Quando a peça mais perto possível do objeto (a borda da esfera dele) fica menor que
// cfg.desempenho.cortePx pixels na tela, ele sai do desenho. A conta usa uma tela de referência de 900 px de altura
// (não a resolução do quadro): o corte não muda com a resolução dinâmica nem com a janela.
//
// Sai pela camada 0 (a do desenho), não por `visible`: os sistemas (LOD, células de muito longe, o campo) mexem em
// `visible` por conta própria e não brigam com o corte; a assinatura do cache de sombra lê `visible`, então cortar não
// refaz o mapa dos parados (e o mapa em cache continua com a sombra deles, que nem chega perto do jogador).
// Desliga ao vivo: cfg.desempenho.cortePequenos = false.

const ALTURA_REF = 900
const lista = [] // { o, x, y, z, r, tam, fora }
let ultimo = null
let ligadoAntes = null
let pxAntes = null

// tam: a maior medida da peça (m). Sem tam: a maior medida da geometria (uma cópia, no caso de InstancedMesh)
export function registrarCorte(o, { tam = null } = {}) {
  if (!o || !o.geometry) return o
  if (tam === null) {
    const g = o.geometry
    if (!g.boundingBox) g.computeBoundingBox()
    const b = g.boundingBox
    tam = Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z)
    // a escala da primeira cópia (as cópias de uma família têm a mesma ordem de tamanho)
    if (o.isInstancedMesh && o.count > 0) {
      const a = o.instanceMatrix.array
      tam *= Math.max(Math.hypot(a[0], a[1], a[2]), Math.hypot(a[4], a[5], a[6]), Math.hypot(a[8], a[9], a[10]))
    }
  }
  lista.push({ o, x: 0, y: 0, z: 0, r: -1, tam, fora: false })
  return o
}

function esfera(e) {
  const o = e.o
  o.updateWorldMatrix(true, false)
  const s = o.isInstancedMesh ? (o.boundingSphere || (o.computeBoundingSphere(), o.boundingSphere)) : (o.geometry.boundingSphere || (o.geometry.computeBoundingSphere(), o.geometry.boundingSphere))
  const c = s.center.clone().applyMatrix4(o.matrixWorld)
  const el = o.matrixWorld.elements
  const esc = Math.max(Math.hypot(el[0], el[1], el[2]), Math.hypot(el[4], el[5], el[6]), Math.hypot(el[8], el[9], el[10]))
  e.x = c.x; e.y = c.y; e.z = c.z; e.r = s.radius * esc
}

function mostrar(e, sim) {
  if (sim) e.o.layers.enable(0)
  else e.o.layers.disable(0)
  e.fora = !sim
}

// todo quadro, antes de desenhar; só refaz a conta quando a câmera andou 4 m ou a chave mudou
export function atualizarCorte(camera, cfg) {
  const d = cfg.desempenho
  const ligado = d.cortePequenos !== false
  const px = d.cortePx ?? 3
  const p = camera.position
  if (ligado === ligadoAntes && px === pxAntes && ultimo && ultimo.distanceToSquared(p) < 16) return
  ligadoAntes = ligado
  pxAntes = px
  ;(ultimo ||= p.clone()).copy(p)
  // pixels por metro a 1 m, na tela de referência
  const k = (ALTURA_REF / 2) / Math.tan((camera.fov * Math.PI) / 360)
  for (const e of lista) {
    if (!ligado) { if (e.fora) mostrar(e, true); continue }
    // a malha junta pode mudar de contagem (cópias à vista); a esfera é a do começo, que cobre todas
    if (e.r < 0) esfera(e)
    const dist = Math.hypot(p.x - e.x, p.y - e.y, p.z - e.z) - e.r
    const corta = dist > 1 && (e.tam * k) / dist < px
    if (corta !== e.fora) mostrar(e, !corta)
  }
}

export function statsCorte() {
  let fora = 0
  for (const e of lista) if (e.fora) fora++
  return { registrados: lista.length, fora }
}
