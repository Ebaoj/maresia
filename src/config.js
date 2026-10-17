// Todos os números ajustáveis do jogo. O painel de debug (tecla H) mexe aqui.
// O que você ajusta no painel fica salvo no navegador; "Restaurar padrão" volta a isto.

export const PADRAO = {
  tempo: {
    hora: 17.1,          // começa no fim de tarde
    velocidade: 1.0,     // horas do jogo por minuto real
    pausado: false,
  },
  estilo: {
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
    nevoaDensidade: 0.0022, // névoa em camadas, mais densa embaixo
    nevoaQueda: 0.045,
    maresia: 0.006,         // ao longe a cor perde saturação e contraste (perspectiva atmosférica)
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
    fpsPose: 12,           // animação "em 2": 12 poses por segundo
    posicaoEm2: false,     // ligado: o corpo inteiro anda em 2 (mais Aranhaverso, mais travado)
    corpoNovo: true,       // esqueleto padrão com os movimentos do Mixamo (jogador/corpo.js); desligado = boneco antigo
    modelo: 'neto',        // corpo do jogador: 'neto' (arte/finais/neto-mpfb.glb) ou 'boneco' (cápsulas, para testes); recarregar
    chapeu: false,         // chapéu de palha no neto (o Joabe tirou em 16/10/2026); recarregar
    ombros: 0.9,           // largura dos ombros do neto (1 = como veio do modelo, largo de adulto); recarregar
    folgaCamisa: 0.012,    // folga máxima da camisa sobre a pele no ombro e na manga, em metros (0 = como veio); recarregar
    dobras: 1.0,           // dobras do pano desenhadas no cotovelo, joelho e cintura (dobras.js); 0 desliga
    panoSolto: 1.0,        // barra da camisa, mangas e boca da calça soltas (pano.js); 0 desliga
    avo: true,             // o avô parado perto do começo do jogo (avo.js), para julgar o modelo. Vale ao recarregar
    avoMovimento: 'parado', // 'parado' ou 'velho-parado' (curva de novo por cima da coluna curvada do modelo)
    roupaJolt: true,       // roupa inteira como pano no Jolt (roupa.js); desligado, só as bordas com molas (pano.js). Vale ao recarregar
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
    raio: 38,
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
  mundo: {
    sombras: true,
    resolucaoSombra: 4096, // 4096 nítida, 2048 mais leve (a sombra é o maior custo do quadro)
    nevoaPerto: 140,
    nevoaLonge: 900,
  },
  fatia: {
    travar: true,          // prende o jogador na fatia vertical da Praia do Peixe (mundo/fatia.js)
  },
  desempenho: {
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
