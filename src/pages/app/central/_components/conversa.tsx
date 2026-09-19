import { useEffect, useRef, useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Check, Clock, MailOpen, ShieldAlert, Sparkles } from "lucide-react";
import { formatTimestampComHora } from "@/lib/safe-date.ts";
import {
  ROTULO_DA_CATEGORIA,
  ROTULO_DA_PRIORIDADE,
  ROTULO_DO_DEPARTAMENTO,
  rotuloDaConfianca,
  type Departamento,
  type Prioridade,
} from "@/lib/central-fila.ts";
import {
  emOrdemCronologica,
  OPCOES_DE_STATUS,
  ROTULO_DO_CANAL,
  rotuloDaJanela,
  type Canal,
  type StatusDeConversa,
} from "@/lib/central-inbox.ts";

// ─────────────────────────────────────────────────────────────────────────────
// A CONVERSA — histórico completo e as decisões que se tomam sobre ela
//
// Tudo o que esta tela muda é CLASSIFICAÇÃO e ENCAMINHAMENTO: departamento,
// categoria, prioridade, responsável, status, escalada. Nada aqui envia
// mensagem — a única porta de saída continua sendo a fila de aprovação, e ela
// depende do portão do ambiente.
//
// ── POR QUE MARCAR COMO LIDA AO ABRIR ───────────────────────────────────────
// O contador de não lidas é do PAINEL: ele responde "quanto falta olhar". Uma
// conversa que foi aberta já foi olhada. Manter o número depois disso
// treinaria a operação a ignorar o número.
// ─────────────────────────────────────────────────────────────────────────────

const MENSAGENS_POR_PAGINA = 50;

const CLASSE_DO_SELECT =
  "h-8 w-full min-w-0 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring";

function erroLegivel(erro: unknown): string {
  if (erro instanceof ConvexError) {
    const dados = erro.data as { message?: string } | undefined;
    return dados?.message ?? "Não foi possível concluir.";
  }
  return "Não foi possível concluir.";
}

export function Conversa({
  conversationId,
  operadores,
}: {
  conversationId: Id<"communicationConversations">;
  operadores: { _id: Id<"users">; name: string }[];
}) {
  const conversa = useQuery(api.communications.abrirConversa, { conversationId });
  const marcarComoLida = useMutation(api.communications.marcarComoLida);
  const jaMarcada = useRef<string | null>(null);

  const {
    results: mensagens,
    status: estadoDoHistorico,
    loadMore,
  } = usePaginatedQuery(
    api.communications.listarMensagens,
    { conversationId },
    { initialNumItems: MENSAGENS_POR_PAGINA },
  );

  // Uma vez por conversa aberta, e só quando há o que marcar.
  useEffect(() => {
    if (!conversa || conversa.naoLidas === 0) return;
    if (jaMarcada.current === conversationId) return;
    jaMarcada.current = conversationId;
    void marcarComoLida({ conversationId }).catch(() => {
      // Falhar em zerar um contador não pode atrapalhar quem está lendo a
      // conversa: o número volta na próxima leitura.
      jaMarcada.current = null;
    });
  }, [conversa, conversationId, marcarComoLida]);

  if (conversa === undefined) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const janela = rotuloDaJanela(conversa.janelaRespostaAte, Date.now());
  const triagem = conversa.triagens[0];
  const confianca = triagem ? rotuloDaConfianca(triagem.confianca) : null;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* ── Cabeçalho ─────────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h2 className="font-semibold truncate">
              {conversa.contato?.nome ?? "Contato desconhecido"}
            </h2>
            <p className="text-xs text-muted-foreground truncate">
              {conversa.assunto} · {ROTULO_DO_CANAL[conversa.channel as Canal]}
              {conversa.contatoDetalhe?.identidades?.[0] &&
                ` · ${conversa.contatoDetalhe.identidades[0].externalId}`}
            </p>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {janela && (
              <span
                className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded-full font-medium flex items-center gap-1",
                  janela.encerrada
                    ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                    : "bg-muted text-muted-foreground",
                )}
              >
                <Clock className="size-2.5" /> {janela.texto}
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

        {conversa.escaladaParaCeo && conversa.escaladaMotivo && (
          <p className="mt-2 text-xs text-red-700 dark:text-red-400 flex items-center gap-1.5">
            <ShieldAlert className="size-3" /> {conversa.escaladaMotivo}
          </p>
        )}

        {triagem?.resumo && (
          <p className="mt-2 text-xs text-muted-foreground flex items-start gap-1.5">
            <Sparkles className="size-3 mt-0.5 flex-shrink-0" />
            <span>
              <span className="font-medium">Leitura da IA:</span> {triagem.resumo}
            </span>
          </p>
        )}
      </div>

      {/* ── Decisões sobre a conversa ─────────────────────────────────── */}
      <AcoesDaConversa
        conversationId={conversationId}
        departamento={conversa.departamento as Departamento}
        categoria={conversa.categoria}
        prioridade={conversa.prioridade as Prioridade}
        status={conversa.status as StatusDeConversa}
        responsavelUserId={conversa.responsavelUserId}
        escalada={conversa.escaladaParaCeo}
        naoLidas={conversa.naoLidas}
        operadores={operadores}
      />

      {/* ── Histórico ─────────────────────────────────────────────────── */}
      <div className="px-4 py-4 space-y-2 max-h-[55vh] overflow-y-auto">
        {estadoDoHistorico === "CanLoadMore" || estadoDoHistorico === "LoadingMore" ? (
          <div className="text-center">
            <Button
              size="sm"
              variant="ghost"
              disabled={estadoDoHistorico === "LoadingMore"}
              onClick={() => loadMore(MENSAGENS_POR_PAGINA)}
            >
              {estadoDoHistorico === "LoadingMore"
                ? "Carregando…"
                : "Carregar mensagens mais antigas"}
            </Button>
          </div>
        ) : null}

        {estadoDoHistorico === "LoadingFirstPage" ? (
          <>
            <Skeleton className="h-12 w-2/3" />
            <Skeleton className="h-12 w-2/3 ml-auto" />
          </>
        ) : mensagens.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Sem mensagens nesta conversa.
          </p>
        ) : (
          emOrdemCronologica(mensagens).map((m) => (
            <div
              key={m._id}
              className={cn(
                "rounded-lg px-3 py-2 text-sm max-w-[85%]",
                m.direcao === "entrada" ? "bg-muted" : "bg-primary/10 ml-auto",
              )}
            >
              <p className="whitespace-pre-wrap break-words">{m.texto ?? `[${m.tipo}]`}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {m.autor === "cliente"
                  ? "Cliente"
                  : m.autor === "altar"
                    ? "ALTAR"
                    : "Sistema"}{" "}
                · {formatTimestampComHora(m.enviadaEm)}
                {m.statusEntrega ? ` · ${m.statusEntrega}` : ""}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Ações ───────────────────────────────────────────────────────────────────

function AcoesDaConversa({
  conversationId,
  departamento,
  categoria,
  prioridade,
  status,
  responsavelUserId,
  escalada,
  naoLidas,
  operadores,
}: {
  conversationId: Id<"communicationConversations">;
  departamento: Departamento;
  categoria?: string;
  prioridade: Prioridade;
  status: StatusDeConversa;
  responsavelUserId?: Id<"users">;
  escalada: boolean;
  naoLidas: number;
  operadores: { _id: Id<"users">; name: string }[];
}) {
  const definirClassificacao = useMutation(api.communications.definirClassificacao);
  const definirResponsavel = useMutation(api.communications.definirResponsavel);
  const definirStatus = useMutation(api.communications.definirStatus);
  const marcarComoLida = useMutation(api.communications.marcarComoLida);
  const escalarParaCeo = useMutation(api.communications.escalarParaCeo);

  const [escalando, setEscalando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function executar(acao: () => Promise<unknown>, mensagem: string) {
    setOcupado(true);
    try {
      await acao();
      toast.success(mensagem);
    } catch (erro) {
      toast.error(erroLegivel(erro));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="px-4 py-3 border-b border-border bg-muted/30">
      {/* Duas colunas, e não quatro: com quatro `select` lado a lado o rótulo
          selecionado vira "Demonstraç…" e a pessoa deixa de enxergar como a
          conversa está classificada — que é a informação que a barra existe
          para mostrar. */}
      <div className="grid grid-cols-2 gap-2">
        <select
          aria-label="Departamento da conversa"
          className={CLASSE_DO_SELECT}
          value={departamento}
          disabled={ocupado}
          onChange={(e) =>
            void executar(
              () =>
                definirClassificacao({
                  conversationId,
                  departamento: e.target.value as Departamento,
                }),
              "Departamento atualizado.",
            )
          }
        >
          {(Object.keys(ROTULO_DO_DEPARTAMENTO) as Departamento[]).map((d) => (
            <option key={d} value={d}>
              {ROTULO_DO_DEPARTAMENTO[d]}
            </option>
          ))}
        </select>

        <select
          aria-label="Categoria da conversa"
          className={CLASSE_DO_SELECT}
          value={categoria ?? ""}
          disabled={ocupado}
          onChange={(e) => {
            const valor = e.target.value;
            if (!valor) return;
            void executar(
              () =>
                definirClassificacao({
                  conversationId,
                  categoria: valor as Parameters<
                    typeof definirClassificacao
                  >[0]["categoria"],
                }),
              "Categoria atualizada.",
            );
          }}
        >
          <option value="">Sem categoria</option>
          {Object.keys(ROTULO_DA_CATEGORIA).map((c) => (
            <option key={c} value={c}>
              {ROTULO_DA_CATEGORIA[c]}
            </option>
          ))}
        </select>

        <select
          aria-label="Prioridade da conversa"
          className={CLASSE_DO_SELECT}
          value={prioridade}
          disabled={ocupado}
          onChange={(e) =>
            void executar(
              () =>
                definirClassificacao({
                  conversationId,
                  prioridade: e.target.value as Prioridade,
                }),
              "Prioridade atualizada.",
            )
          }
        >
          {(Object.keys(ROTULO_DA_PRIORIDADE) as Prioridade[]).map((p) => (
            <option key={p} value={p}>
              {ROTULO_DA_PRIORIDADE[p]}
            </option>
          ))}
        </select>

        <select
          aria-label="Status da conversa"
          className={CLASSE_DO_SELECT}
          value={status}
          disabled={ocupado}
          onChange={(e) =>
            void executar(
              () =>
                definirStatus({
                  conversationId,
                  status: e.target.value as StatusDeConversa,
                }),
              "Status atualizado.",
            )
          }
        >
          {OPCOES_DE_STATUS.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.rotulo}
            </option>
          ))}
        </select>

        <select
          aria-label="Responsável pela conversa"
          className={cn(CLASSE_DO_SELECT, "col-span-2")}
          value={responsavelUserId ?? ""}
          disabled={ocupado}
          onChange={(e) => {
            const valor = e.target.value;
            void executar(
              () =>
                definirResponsavel({
                  conversationId,
                  responsavelUserId: valor ? (valor as Id<"users">) : undefined,
                }),
              valor ? "Responsável definido." : "Responsável removido.",
            );
          }}
        >
          <option value="">Sem responsável</option>
          {operadores.map((o) => (
            <option key={o._id} value={o._id}>
              {o.name}
            </option>
          ))}
        </select>

        <div className="col-span-2 flex items-center gap-2">
          {naoLidas > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              disabled={ocupado}
              onClick={() =>
                void executar(
                  () => marcarComoLida({ conversationId }),
                  "Conversa marcada como lida.",
                )
              }
            >
              <MailOpen className="size-3.5" /> Marcar lida
            </Button>
          )}
          {!escalada && (
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              disabled={ocupado}
              onClick={() => setEscalando(true)}
            >
              <ShieldAlert className="size-3.5" /> Escalar
            </Button>
          )}
          {escalada && (
            <span className="text-xs text-red-700 dark:text-red-400 flex items-center gap-1">
              <ShieldAlert className="size-3" /> Escalada para o CEO
            </span>
          )}
        </div>
      </div>

      <Dialog open={escalando} onOpenChange={setEscalando}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Escalar para o CEO</DialogTitle>
            <DialogDescription>
              O motivo aparece na conversa e na fila de aprovação. Escrever por que isto
              precisa dele é o que torna a escalada útil para quem vai ler.
            </DialogDescription>
          </DialogHeader>

          <Textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            placeholder="Ex.: cliente pedindo desconto fora da política"
            aria-label="Motivo da escalada"
          />

          <DialogFooter>
            <Button variant="outline" onClick={() => setEscalando(false)}>
              Cancelar
            </Button>
            <Button
              disabled={ocupado || motivo.trim().length === 0}
              onClick={async () => {
                await executar(
                  () => escalarParaCeo({ conversationId, motivo: motivo.trim() }),
                  "Conversa escalada.",
                );
                setEscalando(false);
                setMotivo("");
              }}
            >
              <Check className="size-3.5" /> Escalar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
