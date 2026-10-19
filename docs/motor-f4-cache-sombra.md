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
| `sol` | a direção da luz mudou mais que 0,05° (ela já anda em passos de `passoSombraMin` minutos: ~1° a cada 4) |
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
