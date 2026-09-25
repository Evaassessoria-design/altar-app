import { LIVE_ALTAR, estagioDe, type Campanha, type EstagioDoInteressado } from "./campanha";
import { modeloPorId, primeiroNome, type ContextoDaMensagem } from "./mensagensDaCampanha";

/**
 * O convite, redigido pela biblioteca de modelos.
 *
 * `modeloPorId("convite")` nunca é `undefined` — "convite" é literal do
 * catálogo — mas o tipo não sabe disso, e um `!` aqui seria a única linha do
 * módulo a confiar em algo que o compilador não confere.
 */
function redigirConvite(c: ContextoDaMensagem) {
  const modelo = modeloPorId("convite");
  if (!modelo) throw new Error("o modelo de convite sumiu do catálogo");
  return modelo.redigir(c);
}

// ─────────────────────────────────────────────────────────────────────────────
// PREPARAR O CONTATO — E PARAR ANTES DE ENVIAR
//
// ── A TRAVA, ESCRITA EM CÓDIGO ──────────────────────────────────────────────
// Este módulo escreve uma mensagem e devolve texto. Não tem `fetch`, não tem
// `ctx`, não conhece WhatsApp, e-mail nem número de telefone de saída. O
// último passo — apertar enviar — é de uma pessoa, sempre.
//
// É a mesma decisão que a Central já sustenta: `podeEnviarSemAprovacao`
// devolve `false` para todos os níveis, de propósito. Uma campanha que dispara
// sozinha erra em escala, e erro em escala com o nome da empresa em cima não
// tem como voltar atrás.
//
// ── POR QUE O RASCUNHO É MODELO, E NÃO CHAMADA DE IA ────────────────────────
// Três razões, nesta ordem:
//
//   1. A live não pode depender de uma chamada externa que pode falhar ao
//      vivo. Modelo de texto responde sempre, em milissegundos, de graça.
//   2. O rascunho precisa ser PREVISÍVEL. Quem manda trinta mensagens quer
//      revisar uma e confiar nas outras vinte e nove; um texto diferente a
//      cada chamada obriga a ler todas.
//   3. Nada aqui inventa fato. O modelo só interpola o que está GRAVADO —
//      nome, empresa, cidade, data da campanha. Não há espaço para uma IA
//      afirmar que a pessoa tem quarenta eventos por ano quando ninguém
//      preencheu o campo.
//
// A IA continua fazendo o que ela faz melhor em outro lugar: interpretar
// pedido em linguagem natural no Escritório. Redigir convite de campanha é
// trabalho de modelo de texto.
// ─────────────────────────────────────────────────────────────────────────────

export type InteressadoParaContato = {
  _id: string;
  name: string;
  empresa?: string;
  cidade?: string;
  whatsapp?: string;
  email?: string;
  status?: string;
  campanha?: string;
  ultimaInteracao?: string;
  eventosPorAno?: number;
  /**
   * De onde veio. Decide a linha de abertura do convite.
   *
   * Quem preencheu a landing ouve "você entrou em contato com a gente"; quem
   * veio de uma lista de prospecção ouve a verdade. Afirmar um contato que
   * nunca houve é a forma mais rápida de queimar um número.
   */
  origem?: string;
};

/** Só quem ainda não foi abordado. Quem já teve contato não entra na fila. */
const AGUARDANDO_PRIMEIRO_CONTATO: ReadonlySet<EstagioDoInteressado> = new Set([
  "novo",
  "contato_preparado",
]);

export function aguardaPrimeiroContato(lead: InteressadoParaContato): boolean {
  return AGUARDANDO_PRIMEIRO_CONTATO.has(estagioDe(lead));
}

// O primeiro nome mora em `mensagensDaCampanha.ts`, junto dos modelos que o
// usam. Reexportado porque a fila e os testes já o chamavam daqui, e mover uma
// importação não é motivo para quebrar quem depende dela.
export { primeiroNome };

/**
 * O rascunho do convite. Texto pronto para ela revisar, editar e enviar.
 *
 * ── POR QUE ISTO É UMA LINHA E NÃO UM TEXTO ─────────────────────────────────
 * Havia DUAS cópias do convite no repositório: esta e a da biblioteca de
 * modelos. Duas cópias do mesmo texto divergem na primeira correção de
 * vírgula, e a decoradora passa a receber versões diferentes conforme a tela
 * por onde a mensagem saiu.
 *
 * A biblioteca é a fonte. Esta função continua existindo porque a fila de
 * contato quer uma string e não precisa conhecer pendência de link — o convite
 * é o único modelo que não depende do link da sala.
 */
export function rascunhoDeConvite(
  lead: InteressadoParaContato,
  campanha: Campanha = LIVE_ALTAR,
): string {
  return redigirConvite({
    nome: lead.name,
    empresa: lead.empresa,
    origem: lead.origem,
    campanha,
  }).texto;
}

export type ContatoPreparado = {
  leadId: string;
  nome: string;
  empresa?: string;
  /** Por onde falar com ela. `null` quando não há contato nenhum gravado. */
  canal: { tipo: "whatsapp" | "email"; valor: string } | null;
  mensagem: string;
  /** Por que esta pessoa está no topo da fila. Nunca um número inventado. */
  motivo: string;
};

/**
 * Por onde falar com ela.
 *
 * WhatsApp na frente do e-mail: é onde decoradora responde. `null` quando não
 * há nenhum dos dois — e nesse caso a fila mostra a pessoa assim mesmo, com o
 * recado de que falta contato. Escondê-la faria a lista prometer que todo
 * mundo é alcançável.
 */
export function canalDe(lead: InteressadoParaContato): ContatoPreparado["canal"] {
  const zap = lead.whatsapp?.trim();
  if (zap) return { tipo: "whatsapp", valor: zap };
  const email = lead.email?.trim();
  if (email) return { tipo: "email", valor: email };
  return null;
}

/**
 * A ordem da fila, e a frase que a explica.
 *
 * ── A PRIORIDADE É DO QUE ESTÁ GRAVADO ──────────────────────────────────────
 * Quem tem porte declarado vem primeiro, porque é o único sinal objetivo de
 * tamanho que existe no cadastro. Depois, quem chegou há mais tempo — esperar
 * é o que transforma interesse em silêncio.
 *
 * Nenhum "score" inventado: a decoradora que preencheu 40 eventos por ano
 * aparece antes porque ELA disse 40, não porque um modelo achou que ela parece
 * promissora.
 */
export function prepararContatos(
  leads: readonly InteressadoParaContato[],
  campanha: Campanha = LIVE_ALTAR,
): ContatoPreparado[] {
  return leads
    .filter(aguardaPrimeiroContato)
    .slice()
    .sort((a, b) => (b.eventosPorAno ?? 0) - (a.eventosPorAno ?? 0))
    .map((lead) => ({
      leadId: lead._id,
      nome: lead.name,
      empresa: lead.empresa,
      canal: canalDe(lead),
      mensagem: rascunhoDeConvite(lead, campanha),
      motivo:
        lead.eventosPorAno !== undefined
          ? `${lead.eventosPorAno} eventos por ano`
          : estagioDe(lead) === "contato_preparado"
            ? "mensagem já preparada, falta enviar"
            : "ainda sem contato",
    }));
}
