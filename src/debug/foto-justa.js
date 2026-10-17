// Foto justa (motor F2, KAN-68 T1): o mesmo quadro desenhado pelo WebGL e pelo WebGPU, para comparar imagem.
// Só no modo de desenvolvimento. Abrir o jogo com ?foto (já abre pausado, nenhum quadro roda com o relógio de
// verdade) e chamar, no console ou pelo CDP:
//   await maresia.fotoJusta({ rotulo: 'webgl-1' })
// Para cada lugar: fixa a hora e a época, põe o jogador e a câmera, avança o mundo em passos fixos de 1/60 s
// sem desenhar e desenha um quadro só, em 1280x720 e escala 1. Como a sequência de passos é a mesma e todo
// sorteio do jogo tem semente, os dois renderizadores chegam no mesmo estado (ondas, fumaça, animação).
// As fotos vão para infra/modal-jogo/testes/fotos-justas/<rotulo>/<lugar>.png (pelo servidor do Vite) ou
// voltam como dataURL (salvar: false, para o Modal).

// tudo carregado: modelos em segundo plano (corpo do neto, avôs) e as imagens das texturas da cena
function texturasProntas(cena) {
  let ok = true
  const ver = (t) => {
    if (!t || !t.isTexture || t.isRenderTargetTexture || t.isDataTexture) return
    const im = t.image
    if (!im || (im instanceof HTMLImageElement && !(im.complete && im.naturalWidth > 0))) ok = false
  }
  cena.traverse((o) => {
    for (const mt of [].concat(o.material || [])) {
      for (const k of ['map', 'alphaMap', 'gradientMap', 'emissiveMap', 'normalMap']) ver(mt[k])
      const tp = mt.userData?.texPintada || mt.original?.userData?.texPintada
      if (tp) { ver(tp.topo); ver(tp.lado); ver(tp.alt) }
    }
  })
  return ok
}

async function esperarCarregar(m) {
  await m.pronto
  for (let i = 0; i < 600 && !texturasProntas(m.cena); i++) await new Promise((r) => setTimeout(r, 100))
}

// Cada lugar tem posição e câmera próprias (não herda as do anterior): uma foto sozinha (so: [...]) sai do mesmo
// lugar que na rodada inteira. O resto do mundo (tempo, partículas, física, pegadas) depende dos lugares tirados
// antes, então só a rodada inteira é comparável com outra rodada inteira.
// inicio: onde o jogo começa; fundo: o ponto dos peixes, olhando para o outro lado (yawCam).
const LUGARES_BASE = [
  { nome: 'inicio', alvo: null },
  { nome: 'fogareiro', alvo: 'fatia-fogareiro', dist: 2.6, yaw: 0.6 },
  { nome: 'tauacu', alvo: 'fatia-tauacu', dist: 2.4, yaw: 2.2 },
  { nome: 'peixes', alvo: 'fatia-peixe', dist: 2.8, yaw: -0.4 },
  { nome: 'fundo', alvo: 'fatia-peixe', dist: 2.8, yaw: -0.4, yawCam: 2.6 },
  { nome: 'barraca', alvo: 'fatia-fogareiro', dist: 3.2, yaw: 3.4 },
]
const HORAS = [['manha', 9.5], ['tarde', 17.1], ['noite', 21.0]]
const EPOCAS = [['1932', 0], ['1881', 1]]

// os 36 quadros do KAN-68 (R4): 6 lugares x 3 horas x 2 épocas
export const LUGARES_FOTO = EPOCAS.flatMap(([ep, memoria]) => HORAS.flatMap(([h, hora]) =>
  LUGARES_BASE.map((l) => ({ ...l, nome: `${l.nome}-${h}-${ep}`, hora, memoria }))))

function posicionar(m, l, comeco) {
  if (!l.alvo) {
    m.irPara(comeco.x, comeco.z, comeco.yaw, l.hora)
    return
  }
  let p = null
  m.cena.traverse((o) => {
    if (p || !o.name || !o.name.startsWith(l.alvo)) return
    o.updateWorldMatrix(true, false)
    const T = o.position.constructor
    if (o.isInstancedMesh) {
      const mt = o.matrixWorld.clone()
      const mi = mt.clone()
      o.getMatrixAt(0, mi)
      p = new T().setFromMatrixPosition(mt.multiply(mi))
    } else {
      o.geometry.computeBoundingSphere()
      p = o.geometry.boundingSphere.center.clone().applyMatrix4(o.matrixWorld)
    }
  })
  if (!p) throw new Error('foto justa: não achei ' + l.alvo)
  m.irPara(p.x + Math.sin(l.yaw) * l.dist, p.z + Math.cos(l.yaw) * l.dist, l.yaw, l.hora)
  if (l.yawCam !== undefined) m.cam.yaw = l.yawCam
}

export function instalar(m) {
  // onde o jogo começa (o ?foto abre pausado, então ninguém andou ainda)
  const comeco = { x: m.jogador.pos.x, z: m.jogador.pos.z, yaw: m.cam.yaw }
  m.lugaresFoto = LUGARES_FOTO
  m.fotoJusta = async ({ rotulo = 'teste', lugares = LUGARES_FOTO, so = null, largura = 1280, altura = 720, passos = 180, salvar = true } = {}) => {
    const pausadoAntes = m.controle.pausado
    m.controle.pausado = true
    await esperarCarregar(m)
    const antes = { hora: m.cfg.tempo.hora, pausado: m.cfg.tempo.pausado, memoria: m.cfg.estilo.memoria }
    m.tamanhoFixo(largura, altura)
    const saida = {}
    try {
      // quadro de aquecimento, igual nos dois: no WebGPU o mapa de sombra só existe depois do primeiro desenho
      m.passo(1 / 60, true)
      for (const l of lugares) {
        if (so && !so.includes(l.nome)) continue
        m.cfg.tempo.hora = l.hora
        m.cfg.tempo.pausado = true
        m.cfg.estilo.memoria = l.memoria ?? 0
        posicionar(m, l, comeco)
        for (let i = 0; i < passos; i++) m.passo(1 / 60, false)
        // quadro novo para o WebGPU antes de desenhar: o three só atualiza o que é "por quadro" (ossos da animação,
        // entre outros) quando o contador de quadros dele anda, e ele só anda no quadro do navegador (que nem
        // acontece com a aba escondida). Sem isso a foto saía com o boneco parado onde estava na primeira foto
        if (m.webgpu) m.renderer._nodes.nodeFrame.update()
        m.passo(1 / 60, true)
        // logo depois de desenhar, antes do navegador apresentar o quadro
        const png = m.canvas.toDataURL('image/png')
        if (salvar) await fetch(`/__foto?rotulo=${encodeURIComponent(rotulo)}&nome=${encodeURIComponent(l.nome)}`, { method: 'POST', body: png })
        else saida[l.nome] = png
      }
    } finally {
      Object.assign(m.cfg.tempo, { hora: antes.hora, pausado: antes.pausado })
      m.cfg.estilo.memoria = antes.memoria
      m.tamanhoFixo()
      m.controle.pausado = pausadoAntes
    }
    return salvar ? { rotulo } : saida
  }
}
