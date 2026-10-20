#!/usr/bin/env python3
"""Pesquisa pública do YouTube, sem baixar vídeo ou acessar contas pessoais."""
import json
from pathlib import Path
import subprocess
import sys
from urllib.parse import quote_plus
from catalogar_referencias import OUT, resolve

query = ' '.join(sys.argv[1:])
address = resolve('www.youtube.com')
url = 'https://www.youtube.com/results?search_query='+quote_plus(query)
r = subprocess.run(['curl','-fLsS','--max-time','30','--resolve',f'www.youtube.com:443:{address}',
                    '-A','Mozilla/5.0','-H','Accept-Language: en-US,en;q=0.9',url],
                   capture_output=True,text=True,check=True)
folder = OUT/'youtube-pesquisa'
folder.mkdir(exist_ok=True)
slug = ''.join(c if c.isalnum() else '-' for c in query)[:100]
(folder/(slug+'.html')).write_text(r.stdout)
start = r.stdout.find('var ytInitialData = ')
if start < 0:
    print(json.dumps({'erro':'ytInitialData ausente','url':url,'bytes':len(r.stdout)}))
    sys.exit(1)
data, _ = json.JSONDecoder().raw_decode(r.stdout[start+len('var ytInitialData = '):])
videos = {}
def plain(value):
    if not isinstance(value,dict): return ''
    return value.get('simpleText','') or ''.join(x.get('text','') for x in value.get('runs',[]))
def walk(node):
    if isinstance(node,dict):
        v = node.get('videoRenderer')
        if v:
            ident = v.get('videoId')
            videos[ident]={'id':ident,'titulo':plain(v.get('title',{})),
                           'canal':plain(v.get('ownerText',{})),
                           'duracao':plain(v.get('lengthText',{})),
                           'url':'https://www.youtube.com/watch?v='+ident,
                           'descricao':plain(v.get('descriptionSnippet',{}))}
        for child in node.values(): walk(child)
    elif isinstance(node,list):
        for child in node: walk(child)
walk(data)
result={'consulta':query,'url_busca':url,'videos':list(videos.values())}
(folder/(slug+'.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(result,ensure_ascii=False))
