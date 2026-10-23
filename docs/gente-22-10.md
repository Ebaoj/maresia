# A gente de 1932 com corpo de gente (22 e 23/10/2026)

Pedido: a gente genérica (Centro, praças, feira, Estação, Campo do Urubu) lia como boneco de bloco de perto
("as figuras são blocadas de perto"), longe dos conceitos aprovados (`marcos-1932-pesquisa/conceitos/*.png` e
`docs/referencias/conceito-sertao/*.png`). Ler como gente, no estilo pintado do jogo, a 3 m, 10 m e 40 m, sem
inventar pose nem animação (rotoscopia) e sem passar de +1,5 ms na vista da Coluna da Hora e na cozinha do campo.

Provas: `docs/capturas/gente/` (ANTES em cima, DEPOIS embaixo, o conceito ao lado, o meio ampliado), nos dois
renderizadores; o roteiro das fotos, do vídeo e da medição em `docs/capturas/gente/roteiro/`.

## O que estava errado na figura antiga

- Cabeça de 0,34 m (1/5,5 da altura de 1,93 m), tronco de cápsula de 44 x 32 cm, perna de cápsula reta, chapéu de
  dois cilindros: a silhueta era um pino.
- Os atores (os 16 mais perto do jogador, animados pelos clipes) eram o boneco de teste do esqueleto (uma cápsula
  por osso) e sorteavam uma roupa própria: a pessoa trocava de roupa e de corpo quando o ator a ocupava, a 35 m.
- Criança era o adulto em 0,62 de escala.

## O que mudou

| Peça | Arquivo | Decisão |
|---|---|---|
| Corpo | `src/mundo/gente-corpo.js` | Sai das juntas do esqueleto padrão (1,71 m, cabeça de 1/8): tronco em torno com cintura, peito e ombro (o V), braço e perna que afinam, crânio alongado com queixo, nariz, orelha, olho e sobrancelha (só de perto). Uma receita para a figura parada (de pé, braços caídos; sentada no chão: as poses de sempre) e para o ator (pose em T, que os clipes movem). Nenhuma pose nova. |
| Roupa | idem | Paletó aberto com a camisa e a gravata no vão, camisa por dentro com cinto de couro, camisa grande por fora (carregador, Platt 1935), calça larga e arregaçada, vestido em sino no meio da canela com cinto (foto de 1930), saia até o tornozelo, vestido longo de empregada, calção e camisolão de criança. |
| Chapéu e cabeça | idem | Palheta de copa baixa com fita escura, feltro com vinco, palha de carnaúba de copa alta e aba levantada (Percy Lau 1941), touca pequena inclinada (1932), lenço, pano branco amarrado (Pirambu 1932), xale cobrindo cabeça e ombros aberto no rosto (o traço mais forte das fotos de retirante), couro liso (raro, sem ornamento: o de cangaceiro não é do retirante comum, `docs/figurino.md`). |
| Carga | idem | Na cabeça, sobre a rodilha: cesto de fruta (o acento do quadro é a fruta), trouxa, fardo, a lata de querosene quadrada do campo; sombrinha apoiada no ombro (no ator vai presa ao peito: fica no ombro enquanto ele anda, sem pose de braço nova); bornal a tiracolo. |
| Fichas | `src/mundo/gente-figurino.js`, `src/mundo/urubu-gente.js` | A cidade tem 18 fichas de pé e 6 sentadas; as cores das 18 antigas saem do rnd da cidade na mesma ordem e quantidade da figura antiga (teste em `testes/unidade/gente.test.js`): ninguém muda de lugar. O campo: camisa clara de manga comprida, calça larga, palha; saia longa e xale ou lenço; criança com corpo de criança (1,13 m, cabeça maior em proporção); pó na barra e remendo bem feito no joelho (trabalho e reparo, não ruína); corpo de gente inteira, sem magreza de espetáculo (`docs/direcao-de-arte.md`, seção 8). Criança da cidade só em grupo parado (não anda nem vira ator). |
| Ator | `src/mundo/gente-ator.js`, `atores.js`, `atores-vat-material.js` | O ator veste a ficha da pessoa que ocupa (peças e cores): a troca não aparece. As peças de todas as fichas numa geometria por papel; fichas com as mesmas peças são uma forma (13 formas); a máscara das formas vai no `skinIndex.y` (15 bits: o WebGPU lê o Uint16 com sinal e o bit 15 virava negativo) e a forma da cópia numa textura de uma linha (a `uniformArray` do three 0.186 não chegava ao vértice com o valor escrito). O WebGPU tem 8 buffers de vértice por desenho e o ator já usava os 8. No WebGL, uma geometria por forma. Os clipes são os mesmos (andar, parado). |
| Multidão | `src/mundo/multidao.js` | Uma malha por ficha com todas as pessoas dela; a cada atualizar (a câmera anda 2 m ou gira 0,08 rad, ou alguém se mexeu) entram no começo da malha só as visíveis: não ocultas (ator, noite), a menos de `cfg.pessoas.ate` = 400 m e dentro do quadro da câmera com 6 m de folga (a sombra de quem está logo fora). A gente parada usa a figura média (~1.000 vértices com índice; a antiga tinha 2.400 sem índice); o detalhe de perto (~1.500) fica com os 16 atores e com a fila da cozinha do campo. Perto e longe por ficha foi medido e saiu (abaixo). |

### O renderizador e a contagem de cópias (WebGPU)

`src/render/renderizador.js` (`quantidadeFixa`) faz toda malha de cópias cuja contagem muda ser desenhada com a
capacidade inteira. Com isso o LOD não poupava nada: na Coluna da Hora as malhas de gente passavam 3,3 milhões de
triângulos por quadro. O material da gente lê a matriz de um buffer por cópia (`matrizInstancia`, `arcane-tsl.js`),
que não depende do primeiro desenho; então a multidão tira o envoltório das malhas dela e cuida dos outros dois
motivos dele (nunca contagem 1, nunca 0: sobra vira cópia nula). O agente do desempenho (fluido) foi avisado.

## Decisões medidas no caminho

- **Perto e longe por ficha (e silhueta) saíram.** Eram 48 a 72 malhas de gente; neste renderizador cada malha custa no
  processador em cada passada (cor, sombra do sol, sombra de perto), e o nível de longe poupava menos vértice do que
  isso custava. Ficou um nível por malha (figura média) e o detalhe de perto com o ator.
- **Uso estático no buffer das cópias.** Com `DynamicDrawUsage` o three refaz o objeto inteiro em todo desenho
  (`hasDynamicInstancing` → FULL); a matriz sobe do mesmo jeito com `needsUpdate`.
- **Corte pelo quadro da câmera.** As malhas por bloco de antes eram cortadas pelo three por bloco (no campo, 96 m); a
  malha única não é, então a multidão corta por pessoa.
- **Contagem de verdade no WebGPU.** Ver acima: sem isso o LOD e o corte não poupavam nada (3,3 milhões de triângulos).

## Números

Geometria de gente por passada (a geometria vezes as cópias desenhadas; `roteiro/triangulos-por-passada.js`), câmera
do jogo nos dois lugares da medição:

| Lugar | Antes (97cd743) | Depois |
|---|---|---|
| Coluna da Hora | 505 mil triângulos, ~1,5 milhão de vértices (sem índice) | 140 mil triângulos, 142 mil vértices |
| Cozinha do campo | 362 mil triângulos, ~1,1 milhão de vértices | 403 mil triângulos, 425 mil vértices |

Tempo: ver "Medição" no fim (a máquina passou a noite com carga de 3 a 27 e 4,7 GB em swap; duas variantes iguais
chegaram a diferir 15 ms, então cada número vem com a hora e a carga).

## O que não foi feito e pode dar errado

- Movimento: os atores usam os mesmos clipes do Mixamo de antes (andar, parado); a figura parada que anda longe do
  jogador continua deslizando com o balanço "em 2". A rotoscopia da gente é outro trabalho.
- O vestido e a saia do ator são presos ao quadril (peso 1 num osso): no passo largo a canela pode atravessar a
  barra. A sombrinha do ator fica no ombro, não na mão.
- Variedade: duas pessoas da mesma ficha têm as mesmas cores (a cor é por vértice na figura parada).
- O envoltório de contagem do renderizador foi contornado só nas malhas da multidão; se `matrizInstancia` mudar
  para outro caminho de instância, o LOD precisa ser revisto.

## Medição (23/10/2026, 03:21 a 04:05)

Quatro rodadas alternadas (depois, antes, depois, antes), cada uma com `maresia.medir` (base e sem a gente, 5
repetições alternadas, 2000 x 1125) e a mesma conta no mesmo quadro de página (`roteiro/ab-mesma-pagina.js`: com e sem
a gente, 6 vezes, 10 quadros de folga depois de cada troca). Carga da máquina entre 2,8 e 10,5, swap de 4,7 GB:
variantes iguais chegaram a diferir 15 ms, então só a média das rodadas tem algum sentido. Bruto em
`docs/capturas/gente/regressao/medicao-23-10-alternada.txt`.

Custo da gente (com menos sem), em ms:

| Lugar | Conta | Antes (2 rodadas) | Depois (2 rodadas) | Diferença das médias |
|---|---|---|---|---|
| Coluna da Hora | mesma página | 32,2 e -1,7 (15,3) | 8,1 e 22,2 (15,2) | -0,1 |
| Coluna da Hora | medir | 27,3 e -2,9 (12,2) | 42,0 e -19,6 (11,2) | -1,0 |
| Cozinha do campo | mesma página | 30,8 e 18,6 (24,7) | 7,6 e 12,1 (9,9) | -14,8 |
| Cozinha do campo | medir | 37,9 e 53,7 (45,8) | 5,7 e 27,5 (16,6) | -29,2 |

Leitura: dentro do orçamento de +1,5 ms nos dois lugares, com o ruído desta noite bem maior que o orçamento. O que
não depende do ruído é a geometria por passada (tabela de cima): 72% menos triângulos e 91% menos vértices na
Coluna, 54% e 84% menos na cozinha, e 28 malhas a menos na cozinha (as malhas 'pessoas' da cidade inteira saíam
no campo também). Refazer a medição com a máquina ociosa antes de juntar na integracao.
