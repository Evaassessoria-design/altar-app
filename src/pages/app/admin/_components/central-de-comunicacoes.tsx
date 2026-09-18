import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { ConvexError } from "convex/values";
import { toast } from "sonner";
import { cn } from "@/lib/utils.ts";
import { Button } from "@/components/ui/button.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import {
  MessageSquare,
  AlertTriangle,
  Inbox,
  ShieldAlert,
  Clock,
  Check,
  X,
  Lock,
} from "lucide-react";
import { formatTimestampComHora } from "@/lib/safe-date.ts";
import {
  CLASSE_DA_PRIORIDADE,
  ordenarFila,
  ROTULO_DA_CATEGORIA,
  ROTULO_DA_PRIORIDADE,
  ROTULO_DO_DEPARTAMENTO,
  rotuloDaConfianca,
  type Departamento,
  type Prioridade,
} from "@/lib/central-fila.ts";

// ─────────────────────────────────────────────────────────────────────────────
// CENTRAL DE COMUNICAÇÕES — OPERAÇÃO
//
// Esta é a tela onde a decisão acontece. O Escritório 3D é visão executiva e
// somente leitura; aprovar, editar e recusar existe SÓ aqui, atrás de
// `requireAdmin`.
//
// ── O AVISO DE ENVIO DESLIGADO NÃO É DECORAÇÃO ──────────────────────────────
// Na Fase 1, aprovar registra a decisão e NÃO envia. Sem dizer isso na tela, o
// Matheus aprovaria e concluiria pelo silêncio que a mensagem foi entregue.
// ─────────────────────────────────────────────────────────────────────────────

function erroLegivel(erro: unknown): string {
  if (erro instanceof ConvexError) {
    const dados = erro.data as { message?: string } | undefined;
    return dados?.message ?? "Não foi possível concluir.";
  }
  return "Não foi possível concluir.";
}

export function CentralDeComunicacoes() {
  const painel = useQuery(api.communications.painel, {});
  const fila = useQuery(api.adminApprovals.listarPendentes, {});
  const [conversaAberta, setConversaAberta] =
    useState<Id<"communicationConversations"> | null>(null);

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <h2 className="font-semibold flex items-center gap-2">
          <MessageSquare className="size-4 text-primary" /> Central de Comunicações
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Conversas do número comercial do ALTAR — interessados e assinantes. Não se confunde
          com o funil de clientes das decoradoras.
        </p>
      </div>

      <EstadoDoEnvio painel={painel} />
      <Indicadores painel={painel} />
      <FilaDeAprovacao fila={fila} onAbrirConversa={setConversaAberta} />

      <ConversaDialog
        conversationId={conversaAberta}
        onClose={() => setConversaAberta(null)}
      />
    </div>
  );
}

// ─── Aviso de estado do envio ────────────────────────────────────────────────

type Painel = ReturnType<typeof useQuery<typeof api.communications.painel>>;

function EstadoDoEnvio({ painel }: { painel: Painel }) {
  if (painel === undefined) return null;

  const desligado = painel.envioExterno !== "ligado";

  return (
    <div
      className={cn(
        "px-5 py-3 border-b border-border text-sm",
        desligado
          ? "bg-amber-50 dark:bg-amber-950/30"
          : "bg-emerald-50 dark:bg-emerald-950/30",
      )}
    >
      <p
        className={cn(
          "flex items-center gap-2 font-medium",
          desligado
            ? "text-amber-800 dark:text-amber-300"
            : "text-emerald-800 dark:text-emerald-300",
        )}
      >
        {desligado ? <Lock className="size-4" /> : <Check className="size-4" />}
        {desligado
          ? "Envio externo DESLIGADO — nada sai deste ambiente."
          : "Envio externo ligado — respostas aprovadas são entregues."}
      </p>
      {desligado && (
        <p className="text-xs text-muted-foreground mt-0.5">
          Aprovar registra a sua decisão e deixa a resposta pronta, mas a mensagem não é
          enviada ao cliente. Para ligar, defina <code>ALTAR_CENTRAL_ENVIO_HABILITADO=true</code>{" "}
          nas variáveis do Convex — e só depois de o número comercial estar integrado.
        </p>
      )}
    </div>
  );
}

// ─── Indicadores ─────────────────────────────────────────────────────────────

function Indicadores({ painel }: { painel: Painel }) {
  if (painel === undefined) {
    return (
      <div className="px-5 py-4 grid grid-cols-2 md:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  const cartoes = [
    { rotulo: "Não lidas", valor: painel.mensagensNaoLidas, icone: Inbox },
    { rotulo: "Conversas abertas", valor: painel.conversasAbertas, icone: MessageSquare },
    { rotulo: "Aguardando você", valor: painel.aguardandoAprovacao, icone: Clock },
    { rotulo: "Escaladas", valor: painel.escaladasCeo, icone: ShieldAlert },
    { rotulo: "Novos contatos 24h", valor: painel.leadsNovos24h, icone: MessageSquare },
  ];

  return (
    <>
      <div className="px-5 py-4 grid grid-cols-2 md:grid-cols-5 gap-3 border-b border-border">
        {cartoes.map(({ rotulo, valor, icone: Icone }) => (
          <div key={rotulo} className="rounded-lg border border-border px-3 py-2">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Icone className="size-3" /> {rotulo}
            </p>
            <p className="text-xl font-semibold mt-0.5">{valor}</p>
          </div>
        ))}
      </div>

      <div className="px-5 py-3 border-b border-border">
        <p className="text-xs text-muted-foreground mb-2">Por departamento</p>
        <div className="flex flex-wrap gap-2">
          {(
            Object.entries(painel.porDepartamento) as [
              Departamento,
              { abertas: number; urgentes: number; aguardandoAprovacao: number },
            ][]
          ).map(([departamento, dados]) => (
            <div
              key={departamento}
              className="rounded-lg border border-border px-3 py-1.5 text-xs"
            >
              <span className="font-medium">{ROTULO_DO_DEPARTAMENTO[departamento]}</span>
              <span className="text-muted-foreground"> · {dados.abertas} aberta(s)</span>
              {dados.urgentes > 0 && (
                <span className="text-red-600 dark:text-red-400"> · {dados.urgentes} urgente</span>
              )}
              {dados.aguardandoAprovacao > 0 && (
                <span className="text-amber-700 dark:text-amber-400">
                  {" "}
                  · {dados.aguardandoAprovacao} p/ aprovar
                </span>
              )}
            </div>
          ))}
        </div>

        {(painel.pendencias.semRespostaMais24h > 0 ||
          painel.pendencias.followUpVencido > 0) && (
          <p className="mt-2 text-xs flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="size-3" />
            {painel.pendencias.semRespostaMais24h > 0 &&
              `${painel.pendencias.semRespostaMais24h} conversa(s) sem resposta há mais de 24h`}
            {painel.pendencias.semRespostaMais24h > 0 &&
              painel.pendencias.followUpVencido > 0 &&
              " · "}
            {painel.pendencias.followUpVencido > 0 &&
              `${painel.pendencias.followUpVencido} follow-up(s) vencido(s)`}
          </p>
        )}
      </div>
    </>
  );
}

// ─── Fila de aprovação ───────────────────────────────────────────────────────

type Fila = ReturnType<typeof useQuery<typeof api.adminApprovals.listarPendentes>>;

function FilaDeAprovacao({
  fila,
  onAbrirConversa,
}: {
  fila: Fila;
  onAbrirConversa: (id: Id<"communicationConversations">) => void;
}) {
  if (fila === undefined) {
    return (
      <div className="px-5 py-4 space-y-2">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (fila.length === 0) {
    return (
      <div className="px-5 py-8 text-sm text-muted-foreground text-center">
        <Check className="size-5 mx-auto mb-2 text-emerald-600" />
        Nenhuma resposta aguardando aprovação.
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {ordenarFila(fila).map((item) => (
        <ItemDaFila key={item._id} item={item} onAbrirConversa={onAbrirConversa} />
      ))}
    </div>
  );
}

function ItemDaFila({
  item,
  onAbrirConversa,
}: {
  item: NonNullable<Fila>[number];
  onAbrirConversa: (id: Id<"communicationConversations">) => void;
}) {
  const aprovar = useMutation(api.adminApprovals.aprovar);
  const recusar = useMutation(api.adminApprovals.recusar);

  const [texto, setTexto] = useState(item.proposta.texto);
  const [ocupado, setOcupado] = useState(false);

  const editado = texto.trim() !== item.proposta.texto.trim();
  const confianca = item.triagem ? rotuloDaConfianca(item.triagem.confianca) : null;
  const prioridade: Prioridade = item.conversa?.prioridade ?? "normal";

  async function decidir(acao: "aprovar" | "recusar") {
    setOcupado(true);
    try {
      if (acao === "aprovar") {
        const r = await aprovar({
          approvalId: item._id,
          textoEditado: editado ? texto.trim() : undefined,
        });
        toast.success(
          r.status === "aprovada_editada"
            ? "Resposta editada e aprovada."
            : "Resposta aprovada.",
          { description: "Registrada com o seu nome. O envio depende do ambiente." },
        );
      } else {
        await recusar({ approvalId: item._id });
        toast.success("Proposta recusada.");
      }
    } catch (erro) {
      toast.error(erroLegivel(erro));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="px-5 py-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="font-medium text-sm truncate">
            {item.contato?.nome ?? "Contato desconhecido"}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {item.conversa?.assunto ?? "Sem assunto"}
          </p>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {item.conversa?.escaladaParaCeo && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
              Escalada
            </span>
          )}
          <span
            className={cn(
              "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
              CLASSE_DA_PRIORIDADE[prioridade],
            )}
          >
            {ROTULO_DA_PRIORIDADE[prioridade]}
          </span>
          {item.conversa && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-muted text-muted-foreground">
              {ROTULO_DO_DEPARTAMENTO[item.conversa.departamento as Departamento]}
            </span>
          )}
          {item.conversa?.categoria && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-muted text-muted-foreground">
              {ROTULO_DA_CATEGORIA[item.conversa.categoria] ?? item.conversa.categoria}
            </span>
          )}
          {confianca && (
            <span
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                confianca.classe,
              )}
            >
              {confianca.texto}
            </span>
          )}
        </div>
      </div>

      {item.conversa?.escaladaMotivo && (
        <p className="mt-1.5 text-xs text-red-700 dark:text-red-400 flex items-center gap-1.5">
          <ShieldAlert className="size-3" /> {item.conversa.escaladaMotivo}
        </p>
      )}

      {item.triagem?.resumo && (
        <p className="mt-2 text-xs text-muted-foreground">{item.triagem.resumo}</p>
      )}

      {item.expirada && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
          <Clock className="size-3" />
          A janela de resposta do canal já passou. Aprovar aqui não produz mensagem.
        </p>
      )}

      <Textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={4}
        className="mt-3 text-sm"
        aria-label="Resposta sugerida"
      />
      <p className="text-[11px] text-muted-foreground mt-1">
        Sugerida pela IA{item.modelo ? ` (${item.modelo})` : ""} ·{" "}
        {formatTimestampComHora(item.criadoEm)}
        {editado && " · editada por você"}
      </p>

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <Button
          size="sm"
          disabled={ocupado || texto.trim().length === 0}
          onClick={() => void decidir("aprovar")}
        >
          <Check className="size-3.5" /> {editado ? "Editar e aprovar" : "Aprovar"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={ocupado}
          onClick={() => void decidir("recusar")}
        >
          <X className="size-3.5" /> Recusar
        </Button>
        {item.conversa && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onAbrirConversa(item.conversa!._id)}
          >
            Ver conversa
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Conversa ────────────────────────────────────────────────────────────────

function ConversaDialog({
  conversationId,
  onClose,
}: {
  conversationId: Id<"communicationConversations"> | null;
  onClose: () => void;
}) {
  const conversa = useQuery(
    api.communications.abrirConversa,
    conversationId ? { conversationId } : "skip",
  );

  return (
    <Dialog open={conversationId !== null} onOpenChange={(aberto) => !aberto && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{conversa?.contato?.nome ?? "Conversa"}</DialogTitle>
          <DialogDescription>
            {conversa?.assunto ?? "Carregando…"}
            {conversa?.contatoDetalhe?.identidades?.[0] &&
              ` · ${conversa.contatoDetalhe.identidades[0].externalId}`}
          </DialogDescription>
        </DialogHeader>

        {conversa === undefined ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto space-y-2 pr-1">
            {conversa.mensagens.map((m) => (
              <div
                key={m._id}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm max-w-[85%]",
                  m.direcao === "entrada"
                    ? "bg-muted"
                    : "bg-primary/10 ml-auto text-right",
                )}
              >
                <p className="whitespace-pre-wrap break-words">
                  {m.texto ?? `[${m.tipo}]`}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {formatTimestampComHora(m.enviadaEm)}
                </p>
              </div>
            ))}
            {conversa.mensagens.length === 0 && (
              <p className="text-sm text-muted-foreground">Sem mensagens.</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
