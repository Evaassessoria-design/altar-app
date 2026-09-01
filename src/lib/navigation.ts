// ─────────────────────────────────────────────────────────────────────────────
// NAVEGAÇÃO DO APLICATIVO
//
// Fora do componente para poder ser conferida por teste: uma rota registrada em
// App.tsx que não aparece em nenhuma lista daqui é uma tela órfã — alcançável
// só digitando a URL.
//
// Foi o que acontecia com `/dashboard`: o login mandava para lá, mas assim que
// a pessoa navegasse para qualquer outra tela não havia mais NENHUM caminho de
// volta. A porta de entrada do produto era, na prática, um beco sem saída.
// ─────────────────────────────────────────────────────────────────────────────

export type NavItem = { to: string; label: string };

/** Menu lateral (desktop). Ordem = ordem do dia de trabalho. */
export const NAV_ITEMS: readonly NavItem[] = [
  { to: "/dashboard", label: "Início" },
  { to: "/eventos", label: "Eventos" },
  { to: "/fornecedores", label: "Fornecedores" },
  { to: "/equipe", label: "Equipe" },
  { to: "/compras", label: "Compras" },
  { to: "/financeiro", label: "Financeiro" },
  { to: "/funil", label: "Funil" },
] as const;

/** Barra inferior (mobile). Subconjunto do que se usa em movimento. */
export const BOTTOM_NAV_ITEMS: readonly NavItem[] = [
  { to: "/dashboard", label: "Início" },
  { to: "/eventos", label: "Eventos" },
  { to: "/compras", label: "Compras" },
  { to: "/financeiro", label: "Financeiro" },
  { to: "/configuracoes", label: "Config." },
] as const;

/**
 * Rotas que NÃO precisam de item de menu, com o motivo.
 *
 * Toda exceção é declarada aqui de propósito: se alguém criar uma tela nova e
 * esquecer o link, o teste de navegação quebra em vez de a tela sumir.
 */
export const ROTAS_SEM_MENU: Readonly<Record<string, string>> = {
  "/admin": "só aparece para administradores",
  "/paywall": "destino de redirecionamento, não de navegação",
  "/eventos/:id": "acessada pelo card do evento",
  "/eventos/:id/briefing": "acessada de dentro do evento",
  "/eventos/:id/checklist/:phase": "acessada de dentro do evento",
  "/eventos/:id/orcamento": "acessada de dentro do evento",
  "/eventos/:id/fotos": "acessada de dentro do evento",
  "/eventos/:id/fornecedores": "acessada de dentro do evento",
  "/eventos/:id/planta": "acessada de dentro do evento",
} as const;
