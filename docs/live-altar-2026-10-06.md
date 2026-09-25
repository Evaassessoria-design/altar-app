# Live ALTAR — 06/10/2026, 19:00

Roteiro, checklists e planos B da apresentação do ALTAR para decoradoras.

> Este documento descreve **o que existe no código hoje**, conferido em
> `24/09/2026`. Onde um recurso não existe, está escrito que não existe. Nada
> aqui deve ser prometido na live sem ter sido aberto antes.

---

## 1. Objetivo

Apresentar o ALTAR funcionando de ponta a ponta e sair da live com uma lista
de decoradoras interessadas, organizadas dentro do próprio produto.

A meta não é "mostrar funcionalidades". É que quem assiste reconheça o
**próprio dia de trabalho** na tela e pense "isso resolve o meu WhatsApp".

## 2. Público

Decoradoras e empresas de decoração de eventos — casamento em primeiro lugar,
mas também corporativo, aniversário e formatura. Gente que hoje trabalha com
planilha, pasta no Drive, Canva e conversas de WhatsApp espalhadas.

Não é público técnico. Nenhuma palavra do sistema ("tenant", "query",
"webhook") entra na apresentação.

## 3. Promessa

**Uma decoradora consegue vender, planejar, contratar, comprar, controlar o
dinheiro e entregar um projeto visual bonito — sem manter planilha, pasta
paralela e Canva.**

É a promessa que o produto sustenta hoje. Tudo que for demonstrado tem de
caber dentro dela.

---

## 4. Roteiro (28–33 min)

A ordem segue a **jornada de um casamento**, não o menu lateral. Cada bloco
responde a uma pergunta que a decoradora já se faz.

| # | Bloco | Tempo | A pergunta que ele responde |
|---|---|---|---|
| 0 | Abertura | 2 min | "Para quem é isto?" |
| 1 | Dashboard | 3 min | "O que precisa de mim hoje?" |
| 2 | Funil → proposta → evento | 5 min | "Como entra um casamento?" |
| 3 | Dentro do evento | 5 min | "Onde fica tudo de um evento?" |
| 4 | Fornecedores e compras | 4 min | "E o que eu contratei e comprei?" |
| 5 | Financeiro | 3 min | "Estou ganhando dinheiro neste evento?" |
| 6 | Projeto Visual + PDF | 6 min | "O que a noiva recebe?" |
| 7 | Escritório de IA | 3 min | "Preciso aprender o sistema todo?" |
| 8 | Encerramento e convite | 2 min | "Como eu entro?" |

### Bloco 0 — Abertura (2 min)
Uma frase sobre o problema: a decoradora tem sete lugares para a informação de
um casamento. Nenhum slide de arquitetura, nenhum organograma.

### Bloco 1 — Dashboard (3 min)
Abrir em **`/dashboard`**. Mostrar o painel de atenção: o que venceu, o que
está próximo, o que está incompleto. É a tela que prova que o sistema **olha
pela decoradora** em vez de esperar que ela procure.

### Bloco 2 — Funil → proposta → evento (5 min)
**`/funil`** → cartão do lead → **Proposta** (nasce com os dados do lead, sem
redigitar) → marcar **Aceita** → clicar em **"Aceita — criar o evento"**, que
abre a conversão daquele lead específico.

É o momento em que se mostra que **dado informado uma vez é reaproveitado**.

### Bloco 3 — Dentro do evento (5 min)
**`/eventos`** (a lista com a saúde de cada um) → abrir Marina & Gabriel →
Questionário (briefing) → itens de montagem por ambiente.

### Bloco 4 — Fornecedores e compras (4 min)
**`/eventos/:id/fornecedores`**: o dossiê da contratação — contrato e orçamento
de **cada** fornecedor, dentro do fornecedor. Depois **`/compras`**: o panorama
de todos os eventos.

### Bloco 5 — Financeiro (3 min)
**`/financeiro`**: o custo da compra virando despesa, o comprovante como
evidência, e a margem que **se cala** quando o custo está incompleto. Esse
último detalhe é um argumento forte: o sistema prefere não afirmar a afirmar
errado.

### Bloco 6 — Projeto Visual e o PDF (6 min) — **o clímax**
**`/eventos/:id/projeto`**: capa, conceito, paleta, ambientes com prateleiras
separadas (Contratado · Inspiração · Como ficou), flores e materiais com foto
vinda do catálogo, planta.

Depois **gerar o PDF dos noivos** e abri-lo na tela.

Mostrar a foto marcada **"Só para mim"** na Galeria e o fato de que ela **não
aparece** no documento. É a prova de que o sistema entende a diferença entre o
material interno e o que vai para a cliente.

### Bloco 7 — Escritório de IA (3 min)
**`/escritorio`**: fazer **duas** perguntas, não dez. Sugestões seguras:

- *"O que precisa da minha atenção hoje?"* (Gestão)
- *"Quais oportunidades estão paradas há mais tempo?"* (Comercial)

Mostrar que a resposta cita **as fontes consultadas** e que os agentes têm
proibições declaradas — não enviam mensagem, não mexem em dinheiro.

### Bloco 8 — Encerramento (2 min)
Como entrar, e o convite para o teste. **Não citar preço de improviso**: usar
o que estiver na landing.

---

## 5. Telas demonstradas, na ordem

1. `/dashboard`
2. `/funil`
3. `/propostas/:id`
4. `/eventos`
5. `/eventos/:id` (+ Questionário)
6. `/eventos/:id/fornecedores`
7. `/compras`
8. `/financeiro`
9. `/eventos/:id/fotos` (só para mostrar "Só para mim")
10. `/eventos/:id/projeto` + PDF
11. `/escritorio`

## 6. Conta que será usada

Uma conta de **demonstração**, com o casamento **Marina & Gabriel**.

**Nunca a conta da decoradora piloto.** São clientes reais dela, com nomes,
telefones e valores reais.

O seed vive em `convex/demo.ts` e tem três travas: exige `ALTAR_DEMO=1`,
recusa banco com sinal de produção e é idempotente.

---

## 7. Dados que precisam existir ANTES — e o que falta hoje

O seed de demonstração cria 18 tabelas: evento, briefing, checklist,
fornecedores, compras, financeiro, orçamento, itens de montagem, equipe,
acervo, materiais, composições, lead e proposta.

**Ele NÃO cria fotos (`eventPhotos`) nem contrato (`contracts`).**

Isso tem consequência direta no roteiro:

| Bloco | Efeito se nada for feito |
|---|---|
| 6 — Projeto Visual | Abre **sem capa e sem prateleiras de foto**. O clímax da demo fica vazio |
| 6 — PDF dos noivos | Sai só com texto, sem imagem |
| 6 — "Só para mim" | **Impossível demonstrar**: não há foto para marcar |
| 3 — saúde do evento | O critério "Contrato anexado" fica vermelho |
| 4 — dossiê do fornecedor | Sem contrato/orçamento para mostrar |

### Tarefa manual obrigatória antes da live

Na conta de demonstração, **à mão**, pela interface:

1. subir **8 a 12 fotos** de referência na Galeria de Marina & Gabriel;
2. classificar cada uma com **ambiente** (Cerimônia, Salão, Mesa do bolo) e
   **escopo** (Contratado / Inspiração);
3. escolher uma **capa**;
4. marcar **uma** foto como **"Só para mim"** — é ela que prova a fronteira;
5. apontar a foto de **um item de montagem** para uma foto da Galeria (mostra
   o reaproveitamento, sem segundo upload);
6. subir **um PDF** como contrato do evento e **um** como orçamento de um
   fornecedor;
7. subir **uma foto** em 3 ou 4 materiais do catálogo (rosa, lisianthus,
   eucalipto) — é o que faz a seção "Flores e materiais" aparecer.

Sem os itens 1–4, **o bloco 6 não deve ser apresentado**.

---

## 8. O que NÃO demonstrar

Nada disto deve aparecer ao vivo:

- **Central de Comunicações** (`/central`) — o envio externo está desligado por
  decisão (`ALTAR_CENTRAL_ENVIO_HABILITADO`), e mostrá-la sugere um recurso de
  WhatsApp que não existe.
- **Painel administrativo** (`/admin`) — contém contas, receita e os leads da
  própria live. É a operação da ALTAR, não do produto.
- **Leitura de contrato por IA** e **planta por IA** — dependem de chamada
  externa que pode demorar ou falhar no meio da apresentação. Se houver tempo e
  vontade, mostrar o **resultado já gerado**, nunca gerar ao vivo.
- **Importação de leads** — é ferramenta interna da ALTAR.
- **Qualquer conta real** de cliente.
- **Preço de improviso** — só o que estiver escrito na landing.

## 9. Plano B — se a IA falhar

O Escritório depende de uma chamada externa. Se ela demorar ou falhar:

1. **Não insista.** Uma segunda tentativa ao vivo custa trinta segundos de
   silêncio.
2. Diga a frase pronta: *"a IA está fora agora; o que ela faz é ler o que já
   está aqui e resumir — e é exatamente isso que eu acabei de mostrar à mão"*.
3. Vá direto ao **bloco 8**.

O bloco 7 é o **único** dependente de IA. Todo o resto do roteiro funciona com
o banco e o navegador.

## 10. Plano B — se a internet cair

1. Ter a demonstração **gravada em vídeo** (15 min, mesma ordem) num arquivo
   local. Gravar até **04/10**.
2. Ter o **PDF do Projeto Visual** já gerado e salvo no computador.
3. Se a queda for curta: falar sobre o problema que o ALTAR resolve — é
   conteúdo, não enrolação.
4. Se for longa: passar o vídeo e abrir para perguntas.

---

## 11. Checklist — 24 horas antes (05/10)

- [ ] Conta de demonstração aberta e conferida, **tela por tela**, na ordem do
      roteiro
- [ ] Os 7 itens da seção 7 executados
- [ ] PDF dos noivos gerado e conferido — sem foto interna, sem custo
- [ ] Vídeo de contingência gravado e salvo **fora da nuvem**
- [ ] Landing conferida: o que ela promete é o que será mostrado
- [ ] Campanha `live-altar-2026-10-06` existindo no painel
- [ ] Suíte verde: `pnpm test`, typecheck, lint, build
- [ ] Notificações do sistema operacional **silenciadas**
- [ ] Testar em **outro** navegador, com a conta logada

## 12. Checklist — 1 hora antes

- [ ] Reiniciar o computador
- [ ] Fechar tudo: e-mail, WhatsApp Web, Slack
- [ ] Abrir **só** as abas do roteiro, na ordem, já logadas
- [ ] Zoom do navegador em **125%** — quem assiste pelo celular precisa ler
- [ ] Tema **claro** (contraste melhor em transmissão)
- [ ] Testar áudio e compartilhamento de tela
- [ ] Água por perto
- [ ] Vídeo de contingência aberto num player, minimizado

## 13. Checklist — 15 minutos antes

- [ ] Abas na ordem, uma por bloco
- [ ] Recarregar a tela do bloco 1 (dados frescos)
- [ ] Celular no silencioso, longe da mesa
- [ ] Alguém de confiança acompanhando o chat
- [ ] Link de inscrição **copiado**, pronto para colar no chat

---

## 14. Follow-up pós-live

O produto já suporta isto — é para usar, não para improvisar.

### Na mesma noite
1. Exportar a lista de participantes da plataforma da transmissão
2. **Painel → Interessados no ALTAR → Importar lista**, com:
   - campanha: **Live ALTAR**
   - origem: **Live**
3. Conferir o preview antes de confirmar (quem já existe é pulado)

### No dia seguinte
4. **Painel → Interessados → Live ALTAR → fila de contato**: a mensagem de
   cada pessoa já vem escrita
5. Revisar, **copiar**, enviar **você mesma** — o ALTAR não envia nada
6. Marcar **"Já falei com ela"** conforme for enviando

### Na semana
7. Mover as etapas: *Interessado → Testando → Cliente*
8. Acompanhar as sete contagens no topo do painel

### Perguntas que o painel responde sem planilha
Quantos leads a live trouxe · quantos ainda não tiveram contato · quantos
demonstraram interesse · quantos confirmaram · quantos participaram · quantos
estão testando · quantos viraram clientes.

---

## 15. Riscos conhecidos

| Risco | Gravidade | Mitigação |
|---|---|---|
| Demo sem fotos | **Alta** | Seção 7, obrigatória |
| IA lenta ou fora | Média | Seção 9 — bloco 7 é descartável |
| Internet instável | Média | Seção 10 — vídeo gravado |
| Mostrar `/admin` por engano | **Alta** | Abrir só as abas do roteiro |
| Falar preço de improviso | Média | Só o que está na landing |
| Conta da piloto aberta por engano | **Alta** | Sair da conta dela antes |
