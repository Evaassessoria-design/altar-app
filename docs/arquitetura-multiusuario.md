# Duas pessoas na mesma conta — o que custaria

**Status: análise. Nada aqui foi implementado, e nada aqui deve ser
implementado sem uma decisão de produto explícita.**

O `README.md` diz, em letras grandes: *"Não reintroduza `organizationId` sem uma
decisão explícita de produto."* Este documento não pede essa decisão. Ele
responde à pergunta que vem antes dela: **se um dia quisermos, o que já está
pronto, o que quebraria, e qual é o menor caminho?**

Escrito porque a pergunta chega de fora — a decoradora com uma sócia, a que tem
uma assistente, a que quer que a florista veja só a Ficha Técnica — e a resposta
"não dá" é diferente de "dá, e custa isto".

---

## 1. O que existe hoje, em uma frase

**Uma conta é uma pessoa.** `users` é a empresa, o login e o assinante ao mesmo
tempo. Quem paga é `users`; quem entra é `users`; o dono de cada linha de dado é
`users`.

Não há tabela de organização, não há convite, não há papel dentro da conta —
`users.role` existe, mas distingue `admin` (quem opera o ALTAR) de `user` (a
decoradora), e não tem nada a ver com hierarquia dentro de um estúdio.

Uma tentativa de migrar para multi-tenant foi revertida antes de existir produto
(PR #2 do repositório).

### O que `teamMembers` é — e o que ele não é

`teamMembers` parece a resposta e não é. Ele é um **cadastro**, não um acesso:

| `teamMembers` é | `teamMembers` não é |
| --- | --- |
| Nome, papel e telefone de quem monta | Uma conta de login |
| A quem escalar num evento (`eventTeam`) | Alguém que consegue abrir o ALTAR |
| Quem é responsável por uma compra | Alguém com senha, sessão ou permissão |

A florista está cadastrada em `teamMembers` desde sempre. Ela nunca entrou no
sistema, e nada no schema prevê que ela entre.

---

## 2. Quanto do schema já suporta

**Bem mais do que parece.** De 36 tabelas:

- **22 carregam `userId`** — todo o dado da decoradora;
- **10 tabelas da Central** (`communication*`, `admin*`, `customerVoiceSignals`,
  `integrationEvents`) **não carregam e não devem carregar**: são do ALTAR, não
  de nenhuma decoradora, e a fronteira está travada por teste
  (`central.fronteiras.test.ts`);
- `users`, que é a própria conta;
- 3 não são de ninguém (`landingLeads`, `deletedAccounts`,
  `asaasWebhookEvents`).

As 22 tabelas com `userId` são:

```
events            leads             leadDocuments     briefings
checklistItems    teamMembers       eventTeam         contracts
purchaseItems     budgetItems       eventPhotos       transactions
notifications     suppliers         eventSuppliers    materials
collectionItems   collectionAdjustments  collectionReservations
compositions      assemblyItems     layoutRenders
```

E os índices já estão do jeito certo: **24 índices começam por `userId`**
(`by_user`, `by_user_search`, `by_user_date`, `by_user_stage`, …). Nenhuma
consulta de decoradora varre a tabela inteira e filtra depois.

Isso importa mais do que parece: a forma `["userId", …]` é exatamente a forma
`["studioId", …]`. **A troca seria de nome, não de estrutura.**

---

## 3. O que realmente depende de `userId` ser "a pessoa"

Aqui está a parte que o schema esconde. `userId` hoje acumula **quatro papéis**
que uma conta com duas pessoas precisa separar:

| Papel | Onde vive | O que aconteceria com duas pessoas |
| --- | --- | --- |
| **Quem paga** | `users.subscriptionStatus`, `trialEndDate`, `asaasCustomerId` | A assinatura é da EMPRESA, não de cada pessoa. Duas linhas de `users` seriam duas assinaturas. |
| **Quem entra** | `users.betterAuthId` → Better Auth | Cada pessoa precisa do seu login. Hoje: uma conta, um login. |
| **De quem é o dado** | `userId` nas 22 tabelas | Precisaria virar "de qual ESTÚDIO é o dado". |
| **A marca no documento** | `users.studioName`, `logoStorageId` | É do estúdio. Já está no lugar errado hoje. |

O terceiro é o único que o schema resolve com um `rename`. Os outros três são
decisões de produto, não de banco:

- **Cobrança**: por conta, por pessoa, ou por conta com teto de pessoas? Quem
  cancela? Quem some se o cartão falha?
- **Login**: convite por e-mail? Quem pode convidar? O que acontece com o dado
  de quem sai?
- **Papéis**: a assistente edita o financeiro? A florista vê a margem?

**Nenhuma dessas perguntas tem resposta técnica.** É por isso que este documento
para aqui e não propõe um plano de execução.

---

## 4. A migração mínima, se a decisão vier

A forma menos arriscada **não é** trocar `userId` por `studioId` nas 22 tabelas.
É acrescentar **uma indireção** e deixar `userId` onde está:

```
users                          (não muda: é a PESSOA e o login)
  └─ studioId?: Id<"studios">  (campo NOVO, opcional — a conta a que ela pertence)

studios                        (tabela NOVA)
  ├─ ownerId: Id<"users">      (quem criou e quem paga)
  ├─ nome, logoStorageId       (a marca, que hoje mora em `users`)
  └─ subscription*             (a assinatura, que hoje mora em `users`)
```

E a resolução de posse passa a ser **uma função, não um campo**:

```ts
// O que hoje é `event.userId !== user._id`
// passaria a ser `!mesmoEstudio(event.userId, user)`
```

Por que assim:

1. **Campo novo nasce opcional, com o significado do ausente escrito no
   schema** — é a regra do repositório (`CLAUDE.md`). `studioId` ausente
   significa "conta de uma pessoa só", que é 100% das contas hoje. **Sem
   backfill.**
2. **Nenhuma linha de dado muda.** Os 22 `userId` continuam apontando para quem
   criou. O que muda é a PERGUNTA: de "é meu?" para "é do meu estúdio?".
3. **Um único ponto de verdade.** `convex/lib/identity.ts` já é o módulo único
   de identidade, e as 4 funções de posse (`requireEventOwner`, `getOwnedEvent`,
   `requireLeadOwner`, `getOwnedLead`) são chamadas **38 vezes** no backend.
   Mudar a regra é mudar essas 4 funções, não as 38 chamadas.
4. **Reversível.** Sem `studios`, tudo continua funcionando como hoje.

### O que NÃO daria para adiar

- **`requireUser` filtrando por `userId` direto.** São **85 chamadas**, e boa
  parte faz `withIndex("by_user", q => q.eq("userId", user._id))` logo depois.
  Cada uma dessas precisaria virar "os userIds do meu estúdio" — e aí o índice
  `["userId"]` deixa de bastar, porque uma consulta por estúdio com N pessoas
  vira N consultas ou um índice novo. **É aqui que o custo real mora**, não no
  `rename`.
- **A cobrança.** Mover `subscriptionStatus` de `users` para `studios` toca
  `lib/access.ts`, `lib/accessGuard.ts`, o webhook do Asaas, a reconciliação
  diária e o painel admin. É a parte que mexe com dinheiro e a que menos pode
  errar.

---

## 5. Os riscos de IDOR que isso abriria

Hoje o isolamento é simples de verificar porque a pergunta é binária: *este
registro tem o meu `userId`?* Com estúdio, a pergunta vira *este registro
pertence a alguém do meu estúdio?* — e toda pergunta com mais passos tem mais
lugar onde esquecer um.

Os pontos concretos, em ordem de gravidade:

1. **A função de posse que não foi trocada.** Se uma das 38 chamadas continuar
   comparando `userId` direto, ela fica MAIS restrita que o resto — a sócia não
   enxerga o evento da outra e o produto parece quebrado. É o erro benigno.
2. **A consulta que filtra por `userId` na mão.** As 85 chamadas de
   `requireUser` seguidas de filtro próprio. Se uma passar a aceitar "qualquer
   um do estúdio" sem conferir o estúdio, vaza entre contas. **É o erro
   perigoso, e é silencioso.**
3. **`requireTeamMember`.** Já existe e já confere `membro.userId !== userId`.
   Com estúdio, teria de conferir o estúdio — senão um id do navegador pendura
   a equipe de outra empresa.
4. **Os arquivos.** São **25 chamadas de `ctx.storage.getUrl`**. A URL do Convex
   é um endereço público: quem a tem, abre. Hoje isso é aceitável porque só o
   dono recebe a URL. Com papéis dentro da conta ("a florista não vê o
   contrato"), a URL entregue a alguém com menos permissão não tem como ser
   revogada. **Papel que restringe leitura de arquivo é incompatível com o
   modelo de storage atual** — e isso é uma restrição real, não um detalhe de
   implementação.
5. **O convite.** Toda funcionalidade de convite é uma porta de entrada nova.
   Um convite que não expira, que pode ser reenviado por quem não é dono, ou que
   aceita um e-mail sem verificação (a verificação está **desligada** nesta
   fase, conforme `convex/auth.ts`) é a forma mais direta de alguém entrar numa
   conta que não é dele.

### O que já protege

`tenant.isolation.test.ts` lê o código e exige que **toda função pública** tenha
um dos guardas de posse, com cada exceção declarada por escrito. Ele foi feito
exatamente contra o esquecimento do item 2 — e continuaria valendo, porque a
lista de guardas é a mesma.

---

## 6. Dá para fazer por partes?

**Dá — e a ordem importa mais do que o prazo.**

| Etapa | O que entrega | Risco |
| --- | --- | --- |
| **0. Nada** | Onde estamos. Uma conta, uma pessoa. | — |
| **1. Segundo login, mesmo acesso** | A sócia entra com o login dela e vê tudo. Sem papéis. | Médio: mexe em posse e em cobrança. |
| **2. Papéis de escrita** | A assistente edita o operacional, não o financeiro. | Médio: é regra de negócio, e cabe em módulo puro. |
| **3. Papéis de leitura** | A florista vê só a Ficha Técnica. | **Alto**: esbarra no item 4 acima (arquivos). |

A etapa 1 sozinha já atende a maior parte do pedido real ("minha sócia precisa
entrar"). A etapa 3 é a que parece pequena e não é.

**O que NÃO dá para fazer por partes:** mover a assinatura. Ou ela é da pessoa
ou é do estúdio; não há meio-termo que não produza duas contas cobradas pela
mesma empresa.

---

## 7. A resposta curta, para quando alguém perguntar

> **"Dá para minha sócia ter o login dela?"**
>
> Hoje não. O ALTAR é de uma pessoa por conta, e a senha é compartilhada ou nada
> é compartilhado.
>
> O banco já está quase pronto para isso — 22 tabelas com dono e 14 índices na
> forma certa. O que falta não é tabela, é decisão: quem paga, quem convida,
> quem pode o quê. Enquanto essas três não tiverem resposta, mexer no código
> criaria três respostas erradas.

---

## 8. O que este documento não é

- **Não é um plano.** Não há estimativa, não há sequência de PRs, não há schema
  pronto para copiar.
- **Não é um pedido.** A decisão é de produto, e ela custa mais do que o código.
- **Não autoriza nada.** Em particular, não autoriza reintroduzir
  `organizationId` — a proibição do `README.md` continua valendo, e este texto
  existe justamente para que ela possa ser revista com os números na mão em vez
  de no escuro.
