import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { ArrowRightLeft, ClipboardCheck } from "lucide-react";
import { montarConferenciaDeMobiliario } from "@/lib/conferencia-de-mobiliario.ts";
import { urlDeMiniatura } from "@/convex/lib/fotoDoItem.ts";
import { ROTULO_DA_ORIGEM, ROTULO_DA_SITUACAO } from "@/convex/lib/itemDoBriefing.ts";
import { ItemCard, type ItemDaSecao } from "./assembly-items-section.tsx";

// A conferência de mobiliário do evento inteiro. É LEITURA dos itens que
// moram nos blocos da Cerimônia, da Festa e da Mesa do bolo — editar aqui
// edita o mesmo item. Ver `lib/conferencia-de-mobiliario.ts`.
export function ConferenciaDeMobiliario({ eventId }: { eventId: Id<"events"> }) {
  const todos = useQuery(api.assemblyItems.listByEvent, { eventId });
  const atualizar = useMutation(api.assemblyItems.update);
  const remover = useMutation(api.assemblyItems.remove);
  const [editando, setEditando] = useState<string | null>(null);

  if (todos === undefined) return null;
  const c = montarConferenciaDeMobiliario(todos as unknown as ItemDaSecao[]);

  return (
    <section className="mb-6 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="size-4 text-primary" />
        <h3 className="text-sm font-semibold">Conferência do mobiliário do evento</h3>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Os móveis e apoios cadastrados na Cerimônia, na Festa, na Mesa do bolo e aqui. É a mesma
        peça: editar aqui muda o item onde ele foi cadastrado.
      </p>
      {c.itens === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Nenhum móvel cadastrado ainda. Use os blocos “Assentos e apoios”, “Mesas de convidados”,
          “Bar”, “Convivência” e “Composição” da mesa do bolo — ou “Outros móveis” abaixo.
        </p>
      ) : (
        <>
          <p className="mt-2 text-xs">
            <strong>{c.itens}</strong> {c.itens === 1 ? "item" : "itens"} ·{" "}
            <strong>{c.pecas}</strong> peças físicas
            {c.semQuantidade > 0 && ` · ${c.semQuantidade} sem quantidade informada`}
            {c.reaproveitados > 0 && ` · ${c.reaproveitados} reaproveitado(s) entre ambientes, contado(s) uma vez`}
          </p>
          <div className="mt-3 space-y-4">
            {c.grupos.map((g) => (
              <div key={g.key}>
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-primary">{g.label}</h4>
                <ul className="mt-1 divide-y divide-border rounded-lg border border-border">
                  {g.itens.map((item) => {
                    const thumb = urlDeMiniatura(item.contractedFoto) ?? urlDeMiniatura(item.referenceFoto);
                    const detalhes = [
                      item.model,
                      item.corAcabamento,
                      item.medidas,
                      item.posicao && `posição: ${item.posicao}`,
                      item.origem && ROTULO_DA_ORIGEM[item.origem],
                      item.supplierName,
                      item.responsavelMontagem && `monta: ${item.responsavelMontagem}`,
                    ].filter(Boolean);
                    return (
                      <li key={item._id} className="p-2.5">
                        <div className="flex items-start gap-2.5">
                          {thumb ? (
                            <img src={thumb} alt="" loading="lazy" className="size-10 flex-shrink-0 rounded object-cover border border-border" />
                          ) : (
                            <div className="size-10 flex-shrink-0 rounded bg-muted" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                              <p className="text-sm font-medium break-words">
                                {item.quantity ? `${item.quantity}${item.unit ? ` ${item.unit}` : ""} · ` : ""}
                                {item.name}
                              </p>
                              <span className="text-[11px] text-muted-foreground">
                                {item.situacao ? ROTULO_DA_SITUACAO[item.situacao] : "Situação não informada"}
                              </span>
                            </div>
                            {detalhes.length > 0 && (
                              <p className="text-xs text-muted-foreground break-words">{detalhes.join(" · ")}</p>
                            )}
                            {item.reaproveitamento?.ambiente && (
                              <p className="mt-0.5 flex items-center gap-1 text-xs text-primary">
                                <ArrowRightLeft className="size-3" />
                                Também em {item.reaproveitamento.ambiente}
                                {item.reaproveitamento.horario && ` · ${item.reaproveitamento.horario}`}
                                {item.reaproveitamento.responsavel && ` · transfere: ${item.reaproveitamento.responsavel}`}
                              </p>
                            )}
                            <button
                              type="button"
                              onClick={() => setEditando(editando === item._id ? null : item._id)}
                              className="mt-1 text-xs text-primary hover:underline cursor-pointer"
                            >
                              {editando === item._id ? "Fechar edição" : "Editar"}
                            </button>
                          </div>
                        </div>
                        {editando === item._id && (
                          <div className="mt-2">
                            <ItemCard
                              item={item}
                              expanded
                              onToggle={() => setEditando(null)}
                              onUpdate={atualizar}
                              onRemove={remover}
                            />
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
