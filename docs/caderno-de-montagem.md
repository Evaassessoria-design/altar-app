# Caderno de Montagem — Cliente e Equipe (13/10/2026)

Branch `feature/caderno-cliente-equipe`, a partir de `5810dbd` (o frontend em
PROD), com os dois testes de relógio fixo e a correção do CI trazidos por
cherry-pick. **Não contém o candidato de pagamentos (`94df752`)** nem a
Produção floral.

## O que mudou

| Antes | Agora |
|---|---|
| Três opções: Equipe, Cliente, Uso interno | **Duas**: "Para a equipe" e "Para os noivos" (casamento) / "Para o cliente" (outros eventos) |
| Gerava direto, sem prévia | O menu abre uma **prévia** com o mesmo conteúdo do PDF, avisos de completude e links para completar na origem |
| Itens do contrato num parágrafo ("mobiliário: Cadeiras (x220); …") | Lidos em lista, agrupados por categoria, com quantidade; marcados "do briefing" |
| Notas do briefing impressas inteiras, inclusive "no valor de 2800", **também para a equipe** | Texto livre passa por `caderno/sem-valores.ts`: sai a frase que fala de dinheiro, o resto fica |
| Não existia "opcional" no sistema | Item com escopo **Opcional** e valor opcional (só no item) |
| Folha visual simples | Cabeçalho com a marca da empresa, resumo em cartões, conceito, ambientes, itens em cartões, layout, referências, fichas por ambiente, decisões, opcionais (cliente) / atenção, local, escala, tabela Carga-Montado-Retorno, peças do acervo, checklist, ocorrências e assinatura (equipe) |

"Interno" continua existindo como **visibilidade** de item, campo e foto (é o
que mantém algo fora dos dois cadernos). Nenhum dado gravado mudou.

## Arquitetura

```
consultas existentes ──► fontes-do-caderno.ts ──► montar-caderno.ts ──┬─► prévia (caderno-de-montagem-dialog.tsx)
(todas com getOwnedEvent)                         (separação por versão) └─► PDF (generate-assembly-pdf.ts)
```

- **Uma montagem só** (`montarCaderno`): prévia e PDF desenham o mesmo objeto.
- O gerador **não decide nada**: só desenha e pagina.
- **Fontes, nenhuma nova:**
  - `events.get`, `briefing.getBriefing`, `assemblyItems.listByEvent`;
  - `gallery.listPhotos`, `layoutRenders.listByEvent` (planta pronta; senão o croqui em imagem);
  - `acervo.doEvento`, `team.listEventTeam`;
  - `briefing.getChecklist` (fase "pre"), `health.getEventHealth`.
- Regras reaproveitadas, sem cópia:
  - `ehObrigacaoDeMontagem`, `agruparPorAmbiente`, `fotoDoItem` / `fotosPresasAItens`;
  - `montarProjetoVisual` + `montarApresentacao` (regras dos noivos do Projeto Visual);
  - `itemVisibleTo`, `campoDoItemVisivelPara`, `conceitoDoEvento`.
- Fotos por **referência**: o PDF baixa cada URL uma vez (`carregarImagensDoCaderno`), sem copiar arquivo.

### O que cada versão leva

| | Cliente | Equipe |
|---|---|---|
| Itens | os visíveis ao cliente, contratados ou sem classificação | todos os de montagem visíveis à equipe |
| Fornecedor / observação do item | nunca | sim (observação sem dinheiro) |
| Não incluso | **não** (regra já existente do Projeto Visual: não reabre negociação) | "Não levar" |
| Opcionais | nome; **valor só com "Incluir os valores dos opcionais"** | "Não levar nem montar sem confirmação", sem valor |
| Pendências do contrato | "Decisões que faltam" | "Confirmar antes de montar" |
| Fotos | regra dos noivos (`fotoVaiParaOsNoivos`) | fase "Antes", não internas, não fora do escopo |
| Peças do acervo, escala, local, checklist, ocorrências | não | sim |
| Carga/Montado/Retorno | — | caixas **em branco**; nada é lido nem gravado de situação |

### Dinheiro

- O único campo que pode levar valor é `opcionais[].valor`: só na versão cliente e só com `incluirValores`.
- Custo e margem não estão em nenhuma fonte lida. `budgetItems`, `transactions` e propostas não entram.
- Texto livre é filtrado nas duas versões, inclusive:
  - a atmosfera e o estilo;
  - as pendências;
  - as legendas de fotos;
  - as observações dos itens;
  - as informações do local;
  - as linhas do checklist;
  - o modelo e o nome do item (o nome perde só o trecho de valor).

### Sem contagem dupla

- Item cadastrado e linha do texto do contrato com o mesmo nome: vale o cadastrado, uma vez.
- Nome repetido no próprio texto: contado uma vez, com aviso na prévia.
- Peças do acervo ficam em bloco próprio, como na Folha de Carregamento.
- Compras não entram (são insumo do que já está listado).
- Cada quantidade aparece em um lugar só do documento: a ficha por ambiente não repete números.

## Backend (aditivo) — exige deploy antes do frontend

| Arquivo | Mudança |
|---|---|
| `convex/schema.ts` | `assemblyItems.projectScope` aceita `"opcional"`; novo `assemblyItems.valorOpcional?: number` (ausente = sem valor; 0 = cortesia) |
| `convex/assemblyItems.ts` | `update` aceita os dois; `valorOpcional` validado por `exigirDinheiroGravavel` |
| `convex/lib/projectScope.ts` | `ITEM_SCOPES` (fotos continuam com `PROJECT_SCOPES`, sem "opcional") |
| `convex/lib/escopoDoProjeto.ts` | `ehObrigacaoDeMontagem` exclui o opcional; `ehOpcional` |

- Sem backfill.
- Efeito do opcional fora do caderno: sai da Folha de Carregamento, da Ficha Técnica, das compras geradas e da reserva pela ficha, e sai da apresentação dos noivos do Projeto Visual. Confirmar = trocar para "Incluso no projeto".

**Não foi publicado em ambiente nenhum.** O DEV (`healthy-pika-907`) roda o
backend da Produção floral; publicar esta branch lá apagaria as funções da
floral. Foi validado com `convex-test` (schema e funções reais, em memória). A
prévia foi validada no navegador contra o DEV, só leitura, porque ela não usa
nada novo do backend.

## Validação (13/10)

- `pnpm test`: **6.050/6.050** (268 arquivos).
- Os dois `tsc`: ok. Lint: 0 erros (8 avisos antigos).
- Build: ok, CSS `index-q-9zrh1Z.css`.
- **Testes novos** em `src/lib/caderno/caderno.test.ts`. Geram o caderno e o PDF de verdade e procuram no texto escrito na página:
  - duas ações;
  - nenhum valor na equipe, inclusive "no valor de 2800" em texto livre;
  - cliente sem custo nem margem, e valor só com o pedido explícito;
  - interno, referência e não incluso no lugar certo;
  - contagem única;
  - gerar não marca nada e não altera as fontes;
  - evento antigo só com texto;
  - mudança na origem refletida;
  - imagem ausente, nome longo e muitas páginas;
  - marca da empresa, sem nada do pacote de referência.
- **Testes novos** em `convex/assemblyItems.opcional.test.ts`:
  - concorrente recebe NOT_FOUND;
  - nenhuma das consultas do caderno devolve dado de outra conta;
  - NaN, negativo, infinito e valor absurdo são recusados de forma atômica;
  - a foto recusa "opcional".
- **Testes antigos** que liam o código do gerador foram reapontados para onde a regra mora agora. Mesmas garantias: foto contratada antes da referência, rótulo CONTRATADO / REFERÊNCIA VISUAL, agrupamento canônico, caixinha de conferência sem situação e marca da empresa.
- **PDFs renderizados e inspecionados:** cliente-noivos com valores, cliente corporativo sem valores, equipe, e evento antigo só com texto.
- **Prévia no navegador (DEV, conta de teste):**
  - menu com exatamente duas opções e selo "Para o cliente" num aniversário;
  - avisos com link para a Planta e a Galeria;
  - equipe com carga e acervo reais;
  - imagem do DEV baixada e desenhada no PDF dentro da página;
  - no celular (390 px), sem rolagem lateral.

## Limitações conhecidas

- **Fichas por ambiente sem campos próprios:** a ficha não tem descrição, medidas, posição no layout nem lista "o que colocar" com responsável. Isso exigiria tabelas novas (proposta do pacote) e ficou fora desta rodada. A ficha é a leitura dos itens e fotos de cada ambiente.
- **Sem override ("ocultar/complementar") nem pendência manual:** pendências vêm só da leitura do contrato.
- **Opcional só no Projeto Visual:** o escopo "Opcional" e o valor se definem lá; o cadastro do item no Briefing não mostra o campo.
- **Texto livre não vira opcional:** a prévia avisa quando as notas citam opcionais sem item marcado.
- **Filtro de dinheiro erra para o lado de omitir:** uma frase como "taxa de limpeza do salão" sai mesmo sem valor. A prévia conta os trechos omitidos.
- **Fonte do PDF:** é a padrão (Helvetica / Times), não Geist / Playfair. Embutir fonte aumentaria o arquivo.
- **Croqui em PDF** não é desenhado (só imagem).

## Para publicar (não feito)

1. Revisão desta branch, separada do candidato de pagamentos `94df752`.
2. Decidir a ordem com o candidato de pagamentos e com a floral (as três mexem em frentes diferentes; o schema desta é aditivo).
3. Backend em PROD (aditivo, sem backfill) **antes** do frontend, seguindo `docs/release-producao.md`.
4. Frontend e conferência do CSS publicado.
