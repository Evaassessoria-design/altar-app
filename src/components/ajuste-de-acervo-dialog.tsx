import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { AutoTextarea } from "@/components/ui/auto-textarea.tsx";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog.tsx";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import { abreviarUnidade } from "@/convex/lib/materiais.ts";
import { formatTimestamp } from "@/lib/safe-date.ts";
import { pecasForaDeUso } from "@/convex/lib/condicaoDoAcervo.ts";
import {
  aplicarAjuste, aplicarContagem, aplicarManutencao, baixaRespeitaManutencao,
  OPERACOES_DE_MANUTENCAO, ROTULO_DA_MANUTENCAO, ROTULO_DO_AJUSTE, rotuloDaLinhaDoHistorico,
  TIPOS_DE_AJUSTE, type OperacaoDeManutencao, type TipoDeAjuste,
} from "@/convex/lib/ajusteDeAcervo.ts";

/** O que a pessoa escolhe no diálogo: um ajuste do total, ou a manutenção. */
type Escolha = TipoDeAjuste | OperacaoDeManutencao;

const ehManutencao = (e: Escolha): e is OperacaoDeManutencao =>
  (OPERACOES_DE_MANUTENCAO as readonly string[]).includes(e);

// ─────────────────────────────────────────────────────────────────────────────
// AJUSTAR ESTOQUE — a única tela que muda a quantidade física
//
// Mostra sempre o "Antes → Depois" ANTES de confirmar. Baixa de acervo é
// decisão que custa dinheiro: a pessoa precisa ver o número que vai ficar, não
// deduzir. E a conta é feita no servidor de novo, na hora de gravar — o que
// aparece aqui é uma prévia, nunca o valor gravado.
// ─────────────────────────────────────────────────────────────────────────────
export function AjusteDeAcervoDialog({
  item,
  onClose,
  eventId,
  tipoInicial,
  quantidadeInicial,
}: {
  item: {
    _id: Id<"collectionItems">;
    nome: string;
    unidade: string;
    quantidadeTotal: number;
    /** Ausente = nenhuma peça no conserto. */
    emManutencao?: number;
    emLimpeza?: number;
    indisponivel?: number;
    emConferencia?: number;
  };
  onClose: () => void;
  /**
   * Evento de onde a baixa nasceu. So PROCEDENCIA — o ajuste nao mexe em
   * reserva, saida nem retorno daquele evento.
   */
  eventId?: Id<"events">;
  tipoInicial?: Escolha;
  /** Sugestao, nunca imposicao: a pessoa confirma o numero. */
  quantidadeInicial?: number;
}) {
  const ajustar = useMutation(api.acervo.ajustarEstoque);
  const contar = useMutation(api.acervo.registrarContagem);
  const manutencao = useMutation(api.acervo.registrarManutencao);
  const historico = useQuery(api.acervo.historicoDoItem, { collectionItemId: item._id, limite: 8 });

  const [tipo, setTipo] = useState<Escolha>(tipoInicial ?? "perda");
  const [quantidade, setQuantidade] = useState(quantidadeInicial !== undefined ? String(quantidadeInicial) : "");
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);

  const ehContagem = tipo === "acerto_inventario";
  const numero = Number(quantidade.replace(",", "."));
  const valido = Number.isFinite(numero) && quantidade.trim() !== "";

  const emConserto = item.emManutencao ?? 0;

  // Prévia — a decisão de verdade é do servidor (lib/ajusteDeAcervo.ts), que
  // roda estas MESMAS funções na hora de gravar.
  const previaBruta = !valido
    ? null
    : ehManutencao(tipo)
      ? aplicarManutencao({
          quantidadeAtual: item.quantidadeTotal, emManutencao: item.emManutencao,
          operacao: tipo, quantidade: numero, unidade: item.unidade,
        })
      : ehContagem
        ? aplicarContagem({ quantidadeAtual: item.quantidadeTotal, quantidadeContada: numero, unidade: item.unidade })
        : aplicarAjuste({ quantidadeAtual: item.quantidadeTotal, tipo, quantidade: numero, unidade: item.unidade });
  // A trava do conserto também vale na prévia: o botão não pode prometer o que
  // o servidor vai recusar.
  const conflitoComConserto =
    previaBruta?.ok && !ehManutencao(tipo)
      ? baixaRespeitaManutencao(previaBruta.quantidadeDepois, pecasForaDeUso(item))
      : null;
  const previa = conflitoComConserto
    ? { ok: false as const, motivo: conflitoComConserto }
    : previaBruta;
  const manutencaoDepois: number | undefined =
    previa?.ok && "manutencaoDepois" in previa
      ? (previa as { manutencaoDepois: number }).manutencaoDepois
      : undefined;

  const salvar = async () => {
    if (!valido) return toast.error("Informe a quantidade.");
    setSalvando(true);
    try {
      if (ehManutencao(tipo)) {
        await manutencao({
          collectionItemId: item._id, operacao: tipo, quantidade: numero,
          motivo: motivo.trim() || undefined, eventId,
        });
      } else if (ehContagem) {
        await contar({ collectionItemId: item._id, quantidadeContada: numero, motivo: motivo.trim() || undefined });
      } else {
        await ajustar({
          collectionItemId: item._id, tipo, quantidade: numero,
          motivo: motivo.trim() || undefined, eventId,
        });
      }
      toast.success("Estoque ajustado.");
      onClose();
    } catch (e) {
      toast.error(
        e instanceof ConvexError ? (e.data as { message: string }).message : "Não foi possível ajustar.",
      );
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ajustar estoque — {item.nome}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Hoje: <strong className="text-foreground">{item.quantidadeTotal} {abreviarUnidade(item.unidade)}</strong>
            {emConserto > 0 && <> · {emConserto} em manutenção</>}
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="aj-tipo">O que aconteceu</Label>
            <select id="aj-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as Escolha)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm cursor-pointer">
              <optgroup label="Estoque">
                {TIPOS_DE_AJUSTE.map((t) => (
                  <option key={t} value={t}>{ROTULO_DO_AJUSTE[t]}</option>
                ))}
              </optgroup>
              {/* A peça no conserto continua sendo da empresa: o total não
                  muda, só a disponibilidade. "Sem conserto" é o único que
                  baixa o total. */}
              <optgroup label="Manutenção">
                {OPERACOES_DE_MANUTENCAO.map((t) => (
                  <option key={t} value={t}>{ROTULO_DA_MANUTENCAO[t]}</option>
                ))}
              </optgroup>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="aj-qtd">{ehContagem ? "Quantas eu contei" : "Quantas peças"}</Label>
            <Input id="aj-qtd" inputMode="decimal" value={quantidade} placeholder="2"
              onChange={(e) => setQuantidade(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="aj-motivo">Observações</Label>
            <AutoTextarea id="aj-motivo" minRows={2} value={motivo} placeholder="Ex.: quebrou no retorno do evento"
              onChange={(e) => setMotivo(e.target.value)} />
          </div>

          {previa && (
            previa.ok ? (
              <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
                <span className="text-muted-foreground">{item.quantidadeTotal}</span>
                <span className="mx-2">→</span>
                <strong>{previa.quantidadeDepois} {abreviarUnidade(item.unidade)}</strong>
                {manutencaoDepois !== undefined && (
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    Em manutenção: {emConserto} → <strong className="text-foreground">{manutencaoDepois}</strong>
                  </span>
                )}
              </div>
            ) : (
              <p className="text-xs text-destructive">{previa.motivo}</p>
            )
          )}

          {historico && historico.length > 0 && (
            <div className="pt-1">
              <p className="text-xs font-semibold text-muted-foreground mb-1">Ajustes recentes</p>
              <ul className="space-y-1">
                {historico.map((h) => (
                  <li key={h._id} className="text-xs text-muted-foreground flex items-baseline gap-1.5">
                    {h.delta !== 0 && (
                      <span className={h.delta > 0 ? "text-green-600 dark:text-green-400" : "text-destructive"}>
                        {h.delta > 0 ? "+" : ""}{h.delta}
                      </span>
                    )}
                    <span>{rotuloDaLinhaDoHistorico(h.tipo, h)}</span>
                    {h.tipo === "condicao" ? (
                      <span className="opacity-60 truncate">
                        {h.responsavelNome && `· ${h.responsavelNome}`}
                        {h.fotoUrl && (
                          <a href={h.fotoUrl} target="_blank" rel="noreferrer" className="ml-1 underline">foto</a>
                        )}
                      </span>
                    ) : h.manutencaoAntes !== undefined && h.manutencaoDepois !== undefined ? (
                      <span className="opacity-60">(conserto {h.manutencaoAntes} → {h.manutencaoDepois})</span>
                    ) : (
                      <span className="opacity-60">({h.quantidadeAntes} → {h.quantidadeDepois})</span>
                    )}
                    {h.eventName && <span className="opacity-60 truncate">· {h.eventName}</span>}
                    <span className="ml-auto opacity-60 flex-shrink-0">{formatTimestamp(h._creationTime)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="cursor-pointer">Cancelar</Button>
          <Button disabled={salvando || !previa?.ok} onClick={() => void salvar()} className="cursor-pointer">
            {salvando ? "Salvando..." : "Confirmar ajuste"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
