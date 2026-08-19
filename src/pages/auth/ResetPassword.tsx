import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { authClient } from "@/lib/auth-client.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Página pública de redefinição de senha.
//
// Chega aqui pelo link do e-mail: o Better Auth valida o token no próprio
// callback e redireciona para cá com `?token=...`. Se o token estiver expirado
// ou já usado, ele redireciona com `?error=...` — tratado abaixo.
//
// Nenhuma senha trafega ou é guardada fora do Better Auth.
// ─────────────────────────────────────────────────────────────────────────────

const MIN_LEN = 8;

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const token = params.get("token") ?? "";
  const linkError = params.get("error");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < MIN_LEN) {
      toast.error(`A senha precisa ter ao menos ${MIN_LEN} caracteres.`);
      return;
    }
    if (password !== confirm) {
      toast.error("As senhas não conferem.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await authClient.resetPassword({ newPassword: password, token });
      if (error) {
        toast.error(
          error.message ??
            "Não foi possível redefinir a senha. O link pode ter expirado — solicite um novo.",
        );
        return;
      }
      // revokeSessionsOnPasswordReset apagou todas as sessões no servidor.
      // Limpamos o estado local de autenticação para não sobrar token órfão
      // apontando para uma sessão que não existe mais — é o que derrubava a
      // tela no ErrorBoundary quando o reset partia de uma aba já logada.
      await authClient.signOut().catch(() => {
        /* já não havia sessão válida — seguir normalmente */
      });
      setDone(true);
      toast.success("Senha redefinida! Entre com a nova senha.");
    } finally {
      setLoading(false);
    }
  };

  // Link inválido, expirado ou já utilizado.
  if (linkError || !token) {
    return (
      <Shell>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertTriangle className="size-5 text-destructive" /> Link inválido ou expirado
          </CardTitle>
          <CardDescription>
            Links de redefinição valem por 1 hora e só podem ser usados uma vez.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            className="w-full cursor-pointer"
            onClick={() => navigate("/login", { replace: true })}
          >
            Solicitar novo link
          </Button>
        </CardContent>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CheckCircle2 className="size-5 text-primary" /> Senha redefinida
          </CardTitle>
          <CardDescription>
            Por segurança, encerramos as sessões abertas nos seus outros aparelhos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            className="w-full cursor-pointer"
            onClick={() => navigate("/login", { replace: true })}
          >
            Ir para o login
          </Button>
        </CardContent>
      </Shell>
    );
  }

  return (
    <Shell>
      <form onSubmit={handleSubmit}>
        <CardHeader>
          <CardTitle className="text-lg">Criar nova senha</CardTitle>
          <CardDescription>Escolha uma senha com pelo menos {MIN_LEN} caracteres.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="new-password">Nova senha</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={MIN_LEN}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">Confirmar nova senha</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={MIN_LEN}
              placeholder="••••••••"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            {confirm.length > 0 && confirm !== password && (
              <p className="text-xs text-destructive">As senhas não conferem.</p>
            )}
          </div>
          <Button type="submit" disabled={loading} className="w-full cursor-pointer gap-1.5">
            {loading ? <Loader2 className="size-4 animate-spin" /> : null}
            Redefinir senha
          </Button>
          <p className="text-center text-sm">
            <Link to="/login" className="text-muted-foreground hover:text-foreground">
              Voltar ao login
            </Link>
          </p>
        </CardContent>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold">ALTAR</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gestão para decoradores de eventos
          </p>
        </div>
        <Card>{children}</Card>
      </div>
    </div>
  );
}
