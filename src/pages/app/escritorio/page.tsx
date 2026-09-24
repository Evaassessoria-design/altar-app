import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Building2, Users, TrendingUp, DollarSign, CalendarDays, Radio } from "lucide-react";

// ═════════════════════════════════════════════════════════════════════════════
// ESCRITÓRIO ALTAR — a mesa de quem administra o NEGÓCIO.
//
// Não é o Assistente. O Assistente (/assistente) é a IA da decoradora,
// trabalhando sobre a empresa DELA. Esta tela é o outro lado: a carteira de
// assinantes do ALTAR, a cobrança, os interessados da landing.
//
// ── ESTA TELA NÃO É A TRAVA ─────────────────────────────────────────────────
// O redirecionamento abaixo é cortesia: evita que alguém fique olhando uma
// tela vazia. Quem trava é `requirePlatformOwner`, no backend, em toda função
// de `convex/escritorio.ts` — porque quem digita a URL não passa pelo menu, e
// quem chama a função pelo cliente Convex não passa nem pela tela.
// ═════════════════════════════════════════════════════════════════════════════

const emReais = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Numero({
  icone: Icone,
  rotulo,
  valor,
  detalhe,
}: {
  icone: typeof Users;
  rotulo: string;
  valor: string;
  detalhe?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icone className="h-4 w-4" />
        <span className="text-xs uppercase tracking-wide">{rotulo}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{valor}</p>
      {detalhe ? <p className="mt-1 text-xs text-muted-foreground">{detalhe}</p> : null}
    </div>
  );
}

export default function EscritorioPage() {
  const navigate = useNavigate();
  const souDono = useQuery(api.escritorio.souDono);
  // Só pergunta o panorama depois de saber que pode: uma chamada de quem não é
  // dono responderia NOT_FOUND e viraria erro de tela sem motivo.
  const panorama = useQuery(api.escritorio.panorama, souDono === true ? {} : "skip");

  useEffect(() => {
    if (souDono === false) navigate("/dashboard");
  }, [souDono, navigate]);

  if (souDono !== true) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-56" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          <h1 className="text-xl font-semibold">Escritório ALTAR</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          O negócio ALTAR — carteira, cobrança e interessados. Nenhum dado de cliente
          de decoradora aparece aqui.
        </p>
      </header>

      {panorama === undefined ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Numero
              icone={Users}
              rotulo="Contas"
              valor={String(panorama.negocio.total)}
              detalhe={
                panorama.leitura.haMaisUsuarios
                  ? `${panorama.leitura.usuariosLidos} lidas (há mais)`
                  : undefined
              }
            />
            <Numero
              icone={DollarSign}
              rotulo="MRR"
              valor={emReais(panorama.negocio.mrr)}
              detalhe={`${panorama.negocio.active} assinaturas ativas`}
            />
            <Numero
              icone={TrendingUp}
              rotulo="Conversão"
              valor={`${panorama.negocio.conversionRate}%`}
              detalhe="de quem chegou ao fim do teste"
            />
            <Numero
              icone={CalendarDays}
              rotulo="Eventos"
              valor={String(panorama.negocio.eventsTotal)}
              detalhe={
                panorama.leitura.haMaisEventos
                  ? `${panorama.leitura.eventosLidos} lidos (há mais)`
                  : "em todas as contas"
              }
            />
          </section>

          <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Numero icone={Radio} rotulo="Em teste" valor={String(panorama.negocio.trial)} />
            <Numero
              icone={Radio}
              rotulo="Inadimplentes"
              valor={String(panorama.negocio.overdue)}
              detalhe={`${panorama.negocio.overdueBlocked} já bloqueadas`}
            />
            <Numero icone={Radio} rotulo="Teste vencido" valor={String(panorama.negocio.expired)} />
            <Numero icone={Radio} rotulo="Canceladas" valor={String(panorama.negocio.cancelled)} />
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-medium">Interessados no ALTAR</h2>
            <p className="text-xs text-muted-foreground">
              Quem pediu demonstração ou beta pela landing. São decoradoras interessadas
              no ALTAR — não confundir com os leads de uma decoradora, que são clientes
              dela e não aparecem aqui.
            </p>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Numero icone={Users} rotulo="Novos" valor={String(panorama.interessados.novo)} />
              <Numero
                icone={Users}
                rotulo="Contatados"
                valor={String(panorama.interessados.contatado)}
              />
              <Numero
                icone={Users}
                rotulo="Convertidos"
                valor={String(panorama.interessados.convertido)}
              />
              <Numero
                icone={Users}
                rotulo="Descartados"
                valor={String(panorama.interessados.descartado)}
              />
            </div>
          </section>

          <p className="text-xs text-muted-foreground">
            O Escritório de IA interno — comercial, marketing, CS e assinaturas do ALTAR —
            ainda não existe. Quando vier, nasce aqui, atrás da mesma permissão.
          </p>
        </>
      )}
    </div>
  );
}
