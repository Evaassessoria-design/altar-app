// ─────────────────────────────────────────────────────────────────────────────
// ATÉ ONDE O ESCRITÓRIO VAI SOZINHO
//
// ── O PRINCÍPIO ─────────────────────────────────────────────────────────────
// O ALTAR não pede autorização para trabalhar. Ele pede DECISÃO quando
// ultrapassa a autonomia que o dono definiu.
//
// A diferença não é semântica. Um sistema que pergunta antes de cada passo
// devolve ao humano exatamente o trabalho que existia para tirar dele. Um
// sistema que decide tudo sozinho erra em escala com o nome da empresa em
// cima. O meio é este: uma lista FECHADA de capacidades, cada uma com uma cor,
// e o dono escolhendo quais estão ligadas.
//
// ── POR QUE ISTO NÃO É `lib/assistente/semaforo.ts` ─────────────────────────
// O semáforo classifica um PEDIDO escrito pela decoradora: "isto que ela
// acabou de digitar pode ser feito?". É reativo e por texto.
//
// Aqui a pergunta é outra: "o Escritório pode fazer isto sozinho, sem ninguém
// ter pedido?". É proativo e por CAPACIDADE — uma lista que não depende de
// interpretar linguagem, porque não há linguagem nenhuma envolvida.
//
// As duas cores coincidem de propósito. Verde, amarelo e vermelho significam a
// mesma coisa nos dois lugares, e uma pessoa que aprendeu num entende o outro.
//
// ── POR QUE NÃO EXISTE INTERRUPTOR MENTIROSO ────────────────────────────────
// Uma capacidade AMARELA depende de canal externo configurado. Enquanto não
// houver, ela não é "desligada": é INDISPONÍVEL, e a tela diz isso. Um
// interruptor que o dono liga e que não faz nada é pior do que nenhum — ele
// ensina que os outros também podem ser decorativos.
// ─────────────────────────────────────────────────────────────────────────────

export const CORES = ["verde", "amarelo", "vermelho"] as const;
export type Cor = (typeof CORES)[number];

export const CAPACIDADES = [
  // ── VERDE: trabalho interno, reversível, sem efeito sobre terceiros ──
  "qualificar",
  "deduplicar",
  "priorizar",
  "preparar_primeiro_contato",
  "preparar_follow_up",
  "classificar_respostas",
  "confirmar_presenca",
  "organizar_agenda",
  "relatorio_diario",
  // ── AMARELO: fala com alguém de fora ─────────────────────────────────
  "enviar_whatsapp",
  "enviar_email",
  // ── VERMELHO: nunca automático ───────────────────────────────────────
  "negociar_preco",
  "dar_desconto",
  "excluir_contato",
  "alterar_assinatura",
] as const;

export type Capacidade = (typeof CAPACIDADES)[number];

export type DefinicaoDeCapacidade = {
  id: Capacidade;
  cor: Cor;
  rotulo: string;
  /** O que ela faz, em uma frase, sem jargão. */
  descricao: string;
  /**
   * Exige um canal externo configurado para sequer poder acontecer.
   *
   * Separado da cor de propósito: "amarelo" diz o RISCO; isto diz se a
   * infraestrutura existe. Uma capacidade amarela sem canal não é uma escolha
   * do dono — é uma impossibilidade, e a tela precisa dizer qual das duas é.
   */
  exigeCanal?: boolean;
  /**
   * O padrão para uma campanha nova.
   *
   * Verde nasce LIGADO: é trabalho interno que o dono contratou o ALTAR para
   * fazer, e obrigá-lo a ligar nove interruptores antes de o produto fazer
   * qualquer coisa é devolver a ele a configuração que ele queria evitar.
   *
   * Amarelo e vermelho nascem desligados, sempre.
   */
  padrao: boolean;
};

export const CATALOGO: readonly DefinicaoDeCapacidade[] = [
  {
    id: "qualificar",
    cor: "verde",
    rotulo: "Qualificar interessados",
    descricao: "Lê o cadastro e separa quem procurou a ALTAR de quem veio de lista.",
    padrao: true,
  },
  {
    id: "deduplicar",
    cor: "verde",
    rotulo: "Apontar pessoas repetidas",
    // Apontar, nunca fundir: fundir é destrutivo e o palpite erra — duas
    // sócias dividem o telefone do escritório e são duas pessoas.
    descricao: "Mostra pares que parecem a mesma pessoa. Nunca funde nada.",
    padrao: true,
  },
  {
    id: "priorizar",
    cor: "verde",
    rotulo: "Ordenar a fila do dia",
    descricao: "Decide com quem falar primeiro, por urgência e tempo de espera.",
    padrao: true,
  },
  {
    id: "preparar_primeiro_contato",
    cor: "verde",
    rotulo: "Escrever o primeiro contato",
    descricao: "Redige o convite de quem ainda não foi abordado. Não envia.",
    padrao: true,
  },
  {
    id: "preparar_follow_up",
    cor: "verde",
    rotulo: "Escrever follow-up",
    descricao: "Redige a cobrança de quem foi convidado e não respondeu. Não envia.",
    padrao: true,
  },
  {
    id: "classificar_respostas",
    cor: "verde",
    rotulo: "Interpretar respostas registradas",
    // "Registradas" é a palavra que importa: o ALTAR não lê WhatsApp de
    // ninguém. Classifica o que uma pessoa colou na tela.
    descricao: "Lê o que você registrou e diz se é interesse, dúvida ou recusa.",
    padrao: true,
  },
  {
    id: "confirmar_presenca",
    cor: "verde",
    rotulo: "Confirmar presença internamente",
    descricao: "Move para Confirmado quem respondeu que vem e já deu o e-mail.",
    padrao: true,
  },
  {
    id: "organizar_agenda",
    cor: "verde",
    rotulo: "Organizar os lembretes",
    descricao: "Marca quando cada lembrete deve ser escrito. Não envia nada.",
    padrao: true,
  },
  {
    id: "relatorio_diario",
    cor: "verde",
    rotulo: "Relatório do dia",
    descricao: "Resume o que foi feito e o que precisa de você.",
    padrao: true,
  },
  {
    id: "enviar_whatsapp",
    cor: "amarelo",
    rotulo: "Enviar WhatsApp automaticamente",
    descricao: "Manda a mensagem aprovada sem você copiar e colar.",
    exigeCanal: true,
    padrao: false,
  },
  {
    id: "enviar_email",
    cor: "amarelo",
    rotulo: "Enviar e-mail automaticamente",
    descricao: "Manda confirmações e lembretes por e-mail.",
    exigeCanal: true,
    padrao: false,
  },
  {
    id: "negociar_preco",
    cor: "vermelho",
    rotulo: "Negociar preço",
    descricao: "Nunca. Preço é conversa sua.",
    padrao: false,
  },
  {
    id: "dar_desconto",
    cor: "vermelho",
    rotulo: "Dar desconto",
    descricao: "Nunca. É dinheiro saindo do seu bolso.",
    padrao: false,
  },
  {
    id: "excluir_contato",
    cor: "vermelho",
    rotulo: "Excluir contatos",
    descricao: "Nunca. Apagar não tem volta.",
    padrao: false,
  },
  {
    id: "alterar_assinatura",
    cor: "vermelho",
    rotulo: "Alterar assinatura",
    descricao: "Nunca. Plano e cobrança ficam com você.",
    padrao: false,
  },
];

const POR_ID = new Map(CATALOGO.map((c) => [c.id, c]));

export function capacidadePorId(id: string | undefined | null): DefinicaoDeCapacidade | undefined {
  return id ? POR_ID.get(id as Capacidade) : undefined;
}

export function ehCapacidade(valor: unknown): valor is Capacidade {
  return typeof valor === "string" && POR_ID.has(valor as Capacidade);
}

/** O que foi GRAVADO: só as capacidades cujo padrão alguém mudou. */
export type PreferenciaGravada = { capacidade: string; ligada: boolean };

export type SituacaoDaCapacidade = DefinicaoDeCapacidade & {
  /** O dono quer esta capacidade ligada? */
  escolhida: boolean;
  /** A infraestrutura permite? `false` só para as que exigem canal. */
  disponivel: boolean;
  /**
   * Vai de fato acontecer? `escolhida && disponivel`.
   *
   * A tela mostra as duas separadas porque as causas são diferentes: uma o
   * dono resolve com um clique, a outra exige conectar um canal.
   */
  ativa: boolean;
  /** Por que não está ativa. Ausente quando está. */
  porQueNao?: string;
};

/**
 * VERMELHO NUNCA LIGA.
 *
 * Nem por preferência gravada, nem por canal conectado, nem por engano de
 * quem escreveu a tela. É a política vigente expressa em código, e é por isso
 * que a checagem não olha `escolhida` para estas: olhar abriria a porta para
 * um `patch` no banco virar autorização.
 */
function podeLigar(def: DefinicaoDeCapacidade): boolean {
  return def.cor !== "vermelho";
}

/**
 * A situação de cada capacidade, juntando catálogo, preferência e ambiente.
 *
 * `canalDisponivel` vem de fora (de `lib/channels/situacao.ts`) porque quem
 * sabe se há canal é a infraestrutura, não este módulo — e um módulo puro que
 * consultasse ambiente deixaria de ser testável sem ele.
 */
export function situacaoDasCapacidades(
  gravadas: readonly PreferenciaGravada[],
  canalDisponivel: boolean,
): SituacaoDaCapacidade[] {
  const escolha = new Map(gravadas.map((p) => [p.capacidade, p.ligada]));

  return CATALOGO.map((def) => {
    const escolhida = podeLigar(def) && (escolha.get(def.id) ?? def.padrao);
    const disponivel = def.exigeCanal ? canalDisponivel : true;
    const ativa = escolhida && disponivel;

    return {
      ...def,
      escolhida,
      disponivel,
      ativa,
      porQueNao: ativa
        ? undefined
        : def.cor === "vermelho"
          ? "Esta nunca é automática."
          : !disponivel
            ? "Disponível depois de conectar o canal."
            : "Você deixou desligada.",
    };
  });
}

/**
 * O Escritório pode fazer isto agora?
 *
 * É a ÚNICA porta. Toda rotina autônoma pergunta aqui antes de agir, e é essa
 * concentração que torna a política auditável: para saber o que o sistema pode
 * fazer sozinho, lê-se uma função.
 */
export function podeAgir(
  capacidade: Capacidade,
  gravadas: readonly PreferenciaGravada[],
  canalDisponivel: boolean,
): boolean {
  return situacaoDasCapacidades(gravadas, canalDisponivel).find((c) => c.id === capacidade)?.ativa ?? false;
}

/** As cores, contadas — o resumo que a tela de configuração mostra em cima. */
export function resumoDaAutonomia(situacoes: readonly SituacaoDaCapacidade[]) {
  const ativas = situacoes.filter((s) => s.ativa);
  return {
    ativas: ativas.length,
    total: situacoes.length,
    verdesAtivas: ativas.filter((s) => s.cor === "verde").length,
    verdesTotal: situacoes.filter((s) => s.cor === "verde").length,
    /** Amarelas que o dono quer mas o canal não permite. É a frase honesta. */
    esperandoCanal: situacoes.filter((s) => s.exigeCanal && !s.disponivel).length,
  };
}
