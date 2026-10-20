import {criarAleatorio} from '../../../src/utils.js';
import {OBJETOS_FISICOS,massaObjeto} from '../../../src/mundo/objetos-fisicos.js';

export function objetosDoTeste(cfg,altura){
 const rnd=criarAleatorio(cfg.semente),items=[];
 for(const tipo of ['bola','coco'])for(let i=0;i<cfg[tipo==='bola'?'bolas':'cocos'];i++){
  const a=rnd.entre(0,2*Math.PI),r=cfg.raioRoteiro+rnd.entre(-.3,.3),x=Math.cos(a)*r,z=Math.sin(a)*r;
  items.push({id:tipo+i,tipo,...OBJETOS_FISICOS[tipo],massa:massaObjeto(tipo),position:[x,altura(x,z)+cfg.alturaQueda+OBJETOS_FISICOS[tipo].raio,z]});
 }
 return items;
}

// Só desloca o controle no mundo; as poses são os clipes gravados já usados no jogo.
export function poseRoteiro(tempo,cfg,personagem){
 const t=Math.max(0,Math.min(tempo,cfg.duracaoMedicao)),inicio=cfg.duracaoMedicao/6,meio=cfg.duracaoMedicao/2,fim=cfg.duracaoMedicao*5/6;
 const andando=Math.max(0,Math.min(t,meio)-inicio),correndo=Math.max(0,Math.min(t,fim)-meio);
 const distancia=andando*personagem.velocidadeNova+correndo*personagem.corridaNova,angle=distancia/cfg.raioRoteiro;
 const velocidade=t<inicio||t>=fim?0:t<meio?personagem.velocidadeNova:personagem.corridaNova;
 return {x:Math.cos(angle)*cfg.raioRoteiro,z:Math.sin(angle)*cfg.raioRoteiro,yaw:-angle,velocidade,clipe:velocidade===0?'olhando':t<meio?'andar':'correr'};
}

// Mesma regra de chute do mundo/fisica.js: impulso proporcional à massa/velocidade.
export function impulsoChute(obj,pos,vel,corpoPos){
 if(obj.tipo!=='bola')return null;
 const dx=corpoPos[0]-pos.x,dz=corpoPos[2]-pos.z,d=Math.hypot(dx,dz),contra=(vel.x*dx+vel.z*dz)/Math.max(d,1e-3);
 if(d>=.95||contra<=2||Math.abs(corpoPos[1]-(pos.y+.35))>=.8)return null;
 const f=obj.massa*Math.min(contra,9)*1.1;return [dx/d*f,f*.55,dz/d*f];
}

export function assinaturaMalha(tecido){
 let h=2166136261;const values=[];for(const piece of tecido.engine.pecas){values.push(piece.P,piece.proxy.faces.length);for(const p of piece.proxy.pontos)values.push(p.x,p.y,p.z);for(const f of piece.proxy.faces)values.push(...f);}
 const bytes=new Uint8Array(new Float64Array(values).buffer);for(const b of bytes)h=Math.imul(h^b,16777619);
 return (h>>>0).toString(16);
}
