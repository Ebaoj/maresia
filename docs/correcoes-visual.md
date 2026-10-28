# Correções visuais (27/10/2026)

Branch `visual/correcoes` (a partir de `3b2b4cf`, o relatório `docs/relatorio-visual.md`). O Joabe aprovou corrigir.
Regra deste trabalho: **nenhuma correção baixa a resolução**. Seis commits, um por correção, na ordem pedida; depois de
cada um, `npm test` e `npx vite build --base=/maresia/` passaram.

## Commits

| # | Commit | O quê |
|---|---|---|
| 1 | `9d6ed62` | Grão parado (sem `uTempo`), GLSL e TSL |
| 2 | `0ffb076` | Governador pela régua do custo do quadro; sobe pela mesma régua com histerese; escada sem `sem-estabilizar`, `sem-dof`, `pincelada-meia`; números da escada em 0,5 s |
| 3 | `5c54386` | Relógio: abre às 15 h, anda 0,1 h por minuto real |
| 4 | `a471989` | SMAA 1x depois da estabilização e antes do desfoque e da pincelada (WebGL e WebGPU) |
| 5 | `86777a0` | Pincelada (Kuwahara): 21 amostras, raio em px CSS, tensor borrado, anisotropia só com gradiente, borda pintada |
| 6 | `8c650b0` | LOD com pontilhado preso ao mundo (casas, árvores), histerese nas células de muito longe, ruído da faixa de luz com `fwidth`, sombra de perto todo quadro |

Cada um tem teste de unidade que pega a volta do problema (visto falhando no `3b2b4cf`): `pisca-grao`, `governador`
(6 novos) e `custo-quadro`, `relogio`, `smaa`, `pincelada`, `lod-pontilhado`. Total: 517 testes passando.

## Como foi medido (e o limite disso)

Linux desta máquina, Chrome sem janela com **SwiftShader** (placa de software), WebGL, 960 × 540, pixel ratio 1, a
mesma vista do relatório (Praça do Ferreira, x 4240,84, z 2164,09, câmera 0 rad, 15 h, distância 5, inclinação 0,2).
Cada commit rodou numa worktree própria com o próprio servidor. Scripts:
- `scripts/diagnostico/pisca-linux.mjs` (16 quadros por situação; nova situação `raf-varre`, que muda a distância de
  troca de LOD com a câmera e o tempo parados), `scripts/diagnostico/pares.py`, `scripts/pisca-mapa.py`
  (`--compensar` no giro);
- `scripts/diagnostico/custo-linux.mjs` (novo): custo do quadro com o laço pausado, `passo(1/60)` e espera da placa
  (leitura de 1 pixel), variantes alternadas na mesma página;
- `scripts/diagnostico/governador-60hz.mjs` (novo): o mesmo traço de custo nos dois governadores, a 60 e a 120 Hz.

**Limites**: o SwiftShader desenha na CPU. Vale a imagem e a **comparação** entre variantes, não o número em ms (cada
quadro leva ~1,5 s), e o custo relativo dos passes é o de um rasterizador de software, não o do M1. Diferenças abaixo
de ~5% estão no ruído (a mesma variante variou 1500-1780 ms entre rodadas). O governador não age no SwiftShader
(quadro > 100 ms é pico); a correção 2 foi medida no replay.

## Antes e depois

### Pisca (Praça, 16 quadros por situação)

Diferença média entre quadros vizinhos (0-255) e o pior par; pisca = pixel que muda > 24 e volta (`pisca-mapa.py`),
em % dos pixels por quadro (todos / borda / liso). `raf-giro` com `--compensar`.

| Commit | vivo-parado: dif. média (pior) | raf-tempo: dif. média (pior) | raf-tempo: pisca | raf-giro: pisca (todos / borda / liso) |
|---|---|---|---|---|
| `3b2b4cf` (antes) | 1,64 (3,63) | 1,15 (3,57) | 0,0129% | 0,229 / 0,810 / 0,054% |
| 1 grão parado | **0,34** (0,41) | **0,27** (0,34) | 0,0086% | 0,224 / 0,790 / 0,054% |
| 4 SMAA | 0,35 (0,40) | 0,26 (0,29) | 0,0125% | 0,236 / 0,853 / 0,052% |
| 5 pincelada | 0,33 (0,38) | 0,25 (0,28) | 0,0115% | 0,214 / 0,731 / 0,043% |
| 6 LOD, luz, sombra (final) | **0,33** (0,37) | **0,24** (0,29) | 0,0120% | **0,209 / 0,716 / 0,042%** |

- O pulso de tela inteira de 8 Hz (pares de 3,5 a cada 1/8 s) sumiu com o grão parado: a diferença média entre quadros caiu
  4 a 5 vezes e o pior par 10 vezes.
- O SMAA sozinho subiu um pouco o pisca de borda (0,79 → 0,85%): ele é espacial, sem memória, e decide a borda de
  novo a cada quadro. A pincelada nova e o `fwidth` da faixa de luz mais que compensaram: no fim, o giro tem 9% menos
  pisca que o antes (22% menos no liso).
- Os commits 2 e 3 não mudam a imagem nessas situações (o governador não age no SwiftShader e a hora está presa em 15 h).
- Arquivos: `docs/capturas/correcoes/{0-base,1-grao,4-smaa,5-pincelada,6-lod-luz-sombra}/` (`pares.json`,
  `pisca-*.json`, `mapas/`, `difs/`, um quadro de cada situação).

### Troca de LOD (câmera parada, distância de troca andando: `raf-varre`)

Casas: `casasPerto` de 50 a 64,5 m em passos de 0,5 m (30 quadros), troca seca (`casasDissolve` 0, o comportamento
antigo) contra o pontilhado (6 m). Diferença média de cada par de quadros vizinhos:

| Variante | Par da troca do bloco | Resto dos pares |
|---|---|---|
| Troca seca | **0,71** num só par (o bloco inteiro de uma vez) | 0,01-0,09 |
| Pontilhado | sem salto: a troca se espalha por ~16 pares | 0,055-0,086 |

O pontilhado ainda tem um par de 0,92: é a **junção das células de muito longe** (as caixas de casa juntas numa malha
só), não a troca de LOD. O desenho das janelas da caixa é sorteado por `gl_InstanceID` (`materialPredio`), e o índice
da cópia muda quando as cópias se juntam. Isso já acontecia antes (a junção é a 78 m + folga; agora 84 m + folga) e
caiu dentro desta varredura porque o limite andou 6 m. **Não foi corrigido** (ver riscos). Varredura grossa (árvores
2 m e casas 3 m por quadro): pior par 1,43 → 1,05.
Arquivos: `6-lod-luz-sombra/varre-casas-0.5m-pares.json`, `varre-lod-pares.json`, `varre-casas-difs/`,
`faixa-larga-webgl-cima-webgpu-baixo.png` (faixa larga forçada, para ver o pontilhado nos dois renderizadores).

### Governador (replay de 6 min, `2-governador/`)

Traço: custo base 9-12 ms, um trecho pesado de 25 s a cada 2 min (20-28 ms), cada degrau poupando uma fração do custo.

| | Antigo (`3b2b4cf`, intervalo do rAF) | Novo (custo do quadro) |
|---|---|---|
| 60 Hz: degrau no fim | `pixel-0.8` (resolução cortada e não volta) | `sombra-perto-leve` (nunca tocou a resolução) |
| 60 Hz: tempo no cheio fora do trecho pesado | 25,6% | **68,7%** |
| 120 Hz: tempo no cheio fora do trecho pesado | 25,6% | **76,3%** |
| Passou por `sem-estabilizar` / `sem-dof` / `pincelada-meia` | sim | não existem mais |

### Custo do quadro (SwiftShader, só comparação)

`3b2b4cf` contra o final, em rodadas alternadas A B A B (16 quadros cada): **1525 → 1714 ms (+12%)**
(`custo-base-*.json`, `custo-final-*.json`). Variantes no final, alternadas na mesma página, 18 quadros cada
(`custo-variantes-final.json`):

| Variante (no final) | Mediana (ms) | O que diz |
|---|---|---|
| final | 1730 | |
| sem SMAA | 1644 | SMAA ≈ 5% |
| sem pincelada | 1644 | pincelada inteira ≈ 5% |
| pincelada com 12 amostras | 1642 | 21 amostras custam ~o mesmo que a pincelada inteira aqui (no ruído) |
| tensor sem borrão | 1808 | no ruído (mais lento que o final) |
| sombra de perto a cada 2 | 1697 | ≈ 2% (outra rodada, 24 quadros por variante: 1570 → 1688, +7,5%) |
| LOD seco | 1747 | no ruído |

Antes de corrigir, no `86777a0` (pincelada nova, sem LOD): com pincelada 1821, sem 1542.

### Imagens

- `docs/capturas/correcoes/praca-antes-depois.png`: a Praça às 15 h, mesma vista, `3b2b4cf` × final;
  `praca-antes-depois-zoom.png`, o recorte ×2 (meio-fio e silhueta do menino sem escada, fachada pintada sem moldura
  crua).
- `4-smaa/zoom-webgl-sem-com.png`, `zoom-webgpu-sem-com.png`: sem × com SMAA, nos dois renderizadores.
- `5-pincelada/praca-sem-antiga-nova.png`, `fachada-sem-antiga-nova.png`: sem pincelada × antiga × nova.
- `3-relogio/abrir-e-dois-minutos.jpg`: o que se via ao abrir e dois minutos depois. Cor média do canteiro do meio
  (recorte do relatório): antes 62/56/43 ao abrir (16,6 h) e **35/19/18** dois minutos depois (18,6 h); agora
  103/103/70 ao abrir (15 h) e 102/102/69 dois minutos depois (15,2 h).

## Valores escolhidos

- **Grão**: parado (hash só da posição na tela), `arcGrao` 0,04 e `grao` 0,045 mantidos. Parado ele é textura de papel.
- **Governador**: régua = `max(CPU do passo, placa)`. Placa: `onSubmittedWorkDone` no WebGPU;
  `EXT_disjoint_timer_query_webgl2` no WebGL quando existir (`cfg.desempenho.cronometroGpu`, no painel; resultado
  disjunto ou > 100 ms fora). Desce: p95 > 1,3 × 16,7 ms por 3 s (resolução pede também p50 > 0,95 ×). Sobe: p95 + ganho
  < 1,0 × e p50 + ganho < 0,8 × por 8 s, onde "ganho" é quanto a descida poupou (medido na primeira janela cheia depois
  dela, esquecido com constante de 30 s). A espera dobra só se a descida vier até 20 s depois da subida. Escada:
  cheio → sombra-perto-leve (sombra de perto 512 e a cada 2 quadros) → distância → LOD → sem sombra de perto →
  pixel 0,9 / 0,8 / 0,75 (0,65 / 0,5 em emergência). Distâncias e corte vão ao valor novo em 0,5 s (5 degraus de
  0,1 s, não por quadro: o muito longe refaz as listas quando `cortePx` muda). O contador de FPS mostra o degrau.
- **Relógio**: `tempo.hora` 15, `tempo.velocidade` 0,1 (10 min reais por hora de jogo; das 15 às 17 h em 20 min).
  A hora salva no painel não vale ao abrir; `?hora=9.5` escolhe. Quem salvou a velocidade 1,0 antiga passa a 0,1.
- **SMAA**: `cfg.estilo.smaa` ligado, limiar 0,1 na raiz quadrada da cor, alfa (peso do traço) do próprio pixel.
- **Pincelada**: `arcPinturaAmostras` 5 (21 amostras; a grade 4 dava só 4 amostras por um corte `|v| <= 1` exato,
  não 12), `arcPinturaRaio` 2,5 px CSS, `arcPinturaNitidez` 7, `arcPinturaAnisoLimiar` 0,04,
  `arcPinturaBordaRaio` 0,35, `arcPinturaSuavizar` ligado (gaussiana de 5 amostras, sigma 2 px).
- **Faixa de luz**: oitava some entre 0,25 e 0,5 volta por pixel; borda da faixa `max(arcSuave, fwidth(t))`.
- **LOD**: árvores `lodDissolve` 8 m em volta de `lodBloco` 90; casas `casasPerto` 70, `casasDissolve` 6;
  `dissolveCelula` 0,05 m. Muito longe: refaz a cada 4 m, histerese de 12%.
- **Sombra de perto**: `sombraPertoACada` 1.

## Riscos e o que não foi verificado

- **Nada disto rodou no Mac** (M1, Retina, Metal). Falta: a suíte `node scripts/rodar-cenarios-local.mjs` (é do Mac, com
  a GPU real), `maresia.medir` com variantes alternadas, e olhar a imagem na tela Retina. Em especial:
  - **cronômetro da placa no WebGL do Mac**: o CLAUDE.md diz que ele dá números incoerentes no medidor. Se o
    governador descer sem motivo no Mac, desligar `cronometroGpu` no painel (fica só a CPU do passo, que no WebGL não
    vê a placa: aí o governador só desce por CPU);
  - custo real do SMAA, da pincelada de 21 amostras e da sombra de perto todo quadro no M1 (no SwiftShader: ~5%, ~5% e
    2-7,5% do quadro). Se a soma pesar, o governador agora desce primeiro a sombra de perto (a cada 2 quadros, 512);
  - o pontilhado das trocas de LOD a 5 cm é menor que um pixel a 70-90 m: com a câmera parada e um bloco dentro da faixa
    (12 m de largura), o bloco fica com um granulado parado (não pisca: é preso ao mundo). Andando, vira transição.
- **Não feito**: passe final em resolução nativa e aumento com nitidez (`tetoRetina` continua 1,0 no médio): adiado,
  como pedido, porque não deu para medir no M1. A **junção das células de muito longe** muda o desenho das janelas das
  caixas (sorteio por `gl_InstanceID`): achado aqui, não corrigido. Pontilhado nas trocas das células de muito longe
  (cheia / simplificada / mancha / corte): só ganharam histerese e passo de 4 m, sem pontilhado. Grama (encolher antes
  de sumir), bloom em cadeia, sombra das copas fora do cache e faixa perto/longe da sombra em metros (itens 10-12 do
  relatório) ficaram de fora.
- A casa detalhada passou a ter a malha centrada no bloco (a origem é a âncora do pontilhado). Quem ler a geometria
  dela esperando coordenada do mundo sem a matriz do objeto vai errar; no código atual ninguém lê.
- A sombra em cache fica com as duas versões na faixa de troca (a união das duas silhuetas); a sombra de perto também.
- O teste do governador mede a lógica; a ligação com o laço (o custo do quadro anterior entrando no lugar do intervalo
  do rAF) tem um teste que lê o `main.js`.
