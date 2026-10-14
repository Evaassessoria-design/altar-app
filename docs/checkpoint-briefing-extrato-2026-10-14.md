# Checkpoint — Briefing reorganizado e Extrato financeiro (14/10/2026)

Branch **`feature/briefing-e-extrato`**, criada a partir de
`feature/caderno-cliente-equipe` @ `00e7c94` (que já traz o caderno
Cliente/Equipe, sobre o `5810dbd` publicado).

**Não contém:** o candidato de Pagamentos `94df752` (em `feature/evolucao-14-10`)
nem a Produção floral `ad73c75` (em `feature/producao-floral-ajustes`). Nada foi
integrado automaticamente. Nada foi publicado; nenhum merge na `main`.

| Commit | Assunto |
|---|---|
| `2495d34` | Briefing: blocos recolhíveis, itens por bloco, conferência de mobiliário, campos novos |
| `e9187a1` | Caderno e Carregamento com o briefing novo |
| `9fb4497` | Exportar extrato por período em PDF e Excel |
| `b45e1d2` | Extrato: totais das pendências em duas linhas |
| (este)    | Checkpoint |

## 1. Briefing

- **Abas:** as mesmas, na mesma ordem e com as mesmas chaves.
  - Os nomes mudaram onde foi pedido: "Mobiliário e conferência", "Flores e referências florais", "Mesa do bolo e doces", "Iluminação e conexão elétrica".
  - "Personalização / Itens Especiais" manteve o nome.
- **Blocos:** cada aba virou blocos recolhíveis.
  - Abertos por padrão: o primeiro bloco e os que já têm texto ou item.
  - "Informações complementares" começa fechado.
- **Respostas curtas** (Sim/Não/A definir/A confirmar) são botões.
  - Tocar de novo desfaz a resposta: "ninguém respondeu" é diferente de "Não".
- **Cantinho das crianças:** a pergunta "Haverá?" abre os detalhes (local, responsável e itens) só com "Sim".
- **Itens por bloco:**
  - sugestões de um toque (genuflexório, passadeira, arranjo de mesa modelo A/B, móvel do bar, tapete do cantinho, cordões de luz…) e "Adicionar item";
  - cada sugestão some quando vira item;
  - os itens são `assemblyItems` com `bloco`: nada de cadastro paralelo.
- **Item, campos novos (opcionais):** situação, origem, cor e acabamento, medidas, posição, responsável pela montagem, natural ou permanente (flores) e reaproveitamento em outro ambiente (ambiente, horário e quem transfere).
- **Fotos do item:** os rótulos passaram a "Inspiração" × "Modelo aprovado".
  - Nas referências do bloco (Galeria), a foto é marcada como Inspiração ou Modelo aprovado. Inspiração nunca vira contratado sozinha.
- **"Mostrar no caderno do cliente"** no item. Sem isso, nenhum item criado pela tela chegava ao caderno dos noivos (achado da homologação de 14/10).
- **Mobiliário:** a conferência dos móveis do evento inteiro.
  - Inclui os blocos de assentos, mesas, gastronomia, bar, convivência e composição da mesa do bolo, mais os móveis da própria aba.
  - Editar ali edita o mesmo item.
  - A peça reaproveitada é contada uma vez.
  - "Não se aplica" fica fora.
- **Situação "Em avaliação" e "Não se aplica":** não são obrigação de montagem (`ehObrigacaoDeMontagem`), então não entram em caderno, carga, Ficha Técnica, compras nem reserva pela ficha.
  - Personalização nasce "Em avaliação".
- **Defeito corrigido (homologação de 14/10):** anotar o fornecedor do item gravava nada e mostrava "Erro ao salvar item". `assemblyItems.update` agora aceita `supplierId: null`.
- **Landing:** dizia "61 campos"; agora diz "83 campos", o número real conferido pelo teste.

### Compatibilidade com dados antigos
- **Campos:** nenhum mudou de chave e nenhum saiu.
  - Os 61 antigos continuam na tela; os sem lugar natural ficam como anotação ou em "Informações complementares".
  - Exemplo: "Arranjo central" e "Serviço de bebidas" foram preservados.
- **Itens antigos:** sem `bloco`, aparecem em "Outros itens · <aba>" e seguem chegando ao caderno e ao carregamento como antes.
- **Backfill:** nenhum. Item sem situação ou sem origem se comporta exatamente como antes.

## 2. Caderno e Carregamento
- **Equipe:**
  - prazos e responsáveis do briefing (cerimônia pronta até, cantinho, bolo);
  - conexão elétrica;
  - na ficha: medidas, posição, quem monta e "Depois vai para X (horário) — transfere: Y. Mesma peça, não levar a mais".
- **Origem espaço, cliente ou locadora:** sai do caminhão.
  - No caderno, vai para "Chega no local — não carregar".
  - Na Folha de Carregamento, vai para um bloco próprio, sem caixas.
- **Em avaliação:** a equipe vê como "não montar sem confirmação"; o cliente vê em "Decisões que faltam".
- **Conexão elétrica:** as duas versões dizem quem instala e quem conecta; a observação interna só sai na da equipe.
- **Dinheiro:** todo texto novo passa pelo mesmo filtro.
  - Exemplo: "Pagar R$ 500 ao eletricista" sai; "Tomada 220V" fica.
- **Rodapé do PDF:** não encavala mais com nome de evento longo.
- **Gerar documento não grava nada:** o caderno e a folha só leem.

## 3. Extrato financeiro

### Auditoria (o que o banco registra)
- **`transactions.date`:** é o VENCIMENTO.
- **Parcela com `recebimentos[]`:**
  - cada recebimento tem `data` (dia em que entrou), `valor`, `forma`, comprovante e `anulacao`;
  - `isPaid`/`paidAt` são derivados dos recebimentos.
- **Lançamento sem histórico:** `isPaid` + `paidAt` ("AAAA-MM-DD"). O `paidAt` pode estar ausente em lançamentos antigos.
- **Despesas:** mesma estrutura; fornecedor só existe quando a despesa nasceu de uma compra (`purchaseItems.transactionId`).
- **Não existe:** saldo inicial nem conciliação bancária.

### Regra
- **Receita:** na data do recebimento, pelo valor recebido. Parcial entra só pelo que entrou; anulado fica fora.
- **Despesa:** na data do pagamento.
- **Sem dupla contagem:** parcela com recebimentos nunca é contada de novo pela baixa.
- **Pago sem data registrada:** vai para "Pagos sem data registrada", **fora dos totais**, porque o vencimento não é usado como data de pagamento.
  - A Receita do mês do Dashboard usa o vencimento nesse caso. A diferença é de propósito e está escrita no código.
- **Pendências:** o que está em aberto hoje com vencimento no período (saldo da parcela parcial, despesa não paga), em quadro separado.
- **Resultado:** "recebido menos pago no período" — **não é saldo bancário**.
- **Filtros:**
  - período: mês, três meses (terminando no mês escolhido, com as datas na tela) ou intervalo;
  - eventos: todos, um evento ou sem evento;
  - tipo: todas, receitas ou despesas.

### Leitura e segurança
- **`financeiro.extratoPagina`:**
  - lê TODOS os lançamentos da sessão, em páginas pelo índice `by_user`, sem teto de 500;
  - a tela pede página até `isDone`, e o documento imprime quantos lançamentos foram lidos;
  - página acima de 500 é recusada.
- **`financeiro.eventosDoExtrato`:** devolve só eventos da sessão.
- **Isolamento:** nenhum argumento diz de quem é o dado.
- **Comprovante:** sai como "Sim/Não"; nenhuma URL ou id de arquivo vai para o documento.

### Formatos
- **PDF:** A4 deitado, `jspdf-autotable` (cabeçalho repetido, linha nunca cortada), empresa, período, filtros, emissão e critério.
- **Excel (.xlsx):**
  - gerador próprio, sem dependência nova;
  - abas Resumo, Movimentações, Pendências e Pagos sem data;
  - datas e valores tipados, moeda formatada, autofiltro e cabeçalho congelado;
  - texto sempre `inlineStr`, que nunca vira fórmula.
- PDF e Excel saem do mesmo `DocumentoDoExtrato`.

## 4. Testes e checks (resultado real)

| Check | Resultado |
|---|---|
| `pnpm test` | **6.113/6.113** (272 arquivos) |
| `tsc` app / Convex | ok / ok |
| `pnpm lint` | 0 erros, 8 avisos (os mesmos de antes) |
| `pnpm build` | ok |

Testes novos:
- **`src/lib/briefing-reorganizado.test.ts`:**
  - as 83 chaves do schema aparecem exatamente uma vez na tela, no validador e na lista da IA;
  - briefing antigo preservado nos relatórios;
  - respostas pelo rótulo;
  - conferência sem duplicar e com reaproveitamento contado uma vez;
  - em avaliação fora da montagem;
  - origem × caminhão;
  - caderno equipe/cliente com o briefing novo, sem dinheiro.
- **`convex/assemblyItems.briefing.test.ts`:**
  - grava e limpa os campos novos;
  - recusa valores fora do vocabulário;
  - item antigo intacto;
  - fornecedor anotado grava;
  - a concorrente não altera nem cria.
- **`src/lib/extrato/extrato.test.ts`:**
  - parcial, meses diferentes, anulado e corrigido, repetidos;
  - sem dupla contagem e pago sem data;
  - fronteiras de data, bissexto e virada de ano;
  - filtros;
  - 1.200 lançamentos;
  - totais iguais no PDF e no Excel;
  - fórmula vira texto;
  - ZIP com CRC válido.
- **`convex/financeiro.extrato.test.ts`:**
  - 621 lançamentos em 3 páginas;
  - página grande recusada;
  - comprovante como presença;
  - isolamento entre empresas;
  - sem sessão, nada.

## 5. Evidências (documentos gerados pelo código desta branch, dados fictícios)
`C:\Users\user\Downloads\briefing-e-extrato-2026-10-14\`:
- `caderno-equipe.pdf` e `caderno-cliente.pdf`: cantinho das crianças, genuflexório com medidas, cadeiras reaproveitadas, itens da locadora, do espaço e da cliente fora do caminhão, conexão elétrica.
- `extrato-outubro.pdf` / `.xlsx` e `extrato-tres-meses-ago-out.pdf` / `.xlsx`: parcela recebida em agosto e outubro, recebimento anulado e corrigido, despesa com fornecedor, pendências, pago sem data, descrição com "=HYPERLINK".

## 6. NÃO TESTADO no navegador — e por quê
- **Salvar e editar no briefing; gerar os cadernos e o extrato pela tela.** Exigem este backend (schema e funções novas). O DEV (`healthy-pika-907`) roda o backend da Produção floral e não pode recebê-lo.
  - Tentei um backend **local** do Convex (portas 3310/3311, sem tocar no backend local do ALTAR Buffet que já estava em 3210). O Windows recusou criar os links simbólicos de que o executor Node precisa (`EPERM … symlink`). Ligar o "Modo de desenvolvedor" do Windows é decisão sua.
  - Desfeito: `.env.local` restaurado para o DEV e estado local removido. Ficou registrado no projeto Convex o nome de um deployment local (`local-evadelbiancoassessoria-altar_app-1`), sem dados.
- **O que foi verificado no navegador (DEV, conta de teste, só leitura):**
  - blocos recolhíveis;
  - sugestões do Altar;
  - "Sim" abrindo o cantinho;
  - diálogo do extrato com as datas;
  - sem rolagem lateral a 390 px.
  - Nada foi salvo.

## 7. Limitações
- **Floral:** a Produção floral não está nesta base. Não há vínculo com as receitas florais nem módulo duplicado.
- **Mobiliário:** a conferência mostra a situação do item; não há fluxo separado de "confirmação com o fornecedor".
- **Reaproveitamento:** um só destino por item.
- **Fornecedor da despesa:** só vem de compra. Despesa lançada à mão não tem fornecedor estruturado.
- **Pendências:** usam o vencimento dentro do período. Atraso anterior ao período não entra, e o documento diz o critério.
- **Tamanho do extrato:** uma conta com dezenas de milhares de lançamentos lê tudo no navegador antes de gerar. É correto, mas pode demorar.
- **Na sessão:** `npx tsx` baixou o pacote `tsx` do npm para uma contagem. Não é dependência do projeto.

## 8. Para publicar (não feito)
1. Revisão separada dos candidatos de Pagamentos e da floral.
2. Decidir como integrar as branches. As três mexem em `schema.ts`, sempre de forma aditiva.
3. Backend em PROD **antes** do frontend (`docs/release-producao.md`): o schema novo é aditivo, sem backfill.
4. Validar no navegador num ambiente com este backend (DEV integrado, ou local com o Modo de desenvolvedor do Windows).

## 9. Roteiro curto de homologação
1. Briefing → Cerimônia → Altar → tocar "+ Genuflexório", preencher modelo, medidas e "Modelo aprovado"; recarregar e conferir.
2. Cantinho das crianças → "Sim" → local e responsável → "+ Tapete" e "+ Almofadas".
3. Festa → Mesas → "+ Arranjo de mesa — modelo A" e "modelo B" com quantidades; Assentos → Cadeiras, "também usada em Salão às 20h".
4. Mobiliário → conferir que as cadeiras aparecem uma vez, com a transferência.
5. Iluminação → "+ Cordões de luz", origem "Fornecedor externo da cliente"; Quem conecta → "Empresa de som e luz".
6. Personalização → "+ Monograma" (nasce Em avaliação).
7. Caderno Para a equipe e Para os noivos: cantinho, transferência, "Chega no local", monograma nos avisos, sem R$ na equipe.
8. Carregamento: os cordões de luz não aparecem no caminhão.
9. Financeiro → Exportar extrato: um mês e três meses (conferir as datas), PDF e Excel. Comparar os totais com a Receita do mês e as pendências.
10. Repetir 1, 7 e 9 no celular.
