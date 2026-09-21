# A proposta comercial — o único documento que sai

**Status: implementado.** Este texto explica a regra que sustenta a proposta e,
principalmente, **o que ela deliberadamente não faz**. Quem for mexer no
assunto deve ler a seção 3 antes de escrever uma linha.

---

## 1. Por que existem dois documentos de dinheiro

O ALTAR tinha um só, e ele era interno.

| | **Orçamento** | **Proposta** |
| --- | --- | --- |
| Tabela | `budgetItems` | `proposals` |
| Traz | custo orçado, lucro, margem | escopo e investimento |
| Fornecedor | sim | **nunca** |
| Eixo | categoria de custo | o que a cliente recebe |
| Para | a reunião dela, sozinha | a reunião com a cliente |
| PDF | `altar-orcamento-interno-*.pdf` | `proposta-<cliente>.pdf` |

A pergunta "por que não derivar um do outro?" tem resposta e ela não é de
gosto: **o que a cliente lê não é um recorte do que a decoradora calcula.** Ela
vende "Projeto floral da cerimônia — R$ 38.000", e por trás disso há dezoito
linhas de custo. Derivar amarraria os dois para sempre, e toda mudança de preço
interno mexeria num documento que já foi enviado.

`trazerDoOrcamento` existe para o caminho oposto e só ele: **copia** as linhas
de `type: "income"` do orçamento do evento para dentro da proposta, onde a
decoradora reescreve os textos. As de `expense` nunca são lidas.

---

## 2. A regra de ouro

> **A fronteira mora na TRANSFORMAÇÃO, não na renderização.**

`convex/lib/propostaComercial.ts` tem uma função, `paraOCliente`, que é a única
porta por onde uma proposta vira documento. Ela **constrói um objeto novo,
campo a campo**. Não existe `...proposta` ali, e a ausência é a regra — o item
também é reconstruído, linha a linha.

É a diferença entre duas frases que parecem iguais:

- *"a tela não mostra o custo"* — quebra assim que alguém acrescentar um campo;
- *"o custo não existe no objeto que sai daqui"* — não quebra.

Quem consome `paraOCliente`: a pré-visualização (`comoOClienteVe` →
`VisaoDoCliente`) e o PDF. **Os dois, o mesmo objeto.** Uma pré-visualização
que monta o documento por conta própria é uma pré-visualização que mente, e o
tipo `PropostaParaCliente` é a trava: um campo interno novo não compila na
tela, porque o tipo não o tem.

O teste que protege isso (`convex/lib/propostaComercial.test.ts`) monta uma
proposta **contaminada** — com `custoInterno`, `margemPercentual`,
`lucroPrevisto`, `fornecedorPreferido`, `notaInterna` e `comissao`, além de
`custo`, `margem`, `supplierId` e `notaInterna` dentro de cada item — e exige
que nada disso apareça em nenhuma profundidade do resultado nem do JSON.
`convex/propostas.hostil.test.ts` repete a prova no banco, com a lista **fechada**
de chaves do documento.

---

## 3. O que a proposta NÃO faz

Cada linha aqui é uma ausência deliberada. Nenhuma é um pendência esquecida.

- **Não envia.** Não há e-mail, WhatsApp nem qualquer saída externa.
  "Marcar como enviada" é um REGISTRO do que aconteceu fora do sistema.
- **Não assina.** Não há valor jurídico, não há assinatura eletrônica, não há
  aceite da cliente. "Aceita" é a decoradora anotando o que ouviu — e por isso
  dá para desfazer: clique trocado acontece, e decisão que não se desfaz vira
  dado errado permanente.
- **Não cobra.** Nenhuma ligação com o Asaas, nenhum link de pagamento.
- **Não vira evento sozinha.** Aceitar não cria evento. O evento nasce da
  conversão do lead, que pede data, local e tipo; inventá-los a partir de uma
  proposta produziria um evento errado em silêncio. A tela mostra o **caminho**
  para o Funil — e só.
- **Não inventa regra comercial.** Condição de pagamento é texto livre, não um
  formulário de parcelas: parcelamento, multa, reajuste e cancelamento são
  decisões da empresa, e um campo estruturado imporia uma política que o ALTAR
  não tem por que ter.
- **Não calcula margem.** Ela não conhece custo. É o ponto inteiro.

---

## 4. O que é derivado, e por quê

Dois números nunca são gravados:

- **`investimento`** — soma dos itens, via `somaEmDinheiro` (que resiste a um
  item podre em vez de transformar o documento em "R$ NaN" na frente da
  cliente). Um total gravado diverge do primeiro item editado, e aí a proposta
  exibe uma soma que não fecha com as próprias linhas.
- **`vencida`** — comparação de `validadeAte` com o dia de hoje. Gravado, seria
  um estado que envelhece sozinho no banco e exigiria alguém varrendo propostas
  todo dia para mantê-lo verdadeiro. Proposta **decidida** nunca vence: aceita
  é aceita.

---

## 5. O que é congelado, e por quê

`registrarEnvio` grava `versaoEnviada`: título, itens, condições, validade e
investimento, no momento do envio.

Editar a proposta depois **nunca** reescreve esse registro — `update` não toca
em `versaoEnviada` por nenhum caminho, e há teste para isso. A tela avisa
quando a versão atual diverge da enviada, porque discutir um número que a
cliente não tem na mão é o erro que esse aviso existe para evitar.

Reenviar depois de editar grava uma versão nova. A última enviada é a que vale.

---

## 6. A cadeia

```
LEAD ──cria──► PROPOSTA ──registra envio──► (fora do ALTAR) ──registra aceite──► ...
 │                 │
 │                 └── aparece no card do funil e na tela do evento
 └──conversão manual──► EVENTO ──cria──► PROPOSTA
```

Uma proposta nasce de um **lead** (antes de existir evento) ou de um **evento**
já criado — nunca do nada, porque uma proposta sem destinatário não teria de
quem falar. Os dados do cliente são **copiados** na criação, não lidos por
referência: a proposta é um documento datado, e renomear o lead seis meses
depois não pode reescrever o que foi apresentado.

No demo, a proposta de Marina & Gabriel está pendurada nas duas pontas, porque
foi isso que aconteceu: nasceu da oportunidade e hoje pertence ao casamento.

---

## 7. Onde está cada coisa

| Arquivo | Papel |
| --- | --- |
| `convex/lib/propostaComercial.ts` | A regra. `paraOCliente`, `estaVencida`, `investimentoTotal`, `faltaParaEnviar`. Sem banco. |
| `convex/propostas.ts` | As funções. Posse, limites, congelamento, `trazerDoOrcamento`. |
| `convex/schema.ts` → `proposals` | A tabela e o porquê de cada campo. |
| `src/pages/app/propostas/page.tsx` | A lista: o que está esperando resposta. |
| `src/pages/app/propostas/[id]/page.tsx` | O editor e o acompanhamento. |
| `src/pages/app/propostas/_components/visao-do-cliente.tsx` | O que a cliente vê, do mesmo objeto do PDF. |
| `src/lib/generate-proposta-pdf.ts` | O PDF. Recebe `PropostaParaCliente` e nada mais. |

---

## 8. Se você for mexer

- **Campo novo no documento da cliente** exige três edições, nessa ordem:
  `PropostaParaCliente`, `paraOCliente` e a lista fechada de chaves em
  `propostas.hostil.test.ts`. Se você só fez uma, o teste quebra — é o desenho.
- **Campo interno novo** não exige nada: ele não atravessa, porque nada
  atravessa por acidente.
- **Não acrescente status.** Os quatro (`rascunho`, `enviada`, `aceita`,
  `recusada`) cobrem o que a operação produz. "Expirada" não é status — é
  derivado. "Assinada" exigiria assinatura, que não existe.
- **Não ligue envio.** A porta de saída externa do ALTAR é uma só
  (`communicationsOutbox`) e ela está fechada. A proposta não abre outra.
