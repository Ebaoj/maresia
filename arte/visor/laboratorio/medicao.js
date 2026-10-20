export const chaveResultados='maresia.lab.resultados.v1';
export function percentil(values,p){if(!values.length)return 0;const s=[...values].sort((a,b)=>a-b);return s[Math.min(s.length-1,Math.ceil(s.length*p)-1)];}
export function registrarResultado(resultado){const dados=JSON.parse(localStorage.getItem(chaveResultados)||'{}');dados[resultado.motor]=resultado;localStorage.setItem(chaveResultados,JSON.stringify(dados));return dados;}
export function mostrarResultados(){
 const dados=JSON.parse(localStorage.getItem(chaveResultados)||'{}'),rows=Object.values(dados);if(!rows.length)return;
 document.querySelector('#resultados').hidden=false;const table=document.querySelector('#tabela');table.replaceChildren();
 const t=document.createElement('table'),head=t.createTHead().insertRow();for(const text of ['Motor','Física média','p95','FPS','Ritmo']){const th=document.createElement('th');th.textContent=text;head.append(th);}
 for(const r of rows){const tr=t.createTBody().insertRow();for(const text of [r.motor.toUpperCase(),r.mediaMs.toFixed(2)+' ms',r.p95Ms.toFixed(2)+' ms',r.fps.toFixed(1),r.ritmo.toFixed(2)+'×'])tr.insertCell().textContent=text;}table.append(t);
 const equivalentes=rows.length===2&&rows[0].assinatura===rows[1].assinatura&&rows[0].malha===rows[1].malha;
 const estado=rows.every(r=>r.tecido)?'com tecido':rows.every(r=>!r.tecido)?'sem tecido':'condições diferentes de tecido';
 document.querySelector('#resultados > strong').textContent='Rodada salva · '+estado;
 document.querySelector('#notaResultado').textContent=equivalentes?'Mesmas entradas e malhas verificadas nesta rodada. Um motor ativo por vez.':'Execute “Medir os dois” para obter uma rodada com as mesmas condições.';
 document.querySelector('#baixar').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(dados,null,2)],{type:'application/json'}));a.download='maresia-jolt-ammo.json';a.click();URL.revokeObjectURL(a.href);};
}
