# Prontidão comercial do ALTAR

Este arquivo responde a uma pergunta operacional: **o que eu posso mostrar, e
o que eu não devo mostrar ainda?**

Ele é a rede de segurança do roteiro em `docs/demo-comercial.md`. Antes de abrir
uma tela que não está no roteiro, consulte a matriz. Antes de prometer qualquer
coisa, consulte a matriz.

Datado de 20/09/2026 e conferido contra o código em `c0fdf39`. Quando divergir, o
código está certo e este arquivo está velho.

---

## As quatro classificações

| Classificação | O que significa na prática |
|---|---|
| **PRONTO** | Funciona, está testado, e pode ser mostrado ao vivo sem preparo. |
| **PRONTO COM RESSALVA** | Funciona, mas tem um limite que aparece se a pessoa insistir. Pode mostrar — sabendo a ressalva de cor. |
| **NÃO MOSTRAR AINDA** | Existe, mas abrir na frente de um cliente gera uma pergunta que você não quer responder agora, ou expõe algo que não é dele. |
| **FUTURO** | Não existe. Se perguntarem, a resposta é "ainda não implementado". |

Uma distinção que vale a reunião inteira: **"não existe" é diferente de "existe
e está desligado"**. Para o segundo caso a resposta é *"preparado tecnicamente,
mas ainda não liberado"* — e ela só se aplica a duas coisas neste produto, as
duas marcadas abaixo.

---

## 1. Comercial — do primeiro contato ao contrato

| Recurso | Situação | Observação |
|---|---|---|
| Funil kanban com sete estágios | **PRONTO** | Do primeiro contato ao fechado, com descarte. |
| Registro de contato e follow-up | **PRONTO** | Data do último contato e próxima ação, com contagem de quem está sem próxima ação. |
| Documentos do lead (proposta, contrato, comprovante) | **PRONTO** | Sobrevivem à conversão em evento — o lead continua sendo a origem deles. |
| Conversão de lead em evento | **PRONTO COM RESSALVA** | Funciona e reaproveita o que já foi digitado. **Não converta ao vivo numa demonstração**: altera os dados do demo. |
| Captação pela landing | **PRONTO** | O formulário da landing grava o interessado. Aparece no Painel Admin, não no app da decoradora. |
| Importar leads de planilha | **FUTURO** | Não existe importação de nenhum tipo. |
| Proposta comercial gerada pelo sistema | **FUTURO** | A proposta é anexada, não gerada. |

---

## 2. Evento — briefing, planejamento e documentos

| Recurso | Situação | Observação |
|---|---|---|
| Cadastro do evento, status e responsável | **PRONTO** | |
| Briefing com 61 campos em 8 áreas | **PRONTO** | O número é conferido por teste contra o código. |
| Checklist de pré e pós-evento | **PRONTO** | Sem fotos por item — as fotos são do Caderno de Montagem. |
| Galeria por fase (antes, montagem, evento, desmontagem) | **PRONTO** | |
| Orçamento do evento com orçado × real | **PRONTO** | Só o que passa pela empresa da decoradora — fornecedor do casal não entra, de propósito. |
| Saúde do evento e resumo operacional | **PRONTO** | É o que alimenta o "Precisam da sua atenção" do Início. |
| Agenda do dia (escala por horário) | **PRONTO** | Agenda própria do ALTAR. |
| Sincronização com Google Agenda | **FUTURO** | A tela diz "Em breve" e é honesta: não há autenticação, API nem sincronização. |
| PDFs com a identidade visual da empresa | **PRONTO** | Cinco documentos: resumo do evento, orçamento, ficha técnica, caderno de montagem e folha de carregamento. |
| Importação de contrato por IA | **PRONTO COM RESSALVA** | Ela **lê e propõe**; aplicar é ação da pessoa. Depende da chave de IA estar configurada no ambiente — **confirme antes da reunião**. |
| Planta Premium (croqui → planta 2D) | **PRONTO COM RESSALVA** | Versionada, croqui original preservado. Depende do provedor de imagem configurado. Sem ele, a tela avisa que a geração está indisponível. |

---

## 3. Produção — o diferencial

Este é o trecho que decide a venda. Também é o trecho com mais ressalvas, e por
isso vale saber cada uma.

| Recurso | Situação | Observação |
|---|---|---|
| Itens de montagem por ambiente (Projeto de decoração) | **PRONTO** | |
| Receita por item (do que a peça é feita) | **PRONTO** | Snapshot: editar a biblioteca depois não altera um evento já aprovado. |
| Aplicar uma receita da biblioteca | **PRONTO** | |
| Salvar uma receita na biblioteca | **PRONTO** | O ciclo fecha: escreve uma vez, reaproveita sempre. Vai o que está NA TELA, e o nome repetido é recusado em vez de virar uma segunda entrada igual. |
| **Renomear ou arquivar** uma composição salva | **PRONTO COM RESSALVA** | "Renomear ou arquivar esta receita na biblioteca", dentro do diálogo da receita, com a lista dos eventos em que ela já foi usada. Ressalva: a manutenção acontece de dentro da receita — não há tela de biblioteca no menu, como no catálogo de materiais. |
| **Duplicar** uma composição | **FUTURO** | `compositions.duplicate` existe no servidor e não tem tela. |
| Cadastrar material | **PRONTO COM RESSALVA** | Nasce — e agora também se corrige — de dentro do diálogo da receita. Não há tela de catálogo no menu. |
| **Editar ou arquivar** um material | **PRONTO COM RESSALVA** | O lápis ao lado do material na receita abre nome, categoria, tipo, custo, margem e arquivar. Ressalva: não há tela de catálogo no menu para revisar a lista inteira. |
| Consolidado de necessidade do evento | **PRONTO** | A multiplicação e a soma por material e unidade. |
| Margem de segurança por material | **PRONTO** | `necessário` e `sugerido` ficam separados de propósito. |
| Geração de compras a partir da ficha | **PRONTO COM RESSALVA** | Idempotente. **Não acione ao vivo**: muda os números que você acabou de citar. |
| Caderno de montagem e folha de carregamento em PDF | **PRONTO** | É a resposta do produto para o galpão sem sinal. |
| Reservar uma peça do acervo à mão | **PRONTO** | "Reservar peça", no acervo do evento: escolhe do acervo, sugere a janela pela data do evento e mostra quantas estão livres nela antes de gravar. |
| Desvincular uma compra da ficha | **PRONTO** | A compra vinculada aparece pelo NOME na linha aberta, com o caminho de volta. |
| Desfazer o lançamento de uma compra no financeiro | **PRONTO** | O rótulo "no financeiro" virou ação, com pergunta antes. Só apaga o lançamento que nasceu da compra. |
| Caderno de montagem por audiência (cliente / equipe / interno) | **PRONTO** | O menu pergunta para quem é o documento. A regra é aninhada: o caderno da cliente não carrega item de equipe nem interno. |

---

## 4. Acervo — as peças que são dela

| Recurso | Situação | Observação |
|---|---|---|
| Cadastro por quantidade | **PRONTO** | Por quantidade, nunca por peça numerada. É decisão, não limitação — explique assim. |
| Reserva por evento, com janela de datas | **PRONTO** | |
| Detecção de conflito entre eventos | **PRONTO** | |
| Déficit visível ("faltam 30, você tem 150") | **PRONTO** | O melhor momento da demonstração. |
| Reserva gerada a partir da ficha técnica | **PRONTO COM RESSALVA** | Funciona e é idempotente. **Não acione ao vivo.** |
| Saída, retorno e ajuste com histórico auditável | **PRONTO** | O total nunca muda sozinho: o sistema avisa e espera a decisão dela. |
| Déficit visível na lista geral do Acervo | **PRONTO** | "Faltam 30 un em 09/10 — 180 prometidos, 150 no acervo", direto na lista. Não é "disponível agora" (que exigiria janela): é o pior dia do item. |
| Etiqueta, QR code, patrimônio individual | **FUTURO** | Decisão consciente: é ERP, e a pergunta dela não exige isso. |

---

## 5. Compras e dinheiro

| Recurso | Situação | Observação |
|---|---|---|
| Lista de compras por evento | **PRONTO** | |
| Panorama semanal e filtros de situação | **PRONTO** | `A resolver`, `Atrasadas`, `Aguardando entrega`, `Fora do financeiro`. |
| Responsável e prazo por compra | **PRONTO** | |
| Vínculo compra ↔ livro-caixa | **PRONTO** | Impede a mesma despesa de ser contada duas vezes. |
| Anexar pedido em PDF ou imagem na compra | **FUTURO** | Não existe. Estava prometido na landing e foi removido de lá. |
| Livro-caixa com receitas, despesas e a receber | **PRONTO** | |
| Custo real do evento e margem | **PRONTO** | |
| Gráfico de 6 meses | **PRONTO** | |
| Emissão de boleto / cobrança do cliente dela | **FUTURO** | O financeiro é livro-caixa. Não emite cobrança e não fala com banco. |
| Nota fiscal, integração contábil, ERP | **FUTURO** | |
| Comissão, pró-labore, folha | **FUTURO** | |

---

## 6. Fornecedores e equipe

| Recurso | Situação | Observação |
|---|---|---|
| Catálogo central de fornecedores | **PRONTO** | Por empresa, com deduplicação por nome e telefone. |
| Dossiê por evento, com estágio e alinhamentos datados | **PRONTO** | O melhor argumento depois do acervo. |
| Cadastro de equipe e escala por evento | **PRONTO** | Função, horário, contato. |
| Login para a equipe | **FUTURO** | A equipe é cadastrada, não tem acesso. O que vai para ela é o PDF. |
| Notificar a equipe pelo sistema | **FUTURO** | Não existe. Estava prometido na landing e foi removido de lá. |

---

## 7. Conta, assinatura e plataforma

| Recurso | Situação | Observação |
|---|---|---|
| Cadastro, login e recuperação de senha | **PRONTO** | E-mail e senha. |
| Teste de 14 dias sem cartão | **PRONTO** | O número é conferido por teste contra o servidor. |
| Assinatura, checkout e reconciliação diária | **PRONTO** | |
| Paywall aplicado no servidor | **PRONTO** | Bloqueia o que cria e o que custa; ler, editar e baixar o que já existe continua. Um aviso permanente explica e leva à assinatura. |
| Planos, cupons, convites | **FUTURO** | Existe um preço e uma assinatura. |
| Segunda pessoa na mesma empresa (sócia, secretária) | **FUTURO** | A conta é de uma pessoa. Esta é a pergunta nº 1 das reuniões — saiba a resposta de cor. |
| Duas marcas na mesma conta (multiempresa) | **FUTURO** | O modelo de dados é por usuário. Uma tentativa de migrar foi revertida antes de virar produto. |
| Aplicativo nativo (App Store / Play Store) | **FUTURO** | É um PWA: instala pelo navegador na tela inicial e abre como aplicativo. |
| Funcionar sem internet | **FUTURO** | As telas precisam de conexão. A resposta do produto para o galpão é o papel. |
| Exportação completa dos dados | **FUTURO** | Os documentos saem em PDF. Exportação da base, não. |

---

## 8. O que existe e NÃO deve ser mostrado

| Tela | Situação | Por quê |
|---|---|---|
| `Painel Admin` | **NÃO MOSTRAR AINDA** | É a operação do SaaS: contas de outros clientes, métricas, avisos de cobrança. Mostrar dado de outra decoradora é o pior acidente possível numa reunião de vendas. |
| `Central` (Central de Comunicações) | **NÃO MOSTRAR AINDA** | É a ferramenta com que o ALTAR atende os próprios clientes, não um recurso da decoradora. Abrir cria a expectativa de que ela vai atender as clientes dela por ali. |
| Envio externo pela Central | **Preparado tecnicamente, mas ainda não liberado** | O caminho existe inteiro e o portão de saída recusa por construção. Ligar exige número comercial integrado e uma decisão explícita. Não é assunto de reunião comercial. |
| WhatsApp / Meta Cloud de verdade | **FUTURO** | A arquitetura multicanal existe e opera em modo simulado. Integração real com a Meta: ainda não implementado. |
| Política de autonomia da IA | **Preparado tecnicamente, mas ainda não liberado** | O campo é gravável e **inerte** por decisão. Nenhuma ação de IA acontece sem aprovação humana, em lugar nenhum do produto. |
| Ponte do Escritório 3D | **NÃO MOSTRAR AINDA** | Somente leitura, uso interno. Não é produto. |

---

## 9. Decisões de produto pendentes

Encontradas na auditoria e **registradas, não implementadas**. Nenhuma delas
impede a demonstração; todas mudam a resposta a uma pergunta que vai aparecer.

1. **Segunda pessoa na empresa.** É a pergunta mais frequente e hoje a resposta
   é "não". Decidir se o caminho é usuário adicional dentro da conta ou o
   retorno do modelo multiempresa — são projetos de tamanhos muito diferentes.

2. **Tela do catálogo no menu.** Corrigir um material de dentro da receita já
   funciona; o que não existe é o lugar para revisar a lista inteira antes da
   temporada.

3. **Tela da biblioteca de composições.** Renomear e arquivar já existem,
   dentro da receita. O que não existe é o lugar para revisar a biblioteca
   inteira — é a mesma decisão da linha 2, e provavelmente a mesma tela.

4. **Aviso de primeiros passos que não some sozinho.** Com o essencial pronto
   ele diz "Configuração concluída" e oferece **Dispensar**, mas só sai no
   clique. Decidir se ele se fecha sozinho — é escrita sem ação de ninguém.

5. **Quando ligar o envio externo da Central.** Exige número comercial
   integrado e um critério medido de acerto da IA. É decisão de fase, não de
   código.

---

## 10. Resumo em uma frase

**Pode mostrar sem medo:** funil, evento, briefing, fornecedores, projeto,
ficha técnica, acervo, compras, financeiro, orçamento, equipe, agenda e os PDFs.

**Mostre sabendo a ressalva:** IA (confira o ambiente antes), geração de
compras e reservas (não acione ao vivo), e a manutenção do catálogo — material
e composição se corrigem de dentro da receita, e não há tela de catálogo no
menu para revisar a lista inteira.

**NUNCA mande para a cliente:** o PDF do Orçamento. Ele traz custo, lucro e
margem — agora diz isso no título, no rodapé de toda página e no nome do
arquivo (`altar-orcamento-interno-…`), mas o cuidado é seu. A proposta
comercial da cliente **ainda não existe**; se perguntarem, é isso que se diz.

**Não abra:** Painel Admin, Central, e qualquer botão que escreve.

**Se perguntarem e não existir:** diga que ainda não existe. Uma promessa
cobrada em três meses custa mais caro do que um "ainda não" na reunião.
