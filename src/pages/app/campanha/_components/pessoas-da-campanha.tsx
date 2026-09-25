import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel";
import { ESTAGIOS, type EstagioDoInteressado } from "@/convex/lib/campanha";
import { Input } from "@/components/ui/input.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { cn } from "@/lib/utils.ts";
import { Mail, PenLine, Phone, Search, UserX } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// AS PESSOAS DA CAMPANHA
//
// ── POR QUE NÃO É UMA TABELA ────────────────────────────────────────────────
// Uma tabela com nome, empresa, telefone, e-mail, etapa, origem e data tem
// sete colunas. Em 320px isso é rolagem horizontal, e rolagem horizontal numa
// lista é a forma mais rápida de ninguém usar a tela no celular — que é onde
// esta campanha vai ser operada, entre um compromisso e outro.
//
// Cada pessoa é um CARTÃO: nome e empresa em cima, contato e etapa embaixo. O
// mesmo desenho em 320 e em 1440; no grande ele só ganha colunas.
//
// ── A BUSCA PROCURA PELO QUE SE LEMBRA ──────────────────────────────────────
// Nome, empresa, telefone ou e-mail. São quatro memórias diferentes, e uma
// busca que cobrisse só o nome mandaria a pessoa rolar duzentas linhas.
// ─────────────────────────────────────────────────────────────────────────────

/** Abaixo disto a busca não acontece: uma letra casa com metade da base. */
const MINIMO_PARA_BUSCAR = 2;

export function PessoasDaCampanha({
  campanha,
  etapa,
  aoLimparEtapa,
}: {
  campanha: string;
  etapa: string;
  aoLimparEtapa: () => void;
}) {
  const [termo, setTermo] = useState("");
  const buscando = termo.trim().length >= MINIMO_PARA_BUSCAR;

  // Enquanto há busca, a listagem não roda: são duas respostas para a mesma
  // região da tela, e as duas carregando ao mesmo tempo fazem a lista piscar
  // entre dois conjuntos diferentes.
  const lista = useQuery(
    api.admin.listLandingLeads,
    buscando ? "skip" : { campanha, ...(etapa ? { status: etapa as EstagioDoInteressado } : {}) },
  );
  const busca = useQuery(
    api.admin.buscarInteressados,
    buscando ? { termo: termo.trim(), campanha } : "skip",
  );

  const setStatus = useMutation(api.admin.setLandingLeadStatus);
  const preparar = useMutation(api.campanhaRascunhos.preparar);

  const pessoas = buscando ? busca?.resultados : lista?.leads;
  const carregando = pessoas === undefined;

  async function mover(leadId: Id<"landingLeads">, status: EstagioDoInteressado) {
    try {
      await setStatus({ leadId, status });
    } catch {
      toast.error("Não deu para mudar a etapa");
    }
  }

  async function escrever(leadId: Id<"landingLeads">) {
    try {
      await preparar({ leadId });
      toast.success("Mensagem escrita", {
        description: "Ela está na fila de revisão. O ALTAR não envia nada.",
      });
    } catch (e) {
      toast.error(
        e instanceof ConvexError
          ? String((e.data as { message?: string })?.message)
          : "Não deu para escrever",
      );
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-5">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Nome, empresa, telefone ou e-mail"
          aria-label="Procurar pessoa na campanha"
          className="pl-8"
        />
      </div>

      {etapa && !buscando && (
        <button
          onClick={aoLimparEtapa}
          className="cursor-pointer text-xs text-primary hover:underline"
        >
          Filtrando por {ESTAGIOS.find((e) => e.id === etapa)?.rotulo} — mostrar todos
        </button>
      )}

      {termo.trim().length > 0 && !buscando && (
        <p className="text-xs text-muted-foreground">
          Escreva pelo menos {MINIMO_PARA_BUSCAR} letras.
        </p>
      )}

      {carregando ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : pessoas.length === 0 ? (
        // ── VAZIO NÃO PODE SER UM BECO ──────────────────────────────────
        // "Ninguém encontrado" sem saída deixa a pessoa numa tela que ela não
        // sabe desfazer — e a campanha inteira continua ali atrás, invisível.
        // Cada motivo de vazio traz o caminho de volta correspondente.
        <div className="py-6 text-center">
          <p className="text-sm text-muted-foreground">
            {buscando
              ? `Ninguém encontrado para "${termo.trim()}".`
              : etapa
                ? `Ninguém em "${ESTAGIOS.find((e) => e.id === etapa)?.rotulo}".`
                : "Ninguém nesta campanha ainda."}
          </p>
          {buscando && (
            <button
              onClick={() => setTermo("")}
              className="mt-1 cursor-pointer text-xs text-primary hover:underline"
            >
              Limpar busca e ver todos
            </button>
          )}
          {!buscando && etapa && (
            <button
              onClick={aoLimparEtapa}
              className="mt-1 cursor-pointer text-xs text-primary hover:underline"
            >
              Ver todos
            </button>
          )}
          {!buscando && !etapa && (
            <p className="mt-1 text-xs text-muted-foreground">
              Importe uma lista pelo Painel Admin, ou espere quem chegar pela landing.
            </p>
          )}
        </div>
      ) : (
        <ul className="space-y-2">
          {pessoas.map((p) => (
            <li
              key={p._id}
              className="rounded-lg border border-border/60 p-3 sm:flex sm:items-center sm:gap-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium leading-tight">{p.name}</p>
                {p.empresa && (
                  <p className="truncate text-xs text-muted-foreground">{p.empresa}</p>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  {p.whatsapp ? (
                    <span className="flex items-center gap-1">
                      <Phone className="size-3" /> {p.whatsapp}
                    </span>
                  ) : p.email ? (
                    <span className="flex min-w-0 items-center gap-1">
                      <Mail className="size-3 flex-shrink-0" />
                      <span className="truncate">{p.email}</span>
                    </span>
                  ) : (
                    // Esconder quem não é alcançável faria a lista prometer
                    // que todo mundo é.
                    <span className="flex items-center gap-1 text-amber-600 dark:text-amber-500">
                      <UserX className="size-3" /> sem contato
                    </span>
                  )}
                  {p.convidadoEm !== undefined && (
                    <span>convidada {diasAtras(p.convidadoEm)}</span>
                  )}
                </div>
              </div>

              <div className="mt-2 flex items-center gap-2 sm:mt-0">
                <select
                  value={p.status}
                  onChange={(e) => void mover(p._id, e.target.value as EstagioDoInteressado)}
                  aria-label={`Etapa de ${p.name}`}
                  className="h-8 min-w-0 flex-1 cursor-pointer rounded-md border border-input bg-background px-2 text-xs sm:flex-none"
                >
                  {ESTAGIOS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.rotulo}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void escrever(p._id)}
                  aria-label={`Escrever mensagem para ${p.name}`}
                  className="h-8 w-8 flex-shrink-0 cursor-pointer p-0"
                >
                  <PenLine className="size-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!buscando && lista?.temMais && (
        <p className={cn("text-center text-xs text-amber-600 dark:text-amber-500")}>
          Mostrando as {pessoas?.length} mais recentes — há mais. Use a busca para achar alguém
          específico.
        </p>
      )}
    </div>
  );
}

/** "hoje", "ontem", "há 5 dias" — nunca uma data crua no meio de uma frase. */
function diasAtras(quando: number): string {
  const dias = Math.floor((Date.now() - quando) / 86_400_000);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  return `há ${dias} dias`;
}
