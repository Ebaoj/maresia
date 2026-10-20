# Os movimentos do Mixamo que o jogo usa

Estes arquivos **não estão no git** e são os arquivos crus do Mixamo. A licença permite usar o movimento no
jogo, mas não redistribuir o arquivo. Ficam fora do repositório de propósito (regra no `.gitignore`), e esta
lista existe para que o jogo possa ser remontado em outra máquina.

**Onde pegar:** [mixamo.com](https://www.mixamo.com), conta gratuita da Adobe. O esqueleto de origem é o
`ybot` (o Mixing Rig), e os clipes abaixo são o que o jogo pede pelo nome.

## Clipes do corpo do jogo (16)

Pede em `src/jogador/corpo.js` (lista `NOMES`):

`parado`, `olhando`, `andar`, `correr`, `disparada`, `pulo-subida`, `pulo-queda`, `pulo-pouso`, `sentar`,
`sentado`, `levantar`, `carregar-andando`, `carregar-parado`, `boiar`, `nadar`, `empurrar`

## Banco do motion matching (14)

Pede em `src/jogador/corpo.js` (lista `BANCO`). O `mm-` é o esqueleto do Mixing Rig, com o rig do neto
aplicado por cima:

`mm-parado`, `mm-andar`, `mm-andar-padrao`, `mm-correr`, `mm-trote`, `mm-disparada`, `mm-arrancar`,
`mm-parar-andando`, `mm-parar-correndo`, `mm-curva-andando`, `mm-volta-andando`, `mm-volta-correndo`,
`mm-virar-esq`, `mm-virar-dir`

## Do avô (2)

Pede em `src/jogador/avo.js`:

`velho-parado`, `velho-andar`

## Do laboratório (1 a mais)

`src/laboratorio.js` pede `nadar-peito`, que o jogo não usa, só a bancada.

## O esqueleto de referência

`ybot` é o Mixing Rig que serve de esqueleto padrão para a conversão. Não é animação: é a referência de
ossos. Se faltar, o conversor cai no esqueleto do próprio modelo.

## Pasta

Todos os 34 arquivos `.fbx` ficam em `public/animacoes/mixamo/` (17 MB). O jogo serve essa pasta pelo
caminho `/animacoes/mixamo/`.

## O destino disso

Pela direção de arte (decisão de 18/10/2026), **tudo que se move como ser vivo vai ser rotoscopia**: gente,
gato, cachorro, galinha, peixe, ave, jumento. As juntas do ser real são marcadas no vídeo filmado de lado e
o esqueleto é posto em cima.

Os movimentos do Mixamo são o interim: cada um vai sendo trocado, ação por ação, pelo clipe
rotoscopiado equivalente. Começa pelo andar do neto. Até cada um ser trocado, o do Mixamo continua no jogo.

**Consequência prática:** quando os 34 clipes forem substituídos, esta pasta sai do projeto e o jogo passa a
não depender de nenhum arquivo do Mixamo.
