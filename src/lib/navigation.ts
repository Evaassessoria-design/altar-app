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
export const NAV_ITEMS = [
  { to: "/dashboard", label: "Início" },
  { to: "/eventos", label: "Eventos" },
  { to: "/fornecedores", label: "Fornecedores" },
  { to: "/equipe", label: "Equipe" },
  { to: "/compras", label: "Compras" },
  { to: "/financeiro", label: "Financeiro" },
  { to: "/funil", label: "Funil" },
] as const satisfies readonly NavItem[];

/**
 * Barra inferior (mobile) — o que se usa com o polegar, em movimento.
 *
 * Quatro destinos e um "Mais". Deliberadamente CURTA: com seis itens, o rótulo
 * "Financeiro" sozinho ocupa ~62px em text-xs e a barra estoura num aparelho de
 * 320px de largura.
 */
export const BOTTOM_NAV_ITEMS = [
  { to: "/dashboard", label: "Início" },
  { to: "/eventos", label: "Eventos" },
  { to: "/compras", label: "Compras" },
  { to: "/financeiro", label: "Financeiro" },
] as const satisfies readonly NavItem[];

/**
 * O que abre no "Mais" da barra inferior.
 *
 * Existe porque o menu lateral é `hidden md:flex` — ou seja, SÓ DESKTOP. Tudo
 * que estivesse apenas nele ficava inalcançável em um celular, e era o caso de
 * `/funil` desde antes desta rodada, e de `/equipe` e `/fornecedores` depois
 * dela. Um item de menu que só existe no desktop é, no telefone, um botão que
 * não existe.
 */
export const MORE_MENU_ITEMS = [
  { to: "/fornecedores", label: "Fornecedores" },
  { to: "/equipe", label: "Equipe" },
  { to: "/funil", label: "Funil" },
  { to: "/configuracoes", label: "Configurações" },
] as const satisfies readonly NavItem[];

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

/**
 * União de TODAS as rotas que aparecem em algum menu.
 *
 * Serve para o mapa de ícones do layout ser exaustivo POR TIPO: acrescentar um
 * item de menu sem o ícone correspondente passa a ser erro de compilação.
 *
 * Não é preciosismo. `Record<string, LucideIcon>` devolve `LucideIcon` mesmo
 * para uma chave ausente, então `<item.icon />` virava `undefined` e derrubava
 * o menu inteiro em tempo de execução — sem o TypeScript reclamar. Foi
 * exatamente o que aconteceu quando "Fornecedores" entrou no menu.
 */
export type RotaDeMenu =
  | (typeof NAV_ITEMS)[number]["to"]
  | (typeof BOTTOM_NAV_ITEMS)[number]["to"]
  | (typeof MORE_MENU_ITEMS)[number]["to"];
