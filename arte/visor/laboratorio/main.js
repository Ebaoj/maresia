import * as T from 'three';
import GUI from 'lil-gui';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {PADRAO} from '../../../src/config.js';
import {carregar,ossosPorNome,carregarMovimentosMixamo} from '../../../src/jogador/retarget.js';
import {adicionarCirculo,resolverColisoes} from '../../../src/mundo/colisao.js';
import {CAL} from '../../../src/paleta.js';
import {criarAssets} from './assets.js';
import {criarMotor} from './motor.js';
import {objetosDoTeste,poseRoteiro,impulsoChute,assinaturaMalha} from './roteiro.js';
import {percentil,registrarResultado,mostrarResultados,chaveResultados} from './medicao.js';

const $=s=>document.querySelector(s),params=new URLSearchParams(location.search),tipo=params.get('motor')==='ammo'?'ammo':'jolt',comRoupa=params.get('tecido')!=='0';
const cfg=structuredClone(PADRAO);try{Object.assign(cfg.laboratorioFisica,JSON.parse(localStorage.getItem('maresia.lab.config.v1')||'{}'));}catch{}
const lab=cfg.laboratorioFisica,dt=1/60,assinatura=JSON.stringify({versao:1,lab,personagem:cfg.personagem,tecido:comRoupa});
let modo=['roteiro','manual','queda'].includes(params.get('modo'))?params.get('modo'):'roteiro';
$('#modo').value=modo;$('#roupa').checked=comRoupa;
function link(motor,extra={}){const p=new URLSearchParams({motor,modo,tecido:comRoupa?'1':'0',...extra});if(params.get('vista'))p.set('vista',params.get('vista'));return location.pathname+'?'+p;}
for(const motor of ['jolt','ammo']){$('#'+motor).href=link(motor);if(motor===tipo)$('#'+motor).setAttribute('aria-current','page');}
$('#nomeMotor').textContent=(tipo==='jolt'?'Jolt':'Ammo / Bullet')+(comRoupa?' · roupa e objetos':' · objetos');
$('#roupa').onchange=e=>{location.href=link(tipo,{tecido:e.target.checked?'1':'0'});};
$('#medir').onclick=()=>{localStorage.removeItem(chaveResultados);location.href=link('jolt',{modo:'roteiro',medir:'jolt'});};
mostrarResultados();
new ResizeObserver(entries=>document.documentElement.style.setProperty('--header-h',entries[0].target.getBoundingClientRect().height+'px')).observe(document.querySelector('header'));
addEventListener('error',e=>{$('#estado').textContent='Erro na simulação: '+e.message;});
addEventListener('unhandledrejection',e=>{$('#estado').textContent='Erro na simulação: '+(e.reason?.message||e.reason);});

try{
 const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(lab.resolucao);renderer.setSize(innerWidth,innerHeight);renderer.toneMapping=T.AgXToneMapping;renderer.toneMappingExposure=1.2;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;document.body.append(renderer.domElement);
 const scene=new T.Scene();scene.background=new T.Color(CAL.cal);scene.fog=new T.Fog(CAL.cal,lab.lado,lab.lado*3);
 scene.add(new T.HemisphereLight(0xfff7e8,0x756a53,2.2));const sun=new T.DirectionalLight(0xfff2da,3);sun.position.set(-3,7,4);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=sun.shadow.camera.bottom=-lab.lado/2;sun.shadow.camera.right=sun.shadow.camera.top=lab.lado/2;sun.shadow.normalBias=.02;scene.add(sun);const fill=new T.DirectionalLight(0xcbd8ed,1);fill.position.set(3,2,-2);scene.add(fill);
 const assets=criarAssets(scene,lab);$('#estado').textContent='Carregando o Neto e as animações do Maresia…';
 const {raiz}=await carregar('/arte/finais/neto-v6-corpo.glb');scene.add(raiz);raiz.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=true;o.frustumCulled=false;}});
 const ossos=ossosPorNome(raiz),rest=new Map([...ossos].map(([n,b])=>[n,{p:b.position.clone(),q:b.quaternion.clone()}]));
 const {clipes,faltando}=await carregarMovimentosMixamo({alvo:{raiz,ossos},pasta:'/animacoes/mixamo/',nomes:['andar','correr','olhando']});if(faltando.length)throw Error('Falta animação do jogo: '+faltando.join(', '));
 $('#estado').textContent='Preparando '+tipo.toUpperCase()+' para roupa e objetos…';
 const motor=await criarMotor(tipo,raiz,cfg,comRoupa),{tecido,rigidos}=motor,mixer=new T.AnimationMixer(raiz),malha=assinaturaMalha(tecido);
 let atual=null,paused=false,t=0,acc=0,gravacao=null,wallStart=performance.now(),finished=false,medindo=!!params.get('medir'),bench=[],frames=0,lastFrame=performance.now(),live=[],fpsWindow=[],ultimoHud=0,rascunho=structuredClone(lab);
 if(medindo){$('#medir').textContent='Medindo '+tipo.toUpperCase()+'…';for(const id of ['reset','pausa','modo','roupa','gravar','aplicar','medir'])$('#'+id).disabled=true;}
 const vel=new T.Vector3(),prev=new T.Vector3(),keys=new Set(),camera=new T.PerspectiveCamera(40,innerWidth/innerHeight,.02,lab.lado*5),controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.maxDistance=lab.lado*2;controls.minDistance=.6;
 const actor=rigidos.capsula(.5,.33,[0,.85,0],{cinematico:true}),objetos=[];
 function clip(nome,imediato=false){if(atual===nome&&!imediato)return;const next=mixer.clipAction(clipes[nome]);if(imediato){mixer.stopAllAction();next.reset().play();}else{if(atual)mixer.clipAction(clipes[atual]).fadeOut(.18);next.reset().fadeIn(.18).play();}atual=nome;}
 function posicionar(p){raiz.position.set(p.x,assets.altura(p.x,p.z),p.z);raiz.rotation.y=p.yaw;}
 posicionar(poseRoteiro(0,lab,cfg.personagem));clip('olhando',true);mixer.update(0);raiz.updateMatrixWorld(true);tecido.reset();
 rigidos.terreno(assets.ground);
 for(const c of assets.cadeiras){adicionarCirculo(c.x,c.z,.28);rigidos.caixa([.24,.5,.24],[c.x,c.y+.5,c.z],{atrito:.7});}
 for(const d of objetosDoTeste(lab,assets.altura)){
  const mesh=new T.Mesh(assets.geometrias[d.tipo],assets.material);mesh.castShadow=mesh.receiveShadow=true;scene.add(mesh);
  const item=rigidos.esfera(d.raio,d.position,{massa:d.massa,atrito:d.atrito,restituicao:d.restituicao});objetos.push({...d,item,mesh});rigidos.ler(item,mesh);
 }
 $('#objetos').textContent=objetos.length;$('#nos').textContent=comRoupa?tecido.stats.particles:'desligado';
 $('#condicoes').textContent=`${lab.lado} × ${lab.lado} m da Praia do Peixe · ${lab.gravidade} m/s² · 60 passos/s · ${lab.subpassos} subpassos · semente ${lab.semente} · malha ${malha}. `+(tipo==='ammo'?'Ammo: contato detalhado com pele e calça.':'Jolt: restrições de pele e colisores convexos.');
 function view(nome){const p=raiz.position.clone(),close=nome!=='geral',r=close?lab.cameraDistancia*.34:lab.cameraDistancia,offset=new T.Vector3(r*.65,close?.55:lab.cameraAltura,r*(nome==='costas'?-1:1));if(close)offset.applyAxisAngle(new T.Vector3(0,1,0),raiz.rotation.y);controls.target.copy(p).add(new T.Vector3(0,.8,0));camera.position.copy(controls.target).add(offset);controls.update();params.set('vista',nome);for(const name of ['jolt','ammo'])$('#'+name).href=link(name);}
 for(const nome of ['geral','frente','costas'])$('#'+nome).onclick=()=>view(nome);view(params.get('vista')||'geral');
 const painel=new GUI({container:$('#painel'),title:'Mesmas condições nos dois motores'});for(const [key,label,min,max,step]of [['lado','Área (m)',8,24,1],['passoTerreno','Grade do recorte (m)',.25,2,.25],['semente','Semente',1,9999,1],['bolas','Bolas',1,12,1],['cocos','Cocos',0,30,1],['alturaQueda','Altura da queda (m)',.5,5,.25],['gravidade','Gravidade',5,35,1],['subpassos','Subpassos',1,4,1],['raioRoteiro','Raio do percurso (m)',1,4,.25],['duracaoMedicao','Roteiro (s simulados)',6,30,1],['cameraDistancia','Câmera: distância',3,12,.5],['cameraAltura','Câmera: altura',1,8,.25],['resolucao','Resolução',.5,2,.25]])painel.add(rascunho,key,min,max,step).name(label);
 $('#aplicar').onclick=()=>{localStorage.setItem('maresia.lab.config.v1',JSON.stringify(rascunho));location.reload();};
 function reset(){
  mixer.stopAllAction();for(const[n,b]of ossos){b.position.copy(rest.get(n).p);b.quaternion.copy(rest.get(n).q);}posicionar(poseRoteiro(0,lab,cfg.personagem));clip('olhando',true);mixer.update(0);raiz.updateMatrixWorld(true);rigidos.mover(actor,[raiz.position.x,raiz.position.y+.85,raiz.position.z],dt,true);tecido.reset();
  for(const o of objetos){rigidos.reset(o.item);rigidos.ler(o.item,o.mesh);}t=acc=0;finished=false;paused=false;bench=[];frames=0;live=[];fpsWindow=[];wallStart=lastFrame=performance.now();prev.copy(raiz.position);$('#pausa').textContent='Pausar';$('#estado').textContent='';view(params.get('vista')||'geral');
 }
 $('#reset').onclick=reset;$('#pausa').onclick=()=>{paused=!paused;$('#pausa').textContent=paused?'Continuar':'Pausar';};$('#modo').onchange=e=>{modo=e.target.value;params.set('modo',modo);history.replaceState(null,'',link(tipo));for(const name of ['jolt','ammo'])$('#'+name).href=link(name);reset();};
 addEventListener('keydown',e=>{if(/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;keys.add(e.code);if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();});addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>keys.clear());
 function simular(){
  prev.copy(raiz.position);let nome='olhando';
  if(modo==='roteiro'){const pose=poseRoteiro(t,lab,cfg.personagem);posicionar(pose);nome=pose.clipe;}
  else if(modo==='manual'){
   const dx=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft')),dz=Number(keys.has('KeyS')||keys.has('ArrowDown'))-Number(keys.has('KeyW')||keys.has('ArrowUp'));
   const speed=keys.has('ShiftLeft')||keys.has('ShiftRight')?cfg.personagem.corridaNova:cfg.personagem.velocidadeNova;
   if(dx||dz){const k=speed*dt/Math.hypot(dx,dz);raiz.position.x+=dx*k;raiz.position.z+=dz*k;raiz.rotation.y=Math.atan2(dx,dz);nome=speed===cfg.personagem.corridaNova?'correr':'andar';}
   resolverColisoes(raiz.position,.28);const half=lab.lado/2-.6;raiz.position.x=T.MathUtils.clamp(raiz.position.x,-half,half);raiz.position.z=T.MathUtils.clamp(raiz.position.z,-half,half);raiz.position.y=assets.altura(raiz.position.x,raiz.position.z);
  }
  clip(nome);mixer.update(dt);raiz.updateMatrixWorld(true);const start=performance.now();vel.copy(raiz.position).sub(prev).divideScalar(dt);rigidos.mover(actor,[raiz.position.x,raiz.position.y+.85,raiz.position.z],dt);
  for(const o of objetos){rigidos.ler(o.item,o.mesh);rigidos.amortecer(o.item,1/(1+o.amortecimentoAngular*dt));const impulse=impulsoChute(o,raiz.position,vel,o.mesh.position.toArray());if(impulse)rigidos.impulso(o.item,impulse);}
  motor.passo(dt);const ms=performance.now()-start;live.push(ms);if(live.length>240)live.shift();bench.push(ms);t+=dt;
  for(const o of objetos)rigidos.ler(o.item,o.mesh);
  const delta=raiz.position.clone().sub(prev);camera.position.add(delta);controls.target.add(delta);
  $('#etapa').textContent=modo==='manual'?'Explore o recorte do Maresia':modo==='queda'?'Mesmos objetos, mesma altura de queda':t<lab.duracaoMedicao/6?'1 · Repouso e queda dos objetos':t<lab.duracaoMedicao/2?'2 · Caminhada e contatos':t<lab.duracaoMedicao*5/6?'3 · Corrida e empurrões':'4 · Assentamento';
 }
 function concluir(){
  finished=true;const segundos=(performance.now()-wallStart)/1000;
  $('#fps').textContent=(frames/segundos).toFixed(1);$('#media').textContent=(bench.reduce((a,b)=>a+b,0)/bench.length).toFixed(2)+' ms';$('#p95').textContent=percentil(bench,.95).toFixed(2)+' ms';$('#tempo').textContent=t.toFixed(1)+' s';$('#ritmo').textContent=(t/segundos).toFixed(2)+'×';
  if(medindo){const resultado={motor:tipo,assinatura,malha,tecido:comRoupa,gravidade:lab.gravidade,subpassos:lab.subpassos,objetos:objetos.length,nos:tecido.stats.particles,passos:bench.length,simulado:t,real:segundos,mediaMs:bench.reduce((a,b)=>a+b,0)/bench.length,p95Ms:percentil(bench,.95),fps:frames/segundos,ritmo:t/segundos,objetosFinais:objetos.map(o=>({id:o.id,position:o.mesh.position.toArray()}))};registrarResultado(resultado);medindo=false;if(params.get('medir')==='jolt'){location.href=link('ammo',{modo:'roteiro',medir:'ammo'});return;}mostrarResultados();params.delete('medir');history.replaceState(null,'',link(tipo));$('#medir').textContent='Medir os dois';for(const id of ['reset','pausa','modo','roupa','gravar','aplicar','medir'])$('#'+id).disabled=false;}
  if(gravacao)gravacao.stop();$('#etapa').textContent='Roteiro concluído · reinicie para repetir';
 }
 $('#gravar').onclick=()=>{if(gravacao)return;modo='roteiro';$('#modo').value=modo;reset();const chunks=[],stream=renderer.domElement.captureStream(30),type=MediaRecorder.isTypeSupported('video/webm;codecs=vp9')?'video/webm;codecs=vp9':'video/webm';gravacao=new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:5000000});gravacao.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};gravacao.onstop=async()=>{const blob=new Blob(chunks,{type});stream.getTracks().forEach(t=>t.stop());try{await fetch('http://127.0.0.1:5204/capture',{method:'POST',headers:{'Content-Type':'video/webm'},body:blob});}catch{}const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='maresia-'+tipo+'.webm';a.textContent='Baixar vídeo de '+tipo.toUpperCase();$('#ajuda').replaceChildren(a);gravacao=null;$('#gravar').disabled=false;};gravacao.start(500);$('#gravar').disabled=true;$('#etapa').textContent='Gravando roteiro completo…';};
 renderer.compile(scene,camera);reset();$('#estado').textContent='';window.maresiaLaboratorio={motor,tipo,scene,renderer,raiz,objetos,malha,origem:assets.origem,ready:true};
 function frame(){requestAnimationFrame(frame);const now=performance.now(),delta=Math.min((now-lastFrame)/1000,.25);lastFrame=now;fpsWindow.push(delta);if(fpsWindow.length>120)fpsWindow.shift();frames++;
  if(!paused&&!finished){acc=Math.min(acc+delta,dt*2);let n=0;while(acc>=dt&&n<2){simular();acc-=dt;n++;if(modo==='roteiro'&&t>=lab.duracaoMedicao){concluir();break;}}}
  controls.update();renderer.render(scene,camera);
  if(now-ultimoHud>600&&!finished&&!paused){$('#fps').textContent=(fpsWindow.length/fpsWindow.reduce((a,b)=>a+b,0)).toFixed(1);$('#media').textContent=(live.length?live.reduce((a,b)=>a+b,0)/live.length:0).toFixed(2)+' ms';$('#p95').textContent=percentil(live,.95).toFixed(2)+' ms';$('#tempo').textContent=t.toFixed(1)+' s';$('#ritmo').textContent=(t/Math.max(.1,(now-wallStart)/1000)).toFixed(2)+'×';ultimoHud=now;}
 }frame();
 addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();});
}catch(error){$('#estado').textContent='Não foi possível preparar a cena: '+error.message;console.error(error);}
