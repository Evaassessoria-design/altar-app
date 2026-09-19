import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { ConvexError } from "convex/values";
import { toast } from "sonner";
import { cn } from "@/lib/utils.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Flame, Merge, Plus, Sparkles } from "lucide-react";
import { formatTimestampComHora } from "@/lib/safe-date.ts";
import {
  CLASSE_DA_SEVERIDADE,
  OPCOES_DE_SEVERIDADE,
  OPCOES_DE_STATUS_DE_SINAL,
  OPCOES_DE_TIPO_DE_SINAL,
  ROTULO_DA_SEVERIDADE,
  ROTULO_DO_STATUS_DE_SINAL,
  ROTULO_DO_TIPO_DE_SINAL,
  TODOS,
  type Severidade,
  type StatusDeSinal,
  type TipoDeSinal,
} from "@/lib/central-inbox.ts";

// ─────────────────────────────────────────────────────────────────────────────
// OUVIDORIA → PRODUTO
//
// O número que importa aqui é `ocorrencias`: nove pessoas pedindo a mesma
// coisa são UM sinal com peso 9, e é isso que prioriza roadmap. Uma lista de
// conversas nunca produziria esse número.
//
// FUNDIR é decisão humana e de mão única: o sinal descartado registra que foi
// fundido, e a contagem vai para o que ficou. Fundir errado apagaria o pedido
// de um cliente — que é exatamente o que a Ouvidoria existe para impedir.
// ─────────────────────────────────────────────────────────────────────────────

const CLASSE_DO_SELECT =
  "h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

function erroLegivel(erro: unknown): string {
  if (erro instanceof ConvexError) {
    const dados = erro.data as { message?: string } | undefined;
    return dados?.message ?? "Não foi possível concluir.";
  }
  return "Não foi possível concluir.";
}

type Sinal = NonNullable<ReturnType<typeof useQuery<typeof api.customerVoice.listar>>>[number];

export function Ouvidoria() {
  const [tipo, setTipo] = useState<TipoDeSinal | "">("");
  const [status, setStatus] = useState<StatusDeSinal | "">("");
  const [severidade, setSeveridade] = useState<Severidade | "">("");
  const [criando, setCriando] = useState(false);
  const [fundindo, setFundindo] = useState<Sinal | null>(null);

  const sinais = useQuery(api.customerVoice.listar, {
    tipo: tipo || undefined,
    status: status || undefined,
    severidade: severidade || undefined,
    limite: 200,
  });
  const painel = useQuery(api.customerVoice.painelDeProduto, {});

  return (
    <div className="space-y-4">
      {/* ── Voz do cliente → Produto ──────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <Flame className="size-4 text-primary" /> Voz do cliente → Produto
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          O que mais se repete, por peso de ocorrências. É o que a operação sabe e o roadmap
          precisa ouvir.
        </p>

        {painel === undefined ? (
          <Skeleton className="h-20 w-full mt-3" />
        ) : (
          <PainelDeProduto painel={painel} />
        )}
      </div>

      {/* ── Filtros ───────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Tipo do sinal"
            className={CLASSE_DO_SELECT}
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoDeSinal | "")}
          >
            <option value={TODOS}>Todos os tipos</option>
            {OPCOES_DE_TIPO_DE_SINAL.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </select>

          <select
            aria-label="Situação do sinal"
            className={CLASSE_DO_SELECT}
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusDeSinal | "")}
          >
            <option value={TODOS}>Todas as situações</option>
            {OPCOES_DE_STATUS_DE_SINAL.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </select>

          <select
            aria-label="Severidade do sinal"
            className={CLASSE_DO_SELECT}
            value={severidade}
            onChange={(e) => setSeveridade(e.target.value as Severidade | "")}
          >
            <option value={TODOS}>Todas as severidades</option>
            {OPCOES_DE_SEVERIDADE.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </select>

          <Button size="sm" className="ml-auto" onClick={() => setCriando(true)}>
            <Plus className="size-3.5" /> Registrar sinal
          </Button>
        </div>
      </div>

      {/* ── Lista ─────────────────────────────────────────────────────── */}
      {sinais === undefined ? (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : sinais.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-sm text-muted-foreground text-center">
          Nenhum sinal com estes filtros.
        </p>
      ) : (
        <ul className="rounded-xl border border-border bg-card divide-y divide-border">
          {sinais.map((s) => (
            <ItemDoSinal key={s._id} sinal={s} onFundir={() => setFundindo(s)} />
          ))}
        </ul>
      )}

      <NovoSinal aberto={criando} onFechar={() => setCriando(false)} />
      <FundirDialog
        sinal={fundindo}
        candidatos={(sinais ?? []).filter((s) => s._id !== fundindo?._id)}
        onFechar={() => setFundindo(null)}
      />
    </div>
  );
}

// ─── Painel de produto ───────────────────────────────────────────────────────

type Painel = NonNullable<ReturnType<typeof useQuery<typeof api.customerVoice.painelDeProduto>>>;

function PainelDeProduto({ painel }: { painel: Painel }) {
  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap gap-2">
        {(
          Object.entries(painel.porTipo) as [string, { sinais: number; ocorrencias: number }][]
        ).map(([tipo, dados]) => (
          <span key={tipo} className="rounded-lg border border-border px-3 py-1.5 text-xs">
            <span className="font-medium">
              {ROTULO_DO_TIPO_DE_SINAL[tipo as TipoDeSinal] ?? tipo}
            </span>
            <span className="text-muted-foreground">
              {" "}
              · {dados.sinais} sinal(is) · {dados.ocorrencias} relato(s)
            </span>
          </span>
        ))}
      </div>

      {painel.maisPedidos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum sinal aberto. Nada a levar para Produto neste momento.
        </p>
      ) : (
        <ol className="space-y-1.5">
          {painel.maisPedidos.map((item) => (
            <li key={item._id} className="text-sm flex items-start gap-2">
              <span className="text-xs font-semibold text-primary mt-0.5">
                {item.ocorrencias}×
              </span>
              <span>
                {item.titulo}
                <span className="text-xs text-muted-foreground">
                  {" "}
                  · {ROTULO_DO_TIPO_DE_SINAL[item.tipo as TipoDeSinal] ?? item.tipo} ·{" "}
                  {ROTULO_DO_STATUS_DE_SINAL[item.status as StatusDeSinal]}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ─── Item ────────────────────────────────────────────────────────────────────

function ItemDoSinal({ sinal, onFundir }: { sinal: Sinal; onFundir: () => void }) {
  const atualizar = useMutation(api.customerVoice.atualizar);
  const [ocupado, setOcupado] = useState(false);

  async function mudar(args: Parameters<typeof atualizar>[0], mensagem: string) {
    setOcupado(true);
    try {
      await atualizar(args);
      toast.success(mensagem);
    } catch (erro) {
      toast.error(erroLegivel(erro));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <li className="px-4 py-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {sinal.titulo}
            {sinal.ocorrencias > 1 && (
              <span className="ml-2 text-xs font-semibold text-primary">
                {sinal.ocorrencias}× relatado
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{sinal.descricao}</p>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-muted text-muted-foreground">
            {ROTULO_DO_TIPO_DE_SINAL[sinal.tipo as TipoDeSinal]}
          </span>
          {sinal.severidade && (
            <span
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                CLASSE_DA_SEVERIDADE[sinal.severidade as Severidade],
              )}
            >
              {ROTULO_DA_SEVERIDADE[sinal.severidade as Severidade]}
            </span>
          )}
          {sinal.registradoPor === "ia" && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground flex items-center gap-1">
              <Sparkles className="size-2.5" /> IA
            </span>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <select
          aria-label={`Situação de ${sinal.titulo}`}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          value={sinal.status}
          disabled={ocupado}
          onChange={(e) =>
            void mudar(
              { signalId: sinal._id, status: e.target.value as StatusDeSinal },
              "Situação atualizada.",
            )
          }
        >
          {OPCOES_DE_STATUS_DE_SINAL.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.rotulo}
            </option>
          ))}
        </select>

        <select
          aria-label={`Severidade de ${sinal.titulo}`}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          value={sinal.severidade ?? ""}
          disabled={ocupado}
          onChange={(e) => {
            const valor = e.target.value;
            if (!valor) return;
            void mudar(
              { signalId: sinal._id, severidade: valor as Severidade },
              "Severidade atualizada.",
            );
          }}
        >
          <option value="">Sem severidade</option>
          {OPCOES_DE_SEVERIDADE.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.rotulo}
            </option>
          ))}
        </select>

        <Button size="sm" variant="ghost" className="h-8" onClick={onFundir}>
          <Merge className="size-3.5" /> Fundir
        </Button>

        <span className="text-[11px] text-muted-foreground ml-auto">
          Último relato em {formatTimestampComHora(sinal.ultimoRelatoEm)} ·{" "}
          {ROTULO_DO_STATUS_DE_SINAL[sinal.status as StatusDeSinal]}
        </span>
      </div>
    </li>
  );
}

// ─── Registro manual ─────────────────────────────────────────────────────────

function NovoSinal({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const registrar = useMutation(api.customerVoice.registrar);
  const [tipo, setTipo] = useState<TipoDeSinal>("reclamacao");
  const [severidade, setSeveridade] = useState<Severidade | "">("");
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [ocupado, setOcupado] = useState(false);

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar sinal</DialogTitle>
          <DialogDescription>
            Vale para o que chegou fora de conversa também — reunião, ligação, e-mail. Fica
            registrado com o seu nome.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <select
              aria-label="Tipo do novo sinal"
              className={CLASSE_DO_SELECT}
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoDeSinal)}
            >
              {OPCOES_DE_TIPO_DE_SINAL.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.rotulo}
                </option>
              ))}
            </select>
            <select
              aria-label="Severidade do novo sinal"
              className={CLASSE_DO_SELECT}
              value={severidade}
              onChange={(e) => setSeveridade(e.target.value as Severidade | "")}
            >
              <option value="">Sem severidade</option>
              {OPCOES_DE_SEVERIDADE.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.rotulo}
                </option>
              ))}
            </select>
          </div>

          <Input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Título curto"
            aria-label="Título do novo sinal"
          />
          <Textarea
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            rows={3}
            placeholder="O que foi relatado"
            aria-label="Descrição do novo sinal"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button
            disabled={ocupado || titulo.trim().length === 0}
            onClick={async () => {
              setOcupado(true);
              try {
                await registrar({
                  tipo,
                  titulo: titulo.trim(),
                  descricao: descricao.trim(),
                  severidade: severidade || undefined,
                });
                toast.success("Sinal registrado.");
                setTitulo("");
                setDescricao("");
                onFechar();
              } catch (erro) {
                toast.error(erroLegivel(erro));
              } finally {
                setOcupado(false);
              }
            }}
          >
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Fusão ───────────────────────────────────────────────────────────────────

function FundirDialog({
  sinal,
  candidatos,
  onFechar,
}: {
  sinal: Sinal | null;
  candidatos: Sinal[];
  onFechar: () => void;
}) {
  const fundir = useMutation(api.customerVoice.fundir);
  const [manterId, setManterId] = useState<string>("");
  const [ocupado, setOcupado] = useState(false);

  return (
    <Dialog open={sinal !== null} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Fundir sinais</DialogTitle>
          <DialogDescription>
            As ocorrências de <strong>{sinal?.titulo}</strong> vão para o sinal que você
            escolher, e este fica marcado como descartado. Nada é apagado.
          </DialogDescription>
        </DialogHeader>

        <select
          aria-label="Sinal que permanece"
          className={cn(CLASSE_DO_SELECT, "w-full")}
          value={manterId}
          onChange={(e) => setManterId(e.target.value)}
        >
          <option value="">Escolha o sinal que permanece</option>
          {candidatos.map((c) => (
            <option key={c._id} value={c._id}>
              {c.titulo} ({c.ocorrencias}×)
            </option>
          ))}
        </select>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button
            disabled={ocupado || !manterId || !sinal}
            onClick={async () => {
              if (!sinal || !manterId) return;
              setOcupado(true);
              try {
                await fundir({
                  manterId: manterId as Id<"customerVoiceSignals">,
                  descartarId: sinal._id,
                });
                toast.success("Sinais fundidos.");
                setManterId("");
                onFechar();
              } catch (erro) {
                toast.error(erroLegivel(erro));
              } finally {
                setOcupado(false);
              }
            }}
          >
            Fundir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
