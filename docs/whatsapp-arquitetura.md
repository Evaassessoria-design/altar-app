# WhatsApp: o que existe, o que falta, e por que a porta está fechada

> Código conferido em **25/09/2026**.

**Resposta curta: o ALTAR não envia mensagem para ninguém.** Ele prepara o
texto; quem envia é uma pessoa, pelo aparelho dela.

Este documento explica como a arquitetura está pronta para mudar isso sem
reescrever o produto — e por que mudar isso exige quatro coisas independentes,
não uma.

---

## 1. A camada de canal já existe

`convex/lib/channels/tipos.ts` define o contrato `AdaptadorDeCanal`:

| Método | Responde a |
|---|---|
| `configurado()` | As credenciais estão neste ambiente? |
| `desafioDeVerificacao(url)` | Handshake de verificação da plataforma |
| `verificarEntrada(corpoCru, headers)` | A assinatura confere? |
| `normalizar(corpo)` | Payload da plataforma → `MensagemNormalizada` |
| `chaveDeDeduplicacao(msg)` | Este lote já foi processado? |
| `prepararEnvio(destino, texto)` | Como este canal quer ser chamado |

**A Central não conhece WhatsApp.** Ela conhece `MensagemNormalizada`. Tudo o
que é específico de um canal mora num arquivo por canal, e trocar de provedor é
escrever um arquivo em `lib/channels/` mais uma linha em `registro.ts`. Nenhuma
tabela, nenhum índice, nenhuma query e nenhuma tela mudam.

`whatsapp.ts` está escrito, para a Cloud API da Meta. Não há credenciais neste
ambiente, então `configurado()` devolve `false` e o gateway responde 503 em vez
de aceitar mensagem que não consegue autenticar. **Porta não configurada fica
fechada, nunca aberta.**

### `prepararEnvio` devolve uma requisição, não a executa

O adaptador monta `{ url, metodo, headers, corpo }` e devolve. Quem chamaria
`fetch` é `communicationsOutbox.ts`, e ele só chega lá depois de quatro
verificações — a primeira das quais retorna antes, sempre, hoje.

---

## 2. Os cinco estados honestos

`lib/channels/situacao.ts` traduz ambiente + portão + histórico em um destes:

| Estado | Significa | Recebe | Envia |
|---|---|---|---|
| `nao_configurado` | Sem adaptador ou sem credencial | não | não |
| `configurado` | Credencial existe, portão fechado | **sim** | não |
| `homologando` | Portão aberto, nada entregue ainda | sim | sim |
| `ativo` | Portão aberto e entrega confirmada | sim | sim |
| `erro` | A última tentativa falhou | sim | não |

**Hoje: `nao_configurado`.**

### Por que cinco e não um booleano

`configurado()` responde "tem credencial?". É a pergunta certa para o gateway
decidir entre aceitar e devolver 503, e a **errada** para uma tela.

Entre "não tem credencial" e "manda mensagem" existem três estados que importam
para quem opera. Um booleano mostra `configurado ✓` nos três, e alguém conclui
que o WhatsApp está funcionando. Na noite da live, isso vira trinta mensagens
que ninguém mandou e ninguém recebeu — e o erro só aparece quando alguém
reclama de não ter sido avisada.

Duas regras que os testes guardam:

- **Entrega não medida não vira "ativo" por otimismo.** `undefined` é "ninguém
  contou", não "zero".
- **Falha com o portão fechado não vira "erro".** O portão é a causa, e chamar
  isso de erro mandaria alguém procurar defeito numa política deliberada.

---

## 3. O portão de saída

`lib/central/autonomia.ts` tem a única autorização de saída da Central, em
função pura, com quatro travas **independentes**:

1. A aprovação está aprovada — *a decisão existe*
2. Tem autor humano registrado — *a decisão tem dono*
3. `ALTAR_CENTRAL_ENVIO_HABILITADO === "true"` — *o ambiente permite*
4. A janela de resposta do canal está aberta — *o canal aceita*

Independentes de propósito: cada uma sozinha barra a saída. Derrubar a política
atual exigiria derrubar as quatro ao mesmo tempo.

`podeEnviarSemAprovacao` devolve **`false` para todos os níveis**, inclusive
"autonomo". Não é um `TODO`: é a política vigente, expressa em código e coberta
por teste, para que ligar autonomia por acidente seja impossível — inclusive se
alguém gravar o nível "autonomo" no banco antes da hora.

Só a string exata `"true"` habilita. `"1"`, `"sim"`, `"TRUE "` com espaço e a
variável ausente mantêm o portão fechado. **Env var mal digitada nunca pode ser
interpretada como autorização.**

---

## 4. A campanha NÃO passa por aqui

Esta é a parte que mais importa entender.

Os rascunhos da campanha vivem em `campaignDrafts`, e **não** em
`adminApprovals`. A fila da Central parecia o lugar óbvio — já tem proposta,
aprovação, recusa e autor da decisão.

É exatamente por isso que não serve. `adminApprovals` existe **ligada à porta de
saída**. No dia em que essa porta abrir para responder UMA cliente, tudo o que
estiver naquela fila fica elegível a sair. Trezentos convites de campanha na
mesma fila virariam um disparo em massa acionado por uma decisão que era sobre
outra coisa.

`campaignDrafts` não tem `conversationId`, não tem `vertical`, não tem executor,
e ninguém a lê do lado do outbox. Há trava de leitura de fonte cobrando isso em
`convex/rascunhos.campanha.test.ts`.

`enviado_manualmente` é **anotação**: uma pessoa marcando que mandou com o dedo
dela. O nome é longo de propósito — o dia em que alguém encurtar para "enviado"
é o dia em que o estado passa a parecer algo que o sistema faz.

---

## 5. O que impede WhatsApp automático, em ordem

### 1. Credencial — BLOQUEADO

Não há conta Meta Business com número verificado. Sem isso não há nem envio nem
recebimento.

### 2. Template aprovado pela Meta — NÃO EXISTE

A Meta exige template aprovado para **iniciar** conversa fora da janela de 24
horas. Toda mensagem de campanha é iniciação de conversa.

Os dez modelos deste repositório **não são** templates da Meta. São texto para
uma pessoa copiar, e nenhum foi submetido a aprovação. Submeter é um processo
com prazo próprio, fora do controle do código.

### 3. O portão — desligado por decisão

Ver §3. É a única das quatro que se resolve com uma variável de ambiente — e
resolvê-la sozinha não abre nada, porque as outras três continuam de pé.

### 4. O caminho não existe — por desenho

Ver §4. Mesmo com 1, 2 e 3 resolvidos, não há código que leve um
`campaignDraft` até o outbox. Construí-lo seria uma decisão de produto
deliberada, revisável em diff, e não um efeito colateral de configurar
credenciais.

---

## 6. Quando houver provedor, o que muda

1. Credenciais no ambiente → `configurado()` passa a `true`, o gateway aceita
   entrada, e a situação vira `configurado`.
2. O classificador de respostas (`lib/respostaDoInteressado.ts`) já está pronto
   e testado. Ligá-lo é chamá-lo no gateway — ele é função pura hoje, e é
   função pura porque isso o torna testável sem rede.
3. `ALTAR_CENTRAL_ENVIO_HABILITADO=true` → situação vira `homologando`, nunca
   `ativo`: só uma entrega confirmada muda isso.
4. Envio de campanha continua exigindo decisão de produto explícita.

**Nada disso deve acontecer antes de 06/10.** A campanha da live foi desenhada
para funcionar com uma pessoa copiando e colando — e funciona.

---

## 7. E-mail

**NÃO EXISTE.** Nenhum provedor, nenhum adaptador, nenhum envio.

O contrato `AdaptadorDeCanal` já prevê `email` como canal (`lib/channels/tipos.ts`),
e `registro.ts` tem a linha comentada esperando a fábrica. Escrever o adaptador
é um arquivo.

Os modelos de confirmação e lembrete já são marcados como canal `email` na
biblioteca — e, sem provedor, a fila mostra a pendência "este modelo é de
e-mail, e só há WhatsApp gravado" quando é o caso, em vez de preparar um
rascunho que não tem para onde ir.
