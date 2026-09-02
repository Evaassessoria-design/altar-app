import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { ehFalhaDeCarregamentoDeTela } from "@/lib/falha-de-tela.ts";

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

  /**
   * Recarrega a pagina inteira.
   *
   * E a UNICA saida quando o pedaco da tela nao chegou: `React.lazy` guarda a
   * promessa rejeitada, entao um reset suave renderiza o mesmo erro na hora.
   * Recarregar busca o index.html novo, e com ele os nomes de arquivo certos.
   */
  private recarregar = () => window.location.reload();

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const screen = this.props.variant === "screen";
    // Tela que nao chegou e um problema DIFERENTE de codigo que quebrou, e
    // pede outra saida — ver lib/falha-de-tela.ts.
    const naoChegou = ehFalhaDeCarregamentoDeTela(error);

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
            {naoChegou ? "Esta tela não carregou" : "Algo deu errado"}
          </h1>
          <p className="mb-5 text-sm text-muted-foreground leading-relaxed">
            {naoChegou
              ? "Pode ser uma atualização do ALTAR ou uma queda de internet. Recarregar resolve — sua sessão continua ativa."
              : "Não foi possível carregar esta parte do ALTAR. Isso pode ser temporário — sua sessão continua ativa."}
          </p>
          {/* A mensagem tecnica so aparece quando pode ajudar. "Failed to fetch
              dynamically imported module" nao diz nada a quem esta montando um
              evento — e continua no console para quem for depurar. */}
          {!naoChegou && (
            <p className="mb-6 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground break-words">
              {error.message || "Erro desconhecido"}
            </p>
          )}
          <Button
            onClick={naoChegou ? this.recarregar : this.reset}
            className="cursor-pointer gap-2"
          >
            <RefreshCw className="size-4" />
            {naoChegou ? "Recarregar" : "Tentar novamente"}
          </Button>
        </div>
      </div>
    );
  }
}
