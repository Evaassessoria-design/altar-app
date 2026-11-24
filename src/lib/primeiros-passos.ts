// ─────────────────────────────────────────────────────────────────────────────
// OS PRIMEIROS PASSOS DE QUEM ACABOU DE ENTRAR
//
// Isto é só a REGRA: quais passos existem, quais já foram dados, quanto disso
// o sistema sabe. Nenhum desenho e nenhuma consulta — para poder ser testado
// sem renderizar nada.
//
// ── OS TRÊS DEFEITOS QUE ISTO CORRIGE ───────────────────────────────────────
//
// 1. A TELA AFIRMAVA O QUE NÃO SABIA.
//    `(events?.length ?? 0) > 0` lê "ainda estou carregando" como "não tem
//    evento nenhum". Quem abria o painel via, por um instante, "0 de 3 passos
//    concluídos" e a barra em zero — e só depois ela pulava para o lugar
//    certo. A regra do repositório é a de sempre: enquanto não se sabe, não
//    se afirma. `primeirosPassos` devolve `null` e o aviso não desenha.
//
// 2. O PASSO OPCIONAL CONTAVA CONTRA ELA.
//    Estúdio configurado e primeiro evento criado é a configuração inteira —
//    e o aviso dizia "2 de 3 passos concluídos", com 67% na barra e um botão
//    de continuar. Ficava incompleto para sempre, porque o terceiro passo é
//    opcional e está escrito "Opcional" ao lado. O progresso passa a contar o
//    que é EXIGIDO; o opcional aparece, sugere, e não reprova.
//
// 3. "CONTINUAR CONFIGURAÇÃO" VOLTAVA PARA O PASSO UM.
//    O botão reabria o modal de boas-vindas, que começa sempre no primeiro
//    passo e com os campos em branco — pedindo de novo o nome do estúdio a
//    quem já o tinha preenchido, e sobrescrevendo-o se ela digitasse outro.
//    Cada passo agora leva ao lugar REAL onde ele se resolve.
// ─────────────────────────────────────────────────────────────────────────────

/** O que o passo precisa que já exista. `undefined` = ainda carregando. */
export type SinaisDoComeco = {
  /** Nome do estúdio no perfil. */
  studioName: string | null | undefined;
  /** Quantos eventos a conta tem. */
  eventos: number | undefined;
  /** Quantas pessoas na equipe. */
  equipe: number | undefined;
};

export type PassoInicial = {
  id: "studio" | "event" | "team";
  label: string;
  /** Onde ele se resolve de verdade. */
  destino: string;
  /** Texto do botão quando este é o próximo passo. */
  acao: string;
  feito: boolean;
  /** Não conta no progresso e nunca impede a configuração de fechar. */
  opcional: boolean;
};

export type PrimeirosPassos = {
  passos: readonly PassoInicial[];
  /** Quantos passos EXIGIDOS já foram dados. */
  feitos: number;
  /** Quantos passos são exigidos. O opcional fica de fora. */
  exigidos: number;
  /** 0–100, sobre os exigidos. */
  percentual: number;
  /** Tudo o que é exigido está feito. */
  completo: boolean;
  /** O próximo passo a sugerir — o primeiro pendente, opcional inclusive. */
  proximo: PassoInicial | null;
};

/**
 * Os passos, ou `null` enquanto o sistema não sabe responder.
 *
 * `null` não é "nada a fazer": é "ainda não sei". Quem chama não desenha nada
 * — nem esqueleto, porque um aviso que aparece e some sozinho no meio do
 * painel é pior do que um que demora meio segundo a mais.
 */
export function primeirosPassos(sinais: SinaisDoComeco): PrimeirosPassos | null {
  if (sinais.eventos === undefined || sinais.equipe === undefined) return null;
  // `studioName` ausente é resposta legítima (perfil sem nome ainda); só
  // `undefined` vindo de uma consulta que não voltou é que é silêncio — e
  // quem chama não chega aqui sem o usuário carregado.

  const passos: PassoInicial[] = [
    {
      id: "studio",
      label: "Configure seu estúdio",
      destino: "/configuracoes",
      acao: "Abrir configurações",
      feito: Boolean(sinais.studioName),
      opcional: false,
    },
    {
      id: "event",
      label: "Crie seu primeiro evento",
      destino: "/eventos",
      acao: "Criar evento",
      feito: sinais.eventos > 0,
      opcional: false,
    },
    {
      id: "team",
      label: "Adicione um membro da equipe",
      destino: "/equipe",
      acao: "Abrir equipe",
      feito: sinais.equipe > 0,
      opcional: true,
    },
  ];

  const exigidos = passos.filter((p) => !p.opcional);
  const feitos = exigidos.filter((p) => p.feito).length;

  return {
    passos,
    feitos,
    exigidos: exigidos.length,
    percentual: exigidos.length > 0 ? Math.round((feitos / exigidos.length) * 100) : 100,
    completo: feitos === exigidos.length,
    proximo: passos.find((p) => !p.feito) ?? null,
  };
}

/**
 * O QUE O AVISO DEVE DESENHAR — ou `null` para não desenhar nada.
 *
 * Quatro razões para não aparecer, e é aqui que elas vivem, juntas, para o
 * componente não ter regra nenhuma:
 *
 *   1. o sistema ainda não sabe (`primeirosPassos` devolveu `null`);
 *   2. a pessoa dispensou agora, neste carregamento;
 *   3. a pessoa dispensou antes (`onboardingCompleted` gravado);
 *   4. **o essencial está pronto.**
 *
 * A quarta é a nova, e corrige o último clique que sobrava no começo de toda
 * conta: com estúdio configurado e primeiro evento criado, o cartão dizia
 * "Configuração concluída" e ficava na tela esperando um **Dispensar**. Um
 * aviso que já não pede nada e ainda cobra um toque é tarefa, não ajuda.
 *
 * Não ficou gravado nada para isso. "Concluído" é estado DERIVÁVEL — estúdio
 * com nome e um evento na conta —, e a regra da casa é derivar, não gravar: um
 * carimbo de "configuração terminada" passaria a existir como segunda verdade,
 * capaz de discordar dos fatos. O `Dispensar` continua existindo enquanto AINDA
 * FALTA algo, que é quando dispensar é uma decisão de verdade: "não quero
 * configurar agora".
 *
 * Consequência aceita de propósito: quem apagar o único evento (o de teste da
 * demonstração, por exemplo) vê o cartão voltar pedindo o primeiro evento. É a
 * verdade — ela realmente não tem evento nenhum.
 */
export function avisoDosPrimeirosPassos(
  sinais: SinaisDoComeco,
  estado: { onboardingCompleted: boolean | undefined; dispensado: boolean },
): PrimeirosPassos | null {
  if (estado.dispensado || estado.onboardingCompleted === true) return null;
  const progresso = primeirosPassos(sinais);
  if (!progresso) return null;
  return progresso.completo ? null : progresso;
}

/**
 * A frase de progresso. Nunca inventa porcentagem de passo opcional.
 *
 * O ramo do `completo` continua aqui porque a função responde por QUALQUER
 * `PrimeirosPassos` — mas o aviso não o alcança mais: completo não desenha
 * (ver `avisoDosPrimeirosPassos`).
 */
export function resumoDoProgresso(p: PrimeirosPassos): string {
  if (p.completo) {
    const opcionaisPendentes = p.passos.filter((s) => s.opcional && !s.feito).length;
    return opcionaisPendentes > 0
      ? "O essencial está pronto. O resto é quando você quiser."
      : "Tudo pronto.";
  }
  return `${p.feitos} de ${p.exigidos} ${p.exigidos === 1 ? "passo concluído" : "passos concluídos"}`;
}
