# Plano de performance (Fortaleza 1932)

Documento de trabalho da Fase 1 do plano de performance. O jogo é um protótipo de um
único jogador, sem multiplayer, rodando no navegador (three.js 0.186, Vite 7). O alvo de
hardware é o MacBook com M1 (o Joabe joga nele), com a Tesla T4 da EC2 como máquina de
comparação, porque os números de quadro na T4 são reproduzíveis e a GPU não muda de
frequência por conta própria.

O problema que motiva o plano: depois de um teleporte (e ao andar pelo centro), o jogo
trava. O quadro chega a 300 ms ou mais, e a cena congela. As marcas do rastreador
(`src/debug/rastreador.js`) mostram que o culpado é a montagem dos blocos de casas de 1932
(`src/mundo/quarteirao.js`): cada bloco de 96 m levava 150 a 300 ms na T4, e o bloco
inteiro era montado dentro de um único quadro.

O plano está em três fases. Cada fase tem objetivo, mudanças, arquivos, métrica e meta.
A métrica e o protocolo de medição são os mesmos em todas as fases, para as comparações
valerem.

## Protocolo de medição (vale para as três fases)

O mesmo roteiro, sempre, para dar número comparável:

1. Abrir o jogo em modo dev (`npm run dev`), WebGL (o caminho que importa mais).
2. `cfg.fatia.travar = false` (a fatia de verdade não trava o jogador).
3. Começar no ponto de partida, andar para a frente.
4. Teleportar para a Coluna da Hora (`irPara` com a vista do conceito, `colunaHora`).
5. Teleportar para o registro do Campo do Urubu (`urubuRegistro`).
6. Em cada trecho, andar para a frente sem parar.

A medição é feita com o rastreador do jogo, ao vivo:

```js
await maresia.rastrear({ segundos: 45, limite: 50 })
```

O `limite` de 50 ms é o piso do que interessa (abaixo de 33 ms o quadro ainda cabe em 30
fps). O rastreador devolve, além dos picos com as pistas de cada quadro lento
(`src/debug/rastreador.js`), o resumo: média, p95, p99, quantos quadros passaram de 33, de
50 e de 100 ms, e o pior quadro.

Duas máquinas, com o mesmo roteiro:

- **Tesla T4 (EC2)**: a referência. A GPU não muda de frequência sozinha, o número é
  estável e serve de linha de base entre rodadas.
- **4K com DPR alto (proxy do M1)**: a mesma sessão em 3840 × 2160 com `devicePixelRatio`
  alto. Serve de proxy do Apple M1, que tem mais pixels por quadro e muda de frequência
  quando esquenta. A comparação só vale entre variantes alternadas na mesma rodada (a
  GPU do Mac disputa com outra aba do jogo).

Tabela de resultados (uma linha por rodada; a coluna `picos` traz os quadros acima de
50 ms com as pistas de cada um):

| Rodada | Média (ms) | p95 (ms) | p99 (ms) | Quadros > 33 ms | Quadros > 50 ms | Quadros > 100 ms | Pior (ms) | Picos (ms e pistas) |
|---|---|---|---|---|---|---|---|---|
| antes, T4 (mediana de 3) | 12,0 | 15,8 | 29,1 | 20 | 10 | 9 | 271 | teleporte + shaders novos + tarefas longas de 120 a 300 ms (montagem) |
| depois, T4 (mediana de 3) | 13,5 | 19,4 | 33,4 | 40 | 0 | 0 | 49 | nenhum quadro acima de 50 ms |

Regras de leitura da tabela:

- A média e o p99 valem mais que o pior quadro isolado: o pior quadro pode ser a
  collecta de lixo ou a subida de um arquivo, e o que incomoda é a repetição.
- O número de quadros acima de 50 ms é o que define se o jogo "trava" na prática.
- Comparar sempre com a linha de base da mesma máquina e do mesmo roteiro.

## Fase 1: os picos (montagem e shaders)

**Status: executada (commit 6f41a34), medida na T4.**

### Objetivo

Nenhum quadro passa de 50 ms por causa do trabalho de montar o mundo. A montagem das
casas vira trabalho com orçamento de tempo, e os shaders são compilados antes de o jogo
aparecer, não no meio da partida.

### Mudanças

1. **Montagem fatiada, com orçamento de tempo.** O bloco de casas deixa de ser montado de
   uma vez. A casa virou um gerador: cada passo (o corpo, a fachada, cada vão, o telhado,
   os fundos) é uma unidade. A fila de montagem gasta no máximo
   `cfg.desempenho.orcamentoMontagemMs` (4 ms) por quadro e a fila aprende o custo de cada
   tipo de unidade, para não começar uma unidade que não cabe no que sobrou.
   Um bloco grande é quebrado em unidades menores: nunca há uma unidade só com o bloco
   inteiro.
2. **Menos trabalho por casa.** A pilha de cada casa não cria mais uma geometria por
   peça (caixa nova, `toNonIndexed`, `clone`) nem junta tudo no fim com `mergeGeometries`.
   Cada pilha escreve direto nos seus arrays (posição, normal, cor e o chão da casa) e a
   geometria final sai deles: quatro alocações por pilha em vez de milhares por bloco.
   A caixa de 1 m é compartilhada por todas as peças.
3. **Limites pré-calculados.** A esfera e a caixa de cada malha saem da extensão conhecida
   do bloco, e o three não calcula a esfera no primeiro quadro em que a malha aparece
   (era um dos picos).
4. **Subida gradual para a placa.** As malhas novas só aparecem quando o orçamento de
   bytes do quadro (`cfg.desempenho.orcamentoUploadMB`) deixa, em vez de todas de uma vez
   quando o jogador chega perto.
5. **Prefetch.** O destino do teleporte (`irPara`) e o anel à frente do jogador entram
   na fila de montagem com prioridade, para o casario já estar pronto quando o jogador
   chega. A prioridade do destino só vale enquanto o jogador está perto dele.
6. **Aquecimento dos shaders (WebGL).** No carregamento, depois da cena montada:
   `renderer.compileAsync(cena, camera, cena)` com o alvo real do pós-processamento ligado
   (é o alvo que decide a variante do shader), e depois um desenho da cena num alvo de
   1 × 1 do mesmo formato, com o passe de sombra ligado (é ele que compila os materiais de
   profundidade). As malhas representativas dos materiais das casas entram na cena só
   durante o aquecimento, porque os blocos ainda não foram montados.
   O `?semPreaquecer` na URL desliga, para o A/B.

### Arquivos

| Arquivo | O que mudou |
|---|---|
| `src/mundo/fila-montagem.js` | novo: a fila pura com orçamento de tempo e o custo aprendido por tipo de unidade |
| `src/mundo/bloco-casas.js` | novo: o gerenciador dos blocos (a fila, o prefetch do destino, a subida gradual para a placa e os limites já calculados) |
| `src/mundo/quarteirao.js` | a casa virou gerador, a pilha escreve direto nos arrays (sem geometria por peça), o bloco é montado em etapas |
| `src/render/preaquecer-webgl.js` | novo: o aquecimento dos shaders no WebGL (compileAsync mais o desenho de 1 × 1) |
| `src/main.js` | o `irPara` avisa o destino da montagem; o aquecimento roda antes de o jogo aparecer |
| `src/mundo/cidade.js` | passa o `cfg` para `criarCasas` (o orçamento e os interruptores) |
| `src/config.js` | `desempenho.fatiarMontagem`, `desempenho.orcamentoMontagemMs`, `desempenho.orcamentoUploadMB`, `desempenho.raioPrefetch`, `desempenho.preaquecerShaders` |
| `src/ui/painel/desempenho.js` | os interruptores novos no painel (e `casasPorQuadro`, que só vale sem fatiamento) |
| `src/debug/medidor.js` | `maresia.rastrear` devolve média, p95, p99 e a contagem dos quadros acima de 33, 50 e 100 ms |
| `src/debug/rastreador.js`, `src/debug/marcas.js` | as pistas dos quadros lentos (a marca `montagem` diz quanto a fila gastou) |
| `testes/unidade/fila-montagem.test.js` | novo: a fila com orçamento de tempo (lógica pura) |
| `testes/unidade/quarteirao-geometria.test.js` | novo: a geometria nova da casa tem de ser igual, vértice a vértice, à de antes |

### Métrica

- Número de quadros acima de 50 ms no roteiro (coluna da Hora e registro do Urubu).
- Pior quadro do roteiro.
- Tempo de montagem de um bloco (marca `montagem`): a meta é que nenhum quadro gaste
  mais que o orçamento (4 ms) mais o custo de uma unidade.

### Meta

- Nenhum quadro acima de 100 ms no roteiro completo, na T4 e no proxy 4K.
- No máximo 2 quadros acima de 50 ms em 45 s de roteiro.
- O casario do destino aparece completo em menos de 1 s depois do teleporte (com o
  prefetch).

### Resultados da Fase 1

Medido em 24/10/2026 na T4 (g4dn, ANGLE Vulkan), WebGL, `fatia.travar=false`, roteiro completo,
commit 6f41a34 contra 7c8b4af. Dados brutos em /workspace/medicao/gpu5.

| Config | Média | p95 | p99 | > 33 | > 50 | > 100 | Pior |
|---|---|---|---|---|---|---|---|
| antes, 1280x720 DPR 1 (mediana de 3) | 12,0 | 15,8 | 29,1 | 20 | 10 | 9 | 271 |
| depois, 1280x720 DPR 1 (mediana de 3) | 13,5 | 19,4 | 33,4 | 40 | 0 | 0 | 49 |
| antes, estresse 1920x1080 DPR 2 (1 rodada) | 12,4 | 24,8 | 33,7 | 55 | 10 | 9 | 309 |
| depois, estresse 1920x1080 DPR 2 (1 rodada) | 13,2 | 30,4 | 34,5 | 85 | 5 | 0 | 86 |

Leitura: os picos sumiram (quadros acima de 100 ms de 9 para 0, pior de 271 para 49 ms), mas
o custo foi espalhado: média +1,5 ms, p95 +3,6 ms e o dobro de quadros entre 33 e 50 ms. No
estresse o teto Retina e a resolução dinâmica limitaram o buffer (1728x972 antes, 1440x810
depois), então ele não é um 4K real. A Fase 2 ataca justamente esse peso por quadro.

## Fase 2: o peso de cada quadro (o M1)

### Continuação (26/10/2026): o espaço do lote e as texturas de primeira subida

Duas coisas que a medição na T4 mostrou e que o código ainda não resolvia.

**O espaço do lote das casas, medido de verdade.** O lote reserva na placa o espaço final de
cada material (`cfg.desempenho.casasLoteVertices`), e o valor vinha de uma média de poucas casas.
A contagem real (o script `scripts/medir-casas.mjs` monta a cidade como o jogo monta e gera a
geometria de cada casa com o mesmo gerador e a mesma semente) diz:

| | casas | blocos | vértices | bytes |
|---|---|---|---|---|
| mapa inteiro | 21.586 | 1.280 | 74.646.324 | 2,99 GB |
| pior anel (23 blocos, o que o jogo desenha por perto) | | | 4.863.804 | 194,6 MB |
| o lote reserva (anel + 10%) | | | 5.350.185 | 204 MB |

O mapa inteiro não cabe na placa (e o lote não precisa dele: o desenho detalhado só existe no
anel de blocos que o gerenciador mantém montado; o resto é a caixa de fachada pintada do LOD de
longe). A fatia de cada material sai da demanda medida: o `pecas` (portas, janelas, cornija e
guarda-corpo) pede 86% do anel. O índice fica em zero (`cfg.desempenho.casasLoteIndices`): a
geometria da casa é uma sopa de triângulos, sem buffer de índice.

A tabela fica em `src/mundo/casas-capacidade.json` e o teste
`testes/unidade/casas-capacidade.test.js` confere que ela ainda bate com o gerador (se a casa
mudar, o teste avisa).

**As texturas de primeira subida.** Na rodada de estresse na T4 apareceu um quadro de 76 ms com
"tarefa longa 83 ms" e "texturas novas: 1" na pista do rastreador: a textura subia para a placa no
meio da partida. Agora as texturas do mundo sobem antes de o jogo aparecer
(`src/mundo/preaquecer-texturas.js`: `renderer.initTexture` para cada textura usada por um
material do mundo, depois de esperar as decodificações pendentes), e as texturas pintadas deixam
de ser baixadas pelo `TextureLoader` (que só decodifica o `<img>` no momento do desenho, na
thread do jogo): viram `ImageBitmap` com `createImageBitmap`, que decodifica fora da thread.

### Objetivo

O quadro normal (sem picos) fica abaixo de 16,7 ms no M1: o jogo roda liso andando pelo
centro. O que pesa hoje é o custo de tela cheia (profundidade de campo, bloom, retícula),
a grama, a sombra e o número de desenhos.

### Mudanças

1. **Sombra dos parados em cache, com redesenho só na mudança.** `shadowMap.autoUpdate`
   desligado e o mapa refeito quando muda alguma coisa (o sol gira, o jogador anda além do
   raio, aparece ou some um objeto parado). No máximo uma ou duas luzes com sombra: o sol
   projetando e, no máximo, uma luz de preenchimento com sombra.
2. **Casas em `BatchedMesh` ou `InstancedMesh` por material.** Hoje cada bloco vira cinco
   malhas e o three desenha cada uma. Com o mesmo material, as casas de um quarteirão
   cabem em um desenho só (ou em instâncias, quando a geometria é a mesma).
3. **Perfil de GPU integrada.** Um perfil novo de qualidade, ligado por padrão quando o
   navegador diz que a GPU é integrada: grama só perto, sem profundidade de campo, sem
   bloom, resolução dinâmica entre 0,75 e 0,9.

### Arquivos

| Arquivo | O que muda |
|---|---|
| `src/render/cache-sombra.js` | o mapa de sombra dos parados em cache, refeito na mudança |
| `src/render/politica-sombra.js` | quando o cache é refeito (o sol, o jogador, um objeto que aparece) |
| `src/render/sombra-estatica.js` | o registro do que é parado (a assinatura que diz o que mudou) |
| `src/render/sombra-perto.js`, `src/render/filtro-sombra.js`, `src/render/sombra-luz.js` | a janela de sombra de perto e o filtro, no perfil da GPU integrada |
| `src/mundo/quarteirao.js` | as casas de cada material em um desenho só |
| `src/mundo/blocos.js` | o `instanciarEmBlocos` (o motor de cópias por bloco) |
| `src/mundo/grama.js` | a grama só perto, no perfil da GPU integrada |
| `src/pos/profundidade.js`, `src/pos/aranhaverso.js` | a profundidade de campo e o bloom (ligados/desligados pelo perfil) |
| `src/render/resolucao-dinamica.js` | a resolução dinâmica entre 0,75 e 0,9 |
| `src/qualidade.js` | o perfil da GPU integrada (e o `?qualidade=` da URL) |
| `src/config.js` | as chaves do perfil |

### Métrica

- Tempo de quadro andando pelo centro (média e p95), sem teleporte: a meta é a média
  abaixo de 16,7 ms no proxy 4K.
- Número de desenhos por quadro (`renderer.info.render.calls`).
- Tempo do quadro com o painel escondido, para não medir a interface.

### Meta

- Média de quadro abaixo de 16,7 ms e p95 abaixo de 33 ms andando pelo centro, no proxy 4K.
- Meta de 100 desenhos por quadro no centro (a dica da comunidade está nas Fontes).

### O que foi feito (25/10/2026, Fase 2 no WebGL)

O caminho do WebGPU continua como estava (o `CacheSombraGpu` tem o seu próprio cache); o
trabalho abaixo é do WebGL, que é o caminho do M1.

**Sombra do sol refeita só na mudança** (`src/render/cache-sombra.js`).

- `renderer.shadowMap.autoUpdate = false` (já era assim) e o mapa do sol refeito inteiro
  (parados e o que se mexe, num passe só) só quando alguma coisa muda de verdade:
  - o sol gira além do limiar (0,05 grau, em `politica-sombra.js`; a pose fica congelada entre um
    refazer e outro, com o centro preso à grade de texels em `sombra-luz.js`);
  - o jogador sai da janela (`cfg.mundo.cacheSombraRaio`): a janela se recentra;
  - aparece ou some uma casa: o bloco de casas avisa (`aoMudarCasas` no `quarteirao.js`),
    porque no lote das casas a assinatura dos parados não muda;
  - o teleporte (`irPara` invalida o mapa);
  - o tamanho do mapa muda.
- Entre um refazer e outro o passe de sombra some do quadro: era a cópia de tela cheia do
  mapa em cache (4096² por quadro) mais o passe do que se mexe. O que se mexe perto da
  câmera (jogador, gente, bicho) continua com sombra nova pelo mapa de perto
  (`sombra-perto.js`, a cada `cfg.mundo.sombraPertoACada` quadros).
- Duas luzes com sombra, no máximo: o sol e a luz de perto (a lua é o mesmo sol).
- A chave `cfg.mundo.sombraEstatica` (padrão ligado) escolhe esse caminho; desligada, volta
  o caminho de camadas do F4 (o mapa em cache dos parados, copiado para o mapa vivo).
- Os refazimentos são contados (`cacheSombra.stats`) e marcados (`sombra:refeita`, com o
  motivo), para o rastreador do medidor dizer por que o quadro foi caro.

**Casas em lote** (`src/mundo/casas-lote.js`).

- As geometrias de todos os blocos de um mesmo material entram num `BatchedMesh` só
  (reboco, reboco do morro, peças, interior, aceso e telhas): um desenho por material em
  vez de cinco por bloco. Com `WEBGL_multi_draw` (a extensão existe no Chrome), o lote é
  um multi-draw; sem ela, o three cai no desenho por instância.
- O corte por instância fica ligado (`perObjectFrustumCulled`): o three corta cada bloco
  pela sua esfera antes de desenhar.
- A geometria de cada bloco já está no lugar do mundo, então a matriz da instância é a
  identidade, e o `pintar()` (`src/materiais.js`) aplica a matriz do lote no mundo e na
  normal.
- A chave `cfg.desempenho.casasEmLote` (padrão ligado) escolhe esse caminho; desligada,
  volta uma malha por pilha. No WebGPU o lote fica desligado (o desenho é por objeto).

**Ajustes pela URL** (`?cfg=`).

- `?cfg=mundo.sombraEstatica=0;desempenho.casasEmLote=0` desliga o caminho novo só nesta
  abertura, sem mexer no que está salvo no painel (como `?leve` e `?qualidade`).

**Números dos desenhos**.

- `maresia.desempenho()` devolve os desenhos do último quadro (`renderer.info.render.calls`),
  o estado da sombra em cache e o do lote das casas; o medidor (`rastrear`) também mostra
  os desenhos e o rastreador aponta quando o quadro foi caro por causa deles.

**Números medidos** (25/10/2026, Chrome sem janela, WebGL por software; o número de desenhos
não depende da placa, então o software serve para a conta; a fluidez não).

- O custo das casas no quadro, medido na mesma cena (quadros alternados, com as malhas das
  casas escondidas e à mostra, no meio do casario, 7 blocos à vista e 36 montados):
  - com o lote: **92 desenhos**;
  - sem o lote (uma malha por pilha): **353 desenhos**.
  - Ou seja, o lote tira 261 desenhos por quadro do que se mexe perto da câmera. Os
    triângulos não são a conta aqui: com o lote o corte é por instância e cada bloco entra
    inteiro.
- A sombra: o mapa do sol é refeito só quando algo muda. No A/B (`scripts/verificar-fase2.mjs`),
  os motivos que apareceram foram `inicial`, `conjunto` (um parado novo entrou), `casas`
  (um bloco de casas montou) e `sol` (o sol girou além do limiar). Entre um refazer e outro
  o passe do sol não entra no quadro; o mapa de perto (`sombraPertoACada`) continua dando a
  sombra do jogador, da gente e do bicho.
- O que o script confere em cada lado do A/B: `window.__shadersQuebrados` vazio (o programa
  do lote é outra variante do shader e precisa compilar) e nenhum material sem `gLuz`.

### Resultados da Fase 2 (T4, medido em 25/10/2026)

WebGL, `fatia.travar=false`, roteiro completo, `rastrear({segundos:45, limite:50})`, 3 rodadas por
configuração (mediana) mais 1 rodada de estresse (1920x1080 DPR 2). Base: perf-fase1 (6f41a34);
Fase 2: ea78198. Orçamento passado pela config salva. Dados brutos em /workspace/medicao/gpu6.

| Config | Média | p95 | p99 | > 33 | > 50 | > 100 | Pior |
|---|---|---|---|---|---|---|---|
| fase1, orçamento 4 ms | 10,8 | 15,3 | 22,1 | 7 | 0 | 0 | 49 |
| fase1, orçamento 3 ms | 10,8 | 15,2 | 18,8 | 7 | 0 | 0 | 44 |
| fase1, orçamento 2 ms | 11,0 | 15,4 | 26,4 | 7 | 0 | 0 | 45 |
| fase2, orçamento 3 ms | 10,5 | 15,1 | 24,4 | 11 | 4 | 3 | 410 |
| fase2, orçamento 4 ms | 10,6 | 15,1 | 27,4 | 15 | 5 | 3 | 410 |
| estresse fase1 4 / 3 / 2 ms | 11,3 / 11,2 / 10,9 | 17,6 / 18,6 / 17,3 | 32,8 / 32,2 / 30,9 | 38 / 24 / 22 | 1 / 1 / 4 | 1 / 1 / 3 | 161 / 161 / 172 |
| estresse fase2 3 / 4 ms | 11,0 / 11,1 | 18,1 / 18,7 | 32,4 / 33,9 | 32 / 49 | 9 / 11 | 6 / 5 | 412 / 409 |

Leitura honesta:
- Orçamento: 3 ms ficou um pouco melhor (p99 e pior quadro) que 4 e 2 ms, mas a diferença está perto
  do ruído entre rodadas. Padrão passou a 3 ms.
- Fase 2 baixou a média em ~0,3 ms, mas trouxe de volta picos: 3 quadros acima de 100 ms por rodada,
  pior ~410 ms. As pistas mostram uma única unidade de montagem de ~100 ms (e outra de ~70 ms): a
  inserção no BatchedMesh (addGeometry e cópia para os buffers grandes) não está fatiada pelo
  orçamento. A sombra em cache não apareceu como pico.
- Antes de seguir, a inserção no lote precisa ser fatiada (ou reservar e enviar por faixas com
  addUpdateRange) ou `casasEmLote` deve ficar desligado por padrão.

## Fase 3: o mundo (streaming, LOD e texturas)

### Objetivo

O mapa grande não pesa mais do que o pedaço que o jogador está vendo. Os blocos que
ficaram para trás saem da memória, as casas de longe viram impostores, e as texturas
sobem em KTX2 (metade da memória e da subida).

### Mudanças

1. **Streaming de blocos com descarga.** O bloco sai da memória quando o jogador passa
   longe, e volta quando ele chega perto (com o prefetch da Fase 1, a volta já vem
   pronta). A descarga tem de respeitar o que está no cache de sombra e no LOD de longe.
2. **LOD e impostores para as casas de longe.** Além da caixa com fachada pintada, as
   casas do outro lado da baía viram impostores (um plano com a fachada desenhada), e o
   corte por instância (culling por instância) fica ligado.
3. **Texturas em KTX2.** As texturas grandes (a do papel, a do mar, as de ruído) sobem
   comprimidas em KTX2 (Basis Universal), com a queda do tamanho de download e da memória
   de vídeo.

### Arquivos

| Arquivo | O que muda |
|---|---|
| `src/mundo/blocos.js` | a divisão em blocos de 96 m e o que fica carregado |
| `src/mundo/muito-longe.js` | as células grandes de longe e a descarga do que não está à vista |
| `src/mundo/quarteirao.js` | o corte por nível de detalhe e os impostores das casas |
| `src/mundo/cidade.js`, `src/mundo/escala1932.js` | o mapa contínuo e o que o casario pula |
| `src/render/motor-placa.js` | o motor de cópias na GPU (o que já existe, para as impostores) |
| `src/materiais.js`, `scripts/preparar-geometria.mjs` | as texturas em KTX2 e a preparação fora do navegador |

### Métrica

- Memória de vídeo e de geometria depois de percorrer o mapa inteiro (`renderer.info.memory`).
- Tempo do quadro longe do centro (onde o mapa inteiro está à vista).
- Tempo de carregamento de um bloco depois que ele foi descarregado.

### Meta

- A memória de geometria não cresce com o percurso (a descarga funciona).
- O quadro longe do centro custa o mesmo que o quadro perto (o que está fora da tela não
  pesa).

## Fontes

- [100 Three.js Tips That Actually Improve Performance (2026), Utsubo](https://www.utsubo.com/blog/threejs-best-practices-100-tips):
  medir antes de mexer (`renderer.info`, `stats-gl`), instâncias e `BatchedMesh` para
  cortar desenhos, KTX2 e Draco/Meshopt para os arquivos, streamed chunks para cenas
  grandes, e o orçamento de cerca de 100 desenhos por quadro no celular.
- [compileAsync e a lista de desenhos (fórum do three, 86191)](https://discourse.threejs.org/t/86191):
  `compileAsync` monta a lista de desenho antes de compilar, e precisa da cena de destino
  com a luz montada. É a conversa já citada em `src/render/renderizador.js`.
- [Performance issue due to fill rate (fórum do three, 9019)](https://discourse.threejs.org/t/performance-issue-due-to-fill-rate/9019):
  o custo de tela cheia (pixels, sobreposição, sombras) domina antes do número de
  desenhos. É a base da Fase 2.
- [How to render shadow map one time (fórum do three, 7176)](https://discourse.threejs.org/t/how-to-render-shadow-map-one-time/7176):
  `renderer.shadowMap.autoUpdate = false` e `renderer.shadowMap.needsUpdate = true` quando
  o mapa precisa ser refeito. É a base da sombra em cache da Fase 2.
- [Performant soft shadows (fórum do three, 27777)](https://discourse.threejs.org/t/performant-soft-shadows-three-js/27777):
  o mapa de sombra também custa fill rate, e o número de luzes com sombra pesa.
- [Best practices for mobile (fórum do three, 95775)](https://discourse.threejs.org/t/what-are-your-best-practices-for-keeping-three-js-scenes-performant-on-mobile-devices/95775):
  reduzir a resolução, cortar texturas grandes (KTX2) e moderar o número de luzes.
- [Changing pixelRatio based on fps (fórum do three, 34563)](https://discourse.threejs.org/t/changing-pixelratio-based-on-fps-good-or-bad-idea/34563):
  a resolução dinâmica, com a marca do passo para não ficar tremendo.
