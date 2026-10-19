# M1: cidade de estresse do motor de mundo (KAN-73)

Medição de 18/10/2026 no worktree `maresia-three186`, branch `kan70-three186`.
A validação da cidade e a suíte completa de regressão na AWS estão concluídas.
Neste fechamento, a AWS substituiu o Modal após a retomada remota do usuário, conforme a alternativa proposta.
Os commits são separados por ticket; a atualização do Jira depende de conexão. Nenhum push foi feito.

## Ambiente e conteúdo

- AWS g4dn.xlarge, NVIDIA T4, WebGPU, Chrome 155.0.8059.84.
- Área de desenho: 2560 × 1544, pixel ratio 1, sombras ligadas.
- 10 × 4 km de cidade de estresse. O relevo cobre também uma margem: x de -6000 a 6000, z de 0 a 5000.
- Cena de 15 mil casas: 60 mil árvores, 8 mil coqueiros, 2604 postes e 868 bancos.
  São 1.386.798 cópias, distribuídas por 57 modelos usados. O manifesto prepara 63 modelos.
- Kit e materiais do jogo, com geometria preparada, sem montagem da hierarquia VG no navegador.
- Esta é a bancada do motor. A migração do mapa jogável, multidões e outros sistemas permanecem nas fases seguintes.

## Régua executada

A régua exige a quantidade exata de casas solicitada, pelo menos 80 FPS em todos os trechos,
abertura mediana de até 15 s e estatísticas de capacidade válidas, sem overflow.
A capacidade é conferida em cada trecho e no fim. Encerramento do processo e timeout reprovam.

| Casas | Rodadas | Rua do centro (FPS) | Costa oeste (FPS) | Dunas (FPS) | Alto (FPS) | Abertura | Resultado |
|---:|---:|---:|---:|---:|---:|---:|---|
| 15.000 | 3 | 106.2 | 115.5 | 122.5 | 116.0 | 11.58 s | Passa |
| 20.000 | 1 | 75.5 | 90.2 | 87.5 | 86.9 | 14.37 s | Reprova |
| 60.000 | 1 | 57.6 | 61.6 | 67.3 | 63.7 | 24.55 s | Reprova |

15 mil: medianas de três rodadas; 20 mil e 60 mil: um ensaio exploratório cada.
Os dados não demonstram 80 FPS sustentados com 20 mil casas. A régua foi vista reprovando
com 60 mil pela abertura e pelos quatro trechos, sem depender de um erro de memória.
Em todos os trechos finais, `estourou=false` e `escalaLod=1`: o limite de buffers não forçou
um detalhe mais grosseiro para obter os resultados.

Saídas completas: [15 mil](capturas/kan73/m1-regua-15000.txt),
[20 mil](capturas/kan73/m1-regua-20000.txt), [60 mil](capturas/kan73/m1-regua-60000.txt).
Os arquivos `m1-cidade-*.json` ao lado incluem dimensões, versão do Chrome, estatísticas,
quantidades e hashes das fontes/manifesto medidos. Os hashes conferiram com a cópia local.

## Falha anterior e correção

1. A régua de 15 mil com relevo original foi vista falhando com `Array buffer allocation failed`
   em `GeometryPool.build`, antes dos ajustes.
2. A capacidade padrão da VG reserva 168 MB de índices de câmera/sombra por pool. A bancada usa
   agora 4 milhões de triângulos de câmera e 1,6 milhão de sombra por pool, cerca de 67 MB de índices.
3. A grade de 128 segmentos por km foi reduzida para 64. Em 64.809 amostras determinísticas,
   o erro máximo contra a altura analítica foi de 6,1 cm e o médio de 1,5 mm (antes: máximo de 4,0 cm).
4. Com 60 tiles, a cena já carregava, mas a mediana da rua ainda reprovava a 77,3 FPS.
   [Saída da comparação](capturas/kan73/m1-regua-60-tiles.txt).
5. O relevo passou a ser uma única malha, com a mesma grade de 15,625 m e a mesma função de altura.
   A VG continua selecionando e cortando os clusters na GPU. A malha tem 246.849 vértices,
   491.520 triângulos na resolução completa e normais calculadas de uma vez, sem costuras de tiles.
6. Quando o manifesto já contém o terreno preparado, sua geometria fonte não é criada no navegador.
   O bake ativo tem 63 modelos, cerca de 4 MB. `public/vg/` permanece gerado e fora do git.

Fotos finais: [rua](capturas/kan73/m1-15000-ruaCentro.jpg),
[dunas](capturas/kan73/m1-15000-dunas.jpg), [alto](capturas/kan73/m1-15000-alto.jpg).
As fotos foram conferidas para presença do terreno e dos objetos.

## Reproduzir

Na raiz do projeto: `node scripts/preparar-geometria.mjs`, depois `npm run dev`.
Abrir `/bancada-cidade.html?casas=15000&preparado=1&terreno=b`.

Na g4dn, com o jogo enviado e o Chrome aberto:

```bash
python3 /tmp/regua_cidade.py 15000 3
python3 /tmp/regua_cidade.py 20000 1
python3 /tmp/regua_cidade.py 60000 1
```

O terceiro comando deve sair com código 1. No teste desta sessão ele mediu realmente 60 mil casas.
A máquina foi desligada depois da coleta das evidências.

## Verificações e pendências

- Revisão por subagente sem contexto inicial e revisão dos ajustes de terreno: sem achados novos.
- Testes unitários: 10 de 10 passaram. Build concluído, com os avisos de bundle grande e de
  `node:module` externalizado pelo Jolt. Saídas em `capturas/kan73/m1-unidade.txt` e `m1-build.txt`.
- Suíte completa compartilhada: 16 de 16 resultados passaram na AWS T4, incluindo console e o modo WebGPU.
  Dentro do WebGPU, as 11 verificações também passaram; backend real, 103 quadros em 3 s e nenhum shader quebrado.
  Viewport 1280 × 720, pixel ratio 1. Os hashes de 87 fontes conferiram com o worktree.
  Evidências: [resumo](capturas/kan73/m1-regressao-aws.txt) e [resultados completos](capturas/kan73/m1-regressao-aws.json).
- O cofre exigia Touch ID indisponível neste processo; o usuário estava longe do Mac. Após a proposta de substituir
  esta etapa pela AWS, o usuário pediu para continuar. A exceção deste fechamento está registrada em `CLAUDE.md`.
  Não houve execução no Modal. A suíte agora compartilha listas, cenários e critérios em `infra/modal-jogo/regressao.py`.
- Console sem erros que reprovam. Permanecem avisos de APIs obsoletas do Three, geometria já não indexada,
  propriedade `semCache` e leitura de pixels; eles estão registrados no relatório completo.
- Agrupamento de commits: KAN-70, KAN-71, KAN-72 e KAN-73, sem incluir os atalhos de arte/animações.
- Comentários e status no Jira: pendentes; a integração Atlassian foi localizada, mas ainda não está instalada/conectada nesta sessão.
- CPU da renderização ainda fica em torno de 8–9 ms no cenário de 15 mil, acima do alvo exploratório de 4 ms.
  Sombra estática em cache (F4) continua como próxima investigação, fora deste fechamento. Implementada na bancada
  (`&cacheSombra=1`) e medida na T4: 20 mil casas passam na régua com o cache (91 a 108 FPS) e reprovam sem ele (76 FPS na
  rua do centro). Ver `docs/motor-f4-cache-sombra.md` e `docs/capturas/kan74/LEIAME.md`.
