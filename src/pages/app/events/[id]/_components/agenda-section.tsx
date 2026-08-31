import { Link } from "react-router-dom";
import { CalendarClock, Lock, Users } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { buildAgenda } from "@/lib/agenda.ts";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

// ─────────────────────────────────────────────────────────────────────────────
// AGENDA DO EVENTO — prévia da futura integração com Google Agenda.
//
// IMPORTANTE: não existe integração real. Nenhum OAuth, nenhuma API do Google,
// nenhuma credencial, nenhuma variável de ambiente, nenhuma sincronização,
// nenhum pacote novo. A palavra "Google" aparece SOMENTE como texto.
//
// O que a seção faz de útil hoje: consolida num lugar só os horários que a
// decoradora já preencheu no briefing e na escala da equipe, mais os
// alinhamentos com fornecedores. Zero dado fictício — toda a consolidação é
// feita por `buildAgenda` (src/lib/agenda.ts), que é pura e testada.
// ─────────────────────────────────────────────────────────────────────────────

type Props = {
  eventId: Id<"events">;
  eventDate: string;
  briefing: Parameters<typeof buildAgenda>[0]["briefing"];
  team: Parameters<typeof buildAgenda>[0]["team"];
  suppliers: Parameters<typeof buildAgenda>[0]["suppliers"];
};

/** Data de um alinhamento, tolerante ao formato (ISO completo ou AAAA-MM-DD). */
function formatarData(bruto: string): string {
  const data = new Date(bruto.length <= 10 ? `${bruto}T12:00:00` : bruto);
  if (Number.isNaN(data.getTime())) return bruto;
  return format(data, "dd/MM/yyyy", { locale: ptBR });
}

export function AgendaSection({ eventId, eventDate, briefing, team, suppliers }: Props) {
  // `undefined` em qualquer fonte significa "ainda carregando".
  const carregando = briefing === undefined || team === undefined || suppliers === undefined;
  const agenda = buildAgenda({ briefing, team, suppliers });

  const dataDoEvento = (() => {
    const d = new Date(eventDate.length <= 10 ? `${eventDate}T12:00:00` : eventDate);
    if (Number.isNaN(d.getTime())) return null;
    return format(d, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR });
  })();

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border">
        <h2 className="font-semibold flex items-center gap-2">
          <CalendarClock className="size-4 text-primary" /> Agenda do Evento
        </h2>
        <span className="text-xs text-muted-foreground flex items-center gap-1.5 flex-shrink-0">
          <span className="hidden sm:inline">Google Agenda</span>
          <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
            Em breve
          </span>
        </span>
      </div>

      {carregando ? (
        <div className="px-5 py-4 space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : agenda.isEmpty ? (
        /* Estado vazio honesto: diz exatamente o que falta e onde preencher. */
        <div className="px-5 py-8 text-center space-y-2">
          <p className="text-sm text-muted-foreground">
            Nenhum horário definido para este evento ainda.
          </p>
          <p className="text-xs text-muted-foreground">
            A agenda usa os horários de montagem, cerimônia, recepção e desmontagem do{" "}
            <Link to={`/eventos/${eventId}/briefing`} className="text-primary hover:underline">
              briefing
            </Link>
            , e os horários da escala em Equipe do Evento.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {/* ── Antes do evento — só aparece se houver alinhamento ── */}
          {agenda.before.length > 0 && (
            <div className="px-5 py-4">
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
                Antes do evento
              </h3>
              <ul className="space-y-3">
                {agenda.before.map((a, i) => (
                  <li key={`${a.date}-${a.supplierName}-${i}`} className="flex gap-3 text-sm">
                    <span className="text-xs font-medium text-muted-foreground tabular-nums pt-0.5 w-[72px] flex-shrink-0">
                      {formatarData(a.date)}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium">{a.supplierName}</p>
                      {a.note && <p className="text-xs text-muted-foreground">{a.note}</p>}
                      {a.nextAction && (
                        <p className="text-xs text-primary mt-0.5">Próximo: {a.nextAction}</p>
                      )}
                      <p className="text-xs text-muted-foreground/70 mt-0.5">
                        alinhamento com fornecedor{a.by ? ` · ${a.by}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ── No dia do evento ── */}
          {agenda.onTheDay.length > 0 && (
            <div className="px-5 py-4">
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
                No dia do evento
              </h3>
              {dataDoEvento && (
                <p className="text-xs text-muted-foreground mb-3 first-letter:uppercase">
                  {dataDoEvento}
                </p>
              )}
              <ul className="space-y-3">
                {agenda.onTheDay.map((item, i) => (
                  <li key={`${item.time}-${item.title}-${i}`} className="flex gap-3 text-sm">
                    <span className="text-sm font-semibold tabular-nums pt-px w-[52px] flex-shrink-0">
                      {item.time}
                    </span>
                    <div className="min-w-0 border-l border-border pl-3">
                      <p className="font-medium flex items-center gap-1.5">
                        {item.origin === "equipe" && (
                          <Users className="size-3.5 text-muted-foreground flex-shrink-0" />
                        )}
                        {item.title}
                      </p>

                      {/* Pessoas agrupadas no mesmo horário — o horário aparece
                          uma vez só, com a lista embaixo. */}
                      {item.people && (
                        <ul className="mt-1 space-y-0.5">
                          {item.people.map((p) => (
                            <li key={p.name} className="text-xs text-muted-foreground">
                              {p.name}
                              {p.role ? ` · ${p.role}` : ""}
                            </li>
                          ))}
                        </ul>
                      )}

                      <p className="text-xs text-muted-foreground/70 mt-0.5">
                        {item.origin === "briefing" ? "do briefing" : "da escala da equipe"}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ── Rodapé: a prévia da integração futura ──────────────────────────
          O botão é desabilitado DE VERDADE (`disabled`), não apenas cinza: não
          é clicável, não recebe foco pelo teclado e leitores de tela anunciam
          como indisponível. Sem onClick, sem link, sem promessa de data. */}
      <div className="px-5 py-4 border-t border-border bg-muted/30 space-y-2">
        <Button variant="outline" className="w-full gap-2" disabled>
          <Lock className="size-3.5" />
          Conectar Google Agenda
        </Button>
        <p className="text-xs text-muted-foreground text-center leading-relaxed">
          A sincronização automática com o Google Agenda será disponibilizada futuramente.
          Por enquanto, esta agenda reúne os horários que você já preencheu no ALTAR.
        </p>
      </div>
    </div>
  );
}
