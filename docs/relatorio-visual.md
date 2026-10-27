# Relatório visual: pisca, desenho "mal feito" e pincelada (27/10/2026)

Diagnóstico, sem mudar código do jogo (branch `visual/diagnostico`, a partir de `7bcd37c`).
Queixa do Joabe: o jogo **fica piscando**, as coisas parecem **mal desenhadas**, a **pincelada** (o "2D por cima do
3D") está mal feita, e ele **não gosta da perda de resolução**. Também: os **canteiros da Praça mudaram de cor** depois
do `003cc70`.

Este relatório parte do estudo de 22/10 (`docs/pisca-22-10.md`), que já corrigiu quatro causas (gravador, sombra do
sol girando, z-fighting do meio-fio, estabilização no tempo). O que segue é o que **sobrou** e o que **voltou** com o
governador (`7580d46`) e o LOD novo (`003cc70`), ambos de 27/10.

Legenda de severidade: **A** (alta: visível sempre ou quase, atinge a tela toda), **M** (média: visível em situações
comuns), **B** (baixa: detalhe ou caso raro). Custo de desempenho estimado para o M1 (TBDR, Apple), sem medir: o número
real sai do `maresia.medir` com variantes alternadas, como manda o CLAUDE.md.

---

## Resumo em uma tela

1. **Resolução**: numa tela Retina o perfil "medio" desenha a **metade** dos pixels em cada eixo (`tetoRetina: 1.0`
   com dpr 2) e o navegador estica a imagem. O governador ainda pode descer para 0,75 (37,5% da linha nativa) e, em
   emergência, 0,5 (25%). É a fonte principal do "borrado" e da "perda de resolução".
2. **Nenhum antisserrilhado espacial**: `antialias: false`, alvo da cena sem MSAA, nenhum FXAA/SMAA. A estabilização
   (TAA sem tremor) só segura o que **vai e volta**; o serrilhado parado (escada nas bordas) continua, e na metade da
   resolução nativa ele fica com degraus de 2 × 2 pixels físicos.
3. **O governador vira catraca a 60 Hz e liga e desliga efeitos inteiros**: ele mede o intervalo do
   `requestAnimationFrame`, que a 60 Hz nunca fica abaixo de 16,7 ms; para **subir** pede p50 < 14,2 ms, que nunca
   acontece. Então, numa tela de 60 Hz, cada degrau que desce **não volta mais** até recarregar. E os degraus trocam o
   visual de uma vez: pincelada em meia, sem desfoque, LOD mais curto (as árvores entre 60 e 90 m trocam todas no mesmo
   quadro), sem sombra de perto e **sem a estabilização** (o pisca corrigido em 22/10 volta).
4. **Grão a 8 Hz depois da estabilização**: o grão (`arcGrao` 0,04) é ruído branco novo a cada 1/8 s, por cima de
   tudo, fora do TAA. Em parede lisa e calçada isso é um "chuvisco" que pulsa 8 vezes por segundo.
5. **A pincelada (Kuwahara)** está no modo mais barato e sem as partes que a deixam estável: 12 amostras numa grade
   4 × 4 esticada até 6 px (amostras a 4 px uma da outra), tensor de estrutura sem suavização, anisotropia que explode
   em área lisa, escolha de setor muito dura (expoente 5) e borda "protegida" que devolve a imagem crua (serrilhada)
   justamente onde o olho mais olha. Resultado: manchas em grade, direção do traço que treme, borda dura e crua.
6. **Ruído da faixa de luz preso ao mundo, sem filtro**: a pincelada que recorta sombra/meio-tom/luz nos materiais
   (`pincelada()`, até 33 ciclos por metro) passa do limite de Nyquist a partir de ~15 m e cintila andando.
7. **Sombra**: o mapa de perto é refeito **a cada 2 quadros** (sombra de quem anda dá tranco a 30 Hz); a sombra das
   folhas no cache não balança e pula quando o cache refaz; a faixa de troca perto/longe anda com o jogador.
8. **LOD sem transição**: casas detalhadas viram caixa por bloco de 96 m a 70 m; árvores trocam corpo por copa simples
   a 90 m; células de muito longe trocam cheia/simples/mancha/corte em lote a cada 12 m andados, sem histerese.
9. **Canteiros da Praça**: o `003cc70` **não** muda a cor deles (antes e depois idênticos com a hora parada). Mudam
   pela **hora do jogo** (abre às 16,6 h e anda 1 h por minuto real: às 17 h o canteiro já é marrom-violeta) e pelo
   degrau `pincelada-meia` do governador (seção 4).

---

## 1. Pisca (cintilação)

### 1.1 Governador: degraus que trocam o visual inteiro, e que não voltam a 60 Hz — **A**

Evidência:
- `src/main.js:489` e `:506`: o governador recebe `real * 1000`, o intervalo entre dois `requestAnimationFrame`.
- `src/render/governador.js:46` (`subirP50 = 0.85`) e `:148`: subir exige `p95 < 16,7 × 1,15 = 19,2 ms` **e**
  `p50 < 16,7 × 0,85 = 14,2 ms`.
- O intervalo do rAF é preso ao vsync, em múltiplos do período da tela. Numa tela de **60 Hz** o p50 é 16,7 ms mesmo
  com a placa ociosa: **a condição de subir nunca é verdadeira.** Numa tela de **120 Hz** (ProMotion) os intervalos
  são 8,3 ou 16,7 ms; o p50 só fica abaixo de 14,2 ms se mais da metade dos quadros sair em 8,3 ms, ou seja, com
  ~90 FPS médios ou mais. Nos 72-78 FPS que o próprio comentário do governador cita para o M1 do Joabe
  (`governador.js:4`), a maioria dos intervalos é de 16,7 ms: também não sobe.
- Descer exige p95 > 21,7 ms sustentado por 3 s: basta ~5% dos quadros perderem um vsync (33 ms a 60 Hz; 25 ms a
  120 Hz), o que acontece em qualquer trecho com montagem de casas, troca de LOD ou refazer do cache de sombra.
  Conclusão: no uso real o governador é uma **catraca**: cada degrau que desce fica até recarregar a página.
  (Os testes de unidade do governador alimentam tempos contínuos, como 12 ms, que o rAF nunca entrega.)
- `src/render/governador.js:30-36`, os degraus antes da resolução:
  - `pincelada-meia` (`:31`): a pincelada passa a meia resolução de uma vez: a imagem amolece num quadro.
  - `sem-dof` (`:32`): o desfoque de fundo e frente some num quadro.
  - `distancia` (`:33`): `cortePx` 3 → 6 (centenas de peças pequenas somem juntas), gente até 260 m, detalhe dos
    marcos até 110 m (balaústres, flores, ferragens somem).
  - `lod` (`:34`): `lodPerto` 65 → 40, `lodLonge` 85 → 55, `lodBloco` 90 → 60: **toda** árvore entre 60 e 90 m troca o
    corpo pela copa simples no mesmo quadro, e os cartões de folha entre 40 e 85 m encolhem.
  - `sem-sombra-perto` (`:35`): toda sombra a menos de ~24 m passa de 4,7 cm por texel para o mapa de longe (17 cm
    por texel no perfil médio, `resolucaoSombra` 2048 em 346 m): a sombra do jogador, das sacadas e das grades
    engorda e borra num quadro.
  - `sem-estabilizar` (`:36`): **desliga o TAA**: volta o pisca das linhas finas (grade de sacada, cornija, friso)
    que o estudo de 22/10 mediu e corrigiu (andando, 0,032% → ~0,22% de pixels piscando por quadro).
- Cada descida de resolução (`pixel-0.9/0.8/0.75`) chama `redimensionar()` (`src/main.js:512-516`), que realoca os
  alvos e invalida o quadro anterior da estabilização: um quadro sem TAA mais a mudança de nitidez.

Por que parece "pisca": quem joga vê a imagem mudar de caráter sozinha a cada poucos segundos (o p95 é julgado a cada
250 ms, descida a cada ~6 s: 3 s sustentado + 3 s de resfriar). Em 40 s de um trecho pesado a escada vai de "cheio" a
"sem-estabilizar". E a 60 Hz nada volta.

Correção proposta:
- Medir o **custo** do quadro, não o intervalo do rAF: no WebGL, `EXT_disjoint_timer_query_webgl2` não serve no Mac
  (o CLAUDE.md já diz que dá números incoerentes); usar o tempo de CPU do `passo()` + `onSubmittedWorkDone` no
  WebGPU (já existe para a resolução dinâmica em `main.js:520-523`), ou, no WebGL, a fração de quadros que perdem o
  vsync (intervalo > 1,5 × período do vsync) em vez de percentil de ms.
- Subir pela mesma régua que desce (folga = poucos quadros perdidos), não por p50 < 0,85 × orçamento.
- **Tirar da escada o que muda o visual**: `sem-estabilizar` (o TAA custa uma leitura de 5 + 5 amostras; é o
  último que deveria sair, nunca antes da resolução), `sem-dof` e `pincelada-meia` (trocar por raio menor e menos
  amostras, mudança que o olho não vê). Manter na escada só o que não aparece: resolução da sombra de perto,
  `sombraPertoACada`, distância de corte de miúdos, grama.
- Transição em vez de degrau: misturar em 0,5 s (`estabilizar`, `dofAbertura`, `arcPintura` são números; o
  governador pode interpolar).
- Mostrar no FPS do canto o degrau atual (para o Joabe saber quando é o governador).

Impacto visual: alto (some a mudança "sozinha" de nitidez e de LOD, e o pisca de linha fina não volta).
Custo: zero para a correção da medida; o jogo passa mais tempo no degrau cheio, então a média de custo sobe onde
ele hoje desce sem precisar.

### 1.2 Grão de filme novo a cada 1/8 s, fora da estabilização — **A**

Evidência:
- `src/pos/aranhaverso.js:411`: `cor += (hash(floor(px) + fract(uTempo * 7.13) * 91.7) - 0.5) * uGrao;`
- `src/pos/aranhaverso.js:699`: `uTempo = floor(tempo * fpsTraco) / fpsTraco`, com `fpsTraco: 8` (`src/config.js:94`).
- `arcGrao: 0.04` (`src/config.js:26`): ±2% de luminância por pixel, ruído branco, e no Retina a 1,0 cada "grão" é
  um bloco de 2 × 2 pixels físicos.
- Ele entra no passe final (`fragTela`), **depois** da estabilização (`src/pos/aranhaverso.js:848-856`): o TAA não
  o vê. O mesmo vale no WebGPU (`src/pos/aranhaverso-gpu.js:535`).
- Câmera parada e tempo parado: o `uTempo` não muda e não há pisca (por isso a medida "parado" de 22/10 deu 0%).
  Com o tempo andando (o jogo de verdade), a tela inteira troca de grão 8 vezes por segundo.

Correção proposta: grão **fixo** (tirar `uTempo` do hash: vira textura de papel, que é o que um quadro pintado tem),
ou ruído azul de baixa amplitude a cada quadro (24-60 Hz, imperceptível como pulso). Se quiser o grão vivo,
pelo menos `arcGrao` ≤ 0,015 e taxa ≥ 24 Hz.
Impacto visual: alto em parede lisa, céu e calçada. Custo: zero.

### 1.3 Sombra de perto refeita a cada 2 quadros — **M/A**

Evidência:
- `src/config.js:381` (`sombraPertoACada: 2`) e `src/render/sombra-perto.js:136-151`: o mapa de perto (48 m, o da sombra
  nítida do jogador, da gente e das folhas que balançam) só é redesenhado em quadros alternados.
- No quadro sem refazer, o mapa e a matriz dele são os do quadro anterior: a sombra de tudo que se mexe (jogador,
  gente, folhas no vento, bola, coco) **anda a 30 Hz** enquanto o resto anda a 60. A 60 Hz isso é um tremor
  regular da sombra embaixo do pé andando; com a câmera seguindo o jogador, a sombra dele "escorrega" e volta.

Correção proposta: `sombraPertoACada: 1`, e para economizar, desenhar no mapa de perto só os dinâmicos por cima de
uma cópia em cache dos parados (o mesmo truque do `cache-sombra.js` para o mapa de longe). Alternativa barata:
manter 2, mas refazer sempre que algum dinâmico perto do jogador andou mais de meio texel.
Impacto: médio-alto (é a sombra do personagem, que está sempre no centro da tela). Custo: um passe de sombra de
48 m por quadro (o estudo de 24/10 achou isso caro: medir com `maresia.medir`). Com o cache dos parados, quase zero.

### 1.4 Sombra das árvores em cache não balança e pula quando o cache refaz — **M**

Evidência:
- `src/render/cache-sombra.js:13`: "Limite conhecido: a sombra de folha que balança no vento é de parado e não
  balança até o próximo refazer."
- O cache refaz por janela (jogador a mais de 15 m do centro) ou pelo sol (`limiarSolGraus` 0,05°,
  `src/render/politica-sombra.js:25`; com `passoSombraMin: 0`, `src/config.js:374`, o sol anda sempre). Quando refaz,
  todas as sombras de folha além do mapa de perto pulam de uma vez para a fase nova do vento.
- `cacheSombraFatias: 6` no WebGPU (`src/config.js:382`): o mapa novo é desenhado em 6 quadros e trocado de uma vez.

Correção proposta: tirar as copas (cartões e corpo com vento) do conjunto dos parados e desenhá-las por cima, como os
dinâmicos, **só dentro de um raio** (ex.: 60 m); além disso, sombra de copa sem vento (o olho não vê o balanço a 100 m
mas vê o pulo). Ou deixar o vento fora do passe de sombra de longe (sombra parada, sem pulo).
Impacto: médio (praças e ruas arborizadas, que são o cenário do jogo). Custo: baixo a médio (mais casters por quadro
dentro do raio).

### 1.5 A faixa de troca perto/longe da sombra anda com o jogador — **M**

Evidência:
- `src/config.js:379-385`: janela de perto de 48 m, 8 m à frente do jogador, mistura de 12% da janela com o de longe.
- No perfil médio o de longe tem 17 cm por texel (2048 em 346 m); o de perto, 4,7 cm. Na faixa de mistura a borda da
  sombra muda de forma (dura → borrada) e essa faixa se desloca com o jogador e com a câmera (o centro vai 8 m para
  onde a câmera olha): girando a câmera, as sombras a ~20 m "respiram".
- O de perto segue o sol contínuo e o de longe só muda quando o cache refaz: na faixa as duas sombras não coincidem
  (borda dupla).

Correção proposta: janela de perto centrada no jogador, sem o "à frente" (ou com o à frente preso à grade de 2 m);
faixa de mistura em metros fixos (ex.: 6 m), não fração; `resolucaoSombra` 4096 no médio se o custo deixar (a sombra
de longe é desenhada em cache, então o custo é só memória e o refazer).
Impacto: médio. Custo: baixo.

### 1.6 LOD que troca sem transição — **M**

Evidência:
- Casas: `src/mundo/quarteirao.js:643` (`PERTO = 70`) e `:688`: o **bloco de 96 m inteiro** troca a casa detalhada
  (vãos recuados, folhas 3D, beiral) pela caixa de fachada pintada no mesmo quadro. Há folga de 8 m (não pisca na
  divisa), mas a troca é um "pop" de uma fileira de casas.
- Árvores: `src/mundo/lod-arvores.js` (`003cc70`), cada cópia troca corpo + cartões por copa simples a `lodBloco`
  (90 m), refeito a cada 6 m de câmera, folga de 8 m. Os cartões encolhem suave antes (`vento-arvores.js`), o corpo
  não.
- Muito longe: `src/mundo/muito-longe.js` (`003cc70`), cheia → simplificada (48 px) → mancha de 20 triângulos (28 px)
  → corte (3 px), refeito **a cada 12 m** de câmera e **sem histerese** (a comparação é `corta === fx.cortada &&
  mancha === !!fx.mancha`): todas as trocas acumuladas em 12 m saem no mesmo quadro.
- Detalhe dos marcos (`src/mundo/marcos1932/index.js:54-63`): flores, balaústres e ferragens somem além de
  `distDetalhe` (170 m; 110 m com o governador), conferido a cada 0,5 s, sem folga.
- Grama (`src/mundo/grama.js:48-49`): a folha some quando `fract(aRand*91.7) > manter`, sem encolher antes.

Correção proposta (do mais barato ao mais caro):
- Histerese e passo menor no muito longe (refazer a cada 4 m, folga de 10-15% no px).
- **Dissolução por pontilhado** (dither) na troca: as duas versões desenhadas por 0,3-0,5 s, uma saindo e a outra
  entrando por uma máscara de Bayer **presa ao mundo** (não à tela, senão vira porta de box). Com a estabilização
  ligada o pontilhado vira transparência de verdade. É o padrão da indústria (Unreal, Unity "LOD crossfade").
- Grama: encolher a folha até zero antes de sair (`larg *= smoothstep`), como os cartões das árvores já fazem.
Impacto: médio (andando pela cidade, o pop é contínuo). Custo: dither = duas versões por 0,5 s em poucas cópias.

### 1.7 Brilho (bloom) em um quarto da resolução, com uma amostra — **M (noite, água)**

Evidência:
- `src/pos/aranhaverso.js:538` e `:836-845`: o passe claro lê a cor **crua** da cena (`rtCor.textures[0]`, antes da
  estabilização) com **uma** leitura bilinear direto para 1/4 da resolução. Uma janela acesa, o vidro do lampião ou o
  brilho do sol na água menores que 4 px caem ou não na amostra conforme andam: o halo acende e apaga.

Correção proposta: descer em cadeia (1/2, 1/4) com o filtro de 13 amostras (ou 4 leituras bilineares por texel) e ler
a cor já estabilizada. Impacto: médio à noite e na orla. Custo: ~2 passes pequenos (1/4 e 1/16 dos pixels).

### 1.8 Oclusão (SSAO), quina clara e traço: fora da estabilização — **B/M**

Evidência:
- SSAO em meia resolução, 12 amostras, rotação por célula de 4 cm do mundo (`src/pos/aranhaverso.js:58`), borrada só
  por 5 leituras no passe final (`:195-200`). A rotação por célula de 4 cm vira ruído de pixel a média distância.
- A quina clara (`arcAresta` 0,7, `src/pos/aranhaverso.js:371`) e o contorno saem da profundidade, que o TAA não
  toca: nada disso é estabilizado.
- O estudo de 22/10 mediu `arcAresta` e oclusão sem efeito no pisca com o TAA ligado; com o governador no degrau
  `sem-estabilizar`, voltam.

Correção proposta: borrar a oclusão com filtro bilateral (profundidade) em 2 passes, e/ou guardar a oclusão no
mesmo histórico do TAA. Impacto: baixo-médio. Custo: baixo.

### 1.9 O que **não** é causa (conferido no código)

- **Z-fighting**: os dois achados em 22/10 foram corrigidos (`5002b62`) com teste. Profundidade em float32, near 0,3:
  resolução de 18 mm a 300 m. Não achei planos coincidentes novos nos arquivos de `003cc70` (a caixa de 10
  triângulos das casas de muito longe tira as fatias e o fundo; não cria face nova).
- **Sombra do sol girando**: corrigida em 22/10 (`alinharAoTexel` com âncora, teste `pisca-sombra.test.js`).
- **Tremor do traço** (`tremorLinha` 1,4 a 8 Hz): no visual Arcane `uTremor = 0` (`src/pos/aranhaverso.js:723`) e
  `uDesalinho = 0` (`:729`). Só vale no visual "quadrinho" e na memória de 1881.
- **Pincelada como fonte de pisca**: em 22/10 ela **reduzia** a cintilação (0,237% → 0,347% sem ela, andando). Ela
  piora o desenho (seção 2.3), não o pisca de linha fina; mas a escolha de setor dura (2.3c) faz a mancha "ferver"
  em superfícies com textura fina quando a câmera anda.

---

## 2. Desenho "mal feito"

### 2.1 Metade da resolução numa tela Retina, e o governador descendo mais — **A**

Evidência:
- `src/qualidade.js:76-79`: `tetoPixel = min(dpr, tetoRetina)` quando dpr > 1,5.
- `src/qualidade.js:26-28` e `src/config.js:548`: perfil médio (o padrão) com `tetoRetina: 1.0`. Num Mac com dpr 2,
  o desenho é **1 pixel por 2 × 2 pixels físicos**; o canvas é esticado pelo navegador com filtro bilinear.
- `src/render/governador.js:37-41`: degraus 0,9 → 0,8 → 0,75 (normal) e 0,65 → 0,5 (emergência). A 0,75 num Retina,
  a cena tem 37,5% da linha nativa; a 0,5, 25%.
- Tudo o que é "de tela" escala junto: o grão (`floor(px)` com `px = gl_FragCoord/uPR`), o raio da pincelada (3 px
  **da imagem**, `src/pos/pintura.js:139`), a borda protegida. A 1,0 no Retina a pincelada tem o dobro do tamanho
  pensado; a 0,75, 2,7 vezes.

Correção proposta (as duas juntas):
- **Separar a resolução da cena da resolução da tela**: a cena (o caro: geometria, sombra, materiais) na escala que
  o desempenho permite; o passe final (`fragTela`: papel, trama, grão, gradação) **e um aumento com nitidez** (FSR 1
  EASU + RCAS, ou ao menos um passe de nitidez CAS) em resolução nativa. O papel e a trama na resolução nativa fazem
  a imagem "ler" como nítida mesmo com a cena a 0,75 (é como uma pintura escaneada).
- Subir o médio para `tetoRetina` 1,25-1,5 quando o governador estiver corrigido (1.1), e escalar `arcPinturaRaio`
  por `pixelRatio` (raio em pixels CSS, não da imagem).
Impacto: **o maior de todos** para "borrado" e "perda de resolução". Custo: o passe final em nativa é ~4× mais pixels
que hoje só nele (barato: é uma leitura de cada alvo); EASU+RCAS ~0,3-0,5 ms a 2880 × 1800 no M1. Subir a cena
para 1,25 custa ~56% a mais de pixels na cena: só com a medida.

### 2.2 Nenhum antisserrilhado espacial — **A**

Evidência:
- `src/render/renderizador.js:31` e `:65`: `antialias: false` nos dois renderizadores (irrelevante, a cena vai para alvo).
- `src/pos/aranhaverso.js:523` e `src/pos/aranhaverso-gpu.js:34`: o alvo da cena (`rtCor`, MRT de 2 cores + profundidade)
  sem `samples`. Nenhum FXAA/SMAA na cadeia (`grep` sem resultado).
- A estabilização (`src/pos/estabilizar.js`) é TAA **sem tremor de subpixel** (decisão de 22/10, para a profundidade
  não tremer): ela tira o pisca do que vai e volta, mas **não suaviza a escada parada**. Toda quina, beiral, fio e
  silhueta tem degrau de 1 pixel da imagem = 2 pixels físicos.
- A pincelada **protege** as bordas (`src/pos/pintura.js:109-111`): onde há borda forte ela devolve a imagem original,
  ou seja, exatamente a escada.
- O jogador e a gente (alfa < 0,95) ficam **fora** da estabilização (`src/pos/estabilizar.js:63-64`): o boneco, que
  está sempre no centro, é o objeto mais serrilhado da tela.

Correção proposta, em ordem:
1. **SMAA 1x** (ou FXAA 3.11 de qualidade) na cor, **antes** do grão e do papel (senão ele borra o grão), depois da
   estabilização. Barato e resolve a escada parada. Ler a profundidade para a detecção de borda (SMAA por
   profundidade) evita amolecer a textura pintada.
2. **MSAA 4x** no alvo da cena: no M1 (TBDR) a resolução é feita no tile, é o antisserrilhado mais barato que existe ali.
   Cuidado: o alfa guarda o peso do traço (0,5 jogador, 0,85 gente, 1 cenário) e o `gLuz`; na borda a média dá 0,75
   (o fundo da silhueta do jogador seria lido como "gente"). Resolver lendo o alfa sem média (`texelFetch` da
   amostra 0) ou trocando os limiares por faixas que aceitem mistura. O three 0.186 aceita `samples` em
   `WebGLRenderTarget` com `count: 2`.
3. Deixar o jogador e a gente entrarem no TAA com vetor de movimento próprio (hoje eles ficam de fora porque a conta
   é só pela câmera). Isso é o trabalho maior; SMAA já resolve boa parte do boneco.
Impacto: alto. Custo: SMAA ~0,4-0,8 ms em 1440 × 900 no M1; MSAA 4x no M1 pequeno em tempo, médio em memória (MRT half
float × 4 amostras); medir.

### 2.3 A pincelada (Kuwahara anisotrópico) — **A** para "mal feita"

O que o filtro deveria fazer (Kyprianidis 2009/2011): cada pixel olha uma elipse orientada pela estrutura da imagem,
dividida em 8 setores, e fica com a média dos setores mais lisos. O que está no jogo (`src/pos/pintura.js`):

a) **Amostras demais esparsas** — `arcPinturaAmostras: 4` (`src/config.js:86`) = 12 amostras numa grade 4 × 4
   dentro do disco (`amostrasDisco`, `pintura.js:16-26`), nos pontos −1, −⅓, ⅓, 1 do raio. Com `arcPinturaRaio` 3 e a
   elipse esticada até 2× (`pintura.js:88`), o eixo maior tem 6 px e as amostras ficam **a 4 px uma da outra**. Cada um
   dos 8 setores recebe ~1,5 amostra com peso: a "variância" do setor não mede nada. O resultado são manchas em
   padrão de grade (o 4 × 4 aparece) em vez de pinceladas. É o que mais lê como "mal feito".
b) **Tensor de estrutura sem suavização** — `fragTensor` (`pintura.js:56-68`) é um Sobel com passo de 1,5 px, e
   vai direto para o Kuwahara. O método original **borra o tensor** (gaussiana σ ≈ 2 px) antes de tirar a direção.
   Sem isso, a direção do traço muda de um pixel para o outro e de um quadro para o outro em área com textura
   (reboco pintado, calçamento, folhagem): a pincelada "ferve" andando.
c) **Anisotropia que explode no liso** — `pintura.js:87`: `A = (l1 - l2) / (l1 + l2)` com corte em `1e-8`. Num
   reboco liso os dois autovalores são quase zero e qualquer variação mínima dá A ≈ 1: elipses compridas em direção
   aleatória justamente onde a superfície é lisa. O método original usa `A` só com gradiente acima de um limiar.
d) **Escolha de setor dura** — `arcPinturaNitidez: 10` (`config.js:83`) vira `pow(..., 5)` (`pintura.js:100`): o setor
   mais liso ganha quase tudo. Com poucas amostras (a), a "vitória" troca de setor por ruído, e o pixel salta entre
   médias diferentes. Visto como manchas que trocam de forma de um quadro para o outro.
e) **Borda protegida crua** — `pintura.js:109-111`: onde o tensor tem borda forte **ou** o resultado ficou diferente
   do original (`|Lo − Lr|` > 0,06-0,16), volta a imagem original. Isso cria dois regimes lado a lado: o interior
   pintado e uma moldura de 2-4 px **crua e serrilhada** em toda quina. A decisão por limiar sobre o próprio
   resultado também troca de lado com variações pequenas: borda que alterna entre pintada e crua.
f) **Raio em pixels da imagem** — `pintura.js:139`: não acompanha `pixelRatio`, então a pincelada muda de tamanho com
   o Retina e com o governador (2.1), e a meia resolução (`arcPinturaMeia`, degrau do governador) dobra de novo.
g) **Pincelada de tela, não do mundo** — o Kuwahara é um filtro de imagem: as manchas são recalculadas a cada quadro
   a partir do que a câmera vê. Isso por si não pisca (é determinístico), mas não dá "pincelada que pertence ao
   objeto". O que dá a cara do Arcane é **a textura pintada nos materiais** (que o jogo já tem: `texturaPintada`,
   o pintor de luz) com o filtro só alisando o resto.

Correção proposta (para o "2D sobre 3D" ficar bom):
1. Mínimo e barato: `arcPinturaAmostras` 5 (21 amostras) ou 7 (37), `arcPinturaRaio` 2-2,5 **em pixels CSS**
   (× `pixelRatio`), `arcPinturaNitidez` 6-8.
2. Suavizar o tensor: um borrão separável de 5 amostras em meia resolução (2 passes pequenos) antes do Kuwahara.
3. Anisotropia só com gradiente: `A *= smoothstep(lim0, lim1, l1 + l2)`.
4. Trocar a borda protegida por **raio menor perto da borda** (o raio cai com `sqrt(l1)`), em vez de devolver o
   original: a borda fica pintada e nítida, sem moldura crua. Com o SMAA (2.2) antes, a borda já chega lisa.
5. Mudar a ordem: estabilização → **SMAA** → desfoque → pincelada → tela. A pincelada passa a pintar uma imagem já sem
   escada (hoje ela pinta a escada e a protege).
6. Longo prazo: o "papel" e a "trama" no passe final em resolução nativa (2.1), presos à tela de propósito (é o
   suporte da pintura), e o grão parado (1.2).
Impacto: alto (é a queixa central). Custo: amostras 12 → 21 dobra o passe da pincelada (~+0,5-1 ms em 1440 × 900 no
M1, a medir); tensor suavizado +2 passes de 1/4 dos pixels (~0,1 ms); o resto é de graça.

### 2.4 Ruído da faixa de luz (pintor de luz) sem filtro — **M**

Evidência:
- `src/materiais.js:131-134`: `pinA = pincelada(vPMundo * 3.1, normal)` recorta a passagem sombra/meio-tom/luz.
- `src/materiais.js:40-47`: três oitavas de ruído de valor, a mais fina a `18 × 3,1 × 0,6 ≈ 33` ciclos por metro (a
  do meio, ~13). Com a cena a 1,0 num Retina (≈ 800 px de altura, fov 50°), um pixel mede ~1,2 mm × distância: a
  oitava fina passa de Nyquist a ~13 m, a do meio a ~33 m. Sem `fwidth` para apagar o que é fino demais.
- Resultado: na borda da sombra (que o Arcane deixa dura de propósito: `arcSuave` 0,08) o recorte vira chuvisco de
  pixel a média distância e mexe andando.

Correção proposta: multiplicar cada oitava por `1 − smoothstep(0.3, 0.5, fwidth(p × freq))` (apaga a oitava antes de
ela serrilhar), e alargar `uArcSuave` com `fwidth(tA)` (borda da faixa antisserrilhada). Ou trocar o ruído por uma
textura de pinceladas com mipmap (o mipmap faz o filtro sozinho). Impacto: médio. Custo: desprezível.

### 2.5 Texturas, filtro, contorno, cor — **B**

- Texturas pintadas: mipmap ligado (padrão do `TextureLoader`), `anisotropy = 4` (`src/materiais.js:210`); triplanar
  em coordenada do mundo. Está bom; 8 ajudaria no chão de raspão (calçamento, areia) a custo baixo no M1.
- Rampa toon (`gradienteToon`, `materiais.js:14-24`) com `NearestFilter`: é de propósito (degrau de cor), mas a
  passagem fica sem antisserrilhado: mais um argumento para o SMAA.
- Contorno: no Arcane `arcLinha: 0` (sem contorno, `config.js:24`); só a quina clara (`arcAresta` 0,7), decidida pela
  segunda derivada da profundidade, sem antisserrilhado e fora do TAA (1.8).
- Cor e tom: a curva final (`src/pos/gradacao-final.js`) é contínua desde 22/10; não achei problema novo. O
  `toneMapping` do three não é usado (a gradação é do passe final).

---

## 3. Provas em quadros consecutivos

Feito no Linux desta máquina, Chrome sem janela com **SwiftShader** (placa de software), **WebGL**, 960 × 540,
pixel ratio 1, governador ligado (perfil médio, sem `?qualidade=`, que o desligaria). Vale a imagem, **não** o tempo
de quadro: o governador ficou em "cheio" o tempo todo porque cada quadro do SwiftShader passa de 100 ms e é jogado
fora como pico (`DT_PICO_MS`), então **esta captura não exercita o governador**; a seção 1.1 vem do código.
Máquina carregada (load 8-18) durante a captura.

Lugar: Praça do Ferreira (x 4240,84, z 2164,09, câmera 0 rad, 15 h, distância 5, inclinação 0,2). 16 quadros seguidos
por situação. Scripts novos: `scripts/diagnostico/pisca-linux.mjs` (o `pisca.mjs` para o Chrome do Linux) e
`scripts/diagnostico/pares.py` (diferença entre quadros vizinhos). Medida de pisca: `scripts/pisca-mapa.py` (pixel que
muda mais de 24 e volta). Tudo em `docs/capturas/pisca-diagnostico/`.

Situações:
- `vivo-parado`: o laço do próprio jogo, relógio do jogo parado, câmera parada; a gente e as folhas animam.
- `raf-parado`: laço pausado, um `passo(1e-6)` por quadro do navegador (nada anda).
- `raf-tempo`: o mesmo com o tempo andando (1/30 s por passo).
- `raf-giro`: câmera girando 0,2 rad/s (medida compensada, `--compensar`).

| Situação | Diferença média entre vizinhos (0-255) | Pisca (todos / borda / liso) | Pior quadro |
|---|---|---|---|
| vivo-parado | **0,30-0,42, e a cada 2-4 quadros um salto para 3,5-3,6** (5,9% dos pixels mudam > 8) | 0,015% / 0,050% / 0,002% | 0,022% |
| raf-parado | 0,06 → 0,01 (a estabilização assentando) | 0% | 0,0002% |
| raf-tempo | 0,27-0,41, **com o mesmo salto de 3,5** | 0,013% / 0,043% / 0,002% | 0,017% |
| raf-giro | 12,7-14,5 (é movimento) | **0,230% / 0,816% / 0,054%** (compensada) | 0,258% |
| vivo-parado, `arcGrao = 0` | **0,28-0,41, sem salto nenhum** (máximo 0,41; > 8 em no máximo 0,94%) | 0,013% / 0,046% / 0,002% | 0,019% |
| raf-tempo, `arcGrao = 0` | 0,20-0,32, sem salto | 0,009% / 0,032% / 0,002% | 0,013% |

O que isso prova:
1. **O pulso de tela inteira é o grão** (seção 1.2): com o tempo correndo, um par de quadros a cada 1/8 s de jogo tem
   diferença média de 3,5 (o grão de ±0,02 prevê ~3,4) e quase 6% dos pixels mudando; com `arcGrao = 0` o salto some
   e sobra só a animação da gente e das folhas (0,3). A diferença do pior par está em
   `difs/vivo-parado-dif-pior-x4.png` (chuvisco na tela toda) contra `difs/vivo-parado-arcgrao0-dif-pior-x4.png`
   (só a gente e o coqueiro). O grão é ±5 de 255, abaixo do limiar de 24 do `pisca-mapa.py`: por isso a medida de
   22/10 não o pegou, mas o olho pega um pulso de 8 Hz na tela inteira.
2. **Parado de verdade, nada pisca** (`raf-parado`): nenhum LOD, cache ou célula alternando sozinho com a câmera
   parada, como em 22/10.
3. **Girando, o pisca que sobra está nos canteiros, nas fachadas do fundo, no mosaico do chão, no coqueiro e na
   gente** (`mapas/raf-giro-compensar.png`): os maciços de folhagem e as flores dos canteiros (70 touceiras e ~40
   flores de 16 cm por canteiro) e as janelas a 60-100 m são menores que um pixel; o mosaico de pedra portuguesa é
   textura de alta frequência no chão de raspão. É o serrilhado espacial da seção 2.2 que o TAA sem tremor não
   segura. 0,23% compensado é ~5 vezes o que a rua do Centro deu em 22/10 (0,049%) na mesma medida, em outro lugar,
   outro renderizador e outra resolução: a Praça é o lugar mais difícil do jogo para o serrilhado, e é a abertura.
4. No pior par de `vivo-parado` aparece também uma linha clara na borda da sombra do jogador parado (respirando):
   compatível com o mapa de perto refeito a cada 2 quadros (seção 1.3), mas esta captura não separa isso da
   animação; fica como hipótese a medir no Mac com `sombraPertoACada` 1 × 2.

Não medido aqui (precisa da placa do Mac): o governador trocando de degrau ao vivo e a resolução da tela Retina.
Console: nenhum shader quebrado, nenhum material sem `gLuz`; faltam os GLB das esculturas (`arte/finais`, fora do
git), e o jogo usou as versões simples.

---

## 4. Os canteiros da Praça mudaram de cor depois do `003cc70`

**Conclusão: o `003cc70` não muda a cor dos canteiros.** Nas mesmas condições (mesma vista, mesma hora, tempo
parado, passo fixo), antes e depois dele a imagem sai igual. O que muda o canteiro de um momento para o outro é
**a hora do jogo andando** (a causa maior) e **o degrau `pincelada-meia` do governador** (`7580d46`, que entrou uma hora
antes do `003cc70`, no mesmo dia), que amolece e mistura as flores com a folhagem.

Como o canteiro é desenhado (`src/mundo/marcos1932/praca-reforma.js:77-94`): uma `Obra` com malhas comuns (não são
cópias): meio-fio de `pedra`, `terra`, 70 touceiras `folha` (`#3f6e3a`) e ~40 flores `flor` (`#b8553b`, ícosaedro de
16 cm) por canteiro, material `toon` com textura pintada (`marcos1932/materiais.js:42-45`). Nada disso passa pelo LOD
cópia a cópia (`lod-arvores.js`), pelas células de muito longe (`muito-longe.js`) nem pelo `usaInstancia` do
`materialPredio`, que são as partes do `003cc70`. O único jeito de o `003cc70` chegar ao canteiro seria pela sombra dos
fícus da Praça (`instanciarArvores`, `praca-reforma.js:147`), que passaram a usar a copa simples cópia a cópia além de
`lodBloco` (90 m).

Provas (SwiftShader, 960 × 540, 15 h, tempo parado; `scripts/diagnostico/canteiros-ab.mjs`):

| Comparação | Diferença média na tela (0-255) | Pixels que mudam > 8 | Onde |
|---|---|---|---|
| `7580d46` × atual, WebGL, vista x 4240,84 z 2164,09 | 0,29 | 0,54% | só as copas dos fícus ao fundo (copa simples além de 90 m) e a animação da gente e do coqueiro; **canteiros iguais** |
| `7580d46` × atual, WebGL, vista de abertura | 0,03 | 0,08% | nada nos canteiros |
| `7580d46` × atual, **WebGPU**, vista x 4240,84 z 2164,09 | **0,00** | 0,01% | idênticas (cor média do canteiro 93,6 / 91,4 / 68,6 nas duas) |
| ao vivo, atual: LOD cópia a cópia desligado, cache de sombra refeito (`docs/capturas/canteiros-ab/`) | 0,05-0,12 | 0,15-0,38% | nada nos canteiros (cor média igual até o décimo) |

(As imagens do `7580d46` foram feitas numa worktree temporária, removida depois; ficaram só os números acima.)

Na mesma vista, cada degrau da escada do governador aplicado por cima do anterior, e a hora
(`docs/capturas/canteiros-governador/`; recorte do canteiro do meio, x 365-595, y 172-205):

| Variante (cumulativa) | Tela: dif. média / pixels > 8 | Canteiro: RGB médio | Matiz / saturação / valor | Canteiro: dif. média |
|---|---|---|---|---|
| `g0-cheio` (degrau 0) | – | 103 / 103 / 71 | 60° / 0,31 / 0,41 | – |
| `g1-sombra-perto-leve` | 1,1 / 3,3% | 104 / 104 / 71 | igual | 1,2 |
| `g2-pincelada-meia` | **8,5 / 32%** | 110 / 108 / 74 | 57° / 0,32 / 0,43 | **15,4** |
| `g3-sem-dof` … `g7-sem-estabilizar` | ~8,6 / ~33% | igual a g2 | igual a g2 | ~15,4 |
| `hora-17` (por cima de tudo) | **56 / 96%** | 48 / 37 / 33 | **17° / 0,31 / 0,19** | **56** |
| `sem-pincelada` (15 h, `arcPintura` 0) | 7,0 / 30% | 104 / 103 / 71 | 60° / 0,31 / 0,41 | 4,6 |

O que isso mostra:
1. **A hora**: o jogo **abre às 16,6 h** (`src/config.js:8`) e o relógio anda **1 hora de jogo por minuto real**
   (`velocidade: 1.0`, `config.js:9`). Em dois minutos parado na Praça o canteiro passa de verde com pontos vermelhos
   (15 h) para marrom-violeta escuro (17 h: valor cai pela metade, matiz vai de 60° para 17°), porque o sol baixo deixa
   o canteiro na faixa de sombra do pintor de luz, que puxa para `arcCorSombra`/`arcDouradaSombra` (violeta) e escurece
   com `arcNivelSombra` mais fundo na hora dourada (`aranhaverso.js:663-666`). Abrindo o jogo em momentos diferentes
   (ou depois de alguns minutos), o canteiro aparece com cores muito diferentes: é a explicação mais provável do que o
   Joabe viu depois do `003cc70` (todo commit novo é aberto num momento novo do relógio).
2. **O governador**: o degrau `pincelada-meia` sozinho muda 32% dos pixels da tela e 15 de 255 no canteiro: as flores
   de 16 cm (2-3 px a 40 m) se misturam com a folhagem na pincelada em meia resolução e o canteiro deixa de ler "verde
   com vermelho" para ler uma mancha amarelada e mole. Com o governador em catraca (seção 1.1) isso aparece no meio da
   sessão e não volta. Os outros degraus mexem pouco no canteiro.
3. Os fícus ao fundo trocam a copa no `003cc70` (copa simples além de 90 m), mas a sombra deles não chega aos
   canteiros desta vista; em outra vista (canteiro a mais de 90 m da câmera, embaixo de fícus também longe) a sombra
   da copa simples, mais cheia, pode escurecer o canteiro. Não reproduzido aqui.

Não medido (precisa do Mac): a escada do governador como ela de fato desce no M1, e o estado salvo no painel do Joabe
(`localStorage` `maresia.config.v8`), que pode ter hora, `arcPintura` ou cores diferentes do padrão.

Correção proposta:
- Abrir o jogo numa hora fixa e **com o relógio parado ou bem mais lento** (`velocidade` 0,1-0,2: 6 a 12 minutos reais
  por hora de jogo), ou deixar o relógio rodar só quando o Joabe pedir (tecla T já avança uma hora). Comparar commits
  sempre com a hora travada (`maresia.irPara(x, z, yaw, hora)` + `cfg.tempo.pausado`).
- Tirar `pincelada-meia` da escada do governador (seção 1.1).
- Se o canteiro deve "ler" vermelho de longe, flores maiores em grupos (maciços de 40-60 cm) em vez de pontos de 16 cm,
  que somem em qualquer filtro de tela.
Impacto: médio-alto (é a vista de abertura). Custo: zero.

---

## 5. Plano de correção (maior impacto visual, menor custo primeiro)

| # | O quê | Onde | Impacto | Custo |
|---|---|---|---|---|
| 1 | Grão parado (sem `uTempo`) ou ≤ 0,015 a ≥ 24 Hz | `aranhaverso.js:411`, `aranhaverso-gpu.js:535` | alto (pulso da tela toda) | zero |
| 2 | Governador: medir custo, não intervalo do rAF; subir pela mesma régua; tirar `sem-estabilizar`, `sem-dof` e `pincelada-meia` da escada; transição em 0,5 s | `governador.js:30-48`, `main.js:504-511` | alto (fim das trocas sozinhas; a 60 Hz deixa de ser catraca) | zero |
| 3 | Pincelada: 21 amostras, raio em px CSS, nitidez 6-8, anisotropia só com gradiente | `config.js:81-86`, `pintura.js:87-100` | alto | +0,5-1 ms (medir) |
| 4 | Ruído da faixa de luz com `fwidth` | `materiais.js:40-47`, `:131-134` e o TSL (`arcane-tsl.js`) | médio | zero |
| 5 | SMAA (ou FXAA) depois do TAA, antes da pincelada e do grão | `aranhaverso.js:848-866` e `-gpu` | alto (escada) | ~0,5 ms |
| 6 | Passe final em resolução nativa + aumento com nitidez (EASU/RCAS ou CAS) | `aranhaverso.js:610-627`, `main.js:315-321` | **o maior** para "borrado" | ~0,5 ms + passe final em 4× pixels |
| 7 | Tensor suavizado e borda pintada (raio cai na borda) em vez de crua | `pintura.js:56-111` | alto (pincelada) | ~0,1 ms |
| 8 | Sombra de perto todo quadro (com cache dos parados no mapa de perto) | `config.js:381`, `sombra-perto.js:136` | médio-alto | baixo com cache |
| 9 | Relógio do jogo mais lento ou parado ao abrir (`tempo.velocidade` 0,1-0,2) e comparação de commits sempre com a hora travada; flores dos canteiros em maciços maiores | `config.js:8-9`, `praca-reforma.js:77-94` | médio-alto (a cor da vista de abertura deixa de "mudar sozinha") | zero |
| 10 | Histerese e passo de 4 m no muito longe; grama encolhe antes de sumir | `muito-longe.js` (distribuir), `grama.js:48-58` | médio | zero |
| 11 | Bloom com descida em cadeia lendo a cor estabilizada | `aranhaverso.js:836-845` | médio (noite, água) | baixo |
| 12 | Sombra das copas fora do cache dentro de 60 m; faixa perto/longe em metros, janela sem "à frente" | `cache-sombra*.js`, `sombra-perto.js`, `config.js:379-385` | médio | baixo-médio |
| 13 | Dissolução por pontilhado preso ao mundo nas trocas de LOD (casas, árvores) | `quarteirao.js:688`, `lod-arvores.js` | médio | baixo |
| 14 | MSAA 4x na cena (com o alfa do traço lido sem média) | `aranhaverso.js:523` | médio (depois do SMAA) | médio (memória) |
| 15 | Subir `tetoRetina` do médio para 1,25-1,5 depois de 2 e 6 | `qualidade.js:26-28` | alto | alto (medir) |

Os itens 1, 2 e 4 são de custo zero e atacam o que mais pisca; 3, 5, 6 e 7 atacam o "mal desenhado" e a pincelada.
Pela regra do KAN-62, cada um entra com o teste que o reproduz (os de pisca pelo `scripts/pisca.mjs` +
`pisca-mapa.py`, em `raf`, com o tempo correndo, que é a situação em que o grão e a sombra de perto aparecem).
