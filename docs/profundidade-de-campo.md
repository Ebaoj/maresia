# Profundidade de campo (22/10/2026)

Pedido do Joabe: "falta o desfoque da câmera". Código em `src/pos/profundidade.js` (as contas, os uniforms e o
GLSL do WebGL) e `src/pos/profundidade-gpu.js` (o mesmo em TSL para o WebGPU). Ligado em `aranhaverso.js` e
`aranhaverso-gpu.js`; o autofoco recebe `cam.alvo` em `main.js` (`pos.focarEm`). Provas em
`docs/capturas/profundidade/`. Testes das contas em `testes/unidade/profundidade.test.js`.

## O alvo

Os conceitos aprovados (`maresia-chao/docs/referencias/conceito-sertao/*.png` e
`marcos-1932-pesquisa/conceitos/*.png`) e o Arcane: o jogador nítido, o objeto entre a câmera e ele (cesto, banco,
caixote da frente) bem mole, e o fundo amolecendo aos poucos com a distância, sem matar a leitura da cidade (marco
a 100-300 m continua forma). O desfoque é pintado: média em caixa, sem disco de lente (bokeh) nem ruído.

## Por que não o DepthOfFieldNode nem o BokehPass do three

Cada um só existe num renderizador (o node no WebGPU, o pass no WebGL), os dois dão desenhos diferentes (o node
espalha discos de bokeh, fotográficos) e nenhum sabe da cadeia do jogo: a pincelada de Kuwahara, o peso do traço no
alfa da cor, a profundidade que o filtro já tem. Aqui as mesmas contas rodam nos dois, com os mesmos objetos de
uniform (o painel muda os dois juntos).

## Como funciona

Lê a cor e a profundidade que o filtro já desenha (nenhum passe de cena a mais). Fundo em meia resolução, frente
em um quarto:

1. **prévia do fundo** (meia): cada texel junta seus 4 pixels pesando pelo desfoque de cada um, e guarda o
   desfoque no alfa. O jogador, nítido, pesa quase nada no texel que divide com o fundo.
2. **fundo em cruz** (horizontal, vertical; 17 amostras): "espalhar por junção". Uma amostra só entra se o raio
   dela alcança o centro, e o raio vale o **menor** entre o da amostra e o do centro. Por isso o que está nítido
   (o jogador, o lampião) não vaza para o fundo: **sem halo em volta da silhueta**; e o fundo mais longe não come
   a borda do que está mais perto. A saída vai pré-multiplicada pelo desfoque, para a junção ignorar texel nítido
   na mistura bilinear.
3. **frente** (um quarto): cor do que está entre a câmera e o foco, pré-multiplicada pela cobertura; a cobertura é
   dilatada (o maior raio que alcança cada lugar) e a frente é borrada em cruz com esse raio. Ela se espalha por
   cima do jogador, como numa lente (o que está na frente cobre o que está atrás).
4. **junção** (resolução cheia): a cor nítida; o fundo borrado onde o raio passa de meio pixel; a frente por cima.
   O alfa (peso do traço) sai o da imagem nítida.

Na tela, o desfoque antigo de 8 amostras (`desfoqueFundo`) sai quando este está ligado, e o traço e a quina clara
somem onde o fundo ou a frente já estão desfocados (linha nítida em forma mole parecia colada).

### Autofoco

Foco = distância de vista (no eixo da câmera, que é o que a profundidade guarda) até `cam.alvo`, o ponto que a
câmera segue (o jogador, na altura do peito), mais `dofFocoAjuste`, medida com a matriz da câmera deste quadro.
**Desde 22/10 (`docs/profundidade-camera.md`) o foco é essa distância em cada quadro, sem atraso** (`dofFocoSuave`
= 0): ela já é suave (a câmera amacia o alvo e o afastar) e só pula quando tem de pular (aproximar e colisão).
Com `dofFocoSuave` > 0 o foco é suavizado e preso à faixa nítida. Teleporte ou salto de tempo vai direto.
`dofAutoFoco: false` usa `dofFocoManual`.

### A faixa nítida acompanha o zoom (22/10)

A frente e o fundo são relativos ao foco, como numa lente: o fundo começa em foco × `dofLongeFator` (2,6) e a
frente em foco × `dofPertoFator` (0,65), com um mínimo de `dofLongeInicio` (2 m) e `dofPertoMargem` (1 m) para o
corpo do jogador com a câmera colada. A frente desfoca em dioptrias (1/d − 1/começo, vezes `dofPertoEscala`):
com o foco longe, a rua a meio caminho quase não borra. Além de `dofPertoRef` (6 m) de foco a frente ainda perde
força com o quadrado (plano aberto: com a câmera a 45 m, o telhado logo abaixo dela fica nítido). O raio segue o
fov da câmera (referência 50°).

## Parâmetros (`cfg.estilo`, painel Visual > Profundidade de campo)

| Chave | Padrão | O que faz |
|---|---|---|
| `dof` | true | liga |
| `dofAutoFoco` / `dofFocoManual` | true / 8 m | foco no jogador ou fixo |
| `dofFocoAjuste` | 0 m | soma no foco |
| `dofFocoSuave` | 0 s | atraso do foco (0 = a distância do jogador em cada quadro) |
| `dofAbertura` | 1,0 | força geral (frente e fundo) |
| `dofPerto` | 1,0 | desfoque da frente |
| `dofPertoFator` | 0,65 | a frente começa em foco × isso |
| `dofPertoEscala` | 3,5 | quanto a frente desfoca por dioptria |
| `dofPertoRef` | 6 m | plano aberto: com o foco além disso a frente desfoca menos (com o quadrado) |
| `dofPertoMargem` | 1 m | mínimo nítido antes do jogador |
| `dofLongeFator` | 2,6 | o fundo começa em foco × isso |
| `dofLongeInicio` | 2 m | mínimo nítido depois do jogador |
| `dofLongeCheio` | 900 m | distância do desfoque máximo do fundo |
| `dofLonge` | 0,7 | desfoque máximo do fundo (fração do raio) |
| `dofRaio` | 10 px | raio máximo, em pixels de uma imagem de 720 de altura (o desenho é o mesmo em qualquer resolução) |
| `dofOrdem` | 'antes' | antes ou depois da pincelada |

Com os padrões e o jogador a 5 m: nítido de 3,25 a 13 m; a 100 m o raio é ~1,3 px (720p), a 300 m ~3,8 px, o céu
7 px; a frente chega ao máximo (10 px) a ~1,7 m da câmera. Com a câmera a 45 m: nítido de 29 a 117 m, o fundo a
400 m ~4 px. Os padrões saíram das vistas do "Ir para"
(Coluna da Hora, Praça dos Leões, fila da cozinha do Urubu) e de uma rua do Centro, contra os conceitos: neles o
fundo é só um pouco mais mole que o meio e a moldura da frente é bem desfocada.

## Antes ou depois da pincelada: decidido ANTES (A/B)

`docs/capturas/profundidade/ordem-coluna.jpg` e `ordem-leoes.jpg`: desligada, antes, depois, no mesmo instante.
**Antes** (a pincelada de Kuwahara pinta por cima do desfoque): o fundo mole vira manchas chapadas de tinta, como o
fundo pintado dos conceitos e do Arcane. **Depois**: o desfoque borra as pinceladas e o fundo fica liso,
fotográfico, como lente de câmera. O filtro de quadrinho (retícula, hachura, papel, grão) vem depois dos dois na
tela, então fica sempre nítido por cima, como a impressão sobre o desenho.

## Custo (medido em 22/10/2026, Mac, WebGPU, 2000 x 1125 = 2,25 MP)

Números brutos em `docs/capturas/profundidade/medidas.txt`. Medido pela cadeia sozinha (os passes do efeito desenhados 40 vezes seguidas com leitura no fim, alternando com e
sem, mediana de 5): **1,60 ms na rua do Centro e 1,65 ms na Coluna da Hora**; sem a frente (`dofPerto: 0`, os
passes dela nem rodam), 1,15 e 1,18 ms. Por passe (Coluna da Hora): prévia do fundo 0,24, fundo em cruz 0,20 +
0,19, prévia da frente 0,21, dilatação 0,07 + 0,07, frente em cruz 0,07 + 0,07, junção 0,34.

A primeira versão, tudo em meia resolução, custava ~2,1 ms (a frente sozinha ~1 ms): por isso a frente, o borrão
grande, foi para um quarto da resolução antes de mexer em qualidade. O que sobra acima de 1,5 ms é a junção em
resolução cheia e a sobra fixa de cada passe no WebGPU (~0,07 ms). A 1280 x 720 o custo cai com o número de pixels.

`maresia.medir` (quadro inteiro, variantes alternadas, 5 e 7 repetições) não serviu para esta medida: a máquina
estava com load de 7 a 11 (outras sessões) e o quadro inteiro, de 60 a 77 ms, variou mais que o efeito entre as
rodadas (numa rodada "ligado" saiu 12 ms mais caro, na seguinte 4 ms mais barato).

## Provas (`docs/capturas/profundidade/`)

Fotos do WebGPU, 1280 x 720 (a área do jogo sai 1280 x 577 no Chrome sem janela), cada par no mesmo instante
(`scripts/fotos-profundidade.mjs`), composto por `scripts/compor-profundidade.py`: DESLIGADA em cima, LIGADA
embaixo, o conceito ao lado.

- `coluna.jpg` (vista do conceito da Coluna da Hora, `praca-ferreira.png`), `leoes.jpg` (Praça dos Leões,
  `praca-leoes.png`), `cozinha.jpg` (Campo do Urubu, fila da cozinha, `3-campo-urubu.png`), `rua.jpg` (rua do
  Centro ao meio-dia, a 230 m a oeste da praça, `1-rua-centro-meio-dia.png`)
- `frente.jpg`: a moldura da frente (banco a ~2 m da câmera), `noite.jpg` (21h), `agua.jpg` (nadando no Poço da
  Draga; na foto desligada o jogador está no mergulho)
- `ordem-coluna.jpg`, `ordem-leoes.jpg`, `ordem-frente.jpg`: desligada, antes e depois da pincelada (ampliadas)
- `webgl/`: as mesmas 4 vistas e a moldura no WebGL
- `andando.mp4`: 8 s andando, girando a câmera e andando de novo na rua do Centro; desligada em cima, ligada embaixo
- `medidas.txt`: os números do custo e da cintilação

## O que foi conferido e o que não

Conferido: as 4 vistas nos dois renderizadores (sem shader quebrado, sem aviso de material sem gLuz); a noite na
Coluna da Hora; o jogador nadando no Poço da Draga; a moldura da frente (banco a ~2 m da câmera); o vídeo andando e
girando a câmera na rua, desligado em cima e ligado embaixo (`andando.mp4`, duas gravações do mesmo roteiro com
passo fixo): sem cintilação visível; a diferença de quadro contra a média dos vizinhos fica igual no fundo (6,4
ligada contra 6,1 desligada no primeiro trecho andando, 3,3 contra 3,5 no segundo) e cai no chão (7,7 contra 9,0);
sem halo em volta do jogador e do lampião contra o fundo; o HUD e o painel são HTML, fora do canvas, e não
desfocam.

Não conferido: a época 1881 (memória) e o visual "quadrinho" em fotos (o código é o mesmo, a ordem também); a
câmera de fato embaixo d'água (a câmera do jogo não desce abaixo de 0,6 m do chão, então não há esse caso hoje);
máquinas sem WebGPU fora do Mac; o custo com a máquina ociosa.
