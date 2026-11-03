# MesaFácil

**Crie sua mesa de solda sob medida.** O MesaFácil é um configurador gratuito que roda inteiro no
navegador. Ele gera os desenhos DXF de corte a laser de uma mesa de solda perfurada (tampo,
laterais e reforços) e de acessórios compatíveis com a mesma malha de furos.

- Sem cadastro, sem servidor e sem envio de arquivos: tudo é calculado no seu navegador.
- Site: <https://vitalibr.github.io/mesafacil/>
- Criado por [VM Garage](https://www.youtube.com/@vmgarage_oficial) ·
  [Instagram](https://www.instagram.com/vmgarage.oficial/)

## Funcionalidades

- **Tampo**: comprimento, largura e espessura; furos com diâmetro e passo independentes em X e Y;
  distribuição automática (centralizada) ou manual (a partir do primeiro furo).
- **Laterais** opcionais (quatro lados, só os maiores ou só os menores), com recuo, furos e
  abas que encaixam em rasgos do tampo.
- **Reforços inferiores**: longitudinais, transversais ou em grade, com:
  - encaixe de meia altura entre reforços;
  - abas no tampo;
  - abas nas laterais (opcional);
  - alinhamento automático entre as linhas de furos.
- **Acessórios paramétricos** derivados dos modelos originais no Fusion 360: esquadro de
  fixação 90° (face, base e reforços), cantoneira plana em L, barra de fixação reta e barra com
  recorte em V. Eles se adaptam ao diâmetro e ao passo da mesa, inclusive malhas não quadradas.
- **Validação geométrica** com mensagens claras: furos sobrepostos ou fora da chapa, rasgos
  colados nas bordas, interferências, peças sobrepostas e encaixes que não cabem. Com erro, a
  exportação fica bloqueada.
- **Visualização 2D** em SVG (vista superior e peças separadas), com zoom, arraste, grade, cotas
  e seleção de peça.
- **Visualização 3D** da mesa e dos acessórios montados (Three.js), com vista explodida. Cada
  chapa é extrudada do mesmo contorno que vai para o DXF e posicionada pela mesma posição usada
  na vista superior. É só visualização: não gera STEP.
- **Exportação**: DXF por peça, ZIP completo, lista de peças em CSV, especificações técnicas e
  pedido de orçamento pronto para copiar.
- **Salvar e carregar** o projeto em JSON, com salvamento automático no navegador.
- **Tutorial** no primeiro acesso, que pode ser reaberto pelo botão "Como usar o MesaFácil", e
  ajuda curta junto aos campos técnicos.

## Como usar

1. Ajuste as medidas do tampo e os furos no painel da esquerda. O desenho é atualizado na hora.
2. Ative laterais e reforços, se quiser, e escolha os encaixes.
3. Confira o selo de validação (válido, com avisos ou inválido) e as peças em "Peças para corte".
4. Em **Acessórios**, configure os modelos e adicione-os ao projeto com a quantidade desejada.
5. Clique em **Baixar projeto completo** e depois em **Copiar pedido de orçamento**.

Estrutura do ZIP (dinâmica: só entram as peças que existem no projeto):

```
MesaFacil_1200x800/
├── DXF/
│   ├── 01_Tampo.dxf
│   ├── 02_Lateral_Longa.dxf
│   ├── ...
│   └── Acessorios/A1_Esquadro_de_fixacao_90_01_Face_vertical.dxf
├── Projeto/configuracao.json
├── Lista_de_Pecas.csv
├── Especificacoes_Tecnicas.txt
└── Pedido_de_Orcamento.txt
```

Peças com geometria idêntica, incluindo furos e encaixes, viram um único DXF com quantidade.
Peças espelhadas também contam como iguais, porque a chapa pode ser virada.

## Arquivos DXF

- Gerados com [`@tarikjabiri/dxf`](https://github.com/dxfjs/writer) (MIT), formato AC1021,
  `$INSUNITS = 4` (milímetros), escala 1:1.
- Uma única camada `CORTE`, só com geometria de corte: contornos `LWPOLYLINE` fechados (arcos
  como *bulge*), furos como `CIRCLE` de verdade e nenhuma cota, texto ou linha auxiliar.
- Cada peça fica em coordenadas próprias, com o canto da caixa envolvente em (0, 0).
- **Sem compensação de kerf**: os desenhos estão nas medidas nominais finais. A empresa de corte
  deve aplicar a compensação de ferramenta e confirmar as tolerâncias dos encaixes.
- **DWG** não é gerado. Não há conversor de DWG gratuito e confiável que rode no navegador; sites
  como o CloudConvert convertem nos servidores deles. Se a empresa exigir DWG, abra o DXF no
  [ODA File Converter](https://www.opendesign.com/guestfiles/oda_file_converter) (gratuito) ou no
  AutoCAD. Também não há STEP: ele só será oferecido quando houver sólidos 3D reais dos
  parâmetros configurados.

## Convenções geométricas

- Eixos: X = comprimento, Y = largura, Z = altura. Origem no canto inferior esquerdo do tampo
  visto de cima; Z = 0 na face inferior do tampo.
- **Furos automáticos**: cabe o maior número de furos com centro a pelo menos a margem mínima
  das bordas, e a malha é centralizada. Exemplo: 1200 × 800, passo 50 e margem 25 dão
  24 × 16 = 384 furos.
- **Cantos das laterais**: as laterais longas são externas e medem o comprimento do tampo menos
  2 × o recuo. As curtas ficam entre as longas e medem a largura menos 2 × o recuo menos
  2 × a espessura. O encontro é de topo.
- **Reforços**: distribuição uniforme no espaço interno (entre as laterais, ou a partir do recuo
  das pontas). Opcionalmente, cada um é deslocado para o vão entre linhas de furos mais próximo.
  Sem encaixe entre reforços, os longitudinais seguem inteiros e os transversais são divididos
  em trechos.
- **Encaixe entre reforços**: rasgos de meia altura. O longitudinal recebe o rasgo aberto para
  baixo e o transversal, aberto para cima. Monte primeiro os transversais e desça os
  longitudinais sobre eles.
- **Folga**: largura do rasgo = espessura da peça que entra + folga total; comprimento do
  rasgo = largura da aba + folga. As abas no tampo têm profundidade igual à espessura do tampo
  e ficam rentes à face de cima.
- **Abas**: quantidade calculada pelo comprimento da peça (espaçamento máximo e distância
  mínima das pontas). Quando uma aba cairia sobre um furo, ela é deslocada para o espaço livre
  mais próximo. Se não houver espaço, o problema é informado e a exportação fica bloqueada.
- **Abas dos reforços nas laterais** (opcional): uma aba no meio da altura do reforço atravessa
  um rasgo na lateral e fica rente à face externa.

Os acessórios estão documentados em [`docs/acessorios-fusion.md`](docs/acessorios-fusion.md):
o levantamento do modelo original no Fusion 360, as regras paramétricas e as diferenças
intencionais.

## Tecnologias

React 19, TypeScript, Vite, Tailwind CSS 4, SVG, Three.js (carregado só ao abrir a aba 3D),
`@tarikjabiri/dxf`, JSZip, Vitest e Playwright.
O motor geométrico (`src/engine`) não depende do React. Uma única representação de cada peça
alimenta a visualização 2D e 3D, o DXF, a lista de peças e a validação.

## Executar localmente

Requer Node.js 22 ou mais recente.

```bash
npm install
```

```bash
npm run dev
```

Abra <http://localhost:5173/mesafacil/>.

## Testes e build

```bash
npm run check
```

O comando `check` roda o typecheck, o lint, os testes unitários e o build. Os testes de interface
ficam em um comando separado:

```bash
npm run test:e2e
```

Auditoria independente dos DXF com o [ezdxf](https://ezdxf.mozman.de/) (Python):

```bash
npm run test:dxf
```

## Publicar

O workflow `.github/workflows/deploy.yml` roda todos os testes e publica o build no GitHub Pages
a cada push na branch `main`.

## Limitações conhecidas

- Até 20.000 furos no tampo; acima de 6.000 a visualização pode ficar mais lenta.
- Sem encaixe entre as pontas dos reforços longitudinais e transversais, sem posicionamento
  manual de reforços e sem aproveitamento de chapa (*nesting*).
- Acessórios: as posições de alguns furos dos reforços do esquadro não têm cota no modelo
  original e seguem uma regra própria (ver documentação). Não há exportação STEP.
- O 3D não detecta interferências entre sólidos; as verificações de montagem são as do motor 2D.
- Área e massa são estimativas (aço a 7,85 g/cm³).

## Aviso sobre fabricação

Os desenhos são gerados conforme os parâmetros informados. Antes da fabricação, confira as
medidas, espessuras, folgas e requisitos estruturais com o responsável pelo projeto e com a
empresa de corte. O MesaFácil valida apenas a geometria e não faz cálculo estrutural nem certifica
a resistência da mesa.

## Licença

[MIT](LICENSE).
