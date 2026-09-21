import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { ConvexError } from "convex/values";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
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
import { FileSignature, Plus } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { formatEventDayOnly } from "@/lib/event-date.ts";
import { ROTULO_DO_STATUS } from "@/convex/lib/propostaComercial.ts";
import { NovaPropostaDialog } from "./_components/nova-proposta-dialog.tsx";

// ─────────────────────────────────────────────────────────────────────────────
// PROPOSTAS — a lista do que está na mão da cliente
//
// O ALTAR já tinha um documento de dinheiro, e ele era INTERNO: o Orçamento,
// com custo, lucro e margem. Esta é a outra metade — o documento que ela manda.
//
// A lista existe para responder uma pergunta só: o que está parado esperando
// resposta? Por isso o estado e a validade vêm antes do valor.
// ─────────────────────────────────────────────────────────────────────────────

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

const CORES: Record<string, string> = {
  rascunho: "bg-muted text-muted-foreground",
  enviada: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  aceita: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  recusada: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

export default function PropostasPage() {
  const resposta = useQuery(api.propostas.list);
  const propostas = resposta?.propostas;
  const criar = useMutation(api.propostas.create);
  const [criando, setCriando] = useState(false);

  const handleCriar = async (args: {
    leadId?: Id<"leads">;
    eventId?: Id<"events">;
  }) => {
    try {
      await criar(args);
      toast.success("Proposta criada. Agora escreva o escopo.");
      setCriando(false);
    } catch (e) {
      toast.error(
        e instanceof ConvexError
          ? (e.data as { message: string }).message
          : "Não foi possível criar a proposta.",
      );
    }
  };

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <FileSignature className="size-5 text-primary" /> Propostas
          </h1>
          <p className="text-sm text-muted-foreground">
            O documento que vai para a cliente — sem custo e sem margem
          </p>
        </div>
        <Button onClick={() => setCriando(true)} size="sm" className="cursor-pointer gap-1.5">
          <Plus className="size-4" /> Nova proposta
        </Button>
      </div>

      {propostas === undefined ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : propostas.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileSignature />
            </EmptyMedia>
            <EmptyTitle>Nenhuma proposta ainda</EmptyTitle>
            <EmptyDescription>
              A proposta nasce de uma oportunidade do Funil ou de um evento já criado. Ela leva
              escopo, investimento, condições e validade — e nunca custo ou margem, que
              continuam no Orçamento, que é seu.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => setCriando(true)} size="sm" className="cursor-pointer gap-1.5">
              <Plus className="size-4" /> Criar a primeira
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="space-y-2">
          {propostas.map((p) => (
            <Link
              key={p._id}
              to={`/propostas/${p._id}`}
              className="block rounded-xl border border-border bg-card px-4 py-3 hover:border-primary/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{p.titulo}</p>
                  <p className="truncate text-xs text-muted-foreground">{p.clienteNome}</p>
                </div>
                <div className="flex flex-shrink-0 flex-col items-end gap-1">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-medium",
                      CORES[p.status] ?? "bg-muted text-muted-foreground",
                    )}
                  >
                    {ROTULO_DO_STATUS[p.status]}
                  </span>
                  <span className="text-sm font-semibold">{brl.format(p.investimento)}</span>
                </div>
              </div>

              <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                {/* Vencida é DERIVADO da validade — não é um estado gravado que
                    envelhece sozinho no banco. */}
                {p.vencida && (
                  <span className="text-amber-700 dark:text-amber-400">
                    Venceu em {formatEventDayOnly(p.validadeAte!)}
                  </span>
                )}
                {!p.vencida && p.validadeAte && (
                  <span>Válida até {formatEventDayOnly(p.validadeAte)}</span>
                )}
                {/* O aviso que impede discutir um número que a cliente não tem. */}
                {p.divergeDoEnviado && (
                  <span className="text-amber-700 dark:text-amber-400">
                    Editada depois de enviada
                  </span>
                )}
              </div>
            </Link>
          ))}
          {/* A tela nunca afirma o que não sabe: acima do teto ela diz que há
              mais, em vez de deixar entender que a lista é o total. */}
          {resposta?.temMais && (
            <p className="pt-1 text-center text-xs text-muted-foreground">
              {propostas.length} propostas carregadas — há mais. As mais recentes vêm primeiro.
            </p>
          )}
        </div>
      )}

      {criando && (
        <NovaPropostaDialog onClose={() => setCriando(false)} onCriar={handleCriar} />
      )}
    </div>
  );
}
