const m = window.maresia
m.cfg.fatia.travar = false
m.controle.pausado = true
m.cfg.tempo.pausado = true
const { VISTAS } = await import('/src/mundo/marcos1932/vistas.js')
const v = VISTAS.colunaHora
const f = m.urubu.lugares.filaDaCozinha
const dx = f.fim.x - f.x, dz = f.fim.z - f.z, n = Math.hypot(dx, dz)
const lugares = { coluna: [v.x, v.z, v.yaw, 16.5], cozinha: [f.x + dx * 0.25, f.z + dz * 0.25, Math.atan2(dz / n, -dx / n) + Math.PI, 10] }
const RE = /^(pessoas|atores|urubu-(gente|povo|funcionario|guarda|noite))/
const passo = () => { if (m.webgpu) m.renderer._nodes.nodeFrame.update(); m.passo(1 / 60) }
const res = {}
for (const [nome, [x, z, yaw, hora]] of Object.entries(lugares)) {
  m.irPara(x, z, yaw, hora)
  for (let k = 0; k < 40; k++) passo()
  const g = {}
  m.cena.traverse((o) => {
    if (!RE.test(o.name) || !o.visible || !o.geometry) return
    let vis = true; for (let p = o; p; p = p.parent) if (!p.visible) vis = false
    if (!vis) return
    const k = o.name + (o.userData.nivel ? ':' + o.userData.nivel : '')
    const t = (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3
    const c = o.isInstancedMesh ? o.count : 1
    g[k] ||= { malhas: 0, copias: 0, tri: 0, vert: 0 }
    g[k].malhas++; g[k].copias += c; g[k].tri += t * c; g[k].vert += o.geometry.attributes.position.count * c
  })
  for (const k in g) g[k].tri = Math.round(g[k].tri)
  const tot = { malhas: 0, tri: 0, vert: 0 }
  for (const k in g) { tot.malhas += g[k].malhas; tot.tri += g[k].tri; tot.vert += g[k].vert }
  res[nome] = tot
}
m.controle.pausado = false
return res
