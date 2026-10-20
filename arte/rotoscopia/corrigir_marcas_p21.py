"""Correções manuais após inspeção de todos os 39 quadros.
O rastreio perdeu a perna distante quando cruzou a outra; corrigida na imagem.
"""
raise SystemExit('Versão 1 recusada pelo usuário. Use revisar_marcas_p21_v2.py; não sobrescrever a revisão 2.')
from pathlib import Path
import json
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'arte/finais/rotoscopia-p21';SRC=ROOT/'arte/entradas/referencias/catalogo-2026-10-18/P21/empurrar-barco'
Q=json.loads((OUT/'rastreio-bruto.json').read_text())
# Joelho, tornozelo e ponta do calçado DISTANTES, em pixels originais.
rows=[
(1002,521,1021,566,1008,576),(1002,521,1021,565,1008,576),(1001,521,1020,565,1007,576),(1000,522,1019,565,1007,576),
(999,522,1018,564,1005,575),(997,522,1016,563,1004,575),(995,521,1014,561,1003,574),(992,520,1011,558,1001,573),
(990,519,1007,554,998,570),(985,518,1003,549,995,566),(981,517,998,545,991,561),(977,515,992,542,986,557),
(974,515,987,544,980,560),(969,514,981,548,973,564),(964,513,975,551,965,567),(958,513,968,553,955,570),
(951,515,962,556,947,574),(944,516,955,558,938,575),(939,518,949,560,930,576),(934,519,943,561,925,577),
(929,520,940,561,920,577),(925,520,937,562,917,577),(921,520,935,562,913,577),(920,520,933,562,912,577),
(918,520,932,562,910,576),(916,520,931,562,909,576),(914,520,930,562,908,576),(913,520,930,562,907,576),
(912,520,929,562,907,576),(911,519,929,562,906,576),(910,519,928,562,906,576),(909,519,928,562,906,576),
(908,519,927,562,905,576),(907,519,927,562,905,576),(907,518,927,562,904,576),(908,518,927,562,904,576),
(909,518,926,562,903,576),(910,518,926,562,903,576),(911,518,926,563,902,576)]
near_toes={30:(976,575),31:(975,574),32:(975,574),33:(974,574),34:(973,573),35:(968,570),36:(960,568),37:(951,566),38:(937,568),39:None}
for q,row in zip(Q,rows):
 p=q['pontos'];i=q['quadro'];p['joelho_longe']=list(row[:2]);p['tornozelo_longe']=list(row[2:4]);p['ponta_longe']=list(row[4:6])
 if i in near_toes:p['ponta_perto']=list(near_toes[i]) if near_toes[i] else None
 p['nariz']=None;p['pescoco']=None;p['ombro_longe']=None;p['cotovelo_longe']=None;p['punho_longe']=None;p['mao_longe']=None;p['quadril_longe']=None
 q['observacao']='cotovelo distante e pescoço ocultos; orelha/topo só orientam a silhueta da cabeça. Quadril e joelhos sob roupa são aproximações pelo contorno.'
(OUT/'marcas.json').write_text(json.dumps({'referencia':'P21','quadros':Q,'metodo':'39 quadros observados: marcas iniciais manuais, rastreio de feições Lucas–Kanade e correções manuais da perna distante/pés; sem interpolação temporal de poses esparsas. Ausências explícitas.','inicio_original_s':Q[0]['pts_s'],'fim_original_s':Q[-1]['pts_s']},ensure_ascii=False,indent=2))
small=[]
for row in range(5):
 canvas=Image.new('RGB',(4*360,2*430),'#eee');d=ImageDraw.Draw(canvas)
 for j in range(8):
  i=row*8+j
  if i>=len(Q):break
  q=Q[i];p=q['pontos'];im=Image.open(SRC/'quadros'/f'q{i+1:05}.jpg').crop((750,275,1050,625)).resize((360,420));di=ImageDraw.Draw(im)
  def xy(v):return ((v[0]-750)*1.2,(v[1]-275)*1.2)
  for chain,col in [('topo orelha ombro quadril','#25d9ee'),('ombro cotovelo punho mao','#ffbb32'),('quadril joelho_perto tornozelo_perto ponta_perto','#fc5478'),('quadril joelho_longe tornozelo_longe ponta_longe','#56df87')]:
   ps=[xy(p[k]) for k in chain.split() if p[k]];di.line(ps,fill=col,width=2)
  for k,v in p.items():
   if v:x,y=xy(v);di.ellipse((x-3,y-3,x+3,y+3),fill='white',outline='black')
  canvas.paste(im,((j%4)*360,(j//4)*430+10));d.text(((j%4)*360+3,(j//4)*430),f'q{i+1}',fill='black');small.append(im)
 canvas.save(OUT/f'marcas-{row+1}.jpg',quality=96)
small[0].save(OUT/'marcas.gif',save_all=True,append_images=small[1:],duration=80,loop=0)
