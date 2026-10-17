// Jolt Physics no navegador, só para pano (a física dos objetos fica no Rapier, fisica.js).
// Um mundo com uma camada, sem chão: cada roupa é um corpo mole preso ao esqueleto por "skinned
// constraints" (o ponto pode se afastar do lugar dele até uma distância máxima) e com anteparo do corpo
// (back stop: o ponto não passa para dentro da pele). Ver docs/roupas-plano.md.

import initJolt from 'jolt-physics'

let promessa = null

// carrega uma vez só (o motor tem ~3 MB) e devolve { J, sistema, corpos, passo(dt) }
export function carregarJolt() {
  if (promessa) return promessa
  promessa = initJolt().then((J) => {
    const conf = new J.JoltSettings()
    conf.mMaxBodies = 64
    conf.mMaxBodyPairs = 64
    conf.mMaxContactConstraints = 64
    const pares = new J.ObjectLayerPairFilterTable(1)
    const camadas = new J.BroadPhaseLayerInterfaceTable(1, 1)
    camadas.MapObjectToBroadPhaseLayer(0, new J.BroadPhaseLayer(0))
    conf.mObjectLayerPairFilter = pares
    conf.mBroadPhaseLayerInterface = camadas
    conf.mObjectVsBroadPhaseLayerFilter = new J.ObjectVsBroadPhaseLayerFilterTable(camadas, 1, pares, 1)
    const iface = new J.JoltInterface(conf)
    J.destroy(conf)
    const sistema = iface.GetPhysicsSystem()
    return {
      J,
      iface,
      sistema,
      corpos: sistema.GetBodyInterface(),
      temp: iface.GetTempAllocator(),
      passo(dt) { iface.Step(dt, 1) },
    }
  })
  return promessa
}
