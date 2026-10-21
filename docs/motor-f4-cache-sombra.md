# F4: sombra dos objetos parados em cache (KAN-74)

Estado (19/10/2026): três caminhos, nenhum commitado.

- **WebGPU, o jogo** (`cfg.desempenho.renderizador = 'webgpu'`): `src/render/cache-sombra-gpu.js`, ligado por padrão como o do WebGL (mesmo `cfg.mundo.cacheSombra`). Ver a seção "WebGPU (o jogo)" no fim.
- **WebGPU, bancada da cidade de estresse (o F4 do relatório da M1)**: `?cacheSombra=1` em `src/debug/cidade.js`. Ver a seção "WebGPU (bancada)" no fim.
- **WebGL, o jogo**: o restante deste documento. **Ligado por padrão** desde 19/10/2026: imagem idêntica à de antes no Chrome do
  Mac (M1) e suíte de regressão 16 de 16 na T4 (`docs/capturas/kan74/regressao-f4.txt`). Desliga ao vivo com
  `maresia.cfg.mundo.cacheSombra = false`.

## O que faz

Antes, `desenhar()` (src/pos/aranhaverso.js) marcava `shadowMap.needsUpdate = true` em todo quadro, e o three limpava o
mapa de sombra e redesenhava todos os objetos. Agora, com `cfg.mundo.cacheSombra = true` (também no painel, "sombra
dos parados em cache"), o mapa é feito em duas camadas:

- **Parados** (registrados em `src/render/sombra-estatica.js`): num mapa de profundidade só deles, **em cache**.
- **Todo quadro**: copia o mapa em cache para o mapa vivo (um passe de tela cheia que escreve `gl_FragDepth`) e
  desenha por cima, **sem limpar**, só o que se mexe (jogador, gente, bicho, física, tudo que não foi registrado).
  A profundidade guarda o mais perto, então o resultado é o mesmo de desenhar tudo junto.

O módulo (`src/render/cache-sombra.js`) toma o lugar do `shadowMap.render` do three, que o three chama por dentro de
`renderer.render` (matrizes em dia, listas montadas). `aranhaverso.js` não mudou. Com o cache desligado tudo volta ao
caminho de sempre, ao vivo, sem recarregar.

## Quando o mapa dos parados é refeito (`politica-sombra.js`, lógica pura)

| Motivo | Condição |
|---|---|
| `inicial` | primeiro quadro, ou depois de desligar e ligar |
| `sol` | a direção da luz mudou mais que 0,05° (desde 21/10/2026 `passoSombraMin` é 0: isto dá ~4 refazeres por segundo; com 4, eram saltos de ~1° a cada 4 s) |
| `janela` | o jogador se afastou mais que `cfg.mundo.cacheSombraRaio` (15 m) do centro da janela de sombra (60 m) |
| `conjunto` | um parado apareceu, sumiu ou mudou de `count` (LOD, bloco montado ou desmontado, `visible`) |
| `tamanho` | mudou `resolucaoSombra` ou a largura da janela |

Enquanto o cache vale, a pose da luz fica **congelada** (`ceu.atualizar` usa a pose guardada em vez do centro alinhado
ao texel de cada quadro). A janela de 60 m passa a cobrir **pelo menos 60 - raio = 45 m** à volta do jogador (antes,
60 m sempre).

## Quem é "parado"

Quem chama `registrarEstatico(objeto)` depois de decidir o `castShadow` final: tudo que passa por `instanciarEmBlocos`
(blocos.js: árvores, coqueiros, casas, cercas, postes, lampiões, fachadas), `rua.js` (varais), `fatia-objetos.js` e as
malhas do quarteirão. **Quem não registra continua dinâmico** (desenhado todo quadro, como sempre foi), então errar
por esquecimento só perde ganho, nunca congela uma sombra. Não registrados de propósito: jogador, avô, gente, atores,
física (bolas e cocos), jangadas, praia, marcos, faixas.

## Medidas (Chrome 19/10/2026, Apple M1, 4096, 1280 × 720)

- **Imagem**: 5 fotos justas (`maresia.fotoJusta`, páginas novas, 4 rodadas) com cache ligado × desligado: diferença
  de 0 em todos os pixels, no primeiro quadro (que refaz) e no segundo (que reaproveita). Desligado × desligado e
  ligado × ligado também dão 0.
- **CPU do desenho** (`pos.render`, mediana de 3 repetições de 4 s): parado 3,63 → 3,37 ms; andando 3,43 → 3,23 ms;
  sem sombra nenhuma 3,27 ms. O ganho no jogo normal é pequeno (a sombra custa ~0,3 ms aqui). O mapa foi refeito 0
  vezes em 4 s de caminhada (a fatia trava o jogador).
- Só 1 refazer a cada troca de lugar/hora; 88 chamadas de desenho nos parados contra 45 nos dinâmicos na foto da
  fogueira (495 parados registrados).
- `maresia.cacheSombra.stats`: `refeitos`, `quadros`, `motivos`, `msRefazer`, `parados`, `chamadasEstatico`,
  `chamadasDinamico`.

## Dois erros achados só no navegador (o teste com renderizador falso não pegava)

1. O three chama `shadowMap.render` em **todo** `render()`, inclusive nas passadas do pós-processamento (zero luzes).
   O cache tratava isso como "incompatível", desligava e refazia o mapa em 100% dos quadros. Hoje passada sem luz não
   faz nada.
2. A cópia chamava `renderBufferDirect` direto: o three só sobe a geometria dentro de `render()`, e o quadrado de
   tela cheia nunca chegava à GPU (cópia vazia, jogo **sem nenhuma sombra de parado**). Hoje é um `render()`
   aninhado, com `autoClear` e `info.autoReset` desligados e devolvidos.

Os dois têm teste de regressão em `testes/unidade/cache-sombra.test.js` (16 testes). Verificação no navegador:
`~/claude-f4/verificar.py` (fotos justas + CPU); não está no repositório.

## Limites

- **Este módulo é só WebGL.** O WebGPU tem o seu (seção abaixo).
- Sombra de folha e coqueiro que balançam no vento é de "parado" e **não balança** até o próximo refazer.
- Parado que se move sem ser registrado continuaria certo (fica dinâmico); parado **registrado** que se move
  congelaria a sombra. Só registrar o que tem matriz congelada.
- A cópia é de 4096² a cada quadro (barata na GPU, ~1 chamada); a CPU ainda atravessa a cena no passe dinâmico.
- Ligar o cache muda o recorte da janela de sombra (45 m garantidos, não 60 m).

## Para desligar

`maresia.cfg.mundo.cacheSombra = false` no console (vale na hora), o painel, ou `cacheSombra: false` em `src/config.js`.
A suíte de regressão (`testar_jogo.py`) passou 16 de 16 na T4 com o cache ligado; as 14 cenas dela, porém, não medem
a sombra do WebGL em si (a imagem foi comparada no Mac, pixel a pixel). Se aparecer sombra velha ou faltando, desligar
é o primeiro teste.

## WebGPU (o jogo)

`src/render/cache-sombra-gpu.js`, criado em `main.js` quando o renderizador é o WebGPU. Mesma política
(`politica-sombra.js`) e mesmos registrados (`sombra-estatica.js`); muda o mecanismo, porque o `ShadowNode` do three
não passa pelo `shadowMap.render`:

- Na primeira instalação ele troca duas funções do protótipo de `ShadowNode`: `setupRenderTarget` (o mapa do sol passa
  a ser `depth32float`, o único formato de profundidade copiável) e `renderShadow` (desvia para o cache; qualquer outra
  luz segue o caminho original).
- Refazer: passe só dos parados (câmera da sombra com a camada 1) num alvo de profundidade em cache.
- Todo quadro: `copyTextureToTexture` do alvo em cache para o mapa vivo e, por cima, o passe dos dinâmicos com
  `autoClear = false`. Sem o formato `depth32float` ou com o cache desligado, cai no caminho original.
- Teste: `testes/unidade/cache-sombra-gpu.test.js` (renderizador falso). 37 testes passam em 6 arquivos; `npm run build` ok.

Verificação (19/10/2026):
- Chrome do Mac (M1, WebGPU de verdade), `?foto`, 5 cenas, páginas novas por rodada: cache desligado 2× e ligado 2×,
  **0 pixel diferente** nas 4 comparações (A1×A2, A1×B, B×C), com o cache refazendo 6 vezes (`inicial`, `sol`, `janela`).
- Jogo rodando solto: depois dos 2 refazeres iniciais (`inicial`, `conjunto`), 100 a 170 quadros seguintes reutilizaram o
  cache sem refazer. Capturas de tela do jogo ao vivo variam entre si mesmo com o cache desligado, então não servem
  como comparação; a prova de imagem é a das fotos justas.
- T4 (AWS): suíte de regressão 16 de 16 com o cache ligado, incluindo `modoWebgpu`. As 14 cenas dela não medem a sombra
  em si.
- O ganho de FPS no jogo real em WebGPU **não foi medido**; os números da bancada (+20–30% com 15 a 20 mil casas) não
  valem automaticamente para o jogo, que tem bem menos objetos.

Limites: os mesmos do WebGL (sombra que balança no vento fica parada até o próximo refazer; só registrar o que tem
matriz congelada). Os meshes `placa` da three-virtual-geometry não são registrados, então ficam dinâmicos (corretos, só
sem o ganho). Para desligar: `maresia.cfg.mundo.cacheSombra = false`.

## Sombra nítida (21/10/2026)

Queixa do Joabe jogando: "a sombra é muito mal definida, fica piscando, pixelada". Medido no Chrome do Mac (M1,
1280 × 720, tela do jogo 1280 × 577), no `04cd764`, antes de mexer.

### Diagnóstico (números)

| Causa | Medida no 04cd764 | O que se via |
|---|---|---|
| Mapa único de 346 m em 4096 | 8,45 cm por texel no plano da luz; a 5 m da câmera um pixel é 0,81 cm, ou seja ~10 px por texel | degrau grosso na borda ("pixelada") |
| Sol baixo estica o texel no chão (1 / seno da altura) | 9 cm às 12h (70,7°), 25 cm às 16h36 (19,8°), 42 cm às 17h12 (11,5°, o mínimo da hora dourada) | 31 a 52 px por texel na hora dourada |
| PCF do three 0.186: 5 amostras num disco girado por ruído de TELA (`interleavedGradientNoise(gl_FragCoord)`) | o pontilhado fica parado na tela enquanto o mundo anda; o pintor de luz (smoothstep da faixa de sombra) vira o pontilhado em serrilhado | borda que "ferve" ao andar e girar |
| Passo do sol: `passoSombraMin` 4 com 1 min de jogo por segundo | salto de 0,94° num quadro, a cada 4 s; com a câmera parada, 2,0 a 3,3% da tela mudando num quadro só (quadros 14, 134, 254) | a sombra inteira dá um tranco ("piscando") |
| `bias` -0,0006 em profundidade normalizada, com near 1 e far 1.441 | 0,864 m de profundidade: os 0,3 m de baixo de quem está em pé (0,8 m ao meio-dia) não faziam sombra | sombra descolada do pé; ao meio-dia a sombra das pessoas quase some |
| Cache dos parados | não é causa: com o alinhamento ao texel o recentrar ("janela") não pula; 0 tranco medido fora dos passos do sol | — |
| Folíolos do coqueiro (46 por lado) | com o mapa denso viram pente regular no chão | moiré que treme ao andar |

### O que mudou

1. **Borda presa ao mapa** (`src/render/filtro-sombra.js`): grade 3 × 3 de amostras PCF de hardware com pesos de tenda
   (1 2 1), espaçamento `cfg.mundo.sombraSuave` texels. Sem ruído de tela: a borda sai lisa e igual em todo quadro, e o
   pintor de luz a recorta numa forma limpa. No WebGL troca o `getShadow` do ShaderChunk; no WebGPU é o
   `shadow.filterNode`. `cfg.mundo.sombraFiltro = 'three'` volta ao de antes (no WebGL ao vivo, pelo sinal do raio).
2. **Viés em metros** (`src/render/sombra-luz.js`): `sombraVies` 0,03 m e `sombraViesNormal` 1 texel, convertidos para
   cada mapa a cada quadro. O chão não projeta sombra, então o viés pequeno não dá acne nele.
3. **Sol sem tranco**: `passoSombraMin` 0. O mapa de longe refaz os parados a cada 0,05° (limiar da política), ~4 vezes
   por segundo, ~1,2 ms de CPU cada; o de perto segue o sol contínuo. Valor 4 salvo no navegador vira 0
   (`PADRAO_MUDOU` em config.js).
4. **Mapa de perto** (`src/render/sombra-perto.js`): 48 m em 2048 (2,34 cm por texel, 3,6 vezes mais denso), 8 m à
   frente do jogador, preso à grade de texels, redesenhado todo quadro com parados e dinâmicos; na borda (12% da
   janela) mistura suave com o de longe. WebGL: luz de intensidade 0 que projeta sombra + trecho do
   `lights_fragment_begin` (luz 0 = sol usa a mistura, luz 1 não ilumina; a intensidade da sombra da luz 1 carrega a
   largura da faixa). WebGPU: `sol.shadow.shadowNode` mistura o ShadowNode de longe (o do cache) com o de perto.
   Os dois caches passaram a compor o sol com outra luz (antes, uma segunda luz desligava o cache).
5. **Coqueiro**: a sombra da copa sai de uma máscara só dela (14 folíolos grossos por lado, `sombraCopaCheia`).
6. Achados no caminho: o medidor não rodava no WebGL (leitura assíncrona sem buffer) e, no WebGPU, trocar a qualidade da
   sombra quebrava a cópia do cache (alvo no tamanho velho). Os dois corrigidos com teste.

### Prova

- Vídeos lado a lado, ANTES em cima e DEPOIS embaixo, mesma rota e hora (`maresia.gravar`, 30 qps, tempo correndo):
  `docs/capturas/sombras/antes-depois-webgl-rota-16h6.mp4`, `-webgl-rota-12.mp4` (andar 4 s, correr 3,5 s, girar a
  câmera 4,5 s), `-webgl-parado-16h6.mp4`, `-webgl-parado-12.mp4` (câmera parada, só o tempo andando) e os dois do
  WebGPU (16h36).
- Recortes da borda (3×, sem filtro): `borda-pessoas-16h36-webgl.png`, `borda-pessoas-12h-webgl.png`,
  `borda-coqueiros-12h-webgl.png`, `borda-pessoas-16h36-webgpu.png`; quadro inteiro em `inteiro-*.jpg`.
- Tranco com a câmera parada (fração da tela que muda mais de 24 níveis de um quadro ao seguinte):

| Clipe | Antes: mediana / pior quadro | Depois: mediana / pior quadro |
|---|---|---|
| WebGL 16h36 | 0,37% / 2,15% (picos a cada 4 s) | 0,73% / 1,00% (nenhum pico) |
| WebGL 12h | 0,47% / 3,31% (picos a cada 4 s) | 0,78% / 1,55% (nenhum pico) |

  A mediana sobe porque agora a sombra das pessoas e das folhas que balançam existe inteira e nítida (a respiração do
  corpo parado mexe a borda), não por tremor: o mapa das mudanças mostra só bordas de quem se mexe.
- `testes/unidade/sombra-nitida.test.js` (7 testes): viés, passo e cache com duas luzes vistos falhando no 04cd764
  (0,864 m; 0,94°; parado no passe dinâmico).

- Suíte de regressão no Mac (`node scripts/rodar-cenarios-local.mjs`, WebGPU): 14 de 14, console limpo
  (`docs/capturas/sombras/regressao-local.txt`; load de 11 a 28, máquina dividida com outros agentes). O
  `sombrasCopias` usa uma luz própria, sem o filtro novo: não mudou de comportamento. `olhar-jogo` com 0 shader
  quebrado no WebGL e no WebGPU (`olhar-webgl.txt`, `olhar-webgpu.txt`). Os testes novos rodados no 04cd764:
  `testes-no-04cd764.txt`.

### Custo

`maresia.medir`, 2000 × 1125 (1600 × 900 × 1,25), na praia da fatia às 16h36, tempo correndo (conta os refazeres do
cache), variantes alternadas na mesma rodada, mediana de 9 repetições, rodada repetida com a ordem invertida. "antes" é
o código novo com tudo do jeito antigo (sem mapa de perto, filtro do three, passo 4, viés de 0,864 m).

| Renderizador | Variante | ms por quadro (ordem 1 / ordem 2) | CPU ms |
|---|---|---|---|
| WebGL | antes | 47,72 / 46,97 | 10,53 / 9,08 |
| WebGL | sem mapa de perto (borda, viés e passo novos) | 47,30 / 46,55 | 10,95 / 9,67 |
| WebGL | depois (padrão) | 49,18 / 47,54 | 12,74 / 9,05 |
| WebGPU | sem mapa de perto, passo 4 | 41,17 / 40,07 (andando) | 35,99 / 31,20 |
| WebGPU | depois (padrão) | 41,80 / 42,58 (andando) | 36,76 / 39,04 |

Leitura: borda, viés e passo não custam nada mensurável; o mapa de perto custa ~1 a 2 ms por quadro (~92 a 108
chamadas de desenho a mais por quadro, `cacheSombra.stats.chamadasOutras`), e 4096 no de perto não muda o tempo. O
refazer dos parados do mapa de longe custa 1 a 2,4 ms de CPU no WebGL e ~4,6 ms no WebGPU, ~4 vezes por segundo.
**A máquina estava carregada** (load de 12 a 115, outros agentes e outro Chrome na fila): os números absolutos não
valem como linha de base, só a comparação dentro da rodada. Uma rodada anterior, com a carga mudando no meio, deu
uma diferença falsa de 33 ms que sumiu ao inverter a ordem. Na T4 não foi medido.

### Limites e o que pode dar errado

- Os personagens agora fazem sombra em si mesmos (braço no tronco, perna na perna): antes o viés de 0,86 m impedia.
  É mais "luz dura do sertão", mas muda a cara deles; se incomodar, `sombraViesNormal` maior diminui.
- O mapa de perto desenha todo quadro uns 90 objetos (blocos de cópias inteiros que tocam a janela). Se pesar na T4 ou
  no M1, `sombraPerto` desliga ao vivo e volta o mapa único (já com borda, viés e passo novos).
- O trecho trocado no ShaderChunk depende do texto do three 0.186; numa versão nova o teste de unidade avisa e o jogo
  cai no caminho de sempre (aviso no console).
- No WebGPU, no `04cd764` e depois, o terreno perto do jogador sai todo escuro até o material dele ser remontado
  (desligar e ligar "sombras" conserta). Não é a sombra em si: viés e filtro não mudam nada; ficou como achado à parte.
  Os vídeos e fotos do WebGPU foram feitos com esse remendo (`receiveShadow` do terreno desligado e religado).
