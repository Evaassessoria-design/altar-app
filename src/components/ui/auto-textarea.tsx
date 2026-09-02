import * as React from "react";
import { cn } from "@/lib/utils";
import { alturaDoCampo } from "@/lib/auto-resize.ts";

// ─────────────────────────────────────────────────────────────────────────────
// CAMPO DE TEXTO QUE CRESCE PARA BAIXO
//
// Para texto livre: observação, briefing, descrição, alinhamento. Começa
// compacto, cresce enquanto se escreve, e para de crescer num teto — depois
// dele, rola por dentro. Enter quebra linha, como em qualquer caixa de
// mensagem.
//
// Por que não só `field-sizing: content` do CSS: ele não tem teto, e um campo
// que cresce sem limite empurra o botão "Salvar" para fora do modal no celular.
// A classe `field-sizing-fixed` desliga o comportamento nativo justamente para
// os dois não brigarem pela altura.
//
// Funciona com react-hook-form: `register()` devolve um `ref` próprio, então o
// componente compõe os dois refs em vez de sobrescrever um deles — sem isso o
// formulário perde o campo.
// ─────────────────────────────────────────────────────────────────────────────

export type AutoTextareaProps = React.ComponentProps<"textarea"> & {
  /** Altura inicial, em linhas. */
  minRows?: number;
  /** Teto; a partir daqui rola por dentro. */
  maxRows?: number;
};

export const AutoTextarea = React.forwardRef<HTMLTextAreaElement, AutoTextareaProps>(
  function AutoTextarea({ className, minRows = 2, maxRows = 10, onChange, ...props }, refExterno) {
    const interno = React.useRef<HTMLTextAreaElement | null>(null);

    const guardarRef = React.useCallback(
      (el: HTMLTextAreaElement | null) => {
        interno.current = el;
        if (typeof refExterno === "function") refExterno(el);
        else if (refExterno) refExterno.current = el;
      },
      [refExterno],
    );

    const ajustar = React.useCallback(() => {
      const el = interno.current;
      if (!el) return;

      const cs = window.getComputedStyle(el);
      const num = (v: string) => Number.parseFloat(v) || 0;

      // Zera antes de medir: sem isso `scrollHeight` nunca diminui e o campo
      // fica preso na maior altura que já teve, mesmo depois de apagar tudo.
      el.style.height = "auto";

      const { altura, overflowY } = alturaDoCampo({
        scrollHeight: el.scrollHeight,
        lineHeight: num(cs.lineHeight),
        padding: num(cs.paddingTop) + num(cs.paddingBottom),
        border: num(cs.borderTopWidth) + num(cs.borderBottomWidth),
        minRows,
        maxRows,
      });

      el.style.height = `${altura}px`;
      el.style.overflowY = overflowY;
    }, [minRows, maxRows]);

    // Sem lista de dependências de propósito: roda a cada render. Cobre o texto
    // que já veio salvo ao reabrir o formulário, o valor trocado por fora e o
    // texto colado de uma vez — casos em que não há evento de digitação.
    React.useLayoutEffect(ajustar);

    return (
      <textarea
        {...props}
        ref={guardarRef}
        rows={minRows}
        onChange={(e) => {
          ajustar();
          onChange?.(e);
        }}
        className={cn(
          // `field-sizing-fixed`: a altura é nossa, não do navegador.
          // `resize-none`: já cresce sozinho; alça de arrastar só confunde.
          // `break-words`: palavra gigante quebra em vez de esticar o campo.
          "flex w-full field-sizing-fixed resize-none overflow-x-hidden break-words rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:ring-destructive/40",
          className,
        )}
      />
    );
  },
);
