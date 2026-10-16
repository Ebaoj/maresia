# Estética: o que os filmes fazem e o que falta na Maresia

Estudo de 16/10/2026 sobre quadros dos trailers oficiais de *Aranhaverso* (1 e 2) e *Gato de Botas 2*.
Os quadros não ficam no projeto; isto é só o que se aprendeu com eles.

## A sensação de "muito detalhe" vem de cinco camadas

1. **Forma secundária.** Nenhum prédio é uma caixa lisa. Tem cornija, peitoril, moldura de janela,
   térreo diferente dos andares (vitrine, toldo, letreiro), varanda, ar-condicionado, escada de
   incêndio, caixa d'água, platibanda. No Gato de Botas, as paredes são levemente tortas e os
   telhados cedem: parece feito à mão.
2. **Cenografia (props).** Rua cheia: cones, placas, semáforo, hidrante, banca, bicicleta presa no
   poste, carro estacionado, toldo, cartaz, gente. É isso que o olho lê como "mundo habitado".
3. **Pintura, não cor chapada.** Cada superfície tem variação de cor pincelada, mais clara em cima e
   mais escura embaixo. No Gato de Botas, folhagem é massa pintada com pinceladas visíveis, não
   folhinha por folhinha.
4. **Luz.** Sol quente com sombra fria (azul ou roxa), oclusão nos cantos que "assenta" os objetos
   no chão, luz rebatida, lâmpadas e letreiros que brilham (bloom).
5. **Profundidade.** Névoa em camadas que puxa o fundo para a cor do céu, fundo desfocado, e uma
   cidade que continua até o horizonte (centenas de prédios ao longe).

## Onde os efeitos de quadrinho entram

Retícula, cor descasada e hachura ficam **por cima** de uma imagem que já é rica.
O traço de nanquim é mais forte nos personagens e nos objetos principais; o cenário de fundo quase
não tem contorno, é resolvido com cor e desfoque. Na Maresia o traço está igual em tudo, e isso
achata a imagem e deixa com cara de "simples".

## Diagnóstico da Maresia hoje

| Camada | Hoje | Falta |
|---|---|---|
| Forma | caixas com grade de janelas | cornija, térreo comercial, toldo, varanda, telhado, peitoril |
| Cenografia | quase nada na rua | fios de poste, placas, bancas, carros, varal, vasos, gente |
| Pintura | cor chapada por instância | pincelada no material, degradê vertical, sujeira na base |
| Luz | toon com 4 faixas | sombra fria, oclusão de ambiente, bloom nas luzes |
| Profundidade | névoa linear única | névoa em camadas, horizonte com cidade densa |
| Quadrinho | traço igual em tudo | peso de linha por distância e por importância |

## Oportunidade brasileira

O que dá identidade sem copiar ninguém: fiação emaranhada nos postes, toldos listrados, letreiro
pintado à mão, azulejo português nas fachadas do Recife, grade nas janelas, buganvília, calçada de
pedra portuguesa, carrinho de tapioca e de água de coco, varal na laje, antena e caixa d'água.

## Revisão 2 (16/10/2026, tarde): o que ainda não está polido

Comparação de 8 cenas da Maresia (orla no fim de tarde, grama de perto, casario, favela no morro,
praia nos dois sentidos) com quadros dos mesmos trailers. Capturas nossas em
`docs/capturas/revisao-2-cenas-a.jpg` e `revisao-2-cenas-b.jpg`. A primeira revisão resolveu
"falta coisa" (forma, cenografia, luz). Agora o que falta é **direção de arte**: escolher o que
aparece, com que força.

| # | Lacuna | Nos filmes | Na Maresia hoje |
|---|---|---|---|
| 1 | **Paleta e hierarquia de cor** | Cena dessaturada e harmônica; poucas cores fortes só onde o olho deve ir (letreiro, boné vermelho) | Toda fachada no máximo da saturação (rosa, ciano, roxo lado a lado). Nada se destaca porque tudo grita |
| 2 | **Perspectiva atmosférica** | Do meio para o fundo, tudo puxa para a cor do céu e perde contraste; o fundo vira silhueta | A névoa ajuda na praia, mas na cidade o prédio a 80 m é tão saturado quanto o da frente |
| 3 | **Janelas e superfícies vivas** | Vitrine acesa com gente dentro, reflexo, cortina, cartaz, tijolo, mancha, desgaste | Janela é retângulo azul-marinho chapado (parece buraco); parede limpa demais |
| 4 | **Sombra com luz rebatida** | Sombra fria mas transparente: dá para ler forma e cor dentro dela, rim light no personagem | Sombra roxa escura e uniforme; no casario o quadro vira uma massa escura |
| 5 | **Hachura e efeitos de quadrinho** | Retícula e hachura pontuais (rosto, momento de ação); o resto é pintura | Hachura diagonal cobrindo paredes inteiras na sombra; parece tela por cima da imagem, não desenho |
| 6 | **Forma e silhueta** | Telhado que cede, chaminé, beiral irregular; árvore é massa pintada com cachos que quebram a silhueta | Caixas retas; árvore é 2 ou 3 bolhas lisas (lê como "low poly", não como pintura) |
| 7 | **Câmera e enquadramento** | Lente escolhida, ângulo baixo, desfoque no que não importa, objeto em primeiro plano emoldurando | Câmera atravessa paredes (nas cenas do morro e de Olinda ficou dentro de um prédio); sempre a mesma altura e distância |
| 8 | **Vida na rua** | Rua cheia: gente andando, carro passando, bicicleta, cone | Casario e orla quase vazios |
| 9 | **Céu** | Gradiente pintado com camadas de nuvem, luz do sol nas bordas | Gradiente simples com nuvens em forma de pílula |
| 10 | **Personagem** | Rosto expressivo, roupa com dobra, cabelo com forma | Boneco de cilindros sem rosto legível |

O que já está no nível: a grama de perto (densa, com vento e degradê), a água e a espuma na
praia, a sombra longa do fim de tarde, a escala da praia com guarda-sóis e jangadas, o traço de
nanquim nos contornos.

### Ordem sugerida (do maior efeito pelo menor esforço)

1. **Paleta e atmosfera (1 e 2).** Saturação das fachadas sorteada numa paleta harmônica (poucas
   cores fortes, muitas neutras e pastéis), saturação e contraste caindo com a distância. É shader e
   config; muda a cara do jogo inteiro.
2. **Câmera (7).** Colisão com prédios (a câmera chega mais perto em vez de entrar na parede) e
   desfoque leve no fundo quando parado. Corrige um defeito, não só estética.
3. **Sombra rebatida e hachura seletiva (4 e 5).** Sombra mais clara e com cor do ambiente;
   hachura só no quase breu e perto, retícula reservada para destaque. Junta com a fase B da
   pesquisa.
4. **Janelas vivas e desgaste (3).** Interior falso por janela (parallax), cortina, luz acesa
   variada, manchas na base e escorrido abaixo do peitoril. Tudo no shader do prédio.
5. **Silhueta (6).** Telhado com caimento e beiral irregular, árvore com cachos (cards pintados)
   no lugar das bolhas.
6. **Vida (8), céu (9) e personagem (10).** O personagem pode usar a arte conceitual do
   `arte/gerador.py` como guia.
