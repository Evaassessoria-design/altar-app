// ─────────────────────────────────────────────────────────────────────────────
// QUANDO A TELA NÃO CHEGA
//
// As telas do ALTAR passaram a ser carregadas sob demanda. Isso cria uma falha
// que antes não existia: o pedaço da tela pode simplesmente não chegar.
//
// Acontece por dois motivos reais:
//
//   1. O ALTAR foi atualizado enquanto a aba estava aberta. O navegador tem o
//      index.html velho, que pede um arquivo com nome antigo — e esse arquivo
//      não existe mais no servidor.
//   2. A internet caiu no meio (o galpão de novo).
//
// ── POR QUE ISSO PRECISA DE TRATAMENTO PRÓPRIO ──────────────────────────────
// `React.lazy` GUARDA a promessa rejeitada. Tentar de novo renderiza o mesmo
// erro na hora, para sempre: o botão "Tentar novamente" vira um botão que não
// faz nada. A única saída é recarregar a página, que busca o index.html novo e
// com ele os nomes de arquivo certos.
//
// Por isso o texto e o botão são outros — e a mensagem técnica não aparece:
// "Failed to fetch dynamically imported module" não ajuda ninguém no meio de
// uma montagem. Ela continua no console, para quem for depurar.
// ─────────────────────────────────────────────────────────────────────────────

/** Mensagens que cada navegador usa para "não consegui buscar esse pedaço". */
const SINAIS = [
  "failed to fetch dynamically imported module", // Chrome, Edge
  "error loading dynamically imported module", // Firefox
  "importing a module script failed", // Safari
  "failed to load module script",
  "dynamically imported module",
];

/** É falha de carregamento de tela (e não um erro do código da tela)? */
export function ehFalhaDeCarregamentoDeTela(erro: unknown): boolean {
  if (!erro) return false;

  // Webpack e alguns bundlers marcam pelo nome.
  const nome = (erro as { name?: unknown }).name;
  if (typeof nome === "string" && nome === "ChunkLoadError") return true;

  const mensagem = (erro as { message?: unknown }).message;
  if (typeof mensagem !== "string") return false;

  const m = mensagem.toLowerCase();
  return SINAIS.some((s) => m.includes(s));
}
