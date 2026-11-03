# Acessórios — levantamento do projeto original no Fusion 360

Fonte: documento **"Mesa de Solda v4"** (projeto VM Studio), aberto no Fusion 360 e
inspecionado em 02/11/2026 **somente por leitura** pelo MCP do Fusion (scripts com
`readOnly: true`). Nada foi alterado ou salvo no documento original. O script de leitura
está em [`scripts/fusion/inspect_plates.py`](../scripts/fusion/inspect_plates.py).

Material de todas as peças no modelo: aço (`Steel`). Unidades: mm.

## Mesa de referência do modelo

| Item | Valor |
|---|---|
| Tampo | 1000 × 600 mm |
| Furos | 240 furos Ø15,8 (20 × 12) |
| Passo | 50 × 50 mm, primeiro centro a 25 mm da borda |

O diâmetro dos furos dos acessórios é **igual** ao dos furos da mesa (Ø15,8). Os rasgos
oblongos têm a mesma largura (15,8). No MesaFácil isso vira "furo do acessório = furo da
mesa + folga dos furos" (folga padrão 0, como no original).

## Acessórios encontrados

O modelo tem cinco acessórios (componentes de primeiro nível). Os nomes da especificação
foram mapeados para eles assim:

| Componente no Fusion | Nome no MesaFácil | Chapas | Espessura |
|---|---|---|---|
| Trava | Barra de fixação reta | 1 | 9,53 mm (3/8″) |
| Trava em V | Barra de fixação com recorte em V | 1 | 9,53 mm |
| Esquadro 2D | Cantoneira plana em L | 1 | 9,53 mm |
| Esquadro Vertical | Esquadro de fixação 90° com reforços (largo) | 4 (face, base, 2 reforços) | 6,35 mm (1/4″) |
| Esquadro Vertical (1) | Esquadro de fixação 90° estreito | 4 (face, base, 2 reforços) | 6,35 mm |

Não há no modelo um "esquadro triangular" separado do esquadro de 90°: os reforços
triangulares fazem parte do Esquadro Vertical. Por isso não criamos um modelo extra.

### Trava — barra de fixação reta (150 × 50 × 9,53)

- Cantos externos com raio 1.
- Furo Ø15,8 a 20 mm de uma extremidade, no eixo da barra.
- Rasgo oblongo de largura 15,8, com centros dos semicírculos a 50 e 120 mm da outra
  extremidade. Medido a partir do furo, o rasgo cobre de 30 a 100 mm, ou seja, do
  1º passo − 20 mm até o 2º passo.
- Volume no Fusion: 57 189,6 mm³ (área líquida 6 001,0 mm²).

### Trava em V — barra com recorte em V (150 × 50 × 9,53)

- Extremidade com V de 90°, flancos a 45° partindo dos cantos; o vértice fica a W/2 = 25 mm
  da extremidade virtual.
- **Alívio circular r5 centrado no vértice** (arco de 270°, confirmado por teste de
  pertinência de ponto: o centro do arco está fora do sólido).
- Cantos com raio 1 (inclusive os cantos de 45° da boca do V).
- Furo a 20 mm da extremidade reta; rasgo de 60 mm cobrindo de 25 a 85 mm a partir do furo
  (1º passo − 25 / + 35).
- Volume no Fusion: 52 158,3 mm³.

### Esquadro 2D — cantoneira plana em L (200 × 200 × 9,53)

- Braços de 50 mm de largura; cantos externos r1.
- **Alívio r7,5 centrado no canto interno do L** (270°, confirmado por teste de ponto).
- Furo no canto, no cruzamento dos eixos dos braços (25 mm de cada borda externa).
- Um rasgo em cada braço, no eixo do braço, cobrindo de 45 a 155 mm a partir do furo do
  canto (do 1º ao 3º passo, ±5 mm).
- Volume no Fusion: 126 769,9 mm³.

### Esquadro Vertical — esquadro de 90° com reforços (100 × 156,2 × 200)

Quatro chapas de 6,35 mm montadas por abas e entalhes:

1. **Face vertical** 100 × 200: malha de 2 × 4 furos Ø15,8 no passo da mesa (centros a 25 mm
   das bordas). Entalhes laterais de 20 mm de altura e **6,55 mm** de profundidade
   (espessura + 0,2) para as abas dos reforços, com centros a 47,5 e 150 mm da base.
   Entalhe inferior de 20 × 6,35 centrado, para a aba da base.
2. **Base** 99,6 × 156,2 (largura da face − 2 × 0,2): dois rasgos oblongos paralelos de 100 mm,
   alinhados às colunas de furos da face (espaçados de 1 passo), começando a 25 mm da face.
   Aba frontal de 20 mm que entra no entalhe inferior da face. Abas laterais de 20 mm que
   atravessam os entalhes inferiores dos reforços.
3. **Reforços** (2 iguais, espelhados): triângulo retângulo com pernas de 200 (altura) e
   156,2 (base), hipotenusa com chanfros de 30 mm nas duas pontas e raios 3. Duas abas de
   20 mm na perna vertical (entram nos entalhes da face) e dois entalhes de 20 × 6,35 na
   perna inferior (recebem as abas da base). Recorte de alívio triangular deslocado 35 mm para
   dentro de cada lado, com cantos r3. Cinco furos Ø15,8 sobre a linha a 17,5 mm das bordas.
- Volumes no Fusion: face 112 906,0; reforço 98 446,8; base 64 165,7 mm³.

**Esquadro Vertical (1)** é a versão estreita (50 mm): face 50 × 200 com um furo central e dois
rasgos verticais em vez da malha; base 49,6 × 156,2 com um rasgo; reforços idênticos.

## Regras paramétricas adotadas

Os acessórios **não** são ampliados. As medidas que dependem da malha passam a ser múltiplos do
passo; as demais ficam em mm. Com a malha original (Ø15,8, passo 50) os valores-padrão
reproduzem o modelo do Fusion.

| Acessório | Depende da malha | Fixo em mm (ajustável) |
|---|---|---|
| Barra reta | comprimento = n × passo; rasgo cobre do passo k1 ao k2 a partir do furo | largura 50, furo a 20 da ponta, folgas do rasgo −20/+0, raio 1 |
| Barra em V | comprimento = n × passo; rasgo cobre o passo k a partir do furo | largura 50, furo a 20, folgas −25/+35, alívio r5, raio 1 |
| Cantoneira L | braço X = nX × passo X; braço Y = nY × passo Y; rasgos do 1º ao penúltimo passo | largura dos braços 50, ±5 mm, alívio r7,5, raio 1 |
| Esquadro 90° | largura da face = colunas × passo; malha da face e rasgos da base no passo; rasgo da base = n × passo | altura 200, espessura 6,35, abas 20, folga 0,2, chanfros 30 |

Nos acessórios orientados (barras, esquadro), o usuário escolhe se o comprimento acompanha o
passo X ou o passo Y da mesa. A cantoneira usa os dois passos, um em cada braço, e por isso
funciona em malhas não quadradas.

## Diferenças intencionais em relação ao Fusion

- **Esquadro 2D**: no modelo, o rasgo horizontal está inclinado 0,14° (centros em y = 25,05 e
  25,33) e o furo do canto está em y = 25,44. Tratamos isso como imprecisão de desenho e
  alinhamos tudo ao eixo do braço (y = 25).
- **Reforços do Esquadro Vertical**: no modelo, o corpo do reforço começa 6,2 mm atrás da
  frente da face, que tem 6,35 mm de espessura. Isso dá 0,15 mm de sobreposição de volume
  entre o reforço e a face. No MesaFácil o corpo do reforço começa na face traseira da placa
  (6,35) e as abas atravessam a placa até ficarem rentes à frente. Por consequência, o chanfro
  superior fica 0,15 mm mais para trás.
- Nas larguras das abas o Fusion não tem folga (aba de 20 em entalhe de 20). No MesaFácil
  existe o parâmetro "folga na largura dos encaixes", com padrão 0 para manter o original.
- As posições de três furos dos reforços não têm cota no sketch original: o furo do meio da perna
  vertical (a 98,8 mm da base), o furo junto à hipotenusa (a 17,5 mm dela, perto do meio) e o
  furo superior (a 30 mm do topo). O MesaFácil usa estas regras: furos a 17,5 mm da frente e da
  base nos dois cantos inferiores; furo superior a 30 mm do topo; furo do meio da perna vertical
  no ponto médio entre o inferior e o superior; furo da hipotenusa a 17,5 mm dela, no ponto
  médio. A diferença em relação ao modelo é de até 5 mm.
- A posição das abas e entalhes entre reforço, face e base é proporcional à altura e à
  profundidade: abas da face a 23,8 % e 75 % da altura, abas da base a 20 % e 77,6 % da
  profundidade. Com as medidas originais isso reproduz o modelo com diferença menor que 0,1 mm.
