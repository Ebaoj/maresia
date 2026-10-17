# Roupas de verdade (Jolt): plano por fases

Pedido do Joabe em 16/10/2026: "quero a liberdade de poder escolher roupas". O pano de molas
(`pano.js`) só solta a barra, os punhos e a boca da calça; para trocar de roupa e ter saia, camisa aberta
ou vestido balançando, a peça inteira precisa ser pano simulado. Motor: Jolt Physics no navegador
(`jolt-physics`, WebAssembly, do próprio autor do Jolt), que tem pano preso ao esqueleto
(skinned constraints: cada ponto pode se afastar do lugar dele até uma distância máxima) e anteparo
do corpo (back stop: o pano não entra no corpo). A física dos objetos (bola, coco) continua no Rapier.

Como funciona, para caber no navegador:
- a malha desenhada da roupa tem dezenas de milhares de vértices (a camisa do neto, 44.850); o Jolt
  simula uma versão simplificada dela (pano invisível, ~1.000 pontos);
- a malha desenhada continua com o esqueleto de sempre e soma, no shader, o quanto o pano invisível
  se afastou do lugar dele (mesma ideia do `pano.js`), então o contorno de quadrinho e a luz não mudam.

| Fase | O que | Estado |
|---|---|---|
| 1 | Motor: Jolt no jogo, a camisa e a calça do neto como pano de verdade (pano invisível + deslocamento), presas ao esqueleto por região, anteparo do corpo, vento. Liga e desliga no painel contra as molas. Custo medido e vídeo | feito (16/10): camisa com 800 pontos e calça com 548 (grade de 4,5 cm, grupos separados por osso para não rasgar na virilha), 4 iterações; ~2 ms por quadro. Liga no painel ('roupa no Jolt') |
| 2 | Peça sobre peça: camisa por fora da calça sem atravessar, braço e coxa sem atravessar a barra na corrida; dobras desenhadas lendo o pano novo | parcial (16/10): a calça debaixo da camisa fica presa e 1,5 cm para dentro, a camisa ganha sempre. Falta: braço e coxa contra a barra, dobras |
| 3 | Guarda-roupa: formato de peça (glb no esqueleto padrão + mapa do que é solto), trocar a peça no painel com o jogo rodando, esconder a pele debaixo da roupa | |
| 4 | Roupas de 1932 com a sessão do personagem (biblioteca CC0 do MakeHuman): camisa de botão, calça de brim arregaçada, vestido, chapéu de palha | |
| 5 | Avô e multidão: as mesmas peças; perto o Jolt, longe as molas | |
