# Arcane: como foi feito, quem tentou em jogo e o caminho para a Maresia

Pesquisa de 17/10/2026, pedida pelo Joabe: Arcane (Netflix, Fortiche/Riot) tem o 3D, as partes 2D e o
tom que o jogo precisa, sem o infantil de Gato de Botas e Aranhaverso. Duas frentes em paralelo: como a
Fortiche fez a série e quem já tentou esse visual em tempo real.

Legenda: **[F]** confirmado pela Fortiche ou pela Riot (entrevista com nome, palestra, blog oficial);
**[S]** fonte secundária sem atribuição; **[O]** observação nossa ou palpite da comunidade.

## 1. Em uma frase

O visual de Arcane mora na **pintura feita à mão**, não num shader: textura pintada sobre modelo 3D,
cenário em matte painting projetado, efeitos 2D desenhados por cima e uma composição só que junta tudo.
Ninguém lançou um jogo com esse visual, nem a própria Riot; o que existe são recriações de artistas e
técnicas de jogos vizinhos (Dishonored, Guilty Gear Xrd) que, somadas, chegam perto.

## 2. Como a Fortiche fez

### Pipeline
- Maya + Guerilla Render, composição no Nuke, gestão no Shotgun [F]. Textura no **Mari**, apresentado pela
  Fortiche e pela Foundry na FMX 2025 como peça central do visual pintado [F].
- Temporada 2: Houdini, Golaem (multidões), Yeti (cabelo dos figurantes), passes de render separados por
  pele, metal, roupa e cabelo [F].
- A palestra da SIGGRAPH Asia 2024 chama a abordagem de pragmática e "low-tech" [F].
- O que é 3D: personagens, adereços e câmera, animados no Maya com rigs leves [F].
- O que é 2D: fumaça, fogo, explosões, magia, água, porque o 2D pede menos preparo (Combe) [F].
- Cenários: "even the background, everything is painted" (Wanneroy) [F]; matte painting projetado em
  geometria simples para ganhar paralaxe [S]. Na T2, mais 3D por baixo da pintura (Martin Bailly) [F].
- Entregue em 2K de propósito: em 4K a imagem ficaria nítida demais para o estilo (Combe) [F].

### Personagens
- Textura pintada à mão, com "scratchy textures" vindas do concept art [F]. A Fortiche disse que não
  revelaria os segredos técnicos; resolução nunca divulgada.
- O que se vê na tela [O]: cor base com pincelada, valor e oclusão pintados; luz principal, sombra
  projetada e luz de recorte renderizadas de verdade, com a passagem luz/sombra mais dura que o realista;
  brilho pequeno e com cara de pincel.
- **Sem contorno de tinta global** [O, evidente]: as linhas estão dentro da textura (pálpebra, vinco,
  lábio, costura) e nos elementos 2D.
- Rostos com muitos testes de tamanho de olho e simplificação (Combe) [F]; centenas de blendshapes por
  personagem na T2 [F].
- Cabelo dos protagonistas em mechas sólidas com os fios pintados [O].

### Animação
- "Keyframe, keyframe, keyframe. There was no mocap on this show." (Wanneroy, T1) [F]. Na T2, mocap só
  nos ciclos de multidão (~500 ciclos) [F]. Muita referência filmada e bibliotecas de poses [F].
- Efeitos 2D a 12 fps, personagens a 24 [S, não confirmado]. Pela observação, poses seguradas e cortes
  bruscos [O].
- Borrão de movimento era o ponto fraco, resolvido "com muita gambiarra" na composição (Combe) [F].

### Tom, cor e câmera
- Charrue [F]: se dá para filmar, para que fotorrealismo? A pintura serve para dar peso emocional a um
  drama; o visual só veio depois de o tom do roteiro fechar.
- Duas cidades, duas linguagens [F]: Piltover simétrica, geométrica, limpa, câmera estável; Zaun
  assimétrica, orgânica, reciclada, câmera de ombro. Câmera com os "acidentes" do live-action.
- Paletas emocionais por momento e por personagem [F]; Georgel: alternam de propósito trechos escuros e de
  alto contraste [F].
- Imperfeição como identidade: riscos de lente, poeira, o "humano" (Linke) [F].

### 2D por cima do 3D
- 4 ou 5 artistas de efeitos 2D na T1 [S]; os rabiscos da Jinx, inspirados em Basquiat, ficam mais
  nervosos conforme a mente dela piora [F].
- T2: quase todo episódio tem uma montagem musical em estilo próprio (carvão, cartaz antigo, **quadrinho**
  no 203, foto de imprensa com grafite) [F].
- Tudo passa pela mesma composição: desfoque em camadas, uma gradação, grão e riscos por cima [F].

### Escala
- T1: 6 anos, ~350 pessoas, ~80 animadores. T2: 3 anos, ~450 a 500 artistas. Orçamento divulgado de
  US$ 250 milhões pelas duas temporadas (contestado pela Riot como incluindo marketing).

## 3. Quem já tentou em tempo real

- **Riot e Fortiche:** a Fortiche nunca fez jogo, só cinemáticas offline. 2XKO é cel shading com contorno
  preto (mais anime que Arcane); Song of Nunu, Mageseeker e Ruined King não têm o visual da Fortiche.
  O precedente comercial mais antigo é o próprio LoL (e WoW, Overwatch): textura difusa pintada com luz
  embutida [C].
- **Indies:** nenhum jogo lançado com visual Arcane real encontrado. Marvel Rivals ("Dynamic Comic",
  pincelada áspera) é o que os fãs mais comparam [S].
- **Recriações de artistas (não jogos):**
  - Michal Patton, UE5 (80.lv): o mais útil. Separa a luz da cor, remapeia em três máscaras (luz,
    meio-tom, sombra) e recorta as transições com pincelada projetada no mundo.
  - Arkady Nabirenkov, "Toxic Cannon" (80.lv, jul/2026): difuso 100% pintado à mão, rim light e luz
    frontal simulada, menos de 5 dias por prop; relaxou o pincel duro para não virar ruído.
  - Dissertação da HAW Hamburg (UE5, 2023): chegou perto, mas o motor voltado ao realismo atrapalhou [S].
  - Fórum da Unreal: cel shading só no pós-processamento não chegou lá; "most of the work will be on the
    painting".

### Técnicas que funcionaram
1. **Pintura com volume em massas** (Disney, Bolt 2008): "painterly" é juntar o detalhe em formas grandes,
   não encher de pincelada; a pintura reduzida a selo postal continua parecendo pintura.
2. **Luz separada e recombinada com máscaras pintadas** (Patton). A Maresia já separa a luz (o `gLuz` do
   MRT): o passo mais difícil dele, aqui, é de graça.
3. **Normais editadas** (Guilty Gear Xrd, GDC 2015): normais do rosto ajustadas à mão para a sombra cair em
   formas limpas, cor de vértice deslocando o limiar da sombra, luz própria por personagem, animação
   limitada sem interpolação.
4. **Cenário projetado**: render do blockout, pintura por cima, reprojeção num material sem luz. Funciona,
   mas "é preciso repintar para cada situação de luz".
5. **Efeitos 2D em flipbook**, sem contorno.
6. **Kuwahara** (filtro de pintura em tela): o texto de Maxime Heckel (React Three Fiber) mostra que só a
   versão anisotrópica de 8 setores fica boa, e cara.

### O que não funciona
- Filtro em tela cheia como solução principal: borra, tremula em movimento, vira "filtro de foto".
- Textura de papel presa à tela: o efeito "porta de box" (Meier, SIGGRAPH 1996); a pincelada tem de andar
  com o objeto.
- Luz pintada contra luz dinâmica: no ciclo de dia, a sombra pintada aponta para um lado e o sol para outro.
- Pincelada demais vira ruído. Normais automáticas sob cel shading viram manchas.

### Jogos vizinhos
| Jogo | O que ensina |
|---|---|
| Dishonored 1 e 2 | O mais próximo em tom e mundo: cidade industrial, adulto, textura pintada no Photoshop sem procedural |
| Guilty Gear Xrd / Strive | O método dos personagens: normais editadas, luz por personagem, animação limitada |
| Hades II | Cenário pintado com personagem 3D (câmera fixa ajuda) |
| Genshin | Sombra do rosto por mapa, útil mesmo sendo anime limpo |
| Hi-Fi Rush | Mundo inteiro toon a 60 fps |

## 4. O que muda na Maresia

### O choque com o que temos
- **Sai ou vira exceção:** retícula em tela cheia, contorno preto global, aberração cromática. Arcane não
  usa nenhuma das três.
- **Fica, adaptado:** a hachura vira pincelada de sombra (na cor da sombra, não preta); a animação "em 2";
  os efeitos 2D desenhados; o rosto desenhado (Arcane pinta as linhas do rosto, conversa bem).
- **Saída que preserva o quadrinho:** a própria Arcane usou estética de quadrinho numa montagem (T2, ep. 3).
  O filtro de quadrinho inteiro pode ficar para memórias e sequências especiais, como 1881 já é diferente.

### Caminho proposto (experimento antes de trocar o jogo)
1. **Pintor de luz no lugar do filtro de quadrinho** (2 a 3 dias): ler o `gLuz`, três faixas (luz,
   meio-tom, sombra) com cor própria por hora do dia (sombra fria, luz quente), transição recortada por
   pincelada em espaço de mundo (sem "porta de box"), contorno só na silhueta, fino e colorido. Liga e
   desliga no painel contra o atual.
2. **Uma esquina pintada** (3 a 5 dias): três módulos do casario e uma calçada com textura pintada (base no
   ComfyUI a partir do render do próprio módulo, limpeza à mão). Pintar oclusão, desgaste e volume, **não a
   direção do sol**: a direção vem do passo 1, e o ciclo de dia continua funcionando.
3. **Um personagem pintado** (4 a 7 dias): o neto com normais do rosto ajustadas, cor de vértice para
   sombra pintada, difuso pintado (frente, perfil e costas renderizados, img2img, reprojeção na UV, acabamento
   à mão), luz própria misturada ao sol, cabelo em mechas pintadas.
4. **Efeitos 2D em flipbook** (2 a 3 dias): fumaça do lampião, poeira, borrifo do mar, vapor do café.
5. Opcional: Kuwahara só no fundo distante, se o vídeo provar que não tremula.

Critério de cada passo: vídeo, nunca quadro parado (girar a câmera numa esquina; o personagem andando sob
três horários). Total estimado: 2 a 3 semanas para os experimentos; a cidade inteira depende deles.

Cuidado: não usar LoRA "Arcane" das comunidades (treinadas em quadros da série). Se precisar de estilo na
IA, treinar uma pequena com 20 a 40 pinturas aprovadas da própria Maresia.

Decisão depois dos experimentos: esquina boa e personagem não, o caminho é o de Hades II (mundo pintado,
personagem mais limpo); nenhum dos dois, o Aranhaverso fica.

## Fontes

Como a Fortiche fez:
- 3DVF, bastidores: https://3dvf.com/redaction/arcane-les-coulisses-de-la-serie-evenement-issue-de-league-of-legends/
- 3DVF, pipeline: https://3dvf.com/arcane-derriere-la-serie-les-secrets-du-pipeline/
- 3DVF, VIEW Conference T2: https://3dvf.com/en/fortiche-production-shares-the-secrets-behind-arcane-season-2-at-view-conference/
- 3DVF, equipe: https://3dvf.com/en/arcane-how-does-it-feel-to-work-on-a-major-hit-series/
- VFX Voice, T2: https://vfxvoice.com/riot-games-and-fortiche-get-revolutionary-with-arcane-season-2/
- AWN, Charrue e Wanneroy: https://awn.com/animationworld/unveiling-arcane-conversation-pascal-charrue-and-alexis-wanneroy
- Netflix Tudum, T2: https://www.netflix.com/tudum/features/arcane-season-two-behind-the-scenes
- SyncSketch, Wanneroy: https://blog.syncsketch.com/?p=75788
- iAnimate, Wanneroy: https://ianimate.net/podcasts/interview-with-arcane-head-of-character-animation-alexis-wanneroy
- Autodesk, multidões da T2: https://blogs.autodesk.com/media-and-entertainment/2025/03/26/crafting-crowds-fortiche-golaem-and-the-magic-of-arcane-season-2/
- Fortiche na FMX 2025: https://forticheprod.com/blog/projects-events/fortiche-rocks-fmx-2025-with-arcane-season-2-deep-dive/
- Fortiche no Polymanga: https://forticheprod.com/blog/fortiche-reveals-arcanes-magic-at-polymanga-festival/
- SIGGRAPH Asia 2024: https://asia.siggraph.org/2024/wp-content/plugins/linklings_wp_program/get_cal/?id=sess306
- SIGGRAPH 2023: https://history.siggraph.org/?p=131611
- Hollywood Reporter: https://www.hollywoodreporter.com/tv/tv-features/how-arcane-championed-human-intelligence-final-season-1236258103/
- 80.lv, Piltover e Zaun: https://80.lv/articles/riot-games-on-designing-arcane-s-piltover-zaun/
- 80.lv, texturas: https://80.lv/articles/a-closer-look-at-texturing-in-arcane-part-2
- RedShark [S]: https://redsharknews.com/why-netflixs-arcane-looks-so-good-how-fortiche-ramped-up-the-animation-pipeline

Tempo real:
- Patton, UE5: https://80.lv/articles/setting-up-a-stylized-character-shader-with-unreal-engine-5
- Toxic Cannon: https://80.lv/articles/creating-a-game-ready-cannon-in-an-arcane-inspired-style
- Jinx no ZBrush: https://80.lv/articles/how-to-model-texture-jinx-from-arcane-with-zbrush
- Dissertação HAW Hamburg [S]: https://reposit.haw-hamburg.de/handle/20.500.12738/16175
- Fórum da Unreal: https://forums.unrealengine.com/t/arcane-shader/2225784
- 2XKO: https://www.izzymedrano.com/2xko-1
- Guilty Gear Xrd, GDC 2015: https://www.ggxrd.com/Motomura_Junya_GuiltyGearXrd.pdf
- Disney, Bolt: https://media.disneyanimation.com/uploads/production/publication_asset/64/asset/painterlyCgConcepts.pdf
- Meier 1996: https://history.siggraph.org/?p=117028
- Heckel, Kuwahara: https://blog.maximeheckel.com/posts/on-crafting-painterly-shaders
- Fórum do Three.js: https://discourse.threejs.org/t/painterly-shader-with-brush-texture-in-three-js/80770
- Normais pintadas: https://www.blendernation.com/2023/09/20/a-simple-way-to-make-3d-feel-painterly/
- Lightning Boy, cabelo e projeção: https://www.blendernation.com/2022/03/29/arcane-style-tutorial-part-1-hair/ e https://www.blendernation.com/2022/04/07/arcane-style-tutorial-camera-mapping/
- Dishonored 2: https://80.lv/articles/asset-material-production-in-dishonored-2/
- Hi-Fi Rush: https://80.lv/articles/the-making-of-hi-fi-rush-s-3d-toon-rendering-style
- StableProjectorz: https://cgpress.org/archives/stable-projectorz-an-ai-tool-for-3d-texture-generation.html

Não foi possível ler: o documentário "Bridging the Rift", as gravações das palestras da FMX e da
SIGGRAPH, o PDF da dissertação de Hamburgo.
