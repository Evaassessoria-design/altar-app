# Plano B — o que fazer quando algo cair ao vivo

Roteiro: `docs/live-altar-2026-10-06.md` · Horas: `docs/checklist-pre-live.md`

---

## As três regras

**1. Nunca tente a mesma coisa duas vezes na frente de quem assiste.** Uma
segunda tentativa custa trinta segundos de silêncio e passa insegurança. Vá
para o plano B na primeira falha.

**2. Diga o que aconteceu, em uma frase, sem pedir desculpas.** *"A geração
está demorando; deixa eu te mostrar o resultado que eu já tinha aqui."* Quem
assiste perdoa um contratempo; não perdoa alguém se enrolando.

**3. Tudo que depende de rede externa tem uma versão salva no computador.**
PDF gerado, vídeo gravado, telas em imagem.

---

## Por bloco

### Dashboard
**A.** `/dashboard` ao vivo.
**B.** Ir direto para `/eventos`: a lista com a saúde de cada evento conta a
mesma história — "o sistema olha por você" — e é uma consulta mais simples.

### Funil → proposta → evento
**A.** Criar a proposta na hora e marcar *Aceita*.
**B.** Abrir uma proposta **que já existe** na conta demo e mostrar o estado
final. O ponto é o reaproveitamento do dado, não o clique.
> Ter uma proposta já aceita preparada na demo torna o plano B instantâneo.

### Dentro do evento
**A.** Evento → Questionário → itens de montagem.
**B.** É a tela mais simples do roteiro. Se ela não abrir, o problema é a
conexão — vá para a contingência geral.

### Fornecedores e compras
**A.** Dossiê do fornecedor com contrato e orçamento.
**B.** `/compras` sozinho: o panorama de todos os eventos é forte por si só.

### Financeiro
**A.** `/financeiro` com a margem que se cala quando o custo está incompleto.
**B.** Contar esse comportamento em palavras. *"Ele prefere dizer 'custo
incompleto' a mostrar uma margem bonita e errada."* É um argumento que
funciona falado.

### Projeto Visual — **o bloco mais exposto**
**A.** `/eventos/:id/projeto` ao vivo.
**B.** Abrir o **PDF já gerado e salvo no computador**. Ele tem capa, conceito,
ambientes e fotos — conta a mesma história sem depender de nada.
**C.** Se nem o PDF abrir: as capturas de tela da pasta de contingência.

> Antes de começar a live, confira este bloco em **"Pronto para mostrar?"**.
> Se houver qualquer ✕, **não apresente**: uma tela vazia aqui custa mais do
> que não mostrar.

### PDF dos noivos
**A.** Gerar na hora.
**B.** O arquivo salvo na véspera. Ninguém percebe a diferença.
> A geração roda no navegador e monta imagem. Num computador ocupado pela
> transmissão, pode demorar mais que o normal.

### Assistente (`/assistente`) — **o único bloco descartável**
> Até 28/09 este bloco se chamava "Escritório de IA" aqui. A tela da live é
> `/assistente`; `/escritorio` é o painel do negócio ALTAR e recusa a conta
> de demonstração.

**A.** Duas perguntas, ao vivo.
**B.** Se o modelo cair, **a resposta ainda vem** — escrita por regra, com os
mesmos números, e a tela avisa que não passou por modelo. Leia-a como está:
*"isto é o ALTAR lendo os seus dados; a redação por IA está fora agora"*.
**C.** Se nem isso vier (a tela ficar em "trabalhando"), pular. Frase pronta:
*"o que ela faz é ler o que já está aqui e resumir — e é exatamente isso que eu
acabei de mostrar à mão."*
> Desde 28/09 o Assistente desiste do modelo em 30 s e responde por regra com
> o que já leu; uma área que falhe não derruba as outras. A tarefa que parar
> de verdade aparece como "não terminou" em até 5 min, em vez de girar para
> sempre.

---

## Falhas gerais

### O Convex oscila (tela carregando sem parar)
1. **F5 uma vez.** Só uma.
2. Se voltar, siga.
3. Se não, **vídeo gravado** e abra para perguntas.
> Sintoma: *skeletons* que não somem. Reconhecer isso em dois segundos é o que
> evita trinta segundos olhando para a tela.

### A internet cai
1. Queda curta: fale sobre o problema que o ALTAR resolve — é conteúdo, não
   enrolação.
2. Queda longa: passe o vídeo e conduza as perguntas.
3. Tenha o **roteador do celular** pareado **antes** da live.

### A IA demora
Conte até cinco. Passou disso, **narre** ("ele está lendo o financeiro, os
eventos e as compras") — a resposta por regra chega sozinha se o modelo não
responder em 30 s. Não repita a pergunta.

### Apareceu dado que não devia
Se `/admin`, a Central ou uma conta real aparecer: **feche a aba imediatamente**
e siga sem comentar. Explicar chama atenção para o que ninguém tinha notado.
> Prevenção vale mais: abrir **só** as abas do roteiro, e nenhuma outra.

### Alguém pergunta algo que o ALTAR não faz
*"Isso ainda não existe. O que existe hoje é X."* Nunca prometa prazo.
Anote no chat e responda depois — é lead qualificado.

---

## A pasta de contingência

Numa pasta local, **antes** da live:

- `contingencia/projeto-visual.pdf` — gerado na véspera
- `contingencia/demo-completa.mp4` — 15 min, mesma ordem
- `contingencia/telas/` — captura de cada uma das 11 telas do roteiro
- `contingencia/link-inscricao.txt` — para colar no chat

**Fora da nuvem.** Se a internet caiu, o Drive caiu junto.
