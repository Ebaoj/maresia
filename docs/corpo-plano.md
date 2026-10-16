# Corpo do personagem: plano por fases

Pedido do Joabe em 16/10/2026 ("quero tudo isso"). Base pronta: esqueleto padrão do Mixamo,
conversão de movimentos para qualquer modelo, animador com mistura por velocidade, pé no chão e
inclinação, tudo "em 2" (branch `corpo`). Cada fase termina com vídeo gravado e commit.

| Fase | O que | Estado |
|---|---|---|
| 1 | Pegadas no pé de verdade; conferir sentar, nadar, carregar e degrau | feito (16/10): pegada pelo calcanhar; sentar, levantar, boiar e nadar conferidos em vídeo; carregar e degrau no jogo ainda não |
| 2 | Motion matching: escolher a cada instante o trecho de mocap mais parecido com o que o jogador faz, com começar, parar e virar | primeira versão no ar (16/10): 14 movimentos com deslocamento + 6 espelhados, 953 quadros; liga e desliga no painel |
| 3 | Estilo Aranhaverso no movimento: quadro esticado, linhas de velocidade, pausa no alto do pulo, "em 2" que muda com a ação | feito (16/10): em 1 na ação e em 2 andando, pausa no alto do pulo, múltiplos em retícula, linhas de velocidade recalibradas; tudo no painel |
| 4 | Rosto desenhado: olhos e boca 2D trocáveis (piscar, sorrir, susto) | feito (16/10): 5 olhos e 5 bocas em traço de nanquim, pisca sozinho, muda com a ação (correr, pular), `rosto.expressar()` para a história; o neto só precisa das âncoras |
| 5 | Mão e olhar: a mão alcança o que pega, a cabeça acompanha quem passa e a câmera | feito (16/10): a cabeça olha o que dá para usar e, parada, para onde a câmera aponta (nunca torce para trás); segurando, as duas mãos vão ao objeto (IK de braço). Falta: olhar gente que passa |
| 6 | Parado com vida: pequenas ações sorteadas (olhar o mar, ajeitar o chapéu, trocar o peso) | |
| 7 | Física no corpo (Jolt): chapéu e camisa balançando, reação a empurrão | |
| 8 | Muita gente gastando pouco: os mesmos movimentos na multidão, leves de longe | |
| 9 | Areia e água: pé afunda na areia fofa, respingo na água rasa, onda empurra | |
| 10 | Gestos do ofício gravados em vídeo de celular e convertidos em movimento (modelo aberto no Modal) | |

Movimentos do Mixamo: `public/animacoes/mixamo/` (fora do git, a licença não permite redistribuir).
Baixados pela API do site na sessão do Joabe no Chrome; nomes e escolhas em `docs/corpo-movimentos.md`
quando a lista crescer.
