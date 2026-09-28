# Prontidão da live — estamos prontos?

**06/10/2026 · 19:00 BRT** · conferido em **28/09/2026**, com a demo
auditada no deployment `insightful-goldfish-950` ([`mapa-demo.md`](mapa-demo.md))

## STATUS GERAL: **AT RISK**

Não é porcentagem. É a regra abaixo aplicada à tabela abaixo — e quem mudar
um item muda o status junto, na mesma edição.

---

## A regra

| Status geral | Quando |
|---|---|
| **BLOCKED** | algum item **crítico** está bloqueado, ou passou do prazo sem estar feito |
| **AT RISK** | todo crítico está no prazo, mas algum ainda não está feito |
| **READY** | **todos** os críticos feitos, com evidência |

Itens **importantes** e **menores** nunca mudam o status geral. Dez itens
pequenos feitos não compensam um crítico aberto: se a conta de demonstração
não loga, não estamos "95% prontos" — estamos BLOCKED.

"Feito" exige a **evidência** da coluna, vista por alguém. Lembrar de ter
feito não é evidência.

---

## Críticos

| # | Item | Status | Evidência de feito | Dono | Prazo | Bloqueio |
|---|---|---|---|---|---|---|
| C1 | Conta de demonstração loga e abre `/dashboard` com os 13 eventos | ⬜ | login feito no computador da live; Dashboard conta 13 | operadora | T-3 (03/10) | dados prontos (13 eventos após C6). Falta o **login humano**, com a porta 5173 livre — o ALTAR Buffet ocupa a mesma porta ([`mapa-demo.md`](mapa-demo.md)) |
| C2 | Acesso da conta demo liberado (`internal`) e sem menu de admin | ✅ | `demo:prepararConta` em 28/09 → `internal`, `role: user`, `bloqueada: false`. Falta só abrir a conversão uma vez no ensaio | — | — | — |
| C3 | Fotos e capa de Marina & Gabriel | ⬜ | **"Pronto para mostrar?"** sem nenhum ✕ em fotos e capa | operadora | T-1 (05/10) | depende de C6 (resetar **antes** das fotos) |
| C4 | **Link da sala definido** em `LIVE_ALTAR.linkDaReuniao` (`convex/lib/campanha.ts`) | ⬜ | um lembrete de 24h preparado **sem pendência** em `/campanha` | dona do negócio | T-3 (03/10) | **decisão humana: qual é a sala.** Sem ele, confirmação e lembretes nascem com pendência e não podem ser aprovados |
| C5 | Correções de 28/09 publicadas **no deployment de demonstração** | ✅ código | 249 de 249 funções publicadas = código da branch (`0530dce`), conferido por `function-spec`. A resposta só muda de verdade depois de C6 | — | — | — |
| C6 | **Reset da demo** | ✅ | 28/09, autorizado por você: `resetou: true`; banco com 13 eventos, herói único, R$ 928.500 / 674.800 / 253.700, os vencidos do roteiro e o cenário do castiçal — conferido por leitura direta | — | — | **não resetar depois das fotos** |
| C7 | As duas perguntas do bloco 7 vistas respondendo | ⬜ | as duas respostas lidas inteiras, sem bobagem, **citando os vencidos** | quem apresenta | T-3 (03/10) | depende de C5 |
| C8 | Roteiro ensaiado inteiro, cronometrado | ⬜ | um ensaio de ponta a ponta dentro de 28–33 min | quem apresenta | T-1 (05/10) | depende de C1–C3 |
| C9 | Vídeo de contingência gravado e testado | ⬜ | abre e toca no computador da live | operadora | T-1 (05/10) | depende de C8 |
| C10 | Preço e CTA decididos e escritos | ⬜ | o texto está na landing; ninguém fala preço de improviso | dona do negócio | T-3 (03/10) | decisão de negócio |
| C11 | **Chave de IA no deployment da demo** | ⬜ | `npx convex env list --deployment altar-demo:dev` mostra `ALTAR_AI_API_KEY` e `ALTAR_AI_MODEL`; a resposta do bloco 7 NÃO traz o aviso de "por regra" | **você** | T-3 (03/10) | **segredo** — não se inventa e não se copia de produção sem decisão sua. Sem ela, o bloco 7 responde por regra (números certos, texto seco): funciona, mas não mostra IA |

## Importantes — não mudam o status

| # | Item | Status | Evidência | Prazo |
|---|---|---|---|---|
| I1 | Lista real de interessados importada em `/campanha` | ⬜ | a lista carrega; "Prioridade" ordena | T-3 |
| I2 | Os 10 modelos de mensagem lidos em voz alta | ⬜ | nenhum soa como robô | T-3 |
| I3 | Foto "Só para mim" para a fronteira do PDF | ⬜ | aparece no Projeto Visual, some no PDF | T-1 |
| I4 | `/escritorio` com dono da plataforma concedido | ⬜ | tela abre; hoje ninguém é dono em PROD ([`../release-producao.md`](../release-producao.md) §9) | quando decidir quem é |
| I5 | Segunda pessoa acompanhando o chat | ⬜ | nome combinado | T-1 |
| I6 | Teste no celular e no notebook da live | ⬜ | as 11 abas abertas nos dois | T-1 |

---

## Por bloco — onde olhar

| Bloco | Fonte |
|---|---|
| Produto e demo | [`mapa-demo.md`](mapa-demo.md), [`../checklist-demo-manual.md`](../checklist-demo-manual.md) |
| Roteiro | [`roteiro-curto.md`](roteiro-curto.md) |
| Assistente | [`perguntas-assistente.md`](perguntas-assistente.md) |
| Riscos e o que roda sozinho | [`riscos.md`](riscos.md) |
| Hora a hora | [`../checklist-pre-live.md`](../checklist-pre-live.md) |
| Quando algo cair | [`../plano-b-live.md`](../plano-b-live.md) |

## O que NÃO demonstrar — decidido, não esquecido

- **`/escritorio`, `/central`, `/admin`** — são o negócio ALTAR, não o produto
  da decoradora ([`roteiro-curto.md`](roteiro-curto.md))
- **Envio de mensagem** — nenhum canal está conectado, e dizer que está seria
  falso
- **Leitura de contrato e planta por IA ao vivo** — só o resultado já gerado
- **O centro de comando, o ciclo automático e a prioridade da campanha**
  (novos em 28/09) — são ferramentas do negócio ALTAR, não da decoradora;
  ficam para depois da live
- **Manutenção e pós-evento do acervo** (novos em 28/09) — reais, testados e
  **semeados** (Rafaela & Ian → Sofia & Tomás, ver
  [`mapa-demo.md`](mapa-demo.md)). Só aparecem depois de C5 (publicar) e de
  um reset. **Candidato a "UAU" no bloco 3**, se for ensaiado — não
  improvisar
