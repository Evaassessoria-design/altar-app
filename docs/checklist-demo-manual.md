# Preparar a conta de demonstração — checklist manual

O seed (`convex/demo.ts`) cria 18 tabelas: evento, briefing, checklist,
orçamento, fornecedores, compras, financeiro, itens de montagem, equipe,
acervo, materiais, composições, lead e proposta.

**Ele não cria arquivo nenhum** — fotos e documentos dependem de upload, e o
ALTAR não fabrica binário falso. São esses os passos abaixo.

> **Não confie neste papel para saber se está pronto.** Abra o evento e use
> **"Pronto para mostrar?"** — a verificação lê o banco e responde com número
> ("3 de 8"), em vez de perguntar se você lembra de ter subido.

Tempo: **10 a 15 minutos**, com as imagens já separadas numa pasta.

---

## Antes de começar

Separe numa pasta:

- **8 a 12 imagens** de referência de decoração (arranjos, mesas, cerimônia)
- **1 imagem** de algo dando errado — peça torta, cor errada. Serve a um
  propósito só: mostrar que ela **não sai** no material da cliente
- **3 a 4 imagens** de flor isolada (rosa, lisianthus, eucalipto)
- **2 PDFs** quaisquer, renomeados para `contrato-marina-gabriel.pdf` e
  `orcamento-mobiliario.pdf`

---

## 1 · Galeria (5 min)

`/eventos/:id/fotos`

- [ ] Subir as 8–12 imagens de referência
- [ ] Em cada uma, definir **Ambiente**: use só 3 nomes, repetidos —
      *Cerimônia*, *Salão*, *Mesa do bolo*. Ambientes demais picotam o projeto
- [ ] Em cada uma, definir **Classificação**: a maioria como *Contratado*,
      duas ou três como *Inspiração*. É o contraste que o projeto mostra
- [ ] Subir a imagem do problema e marcá-la **"Só para mim"**
- [ ] Escolher uma foto como **capa**

> A foto "Só para mim" é o passo mais importante da demonstração inteira: é
> ela que prova, ao vivo, que o sistema separa o material interno do que vai
> para a cliente.

## 2 · Item de montagem (1 min)

`/eventos/:id` → Questionário → um item de montagem

- [ ] Em **Referência aprovada**, usar **"ou escolher da galeria"** e apontar
      para uma foto que já está lá

> Mostra que a mesma imagem não é enviada duas vezes.

## 3 · Catálogo (3 min)

`/catalogo` → aba Materiais

- [ ] Abrir rosa, lisianthus e eucalipto e enviar a foto de cada um
- [ ] Conferir que a miniatura aparece na lista

> Faz a seção **"Flores e materiais"** do Projeto Visual aparecer — e é a
> resposta para "o que é lisianthus?".

## 4 · Documentos (2 min)

- [ ] `/eventos/:id` → Pasta do evento → anexar `contrato-marina-gabriel.pdf`
      como **Contrato**
- [ ] `/eventos/:id/fornecedores` → abrir um fornecedor → **Documentos desta
      contratação** → anexar `orcamento-mobiliario.pdf` como **Orçamento**

> O segundo mostra o dossiê por fornecedor, que é onde ela pensa.

## 5 · Conferência (2 min)

- [ ] `/eventos/:id` → **"Pronto para mostrar?"** — tudo em ✓, nada em ✕
- [ ] `/eventos/:id/projeto` — capa, conceito, ambientes com prateleiras,
      flores com foto
- [ ] Gerar o **PDF dos noivos** e abrir
- [ ] **Conferir no PDF**: a foto "Só para mim" **não** está lá; nenhuma
      legenda interna; nenhum fornecedor; nenhum valor

---

## Se faltar tempo

Prioridade, nesta ordem:

1. Passos **1** e **5** — sem eles o Projeto Visual abre vazio e **o bloco não
   deve ser apresentado**
2. Passo **3** — a seção de flores some sem quebrar nada
3. Passo **4** — o dossiê do fornecedor fica vazio
4. Passo **2** — o reaproveitamento vira conversa, não demonstração
