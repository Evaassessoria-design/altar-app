import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { formatEventDayOnly } from "@/lib/event-date.ts";

// ─────────────────────────────────────────────────────────────────────────────
// DE ONDE A PROPOSTA NASCE
//
// De uma OPORTUNIDADE do funil (ainda não há evento) ou de um EVENTO já
// criado. Nunca do nada: uma proposta sem destinatário não teria de quem
// falar, e os dados do cliente seriam redigitados.
//
// A escolha é explícita porque as duas origens existem de verdade na operação
// — antes e depois do fechamento — e adivinhar qual delas vale produziria a
// proposta pendurada no lugar errado.
// ─────────────────────────────────────────────────────────────────────────────

type Props = {
  onClose: () => void;
  onCriar: (args: { leadId?: Id<"leads">; eventId?: Id<"events"> }) => Promise<void>;
};

export function NovaPropostaDialog({ onClose, onCriar }: Props) {
  const leads = useQuery(api.funil.listLeads, {});
  const eventos = useQuery(api.events.list, {});
  const [origem, setOrigem] = useState("");
  const [salvando, setSalvando] = useState(false);

  const criar = async () => {
    if (!origem) return;
    const [tipo, id] = origem.split(":");
    setSalvando(true);
    try {
      await onCriar(
        tipo === "lead"
          ? { leadId: id as Id<"leads"> }
          : { eventId: id as Id<"events"> },
      );
    } finally {
      setSalvando(false);
    }
  };

  const carregando = leads === undefined || eventos === undefined;
  const vazio = !carregando && (leads?.length ?? 0) === 0 && (eventos?.length ?? 0) === 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nova proposta</DialogTitle>
        </DialogHeader>

        {carregando ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : vazio ? (
          <p className="text-sm text-muted-foreground">
            A proposta nasce de uma oportunidade do Funil ou de um evento. Cadastre uma das
            duas primeiro — os dados da cliente vêm de lá, para você não digitar de novo.
          </p>
        ) : (
          <div>
            <Label htmlFor="proposta-origem" className="text-xs">
              Para quem é esta proposta?
            </Label>
            <select
              id="proposta-origem"
              value={origem}
              onChange={(e) => setOrigem(e.target.value)}
              className="mt-1 h-10 w-full cursor-pointer rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">Escolha a oportunidade ou o evento…</option>
              {(leads ?? []).length > 0 && (
                <optgroup label="Oportunidades do funil">
                  {(leads ?? []).map((l) => (
                    <option key={l._id} value={`lead:${l._id}`}>
                      {l.clientName}
                      {l.eventDate ? ` — ${formatEventDayOnly(l.eventDate)}` : ""}
                    </option>
                  ))}
                </optgroup>
              )}
              {(eventos ?? []).length > 0 && (
                <optgroup label="Eventos">
                  {(eventos ?? []).map((e) => (
                    <option key={e._id} value={`evento:${e._id}`}>
                      {e.name} — {formatEventDayOnly(e.date)}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <p className="mt-2 text-xs text-muted-foreground">
              Nome da cliente, tipo, data e local vêm de lá — e ficam copiados na proposta,
              para que renomear a oportunidade depois não reescreva o que você apresentou.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="cursor-pointer">
            Cancelar
          </Button>
          <Button
            onClick={() => void criar()}
            disabled={salvando || !origem}
            className="cursor-pointer"
          >
            {salvando ? "Criando…" : "Criar proposta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
