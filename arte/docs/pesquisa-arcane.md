# Como Arcane foi feito e o que dá para trazer ao Maresia (17/10/2026)

Fontes: pesquisa na web (lista no fim), as duas análises do Gaveta (transcrição), os clipes Enemy e
Ma Meilleure Ennemie e o trailer oficial (quadros em resolução cheia, recortes 1:1 de rosto).

## O palpite "modelo hiper-realista até na textura + camada 2D por cima"

Meio certo, meio errado.

- **Errado:** a textura dos personagens é pintada à mão, não realista. No recorte 1:1 dos rostos
  (Enemy, 0:33 e 1:09) a pele é lisa, cor chapada suave, blush pintado, sem poro; pálpebra,
  sobrancelha e vinco do nariz são traços desenhados; cabelo em mechas pintadas. A geometria é
  limpa e lisa (nada facetado). Pascal Charrue (Bridging the Rift, Riot): nada é perfeitamente
  redondo, porque desenho não é perfeito.
- **Certo, mas não como filtro:** a "camada 2D" existe em três lugares:
  1. por baixo: textura pintada e cenário em matte painting projetado pela câmera;
  2. por cima: efeitos desenhados quadro a quadro (Adobe Animate) sobre o render;
  3. no compositing (Nuke): a luz do personagem é montada ali, a partir do fundo pintado; a luz
     3D serve só de guia. Profundidade de campo e motion blur também saem no comp.
- Nenhuma fonte fala de filtro global sobre render realista. Martin Bailly (supervisor de
  ambientes 2D, FMX 2025): "if we want you to feel that it's painted, we just paint it". O Gaveta
  diz o mesmo: "não adianta aplicar um filtro".

## Pipeline da Fortiche (fontes fortes)

- Maya, Houdini, Mari, Guerilla Render (não Arnold nem Redshift), Nuke, Adobe Animate para FX 2D.
- Cenário: tudo pintado pelo ponto de vista da câmera, camera mapping em todo lugar; o que aparece
  em um plano só é pintado, não modelado; fumaça e até corpos em cards. Temporada 2: ~4 mil matte
  paintings para ~7 mil planos. Pintores são ilustradores. Carvão de verdade, escaneado.
- Personagem: modelador entrega ao departamento de textura, que pinta (supervisora Candice
  Theuillon). Centenas de blendshapes no rosto. Animação toda em keyframe a partir de vídeo de
  referência gravado pelos animadores; departamento de "fix animation" depois.
- Entrega em 2K: em 4K ficaria "nítido demais" para o look (Jérôme Combe, 3DVF).
- "Em twos": sem fonte primária. Medição nossa nos clipes inconclusiva (o grão/textura por cima
  muda todo quadro, não dá para separar quadro repetido).
- Sem fonte de contorno automático (outline); as linhas vêm da pintura e do comp.

## Direção de arte (Gaveta, "A arte de ARCANE")

- "Concept art animado": acabamento imita pintura de concept art, marcas de tinta de propósito
  (até em objeto, onde parecem desgaste). O espectador precisa entender que é intenção.
- Caricato funciona melhor que realista (a Pixar só acertou humanos caricaturando). Bate com o
  avô realista reprovado e o estilizado aprovado.
- Cada ambiente com um movimento artístico claro: cidade rica Art Déco (simetria, geometria,
  dourado), subsolo steampunk/dieselpunk, toques de Art Nouveau. Art Déco é exatamente 1932.
- Composição pensada por plano (simetria, personagem no centro do vitral).

## O que observei nos quadros

- Luz colorida forte vinda do cenário (verde, rosa, laranja), recorte de luz na borda do personagem.
- Muita névoa e profundidade de campo, bokeh, partículas; fundo sempre mais solto que o personagem.
- Mudança de estilo por sequência nos clipes (neon, colagem, giz), o que é liberdade de clipe.

## Técnicas de jogo em tempo real (dá para navegador)

| Técnica | Fonte | Resolve | Custo | Depende de |
|---|---|---|---|---|
| Normais editadas + cor de vértice deslocando o limiar da sombra + cor de sombra escolhida (tint) + luz própria por personagem + casco invertido | Guilty Gear Xrd, GDC 2015 (ggxrd.com/Motomura_Junya_GuiltyGearXrd.pdf) | sombra limpa e desenhada em toon | baixo | modelo |
| Mapa de limiar/SDF de sombra no rosto | Genshin (comunidade), Hi-Fi Rush (GDC 2024) | rosto sem mancha de sombra | quase zero | textura por rosto + osso da cabeça |
| Gradient Lambert com rampas + pele com subsurface falso + fresnel | Valorant (blog técnico Riot) | leitura e cor de pele | baixo | textura e cor de vértice |
| Kuwahara | maximeheckel.com | ar de pintura | médio a alto | nada; borra detalhe, não cria luz |
| Matte painting projetado em geometria simples | Fortiche | cenário pintado de verdade | baixo | câmera limitada ajuda |
| FX 2D em flipbook/cards | Fortiche | fumaça, poeira, brilho desenhados | baixo | arte 2D |

## Ordem sugerida para o Maresia (inferência, sobre as fontes)

1. Personagem: albedo chapado sem sombra embutida (o Tripo embute sombra), geometria lisa,
   pincelada intencional na pintura; caricato em vez de realista.
2. Shader: rampa/step com cor de sombra por material e luz por personagem; mapa de sombra no rosto.
3. Cenário: matte painting projetado onde a câmera deixa; cor de luz e recorte tirados de cada zona.
4. FX 2D em cards; pós leve (profundidade de campo, grão de papel, grading por lugar).
5. Animação: atuação com intenção e referência antes de truque; quadros segurados só nos FX.

## Fontes

Fortiche e Arcane: forticheprod.com/faq ; youtube.com/watch?v=gCJIJG6Lz84 (Foundry/FMX 2025) ;
youtube.com/watch?v=Qd1rOtu4SMI (Bridging the Rift 3) ; youtube.com/watch?v=n542WbzYQ7Y (Anima 2023) ;
3dvf.com (bastidores T1 e View Conference T2) ; blogs.autodesk.com (Golaem, T2) ;
blog.syncsketch.com/creator-stories/arcane-fortiche ; 80.lv (texturing in Arcane 1 e 2, Piltover/Zaun) ;
Gaveta: youtube.com/watch?v=lN_XvXrTXtQ e youtube.com/watch?v=R7EFjLs5ipo.
Jogos: ggxrd.com (Motomura) ; 80.lv (Hi-Fi Rush) ; github.com/NoiRC256/URPSimpleGenshinShaders ;
riotgames.com/en/news/valorant-shaders-and-gameplay-clarity ; fxguide e foundry (Spider-Verse) ;
blog.maximeheckel.com (painterly, Moebius) ; threejs.org (MeshToonMaterial, OutlineEffect).
Fracas (não confiar): redsharknews.com (twos, luz pintada na textura), sites de SEO sobre Arnold/Redshift.
