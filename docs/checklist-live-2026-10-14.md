# Live de 14/10/2026, 19h30 (Brasília) — ensaio, dados, plano B e divulgação

Roteiro: `docs/roteiro-live-2026-10-14.md`. Estado conferido em 13/10.

---

## 1. Estado real do produto (13/10)

| Onde | O quê | Situação |
|---|---|---|
| **Publicado — clientes usam** | `www.appaltar.com.br`: frontend `5810dbd` (CSS `index-DwvYhOS9`, JS `index-CMEgTZdv`, aponta para `mellow-goose-539`), backend `5ec2c4c` | Funil e propostas; evento (saúde, jornada, briefing, checklist); **Pagamentos da cliente** (parcelas, recebimento parcial, comprovante, correção); Financeiro e Receita do mês; Acervo (reserva, saída, retorno, conferência); teste de 14 dias e assinatura. Funções conferidas no backend de PROD em 13/10 |
| **Pronto para publicar (aguarda o seu clique no Vercel)** | candidato de pagamentos `94df752` (`feature/evolucao-14-10`) — só frontend, CSS `index-BCAFzw3P` | Acrescentar parcelas com levas nomeadas e proteção contra duplicar; aviso de correção não concluída; diálogos de pagamento sem rolagem lateral |
| **Só no DEV** (`healthy-pika-907`) | `feature/producao-floral-ajustes` @ `ad73c75` | Produção floral. **Não publicada** — na live, só como "evolução em preparação" |
| **Próxima rodada** | — | Consolidado de compras da Ficha Técnica separando cor e natural/permanente; integração da floral |
| **Não mostrar** | Escritório, Painel Admin, Campanha, Central, Assistente | Aparecem no menu da sua conta — não clicar |

**Ambiente decidido:** site oficial, na sua conta. A DEMO não é usada (o
backend dela não tem Pagamentos).

---

## 2. Preparação dos dados — na sua conta, uma etapa por vez

Feita **por você**, no site. Nada de cliente real: telefones `(11) 90000-00xx`,
e-mails `@exemplo.com.br`. Registros que já existem (lidos em 13/10):

| Tela | O que já existe |
|---|---|
| Funil | **Matheus e Eva** — Em atendimento, Casamento, 14/02/2027, R$ 40.000 |
| Eventos | **Matheus e Eva** (Confirmado, 14/04/2027, Fazenda A Querência, orçamento R$ 50.000, sem parcelas); **Marina e Vinicius** (17/10/2026); **Larissa & Sathyel** (12/09/2026) |
| Propostas | **Proposta — Matheus e Eva**, rascunho, R$ 0 |
| Acervo | **Castiçais** 14 un; **Vaso para Orquídea** 20 un |

**Atenção:** o lead Matheus e Eva diz 14/02/2027 e R$ 40.000; o evento diz
14/04/2027 e R$ 50.000. Na live ninguém compara os dois, mas, se quiser
coerência, acerte o lead. O telefone do lead tem formato de número real: se
for, troque por um fictício ou não abra o card ao vivo.

### Passo 1 — Lead fictício com valor plausível
Funil → **Novo lead**:
- Nome: **Ana Clara & Rafael**
- Telefone: **(11) 90000-0001** · e-mail: **anaclara@exemplo.com.br**
- Tipo: **Casamento** · data: **22/05/2027** · orçamento: **R$ 38.000**
- Depois de salvar: **Registrar contato** ("Primeira conversa por WhatsApp;
  quer cerimônia no campo, tons terrosos") e **próxima ação** ("Enviar
  proposta").
- Avançar até **Proposta**. **Não converter** — a conversão é feita ao vivo.

### Passo 2 — Proposta preenchida
Propostas → **Proposta — Matheus e Eva** (o rascunho que já existe):
- Escopo: cerimônia + recepção, 120 convidados, arranjos de mesa e arco.
- Investimento: **R$ 48.000**.
- Condições: entrada de R$ 12.000 + 3 parcelas mensais de R$ 12.000.
- Validade: 15 dias.
- Abrir a prévia "como a cliente vê" e conferir que não aparece custo nem
  margem.

### Passo 3 — Evento com parcelas e recebimento parcial
Eventos → **Matheus e Eva** → **Pagamentos da cliente**:
1. **Valor contratado** → **R$ 48.000** → Definir.
2. **Planejar parcelas** → entrada **R$ 12.000** + **3 × R$ 12.000** mensais
   → conferir a prévia → Criar. **Uma vez só.**
3. Na entrada: **Registrar recebimento** de **R$ 6.000**, PIX → deve aparecer
   **"Parcialmente recebida"** (recebido R$ 6.000, falta R$ 6.000).

### Passo 4 — Comprovante fictício
Um arquivo pequeno no computador, `comprovante-ficticio.pdf`, escrito
"DOCUMENTO FICTÍCIO — SEM VALOR", sem nome, CPF ou banco reais. Fica na
área de trabalho e é **anexado ao vivo** (bloco 4). No ensaio, anexe e depois
remova pelo próprio diálogo — ou ensaie só até o botão.

### Passo 5 — Peças com reserva e retorno
1. **Matheus e Eva** → Acervo do evento → **Reservar peça** → **Castiçais**,
   10 un.
2. Para mostrar **retorno**: num evento que já passou (**Larissa & Sathyel**,
   12/09) → reservar **Castiçais**, 12 un → **Saiu** → **Voltou** →
   **Confirmar conferência**. Se o sistema não aceitar reserva em evento
   passado, usar **Marina e Vinicius** e me dizer o que apareceu.
3. **Vaso para Orquídea** fica sem reserva — é reservado ao vivo (bloco 5).

### Arquivos no computador
- `comprovante-ficticio.pdf`.
- Capturas de tela de cada bloco, para o plano B.

---

## 3. Checklist de ensaio

### Computador
- [ ] Passos 1 a 5 do §2 feitos e conferidos.
- [ ] Logo e nome do estúdio em Configurações.
- [ ] Roteiro cronometrado do começo ao fim (meta 35 min + perguntas).
- [ ] Cada "Se falhar" do roteiro ensaiado uma vez.
- [ ] Ensaio **sem** converter o lead e **sem** reservar o vaso (são ao vivo).
- [ ] Navegador: só as abas necessárias, zoom 100%, tela cheia, favoritos
      escondidos.
- [ ] Notificações do sistema desligadas; WhatsApp Web fechado.
- [ ] Plataforma da live testada com compartilhamento de tela e áudio.
- [ ] Se a publicação de pagamentos for promovida: refazer o bloco 4 (o botão
      "Acrescentar parcelas" aparece).

### Celular
- [ ] Mesma conta logada no celular (navegador ou instalado na tela inicial).
- [ ] Abrir: Início, Matheus e Eva, **Pagamentos da cliente**, detalhes da
      entrada, Acervo do evento — tudo sem rolagem lateral.
- [ ] Modo não perturbe ligado.
- [ ] Bateria acima de 80% e carregador por perto.
- [ ] Roteador 4G do celular testado (plano B da internet).

---

## 4. Plano B

Regra: **nunca tente duas vezes a mesma coisa ao vivo**. Diga em uma frase o
que aconteceu e siga para o plano B.

| Falha | Plano B |
|---|---|
| Internet caiu | Roteador 4G do celular; se a transmissão cair, voltar e continuar do bloco onde parou |
| Tela carregando sem parar | **F5 uma vez**. Se não voltar: capturas de tela daquele bloco |
| Conversão do lead falha | Mostrar o evento Matheus e Eva, que já existe |
| Comprovante não sobe | Seguir sem ele; mostrar o recebimento parcial e o saldo |
| Pagamentos não abre | Mostrar a mesma parcela no Financeiro |
| Acervo não abre | Lista do Acervo com a reserva já feita; contar o resto falado |
| Computador travou | Celular com a conta logada, compartilhando a tela do celular |

---

## 5. Divulgação

### Mensagem para enviar hoje (convite + inscrição)

> Oi, [nome]! Tudo bem?
>
> Amanhã, **14/10, às 19h30 (horário de Brasília)**, vou apresentar ao vivo o
> **ALTAR**, o sistema que criei para a rotina de quem decora eventos:
> atendimento, organização do evento, pagamentos da cliente em parcelas e o
> controle das peças do acervo — tudo num lugar só.
>
> Para receber o link e os lembretes, me responde com:
> **nome, empresa e e-mail**.
>
> Vai ser um prazer te ver lá!

### Lembrete para amanhã (manhã de 14/10)

> Bom dia, [nome]! É hoje: **apresentação do ALTAR às 19h30 (Brasília)**.
>
> O link é este: [LINK DA LIVE]
>
> Em uns 35 minutos eu mostro, na prática, como organizar atendimento,
> eventos, pagamentos e acervo. Até mais tarde!

### Lembrete opcional (30 min antes)

> Começamos em 30 minutos! Link: [LINK DA LIVE]

**Não enviar nada antes de decidir plataforma, link e forma de inscrição.**
As mensagens não citam preço nem condição comercial de propósito.

### Identidade para as peças (reais, do repositório)
- Logo: `brand/altar-arte-oficial.png` (arte oficial, 1254 × 1254) e
  `public/brand/altar-og.png` (1200 × 630, para link e redes).
- Cores: bege da arte **#E7D8C8**; cor dos documentos **#8B7355**; destaque
  da interface **#C49C76**; fundo **#F7F5F1**; texto **#1A1512**.
- Tipografia da interface: **Geist**; serifada de apoio **Noto Serif**.

---

## 6. Decisões pendentes

| Decisão | Situação |
|---|---|
| **Promover a publicação de pagamentos** | Opcional. Link e conferência em `checkpoint-evolucao-2026-10-11.md` (6ª rodada). Depois: conferir CSS `index-BCAFzw3P` no site |
| **Cota do Convex** | **Armazenamento de arquivos acima do Free: 1,14 GB / 1 GB** (outubro). Detalhes e opções no checkpoint, 6ª rodada |
| **Plataforma** | YouTube, Instagram, Google Meet, Zoom… (decida pelo que o público usa e pelo compartilhamento de tela) |
| **Link da live** | Criar na plataforma escolhida |
| **Forma de inscrição** | Responder a mensagem (manual) × formulário. A landing grava interessados, mas eles aparecem só no Painel Admin |
| **Condições comerciais** | Verificadas no código: 14 dias grátis sem cartão; R$ 119,90/mês (valor cobrado); PIX/boleto/cartão; cancelamento em Configurações. **A decidir:** a landing mostra "De R$ 149,90" riscado e "condição de fundadora" sem prazo — nenhum código cobra R$ 149,90 nem define até quando vale a condição |
| **E-mail oficial** | `altarapp.oficial@gmail.com` só conta como criado depois da sua confirmação (guia em `docs/email-oficial-altar.md`) |
