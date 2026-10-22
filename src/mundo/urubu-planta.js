// A planta do Campo do Urubu (1932): onde fica cada coisa, sem geometria (roda no Node, os testes leem).
//
// FATO (dossiê ~/Projetos/marcos-1932-pesquisa/marcos-1932.md, seção 23; relatório médico de ago/1933 citado
// pelo Diário do Nordeste): até 6.000 pessoas; "grandes galpões cobertos de folha de zinco"; "no travejamento
// de madeira e em estacas numerosas eram armadas as redes"; uma cozinha; cercas e vigilância; perto das
// oficinas da RVC, isolado da cidade pela linha do trem. Sobrevivente: "umas 20 tarefas de terra cercadas com
// arame [...] batia a porteira e pronto".
// HIPÓTESE (tudo o que é medida e lugar): não há planta nem foto livre. A reconstituição:
//   - o núcleo habitado fica no canto do polígono que dá para a linha (as famílias chegavam pela linha, a pé com
//     os soldados: docs/conceito.md, ato 1); o portão e o registro ficam nesse lado. Desde 22/10/2026 o polígono
//     fica a leste do recinto das Oficinas da RVC, entre a Linha Norte e o mar (docs/mapa-1932.md, v17): o portão
//     dá para o leste (a cidade), o desvio sai da Linha Norte por fora dele, e as oficinas ficam atrás, a oeste;
//   - "20 tarefas" (a tarefa cearense tem ~3.600 m²) dão ~7 ha: é o tamanho do núcleo (~320 x 260 m), dentro
//     do polígono de cerca do mapa (H, docs/mapa-1932.md), que é bem maior;
//   - galpão de 48 x 12 m, esteios a cada 4 m, três vãos de 4 m com as redes atravessadas a ~1,1 m uma da outra:
//     ~130 redes por galpão; 42 galpões, ~5.500 redes para ~6.000 pessoas (criança divide rede);
//   - uma avenida do portão até o fundo; no meio, o largo da cozinha, da água, do posto e da capela;
//   - o galpão dos fundos (fechado de tábua), longe do caminho de quem visita: onde os doentes são escondidos no
//     dia dos turistas (conceito, ato 2, cena 8);
//   - as latrinas longe dos galpões, no canto de trás; a linha do trem correndo por fora da cerca, com um desvio.
//
// Coordenadas: o "quadro do campo" tem origem no portão (meio do lado nordeste do polígono), u ao longo da
// cerca e w para dentro do campo, em metros (o campo é 1:1, testes/unidade/urubu1932.test.js).

import { CAMPO_URUBU, dentroDoCampo } from './mapa1932.js'
import { PADRAO } from '../config.js'

// o lado do polígono onde fica o portão: de P4 a P3. Até 22/10/2026 ele dava para as oficinas, que ficavam por baixo
// do polígono; desde então (docs/mapa-1932.md, v17) é o lado leste do campo, virado para a cidade, com o desvio
// saindo da Linha Norte por fora dele; as oficinas ficam a oeste, atrás do campo
const LADO_PORTAO = [4, 3]

export function quadroDoCampo () {
  const p = CAMPO_URUBU.poligono
  const [ax, az] = p[LADO_PORTAO[0]]
  const [bx, bz] = p[LADO_PORTAO[1]]
  const comp = Math.hypot(bx - ax, bz - az)
  const u = [(bx - ax) / comp, (bz - az) / comp]
  let n = [-u[1], u[0]]
  // a normal aponta para dentro do campo
  const ox = (ax + bx) / 2
  const oz = (az + bz) / 2
  if (!dentroDoCampo(ox + n[0] * 20, oz + n[1] * 20)) n = [-n[0], -n[1]]
  // rot: o giro (rotation.y do three) que leva o x local para u e o z local para n
  const rot = Math.atan2(-u[1], u[0])
  const mundo = (lu, lw) => [ox + lu * u[0] + lw * n[0], oz + lu * u[1] + lw * n[1]]
  const local = (x, z) => [(x - ox) * u[0] + (z - oz) * u[1], (x - ox) * n[0] + (z - oz) * n[1]]
  return { origem: [ox, oz], u, n, rot, comprimentoLado: comp, mundo, local }
}

// o retângulo (no quadro do campo) cabe inteiro dentro da cerca, com folga
function cabe (q, cu, cw, l, p, folga) {
  for (const [du, dw] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]]) {
    const [x, z] = q.mundo(cu + du * (l / 2 + folga), cw + dw * (p / 2 + folga))
    if (!dentroDoCampo(x, z)) return false
  }
  return true
}

// opcoes: cfg.mundo.urubu (o painel mexe; vale ao recarregar)
export function criarPlanta (opcoes = PADRAO.mundo.urubu) {
  const o = { ...PADRAO.mundo.urubu, ...opcoes }
  const q = quadroDoCampo()
  const L = o.galpaoComprimento
  const P = o.galpaoLargura
  const ponto = (lu, lw) => { const [x, z] = q.mundo(lu, lw); return { u: lu, w: lw, x, z } }

  // ---- os galpões: duas quadras de fileiras, separadas pelo largo da cozinha ----
  const passoU = L + o.ruaEntreGalpoes
  const passoW = P + o.ruaEntreFileiras
  const meiaAvenida = o.larguraAvenida / 2
  const colunas = []
  for (let k = 0; k < o.colunasPorLado; k++) {
    const cu = meiaAvenida + 2 + L / 2 + k * passoU
    colunas.push(-cu, cu)
  }
  colunas.sort((a, b) => a - b)
  const filasA = []
  const filasB = []
  const w0 = o.recuoPortao + P / 2
  for (let i = 0; i < o.fileirasAntes; i++) filasA.push(w0 + i * passoW)
  const inicioLargo = filasA[filasA.length - 1] + P / 2
  const fimLargo = inicioLargo + o.larguraLargo
  for (let i = 0; i < o.fileirasDepois; i++) filasB.push(fimLargo + P / 2 + i * passoW)
  const galpoes = []
  for (const [quadra, filas] of [['frente', filasA], ['fundo', filasB]]) {
    filas.forEach((cw, fila) => {
      for (const cu of colunas) {
        if (!cabe(q, cu, cw, L, P, 4)) continue
        const g = { id: `g${galpoes.length}`, quadra, fila, ...ponto(cu, cw), l: L, p: P, rot: q.rot }
        // paredes: o galpão da beira (o lado do vento) tem a parede de tábua inteira de um lado;
        // os outros, só o rodapé de tábua e as cabeceiras de taipa (a sorte é pela posição, sem aleatório)
        g.tipo = (Math.round(cu / passoU) + fila) % 3 === 0 ? 'parede' : 'aberto'
        galpoes.push(g)
      }
    })
  }
  // o galpão dos fundos: fechado de tábua, no canto de trás, longe da avenida (por onde os turistas passam)
  const wFundos = filasB[filasB.length - 1] + passoW + 6
  const uFundos = colunas[0]
  if (cabe(q, uFundos, wFundos, L, P, 4)) {
    galpoes.push({ id: 'fundos', quadra: 'fundos', fila: 0, ...ponto(uFundos, wFundos), l: L, p: P, rot: q.rot, tipo: 'fechado' })
  }

  // ---- o largo: cozinha, água, posto médico e capela ----
  const wLargo = (inicioLargo + fimLargo) / 2
  const cozinha = { ...ponto(-meiaAvenida - 12, wLargo - 2), l: 10, p: 24, rot: q.rot }
  // três fogões de chão com o caldeirão, no meio da cozinha; a mesa de servir no lado aberto (a avenida)
  cozinha.fogos = [-8, 0, 8].map((dw) => ponto(cozinha.u - 1, cozinha.w + dw))
  cozinha.mesa = ponto(cozinha.u + cozinha.l / 2 + 0.9, cozinha.w - 4)
  cozinha.lenha = ponto(cozinha.u - cozinha.l / 2 - 1.6, cozinha.w + 7)
  cozinha.sacos = ponto(cozinha.u - 2.5, cozinha.w - cozinha.p / 2 + 1.6)
  // a fila da comida: sai da mesa e desce pela beira da avenida
  cozinha.fila = []
  for (let i = 0; i < 60; i++) cozinha.fila.push(ponto(cozinha.mesa.u + 1.4 + (i > 24 ? 0.9 : 0), cozinha.mesa.w + 1.2 + i * 0.78 - (i > 24 ? 19 : 0)))
  const agua = { pipa: ponto(meiaAvenida + 6, inicioLargo + 7) }
  agua.fila = []
  for (let i = 0; i < 40; i++) agua.fila.push(ponto(agua.pipa.u + 1.6 + i * 0.82, agua.pipa.w + 0.2 + Math.sin(i * 0.7) * 0.25))
  // onde se lava a roupa: ao lado da água, no rumo do escoamento
  agua.lavagem = [0, 1, 2, 3].map((i) => ponto(agua.pipa.u + 2 + i * 2.6, agua.pipa.w - 4.5))
  const posto = { ...ponto(meiaAvenida + 46, wLargo + 6), l: 12, p: 8, rot: q.rot }
  const capela = { ...ponto(-meiaAvenida - 70, wLargo + 4), l: 7, p: 11, rot: q.rot }
  // as rodas de criança e os grupos do largo
  const largo = { inicio: inicioLargo, fim: fimLargo, meio: wLargo }

  // ---- o portão, a guarita e a mesa do registro ----
  const portao = { ...ponto(0, 0), largura: o.larguraPortao, rot: q.rot }
  const guarita = { ...ponto(-o.larguraPortao / 2 - 3.2, 3.4), l: 3.4, p: 2.8, rot: q.rot }
  // a mesa do registro fica do outro lado do portão, sob um alpendre de zinco: quem chega para aqui primeiro
  const registro = { ...ponto(o.larguraPortao / 2 + 3.6, 7), l: 4.2, p: 3.4, rot: q.rot }
  registro.mesa = ponto(registro.u, registro.w)
  registro.cadeira = ponto(registro.u + 0.75, registro.w)
  registro.chegada = ponto(registro.u - 1.3, registro.w)

  // ---- as latrinas: no canto de trás, longe dos galpões ----
  const uLat = colunas[colunas.length - 1]
  let latrinas = null
  for (const dw of [70, 55, 40, 28]) {
    const cw = wFundos + dw
    if (cabe(q, uLat, cw, 10, 2.4, 3)) { latrinas = { ...ponto(uLat, cw), l: 10, p: 2.4, rot: q.rot, cabines: 5 }; break }
  }

  // ---- as fogueiras da noite, entre os galpões (cantoria e repente: docs/direcao-de-arte.md) ----
  const fogueiras = []
  for (const [k, cw] of [[0, filasA[1] + passoW / 2], [3, filasA[2] + passoW / 2], [4, filasB[0] + passoW / 2], [1, filasB[1] + passoW / 2]]) {
    const cu = (colunas[k] + colunas[k + 1]) / 2 || colunas[k] + passoU / 2
    fogueiras.push(ponto(cu, cw))
  }

  // ---- a linha do trem por fora da cerca, com o desvio onde as famílias desciam (H) ----
  const trilho = {
    bitola: 1.0, // a RVC era de bitola métrica (H, a conferir)
    principal: [ponto(-o.trilhoAlem - q.comprimentoLado / 2, -o.trilhoRecuo), ponto(o.trilhoAlem + q.comprimentoLado / 2, -o.trilhoRecuo)],
    desvio: [ponto(-110, -o.trilhoRecuo + 9), ponto(60, -o.trilhoRecuo + 9), ponto(100, -o.trilhoRecuo)],
    paraChoque: ponto(-112, -o.trilhoRecuo + 9),
    vagao: ponto(-70, -o.trilhoRecuo + 9),
    plataforma: { ...ponto(-20, -o.trilhoRecuo + 13.2), l: 60, p: 3, rot: q.rot },
  }

  // ---- a cerca: o polígono do mapa, com o vão da porteira no lado do portão ----
  const cerca = { poligono: CAMPO_URUBU.poligono, lado: LADO_PORTAO, portao }

  // o retângulo de tudo o que é construído (para as tarefas de terra antigas não caírem em cima)
  const nucleo = {
    u: [colunas[0] - L / 2 - 8, colunas[colunas.length - 1] + L / 2 + 8],
    w: [-o.trilhoRecuo - 8, (latrinas ? latrinas.w : wFundos) + 12],
  }

  return { quadro: q, opcoes: o, galpoes, colunas, filas: { frente: filasA, fundo: filasB }, cozinha, agua, posto, capela, largo, portao, guarita, registro, latrinas, fogueiras, trilho, cerca, nucleo }
}

// o ponto (do mundo) está no núcleo construído do campo?
export function noNucleo (planta, x, z, folga = 0) {
  const [lu, lw] = planta.quadro.local(x, z)
  return lu > planta.nucleo.u[0] - folga && lu < planta.nucleo.u[1] + folga && lw > planta.nucleo.w[0] - folga && lw < planta.nucleo.w[1] + folga
}

export const PLANTA = criarPlanta()
