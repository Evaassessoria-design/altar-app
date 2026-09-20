// ─────────────────────────────────────────────────────────────────────────────
// AS TRAVAS DA HOMOLOGAÇÃO — decisão pura, sem efeito colateral.
//
// Estas funções não leem ambiente, não chamam rede e não escrevem nada. Elas
// só RESPONDEM: "com estes valores, posso rodar?". É o que as torna testáveis —
// e uma trava que ninguém consegue testar é uma trava em que ninguém confia.
//
// O runner (`central.mjs`) lê o ambiente e obedece ao veredicto. O shell e o
// PowerShell chamam o mesmo runner. Há UMA implementação destas regras no
// repositório inteiro, e é esta.
//
// ── AS QUATRO PERGUNTAS ─────────────────────────────────────────────────────
//   1. o alvo é produção?                   → recusa absoluta
//   2. o envio externo está ligado?         → recusa: nada de porta aberta
//   3. o provedor é o real?                 → recusa: resposta aprovada sairia
//   4. o token do gateway veio do ambiente? → recusa: token não se versiona
//
// A ordem importa. A trava de produção vem primeiro porque é a única cujo erro
// é irreversível.
// ─────────────────────────────────────────────────────────────────────────────

/** O deployment que este script nunca pode tocar. */
export const PROD_PROIBIDA = "mellow-goose-539";

/** O deployment de desenvolvimento onde a homologação acontece. */
export const DEV_ESPERADO = "healthy-pika-907";

/** Recusa com motivo legível. `ok: false` nunca vem sem explicação. */
const recusa = (motivo, comoResolver) => ({ ok: false, motivo, comoResolver });
const aceita = (extra = {}) => ({ ok: true, ...extra });

/**
 * Qual deployment será usado, e ele é seguro?
 *
 * Aceita as duas formas de apontar um alvo: o backend self-hosted (usado na
 * homologação local) e o deployment da nuvem. Nesta ordem, porque quem define
 * `CONVEX_SELF_HOSTED_URL` está deliberadamente apontando para outro lugar.
 */
export function avaliarAlvo({ selfHostedUrl, deployment } = {}) {
  const alvo = (selfHostedUrl || deployment || "").trim();

  if (!alvo) {
    return recusa(
      "Nenhum deployment selecionado.",
      "Rode `npx convex dev` para selecionar o deployment de desenvolvimento, " +
        "ou defina CONVEX_SELF_HOSTED_URL para um backend local.",
    );
  }

  // A verificação que não se negocia. `includes` e não igualdade: o nome de
  // produção aparece dentro de uma URL completa
  // (https://mellow-goose-539.convex.cloud), e comparar por igualdade deixaria
  // essa forma passar.
  if (alvo.includes(PROD_PROIBIDA)) {
    return recusa(
      `O alvo é a PRODUÇÃO (${PROD_PROIBIDA}).`,
      "Este script cria dados de demonstração. Produção nunca os recebe.",
    );
  }

  return aceita({ alvo, ehDevEsperado: alvo.includes(DEV_ESPERADO) });
}

/**
 * O envio externo está ligado?
 *
 * Só `"true"` liga — é a mesma regra do portão de saída no servidor
 * (`convex/lib/central/autonomia.ts`). Ausente, vazio ou qualquer outro valor
 * significa DESLIGADO, e é isso que mantém a Fase 1 segura.
 */
export function avaliarEnvioExterno(valorBruto) {
  const valor = String(valorBruto ?? "").trim();
  if (valor === "true") {
    return recusa(
      "ALTAR_CENTRAL_ENVIO_HABILITADO=true neste ambiente.",
      "Homologação não roda com a porta de saída aberta. Remova a variável antes.",
    );
  }
  return aceita({ ligado: false });
}

/**
 * O provedor de WhatsApp é o simulado?
 *
 * Com o provedor real configurado, aprovar uma resposta na fila poderia
 * efetivamente falar com um cliente. A homologação exige `mock`.
 */
export function avaliarProvider(valorBruto) {
  const valor = String(valorBruto ?? "").trim();
  if (valor !== "mock") {
    return recusa(
      `ALTAR_WHATSAPP_PROVIDER="${valor || "(ausente)"}" — esperado: mock.`,
      "Com o provedor real configurado, uma resposta aprovada poderia sair.",
    );
  }
  return aceita();
}

/**
 * O token do gateway veio do ambiente?
 *
 * Nunca do arquivo. Um token escrito no script vai para o git na primeira
 * gravação, e a partir daí qualquer pessoa com o repositório consegue injetar
 * mensagem no ambiente.
 */
export function avaliarToken(valorBruto) {
  const valor = String(valorBruto ?? "").trim();
  if (!valor) {
    return recusa(
      "ALTAR_CENTRAL_MOCK_TOKEN não definido.",
      "Defina no seu terminal o MESMO valor gravado no deployment. " +
        "O token não é versionado e não aparece em relatório.",
    );
  }
  return aceita();
}

/**
 * Todas as travas, na ordem que importa.
 *
 * Devolve a PRIMEIRA recusa. Não acumula erros de propósito: quem leu
 * "o alvo é produção" não precisa saber mais nada antes de parar.
 */
export function avaliarAmbiente(ambiente = {}) {
  const alvo = avaliarAlvo({
    selfHostedUrl: ambiente.CONVEX_SELF_HOSTED_URL,
    deployment: ambiente.CONVEX_DEPLOYMENT,
  });
  if (!alvo.ok) return alvo;

  for (const veredicto of [
    avaliarEnvioExterno(ambiente.ALTAR_CENTRAL_ENVIO_HABILITADO),
    avaliarProvider(ambiente.ALTAR_WHATSAPP_PROVIDER),
    avaliarToken(ambiente.ALTAR_CENTRAL_MOCK_TOKEN),
  ]) {
    if (!veredicto.ok) return veredicto;
  }

  return aceita({ alvo: alvo.alvo, ehDevEsperado: alvo.ehDevEsperado });
}

/**
 * O corpo que o gateway recebe, no formato do WhatsApp Cloud.
 *
 * Montado aqui, e não no runner, para que o teste possa conferir o formato sem
 * subir servidor nenhum: se o adaptador mudar de expectativa, o teste quebra
 * antes de alguém descobrir por uma mensagem que não chegou.
 *
 * `timestamp` em SEGUNDOS — é o que a API da Meta usa, e mandar milissegundos
 * colocaria a conversa no ano 57000.
 */
export function montarPayload(cenario, agoraMs = Date.now()) {
  const quando = Math.floor(agoraMs / 1000) - cenario.minutosAtras * 60;
  return {
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: "MOCK" },
              contacts: [{ wa_id: cenario.telefone, profile: { name: cenario.nome } }],
              messages: [
                {
                  from: cenario.telefone,
                  id: `wamid.HOMOLOG.${cenario.chave}`,
                  timestamp: String(quando),
                  type: "text",
                  text: { body: cenario.texto },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}
