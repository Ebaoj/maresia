# Pisca (22/10/2026)

Queixa do Joabe, vendo o vídeo da profundidade de campo (`docs/capturas/profundidade/andando.mp4`): "as casas e várias
coisas ficam piscando na tela". O mapa do orquestrador (pixels que mudam muito num quadro e voltam no seguinte) caía
quase todo em borda de casa: cornija, moldura de janela, grade de sacada, beira de telhado, faixas horizontais da
fachada e o contorno do jogador.

Branch `pisca`, a partir de `integracao` (4195ad2). Provas em `docs/capturas/pisca/`.

## Como foi medido

- Lugar: a rua do Centro do vídeo (x 3158, z 1467, câmera 1,265 rad, 15h, distância 5, inclinação 0,2), Chrome sem
  janela do Mac, WebGPU em Metal, janela 1280 × 720 (desenho 1280 × 577, resolução 1 no Chrome sem janela).
- `scripts/pisca.mjs` grava quadros PNG em quatro situações: **parado** (câmera, jogador e tempo parados: passo de
  1e-6 s), **tempo** (câmera parada, tempo correndo), **giro** (câmera girando 0,2 rad/s) e **andando**. Três modos de
  avançar o quadro: `raf` (um passo por quadro do navegador, como o jogo de verdade), `quadro` (como o `maresia.medir`) e
  `gravarReal` (o próprio `maresia.gravar`, o caminho do vídeo que o Joabe viu). Variantes do cfg ligam e desligam
  suspeitos ao vivo.
- `scripts/pisca-mapa.py`: um pixel pisca no quadro t quando a luminância muda mais de 24 (de 255) de t-1 para t e de t
  para t+1, e t-1 e t+1 ficam a menos de 12 um do outro (mudou e voltou). Sai a fração de pixels que piscam por quadro,
  só nas bordas (gradiente > 18) e fora delas, e o mapa somado.
- **Medida simples** serve para câmera parada. Girando ou andando ela conta como pisca toda linha fina que só passa
  pelo pixel (fundo, linha, fundo), o que é movimento de verdade. Por isso, com movimento, vale a **medida compensada**
  (`--compensar`): antes de comparar, t-1 e t+1 são trazidos para o quadro t por casamento de blocos (para cada pixel,
  o deslocamento até ±8 px na horizontal e ±4 na vertical que mais parece com a vizinhança 9 × 9). Sobra o que some e
  volta no mesmo lugar do mundo. É lenta (~7 s por quadro na máquina carregada), então usa os quadros 10 a 32.
- O sorteio é fixo e o passo é fixo: duas gravações iguais deram 0,185% e 0,188% (tempo correndo, simples).

## Causas, da maior para a menor (números por quadro, % de pixels)

| # | Causa | Onde aparecia | Prova | Antes | Depois |
|---|---|---|---|---|---|
| 1 | **O gravador** (`maresia.gravar`) avança passos seguidos sem andar o quadro do three: mapas de sombra e ossos ficavam velhos num quadro e certos no seguinte. Só no vídeo, não no jogo | tudo que tem sombra; o boneco | girando, compensada: gravador 1,587% contra 0,216% no jogo de verdade (4195ad2) | 1,587% (giro), 0,240% (andando) | 0,048%, 0,032% (igual ao jogo) |
| 2 | **Sombra do sol girando**: a grade de texels do mapa de perto era presa à origem do mundo; no Centro (3,5 km dela) o giro do sol num quadro (0,008°) deslocava a grade ~0,5 m, uma fração de texel qualquer a cada quadro | borda de toda sombra (sob cornija, sacada, janela, a sombra do jogador) | `tempo`: sem o mapa de perto 0,007%, com o sol parado 0,003%, com ele 0,185% | 0,159% (tempo, simples) | 0,001% |
| 3 | **Linhas mais finas que um pixel, sem antisserrilhado nenhum na cadeia**: grade de sacada (2,5 cm), friso, peitoril, quina de cornija, beira de telhado, a borda das faixas de luz | fachadas, andando e girando | andando, compensada, com e sem o passe novo (mesma sessão): 0,107% -> 0,031% | ver total | ver total |
| 4 | **z-fighting do meio-fio**: a calçada e o meio-fio eram duas caixas até a mesma beira, frente e topo no mesmo plano, cores diferentes; a ponta do barrado no plano da face do cunhal | faixa ao longo de toda a beira da calçada | andando, compensada: 0,138% -> 0,107%; girando 0,148% -> 0,109% (antes e depois da correção, com a sombra já corrigida) | ver total | ver total |

**Total, jogo de verdade (modo `raf`), antes (4195ad2) e depois (9d33bcc):**

| Situação | Medida | Antes | Depois |
|---|---|---|---|
| parado | simples | 0,000% | 0,000% |
| tempo correndo | simples | 0,159% (borda 0,97%) | 0,001% (borda 0,005%) |
| girando | compensada | 0,216% (borda 1,60%) | 0,049% (borda 0,58%) |
| andando | compensada | 0,224% (borda 1,49%) | 0,032% (borda 0,35%) |
| girando, gravador | compensada | 1,587% | 0,048% |
| andando, gravador | compensada | 0,240% | 0,032% |

Na medida simples (que conta movimento): andando 0,748% -> 0,390%, girando 0,650% -> 0,450%.

O que **não** era causa (desligado ao vivo, sem mudança na cintilação): a profundidade de campo, a quina clara
(`arcAresta`), a oclusão, o relevo do chão, o grão (`arcGrao`, `arcTela`), o cache da sombra. A pincelada (Kuwahara)
**reduz** a cintilação (sem ela, andando 0,237% -> 0,347%, simples). Parado de verdade, nada pisca: nenhum LOD, célula
de longe ou cache que alterne quadro a quadro. Supersample 2 × 2 (desenho em 2560 × 1154, reduzido) quase não mudou
(0,237% -> 0,225%, simples): não era só serrilhado de tela, por isso a escolha foi a estabilização no tempo.

Profundidade (passo 3 do método): near 0,3 e far 6.000 com profundidade em float de 32 bits dão resolução de 0,5 mm a
50 m, 2 mm a 100 m e 18 mm a 300 m. As peças da fachada estão a 1 cm ou mais umas das outras, então só brigariam além de
~230 m, onde a casa já é a caixa de longe. Os dois z-fightings achados eram planos exatamente iguais (independem da
profundidade). Near e far ficaram como estão (a cadeia de pós lê a distância por eles).

## O que mudou (um commit por causa)

1. `97ddb0d` Sombra: `alinharAoTexel` (`src/render/sombra-luz.js`) aceita uma âncora; o mapa de perto
   (`sombra-perto.js`, todo quadro) e o de longe (`ceu.js`, quando o cache refaz) usam o centro alinhado do quadro
   anterior. O giro do sol fica em volta da janela (um ponto a 15 m anda 0,10 texel por quadro, sempre para o mesmo lado,
   em vez de uma fração qualquer); andar continua em passos inteiros de texel. Teste `testes/unidade/pisca-sombra.test.js`
   (em 4195ad2: 0,51 texel no de perto e 0,38 no de longe; agora 0,10 e 0,03). Custo: nenhum.
2. `5002b62` Casario: a calçada acaba onde o meio-fio começa e o barrado recua 2 mm da quina (`kit1932.js` e
   `quarteirao.js`, o mesmo desenho). Teste `testes/unidade/pisca-zfighting.test.js` (nenhuma face de caixa da casa no
   plano de outra de cor diferente; reprova em 4195ad2). O desenho não muda (o topo do meio-fio sai com a cor dele, que
   antes brigava com a da calçada). Custo: nenhum.
3. `8f2dda3` + `9d33bcc` Estabilização no tempo (`src/pos/estabilizar.js` em GLSL e `estabilizar-gpu.js` em TSL, os
   mesmos uniforms): logo depois da cena, antes da profundidade de campo e da pincelada, a cor do quadro anterior trazida
   para o mesmo ponto do mundo pela profundidade e pelas duas câmeras, lida em Catmull-Rom (5 leituras), limitada à faixa
   da vizinhança em cruz deste quadro (média e desvio em YCoCg) e misturada 85%. Sem tremor sub-pixel da câmera (a quina
   clara, a oclusão e o desfoque saem da profundidade e passariam a tremer). O jogador e a gente (alfa do traço < 0,95)
   ficam fora: andam sozinhos e a primeira versão os borrava. Parado, nada muda. `cfg.estilo.estabilizar` (0 desliga o
   passe e o custo) e `estabilizarGama`, no painel em Visual > Estabilizar (contra o pisca). Teste
   `testes/unidade/pisca-estabilizar.test.js` (a primeira versão lia a matriz de mundo velha da câmera, um quadro
   atrasada, e a imagem amolecia andando).
4. `4c52a13` Gravador: `nodeFrame.update()` antes de cada passo, como o medidor e a foto justa já faziam.

## Custo (orçamento ~2 ms)

Só o passe novo custa; as outras correções não têm custo de quadro.
- O passe sozinho, 2000 × 1125, WebGPU, 40 desenhos seguidos e uma leitura, mediana de 5: 1,4 a 1,5 ms (2,2 ms com a
  vizinhança 3 × 3 da primeira versão, que por isso virou cruz).
- `maresia.medir`, quadro inteiro, variantes alternadas, 5 repetições, 2000 × 1125: +1,1 ms na Coluna da Hora e +1,3 ms
  na rua (versão 3 × 3, quadro de ~40 ms, load 6 a 8). Numa segunda rodada com a placa disputada (quadro de 108 a 125 ms)
  deu +5 a +6 ms, ruído da máquina: não vale como medida.

## O que não foi verificado

- Só um lugar (a rua do Centro, 15h) e um tamanho de tela. Não medi noite, chuva de partículas, praia, água (a água se
  mexe sozinha e entra na estabilização; a faixa das vizinhas deve limitar o rastro, mas não medi) nem o Campo do Urubu.
- Não joguei com mouse e teclado na tela de verdade; os vídeos são do Chrome sem janela (resolução 1, não 1,25 como no
  Retina do Joabe).
- A medida compensada depende do casamento de blocos: grades repetidas (janelas iguais) podem casar errado e contar
  pisca a mais ou a menos; os números servem para comparar antes e depois, não como valor absoluto.
- O contorno do jogador continua aparecendo no mapa: é a animação dele (braço e perna mudam de verdade), e ele fica fora
  da estabilização de propósito.
- Não procurei z-fighting fora do casario do kit (marcos, cenografia, `casario1932.js`, que é da branch escala-centro).
- LOD e células de muito longe: parado não alternam; andando longas distâncias, a troca de nível é um salto único (não
  medido aqui).

## O que pode dar errado

- A estabilização deixa a imagem ~10% mais macia **andando** (gradiente médio 6,2 -> 5,6 no mesmo quadro); parada, igual.
  Se o Joabe achar mole: `estabilizar` 0,7 (andando 0,042% em vez de 0,031%) ou 0.
- Objeto que se mexe sozinho e não tem alfa de gente (bandeira, roupa no varal, carroça, bonde, folha) pode deixar um
  rastro curto; a faixa das vizinhas limita, mas um objeto rápido e contrastado pode borrar.
- Teletransporte e tamanho novo zeram a cor de antes (salto de mais de 3 m da câmera); um corte de câmera menor que isso
  mistura um quadro.
- A foto justa e o medidor passam pelo passe novo: fotos tiradas depois de uma sequência de passos dependem do quadro
  anterior (o mesmo roteiro dá a mesma foto).
- A âncora da grade de sombra muda o desenho do mapa de longe a cada refeito: se algum teste ou foto compara a sombra
  pixel a pixel com uma referência antiga, ela pode mudar uma fração de texel.

## Para refazer

```bash
npx vite --port 5222 --strictPort   # o servidor do worktree
PORTA_EXTRA=1300 node scripts/pisca.mjs http://localhost:5222/ plano.json PASTA
python3 -I scripts/pisca-mapa.py PASTA/* [--compensar --quadros 10:32] [--mapa PASTA_MAPAS]
```
Plano usado: `{ "lugar": { "x": 3158, "z": 1467, "yaw": 1.265, "hora": 15, "pitch": 0.2, "dist": 5 }, "segundos": 3,
"fps": 30, "assentar": 60, "situacoes": ["parado", "tempo", "giro", "andando"], "modos": ["raf", "gravarReal"],
"variantes": { "base": {} } }`. Antes: o mesmo plano com o servidor num worktree em 4195ad2.

Arquivos em `docs/capturas/pisca/` (em cima antes, embaixo depois, 960 de largura): `parado.mp4`, `tempo.mp4`,
`giro.mp4`, `andando.mp4` (o jogo de verdade, um passo por quadro do navegador), os mesmos com `-gravador` (o próprio
`maresia.gravar`), e `mapa-*.png` (o quadro 20 com os pixels que piscaram em magenta; simples para parado e tempo,
compensada para giro e andando).
