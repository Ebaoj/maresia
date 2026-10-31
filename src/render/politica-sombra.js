// KAN-74 (F4): quando o mapa de sombra dos objetos parados precisa ser refeito. Lógica pura (sem three, sem GPU),
// para testar em segundos.
//
// O mapa de sombra é uma janela quadrada em torno de um centro, olhando na direção do sol. O que está parado
// (casas, árvores, postes) pinta o mesmo mapa enquanto: (1) o sol não mudar (ele já anda em passos de
// cfg.mundo.passoSombraMin minutos, ver ceu.js); (2) o jogador não se afastar mais que `raio` do centro da janela
// (com o raio de 15 m a janela de 60 m sempre cobre pelo menos 45 m à volta dele); (3) o conjunto de objetos
// parados não mudar (a assinatura vem de sombra-estatica.js); (4) o tamanho do mapa não mudar.
// Enquanto vale, a pose da luz fica congelada: o centro que ceu.js alinha ao texel a cada quadro seria um mapa novo.
//
// Intervalo mínimo entre refazimentos (24/10/2026): com cfg.mundo.passoSombraMin em 0 o sol anda sem parar e o
// mapa dos parados era refeito ~5 vezes por segundo (cada refazer é um passe de sombra inteiro: era o maior pico
// de quadro do jogo). O giro do sol passa a esperar `intervaloMin` segundos entre um refazer e o outro; a janela
// que andou com o jogador e o conjunto de parados não esperam (esses precisam valer na hora, senão a sombra some).

const GRAUS = Math.PI / 180

function cosEntre(a, b) {
  const la = Math.hypot(a.x, a.y, a.z) || 1
  const lb = Math.hypot(b.x, b.y, b.z) || 1
  return (a.x * b.x + a.y * b.y + a.z * b.z) / (la * lb)
}

export class PoliticaCacheSombra {
  constructor({ raio = 15, limiarSolGraus = 0.05, intervaloMin = 0 } = {}) {
    this.raio = raio
    this.cosLimiar = Math.cos(limiarSolGraus * GRAUS)
    this.intervaloMin = intervaloMin // segundos entre dois refazimentos por giro do sol (0 = sem espera)
    this.valido = false
    this.centro = { x: 0, y: 0, z: 0 }
    this.dir = { x: 0, y: 1, z: 0 }
    this.pendente = null // motivo de uma invalidação pedida de fora
    this.refeitos = 0
    this.motivos = {}
    this.ultimoRefazer = -Infinity // quando o mapa dos parados foi refeito pela última vez
  }

  invalidar(motivo = 'invalidado') { this.pendente = motivo }

  // Pose da luz deste quadro. Cache vale: devolve a guardada. Não vale: guarda a nova e manda refazer.
  // agora: o relógio em segundos (o que for passado pelo chamador); só o giro do sol usa a espera mínima.
  decidir(centro, dir, agora = 0) {
    let motivo = null
    if (!this.valido) motivo = 'inicial'
    else if (this.pendente) motivo = this.pendente
    else if (Math.hypot(centro.x - this.centro.x, centro.z - this.centro.z) > this.raio) motivo = 'janela'
    else if (cosEntre(dir, this.dir) < this.cosLimiar) {
      // o giro do sol é o motivo que mais refaz: espera o intervalo mínimo e adia (a pose fica congelada)
      if (this.intervaloMin > 0 && agora - this.ultimoRefazer < this.intervaloMin) motivo = null
      else motivo = 'sol'
    }
    if (motivo) {
      this.centro = { x: centro.x, y: centro.y, z: centro.z }
      this.dir = { x: dir.x, y: dir.y, z: dir.z }
      this.valido = true
      this.pendente = null
      this.refeitos++
      this.ultimoRefazer = agora
      this.motivos[motivo] = (this.motivos[motivo] || 0) + 1
    }
    return { refazer: motivo !== null, motivo, centro: this.centro, dir: this.dir }
  }
}
