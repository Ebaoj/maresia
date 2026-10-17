# Ideias e pendências

Lista viva do que o Joabe pediu para lembrar e do que ficou para depois.
Cada item entra quando fizer sentido implementar; ao fazer, mover para "Feito" com a data.

## Ideias do Joabe

### Gerador aleatório de efeitos (o primeiro é o vento)
*Registrado em 16/10/2026.*

O vento muda sozinho ao longo do tempo: ora mais forte, ora mais fraco, mudando de direção. Isso altera como tudo em volta se comporta.

Níveis possíveis:
- **Brisa e vento normal.** Grama, coqueiros, roupas no varal e mar respondem à força do momento.
- **Ventania.** Guarda-sóis tremendo, toldos batendo, areia levantando, ondas maiores.
- **Catástrofe (talvez).** Vento tão forte que as coisas voam.

Avaliação de esforço:
- **Vento normal e ventania: simples.** O vento já existe espalhado (grama, coqueiros, roupas). Falta um "sistema de vento" central que sorteie força e direção com transições suaves e que todo mundo leia. Com a física da camada 2, o vento também vira força nos objetos soltos (bola, coco, guarda-sol).
- **Catástrofe: média a difícil.**
  - **Física.** Precisa da camada 2 pronta. Pelo teste de 16/10, o motor aguenta cerca de 100 objetos soltos perto do jogador.
  - **Objetos que se soltam.** Guarda-sóis, telhas, placas, cadeiras e roupas hoje são fixos e teriam de virar objetos de física quando o vento passar de um limite.
  - **Efeitos.** Poeira e detritos voando, céu mudando, a câmera tremendo.
  - **Limite.** Tudo voando só perto do jogador; longe, apenas balança.

O "gerador de efeitos" pode crescer depois para outros eventos: chuva, maré alta, neblina, noite de festa.

### Trilha sonora motivada (som que sai do mundo)
*Registrado em 16/10/2026. Para mais à frente.*

Nada de música de fundo genérica: o som sai de lugares que fazem sentido.
- **Música saindo dos lugares.** Estabelecimentos, carrinhos, barracas de praia, bares. Mais alta perto, abafada longe e atrás de parede.
- **Gente conversando.** Burburinho perto das pessoas, mais forte onde tem aglomeração.
- **Natureza urbana.** Mar, vento, pássaros, carros, ônibus, ambulante anunciando, cachorro, obra.
- **Cada ambiente com personalidade sonora.** Praia, calçadão, casario, favela, morro, rio e centro soam diferentes, e o som muda suave quando você passa de um para outro.
- **Repertório.** Curadoria depois, mas com certeza muito MPB, samba e rock nacional. Atenção à licença das faixas (o jogo pode virar público).

Lembrete: o jogo continua abrindo mudo; isso só toca com o som ligado (tecla M).

### Fauna e flora nativas da Mata Atlântica
*Registrado em 16/10/2026.*

Trazer espécies nativas da Mata Atlântica, modeladas em 3D no estilo do jogo, para o ambiente. Faz sentido para Rio, Recife e Fortaleza (no Ceará, a Mata Atlântica aparece nas serras úmidas e no litoral; o resto é caatinga e restinga).
- **Flora (sugestões para a curadoria):** ipê-amarelo e ipê-roxo, pau-brasil, quaresmeira, manacá-da-serra, embaúba, jequitibá, palmito-juçara, bromélias e orquídeas nos troncos, helicônias, samambaiaçu. Na restinga, cajueiro e pitangueira.
- **Fauna (sugestões):** mico-leão-dourado e sagui (no Rio, sagui no fio do poste é a cara da cidade), tucano-de-bico-verde, sabiá-laranjeira, bem-te-vi, beija-flor, tiê-sangue, preguiça, quati, borboleta-azul (morpho), teiú, caranguejo no mangue.
- **Liga com o resto:** os bichos reagem ao jogador e ao vento (gerador de efeitos) e têm som próprio (trilha motivada). As árvores entram no sistema de vegetação já existente.
- **Cuidado:** cada espécie no lugar certo. Mico-leão-dourado é do Rio; no Recife, sagui e mangue. Vale uma pesquisa curta de onde cada uma ocorre antes de modelar.

### Mar com ondas de verdade (como o Tidewater)
*Registrado em 17/10/2026. Ticket KAN-69 (RASCUNHO). Pesquisa completa em `docs/pesquisa-tecnica-threejs.md`.*

Trocar o mar de faixas que andam por um mar calculado na placa de vídeo a cada quadro (FFT de oceano), a técnica
que o Tidewater usa no mesmo three.js:
- **Ondas a partir do vento.** O vento alísio de Fortaleza vira o "espectro" das ondas: mais vento, mar mais crespo.
  Liga direto com o gerador de vento (ideia acima).
- **4 escalas sobrepostas.** Mar aberto, marola e detalhe perto da câmera, sem o padrão se repetir.
- **Espuma onde a onda dobra.** Nasce na crista e some devagar, deixando rastro. Em faixas chapadas de Arcane.
- **Ondas quebrando na praia**, subindo na areia e deixando a areia molhada.
- **Jangadas boiando nas ondas certas**, lendo a altura do mar de volta.
- O desenho continua pintado: a FFT dá o formato e o movimento, a cor segue em faixas como hoje.
- Fica mais simples e rápido no WebGPU (compute). No WebGL dá, mas pelo caminho antigo e mais lento.

Outros aprendizados da mesma pesquisa: subir o three de r170 para a atual, suavização entre quadros (TAA) e testar
a curva de tom AgX.

## Pendências técnicas

- **Fase B: retícula e hachura presas ao mundo.** Ainda escorregam quando a câmera anda para frente. Ver `docs/pesquisa-referencias.md`.
- **Fases C a F da pesquisa:** sombra autoral, movimento (em 2 variável), linha, ferramentas e desempenho.
- **Grama na sombra:** ficou um tapete escuro e uniforme. Avaliar pontas mais claras.
- **Desempenho no campo de grama:** ~20 ms por quadro a 2000x1125 (50 fps); praia e calçadão ~14 ms. Sobra: a sombra suave (~3 ms, custo de cada pixel ler o mapa, não de quem projeta) e as folhas visíveis (~3 ms). Caminhos se precisar: resolução 1,0 em vez de 1,25, LOD da grama mais agressivo.

## Feito

- 16/10/2026: desempenho. Grama em blocos com teste de tela e LOD na CPU (praia 19 → 14 ms, calçadão 21 → 14 ms, campo 23 → 20 ms a 2000x1125). Medidor `maresia.medir` com variantes alternadas.
- 16/10/2026: camadas visuais, sombras estáveis, fase A (luz como máscara), grama densa, telhado sem piscar.
- 16/10/2026: manchas escuras ao longe (chão e rio). Eram do detector de dobras do traço: o tremor deslocava as amostras de profundidade por frações de pixel e o chão liso ganhava "dobras" no desenho do ruído. Amostras agora presas ao centro do pixel, medidas no inverso da distância.
- 16/10/2026: interação nas três camadas: grama com rastro, ondinhas, areia que afunda, vento nas folhas e roupas (1); física com bolas e cocos (2); tecla E para sentar, pegar, arremessar, pedir água de coco (3).
