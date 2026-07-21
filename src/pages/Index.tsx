import { motion } from "motion/react";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { SignInButton } from "@/components/ui/signin.tsx";
import { Button } from "@/components/ui/button.tsx";
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

const testimonials = [
  {
    name: "Ana Paula Silva",
    role: "Decoradora de Festas",
    text: "O Altar transformou meu negócio. Antes tudo era em cadernos e planilhas. Agora tenho tudo organizado em um app lindo e fácil.",
    stars: 5,
  },
  {
    name: "Carla Mendes",
    role: "Studio Decor & Eventos",
    text: "A funcionalidade de IA que lê o contrato e preenche o briefing sozinha salvou horas do meu trabalho. Simplesmente incrível.",
    stars: 5,
  },
  {
    name: "Fernanda Costa",
    role: "Casamentos & Formaturas",
    text: "O checklist de carregamento com fotos é o que eu precisava. Nunca mais esqueci um item importante em casa!",
    stars: 5,
  },
];

export default function Index() {
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
              Plataforma para Decoradores de Eventos
            </span>
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-balance mb-6 leading-tight">
              Gerencie seus eventos{" "}
              <span className="text-primary">com elegância</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10 text-balance">
              Do primeiro contato até a execução do evento. Briefing digital,
              checklist com fotos, equipe, financeiro e inteligência artificial —
              tudo em um só app.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Unauthenticated>
                <SignInButton className="bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer px-8 py-4 rounded-xl text-base font-semibold transition-colors inline-flex items-center gap-2 shadow-lg shadow-primary/20">
                  Começar grátis por 14 dias <ArrowRight className="size-5" />
                </SignInButton>
              </Unauthenticated>
              <Authenticated>
                <a
                  href="/dashboard"
                  className="bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer px-8 py-4 rounded-xl text-base font-semibold transition-colors inline-flex items-center gap-2 shadow-lg shadow-primary/20"
                >
                  Acessar meu painel <ArrowRight className="size-5" />
                </a>
              </Authenticated>
              <p className="text-sm text-muted-foreground">
                Sem cartão de crédito • 14 dias grátis
              </p>
            </div>
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
              Ferramentas pensadas especialmente para decoradores de eventos que
              querem profissionalizar seu negócio.
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
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">
              Amado por decoradores em todo o Brasil
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <motion.div
                key={t.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1, ease: "easeOut" }}
                className="bg-card rounded-xl p-6 border border-border"
              >
                <div className="flex gap-1 mb-3">
                  {Array.from({ length: t.stars }).map((_, j) => (
                    <Star
                      key={j}
                      className="size-4 text-primary fill-primary"
                    />
                  ))}
                </div>
                <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                  {'"'}{t.text}{'"'}
                </p>
                <div>
                  <p className="font-semibold text-sm">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.role}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 px-4 bg-card/50">
        <div className="max-w-lg mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">Preço simples e justo</h2>
          <p className="text-muted-foreground mb-10">
            Uma assinatura. Acesso completo a todas as funcionalidades.
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
              <SignInButton className="w-full bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer py-4 rounded-xl text-base font-semibold transition-colors">
                Começar 14 dias grátis
              </SignInButton>
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
            Feito para decoradores de eventos
          </p>
        </div>
      </footer>
    </div>
  );
}
