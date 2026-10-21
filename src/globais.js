import * as THREE from 'three'

// Valores que vários shaders leem ao mesmo tempo.
// Mudou aqui, muda em todos (janelas acesas, postes, farol, mar).
export const globais = {
  uNoite: { value: 0 },
  uTempo: { value: 0 },
  uSolDir: { value: new THREE.Vector3(0, 1, 0) },
  uSolCor: { value: new THREE.Color(1, 1, 1) },
  uAmbiente: { value: new THREE.Color(0.5, 0.5, 0.6) },
  uNevoaCor: { value: new THREE.Color(1, 0.8, 0.6) },
  uNevoaPerto: { value: 120 },
  uNevoaLonge: { value: 850 },
  uPincel: { value: 0.35 },
  // luz de referência (sol + céu agora): divide a luz de cada pixel para dar 0 a 1
  uLuzRef: { value: 3 },
  uVentoPalm: { value: 1 },
  uPincelEscala: { value: 0.6 },
  // luz dos lampiões a gás: mapa visto de cima (R = quanta luz chega, G = altura do lampião)
  tLampioes: { value: new THREE.DataTexture(new Uint8Array(4), 1, 1) },
  uLampMin: { value: new THREE.Vector2(0, 0) },
  uLampTam: { value: new THREE.Vector2(1, 1) },
  uCorLamp: { value: new THREE.Color('#ffb45c') },
  // pintor de luz (visual Arcane, docs/pesquisa-arcane.md): três faixas pintadas em vez dos degraus do quadrinho
  uArcane: { value: 0 },
  uArcLim: { value: new THREE.Vector2(0.38, 0.72) }, // onde a sombra vira meio-tom e o meio-tom vira luz (0 a 1 de luz)
  uArcSuave: { value: 0.05 },
  uArcPincel: { value: 0.35 }, // quanto a pincelada (presa ao mundo) recorta a borda entre as faixas
  uArcCorSombra: { value: new THREE.Color('#5d6e9e') },
  uArcNiveis: { value: new THREE.Vector3(0.5, 0.8, 1.05) }, // força da sombra, do meio-tom e da luz
  uTexForca: { value: 0.8 },
  uArcRim: { value: 0.6 }, // luz de recorte quente nas bordas que pegam sol por trás
  uArcCeu: { value: 1 }, // céu pintado (pinceladas e nuvens de pincel) // quanto a textura pintada do mundo pesa (materiais.js, texturizar)
  uArcPintado: { value: 1 }, // o passe novo do céu: gradiente de verdade, nuvens em massas e halo pintado
  uArcDesgaste: { value: 1 }, // reboco envelhecido (mundo/desgaste.js): cfg.estilo.arcDesgaste no visual Arcane, 0 no quadrinho
  uArcCeuPincel: { value: 1 }, // céu pintado (mundo/ceu-pintado.js): riscos de pincel seco, grão e banco de cúmulos
  uSertao: { value: 0 }, // sol alto do sertão (ceu.js): sombra dura e escura ao meio-dia, vezes cfg.estilo.arcSertao
  uDourada: { value: 0 }, // hora dourada (ceu.js): 0 com o sol alto ou de noite, 1 com o sol baixo de dia, vezes cfg.estilo.arcDourada
  uArCor: { value: new THREE.Color('#9cc9e0') }, // a cor do ar: a distância se tinge com o céu da hora
}
globais.tLampioes.value.needsUpdate = true

// Quantas texturas carregadas de arquivo já chegaram (materiais.js, texturaPintada). O remendo do observador de parados
// (render/renderizador.js) refaz o grupo de ligação de quem foi desenhado antes da chegada: sem isso o parado ficava com
// a textura provisória, preta, para sempre (o chão preto perto do Forte no WebGPU, 21/10/2026)
export const geracaoTexturas = { valor: 0 }
