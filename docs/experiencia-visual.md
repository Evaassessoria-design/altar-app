# A experiência visual do ALTAR

Como o produto representa, hoje, o trabalho de uma empresa de decoração — e
onde ele ainda só organiza em vez de mostrar.

Datado de 21/09/2026, conferido contra o código em `b94c891`.

---

## 1. O sistema visual dos documentos

São **seis**, e até esta rodada eram **duas famílias**.

| Documento | Audiência | Arquivo gerado |
|---|---|---|
| Relatório do evento | **INTERNO** | `altar-relatorio-interno-*.pdf` |
| Orçamento | **INTERNO** | `altar-orcamento-interno-*.pdf` |
| Proposta comercial | **CLIENTE** | `proposta-<cliente>.pdf` |
| Ficha técnica | **EQUIPE** | `ficha-tecnica-*.pdf` |
| Caderno de montagem | **EQUIPE / CLIENTE / INTERNO** | `caderno-montagem-*-<audiência>.pdf` |
| Folha de carregamento | **EQUIPE** | `carregamento-*.pdf` |

### A regra

`brand.ts` a declara desde que nasceu:

> **O protagonismo é da empresa; o ALTAR assina discretamente no rodapé.**

Quatro documentos obedeciam. Os dois INTERNOS — os únicos que só ela vê —
faziam o contrário: o Relatório abria com uma faixa de 28mm escrita
*"ALTAR — Plataforma para Decoradores de Eventos"*, e o Orçamento imprimia o
nome da PESSOA (`currentUser.name`), não o do estúdio.

`lib/pdf-marca.ts` é a peça compartilhada: **cabeçalho e rodapé**, que é o que
os seis têm em comum de verdade. O miolo continua diferente por necessidade —
uma folha de carregamento não se parece com uma proposta, e não deve.
Abstrair o miolo seria construir um framework de documento para resolver um
problema de identidade.

### CLIENTE · EQUIPE · INTERNO

| | Como se comporta |
|---|---|
| **CLIENTE** | Editorial. Sem carimbo de sistema: um documento de venda com selo deixa de parecer dela. A fronteira é de TIPO (`PropostaParaCliente`), não de renderização |
| **EQUIPE** | Operacional. Miniatura, caixa de conferência, ambiente, quantidade. Sem dinheiro — preço na mão de quem carrega é vazamento |
| **INTERNO** | Denso, e **declarado**: aviso ao lado do tipo do documento, repetido em TODA página (quem imprime e separa folha não vê a capa) e no nome do arquivo (é o que aparece na lista de downloads na hora de anexar no WhatsApp) |

`documentos-da-marca.test.ts` cobra isso dos seis de uma vez.

---

## 2. Referência x resultado — o modelo já sabia

Esta é a distinção central do domínio, e **ela não precisou de tabela nova**.

`eventPhotos` tem **dois eixos independentes**, e é a combinação que responde:

| Eixo | Campo | Valores |
|---|---|---|
| **Quando** a foto foi feita | `category` | antes · montagem · evento · desmontagem |
| **O que ela significa** | `projectScope` | incluso · referencia · nao_incluso |
| **De que parte** do evento | `ambiente` | texto livre |

- *"é assim que queremos"* → `projectScope: "referencia"`
- *"está contratado"* → `projectScope: "incluso"`
- *"foi assim que ficou"* → `category: "evento"`

E em `assemblyItems` a mesma distinção existe por item, com dois campos
separados: `referencePhotoStorageId` e `contractedPhotoStorageId`.

### O defeito que estava no meio

`updatePhoto` **aceitava** `projectScope` e `ambiente` e os **descartava** na
gravação — o patch só carregava `caption` e `category`. A tela mandava,
recebia "salvo!" em verde, e nada acontecia. `savePhoto` nem aceitava os dois.

Ou seja: o schema documentava a distinção em oito linhas, `scopeMeta` desenhava
o selo, `AVISO_REFERENCIA` escrevia o aviso — e nada chegava ao banco. Em
`assemblyItems` a mesma regra sempre funcionou. Só nas FOTOS era jogada fora.

---

## 3. Ambiente — a entidade que não foi criada

`ambiente` **já existia** em `eventPhotos` e em `assemblyItems`. Não havia
tabela a criar; faltava gravar e oferecer.

**É texto livre, e isso é decisão de domínio, não preguiça.** "Mesa do bolo"
numa empresa é "mesa de doces" na outra, e um evento traz "capela" que nenhuma
lista fechada previu. Os ambientes já usados viram sugestão (`<datalist>`) e
botões de filtro — o vocabulário nasce do uso dela, não de uma enumeração.

O filtro vive na CONSULTA e ignora caixa e espaço: "mesa do bolo" e
"Mesa do Bolo" são o mesmo lugar para quem procura.

---

## 4. Layout

O que existe: `/eventos/:id/planta` — croqui enviado, interpretado e
transformado em planta 2D (`layoutRenders`), com contagem de elementos
preservada. A planta **já entra no Caderno de montagem** como seção própria,
em até 1400px de largura.

**O que falta não é ferramenta, é ligação.** A planta é uma imagem; os
ambientes são texto. Nada liga "mesa do bolo" na planta a "mesa do bolo" nas
fotos e nos itens de montagem. A decoradora vê a planta inteira ou o ambiente
inteiro, nunca um dentro do outro.

Ligar os dois exigiria coordenadas por ambiente — o começo de um editor. **Não
foi feito, e não deve ser feito agora** (ver §8).

---

## 5. Caderno de montagem

Já é mais visual do que parece:

- **contratada tem precedência sobre referência**, e quando só há referência
  ela vai **rotulada como referência** — sem isso a equipe monta a inspiração
  em vez do contratado;
- agrupado por área/ambiente;
- caixa de conferência por item;
- planta do evento como seção;
- fornecedor e observação **somem** na audiência `cliente`.

**A miniatura tem 22mm.** É o tamanho de um selo postal. A FASE 8 pede
"[FOTO DE REFERÊNCIA GRANDE]", e o trade-off é real: um caderno de 60 itens
com foto grande vira um documento de 60 páginas para levar ao galpão. É
**decisão de produto**, não defeito — ver §8.

---

## 6. Imagens e custo

| | Situação |
|---|---|
| Teto de upload | 15 MB por imagem (`lib/upload.ts`) |
| Redução no upload | **não existe** — o original vai inteiro para o storage |
| Redução no PDF | **existe**: canvas → JPEG 0,7, 320px (miniatura) e 1400px (planta) |
| Falha de imagem | nunca derruba o documento (`loadThumbnail` devolve `null`) |
| Lazy loading | a grade da galeria tem; as imagens únicas não precisam |
| Storage órfão | a cascata de exclusão apaga arquivo (`cascade.test.ts`) |

**O risco é o original de 15 MB servido na grade.** Não há thumbnail no
storage: a galeria baixa a foto inteira para desenhar um quadrado de 120px.
Com 70 fotos num evento, num galpão com 4G, isso é lento e caro.

**Gatilho para corrigir:** quando uma conta passar de ~200 fotos, ou na
primeira reclamação de lentidão na galeria. A correção é gerar uma versão
reduzida no upload — não um pipeline de processamento.

---

## 7. Mobile

Auditado **estaticamente**. Nenhum navegador foi aberto.

O que foi corrigido nesta rodada: o visualizador de fotos não fechava com
**Esc**, não andava com as **setas**, e seus três botões eram só ícone, sem
nome acessível, em alvos de 32px. É a tela mais usada no dia do evento.

O que **precisa ser visto no aparelho**: se a foto de referência é grande o
bastante para decidir uma montagem; se a fileira de filtros de ambiente rola
confortavelmente; e se o `<datalist>` do campo de ambiente abre bem no iOS —
o suporte varia, e se não abrir a sugestão simplesmente não aparece (o campo
continua funcionando como texto livre).

---

## 8. Decisões adiadas

Nenhuma é técnica. Todas mudam o produto.

1. **Foto grande no Caderno.** Dense (hoje) × uma ficha visual por ambiente.
   A segunda é melhor para entender em segundos e pior para carregar no
   galpão. Provavelmente as duas deveriam existir, como as audiências já são
   três — e isso é uma escolha, não uma correção.
2. **Ambiente como entidade.** Hoje é texto repetido em duas tabelas. Virar
   entidade daria a página que a FASE 7 desenha (referências + layout +
   composição + materiais + fornecedores + fotos finais, num lugar só) e
   custaria migração, vínculo e tela. **O texto livre resolve o beta.**
3. **Ligar planta e ambiente.** Exige coordenadas — o começo de um editor.
4. **Moodboard.** As peças existem (referências por ambiente, paleta da
   empresa em `brandColor`). Falta a tela. Paleta **não** deve ser extraída da
   imagem por IA: seria cor inventada apresentada como decisão dela.
5. **Redução de imagem no upload.** Ver §6.

---

## 9. O que NÃO entra agora

IA generativa de decoração, Pinterest/Instagram API, busca automática de
inspiração, editor 3D, realidade aumentada, reconhecimento de flores,
orçamento por fotografia e marketplace. Podem estar no roadmap; **nenhum no
beta**.
