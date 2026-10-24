# Fluido no M1 (22 e 23/10/2026)

Branch `fluido`, a partir de `integracao` 97cd743. Pedido: o jogo fluido no Mac do Joabe (M1 de 8 GB) nas vistas mais
cheias: meta de 60 fps (16,7 ms), no mínimo 45 fps estáveis (22 ms) sem tropeço, na vista da Coluna da Hora, na da
Praça dos Leões, numa rua do Centro, no Campo do Urubu e andando entre elas.

## Como foi medido

- Tudo no Chrome sem janela, WebGPU em Metal, **neste M1 de 8 GB** (o mesmo modelo do Joabe), janela 1600 × 900 com
  escala de dispositivo 1,25: o desenho sai em **2000 × 1125** (a mesma conta de `docs/desempenho-22-10.md`).
- Corredor: `scripts/fluido.mjs` (abre o Chrome, espera o jogo, chama as funções de `scripts/fluido-pagina.js` dentro
  da página). Espera o Joabe parar de jogar (conexão na 5300) e qualquer outro Chrome sem janela; recusa porta ocupada.
- Os 4 lugares (`lugares()` em `fluido-pagina.js`): `VISTAS.colunaHora` (16h30), `VISTAS.leoes` (9h30), a rua do Centro
  (a rua da grade, sentido da Major Facundo, com o trecho mais longo de rua ao norte da praça, a 220 m dela olhando
  para ela, 16h30) e `VISTAS_URUBU.urubuCozinha` (9h30).
- **Custo por passe, por vazão** (`custoPasses`): depois de um quadro normal, cada passe do pós é repetido 30 vezes
  seguidas com as mesmas entradas, e uma leitura de 1 pixel espera a placa; custo = (tempo − leitura sozinha) / 30. A
  cena é medida igual (o passe principal sem a sombra, que o three só refaz uma vez por quadro). A sombra sai da
  diferença para o quadro inteiro. O cronômetro do WebGPU (timestamp-query, com `--enable-webgpu-developer-features`)
  dá números sem sentido por passe neste M1: 246 ms somados num quadro de 38 ms (a placa de ladrilhos sobrepõe os
  passes, e o começo de cada um conta a espera do anterior). Não usar.
- **Quadro inteiro**: `maresia.medir`, variantes alternadas na mesma rodada, mediana de 5 repetições. Mudança que não
  dá para ligar e desligar ao vivo: rodadas alternadas com o servidor trocando de código (`git apply -R` / `git apply`
  do mesmo remendo, ANTES, DEPOIS, ANTES, DEPOIS).
- **Triângulos e chamadas por objeto e por passe** (`triangulos`): o three soma em `info.update` a cada desenho; a
  sombra é desenhada dentro do passe principal, então a conta usa a pilha de contextos de desenho.
- **A máquina**: dividida com outros agentes a noite toda (load de 2 a 39, swap de 4,5 GB de 6, outros Chrome sem
  janela na fila). Os números absolutos variam entre rodadas; as comparações valem só dentro da mesma rodada.

## Para onde vai o quadro (antes, 97cd743)

Custo por passe por vazão, ms, 2000 × 1125 (uma rodada; a Coluna foi medida duas vezes, 37,3 e 38,7 ms):

| passe | Coluna | Leões | rua | Campo |
|---|---:|---:|---:|---:|
| **quadro inteiro** | 37,3 | 36,5 | 33,4 | 27,6 |
| cena (MRT cor + luz), sem a sombra | 24,0 | 22,8 | 26,4 | 16,9 |
| sombra (sol + perto) e o resto (diferença) | 5,2 | 6,1 | ~0 | 3,0 |
| tela: quadrinho final (traço, retícula, gradação) | 3,75 | 2,98 | 3,24 | 3,25 |
| profundidade de campo (9 passes, ½ e ¼) | 1,35 | 1,54 | 1,39 | 1,34 |
| pincelada: Kuwahara (cheia) | 1,01 | 1,01 | 1,05 | 1,04 |
| estabilização no tempo | 0,84 | 0,85 | 0,84 | 0,82 |
| oclusão (½) | 0,58 | 0,62 | 0,58 | 0,53 |
| brilho: desfoque ×4 (¼) | 0,30 | 0,24 | 0,25 | 0,33 |
| pincelada: tensor (½) | 0,17 | 0,26 | 0,17 | 0,13 |
| brilho: limiar (¼) | 0,13 | 0,13 | 0,11 | 0,21 |
| **pós inteiro** | 8,1 | 7,6 | 7,6 | 7,7 |
| chamadas de desenho (cena + sombras) | 1.024 | 1.118 | 849 | 431 |
| triângulos (cena + sombras) | 12,0 M | 12,3 M | 11,2 M | 8,7 M |

A interface (o HUD e o painel são DOM) não entra nesta conta: fica com o compositor do navegador.

**O que isso diz.** O pós inteiro custa ~8 ms; a cena, 17 a 26 ms. E a cena quase não depende dos pixels: na Coluna,
com um quarto dos pixels (1000 × 563) a cena cai só de 25,3 para 19,5 ms e o quadro de 37,8 para 25,5 ms. O M1 está
preso no **vértice**: 9 milhões de triângulos no passe principal e 3 milhões nas sombras, na Coluna. A resolução mexe
em ~12 ms de 38; o resto é geometria.

De onde vinham os triângulos (Coluna, passe principal, 9,0 M):

- miúdo de longe nas células de muito longe: 4.900 lampiões de coluna (264 triângulos cada) a 0,4-3 km, 5.900 vasos,
  1.900 buganvílias, travessas do bonde, dormentes, portões, cadeiras, cercas, os vidros dos lampiões;
- o Campo do Urubu inteiro a 2 km (`urubu-obra`, 716 mil em 56 blocos);
- as copas de longe mascaradas (`*-longe-mascarado`), e entre elas **659 mil triângulos de cópias de escala zero**
  (um defeito, abaixo);
- a gente (`pessoas`, 418 mil, de outro agente), que entra também nos dois mapas de sombra (1,25 M ao todo);
- no mapa de perto (2,1 M), blocos de 192 a 768 m de árvores e casas inteiros porque a esfera do bloco encosta na
  janela de 48 m.

Quanto cada um custava (variante que esconde, mesma rodada, ms por quadro, máquina com load 4-5):

| variante | Coluna | Leões | rua | Campo |
|---|---:|---:|---:|---:|
| tudo | 56,7 | 56,6 | 41,0 | 30,6 |
| sem as malhas de muito longe | 34,0 | 42,6 | 32,3 | 29,6 |
| sem as copas de longe mascaradas | 42,6 | 45,8 | 37,3 | 29,3 |
| sem a obra do Urubu | 48,1 | 52,7 | 42,4 | 32,1 |
| sem `pessoas` | 50,2 | 43,1 | 40,1 | 29,8 |
| sem o mapa de perto | 44,0 | 45,9 | 37,7 | 31,6 |
