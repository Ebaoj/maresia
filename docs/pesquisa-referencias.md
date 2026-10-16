# Pesquisa de referências: quem já fez algo parecido com a Maresia

Estudo de 16/10/2026, em quatro frentes feitas em paralelo:

1. **Palestras e textos de estúdio.** Seis fontes lidas na íntegra: Guilty Gear Xrd (GDC 2015), Hi-Fi Rush (GDC 2024, 191 slides com notas), Borderlands (SIGGRAPH 2010), Team Fortress 2 (NPAR 2007), Breslav et al. (SIGGRAPH 2007) e o tutorial de linhas de Bénard e Hertzmann (2019). Spider-Verse e Puss in Boots só por entrevistas técnicas: os talks da ACM ficam atrás de bloqueio anti-robô.
2. **Projetos open source de estética de quadrinho.** 22 projetos; o shader principal foi lido em 18 deles.
3. **Jogos e mundos estilizados na web.** 23 projetos; o código foi lido em 13.
4. **YouTube.** 34 buscas, 29 legendas baixadas e 25 transcrições lidas inteiras (não só títulos).

Marcação: **[V]** verificado na fonte primária ou no código; **[S]** fonte secundária confiável; **[I]** inferência nossa, que precisa de teste.

---

## 1. O retrato geral

- **Ninguém reproduz o Aranhaverso inteiro em tempo real com código aberto.** Os repositórios com "spiderverse" no nome são pequenos, quase todos parados, e prendem a retícula na tela. As boas ideias estão em projetos genéricos de NPR (renderização não realista): Dither3D, Malt, Goo Engine, Toon RP, NiloCat, Acerola.
- **No ecossistema Three.js, o pós-processamento de quadrinho da Maresia já é o mais completo que achamos.** O mais próximo, o *inkwell* (lançado em junho, sem estrelas), tem contorno Sobel, posterização e retícula CMYK, e só.
- **Os estúdios convergem em poucas ideias**, quase todas sobre *intenção* e não sobre matemática:
  - a sombra é uma cor escolhida;
  - os pontos de retícula representam a luz e a hachura representa a sombra;
  - nada de degradê;
  - o personagem tem luz própria;
  - a animação limitada precisa de poses, não só de quadros segurados.
- **Os jogos web mais ambiciosos de 2025 e 2026 migraram para WebGPU e TSL** (Bruno Simon, Tidewater, False Earth). O ganho real está em compute: grama e culling feitos na GPU. Para nós ainda não compensa (ver seção 6).

---

## 2. Onde a Maresia já está à frente

| O que fazemos | Por que é à frente | Quem chega perto |
|---|---|---|
| Pós de quadrinho completo numa passada: nanquim, retícula, hachura, desalinho, SSAO, bloom, névoa por altura, split toning, papel e grão | Nenhum projeto aberto junta tudo isso | inkwell (Three.js, parcial), Acerola (Unity, efeitos avulsos) |
| Peso do traço por categoria no alfa da cor, sem passe extra | Não achamos nada igual | Malt (textura de largura, com passe extra); casco invertido por material (NiloCat) |
| Contorno só pela profundidade, mais detector de quina pelo gradiente | Barato no WebGL e no caminho de Borderlands, que também usava só profundidade; a quina cobre parte das "linhas que não conseguimos" admitidas pela Gearbox | Malt, modo mobile do EMBYR |
| Traço que "ferve" a 8 fps deslocando as coordenadas de amostragem | É o "boil" bom: redesenho, não pisca-pisca. No código aberto só achamos ondulação estática | Ferramentas pagas (Boil para Blender, Inkboil) |
| Retícula compensada pelo giro da câmera | É a ideia do Obra Dinn. Quase todo projeto "spiderverse" prende a grade na tela | smoothslerp, que escala por z como gambiarra |
| Pose "em 2" com física e câmera a 60 fps | Mais refinado que quantizar o animador inteiro (Bomb Rush Cyberfunk) ou só oferecer função de tempo (inkwell) | Spider-Verse e Guilty Gear, no cinema e em luta com câmera fixa |
| Estabilidade temporal: sombra alinhada ao texel, ruído da oclusão preso ao mundo | Nenhum projeto toon examinado documenta isso; o Unity Open Projects lista como problema em aberto o tremor da sombra dura | Tidewater (outros métodos) |
| Pincelada triplanar presa ao mundo | Coerente quadro a quadro "de graça", como o TF2 defende; o Kuwahara em tela, que a maioria usa, cintila | Brushstroke Tools (geometria, Blender) |
| Mundo 100% procedural, sem download de modelos | Carrega na hora; o Messenger baixa cerca de 5,7 MB e o Bruno usa GLB e KTX2 | city-tour |
| Gravador de quadros com passo fixo para julgar movimento em vídeo | Não vimos equivalente; nenhum vídeo de line boil ou retícula avalia em movimento | Tidewater tem bench, não vídeo |
| Painel que cobre tudo e salva | O Bruno usa Tweakpane sem persistência | Guilty Gear cita o preview instantâneo como o "fator X" |

---

## 3. Onde fazemos diferente, e vale testar o caminho deles

**1. Pontos na luz, hachura na sombra.**
- Aranhaverso, Hi-Fi Rush e o pós do Enrique Ventura usam pontos para *luz*: realce, brilho, reflexo, janela acesa. A hachura fica para a *sombra* [V Hi-Fi Rush; S Spider-Verse].
- Nós usamos retícula para escurecer a sombra (meio-tom de mangá).
- Não é erro, mas o look "Aranhaverso" de fato é o contrário. Vale um modo no painel para comparar.

**2. A máscara vem da luz, não da cor final.**
- Hoje a retícula e a hachura decidem pela luminância da cor final. Asfalto, cabelo e roupa escura ganham pontos mesmo iluminados, e parede branca na sombra fica limpa demais.
- O Hi-Fi Rush estiliza camada por camada de luz [V]. O Enrique divide a cor final pelo albedo [V no vídeo].

**3. A sombra é uma cor escolhida.**
- Guilty Gear: sombra = cor base × textura de "tinta" por material; pele puxa para o vermelho [V].
- Hi-Fi Rush: volumes de cor de sombra pintados por região do mapa [V].
- NiloCat e UTS: cor própria para a sombra projetada [V código].
- Bruno Simon: cor de sombra por hora do dia [V código].
- Nós: só o split toning global.

---

## 4. O que adotar, em fases

Cada fase responde a uma pergunta só, no espírito "um problema de cada vez".

### Fase A: luz como máscara (o "motor" do visual)
*Pergunta: a imagem fica mais Aranhaverso quando a luz, e não a cor, decide pontos e hachura?*
- Gravar um termo de luz (N·L com sombra, sem albedo) numa segunda saída. O three r170 tem MRT com `count: 2`; o alfa continua com o peso do traço.
- Pontos na luz e hachura na sombra, com o tamanho do ponto pela luminância no lugar do degradê [Hi-Fi Rush, V].
- A oclusão (SSAO) vira hachura em vez de escurecer de cinza. Segundo o Hi-Fi Rush, isso esconde o ruído de poucas amostras [V].
- Brilho (bloom) feito de pontos que crescem com a intensidade [Hi-Fi Rush, Spider-Verse].
- Borda do ponto com `fwidth` em vez da largura fixa; raio pela raiz da cobertura (a tinta é área).

### Fase B: retícula presa ao mundo
*Pergunta: dá para acabar com os pontos escorregando quando a câmera anda?*
- Nas superfícies, projetar a grade no eixo dominante da normal em coordenada de mundo, sem misturar planos. O Hi-Fi Rush tentou triplanar e desistiu pelos artefatos [V]. O pós já reconstrói a posição e a normal.
- Duas oitavas misturadas pela distância, para o ponto ter tamanho quase constante na tela ("zoom infinito", Bénard 2009) [S].
- Grade de tela só para céu, brilho e névoa.
- No personagem, que é um objeto só, uma transformação 2D por quadro (Breslav) [V].
- Referência mais avançada, com código: Dither3D (pontos presos à superfície com tamanho constante na tela) [V código].

### Fase C: sombra autoral
*Pergunta: a sombra passa a "contar" o lugar e a hora?*
- Cor de sombra por material: pele, madeira, reboco, areia lilás, mar azul [Guilty Gear].
- Cor de sombra por região, aproveitando que a cidade é função de (x, z): beira-mar mais fria, ruas internas mais quentes [Hi-Fi Rush] [I].
- Borda da sombra projetada por uma rampa própria com degrau suavizado por `fwidth` [Toon RP, V código]. Uma faixa mínima de transição reduz o tremor em objetos que se movem [Unity Open Projects].
- Personagem com luz-chave própria e regra de valor (escuro sobre claro ou o inverso) em qualquer hora [Guilty Gear, Hi-Fi Rush, Spider-Verse, Tooth and Tail].
- Teste de sombra do personagem deslocado em direção à luz, para tirar a autossombra suja [NiloCat, V código].
- Sombra de disco ou cápsula para a multidão no lugar do mapa de 4096 [Hi-Fi Rush, Toon RP]: mais barato e sem sombra fina tremendo.

### Fase D: movimento
*Pergunta: o "em 2" parece intenção e não travamento?*
- **Ritmo variável pela energia:** 1 no impacto (decolar, aterrissar, arrancar), 2 no normal, 3 parado [Dikko, No The Robot, Puss in Boots].
- **Mantém:** câmera e deslocamento do personagem em 1. O Guilty Gear testou câmera com poucos quadros e "ficou feio".
- **Poses, não quadros segurados.** Poses mais extremas, smear de um quadro nas transições e um ruído pequeno de escala por pose ("imperfeição por chave") [Guilty Gear, V]. Animação suave apenas segurada "não convence" [Noggi].
- **Um relógio só:** tick de 24 Hz, com pose a cada 2 ticks e traço a cada 3, para tudo "bater" junto [I].
- **Multidão:** contador por pessoa e "em 3", para não trocarem de pose todas no mesmo quadro [Bomb Rush Cyberfunk, V código].
- **Alerta:** o modo "Miles a 12 fps" do Spider-Man da Insomniac é opcional, e jogadores acham estranho em monitor rápido [S].

### Fase E: linha
- **Traço só no lado da frente.** Só marca linha no pixel mais próximo da câmera. Evita traço duplo e faz o peso sair do objeto da frente (personagem diante do prédio) [Borderlands, V; Malt, V código].
- **Contra falso contorno em ângulo rasante.** Distância ao plano tangente dividida pelo tamanho do pixel no mundo [Malt, V código]; alternativa simples: limiar escalado por 1 − N·V [Roystan, EMBYR].
- **Espessura e névoa.** Espessura escalada pela resolução, um problema que a Borderlands admitiu não ter resolvido. O contorno entra antes da névoa, para as linhas sumirem com a distância [Borderlands, V].
- **Buffer de ID** para bordas que a profundidade não vê: calçada contra rua, porta contra fachada, borda da sombra projetada [webgl-outlines, V código; Rollerdrome].
- **Contorno grosso "adesivo"** no personagem e em objetos interativos, por jump flooding [bzztbomb, Three.js, V código].

### Fase F: ferramentas e desempenho (corre em paralelo)
- **Câmeras de revisão com nome** e um bench por vista com média, p95 e máximo, mais draw calls [Tidewater, coastal-simulation, V código]. Aproveita o `maresia.irPara`.
- **Flags na URL** para desligar sistemas (`?semGrama`, `?semPos`, `?semSombra`) e achar o que pesa [Tidewater, Bruno].
- **Pré-compilar os shaders** com `renderer.compileAsync` no carregamento, para não travar quando algo aparece pela primeira vez [Bruno, PreRenderer].
- **Grama:**
  - usar a semente (hoje usa `Math.random()`, contra a regra do projeto);
  - dividir em retalhos com culling e 2 LODs [SimonDev Quick_Grass, V código].
- **Qualidade adaptativa:** baixa a resolução sozinha quando o p95 passa do alvo [False Earth, Tidewater].
- **Fade por dither** na troca de LOD e para "ver através" de toldo ou árvore entre a câmera e o jogador; combina com a retícula [Tidewater, Bruno, V código].
- **Uma só função de onda** para o shader do mar e para as jangadas, que hoje balançam num ritmo que não é o das ondas [Tideglass Cove, V código].

---

## 5. Armadilhas que todo mundo cita

- **Retícula ou hachura presa à tela** sobre algo que se move: efeito "porta de box" [Breslav, Bénard, vários vídeos].
- **Contorno que liga e desliga por limiar vendido como "boil".** É erro que um humano não cometeria [Bénard e Hertzmann, V]. O boil bom desloca, não pisca.
- **Line boil exagerado:** o traço "incha e encolhe" ou pisca quando a espessura mínima é baixa [Pitchfork].
- **Personagem toon em cenário realista** [Overanalyzing Hi-Fi Rush, Alien Frontier]. Nós já evitamos.
- **Degradê suave de luz** denuncia o "motor 3D" [Hi-Fi Rush, Spider-Verse].
- **Grão trocado a cada quadro** parece chiado de vídeo; trocado devagar parece película [Moebius em 3D].
- **Painterly em espaço de tela** sem rastrear cada pincelada fica "borbulhando" em movimento [Useless Game Dev].
- **Clima, hora do dia e névoa achatam o contraste** e apagam o que importa [Tooth and Tail].

---

## 6. O que não fazer agora, e por quê

- **Migrar para WebGPU e TSL:** obriga a reescrever todo o GLSL e o `aranhaverso.js` e a pular a API do r170 para r18x. Vale quando precisarmos de compute.
- **Rapier, ecctrl ou React Three Fiber:** troca de stack. Só compensa com física de objetos dinâmicos ou veículo.
- **Sombra em cascata (CSM):** só se a sombra ao longe ficar ruim com sol baixo. Também conflita com nossas injeções de shader.
- **Oceano FFT e atmosfera física:** realistas, brigam com a paleta.
- **Kuwahara (filtro de pintura) em tela:** cintila em movimento, e ninguém resolveu isso no aberto.
- **Copiar código:**
  - o Messenger (abeto) é fechado, e o "código recuperado" no GitHub não tem licença;
  - o watabou é GPL e contamina quem incorpora;
  - o infinite-world do Bruno não tem licença.

---

## 7. O que vale assistir inteiro

1. **3D Toon Rendering in Hi-Fi RUSH**, GDC (57 min): https://youtu.be/gdBACyIOCtc. É o caso mais próximo do nosso: tudo toon, recursos 3D estilizados camada por camada, retícula em mundo contra tela, AO virando traço, 60 fps como prioridade.
2. **Guilty Gear Xrd's Art Style**, GDC (59 min): https://youtu.be/yhGjCzxJV3E. A melhor aula sobre intenção, e por que "em 2" exige poses e imperfeição.
3. **Inklines Across the Spider-Verse**, Blender/Sony (22 min): https://youtu.be/8yHuJLeAAsA. Como o estúdio do filme faz a linha acompanhar o movimento.
4. **How to "Spiderversify" your Animations!**, Dikko (23 min): https://youtu.be/ZH76nafJ2uI. Como misturar ritmos 1, 2 e 3 com câmera em 1.
5. *(Opcional)* **Tooth and Tail**, GDC (65 min): https://youtu.be/rSk8adHotDA. Leitura visual, valor e silhueta.

Rápidos e pontuais: **Outlines, Devlog 2** (Robin Seibold), sobre contorno em ângulo rasante: https://youtu.be/LMqio9NsqmM; e **Spiderverse post process**, de Enrique Ventura, sobre máscara de luz dividindo pelo albedo: https://youtu.be/QnOnjWXeDAA.

---

## 8. Fontes

**Estúdios e pesquisa**
- Guilty Gear Xrd, GDC 2015: https://www.ggxrd.com/Motomura_Junya_GuiltyGearXrd.pdf
- Hi-Fi Rush, GDC 2024: https://media.gdcvault.com/gdc2024/Slides/GDC+slide+presentations/Tanaka_Kosuke_3D_Toon_Rendering.pdf
- Borderlands, SIGGRAPH 2010 (curso Stylized Rendering in Games): https://stylized.realtimerendering.com/
- Team Fortress 2, NPAR 2007: https://www.cs.princeton.edu/courses/archive/fall07/cos597B/papers/mitchell-team-fortress.pdf
- Breslav et al., Dynamic 2D Patterns, SIGGRAPH 2007: https://research.autodesk.com/app/uploads/2023/03/dynamic-2d-patterns-for.pdf_recHXuFEA0TLJqiID.pdf
- Bénard e Hertzmann, Line Drawings from 3D Models: https://arxiv.org/pdf/1810.01175
- Spider-Verse (fxguide, Cartoon Brew, Foundry, SideFX, befores & afters): https://www.fxguide.com/fxfeatured/why-spider-verse-has-the-most-inventive-visuals-youll-see-this-year/ · https://www.cartoonbrew.com/feature-film/if-its-not-broke-break-it-sony-imageworks-renegade-approach-to-spider-man-into-the-spider-verse-167321.html · https://www.foundry.com/insights/film-tv/graphic-look-in-comp-spiderman · https://www.sidefx.com/community/spider-man-into-the-spider-verse/ · https://beforesandafters.com/2024/01/10/giving-spider-man-across-the-spider-verse-that-crucial-hand-made-quality/
- Puss in Boots, blog ACM SIGGRAPH: https://blog.siggraph.org/2024/02/crafting-the-enchanted-universe-of-puss-in-boots-the-last-wish.html/

**Código aberto de NPR**
- Dither3D: https://github.com/runevision/Dither3D
- Malt: https://github.com/bnpr/Malt
- Goo Engine: https://github.com/dillongoostudios/goo-engine
- Acerola: https://github.com/GarrettGunnell/Post-Processing
- Toon RP: https://github.com/Delt06/toon-rp
- NiloCat: https://github.com/ColinLeung-NiloCat/UnityURPToonLitShaderExample
- webgl-outlines: https://github.com/OmarShehata/webgl-outlines
- JFA em Three.js: https://github.com/bzztbomb/three_js_outline
- EMBYR: https://github.com/EMBYRDEV/godot-toon-outline
- inkwell: https://github.com/VelkinaStudio/inkwell
- Ben-Day quantizado: https://github.com/jingtaoh/Ben-Day-Dots-Shading
- Em 2 no Bomb Rush Cyberfunk: https://github.com/cspotcode/brc-animate-on-twos

**Web e Three.js**
- Bruno Simon, folio-2025: https://github.com/brunosimon/folio-2025
- Tidewater: https://github.com/dgreenheck/tidewater
- Tideglass Cove: https://github.com/iamtechartist/tideglass-cove
- coastal-simulation: https://github.com/iamtechartist/coastal-simulation
- False Earth: https://github.com/momentchan/false-earth
- Quick_Grass (SimonDev): https://github.com/simondevyoutube/Quick_Grass
- FluffyGrass: https://github.com/thebenezer/FluffyGrass
- InstancedMesh2: https://github.com/agargaro/instanced-mesh
- N8AO: https://github.com/N8python/n8ao
- city-tour: https://github.com/jstrait/city-tour
- Sketchbook: https://github.com/swift502/Sketchbook
- ecctrl: https://github.com/pmndrs/ecctrl
- three-mesh-bvh: https://github.com/gkjohnson/three-mesh-bvh
