"""Rastreia feições entre quadros reais com Lucas–Kanade; sem gerar poses.
Marcas são propostas, precisam ser revisadas sobre a imagem. Juntas ocultas = null.
"""
from pathlib import Path
import json
import numpy as np
from scipy.ndimage import map_coordinates,gaussian_filter
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'arte/finais/rotoscopia-p21';SRC=ROOT/'arte/entradas/referencias/catalogo-2026-10-18/P21/empurrar-barco'
INITIAL={'topo':[900,329],'orelha':[920,346],'ombro':[935,351],'cotovelo':[918,366],'punho':[886,341],'mao':[879,326],'cintura_lateral':[973,455],'joelho_perto':[973,508],'tornozelo_perto':[1004,565],'ponta_perto':[981,580],'joelho_longe':[1008,515],'tornozelo_longe':[1025,566],'ponta_longe':[1012,575],'barco':[872,347]}
# Every image contributes observations; no sparse-keyframe temporal interpolation.
files=sorted((SRC/'quadros').glob('q*.jpg'));imgs=[gaussian_filter(np.asarray(Image.open(p).convert('L'),dtype=float)/255,.8) for p in files]
grads=[np.gradient(im) for im in imgs]
rr,cc=np.mgrid[-11:12,-11:12];coords=np.array([cc.ravel(),rr.ravel()]).T

def sample(im,p):
 q=coords+p;return map_coordinates(im,[q[:,1],q[:,0]],order=1,mode='nearest')
def lk(i,j,p):
 target=sample(imgs[i],p);q=p.copy();gy,gx=grads[j]
 for _ in range(15):
  err=sample(imgs[j],q)-target;J=np.column_stack((sample(gx,q),sample(gy,q)))
  H=J.T@J+np.eye(2)*1e-6;delta=np.linalg.solve(H,-J.T@err);q+=delta
  if np.linalg.norm(delta)<.01:break
 return q,float(np.mean((sample(imgs[j],q)-target)**2))
pts={k:np.array(v,dtype=float) for k,v in INITIAL.items()};tracks=[]
pts_times=json.loads((SRC/'tempos-quadros.json').read_text())
for i,im in enumerate(imgs):
 errs={}
 if i:
  new={}
  for k,p in pts.items():
   q,res=lk(i-1,i,p);back,_=lk(i,i-1,q);errs[k]={'erro_retorno_px':float(np.linalg.norm(back-p)),'residuo':res};new[k]=q
  pts=new
 tracks.append({'quadro':i+1,'pts_s':pts_times[i]['tempo_original_s'],'pontos':{k:[round(float(v[0]),2),round(float(v[1]),2)] for k,v in pts.items()},'rastreio':errs})
(OUT/'rastreio-bruto.json').write_text(json.dumps(tracks,indent=2))
for row in range(5):
 canvas=Image.new('RGB',(4*360,2*430),'#eee');d=ImageDraw.Draw(canvas)
 for j in range(8):
  i=row*8+j
  if i>=len(tracks):break
  q=tracks[i];p=q['pontos'];im=Image.open(files[i]).crop((750,275,1050,625)).resize((360,420));di=ImageDraw.Draw(im)
  def xy(v):return ((v[0]-750)*1.2,(v[1]-275)*1.2)
  for chain,col in [('topo orelha ombro cintura_lateral','#25d9ee'),('ombro cotovelo punho mao','#ffbb32'),('joelho_perto tornozelo_perto ponta_perto','#fc5478'),('joelho_longe tornozelo_longe ponta_longe','#56df87')]:di.line([xy(p[k]) for k in chain.split()],fill=col,width=2)
  for k,v in p.items():
   x,y=xy(v);bad=q['rastreio'].get(k,{}).get('erro_retorno_px',0)>2;di.ellipse((x-3,y-3,x+3,y+3),fill='red' if bad else 'white',outline='black')
  canvas.paste(im,((j%4)*360,(j//4)*430+10));d.text(((j%4)*360+3,(j//4)*430),f'q{i+1}',fill='black')
 canvas.save(OUT/f'rastreio-{row+1}.jpg',quality=96)
print('TRACKED',len(tracks),'frames');print('LAST',tracks[-1]['pontos']);print('BAD',[(q['quadro'],[k for k,v in q['rastreio'].items() if v['erro_retorno_px']>2]) for q in tracks if any(v['erro_retorno_px']>2 for v in q['rastreio'].values())])
