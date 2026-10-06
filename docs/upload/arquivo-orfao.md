# Arquivo órfão no storage — auditoria, e por que a compensação não foi construída

Rodada de 01/10/2026, junto da correção do limite de documentos.

---

## O que acontece

O envio tem três passos, e o arquivo chega ao storage no segundo:

```
1. generateUploadUrl   mutation — confere paywall e devolve a URL
2. POST do arquivo     o navegador sobe os bytes → recebe o storageId
3. save                mutation — grava a linha que REFERENCIA o storageId
```

Se o passo 3 falhar, os bytes já estão lá e nenhuma linha aponta para eles.
O arquivo fica **pago e invisível**: não há como achá-lo depois, porque a única
coisa que o nomeava era a linha que não foi criada.

## Quantas vezes isso aconteceu de verdade

Todas as vezes que a decoradora tentou anexar um documento acima de
0,95 MiB — o teto que `exigirQuantidadeGravavel` aplicava a bytes. As duas
portas da tela diziam sim, o arquivo subia, e o backend dizia não.

**Era o caminho normal, não a exceção.** É o que esta rodada corrigiu.

## Por que a correção do limite já resolve a causa

O órfão nascia de **a tela e o servidor discordarem**. Agora os dois chamam
`cabeNoTeto`, de `convex/lib/arquivos.ts`, com a mesma constante:

| Porta | Antes | Agora |
|---|---|---|
| tela do funil | 20 MB | `cabeNoTeto(…, TAMANHO_MAXIMO_DOCUMENTO)` |
| hook de envio | 10 MB | `cabeNoTeto(…, TAMANHO_MAXIMO_DOCUMENTO)` |
| backend | 1.000.000 bytes | `cabeNoTeto(…, TAMANHO_MAXIMO_DOCUMENTO)` |

Não é disciplina: é impossibilidade. `leadDocuments.upload.test.ts` percorre
nove bordas e exige que as três respostas sejam **idênticas** em cada uma.

E o paywall (`requireActiveAccess`) é conferido no passo **1**, antes do
upload — conta bloqueada não chega a gastar banda.

Depois disso, para `save` falhar é preciso: lead de outra conta (a tela só
oferece os da própria), nome de arquivo vazio (o navegador sempre manda), ou
queda de rede entre os passos 2 e 3. **Deixou de ser comportamento normal.**

---

## A compensação que NÃO foi construída, e por quê

O desenho óbvio é uma mutation `descartarEnvio({ storageId })`, chamada pela
tela quando o `save` falha. **Ela viola a segunda trava do `CLAUDE.md`:**

> *Id vindo do navegador não é prova de posse.*

`_storage` não tem dono. O Convex não registra quem subiu um arquivo — só que
ele existe. Uma mutation que apaga por `storageId` recebido do navegador
apagaria **qualquer** arquivo ainda não referenciado, inclusive o de outra
decoradora que está no intervalo de segundos entre o passo 2 e o passo 3 dela.

Conferir "nenhuma linha referencia este id" não salva: o arquivo em voo
também não é referenciado **ainda**. É exatamente "apagar arquivo válido".

Usar idade do arquivo como critério extra foi descartado pela mesma instrução
que pediu esta auditoria: limpeza por idade ou por nome não se faz.

---

## A solução segura, para quando valer o custo

**Vincular o envio ao usuário no servidor, antes de poder apagá-lo.**

```
1. generateUploadUrl → grava { userId, criadoEm } e devolve { url, envioId }
2. POST do arquivo   → o navegador recebe o storageId
3. registrarEnvio({ envioId, storageId })
     mutation curta: confere que o envioId é do chamador e AMARRA o storageId
4. save({ …, envioId })
5. em qualquer falha: descartarEnvio({ envioId })
     o storageId vem da LINHA, não do navegador — a posse está provada
```

A posse deixa de ser afirmada pelo cliente e passa a ser registrada pelo
servidor. `descartarEnvio` só alcança o que o próprio chamador subiu.

### O que isso custa

- uma tabela nova (`uploadsPendentes`), com expiração própria;
- duas mutations novas;
- **uma ida e volta a mais em TODOS os dez fluxos de upload do ALTAR** —
  galeria, planta, logo, comprovante, documentos do evento e do lead, item de
  montagem, material do catálogo, foto do projeto, logo do fornecedor;
- um estado novo para a tela errar: envio registrado e nunca salvo.

### Por que não agora

A regra de ouro do repositório manda provar que a arquitetura existente não
representa a necessidade antes de criar entidade nova. Aqui ela **representa**:
fechada a discordância entre as portas, o órfão deixou de ser rotina e passou
a ser consequência de falha de rede — o mesmo risco que qualquer upload da
internet tem.

Trocar isso por uma tabela nova e um round-trip em dez fluxos, na semana da
live, seria pagar caro por um ganho que o teste de concordância já entrega.

---

## BACKLOG — `UPLOAD-ORFAO-01`

**Título:** vincular envio ao usuário para permitir descarte seguro
**Prioridade:** P2 — depois da live
**Pré-requisito:** nenhum; é independente da correção de limite
**Escopo:** os cinco passos acima, nos dez fluxos de upload
**Teste obrigatório:** a conta rival não descarta o envio em voo da dona —
`envioId` de outra conta responde `NOT_FOUND`, não FORBIDDEN

**Não faz parte deste backlog:** varrer o storage em busca de órfãos antigos.
Isso é outra tarefa, com outro risco, e precisa de inventário antes de
exclusão — ver abaixo.

## BACKLOG — `UPLOAD-ORFAO-02`

**Título:** inventário de órfãos já existentes em produção
**Prioridade:** P3
**Primeira entrega: um RELATÓRIO, não uma exclusão.** Listar storageIds sem
referência, com data e tamanho, e revisar à mão antes de qualquer `delete`.

**Nenhuma limpeza retroativa foi feita nesta rodada**, e nenhuma deve ser feita
sem esse inventário: não sabemos quais arquivos são órfãos, e um `delete`
baseado em suposição apaga papelada de cliente real.

---

## O limite subiu para 100 MB (06/10/2026)

Ver `docs/upload/documentos-100mb.md`. A parte sobre órfãos deste documento
continua valendo, e com peso maior: um órfão agora pode ter 100 MB.
