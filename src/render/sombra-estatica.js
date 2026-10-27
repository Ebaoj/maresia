// KAN-74 (F4): registro dos objetos parados que projetam sombra. Só quem sabe que o objeto nunca se mexe registra
// (as malhas de blocos.js, de matriz congelada, e alguns outros). Quem não registra continua dinâmico: o mapa dele é
// refeito todo quadro, como sempre foi. Errar para o lado do dinâmico só perde ganho; nunca congela uma sombra.
const estaticos = new Set()

// Camada dos parados: o three escolhe os objetos do mapa de sombra pelas camadas da câmera, e o passe dos parados
// liga só esta. A camada 0 (o desenho normal) continua ligada neles.
export const BIT_ESTATICO = 1

export function registrarEstatico(objeto) {
  if (objeto && objeto.castShadow) {
    objeto.layers.enable(BIT_ESTATICO)
    estaticos.add(objeto)
  }
  return objeto
}

export function estaticosRegistrados() { return estaticos }

function aparece(o) {
  // visível de verdade: o objeto e os ancestrais (LOD liga e desliga a malha ou o grupo dela) e ainda na cena
  let raiz = o
  for (let n = o; n; n = n.parent) {
    if (n.visible === false) return false
    raiz = n
  }
  return raiz.isScene === true
}

// Muda quando algum parado aparece, some ou troca de quantidade de cópias: o mapa em cache já não vale.
export function assinaturaEstaticos() {
  let h = estaticos.size | 0
  for (const o of estaticos) {
    // semAssinatura (27/10/2026): malha cuja contagem muda com a câmera (LOD cópia a cópia das árvores) e cujas cópias
    // estão sempre no mapa por uma versão ou outra: só a visibilidade conta
    h = (Math.imul(h, 31) + (aparece(o) ? 1 + ((o.userData.semAssinatura ? 0 : (o.count ?? 0)) << 1) : 0)) | 0
  }
  return h
}

// só para os testes
export function limparEstaticos() { estaticos.clear() }
