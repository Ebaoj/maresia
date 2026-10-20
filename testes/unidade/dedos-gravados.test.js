// Regressão: caminhada com dedos espalmados e emenda abrupta do ciclo (relato 19/10/2026).
import {it,expect}from'vitest'
import *as T from'three'
import{usarDedosGravados}from'../../src/jogador/dedos.js'
const q=a=>new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),a).toArray()
it('usa a flexão gravada dos dedos, mantém o corpo e fecha a repetição sem salto',()=>{
 const corpo=new T.VectorKeyframeTrack('Hips.position',[0,1],[0,1,0,0,1.1,0]);const original=new T.AnimationClip('andar',1,[corpo,new T.QuaternionKeyframeTrack('LeftHandIndex1.quaternion',[0,1],[...q(0),...q(0)])])
 const referencia=new T.AnimationClip('caminhada gravada',2,[new T.QuaternionKeyframeTrack('LeftHandIndex1.quaternion',[0,1,2],[...q(.3),...q(.7),...q(.5)]),new T.QuaternionKeyframeTrack('RightHandIndex1.quaternion',[0,1,2],[...q(.5),...q(.4),...q(.6)])])
 const saida=usarDedosGravados(original,referencia,{fechamento:.12});expect(saida.duration).toBe(1);expect(saida.tracks.find(t=>t.name==='Hips.position')).toBe(corpo)
 const t=saida.tracks.find(t=>t.name==='LeftHandIndex1.quaternion'),interp=t.createInterpolant();expect(new T.Quaternion().fromArray(interp.evaluate(.5)).angleTo(new T.Quaternion())).toBeCloseTo(.7,3)
 expect(new T.Quaternion().fromArray(t.values).angleTo(new T.Quaternion().fromArray(t.values,t.values.length-4))).toBeLessThan(.001)
 const right=saida.tracks.find(t=>t.name==='RightHandIndex1.quaternion');expect(right.values[2]).not.toBeCloseTo(t.values[2],3)
 expect(original.tracks[1].values[2]).toBe(0)
})
