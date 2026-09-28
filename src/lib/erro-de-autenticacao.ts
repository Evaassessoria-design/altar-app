// ─────────────────────────────────────────────────────────────────────────────
// ERRO DE AUTENTICAÇÃO, EM PORTUGUÊS
//
// ── O DEFEITO ───────────────────────────────────────────────────────────────
// Login, cadastro e troca de senha mostravam `error.message` do Better Auth
// direto no toast. Essa mensagem vem em INGLÊS ("Invalid email or password",
// "User already exists. Use another email.") e às vezes técnica. A decoradora
// lia inglês na porta de entrada do produto — o primeiro erro que ela vê.
//
// ── A REGRA ─────────────────────────────────────────────────────────────────
// Traduz pelo CÓDIGO, que é contrato do Better Auth; a mensagem não é. Código
// desconhecido cai na frase do contexto — nunca no texto cru, porque texto
// que não se conhece não se sabe se é seguro nem se está em português.
// ─────────────────────────────────────────────────────────────────────────────

export type ContextoDeAutenticacao = "entrar" | "cadastrar" | "trocar_senha" | "redefinir_senha";

const POR_CODIGO: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "E-mail ou senha inválidos.",
  INVALID_PASSWORD: "Senha incorreta.",
  INVALID_EMAIL: "Este e-mail não parece válido. Confira se digitou certo.",
  USER_NOT_FOUND: "Não encontramos uma conta com este e-mail.",
  CREDENTIAL_ACCOUNT_NOT_FOUND: "Esta conta não entra com e-mail e senha.",
  USER_ALREADY_EXISTS: "Já existe uma conta com este e-mail. Tente entrar.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Já existe uma conta com este e-mail. Tente entrar.",
  PASSWORD_TOO_SHORT: "A senha precisa ter pelo menos 8 caracteres.",
  PASSWORD_TOO_LONG: "A senha é longa demais. Use até 128 caracteres.",
  EMAIL_NOT_VERIFIED: "Confirme seu e-mail antes de entrar — procure a mensagem na sua caixa de entrada.",
  FAILED_TO_CREATE_USER: "Não foi possível criar a conta agora. Tente de novo em alguns minutos.",
};

const PADRAO: Record<ContextoDeAutenticacao, string> = {
  entrar: "Não foi possível entrar. Confira e-mail e senha.",
  cadastrar: "Não foi possível criar a conta. Tente de novo em alguns minutos.",
  trocar_senha: "Não foi possível alterar a senha. Confira a senha atual.",
  redefinir_senha:
    "Não foi possível redefinir a senha. O link pode ter expirado — solicite um novo.",
};

export function mensagemDeErroDeAutenticacao(
  erro: { code?: string; status?: number } | null | undefined,
  contexto: ContextoDeAutenticacao,
): string {
  if (erro?.status === 429) {
    return "Muitas tentativas seguidas. Espere um minuto e tente de novo.";
  }
  // Trocar senha com a senha atual errada: o Better Auth devolve
  // INVALID_PASSWORD, e "senha incorreta" sozinho não diz QUAL delas.
  if (contexto === "trocar_senha" && erro?.code === "INVALID_PASSWORD") {
    return "A senha atual não confere.";
  }
  return (erro?.code && POR_CODIGO[erro.code]) || PADRAO[contexto];
}
