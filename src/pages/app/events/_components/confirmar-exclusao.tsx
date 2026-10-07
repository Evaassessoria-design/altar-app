import { useState } from "react";
import { useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { ALTERNATIVA_A_EXCLUSAO } from "@/convex/lib/exclusaoDeEvento.ts";

// ─────────────────────────────────────────────────────────────────────────────
// CONFIRMAR A EXCLUSÃO DE UM EVENTO — OU DIZER POR QUE ELA NÃO PODE ACONTECER
//
// O servidor recusa excluir evento com recebimentos registrados ou com peças
// do acervo não reconciliadas (convex/lib/exclusaoDeEvento.ts). A tela
// pergunta ANTES: com impedimento, não há botão de excluir — há o motivo, o
// caminho para resolver, e a alternativa que guarda tudo (cancelar o evento).
// Usada pela lista de eventos e pela pasta do evento.
// ─────────────────────────────────────────────────────────────────────────────

export function ConfirmarExclusaoDeEvento({
  eventId,
  onClose,
  onExcluir,
}: {
  eventId: Id<"events">;
  onClose: () => void;
  /** Exclui de fato. Erro é mostrado aqui; sucesso, quem chamou decide. */
  onExcluir: () => Promise<void>;
}) {
  const impedimentos = useQuery(api.events.impedimentosDeExclusao, { id: eventId });
  const [excluindo, setExcluindo] = useState(false);
  const impedido = (impedimentos?.length ?? 0) > 0;
  const temPecas = impedimentos?.some((f) => f.includes("Acervo")) ?? false;
  const temRecebimentos = impedimentos?.some((f) => f.includes("recebimentos")) ?? false;

  const excluir = async () => {
    setExcluindo(true);
    try {
      await onExcluir();
      onClose();
    } catch (e) {
      // Mesmo com a pergunta prévia, o servidor é quem decide: algo pode ter
      // mudado entre abrir a confirmação e clicar.
      toast.error(e instanceof ConvexError ? (e.data as { message: string }).message : "Não foi possível excluir o evento.");
    } finally {
      setExcluindo(false);
    }
  };

  return (
    <AlertDialog open onOpenChange={(o) => !o && !excluindo && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{impedido ? "Este evento não pode ser excluído" : "Excluir evento?"}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              {impedimentos === undefined ? (
                <Skeleton className="h-10 w-full" />
              ) : impedido ? (
                <>
                  <ul className="list-disc pl-5 space-y-1.5">
                    {(impedimentos ?? []).map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                  <p>{ALTERNATIVA_A_EXCLUSAO}</p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {temPecas && (
                      <Link to={`/eventos/${eventId}/acervo`} className="inline-flex items-center gap-1 text-primary hover:underline min-h-9">
                        Abrir o Acervo do evento <ArrowRight className="size-3" />
                      </Link>
                    )}
                    {temRecebimentos && (
                      <Link to={`/eventos/${eventId}/pagamentos`} className="inline-flex items-center gap-1 text-primary hover:underline min-h-9">
                        Ver Pagamentos da cliente <ArrowRight className="size-3" />
                      </Link>
                    )}
                  </div>
                </>
              ) : (
                <p>
                  Esta ação não pode ser desfeita. O evento e tudo o que é dele — briefing, checklists,
                  compras, documentos, fotos e parcelas sem recebimento — serão excluídos.
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="cursor-pointer" disabled={excluindo}>
            {impedido ? "Fechar" : "Cancelar"}
          </AlertDialogCancel>
          {!impedido && (
            <AlertDialogAction
              // `preventDefault`: o AlertDialog fecharia antes da resposta, e
              // um erro do servidor apareceria sem a janela a que se refere.
              onClick={(e) => {
                e.preventDefault();
                void excluir();
              }}
              disabled={impedimentos === undefined || excluindo}
              className="bg-destructive text-white hover:bg-destructive/90 cursor-pointer"
            >
              {excluindo ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
