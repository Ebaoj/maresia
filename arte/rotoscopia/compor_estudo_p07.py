"""Compara o registro real e o Neto com a escala do retarget, preservando timestamps."""
import json,subprocess
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'arte/finais/rotoscopia-p07'
SRC=ROOT/'arte/entradas/referencias/catalogo-2026-10-18/P07/corrida-jogging'
D=json.loads((OUT/'marcas.json').read_text());poses=D['quadros'];P=json.loads((OUT/'projecoes.json').read_text());T=json.loads((SRC/'tempos-quadros.json').read_text())
fontpath='/System/Library/Fonts/Supplemental/Arial.ttf'
font=ImageFont.truetype(fontpath,24);small=ImageFont.truetype(fontpath,16);tiny=ImageFont.truetype(fontpath,14)
def hip(t):
 for a,b in zip(poses,poses[1:]):
  if a['pts_s']<=t<=b['pts_s']:
   k=(t-a['pts_s'])/(b['pts_s']-a['pts_s']);return [x+(y-x)*k for x,y in zip(a['pontos']['quadril'],b['pontos']['quadril'])]
 return poses[-1]['pontos']['quadril']
base=[]
for i,r in enumerate(P):
 src_index=D['inicio_quadro']+i;im=Image.open(SRC/'quadros'/f'q{src_index:05}.jpg');h=hip(r['pts_s']);px,py=r['quadril_render_px'];scale=600/2.1/145
 # Same body scale, pelvis position and instant. Person proportions differ.
 x0=h[0]-px/scale;y0=h[1]-py/scale
 ref=im.transform((600,600),Image.Transform.AFFINE,(1/scale,0,x0,0,1/scale,y0),resample=Image.Resampling.BICUBIC)
 model=Image.open(OUT/'render'/f'q{i+1:04}.png').convert('RGB')
 base.append((ref,model,r['pts_s']))
seq=OUT/'comparacao-quadros';seq.mkdir(exist_ok=True)
frames=[]
def compose(i,label):
 ref,model,t=base[i];c=Image.new('RGB',(600,1380),'#141c20');d=ImageDraw.Draw(c)
 d.text((18,12),'REFERÊNCIA REAL · corrida cotidiana',font=font,fill='#eef7f7');c.paste(ref,(0,48))
 d.text((18,660),'NETO · primeiro estudo de rotoscopia',font=font,fill='#eef7f7');c.paste(model,(0,696))
 d.text((18,1305),label+f'   |   original: {t:.3f} s',font=small,fill='#8ee4dc')
 d.text((18,1330),'P07 · Nesnad · CC BY 4.0 · Wikimedia Commons',font=small,fill='#becacc')
 d.text((18,1354),'15 poses marcadas; mãos e braço oculto aproximados.',font=tiny,fill='#becacc')
 return c
# Two real-time playbacks + half speed. Hard resets kept visible, not a seamless cycle.
for label,repeats in [('TEMPO REAL · 1/2',1),('TEMPO REAL · 2/2',1),('CÂMERA LENTA · 0,5×',2)]:
 for i in range(len(base)):
  c=compose(i,label)
  for _ in range(repeats):
   n=len(frames);path=seq/f'q{n:04}.jpg';c.save(path,quality=92);frames.append(path)
subprocess.run(['ffmpeg','-y','-framerate','30','-i',str(seq/'q%04d.jpg'),'-c:v','libx264','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',str(OUT/'comparacao.mp4')],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
# Standalone character view, repeated source excerpt, no fabricated seamless transition.
subprocess.run(['ffmpeg','-y','-framerate','30','-i',str(OUT/'render/q%04d.png'),'-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',str(OUT/'neto-corrida.mp4')],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
poster=compose(0,'TEMPO REAL');poster.save(OUT/'comparacao.jpg',quality=95)
# Compact animated artifact for inline/mobile review, half speed.
gifs=[compose(i,'CÂMERA LENTA · 0,5×').resize((360,828),Image.Resampling.LANCZOS) for i in range(0,len(base),2)]
gifs[0].save(OUT/'previa.gif',save_all=True,append_images=gifs[1:],duration=133,loop=0,optimize=False)
# Self-review contact sheet with synchronized source and render.
contact=Image.new('RGB',(6*300,2*690),'#141c20')
for j,i in enumerate([0,4,8,12,16,20,24,28,32,40,48,56]):contact.paste(compose(i,f'quadro {i+1}').resize((300,690)),((j%6)*300,(j//6)*690))
contact.save(OUT/'comparacao-contato.jpg',quality=95)
print('P07_COMPOSTO',len(frames),'quadros de apresentação')
