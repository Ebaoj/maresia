import {describe,it,expect} from 'vitest';
import {objetosDoTeste,poseRoteiro,impulsoChute} from '../../arte/visor/laboratorio/roteiro.js';
import {PADRAO} from '../../src/config.js';
import {massaObjeto,OBJETOS_FISICOS,geometriaBola,geometriaCoco} from '../../src/mundo/objetos-fisicos.js';
import {percentil} from '../../arte/visor/laboratorio/medicao.js';
// A comparação perde validade se as entradas ou o impulso mudarem conforme o motor.
describe('laboratório do Maresia',()=>{
 it('gera os mesmos objetos com a mesma semente, geometrias e densidades do jogo',()=>{
  const a=objetosDoTeste(PADRAO.laboratorioFisica,()=>0),b=objetosDoTeste(PADRAO.laboratorioFisica,()=>0);expect(a).toEqual(b);expect(a.length).toBe(16);
  for(const o of a)expect(o.massa).toBeCloseTo(4*Math.PI*o.raio**3*o.densidade/3,12);
  expect(geometriaBola().attributes.color).toBeDefined();expect(geometriaCoco().attributes.color).toBeDefined();
 });
 it('desloca o controle com velocidades do jogo e sem saltos na troca de animação',()=>{
  const cfg=PADRAO.laboratorioFisica,p=PADRAO.personagem;
  expect(poseRoteiro(0,cfg,p).clipe).toBe('olhando');expect(poseRoteiro(3,cfg,p).velocidade).toBe(p.velocidadeNova);expect(poseRoteiro(7,cfg,p).velocidade).toBe(p.corridaNova);
  for(const t of [2,6,10]){const a=poseRoteiro(t-1e-6,cfg,p),b=poseRoteiro(t+1e-6,cfg,p);expect(Math.hypot(a.x-b.x,a.z-b.z)).toBeLessThan(.0001);}
 });
 it('mantém o chute proporcional à massa como no mundo do jogo',()=>{
  const o={tipo:'bola',massa:massaObjeto('bola')},pos={x:0,y:0,z:0},vel={x:3,z:0},imp=impulsoChute(o,pos,vel,[.5,.35,0]);expect(imp[0]/o.massa).toBeCloseTo(3.3);expect(imp[1]).toBeCloseTo(imp[0]*.55);expect(impulsoChute({...o,tipo:'coco'},pos,vel,[.5,.35,0])).toBeNull();
  expect(OBJETOS_FISICOS.bola.restituicao).toBe(.5);
 });
 it('calcula p95 sem confundir a média com os piores passos',()=>{expect(percentil(Array.from({length:100},(_,i)=>i+1),.95)).toBe(95);});
});
