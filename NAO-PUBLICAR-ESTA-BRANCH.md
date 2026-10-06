# NÃO PUBLIQUE ESTA BRANCH DEPOIS DO PRIMEIRO USO REAL DO RELEASE DE OUTUBRO

`release/reversao-2026-10` é o código do hotfix `50926a8` com o schema do
release de outubro. O Convex ACEITA publicá-la por cima dos dados novos —
e é exatamente isso que a torna perigosa: aceitar o schema não é preservar
as regras.

Depois que alguém usar as novidades em PROD, este backend:

- **ignora recebimentos parciais** — o Financeiro volta a somar só parcela
  com `isPaid`, e a parcela parcial aparece como pendente inteira;
- **permite alterações incompatíveis nesses pagamentos** — `togglePaid`,
  a baixa manual e a exclusão voltam a valer em parcela com recebimentos,
  desencontrando `isPaid` do histórico ou apagando o histórico junto;
- **considera disponíveis peças em reparo, limpeza ou conferência** no acervo;
- deixa sem efeito o descadastro de campanha e devolve o Escritório a admin.

Antes do primeiro uso real ela é desnecessária: o `50926a8` puro volta.
Depois dele ela é insegura. A estratégia de reversão está em
`docs/release-2026-10-candidato.md` (branch `release/2026-10-candidato`),
seção 8, e o critério é `scripts/release/primeiro-uso.mjs`.
