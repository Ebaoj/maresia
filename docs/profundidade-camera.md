# Profundidade de campo e a câmera (22/10/2026)

Bug do Joabe jogando a integração f6bf9e6: "a profundidade de campo está meio bugada, não respeita a câmera" e
"afastando e aproximando a câmera: mesmo com a câmera longe, umas coisas ficam borradas". Branch
`profundidade-camera`. Provas em `docs/capturas/profundidade-camera/`; o efeito em `docs/profundidade-de-campo.md`.

## Como foi medido

`scripts/fotos-profundidade.mjs`, modo `pares`: entrada de verdade pelos mesmos ouvintes do jogo (teclas W, S,
Shift, Espaço, Z, C, E; arrastar e roda do mouse no canvas), passo fixo de 1/30 s, e cada quadro desenhado duas
vezes, ligado e desligado, sem o jogo andar entre as duas. Por quadro, a caixa do jogador na tela (os ossos dele
projetados) e manchas do chão a 0,5x, 2x e 4x a distância do jogador na direção da câmera.
`scripts/medir-nitidez-dof.py` dá a energia do gradiente (Sobel) de cada região ligado ÷ desligado: 1 = tão nítido
quanto sem o efeito, abaixo de 0,85 o olho já vê mole. `scripts/grafico-nitidez-dof.py` desenha por quadro, antes
(vermelho) e depois (azul).

Dez vídeos, cada um numa sessão nova do Chrome (gravar vários seguidos perdia o dispositivo WebGPU no meio): zoom
de 2,5 a 45 m e de volta num campo aberto e na Praça do Ferreira, órbita arrastando (inclusive olhando de cima,
inclinação 1,25, e de baixo, -0,25), Z/C com corrida e pulo, câmera empurrada pela Coluna da Hora (2,4 m) e por
uma rua estreita do Centro (8,9 m para 2,9 m de uma vez), sentar num banco, nadar e mergulhar, e o "Ir para" no
meio do vídeo. O ANTES foi gravado num worktree em f6bf9e6 com o mesmo script e o mesmo roteiro.

## As causas

1. **A faixa da frente crescia com o foco.** Ela começava em foco − 1,5 m e enchia na metade disso. Com a câmera a
   45 m, tudo entre ~22 e 43 m da câmera (a rua em volta do jogador, o telhado logo abaixo da câmera) ficava no
   desfoque máximo. É o que o Joabe viu: a 45 m o chão a meio caminho guardava só 7% da nitidez (média), 1% no pior
   quadro.
2. **O fundo começava 8 m fixos depois do jogador.** Com o foco a 45 m, o chão a 180 m (4x) guardava 56%.
3. **O foco andava atrasado.** 0,35 s de suavização e o limite da faixa: no zoom o foco ficava até 6,4 m atrás da
   distância do jogador, e na colisão da rua estreita 2,5 m (a câmera chega na hora, o foco não).
4. **O raio não seguia a lente.** A corrida abre o fov 7° e o desfoque ficava igual. A matriz da câmera usada no
   autofoco era a do quadro anterior (a câmera não está na cena; o three só refaz a matriz dela dentro do render).
5. **A frente quase nítida ainda vazava.** Onde a cobertura da frente era baixa, a junção misturava um pouco da
   imagem de um quarto da resolução, e a rua com a câmera longe perdia ~15% de nitidez mesmo com raio abaixo de meio
   pixel.

## As correções (`src/pos/profundidade.js`, `profundidade-gpu.js`, a tela em `aranhaverso*.js`)

- A faixa nítida passou a ser relativa ao foco, como numa lente: o fundo começa em foco × `dofLongeFator` (2,6), a
  frente em foco × `dofPertoFator` (0,65), com um mínimo de `dofLongeInicio` (2 m) e `dofPertoMargem` (1 m) para o
  corpo do jogador com a câmera colada.
- A frente desfoca em dioptrias: (1/d − 1/começo) × `dofPertoEscala` (3,5). Longe do foco quase nada borra, e o que
  está colado na câmera continua mole. Além de `dofPertoRef` (6 m) de foco ela perde força com o quadrado (plano
  aberto: a 45 m o telhado logo abaixo da câmera fica nítido).
- O foco é a distância de vista até o jogador em cada quadro (`dofFocoSuave` = 0), com a matriz da câmera deste
  quadro. Ela já é suave pela câmera e só pula quando tem de pular. Com suavização > 0 o limite da faixa é relativo.
- O raio segue o fov da câmera (referência 50°, o padrão: no zoom de sempre nada muda).
- A junção só mistura a frente onde o raio dilatado que chega ali passa de meio pixel (o mesmo limiar do fundo).
- `PADRAO_MUDOU` leva quem salvou os padrões antigos (0,35 s, 1,5 m, 8 m) aos novos. No painel entram os fatores e
  a referência do plano aberto.

No zoom de sempre (5 m) o visual aprovado fica: nítido de 3,25 a 13 m, a moldura da frente a ~1,7 m no máximo,
300 m com ~3,8 px.

## Números (ligado ÷ desligado; `comparacao.txt`, por quadro em `nitidez-antes.json` e `nitidez-depois.json`)

| Vídeo | Região | Antes: média (mín.), quadros < 0,85 | Depois |
|---|---|---|---|
| zoom, campo, câmera ≥ 15 m | chão a 0,5x | 0,07 (0,01), 124 de 124 | 0,97 (0,92), 0 |
| zoom, campo, câmera ≥ 15 m | chão a 4x | 0,56 (0,43), 116 de 124 | 0,87 (0,80), 31 (o fundo de verdade, de propósito) |
| zoom, praça, câmera ≥ 15 m | chão a 0,5x (o telhado abaixo da câmera) | 0,12 (0,04), 124 de 124 | 0,99 (0,88), 0 |
| zoom, praça, câmera ≥ 15 m | chão a 4x | 0,90 (0,80), 12 | 0,98 (0,96), 0 |
| zoom, praça, inteiro | chão a 0,5x | 0,13, 236 de 238 | 0,97, 12 (a moldura da frente no zoom de 2,5 a 7 m) |
| rua estreita (colisão) | chão a 0,5x | 0,72 (0,23), 135 de 180 | 0,99 (0,94), 0 |
| colisão na rua | chão a 0,5x | 0,59 (0,08), 219 de 295 | 0,98 (0,84), 2 |
| todos | jogador | ≥ 0,98 em todo quadro (fora o nado) | ≥ 0,98 em todo quadro (fora o nado) |

Atraso do foco (maior diferença entre o foco do efeito e a distância do jogador): zoom 6,40 m → 0; rua estreita
2,46 m → 0; parede 1,12 m → 0; colisão 0,98 m → 0. O jogador ficou nítido nos dois códigos em todo vídeo fora do
nado: o limite da faixa já o protegia; o que borrava era o resto da cena.

Nado: a caixa do jogador cai para 0,18-0,39 em alguns quadros, antes e depois. Olhando os quadros, o corpo está
quase todo embaixo d'água e a caixa (dos ossos) cobre os anéis da água entre a câmera e ele, a ~3 m da câmera, que
desfocam por serem frente no zoom de 5 m; o corpo visível fica igual nas duas versões.

## O que não foi verificado

- Joabe não jogou a versão nova. O "não respeita a câmera" mais geral pode ter outra parte que estes 10 roteiros não
  pegaram.
- A medida compara ligado com desligado no mesmo quadro, mas o desligado tem o desfoque antigo de 8 amostras além
  de 140 m e a estabilização no tempo passa duas vezes no mesmo quadro: no 4x de muito longe e na água a razão tem
  ruído (passa de 1 às vezes).
- A caixa do jogador sai dos ossos (sem cabelo, mão e roupa de fora); a mancha do chão "a 0,5x" é o que estiver na
  frente do chão naquele ponto (o telhado, na praça).
- Câmera colada de verdade (menos de 2,4 m) só nas contas (`testes/unidade/profundidade-camera.test.js`, de 1,2 m),
  não em vídeo; o zoom mínimo da roda é 2,5 m.
- Custo: o efeito tem uma leitura de textura a mais na junção; não medi de novo.
- WebGL: conferido em foto (praça a 5 e a 40 m, sem shader quebrado), não nos vídeos.
- Meu "rua" antigo (3157, 1467) virou campo aberto com a escala nova do mapa; o vídeo de zoom "campo" ficou lá de
  propósito (é o caso mais limpo do zoom), e a rua estreita foi achada de novo pela colisão da câmera.
