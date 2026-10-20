// Regression: the render mesh has thin inner faces with a different dominant bone.
// Physics must use the supplied single sheet; both render layers must still receive displacement.
import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { criarRoupa } from '../../src/jogador/roupa.js'

describe('proxy de tecido em camada única', () => {
  it('exclui a parede interna da simulação e mapeia todos os vértices desenhados', async () => {
    const outer = new THREE.BufferGeometry()
    outer.setAttribute('position', new THREE.Float32BufferAttribute([-.10,.80,0, .10,.80,0, .10,1.20,0, -.10,1.20,0], 3))
    outer.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(16).fill(0), 4))
    outer.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0], 4))
    outer.setIndex([0,1,2,0,2,3]); outer.computeVertexNormals()
    const render = outer.clone()
    render.setAttribute('position', new THREE.Float32BufferAttribute([...outer.attributes.position.array, -.10,.80,-.001, .10,.80,-.001, .10,1.20,-.001, -.10,1.20,-.001], 3))
    render.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([...outer.attributes.skinIndex.array, 1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0], 4))
    render.setAttribute('skinWeight', new THREE.Float32BufferAttribute([...outer.attributes.skinWeight.array,...outer.attributes.skinWeight.array], 4))
    render.setIndex([0,1,2,0,2,3,6,5,4,7,6,4]);render.computeVertexNormals()
    const root = new THREE.Group(),a=new THREE.Bone(),b=new THREE.Bone();a.name='mixamorig:Spine2';b.name='mixamorig:Neck';root.add(a);a.add(b);root.updateMatrixWorld(true)
    const mesh=new THREE.SkinnedMesh(render,new THREE.MeshBasicMaterial());mesh.name='camisa';mesh.material.name='camisa';mesh.bind(new THREE.Skeleton([a,b]));mesh.userData.roupaProxy=outer;root.add(mesh)
    const cloth=await criarRoupa([mesh])
    try {
      expect(cloth.pecas[0].proxy.pontos).toHaveLength(4)
      expect(render.attributes.aRoupaI.count).toBe(8)
      const weights=render.attributes.aRoupaP
      for(let i=0;i<weights.count;i++)expect(weights.getX(i)+weights.getY(i)+weights.getZ(i)+weights.getW(i)).toBeCloseTo(1,5)
    } finally {
      for(const p of cloth.pecas){cloth.jolt.corpos.RemoveBody(p.corpo.GetID());cloth.jolt.corpos.DestroyBody(p.corpo.GetID())}
    }
  })
})


describe('roupa acompanha animação depois do repouso', () => {
  it('reativa o pano quando os alvos do esqueleto mudam', async () => {
    const geo=new THREE.BufferGeometry()
    geo.setAttribute('position',new THREE.Float32BufferAttribute([-.1,.8,0, .1,.8,0, .1,1.2,0, -.1,1.2,0],3))
    geo.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(new Array(16).fill(0),4))
    geo.setAttribute('skinWeight',new THREE.Float32BufferAttribute([1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0],4))
    geo.setIndex([0,1,2,0,2,3]);geo.computeVertexNormals()
    const root=new THREE.Group(),bone=new THREE.Bone();root.add(bone);root.updateMatrixWorld(true)
    const mesh=new THREE.SkinnedMesh(geo,new THREE.MeshBasicMaterial());mesh.name=mesh.material.name='camisa';root.add(mesh);mesh.bind(new THREE.Skeleton([bone]))
    const cloth=await criarRoupa([mesh]),p=cloth.pecas[0]
    try {
      cloth.atualizar(1/60,{vento:0})
      cloth.jolt.corpos.DeactivateBody(p.corpo.GetID())
      bone.position.x=.05
      root.updateMatrixWorld(true)
      cloth.atualizar(1/60,{vento:0})
      expect(p.corpo.IsActive()).toBe(true)
      for(let i=0;i<p.P;i++)if(p.presos[i])expect(Math.hypot(...p.dados.subarray(i*4,i*4+3))).toBeLessThan(.002)
    } finally {
      cloth.jolt.corpos.RemoveBody(p.corpo.GetID());cloth.jolt.corpos.DestroyBody(p.corpo.GetID())
    }
  })
})


describe('calça ajustada ao corpo', () => {
  it('mantém quadril e pernas no esqueleto e permite movimento nas barras', async () => {
    const geo=new THREE.BufferGeometry()
    geo.setAttribute('position',new THREE.Float32BufferAttribute([-.1,.2,0,.1,.2,0,-.1,.6,0,.1,.6,0,-.1,.9,0,.1,.9,0],3))
    geo.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(new Array(24).fill(0),4))
    geo.setAttribute('skinWeight',new THREE.Float32BufferAttribute(Array.from({length:24},(_,i)=>i%4===0?1:0),4))
    geo.setIndex([0,1,2,1,3,2,2,3,4,3,5,4]);geo.computeVertexNormals()
    const bone=new THREE.Bone(),mesh=new THREE.SkinnedMesh(geo,new THREE.MeshBasicMaterial());mesh.name=mesh.material.name='calca';mesh.add(bone);mesh.updateMatrixWorld(true);mesh.bind(new THREE.Skeleton([bone]))
    const camisa=new THREE.SkinnedMesh(geo.clone().translate(0,1,0),new THREE.MeshBasicMaterial());camisa.name=camisa.material.name='camisa';camisa.bind(mesh.skeleton)
    const cloth=await criarRoupa([camisa,mesh]),p=cloth.pecas[1]
    try {
      for(let i=0;i<p.P;i++)if(p.proxy.pontos[i].y>.5)expect(p.maxDist[i]).toBe(0)
      expect(Math.max(...p.maxDist)).toBeGreaterThan(.03)
    } finally {
      for(const piece of cloth.pecas){cloth.jolt.corpos.RemoveBody(piece.corpo.GetID());cloth.jolt.corpos.DestroyBody(piece.corpo.GetID())}
    }
  })
})

it('conserva a topologia da superfície física fornecida, sem fundir seus vértices numa grade',async()=>{
 const geo=new THREE.BufferGeometry(),positions=[]
 for(let y=0;y<3;y++)for(let x=0;x<3;x++)positions.push((x-1)*.04,.8+y*.04,0)
 geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(new Array(36).fill(0),4));geo.setAttribute('skinWeight',new THREE.Float32BufferAttribute(Array.from({length:36},(_,i)=>i%4===0?1:0),4))
 const indices=[];for(let y=0;y<2;y++)for(let x=0;x<2;x++){const i=y*3+x;indices.push(i,i+1,i+3,i+1,i+4,i+3)}geo.setIndex(indices);geo.computeVertexNormals()
 const bone=new THREE.Bone(),mesh=new THREE.SkinnedMesh(geo.clone(),new THREE.MeshBasicMaterial());mesh.name=mesh.material.name='camisa';mesh.add(bone);mesh.updateMatrixWorld(true);mesh.bind(new THREE.Skeleton([bone]));mesh.userData.roupaProxy=geo
 const cloth=await criarRoupa([mesh]);try{expect(cloth.pecas[0].P).toBe(9);expect(cloth.pecas[0].proxy.faces).toHaveLength(8)}finally{for(const p of cloth.pecas){cloth.jolt.corpos.RemoveBody(p.corpo.GetID());cloth.jolt.corpos.DestroyBody(p.corpo.GetID())}}
})
