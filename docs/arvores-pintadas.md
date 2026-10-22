# Árvores pintadas e vento (21/10/2026)

Pedido do Joabe: "as árvores me incomodam: parecem desenho 2D ou 3D malfeito. Não têm um nível de detalhe
interessante e nenhum movimento." Alvo: os conceitos aprovados (`~/Projetos/marcos-1932-pesquisa/conceitos/`
praca-ferreira, passeio-caio-prado, excelsior, se-velha, estacao-central) e o "Arcane do sertão"
(`maresia-chao/docs/referencias/conceito-sertao/`): copas em massas grandes e legíveis, quebradas em folhas pintadas
na silhueta, topo claro e quente, baixo frio e escuro, céu aparecendo entre os cachos, galhos à mostra.

## 1. Diagnóstico (código de `debf939`)

Provas: `docs/capturas/arvores/diagnostico-antes-*.jpg` (WebGPU, 1280 x 720) e os vídeos `antes-vento-*.mp4`.

| O que se vê | Por que | Onde |
|---|---|---|
| "3D malfeito": a copa é um punhado de poliedros, a borda é feita de retas | cada cacho é um icosaedro de 1 ou 2 subdivisões, amassado por ruído; com 80 a 320 triângulos a silhueta mostra as arestas | `cacho()` em `especies.js` |
| "Desenho 2D": manchas chapadas de verde escuro | a luz vê cada cacho como uma bola separada (a normal é a do cacho), então o pintor de luz (três faixas) desenha uma pilha de bolas de valor parecido em vez de uma copa com volume | normais por cacho |
| Sem detalhe no meio | não existe nada entre o cacho (1 a 2 m) e o pixel: nenhuma folha, nenhum ramo, nenhum recorte na borda | sem cartões de folha |
| Copa sem céu dentro e sem galho | os cachos fecham a copa; os galhos ficam escondidos; o tronco é um cilindro de 6 lados de uma cor só | `galho()`, cor única por espécie |
| Todas iguais | 3 ou 4 variantes por espécie, mesma cor em todas as cópias | sem cor por cópia |
| Fícus das praças é um oiti esticado | `praca-reforma.js` e o renque do Passeio usavam `oiti()` com escala 1,7 | sem espécie fícus |
| Nada se mexe | só o coqueiro tinha vento (folhas); o tronco dele e todas as outras árvores são estáticos | `vegetacao.js` |
| Ao meio-dia o baixo da copa vira preto | o sertão do meio-dia escurece a sombra de propósito; com a cor por vértice escura, sobra preto | paleta e sertão |

Medido (WebGPU, `maresia.medir`, 2000 x 1125, cinco repetições alternadas, árvores ligadas contra escondidas):
o custo das árvores de hoje é de 4,1 ms no Passeio Público, 2,3 ms na Praça do Ferreira e 2,2 ms numa rua de oitis.

## 2. A técnica (o padrão de árvore estilizada "pintada")

- **Copa como volume**: a normal de cada cacho é puxada para a normal do volume da copa (uma esfera achatada que
  envolve os cachos, `cfg.arvores.esfera`). A luz passa a ler a copa inteira como uma massa macia; o cacho só
  aparece na borda.
- **Cor pintada no vértice**: três valores por espécie (`FOLHAGEM` em `src/paleta.js`): luz no topo (verde-oliva
  quente), meio e sombra embaixo (verde frio puxado para o azul), com a borda entre eles quebrada por ruído, o miolo
  mais fundo (`cfg.arvores.oclusao`), variação por cacho e por árvore (semente e posição).
- **Cartões de folha**: quadrados com um ramo de folhas desenhado no canvas (`folha-textura.js`, atlas 2 x 2: folha
  miúda, larga, média e o leque da carnaúba), na casca de cada cacho, virados para a câmera no shader. Quebram a
  silhueta e dão o detalhe do meio. A normal deles é a do volume da copa, então não acendem como papel.
- **Tronco e galhos**: tubos de anéis com afinamento, forquilhas, pé alargado em sapopemas, casca com veios e
  manchas na cor por vértice e a textura pintada `tronco` por cima (a folhagem usa a `folha`).
- **Espécies**: oiti (copa redonda e densa nas calçadas), fícus novo (copa em guarda-chuva, tronco grosso e cinza,
  raízes aéreas; Praça do Ferreira e renque da Caio Prado), cajueiro (tronco baixo e torto, galhos quase
  horizontais, folha grande e folha nova acobreada), carnaúba (leques com as pontas rasgadas pela textura),
  mangue (raízes-escora), murici e guajiru (arbustos).

## 3. Vento

Um vento só (`cfg.vento`, painel Mundo > Árvores e vento): o alísio de lés-sudeste (vem de 110 graus), força,
rajadas que andam pelo chão na direção dele. Três níveis, só contas no vértice (GLSL e TSL, `vento-arvores.js`):
a árvore inteira inclina e balança devagar, mais quanto mais alta; galhos e cachos balançam cada um na sua fase,
presos ao galho por um peso que vai de 0 no tronco a 1 no cacho; as folhas dos cartões tremulam. O coqueiro ganhou
o que faltava: o estipe balança no mesmo vento (a copa vai junto), e a força geral pesa nas folhas dele.
A sombra não balança (a sombra dos parados fica em cache).

## 4. Distância

Cada espécie tem três malhas com as mesmas cópias (`lod-arvores.js`): corpo e cartões perto; longe, uma copa
simples (cachos de 20 triângulos, um pouco maiores). Os cartões encolhem até sumir entre `lodPerto` e
`lodLonge` antes de o bloco de 96 m trocar (`lodBloco`), então a troca não pula. A carnaúba mantém os leques
longe (são a copa inteira).

## 5. Custo (medido)

`maresia.medir`, WebGPU, 2000 x 1125, cinco repetições alternadas de "árvores ligadas" contra "árvores escondidas",
nos três pontos das provas. O servidor 5215 alternou entre o código de antes (`debf939`) e o de depois, duas
rodadas cada, 21/10/2026 às 22h (load de 4,5 a 8,8 por outras sessões; as duas versões sofreram o mesmo, e as
variantes "sem árvores" deram o mesmo número nas duas, de 17,1 a 19,5 ms). Saída crua em
`docs/capturas/arvores/medicao-webgpu-antes-depois.txt`.

| Lugar | Árvores antes (ms) | Árvores depois (ms) | Quadro inteiro antes / depois (ms) |
|---|---|---|---|
| Passeio Público (Caio Prado) | 4,04 / 4,20 | 1,32 / 1,07 | 23,6 / 20,6 |
| Praça do Ferreira | 0,77 / 0,58 | 0,35 / 0,35 | 17,8 / 17,5 |
| Rua de oitis | 2,53 / 2,31 | 0,43 / 0,49 | 21,3 / 19,5 |

As árvores novas custam menos que as antigas, apesar dos cartões e do vento: a malha é indexada (o vértice roda
uma vez, não seis), e de longe vai só a copa simples (de 160 a 740 triângulos por árvore, antes eram de 1,4 mil a
4,3 mil em todas). O orçamento pedido (no máximo ~2 ms a mais) fica com folga.
