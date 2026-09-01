import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { toast } from "sonner";
import { ArrowLeft, Layers, ImageOff } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { formatEventDateLong } from "@/lib/event-date.ts";
import { PROJECT_SCOPES, scopeMeta, AVISO_REFERENCIA, type ProjectScope } from "@/lib/photo-scope.ts";
import {
  fotoDoItem,
  montarProjeto,
  type ItemDoProjeto,
} from "@/lib/decoration-project.ts";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty.tsx";

// ─────────────────────────────────────────────────────────────────────────────
// PROJETO DE DECORAÇÃO
//
// É uma LEITURA de `assemblyItems` organizada por ambiente — não um cadastro
// paralelo. O mesmo item que a equipe monta é o que o projeto mostra; cadastrar
// duas vezes garantiria que as duas versões divergissem na primeira semana.
//
// A única coisa que se edita aqui é o ESCOPO: se aquele item é contratado,
// referência estética ou algo que ficou de fora. É a distinção que evita a
// confusão mais cara da decoração — o cliente achar que a inspiração foi
// contratada.
// ─────────────────────────────────────────────────────────────────────────────

function SeloEscopo({ scope }: { scope?: string }) {
  const meta = scopeMeta(scope);
  // Item sem classificação não recebe selo: cadastro incompleto não vira
  // promessa ao cliente.
  if (!meta) return null;
  return (
    <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", meta.classe)}>
      {meta.label}
    </span>
  );
}

export default function ProjetoDecoracaoPage() {
  const { id } = useParams<{ id: string }>();
  const eventId = id as Id<"events">;

  const event = useQuery(api.events.get, { id: eventId });
  const itens = useQuery(api.assemblyItems.listByEvent, { eventId });
  const atualizar = useMutation(api.assemblyItems.update);

  const projeto = montarProjeto((itens ?? []) as unknown as ItemDoProjeto[]);
  const totalItens = itens?.length ?? 0;

  const mudarEscopo = async (itemId: Id<"assemblyItems">, scope: ProjectScope | "") => {
    try {
      await atualizar({ id: itemId, projectScope: scope === "" ? undefined : scope });
      toast.success("Classificação atualizada.");
    } catch {
      toast.error("Não foi possível salvar a classificação.");
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
      <Link
        to={`/eventos/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground cursor-pointer"
      >
        <ArrowLeft className="size-4" />
        {event?.name ?? "Evento"}
      </Link>

      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Layers className="size-5 text-primary" /> Projeto de decoração
        </h1>
        {event && (
          <p className="text-sm text-muted-foreground mt-0.5">
            {event.name} · {formatEventDateLong(event.date)}
          </p>
        )}
      </div>

      {itens === undefined ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      ) : totalItens === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Layers />
            </EmptyMedia>
            <EmptyTitle>O projeto ainda não tem itens</EmptyTitle>
            <EmptyDescription>
              Os itens de montagem cadastrados no briefing aparecem aqui, organizados por
              ambiente. É a mesma informação — você não cadastra duas vezes.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-4">
          {projeto.map((ambiente) => (
            <section
              key={ambiente.key}
              className="bg-card rounded-xl border border-border overflow-hidden"
            >
              <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3">
                <h2 className="font-semibold text-sm">
                  {ambiente.emoji ? `${ambiente.emoji} ` : ""}
                  {ambiente.label}
                </h2>
                <p className="text-xs text-muted-foreground flex-shrink-0">
                  {ambiente.itens.length}{" "}
                  {ambiente.itens.length === 1 ? "item" : "itens"}
                  {ambiente.referencias > 0 && ` · ${ambiente.referencias} referência${ambiente.referencias === 1 ? "" : "s"}`}
                </p>
              </div>

              <div className="divide-y divide-border">
                {ambiente.itens.map((item) => {
                  const foto = fotoDoItem(item);
                  const detalhes = [
                    item.model,
                    item.ambiente,
                    item.supplierName,
                  ].filter(Boolean) as string[];

                  return (
                    <div key={item._id} className="px-5 py-3 flex gap-3">
                      {/* Referência visual do item. Sem foto, um marcador
                          discreto — nada de espaço vazio sem explicação. */}
                      <div className="flex-shrink-0">
                        {foto.url ? (
                          <div className="relative">
                            <img
                              src={foto.url}
                              alt={item.name}
                              loading="lazy"
                              className="size-16 rounded-lg object-cover bg-muted"
                            />
                            {foto.ehReferencia && (
                              <span className="absolute -bottom-1 left-0 right-0 text-[8px] font-bold text-center bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300 rounded-b-lg py-0.5">
                                REFERÊNCIA
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="size-16 rounded-lg bg-muted flex items-center justify-center">
                            <ImageOff className="size-5 text-muted-foreground" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <p className="text-sm font-medium">
                            {item.quantity
                              ? `${item.quantity}${item.unit ? ` ${item.unit}` : ""} · `
                              : ""}
                            {item.name}
                          </p>
                          <SeloEscopo scope={item.projectScope} />
                        </div>

                        {detalhes.length > 0 && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {detalhes.join(" · ")}
                          </p>
                        )}
                        {item.notes && (
                          <p className="text-xs text-muted-foreground mt-0.5">{item.notes}</p>
                        )}

                        <select
                          value={item.projectScope ?? ""}
                          onChange={(e) =>
                            void mudarEscopo(
                              item._id as Id<"assemblyItems">,
                              e.target.value as ProjectScope | "",
                            )
                          }
                          aria-label={`Classificação de ${item.name}`}
                          className="mt-1.5 h-7 rounded-md border border-input bg-background px-2 text-xs cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <option value="">Sem classificação</option>
                          {PROJECT_SCOPES.map((sc) => (
                            <option key={sc.value} value={sc.value}>
                              {sc.label}
                            </option>
                          ))}
                        </select>

                        {item.projectScope === "referencia" && (
                          <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
                            {AVISO_REFERENCIA}. Não entra como obrigação de montagem.
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
