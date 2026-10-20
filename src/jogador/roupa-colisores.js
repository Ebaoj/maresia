// Volumes rígidos ajustados à pele, movidos pelos ossos. O corpo visível continua inteiro.
import * as T from 'three'
import { CAMADA } from './jolt.js'

const REGIOES = /^(Hips|Spine\d*|Neck|LeftShoulder|RightShoulder|LeftArm|RightArm|LeftForeArm|RightForeArm|LeftUpLeg|RightUpLeg|LeftLeg|RightLeg)$/

export function amostrarColisores(malha) {
  malha.updateWorldMatrix(true, false)
  const bones=malha.skeleton.bones, geo=malha.geometry, pos=geo.attributes.position
  const si=geo.attributes.skinIndex,sw=geo.attributes.skinWeight
  const grupos=new Map(),p=new T.Vector3(),q=new T.Quaternion(),s=new T.Vector3()
  for(let i=0;i<pos.count;i++){
    let dono=0,peso=-1
    for(let c=0;c<4;c++)if(sw.getComponent(i,c)>peso){peso=sw.getComponent(i,c);dono=si.getComponent(i,c)}
    const nome=bones[dono].name.replace(/^mixamorig\d*[:_]?/i,'')
    if(!REGIOES.test(nome))continue
    if(!grupos.has(dono))grupos.set(dono,new Map())
    p.fromBufferAttribute(pos,i)
    // Voxelização só do colisor, preservando a malha visual e seus pesos.
    const chave=[p.x,p.y,p.z].map(v=>Math.floor(v/.012)).join(',')
    grupos.get(dono).set(chave,i)
  }
  const partes=[]
  for(const [indice,amostras]of grupos){
    if(amostras.size<4)continue
    const bone=bones[indice],nome=bone.name.replace(/^mixamorig\d*[:_]?/i,'')
    bone.updateWorldMatrix(true,false);bone.matrixWorld.decompose(p,q,s)
    const inversa=bone.matrixWorld.clone().invert(),pontos=[]
    for(const i of amostras.values())pontos.push(new T.Vector3().fromBufferAttribute(pos,i).applyMatrix4(malha.matrixWorld).applyMatrix4(inversa).multiply(s))
    partes.push({nome,bone,pontos})
  }
  return partes
}

export function criarColisores(jolt,malha){
  const {J,corpos}=jolt,partes=[],p=new T.Vector3(),q=new T.Quaternion(),s=new T.Vector3()
  for(const {nome,bone,pontos}of amostrarColisores(malha)){
    const conf=new J.ConvexHullShapeSettings(),v=new J.Vec3(0,0,0)
    conf.mMaxConvexRadius=0
    for(const ponto of pontos){v.Set(ponto.x,ponto.y,ponto.z);conf.mPoints.push_back(v)}
    J.destroy(v)
    const resultado=conf.Create()
    if(resultado.HasError()){const erro=resultado.GetError().c_str();J.destroy(resultado);J.destroy(conf);throw Error('Colisor '+nome+': '+erro)}
    const origem=bone.getWorldPosition(new T.Vector3()),rotacao=bone.getWorldQuaternion(new T.Quaternion())
    const rv=new J.RVec3(origem.x,origem.y,origem.z),jq=new J.Quat(rotacao.x,rotacao.y,rotacao.z,rotacao.w)
    const cs=new J.BodyCreationSettings(resultado.Get(),rv,jq,J.EMotionType_Kinematic,CAMADA.CORPO)
    cs.mFriction=.25
    const corpo=corpos.CreateBody(cs);corpos.AddBody(corpo.GetID(),J.EActivation_Activate)
    partes.push({nome,bone,corpo,pontos})
    J.destroy(cs);J.destroy(rv);J.destroy(jq);J.destroy(resultado);J.destroy(conf)
  }
  const rv=new J.RVec3(0,0,0),jq=new J.Quat(0,0,0,1)
  return {
    partes,
    mover(dt,pulou){
      for(const parte of partes){
        parte.bone.matrixWorld.decompose(p,q,s);rv.Set(p.x,p.y,p.z);jq.Set(q.x,q.y,q.z,q.w)
        if(pulou)corpos.SetPositionAndRotation(parte.corpo.GetID(),rv,jq,J.EActivation_Activate)
        else corpos.MoveKinematic(parte.corpo.GetID(),rv,jq,dt)
      }
    },
    destruir(){for(const parte of partes){corpos.RemoveBody(parte.corpo.GetID());corpos.DestroyBody(parte.corpo.GetID())}J.destroy(rv);J.destroy(jq)},
  }
}
