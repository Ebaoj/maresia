// Todos os números ajustáveis do jogo. O painel de debug (tecla H) mexe aqui.
// O que você ajusta no painel fica salvo no navegador; "Restaurar padrão" volta a isto.

export const PADRAO = {
  tempo: {
    hora: 16.6,          // começa na hora dourada (luz-arcane, item 3: o forte de 1932 da referência)
    velocidade: 1.0,     // horas do jogo por minuto real
    pausado: false,
  },
  estilo: {
    // 'arcane' (pintor de luz nos materiais, sem retícula, docs/pesquisa-arcane.md; escolha do Joabe em
    // 17/10/2026, para ver como fica) ou 'quadrinho' (o filtro Aranhaverso). Trocar pede recarregar
    visual: 'arcane',
    arcSombra: 0.38,       // abaixo disso de luz, a faixa de sombra
    arcLuz: 0.72,          // acima disso, a faixa de luz; entre as duas, o meio-tom
    arcSuave: 0.08,        // largura da passagem entre as faixas
    arcPincel: 0.35,       // quanto a pincelada recorta a borda das faixas
    arcCorSombra: '#6b7190', // sombra fria e dessaturada, com luz rebatida do céu (a #4f5fa8 saturava a areia de azul; direção de arte 17/10)
    arcNivelSombra: 0.34,
    arcNivelMeio: 0.8,
    arcNivelLuz: 1.1,
    arcLinha: 0,           // contorno automático: o Arcane não tem (linha só desenhada na textura, em detalhe); 0,7 escurecia os troncos
    arcSaturacao: 1.05,
    arcGrao: 0.04,
    arcContraste: 1.18,    // gradação: contraste (curva em S) e exposição, menos lavado
    arcExposicao: 0.86,    // 3b: 0,93 deixava a imagem alta demais (chão estourado) contra a referência
    arcTextura: 1.0,
    reflexoLente: 1.0,     // lens flare quando a câmera olha para o sol (fantasmas, faixa anamórfica, anel); 0 desliga
    arcRecorte: 0.6,       // luz de recorte quente nas bordas contra o sol
    arcAr: 2.0,            // profundidade de ar: o fundo se separa em camadas (multiplica névoa e maresia); 1,8 deixava o fundo tão nítido quanto a frente, 2,6 lavava tudo de bege (3b)
    arcCeu: 1.0,           // céu pintado: pinceladas longas e nuvens de pincel (0 = céu liso)
    arcCeuPintado: 1.0,    // o passe do céu: gradiente de verdade (azul no alto, quente no horizonte), nuvens em massas e halo pintado no sol (0 = o céu de antes)
    arcLuzEstrutura: 1.0,  // a luz: sombra que esfria sem mudar a cor do objeto, estrutura de valor e ar tingido pela hora (0 = a luz de antes)
    arcGradeCal: 1.0,      // a gradação final: curva de contraste e saturação pela paleta "cal e sal" (0 = sem gradação)
    arcGradeContraste: 1.15,
    arcGradeSaturacao: 1.05,
    // hora dourada (luz-arcane, item 3): sol baixo de dia = luz laranja, sombra longa e azul funda, mais contraste
    arcDourada: 1.0,             // força (0 = a luz de antes em todas as horas)
    arcDouradaLuz: '#ffb36b',    // para onde a luz do sol puxa (3b: '#ff9d55' alaranjava tudo)
    arcDouradaSombra: '#5a4a8e', // para onde a sombra e a luz de céu puxam (conceito-sertão 2: sombra violeta no fim de tarde; era o azul '#36508a')
    arcDouradaAltura: 0.2,       // altura mínima da luz que faz sombra no auge da hora dourada (0,42 = sombra curta de antes)
    arcDouradaContraste: 0.15,   // contraste extra no auge
    // 3b (revisão do orquestrador, alvo forte-1932-joabe): menos véu, céu petróleo, faixa de valor larga, sombra fria
    arcCeuTopo: '#1d4a86',       // azul fundo do alto do céu de dia (sertão, 21/10: azul, não mais petróleo '#1c4a63')
    arcCeuPetroleo: 0.85,        // quanto o alto do céu puxa para ele
    arcCeuRampa: 0.75,           // sertão: altura (seno) em que o azul fundo chega; perto do horizonte o céu fica desbotado e quente (0,45 era o céu petróleo do 3b)
    arcSertao: 1.0,              // sertão ao meio-dia: sombra curta, dura e escura (luz de céu mais fraca, faixa de sombra mais funda)
    arcArPoeira: 0.55,           // sertão: de dia a distância vai para a poeira clara e quente do horizonte (0,2 = o azul frio do item 6)
    arcCeuPincel: 1.0,           // item 5: riscos de pincel seco, grão e banco de cúmulos no horizonte
    arcCeuMeio: '#d3d9d0',       // a parada do meio do céu (azul claro esverdeado entre o horizonte e o alto)
    // céu de agosto em Fortaleza ao meio-dia (21/10/2026, pedido do Joabe): azul fundo, limpo e saturado da estação seca,
    // só um pouco mais claro no horizonte, pouca névoa. Entra com o sol alto (das ~9h às ~15h); a hora dourada e a noite
    // ficam como estavam
    arcCeuAzul: 1.0,               // força (0 = o céu desbotado do sertão em todas as horas)
    arcCeuAzulTopo: '#1a56b8',     // o alto
    arcCeuAzulMeio: '#5e98d9',     // o meio
    arcCeuAzulHorizonte: '#dde8f0', // o horizonte: névoa clara, quase branca, de sal e sol (revisão 2: '#9cc3ea' saturava até o chão)
    arcCeuAzulRampa: 0.6,          // altura (seno) em que o azul fundo chega com o sol alto (0,32 dava azul chapado até o horizonte)
    arcCeuAzulAr: '#c3d5e5',       // a cor do ar na distância ao meio-dia (névoa clara e azulada)
    arcCeuCumulos: 0.75,           // cúmulos redondos pintados rente ao horizonte ao meio-dia: fração das posições com nuvem
    arcCeuCumulosTamanho: 1.2,     // tamanho deles
    nuvens: 70,                    // cúmulos de alísio no céu (quantos); vale ao recarregar
    nuvensVento: 4.0,              // velocidade com que vão para oeste, levados pelo alísio de leste (m/s)
    arcGradeNeutro: 0.12,        // quanto o neutro puxa para o cal na gradação (0,45 dava véu bege em tudo)
    arcArTinta: 0.75,            // força da cor do ar na distância (conceito-sertão: o fundo lavado, pálido, de baixo contraste; o peso cresce no fundo, km * (0,4 + 0,6 km), então o meio não lava)
    arcArClareia: 0.45,          // item 6: quanto o fundo clareia para a cor do ar (perspectiva atmosférica)
    arcPreto: 0.04,              // níveis: o que vira preto (conceito-sertão: escuro com cor, nunca preto; era 0,07)
    arcBranco: 0.94,             // níveis: o que vira branco (a cal ao sol)
    arcSombraFria: 0.6,          // a luz do chão puxa para a do céu (sombra azul, não marrom)
    arcOclusao: 0.55,            // sombra de contato no visual Arcane
    // reboco envelhecido (item 4, src/mundo/desgaste.js) e quina clara (na tela)
    arcDesgaste: 1.0,            // manchas de caiação, escorridos, umidade, sujeira na base, reboco caído mostrando a pedra
    arcAresta: 0.7,              // quina gasta e clara (perto, até ~45 m)
    arcFx2d: 0,                  // item 7: traços de tinta verde e amarela e spray de retícula por cima (fx2d.js); 0 = desligado
    // pincelada na tela (src/pos/pintura.js): Kuwahara anisotrópico sobre a cor da cena, a superfície vira mancha de tinta
    arcPintura: 0.85,       // força (0 desliga o passe e o custo); 0,85 desde a direção do sertão (21/10): modesto, objeto nítido
    arcPinturaRaio: 3.0,    // raio da pincelada, em pixels da imagem (não muda o custo)
    arcPinturaAniso: 1.0,   // quanto a pincelada se estica ao longo das bordas (menor = mais esticada)
    arcPinturaNitidez: 10,  // quanto a borda forte resiste (setor de menor variância ganha)
    arcPinturaBorda: 1.0,   // protege borda forte e traço fino (fio, poste, rosto) do filtro: a pincelada fica dentro da superfície
    arcPinturaMeia: false,  // passe da pincelada em meia resolução (um quarto do custo, borda mais mole)
    arcPinturaAmostras: 4,  // grade de amostras: 4 (12 amostras, padrão para o M1), 5 (21) ou 7 (37, mais limpo e mais caro)
    arcTela: 0.05,          // trama da tela de pintura por cima de tudo
    espessuraLinha: 1.3,
    limiarProfundidade: 0.07,
    limiarNormal: 0.55,
    distanciaLinha: 160,
    pesoCenario: 0.55,      // força do traço no cenário (personagem = 1)
    tremorLinha: 1.4,      // o traço "ferve", como desenho à mão
    fpsTraco: 8,           // quantas vezes por segundo o traço muda
    corTinta: '#1a1033',
    intensidadeTinta: 0.92,
    aberracao: 0.0,        // canais RGB descasados nas bordas (desligado no presente: quadrinho baixo)
    desalinho: 0.6,        // cor deslocada do traço, como gibi mal impresso (na memória vai a 3,2)
    tamanhoPonto: 6.5,     // retícula (pontinhos) nas sombras
    limiarReticula: 0.4,
    intensidadeReticula: 0.85,
    corReticula: '#3b1d8f',
    tintaReticula: 0.4,
    hachura: 0.55,         // risquinhos nas sombras mais fundas
    espacoHachura: 7,
    limiarHachura: 0.24,
    saturacao: 1.28,
    exposicao: 1.0,
    grao: 0.045,
    papel: 0.07,
    vinheta: 0.38,
    desfoqueFundo: 0.7,
    focoDistancia: 140,
    linhasVelocidade: true,
    pincel: 0.35,          // variação de pincelada nos materiais
    pincelEscala: 0.6,
    oclusao: 0.3,          // cantos escurecem (pouco: o principal virou hachura, ver hachuraOclusao)
    raioOclusao: 1.4,
    brilho: 0.7,           // lâmpadas, janelas e sol estouram em halo
    limiarBrilho: 0.95,
    nevoaDensidade: 0.00076, // névoa em camadas, mais densa embaixo: a densidade é por unidade de jogo, e a praca descomprimida levou o centro a 1:1 (fator 2,88)
    nevoaQueda: 0.045,
    maresia: 0.0021,         // ao longe a cor perde saturação e contraste (perspectiva atmosférica): taxa por metro de verdade, e a praca descomprimida levou o centro a 1:1 (fator 2,88)
    corSombra: '#7f8bb0',  // sombra lavanda clara (direção de arte: sombra com luz rebatida, nunca roxo escuro)
    tomSombra: 0.18,
    corLuz: '#ffd08a',     // luz puxa para o quente
    tomLuz: 0.22,
    // luz como máscara (fase A): pontos na luz, hachura na sombra, decididos pela luz recebida
    pontosNaLuz: true,       // desligado: volta ao modo antigo (retícula escurece a sombra)
    limiarLuzPontos: 1.1,    // a partir de quanta luz aparecem pontos (só realces fortes)
    intensidadePontosLuz: 0.4,
    corPontoLuz: '#fff1c9',
    limiarHachuraLuz: 0.16,  // abaixo de quanta luz entra hachura (só no quase breu: hachura tem função)
    hachuraOclusao: 1.0,     // cantos (oclusão) viram hachura
    hachuraCruzada: 0.7,     // segunda camada de hachura nas sombras mais fundas
    brilhoEmPontos: 0.85,    // o brilho das luzes vira pontos que crescem com a intensidade
    distanciaReticula: 120,  // pontos e hachura somem até essa distância (m), contra cintilação ao longe
    // época (direção de arte): 0 = 1932, presente em quadrinho baixo; 1 = 1881, memória impressa em cinco tintas
    memoria: 0,
    tonsLuz: 5,            // degraus do toon (5 = o do quadrinho; 2 = chapado, só para testar); recarregar
  },
  personagem: {
    velocidade: 4.5,
    corrida: 9.0,
    pulo: 9.0,
    gravidade: 25,
    quantosAtores: 16,     // atores de fundo perto do jogador (0 desliga; recarregar)
    fpsPose: 12,           // animação "em 2": 12 poses por segundo
    posicaoEm2: false,     // ligado: o corpo inteiro anda em 2 (mais Aranhaverso, mais travado)
    corpoNovo: true,       // esqueleto padrão com os movimentos do Mixamo (jogador/corpo.js); desligado = boneco antigo
    // corpo do jogador: 'neto-tripo' (o menino do Tripo, escolha do Joabe em 17/10/2026), 'neto' (MakeHuman,
    // arte/finais/neto-mpfb.glb) ou 'boneco' (cápsulas, para testes); recarregar. Nome novo para o valor salvo
    // no navegador de antes não passar por cima
    modeloJogador: 'neto-vestido',
    chapeu: false,         // chapéu de palha no neto (o Joabe tirou em 16/10/2026); recarregar
    ombros: 0.9,           // largura dos ombros do neto (1 = como veio do modelo, largo de adulto); recarregar
    folgaCamisa: 0.012,    // folga máxima da camisa sobre a pele no ombro e na manga, em metros (0 = como veio); recarregar
    dobras: 1.0,           // dobras do pano desenhadas no cotovelo, joelho e cintura (dobras.js); 0 desliga
    dedosReferenciaAndar: 'mm-curva-andando', // falanges de caminhada gravada; recarregar
    dedosFecharCiclo: .12, // fração final para emendar a repetição das falanges; recarregar
    ammoClusters: 128, // compatibilidade com o comparador anterior arquivado
    ammoSubpassos: 2, // subpassos nativos por atualização da camisa; recarregar
    ammoPassosAssentar: 48, // pré-simulação amortecida antes de exibir a camisa; recarregar
    ammoIteracoes: 4, // costuras e contatos nativos por subpasso; recarregar
    ammoPeleMargem: .008, // margem da superfície animada do tórax (m); recarregar
    ammoPeleAltura: 0, // início do contato detalhado, fração da altura do tórax; recarregar
    ammoPeleLargura: 1, // fração da meia largura do tórax com contato detalhado; recarregar
    ammoBracoMargem: .01, // margem local para o contato rápido na manga (m); recarregar
    ammoBracoInicio: .18, // distância do centro em T onde começa a região do braço (m); recarregar
    ammoBracoFim: .40, // termina perto do cotovelo (m); recarregar
    ammoBracoReducao: .6, // redução só da superfície de contato dos braços; recarregar
    ammoCalcaAltura: .77, // início do contato detalhado na calça em repouso (m); recarregar
    ammoCalcaReducao: .8, // redução só do colisor da calça; recarregar
    ammoPeleReducao: .6, // redução de vértices só do colisor, corpo visível intacto; recarregar
    ammoEncaixeFolga: .012, // folga inicial para vestir a camisa fora da pele (m); recarregar
    ammoEncaixeMaximo: .05, // limite do ajuste inicial da peça (m); recarregar
    ammoBarraExtra: .01, // extensão do molde na barra (m); recarregar
    ammoBarraTransicao: .025, // faixa que suaviza essa extensão (m); recarregar
    roupaEspessura: 0.006, // margem de contato do tecido com a pele (m); recarregar
    roupaFolga: 0.045,     // liberdade no tronco da camisa (m); recarregar
    roupaBarra: 0.08,      // liberdade da barra (m); recarregar
    roupaManga: 0.06,      // liberdade das mangas (m); recarregar
    roupaGola: 0.015,      // faixa superior sustentada (m); recarregar
    roupaFlexao: 0.02,     // compliance de flexão: maior dobra mais; recarregar
    roupaAmortecimento: 0.5, // dissipa movimento do tecido; recarregar
    roupaIteracoes: 8,     // iterações dos contatos e costuras; recarregar
    panoSolto: 1.0,        // barra da camisa, mangas e boca da calça soltas (pano.js); 0 desliga
    avo: true,             // o avô parado perto do começo do jogo (avo.js), para julgar o modelo. Vale ao recarregar
    avoTripo: true,        // segundo avô ao lado, o do Tripo (textura pintada), para comparar; recarregar
    avoTripoMovimento: 'velho-parado', // o do Tripo nasce de coluna reta: a curva vem do movimento de velho
    rostoAvo: true,        // avô de rosto liso com olhos e sobrancelhas desenhados (sem boca: o bigode cobre)
    avoMovimento: 'parado', // 'parado' ou 'velho-parado' (curva de novo por cima da coluna curvada do modelo)
    roupaJolt: false,      // roupa inteira como pano no Jolt (roupa.js). Desligado por padrão (decisão do Joabe, 20/10/2026): a roupa segue o esqueleto, como na imagem aprovada. Com o pano ligado a camisa ainda atravessa a pele em 2,58% dos raios ao andar; mede-se pelo painel. Vale ao recarregar
    clavicula: 18,         // inclinação da clavícula para baixo, em graus (o neto nasce com 28 a 33°: ombro caído)
    rostoNeto: true,       // neto de rosto liso com olhos e boca desenhados em 2D (rosto.js), a escolha de 16/10/2026; desligado = rosto modelado; recarregar
    estiloRostoNeto: 'minimo-brilho', // desenho do rosto (rosto.js, ESTILOS); o Joabe gostou do mínimo brilho (16/10/2026)
    velocidadeNova: 1.8,   // com o corpo novo: gente de verdade anda a ~1,4 m/s e corre a ~3,5 m/s
    corridaNova: 4.5,
    peNoChao: true,        // IK: cada pé pisa no chão de verdade (ladeira, degrau, duna)
    inclinar: true,        // o corpo inclina na curva e na arrancada
    afundaAreia: 0.02,     // m que o corpo afunda na areia seca (era 0,045: os dedos sumiam no chão)
    joelhos: 6,            // graus: parado, o quadril sobe até o joelho mais dobrado ficar nisso (o mocap vem com 15 a 40°)
    motionMatching: true,  // locomoção por motion matching (motion-matching.js); desligado = mistura antiga por velocidade
    fpsAcao: 24,           // correndo e no ar a pose anda "em 1" (Aranhaverso: ação mais fluida, calma em 2)
    pausaPulo: true,       // a pose segura alguns quadros no alto do pulo
    multiplos: 1.0,        // cópias do corpo em retícula ficando para trás na corrida e no pulo (0 desliga)
  },
  camera: {
    distancia: 5.0,        // fatia: câmera mais perto e mais baixa, composta como ilustração
    altura: 1.0,
    fov: 50,
    inclinacaoCorrida: 0.05,
  },
  grama: {
    raio: 109,          // unidades de jogo em volta do jogador: o mundo comprimido valia 38, e a praca descomprimida levou o centro a 1:1 (fator 2,88)
    quantidade: 200000,
    altura: 0.75,
    largura: 0.07,
    lodPerto: 8,           // até quantos metros da câmera ficam todas as folhas
    fracaoLonge: 0.3,      // fração de folhas que sobra longe
    larguraLonge: 2.0,     // quanto as folhas de longe engrossam para compensar
    virarCamera: 0.6,      // 0 = direção sorteada, 1 = sempre de frente para a câmera
    ventoForca: 0.65,
    ventoVelocidade: 0.35,
    ventoEscala: 0.07,
  },
  interacao: {
    recuperaGrama: 0.5,    // quão rápido a grama amassada volta a ficar de pé (por segundo)
    amorteceOnda: 0.985,   // quanto as ondinhas da água duram (mais perto de 1 = mais tempo)
    pegadas: true,
    duracaoPegada: 25,     // segundos até a pegada sumir na areia seca
    ventoCoqueiros: 1.0,   // quanto as folhas dos coqueiros e as roupas balançam
  },
  mar: {
    corFundo: '#0b4a8c',
    corRaso: '#25d0c4',
    corEspuma: '#f6fbff',
    ondas: 1.0,
  },
  calamento: {
    bloco: 0.3,        // comprimento do paralelepípedo (unidades de jogo; 1 unidade = 1 m no jogo)
    largura: 0.15,     // altura da fiada
    junta: 0.04,       // a fresta de areia entre dois blocos
    desencontro: 0.5,  // quanto a fiada seguinte desliza (0 = fiadas alinhadas, 0.5 = desencontradas)
  },
  chao: {
    centroRaio: 650,      // raio (em metros de verdade) do Centro calçado
    centroBorda: 180,     // a faixa em que o calçamento acaba
    rodeiroForca: 1.0,    // força do sulco da carroça na rua de terra
    rodeiroPos: 0.16,     // onde o sulco fica na rua (0 = meio da rua, 0.5 = borda)
    rodeiroLarg: 0.09,    // a largura do sulco (fração da meia-largura da rua)
    desgaste: 0.7,        // o quanto o meio da rua está polvilhado pelas rodas
    mato: 0.55,           // o mato ralo do quintal
    // relevo pintado do chão (src/mundo/relevo-chao.js, 21/10/2026): altura fina que vira luz e sombra
    relevo: 1.0,          // força geral (0 = o chão liso de antes)
    relevoAreia: 1.0,     // ondulação do vento, riscos e morrotes na praia e nas dunas
    relevoTerra: 1.0,     // torrões, pedrisco e o sulco da roda na rua e no quintal
    relevoPedra: 1.0,     // topo abaulado e junta funda do paralelepípedo
    relevoRacha: 1.0,     // placas e rachaduras da terra seca (Campo do Urubu)
    relevoLonge: 70,      // metros em que o relevo some (custo e chiado de longe)
    relevoCor: 0.8,       // quanto a fresta escurece e a pedra clareia
    relevoMeioDia: 0.8,   // relevo a mais com o sol a pino (a luz de cima quase não marca inclinação pequena)
    ondaAreia: 0.34,      // comprimento da ondulação da areia (m)
    solto: true,          // chão solto em 3D perto da câmera: pedrisco, conchas, torrões e touceiras secas (chao-solto.js)
    soltoRaio: 40,        // até quantos metros da câmera ele aparece
    soltoDensidade: 1.0,  // quantas peças (1 = o padrão); vale ao recarregar
  },
  mundo: {
    passoSombraMin: 4,     // a luz da sombra anda em passos de N minutos de jogo (~1° a cada 4): sem isso a borda das sombras treme; 0 = contínuo
    sombras: true,
    resolucaoSombra: 4096, // 4096 nítida, 2048 mais leve (a sombra é o maior custo do quadro)
    cacheSombra: true,     // KAN-74 (F4): sombra dos objetos parados em cache (só WebGL); refaz com o sol, ao andar mais que cacheSombraRaio ou quando um parado aparece ou some. Ver docs/motor-f4-cache-sombra.md
    cacheSombraRaio: 43,   // metros que o jogador anda antes de a janela de sombra (173 m) se recentrar; a sombra sempre cobre pelo menos 173 - raio
    nevoaPerto: 403,     // unidades de jogo: 140 no mundo comprimido, vezes o fator 2,88 da descompressao da praca
    nevoaLonge: 2593,
    urubu: {
      alturaGalpao: 5.2,    // altura da parede do galpão de folha de zinco (src/mundo/urubu1932.js)
      alturaCerca: 1.8,     // altura do arame que cerca as tarefas de terra
      gente: 24,            // gente no campo: fila da cozinha, fila do portão e trabalho na terra
    },
  },
  fatia: {
    travar: true,          // prende o jogador na fatia vertical da Praia do Peixe (mundo/fatia.js)
  },
  desempenho: {
    resolucao: 1.25,
    mostrarFps: true,      // contagem de FPS no alto da tela
    renderizador: 'webgl', // 'webgpu': o motor novo em teste (KAN-67), ainda sem o pós e com parte dos materiais
    tamBloco: 192,         // metros por bloco de cópias (árvores, plantas, objetos); maior = menos chamadas de desenho. A/B na L4 17/10: 96 -> 192 tira 22% das chamadas e dá +6 a +16 FPS parado; 384 oscilou
    copiasMinBloco: 12,    // KAN-70: bloco com menos cópias que isso se junta aos vizinhos num bloco 2x maior (árvores espalhadas davam 2 cópias por bloco)
    tamBlocoMax: 768,      // até este tamanho; 0 em copiasMinBloco desliga a junção
    motorPlaca: false,     // KAN-72: no WebGPU, árvores e plantas no desenho guiado pela placa (three-virtual-geometry): menos objetos por quadro. Desligado até passar na régua
    atoresVat: true,       // KAN-74 fase 2b: atores de fundo como cópias com a pose em textura de ossos; só vale no WebGPU; recarregar
    resolucaoDinamica: false, // R1 (robustez no M1): a resolução segue o tempo de quadro (desce quando a maioria dos quadros estoura o orçamento, sobe devagar quando sobra); teto = resolucao. Desligada até passar na medição
    resolucaoMin: 0.6,     // R1: menor escala que a resolução dinâmica aceita
    orcamentoQuadroMs: 16.7, // R1: orçamento de tempo de quadro da resolução dinâmica (60 Hz)
  },
  laboratorioFisica: {
    lado: 14, passoTerreno: .5, semente: 1932,
    bolas: 6, cocos: 10, alturaQueda: 2,
    gravidade: 25, subpassos: 2,
    raioRoteiro: 2.5, duracaoMedicao: 12,
    cameraDistancia: 6, cameraAltura: 3,
    resolucao: 1.25,
  },
  audio: {
    volume: 0.6,
  },
}

const CHAVE = 'maresia.config.v8'

function copiaProfunda(o) { return JSON.parse(JSON.stringify(o)) }

function mesclar(base, salvo) {
  for (const k of Object.keys(base)) {
    if (salvo && k in salvo) {
      if (typeof base[k] === 'object' && base[k] !== null) mesclar(base[k], salvo[k])
      else if (typeof salvo[k] === typeof base[k]) base[k] = salvo[k]
    }
  }
  return base
}

export function carregarConfig() {
  const cfg = copiaProfunda(PADRAO)
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE) || 'null')
    if (salvo) mesclar(cfg, salvo)
  } catch { /* navegador sem storage: segue com o padrão */ }
  return cfg
}

export function salvarConfig(cfg) {
  try { localStorage.setItem(CHAVE, JSON.stringify(cfg)) } catch { /* ignora */ }
}

export function restaurarPadrao(cfg) {
  mesclar(cfg, copiaProfunda(PADRAO))
  try { localStorage.removeItem(CHAVE) } catch { /* ignora */ }
}
