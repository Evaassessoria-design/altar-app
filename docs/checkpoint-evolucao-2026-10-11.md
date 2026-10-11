# Checkpoint — evolução para a live de 14/10 (11/10/2026, 2ª rodada)

## Onde está

| O quê | Estado |
|---|---|
| Repositório | `Evaassessoria-design/altar-app`, PC da Eva |
| PROD frontend | `5810dbd` — CSS no ar `index-DwvYhOS9.css` (conferido em 11/10) |
| PROD backend (`mellow-goose-539`) | `5ec2c4c` |
| Candidato | `feature/evolucao-14-10` (a partir do `5810dbd`) — GitHub, **nada publicado** |
| `main` | `86dc253` — sem merge |
| Produção floral | `origin/feature/producao-floral` `fd7deae` — revisada, **não integrada** |

O candidato é **só frontend**: nenhuma função do Convex mudou desde `5ec2c4c`.

## O que o candidato traz

| Commit | O quê |
|---|---|
| `37a19cd` | Acrescentar parcelas: lista das já lançadas, total depois, aviso acima do contratado |
| `821dc5a` | Correção cancelada no meio avisa que não foi concluída |
| `eb35ba7` | Cada leva adicional com número próprio; diálogos sem rolagem lateral |
| `6b4f513` | Teste da jornada com relógio fixo |
| (docs) | este checkpoint e `docs/roteiro-live-2026-10-14.md` |

## 1. Parcelas adicionais — o que foi provado

**Defeito achado e corrigido.** Com o rótulo fixo "Parcela adicional", uma
**2ª leva adicional** com os mesmos valores e datas da 1ª voltava
`repetido: true` — nada era criado. Provado com teste antes da correção.

**Correção (menor possível, só tela):** `rotuloDaLeva` numera as levas
("Parcela adicional", depois "(leva 2)", "(leva 3)"…) a partir das descrições
existentes. O nome é fixado ao abrir o diálogo. O servidor, a chave e a regra
de assinatura não mudaram.

Testes no banco (`convex/pagamentos.evento.test.ts`, "levas sucessivas"):
- original + 1ª adicional + 2ª adicional idênticas → 3 + 3 + 3 criadas;
- clique repetido (dois envios simultâneos, mesma chave) → cria uma vez;
- resposta perdida → reenvio com a mesma chave não duplica e não vira leva 2;
- recusa antes de gravar (vencimento inválido) → nada fica pela metade; nova
  tentativa com a mesma chave cria;
- conta rival não acrescenta parcelas no evento da dona.

No navegador (DEV): duplo clique criou 3 (não 6); a 2ª leva idêntica saiu
como "(leva 2)" e foi criada; a prévia da 3ª mostra "(leva 3)".

**Para sua conferência:** a proteção "o mesmo planejamento salvo de novo por
outro formulário" do servidor deixou de valer na prática para quem acrescenta.
Reabrir o diálogo e confirmar a mesma prévia cria uma leva nova, de propósito,
porque o servidor não distingue repetição de nova leva intencional. O que
protege agora é a lista "Já lançadas", visível antes do clique, e a chave
para o mesmo formulário.

## 2. Correção de recebimento — validado no DEV (desktop)

| Caso | Resultado |
|---|---|
| Anular e registrar o valor certo | anulado riscado com motivo; novo ativo; status e saldo recalculados |
| Anular e cancelar o novo registro | aviso "Correção não concluída…"; parcela volta a Pendente; saldo de volta; nada diz "corrigido" |
| Falha e nova tentativa | valor acima do saldo barrado na tela (o saldo acompanha ao vivo, inclusive quando outra aba registra); diálogo fica aberto; nova tentativa com valor válido conclui |
| Aba do evento × Financeiro | mesmos status, recebido, saldo e histórico nas duas telas |

**Limitação:** não simulei falha de **rede** no navegador. Com o Convex, uma
mutation feita sem conexão fica na fila e é enviada ao reconectar; a recusa
do servidor só foi provocada nos testes.

**Achados de layout corrigidos (`eb35ba7`):**
- Detalhes da parcela com saldo: rodapé de três botões alargava o diálogo
  (rolagem lateral no desktop; botão cortado). Agora quebra linha.
  **Este defeito está em PROD** (`5810dbd`).
- Acrescentar parcelas no celular: a lista das já lançadas alargava o grid do
  diálogo (411 px de conteúdo em 339). Corrigido.

Medido: diálogos e página sem rolagem lateral em desktop e em 390 px
(**iframe de 390 px no navegador do PC, não aparelho real**).

Dados criados no DEV (conta de teste, evento "TESTE Atalhos"): duas levas
adicionais de R$ 200 (3×), recebimentos de R$ 50 (anulado), R$ 100 e R$ 20 na
"Parcela 1/1", e R$ 66,67 anulado na "Parcela adicional 1/3".

## 3. Teste dependente da data

`jornada.evento.test.ts > Marina & Gabriel semeada` — causa confirmada com o
relógio controlado: passa em 09/10, falha em 10/10 e 11/10. O herói tem data
fixa (`DEMO_WEDDING.event.date = 2026-10-10`); o resto do portfólio é
relativo a "agora"; `aconteceu = data <= hoje`.

Correção: relógio fixo 5 dias antes da data do herói (derivado da fixture),
mesmas verificações, e um caso novo prova o outro lado (no dia: Operação).

**Isso não atualiza nada no banco.** O evento da conta de demonstração
continua com 10/10.

### Proposta para o evento-herói na live de 14/10 (não executada)

Hoje o herói aparece como "já aconteceu": a Jornada mostra Operação, e o
alerta de déficit do acervo sumiu. Três saídas, da mais simples à mais completa:

1. **Usar outro evento no bloco 4.** Use um evento com data futura e deixe
   Marina & Gabriel para mostrar o retorno do acervo. Não mexe em dado nenhum.
2. **Mudar a data pela tela, na conta de demonstração.** Editar o evento para
   uma data depois da live (ex.: 24/10/2026). É rápido. Mas a janela da
   reserva do acervo (09–11/10) e a "Parcela final" (05/10) continuam com as
   datas velhas, e o déficit de guardanapos só volta se a reserva acompanhar.
   Conferir antes do ensaio.
3. **Fixture com datas à frente + `internal.demo.resetar`.** Mover a data do
   herói, a janela de reserva (`demoData.ts:481`), o lead (`:543`) e as
   datas ligadas (`:408`, `:428`), revisar os testes que usam `2026-10-10`, e
   rodar o reset no deployment da demonstração. O reset só roda com
   `ALTAR_DEMO=1` e sem sinal de produção, e **apaga o que foi subido à
   mão** (fotos, contrato: `docs/checklist-demo-manual.md`). Exige sua
   autorização, o alvo confirmado e refazer os uploads.

Recomendo a **1** para 14/10 (risco zero) e a **3** depois da live, com calma.

## 4. Produção floral — revisão (`fd7deae`, sem integrar)

**Veredito: não está pronta para merge.**

- **Compatibilidade:** `git merge-tree` com o candidato sai limpo; os arquivos
  não se cruzam. O schema só acrescenta campos opcionais.
- **Testes:** 26 casos da floral + 7 de tela; 681/681 nos arquivos de
  ficha, receita, materiais, paywall e isolamento; `tsc` ok.
- **Teste de fronteira quebrado pela branch:** `dialogo-altura.test.ts`
  (`max-h-[90vh]` em `instrucoes-dialog.tsx:106` e `linhas-florais-dialog.tsx:152`).

| Ponto | Situação |
|---|---|
| Receita × total distribuído | conta certa (regra única `necessidadeDoComponente`) |
| Resumo do florista | **soma flor natural com permanente** e cores diferentes ("Rosa 148 hastes") |
| Ficha Técnica | **não foi adaptada ao distribuído**: mostra "20 × 2 = 2" e "2 maços" sob "POR UNIDADE" |
| Frações e unidades | ok: 0,5 aceito; unidades diferentes não se somam |
| Salvar cor/origem | **recopia custo, margem e unidade do catálogo** (via `setReceita`) |
| "Só orientação" | grava quantidade 0; ao desmarcar, a original se perdeu |
| Foto da flor × referência | separadas e rotuladas; **o botão de foto acha o material pelo nome**, não pelo id |
| Isolamento / arquivos | ok (`getOwnedEvent`, NOT_FOUND, paywall no upload) |
| Testes que faltam | foto da Galeria de outro evento; `materialId` de outra conta |
| PDF sem dado financeiro | preço/custo/margem não saem; **o nome da cliente e as notas internas saem** |

**Decisões suas:** nome da cliente e notas internas no papel do florista?
Salvar cor/origem pode recopiar custo e margem? Natural e permanente da
mesma flor somam no resumo?

## Verificações (11/10, depois da última mudança de código)

- `pnpm test`: **5.975/5.975**.
- `tsc` do app e do Convex: ok. Lint: 0 erros, 8 avisos antigos.
- Build: ok, CSS `index-CrIBegFv.css`. É o CSS esperado no site se este SHA
  for publicado; refazer o build no SHA final para conferir.

## Próximos passos

1. Você confere o candidato no DEV: Acrescentar parcelas duas vezes com os
   mesmos valores; Corrigir → Cancelar; detalhes de uma parcela com saldo no
   desktop e no celular.
2. Você escolhe a saída do evento-herói (recomendo a 1 para 14/10).
3. Se aprovar, autoriza a publicação **só do frontend**
   (`docs/release-producao.md`) e confere o CSS no site.
4. Ensaio com `docs/roteiro-live-2026-10-14.md`.
5. Floral depois da live: corrigir as pendências acima e responder às três
   decisões.
