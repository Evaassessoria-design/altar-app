import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarDays,
  CircleAlert,
  Clock3,
  DollarSign,
  Headphones,
  ListTodo,
  MessageSquare,
  Radio,
  TrendingUp,
  UserRoundCheck,
  Users,
} from "lucide-react";

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
      {detalhe ? (
        <p className="mt-1 text-xs text-muted-foreground">{detalhe}</p>
      ) : null}
    </div>
  );
}

export default function EscritorioPage() {
  const navigate = useNavigate();
  const souDono = useQuery(api.escritorio.souDono);
  const ehAdmin = useQuery(api.admin.isAdmin, {});
  // Só pergunta o panorama depois de saber que pode: uma chamada de quem não é
  // dono responderia NOT_FOUND e viraria erro de tela sem motivo.
  const panorama = useQuery(
    api.escritorio.panorama,
    souDono === true ? {} : "skip",
  );
  const comando = useQuery(
    api.escritorio.comando,
    souDono === true ? {} : "skip",
  );

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
          O negócio ALTAR — carteira, cobrança e interessados. Nenhum dado de
          cliente de decoradora aparece aqui.
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
            <Numero
              icone={Radio}
              rotulo="Em teste"
              valor={String(panorama.negocio.trial)}
            />
            <Numero
              icone={Radio}
              rotulo="Inadimplentes"
              valor={String(panorama.negocio.overdue)}
              detalhe={`${panorama.negocio.overdueBlocked} já bloqueadas`}
            />
            <Numero
              icone={Radio}
              rotulo="Teste vencido"
              valor={String(panorama.negocio.expired)}
            />
            <Numero
              icone={Radio}
              rotulo="Canceladas"
              valor={String(panorama.negocio.cancelled)}
            />
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-medium">Interessados no ALTAR</h2>
            <p className="text-xs text-muted-foreground">
              Quem pediu demonstração ou beta pela landing. São decoradoras
              interessadas no ALTAR — não confundir com os leads de uma
              decoradora, que são clientes dela e não aparecem aqui.
            </p>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Numero
                icone={Users}
                rotulo="Novos"
                valor={String(panorama.interessados.novo)}
              />
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
        </>
      )}

      <section className="space-y-3 border-t pt-6">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <ListTodo className="size-4" /> Comando operacional
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Um resumo da Central, das tarefas e da Voz do Cliente. O trabalho
            detalhado continua nas áreas próprias, sem criar listas paralelas.
          </p>
        </div>

        {comando === undefined ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Numero
                icone={ListTodo}
                rotulo="Tarefas abertas"
                valor={String(comando.tarefas.abertas)}
                detalhe={`${comando.tarefas.emAndamento} em andamento`}
              />
              <Numero
                icone={AlertTriangle}
                rotulo="Atenção hoje"
                valor={String(
                  comando.tarefas.vencidas + comando.tarefas.vencemHoje,
                )}
                detalhe={`${comando.tarefas.vencidas} vencidas · ${comando.tarefas.vencemHoje} vencem hoje`}
              />
              <Numero
                icone={Clock3}
                rotulo="Aguardando aprovação"
                valor={String(comando.central.aguardandoAprovacao)}
                detalhe="nenhuma mensagem sai sozinha"
              />
              <Numero
                icone={MessageSquare}
                rotulo="Conversas abertas"
                valor={String(comando.central.conversasAbertas)}
                detalhe={`${comando.central.mensagensNaoLidas} mensagens não lidas`}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(260px,1fr)]">
              <div className="rounded-xl border bg-card p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Próximas tarefas</p>
                    <p className="text-xs text-muted-foreground">
                      Prazo primeiro; urgência desempata.
                    </p>
                  </div>
                  {ehAdmin === true && (
                    <Button asChild size="sm" variant="outline">
                      <Link to="/central">
                        Abrir Central <ArrowRight className="size-3.5" />
                      </Link>
                    </Button>
                  )}
                </div>

                {comando.tarefas.proximas.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhuma tarefa aberta.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {comando.tarefas.proximas.map((tarefa) => (
                      <li
                        key={tarefa._id}
                        className="flex items-start justify-between gap-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {tarefa.titulo}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {tarefa.responsavel ?? "Sem responsável"}
                            {tarefa.venceEm
                              ? ` · vence ${tarefa.venceEm}`
                              : " · sem prazo"}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] capitalize">
                          {tarefa.prioridade}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="space-y-3 rounded-xl border bg-card p-4">
                <div>
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <CircleAlert className="size-4" /> Pressão da operação
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    O que precisa de decisão ou organização humana.
                  </p>
                </div>
                <ul className="space-y-2 text-sm">
                  <li className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Urgentes</span>
                    <strong>{comando.tarefas.urgentes}</strong>
                  </li>
                  <li className="flex justify-between gap-3">
                    <span className="text-muted-foreground">
                      Sem responsável
                    </span>
                    <strong>{comando.tarefas.semResponsavel}</strong>
                  </li>
                  <li className="flex justify-between gap-3">
                    <span className="text-muted-foreground">
                      Escaladas ao CEO
                    </span>
                    <strong>{comando.central.escaladasCeo}</strong>
                  </li>
                  <li className="flex justify-between gap-3">
                    <span className="text-muted-foreground">
                      Sinais de clientes
                    </span>
                    <strong>{comando.vozDoCliente.sinaisAbertos}</strong>
                  </li>
                  <li className="flex justify-between gap-3">
                    <span className="text-muted-foreground">
                      Sinais críticos
                    </span>
                    <strong>{comando.vozDoCliente.criticos}</strong>
                  </li>
                </ul>
                {comando.amostraParcial && (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    A operação passou do limite desta contagem. Há mais itens.
                  </p>
                )}
              </div>
            </div>

            {ehAdmin === true && (
              <div className="grid gap-3 sm:grid-cols-3">
                <Button
                  asChild
                  variant="outline"
                  className="h-auto justify-between py-3"
                >
                  <Link to="/central">
                    <span className="flex items-center gap-2">
                      <Headphones className="size-4" /> Central e WhatsApp
                    </span>
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="h-auto justify-between py-3"
                >
                  <Link to="/campanha">
                    <span className="flex items-center gap-2">
                      <TrendingUp className="size-4" /> Campanha comercial
                    </span>
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="h-auto justify-between py-3"
                >
                  <Link to="/admin">
                    <span className="flex items-center gap-2">
                      <UserRoundCheck className="size-4" /> Contas e assinaturas
                    </span>
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
