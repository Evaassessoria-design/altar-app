/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as acervo from "../acervo.js";
import type * as admin from "../admin.js";
import type * as adminApprovals from "../adminApprovals.js";
import type * as adminWorkItems from "../adminWorkItems.js";
import type * as agenda from "../agenda.js";
import type * as ai from "../ai.js";
import type * as aiVisual from "../aiVisual.js";
import type * as asaas from "../asaas.js";
import type * as asaasWebhook from "../asaasWebhook.js";
import type * as asaasWebhookLog from "../asaasWebhookLog.js";
import type * as assemblyItems from "../assemblyItems.js";
import type * as assistente from "../assistente.js";
import type * as assistenteBriefing from "../assistenteBriefing.js";
import type * as assistenteExecutor from "../assistenteExecutor.js";
import type * as auth from "../auth.js";
import type * as briefing from "../briefing.js";
import type * as campanhaRascunhos from "../campanhaRascunhos.js";
import type * as comercialBriefing from "../comercialBriefing.js";
import type * as communications from "../communications.js";
import type * as communicationsGateway from "../communicationsGateway.js";
import type * as communicationsIa from "../communicationsIa.js";
import type * as communicationsOutbox from "../communicationsOutbox.js";
import type * as communicationsTriage from "../communicationsTriage.js";
import type * as compositions from "../compositions.js";
import type * as contracts from "../contracts.js";
import type * as crons from "../crons.js";
import type * as customerVoice from "../customerVoice.js";
import type * as dashboard from "../dashboard.js";
import type * as demo from "../demo.js";
import type * as demoAuth from "../demoAuth.js";
import type * as email from "../email.js";
import type * as escritorio from "../escritorio.js";
import type * as events from "../events.js";
import type * as fichaTecnica from "../fichaTecnica.js";
import type * as financeiro from "../financeiro.js";
import type * as funil from "../funil.js";
import type * as gallery from "../gallery.js";
import type * as health from "../health.js";
import type * as http from "../http.js";
import type * as landingLeads from "../landingLeads.js";
import type * as layoutRenders from "../layoutRenders.js";
import type * as leadDocuments from "../leadDocuments.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_accessGuard from "../lib/accessGuard.js";
import type * as lib_acervo from "../lib/acervo.js";
import type * as lib_adminGuard from "../lib/adminGuard.js";
import type * as lib_aiConfig from "../lib/aiConfig.js";
import type * as lib_ajusteDeAcervo from "../lib/ajusteDeAcervo.js";
import type * as lib_ambiente from "../lib/ambiente.js";
import type * as lib_asaasEvents from "../lib/asaasEvents.js";
import type * as lib_assemblyStatus from "../lib/assemblyStatus.js";
import type * as lib_assistente_agentes from "../lib/assistente/agentes.js";
import type * as lib_assistente_briefing from "../lib/assistente/briefing.js";
import type * as lib_assistente_plano from "../lib/assistente/plano.js";
import type * as lib_assistente_redacao from "../lib/assistente/redacao.js";
import type * as lib_assistente_roteamento from "../lib/assistente/roteamento.js";
import type * as lib_assistente_semaforo from "../lib/assistente/semaforo.js";
import type * as lib_attention from "../lib/attention.js";
import type * as lib_authAccount from "../lib/authAccount.js";
import type * as lib_campanha from "../lib/campanha.js";
import type * as lib_cascade from "../lib/cascade.js";
import type * as lib_central_autonomia from "../lib/central/autonomia.js";
import type * as lib_central_busca from "../lib/central/busca.js";
import type * as lib_central_prazos from "../lib/central/prazos.js";
import type * as lib_central_telefone from "../lib/central/telefone.js";
import type * as lib_central_triagem from "../lib/central/triagem.js";
import type * as lib_central_validadores from "../lib/central/validadores.js";
import type * as lib_central_vertical from "../lib/central/vertical.js";
import type * as lib_channels_registro from "../lib/channels/registro.js";
import type * as lib_channels_situacao from "../lib/channels/situacao.js";
import type * as lib_channels_tipos from "../lib/channels/tipos.js";
import type * as lib_channels_whatsapp from "../lib/channels/whatsapp.js";
import type * as lib_contatoDaCampanha from "../lib/contatoDaCampanha.js";
import type * as lib_convidados from "../lib/convidados.js";
import type * as lib_custoDoEvento from "../lib/custoDoEvento.js";
import type * as lib_dataDeEvento from "../lib/dataDeEvento.js";
import type * as lib_dataDoDia from "../lib/dataDoDia.js";
import type * as lib_demoData from "../lib/demoData.js";
import type * as lib_demoGuard from "../lib/demoGuard.js";
import type * as lib_dinheiro from "../lib/dinheiro.js";
import type * as lib_dinheiroVencido from "../lib/dinheiroVencido.js";
import type * as lib_duplicidade from "../lib/duplicidade.js";
import type * as lib_escolhaDeAssinatura from "../lib/escolhaDeAssinatura.js";
import type * as lib_escopoDecoradora from "../lib/escopoDecoradora.js";
import type * as lib_escopoDoProjeto from "../lib/escopoDoProjeto.js";
import type * as lib_escritorio_briefingComercial from "../lib/escritorio/briefingComercial.js";
import type * as lib_escritorio_panorama from "../lib/escritorio/panorama.js";
import type * as lib_eventSummary from "../lib/eventSummary.js";
import type * as lib_fichaTecnica from "../lib/fichaTecnica.js";
import type * as lib_financeScope from "../lib/financeScope.js";
import type * as lib_fornecedorDoEvento from "../lib/fornecedorDoEvento.js";
import type * as lib_fotoDoItem from "../lib/fotoDoItem.js";
import type * as lib_identity from "../lib/identity.js";
import type * as lib_imageProvider from "../lib/imageProvider.js";
import type * as lib_imageProviderConfig from "../lib/imageProviderConfig.js";
import type * as lib_importacaoDeLeads from "../lib/importacaoDeLeads.js";
import type * as lib_leadFollowUp from "../lib/leadFollowUp.js";
import type * as lib_limparCampos from "../lib/limparCampos.js";
import type * as lib_materiais from "../lib/materiais.js";
import type * as lib_materiaisDoProjeto from "../lib/materiaisDoProjeto.js";
import type * as lib_mensagensDaCampanha from "../lib/mensagensDaCampanha.js";
import type * as lib_numeroGravavel from "../lib/numeroGravavel.js";
import type * as lib_officeBridgeAuth from "../lib/officeBridgeAuth.js";
import type * as lib_panoramaDeCompras from "../lib/panoramaDeCompras.js";
import type * as lib_plantaPrompt from "../lib/plantaPrompt.js";
import type * as lib_platformGuard from "../lib/platformGuard.js";
import type * as lib_presence from "../lib/presence.js";
import type * as lib_projectScope from "../lib/projectScope.js";
import type * as lib_prontidaoDaConta from "../lib/prontidaoDaConta.js";
import type * as lib_prontidaoDoEvento from "../lib/prontidaoDoEvento.js";
import type * as lib_propostaComercial from "../lib/propostaComercial.js";
import type * as lib_proximaAcao from "../lib/proximaAcao.js";
import type * as lib_purchaseStatus from "../lib/purchaseStatus.js";
import type * as lib_responsavel from "../lib/responsavel.js";
import type * as lib_respostaDoInteressado from "../lib/respostaDoInteressado.js";
import type * as lib_saudeDoEvento from "../lib/saudeDoEvento.js";
import type * as lib_supplierIdentity from "../lib/supplierIdentity.js";
import type * as lib_tiposDeDocumento from "../lib/tiposDeDocumento.js";
import type * as lib_tiposDeEvento from "../lib/tiposDeEvento.js";
import type * as lib_trialAlerts from "../lib/trialAlerts.js";
import type * as lib_ultimaAtualizacao from "../lib/ultimaAtualizacao.js";
import type * as materials from "../materials.js";
import type * as mensageria from "../mensageria.js";
import type * as notifications from "../notifications.js";
import type * as officeBridgeHttp from "../officeBridgeHttp.js";
import type * as officeCentralHttp from "../officeCentralHttp.js";
import type * as onboarding from "../onboarding.js";
import type * as orcamento from "../orcamento.js";
import type * as propostas from "../propostas.js";
import type * as purchases from "../purchases.js";
import type * as supplierCatalog from "../supplierCatalog.js";
import type * as suppliers from "../suppliers.js";
import type * as team from "../team.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  acervo: typeof acervo;
  admin: typeof admin;
  adminApprovals: typeof adminApprovals;
  adminWorkItems: typeof adminWorkItems;
  agenda: typeof agenda;
  ai: typeof ai;
  aiVisual: typeof aiVisual;
  asaas: typeof asaas;
  asaasWebhook: typeof asaasWebhook;
  asaasWebhookLog: typeof asaasWebhookLog;
  assemblyItems: typeof assemblyItems;
  assistente: typeof assistente;
  assistenteBriefing: typeof assistenteBriefing;
  assistenteExecutor: typeof assistenteExecutor;
  auth: typeof auth;
  briefing: typeof briefing;
  campanhaRascunhos: typeof campanhaRascunhos;
  comercialBriefing: typeof comercialBriefing;
  communications: typeof communications;
  communicationsGateway: typeof communicationsGateway;
  communicationsIa: typeof communicationsIa;
  communicationsOutbox: typeof communicationsOutbox;
  communicationsTriage: typeof communicationsTriage;
  compositions: typeof compositions;
  contracts: typeof contracts;
  crons: typeof crons;
  customerVoice: typeof customerVoice;
  dashboard: typeof dashboard;
  demo: typeof demo;
  demoAuth: typeof demoAuth;
  email: typeof email;
  escritorio: typeof escritorio;
  events: typeof events;
  fichaTecnica: typeof fichaTecnica;
  financeiro: typeof financeiro;
  funil: typeof funil;
  gallery: typeof gallery;
  health: typeof health;
  http: typeof http;
  landingLeads: typeof landingLeads;
  layoutRenders: typeof layoutRenders;
  leadDocuments: typeof leadDocuments;
  "lib/access": typeof lib_access;
  "lib/accessGuard": typeof lib_accessGuard;
  "lib/acervo": typeof lib_acervo;
  "lib/adminGuard": typeof lib_adminGuard;
  "lib/aiConfig": typeof lib_aiConfig;
  "lib/ajusteDeAcervo": typeof lib_ajusteDeAcervo;
  "lib/ambiente": typeof lib_ambiente;
  "lib/asaasEvents": typeof lib_asaasEvents;
  "lib/assemblyStatus": typeof lib_assemblyStatus;
  "lib/assistente/agentes": typeof lib_assistente_agentes;
  "lib/assistente/briefing": typeof lib_assistente_briefing;
  "lib/assistente/plano": typeof lib_assistente_plano;
  "lib/assistente/redacao": typeof lib_assistente_redacao;
  "lib/assistente/roteamento": typeof lib_assistente_roteamento;
  "lib/assistente/semaforo": typeof lib_assistente_semaforo;
  "lib/attention": typeof lib_attention;
  "lib/authAccount": typeof lib_authAccount;
  "lib/campanha": typeof lib_campanha;
  "lib/cascade": typeof lib_cascade;
  "lib/central/autonomia": typeof lib_central_autonomia;
  "lib/central/busca": typeof lib_central_busca;
  "lib/central/prazos": typeof lib_central_prazos;
  "lib/central/telefone": typeof lib_central_telefone;
  "lib/central/triagem": typeof lib_central_triagem;
  "lib/central/validadores": typeof lib_central_validadores;
  "lib/central/vertical": typeof lib_central_vertical;
  "lib/channels/registro": typeof lib_channels_registro;
  "lib/channels/situacao": typeof lib_channels_situacao;
  "lib/channels/tipos": typeof lib_channels_tipos;
  "lib/channels/whatsapp": typeof lib_channels_whatsapp;
  "lib/contatoDaCampanha": typeof lib_contatoDaCampanha;
  "lib/convidados": typeof lib_convidados;
  "lib/custoDoEvento": typeof lib_custoDoEvento;
  "lib/dataDeEvento": typeof lib_dataDeEvento;
  "lib/dataDoDia": typeof lib_dataDoDia;
  "lib/demoData": typeof lib_demoData;
  "lib/demoGuard": typeof lib_demoGuard;
  "lib/dinheiro": typeof lib_dinheiro;
  "lib/dinheiroVencido": typeof lib_dinheiroVencido;
  "lib/duplicidade": typeof lib_duplicidade;
  "lib/escolhaDeAssinatura": typeof lib_escolhaDeAssinatura;
  "lib/escopoDecoradora": typeof lib_escopoDecoradora;
  "lib/escopoDoProjeto": typeof lib_escopoDoProjeto;
  "lib/escritorio/briefingComercial": typeof lib_escritorio_briefingComercial;
  "lib/escritorio/panorama": typeof lib_escritorio_panorama;
  "lib/eventSummary": typeof lib_eventSummary;
  "lib/fichaTecnica": typeof lib_fichaTecnica;
  "lib/financeScope": typeof lib_financeScope;
  "lib/fornecedorDoEvento": typeof lib_fornecedorDoEvento;
  "lib/fotoDoItem": typeof lib_fotoDoItem;
  "lib/identity": typeof lib_identity;
  "lib/imageProvider": typeof lib_imageProvider;
  "lib/imageProviderConfig": typeof lib_imageProviderConfig;
  "lib/importacaoDeLeads": typeof lib_importacaoDeLeads;
  "lib/leadFollowUp": typeof lib_leadFollowUp;
  "lib/limparCampos": typeof lib_limparCampos;
  "lib/materiais": typeof lib_materiais;
  "lib/materiaisDoProjeto": typeof lib_materiaisDoProjeto;
  "lib/mensagensDaCampanha": typeof lib_mensagensDaCampanha;
  "lib/numeroGravavel": typeof lib_numeroGravavel;
  "lib/officeBridgeAuth": typeof lib_officeBridgeAuth;
  "lib/panoramaDeCompras": typeof lib_panoramaDeCompras;
  "lib/plantaPrompt": typeof lib_plantaPrompt;
  "lib/platformGuard": typeof lib_platformGuard;
  "lib/presence": typeof lib_presence;
  "lib/projectScope": typeof lib_projectScope;
  "lib/prontidaoDaConta": typeof lib_prontidaoDaConta;
  "lib/prontidaoDoEvento": typeof lib_prontidaoDoEvento;
  "lib/propostaComercial": typeof lib_propostaComercial;
  "lib/proximaAcao": typeof lib_proximaAcao;
  "lib/purchaseStatus": typeof lib_purchaseStatus;
  "lib/responsavel": typeof lib_responsavel;
  "lib/respostaDoInteressado": typeof lib_respostaDoInteressado;
  "lib/saudeDoEvento": typeof lib_saudeDoEvento;
  "lib/supplierIdentity": typeof lib_supplierIdentity;
  "lib/tiposDeDocumento": typeof lib_tiposDeDocumento;
  "lib/tiposDeEvento": typeof lib_tiposDeEvento;
  "lib/trialAlerts": typeof lib_trialAlerts;
  "lib/ultimaAtualizacao": typeof lib_ultimaAtualizacao;
  materials: typeof materials;
  mensageria: typeof mensageria;
  notifications: typeof notifications;
  officeBridgeHttp: typeof officeBridgeHttp;
  officeCentralHttp: typeof officeCentralHttp;
  onboarding: typeof onboarding;
  orcamento: typeof orcamento;
  propostas: typeof propostas;
  purchases: typeof purchases;
  supplierCatalog: typeof supplierCatalog;
  suppliers: typeof suppliers;
  team: typeof team;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
};
