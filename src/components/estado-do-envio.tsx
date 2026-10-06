import { AlertCircle, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";

// ─────────────────────────────────────────────────────────────────────────────
// O ENVIO, VISÍVEL
//
// Com o teto em 100 MB, um envio pode levar um minuto. As duas telas de
// documento (funil e pasta do evento) mostravam só um botão girando — e o
// erro era um toast que some em quatro segundos, levando junto o arquivo que
// a pessoa tinha escolhido: para tentar de novo, ela procurava o arquivo outra
// vez no computador.
//
// Aqui ficam as duas coisas que faltavam: QUANTO já foi, e a falha que FICA na
// tela com o botão de repetir o mesmo arquivo.
// ─────────────────────────────────────────────────────────────────────────────

export type FalhaDoEnvio = { arquivo: File; motivo: string };

export function EstadoDoEnvio({
  progresso,
  falha,
  ocupado,
  onTentarDeNovo,
  onDescartar,
}: {
  /** 0 a 1 durante o POST; `null` fora dele. */
  progresso: number | null;
  falha: FalhaDoEnvio | null;
  /** Há um envio em curso — o botão de repetir não pode disparar outro. */
  ocupado: boolean;
  onTentarDeNovo: () => void;
  onDescartar: () => void;
}) {
  if (progresso !== null) {
    const pct = Math.round(progresso * 100);
    return (
      <div className="space-y-1" role="status" aria-live="polite">
        <div
          className="h-1.5 w-full rounded-full bg-muted overflow-hidden"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label="Progresso do envio"
        >
          <div className="h-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-[11px] text-muted-foreground">
          {/* 100% do POST não é "anexado": falta o servidor registrar. Dizer
              "concluído" aqui seria a tela afirmando o que ainda não sabe. */}
          {pct < 100 ? `Enviando… ${pct}%` : "Registrando o arquivo…"} Não feche esta janela.
        </p>
      </div>
    );
  }

  if (!falha) return null;

  return (
    <div
      role="alert"
      className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2"
    >
      <p className="text-xs text-destructive flex items-start gap-1.5">
        <AlertCircle className="size-3.5 mt-0.5 flex-shrink-0" />
        <span>{falha.motivo}</span>
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={ocupado}
          onClick={onTentarDeNovo}
          className="cursor-pointer gap-1.5 h-8"
        >
          <RotateCcw className="size-3.5" /> Tentar de novo
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onDescartar}
          className="cursor-pointer gap-1.5 h-8"
        >
          <X className="size-3.5" /> Descartar
        </Button>
      </div>
    </div>
  );
}
