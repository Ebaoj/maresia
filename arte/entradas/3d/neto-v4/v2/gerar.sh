#!/bin/zsh
# gera frente e depois lado e costas a partir da frente, para uma parte
cd "$(dirname "$0")"; P=$1; LINHA=$(grep "^$P|" partes.txt); O=$(echo "$LINHA" | cut -d'|' -f2); V=$(echo "$LINHA" | cut -d'|' -f3)
EST=$(cat estilo.txt); CX=~/.local/bin/codex
{ [ -n "$SEM_REF" ] && echo "Use your image generation tool (do not write code, do not draw it yourself). The attached image is ONLY the STYLE reference (copy its smooth hand-painted style, brush texture, lighting and background exactly); it shows a DIFFERENT boy, do NOT copy his face, skin tone or hair. Make a 3D-modeling reference image of $O $V. $EST" || echo "Use your image generation tool (do not write code, do not draw it yourself). The first attached image is the character reference: a 13-year-old boy from a 1930s Brazilian fishing village.${ESTILO_REF:+ The second attached image is the APPROVED STYLE reference: copy its painting style exactly (smooth softly painted surfaces, the same brush texture, the same skin rendering and the same lighting). A previous attempt came out wrong (faceted low-poly planes or photographic realism); do not do that.} Make a 3D-modeling reference image of $O $V. $EST"; echo "Save the resulting image file in the current directory as $P-frente.png and tell me its path."; } > pedido-$P-frente.txt
IMGS=(); if [ -n "$SEM_REF" ]; then IMGS=(-i $ESTILO_REF); else IMGS=(-i ../referencia.png); [ -n "$ESTILO_REF" ] && IMGS+=(-i $ESTILO_REF); fi
$CX exec --skip-git-repo-check --sandbox workspace-write "${IMGS[@]}" - < pedido-$P-frente.txt > log-$P-frente.txt 2>&1
[ -f $P-frente.png ] || { echo "$P: frente falhou"; exit 1; }
if [ $P = maos ]; then VISTAS="palma|view from below showing the PALMS of both hands (the same two hands, now seen from the palm side, left hand still on the left) lado|SIDE view of the same two hands seen from the thumb side, one behind the other"; else VISTAS="lado|SIDE view (left profile: the camera has moved 90 degrees to the subject's left side) costas|BACK view (the camera has moved 180 degrees and sees the subject from behind)"; fi
echo "$VISTAS" | python3 -c "
import sys,re
s=sys.stdin.read().strip()
for m in re.finditer(r'(\w+)\|(.*?)(?= \w+\||$)', s): print(m.group(1)+'\t'+m.group(2))" | while IFS=$'\t' read nome desc; do
  { echo "Use your image generation tool (do not write code, do not draw it yourself). The FIRST attached image is the approved FRONT reference of $O Make the $desc of exactly the same subject: same style, same proportions, same colors, same details, same size and same position in the frame, same lighting and background. Only this one view in the image. $EST"; echo "Save the resulting image file in the current directory as $P-$nome.png and tell me its path."; } > pedido-$P-$nome.txt
  $CX exec --skip-git-repo-check --sandbox workspace-write -i $P-frente.png -i ../referencia.png - < pedido-$P-$nome.txt > log-$P-$nome.txt 2>&1 &
done
wait; ls $P-*.png
