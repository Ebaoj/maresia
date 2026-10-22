# Controle "travado": medição e correção (22/10/2026)

O Joabe achou o controle do personagem duro, "travado", sem saber se era a animação ou outra coisa.
Medido com números antes de mexer. Branch `controle`, a partir de 2b0cc97.

## Como foi medido

- **Resposta e curvas**: o jogo roda em passo fixo de 1/60 s (`maresia.passo(1/60, false)`, laço pausado),
  sem depender do FPS da máquina. Cada roteiro parte do parado no meio da praia da fatia (areia seca,
  velocidade 0,86 × 1,8 = 1,55 m/s andando, 3,87 m/s correndo), câmera de lado para a praia (yaw π/2).
  Por quadro: velocidade da raiz, yaw desenhado, **corpo visível** (a linha entre as coxas, como nos
  cenários, com média centrada de 0,25 s para tirar o balanço da passada sem atrasar), quadril, pés e câmera.
- "q" = quadros de 1/60 s depois do quadro em que a tecla entrou (0 = no mesmo quadro). O ms soma 1 quadro
  (a imagem só sai no desenho). Não inclui o atraso do navegador e da tela (mais 1 a 3 quadros em qualquer jogo).
- Referência de terceira pessoa: resposta visível em 100 a 150 ms; virar 90° andando em ~0,2 a 0,3 s;
  meia-volta em ~0,4 a 0,6 s nos jogos de animação pesada.
- Scripts de medição ficaram fora do repositório (rascunho da sessão); o roteiro está descrito aqui.

## O que travava (por ordem de peso)

1. **Curva de 90° andando parava o corpo** (o pior). O motion matching escolhia o "virar no lugar"
   (`mm-virar-esq/dir`, 93° em ~1 s, sem sair do lugar) e o controle travava a velocidade em 30% durante o
   clipe inteiro. Do parado para o lado, o clipe ainda emendava um virar para o outro lado: 1,2 s até andar.
2. **O corpo seguia a direção a 3/s** com o motion matching ligado (`controle.js`, a correção do yaw), e
   seguia a **velocidade** (que já leva ~0,2 s para virar), não a tecla: dois atrasos em série. Uma curva de
   45° levava 0,48 s até 90%, e o zigue-zague só chegava a 39° dos 45° pedidos.
3. **O giro só acontecia 12 vezes por segundo** (relógio do controle em `fpsPose`), fora do tempo da pose,
   que no Arcane sai 24 vezes por segundo.
4. **Meia-volta esperava o clipe** (`mm-volta-andando`, 158° no lugar, 90% em 0,83 s) a 30% da velocidade.
5. **Parada lenta**: freada e arrancada a 10/s, 0,3 s de raiz deslizando ao soltar a tecla.
6. **Busca do motion matching 10 vezes por segundo**: até 100 ms entre a tecla e o movimento novo.

Não eram causa: a arrancada (raiz a 90% em 0,2 s, igual antes e depois), o pulo (sobe no quadro da tecla),
a câmera (o alvo segue a 8/s; sai 1 cm em 4 quadros na arrancada e não gira sozinha com o corpo).

## Antes e depois (passo fixo de 1/60 s, mesma praia, padrão do config)

| Movimento | Medida | Antes | Depois |
|---|---|---|---|
| Arrancar | raiz se mexe / raiz a 90% | 0 q / 12 q (217 ms) | 0 q / 13 q (233 ms) |
| Arrancar | quadril visível anda 2 cm | 1 q (salto de 7 cm na 1ª pose) | 4 q (contínuo: 0,7, 1,8, 1,8, 2,9 cm) |
| Parar | raiz parada (< 5 cm/s) | 18 q (317 ms) | 12 q (217 ms) |
| Parar | quadril visível parado | 33 q (567 ms) | 30 q (517 ms) |
| Parar correndo | raiz parada / quadril parado | 23 q / 36 q | 16 q / 30 q |
| Curva 45° andando | corpo 50% / 90% | 13 q / 29 q (500 ms) | 5 q / 16 q (283 ms) |
| Curva 90° andando | corpo 50% / 90% | 23 q / 38 q (650 ms) | 5 q / 16 q (283 ms) |
| Curva 90° andando | menor velocidade no giro | 0,46 m/s (30%) | 1,09 m/s (70%) |
| Curva 90° correndo | corpo 90% / assenta | 44 q / 33 q | 22 q / 10 q |
| Meia-volta andando | corpo 50% / 90% | 25 q / 49 q (833 ms) | 10 q / 30 q (517 ms) |
| Meia-volta correndo | corpo 50% / 90% | 23 q / 36 q (617 ms) | 11 q / 21 q (367 ms) |
| Do parado para o lado | raiz a 90% / corpo assentado | 72 q (1,2 s) / 59 q (passava do ponto e voltava) | 13 q / 10 q |
| Do parado para trás | raiz a 90% / corpo 90% | 57 q / 37 q | 35 q / 28 q |
| Zigue-zague ±45° a cada 0,5 s | atraso do corpo / amplitude | 10 q (183 ms) / 39° | 4 q (83 ms) / 44° |
| Disparada | raiz a 90% da corrida | 12 q | 13 q |
| Pulo | raiz e quadril sobem | 0 q | 0 q |

Primeira mudança visível do corpo (5° de giro) depois da tecla: antes 1 a 7 q, depois 0 q em todas as curvas.

### Pé apoiado escorregando (o preço da resposta)

Velocidade horizontal do pé apoiado medida em janelas de 5 quadros (2 poses), mediana / p90 em m/s:

| | Antes | Depois |
|---|---|---|
| curva 90° andando | 0,68 / 1,34 | 0,40 / 1,34 |
| do parado para o lado | 0,41 / 1,25 | 0,27 / 0,54 |
| curva 90° correndo | 1,33 / 3,01 | 0,95 / 2,32 |
| zigue-zague | 0,64 / 1,43 | 0,69 / 2,17 |
| meia-volta andando | 0,38 / 1,31 | 0,67 / 1,34 |

A curva e a saída para o lado escorregam menos (o clipe de virar no lugar com a raiz andando escorregava).
A meia-volta e o zigue-zague escorregam mais: a raiz já sai para o lado pedido enquanto o pivô gravado ainda
gira. É a troca pedida (raiz responde, a animação alcança); se incomodar no vídeo, `velNoGiro` mais baixo e
`ritmoGiro` mais perto de 1 devolvem o peso.

## O que mudou (cada número no `config.js`, seção personagem, e no painel Personagem > Movimento)

- `giroAndando` 10 (era 3 fixo): o corpo encara a direção pedida andando. O alvo do giro passou a ser a
  **direção da tecla**, não a da velocidade.
- O giro do corpo novo acontece **no quadro em que o animador desenha a pose** (`Animador.vaiPosar`), com as
  taxas no tempo de verdade desde o último giro (antes, 12 vezes por segundo fixo).
- `aceleracao` 10 e `frenagem` 16 (antes os dois 10), com aproximação exponencial no tempo (antes `dt × taxa`,
  que mudava com o FPS).
- `giroClipeMin` 2,2 rad: o giro gravado (meia-volta e virar no lugar) só a partir de 126°. Antes valia só
  para a meia-volta; o virar no lugar entrava em qualquer curva.
- `ritmoGiro` 1,5: o giro gravado toca 1,5× mais depressa (as mesmas poses do mocap, nenhuma inventada).
- `velNoGiro` 0,3: no giro gravado, a velocidade é `max(velNoGiro, cos(o que falta girar))`: de costas 30%,
  cresce conforme o corpo encara. Antes, 30% o giro inteiro.
- `mmBuscaNaHora`: o motion matching procura no quadro em que o pedido muda (direção mais de 20°, ou
  velocidade mais de 0,8 m/s), sem esperar a próxima das 10 buscas por segundo.

Teste novo: `testes/unidade/controle-resposta.test.js` (curva de 90° em 0,3 s, raiz no primeiro quadro,
parada em 0,2 s), visto falhando no código de antes (47° faltando depois de 0,3 s; 0,20 m/s depois de 0,2 s).

## FPS real andando (laço de verdade, Chrome sem janela, WebGPU, 1280 × 720)

**Não vale como linha de base**: a máquina estava com load de 5 a 24 (vários agentes renderizando ao mesmo
tempo). Andando 3 s, zigue-zague 3 s e correndo 3 s em cada lugar:

| Lugar | FPS | ms p50 / p95 / p99 / máx | quadros > 50 ms | > 100 ms |
|---|---|---|---|---|
| praia da fatia | 24 a 31 | 30 / 56 / 83 / 110 (1ª rodada) | 20 | 1 |
| Coluna da Hora | 13 a 20 | 41 / 143 / 315 / 347 | 49 | 11 |
| Mercado | 16 a 26 | 38 / 46 / 51 / 55 | 3 | 0 |
| Praça dos Leões | 12 a 16 | 60 / 108 / 189 / 277 | 103 | 11 |
| Campo do Urubu (cozinha) | 15 a 24 | 39 / 82 / 116 / 132 | 43 | 7 |
| Estação | 12 a 17 | 42 / 88 / 155 / 1768 | 54 | 7 |

- CPU do controle + animador: p50 1 ms, p99 6 a 15 ms; câmera p50 0,2 a 1,6 ms com picos isolados de 19 a
  195 ms (raios contra os sólidos; o número de sólidos não mudou nos picos, então não é BVH nova sendo
  montada; com a máquina carregada não deu para separar de preempção do sistema). O resto dos picos de
  quadro (até 1,7 s) vem do desenho, não do controle.
- Lixo: 11 a 23 MB/s coletados andando (quedas do heap). Coleta menor a cada ~100 ms; não apareceu como pico.
- **Dependência do FPS que pesa**: `main.js` limita o passo a 1/20 s. Abaixo de 20 FPS o jogo inteiro anda em
  câmera lenta (a 13 FPS, ~65% da velocidade) e cada tecla leva mais 2 a 3 quadros de 70 ms até a tela.
  Com a máquina carregada, isso sozinho deixa o controle pesado. Não mexido aqui (é o laço do jogo inteiro:
  física, partículas, ondas); fica como pendência medir numa máquina ociosa.

## Vídeos

`docs/capturas/controle/antes-em-cima-depois-embaixo-{partida-parada,giro90,giro180,zigue,disparada}.mp4`
(gravador de passo fixo a 30 quadros por segundo, câmera do jogo; antes em cima, depois embaixo).

## O que não foi verificado

- Sensação na mão do Joabe (teclado, monitor, máquina dele): só números e vídeo.
- FPS e picos com a máquina ociosa.
- Água, nado, carregando objeto e indo sentar: o caminho do código é o mesmo, sem roteiro medido.
- O visual quadrinho (`estilo.visual` diferente de 'arcane', pose a 12 por segundo andando): o giro segue o
  ritmo da pose, então lá vira 12 vezes por segundo como antes.

## Testes

- `npm test -- --maxWorkers=4`: 55 arquivos, 351 testes passando (uma rodada com load 14 reprovou 2 arquivos
  por tempo; repetida, passou).
- `node scripts/rodar-cenarios-local.mjs http://localhost:5220/`: os 14 cenários passaram no estado final
  (load de 3 a 6, acima do 3 pedido; não havia máquina ociosa com os outros agentes). Meia-volta: giros de
  3,17 a 3,32 rad por troca, assentado até 0,058; meiaVoltaRapida excesso 0,05 e 0; meiaVoltaInterrompida
  vel 1,8; sentarLevantar salto 0,10 m; pesParados 7 mm. Uma rodada anterior com load 24 travou a página
  (sentarLevantar com 0 quadros gravados, poseMudou 0) e o executor caiu no meio: não conta.
- Commits: 70b3d63 (giro andando), 26db1b7 (freada), 8512bca (giro gravado), dc868af (busca na hora).
