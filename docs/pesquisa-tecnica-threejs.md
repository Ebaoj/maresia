# O que aprender com jogos feitos em three.js

Pesquisa de 17/10/2026, durante o KAN-68. Li o código publicado de dois jogos em three.js, a mesma biblioteca do
Maresia. São arquivos compactados, então isto vem dos nomes, comentários e números que aparecem no código.

## Tidewater (Daniel Greenheck)

https://dgreenheck.github.io/tidewater/

- Usa o three no WebGPU, mas escreve à mão os shaders (WGSL) do que pesa: mar, terreno, céu e sombras. O three
  cuida da cena, da câmera e dos modelos.
- **O mar é calculado na placa de vídeo, a cada quadro (FFT de oceano).** É a técnica dos filmes e dos jogos AAA:
  - Gera um "espectro" de ondas a partir do vento: velocidade 8 m/s, pista de vento (fetch) de 200 km, ondulação
    de longe (swell) 0,2. Usa o modelo JONSWAP, com fator de pico 3,3.
  - Transforma esse espectro em altura e deslocamento do mar numa grade de 256 x 256 (a FFT), no compute do
    WebGPU.
  - Faz isso em 4 escalas sobrepostas (cascatas de 733 m, 157 m, 33 m e 7 m): a grande dá o mar aberto, a
    pequena dá o detalhe perto da câmera, e o mar não se repete.
  - **A espuma nasce onde a onda se dobra** (o "jacobiano" fica abaixo de um limite: a crista se comprime) e
    depois some devagar. A espuma fica como rastro atrás das cristas, como no mar de verdade.
  - Perto da praia, ondas próprias que quebram, sobem a areia (espraiamento) e deixam espuma e areia molhada.
  - Cáusticas (a luz dançando no fundo) saem do mesmo cálculo das ondas.
  - Refração: o fundo aparece torto através da água, e a água tem absorção e espalhamento de luz. O raso fica
    turquesa, o fundo fica escuro.
  - Lê de volta a altura do mar para a CPU (readback), e assim barcos e objetos boiam nas ondas certas.
- Céu físico por tabelas pré-calculadas (atmosfera de Hillaire), sombra do sol com penumbra que cresce com a
  distância (PCSS), terreno com nível de detalhe contínuo (CDLOD), suavização entre quadros (TAA).

## Camper / "Until You Find Me" (Rainy Worlds)

https://camper.rainyworlds.com/

- three r185 (o Maresia está no r170, de nov/2024; a versão atual é a r186).
- **Não usa luz pré-calculada.** Na primeira leitura contei `lightMap` e `aoMap` como sinal de luz feita no
  Blender, mas essas palavras eram do próprio three, não do jogo. Corrigido aqui.
- O visual vem de:
  - texturas de material de alta qualidade em 2k (cor, relevo e rugosidade), com nomes do acervo gratuito
    Poly Haven;
  - curva de tom AgX (a mais nova do three, cor de cinema sem estourar);
  - sombra suave (PCFSoft);
  - suavização entre quadros (TRAA, o TAA do three no WebGPU);
  - grama em milhares de cópias, dividida em células, e árvores com cópias e 3 níveis de detalhe;
  - terreno por mapa de alturas, com a câmera e o jogador presos ao chão.

## O que serve para o Maresia

| Ideia | De onde | Cabe no Maresia? |
|---|---|---|
| **Mar por FFT na placa** (ondas de verdade, espuma onde a onda dobra, 4 escalas) | Tidewater | Sim, e é o que mais muda o jogo. Fortaleza tem vento alísio constante, o mesmo tipo de mar que o espectro descreve. O desenho continua pintado: a FFT dá o formato e o movimento; a cor sai em faixas de Arcane, como hoje. |
| Espuma com rastro (nasce na crista e some devagar) | Tidewater | Sim, junto com o mar. Fica ótima em faixas chapadas de quadrinho. |
| Ondas que quebram na praia e molham a areia | Tidewater | Sim. A areia já tem pegadas e a costa já é conhecida (`linhaCosta`). |
| Jangadas e boias seguindo as ondas (leitura da altura de volta para a CPU) | Tidewater | Sim, depois do mar. As jangadas de 1932 boiando no mar certo. |
| Cáusticas e refração no raso | Tidewater | Depois. É bonito, mas no estilo Arcane pode virar ruído. Testar com foto. |
| Subir o three de r170 para r186 | Camper | Sim, numa fase própria, com a foto justa como rede de segurança. O WebGPU do three melhorou muito desde a r170, e parte dos remendos do KAN-68 pode sumir. |
| Suavização entre quadros (TAA) | os dois | Sim. Hoje o Maresia roda sem nenhuma suavização de serrilhado. |
| Curva de tom AgX | Camper | Testar contra a curva atual. O estilo Arcane manda, não a física. |
| Céu físico, sombra PCSS, terreno CDLOD | Tidewater | Não agora. O céu pintado e a sombra nítida combinam mais com o toon; a cidade é pequena e não precisa de CDLOD. |

## O mar por FFT nos dois renderizadores

O cálculo do Tidewater roda no compute do WebGPU. No WebGL não existe compute, mas a mesma FFT dá para fazer com
passes de desenho em alvos (o jeito antigo, mais lento). Por isso o mar FFT combina com a decisão do motor:
se o Maresia seguir no WebGPU, o mar sai pelo caminho mais simples e mais rápido.

Ticket: KAN-69 (mar por FFT, RASCUNHO).
