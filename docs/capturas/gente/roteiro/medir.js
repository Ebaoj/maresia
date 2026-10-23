const m = window.maresia
m.cfg.fatia.travar = false
const { VISTAS } = await import('/src/mundo/marcos1932/vistas.js')
const v = VISTAS.colunaHora
const f = m.urubu.lugares.filaDaCozinha
const dx = f.fim.x - f.x, dz = f.fim.z - f.z, n = Math.hypot(dx, dz)
const lugares = [[v.x, v.z, v.yaw, 16.5], [f.x + dx * 0.25, f.z + dz * 0.25, Math.atan2(dz / n, -dx / n) + Math.PI, 10]]
const RE = /^(pessoas|atores|urubu-(gente|povo|funcionario|guarda))/
const variantes = {
  base: () => {},
  semGente: (mm) => {
    const esc = []
    // a multidão (depois de 22/10) religa as próprias malhas: congela enquanto mede sem a gente
    const md = mm.pessoas.multidao
    const mdA = md && md.atualizar
    if (md) md.atualizar = () => false
    mm.cena.traverse((o) => { if (RE.test(o.name) && o.visible) { o.visible = false; esc.push(o) } })
    const at = mm.atores()
    const ant = at && at.atualizar
    if (at) { at.atualizar = () => {}; for (const a of at.atores) if (a.raiz) { a.raizVis = a.raiz.visible; a.raiz.visible = false } }
    mm.urubu.parado = true
    return () => { if (md) md.atualizar = mdA; for (const o of esc) o.visible = true; if (at) { at.atualizar = ant; for (const a of at.atores) if (a.raiz) a.raiz.visible = a.raizVis } mm.urubu.parado = false; mm.urubu.reavaliar() }
  },
}
return await m.medir({ lugares, variantes, repeticoes: 5 })
