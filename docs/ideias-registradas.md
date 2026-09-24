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
guarda o **resumo**. Um campo de ata no evento, com o Escritório transformando
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
