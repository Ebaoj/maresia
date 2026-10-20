// Regressão: a camisa não tinha colisão com tronco/braços e precisava ficar quase imobilizada.
import { it, expect } from 'vitest'
import * as T from 'three'
import { criarRoupa } from '../../src/jogador/roupa.js'

it('o tronco rígido impede que a camisa solta permaneça dentro da pele', async () => {
  const root=new T.Group(),bone=new T.Bone();bone.name='mixamorig:Spine';root.add(bone);root.updateMatrixWorld(true)
  const skeleton=new T.Skeleton([bone])
  function mesh(geo,name){const n=geo.attributes.position.count;geo.setAttribute('skinIndex',new T.Uint16BufferAttribute(new Uint16Array(n*4),4));geo.setAttribute('skinWeight',new T.Float32BufferAttribute(Array.from({length:n*4},(_,i)=>i%4===0?1:0),4));geo.computeVertexNormals();const m=new T.SkinnedMesh(geo,new T.MeshBasicMaterial());m.name=m.material.name=name;root.add(m);m.bind(skeleton);return m}
  const body=mesh(new T.BoxGeometry(.2,.4,.16).translate(0,1,0),'corpo')
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute([-.04,.95,.07,.04,.95,.07,-.04,1.03,.07,.04,1.03,.07,-.04,1.30,.07,.04,1.30,.07],3));geo.setIndex([0,1,2,1,3,2,2,3,4,3,5,4])
  const shirt=mesh(geo,'camisa'),cloth=await criarRoupa([shirt,body])
  try {
    expect(cloth.colisores?.partes.some(p=>p.nome==='Spine')).toBe(true)
    for(let i=0;i<120;i++)cloth.atualizar(1/120,{vento:0})
    const p=cloth.pecas[0]
    for(let i=0;i<p.P;i++)if(p.proxy.pontos[i].y<1.05)expect(p.sim[i*3+2]).toBeGreaterThan(.08)
  } finally {for(const p of cloth.pecas){cloth.jolt.corpos.RemoveBody(p.corpo.GetID());cloth.jolt.corpos.DestroyBody(p.corpo.GetID())}cloth.colisores?.destruir()}
})
