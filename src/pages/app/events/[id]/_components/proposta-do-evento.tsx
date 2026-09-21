import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { toast } from "sonner";
import { ChevronRight, FileSignature } from "lucide-react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { ROTULO_DO_STATUS } from "@/convex/lib/propostaComercial.ts";

// ─────────────────────────────────────────────────────────────────────────────
// A PROPOSTA, DENTRO DO EVENTO
//
// ── POR QUE ELA FICA AO LADO DO ORÇAMENTO ───────────────────────────────────
// São os dois documentos de dinheiro do evento, e a linha entre eles é a coisa
// mais importante desta tela: o Orçamento é INTERNO (custo, lucro, margem) e a
// Proposta é da CLIENTE (escopo e investimento).
//
// Ficarem lado a lado com o subtítulo dizendo para quem cada um é vale mais do
// que qualquer aviso: a confusão entre os dois é o erro caro, e ele acontece
// na hora de anexar o arquivo no WhatsApp.
//
// ── O QUE ESTA LINHA NÃO FAZ ────────────────────────────────────────────────
// Não soma, não compara com o orçamento e não afirma margem. O investimento da
// proposta e o resultado do orçamento são números de origens diferentes, e
// aproximá-los numa linha só convidaria a lê-los como se fechassem.
// ─────────────────────────────────────────────────────────────────────────────

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function PropostaDoEvento({ eventId }: { eventId: Id<"events"> }) {
  const navigate = useNavigate();
  const propostas = useQuery(api.propostas.doEvento, { eventId });
  const criar = useMutation(api.propostas.create);
  const [criando, setCriando] = useState(false);

  // Enquanto carrega, a linha existe sem afirmar nada sobre quantas são.
  const carregando = propostas === undefined;
  const ultima = propostas?.[0];

  const descricao = carregando
    ? "O documento da cliente — escopo e investimento"
    : ultima
      ? `${brl.format(ultima.investimento)} · ${
          ultima.vencida ? "venceu" : ROTULO_DO_STATUS[ultima.status]
        }${propostas.length > 1 ? ` · ${propostas.length} propostas` : ""}`
      : "O documento da cliente — escopo e investimento, sem custo nem margem";

  const conteudo = (
    <div className="flex items-center gap-3">
      <FileSignature className="size-5 text-primary" />
      <div>
        <p className="text-sm font-medium">Proposta comercial</p>
        <p className="text-xs text-muted-foreground">{descricao}</p>
      </div>
    </div>
  );

  if (ultima) {
    return (
      <Link
        to={`/propostas/${ultima._id}`}
        className="flex cursor-pointer items-center justify-between px-5 py-3.5 transition-colors hover:bg-accent/50"
      >
        {conteudo}
        <ChevronRight className="size-4 text-muted-foreground" />
      </Link>
    );
  }

  return (
    <button
      type="button"
      disabled={carregando || criando}
      onClick={() => {
        setCriando(true);
        // Nasce COM os dados do evento: cliente, tipo, data e local são
        // copiados. Redigitar o que já está na tela é o trabalho que faz a
        // decoradora deixar a proposta para depois.
        void criar({ eventId })
          .then((id) => navigate(`/propostas/${id}`))
          .catch((e) =>
            toast.error(
              e instanceof ConvexError
                ? (e.data as { message: string }).message
                : "Não foi possível criar a proposta.",
            ),
          )
          .finally(() => setCriando(false));
      }}
      className="flex w-full cursor-pointer items-center justify-between px-5 py-3.5 text-left transition-colors hover:bg-accent/50 disabled:opacity-60"
    >
      {conteudo}
      <span className="text-xs text-primary">{criando ? "Criando…" : "Criar"}</span>
    </button>
  );
}
