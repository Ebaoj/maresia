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

Depois da contraluz (`2a3bfdb`), uma rodada a mais (antes, depois, antes no meio): árvores depois 1,04 / 0,88 ms no
Passeio, 0,49 / 0,50 na Praça e 0,58 / 0,62 na rua; antes 4,47 / 0,60 / 1,96 (load de 4,4 a 6,4).

As árvores novas custam menos que as antigas, apesar dos cartões e do vento: a malha é indexada (o vértice roda
uma vez, não seis), e de longe vai só a copa simples (de 160 a 740 triângulos por árvore, antes eram de 1,4 mil a
4,3 mil em todas). O orçamento pedido (no máximo ~2 ms a mais) fica com folga.

## 6. Provas (`docs/capturas/arvores/`)

- `passeio-12.jpg`, `passeio-16h5.jpg`, `praca-12.jpg`, `praca-16h5.jpg`, `rua-12.jpg`, `rua-16h5.jpg`: antes em cima,
  depois embaixo, o conceito ao lado (WebGPU); as mesmas com `-WebGL` no nome. O antes é o servidor rodando `debf939`,
  com a mesma câmera, hora e janela (1280 x 720).
- `especies-1.jpg` (oiti, fícus, cajueiro, carnaúba) e `especies-2.jpg` (mangue, murici, guajiru), antes e depois de
  perto, nos dois renderizadores. O "fícus" de antes é o oiti esticado que a praça usava.
- `antes-vento-*.mp4` e `depois-vento-*.mp4`: câmera parada 8 s no Passeio e num oiti, e andando sob o renque da Caio
  Prado (30 quadros por segundo, passo fixo, `maresia.gravar`). `vento-amplitude.jpg`: quanto cada pixel varia nos 7 s
  de câmera parada (antes, oiti depois, Passeio depois): antes só as nuvens mexem; depois a copa e os galhos mexem, o
  pé do tronco e o chão não.
- `memoria-1881.jpg`: as árvores novas no modo memória (1881), legíveis nas cinco tintas.
- Nos dois renderizadores: nenhum shader quebrado (`__shadersQuebrados` vazio), nenhum material sem `gLuz`
  (`__semLuz` vazio no WebGL), nada em "falta portar" no WebGPU.

## 7. O que ainda não ficou como o conceito

- Ao meio-dia o baixo da copa fica quase preto: é a sombra dura do sertão (`uSertao`), que já fazia o mesmo antes;
  as cores de sombra foram clareadas, mas o pós-processo leva ao preto. Mexer nisso é decisão da luz do jogo, não da
  árvore.
- A copa ainda fecha mais que a do conceito (pouco céu dentro); dá para abrir com menos cachos de miolo por espécie.
- A sombra no chão não balança (a dos parados fica em cache, de propósito).
- O vento da grama (`grama.js`) continua com a direção própria dele; só árvores e coqueiros usam `cfg.vento`.

## 8. Segundo passe (21/10/2026, revisão do coordenador)

Provas em `docs/capturas/arvores/passe2/`: os três lugares nas duas horas, PASSE 1 em cima, PASSE 2 embaixo e o
conceito ao lado, nos dois renderizadores; as espécies; `grama-vento.jpg`; os vídeos `vento-*.mp4` (parado no
Passeio e no oiti, andando sob o renque, girando a câmera em volta do oiti); `tira-30fps-oiti.jpg` (15 quadros
seguidos, meio segundo em ritmo real); `amplitude-passeio.jpg`; `movimento-medido.txt`; `medicao-webgpu.txt`.

- **Copa nunca preta.** A faixa de sombra do pintor de luz multiplica o albedo por 0,5 e o sertão do meio-dia
  ainda aprofunda; com a folhagem escura de antes sobrava preto. Resolvido do lado da árvore, sem mexer no pós:
  paleta `FOLHAGEM` mais clara (luz verde-amarelo quente, meio verde, sombra verde-azulada), preenchimento de céu
  (frio, por cima) e de chão (quente, por baixo) somado depois das faixas só onde a luz é pouca
  (`cfg.arvores.preenche`, `preencheCeu`, `preencheChao`), miolo menos fundo (`oclusao` 0,88) e manchas de sol (um em
  cada cinco ramos de fora e de cima). No WebGPU o preenchimento entra por um gancho novo do pintor de luz
  (`userData.tsl.luz`).
- **Céu e lóbulos.** Pernadas mais longas, cachos menores e separados, menos cachos de miolo, borda com mais ruído,
  menos cartões.
- **Grama no vento das árvores.** A grama deitava para leste (direção fixa no shader); agora lê `cfg.vento`
  (direção, força geral e rajadas que passam pelas árvores ao mesmo tempo). Teste `grama-vento.test.js`.
- **Movimento conferido em vídeo.** Três achados e o que foi feito:
  1. a textura pintada e a pincelada, projetadas no mundo, ficavam paradas com a copa balançando (escorriam por cima
     da folha): agora se prendem à posição antes do vento (GLSL e o gancho `userData.tsl.pintura` no WebGPU);
  2. a fase do tremor era por vértice e deformava cada cartão: agora é pelo centro do cartão, e o tremor ficou mais
     lento (0,7 a 1 Hz);
  3. vizinhas não balançam juntas: correlação do deslocamento horizontal entre copas vizinhas de -0,09 a 0,26
     (oiti) e de 0,15 a 0,16 (fícus do Passeio, fora o par em que as duas janelas pegam a mesma copa ao fundo, 0,63).
     Balanço dominante de 0,14 a 0,27 Hz, tremor de folha de menos de 1 px por quadro a 12 m.
  O giro de câmera muda o desenho da copa mais que o de um prédio (diferença entre quadros 8,4 contra 5,0, com
  4,1 de vento só): os cartões viram com a câmera, como é da técnica; não vi nada pulando na tira.
- **Carnaúba de longe** com leques simples (2 em 3, 6 gomos): era a espécie mais cara de longe.

Custo depois do segundo passe (WebGPU, 2000 x 1125, cinco repetições alternadas, mesma sessão com `debf939`):
árvores 1,06 a 1,39 ms no Passeio (antes 4,45), 0,42 na Praça (0,60) e 0,23 a 0,51 na rua (2,17); depois dos leques simples da carnaúba, 0,94, 0,35 e 0,55.

Fica para decidir: o topo ao sol do meio-dia ainda chega perto do amarelo claro (é o sol branco do sertão sobre a
cor de luz da folha); a copa abriu, mas ainda menos que nos conceitos; os cartões viram com a câmera ao girar.

## 9. Quintais e o estipe da carnaúba (22/10/2026)

- **Quintais** (`quintal1932.js`, da cidade-cheia): mangueira e cajueiro agora são árvores pintadas de `especies.js`
  (com vento, cartões perto e copa simples longe); `especies-quintal.js` saiu. Espécie nova: a **mangueira** (tronco
  grosso e curto, copa grande, densa e redonda, o verde mais escuro das copas, folha comprida, um pouco de bronze no
  alto). O corte além de `cfg.casario.quintal.ate` (320 m) passou para o LOD das árvores (`lod-arvores.js`, estado
  `fora`), porque o quintal e o LOD escreviam o `visible` dos mesmos blocos; o quintal só corta os coqueiros dele.
- **Estipe da carnaúba**: os "espetos pretos em zigue-zague" da rua do Centro eram as bases das folhas velhas, caixas que
  saíam ~0,38 m do eixo; valia para a carnaúba antiga e para a pintada. Agora são relevo baixo em espiral no próprio
  tubo. Teste: nada sai mais de 0,3 m do eixo no pé do estipe.
- **Provas** em `docs/capturas/arvores/quintal/`: bairro (Jacarecanga, lon -38,54003 lat -3,724747), Coluna da Hora e
  a rua do Centro (lon -38,5268 lat -3,7296), ao meio-dia e às 16h30, e a mangueira de quintal mais perto do bairro;
  antes (`375f0f0`) em cima, depois embaixo, conceito ao lado, WebGPU e WebGL (nenhum shader quebrado, nenhum material
  sem gLuz).
- **Custo** (`maresia.medir`, WebGPU, 2000 x 1125, cinco repetições alternadas, duas rodadas de cada lado alternando
  o servidor, load de 2,9 a 3,6; saída em `quintal/medicao-webgpu.txt`): todas as árvores custam 0,86 a 0,88 ms no
  bairro (antes 0,31 a 0,62) e 3,0 a 3,5 ms na Coluna da Hora (antes 2,9 a 4,5); só os quintais ficam dentro do ruído
  nos dois (de -0,7 a +0,5 ms). No mundo 2,5 vezes maior a Coluna da Hora é presa de processador (27 a 30 ms de
  JavaScript por quadro): as árvores de quintal viraram 3 malhas por variante (231 objetos, eram 77), e no WebGPU cada
  objeto custa processador; foi o que subiu no bairro.
