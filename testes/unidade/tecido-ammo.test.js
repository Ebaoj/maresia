import {describe,it,expect} from 'vitest';
import * as T from 'three';
import {compactarSuperficieAmmo,prepararPeleAmmo,simplificarPeleAmmo} from '../../arte/visor/tecido-ammo-superficie.js';
import {ajustarEncaixeAmmo,ajustarBarraAmmo} from '../../arte/visor/tecido-ammo-encaixe.js';
import {posicaoRenderAmmo} from '../../arte/visor/tecido-ammo-render.js';

describe('superfície do tecido Ammo',()=>{
 it('remove nós sem faces, que caíam soltos e esticavam a camisa',()=>{
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute([0,0,0,99,99,99,1,0,0,0,1,0],3));geo.setIndex([0,2,3]);
  const result=compactarSuperficieAmmo(geo);
  expect(result.attributes.position.count).toBe(3);expect([...result.index.array]).toEqual([0,1,2]);expect([...result.attributes.position.array]).not.toContain(99);
 });
 it('desenha a posição física sem somar uma segunda pose animada',()=>{
  const geo=new T.BufferGeometry();geo.setAttribute('aAmmoBase',new T.Float32BufferAttribute([0,.002,0],3));geo.setAttribute('aRoupaI',new T.Float32BufferAttribute([0,1,0,0],4));geo.setAttribute('aRoupaP',new T.Float32BufferAttribute([.25,.75,0,0],4));
  const mesh=new T.Mesh(geo),data=new Float32Array([0,1,.1,0,.04,1,.1,0]);
  const target=new T.Vector3(20,-30,100);posicaoRenderAmmo(mesh,0,data,target);
  expect(target.x).toBeCloseTo(.03);expect(target.y).toBeCloseTo(1.002);expect(target.z).toBeCloseTo(.1);
 });
});

// Regressões do contato detalhado: duplicatas causavam contatos sobrepostos;
// perder pesos durante a redução fazia o colisor se separar da pele animada.
describe('pele cinemática Ammo',()=>{
 function skin(geo){const n=geo.attributes.position.count;geo.setAttribute('skinIndex',new T.Uint16BufferAttribute(new Uint16Array(n*4),4));const w=new Float32Array(n*4);for(let i=0;i<n;i++)w[i*4]=1;geo.setAttribute('skinWeight',new T.Float32BufferAttribute(w,4));return geo;}
 it('reduz o colisor sem perder os pesos dos pontos mantidos',()=>{
  const geo=skin(new T.SphereGeometry(1,24,12));const si=geo.attributes.skinIndex,p=geo.attributes.position;
  for(let i=0;i<p.count;i++)si.setX(i,p.getX(i)>0?1:0);
  const welded=prepararPeleAmmo(geo),simple=simplificarPeleAmmo(welded,.5);
  expect(simple.attributes.position.count).toBeLessThan(welded.attributes.position.count);
  for(let i=0;i<simple.attributes.position.count;i++)expect(simple.attributes.skinIndex.getX(i)).toBe(simple.attributes.position.getX(i)>0?1:0);
 });
 it('recorta só a faixa do braço debaixo da manga, sem incluir as mãos',()=>{
  const geo=skin(new T.PlaneGeometry(1.4,.1,14,1));geo.translate(0,1.18,0);
  const cut=prepararPeleAmmo(geo,-Infinity,.4,.18),p=cut.attributes.position;
  expect(p.count).toBeGreaterThan(0);for(let i=0;i<p.count;i++)expect(Math.abs(p.getX(i))).toBeLessThanOrEqual(.401);
  const empty=prepararPeleAmmo(geo,2,.4,.18);expect(empty.index.count).toBe(0);
 });
 it('solda duplicatas de superfície mas conserva pesos diferentes',()=>{
  const base=new T.BufferGeometry();base.setAttribute('position',new T.Float32BufferAttribute([0,0,0,1,0,0,0,1,0,0,0,0,1,0,0,0,1,0],3));base.setIndex([0,1,2,3,4,5]);const geo=skin(base);
  const merged=prepararPeleAmmo(geo);expect(merged.attributes.position.count).toBe(3);expect(merged.index.count).toBe(3);
  geo.attributes.skinIndex.setX(3,1);const distinct=prepararPeleAmmo(geo);expect(distinct.attributes.position.count).toBe(4);expect(distinct.index.count).toBe(6);
  expect(simplificarPeleAmmo(distinct,.6)).toBe(distinct);
 });
});

describe('molde inicial Ammo',()=>{
 it('veste fora do corpo antes de calcular as costuras, sem alterar a pele',()=>{
  const geometry=new T.PlaneGeometry(.2,.2,1,1);geometry.translate(0,1,.09);
  const bodyGeo=new T.BoxGeometry(.4,.4,.2);bodyGeo.translate(0,1,0);
  const count=bodyGeo.attributes.position.count,w=new Float32Array(count*4);for(let i=0;i<count;i++)w[i*4]=1;
  bodyGeo.setAttribute('skinIndex',new T.Uint16BufferAttribute(new Uint16Array(count*4),4));bodyGeo.setAttribute('skinWeight',new T.Float32BufferAttribute(w,4));
  const body=new T.SkinnedMesh(bodyGeo),bone=new T.Bone();body.add(bone);body.updateMatrixWorld(true);body.bind(new T.Skeleton([bone]));
  const before=[...bodyGeo.attributes.position.array];const result=ajustarEncaixeAmmo(geometry,body,.012,.05);
  expect(result.adjusted).toBe(4);for(let i=0;i<4;i++)expect(geometry.attributes.position.getZ(i)).toBeCloseTo(.112,5);
  expect([...bodyGeo.attributes.position.array]).toEqual(before);
 });
 it('estende só a barra e mantém a gola',()=>{
  const geo=new T.PlaneGeometry(.4,.4,1,4);geo.translate(0,1,0);const before=[...geo.attributes.position.array];ajustarBarraAmmo(geo,.01,.025);
  const p=geo.attributes.position;for(let i=0;i<p.count;i++){const y=before[i*3+1];expect(p.getY(i)).toBeCloseTo(y<.81?y-.01:y,6);}
 });
});
