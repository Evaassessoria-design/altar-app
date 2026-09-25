# Checklist pré-live — 06/10/2026, 19:00

Roteiro e narrativa: `docs/live-altar-2026-10-06.md`
Preparar a conta: `docs/checklist-demo-manual.md`
O que fazer se algo cair: `docs/plano-b-live.md`

Este arquivo tem duas vistas do mesmo trabalho: a **triagem por prioridade**
(logo abaixo) e a **ordem das horas** (depois). A primeira responde "o que não
pode faltar"; a segunda, "o que eu faço agora".

---

## Triagem — o que não pode faltar

### OBRIGATÓRIO · sem isto, não se apresenta

- [ ] **Conta de demonstração funcional** — seed rodado, 18 tabelas com dado
- [ ] **Fotos na conta demo** — o seed NÃO cria fotos nem contrato, e sem elas
      o Projeto Visual (o clímax) abre vazio. Passos em
      `checklist-demo-manual.md`
- [ ] **Acesso da conta demo liberado** — ⚠️ **o seed não mexe no acesso.** Se
      o trial daquela conta tiver vencido, o paywall corta no bloco 2, na hora
      de converter a proposta em evento. Marcar a conta como `internal` pelo
      Painel Admin ANTES, e conferir abrindo a conversão uma vez
- [ ] **Conferir pelo produto, não pelo papel** — abrir o evento e usar
      **"Pronto para mostrar?"**: ele lê o banco e responde com número
- [ ] **Lista real de interessados importada** e `/campanha` aberta com ela
- [ ] **Os 10 modelos lidos em voz alta** — se algum soar como robô, reescrever
- [ ] **Link da sala definido** e gravado em `lib/campanha.ts`. Enquanto não
      existir, confirmação e lembretes saem com a pendência e **não podem ser
      aprovados** — que é o comportamento certo, e é um impedimento real
- [ ] **Roteiro ensaiado inteiro**, cronometrado, em voz alta
- [ ] **Preço decidido** e onde ele está escrito. Nenhum modelo o menciona, e
      nenhum deve
- [ ] **CTA final definido** — o que exatamente se pede no fim
- [ ] **Caminho do trial testado ponta a ponta** — do formulário à conta criada
- [ ] **Teste no celular** e **no notebook** que serão usados
- [ ] **Backup da apresentação**: PDF dos noivos salvo no computador e vídeo
      gravado dos blocos que dependem de rede
- [ ] **Internet e plano B** — `plano-b-live.md`, plano A e B de cada bloco

### IMPORTANTE · muda a qualidade, não impede

- [ ] Fotos do catálogo (rosa, lisianthus, eucalipto) para a Ficha Técnica
- [ ] Uma foto marcada **"Só para mim"**, para demonstrar a fronteira de
      audiência no PDF
- [ ] Segunda pessoa acompanhando o chat durante a transmissão
- [ ] Resposta pronta para "quanto custa?" e "tem app?"
- [ ] `/campanha` aberta num celular de verdade
- [ ] Conferir a landing num celular de verdade

### PODE ESPERAR · depois da live

- [ ] Templates aprovados na Meta
- [ ] Envio automático de qualquer natureza
- [ ] E-mail transacional
- [ ] Webhook de respostas ligado ao classificador
- [ ] Contador denormalizado de `assemblyItems`

---

## T-7 dias · 29/09

- [ ] `pnpm test` · `npx tsc -p tsconfig.app.json --noEmit` ·
      `npx tsc -p convex/tsconfig.json --noEmit` · `pnpm lint` · `pnpm build`
- [ ] Publicar no DEV e abrir as 11 telas do roteiro, uma a uma
- [ ] Conferir o deployment: **`healthy-pika-907`**, nunca `mellow-goose-539`
- [ ] Definir **qual conta** será usada, e sair de qualquer conta real
- [ ] Executar `docs/checklist-demo-manual.md` inteiro
- [ ] Criar o link de divulgação com `?campanha=live-altar-2026-10-06` e
      testá-lo: inscrever-se e ver o registro aparecer no painel
- [ ] Decidir o que se fala sobre **preço** — e que é o que está na landing

## T-3 dias · 03/10

- [ ] Ensaiar a demonstração **inteira**, cronometrada, em voz alta
- [ ] Anotar onde travou e ajustar o roteiro (não o produto)
- [ ] `/eventos/:id` → **"Pronto para mostrar?"** — tudo ✓
- [ ] Gerar o PDF dos noivos e **salvar no computador** (é o plano B do bloco 6)
- [ ] Conferir a landing num celular de verdade
- [ ] Conferir o formulário de inscrição ponta a ponta

## T-1 dia · 05/10

- [ ] **Gravar o vídeo de contingência**: 15 min, mesma ordem, salvo
      **localmente** — não na nuvem
- [ ] Repetir a suíte completa e o build
- [ ] Reconferir "Pronto para mostrar?" (alguém pode ter mexido)
- [ ] Testar o login numa janela anônima, com a senha em mãos
- [ ] Silenciar notificações do sistema e do navegador
- [ ] Carregar o computador e deixar o carregador na mesa
- [ ] Conferir que `/admin` **não** está entre as abas preparadas

## T-2 horas

- [ ] Reiniciar o computador
- [ ] Fechar e-mail, WhatsApp Web, Slack, calendário
- [ ] Abrir **só** as abas do roteiro, na ordem, já logadas
- [ ] Zoom do navegador em **125%**
- [ ] Tema **claro**
- [ ] Testar áudio, câmera e compartilhamento de tela
- [ ] Abrir o vídeo de contingência num player, minimizado
- [ ] Abrir o PDF já gerado, minimizado
- [ ] Água na mesa

## T-15 minutos

- [ ] Recarregar a aba do Dashboard — dados frescos
- [ ] Passar pelas abas na ordem, conferindo que nenhuma está com erro
- [ ] Celular no silencioso, **longe da mesa**
- [ ] Alguém de confiança acompanhando o chat
- [ ] Link de inscrição **copiado**, pronto para colar
- [ ] Respirar

---

## Depois da live, na mesma noite

- [ ] Exportar a lista de participantes da plataforma
- [ ] Painel → Interessados → **Importar lista**: campanha *Live ALTAR*,
      origem *Live*
- [ ] Conferir o preview **antes** de confirmar
- [ ] Marcar quem participou (etapa *Participou*)

## No dia seguinte

- [ ] Abrir a **fila de contato** da campanha
- [ ] Revisar, copiar e enviar **você mesma** — o ALTAR não envia nada
- [ ] Marcar "Já falei com ela" conforme envia
