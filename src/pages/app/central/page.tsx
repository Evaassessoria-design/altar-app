import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { cn } from "@/lib/utils.ts";
import { Spinner } from "@/components/ui/spinner.tsx";
import { ErrorBoundary } from "@/components/error-boundary.tsx";
import { Inbox, ListTodo, Megaphone, MessageSquare, ShieldCheck } from "lucide-react";
import { EstadoDoEnvio, Indicadores } from "./_components/painel-da-central.tsx";
import { CaixaDeEntrada } from "./_components/caixa-de-entrada.tsx";
import { FilaDeAprovacao } from "./_components/fila-de-aprovacao.tsx";
import { Tarefas } from "./_components/tarefas.tsx";
import { Ouvidoria } from "./_components/ouvidoria.tsx";

// ─────────────────────────────────────────────────────────────────────────────
// CENTRAL DE COMUNICAÇÕES — a mesa de operação do SaaS ALTAR
//
// Rota própria, e não mais uma seção do Painel Admin, porque a caixa de
// entrada precisa de três colunas e de altura inteira: espremida dentro de uma
// página que já rolava muito, a conversa ficava ilegível e a ficha do contato
// não cabia em lugar nenhum.
//
// ── A FRONTEIRA QUE ESTA TELA NÃO CRUZA ─────────────────────────────────────
// Aqui só existe gente que fala com o ALTAR: interessados da landing e
// assinantes. Os clientes das decoradoras (`leads`) continuam do outro lado da
// linha, isolados por `userId` — esta tela não tem uma única query capaz de
// alcançá-los.
//
// ── NADA DAQUI ENVIA MENSAGEM ───────────────────────────────────────────────
// A única saída possível é a fila de aprovação, e ela depende do portão do
// ambiente, que na Fase 1 está fechado. O aviso no topo diz isso o tempo todo.
// ─────────────────────────────────────────────────────────────────────────────

type Aba = "caixa" | "fila" | "tarefas" | "ouvidoria";

const ABAS: { id: Aba; rotulo: string; icone: typeof Inbox }[] = [
  { id: "caixa", rotulo: "Caixa de entrada", icone: Inbox },
  { id: "fila", rotulo: "Fila de aprovação", icone: ShieldCheck },
  { id: "tarefas", rotulo: "Tarefas", icone: ListTodo },
  { id: "ouvidoria", rotulo: "Ouvidoria", icone: Megaphone },
];

export default function CentralPage() {
  const ehAdmin = useQuery(api.admin.isAdmin, {});
  const painel = useQuery(api.communications.painel, {});
  const fila = useQuery(api.adminApprovals.listarPendentes, {});
  const [aba, setAba] = useState<Aba>("caixa");

  if (ehAdmin === undefined) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="size-6" />
      </div>
    );
  }

  // A guarda de verdade está no backend: toda função da Central passa por
  // `requireAdmin`. Esta é só para não mostrar uma tela vazia e sem sentido a
  // quem não opera o SaaS.
  if (ehAdmin === false) return <Navigate to="/dashboard" replace />;

  return (
    <div className="space-y-4 pb-10">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MessageSquare className="size-5 text-primary" /> Central de Comunicações
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Conversas do número comercial do ALTAR — interessados e assinantes. Não se confunde
          com o funil de clientes das decoradoras.
        </p>
      </header>

      <EstadoDoEnvio painel={painel} />
      <Indicadores painel={painel} />

      <nav className="flex flex-wrap gap-1.5" aria-label="Seções da Central">
        {ABAS.map(({ id, rotulo, icone: Icone }) => {
          const pendentes = id === "fila" ? (fila?.length ?? 0) : 0;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setAba(id)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
                aba === id
                  ? "border-primary bg-primary/10 font-medium"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              <Icone className="size-3.5" /> {rotulo}
              {pendentes > 0 && (
                <span className="rounded-full bg-primary text-primary-foreground text-[10px] px-1.5">
                  {pendentes}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <ErrorBoundary>
        {aba === "caixa" && <CaixaDeEntrada />}
        {aba === "fila" && <FilaDeAprovacao />}
        {aba === "tarefas" && <Tarefas />}
        {aba === "ouvidoria" && <Ouvidoria />}
      </ErrorBoundary>
    </div>
  );
}
