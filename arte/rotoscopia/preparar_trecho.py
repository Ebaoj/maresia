#!/usr/bin/env python3
"""Recorta um trecho livre, preserva os quadros nativos e cria folhas com tempos.

Uso: python3 arte/rotoscopia/preparar_trecho.py ID inicio fim nome [amostras_por_segundo]
"""
import json
from pathlib import Path
import re
import subprocess
import sys
from catalogar_referencias import ROOT, OUT, sheet

ident, begin, end, name = sys.argv[1:5]
begin, end = float(begin), float(end)
sampling = float(sys.argv[5]) if len(sys.argv)>5 else 4
folder = OUT/ident/name
folder.mkdir(parents=True, exist_ok=True)
probe = json.loads((OUT/ident/'probe.json').read_text())
video = ROOT/probe['arquivo']
cmd = ['ffmpeg', '-hide_banner', '-threads', '2', '-ss', str(begin), '-i', str(video), '-t', str(end-begin)]
subprocess.run(cmd+['-an','-c:v','libx264','-crf','18','-preset','fast',
                    '-fps_mode','passthrough','-movflags','+faststart','-y',str(folder/'trecho.mp4')],
               check=True, capture_output=True)
frames = folder/'quadros'
frames.mkdir(exist_ok=True)
native = subprocess.run(cmd+['-vf','showinfo','-fps_mode','passthrough','-q:v','2','-y',str(frames/'q%05d.jpg')],
                        check=True, capture_output=True,text=True)
native_stamps = [begin+float(x) for x in re.findall(r'pts_time:([\d.]+)',native.stderr)]
native_files = sorted(frames.glob('*.jpg'))
(folder/'tempos-quadros.json').write_text(json.dumps([
    {'arquivo':p.name,'tempo_original_s':t,'tempo_trecho_s':t-begin}
    for p,t in zip(native_files,native_stamps)
],indent=2)+'\n')
sampledir = folder/'amostras'
sampledir.mkdir(exist_ok=True)
r = subprocess.run(cmd+['-vf',f"select='isnan(prev_selected_t)+gte(t-prev_selected_t,{1/sampling})',showinfo,scale=320:-2",
                        '-fps_mode','vfr','-q:v','3','-y',str(sampledir/'%04d.jpg')],
                   check=True,capture_output=True,text=True)
stamps = [begin+float(x) for x in re.findall(r'pts_time:([\d.]+)',r.stderr)]
stamps = stamps[:len(list(sampledir.glob('*.jpg')))]
samples = list(zip(sorted(sampledir.glob('*.jpg')),stamps))
sheet(folder,samples,24)
entry = {'id':ident,'nome':name,'inicio_s':begin,'fim_s':end,'duracao_s':end-begin,
         'quadros':len(list(frames.glob('*.jpg'))),'arquivo':str(video.relative_to(ROOT)),
         'tempos_amostras':stamps,'fps_nominal':probe['streams'][0]['r_frame_rate'],
         'nota':'Tempos da seleção relativos ao arquivo original; quadros e MP4 começam no primeiro quadro após o seek. Sem interpolação de movimento.'}
(folder/'trecho.json').write_text(json.dumps(entry,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(entry,ensure_ascii=False))
