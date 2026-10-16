#!/bin/zsh
# Junta as imagens de uma rodada em folhas de comparação: uma por direção,
# linhas = opções de etnia, colunas = as variações de semente. Uso: ./folhas.sh saida/neto-v2
R=$1
for d in $(ls $R | sed 's/-[^-]*$//' | sort -u); do
  linhas=()
  for e in negro caboclo branco; do
    [[ -d $R/$d-$e ]] || continue
    ffmpeg -loglevel error -y -i $R/$d-$e/$d-$e-1.png -i $R/$d-$e/$d-$e-2.png -filter_complex "hstack=2,scale=1600:-1" /tmp/linha-$e.png
    linhas+=(-i /tmp/linha-$e.png)
  done
  n=$(( ${#linhas} / 2 ))
  ffmpeg -loglevel error -y $linhas -filter_complex "vstack=$n" -q:v 4 $R/folha-$d.jpg
  echo $R/folha-$d.jpg
done
