# ALTAR — mapa do produto

Este arquivo responde à pergunta que vem antes de decidir o que construir:
**o que existe, com que qualidade, e o que isso custa ou rende.**

Ele é diferente dos vizinhos de propósito:

| Arquivo | Pergunta que responde |
|---|---|
| `README.md` | como o código funciona |
| `ROADMAP.md` | o que existe |
| `docs/prontidao-comercial.md` | posso mostrar numa reunião? |
| **este** | **o que construir a seguir, e por quê** |

Datado de 20/09/2026, conferido contra o código em `8c2faeb`. Cada item cita a
evidência. Onde não há evidência, não há item — nada aqui é suposição.

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

### Cinco PDFs com a identidade da empresa
- **Evidência**: `src/lib/generate-{event,orcamento,ficha-tecnica,assembly,loading}-pdf.ts`
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
- **Evidência**: `fichaTecnica.salvarNaBiblioteca` + `compositions.list`, ambos usados em `receita-dialog.tsx:53,57`
- **Ressalva**: salvar e aplicar funcionam; **renomear, editar e arquivar não têm tela**. Salvar de novo cria outra entrada
- **Usuário**: em seis meses de uso a biblioteca acumula duplicatas
- **Risco**: médio — cresce com o tempo de uso, então o cliente mais fiel sofre mais
- **Dependências**: nenhuma

### Catálogo de materiais
- **Evidência**: `materials.create` usado em `receita-dialog.tsx`; `materials.update` e `setArchived` sem nenhuma chamada na tela
- **Ressalva**: o material nasce dentro da receita e depois não tem onde ser corrigido
- **Risco**: médio — um erro de digitação em "Rosa branca" fica para sempre
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

### Caderno de montagem por audiência
- **Evidência**: `src/lib/generate-assembly-pdf.ts:166,180` lê `audience` e filtra por `itemVisibleTo(i.visibility, audience)`; mas `briefing/page.tsx:143` passa **`audience: "equipe"` fixo**
- **Usuário**: ela classifica um item como "cliente" esperando um documento para a cliente, e só a versão da equipe sai
- **Comercial**: "um caderno para a equipe, outro para a cliente" é frase de venda pronta
- **Risco**: **baixo** — é um seletor; a regra e o filtro já existem e já rodam
- **Dependências**: nenhuma

### Manutenção de materiais e composições
- **Evidência**: `materials.update`, `materials.setArchived`, `compositions.update`, `duplicate`, `setArchived` — zero referências em `src/`
- **Impacto**: resolve as duas ressalvas do §2 de uma vez
- **Risco**: baixo
- **Dependências**: decidir se ganha tela própria ou vive dentro da Ficha Técnica (ver §7)

### Disponibilidade de acervo fora do evento
- **Evidência**: `acervo.disponibilidade` sem uso em `src/`; a lista geral mostra só `Reservado em N eventos` (`acervo/page.tsx:244`)
- **Usuário**: quem abre `Acervo` para planejar a semana não vê o que vai faltar — o déficit só aparece dentro do evento
- **Comercial**: o melhor momento da demo está escondido atrás de dois cliques
- **Risco**: baixo
- **Dependências**: nenhuma

### Desfazer vínculos da Ficha Técnica
- **Evidência**: `fichaTecnica.limparReceita`, `fichaTecnica.desvincularCompra`, `purchases.unregisterCost` — sem caminho na tela
- **Usuário**: um vínculo errado não tem como ser desfeito pela interface
- **Risco**: médio — é dado preso
- **Dependências**: nenhuma

---

## 4. UI EXISTE / FLUXO INCOMPLETO

A tela está lá. O caminho até o resultado tem um buraco.

### Aviso de configuração inicial que não se fecha sozinho
- **Evidência**: `src/components/onboarding-banner.tsx:21` — só some com `user.onboardingCompleted` ou clique em `Dispensar`, mesmo com os três passos concluídos
- **Usuário**: um checklist 100% concluído permanece no topo da tela principal, treinando a pessoa a ignorar aquela região
- **Comercial**: rouba a primeira tela da demonstração (o roteiro manda dispensar antes)
- **Risco**: baixo
- **Dependências**: decidir se conclui sozinho — é escrita sem ação do usuário

### O passo "opcional" do onboarding não é opcional
- **Evidência**: `onboarding-banner.tsx:37` declara `optional: true` no passo da equipe, e a propriedade **nunca é lida**; `pct` e `allDone` contam os três igualmente
- **Usuário**: quem não tem equipe cadastrada vê 67% para sempre
- **Risco**: baixo
- **Dependências**: nenhuma

### Assinatura vencida fecha o aplicativo inteiro
- **Evidência**: `src/App.tsx:60-68` redireciona **todas** as rotas para `/paywall`, isentando só `/configuracoes`; `convex/lib/accessGuard.ts:22-26` diz explicitamente o contrário — "NÃO aplicada a leituras nem à edição do que a pessoa já tem… atrapalharia a exportação em PDF de um evento já pago"
- **Usuário**: perde o acesso aos próprios dados e ao PDF de um evento que já pagou
- **Comercial**: muda a resposta a "se eu parar de pagar, perco tudo?" — ver `docs/demo-comercial.md`
- **Risco**: **o mais alto deste documento** — é divergência entre o que o código declara querer e o que faz, e toca LGPD
- **Dependências**: decisão de produto (§7)

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

### Homologação e demo dependem de operação manual
- **Evidência**: `scripts/homologacao/central.mjs` e `internal.demo.seed` só rodam por quem opera o deployment
- **Risco**: baixo, e é intencional: seed alcançável pelo aplicativo seria pior

---

## 7. DECISÕES DE PRODUTO PENDENTES

Não são de código. São de negócio, e cada uma muda a resposta a uma pergunta
que aparece em reunião.

1. **O que acontece quando a assinatura vence.** Fechar o aplicativo inteiro ou
   manter leitura e exportação do que já foi pago? O servidor e a tela discordam
   hoje. *(Ver §4.)*
2. **Segunda pessoa na mesma empresa.** É a pergunta nº 1 das reuniões. Usuário
   adicional dentro da conta ou volta do modelo multiempresa? São projetos de
   tamanhos muito diferentes.
3. **Onde mora a manutenção de materiais e composições.** Tela própria no menu,
   ou dentro da Ficha Técnica? A primeira é mais descobrível; a segunda não
   acrescenta item de menu.
4. **Se a vertical Buffet ganha deployment próprio.** A coluna `vertical` já
   existe em toda entidade da Central para o dia em que ganhar.
5. **Quando ligar o envio externo da Central.** Exige número comercial
   integrado e critério medido de acerto da IA (`communicationTriage.divergiu`).
6. **Login para a equipe de montagem.** Hoje a equipe é cadastrada e recebe
   papel. Dar acesso muda o modelo de cobrança.
7. **Exportação completa dos dados.** Os PDFs saem; a base, não. É pergunta de
   cliente grande e de LGPD.

---

## 8. PRÓXIMAS 5 ENTREGAS DE MAIOR IMPACTO

Ordenadas por **retorno sobre esforço**, não por tamanho. As três primeiras são
telas para backend que já existe — o trabalho caro já foi pago.

### 1. Resolver o paywall que fecha o aplicativo
- **Por quê**: é a única divergência do repositório entre o que o código declara
  querer e o que faz, e a única com aresta de LGPD
- **Esforço**: pequeno — isentar as rotas de leitura em `App.tsx`, mantendo o
  bloqueio do servidor onde ele já está
- **Impacto comercial**: alto. Muda a resposta a "perco tudo?" de "o aplicativo
  fecha" para "você continua vendo o que é seu"
- **Risco**: baixo, com teste de fronteira cobrindo criar × ler
- **Depende de**: decisão §7.1

### 2. Seletor de audiência no caderno de montagem
- **Por quê**: o filtro, a regra e o PDF já funcionam; falta um `<select>`
- **Esforço**: muito pequeno
- **Impacto**: "um caderno para a equipe, outro para a cliente" vira frase de
  venda, e o campo `visibility` deixa de ser promessa não cumprida
- **Risco**: baixo
- **Depende de**: nada

### 3. Manutenção de materiais e composições
- **Por quê**: resolve as duas maiores ressalvas do §2 de uma vez, e o problema
  piora justamente com o cliente que mais usa
- **Esforço**: médio — uma tela de lista com editar e arquivar
- **Impacto**: retenção. Uma biblioteca suja é motivo de abandono no mês seis
- **Risco**: baixo — as mutations existem e estão testadas
- **Depende de**: decisão §7.3

### 4. Déficit de acervo na lista geral
- **Por quê**: o melhor momento da demonstração está escondido atrás de dois
  cliques, e quem planeja a semana não o vê
- **Esforço**: pequeno — `acervo.disponibilidade` já existe
- **Impacto**: alto na demonstração, real no uso
- **Risco**: baixo
- **Depende de**: nada

### 5. Segunda pessoa na conta
- **Por quê**: é a objeção mais frequente em reunião, e hoje a resposta é "não"
- **Esforço**: **grande** — toca identidade, autorização e cobrança
- **Impacto**: destrava a decoradora com sócia ou secretária, que é o perfil de
  quem paga mais
- **Risco**: alto. `users` é a fronteira de dados de todo o modelo; uma migração
  malfeita vaza uma empresa para outra
- **Depende de**: decisão §7.2. **Não comece sem ela.**

---

## 9. O que este mapa não cobriu

Honestidade sobre o próprio alcance:

- **Não houve homologação no DEV nesta rodada.** O ambiente onde este mapa foi
  escrito não alcança o Convex (403 na política de rede), então tudo aqui vem
  de **leitura de código** e da homologação anterior, feita contra um backend
  Convex real. Nenhuma afirmação depende de tela vista agora.
- **Desempenho sob volume não foi medido.** As varreduras globais paginam
  (`convex/notifications.ts`), mas nenhuma conta grande foi testada.
- **Acessibilidade foi vista só por alvo de toque.** Leitor de tela, contraste e
  navegação por teclado não foram auditados.
