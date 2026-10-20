"""Revisão após feedback do Joabe: não confundir contorno, cintura e juntas.
Marcas de joelho sob tecido são estimativas, nunca juntas comprovadas.
Pontos ocultos ficam ausentes. Render da marcação não completa segmentos ausentes.
"""
from pathlib import Path
import json,copy
import numpy as np
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'arte/finais/rotoscopia-p21';SRC=ROOT/'arte/entradas/referencias/catalogo-2026-10-18/P21/empurrar-barco'
Q=json.loads((OUT/'rastreio-bruto.json').read_text());old=json.loads((OUT/'marcas-reprovadas-v1.json').read_text())['quadros']
# Fitting offsets reviewed on the enlarged native frames, not an animation curve.
for q,prev in zip(Q,old):
 i=q['quadro'];p=q['pontos'];op=prev['pontos'];k=op['joelho_longe']
 if i<=8:
  nk=[k[0]+round(np.interp(i,[1,8],[6,10])),k[1]-6]
 elif 9<=i<=15:nk=None  # knees overlap, identity not observable
 else:nk=[k[0]+12,k[1]-10]
 if 16<=i<=20:nk={16:[963,512],17:[958,512],18:[952,512],19:[947,513],20:[942,513]}[i]
 olda=op['tornozelo_longe'];dx=np.interp(i,[1,8,13,18,23,28,33,39],[4,4,8,2,6,5,6,7]);dy=np.interp(i,[1,8,13,18,23,28,33,39],[0,0,4,3,1,0,-1,-1])
 p['joelho_longe']=nk;p['tornozelo_longe']=[round(olda[0]+dx,1),round(olda[1]+dy,1)];p['ponta_longe']=op['ponta_longe']
 if 11<=i<=13:p['tornozelo_longe']=None
 if 11<=i<=14:p['ponta_longe']=None
 if i>=30:p['ponta_perto']=op['ponta_perto']
 if i>=37:p['ponta_perto']=None
 if i>=38:p['joelho_perto']=None
 if i==39:p['tornozelo_perto']=None
 # The old 'ear' seed was on the arm. Even the reseeded feature tracks the cap,
 # not a reliably visible ear: preserve it as contour, not an anatomical joint.
 p['borda_cabeca']=p.pop('orelha');p['orelha']=None;p['referencia_calca']=p.pop('cintura_lateral')
 for name in ['quadril','quadril_perto','quadril_longe','nariz','pescoco','ombro_longe','cotovelo_longe','punho_longe','mao_longe']:p[name]=None
 q['tipo_ponto']={k:('ausente' if v is None else 'contorno' if k in ['topo','borda_cabeca','referencia_calca','barco'] else 'estimado_sob_roupa' if k in ['ombro','joelho_perto','joelho_longe'] else 'visivel') for k,v in p.items()}
 q['observacao']='referencia_calca é feição de tecido, não quadril. Joelhos/ombro são estimativas pelo contorno; orelha, pescoço e quadris não identificáveis. Não unir pernas a esse ponto da cintura.'
D={'referencia':'P21','revisao':2,'estado':'revisado após feedback; aguardando avaliação visual do usuário','quadros':Q,'metodo':'39 imagens nativas; rastreio de feições com sementes reposicionadas, correções na perna distante e ausências em cruzamentos. Não se interpolam juntas ocultas no arquivo de marcas.','inicio_original_s':Q[0]['pts_s'],'fim_original_s':Q[-1]['pts_s'],'mudancas':['semente do cotovelo e do ombro reposicionada','orelha retirada: marca anterior estava no antebraço','quadril retirado: marca era uma feição da cintura','joelhos reposicionados e tratados como estimativas sob tecido','tornozelos revistos; pontos ocultos nos cruzamentos ficaram null','nenhuma linha de coxa parte da cintura; segmentos ausentes não são ligados']}
(OUT/'marcas.json').write_text(json.dumps(D,ensure_ascii=False,indent=2))
font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',15);small=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',12)
COLORS={'braco':'#ffcc42','perto':'#ff668c','longe':'#71e9ae','contorno':'#acacff'}
def make(q,size=(480,560),labels=False):
 im=Image.open(SRC/'quadros'/f'q{q["quadro"]:05}.jpg').crop((750,275,1050,625)).resize(size,Image.Resampling.LANCZOS);di=ImageDraw.Draw(im);sx,sy=size[0]/300,size[1]/350;p=q['pontos']
 def xy(v):return ((v[0]-750)*sx,(v[1]-275)*sy)
 for chain,color in [('ombro cotovelo punho mao',COLORS['braco']),('joelho_perto tornozelo_perto ponta_perto',COLORS['perto']),('joelho_longe tornozelo_longe ponta_longe',COLORS['longe'])]:
  names=chain.split()
  for ka,kb in zip(names,names[1:]):
   if p.get(ka) and p.get(kb):di.line([xy(p[ka]),xy(p[kb])],fill=color,width=3)
 for k,v in p.items():
  if v is None:continue
  if k not in ['topo','borda_cabeca','referencia_calca','ombro','cotovelo','punho','mao','joelho_perto','joelho_longe','tornozelo_perto','tornozelo_longe','ponta_perto','ponta_longe']:continue
  x,y=xy(v);kind=q['tipo_ponto'][k];color=COLORS['contorno'] if kind=='contorno' else COLORS['braco'] if k in ['ombro','cotovelo','punho','mao'] else COLORS['perto'] if 'perto' in k else COLORS['longe']
  if kind=='contorno':di.rectangle((x-4,y-4,x+4,y+4),outline=color,width=2)
  elif kind=='estimado_sob_roupa':di.ellipse((x-5,y-5,x+5,y+5),outline=color,width=2)
  else:di.ellipse((x-4,y-4,x+4,y+4),fill=color,outline='black')
  if labels and k in ['referencia_calca','ombro','cotovelo','joelho_longe']:
   name={'referencia_calca':'tecido (não é quadril)','ombro':'ombro ~','cotovelo':'cotovelo','joelho_longe':'joelho ~'}[k];di.text((x+8,y-8),name,font=small,fill=color,stroke_width=1,stroke_fill='black')
 di.rectangle((0,0,size[0],21),fill='#151d20');di.text((6,2),f'Revisão 2 · quadro {q["quadro"]:02} · {q["pts_s"]:.3f}s',font=font,fill='white');return im
frames=[]
for q in Q:
 im=make(q);c=Image.new('RGB',(480,610),'#151d20');c.paste(im,(0,0));di=ImageDraw.Draw(c);di.text((8,564),'braço amarelo · pernas rosa/verde · contornos roxos',font=small,fill='white');di.text((8,580),'círculo vazio: estimativa sob roupa; juntas ocultas ausentes',font=small,fill='white');frames.append(c)
frames[0].save(OUT/'marcas.gif',save_all=True,append_images=frames[1:],duration=120,loop=0)
for row in range(5):
 sheet=Image.new('RGB',(4*360,2*420),'#151d20')
 for j in range(8):
  i=row*8+j
  if i<len(Q):sheet.paste(make(Q[i],(360,420)),((j%4)*360,(j//4)*420))
 sheet.save(OUT/f'marcas-{row+1}.jpg',quality=96)
# Large start/middle/end inspection, plus before-after comparison of frame 1.
for i in [1,13,23,33,39]:make(Q[i-1],(600,700),True).save(OUT/f'revisao-q{i:02}.jpg',quality=96)
pair=Image.new('RGB',(960,650),'#151d20');d=ImageDraw.Draw(pair);before=make(Q[0]);b=Image.open(SRC/'quadros'/'q00001.jpg').crop((750,275,1050,625)).resize((480,560));bd=ImageDraw.Draw(b)
def xy(v):return ((v[0]-750)*1.6,(v[1]-275)*1.6)
for chain in ['topo orelha ombro quadril','ombro cotovelo punho mao','quadril joelho_perto tornozelo_perto ponta_perto','quadril joelho_longe tornozelo_longe ponta_longe']:
 pts=[xy(old[0]['pontos'][k]) for k in chain.split() if old[0]['pontos'][k]];bd.line(pts,fill='#ff786c',width=3)
for v in old[0]['pontos'].values():
 if v:x,y=xy(v);bd.ellipse((x-4,y-4,x+4,y+4),fill='#ff786c')
pair.paste(b,(0,30));pair.paste(before,(480,30));d.text((10,6),'ANTES · marcação recusada',font=font,fill='#ff786c');d.text((490,6),'REVISÃO · pontos reposicionados e ausências',font=font,fill='white');d.text((12,603),'Cintura é contorno, não quadril. A marca de orelha foi retirada. Joelhos são estimativas sob roupa.',font=font,fill='white');pair.save(OUT/'marcas-antes-depois.jpg',quality=96)
(OUT/'status.json').write_text(json.dumps({'fase':'marcação revisada após crítica do usuário','revisao_marcas':2,'render_anterior':'interrompido; usa marcas recusadas; preservado em render-marcas-antigas','novo_render_gerado':False},ensure_ascii=False,indent=2))
# Preserve real speed and add a 1/3 speed pass for inspection.
import subprocess
seq=OUT/'quadros-marcacao';seq.mkdir(exist_ok=True);n=0
for label,reps in [('TEMPO REAL',1),('LENTO · 1/3×',3)]:
 for im in frames:
  c=im.copy();di=ImageDraw.Draw(c);di.text((8,595),label,font=small,fill='#9de9db')
  for _ in range(reps):c.save(seq/f'q{n:04}.jpg',quality=95);n+=1
subprocess.run(['ffmpeg','-y','-framerate','25','-i',str(seq/'q%04d.jpg'),'-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',str(OUT/'marcacao-revisada.mp4')],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
print('REVISÃO 2',len(Q),'quadros; pontos ocultos ausentes')
