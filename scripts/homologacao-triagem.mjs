// ─────────────────────────────────────────────────────────────────────────────
// TRIAGEM DA HOMOLOGAÇÃO — o palpite que a IA teria dado
//
// Depois que as mensagens entraram pelo gateway, falta o passo que roteia a
// conversa, abre tarefa, registra sinal de Ouvidoria e propõe a resposta. Em
// produção quem faz isso é `communicationsIa.triarConversa` (uma action que
// chama o modelo) e grava por `communicationsTriage.aplicarTriagem`.
//
// Aqui pulamos SÓ a chamada ao modelo e usamos a mesma mutation interna, com
// um palpite fixo por cenário. Três razões:
//
//   1. homologação não pode depender de rede nem de chave de IA;
//   2. o resultado precisa ser o MESMO toda vez, senão não dá para conferir;
//   3. o que estamos homologando é a operação — a qualidade do modelo é outra
//      conversa, e é medida por `communicationTriage.divergiu` ao longo do uso.
//
// O identificador da conversa vem de um EXPORT do próprio deployment (leitura,
// nunca escrita direta): é assim que se descobre o que o gateway acabou de
// criar sem inventar id nenhum.
// ─────────────────────────────────────────────────────────────────────────────
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Um palpite por telefone. Espelha o que cada mensagem pede. */
const PALPITES = {
  "+5511988880001": {
    departamento: "comercial",
    categoria: "demonstracao",
    prioridade: "alta",
    confianca: 0.93,
    assunto: "Demonstração — decoradora em Campinas",
    resumo:
      "Decoradora viu o ALTAR no Instagram e quer demonstração ainda esta semana. Sinal de compra claro.",
    sinais: ["pediu demonstração", "prazo próprio (esta semana)", "veio do Instagram"],
    respostaSugerida:
      "Oi, Helena! Que bom ter você por aqui. Consigo te mostrar o ALTAR ainda esta semana — tenho quinta às 10h ou sexta às 16h. Qual fica melhor? A demonstração leva uns 30 minutos e já saio de lá com o seu primeiro evento montado.",
    trabalho: "demonstracao",
  },
  "+5511988880002": {
    departamento: "comercial",
    categoria: "novo_interessado",
    prioridade: "normal",
    confianca: 0.78,
    assunto: "Buffet querendo conhecer o ALTAR Buffet",
    resumo:
      "Buffet Villa Real pergunta se existe versão para buffet, preços e o que entra no plano.",
    sinais: ["vertical buffet", "pergunta de preço", "empresa estabelecida"],
    respostaSugerida:
      "Boa tarde, Rodrigo! O ALTAR nasceu na decoração e a versão para buffet está em construção — posso te mostrar o que já existe hoje e te colocar na lista de quem entra primeiro. Te ligo amanhã de manhã?",
    trabalho: "follow_up",
  },
  "+5521977770003": {
    departamento: "suporte",
    categoria: "onboarding",
    prioridade: "alta",
    confianca: 0.88,
    assunto: "Assinante nova perdida no começo",
    resumo:
      "Assinou ontem e não sabe por onde começar: quer cadastrar o primeiro evento e a equipe.",
    sinais: ["assinante nova", "risco de abandono no primeiro dia"],
    respostaSugerida:
      "Oi, Carla! Bem-vinda. O caminho mais curto é: Eventos → Novo evento (nome, data, local e cliente) e depois Equipe → Adicionar membro. Se preferir, faço isso com você numa chamada de 15 minutos hoje ainda. Quer?",
    trabalho: "onboarding",
  },
  "+5531966660004": {
    departamento: "suporte",
    categoria: "problema",
    prioridade: "alta",
    confianca: 0.71,
    assunto: "Ficha técnica somando errado",
    resumo:
      "Relata que a ficha técnica não soma as flores do arranjo; já refez duas vezes e o número continua errado.",
    sinais: ["possível defeito", "cliente já tentou duas vezes", "área: ficha técnica"],
    respostaSugerida:
      "Patrícia, obrigado por avisar — e desculpe o retrabalho. Pode me mandar o nome do evento e do arranjo? Vou conferir a receita item a item e te digo hoje se é ajuste de cadastro ou defeito nosso.",
    trabalho: "suporte",
    // Sem `sinalDeProduto`: a Ouvidoria só registra quando a CATEGORIA da
    // conversa é de ouvidoria (regra de `aplicarTriagem`), e esta é "problema".
    // O bug daqui é registrado À MÃO na tela, que é justamente o caminho do
    // registro humano — quem leu a conversa entendeu que era defeito.
  },
  "+5541955550005": {
    departamento: "financeiro",
    categoria: "cobranca",
    prioridade: "normal",
    confianca: 0.84,
    assunto: "Dúvida sobre o que foi cobrado",
    resumo:
      "Cliente recebeu cobrança e achava estar no plano mensal antigo. Quer ver o detalhe do que foi cobrado.",
    // NADA de movimentação: a Central classifica o assunto e ORIENTA. Quem mexe
    // em cobrança é o fluxo financeiro, por decisão humana, fora daqui.
    sinais: ["dúvida de cobrança", "sem pedido de cancelamento"],
    respostaSugerida:
      "Bom dia, Juliana! Consigo te explicar certinho. O detalhe de cada cobrança fica em Configurações → Assinatura, e eu te mando também o histórico por e-mail. Se algo estiver diferente do combinado, a gente corrige.",
    trabalho: "contato_cobranca",
  },
  "+5551944440006": {
    departamento: "ouvidoria",
    categoria: "reclamacao",
    prioridade: "alta",
    confianca: 0.9,
    assunto: "Perdeu a tarde subindo fotos",
    resumo:
      "Cliente insatisfeita: tentou subir as fotos do casamento e o sistema derrubou o envio duas vezes.",
    sinais: ["insatisfação explícita", "perda de tempo do cliente", "upload de fotos"],
    respostaSugerida:
      "Marina, sinto muito — perder uma tarde de trabalho é sério e a culpa é nossa, não sua. Já registrei o caso e vou acompanhar pessoalmente. Pode me dizer o tamanho aproximado das fotos e se foi pelo celular ou computador?",
    trabalho: "retorno",
    sinalDeProduto: {
      titulo: "Upload de fotos falha em lote grande",
      descricao: "Envio interrompido duas vezes na mesma sessão, com perda do progresso.",
      severidade: "critica",
    },
  },
  "+5561933330007": {
    departamento: "ouvidoria",
    categoria: "funcionalidade",
    prioridade: "baixa",
    confianca: 0.95,
    assunto: "Exportar orçamento em Excel",
    resumo: "Pede exportação do orçamento em Excel para enviar ao contador; hoje só há PDF.",
    sinais: ["pedido de funcionalidade", "uso contábil"],
    respostaSugerida:
      "Fernanda, ótima ideia — anotei aqui como pedido formal. Hoje o orçamento sai em PDF; vou levar o Excel para a próxima rodada de produto e te aviso quando entrar.",
    sinalDeProduto: {
      titulo: "Exportar orçamento em Excel",
      descricao: "Cliente precisa mandar o orçamento ao contador em planilha, não em PDF.",
      severidade: "media",
    },
  },
  "+5571922220008": {
    departamento: "comercial",
    categoria: "conversao",
    prioridade: "urgente",
    confianca: 0.52,
    assunto: "Rede com 14 decoradoras quer condição especial",
    resumo:
      "Quer fechar para 14 decoradoras, com condição comercial fora da tabela e contrato assinado esta semana.",
    sinais: [
      "negociação fora da política",
      "volume alto",
      "prazo curto",
      "confiança baixa da IA",
    ],
    escalar: true,
    motivoDoEscalonamento: "Desconto fora da tabela para 14 contas — decisão é do CEO",
    respostaSugerida:
      "Beatriz, que oportunidade boa. Condição para 14 contas eu não fecho sozinho — vou falar com o Matheus hoje e te trago a proposta ainda nesta semana. Posso te ligar amanhã de manhã?",
    trabalho: "follow_up",
  },
};

function convex(args) {
  return execFileSync("npx", ["convex", ...args], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function lerExport() {
  const dir = mkdtempSync(join(tmpdir(), "altar-homolog-"));
  const zip = join(dir, "snapshot.zip");
  convex(["export", "--path", zip]);
  execFileSync("unzip", ["-o", "-q", zip, "-d", dir]);

  const jsonl = (tabela) => {
    try {
      return readFileSync(join(dir, tabela, "documents.jsonl"), "utf-8")
        .split("\n")
        .filter(Boolean)
        .map((linha) => JSON.parse(linha));
    } catch {
      return [];
    }
  };

  const dados = {
    identidades: jsonl("communicationIdentities"),
    conversas: jsonl("communicationConversations"),
    mensagens: jsonl("communicationMessages"),
    triagens: jsonl("communicationTriage"),
  };
  rmSync(dir, { recursive: true, force: true });
  return dados;
}

const { identidades, conversas, mensagens, triagens } = lerExport();

const jaTriada = new Set(triagens.map((t) => t.conversationId));
let aplicadas = 0;
let puladas = 0;

for (const [telefone, palpite] of Object.entries(PALPITES)) {
  const identidade = identidades.find((i) => i.externalId === telefone);
  if (!identidade) {
    console.log(`  ⚠ sem identidade para ${telefone} — a mensagem chegou?`);
    continue;
  }

  const conversa = conversas
    .filter((c) => c.contactId === identidade.contactId)
    .sort((a, b) => b.ultimaMensagemEm - a.ultimaMensagemEm)[0];
  if (!conversa) {
    console.log(`  ⚠ sem conversa para ${telefone}`);
    continue;
  }

  // Idempotência: uma conversa já triada não é triada de novo — senão cada
  // execução empilharia propostas de resposta na fila do Matheus.
  if (jaTriada.has(conversa._id)) {
    puladas += 1;
    continue;
  }

  const mensagem = mensagens
    .filter((m) => m.conversationId === conversa._id)
    .sort((a, b) => b.enviadaEm - a.enviadaEm)[0];

  const sinal = palpite.sinalDeProduto;

  const args = {
    conversationId: conversa._id,
    messageId: mensagem?._id,
    vertical: conversa.vertical,
    departamento: palpite.departamento,
    categoria: palpite.categoria,
    prioridade: palpite.prioridade,
    escalar: palpite.escalar === true,
    motivoDoEscalonamento: palpite.motivoDoEscalonamento,
    confianca: palpite.confianca,
    assunto: palpite.assunto,
    resumo: palpite.resumo,
    sinais: palpite.sinais,
    respostaSugerida: palpite.respostaSugerida,
    modelo: "homologacao/palpite-fixo",
    promptVersao: "homologacao-1",
    trabalho: palpite.trabalho,
    // A Ouvidoria só aceita sinal quando a CATEGORIA da conversa é de
    // ouvidoria — mesma regra da triagem real (communicationsTriage.ts).
    sinalDeProduto: sinal,
    agora: Date.now(),
  };

  convex(["run", "internal.communicationsTriage.aplicarTriagem", JSON.stringify(args)]);
  aplicadas += 1;
  console.log(`  ✓ ${palpite.assunto}`);
}

console.log(`  ${aplicadas} triagem(ns) aplicada(s), ${puladas} já existente(s).`);
