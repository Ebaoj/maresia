# Maresia

Protótipo de cosy game no navegador: Fortaleza (só Fortaleza desde 16/10/2026; o mapa ainda tem restos de Recife e Rio que saem na fase do mapa),
com estética de quadrinho (3D desenhado como 2D, referência Aranhaverso).
Só um jogador e o mapa. Sem multiplayer, sem objetivo por enquanto.

**Conceito e história (desde 16/10/2026): `docs/conceito.md`.** Fortaleza em 1932 e memórias de 1881; tudo que entra no mundo precisa caber nessas épocas.
Notas de estudo que originaram o projeto: `~/Projetos/aprender-jogos/criar-jogos-com-ia.md`.
Estudo de estética (o que os filmes fazem e o que faltava): `docs/estetica-referencia.md`; antes e depois em `docs/capturas/`.
**Ideias e pendências do Joabe: `docs/ideias-e-pendencias.md`.** Quando ele disser "anota", registrar ali (não só na conversa).

## Rodar

```bash
npm run dev
```

Abre em http://localhost:5195. No preview do Claude: `preview_start` com o nome `maresia`.

Controles: WASD andar, Shift correr, Espaço pular, arrastar o mouse gira a câmera, roda dá zoom,
Z/C giram a câmera, E faz a ação (sentar, pegar, arremessar, pedir água de coco), M abre o mapa da cidade, H esconde o painel, N liga/desliga o som, T avança uma hora.

Depuração pelo console do navegador: `maresia.irPara(x, z, yawCamera, hora)` teletransporta.
Gravar vídeo para avaliar movimento (só em `npm run dev`): `await maresia.gravar({ nome, segundos, fps, roteiro })`
salva os quadros em `docs/capturas/video/<nome>/`; depois `ffmpeg -framerate 30 -i q%04d.jpg ...`.
Fluidez se avalia em vídeo, nunca em quadro parado.
Desempenho: `await maresia.medir({ lugares, variantes, repeticoes: 5 })` (ver o arquivo). Não confiar no cronômetro
de GPU do WebGL no Mac (dá números incoerentes) nem em ler a tela com o painel escondido. A GPU do Mac muda de
frequência e outra aba do jogo aberta disputa a placa: comparar só variantes alternadas na mesma rodada.

## Mapa do código

| Arquivo | O que faz |
|---|---|
| `src/main.js` | Liga as peças e roda o laço de quadros |
| `src/config.js` | Todos os números ajustáveis (o painel mexe aqui; salva no localStorage) |
| `src/mundo/mapa.js` | A cidade como função de (x, z): costa, praia, rio, morros, dunas |
| `src/mundo/terreno.js` | Malha do chão, cores por bairro, mapa de alturas como textura |
| `src/mundo/mar.js` | Mar e rio num plano só, cor pela profundidade, espuma |
| `src/mundo/ceu.js` | Céu, sol, lua, nuvens, paleta por hora do dia |
| `src/mundo/faixas.js` | Calçadão de ondas e avenida (viram ponte sobre o rio) |
| `src/mundo/cidade.js` | Prédios da orla, casario, favela, igreja; janelas no shader |
| `src/mundo/praia.js` | Guarda-sóis, barracas, postes, jangadas, píer |
| `src/mundo/marcos.js` | Pedras no mar, bondinho, farol |
| `src/mundo/vegetacao.js` | Coqueiros (folhas com alpha map) |
| `src/mundo/grama.js` | Grama instanciada (200 mil folhas em blocos 8x8: só desenha bloco com grama e na tela; longe, só a fração do LOD), viradas para a câmera, material toon que recebe sombra; vento no shader |
| `src/mundo/fachadas.js` | Cornija, friso, telhado de barro, toldo, letreiro, varanda, ar-condicionado, antena |
| `src/mundo/rua.js` | Postes com fiação, carros, bancos, lixeiras, carrinhos, placas, bancas, varais |
| `src/mundo/especies.js` | Espécies nativas com galhos à mostra e folhagem em cachos: cajueiro, carnaúba, mangue-vermelho, murici, guajiru, oiti |
| `src/mundo/arvores.js` | Árvores de copa pintada, buganvília, vasos |
| `src/mundo/pessoas.js` | Gente genérica: sentada, de pé, caminhando "em 2" |
| `src/mundo/horizonte.js` | Serras em camadas e cidade ao longe |
| `src/mundo/blocos.js` | Divide cópias em blocos de 96 m para o three pular o que está fora da tela e da sombra |
| `src/mundo/colisao.js` | Colisão 2D e altura do chão (inclui decks) |
| `src/mundo/quarteirao.js` | Casas de 1932 com geometria de verdade: todo o casario e, em versão simples, o morro (vãos recuados, folhas 3D, beiral com telha canal, platibanda, sacada, calçada alta, janelas de fundos, interiores acesos à noite). LOD por bloco de 96 m: perto, a casa detalhada; longe, a caixa com fachada pintada. A câmera colide com caixas invisíveis |
| `src/mundo/cenografia.js` | Cenografia de 1932: lampião a gás de parede (acende à noite e ilumina em volta por um mapa de luz visto de cima, lido em `pintar()`), cadeiras na calçada |
| `src/mundo/toque.js` | Camada 1: mapa de toque (grama deita e deixa rastro) e ondinhas na água |
| `src/mundo/areia.js` | Camada 1: areia que afunda (pegadas com borda, o mar alisa) e poeira |
| `src/mundo/fisica.js` | Camada 2: Rapier só perto do jogador; bolas e cocos, empuxo na água, coco cai do coqueiro |
| `src/jogador/` | Personagem, controle (andar, pular, nadar, sentar), câmera e interações (camada 3, tecla E) |
| `src/pos/aranhaverso.js` | O filtro de quadrinho (nanquim, retícula, hachura, aberração) |
| `src/ui/` | Legendas de gibi, onomatopeias e o painel lil-gui |
| `src/audio.js` | Mar e vento gerados na hora, sem arquivo de som |
| `arte/gerador.py` | Gera arte 2D (conceito do personagem) com ComfyUI + Z-Image Turbo numa GPU L4 do Modal; rodar só via `arte/modal.sh` (chaves `modal_token_id`/`modal_secret` do cofre); imagens em `arte/saida/` |
| `arte/tripo.py` | Tripo pela API (SDK oficial `tripo3d` 1.x): `saldo`, `gerar IMAGEM PASTA [--partes]`, `baixar TASK_ID PASTA`; rodar só via `arte/tripo.sh` (chave `tripo_api_key` do cofre). Crédito da API é separado da assinatura do site |
| `src/debug/gravador.js` + `vite.config.js` | Gravador de quadros com passo fixo (só no modo dev) |
| `src/debug/medidor.js` | `maresia.medir(...)`: custo real do quadro por vazão, fora da tela, com variantes alternadas (só no modo dev) |
| `src/render/motor-placa.js` | Motor de cópias na GPU, opcional no WebGPU (`cfg.desempenho.motorPlaca`), com a three-virtual-geometry |
| `src/render/cache-sombra.js` + `cache-sombra-gpu.js` + `politica-sombra.js` + `sombra-estatica.js` | F4 (KAN-74): sombra dos objetos parados em cache (WebGL e WebGPU), dinâmicos por cima todo quadro; `cfg.mundo.cacheSombra` (ligado por padrão). Ver `docs/motor-f4-cache-sombra.md` |
| `src/mundo/kit1932.js` | Casas separadas em peças reutilizáveis, com matrizes e cores por cópia |
| `src/debug/cidade.js` + `cidade-gerar.js` | Cidade de estresse de 10 × 4 km, casas do kit, vegetação, postes, bancos e relevo; passeio medido por trecho |
| `scripts/preparar-geometria.mjs` | Prepara os modelos em `public/vg/` fora do navegador; arquivos gerados, fora do git |
| `infra/maquina-gpu/testar_jogo.py` + `infra/modal-jogo/regressao.py` | Suíte de regressão compartilhada: Chrome da AWS, mesmos cenários e critérios do Modal |
| `infra/maquina-gpu/regua_cidade.py` | Na g4dn: reprova se faltar conteúdo ou capacidade, algum trecho ficar abaixo de 80 FPS ou a abertura mediana passar de 15 s |

Para a bancada da M1: `node scripts/preparar-geometria.mjs`, `npm run dev` e abrir
`/bancada-cidade.html?casas=15000&preparado=1&terreno=b`. O resultado fica em
`window.__resultado` e as fotos dos trechos em `window.__fotos`.
O relevo preparado é uma malha única com corte por cluster; a capacidade de desenho é por pool da vg, não por mapa inteiro.
Essa bancada prepara a migração do jogo, que continua numa fase posterior.

## Regras

- Personagem e marcas são originais. Nada de personagem ou logo de terceiros.
- Todo parâmetro visual novo entra em `config.js` e no painel, não fica fixo no código.
- Um sistema por arquivo. Se um arquivo passar de ~400 linhas, dividir.
- Números aleatórios sempre com semente (`criarAleatorio`), para a cidade sair igual.
- Muitas cópias do mesmo objeto: sempre `instanciarEmBlocos`, nunca um InstancedMesh cobrindo o mapa (mata o desempenho).
- Peso do traço vai no alfa da cor: material com `opacity` < 1 e `blending: NoBlending` (personagem 0,5, gente 0,85).
- O jogo abre mudo; som só com a tecla N (o M virou o mapa em 16/10/2026).
- Física (Rapier) só perto do jogador: sólidos num raio de 70 m, objetos soltos desligados além de 80 m.
- A cena é desenhada em duas imagens (MRT): cor e luz recebida. **Todo material novo precisa escrever `gLuz`**:
  toon via `pintar()` (já escreve), sem luz via `luzFixa()`, ShaderMaterial com `${SAIDA_LUZ}` e `gLuz = ...`.
  No modo dev, o console avisa "Materiais sem saída de luz" se algum esquecer.
- Pontos e hachura são decididos pela luz recebida (fase A), não pela cor final. O modo antigo fica no painel.
- **Paleta "cal e sal" (`src/paleta.js`)**: fachada nunca é acento; cor forte só em pano, fruta, peixe e mar, no máximo um acento forte por enquadramento. Cor nova sai da paleta, não do chute.
- **Época**: `cfg.estilo.memoria` 0 = 1932 (quadrinho baixo, sem aberração), 1 = 1881 (memória impressa em 5 tintas). Tudo novo precisa ficar legível nos dois modos.
- **Shader quebrado some sem aviso na tela**: no modo dev o console lista "Shaders que não compilaram" (`window.__shadersQuebrados`). Conferir depois de mexer em shader.
- **Anacronismo**: evitar; só quando não houver alternativa e a peça for muito importante, registrando a licença em `docs/direcao-de-arte.md`.

## SDD neste projeto

Protótipo pessoal, local, sem usuário, sem dado, sem dinheiro. Ajuste visual e de
sensação de jogo não precisa de ticket. Precisa de ticket no Jira (projeto KAN) antes
do código: virar produto publicado, ter conta ou dado de jogador, multiplayer,
monetização ou qualquer coisa que vá ao ar. Projeto grande segue épico com fases.

## Testes de regressão (nunca retroceder)

Regra do KAN-62 aplicada aqui: bug corrigido não pode voltar sem um teste avisar.

- `npm test`: testes rápidos da lógica (`testes/unidade`, Vitest, segundos). Rodar antes de todo commit.
- Jogo rodando num navegador de verdade na L4 do Modal (`testes/jogo/cenarios.js`, ~5 min), de `arte/`:
  `./modal.sh run ../infra/modal-jogo/testar_jogo.py`. Rodar antes de commit que mexe em `src/jogador`,
  `src/mundo`, `src/pos` ou materiais. Também reprova erro no console, shader quebrado, material sem gLuz.
- Exceção neste fechamento M1 (18/10/2026): na retomada remota, o usuário prosseguiu com a alternativa AWS
  proposta por indisponibilidade do Touch ID do cofre. A suíte compartilhada foi executada integralmente na T4,
  com os mesmos cenários e critérios do Modal, em 1280 × 720. Evidências em `docs/capturas/kan73/m1-regressao-aws.*`.
  Isso substitui a execução Modal apenas neste fechamento; o caminho Modal continua disponível.
- Bug corrigido: primeiro o teste que reproduz (unidade quando der; cenário do jogo quando precisar do
  personagem animado), **visto falhando no código de antes**; depois a correção, e o teste passa.
  Para ver falhar: `git worktree add --detach PASTA COMMIT_ANTES`, copiar o teste e também
  `public/animacoes` e `arte/finais` (não estão no git), e rodar ali (`MARESIA_RAIZ=PASTA` para o cenário).
- Cada teste diz no comentário qual bug pega e o commit da correção.
- Teste de regressão nunca é apagado nem afrouxado para passar. Mudar tolerância exige o porquê no commit.
- O cenário mede o que o olho vê (ossos do corpo visível), não variável interna: a meia-volta antiga
  passava medindo `yawVisual` e só era vista pelo giro dos ossos.
