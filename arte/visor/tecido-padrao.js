// Mesmo molde, pintura e topologia de simulação para os dois motores no laboratório.
import {compactarSuperficieAmmo} from './tecido-ammo-superficie.js';
import {limparSuperficieCamisa} from './tecido-ammo-malha.js';
import {ajustarEncaixeAmmo,ajustarBarraAmmo} from './tecido-ammo-encaixe.js';
export function prepararCamisaComparacao(groups,cfg){
 const shirt=groups.find(g=>g.name==='camisa');if(!shirt.mesh.userData.roupaProxy)return;
 const proxy=compactarSuperficieAmmo(shirt.mesh.userData.roupaProxy);shirt.mesh.userData.roupaProxy=proxy;
 ajustarBarraAmmo(proxy,cfg.ammoBarraExtra,cfg.ammoBarraTransicao);
 const torso=groups.find(g=>g.name==='corpo').parts.find(m=>m.material.name==='pele-torax');
 if(torso)ajustarEncaixeAmmo(proxy,torso,cfg.ammoEncaixeFolga,cfg.ammoEncaixeMaximo);
 limparSuperficieCamisa(shirt,true);
}
