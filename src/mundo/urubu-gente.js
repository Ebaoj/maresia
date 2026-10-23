// A gente do Campo do Urubu de dia: quem cozinha, quem lava, quem remenda, quem espera na fila da comida e
// da água, quem senta na sombra do galpão, as crianças brincando no largo. Figuras paradas (pessoas.js), em
// cópias por bloco; o movimento de ser vivo é rotoscopia (CLAUDE.md) e fica para quando houver o vídeo.
//
// O tom (docs/direcao-de-arte.md, seções 6 e 8): o campo aparece pelo cuidado e pelo trabalho; ninguém posa,
// nenhum corpo em close, a fila é organizada. FATO: a fila da comida, a roupa de saco de mantimento, a criança
// aprendendo letras no chão de terra (direção de arte, seção 6). HIPÓTESE: quantos fazem o quê e onde.
//
// Lotação: o relatório fala em até 6.000 pessoas. De dia, ~700 figuras à vista no núcleo (a maioria do campo
// está dentro dos galpões, nas redes, ou fora, nas turmas de trabalho: conceito, ato 1, cena 5).
//
// Duas contas no config (o painel pede recarregar): `gente` = as filas da comida e da água (malhas
// 'urubu-gente', o teste de urubu1932.test.js conta essas); `povo` = o resto (malhas 'urubu-povo').
// Cada vaga tem uma prioridade: com pouca gente pedida, ficam as cenas que contam (a cozinha, a água).

import { figuraLod } from './gente-figurino.js'
import { GENTE } from '../paleta.js'
import { criarAleatorio } from '../utils.js'
import { alturaTerreno } from './terreno.js'

// roupa de saco de mantimento, algodãozinho e chita gasta; o acento forte só num lenço ou numa saia (paleta)
export const PALETA_CAMPO = {
  roupas: ['#d9cbb0', '#cdbf9f', '#c8b48f', '#a08968', '#8a5a3c', '#b0a48c', '#9a9280', '#e4dccb', '#bfb39a', '#8e8a7d'],
  vestidos: ['#d9cbb0', '#cdbf9f', '#b9a888', '#c9b6a0', '#a9a08c', '#b78a6e', '#9fa9b5', '#8e8a7d', '#c2412d'],
  baixos: ['#8e8a7d', '#6b5a4a', '#8a5a3c', '#9a9280', '#b0a48c'],
  chapeus: ['#d9bf86', '#c8a86a', '#b89a62', '#c8a86a'],
  lencos: ['#e9dfcc', '#d9cbb0', '#cdbf9f', '#c2412d', '#9fa9b5', '#e9dfcc'],
}

// As fichas do campo (docs/figurino.md, seção 3): o homem de camisa clara de manga comprida, calça clara larga e
// chapéu de palha de aba larga (foto do Patu, 1932), às vezes o pano branco amarrado na cabeça (Pirambu, 1932) ou o
// bornal a tiracolo; a mulher de saia até o tornozelo e o pano claro cobrindo cabeça e ombros, ou o lenço; a criança
// de camisolão curto, ou camisa e calção, cabeça descoberta, descalça. Roupa lavada e remendada com cuidado, o pó do
// chão na barra. O chapéu de couro liso é raro (o ornamentado de cangaceiro não é do retirante comum). Corpo de
// gente inteira, sem magreza de espetáculo (docs/direcao-de-arte.md, seção 8).
export function fichasDoCampo (semente = 3201) {
  const r = criarAleatorio(semente)
  const P = PALETA_CAMPO
  const de = (l) => r.escolha(l)
  const pele = () => de(GENTE.peles)
  const cab = () => de(GENTE.cabelo)
  const homem = (extra = {}) => ({ corpo: 'homem', roupa: 'camisa', manga: 'longa', chapeu: 'palha', pes: 'descalco', calcaLarga: true, poeira: 0.7, ...extra, cores: { pele: pele(), camisa: de(P.roupas), listra: '#e9dfcc', calca: de(P.baixos), chapeu: de(P.chapeus), cabelo: cab(), remendo: de(P.roupas), ...(extra.cores || {}) } })
  const mulher = (extra = {}) => ({ corpo: 'mulher', roupa: 'saia', manga: 'longa', chapeu: 'xale', cabelo: 'coque', pes: 'descalco', poeira: 0.7, ...extra, cores: { pele: pele(), camisa: de(P.roupas), listra: de(P.lencos), calca: de(P.vestidos), chapeu: de(P.chapeus), cabelo: cab(), ...(extra.cores || {}) } })
  const crianca = (corpo, extra = {}) => ({ corpo, roupa: corpo === 'menina' ? 'vestido' : 'calcao', manga: 'curta', chapeu: null, pes: 'descalco', cabelo: corpo === 'menina' ? 'coque' : 'raspado', poeira: 0.5, ...extra, cores: { pele: pele(), camisa: de(P.roupas), listra: '#e9dfcc', calca: corpo === 'menina' ? de(P.vestidos) : de(P.baixos), chapeu: de(P.chapeus), cabelo: cab(), ...(extra.cores || {}) } })
  return {
    pe: [
      homem({ remendo: true }), mulher(), homem({ chapeu: 'pano', cores: { listra: '#efe9dc' } }), mulher({ chapeu: 'lenco' }),
      mulher({ manga: 'curta' }), homem({ bornal: true, roupa: 'camisaFora' }), mulher(), homem({ arregacada: true, manga: 'arregacada' }),
      homem({ chapeu: 'couro', cores: { chapeu: GENTE.couroChapeu } }), mulher({ chapeu: 'lenco', roupa: 'vestidoLongo', cores: { listra: '#c2412d' } }),
    ],
    sentado: [mulher(), homem({ remendo: false }), mulher({ chapeu: 'lenco' }), mulher({ roupa: 'vestidoLongo' }), homem({ chapeu: 'pano', cores: { listra: '#efe9dc' } })],
    criancas: [crianca('menino'), crianca('menina'), crianca('menino', { roupa: 'camisolao', cores: { camisa: '#e4dccb' } }), crianca('menina', { cores: { camisa: '#b78a6e', calca: '#b78a6e' } })],
    criancasSentadas: [crianca('menino'), crianca('menina')],
    // a lata d'água na cabeça, na rodilha (as mulheres da fila da água e das ruas do campo)
    latacabeca: mulher({ chapeu: 'lenco', carga: 'lata', cores: { listra: '#e9dfcc', calca: '#a9a08c' } }),
    // o soldado do portão: brim verde-oliva (decreto de 4/12/1931, docs/figurino.md); o funcionário de paletó
    guarda: { corpo: 'homem', roupa: 'camisa', manga: 'longa', chapeu: 'feltro', pes: 'sapato', cores: { pele: '#8a5235', camisa: '#7d7a5c', listra: '#7d7a5c', calca: '#6f6c52', chapeu: '#4a4636', cabelo: '#1d1411' } },
    funcionario: { corpo: 'homem', roupa: 'terno', chapeu: 'feltro', pes: 'sapato', cores: { pele: '#c98e62', camisa: '#5a5a5e', listra: '#efe9dc', calca: '#4a4a4e', chapeu: '#3b3330', cabelo: '#1d1411' } },
  }
}

// os modelos de figura (perto e longe) de cada ficha: de pé, sentados, crianças, a lata na cabeça, o portão
export function modelosDoCampo (semente = 3201) {
  const f = fichasDoCampo(semente)
  return {
    pe: f.pe.map((x) => figuraLod(x)),
    sentado: f.sentado.map((x) => figuraLod(x, { sentado: true })),
    crianca: f.criancas.map((x) => figuraLod(x)),
    criancaSentada: f.criancasSentadas.map((x) => figuraLod(x, { sentado: true })),
    latacabeca: figuraLod(f.latacabeca),
    guarda: figuraLod(f.guarda),
    funcionario: figuraLod(f.funcionario, { sentado: true }),
  }
}

// as vagas de gente: { x, z, y, yaw, sentado, crianca, carrega, prio, fila }. carrega: 'lata' | 'latacabeca' | 'pano'
export function vagasDeGente (planta, galpoes, semente = 1933) {
  const rnd = criarAleatorio(semente)
  const q = planta.quadro
  const vagas = []
  const rumo = (du, dw) => Math.atan2(du * q.u[0] + dw * q.n[0], du * q.u[1] + dw * q.n[1])
  const por = (u, w, du, dw, extra = {}) => {
    const [x, z] = q.mundo(u, w)
    vagas.push({ x, z, y: alturaTerreno(x, z) + 0.02, yaw: rumo(du, dw) + rnd.entre(-0.15, 0.15), sentado: false, crianca: false, prio: 1, ...extra })
  }
  const k = planta.cozinha
  // a fila da comida: virada para a mesa (-w); umas crianças, umas com a lata ou o prato
  k.fila.forEach((p, i) => por(p.u + rnd.entre(-0.12, 0.12), p.w, 0, -1, { fila: true, prio: i, crianca: rnd.chance(0.22), carrega: rnd.chance(0.4) ? 'lata' : null }))
  // a fila da água: virada para a pipa (-u), com a lata
  planta.agua.fila.forEach((p, i) => por(p.u, p.w + rnd.entre(-0.1, 0.1), -1, 0, { fila: true, prio: i * 1.4 + 0.5, crianca: rnd.chance(0.18), carrega: 'lata' }))

  // quem cozinha: uma em cada caldeirão, de frente para ele; quem serve, atrás da mesa; quem traz a lenha
  for (const f of k.fogos) por(f.u + 1.05, f.w + 0.3, -1, 0, { prio: 0 })
  por(k.mesa.u - 0.75, k.mesa.w - 0.4, 1, 0, { prio: 0 })
  por(k.mesa.u - 0.75, k.mesa.w + 0.9, 1, 0.2, { prio: 0.5 })
  por(k.lenha.u + 0.9, k.lenha.w - 0.6, -1, 0.3, { prio: 1 })
  // quem lava roupa: sentada diante da bacia
  for (const b of planta.agua.lavagem) por(b.u, b.w - 0.72, 0, 1, { sentado: true, prio: 0.3 })
  // o banco do posto médico: quem espera (sentado no banco, 0,44 m)
  const ps = planta.posto
  for (let i = 0; i < 4; i++) por(ps.u + ps.l / 4 - 0.6 + i * 0.75, ps.w + ps.p / 2 + 0.55, 0, 1, { sentado: true, assento: 0.13, prio: 2 + i })
  // na porta da capela
  for (let i = 0; i < 3; i++) por(planta.capela.u + rnd.entre(-1.5, 1.5), planta.capela.w + planta.capela.p / 2 + 1.4 + rnd.entre(0, 1), rnd.entre(-1, 1), -1, { sentado: true, prio: 3 + rnd.proximo() * 10 })

  // as rodas de criança no largo (de mãos dadas, viradas para o meio) e a turma das letras no chão
  const largo = planta.largo
  const centros = [[28, largo.meio - 8], [-45, largo.meio + 10], [70, largo.meio - 4]]
  centros.forEach(([cu, cw], r) => {
    const n = 6 + r
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      por(cu + Math.cos(a) * 1.5, cw + Math.sin(a) * 1.5, -Math.cos(a), -Math.sin(a), { crianca: true, prio: 0.8 + r * 3 + i * 0.2 })
    }
  })
  {
    const [cu, cw] = [45, largo.meio + 12]
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      por(cu + Math.cos(a) * 1.2, cw + Math.sin(a) * 1.2, -Math.cos(a), -Math.sin(a), { sentado: true, crianca: i > 0, prio: 1.2 + i * 0.5 })
    }
  }

  // nos galpões: sentados ao longo das linhas de esteios (a rede ali fica alta) e na beira de fora, na sombra do
  // beiral; em dupla ou trio, um de frente para o outro; quem remenda com o pano no colo
  const L = planta.opcoes.galpaoComprimento
  const P = planta.opcoes.galpaoLargura
  for (const g of galpoes) {
    if (g.tipo === 'fechado') continue
    const grupos = 6
    for (let i = 0; i < grupos; i++) {
      const lx = rnd.entre(-L / 2 + 1.5, L / 2 - 1.5)
      const linhas = [-P / 2 + 0.45, -2, 2, P / 2 - 0.45, P / 2 + 0.9]
      const lz = rnd.escolha(linhas)
      const n = 2 + Math.floor(rnd.entre(0, 2.99))
      for (let j = 0; j < n; j++) {
        const frente = j % 2 ? 1 : -1
        por(g.u + lx + j * 0.6, g.w + lz + frente * -0.32, rnd.entre(-0.3, 0.3), frente, { sentado: true, crianca: rnd.chance(0.2), carrega: rnd.chance(0.18) ? 'pano' : null, prio: 2 + rnd.proximo() * 40 })
      }
    }
  }
  // de pé nas ruas do campo, em dupla ou trio; mulheres com a lata d'água na cabeça; criança correndo
  const filas = [...planta.filas.frente, ...planta.filas.fundo]
  for (let i = 0; i < 90; i++) {
    const naAvenida = rnd.chance(0.35)
    const passoW = P + planta.opcoes.ruaEntreFileiras
    const cw = naAvenida ? rnd.entre(28, filas[filas.length - 1]) : rnd.escolha(filas) + passoW / 2 + rnd.entre(-2.5, 2.5)
    const cu = naAvenida ? rnd.entre(-3.5, 3.5) : rnd.entre(planta.nucleo.u[0] + 15, planta.nucleo.u[1] - 15)
    const n = rnd.chance(0.3) ? 1 : 2 + Math.floor(rnd.entre(0, 1.99))
    const prio = 4 + rnd.proximo() * 40
    if (n === 1) {
      const cabeca = rnd.chance(0.5)
      por(cu, cw, rnd.entre(-1, 1), rnd.entre(-1, 1), { carrega: cabeca ? 'latacabeca' : null, crianca: !cabeca && rnd.chance(0.5), prio })
      continue
    }
    for (let j = 0; j < n; j++) {
      const a = (j / n) * Math.PI * 2 + rnd.entre(0, 1)
      por(cu + Math.cos(a) * 0.7, cw + Math.sin(a) * 0.7, -Math.cos(a), -Math.sin(a), { crianca: rnd.chance(0.15), prio })
    }
  }
  return vagas
}

// a gente da noite: sentada em volta das fogueiras (a cantoria e o repente: docs/direcao-de-arte.md)
export function vagasDaNoite (planta, quantos, semente = 1934) {
  const rnd = criarAleatorio(semente)
  const q = planta.quadro
  const vagas = []
  const fog = planta.fogueiras
  if (!fog.length) return vagas
  for (let i = 0; i < quantos; i++) {
    const f = fog[i % fog.length]
    const k = Math.floor(i / fog.length)
    const a = k * 0.83 + (i % fog.length) * 1.7
    const r = 1.6 + (k % 2) * 0.35
    const [x, z] = q.mundo(f.u + Math.cos(a) * r, f.w + Math.sin(a) * r)
    const [fx, fz] = q.mundo(f.u, f.w)
    vagas.push({ x, z, y: alturaTerreno(x, z) + 0.02, yaw: Math.atan2(fx - x, fz - z), sentado: true, crianca: rnd.chance(0.15), prio: i })
  }
  return vagas
}
