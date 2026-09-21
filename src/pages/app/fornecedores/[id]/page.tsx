import { useQuery } from "convex/react";
import { Link, useParams } from "react-router-dom";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  Globe,
  AtSign,
  Mail,
  Phone,
  ShoppingCart,
} from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { formatEventDayOnly } from "@/lib/event-date.ts";
import { PURCHASE_STATUS_LABEL } from "@/convex/lib/purchaseStatus.ts";
import { rotuloDaSituacao } from "@/lib/supplier-status.ts";

// ─────────────────────────────────────────────────────────────────────────────
// O FORNECEDOR POR INTEIRO
//
// ── A PERGUNTA QUE ISTO RESPONDE ────────────────────────────────────────────
// Ela vai ligar para a floricultura. Antes de ligar quer saber: já trabalhei
// com eles em quantos casamentos? quanto já comprei? ficou algo em aberto?
//
// A resposta existia espalhada — um `get` cru que nunca teve tela (e que por
// isso acabou removido), `listEventsForSupplier` mostrando no máximo três
// nomes numa linha do catálogo, e as compras só alcançáveis abrindo evento
// por evento.
//
// ── O QUE ESTA PÁGINA NÃO FAZ ───────────────────────────────────────────────
// Não dá nota, não classifica, não ranqueia e não recomenda. Nada disso sai de
// dado que o ALTAR tenha: seriam números inventados sobre gente real, e uma
// "nota 3 estrelas" gerada por contagem de compras não sobrevive à primeira
// conversa com o fornecedor.
//
// Também não edita: corrigir o cadastro continua sendo no catálogo, de onde
// ela veio. Uma segunda tela de edição divergiria da primeira.
// ─────────────────────────────────────────────────────────────────────────────

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function Contato({
  icone: Icone,
  valor,
  href,
  rotulo,
}: {
  icone: React.ElementType;
  valor?: string;
  href?: string;
  rotulo: string;
}) {
  if (!valor?.trim()) return null;
  const conteudo = (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <Icone className="size-3.5 flex-shrink-0 text-muted-foreground" />
      {valor}
    </span>
  );
  // Alvo de toque no celular: esta tela se abre com o polegar, antes de ligar.
  return href ? (
    <a
      href={href}
      aria-label={`${rotulo}: ${valor}`}
      className="inline-flex min-h-9 items-center text-primary hover:underline sm:min-h-0"
    >
      {conteudo}
    </a>
  ) : (
    conteudo
  );
}

export default function FornecedorPage() {
  const { id } = useParams<{ id: string }>();
  const supplierId = id as Id<"suppliers">;
  const panorama = useQuery(api.supplierCatalog.panorama, { supplierId });

  if (panorama === undefined) {
    return (
      <div className="mx-auto max-w-2xl space-y-3 p-4 md:p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  // `null` cobre inexistente E de outra empresa, sem distinguir os dois: dizer
  // "sem permissão" já confirmaria que o fornecedor existe.
  if (panorama === null) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <Link
          to="/fornecedores"
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Fornecedores
        </Link>
        <p className="text-sm text-muted-foreground">Fornecedor não encontrado.</p>
      </div>
    );
  }

  const { supplier, eventos, compras } = panorama;
  const telefoneDigits = supplier.phone?.replace(/[^\d+]/g, "");

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-6">
      <Link
        to="/fornecedores"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Fornecedores
      </Link>

      {/* ── QUEM É, E COMO FALO COM ELE ─────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start gap-3">
          <div className="flex size-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Building2 className="size-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold">{supplier.companyName}</h1>
            <p className="text-sm text-muted-foreground">
              {supplier.category}
              {supplier.contactName && ` · ${supplier.contactName}`}
              {supplier.archivedAt !== undefined && " · arquivado"}
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          <Contato
            icone={Phone}
            valor={supplier.phone}
            href={telefoneDigits ? `tel:${telefoneDigits}` : undefined}
            rotulo="Telefone"
          />
          <Contato
            icone={Mail}
            valor={supplier.email}
            href={supplier.email ? `mailto:${supplier.email}` : undefined}
            rotulo="E-mail"
          />
          <Contato icone={AtSign} valor={supplier.instagram} rotulo="Instagram" />
          <Contato
            icone={Globe}
            valor={supplier.website}
            href={supplier.website}
            rotulo="Site"
          />
        </div>

        {supplier.notes?.trim() && (
          <p className="mt-3 whitespace-pre-wrap border-t border-border pt-3 text-sm text-muted-foreground">
            {supplier.notes}
          </p>
        )}
      </div>

      {/* ── O QUE JÁ COMPREI ────────────────────────────────────────────── */}
      <div className="mt-4 rounded-xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <ShoppingCart className="size-4 text-primary" /> Compras
        </h2>

        {compras.total === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Nenhuma compra registrada com este fornecedor ainda.
          </p>
        ) : (
          <>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
              <span className="text-lg font-semibold">{brl.format(compras.valor)}</span>
              <span className="text-muted-foreground">
                em {compras.total} {compras.total === 1 ? "compra" : "compras"}
              </span>
              {compras.pendentes > 0 && (
                <span className="text-amber-700 dark:text-amber-400">
                  {compras.pendentes} em aberto
                </span>
              )}
            </div>

            {/* O total não é "o que saiu do caixa", e a tela precisa dizer o
                que ele deixa de fora — senão engana com cara de exatidão. */}
            <p className="mt-1 text-xs text-muted-foreground">
              Soma do que foi combinado (preço × quantidade), sem as canceladas.
              {compras.semPreco > 0 &&
                ` ${compras.semPreco} ${compras.semPreco === 1 ? "compra ainda não tem" : "compras ainda não têm"} preço e ${compras.semPreco === 1 ? "não entra" : "não entram"} nesta conta.`}{" "}
              O que de fato saiu do caixa está no Financeiro.
            </p>

            <ul className="mt-3 space-y-1 border-t border-border pt-3">
              {compras.recentes.map((c) => (
                <li key={c._id} className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate">
                    <span className="text-foreground">{c.nome}</span>
                    {c.quantidade !== undefined && ` · ${c.quantidade}${c.unidade ? ` ${c.unidade}` : ""}`}
                    {c.evento && <span className="text-muted-foreground"> · {c.evento}</span>}
                  </span>
                  <span className="flex-shrink-0 whitespace-nowrap text-muted-foreground">
                    {c.valor > 0 ? brl.format(c.valor) : "sem preço"} ·{" "}
                    {PURCHASE_STATUS_LABEL[c.situacao]}
                  </span>
                </li>
              ))}
            </ul>

            {compras.temMais && (
              <p className="mt-2 text-xs text-muted-foreground">
                A conta parou no limite da varredura — há mais compras do que as somadas aqui.
              </p>
            )}

            <Button asChild size="sm" variant="outline" className="mt-3 cursor-pointer">
              <Link to="/compras">Abrir Compras</Link>
            </Button>
          </>
        )}
      </div>

      {/* ── ONDE JÁ USEI, E O QUE FICOU EM ABERTO ───────────────────────── */}
      <div className="mt-4 rounded-xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <CalendarDays className="size-4 text-primary" /> Eventos
        </h2>

        {eventos.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Ainda não usado em nenhum evento.
          </p>
        ) : (
          <div className="mt-2 divide-y divide-border">
            {eventos.map((e) => (
              <Link
                key={e.eventId}
                to={`/eventos/${e.eventId}/fornecedores`}
                className="flex items-start justify-between gap-3 py-2 hover:bg-accent/40"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{e.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatEventDayOnly(e.data)}
                    {e.status && ` · ${rotuloDaSituacao(e.status)}`}
                  </p>
                  {/* A próxima ação é a única coisa aqui que PEDE algo dela. */}
                  {e.proximaAcao && (
                    <p
                      className={cn(
                        "mt-0.5 text-xs text-amber-700 dark:text-amber-400",
                      )}
                    >
                      {e.proximaAcao}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
