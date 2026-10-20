"""Vídeo de comparação P21: instantes e escala iguais, proporções do Neto preservadas."""
import json,subprocess
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'arte/finais/rotoscopia-p21';SRC=ROOT/'arte/entradas/referencias/catalogo-2026-10-18/P21/empurrar-barco'
Q=json.loads((OUT/'marcas.json').read_text())['quadros'];P=json.loads((OUT/'projecoes.json').read_text());SCALE=900/3/190
font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',25);small=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',17)
base=[]
for i,(q,p) in enumerate(zip(Q,P)):
 h=q['pontos']['referencia_calca'];px,py=p['referencia_calca_render_px'];x0=h[0]-px/SCALE;y0=h[1]-py/SCALE
 src=Image.open(SRC/'quadros'/f'q{i+1:05}.jpg');ref=src.transform((900,700),Image.Transform.AFFINE,(1/SCALE,0,x0,0,1/SCALE,y0),resample=Image.Resampling.BICUBIC).resize((720,560))
 model=Image.open(OUT/'render-v2'/f'q{i+1:04}.png').convert('RGB').resize((720,560));base.append((ref,model,q['pts_s']))
def compose(i,label):
 ref,model,t=base[i];im=Image.new('RGB',(720,1260),'#151e20');d=ImageDraw.Draw(im)
 d.text((15,3),'REAL · homem empurrando o barco',font=font,fill='#eef7f7');im.paste(ref,(0,36))
 d.text((15,600),'NETO · rotoscopia P21',font=font,fill='#eef7f7');im.paste(model,(0,632))
 d.text((15,1200),label+f'  |  original {t:.3f} s',font=small,fill='#92e5d8');d.text((15,1223),'39 quadros rastreados e revistos · braço oculto/dedos aproximados',font=small,fill='#c9d2d4');d.text((15,1243),'Referência: Oxlaey · CC BY-SA 3.0 · Wikimedia Commons',font=small,fill='#c9d2d4');return im
outframes=OUT/'comparacao-quadros';outframes.mkdir(exist_ok=True);count=0
for label,reps in [('TEMPO REAL · 1/2',1),('TEMPO REAL · 2/2',1),('CÂMERA LENTA · 0,5×',2)]:
 for i in range(len(Q)):
  im=compose(i,label)
  for _ in range(reps):im.save(outframes/f'q{count:04}.jpg',quality=92);count+=1
for pattern,rate,name in [(outframes/'q%04d.jpg',25,'comparacao.mp4'),(OUT/'render-v2/q%04d.png',25,'neto-empurrar.mp4')]:
 subprocess.run(['ffmpeg','-y','-framerate',str(rate),'-i',str(pattern),'-c:v','libx264','-crf','19','-pix_fmt','yuv420p','-movflags','+faststart',str(OUT/name)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
compose(20,'TEMPO REAL').save(OUT/'comparacao.jpg',quality=95)
gif=[compose(i,'CÂMERA LENTA · 0,5×').resize((360,630)) for i in range(len(Q))];gif[0].save(OUT/'previa.gif',save_all=True,append_images=gif[1:],duration=80,loop=0,optimize=False)
contact=Image.new('RGB',(4*360,2*630),'#151e20')
for j,i in enumerate([0,5,10,15,20,25,32,38]):contact.paste(compose(i,f'quadro {i+1}').resize((360,630)),((j%4)*360,(j//4)*630))
contact.save(OUT/'comparacao-contato.jpg',quality=95)
overlay=Image.new('RGB',(4*360,2*310),'#151e20')
for j,i in enumerate([0,5,10,15,20,25,32,38]):
 ref,model,t=base[i];tile=Image.blend(ref,model,.5).resize((360,280));overlay.paste(tile,((j%4)*360,(j//4)*310+25))
 ImageDraw.Draw(overlay).text(((j%4)*360+6,(j//4)*310+3),f'50% · quadro {i+1} · {t:.3f}s',font=small,fill='white')
overlay.save(OUT/'sobreposicao-contato.jpg',quality=95)
print('P21_COMPOSTO',count)
