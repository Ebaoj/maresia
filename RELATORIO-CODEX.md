# Relatório Codex

Trabalho na branch perf-m1-codex, baseado em perf-fase1. Sem push, sem alteração de main, sem acesso a AWS e sem edição de src/mundo/ ou casas-lote.

## Mudanças

O WebGL mede a cadeia completa de desenho, incluindo cena, sombra e pós, com EXT_disjoint_timer_query_webgl2 quando disponível. As consultas são assíncronas, limitadas a oito pendências e descartadas quando GPU_DISJOINT_EXT indica invalidação. A resolução dinâmica prefere a amostra de GPU recente, com retorno ao intervalo entre quadros após 250 ms sem resultado. O governador mantém seu sinal de intervalo entre quadros para considerar também o custo de CPU.

Há um teto adicional de DPR efetivo de 1,25, independente do teto Retina existente. Canvas e alvos do pós usam o mesmo limite. Nos perfis médio e baixo, a junção do DOF usa meia largura e meia altura. O bloom passa de um quarto para um oitavo de cada dimensão. Com bloom desligado ou intensidade zero, seus cinco passes são pulados. No perfil alto, as resoluções anteriores dos efeitos são preservadas.

A integração é instalada pelo renderizador e aguarda a API pública maresia, sem editar main.js. O modo de medição funciona também no build de produção e não depende de maresia.rastrear, que só é instalado em desenvolvimento.

## Como medir

Execute `npm ci` e `npm run dev`. Abra:

`http://localhost:5195/?medirM1`

A medição começa após os carregamentos registrados em maresia.pronto. Ela libera cfg.fatia.travar, anda 15 segundos na partida, teleporta para colunaHora e anda mais 15 segundos, depois teleporta para urubuRegistro e anda os últimos 15 segundos. O painel lil-gui fica oculto durante a rodada. Mantenha a aba visível e não acione outros controles.

Ao terminar, aparece um resumo na tela e o navegador baixa um JSON. O link permite repetir o download se o navegador bloquear o automático. O resultado também fica em `maresia.ultimaMedicaoM1`. Para repetir pelo console, use `await maresia.medirM1()`, após recarregar a página para voltar ao ponto de partida.

O JSON contém os intervalos brutos, média, p50, p95, p99, contagem acima de 33, 50 e 100 ms, pior intervalo, tempos de GPU, consultas descartadas, Long Animation Frames quando suportado, etapas, DPR nativo, histórico de DPR efetivo e resolução, configuração e indicação de aba oculta. Uma rodada com aba oculta deve ser repetida.

## Configuração e comparação

As chaves ficam em `maresia.cfg.desempenho` e podem ser ajustadas pelo console. Não foi alterado o painel ou o esquema persistido de configuração.

| Chave | Comportamento |
| --- | --- |
| tetoDprEfetivo | 1,25 por padrão; 0 desliga o teto adicional. Redimensione a janela após mudar. O tetoRetina existente continua valendo. |
| tempoGpu | true por padrão; false desliga as consultas e usa intervalos de quadro na resolução dinâmica. |
| resolucaoDinamica | false fixa a resolução, respeitando os tetos. Chave existente. |
| dofEscalaJuncao | 0,5 em médio/baixo, 1 em alto; valor explícito 1 restaura a junção cheia. |
| bloomDivisor | 8 em médio/baixo, 4 em alto; valor explícito 4 restaura o tamanho anterior. |
| bloom | false desliga os passes do bloom. |

`maresia.cfg.estilo.dof = false` desliga o DOF inteiro. Para comparar os efeitos com as resoluções anteriores, ajuste dofEscalaJuncao=1 e bloomDivisor=4 antes de chamar medirM1. Use rodadas alternadas na mesma máquina, com a mesma configuração e apenas uma aba do jogo aberta. A medição automática preserva a configuração de qualidade escolhida, inclusive `?qualidade=medio`.

## Arquivos tocados

* src/render/medicao-m1.js, novo módulo de rota, consultas de GPU, resumo e exportação.
* src/render/renderizador.js, instalação localizada na criação do WebGL e teto de pixel ratio delegado ao novo módulo.
* src/render/resolucao-dinamica.js, preferência pela amostra recente de GPU.
* src/pos/aranhaverso.js, resolução e desligamento de passes DOF e bloom.
* testes/unidade/medicao-m1.test.js, percentis, ausência da extensão, disponibilidade assíncrona, invalidação disjoint e retorno ao intervalo entre quadros.
* RELATORIO-CODEX.md, este relatório.

## Validação e riscos

`npm test`: 486 testes passaram, quatro ignorados; 82 arquivos passaram, um ignorado. `npm run build`: passou. O build avisa sobre chunks grandes. A instalação avisa que o Vitest 5 prefere Node 22.12 ou mais recente; os comandos passaram no Node 20.19.2 disponível.

Não houve medição física no M1 nem validação visual no navegador nesta sessão. Não há alegação de ganho numérico ou de meta de 16,7 ms atingida. O teto padrão já era próximo dos limites dos perfis existentes, portanto a redução nova se concentra nos efeitos e na orientação por GPU.

A junção do DOF em meia resolução pode amolecer também detalhes nítidos e silhuetas. O bloom menor pode perder luzes pequenas e alterar a largura aparente dos halos. Ambos têm controles para restaurar a resolução anterior.

Safari pode não expor consultas de GPU ou Long Animation Frames. O JSON indica indisponibilidade. O medidor anterior documenta resultados incoerentes de timer no ANGLE/Metal; as amostras deste módulo precisam ser confrontadas com os intervalos de quadro no M1. Se incoerentes, desligue tempoGpu. Disjoint não detecta toda possível imprecisão do driver.

O roteiro usa movimento normal, sujeito a colisões e aos controles manuais, e registra intervalos de requestAnimationFrame, sem garantir apresentação física de cada quadro no monitor. O trajeto termina no Urubu, sem restaurar a posição inicial. O modo automático é voltado ao WebGL; com WebGPU ele não é instalado.

## Correção de ?medirM1 — 26/10/2026

O timestamp do primeiro requestAnimationFrame pode ser anterior ao performance.now() usado no início da rodada. O intervalo negativo mantinha a etapa em -1 e a lista vazia, causando a falha ao ler nome. A medição agora usa o timestamp do primeiro quadro como origem. O teste de regressão reproduziu o erro antes da correção e verifica a rota automática completa, as transições em 15/30 segundos, a duração de 45 segundos e a restauração dos controles. Validação: npm test passou (487 aprovados, 4 ignorados); npm run build passou com aviso de chunks grandes.
