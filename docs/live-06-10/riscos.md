# Riscos da live — o que ainda pode dar errado

Conferido em `26/09/2026`. Dez dias para a live.

Cada linha tem **dono**, **quando fecha** e **como se sabe que fechou**. Risco
sem essas três coisas é lamento, não risco.

Ordenado por *o que custa se acontecer*, não por probabilidade.

---

## Abertos — precisam de alguém

### 1. A demo sem fotos — **alta**

O seed não cria imagem nenhuma, e o bloco 6 é o clímax. Sem fotos: o Projeto
Visual abre sem capa e sem prateleiras, o PDF sai só com texto, e "Só para
mim" é **impossível** de demonstrar.

- **Como fecha:** [`../checklist-demo-manual.md`](../checklist-demo-manual.md),
  10–15 min com as imagens já separadas
- **Como se sabe:** abrir o evento → **"Pronto para mostrar?"**. Ela lê o banco
  e responde com número. Qualquer ✕ em fotos ou capa = **o bloco 6 não é
  apresentado**
- **Prazo:** T-1 dia, não no dia

### 2. Nenhuma das duas perguntas do bloco 7 foi vista respondendo — **média**

O encaminhamento está homologado por teste; a **redação da resposta** não, e
não tem como estar: ela depende de uma chamada de modelo
([`perguntas-assistente.md`](perguntas-assistente.md)).

- **Como fecha:** rodar as duas na conta de demonstração, num ensaio
- **Como se sabe:** você leu as duas respostas inteiras e elas não dizem
  nenhuma bobagem sobre os dados da demo
- **Prazo:** T-3 dias, para dar tempo de trocar a pergunta se uma sair ruim

### 3. `/escritorio` no lugar de `/assistente` — **alta, mitigada hoje**

O roteiro mandava abrir a tela errada. Com a conta de demonstração,
`/escritorio` mostra uma recusa de acesso — ao vivo, no bloco que deveria
mostrar a IA funcionando.

- **Estado:** corrigido em `live-altar-2026-10-06.md`, em
  `roteiro-curto.md` e em `perguntas-assistente.md`
- **O que sobra:** quem apresenta pode ter decorado a versão antiga
- **Como fecha:** ler o roteiro curto uma vez antes de ensaiar
- **Prazo:** antes do primeiro ensaio

### 4. O reset da demo nunca foi rodado contra um banco de verdade — **média**

`internal.demo.limpar` e `internal.demo.resetar` estão **publicados no DEV**
(`healthy-pika-907`, conferido em 26/09 com `npx convex function-spec`), mas
`ALTAR_DEMO` **não está definida lá** — e não deve estar: definir faria do DEV
um ambiente de demonstração e enfraqueceria a trava.

Consequência honesta: **os dois estão provados por teste e por mais nada.**
Dezesseis testes adversariais cobrem frase errada, ambiente desligado, rastro
de cobrança, banco nunca semeado, conta de outro usuário e foto subida à mão —
mas nenhum deles é uma pessoa clicando no painel do Convex.

- **Como fecha:** no projeto de demonstração (o que tem `ALTAR_DEMO=1`), rodar
  `internal.demo.checkEnvironment`, depois `resetar` com a frase, e conferir
  que os treze eventos voltaram
- **Como se sabe:** a resposta traz `resetou: true` e `apagadas.events: 13`
- **Prazo:** antes do primeiro ensaio — e **antes** de subir as fotos
- **Se não der tempo:** não use o reset. Ensaie sem ele e aceite a demo suja;
  perder as fotos vale mais do que um ensaio limpo

### 5. Abrir `/admin` ou a conta da piloto por engano — **alta**

`/admin` tem contas, receita e os leads desta própria live. A conta da piloto
tem clientes reais, com nome, telefone e valor.

- **Como fecha:** sair da conta da piloto **antes** de começar; abrir só as
  onze abas do roteiro, na ordem, antes de a transmissão começar
- **Como se sabe:** a barra de abas não tem nada além das onze
- **Prazo:** T-15 min

### 6. Falar preço de improviso — **média**

- **Como fecha:** abrir a landing numa aba e ler de lá. Só o que está escrito
- **Prazo:** T-15 min

### 7. Internet instável ou uma tela pendurada — **média**

- **Como fecha:** vídeo gravado de contingência acessível numa aba; regra dos
  cinco segundos; [`../plano-b-live.md`](../plano-b-live.md)
- **Como se sabe:** o vídeo abre e toca, testado no mesmo computador
- **Prazo:** T-1 dia

---

## Fechados — registrados para não voltarem

### O DEV rodando versão antiga do código

Durante a homologação de 25/09, `/escritorio` quebrou com *"Could not find
public function"*. Causa: **`npx convex codegen` não publica funções.** Ele
imprime "Uploading functions to Convex…", mas isso é análise de tipo
temporária. Quem publica é `npx convex dev --once`.

Cinquenta e uma funções de sete módulos estavam no código e não no deployment,
e nenhum teste podia ver isso — testes rodam contra o código.

- **O que ficou:** `node scripts/sincronia/conferir.mjs` compara o código com
  o que está publicado e recusa rodar contra produção
- **Rodar quando:** T-1 dia, e de novo depois de qualquer alteração

### Os números da demo não fechavam

Vinte e dois lançamentos do portfólio entraram pagos **sem data e sem forma de
pagamento** — recebimento quitado sem data, na tela. Corrigido no tipo: um
lançamento pago agora exige dizer como foi pago, e o TypeScript recusa antes do
teste.

- **O que ficou:** `convex/demo.coerencia.test.ts`, 19 asserções

### O ensaio sujava a demo e não havia como voltar

- **O que ficou:** `internal.demo.resetar`, com frase de confirmação digitada,
  e recusa quando encontra foto subida à mão
  ([`mapa-demo.md`](mapa-demo.md))

---

## O que decidimos NÃO resolver antes da live

Registrado para ninguém gastar tempo com isto nos dez dias que faltam.

| O quê | Por quê |
|---|---|
| Fotos geradas por código para a demo | Retângulos coloridos no clímax da apresentação seriam piores do que o passo manual documentado |
| Envio real por WhatsApp | A porta está fechada por decisão, e abri-la às vésperas é o pior momento possível |
| Ligar qualquer autonomia vermelha do Escritório | O modelo de autonomia recusa isso no código; mudar a regra para uma demonstração é trocar produto por efeito |
| Trocar a heurística do roteador do Assistente | "Compras" cai na Gestão e a resposta sai completa; mexer sem dado real para conferir custa mais do que rende |

---

## Ideias que a live vai gerar

Anotar em [`melhorias-pos-live.md`](melhorias-pos-live.md), **durante**. O que
se anota depois é o que se lembra, e não é o que doeu.
