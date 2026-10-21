# Otimização do WebGPU no jogo (KAN-74, continuação do F4)

Registro de 19/10/2026. Objetivo: o WebGPU (`cfg.desempenho.renderizador = 'webgpu'`) alcançar o WebGL no jogo real,
na g4dn (T4, Chrome 155, 1920 × 792, sem vsync). Diagnóstico completo: o gargalo é CPU em dois lugares (thread principal
do jogo e thread principal do gpu-process do Chrome); a GPU faz 3,5 ms por quadro e fica ociosa. Nenhum commit foi feito;
backup do estado anterior em `~/claude-f4/backup-pre-otimizacao.patch` e `~/claude-f4/backup-pre-otimizacao-novos.tgz`.

## Como medir (sempre do mesmo jeito)

- `~/claude-f4/otimizacao/medir.sh ROTULO [--reps 3] [--correndo] [--webgl]`: pelo DevTools do Chrome do dono na T4,
  teleporta para a posição de referência (x 340,6; z −9,1; yaw −1,663; 17h16), mede e devolve o jogador/hora como
  estavam. Sem `--correndo` a hora do jogo fica parada (determinístico); com `--correndo` a hora anda (o regime do dono:
  a paleta por hora muda uniforms todo quadro). Por repetição: FPS do rAF (4 s), ms de JS por quadro (do `jogador.update`
  ao fim do `pos.render`), ms do passe principal (sem a sombra aninhada), da sombra dinâmica e dos quads; objetos
  (`renderObject`) por passe; comandos WebGPU por quadro contados nos protótipos (nada de `renderer.info`, que acumula).
  Resultado em `~/claude-f4/otimizacao/medidas/ROTULO.json`; a mediana de 3 repetições é o número reportado, com a
  variação ao lado.
- `~/claude-f4/otimizacao/foto.sh ROTULO [--ref REF] [--placa 0|1]`: foto justa WebGPU no Chrome do Mac (Metal,
  headless), 5 cenas do KAN-74, comparação pixel a pixel com a referência. **Critério: 0 pixel diferente com
  `--placa 0`** (duas rodadas idênticas, `base-sp` × `base-sp2`, deram 0 nas 5 cenas). Com `motorPlaca` ligado a vg
  introduz ruído próprio entre rodadas idênticas (`base` × `base2`: 16 a 106 pixels, no máximo 9/255 por canal, em 4 das
  5 cenas), então `--placa 1` só serve como checagem secundária contra esse piso.

## Linha de base (19/10/2026, mediana de 3 repetições)

| Modo | FPS rAF | quadro (med) | JS/quadro | passe principal | sombra din. | quads | objetos cena+sombra | draws | writeBuffer | submit |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| WebGPU, hora parada | 58,1 (55,7–58,5) | 16,6 ms | 18,7 ms (18,6–19,5) | 10,3 ms | 3,6 ms | 1,1 ms | 263 + 104 | 377 | 60 | 14,3 |
| WebGPU, hora andando | 38,6 (38,4–39,7) | 24,4 ms | 19,2 ms (18,8–20,3) | 10,9 ms | 3,2 ms | 1,1 ms | 259 + 98 | 369 | **1.022** | 14,6 |
| WebGL, hora parada | 202,5 (189,7–202,8) | 4,2 ms | 4,8 ms (4,8–5,6) | 3,1 ms | — | 0,2 ms | n/d | n/d | n/d | n/d |
| WebGL, hora andando | 85,2 (80,9–85,2) | 11,8 ms | 6,8 ms (6,8–7,2) | 4,3 ms | — | 0,3 ms | n/d | n/d | n/d | n/d |

Leitura: com a hora parada o limite é o JS (18,7 ms); com a hora andando o JS não muda, mas o gpu-process recebe ~1.000
`writeBuffer` por quadro (faixas não contíguas de uniforms `ref()` que mudam com a hora, ~6-7 por binding, ~150 bindings)
e o quadro vai a 24 ms. O WebGL também cai com a hora andando (202 → 85 FPS) pelo mesmo motivo (uploads de uniform), mas
parte de 4,8 ms de JS. Outros comandos por quadro no WebGPU: 1.172 `setVertexBuffer`, 577 `setBindGroup`, 185
`setPipeline`, 98 `setIndexBuffer`, 13 render passes.

Ambiente: o Chrome da T4 roda com `--disable-vulkan-surface` (infra/maquina-gpu/maquina.sh), e a apresentação é por
readback síncrono (~20 ms por quadro apresentado, 10-27 quadros apresentados/s em qualquer renderizador). Isso não muda
o custo de JS, mas limita o que a tela remota mostra; fica como recomendação, sem mexer no Chrome do dono.

## Itens (ordem de execução) — preenchido à medida que cada um é medido

| # | Item | Arquivos | Estado | Antes → depois (WebGPU hora parada / andando) | Foto justa |
|---|---|---|---|---|---|
| 1 | um `updateMatrixWorld` por quadro | `src/main.js` | aceito (leva 1) | ver leva 1 | 0 px |
| 2 | conversão de materiais no 1º desenho; propriedades sem getters | `src/render/renderizador.js`, `testes/unidade/renderizador-webgpu.test.js` | aceito (leva 1) | ver leva 1 | 0 px |
| 3 | limpeza redundante antes do passe principal (−1 submit) | `src/pos/aranhaverso-gpu.js` | aceito (leva 1) | submits 14,3 → 13,1 | 0 px |
| 4 | malhas da vg registradas como parados no cache de sombra | `src/render/motor-placa.js` | **não aplicado** | — | — |
| 7 | uma gravação por binding (coalescer faixas de uniform) | `src/render/gpu/faixas-uniform.js` (novo), 2 linhas em `renderizador.js`, `testes/unidade/faixas-uniform.test.js` | aceito | hora andando: writeBuffer 1.015 → 208, FPS 46,2 → 48,1 | 0 px |
| 5 | parados sem refresh total (remendo no `NodeMaterialObserver`) | `renderizador.js`, `src/mundo/congelar.js`, `testes/unidade/observador-estaticos.test.js` | aceito | parada: 65,3 → 72 FPS, JS 15,1 → 13,7; andando: 48,1 → 52,9 | 0 px (3 de 4 rodadas; 1 rodada com 15 px no avô, não reproduzida) |
| 8 | personagens: textura de ossos sem matriz; `InstanceNode` do three no caminho dos parados | `src/render/gpu/ossos.js` (novo), `renderizador.js` | **revertido** | sem ganho (72,0 → 71,8 / 52,9 → 50,1) | **26-285 px** em todas as cenas |
| 6 | render bundles para blocos parados | — | adiado: parados já custam ~10 µs; ganho ≈ 0,5-1 ms por refatoração grande | | |

### Leva 1 (itens 1 + 2 + 3 juntos, medidos em 19/10 15:00; os três entraram ao mesmo tempo, então o ganho é conjunto)

| Modo | FPS rAF | JS/quadro | passe principal | sombra din. | quads | submit | writeBuffer |
|---|---:|---:|---:|---:|---:|---:|---:|
| WebGPU, hora parada: base → leva 1 | 58,1 → **63,0** (62,6–65,2) | 18,7 → **15,2 ms** (14,2–16,2) | 10,3 → 7,8 | 3,6 → 2,4 | 1,1 → 1,0 | 14,3 → 13,1 | 60 → 56 |
| WebGPU, hora andando: base → leva 1 | 38,6 → **46,2** (46,0–47,1) | 19,2 → **16,9 ms** (16,3–17,1) | 10,9 → 9,0 | 3,2 → 2,4 | 1,1 → 1,1 | 14,6 → 13,4 | 1.022 → 1.015 |

Objetos e draws por quadro iguais (263 + 98, ~370 draws), como esperado: os três itens tiram trabalho fixo, não objetos.
Expectativa por item (do diagnóstico): 1 ≈ 2 ms (os dois `updateMatrixWorld`), 2 ≈ 1 ms (travessia + getters),
3 ≈ 0,3 ms (um passe/submit). Foto justa `leva1` × `base-sp` (`motorPlaca` desligado): 0 pixel nas 5 cenas, sem erro de
console, shader quebrado ou material faltando porte. `npm test` 47/47 e `npm run build` ok.

- Item 1: `cena.matrixWorldAutoUpdate = false`; `cena.updateMatrixWorld()` em `passo()` só ao desenhar (mesmo ponto em
  que o three fazia a primeira) e antes de `prepararMotorPlaca` (o `compileAsync` da vg precisa das matrizes). O cache
  de sombra WebGL (`cache-sombra.js`) não depende do `updateMatrixWorld` do `render`: só chama o `shadowMap.render`
  original e um `render()` aninhado numa cena própria.
- Item 2: gancho `prepararObjetoAoDesenhar` (ex-`alphaTestSemVersaoNaSombra`) converte o objeto no primeiro desenho e
  passa ao three o material convertido (`materialParaDesenho`, com `trocas.get` para a lista montada antes da
  conversão); `prepararCenaWebgpu` percorre a cena só na primeira chamada por cena e, por quadro, faz o laço de versões
  e `sincronizarSeguidos()` (lista `DINAMICAS`: color, opacity, transparent, visible, map, alphaMap, emissive,
  emissiveIntensity, side, depthWrite, depthTest, alphaTest, blending, gradientMap). Levantamento do que o jogo escreve
  em material depois de criado: `marcos.js:109` opacity (facho, todo quadro), `rosto.js:499-500` map (olhos/boca);
  cores mudam no próprio `Color` compartilhado (`ceu.js`, `cenografia.js`, `quarteirao.js`, `horizonte.js`, `praia.js`).
  Limite novo: propriedade fora de `DINAMICAS` escrita em jogo não chega mais ao WebGPU (antes chegava pelos getters);
  escrita na versão WebGPU não volta ao original (afeta só `debug/kit.js:79` e `debug/cidade.js:127`).
- Item 3: sem `r.clear()` antes do passe MRT; conferido no three 0.186 que o `render` com `autoClear` limpa os dois
  anexos de cor com `_clearColor` (gLuz em 0,0,0,1) e a profundidade com 1 — a limpeza explícita só limpava o anexo 0.
- Item 4 (não aplicado): a three-virtual-geometry calcula o recorte de sombra no `update()` com a flag
  `shadow = castShadow && frameCount − lastShadowFrame ≤ 2` (VirtualGeometry.ts:450, GeometryPool.ts:869/881) e
  `lastShadowFrame` só avança no `onBeforeShadow`; com o F4 os registrados ficam com `castShadow = false` fora do refazer,
  então o mapa em cache sairia sem sombra de árvore ou com sombra velha. Precisa de mudança em `cache-sombra-gpu.js`
  (forçar a flag durante o refazer); fica para depois, com ganho pequeno (~0,8 ms).

### Item 7 (medido em 19/10 15:07, sobre a leva 1)

| Modo | FPS rAF | JS/quadro | passe principal | sombra din. | submit | writeBuffer |
|---|---:|---:|---:|---:|---:|---:|
| WebGPU, hora parada: leva 1 → item 7 | 63,0 → 65,3 (64,0–69,1) | 15,2 → 15,1 ms | 7,8 → 7,8 | 2,4 → 2,3 | 13,1 → 13,1 | 56 → 48 |
| WebGPU, hora andando: leva 1 → item 7 | 46,2 → **48,1** (47,0–48,1) | 16,9 → **15,9 ms** | 9,0 → 8,4 | 2,4 → 2,2 | 13,4 → 13,3 | **1.015 → 208** |

`instalarFaixasUnicas` embrulha `WebGPUBindingUtils.updateBinding` (three.webgpu.js 84857-84920): com mais de uma faixa
e buffer ≤ 4 KB grava o buffer de CPU inteiro numa chamada; as faixas continuam sendo limpas pelo chamador
(`Bindings._update`/`updateSharedForRender`). Com a hora parada não muda nada (quase nenhum uniform muda por quadro).
Com a hora andando o JS cai 1 ms e o quadro continua acima do JS (20 ms contra 15,9): o gpu-process ainda processa ~3.300
comandos de encode por quadro (1.135 `setVertexBuffer`, 567 `setBindGroup`, 189 `setPipeline`, 13 submits) — é o
que os render bundles (item 6) atacam. Foto justa `item7` × `base-sp`: 0 pixel. Dependência: assinatura de
`updateBinding` do three 0.186 (rever ao atualizar o three).

### Item 5 (medido em 19/10 15:40, sobre a leva 1 + item 7)

| Modo | FPS rAF | JS/quadro | passe principal | sombra din. | submit | writeBuffer |
|---|---:|---:|---:|---:|---:|---:|
| WebGPU, hora parada: item 7 → item 5 | 65,3 → **72,0** (70,8–73,0) | 15,1 → **13,7 ms** (13,4–14,3) | 7,8 → 6,9 | 2,3 → 2,2 | 13,1 → 13,0 | 48 → 48 |
| WebGPU, hora andando: item 7 → item 5 | 48,1 → **52,9** (52,5–54,1) | 15,9 → **15,6 ms** (14,9–16,1) | 8,4 → 7,8 | 2,2 → 2,4 | 13,3 → 13,4 | 208 → 208 |

`estaticosSemRefreshTotal` troca `NodeMaterialObserver.prototype.needsRefresh`: objeto `static` (marcado em
`congelar()`) com material de nós cai no `equals()` do próprio three em vez do FULL incondicional, desde que todos os
nós com atualização por objeto do shader sejam dos tipos que o `equals()` cobre (`elegivel`, uma vez por shader).
Ao vivo na T4: 248 shaders elegíveis; por quadro ≈ 49 decisões `none` + 48 `shared`, ~273 `original` (objetos não
estáticos: vg, skinned, pessoas, casas do quarteirão, que não passam por `congelar`); recusas: 65 shaders com o
`InstanceNode` do three (`EventNode beforeFrame`, materiais `luzFixa` como `lampioes-vidro`) e 18 com `TextureNode` por
objeto (copas). Avançar 1 h refaz as sombras (FULL pelas luzes); `equals()` nunca lançou. Foto justa: 0 pixel em 3 de 4
rodadas; uma rodada deu 15 pixels (≤ 5/255) espalhados no contorno do avô (malha skinned, que vai pelo caminho
original do three) e não se repetiu em outras três rodadas — registrado como não-determinismo raro observado, sem
causa atribuída ao item. Limite: textura amostrada por nó que não é propriedade do material não é observada pelo
`equals()`; se for regravada em jogo com `needsUpdate` só sobe quando o shader passar por FULL (as do jogo são montadas
uma vez, antes do primeiro desenho).

Experimento (não é item): `motorPlaca` desligado no jogo do dono, mesma posição: hora parada 71,5 FPS / 14,4 ms (contra
72,0 / 13,7 ligado), andando 52,0 / 14,8 (contra 52,9 / 15,6). Neutro no mapa de hoje: a vg tira 45 objetos do passe de
sombra e 76 `setPipeline`, mas são 11 blocos a mais na cena; os blocos parados, depois do item 5, custam ~10 µs e as
malhas da vg ~40 µs. Config do dono mantida (ligado).

### Item 8 (medido em 19/10 16:04; revertido)

O que fez: `Skeleton.computeBoneTexture` marcando `boneTexture.matrixAutoUpdate = false` e `TextureNode.setup` zerando
`updateMatrix` para textura marcada com matriz identidade (os 33 `TextureNode` da textura de ossos por SkinnedMesh
deixam de ter o uniform mat3 e a atualização por objeto); e `elegivel` aceitando o `EventNode beforeFrame` do
`instance()` do three em InstancedMesh. Efeito confirmado na T4: grupo de objeto das SkinnedMesh de 41 uniforms /
1.872 B para 9 / 336 B; recusas `EventNode:frame (antes)` sumiram (90 shaders a mais no caminho dos parados).

| Modo | FPS rAF | JS/quadro | passe principal | sombra din. |
|---|---:|---:|---:|---:|
| WebGPU, hora parada: item 5 → item 8 | 72,0 → 71,8 (71,3–71,8) | 13,7 → 14,0 ms | 6,9 → 6,8 | 2,2 → 2,1 |
| WebGPU, hora andando: item 5 → item 8 | 52,9 → 50,1 (49,5–50,6) | 15,6 → 15,6 ms | 7,8 → 7,8 | 2,4 → 2,2 |

Sem ganho mensurável (o custo da SkinnedMesh não está nesses 33 nós) e **a imagem mudou**: 26 a 285 pixels por cena
(máx. 104/255), nos personagens, iguais em duas rodadas (determinístico). No WGSL, a leitura de cada osso passou de
`textureLoad(tex, vec2<i32>((mat3 * vec3(vec2<f32>(ivec2), 1)).xy))` para `textureLoad(tex, ivec2)`: com matriz
identidade devia dar o mesmo texel, mas não dá; a causa não foi investigada porque o item não traz ganho. Revertido por
inteiro (inclusive a aceitação do `beforeFrame`, que não pôde ser medida à parte). Testes 101/101 e build passavam.

Revertidos: item 8 (acima). Não aplicado: item 4. Limites conhecidos: os do item 2, a dependência do item 7 e o do item 5.

## Fechamento da fase 1 (19/10/2026, 16:20)

Build final = itens 1, 2, 3, 5 e 7 (4 não aplicado, 8 revertido). Foto justa `final` × `base-sp`: 0 pixel nas 5 cenas;
`npm test` 91/91; `npm run build` ok. Dispersão: a mesma build final mediu, em cinco rodadas com recargas da página,
57,4 / 57,6 / 58,2 / 68,3 / 67,0 FPS com a hora parada (JS 17,5 → 14,1 ms), sem mudança de código nem de carga da
máquina (sem `steal`, clocks iguais; o WebGL repetido no mesmo intervalo deu 187 contra 202 FPS). Comparações entre itens
foram sempre feitas em sequência na mesma sessão; os números da tabela abaixo são os pares `final6` (última rodada).

| Modo | base | leva 1 (1+2+3) | +7 | +5 | final (rodada 6) | WebGL ref. |
|---|---:|---:|---:|---:|---:|---:|
| hora parada: FPS | 58,1 | 63,0 | 65,3 | 72,0 | **67,0** (57–72 entre recargas) | 202,5 (187–202) |
| hora parada: JS/quadro | 18,7 ms | 15,2 | 15,1 | 13,7 | **14,2 ms** | 4,8–5,1 ms |
| hora andando: FPS | 38,6 | 46,2 | 48,1 | 52,9 | **49,6** | 85,2 |
| hora andando: JS/quadro | 19,2 ms | 16,9 | 15,9 | 15,6 | **15,9 ms** | 6,8 ms |
| writeBuffer/quadro (andando) | 1.022 | 1.015 | 208 | 208 | 206 | n/d |
| submits/quadro | 14,3 | 13,1 | 13,1 | 13,0 | 13,0 | n/d |
| objetos cena + sombra din. | 263 + 104 | 263 + 98 | 263 + 98 | 263 + 98 | 263 + 97 | n/d |

Onde fica o JS que sobra (hora parada, ~14 ms): lógica do jogo ~4,5 ms (igual nos dois renderizadores: câmera 1,1,
física 0,8, jogador 0,6…); malhas da vg ~2,7 ms (68 desenhos a ~40 µs nos dois passes); personagens skinned ~3,4 ms
(~52 desenhos a 57-72 µs); passes fixos e culling ~1,5 ms; demais objetos não estáticos (pessoas, casas do quarteirão,
sprites, mar) ~1,5 ms; os ~68 parados por quadro já custam ~10 µs cada (~0,7 ms). O WebGL faz os mesmos ~370
desenhos em ~3 ms porque cada objeto custa ~7 µs (uniforms por `gl.uniform*`, sem grafo de nós nem bind groups).

Ambiente (recomendação, não aplicada): o Chrome da T4 roda com `--disable-vulkan-surface` e apresenta por readback
síncrono (~20 ms por quadro apresentado, 10-27 quadros/s na tela remota em qualquer renderizador). Testar sem a flag
muda o que o dono vê, não o custo do jogo.

### Critério de parada da fase 2 (ver `~/claude-f4/otimizacao/fase-2.md`)
- 2b (atores de fundo por VAT instanciado): os ~85 SkinnedMesh dos 15 atores respondem pela maior parte dos ~3,4 ms
  dos personagens; ganho estimado 2,5-3 ms de JS (~+12-15 FPS com a hora parada) — **relevante no mapa de hoje**, e
  cresce com multidões. Exige aceitar uma tolerância de imagem nos atores (a foto justa não será pixel-idêntica).
- 2a (parados para a vg): depois do item 5 os parados custam ~10 µs e a vg ~40 µs por malha; no mapa de hoje o ganho é
  ≤ 1 ms e pode ser negativo. **Só com o mapa crescendo** (M1: 15-20 mil casas), quando o número de blocos visíveis
  domina.

## Fase 2b — atores de fundo como cópias com a pose em textura de ossos (aprovada pelo dono em 19/10/2026)

Backup antes de começar: `~/claude-f4/backup-pre-fase2.patch` (14 arquivos) e `backup-pre-fase2-novos.tgz` (26 não rastreados).

Decisão de desenho, depois de ler `esqueleto.js`: o boneco dos atores é rígido por osso (cada vértice tem peso 1 num único
osso, 28 ossos, 6 peças por cor via `pintar()`), então em vez de VAT por vértice grava-se **as matrizes de osso por
quadro** (`esqueleto.boneMatrices`, exatamente o que o skinning usa) numa `DataTexture` de 112 × ~200 texels, assada
no navegador na abertura a partir dos mesmos `AnimationClip` (`andar`, `parado`) que os atores usam — rotoscopia
preservada por construção, e o `AnimationMixer` continua sendo o relógio (tempo, loop, pesos "em 2"). Os 16 atores viram
6 `InstancedMesh` (uma por peça) com `instanceColor` e dois atributos por cópia (clipe/quadro/fração/peso), e o
deslocamento entra pelo hook `userData.tsl.posicao` do material pintado; a sombra pelo `positionNode` do material
convertido. Só WebGPU (`cfg.desempenho.atoresVat`, novo; `cfg.personagem.quantosAtores`, novo); no WebGL os atores
seguem com esqueleto. Jogador e avôs não mudam.

Diferenças de imagem esperadas, só nos atores: mistura de posições (não de quaternions) durante o crossfade de 0,5 s
entre andar/parado, e interpolação linear entre quadros de 30 fps. Critério: `mascara.py` — 0 pixel fora da máscara
dos atores (máscara = onde os atores aparecem em qualquer das duas builds, dilatada 3 px) e 0 pixel entre as builds sem
atores (`--quantosAtores 0`); dentro da máscara, relata quantidade e maior diferença, para o dono julgar.

Briefings: `~/claude-f4/otimizacao/briefing-2b-{1,2,3}.md` (ossos-textura.js; atores-vat-material.js + hook de sombra
em `criarVersao`; atores.js + config/main/painel), com contrato de API comum; os três em paralelo (arquivos disjuntos).
Expectativa: ~85 desenhos skinned por quadro → 12; JS −2 a −3 ms; cena 263 → ~247 objetos, sombra 97 → ~81.

Leva 6 (19/10): 2b-1 aceito (bake fiel: linha k = `mixer.setTime(k/fps)` → `esqueleto.boneMatrices`; teste compara com o
mixer feito à mão, tol. 1e-6; `bindMatrix` identidade e `skinWeight` (1,0,0,0) confirmados). 2b-3 feito contra o contrato
(6 `InstancedMesh`, material único, atributos compartilhados; o relógio de cada ator é um `AnimationMixer` com clipes
vazios da mesma duração — tempo, loop e pesos saem iguais sem avisos de `PropertyBinding`). 2b-2 parou e acertou: no three
0.186 `NodeMaterial.setupPosition` aplica `positionNode` DEPOIS de `instance()` (three.webgpu.js:22301-22360), então a
sombra precisa de um `positionNode` com a posição final da cópia: `matrizInstancia(W, builder.object) · (ossos ·
positionGeometry)`. Contrato ajustado: `materialAtoresVat({ textura, nOssos, opacity, atributos: { animA, animB } })`.

### Fase 2b medida (19/10, 18:15-18:40 UTC; aceita)

Build: `src/mundo/ossos-textura.js` (novo), `src/mundo/atores-vat-material.js` (novo), `src/mundo/atores.js`
(`criarAtoresVat`; caminho antigo intocado em `criarAtoresSkinned`), `src/config.js` (`desempenho.atoresVat: true`,
`personagem.quantosAtores: 16`), `src/main.js` (chamada + `maresia.atores()`), `src/ui/painel.js` (toggle), 4 linhas em
`criarVersao` (`renderizador.js`: `positionNode` de sombra via `tsl.posicaoSombra`), testes
`ossos-textura`, `atores-vat-material`, `atores-vat` (121/121 no total; build ok).

| Modo (T4, referência) | antes (final6) | VAT desligado (A/B na mesma sessão) | **VAT ligado** |
|---|---:|---:|---:|
| hora parada: FPS / JS | 67,0 / 14,2 ms | 69,0 (67,5–70,7) / 14,2 ms | **79,3–83** (78,4–86,2) / **11,4–12,8 ms** |
| hora andando: FPS / JS | 49,6 / 15,9 ms | — | **56,9** (55,7–57,9) / **13,5 ms** |
| objetos cena + sombra din. | 263 + 97 | 263 + 98 | **252 + 87** |
| draws | 371 | 371 | **349** |

Shader WGSL compilou sem erro (`__shadersQuebrados` vazio, `__faltaPortar` vazio); textura de ossos 112 × 335 (andar +
parado a 30 fps); 6 malhas `atores-*`; 9 SkinnedMesh visíveis (jogador + avôs). Imagem (Mac, `motorPlaca` desligado):
caminho antigo com `atoresVat = false` × `base-sp`: 0 pixel nas 5 cenas; `mascara.py f2-com f2-sem f2-antigo ref-sem`:
0 pixel fora da máscara dos atores em todas as cenas e 0 pixel entre as builds sem atores; dentro da máscara só duas cenas
têm atores: `fundo-manha` 253 px (máx. 53/255; é a sombra de um ator sobre o chão perto do jogador — a sombra VAT
interpola quadros de 30 fps) e `tauacu` 4 px (máx. 9/255). Fotos em `~/claude-f4/otimizacao/fotos/f2-*`.

Limites: só WebGPU (no WebGL `atoresVat` é ignorado e os atores seguem com esqueleto); o crossfade de 0,5 s entre
andar/parado mistura posições, não quaternions; cada ator usa um `AnimationMixer` com clipes vazios da mesma duração como
relógio (tempo, loop e pesos iguais, sem avisos de `PropertyBinding`); `COR_CABELO` fixo em `atores.js` (igual ao
`COR_PADRAO` do esqueleto; acompanhar se mudar); a textura de ossos é assada na abertura (~335 quadros, imperceptível).
Jogo do dono: recarregado com a build final, WebGPU + `motorPlaca` + `atoresVat` ligados, posição/hora devolvidas.

## Robustez no MacBook Air M1 sob carga (meta do dono, 19/10/2026)

Meta de aceite: 1440 × 800 CSS px com DPR 2 (canvas 1800 × 1000 com `resolucao` 1,25), p99 do tempo de quadro ≤ 20 ms e
≥ 95% dos quadros ≤ 16,7 ms (+20%) sob estresse definido, andando e com a hora andando.

### Rig de estresse (`~/claude-f4/estresse/`, roda NA máquina do dono e a deixa lenta durante a medição)
- `rig.sh NIVEL SEGUNDOS [LOG]`: nível 0 = nada; nível 1 = 4 processos de CPU ocupados (Python) + 1 Chrome headless
  com `gpu-carga.html` (shader de 400 iterações por pixel em 1920 × 1080, sem limite de quadro); nível 2 = 8 processos +
  2 páginas. Duração limitada por `timeout`, `trap` em EXIT/INT/TERM mata tudo; registra `vm.loadavg` e `pmset -g
  therm` (CPU_Speed_Limit < 100 = throttling) a cada 15 s.
- `medir_m1.py`: Chrome headless (Playwright, `--use-angle=metal`), 1440 × 800 @ DPR 2, servidor 5190, posição/hora de
  referência fixas (`irPara` + relógio parado) ou regime andando (frente/trás a cada 4 s, hora andando); por rAF: p50/p95/p99,
  % > 16,7 ms, % > 33 ms, picos > 40 ms, FPS, JS por quadro; `--semlimite` tira o vsync (capacidade); `--js` para ablações.
  Linhas JSON em `medidas.jsonl`. `rodada.sh ROTULO "0 1 2" REPS SEG [MATRIZ]` intercala a matriz por nível.
- Não usar `trackTimestamp` do three no M1 (inutilizável); separar CPU de GPU por ablação A/B/A/B intercalada.

### Linha de base (19/10, 16:40-17:10 BRT; o "nível 0" NÃO foi Mac quieto: load 3-6, WindowServer ~47%, Codex ~50%,
`mediaanalysisd` ~33% — carga ambiente real do dono)
| Config (parado, ref.) | vsync 60 Hz: FPS / p50 / p95 / p99 / >33 ms | sem limite: FPS / p50 / p99 / JS p50 |
|---|---|---|
| WebGPU 1,25 (1800×1000), nível 0 | 23,9–42,7 / 20,8–50 / 36–84 / 88–137 / 5–52 % (e uma rodada a 11,6 FPS, p50 107) | 43–51 / 18–19,5 / 46–53 / 18–19 ms |
| WebGL 1,25, nível 0 | 34–41 / 24 / 30–83 / 51–87 / 4–11 % | 40 / 24,5 / 53–55 / 24 ms (JS inclui bloqueio de GPU) |
| WebGPU 1,0 (1440×800), nível 0 | 18–33 / 32–52 / 79–98 / 86–203 / 45–67 % | — |
| WebGPU 1,25 andando, nível 0 | 19–22 / 31–41 / 85–151 / 124–155 / 44–58 % | — |
| WebGPU 1,25, nível 1 | 25,5 / 21,7 / 124 / 145 / 25 % | — |
| WebGL 1,25, nível 1 | **9,3** / 131 / 137 / 143 / 95 % | — |
| WebGPU 1,0, nível 1 | 18,4 / 35 / 148 / 162 / 63 % | — |
| WebGPU 1,25 andando, nível 1 | 19,8 / 34 / 149 / 161 / 53 % | — |

Leitura: com a carga ambiente, o JS do jogo fica em 9-13 ms por quadro (p50) e o tempo de quadro em 20-50 ms — o
quadro trava FORA do JS (GPU disputada com WindowServer/Codex/página pesada, e o pacing do vsync: cada quadro que perde
o vsync vira 33 ou 50 ms). Sem limite de quadro o WebGPU entrega 43-51 FPS (capacidade) e o WebGL 40 com o `render`
bloqueando 24 ms (fila da GPU cheia). Sob nível 1 o WebGL desaba (9 FPS) e o WebGPU resiste melhor (25 FPS), mas ambos
longe da meta; baixar a resolução para 1,0 não devolveu pacing nessas rodadas (variância de carga ambiente domina).
Nenhum dos dois renderizadores é robusto hoje; a variância entre repetições idênticas é enorme (11,6 → 42,7 FPS).

### Ablação de GPU (WebGPU, parado, sem limite de quadro, intercalada ×2; rep 1 com load ~4, rep 2 com load ~6)
| Variante | rep 1: FPS / p50 / p99 / JS p50 | rep 2: FPS / p50 / p99 / JS p50 |
|---|---|---|
| res 1,25 (1800×1000) | 52,0 / 18,8 / 45 / 18,3 | 48,1 / 18,9 / 49 / 18,3 |
| res 1,0 (1440×800) | 58,3 / 16,4 / 39 / 15,9 | 38,8 / 23,4 / 59 / 22,5 |
| res 0,75 (1080×600) | **70,1 / 13,8 / 21 / 13,4** | 35,6 / 22,5 / 96 / 21,6 |
| res 1,25 + sombra 2048 | 50,7 / 18,3 / 47 / 16,9 | 40,1 / 23,1 / 51 / 21,4 |
| res 1,25 + oclusão 0 | 38,1 / 21,7 / 83 / 20,8 | 47,6 / 19,3 / 48 / 18,8 |
| res 1,25 + brilho 0 | 49,0 / 19,1 / 38 / 18,4 | 52,2 / 18,4 / 36 / 17,8 |

Leitura (rep 1, a mais limpa): a resolução é a única alavanca de GPU que rende — 1,25 → 0,75 dá +35% de capacidade e o
"JS" por quadro (que inclui a espera da fila da GPU) cai de 18,3 para 13,4 ms, o piso de CPU sob a carga ambiente;
mapa de sombra 2048, oclusão e brilho desligados não mudam nada mensurável: o custo de GPU está nos passes de tela cheia
(cena MRT em meia-float, passada `tela`), proporcional aos pixels. A rep 2 inteira saiu pior (carga ambiente subiu):
a variância ambiente é maior que qualquer efeito fino, por isso só A/B intercalado vale.

Anomalia do vsync headless: com limite de 60 Hz, baixar a resolução PIOROU monotonicamente (1,25: 41,9 FPS, p50 21,6;
1,0: 31,5, p50 25,7; 0,75: 20,4, p50 47 ms com JS de 10 ms). Mesma observação do coordenador em rodada anterior. A
medida em "regime real" num Chrome headless não é confiável no M1; a capacidade (sem limite) é. Validação do regime real
fica para uma janela visível (Playwright `headless=False`, com o dono de acordo), ao fim.

### Plano de robustez (ranqueado por retorno/esforço)
| # | Item | Expectativa | Custo | Validação |
|---|---|---|---|---|
| R1 | **Resolução dinâmica guiada pelo tempo de quadro** (`cfg.desempenho.resolucaoDinamica`, nasce desligada; `resolucaoMin` 0,6; p75 da janela > 18 ms → −0,1; < 12,5 ms por 2 s → +0,05) | é a única alavanca que se adapta à carga: quando a GPU é disputada, menos pixels devolvem o vsync; esperado p99 ≤ 20 ms no nível 1 com escala ~0,8-1,0, e no nível 2 com ~0,6-0,8; sem efeito quando o limite é CPU | baixo (módulo puro + ligação no `quadro()`) | foto justa 0 px com a chave desligada e com a chave ligada travada (`tamanhoFixo`); `medir_m1.py --resDinamica 1` níveis 1 e 2, lendo `maresia.resolucaoDinamica.escala` |
| R2 | **Qualidade adaptativa além da resolução** (mapa de sombra 4096 → 2048 e oclusão/brilho desligados quando a escala bate no mínimo e o quadro ainda estoura; volta ao normal quando sobra) | cada fatia conforme a ablação abaixo; só entra quando R1 sozinha não basta | médio | mesma medida de R1; foto justa com os cortes desligados |
| R3 | **Custo por pixel do pós** (fundir `claro` no 1º desfoque, 4 desfoques → 2; oclusão já a meia resolução) | ~10-15% do tempo de GPU do quadro (a confirmar na ablação) | médio; muda pixels do brilho (precisa tolerância aprovada) | foto justa com tolerância só no brilho |
| R4 | **Picos de 40-70 ms por alocação/GC**: `animador.js` aloca `Vector3`/`Quaternion` por chamada (`ikDuas`, `apontar`, `girarNoMundo`: `new` dentro do laço de quadro), `getWorldPosition(new Vector3())`, `particulas.js` | tira os picos esporádicos (na T4: 4 picos/30 s coincidindo com queda de heap); não muda o p50 | baixo-médio (vetores reutilizados por módulo) | `medir_m1.py` picos > 40 ms e `performance.memory` ao longo de 60 s; foto justa 0 px |
| R5 | **Abertura**: quadro de ~2 s do pré-aquecimento WebGPU (`preaquecerWebgpu`) | não afeta a robustez em jogo; melhora a abertura | médio (compilar em lotes com `compileAsync`) | tempo até o 1º quadro |
| R6 | **Padrão menor para M1/Air** (`resolucao` 1,0 ou 1,1 quando `devicePixelRatio ≥ 2` e GPU integrada) | decisão do dono (muda a imagem padrão); R1 torna isso menos necessário | trivial | — |

### Leva 8 — R1 (resolução dinâmica, chave desligada) e R4 (animador sem alocações): estado em 20/10
Os dois já estão em commits de outra sessão do dono (85292b0, 60bc4e0). Validação de imagem feita em worktrees
temporários (`/tmp/wt-A` = HEAD 42c9d78; `/tmp/wt-B` = HEAD com os dois commits revertidos sem commit): foto justa
A × B = **0 pixel nas 5 cenas** (R4 tem as mesmas contas; R1 desligada é no-op); testes 177/177 em HEAD, 164/164 em B;
builds ok. Medição de desempenho (A/B `--resDinamica 0|1` nos níveis 1 e 2, e picos > 40 ms com e sem R4) ainda não
pôde ser feita: no momento o Mac estava com load 11-14 por um Chrome headless alheio com `--use-angle=swiftshader`
(helper de GPU a 610% de CPU, 23 min) e o servidor 5190 fora do ar. Um job no Mac espera o swiftshader sair e o load
cair abaixo de 5 e então mede sozinho com servidores próprios (wt-A em 5196, wt-B em 5197); resultados em
`~/claude-f4/estresse/medidas.jsonl` (rótulos `r1` e `r4`). Decisão sobre R2 (qualidade adaptativa) fica para depois
dessa medida. Limpeza pendente ao final: `git worktree remove /tmp/wt-A /tmp/wt-B`.

### Leva 8 — atualização (20/10, 22h40): por que a medida automática falhou, e o que mudou
O job anterior desistiu ("desisti: load { 10.16 10.27 10.87 }") depois de 1h50 sem o Mac esvaziar, mas antes disso
chegou a rodar as rodadas `r1` (níveis 1 e 2, 20:15-20:28) e `r4` (20:30-20:32) — e esses resultados não valem:
1. **Nenhuma linha `r1` entrou em `medidas.jsonl`**: o Vite do job subiu só em `localhost` (IPv6 `::1`) e o
   `medir_m1.py` bate em `127.0.0.1`; a página nunca abriu. Corrigido: todo servidor do job sobe com `--host 127.0.0.1`
   (verificado: `chk` em `/tmp/wt-A`, porta 5210, página aberta, `escala` lida).
2. **As duas linhas `r4` (10,7 e 24,9 FPS, p99 840 e 253 ms) foram medidas com load 11** (Chrome headless alheio com
   `--use-angle=swiftshader`, `scripts/rodar-cenarios-local.mjs`, helper de GPU a 670 % de CPU, órfão há 2h17 com pai
   `launchd`). Descartadas.
3. **O rig não aplicava carga** (ver correção na tabela da linha de base): corrigido e verificado.
4. **Portas**: o `docs/plano-20-10-2026.md` reserva 5195-5197 para as outras sessões. O job novo usa **5210 (wt-A)
   e 5211 (wt-B)**; o 5190 não existe mais (o dev do trunk é o 5195).
5. **Árvores**: o trunk avançou para e8e7989 (praça, bondes, Campo do Urubu, calçamento: o mundo mudou, logo a linha de
   base de desempenho precisa ser refeita nele). `/tmp/wt-A` foi movido para e8e7989; `/tmp/wt-B` para e8e7989 com só
   o R4 (60bc4e0) revertido sem commit (revert limpo: `animador.js` e o teste). O R1 é comparado na mesma árvore pela
   chave (`--resDinamica 0|1`). A foto justa A × B = 0 px foi feita em 42c9d78; como o revert do R4 é o mesmo diff,
   ela vale para a pergunta "o R4 muda a imagem?" — mas a revisão visual em movimento (andar, correr, meia-volta,
   sentar, nadar) ainda não foi feita por ninguém.

**Job novo** (`~/claude-f4/estresse/job-r1r4.sh`, log `job-r1r4.log`): espera load < 4 em 3 leituras seguidas (6 min),
nenhum Chrome headless alheio e nenhum `rodar-regua`/`olhar-jogo`/`rodar-cenarios`/`gravar-aprovacao` rodando (para
não contaminar a medida das outras sessões, já que o rig agora pesa de verdade); prazo 9 h; depois mede
`r1` (níveis 0/1/2 × parado/andando × `--resDinamica` 0/1 × 2 reps, sem limite de quadro) e `r4` (níveis 0/1,
andando, wt-A × wt-B × 2 reps), e derruba tudo (trap). Regime real com vsync continua dependendo da janela visível
(~2 min, autorizada pelo dono — precisa de Mac quieto no mesmo dia).

**Decisões do R1 que estavam delegadas** (viram o briefing R1b, `~/claude-f4/otimizacao/briefing-r1b.md`):
teto = resolução efetiva `min(cfg.resolucao, devicePixelRatio)` (em DPR 1 as descidas de 1,25 até 1,0 eram passos
mortos); a janela zera após qualquer mudança de escala (senão o p75 seguinte julga com quadros da escala antiga e
desce duas vezes); cadência de subida 2 s confirmada (histerese está nos fatores 1,1/0,75, não no tempo).

#### R1b — as três decisões implementadas (21/10/2026; `resolucao-dinamica.js`, bloco R1 do `main.js`, testes)

1. **Teto = resolução efetiva.** O alvo do controlador é `tetoEfetivo(cfg.desempenho.resolucao, devicePixelRatio)`
   (`min(painel, DPR)`, DPR ausente vale 1; função pura exportada, testada sem DOM), na construção e no `redefinir`.
   Motivo: o `main.js` já aplica `min(escala, DPR)` ao desenhar; em DPR 1 com painel em 1,25 as descidas 1,25 → 1,15
   → 1,05 → 1,0 não mudavam um pixel (três passos mortos, 1,5 s de orçamento estourado sem reação). O `redefinir` agora
   também dispara quando o teto efetivo muda (janela arrastada para um monitor de outro DPR), não só quando o painel
   ou a chave mudam.
2. **A janela zera depois de QUALQUER mudança de escala** (descida, subida ou empurrão do `resolucaoMin` subido no
   painel): `n = 0`, `i = 0`. Motivo: o p75 seguinte julgava com quadros medidos na escala antiga (a 30 FPS, com o
   intervalo de 500 ms, metade da janela era do tamanho velho) e o controlador podia descer de novo antes de ver o
   efeito do primeiro passo. Agora a próxima decisão exige 30 quadros medidos na escala nova. O intervalo mínimo de
   500 ms e a espera de 1 s após subir ficam como cintos a mais. Efeito colateral aceito: cada subida passa a custar
   2 s de folga **mais** ~30 quadros de janela vazia (a folga só conta com a janela cheia), ≈ 2,3 s a 10 ms/quadro.
3. **Cadência de subida: 2 s confirmada** (`FOLGA_PARA_SUBIR_MS = 2000`, sem mudança). A histerese está nos fatores
   (1,1 × orçamento para descer, 0,75 × para subir), não no tempo. Fixado por teste (folga contínua de 2000 ms: 1990 ms
   não sobem, 2000 ms sobem; folga interrompida recomeça a contagem).

Sem medição de desempenho e sem foto justa nesta etapa: com a chave desligada nada muda; com ela ligada e a escala
fixa o desenho é o mesmo (o R1 não toca em material nem em cena). A medição A/B do R1 continua sendo do orquestrador.

Revisão do orquestrador (20/10, 23h): diff conferido contra as três decisões, sem desvio; a chave continua desligada
por padrão. Contagem de testes explicada: o HEAD limpo (e8e7989, `/tmp/wt-A` antes do R1b) já tinha 179 (os commits
do dono desde 42c9d78 trouxeram 2), e o R1b soma 8 → 187. Os três arquivos do R1b foram copiados para `/tmp/wt-A` e
`/tmp/wt-B` (só a árvore do job; `git status` dos dois confere), de modo que a medida `r1` do job meça o R1 **com** o R1b
e a `r4` continue tendo o R4 como única diferença entre A e B.

### R4 — validação visual em movimento (20/10, 23h): aceito na imagem
Executor R4-visual, sem editar código do jogo: página `?foto` (pausada), `maresia.passo(1/60)` com relógio parado e
resolução dinâmica desligada, `canvas.toDataURL` após cada desenho, 1800×1000, WebGPU, árvores `/tmp/wt-A` (com R4) e
`/tmp/wt-B` (sem R4), rodadas A1, B1, A2. 14 poses: parado, andar 1,5/3 s, correr 1,5/3 s, meia-volta (+10/+20/+40
quadros, correndo), parado depois, nadar 1/2 s, sentar 0,5/1,5 s, sentado 3,5 s. Material em `~/claude-f4/estresse/ab/`
(PNGs, `meta.json`, `ab.py`, `cmp.py`). Posições e velocidades por captura idênticas nas três rodadas.

Resultado (recontado pelo orquestrador, pixel com qualquer canal ≠ 0, e separado por faixa vertical):
- **Abaixo de y = 280 (onde está o personagem): 0 pixel diferente em A × B em todas as 14 poses** (exceção: 3 px em
  "correr 1,5 s" entre A2 × B1, y ≤ 347 — os mesmos 3 px aparecem em A1 × A2, logo são ruído, não R4).
- Acima de y = 280 (céu/horizonte): 3 a 86 px por pose em A × B, e 1 a 45 px em A × A; canal máximo 8/255. É o piso de
  ruído da própria cena entre duas rodadas idênticas (o mesmo que o dono registrou no plano: a foto não é bit a bit
  reprodutível), confinado ao alto da imagem.
- Nadar e sentar: 0 px em todas as comparações, inclusive A × A.

Leitura: o R4 só reescreve as contas do animador (ossos do jogador); se tivesse mudado a pose, a diferença apareceria
no personagem, e ali não há nenhuma em nenhuma pose. A comparação A × B no alto da imagem é inconclusiva por definição
(ruído = sinal), mas é irrelevante para o R4. **Decisão: R4 aceito na imagem**; a revisão a olho do dono (~2 min:
andar, correr, meia-volta) passa a ser confirmação opcional, não portão. O que falta do R4 é só a medida de picos
(> 40 ms) com e sem ele, que está no job `r4`.
Nota de método para a foto justa: o critério "0 pixel" vale para a região que a mudança pode atingir; o alto da
imagem tem ruído próprio de até 8/255 e precisa ser comparado contra uma rodada repetida do mesmo código.

### Defeito do motor: malha com atributo `color` por vértice some no WebGPU (21/10, dono do mapa 1932)

**Sintoma.** Uma malha que tem o atributo de cor por vértice (`color`) e usa material com
`vertexColors: true` (no jogo, `toonVertice()` de `src/materiais.js`) **desaparece** no WebGPU: a
geometria não é desenhada. A mesma malha **sem** o atributo `color`, com o mesmo material, aparece
normalmente (na cor de reserva, o branco). No WebGL as duas aparecem.

**Como reproduzir** (Chrome headless, WebGPU sobre Metal, na árvore do mapa 1932):

1. Uma malha de teste com o atributo `color` e material `toonVertice()` some da imagem.
2. A mesma malha sem o atributo `color` aparece (branca).
3. Material sem vertex colors (`toon('#...')`) na geometria com `color`: **aparece** (é o contorno
   usado no item 4 dos bondes: o trilho e as travessas do bonde foram feitos com material liso e
   geometria sem cor por vértice).

O achado veio do trilho do bonde, que não aparecia no WebGPU. A suspeita inicial era o tamanho
(malha com 178 mil vértices, `mergeGeometries`, índice grande): todas essas hipóteses foram
descartadas por A/B — uma caixa de teste de 24 vértices, na mesma posição e com o mesmo material,
também sumia com o atributo `color` e aparecia sem ele.

**Contorno usado no jogo**: material sem vertex colors (`toon('#...')`) e/ou geometria sem o
atributo `color`. Onde a peça precisa de duas cores, são duas malhas (uma por material) em vez de
uma malha com cor por vértice.

**Limite do achado (importante para quem for investigar)**: **não é universal**. O coreto e os
canteiros da Praça do Ferreira usam a mesma dupla (`colorir()` + `toonVertice()`) e **aparecem** no
WebGPU; a caixa de teste, com a mesma dupla, **some**. Ou seja, o defeito depende da malha (ou do
momento em que o material é convertido), não do par atributo+material sozinho. Por isso o bug
**não foi corrigido aqui** (é do motor): o registro é o sintoma, a reprodução e o contorno, para a
sessão do motor decidir o conserto.

**Onde isso foi decidido**: `docs/mapa-1932.md` v7 (item 4, os bondes) e o commit dos bondes.
