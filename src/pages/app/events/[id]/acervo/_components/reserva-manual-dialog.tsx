import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { abreviarUnidade } from "@/convex/lib/materiais.ts";
import { janelaSugerida } from "@/convex/lib/acervo.ts";
import { formatEventDayOnly } from "@/lib/event-date.ts";

// ─────────────────────────────────────────────────────────────────────────────
// RESERVAR UMA PEÇA À MÃO
//
// ── O BECO SEM SAÍDA QUE ISTO FECHA ─────────────────────────────────────────
// Reservar só acontecia por "Reservar da ficha": a decoradora precisava criar
// um item de montagem, escrever a receita, cadastrar o material e vinculá-lo a
// um item de acervo — quatro passos — para dizer "vou levar 20 castiçais".
//
// Pior: quando dois itens do acervo servem o mesmo material, `reservarDaFicha`
// se recusa a escolher por ela (corretamente) e a própria tela manda
//
//     "Equivalentes no acervo: Roma, Viena. Reserve manualmente o que for usar."
//
// uma instrução para uma ação que a interface não oferecia. `acervo.reservar`
// existe, é idempotente por (evento, item) e está testada desde sempre.
//
// ── O QUE ESTA TELA NÃO DECIDE ──────────────────────────────────────────────
// Nada. Disponibilidade, conflito e déficit vêm de `acervo.disponibilidade` —
// a MESMA regra que a gravação recalcula dentro da mutation. O que aparece
// aqui é aviso, não permissão: reservar com déficit continua sendo possível,
// porque a decoradora resolve alugando ou comprando, e cortar a reserva para
// caber esconderia justamente o problema.
// ─────────────────────────────────────────────────────────────────────────────

type Props = {
  eventId: Id<"events">;
  /** Data do evento, para a janela sugerida (véspera → dia seguinte). */
  dataDoEvento: string;
  aberto: boolean;
  onClose: () => void;
};

export function ReservaManualDialog({ eventId, dataDoEvento, aberto, onClose }: Props) {
  const itens = useQuery(api.acervo.listItems, aberto ? {} : "skip");
  const reservar = useMutation(api.acervo.reservar);

  const janela = janelaSugerida(dataDoEvento);
  const [itemId, setItemId] = useState<string>("");
  const [quantidade, setQuantidade] = useState("");
  const [inicio, setInicio] = useState(janela.inicio);
  const [fim, setFim] = useState(janela.fim);
  const [salvando, setSalvando] = useState(false);

  const escolhido = (itens ?? []).find((i) => i._id === itemId);
  const quantidadeLida = Number(quantidade.replace(",", "."));
  const quantidadeValida = Number.isFinite(quantidadeLida) && quantidadeLida > 0;

  // Só consulta com item escolhido: sem ele não há o que perguntar, e uma
  // consulta com argumento vazio voltaria `null` e pareceria "sem disponível".
  const estado = useQuery(
    api.acervo.disponibilidade,
    aberto && itemId
      ? { collectionItemId: itemId as Id<"collectionItems">, eventId, inicio, fim }
      : "skip",
  );

  const fechar = () => {
    setItemId("");
    setQuantidade("");
    setInicio(janela.inicio);
    setFim(janela.fim);
    onClose();
  };

  const salvar = async () => {
    if (!itemId) return toast.error("Escolha a peça.");
    if (!quantidadeValida) return toast.error("Informe uma quantidade maior que zero.");
    setSalvando(true);
    try {
      const r = await reservar({
        collectionItemId: itemId as Id<"collectionItems">,
        eventId,
        quantidade: quantidadeLida,
        inicio,
        fim,
        origem: "manual",
      });
      toast.success(
        r.criada
          ? "Peça reservada para este evento."
          : "Reserva deste item atualizada — não foi criada uma segunda.",
      );
      if (r.deficit > 0) {
        toast.warning(
          `Faltam ${r.deficit} ${abreviarUnidade(escolhido?.unidade ?? "")}: ` +
            "a reserva foi gravada como você pediu, e o déficit fica visível na lista.",
        );
      }
      fechar();
    } catch (e) {
      toast.error(
        e instanceof ConvexError
          ? (e.data as { message: string }).message
          : "Não foi possível reservar.",
      );
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && fechar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reservar peça do acervo</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="reserva-item" className="text-xs">
              Peça
            </Label>
            <select
              id="reserva-item"
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              className="mt-1 h-10 w-full cursor-pointer rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">Escolha no seu acervo…</option>
              {(itens ?? []).map((i) => (
                <option key={i._id} value={i._id}>
                  {i.nome} ({i.quantidadeTotal} {abreviarUnidade(i.unidade)})
                </option>
              ))}
            </select>
            {itens !== undefined && itens.length === 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Seu acervo está vazio. Cadastre as peças que são suas em Acervo.
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="reserva-qtd" className="text-xs">
              Quantidade
            </Label>
            <Input
              id="reserva-qtd"
              inputMode="decimal"
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
              placeholder="20"
              className="mt-1 h-10 text-base"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="reserva-inicio" className="text-xs">
                Sai do galpão
              </Label>
              <Input
                id="reserva-inicio"
                type="date"
                value={inicio}
                onChange={(e) => setInicio(e.target.value)}
                className="mt-1 h-10"
              />
            </div>
            <div>
              <Label htmlFor="reserva-fim" className="text-xs">
                Volta até
              </Label>
              <Input
                id="reserva-fim"
                type="date"
                value={fim}
                onChange={(e) => setFim(e.target.value)}
                className="mt-1 h-10"
              />
            </div>
          </div>
          {/* A janela nasce da data do evento — véspera para montar, dia
              seguinte para recolher — porque é a operação real da decoração, e
              é ela que faz dois eventos em dias vizinhos disputarem a peça. */}
          <p className="text-xs text-muted-foreground">
            Sugerido a partir de {formatEventDayOnly(dataDoEvento)}: véspera para montar, dia
            seguinte para recolher.
          </p>

          {/* Aviso, não permissão. A conta que vale é refeita na gravação. */}
          {escolhido && estado && (
            <div className="rounded-lg bg-muted/50 p-2.5 text-xs">
              <p>
                <strong>
                  {estado.disponivel} {abreviarUnidade(escolhido.unidade)}
                </strong>{" "}
                livres nesta janela, de {escolhido.quantidadeTotal} no total.
                {estado.jaReservadoAqui > 0 && (
                  <> Este evento já tem {estado.jaReservadoAqui} reservados.</>
                )}
              </p>
              {quantidadeValida && quantidadeLida > estado.disponivel && (
                <p className="mt-1 text-amber-700 dark:text-amber-400">
                  Faltam {Math.round((quantidadeLida - estado.disponivel) * 100) / 100}. Dá para
                  reservar assim mesmo — o déficit fica à vista para você resolver alugando ou
                  comprando.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={fechar} className="cursor-pointer">
            Cancelar
          </Button>
          <Button
            onClick={() => void salvar()}
            disabled={salvando || !itemId || !quantidadeValida}
            className="cursor-pointer"
          >
            {salvando ? "Reservando…" : "Reservar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
