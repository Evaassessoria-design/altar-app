import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";

// ─────────────────────────────────────────────────────────────────────────────
// ErrorBoundary do ALTAR.
// Captura erros de renderização (ex.: uma query de página que lança ConvexError
// numa janela transitória de auth) e evita a "tela branca". NÃO esconde erros
// reais: registra no console. Oferece "Tentar novamente" (reset suave, sem tocar
// na sessão) e se auto-recupera quando `resetKeys` muda (ex.: troca de rota).
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  children: ReactNode;
  /** Quando qualquer valor aqui muda, o boundary limpa o erro (ex.: [pathname]). */
  resetKeys?: unknown[];
  /** "page" = ocupa a área de conteúdo; "screen" = tela cheia (fallback global). */
  variant?: "page" | "screen";
}

interface State {
  error: Error | null;
}

function keysChanged(a: unknown[] = [], b: unknown[] = []): boolean {
  if (a.length !== b.length) return true;
  return a.some((v, i) => !Object.is(v, b[i]));
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Visibilidade dos erros reais para depuração — não silenciar.
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    // Recuperação automática ao navegar: a sessão permanece intacta.
    if (this.state.error && keysChanged(prev.resetKeys, this.props.resetKeys)) {
      this.setState({ error: null });
    }
  }

  private reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const screen = this.props.variant === "screen";

    return (
      <div
        className={
          (screen ? "min-h-screen" : "min-h-[60vh]") +
          " flex items-center justify-center p-6"
        }
      >
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="size-7 text-destructive" />
          </div>
          <h1 className="mb-2 text-xl font-bold text-foreground">
            Algo deu errado
          </h1>
          <p className="mb-5 text-sm text-muted-foreground leading-relaxed">
            Não foi possível carregar esta parte do ALTAR. Isso pode ser
            temporário — sua sessão continua ativa.
          </p>
          <p className="mb-6 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground break-words">
            {error.message || "Erro desconhecido"}
          </p>
          <Button onClick={this.reset} className="cursor-pointer gap-2">
            <RefreshCw className="size-4" />
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }
}
