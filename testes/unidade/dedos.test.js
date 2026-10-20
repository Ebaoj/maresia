// Regressão: converter filtrava os dedos pelo esqueleto simplificado, deixando a mão espalmada.
import { it, expect } from 'vitest'
import * as T from 'three'
import { converter, ossosPorNome, repouso, anexarDedos } from '../../src/jogador/retarget.js'

function rig(dedos=true){
  const raiz=new T.Group(),hips=new T.Bone();hips.name='Hips';hips.position.y=1;raiz.add(hips)
  for(const [name,parent,x,y,z]of [['LeftFoot',hips,.1,-1,0],['RightFoot',hips,-.1,-1,0],['LeftHand',hips,.5,.3,0]]){const b=new T.Bone();b.name=name;b.position.set(x,y,z);parent.add(b)}
  if(dedos){let parent=raiz.getObjectByName('LeftHand');for(let i=1;i<=3;i++){const b=new T.Bone();b.name='LeftHandIndex'+i;b.position.x=.03;parent.add(b);parent=b}}
  raiz.updateMatrixWorld(true);const ossos=ossosPorNome(raiz);return{raiz,ossos,rep:repouso(ossos)}
}
it('preserva as falanges existentes e o movimento gravado do dedo',()=>{
  const fonte=rig(),alvo=rig(),q=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),-.6)
  const clip=new T.AnimationClip('gesto',1,[new T.QuaternionKeyframeTrack('LeftHandIndex1.quaternion',[0,1],[0,0,0,1,...q.toArray()])])
  const c=converter(clip,fonte,alvo)
  expect(c.tracks.filter(t=>/HandIndex/.test(t.name))).toHaveLength(3)
  const mixer=new T.AnimationMixer(alvo.raiz);mixer.clipAction(c).play();mixer.setTime(.5)
  expect(alvo.ossos.get('LeftHandIndex1').quaternion.angleTo(new T.Quaternion())).toBeCloseTo(.3,3)
})

it('recupera os dedos depois de passar pelo esqueleto intermediário sem falanges',()=>{
  const fonte=rig(),boneco=rig(false),alvo=rig(),q=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),-.6)
  const original=new T.AnimationClip('gesto',1,[new T.QuaternionKeyframeTrack('LeftHandIndex1.quaternion',[0,1],[0,0,0,1,...q.toArray()])])
  const simplificado=converter(original,fonte,boneco)
  const final=converter(simplificado,boneco,alvo)
  anexarDedos(final,{raiz:fonte.raiz,clipe:original},alvo,fonte.rep)
  const mixer=new T.AnimationMixer(alvo.raiz);mixer.clipAction(final).play();mixer.setTime(.5)
  expect(alvo.ossos.get('LeftHandIndex1').quaternion.angleTo(new T.Quaternion())).toBeCloseTo(.3,3)
})

it('mantém a referência relaxada ao reconstruir os dedos depois do boneco intermediário',()=>{
 const fonte=rig(),boneco=rig(false),alvo=rig(),q=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),-.7)
 const original=new T.AnimationClip('andar',1,[new T.QuaternionKeyframeTrack('LeftHandIndex1.quaternion',[0,1],[0,0,0,1,0,0,0,1])])
 const referencia=new T.AnimationClip('caminhada gravada',2,[new T.QuaternionKeyframeTrack('LeftHandIndex1.quaternion',[0,1,2],[...q.toArray(),...q.toArray(),...q.toArray()])])
 const simples=converter(original,fonte,boneco),final=converter(simples,boneco,alvo)
 const registro={raiz:fonte.raiz,clipe:original,referenciaDedos:{registro:{raiz:fonte.raiz,clipe:referencia},fechamento:.12}}
 const novo=anexarDedos(final,registro,alvo,fonte.rep);const mixer=new T.AnimationMixer(alvo.raiz);mixer.clipAction(novo).play();mixer.setTime(.5)
 expect(alvo.ossos.get('LeftHandIndex1').quaternion.angleTo(new T.Quaternion())).toBeCloseTo(.7,3)
})

it('transfere a direção anatômica do dedo sem herdar a abertura da malha alvo',()=>{
 const montar=abertura=>{
  const a=rig(false),hand=a.ossos.get('LeftHand')
  for(const[n,x,y]of[['Index',.025,.08],['Middle',0,.09],['Pinky',-.03,.075]]){
   let parent=hand
   for(let i=1;i<=4;i++){const b=new T.Bone();b.name='LeftHand'+n+i;b.position.set(i===1?x:0,i===1?y:.025,0);if(i===1&&n==='Index')b.quaternion.setFromAxisAngle(new T.Vector3(0,0,1),abertura);parent.add(b);parent=b}
  }
  a.raiz.updateMatrixWorld(true);a.ossos=ossosPorNome(a.raiz);a.rep=repouso(a.ossos);return a
 }
 const fonte=montar(0),alvo=montar(.8),q=new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),.25)
 const clip=new T.AnimationClip('andar',1,[new T.QuaternionKeyframeTrack('LeftHandIndex1.quaternion',[0,1],[...q.toArray(),...q.toArray()])])
 const convertido=converter(clip,fonte,alvo);const mixer=new T.AnimationMixer(alvo.raiz);mixer.clipAction(convertido).play();mixer.setTime(.5);alvo.raiz.updateMatrixWorld(true)
 const a=alvo.ossos.get('LeftHandIndex1').getWorldPosition(new T.Vector3()),b=alvo.ossos.get('LeftHandIndex2').getWorldPosition(new T.Vector3())
 expect(b.sub(a).normalize().angleTo(new T.Vector3(0,1,0).applyQuaternion(q))).toBeLessThan(.01)
})
