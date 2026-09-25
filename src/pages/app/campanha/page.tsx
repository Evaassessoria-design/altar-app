import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { LIVE_ALTAR } from "@/convex/lib/campanha";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { ComercialHoje } from "./_components/comercial-hoje.tsx";
import { FunilDaCampanha } from "./_components/funil-da-campanha.tsx";
import { PessoasDaCampanha } from "./_components/pessoas-da-campanha.tsx";
import { FilaDeRevisao } from "./_components/fila-de-revisao.tsx";
import { Megaphone } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// A CAMPANHA
//
// ── POR QUE UMA TELA PRÓPRIA ────────────────────────────────────────────────
// O painel administrativo responde "como vai o SaaS": contas, receita,
// assinaturas. Operar uma campanha é outro trabalho, feito em outro momento e
// com outra pergunta na cabeça — "com quem eu falo agora?".
//
// Misturar os dois faria a tela da receita abrir com trezentos nomes no meio,
// e a operação da campanha ficar escondida atrás de uma aba.
//
// ── A ORDEM DOS BLOCOS É A ORDEM DO TRABALHO ────────────────────────────────
//   1. o que fazer hoje        ← abre aqui, e às vezes ela para aqui
//   2. as mensagens a revisar  ← o trabalho de fato
//   3. o funil                 ← "como vai indo?"
//   4. as pessoas              ← "cadê a fulana?"
//
// Funil em primeiro lugar seria bonito e inútil: número não diz com quem
// falar.
//
// ── ESCONDER NÃO É SEGURANÇA ────────────────────────────────────────────────
// O `navigate` abaixo é desenho. Quem trava é `requireAdmin` em cada função de
// convex/admin.ts, convex/campanhaRascunhos.ts e convex/comercialBriefing.ts.
// ─────────────────────────────────────────────────────────────────────────────

export default function CampanhaPage() {
  const navigate = useNavigate();
  const isAdmin = useQuery(api.admin.isAdmin);
  const [etapa, setEtapa] = useState("");

  useEffect(() => {
    if (isAdmin === false) navigate("/dashboard");
  }, [isAdmin, navigate]);

  if (isAdmin === undefined || isAdmin === false) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-4 p-4 md:p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-4 md:p-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Megaphone className="size-6 text-primary" /> Campanha
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {LIVE_ALTAR.nome} · {LIVE_ALTAR.hora} (horário de Brasília)
        </p>
      </header>

      <ComercialHoje campanha={LIVE_ALTAR.slug} />
      <FilaDeRevisao campanha={LIVE_ALTAR.slug} />
      <FunilDaCampanha
        campanha={LIVE_ALTAR.slug}
        etapaAtiva={etapa}
        aoEscolherEtapa={setEtapa}
      />
      <PessoasDaCampanha
        campanha={LIVE_ALTAR.slug}
        etapa={etapa}
        aoLimparEtapa={() => setEtapa("")}
      />
    </div>
  );
}
