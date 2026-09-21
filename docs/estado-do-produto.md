# ALTAR — mapa do produto

Este arquivo responde à pergunta que vem antes de decidir o que construir:
**o que existe, com que qualidade, e o que isso custa ou rende.**

Ele é diferente dos vizinhos de propósito:

| Arquivo | Pergunta que responde |
|---|---|
| `README.md` | como o código funciona |
| `ROADMAP.md` | o que existe |
| `docs/prontidao-comercial.md` | posso mostrar numa reunião? |
| `docs/proposta-comercial.md` | o que a proposta faz, e o que ela deliberadamente não faz |
| **este** | **o que construir a seguir, e por quê** |

Datado de 21/09/2026, conferido contra o código em `c0fdf39`. Cada item cita a
evidência. Onde não há evidência, não há item — nada aqui é suposição.

> **O que saiu deste mapa na rodada "polimento para beta" (21/09)**, porque
> foi corrigido: o **slug do tipo de evento vazando para o PDF da cliente**
> (cinco cópias do mesmo mapa de rótulos, e a função canônica sem nenhum uso
> em produção), a **lixeira de Compras** apagando compra e lançamento sem
> perguntar, o **custo do material** sendo apagado por quem digitasse
> "1.500,00", o aviso de "não salvo" da proposta **cego para texto**, e três
> telas dizendo "você não tem nada" a quem tem. Saíram da §3 duas queries
> públicas sem chamador — removidas, não implementadas.

> **O que saiu deste mapa na rodada "camada comercial" (21/09)**, porque foi
> construído: as TRÊS primeiras entregas da §8 — a proposta comercial (§7.0), a
> tela de catálogo (§7.3) e a página do fornecedor (§3). A §7 perdeu duas
> decisões pendentes, e o que entrou no lugar é uma pergunta diferente da que
> foi resolvida: **assinatura com valor jurídico**. Hoje "aceita" é um registro
> da decoradora, não um aceite da cliente.

> **O que saiu deste mapa na rodada "beta real" (21/09)**, porque foi
> construído: desvincular compra da ficha e desfazer o lançamento no
> financeiro (§3), e a reserva manual do acervo — `acervo.reservar` existia,
> testada, sem tela, enquanto a própria interface mandava "reserve
> manualmente". Entrou no lugar o que a auditoria encontrou de mais grave: o
> **PDF do Orçamento levava a margem da decoradora para a cliente** (§5).

> **O que saiu deste mapa na rodada "primeiros clientes reais" (20/09)**,
> porque foi construído: a manutenção da biblioteca de composições e o "onde
> esta receita foi usada" (§3 e §8.1), os dois defeitos do aviso de primeiros
> passos (§4) e a ressalva da biblioteca (§2). Entrou no lugar uma dívida nova
> e honesta — §6, contagem do painel da Central e custo das varreduras.

> **O que saiu deste mapa na madrugada de 20/09**, porque foi construído:
> o paywall que fechava o aplicativo inteiro (§4), o seletor de audiência do
> caderno de montagem (§3), o déficit de acervo na lista geral (§3) e a edição
> de material (§2). As entradas correspondentes foram removidas em vez de
> marcadas como feitas — um mapa do que construir não guarda o que já existe.

> **Três correções feitas ao escrever este mapa.** O `ROADMAP.md` afirmava que
> a Pasta do Evento só aceitava o contrato principal (ela aceita os cinco
> tipos), que `assemblyItems.visibility` era gravado e nunca lido (é lido pelo
> PDF do caderno de montagem), e listava a reserva de acervo como backend sem
> tela. As três estavam velhas. Um mapa que erra para menos faz construir o que
> já existe.

---

## 1. PRONTO PARA VENDER

Funciona, tem teste, e aguenta uma demonstração ao vivo sem preparo.

### Funil comercial com sete estágios
- **Evidência**: `convex/funil.ts`, `convex/schema.ts:58-67` (`leadStage`), `src/pages/app/funil/`
- **Usuário**: acompanha a negociação do primeiro contato ao fechamento sem planilha
- **Comercial**: é o gancho de abertura — todo mundo entende um kanban
- **Risco**: baixo
- **Dependências**: nenhuma

### Documentos do lead que sobrevivem à conversão
- **Evidência**: `convex/leadDocuments.ts`, tabela própria com dono `leads`; `listForEvent` liga os dois lados
- **Usuário**: a proposta em PDF deixa de viver no celular
- **Comercial**: responde "e o que eu já mandei pra ela?", pergunta que sempre aparece
- **Risco**: baixo
- **Dependências**: nenhuma

### Evento, briefing de 61 campos e checklist
- **Evidência**: `convex/events.ts`, `briefing.ts`, `src/lib/briefing-areas.ts` (61 campos em 8 áreas, contados por `src/lib/promessas-da-landing.test.ts`)
- **Usuário**: o combinado com a cliente deixa de morar em áudios de WhatsApp
- **Comercial**: a profundidade dos campos (boutonnière, regra do espaço) é o que separa de um CRM genérico
- **Risco**: baixo
- **Dependências**: nenhuma

### Ficha Técnica — receita, consolidado e margem de segurança
- **Evidência**: `convex/lib/fichaTecnica.ts` (fonte única da multiplicação), `convex/fichaTecnica.ts`, `src/pages/app/events/[id]/ficha-tecnica/`
- **Usuário**: substitui a conta de papel que ela refaz a cada mudança de projeto
- **Comercial**: **é o coração da venda.** Nenhum concorrente que a decoradora já viu faz este trecho
- **Risco**: baixo — 100+ testes, incluindo `fichaTecnica.hostil.test.ts`
- **Dependências**: catálogo de materiais (ver §3)

### Acervo com reserva, conflito e déficit
- **Evidência**: `convex/acervo.ts`, `convex/lib/acervo.ts`, `src/pages/app/events/[id]/acervo/page.tsx`
- **Usuário**: descobre em setembro o que faltaria às 7h da montagem
- **Comercial**: o segundo melhor momento da demonstração, logo depois da ficha
- **Risco**: baixo
- **Dependências**: nenhuma

### Pasta do Evento — cinco tipos de documento
- **Evidência**: `src/pages/app/events/[id]/_components/event-documents.tsx:48,187-193`; `convex/schema.ts:514` aceita `contract`, `addendum`, `budget`, `reference`, `other`, e a tela oferece os cinco
- **Usuário**: contrato, aditivo, orçamento e referência no mesmo lugar
- **Comercial**: pouco citado porque a documentação o dava como incompleto
- **Risco**: baixo
- **Dependências**: nenhuma

### Compras, livro-caixa e orçado × real
- **Evidência**: `convex/purchases.ts`, `financeiro.ts`, `lib/custoDoEvento.ts`, `lib/financeScope.ts`
- **Usuário**: sabe a margem do evento antes de ele acabar
- **Comercial**: fecha a história; é onde a decisão de compra do SaaS acontece
- **Risco**: baixo
- **Dependências**: nenhuma

### Caderno de montagem em três audiências
- **Evidência**: `src/lib/audiencia-do-caderno.ts`, `briefing/page.tsx`; a regra é `itemVisibleTo` + `resolveAreasForAudience`
- **Usuário**: um caderno para a equipe, um para a cliente e um interno, do mesmo evento
- **Comercial**: frase de venda pronta, e prova que `visibility` não é enfeite
- **Risco**: baixo — a regra é aninhada e testada; visibilidade desconhecida é tratada como interna
- **Dependências**: nenhuma

### Proposta comercial para a cliente
- **Evidência**: `convex/lib/propostaComercial.ts`, `convex/propostas.ts`, `/propostas`, `src/lib/generate-proposta-pdf.ts`, `docs/proposta-comercial.md`
- **Usuário**: o documento que fecha a venda — escopo, investimento, condições e validade, nascido do lead ou do evento sem redigitar nada
- **Comercial**: era a ausência mais visível para quem vende. O único PDF de dinheiro era interno
- **Risco**: baixo, e a parte sensível tem trava de desenho: `paraOCliente` constrói o documento campo a campo, então custo, margem e fornecedor não estão escondidos — estão ausentes do objeto que sai
- **Ressalva honesta**: não envia, não assina e não cobra. "Enviada" e "aceita" são registros de decisões humanas tomadas fora do sistema, e a tela diz isso
- **Dependências**: nenhuma

### Seis PDFs com a identidade da empresa
- **Evidência**: `src/lib/generate-{event,orcamento,ficha-tecnica,assembly,loading,proposta}-pdf.ts` — seis, desde a rodada comercial
- **Usuário**: leva papel para o galpão, onde não há sinal
- **Comercial**: encerra a demonstração no mundo físico
- **Risco**: baixo
- **Dependências**: logo da empresa no perfil

---

## 2. PRONTO COM RESSALVA

Funciona. Tem um limite que aparece se a pessoa insistir — e quem demonstra
precisa saber qual é.

### Importação de contrato por IA
- **Evidência**: `convex/ai.ts:44` (`extractContractData`), `contract-import-dialog.tsx:259` ("Nada é aplicado sem sua confirmação")
- **Ressalva**: ela **lê e propõe**; aplicar é ação da pessoa. E depende de `ALTAR_AI_API_KEY` no ambiente — sem ela, a tela avisa indisponibilidade
- **Comercial**: impressiona; confira o ambiente antes da reunião
- **Risco**: médio — custo por chamada, e o paywall já cobre (`accessGuard`)
- **Dependências**: chave de IA

### Planta Premium (croqui → planta 2D)
- **Evidência**: `convex/aiVisual.ts:167`, `src/pages/app/events/[id]/planta/page.tsx`
- **Ressalva**: depende do provedor de imagem; sem ele só o upload e a interpretação funcionam
- **Risco**: médio — custo por geração
- **Dependências**: provedor de imagem

### Biblioteca de composições
- **Evidência**: `fichaTecnica.salvarNaBiblioteca`, `compositions.list`, `ondeEUsada`, `update`, `setArchived` — todos com caminho na tela (`receita-dialog.tsx`, `composicao-dialog.tsx`)
- **O que mudou**: o ciclo fechou. Guardar leva o que está NA TELA (antes copiava a versão gravada, com um "salvo!" por cima), o nome repetido é recusado em vez de virar gêmea, e renomear/arquivar/ver onde foi usada têm tela
- **O que mudou na rodada comercial**: a ressalva caiu. `/catalogo` é a tela própria, com as duas abas, busca (que encontra a composição pelo NOME DO MATERIAL, não só pelo dela), filtro por categoria, arquivados sob demanda e "onde é usada" antes de arquivar. O diálogo é o MESMO da Ficha Técnica — um lugar novo, não uma cópia nova
- **Risco**: baixo (era médio: a duplicata que piorava com o tempo de uso deixou de nascer)
- **Dependências**: nenhuma. A decisão §7.3 foi resolvida pela via "os dois": a manutenção existe nos dois lugares, com um diálogo só

### Catálogo de materiais
- **Evidência**: `materials.create`, `update` e `setArchived` usados em `receita-dialog.tsx` e `material-dialog.tsx`
- **O que mudou na rodada comercial**: `/catalogo` existe no menu, e `materials.ondeEUsado` responde "se eu arquivar a Rosa Avalanche, o que eu quebro?" antes de arquivar — com teto na varredura E na resposta, e `temMais` cobrindo os dois
- **Risco**: baixo (era médio: o erro de digitação agora tem conserto)
- **Dependências**: nenhuma

### Central de Comunicações
- **Evidência**: `convex/communications*.ts`, `src/pages/app/central/`, `docs/central-comunicacoes.md`
- **Ressalva**: é a operação do SaaS, **não** produto da decoradora; e o envio externo está desligado por construção
- **Risco**: baixo enquanto o portão estiver fechado
- **Dependências**: número comercial integrado, para a próxima fase

---

## 3. BACKEND PRONTO / UI FALTANDO

O caro já está feito e testado. Falta a tela — que é o trabalho barato com o
maior retorno por hora do repositório inteiro.

### Duplicar composição
- **Evidência**: `compositions.duplicate` — zero referências em `src/`. Renomear, arquivar e ver onde foi usada já têm tela (`composicao-dialog.tsx`)
- **Usuário**: "Arranjo mesa convidados" → "… mesa família" exige refazer a receita a partir de um item
- **Risco**: baixo — é conveniência, não dado preso
- **Dependências**: nenhuma

### Soltar a procedência de uma receita
- **Evidência**: `fichaTecnica.limparReceita` — zero referências em `src/`. Apagar TODAS as linhas da receita e salvar já esvazia o item; o que esta mutation faz a mais é soltar o `compositionId`
- **Usuário**: um item que teve a receita apagada continua dizendo que veio de uma composição da biblioteca
- **Risco**: baixo — é rastro, não número
- **Dependências**: nenhuma

---

## 4. UI EXISTE / FLUXO INCOMPLETO

A tela está lá. O caminho até o resultado tem um buraco.

### O aviso de primeiros passos ainda precisa de um clique para sair
- **Evidência**: `src/lib/primeiros-passos.ts` + `onboarding-banner.tsx` — com o essencial pronto o cartão diz "Configuração concluída" e oferece **Dispensar**, mas não se fecha sozinho
- **O que mudou**: o passo opcional deixou de reprovar (era "2 de 3", 67% para sempre), o cartão parou de afirmar "0 de 3" enquanto as consultas carregavam, e cada passo pendente leva ao lugar onde ele acontece em vez de reabrir o modal de boas-vindas no passo um com os campos em branco
- **Usuário**: um clique a mais, uma vez
- **Risco**: baixo
- **Dependências**: decidir se conclui sozinho — é escrita sem ação do usuário, e por isso não foi feito

---

## 4B. PRONTO PARA 5 CLIENTES

A pergunta desta seção é a mais concreta que existe: **amanhã cinco
decoradoras recebem login. O que elas conseguem fazer sem o Matheus ao lado?**

### PRONTO

Funciona, está testado, e uma decoradora usa sozinha.

| | Por que está pronto |
|---|---|
| Funil, evento, briefing, checklist | Cadastro, sete estágios, conversão que preserva dado, 61 campos com audiência |
| Projeto de decoração e Caderno de Montagem | Itens por ambiente, três audiências, PDF que vai para o galpão sem sinal |
| Ficha Técnica e catálogo | Receita, consolidado, margem de segurança, geração idempotente de compras, e agora o vínculo com a compra tem volta |
| Acervo | Reserva pela ficha **e à mão**, conflito entre eventos, déficit, saída, retorno, ajuste com histórico |
| Compras | Categoria, fornecedor, responsável, prazo, panorama, elo com o caixa — e agora o elo se desfaz |
| Financeiro | Livro-caixa, orçado × real, leitura de dinheiro em formato brasileiro, travas contra `NaN` e negativo |
| Fornecedores | Catálogo por empresa, dossiê por evento, alinhamentos datados |
| Equipe e dia do evento | Escala com horário e **telefone tocável**, agenda do dia |
| Painel da manhã | Eventos com pendência, oportunidades paradas e **dinheiro vencido**, cada linha com destino |
| Documentos | Cinco PDFs, cada um sabendo para quem é |
| Assinatura e paywall | Trial, bloqueio no servidor, e o caminho de volta nunca bloqueado |

### PRONTO COM RESSALVA

Funciona; tem um limite que aparece se ela insistir. **Diga a ressalva antes
que ela descubra.**

| | A ressalva |
|---|---|
| ~~Catálogo de materiais e biblioteca de receitas~~ | **Resolvido na rodada comercial**: `/catalogo` no menu, e o mesmo diálogo continua abrindo de dentro da Ficha Técnica |
| Importação de contrato por IA | Lê e propõe; quem aplica é ela. Depende de chave no ambiente |
| Planta Premium | Depende do provedor de imagem |
| Orçamento em PDF | É documento **interno**: traz custo, lucro e margem. A proposta para a cliente não existe (ver decisão abaixo) |
| Demonstração | A semente é ancorada em 10/10/2026 e envelhece depois dessa data |

### NÃO MOSTRAR AINDA

| | Por quê |
|---|---|
| Painel Admin e Central | Operação do SaaS, não produto dela |
| Envio externo da Central | Portão fechado por construção — aprovar registra e não envia |
| Segunda pessoa na conta | Não existe. A resposta honesta é "ainda não" |
| Assinatura da proposta | A proposta existe e sai em PDF; o aceite é um registro da decoradora, não assinatura da cliente |

### DECISÃO NECESSÁRIA

Cada uma trava um trabalho que **não deve ser feito sem resposta**.

1. **A proposta tem valor jurídico?** Hoje não, e a tela diz isso: "aceita" é
   a decoradora registrando o que ouviu, não um aceite assinado pela cliente.
   Ligar assinatura muda contrato, responsabilidade e provavelmente fornecedor
   externo. *(A proposta em si deixou de ser decisão — foi construída.)*
2. **Segunda pessoa na conta.** Medida em `docs/arquitetura-multiusuario.md`.
   Quem paga, quem convida, quem pode o quê.
3. **O aviso de primeiros passos se fecha sozinho?** É escrita sem ação de
   ninguém.
4. **Quando ligar o envio externo da Central.** Exige número comercial
   integrado e critério medido de acerto da IA.

### RISCO DE ESCALA FUTURO

Nada disto dói com cinco clientes. Todos doem com cinquenta — e o gatilho de
cada um está em §6.

| | Quando dói |
|---|---|
| `admin.getStats` varre `users` + `events` | Cresce com o número de CLIENTES do ALTAR. É o primeiro a doer, e é a tela que Matheus abre todo dia |
| `financeiro.listTransactions` sem paginação | Conta com dois ou três anos de lançamentos |
| `collect()` por conta em dashboard, health e agenda | Decoradora com muitos eventos abertos ao mesmo tempo |
| Pacote de 827 kB | Primeira abertura no 4G, que é como ela abre no galpão |
| IA sem teto por conta | Custo por chamada, sem limite nem contador |

---

## 5. NÃO MOSTRAR EM DEMO

| Tela | Por quê | Evidência |
|---|---|---|
| `Painel Admin` | contas de outros clientes, métricas, avisos de cobrança | `src/pages/app/admin/` |
| `Central` | operação do SaaS; cria expectativa errada | `src/lib/navigation.ts:74` já a marca como fora do menu |
| Botões que escrevem | `Gerar compras`, `Reservar do acervo`, `Liberar reserva` alteram os números recém-citados | `docs/demo-comercial.md §7` |
| IA sem conferir o ambiente | sem provedor, a tela avisa indisponibilidade — a única coisa da reunião que parece defeito | `convex/lib/aiConfig.ts:45` |

---

## 6. DÍVIDA TÉCNICA

### Pacote principal em 825 kB
- **Evidência**: `pnpm build` → `index-*.js 824.81 kB` (gzip 245 kB), acima do aviso de 500 kB do Vite
- **Usuário**: primeira abertura lenta no 4G, que é como a decoradora abre no galpão
- **Risco**: médio, e cresce a cada tela nova
- **Dependências**: as rotas já são lazy (`src/lib/rotas-lazy.test.ts`); o peso está no núcleo compartilhado

### Oito avisos de `react-refresh/only-export-components`
- **Evidência**: `pnpm lint` → 0 erros, 8 avisos, todos em `src/components/ui/*` (shadcn)
- **Impacto**: só recarga a quente em desenvolvimento
- **Risco**: baixo — é ruído herdado do gerador, não defeito

### Campos preparados e ainda inertes
- **Evidência**: `communicationMessages.transcricao` (`schema.ts:1360`) e `adminAutonomyPolicy` (`schema.ts:1538`), nenhum lido em código de produção
- **Risco**: baixo — nascem opcionais e sem backfill, que é a convenção do repositório. Viram dívida só se forem esquecidos
- **Dependências**: `adminAutonomyPolicy` é deliberadamente inerte — ligá-lo é mudança de fase, não de dado

### O que cresce com o uso, e onde ele para

Medido por leitura de código em `e05863b`, não por carga real — e é a ordem
certa: refatorar sem número é trocar um risco conhecido por um desconhecido.
**Nada disto foi mexido nesta rodada**, de propósito.

O ALTAR faz **123 `collect()`** no backend. A esmagadora maioria é inofensiva:
vem de um `withIndex("by_event", …)` ou `by_user`, e o teto é o tamanho de UM
evento ou de UMA conta. O que merece atenção é o punhado que varre sem teto
natural:

| Onde | O que varre | Cresce com | Quando dói |
|---|---|---|---|
| `admin.getStats` (`admin.ts:72`) | `users` inteiro + `events` inteiro | **clientes do ALTAR** | primeiro a doer: é a tela que Matheus abre todo dia, e cresce com o sucesso do negócio |
| `admin.listUsers` (`admin.ts:172`) | `users` inteiro | clientes do ALTAR | junto com o anterior |
| `asaasWebhookLog` (`asaasWebhookLog.ts:128`) | `users` inteiro | clientes do ALTAR | por webhook recebido — é o mais caro por não ser tela |
| `financeiro.getSummary` | `transactions` da conta | **tempo de uso** da decoradora | uma conta com três anos de lançamentos |
| `financeiro.listTransactions` | idem, sem paginação | tempo de uso | a mesma tela, sem "carregar mais" |
| `dashboard`, `health`, `agenda` | vários `collect()` por conta | eventos da decoradora | conta com muitos eventos abertos |

E o que **já** tem teto declarado: `communications` (`take(2_000)` sobre
`users`, nomeado), o painel da Central (mil conversas e duzentos contatos, e
desde esta rodada ele **diz** quando parou no teto) e `admin.ts:518`
(`take(5_000)`).

**Por que não foi corrigido agora**: mudar o número de uma tela de dinheiro ou
de um painel de gestão sem poder conferir o resultado contra um banco real é
trocar um problema que se conhece por um que não se conhece. O ambiente desta
rodada não alcança o Convex.

**O que fazer quando doer**, em ordem de retorno:

1. `admin.getStats` — contar por agregação incremental em vez de varrer, ou
   aceitar um teto declarado e dizer na tela, como o painel da Central passou a
   fazer.
2. `financeiro.listTransactions` — paginar com `usePaginatedQuery`, que o
   repositório já usa em outras listas.
3. O `collect()` de `users` no webhook — é o único que não tem tela, e por isso
   o único que ninguém vai reportar.

### Custo por chamada (IA)

Os dois recursos que gastam dinheiro por uso — importação de contrato e Planta
Premium — já estão atrás do paywall (`lib/accessGuard.ts`) e dependem de chave
de ambiente. Não há limite por conta nem contador de consumo: uma decoradora
pode chamar a IA quantas vezes quiser dentro da assinatura. É aceitável no
volume de hoje e é a primeira coisa a instrumentar se o custo aparecer.

### Homologação e demo dependem de operação manual
- **Evidência**: `scripts/homologacao/central.mjs` e `internal.demo.seed` só rodam por quem opera o deployment
- **Risco**: baixo, e é intencional: seed alcançável pelo aplicativo seria pior

---

## 7. DECISÕES DE PRODUTO PENDENTES

Não são de código. São de negócio, e cada uma muda a resposta a uma pergunta
que aparece em reunião.

0. ~~**Proposta comercial para a cliente.**~~ **RESOLVIDA na rodada
   "camada comercial"**, e é útil dizer COMO, porque a decisão de produto que
   parecia bloquear era outra: validade, condição de pagamento e escopo não
   foram decididos pelo ALTAR — foram deixados nas mãos da decoradora. Validade
   é uma data que ela escolhe (e "vencida" é derivado dela, nunca gravado);
   condição de pagamento é TEXTO LIVRE, não um formulário de parcelas; escopo é
   o que ela escrever. Ver `docs/proposta-comercial.md`.

   **O que continua pendente, e é outra pergunta**: assinatura com valor
   jurídico. Hoje "aceita" é um registro da decoradora, não um aceite da
   cliente, e a tela diz isso em português. Ligar assinatura muda contrato,
   responsabilidade e provavelmente fornecedor externo.
1. **O que acontece quando a assinatura vence.** Fechar o aplicativo inteiro ou
   manter leitura e exportação do que já foi pago? O servidor e a tela discordam
   hoje. *(Ver §4.)*
2. **Segunda pessoa na mesma empresa.** É a pergunta nº 1 das reuniões. Usuário
   adicional dentro da conta ou volta do modelo multiempresa? São projetos de
   tamanhos muito diferentes. **`docs/arquitetura-multiusuario.md`** mede os
   dois: o que o schema já suporta, o que custaria e onde estão os riscos de
   vazamento. É análise, não proposta.
3. ~~**Onde mora a manutenção de materiais e composições.**~~ **RESOLVIDA
   pela via "os dois"**: `/catalogo` no menu para revisar a lista inteira antes
   da temporada, e o mesmo diálogo continua abrindo de dentro da receita, de
   onde o material é escolhido. O que não foi duplicado é o CÓDIGO — o diálogo
   mudou de lugar (`src/components/catalogo/`) e passou a ser importado pelos
   dois, porque duas cópias divergem na terceira correção.
4. **Se a vertical Buffet ganha deployment próprio.** A coluna `vertical` já
   existe em toda entidade da Central para o dia em que ganhar.
5. **Quando ligar o envio externo da Central.** Exige número comercial
   integrado e critério medido de acerto da IA (`communicationTriage.divergiu`).
6. **Login para a equipe de montagem.** Hoje a equipe é cadastrada e recebe
   papel. Dar acesso muda o modelo de cobrança.
7. **Exportação completa dos dados.** Os PDFs saem; a base, não. É pergunta de
   cliente grande e de LGPD.

---

## 8. PRÓXIMAS ENTREGAS DE MAIOR IMPACTO

Ordenadas por **retorno sobre esforço**. Saíram desta lista, porque foram
feitas: paywall, audiência do caderno, déficit na lista de acervo e edição de
material (madrugada de 20/09); manutenção da biblioteca de composições
(rodada "primeiros clientes reais"); desfazer vínculos da Ficha Técnica e das
Compras (rodada "beta real"); **as três primeiras desta lista — proposta
comercial, tela de catálogo e página do fornecedor — na rodada "camada
comercial"**.

### 1. Segunda pessoa na conta
- **Por quê**: é a objeção mais frequente em reunião, e a resposta é "não"
- **Esforço**: **grande** — toca identidade, autorização e cobrança
- **Risco**: alto. `users` é a fronteira de dados de todo o modelo
- **Depende de**: decisão §7.2. **Não comece sem ela.**

### 2. Vocabulário do ALTAR Buffet
- **Por quê**: `docs/altar-buffet-readiness.md` mostra que a fundação já serve;
  o que falta primeiro é a vertical reconhecer-se na tela
- **Esforço**: pequeno para o vocabulário; o diferencial (cadeia de produção)
  é outra conversa
- **Risco**: baixo no vocabulário; **médio-alto** no escopo financeiro, que
  inverte para buffet
- **Depende de**: as três decisões da §6 daquele documento

---

## 9. O que este mapa não cobriu

Honestidade sobre o próprio alcance:

- **Não houve homologação no DEV nesta rodada.** O ambiente onde este mapa foi
  escrito não alcança o Convex (403 na política de rede), então tudo aqui vem
  de **leitura de código** e da homologação anterior, feita contra um backend
  Convex real. Nenhuma afirmação depende de tela vista agora.
- **Desempenho sob volume não foi medido.** As varreduras globais paginam
  (`convex/notifications.ts`), mas nenhuma conta grande foi testada. O que dá
  para dizer por leitura de código está em §6 ("O que cresce com o uso"), com o
  motivo de não ter sido corrigido.
- **Acessibilidade foi vista só por alvo de toque.** Leitor de tela, contraste e
  navegação por teclado não foram auditados.
