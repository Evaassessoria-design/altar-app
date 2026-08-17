import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Tela única de autenticação (Fase 4B) — Better Auth e-mail/senha.
// Reaproveita os componentes existentes; identidade visual do ALTAR intocada.
// Sem social login / recuperação / verificação de e-mail nesta fase (a
// arquitetura já comporta: basta habilitar no convex/auth.ts + authClient).
// ─────────────────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const navigate = useNavigate();
  const syncCurrentUser = useMutation(api.users.syncCurrentUser);
  const updateProfile = useMutation(api.users.updateProfile);
  const [loading, setLoading] = useState(false);

  // Entrar
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Criar conta
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");

  const finishAuth = async (studioName?: string) => {
    // Não bloquear a navegação no sync: sob `expectAuth`, a mutation fica em
    // espera até o token do Convex propagar (cross-domain), o que pode travar o
    // botão. Disparamos o sync em background (o <SyncUser/> global é a rede de
    // segurança) e navegamos; o Dashboard só monta sob <Authenticated>.
    void (async () => {
      try {
        await syncCurrentUser();
        if (studioName) await updateProfile({ studioName });
      } catch {
        /* SyncUser global refaz o vínculo quando o Convex autenticar */
      }
    })();
    navigate("/dashboard", { replace: true });
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await authClient.signIn.email({
        email: loginEmail.trim(),
        password: loginPassword,
      });
      if (error) {
        toast.error(error.message ?? "E-mail ou senha inválidos");
        return;
      }
      await finishAuth();
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await authClient.signUp.email({
        email: signupEmail.trim(),
        password: signupPassword,
        name: name.trim(),
      });
      if (error) {
        toast.error(error.message ?? "Erro ao criar conta");
        return;
      }
      await finishAuth(company.trim() || undefined);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold">ALTAR</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gestão para decoradores de eventos
          </p>
        </div>

        <Card>
          <Tabs defaultValue="entrar">
            <CardHeader className="pb-2">
              <TabsList className="w-full">
                <TabsTrigger value="entrar" className="flex-1 cursor-pointer">
                  Entrar
                </TabsTrigger>
                <TabsTrigger value="criar" className="flex-1 cursor-pointer">
                  Criar conta
                </TabsTrigger>
              </TabsList>
            </CardHeader>

            <TabsContent value="entrar">
              <form onSubmit={handleLogin}>
                <CardHeader className="pt-2 pb-4">
                  <CardTitle className="text-lg">Bem-vindo de volta</CardTitle>
                  <CardDescription>Entre com seu e-mail e senha.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="login-email">E-mail</Label>
                    <Input
                      id="login-email"
                      type="email"
                      autoComplete="email"
                      required
                      placeholder="voce@empresa.com.br"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="login-password">Senha</Label>
                    <Input
                      id="login-password"
                      type="password"
                      autoComplete="current-password"
                      required
                      placeholder="••••••••"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                    />
                  </div>
                  <Button type="submit" disabled={loading} className="w-full cursor-pointer">
                    {loading ? <Loader2 className="size-4 animate-spin" /> : null}
                    Entrar
                  </Button>
                </CardContent>
              </form>
            </TabsContent>

            <TabsContent value="criar">
              <form onSubmit={handleSignup}>
                <CardHeader className="pt-2 pb-4">
                  <CardTitle className="text-lg">Crie sua conta</CardTitle>
                  <CardDescription>14 dias de teste grátis. Sem cartão.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="signup-name">Nome</Label>
                    <Input
                      id="signup-name"
                      autoComplete="name"
                      required
                      placeholder="Seu nome"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="signup-company">Empresa</Label>
                    <Input
                      id="signup-company"
                      autoComplete="organization"
                      placeholder="Nome do seu estúdio/empresa"
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="signup-email">E-mail</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      autoComplete="email"
                      required
                      placeholder="voce@empresa.com.br"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="signup-password">Senha</Label>
                    <Input
                      id="signup-password"
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={8}
                      placeholder="Mínimo 8 caracteres"
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                    />
                  </div>
                  <Button type="submit" disabled={loading} className="w-full cursor-pointer">
                    {loading ? <Loader2 className="size-4 animate-spin" /> : null}
                    Criar conta
                  </Button>
                </CardContent>
              </form>
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
