// Os pontos de vista dos conceitos aprovados (~/Projetos/marcos-1932-pesquisa/conceitos/): onde o jogador fica e
// para onde a câmera olha, para o "📍 Ir para" do painel e para as fotos de prova (docs/capturas/marcos/).
// No referencial da grade (grade.js) a partir da âncora do marco; hora = a hora da luz do conceito.
import { CENTRO as CENTRO_PRACA } from '../praca1932.js'
import { ll } from '../fortaleza1932.js'
import { naGrade } from './grade.js'

const ANCORAS = { praca: CENTRO_PRACA, leoes: ll(-38.52633, -3.72694), carolina: ll(-38.5264, -3.7259) }

// [âncora, jogador (u, v), alvo (u, v), hora]
const DEF = {
  // praca-ferreira.png: do lado leste da praça, a coluna no meio, o Majestic à esquerda, o Excelsior à direita
  colunaHora: ['praca', [20, -4], [-30, 6], 16.5],
  // excelsior.png: de dentro da praça, a sudeste do hotel (fachada longa à esquerda, curta à direita)
  excelsior: ['praca', [-12, -2], [-64, -44], 17],
  // praca-leoes.png: da Rua Sena Madureira, de frente para a escadaria em ferradura. A luz do conceito vem da
  // frente (a escadaria inteira ao sol, a sombra caindo para a esquerda): é manhã, com o sol a leste; às 15h a
  // escadaria fica na sombra do próprio muro
  leoes: ['leoes', [54, 9], [20, 4], 9.5],
  // mercado-ferro.png: da praça, a oeste do mercado, de frente para a empena e a arcada, a Sé ao fundo
  mercado: ['carolina', [-52, 15], [-28, 0], 16],
}

export const VISTAS = Object.fromEntries(Object.entries(DEF).map(([k, [a, p, t, hora]]) => {
  const [x, z] = naGrade(ANCORAS[a], p[0], p[1])
  const [tx, tz] = naGrade(ANCORAS[a], t[0], t[1])
  // a câmera fica atrás do jogador e olha para ele: yaw aponta do alvo para a câmera (camera.js)
  return [k, { x, z, yaw: Math.atan2(-(tx - x), -(tz - z)), hora, alvo: [tx, tz] }]
}))
