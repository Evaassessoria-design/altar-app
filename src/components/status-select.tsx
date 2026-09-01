import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils.ts";

// ─────────────────────────────────────────────────────────────────────────────
// SELETOR DE SITUAÇÃO EM LINHA
//
// Usado onde mudar a situação é o gesto mais frequente (compras, carregamento):
// precisa caber na linha, mostrar cor e trocar em um clique.
//
// ── POR QUE NÃO UM `<select>` "pílula" CRU ──────────────────────────────────
// A primeira versão era `<select>` com `border-0`, `rounded-full` e fundo
// colorido. Isso é frágil: o Safari impõe a própria aparência a selects sem
// borda e ignora boa parte do estilo, e a seta nativa continua desenhada
// DENTRO da pílula, sobrepondo o texto em algumas plataformas.
//
// A correção é a mínima que resolve, sem trocar de componente: `appearance-none`
// desliga o desenho nativo (suportado por todos os navegadores atuais,
// incluindo Safari), a seta vira um ícone nosso, e a cor passa a ser um tom de
// fundo COM borda — que é o padrão que o resto do app já usa em `<select>`.
//
// Continua sendo um `<select>` nativo de propósito: no celular ele abre o
// seletor do sistema operacional, que é mais rápido de operar com uma mão do
// que um menu customizado.
// ─────────────────────────────────────────────────────────────────────────────

export type StatusOption<T extends string> = { value: T; label: string };

export function StatusSelect<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  tone,
  className,
}: {
  value: T;
  options: readonly StatusOption<T>[];
  onChange: (value: T) => void;
  /** Obrigatório: o controle não tem rótulo visível ao lado. */
  ariaLabel: string;
  /** Classes de cor do estado atual (fundo + texto + borda). */
  tone: string;
  className?: string;
}) {
  return (
    <div className={cn("relative inline-flex flex-shrink-0", className)}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        aria-label={ariaLabel}
        className={cn(
          "appearance-none h-7 rounded-full border pl-2.5 pr-6 text-xs font-medium cursor-pointer",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
          "max-w-[9.5rem] truncate",
          tone,
        )}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {/* Seta própria: a nativa some com `appearance-none`. `pointer-events-none`
          para o clique continuar chegando no select por baixo. */}
      <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 size-3 opacity-60" />
    </div>
  );
}
