import type { Campanha, SituacaoDaCampanha, FunilDaCampanha } from "../campanha";
import type { ProximaAcao, UrgenciaDaAcao } from "../proximaAcao";
import type { Suspeita } from "../duplicidade";

// ─────────────────────────────────────────────────────────────────────────────
// COMERCIAL — HOJE
//
// ── A PERGUNTA QUE ESTA TELA RESPONDE ───────────────────────────────────────
// "Se eu tivesse trinta minutos para a campanha hoje, no que eu mexeria?"
//
// Não é um relatório. Relatório mostra tudo e deixa a priorização para quem
// lê — que é exatamente o trabalho que ninguém tem tempo de fazer às oito da
// manhã. Aqui o corte já vem feito, em três blocos:
//
//   HOJE             o estado, em números que fecham com o funil
//   PREPARADO        o que já está escrito e esperando revisão
//   PRECISA DE VOCÊ  o que nenhum modelo de texto resolve
//
// ── O BLOCO "PREPARADO" SÓ EXISTE SE FOR VERDADE ────────────────────────────
// "Preparei 9 convites" é uma frase que só pode ser dita quando há nove
// rascunhos gravados. Anunciar trabalho que não existe é a forma mais rápida
// de alguém parar de acreditar no resto da tela — e o resto da tela é onde
// estão os números que decidem a campanha.
//
// Quando não há nada preparado, o bloco some. Não vira "0 convites".
// ─────────────────────────────────────────────────────────────────────────────

export type LinhaDoComercial = {
  chave: string;
  rotulo: string;
  quantidade: number;
  /** A etapa que a tela deve filtrar ao clicar. Ausente = sem destino óbvio. */
  filtro?: string;
};

export type PedidoHumano = {
  chave: string;
  /** Quem. Sempre uma pessoa com nome, nunca "um lead". */
  pessoa: string;
  /** O que aconteceu. */
  motivo: string;
  /** O que o ALTAR faria, se pudesse. Sugestão, nunca execução. */
  sugestao: string;
  urgencia: UrgenciaDaAcao;
  /** O registro a abrir. */
  leadId?: string;
};

export type BriefingComercial = {
  campanha: {
    nome: string;
    data: string;
    hora: string;
    situacao: SituacaoDaCampanha;
    diasAte: number;
    /** A sala existe? `false` faz a tela escrever, não deixar em branco. */
    linkDefinido: boolean;
  } | null;
  /** A frase de abertura. */
  resumo: string;
  hoje: LinhaDoComercial[];
  preparado: LinhaDoComercial[];
  precisaDeVoce: PedidoHumano[];
  /** Pares que merecem uma olhada. Nunca fundidos automaticamente. */
  duplicidades: Suspeita[];
  /** Nada a fazer hoje — e isso é uma resposta legítima. */
  tudoEmDia: boolean;
};

export type FatosDoComercial = {
  campanha?: Campanha;
  situacao?: SituacaoDaCampanha;
  diasAte?: number;
  funil: FunilDaCampanha;
  /** Rascunhos gravados, por tipo, no estado "rascunho". */
  rascunhosPorTipo: Record<string, number>;
  /** Rascunhos já aprovados e ainda não enviados. */
  aprovadosAguardando: number;
  /** As pessoas que a regra mandou para uma pessoa decidir. */
  pedidos: readonly { leadId: string; pessoa: string; acao: ProximaAcao }[];
  duplicidades: readonly Suspeita[];
};

/** O rótulo de cada modelo, para o bloco "Preparei". */
const ROTULO_DO_TIPO: Record<string, [string, string]> = {
  convite: ["convite", "convites"],
  follow_up_sem_resposta: ["follow-up", "follow-ups"],
  pedido_de_email: ["pedido de e-mail", "pedidos de e-mail"],
  confirmacao: ["confirmação", "confirmações"],
  lembrete_24h: ["lembrete de véspera", "lembretes de véspera"],
  lembrete_30min: ["lembrete do dia", "lembretes do dia"],
  agradecimento_pos_live: ["agradecimento", "agradecimentos"],
  faltou_a_live: ["recado de quem faltou", "recados de quem faltou"],
  convite_demonstracao: ["convite de demonstração", "convites de demonstração"],
  convite_trial: ["convite para testar", "convites para testar"],
};

function plural(n: number, par: [string, string]): string {
  return `${n} ${n === 1 ? par[0] : par[1]}`;
}

const PESO_DA_URGENCIA: Record<UrgenciaDaAcao, number> = {
  agora: 0,
  esta_semana: 1,
  quando_der: 2,
  nenhuma: 3,
};

export function montarBriefingComercial(f: FatosDoComercial): BriefingComercial {
  const { funil } = f;

  // ── HOJE ────────────────────────────────────────────────────────────────
  // Só entram as linhas com número. Uma lista com sete zeros é uma lista que
  // ninguém lê na segunda vez.
  const hoje: LinhaDoComercial[] = [
    {
      chave: "sem_contato",
      rotulo: "sem primeiro contato",
      quantidade: funil.semContato,
      filtro: "novo",
    },
    {
      chave: "aguardando",
      rotulo: "aguardando resposta",
      quantidade: funil.aguardandoResposta,
      filtro: "contatado",
    },
    {
      chave: "interessados",
      rotulo: "demonstraram interesse",
      quantidade: funil.interessados,
      filtro: "interessado",
    },
    {
      chave: "confirmados",
      rotulo: "confirmados na apresentação",
      quantidade: funil.confirmados,
      filtro: "confirmou",
    },
    {
      chave: "participaram",
      rotulo: "participaram",
      quantidade: funil.participaram,
      filtro: "participou",
    },
    {
      chave: "testando",
      rotulo: "testando o ALTAR",
      quantidade: funil.testando,
      filtro: "testando",
    },
    { chave: "clientes", rotulo: "viraram clientes", quantidade: funil.clientes, filtro: "convertido" },
  ].filter((l) => l.quantidade > 0);

  // ── PREPARADO ───────────────────────────────────────────────────────────
  const preparado: LinhaDoComercial[] = Object.entries(f.rascunhosPorTipo)
    .filter(([, n]) => n > 0)
    .map(([tipo, n]) => ({
      chave: `preparado.${tipo}`,
      rotulo: plural(n, ROTULO_DO_TIPO[tipo] ?? ["mensagem", "mensagens"]),
      quantidade: n,
    }))
    .sort((a, b) => b.quantidade - a.quantidade);

  if (f.aprovadosAguardando > 0) {
    preparado.push({
      chave: "preparado.aprovados",
      // "Aprovado" não é "enviado". A frase diz o que falta: uma pessoa
      // mandar, com o dedo dela.
      rotulo: `${plural(f.aprovadosAguardando, ["mensagem aprovada", "mensagens aprovadas"])}, esperando você enviar`,
      quantidade: f.aprovadosAguardando,
    });
  }

  // ── PRECISA DE VOCÊ ─────────────────────────────────────────────────────
  const precisaDeVoce: PedidoHumano[] = f.pedidos
    .filter((p) => p.acao.precisaDeHumano)
    .map((p) => ({
      chave: `pedido.${p.leadId}`,
      pessoa: p.pessoa,
      motivo: p.acao.motivo,
      sugestao: p.acao.acao,
      urgencia: p.acao.urgencia,
      leadId: p.leadId,
    }))
    .sort((a, b) => PESO_DA_URGENCIA[a.urgencia] - PESO_DA_URGENCIA[b.urgencia]);

  for (const d of f.duplicidades) {
    precisaDeVoce.push({
      chave: `duplicidade.${d.ids.join(".")}`,
      pessoa: `${d.nomes[0]} e ${d.nomes[1]}`,
      motivo: `${d.motivo}. Podem ser a mesma pessoa.`,
      // O ALTAR não funde: fundir é destrutivo e o palpite erra. Duas sócias
      // dividem o telefone do escritório e são duas pessoas.
      sugestao: "Conferir e decidir se é a mesma pessoa",
      urgencia: d.forca === "alta" ? "esta_semana" : "quando_der",
    });
  }

  const nadaAFazer = preparado.length === 0 && precisaDeVoce.length === 0 && funil.total === 0;

  const resumo =
    funil.total === 0
      ? "Ainda não há ninguém nesta campanha."
      : funil.semContato > 0
        ? `${plural(funil.semContato, ["pessoa ainda não", "pessoas ainda não"])} ${funil.semContato === 1 ? "foi abordada" : "foram abordadas"}.`
        : precisaDeVoce.length > 0
          ? `${plural(precisaDeVoce.length, ["coisa precisa", "coisas precisam"])} de você.`
          : "A campanha está em dia.";

  return {
    campanha: f.campanha
      ? {
          nome: f.campanha.nome,
          data: f.campanha.data,
          hora: f.campanha.hora,
          situacao: f.situacao ?? "agendada",
          diasAte: f.diasAte ?? 0,
          linkDefinido: Boolean(f.campanha.linkDaReuniao),
        }
      : null,
    resumo,
    hoje,
    preparado,
    precisaDeVoce,
    duplicidades: [...f.duplicidades],
    tudoEmDia: nadaAFazer,
  };
}
