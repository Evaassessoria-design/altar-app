import { useMemo, useState, type FormEvent } from "react";
import { motion } from "motion/react";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api.js";
import { SignInButton } from "@/components/ui/signin.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  CalendarDays,
  Users,
  ShoppingCart,
  BarChart3,
  CheckSquare,
  Sparkles,
  Star,
  ArrowRight,
  Flower2,
  ClipboardList,
} from "lucide-react";

const features = [
  {
    icon: CalendarDays,
    title: "Gestão de Eventos",
    description:
      "Centralize todos os seus eventos com dados do cliente, status, datas e orçamentos em um só lugar.",
  },
  {
    icon: ClipboardList,
    title: "Briefing Completo",
    description:
      "Questionário com 61 campos organizados por seção para capturar todos os detalhes do evento.",
  },
  {
    icon: Sparkles,
    title: "Inteligência Artificial",
    description:
      "Faça upload do contrato e a IA preenche o briefing automaticamente. Gere plantas baixas profissionais.",
  },
  {
    icon: CheckSquare,
    title: "Checklist de Carregamento",
    description:
      "Controle cada item do pré e pós-evento com fotos, evitando perdas e esquecimentos.",
  },
  {
    icon: ShoppingCart,
    title: "Lista de Compras",
    description:
      "Organize compras por categoria, fornecedor e status. Anexe pedidos em PDF ou imagem.",
  },
  {
    icon: Users,
    title: "Gestão de Equipe",
    description:
      "Escale funcionários por evento com funções, horários e contatos. Notifique a equipe com um toque.",
  },
  {
    icon: BarChart3,
    title: "Financeiro",
    description:
      "Dashboard com faturamento, receitas, despesas e lucro. Gráficos de crescimento mensal.",
  },
  {
    icon: Flower2,
    title: "Funil de Vendas",
    description:
      "Kanban com 4 etapas: Contato Inicial, Orçamento Enviado, Contratado e Descartado.",
  },
];

const credibility = [
  {
    icon: Flower2,
    title: "Nascido de eventos reais",
    description:
      "Cada funcionalidade existe porque resolveu um problema vivido na operação: briefing extenso, carregamento, equipe, financeiro.",
  },
  {
    icon: Users,
    title: "Feito para a rotina de quem gere eventos",
    description:
      "Pensado no fluxo real de uma empresa de decoração de eventos — não em um modelo genérico de gestão adaptado às pressas.",
  },
  {
    icon: Sparkles,
    title: "Tecnologia com propósito",
    description:
      "IA e automação aplicadas onde economizam horas do seu trabalho — sem substituir o seu olhar.",
  },
];

const primaryCta =
  "bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer px-8 py-4 rounded-xl text-base font-semibold transition-colors inline-flex items-center gap-2 shadow-lg shadow-primary/20";

const secondaryCta =
  "bg-card text-foreground border border-border hover:border-primary/40 cursor-pointer px-8 py-4 rounded-xl text-base font-semibold transition-colors inline-flex items-center gap-2";

export default function Index() {
  // O cliente reativo do app usa `expectAuth: true` e segura chamadas até
  // haver login. Como a landing é pública (visitante anônimo), a captura de
  // leads usa um cliente HTTP one-shot, sem o gate de autenticação.
  const convexHttp = useMemo(
    () => new ConvexHttpClient(import.meta.env.VITE_CONVEX_URL as string),
    [],
  );
  const [intent, setIntent] = useState<"demo" | "beta">("demo");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );

  async function handleLeadSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    setStatus("sending");
    try {
      await convexHttp.mutation(api.landingLeads.submit, {
        name: name.trim(),
        email: email.trim(),
        whatsapp: whatsapp.trim() || undefined,
        intent,
      });
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/icon/icon-192.png" alt="Altar" className="size-8 rounded-xl" />
            <span className="text-2xl font-bold tracking-tight text-foreground">
              ALTAR
            </span>
          </div>
          <div className="flex items-center gap-3">
            <AuthLoading>
              <Skeleton className="h-9 w-24" />
            </AuthLoading>
            <Unauthenticated>
              <SignInButton className="bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer px-5 py-2 rounded-lg text-sm font-medium transition-colors">
                Entrar
              </SignInButton>
            </Unauthenticated>
            <Authenticated>
              <a
                href="/dashboard"
                className="bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer px-5 py-2 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2"
              >
                Acessar App <ArrowRight className="size-4" />
              </a>
            </Authenticated>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative pt-32 pb-20 px-4 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/10 pointer-events-none" />
        <div className="max-w-4xl mx-auto text-center relative">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
          >
            <span className="inline-block bg-primary/10 text-primary text-sm font-medium px-4 py-1.5 rounded-full mb-6">
              Para empresas de decoração de eventos
            </span>
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-balance mb-6 leading-tight">
              Cresça sua empresa sem perder o{" "}
              <span className="text-primary">padrão que construiu sua reputação</span>
              .
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8 text-balance">
              Sua empresa já entrega eventos impecáveis. Agora ela precisa operar
              com a mesma excelência. O ALTAR organiza briefing, equipe, compras e
              financeiro em uma operação previsível — do primeiro contato à
              entrega — para o seu negócio crescer com consistência.
            </p>
            <div className="inline-flex items-center gap-3 rounded-full border border-border bg-card/60 px-5 py-2.5 mb-10">
              <Flower2 className="size-4 text-primary flex-shrink-0" />
              <span className="text-sm text-muted-foreground">
                Nascido da operação real da{" "}
                <span className="font-semibold text-foreground">
                  Casando no Interior
                </span>{" "}
                — criado por quem vive a gestão de eventos, não por uma software
                house.
              </span>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Unauthenticated>
                <a
                  href="#agendar"
                  onClick={() => setIntent("demo")}
                  className={primaryCta}
                >
                  Solicitar um diagnóstico <ArrowRight className="size-5" />
                </a>
                <a
                  href="#agendar"
                  onClick={() => setIntent("beta")}
                  className={secondaryCta}
                >
                  Entrar na Lista Beta
                </a>
              </Unauthenticated>
              <Authenticated>
                <a href="/dashboard" className={primaryCta}>
                  Acessar meu painel <ArrowRight className="size-5" />
                </a>
              </Authenticated>
            </div>
            <p className="text-sm text-muted-foreground mt-4">
              Diagnóstico gratuito da sua operação • Sem compromisso
            </p>
          </motion.div>
        </div>

        {/* Hero visual */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.3, ease: "easeOut" }}
          className="mt-16 max-w-5xl mx-auto"
        >
          <div className="bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">
            <div className="bg-primary/10 px-6 py-3 flex items-center gap-2 border-b border-border">
              <div className="size-3 rounded-full bg-primary/40" />
              <div className="size-3 rounded-full bg-primary/30" />
              <div className="size-3 rounded-full bg-primary/20" />
              <span className="ml-3 text-xs text-muted-foreground font-medium">
                ALTAR — Dashboard
              </span>
            </div>
            <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Eventos Ativos", value: "12" },
                { label: "Faturamento", value: "R$ 48.000" },
                { label: "Equipe", value: "8 membros" },
                { label: "Checklists", value: "94% ok" },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="bg-background rounded-xl p-4 border border-border"
                >
                  <p className="text-xs text-muted-foreground mb-1">
                    {stat.label}
                  </p>
                  <p className="text-xl font-bold text-foreground">
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </section>

      {/* Features */}
      <section className="py-20 px-4 bg-card/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Tudo que você precisa para{" "}
              <span className="text-primary">crescer</span>
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Ferramentas pensadas para negócios de eventos que querem sair do
              operacional e crescer com consistência.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.07, ease: "easeOut" }}
                className="bg-card rounded-xl p-6 border border-border hover:border-primary/30 hover:shadow-md transition-all cursor-default"
              >
                <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <feature.icon className="size-5 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
          <div className="mt-12 text-center">
            <a
              href="#agendar"
              onClick={() => setIntent("demo")}
              className={primaryCta}
            >
              Solicitar um diagnóstico <ArrowRight className="size-5" />
            </a>
          </div>
        </div>
      </section>

      {/* Criado por quem vive esse mercado */}
      <section className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">
              Criado por quem vive esse mercado
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              O ALTAR não nasceu em uma software house. Nasceu da experiência
              prática da Casando no Interior — empresa especializada em
              assessoria e gestão de casamentos no interior de São Paulo. Cada
              funcionalidade veio de uma necessidade real da operação e, depois
              de amadurecer nos casamentos, evoluiu para atender empresas de
              eventos em geral.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {credibility.map((item, i) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1, ease: "easeOut" }}
                className="bg-card rounded-xl p-6 border border-border"
              >
                <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <item.icon className="size-5 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">
                  {item.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {item.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 px-4 bg-card/50">
        <div className="max-w-lg mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">
            Depois do diagnóstico, o caminho fica claro
          </h2>
          <p className="text-muted-foreground mb-10">
            O diagnóstico define o que a sua empresa precisa primeiro. A
            plataforma é o passo seguinte — uma assinatura, acesso completo, sem
            surpresas.
          </p>
          <div className="bg-card rounded-2xl border-2 border-primary p-8 shadow-lg">
            <div className="inline-block bg-primary/10 text-primary text-xs font-semibold px-3 py-1 rounded-full mb-4">
              14 dias grátis
            </div>
            <div className="mb-2">
              <span className="text-5xl font-bold">R$ 79</span>
              <span className="text-xl text-muted-foreground">,90</span>
              <span className="text-muted-foreground">/mês</span>
            </div>
            <p className="text-sm text-muted-foreground mb-8">
              Sem taxa de adesão. Cancele quando quiser.
            </p>
            <ul className="text-sm text-left space-y-3 mb-8">
              {[
                "Eventos ilimitados",
                "Briefing digital completo (61 campos)",
                "Checklist de carregamento com fotos",
                "Gestão de equipe e compras",
                "Dashboard financeiro",
                "Funil de vendas Kanban",
                "IA para leitura de contratos",
                "Geração de planta baixa por IA",
                "Exportação de relatórios em PDF",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <CheckSquare className="size-4 text-primary flex-shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <Unauthenticated>
              <a
                href="#agendar"
                onClick={() => setIntent("demo")}
                className="block w-full bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer py-4 rounded-xl text-base font-semibold transition-colors text-center"
              >
                Solicitar um diagnóstico
              </a>
              <a
                href="#agendar"
                onClick={() => setIntent("beta")}
                className="inline-block mt-4 text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                Ainda não está pronto? Entre na Lista Beta →
              </a>
            </Unauthenticated>
            <Authenticated>
              <a
                href="/dashboard"
                className="block w-full bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer py-4 rounded-xl text-base font-semibold transition-colors text-center"
              >
                Acessar painel
              </a>
            </Authenticated>
          </div>
        </div>
      </section>

      {/* Captura de leads — diagnóstico / Lista Beta */}
      <section id="agendar" className="py-20 px-4">
        <div className="max-w-lg mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">
            Comece por um diagnóstico da sua operação
          </h2>
          <p className="text-muted-foreground mb-10">
            Solicite um diagnóstico gratuito — a primeira etapa da nossa reunião
            consultiva. Ou entre na Lista Beta para acompanhar as novidades sem
            compromisso.
          </p>

          {status === "sent" ? (
            <div className="bg-card rounded-2xl border border-border p-8 shadow-lg text-center">
              <CheckSquare className="size-8 text-primary mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">
                {intent === "demo"
                  ? "Diagnóstico solicitado!"
                  : "Você está na Lista Beta!"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {intent === "demo"
                  ? "Recebemos seu pedido. Entraremos em contato em breve para agendar o diagnóstico da sua operação."
                  : "Obrigado pelo interesse. Você receberá as novidades do ALTAR em primeira mão."}
              </p>
            </div>
          ) : (
            <form
              onSubmit={handleLeadSubmit}
              className="bg-card rounded-2xl border border-border p-8 shadow-lg text-left space-y-4"
            >
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setIntent("demo")}
                  className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
                    intent === "demo"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/30"
                  }`}
                >
                  Quero um diagnóstico
                </button>
                <button
                  type="button"
                  onClick={() => setIntent("beta")}
                  className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
                    intent === "beta"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/30"
                  }`}
                >
                  Entrar na Lista Beta
                </button>
              </div>

              <div>
                <label
                  htmlFor="lead-name"
                  className="block text-sm font-medium mb-1.5"
                >
                  Nome
                </label>
                <input
                  id="lead-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Seu nome"
                  className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              <div>
                <label
                  htmlFor="lead-email"
                  className="block text-sm font-medium mb-1.5"
                >
                  E-mail
                </label>
                <input
                  id="lead-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@empresa.com.br"
                  className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              <div>
                <label
                  htmlFor="lead-whatsapp"
                  className="block text-sm font-medium mb-1.5"
                >
                  WhatsApp{" "}
                  <span className="text-muted-foreground font-normal">
                    (opcional)
                  </span>
                </label>
                <input
                  id="lead-whatsapp"
                  type="tel"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="(11) 99999-9999"
                  className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              {status === "error" && (
                <p className="text-sm text-destructive">
                  Não foi possível enviar. Tente novamente.
                </p>
              )}

              <button
                type="submit"
                disabled={status === "sending"}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer py-4 rounded-xl text-base font-semibold transition-colors disabled:opacity-60"
              >
                {status === "sending"
                  ? "Enviando..."
                  : intent === "demo"
                    ? "Solicitar um diagnóstico"
                    : "Entrar na Lista Beta"}
              </button>
            </form>
          )}

          <p className="text-xs text-muted-foreground mt-4">
            Sem spam. Seus dados são usados apenas para contato sobre o ALTAR.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-4 border-t border-border">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="/icon/icon-192.png" alt="Altar" className="size-8 rounded-xl" />
            <span className="text-xl font-bold tracking-tight">ALTAR</span>
          </div>
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} Altar. Todos os direitos reservados.
          </p>
          <p className="text-sm text-muted-foreground">
            Feito para empresas de decoração de eventos, pela Casando no Interior
          </p>
        </div>
      </footer>
    </div>
  );
}
