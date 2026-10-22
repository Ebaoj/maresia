// Os lugares do Campo do Urubu que a história usa (docs/conceito.md), com coordenada de jogo, para as mecânicas
// que vêm depois (o registro, a fila, a contagem, a cerca, o dia dos turistas, a desmontagem). Um arquivo só:
// quem precisar de um lugar do campo lê daqui, não da planta.
//
// Todos saem da planta (urubu-planta.js): se o painel mudar a planta, os lugares acompanham (lugaresDoCampo).
// LUGARES_URUBU é a planta do padrão. Cada lugar: { x, z } no mundo, mais o que a cena precisa (onde ficar,
// para onde olhar). Ficção sobre fato: o lugar é hipótese (a planta toda é), a cena é do roteiro.

import { PLANTA } from './urubu-planta.js'
import { dentroDoCampo } from './mapa1932.js'

const ponto = (q, u, w) => { const [x, z] = q.mundo(u, w); return { x, z, u, w } }

export function lugaresDoCampo (planta) {
  const q = planta.quadro
  const rg = planta.registro
  // a rede da família: no 2º galpão da fileira do meio da frente, à esquerda da avenida, no vão do meio, três
  // redes juntas (o avô, o menino, a Luzia); longe o bastante do portão para o caminho do registro até ela contar
  const galpao = planta.galpoes.find((g) => g.quadra === 'frente' && g.fila === 1 && g.u < 0 && g.u > -planta.opcoes.galpaoComprimento * 1.5) || planta.galpoes[0]
  const passo = planta.opcoes.redePasso
  const redes = [0, 1, 2].map((i) => ponto(q, galpao.u - 6 + i * passo, galpao.w))
  // a cerca onde o Zé vem: o lado de P3 a P2, o do sul desde 22/10/2026 (ao longo da Linha Norte, virado para a
  // linha e para a cidade), longe do soldado do portão
  const p = planta.cerca.poligono
  const [ax, az] = p[3]
  const [bx, bz] = p[2]
  const t = 0.36
  const cx = ax + (bx - ax) * t
  const cz = az + (bz - az) * t
  const [cu, cw] = q.local(cx, cz)
  // um passo para cada lado do arame: o de dentro é o que cai no polígono
  const nx = -(bz - az)
  const nz = bx - ax
  const n = Math.hypot(nx, nz)
  const lado = (k) => q.local(cx + (k * nx / n) * 1.6, cz + (k * nz / n) * 1.6)
  const k = dentroDoCampo(cx + (nx / n) * 1.6, cz + (nz / n) * 1.6) ? 1 : -1
  const [iu, iw] = lado(k)
  const [ou, ow] = lado(-k)
  const fundos = planta.galpoes.find((g) => g.id === 'fundos')
  const t2 = planta.trilho
  return {
    // a mesa do registro (ato 1, cena 3): o funcionário senta na cadeira; a família para na chegada
    registro: { ...ponto(q, rg.u, rg.w), cadeira: ponto(q, rg.cadeira.u, rg.cadeira.w), chegada: ponto(q, rg.chegada.u, rg.chegada.w), livro: ponto(q, rg.u + 0.08, rg.w) },
    // a rede da família no galpão
    redeDaFamilia: { ...redes[1], galpao: galpao.id, redes },
    // a fila da comida: a frente (na mesa) e o rumo em que ela cresce
    filaDaCozinha: { ...ponto(q, planta.cozinha.fila[0].u, planta.cozinha.fila[0].w), mesa: ponto(q, planta.cozinha.mesa.u, planta.cozinha.mesa.w), fim: ponto(q, planta.cozinha.fila[24].u, planta.cozinha.fila[24].w) },
    // o portão: o vão da porteira, um passo para dentro e um para fora (a contagem de manhã e de noite)
    portao: { ...ponto(q, 0, 0), dentro: ponto(q, 0, 4), fora: ponto(q, 0, -4), guarda: ponto(q, planta.portao.largura / 2 + 1, 1.6) },
    // a cerca onde o Zé vem (ato 2, cena 10): o arame, o lado de dentro (o menino) e o de fora (o Zé)
    cercaDoZe: { ...ponto(q, cu, cw), dentro: ponto(q, iu, iw), fora: ponto(q, ou, ow) },
    // o galpão dos fundos, fechado de tábua: onde os doentes são escondidos no dia dos turistas (ato 2, cena 8)
    galpaoDosFundos: fundos ? { ...ponto(q, fundos.u, fundos.w), porta: ponto(q, fundos.u, fundos.w + planta.opcoes.galpaoLargura / 2 + 1) } : null,
    // o desvio da linha: onde as famílias descem (ato 1) e por onde o campo pode embarcar no fim (ato 3, H)
    desvio: { ...ponto(q, t2.plataforma.u, t2.plataforma.w), paraChoque: ponto(q, t2.paraChoque.u, t2.paraChoque.w), vagao: ponto(q, t2.vagao.u, t2.vagao.w) },
    // o resto do campo, para as mecânicas do dia (a água, o posto, a capela, o largo, as latrinas)
    agua: ponto(q, planta.agua.pipa.u, planta.agua.pipa.w),
    posto: ponto(q, planta.posto.u, planta.posto.w + planta.posto.p / 2 + 1),
    capela: ponto(q, planta.capela.u, planta.capela.w + planta.capela.p / 2 + 1),
    largo: ponto(q, 20, planta.largo.meio),
    latrinas: planta.latrinas ? ponto(q, planta.latrinas.u, planta.latrinas.w + 3) : null,
  }
}

export const LUGARES_URUBU = lugaresDoCampo(PLANTA)

// os pontos de vista do painel "Ir para" (a câmera fica atrás do jogador, olhando para o alvo; na altura das
// pessoas, de dentro do campo: docs/direcao-de-arte.md, "a câmera fica do lado de dentro")
function vista (de, para, hora, pitch = 0.06) {
  const [x, z] = PLANTA.quadro.mundo(...de)
  const [tx, tz] = PLANTA.quadro.mundo(...para)
  return { x, z, yaw: Math.atan2(-(tx - x), -(tz - z)), hora, pitch, alvo: [tx, tz] }
}
const R = LUGARES_URUBU
export const VISTAS_URUBU = {
  urubuRegistro: vista([R.registro.u - 7, R.registro.w + 9], [R.registro.u, R.registro.w], 9),
  urubuCozinha: vista([R.filaDaCozinha.u + 14, R.filaDaCozinha.w + 18], [R.filaDaCozinha.mesa.u - 3, R.filaDaCozinha.mesa.w], 11),
  urubuGalpao: vista([R.redeDaFamilia.u + 8, R.redeDaFamilia.w - 1.8], [R.redeDaFamilia.u - 14, R.redeDaFamilia.w - 1.8], 10, 0.02),
}
