import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Clock, FileDown, Flower2, Image as ImageIcon, Layers, Pencil } from "lucide-react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty.tsx";
import { MaterialDialog, type MaterialEditavel } from "@/components/catalogo/material-dialog.tsx";
import { formatEventDateLong } from "@/lib/event-date.ts";
import { agruparPorAmbiente } from "@/lib/decoration-project.ts";
import { quantidadeTexto } from "@/convex/lib/fichaTecnica.ts";
import {
  ROTULO_DA_INSTRUCAO,
  rotuloDaOrigem,
  textoDaQuantidade,
} from "@/convex/lib/producaoFloral.ts";
import { InstrucoesDialog } from "./_components/instrucoes-dialog.tsx";
import { LinhasFloraisDialog } from "./_components/linhas-florais-dialog.tsx";

// ─────────────────────────────────────────────────────────────────────────────
// PRODUÇÃO FLORAL — a ficha que a decoradora manda para o florista.
//
// ── O QUE ELA NÃO REPETE ────────────────────────────────────────────────────
// Os arranjos já estão cadastrados no Questionário (`assemblyItems`) e a
// receita deles na Ficha Técnica. Esta tela não pede nenhum dos dois de novo:
// ela lê os mesmos dados e acrescenta o que só o florista precisa — cor,
// natural ou permanente, por arranjo ou no total, formato, altura, montagem,
// substituição, cuidado, horário.
//
// ── AS DUAS FOTOS, SEPARADAS ────────────────────────────────────────────────
// "Foto da flor" vem do catálogo de materiais e vale para todos os eventos da
// conta — um envio, nenhuma duplicata. "Referência do arranjo" é a foto do
// item, da Galeria do evento. A tela nomeia as duas em voz alta porque
// confundi-las é mandar copiar a cor errada.
//
// ── NADA AQUI COMPRA, RESERVA OU MOVIMENTA ──────────────────────────────────
// O resumo de materiais é papel. Compra continua em Compras, acervo em Acervo.
// ─────────────────────────────────────────────────────────────────────────────

export default function ProducaoFloralPage() {
  const { id } = useParams<{ id: string }>();
  const eventId = id as Id<"events">;
  const event = useQuery(api.events.get, { id: eventId });
  const ficha = useQuery(api.producaoFloral.fichaDoFlorista, {
    eventId,
    incluirFotos: true,
  });
  // A receita crua, só para os diálogos de edição. A ficha do florista é
  // montada campo a campo e não carrega custo nenhum — ver producaoFloral.ts.
  const itens = useQuery(api.assemblyItems.listByEvent, { eventId });
  const materiais = useQuery(api.materials.list, {});
  const empresa = useQuery(api.users.getCurrentUser);

  const [instrucoesDe, setInstrucoesDe] = useState<string | null>(null);
  const [receitaDe, setReceitaDe] = useState<string | null>(null);
  const [materialAberto, setMaterialAberto] = useState<MaterialEditavel | null>(null);
  const [comFotos, setComFotos] = useState(true);
  const [comReferencias, setComReferencias] = useState(false);
  const [gerando, setGerando] = useState(false);

  const porAmbiente = useMemo(
    () => agruparPorAmbiente(ficha?.composicoes ?? []),
    [ficha],
  );

  const gerarPdf = async () => {
    if (!ficha || !event) return;
    setGerando(true);
    try {
      const { generateFichaFloralPDF } = await import("@/lib/generate-ficha-floral-pdf.ts");
      await generateFichaFloralPDF({
        evento: ficha.evento,
        composicoes: ficha.composicoes,
        avisos: ficha.avisos,
        checklist: ficha.checklist,
        resumo: ficha.resumo,
        flores: ficha.flores,
        geradoEm: ficha.geradoEm,
        incluirFotosDasFlores: comFotos,
        incluirReferenciasDosArranjos: comReferencias,
        empresa: empresa ?? null,
      });
      toast.success("Ficha do florista gerada.");
    } catch {
      toast.error("Não foi possível gerar a ficha.");
    } finally {
      setGerando(false);
    }
  };

  if (event === undefined || ficha === undefined || itens === undefined) {
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

  const itemPorId = new Map(itens.map((i) => [i._id as string, i]));
  const semComposicoes = ficha.composicoes.length === 0;

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
          <Flower2 className="size-5 text-primary" /> Produção floral
        </h1>
        <p className="text-sm text-muted-foreground">
          A ficha que vai para o florista · {formatEventDateLong(event.date)}
        </p>
      </div>

      {semComposicoes ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Layers />
            </EmptyMedia>
            <EmptyTitle>Nenhuma composição com receita</EmptyTitle>
            <EmptyDescription>
              A ficha do florista parte das receitas da Ficha Técnica — quantas rosas
              em cada arranjo. Cadastre lá e volte aqui para dizer cor, altura,
              montagem e horário.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild size="sm" className="cursor-pointer">
              <Link to={`/eventos/${id}/ficha-tecnica`}>
                Abrir a Ficha Técnica <ArrowRight className="size-4" />
              </Link>
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <>
          {/* ── Gerar o papel ───────────────────────────────────────────── */}
          <div className="bg-card border border-border rounded-xl p-3 mb-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="font-medium text-sm">Ficha do florista</p>
                <p className="text-xs text-muted-foreground">
                  Sem valores, sem compras, sem informação interna.
                </p>
              </div>
              <Button
                size="sm"
                onClick={gerarPdf}
                disabled={gerando}
                className="cursor-pointer"
              >
                <FileDown className="size-4" /> {gerando ? "Gerando…" : "Gerar PDF"}
              </Button>
            </div>
            <div className="mt-2 space-y-1">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={comFotos}
                  onChange={(e) => setComFotos(e.target.checked)}
                />
                Incluir fotos das flores
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={comReferencias}
                  onChange={(e) => setComReferencias(e.target.checked)}
                />
                Incluir referências dos arranjos
              </label>
            </div>
            {ficha.semReceita > 0 && (
              <p className="text-[11px] text-muted-foreground mt-2">
                {ficha.semReceita}{" "}
                {ficha.semReceita === 1 ? "item do projeto ainda não tem" : "itens do projeto ainda não têm"}{" "}
                receita e ficaram de fora — a ficha não inventa o que não foi
                cadastrado.
              </p>
            )}
          </div>

          {/* ── Cuidados e horários ─────────────────────────────────────── */}
          {ficha.avisos.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-xl p-3 mb-4">
              <p className="font-medium text-sm flex items-center gap-1.5 mb-1">
                <Clock className="size-4" /> Cuidados e horários
              </p>
              <ul className="space-y-1.5">
                {ficha.avisos.map((a) => (
                  <li key={a.composicaoId} className="text-xs">
                    <span className="font-medium">{a.composicao}</span>{" "}
                    <span className="text-muted-foreground">· {a.ambiente}</span>
                    {a.horario && <p className="text-muted-foreground">Horário: {a.horario}</p>}
                    {a.cuidados && <p className="text-muted-foreground">Cuidados: {a.cuidados}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ── Ambientes e composições ─────────────────────────────────── */}
          {porAmbiente.map((grupo) => (
            <section key={grupo.key} className="mb-5">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {grupo.label}
              </h2>
              <div className="space-y-3">
                {grupo.itens.map((c) => {
                  const unidades = c.quantidade ?? 1;
                  const instrucoes = Object.entries(c.instrucoes).filter(([, v]) => v);
                  return (
                    <div key={c._id} className="bg-card border border-border rounded-xl p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-sm">{c.nome}</p>
                          <p className="text-xs text-muted-foreground">
                            {unidades} {unidades === 1 ? "arranjo" : "arranjos"}
                          </p>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            className="cursor-pointer"
                            onClick={() => setReceitaDe(c._id)}
                          >
                            Receita
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="cursor-pointer"
                            onClick={() => setInstrucoesDe(c._id)}
                          >
                            <Pencil className="size-3.5" /> Instruções
                          </Button>
                        </div>
                      </div>

                      {c.materiais.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {c.materiais.map((m, i) => (
                            <li key={`${m.nome}-${i}`} className="text-xs flex justify-between gap-3">
                              <span className="min-w-0">
                                {[m.nome, m.variedade, m.cor].filter(Boolean).join(" · ")}
                                {rotuloDaOrigem(m.origem) && (
                                  <span className="text-muted-foreground">
                                    {" "}({rotuloDaOrigem(m.origem)?.toLowerCase()})
                                  </span>
                                )}
                              </span>
                              <span className="font-medium flex-shrink-0">
                                {textoDaQuantidade(m.quantidade)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}

                      {c.orientacoes.length > 0 && (
                        <div className="mt-2">
                          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                            Orientações (sem quantidade)
                          </p>
                          <ul className="mt-0.5 space-y-0.5">
                            {c.orientacoes.map((o, i) => (
                              <li key={`${o.nome}-${i}`} className="text-xs text-muted-foreground">
                                · {[o.nome, o.cor, o.notes].filter(Boolean).join(" · ")}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {instrucoes.length > 0 ? (
                        <dl className="mt-2 space-y-0.5">
                          {instrucoes.map(([chave, valor]) => (
                            <div key={chave} className="text-xs">
                              <dt className="inline font-medium">
                                {ROTULO_DA_INSTRUCAO[chave as keyof typeof ROTULO_DA_INSTRUCAO]}:{" "}
                              </dt>
                              <dd className="inline text-muted-foreground">{valor}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-2">
                          Sem instruções de montagem ainda.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          {/* ── Fotos das flores ────────────────────────────────────────── */}
          <section className="mb-5">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-1">
              Fotos das flores
            </h2>
            <p className="text-xs text-muted-foreground mb-2">
              Uma foto por flor, do catálogo: vale para todos os eventos desta conta
              e não é enviada de novo a cada receita. Não é a referência do arranjo.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {ficha.flores.map((flor) => {
                const material = materiais?.find(
                  (m) => m.nome.trim().toLowerCase() === flor.nome.trim().toLowerCase(),
                );
                return (
                  <div
                    key={flor.nome}
                    className="border border-border rounded-xl p-2 flex flex-col gap-1.5"
                  >
                    {flor.fotoUrl ? (
                      <img
                        src={flor.fotoUrl}
                        alt={flor.nome}
                        className="w-full h-20 object-cover rounded-lg"
                      />
                    ) : (
                      <div className="w-full h-20 rounded-lg bg-muted flex items-center justify-center">
                        <ImageIcon className="size-5 text-muted-foreground" />
                      </div>
                    )}
                    <p className="text-xs font-medium leading-tight">{flor.nome}</p>
                    <p className="text-[11px] text-muted-foreground leading-tight">
                      {[
                        flor.variedade,
                        flor.cor ? `cor: ${flor.cor}` : null,
                        rotuloDaOrigem(flor.origem ?? undefined),
                        quantidadeTexto(flor.total, flor.unidade),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {flor.fotoIlustrativa && (
                      <p className="text-[10px] text-amber-700 dark:text-amber-400 leading-tight">
                        Foto ilustrativa: pode não ser a cor pedida.
                      </p>
                    )}
                    {material && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="cursor-pointer h-7 text-xs"
                        onClick={() =>
                          setMaterialAberto({
                            _id: material._id,
                            nome: material.nome,
                            unidade: material.unidade,
                            categoria: material.categoria,
                            tipo: material.tipo,
                            custoReferencia: material.custoReferencia,
                            margemPercentual: material.margemPercentual,
                            variedade: material.variedade,
                            archived: material.archived,
                            fotoUrl: material.fotoUrl,
                          })
                        }
                      >
                        {flor.fotoUrl ? "Trocar foto" : "Adicionar foto"}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── Resumo de materiais ─────────────────────────────────────── */}
          <section className="mb-5">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-1">
              Resumo de materiais
            </h2>
            <p className="text-xs text-muted-foreground mb-2">
              Soma do que esta ficha pede. Unidades diferentes não se somam. Nada aqui
              cria compra, mexe em estoque ou reserva acervo.
            </p>
            <ul className="bg-card border border-border rounded-xl divide-y divide-border">
              {ficha.resumo.map((linha) => (
                <li key={linha.chave} className="px-3 py-2 flex justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    {linha.nome}
                    {(linha.cor || linha.origem) && (
                      <span className="text-muted-foreground text-xs">
                        {" "}
                        · {[linha.cor, rotuloDaOrigem(linha.origem ?? undefined)?.toLowerCase()]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    )}
                  </span>
                  <span className="font-medium flex-shrink-0">
                    {quantidadeTexto(linha.total, linha.unidade)}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {/* ── Checklist ───────────────────────────────────────────────── */}
          <section className="mb-8">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Checklist de produção
            </h2>
            <ul className="bg-card border border-border rounded-xl divide-y divide-border">
              {ficha.checklist.map((item) => (
                <li key={item.composicaoId} className="px-3 py-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="min-w-0">{item.composicao}</span>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {item.unidades} {item.unidades === 1 ? "arranjo" : "arranjos"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {item.ambiente} · {item.materiais}{" "}
                    {item.materiais === 1 ? "material" : "materiais"}
                    {item.comAviso ? " · tem cuidado/horário" : ""}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <InstrucoesDialog
        itemId={instrucoesDe as Id<"assemblyItems"> | null}
        nome={ficha.composicoes.find((c) => c._id === instrucoesDe)?.nome ?? ""}
        atual={ficha.composicoes.find((c) => c._id === instrucoesDe)?.instrucoes ?? {}}
        onClose={() => setInstrucoesDe(null)}
      />
      <LinhasFloraisDialog
        item={receitaDe ? (itemPorId.get(receitaDe) ?? null) : null}
        onClose={() => setReceitaDe(null)}
      />
      <MaterialDialog material={materialAberto} onClose={() => setMaterialAberto(null)} />
    </div>
  );
}
