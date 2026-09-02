import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty.tsx";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import { ArrowLeft, ClipboardList, FileDown, Layers, Package, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { formatEventDateLong } from "@/lib/event-date.ts";
import { labelDoAmbiente } from "@/lib/decoration-project.ts";
import {
  ROTULO_DA_SITUACAO,
  necessidadeDoComponente,
  quantidadeTexto,
  unidadesDaComposicao,
  type SituacaoDaCobertura,
} from "@/convex/lib/fichaTecnica.ts";
import { metaDoTipo, tipoEfetivo } from "@/convex/lib/materiais.ts";
import { ReceitaDialog } from "./_components/receita-dialog.tsx";

// ─────────────────────────────────────────────────────────────────────────────
// FICHA TÉCNICA DO EVENTO
//
// Responde a pergunta que a decoradora fazia no papel: "do que este projeto é
// feito e quanto eu preciso comprar?".
//
// ── DUAS LEITURAS, UMA CONTA ────────────────────────────────────────────────
// "Por ambiente" é como ela projeta; "Consolidado" é como ela compra. Os dois
// vêm do MESMO cálculo, feito no backend (convex/lib/fichaTecnica.ts) — a tela
// não multiplica nada. Se multiplicasse, um dia mostraria 185 onde o PDF
// mostra 180.
//
// ── MOBILE ──────────────────────────────────────────────────────────────────
// Esta tela é usada no galpão, com o celular na mão. Nada de tabela horizontal:
// cada material é um cartão que empilha, e a origem abre embaixo.
// ─────────────────────────────────────────────────────────────────────────────

const MOEDA = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function LinhaConsolidada({
  linha,
}: {
  linha: {
    chave: string;
    materialId?: string;
    nome: string;
    unidade: string;
    necessario: number;
    tipo: string;
    retornavel: boolean;
    tipoAmbiguo: boolean;
    custoEstimado: number | null;
    margemPercentual: number | null;
    sugerido: number;
    sugeridoOperacional: number;
    origens: { composicao: string; area: string; ambiente?: string; unidades: number; porUnidade: number; necessario: number }[];
    cobertura: {
      necessario: number;
      comprado: number;
      faltam: number;
      alvo: number;
      percentual: number | null;
      temCompra: boolean;
      situacao: SituacaoDaCobertura;
      necessidadeMudou: boolean | null;
      necessidadeNaCompra: number | null;
    };
    compraSemelhante: { _id: string; name: string; quantity?: number } | null;
    comprasVinculadas: string[];
    precisaDeAtencao: boolean;
    motivoDaAtencao: string | null;
  };
  eventId: Id<"events">;
}) {
  const [aberto, setAberto] = useState(false);
  const [agindo, setAgindo] = useState(false);
  const meta = metaDoTipo(tipoEfetivo({ tipo: linha.tipo }));
  const vincular = useMutation(api.fichaTecnica.vincularCompra);
  const reconhecer = useMutation(api.fichaTecnica.reconhecerNecessidade);

  const agir = async (acao: () => Promise<unknown>, sucesso: string) => {
    setAgindo(true);
    try {
      await acao();
      toast.success(sucesso);
    } catch (e) {
      toast.error(
        e instanceof ConvexError ? (e.data as { message: string }).message : "Não foi possível concluir.",
      );
    } finally {
      setAgindo(false);
    }
  };

  return (
    <div className="border-b border-border last:border-0">
      <button
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        className="w-full text-left px-4 py-3 hover:bg-accent/40 transition-colors cursor-pointer"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium text-sm">{linha.nome}</p>
            <div className="flex items-center gap-2 flex-wrap mt-0.5">
              <span className="text-xs text-muted-foreground">{meta.rotulo}</span>
              {linha.retornavel && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                  volta para o galpão
                </span>
              )}
              {/* Dois ambientes classificaram este material de formas
                  diferentes. O dado não escolhe por ela — a tela avisa. */}
              {linha.tipoAmbiguo && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                  classificação divergente
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                {linha.origens.length === 1
                  ? "1 ambiente"
                  : `${linha.origens.length} ambientes`}
              </span>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="font-bold text-sm">{quantidadeTexto(linha.necessario, linha.unidade)}</p>
            {linha.custoEstimado !== null && (
              <p className="text-xs text-muted-foreground">≈ {MOEDA(linha.custoEstimado)}</p>
            )}
          </div>
        </div>

        {/* NECESSÁRIO ≠ SUGERIDO ≠ PROVIDENCIADO. A margem aparece como uma
            terceira linha, nunca somada dentro do necessário. */}
        {linha.margemPercentual !== null && linha.margemPercentual > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            Margem {linha.margemPercentual}% · providenciar{" "}
            <span className="text-foreground font-medium">
              {quantidadeTexto(linha.sugeridoOperacional, linha.unidade)}
            </span>
          </p>
        )}

        <div className="mt-1.5 flex items-center gap-2 flex-wrap text-xs">
          {linha.cobertura.temCompra && (
            <span className="text-muted-foreground">
              Providenciado: {quantidadeTexto(linha.cobertura.comprado, linha.unidade)}
              {linha.cobertura.percentual !== null && ` (${linha.cobertura.percentual}%)`}
            </span>
          )}
          {/* Frase humana, vinda do backend. A tela não classifica nada. */}
          <span
            className={cn(
              linha.precisaDeAtencao
                ? "text-amber-700 dark:text-amber-400"
                : "text-muted-foreground",
            )}
          >
            {linha.motivoDaAtencao ?? ROTULO_DA_SITUACAO[linha.cobertura.situacao]}
          </span>
        </div>
      </button>

      {/* A ORIGEM de cada número — é o que permite conferir em vez de confiar. */}
      {aberto && (
        <div className="px-4 pb-3 space-y-1">
          {/* Ações explícitas. Nenhuma delas altera a compra: vincular só liga,
              reconhecer só atualiza o carimbo da necessidade. */}
          {linha.compraSemelhante && linha.materialId && (
            <div className="mb-2 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-900/10 px-3 py-2">
              <p className="text-xs">
                Existe a compra “{linha.compraSemelhante.name}”
                {linha.compraSemelhante.quantity !== undefined &&
                  ` (${quantidadeTexto(linha.compraSemelhante.quantity, linha.unidade)})`}{" "}
                sem vínculo com a ficha.
              </p>
              <Button
                size="sm"
                variant="outline"
                disabled={agindo}
                className="mt-1.5 cursor-pointer"
                onClick={() =>
                  void agir(
                    () =>
                      vincular({
                        purchaseId: linha.compraSemelhante!._id as Id<"purchaseItems">,
                        materialId: linha.materialId as Id<"materials">,
                      }),
                    "Compra vinculada à ficha técnica.",
                  )
                }
              >
                Vincular a esta necessidade
              </Button>
            </div>
          )}

          {linha.cobertura.necessidadeMudou === true && linha.comprasVinculadas.length > 0 && (
            <div className="mb-2 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-900/10 px-3 py-2">
              <p className="text-xs">
                A necessidade mudou de {linha.cobertura.necessidadeNaCompra} para{" "}
                {linha.cobertura.necessario} depois da compra. Reconhecer NÃO altera o que foi
                comprado.
              </p>
              <Button
                size="sm"
                variant="outline"
                disabled={agindo}
                className="mt-1.5 cursor-pointer"
                onClick={() =>
                  void agir(
                    () =>
                      reconhecer({
                        purchaseId: linha.comprasVinculadas[0] as Id<"purchaseItems">,
                      }),
                    "Necessidade reconhecida. A compra não foi alterada.",
                  )
                }
              >
                Reconhecer nova necessidade
              </Button>
            </div>
          )}

          {linha.origens.map((o, i) => (
            <div key={i} className="flex items-baseline justify-between gap-2 text-xs">
              <span className="text-muted-foreground truncate">
                {o.ambiente || labelDoAmbiente(o.area).label} · {o.composicao}
              </span>
              <span className="whitespace-nowrap text-muted-foreground">
                {o.unidades} × {o.porUnidade} ={" "}
                <span className="text-foreground font-medium">
                  {quantidadeTexto(o.necessario, linha.unidade)}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FichaTecnicaPage() {
  const { id } = useParams<{ id: string }>();
  const eventId = id as Id<"events">;
  const event = useQuery(api.events.get, { id: eventId });
  const ficha = useQuery(api.fichaTecnica.getFicha, { eventId });
  const itensDoEvento = useQuery(api.assemblyItems.listByEvent, { eventId });
  const gerarCompras = useMutation(api.fichaTecnica.gerarCompras);
  const empresa = useQuery(api.users.getCurrentUser);

  const [aba, setAba] = useState<"consolidado" | "ambientes">("consolidado");
  const [editando, setEditando] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);

  const porAmbiente = useMemo(() => {
    const itens = itensDoEvento ?? [];
    const mapa = new Map<string, typeof itens>();
    for (const item of itens) {
      const chave = item.ambiente?.trim() || item.area;
      mapa.set(chave, [...(mapa.get(chave) ?? []), item]);
    }
    return [...mapa.entries()];
  }, [itensDoEvento]);

  // O PDF é gerado a partir do SNAPSHOT do evento — nunca da biblioteca
  // central. Um evento de seis meses atrás imprime a receita executada.
  const handlePdf = async () => {
    try {
      await (await import("@/lib/generate-ficha-tecnica-pdf.ts")).generateFichaTecnicaPDF({
        event: {
          name: event!.name, date: event!.date,
          location: event!.location, clientName: event!.clientName,
        },
        composicoes: (itensDoEvento ?? []).map((i) => ({
          _id: i._id, nome: i.name, area: i.area, ambiente: i.ambiente,
          quantidade: i.quantity, projectScope: i.projectScope, receita: i.receita,
        })),
        empresa: empresa ?? null,
      });
      toast.success("Ficha técnica gerada.");
    } catch {
      toast.error("Não foi possível gerar o PDF.");
    }
  };

  const handleGerar = async () => {
    setGerando(true);
    try {
      const r = await gerarCompras({ eventId });
      if (r.criadas === 0 && r.jaExistiam > 0) {
        toast.success("Tudo já estava na lista de compras.");
      } else {
        toast.success(
          r.criadas === 1 ? "1 necessidade enviada para Compras." : `${r.criadas} necessidades enviadas para Compras.`,
        );
      }
      if (r.divergentes > 0) {
        toast.warning(
          `${r.divergentes} compra(s) foram criadas com outra quantidade. Nada foi reescrito — confira em Compras.`,
        );
      }
      // Compra que a decoradora já tinha cadastrado à mão: NÃO geramos outra —
      // seria dinheiro comprado duas vezes — e dizemos exatamente qual.
      if (r.possiveisDuplicatas.length > 0) {
        toast.warning(
          `Já existe compra parecida para ${r.possiveisDuplicatas.join(", ")}. Nada foi criado — confira em Compras.`,
        );
      }
      if (r.ignoradas.length > 0) {
        toast.info(`Sem material do catálogo: ${r.ignoradas.join(", ")}.`);
      }
    } catch (e) {
      toast.error(
        e instanceof ConvexError ? (e.data as { message: string }).message : "Não foi possível gerar as compras.",
      );
    } finally {
      setGerando(false);
    }
  };

  if (event === undefined || ficha === undefined) {
    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }
  if (!event || !ficha) {
    return <div className="p-6 text-sm text-muted-foreground">Evento não encontrado.</div>;
  }

  const temFicha = ficha.consolidado.length > 0;

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <Link
        to={`/eventos/${id}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3"
      >
        <ArrowLeft className="size-4" /> {event.name}
      </Link>

      <div className="mb-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardList className="size-5 text-primary" /> Ficha Técnica
        </h1>
        <p className="text-sm text-muted-foreground">
          Do que este projeto é feito · {formatEventDateLong(event.date)}
        </p>
      </div>

      {!temFicha ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Layers />
            </EmptyMedia>
            <EmptyTitle>Nenhuma receita cadastrada ainda</EmptyTitle>
            <EmptyDescription>
              Abra um item do Caderno de Montagem abaixo e diga do que ele é feito. O ALTAR
              multiplica pela quantidade e soma o evento inteiro.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="bg-card border border-border rounded-xl px-3 py-2">
              <p className="text-xs text-muted-foreground">Materiais</p>
              <p className="text-xl font-bold">{ficha.resumo.materiais}</p>
              <p className="text-[10px] text-muted-foreground">
                {ficha.resumo.composicoes}{" "}
                {ficha.resumo.composicoes === 1 ? "composição" : "composições"}
              </p>
            </div>
            {/* "Pendências" vem de regra real (backend). Acervo não informado
                NÃO conta: é limitação nossa, não tarefa dela. */}
            <div className="bg-card border border-border rounded-xl px-3 py-2">
              <p className="text-xs text-muted-foreground">Precisam de atenção</p>
              <p
                className={cn(
                  "text-xl font-bold",
                  ficha.resumo.pendencias > 0 && "text-amber-700 dark:text-amber-400",
                )}
              >
                {ficha.resumo.pendencias}
              </p>
            </div>
            {/* A estimativa só aparece como TOTAL quando cobre tudo. Metade do
                preço com cara de total seria pior que preço nenhum. */}
            <div className="bg-card border border-border rounded-xl px-3 py-2">
              <p className="text-xs text-muted-foreground">
                {ficha.resumo.estimativaCompleta ? "Custo estimado" : "Estimativa parcial"}
              </p>
              <p className="text-xl font-bold">
                {ficha.resumo.comCusto > 0 ? MOEDA(ficha.resumo.custoEstimado) : "—"}
              </p>
              {!ficha.resumo.estimativaCompleta && ficha.resumo.comCusto > 0 && (
                <p className="text-[10px] text-muted-foreground">
                  {ficha.resumo.comCusto} de {ficha.resumo.materiais} com preço
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-2 mb-4">
            {(["consolidado", "ambientes"] as const).map((a) => (
              <button
                key={a}
                onClick={() => setAba(a)}
                className={cn(
                  "px-4 py-1.5 rounded-full text-sm font-medium transition-colors cursor-pointer",
                  aba === a
                    ? "bg-primary text-primary-foreground"
                    : "bg-card border border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {a === "consolidado" ? "Consolidado" : "Por ambiente"}
              </button>
            ))}
          </div>
        </>
      )}

      {temFicha && aba === "consolidado" && (
        <div className="bg-card border border-border rounded-xl overflow-hidden mb-4">
          <div className="px-4 py-2.5 border-b border-border flex items-center justify-between gap-2">
            <p className="text-sm font-semibold flex items-center gap-2">
              <Package className="size-4 text-primary" /> Preciso no evento inteiro
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void handlePdf()}
                className="cursor-pointer gap-1.5"
              >
                <FileDown className="size-3.5" /> PDF
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={gerando}
                onClick={() => void handleGerar()}
                className="cursor-pointer gap-1.5"
              >
                <ShoppingCart className="size-3.5" />
                {gerando ? "Enviando..." : "Gerar compras"}
              </Button>
            </div>
          </div>
          {ficha.consolidado.map((linha) => (
            <LinhaConsolidada key={linha.chave} linha={linha as never} eventId={eventId} />
          ))}
        </div>
      )}

      {(!temFicha || aba === "ambientes") && (
        <div className="space-y-3">
          {porAmbiente.map(([ambiente, itens]) => (
            <div key={ambiente} className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-2 border-b border-border">
                <p className="text-sm font-semibold">{labelDoAmbiente(ambiente).label}</p>
              </div>
              <div className="divide-y divide-border">
                {itens.map((item) => (
                  <div key={item._id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.quantity ?? 1} {item.quantity === 1 ? "unidade" : "unidades"}
                          {(item.receita?.length ?? 0) > 0 &&
                            ` · ${item.receita!.length} ${item.receita!.length === 1 ? "material" : "materiais"}`}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant={item.receita?.length ? "ghost" : "outline"}
                        onClick={() => setEditando(item._id)}
                        className="cursor-pointer flex-shrink-0"
                      >
                        {item.receita?.length ? "Editar receita" : "Criar receita"}
                      </Button>
                    </div>

                    {(item.receita?.length ?? 0) > 0 && (
                      <ul className="mt-2 space-y-0.5">
                        {item.receita!.map((c, i) => (
                          <li key={i} className="flex justify-between gap-2 text-xs text-muted-foreground">
                            <span className="truncate">{c.nome}</span>
                            {/* A multiplicação NÃO acontece aqui: vem do mesmo
                                helper que o backend e o PDF usam. Uma conta
                                repetida na tela é como 185 vira 180 no papel. */}
                            <span className="whitespace-nowrap">
                              {quantidadeTexto(c.quantidade, c.unidade)} ×{" "}
                              {unidadesDaComposicao({ quantidade: item.quantity })} ={" "}
                              <span className="text-foreground">
                                {quantidadeTexto(
                                  necessidadeDoComponente({ quantidade: item.quantity }, c),
                                  c.unidade,
                                )}
                              </span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {porAmbiente.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              Este evento ainda não tem itens no Caderno de Montagem.
            </p>
          )}
        </div>
      )}

      {editando && (
        <ReceitaDialog
          itemId={editando as Id<"assemblyItems">}
          open={!!editando}
          onClose={() => setEditando(null)}
        />
      )}
    </div>
  );
}
