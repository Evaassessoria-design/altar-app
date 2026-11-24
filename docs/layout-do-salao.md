# Layout do salão (2D + 3D)

A planta EDITÁVEL do evento, em escala: salão em metros, entradas, pilares,
peças (palco, pista, bar, buffet, lounges…) e mesas numeradas. Dela saem três
leituras — a planta 2D na tela, a vista 3D e o PDF para os clientes — e
nenhuma guarda cópia própria.

Tela: `/eventos/:id/layout` (link "Layout do salão 2D + 3D" dentro do evento).

## O que a decoradora faz ali

- **Cria** por modelo pronto (medidas + nº de mesas), copiando o layout de
  OUTRO evento dela ("mesmo salão") ou com a **IA**, que lê a foto do croqui
  e/ou a descrição e devolve um RASCUNHO. Nada da IA é gravado até ela salvar.
- **Edita** arrastando peças e mesas, adicionando da **biblioteca de peças**
  (medidas usuais de partida), girando, duplicando, renumerando as mesas pela
  posição, com desfazer/refazer.
- **Liga fotos de referência** da Galeria do evento a cada peça (o bar, a mesa
  do bolo, o lounge). É ponteiro para `eventPhotos`, nunca cópia.
- **Mantém várias opções** por evento ("com ilha de frios" / "sem") — até 20.
- **Gera o PDF para os clientes**: planta 2D, vista 3D (a que estiver na tela)
  e página de referências com as fotos ligadas.

## Onde mora

| Parte | Arquivo |
|---|---|
| Validadores, limites, regras puras | `convex/lib/layoutSalao.ts` |
| Biblioteca de peças, modelos, distribuir mesas | `convex/lib/layoutSalaoBiblioteca.ts` |
| Prompt e leitura defensiva da resposta da IA | `convex/lib/layoutSalaoIa.ts` |
| Queries e mutations (posse, fotos, limites) | `convex/layoutSalao.ts` |
| Action da IA (não grava) | `convex/layoutSalaoIa.ts` |
| Desenho 2D (uma lista de formas, duas leituras) | `src/lib/layout-salao.ts` |
| Editor 2D, 3D (three.js, sob demanda), painéis | `src/components/layout-salao/*` |
| PDF dos clientes | `src/lib/generate-layout-pdf.ts` |

## Decisões

- **Tabela nova (`eventLayouts`), não `layoutRenders`.** A Planta Premium guarda
  IMAGENS geradas por IA; isto guarda DADOS. A justificativa está no marco de
  `arquitetura-sem-paralelos.test.ts`.
- **Listas dentro do documento, com teto.** O layout é gravado inteiro em
  "Salvar"; `LIMITES` (500 mesas, 300 peças…) é conferido no servidor.
- **Paywall:** editar é dado dela e fica livre, como o briefing. A IA e o envio
  do croqui passam pela trava de acesso (`requireActiveAccessAction`,
  `layoutRenders.generateUploadUrl`).
- **Fotos:** toda foto ligada é conferida — minha E deste evento. Copiar o
  layout para outro evento deixa as fotos para trás (`semFotos`).
- **Um desenho, duas leituras:** a tela e o PDF usam `desenharPlanta`. Há teste
  que trava isso (`src/lib/layout-salao.test.ts`).
- **IA não inventa medida:** coordenada fora do salão é trazida para dentro E
  avisada; contagem pedida pela pessoa vale mais que a da IA; resposta
  ilegível vira salão em branco com aviso.

## Próximos passos possíveis (não feitos)

- Puxar peças do **Acervo** da decoradora (com as medidas reais dela) para a
  biblioteca.
- Link público só-leitura do 3D para os clientes (hoje o caminho é o PDF).
- Lista de convidados por mesa (mapa de assentos).
