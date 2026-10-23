const m = window.maresia
const { VISTAS } = await import('/src/mundo/marcos1932/vistas.js')
const { pontoNaRua } = await import('/src/mundo/casario1932.js')
const v = VISTAS.colunaHora
m.cfg.tempo.pausado = true
m.cfg.fatia.travar = false
m.controle.pausado = true
m.cfg.tempo.hora = 10.5
m.passo(1 / 60, false)
const P = new m.cena.position.constructor()
let melhor = null
for (const r of m.pessoas.registro) {
  if (r.estado !== 'andar' || !r.rua || Math.abs(r.vel) < 1.0) continue
  P.setFromMatrixPosition(r.matriz)
  const d = Math.hypot(P.x - v.x, P.z - v.z)
  if (!melhor || d < melhor[0]) melhor = [d, r]
}
const r = melhor[1]
P.setFromMatrixPosition(r.matriz)
m.irPara(P.x, P.z, 0, 10.5)
m.jogador.p.raiz.visible = false
m.cfg.camera.distancia = 4.5
m.cam.pitch = 0.05
m.cam.iniciado = false
if (document.querySelector('.lil-gui') && getComputedStyle(document.querySelector('.lil-gui')).display !== 'none') dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyH' }))
const res = await m.gravar({ nome: 'NOME_VIDEO', segundos: 6, fps: 30, roteiro: (t, mm) => {
  P.setFromMatrixPosition(r.matriz)
  mm.jogador.pos.set(P.x, P.y, P.z)
  mm.jogador.vel.set(0, 0, 0)
  mm.jogador.p.raiz.visible = false
  // a câmera do lado da rua (o contrário da normal que leva à calçada): de lado para quem anda
  const [, , nx, nz] = pontoNaRua(r.r, r.t)
  mm.cam.yaw = Math.atan2(-nx, -nz)
} })
return { ...res, d: melhor[0], vel: r.vel }
