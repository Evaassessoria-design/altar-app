# Checkpoint — integração de novembro (24/11/2026)

Branch: `integration/altar-live-nov` · base comum: `main` @ `86dc253`
Estado: **verde e compatível com o DEV**, nada publicado em lugar nenhum.

Este documento é o que falta saber para publicar. O que o produto é e como ele
se organiza continua no `README.md`; o checkpoint anterior
(`checkpoint-consolidacao-reunioes-2026-10-15.md`) continua válido para a linha
da consolidação.

---

## 1. O que entrou

Duas linhas de desenvolvimento viviam separadas e agora são uma:

| Linha | Veio de | O que trouxe |
| --- | --- | --- |
| Consolidação + Reuniões | `feature/consolidacao-reunioes-15-10` | a reunião dentro do evento, com ata, decisões e pendências |
| Layout do salão | `feat/layout-2d-3d` | planta 2D editável, visão 3D, biblioteca de peças, modelos e PDF |

Mais três melhorias feitas nesta rodada (seção 4).

Commits, do mais antigo para o mais novo:

```
0b5ca45  merge(layout)      — a junção, com as três decisões de conflito
469614f  feat(painel)       — pendência de reunião no painel
fe085c4  feat(financeiro)   — fornecedor na despesa à mão; Agenda para de prometer
8955c8a  feat(sino)         — o aviso não espera até as 5h da manhã
```

## 2. Os três conflitos, e por que foram resolvidos assim

**a) Página do evento (`src/pages/app/events/[id]/page.tsx`).** A branch do
Layout pendurava o link dela no bloco de "Ações Rápidas", que saiu do produto
em 28/09. Manter o lado da consolidação resolvia o conflito e deixava a tela
nova **inalcançável** — com `ROTAS_SEM_MENU` afirmando que ela "é acessada de
dentro do evento". O Layout virou **etapa própria da Jornada** (a 11ª), entre o
Projeto e o Croqui: é a planta que ela desenha e manda para a cliente, então
tem lugar na régua do evento. `health.ts` lê os layouts no mesmo `Promise.all`
dos outros nove fatos — nenhuma varredura nova.

**b) `convex/escritorio.ts`.** A resolução pelo lado da consolidação derrubava
em silêncio a função `escritorio.comando` (que veio pelo PR #5) e deixava os
testes dela de pé. Função derrubada é função derrubada: `comando` foi
restaurada ao lado de `centroDeComando`. As duas respondem perguntas
diferentes — "o que está na minha mesa AGORA" × "o que aconteceu desde a última
vez que eu entrei" — e o comentário no arquivo diz isso.

**c) Contagem de tabelas (`arquitetura-sem-paralelos.test.ts`).** Reuniões
(15/10) e Layout (10/11) nasceram em branches separadas e **cada uma contou
"42 → 43"** na sua. Quem integra soma: são duas tabelas novas, o marco agora é
**44**, e as duas justificativas estão no arquivo.

Além disso, três diálogos do Layout usavam `max-h-[90vh]`/`[85vh]`. A trava
`dialogo-altura.test.ts` não existia na branch de origem, então ninguém avisou:
`vh` corta o rodapé do diálogo no celular com a barra do navegador aberta.
Viraram `dvh`.

## 3. Compatibilidade com o que o DEV já roda

Conferido contra o backend servido em `healthy-pika-907` (que roda a linha da
consolidação, 273 funções):

- **0** campos removidos do schema
- **0** tabelas removidas
- **0** funções removidas
- **9** funções novas: `layoutSalao.criar / duplicar / listarDoEvento /
  listarParaReaproveitar / obter / remover / salvar`,
  `layoutSalaoIa.rascunhoPorIa`, `escritorio.comando`
- **1** tabela nova: `eventLayouts`
- campos novos, todos opcionais e sem backfill: `transactions.supplier`

Nada que exista hoje no DEV deixa de existir. Publicar o backend desta branch
não pede migração nem apaga dado de ensaio.

## 4. As três melhorias desta rodada

Critério: coisa que a decoradora percebe no mesmo dia, sem funcionalidade nova
para aprender.

**Pendência de reunião no painel** (`469614f`). O que foi combinado na reunião
("a noiva manda a lista até sexta") nascia na ata e morria lá: quem não
abrisse *aquela* reunião não sabia que havia prazo. Agora o painel — primeira
tela do dia — traz um cartão "Combinado nas reuniões", com prazo, quem ficou
responsável e o caminho de volta para a reunião. Uma leitura indexada, teto de
500 reuniões dos últimos 180 dias, e a tela **diz** quando bateu no teto.
Fora: pendência feita, reunião cancelada, evento cancelado ou concluído.
Pendência sem prazo vai para o fim da fila e **não** é chamada de vencida.
6 testes adversariais (`convex/dashboard.reunioes.test.ts`).

**Fornecedor na despesa lançada à mão** (`fe085c4`). O extrato mostrava
fornecedor só quando a despesa vinha de uma compra; a lançada à mão saía sem.
`transactions.supplier` nasceu opcional, texto livre como em
`purchaseItems.supplier`, ausente = não informado, sem backfill. O extrato
prefere o que foi digitado e cai no fornecedor da compra ligada quando a
compra é da própria conta. O campo só aparece quando o lançamento é despesa.
6 testes adversariais (`convex/financeiro.fornecedor.test.ts`).

**O sino não espera até as 5h da manhã** (`8955c8a`). A varredura de avisos
roda uma vez por dia. Quem criava a conta às 10h, cadastrava o casamento de
sábado e abria o sino via vazio. `notifications.generateMyAlerts` existia para
exatamente isso e não tinha um único chamador; agora o sino a chama na
primeira abertura. 5 testes adversariais (`convex/notifications.sino.test.ts`).

No mesmo commit do financeiro: a Agenda do evento parou de prometer
"Google Agenda · Em breve". A promessa não tem data e estava na tela desde
agosto; agora o selo diz o que a Agenda realmente é — montada com os horários
que ela já preencheu. `src/lib/agenda.test.ts` trava o texto para que a
promessa não volte por descuido.

## 5. Validação

```
pnpm test                                  6.400 testes, 287 arquivos — passou
npx tsc -p tsconfig.app.json --noEmit      limpo
npx tsc -p convex/tsconfig.json --noEmit   limpo
pnpm lint                                  0 erros, 8 avisos (pré-existentes)
pnpm build                                 ok — a visão 3D fica em pedaço
                                           próprio de 506 kB, carregado só
                                           quando alguém abre o 3D
```

## 6. O que NÃO foi feito, e por quê

**Publicação no DEV: não executada.** Este contêiner não alcança
`*.convex.dev` / `*.convex.cloud` (CONNECT 403 do proxy de rede). Não foi
contornado. A publicação continua autorizada e pendente, backend primeiro,
frontend depois.

**Homologação no navegador: NÃO TESTADA.** Os sete roteiros (briefing,
mobiliário, cadernos, produção floral, parcelas, extratos, celular) pedem o
login dela e um backend alcançável. Nada aqui substitui isso, e nenhum item
abaixo deve ser lido como aprovado em tela.

**Não começado de propósito:** mapa de assentos e segundo usuário na conta.
Os dois são projeto, não ajuste — cada um muda regra de posse ou de cobrança e
não cabe num candidato que vai para PROD.

**Ficou na fila** (nada iniciado): lista de compras consolidada separada por
cor × natural/permanente; peças do Acervo na biblioteca do Layout; anexo por
reunião (precisa de upload com guarda de acesso e cascata de exclusão — é
médio, não pequeno).

## 7. Para publicar

PROD é `mellow-goose-539` e continua congelado em `5810dbd` (frontend) /
`5ec2c4c` (backend), desde 07/10. A ordem está em `docs/release-producao.md` e
não muda: DEV primeiro, homologação em tela, aprovação dela, depois PROD.
