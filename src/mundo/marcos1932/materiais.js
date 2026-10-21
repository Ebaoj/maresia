// Os materiais dos marcos de 1932: toon pintado (escreve gLuz por pintar()), com a textura pintada do jogo
// (cal, pedra, madeira, telha) e a cor tirada do cfg.marcos, que o painel muda ao vivo (atualizar()).
// Vidro de lampião e janela acesa: luzFixa, apagados de dia e quentes à noite (uNoite), como em cenografia.js.

import * as THREE from 'three'
import { toon, texturizar, luzFixa } from '../../materiais.js'
import { globais } from '../../globais.js'
import { CAL } from '../../paleta.js'
import { materialMetal, sincronizarMetal } from './metal.js'
import { materialRebote, sincronizarRebote } from './rebote.js'

// chave -> [de onde vem a cor, textura pintada, metros por repetição]
// a cor é uma chave de cfg.marcos (ao vivo) ou um hex fixo (da paleta)
const RECEITAS = {
  cal: [CAL.cal, 'cal', 2.5],
  calVelha: [CAL.calVelha, 'cal', 2.5],
  moldura: ['#f3ede0', 'cal', 1.5],
  pedra: ['corPedra', 'pedra', 1.2],
  coluna: ['corColuna', 'pedra', 1.4],
  colunaSombra: ['#9d8661', 'pedra', 1.0],
  relogioMostrador: ['#2e2a25', null],
  relogioMarca: ['#efe6d2', null],
  balaustre: ['corBalaustrada', 'cal', 0.8],
  vao: ['#3a2c24', null],
  madeira: ['#6b4a33', 'madeira', 0.8],
  esquadria: ['#4f6e60', 'madeira', 0.8],
  telha: [CAL.telha, 'telha', 1.5],
  ferro: ['corFerro', null],
  bronze: ['corBronze', null],
  balaustreClaro: ['#f6f0e2', 'cal', 0.8],
  majestic: ['corMajestic', 'cal', 2.0],
  moderno: ['corModerno', 'cal', 2.5],
  rosario: [CAL.cal, 'cal', 2.0],
  palacio: ['#f1ead8', 'cal', 2.5],
  mercado: ['corMercado', null],
  chapa: ['corChapa', null],
  mosaicoClaro: ['corMosaicoClaro', 'pedra', 0.6],
  mosaicoEscuro: ['corMosaicoEscuro', 'pedra', 0.6],
  terra: ['#6b5136', 'areia', 1.0],
  saibro: ['#c9b08a', 'areia', 1.2],
  folha: ['#3f6e3a', 'folha', 1.2],
  flor: ['#b8553b', 'folha', 0.8], // urucum desbotado: o acento do canteiro
  bandeira: ['#4e8f3a', null],
  bandeiraOuro: ['#e9b23a', null],
  palha: [CAL.palha, 'palha', 0.6],
  barro: ['#a8643f', null],
  pano: ['#e9dfcb', null],
  fruta: ['#e9b23a', null],
  algodao: ['#d9cbb0', null],
}

export function criarMateriais(cfg) {
  const mats = {}
  const vivos = []
  for (const [chave, [cor, tex, tam]] of Object.entries(RECEITAS)) {
    const doCfg = cor.startsWith('cor')
    const hex = doCfg ? cfg.marcos[cor] : cor
    const m = toon(hex, { semCache: true })
    if (tex) texturizar(m, { topo: tex, lado: tex, tam: tam ?? 2, contraste: tex === 'cal' ? 2.0 : 1.2 })
    if (chave.startsWith('bandeira')) m.side = THREE.DoubleSide // o pano da bandeira se vê dos dois lados
    mats[chave] = m
    if (doCfg) vivos.push([m, cor, hex])
  }
  // o ferro fundido dos felinos e o bronze do General: toon com realce e borda de céu (metal.js)
  for (const [chave, cor] of [['felinos', 'corFelinos'], ['general', 'corGeneral']]) {
    mats[chave] = materialMetal(cfg.marcos[cor])
    vivos.push([mats[chave], cor, cfg.marcos[cor]])
  }
  sincronizarMetal(cfg)
  // o creme do Excelsior com a luz rebatida do chão no lado da sombra (rebote.js): sem ela o lado de sombra saía violeta
  mats.excelsior = materialRebote(cfg.marcos.corExcelsior, { chao: 6 })
  vivos.push([mats.excelsior, 'corExcelsior', cfg.marcos.corExcelsior])
  sincronizarRebote(cfg)
  // o interior das janelas acesas e o vidro dos lampiões: não recebem luz (brilham no filtro à noite)
  mats.vaoAceso = luzFixa(new THREE.MeshBasicMaterial({ color: '#4a3a30' }), 0.6, globais.uNoite)
  mats.vaoAceso.userData.semSombra = true
  mats.vidro = luzFixa(new THREE.MeshBasicMaterial({ color: '#e8e0c8' }), 1, globais.uNoite)
  mats.vidro.userData.semSombra = true

  const escuro = new THREE.Color('#4a3a30')
  const quente = new THREE.Color('#ffb860').multiplyScalar(2.2)
  const apagado = new THREE.Color('#e8e0c8')
  const aceso = new THREE.Color('#ffc66a').multiplyScalar(2.4)
  return {
    mats,
    atualizar() {
      sincronizarMetal(cfg)
      sincronizarRebote(cfg)
      for (const v of vivos) {
        const hex = cfg.marcos[v[1]]
        if (hex !== v[2]) { v[0].color.set(hex); v[2] = hex }
      }
      const n = globais.uNoite.value
      mats.vaoAceso.color.copy(escuro).lerp(quente, n)
      mats.vidro.color.copy(apagado).lerp(aceso, n)
    },
  }
}
