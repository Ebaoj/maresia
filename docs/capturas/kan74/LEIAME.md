# KAN-74 (F4): A/B do cache de sombra na bancada da cidade, WebGPU, T4 (19/10/2026)

AWS g4dn.xlarge (NVIDIA T4), Chrome 155, bancada `bancada-cidade.html` com `terreno=b&preparado=1`, régua `regua_cidade.py`
(>= 80 FPS em todos os trechos, abertura <= 15 s). Modos alternados na ordem sem, com, sem, com (3 rodadas por bloco:
6 rodadas por modo em 20 mil e 3 em 15 mil). Cache = `&cacheSombra=1` (raio 15 m, refaz em 2 quadros).
Saídas completas: `ab-<casas>-<sem|com>-<bloco>.txt`, `ab-ordem.txt`.

## 20 mil casas (medianas; entre parênteses, mínimo e máximo das rodadas)

| Trecho | Sem cache: FPS | msCpu | Com cache: FPS | msCpu |
|---|---:|---:|---:|---:|
| ruaCentro | 76,1 (73,2 a 77,6) | 11,98 | **91,0** (85,9 a 95,7) | 9,82 |
| costaOeste | 85,2 (82,7 a 87,8) | 11,61 | 103,9 (100,7 a 106,3) | 9,21 |
| dunas | 86,8 (84,0 a 88,0) | 11,44 | 107,7 (107,1 a 109,2) | 9,14 |
| alto | 84,4 (80,9 a 85,3) | 11,71 | 102,4 (101,1 a 107,1) | 9,59 |

Abertura mediana: 14,0 s sem, 13,7 s com. **Rodadas que passam na régua: 0 de 6 sem cache, 6 de 6 com cache.** Sem o cache,
a rua do centro reprova (76 FPS), como no fechamento da M1. Nenhum estouro de capacidade da vg.

## 15 mil casas

| Trecho | Sem: FPS | msCpu | Com: FPS | msCpu |
|---|---:|---:|---:|---:|
| ruaCentro | 100,7 | 8,85 | 127,9 | 6,96 |
| costaOeste | 117,7 | 8,29 | 145,3 | 6,64 |
| dunas | 111,4 | 8,74 | 145,2 | 6,52 |
| alto | 113,3 | 8,59 | 145,1 | 6,66 |

Abertura 11,8 s sem, 11,7 s com. Passa em 3 de 3 rodadas nos dois modos.

## Leitura e limites

- Ganho de 20% (rua do centro) a 24% de FPS com 20 mil casas, e a CPU por quadro cai 17 a 20%. Com 15 mil, 23 a 30% de FPS.
  As faixas de min e max das rodadas de cada modo não se sobrepõem na rua do centro (73 a 78 contra 86 a 96).
- **O ruído de ordem foi controlado só em parte:** os blocos alternam sem, com, sem, com, e o resultado se repete nos dois
  blocos de 20 mil. Ainda assim é uma máquina e uma sessão.
- A cauda piora no trecho "alto" (p95 de msCpu 18,7 ms contra 15,6): a câmera voa a ~60 m/s, o cache refaz a cada ~0,25 s e
  cada refazer custa o passe inteiro (em 2 quadros).
- **A régua não imprime os contadores do cache** (`cacheSombra.refeitos`, `motivos`), então a quantidade de refazeres não
  foi registrada aqui. O parâmetro chegou à bancada (os números mudam como o esperado), mas essa conferência direta falta.
- A prova de correção da imagem (`&fotoSombra=1`) foi feita no M1 (diferença 0 nas poses que refazem), **não na T4**.
- Primeira tentativa de A/B desta sessão perdeu os resultados (a máquina desligou sozinha após 30 min parada e o /tmp foi
  limpo no boot); os números acima são da segunda execução, copiada antes de desligar a GPU.

## Suíte de regressão com o cache ligado por padrão (WebGL), T4

`testar_jogo.py` (a mesma da M1) na T4, 19/10/2026, com `cfg.mundo.cacheSombra: true` em `src/config.js`: **16 de 16
passaram** (14 cenários do jogo, `sombrasCopias` e o modo WebGPU, que não usa o cache). Saídas: `regressao-f4.txt` e
`regressao-f4.json`. Essas cenas não medem a sombra do WebGL em si; a comparação de imagem foi a do Mac (diferença 0).
