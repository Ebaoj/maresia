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
}
globais.tLampioes.value.needsUpdate = true
