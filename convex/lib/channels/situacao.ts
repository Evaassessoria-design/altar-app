import type { Canal } from "./tipos";

// ─────────────────────────────────────────────────────────────────────────────
// EM QUE PÉ ESTÁ CADA CANAL
//
// ── POR QUE ISTO NÃO É UM BOOLEANO ──────────────────────────────────────────
// `adaptador.configurado()` responde "tem credencial?". É a pergunta certa
// para o gateway decidir entre aceitar e devolver 503, e é a pergunta ERRADA
// para uma tela.
//
// Entre "não tem credencial" e "manda mensagem" existem três estados que
// importam para quem opera, e confundi-los produz decisões caras:
//
//   · tem credencial e o portão está fechado — RECEBE e não envia;
//   · o portão abriu e nada saiu ainda       — ninguém provou que funciona;
//   · saiu com sucesso pelo menos uma vez    — aí sim.
//
// Um booleano mostra "configurado ✓" nos três, e alguém conclui que o WhatsApp
// está funcionando. Na noite da live, isso vira trinta mensagens que ninguém
// mandou e ninguém recebeu.
//
// ── A REGRA DA CASA, APLICADA A INFRAESTRUTURA ──────────────────────────────
// A tela nunca afirma o que não sabe. Quando a contagem de entregas não foi
// medida, o resultado é `homologando` com o motivo escrito — nunca `ativo` por
// otimismo.
// ─────────────────────────────────────────────────────────────────────────────

export const SITUACOES = [
  "nao_configurado",
  "configurado",
  "homologando",
  "ativo",
  "erro",
] as const;

export type SituacaoDoCanal = (typeof SITUACOES)[number];

export type FatosDoCanal = {
  canal: Canal;
  /** Existe adaptador escrito para este canal neste build? */
  temAdaptador: boolean;
  /** `adaptador.configurado()` — as credenciais estão no ambiente? */
  credenciais: boolean;
  /** `ALTAR_CENTRAL_ENVIO_HABILITADO` resolvido. O portão de saída. */
  envioHabilitado: boolean;
  /**
   * Quantas mensagens saíram com sucesso. `undefined` = não foi medido.
   *
   * `undefined` NÃO é zero. Zero é "tentamos e nunca deu certo"; ausente é
   * "ninguém contou". Os dois levam a `homologando`, com motivos diferentes.
   */
  entregasComSucesso?: number;
  /** A última tentativa que falhou, se houve. */
  ultimaFalha?: { quando: number; motivo: string };
  /** Quando foi a última entrega bem-sucedida. */
  ultimaEntrega?: number;
};

export type LeituraDoCanal = {
  canal: Canal;
  situacao: SituacaoDoCanal;
  /** O rótulo que vai para a tela. Em português, sem jargão. */
  rotulo: string;
  /** Por que está neste estado. Sempre sobre fato verificado. */
  detalhe: string;
  /** O que precisa acontecer para o próximo estado. Ausente em `ativo`. */
  proximoPasso?: string;
  /** Recebe mensagem de fora? */
  recebe: boolean;
  /** Envia mensagem para fora? */
  envia: boolean;
};

const ROTULO: Record<SituacaoDoCanal, string> = {
  nao_configurado: "Não configurado",
  configurado: "Configurado — só recebe",
  homologando: "Em homologação",
  ativo: "Ativo",
  erro: "Com erro",
};

/**
 * Em que pé está este canal.
 *
 * ── A ORDEM DAS PERGUNTAS ───────────────────────────────────────────────────
 * Credencial antes de portão antes de entrega. É a ordem em que uma pessoa
 * investigaria, e garante que "com erro" nunca apareça para um canal que nem
 * tem credencial — o erro ali seria a ausência de configuração, não uma falha.
 */
export function situacaoDoCanal(f: FatosDoCanal): LeituraDoCanal {
  const base = { canal: f.canal };

  if (!f.temAdaptador) {
    return {
      ...base,
      situacao: "nao_configurado",
      rotulo: ROTULO.nao_configurado,
      detalhe: "Este canal ainda não tem adaptador escrito no ALTAR.",
      proximoPasso: "Escrever o adaptador do canal em lib/channels/.",
      recebe: false,
      envia: false,
    };
  }

  if (!f.credenciais) {
    return {
      ...base,
      situacao: "nao_configurado",
      rotulo: ROTULO.nao_configurado,
      detalhe: "As credenciais deste canal não estão neste ambiente.",
      proximoPasso: "Configurar as credenciais do provedor.",
      // Sem credencial não há como validar a assinatura de quem chega, e
      // aceitar sem validar é aceitar qualquer um. A porta fica fechada.
      recebe: false,
      envia: false,
    };
  }

  if (!f.envioHabilitado) {
    return {
      ...base,
      situacao: "configurado",
      rotulo: ROTULO.configurado,
      detalhe:
        "As credenciais estão configuradas e o canal recebe mensagens. O envio externo está desligado neste ambiente.",
      proximoPasso:
        "Ligar ALTAR_CENTRAL_ENVIO_HABILITADO quando houver provedor homologado.",
      recebe: true,
      envia: false,
    };
  }

  // Daqui para baixo o portão está aberto. Falha recente manda no rótulo:
  // dizer "ativo" com a última tentativa quebrada é a informação mais cara de
  // todas, porque é a que faz ninguém ir olhar.
  if (f.ultimaFalha && (f.ultimaEntrega === undefined || f.ultimaFalha.quando > f.ultimaEntrega)) {
    return {
      ...base,
      situacao: "erro",
      rotulo: ROTULO.erro,
      detalhe: `A última tentativa de envio falhou: ${f.ultimaFalha.motivo}`,
      proximoPasso: "Conferir credenciais e o estado da conta no provedor.",
      recebe: true,
      envia: false,
    };
  }

  if (f.entregasComSucesso === undefined) {
    return {
      ...base,
      situacao: "homologando",
      rotulo: ROTULO.homologando,
      detalhe: "O envio está ligado, e não há medição de entregas para confirmar que funciona.",
      proximoPasso: "Enviar uma mensagem de teste e conferir se ela chegou.",
      recebe: true,
      envia: true,
    };
  }

  if (f.entregasComSucesso === 0) {
    return {
      ...base,
      situacao: "homologando",
      rotulo: ROTULO.homologando,
      detalhe: "O envio está ligado e nenhuma mensagem saiu com sucesso ainda.",
      proximoPasso: "Enviar uma mensagem de teste e conferir se ela chegou.",
      recebe: true,
      envia: true,
    };
  }

  return {
    ...base,
    situacao: "ativo",
    rotulo: ROTULO.ativo,
    detalhe: `${f.entregasComSucesso} ${f.entregasComSucesso === 1 ? "mensagem entregue" : "mensagens entregues"} por este canal.`,
    recebe: true,
    envia: true,
  };
}

/**
 * A frase que a tela mostra quando alguém pergunta "o ALTAR manda WhatsApp?".
 *
 * Uma só, curta, e sem "em breve" — prazo sem data é promessa, e promessa de
 * integração é o que faz uma decoradora assinar esperando algo que não existe.
 */
export function recadoSobreEnvio(leituras: readonly LeituraDoCanal[]): string {
  const enviando = leituras.filter((l) => l.envia);
  if (enviando.length === 0) {
    return "O ALTAR não envia mensagem para ninguém. Ele prepara o texto; quem envia é você.";
  }
  return `Envio ligado em: ${enviando.map((l) => l.canal).join(", ")}.`;
}
