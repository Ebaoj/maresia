# Campo do Urubu: fotos antes e depois

Para o Joabe aprovar **o lugar** antes de ir além (a vila da ferrovia, a oficina da RVC, a
estação e a gente em movimento). Nada aqui mostra cena de morte, doença ou violência, personagem
com fala nem evento: é o campo, o arame, os galpões e o trabalho.

## Como as fotos foram tiradas

`scripts/foto-antes-depois.mjs`, no Chrome headless com **WebGPU** (a GPU da máquina, Metal):

- o jogo roda na tree do trunk, com o painel de ajustes fechado (H);
- para cada vista, a foto **depois** sai com a cena visível e a foto **antes** sai com as 20 malhas
  da cena escondidas: mesma câmera, mesma hora (9h30), mesmo quadro do motor, a única diferença é
  a cena;
- as folhas `campo.png`, `galpao.png`, `cozinha.png` e `tarefa.png` têm **ANTES em cima e DEPOIS
  embaixo**; os arquivos `-antes` e `-depois` são as fotos soltas.

## O que estas fotos mostram

- os 4 galpões de folha de zinco, com a nervura da chapa e a porteira;
- as 20 tarefas de terra, cada uma cercada com arame de estaca e porteira;
- a cozinha, o posto médico e a capela;
- o arame de contorno do campo, com o portão da triagem e a casa da guarda;
- a gente do campo: a fila da cozinha, a fila do portão e quem trabalha na terra.

## O que estas fotos NÃO mostram

- a vila operária da ferrovia e a oficina da RVC (o mapa deu os pontos, não a planta);
- a estação do Urubu (depende do trilho, que é do mapa);
- a gente em movimento (no projeto, movimento é rotoscopia, não pose inventada).

## A cena no código

`src/mundo/urubu1932.js`, com os dados em `src/mundo/mapa1932.js` e a história em
`docs/historia-urubu.md`. O que a cena **é**: galpões, arame, cozinha, posto, capela, portão,
tarefas de terra e a gente nas filas e no trabalho.
