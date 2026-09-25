import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { cn } from "@/lib/utils.ts";
import { AlertTriangle, Check, Copy, Inbox, Trash2 } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// A FILA DE REVISÃO
//
// ── O QUE ESTA TELA NÃO TEM ─────────────────────────────────────────────────
// Não tem "enviar". Não tem "enviar para todos". Não tem "disparar". O botão
// principal é COPIAR, e o segundo é "já enviei" — que é anotação de uma coisa
// que aconteceu fora do ALTAR, pelo WhatsApp de uma pessoa.
//
// Uma campanha que dispara sozinha erra em escala, e erro em escala com o nome
// da empresa em cima não tem como voltar atrás.
//
// ── APROVAR É DECISÃO EDITORIAL ─────────────────────────────────────────────
// "Este texto está bom." Não é "pode sair". A separação existe para que o dia
// em que houver provedor homologado não encontre uma fila de trezentas
// mensagens aprovadas com semântica de "pode disparar".
//
// ── PENDÊNCIA BARRA A APROVAÇÃO ─────────────────────────────────────────────
// Um texto com "[LINK DA SALA — ainda não definido]" no meio não pode ser
// aprovado. Aprovar um texto com buraco é o mesmo que não ter revisado: o
// buraco só apareceria para quem recebesse.
// ─────────────────────────────────────────────────────────────────────────────

const ABAS = [
  { id: "rascunho", rotulo: "Para revisar" },
  { id: "aprovado", rotulo: "Aprovadas" },
  { id: "enviado_manualmente", rotulo: "Já enviadas" },
  { id: "descartado", rotulo: "Descartadas" },
] as const;

type Aba = (typeof ABAS)[number]["id"];

export function FilaDeRevisao({ campanha }: { campanha: string }) {
  const [aba, setAba] = useState<Aba>("rascunho");
  const dados = useQuery(api.campanhaRascunhos.listar, { campanha, status: aba });
  const decidir = useMutation(api.campanhaRascunhos.decidir);
  const editar = useMutation(api.campanhaRascunhos.editarTexto);
  const [editando, setEditando] = useState<Id<"campaignDrafts"> | null>(null);
  const [rascunho, setRascunho] = useState("");

  async function agir(draftId: Id<"campaignDrafts">, decisao: "aprovar" | "descartar" | "marcar_enviado") {
    try {
      await decidir({ draftId, decisao });
      toast.success(
        decisao === "aprovar"
          ? "Aprovada — falta você enviar"
          : decisao === "descartar"
            ? "Descartada"
            : "Anotado que você enviou",
      );
    } catch (e) {
      toast.error(
        e instanceof ConvexError
          ? String((e.data as { message?: string })?.message)
          : "Não deu certo",
      );
    }
  }

  async function salvarTexto(draftId: Id<"campaignDrafts">) {
    try {
      await editar({ draftId, texto: rascunho });
      setEditando(null);
      toast.success("Texto salvo", { description: "A aprovação anterior caiu junto." });
    } catch (e) {
      toast.error(
        e instanceof ConvexError
          ? String((e.data as { message?: string })?.message)
          : "Não deu para salvar",
      );
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-5">
      <div>
        <h2 className="flex items-center gap-2 font-semibold">
          <Inbox className="size-4 text-primary" /> Fila de revisão
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Leia, ajuste se quiser, copie e mande você mesma.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {ABAS.map((a) => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            aria-pressed={aba === a.id}
            className={cn(
              "cursor-pointer rounded-full border px-2.5 py-1 text-xs transition-colors",
              aba === a.id
                ? "border-primary bg-primary/10 font-medium text-primary"
                : "border-border text-muted-foreground hover:bg-accent",
            )}
          >
            {a.rotulo}
          </button>
        ))}
      </div>

      {dados === undefined ? (
        <Skeleton className="h-32 w-full" />
      ) : dados.rascunhos.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {aba === "rascunho"
            ? "Nada para revisar agora."
            : aba === "aprovado"
              ? "Nenhuma aprovada esperando."
              : aba === "enviado_manualmente"
                ? "Você ainda não marcou nenhuma como enviada."
                : "Nada descartado."}
        </p>
      ) : (
        <ul className="space-y-3">
          {dados.rascunhos.map((r) => (
            <li key={r._id} className="rounded-lg border border-border/60 p-3">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <p className="truncate text-sm font-medium">
                  {r.pessoa?.nome ?? "Pessoa removida"}
                  {r.pessoa?.empresa && (
                    <span className="ml-1.5 font-normal text-muted-foreground">
                      · {r.pessoa.empresa}
                    </span>
                  )}
                </p>
                <span className="flex-shrink-0 text-xs text-muted-foreground">
                  {r.canalSugerido === "whatsapp" ? "WhatsApp" : "E-mail"}
                </span>
              </div>

              {r.destinatario ? (
                <p className="mb-1 truncate text-xs text-muted-foreground">{r.destinatario}</p>
              ) : null}
              <p className="mb-2 text-xs text-muted-foreground">{r.contexto}</p>

              {r.pendencias.length > 0 && (
                <div className="mb-2 flex items-start gap-1.5 rounded-md bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 size-3.5 flex-shrink-0" />
                  <div>
                    {r.pendencias.map((p) => (
                      <p key={p}>{p}</p>
                    ))}
                  </div>
                </div>
              )}

              {editando === r._id ? (
                <div className="space-y-2">
                  <Textarea
                    rows={10}
                    value={rascunho}
                    onChange={(e) => setRascunho(e.target.value)}
                    aria-label="Texto da mensagem"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => void salvarTexto(r._id)} className="cursor-pointer">
                      Salvar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditando(null)}
                      className="cursor-pointer"
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <pre className="mb-2 whitespace-pre-wrap break-words rounded-md bg-muted/50 p-2.5 font-sans text-sm">
                    {r.texto}
                  </pre>

                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        void navigator.clipboard.writeText(r.texto);
                        toast.success("Texto copiado");
                      }}
                      className="h-7 cursor-pointer gap-1 text-xs"
                    >
                      <Copy className="size-3" /> Copiar
                    </Button>
                    {aba !== "enviado_manualmente" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditando(r._id);
                          setRascunho(r.texto);
                        }}
                        className="h-7 cursor-pointer text-xs"
                      >
                        Editar
                      </Button>
                    )}
                    {aba === "rascunho" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void agir(r._id, "aprovar")}
                        className="h-7 cursor-pointer gap-1 text-xs"
                      >
                        <Check className="size-3" /> Aprovar
                      </Button>
                    )}
                    {aba !== "enviado_manualmente" && aba !== "descartado" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void agir(r._id, "marcar_enviado")}
                        className="h-7 cursor-pointer text-xs"
                      >
                        Já enviei
                      </Button>
                    )}
                    {/* ── ALVO DE DEDO, NÃO DE MOUSE ────────────────────────
                        28px é alvo de mouse. iOS e Android pedem ~44px, e esta
                        fila é operada no celular, entre um compromisso e
                        outro.

                        `-m-1` sobre um botão de 36px devolve o espaço ao
                        layout: a área tocável cresce e nada se move na tela —
                        é o mesmo padrão de `toque-galpao.test.ts`. */}
                    {aba !== "descartado" && aba !== "enviado_manualmente" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void agir(r._id, "descartar")}
                        aria-label="Descartar mensagem"
                        className="relative -m-1 h-9 w-9 cursor-pointer p-0 text-muted-foreground"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {dados?.temMais && (
        <p className="text-center text-xs text-amber-600 dark:text-amber-500">
          Mostrando as {dados.rascunhos.length} mais recentes — há mais.
        </p>
      )}
    </div>
  );
}
