<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

---

# ALTAR — o que um agente precisa saber antes de mexer

Leia o `README.md` primeiro: arquitetura, comandos, DEV × PROD, regras de
segurança, convenções, módulos e como testar estão lá, e é lá que se atualiza.

Este arquivo guarda só o que costuma ser esquecido no meio de uma tarefa.

## As seis travas

1. **PROD é `mellow-goose-539`. Não se toca.** DEV é `healthy-pika-907`.
   Confirme o alvo antes de qualquer `convex deploy`, `env set` ou `run`.
2. **Id vindo do navegador não é prova de posse.** Toda função que recebe
   `v.id(...)` confere o dono (`requireEventOwner`, `requireLeadOwner`,
   `requireAdmin`). Dado de outra conta responde `NOT_FOUND`.
3. **O paywall é do servidor** (`lib/accessGuard.ts`): criar evento, converter
   lead, enviar arquivo e IA. Nunca o caminho de volta (perfil, logo, checkout).
4. **Envio externo da Central tem uma porta só** (`communicationsOutbox`) e ela
   está fechada. Não ligue, não contorne, não aumente autonomia da IA.
5. **A Central não enxerga `leads`** — esses são clientes da decoradora.
6. **Escritório ≠ Assistente.** `/escritorio` é o painel do NEGÓCIO ALTAR
   (`requirePlatformOwner`, uma conta só). `/assistente` é a IA da decoradora
   sobre a empresa dela. Ninguém vira dono da plataforma por ser admin, interno,
   beta ou dono do próprio tenant.

## Como escrever aqui

- Campo novo nasce **opcional**, com o significado do "ausente" escrito no
  schema. Sem backfill.
- Estado derivável é **derivado**, não gravado.
- Filtro entra na **consulta**; filtrar a página já carregada faz a tela mentir.
- Varredura global **pagina** — `take(500)` sobre `users` para em silêncio.
- A tela nunca afirma o que não sabe ("25 carregadas (há mais)", "sem prazo").
- Comentário explica o **porquê** e o defeito que o motivou. É o padrão do
  repositório inteiro; mantenha.
- Teste novo é **adversarial**: id de outra conta, conta bloqueada, mutation
  repetida, paginação no limite. Caminho feliz não protege nada.

## Antes de terminar

```bash
pnpm test && npx tsc -p tsconfig.app.json --noEmit \
  && npx tsc -p convex/tsconfig.json --noEmit && pnpm lint && pnpm build
```

Teste de fronteira que quebrou (`central.fronteiras.test.ts`,
`posicionamento.test.ts`, `produto-generico.test.ts`) é aviso, não obstáculo:
leia o que ele protege antes de mexer nele.
