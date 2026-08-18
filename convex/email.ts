// ─────────────────────────────────────────────────────────────────────────────
// Envio de e-mail transacional (Resend).
//
// Implementado com `fetch` direto contra a API do Resend, sem SDK e sem
// componente Convex. Duas razões:
//  1. `sendResetPassword` roda DENTRO do handler do Better Auth, no runtime V8 —
//     onde o SDK Node do Resend não carrega. `fetch` funciona nativamente.
//  2. Zero dependência nova num caminho crítico (autenticação).
//
// Trade-off assumido: não há fila nem retry automático. Se o envio falhar, o
// usuário vê a mensagem genérica e pode solicitar de novo. Para ganhar
// durabilidade depois, basta trocar o corpo de `sendEmail` pelo componente
// @convex-dev/resend — nenhum chamador precisa mudar.
//
// Envs exigidas no deployment do Convex:
//   RESEND_API_KEY → chave da API do Resend
//   EMAIL_FROM     → remetente, ex.: "ALTAR <no-reply@appaltar.com.br>"
// ─────────────────────────────────────────────────────────────────────────────

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type SendEmailArgs = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

/**
 * Envia um e-mail. Nunca lança: um erro de envio não pode derrubar o fluxo de
 * autenticação nem revelar ao visitante que algo aconteceu nos bastidores.
 * Falhas vão para o log do Convex, onde ficam auditáveis.
 */
export async function sendEmail(args: SendEmailArgs): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();

  if (!apiKey || !from) {
    console.error(
      "[email] Envio ignorado: RESEND_API_KEY e/ou EMAIL_FROM não configuradas neste ambiente.",
    );
    return false;
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [args.to],
        subject: args.subject,
        html: args.html,
        text: args.text,
      }),
    });

    if (!res.ok) {
      // Corpo do erro do Resend não contém a chave — seguro para log.
      const detail = await res.text();
      console.error(`[email] Resend recusou o envio (HTTP ${res.status}): ${detail.slice(0, 300)}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] Falha de rede ao chamar o Resend:", err);
    return false;
  }
}

// ── Template: redefinição de senha ───────────────────────────────────────────

const BRAND = "#b28e60";

export function resetPasswordEmail(resetUrl: string, userName?: string) {
  const saudacao = userName?.trim() ? `Olá, ${userName.trim()}!` : "Olá!";

  const text = [
    saudacao,
    "",
    "Recebemos um pedido para redefinir a senha da sua conta no ALTAR.",
    "Abra o link abaixo para escolher uma nova senha (válido por 1 hora):",
    "",
    resetUrl,
    "",
    "Se você não pediu isso, pode ignorar este e-mail — sua senha continua a mesma.",
    "",
    "ALTAR · Gestão para Decoradores de Eventos",
  ].join("\n");

  const html = `<!doctype html>
<html lang="pt-BR"><body style="margin:0;padding:24px;background:#f7f3ee;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#2a2320;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e6dccd;">
      <tr><td style="background:${BRAND};padding:20px 28px;">
        <div style="font-size:20px;font-weight:700;letter-spacing:2px;color:#ffffff;">ALTAR</div>
        <div style="font-size:12px;color:#f5ece0;">Gestão para Decoradores de Eventos</div>
      </td></tr>
      <tr><td style="padding:28px;">
        <p style="margin:0 0 14px;font-size:16px;font-weight:600;">${saudacao}</p>
        <p style="margin:0 0 18px;font-size:14px;line-height:1.6;">
          Recebemos um pedido para redefinir a senha da sua conta no ALTAR.
          Clique no botão abaixo para escolher uma nova senha.
        </p>
        <p style="margin:0 0 22px;">
          <a href="${resetUrl}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:9px;font-size:14px;font-weight:600;">Redefinir minha senha</a>
        </p>
        <p style="margin:0 0 18px;font-size:13px;line-height:1.6;color:#6b615a;">
          Este link expira em <strong>1 hora</strong> e só pode ser usado uma vez.
        </p>
        <p style="margin:0;font-size:13px;line-height:1.6;color:#6b615a;">
          Se você não solicitou a troca, pode ignorar este e-mail — sua senha continua a mesma.
        </p>
      </td></tr>
      <tr><td style="padding:16px 28px;border-top:1px solid #f0e8dc;font-size:11px;color:#9a8f86;">
        Se o botão não funcionar, copie e cole este endereço no navegador:<br>
        <span style="word-break:break-all;">${resetUrl}</span>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  return { subject: "Redefinição de senha · ALTAR", html, text };
}
