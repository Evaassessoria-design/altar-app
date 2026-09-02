import { useState } from "react";
import { AjusteDeAcervoDialog } from "@/components/ajuste-de-acervo-dialog.tsx";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle,
} from "@/components/ui/empty.tsx";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import { ArrowLeft, Boxes, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { formatEventDayOnly } from "@/lib/event-date.ts";
import { abreviarUnidade } from "@/convex/lib/materiais.ts";
import { ROTULO_DA_RESERVA } from "@/convex/lib/acervo.ts";

// ─────────────────────────────────────────────────────────────────────────────
// ACERVO DO EVENTO
//
// Usada no galpão, com o celular na mão: registrar "saiu 20" e "voltou 19"
// precisa ser rápido. Campos numéricos grandes, nada de tabela horizontal.
//
// Todos os números — disponível, déficit, falta voltar, conflito — vêm
// calculados do backend. A tela não decide nada.
// ─────────────────────────────────────────────────────────────────────────────

function Movimento({
  rotulo, valor, onSalvar,
}: {
  rotulo: string;
  valor?: number;
  onSalvar: (n: number) => Promise<void>;
}) {
  const [texto, setTexto] = useState(valor === undefined ? "" : String(valor));
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    const n = Number(texto.replace(",", "."));
    if (!Number.isFinite(n)) return toast.error("Quantidade inválida.");
    setSalvando(true);
    try {
      await onSalvar(n);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-muted-foreground w-14">{rotulo}</label>
      <Input
        inputMode="numeric"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="—"
        className="h-10 w-20 text-center text-base"
      />
      <Button size="sm" variant="outline" disabled={salvando}
        onClick={() => void salvar()} className="cursor-pointer">
        {salvando ? "..." : "Salvar"}
      </Button>
    </div>
  );
}

export default function AcervoDoEventoPage() {
  const { id } = useParams<{ id: string }>();
  const eventId = id as Id<"events">;
  const event = useQuery(api.events.get, { id: eventId });
  const acervo = useQuery(api.acervo.doEvento, { eventId });
  const reservarDaFicha = useMutation(api.acervo.reservarDaFicha);
  const registrarSaida = useMutation(api.acervo.registrarSaida);
  const registrarRetorno = useMutation(api.acervo.registrarRetorno);
  const liberar = useMutation(api.acervo.liberarReserva);
  const [gerando, setGerando] = useState(false);
  // Baixa iniciada a partir do evento: leva a sugestao de quantidade, mas a
  // confirmacao (tipo, numero, motivo) continua sendo da pessoa.
  const [baixa, setBaixa] = useState<
    { item: { _id: Id<"collectionItems">; nome: string; unidade: string; quantidadeTotal: number }; quantidade: number } | null
  >(null);

  const comErro = (e: unknown) =>
    toast.error(
      e instanceof ConvexError ? (e.data as { message: string }).message : "Não foi possível salvar.",
    );

  const handleDaFicha = async () => {
    setGerando(true);
    try {
      const r = await reservarDaFicha({ eventId });
      toast.success(
        r.criadas + r.atualizadas === 0
          ? "Nenhum material da ficha tem item de acervo vinculado."
          : `${r.criadas} reserva(s) criada(s), ${r.atualizadas} atualizada(s).`,
      );
      if (r.comDeficit.length > 0) {
        toast.warning(
          `Faltam peças: ${r.comDeficit.map((d) => `${d.nome} (${d.deficit})`).join(", ")}.`,
        );
      }
      if (r.precisamEscolha.length > 0) {
        // Varios itens do acervo servem o mesmo material. QUAIS pecas saem do
        // galpao e decisao da decoradora — o sistema mostra as opcoes em vez
        // de dividir por conta propria.
        for (const p of r.precisamEscolha) {
          toast.info(`${p.nome}: escolha de qual item reservar`, {
            description: `Equivalentes no acervo: ${p.opcoes.join(", ")}. Reserve manualmente o que for usar.`,
          });
        }
      }
      if (r.semAcervo.length > 0) {
        toast.info(`Sem item de acervo vinculado: ${r.semAcervo.join(", ")}.`);
      }
    } catch (e) {
      comErro(e);
    } finally {
      setGerando(false);
    }
  };

  if (event === undefined || acervo === undefined) {
    return <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-3">
      <Skeleton className="h-8 w-48" /><Skeleton className="h-32 w-full rounded-xl" />
    </div>;
  }
  if (!event || !acervo) return <div className="p-6 text-sm text-muted-foreground">Evento não encontrado.</div>;

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <Link to={`/eventos/${id}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3">
        <ArrowLeft className="size-4" /> {event.name}
      </Link>

      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Boxes className="size-5 text-primary" /> Acervo do evento
          </h1>
          <p className="text-sm text-muted-foreground">
            O que sai do seu galpão para este evento
          </p>
        </div>
        <Button size="sm" variant="outline" disabled={gerando}
          onClick={() => void handleDaFicha()} className="cursor-pointer">
          {gerando ? "..." : "Reservar da ficha"}
        </Button>
      </div>

      {acervo.reservas.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Boxes /></EmptyMedia>
            <EmptyTitle>Nenhuma peça reservada</EmptyTitle>
            <EmptyDescription>
              Use “Reservar da ficha” para trazer o que a Ficha Técnica precisa e que já existe no
              seu acervo.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-3">
          {acervo.reservas.map((r) => (
            <div key={r._id} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-sm">{r.item?.nome ?? "Item removido"}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.quantidade} {abreviarUnidade(r.item?.unidade ?? "")} reservados ·{" "}
                    {formatEventDayOnly(r.inicio)} a {formatEventDayOnly(r.fim)}
                  </p>
                </div>
                <span className={cn(
                  "text-xs px-2 py-0.5 rounded-full flex-shrink-0",
                  r.situacao === "retornada"
                    ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                    : "bg-muted text-muted-foreground",
                )}>
                  {ROTULO_DA_RESERVA[r.situacao]}
                </span>
              </div>

              {/* DÉFICIT — as peças foram prometidas a mais de um evento. */}
              {r.deficit > 0 && (
                <div className="mt-2 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-900/10 px-3 py-2">
                  <p className="text-xs flex items-center gap-1 text-amber-800 dark:text-amber-300">
                    <TriangleAlert className="size-3" />
                    Faltam {r.deficit} {abreviarUnidade(r.item?.unidade ?? "")} — você tem{" "}
                    {r.item?.quantidadeTotal} no total e {r.disponivel} livres nesta janela.
                  </p>
                  {r.conflitos.map((c) => (
                    <p key={c.reservaId} className="text-xs text-muted-foreground mt-1">
                      {c.quantidade} reservados para {c.evento} ({formatEventDayOnly(c.inicio)} a{" "}
                      {formatEventDayOnly(c.fim)})
                    </p>
                  ))}
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-3">
                <Movimento rotulo="Saiu" valor={r.saiu}
                  onSalvar={async (saiu) => {
                    try {
                      await registrarSaida({ id: r._id, saiu });
                      toast.success("Saída registrada.");
                    } catch (e) { comErro(e); }
                  }} />
                <Movimento rotulo="Voltou" valor={r.voltou}
                  onSalvar={async (voltou) => {
                    try {
                      const res = await registrarRetorno({ id: r._id, voltou });
                      toast.success(
                        res.faltaVoltar > 0
                          ? `Faltam ${res.faltaVoltar} voltar. O acervo não foi alterado.`
                          : "Tudo voltou.",
                      );
                    } catch (e) { comErro(e); }
                  }} />
              </div>

              {r.faltaVoltar > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    {r.faltaVoltar} {r.faltaVoltar === 1 ? "peça saiu e não voltou" : "peças saíram e não voltaram"}.
                    O total do acervo não foi alterado.
                  </p>
                  {/* "Nao voltou" NAO e "perdeu". A peca pode estar no carro, na
                      casa da cliente, ou voltar na segunda. O sistema nunca
                      converte um no outro sozinho — oferece a baixa e espera a
                      pessoa confirmar tipo, quantidade e motivo. */}
                  {r.item && (
                    <button
                      onClick={() => setBaixa({
                        item: r.item!,
                        quantidade: r.faltaVoltar,
                      })}
                      className="mt-1 text-xs text-muted-foreground hover:text-destructive hover:underline cursor-pointer"
                    >
                      Dar baixa no acervo
                    </button>
                  )}
                </div>
              )}

              {(r.saiu ?? 0) === 0 && (
                <button
                  onClick={() => {
                    void liberar({ id: r._id })
                      .then(() => toast.success("Reserva liberada."))
                      .catch(comErro);
                  }}
                  className="mt-2 text-xs text-muted-foreground hover:text-destructive hover:underline cursor-pointer"
                >
                  Liberar reserva
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {baixa && (
        <AjusteDeAcervoDialog
          item={baixa.item}
          eventId={eventId}
          tipoInicial="perda"
          quantidadeInicial={baixa.quantidade}
          onClose={() => setBaixa(null)}
        />
      )}
    </div>
  );
}
