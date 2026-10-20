#!/usr/bin/env python3
"""Atualiza o documento de revisão a partir das decisões visuais registradas."""
import json
from pathlib import Path
from catalogar_referencias import ROOT, OUT, DATA

d = json.loads(DATA.read_text())
videos = d['videos']
reviewed = [v for v in videos if v.get('avaliacao',{}).get('score') is not None]
ready = [v for v in reviewed if v['avaliacao']['status']=='aprovado']
lines = [
    '# Referências de movimento real — catálogo visual', '',
    'Atualizado em 18/10/2026. Critério: pessoas em atividade cotidiana/recreativa e animais reais; excluir atuação para demonstrar animação.', '',
    f'**{len(reviewed)} vídeos examinados por sequências de quadros locais; {len(ready)} com trecho aprovado para marcação.** Os demais têm decisão explícita abaixo. Não são notas estimadas a partir de títulos.', '',
    '**Como foi feita a revisão:** visão geral do arquivo por folhas de contato com PTS; seleção de intervalos promissores; inspeção mais densa e ampliação de quadros originais quando necessário. Isso não equivale a dizer que cada quadro de todos os vídeos foi marcado. O catálogo informa o intervalo realmente preparado.', '',
    '**Score (0–10):** 0–3 descartar para juntas; 4–6 referência de comportamento ou material que exige outra câmera/estabilização; 7 usar só a parte explicitamente indicada; 8–10 adequado para marcar o trecho aprovado. A nota considera enquadramento, perfil, oclusões, nitidez, continuidade e naturalidade. Um vídeo pode ser ótimo para observar e ruim para traçar.', '',
    '**Preparação técnica:** os trechos têm MP4 sem áudio, quadros nativos em JPEG, tempos de cada quadro, folhas de contato e metadados com SHA-256 do original. Não há interpolação. Os arquivos ficam em `arte/entradas/referencias/catalogo-2026-10-18/`, fora do Git.', '',
    '## Decisões', '',
    '| ID / vídeo individual | Ação estudada | Nota | Decisão |',
    '|---|---|---:|---|',
]
for v in videos:
    a = v.get('avaliacao',{})
    score = a.get('score')
    if score is None:
        continue
    lines.append(f"| [{v['id']} — {v.get('titulo',v.get('commons_file',''))}]({v['url']}) | {a['acao']} | {score}/10 | {a['status']} |")
lines += ['', '## Trechos preparados', '',
          '| Vídeo / ação | Início–fim no original | Material local | Uso |',
          '|---|---|---|---|']
for v in videos:
    for s in v.get('trechos',[]):
        folder = OUT/v['id']/s['nome']
        if not (folder/'trecho.json').exists():
            continue
        meta = json.loads((folder/'trecho.json').read_text())
        base = '../'+str(folder.relative_to(ROOT))
        note = s.get('uso',v['avaliacao']['status'])
        lines.append(f"| {v['id']} — {s['alvo']} | {s['inicio_s']:.3f}–{s['fim_s']:.3f} s | [MP4]({base}/trecho.mp4), [folha]({base}/contato-01.jpg), [tempos]({base}/tempos-quadros.json); {meta['quadros']} quadros | {note} |")
lines += ['', '## Observações da inspeção', '']
for v in reviewed:
    ident = v['id']
    a = v['avaliacao']
    folder = OUT/ident
    lines += [f"### {ident} — {v['titulo']}", '', a['observacao'], '']
    if (folder/'probe.json').exists():
        probe = json.loads((folder/'probe.json').read_text())
        stream = probe['streams'][0]
        lines.append(f"Arquivo: {float(probe['format']['duration']):.3f} s; {stream['width']}×{stream['height']}; FPS nominal `{stream['r_frame_rate']}`. [Original local](../{probe['arquivo']}) · [Folha de contato](../{folder.relative_to(ROOT)}/contato-01.jpg).")
        lines.append('')
    lines += [f"Crédito: {v.get('autor','consultar fonte')}. Licença registrada: {v.get('licenca','pendente')}. [Página do vídeo]({v['url']}).",'']
    if v.get('url_original'):
        lines += [f"[Publicação original do vídeo]({v['url_original']}). Tempos da seleção medidos na cópia local; correspondência temporal no player original ainda não conferida.", '']
pending = [v for v in videos if v.get('avaliacao',{}).get('score') is None]
if pending:
    lines += ['## Links preservados, ainda sem avaliação visual', '',
              'Estes não contam como referências aprovadas nem recebem score. Permanecem na fila de obtenção/revisão.', '']
    for v in pending:
        lines.append(f"- [{v['id']} — {v.get('titulo',v.get('commons_file',''))}]({v['url']}): {v.get('objetivo_busca','obter e examinar quadros')}.")
    lines += ['', 'A busca pública direta no YouTube encontrou os candidatos Y01–Y07. O navegador abriu em modo de processo único, mas a tentativa de reproduzir Y01 recebeu uma página de verificação de tráfego automatizado. Os candidatos permanecem sem score e sem alegação de terem sido assistidos. A busca não baixa vídeos do YouTube.', '']
lines += ['', '## Material que já existia antes deste levantamento', '',
          'Havia cinco arquivos de gato em `arte/entradas/referencias/gato-pulo/` (A00 e C01–C04 acima), além de marcações de juntas de um vídeo diferente. A afirmação anterior de que nada estava salvo estava incorreta.', '']
for v in d.get('legado',[]):
    lines += [f"- [{v['titulo']}]({v['url']}), {v['inicio_s']}–{v['fim_s']} s: {v['status']}. {v['observacao']}"]
    for file in v['arquivos']:
        lines.append(f'  - [Marcas existentes](../{file})')
lines += ['', '## Cobertura das animações do jogo', '',
          'A aprovação vale por ação e por trecho. Não completar movimentos ausentes por imaginação.', '',
          '| Necessidade | Estado |', '|---|---|',
          '| Corrida leve humana | P07 aprovado: 7,85–9,90 s, corpo inteiro de perfil; 61 quadros separados. |',
          '| Caminhada humana | P26 aprovado: 33,60–35,00 s, mulher de perfil com salto e bolsa; 42 quadros. Falta caminhada livre de outros perfis/idades. |',
          '| Arrancada, frenagem e viradas | P27 reserva para parar/conversar em vista oblíqua; falta seleção limpa de perfil para cada transição. |',
          '| Agachar / trabalhar junto ao chão | P02/P06 preparados como referência de comportamento; vistas oblíquas impedem copiar todas as juntas com segurança. |',
          '| Salto humano e pouso em terra | P08 serve parcialmente para impulso/voo de salto na água; falta salto com pouso em terra e corpo inteiro. |',
          '| Sentar e levantar de cadeira | Falta vídeo cotidiano de perfil, contínuo, sem atuação. |',
          '| Nadar / boiar | P22 parcial para braçada submersa de crawl em treino real. Falta ciclo completo, peito e boiar; P11/P12 só água, P15 distante e P23 não serve para juntas. |',
          '| Carregar / empurrar / entregar objeto | P21 parcial para empurrar barco; P29 reserva para pegar/carregar baldes; P10 para entrega. Ainda faltam ciclos completos de perfil. |',
          '| Erguer e despejar recipiente | P30 parcial para braços/tronco e contato com balde; pernas ocultas. |',
          '| Gato / cão / burro / ave / peixe | Ver nota por espécie; nunca transferir o andamento do cavalo para o burro como se fosse a mesma referência. |', '',
          '## Reproduzir a preparação', '',
          'Metadados, decisões e trechos: [`referencias-movimento-real.json`](referencias-movimento-real.json). As ferramentas de preparação estão em `arte/rotoscopia/`.', '',
          'Para extrair outro intervalo de arquivo já disponível:', '',
          '```bash',
          'python3 arte/rotoscopia/preparar_trecho.py ID INICIO FIM NOME 8',
          'python3 arte/rotoscopia/gerar_catalogo.py',
          '```', '',
          'Usar os tempos em `tempos-quadros.json` na marcação. Alguns WebM têm FPS médio de contêiner incorreto ou intervalos variáveis; o número de quadros dividido pela duração não substitui os PTS. Câmera lenta exige aferir o fator antes de retargetear o tempo.', '']
(ROOT/'docs/referencias-movimento-real.md').write_text('\n'.join(lines))
credits = ['# Créditos dos vídeos de referência', '',
           'Cópias de trabalho, recortes e folhas de contato para estudo de movimento da Maresia. Os arquivos originais não integram os assets do jogo.', '']
for v in reviewed:
    credits += [f"- **{v['id']} — {v['titulo']}**: {v.get('autor','consultar fonte')}; {v.get('licenca','pendente')}. {v['url']}"]
(OUT/'CREDITO.md').write_text('\n'.join(credits)+'\n')
print(f'Catálogo gerado: {len(reviewed)} avaliados, {len(ready)} aprovados, {len(pending)} na fila.')

people = [v for v in reviewed if v['id'].startswith('P')]
approved_people = [v for v in people if v['avaliacao']['status']=='aprovado']
partial_people = [v for v in people if v['avaliacao']['status']=='parcial']
human = ['# Referências humanas para rotoscopia', '',
         'Atualizado em 18/10/2026. Prioridade atual: pessoas em atividade real; YouTube incluído na pesquisa.', '',
         f"**{len(people)} vídeos humanos examinados; {len(approved_people)} com trecho aprovado para iniciar marcação.** A nota vale para a ação e as partes visíveis especificadas. Nenhuma marcação nova de juntas foi feita nesta pesquisa.", '',
         '## Trechos aprovados', '',
         '| Vídeo | Movimento | Tempo na cópia examinada | Nota / preparação |', '|---|---|---|---|']
def human_row(v):
    a = v['avaliacao']
    for s in v.get('trechos',[]):
        folder = OUT/v['id']/s['nome']
        meta = json.loads((folder/'trecho.json').read_text()) if (folder/'trecho.json').exists() else {}
        platform = 'YouTube' if 'youtube.com' in v.get('url_original','') else 'Vimeo'
        original = f" · [{platform}]({v['url_original']})" if v.get('url_original') else ''
        links = f"[MP4](../{folder.relative_to(ROOT)}/trecho.mp4) · [quadros com tempos](../{folder.relative_to(ROOT)}/tempos-quadros.json)" if meta else 'preparação pendente'
        human.append(f"| [{v['id']} — {v['titulo']}]({v['url']}){original} | {a['acao']} | {s['inicio_s']:.2f}–{s['fim_s']:.2f} s | {a['score']}/10; {meta.get('quadros','?')} quadros; {links} |")
for v in approved_people: human_row(v)
human += ['', 'P26 mostra caminhada com salto e bolsa. P07 mostra corrida leve contínua. Nenhum dos dois resolve arrancar, frear ou virar. Usar somente juntas visíveis.', '',
          '## Aproveitamento parcial', '',
          '| Vídeo | Movimento | Tempo na cópia examinada | Nota / preparação |', '|---|---|---|---|']
for v in partial_people: human_row(v)
for v in partial_people:
    human += ['', f"**{v['id']}:** {v['avaliacao']['observacao']}"]
human += ['', '## YouTube — vídeos individuais encontrados, aguardando imagem', '',
          'São candidatos de pesquisa. A busca direta confirmou título, canal e link; a tentativa de reproduzir Y01 mostrou verificação de tráfego automatizado. Os sete ainda não foram examinados visualmente e não receberam score ou tempo de seleção.', '',
          '| Vídeo específico | Duração indicada | O que investigar |', '|---|---|---|']
for v in videos:
    if v['id'].startswith('Y'):
        title = v['titulo'].replace('|',r'\|')
        human.append(f"| [{title}]({v['url']}) — {v['autor']} | {v.get('duracao_indicada','')} | {v.get('objetivo_busca','')} |")
human += ['', '## Ainda faltam referências limpas', '',
          '- Sentar, ficar sentado e levantar de cadeira, com a transição inteira e corpo de perfil.',
          '- Arrancar, correr rápido, frear, fazer curvas e dar meia-volta.',
          '- Salto casual completo com contato do pouso em terra.',
          '- Caminhada livre, variações de idade/ritmo e gestos naturais parado.',
          '- Carregar peso e empurrar em ciclos completos; pegar e largar objetos no chão.',
          '- Nado de corpo inteiro, peito e flutuação; P22 só cobre parte da braçada.', '',
          '[Catálogo geral com as decisões e créditos de todos os vídeos](referencias-movimento-real.md). Reservas como P20/P27/P29 têm limitações descritas ali e não contam como movimentos resolvidos.', '']
(ROOT/'docs/referencias-humanas.md').write_text('\n'.join(human))
