import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { ConvexError } from "convex/values";
import { toast } from "sonner";
import { cn } from "@/lib/utils.ts";
import { Button } from "@/components/ui/button.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Check, Clock, Lock, ShieldAlert, X } from "lucide-react";
import { formatTimestampComHora } from "@/lib/safe-date.ts";
import {
  CLASSE_DA_PRIORIDADE,
  ordenarFila,
  ROTULO_DA_CATEGORIA,
  ROTULO_DA_PRIORIDADE,
  ROTULO_DO_DEPARTAMENTO,
  rotuloDaConfianca,
  type Departamento,
  type Prioridade,
} from "@/lib/central-fila.ts";

// ─────────────────────────────────────────────────────────────────────────────
// A FILA DO MATHEUS — onde a decisão humana acontece
//
// Aprovar aqui NÃO envia: quem envia é o outbox, e ele consulta o portão de
// saída antes de qualquer coisa. Na Fase 1 o portão recusa sempre, e a
// proposta fica `aprovada` — nunca `executada`.
//
// O diagnóstico do portão aparece ao lado de cada proposta justamente para
// que ninguém confunda "eu aprovei" com "o cliente recebeu".
// ─────────────────────────────────────────────────────────────────────────────

type StatusDeAprovacao =
  | "pendente"
  | "aprovada"
  | "aprovada_editada"
  | "recusada"
  | "expirada"
  | "executada"
  | "falhou";

const HISTORICO: { valor: StatusDeAprovacao; rotulo: string }[] = [
  { valor: "aprovada", rotulo: "Aprovadas" },
  { valor: "aprovada_editada", rotulo: "Editadas e aprovadas" },
  { valor: "recusada", rotulo: "Recusadas" },
  { valor: "expirada", rotulo: "Expiradas" },
  { valor: "executada", rotulo: "Enviadas" },
  { valor: "falhou", rotulo: "Falharam" },
];

function erroLegivel(erro: unknown): string {
  if (erro instanceof ConvexError) {
    const dados = erro.data as { message?: string } | undefined;
    return dados?.message ?? "Não foi possível concluir.";
  }
  return "Não foi possível concluir.";
}

export function FilaDeAprovacao() {
  const fila = useQuery(api.adminApprovals.listarPendentes, {});
  const portao = useQuery(api.adminApprovals.diagnosticoDoPortao, {});
  const [aba, setAba] = useState<StatusDeAprovacao>("aprovada");
  const historico = useQuery(api.adminApprovals.listarPorStatus, { status: aba });

  return (
    <div className="space-y-4">
      <DiagnosticoDoPortao portao={portao} />

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="font-semibold text-sm">Aguardando a sua decisão</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Respostas propostas pela IA. Você pode editar antes de aprovar — o texto final é
            o que fica registrado.
          </p>
        </div>

        {fila === undefined ? (
          <div className="p-4 space-y-2">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : fila.length === 0 ? (
          <div className="px-4 py-10 text-sm text-muted-foreground text-center">
            <Check className="size-5 mx-auto mb-2 text-emerald-600" />
            Nenhuma resposta aguardando aprovação.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {ordenarFila(fila).map((item) => (
              <ItemDaFila key={item._id} item={item} />
            ))}
          </div>
        )}
      </div>

      {/* ── Histórico de decisões ─────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="font-semibold text-sm">Histórico de decisões</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            O que já foi decidido, por quem e o que aconteceu depois.
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {HISTORICO.map((h) => (
              <button
                key={h.valor}
                type="button"
                onClick={() => setAba(h.valor)}
                className={cn(
                  "text-xs px-2.5 py-1 rounded-full border transition-colors",
                  aba === h.valor
                    ? "border-primary bg-primary/10 font-medium"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {h.rotulo}
              </button>
            ))}
          </div>
        </div>

        {historico === undefined ? (
          <div className="p-4 space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : historico.length === 0 ? (
          <p className="px-4 py-8 text-sm text-muted-foreground text-center">
            Nada nesta situação.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {historico.map((h) => (
              <li key={h._id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <p className="text-sm font-medium">
                    {h.contatoNome ?? "Contato desconhecido"}
                    {h.assunto && (
                      <span className="font-normal text-muted-foreground"> · {h.assunto}</span>
                    )}
                  </p>
                  <span className="text-[11px] text-muted-foreground">
                    {h.decididoEm ? formatTimestampComHora(h.decididoEm) : "—"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap break-words">
                  {h.textoAprovado ?? h.proposta.texto}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {h.decididoPor ? `Decidida por ${h.decididoPor}` : "Sem autor registrado"}
                  {h.recusaMotivo ? ` · ${h.recusaMotivo}` : ""}
                  {h.execucaoErro ? ` · falha no envio: ${h.execucaoErro}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── Portão de saída ─────────────────────────────────────────────────────────

type Portao = ReturnType<typeof useQuery<typeof api.adminApprovals.diagnosticoDoPortao>>;

function DiagnosticoDoPortao({ portao }: { portao: Portao }) {
  if (portao === undefined) return null;

  const sairia = portao.sairia;

  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3 text-sm",
        sairia
          ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30"
          : "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30",
      )}
    >
      <p
        className={cn(
          "font-medium flex items-center gap-2",
          sairia
            ? "text-emerald-800 dark:text-emerald-300"
            : "text-amber-800 dark:text-amber-300",
        )}
      >
        {sairia ? <Check className="size-4" /> : <Lock className="size-4" />}
        {sairia
          ? "Se você aprovar agora, a mensagem sai."
          : "Se você aprovar agora, a mensagem NÃO sai."}
      </p>
      <p className="text-xs text-muted-foreground mt-0.5">
        Envio externo: <strong>{portao.envioExterno}</strong>
        {portao.motivo ? ` · ${portao.motivo}` : ""}
      </p>
    </div>
  );
}

// ─── Item da fila ────────────────────────────────────────────────────────────

type Fila = ReturnType<typeof useQuery<typeof api.adminApprovals.listarPendentes>>;

function ItemDaFila({ item }: { item: NonNullable<Fila>[number] }) {
  const aprovar = useMutation(api.adminApprovals.aprovar);
  const recusar = useMutation(api.adminApprovals.recusar);

  const [texto, setTexto] = useState(item.proposta.texto);
  const [motivo, setMotivo] = useState("");
  const [recusando, setRecusando] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const editado = texto.trim() !== item.proposta.texto.trim();
  const confianca = item.triagem ? rotuloDaConfianca(item.triagem.confianca) : null;
  const prioridade: Prioridade = item.conversa?.prioridade ?? "normal";

  async function decidir(acao: "aprovar" | "recusar") {
    setOcupado(true);
    try {
      if (acao === "aprovar") {
        const r = await aprovar({
          approvalId: item._id as Id<"adminApprovals">,
          textoEditado: editado ? texto.trim() : undefined,
        });
        toast.success(
          r.status === "aprovada_editada" ? "Resposta editada e aprovada." : "Resposta aprovada.",
          { description: "Registrada com o seu nome. O envio depende do ambiente." },
        );
      } else {
        await recusar({
          approvalId: item._id as Id<"adminApprovals">,
          motivo: motivo.trim() || undefined,
        });
        toast.success("Proposta recusada.");
        setRecusando(false);
        setMotivo("");
      }
    } catch (erro) {
      toast.error(erroLegivel(erro));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="px-4 py-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="font-medium text-sm truncate">
            {item.contato?.nome ?? "Contato desconhecido"}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {item.conversa?.assunto ?? "Sem assunto"}
          </p>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {item.conversa?.escaladaParaCeo && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
              Escalada
            </span>
          )}
          <span
            className={cn(
              "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
              CLASSE_DA_PRIORIDADE[prioridade],
            )}
          >
            {ROTULO_DA_PRIORIDADE[prioridade]}
          </span>
          {item.conversa && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-muted text-muted-foreground">
              {ROTULO_DO_DEPARTAMENTO[item.conversa.departamento as Departamento]}
            </span>
          )}
          {item.conversa?.categoria && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-muted text-muted-foreground">
              {ROTULO_DA_CATEGORIA[item.conversa.categoria] ?? item.conversa.categoria}
            </span>
          )}
          {confianca && (
            <span
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                confianca.classe,
              )}
            >
              {confianca.texto}
            </span>
          )}
        </div>
      </div>

      {item.conversa?.escaladaMotivo && (
        <p className="mt-1.5 text-xs text-red-700 dark:text-red-400 flex items-center gap-1.5">
          <ShieldAlert className="size-3" /> {item.conversa.escaladaMotivo}
        </p>
      )}

      {item.triagem?.resumo && (
        <p className="mt-2 text-xs text-muted-foreground">{item.triagem.resumo}</p>
      )}

      {item.expirada && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
          <Clock className="size-3" />
          A janela de resposta do canal já passou. Aprovar aqui não produz mensagem.
        </p>
      )}

      <Textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={4}
        className="mt-3 text-sm"
        aria-label="Resposta sugerida"
      />
      <p className="text-[11px] text-muted-foreground mt-1">
        Sugerida pela IA{item.modelo ? ` (${item.modelo})` : ""} ·{" "}
        {formatTimestampComHora(item.criadoEm)}
        {editado && " · editada por você"}
      </p>

      {recusando && (
        <Textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={2}
          className="mt-2 text-sm"
          placeholder="Por que esta resposta não serve? (fica registrado)"
          aria-label="Motivo da recusa"
        />
      )}

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <Button
          size="sm"
          disabled={ocupado || texto.trim().length === 0}
          onClick={() => void decidir("aprovar")}
        >
          <Check className="size-3.5" /> {editado ? "Editar e aprovar" : "Aprovar"}
        </Button>

        {recusando ? (
          <>
            <Button
              size="sm"
              variant="destructive"
              disabled={ocupado}
              onClick={() => void decidir("recusar")}
            >
              Confirmar recusa
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={ocupado}
              onClick={() => {
                setRecusando(false);
                setMotivo("");
              }}
            >
              Cancelar
            </Button>
          </>
        ) : (
          <Button size="sm" variant="outline" disabled={ocupado} onClick={() => setRecusando(true)}>
            <X className="size-3.5" /> Recusar
          </Button>
        )}
      </div>
    </div>
  );
}
