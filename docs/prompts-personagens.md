# Prompts de personagem para o ChatGPT Image

Versão 1, 17/10/2026. Pipeline: ChatGPT Image, depois Tripo (imagem para 3D, GLB), depois
`blender/tripo_rig.py`. Roupas conferidas em `docs/figurino.md` (D = documentado, P = plausível).

## Como montar o prompt

Cada prompt = **bloco fixo** + **bloco do personagem**. Cole os dois juntos, nessa ordem.

1. Abra uma conversa nova por personagem.
2. Anexe `arte/entradas/referencias/estilo-arcane/avo-estilizado-aprovado.webp` (é só estilo).
3. Se o estilo escorregar para o realista, peça na mesma conversa:
   `Same character, but keep exactly the painting style of the attached reference: flat painted colors, visible brush strokes, no pores, no baked shadows.`
4. Se ele desenhar o avô junto, repita: `Only this one character in the image. Do not draw the old man.`

## Bloco fixo (vai em todos)

```
STYLE: hand-painted stylized 3D character inspired by Arcane (Fortiche). Exaggerated proportions: long angular face, big nose, big hands and big feet, thin limbs. Flat painted colors with visible brush strokes, no skin pores, flat albedo texture with almost no baked light or shadow. Hair and beard as chunky painted locks. Wrinkles as a few large strokes. The attached image of an old man is a STYLE REFERENCE ONLY: do NOT draw the old man, copy only the painting style.

FORMAT (this image will be converted to 3D): only this one character in the image. Full body from the top of the head to the toes, nothing cropped, straight front view, camera at chest height. A-pose: arms straight and well away from the body at about 40 degrees, palms facing the thighs, fingers slightly spread, feet shoulder-width apart and flat on the ground. Neutral expression, eyes open, looking at the camera. Plain light gray seamless background, flat even lighting, no cast shadow, no props, no scenery, no text.

PERIOD: Fortaleza, Brazil, 1932. Poor people's clothes are worn, faded, patched and washed many times. No modern items: no jeans, no back pockets, no zipper, no sneakers, no plastic, no logos, no printed t-shirt.
```

## Blocos dos personagens

### Base do neto (roupa de baixo, para vestir as outras por cima)
Anexar também a imagem do neto já aprovada, como segunda referência.

```
CHARACTER: the same boy as in the second attached image: keep his face, hair, skin tone and body exactly. 13 years old, skinny, sun-tanned skin, messy black hair, caboclo from the coast of Ceará. He wears period underclothes that will serve as a base for other outfits: a plain off-white cotton sleeveless undershirt, close-fitting, and short close-fitting off-white cotton drawers ending at mid-thigh, drawstring waist, no fly, no pockets. Fabric slightly worn and yellowed from many washes. Barefoot, no hat.
```
Se recusar: troque a ceroula por `knee-length loose cotton shorts` e a camiseta por `short-sleeved cotton undershirt`. Menino de calção e camisa curta é documentado (Welles, 1942). Não insista na versão anterior.

### Jangadeiro (homem, uns 40 anos)
```
CHARACTER: a jangadeiro (raft fisherman), about 40 years old, caboclo from the coast of Ceará, lean and dry body, strong forearms, sun-cured bronze skin, short thick black hair, thin mustache. Long-sleeved loose shirt of thick coarse cotton dyed with mangrove bark, leather-brown color faded by sun and salt, open at the chest, sleeves rolled to the forearm, worn outside the trousers, one neat patch on a sleeve. Loose light raw-cotton trousers rolled up to mid-calf, held by a hidden drawstring, NO belt, no pockets, no fly. Barefoot, wide calloused feet. Carnauba palm straw hat with a tall crown and a wide soft brim turned up at the edges (NOT conical).
```

### Vendedora de peixe (mulher, uns 35 anos)
```
CHARACTER: a fish seller from the beach, a woman about 35 years old, dark brown skin, sturdy arms, long black hair tied in a low bun. Simple cream cotton blouse with sleeves to the elbow, round neck, loose. Long full skirt of faded red chintz with small flowers, down to the shin. Faded cotton headscarf tied at the nape. Barefoot. No jewelry. HANDS AND FEET: small and delicate hands with slender fingers, small narrow feet; do NOT copy the big hands and feet of the style reference.
```
Saia de chita e lenço são P (nenhuma fonte descreve a vendedora). A gamela na cabeça fica de fora: objeto atrapalha o Tripo, entra depois como peça separada.

### Rendeira velha (uns 65 anos)
```
CHARACTER: an old lace-maker (rendeira), about 65 years old, light brown skin, thin, slightly stooped shoulders, white hair pulled back in a tight bun. Light cream cotton blouse with sleeves to the elbow, buttoned at the front. Long skirt of dark blue cotton with a tiny faded print, down to the ankle. A rosary of small white beads around her neck. Barefoot. HANDS AND FEET: small and delicate hands with slender fingers, small narrow feet; do NOT copy the big hands and feet of the style reference.
```
Blusa clara e coque: D (Percy Lau, 1943). Rosário branco: D (velha da Rua do Xixá, 1936). A almofada de bilros entra depois como objeto.

### Carregador do porto (homem, uns 30 anos)
```
CHARACTER: a dock porter from the old pier, about 30 years old, dark skin, broad shoulders, muscular but lean, short curly black hair. Sleeveless knit cotton shirt with wide horizontal stripes, faded navy and cream, stretched and stained. Loose dark gray cotton trousers rolled up below the knee. Narrow worn brown leather belt with a plain dark iron buckle. Old felt hat with a dented crown and a dark band. Barefoot.
```
Tudo D pelas fotos de Platt, 1935. O cinto vale aqui (porto), não no jangadeiro.

### Retirante (homem, uns 45 anos)
```
CHARACTER: a drought refugee (retirante) from the backlands of Ceará, about 45 years old, light brown sun-burnt skin, very thin, tired face, short stubble. Long-sleeved light cotton shirt and long light cotton trousers, both a single faded dusty color, frayed hems, covered in dry earth dust. Worn leather sandals (alpercatas) with straps. Wide-brimmed palm straw hat, battered.
```
Camisa e calça claras compridas, chapéu de palha de aba larga: D (foto do Patu, 1932). Alpercata: D em 1916, P em 1932. Magro sim, sem caricatura de fome.

### Retirante (mulher, uns 35 anos)
```
CHARACTER: a drought refugee woman (retirante), about 35 years old, brown skin, thin, tired face. A white cotton cloth covering her head and shoulders like a shawl. Long-sleeved faded cotton blouse and a long plain skirt down to the ankle, both dusty and frayed. Barefoot. HANDS AND FEET: small and delicate hands with slender fingers, small narrow feet; do NOT copy the big hands and feet of the style reference.
```
O pano branco na cabeça e nos ombros é o traço mais forte das fotos (D 1915 e 1916, P 1932).

### Criança da praia (menino, uns 8 anos)
```
CHARACTER: a beach boy about 8 years old, sun-tanned skin, short black hair. Short-sleeved light cotton shirt, faded and too big for him, and knee-length cotton shorts with a drawstring. Barefoot, no hat. HANDS AND FEET: small hands and small feet, proportional to a child; do NOT copy the big hands and feet of the style reference.
```

### Criança da praia (menina, uns 8 anos)
```
CHARACTER: a beach girl about 8 years old, brown skin, black hair in a short braid. Simple cotton dress with a small faded checked print, short sleeves, down to the knee. Barefoot. HANDS AND FEET: small hands and small feet, proportional to a child; do NOT copy the big hands and feet of the style reference.
```
Os dois: D (foto de Welles, 1942).

### Homem da cidade (uns 45 anos)
```
CHARACTER: a well-off man from downtown, about 45 years old, white man with fair skin slightly reddened by the sun, trimmed mustache, short hair combed with pomade. White linen suit, starched and well cut, white shirt with soft collar tucked in, thin dark tie. Stiff straw boater hat with a flat crown and a dark band. Brown leather shoes, polished. HANDS AND FEET: normal-sized, well-kept hands that never did manual work, normal feet; do NOT copy the big hands and feet of the style reference.
```
Tudo D (Praça do Ferreira 1930; desfile 1931 a 1937). Calçado e chapéu separam a classe.

## Folha de cabeças de figurante (2×2, uma geração só)

Anexar `estilo-arcane/cabecas-figurantes-estilizadas.webp` como referência de estilo e de layout.

```
A 2x2 sheet of four different head busts, same painting style as the attached reference: hand-painted stylized 3D inspired by Arcane (Fortiche), exaggerated proportions, long angular faces, big noses, flat painted colors with visible brush strokes, no pores, almost no baked shadow, hair as chunky painted locks. All four heads at the same eye height, front view, neutral expression, eyes open. Neck cut straight at the base, nothing below the neck. Empty space between the heads. Plain light gray background, flat lighting, no text.
People of Fortaleza, Brazil, 1932, all poor and sun-cured:
1. [descrição]
2. [descrição]
3. [descrição]
4. [descrição]
```
Ideias de descrição: `young woman about 20, dark skin, hair in a tight bun` · `old man about 70, bald, white stubble, missing teeth` · `woman about 40, indigenous features, long straight black hair parted in the middle` · `boy about 14, shaved head` (cabeça raspada é D nos campos de 1932) · `man about 35, curly hair, thick eyebrows, scar on the cheek`.

## Gente branca da cidade (17/10)

No bloco fixo, troque "do NOT draw the old man" por "do NOT draw the old man and do NOT copy his body proportions or skin color". Mulher e criança com mão e pé pequenos, homem de classe com mão normal.

- **Senhora da elite (40):** vestido de dia cortado em viés, meio da canela, cintura natural com cinto fino, manga curta com babado, cabelo curto ondulado, chapéu pequeno inclinado, sapato de salto baixo com tira. D (foto de 1930) + P (moda de 1932).
- **Normalista (17):** blusa branca, gravata azul-marinho, saia azul-marinho pregueada. D no Rio (1929), P em Fortaleza.
- **Padre (50):** batina preta até o pé, faixa, chapéu preto. P.
- **Menino de família (9):** roupa de marinheiro, meia três-quartos, sapato. P.
- **Aluno do Liceu (15):** túnica e calça cáqui com duas listas azul-marinho, quepe. D anos 1940, P 1932.
- **Médico (55):** guarda-pó branco sobre terno, óculos redondos, chapéu de feltro. P.
- **Comerciante (55):** terno escuro com colete, corrente de relógio de bolso, feltro. P.
- **Moça do Sul, turista (25):** vestido de dia claro estampado, chapéu pequeno. D (cruzeiro do Touring Club, junho de 1932) para a visita, P para a roupa.
- **Senhora indo à missa (60):** vestido escuro, mantilha preta de renda. P.
- **Filha da Caridade (45):** hábito cinza-azulado até o pé, corneta branca engomada. D a chegada em 1865, P o hábito em 1932.

Os prompts completos ficaram na conversa de 17/10.

## Kit modular: máximo de combinações com o mínimo de Tripo (17/10, proposta, não testada)

Ideia: em vez de um Tripo por personagem, um Tripo por **peça**, e todas as peças nascem do **mesmo corpo base na mesma pose**, então servem umas nas outras.

1. **Corpo base** por tipo (homem magro, homem forte, mulher, criança): roupa de baixo, descalço. 1 Tripo cada.
2. **Roupas**: no ChatGPT, editar a imagem do corpo base ("same man, same pose, dress him in...") e mandar ao Tripo **em partes**. Cada geração rende 1 parte de cima + 1 de baixo, e todas trocam entre si porque vêm do mesmo corpo. O tripo_rig.py já separa corpo, camisa e calça.
3. **Cabeças**: folha 2×2 (testar se o Tripo faz as 4 numa geração só e o Blender separa por pedaço solto; se não, 1 por cabeça).
4. **Chapéus e calçados**: folha 2×2 do mesmo jeito.
5. **Cor**: no jogo, pela paleta do figurino, de graça.

Conta para o homem magro: 4 roupas (cima × baixo = 16) × 8 cabeças × 4 chapéus (com "nenhum") = 512, antes da cor. Custo: 1 corpo + 4 roupas + 2 folhas de cabeça + 1 de chapéu = 8 Tripo.

Regras de combinação: cada peça leva etiqueta de classe (povo, remediado, elite), para não sair terno de linho descalço.

Riscos a testar no piloto: peças de gerações diferentes alinharem no corpo (escala e pose), pele aparecendo através da roupa, emenda no pescoço, tom da pele da cabeça igual ao do corpo, Tripo fazer 4 objetos numa imagem.

**Piloto (4 Tripo):** corpo base do homem magro, 2 roupas vestidas nele, 1 folha de cabeças. Se trocar bem, escala; se não, volta para personagem inteiro + cor no jogo.
