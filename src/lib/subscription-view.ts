// ─────────────────────────────────────────────────────────────────────────────
// O QUE A TELA DE CONFIGURAÇÕES MOSTRA SOBRE ASSINATURA
//
// Isto é APENAS apresentação. Não decide acesso, não toca em cobrança e não
// altera `subscriptionStatus` — só traduz a decisão que o backend já tomou
// (`convex/lib/access.ts` → `access`) em "o que aparece na tela".
//
// O problema que resolve: uma conta isenta de cobrança via, ao mesmo tempo,
//   "Conta interna — Acesso permanente, sem cobrança."     (correto)
//   "Trial expirado" · "Plano Altar Pro" · "Assinar agora" (contraditório)
//
// O estado comercial é do CLIENTE. Quem não paga não deve ver preço, contagem
// de trial nem convite para assinar.
//
// Vive fora do componente para ser testável sem renderizar a página.
// ─────────────────────────────────────────────────────────────────────────────

export type AccessSummary =
  | {
      type?: "client" | "beta" | "internal";
      billingExempt?: boolean;
      adminExempt?: boolean;
      betaExpired?: boolean;
    }
  | null
  | undefined;

export type ExemptCard = {
  /** Título — o que a conta é. */
  label: string;
  /** Linha de apoio — o que isso garante. */
  detail: string;
  /** Fecho — por que não há cobrança. */
  note: string;
};

export type SubscriptionView = {
  /** Conta que não paga: sem preço, sem CTA, sem contagem de trial. */
  billingExempt: boolean;
  /** Cartão que SUBSTITUI o estado comercial. `null` para cliente normal. */
  exemptCard: ExemptCard | null;
  /** O bloco "Plano Altar Pro / Assinar agora". */
  showCommercialCta: boolean;
  /** O selo de status de cobrança (Trial gratuito / Trial expirado / …). */
  showBillingStatus: boolean;
};

const SEM_COBRANCA = "Esta conta não requer assinatura.";

/**
 * @param access decisão vinda de `users.getSubscriptionStatus`.
 * @param status estado de cobrança EFETIVO (trial já expirado vem como "expired").
 */
export function resolveSubscriptionView(
  access: AccessSummary,
  status: string,
): SubscriptionView {
  const billingExempt = access?.billingExempt === true;

  if (!billingExempt) {
    // Cliente comum: experiência comercial inalterada, exatamente como era.
    return {
      billingExempt: false,
      exemptCard: null,
      showCommercialCta: status === "trial" || status === "expired",
      showBillingStatus: true,
    };
  }

  // Três motivos de isenção, três textos. A ordem importa: `internal` e `beta`
  // descrevem o tipo de CONTA; `adminExempt` é quem OPERA o ALTAR e pode ter
  // ficado com accessType "client".
  const exemptCard: ExemptCard =
    access?.type === "internal"
      ? {
          label: "Conta interna",
          detail: "Acesso permanente ao ALTAR",
          note: SEM_COBRANCA,
        }
      : access?.type === "beta" && !access.betaExpired
        ? {
            label: "Acesso beta",
            detail: "Acesso liberado durante o período de testes",
            note: SEM_COBRANCA,
          }
        : {
            label: "Conta administrativa",
            detail: "Acesso permanente ao ALTAR",
            note: SEM_COBRANCA,
          };

  return {
    billingExempt: true,
    exemptCard,
    showCommercialCta: false,
    showBillingStatus: false,
  };
}
