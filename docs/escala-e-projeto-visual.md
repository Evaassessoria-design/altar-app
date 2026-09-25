# Escala e Projeto Visual — o que aguenta, o que falta

Auditoria de código e consulta, não benchmark: não há deployment alcançável
nesta sessão para medir tempo real. O que está aqui é contado das queries.

---

## 1. Se ela cadastrar mais 40 eventos amanhã

Uma decoradora real já tem cerca de **40 eventos** no ALTAR. A pergunta é o que
acontece com 80, e depois com 300.

| Pergunta | Resposta | Por quê |
|---|---|---|
| **Aguenta?** | sim, com folga a 80 | nenhuma consulta é quadrática; o custo cresce linear |
| **Encontra os eventos?** | **agora sim** | não havia busca; quarenta cartões eram para rolar. Foi corrigido nesta rodada |
| **Dashboard continua útil?** | sim | os laços por evento são **limitados** (`slice(0, 5)` e `slice(0, 10)`) de propósito |
| **Financeiro escala?** | sim, e **diz quando não viu tudo** | `LIMITE_DO_LIVRO = 500`, e a resposta avisa que há mais (`procedencia-e-escala.test.ts`) |
| **Compras escala?** | sim | panorama lê duas tabelas da conta e cruza em memória; linhas pequenas |
| **Busca escala?** | sim até a lista paginar | ver o alerta em **3** |
| **Navegação escala?** | sim | rotas por id, nada que percorra a lista |
| **IA consegue resumir?** | sim | teto de 4 fontes por tarefa e 8.000 caracteres de contexto |
| **Mobile continua utilizável?** | sim | a lista é de cartões, não tabela |

---

## 2. O custo que cresce e ninguém vê — `health.listCards`

**Esta é a decisão de arquitetura que fica para depois da live.**

`convex/health.ts` → `listCards` lê todos os eventos da conta e roda
`computeHealth` em **cada um**. Cada `computeHealth` faz **6 consultas
indexadas** (contratos, transações, fornecedores, equipe, briefing, montagem).

```
  40 eventos  →  241 consultas por abertura da tela
  80 eventos  →  481
 300 eventos  →  1.801
```

Nenhuma delas é lenta: são leituras por índice. O problema é o **número**, e
ele não tem teto. A mesma consulta alimenta a fonte `eventos.atencao` do
Assistente, então a IA paga a conta junto.

**Por que não foi corrigido nesta rodada:** as três saídas mexem em contrato.

1. **Pôr teto e avisar** — o padrão do repositório (`LIMITE_DO_LIVRO`). Muda o
   formato da resposta de array para `{ cartoes, temMais }`, e isso ricocheteia
   na tela de eventos e no executor do Assistente.
2. **Calcular saúde sob demanda**, por cartão visível. É o mais correto e o
   mais invasivo: a saúde deixa de vir com a lista.
3. **Gravar a saúde derivada** — contra a convenção do repositório ("estado
   derivável é derivado, não gravado") e cria o problema de invalidação.

A 80 eventos nada quebra. A 300, a tela de eventos começa a pesar. **É trabalho
de depois da live, não de véspera** — e mexer em contrato de consulta sem
deployment para conferir seria trocar um custo previsível por um risco de palco.

---

## 3. A busca filtra a lista completa — e isso depende de ela ser completa

A tela de eventos ganhou busca por cliente, local e data, filtrando o array que
`listCards` devolve.

Isso **não** viola a regra "filtro entra na consulta". A regra existe porque
filtrar **uma página** faz a contagem mentir sobre o que está atrás. Aqui a
consulta devolve o conjunto inteiro, sem teto — filtrar esse array é filtrar
tudo, e o cabeçalho diz "7 de 42" quando há busca escrita.

**O amarrado:** no dia em que `listCards` paginar (item 2 acima), a busca tem
que descer para o backend junto. Se paginar e a busca continuar no cliente, a
tela passa a mentir — ela vai dizer "nenhum evento com Marina" quando Marina
está na página 2. Quem mexer no item 2 mexe nos dois.

---

## 4. Projeto Visual — o que já temos

Não é um módulo a construir: **já existe e está inteiro**, montado sobre o que
já havia em vez de estrutura nova.

| Peça | Onde | Estado |
|---|---|---|
| Conceito e ambientes | `assemblyItems` agrupado por área | **pronto** |
| Junção foto ↔ ambiente | `src/lib/projeto-visual.ts` | **pronto** — pelo RÓTULO, com a mesma regra do Caderno e da Ficha Técnica |
| Capa escolhida | `events.coverPhotoId` | **pronto** — escolhida por ela, nunca deduzida |
| Galeria classificada | `gallery` com `ambiente`, `projectScope`, `category` | **pronto** |
| Foto presa ao item | `referencePhotoUrl`, `contractedPhotoUrl` | **pronto** |
| Documento para o cliente | `src/lib/generate-projeto-visual-pdf.ts` | **pronto** — custo, margem e fornecedor **não existem** no objeto que sai |
| Orientação EXIF | `src/lib/imagem-para-pdf.ts` | **pronto** — foto de iPhone em pé deixou de sair deitada |

A decisão que sustenta tudo: **não existe "tela do Projeto Visual" separada do
Projeto de Decoração.** Duas telas para o mesmo conceito divergem na primeira
semana — o repositório já pagou isso duas vezes (cinco mapas de tipo de evento,
três nomes para composição).

### O que está fragmentado

- **Fornecedor e flor moram em lugares diferentes do projeto.** O catálogo de
  fornecedores e o acervo alimentam compras e montagem, mas o documento que vai
  para o cliente fala de ambientes e itens — o nome da rosa não aparece.
- **Contrato é do evento, não do ambiente.** `contracts` está preso ao evento;
  não há como dizer "este contrato de locação é destes móveis".
- **A foto do item contratado existe, mas é uma só.** Móvel com três ângulos
  não cabe.

### O que falta para o "uau" — IDEIA V2

Registrado, **não implementado**. Cada item diz o que já existe para apoiá-lo:

| # | Ideia | Apoio que já existe | Falta |
|---|---|---|---|
| V2-1 | **Contrato de locação anexado ao projeto** | `contracts` por evento; upload e storage prontos | vínculo com o ambiente ou com os itens |
| V2-2 | **Fotos dos móveis contratados** (vários ângulos) | `contractedPhotoUrl`, galeria com `ambiente` | passar de uma foto para uma lista — é o mesmo formato de `comprovantes` |
| V2-3 | **Flores contratadas com nome + imagem** — rosa, lisianthus, boca-de-leão, eucalipto | `assemblyItems.receita` já guarda composição | um vocabulário de flor com imagem; decidir se é acervo ou catálogo |
| V2-4 | **Referências visuais automáticas** | galeria classificada por ambiente | sugestão a partir do briefing — é IA de escrita, exige aprovação |
| V2-5 | **Documento final visual para os noivos** | o PDF do Projeto Visual **já é a primeira versão** | croqui dentro do documento, ficha por ambiente com as flores nomeadas, página de encerramento com a identidade dela |
| V2-6 | **IA extraindo itens de contrato** | a leitura de contrato por IA já extrai parcelas | extrair ITENS e sugerir o projeto — escrever exige aprovação humana |

A regra que nenhuma delas pode quebrar: **o documento nasce do trabalho já
feito.** Nenhum cadastro novo, nenhum editor paralelo, nenhum moodboard
separado. `apresentacao-para-os-noivos.test.ts` já trava isso.
