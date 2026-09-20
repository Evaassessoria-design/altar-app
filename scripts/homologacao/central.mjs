#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// HOMOLOGAÇÃO DA CENTRAL DE COMUNICAÇÕES — a implementação única.
//
// Põe na Central oito conversas que se parecem com um dia de trabalho real:
// comercial das duas verticais, onboarding, suporte, financeiro, ouvidoria,
// pedido de funcionalidade e uma escalada para o CEO.
//
// ── POR QUE ESTE ARQUIVO EXISTE EM NODE ─────────────────────────────────────
// A versão anterior era um script de shell. Funcionava no Linux e não rodava
// no computador de quem vende, que é Windows — e mandar instalar WSL ou Git
// Bash só para homologar é transferir um problema nosso para o usuário.
//
// `homologacao-central.sh` e `homologacao-central.ps1` são cascas de duas
// linhas que chamam ESTE arquivo. Não há duas implementações para divergir.
//
// ── POR QUE PELO GATEWAY, E NÃO POR INSERÇÃO DIRETA ─────────────────────────
// Cada mensagem entra pela MESMA rota que o WhatsApp usaria
// (`POST /channels/<canal>/webhook`, modo mock). Assim a homologação exercita
// o caminho inteiro — adaptador → identidade → contato → conversa → mensagem →
// evento de integração — em vez de fabricar o resultado dele. Inserir direto
// no banco testaria a tela contra dados que o sistema nunca produziria.
//
// ── O QUE ESTE SCRIPT NUNCA FAZ ─────────────────────────────────────────────
//   · não roda contra produção (trava por nome de deployment, antes de tudo);
//   · não liga envio externo — recusa se `ALTAR_CENTRAL_ENVIO_HABILITADO=true`;
//   · não roda com provedor real — exige `ALTAR_WHATSAPP_PROVIDER=mock`;
//   · não carrega token: ele vem do ambiente e nunca é impresso;
//   · não toca em cobrança, assinatura ou Asaas;
//   · é idempotente: `wamid` fixo por cenário, triagem pulada se já existe.
// ─────────────────────────────────────────────────────────────────────────────
import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { CENARIOS, e164De } from "./cenarios.mjs";
import { avaliarAmbiente, montarPayload, DEV_ESPERADO } from "./travas.mjs";

const SEM_CONFIRMACAO = process.argv.includes("--sim");

/**
 * O CLI do Convex, de forma que funcione nos dois sistemas.
 *
 * `shell: true` existe por causa do Windows: lá `npx` é `npx.cmd`, e
 * `execFileSync("npx", …)` sem shell falha com ENOENT. Os argumentos são
 * fixos e vêm deste arquivo — nenhum entra por parâmetro do usuário.
 */
function convex(args) {
  return execFileSync("npx", ["convex", ...args], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
  });
}

/** Lê uma variável do deployment. Devolve "" quando não existe. */
function envDoDeployment(nome) {
  try {
    return convex(["env", "get", nome]).trim();
  } catch {
    return "";
  }
}

function pare(veredicto) {
  console.error(`\n✖ RECUSADO: ${veredicto.motivo}`);
  if (veredicto.comoResolver) console.error(`  ${veredicto.comoResolver}`);
  process.exit(1);
}

// ── As travas, antes de qualquer coisa ──────────────────────────────────────
// Note que o envio e o provedor são lidos do DEPLOYMENT, não do terminal: o
// que vale é o que está gravado no ambiente que vai receber as mensagens.
const ambiente = {
  CONVEX_SELF_HOSTED_URL: process.env.CONVEX_SELF_HOSTED_URL,
  CONVEX_DEPLOYMENT: process.env.CONVEX_DEPLOYMENT,
  ALTAR_CENTRAL_MOCK_TOKEN: process.env.ALTAR_CENTRAL_MOCK_TOKEN,
  ALTAR_CENTRAL_ENVIO_HABILITADO: undefined,
  ALTAR_WHATSAPP_PROVIDER: undefined,
};

const alvoPreliminar = avaliarAmbiente({
  ...ambiente,
  // Valores neutros: queremos que a trava de ALVO fale primeiro, antes de
  // gastar uma chamada de CLI contra um deployment que talvez seja produção.
  ALTAR_WHATSAPP_PROVIDER: "mock",
  ALTAR_CENTRAL_MOCK_TOKEN: ambiente.ALTAR_CENTRAL_MOCK_TOKEN,
});
if (!alvoPreliminar.ok) pare(alvoPreliminar);

ambiente.ALTAR_CENTRAL_ENVIO_HABILITADO = envDoDeployment("ALTAR_CENTRAL_ENVIO_HABILITADO");
ambiente.ALTAR_WHATSAPP_PROVIDER = envDoDeployment("ALTAR_WHATSAPP_PROVIDER");

const veredicto = avaliarAmbiente(ambiente);
if (!veredicto.ok) pare(veredicto);

console.log(`▸ Alvo: ${veredicto.alvo}`);
if (!veredicto.ehDevEsperado) {
  console.log(`  ⚠ Este não é o ${DEV_ESPERADO} — confira antes de confirmar.`);
}
console.log("▸ Provedor: mock");
console.log("▸ Envio externo: DESLIGADO");

if (!SEM_CONFIRMACAO) {
  const leitor = createInterface({ input: stdin, output: stdout });
  const resposta = await leitor.question("  Confirma que este NÃO é produção? [s/N] ");
  leitor.close();
  if (!/^s$/i.test(resposta.trim())) {
    console.error("✖ Cancelado.");
    process.exit(1);
  }
}

// ── 1. As oito mensagens, pelo gateway oficial ──────────────────────────────
const siteUrl = (
  process.env.CONVEX_SITE_URL ||
  (veredicto.alvo.startsWith("http")
    ? veredicto.alvo.replace(/:3210$/, ":3211")
    : `https://${veredicto.alvo}.convex.site`)
).replace(/\/$/, "");

console.log(`\n▸ Gateway: ${siteUrl}/channels/whatsapp/webhook`);

const agora = Date.now();
for (const cenario of CENARIOS) {
  const resposta = await fetch(`${siteUrl}/channels/whatsapp/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Altar-Mock-Token": process.env.ALTAR_CENTRAL_MOCK_TOKEN,
    },
    body: JSON.stringify(montarPayload(cenario, agora)),
  });
  const corpo = await resposta.text();
  if (!resposta.ok) {
    console.error(`  ✖ ${cenario.nome}: HTTP ${resposta.status} ${corpo.slice(0, 160)}`);
    process.exit(1);
  }
  // `duplicate` é sucesso: significa que a idempotência funcionou.
  console.log(`  ← ${cenario.nome}${/duplicate/i.test(corpo) ? " (já existia)" : ""}`);
}

// ── 2. A triagem, com palpite fixo ──────────────────────────────────────────
// Quem classifica em produção é uma action que chama o modelo. Aqui pulamos SÓ
// a chamada ao modelo e usamos a MESMA mutation interna — o que se homologa é
// a operação, não a qualidade do palpite.
console.log("\n▸ Aplicando a triagem (palpite fixo, sem chamar modelo)…");

const alvos = JSON.parse(
  convex([
    "run",
    "internal.communications.conversasPorIdentidade",
    JSON.stringify({ externalIds: CENARIOS.map(e164De) }),
  ]),
);
const porTelefone = new Map(alvos.map((a) => [a.externalId, a]));

let aplicadas = 0;
let puladas = 0;
for (const cenario of CENARIOS) {
  const alvo = porTelefone.get(e164De(cenario));

  if (!alvo?.encontrada) {
    console.log(`  ⚠ sem conversa para ${cenario.nome} — a mensagem chegou?`);
    continue;
  }
  if (alvo.jaTriada) {
    puladas += 1;
    continue;
  }

  const t = cenario.triagem;
  convex([
    "run",
    "internal.communicationsTriage.aplicarTriagem",
    JSON.stringify({
      conversationId: alvo.conversationId,
      messageId: alvo.messageId,
      vertical: alvo.vertical,
      departamento: t.departamento,
      categoria: t.categoria,
      prioridade: t.prioridade,
      escalar: t.escalar === true,
      motivoDoEscalonamento: t.motivoDoEscalonamento,
      confianca: t.confianca,
      assunto: t.assunto,
      resumo: t.resumo,
      sinais: t.sinais,
      respostaSugerida: t.respostaSugerida,
      modelo: "homologacao/palpite-fixo",
      promptVersao: "homologacao-1",
      trabalho: t.trabalho,
      // A Ouvidoria só aceita sinal quando a CATEGORIA da conversa é de
      // ouvidoria — mesma regra da triagem real (communicationsTriage.ts).
      sinalDeProduto: t.sinalDeProduto,
      agora: Date.now(),
    }),
  ]);
  aplicadas += 1;
  console.log(`  ✓ ${t.assunto}`);
}
console.log(`  ${aplicadas} triagem(ns) aplicada(s), ${puladas} já existente(s).`);

// ── 3. O índice de busca ────────────────────────────────────────────────────
console.log("\n▸ Reparando o índice de busca…");
const reparo = convex(["run", "internal.communications.repararIndiceDeBusca", "{}"]).trim();
console.log(`  ${reparo}`);

console.log(`
✔ Pronto. Abra /central e confira:
   · 8 conversas, 5 departamentos, 4 prioridades;
   · fila de aprovação com propostas pendentes;
   · tarefas abertas com prazo;
   · Ouvidoria com reclamação e pedido de funcionalidade;
   · uma conversa escalada para o CEO;
   · e o aviso de que NADA sai deste ambiente.`);
