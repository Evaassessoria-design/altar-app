import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { cn } from "@/lib/utils.ts";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  AlertTriangle,
  Check,
  Clock,
  Inbox,
  Lock,
  MessageSquare,
  ShieldAlert,
  UserPlus,
} from "lucide-react";
import { ROTULO_DO_DEPARTAMENTO, type Departamento } from "@/lib/central-fila.ts";

// ─────────────────────────────────────────────────────────────────────────────
// INDICADORES EXECUTIVOS DA CENTRAL
//
// Os MESMOS números que a ponte do Escritório 3D entrega — a query é a mesma
// (`communications.painel`), e por isso não existe a chance de a sala 3D e o
// Painel Admin discordarem sobre quantas conversas estão abertas.
//
// O 3D continua SOMENTE LEITURA, e nenhum indicador novo foi acrescentado ao
// contrato dele por causa desta tela. A única coisa que entrou depois foi
// `amostraParcial` — um booleano que diz se a contagem viu tudo. Ele vale para
// os DOIS consumidores pelo mesmo motivo: um número menor que o real, exibido
// com cara de certeza, engana igual na sala 3D e no Painel. E não carrega nome,
// telefone nem conteúdo, que é a disciplina da ponte.
// ─────────────────────────────────────────────────────────────────────────────

export type Painel = ReturnType<typeof useQuery<typeof api.communications.painel>>;

/**
 * O aviso de envio desligado não é decoração.
 *
 * Na Fase 1 aprovar registra a decisão e NÃO envia. Sem dizer isso na tela,
 * quem aprova conclui pelo silêncio que a mensagem foi entregue — e o cliente
 * fica esperando uma resposta que nunca saiu.
 */
export function EstadoDoEnvio({ painel }: { painel: Painel }) {
  if (painel === undefined) return null;

  const desligado = painel.envioExterno !== "ligado";

  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3 text-sm",
        desligado
          ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30"
          : "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30",
      )}
    >
      <p
        className={cn(
          "flex items-center gap-2 font-medium",
          desligado
            ? "text-amber-800 dark:text-amber-300"
            : "text-emerald-800 dark:text-emerald-300",
        )}
      >
        {desligado ? <Lock className="size-4" /> : <Check className="size-4" />}
        {desligado
          ? "Envio externo DESLIGADO — nada sai deste ambiente."
          : "Envio externo ligado — respostas aprovadas são entregues."}
      </p>
      {desligado && (
        <p className="text-xs text-muted-foreground mt-1">
          Aprovar registra a sua decisão e deixa a resposta pronta, mas a mensagem não é
          enviada ao cliente. Para ligar, defina{" "}
          <code>ALTAR_CENTRAL_ENVIO_HABILITADO=true</code> nas variáveis do Convex — e só
          depois de o número comercial estar integrado.
        </p>
      )}
    </div>
  );
}

export function Indicadores({ painel }: { painel: Painel }) {
  if (painel === undefined) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  const cartoes = [
    { rotulo: "Não lidas", valor: painel.mensagensNaoLidas, icone: Inbox },
    { rotulo: "Conversas abertas", valor: painel.conversasAbertas, icone: MessageSquare },
    { rotulo: "Aguardando você", valor: painel.aguardandoAprovacao, icone: Clock },
    { rotulo: "Escaladas", valor: painel.escaladasCeo, icone: ShieldAlert },
    { rotulo: "Novos contatos 24h", valor: painel.leadsNovos24h, icone: UserPlus },
  ];

  return (
    <div className="space-y-3">
      {/* Cinco cartões só cabem lado a lado em tela larga. Em tablet, `md`
          espremia "Novos contatos 24h" em três linhas e desalinhava a fileira
          inteira. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        {cartoes.map(({ rotulo, valor, icone: Icone }) => (
          <div key={rotulo} className="rounded-lg border border-border bg-card px-3 py-2">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Icone className="size-3" /> {rotulo}
            </p>
            <p className="text-xl font-semibold mt-0.5">{valor}</p>
          </div>
        ))}
      </div>

      {/* O painel CONTA, e contar exige ver tudo. As duas varreduras têm
          teto; enquanto a Central couber nele, nada muda. No dia em que não
          couber, os cartões mostrariam um número MENOR que o real com a mesma
          cara de certeza — e é melhor dizer que a conta parou. */}
      {painel.amostraParcial && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          A Central passou do tamanho que esta contagem alcança: os números acima
          consideram só as conversas e os contatos mais recentes. Há mais.
        </p>
      )}

      <div className="rounded-lg border border-border bg-card px-4 py-3">
        <p className="text-xs text-muted-foreground mb-2">Por departamento</p>
        <div className="flex flex-wrap gap-2">
          {(
            Object.entries(painel.porDepartamento) as [
              Departamento,
              { abertas: number; urgentes: number; aguardandoAprovacao: number },
            ][]
          ).map(([departamento, dados]) => (
            <div
              key={departamento}
              className="rounded-lg border border-border px-3 py-1.5 text-xs"
            >
              <span className="font-medium">{ROTULO_DO_DEPARTAMENTO[departamento]}</span>
              <span className="text-muted-foreground"> · {dados.abertas} aberta(s)</span>
              {dados.urgentes > 0 && (
                <span className="text-red-600 dark:text-red-400">
                  {" "}
                  · {dados.urgentes} urgente
                </span>
              )}
              {dados.aguardandoAprovacao > 0 && (
                <span className="text-amber-700 dark:text-amber-400">
                  {" "}
                  · {dados.aguardandoAprovacao} p/ aprovar
                </span>
              )}
            </div>
          ))}
        </div>

        {(painel.pendencias.semRespostaMais24h > 0 ||
          painel.pendencias.followUpVencido > 0) && (
          <p className="mt-2 text-xs flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="size-3" />
            {painel.pendencias.semRespostaMais24h > 0 &&
              `${painel.pendencias.semRespostaMais24h} conversa(s) sem resposta há mais de 24h`}
            {painel.pendencias.semRespostaMais24h > 0 &&
              painel.pendencias.followUpVencido > 0 &&
              " · "}
            {painel.pendencias.followUpVencido > 0 &&
              `${painel.pendencias.followUpVencido} follow-up(s) vencido(s)`}
          </p>
        )}
      </div>
    </div>
  );
}
