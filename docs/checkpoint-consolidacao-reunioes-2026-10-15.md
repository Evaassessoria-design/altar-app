# Checkpoint — consolidação pós-live e Reuniões (15/10/2026)

## 1. Onde foi feito

| Item | Valor |
|---|---|
| Máquina | **notebook local** `LAPTOP-RR3DVREB`, Windows 11 (Git Bash / PowerShell). **Não** é o container remoto das sessões de 14/10 |
| Repositório | `Evaassessoria-design/altar-app` em `C:\Users\mathe\.copilot\repos\altar-app` |
| Branch | **`feature/consolidacao-reunioes-15-10`** (enviada ao GitHub) |
| Base | `integration/altar-live-14-10` @ **`cc03812f087ed45bdff2d0bbf8ab011cdc80aa86`** |
| SHA final | o do commit que traz este arquivo — `git log -1 feature/consolidacao-reunioes-15-10` |

**Por que essa base.** `git fetch --all --prune` e a comparação de todas as
branches remotas contra `cc03812`: as únicas com commits fora dela são
`main` (`86dc253`, Escritório — mesma mudança já presente por outro caminho),
`release/hotfix-upload-100mb`, `release/reversao-2026-10`,
`feature/office-core-whatsapp`, `feature/altar-office-readonly-bridge` e duas
`salvaguarda/*` — todas de antes de 07/10, nenhuma posterior ao candidato da
live. Nenhum trabalho mais novo ficou de fora.

**Preservado, sem tocar:** os 4 stashes (`stash@{0..3}`), a branch onde a
sessão começou (`integration/altar-pre-live-08-10`, limpa e igual ao remoto) e
15 branches locais antigas (agosto) com commits nunca enviados — continuam
locais, como estavam.

## 2. Ambientes — o que é o quê

| Peça | Estado |
|---|---|
| Código local | esta branch |
| Código no GitHub | esta branch, enviada (sem merge na `main`, sem force push) |
| Backend DEV `healthy-pika-907` | **PUBLICADO por esta sessão** (`npx convex dev --once`, alvo conferido) — 273/273 funções, conferido por `scripts/sincronia/conferir.mjs` |
| Frontend DEV | não há site hospedado de DEV: é o `pnpm dev` **neste notebook** (`http://localhost:5173`, aponta para o DEV pelo `.env.local`) |
| PROD `mellow-goose-539` / `www.appaltar.com.br` | **não tocado**. Segundo `docs/checkpoint-integracao-2026-10-14.md`: frontend `5810dbd`, backend `5ec2c4c` (não reconferido aqui) |
| DEMO `insightful-goldfish-950` | **não tocado** |

A rede do notebook alcança o Convex (o `CONNECT 403` era do container
remoto). Nenhum segredo foi exibido; só nomes de deployment.

**Antes de publicar no DEV, conferido:**
- alvo `dev:healthy-pika-907` no `.env.local` e no próprio comando;
- o DEV rodava a Produção floral (`ad73c75`), **contida** nesta branch, assim como `5810dbd`;
- das 265 funções publicadas no DEV, **nenhuma some** com este código; 8 novas (2 do Extrato, 6 de Reuniões);
- schema: em relação a `ad73c75`, **só adições** (tabela `reunioes`, índice `leads.by_converted_event`, os campos aditivos do briefing/pagamentos já integrados). Sem backfill, sem migração, sem seed, sem limpeza;
- `npx convex codegen` (antes) não publicou nada — conferido.

## 3. O que foi entregue

| Commit | Assunto | Estado |
|---|---|---|
| `8b1c893` | Proposta aceita no lead chega à Jornada do evento | IMPLEMENTADO · TESTADO (automático) · PUBLICADO no DEV |
| `dbf9633` | Rodapé de PDF, nome de arquivo com acento, data do lead na edição, aviso do caderno do cliente | IMPLEMENTADO · TESTADO (automático) · no DEV só com o frontend local |
| `f07d93d` | Reuniões do evento | IMPLEMENTADO · TESTADO (automático) · PUBLICADO no DEV |
| `708b1d8` | Estudo WhatsApp e acessos | DOCUMENTADO, nada implementado |
| (este) | Checkpoint + README | — |

### 3.1 Proposta aceita na Jornada — o defeito conhecido

**Mecanismo.** A proposta nasce com `leadId`; a Jornada e o cartão do evento
liam `proposals.by_event`; a conversão não ligava uma ao outro.

**Correção** (`convex/lib/propostasDoEvento.ts`):
- `funil.convertToEvent` liga ao evento as propostas do lead **sem evento** (ou com ponteiro para evento apagado). O `leadId` fica: o funil continua contando.
- Conversão repetida devolve o mesmo evento e não duplica nada; a repetição também liga a proposta que tinha ficado para trás.
- Várias propostas do mesmo lead: todas vão para o evento; a **aceita** decide a etapa e é a que o cartão mostra.
- Proposta ligada a **outro evento vivo** fica onde está.
- `propostas.create` num lead já convertido nasce ligada ao evento (o aditivo).
- Apagar o evento **devolve** a proposta ao lead (não apaga, limpa o `eventId`).
- Isolamento: só propostas da mesma conta; a concorrente não é ligada nem lida.
- Nenhum valor, item, versão enviada ou data de decisão é alterado — testado campo a campo. O vínculo não muda o "atualizado em".
- Nenhuma varredura: tudo por índice e com teto (propostas de UM lead, leads de UM evento).

**Eventos antigos (convertidos antes desta correção) — comportamento definido:**
- **Nada é reescrito no banco.** Sem backfill, sem migração.
- A Jornada e o cartão do evento **passam a enxergar** a proposta pela LEITURA: o evento acha o lead de origem pelo índice novo `leads.by_converted_event` e soma as propostas dele que não têm evento.
- A proposta só ganha `eventId` gravado se alguém converter o lead de novo (o botão devolve o mesmo evento) ou criar outra proposta no lead. "Trazer receitas do orçamento" na tela da proposta só aparece para a proposta com `eventId` gravado — esse é o único efeito visível da diferença.

### 3.2 As dez correções anteriores — conferidas no caminho real

| # | Correção | Veredito (inspeção de código) |
|---|---|---|
| 1 | Data preservada ao converter lead | CORRIGIDO. **Achado vizinho, corrigido agora:** editar um lead com data gravada com horário mostrava o campo vazio e salvar apagava a data |
| 2 | "Reservar peça" no celular | CORRIGIDO (`flex-wrap` + `min-w-0`) |
| 3 | Fornecedor anotado/removido | CORRIGIDO (`supplierId: null` aceito e enviado) |
| 4 | Parcelas sempre acessíveis | CORRIGIDO (detalhes abrem em qualquer estado; "Registrar recebimento" com saldo > 0) |
| 5 | Segunda leva e seguintes | CORRIGIDO (rótulo "(leva N)" evita a deduplicação indevida) |
| 6 | Cancelar correção explica o estado | CORRIGIDO (aviso ao cancelar/fechar sem registrar) |
| 7 | Item no caderno do cliente | CORRIGIDO, **com ressalva corrigida agora:** marcar "Mostrar no caderno do cliente" com "Incluir no relatório de montagem" desligado não fazia nada, calado — a tela agora avisa |
| 8 | Nome longo × rodapé dos PDFs | **PARCIAL → corrigido agora**: o caderno cortava; a Folha de Carregamento e os documentos internos (Relatório, Orçamento — `pdf-marca`) não. Os três passam a cortar com reticências |
| 9 | Receita técnica preserva dados florais | CORRIGIDO (cor, origem, distribuição e orientação são preservados; o campo `floral` do item não é tocado) |
| 10 | Nome de arquivo com acento | **PARCIAL → corrigido agora**: Ficha Técnica salvava "anivers-rio.pdf" e Carregamento "Joo.pdf" |

### 3.3 Reuniões do evento (nova entrega)

- **Campos:** título, data, horário ("a combinar" quando vazio), participantes, link externo (Meet/Zoom/Teams/outro, só `http(s)`, `javascript:` recusado), situação agendada/realizada/cancelada, pauta, anotações/ata, resumo, decisões, pendências (quem faz, prazo, feita) e próxima reunião ("Agendar a próxima" abre o formulário com o dia — nada é criado sem salvar).
- **Onde:** `/eventos/:id/reunioes`, com uma linha "Reuniões" na tela do evento (próxima, pendências em aberto, reuniões sem desfecho) e na **Agenda existente**, pela data da própria reunião (cancelada não ocupa a agenda). Da Agenda, o toque abre aquela reunião.
- **Reabrir:** toda reunião abre e edita, inclusive realizada e cancelada. Agendada com data passada pede desfecho ("Ela aconteceu?").
- **Sem segunda agenda e sem cadastro paralelo:** a Agenda lê `reunioes`; a cliente é a do evento; participantes é texto.
- **Tarefas:** não existe módulo de tarefas do evento. As pendências moram na reunião. Elas **não** viram `checklistItems` — aquele é o Carregamento, e sairiam impressas na folha do galpão.
- **Anexos:** continuam na Pasta do Evento. Esta versão **não** vincula arquivo a uma reunião.
- **IA (opcional):** "Sugerir resumo" lê as anotações SALVAS e devolve **prévia**. Cada decisão e pendência precisa citar o trecho das notas; se o trecho não existe nas notas, o item é descartado e a tela diz quantos. Responsável só se o nome está nas notas. Nada é gravado até a pessoa marcar, acrescentar ao formulário e salvar. As anotações originais nunca são reescritas. Sem IA configurada ou com falha, a reunião continua sendo registrada à mão. Conta bloqueada não dispara IA.
- **Não faz:** videoconferência, gravação, transcrição, criação de sala, envio de convite ou mensagem.
- **Duplicação:** botão travado enquanto salva; no servidor, mesmo título + dia + horário no mesmo evento em menos de 1 minuto devolve a reunião existente.
- **Erros:** recado em português, o formulário continua aberto e preenchido. Sair com alteração não salva pergunta antes.
- Tabela nova `reunioes` (42 → 43), justificada na trava `arquitetura-sem-paralelos.test.ts`. Apagar o evento apaga as reuniões dele.

### 3.4 WhatsApp e acessos — só documento

`docs/estudo-whatsapp-e-acessos-2026-10.md`: decisão de produto (decoradora +
braço direito, acesso completo aos módulos de negócio, nenhum às ferramentas
internas; equipe de montagem só com o Caderno da Equipe), caminho incremental
a partir do modelo por usuário, caixa compartilhada, idempotência, trava contra
resposta dupla, custo por empresa, limitações, IA só como rascunho, Meta direto
× provedores com fontes datadas (14/10/2026). Preços que não puderam ser
confirmados estão marcados **não confirmado** — inclusive uma divergência entre
Zenvia e Meta sobre cobrança desde 01/10/2026. A integração **não** inclui
assinatura do Claude. Nada foi conectado, contratado ou implementado.

## 4. Checks (resultado real desta sessão, no notebook)

| Check | Resultado |
|---|---|
| `pnpm test` | **6.296 / 6.297** (281 arquivos). A 1 falha: `event-form-dialog.test.tsx` estourou 5 s sob carga; rodado sozinho, **10/10**. Arquivo não tocado nesta rodada |
| `tsc -p tsconfig.app.json` | ok |
| `tsc -p convex/tsconfig.json` | ok |
| `pnpm lint` | 0 erros, 8 avisos (os mesmos de antes, `src/components/ui/`) |
| `pnpm build` | ok |
| `conferir.mjs` (DEV) | 273 publicadas · 273 no código · em dia |

Testes novos: `convex/propostas.evento.test.ts` (15), `convex/reunioes.test.ts`
(12), `convex/lib/reunioes.test.ts` (13), `src/lib/pdf-marca.nomes.test.ts` (9) — 49 no total.
O teste da proposta foi conferido ao contrário: desligando a ligação na
conversão, 3 testes falham.

Sobre a contagem: o checkpoint de 14/10 registra 6.223 testes; a primeira
rodada aqui (antes de qualquer teste novo) deu 5.937 em 265 arquivos com 1
falha que eu mesmo causei (arquivo criado durante a execução). A diferença
para a rodada final não foi investigada a fundo — a final é a que vale.

## 5. Homologação — PASSOU / FALHOU / NÃO TESTADO

**Teste no navegador: NÃO TESTADO.** O site local abriu (`localhost:5173`
contra o DEV), mas sem sessão. Entrar exige a senha da conta de teste, que
quem digita é você: o login vai para o servidor do DEV, e eu não digito
senha nem crio conta ali.

| Fluxo | Automático | Inspeção de código | Navegador |
|---|---|---|---|
| Proposta aceita → converter → Jornada | PASSOU | PASSOU | NÃO TESTADO |
| Conversão repetida, várias propostas, evento antigo, concorrente | PASSOU | PASSOU | NÃO TESTADO |
| Reuniões: criar, reabrir, editar, excluir, Agenda | PASSOU | PASSOU | NÃO TESTADO |
| Sugestão da IA (filtro de trecho, posse, sem notas) | PASSOU (sem provedor real) | PASSOU | NÃO TESTADO — depende da chave de IA no DEV |
| Rodapé/nome de arquivo dos PDFs | PASSOU | PASSOU | NÃO TESTADO (abrir o PDF) |
| As 10 correções anteriores | testes existentes PASSARAM | ver 3.2 | NÃO TESTADO |
| Funil, Briefing, Mobiliário/Acervo, Floral, Pagamentos, Extrato, Cadernos (seção 4 do pedido) | suíte existente PASSOU | não reauditado além de 3.2 | NÃO TESTADO |
| Desktop × celular | — | classes de quebra conferidas na tela nova | NÃO TESTADO |

## 6. Roteiro curto para você testar (DEV, conta de teste)

No notebook: `pnpm dev` na branch e abrir `http://localhost:5173`, entrar
com a conta de teste. Use só eventos com "TESTE" no nome.

1. **Funil** → lead "TESTE Proposta" com data → criar proposta, pôr um item com valor, "Aceita".
2. **Converter em evento** → a data vem preenchida → abrir o evento: a etapa **"Orçamento e proposta" diz "Proposta aprovada"**, e a linha da Proposta mostra o valor.
3. Tocar "Converter" de novo no lead (se a tela permitir) → o mesmo evento, nenhum novo.
4. **Um evento convertido ANTES de hoje** que tinha proposta no lead → a Jornada agora mostra a proposta (nada foi gravado para isso).
5. **Evento → Reuniões → Nova reunião**: título, data de amanhã, 19:00, link `meet.google.com/abc-defg-hij`, salvar. Conferir em **/agenda** (7 dias) e tocar nela: abre a mesma reunião.
6. Reabrir → "Realizada" → escrever anotações com uma decisão clara e "fulana vai mandar X até sexta" → **Salvar** → "Sugerir resumo" → conferir que cada item mostra o trecho das notas, desmarcar um, "Acrescentar ao formulário", **Salvar**. As anotações têm de estar iguais.
7. Pendência: marcar feita, pôr prazo, salvar, recarregar a página.
8. Excluir uma reunião → o aviso diz o que se perde.
9. **Lead com data** → Editar → a data aparece; salvar sem mexer → continua lá.
10. **Folha de Carregamento** e **Ficha Técnica** de um evento com nome longo e acento ("TESTE Aniversário da Conceição — Fazenda Santa Bárbara") → rodapé sem encavalar, arquivo `carregamento-teste-aniversario-da-conceicao-...pdf`.
11. Repetir 2, 5 e 6 no celular (390 px).

## 7. Limitações e bloqueios

- **Navegador não validado** (seção 5) — é o próximo passo, e depende do seu login.
- **IA no DEV:** a sugestão usa a mesma configuração de IA das outras actions; se o DEV não tiver chave, ela responde "IA não configurada" e o registro manual segue. Não conferi as variáveis do DEV (não era necessário publicar).
- **Pendências de reunião não aparecem no Dashboard/Assistente** — só na tela do evento e da reunião.
- **Anexo por reunião:** não existe; arquivos ficam na Pasta do Evento.
- **"Trazer receitas do orçamento"** não aparece para proposta de evento antigo lida pelo lead (ver 3.1).
- O teste `event-form-dialog.test.tsx` é lento (≈1 s por caso) e estoura 5 s quando a máquina está carregada. Não alterado.
- Os avisos "Convex 1.42 → 1.46" e "AI files desatualizados" apareceram no publish; nada foi atualizado.

## 8. Pendências, por impacto

1. **Homologar no navegador** o roteiro da seção 6 (desktop e celular) — sem isso nada aqui está "funcionando", só testado.
2. Conferir a **chave de IA do DEV** antes de mostrar "Sugerir resumo".
3. Revisar e decidir a release (PROD) desta branch — **não** feita: `docs/release-producao.md`, backend antes do frontend.
4. Decisões em aberto do estudo de WhatsApp/acessos (seção 7.2 do estudo).
5. Herdadas de 14/10: consolidado de compras da ficha técnica sem cor/natural; extrato enorme lê tudo no navegador; despesa manual sem fornecedor estruturado.
