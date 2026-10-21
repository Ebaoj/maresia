// Os marcos do centro de 1932 (Praça do Ferreira reformada com a Coluna da Hora; Majestic, Cine Moderno e Hotel
// Excelsior em volta dela; Praça dos Leões; Mercado de Ferro na Praça Carolina). Um arquivo por marco; aqui só
// a ligação: materiais, mobiliário em comum (lampiões, bancos), o detalhe que some de longe e o relógio.
//
// Entra no main.js depois da cidade (as casas já sabem pular as pegadas, pegadas.js) e antes da cenografia (as
// lanternas dos marcos entram no mapa de luz dos lampiões a gás).

import { criarMateriais } from './materiais.js'
import { Mobilia } from './mobiliario.js'
import { criarPracaReforma } from './praca-reforma.js'
import { criarExcelsior } from './excelsior.js'
import { criarCinemas } from './cinemas.js'
import { criarLeoes } from './leoes.js'
import { criarMercado } from './mercado.js'

// cada marco: [chave do cfg.marcos que liga, função que monta]. As funções devolvem { grupos, atualizar? }
const MARCOS = [
  ['pracaReforma', criarPracaReforma],
  ['excelsior', criarExcelsior],
  ['cinemas', criarCinemas],
  ['leoes', criarLeoes],
  ['mercado', criarMercado],
]

export function criarMarcosCentro(cena, cfg) {
  const vazio = { lampioes: [], bancos: [], grupos: {}, atualizar() {} }
  if (!cfg.marcos?.ligados) return vazio
  const { mats, atualizar: atualizarMats } = criarMateriais(cfg)
  const mobilia = new Mobilia()
  const grupos = {}
  const vivos = []
  for (const [chave, montar] of MARCOS) {
    if (cfg.marcos[chave] === false) continue
    const r = montar(cena, cfg, mats, mobilia)
    grupos[chave] = r.grupos
    if (r.atualizar) vivos.push(r.atualizar)
  }
  mobilia.montar(cena, mats)
  const detalhes = []
  for (const lista of Object.values(grupos)) {
    for (const g of lista) {
      g.updateMatrixWorld(true)
      g.traverse((o) => { if (o.isMesh && o.userData.detalhe) detalhes.push([o, o.geometry.boundingSphere.clone().applyMatrix4(o.matrixWorld)]) })
    }
  }
  let ultimo = 0
  return {
    lampioes: mobilia.luzes,
    bancos: mobilia.bancos,
    grupos,
    atualizar(camera) {
      atualizarMats()
      for (const f of vivos) f()
      // o detalhe miúdo (balaústres, flores, ferragens) some de longe: confere a cada ~0,5 s
      const agora = performance.now()
      if (!camera || agora - ultimo < 500) return
      ultimo = agora
      const lim2 = cfg.marcos.distDetalhe ** 2
      for (const [m, s] of detalhes) {
        const dx = camera.position.x - s.center.x
        const dz = camera.position.z - s.center.z
        const d = Math.max(0, Math.hypot(dx, dz) - s.radius)
        const longe = d * d > lim2
        if (m.visible === longe) m.visible = !longe
      }
    },
  }
}
