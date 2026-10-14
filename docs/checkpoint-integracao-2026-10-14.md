# Checkpoint — candidato INTEGRADO para a live de 14/10/2026

Branch **`integration/altar-live-14-10`**. Nada publicado por esta sessão:
nenhum merge na `main`, nada em PROD, nada na DEMO — e **nada no DEV**, pelo
motivo da seção 6.

## 1. O que entrou, e de onde

| Origem | HEAD | O que traz |
| --- | --- | --- |
| `feature/briefing-e-extrato` | `d846c52` | Briefing reorganizado, Extrato financeiro **e** o Caderno Cliente/Equipe (que já estava contido nela, em `00e7c94`) |
| `feature/producao-floral-ajustes` | `ad73c75` | Produção floral + os ajustes vistos no DEV em 13/10 (e, dentro dela, `fd7deae`, a floral original) |
| `feature/evolucao-14-10` | `95287f1` | Parcelas adicionais com levas nomeadas, aviso de correção não concluída, diálogos sem rolagem lateral |

**Base comum das três:** `5810dbd` — o mesmo commit do frontend publicado em
PROD. Nenhuma das três partiu de lugar diferente.

**Containment conferido antes do merge:** `feature/caderno-cliente-equipe`
(`00e7c94`) é ancestral de `feature/briefing-e-extrato`; `feature/producao-floral`
(`fd7deae`) é ancestral de `feature/producao-floral-ajustes`. Trazer as duas
tips maiores trouxe as quatro entregas — nenhuma branch ficou de fora, nada foi
reescrito.

**Trabalho pendente:** nenhum. Árvore limpa, nenhum stash, nenhuma branch local
à frente do remoto.

## 2. Conflitos

**Nenhum conflito de texto.** Os seis arquivos tocados por mais de uma branch
resolveram sozinhos:

| Arquivo | Por quê |
| --- | --- |
| `convex/demo.acervo.test.ts`, `convex/jornada.evento.test.ts` | as três branches carregam o MESMO commit de relógio fixo, cherry-picked com SHAs diferentes |
| `.github/workflows/validacao.yml` | idem, o checkout com histórico completo |
| `convex/schema.ts` | as duas adições são em blocos diferentes, as duas aditivas |
| `convex/_generated/api.d.ts` | registros em pontos alfabéticos distintos |
| `convex/lib/fichaTecnica.ts` | o briefing ALARGOU `ehObrigacao` para ler `situacao`; a floral mexeu na conta por arranjo. Lados diferentes do arquivo |
| `src/pages/.../ficha-tecnica/page.tsx` | a floral trocou um import; o briefing passou `situacao` adiante |

**Conferido linha por linha:** em relação a cada uma das três origens, a
integração **não remove nada** de `convex/schema.ts` (0 linhas removidas) nem
apaga arquivo nenhum. As duas únicas "remoções" em `lib/fichaTecnica.ts` e na
tela da Ficha Técnica são a MESMA linha reescrita pelo briefing para passar
`situacao` — regra aprovada, não perda de trabalho.

## 3. A interação que nenhuma branch sozinha provava

`convex/integracao.live-14-10.test.ts` (9 testes) nasceu deste merge. Três
features escrevem no MESMO documento (`assemblyItems`), e é daí que vêm os
defeitos silenciosos:

- **a ficha do florista passou a respeitar o briefing.** Item "Em avaliação",
  "Não se aplica" ou **opcional** não vai mais para o florista. Antes da
  integração a floral não conhecia esses estados: ela mandaria montar o
  monograma que a cliente não aprovou, e somaria a flor dele no resumo. Está
  provado com número: 105 hastes, não 125;
- **peça da locadora continua na ficha.** Ela sai do caminhão, não do projeto;
- **nenhuma tela apaga a outra.** Gravar os campos do briefing preserva
  receita, parte floral e instruções; gravar a parte floral preserva `bloco`,
  `situacao`, `tipoFlor`, `medidas` — e não mexe em custo, unidade nem
  quantidade;
- **`tipoFlor` (do item) e `origem` (da linha da receita)** usam o mesmo
  vocabulário natural/permanente em objetos diferentes, e não se sobrescrevem.

## 4. Diff contra o que o DEV já roda (`ad73c75`)

| Verificação | Resultado |
| --- | --- |
| Tabelas do schema | **idênticas** |
| Campos removidos do schema | **0** |
| Arquivos apagados | **0** |
| Funções públicas removidas | **0** |
| Funções públicas novas | **2** — `financeiro.extratoPagina`, `financeiro.eventosDoExtrato` |
| Rotas perdidas | **0** |

**Compatível para publicar sobre o DEV atual:** nada que o cliente de hoje
chama desaparece, o trabalho da floral está inteiro e o schema é aditivo — sem
backfill, sem migração. Dado existente no DEV continua válido: campo ausente
mantém o comportamento de antes em todas as regras novas.

## 5. Checks (resultado real desta sessão)

| Check | Resultado |
| --- | --- |
| `npx vitest run` | **6.223 / 6.223** (276 arquivos) |
| `tsc -p tsconfig.app.json` | ok |
| `tsc -p convex/tsconfig.json` | ok |
| `npm run lint` | 0 erros, 8 avisos (os mesmos de sempre, em `src/components/ui/`) |
| `npm run build` | ok |

## 6. O que NÃO foi feito, e por quê

**A publicação no DEV não aconteceu, nas duas tentativas (14/10, manhã e
noite). A rede deste ambiente recusa o Convex.** A segunda sessão rodou na
MESMA máquina da primeira — um container Linux na nuvem (`vm`, root), não o seu
PC —, e por isso o bloqueio é o mesmo. Conferido também que este container não
tem a configuração do DEV: o `.env.local` daqui aponta para um backend
self-hosted local (`127.0.0.1:3210`), resquício de uma sessão antiga, e não há
`CONVEX_DEPLOYMENT`. O arquivo com o alvo `healthy-pika-907` é o do seu PC.

```
version.convex.dev:443          → CONNECT 403 (policy denial)
healthy-pika-907.convex.cloud:443 → CONNECT 403 (policy denial)
```

É a política de rede do ambiente de execução (escolhida ao criar o ambiente),
não falta de autorização sua nem credencial ausente: `npx convex deploy` não
tem como abrir conexão. Sem publicar, **nenhum dos sete itens de validação no
navegador pôde ser executado** — eles exigem este backend no ar.

Consequência honesta: às 19h30, o que existe publicado é o produto de PROD
(frontend `5810dbd`, backend `5ec2c4c`). O candidato integrado está pronto e
verde, e só entra no ar com os passos da seção 7, no seu computador.

## 7. Publicar no DEV — os passos exatos (no seu PC)

```bash
git fetch origin
git checkout integration/altar-live-14-10
git pull --ff-only origin integration/altar-live-14-10

npx convex env list          # TEM de dizer healthy-pika-907. Se disser
                             # mellow-goose-539, PARE: é PRODUÇÃO.

npx convex codegen           # codegen NÃO publica (ver docs/homologacao-dev.md)
git diff --stat convex/_generated/
#  sem diferença  → os registros manuais estavam certos
#  com diferença  → o gerador tem razão: aceite o arquivo dele e commite só isso

pnpm test && npx tsc -p tsconfig.app.json --noEmit \
  && npx tsc -p convex/tsconfig.json --noEmit && pnpm lint && pnpm build

npx convex deploy            # publica o BACKEND no DEV
pnpm dev                     # abre o frontend apontando para o DEV
```

Depois de publicar, confira no painel que `financeiro.extratoPagina` e
`financeiro.eventosDoExtrato` apareceram — foram as duas funções novas.

## 8. Roteiro da live — 14/10, 19h30

O roteiro completo e a preparação de dados estão em
`docs/roteiro-live-2026-10-14.md` e `docs/checklist-live-2026-10-14.md`. O que
muda com a integração é **o que pode ser mostrado**, e isso depende de onde a
live roda.

### Trilha A — site publicado (sem publicar nada hoje)

Sete blocos, tudo que já está no ar e foi conferido em PROD em 13/10:

1. **Funil** — Ana Clara & Rafael: registrar contato, próxima ação, avançar até
   Proposta.
2. **Proposta** — abrir a prévia "como a cliente vê": sem custo, sem margem.
3. **Converter em evento** — ao vivo.
4. **Pagamentos da cliente** — valor contratado, parcelas, **recebimento
   parcial**, comprovante, correção.
5. **Financeiro** — Receita do mês e a conferência com as parcelas.
6. **Acervo** — reserva, saída, retorno, conferência.
7. **Celular** — repetir 4 e 5.

Produção floral, Briefing novo, Caderno Cliente/Equipe e Extrato **não** entram
nesta trilha: não estão publicados. Se alguém perguntar, a resposta honesta é
"está pronto, em homologação, entra depois da live".

### Trilha B — DEV integrado (só depois da seção 7)

Com a integração no DEV, acrescente, nesta ordem (é a ordem em que a decoradora
trabalha):

8. **Briefing** → Cerimônia → Altar → "+ Genuflexório" → modelo, medidas,
   "Modelo aprovado" → **recarregar** e conferir que ficou.
9. **Cantinho das crianças** → "Sim" abre local, responsável e itens.
10. **Mobiliário** → as cadeiras aparecem **uma vez**, com a transferência
    ("também usada em Salão às 20h").
11. **Personalização** → "+ Monograma": nasce **Em avaliação**.
12. **Produção floral** → cor, natural/permanente, "5 por arranjo" × "2 maços
    no total"; foto da flor; gerar a **ficha do florista** com fotos.
13. **Caderno** → "Para a equipe" e "Para os noivos": o monograma em avaliação
    aparece como decisão que falta, não como item a montar; sem R$ na equipe.
14. **Extrato** → um mês e três meses, PDF e Excel; comparar com a Receita do
    mês.
15. **Celular** → repetir 8, 13 e 14.

**Ensaio:** rode a trilha escolhida inteira uma vez antes das 19h30. O item 12
é o que ninguém viu em navegador depois da integração.

## 9. Os três defeitos apontados nominalmente (14/10, 2ª passada)

A lista reconstruída no relatório anterior saiu dos relatórios das branches, e
você avisou que ela não corresponde à homologação. Estes três foram conferidos
**no código, um por um, sem presumir correção**:

### 9.1 Data vazia ao converter lead em evento — ERA REAL, corrigido agora

**Mecanismo.** O lead grava o DIA (`<input type="date">` → `"2027-05-22"`). O
diálogo de conversão preenchia `defaultValues.eventDate = lead.eventDate` num
`<input type="datetime-local">`, e esse campo só aceita
`"AAAA-MM-DDTHH:mm"`: o navegador **descarta o valor em silêncio**. Resultado —
lead com data, campo "Data *" vazio, e a decoradora redigitando na frente da
cliente. Enviar vazio não corrompia nada (o zod barra com "Data obrigatória" e
o servidor recusaria por `DATA_DE_EVENTO_INVALIDA`), mas o trabalho se perdia.

**Correção (só tela):** o campo passou a `type="date"`, que é o que
`convex/lib/dataDeEvento.ts` já documentava como o caminho da conversão — "na
conversão existe o dia; o horário é combinado depois". O valor inicial é
cortado no dia (`slice(0, 10)`) para um lead antigo gravado com horário também
preencher. O formulário DO EVENTO continua com `datetime-local`: ali o horário
faz parte do evento. Guardas em `src/lib/defeitos-homologacao-14-10.test.ts`.

### 9.2 Proposta aceita não vinculada à Jornada do evento — ERA REAL, **continua presente**

**Mecanismo.** A Jornada lê as propostas do evento por índice:
`proposals.withIndex("by_event", eventId)` (`convex/health.ts`). Uma proposta
criada no funil nasce com **`leadId`**, não com `eventId` — e
`funil.convertToEvent` religa apenas o lead (`stage`, `convertedEventId`).
Nenhum caminho passa o `eventId` para a proposta. Então, depois de converter um
lead com proposta ACEITA, a etapa "Orçamento e proposta" da Jornada mostra
**"Sem orçamento nem proposta"**.

A regra que avalia a etapa está certa (`avaliarComercial` devolve "Proposta
aprovada" quando há `status === "aceita"`): o que falta é a proposta chegar até
ela. O dado não está errado nem perdido — a proposta aceita existe e aparece em
Propostas e no funil. É a Jornada do evento que não a enxerga.

**Por que NÃO corrigi agora.** Há três caminhos, e nenhum é de uma linha:

| Caminho | Custo | Risco |
| --- | --- | --- |
| Religar na conversão (patch `eventId` na proposta do lead) | escrita nova em `convertToEvent` | a proposta passa a ter os DOIS vínculos; precisa conferir todo consumidor de `proposals` |
| Buscar o lead de origem na leitura (como `leadDocuments.listForEvent` já faz) | varredura dos leads da conta **na consulta quente da tela do evento** | contraria as guardas de escala do repositório (40+ eventos) |
| Índice novo `by_converted_event` em `leads` | schema deixa de ser idêntico ao do DEV | aditivo e seguro, mas amplia o diff na véspera |

Minha recomendação é a primeira, com conferência dos consumidores — **depois**
da live. Escolher isso a duas horas da demonstração é o tipo de decisão que
produz o defeito seguinte.

**Na demonstração:** a etapa "Orçamento e proposta" vai aparecer como não
iniciada no evento recém-convertido. Ou não abra o cartão da Jornada nesse
momento, ou diga que o vínculo proposta→jornada é a próxima correção.

### 9.3 Botão "Reservar peça" cortado no celular — ERA REAL, corrigido agora

**Mecanismo.** O cabeçalho do Acervo do evento era
`flex items-start justify-between` **sem `flex-wrap`**, com o bloco do título
sem `min-w-0` e o grupo de botões em `flex-shrink-0`. A 390 px, "Acervo do
evento" (2xl) + "Reservar da ficha" + "Reservar peça" não cabem na linha: nada
cede, e o último botão — a ação principal — sai pela borda. O estado vazio da
MESMA página já usava `flex-wrap`; o cabeçalho ficou para trás.

**Correção (só tela):** `flex-wrap` no cabeçalho e `min-w-0` no bloco do
título. A trava `src/lib/mobile-controls.test.ts` não pegava isto porque ela
procura controle escondido (`hidden sm:`), não controle que transborda — o novo
guarda cobre o caso.

## 10. Limitações desta entrega

- **Nada validado em navegador depois do merge.** Os sete itens que você pediu
  continuam pendentes, todos pelo mesmo motivo da seção 6.
- **Herdadas, ainda de pé:** consolidado de compras da Ficha Técnica não separa
  cor nem natural/permanente; miniatura do material não atualiza na hora;
  ficha com dezenas de composições não foi medida; celular real não testado;
  despesa lançada à mão não tem fornecedor estruturado; extrato de conta enorme
  lê tudo no navegador antes de gerar.
- **Nomes que confundem:** `assemblyItems.origem` é quem FORNECE
  (acervo/locadora/espaço/cliente) e `receita[].origem` é natural/permanente.
  Convivem sem se atropelar, e estão testados — mas o nome vai confundir quem
  ler depois. Renomear é decisão de produto, não desta integração.
