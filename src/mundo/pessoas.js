// Gente na cidade: figuras genéricas e originais, de pé, sentadas na areia ou caminhando
// no calçadão. Quem caminha balança "em 2", como o resto da animação.

import * as THREE from 'three'
import { fichasDaCidade, figuraLod } from './gente-figurino.js'
import { criarMultidao } from './multidao.js'
import { linhaCosta, larguraPraia, pesos, NIVEL_CIDADE, LARG_CALCADAO, rioX, RIO_MEIA_LARGURA } from './mapa.js'
import { trechosJogo, VILAS } from './fortaleza1932.js'
import { RUAS, comprimentoRua, pontoNaRua } from './casario1932.js'
import { eraRua1932, distCosta } from './mapa.js'
import { alturaChao } from './colisao.js'
import { alturaTerreno } from './terreno.js'
import { toonVertice } from '../materiais.js'
import { ocupacao } from './ocupacao.js'
import { criarAleatorio } from '../utils.js'
import { CONTORNO as CONTORNO_PRACA, dentroDaPraca } from './praca1932.js'
import { PEGADA, dentroDeMarco } from './marcos1932/pegadas.js'
import { naGrade } from './marcos1932/grade.js'
import { PEGADAS as LOTES } from './lotes-marcos.js'
import { distRealDaPraca } from './chao1932.js'
import { noCorredor, pertoDeVista } from './frente1932.js'

const rnd = criarAleatorio(808)

// 1932 (fotos de 1925 a 1936 e docs/figurino.md): terno e camisa de linho branco ou creme, algodãozinho "cor de couro"
// (mangue, murici), vestidos claros e compridos, chapéu de palha na maioria; elenco diverso, como a Fortaleza da época.
// As fichas e o corpo: gente-figurino.js e gente-corpo.js (22/10/2026, docs/gente-22-10.md); cada ficha tem a figura de
// perto e a de longe, e multidao.js põe cada pessoa na certa pela distância da câmera (cfg.pessoas.lodPerto).

export function criarPessoas(cena, grade, cfg = null) {
  // os sorteios das fichas saem do rnd da cidade na ordem da figura antiga: quem fica onde continua igual
  const fichas = fichasDaCidade(rnd)
  const mat = toonVertice({ opacity: 0.85, blending: THREE.NoBlending }) // alfa 0,85: o filtro reconhece gente
  const multidao = criarMultidao(cena, mat, { nome: 'pessoas', lodPerto: cfg?.pessoas?.lodPerto ?? 20, ate: cfg?.pessoas?.ate ?? 400, controlaVisivel: true })
  const novoTipo = (fig, sentada = false) => { const t = multidao.tipo(figuraLod(fig, { sentado: sentada })); t.fig = fig; t.sentada = sentada; return t }
  const emPe = fichas.pe.map((f) => novoTipo(f))
  const sentadas = fichas.sentadas.map((f) => novoTipo(f, true))
  // criança só nos grupos parados: quem anda (e vira ator animado, que tem corpo de adulto) é adulto
  const adultos = emPe.filter((t) => !t.fig.crianca)
  const adulto = (t) => (t.fig.crianca ? adultos[emPe.indexOf(t) % adultos.length] : t)
  const andando = []
  // registro de todo mundo de pé (parado ou andando), para os atores animados (atores.js) ocuparem o
  // lugar dos mais próximos do jogador
  const registro = []
  const deFigura = (t, m) => registro.push(multidao.adicionar(t, m, { estado: 'parado' }))

  const longeDoRio = (x, z) => Math.abs(x - rioX(z)) > RIO_MEIA_LARGURA * 2
  // gente nas vilas de jangadeiros e na Praia Formosa (perto do porto)
  const trechos = [...VILAS, 'praiaFormosa'].map((k) => trechosJogo[k])
  const xPraia = () => { const [a, b] = rnd.escolha(trechos); return rnd.entre(a, b) }

  // caminhando no calçadão, cada um num trecho, indo e voltando
  for (let i = 0; i < 24; i++) {
    const x = xPraia()
    const z0 = linhaCosta(x) + larguraPraia(x)
    if (!longeDoRio(x, z0)) continue
    const t = adulto(rnd.escolha(emPe))
    const a = multidao.adicionar(t, new THREE.Matrix4(), { x, faixa: rnd.entre(1.5, LARG_CALCADAO - 1.5), vel: rnd.entre(0.9, 1.5) * (rnd.chance(0.5) ? 1 : -1), ini: x - rnd.entre(15, 35), fim: x + rnd.entre(15, 35), fase: rnd.entre(0, 6), estado: 'andar' })
    andando.push(a)
    registro.push(a)
  }
  // andando pelas calçadas: as ruas de verdade, a linha da frente dos lotes de 1932
  const [ox, oz] = grade.origem
  const ruasCidade = RUAS.filter((r) => comprimentoRua(r) > 20)
  const ruaViva = (x, z) => eraRua1932(x, z) && Math.hypot(x - ox, z - oz) < 520 && distCosta(x, z) > larguraPraia(x) + 12
  // a linha da frente e a parede da casa: quem anda na rua fica um passo a frente dela
  const CALCADA = 1.3
  for (let i = 0, tent = 0; i < 150 && tent < 3000; tent++) {
    if (!ruasCidade.length) break
    const rua = rnd.escolha(ruasCidade)
    const comp = comprimentoRua(rua)
    const t = rnd.entre(0, comp)
    const [x, z, nx, nz] = pontoNaRua(rua, t)
    if (!ruaViva(x + nx * CALCADA, z + nz * CALCADA)) continue
    const tp = adulto(rnd.escolha(emPe))
    const a = multidao.adicionar(tp, new THREE.Matrix4(), { rua: true, r: rua, t, vel: rnd.entre(0.8, 1.4) * (rnd.chance(0.5) ? 1 : -1), ini: 0, fim: comp, fase: rnd.entre(0, 6), estado: 'andar' })
    andando.push(a)
    registro.push(a)
    i++
  }
  // conversando na porta, em grupinhos
  for (let g = 0, tent = 0; g < 45 && tent < 2000; tent++) {
    if (!ruasCidade.length) break
    const rua = rnd.escolha(ruasCidade)
    const [x, z, nx, nz] = pontoNaRua(rua, rnd.entre(0, comprimentoRua(rua)))
    const px0 = x + nx * CALCADA
    const pz0 = z + nz * CALCADA
    if (!ruaViva(px0, pz0)) continue
    const n = 2 + Math.floor(rnd.entre(0, 2.99))
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2
      const px = px0 + Math.cos(a) * 0.7
      const pz = pz0 + Math.sin(a) * 0.7
      const yaw = Math.atan2(px0 - px, pz0 - pz)
      deFigura(rnd.escolha(emPe), new THREE.Matrix4().compose(new THREE.Vector3(px, alturaChao(px, pz) + 0.02, pz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1)))
    }
    g++
  }

  // O movimento do Centro de dia (21/10/2026, o vazio da cidade: docs/mapa-1932.md, v10): a gente
  // das fotos de 1925 a 1936 enche a Praça do Ferreira, a feira do Mercado, a praça da Estação e as
  // calçadas do Centro. Só de dia (cfg.pessoas.diaDe a diaAte); à noite essas figuras somem e saem do
  // registro dos atores. Quantidades: cfg.pessoas (painel Mundo > Gente de 1932, recarregar).
  const cp = cfg?.pessoas
  const diurnos = []
  const deFiguraDia = (t, m) => { const r = multidao.adicionar(t, m, { estado: 'parado', diurno: true }); registro.push(r); diurnos.push(r) }
  if (cp) {
    const raioCentro = cp.raioCentro
    // andando nas calçadas do Centro
    for (let i = 0, tent = 0; i < cp.andandoCentro && tent < cp.andandoCentro * 30; tent++) {
      const rua = rnd.escolha(ruasCidade)
      const comp = comprimentoRua(rua)
      const t = rnd.entre(0, comp)
      const [x, z, nx, nz] = pontoNaRua(rua, t)
      if (distRealDaPraca(x, z) > raioCentro) continue
      if (!eraRua1932(x + nx * CALCADA, z + nz * CALCADA)) continue
      const tp = adulto(rnd.escolha(emPe))
      const a = multidao.adicionar(tp, new THREE.Matrix4(), { rua: true, r: rua, t, vel: rnd.entre(0.8, 1.4) * (rnd.chance(0.5) ? 1 : -1), ini: 0, fim: comp, fase: rnd.entre(0, 6), estado: 'andar', diurno: true })
      andando.push(a)
      registro.push(a)
      diurnos.push(a)
      i++
    }
    // grupinhos parados num lugar: n pessoas em roda, olhando para o meio
    const roda = (x0, z0) => {
      if (!ocupacao.livre(x0, z0, 0.5, 0.5)) return false
      // o grupo não tampa o marco no ponto de vista do Ir para, nem fica colado na câmera
      if (noCorredor(x0, z0, 1) || pertoDeVista(x0, z0, 14)) return false
      const n = 2 + Math.floor(rnd.entre(0, 3))
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + rnd.entre(-0.3, 0.3)
        const px = x0 + Math.cos(a) * 0.75
        const pz = z0 + Math.sin(a) * 0.75
        const yaw = Math.atan2(x0 - px, z0 - pz)
        deFiguraDia(rnd.escolha(emPe), new THREE.Matrix4().compose(new THREE.Vector3(px, alturaChao(px, pz) + 0.02, pz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1)))
      }
      return true
    }
    // a Praça do Ferreira: dentro dela, pelos caminhos, e na calçada em volta
    let xmin = Infinity, xmax = -Infinity, zmin = Infinity, zmax = -Infinity
    for (const [x, z] of CONTORNO_PRACA) { xmin = Math.min(xmin, x); xmax = Math.max(xmax, x); zmin = Math.min(zmin, z); zmax = Math.max(zmax, z) }
    for (let g = 0, tent = 0; g < cp.gruposPraca && tent < cp.gruposPraca * 40; tent++) {
      const x = rnd.entre(xmin - 8, xmax + 8)
      const z = rnd.entre(zmin - 8, zmax + 8)
      if (dentroDeMarco(x, z, 1)) continue
      if (!dentroDaPraca(x, z) && !dentroDaPraca(x + 8, z) && !dentroDaPraca(x - 8, z) && !dentroDaPraca(x, z + 8) && !dentroDaPraca(x, z - 8)) continue
      if (roda(x, z)) g++
    }
    // a feira do Mercado de Ferro: entre o corpo do mercado e a borda da praça
    const mf = PEGADA.mercado
    if (mf) {
      for (let g = 0, tent = 0; g < cp.gruposFeira && tent < cp.gruposFeira * 40; tent++) {
        const [x, z] = naGrade([mf.x, mf.z], rnd.entre(-mf.hu - 6, mf.hu + 6), rnd.entre(-mf.hv - 6, mf.hv + 6))
        if (roda(x, z)) g++
      }
    }
    // a praça da Estação e o largo da Sé
    for (const [nome, n] of [['estacao', cp.gruposEstacao], ['se', cp.gruposSe]]) {
      const p = LOTES[nome]
      if (!p) continue
      const c = Math.cos(p.rot)
      const s = Math.sin(p.rot)
      for (let g = 0, tent = 0; g < n && tent < n * 40; tent++) {
        const lx = rnd.entre(p.x0, p.x1)
        const lz = rnd.entre(p.z1 + 2, p.z1 + 22)
        const x = p.x + lx * c + lz * s
        const z = p.z - lx * s + lz * c
        if (roda(x, z)) g++
      }
    }
  }

  // sentadas na areia, perto do mar
  for (let i = 0; i < 30; i++) {
    const x = xPraia()
    const bw = larguraPraia(x)
    const z = linhaCosta(x) + rnd.entre(bw * 0.25, bw * 0.75)
    if (!longeDoRio(x, z) || !ocupacao.livre(x, z, 0.4, 0.4)) continue
    const yaw = Math.PI + rnd.entre(-0.6, 0.6) // olhando para o mar
    multidao.adicionar(rnd.escolha(sentadas), new THREE.Matrix4().compose(new THREE.Vector3(x, alturaTerreno(x, z), z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1)))
  }
  // de pé conversando em grupinhos pela cidade e na praia
  for (let g = 0; g < 26; g++) {
    const x = xPraia()
    const naPraia = rnd.chance(0.5)
    const bw = larguraPraia(x)
    const z = linhaCosta(x) + (naPraia ? rnd.entre(bw * 0.3, bw * 0.8) : bw + rnd.entre(1, LARG_CALCADAO - 1))
    if (!longeDoRio(x, z)) continue
    const n = 2 + Math.floor(rnd.entre(0, 3))
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2
      const px = x + Math.cos(a) * 0.8
      const pz = z + Math.sin(a) * 0.8
      if (!ocupacao.livre(px, pz, 0.3, 0.3)) continue
      const yaw = Math.atan2(x - px, z - pz)
      const y = naPraia ? alturaTerreno(px, pz) : NIVEL_CIDADE + 0.05
      deFigura(rnd.escolha(emPe), new THREE.Matrix4().compose(new THREE.Vector3(px, y, pz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1)))
    }
  }

  // a matriz de quem anda nasce no primeiro passo; até lá fica parada na origem e escondida
  for (const a of andando) a.oculta = true
  multidao.montar()

  const p = new THREE.Vector3()
  const q = new THREE.Quaternion()
  const um = new THREE.Vector3(1, 1, 1)
  const Y = new THREE.Vector3(0, 1, 0)
  let acumulado = 0
  const registroNoite = registro.filter((r) => !r.diurno)
  let noite = false
  let escondido = false
  let nasceu = false
  // escondida: ocupada por um ator, ou do movimento do dia à noite (ou escondido pelo medidor)
  const reavaliar = (r) => { r.oculta = !!r.ator || (!!r.diurno && (noite || escondido)) || (r.estado === 'andar' && !nasceu) }
  return {
    multidao,
    // as fichas que viram ator animado perto do jogador (atores.js veste o ator com a da pessoa): os adultos de pé
    fichasAtor: adultos.map((t) => t.fig),
    malhas: multidao.malhas,
    // para medir (src/debug/medidor.js): some com o movimento do dia sem mudar a hora
    esconderDia(sim) {
      escondido = sim
      for (const r of diurnos) reavaliar(r)
      multidao.sujar()
    },
    // à noite as figuras do movimento do dia saem do registro (nenhum ator ocupa o lugar delas)
    get registro() { return noite ? registroNoite : registro },
    // um ator animado ocupa (ou devolve) o lugar desta pessoa: a figura simples some ou volta
    ocupar(r, ator) {
      r.ator = ator
      reavaliar(r)
      multidao.sujar()
    },
    // camera: a câmera do jogo (a figura de perto ou de longe sai da distância dela)
    atualizar(dt, tempo, hora = 12, camera = null) {
      // de dia o Centro enche; à noite o movimento do dia some
      const agoraNoite = hora < (cp?.diaDe ?? 6) || hora > (cp?.diaAte ?? 18.5)
      if (agoraNoite !== noite && diurnos.length) {
        noite = agoraNoite
        for (const r of diurnos) reavaliar(r)
        multidao.sujar()
      }
      const cam = camera?.position || camera
      multidao.atualizar(cam && cam.isVector3 ? cam : null)
      // só reposiciona 12 vezes por segundo: caminhada "em 2"
      acumulado += dt
      if (acumulado < 1 / 12) return
      const passo = acumulado
      acumulado = 0
      if (!nasceu) { nasceu = true; for (const a of andando) reavaliar(a) }
      for (const a of andando) {
        if ((noite || escondido) && a.diurno) continue
        if (a.rua) {
          a.t += a.vel * passo
          if (a.t > a.fim || a.t < a.ini) a.vel *= -1
          const [px, pz, nx, nz] = pontoNaRua(a.r, a.t)
          const x = px + nx * CALCADA
          const z = pz + nz * CALCADA
          const balanco = Math.abs(Math.sin(tempo * 7 + a.fase)) * 0.06
          p.set(x, alturaChao(x, z) + 0.02 + balanco, z)
          // o rumo e o da rua: a frente dos lotes de 1932
          const [ax, az] = pontoNaRua(a.r, a.t - 0.5)
          const [bx, bz] = pontoNaRua(a.r, a.t + 0.5)
          const dx = (bx - ax) * Math.sign(a.vel)
          const dz = (bz - az) * Math.sign(a.vel)
          q.setFromAxisAngle(Y, Math.atan2(dx, dz))
          a.matriz.compose(p, q, um)
          continue
        }
        a.x += a.vel * passo
        if (a.x > a.fim || a.x < a.ini) a.vel *= -1
        const z = linhaCosta(a.x) + larguraPraia(a.x) + a.faixa
        const balanco = Math.abs(Math.sin(tempo * 7 + a.fase)) * 0.06
        p.set(a.x, NIVEL_CIDADE + 0.05 + balanco, z)
        q.setFromAxisAngle(Y, a.vel > 0 ? Math.PI / 2 : -Math.PI / 2)
        a.matriz.compose(p, q, um)
      }
      if (andando.length) multidao.sujar()
      multidao.atualizar(cam && cam.isVector3 ? cam : null)
    },
  }
}
