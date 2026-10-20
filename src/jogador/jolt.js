// Jolt Physics no navegador, só para pano (a física dos objetos fica no Rapier, fisica.js).
// Um mundo com uma camada, sem chão: cada roupa é um corpo mole preso ao esqueleto por "skinned
// constraints" (o ponto pode se afastar do lugar dele até uma distância máxima) e com anteparo do corpo
// (back stop: o ponto não passa para dentro da pele). Ver docs/roupas-plano.md.

import initJolt from 'jolt-physics'

let promessa = null

export const CAMADA = { PANO_SOLTO: 0, CORPO: 1, PANO_JUSTO: 2 }

// carrega uma vez só (o motor tem ~3 MB) e devolve { J, sistema, corpos, passo(dt) }
export function carregarJolt() {
  if (!promessa) promessa = criarMundoJolt()
  return promessa
}

// Mundo independente para o laboratório; o jogo preserva seu mundo de roupa existente.
export async function criarMundoJolt({laboratorio=false,gravidade=9.81,subpassos=1}={}) {
    const J=await initJolt()
    const conf = new J.JoltSettings()
    conf.mMaxBodies = laboratorio ? 256 : 64
    conf.mMaxBodyPairs = laboratorio ? 4096 : 256
    conf.mMaxContactConstraints = laboratorio ? 4096 : 256
    const n=laboratorio?6:3
    const pares = new J.ObjectLayerPairFilterTable(n)
    pares.EnableCollision(CAMADA.PANO_SOLTO, CAMADA.CORPO)
    // 3 objetos, 4 cápsula de empurrão, 5 chão/cadeira. Sem colisão da roupa
    // com a cápsula grossa do controle: o tecido continua tocando a pele.
    if(laboratorio)for(const [a,b] of [[0,3],[0,5],[1,3],[3,3],[3,4],[3,5]])pares.EnableCollision(a,b)
    const camadas = new J.BroadPhaseLayerInterfaceTable(n, 1)
    for (let c = 0; c < n; c++) camadas.MapObjectToBroadPhaseLayer(c, new J.BroadPhaseLayer(0))
    conf.mObjectLayerPairFilter = pares
    conf.mBroadPhaseLayerInterface = camadas
    conf.mObjectVsBroadPhaseLayerFilter = new J.ObjectVsBroadPhaseLayerFilterTable(camadas, 1, pares, n)
    const iface = new J.JoltInterface(conf)
    J.destroy(conf)
    const sistema = iface.GetPhysicsSystem(),g=new J.Vec3(0,-gravidade,0)
    sistema.SetGravity(g);J.destroy(g)
    return { J, iface, sistema, corpos:sistema.GetBodyInterface(),temp:iface.GetTempAllocator(),
      passo(dt) { iface.Step(dt, subpassos) },
    }
}
