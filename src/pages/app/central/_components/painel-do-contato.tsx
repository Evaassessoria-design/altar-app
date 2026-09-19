import { useEffect, useState } from "react";
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
import { BadgeCheck, Link2, Link2Off, ListTodo, Megaphone, NotebookPen } from "lucide-react";
import { formatTimestampComHora } from "@/lib/safe-date.ts";
import { estadoDoVinculo } from "@/lib/central-vinculo.ts";
import {
  formatarDiaCivil,
  OPCOES_DE_SEVERIDADE,
  OPCOES_DE_TIPO_DE_SINAL,
  OPCOES_DE_TIPO_DE_TRABALHO,
  ROTULO_DO_STATUS_DE_TRABALHO,
  ROTULO_DO_TIPO_DE_TRABALHO,
  type Severidade,
  type StatusDeTrabalho,
  type TipoDeSinal,
  type TipoDeTrabalho,
} from "@/lib/central-inbox.ts";
import { VinculoDialog } from "./vinculo-dialog.tsx";

// ─────────────────────────────────────────────────────────────────────────────
// QUEM ESTÁ DO OUTRO LADO
//
// Reúne o que a operação sabe sobre a pessoa e o que ainda precisa decidir
// sobre ela: o vínculo (é interessado? é assinante?), as notas internas, as
// tarefas abertas e o caminho para a Ouvidoria.
//
// Nada aqui é enviado a ninguém. Notas internas, em particular, NUNCA entram
// em proposta de resposta e não existem no payload do Escritório 3D.
// ─────────────────────────────────────────────────────────────────────────────

const CLASSE_DO_SELECT =
  "h-8 w-full rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring";

function erroLegivel(erro: unknown): string {
  if (erro instanceof ConvexError) {
    const dados = erro.data as { message?: string } | undefined;
    return dados?.message ?? "Não foi possível concluir.";
  }
  return "Não foi possível concluir.";
}

export function PainelDoContato({
  conversationId,
}: {
  conversationId: Id<"communicationConversations">;
}) {
  const conversa = useQuery(api.communications.abrirConversa, { conversationId });

  if (conversa === undefined) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  const contato = conversa.contatoDetalhe;
  if (!contato) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">
          Esta conversa não tem contato associado.
        </p>
      </div>
    );
  }

  const vinculo = estadoDoVinculo(contato);

  return (
    <div className="rounded-xl border border-border bg-card divide-y divide-border">
      {/* ── Identidade ────────────────────────────────────────────────── */}
      <div className="p-4">
        <h3 className="font-semibold text-sm">{contato.displayName}</h3>
        <p
          className={cn(
            "text-xs mt-1 flex items-center gap-1.5",
            vinculo.temVinculo ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground",
          )}
        >
          {vinculo.temVinculo ? (
            <BadgeCheck className="size-3" />
          ) : (
            <Link2Off className="size-3" />
          )}
          {vinculo.rotulo}
        </p>
        {vinculo.detalhe && (
          <p className="text-[11px] text-muted-foreground mt-0.5">{vinculo.detalhe}</p>
        )}

        <div className="mt-2 space-y-0.5">
          {contato.identidades.map((i) => (
            <p key={`${i.channel}-${i.externalId}`} className="text-xs text-muted-foreground">
              {i.channel}: {i.externalId}
            </p>
          ))}
        </div>

        {contato.optOut && (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
            Pediu para não ser mais contatado — nenhuma resposta é proposta para esta pessoa.
          </p>
        )}

        <Vinculo contactId={contato._id} vinculo={vinculo} />
      </div>

      {/* ── Notas internas ────────────────────────────────────────────── */}
      <NotasInternas
        contactId={contato._id}
        notas={contato.notas}
        atualizadasEm={contato.notasAtualizadasEm}
      />

      {/* ── Tarefas desta conversa ────────────────────────────────────── */}
      <TarefasDaConversa
        conversationId={conversationId}
        contactId={contato._id}
        trabalhos={conversa.trabalhos}
      />

      {/* ── Ouvidoria ─────────────────────────────────────────────────── */}
      <RegistrarSinal conversationId={conversationId} contactId={contato._id} />
    </div>
  );
}

// ─── Vínculo ─────────────────────────────────────────────────────────────────

function Vinculo({
  contactId,
  vinculo,
}: {
  contactId: Id<"adminContacts">;
  vinculo: ReturnType<typeof estadoDoVinculo>;
}) {
  const desvincular = useMutation(api.communications.desvincularContato);
  const [aberto, setAberto] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  return (
    <div className="mt-3 flex items-center gap-2 flex-wrap">
      <Button size="sm" variant="outline" className="h-8" onClick={() => setAberto(true)}>
        <Link2 className="size-3.5" /> {vinculo.temVinculo ? "Rever vínculo" : "Vincular"}
      </Button>

      {vinculo.podeDesvincular && (
        <Button
          size="sm"
          variant="ghost"
          className="h-8"
          disabled={ocupado}
          onClick={() => setConfirmando(true)}
        >
          <Link2Off className="size-3.5" /> Desvincular
        </Button>
      )}

      <VinculoDialog contactId={contactId} aberto={aberto} onFechar={() => setAberto(false)} />

      <Dialog open={confirmando} onOpenChange={setConfirmando}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Desfazer o vínculo?</DialogTitle>
            <DialogDescription>
              O contato e as conversas continuam como estão — só deixa de ser associado a
              este interessado/assinante. Fica registrado quem desfez e quando.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmando(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={ocupado}
              onClick={async () => {
                setOcupado(true);
                try {
                  await desvincular({ contactId });
                  toast.success("Vínculo desfeito.", {
                    description: "Registrado com o seu nome.",
                  });
                  setConfirmando(false);
                } catch (erro) {
                  toast.error(erroLegivel(erro));
                } finally {
                  setOcupado(false);
                }
              }}
            >
              Desvincular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Notas internas ──────────────────────────────────────────────────────────

function NotasInternas({
  contactId,
  notas,
  atualizadasEm,
}: {
  contactId: Id<"adminContacts">;
  notas?: string;
  atualizadasEm?: number;
}) {
  const definirNotas = useMutation(api.communications.definirNotas);
  const [texto, setTexto] = useState(notas ?? "");
  const [editando, setEditando] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  // Trocar de contato tem de trocar o rascunho junto — senão a nota de uma
  // pessoa aparece no campo da outra e alguém a salva ali.
  useEffect(() => {
    setTexto(notas ?? "");
    setEditando(false);
  }, [contactId, notas]);

  async function salvar() {
    setOcupado(true);
    try {
      await definirNotas({ contactId, notas: texto });
      toast.success("Nota interna salva.");
      setEditando(false);
    } catch (erro) {
      toast.error(erroLegivel(erro));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="p-4">
      <h4 className="text-xs font-medium flex items-center gap-1.5 mb-2">
        <NotebookPen className="size-3.5 text-primary" /> Notas internas
      </h4>

      {editando ? (
        <>
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={4}
            className="text-sm"
            placeholder="O que a operação precisa lembrar sobre esta pessoa."
            aria-label="Notas internas do contato"
          />
          <div className="flex items-center gap-2 mt-2">
            <Button size="sm" className="h-8" disabled={ocupado} onClick={() => void salvar()}>
              Salvar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8"
              disabled={ocupado}
              onClick={() => {
                setTexto(notas ?? "");
                setEditando(false);
              }}
            >
              Cancelar
            </Button>
          </div>
        </>
      ) : (
        <>
          {notas ? (
            <p className="text-sm whitespace-pre-wrap break-words">{notas}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nenhuma nota. Só quem opera o ALTAR vê o que for escrito aqui.
            </p>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-8 mt-2"
            onClick={() => setEditando(true)}
          >
            {notas ? "Editar" : "Escrever nota"}
          </Button>
        </>
      )}

      {atualizadasEm && !editando && (
        <p className="text-[11px] text-muted-foreground mt-1.5">
          Atualizada em {formatTimestampComHora(atualizadasEm)}
        </p>
      )}
    </div>
  );
}

// ─── Tarefas da conversa ─────────────────────────────────────────────────────

function TarefasDaConversa({
  conversationId,
  contactId,
  trabalhos,
}: {
  conversationId: Id<"communicationConversations">;
  contactId: Id<"adminContacts">;
  trabalhos: {
    _id: Id<"adminWorkItems">;
    tipo: string;
    titulo: string;
    status: string;
    venceEm?: string;
  }[];
}) {
  const criar = useMutation(api.adminWorkItems.criar);
  const [aberto, setAberto] = useState(false);
  const [tipo, setTipo] = useState<TipoDeTrabalho>("follow_up");
  const [titulo, setTitulo] = useState("");
  const [venceEm, setVenceEm] = useState("");
  const [ocupado, setOcupado] = useState(false);

  return (
    <div className="p-4">
      <h4 className="text-xs font-medium flex items-center gap-1.5 mb-2">
        <ListTodo className="size-3.5 text-primary" /> Tarefas desta conversa
      </h4>

      {trabalhos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma tarefa aberta.</p>
      ) : (
        <ul className="space-y-1.5">
          {trabalhos.map((t) => (
            <li key={t._id} className="text-sm">
              <span className="font-medium">{t.titulo}</span>
              <span className="text-xs text-muted-foreground">
                {" "}
                · {ROTULO_DO_TIPO_DE_TRABALHO[t.tipo as TipoDeTrabalho] ?? t.tipo} ·{" "}
                {ROTULO_DO_STATUS_DE_TRABALHO[t.status as StatusDeTrabalho] ?? t.status}
                {t.venceEm ? ` · vence ${formatarDiaCivil(t.venceEm)}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}

      <Button
        size="sm"
        variant="outline"
        className="h-8 mt-2"
        onClick={() => setAberto(true)}
      >
        Nova tarefa
      </Button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova tarefa da operação</DialogTitle>
            <DialogDescription>
              Fica ligada a esta conversa e a esta pessoa, com dono e prazo próprios — e
              sobrevive ao fim do atendimento.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="O que precisa ser feito"
              aria-label="Título da tarefa"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                aria-label="Tipo da tarefa"
                className={CLASSE_DO_SELECT}
                value={tipo}
                onChange={(e) => setTipo(e.target.value as TipoDeTrabalho)}
              >
                {OPCOES_DE_TIPO_DE_TRABALHO.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.rotulo}
                  </option>
                ))}
              </select>
              <Input
                type="date"
                value={venceEm}
                onChange={(e) => setVenceEm(e.target.value)}
                aria-label="Prazo da tarefa"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button
              disabled={ocupado || titulo.trim().length === 0}
              onClick={async () => {
                setOcupado(true);
                try {
                  await criar({
                    tipo,
                    titulo: titulo.trim(),
                    venceEm: venceEm || undefined,
                    conversationId,
                    contactId,
                  });
                  toast.success("Tarefa criada.");
                  setTitulo("");
                  setVenceEm("");
                  setAberto(false);
                } catch (erro) {
                  toast.error(erroLegivel(erro));
                } finally {
                  setOcupado(false);
                }
              }}
            >
              Criar tarefa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Ouvidoria ───────────────────────────────────────────────────────────────

function RegistrarSinal({
  conversationId,
  contactId,
}: {
  conversationId: Id<"communicationConversations">;
  contactId: Id<"adminContacts">;
}) {
  const registrar = useMutation(api.customerVoice.registrar);
  const [aberto, setAberto] = useState(false);
  const [tipo, setTipo] = useState<TipoDeSinal>("reclamacao");
  const [severidade, setSeveridade] = useState<Severidade | "">("");
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [ocupado, setOcupado] = useState(false);

  return (
    <div className="p-4">
      <h4 className="text-xs font-medium flex items-center gap-1.5 mb-2">
        <Megaphone className="size-3.5 text-primary" /> Ouvidoria
      </h4>
      <p className="text-xs text-muted-foreground">
        Reclamação, sugestão, bug, pedido de funcionalidade ou elogio que esta conversa
        revelou — vai para o painel de Produto com peso de recorrência.
      </p>

      <Button size="sm" variant="outline" className="h-8 mt-2" onClick={() => setAberto(true)}>
        Registrar sinal
      </Button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar sinal da Ouvidoria</DialogTitle>
            <DialogDescription>
              Registrado com o seu nome. Se já houver um sinal do mesmo tipo nesta conversa,
              isto conta mais uma ocorrência em vez de criar um segundo.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <select
                aria-label="Tipo do sinal"
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
                aria-label="Severidade"
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
              placeholder="Título curto — o que é, em uma linha"
              aria-label="Título do sinal"
            />
            <Textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={3}
              placeholder="O que a pessoa relatou, nas palavras dela sempre que possível."
              aria-label="Descrição do sinal"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button
              disabled={ocupado || titulo.trim().length === 0}
              onClick={async () => {
                setOcupado(true);
                try {
                  const r = await registrar({
                    tipo,
                    titulo: titulo.trim(),
                    descricao: descricao.trim(),
                    severidade: severidade || undefined,
                    conversationId,
                    contactId,
                  });
                  toast.success(
                    r.criado ? "Sinal registrado." : "Mais uma ocorrência do mesmo sinal.",
                  );
                  setTitulo("");
                  setDescricao("");
                  setAberto(false);
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
    </div>
  );
}
