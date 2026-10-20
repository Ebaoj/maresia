import * as T from 'three';
import {calcularAlturas,alturaTerreno,corChao,inclinacao} from '../../../src/mundo/terreno.js';
import {linhaCosta,larguraPraia,densidadeGrama} from '../../../src/mundo/mapa.js';
import {trechosJogo} from '../../../src/mundo/fortaleza1932.js';
import {geometriaBola,geometriaCoco} from '../../../src/mundo/objetos-fisicos.js';
import {geometriaCadeira} from '../../../src/mundo/cenografia.js';
import {toonVertice} from '../../../src/materiais.js';
import {CAL} from '../../../src/paleta.js';

export function criarAssets(scene,cfg){
 calcularAlturas();
 const x=(trechosJogo.praiaDoPeixe[0]+trechosJogo.praiaDoPeixe[1])/2,z=linhaCosta(x)+larguraPraia(x)+3.5,y=alturaTerreno(x,z);
 const altura=(xx,zz)=>alturaTerreno(x+xx,z+zz)-y,positions=[],colors=[],indices=[],n=Math.round(cfg.lado/cfg.passoTerreno),cor=new T.Color();
 for(let j=0;j<=n;j++)for(let i=0;i<=n;i++){
  const xx=-cfg.lado/2+i*cfg.lado/n,zz=-cfg.lado/2+j*cfg.lado/n,h=altura(xx,zz),incl=inclinacao(x+xx,z+zz),dens=densidadeGrama(x+xx,z+zz,h+y,incl);
  positions.push(xx,h,zz);corChao(x+xx,z+zz,h+y,incl,dens,cor);colors.push(cor.r,cor.g,cor.b);
 }
 for(let j=0;j<n;j++)for(let i=0;i<n;i++){const a=j*(n+1)+i,b=a+1,c=a+n+1,d=c+1;indices.push(a,c,b,b,c,d);}
 const ground=new T.BufferGeometry();ground.setAttribute('position',new T.Float32BufferAttribute(positions,3));ground.setAttribute('color',new T.Float32BufferAttribute(colors,3));ground.setIndex(indices);ground.computeVertexNormals();
 const material=toonVertice(),mesh=new T.Mesh(ground,material);mesh.receiveShadow=true;scene.add(mesh);
 const cadeiras=[];for(const sign of [-1,1]){const px=sign*cfg.lado*.32,pz=-cfg.lado*.20,h=altura(px,pz),chair=new T.Mesh(geometriaCadeira(CAL.mangue),material);chair.position.set(px,h,pz);chair.castShadow=chair.receiveShadow=true;scene.add(chair);cadeiras.push({x:px,z:pz,y:h,malha:chair});}
 return {altura,ground,cadeiras,origem:[x,y,z],geometrias:{bola:geometriaBola(),coco:geometriaCoco()},material};
}
