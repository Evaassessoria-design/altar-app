# Ideias registradas — não implementadas

Registradas para não se perderem e para que a implementação, quando vier, não
invente estrutura que já existe. **Nenhuma destas está no produto.**

---

## A) Reuniões ALTAR

Reunião com a cliente **vinculada ao evento**. Vídeo, áudio, tela compartilhada,
gravação, transcrição, resumo por IA, decisões, pendências, tarefas sugeridas e
arquivos apresentados.

**O valor real não é a chamada** — Meet e Zoom já existem e são grátis. É o que
sobra dela: hoje as decisões de uma reunião morrem na memória de quem estava lá.
Uma reunião que vira **decisão registrada no evento** é o que nenhuma ferramenta
de vídeo faz.

**LiveKit** é a avaliação óbvia (SFU open-source, SDK web, gravação). Mas é
**infraestrutura nova, custo recorrente e superfície de suporte nova** — e o
ALTAR ainda não tem um cliente pagando.

**Caminho mais barato primeiro:** a reunião acontece onde já acontece, e o ALTAR
guarda o **resumo**. Um campo de ata no evento, com o Assistente transformando
notas em decisões e tarefas, entrega 80% do valor com 2% do custo. Se isso for
usado, aí a chamada nativa se justifica.

**Dependências:** decisão comercial · LGPD de gravação (consentimento dos dois
lados) · custo por minuto · retenção.

---

## B) ALTAR Visual Inteligente

Contrato ou orçamento → itens contratados → fotos → flores → mobiliário →
projeto visual → apresentação → documento final.

**Metade já existe.** `ai.extractContractData` lê o contrato e devolve JSON
revisável; `assembly-suggestions.ts` transforma texto do briefing em itens;
`assemblyItems` já é o item visual, com foto da Galeria, ambiente, fornecedor e
escopo; o PDF dos noivos já sai disso.

**O elo que falta** é o contrato/orçamento virar **item visual** diretamente —
hoje ele vira evento, financeiro e briefing, mas não item.

O exemplo do pedido —
> Lisianthus branco + fotografia + quantidade + fornecedor + ambiente + observação

— é **exatamente** um `assemblyItem` de hoje. Nenhuma estrutura nova: o que falta
é o caminho contrato → sugestão de itens, no molde do que o briefing já tem.

**Não fazer:** tabela de "item visual" separada; a trava
`arquitetura-sem-paralelos.test.ts` já proíbe.

---

## C) Caderno final

Transformar o que a decoradora já fez num produto final bonito para a cliente.

**Já nasceu**: o PDF do Projeto Visual (capa escolhida, conceito, ambientes,
selos, sem custo nem fornecedor) é a primeira versão disso.

**O que falta para virar "o caderno"**:
- o croqui/planta dentro do documento (`layoutRenders` já existe e já entra no Caderno de Montagem);
- a ficha por ambiente com as flores nomeadas, quando houver receita;
- uma página de encerramento com a identidade da decoradora.

**A regra que não pode ser quebrada:** o documento nasce do trabalho já feito.
Nenhum cadastro novo, nenhum editor paralelo, nenhum moodboard. O Projeto Visual
é a fonte — `apresentacao-para-os-noivos.test.ts` já trava isso.

---

## D) O Assistente Comercial da decoradora

A decoradora tem funil e propostas. O que ela não tem é **alguém cuidando do
funil** — e é aí que o Assistente deixa de ser uma caixa de perguntas e vira
trabalho feito.

Nada disto está no produto. Está aqui na ordem em que ganha valor, e cada item
diz a que pertence: **a decoradora** (Assistente) ou **o ALTAR** (Escritório).

| # | Ideia | De quem | O que já existe | O que falta |
|---|---|---|---|---|
| D1 | **Formulário público de captação** — link que a decoradora põe no Instagram; a resposta cai como lead dela | decoradora | `leads` com origem; `landingLeads` é o precedente de captação pública | rota pública por conta, anti-spam, e a decisão de quanto perguntar sem espantar |
| D2 | **Qualificação automática do lead** — data, orçamento e tipo de evento viram uma leitura de prioridade | decoradora | os campos já existem em `leads` | regra de pontuação, e ela precisa ser **explicável**: "prioridade alta porque a data é em 40 dias" |
| D3 | **Follow-up sugerido** — quem está sem retorno há tempo demais, com rascunho pronto | decoradora | `funil.getFollowUp` já responde quem; o Assistente já redige rascunho amarelo | nada além de aprovação humana — o rascunho **não** vira envio sozinho |
| D4 | **Assistente de reunião** — ata que vira decisão registrada no evento | decoradora | ver **A) Reuniões ALTAR** | um campo de ata no evento; o resto é o Assistente lendo o que foi escrito |
| D5 | **Gravação e transcrição** | decoradora | nada | infraestrutura nova, LGPD, custo por minuto, retenção. É o item mais caro da lista |
| D6 | **Geração de apresentação para a cliente** | decoradora | o PDF do Projeto Visual **já nasceu** (ver **C**) | o que falta está listado em C — não é IA, é documento |
| D7 | **IA no Projeto Visual** — sugerir ambientes e composições a partir do briefing | decoradora | `briefing`, `compositions`, `acervo` | o Assistente hoje só lê; sugerir composição é escrever, e escrever exige aprovação |
| D8 | **Identificação visual de flores e mobiliário** na foto | decoradora | `gallery`, fotos por item | modelo de visão, custo por imagem, e o que fazer quando erra |
| D9 | **Geração de imagem** de referência para a cliente | decoradora | nada | decisão de produto: imagem gerada pode ser lida como promessa de entrega |
| D10 | **WhatsApp com aprovação humana** | decoradora | a Central tem gateway e fila de aprovação — **mas é o número do ALTAR** | a decoradora não tem número no sistema. Ligar o dela é instância, custo e suporte novos |
| D11 | **Agentes proativos** — o Financeiro abre trabalho sozinho ao ver vencidos | decoradora | `crons.ts` existe; `assistantTasks` aceita tarefa sem pedido | teto de uso, e a regra de quando calar a boca |
| D12 | **Escritório de IA interno** — comercial, marketing, CS e assinaturas do ALTAR | **ALTAR** | `convex/escritorio.ts` e `requirePlatformOwner` já existem; semáforo, roteador e executor são reaproveitáveis | tabela própria (`assistantTasks` é da decoradora) e as fontes do negócio |

### As três regras que valem para a lista inteira

1. **Nada envia sozinho.** A porta externa do ALTAR é uma só
   (`communicationsOutbox`) e está fechada. D3, D4 e D10 nascem como rascunho
   com aprovação humana ou não nascem.
2. **Nada escreve sem aprovação.** O Assistente lê. D7 e D11 mudam isso, e por
   isso dependem do sistema de aprovação — não de um modelo melhor.
3. **Nada mistura as camadas.** D12 é do Escritório e não pode reaproveitar
   `assistantTasks`; D1–D11 são da decoradora e não podem tocar em `users`
   inteira nem em `landingLeads`. `duas-camadas-de-ia.test.ts` falha se
   tentarem.
