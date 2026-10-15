# Estudo: WhatsApp oficial da empresa e acessos da equipe (outubro/2026)

> **Status: estudo. Nada aqui foi implementado, contratado ou ligado.**
> Escrito em 14/10/2026 sobre a branch `feature/consolidacao-reunioes-15-10`.
> Pesquisa na web feita na mesma data; todo número de preço tem fonte e data, e
> o que não pôde ser confirmado está marcado **não confirmado**.
>
> Lê junto com: `docs/arquitetura-multiusuario.md` (o custo de duas pessoas na
> mesma conta), `docs/whatsapp-arquitetura.md` (o gateway e a porta fechada),
> `docs/central-comunicacoes.md` (a Central do ALTAR) e o item **D10** de
> `docs/ideias-registradas.md`.

---

## 1. Decisão de produto e escopo

**Quem entra no sistema** é a decoradora **e o braço direito dela** (secretária
ou sócia de confiança), **na mesma empresa**, cada uma com o próprio login e
**acesso total aos módulos do negócio** — atendimento ao cliente e financeiro
inclusive.

**Quem não entra:** florista, motorista, carregador e demais equipe de montagem.
Eles recebem o **Caderno da Equipe** (PDF "Para a equipe", ver
`docs/caderno-de-montagem.md`) e continuam cadastrados em `teamMembers`, que é
cadastro e não acesso.

Consequências dessa decisão, que simplificam muito o problema:

| Decidido | Por isso NÃO precisamos agora |
|---|---|
| Duas (poucas) pessoas, mesmo nível de acesso aos módulos | Papéis de leitura por módulo, "a florista não vê a margem" |
| Equipe de campo só recebe PDF | Restringir URL de arquivo por papel — o problema do item 4 de `arquitetura-multiusuario.md` §5 não aparece |
| Uma empresa = uma assinatura | Cobrança por pessoa |

O que o estudo cobre: (a) o acesso de mais de uma pessoa à mesma empresa;
(b) o WhatsApp **da decoradora** (não o do ALTAR) como caixa de entrada
compartilhada; (c) o papel da IA nisso; (d) a escolha de provedor.

O que o estudo **não** cobre: o número comercial do ALTAR na Central (já
documentado em `whatsapp-arquitetura.md`), campanhas em massa, e qualquer acesso
de equipe de campo.

---

## 2. Acessos: duas pessoas, uma empresa

### 2.1 Regras de produto

1. **Login individual.** Cada pessoa tem e-mail e senha próprios. Senha
   compartilhada deixa de ser o jeito de "dar acesso".
2. **Mesma empresa, mesmo dado.** O membro vê e edita tudo o que a dona vê nos
   módulos do negócio: eventos, leads, atendimento, propostas, contratos,
   financeiro, acervo, produção, Assistente.
3. **A dona controla** quem é membro (convidar, revogar) e as **integrações**
   (conectar/desconectar o WhatsApp, dados de cobrança da assinatura). Membro
   não convida, não remove a dona, não troca o número conectado, não cancela a
   assinatura.
4. **Nenhum acesso a ferramentas internas da plataforma.** Ser membro — ou dona —
   de uma empresa nunca dá `/escritorio`, Central, painel admin. Continua valendo
   a trava 6 do `CLAUDE.md`: `requirePlatformOwner` é uma conta só.
5. **Auditoria "quem fez".** Toda mensagem respondida e toda alteração relevante
   (financeiro, contrato, status de evento, conversão de lead) guarda **qual
   pessoa** fez, não só de qual empresa é.
6. **Revogação individual.** Tirar a secretária não afeta a dona nem o dado.
   O dado criado por ela continua da empresa; a sessão dela cai na hora.

### 2.2 Caminho incremental a partir do modelo por usuário

Hoje `users` é login, assinante, dono do dado e marca ao mesmo tempo
(`arquitetura-multiusuario.md` §3). O caminho menos arriscado, coerente com
aquele documento, é **uma indireção resolvida no servidor**, sem renomear as 22
tabelas:

```
users                          (continua sendo a PESSOA e o login)
empresas  (nome a decidir)     ownerId, marca, assinatura
membrosDaEmpresa               empresaId, userId, papel ("dona" | "membro"),
                               convidadoPor, criadoEm, revogadoEm?
```

- `userId` nas tabelas de negócio continua existindo e passa a significar
  **quem criou**; a pergunta de posse muda de "é meu?" para "é da minha
  empresa?".
- A empresa é **resolvida no servidor** a partir da sessão
  (`requireUser` → membro ativo → empresa). **Nunca** vem do navegador como
  argumento — mesma lógica da trava 2: id vindo do cliente não é prova de nada.
- Ausência de vínculo significa "empresa de uma pessoa só", que é 100% das
  contas hoje. Campo/tabela novos nascem opcionais, **sem backfill**.
- As funções de posse em `convex/lib/identity.ts` (`requireEventOwner`,
  `requireLeadOwner`, `requireTeamMember`, `requireEventPhoto`,
  `requireEventSupplier`, `getOwned*`) mudam **por dentro**; as chamadas não.
- O custo real está nas consultas `withIndex("by_user", q => q.eq("userId",
  user._id))` depois de `requireUser` (~85 pontos, §4 do documento citado).
  Com N pessoas isso vira N consultas ou um índice novo por empresa. Para
  **duas** pessoas, N consultas é aceitável como etapa; o índice por empresa
  vem quando o número justificar.
- Assinatura e paywall (`lib/access.ts`, `lib/accessGuard.ts`, webhook Asaas)
  passam a olhar a empresa. É a parte que mexe com dinheiro; vai em fase
  própria.

### 2.3 Lições da tentativa revertida (PR #2)

A migração para multi-tenant com `organizationId` foi revertida antes de existir
produto. O que tirar dela:

- **Não trocar a chave de todas as tabelas de uma vez.** Indireção primeiro,
  troca de índice depois, se precisar.
- **Não começar pela modelagem genérica** (organizações, papéis arbitrários,
  permissões por recurso). A decisão de produto é estreita — dona + braço
  direito, acesso total — e o código deve ser estreito igual.
- **O README proíbe reintroduzir `organizationId` sem decisão explícita.** Este
  documento registra a decisão de produto, mas a implementação precisa de aval
  separado e da revisão daquela regra no README.

### 2.4 Fases

| Fase | Entrega | Risco |
|---|---|---|
| A0 | Nada muda; este estudo | — |
| A1 | Tabelas `empresas` e `membrosDaEmpresa` vazias + funções de posse resolvendo empresa (todas as contas = empresa de uma pessoa) | Baixo, se os testes de isolamento passarem iguais |
| A2 | Convite da dona → segundo login entra e vê tudo | Médio: convite é porta de entrada nova; verificação de e-mail hoje está desligada (`convex/auth.ts`) |
| A3 | Auditoria `feitoPor` nas escritas relevantes | Baixo |
| A4 | Assinatura migra para a empresa | Alto: dinheiro |
| A5 | Revogação com derrubada de sessão | Médio |

### 2.5 Testes necessários (adversariais)

- Membro da empresa X com id de evento/lead/foto/fornecedor da empresa Y →
  `NOT_FOUND`, em **toda** função pública (estender `tenant.isolation.test.ts`).
- Membro **revogado** tenta ler e escrever com a sessão antiga → negado.
- Membro tenta convidar, revogar a dona, trocar o número de WhatsApp, cancelar
  assinatura → negado.
- Membro e dona de qualquer empresa chamam funções de `/escritorio` e da
  Central → negado (`requirePlatformOwner`).
- Convite: expirado, reutilizado, aceito por e-mail diferente do convidado,
  reenviado por não-dona → negado.
- Mesma mutation de aceite repetida → um vínculo só.
- Empresa com dona bloqueada / assinatura vencida → membro também barrado no
  paywall (`accessGuard`).
- Listagens paginadas no limite com duas pessoas criando dado → nenhuma linha
  some nem duplica.

---

## 3. WhatsApp oficial da empresa

### 3.1 O que a decoradora quer

- **Caixa de entrada compartilhada:** o número oficial da empresa dela, visto
  pela dona e pelo braço direito no ALTAR.
- **Histórico ligado ao cliente:** a conversa pertence ao lead e, depois do
  fechamento, ao evento — a mesma conversa acompanha a conversão.
- **Tipos:** texto, áudio, fotos, documentos (PDF da proposta, contrato) e
  **status de entrega** (enviado, entregue, lido, falhou).
- **Sem resposta simultânea:** atribuição da conversa a uma pessoa e trava
  leve ("Fulana está respondendo") para que as duas não respondam a mesma
  cliente ao mesmo tempo.
- **Sem duplicata:** idempotência pelo **id da mensagem do WhatsApp**
  (`wamid`). O gateway já deduplica por `externalMessageId`
  (`integrationEvents`); a mesma regra vale aqui.
- **Custo e limite por empresa:** cada empresa vê seu consumo; o ALTAR impõe
  teto por empresa para que uma não pague (nem derrube) a outra.

### 3.2 Arquitetura — o que reaproveitar e o que NÃO misturar

- **Reaproveitar o contrato de canal** (`convex/lib/channels/`):
  `AdaptadorDeCanal`, `MensagemNormalizada`, verificação de assinatura,
  deduplicação. O adaptador `whatsapp.ts` (Cloud API) já existe.
- **Não reaproveitar as tabelas da Central.** `communication*`, `adminContacts`,
  `adminApprovals` são do ALTAR e **não enxergam `leads`** (trava 5, testada em
  `central.fronteiras.test.ts`). O WhatsApp da decoradora é dado **da empresa
  dela** e mora do lado do tenant, com dono, junto de `leads`/`events`.
- **Sem tabela por canal** (regra do README: nada de `whatsapp*`). Conversa e
  mensagem são do domínio "atendimento"; o canal é atributo.
- **Porta de saída:** o envio da decoradora precisa da mesma disciplina do
  portão da Central (aprovação humana, autor registrado, flag de ambiente,
  janela do canal) — mas é **outra porta**, por empresa, e a Central continua
  fechada como está. Ligar uma não pode abrir a outra.
- **Roteamento do webhook:** um número → uma empresa, resolvido no servidor pelo
  `phone_number_id` do payload; payload de número desconhecido é descartado.

### 3.3 Limitações a deixar claras para a decoradora

| Tema | O que acontece |
|---|---|
| Janela de 24h | Resposta livre só dentro de 24h da última mensagem da cliente. Fora disso, **só template aprovado**. |
| Templates | Precisam de aprovação da Meta; são categorizados (marketing, utilidade, autenticação) e cobrados por mensagem. |
| Opt-in | Iniciar conversa exige consentimento da cliente; precisa ser registrado com data e origem. |
| Grupos | O grupo "Casamento Ana & João" do aparelho **não** vira inbox: grupos não são sincronizados nem suportados na coexistência (§5.4). |
| Histórico antigo | Só com coexistência: até 180 dias de conversas individuais, mídia só dos últimos 14 dias (§5.4). |
| Coexistência com o app | Ver §5.4 — decide se ela continua usando o WhatsApp Business no celular. |
| Retenção de mídia | Mídia recebida: o id expira em **7 dias**; a URL de download, em **5 minutos**; mídia enviada fica 30 dias na Meta. O ALTAR precisa baixar e guardar logo (custo de storage e LGPD). Limites: áudio 16 MB, imagem 5 MB, documento 100 MB. |
| Ligações | Chamada de voz pelo app não vira registro no ALTAR. |

---

## 4. IA como apoio, nunca como remetente

- A IA **resume** a conversa ("a noiva pediu orçamento para 120 pessoas, data
  14/03, quer tons terrosos") e **sugere rascunho** de resposta.
- O rascunho é **revisável e editável**, e só sai quando uma pessoa aperta
  enviar — com o nome dela gravado como autor.
- `podeEnviarSemAprovacao` continua `false` para todos os níveis. Este estudo
  **não** propõe mudar isso.
- A IA não inicia conversa, não escolhe template, não responde fora do horário.
- Custo da IA é **separado** do custo do WhatsApp (ver §5.5).

---

## 5. Meta direto × provedores oficiais

> Pesquisa feita em **14/10/2026**. Preço muda por trimestre (a Meta só altera
> preço no primeiro dia de um trimestre). Tudo aqui deve ser reconferido na fonte
> antes de qualquer decisão. Fontes no fim da seção.

### 5.1 Os dois caminhos

**A) Meta direto (Cloud API), o ALTAR como Tech Provider.** O ALTAR registra um
app na Meta, passa por verificação de empresa e App Review (com vídeos de
envio e de criação de template) e pede acesso avançado a
`whatsapp_business_management` e `whatsapp_business_messaging`. Cada decoradora
conecta o número dela pelo **Embedded Signup** (pop-up da Meta dentro do
ALTAR); o servidor troca o código por um token da empresa dela, registra o
número e assina os webhooks. Sem parceiro de solução, **a decoradora cadastra a
forma de pagamento na conta WhatsApp (WABA) dela** e a Meta cobra dela direto.

**B) Provedor oficial (BSP / Solution Partner).** O provedor já é parceiro da
Meta; o ALTAR integra a API dele (ou a Cloud API via o programa de parceiros
dele) e ele cuida de onboarding, faturamento e suporte. Paga-se mensalidade
e/ou taxa por mensagem além da tarifa da Meta.

### 5.2 Tarifa da Meta (vale para os dois caminhos)

| Item | Situação em 14/10/2026 | Fonte |
|---|---|---|
| Modelo | **Por mensagem entregue** desde 01/07/2025; cobra-se só template, por categoria e país do destinatário | Meta, página de preços |
| Mensagem de serviço (texto livre) dentro da janela de 24h | Gratuita, segundo a página da Meta acessada hoje | Meta |
| Template de utilidade dentro da janela | Gratuito, segundo a Meta | Meta |
| **Mudança em 01/10/2026** | **Divergência.** A Zenvia afirma que, desde 01/10/2026, mensagem de serviço e utilidade na janela passam a ser cobradas por unidade. A página da Meta acessada hoje ainda diz que são gratuitas e não lista o Brasil entre os mercados alterados em outubro. **Não confirmado** — perguntar ao provedor e conferir a tabela da Meta. | Zenvia; Meta |
| Marketing (Brasil) | ~R$ 0,32 por mensagem segundo terceiro (ChatMaxima, tabela de 01/07/2026); outras fontes dão R$ 0,31–0,39. **Valor oficial não confirmado** (a tabela BRL da Meta é arquivo à parte, não lido) | terceiros |
| Utilidade / autenticação (Brasil) | ~R$ 0,035 segundo o mesmo terceiro; outras fontes divergem (R$ 0,04–0,19). **Não confirmado** | terceiros |
| Faturamento em reais | Desde 01/07/2026, clientes elegíveis com país de faturamento Brasil criam WABA em BRL, faturada pela Facebook Brasil. Contas em USD de clientes elegíveis precisam migrar até 30/06/2027; depois disso a Meta deixa de entregar | Meta |
| Janela gratuita de 72h | Conversa iniciada por anúncio "Clique para WhatsApp": tudo gratuito por 72h | Meta |
| Provedores de IA | Há uma política de preço própria para "AI Providers" desde 16/02/2026; a Zenvia cita US$ 2 por milhão de tokens. Aplicabilidade ao ALTAR **não confirmada** | Meta; Zenvia |

**Leitura para a decoradora:** responder cliente que escreveu é barato ou
gratuito (salvo a divergência de outubro); o caro é **iniciar** conversa com
template de marketing.

### 5.3 Comparação

| Critério | Meta direto (Tech Provider) | 360dialog | Twilio | Zenvia / Blip (BR) |
|---|---|---|---|---|
| Onboarding da decoradora | Embedded Signup no ALTAR | Embedded Signup/hosted do provedor; o ALTAR seria parceiro (Partner Platform) | Tech Provider Program da Twilio com Embedded Signup | Comercial/consultivo; integração por API do provedor |
| Taxa do provedor | Nenhuma | API: €49 (Regular) ou €99 (Premium) por número/mês; parceiro: a partir de €250/mês + €49 por canal; diz não ter markup sobre a Meta | US$ 0,005 por mensagem, **entrada e saída**, + US$ 0,001 por mensagem que falha; sem mensalidade listada | Planos negociados, **preço não publicado — não confirmado** |
| Moeda / nota fiscal BR | BRL pela Facebook Brasil, se elegível | Euro (provedor europeu) | USD | BRL, nota fiscal brasileira, suporte em português |
| Coexistência com o app | Suportada (exige Tech Provider + Embedded Signup com log de sessão) | Suportada (documentada) | Suportada pelo programa Tech Provider — **detalhes não confirmados** | **Não confirmado** |
| Webhooks | Direto da Meta para o ALTAR; o adaptador `whatsapp.ts` já fala esse formato | Repasse quase igual ao da Meta | Formato próprio da Twilio (novo adaptador) | Formato próprio (novo adaptador) |
| Suporte | Fórum/suporte de desenvolvedor da Meta; ninguém para ligar | Ticket; dedicado só no plano Premium de parceiro | Ticket; planos pagos | Comercial em português, SLA enterprise (Blip) |
| Lock-in | Baixo (o número é da decoradora, a WABA é dela) | Baixo/médio | Médio (formato próprio) | Médio/alto (contrato, ferramentas próprias) |
| LGPD | ALTAR é operador; Meta é suboperadora; dado em trânsito pela Meta | Mais um suboperador (UE — transferência internacional) | Mais um suboperador (EUA) | Suboperador no Brasil — mais simples de explicar |

Observação sobre **custo por empresa**: no caminho direto, a fatura da Meta é
da WABA de cada decoradora — o ALTAR não carrega custo de mensagem dela. Num
provedor com conta do ALTAR, o ALTAR paga e precisa repassar, o que exige
medição por empresa e teto (ver §3.1).

### 5.4 Coexistência com o WhatsApp Business no celular

Desde 2025 a Meta permite usar o **mesmo número** no app WhatsApp Business e na
Cloud API. Para a decoradora, isso é provavelmente o ponto decisivo: ela não
perde o celular. O que a documentação da Meta diz (acessada hoje):

- Histórico de **até 180 dias** antes da conexão pode ser sincronizado, e a
  sincronização tem de ser iniciada em até 24h; mídia antiga só vem para
  mensagens dos **últimos 14 dias**.
- **Grupos não são sincronizados** nem suportados.
- Ficam fora da API: chamadas, catálogo, etiquetas, respostas rápidas,
  mensagens de saudação/ausência, mensagens temporárias e de visualização
  única, localização em tempo real; **listas de transmissão viram só leitura**.
- Exige app WhatsApp Business **2.24.17 ou mais novo**; aparelhos vinculados são
  desconectados na adesão (WhatsApp para Windows não é suportado, segundo a
  360dialog); o app precisa ser aberto ao menos a cada 13 dias (360dialog).
- Número em coexistência tem vazão fixa de 20 mensagens/s (irrelevante para o
  volume de uma decoradora).
- Mensagem enviada pelo app aparece no histórico da API e vice-versa ("echoes")
  — o ALTAR precisaria gravar as duas e marcar a origem ("pelo celular",
  "pelo ALTAR, por Fulana").
- Elegibilidade depende de tempo de conta e qualidade; conta nova não é elegível
  de imediato. Se o **Brasil** está entre os países elegíveis: **não confirmado**
  na página lida.

### 5.5 IA é custo separado

O custo do WhatsApp (Meta + provedor) **não inclui IA**. Resumo e rascunho usam
a API de modelo do ALTAR, cobrada por uso (tokens) na conta do ALTAR, e entram
no teto de uso por empresa. **A integração não inclui assinatura do Claude** —
nem da decoradora nem da secretária; quem paga o modelo é o ALTAR, e o preço
disso entra no plano.

### 5.6 Recomendação preliminar

Começar pelo **caminho direto (Tech Provider + Embedded Signup + coexistência)**:
o adaptador `whatsapp.ts` já fala o formato da Cloud API, a decoradora paga a
Meta direto em reais, sem markup, e o lock-in é mínimo. Manter **um provedor
brasileiro** (Zenvia ou Blip) como plano B caso o App Review da Meta demore ou
o suporte direto se mostre insuficiente — o contrato `AdaptadorDeCanal` permite
trocar sem mexer em tabela. Recomendação, não decisão.

### 5.7 Fontes (acessadas em 14/10/2026)

- Meta — Preços: https://developers.facebook.com/docs/whatsapp/pricing
- Meta — Atualizações de preço: https://developers.facebook.com/docs/whatsapp/pricing/updates-to-pricing
- Meta — Coexistência (onboarding de usuários do app): https://developers.facebook.com/docs/whatsapp/embedded-signup/custom-flows/onboarding-business-app-users/
- Meta — Tech Provider: https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-tech-providers
- Meta — Mídia (retenção e limites): https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media
- 360dialog — Preços: https://360dialog.com/pricing
- 360dialog — Coexistência: https://docs.360dialog.com/partner/waba-management/whatsapp-coexistence
- Twilio — Preços WhatsApp: https://www.twilio.com/en-us/whatsapp/pricing
- Zenvia — Novas regras de cobrança 2026: https://zenvia.com/novas-regras-cobranca-whatsapp-2026/
- ChatMaxima (terceiro, não oficial) — Brasil: https://chatmaxima.com/whatsapp-api-pricing/brazil/
- Message Central (terceiro, concorrente) — Brasil: https://www.messagecentral.com/pt-br/blog/whatsapp-business-api-pricing-in-brazil

---

## 6. Não fazer agora

- Não conectar nenhum número (nem o da decoradora, nem o do ALTAR).
- Não contratar provedor, não criar conta Meta Business, não submeter template.
- Não mudar autenticação, não criar usuário, não criar convite.
- Não enviar mensagem, não ligar `ALTAR_CENTRAL_ENVIO_HABILITADO`.
- Não implementar tabela, função ou tela deste estudo sem aval explícito.

---

## 7. Roadmap, decisões em aberto e riscos

### 7.1 Fases

| Fase | O que é | Depende de |
|---|---|---|
| **0** | Este estudo; conversa com a decoradora sobre as decisões de 7.2 | — |
| **1. Acesso compartilhado** | Fases A1–A3 de §2.4: empresa resolvida no servidor, convite da dona, auditoria "quem fez" | Aval para rever a regra do README sobre `organizationId`; verificação de e-mail ligada |
| **2. Assinatura da empresa** | A4–A5: paywall e cobrança olham a empresa; revogação derruba sessão | Fase 1 estável em DEV |
| **3. Cadastro na Meta** | Verificação da empresa ALTAR, app, App Review, Tech Provider (ou contrato com provedor) | Decisão de 7.2; prazo externo |
| **4. Inbox só de leitura** | Webhook por empresa grava conversa, mídia e status; vínculo com lead/evento; nenhum envio | Fase 3; fases 1–2 para as duas verem |
| **5. Resposta com humano** | Resposta pelo ALTAR dentro da janela de 24h, com atribuição/trava e autor gravado; porta de saída **própria por empresa**, fechada por padrão | Fase 4 em uso real; aval explícito |
| **6. IA de apoio** | Resumo e rascunho revisável; nunca envio | Fase 4 (resumo) e 5 (rascunho) |
| **7. Templates** | Lembrete/confirmação via template de utilidade, opt-in registrado | Aprovação de templates na Meta |

Cada fase é uma branch própria, com testes adversariais, sem release fora do
roteiro de `docs/release-producao.md`.

### 7.2 Decisões em aberto para a dona

1. **Celular continua?** Ela quer manter o WhatsApp Business no aparelho
   (coexistência) ou passar a atender só pelo ALTAR?
2. **Qual número?** O comercial atual (com histórico) ou um número novo?
3. **Quem paga a Meta?** A decoradora direto (cartão na WABA dela) ou o ALTAR
   embute no plano?
4. **Provedor:** Meta direto ou provedor brasileiro com nota fiscal e suporte
   em português?
5. **Quantas pessoas por empresa** no plano: duas fixas, ou teto maior?
6. **O braço direito vê tudo do financeiro**, inclusive margem e extrato? (A
   decisão atual diz que sim; confirmar por escrito.)
7. **Quem pode conectar/desconectar o WhatsApp:** só a dona (proposta deste
   estudo)?
8. **O que acontece com o dado** quando o membro sai: fica na empresa
   (proposta) — e o histórico de "quem respondeu" continua mostrando o nome?
9. **Retenção:** por quanto tempo guardar áudio, foto e documento de cliente
   depois que o evento acaba (LGPD)?
10. **Horário de atendimento** e o que a cliente vê fora dele.

### 7.3 Riscos

| Risco | Efeito | Mitigação |
|---|---|---|
| Vazamento entre empresas por consulta que filtra `userId` na mão | Dado de cliente de uma decoradora aparece para outra | Empresa resolvida no servidor; `tenant.isolation.test.ts` estendido; testes com id de outra empresa |
| Convite como porta de entrada | Alguém entra numa empresa que não é dele | Convite com expiração, uso único, e-mail verificado, só a dona convida |
| Abrir a porta da decoradora abre a da Central (ou vice-versa) | Envio não autorizado | Portas separadas, testes de fronteira, `ALTAR_CENTRAL_ENVIO_HABILITADO` intocado |
| Resposta dupla à mesma cliente | Cliente recebe duas respostas diferentes | Atribuição + trava + idempotência por `wamid` |
| Mídia perdida | Áudio da noiva some em 7 dias | Download imediato no webhook, com fila de nova tentativa |
| Preço muda (divergência de outubro já existe) | Custo inesperado para a decoradora | Confirmar com fonte oficial; teto e painel de consumo por empresa |
| App Review da Meta demora ou é negado | Fase 3 trava | Provedor oficial como plano B |
| Coexistência indisponível para a conta dela | Ela teria de largar o app no celular | Confirmar elegibilidade antes de prometer |
| IA ganha autonomia "por conveniência" | Mensagem que ninguém aprovou | `podeEnviarSemAprovacao = false` coberto por teste; só rascunho |
| LGPD | Dado de cliente final (voz, foto, telefone) em mais sistemas | Contrato de operador, retenção definida, exportação e exclusão por cliente |
| Custo de IA sem teto | Uma empresa consome o orçamento do ALTAR | Teto de uso por empresa, separado do WhatsApp |
