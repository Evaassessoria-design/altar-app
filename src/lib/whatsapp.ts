// ─────────────────────────────────────────────────────────────────────────────
// O ATALHO DE WHATSAPP — um lugar só
//
// ── POR QUE CENTRALIZAR ─────────────────────────────────────────────────────
// O padrão `wa.me/55${telefone.replace(/\D/g, "")}` estava copiado em quatro
// telas, e as quatro cópias traziam o MESMO defeito: quem salva o telefone
// como "+55 11 99999-9999" — jeito normal de colar da agenda do celular —
// virava `5555119999999999`, e o atalho abria o WhatsApp num número que não
// existe. Sem erro, sem aviso: a conversa simplesmente não abre.
//
// Aqui o 55 só entra quando falta, o número curto demais não vira link nenhum
// (melhor não oferecer o botão do que oferecer um que não funciona), e o texto
// vai codificado.
//
// ── O QUE ESTE MÓDULO NÃO É ─────────────────────────────────────────────────
// Não é envio. Ele monta um ENDEREÇO que abre o WhatsApp **dela**, com o texto
// escrito, para ela ler, corrigir e mandar com o dedo. Nada aqui chama `fetch`,
// e a porta de envio externo (`communicationsOutbox`) continua fechada — esta
// é a mesma natureza do atalho que já existe no funil e na capa do evento.
//
// A Central e o painel admin têm atalhos próprios com OUTRA regra (o valor do
// canal já chega internacional, sem DDI para acrescentar). Não são clientes
// deste módulo de propósito: forçar as duas regras numa função só faria a
// função decidir por adivinhação.
// ─────────────────────────────────────────────────────────────────────────────

/** DDI do Brasil. Todo cliente de decoradora brasileira tem este. */
const DDI = "55";

/**
 * Menor número de dígitos que pode ser um telefone brasileiro: DDD + 8.
 * Abaixo disso é cadastro incompleto ("9999-8888" sem DDD, ou um pedaço),
 * e um link com ele abriria o WhatsApp num número errado.
 */
const MINIMO_DE_DIGITOS = 10;

/**
 * O endereço que abre a conversa, ou `null` quando não há número utilizável.
 *
 * `null` é resposta de verdade: quem chama NÃO desenha o botão. Botão que
 * abre uma conversa vazia com um número inválido é pior do que botão nenhum,
 * porque ela só descobre na frente da cliente.
 */
export function linkDeWhatsapp(
  telefone: string | null | undefined,
  texto?: string,
): string | null {
  const digitos = (telefone ?? "").replace(/\D/g, "");
  if (digitos.length < MINIMO_DE_DIGITOS) return null;

  // Já veio com DDI? Então não se acrescenta outro. 12 dígitos = 55 + DDD + 8;
  // 13 = 55 + DDD + 9. Um número de 11 que comece com 55 é DDD 55 (Santa
  // Maria, RS) e precisa do DDI — é por isso que o tamanho entra na conta, e
  // não só o começo.
  const comDdi =
    digitos.startsWith(DDI) && (digitos.length === 12 || digitos.length === 13)
      ? digitos
      : `${DDI}${digitos}`;

  const base = `https://wa.me/${comDdi}`;
  const limpo = texto?.trim();
  return limpo ? `${base}?text=${encodeURIComponent(limpo)}` : base;
}

/**
 * O primeiro nome, para a mensagem não começar com o nome inteiro da cliente.
 *
 * Vazio quando não há nome: a saudação vira "Oi!", que é melhor do que
 * "Oi undefined!" e melhor do que não saudar.
 */
export function primeiroNome(nome: string | null | undefined): string {
  return (nome ?? "").trim().split(/\s+/)[0] ?? "";
}

/** "Oi Marina!" ou "Oi!" — nunca "Oi !". */
function saudacao(nome: string | null | undefined): string {
  const primeiro = primeiroNome(nome);
  return primeiro ? `Oi ${primeiro}!` : "Oi!";
}

/**
 * A COBRANÇA DE UMA PENDÊNCIA DE REUNIÃO.
 *
 * "A noiva manda a lista de convidados até sexta" fica registrado na ata e no
 * painel — e quem cobra é ela, de manhã, no WhatsApp. O texto é rascunho: sai
 * no aplicativo dela, para ler e mandar.
 *
 * Sem prazo a frase NÃO inventa urgência ("até undefined" ou "o quanto
 * antes"): ausência de prazo não é prazo apertado.
 */
export function textoDaPendencia(p: {
  cliente: string | null | undefined;
  evento: string;
  texto: string;
  /** Já formatado por quem chama — a tela sabe o fuso. */
  prazo?: string;
}): string {
  const combinado = p.prazo
    ? `${p.texto} — combinamos até ${p.prazo}`
    : p.texto;
  return `${saudacao(p.cliente)} Passando para lembrar do que combinamos sobre ${p.evento}: ${combinado}. Qualquer dúvida, me chama.`;
}

/**
 * A COBRANÇA DE UMA PARCELA VENCIDA.
 *
 * `valor` e `vencimento` chegam PRONTOS. Dinheiro neste produto é centavo
 * (`lib/pagamentosDoEvento.ts`) e data tem fuso do negócio: refazer qualquer
 * das duas contas aqui criaria uma segunda verdade sobre o valor cobrado — e a
 * segunda verdade sobre dinheiro é a pior de todas.
 *
 * Quem chama passa o SALDO, não o valor da parcela: cobrar R$ 2.500 de quem já
 * pagou R$ 1.000 é erro que custa a confiança da cliente.
 */
export function textoDaParcela(p: {
  cliente: string | null | undefined;
  evento: string;
  descricao: string;
  valor: string;
  vencimento: string;
}): string {
  return `${saudacao(p.cliente)} Passando para lembrar da parcela "${p.descricao}" do ${p.evento}, de ${p.valor}, que venceu em ${p.vencimento}. Se já tiver pago, me manda o comprovante que eu dou baixa.`;
}
