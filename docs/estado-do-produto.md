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

Datado de 20/09/2026, conferido contra o código em `3c56d29`. Cada item cita a
evidência. Onde não há evidência, não há item — nada aqui é suposição.

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
- **Evidência**: `materials.create`, `update` e `setArchived` usados em `receita-dialog.tsx` e `material-dialog.tsx`
- **Ressalva**: o material nasce e é corrigido de dentro da receita — **não há tela de catálogo** no menu. Quem quiser revisar a lista inteira não tem por onde
- **Risco**: baixo (era médio: o erro de digitação agora tem conserto)
- **Dependências**: §7.3, se a tela própria for adiante

### Central de Comunicações
- **Evidência**: `convex/communications*.ts`, `src/pages/app/central/`, `docs/central-comunicacoes.md`
- **Ressalva**: é a operação do SaaS, **não** produto da decoradora; e o envio externo está desligado por construção
- **Risco**: baixo enquanto o portão estiver fechado
- **Dependências**: número comercial integrado, para a próxima fase

---

## 3. BACKEND PRONTO / UI FALTANDO

O caro já está feito e testado. Falta a tela — que é o trabalho barato com o
maior retorno por hora do repositório inteiro.

### Manutenção de composições
- **Evidência**: `compositions.update`, `duplicate`, `setArchived` — zero referências em `src/`. Salvar (`fichaTecnica.salvarNaBiblioteca`) e aplicar (`compositions.list`) já funcionam
- **Usuário**: a biblioteca só cresce; salvar de novo cria outra entrada em vez de atualizar
- **Risco**: médio — piora com o tempo de uso, então o cliente mais fiel sofre mais
- **Dependências**: decidir onde mora a manutenção (ver §7.3). A edição de MATERIAL já foi entregue e serve de precedente: abre de onde o material é escolhido, sem rota nova

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

Ordenadas por **retorno sobre esforço**. As quatro entregas da madrugada de
20/09 saíram desta lista porque foram feitas — paywall, audiência do caderno,
déficit na lista de acervo e edição de material.

### 1. Manutenção da biblioteca de composições
- **Por quê**: é a última ressalva que piora com o tempo de uso. Salvar cria
  entrada nova em vez de atualizar, então a biblioteca do cliente mais fiel é
  a mais suja
- **Esforço**: pequeno — as mutations existem, e a edição de material já deu o
  padrão: abrir de onde a composição é escolhida, sem rota nova
- **Risco**: baixo. O mesmo cuidado do material vale aqui: editar a biblioteca
  não pode alcançar o snapshot de um evento
- **Depende de**: nada

### 2. Tela de catálogo (materiais e composições)
- **Por quê**: corrigir de dentro da receita resolve o erro pontual; não
  resolve "quero revisar minha lista inteira antes da temporada"
- **Esforço**: médio — uma tela de lista com busca, editar e arquivar
- **Impacto**: retenção
- **Depende de**: decisão §7.3

### 3. Desfazer vínculos da Ficha Técnica
- **Por quê**: `limparReceita`, `desvincularCompra` e `unregisterCost` existem
  e não têm caminho. Um vínculo errado hoje é dado preso
- **Esforço**: pequeno
- **Risco**: médio — são ações destrutivas e precisam de confirmação, como a
  de liberar reserva
- **Depende de**: nada

### 4. Segunda pessoa na conta
- **Por quê**: é a objeção mais frequente em reunião, e a resposta é "não"
- **Esforço**: **grande** — toca identidade, autorização e cobrança
- **Risco**: alto. `users` é a fronteira de dados de todo o modelo
- **Depende de**: decisão §7.2. **Não comece sem ela.**

### 5. Vocabulário do ALTAR Buffet
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
  (`convex/notifications.ts`), mas nenhuma conta grande foi testada.
- **Acessibilidade foi vista só por alvo de toque.** Leitor de tela, contraste e
  navegação por teclado não foram auditados.
