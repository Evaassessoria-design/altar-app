import { v } from "convex/values";

// ─────────────────────────────────────────────────────────────────────────────
// VALIDADORES DA CENTRAL — FONTE ÚNICA
//
// O Convex exige literais estáticos no validador, então as listas não podem
// ser derivadas em tempo de execução dos módulos de regra
// (lib/central/triagem.ts, lib/central/autonomia.ts, lib/channels/tipos.ts).
//
// Em vez de copiá-las em cada arquivo — schema, queries, mutations, actions —
// elas existem UMA vez aqui, e `central.contratos.test.ts` confere que não
// divergiram dos módulos de regra. Divergência silenciosa entre o validador e
// a regra é o defeito que este arquivo existe para impedir.
// ─────────────────────────────────────────────────────────────────────────────

/** Produto ALTAR deste deployment. Ver lib/central/vertical.ts. */
export const verticalValidator = v.union(
  v.literal("altar_decor"),
  v.literal("altar_buffet"),
);

/** Canal é ATRIBUTO. Nenhuma tabela ou índice se chama pelo canal. */
export const channelValidator = v.union(
  v.literal("whatsapp"),
  v.literal("instagram"),
  v.literal("email"),
  v.literal("chat"),
);

export const tipoDeContatoValidator = v.union(
  v.literal("interessado"),
  v.literal("assinante"),
  v.literal("parceiro"),
  v.literal("desconhecido"),
);

export const departamentoValidator = v.union(
  v.literal("triagem"),
  v.literal("comercial"),
  v.literal("suporte"),
  v.literal("financeiro"),
  v.literal("ouvidoria"),
);

export const categoriaValidator = v.union(
  // Comercial
  v.literal("novo_interessado"),
  v.literal("demonstracao"),
  v.literal("follow_up"),
  v.literal("trial"),
  v.literal("conversao"),
  // CS / Suporte
  v.literal("duvida"),
  v.literal("onboarding"),
  v.literal("problema"),
  // Financeiro — CLASSIFICA, nunca movimenta
  v.literal("cobranca"),
  // Ouvidoria
  v.literal("reclamacao"),
  v.literal("sugestao"),
  v.literal("bug"),
  v.literal("funcionalidade"),
  v.literal("elogio"),
  v.literal("outro"),
);

export const prioridadeValidator = v.union(
  v.literal("baixa"),
  v.literal("normal"),
  v.literal("alta"),
  v.literal("urgente"),
);

export const statusDeConversaValidator = v.union(
  v.literal("aberta"),
  v.literal("aguardando_cliente"),
  v.literal("aguardando_aprovacao"),
  v.literal("escalada_ceo"),
  v.literal("resolvida"),
  v.literal("arquivada"),
);

export const direcaoValidator = v.union(v.literal("entrada"), v.literal("saida"));

export const tipoDeMensagemValidator = v.union(
  v.literal("texto"),
  v.literal("imagem"),
  v.literal("audio"),
  v.literal("video"),
  v.literal("documento"),
  v.literal("localizacao"),
  v.literal("outro"),
);

export const tipoDeTrabalhoValidator = v.union(
  v.literal("follow_up"),
  v.literal("demonstracao"),
  v.literal("onboarding"),
  v.literal("suporte"),
  v.literal("contato_cobranca"),
  v.literal("retorno"),
  v.literal("outro"),
);

export const statusDeTrabalhoValidator = v.union(
  v.literal("aberto"),
  v.literal("em_andamento"),
  v.literal("concluido"),
  v.literal("cancelado"),
);

/**
 * O que está sendo proposto ao Matheus.
 *
 * União discriminada: o BLOCO 1 implementa apenas `mensagem_saida`. Os demais
 * membros ("abrir tarefa", "vincular contato", "registrar sinal") entram na
 * Fase 2 sem migração — é por isso que a fila não se chama "rascunhos".
 */
export const propostaValidator = v.object({
  kind: v.literal("mensagem_saida"),
  texto: v.string(),
});

export const statusDeAprovacaoValidator = v.union(
  v.literal("pendente"),
  v.literal("aprovada"),
  v.literal("aprovada_editada"),
  v.literal("recusada"),
  v.literal("expirada"),
  v.literal("executada"),
  v.literal("falhou"),
);

export const tipoDeSinalValidator = v.union(
  v.literal("reclamacao"),
  v.literal("sugestao"),
  v.literal("bug"),
  v.literal("funcionalidade"),
  v.literal("elogio"),
);

export const severidadeValidator = v.union(
  v.literal("baixa"),
  v.literal("media"),
  v.literal("alta"),
  v.literal("critica"),
);

export const statusDeSinalValidator = v.union(
  v.literal("novo"),
  v.literal("triado"),
  v.literal("em_produto"),
  v.literal("planejado"),
  v.literal("entregue"),
  v.literal("descartado"),
);

/** Mesmos desfechos de `asaasWebhookEvents` — a linguagem do time não muda. */
export const desfechoValidator = v.union(
  v.literal("applied"),
  v.literal("duplicate"),
  v.literal("no_match"),
  v.literal("ignored"),
  v.literal("error"),
);

export const nivelDeAutonomiaValidator = v.union(
  v.literal("leitura"),
  v.literal("sugestao"),
  v.literal("envio_assistido"),
  v.literal("autonomo"),
);

export const statusDeEntregaValidator = v.union(
  v.literal("enviada"),
  v.literal("entregue"),
  v.literal("lida"),
  v.literal("falhou"),
);

/** Mensagem já normalizada, como chega do adaptador de canal. */
export const mensagemNormalizadaValidator = v.object({
  canal: channelValidator,
  externalMessageId: v.string(),
  externalContactId: v.string(),
  externalThreadId: v.optional(v.string()),
  displayName: v.optional(v.string()),
  direcao: direcaoValidator,
  tipo: tipoDeMensagemValidator,
  texto: v.optional(v.string()),
  mediaMime: v.optional(v.string()),
  enviadaEm: v.number(),
});
