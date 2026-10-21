// Os pontos de vista dos marcos de 1932 do norte do centro: de onde os quadros de conceito aprovados
// pelo Joabe foram "pintados" (marcos-1932-pesquisa/conceitos). O botão "Ir para" do painel leva o
// jogador ali, olhando para o marco, na hora do quadro. Posição em coordenada local do marco
// (lotes-marcos.js): [x, z] de onde se olha, [x, z] para onde se olha, hora, inclinação da câmera.

import { PEGADAS } from './lotes-marcos.js'

const LOCAIS = {
  // a Sé vista do largo, a sudoeste, com o cruzeiro à direita e o mar atrás (se-velha.png, manhã)
  se: { marco: 'se', de: [-10, 40], para: [2, -10], hora: 9.0, pitch: -0.22 },
  // a Estação vista da praça, a sudeste, a ala oeste fugindo à esquerda (estacao-central.png, tarde)
  estacao: { marco: 'estacao', de: [30, 50], para: [-5, 14], hora: 15.5, pitch: 0.02 },
}

function paraMundo(p, [lx, lz]) {
  const c = Math.cos(p.rot)
  const s = Math.sin(p.rot)
  return [p.x + lx * c + lz * s, p.z - lx * s + lz * c]
}

// { chave: { x, z, yaw, hora, pitch, marco, alvo } } no mundo; yaw é o da câmera (ela fica atrás, olhando para o alvo)
export const VISTAS_MARCOS = Object.fromEntries(Object.entries(LOCAIS).map(([k, v]) => {
  const p = PEGADAS[v.marco]
  const [x, z] = paraMundo(p, v.de)
  const [tx, tz] = paraMundo(p, v.para)
  return [k, { x, z, yaw: Math.atan2(-(tx - x), -(tz - z)), hora: v.hora, pitch: v.pitch, marco: v.marco, alvo: [tx, tz] }]
}))
