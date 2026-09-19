import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { ConvexError } from "convex/values";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/use-debounce.ts";
import { cn } from "@/lib/utils.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Search, Sparkles } from "lucide-react";
import { termoBuscavel, validarSelecaoDeVinculo } from "@/lib/central-vinculo.ts";

// ─────────────────────────────────────────────────────────────────────────────
// VINCULAR UM CONTATO — com a lista inteira à vista
//
// Duas fontes, de propósito:
//
//   · SUGESTÕES — o que a máquina encontrou pelo telefone e se RECUSOU a
//     decidir sozinha (dois interessados com o mesmo número, por exemplo);
//   · BUSCA — o que a pessoa procura por nome, e-mail ou telefone, para o caso
//     que nenhuma sugestão cobre: quem escreveu de um aparelho novo.
//
// Vincular é uma AFIRMAÇÃO ("esta conversa é desta pessoa") e fica gravada com
// autor e data. Por isso nada aqui acontece por clique único de lista: escolhe,
// confere e confirma.
// ─────────────────────────────────────────────────────────────────────────────

function erroLegivel(erro: unknown): string {
  if (erro instanceof ConvexError) {
    const dados = erro.data as { message?: string } | undefined;
    return dados?.message ?? "Não foi possível concluir.";
  }
  return "Não foi possível concluir.";
}

export function VinculoDialog({
  contactId,
  aberto,
  onFechar,
}: {
  contactId: Id<"adminContacts">;
  aberto: boolean;
  onFechar: () => void;
}) {
  const [termo, setTermo] = useState("");
  const [termoAdiado] = useDebounce(termo, 350);
  const [interessadoId, setInteressadoId] = useState<Id<"landingLeads"> | null>(null);
  const [assinanteId, setAssinanteId] = useState<Id<"users"> | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const sugestoes = useQuery(
    api.communications.sugerirVinculos,
    aberto ? { contactId } : "skip",
  );

  const buscaValida = termoBuscavel(termoAdiado);
  const encontrados = useQuery(
    api.communications.buscarCandidatosDeVinculo,
    aberto && buscaValida ? { termo: buscaValida } : "skip",
  );

  const vincular = useMutation(api.communications.vincularContato);

  const interessados = [
    ...(sugestoes?.interessados ?? []).map((i) => ({ ...i, sugerido: true })),
    ...(encontrados?.interessados ?? [])
      .filter((i) => !(sugestoes?.interessados ?? []).some((s) => s._id === i._id))
      .map((i) => ({ ...i, sugerido: false })),
  ];

  const assinantes = [
    ...(sugestoes?.assinantes ?? []).map((a) => ({ ...a, sugerido: true })),
    ...(encontrados?.assinantes ?? [])
      .filter((a) => !(sugestoes?.assinantes ?? []).some((s) => s._id === a._id))
      .map((a) => ({ ...a, sugerido: false })),
  ];

  const erroDeSelecao = validarSelecaoDeVinculo({ interessadoId, assinanteId });

  function fechar() {
    setTermo("");
    setInteressadoId(null);
    setAssinanteId(null);
    onFechar();
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && fechar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Vincular contato</DialogTitle>
          <DialogDescription>
            Diga de quem é esta conversa. O vínculo fica gravado como decisão sua, com data
            — e pode ser desfeito depois.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Buscar por nome, e-mail ou telefone"
            className="pl-8"
            aria-label="Buscar candidatos"
          />
        </div>

        <div className="max-h-80 overflow-y-auto space-y-4">
          <Secao titulo="Interessados (landing)">
            {sugestoes === undefined ? (
              <Skeleton className="h-10 w-full" />
            ) : interessados.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {buscaValida
                  ? "Nenhum interessado encontrado."
                  : "Nenhuma sugestão automática. Busque pelo nome ou e-mail."}
              </p>
            ) : (
              interessados.map((i) => (
                <Candidato
                  key={i._id}
                  titulo={i.name}
                  detalhe={`${i.email}${"telefone" in i && i.telefone ? ` · ${i.telefone}` : ""}`}
                  sugerido={i.sugerido}
                  selecionado={interessadoId === i._id}
                  onSelecionar={() =>
                    setInteressadoId(interessadoId === i._id ? null : (i._id as Id<"landingLeads">))
                  }
                />
              ))
            )}
          </Secao>

          <Secao titulo="Assinantes">
            {sugestoes === undefined ? (
              <Skeleton className="h-10 w-full" />
            ) : assinantes.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {buscaValida
                  ? "Nenhum assinante encontrado."
                  : "Nenhuma sugestão automática. Busque pelo nome ou e-mail."}
              </p>
            ) : (
              assinantes.map((a) => (
                <Candidato
                  key={a._id}
                  titulo={a.name}
                  detalhe={`${a.email}${"telefone" in a && a.telefone ? ` · ${a.telefone}` : ""}`}
                  sugerido={a.sugerido}
                  selecionado={assinanteId === a._id}
                  onSelecionar={() =>
                    setAssinanteId(assinanteId === a._id ? null : (a._id as Id<"users">))
                  }
                />
              ))
            )}
          </Secao>
        </div>

        {erroDeSelecao && <p className="text-xs text-muted-foreground">{erroDeSelecao}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={fechar}>
            Cancelar
          </Button>
          <Button
            disabled={ocupado || erroDeSelecao !== null}
            onClick={async () => {
              setOcupado(true);
              try {
                await vincular({
                  contactId,
                  landingLeadId: interessadoId ?? undefined,
                  userId: assinanteId ?? undefined,
                });
                toast.success("Contato vinculado.", {
                  description: "Registrado com o seu nome.",
                });
                fechar();
              } catch (erro) {
                toast.error(erroLegivel(erro));
              } finally {
                setOcupado(false);
              }
            }}
          >
            Vincular
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium mb-1.5">{titulo}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Candidato({
  titulo,
  detalhe,
  sugerido,
  selecionado,
  onSelecionar,
}: {
  titulo: string;
  detalhe: string;
  sugerido: boolean;
  selecionado: boolean;
  onSelecionar: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelecionar}
      className={cn(
        "w-full text-left rounded-lg border px-3 py-2 transition-colors",
        selecionado
          ? "border-primary bg-primary/5"
          : "border-border hover:bg-muted/60",
      )}
    >
      <p className="text-sm font-medium flex items-center gap-1.5">
        {titulo}
        {sugerido && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground flex items-center gap-1">
            <Sparkles className="size-2.5" /> sugerido
          </span>
        )}
      </p>
      <p className="text-xs text-muted-foreground truncate">{detalhe}</p>
    </button>
  );
}
