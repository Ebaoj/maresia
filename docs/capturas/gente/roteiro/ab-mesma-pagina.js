// no mesmo quadro de página: com a gente e sem ela, alternado 6 vezes, nos dois lugares da medição (ms por quadro)
const m = window.maresia
m.cfg.fatia.travar = false
m.controle.pausado = true
m.cfg.tempo.pausado = true
const { VISTAS } = await import('/src/mundo/marcos1932/vistas.js')
const v = VISTAS.colunaHora
const f = m.urubu.lugares.filaDaCozinha
const dx = f.fim.x - f.x, dz = f.fim.z - f.z, n = Math.hypot(dx, dz)
const lugares = { coluna: [v.x, v.z, v.yaw, 16.5], cozinha: [f.x + dx * 0.25, f.z + dz * 0.25, Math.atan2(dz / n, -dx / n) + Math.PI, 10] }
const RE = /^(pessoas|atores|urubu-(gente|povo|funcionario|guarda))/
const passo = () => { if (m.webgpu) m.renderer._nodes.nodeFrame.update(); m.passo(1 / 60) }
const vez = (q) => { const t0 = performance.now(); for (let i = 0; i < q; i++) passo(); return (performance.now() - t0) / q }
const esconder = () => {
  const esc = []
  m.cena.traverse((o) => { if (RE.test(o.name) && o.visible) { o.visible = false; esc.push(o) } })
  const md = m.pessoas.multidao, mdA = md && md.atualizar; if (md) md.atualizar = () => false
  const at = m.atores(), atA = at && at.atualizar; if (at) at.atualizar = () => {}
  m.urubu.parado = true
  return () => { for (const o of esc) o.visible = true; if (md) md.atualizar = mdA; if (at) at.atualizar = atA; m.urubu.parado = false; m.urubu.reavaliar() }
}
const med = (l) => +[...l].sort((a, b) => a - b)[l.length >> 1].toFixed(2)
const res = {}
for (const [nome, [x, z, yaw, hora]] of Object.entries(lugares)) {
  m.irPara(x, z, yaw, hora)
  for (let i = 0; i < 40; i++) passo()
  const com = [], sem = []
  // depois de cada troca, 10 quadros sem contar: a sombra dos parados em cache se refaz quando algo registrado aparece ou some
  for (let k = 0; k < 6; k++) { vez(10); com.push(vez(30)); const d = esconder(); vez(10); sem.push(vez(30)); d() }
  res[nome] = { com: med(com), sem: med(sem), gente: +(med(com) - med(sem)).toFixed(2) }
}
m.controle.pausado = false
return res
