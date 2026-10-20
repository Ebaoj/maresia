#!/bin/zsh
# Gera uma imagem pelo Codex CLI (logado no ChatGPT do Joabe). Prompts em NOME.txt nesta pasta;
# "estilo" antepõe estilo.txt (Arcane + pose para o Tripo). Saída em arte/entradas/personagens-1932/codex/.
# O Codex às vezes gera 2 a 3 imagens por pedido (gasta cota); fica a última da pasta da rodada.
# uso: gerar.sh NOME REFERENCIA [estilo]
cd ~/Projetos/maresia
S=${0:A:h}; T=${TMPDIR:-/tmp}; NOME=$1; REF=$2; OUT=arte/entradas/personagens-1932/codex/$NOME.png
[ -s "$OUT" ] && { echo "$NOME: já existe"; exit 0; }
rm -f "$OUT"; touch $T/.inicio-$NOME
{ echo "Use your image generation tool exactly ONCE to create ONE image (do not regenerate or make variations). Do not copy, move or write any file, do not run commands: just generate the image and stop."; echo; echo "Image prompt:"; echo; [ "$3" = estilo ] && { cat $S/estilo.txt; echo; }; cat $S/$NOME.txt; } > $T/$NOME.prompt
codex exec -s workspace-write -i "$REF" - < $T/$NOME.prompt > $T/$NOME.log 2>&1
# A imagem fica em ~/.codex/generated_images/<sessão desta rodada>/; copia de lá (o Codex já copiou a de outra sessão)
SESSAO=$(grep -m1 -o "session id: [0-9a-f-]*" $T/$NOME.log | awk '{print $3}')
NOVA=$(ls -t ~/.codex/generated_images/$SESSAO/*.png 2>/dev/null | head -1)
[ -n "$SESSAO" ] && [ -n "$NOVA" ] && cp "$NOVA" "$OUT"
N=$(ls ~/.codex/generated_images/$SESSAO/*.png 2>/dev/null | wc -l | tr -d ' ')
[ -s "$OUT" ] && echo "$NOME: ok ($N imagens geradas)" || echo "$NOME: FALHOU (ver $T/$NOME.log)"
