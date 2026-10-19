// KAN-74 (F4): quando o mapa de sombra dos objetos parados precisa ser refeito. Lógica pura (sem three, sem GPU),
// para testar em segundos.
//
// O mapa de sombra é uma janela quadrada em torno de um centro, olhando na direção do sol. O que está parado
// (casas, árvores, postes) pinta o mesmo mapa enquanto: (1) o sol não mudar (ele já anda em passos de
// cfg.mundo.passoSombraMin minutos, ver ceu.js); (2) o jogador não se afastar mais que `raio` do centro da janela
// (com o raio de 15 m a janela de 60 m sempre cobre pelo menos 45 m à volta dele); (3) o conjunto de objetos
// parados não mudar (a assinatura vem de sombra-estatica.js); (4) o tamanho do mapa não mudar.
// Enquanto vale, a pose da luz fica congelada: o centro que ceu.js alinha ao texel a cada quadro seria um mapa novo.

const GRAUS = Math.PI / 180

function cosEntre(a, b) {
  const la = Math.hypot(a.x, a.y, a.z) || 1
  const lb = Math.hypot(b.x, b.y, b.z) || 1
  return (a.x * b.x + a.y * b.y + a.z * b.z) / (la * lb)
}

export class PoliticaCacheSombra {
  constructor({ raio = 15, limiarSolGraus = 0.05 } = {}) {
    this.raio = raio
    this.cosLimiar = Math.cos(limiarSolGraus * GRAUS)
    this.valido = false
    this.centro = { x: 0, y: 0, z: 0 }
    this.dir = { x: 0, y: 1, z: 0 }
    this.pendente = null // motivo de uma invalidação pedida de fora
    this.refeitos = 0
    this.motivos = {}
  }

  invalidar(motivo = 'invalidado') { this.pendente = motivo }

  // Pose da luz deste quadro. Cache vale: devolve a guardada. Não vale: guarda a nova e manda refazer.
  decidir(centro, dir) {
    let motivo = null
    if (!this.valido) motivo = 'inicial'
    else if (this.pendente) motivo = this.pendente
    else if (cosEntre(dir, this.dir) < this.cosLimiar) motivo = 'sol'
    else if (Math.hypot(centro.x - this.centro.x, centro.z - this.centro.z) > this.raio) motivo = 'janela'
    if (motivo) {
      this.centro = { x: centro.x, y: centro.y, z: centro.z }
      this.dir = { x: dir.x, y: dir.y, z: dir.z }
      this.valido = true
      this.pendente = null
      this.refeitos++
      this.motivos[motivo] = (this.motivos[motivo] || 0) + 1
    }
    return { refazer: motivo !== null, motivo, centro: this.centro, dir: this.dir }
  }
}
