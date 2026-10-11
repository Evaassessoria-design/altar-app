# Checkpoint — evolução para a live de 14/10 (11/10/2026)

## Onde está

| O quê | Estado |
|---|---|
| Repositório | `Evaassessoria-design/altar-app`, PC da Eva |
| PROD frontend | `5810dbd` — CSS no ar `index-DwvYhOS9.css` (conferido em 11/10 com `curl`) |
| PROD backend (`mellow-goose-539`) | `5ec2c4c` — o `5810dbd` não mudou backend |
| Branch de trabalho | `feature/evolucao-14-10`, a partir do `5810dbd` — **só local/GitHub, nada publicado** |
| `main` | `86dc253` — sem merge |
| Produção floral | `origin/feature/producao-floral` (`fd7deae`), 4 commits sobre o `5810dbd` — **não integrada** |

## O que mudou nesta rodada

1. **Acrescentar parcelas** (`37a19cd`). Num evento que já tem parcelas, o
   botão e o diálogo viram "Acrescentar parcelas": listam as já lançadas,
   dizem quanto o total parcelado passa a somar e avisam (sem bloquear) quando
   passa do contratado. As novas se chamam "Parcela adicional 1/N" /
   "Entrada adicional".
   - Defeito que isso corrige: `adicionarParcelas` trata
     descrição|valor|vencimento iguais como repetição. Uma leva com os mesmos
     valores e datas da anterior ("Parcela 1/2"…) era respondida "repetido" e
     nada era criado. Teste no banco prova os dois lados.
2. **Correção cancelada no meio** (`821dc5a`). Cancelar o registro do valor
   certo depois de "Corrigir" deixava o recebimento anulado em silêncio; agora
   avisa que a correção não foi concluída.

**Só frontend.** `planejarParcelas` roda na tela; nenhuma função do Convex mudou.

## Verificações (11/10, depois da última mudança de código)

- `pnpm test`: 5.962 de 5.963. A falha é `convex/jornada.evento.test.ts` —
  ver abaixo; não tem relação com pagamentos.
- `tsc` do app e do Convex: ok. Lint: 0 erros, os 8 avisos antigos.
  Build: ok, CSS `index-C78Q3iio.css`.
- Testes novos: rótulo "adicional" (regra pura), leva igual criada só com o
  rótulo novo, conta rival recusada, e os textos da tela.
- **Não validado no navegador** nesta rodada.

## Achado que afeta a live

O evento-herói da DEMO, **Marina & Gabriel**, tem data `2026-10-10`
(`convex/lib/demoData.ts`). Desde 11/10 ele "já aconteceu": a jornada mostra
fase **Operação**, não Projeto, e o teste
`jornada.evento.test.ts > Marina & Gabriel semeada` falha. Mexer na DEMO não
foi autorizado nesta rodada — decisão da Eva.

## Próximos passos

1. Eva decide a data do evento-herói da DEMO (e o teste que trava isso).
2. Validar no DEV, pelo navegador: evento com parcelas → Acrescentar com os
   mesmos valores → cria "Parcela adicional"; passar do contratado → aviso e
   "mesmo assim"; Corrigir → Cancelar → aviso de não concluída.
3. Revisar a Produção floral (`feature/producao-floral`) e decidir se entra
   antes da live.
4. Publicar exige autorização: aqui é só frontend (`docs/release-producao.md`),
   conferindo o CSS novo no site.
5. Roteiro da live de 14/10 às 19h30: adaptar o `docs/roteiro-live-2026-10-08.md`.
