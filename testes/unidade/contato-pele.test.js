import {describe,it,expect} from 'vitest';
import * as T from 'three';
import {criarContatoPele} from '../../arte/visor/contato-pele.js';

function setup(){
 const bone=new T.Bone(),geo=new T.BoxGeometry(.2,.4,.16).translate(0,1,0),n=geo.attributes.position.count;
 geo.setAttribute('skinIndex',new T.Uint16BufferAttribute(new Uint16Array(n*4),4));
 geo.setAttribute('skinWeight',new T.Float32BufferAttribute(Array.from({length:n*4},(_,i)=>i%4===0?1:0),4));
 const body=new T.SkinnedMesh(geo);body.add(bone);body.updateMatrixWorld(true);body.bind(new T.Skeleton([bone]));
 const contact=criarContatoPele(body,{geometry:geo},.006),anchor=contact.ancorar([new T.Vector3(.02,1,.09)])[0];
 return {body,bone,contact,anchor};
}
describe('contato suplementar do tecido com a pele',()=>{
 // Regressão: o limite animado recolocava a camisa dentro do corpo; contato deve prevalecer.
 it('expulsa o tecido sem apagar seu deslizamento tangencial',()=>{
  const {contact,anchor}=setup(),p=new T.Vector3(.035,1.025,.07);
  expect(contact.projetar(p,.1,anchor)).toBe(true);
  expect(p.z).toBeCloseTo(.086,5);expect(p.x).toBeCloseTo(.035,6);expect(p.y).toBeCloseTo(1.025,6);
 });
 it('acompanha a pele animada e preserva pontos já separados',()=>{
  const {body,bone,contact,anchor}=setup();bone.position.z=.03;body.updateMatrixWorld(true);contact.atualizar();
  const p=new T.Vector3(.02,1,.09);contact.projetar(p,.1,anchor);expect(p.z).toBeCloseTo(.116,5);
  const outside=new T.Vector3(.02,1,.15);expect(contact.projetar(outside,.1,anchor)).toBe(false);expect(outside.z).toBe(.15);
 });
});
