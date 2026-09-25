# O que está pronto, o que está testado, e o que não existe

Conferido no código em **25/09/2026**, a onze dias da apresentação.

Este documento existe por um motivo só: **não chamar de pronto o que não foi
observado funcionando**. A distância entre "o teste passa" e "funcionou com
gente de verdade do outro lado" é onde moram os desastres de demonstração.

## As cinco palavras

| Palavra | Significa |
|---|---|
| **CONSTRUÍDO** | O código existe e faz o que diz |
| **TESTADO** | Há teste automatizado cobrindo a regra, inclusive o caso hostil |
| **HOMOLOGADO** | Alguém usou, com dado real, e confirmou o resultado |
| **BLOQUEADO** | Não dá para concluir por falta de credencial, serviço ou decisão |
| **NÃO EXISTE** | Não foi construído. Não prometer |

**Nada nesta rodada está HOMOLOGADO.** Homologação exige uma pessoa usando com
dado real, e isso não aconteceu — nem podia, porque a campanha começa agora.

---

## 1. Campanha da live

| Peça | Estado | Observação |
|---|---|---|
| Pipeline de 12 etapas | TESTADO | Aditivo sobre as 9 anteriores; sem backfill |
| Carimbo de marcos (`marcosEm`) | TESTADO | Voltar de etapa não apaga o passado |
| Funil e contagens | TESTADO | Inclui o caso legado, sem carimbo |
| Taxas (resposta, confirmação, comparecimento, trial, conversão) | TESTADO | Nunca dividem por zero; base mínima de 5 |
| Busca por nome, empresa, telefone e e-mail | CONSTRUÍDO | Telefone normaliza para E.164 antes de procurar |
| Tela `/campanha` | CONSTRUÍDO | Nunca aberta com 100 registros reais — ver §6 |
| Importação de lista (CSV) | TESTADO | Teto de 1.000 linhas, declarado |
| Detecção de duplicidade | TESTADO | Aponta; **nunca funde** |

**O que falta para HOMOLOGADO:** importar a lista real de interessados e abrir
a tela com ela dentro.

## 2. Mensagens e rascunhos

| Peça | Estado | Observação |
|---|---|---|
| 10 modelos de mensagem | TESTADO | Nenhum promete preço, desconto ou prazo |
| Linha de abertura por origem | TESTADO | Quem veio de prospecção não ouve "você entrou em contato" |
| Rascunhos com 4 estados | TESTADO | `rascunho`, `aprovado`, `descartado`, `enviado_manualmente` |
| Aprovação barrada por pendência | TESTADO | Texto com buraco não é aprovável |
| Preparo em lote | TESTADO | Teto de 50 por vez, com o resto declarado |
| **Envio** | **NÃO EXISTE** | Ver §4 |

**O texto dos modelos nunca foi lido por ninguém de fora.** Antes de usar em
escala, ler os dez em voz alta — é o teste que nenhum automatizado substitui.

## 3. Respostas recebidas

| Peça | Estado | Observação |
|---|---|---|
| Classificador de 9 intenções | TESTADO | Determinístico, sem modelo |
| Tratamento de negação | TESTADO | "não quero participar" não é participação |
| `incerto` nunca vira confirmação | TESTADO | Sobe para uma pessoa |
| **Webhook de entrada da campanha** | **NÃO EXISTE** | O classificador é uma função pura; nada o chama ainda |

O classificador está pronto e **desconectado de propósito**. Ligá-lo exige um
provedor homologado (§4). Enquanto isso, as respostas chegam no WhatsApp de uma
pessoa e são registradas à mão na tela.

## 4. WhatsApp e e-mail

| Peça | Estado | Observação |
|---|---|---|
| Camada de canal (`AdaptadorDeCanal`) | CONSTRUÍDO | Já existia; cobre receber, verificar assinatura, normalizar e preparar envio |
| Adaptador WhatsApp Cloud API | CONSTRUÍDO | Escrito; sem credenciais neste ambiente |
| Situação honesta do canal (5 estados) | TESTADO | `nao_configurado` hoje |
| Portão de saída | CONSTRUÍDO | **Fechado** por `ALTAR_CENTRAL_ENVIO_HABILITADO` |
| **Envio real** | **BLOQUEADO** | Falta conta Meta homologada e credencial |
| **E-mail transacional** | **NÃO EXISTE** | Nenhum provedor, nenhum adaptador |

### O que impede WhatsApp automático, em ordem

1. **Credencial.** Não há conta Meta Business com número verificado.
2. **Template aprovado.** A Meta exige template aprovado para iniciar conversa
   fora da janela de 24h. Os dez modelos deste repositório **não são** templates
   aprovados da Meta — são texto para uma pessoa copiar.
3. **O portão.** `ALTAR_CENTRAL_ENVIO_HABILITADO` está desligado, e
   `podeEnviarSemAprovacao` devolve `false` para todos os níveis, inclusive
   "autonomo".
4. **Decisão de produto.** Mesmo com 1, 2 e 3 resolvidos, a fila de rascunhos da
   campanha **não tem caminho** até o portão — é outra tabela, sem
   `conversationId`, e nenhum executor a lê.

Os quatro são independentes. Resolver um não abre nada.

## 5. Escritório e Assistente

| Peça | Estado | Observação |
|---|---|---|
| Semáforo (verde/amarelo/vermelho) | TESTADO | Função pura, antes de qualquer chamada |
| Desconto como amarelo | TESTADO | Produz rascunho com aviso próprio |
| Injeção de prompt pelo pedido | TESTADO | Vermelho não chega perto de uma chamada |
| Injeção pelos DADOS | CONSTRUÍDO | Instrução declara que dado não é ordem; JSON escapa a carga |
| Briefing da manhã (decoradora) | TESTADO | Derivado, reativo, área não medida não vira zero |
| Briefing comercial (campanha) | TESTADO | "Preparei" só aparece com rascunho gravado |
| Próxima melhor ação | TESTADO | Uma por pessoa; para de insistir depois de 14 dias |
| **Ação automática da IA** | **NÃO EXISTE** | E não deve existir |

**Sobre a injeção pelos dados:** a defesa é de redução de risco, não de
eliminação. O que garante que um texto errado não vire ação é estrutural — o
modelo não recebe ferramenta e o executor não escreve no banco. O pior caso
continua sendo uma frase errada na tela.

## 6. O que NÃO foi observado funcionando

Lista honesta do que só existe em teste:

1. A tela `/campanha` com 100+ registros reais.
2. Qualquer um dos dez modelos lido por uma decoradora de verdade.
3. O classificador de respostas sobre uma resposta real de WhatsApp.
4. A importação de CSV com o arquivo que a plataforma de transmissão exporta.
5. O briefing da manhã na conta da decoradora piloto, com 40 eventos.
6. A prontidão da conta numa conta recém-criada, do zero.
7. O PDF do projeto visual gerado a partir da conta de demonstração com fotos.
8. Qualquer envio externo, de qualquer natureza.

### Um risco que só um deployment real resolve

**Busca por empresa em registros sem empresa.** O banco falso do `convex-test`
chama `.split()` no campo de um índice de busca sem conferir se ele existe, e
explode em qualquer registro sem `empresa` — inclusive numa busca por NOME,
porque a consulta usa os dois índices.

Pela documentação do Convex, documento sem o campo simplesmente não casa, e
isso é quase certamente limitação do simulador. **Mas não foi verificado contra
um deployment de verdade**, e o efeito de estar errado é a busca da campanha
quebrar inteira na noite da live.

**Como verificar, em 30 segundos:** no DEV, cadastrar um interessado SEM
empresa, abrir `/campanha` e procurar por qualquer nome. Se a lista responder,
está resolvido.

### Uma dependência que foi removida

A busca lia 25 resultados por caminho e mostrava 25. Com 250 pessoas e nomes
repetidos, procurar "Beatriz Pacheco" podia não trazer a Beatriz Pacheco: o
termo "Beatriz" casava com dezenas, e a exata ficava fora das 25 primeiras
conforme o ranking do backend.

Depender do ranking para achar alguém cujo nome inteiro foi digitado é apostar
numa heurística que o código não controla, e o resultado do erro é a tela dizer
"ninguém encontrado" sobre uma pessoa que está lá. Agora lê-se 100 por caminho
e ordena-se aqui: igual primeiro, depois começa-com, depois contém.

## 7. Antes de 06/10, obrigatoriamente

Em ordem de risco:

1. **Subir fotos na conta de demonstração.** Sem isso o clímax da apresentação
   abre em branco. Passos em `checklist-demo-manual.md`; conferir pela seção
   "Pronto para mostrar?" do evento, que lê o banco em vez de perguntar se
   alguém lembra.
2. **Importar a lista real de interessados** e abrir `/campanha` com ela.
3. **Ler os dez modelos em voz alta.** Se algum soar como robô, reescrever.
4. **Definir o link da sala** e gravá-lo em `lib/campanha.ts`. Enquanto não
   existir, os modelos de confirmação e lembrete saem com a pendência declarada
   e não podem ser aprovados — que é o comportamento certo, e é um
   impedimento real.
5. **Decidir o preço** e onde ele fica escrito. Nenhum modelo o menciona, e
   nenhum deve.

---

## Como este documento se mantém honesto

Ele não é atualizado por otimismo. Uma linha só sobe para HOMOLOGADO quando
alguém escrever, ao lado, **o que fez e o que viu**. "Funciona" não é
observação; "importei 83 linhas do CSV da plataforma X e a tela mostrou 83" é.
