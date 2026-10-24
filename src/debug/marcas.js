// Marcas de eventos para achar o que travou um quadro (24/10/2026, investigação do pico de ~160 ms).
// Barato: só empurra { t, nome } num anel de 256. O rastreador do medidor (debug/medidor.js) junta as marcas com
// os quadros lentos. Fica fora do modo dev também porque custa nada e os ganchos estão em código do jogo.

const TAM = 256
const anel = new Array(TAM)
let n = 0

export function marcar(nome, dados) {
  anel[n % TAM] = { t: performance.now(), nome, dados }
  n++
}

// marcas com t em (de, ate]
export function marcasEntre(de, ate, saida = []) {
  const ini = Math.max(0, n - TAM)
  for (let i = ini; i < n; i++) {
    const e = anel[i % TAM]
    if (e.t > de && e.t <= ate) saida.push(e)
  }
  return saida
}

export function limparMarcas() { n = 0 }
