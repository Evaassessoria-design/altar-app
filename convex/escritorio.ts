import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireUser } from "./lib/identity";
import { requireActiveAccess } from "./lib/accessGuard";
import { classificarPedido, recadoDaRecusa } from "./lib/escritorio/semaforo";
import { rotear } from "./lib/escritorio/roteamento";
import { AGENTES, ehAgenteId } from "./lib/escritorio/agentes";

// ═════════════════════════════════════════════════════════════════════════════
// ESCRITÓRIO DE IA — A CAMADA DE DADOS
//
// ── ESTE ARQUIVO NÃO É A CENTRAL ────────────────────────────────────────────
// A Central (`communications.ts`, `adminWorkItems.ts`, `adminApprovals.ts`) é a
// operação do SaaS ALTAR: `requireAdmin` em tudo, e o dono dos dados é o
// Matheus. Aqui o dono é a DECORADORA, e a guarda é `requireUser` + posse por
// `userId`, como no resto do produto dela.
//
// Os dois compartilham ARQUITETURA — semáforo, fila, histórico — e nenhum
// dado. Misturá-los numa tabela só faria a primeira consulta que esquecesse o
// filtro mostrar o trabalho de uma conta para outra.
//
// ── O SEMÁFORO CORRE AQUI, NA PORTA ─────────────────────────────────────────
// Um pedido vermelho vira uma tarefa `refused` NA HORA, sem executor, sem
// modelo e sem consulta nenhuma. Ele nunca chega perto de uma chamada de IA —
// e por isso nenhuma instrução escondida no texto ("ignore suas regras…") tem
// a quem ser dirigida.
// ═════════════════════════════════════════════════════════════════════════════

/** Teto do pedido. Acima disso é colar um documento, não delegar uma tarefa. */
export const LIMITE_DO_PEDIDO = 2_000;

/**
 * Teto do histórico.
 *
 * Mesma razão de `propostas.LIMITE_DA_LISTA` e `financeiro.LIMITE_DO_LIVRO`:
 * `collect()` sobre uma tabela que só cresce para em silêncio quando a conta
 * cresce. A tela diz "há mais" em vez de afirmar um total que não conferiu.
 */
export const LIMITE_DO_HISTORICO = 50;

/**
 * Delega um pedido à equipe.
 *
 * NÃO executa: cria a tarefa e devolve o id. Quem executa é
 * `escritorioExecutor.executar`, chamado pela tela em seguida — o mesmo
 * desenho das ações de IA que o ALTAR já tem (`ai.extractContractData`), em
 * que a action roda com a identidade de quem clicou.
 */
export const delegar = mutation({
  args: {
    pedido: v.string(),
    /** O agente que ela escolheu. Ausente = "ALTAR escolhe". */
    agenteId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // IA custa dinheiro por chamada: conta bloqueada não delega. Mesma guarda
    // das outras entradas de IA do produto.
    const user = await requireActiveAccess(ctx);

    const pedido = args.pedido.trim();
    if (!pedido) {
      throw new ConvexError({
        code: "INVALID",
        message: "Escreva o que você precisa que sua equipe faça.",
      });
    }
    if (pedido.length > LIMITE_DO_PEDIDO) {
      throw new ConvexError({
        code: "INVALID",
        message: `Pedido muito longo (máximo ${LIMITE_DO_PEDIDO} caracteres).`,
      });
    }

    // ── A ESCOLHA DELA VALE ──────────────────────────────────────────────
    // Um id que não existe NÃO vira silenciosamente "ALTAR escolhe": ela
    // pediu uma pessoa específica, e responder por outra sem avisar seria o
    // produto trocando a decisão dela.
    if (args.agenteId !== undefined && !ehAgenteId(args.agenteId)) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Agente não encontrado" });
    }

    const rota = args.agenteId
      ? { agenteId: args.agenteId, porPadrao: false }
      : rotear(pedido);

    const veredicto = classificarPedido(pedido);
    const agora = Date.now();

    // Vermelho para aqui. Sem executor, sem consulta, sem modelo.
    if (veredicto.cor === "vermelho") {
      return ctx.db.insert("agentTasks", {
        userId: user._id,
        pedido,
        agenteId: rota.agenteId,
        roteadoAutomaticamente: !args.agenteId,
        status: "refused",
        cor: "vermelho",
        motivoDaCor: veredicto.motivo,
        resultado: recadoDaRecusa(veredicto.motivo),
        criadoEm: agora,
        concluidoEm: agora,
      });
    }

    return ctx.db.insert("agentTasks", {
      userId: user._id,
      pedido,
      agenteId: rota.agenteId,
      roteadoAutomaticamente: !args.agenteId,
      status: "queued",
      cor: veredicto.cor,
      motivoDaCor: veredicto.motivo,
      criadoEm: agora,
    });
  },
});

/** A equipe. Constante, não cadastro — ver `lib/escritorio/agentes.ts`. */
export const equipe = query({
  args: {},
  handler: async (ctx) => {
    // Exige sessão: a lista de agentes é do produto pago, não da landing.
    await requireUser(ctx);
    return AGENTES;
  },
});

/** Os trabalhos recentes DESTA conta. */
export const listar = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const lidas = await ctx.db
      .query("agentTasks")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(LIMITE_DO_HISTORICO + 1);

    const temMais = lidas.length > LIMITE_DO_HISTORICO;
    return {
      temMais,
      tarefas: temMais ? lidas.slice(0, LIMITE_DO_HISTORICO) : lidas,
    };
  },
});

/**
 * Uma tarefa.
 *
 * Degrada para `null` quando não é desta conta — o padrão de leitura do
 * projeto (`assemblyItems.get`, `health.getEventHealth`). Confirmar que o id
 * existe já seria contar que outra empresa tem aquele trabalho.
 */
export const obter = query({
  args: { taskId: v.id("agentTasks") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const tarefa = await ctx.db.get(args.taskId);
    if (!tarefa || tarefa.userId !== user._id) return null;
    return tarefa;
  },
});

// ── O QUE SÓ O EXECUTOR CHAMA ───────────────────────────────────────────────
// `internalMutation`: não alcançável pelo navegador. O `userId` nunca vem do
// cliente — ele já está gravado na tarefa, posto lá por `delegar` a partir da
// sessão.

export const marcarRodando = internalMutation({
  args: { taskId: v.id("agentTasks") },
  handler: async (ctx, args) => {
    const tarefa = await ctx.db.get(args.taskId);
    if (!tarefa) return;
    // Só sai de `queued`. Uma segunda chamada (duplo clique, reenvio) não
    // reinicia um trabalho que já está correndo nem ressuscita um concluído.
    if (tarefa.status !== "queued") return;
    await ctx.db.patch(args.taskId, { status: "running", iniciadoEm: Date.now() });
  },
});

export const concluir = internalMutation({
  args: {
    taskId: v.id("agentTasks"),
    resultado: v.string(),
    fontesConsultadas: v.array(v.string()),
    provedor: v.union(v.literal("modelo"), v.literal("local")),
    tokensEntrada: v.optional(v.number()),
    tokensSaida: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { taskId, ...campos } = args;
    const tarefa = await ctx.db.get(taskId);
    if (!tarefa) return;
    await ctx.db.patch(taskId, {
      ...campos,
      status: "completed",
      concluidoEm: Date.now(),
    });
  },
});

export const falhar = internalMutation({
  args: { taskId: v.id("agentTasks"), erro: v.string() },
  handler: async (ctx, args) => {
    const tarefa = await ctx.db.get(args.taskId);
    if (!tarefa) return;
    await ctx.db.patch(args.taskId, {
      status: "failed",
      erro: args.erro,
      concluidoEm: Date.now(),
    });
  },
});
