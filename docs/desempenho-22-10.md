# Desempenho do mapa grande (22/10/2026)

Branch `desempenho`, a partir de 53ff6f0 (integração), depois juntada com `integracao` (ee6095a, os bugs de 22/10).
Pedido: com o Campo do Urubu em 1:1 o mundo ficou 2,5 vezes maior (decisão do Joabe, fica) e o jogo passou a esperar
o processador. Meta: as vistas mais cheias de novo em até ~30 ms por quadro neste Mac, sem perda visível perto do
jogador.

## Como foi medido

- `maresia.medir` (src/debug/medidor.js), WebGPU no Chrome sem janela (Metal), 2000 × 1125 (1600 × 900 × 1,25), hora
  parada, mediana de 5 repetições por rodada. Antes e depois em **rodadas alternadas** com o servidor trocando de
  árvore (base, novo, base, novo, base, novo), porque a máquina estava dividida com outros agentes: load de 4 a 10 o
  tempo todo e um Chrome de outro agente a 150% de CPU. Os números absolutos variam de uma rodada para a outra (o
  JavaScript chegou a dobrar entre duas rodadas do mesmo código, ao que parece quando a thread cai num núcleo de
  economia); as contagens de objetos, chamadas e triângulos são exatas e não variam.
- **Achado no medidor** (c8eb88a): no WebGPU o three só anda o contador de quadros no quadro do navegador, e os mapas
  de sombra são "por quadro". O medidor rodava 20 passos num laço só, então a sombra era desenhada uma vez em 20 e
  ficava fora da conta. Corrigido (um `nodeFrame.update()` por passo, como a foto justa já fazia). Todo número abaixo
  já tem a sombra; números de `maresia.medir` no WebGPU de antes deste commit estão sem ela. A linha de base foi medida
  numa cópia de 53ff6f0 / ee6095a com só esta correção do medidor.
- Perfil de CPU pelo CDP (`Profiler`, amostra a cada 200 µs), 60 quadros por lugar, com o mesmo avanço de quadro. O
  perfil pesa o tempo (os números dele são maiores que os do medidor); vale a proporção.
- Os 4 lugares: a vista da Coluna da Hora (`VISTAS.colunaHora`, 16h30), a da Praça dos Leões (`VISTAS.leoes`, 9h30),
  um ponto de Jacarecanga (`ll(-38.548, -3.722)`, olhando a nordeste, 16h30) e o meio do Campo do Urubu (centro do
  polígono, 9h30). A fatia vertical da Praia do Peixe precisa estar destravada (`cfg.fatia.travar = false`), senão o
  `irPara` volta para lá.

## Para onde ia o quadro (antes, 53ff6f0)

Na Coluna da Hora: 11.984 objetos na cena, 3.622 visíveis, **1.593 desenhados no passe principal e 246 nos de
sombra** por quadro. No WebGPU do three cada objeto desenhado custa CPU (a lista, o observador de uniforms, os bind
groups, o draw), e cada objeto da cena custa a travessia e a matriz do mundo mesmo escondido.

Perfil (ms por quadro, com o peso do perfilador; Coluna / Leões / bairro / Campo):

| parte | Coluna | Leões | bairro | Campo |
|---|---:|---:|---:|---:|
| quadro inteiro (passo) | 33,3 | 53,3 | 21,9 | 13,9 |
| laço de desenho dos objetos (todos os passes) | 25,7 | 40,1 | 14,5 | 7,9 |
| sombra (os dois mapas) | 6,2 | 8,9 | 5,0 | 3,4 |
| travessia da cena e recorte da tela | 4,9 | 7,2 | 4,1 | 3,3 |
| observador de uniforms (remendo dos parados) | 2,3 | 4,0 | 1,1 | 0,4 |
| raios da câmera | 1,2 | 2,4 | 1,2 | 0,9 |
| matriz do mundo | 1,1 | 1,9 | 1,3 | 1,1 |
| visibilidade do chão solto | 1,0 | 1,8 | 1,2 | 1,2 |

(A rodada dos Leões pegou a máquina mais carregada; a proporção é a mesma.)

O que era desenhado, por sistema (passe principal, Coluna da Hora): terreno 424, palhoças de longe 181, casario de
longe 75, favela de longe 61, copas simples de árvore ~280 (cajueiro 53, mangue 50, carnaúba 48 + 48 de folhas,
murici 35, guajiru 29...), e a cauda dos blocos sem LOD (cadeiras 31, vasos 29, lampiões 28 + 28 do vidro,
buganvílias 27, varais 26, postes 24, cercas 23...). Na cena, escondidos: 5.854 blocos de chão solto (434 mil pedras),
805 pedaços de terreno de perto, 284 caixas de colisão da câmera.

Quanto cada suspeito custava (variante que o tira, mesma rodada; ms por quadro, load 3 a 4): esconder todas as
malhas de longe tirava 7,7 ms na Coluna e 8,4 no Campo; esconder o terreno de longe, 3 a 4 ms; o mapa de sombra de
perto, 2 a 5 ms; o chão solto, 0,2 a 4 ms. Não testado à parte: os atores (0,1 ms no perfil), o vento (uniform
global, nada por objeto), a troca de LOD (laços de poucos microssegundos).

## O que foi feito (um commit cada)

| commit | o quê | efeito principal |
|---|---|---|
| b60d859 | chão solto só vira objeto perto da câmera (células de 64 m, malha nasce na faixa raio + 64 m) | 5.854 objetos a menos na cena; 1 ms de laço a menos |
| c8eb88a | medidor com o quadro do WebGPU andando a cada passo | a sombra entra na conta |
| 5d1b731 | camada de muito longe (células de 768 m) no terreno, no casario e na favela; as juntas fora do mapa de perto | terreno 424 → 19 objetos na Coluna |
| c9f915a | raios da câmera só contra os sólidos ao alcance | 1,1 → 0,2 ms |
| de78c31 | árvores e palhoças de longe numa malha por forma (máscara); blocos sem LOD juntos de longe | 1.593 → 494 objetos no passe principal |
| 4c2392a | a máscara guarda só as cópias à vista (count), sem escala 0 | quem está perto não passa pelo vértice |

Tudo desliga ao vivo no painel (Desempenho): `chaoSoltoPerto`, `muitoLonge` (terreno, casario, palhoças e árvores),
`blocosJuntos`. Com as três desligadas o jogo volta ao desenho de antes (é assim que as fotos de antes e depois da
mesma sessão foram tiradas).

Tentado e revertido: cortar os parados do mapa de sombra de perto pela caixa em vez da esfera (o three corta pela
esfera, e a esfera de um bloco de 192 m de cadeiras tem 136 m de raio). Tirou só 35 objetos de 233 na Coluna e o
teste de 3.900 caixas por quadro comeu o ganho (29,0 contra 28,8 ms).

## Antes e depois (integração ee6095a contra desempenho 5f6a848)

WebGPU, 2000 × 1125, medianas de 3 rodadas alternadas (cada rodada já é mediana de 5); entre colchetes, as 3 rodadas.
Objetos = na cena; chamadas = objetos desenhados por quadro (passe principal + sombra).

| lugar | ms por quadro antes | depois | JS antes | depois | chamadas antes | depois | triângulos antes | depois | objetos antes | depois |
|---|---|---|---|---|---|---|---|---|---|---|
| Coluna da Hora | 38,7 [41,1 38,7 35,6] | 30,4 [30,4 30,0 40,7] | 36,8 | 14,5 [14,5 13,7 15,5] | 1.885 (1.626 + 259) | 754 (508 + 246) | 10,34 M | 12,03 M | 12.085 | 6.552 |
| Praça dos Leões | 33,2 [31,7 33,8 33,2] | 28,0 [27,9 28,0 30,6] | 31,6 | 15,2 [14,7 15,2 23,5] | 1.723 (1.505 + 218) | 833 (615 + 218) | 10,00 M | 11,40 M | 12.115 | 6.586 |
| bairro (Jacarecanga) | 23,9 [22,7 24,4 23,9] | 24,8 [24,2 24,8 26,3] | 20,2 | 11,0 [9,2 18,9 11,0] | 837 (691 + 146) | 363 (227 + 136) | 5,64 M | 7,00 M | 12.120 | 6.611 |
| Campo do Urubu | 21,4 [20,7 21,8 21,4] | 22,6 [21,6 22,6 24,7] | 19,9 | 16,6 [7,5 16,6 18,9] | 472 (351 + 121) | 266 (153 + 113) | 4,97 M | 6,29 M | 12.120 | 6.611 |

WebGL (uma rodada de cada, mesma ordem): Coluna 49,4 → 31,5 ms (JS 22,9 → 12,1), Leões 53,5 → 30,5 (21,4 → 7,9),
bairro 39,9 → 25,4 (10,2 → 5,4), Campo 32,0 → 22,5 (8,8 → 6,2).

Na rodada sobre 53ff6f0, antes da junção com a integração (mesmo método, 2 rodadas): Coluna 42,7 / 29,6 → 27,7 / 28,6
ms, JS 40,9 / 27,8 → 13,8 / 26,1; Leões 35,5 / 29,0 → 26,2 / 29,6.

**Leitura.** O JavaScript caiu à metade nas vistas cheias (Coluna e Leões), e o quadro delas ficou em ~28 a 30 ms.
Agora quem limita é a placa (o quadro fica acima do JS): ~25 a 30 ms em 2000 × 1125 com a máquina dividida, quase
todo do filtro de quadrinho em tela cheia. No bairro e no Campo, que já eram baratos, o quadro não melhorou e pode ter
piorado 1 a 2 ms: lá o tempo já era da placa, e os triângulos subiram 24 a 27%.

## De onde vêm os triângulos a mais

A troca é processador por placa: célula grande quer dizer recorte da tela mais grosso. A malha junta de uma célula de
768 m (terreno, blocos sem LOD) é desenhada inteira se um canto dela aparece; a malha de longe de cada forma de árvore
e de palhoça cobre o mapa todo e não é recortada (as cópias de quem está perto não entram desde 4c2392a, mas as de
longe atrás da câmera entram). Medido à parte, com a máquina muito carregada (load 9, números dobrados), a diferença de
placa entre as camadas ligadas e desligadas no bairro e no Campo ficou dentro do ruído (47,4 contra 46,9 ms; 44,3 contra
41,3 ms). Se pesar na T4 ou no M1, o caminho é a máscara por célula grande (1.536 m), que devolve parte do recorte com
poucos objetos a mais.

## Imagem

Fotos em `docs/capturas/desempenho/`, ANTES em cima e DEPOIS embaixo, mesma câmera e hora:

- `muito-longe-*.jpg` e `longe-mascarado-*.jpg`: mesma sessão, as chaves desligadas (antes) e ligadas (depois), nos 4
  lugares. A diferença entre as duas fotos é só o que se mexe: o neto, a grama e as folhas no vento, a legenda do
  bairro (1,5 a 5,7% dos pixels, todos nessas regiões).
- `final-*.jpg`: integração (ee6095a) contra esta branch, em sessões separadas, nos 4 lugares e de cima (câmera a 45 m)
  na Coluna e no bairro, onde aparece o longe. De 0,1 a 2,9% dos pixels mudam, de novo só no que se mexe.

## O que não foi verificado

- Nada na T4 nem num M1 de 8 GB; só neste Mac, sempre dividido com outros agentes (load 4 a 10). A suíte de
  regressão (14 de 14) também rodou com load 4 a 10, acima do limite de 3 do CLAUDE.md.
- O jogo andando pela cidade (as células abrindo e fechando, a máscara regravando): só o teste de unidade e as fotos
  paradas. O custo de uma célula de 768 m abrindo (as malhas dela ficam prontas desde o começo; abre e fecha só
  `visible`) e do cache de sombra refeito por "conjunto" quando ela troca não foi medido em vídeo.
- Hora correndo: tudo foi medido com a hora parada. Com a hora andando o mapa de longe dos parados refaz ~4 vezes por
  segundo, e agora ele tem as malhas juntas, que são grandes (desenho de mais vértices em cada refazer).
- O pré-aquecimento do WebGPU com o chão solto fora da cena: um bloco de cada tipo fica na cena para o shader ser
  montado, mas o primeiro bloco de cada célula nova sobe os buffers na hora (pequenos, não medido).

## O que pode dar errado

- Sistema que esconde ou mostra um bloco por conta própria e não está na lista de fora (`semJuntarLonge`, tam fixo,
  sólido): a camada de blocos juntos o "retomaria" como visível ao abrir a célula. Hoje ficam de fora as árvores
  pintadas, os quintais, o chão solto, as casas do quarteirão, as palhoças, o casario de longe e o que nasce
  escondido. Bloco novo que se esconda sozinho precisa de `semJuntarLonge: true`.
- Bloco criado depois do primeiro quadro não entra na camada (fica como era, só sem o ganho).
- Sombra de longe: as malhas juntas ficam fora do mapa de sombra de perto (estão a mais de 90 m). Com o sol abaixo de
  ~10 a 15°, a sombra de uma árvore alta de longe que chegasse até a janela de perto (48 m em volta do jogador) sai
  só do mapa de longe na borda; não foi visto em foto.
- A ordem das cópias na malha de longe mascarada muda quando unidades entram e saem; num material com transparência
  ordenada isso mudaria a ordem de desenho. As de longe das árvores e palhoças são opacas.
- `bondes-malha.js` (da integração) lê `alturas`, `NX` e `LIMITES` do terreno e supõe a malha de perto de 2 m: nada
  disso mudou (só os pedaços de longe se juntam), e `trilho-bonde.test.js` passa.
